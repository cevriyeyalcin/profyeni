import { AsyncDatabase as Database } from "promised-sqlite3";
import { game, PlayerAugmented } from "..";

export let db: any;

const createTables = async (db: any) => {
  const createStatements = [
    `CREATE TABLE "players" (
            "id"	INTEGER,
            "auth"	TEXT NOT NULL,
            "name"	TEXT,
            "elo"	INTEGER,
            "experience"	INTEGER DEFAULT 0,
            "level"	INTEGER DEFAULT 1,
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
    await db.run(t);
  }
};

export const initDb = async () => {
  db = await Database.open("db.sqlite");
  // Uncomment for DB SQL Debug:
  //db.inner.on("trace", (sql: any) => console.log("[TRACE]", sql));
  try {
    console.log("Creating DB...");
    await createTables(db);
  } catch (e) {
    console.log("\nDB tables already created.");
  }
  
  // Migration: Add experience and level columns if they don't exist
  try {
    await db.run("ALTER TABLE players ADD COLUMN experience INTEGER DEFAULT 0");
    await db.run("ALTER TABLE players ADD COLUMN level INTEGER DEFAULT 1");
    console.log("Added experience and level columns to existing database.");
  } catch (e) {
    // Columns already exist, which is fine
  }
  
  return db;
};

interface ReadPlayer {
  elo: number;
  experience: number;
  level: number;
}

export const getOrCreatePlayer = async (
  p: { auth: string, name: string },
): Promise<ReadPlayer> => {
  const auth = p.auth;
  const playerInDb = await db.get("SELECT elo, experience, level FROM players WHERE auth=?", [
    auth,
  ]);
  if (!playerInDb) {
    await db.run("INSERT INTO players(auth, name, elo, experience, level) VALUES (?, ?, ?, ?, ?)", [
      p.auth,
      p.name,
      1200,
      0,
      1,
    ]);
    const newPlayer = { elo: 1200, experience: 0, level: 1 };
    return newPlayer;
  }
  return playerInDb;
};

// Search for player by name (for offline banning)
export const searchPlayerByName = async (playerName: string) => {
  // Search for exact match first
  let player = await db.get("SELECT auth, name FROM players WHERE name = ?", [playerName]);
  
  if (!player) {
    // If no exact match, search for partial match (case insensitive)
    player = await db.get("SELECT auth, name FROM players WHERE LOWER(name) LIKE LOWER(?)", [`%${playerName}%`]);
  }
  
  return player;
};

// Get multiple players by partial name match
export const searchPlayersByName = async (playerName: string) => {
  return await db.all("SELECT auth, name FROM players WHERE LOWER(name) LIKE LOWER(?) ORDER BY name", [`%${playerName}%`]);
};

// Ban management functions
export const addBan = async (banData: {
  playerId: number;
  playerName: string;
  auth: string;
  reason: string;
  bannedBy: string;
}) => {
  await db.run(
    "INSERT OR REPLACE INTO bans(playerId, playerName, auth, reason, bannedBy, bannedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [banData.playerId, banData.playerName, banData.auth, banData.reason, banData.bannedBy, Date.now()]
  );
};

export const removeBan = async (auth: string) => {
  await db.run("DELETE FROM bans WHERE auth = ?", [auth]);
};

export const getBan = async (auth: string) => {
  return await db.get("SELECT * FROM bans WHERE auth = ?", [auth]);
};

export const getAllBans = async () => {
  return await db.all("SELECT * FROM bans ORDER BY bannedAt DESC");
};

export const clearAllBans = async () => {
  await db.run("DELETE FROM bans");
};

// Mute management functions
export const addMute = async (muteData: {
  playerId: number;
  playerName: string;
  auth: string;
  mutedUntil: number;
  reason: string;
  mutedBy: string;
}) => {
  await db.run(
    "INSERT OR REPLACE INTO mutes(playerId, playerName, auth, mutedUntil, reason, mutedBy, mutedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [muteData.playerId, muteData.playerName, muteData.auth, muteData.mutedUntil, muteData.reason, muteData.mutedBy, Date.now()]
  );
};

export const removeMute = async (auth: string) => {
  await db.run("DELETE FROM mutes WHERE auth = ?", [auth]);
};

export const getMute = async (auth: string) => {
  return await db.get("SELECT * FROM mutes WHERE auth = ?", [auth]);
};

export const getAllMutes = async () => {
  return await db.all("SELECT * FROM mutes WHERE mutedUntil > ? ORDER BY mutedAt DESC", [Date.now()]);
};

export const cleanExpiredMutes = async () => {
  await db.run("DELETE FROM mutes WHERE mutedUntil <= ?", [Date.now()]);
};
