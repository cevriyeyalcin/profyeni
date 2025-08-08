import { Game, room, PlayerAugmented, toAug, players } from "../index";
import { defaults, box, mapBounds, getLanguage } from "./settings";
import { sendMessage } from "./message";
import { freeKick, penalty } from "./out";
import { sleep } from "./utils";

export const isPenalty = (victim: PlayerAugmented) => {
  const positiveX = Math.abs(victim.fouledAt.x);
  const isYInRange = Math.abs(victim.fouledAt.y) <= box.y;
  const boxSide = victim.team == 1 ? 1 : -1;
  const isInBox =
    positiveX >= box.x &&
    positiveX <= mapBounds.x &&
    Math.sign(victim.fouledAt.x) === boxSide;
  const result = isYInRange && isInBox;
  return result;
};

export const checkFoul = async (game: Game) => {
  // Check advantage system
  checkAdvantage(game);
  
  room
    .getPlayerList()
    .filter((p) => p.team != 0 && toAug(p).sliding)
    .forEach((p) => {
      const ballPos = room.getBallPosition();

      const distToBall = Math.sqrt(
        (p.position.x - ballPos.x) ** 2 + (p.position.y - ballPos.y) ** 2,
      );
      if (distToBall < defaults.playerRadius + defaults.ballRadius + 0.1) {
        toAug(p).sliding = false;
        return;
      }
      const enemyTeam = p.team == 1 ? 2 : 1;
      room
        .getPlayerList()
        .filter((pp) => pp.team == enemyTeam)
        .forEach((enemy) => {
          const dist = Math.sqrt(
            (p.position.x - enemy.position.x) ** 2 +
              (p.position.y - enemy.position.y) ** 2,
          );
          if (dist < defaults.playerRadius * 2 + 0.1) {
            handleSlide(toAug(p), toAug(enemy), game);
          }
        });
    });
};

const handleSlide = async (slider: PlayerAugmented, victim: PlayerAugmented, game: Game) => {
  if (victim.slowdown) {
    return;
  }
  slider.sliding = false;
  const sliderProps = room.getPlayerDiscProperties(slider.id);
  const victimProps = room.getPlayerDiscProperties(victim.id);
  const ballPos = room.getBallPosition();
  const ballDist = Math.sqrt(
    (slider.position.x - ballPos.x) ** 2 + (slider.position.y - ballPos.y) ** 2,
  );
  
  // Check distance between victim and ball - only trigger foul/advantage if ball is nearby
  const victimToBallDist = Math.sqrt(
    (victimProps.x - ballPos.x) ** 2 + (victimProps.y - ballPos.y) ** 2,
  );
  
  // Only process as foul if ball is within reasonable distance of victim (adjust threshold as needed)
  const maxFoulDistance = 150; // pixels - you can adjust this value
  if (victimToBallDist > maxFoulDistance) {
    // Ball is too far from victim - no foul/advantage system and no injuries
    return;
  }
  
  let cardsFactor = 0.7;
  if (ballDist > 300) {
    cardsFactor += 1; // flagrant foul
    sendMessage(`${slider.name} tarafından kaba faul yapıldı.`);
  }
  victim.fouledAt = { x: victimProps.x, y: victimProps.y };
  if (isPenalty(victim)) {
    cardsFactor += 0.3;
  }
  const power = Math.max(
    Math.sqrt(sliderProps.xspeed ** 2 + sliderProps.yspeed ** 2) * 0.6,
    0.7,
  );
  
  // No injury effects for victim - removed slowdown and visual indicators
  
  // Check if victim's team had possession or advantage should be played
  const victimHadPossession = game.lastTouch?.byPlayer.team === victim.team;
  
  // Start advantage system instead of immediate free kick/penalty
  if (!game.advantageState.active) {
    game.advantageState = {
      active: true,
      foulerId: slider.id,
      victimId: victim.id,
      victimTeam: victim.team,
      startTime: 0, // Will be set when victim's team touches ball
      lastTouchTeam: game.lastTouch?.byPlayer.team || 0,
      lastTouchTime: new Date().getTime(),
      cardPending: false, // Card will be applied immediately
      pendingCardSeverity: 0.7 * power * cardsFactor * (Math.random() * 0.2 + 0.9),
      foulPosition: { ...victim.fouledAt },
      victimHadPossession: victimHadPossession,
      lastMessageTime: new Date().getTime(),
      advantageMessageShown: false
    };
    
    // Apply card immediately when foul is made
    slider.foulsMeter += game.advantageState.pendingCardSeverity;
    
    // Önce faul mesajı
    const teamName = victim.team == 1 ? (getLanguage() === 'tr' ? "Kırmızı" : "Red") : (getLanguage() === 'tr' ? "Mavi" : "Blue");
    sendMessage(`⛔ ${teamName} ${getLanguage() === 'tr' ? "takım için faul." : "team fouled."}`);

    if (!victimHadPossession) {
      // Avantaj yoksa direkt serbest vuruş
      awardFreeKickOrPenalty(game, victim, slider);
    }
  }
  
  // Don't add to foul meter yet - will be added when advantage ends
};

const awardFreeKickOrPenalty = (game: Game, victim: PlayerAugmented, slider: PlayerAugmented) => {
  // Reset advantage state BEFORE awarding free kick to prevent interference
  resetAdvantageState(game);
  
  if (isPenalty(victim)) {
    const teamName = victim.team == 1 ? (getLanguage() === 'tr' ? "Kırmızı" : "Red") : (getLanguage() === 'tr' ? "Mavi" : "Blue");
    sendMessage(getLanguage() === 'tr' ? 
      `⚽ ${teamName} takıma ${slider.name} faulü için penaltı verildi!` : 
      `⚽ Penalty awarded to ${teamName} team for ${slider.name}'s foul!`);
    penalty(game, victim.team, { ...victim.fouledAt });
  } else {
    const teamName = victim.team == 1 ? (getLanguage() === 'tr' ? "Kırmızı" : "Red") : (getLanguage() === 'tr' ? "Mavi" : "Blue");
    const teamEmoji = victim.team == 1 ? "🔴" : "🔵";
    sendMessage(`${teamEmoji} ${teamName} ${getLanguage() === 'tr' ? "takım serbest vuruş kullanacak." : "team will take a free kick."}`);
    freeKick(game, victim.team, victim.fouledAt);
  }
};

const resetAdvantageState = (game: Game) => {
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

export const checkAdvantage = (game: Game) => {
  if (!game.advantageState.active) {
    return;
  }
  
  const currentTime = new Date().getTime();
  
  // Start the timer when victim's team first touches the ball
  if (game.lastTouch?.byPlayer.team === game.advantageState.victimTeam && game.advantageState.startTime === 0) {
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
  if (game.lastTouch?.byPlayer.team === foulTeam && advantageDuration <= 4000) {
    const victim = players.find(p => p.id === game.advantageState.victimId);
    const slider = players.find(p => p.id === game.advantageState.foulerId);
    if (victim && slider) {
      // Restore foul position for the original foul location
      victim.fouledAt = { ...game.advantageState.foulPosition };
      awardFreeKickOrPenalty(game, victim, slider);
    }
    return;
  }
  
  // If 4 seconds pass without fouling team touching → advantage played successfully
  if (advantageDuration > 4000 && !game.advantageState.advantageMessageShown) {
    // Avantaj mesajını burada göster - artık kesinleşti
    sendMessage(getLanguage() === 'tr' ? `▶️ Faul avantaja bırakıldı.` : `▶️ Advantage played.`);
    game.advantageState.advantageMessageShown = true;
    resetAdvantageState(game);
  }
};

export const handleAdvantageOnBallOut = (game: Game, lastTouchTeamId?: number) => {
  if (game.advantageState.active) {
    const victim = players.find(p => p.id === game.advantageState.victimId);
    const slider = players.find(p => p.id === game.advantageState.foulerId);
    
    if (victim && slider) {
      // Top dışarı çıktığında her zaman avantajı iptal et ve serbest vuruş ver
      victim.fouledAt = { ...game.advantageState.foulPosition };
      awardFreeKickOrPenalty(game, victim, slider);
    }
  }
};

export const announceCards = (game: Game) => {
  players
    .filter((p) => p.team != 0)
    .forEach((p) => {
      if (p.foulsMeter > p.cardsAnnounced) {
        if (p.foulsMeter > 1 && p.foulsMeter < 2) {
          room.setPlayerAvatar(p.id, "🟨");
          sendMessage("🟨 " + p.name + " sarı kart aldı");
        } else if (p.foulsMeter >= 2) {
          room.setPlayerAvatar(p.id, "🟥");
          room.setPlayerTeam(p.id, 0);
          sendMessage("🟥 " + p.name + " kırmızı kart aldı");
        }
        p.cardsAnnounced = p.foulsMeter;
      }
    });
};