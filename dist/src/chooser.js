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
exports.addToGame = exports.handlePlayerLeaveOrAFK = exports.changeDuringDraft = exports.duringDraft = void 0;
const __1 = require("..");
const message_1 = require("./message");
const __2 = require("..");
const utils_1 = require("./utils");
const __3 = require("..");
const settings_1 = require("./settings");
const levels_1 = require("./levels");
const teamChooser_1 = require("./teamChooser");
/* This manages teams and players depending
 * on being during ranked game or draft phase. */
const maxTeamSize = process.env.DEBUG ? 1 : settings_1.teamSize;
let isRunning = false;
// All games are now unranked with level progression
let isRanked = false;
exports.duringDraft = false;
let changeDuringDraft = (m) => (exports.duringDraft = m);
exports.changeDuringDraft = changeDuringDraft;
const balanceTeams = () => {
    if (exports.duringDraft) {
        return;
    }
    // Balance teams by moving players to maintain equal numbers
    if (red().length > blue().length + 1) {
        __1.room.setPlayerTeam(red()[0].id, 2);
    }
    else if (red().length + 1 < blue().length) {
        __1.room.setPlayerTeam(blue()[0].id, 1);
    }
};
const handlePlayerLeaveOrAFK = (leftPlayer) => __awaiter(void 0, void 0, void 0, function* () {
    // Handle team chooser if a player left
    if (leftPlayer) {
        (0, teamChooser_1.handlePlayerLeave)(leftPlayer);
    }
    if (__1.players.filter((p) => !p.afk).length < 1) {
        __1.room.stopGame();
        (0, utils_1.sleep)(5000); // this is important to cancel all ongoing animations when match stops
        __1.room.startGame();
    }
    yield (0, utils_1.sleep)(100);
    if (!exports.duringDraft) {
        // First try auto-balance (to spectators) for team chooser system
        const autoBalanced = (0, teamChooser_1.checkAndAutoBalance)();
        // If no auto-balance occurred, use traditional balance (between teams)
        if (!autoBalanced) {
            balanceTeams();
        }
        // Check if waiting message should be shown after balancing
        setTimeout(() => {
            (0, teamChooser_1.checkAndShowWaitingMessage)();
        }, 500);
    }
});
exports.handlePlayerLeaveOrAFK = handlePlayerLeaveOrAFK;
const handleWin = (game, winnerTeamId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const changes = yield (0, levels_1.changeLevels)(game, winnerTeamId);
        changes.forEach((co) => {
            const p = __1.room.getPlayer(co.id);
            if (p) {
                const playerAug = (0, __3.toAug)(p);
                if (co.levelUp) {
                    (0, message_1.sendMessage)(`🎉 Level Up! ${playerAug.name} → Lvl.${co.newLevel} (+${co.expGained} XP)`, null);
                    (0, message_1.sendMessage)(`Your Level: Lvl.${playerAug.level} → Lvl.${co.newLevel} (+${co.expGained} XP)`, p);
                }
                else {
                    (0, message_1.sendMessage)(`XP Gained: +${co.expGained} (${playerAug.experience}/${co.expNeeded} to Lvl.${playerAug.level + 1})`, p);
                }
            }
        });
        changes.forEach((co) => {
            if (__1.players.map((p) => p.id).includes(co.id)) {
                const pp = __1.room.getPlayer(co.id);
                if (pp) {
                    const playerAug = (0, __3.toAug)(pp);
                    playerAug.experience = co.newExperience;
                    playerAug.level = co.newLevel;
                }
            }
        });
    }
    catch (e) {
        console.log("Error during handling levels:", e);
    }
});
const red = () => __1.room.getPlayerList().filter((p) => p.team == 1);
const blue = () => __1.room.getPlayerList().filter((p) => p.team == 2);
const spec = () => __1.room.getPlayerList().filter((p) => p.team == 0);
const both = () => __1.room.getPlayerList().filter((p) => p.team == 1 || p.team == 2);
const ready = () => __1.room.getPlayerList().filter((p) => !(0, __3.toAug)(p).afk);
const addToGame = (room, p) => {
    if (__2.game && ((0, __3.toAug)(p).cardsAnnounced >= 2 || (0, __3.toAug)(p).foulsMeter >= 2)) {
        return;
    }
    if (exports.duringDraft) {
        return;
    }
    // Only assign first 2 players to teams (1 red, 1 blue)
    // All other players stay as spectators for team chooser system
    const redCount = red().length;
    const blueCount = blue().length;
    const totalTeamPlayers = redCount + blueCount;
    if (totalTeamPlayers === 0) {
        // First player goes to red team
        room.setPlayerTeam(p.id, 1);
    }
    else if (totalTeamPlayers === 1 && redCount === 1 && blueCount === 0) {
        // Second player goes to blue team
        room.setPlayerTeam(p.id, 2);
    }
    // All subsequent players (3rd, 4th, 5th...) stay as spectators (team 0)
    // They will be chosen by teams using the team chooser system
    // Check if we should show the waiting message
    // Use a longer delay to allow validation checks to complete first
    setTimeout(() => {
        (0, teamChooser_1.checkAndShowWaitingMessage)();
    }, 500); // Longer delay to ensure validation checks complete first
};
exports.addToGame = addToGame;
const initChooser = (room) => {
    const refill = () => {
        const specs = spec().filter((p) => !(0, __3.toAug)(p).afk);
        for (let i = 0; i < specs.length; i++) {
            const toTeam = i % 2 == 0 ? 1 : 2;
            room.setPlayerTeam(specs[i].id, toTeam);
        }
    };
    const isEnoughPlayers = () => ready().length >= maxTeamSize * 2;
    if (room.getScores()) {
        isRunning = true;
    }
    const _onTeamGoal = room.onTeamGoal;
    room.onTeamGoal = (team) => {
        if (__2.game) {
            __2.game.inPlay = false;
            __2.game.animation = true;
            __2.game.boostCount = 0;
            __2.game.ballRotation.power = 0;
            __2.game.positionsDuringPass = [];
            __1.players.forEach((p) => (p.canCallFoulUntil = 0));
            __2.game.eventCounter += 1;
            if (isRanked && !exports.duringDraft) {
                const evC = __2.game.eventCounter;
                const gameId = __2.game.id;
                const dirKick = team == 1 ? -1 : 1;
                setTimeout(() => {
                    var _a, _b;
                    if (((_a = room.getBallPosition()) === null || _a === void 0 ? void 0 : _a.x) == 0 &&
                        ((_b = room.getBallPosition()) === null || _b === void 0 ? void 0 : _b.y) == 0 &&
                        (__2.game === null || __2.game === void 0 ? void 0 : __2.game.eventCounter) == evC &&
                        (__2.game === null || __2.game === void 0 ? void 0 : __2.game.id) == gameId) {
                        room.setDiscProperties(0, {
                            xspeed: dirKick * 2,
                            yspeed: Math.random(),
                        });
                        (0, message_1.sendMessage)("Ball was not touched for 35 seconds, therefore it is moved automatically.");
                    }
                }, 35000);
            }
        }
        _onTeamGoal(team);
    };
    const _onTeamVictory = room.onTeamVictory;
    room.onTeamVictory = (scores) => __awaiter(void 0, void 0, void 0, function* () {
        if (exports.duringDraft) {
            return;
        }
        if (_onTeamVictory) {
            _onTeamVictory(scores);
        }
        const winTeam = scores.red > scores.blue ? 1 : 2;
        const loseTeam = scores.red > scores.blue ? 2 : 1;
        // Always handle level progression for all games
        if (!__2.game) {
            return;
        }
        yield handleWin(__2.game, winTeam);
        (0, message_1.sendMessage)("Break time: 10 seconds.");
        yield (0, utils_1.sleep)(10000);
        // Simple team balancing - no more draft system
        isRanked = false; // All games are unranked with level progression
        let i = 0;
        ready().forEach((p) => {
            if (i % 2) {
                room.setPlayerTeam(p.id, 2);
            }
            else {
                room.setPlayerTeam(p.id, 1);
            }
            i++;
        });
        (0, message_1.sendMessage)("New game starting with level progression!");
        room.startGame();
    });
};
exports.default = initChooser;
