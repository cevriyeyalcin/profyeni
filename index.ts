import { Headless } from "haxball.js";
import { addToGame, duringDraft, handlePlayerLeaveOrAFK } from "./src/chooser";
import { handleSelection, isSelectionActive } from "./src/teamChooser";
import { isCommand, handleCommand } from "./src/command";
import { playerMessage, sendMessage, Discordinterval } from "./src/message";
import {
  handleBallOutOfBounds,
  handleBallInPlay,
  clearThrowInBlocks,
} from "./src/out";
import { checkAllX, rotateBall } from "./src/superpower";
import { handleLastTouch } from "./src/offside";
import { checkFoul } from "./src/foul";
import * as fs from "fs";
import { applySlowdown } from "./src/slowdown";
import initChooser from "./src/chooser";
import { welcomePlayer } from "./src/welcome";
import { initDb } from "./src/db";
import { setBallInvMassAndColor, teamplayBoost } from "./src/teamplayBoost";
import { applyRotation } from "./src/rotateBall";
import { defaults, getDuplicateBlockingEnabled } from "./src/settings";
import { setAfkSystemEnabled, isAfkSystemEnabled } from "./src/afk";
import { initPlayer } from "./src/welcome";
import * as crypto from "node:crypto";

let finalScores: {red: number, blue: number} | null = null;

// Team rotation state to prevent interference from other systems
let isTeamRotationInProgress = false;
export const getTeamRotationInProgress = () => isTeamRotationInProgress;

// Admin-initiated game stop flag to prevent incorrect draw messages
let isAdminGameStop = false;
export const setAdminGameStop = (value: boolean) => { isAdminGameStop = value; };

// Setter for finalScores so other modules can set it for normal victories
export const setFinalScores = (scores: {red: number, blue: number} | null) => { finalScores = scores; };

// Streak records system
interface StreakRecord {
  count: number;
  team: number; // 1 = red, 2 = blue
  players: Array<{
    auth: string;
    username: string;
  }>;
  achievedAt: number; // timestamp
}

interface StreakRecords {
  allTimeRecord: StreakRecord | null;
  top10Records: StreakRecord[];
}

const getFieldZone = (x: number, y: number): string => {
  // Saha bölgelerini tanımla
  if (x < -100) return "Sol Kale Önü";
  if (x > 100) return "Sağ Kale Önü"; 
  if (x < -50) return "Sol Savunma";
  if (x > 50) return "Sağ Savunma";
  if (y > 30) return "Üst Orta Saha";
  if (y < -30) return "Alt Orta Saha";
  return "Merkez";
};

const getTrajectoryDescription = (angleDiff: number, speedPercent: number): string => {
  let trajectory = "";
  
  // Açı açıklaması
  if (Math.abs(angleDiff) < 5) {
    trajectory += "Düz gidiş";
  } else if (angleDiff > 0) {
    trajectory += `${angleDiff.toFixed(0)}° sola kavis`;
  } else {
    trajectory += `${Math.abs(angleDiff).toFixed(0)}° sağa kavis`;
  }
  
  // Hız açıklaması
  if (speedPercent > 20) {
    trajectory += ", hızlı";
  } else if (speedPercent < -10) {
    trajectory += ", yavaş";
  } else {
    trajectory += ", normal";
  }
  
  return trajectory;
};

const getSpeedBar = (speed: number): string => {
  const level = Math.min(Math.floor(speed / 2), 10);
  return "🔥".repeat(level) + "⚪".repeat(10 - level);
};

const getSpinBar = (spin: number): string => {
  const level = Math.min(Math.floor(spin / 1.5), 10);
  return "🌀".repeat(level) + "⚪".repeat(10 - level);
};

const getPowerBar = (power: number): string => {
  const level = Math.min(Math.floor(power), 10);
  return "⚡".repeat(level) + "⚪".repeat(10 - level);
};

const getCurveBar = (curve: number): string => {
  const level = Math.min(Math.floor(curve / 2), 10);
  return "🌊".repeat(level) + "⚪".repeat(10 - level);
};

const STREAK_RECORDS_FILE = "streak_records.json";

// Win streak tracking
let winStreak = {
  team: 0, // 0 = no streak, 1 = red, 2 = blue
  count: 0
};

export const version = '1.3.5 (25/04/2025)'

export interface lastTouch {
  byPlayer: PlayerAugmented;
  x: number;
  y: number;
}

export interface previousTouch {
  byPlayer: PlayerAugmented;
  x: number;
  y: number;
}
export interface holdPlayer {
  // used to save player data in memory for each game to handle him
  // returning to game and stats
  id: number;
  auth: string;
  team: TeamID;
}

export class PlayerAugmented {
  id: number;
  name: string;
  auth: string; // so that it doesn't disappear
  foulsMeter: number; // can be a decimal. over 1.0 => yellow card, over 2.0 => red card
  cardsAnnounced: number; // same as foulsMeter
  sliding: boolean;
  conn: string;
  activation: number;
  team: 0 | 1 | 2;
  slowdown: number;
  slowdownUntil: number;
  cooldownUntil: number;
  fouledAt: { x: number; y: number };
  canCallFoulUntil: number;
  afk: boolean;
  afkCounter: number;
  elo: number;
  experience: number;
  level: number;
  powerLevel: number;
  cooldownMessageShown: boolean;

  // Chat slow mode
  lastChatTime: number;
  chatCooldownUntil: number;

  // Join time tracking
  joinTime: number;

  // Kayma için yeni özellikler
  slideStartTime: number;
  slideDirection: { x: number; y: number };
  slideDistance: number;
  slideDuration: number;
  slideStartX: number;
  slideStartY: number;
  xPressStartTime: number | null;

  constructor(p: PlayerObject & Partial<PlayerAugmented>) {
    this.id = p.id;
    this.name = p.name;
    this.auth = p.auth;
    this.conn = p.conn;
    this.team = p.team;
    this.foulsMeter = p.foulsMeter || 0;
    this.cardsAnnounced = p.cardsAnnounced || 0;
    this.activation = 0;
    this.sliding = false;
    this.slowdown = p.slowdown || 0;
    this.slowdownUntil = p.slowdownUntil || 0;
    this.cooldownUntil = p.cooldownUntil || 0;
    this.canCallFoulUntil = 0;
    this.fouledAt = { x: 0, y: 0 };
    this.afk = false;
    this.afkCounter = 0;
    this.elo = 1200;
    this.experience = p.experience || 0;
    this.level = p.level || 1;
    this.powerLevel = 0;
    this.cooldownMessageShown = false;

    // Chat slow mode özelliklerini başlat
    this.lastChatTime = 0;
    this.chatCooldownUntil = 0;

    // Join time tracking
    this.joinTime = Date.now();

    // Kayma özelliklerini başlat
    this.slideStartTime = 0;
    this.slideDirection = { x: 0, y: 0 };
    this.slideDistance = 0;
    this.slideDuration = 0;
    this.slideStartX = 0;
    this.slideStartY = 0;
    this.xPressStartTime = null;
  }

  get position() {
    return room.getPlayer(this.id).position;
  }
}

let gameId = 0;
export class Game {
  id: number;
  inPlay: boolean;
  ballTouchDuration: number = 0;
  lastTouchingPlayer: PlayerObject | null = null;
  animation: boolean;
  eventCounter: number;
  lastTouch: lastTouch | null;
  previousTouch: previousTouch | null;
  lastKick: PlayerObject | null;
  ballRotation: { 
    x: number; 
    y: number; 
    power: number;
    targetPower?: number;      
    accelerationRate?: number;  
  };
  positionsDuringPass: PlayerObject[];
  skipOffsideCheck: boolean;
  holdPlayers: holdPlayer[];
  rotateNextKick: boolean;
  boostCount: number;
  gameState: "playing" | "throw_in" | "corner" | "free_kick" | "penalty";
  advantageState: {
    active: boolean;
    foulerId: number;
    victimId: number;
    victimTeam: number;
    startTime: number;
    lastTouchTeam: number;
    lastTouchTime: number;
    cardPending: boolean;
    pendingCardSeverity: number;
    foulPosition: { x: number; y: number };
    victimHadPossession: boolean;
    lastMessageTime: number;
    advantageMessageShown: boolean;
  };
  ffVotes: {
    red: Set<string>; // auth codes of red team players who voted FF
    blue: Set<string>; // auth codes of blue team players who voted FF
  };
  endedByForfeit: {
    hasForfeited: boolean;
    forfeitingTeam: number;
    winningTeam: number;
  };

  constructor() {
    gameId += 1;
    this.id = gameId;
    this.eventCounter = 0; // to debounce some events
    this.inPlay = true;
    this.lastTouch = null;
    this.previousTouch = null;
    this.lastKick = null;
    this.animation = false;
    this.ballRotation = { 
    x: 0, 
    y: 0, 
    power: 0,
    targetPower: 0,        
    accelerationRate: 0    
  };
    this.positionsDuringPass = [];
    this.skipOffsideCheck = false;
    this.holdPlayers = JSON.parse(JSON.stringify(players.map(p => { return { id: p.id, auth: p.auth, team: p.team }})))
    this.rotateNextKick = false;
    this.boostCount = 0;
    this.gameState = "playing";
    this.advantageState = {
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
          this.ffVotes = {
        red: new Set<string>(),
        blue: new Set<string>()
      };
      this.endedByForfeit = {
        hasForfeited: false,
        forfeitingTeam: 0,
        winningTeam: 0
      };
  }
  rotateBall() {
    rotateBall(this);
  }
  handleBallTouch() {
  const ball = room.getDiscProperties(0);
  if (!ball) {
    return;
  }
  
  let anyPlayerTouching = false;
  
  for (const p of room.getPlayerList()) {
    const prop = room.getPlayerDiscProperties(p.id);
    if (!prop) {
      continue;
    }
    
    const dist = Math.sqrt((prop.x - ball.x) ** 2 + (prop.y - ball.y) ** 2);
    const isTouching = dist < prop.radius + ball.radius + 0.1;
    
    if (isTouching) {
      anyPlayerTouching = true;
      const pAug = toAug(p);
      pAug.sliding = false;
      
      // Güç yükleme sistemi - Durumlara göre farklı davranış
      if (this.gameState === "throw_in" || this.gameState === "penalty") { 
        // Taç atışı ve penaltıda güç yok
        this.ballTouchDuration = 0;
        this.lastTouchingPlayer = null;
        pAug.powerLevel = 0;
        room.setPlayerAvatar(p.id, "");
      } else { 
        // Diğer durumlar için güç yükleme var
        if (this.lastTouchingPlayer?.id === p.id) {
          this.ballTouchDuration += 1/60; // Her tick 1/60 saniye
        } else {
          // Yeni oyuncu topa dokunmaya başladı
          this.ballTouchDuration = 0;
          this.lastTouchingPlayer = p;
        }
        
        // Güç seviyesini hesapla - KADEMELİ SİSTEM
        let maxPower = 5; // Varsayılan maksimum güç
        
        // Durumlara göre maksimum güç sınırı
        switch (this.gameState) {
          case "corner":
            maxPower = 3;
            break;
          case "free_kick":
            maxPower = 4;
            break;
        }
        
        // 0.5 saniye bekle, sonra güç yüklemeye başla
        let powerLevel = 0;
        if (this.ballTouchDuration >= 0.5) {
          // KADEMELİ ARTIŞ: Her 0.15 saniyede 0.1 güç artır
          const elapsedAfterWait = this.ballTouchDuration - 0.5;
          powerLevel = Math.min(1.0 + (elapsedAfterWait / 0.15) * 0.1, maxPower);
          
          // Ondalık basamağı yuvarla (1.0, 1.1, 1.2... 5.0)
          powerLevel = Math.round(powerLevel * 10) / 10;
        }
        
        // Avatar güncelle - ondalık gösterim
        let avatar = "";
        if (powerLevel >= 1.0) {
          avatar = powerLevel.toFixed(1); // "1.0", "1.1", "2.5" gibi
        }
        room.setPlayerAvatar(p.id, avatar);
        
        // Güç seviyesini kaydet
        pAug.powerLevel = powerLevel;
      }
      
      handleLastTouch(this, pAug);
    }
  }
  
  // Hiç kimse dokunmuyorsa sıfırla
  if (!anyPlayerTouching) {
    this.ballTouchDuration = 0;
    if (this.lastTouchingPlayer) {
      room.setPlayerAvatar(this.lastTouchingPlayer.id, "");
    }
    this.lastTouchingPlayer = null;
  }
}
  handleBallOutOfBounds() {
    handleBallOutOfBounds(this);
  }
  handleBallInPlay() {
    handleBallInPlay(this);
  }
  checkAllX() {
    checkAllX(this);
  }
  checkFoul() {
    checkFoul(this);
  }
  applySlowdown() {
    applySlowdown();
  }
}

export let players: PlayerAugmented[] = [];
export let toAug = (p: PlayerObject) => {
  const found = players.find((pp) => pp.id == p.id);
  if (!found) {
    console.warn(`[WARNING] Player ID ${p.id} not found in players array - likely just left. Skipping.`);
    throw `${p.id} ID'li oyuncu aranırken hata oluştu. Oyuncu, oyuncular dizisinde bulunamadı: ${JSON.stringify(players)}`;
  }
  return found;
};
export let room: RoomObject;
export let game: Game | null;
export let db: any;
export let adminPass: string = crypto.randomBytes(6).toString("hex");

// Export updateWinStreak for command usage
export { updateWinStreak };

const checkScoreDifference = () => {
  try {
    const scores = room.getScores();
    if (!scores) return;
    
    const scoreDifference = Math.abs(scores.red - scores.blue);
    
    // 3 fark varsa oyunu bitir
    if (scoreDifference >= 3) {
      const leadingTeam = scores.red > scores.blue ? 'Kırmızı' : 'Mavi';
      const leadingScore = Math.max(scores.red, scores.blue);
      const losingScore = Math.min(scores.red, scores.blue);
      
      // SKORLARI SAKLA
      finalScores = {red: scores.red, blue: scores.blue};
      
      sendMessage(`🏁 Oyun 3 fark nedeniyle sona erdi! ${leadingTeam} takım galip! (${leadingScore}-${losingScore})`);
      
      // Oyunu durdur
      room.stopGame();
    }
  } catch (error) {
    console.error("Skor farkı kontrol hatası:", error);
  }
};

// Bu fonksiyonu index.ts'te güncelleyin:

const applyTeamRotation = (winnerTeam: number, loserTeam: number) => {
  try {
    // Set rotation flag to prevent interference from other systems
    isTeamRotationInProgress = true;
    console.log(`[TEAM_ROTATION] Starting rotation - BLOCKING other systems`);
    
    const allPlayers = room.getPlayerList();
    
    // Mevcut takımları topla ve isimleri ile logla
    const winners = allPlayers.filter(p => p.team === winnerTeam);
    const losers = allPlayers.filter(p => p.team === loserTeam);
    const initialSpectators = allPlayers.filter(p => p.team === 0);
    
    const initialSpecCount = initialSpectators.length;
    
    console.log(`[TEAM_ROTATION] Initial state - Winners: ${winners.length}, Losers: ${losers.length}, Spectators: ${initialSpecCount}`);
    
    if (initialSpecCount === 0) {
      // Case 1: No initial spectators - Direct team swap
      console.log(`[TEAM_ROTATION] No initial spectators - performing direct team swap`);
      
      // Move losers to spectators first
      losers.forEach(player => {
        room.setPlayerTeam(player.id, 0);
      });
      
      sendMessage(`🔄 Eski ${loserTeam === 1 ? 'Kırmızı' : 'Mavi'} takım oyuncuları izleyiciye geçti...`);
      
      // Wait 2 seconds, then move them back to the losing team (essentially swapping teams)
      setTimeout(() => {
        const currentSpectators = room.getPlayerList().filter(p => p.team === 0);
        
        // Move the former losers (now spectators) back to the losing team
        // This creates the team swap effect
        losers.forEach(player => {
          const currentPlayer = room.getPlayer(player.id);
          if (currentPlayer && currentPlayer.team === 0) {
            room.setPlayerTeam(player.id, loserTeam);
          }
        });
        
        const teamName = loserTeam === 1 ? 'Kırmızı' : 'Mavi';
        sendMessage(`🔄 Takımlar yer değiştirdi! Eski ${loserTeam === 1 ? 'Kırmızı' : 'Mavi'} takım oyuncuları ${teamName} takıma geçti.`);
        
        // Clear rotation flag and start new game
        setTimeout(() => {
          isTeamRotationInProgress = false;
          console.log(`[TEAM_ROTATION] Rotation complete - UNBLOCKING other systems`);
          sendMessage("🚀 Yeni maç başlatılıyor...");
          room.startGame();
        }, 1500);
        
      }, 2000);
      
    } else {
      // Case 2: There are initial spectators - Normal rotation with spectator integration
      console.log(`[TEAM_ROTATION] ${initialSpecCount} initial spectators - performing rotation with spectator integration`);
      
      // 1. First move some spectators to the losing team (before losers go to spectators)
      const spectatorsToMove = initialSpectators.slice(0, Math.min(6, Math.max(1, Math.floor(losers.length / 2)))); // Move 1-6 based on loser count
      
      spectatorsToMove.forEach(player => {
        room.setPlayerTeam(player.id, loserTeam);
      });
      
      if (spectatorsToMove.length > 0) {
        const teamName = loserTeam === 1 ? 'Kırmızı' : 'Mavi';
        sendMessage(`🔄 ${spectatorsToMove.length} izleyici oyuncu ${teamName} takıma geçti!`);
      }
      
      // 2. Wait 2 seconds, then move original losers to spectators
      setTimeout(() => {
        
        // Move original losers to spectators
        losers.forEach(player => {
          const currentPlayer = room.getPlayer(player.id);
          if (currentPlayer && currentPlayer.team === loserTeam) {
            room.setPlayerTeam(player.id, 0);
          }
        });
        
        sendMessage(`🔄 Eski ${loserTeam === 1 ? 'Kırmızı' : 'Mavi'} takım oyuncuları izleyiciye geçti...`);
        
        // Final state check and start new game
        setTimeout(() => {
          const finalPlayers = room.getPlayerList();
          const finalRed = finalPlayers.filter(p => p.team === 1).length;
          const finalBlue = finalPlayers.filter(p => p.team === 2).length;
          const finalSpecs = finalPlayers.filter(p => p.team === 0).length;
          
          console.log(`[TEAM_ROTATION] Final state - Red: ${finalRed}, Blue: ${finalBlue}, Spectators: ${finalSpecs}`);
          
          // Clear rotation flag and start new game
          isTeamRotationInProgress = false;
          console.log(`[TEAM_ROTATION] Rotation complete - UNBLOCKING other systems`);
          sendMessage("🚀 Yeni maç başlatılıyor...");
          room.startGame();
        }, 1500);
        
      }, 2000);
    }
    
  } catch (error) {
    console.error("Takım rotasyonu hatası:", error);
    sendMessage("⚠️ Takım rotasyonunda bir hata oluştu.");
    
    // Clear rotation flag even on error
    isTeamRotationInProgress = false;
    console.log(`[TEAM_ROTATION] Rotation failed - UNBLOCKING other systems`);
    
    // Hata durumunda da maçı yeniden başlat
    setTimeout(() => {
      room.startGame();
    }, 2000);
  }
};

// Helper function to extract real username from HaxBall formatted name
const extractRealUsername = (formattedName: string): string => {
  // HaxBall format: "[#ID] Username" - we want just "Username"
  const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
  return match ? match[1] : formattedName;
};

// Win streak functions
const getTeamName = (teamId: number): string => {
  return teamId === 1 ? "Kırmızı" : "Mavi";
};

const getTeamColor = (teamId: number): number => {
  return teamId === 1 ? 0xFF4040 : 0x12C4FF; // Red or Blue (matching VIP colors)
};

const announceWinStreak = (team: number, count: number) => {
  const teamName = getTeamName(team);
  const teamColor = getTeamColor(team);
  
  let message = "";
  
  if (count >= 1 && count <= 9) {
    message = `${teamName} takım ${count} maçtır kazanıyor`;
  } else if (count === 10) {
    message = `${teamName} takım ortalığı kasıp kavuruyor, 10 maçtır yenilgi görmediler!`;
  } else if (count >= 11 && count <= 19) {
    message = `${teamName} takım ortalığı kasıp kavuruyor, ${count} maçtır yenilgi görmediler!`;
  } else if (count === 20) {
    message = `${teamName} takım adeta rakip tanımıyor önüne geleni ezdi! 20 maçtır kaybetmiyorlar!`;
  } else if (count > 20) {
    message = `${teamName} takım adeta rakip tanımıyor önüne geleni ezdi! ${count} maçtır kaybetmiyorlar!`;
  }
  
  if (message) {
    room.sendAnnouncement(`🔥 ${message}`, undefined, teamColor, "bold", 1);
  }
};

const updateWinStreak = (winnerTeam: number) => {
  if (winStreak.team === winnerTeam) {
    // Same team won again, increment streak
    winStreak.count++;
    
    // Check if current streak broke the all-time record
    const records = loadStreakRecords();
    if (!records.allTimeRecord || winStreak.count > records.allTimeRecord.count) {
      // New record! Record it immediately
      checkAndUpdateStreakRecord(winStreak.team, winStreak.count);
    }
  } else {
    // Different team won, check if previous streak was a record
    if (winStreak.count >= 1 && winStreak.team !== 0) {
      checkAndUpdateStreakRecord(winStreak.team, winStreak.count);
    }
    
    // Start new streak
    winStreak.team = winnerTeam;
    winStreak.count = 1;
  }
  
  // Don't announce here - will be announced at next game start
};

const announceCurrentStreak = () => {
  if (winStreak.count >= 1) {
    announceWinStreak(winStreak.team, winStreak.count);
  }
};



// Streak records functions
const loadStreakRecords = (): StreakRecords => {
  try {
    if (fs.existsSync(STREAK_RECORDS_FILE)) {
      const data = fs.readFileSync(STREAK_RECORDS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Streak records yükleme hatası:", error);
  }
  
  // Return default structure
  return {
    allTimeRecord: null,
    top10Records: []
  };
};

const saveStreakRecords = (records: StreakRecords): void => {
  try {
    fs.writeFileSync(STREAK_RECORDS_FILE, JSON.stringify(records, null, 2));
  } catch (error) {
    console.error("Streak records kaydetme hatası:", error);
  }
};

const getCurrentTeamPlayers = (teamId: number): Array<{auth: string, username: string}> => {
  return room.getPlayerList()
    .filter(p => p.team === teamId)
    .map(p => ({
      auth: p.auth,
      username: extractRealUsername(p.name)
    }));
};

const checkAndUpdateStreakRecord = (team: number, count: number): void => {
  const records = loadStreakRecords();
  
  // Get current team players - only proceed if we have players
  const currentPlayers = getCurrentTeamPlayers(team);
  if (currentPlayers.length === 0) {
    console.log("No players found for team, skipping record update");
    return; // Don't save empty records
  }
  
  // Create new record
  const newRecord: StreakRecord = {
    count: count,
    team: team,
    players: currentPlayers,
    achievedAt: Date.now()
  };
  
  // Check if it's a new all-time record
  if (!records.allTimeRecord || count > records.allTimeRecord.count) {
    records.allTimeRecord = newRecord;
    
    // Announce new record
    const teamName = getTeamName(team);
    const teamColor = getTeamColor(team);
    room.sendAnnouncement(
      `🏆 YENİ REKOR! ${teamName} takım ${count} maçlık seri ile yeni rekoru kırdı!`,
      undefined,
      teamColor,
      "bold",
      2
    );
  } else if (records.allTimeRecord && count === records.allTimeRecord.count && team === records.allTimeRecord.team) {
    // Same team extending their existing record - update it silently, but only if we have player data
    records.allTimeRecord = newRecord;
  }
  
  // Only save the all-time record now
  saveStreakRecords(records);
};

const roomBuilder = async (HBInit: Headless, args: RoomConfigObject) => {
  room = HBInit(args);
  db = await initDb();
  
  // Initialize VIP system
  const { initVipSystem } = await import("./src/vips");
  initVipSystem();
  
  const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
    encoding: "utf8",
    flag: "r",
  });
  room.setCustomStadium(rsStadium);
  room.setTimeLimit(5);
  room.setScoreLimit(3);
  room.setTeamsLock(true);
  if (process.env.DEBUG) {
    room.setScoreLimit(1);
    room.setTimeLimit(1);
  }
  room.startGame();

  // Otomatik mesajları başlat
  Discordinterval(); // 5 dakikada bir

  let i = 0;
  
  room.onTeamGoal = (team) => {
  if (game?.lastTouch?.byPlayer.team === team) {
    sendMessage(`Gol! Oyuncu ${game?.lastTouch?.byPlayer.name} gol attı! 🥅`);
    if (game?.previousTouch?.byPlayer.id !== game?.lastTouch?.byPlayer.id && game?.previousTouch?.byPlayer.team === game?.lastTouch?.byPlayer.team) {
      sendMessage(`${game?.previousTouch?.byPlayer.name} tarafından asist! 🎯`);
    }
  } else {
    sendMessage(`${game?.lastTouch?.byPlayer.name} tarafından kendi kalesine gol! 😱`);
  }
  
  // Gol sonrası skor kontrolü - 3 fark oldu mu?
  setTimeout(() => {
    checkScoreDifference();
  }, 100); // Skorun güncellenmesi için kısa bekleme
};

  room.onPlayerBallKick = (p) => {
  if (game) {
    const pp = toAug(p);
    
    // GÜÇ 0 KONTROLÜ
    if (pp.powerLevel === 0) {
      // SADECE bu sistemler çalışır
      teamplayBoost(game, p);
      handleLastTouch(game, pp);
      
      if (pp.activation > 20) {
        pp.activation = 0;
        room.setPlayerAvatar(p.id, "");
      }
      return;
    }
    
    // DETAYLI ANALIZ İÇİN VERİLERİ TOPLA
    const ball = room.getDiscProperties(0);
    const playerDisc = room.getPlayerDiscProperties(p.id);
    
    if (ball && playerDisc) {
      // VURUŞ ÖNCESİ DURUM
      const initialBallPos = { x: ball.x, y: ball.y };
      const initialBallSpeed = { x: ball.xspeed, y: ball.yspeed };
      const initialBallTotalSpeed = Math.sqrt(ball.xspeed ** 2 + ball.yspeed ** 2);
      const playerPos = { x: playerDisc.x, y: playerDisc.y };
      const playerSpeed = Math.sqrt(playerDisc.xspeed ** 2 + playerDisc.yspeed ** 2);
      
      // DEĞİŞKENLERİ TANIMLA
      let speedMultiplier = 1;
      let spinPower = 0;
      let spinDirection = { x: 0, y: 0 };
      
      // Vuruş açısını hesapla
      const dx = ball.x - playerDisc.x;
      const dy = ball.y - playerDisc.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Normalize edilmiş vuruş vektörü
      const hitX = dx / distance;
      const hitY = dy / distance;
      
      // Vuruş açısı (derece cinsinden)
      const hitAngleDegrees = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // Oyuncunun hareket açısı
      let playerMoveAngleDegrees = 0;
      let angleCoefficient = 0;
      
      if (playerSpeed > 0.1) {
        // Oyuncunun hareket vektörü
        const moveX = playerDisc.xspeed / playerSpeed;
        const moveY = playerDisc.yspeed / playerSpeed;
        
        // Oyuncunun hareket açısı
        playerMoveAngleDegrees = Math.atan2(playerDisc.yspeed, playerDisc.xspeed) * 180 / Math.PI;
        
        // Cross product (vektörel çarpım) - yan vuruşu tespit için
        const crossProduct = Math.abs(moveX * hitY - moveY * hitX);
        angleCoefficient = crossProduct;
        
        // Spin yönünü belirle
        const crossSign = moveX * hitY - moveY * hitX;
        
        // Takım ve pozisyona göre akıllı spin yönü
        if (p.team === 1) { // Kırmızı takım (sol taraf)
          if (ball.y < 0) { // Top üstte
            spinDirection.x = Math.abs(crossSign) * 0.7;
            spinDirection.y = Math.abs(crossSign) * 0.7;
          } else { // Top altta
            spinDirection.x = -Math.abs(crossSign) * 0.7;
            spinDirection.y = -Math.abs(crossSign) * 0.7;
          }
        } else if (p.team === 2) { // Mavi takım (sağ taraf)
          if (ball.y < 0) { // Top üstte
            spinDirection.x = -Math.abs(crossSign) * 0.7;
            spinDirection.y = Math.abs(crossSign) * 0.7;
          } else { // Top altta
            spinDirection.x = Math.abs(crossSign) * 0.7;
            spinDirection.y = -Math.abs(crossSign) * 0.7;
          }
        }
      }
      
      // FALSO VE DÜZ VURUŞ KARARI
      const isFalso = angleCoefficient > 0.15;
      let shotType = "DÜZ VURUŞ";
      
      if (isFalso) {
        shotType = "FALSO";
        
        // KADEMELİ GÜÇ SİSTEMİ
        const baseSpeed = 1.20;
        const speedIncrement = 0.25;
        speedMultiplier = baseSpeed + (pp.powerLevel - 1.0) * speedIncrement;
        
        // Spin gücü
        const baseSpin = 2;
        const spinIncrement = 2;
        spinPower = (baseSpin + (pp.powerLevel - 1.0) * spinIncrement) * angleCoefficient;
        spinPower = Math.min(spinPower, 15);
        
        // Spin uygula
        game.ballRotation = {
          x: spinDirection.x,
          y: spinDirection.y,
          power: spinPower,
          targetPower: 0,
          accelerationRate: 0
        };
        
        // Top hızını ayarla
        room.setDiscProperties(0, {
          xspeed: ball.xspeed * speedMultiplier,
          yspeed: ball.yspeed * speedMultiplier,
          invMass: defaults.ballInvMass
        });
        
        // Falso mesajı
        if (spinPower > 8) {
          room.setPlayerAvatar(p.id, "🌀");
          setTimeout(() => room.setPlayerAvatar(p.id, ""), 800);
        }
        
      } else {
        // DÜZ VURUŞ
        const baseSpeed = 1.20;
        const speedIncrement = 0.35;
        speedMultiplier = baseSpeed + (pp.powerLevel - 1.0) * speedIncrement;
        
        // Falsoyu tamamen sıfırla
        game.ballRotation = {
          x: 0,
          y: 0,
          power: 0,
          targetPower: 0,
          accelerationRate: 0
        };
        
        // Normal hız uygula
        room.setDiscProperties(0, {
          xspeed: ball.xspeed * speedMultiplier,
          yspeed: ball.yspeed * speedMultiplier,
          invMass: defaults.ballInvMass * 0.9
        });
      }
      
      // VURUŞ SONRASI DURUM - Çoklu ölçüm (falso etkisi zamanla görünür)
      let measurementCount = 0;
      const measurements: any[] = [];
      
      const measureBallState = () => {
        const currentBall = room.getDiscProperties(0);
        if (!currentBall) return;
        
        const currentSpeed = Math.sqrt(currentBall.xspeed ** 2 + currentBall.yspeed ** 2);
        const currentAngle = Math.atan2(currentBall.yspeed, currentBall.xspeed) * 180 / Math.PI;
        
        measurements.push({
          time: measurementCount * 100,
          pos: { x: currentBall.x, y: currentBall.y },
          speed: currentSpeed,
          angle: currentAngle
        });
        
        measurementCount++;
        
        if (measurementCount < 5) { // 5 ölçüm yap (0-400ms arası)
          setTimeout(measureBallState, 100);
        } else {
          // Tüm ölçümler tamamlandı, analiz yap
          analyzeFalsoEffect();
        }
      };
      
      const analyzeFalsoEffect = () => {
        if (measurements.length < 2) return;
        
        const initialMeasurement = measurements[0];
        const finalMeasurement = measurements[measurements.length - 1];
        
        const finalBallSpeed = finalMeasurement.speed;
        const finalBallAngleDegrees = finalMeasurement.angle;
        
        // Hız değişimi analizi
        const speedChange = finalBallSpeed - initialBallTotalSpeed;
        const speedChangePercent = ((speedChange / initialBallTotalSpeed) * 100);
        
        // Açı değişimi analizi - İLK ÖLÇÜMLE KARŞILAŞTIR
        const initialBallAngleDegrees = Math.atan2(initialBallSpeed.y, initialBallSpeed.x) * 180 / Math.PI;
        let angleDifference = finalBallAngleDegrees - initialBallAngleDegrees;
        
        // Açı farkını -180 ile +180 arasında normalize et
        if (angleDifference > 180) angleDifference -= 360;
        if (angleDifference < -180) angleDifference += 360;
        
        // FALSO ETKİSİ ANALİZİ - Ölçümler arası açı değişimi
        const angleChanges: number[] = [];
        for (let i = 1; i < measurements.length; i++) {
          let angleChange = measurements[i].angle - measurements[i-1].angle;
          if (angleChange > 180) angleChange -= 360;
          if (angleChange < -180) angleChange += 360;
          angleChanges.push(angleChange);
        }
        
        const totalAngleDeviation = angleChanges.reduce((sum, change) => sum + Math.abs(change), 0);
        const maxAngleChange = Math.max(...angleChanges.map(Math.abs));
        
        // KALE MESAFE ANALİZİ
        const goalX = p.team === 1 ? 1150 : -1150; // Sağ kale: 1150, Sol kale: -1150
        const goalCenterY = 0;
        const goalTop = -124;
        const goalBottom = 124;
        
        const distanceToGoal = Math.sqrt((finalMeasurement.pos.x - goalX) ** 2 + (finalMeasurement.pos.y - goalCenterY) ** 2);
        const willHitGoal = Math.abs(finalMeasurement.pos.y) <= 124 && 
                           ((p.team === 1 && finalMeasurement.pos.x > goalX - 50) || 
                            (p.team === 2 && finalMeasurement.pos.x < goalX + 50));
        
        // Takım bilgisi
        const teamName = p.team === 1 ? "KIRMIZI" : p.team === 2 ? "MAVİ" : "SPEC";
        const teamEmoji = p.team === 1 ? "🔴" : p.team === 2 ? "🔵" : "⚪";
        
        // Pozisyon bilgisi
        const fieldZone = getFieldZone(playerPos.x, playerPos.y);
        const ballZone = getFieldZone(initialBallPos.x, initialBallPos.y);
        
        // DETAYLI CONSOLE LOG
        console.log(`\n🏆 ===== FALSO ANALİZİ ===== 🏆`);
        console.log(`${teamEmoji} Oyuncu: ${extractRealUsername(p.name)} (${teamName} Takım)`);
        console.log(`⚽ Güç Seviyesi: ${pp.powerLevel.toFixed(1)}/5.0 ${pp.powerLevel > 0 ? '⚡' : '⚪'}`);
        console.log(`📍 Vuruş Türü: ${shotType} ${isFalso ? '🌀' : '➡️'}`);
        
        console.log(`\n📊 VURUŞ ÖNCESİ DURUM:`);
        console.log(`  👤 Oyuncu Pos: (${playerPos.x.toFixed(1)}, ${playerPos.y.toFixed(1)}) - ${fieldZone}`);
        console.log(`  ⚽ Top Pos: (${initialBallPos.x.toFixed(1)}, ${initialBallPos.y.toFixed(1)}) - ${ballZone}`);
        console.log(`  🏃 Oyuncu Hızı: ${playerSpeed.toFixed(2)} (${playerMoveAngleDegrees.toFixed(1)}°)`);
        console.log(`  ⚽ Top Hızı: ${initialBallTotalSpeed.toFixed(2)} (${initialBallAngleDegrees.toFixed(1)}°)`);
        console.log(`  📐 Vuruş Açısı: ${hitAngleDegrees.toFixed(1)}°`);
        console.log(`  🎯 Mesafe: ${distance.toFixed(2)}`);
        
        console.log(`\n🔬 VURUŞ ANALİZİ:`);
        console.log(`  📈 Açı Katsayısı: ${angleCoefficient.toFixed(3)} (Eşik: 0.15)`);
        console.log(`  ⚡ Hız Çarpanı: ${speedMultiplier.toFixed(2)}x`);
        
        if (isFalso) {
          console.log(`  🌀 Spin Gücü: ${spinPower.toFixed(2)}/15`);
          console.log(`  🎯 Spin Yönü: (${spinDirection.x.toFixed(2)}, ${spinDirection.y.toFixed(2)})`);
          console.log(`  🔥 Falso Şiddeti: ${spinPower > 8 ? 'YÜKSEK 🌀' : 'ORTA 〰️'}`);
        } else {
          console.log(`  ➡️ Düz Vuruş - Spin YOK`);
        }
        
        console.log(`\n📊 FALSO ETKİSİ ANALİZİ:`);
        console.log(`  🔄 Toplam Açı Sapması: ${totalAngleDeviation.toFixed(2)}° (${measurements.length} ölçüm)`);
        console.log(`  📈 Maksimum Anlık Sapma: ${maxAngleChange.toFixed(2)}°`);
        console.log(`  📍 Yörünge Eğriliği: ${totalAngleDeviation > 2 ? 'EĞRI 🌀' : totalAngleDeviation > 0.5 ? 'HAFİF EĞRİ 〰️' : 'DÜZ ➡️'}`);
        
        // Ölçüm detayları
        console.log(`\n📈 ZAMAN İÇİNDE DEĞİŞİM:`);
        measurements.forEach((m, i) => {
          const angleChangeStr = i > 0 ? ` (${angleChanges[i-1] > 0 ? '+' : ''}${angleChanges[i-1].toFixed(1)}°)` : '';
          console.log(`  ${i*100}ms: Pos(${m.pos.x.toFixed(1)}, ${m.pos.y.toFixed(1)}) Hız:${m.speed.toFixed(1)} Açı:${m.angle.toFixed(1)}°${angleChangeStr}`);
        });
        
        console.log(`\n📊 VURUŞ SONRASI DURUM:`);
        console.log(`  ⚽ Son Top Hızı: ${finalBallSpeed.toFixed(2)} (${finalBallAngleDegrees.toFixed(1)}°)`);
        console.log(`  📈 Hız Değişimi: ${speedChange > 0 ? '+' : ''}${speedChange.toFixed(2)} (${speedChangePercent > 0 ? '+' : ''}${speedChangePercent.toFixed(1)}%)`);
        console.log(`  🔄 Net Açı Sapması: ${angleDifference > 0 ? '+' : ''}${angleDifference.toFixed(1)}°`);
        
        console.log(`\n🥅 KALE ANALİZİ:`);
        console.log(`  🎯 Kaleye Mesafe: ${distanceToGoal.toFixed(1)} birim`);
        console.log(`  📍 Son Pozisyon Y: ${finalMeasurement.pos.y.toFixed(1)} (Kale: -124 ile +124 arası)`);
        console.log(`  ⚽ Kaleye Girecek mi: ${willHitGoal ? '✅ EVET' : '❌ HAYIR'}`);
        if (!willHitGoal) {
          const missDirection = finalMeasurement.pos.y > 124 ? 'ÜST' : finalMeasurement.pos.y < -124 ? 'ALT' : 'KALENIN ÖNÜ';
          console.log(`  🎯 Iskalama Yönü: ${missDirection}`);
        }
        
        console.log(`\n🎨 GÖRSELLEŞTİRME:`);
        console.log(`  ${getSpeedBar(finalBallSpeed)} Hız: ${finalBallSpeed.toFixed(1)}`);
        console.log(`  ${getSpinBar(spinPower)} Spin: ${spinPower.toFixed(1)}`);
        console.log(`  ${getPowerBar(pp.powerLevel)} Güç: ${pp.powerLevel.toFixed(1)}`);
        console.log(`  ${getCurveBar(totalAngleDeviation)} Eğrilik: ${totalAngleDeviation.toFixed(1)}°`);
        
        console.log(`\n🏁 SONUÇ ÖZET:`);
        console.log(`  📍 ${shotType} - ${teamName} takımdan ${extractRealUsername(p.name)}`);
        console.log(`  🎯 ${fieldZone} → ${getTrajectoryDescription(totalAngleDeviation, speedChangePercent)}`);
        console.log(`  🥅 ${willHitGoal ? 'GOL POTANSİYELİ ⚽' : 'KAÇTI 😞'}`);
        console.log(`===========================================\n`);
      };
      
      // İlk ölçümü hemen başlat
      setTimeout(measureBallState, 10);
      
      // Güç sıfırla
      pp.powerLevel = 0;
      room.setPlayerAvatar(p.id, "");
    }
    
    // Diğer sistemler
    handleLastTouch(game, pp);
    
    if (pp.activation > 20) {
      pp.activation = 0;
      room.setPlayerAvatar(p.id, "");
    }
  }
};

  room.onGameTick = () => {
    if (!game) {
      return;
    }
    try {
      i++;
      game.handleBallTouch();
      if (i > 6) {
        if (game.inPlay) {
          game.handleBallOutOfBounds();
          game.rotateBall();
        } else {
          game.handleBallInPlay();
        }
        game.applySlowdown();
        // afk.onTick(); // This line is removed as per the edit hint
        game.checkAllX();
        game.checkFoul();
        
        // Auto-clean expired VIPs
        import("./src/vips").then(({ autoCleanVips }) => {
          autoCleanVips();
        });
        
        i = 0;
      }
    } catch (e) {
      console.log("Hata:", e);
    }
  };

  room.onPlayerActivity = (p) => {
    // afk.onActivity(p); // This line is removed as per the edit hint
  };

  room.onPlayerJoin = async (p) => {
    if (!p.auth) {
      room.kickPlayer(p.id, "Auth anahtarınız geçersiz. haxball.com/playerauth adresinden değiştirin", false);
      return
    }
    
    // Check if player is banned
    const { isPlayerBanned, getBanReason } = await import("./src/command");
    if (await isPlayerBanned(p.auth)) {
      const banReason = await getBanReason(p.auth);
      room.kickPlayer(p.id, banReason, true);
      return;
    }
    
    // Check VIP/Admin slot restriction (slots 16-20 are reserved)
    const currentPlayerCount = room.getPlayerList().length;
    if (currentPlayerCount >= 15) {
      const { isPlayerVip } = await import("./src/vips");
      const isAdmin = room.getPlayerList().some(player => player.admin && player.auth === p.auth);
      
      if (!isPlayerVip(p.auth) && !isAdmin) {
        room.kickPlayer(p.id, "🌟 Son 5 slot VIP için ayrılmıştır! VIP olmak için Discord sunucumuza katılın.", false);
        return;
      }
    }
    
    // Check for profanity in username using our detection system
    const { detectProfanity, supheliKufurAlgila, filterName } = await import("./src/profanity");
    const realUsername = extractRealUsername(p.name);
    
    // Check for Discord patterns and invisible characters
    if (filterName(realUsername)) {
      room.kickPlayer(p.id, "⚠️ Geçersiz kullanıcı adı formatı. Discord etiketleri, görünmez karakterler veya özel karakterler kullanılamaz.", false);
      return;
    }
    
    // Basic profanity filter for names
    if (detectProfanity(realUsername)) {
      room.sendAnnouncement(`⚠️ ${p.name}, kullanıcı adınız yasaklı kelimeler içeriyor. Lütfen adınızı değiştirin!`, p.id, 0xFF0000, "bold", 2);
      room.kickPlayer(p.id, "Yasaklı kullanıcı adı.", false);
      return;
    }

    // Advanced suspicious profanity detection for names
    if (supheliKufurAlgila(realUsername)) {
      room.kickPlayer(p.id, "⚠️ Hakaret içerikli isimle odaya giremezsiniz!", true);
      return;
    }
    
    // Check if same username already exists
    const existingUsernames = players.map((player) => extractRealUsername(player.name));
    if (existingUsernames.includes(realUsername)) {
      room.kickPlayer(p.id, "Bu kullanıcı adı zaten kullanılıyor. Farklı bir isim seçin.", false);
      return;
    }
    
    if (process.env.DEBUG) {
      room.setPlayerAdmin(p.id, true);
    } else {
      // Check for duplicate connections if the system is enabled
      if (getDuplicateBlockingEnabled() && players.map((p) => p.auth).includes(p.auth)) {
        room.kickPlayer(p.id, "Zaten sunucudasınız.", false);
        return
      }
    }
    
    // All validation passed - now initialize the player
    welcomePlayer(room, p);
    room.setPlayerAvatar(p.id, "");
    await initPlayer(p);
    
    // Check if player is VIP and show welcome message
    const { isPlayerVip } = await import("./src/vips");
    if (isPlayerVip(p.auth)) {
      room.sendAnnouncement(
        `[🌟VIP] ${realUsername} Odaya Giriş Yaptı.`,
        undefined,
        0xFFFF00, // Yellow color
        "normal",
        1
      );
    }
    
    // Console'a oyuncu girişi logla
    console.log(`${realUsername}, odaya girdi!`);
    
    addToGame(room, p);
  };

  room.onPlayerLeave = async (p) => {
    try {
      const leavingPlayer = toAug(p);
      players = players.filter((pp) => p.id != pp.id);
      await handlePlayerLeaveOrAFK(leavingPlayer);
    } catch (error) {
      // Player was likely kicked before being properly added to players array
      console.warn(`[onPlayerLeave] Player ${p.id} not found in players array - likely kicked during join. Cleaning up anyway.`);
      players = players.filter((pp) => p.id != pp.id);
      // Still call handlePlayerLeaveOrAFK without the leavingPlayer object
      await handlePlayerLeaveOrAFK();
    }
  };

  room.onPlayerChat = (p, msg) => {
    const pp = toAug(p);
    
    // Console'a mesaj logla
    const realUsername = extractRealUsername(p.name);
    console.log(`[CHAT] ${realUsername}: ${msg}`);
    
    if (process.env.DEBUG) {
      if (msg == "a") {
        room.setPlayerDiscProperties(p.id, { x: -10 });
      }
    }
    if (msg == "!debug") {
      console.log(game);
      return false;
    }

    // Handle team selection numbers (priority over commands)
    if (isSelectionActive()) {
      console.log(`[CHAT] Selection is active, checking message: "${msg}" from ${pp.name}`);
      const numberMatch = msg.trim().match(/^\d+$/);
      if (numberMatch) {
        console.log(`[CHAT] Number detected: ${msg}, calling handleSelection`);
        // Handle async selection without blocking
        handleSelection(pp, msg.trim()).then(handled => {
          console.log(`[CHAT] handleSelection returned: ${handled}`);
        }).catch(error => {
          console.error(`[CHAT] handleSelection error: ${error}`);
        });
        return false; // Always consume selection messages
      }
    }

    if (isCommand(msg)) {
      // Handle async command without blocking
      handleCommand(pp, msg).catch(error => {
        console.error("Command error:", error);
        sendMessage("Komut işlenirken hata oluştu.", pp);
      });
      return false;
    }

    // Handle message with mute checks
    playerMessage(pp, msg).catch(error => {
      console.error("Message handling error:", error);
    });
    return false; // Always return false to prevent default message handling
  };

  room.onGameStart = (_) => {
  
  // Skorları sıfırla
  finalScores = null;
  
  players.forEach((p) => {
    p.slowdownUntil = 0;
    p.foulsMeter = 0;
    p.cardsAnnounced = 0;
    p.activation = 0;
    p.sliding = false;
    p.slowdown = 0;
    p.slowdownUntil = 0;
    p.cooldownUntil = 0;
    p.canCallFoulUntil = 0;
  });
  if (!duringDraft) {
    game = new Game();
  }
  clearThrowInBlocks();
  room.getPlayerList().forEach((p) => room.setPlayerAvatar(p.id, ""));
  
  // Announce current win streak after a short delay
  setTimeout(() => {
    announceCurrentStreak();
  }, 2000); // 2 seconds delay to let players see the game start
};

  room.onPositionsReset = () => {
    clearThrowInBlocks();
    if (game) {
      game.animation = false;
      room.setDiscProperties(0, {
        xspeed: 0,
        yspeed: 0,
        xgravity: 0,
        ygravity: 0,
      }); // without this, there was one tick where the ball's gravity was applied, and the ball has moved after positions reset.
      // Rotasyon verilerini tamamen sıfırla
      game.ballRotation = { 
        x: 0, 
        y: 0, 
        power: 0,
        targetPower: 0,
        accelerationRate: 0
      };
    }
  };

  room.onGameStop = (byUser) => {
  
  if (game) {
    
    // Check if this was an admin-initiated stop (like !rs command)
    if (isAdminGameStop) {
      console.log(`[GAME_STOP] Admin-initiated stop detected - skipping normal end game logic`);
      isAdminGameStop = false; // Reset flag
      game = null;
      return;
    }
    
    // Check if game ended by forfeit first
    if (game.endedByForfeit.hasForfeited) {
      // Game ended by forfeit - winner already determined
      const winningTeam = game.endedByForfeit.winningTeam;
      const forfeitingTeam = game.endedByForfeit.forfeitingTeam;
      
      updateWinStreak(winningTeam);
      
      // Apply rotation after forfeit
      setTimeout(() => {
        applyTeamRotation(winningTeam, forfeitingTeam);
      }, 2000);
      
      game = null;
      return;
    }
    
    // Eğer finalScores varsa (3 farkla bitti)
    if (finalScores && (finalScores.red > 0 || finalScores.blue > 0)) {
      
      // Kazanan ve kaybeden takımı belirle
      let winnerTeam: number;
      let loserTeam: number;
      
      if (finalScores.red > finalScores.blue) {
        winnerTeam = 1; // Red kazandı
        loserTeam = 2;  // Blue kaybetti
        sendMessage(`🏆 Kırmızı takım kazandı! (${finalScores.red}-${finalScores.blue})`);
        // Update win streak
        updateWinStreak(winnerTeam);
      } else if (finalScores.blue > finalScores.red) {
        winnerTeam = 2; // Blue kazandı
        loserTeam = 1;  // Red kaybetti
        sendMessage(`🏆 Mavi takım kazandı! (${finalScores.blue}-${finalScores.red})`);
        // Update win streak
        updateWinStreak(winnerTeam);
      } else {
        // Beraberlik durumu (teorik olarak bu duruma gelmez çünkü 3 farkla bitiyor)
        finalScores = null;
        game = null;
        return;
      }
      
      // Rotasyon sistemini uygula
      setTimeout(() => {
        applyTeamRotation(winnerTeam, loserTeam);
        finalScores = null; // Skorları temizle
      }, 2000);
      
    } else {
      // Normal durum (admin durdurdu, süre bitti vb.)
      // Check scores to determine winner for streak tracking
      const scores = room.getScores();
      if (scores && scores.red !== scores.blue) {
        // There was a winner
        const winnerTeam = scores.red > scores.blue ? 1 : 2;
        const winnerName = getTeamName(winnerTeam);
        sendMessage(`🏆 ${winnerName} takım kazandı! (${scores.red}-${scores.blue})`);
        // Update win streak
        updateWinStreak(winnerTeam);
      } else {
        // Draw or no scores - check if current streak was a record before resetting
        if (winStreak.count >= 1 && winStreak.team !== 0) {
          checkAndUpdateStreakRecord(winStreak.team, winStreak.count);
        }
        
        // Reset streak
        winStreak.team = 0;
        winStreak.count = 0;
        sendMessage("🤝 Maç berabere bitti!");
      }
      
      setTimeout(() => {
        sendMessage("🚀 Yeni maç başlatılıyor...");
        room.startGame();
      }, 1000);
    }
    
    game = null;
  } else {
  }
};

  room.onPlayerTeamChange = (changedPlayer) => {
  if (process.env.DEBUG) {
    //room.setPlayerDiscProperties(changedPlayer.id, {x: -10, y: 0})
  }

  const MAX_PLAYERS_PER_TEAM = 6;

  // Eğer oyuncu spectator'a geçiyorsa izin ver
  if (changedPlayer.team === 0) {
    toAug(changedPlayer).team = changedPlayer.team;
    return;
  }

  // DÜZELTME: Takımdaki oyuncu sayısını kontrol et (değişen oyuncuyu DAHIL ETMEDİğİMİZ sayım)
  // changedPlayer henüz tam olarak takıma geçmemiş durumda, bu yüzden onu hariç tut
  const teamPlayerCount = room.getPlayerList().filter(p => 
    p.team === changedPlayer.team && p.id !== changedPlayer.id
  ).length;

  // Eğer takım doluysa (6 kişi varsa), 7. oyuncuyu spectator'a al
  if (teamPlayerCount >= MAX_PLAYERS_PER_TEAM) {
    room.setPlayerTeam(changedPlayer.id, 0);
    sendMessage(`❌ Her takımda en fazla ${MAX_PLAYERS_PER_TEAM} oyuncu olabilir!`);
    sendMessage(`Takım ${changedPlayer.team} dolu (${teamPlayerCount}/${MAX_PLAYERS_PER_TEAM})`, changedPlayer);
    return;
  }

  // Takıma geçiş onaylandı
  toAug(changedPlayer).team = changedPlayer.team;
};

  room.onRoomLink = (url) => {
    console.log(`Oda bağlantısı: ${url}`);
    console.log(`Admin Şifresi: ${adminPass}`);
  };

  initChooser(room); // must be called at the end
};

export default roomBuilder;