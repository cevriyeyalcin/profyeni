"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanExpiredMutes = exports.getAllMutes = exports.getMute = exports.removeMute = exports.addMute = exports.clearAllBans = exports.getAllBans = exports.getBan = exports.removeBan = exports.addBan = exports.searchPlayersByName = exports.searchPlayerByName = exports.getOrCreatePlayer = exports.initDb = exports.db = void 0;
const promised_sqlite3_1 = require("promised-sqlite3");
const createTables = (db) => __awaiter(void 0, void 0, void 0, function* () {
    const createStatements = [
        `CREATE TABLE "players" (
            "id"	INTEGER,
            "auth"	TEXT NOT NULL,
            "name"	TEXT,
            "elo"	INTEGER,
            PRIMARY KEY("id" AUTOINCREMENT)
    );`,
        `CREATE UNIQUE INDEX auth ON players(auth)`,
        `CREATE TABLE "bans" (
            "id"	INTEGER,
            "playerId"	INTEGER,
            "playerName"	TEXT NOT NULL,
            "auth"	TEXT NOT NULL,
            "reason"	TEXT NOT NULL,
            "bannedBy"	TEXT NOT NULL,
            "bannedAt"	INTEGER NOT NULL,
            PRIMARY KEY("id" AUTOINCREMENT)
    );`,
        `CREATE UNIQUE INDEX ban_auth ON bans(auth)`,
        `CREATE TABLE "mutes" (
            "id"	INTEGER,
            "playerId"	INTEGER,
            "playerName"	TEXT NOT NULL,
            "auth"	TEXT NOT NULL,
            "mutedUntil"	INTEGER NOT NULL,
            "reason"	TEXT NOT NULL,
            "mutedBy"	TEXT NOT NULL,
            "mutedAt"	INTEGER NOT NULL,
            PRIMARY KEY("id" AUTOINCREMENT)
    );`,
        `CREATE UNIQUE INDEX mute_auth ON mutes(auth)`,
    ];
    for (const t of createStatements) {
        yield db.run(t);
    }
});
const initDb = () => __awaiter(void 0, void 0, void 0, function* () {
    exports.db = yield promised_sqlite3_1.AsyncDatabase.open("db.sqlite");
    // Uncomment for DB SQL Debug:
    //db.inner.on("trace", (sql: any) => console.log("[TRACE]", sql));
    try {
        console.log("Creating DB...");
        yield createTables(exports.db);
    }
    catch (e) {
        console.log("\nDB tables already created.");
    }
    return exports.db;
});
exports.initDb = initDb;
const getOrCreatePlayer = (p) => __awaiter(void 0, void 0, void 0, function* () {
    const auth = p.auth;
    const playerInDb = yield exports.db.get("SELECT elo FROM players WHERE auth=?", [
        auth,
    ]);
    if (!playerInDb) {
        yield exports.db.run("INSERT INTO players(auth, name, elo) VALUES (?, ?, ?)", [
            p.auth,
            p.name,
            1200,
        ]);
        const newPlayer = { elo: 1200 };
        return newPlayer;
    }
    return playerInDb;
});
exports.getOrCreatePlayer = getOrCreatePlayer;
// Search for player by name (for offline banning)
const searchPlayerByName = (playerName) => __awaiter(void 0, void 0, void 0, function* () {
    // Search for exact match first
    let player = yield exports.db.get("SELECT auth, name FROM players WHERE name = ?", [playerName]);
    if (!player) {
        // If no exact match, search for partial match (case insensitive)
        player = yield exports.db.get("SELECT auth, name FROM players WHERE LOWER(name) LIKE LOWER(?)", [`%${playerName}%`]);
    }
    return player;
});
exports.searchPlayerByName = searchPlayerByName;
// Get multiple players by partial name match
const searchPlayersByName = (playerName) => __awaiter(void 0, void 0, void 0, function* () {
    return yield exports.db.all("SELECT auth, name FROM players WHERE LOWER(name) LIKE LOWER(?) ORDER BY name", [`%${playerName}%`]);
});
exports.searchPlayersByName = searchPlayersByName;
// Ban management functions
const addBan = (banData) => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("INSERT OR REPLACE INTO bans(playerId, playerName, auth, reason, bannedBy, bannedAt) VALUES (?, ?, ?, ?, ?, ?)", [banData.playerId, banData.playerName, banData.auth, banData.reason, banData.bannedBy, Date.now()]);
});
exports.addBan = addBan;
const removeBan = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("DELETE FROM bans WHERE auth = ?", [auth]);
});
exports.removeBan = removeBan;
const getBan = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    return yield exports.db.get("SELECT * FROM bans WHERE auth = ?", [auth]);
});
exports.getBan = getBan;
const getAllBans = () => __awaiter(void 0, void 0, void 0, function* () {
    return yield exports.db.all("SELECT * FROM bans ORDER BY bannedAt DESC");
});
exports.getAllBans = getAllBans;
const clearAllBans = () => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("DELETE FROM bans");
});
exports.clearAllBans = clearAllBans;
// Mute management functions
const addMute = (muteData) => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("INSERT OR REPLACE INTO mutes(playerId, playerName, auth, mutedUntil, reason, mutedBy, mutedAt) VALUES (?, ?, ?, ?, ?, ?, ?)", [muteData.playerId, muteData.playerName, muteData.auth, muteData.mutedUntil, muteData.reason, muteData.mutedBy, Date.now()]);
});
exports.addMute = addMute;
const removeMute = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("DELETE FROM mutes WHERE auth = ?", [auth]);
});
exports.removeMute = removeMute;
const getMute = (auth) => __awaiter(void 0, void 0, void 0, function* () {
    return yield exports.db.get("SELECT * FROM mutes WHERE auth = ?", [auth]);
});
exports.getMute = getMute;
const getAllMutes = () => __awaiter(void 0, void 0, void 0, function* () {
    return yield exports.db.all("SELECT * FROM mutes WHERE mutedUntil > ? ORDER BY mutedAt DESC", [Date.now()]);
});
exports.getAllMutes = getAllMutes;
const cleanExpiredMutes = () => __awaiter(void 0, void 0, void 0, function* () {
    yield exports.db.run("DELETE FROM mutes WHERE mutedUntil <= ?", [Date.now()]);
});
exports.cleanExpiredMutes = cleanExpiredMutes;
