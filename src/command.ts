import { sendMessage } from "./message";
import * as fs from "fs";
import { room, PlayerAugmented, version, toAug, db, setAdminGameStop, getTeamRotationInProgress } from "../index";
import { addToGame, handlePlayerLeaveOrAFK } from "./chooser";
import { adminPass } from "../index";
import { teamSize } from "./settings";
import config from "../config";
import { setAfkSystemEnabled, isAfkSystemEnabled, forceCleanupAFK } from "./afk";
import { addBan, removeBan, getBan, getAllBans, clearAllBans as clearBansInDb, addMute, removeMute, getMute, getAllMutes, cleanExpiredMutes, searchPlayerByName, searchPlayersByName } from "./db";
import { setOffsideEnabled, getOffsideEnabled, setSlowModeEnabled, getSlowModeEnabled, slowModeSettings, setDuplicateBlockingEnabled, getDuplicateBlockingEnabled } from "./settings";
import { handlePlayerLeave, forceEndSelection, isSelectionActive, startSelection, shouldTriggerSelection, checkAndAutoBalance } from "./teamChooser";
import { teamMutex, safeSetPlayerTeam } from "./teamMutex";

// Command execution state to prevent race conditions
interface CommandState {
  executingCommands: Set<string>;
  commandCooldowns: Map<number, number>;
  lastCommandTime: Map<number, number>;
  cleanupTimeouts: Map<string, NodeJS.Timeout>; // Track cleanup timeouts
}

const commandState: CommandState = {
  executingCommands: new Set(),
  commandCooldowns: new Map(),
  lastCommandTime: new Map(),
  cleanupTimeouts: new Map()
};

const COMMAND_COOLDOWN = 1000; // 1 second between commands per player
const ADMIN_COMMAND_COOLDOWN = 500; // 0.5 seconds for admin commands
const COMMAND_MEMORY_CLEANUP_INTERVAL = 300000; // 5 minutes
const MAX_COMMAND_STATE_SIZE = 1000; // Max entries before forced cleanup

// Enhanced command validation and rate limiting with memory management
const validateCommand = (player: PlayerAugmented, command: string): boolean => {
  const now = Date.now();
  const playerId = player.id;
  
  // Check cooldown
  const lastTime = commandState.lastCommandTime.get(playerId) || 0;
  const isAdmin = room.getPlayer(player.id)?.admin || false;
  const cooldown = isAdmin ? ADMIN_COMMAND_COOLDOWN : COMMAND_COOLDOWN;
  
  if (now - lastTime < cooldown) {
    sendMessage(`⏱️ Çok hızlı komut giriyorsunuz. ${Math.ceil((cooldown - (now - lastTime)) / 1000)} saniye bekleyin.`, player);
    return false;
  }
  
  // Update last command time
  commandState.lastCommandTime.set(playerId, now);
  
  // Check for concurrent command execution
  const commandKey = `${playerId}-${command}`;
  if (commandState.executingCommands.has(commandKey)) {
    sendMessage("⚠️ Bu komut zaten işleniyor.", player);
    return false;
  }
  
  commandState.executingCommands.add(commandKey);
  
  // Clear any existing cleanup timeout for this command
  const existingTimeout = commandState.cleanupTimeouts.get(commandKey);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    commandState.cleanupTimeouts.delete(commandKey);
  }
  
  // Auto cleanup after 10 seconds (in case of error)
  const timeoutId = setTimeout(() => {
    commandState.executingCommands.delete(commandKey);
    commandState.cleanupTimeouts.delete(commandKey);
  }, 10000);
  
  commandState.cleanupTimeouts.set(commandKey, timeoutId);
  
  return true;
};

const finishCommand = (player: PlayerAugmented, command: string): void => {
  const commandKey = `${player.id}-${command}`;
  
  // Clear the executing command
  commandState.executingCommands.delete(commandKey);
  
  // Clear and remove the cleanup timeout since command completed normally
  const timeoutId = commandState.cleanupTimeouts.get(commandKey);
  if (timeoutId) {
    clearTimeout(timeoutId);
    commandState.cleanupTimeouts.delete(commandKey);
  }
};

// Cleanup function for memory leak prevention
const cleanupCommandState = (): void => {
  try {
    const now = Date.now();
    const currentPlayers = new Set(room.getPlayerList().map(p => p.id));
    let cleanedCount = 0;
    
    // Clean up lastCommandTime for players who left (older than 10 minutes)
    for (const [playerId, lastTime] of commandState.lastCommandTime.entries()) {
      if (!currentPlayers.has(playerId) && (now - lastTime > 600000)) { // 10 minutes
        commandState.lastCommandTime.delete(playerId);
        commandState.commandCooldowns.delete(playerId);
        cleanedCount++;
      }
    }
    
    // Force cleanup if maps are getting too large
    if (commandState.lastCommandTime.size > MAX_COMMAND_STATE_SIZE) {
      console.warn(`[COMMAND] Command state too large (${commandState.lastCommandTime.size}), forcing cleanup`);
      
      // Keep only the most recent 500 entries
      const entries = Array.from(commandState.lastCommandTime.entries())
        .sort((a, b) => b[1] - a[1]) // Sort by timestamp descending
        .slice(0, 500);
      
      commandState.lastCommandTime.clear();
      commandState.commandCooldowns.clear();
      
      for (const [playerId, timestamp] of entries) {
        commandState.lastCommandTime.set(playerId, timestamp);
      }
      
      cleanedCount += MAX_COMMAND_STATE_SIZE - 500;
    }
    
    if (cleanedCount > 0) {
      console.log(`[COMMAND] Cleaned up ${cleanedCount} stale command state entries`);
    }
    
    // Log current state size for monitoring
    console.log(`[COMMAND] Current state sizes - Commands: ${commandState.executingCommands.size}, Times: ${commandState.lastCommandTime.size}, Timeouts: ${commandState.cleanupTimeouts.size}`);
    
  } catch (error) {
    console.error(`[COMMAND] Error in command state cleanup: ${error}`);
  }
};

// Regular cleanup interval to prevent memory leaks
setInterval(cleanupCommandState, COMMAND_MEMORY_CLEANUP_INTERVAL);

// Force cleanup on player leave
export const cleanupPlayerCommands = (playerId: number): void => {
  try {
    // Remove all command state for this player
    commandState.lastCommandTime.delete(playerId);
    commandState.commandCooldowns.delete(playerId);
    
    // Clean up any executing commands for this player
    const playerCommands = Array.from(commandState.executingCommands)
      .filter(cmd => cmd.startsWith(`${playerId}-`));
    
    for (const cmd of playerCommands) {
      commandState.executingCommands.delete(cmd);
      
      // Clear associated timeout
      const timeoutId = commandState.cleanupTimeouts.get(cmd);
      if (timeoutId) {
        clearTimeout(timeoutId);
        commandState.cleanupTimeouts.delete(cmd);
      }
    }
    
    console.log(`[COMMAND] Cleaned up command state for player ${playerId}`);
  } catch (error) {
    console.error(`[COMMAND] Error cleaning up player commands: ${error}`);
  }
};

// Enhanced admin commands with mutex protection
const handleMoveCommand = async (player: PlayerAugmented, targetName: string, targetTeam: number): Promise<void> => {
  if (!room.getPlayer(player.id)?.admin) {
    sendMessage("❌ Bu komutu kullanma yetkiniz yok.", player);
    return;
  }
  
  // Don't move during team rotation
  if (getTeamRotationInProgress()) {
    sendMessage("❌ Takım rotasyonu sırasında oyuncu taşınamaz.", player);
    return;
  }
  
  try {
    const target = room.getPlayerList().find(p => 
      p.name.toLowerCase().includes(targetName.toLowerCase())
    );
    
    if (!target) {
      sendMessage(`❌ "${targetName}" isimli oyuncu bulunamadı.`, player);
      return;
    }
    
    if (target.team === targetTeam) {
      sendMessage(`❌ ${target.name} zaten o takımda.`, player);
      return;
    }
    
    const teamNames = ["İzleyici", "Kırmızı", "Mavi"];
    const teamName = teamNames[targetTeam] || "Bilinmeyen";
    
    const success = await safeSetPlayerTeam(target.id, targetTeam, `admin-move-by-${player.name}`);
    
    if (success) {
      sendMessage(`✅ ${target.name} ${teamName} takımına taşındı.`, player);
      sendMessage(`🔄 ${player.name} (Admin) tarafından ${teamName} takımına taşındınız.`, toAug(target));
    } else {
      sendMessage(`❌ ${target.name} taşınamadı. Tekrar deneyin.`, player);
    }
    
  } catch (error) {
    console.error(`[COMMAND] Error in move command: ${error}`);
    sendMessage("❌ Oyuncu taşınırken hata oluştu.", player);
  }
};

// Safe restart command  
const handleRestartCommand = async (player: PlayerAugmented): Promise<void> => {
  if (!room.getPlayer(player.id)?.admin) {
    sendMessage("❌ Bu komutu kullanma yetkiniz yok.", player);
    return;
  }
  
  try {
    console.log(`[COMMAND] Admin restart requested by ${player.name}`);
    
    // Set admin game stop flag to prevent draw message
    setAdminGameStop(true);
    
    // Stop the game cleanly
    if (room.getScores() !== null) {
      room.stopGame();
    }
    
    // Restart after a short delay
    setTimeout(() => {
      sendMessage("🚀 Yeni maç başlatılıyor...");
      room.startGame();
    }, 1000);
    
  } catch (error) {
    console.error(`[COMMAND] Error in restart command: ${error}`);
    sendMessage("❌ Restart işleminde hata oluştu.", player);
  }
};

export const isCommand = (msg: string) => {
  const trimmed = msg.trim();
  return trimmed.startsWith("!") || trimmed.toLowerCase().startsWith("t ");
};

export const handleCommand = async (p: PlayerAugmented, msg: string): Promise<void> => {
  const trimmed = msg.trim();
  
  // Team selection is now handled in the main chat handler (index.ts)
  
  // Handle special case for "t {mesaj}" without !
  if (trimmed.toLowerCase().startsWith("t ") && !trimmed.startsWith("!")) {
    const teamMessage = trimmed.slice(2); // Remove "t " prefix
    if (teamMessage.length > 0) {
      teamChat(p, [teamMessage]);
    } else {
      sendMessage("Kullanım: t {mesaj}", p);
    }
    return;
  }
  
  // Handle normal commands with !
  let commandText = trimmed.slice(1);
  let commandName = commandText.split(" ")[0];
  let commandArgs = commandText.split(" ").slice(1);
  
  // Validate command execution
  if (!validateCommand(p, commandName)) {
    return;
  }

  try {
    // Enhanced command handling with proper cleanup
    if (commands[commandName]) {
      await commands[commandName](p, commandArgs);
    } else {
      sendMessage("Komut bulunamadı.", p);
    }
  } catch (error) {
    console.error(`[COMMAND] Error executing command ${commandName}: ${error}`);
    sendMessage("❌ Komut işlenirken hata oluştu.", p);
  } finally {
    finishCommand(p, commandName);
  }
};

type commandFunc = (p: PlayerAugmented, args: Array<string>) => void | Promise<void>;

// Global mute state (excluding admins)
let globalMute = false;



const commands: { [key: string]: commandFunc } = {
  afk: (p) => toggleAfk(p),
  discord: (p) => showDiscord(p),
  dc: (p) => showDiscord(p),
  bb: (p) => bb(p),
  help: (p) => showHelp(p),
  admin: (p, args) => adminLogin(p, args),

  rs: async (p) => await handleRestartCommand(p),
  red: async (p, args) => {
    if (args.length === 0) {
      sendMessage("Kullanım: !red {oyuncu_ismi}", p);
      return;
    }
    await handleMoveCommand(p, args.join(" "), 1);
  },
  blue: async (p, args) => {
    if (args.length === 0) {
      sendMessage("Kullanım: !blue {oyuncu_ismi}", p);
      return;
    }
    await handleMoveCommand(p, args.join(" "), 2);
  },
  spec: async (p, args) => {
    if (args.length === 0) {
      sendMessage("Kullanım: !spec {oyuncu_ismi}", p);
      return;
    }
    await handleMoveCommand(p, args.join(" "), 0);
  },
  script: (p) => script(p),
  version: (p) => showVersion(p),
  afksistem: (p, args) => handleAfkSystem(p, args),
  
  // Admin chat command
  a: (p, args) => adminChat(p, args),
  
  // Team chat command
  t: (p, args) => teamChat(p, args),
  
  // Mute commands
  mute: (p, args) => mutePlayer(p, args),
  m: (p, args) => mutePlayer(p, args),
  unmute: (p, args) => unmutePlayer(p, args),
  muteliler: (p) => showMutedPlayers(p),
  
  // Ban commands
  ban: (p, args) => banPlayer(p, args),
  b: (p, args) => banPlayer(p, args),
  banlılar: (p) => showBannedPlayers(p),
  bankaldır: (p, args) => unbanPlayer(p, args),
  clearbans: (p) => clearAllBans(p),
  
  // Global mute commands
  susun: (p) => enableGlobalMute(p),
  konuşun: (p) => disableGlobalMute(p),
  
  // Kick command
  kick: (p, args) => kickPlayer(p, args),
  k: (p, args) => kickPlayer(p, args),
  
  // Offside system commands
  ofsayt: (p, args) => handleOffsideCommand(p, args),
  
  // VIP commands
  vipekle: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  vipsil: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  vipler: (p) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  vipkontrol: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  
  // Auth viewing command
  auth: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    showPlayerAuth(p, args);
  },
  
  // VIP color command
  viprenk: (p, args) => {
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  
  // VIP style command
  vipstil: (p, args) => {
    sendMessage("❌ VIP sistem geçici olarak devre dışı.", p);
  },
  
  // Slow mode commands
  yavaşmod: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    handleSlowModeCommand(p, args);
  },
  slowmode: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    handleSlowModeCommand(p, args);
  },
  
  // Duplicate connection blocking system
  yansekme: (p, args) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    handleDuplicateBlocking(p, args);
  },
  
  // Streak records command
  rekorseri: (p) => {
    showStreakRecords(p);
  },
  
  // FF (Forfeit) command
  ff: (p) => {
    handleFF(p);
  },
  
  // Vote ban commands (temporarily disabled)
  oyla: (p, args) => sendMessage("❌ Oylama sistemi geçici olarak devre dışı.", p),
  vote: (p, args) => sendMessage("❌ Voting system temporarily disabled.", p),
  
  // Level/Stats commands
  seviye: (p, args) => showLevel(p, args),
  level: (p, args) => showLevel(p, args),
  lvl: (p, args) => showLevel(p, args),
  
  // Team selection commands
  seçimiptal: (p) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    if (isSelectionActive()) {
      forceEndSelection();
      sendMessage("Oyuncu seçimi iptal edildi.", p);
    } else {
      sendMessage("Şu anda aktif bir oyuncu seçimi yok.", p);
    }
  },
  
  // Auto-balance command
  dengele: (p) => {
    if (!room.getPlayer(p.id).admin) {
      sendMessage("Bu komutu sadece adminler kullanabilir.", p);
      return;
    }
    const balanced = checkAndAutoBalance();
    if (balanced) {
      sendMessage("⚖️ Takımlar otomatik olarak dengelendi!", p);
    } else {
      sendMessage("ℹ️ Takımlar zaten dengeli veya otomatik dengeleme gerekli değil.", p);
    }
  },
};

const adminLogin = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Kullanım: !admin admin_şifreniz", p);
    return;
  }

  if (args[0] === adminPass || args[0].toLowerCase() === "prof") {
    room.setPlayerAdmin(p.id, true);
    sendMessage("Giriş başarılı.", p);
  } else {
    sendMessage("Yanlış şifre.", p);
  }
};

const adminChat = (p: PlayerAugmented, args: string[]) => {
  // Check if player is admin
  const isAdmin = room.getPlayer(p.id).admin;
  if (!isAdmin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }

  if (args.length < 1) {
    sendMessage("Kullanım: !a {mesaj}", p);
    return;
  }

  // Join all arguments to form the message
  const adminMessage = args.join(" ");
  
  // Send yellow admin message only to admin players
  room.getPlayerList().forEach(player => {
    if (room.getPlayer(player.id).admin) {
      room.sendAnnouncement(`[ADMIN] ${p.name}: ${adminMessage}`, player.id, 0xFFFF00, "normal", 1);
    }
  });
};

const teamChat = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Kullanım: !t {mesaj}", p);
    return;
  }

  // Join all arguments to form the message
  const teamMessage = args.join(" ");
  
  // Determine team/spectator info
  let chatName: string;
  let chatColor: number;
  
  if (p.team === 0) {
    // Spectator chat
    chatName = "İzleyici";
    chatColor = 0xC0C0C0; // Silver/gray color for spectators
  } else if (p.team === 1) {
    // Red team chat
    chatName = "Kırmızı";
    chatColor = 0xFF6B6B; // Light red
  } else {
    // Blue team chat
    chatName = "Mavi";
    chatColor = 0x4ECDC4; // Light blue
  }
  
  // Send message to same team/spectator players and admins
  room.getPlayerList().forEach(player => {
    const playerAug = toAug(player);
    const isAdmin = room.getPlayer(player.id).admin;
    const isSameGroup = playerAug.team === p.team;
    
    if (isAdmin || isSameGroup) {
      room.sendAnnouncement(`[${chatName} ${p.team === 0 ? '' : 'Takım'}] ${p.name}: ${teamMessage}`, player.id, chatColor, "normal", 1);
    }
  });
};



// Old rs function replaced with handleRestartCommand

const toggleAfk = async (p: PlayerAugmented) => {
  if (p.afk) {
    // Player is currently AFK, bring them back
    p.afk = false;
    sendMessage("🔄 AFK modundan çıktın. Takım seçimine ekleniyor...", p);
    
    // Check if there's an active selection first
    if (isSelectionActive()) {
      // Just mark as non-AFK, they'll be added to spectators automatically
      room.setPlayerTeam(p.id, 0);
      sendMessage("⏳ Aktif takım seçimi var. Seçim bitince oyuna dahil olacaksın.", p);
    } else {
      // Move to spectators and check if team selection should start
      room.setPlayerTeam(p.id, 0);
      
      // Small delay to ensure team assignment is processed
      setTimeout(() => {
        if (shouldTriggerSelection()) {
          startSelection();
          sendMessage("🎯 Takım seçimi başladı! Seçilmeyi bekle.", p);
        } else {
          // If no team selection triggered, try to add to game normally
          addToGame(room, room.getPlayer(p.id));
        }
      }, 100);
    }
  } else {
    // Player is not AFK, put them in AFK mode
    const wasInTeam = p.team !== 0;
    p.afk = true;
    room.setPlayerTeam(p.id, 0);
    sendMessage("😴 AFK moduna geçtin. Tekrar !afk yazarak geri dönebilirsin.", p);
    
    if (wasInTeam) {
      sendMessage("👥 Takımdan ayrıldın ve izleyiciye geçtin.", p);
      // Handle player leaving team for auto-balancing
      await handlePlayerLeaveOrAFK(p);
    }
  }
};

const showHelp = (p: PlayerAugmented) => {
  const isAdmin = room.getPlayer(p.id).admin;
  
  if (isAdmin) {
    sendMessage(
      `${config.roomName} - Yönetici Komutları: !admin, !rs, !afksistem (aç/kapat), !mute, !unmute, !muteliler, !ban, !bankaldır, !banlılar, !clearbans, !susun, !konuşun, !kick, !ofsayt (aç/kapat), !yavaşmod (aç/kapat), !yansekme (aç/kapat), !seçimiptal, !dengele`,
      p,
    );
    sendMessage(
      `Ban Kullanımı: !ban <ID_veya_İsim> [sebep] (Çevrimiçi ve çevrimdışı oyuncular için)`,
      p,
    );
    sendMessage(
      `VIP Komutları: !vipekle, !vipsil, !vipler, !vipkontrol`,
      p,
    );
    sendMessage(
      `Bilgi Komutları: !auth <oyuncu>`,
      p,
    );
    sendMessage(
      `Genel Komutlar: !afk (toggle), !discord, !bb, !help, !version, !script, !seviye (!level, !lvl)`,
      p,
    );
  } else {
    sendMessage(
      `${config.roomName} - Komutlar: !afk (toggle), !discord (!dc), !bb, !help, !version, !script, !rekorseri, !ff, !oyla (!vote)`,
      p,
    );
    sendMessage(
      `📊 Seviye Komutları: !seviye (!level, !lvl) - Seviye ve deneyim bilgilerinizi görün`,
      p,
    );
    sendMessage(
      `😴 AFK Sistemi: !afk - İlk kullanımda AFK moduna geçer (izleyiciye), ikinci kullanımda geri döner (takım seçimine)`,
      p,
    );
    sendMessage(
      `🗳️ Oylama: !oyla <ID> (5 oy ile 24 saat ban, VIP oyları 2 sayılır, 5dk+ oyunda bulunma gerekli)`,
      p,
    );
    
    // Show VIP commands if player is VIP (temporarily disabled)
    // if (isPlayerVip(p.auth)) {
    //   sendMessage(
    //     `🌟 VIP Komutları: !viprenk <renk>, !vipstil <stil>`,
    //     p,
    //   );
    //   sendMessage(
    //     `🎨 Renkler: sarı, kırmızı, mavi, yeşil, pembe, mor`,
    //     p,
    //   );
    //   sendMessage(
    //     `✨ Stiller: bold, italic, küçük, normal`,
    //     p,
    //   );
    // }
  }
};

const showDiscord = (p: PlayerAugmented) => {
  sendMessage("Discord: discord.gg/profstriker");
};

const showPlayerAuth = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    sendMessage("Kullanım: !auth <oyuncu_adı> veya !auth <id>", p);
    sendMessage("Örnek: !auth TestPlayer veya !auth 5", p);
    return;
  }

  const searchTerm = args[0];
  const players = room.getPlayerList();
  let targetPlayer: PlayerObject | null = null;

  // Try to find player by ID first
  const playerId = parseInt(searchTerm);
  if (!isNaN(playerId)) {
    targetPlayer = players.find(player => player.id === playerId) || null;
  }

  // If not found by ID, try to find by name (partial match)
  if (!targetPlayer) {
    targetPlayer = players.find(player => 
      player.name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || null;
  }

  if (!targetPlayer) {
    sendMessage(`❌ "${searchTerm}" isimli/ID'li oyuncu bulunamadı.`, p);
    return;
  }

  // Extract real username without [#ID] format
  const extractRealUsername = (formattedName: string): string => {
    const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
    return match ? match[1] : formattedName;
  };

  const realName = extractRealUsername(targetPlayer.name);
  
  sendMessage(`🔑 Oyuncu Bilgileri:`, p);
  sendMessage(`👤 İsim: ${realName}`, p);
  sendMessage(`🆔 ID: ${targetPlayer.id}`, p);
  sendMessage(`🔐 Auth: ${targetPlayer.auth}`, p);
  sendMessage(`👥 Takım: ${targetPlayer.team === 0 ? "Izleyici" : targetPlayer.team === 1 ? "Kırmızı" : "Mavi"}`, p);
};

const bb = (p: PlayerAugmented) => {
  room.kickPlayer(
    p.id,
    "Hoşçakal!\nDiscord sunucumuza katıl:\ndiscord.gg/profstriker",
    false,
  );
};

const script = (p: PlayerAugmented) => {
  sendMessage("Bu sistem açık kaynaklıdır.", p);
};

const showVersion = (p: PlayerAugmented) => {
  sendMessage(`Sürüm: v${version}`);
};

// AFK System Commands
const handleAfkSystem = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage(
      "❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.",
      p,
    );
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !afksistem aç veya !afksistem kapat", p);
    return;
  }
  
  const action = args[0].toLowerCase();
  if (action === "kapat") {
    if (!isAfkSystemEnabled()) {
      sendMessage("AFK sistemi zaten kapalı.", p);
      return;
    }
    setAfkSystemEnabled(false);
    sendMessage(`${p.name} AFK sistemini kapattı. Artık AFK kontrolü yapılmayacak.`);
  } else if (action === "aç") {
    if (isAfkSystemEnabled()) {
      sendMessage("AFK sistemi zaten açık.", p);
      return;
    }
    setAfkSystemEnabled(true);
    sendMessage(`${p.name} AFK sistemini açtı. Artık AFK kontrolü yapılacak.`);
  } else {
    sendMessage("Kullanım: !afksistem aç veya !afksistem kapat", p);
  }
};

const handleDuplicateBlocking = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage(
      "❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.",
      p,
    );
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !yansekme aç veya !yansekme kapat", p);
    return;
  }
  
  const action = args[0].toLowerCase();
  if (action === "kapat") {
    if (!getDuplicateBlockingEnabled()) {
      sendMessage("Yansekme engelleme sistemi zaten kapalı.", p);
      return;
    }
    setDuplicateBlockingEnabled(false);
    sendMessage(`${p.name} yansekme engelleme sistemini kapattı. Artık aynı hesapla birden fazla giriş yapılabilir.`);
  } else if (action === "aç") {
    if (getDuplicateBlockingEnabled()) {
      sendMessage("Yansekme engelleme sistemi zaten açık.", p);
      return;
    }
    setDuplicateBlockingEnabled(true);
    sendMessage(`${p.name} yansekme engelleme sistemini açtı. Artık aynı hesapla birden fazla giriş engellenecek.`);
  } else {
    sendMessage("Kullanım: !yansekme aç veya !yansekme kapat", p);
  }
};

// Helper functions
const findPlayerById = (id: number): PlayerAugmented | null => {
  const player = room.getPlayer(id);
  if (!player) return null;
  try {
    return toAug(player);
  } catch {
    return null;
  }
};

const parseDuration = (duration: string): number => {
  const num = parseInt(duration);
  if (isNaN(num) || num <= 0) return 0;
  return num * 60 * 1000; // Convert minutes to milliseconds
};

const formatTimeRemaining = (timestamp: number): string => {
  const remaining = timestamp - Date.now();
  if (remaining <= 0) return "0dk";
  const minutes = Math.ceil(remaining / (60 * 1000));
  return `${minutes}dk`;
};

// Mute Commands
const mutePlayer = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 2) {
    sendMessage("Kullanım: !mute <süre_dakika> <ID> [sebep]", p);
    return;
  }
  
  const duration = parseDuration(args[0]);
  const targetId = parseInt(args[1]);
  const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";
  
  if (duration === 0) {
    sendMessage("Geçersiz süre. Sadece pozitif sayılar kullanın.", p);
    return;
  }
  
  if (isNaN(targetId)) {
    sendMessage("Geçersiz oyuncu ID'si.", p);
    return;
  }
  
  const targetPlayer = findPlayerById(targetId);
  if (!targetPlayer) {
    sendMessage("Oyuncu bulunamadı.", p);
    return;
  }
  
  if (room.getPlayer(targetPlayer.id).admin) {
    sendMessage("Yöneticileri susturulamaz.", p);
    return;
  }
  
  const muteData = {
    playerId: targetPlayer.id,
    playerName: targetPlayer.name,
    auth: targetPlayer.auth,
    mutedUntil: Date.now() + duration,
    reason: reason,
    mutedBy: p.name
  };
  
  try {
    await addMute(muteData);
    sendMessage(`${targetPlayer.name} ${args[0]} dakika susturuldu. Sebep: ${reason}`, p);
    sendMessage(`${args[0]} dakika susturuldun. Sebep: ${reason}`, targetPlayer);
  } catch (error) {
    sendMessage("Mute işleminde hata oluştu.", p);
    console.error("Mute error:", error);
  }
};

const unmutePlayer = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !unmute <ID>", p);
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    sendMessage("Geçersiz oyuncu ID'si.", p);
    return;
  }
  
  const targetPlayer = findPlayerById(targetId);
  if (!targetPlayer) {
    sendMessage("Oyuncu bulunamadı.", p);
    return;
  }
  
  try {
    const muteData = await getMute(targetPlayer.auth);
    if (!muteData) {
      sendMessage("Bu oyuncu susturulmamış.", p);
      return;
    }
    
    await removeMute(targetPlayer.auth);
    sendMessage(`${targetPlayer.name} susturulması kaldırıldı.`, p);
    sendMessage("Susturulman kaldırıldı.", targetPlayer);
  } catch (error) {
    sendMessage("Unmute işleminde hata oluştu.", p);
    console.error("Unmute error:", error);
  }
};

const showMutedPlayers = async (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  try {
    // Clean expired mutes first
    await cleanExpiredMutes();
    
    const mutes = await getAllMutes();
    
    if (mutes.length === 0) {
      sendMessage("Şu anda susturulmuş oyuncu yok.", p);
      return;
    }
    
    sendMessage("=== SUSTURULMUŞ OYUNCULAR ===", p);
    for (const muteData of mutes) {
      const timeLeft = formatTimeRemaining(muteData.mutedUntil);
      sendMessage(`ID: ${muteData.playerId} | ${muteData.playerName} | Kalan: ${timeLeft} | Sebep: ${muteData.reason}`, p);
    }
  } catch (error) {
    sendMessage("Mute listesi alınırken hata oluştu.", p);
    console.error("Show muted players error:", error);
  }
};

// Ban Commands
const banPlayer = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !ban <ID_veya_İsim> [sebep]", p);
    sendMessage("Örnek: !ban 5 Trolling veya !ban TestPlayer Hakaret", p);
    return;
  }
  
  const target = args[0];
  const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
  
  // First try to find online player by ID
  const targetId = parseInt(target);
  let targetPlayer: PlayerAugmented | null = null;
  let playerData: { auth: string; name: string; id?: number } | null = null;
  
  if (!isNaN(targetId)) {
    // Try to find online player by ID
    targetPlayer = findPlayerById(targetId);
    if (targetPlayer) {
      if (room.getPlayer(targetPlayer.id).admin) {
        sendMessage("Yöneticiler banlanamaz.", p);
        return;
      }
      playerData = {
        auth: targetPlayer.auth,
        name: targetPlayer.name,
        id: targetPlayer.id
      };
    }
  }
  
  // If not found online, try to find by name (either ID was invalid or player is offline)
  if (!playerData) {
    try {
      const dbPlayer = await searchPlayerByName(target);
      if (dbPlayer) {
        // Check if this player is currently online and is an admin
        const onlinePlayer = room.getPlayerList().find(p => p.auth === dbPlayer.auth);
        if (onlinePlayer && room.getPlayer(onlinePlayer.id).admin) {
          sendMessage("Yöneticiler banlanamaz.", p);
          return;
        }
        
        playerData = {
          auth: dbPlayer.auth,
          name: dbPlayer.name,
          id: onlinePlayer?.id || 0 // Use 0 for offline players
        };
      }
    } catch (error) {
      console.error("Database search error:", error);
    }
  }
  
  if (!playerData) {
    sendMessage(`❌ "${target}" isimli/ID'li oyuncu bulunamadı.`, p);
    sendMessage("💡 Çevrimdışı oyuncuları banlamak için tam ismini kullanın.", p);
    return;
  }
  
  // Check if player is already banned
  try {
    const existingBan = await getBan(playerData.auth);
    if (existingBan) {
      sendMessage(`❌ ${playerData.name} zaten banlanmış.`, p);
      return;
    }
  } catch (error) {
    console.error("Ban check error:", error);
  }
  
  const banData = {
    playerId: playerData.id || 0,
    playerName: playerData.name,
    auth: playerData.auth,
    reason: reason,
    bannedBy: p.name
  };
  
  try {
    await addBan(banData);
    
    if (targetPlayer) {
      // Player is online, kick them
      sendMessage(`${playerData.name} kalıcı olarak banlandı. Sebep: ${reason}`, p);
      room.kickPlayer(targetPlayer.id, `${reason} | Talep için discord.gg/profstriker`, false);
    } else {
      // Player is offline
      sendMessage(`${playerData.name} (ÇEVRİMDIŞI) kalıcı olarak banlandı. Sebep: ${reason}`, p);
    }
  } catch (error) {
    sendMessage("Ban işleminde hata oluştu.", p);
    console.error("Ban error:", error);
  }
};

const unbanPlayer = async (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !bankaldır <ID>", p);
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    sendMessage("Geçersiz oyuncu ID'si.", p);
    return;
  }
  
  try {
    // Find ban by player ID
    const bans = await getAllBans();
    const banData = bans.find((ban: any) => ban.playerId === targetId);
    
    if (!banData) {
      sendMessage("Bu ID ile banlanmış oyuncu bulunamadı.", p);
      return;
    }
    
    await removeBan(banData.auth);
    sendMessage(`${banData.playerName} (ID: ${targetId}) banı kaldırıldı.`, p);
  } catch (error) {
    sendMessage("Unban işleminde hata oluştu.", p);
    console.error("Unban error:", error);
  }
};

const showBannedPlayers = async (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  try {
    const bans = await getAllBans();
    
    if (bans.length === 0) {
      sendMessage("Şu anda banlanmış oyuncu yok.", p);
      return;
    }
    
    sendMessage("=== BANLANMIŞ OYUNCULAR ===", p);
    for (const banData of bans) {
      sendMessage(`ID: ${banData.playerId} | ${banData.playerName} | Sebep: ${banData.reason} | Banlantan: ${banData.bannedBy}`, p);
    }
  } catch (error) {
    sendMessage("Ban listesi alınırken hata oluştu.", p);
    console.error("Show banned players error:", error);
  }
};

const clearAllBans = async (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  try {
    const bans = await getAllBans();
    const banCount = bans.length;
    
    await clearBansInDb();
    sendMessage(`Tüm banlar temizlendi. (${banCount} ban kaldırıldı)`, p);
  } catch (error) {
    sendMessage("Ban temizleme işleminde hata oluştu.", p);
    console.error("Clear all bans error:", error);
  }
};

// Global Mute Commands
const enableGlobalMute = (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (globalMute) {
    sendMessage("Global susturma zaten aktif.", p);
    return;
  }
  
  globalMute = true;
  sendMessage(`${p.name} herkesi susturdu. Sadece yöneticiler konuşabilir.`);
};

const disableGlobalMute = (p: PlayerAugmented) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (!globalMute) {
    sendMessage("Global susturma zaten kapalı.", p);
    return;
  }
  
  globalMute = false;
  sendMessage(`${p.name} global susturmayı kaldırdı. Herkes konuşabilir.`);
};

// Offside System Commands
const handleOffsideCommand = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 1) {
    const currentStatus = getOffsideEnabled() ? "açık" : "kapalı";
    sendMessage(`Kullanım: !ofsayt aç veya !ofsayt kapat | Şu anki durum: ${currentStatus}`, p);
    return;
  }
  
  const action = args[0].toLowerCase();
  
  if (action === "aç" || action === "ac") {
    if (getOffsideEnabled()) {
      sendMessage("Ofsayt sistemi zaten açık.", p);
      return;
    }
    setOffsideEnabled(true);
    sendMessage(`${p.name} ofsayt sistemini açtı. ⚽ Ofsayt kuralları aktif!`);
  } else if (action === "kapat") {
    if (!getOffsideEnabled()) {
      sendMessage("Ofsayt sistemi zaten kapalı.", p);
      return;
    }
    setOffsideEnabled(false);
    sendMessage(`${p.name} ofsayt sistemini kapattı. ❌ Ofsayt kuralları devre dışı!`);
  } else {
    const currentStatus = getOffsideEnabled() ? "açık" : "kapalı";
    sendMessage(`Geçersiz parametre. Kullanım: !ofsayt aç veya !ofsayt kapat | Şu anki durum: ${currentStatus}`, p);
  }
};

// Kick Command
const kickPlayer = (p: PlayerAugmented, args: string[]) => {
  if (!room.getPlayer(p.id).admin) {
    sendMessage("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !kick <ID> [sebep]", p);
    return;
  }
  
  const targetId = parseInt(args[0]);
  const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
  
  if (isNaN(targetId)) {
    sendMessage("Geçersiz oyuncu ID'si.", p);
    return;
  }
  
  const targetPlayer = findPlayerById(targetId);
  if (!targetPlayer) {
    sendMessage("Oyuncu bulunamadı.", p);
    return;
  }
  
  if (room.getPlayer(targetPlayer.id).admin) {
    sendMessage("Yöneticiler atılamaz.", p);
    return;
  }
  
  sendMessage(`${targetPlayer.name} odadan atıldı. Sebep: ${reason}`);
  room.kickPlayer(targetPlayer.id, reason, false);
};

// Export functions for use in other modules
export const isPlayerMuted = async (auth: string): Promise<boolean> => {
  try {
    const muteData = await getMute(auth);
    if (!muteData) return false;
    
    if (muteData.mutedUntil <= Date.now()) {
      await removeMute(auth);
      return false;
    }
    
    return true;
  } catch (error) {
    console.error("Error checking mute status:", error);
    return false;
  }
};

export const isPlayerBanned = async (auth: string): Promise<boolean> => {
  try {
    const banData = await getBan(auth);
    return !!banData;
  } catch (error) {
    console.error("Error checking ban status:", error);
    return false;
  }
};

export const isGlobalMuteActive = (): boolean => {
  return globalMute;
};

export const getBanReason = async (auth: string): Promise<string> => {
  try {
    const banData = await getBan(auth);
    return banData ? `${banData.reason} | Talep için discord.gg/profstriker` : "";
  } catch (error) {
    console.error("Error getting ban reason:", error);
    return "";
  }
};

const handleSlowModeCommand = (p: PlayerAugmented, args: string[]) => {
  if (args.length < 1) {
    const status = getSlowModeEnabled() ? "açık" : "kapalı";
    const normalCooldown = Math.ceil(slowModeSettings.normalUsers / 1000);
    const vipCooldown = Math.ceil(slowModeSettings.vipUsers / 1000);
    
    sendMessage(`⏰ Yavaş mod durumu: ${status}`, p);
    sendMessage(`📊 Cooldown süreleri - Normal: ${normalCooldown}s, VIP: ${vipCooldown}s, Admin: 0s`, p);
    sendMessage("Kullanım: !yavaşmod <aç/kapat>", p);
    return;
  }

  const action = args[0].toLowerCase();
  
  if (action === "aç" || action === "ac" || action === "on" || action === "1") {
    if (getSlowModeEnabled()) {
      sendMessage("⏰ Yavaş mod zaten açık!", p);
      return;
    }
    
    setSlowModeEnabled(true);
    sendMessage("⏰ Yavaş mod açıldı!", undefined);
    sendMessage("📊 Normal kullanıcılar 3 saniyede bir, VIP kullanıcılar 1 saniyede bir mesaj atabilir.", undefined);
    sendMessage("👑 Adminler etkilenmez.", undefined);
    
  } else if (action === "kapat" || action === "off" || action === "0") {
    if (!getSlowModeEnabled()) {
      sendMessage("⏰ Yavaş mod zaten kapalı!", p);
      return;
    }
    
    setSlowModeEnabled(false);
    sendMessage("⏰ Yavaş mod kapatıldı!", undefined);
    
    // Clear all existing cooldowns
    import("../index").then(({ players }) => {
      players.forEach(player => {
        player.chatCooldownUntil = 0;
        player.lastChatTime = 0;
      });
    });
    
  } else {
    sendMessage("Kullanım: !yavaşmod <aç/kapat>", p);
  }
};

const handleFF = (p: PlayerAugmented) => {
  // Get game and room from index
  const { game, room } = require("../index");
  
  if (!game) {
    sendMessage("Oyun başlamamış, FF kullanamazsın.", p);
    return;
  }
  
  if (p.team === 0) {
    sendMessage("İzleyiciler FF kullanamaz.", p);
    return;
  }
  
  const teamPlayers = room.getPlayerList().filter((player: any) => player.team === p.team);
  if (teamPlayers.length < 5) {
    sendMessage("FF için takımda en az 5 oyuncu olmalı.", p);
    return;
  }
  
  // Add vote
  const votes = p.team === 1 ? game.ffVotes.red : game.ffVotes.blue;
  
  if (votes.has(p.auth)) {
    sendMessage("Zaten FF için oy verdin.", p);
    return;
  }
  
  votes.add(p.auth);
  
  const teamName = p.team === 1 ? "Kırmızı" : "Mavi";
  const getTeamColor = (teamId: number) => teamId === 1 ? 0xFF4040 : 0x12C4FF;
  const extractRealUsername = (formattedName: string) => {
    const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
    return match ? match[1] : formattedName;
  };
  
  const requiredVotes = Math.min(5, Math.max(1, teamPlayers.length - 1));
  const currentVotes = votes.size;
  
  // Announce vote
  room.sendAnnouncement(
    `⚡ ${extractRealUsername(p.name)} FF için oy verdi! (${currentVotes}/${requiredVotes})`,
    undefined,
    getTeamColor(p.team),
    "normal",
    1
  );
  
  // Check if enough votes
  if (currentVotes >= requiredVotes) {
    // Team forfeits
    const opposingTeam = p.team === 1 ? 2 : 1;
    const opposingTeamName = opposingTeam === 1 ? "Kırmızı" : "Mavi";
    
    room.sendAnnouncement(
      `🏳️ ${teamName} takım pes etti! ${opposingTeamName} takım kazandı!`,
      undefined,
      getTeamColor(opposingTeam),
      "bold",
      2
    );
    
    // Set forfeit flag so onGameStop knows how to handle it
    game.endedByForfeit = {
      hasForfeited: true,
      forfeitingTeam: p.team,
      winningTeam: opposingTeam
    };
    
    // Stop the game
    setTimeout(() => {
      room.stopGame();
    }, 2000);
  }
};

const showStreakRecords = (p: PlayerAugmented) => {
  try {
    // Import the functions from index.ts
    const fs = require('fs');
    const STREAK_RECORDS_FILE = "streak_records.json";
    
    let records;
    try {
      if (fs.existsSync(STREAK_RECORDS_FILE)) {
        const data = fs.readFileSync(STREAK_RECORDS_FILE, 'utf8');
        records = JSON.parse(data);
      } else {
        records = { allTimeRecord: null, top10Records: [] };
      }
    } catch (error) {
      sendMessage("❌ Rekor verileri yüklenemedi.", p);
      return;
    }
    
    sendMessage("🏆 ===== SERI REKORLARI =====", p);
    
    // Show all-time record
    if (records.allTimeRecord) {
      const teamName = records.allTimeRecord.team === 1 ? "Kırmızı" : "Mavi";
      const date = new Date(records.allTimeRecord.achievedAt).toLocaleDateString('tr-TR');
      const playerNames = records.allTimeRecord.players && records.allTimeRecord.players.length > 0
        ? records.allTimeRecord.players.map((player: any) => player.username).filter((name: string) => name).join(", ")
        : "Bilinmiyor";
      
      sendMessage(`🥇 En Yüksek Seri: ${records.allTimeRecord.count} maç (${teamName} Takım)`, p);
      sendMessage(`📅 Tarih: ${date}`, p);
      sendMessage(`👥 Oyuncular: ${playerNames}`, p);
    } else {
      sendMessage("🥇 Henüz hiç rekor kırılmadı!", p);
    }
    
  } catch (error) {
    console.error("Streak records gösterme hatası:", error);
    sendMessage("❌ Rekor verileri gösterilirken hata oluştu.", p);
  }
};

const showLevel = async (p: PlayerAugmented, args: string[]) => {
  try {
    let targetPlayer = p;
    let targetAuth = p.auth;
    
    // If arguments provided, admin can check other players
    if (args.length > 0 && room.getPlayer(p.id).admin) {
      const targetName = args.join(" ");
      const foundPlayer = room.getPlayerList().find(pl => 
        pl.name.toLowerCase().includes(targetName.toLowerCase())
      );
      
      if (foundPlayer) {
        targetPlayer = toAug(foundPlayer);
        targetAuth = foundPlayer.auth;
      } else {
        sendMessage(`❌ "${targetName}" isimli oyuncu bulunamadı.`, p);
        return;
      }
    }
    
    // Get player data from database
    const playerData = await db.get("SELECT experience, level FROM players WHERE auth=?", [targetAuth]);
    
    if (!playerData) {
      sendMessage("❌ Oyuncu verileri bulunamadı.", p);
      return;
    }
    
    const { experience, level } = playerData;
    
    // Calculate XP needed for next level
    const { calculateXpForNextLevel } = await import("./levels");
    const xpForNextLevel = calculateXpForNextLevel(level);
    const currentLevelXp = level > 1 ? calculateXpForNextLevel(level - 1) : 0;
    const progressInCurrentLevel = experience - (level > 1 ? calculateXpForNextLevel(level - 1) : 0);
    
    const progressMessage = `📊 ${targetPlayer.name} - Seviye Bilgileri:
🏆 Seviye: Lvl.${level}
⭐ Deneyim: ${experience} XP
📈 Bu seviye: ${progressInCurrentLevel}/${xpForNextLevel} XP
🎯 Sonraki seviye: ${xpForNextLevel - progressInCurrentLevel} XP kaldı`;
    
    sendMessage(progressMessage, p);
    
  } catch (error) {
    console.error("Level gösterme hatası:", error);
    sendMessage("❌ Seviye bilgileri gösterilirken hata oluştu.", p);
  }
};
