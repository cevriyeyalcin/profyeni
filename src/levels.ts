import { db, Game } from "..";

// Level system configuration
const BASE_XP_PER_LEVEL = 100; // XP needed for level 1 to 2
const XP_MULTIPLIER = 1.2; // Each level requires 20% more XP

// XP rewards
const WIN_XP = 50;
const LOSS_XP = 20;
const PARTICIPATION_XP = 10;

// Calculate XP needed for a specific level
const getXpNeededForLevel = (level: number): number => {
  if (level <= 1) return 0;
  let totalXp = 0;
  for (let i = 1; i < level; i++) {
    totalXp += Math.floor(BASE_XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, i - 1));
  }
  return totalXp;
};

// Calculate XP needed for next level from current XP
const getXpNeededForNextLevel = (currentLevel: number): number => {
  return Math.floor(BASE_XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, currentLevel - 1));
};

// Calculate level from total XP
const getLevelFromXp = (totalXp: number): number => {
  let level = 1;
  let xpForCurrentLevel = 0;
  
  while (xpForCurrentLevel <= totalXp) {
    xpForCurrentLevel += Math.floor(BASE_XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, level - 1));
    if (xpForCurrentLevel <= totalXp) {
      level++;
    }
  }
  
  return level;
};

interface LevelChange {
  id: number;
  auth: string;
  expGained: number;
  newExperience: number;
  newLevel: number;
  levelUp: boolean;
  expNeeded: number;
}

export const changeLevels = async (game: Game, winnerTeamId: TeamID): Promise<LevelChange[]> => {
  const holdPlayersWithStats = [];
  
  // Get current player stats from database
  for (const holdPlayer of game.holdPlayers) {
    const result = await db.get("SELECT experience, level FROM players WHERE auth=?", [
      holdPlayer.auth,
    ]);
    holdPlayersWithStats.push({
      ...holdPlayer, 
      experience: result?.experience || 0,
      level: result?.level || 1
    });
  }
  
  const loserTeamId = winnerTeamId == 1 ? 2 : 1;
  const winners = holdPlayersWithStats.filter(p => p.team == winnerTeamId);
  const losers = holdPlayersWithStats.filter(p => p.team == loserTeamId);
  
  const changeList: LevelChange[] = [];
  
  // Process winners
  for (const player of winners) {
    const expGained = WIN_XP + PARTICIPATION_XP;
    const newExperience = player.experience + expGained;
    const newLevel = getLevelFromXp(newExperience);
    const levelUp = newLevel > player.level;
    const expNeeded = getXpNeededForNextLevel(newLevel);
    
    changeList.push({
      id: player.id,
      auth: player.auth,
      expGained,
      newExperience,
      newLevel,
      levelUp,
      expNeeded
    });
    
    // Update database
    await db.run(`UPDATE players SET experience=?, level=? WHERE auth=?`, [
      newExperience, 
      newLevel, 
      player.auth
    ]);
  }
  
  // Process losers
  for (const player of losers) {
    const expGained = LOSS_XP + PARTICIPATION_XP;
    const newExperience = player.experience + expGained;
    const newLevel = getLevelFromXp(newExperience);
    const levelUp = newLevel > player.level;
    const expNeeded = getXpNeededForNextLevel(newLevel);
    
    changeList.push({
      id: player.id,
      auth: player.auth,
      expGained,
      newExperience,
      newLevel,
      levelUp,
      expNeeded
    });
    
    // Update database
    await db.run(`UPDATE players SET experience=?, level=? WHERE auth=?`, [
      newExperience, 
      newLevel, 
      player.auth
    ]);
  }
  
  return changeList;
};

// Helper functions for other parts of the system
export const calculateLevel = getLevelFromXp;
export const calculateXpForLevel = getXpNeededForLevel;
export const calculateXpForNextLevel = getXpNeededForNextLevel;