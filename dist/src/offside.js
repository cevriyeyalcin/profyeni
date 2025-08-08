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
exports.handleLastTouch = void 0;
const index_1 = require("../index");
const message_1 = require("./message");
const utils_1 = require("./utils");
const settings_1 = require("./settings");
const out_1 = require("./out");
const chooser_1 = require("./chooser");
const handleLastTouch = (game, p) => __awaiter(void 0, void 0, void 0, function* () {
    if (game.inPlay) {
        if (game.skipOffsideCheck) {
            game.skipOffsideCheck = false;
        }
        else {
            checkOffside(game, p);
        }
    }
    // moved to index.ts different logic (more distance)
    //if (game.lastKick?.team !== p.team && game.inPlay) {
    //  game.boostCount = 0;
    //  game.lastKick = null;
    //  setBallInvMassAndColor(game);
    //}
    savePositionsOnTouch(game);
    const ballPos = index_1.room.getBallPosition();
    if (!game.lastTouch || p.id !== game.lastTouch.byPlayer.id) {
        game.previousTouch = game.lastTouch;
        game.lastTouch = { byPlayer: p, x: ballPos.x, y: ballPos.y };
    }
});
exports.handleLastTouch = handleLastTouch;
const savePositionsOnTouch = (game) => {
    const positions = index_1.room.getPlayerList().filter((p) => p.team != 0);
    game.positionsDuringPass = positions;
};
const checkOffside = (game, p) => __awaiter(void 0, void 0, void 0, function* () {
    // Check if offside system is enabled
    if (!(0, settings_1.getOffsideEnabled)()) {
        return;
    }
    const lt = game.lastTouch;
    const currentGameId = game.id;
    if (!lt) {
        return;
    }
    const kickTeam = lt === null || lt === void 0 ? void 0 : lt.byPlayer.team;
    if (kickTeam != p.team) {
        return;
    }
    if (p.id == (lt === null || lt === void 0 ? void 0 : lt.byPlayer.id)) {
        return;
    }
    const receiverDuringPass = game.positionsDuringPass.find((pp) => pp.id == p.id);
    if (!receiverDuringPass) {
        return;
    }
    const atkDirection = p.team == 1 ? 1 : -1;
    if (atkDirection * receiverDuringPass.position.x < 0) {
        return; // receiver in his starting half during pass
    }
    const receiverPosNow = index_1.room.getPlayerDiscProperties(p.id);
    const enemies = game.positionsDuringPass.filter((pp) => pp.team != kickTeam);
    const defenders = enemies.filter((pp) => atkDirection * pp.position.x >
        atkDirection * receiverDuringPass.position.x);
    if (enemies.length < 1) {
        return;
    }
    if (defenders.length >= 1) { // En az 1 oyuncu önümde olmalı
        return; // ofsayt yok
    }
    if (!game.inPlay) {
        return;
    }
    if (atkDirection * receiverDuringPass.position.x < atkDirection * lt.x) {
        return;
    }
    if (index_1.room.getPlayerList().filter((p) => p.team != 0).length <= 6) {
        (0, message_1.sendMessage)("❌🚩 Altıdan az kişi bulunduğu için ofsayt yok.");
        return;
    }
    // its offside
    game.inPlay = false;
    game.eventCounter += 1;
    (0, message_1.sendMessage)("🚩 Ofsayt!");
    const osPlace = receiverDuringPass.position;
    const allPosNow = index_1.room.getPlayerList().filter((p) => p.team != 0);
    const ballNow = index_1.room.getBallPosition();
    // Rewind and show lines
    game.positionsDuringPass.forEach((p) => index_1.room.setPlayerDiscProperties(p.id, Object.assign(Object.assign({}, p.position), { xspeed: 0, yspeed: 0 })));
    index_1.room.setDiscProperties(0, {
        x: lt.x,
        y: lt.y,
        xspeed: 0,
        yspeed: 0,
        ygravity: 0,
        xgravity: 0,
    });
    let colorOffsideDiscs = settings_1.offsideDiscs.red;
    let colorLastDefDiscs = settings_1.offsideDiscs.blue;
    if (lt.byPlayer.team == 2) {
        colorOffsideDiscs = settings_1.offsideDiscs.blue;
        colorLastDefDiscs = settings_1.offsideDiscs.red;
    }
    const enemiesWithBall = [
        ...enemies,
        { id: "ball", position: { x: lt.x, y: lt.y } },
    ];
    const secondOsLine = enemiesWithBall.sort((a, b) => atkDirection * b.position.x - atkDirection * a.position.x)[1];
    const secondOsRadius = secondOsLine.id == "ball" ? settings_1.defaults.ballRadius : settings_1.defaults.playerRadius;
    index_1.room.setDiscProperties(colorOffsideDiscs[0], {
        x: osPlace.x + atkDirection * (settings_1.defaults.playerRadius + 1),
        y: settings_1.mapBounds.y + 100,
    });
    index_1.room.setDiscProperties(colorOffsideDiscs[1], {
        x: osPlace.x + atkDirection * (settings_1.defaults.playerRadius + 1),
        y: -settings_1.mapBounds.y - 100,
    });
    index_1.room.setDiscProperties(colorLastDefDiscs[0], {
        x: secondOsLine.position.x + atkDirection * (secondOsRadius + 1),
        y: settings_1.mapBounds.y + 100,
    });
    index_1.room.setDiscProperties(colorLastDefDiscs[1], {
        x: secondOsLine.position.x + atkDirection * (secondOsRadius + 1),
        y: -settings_1.mapBounds.y - 100,
    });
    //await sleep(100)
    index_1.room.pauseGame(true);
    yield (0, utils_1.sleep)(2000);
    index_1.room.pauseGame(false);
    //await sleep(3000);
    if (!index_1.room.getScores() || chooser_1.duringDraft || game.id != currentGameId) {
        return;
    }
    game.lastTouch = null;
    //await sleep(100);
    const toHide = [...colorOffsideDiscs, ...colorLastDefDiscs];
    toHide.forEach((dId) => {
        index_1.room.setDiscProperties(dId, { x: settings_1.mapBounds.x + 300, y: settings_1.mapBounds.y + 300 });
    });
    allPosNow.forEach((p) => index_1.room.setPlayerDiscProperties(p.id, p.position));
    index_1.room.setDiscProperties(0, ballNow);
    const freeKickForTeam = kickTeam == 1 ? 2 : 1;
    (0, out_1.freeKick)(game, freeKickForTeam, osPlace);
});
