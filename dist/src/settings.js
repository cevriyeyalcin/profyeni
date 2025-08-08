"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSlowModeEnabled = exports.setSlowModeEnabled = exports.slowModeSettings = exports.isSlowModeEnabled = exports.getLanguage = exports.setLanguage = exports.currentLanguage = exports.teamSize = exports.getOffsideEnabled = exports.setOffsideEnabled = exports.isOffsideEnabled = exports.offsideDiscs = exports.thirdBallId = exports.secondBallId = exports.colors = exports.defaults = exports.penaltyPoint = exports.box = exports.goals = exports.mapBounds = void 0;
exports.mapBounds = { x: 1150, y: 610 };
exports.goals = { y: 124 };
exports.box = { x: 840, y: 320 };
exports.penaltyPoint = { x: 935, y: 0 };
exports.defaults = {
    invMass: 0.4,
    ballInvMass: 1.235,
    ballRadius: 7.6,
    playerRadius: 14,
    kickingDamping: 0.9649,
};
exports.colors = {
    white: 0xffffff,
    red: 0xe07d6e,
    blue: 0x6e9ee0,
    powerball: 0xf5c28c,
};
exports.secondBallId = 24;
exports.thirdBallId = 25;
exports.offsideDiscs = { red: [26, 27], blue: [28, 29] };
// Offside system toggle
exports.isOffsideEnabled = true;
const setOffsideEnabled = (enabled) => {
    exports.isOffsideEnabled = enabled;
};
exports.setOffsideEnabled = setOffsideEnabled;
const getOffsideEnabled = () => {
    return exports.isOffsideEnabled;
};
exports.getOffsideEnabled = getOffsideEnabled;
exports.teamSize = 6;
// Dil ayarı
exports.currentLanguage = 'tr';
const setLanguage = (lang) => {
    exports.currentLanguage = lang;
};
exports.setLanguage = setLanguage;
const getLanguage = () => {
    return exports.currentLanguage;
};
exports.getLanguage = getLanguage;
// Chat slow mode settings
exports.isSlowModeEnabled = true;
exports.slowModeSettings = {
    normalUsers: 3000, // 3 seconds for normal users
    vipUsers: 1000, // 1 second for VIP users
    admins: 0 // No cooldown for admins
};
const setSlowModeEnabled = (enabled) => {
    exports.isSlowModeEnabled = enabled;
};
exports.setSlowModeEnabled = setSlowModeEnabled;
const getSlowModeEnabled = () => {
    return exports.isSlowModeEnabled;
};
exports.getSlowModeEnabled = getSlowModeEnabled;
