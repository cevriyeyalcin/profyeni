import { room, players, PlayerAugmented, db } from "..";
import * as fs from "fs";
import { sendMessage } from "./message";
import { game, Game } from "..";
import { sleep } from "./utils";
import { toAug } from "..";
import { teamSize } from "./settings";
import { changeLevels } from "./levels";
import { handlePlayerLeave as handleTeamChooserLeave, checkAndShowWaitingMessage, checkAndAutoBalance, handleImmediateBalancing } from "./teamChooser";

/* This manages teams and players depending
 * on being during ranked game or draft phase. */

const maxTeamSize = process.env.DEBUG ? 1 : teamSize;
let isRunning: boolean = false;
// All games are now unranked with level progression
let isRanked: boolean = false;
export let duringDraft: boolean = false;
export let changeDuringDraft = (m: boolean) => (duringDraft = m);

const balanceTeams = () => {
  if (duringDraft) {
    return;
  }
  // Balance teams by moving players to maintain equal numbers
  if (red().length > blue().length + 1) {
    room.setPlayerTeam(red()[0].id, 2);
  } else if (red().length + 1 < blue().length) {
    room.setPlayerTeam(blue()[0].id, 1);
  }
};

export const handlePlayerLeaveOrAFK = async (leftPlayer?: PlayerAugmented) => {
  // Handle team chooser if a player left
  if (leftPlayer) {
    handleTeamChooserLeave(leftPlayer);
  }
  
  if (players.filter((p) => !p.afk).length < 1) {
    room.stopGame();
    sleep(5000); // this is important to cancel all ongoing animations when match stops
    room.startGame();
  }
  await sleep(100);
  if (!duringDraft) {
    // First handle critical scenarios immediately (like 1v0)
    const immediateBalanced = handleImmediateBalancing();
    
    if (!immediateBalanced) {
      // Then try auto-balance (to spectators) for team chooser system
      const autoBalanced = checkAndAutoBalance();
      
      // If no auto-balance occurred, use traditional balance (between teams)
      if (!autoBalanced) {
        balanceTeams();
      }
    }
    
    // Check if waiting message should be shown after balancing
    setTimeout(() => {
      checkAndShowWaitingMessage();
    }, 500);
  }
};

const handleWin = async (game: Game, winnerTeamId: TeamID) => {

  try {
    const changes = await changeLevels(game, winnerTeamId)

    changes.forEach((co) => {
      const p = room.getPlayer(co.id);
      if (p) {
        const playerAug = toAug(p);
        if (co.levelUp) {
          sendMessage(
            `🎉 Level Up! ${playerAug.name} → Lvl.${co.newLevel} (+${co.expGained} XP)`,
            null, // Send to all players
          );
          sendMessage(
            `Your Level: Lvl.${playerAug.level} → Lvl.${co.newLevel} (+${co.expGained} XP)`,
            p,
          );
        } else {
          sendMessage(
            `XP Gained: +${co.expGained} (${playerAug.experience}/${co.expNeeded} to Lvl.${playerAug.level + 1})`,
            p,
          );
        }
      }
    });

    changes.forEach((co) => {
      if (players.map((p) => p.id).includes(co.id)) {
        const pp = room.getPlayer(co.id);
        if (pp) {
          const playerAug = toAug(pp);
          playerAug.experience = co.newExperience;
          playerAug.level = co.newLevel;
        }
      }
    });
  } catch (e) {
    console.log("Error during handling levels:", e);
  }
};
const red = () => room.getPlayerList().filter((p) => p.team == 1);
const blue = () => room.getPlayerList().filter((p) => p.team == 2);
const spec = () => room.getPlayerList().filter((p) => p.team == 0);
const both = () =>
  room.getPlayerList().filter((p) => p.team == 1 || p.team == 2);
const ready = () => room.getPlayerList().filter((p) => !toAug(p).afk);

export const addToGame = (room: RoomObject, p: PlayerObject) => {
  if (game && (toAug(p).cardsAnnounced >= 2 || toAug(p).foulsMeter >= 2)) {
    return;
  }
  if (duringDraft) {
    return;
  }
  
  // Only assign first 2 players to teams (1 red, 1 blue)
  // All other players stay as spectators for team chooser system
  const redCount = red().length;
  const blueCount = blue().length;
  const totalTeamPlayers = redCount + blueCount;
  
  if (totalTeamPlayers === 0) {
    // First player goes to red team
    room.setPlayerTeam(p.id, 1);
  } else if (totalTeamPlayers === 1 && redCount === 1 && blueCount === 0) {
    // Second player goes to blue team
    room.setPlayerTeam(p.id, 2);
  }
  // All subsequent players (3rd, 4th, 5th...) stay as spectators (team 0)
  // They will be chosen by teams using the team chooser system
  
  // Check if we should show the waiting message
  setTimeout(() => {
    checkAndShowWaitingMessage();
  }, 100); // Small delay to ensure team assignment is complete
};

const initChooser = (room: RoomObject) => {
  const refill = () => {
    const specs = spec().filter((p) => !toAug(p).afk);
    for (let i = 0; i < specs.length; i++) {
      const toTeam = i % 2 == 0 ? 1 : 2;
      room.setPlayerTeam(specs[i].id, toTeam);
    }
  };

  const isEnoughPlayers = () => ready().length >= maxTeamSize * 2;

  if (room.getScores()) {
    isRunning = true;
  }

  const _onTeamGoal = room.onTeamGoal;
  room.onTeamGoal = (team) => {
    if (game) {
      game.inPlay = false;
      game.animation = true;
      game.boostCount = 0;
      game.ballRotation.power = 0;
      game.positionsDuringPass = [];
      players.forEach((p) => (p.canCallFoulUntil = 0));
      game.eventCounter += 1;
      if (isRanked && !duringDraft) {
        const evC = game.eventCounter;
        const gameId = game.id;
        const dirKick = team == 1 ? -1 : 1;
        setTimeout(() => {
          if (
            room.getBallPosition()?.x == 0 &&
            room.getBallPosition()?.y == 0 &&
            game?.eventCounter == evC &&
            game?.id == gameId
          ) {
            room.setDiscProperties(0, {
              xspeed: dirKick * 2,
              yspeed: Math.random(),
            });
            sendMessage(
              "Ball was not touched for 35 seconds, therefore it is moved automatically.",
            );
          }
        }, 35000);
      }
    }
    _onTeamGoal(team);
  };

  const _onTeamVictory = room.onTeamVictory;
  room.onTeamVictory = async (scores) => {
    if (duringDraft) {
      return;
    }
    if (_onTeamVictory) {
      _onTeamVictory(scores);
    }
    const winTeam = scores.red > scores.blue ? 1 : 2;
    const loseTeam = scores.red > scores.blue ? 2 : 1;
    
    // Always handle level progression for all games
    if (!game) {
      return;
    }
    await handleWin(game, winTeam);
    
    sendMessage("Break time: 10 seconds.");
    await sleep(10000);
    
    // Simple team balancing - no more draft system
    isRanked = false; // All games are unranked with level progression
    let i = 0;
    ready().forEach((p) => {
      if (i % 2) {
        room.setPlayerTeam(p.id, 2);
      } else {
        room.setPlayerTeam(p.id, 1);
      }
      i++;
    });
    
    sendMessage("New game starting with level progression!");
    room.startGame();
  };
};

export default initChooser;
