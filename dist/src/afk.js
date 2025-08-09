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
exports.forceCleanupAFK = exports.isAfkSystemEnabled = exports.setAfkSystemEnabled = void 0;
const index_1 = require("../index");
const message_1 = require("./message");
const teamMutex_1 = require("./teamMutex");
let afkSystemEnabled = true;
const afkState = {
    checking: false,
    lastCheck: 0,
    playersBeingProcessed: new Set()
};
const AFK_CHECK_INTERVAL = 5000; // 5 seconds minimum between checks
// Enhanced AFK detection with mutex protection
const checkAFK = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!afkSystemEnabled)
        return;
    // Prevent concurrent AFK checks
    if (afkState.checking) {
        console.log(`[AFK] AFK check already in progress, skipping`);
        return;
    }
    const now = Date.now();
    if (now - afkState.lastCheck < AFK_CHECK_INTERVAL) {
        console.log(`[AFK] AFK check rate limited`);
        return;
    }
    // Don't run during team rotation to prevent interference
    if ((0, index_1.getTeamRotationInProgress)()) {
        console.log(`[AFK] Team rotation in progress, skipping AFK check`);
        return;
    }
    const release = yield teamMutex_1.teamMutex.acquire("afkCheck");
    try {
        afkState.checking = true;
        afkState.lastCheck = now;
        console.log(`[AFK] Starting enhanced AFK check`);
        const activePlayers = index_1.room.getPlayerList().filter(p => p.team !== 0);
        for (const player of activePlayers) {
            // Skip if already being processed
            if (afkState.playersBeingProcessed.has(player.id)) {
                console.log(`[AFK] Player ${player.name} already being processed, skipping`);
                continue;
            }
            try {
                afkState.playersBeingProcessed.add(player.id);
                const augPlayer = (0, index_1.toAug)(player);
                if (augPlayer.afk) {
                    console.log(`[AFK] Player ${player.name} (${player.id}) detected as AFK in team ${player.team}`);
                    // Double-check player still exists and is still AFK
                    const freshPlayer = index_1.room.getPlayer(player.id);
                    if (!freshPlayer) {
                        console.log(`[AFK] Player ${player.id} no longer exists, skipping AFK move`);
                        continue;
                    }
                    const freshAugPlayer = (0, index_1.toAug)(freshPlayer);
                    if (!freshAugPlayer.afk) {
                        console.log(`[AFK] Player ${player.name} no longer AFK, skipping move`);
                        continue;
                    }
                    if (freshPlayer.team === 0) {
                        console.log(`[AFK] Player ${player.name} already spectator, skipping`);
                        continue;
                    }
                    // Perform safe team move to spectators
                    const success = yield (0, teamMutex_1.safeSetPlayerTeam)(player.id, 0, "AFK-detection");
                    if (success) {
                        (0, message_1.sendMessage)(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
                        console.log(`[AFK] Successfully moved ${player.name} to spectators due to AFK`);
                    }
                    else {
                        console.warn(`[AFK] Failed to move ${player.name} to spectators`);
                    }
                }
            }
            catch (error) {
                console.error(`[AFK] Error processing player ${player.id}: ${error}`);
            }
            finally {
                afkState.playersBeingProcessed.delete(player.id);
            }
        }
        console.log(`[AFK] AFK check completed successfully`);
    }
    catch (error) {
        console.error(`[AFK] Critical error in AFK check: ${error}`);
    }
    finally {
        afkState.checking = false;
        release();
    }
});
// Safe AFK timeout with validation
index_1.room.onPlayerActivity = (player) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Don't process during team rotation
        if ((0, index_1.getTeamRotationInProgress)()) {
            return;
        }
        // Skip if player is being processed
        if (afkState.playersBeingProcessed.has(player.id)) {
            return;
        }
        const augPlayer = (0, index_1.toAug)(player);
        if (augPlayer.afk && player.team !== 0) {
            console.log(`[AFK] Activity trigger - Player ${player.name} is AFK in team ${player.team}, moving to spectators`);
            const release = yield teamMutex_1.teamMutex.acquire(`afkActivity-${player.id}`);
            try {
                afkState.playersBeingProcessed.add(player.id);
                // Double-check state before moving
                const freshPlayer = index_1.room.getPlayer(player.id);
                if (!freshPlayer || freshPlayer.team === 0) {
                    return;
                }
                const freshAugPlayer = (0, index_1.toAug)(freshPlayer);
                if (!freshAugPlayer.afk) {
                    return;
                }
                const success = yield (0, teamMutex_1.safeSetPlayerTeam)(player.id, 0, "AFK-activity-trigger");
                if (success) {
                    (0, message_1.sendMessage)(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
                }
            }
            finally {
                afkState.playersBeingProcessed.delete(player.id);
                release();
            }
        }
    }
    catch (error) {
        console.error(`[AFK] Error in activity handler: ${error}`);
    }
});
// Enhanced cleanup for AFK state
const cleanupAFKState = () => {
    const currentPlayers = new Set(index_1.room.getPlayerList().map(p => p.id));
    // Remove references to players who left
    for (const playerId of afkState.playersBeingProcessed) {
        if (!currentPlayers.has(playerId)) {
            console.log(`[AFK] Cleaning up stale reference to player ${playerId}`);
            afkState.playersBeingProcessed.delete(playerId);
        }
    }
};
// Regular cleanup interval
setInterval(cleanupAFKState, 30000); // Every 30 seconds
// Start AFK checking
setInterval(checkAFK, 30000);
const setAfkSystemEnabled = (enabled) => {
    afkSystemEnabled = enabled;
    console.log(`[AFK] AFK system ${enabled ? 'enabled' : 'disabled'}`);
};
exports.setAfkSystemEnabled = setAfkSystemEnabled;
const isAfkSystemEnabled = () => {
    return afkSystemEnabled;
};
exports.isAfkSystemEnabled = isAfkSystemEnabled;
// Force cleanup for emergency situations
const forceCleanupAFK = () => {
    console.warn(`[AFK] Force cleanup triggered`);
    afkState.checking = false;
    afkState.playersBeingProcessed.clear();
    afkState.lastCheck = 0;
};
exports.forceCleanupAFK = forceCleanupAFK;
