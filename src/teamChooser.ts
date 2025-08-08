import { room, players, PlayerAugmented, toAug } from "../index";
import { sendMessage } from "./message";

// Team chooser state
interface ChooserState {
  isActive: boolean;
  waitingForRed: boolean;
  waitingForBlue: boolean;
  redCaptain: PlayerAugmented | null;
  blueCaptain: PlayerAugmented | null;
  availableSpectators: PlayerAugmented[];
  selectionTimeout: NodeJS.Timeout | null;
}

let chooserState: ChooserState = {
  isActive: false,
  waitingForRed: false,
  waitingForBlue: false,
  redCaptain: null,
  blueCaptain: null,
  availableSpectators: [],
  selectionTimeout: null
};

// Selection timeout duration (30 seconds)
const SELECTION_TIMEOUT = 30000;

// Helper functions
const getRedPlayers = () => room.getPlayerList().filter(p => p.team === 1);
const getBluePlayers = () => room.getPlayerList().filter(p => p.team === 2);
const getSpectators = () => room.getPlayerList().filter(p => p.team === 0 && !toAug(p).afk);

// Get team captains (first player in each team)
const getTeamCaptains = () => {
  const redPlayers = getRedPlayers();
  const bluePlayers = getBluePlayers();
  
  return {
    red: redPlayers.length > 0 ? toAug(redPlayers[0]) : null,
    blue: bluePlayers.length > 0 ? toAug(bluePlayers[0]) : null
  };
};

// Check if team selection should be triggered
export const shouldTriggerSelection = (): boolean => {
  const spectators = getSpectators();
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  // Need at least 2 spectators and teams are not full (max 6 per team)
  return spectators.length >= 2 && 
         (redCount < 6 || blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 1; // Teams shouldn't be too unbalanced
};

// Start the selection process
export const startSelection = (): void => {
  if (chooserState.isActive) return;
  
  const spectators = getSpectators();
  if (spectators.length < 2) return;
  
  const { red, blue } = getTeamCaptains();
  if (!red || !blue) return;
  
  // Pause the game
  room.pauseGame(true);
  
  chooserState.isActive = true;
  chooserState.redCaptain = red;
  chooserState.blueCaptain = blue;
  chooserState.availableSpectators = spectators.map(p => toAug(p));
  
  // Determine which team needs players more
  const redCount = getRedPlayers().length;
  const blueCount = getBluePlayers().length;
  
  if (redCount < blueCount) {
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = false;
  } else if (blueCount < redCount) {
    chooserState.waitingForRed = false;
    chooserState.waitingForBlue = true;
  } else {
    // Equal teams, red goes first
    chooserState.waitingForRed = true;
    chooserState.waitingForBlue = false;
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
  
  const currentTeam = chooserState.waitingForRed ? "Kırmızı" : "Mavi";
  message += `\n${currentTeam} takım kaptanı, oyuncu seçmek için sayı yazın (1-${chooserState.availableSpectators.length})`;
  
  // Send to captains only
  if (chooserState.waitingForRed && chooserState.redCaptain) {
    sendMessage(message, chooserState.redCaptain);
  } else if (chooserState.waitingForBlue && chooserState.blueCaptain) {
    sendMessage(message, chooserState.blueCaptain);
  }
  
  // Send info to other players
  const infoMessage = `⏸️ Oyun durduruldu. ${currentTeam} takımı oyuncu seçiyor...`;
  room.getPlayerList().forEach(p => {
    const playerAug = toAug(p);
    if (playerAug !== chooserState.redCaptain && playerAug !== chooserState.blueCaptain) {
      sendMessage(infoMessage, playerAug);
    }
  });
};

// Handle selection command
export const handleSelection = (captain: PlayerAugmented, selection: string): boolean => {
  if (!chooserState.isActive) return false;
  
  // Check if this player is the current captain
  const isRedCaptain = chooserState.waitingForRed && captain === chooserState.redCaptain;
  const isBlueCaptin = chooserState.waitingForBlue && captain === chooserState.blueCaptain;
  
  if (!isRedCaptain && !isBlueCaptin) {
    sendMessage("❌ Şu anda sizin seçim sıranız değil.", captain);
    return true; // Consume the message
  }
  
  // Parse selection number
  const selectionNum = parseInt(selection.trim());
  if (isNaN(selectionNum) || selectionNum < 1 || selectionNum > chooserState.availableSpectators.length) {
    sendMessage(`❌ Geçersiz seçim. 1-${chooserState.availableSpectators.length} arası sayı girin.`, captain);
    return true;
  }
  
  // Get selected player
  const selectedPlayer = chooserState.availableSpectators[selectionNum - 1];
  const selectedPlayerObj = room.getPlayer(selectedPlayer.id);
  
  if (!selectedPlayerObj) {
    sendMessage("❌ Seçilen oyuncu artık odada değil.", captain);
    updateSpectatorList();
    return true;
  }
  
  // Assign to team
  const targetTeam = chooserState.waitingForRed ? 1 : 2;
  const teamName = targetTeam === 1 ? "Kırmızı" : "Mavi";
  
  room.setPlayerTeam(selectedPlayer.id, targetTeam);
  
  // Announce selection
  sendMessage(`🎯 ${teamName} takımı ${selectedPlayer.name} oyuncusunu seçti!`, null);
  
  // Remove from available spectators
  chooserState.availableSpectators = chooserState.availableSpectators.filter(p => p.id !== selectedPlayer.id);
  
  // Clear timeout
  if (chooserState.selectionTimeout) {
    clearTimeout(chooserState.selectionTimeout);
    chooserState.selectionTimeout = null;
  }
  
  // Check if we should continue or end selection
  const shouldContinue = checkContinueSelection();
  if (shouldContinue) {
    // Switch to other team
    chooserState.waitingForRed = !chooserState.waitingForRed;
    chooserState.waitingForBlue = !chooserState.waitingForBlue;
    
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
  
  // Continue if:
  // 1. There are still spectators available
  // 2. Teams are not full (6 max per team)
  // 3. Teams need balancing
  return specCount > 0 && 
         (redCount < 6 && blueCount < 6) && 
         Math.abs(redCount - blueCount) <= 1;
};

// Update spectator list (remove players who left)
const updateSpectatorList = (): void => {
  if (!chooserState.isActive) return;
  
  const currentSpectators = getSpectators().map(p => toAug(p));
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
      const currentCaptain = chooserState.waitingForRed ? chooserState.redCaptain : chooserState.blueCaptain;
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
  chooserState.redCaptain = null;
  chooserState.blueCaptain = null;
  chooserState.availableSpectators = [];
  
  // Resume game
  room.pauseGame(false);
  
  sendMessage("▶️ Oyuncu seçimi tamamlandı. Oyun devam ediyor!", null);
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
  
  // If a captain leaves, end selection
  if (player === chooserState.redCaptain || player === chooserState.blueCaptain) {
    sendMessage("❌ Kaptan oyundan ayrıldı. Seçim iptal ediliyor.", null);
    endSelection();
    return;
  }
  
  // If a spectator leaves, update list
  const wasSpectator = chooserState.availableSpectators.some(spec => spec.id === player.id);
  if (wasSpectator) {
    updateSpectatorList();
    if (chooserState.availableSpectators.length > 0) {
      sendSpectatorList(); // Refresh the list for captains
    }
  }
};