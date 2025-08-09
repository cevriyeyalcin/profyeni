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
exports.teamMutex = void 0;
exports.safeSetPlayerTeam = safeSetPlayerTeam;
// Team operations mutex to prevent race conditions
class TeamOperationMutex {
    constructor() {
        this.locked = false;
        this.queue = [];
        this.currentOperation = null;
    }
    acquire(operationName) {
        return __awaiter(this, void 0, void 0, function* () {
            return new Promise((resolve) => {
                const release = () => {
                    console.log(`[TEAM_MUTEX] Released: ${operationName}`);
                    this.currentOperation = null;
                    this.locked = false;
                    const next = this.queue.shift();
                    if (next)
                        next();
                };
                const tryAcquire = () => {
                    if (!this.locked) {
                        this.locked = true;
                        this.currentOperation = operationName;
                        console.log(`[TEAM_MUTEX] Acquired: ${operationName}`);
                        resolve(release);
                    }
                    else {
                        console.log(`[TEAM_MUTEX] Queued: ${operationName} (waiting for: ${this.currentOperation})`);
                        this.queue.push(tryAcquire);
                    }
                };
                tryAcquire();
            });
        });
    }
    isLocked() {
        return this.locked;
    }
    getCurrentOperation() {
        return this.currentOperation;
    }
    getQueueLength() {
        return this.queue.length;
    }
    // Emergency release for error recovery
    forceRelease() {
        console.warn(`[TEAM_MUTEX] FORCE RELEASE - was locked by: ${this.currentOperation}`);
        this.locked = false;
        this.currentOperation = null;
        this.queue = [];
    }
}
exports.teamMutex = new TeamOperationMutex();
// Safe team assignment wrapper with mutex protection
function safeSetPlayerTeam(playerId, teamId, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield exports.teamMutex.acquire(`setPlayerTeam(${playerId}, ${teamId}) - ${reason}`);
        try {
            const player = index_1.room.getPlayer(playerId);
            if (!player) {
                console.warn(`[SAFE_TEAM_SET] Player ${playerId} not found`);
                return false;
            }
            if (player.team === teamId) {
                console.log(`[SAFE_TEAM_SET] Player ${player.name} already on team ${teamId}`);
                return false;
            }
            index_1.room.setPlayerTeam(playerId, teamId);
            console.log(`[SAFE_TEAM_SET] Moved ${player.name} (${playerId}) to team ${teamId} - ${reason}`);
            return true;
        }
        catch (error) {
            console.error(`[SAFE_TEAM_SET] Error moving player ${playerId}: ${error}`);
            return false;
        }
        finally {
            release();
        }
    });
}
// Import room from index
const index_1 = require("../index");
