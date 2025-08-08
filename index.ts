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
import { defaults } from "./src/settings";
import { afk } from "./src/afk";
import { initPlayer } from "./src/welcome";
import * as crypto from "node:crypto";

let finalScores: {red: number, blue: number} | null = null;

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
  ballRotation: { x: number; y: number; power: number };
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
    this.ballRotation = { x: 0, y: 0, power: 0 };
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
      if (this.gameState === "throw_in" || this.gameState === "penalty") { // Taç atışı ve penaltıda güç yok
        this.ballTouchDuration = 0;
        this.lastTouchingPlayer = null;
        pAug.powerLevel = 0;
        room.setPlayerAvatar(p.id, "");
      } else { // Diğer durumlar için güç yükleme var
        if (this.lastTouchingPlayer?.id === p.id) {
          this.ballTouchDuration += 1/60; // Her tick 1/60 saniye
        } else {
          // Yeni oyuncu topa dokunmaya başladı
          this.ballTouchDuration = 0;
          this.lastTouchingPlayer = p;
        }
        
        // Güç seviyesini hesapla (1 saniye bekle, sonra 0.8 saniyede 1 level)
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
          // 0.5 saniye sonra 0.8 saniyede bir level artır
          powerLevel = Math.min(Math.floor((this.ballTouchDuration - 0.5) / 0.8) + 1, maxPower);
        }
        
        // Avatar güncelle
        const powerAvatars = ["", "①", "②", "③", "④", "⑤"];
        room.setPlayerAvatar(p.id, powerAvatars[powerLevel] || "");
        
        // Güç seviyesini kaydet
        pAug.powerLevel = powerLevel;
      }
      
      handleLastTouch(this, pAug);
    }

    // Teamplay kontrolleri
    if ((this.lastKick?.team == p.team) || !this.inPlay) { continue }
    const distPredicted = Math.sqrt(((prop.x+prop.xspeed*2) - (ball.x+ball.xspeed*2)) ** 2 + ((prop.y+prop.yspeed*2) - (ball.y+ball.yspeed*2)) ** 2);
    const isAlmostTouching = distPredicted < prop.radius + ball.radius + 5;
    if (isAlmostTouching) {
      this.boostCount = 0;
      this.lastKick = null;
      setBallInvMassAndColor(this);
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
    const allPlayers = room.getPlayerList();
    
    // Mevcut takımları topla ve isimleri ile logla
    const winners = allPlayers.filter(p => p.team === winnerTeam);
    const losers = allPlayers.filter(p => p.team === loserTeam);
    const spectators = allPlayers.filter(p => p.team === 0);

    // 1. Önce spec'dekileri kaybeden takıma al (kaybedenler spec'e geçmeden önce)
    const playersToMove = spectators.slice(0, 6); // Maksimum 6 kişi
    
    playersToMove.forEach(player => {
      room.setPlayerTeam(player.id, loserTeam);
    });
    
    if (playersToMove.length > 0) {
      const teamName = loserTeam === 1 ? 'Kırmızı' : 'Mavi';
      sendMessage(`🔄 ${playersToMove.length} izleyici oyuncu ${teamName} takıma geçti!`);
    }
    
    // 2 saniye bekle, sonra kaybedenleri spec'e al
    setTimeout(() => {
      
      // Güncel takım durumunu kontrol et
      const currentPlayers = room.getPlayerList();
      const currentLosers = currentPlayers.filter(p => p.team === loserTeam);
      
      // Orijinal kaybedenleri spec'e al (yeni gelenleri değil)
      losers.forEach(player => {
        const currentPlayer = room.getPlayer(player.id);
        if (currentPlayer && currentPlayer.team === loserTeam) {
          room.setPlayerTeam(player.id, 0);
        } else {
        }
      });
      
      sendMessage(`🔄 Eski ${loserTeam === 1 ? 'Kırmızı' : 'Mavi'} takım oyuncuları izleyiciye geçti...`);
      
      // Final durum kontrolü
      setTimeout(() => {
        const finalPlayers = room.getPlayerList();
        
        // Yeni maçı başlat
        sendMessage("🚀 Yeni maç başlatılıyor...");
        room.startGame();
      }, 1500);
      
    }, 2000); // 2 saniye bekle
    
  } catch (error) {
    console.error("Takım rotasyonu hatası:", error);
    sendMessage("⚠️ Takım rotasyonunda bir hata oluştu.");
    
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
    
    // Power shot uygula - SADECE güç seviyesi 0'dan büyükse
    if (pp.powerLevel > 0) {
      // Hemen uygula, setTimeout kullanma
      const ball = room.getDiscProperties(0);
      if (ball) {
        let speedMultiplier = 1;
        let spinPower = 0;
        
                 // Hızı ve falsoyu ayarla
         const props = room.getPlayerDiscProperties(p.id);
         let hasSpin = false;
         
         // Hareket kontrolü - Falso için
         if (props && (Math.abs(props.xspeed) > 0.1 || Math.abs(props.yspeed) > 0.1)) {
           hasSpin = true;
         }
         
         // Hızları ayarla (Falsolu ve düz vuruşlar için ayrı)
         if (hasSpin) {
           // Falsolu vuruş hızları
           switch(pp.powerLevel) {
             case 1:
               speedMultiplier = 1.15;
               spinPower = 3;
               break;
             case 2:
               speedMultiplier = 1.30;
               spinPower = 5;
               break;
             case 3:
               speedMultiplier = 1.50;
               spinPower = 7;
               break;
             case 4:
               speedMultiplier = 1.70;
               spinPower = 15; // Güçlü falso
               break;
             case 5:
               speedMultiplier = 1.89;
               spinPower = 20; // Çok güçlü falso
               break;
           }
           
           // Falso uygula
           if (props) {
             const spMagnitude = Math.sqrt(props.xspeed ** 2 + props.yspeed ** 2);
             const vecXsp = props.xspeed / spMagnitude;
             const vecYsp = props.yspeed / spMagnitude;
             
             game.ballRotation = {
               x: -vecXsp,
               y: -vecYsp,
               power: spinPower
             };
           }
         } else {
           // Düz vuruş hızları (Falso yok)
           switch(pp.powerLevel) {
             case 1:
               speedMultiplier = 1.10;
               break;
             case 2:
               speedMultiplier = 1.22;
               break;
             case 3:
               speedMultiplier = 1.26;
               break;
             case 4:
               speedMultiplier = 1.32;
               break;
             case 5:
               speedMultiplier = 1.44;
               break;
           }
           
           // Düz vuruşta falso sıfırla
           game.ballRotation = {
             x: 0,
             y: 0,
             power: 0
           };
         }
        
        // Hız çarpanlarını göster
        console.log(`Power Level ${pp.powerLevel}: Speed multiplier = ${speedMultiplier.toFixed(2)}x, Spin: ${hasSpin ? "Yes" : "No"}`);
        
        // Topu hızlandır
        room.setDiscProperties(0, {
          xspeed: ball.xspeed * speedMultiplier,
          yspeed: ball.yspeed * speedMultiplier,
          invMass: defaults.ballInvMass * 0.8 // Topu hafiflet
        });
        
        console.log(`Power shot! Level: ${pp.powerLevel}, Speed: ${speedMultiplier}x, Spin: ${spinPower}`);
      }
      
      // Güç sıfırla
      pp.powerLevel = 0;
      room.setPlayerAvatar(p.id, "");
    }
    // Eğer powerLevel 0 ise hiçbir güç uygulanmaz, normal vuruş olur
    
    // Diğer sistemler
    teamplayBoost(game, p);
    applyRotation(game, p);
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
        afk.onTick();
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
    afk.onActivity(p);
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
      if (players.map((p) => p.auth).includes(p.auth)) {
        room.kickPlayer(p.id, "Zaten sunucudasınız.", false);
        return
      }
    }
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
    const leavingPlayer = toAug(p);
    players = players.filter((pp) => p.id != pp.id);
    await handlePlayerLeaveOrAFK(leavingPlayer);
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
        const handled = handleSelection(pp, msg.trim());
        console.log(`[CHAT] handleSelection returned: ${handled}`);
        if (handled) return false; // Selection consumed the message
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
      game.ballRotation = { x: 0, y: 0, power: 0 };
    }
  };

  room.onGameStop = (byUser) => {
  
  if (game) {
    
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