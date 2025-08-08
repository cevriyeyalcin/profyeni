import { room, players, PlayerAugmented, toAug } from "../index";
import { sendMessage } from "./message";

// Team chooser state
interface ChooserState {
  isActive: boolean;
  waitingForRed: boolean;
  waitingForBlue: boolean;
  availableSpectators: PlayerAugmented[];
  selectionTimeout: NodeJS.Timeout | null;
}

let chooserState: ChooserState = {
  isActive: false,
  waitingForRed: false,
  waitingForBlue: false,
  availableSpectators: [],
  selectionTimeout: null
};

// Track which team went first last time for alternating when teams are equal
let lastFirstTeam: 1 | 2 = 2; // Start with blue so red goes first initially

// Selection timeout duration (30 seconds)
const SELECTION_TIMEOUT = 30000;

// Last time waiting message was shown (to prevent spam)
let lastWaitingMessageTime = 0;
const WAITING_MESSAGE_COOLDOWN = 10000; // 10 seconds

// Helper functions
const getRedPlayers = () => room.getPlayerList().filter(p => p.team === 1);
const getBluePlayers = () => room.getPlayerList().filter(p => p.team === 2);
const getSpectators = () => room.getPlayerList().filter(p => p.team === 0 && !toAug(p).afk);

// Get all team members
const getTeamMembers = () => {
  const redPlayers = getRedPlayers();
  const bluePlayers = getBluePlayers();
  
  return {
    red: redPlayers.map(p => toAug(p)),
    blue: bluePlayers.map(p => toAug(p))
  };
};

// Check if team selection should be triggered
export const shouldTriggerSelection = (): boolean => {
  const spectators = getSpectators();
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  // Need at least 2 spectators and teams are not full (max 6 per team)
  return spectators.length >= 2 && 
         (redCount < 6 || blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 1; // Teams shouldn't be too unbalanced
};

// Check if we should show the "waiting for ball out" message
export const checkAndShowWaitingMessage = (): void => {
  // Don't show if selection is already active
  if (chooserState.isActive) return;
  
  // Throttle message to prevent spam
  const now = Date.now();
  if (now - lastWaitingMessageTime < WAITING_MESSAGE_COOLDOWN) return;
  
  // Only show if selection should be triggered but isn't active yet
  if (shouldTriggerSelection()) {
    const spectators = getSpectators();
    const message = `🟡 Top dışarıya çıkınca oyuncu değişikliği yapılacak. (${spectators.length} izleyici bekleniyor)`;
    
    // Send to all players as a bold yellow announcement
    room.sendAnnouncement(message, undefined, 0xFFFF00, "bold", 1);
    lastWaitingMessageTime = now;
    console.log(`[TEAM_CHOOSER] Waiting for ball out - ${spectators.length} spectators ready`);
  }
};

// Start the selection process
export const startSelection = (): void => {
  if (chooserState.isActive) return;
  
  const spectators = getSpectators();
  if (spectators.length < 2) return;
  
  const { red, blue } = getTeamMembers();
  if (red.length === 0 || blue.length === 0) return;
  
  // Pause the game
  room.pauseGame(true);
  
  chooserState.isActive = true;
  chooserState.availableSpectators = spectators.map(p => toAug(p));
  
  // Determine which teams can choose based on balance
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  if (redCount < blueCount) {
    // Red team is disadvantaged, only they can choose until balanced
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = false;
    lastFirstTeam = 1; // Red went first
  } else if (blueCount < redCount) {
    // Blue team is disadvantaged, only they can choose until balanced
    chooserState.waitingForRed = false;
    chooserState.waitingForBlue = true;
    lastFirstTeam = 2; // Blue went first
  } else {
    // Teams are equal, both teams can choose simultaneously
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = true;
  }
  
  sendSpectatorList();
  startSelectionTimeout();
};

// Send numbered spectator list to captains
const sendSpectatorList = (): void => {
  if (!chooserState.isActive) return;
  
  let message = "🔄 Oyuncu Seçimi:\n";
  chooserState.availableSpectators.forEach((spec, index) => {
    message += `${index + 1}. ${spec.name} [Lvl.${spec.level}]\n`;
  });
  
  const { red, blue } = getTeamMembers();
  const spectators = getSpectators().map(p => toAug(p));
  
  // Send to red team if they can choose
  if (chooserState.waitingForRed) {
    const redMessage = message + `\nKırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.availableSpectators.length})`;
    red.forEach(member => {
      room.sendAnnouncement(redMessage, member.id, 0xFF0000, "bold", 2); // Red color
    });
  }
  
  // Send to blue team if they can choose
  if (chooserState.waitingForBlue) {
    const blueMessage = message + `\nMavi takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.availableSpectators.length})`;
    blue.forEach(member => {
      room.sendAnnouncement(blueMessage, member.id, 0x0000FF, "bold", 2); // Blue color
    });
  }
  
  // Send info to spectators
  const activeTeams = [];
  if (chooserState.waitingForRed) activeTeams.push("Kırmızı");
  if (chooserState.waitingForBlue) activeTeams.push("Mavi");
  const infoMessage = `⏸️ Oyun durduruldu. ${activeTeams.join(" ve ")} takım${activeTeams.length > 1 ? 'ları' : 'ı'} oyuncu seçiyor...`;
  
  spectators.forEach(player => {
    sendMessage(infoMessage, player);
  });
};

// Handle selection command
export const handleSelection = (player: PlayerAugmented, selection: string): boolean => {
  if (!chooserState.isActive) {
    console.log(`[TEAM_CHOOSER] Selection not active, ignoring input: ${selection} from ${player.name}`);
    return false;
  }
  
  console.log(`[TEAM_CHOOSER] Handling selection: ${selection} from ${player.name} (ID: ${player.id})`);
  console.log(`[TEAM_CHOOSER] State: waitingForRed=${chooserState.waitingForRed}, waitingForBlue=${chooserState.waitingForBlue}`);
  
  // Check if this player is in the current selecting team
  const { red, blue } = getTeamMembers();
  console.log(`[TEAM_CHOOSER] Red team:`, red.map(p => `${p.name}(${p.id})`));
  console.log(`[TEAM_CHOOSER] Blue team:`, blue.map(p => `${p.name}(${p.id})`));
  
  const playerIsInRed = red.some(p => p.id === player.id);
  const playerIsInBlue = blue.some(p => p.id === player.id);
  
  // Check current team counts to prevent uneven teams
  const currentRedCount = red.length;
  const currentBlueCount = blue.length;
  
  // Additional safeguard: Don't allow a team to choose if it would create a 2+ player difference
  if (playerIsInRed && currentRedCount > currentBlueCount) {
    sendMessage("❌ Kırmızı takım şu anda seçim yapamaz. Takımlar dengelenmelidir.", player);
    console.log(`[TEAM_CHOOSER] Blocked red selection - would create uneven teams (${currentRedCount+1}v${currentBlueCount})`);
    return true;
  }
  
  if (playerIsInBlue && currentBlueCount > currentRedCount) {
    sendMessage("❌ Mavi takım şu anda seçim yapamaz. Takımlar dengelenmelidir.", player);
    console.log(`[TEAM_CHOOSER] Blocked blue selection - would create uneven teams (${currentRedCount}v${currentBlueCount+1})`);
    return true;
  }
  
  // Check if this player's team is allowed to select
  const isRedTeamMember = chooserState.waitingForRed && playerIsInRed;
  const isBlueTeamMember = chooserState.waitingForBlue && playerIsInBlue;
  
  console.log(`[TEAM_CHOOSER] Player ${player.name} - In Red: ${playerIsInRed}, In Blue: ${playerIsInBlue}`);
  console.log(`[TEAM_CHOOSER] Can select - Red allowed: ${isRedTeamMember}, Blue allowed: ${isBlueTeamMember}`);
  
  if (!isRedTeamMember && !isBlueTeamMember) {
    if (playerIsInRed && !chooserState.waitingForRed) {
      sendMessage("❌ Kırmızı takım şu anda seçim yapamaz. Mavi takım daha az oyuncuya sahip.", player);
    } else if (playerIsInBlue && !chooserState.waitingForBlue) {
      sendMessage("❌ Mavi takım şu anda seçim yapamaz. Kırmızı takım daha az oyuncuya sahip.", player);
    } else {
      sendMessage("❌ Şu anda sizin takımınızın seçim sırası değil.", player);
    }
    return true; // Consume the message
  }
  
  // Parse selection number
  const selectionNum = parseInt(selection.trim());
  console.log(`[TEAM_CHOOSER] Parsed selection number: ${selectionNum}, available spectators: ${chooserState.availableSpectators.length}`);
  
  if (isNaN(selectionNum) || selectionNum < 1 || selectionNum > chooserState.availableSpectators.length) {
    console.log(`[TEAM_CHOOSER] Invalid selection number`);
    sendMessage(`❌ Geçersiz seçim. 1-${chooserState.availableSpectators.length} arası sayı girin.`, player);
    return true;
  }
  
  // Get selected player
  const selectedPlayer = chooserState.availableSpectators[selectionNum - 1];
  const selectedPlayerObj = room.getPlayer(selectedPlayer.id);
  
  console.log(`[TEAM_CHOOSER] Selected player: ${selectedPlayer.name} (ID: ${selectedPlayer.id})`);
  
  if (!selectedPlayerObj) {
    console.log(`[TEAM_CHOOSER] Selected player not found in room`);
    sendMessage("❌ Seçilen oyuncu artık odada değil.", player);
    updateSpectatorList();
    return true;
  }
  
  // Determine which team the selecting player belongs to
  const selectingPlayerTeam = red.find(p => p.id === player.id) ? 1 : 2;
  const targetTeam = selectingPlayerTeam;
  const teamName = targetTeam === 1 ? "Kırmızı" : "Mavi";
  
  console.log(`[TEAM_CHOOSER] Player ${player.name} is in team ${selectingPlayerTeam}, assigning ${selectedPlayer.name} to team ${targetTeam} (${teamName})`);
  room.setPlayerTeam(selectedPlayer.id, targetTeam);
  
  // Announce selection
  sendMessage(`🎯 ${teamName} takımından ${player.name}, ${selectedPlayer.name} oyuncusunu seçti!`, null);
  
  // Remove from available spectators
  chooserState.availableSpectators = chooserState.availableSpectators.filter(p => p.id !== selectedPlayer.id);
  
  // Clear timeout
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
    chooserState.selectionTimeout = null;
  }
  
  // Calculate new team counts manually (more reliable than getRedPlayers/getBluePlayers)
  const currentRed = getRedPlayers();
  const currentBlue = getBluePlayers();
  
  // Add the newly assigned player to the count
  const newRedCount = targetTeam === 1 ? currentRed.length + 1 : currentRed.length;
  const newBlueCount = targetTeam === 2 ? currentBlue.length + 1 : currentBlue.length;
  
  console.log(`[TEAM_CHOOSER] Manual count calculation - Red: ${newRedCount}, Blue: ${newBlueCount}`);
  
  // Check if we should continue or end selection based on new counts
  const specCount = chooserState.availableSpectators.length;
  const shouldContinue = specCount > 0 && 
         (newRedCount < 6 && newBlueCount < 6) && 
         Math.abs(newRedCount - newBlueCount) <= 1;
         
  console.log(`[TEAM_CHOOSER] Should continue with manual calculation: ${shouldContinue}`);
  
  if (shouldContinue) {
    // Determine who should choose next based on team balance
    
    console.log(`[TEAM_CHOOSER] After selection - Red: ${newRedCount}, Blue: ${newBlueCount}`);
    
    if (newRedCount < newBlueCount) {
      // Red team is disadvantaged, only they can choose until balanced
      chooserState.waitingForRed = true;
      chooserState.waitingForBlue = false;
      console.log(`[TEAM_CHOOSER] Red team disadvantaged (${newRedCount}v${newBlueCount}), only red can choose`);
    } else if (newBlueCount < newRedCount) {
      // Blue team is disadvantaged, only they can choose until balanced
      chooserState.waitingForRed = false;
      chooserState.waitingForBlue = true;
      console.log(`[TEAM_CHOOSER] Blue team disadvantaged (${newRedCount}v${newBlueCount}), only blue can choose`);
    } else {
      // Teams are equal, both can choose simultaneously
      chooserState.waitingForRed = true;
      chooserState.waitingForBlue = true;
      console.log(`[TEAM_CHOOSER] Teams equal (${newRedCount}v${newBlueCount}), both can choose`);
    }
    
    sendSpectatorList();
    startSelectionTimeout();
  } else {
    endSelection();
  }
  
  return true;
};

// Check if selection should continue
const checkContinueSelection = (): boolean => {
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  const specCount = chooserState.availableSpectators.length;
  
  console.log(`[TEAM_CHOOSER] checkContinueSelection - Red: ${redCount}, Blue: ${blueCount}, Specs: ${specCount}`);
  
  // Continue if:
  // 1. There are still spectators available
  // 2. Teams are not full (6 max per team)  
  // 3. Teams don't exceed a 1 player difference (prevents uneven teams)
  const shouldContinue = specCount > 0 && 
         (redCount < 6 && blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 1;
         
  console.log(`[TEAM_CHOOSER] Should continue: ${shouldContinue}`);
  return shouldContinue;
};

// Update spectator list (remove players who left)
const updateSpectatorList = (): void => {
  if (!chooserState.isActive) return;
  
  const currentSpectators = getSpectators().map(p => toAug(p));
  chooserState.availableSpectators = chooserState.availableSpectators.filter(spec => 
    currentSpectators.some(current => current.id === spec.id)
  );
  
  if (chooserState.availableSpectators.length === 0) {
    endSelection();
  }
};

// Start selection timeout
const startSelectionTimeout = (): void => {
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
  }
  
  chooserState.selectionTimeout = setTimeout(() => {
    if (chooserState.isActive) {
      const teamName = chooserState.waitingForRed ? "Kırmızı" : "Mavi";
      
      sendMessage(`⏰ ${teamName} takımının seçim süresi doldu. Otomatik oyuncu atanıyor...`, null);
      
      // Auto-assign first available spectator
      if (chooserState.availableSpectators.length > 0) {
        const autoSelected = chooserState.availableSpectators[0];
        const targetTeam = chooserState.waitingForRed ? 1 : 2;
        
        room.setPlayerTeam(autoSelected.id, targetTeam);
        sendMessage(`🤖 ${autoSelected.name} otomatik olarak ${teamName} takımına atandı.`, null);
        
        chooserState.availableSpectators.shift(); // Remove first player
      }
      
      endSelection();
    }
  }, SELECTION_TIMEOUT);
};

// End selection process
export const endSelection = (): void => {
  if (!chooserState.isActive) return;
  
  // Clear timeout
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
    chooserState.selectionTimeout = null;
  }
  
  // Reset state
  chooserState.isActive = false;
  chooserState.waitingForRed = false;
  chooserState.waitingForBlue = false;
  chooserState.availableSpectators = [];
  
  // Resume game
  room.pauseGame(false);
  
  sendMessage("▶️ Oyuncu seçimi tamamlandı. Oyun devam ediyor!", null);
  
  // Check if we should show waiting message for next selection
  setTimeout(() => {
    checkAndShowWaitingMessage();
  }, 1000); // Delay to let the game resume properly
};

// Force end selection (for admin commands or game events)
export const forceEndSelection = (): void => {
  if (chooserState.isActive) {
    endSelection();
  }
};

// Check if selection is currently active
export const isSelectionActive = (): boolean => {
  return chooserState.isActive;
};

// Handle player leaving during selection
export const handlePlayerLeave = (player: PlayerAugmented): void => {
  if (!chooserState.isActive) return;
  
  // If all members of a team leave, end selection
  const { red, blue } = getTeamMembers();
  if (red.length === 0 || blue.length === 0) {
    sendMessage("❌ Bir takımın tüm üyeleri oyundan ayrıldı. Seçim iptal ediliyor.", null);
    endSelection();
    return;
  }
  
  // If a spectator leaves, update list
  const wasSpectator = chooserState.availableSpectators.some(spec => spec.id === player.id);
  if (wasSpectator) {
    updateSpectatorList();
    if (chooserState.availableSpectators.length > 0) {
      sendSpectatorList(); // Refresh the list for team members
    }
  }
};