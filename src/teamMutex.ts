// Team operations mutex to prevent race conditions
class TeamOperationMutex {
  private locked = false;
  private queue: Array<() => void> = [];
  private currentOperation: string | null = null;

  async acquire(operationName: string): Promise<() => void> {
    return new Promise((resolve) => {
      const release = () => {
        console.log(`[TEAM_MUTEX] Released: ${operationName}`);
        this.currentOperation = null;
        this.locked = false;
        const next = this.queue.shift();
        if (next) next();
      };

      const tryAcquire = () => {
        if (!this.locked) {
          this.locked = true;
          this.currentOperation = operationName;
          console.log(`[TEAM_MUTEX] Acquired: ${operationName}`);
          resolve(release);
        } else {
          console.log(`[TEAM_MUTEX] Queued: ${operationName} (waiting for: ${this.currentOperation})`);
          this.queue.push(tryAcquire);
        }
      };

      tryAcquire();
    });
  }

  isLocked(): boolean {
    return this.locked;
  }

  getCurrentOperation(): string | null {
    return this.currentOperation;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  // Emergency release for error recovery
  forceRelease(): void {
    console.warn(`[TEAM_MUTEX] FORCE RELEASE - was locked by: ${this.currentOperation}`);
    this.locked = false;
    this.currentOperation = null;
    this.queue = [];
  }
}

export const teamMutex = new TeamOperationMutex();

// Safe team assignment wrapper with mutex protection
export async function safeSetPlayerTeam(playerId: number, teamId: number, reason: string): Promise<boolean> {
  const release = await teamMutex.acquire(`setPlayerTeam(${playerId}, ${teamId}) - ${reason}`);
  
  try {
    const player = room.getPlayer(playerId);
    if (!player) {
      console.warn(`[SAFE_TEAM_SET] Player ${playerId} not found`);
      return false;
    }

    if (player.team === teamId) {
      console.log(`[SAFE_TEAM_SET] Player ${player.name} already on team ${teamId}`);
      return false;
    }

    room.setPlayerTeam(playerId, teamId);
    console.log(`[SAFE_TEAM_SET] Moved ${player.name} (${playerId}) to team ${teamId} - ${reason}`);
    return true;
  } catch (error) {
    console.error(`[SAFE_TEAM_SET] Error moving player ${playerId}: ${error}`);
    return false;
  } finally {
    release();
  }
}

// Import room from index
import { room } from "../index";