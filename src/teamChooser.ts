import { room, players, PlayerAugmented, toAug, getTeamRotationInProgress } from "../index";
import { sendMessage } from "./message";

// Team chooser state
interface ChooserState {
  isActive: boolean;
  waitingForRed: boolean;
  waitingForBlue: boolean;
  availableSpectators: PlayerAugmented[];
  selectionTimeout: NodeJS.Timeout | null;
}

let chooserState: ChooserState = {
  isActive: false,
  waitingForRed: false,
  waitingForBlue: false,
  availableSpectators: [],
  selectionTimeout: null
};

// Track which team went first last time for alternating when teams are equal
let lastFirstTeam: 1 | 2 = 2; // Start with blue so red goes first initially

// Selection timeout duration (30 seconds)
const SELECTION_TIMEOUT = 30000;

// Last time waiting message was shown (to prevent spam)
let lastWaitingMessageTime = 0;
const WAITING_MESSAGE_COOLDOWN = 10000; // 10 seconds

// Helper functions
const getRedPlayers = () => room.getPlayerList().filter(p => p.team === 1);
const getBluePlayers = () => room.getPlayerList().filter(p => p.team === 2);
const getSpectators = () => {
  return room.getPlayerList().filter(p => {
    if (p.team !== 0) return false;
    try {
      return !toAug(p).afk;
    } catch (error) {
      // Player likely just left but still in room.getPlayerList()
      console.warn(`[getSpectators] Player ${p.id} not found in players array, skipping`);
      return false;
    }
  });
};

// Get all team members
const getTeamMembers = () => {
  const redPlayers = getRedPlayers();
  const bluePlayers = getBluePlayers();
  
  // Safely map players, filtering out any that might have just left
  const safeMapToAug = (players: PlayerObject[]) => {
    return players.map(p => {
      try {
        return toAug(p);
      } catch (error) {
        console.warn(`[getTeamMembers] Player ${p.id} not found in players array, skipping`);
        return null;
      }
    }).filter(p => p !== null) as PlayerAugmented[];
  };
  
  return {
    red: safeMapToAug(redPlayers),
    blue: safeMapToAug(bluePlayers)
  };
};

// Check if team selection should be triggered
export const shouldTriggerSelection = (): boolean => {
  // Don't trigger selection during team rotation
  if (getTeamRotationInProgress()) {
    console.log(`[TEAM_CHOOSER] Team rotation in progress - skipping trigger check`);
    return false;
  }
  
  const spectators = getSpectators();
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  // Additional validation: ensure spectators are actually valid and online
  const validSpectators = spectators.filter(p => {
    try {
      const playerObj = room.getPlayer(p.id);
      if (!playerObj) return false; // Player left
      
      const augPlayer = toAug(playerObj);
      return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
    } catch (error) {
      console.warn(`[shouldTriggerSelection] Player ${p.id} validation failed, removing from spectators`);
      return false;
    }
  });
  
  // If teams are balanced, require at least 2 spectators to avoid false triggers when someone joins/leaves temporarily
  const minSpectators = Math.abs(redCount - blueCount) === 0 ? 2 : 1;
  
  // Need enough valid spectators, teams not full (max 6 per team), and teams should be reasonably balanced
  return validSpectators.length >= minSpectators && 
         (redCount < 6 || blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 2; // Allow up to 2 player difference
};

// Check if we should show the "waiting for ball out" message
export const checkAndShowWaitingMessage = (): void => {
  // Don't show waiting message during team rotation
  if (getTeamRotationInProgress()) {
    return;
  }
  
  // Don't show if selection is already active
  if (chooserState.isActive) return;
  
  // Throttle message to prevent spam
  const now = Date.now();
  if (now - lastWaitingMessageTime < WAITING_MESSAGE_COOLDOWN) return;
  
  // Get current valid spectators (non-AFK)
  const spectators = getSpectators();
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  // Additional validation: ensure spectators are actually valid and online
  const validSpectators = spectators.filter(p => {
    try {
      const playerObj = room.getPlayer(p.id);
      if (!playerObj) return false; // Player left
      
      const augPlayer = toAug(playerObj);
      return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
    } catch (error) {
      console.warn(`[checkAndShowWaitingMessage] Player ${p.id} validation failed, removing from spectators`);
      return false;
    }
  });
  
  // Update the trigger condition to use validated spectators
  const minSpectators = Math.abs(redCount - blueCount) === 0 ? 2 : 1;
  const shouldTrigger = validSpectators.length >= minSpectators && 
                       (redCount < 6 || blueCount < 6) && 
                       Math.abs(redCount - blueCount) <= 2;
  
  // Only show if selection should be triggered but isn't active yet
  if (shouldTrigger) {
    const message = `🟡 Top dışarıya çıkınca oyuncu değişikliği yapılacak. (${validSpectators.length} izleyici bekleniyor)`;
    
    // Send to all players as a bold yellow announcement
    room.sendAnnouncement(message, undefined, 0xFFFF00, "bold", 1);
    lastWaitingMessageTime = now;
    console.log(`[TEAM_CHOOSER] Waiting for ball out - ${validSpectators.length} valid spectators ready`);
  } else if (spectators.length > 0 && validSpectators.length === 0) {
    // All spectators are AFK or invalid - log this situation
    console.log(`[TEAM_CHOOSER] Found ${spectators.length} spectators but none are valid (likely AFK or left)`);
  }
};

// Check if teams are uneven and auto-balance by moving players to spectators
export const checkAndAutoBalance = (): boolean => {
  // Don't auto-balance during team rotation
  if (getTeamRotationInProgress()) {
    console.log(`[TEAM_CHOOSER] Team rotation in progress - skipping auto-balance`);
    return false;
  }
  
  const redPlayers = getRedPlayers();
  const bluePlayers = getBluePlayers();
  const rawSpectators = getSpectators();
  
  // Validate spectators to exclude AFK/invalid ones
  const validSpectators = rawSpectators.filter(p => {
    try {
      const playerObj = room.getPlayer(p.id);
      if (!playerObj) return false; // Player left
      
      const augPlayer = toAug(playerObj);
      return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
    } catch (error) {
      return false;
    }
  });
  
  const redCount = redPlayers.length;
  const blueCount = bluePlayers.length;
  const specCount = validSpectators.length; // Use validated spectators count
  
  // Only log when there's actually something to report or when counts have changed significantly
  const teamDifference = Math.abs(redCount - blueCount);
  
  // Reduce console spam - only log when teams are significantly uneven or when there are valid spectators
  if (teamDifference > 0 || specCount > 0) {
    console.log(`[AUTO_BALANCE] Team counts - Red: ${redCount}, Blue: ${blueCount}, Valid Spectators: ${specCount}${rawSpectators.length !== specCount ? ` (${rawSpectators.length - specCount} AFK/invalid)` : ''}`);
  }
  
  // Don't balance if teams are already equal
  if (teamDifference === 0) {
    // Only log if there was something to balance
    if (specCount > 0) {
      console.log(`[AUTO_BALANCE] Teams are balanced - no action needed`);
    }
    return false;
  }
  
  // If there are valid spectators available, don't auto-balance (let team chooser handle it)
  // This function is for moving players FROM teams TO spectators, not the other way around
  if (specCount > 0) {
    console.log(`[AUTO_BALANCE] Teams uneven but ${specCount} valid spectators available - let team chooser handle this`);
    return false; // Let the team chooser system handle it
  }
  
  // Don't balance if there are too few players total (less than 3)
  const totalPlayers = redCount + blueCount;
  if (totalPlayers < 3) {
    console.log(`[AUTO_BALANCE] Not enough players to balance - Total: ${totalPlayers}`);
    return false;
  }
  
  // Determine which team has more players
  const advantagedTeam = redCount > blueCount ? "red" : "blue";
  const advantagedPlayers = redCount > blueCount ? redPlayers : bluePlayers;
  const disadvantagedCount = Math.min(redCount, blueCount);
  
  // For any uneven team situation, move 1 player from advantaged team to spectators
  // This creates spectators for the team chooser system and improves balance
  const playersToMove = 1;
  
  if (playersToMove > 0) {
    console.log(`[AUTO_BALANCE] Moving ${playersToMove} player(s) from ${advantagedTeam} team to spectators`);
    
    // Move the last joined players (highest IDs) to spectators
    const sortedAdvantaged = advantagedPlayers.sort((a, b) => b.id - a.id);
    const playersToMoveToSpec = sortedAdvantaged.slice(0, playersToMove);
    
    playersToMoveToSpec.forEach(player => {
      room.setPlayerTeam(player.id, 0); // Move to spectators
      console.log(`[AUTO_BALANCE] Moved ${player.name} (ID: ${player.id}) to spectators`);
    });
    
    const teamName = advantagedTeam === "red" ? "Kırmızı" : "Mavi";
    const movedNames = playersToMoveToSpec.map(p => p.name).join(", ");
    
    sendMessage(`⚖️ Takımlar dengelendi! ${teamName} takımından ${movedNames} izleyiciye geçti.`, null);
    
    return true; // Auto-balancing occurred
  }
  
  return false;
};

// Start team selection process
export const startSelection = (): void => {
  if (chooserState.isActive) {
    console.log(`[TEAM_CHOOSER] Selection already active, ignoring start request`);
    return;
  }
  
  // Don't start if team rotation is in progress
  if (getTeamRotationInProgress()) {
    console.log(`[TEAM_CHOOSER] Team rotation in progress, cannot start team selection.`);
    return;
  }

  // Get and validate current spectators before starting
  const rawSpectators = getSpectators();
  const validSpectators = rawSpectators.filter(p => {
    try {
      const playerObj = room.getPlayer(p.id);
      if (!playerObj) return false; // Player left
      
      const augPlayer = toAug(playerObj);
      return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
    } catch (error) {
      console.warn(`[startSelection] Player ${p.id} validation failed, removing from spectators`);
      return false;
    }
  });
  
  // Don't start if no valid spectators
  if (validSpectators.length === 0) {
    console.log(`[TEAM_CHOOSER] No valid spectators available for selection (${rawSpectators.length} raw spectators found but all AFK/invalid)`);
    return;
  }
  
  // Pause game
  room.pauseGame(true);
  
  // Set state
  chooserState.isActive = true;
  chooserState.availableSpectators = validSpectators.map(p => {
    try {
      return toAug(p);
    } catch (error) {
      console.warn(`[startSelection] Player ${p.id} not found in players array, skipping`);
      return null;
    }
  }).filter(p => p !== null) as PlayerAugmented[];
  
  // Additional safety check after mapping
  if (chooserState.availableSpectators.length === 0) {
    console.log(`[TEAM_CHOOSER] No spectators remain after augmentation mapping, cancelling selection`);
    chooserState.isActive = false;
    room.pauseGame(false);
    return;
  }
  
  console.log(`[TEAM_CHOOSER] Starting selection with ${chooserState.availableSpectators.length} valid spectators:`, 
    chooserState.availableSpectators.map(s => `${s.name}(${s.id})`));
  
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  // Determine which teams can choose
  if (redCount < blueCount) {
    // Red team is disadvantaged, only they can choose until balanced
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = false;
    lastFirstTeam = 1; // Red went first
  } else if (blueCount < redCount) {
    // Blue team is disadvantaged, only they can choose until balanced
    chooserState.waitingForRed = false;
    chooserState.waitingForBlue = true;
    lastFirstTeam = 2; // Blue went first
  } else {
    // Teams are equal, both teams can choose simultaneously
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = true;
  }
  
  sendSpectatorList();
  startSelectionTimeout();
};

// Send numbered spectator list to captains
const sendSpectatorList = (): void => {
  if (!chooserState.isActive) return;
  
  let message = "🔄 Oyuncu Seçimi:\n";
  chooserState.availableSpectators.forEach((spec, index) => {
    message += `${index + 1}. ${spec.name} [Lvl.${spec.level}]\n`;
  });
  
  const { red, blue } = getTeamMembers();
  const spectators = getSpectators().map(p => {
    try {
      return toAug(p);
    } catch (error) {
      console.warn(`[sendSpectatorList] Player ${p.id} not found in players array, skipping`);
      return null;
    }
  }).filter(p => p !== null) as PlayerAugmented[];
  
  // Send to red team if they can choose
  if (chooserState.waitingForRed) {
    const redMessage = message + `\nKırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.availableSpectators.length})`;
    red.forEach(member => {
      room.sendAnnouncement(redMessage, member.id, 0xFF0000, "bold", 2); // Red color
    });
  }
  
  // Send to blue team if they can choose
  if (chooserState.waitingForBlue) {
    const blueMessage = message + `\nMavi takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.availableSpectators.length})`;
    blue.forEach(member => {
      room.sendAnnouncement(blueMessage, member.id, 0x0000FF, "bold", 2); // Blue color
    });
  }
  
  // Send info to spectators
  const activeTeams = [];
  if (chooserState.waitingForRed) activeTeams.push("Kırmızı");
  if (chooserState.waitingForBlue) activeTeams.push("Mavi");
  const infoMessage = `⏸️ Oyun durduruldu. ${activeTeams.join(" ve ")} takım${activeTeams.length > 1 ? 'ları' : 'ı'} oyuncu seçiyor...`;
  
  spectators.forEach(player => {
    sendMessage(infoMessage, player);
  });
};

// Handle selection command
export const handleSelection = (player: PlayerAugmented, selection: string): boolean => {
  if (!chooserState.isActive) {
    console.log(`[TEAM_CHOOSER] Selection not active, ignoring input: ${selection} from ${player.name}`);
    return false;
  }
  
  console.log(`[TEAM_CHOOSER] Handling selection: ${selection} from ${player.name} (ID: ${player.id})`);
  console.log(`[TEAM_CHOOSER] State: waitingForRed=${chooserState.waitingForRed}, waitingForBlue=${chooserState.waitingForBlue}`);
  
  // Check if this player is in the current selecting team
  const { red, blue } = getTeamMembers();
  console.log(`[TEAM_CHOOSER] Red team:`, red.map(p => `${p.name}(${p.id})`));
  console.log(`[TEAM_CHOOSER] Blue team:`, blue.map(p => `${p.name}(${p.id})`));
  
  const playerIsInRed = red.some(p => p.id === player.id);
  const playerIsInBlue = blue.some(p => p.id === player.id);
  
  // Check current team counts to prevent uneven teams
  const currentRedCount = red.length;
  const currentBlueCount = blue.length;
  
  // Additional safeguard: Don't allow a team to choose if it would create a 2+ player difference
  if (playerIsInRed && currentRedCount > currentBlueCount) {
    sendMessage("❌ Kırmızı takım şu anda seçim yapamaz. Takımlar dengelenmelidir.", player);
    console.log(`[TEAM_CHOOSER] Blocked red selection - would create uneven teams (${currentRedCount+1}v${currentBlueCount})`);
    return true;
  }
  
  if (playerIsInBlue && currentBlueCount > currentRedCount) {
    sendMessage("❌ Mavi takım şu anda seçim yapamaz. Takımlar dengelenmelidir.", player);
    console.log(`[TEAM_CHOOSER] Blocked blue selection - would create uneven teams (${currentRedCount}v${currentBlueCount+1})`);
    return true;
  }
  
  // Check if this player's team is allowed to select
  const isRedTeamMember = chooserState.waitingForRed && playerIsInRed;
  const isBlueTeamMember = chooserState.waitingForBlue && playerIsInBlue;
  
  console.log(`[TEAM_CHOOSER] Player ${player.name} - In Red: ${playerIsInRed}, In Blue: ${playerIsInBlue}`);
  console.log(`[TEAM_CHOOSER] Can select - Red allowed: ${isRedTeamMember}, Blue allowed: ${isBlueTeamMember}`);
  
  if (!isRedTeamMember && !isBlueTeamMember) {
    if (playerIsInRed && !chooserState.waitingForRed) {
      sendMessage("❌ Kırmızı takım şu anda seçim yapamaz. Mavi takım daha az oyuncuya sahip.", player);
    } else if (playerIsInBlue && !chooserState.waitingForBlue) {
      sendMessage("❌ Mavi takım şu anda seçim yapamaz. Kırmızı takım daha az oyuncuya sahip.", player);
    } else {
      sendMessage("❌ Şu anda sizin takımınızın seçim sırası değil.", player);
    }
    return true; // Consume the message
  }
  
  // Parse selection number
  const selectionNum = parseInt(selection.trim());
  console.log(`[TEAM_CHOOSER] Parsed selection number: ${selectionNum}, available spectators: ${chooserState.availableSpectators.length}`);
  
  if (isNaN(selectionNum) || selectionNum < 1 || selectionNum > chooserState.availableSpectators.length) {
    console.log(`[TEAM_CHOOSER] Invalid selection number`);
    sendMessage(`❌ Geçersiz seçim. 1-${chooserState.availableSpectators.length} arası sayı girin.`, player);
    return true;
  }
  
  // Get selected player
  const selectedPlayer = chooserState.availableSpectators[selectionNum - 1];
  const selectedPlayerObj = room.getPlayer(selectedPlayer.id);
  
  console.log(`[TEAM_CHOOSER] Selected player: ${selectedPlayer.name} (ID: ${selectedPlayer.id})`);
  
  if (!selectedPlayerObj) {
    console.log(`[TEAM_CHOOSER] Selected player not found in room`);
    sendMessage("❌ Seçilen oyuncu artık odada değil.", player);
    updateSpectatorList();
    return true;
  }
  
  // Determine which team the selecting player belongs to
  const selectingPlayerTeam = red.find(p => p.id === player.id) ? 1 : 2;
  const targetTeam = selectingPlayerTeam;
  const teamName = targetTeam === 1 ? "Kırmızı" : "Mavi";
  
  console.log(`[TEAM_CHOOSER] Player ${player.name} is in team ${selectingPlayerTeam}, assigning ${selectedPlayer.name} to team ${targetTeam} (${teamName})`);
  room.setPlayerTeam(selectedPlayer.id, targetTeam);
  
  // Announce selection
  sendMessage(`🎯 ${teamName} takımından ${player.name}, ${selectedPlayer.name} oyuncusunu seçti!`, null);
  
  // Remove from available spectators
  chooserState.availableSpectators = chooserState.availableSpectators.filter(p => p.id !== selectedPlayer.id);
  
  // Clear timeout
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
    chooserState.selectionTimeout = null;
  }
  
  // Calculate new team counts manually (more reliable than getRedPlayers/getBluePlayers)
  const currentRed = getRedPlayers();
  const currentBlue = getBluePlayers();
  
  // Add the newly assigned player to the count
  const newRedCount = targetTeam === 1 ? currentRed.length + 1 : currentRed.length;
  const newBlueCount = targetTeam === 2 ? currentBlue.length + 1 : currentBlue.length;
  
  console.log(`[TEAM_CHOOSER] Manual count calculation - Red: ${newRedCount}, Blue: ${newBlueCount}`);
  
  // Check if we should continue or end selection based on new counts
  const specCount = chooserState.availableSpectators.length;
  const shouldContinue = specCount > 0 && 
         (newRedCount < 6 && newBlueCount < 6) && 
         Math.abs(newRedCount - newBlueCount) <= 1;
         
  console.log(`[TEAM_CHOOSER] Should continue with manual calculation: ${shouldContinue}`);
  
  if (shouldContinue) {
    // Determine who should choose next based on team balance
    
    console.log(`[TEAM_CHOOSER] After selection - Red: ${newRedCount}, Blue: ${newBlueCount}`);
    
    if (newRedCount < newBlueCount) {
      // Red team is disadvantaged, only they can choose until balanced
      chooserState.waitingForRed = true;
      chooserState.waitingForBlue = false;
      console.log(`[TEAM_CHOOSER] Red team disadvantaged (${newRedCount}v${newBlueCount}), only red can choose`);
    } else if (newBlueCount < newRedCount) {
      // Blue team is disadvantaged, only they can choose until balanced
      chooserState.waitingForRed = false;
      chooserState.waitingForBlue = true;
      console.log(`[TEAM_CHOOSER] Blue team disadvantaged (${newRedCount}v${newBlueCount}), only blue can choose`);
    } else {
      // Teams are equal, both can choose simultaneously
      chooserState.waitingForRed = true;
      chooserState.waitingForBlue = true;
      console.log(`[TEAM_CHOOSER] Teams equal (${newRedCount}v${newBlueCount}), both can choose`);
    }
    
    sendSpectatorList();
    startSelectionTimeout();
  } else {
    endSelection();
  }
  
  return true;
};

// Check if selection should continue
const checkContinueSelection = (): boolean => {
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  const specCount = chooserState.availableSpectators.length;
  
  console.log(`[TEAM_CHOOSER] checkContinueSelection - Red: ${redCount}, Blue: ${blueCount}, Specs: ${specCount}`);
  
  // Continue if:
  // 1. There are still spectators available
  // 2. Teams are not full (6 max per team)  
  // 3. Teams don't exceed a 1 player difference (prevents uneven teams)
  const shouldContinue = specCount > 0 && 
         (redCount < 6 && blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 1;
         
  console.log(`[TEAM_CHOOSER] Should continue: ${shouldContinue}`);
  return shouldContinue;
};

// Update spectator list (remove players who left)
const updateSpectatorList = (): void => {
  if (!chooserState.isActive) return;
  
  const currentSpectators = getSpectators().map(p => {
    try {
      return toAug(p);
    } catch (error) {
      console.warn(`[updateSpectatorList] Player ${p.id} not found in players array, skipping`);
      return null;
    }
  }).filter(p => p !== null) as PlayerAugmented[];
  chooserState.availableSpectators = chooserState.availableSpectators.filter(spec => 
    currentSpectators.some(current => current.id === spec.id)
  );
  
  if (chooserState.availableSpectators.length === 0) {
    endSelection();
  }
};

// Start selection timeout
const startSelectionTimeout = (): void => {
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
  }
  
  chooserState.selectionTimeout = setTimeout(() => {
    if (chooserState.isActive) {
      const teamName = chooserState.waitingForRed ? "Kırmızı" : "Mavi";
      
      sendMessage(`⏰ ${teamName} takımının seçim süresi doldu. Otomatik oyuncu atanıyor...`, null);
      
      // Auto-assign first available spectator
      if (chooserState.availableSpectators.length > 0) {
        const autoSelected = chooserState.availableSpectators[0];
        const targetTeam = chooserState.waitingForRed ? 1 : 2;
        
        room.setPlayerTeam(autoSelected.id, targetTeam);
        sendMessage(`🤖 ${autoSelected.name} otomatik olarak ${teamName} takımına atandı.`, null);
        
        chooserState.availableSpectators.shift(); // Remove first player
      }
      
      endSelection();
    }
  }, SELECTION_TIMEOUT);
};

// End selection process
export const endSelection = (): void => {
  if (!chooserState.isActive) return;
  
  // Clear timeout
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
    chooserState.selectionTimeout = null;
  }
  
  // Reset state
  chooserState.isActive = false;
  chooserState.waitingForRed = false;
  chooserState.waitingForBlue = false;
  chooserState.availableSpectators = [];
  
  // Resume game
  room.pauseGame(false);
  
  sendMessage("▶️ Oyuncu seçimi tamamlandı. Oyun devam ediyor!", null);
  
  // Check if we should show waiting message for next selection
  setTimeout(() => {
    checkAndShowWaitingMessage();
  }, 1000); // Delay to let the game resume properly
};

// Force end selection (for admin commands or game events)
export const forceEndSelection = (): void => {
  if (chooserState.isActive) {
    endSelection();
  }
};

// Check if selection is currently active
export const isSelectionActive = (): boolean => {
  return chooserState.isActive;
};

// Handle player leaving during selection
export const handlePlayerLeave = (player: PlayerAugmented): void => {
  if (!chooserState.isActive) return;
  
  // If all members of a team leave, end selection
  const { red, blue } = getTeamMembers();
  if (red.length === 0 || blue.length === 0) {
    sendMessage("❌ Bir takımın tüm üyeleri oyundan ayrıldı. Seçim iptal ediliyor.", null);
    endSelection();
    return;
  }
  
  // If a spectator leaves, update list
  const wasSpectator = chooserState.availableSpectators.some(spec => spec.id === player.id);
  if (wasSpectator) {
    updateSpectatorList();
    if (chooserState.availableSpectators.length > 0) {
      sendSpectatorList(); // Refresh the list for team members
    }
  }
};

// Clean up stale spectator data to prevent false triggers and console spam
export const cleanupStaleSpectators = (): void => {
  // Only run if we're not in an active selection
  if (chooserState.isActive) return;
  
  const currentSpectators = getSpectators();
  let removedCount = 0;
  
  // Validate each spectator and count removals
  const validSpectators = currentSpectators.filter(p => {
    try {
      const playerObj = room.getPlayer(p.id);
      if (!playerObj) {
        removedCount++;
        return false; // Player left
      }
      
      const augPlayer = toAug(playerObj);
      if (augPlayer.afk || playerObj.team !== 0) {
        removedCount++;
        return false; // Player is AFK or changed teams
      }
      
      return true;
    } catch (error) {
      removedCount++;
      return false;
    }
  });
  
  if (removedCount > 0) {
    console.log(`[TEAM_CHOOSER] Cleaned up ${removedCount} stale spectators. Valid spectators remaining: ${validSpectators.length}`);
  }
};

// Auto-cleanup every 30 seconds to prevent stale data buildup
setInterval(cleanupStaleSpectators, 30000);