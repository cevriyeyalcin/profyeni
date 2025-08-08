"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Discordinterval = exports.playerMessage = exports.sendMessage = void 0;
const index_1 = require("../index");
const utils_1 = require("./utils");
const command_1 = require("./command");
const profanity_1 = require("./profanity");
const vips_1 = require("./vips");
const settings_1 = require("./settings");
// Helper function to extract real username from HaxBall formatted name
const extractRealUsername = (formattedName) => {
    // HaxBall format: "[#ID] Username" - we want just "Username"
    const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
    return match ? match[1] : formattedName;
};
const percentage = (elo) => 1 / (1 + Math.E ** -((elo - 1200) / 100));
const sendMessage = (msg, p) => {
    if (p) {
        index_1.room.sendAnnouncement(`[PS] ${msg}`, p.id, 0xd6cedb, "small", 2);
    }
    else {
        index_1.room.sendAnnouncement(`[Server] ${msg}`, undefined, 0xd6cedb, "small", 0);
    }
};
exports.sendMessage = sendMessage;
const playerMessage = (p, msg) => __awaiter(void 0, void 0, void 0, function* () {
    // Extract real username without [#ID] format
    const realName = extractRealUsername(p.name);
    // Check if player is VIP and get their custom chat color and style
    const isVip = (0, vips_1.isPlayerVip)(p.auth);
    const vipColor = (0, vips_1.getVipChatColor)(p.auth); // PARAMETRELİ çağırım - eski çalışan sürüm
    const vipStyle = (0, vips_1.getVipChatStyle)(p.auth) || 'normal';
    const vipPrefix = isVip ? "[🌟VIP] " : "";
    // Check if player is AFK (but allow spectators to chat even if marked AFK)
    const currentPlayer = index_1.room.getPlayer(p.id);
    if (p.afk && currentPlayer.team !== 0) { // Only block AFK players who are not spectators
        (0, exports.sendMessage)(`AFK modundasın. Geri dönmek için "!back" yaz.`, p);
        return false;
    }
    // Check if player is muted
    if (yield (0, command_1.isPlayerMuted)(p.auth)) {
        (0, exports.sendMessage)("Susturuldun, konuşamazsın.", p);
        return false;
    }
    // Check global mute (admins can still talk)
    if ((0, command_1.isGlobalMuteActive)() && !index_1.room.getPlayer(p.id).admin) {
        (0, exports.sendMessage)("Global susturma aktif. Sadece yöneticiler konuşabilir.", p);
        return false;
    }
    // Check slow mode (admins are not affected)
    const isAdmin = index_1.room.getPlayer(p.id).admin;
    if ((0, settings_1.getSlowModeEnabled)() && !isAdmin) {
        const now = Date.now();
        const isVip = (0, vips_1.isPlayerVip)(p.auth);
        // Determine cooldown based on user type
        let cooldownMs;
        if (isVip) {
            cooldownMs = settings_1.slowModeSettings.vipUsers;
        }
        else {
            cooldownMs = settings_1.slowModeSettings.normalUsers;
        }
        // Check if player is still in cooldown
        if (p.chatCooldownUntil > now) {
            const remainingSeconds = Math.ceil((p.chatCooldownUntil - now) / 1000);
            const userType = isVip ? "VIP" : "normal";
            const maxCooldown = Math.ceil(cooldownMs / 1000);
            (0, exports.sendMessage)(`⏰ Yavaş mod aktif! ${userType} kullanıcı ${maxCooldown} saniyede bir mesaj atabilir. ${remainingSeconds} saniye bekle.`, p);
            return false;
        }
        // Set new cooldown
        p.lastChatTime = now;
        p.chatCooldownUntil = now + cooldownMs;
    }
    // Check for different types of violations
    const hasLink = (0, profanity_1.detectLink)(msg);
    const hasShapedText = (0, profanity_1.detectShapedText)(msg);
    const hasBasicProfanity = (0, profanity_1.detectBasicProfanity)(msg);
    const hasAdvancedProfanity = (0, profanity_1.detectAdvancedProfanity)(msg);
    const hasDiscordMentions = (0, profanity_1.detectDiscordMentions)(msg);
    const card = p.cardsAnnounced < 1 ? `` : p.cardsAnnounced < 2 ? `🟨 ` : `🟥 `;
    // Handle different violation types with specific messages
    if (!isAdmin) {
        let violationType = "";
        let userMessage = "";
        let adminSuffix = "";
        if (hasLink) {
            violationType = "Link";
            userMessage = `${realName}, ⚠️ Link göndermek yasaktır! (Sadece adminler görecek!)`;
            adminSuffix = "(Link Şüphesi - Adminler Görecek)";
        }
        else if (hasShapedText) {
            violationType = "Şekilli Yazı";
            userMessage = `${realName}, ⚠️ Şekilli yazı göndermek yasaktır! (Sadece adminler görecek!)`;
            adminSuffix = "(Şekilli Yazı Şüphesi - Adminler Görecek)";
        }
        else if (hasBasicProfanity || hasAdvancedProfanity) {
            violationType = "Küfür";
            userMessage = `${realName}, ⚠️ Küfür göndermek yasaktır! (Sadece adminler görecek!)`;
            adminSuffix = "(Küfür Şüphesi - Adminler Görecek)";
        }
        else if (hasDiscordMentions) {
            violationType = "Discord Mention";
            userMessage = `${realName}, ⚠️ Discord etiketleri göndermek yasaktır! (Sadece adminler görecek!)`;
            adminSuffix = "(Discord Mention Şüphesi - Adminler Görecek)";
        }
        // If any violation detected, send to admins only with specific warning
        if (violationType) {
            const adminPlayers = index_1.room.getPlayerList().filter(player => player.admin);
            adminPlayers.forEach(admin => {
                index_1.room.sendAnnouncement(`[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg} ${adminSuffix}`, admin.id, 0xFF6B6B, // Red color for violation warning
                "normal", 1);
            });
            // Send specific warning to the user
            index_1.room.sendAnnouncement(userMessage, p.id, 0xFF6B6B, "bold", 2);
            return false;
        }
    }
    // Determine chat color
    let chatColor;
    if (isAdmin) {
        chatColor = 0x00FF00; // Green for admins
    }
    else if (isVip && vipColor) {
        chatColor = parseInt(vipColor, 16); // Use VIP custom color - eski çalışan sürüm
    }
    else {
        chatColor = (0, utils_1.blendColorsInt)(0x636363, 0xfff7f2, percentage(p.elo) * 100); // Default ELO-based color
    }
    // Determine text style - VIP users can have custom styles, others default to "normal"
    let textStyle = "normal";
    if (isVip && vipStyle) {
        textStyle = vipStyle;
    }
    // If global mute is active, only send to admins
    if ((0, command_1.isGlobalMuteActive)()) {
        const adminPlayers = index_1.room.getPlayerList().filter(player => player.admin);
        adminPlayers.forEach(admin => {
            index_1.room.sendAnnouncement(`[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg}`, admin.id, chatColor, textStyle, 1);
        });
    }
    else {
        // Normal message to everyone
        index_1.room.sendAnnouncement(`[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg}`, undefined, chatColor, textStyle, 1);
    }
    return true;
});
exports.playerMessage = playerMessage;
const Discordinterval = () => {
    setInterval(() => {
        (0, exports.sendMessage)("🎮 Haxball Odası | Discord: discord.gg/profstrikers");
    }, 5 * 60 * 1000); // 5 dakikada bir
};
exports.Discordinterval = Discordinterval;
