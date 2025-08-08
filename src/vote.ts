import { sendMessage } from "./message";
import { room, PlayerAugmented, toAug } from "../index";
import { addBan, removeBan, getBan } from "./db";
import { isPlayerVip } from "./vips";

// Vote ban system interfaces
export interface VoteBanData {
  targetAuth: string;
  targetName: string;
  targetId: number;
  votes: Map<string, number>; // auth codes of voters -> vote weight (1 for normal, 2 for VIP)
  createdAt: number; // timestamp
}

// Store active vote sessions
const activeVotes = new Map<string, VoteBanData>(); // key: targetAuth, value: VoteBanData

// Helper function to find player by ID
const findPlayerById = (id: number): PlayerAugmented | null => {
  const player = room.getPlayer(id);
  if (!player) return null;
  try {
    return toAug(player);
  } catch {
    return null;
  }
};

// Vote ban system implementation
export const handleVoteBan = (p: PlayerAugmented, args: string[]) => {
  // Check if player is in a team (not spectator)
  if (p.team === 0) {
    sendMessage("❌ İzleyiciler oylama yapamaz. Takıma geçin.", p);
    return;
  }
  
  // Check if room has minimum 6 players
  const totalPlayers = room.getPlayerList().length;
  if (totalPlayers < 6) {
    sendMessage("❌ Oylama için odada en az 6 kişi olmalı.", p);
    return;
  }
  
  // Check if player has been in room for at least 5 minutes
  const playtimeMinutes = (Date.now() - p.joinTime) / (1000 * 60);
  if (playtimeMinutes < 5) {
    const remainingMinutes = Math.ceil(5 - playtimeMinutes);
    sendMessage(`❌ Oylama için en az 5 dakika oyunda bulunmalısınız. Kalan süre: ${remainingMinutes} dakika.`, p);
    return;
  }
  
  if (args.length < 1) {
    sendMessage("Kullanım: !oyla <ID>", p);
    sendMessage("Örnek: !oyla 5", p);
    return;
  }
  
  const targetId = parseInt(args[0]);
  if (isNaN(targetId)) {
    sendMessage("❌ Geçersiz oyuncu ID'si.", p);
    return;
  }
  
  // Find target player
  const targetPlayer = findPlayerById(targetId);
  if (!targetPlayer) {
    sendMessage("❌ Bu ID ile oyuncu bulunamadı.", p);
    return;
  }
  
  // Can't vote for yourself
  if (targetPlayer.auth === p.auth) {
    sendMessage("❌ Kendinize oy veremezsiniz.", p);
    return;
  }
  
  // Can't vote for admins
  if (room.getPlayer(targetPlayer.id).admin) {
    sendMessage("❌ Yöneticilere oy verilemez.", p);
    return;
  }
  
  // Can't vote for spectators
  if (targetPlayer.team === 0) {
    sendMessage("❌ İzleyicilere oy verilemez.", p);
    return;
  }
  
  // Check if target is already banned
  getBan(targetPlayer.auth).then(existingBan => {
    if (existingBan) {
      sendMessage("❌ Bu oyuncu zaten banlanmış.", p);
      return;
    }
    
    // Get or create vote session
    let voteData = activeVotes.get(targetPlayer.auth);
    if (!voteData) {
      voteData = {
        targetAuth: targetPlayer.auth,
        targetName: targetPlayer.name,
        targetId: targetPlayer.id,
        votes: new Map<string, number>(),
        createdAt: Date.now()
      };
      activeVotes.set(targetPlayer.auth, voteData);
    }
    
    // Check if player already voted
    if (voteData.votes.has(p.auth)) {
      sendMessage("❌ Bu oyuncuya zaten oy verdiniz.", p);
      return;
    }
    
    // Add vote (VIP votes count as 2, normal votes count as 1)
    const voteWeight = isPlayerVip(p.auth) ? 2 : 1;
    voteData.votes.set(p.auth, voteWeight);
    
    // Calculate total votes
    let totalVotes = 0;
    for (const weight of voteData.votes.values()) {
      totalVotes += weight;
    }
    
    const requiredVotes = 5;
    const percentage = Math.min(100, Math.round((totalVotes / requiredVotes) * 100));
    
    // Calculate remaining time
    const elapsedTime = Date.now() - voteData.createdAt;
    const remainingTime = (10 * 60 * 1000) - elapsedTime; // 10 minutes
    const minutes = Math.floor(remainingTime / (60 * 1000));
    const seconds = Math.floor((remainingTime % (60 * 1000)) / 1000);
    
    const extractRealUsername = (formattedName: string) => {
      const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
      return match ? match[1] : formattedName;
    };
    
    // Announce vote (without showing voter name)
    room.sendAnnouncement(
      `${extractRealUsername(targetPlayer.name)}(#${targetPlayer.id}) adlı oyuncu için ${totalVotes} oy toplandı. Gerekli oy: ${requiredVotes}. Oylama devam ediyor. (${percentage}%) Kalan Süre: ${minutes}dk ${seconds}sn`,
      undefined,
      0xFFFF00,
      "bold",
      2
    );
    
    // Check if enough votes (5)
    if (totalVotes >= requiredVotes) {
      // Update target data with current info before executing ban
      voteData.targetId = targetPlayer.id;
      voteData.targetName = targetPlayer.name;
      
      // Execute ban
      executeBanByVote(voteData);
      // Remove vote session
      activeVotes.delete(targetPlayer.auth);
    }
  }).catch(error => {
    console.error("Vote ban check error:", error);
    sendMessage("❌ Oylama işleminde hata oluştu.", p);
  });
};

const executeBanByVote = async (voteData: VoteBanData) => {
  try {
    const banData = {
      playerId: voteData.targetId,
      playerName: voteData.targetName,
      auth: voteData.targetAuth,
      reason: "Oylama Sonucu",
      bannedBy: "Sistem (Oylama)"
    };
    
    // Add 24-hour ban
    await addBan(banData);
    
    // Kick player immediately
    const targetPlayer = room.getPlayerList().find(p => {
      try {
        return toAug(p).auth === voteData.targetAuth;
      } catch {
        return false;
      }
    });
    if (targetPlayer) {
      console.log(`Kicking player ${targetPlayer.name} (ID: ${targetPlayer.id})`);
      room.kickPlayer(targetPlayer.id, "Oylama Sonucu 24 Saat Uzaklaştırıldınız | discord.gg/profstriker", false);
    } else {
      console.log(`Target player with auth ${voteData.targetAuth} not found online`);
    }
    
    // Announce ban after kick
    room.sendAnnouncement(
      `🚫 ${voteData.targetName} oylama sonucu 24 saat banlandı!`,
      undefined,
      0xFF4040,
      "bold",
      2
    );
    
    // Schedule unban after 24 hours
    setTimeout(async () => {
      try {
        await removeBan(voteData.targetAuth);
        console.log(`Auto-unbanned ${voteData.targetName} after 24 hours`);
      } catch (error) {
        console.error("Auto-unban error:", error);
      }
    }, 24 * 60 * 60 * 1000); // 24 hours in milliseconds
    
  } catch (error) {
    console.error("Execute ban by vote error:", error);
  }
};

// Cleanup expired votes (10 minutes)
const cleanupExpiredVotes = () => {
  const now = Date.now();
  const VOTE_EXPIRY_TIME = 10 * 60 * 1000; // 10 minutes
  
  for (const [targetAuth, voteData] of activeVotes.entries()) {
    if (now - voteData.createdAt > VOTE_EXPIRY_TIME) {
      activeVotes.delete(targetAuth);
      console.log(`Cleaned up expired vote session for ${voteData.targetName}`);
    }
  }
};

// Run cleanup every minute
setInterval(cleanupExpiredVotes, 60 * 1000);

// Export for external use
export { cleanupExpiredVotes, activeVotes };