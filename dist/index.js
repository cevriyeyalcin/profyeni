"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateWinStreak = exports.adminPass = exports.db = exports.game = exports.room = exports.toAug = exports.players = exports.Game = exports.PlayerAugmented = exports.version = void 0;
const chooser_1 = require("./src/chooser");
const command_1 = require("./src/command");
const message_1 = require("./src/message");
const out_1 = require("./src/out");
const superpower_1 = require("./src/superpower");
const offside_1 = require("./src/offside");
const foul_1 = require("./src/foul");
const fs = __importStar(require("fs"));
const slowdown_1 = require("./src/slowdown");
const chooser_2 = __importDefault(require("./src/chooser"));
const welcome_1 = require("./src/welcome");
const db_1 = require("./src/db");
const teamplayBoost_1 = require("./src/teamplayBoost");
const rotateBall_1 = require("./src/rotateBall");
const settings_1 = require("./src/settings");
const afk_1 = require("./src/afk");
const welcome_2 = require("./src/welcome");
const crypto = __importStar(require("node:crypto"));
let finalScores = null;
const STREAK_RECORDS_FILE = "streak_records.json";
// Win streak tracking
let winStreak = {
    team: 0, // 0 = no streak, 1 = red, 2 = blue
    count: 0
};
exports.version = '1.3.5 (25/04/2025)';
class PlayerAugmented {
    constructor(p) {
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
        return exports.room.getPlayer(this.id).position;
    }
}
exports.PlayerAugmented = PlayerAugmented;
let gameId = 0;
class Game {
    constructor() {
        this.ballTouchDuration = 0;
        this.lastTouchingPlayer = null;
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
        this.holdPlayers = JSON.parse(JSON.stringify(exports.players.map(p => { return { id: p.id, auth: p.auth, team: p.team }; })));
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
            red: new Set(),
            blue: new Set()
        };
        this.endedByForfeit = {
            hasForfeited: false,
            forfeitingTeam: 0,
            winningTeam: 0
        };
    }
    rotateBall() {
        (0, superpower_1.rotateBall)(this);
    }
    handleBallTouch() {
        var _a, _b;
        const ball = exports.room.getDiscProperties(0);
        if (!ball) {
            return;
        }
        let anyPlayerTouching = false;
        for (const p of exports.room.getPlayerList()) {
            const prop = exports.room.getPlayerDiscProperties(p.id);
            if (!prop) {
                continue;
            }
            const dist = Math.sqrt((prop.x - ball.x) ** 2 + (prop.y - ball.y) ** 2);
            const isTouching = dist < prop.radius + ball.radius + 0.1;
            if (isTouching) {
                anyPlayerTouching = true;
                const pAug = (0, exports.toAug)(p);
                pAug.sliding = false;
                // Güç yükleme sistemi - Durumlara göre farklı davranış
                if (this.gameState === "throw_in" || this.gameState === "penalty") { // Taç atışı ve penaltıda güç yok
                    this.ballTouchDuration = 0;
                    this.lastTouchingPlayer = null;
                    pAug.powerLevel = 0;
                    exports.room.setPlayerAvatar(p.id, "");
                }
                else { // Diğer durumlar için güç yükleme var
                    if (((_a = this.lastTouchingPlayer) === null || _a === void 0 ? void 0 : _a.id) === p.id) {
                        this.ballTouchDuration += 1 / 60; // Her tick 1/60 saniye
                    }
                    else {
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
                    exports.room.setPlayerAvatar(p.id, powerAvatars[powerLevel] || "");
                    // Güç seviyesini kaydet
                    pAug.powerLevel = powerLevel;
                }
                (0, offside_1.handleLastTouch)(this, pAug);
            }
            // Teamplay kontrolleri
            if ((((_b = this.lastKick) === null || _b === void 0 ? void 0 : _b.team) == p.team) || !this.inPlay) {
                continue;
            }
            const distPredicted = Math.sqrt(((prop.x + prop.xspeed * 2) - (ball.x + ball.xspeed * 2)) ** 2 + ((prop.y + prop.yspeed * 2) - (ball.y + ball.yspeed * 2)) ** 2);
            const isAlmostTouching = distPredicted < prop.radius + ball.radius + 5;
            if (isAlmostTouching) {
                this.boostCount = 0;
                this.lastKick = null;
                (0, teamplayBoost_1.setBallInvMassAndColor)(this);
            }
        }
        // Hiç kimse dokunmuyorsa sıfırla
        if (!anyPlayerTouching) {
            this.ballTouchDuration = 0;
            if (this.lastTouchingPlayer) {
                exports.room.setPlayerAvatar(this.lastTouchingPlayer.id, "");
            }
            this.lastTouchingPlayer = null;
        }
    }
    handleBallOutOfBounds() {
        (0, out_1.handleBallOutOfBounds)(this);
    }
    handleBallInPlay() {
        (0, out_1.handleBallInPlay)(this);
    }
    checkAllX() {
        (0, superpower_1.checkAllX)(this);
    }
    checkFoul() {
        (0, foul_1.checkFoul)(this);
    }
    applySlowdown() {
        (0, slowdown_1.applySlowdown)();
    }
}
exports.Game = Game;
exports.players = [];
let toAug = (p) => {
    const found = exports.players.find((pp) => pp.id == p.id);
    if (!found) {
        throw `${p.id} ID'li oyuncu aranırken hata oluştu. Oyuncu, oyuncular dizisinde bulunamadı: ${JSON.stringify(exports.players)}`;
    }
    return found;
};
exports.toAug = toAug;
exports.adminPass = crypto.randomBytes(6).toString("hex");
const checkScoreDifference = () => {
    try {
        const scores = exports.room.getScores();
        if (!scores)
            return;
        const scoreDifference = Math.abs(scores.red - scores.blue);
        // 3 fark varsa oyunu bitir
        if (scoreDifference >= 3) {
            const leadingTeam = scores.red > scores.blue ? 'Kırmızı' : 'Mavi';
            const leadingScore = Math.max(scores.red, scores.blue);
            const losingScore = Math.min(scores.red, scores.blue);
            // SKORLARI SAKLA
            finalScores = { red: scores.red, blue: scores.blue };
            (0, message_1.sendMessage)(`🏁 Oyun 3 fark nedeniyle sona erdi! ${leadingTeam} takım galip! (${leadingScore}-${losingScore})`);
            // Oyunu durdur
            exports.room.stopGame();
        }
    }
    catch (error) {
        console.error("Skor farkı kontrol hatası:", error);
    }
};
// Bu fonksiyonu index.ts'te güncelleyin:
const applyTeamRotation = (winnerTeam, loserTeam) => {
    try {
        const allPlayers = exports.room.getPlayerList();
        // Mevcut takımları topla ve isimleri ile logla
        const winners = allPlayers.filter(p => p.team === winnerTeam);
        const losers = allPlayers.filter(p => p.team === loserTeam);
        const spectators = allPlayers.filter(p => p.team === 0);
        // 1. Önce spec'dekileri kaybeden takıma al (kaybedenler spec'e geçmeden önce)
        const playersToMove = spectators.slice(0, 6); // Maksimum 6 kişi
        playersToMove.forEach(player => {
            exports.room.setPlayerTeam(player.id, loserTeam);
        });
        if (playersToMove.length > 0) {
            const teamName = loserTeam === 1 ? 'Kırmızı' : 'Mavi';
            (0, message_1.sendMessage)(`🔄 ${playersToMove.length} izleyici oyuncu ${teamName} takıma geçti!`);
        }
        // 2 saniye bekle, sonra kaybedenleri spec'e al
        setTimeout(() => {
            // Güncel takım durumunu kontrol et
            const currentPlayers = exports.room.getPlayerList();
            const currentLosers = currentPlayers.filter(p => p.team === loserTeam);
            // Orijinal kaybedenleri spec'e al (yeni gelenleri değil)
            losers.forEach(player => {
                const currentPlayer = exports.room.getPlayer(player.id);
                if (currentPlayer && currentPlayer.team === loserTeam) {
                    exports.room.setPlayerTeam(player.id, 0);
                }
                else {
                }
            });
            (0, message_1.sendMessage)(`🔄 Eski ${loserTeam === 1 ? 'Kırmızı' : 'Mavi'} takım oyuncuları izleyiciye geçti...`);
            // Final durum kontrolü
            setTimeout(() => {
                const finalPlayers = exports.room.getPlayerList();
                // Yeni maçı başlat
                (0, message_1.sendMessage)("🚀 Yeni maç başlatılıyor...");
                exports.room.startGame();
            }, 1500);
        }, 2000); // 2 saniye bekle
    }
    catch (error) {
        console.error("Takım rotasyonu hatası:", error);
        (0, message_1.sendMessage)("⚠️ Takım rotasyonunda bir hata oluştu.");
        // Hata durumunda da maçı yeniden başlat
        setTimeout(() => {
            exports.room.startGame();
        }, 2000);
    }
};
// Helper function to extract real username from HaxBall formatted name
const extractRealUsername = (formattedName) => {
    // HaxBall format: "[#ID] Username" - we want just "Username"
    const match = formattedName.match(/^\[#\d+\]\s*(.+)$/);
    return match ? match[1] : formattedName;
};
// Win streak functions
const getTeamName = (teamId) => {
    return teamId === 1 ? "Kırmızı" : "Mavi";
};
const getTeamColor = (teamId) => {
    return teamId === 1 ? 0xFF4040 : 0x12C4FF; // Red or Blue (matching VIP colors)
};
const announceWinStreak = (team, count) => {
    const teamName = getTeamName(team);
    const teamColor = getTeamColor(team);
    let message = "";
    if (count >= 1 && count <= 9) {
        message = `${teamName} takım ${count} maçtır kazanıyor`;
    }
    else if (count === 10) {
        message = `${teamName} takım ortalığı kasıp kavuruyor, 10 maçtır yenilgi görmediler!`;
    }
    else if (count >= 11 && count <= 19) {
        message = `${teamName} takım ortalığı kasıp kavuruyor, ${count} maçtır yenilgi görmediler!`;
    }
    else if (count === 20) {
        message = `${teamName} takım adeta rakip tanımıyor önüne geleni ezdi! 20 maçtır kaybetmiyorlar!`;
    }
    else if (count > 20) {
        message = `${teamName} takım adeta rakip tanımıyor önüne geleni ezdi! ${count} maçtır kaybetmiyorlar!`;
    }
    if (message) {
        exports.room.sendAnnouncement(`🔥 ${message}`, undefined, teamColor, "bold", 1);
    }
};
const updateWinStreak = (winnerTeam) => {
    if (winStreak.team === winnerTeam) {
        // Same team won again, increment streak
        winStreak.count++;
        // Check if current streak broke the all-time record
        const records = loadStreakRecords();
        if (!records.allTimeRecord || winStreak.count > records.allTimeRecord.count) {
            // New record! Record it immediately
            checkAndUpdateStreakRecord(winStreak.team, winStreak.count);
        }
    }
    else {
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
exports.updateWinStreak = updateWinStreak;
const announceCurrentStreak = () => {
    if (winStreak.count >= 1) {
        announceWinStreak(winStreak.team, winStreak.count);
    }
};
// Streak records functions
const loadStreakRecords = () => {
    try {
        if (fs.existsSync(STREAK_RECORDS_FILE)) {
            const data = fs.readFileSync(STREAK_RECORDS_FILE, 'utf8');
            return JSON.parse(data);
        }
    }
    catch (error) {
        console.error("Streak records yükleme hatası:", error);
    }
    // Return default structure
    return {
        allTimeRecord: null,
        top10Records: []
    };
};
const saveStreakRecords = (records) => {
    try {
        fs.writeFileSync(STREAK_RECORDS_FILE, JSON.stringify(records, null, 2));
    }
    catch (error) {
        console.error("Streak records kaydetme hatası:", error);
    }
};
const getCurrentTeamPlayers = (teamId) => {
    return exports.room.getPlayerList()
        .filter(p => p.team === teamId)
        .map(p => ({
        auth: p.auth,
        username: extractRealUsername(p.name)
    }));
};
const checkAndUpdateStreakRecord = (team, count) => {
    const records = loadStreakRecords();
    // Get current team players - only proceed if we have players
    const currentPlayers = getCurrentTeamPlayers(team);
    if (currentPlayers.length === 0) {
        console.log("No players found for team, skipping record update");
        return; // Don't save empty records
    }
    // Create new record
    const newRecord = {
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
        exports.room.sendAnnouncement(`🏆 YENİ REKOR! ${teamName} takım ${count} maçlık seri ile yeni rekoru kırdı!`, undefined, teamColor, "bold", 2);
    }
    else if (records.allTimeRecord && count === records.allTimeRecord.count && team === records.allTimeRecord.team) {
        // Same team extending their existing record - update it silently, but only if we have player data
        records.allTimeRecord = newRecord;
    }
    // Only save the all-time record now
    saveStreakRecords(records);
};
const roomBuilder = (HBInit, args) => __awaiter(void 0, void 0, void 0, function* () {
    exports.room = HBInit(args);
    exports.db = yield (0, db_1.initDb)();
    // Initialize VIP system
    const { initVipSystem } = yield Promise.resolve().then(() => __importStar(require("./src/vips")));
    initVipSystem();
    const rsStadium = fs.readFileSync("./maps/rs5.hbs", {
        encoding: "utf8",
        flag: "r",
    });
    exports.room.setCustomStadium(rsStadium);
    exports.room.setTimeLimit(5);
    exports.room.setScoreLimit(3);
    exports.room.setTeamsLock(true);
    if (process.env.DEBUG) {
        exports.room.setScoreLimit(1);
        exports.room.setTimeLimit(1);
    }
    exports.room.startGame();
    // Otomatik mesajları başlat
    (0, message_1.Discordinterval)(); // 5 dakikada bir
    let i = 0;
    exports.room.onTeamGoal = (team) => {
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (((_a = exports.game === null || exports.game === void 0 ? void 0 : exports.game.lastTouch) === null || _a === void 0 ? void 0 : _a.byPlayer.team) === team) {
            (0, message_1.sendMessage)(`Gol! Oyuncu ${(_b = exports.game === null || exports.game === void 0 ? void 0 : exports.game.lastTouch) === null || _b === void 0 ? void 0 : _b.byPlayer.name} gol attı! 🥅`);
            if (((_c = exports.game === null || exports.game === void 0 ? void 0 : exports.game.previousTouch) === null || _c === void 0 ? void 0 : _c.byPlayer.id) !== ((_d = exports.game === null || exports.game === void 0 ? void 0 : exports.game.lastTouch) === null || _d === void 0 ? void 0 : _d.byPlayer.id) && ((_e = exports.game === null || exports.game === void 0 ? void 0 : exports.game.previousTouch) === null || _e === void 0 ? void 0 : _e.byPlayer.team) === ((_f = exports.game === null || exports.game === void 0 ? void 0 : exports.game.lastTouch) === null || _f === void 0 ? void 0 : _f.byPlayer.team)) {
                (0, message_1.sendMessage)(`${(_g = exports.game === null || exports.game === void 0 ? void 0 : exports.game.previousTouch) === null || _g === void 0 ? void 0 : _g.byPlayer.name} tarafından asist! 🎯`);
            }
        }
        else {
            (0, message_1.sendMessage)(`${(_h = exports.game === null || exports.game === void 0 ? void 0 : exports.game.lastTouch) === null || _h === void 0 ? void 0 : _h.byPlayer.name} tarafından kendi kalesine gol! 😱`);
        }
        // Gol sonrası skor kontrolü - 3 fark oldu mu?
        setTimeout(() => {
            checkScoreDifference();
        }, 100); // Skorun güncellenmesi için kısa bekleme
    };
    exports.room.onPlayerBallKick = (p) => {
        if (exports.game) {
            const pp = (0, exports.toAug)(p);
            // Power shot uygula - SADECE güç seviyesi 0'dan büyükse
            if (pp.powerLevel > 0) {
                // Hemen uygula, setTimeout kullanma
                const ball = exports.room.getDiscProperties(0);
                if (ball) {
                    let speedMultiplier = 1;
                    let spinPower = 0;
                    // Hızı ve falsoyu ayarla
                    const props = exports.room.getPlayerDiscProperties(p.id);
                    let hasSpin = false;
                    // Hareket kontrolü - Falso için
                    if (props && (Math.abs(props.xspeed) > 0.1 || Math.abs(props.yspeed) > 0.1)) {
                        hasSpin = true;
                    }
                    // Hızları ayarla (Falsolu ve düz vuruşlar için ayrı)
                    if (hasSpin) {
                        // Falsolu vuruş hızları
                        switch (pp.powerLevel) {
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
                            exports.game.ballRotation = {
                                x: -vecXsp,
                                y: -vecYsp,
                                power: spinPower
                            };
                        }
                    }
                    else {
                        // Düz vuruş hızları (Falso yok)
                        switch (pp.powerLevel) {
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
                        exports.game.ballRotation = {
                            x: 0,
                            y: 0,
                            power: 0
                        };
                    }
                    // Hız çarpanlarını göster
                    console.log(`Power Level ${pp.powerLevel}: Speed multiplier = ${speedMultiplier.toFixed(2)}x, Spin: ${hasSpin ? "Yes" : "No"}`);
                    // Topu hızlandır
                    exports.room.setDiscProperties(0, {
                        xspeed: ball.xspeed * speedMultiplier,
                        yspeed: ball.yspeed * speedMultiplier,
                        invMass: settings_1.defaults.ballInvMass * 0.8 // Topu hafiflet
                    });
                    console.log(`Power shot! Level: ${pp.powerLevel}, Speed: ${speedMultiplier}x, Spin: ${spinPower}`);
                }
                // Güç sıfırla
                pp.powerLevel = 0;
                exports.room.setPlayerAvatar(p.id, "");
            }
            // Eğer powerLevel 0 ise hiçbir güç uygulanmaz, normal vuruş olur
            // Diğer sistemler
            (0, teamplayBoost_1.teamplayBoost)(exports.game, p);
            (0, rotateBall_1.applyRotation)(exports.game, p);
            (0, offside_1.handleLastTouch)(exports.game, pp);
            if (pp.activation > 20) {
                pp.activation = 0;
                exports.room.setPlayerAvatar(p.id, "");
            }
        }
    };
    exports.room.onGameTick = () => {
        if (!exports.game) {
            return;
        }
        try {
            i++;
            exports.game.handleBallTouch();
            if (i > 6) {
                if (exports.game.inPlay) {
                    exports.game.handleBallOutOfBounds();
                    exports.game.rotateBall();
                }
                else {
                    exports.game.handleBallInPlay();
                }
                exports.game.applySlowdown();
                afk_1.afk.onTick();
                exports.game.checkAllX();
                exports.game.checkFoul();
                // Auto-clean expired VIPs
                Promise.resolve().then(() => __importStar(require("./src/vips"))).then(({ autoCleanVips }) => {
                    autoCleanVips();
                });
                i = 0;
            }
        }
        catch (e) {
            console.log("Hata:", e);
        }
    };
    exports.room.onPlayerActivity = (p) => {
        afk_1.afk.onActivity(p);
    };
    exports.room.onPlayerJoin = (p) => __awaiter(void 0, void 0, void 0, function* () {
        if (!p.auth) {
            exports.room.kickPlayer(p.id, "Auth anahtarınız geçersiz. haxball.com/playerauth adresinden değiştirin", false);
            return;
        }
        // Check if player is banned
        const { isPlayerBanned, getBanReason } = yield Promise.resolve().then(() => __importStar(require("./src/command")));
        if (yield isPlayerBanned(p.auth)) {
            const banReason = yield getBanReason(p.auth);
            exports.room.kickPlayer(p.id, banReason, true);
            return;
        }
        // Check VIP/Admin slot restriction (slots 16-20 are reserved)
        const currentPlayerCount = exports.room.getPlayerList().length;
        if (currentPlayerCount >= 15) {
            const { isPlayerVip } = yield Promise.resolve().then(() => __importStar(require("./src/vips")));
            const isAdmin = exports.room.getPlayerList().some(player => player.admin && player.auth === p.auth);
            if (!isPlayerVip(p.auth) && !isAdmin) {
                exports.room.kickPlayer(p.id, "🌟 Son 5 slot VIP için ayrılmıştır! VIP olmak için Discord sunucumuza katılın.", false);
                return;
            }
        }
        // Check for profanity in username using our detection system
        const { detectProfanity, supheliKufurAlgila, filterName } = yield Promise.resolve().then(() => __importStar(require("./src/profanity")));
        const realUsername = extractRealUsername(p.name);
        // Check for Discord patterns and invisible characters
        if (filterName(realUsername)) {
            exports.room.kickPlayer(p.id, "⚠️ Geçersiz kullanıcı adı formatı. Discord etiketleri, görünmez karakterler veya özel karakterler kullanılamaz.", false);
            return;
        }
        // Basic profanity filter for names
        if (detectProfanity(realUsername)) {
            exports.room.sendAnnouncement(`⚠️ ${p.name}, kullanıcı adınız yasaklı kelimeler içeriyor. Lütfen adınızı değiştirin!`, p.id, 0xFF0000, "bold", 2);
            exports.room.kickPlayer(p.id, "Yasaklı kullanıcı adı.", false);
            return;
        }
        // Advanced suspicious profanity detection for names
        if (supheliKufurAlgila(realUsername)) {
            exports.room.kickPlayer(p.id, "⚠️ Hakaret içerikli isimle odaya giremezsiniz!", true);
            return;
        }
        // Check if same username already exists
        const existingUsernames = exports.players.map((player) => extractRealUsername(player.name));
        if (existingUsernames.includes(realUsername)) {
            exports.room.kickPlayer(p.id, "Bu kullanıcı adı zaten kullanılıyor. Farklı bir isim seçin.", false);
            return;
        }
        if (process.env.DEBUG) {
            exports.room.setPlayerAdmin(p.id, true);
        }
        else {
            if (exports.players.map((p) => p.auth).includes(p.auth)) {
                exports.room.kickPlayer(p.id, "Zaten sunucudasınız.", false);
                return;
            }
        }
        (0, welcome_1.welcomePlayer)(exports.room, p);
        exports.room.setPlayerAvatar(p.id, "");
        yield (0, welcome_2.initPlayer)(p);
        // Check if player is VIP and show welcome message
        const { isPlayerVip } = yield Promise.resolve().then(() => __importStar(require("./src/vips")));
        if (isPlayerVip(p.auth)) {
            exports.room.sendAnnouncement(`[🌟VIP] ${realUsername} Odaya Giriş Yaptı.`, undefined, 0xFFFF00, // Yellow color
            "normal", 1);
        }
        // Console'a oyuncu girişi logla
        console.log(`${realUsername}, odaya girdi!`);
        (0, chooser_1.addToGame)(exports.room, p);
    });
    exports.room.onPlayerLeave = (p) => __awaiter(void 0, void 0, void 0, function* () {
        exports.players = exports.players.filter((pp) => p.id != pp.id);
        yield (0, chooser_1.handlePlayerLeaveOrAFK)();
    });
    exports.room.onPlayerChat = (p, msg) => {
        const pp = (0, exports.toAug)(p);
        // Console'a mesaj logla
        const realUsername = extractRealUsername(p.name);
        console.log(`[CHAT] ${realUsername}: ${msg}`);
        if (process.env.DEBUG) {
            if (msg == "a") {
                exports.room.setPlayerDiscProperties(p.id, { x: -10 });
            }
        }
        if (msg == "!debug") {
            console.log(exports.game);
            return false;
        }
        if ((0, command_1.isCommand)(msg)) {
            // Handle async command without blocking
            (0, command_1.handleCommand)(pp, msg).catch(error => {
                console.error("Command error:", error);
                (0, message_1.sendMessage)("Komut işlenirken hata oluştu.", pp);
            });
            return false;
        }
        // Handle message with mute checks
        (0, message_1.playerMessage)(pp, msg).catch(error => {
            console.error("Message handling error:", error);
        });
        return false; // Always return false to prevent default message handling
    };
    exports.room.onGameStart = (_) => {
        // Skorları sıfırla
        finalScores = null;
        exports.players.forEach((p) => {
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
        if (!chooser_1.duringDraft) {
            exports.game = new Game();
        }
        (0, out_1.clearThrowInBlocks)();
        exports.room.getPlayerList().forEach((p) => exports.room.setPlayerAvatar(p.id, ""));
        // Announce current win streak after a short delay
        setTimeout(() => {
            announceCurrentStreak();
        }, 2000); // 2 seconds delay to let players see the game start
    };
    exports.room.onPositionsReset = () => {
        (0, out_1.clearThrowInBlocks)();
        if (exports.game) {
            exports.game.animation = false;
            exports.room.setDiscProperties(0, {
                xspeed: 0,
                yspeed: 0,
                xgravity: 0,
                ygravity: 0,
            }); // without this, there was one tick where the ball's gravity was applied, and the ball has moved after positions reset.
            exports.game.ballRotation = { x: 0, y: 0, power: 0 };
        }
    };
    exports.room.onGameStop = (byUser) => {
        if (exports.game) {
            // Check if game ended by forfeit first
            if (exports.game.endedByForfeit.hasForfeited) {
                // Game ended by forfeit - winner already determined
                const winningTeam = exports.game.endedByForfeit.winningTeam;
                const forfeitingTeam = exports.game.endedByForfeit.forfeitingTeam;
                updateWinStreak(winningTeam);
                // Apply rotation after forfeit
                setTimeout(() => {
                    applyTeamRotation(winningTeam, forfeitingTeam);
                }, 2000);
                exports.game = null;
                return;
            }
            // Eğer finalScores varsa (3 farkla bitti)
            if (finalScores && (finalScores.red > 0 || finalScores.blue > 0)) {
                // Kazanan ve kaybeden takımı belirle
                let winnerTeam;
                let loserTeam;
                if (finalScores.red > finalScores.blue) {
                    winnerTeam = 1; // Red kazandı
                    loserTeam = 2; // Blue kaybetti
                    (0, message_1.sendMessage)(`🏆 Kırmızı takım kazandı! (${finalScores.red}-${finalScores.blue})`);
                    // Update win streak
                    updateWinStreak(winnerTeam);
                }
                else if (finalScores.blue > finalScores.red) {
                    winnerTeam = 2; // Blue kazandı
                    loserTeam = 1; // Red kaybetti
                    (0, message_1.sendMessage)(`🏆 Mavi takım kazandı! (${finalScores.blue}-${finalScores.red})`);
                    // Update win streak
                    updateWinStreak(winnerTeam);
                }
                else {
                    // Beraberlik durumu (teorik olarak bu duruma gelmez çünkü 3 farkla bitiyor)
                    finalScores = null;
                    exports.game = null;
                    return;
                }
                // Rotasyon sistemini uygula
                setTimeout(() => {
                    applyTeamRotation(winnerTeam, loserTeam);
                    finalScores = null; // Skorları temizle
                }, 2000);
            }
            else {
                // Normal durum (admin durdurdu, süre bitti vb.)
                // Check scores to determine winner for streak tracking
                const scores = exports.room.getScores();
                if (scores && scores.red !== scores.blue) {
                    // There was a winner
                    const winnerTeam = scores.red > scores.blue ? 1 : 2;
                    const winnerName = getTeamName(winnerTeam);
                    (0, message_1.sendMessage)(`🏆 ${winnerName} takım kazandı! (${scores.red}-${scores.blue})`);
                    // Update win streak
                    updateWinStreak(winnerTeam);
                }
                else {
                    // Draw or no scores - check if current streak was a record before resetting
                    if (winStreak.count >= 1 && winStreak.team !== 0) {
                        checkAndUpdateStreakRecord(winStreak.team, winStreak.count);
                    }
                    // Reset streak
                    winStreak.team = 0;
                    winStreak.count = 0;
                    (0, message_1.sendMessage)("🤝 Maç berabere bitti!");
                }
                setTimeout(() => {
                    (0, message_1.sendMessage)("🚀 Yeni maç başlatılıyor...");
                    exports.room.startGame();
                }, 1000);
            }
            exports.game = null;
        }
        else {
        }
    };
    exports.room.onPlayerTeamChange = (changedPlayer) => {
        if (process.env.DEBUG) {
            //room.setPlayerDiscProperties(changedPlayer.id, {x: -10, y: 0})
        }
        const MAX_PLAYERS_PER_TEAM = 6;
        // Eğer oyuncu spectator'a geçiyorsa izin ver
        if (changedPlayer.team === 0) {
            (0, exports.toAug)(changedPlayer).team = changedPlayer.team;
            return;
        }
        // DÜZELTME: Takımdaki oyuncu sayısını kontrol et (değişen oyuncuyu DAHIL ETMEDİğİMİZ sayım)
        // changedPlayer henüz tam olarak takıma geçmemiş durumda, bu yüzden onu hariç tut
        const teamPlayerCount = exports.room.getPlayerList().filter(p => p.team === changedPlayer.team && p.id !== changedPlayer.id).length;
        // Eğer takım doluysa (6 kişi varsa), 7. oyuncuyu spectator'a al
        if (teamPlayerCount >= MAX_PLAYERS_PER_TEAM) {
            exports.room.setPlayerTeam(changedPlayer.id, 0);
            (0, message_1.sendMessage)(`❌ Her takımda en fazla ${MAX_PLAYERS_PER_TEAM} oyuncu olabilir!`);
            (0, message_1.sendMessage)(`Takım ${changedPlayer.team} dolu (${teamPlayerCount}/${MAX_PLAYERS_PER_TEAM})`, changedPlayer);
            return;
        }
        // Takıma geçiş onaylandı
        (0, exports.toAug)(changedPlayer).team = changedPlayer.team;
    };
    exports.room.onRoomLink = (url) => {
        console.log(`Oda bağlantısı: ${url}`);
        console.log(`Admin Şifresi: ${exports.adminPass}`);
    };
    (0, chooser_2.default)(exports.room); // must be called at the end
});
exports.default = roomBuilder;
