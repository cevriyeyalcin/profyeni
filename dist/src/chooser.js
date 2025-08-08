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
const elo_1 = require("./elo");
/* This manages teams and players depending
 * on being during ranked game or draft phase. */
const maxTeamSize = process.env.DEBUG ? 1 : settings_1.teamSize;
let isRunning = false;
let isRanked = false;
exports.duringDraft = false;
let changeDuringDraft = (m) => (exports.duringDraft = m);
exports.changeDuringDraft = changeDuringDraft;
const balanceTeams = () => {
    if (exports.duringDraft || isRanked) {
        return;
    }
    // To be used only during unranked
    if (red().length > blue().length + 1) {
        __1.room.setPlayerTeam(red()[0].id, 2);
    }
    else if (red().length + 1 < blue().length) {
        __1.room.setPlayerTeam(blue()[0].id, 1);
    }
};
const handlePlayerLeaveOrAFK = () => __awaiter(void 0, void 0, void 0, function* () {
    if (__1.players.filter((p) => !p.afk).length < 1) {
        __1.room.stopGame();
        (0, utils_1.sleep)(5000); // this is important to cancel all ongoing animations when match stops
        __1.room.startGame();
    }
    yield (0, utils_1.sleep)(100);
    if (!exports.duringDraft && !isRanked) {
        balanceTeams();
    }
    if (isRanked && !process.env.DEBUG) {
        if ([...red(), ...blue()].length <= 2) {
            isRanked = false;
            (0, message_1.sendMessage)("Yalnızca 2 oyuncu kaldı. Sıralamalı oyun iptal ediliyor.");
        }
    }
});
exports.handlePlayerLeaveOrAFK = handlePlayerLeaveOrAFK;
const handleWin = (game, winnerTeamId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const changes = yield (0, elo_1.changeElo)(game, winnerTeamId);
        changes.forEach((co) => {
            const p = __1.room.getPlayer(co.id);
            if (p) {
                (0, message_1.sendMessage)(`Your ELO: ${(0, __3.toAug)(p).elo} → ${(0, __3.toAug)(p).elo + co.change} (${co.change > 0 ? "+" : ""}${co.change})`, p);
            }
        });
        changes.forEach((co) => {
            if (__1.players.map((p) => p.id).includes(co.id)) {
                const pp = __1.room.getPlayer(co.id);
                if (pp) {
                    (0, __3.toAug)(pp).elo += co.change;
                } // change elo on server just for showing in chat. when running two instances of the server, this may be not accurate, although it is always accurate in DB (because the changes and calculations are always based on DB data, not on in game elo. false elo will be corrected on reconnect.)
            }
        });
    }
    catch (e) {
        console.log("Error during handling ELO:", e);
    }
});
const red = () => __1.room.getPlayerList().filter((p) => p.team == 1);
const blue = () => __1.room.getPlayerList().filter((p) => p.team == 2);
const spec = () => __1.room.getPlayerList().filter((p) => p.team == 0);
const both = () => __1.room.getPlayerList().filter((p) => p.team == 1 || p.team == 2);
const ready = () => __1.room.getPlayerList().filter((p) => !(0, __3.toAug)(p).afk);
const addToGame = (room, p) => {
    if (__2.game && isRanked && [...red(), ...blue()].length <= maxTeamSize * 2) {
        return;
    }
    if (__2.game && ((0, __3.toAug)(p).cardsAnnounced >= 2 || (0, __3.toAug)(p).foulsMeter >= 2)) {
        return;
    }
    if (exports.duringDraft) {
        return;
    }
    if (red().length > blue().length) {
        room.setPlayerTeam(p.id, 2);
    }
    else {
        room.setPlayerTeam(p.id, 1);
    }
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
        if (isRanked) {
            if (!__2.game) {
                return;
            }
            yield handleWin(__2.game, winTeam);
        }
        (0, message_1.sendMessage)("Break time: 10 seconds.");
        yield (0, utils_1.sleep)(10000);
        // Auto-assign balanced teams based on ELO when enough players are ready
        if (ready().length >= maxTeamSize * 2) {
            const rd = ready();
            // Build balanced teams
            const sorted = rd
                .slice(0)
                .sort((a, b) => (0, __3.toAug)(b).elo - (0, __3.toAug)(a).elo)
                .slice(0, maxTeamSize * 2);
            const redTeam = [];
            const blueTeam = [];
            let redElo = 0;
            let blueElo = 0;
            for (const p of sorted) {
                const pElo = (0, __3.toAug)(p).elo;
                if ((redTeam.length < maxTeamSize && redElo <= blueElo) ||
                    blueTeam.length >= maxTeamSize) {
                    redTeam.push(p);
                    redElo += pElo;
                }
                else {
                    blueTeam.push(p);
                    blueElo += pElo;
                }
            }
            // Clear any existing team assignments and apply new teams
            room.getPlayerList().forEach((p) => {
                if (p.team != 0) {
                    room.setPlayerTeam(p.id, 0);
                }
            });
            redTeam.forEach((p) => room.setPlayerTeam(p.id, 1));
            blueTeam.forEach((p) => room.setPlayerTeam(p.id, 2));
            if (redTeam.length == maxTeamSize && blueTeam.length == maxTeamSize) {
                isRanked = true;
                (0, message_1.sendMessage)("Ranked game.");
            }
            else {
                (0, message_1.sendMessage)("Unranked game.");
                isRanked = false;
                refill();
            }
        }
        else {
            isRanked = false;
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
        }
        room.startGame();
    });
};
exports.default = initChooser;
