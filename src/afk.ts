import { room, PlayerAugmented, players, toAug, getTeamRotationInProgress } from "../index";
import { sendMessage } from "./message";
import { teamMutex, safeSetPlayerTeam } from "./teamMutex";

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

// Enhanced AFK detection with mutex protection
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
          
          // Perform safe team move to spectators
          const success = await safeSetPlayerTeam(player.id, 0, "AFK-detection");
          
          if (success) {
            sendMessage(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
            console.log(`[AFK] Successfully moved ${player.name} to spectators due to AFK`);
          } else {
            console.warn(`[AFK] Failed to move ${player.name} to spectators`);
          }
        }
      } catch (error) {
        console.error(`[AFK] Error processing player ${player.id}: ${error}`);
      } finally {
        afkState.playersBeingProcessed.delete(player.id);
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

// Safe AFK timeout with validation
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
      
      const release = await teamMutex.acquire(`afkActivity-${player.id}`);
      
      try {
        afkState.playersBeingProcessed.add(player.id);
        
        // Double-check state before moving
        const freshPlayer = room.getPlayer(player.id);
        if (!freshPlayer || freshPlayer.team === 0) {
          return;
        }
        
        const freshAugPlayer = toAug(freshPlayer);
        if (!freshAugPlayer.afk) {
          return;
        }
        
        const success = await safeSetPlayerTeam(player.id, 0, "AFK-activity-trigger");
        
        if (success) {
          sendMessage(`⏸️ ${player.name} AFK olduğu için izleyiciye taşındı.`);
        }
        
      } finally {
        afkState.playersBeingProcessed.delete(player.id);
        release();
      }
    }
  } catch (error) {
    console.error(`[AFK] Error in activity handler: ${error}`);
  }
};

// Enhanced cleanup for AFK state
const cleanupAFKState = (): void => {
  const currentPlayers = new Set(room.getPlayerList().map(p => p.id));
  
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
