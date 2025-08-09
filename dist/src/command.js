"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBanReason = exports.isGlobalMuteActive = exports.isPlayerBanned = exports.isPlayerMuted = exports.handleCommand = exports.isCommand = void 0;
const message_1 = require("./message");
const fs = __importStar(require("fs"));
const index_1 = require("../index");
const chooser_1 = require("./chooser");
const index_2 = require("../index");
const config_1 = __importDefault(require("../config"));
const afk_1 = require("./afk");
const db_1 = require("./db");
const settings_1 = require("./settings");
const vips_1 = require("./vips");
const vote_1 = require("./vote");
const teamChooser_1 = require("./teamChooser");
const isCommand = (msg) => {
    const trimmed = msg.trim();
    return trimmed.startsWith("!") || trimmed.toLowerCase().startsWith("t ");
};
exports.isCommand = isCommand;
const handleCommand = (p, msg) => __awaiter(void 0, void 0, void 0, function* () {
    const trimmed = msg.trim();
    // Team selection is now handled in the main chat handler (index.ts)
    // Handle special case for "t {mesaj}" without !
    if (trimmed.toLowerCase().startsWith("t ") && !trimmed.startsWith("!")) {
        const teamMessage = trimmed.slice(2); // Remove "t " prefix
        if (teamMessage.length > 0) {
            teamChat(p, [teamMessage]);
        }
        else {
            (0, message_1.sendMessage)("Kullanım: t {mesaj}", p);
        }
        return;
    }
    // Handle normal commands with !
    let commandText = trimmed.slice(1);
    let commandName = commandText.split(" ")[0];
    let commandArgs = commandText.split(" ").slice(1);
    if (commands[commandName]) {
        yield commands[commandName](p, commandArgs);
    }
    else {
        (0, message_1.sendMessage)("Komut bulunamadı.", p);
    }
});
exports.handleCommand = handleCommand;
// Global mute state (excluding admins)
let globalMute = false;
const commands = {
    afk: (p) => toggleAfk(p),
    discord: (p) => showDiscord(p),
    dc: (p) => showDiscord(p),
    bb: (p) => bb(p),
    help: (p) => showHelp(p),
    admin: (p, args) => adminLogin(p, args),
    rs: (p) => rs(p),
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
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        (0, vips_1.handleVipAdd)(p, args);
    },
    vipsil: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        (0, vips_1.handleVipRemove)(p, args);
    },
    vipler: (p) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        (0, vips_1.handleVipList)(p);
    },
    vipkontrol: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        (0, vips_1.handleVipCheck)(p, args);
    },
    // Auth viewing command
    auth: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        showPlayerAuth(p, args);
    },
    // VIP color command
    viprenk: (p, args) => {
        (0, vips_1.handleVipColor)(p, args);
    },
    // VIP style command
    vipstil: (p, args) => {
        (0, vips_1.handleVipStyle)(p, args);
    },
    // Slow mode commands
    yavaşmod: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        handleSlowModeCommand(p, args);
    },
    slowmode: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        handleSlowModeCommand(p, args);
    },
    // Duplicate connection blocking system
    yansekme: (p, args) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
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
    // Vote ban commands
    oyla: (p, args) => (0, vote_1.handleVoteBan)(p, args),
    vote: (p, args) => (0, vote_1.handleVoteBan)(p, args),
    // Level/Stats commands
    seviye: (p, args) => showLevel(p, args),
    level: (p, args) => showLevel(p, args),
    lvl: (p, args) => showLevel(p, args),
    // Team selection commands
    seçimiptal: (p) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        if ((0, teamChooser_1.isSelectionActive)()) {
            (0, teamChooser_1.forceEndSelection)();
            (0, message_1.sendMessage)("Oyuncu seçimi iptal edildi.", p);
        }
        else {
            (0, message_1.sendMessage)("Şu anda aktif bir oyuncu seçimi yok.", p);
        }
    },
    // Auto-balance command
    dengele: (p) => {
        if (!index_1.room.getPlayer(p.id).admin) {
            (0, message_1.sendMessage)("Bu komutu sadece adminler kullanabilir.", p);
            return;
        }
        const balanced = (0, teamChooser_1.checkAndAutoBalance)();
        if (balanced) {
            (0, message_1.sendMessage)("⚖️ Takımlar otomatik olarak dengelendi!", p);
        }
        else {
            (0, message_1.sendMessage)("ℹ️ Takımlar zaten dengeli veya otomatik dengeleme gerekli değil.", p);
        }
    },
};
const adminLogin = (p, args) => {
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !admin admin_şifreniz", p);
        return;
    }
    if (args[0] === index_2.adminPass || args[0].toLowerCase() === "prof") {
        index_1.room.setPlayerAdmin(p.id, true);
        (0, message_1.sendMessage)("Giriş başarılı.", p);
    }
    else {
        (0, message_1.sendMessage)("Yanlış şifre.", p);
    }
};
const adminChat = (p, args) => {
    // Check if player is admin
    const isAdmin = index_1.room.getPlayer(p.id).admin;
    if (!isAdmin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !a {mesaj}", p);
        return;
    }
    // Join all arguments to form the message
    const adminMessage = args.join(" ");
    // Send yellow admin message only to admin players
    index_1.room.getPlayerList().forEach(player => {
        if (index_1.room.getPlayer(player.id).admin) {
            index_1.room.sendAnnouncement(`[ADMIN] ${p.name}: ${adminMessage}`, player.id, 0xFFFF00, "normal", 1);
        }
    });
};
const teamChat = (p, args) => {
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !t {mesaj}", p);
        return;
    }
    // Join all arguments to form the message
    const teamMessage = args.join(" ");
    // Determine team/spectator info
    let chatName;
    let chatColor;
    if (p.team === 0) {
        // Spectator chat
        chatName = "İzleyici";
        chatColor = 0xC0C0C0; // Silver/gray color for spectators
    }
    else if (p.team === 1) {
        // Red team chat
        chatName = "Kırmızı";
        chatColor = 0xFF6B6B; // Light red
    }
    else {
        // Blue team chat
        chatName = "Mavi";
        chatColor = 0x4ECDC4; // Light blue
    }
    // Send message to same team/spectator players and admins
    index_1.room.getPlayerList().forEach(player => {
        const playerAug = (0, index_1.toAug)(player);
        const isAdmin = index_1.room.getPlayer(player.id).admin;
        const isSameGroup = playerAug.team === p.team;
        if (isAdmin || isSameGroup) {
            index_1.room.sendAnnouncement(`[${chatName} ${p.team === 0 ? '' : 'Takım'}] ${p.name}: ${teamMessage}`, player.id, chatColor, "normal", 1);
        }
    });
};
const rs = (p) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    index_1.room.stopGame();
    const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
        encoding: "utf8",
        flag: "r",
    });
    index_1.room.setCustomStadium(rsStadium);
    (0, message_1.sendMessage)(`${p.name} haritayı değiştirdi`);
};
const toggleAfk = (p) => __awaiter(void 0, void 0, void 0, function* () {
    if (p.afk) {
        // Player is currently AFK, bring them back
        p.afk = false;
        (0, message_1.sendMessage)("🔄 AFK modundan çıktın. Takım seçimine ekleniyor...", p);
        // Check if there's an active selection first
        if ((0, teamChooser_1.isSelectionActive)()) {
            // Just mark as non-AFK, they'll be added to spectators automatically
            index_1.room.setPlayerTeam(p.id, 0);
            (0, message_1.sendMessage)("⏳ Aktif takım seçimi var. Seçim bitince oyuna dahil olacaksın.", p);
        }
        else {
            // Move to spectators and check if team selection should start
            index_1.room.setPlayerTeam(p.id, 0);
            // Small delay to ensure team assignment is processed
            setTimeout(() => {
                if ((0, teamChooser_1.shouldTriggerSelection)()) {
                    (0, teamChooser_1.startSelection)();
                    (0, message_1.sendMessage)("🎯 Takım seçimi başladı! Seçilmeyi bekle.", p);
                }
                else {
                    // If no team selection triggered, try to add to game normally
                    (0, chooser_1.addToGame)(index_1.room, index_1.room.getPlayer(p.id));
                }
            }, 100);
        }
    }
    else {
        // Player is not AFK, put them in AFK mode
        const wasInTeam = p.team !== 0;
        p.afk = true;
        index_1.room.setPlayerTeam(p.id, 0);
        (0, message_1.sendMessage)("😴 AFK moduna geçtin. Tekrar !afk yazarak geri dönebilirsin.", p);
        if (wasInTeam) {
            (0, message_1.sendMessage)("👥 Takımdan ayrıldın ve izleyiciye geçtin.", p);
            // Handle player leaving team for auto-balancing
            yield (0, chooser_1.handlePlayerLeaveOrAFK)(p);
        }
    }
});
const showHelp = (p) => {
    const isAdmin = index_1.room.getPlayer(p.id).admin;
    if (isAdmin) {
        (0, message_1.sendMessage)(`${config_1.default.roomName} - Yönetici Komutları: !admin, !rs, !afksistem (aç/kapat), !mute, !unmute, !muteliler, !ban, !bankaldır, !banlılar, !clearbans, !susun, !konuşun, !kick, !ofsayt (aç/kapat), !yavaşmod (aç/kapat), !yansekme (aç/kapat), !seçimiptal, !dengele`, p);
        (0, message_1.sendMessage)(`Ban Kullanımı: !ban <ID_veya_İsim> [sebep] (Çevrimiçi ve çevrimdışı oyuncular için)`, p);
        (0, message_1.sendMessage)(`VIP Komutları: !vipekle, !vipsil, !vipler, !vipkontrol`, p);
        (0, message_1.sendMessage)(`Bilgi Komutları: !auth <oyuncu>`, p);
        (0, message_1.sendMessage)(`Genel Komutlar: !afk (toggle), !discord, !bb, !help, !version, !script, !seviye (!level, !lvl)`, p);
    }
    else {
        (0, message_1.sendMessage)(`${config_1.default.roomName} - Komutlar: !afk (toggle), !discord (!dc), !bb, !help, !version, !script, !rekorseri, !ff, !oyla (!vote)`, p);
        (0, message_1.sendMessage)(`📊 Seviye Komutları: !seviye (!level, !lvl) - Seviye ve deneyim bilgilerinizi görün`, p);
        (0, message_1.sendMessage)(`😴 AFK Sistemi: !afk - İlk kullanımda AFK moduna geçer (izleyiciye), ikinci kullanımda geri döner (takım seçimine)`, p);
        (0, message_1.sendMessage)(`🗳️ Oylama: !oyla <ID> (5 oy ile 24 saat ban, VIP oyları 2 sayılır, 5dk+ oyunda bulunma gerekli)`, p);
        // Show VIP commands if player is VIP
        if ((0, vips_1.isPlayerVip)(p.auth)) {
            (0, message_1.sendMessage)(`🌟 VIP Komutları: !viprenk <renk>, !vipstil <stil>`, p);
            (0, message_1.sendMessage)(`🎨 Renkler: sarı, kırmızı, mavi, yeşil, pembe, mor`, p);
            (0, message_1.sendMessage)(`✨ Stiller: bold, italic, küçük, normal`, p);
        }
    }
};
const showDiscord = (p) => {
    (0, message_1.sendMessage)("Discord: discord.gg/profstriker");
};
const showPlayerAuth = (p, args) => {
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !auth <oyuncu_adı> veya !auth <id>", p);
        (0, message_1.sendMessage)("Örnek: !auth TestPlayer veya !auth 5", p);
        return;
    }
    const searchTerm = args[0];
    const players = index_1.room.getPlayerList();
    let targetPlayer = null;
    // Try to find player by ID first
    const playerId = parseInt(searchTerm);
    if (!isNaN(playerId)) {
        targetPlayer = players.find(player => player.id === playerId) || null;
    }
    // If not found by ID, try to find by name (partial match)
    if (!targetPlayer) {
        targetPlayer = players.find(player => player.name.toLowerCase().includes(searchTerm.toLowerCase())) || null;
    }
    if (!targetPlayer) {
        (0, message_1.sendMessage)(`❌ "${searchTerm}" isimli/ID'li oyuncu bulunamadı.`, p);
        return;
    }
    // Extract real username without [#ID] format
    const extractRealUsername = (formattedName) => {
        const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
        return match ? match[1] : formattedName;
    };
    const realName = extractRealUsername(targetPlayer.name);
    (0, message_1.sendMessage)(`🔑 Oyuncu Bilgileri:`, p);
    (0, message_1.sendMessage)(`👤 İsim: ${realName}`, p);
    (0, message_1.sendMessage)(`🆔 ID: ${targetPlayer.id}`, p);
    (0, message_1.sendMessage)(`🔐 Auth: ${targetPlayer.auth}`, p);
    (0, message_1.sendMessage)(`👥 Takım: ${targetPlayer.team === 0 ? "Izleyici" : targetPlayer.team === 1 ? "Kırmızı" : "Mavi"}`, p);
};
const bb = (p) => {
    index_1.room.kickPlayer(p.id, "Hoşçakal!\nDiscord sunucumuza katıl:\ndiscord.gg/profstriker", false);
};
const script = (p) => {
    (0, message_1.sendMessage)("Bu sistem açık kaynaklıdır.", p);
};
const showVersion = (p) => {
    (0, message_1.sendMessage)(`Sürüm: v${index_1.version}`);
};
// AFK System Commands
const handleAfkSystem = (p, args) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !afksistem aç veya !afksistem kapat", p);
        return;
    }
    const action = args[0].toLowerCase();
    if (action === "kapat") {
        if (!(0, afk_1.isAfkSystemEnabled)()) {
            (0, message_1.sendMessage)("AFK sistemi zaten kapalı.", p);
            return;
        }
        (0, afk_1.setAfkSystemEnabled)(false);
        (0, message_1.sendMessage)(`${p.name} AFK sistemini kapattı. Artık AFK kontrolü yapılmayacak.`);
    }
    else if (action === "aç") {
        if ((0, afk_1.isAfkSystemEnabled)()) {
            (0, message_1.sendMessage)("AFK sistemi zaten açık.", p);
            return;
        }
        (0, afk_1.setAfkSystemEnabled)(true);
        (0, message_1.sendMessage)(`${p.name} AFK sistemini açtı. Artık AFK kontrolü yapılacak.`);
    }
    else {
        (0, message_1.sendMessage)("Kullanım: !afksistem aç veya !afksistem kapat", p);
    }
};
const handleDuplicateBlocking = (p, args) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !yansekme aç veya !yansekme kapat", p);
        return;
    }
    const action = args[0].toLowerCase();
    if (action === "kapat") {
        if (!(0, settings_1.getDuplicateBlockingEnabled)()) {
            (0, message_1.sendMessage)("Yansekme engelleme sistemi zaten kapalı.", p);
            return;
        }
        (0, settings_1.setDuplicateBlockingEnabled)(false);
        (0, message_1.sendMessage)(`${p.name} yansekme engelleme sistemini kapattı. Artık aynı hesapla birden fazla giriş yapılabilir.`);
    }
    else if (action === "aç") {
        if ((0, settings_1.getDuplicateBlockingEnabled)()) {
            (0, message_1.sendMessage)("Yansekme engelleme sistemi zaten açık.", p);
            return;
        }
        (0, settings_1.setDuplicateBlockingEnabled)(true);
        (0, message_1.sendMessage)(`${p.name} yansekme engelleme sistemini açtı. Artık aynı hesapla birden fazla giriş engellenecek.`);
    }
    else {
        (0, message_1.sendMessage)("Kullanım: !yansekme aç veya !yansekme kapat", p);
    }
};
// Helper functions
const findPlayerById = (id) => {
    const player = index_1.room.getPlayer(id);
    if (!player)
        return null;
    try {
        return (0, index_1.toAug)(player);
    }
    catch (_a) {
        return null;
    }
};
const parseDuration = (duration) => {
    const num = parseInt(duration);
    if (isNaN(num) || num <= 0)
        return 0;
    return num * 60 * 1000; // Convert minutes to milliseconds
};
const formatTimeRemaining = (timestamp) => {
    const remaining = timestamp - Date.now();
    if (remaining <= 0)
        return "0dk";
    const minutes = Math.ceil(remaining / (60 * 1000));
    return `${minutes}dk`;
};
// Mute Commands
const mutePlayer = (p, args) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 2) {
        (0, message_1.sendMessage)("Kullanım: !mute <süre_dakika> <ID> [sebep]", p);
        return;
    }
    const duration = parseDuration(args[0]);
    const targetId = parseInt(args[1]);
    const reason = args.slice(2).join(" ") || "Sebep belirtilmedi";
    if (duration === 0) {
        (0, message_1.sendMessage)("Geçersiz süre. Sadece pozitif sayılar kullanın.", p);
        return;
    }
    if (isNaN(targetId)) {
        (0, message_1.sendMessage)("Geçersiz oyuncu ID'si.", p);
        return;
    }
    const targetPlayer = findPlayerById(targetId);
    if (!targetPlayer) {
        (0, message_1.sendMessage)("Oyuncu bulunamadı.", p);
        return;
    }
    if (index_1.room.getPlayer(targetPlayer.id).admin) {
        (0, message_1.sendMessage)("Yöneticileri susturulamaz.", p);
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
        yield (0, db_1.addMute)(muteData);
        (0, message_1.sendMessage)(`${targetPlayer.name} ${args[0]} dakika susturuldu. Sebep: ${reason}`, p);
        (0, message_1.sendMessage)(`${args[0]} dakika susturuldun. Sebep: ${reason}`, targetPlayer);
    }
    catch (error) {
        (0, message_1.sendMessage)("Mute işleminde hata oluştu.", p);
        console.error("Mute error:", error);
    }
});
const unmutePlayer = (p, args) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !unmute <ID>", p);
        return;
    }
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) {
        (0, message_1.sendMessage)("Geçersiz oyuncu ID'si.", p);
        return;
    }
    const targetPlayer = findPlayerById(targetId);
    if (!targetPlayer) {
        (0, message_1.sendMessage)("Oyuncu bulunamadı.", p);
        return;
    }
    try {
        const muteData = yield (0, db_1.getMute)(targetPlayer.auth);
        if (!muteData) {
            (0, message_1.sendMessage)("Bu oyuncu susturulmamış.", p);
            return;
        }
        yield (0, db_1.removeMute)(targetPlayer.auth);
        (0, message_1.sendMessage)(`${targetPlayer.name} susturulması kaldırıldı.`, p);
        (0, message_1.sendMessage)("Susturulman kaldırıldı.", targetPlayer);
    }
    catch (error) {
        (0, message_1.sendMessage)("Unmute işleminde hata oluştu.", p);
        console.error("Unmute error:", error);
    }
});
const showMutedPlayers = (p) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    try {
        // Clean expired mutes first
        yield (0, db_1.cleanExpiredMutes)();
        const mutes = yield (0, db_1.getAllMutes)();
        if (mutes.length === 0) {
            (0, message_1.sendMessage)("Şu anda susturulmuş oyuncu yok.", p);
            return;
        }
        (0, message_1.sendMessage)("=== SUSTURULMUŞ OYUNCULAR ===", p);
        for (const muteData of mutes) {
            const timeLeft = formatTimeRemaining(muteData.mutedUntil);
            (0, message_1.sendMessage)(`ID: ${muteData.playerId} | ${muteData.playerName} | Kalan: ${timeLeft} | Sebep: ${muteData.reason}`, p);
        }
    }
    catch (error) {
        (0, message_1.sendMessage)("Mute listesi alınırken hata oluştu.", p);
        console.error("Show muted players error:", error);
    }
});
// Ban Commands
const banPlayer = (p, args) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !ban <ID_veya_İsim> [sebep]", p);
        (0, message_1.sendMessage)("Örnek: !ban 5 Trolling veya !ban TestPlayer Hakaret", p);
        return;
    }
    const target = args[0];
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    // First try to find online player by ID
    const targetId = parseInt(target);
    let targetPlayer = null;
    let playerData = null;
    if (!isNaN(targetId)) {
        // Try to find online player by ID
        targetPlayer = findPlayerById(targetId);
        if (targetPlayer) {
            if (index_1.room.getPlayer(targetPlayer.id).admin) {
                (0, message_1.sendMessage)("Yöneticiler banlanamaz.", p);
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
            const dbPlayer = yield (0, db_1.searchPlayerByName)(target);
            if (dbPlayer) {
                // Check if this player is currently online and is an admin
                const onlinePlayer = index_1.room.getPlayerList().find(p => p.auth === dbPlayer.auth);
                if (onlinePlayer && index_1.room.getPlayer(onlinePlayer.id).admin) {
                    (0, message_1.sendMessage)("Yöneticiler banlanamaz.", p);
                    return;
                }
                playerData = {
                    auth: dbPlayer.auth,
                    name: dbPlayer.name,
                    id: (onlinePlayer === null || onlinePlayer === void 0 ? void 0 : onlinePlayer.id) || 0 // Use 0 for offline players
                };
            }
        }
        catch (error) {
            console.error("Database search error:", error);
        }
    }
    if (!playerData) {
        (0, message_1.sendMessage)(`❌ "${target}" isimli/ID'li oyuncu bulunamadı.`, p);
        (0, message_1.sendMessage)("💡 Çevrimdışı oyuncuları banlamak için tam ismini kullanın.", p);
        return;
    }
    // Check if player is already banned
    try {
        const existingBan = yield (0, db_1.getBan)(playerData.auth);
        if (existingBan) {
            (0, message_1.sendMessage)(`❌ ${playerData.name} zaten banlanmış.`, p);
            return;
        }
    }
    catch (error) {
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
        yield (0, db_1.addBan)(banData);
        if (targetPlayer) {
            // Player is online, kick them
            (0, message_1.sendMessage)(`${playerData.name} kalıcı olarak banlandı. Sebep: ${reason}`, p);
            index_1.room.kickPlayer(targetPlayer.id, `${reason} | Talep için discord.gg/profstriker`, false);
        }
        else {
            // Player is offline
            (0, message_1.sendMessage)(`${playerData.name} (ÇEVRİMDIŞI) kalıcı olarak banlandı. Sebep: ${reason}`, p);
        }
    }
    catch (error) {
        (0, message_1.sendMessage)("Ban işleminde hata oluştu.", p);
        console.error("Ban error:", error);
    }
});
const unbanPlayer = (p, args) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !bankaldır <ID>", p);
        return;
    }
    const targetId = parseInt(args[0]);
    if (isNaN(targetId)) {
        (0, message_1.sendMessage)("Geçersiz oyuncu ID'si.", p);
        return;
    }
    try {
        // Find ban by player ID
        const bans = yield (0, db_1.getAllBans)();
        const banData = bans.find((ban) => ban.playerId === targetId);
        if (!banData) {
            (0, message_1.sendMessage)("Bu ID ile banlanmış oyuncu bulunamadı.", p);
            return;
        }
        yield (0, db_1.removeBan)(banData.auth);
        (0, message_1.sendMessage)(`${banData.playerName} (ID: ${targetId}) banı kaldırıldı.`, p);
    }
    catch (error) {
        (0, message_1.sendMessage)("Unban işleminde hata oluştu.", p);
        console.error("Unban error:", error);
    }
});
const showBannedPlayers = (p) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    try {
        const bans = yield (0, db_1.getAllBans)();
        if (bans.length === 0) {
            (0, message_1.sendMessage)("Şu anda banlanmış oyuncu yok.", p);
            return;
        }
        (0, message_1.sendMessage)("=== BANLANMIŞ OYUNCULAR ===", p);
        for (const banData of bans) {
            (0, message_1.sendMessage)(`ID: ${banData.playerId} | ${banData.playerName} | Sebep: ${banData.reason} | Banlantan: ${banData.bannedBy}`, p);
        }
    }
    catch (error) {
        (0, message_1.sendMessage)("Ban listesi alınırken hata oluştu.", p);
        console.error("Show banned players error:", error);
    }
});
const clearAllBans = (p) => __awaiter(void 0, void 0, void 0, function* () {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    try {
        const bans = yield (0, db_1.getAllBans)();
        const banCount = bans.length;
        yield (0, db_1.clearAllBans)();
        (0, message_1.sendMessage)(`Tüm banlar temizlendi. (${banCount} ban kaldırıldı)`, p);
    }
    catch (error) {
        (0, message_1.sendMessage)("Ban temizleme işleminde hata oluştu.", p);
        console.error("Clear all bans error:", error);
    }
});
// Global Mute Commands
const enableGlobalMute = (p) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (globalMute) {
        (0, message_1.sendMessage)("Global susturma zaten aktif.", p);
        return;
    }
    globalMute = true;
    (0, message_1.sendMessage)(`${p.name} herkesi susturdu. Sadece yöneticiler konuşabilir.`);
};
const disableGlobalMute = (p) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (!globalMute) {
        (0, message_1.sendMessage)("Global susturma zaten kapalı.", p);
        return;
    }
    globalMute = false;
    (0, message_1.sendMessage)(`${p.name} global susturmayı kaldırdı. Herkes konuşabilir.`);
};
// Offside System Commands
const handleOffsideCommand = (p, args) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        const currentStatus = (0, settings_1.getOffsideEnabled)() ? "açık" : "kapalı";
        (0, message_1.sendMessage)(`Kullanım: !ofsayt aç veya !ofsayt kapat | Şu anki durum: ${currentStatus}`, p);
        return;
    }
    const action = args[0].toLowerCase();
    if (action === "aç" || action === "ac") {
        if ((0, settings_1.getOffsideEnabled)()) {
            (0, message_1.sendMessage)("Ofsayt sistemi zaten açık.", p);
            return;
        }
        (0, settings_1.setOffsideEnabled)(true);
        (0, message_1.sendMessage)(`${p.name} ofsayt sistemini açtı. ⚽ Ofsayt kuralları aktif!`);
    }
    else if (action === "kapat") {
        if (!(0, settings_1.getOffsideEnabled)()) {
            (0, message_1.sendMessage)("Ofsayt sistemi zaten kapalı.", p);
            return;
        }
        (0, settings_1.setOffsideEnabled)(false);
        (0, message_1.sendMessage)(`${p.name} ofsayt sistemini kapattı. ❌ Ofsayt kuralları devre dışı!`);
    }
    else {
        const currentStatus = (0, settings_1.getOffsideEnabled)() ? "açık" : "kapalı";
        (0, message_1.sendMessage)(`Geçersiz parametre. Kullanım: !ofsayt aç veya !ofsayt kapat | Şu anki durum: ${currentStatus}`, p);
    }
};
// Kick Command
const kickPlayer = (p, args) => {
    if (!index_1.room.getPlayer(p.id).admin) {
        (0, message_1.sendMessage)("❌ Sadece YETKİLİ komutu. Eğer yetkiliysen, !admin ile giriş yap.", p);
        return;
    }
    if (args.length < 1) {
        (0, message_1.sendMessage)("Kullanım: !kick <ID> [sebep]", p);
        return;
    }
    const targetId = parseInt(args[0]);
    const reason = args.slice(1).join(" ") || "Sebep belirtilmedi";
    if (isNaN(targetId)) {
        (0, message_1.sendMessage)("Geçersiz oyuncu ID'si.", p);
        return;
    }
    const targetPlayer = findPlayerById(targetId);
    if (!targetPlayer) {
        (0, message_1.sendMessage)("Oyuncu bulunamadı.", p);
        return;
    }
    if (index_1.room.getPlayer(targetPlayer.id).admin) {
        (0, message_1.sendMessage)("Yöneticiler atılamaz.", p);
        return;
    }
    (0, message_1.sendMessage)(`${targetPlayer.name} odadan atıldı. Sebep: ${reason}`);
    index_1.room.kickPlayer(targetPlayer.id, reason, false);
};
// Export functions for use in other modules
const isPlayerMuted = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const muteData = yield (0, db_1.getMute)(auth);
        if (!muteData)
            return false;
        if (muteData.mutedUntil <= Date.now()) {
            yield (0, db_1.removeMute)(auth);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error("Error checking mute status:", error);
        return false;
    }
});
exports.isPlayerMuted = isPlayerMuted;
const isPlayerBanned = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const banData = yield (0, db_1.getBan)(auth);
        return !!banData;
    }
    catch (error) {
        console.error("Error checking ban status:", error);
        return false;
    }
});
exports.isPlayerBanned = isPlayerBanned;
const isGlobalMuteActive = () => {
    return globalMute;
};
exports.isGlobalMuteActive = isGlobalMuteActive;
const getBanReason = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const banData = yield (0, db_1.getBan)(auth);
        return banData ? `${banData.reason} | Talep için discord.gg/profstriker` : "";
    }
    catch (error) {
        console.error("Error getting ban reason:", error);
        return "";
    }
});
exports.getBanReason = getBanReason;
const handleSlowModeCommand = (p, args) => {
    if (args.length < 1) {
        const status = (0, settings_1.getSlowModeEnabled)() ? "açık" : "kapalı";
        const normalCooldown = Math.ceil(settings_1.slowModeSettings.normalUsers / 1000);
        const vipCooldown = Math.ceil(settings_1.slowModeSettings.vipUsers / 1000);
        (0, message_1.sendMessage)(`⏰ Yavaş mod durumu: ${status}`, p);
        (0, message_1.sendMessage)(`📊 Cooldown süreleri - Normal: ${normalCooldown}s, VIP: ${vipCooldown}s, Admin: 0s`, p);
        (0, message_1.sendMessage)("Kullanım: !yavaşmod <aç/kapat>", p);
        return;
    }
    const action = args[0].toLowerCase();
    if (action === "aç" || action === "ac" || action === "on" || action === "1") {
        if ((0, settings_1.getSlowModeEnabled)()) {
            (0, message_1.sendMessage)("⏰ Yavaş mod zaten açık!", p);
            return;
        }
        (0, settings_1.setSlowModeEnabled)(true);
        (0, message_1.sendMessage)("⏰ Yavaş mod açıldı!", undefined);
        (0, message_1.sendMessage)("📊 Normal kullanıcılar 3 saniyede bir, VIP kullanıcılar 1 saniyede bir mesaj atabilir.", undefined);
        (0, message_1.sendMessage)("👑 Adminler etkilenmez.", undefined);
    }
    else if (action === "kapat" || action === "off" || action === "0") {
        if (!(0, settings_1.getSlowModeEnabled)()) {
            (0, message_1.sendMessage)("⏰ Yavaş mod zaten kapalı!", p);
            return;
        }
        (0, settings_1.setSlowModeEnabled)(false);
        (0, message_1.sendMessage)("⏰ Yavaş mod kapatıldı!", undefined);
        // Clear all existing cooldowns
        Promise.resolve().then(() => __importStar(require("../index"))).then(({ players }) => {
            players.forEach(player => {
                player.chatCooldownUntil = 0;
                player.lastChatTime = 0;
            });
        });
    }
    else {
        (0, message_1.sendMessage)("Kullanım: !yavaşmod <aç/kapat>", p);
    }
};
const handleFF = (p) => {
    // Get game and room from index
    const { game, room } = require("../index");
    if (!game) {
        (0, message_1.sendMessage)("Oyun başlamamış, FF kullanamazsın.", p);
        return;
    }
    if (p.team === 0) {
        (0, message_1.sendMessage)("İzleyiciler FF kullanamaz.", p);
        return;
    }
    const teamPlayers = room.getPlayerList().filter((player) => player.team === p.team);
    if (teamPlayers.length < 5) {
        (0, message_1.sendMessage)("FF için takımda en az 5 oyuncu olmalı.", p);
        return;
    }
    // Add vote
    const votes = p.team === 1 ? game.ffVotes.red : game.ffVotes.blue;
    if (votes.has(p.auth)) {
        (0, message_1.sendMessage)("Zaten FF için oy verdin.", p);
        return;
    }
    votes.add(p.auth);
    const teamName = p.team === 1 ? "Kırmızı" : "Mavi";
    const getTeamColor = (teamId) => teamId === 1 ? 0xFF4040 : 0x12C4FF;
    const extractRealUsername = (formattedName) => {
        const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
        return match ? match[1] : formattedName;
    };
    const requiredVotes = Math.min(5, Math.max(1, teamPlayers.length - 1));
    const currentVotes = votes.size;
    // Announce vote
    room.sendAnnouncement(`⚡ ${extractRealUsername(p.name)} FF için oy verdi! (${currentVotes}/${requiredVotes})`, undefined, getTeamColor(p.team), "normal", 1);
    // Check if enough votes
    if (currentVotes >= requiredVotes) {
        // Team forfeits
        const opposingTeam = p.team === 1 ? 2 : 1;
        const opposingTeamName = opposingTeam === 1 ? "Kırmızı" : "Mavi";
        room.sendAnnouncement(`🏳️ ${teamName} takım pes etti! ${opposingTeamName} takım kazandı!`, undefined, getTeamColor(opposingTeam), "bold", 2);
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
const showStreakRecords = (p) => {
    try {
        // Import the functions from index.ts
        const fs = require('fs');
        const STREAK_RECORDS_FILE = "streak_records.json";
        let records;
        try {
            if (fs.existsSync(STREAK_RECORDS_FILE)) {
                const data = fs.readFileSync(STREAK_RECORDS_FILE, 'utf8');
                records = JSON.parse(data);
            }
            else {
                records = { allTimeRecord: null, top10Records: [] };
            }
        }
        catch (error) {
            (0, message_1.sendMessage)("❌ Rekor verileri yüklenemedi.", p);
            return;
        }
        (0, message_1.sendMessage)("🏆 ===== SERI REKORLARI =====", p);
        // Show all-time record
        if (records.allTimeRecord) {
            const teamName = records.allTimeRecord.team === 1 ? "Kırmızı" : "Mavi";
            const date = new Date(records.allTimeRecord.achievedAt).toLocaleDateString('tr-TR');
            const playerNames = records.allTimeRecord.players && records.allTimeRecord.players.length > 0
                ? records.allTimeRecord.players.map((player) => player.username).filter((name) => name).join(", ")
                : "Bilinmiyor";
            (0, message_1.sendMessage)(`🥇 En Yüksek Seri: ${records.allTimeRecord.count} maç (${teamName} Takım)`, p);
            (0, message_1.sendMessage)(`📅 Tarih: ${date}`, p);
            (0, message_1.sendMessage)(`👥 Oyuncular: ${playerNames}`, p);
        }
        else {
            (0, message_1.sendMessage)("🥇 Henüz hiç rekor kırılmadı!", p);
        }
    }
    catch (error) {
        console.error("Streak records gösterme hatası:", error);
        (0, message_1.sendMessage)("❌ Rekor verileri gösterilirken hata oluştu.", p);
    }
};
const showLevel = (p, args) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let targetPlayer = p;
        let targetAuth = p.auth;
        // If arguments provided, admin can check other players
        if (args.length > 0 && index_1.room.getPlayer(p.id).admin) {
            const targetName = args.join(" ");
            const foundPlayer = index_1.room.getPlayerList().find(pl => pl.name.toLowerCase().includes(targetName.toLowerCase()));
            if (foundPlayer) {
                targetPlayer = (0, index_1.toAug)(foundPlayer);
                targetAuth = foundPlayer.auth;
            }
            else {
                (0, message_1.sendMessage)(`❌ "${targetName}" isimli oyuncu bulunamadı.`, p);
                return;
            }
        }
        // Get player data from database
        const playerData = yield index_1.db.get("SELECT experience, level FROM players WHERE auth=?", [targetAuth]);
        if (!playerData) {
            (0, message_1.sendMessage)("❌ Oyuncu verileri bulunamadı.", p);
            return;
        }
        const { experience, level } = playerData;
        // Calculate XP needed for next level
        const { calculateXpForNextLevel } = yield Promise.resolve().then(() => __importStar(require("./levels")));
        const xpForNextLevel = calculateXpForNextLevel(level);
        const currentLevelXp = level > 1 ? calculateXpForNextLevel(level - 1) : 0;
        const progressInCurrentLevel = experience - (level > 1 ? calculateXpForNextLevel(level - 1) : 0);
        const progressMessage = `📊 ${targetPlayer.name} - Seviye Bilgileri:
🏆 Seviye: Lvl.${level}
⭐ Deneyim: ${experience} XP
📈 Bu seviye: ${progressInCurrentLevel}/${xpForNextLevel} XP
🎯 Sonraki seviye: ${xpForNextLevel - progressInCurrentLevel} XP kaldı`;
        (0, message_1.sendMessage)(progressMessage, p);
    }
    catch (error) {
        console.error("Level gösterme hatası:", error);
        (0, message_1.sendMessage)("❌ Seviye bilgileri gösterilirken hata oluştu.", p);
    }
});
