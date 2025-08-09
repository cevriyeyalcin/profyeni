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
exports.calculateXpForNextLevel = exports.calculateXpForLevel = exports.calculateLevel = exports.changeLevels = void 0;
const __1 = require("..");
// Level system configuration
const BASE_XP_PER_LEVEL = 100; // XP needed for level 1 to 2
const XP_MULTIPLIER = 1.2; // Each level requires 20% more XP
// XP rewards
const WIN_XP = 50;
const LOSS_XP = 20;
const PARTICIPATION_XP = 10;
// Calculate XP needed for a specific level
const getXpNeededForLevel = (level) => {
    if (level <= 1)
        return 0;
    let totalXp = 0;
    for (let i = 1; i < level; i++) {
        totalXp += Math.floor(BASE_XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, i - 1));
    }
    return totalXp;
};
// Calculate XP needed for next level from current XP
const getXpNeededForNextLevel = (currentLevel) => {
    return Math.floor(BASE_XP_PER_LEVEL * Math.pow(XP_MULTIPLIER, currentLevel - 1));
};
// Calculate level from total XP
const getLevelFromXp = (totalXp) => {
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
const changeLevels = (game, winnerTeamId) => __awaiter(void 0, void 0, void 0, function* () {
    const holdPlayersWithStats = [];
    // Get current player stats from database
    for (const holdPlayer of game.holdPlayers) {
        const result = yield __1.db.get("SELECT experience, level FROM players WHERE auth=?", [
            holdPlayer.auth,
        ]);
        holdPlayersWithStats.push(Object.assign(Object.assign({}, holdPlayer), { experience: (result === null || result === void 0 ? void 0 : result.experience) || 0, level: (result === null || result === void 0 ? void 0 : result.level) || 1 }));
    }
    const loserTeamId = winnerTeamId == 1 ? 2 : 1;
    const winners = holdPlayersWithStats.filter(p => p.team == winnerTeamId);
    const losers = holdPlayersWithStats.filter(p => p.team == loserTeamId);
    const changeList = [];
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
        yield __1.db.run(`UPDATE players SET experience=?, level=? WHERE auth=?`, [
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
        yield __1.db.run(`UPDATE players SET experience=?, level=? WHERE auth=?`, [
            newExperience,
            newLevel,
            player.auth
        ]);
    }
    return changeList;
});
exports.changeLevels = changeLevels;
// Helper functions for other parts of the system
exports.calculateLevel = getLevelFromXp;
exports.calculateXpForLevel = getXpNeededForLevel;
exports.calculateXpForNextLevel = getXpNeededForNextLevel;
