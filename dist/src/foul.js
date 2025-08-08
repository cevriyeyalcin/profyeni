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
exports.announceCards = exports.handleAdvantageOnBallOut = exports.checkAdvantage = exports.checkFoul = exports.isPenalty = void 0;
const index_1 = require("../index");
const settings_1 = require("./settings");
const message_1 = require("./message");
const out_1 = require("./out");
const isPenalty = (victim) => {
    const positiveX = Math.abs(victim.fouledAt.x);
    const isYInRange = Math.abs(victim.fouledAt.y) <= settings_1.box.y;
    const boxSide = victim.team == 1 ? 1 : -1;
    const isInBox = positiveX >= settings_1.box.x &&
        positiveX <= settings_1.mapBounds.x &&
        Math.sign(victim.fouledAt.x) === boxSide;
    const result = isYInRange && isInBox;
    return result;
};
exports.isPenalty = isPenalty;
const checkFoul = (game) => __awaiter(void 0, void 0, void 0, function* () {
    // Check advantage system
    (0, exports.checkAdvantage)(game);
    index_1.room
        .getPlayerList()
        .filter((p) => p.team != 0 && (0, index_1.toAug)(p).sliding)
        .forEach((p) => {
        const ballPos = index_1.room.getBallPosition();
        const distToBall = Math.sqrt((p.position.x - ballPos.x) ** 2 + (p.position.y - ballPos.y) ** 2);
        if (distToBall < settings_1.defaults.playerRadius + settings_1.defaults.ballRadius + 0.1) {
            (0, index_1.toAug)(p).sliding = false;
            return;
        }
        const enemyTeam = p.team == 1 ? 2 : 1;
        index_1.room
            .getPlayerList()
            .filter((pp) => pp.team == enemyTeam)
            .forEach((enemy) => {
            const dist = Math.sqrt((p.position.x - enemy.position.x) ** 2 +
                (p.position.y - enemy.position.y) ** 2);
            if (dist < settings_1.defaults.playerRadius * 2 + 0.1) {
                handleSlide((0, index_1.toAug)(p), (0, index_1.toAug)(enemy), game);
            }
        });
    });
});
exports.checkFoul = checkFoul;
const handleSlide = (slider, victim, game) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (victim.slowdown) {
        return;
    }
    slider.sliding = false;
    const sliderProps = index_1.room.getPlayerDiscProperties(slider.id);
    const victimProps = index_1.room.getPlayerDiscProperties(victim.id);
    const ballPos = index_1.room.getBallPosition();
    const ballDist = Math.sqrt((slider.position.x - ballPos.x) ** 2 + (slider.position.y - ballPos.y) ** 2);
    // Check distance between victim and ball - only trigger foul/advantage if ball is nearby
    const victimToBallDist = Math.sqrt((victimProps.x - ballPos.x) ** 2 + (victimProps.y - ballPos.y) ** 2);
    // Only process as foul if ball is within reasonable distance of victim (adjust threshold as needed)
    const maxFoulDistance = 150; // pixels - you can adjust this value
    if (victimToBallDist > maxFoulDistance) {
        // Ball is too far from victim - no foul/advantage system and no injuries
        return;
    }
    let cardsFactor = 0.7;
    if (ballDist > 300) {
        cardsFactor += 1; // flagrant foul
        (0, message_1.sendMessage)(`${slider.name} tarafından kaba faul yapıldı.`);
    }
    victim.fouledAt = { x: victimProps.x, y: victimProps.y };
    if ((0, exports.isPenalty)(victim)) {
        cardsFactor += 0.3;
    }
    const power = Math.max(Math.sqrt(sliderProps.xspeed ** 2 + sliderProps.yspeed ** 2) * 0.6, 0.7);
    // No injury effects for victim - removed slowdown and visual indicators
    // Check if victim's team had possession or advantage should be played
    const victimHadPossession = ((_a = game.lastTouch) === null || _a === void 0 ? void 0 : _a.byPlayer.team) === victim.team;
    // Start advantage system instead of immediate free kick/penalty
    if (!game.advantageState.active) {
        game.advantageState = {
            active: true,
            foulerId: slider.id,
            victimId: victim.id,
            victimTeam: victim.team,
            startTime: 0, // Will be set when victim's team touches ball
            lastTouchTeam: ((_b = game.lastTouch) === null || _b === void 0 ? void 0 : _b.byPlayer.team) || 0,
            lastTouchTime: new Date().getTime(),
            cardPending: false, // Card will be applied immediately
            pendingCardSeverity: 0.7 * power * cardsFactor * (Math.random() * 0.2 + 0.9),
            foulPosition: Object.assign({}, victim.fouledAt),
            victimHadPossession: victimHadPossession,
            lastMessageTime: new Date().getTime(),
            advantageMessageShown: false
        };
        // Apply card immediately when foul is made
        slider.foulsMeter += game.advantageState.pendingCardSeverity;
        // Önce faul mesajı
        const teamName = victim.team == 1 ? ((0, settings_1.getLanguage)() === 'tr' ? "Kırmızı" : "Red") : ((0, settings_1.getLanguage)() === 'tr' ? "Mavi" : "Blue");
        (0, message_1.sendMessage)(`⛔ ${teamName} ${(0, settings_1.getLanguage)() === 'tr' ? "takım için faul." : "team fouled."}`);
        if (!victimHadPossession) {
            // Avantaj yoksa direkt serbest vuruş
            awardFreeKickOrPenalty(game, victim, slider);
        }
    }
    // Don't add to foul meter yet - will be added when advantage ends
});
const awardFreeKickOrPenalty = (game, victim, slider) => {
    // Reset advantage state BEFORE awarding free kick to prevent interference
    resetAdvantageState(game);
    if ((0, exports.isPenalty)(victim)) {
        const teamName = victim.team == 1 ? ((0, settings_1.getLanguage)() === 'tr' ? "Kırmızı" : "Red") : ((0, settings_1.getLanguage)() === 'tr' ? "Mavi" : "Blue");
        (0, message_1.sendMessage)((0, settings_1.getLanguage)() === 'tr' ?
            `⚽ ${teamName} takıma ${slider.name} faulü için penaltı verildi!` :
            `⚽ Penalty awarded to ${teamName} team for ${slider.name}'s foul!`);
        (0, out_1.penalty)(game, victim.team, Object.assign({}, victim.fouledAt));
    }
    else {
        const teamName = victim.team == 1 ? ((0, settings_1.getLanguage)() === 'tr' ? "Kırmızı" : "Red") : ((0, settings_1.getLanguage)() === 'tr' ? "Mavi" : "Blue");
        const teamEmoji = victim.team == 1 ? "🔴" : "🔵";
        (0, message_1.sendMessage)(`${teamEmoji} ${teamName} ${(0, settings_1.getLanguage)() === 'tr' ? "takım serbest vuruş kullanacak." : "team will take a free kick."}`);
        (0, out_1.freeKick)(game, victim.team, victim.fouledAt);
    }
};
const resetAdvantageState = (game) => {
    game.advantageState = {
        active: false,
        foulerId: 0,
        victimId: 0,
        victimTeam: 0,
        startTime: 0,
        lastTouchTeam: 0,
        lastTouchTime: 0,
        cardPending: false,
        pendingCardSeverity: 0,
        foulPosition: { x: 0, y: 0 },
        victimHadPossession: false,
        lastMessageTime: 0,
        advantageMessageShown: false
    };
};
const checkAdvantage = (game) => {
    var _a, _b;
    if (!game.advantageState.active) {
        return;
    }
    const currentTime = new Date().getTime();
    // Start the timer when victim's team first touches the ball
    if (((_a = game.lastTouch) === null || _a === void 0 ? void 0 : _a.byPlayer.team) === game.advantageState.victimTeam && game.advantageState.startTime === 0) {
        game.advantageState.startTime = currentTime;
        game.advantageState.lastMessageTime = currentTime;
        return;
    }
    // Only proceed with advantage logic if timer has started
    if (game.advantageState.startTime === 0) {
        return;
    }
    const advantageDuration = currentTime - game.advantageState.startTime;
    const timeSinceLastMessage = currentTime - game.advantageState.lastMessageTime;
    const foulTeam = game.advantageState.victimTeam === 1 ? 2 : 1;
    // If fouling team touches ball at ANY point during 4 seconds → award free kick immediately
    if (((_b = game.lastTouch) === null || _b === void 0 ? void 0 : _b.byPlayer.team) === foulTeam && advantageDuration <= 4000) {
        const victim = index_1.players.find(p => p.id === game.advantageState.victimId);
        const slider = index_1.players.find(p => p.id === game.advantageState.foulerId);
        if (victim && slider) {
            // Restore foul position for the original foul location
            victim.fouledAt = Object.assign({}, game.advantageState.foulPosition);
            awardFreeKickOrPenalty(game, victim, slider);
        }
        return;
    }
    // If 4 seconds pass without fouling team touching → advantage played successfully
    if (advantageDuration > 4000 && !game.advantageState.advantageMessageShown) {
        // Avantaj mesajını burada göster - artık kesinleşti
        (0, message_1.sendMessage)((0, settings_1.getLanguage)() === 'tr' ? `▶️ Faul avantaja bırakıldı.` : `▶️ Advantage played.`);
        game.advantageState.advantageMessageShown = true;
        resetAdvantageState(game);
    }
};
exports.checkAdvantage = checkAdvantage;
const handleAdvantageOnBallOut = (game, lastTouchTeamId) => {
    if (game.advantageState.active) {
        const victim = index_1.players.find(p => p.id === game.advantageState.victimId);
        const slider = index_1.players.find(p => p.id === game.advantageState.foulerId);
        if (victim && slider) {
            // Top dışarı çıktığında her zaman avantajı iptal et ve serbest vuruş ver
            victim.fouledAt = Object.assign({}, game.advantageState.foulPosition);
            awardFreeKickOrPenalty(game, victim, slider);
        }
    }
};
exports.handleAdvantageOnBallOut = handleAdvantageOnBallOut;
const announceCards = (game) => {
    index_1.players
        .filter((p) => p.team != 0)
        .forEach((p) => {
        if (p.foulsMeter > p.cardsAnnounced) {
            if (p.foulsMeter > 1 && p.foulsMeter < 2) {
                index_1.room.setPlayerAvatar(p.id, "🟨");
                (0, message_1.sendMessage)("🟨 " + p.name + " sarı kart aldı");
            }
            else if (p.foulsMeter >= 2) {
                index_1.room.setPlayerAvatar(p.id, "🟥");
                index_1.room.setPlayerTeam(p.id, 0);
                (0, message_1.sendMessage)("🟥 " + p.name + " kırmızı kart aldı");
            }
            p.cardsAnnounced = p.foulsMeter;
        }
    });
};
exports.announceCards = announceCards;
