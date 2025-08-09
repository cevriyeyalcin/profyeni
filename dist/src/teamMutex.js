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
exports.setPlayerTeamDirect = setPlayerTeamDirect;
exports.safeSetPlayerTeam = safeSetPlayerTeam;
exports.conditionalSetPlayerTeam = conditionalSetPlayerTeam;
exports.batchTeamOperations = batchTeamOperations;
class ReentrantTeamMutex {
    constructor() {
        this.lockHolder = null;
        this.queue = [];
        this.lockTimeout = 30000; // 30 seconds max lock time
        this.executionCounter = 0;
    }
    // Generate unique execution ID for tracking reentrant calls
    generateExecutionId() {
        return `exec_${++this.executionCounter}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Get current execution ID from call stack context
    getCurrentExecutionId() {
        // Use Error stack to create a unique identifier for the current execution context
        const stack = new Error().stack || '';
        const stackHash = this.hashString(stack);
        return `stack_${stackHash}`;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
    }
    acquire(operationName) {
        return __awaiter(this, void 0, void 0, function* () {
            const executionId = this.getCurrentExecutionId();
            const now = Date.now();
            return new Promise((resolve, reject) => {
                // Timeout protection
                const timeoutId = setTimeout(() => {
                    this.forceRelease();
                    reject(new Error(`[TEAM_MUTEX] Timeout acquiring lock for ${operationName} (${executionId})`));
                }, this.lockTimeout);
                const tryAcquire = () => {
                    // Check if current execution already holds the lock (reentrant)
                    if (this.lockHolder && this.lockHolder.executionId === executionId) {
                        this.lockHolder.count++;
                        console.log(`[TEAM_MUTEX] Reentrant acquire: ${operationName} (count: ${this.lockHolder.count})`);
                        clearTimeout(timeoutId);
                        resolve(() => this.release(executionId, operationName));
                        return;
                    }
                    // Check if lock is free
                    if (!this.lockHolder) {
                        this.lockHolder = {
                            executionId,
                            operationName,
                            count: 1,
                            acquiredAt: now
                        };
                        console.log(`[TEAM_MUTEX] Lock acquired: ${operationName} (${executionId})`);
                        clearTimeout(timeoutId);
                        resolve(() => this.release(executionId, operationName));
                        return;
                    }
                    // Check for potential deadlock (same operation trying to acquire recursively)
                    if (this.lockHolder.operationName === operationName) {
                        console.warn(`[TEAM_MUTEX] Potential deadlock detected: ${operationName} vs ${this.lockHolder.operationName}`);
                    }
                    // Queue the request
                    console.log(`[TEAM_MUTEX] Queued: ${operationName} (waiting for: ${this.lockHolder.operationName})`);
                    this.queue.push({
                        executionId,
                        operationName,
                        resolve: (release) => {
                            clearTimeout(timeoutId);
                            resolve(release);
                        },
                        acquiredAt: now
                    });
                };
                tryAcquire();
            });
        });
    }
    release(executionId, operationName) {
        if (!this.lockHolder || this.lockHolder.executionId !== executionId) {
            console.warn(`[TEAM_MUTEX] Invalid release attempt: ${operationName} (${executionId})`);
            return;
        }
        this.lockHolder.count--;
        if (this.lockHolder.count > 0) {
            console.log(`[TEAM_MUTEX] Reentrant release: ${operationName} (count: ${this.lockHolder.count})`);
            return;
        }
        // Complete release
        console.log(`[TEAM_MUTEX] Lock released: ${operationName} (${executionId})`);
        this.lockHolder = null;
        // Process queue
        const next = this.queue.shift();
        if (next) {
            this.lockHolder = {
                executionId: next.executionId,
                operationName: next.operationName,
                count: 1,
                acquiredAt: next.acquiredAt
            };
            console.log(`[TEAM_MUTEX] Lock acquired from queue: ${next.operationName} (${next.executionId})`);
            next.resolve(() => this.release(next.executionId, next.operationName));
        }
    }
    // Emergency release for error recovery
    forceRelease() {
        const holder = this.lockHolder;
        console.warn(`[TEAM_MUTEX] FORCE RELEASE - was locked by: ${holder === null || holder === void 0 ? void 0 : holder.operationName} (${holder === null || holder === void 0 ? void 0 : holder.executionId})`);
        this.lockHolder = null;
        this.queue = [];
    }
    // Status methods
    isLocked() {
        return this.lockHolder !== null;
    }
    getCurrentOperation() {
        var _a;
        return ((_a = this.lockHolder) === null || _a === void 0 ? void 0 : _a.operationName) || null;
    }
    getQueueLength() {
        return this.queue.length;
    }
    getLockInfo() {
        return {
            isLocked: this.isLocked(),
            holder: this.lockHolder,
            queueLength: this.queue.length,
            queue: this.queue.map(q => ({ operation: q.operationName, executionId: q.executionId }))
        };
    }
}
exports.teamMutex = new ReentrantTeamMutex();
// Non-blocking team assignment function (to break deadlock chains)
function setPlayerTeamDirect(playerId, teamId, reason) {
    try {
        const player = index_1.room.getPlayer(playerId);
        if (!player) {
            console.warn(`[DIRECT_TEAM_SET] Player ${playerId} not found`);
            return false;
        }
        if (player.team === teamId) {
            console.log(`[DIRECT_TEAM_SET] Player ${player.name} already on team ${teamId}`);
            return false;
        }
        index_1.room.setPlayerTeam(playerId, teamId);
        console.log(`[DIRECT_TEAM_SET] Moved ${player.name} (${playerId}) to team ${teamId} - ${reason}`);
        return true;
    }
    catch (error) {
        console.error(`[DIRECT_TEAM_SET] Error moving player ${playerId}: ${error}`);
        return false;
    }
}
// Safe team assignment wrapper with mutex protection
function safeSetPlayerTeam(playerId, teamId, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield exports.teamMutex.acquire(`setPlayerTeam(${playerId}, ${teamId}) - ${reason}`);
        try {
            return setPlayerTeamDirect(playerId, teamId, reason);
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
// Conditional team assignment (only if needed, prevents unnecessary mutex acquisition)
function conditionalSetPlayerTeam(playerId, teamId, reason) {
    return __awaiter(this, void 0, void 0, function* () {
        // Quick check without mutex
        const player = index_1.room.getPlayer(playerId);
        if (!player || player.team === teamId) {
            return false; // No change needed
        }
        // Use direct assignment to avoid mutex overhead for simple cases
        return setPlayerTeamDirect(playerId, teamId, reason);
    });
}
// Batch team operations (single mutex acquisition for multiple operations)
function batchTeamOperations(operations) {
    return __awaiter(this, void 0, void 0, function* () {
        const release = yield exports.teamMutex.acquire(`batchTeamOperations(${operations.length} ops)`);
        try {
            const results = [];
            for (const op of operations) {
                results.push(setPlayerTeamDirect(op.playerId, op.teamId, op.reason));
            }
            return results;
        }
        catch (error) {
            console.error(`[BATCH_TEAM_SET] Error in batch operations: ${error}`);
            return operations.map(() => false);
        }
        finally {
            release();
        }
    });
}
// Import room from index
const index_1 = require("../index");
