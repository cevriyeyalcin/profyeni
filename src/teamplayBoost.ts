import { room, Game } from "..";
import { sendMessage } from "./message";
import { defaults } from "./settings";
import { blendColorsInt } from "./utils";

// Boost sayısını, sigmoid fonksiyonu ile 0-1 arasında normalize edip skala veriyoruz
const boostToCoef = (game: Game) =>
  (1 / (1 + Math.E ** -(game.boostCount * 0.4)) - 0.5) * 2;

// Boost seviyesine göre top rengini kırmızı/maviye yaklaştırıyoruz
export const boostToColor = (game: Game, team?: TeamID) =>
  blendColorsInt(
    0xffffff,
    team === 1 ? 0xd10000 : 0x0700d1,
    boostToCoef(game) * 100,
  );

// Topun ağırlığını sabit tut, sadece rengini boost’a göre ayarla
export const setBallInvMassAndColor = (game: Game, team?: TeamID) => {
  room.setDiscProperties(0, {
    color: boostToColor(game, team),
    invMass: defaults.ballInvMass,
  });
};

// Takım pas boost sistemini işler
export const teamplayBoost = (game: Game, p: PlayerObject) => {
  // Aynı takımdan ve farklı oyuncuysa boost sayısını artır
  if (
    game.lastKick &&
    game.lastKick.team === p.team &&
    game.lastKick.id !== p.id
  ) {
    game.boostCount += 1;
    const team = p.team == 1 ? "Kırmızı" : "Mavi";
    const teamEmoji = p.team == 1 ? "🔴" : "🔵";

    if (game.boostCount >= 3) {
      sendMessage(`👏  ${teamEmoji} ${game.boostCount} pas yapıldı. (${p.name})`);
    }
    if (game.boostCount == 5) {
      sendMessage(`🔥  ${team} takımı topu ALEVLENDİRDİ!`);
    } else if (game.boostCount == 8) {
      sendMessage(`🔥🔥🔥  ${team} takımı ÇILDIRDI!`);
    } else if (game.boostCount > 10) {
      sendMessage(`🚀🚀🚀  ${team} takımı TANRI MODUNDA!`);
    }
  } else {
    // Aynı oyuncu vurduysa veya takım farklıysa boost sıfırlanır
    game.boostCount = 0;
  }

  // Son vuran oyuncuyu güncelle
  game.lastKick = p;

  // Top rengini güncelle
  setBallInvMassAndColor(game, p.team);
};

// Oyunun boost sistemini sıfırlar
export const resetTeamplayBoost = (game: Game) => {
  game.ballRotation = { x: 0, y: 0, power: 0 };
  game.boostCount = 0;
  setBallInvMassAndColor(game);
};