import { room, PlayerAugmented } from "../index";
import { blendColorsInt } from "./utils";
import { isPlayerMuted, isGlobalMuteActive } from "./command";
import { 
  detectProfanity, 
  detectLink, 
  detectShapedText, 
  detectBasicProfanity, 
  detectAdvancedProfanity, 
  detectDiscordMentions 
} from "./profanity";
import { isPlayerVip, getVipChatColor, getVipChatStyle } from "./vips";
import { getSlowModeEnabled, slowModeSettings } from "./settings";

// Helper function to extract real username from HaxBall formatted name
const extractRealUsername = (formattedName: string): string => {
  // HaxBall format: "[#ID] Username" - we want just "Username"
  const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
  return match ? match[1] : formattedName;
};

const percentage = (elo: number) => 1 / (1 + Math.E ** -((elo - 1200) / 100));

export const sendMessage = (
  msg: string,
  p?: PlayerAugmented | PlayerObject | null,
) => {
  if (p) {
    room.sendAnnouncement(`[PS] ${msg}`, p.id, 0xd6cedb, "small", 2);
  } else {
    room.sendAnnouncement(`[Server] ${msg}`, undefined, 0xd6cedb, "small", 0);
  }
};

export const playerMessage = async (p: PlayerAugmented, msg: string): Promise<boolean> => {
  // Extract real username without [#ID] format
  const realName = extractRealUsername(p.name);
  
  // Check if player is VIP and get their custom chat color and style
  const isVip = isPlayerVip(p.auth);
  const vipColor = getVipChatColor(p.auth); // PARAMETRELİ çağırım - eski çalışan sürüm
  const vipStyle = getVipChatStyle(p.auth) || 'normal';
  const vipPrefix = isVip ? "[🌟VIP] " : "";
  
  // Check if player is AFK (but allow spectators to chat even if marked AFK)
  const currentPlayer = room.getPlayer(p.id);
  if (p.afk && currentPlayer.team !== 0) { // Only block AFK players who are not spectators
    sendMessage(`AFK modundasın. Geri dönmek için "!back" yaz.`, p);
    return false;
  }
  
  // Check if player is muted
  if (await isPlayerMuted(p.auth)) {
    sendMessage("Susturuldun, konuşamazsın.", p);
    return false;
  }
  
  // Check global mute (admins can still talk)
  if (isGlobalMuteActive() && !room.getPlayer(p.id).admin) {
    sendMessage("Global susturma aktif. Sadece yöneticiler konuşabilir.", p);
    return false;
  }
  
  // Check slow mode (admins are not affected)
  const isAdmin = room.getPlayer(p.id).admin;
  if (getSlowModeEnabled() && !isAdmin) {
    const now = Date.now();
    const isVip = isPlayerVip(p.auth);
    
    // Determine cooldown based on user type
    let cooldownMs: number;
    if (isVip) {
      cooldownMs = slowModeSettings.vipUsers;
    } else {
      cooldownMs = slowModeSettings.normalUsers;
    }
    
    // Check if player is still in cooldown
    if (p.chatCooldownUntil > now) {
      const remainingSeconds = Math.ceil((p.chatCooldownUntil - now) / 1000);
      const userType = isVip ? "VIP" : "normal";
      const maxCooldown = Math.ceil(cooldownMs / 1000);
      sendMessage(`⏰ Yavaş mod aktif! ${userType} kullanıcı ${maxCooldown} saniyede bir mesaj atabilir. ${remainingSeconds} saniye bekle.`, p);
      return false;
    }
    
    // Set new cooldown
    p.lastChatTime = now;
    p.chatCooldownUntil = now + cooldownMs;
  }
  
  // Check for different types of violations
  const hasLink = detectLink(msg);
  const hasShapedText = detectShapedText(msg);
  const hasBasicProfanity = detectBasicProfanity(msg);
  const hasAdvancedProfanity = detectAdvancedProfanity(msg);
  const hasDiscordMentions = detectDiscordMentions(msg);
  
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
    } else if (hasShapedText) {
      violationType = "Şekilli Yazı";
      userMessage = `${realName}, ⚠️ Şekilli yazı göndermek yasaktır! (Sadece adminler görecek!)`;
      adminSuffix = "(Şekilli Yazı Şüphesi - Adminler Görecek)";
    } else if (hasBasicProfanity || hasAdvancedProfanity) {
      violationType = "Küfür";
      userMessage = `${realName}, ⚠️ Küfür göndermek yasaktır! (Sadece adminler görecek!)`;
      adminSuffix = "(Küfür Şüphesi - Adminler Görecek)";
    } else if (hasDiscordMentions) {
      violationType = "Discord Mention";
      userMessage = `${realName}, ⚠️ Discord etiketleri göndermek yasaktır! (Sadece adminler görecek!)`;
      adminSuffix = "(Discord Mention Şüphesi - Adminler Görecek)";
    }
    
    // If any violation detected, send to admins only with specific warning
    if (violationType) {
      const adminPlayers = room.getPlayerList().filter(player => player.admin);
      adminPlayers.forEach(admin => {
        room.sendAnnouncement(
          `[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg} ${adminSuffix}`,
          admin.id,
          0xFF6B6B, // Red color for violation warning
          "normal",
          1,
        );
      });
      
      // Send specific warning to the user
      room.sendAnnouncement(userMessage, p.id, 0xFF6B6B, "bold", 2);
      return false;
    }
  }
  
  // Determine chat color
  let chatColor: number;
  if (isAdmin) {
    chatColor = 0x00FF00; // Green for admins
  } else if (isVip && vipColor) {
    chatColor = parseInt(vipColor, 16); // Use VIP custom color - eski çalışan sürüm
  } else {
    chatColor = blendColorsInt(0x636363, 0xfff7f2, percentage(p.elo) * 100); // Default ELO-based color
  }
  
  // Determine text style - VIP users can have custom styles, others default to "normal"
  let textStyle: "normal" | "bold" | "italic" | "small" = "normal";
  if (isVip && vipStyle) {
    textStyle = vipStyle as "normal" | "bold" | "italic" | "small";
  }
  
  // If global mute is active, only send to admins
  if (isGlobalMuteActive()) {
    const adminPlayers = room.getPlayerList().filter(player => player.admin);
    adminPlayers.forEach(admin => {
      room.sendAnnouncement(
        `[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg}`,
        admin.id,
        chatColor,
        textStyle,
        1,
      );
    });
  } else {
    // Normal message to everyone
    room.sendAnnouncement(
      `[${p.elo}] ${isAdmin ? '[ADMIN] ' : ''}${vipPrefix}${card}${realName}: ${msg}`,
      undefined,
      chatColor,
      textStyle,
      1,
    );
  }
  
  return true;
};

export const Discordinterval = () => {
  setInterval(() => {
    sendMessage("🎮 Haxball Odası | Discord: discord.gg/profstrikers");
  }, 5 * 60 * 1000); // 5 dakikada bir
};