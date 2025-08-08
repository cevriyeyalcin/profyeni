"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetTeamplayBoost = exports.teamplayBoost = exports.setBallInvMassAndColor = exports.boostToColor = void 0;
const __1 = require("..");
const message_1 = require("./message");
const settings_1 = require("./settings");
const utils_1 = require("./utils");
// Boost sayısını, sigmoid fonksiyonu ile 0-1 arasında normalize edip skala veriyoruz
const boostToCoef = (game) => (1 / (1 + Math.E ** -(game.boostCount * 0.4)) - 0.5) * 2;
// Boost seviyesine göre top rengini kırmızı/maviye yaklaştırıyoruz
const boostToColor = (game, team) => (0, utils_1.blendColorsInt)(0xffffff, team === 1 ? 0xd10000 : 0x0700d1, boostToCoef(game) * 100);
exports.boostToColor = boostToColor;
// Topun ağırlığını sabit tut, sadece rengini boost’a göre ayarla
const setBallInvMassAndColor = (game, team) => {
    __1.room.setDiscProperties(0, {
        color: (0, exports.boostToColor)(game, team),
        invMass: settings_1.defaults.ballInvMass,
    });
};
exports.setBallInvMassAndColor = setBallInvMassAndColor;
// Takım pas boost sistemini işler
const teamplayBoost = (game, p) => {
    // Aynı takımdan ve farklı oyuncuysa boost sayısını artır
    if (game.lastKick &&
        game.lastKick.team === p.team &&
        game.lastKick.id !== p.id) {
        game.boostCount += 1;
        const team = p.team == 1 ? "Kırmızı" : "Mavi";
        const teamEmoji = p.team == 1 ? "🔴" : "🔵";
        if (game.boostCount >= 3) {
            (0, message_1.sendMessage)(`👏  ${teamEmoji} ${game.boostCount} pas yapıldı. (${p.name})`);
        }
        if (game.boostCount == 5) {
            (0, message_1.sendMessage)(`🔥  ${team} takımı topu ALEVLENDİRDİ!`);
        }
        else if (game.boostCount == 8) {
            (0, message_1.sendMessage)(`🔥🔥🔥  ${team} takımı ÇILDIRDI!`);
        }
        else if (game.boostCount > 10) {
            (0, message_1.sendMessage)(`🚀🚀🚀  ${team} takımı TANRI MODUNDA!`);
        }
    }
    else {
        // Aynı oyuncu vurduysa veya takım farklıysa boost sıfırlanır
        game.boostCount = 0;
    }
    // Son vuran oyuncuyu güncelle
    game.lastKick = p;
    // Top rengini güncelle
    (0, exports.setBallInvMassAndColor)(game, p.team);
};
exports.teamplayBoost = teamplayBoost;
// Oyunun boost sistemini sıfırlar
const resetTeamplayBoost = (game) => {
    game.ballRotation = { x: 0, y: 0, power: 0 };
    game.boostCount = 0;
    (0, exports.setBallInvMassAndColor)(game);
};
exports.resetTeamplayBoost = resetTeamplayBoost;
