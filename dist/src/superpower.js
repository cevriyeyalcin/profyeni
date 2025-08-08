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
exports.rotateBall = exports.checkAllX = void 0;
const index_1 = require("../index");
const message_1 = require("./message");
const out_1 = require("./out");
const settings_1 = require("./settings");
const utils_1 = require("./utils");
const foul_1 = require("./foul");
const SLIDE_THRESHOLD = 60; // 2 saniye için eşik değeri (activation 6 artıyor, her 7 tick'te bir)
const checkAllX = (game) => {
    index_1.players
        .filter((p) => p.team != 0)
        .forEach((pp) => {
        const props = index_1.room.getPlayerDiscProperties(pp.id);
        if (!props) {
            return;
        }
        // Kick tuşuna basılı tutulduğunda
        if (props.damping == settings_1.defaults.kickingDamping) {
            // Faul çağrısı kontrolü
            if (new Date().getTime() < pp.canCallFoulUntil &&
                pp.activation > 20 &&
                Math.abs(pp.fouledAt.x) < settings_1.mapBounds.x) {
                if (!game.inPlay) {
                    return;
                }
                (0, message_1.sendMessage)(`${pp.name} has called foul.`);
                if ((0, foul_1.isPenalty)(pp)) {
                    (0, out_1.penalty)(game, pp.team, Object.assign({}, pp.fouledAt));
                    pp.activation = 0;
                    pp.canCallFoulUntil = 0;
                    return;
                }
                (0, out_1.freeKick)(game, pp.team, pp.fouledAt);
                pp.activation = 0;
                pp.canCallFoulUntil = 0;
                return;
            }
            // Yavaşlama durumu kontrolü
            if (pp.slowdown && new Date().getTime() > pp.canCallFoulUntil) {
                pp.activation = 0;
                return;
            }
            // Activation değerini artır
            pp.activation += 6;
            // 3 saniyeye yaklaştıkça emoji göster
            // Emoji sadece kayma sırasında gösterilecek
            // 3 saniye dolunca direkt kayma gerçekleşir
            if (pp.activation >= SLIDE_THRESHOLD) {
                pp.activation = 0;
                if (!game.inPlay) {
                    index_1.room.setPlayerAvatar(pp.id, "🚫");
                    setTimeout(() => index_1.room.setPlayerAvatar(pp.id, ""), 200);
                    return;
                }
                slide(game, pp);
            }
            // Kick tuşu bırakıldığında
        }
        else {
            // 3 saniye dolmadan bırakıldıysa hiçbir şey olmaz
            pp.activation = 0;
            index_1.room.setPlayerAvatar(pp.id, "");
        }
    });
};
exports.checkAllX = checkAllX;
const slide = (game, p) => __awaiter(void 0, void 0, void 0, function* () {
    if (p.slowdown) {
        return;
    }
    if (game.animation) {
        index_1.room.setPlayerAvatar(p.id, "");
        return;
    }
    // Güvenli props alma - BU SATIR ÖNEMLİ!
    const props = index_1.room.getPlayerDiscProperties(p.id);
    if (!props) {
        console.warn(`Player disc properties not found for player ${p.id} (${p.name})`);
        p.activation = 0;
        index_1.room.setPlayerAvatar(p.id, "");
        return;
    }
    if (p.cooldownUntil > new Date().getTime()) {
        (0, message_1.sendMessage)((0, settings_1.getLanguage)() === 'tr' ?
            `Bekleme süresi: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}sn` :
            `Cooldown: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}s`, p);
        p.activation = 0;
        index_1.room.setPlayerAvatar(p.id, "⏳");
        setTimeout(() => index_1.room.setPlayerAvatar(p.id, ""), 200);
        return;
    }
    // Props kontrol edildikten sonra güvenli kullanım
    index_1.room.setPlayerDiscProperties(p.id, {
        xspeed: props.xspeed * 3.4,
        yspeed: props.yspeed * 3.4,
        xgravity: -props.xspeed * 0.026,
        ygravity: -props.yspeed * 0.026,
    });
    index_1.room.setPlayerAvatar(p.id, "👟");
    p.sliding = true;
    yield (0, utils_1.sleep)(900);
    p.sliding = false;
    // Get current properties to reduce speed more aggressively
    const currentProps = index_1.room.getPlayerDiscProperties(p.id);
    // CurrentProps için de kontrol ekle
    if (!currentProps) {
        console.warn(`Current player disc properties not found for player ${p.id} (${p.name})`);
        p.slowdown = 0.08;
        p.slowdownUntil = new Date().getTime() + 1000 * 3;
        p.cooldownUntil = new Date().getTime() + 23000;
        index_1.room.setPlayerAvatar(p.id, "");
        return;
    }
    // Reset gravity and reduce speed significantly to prevent additional sliding
    index_1.room.setPlayerDiscProperties(p.id, {
        xgravity: 0,
        ygravity: 0,
        xspeed: currentProps.xspeed * 0.4, // Reduce speed to 40% immediately
        yspeed: currentProps.yspeed * 0.4,
    });
    p.slowdown = 0.08;
    p.slowdownUntil = new Date().getTime() + 1000 * 3;
    p.cooldownUntil = new Date().getTime() + 23000;
    index_1.room.setPlayerAvatar(p.id, "");
});
const rotateBall = (game) => {
    if (game.ballRotation.power < 0.02) {
        game.ballRotation.power = 0;
        index_1.room.setDiscProperties(0, {
            xgravity: 0,
            ygravity: 0,
        });
        return;
    }
    // Ball için de güvenli kontrol ekle
    const ballProps = index_1.room.getDiscProperties(0);
    if (!ballProps) {
        console.warn("Ball properties not found, resetting ball rotation");
        game.ballRotation.power = 0;
        return;
    }
    index_1.room.setDiscProperties(0, {
        xgravity: 0.01 * game.ballRotation.x * game.ballRotation.power,
        ygravity: 0.01 * game.ballRotation.y * game.ballRotation.power,
    });
    game.ballRotation.power *= 0.735;
};
exports.rotateBall = rotateBall;
