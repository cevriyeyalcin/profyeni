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
exports.penalty = exports.clearGoalKickBlocks = exports.clearCornerBlocks = exports.clearThrowInBlocks = exports.handleBallInPlay = exports.freeKick = exports.handleBallOutOfBounds = void 0;
const index_1 = require("../index");
const settings_1 = require("./settings");
const utils_1 = require("./utils");
const foul_1 = require("./foul");
const settings_2 = require("./settings");
const teamplayBoost_1 = require("./teamplayBoost");
const blink = (game, savedEventCounter, forTeam) => __awaiter(void 0, void 0, void 0, function* () {
    for (let i = 0; i < 140; i++) {
        if (!index_1.room.getScores()) {
            return;
        }
        // Cancel blink if there is another out
        if (game.inPlay || savedEventCounter != game.eventCounter) {
            // Reset ball color to white when blink is cancelled
            index_1.room.setDiscProperties(0, { color: settings_1.colors.white });
            return true;
        }
        const blinkColor = forTeam == 1 ? settings_1.colors.red : settings_1.colors.blue;
        if (i > 115) {
            if (Math.floor(i / 2) % 2 == 0) {
                index_1.room.setDiscProperties(0, { color: blinkColor });
            }
            else {
                index_1.room.setDiscProperties(0, { color: settings_1.colors.white });
            }
        }
        yield (0, utils_1.sleep)(100);
    }
    // Reset ball color to white after blink animation
    index_1.room.setDiscProperties(0, { color: settings_1.colors.white });
});
const handleBallOutOfBounds = (game) => {
    var _a;
    if (!game.inPlay || game.animation) {
        return;
    }
    const ball = index_1.room.getDiscProperties(0);
    const lastTouchTeamId = (_a = game.lastTouch) === null || _a === void 0 ? void 0 : _a.byPlayer.team;
    let ballIsOut = false;
    // Check if ball is out of bounds
    const isOutLeft = Math.abs(ball.x) > settings_1.mapBounds.x && Math.abs(ball.y) > settings_1.goals.y && ball.x < 0;
    const isOutRight = Math.abs(ball.x) > settings_1.mapBounds.x && Math.abs(ball.y) > settings_1.goals.y && ball.x > 0;
    const isOutTopBottom = Math.abs(ball.y) > settings_1.mapBounds.y && Math.abs(ball.x) < settings_1.mapBounds.x;
    if (isOutLeft || isOutRight || isOutTopBottom) {
        ballIsOut = true;
        // During advantage, skip normal out-of-bounds procedures and handle advantage directly
        if (game.advantageState.active) {
            (0, foul_1.handleAdvantageOnBallOut)(game, lastTouchTeamId);
            return; // Exit early - don't do normal throw-in/corner/goal kick
        }
        // Normal out-of-bounds handling when no advantage active
        throwFakeBall(ball);
        if (isOutLeft) {
            // LEFT BORDER
            if (lastTouchTeamId == 1) {
                cornerKick(game, 2, ball);
            }
            else if (lastTouchTeamId == 2) {
                goalKick(game, 1, ball);
            }
        }
        else if (isOutRight) {
            // RIGHT BORDER
            if (lastTouchTeamId == 1) {
                goalKick(game, 2, ball);
            }
            else if (lastTouchTeamId == 2) {
                cornerKick(game, 1, ball);
            }
        }
        else if (isOutTopBottom) {
            // UPPER and LOWER BORDER
            throwIn(game, lastTouchTeamId == 1 ? 2 : 1, ball);
        }
    }
};
exports.handleBallOutOfBounds = handleBallOutOfBounds;
const cornerKick = (game, forTeam, pos) => __awaiter(void 0, void 0, void 0, function* () {
    (0, foul_1.announceCards)(game);
    game.eventCounter += 1;
    game.gameState = "corner";
    const savedEventCounter = game.eventCounter;
    throwRealBall(game, forTeam, {
        x: Math.sign(pos.x) * (settings_1.mapBounds.x - 10),
        y: (settings_1.mapBounds.y - 20) * Math.sign(pos.y),
    }, savedEventCounter);
    const blockerId = forTeam == 1 ? 2 : 1;
    const notBlockerId = forTeam == 1 ? 1 : 2;
    index_1.room.setDiscProperties(blockerId, {
        x: (settings_1.mapBounds.x + 60) * Math.sign(pos.x),
        y: (settings_1.mapBounds.y + 60) * Math.sign(pos.y),
        radius: 420,
    });
    index_1.room.setDiscProperties(notBlockerId, { x: 500, y: 1200 });
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        index_1.room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
    });
    game.rotateNextKick = true;
    const r = yield blink(game, savedEventCounter, forTeam);
    if (r) {
        return;
    }
    (0, exports.clearCornerBlocks)();
});
const goalKick = (game, forTeam, pos) => __awaiter(void 0, void 0, void 0, function* () {
    (0, foul_1.announceCards)(game);
    game.eventCounter += 1;
    const savedEventCounter = game.eventCounter;
    throwRealBall(game, forTeam, { x: Math.sign(pos.x) * (settings_1.mapBounds.x - 80), y: 0 }, savedEventCounter);
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        index_1.room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
        if (p.team != forTeam) {
            // Collide with Box' joints
            index_1.room.setPlayerDiscProperties(p.id, {
                cGroup: index_1.room.CollisionFlags.red |
                    index_1.room.CollisionFlags.blue |
                    index_1.room.CollisionFlags.c0,
            });
            // Move back from the line
            if (Math.sign(pos.x) * p.position.x > 830 &&
                p.position.y > -330 &&
                p.position.y < 330) {
                index_1.room.setPlayerDiscProperties(p.id, { x: Math.sign(pos.x) * 825 });
            }
        }
    });
    game.rotateNextKick = true;
    const r = yield blink(game, savedEventCounter, forTeam);
    if (r) {
        return;
    }
    (0, exports.clearGoalKickBlocks)();
});
const throwIn = (game, forTeam, pos) => __awaiter(void 0, void 0, void 0, function* () {
    (0, foul_1.announceCards)(game);
    const currentGameId = game.id;
    game.eventCounter += 1;
    game.skipOffsideCheck = true;
    game.gameState = "throw_in";
    const savedEventCounter = game.eventCounter;
    throwRealBall(game, forTeam, { x: pos.x, y: Math.sign(pos.y) * settings_1.mapBounds.y }, savedEventCounter);
    if (forTeam == 1) {
        if (pos.y < 0) {
            // show top red line
            index_1.room.setDiscProperties(17, { x: 1149 });
            // hide top blue line
            index_1.room.setDiscProperties(19, { x: -1149 });
        }
        else {
            // show bottom red line
            index_1.room.setDiscProperties(21, { x: 1149 });
            // hide bottom blue line
            index_1.room.setDiscProperties(23, { x: -1149 });
        }
    }
    else {
        if (pos.y < 0) {
            // show top blue line
            index_1.room.setDiscProperties(19, { x: 1149 });
            // hide top red line
            index_1.room.setDiscProperties(17, { x: -1149 });
        }
        else {
            // show bottom blue line
            index_1.room.setDiscProperties(23, { x: 1149 });
            // hide bottom red line
            index_1.room.setDiscProperties(21, { x: -1149 });
        }
    }
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        if (!index_1.room.getScores()) {
            return;
        }
        index_1.room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
        const defCf = p.team == 1 ? index_1.room.CollisionFlags.red : index_1.room.CollisionFlags.blue;
        if (p.team == forTeam) {
            index_1.room.setPlayerDiscProperties(p.id, { cGroup: defCf });
        }
        else {
            // Collide with Plane
            index_1.room.setPlayerDiscProperties(p.id, {
                cGroup: index_1.room.CollisionFlags.red |
                    index_1.room.CollisionFlags.blue |
                    index_1.room.CollisionFlags.c1,
            });
            // Move back from the line
            if (p.position.y < -450 && pos.y < 0) {
                index_1.room.setPlayerDiscProperties(p.id, { y: -440 });
            }
            else if (p.position.y > 450 && pos.y > 0) {
                index_1.room.setPlayerDiscProperties(p.id, { y: 440 });
            }
        }
    });
    const r = yield blink(game, savedEventCounter, forTeam);
    if (r) {
        return;
    }
    if (!index_1.room.getScores()) {
        return;
    } // if no game or next game started
    if (game &&
        (game.id != currentGameId || game.eventCounter != savedEventCounter)) {
        return;
    } // if next game started but its still on out
    const newForTeam = forTeam == 1 ? 2 : 1;
    game.animation = true; // when giving out to other team, ball is moved, that can evoke game.inPlay = true and double-activate throwin (new throwin for opposite team and again the same team, as it will detect the ball moving)
    throwIn(game, newForTeam, pos);
});
const freeKick = (game, forTeam, pos) => __awaiter(void 0, void 0, void 0, function* () {
    (0, foul_1.announceCards)(game);
    index_1.room.pauseGame(true);
    index_1.room.pauseGame(false);
    game.eventCounter += 1;
    game.gameState = "free_kick";
    const savedEventCounter = game.eventCounter;
    throwRealBall(game, forTeam, pos, savedEventCounter);
    const blockerId = forTeam == 1 ? 2 : 1;
    const notBlockerId = forTeam == 1 ? 1 : 2;
    const defMoveDirection = forTeam == 1 ? 1 : -1;
    // Faul çemberini ayarla
    index_1.room.setDiscProperties(blockerId, Object.assign(Object.assign({}, pos), { radius: 220 }));
    index_1.room.setDiscProperties(notBlockerId, { x: 500, y: 1200 });
    // Savunma oyuncularını rastgele pozisyonlara yerleştir
    const defenders = index_1.room.getPlayerList().filter((p) => p.team != forTeam && p.team != 0);
    defenders.forEach(p => {
        index_1.room.setPlayerDiscProperties(p.id, {
            x: pos.x + defMoveDirection * (Math.random() * 200 + 50),
            invMass: 1000000
        });
    });
    // Hücum oyuncularını sabitle
    index_1.room.getPlayerList()
        .filter(p => p.team === forTeam && p.team !== 0)
        .forEach(p => {
        index_1.room.setPlayerDiscProperties(p.id, { invMass: 1000000 });
    });
    yield (0, utils_1.sleep)(100);
    game.rotateNextKick = true;
    const r = yield blink(game, savedEventCounter, forTeam);
    if (r) {
        return;
    }
    (0, exports.clearCornerBlocks)();
});
exports.freeKick = freeKick;
const handleBallInPlay = (game) => __awaiter(void 0, void 0, void 0, function* () {
    if (game.animation) {
        return;
    }
    const props = index_1.room.getDiscProperties(0);
    if (Math.abs(props.xspeed) > 0.1 || Math.abs(props.yspeed) > 0.1) {
        game.inPlay = true;
        game.gameState = "playing";
        index_1.room
            .getPlayerList()
            .forEach((p) => index_1.room.setPlayerDiscProperties(p.id, { invMass: settings_1.defaults.invMass }));
        // Reset ball color to white when in play
        index_1.room.setDiscProperties(0, { color: settings_1.colors.white });
        (0, exports.clearThrowInBlocks)();
        (0, exports.clearCornerBlocks)();
        (0, exports.clearGoalKickBlocks)();
    }
});
exports.handleBallInPlay = handleBallInPlay;
const clearThrowInBlocks = () => {
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        if (p.team == 1) {
            index_1.room.setPlayerDiscProperties(p.id, { cGroup: index_1.room.CollisionFlags.red });
        }
        else if (p.team == 2) {
            index_1.room.setPlayerDiscProperties(p.id, {
                cGroup: index_1.room.CollisionFlags.blue,
            });
        }
    });
    index_1.room.setDiscProperties(17, { x: -1149 });
    index_1.room.setDiscProperties(19, { x: -1149 });
    index_1.room.setDiscProperties(21, { x: -1149 });
    index_1.room.setDiscProperties(23, { x: -1149 });
};
exports.clearThrowInBlocks = clearThrowInBlocks;
const clearCornerBlocks = () => {
    index_1.room.setDiscProperties(1, { x: -400, y: 1600 });
    index_1.room.setDiscProperties(2, { x: 400, y: 1600 });
};
exports.clearCornerBlocks = clearCornerBlocks;
const clearGoalKickBlocks = () => {
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        if (p.team == 1) {
            index_1.room.setPlayerDiscProperties(p.id, { cGroup: index_1.room.CollisionFlags.red });
        }
        else if (p.team == 2) {
            index_1.room.setPlayerDiscProperties(p.id, {
                cGroup: index_1.room.CollisionFlags.blue,
            });
        }
    });
};
exports.clearGoalKickBlocks = clearGoalKickBlocks;
const throwFakeBall = (ball) => __awaiter(void 0, void 0, void 0, function* () {
    let oldRadius = ball.radius;
    index_1.room.setDiscProperties(settings_1.secondBallId, {
        x: ball.x + ball.xspeed,
        y: ball.y + ball.yspeed,
        xspeed: ball.xspeed,
        yspeed: ball.yspeed,
        radius: oldRadius,
    });
    for (let i = 0; i < 100; i++) {
        if (!index_1.room.getScores()) {
            return;
        }
        index_1.room.setDiscProperties(settings_1.secondBallId, { radius: oldRadius });
        if (i > 40) {
            if (oldRadius < 0.4) {
                index_1.room.setDiscProperties(settings_1.secondBallId, { radius: 0 });
                return;
            }
            oldRadius -= 0.4;
        }
        yield (0, utils_1.sleep)(30);
    }
});
const throwRealBall = (game, forTeam, toPos, evCounter) => __awaiter(void 0, void 0, void 0, function* () {
    if (game.eventCounter != evCounter) {
        return;
    }
    game.animation = true;
    game.inPlay = false;
    index_1.room.getPlayerList().filter(p => p.team != 0).forEach(p => {
        (0, index_1.toAug)(p).activation = 0; // dont get stuck with superpower on out
    });
    (0, teamplayBoost_1.resetTeamplayBoost)(game);
    const xPushOutOfSight = Math.abs(toPos.x) > settings_1.mapBounds.x - 5
        ? Math.sign(toPos.x) * (settings_1.mapBounds.x + 250)
        : toPos.x;
    const yPushOutOfSight = Math.abs(toPos.y) > settings_1.mapBounds.y - 5
        ? Math.sign(toPos.y) * (settings_1.mapBounds.y + 250)
        : toPos.y;
    game.ballRotation.power = 0;
    index_1.room.setDiscProperties(0, {
        radius: 0,
        xspeed: 0,
        yspeed: 0,
        cMask: 0,
        cGroup: index_1.room.CollisionFlags.c0,
        xgravity: 0,
        ygravity: 0,
        x: xPushOutOfSight,
        y: yPushOutOfSight,
        invMass: 0.00001,
    });
    const xx = Math.sign(Math.max(Math.abs(toPos.x) + 1 - settings_1.mapBounds.x, 0) * Math.sign(toPos.x));
    const yy = Math.sign(Math.max(Math.abs(toPos.y) + 1 - settings_1.mapBounds.y, 0) * Math.sign(toPos.y));
    const angleOffset = Math.atan2(yy, xx);
    //                       _..._
    //                      /     \
    // angle starting from (<--x   )
    // left direction       \_   _/
    //                        '''
    const dist = 140; // distance from which ball is passed
    const throwStrength = 0.02; // ball pass strength
    const spread = Math.PI / 2; // can be between PI and 0 (0 will throw directly from horizontal or vertical line)
    const angle = (Math.PI - spread) / 2 + Math.random() * spread + angleOffset;
    const throwFromX = Math.sin(angle) * dist + toPos.x;
    const throwFromY = -Math.cos(angle) * dist + toPos.y;
    const throwSpeedX = Math.sin(angle + Math.PI) * dist * throwStrength;
    const throwSpeedY = -Math.cos(angle + Math.PI) * dist * throwStrength;
    //await sleep(Math.random() * 500);
    index_1.room.setDiscProperties(settings_1.thirdBallId, {
        //color: forTeam == 1 ? colors.red : colors.blue,
        x: throwFromX,
        y: throwFromY,
        xspeed: throwSpeedX,
        yspeed: throwSpeedY,
        xgravity: -throwSpeedX * 0.004,
        ygravity: -throwSpeedY * 0.004,
    });
    for (let i = 0; i < 1000; i++) {
        const thirdBall = index_1.room.getDiscProperties(settings_1.thirdBallId);
        if (!thirdBall) {
            return;
        }
        if (game.eventCounter != evCounter) {
            return;
        }
        const distToDest = Math.sqrt(((thirdBall.x + thirdBall.xspeed * 2) - toPos.x) ** 2 + ((thirdBall.y + thirdBall.yspeed * 2) - toPos.y) ** 2);
        if (distToDest < 1.2) {
            break;
        }
        yield (0, utils_1.sleep)(33.333); // 2 frames
    }
    // Hide fake ball and replace with real ball
    index_1.room.setDiscProperties(settings_1.thirdBallId, { x: 1000, y: 860, xgravity: 0, ygravity: 0 });
    // Penaltıda güç 0, diğer durumlarda normal güç
    const toMass = game.gameState === "penalty" ? settings_1.defaults.ballInvMass :
        (game.rotateNextKick ? settings_1.defaults.ballInvMass + 0.63 : settings_1.defaults.ballInvMass);
    // Set ball color based on which team is taking the shot
    const ballColor = forTeam === 1 ? settings_1.colors.red : settings_1.colors.blue;
    index_1.room.setDiscProperties(0, {
        x: toPos.x,
        y: toPos.y,
        xgravity: 0,
        ygravity: 0,
        radius: settings_1.defaults.ballRadius,
        cMask: index_1.room.CollisionFlags.all,
        cGroup: index_1.room.CollisionFlags.ball |
            index_1.room.CollisionFlags.kick |
            index_1.room.CollisionFlags.score,
        invMass: settings_1.defaults.ballInvMass,
        color: ballColor,
    });
    game.animation = false;
    // allow fast pass during first second, then set mass for long pass
    yield (0, utils_1.sleep)(1000);
    if (evCounter == game.eventCounter && !game.inPlay) {
        index_1.room.setDiscProperties(0, { invMass: toMass });
        if (toMass != settings_1.defaults.ballInvMass) {
            index_1.room.setDiscProperties(0, { color: settings_1.colors.powerball });
        }
        else {
            // Keep team color if not powerball
            index_1.room.setDiscProperties(0, { color: ballColor });
        }
    }
});
const penalty = (game, forTeam, fouledAt) => __awaiter(void 0, void 0, void 0, function* () {
    const pos = { x: Math.sign(fouledAt.x) * settings_2.penaltyPoint.x, y: settings_2.penaltyPoint.y };
    (0, foul_1.announceCards)(game);
    const oppTeam = forTeam == 1 ? 2 : 1;
    const shooter = index_1.room.getPlayerList().filter((p) => p.team == forTeam)[0];
    const gk = index_1.room
        .getPlayerList()
        .filter((p) => p.team == oppTeam && (0, index_1.toAug)(p).foulsMeter < 2)[0];
    game.eventCounter += 1;
    game.gameState = "penalty";
    const savedEventCounter = game.eventCounter;
    throwRealBall(game, forTeam, pos, savedEventCounter);
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0)
        .forEach((p) => {
        index_1.room.setPlayerDiscProperties(p.id, {
            invMass: 1000000,
            xspeed: 0,
            yspeed: 0,
        });
    });
    index_1.room.pauseGame(true);
    index_1.room.pauseGame(false);
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0 && p.id != (gk === null || gk === void 0 ? void 0 : gk.id) && p.id != (shooter === null || shooter === void 0 ? void 0 : shooter.id))
        .forEach((p) => {
        // Collide with Box' joints
        index_1.room.setPlayerDiscProperties(p.id, {
            cGroup: index_1.room.CollisionFlags.red |
                index_1.room.CollisionFlags.blue |
                index_1.room.CollisionFlags.c0,
        });
        // Move back from the line
        if (Math.sign(pos.x) * p.position.x > 830 &&
            p.position.y > -330 &&
            p.position.y < 330) {
            index_1.room.setPlayerDiscProperties(p.id, { x: Math.sign(pos.x) * 825 });
        }
    });
    if (shooter) {
        index_1.room.setPlayerDiscProperties(shooter.id, {
            x: pos.x - Math.sign(pos.x) * 10,
            y: pos.y,
        });
    }
    if (gk) {
        const defCf = gk.team == 1 ? index_1.room.CollisionFlags.red : index_1.room.CollisionFlags.blue;
        const toSet = {
            x: (settings_1.mapBounds.x + 15) * Math.sign(pos.x),
            y: pos.y,
            cGroup: defCf | index_1.room.CollisionFlags.c2,
        };
        index_1.room.setPlayerDiscProperties(gk.id, toSet);
    }
    yield (0, utils_1.sleep)(100);
    game.rotateNextKick = true;
    const r = yield blink(game, savedEventCounter, forTeam);
    if (r) {
        return;
    }
    (0, exports.clearGoalKickBlocks)();
});
exports.penalty = penalty;
