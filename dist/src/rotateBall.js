"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyRotation = void 0;
const __1 = require("..");
const applyRotation = (game, p) => {
    const props = __1.room.getPlayerDiscProperties(p.id);
    const spMagnitude = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2);
    const vecXsp = props.xspeed / spMagnitude;
    const vecYsp = props.yspeed / spMagnitude;
    game.ballRotation = {
        x: -vecXsp,
        y: -vecYsp,
        power: spMagnitude ** 0.5 * 4,
    };
    if (game.rotateNextKick) {
        game.ballRotation = {
            x: -vecXsp,
            y: -vecYsp,
            power: spMagnitude ** 0.5 * 11,
        };
    }
    game.rotateNextKick = false;
};
exports.applyRotation = applyRotation;
