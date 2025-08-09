import { room, PlayerAugmented, players, toAug, getTeamRotationInProgress } from "../index";
import { sendMessage } from "./message";
import { teamMutex, setPlayerTeamDirect, conditionalSetPlayerTeam } from "./teamMutex";

let afkSystemEnabled = true;

// AFK detection state with race condition protection
interface AFKState {
  checking: boolean;
  lastCheck: number;
  playersBeingProcessed: Set<number>;
}

const afkState: AFKState = {
  checking: false,
  lastCheck: 0,
  playersBeingProcessed: new Set()
};

const AFK_CHECK_INTERVAL = 5000; // 5 seconds minimum between checks

// Enhanced AFK detection with deadlock prevention
const checkAFK = async (): Promise<void> => {
  if (!afkSystemEnabled) return;
  
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
  if (getTeamRotationInProgress()) {
    console.log(`[AFK] Team rotation in progress, skipping AFK check`);
    return;
  }
  
  const release = await teamMutex.acquire("afkCheck");
  
  try {
    afkState.checking = true;
    afkState.lastCheck = now;
    
    console.log(`[AFK] Starting enhanced AFK check`);
    
    const activePlayers = room.getPlayerList().filter(p => p.team !== 0);
    const afkMoves: Array<{playerId: number, reason: string}> = [];
    
    for (const player of activePlayers) {
      // Skip if already being processed
      if (afkState.playersBeingProcessed.has(player.id)) {
        console.log(`[AFK] Player ${player.name} already being processed, skipping`);
        continue;
      }
      
      try {
        afkState.playersBeingProcessed.add(player.id);
        
        const augPlayer = toAug(player);
        
        if (augPlayer.afk) {
          console.log(`[AFK] Player ${player.name} (${player.id}) detected as AFK in team ${player.team}`);
          
          // Double-check player still exists and is still AFK
          const freshPlayer = room.getPlayer(player.id);
          if (!freshPlayer) {
            console.log(`[AFK] Player ${player.id} no longer exists, skipping AFK move`);
            continue;
          }
          
          const freshAugPlayer = toAug(freshPlayer);
          if (!freshAugPlayer.afk) {
            console.log(`[AFK] Player ${player.name} no longer AFK, skipping move`);
            continue;
          }
          
          if (freshPlayer.team === 0) {
            console.log(`[AFK] Player ${player.name} already spectator, skipping`);
            continue;
          }
          
          // Queue for batch processing to avoid nested mutex calls
          afkMoves.push({
            playerId: player.id,
            reason: `AFK-detection-${player.name}`
          });
        }
      } catch (error) {
        console.error(`[AFK] Error processing player ${player.id}: ${error}`);
      } finally {
        afkState.playersBeingProcessed.delete(player.id);
      }
    }
    
    // Process all AFK moves at once using direct assignments (we already have mutex)
    if (afkMoves.length > 0) {
      console.log(`[AFK] Processing ${afkMoves.length} AFK moves`);
      
      for (const move of afkMoves) {
        try {
          const success = setPlayerTeamDirect(move.playerId, 0, move.reason);
          
          if (success) {
            const player = room.getPlayer(move.playerId);
            if (player) {
              sendMessage(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
              console.log(`[AFK] Successfully moved ${player.name} to spectators due to AFK`);
            }
          } else {
            console.warn(`[AFK] Failed to move player ${move.playerId} to spectators`);
          }
        } catch (error) {
          console.error(`[AFK] Error in AFK move for player ${move.playerId}: ${error}`);
        }
      }
    }
    
    console.log(`[AFK] AFK check completed successfully`);
    
  } catch (error) {
    console.error(`[AFK] Critical error in AFK check: ${error}`);
  } finally {
    afkState.checking = false;
    release();
  }
};

// Safe AFK timeout with deadlock prevention
room.onPlayerActivity = async (player) => {
  try {
    // Don't process during team rotation
    if (getTeamRotationInProgress()) {
      return;
    }
    
    // Skip if player is being processed
    if (afkState.playersBeingProcessed.has(player.id)) {
      return;
    }
    
    const augPlayer = toAug(player);
    
    if (augPlayer.afk && player.team !== 0) {
      console.log(`[AFK] Activity trigger - Player ${player.name} is AFK in team ${player.team}, moving to spectators`);
      
      // Use conditional assignment to avoid unnecessary mutex if player is already spectator
      const success = await conditionalSetPlayerTeam(player.id, 0, "AFK-activity-trigger");
      
      if (success) {
        sendMessage(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
      }
    }
  } catch (error) {
    console.error(`[AFK] Error in activity handler: ${error}`);
  }
};

// Enhanced cleanup for AFK state with memory leak prevention
const cleanupAFKState = (): void => {
  try {
    const currentPlayers = new Set(room.getPlayerList().map(p => p.id));
    let cleanedCount = 0;
    
    // Remove references to players who left
    for (const playerId of afkState.playersBeingProcessed) {
      if (!currentPlayers.has(playerId)) {
        console.log(`[AFK] Cleaning up stale reference to player ${playerId}`);
        afkState.playersBeingProcessed.delete(playerId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`[AFK] Cleaned up ${cleanedCount} stale AFK references`);
    }
  } catch (error) {
    console.error(`[AFK] Error in AFK cleanup: ${error}`);
  }
};

// Regular cleanup interval
setInterval(cleanupAFKState, 30000); // Every 30 seconds

// Start AFK checking
setInterval(checkAFK, 30000);

export const setAfkSystemEnabled = (enabled: boolean): void => {
  afkSystemEnabled = enabled;
  console.log(`[AFK] AFK system ${enabled ? 'enabled' : 'disabled'}`);
};

export const isAfkSystemEnabled = (): boolean => {
  return afkSystemEnabled;
};

// Force cleanup for emergency situations
export const forceCleanupAFK = (): void => {
  console.warn(`[AFK] Force cleanup triggered`);
  afkState.checking = false;
  afkState.playersBeingProcessed.clear();
  afkState.lastCheck = 0;
};
