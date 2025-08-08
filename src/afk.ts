import { duringDraft } from "./chooser";
import { room, players } from "..";
import { sendMessage } from "./message";
import { toAug } from "..";

let j = 0;
let afkSystemEnabled = true; // AFK sistem durumu

export const afk = {
  onTick: () => {
    if (!duringDraft && !process.env.DEBUG && afkSystemEnabled) {
      j+=6;
    }

    if (j > 60) {
      j = 0;
      if (afkSystemEnabled) {
        players
          .filter((p) => p.team == 1 || p.team == 2)
          .forEach((p) => {
            p.afkCounter += 1;
            if (p.afkCounter == 14) {
              sendMessage("5 saniye içerisinde hareket etmezsen izleyiciye aktarılacaksın!", p);
            } else if (p.afkCounter > 19) {
              p.afkCounter = 0;
              room.setPlayerTeam(p.id, 0);
              p.afk = true;
            }
          });
      }
    }
  },
  onActivity: (p: PlayerObject) => {
    toAug(p).afkCounter = 0;
  },
};

export const setAfkSystemEnabled = (enabled: boolean) => {
  afkSystemEnabled = enabled;
};

export const isAfkSystemEnabled = () => {
  return afkSystemEnabled;
};
