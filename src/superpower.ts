import { toAug, room, players, PlayerAugmented, Game } from "../index";
import { sendMessage } from "./message";
import { freeKick, penalty } from "./out";
import { handleLastTouch } from "./offside";
import { defaults, mapBounds, getLanguage } from "./settings";
import { sleep } from "./utils";
import { isPenalty } from "./foul";

const SLIDE_THRESHOLD = 60; // 2 saniye için eşik değeri (activation 6 artıyor, her 7 tick'te bir)

export const checkAllX = (game: Game) => {
  players
    .filter((p) => p.team != 0)
    .forEach((pp) => {
      const props = room.getPlayerDiscProperties(pp.id);
      if (!props) {
        return;
      }

      // Kick tuşuna basılı tutulduğunda
      if (props.damping == defaults.kickingDamping) {
        // Faul çağrısı kontrolü
        if (
          new Date().getTime() < pp.canCallFoulUntil &&
          pp.activation > 20 &&
          Math.abs(pp.fouledAt.x) < mapBounds.x
        ) {
          if (!game.inPlay) {
            return;
          }
          sendMessage(`${pp.name} has called foul.`);
          if (isPenalty(pp)) {
            penalty(game, pp.team, { ...pp.fouledAt });
            pp.activation = 0;
            pp.canCallFoulUntil = 0;
            return;
          }
          freeKick(game, pp.team, pp.fouledAt);
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
            room.setPlayerAvatar(pp.id, "🚫");
            setTimeout(() => room.setPlayerAvatar(pp.id, ""), 200);
            return;
          }
          slide(game, pp);
        }

      // Kick tuşu bırakıldığında
      } else {
        // 3 saniye dolmadan bırakıldıysa hiçbir şey olmaz
        pp.activation = 0;
        room.setPlayerAvatar(pp.id, "");
      }
    });
};

const slide = async (game: Game, p: PlayerAugmented) => {
  if (p.slowdown) {
    return;
  }
  if (game.animation) {
    room.setPlayerAvatar(p.id, "");
    return;
  }
  
  // Güvenli props alma - BU SATIR ÖNEMLİ!
  const props = room.getPlayerDiscProperties(p.id);
  if (!props) {
    console.warn(`Player disc properties not found for player ${p.id} (${p.name})`);
    p.activation = 0;
    room.setPlayerAvatar(p.id, "");
    return;
  }
  
  if (p.cooldownUntil > new Date().getTime()) {
    sendMessage(
      getLanguage() === 'tr' ? 
      `Bekleme süresi: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}sn` :
      `Cooldown: ${Math.ceil((p.cooldownUntil - new Date().getTime()) / 1000)}s`,
      p,
    );
    p.activation = 0;
    room.setPlayerAvatar(p.id, "⏳");
    setTimeout(() => room.setPlayerAvatar(p.id, ""), 200);
    return;
  }
  
  // Props kontrol edildikten sonra güvenli kullanım
  room.setPlayerDiscProperties(p.id, {
    xspeed: props.xspeed * 3.4,
    yspeed: props.yspeed * 3.4,
    xgravity: -props.xspeed * 0.026,
    ygravity: -props.yspeed * 0.026,
  });
  room.setPlayerAvatar(p.id, "👟");
  p.sliding = true;
  await sleep(900);
  p.sliding = false;
  
  // Get current properties to reduce speed more aggressively
  const currentProps = room.getPlayerDiscProperties(p.id);
  
  // CurrentProps için de kontrol ekle
  if (!currentProps) {
    console.warn(`Current player disc properties not found for player ${p.id} (${p.name})`);
    p.slowdown = 0.08;
    p.slowdownUntil = new Date().getTime() + 1000 * 3;
    p.cooldownUntil = new Date().getTime() + 23000;
    room.setPlayerAvatar(p.id, "");
    return;
  }
  
  // Reset gravity and reduce speed significantly to prevent additional sliding
  room.setPlayerDiscProperties(p.id, {
    xgravity: 0,
    ygravity: 0,
    xspeed: currentProps.xspeed * 0.4, // Reduce speed to 40% immediately
    yspeed: currentProps.yspeed * 0.4,
  });
  
  p.slowdown = 0.08;
  p.slowdownUntil = new Date().getTime() + 1000 * 3;
  p.cooldownUntil = new Date().getTime() + 23000;
  room.setPlayerAvatar(p.id, "");
};

export const rotateBall = (game: Game) => {
  if (game.ballRotation.power < 0.02) {
    game.ballRotation.power = 0;
    room.setDiscProperties(0, {
      xgravity: 0,
      ygravity: 0,
    });
    return;
  }
  
  // Ball için de güvenli kontrol ekle
  const ballProps = room.getDiscProperties(0);
  if (!ballProps) {
    console.warn("Ball properties not found, resetting ball rotation");
    game.ballRotation.power = 0;
    return;
  }
  
  room.setDiscProperties(0, {
    xgravity: 0.01 * game.ballRotation.x * game.ballRotation.power,
    ygravity: 0.01 * game.ballRotation.y * game.ballRotation.power,
  });
  game.ballRotation.power *= 0.735;
};