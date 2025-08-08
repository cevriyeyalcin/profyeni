import { sendMessage } from "./message";
import { getOrCreatePlayer } from "./db";
import { db, game, players, PlayerAugmented } from "..";
import config from "../config";

export const welcomePlayer = (room: RoomObject, p: PlayerObject) => {
  sendMessage(`${config.roomName}\nTüm komutları görmek için "!help" yaz.`, p);
  sendMessage(
    `"X" tuşuna kısa bas kaydır, uzun bas koş. Takım içi paslar topa daha güçlü vurmanı sağlar.`,
    p,
  );
  sendMessage(`🏆 Yeni seviye sistemi! Oyun oynayarak XP kazan ve seviye atla. !seviye ile ilerlemeni gör.`, p);
  sendMessage(`Discord: discord.gg/profstriker`, p);
};

export const initPlayer = async (p: PlayerObject) => {
  let newPlayer = new PlayerAugmented(p);
  if (game) {
    const found = game.holdPlayers.find((pp) => pp.auth == p.auth);
    // If player reconnected into the same game, apply cooldowns, cards and
    // injuries.
    if (found) {
      // player was already in game
      // disallow reconnect on the same game (giving red card)
      newPlayer = new PlayerAugmented({
        ...p,
        foulsMeter: 2,
        cardsAnnounced: 2
      });
      found.id = p.id  // so that the elo decrease is shown to him
    } else {
      // when he connects during the game, push in with team: 0 to not
      // assign any points, but not let him back in on reconnect (in
      // case he abuses red card + reconnect during warmup)
      game.holdPlayers.push({ id: p.id, auth: p.auth, team: 0 })
    }
  }
  players.push(newPlayer);
  const readPlayer = await getOrCreatePlayer(p);
  newPlayer.elo = readPlayer.elo;
  newPlayer.experience = readPlayer.experience;
  newPlayer.level = readPlayer.level;
  await db.run("UPDATE players SET name=? WHERE auth=?", [p.name, p.auth]);
};
