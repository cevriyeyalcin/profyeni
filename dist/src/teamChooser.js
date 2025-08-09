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
exports.cleanupStaleSpectators = exports.isSelectionActive = exports.forceEndSelection = exports.handlePlayerLeave = exports.handleSelection = exports.endSelection = exports.handleSpectatorSelection = exports.startSelection = exports.checkAndAutoBalance = exports.checkAndShowWaitingMessage = exports.shouldTriggerSelection = void 0;
const index_1 = require("../index");
const message_1 = require("./message");
const teamMutex_1 = require("./teamMutex");
const chooserState = {
    isActive: false,
    spectators: [],
    redTeam: [],
    blueTeam: [],
    selections: {},
    timeout: null,
    startTime: null,
    validationHash: null
};
const SELECTION_TIMEOUT = 30000; // 30 seconds
const WAITING_MESSAGE_COOLDOWN = 5000; // 5 seconds
let lastWaitingMessageTime = 0;
// Track which team went first last time for alternating when teams are equal
let lastFirstTeam = 2; // Start with blue so red goes first initially
// State validation and consistency checks
const generateStateHash = () => {
    const stateData = {
        active: chooserState.isActive,
        specs: chooserState.spectators.map(p => p.id).sort(),
        red: chooserState.redTeam.map(p => p.id).sort(),
        blue: chooserState.blueTeam.map(p => p.id).sort(),
        selections: Object.keys(chooserState.selections).sort()
    };
    return JSON.stringify(stateData);
};
const validateStateConsistency = () => {
    const currentHash = generateStateHash();
    if (chooserState.validationHash && chooserState.validationHash !== currentHash) {
        console.error(`[TEAM_CHOOSER] State corruption detected! Expected: ${chooserState.validationHash}, Got: ${currentHash}`);
        return false;
    }
    chooserState.validationHash = currentHash;
    return true;
};
// Enhanced spectator validation with real-time checks
const getValidSpectators = () => {
    try {
        const allPlayers = index_1.room.getPlayerList();
        const validSpectators = allPlayers
            .filter(p => p.team === 0) // Must be on spectator team
            .map(p => (0, index_1.toAug)(p))
            .filter(augP => {
            // Triple validation for spectator eligibility
            try {
                const freshPlayer = index_1.room.getPlayer(augP.id);
                if (!freshPlayer)
                    return false; // Player left
                if (freshPlayer.team !== 0)
                    return false; // Not spectator anymore
                if (augP.afk)
                    return false; // Is AFK
                return true;
            }
            catch (error) {
                console.warn(`[getValidSpectators] Player ${augP.id} validation failed: ${error}`);
                return false;
            }
        });
        return validSpectators;
    }
    catch (error) {
        console.error(`[getValidSpectators] Critical error: ${error}`);
        return [];
    }
};
// Helper functions
const getRedPlayers = () => index_1.room.getPlayerList().filter(p => p.team === 1);
const getBluePlayers = () => index_1.room.getPlayerList().filter(p => p.team === 2);
const getSpectators = () => {
    return index_1.room.getPlayerList().filter(p => {
        if (p.team !== 0)
            return false;
        try {
            return !(0, index_1.toAug)(p).afk;
        }
        catch (error) {
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
    const safeMapToAug = (players) => {
        return players.map(p => {
            try {
                return (0, index_1.toAug)(p);
            }
            catch (error) {
                console.warn(`[getTeamMembers] Player ${p.id} not found in players array, skipping`);
                return null;
            }
        }).filter(p => p !== null);
    };
    return {
        red: safeMapToAug(redPlayers),
        blue: safeMapToAug(bluePlayers)
    };
};
// Check if team selection should be triggered
const shouldTriggerSelection = () => {
    // Don't trigger selection during team rotation
    if ((0, index_1.getTeamRotationInProgress)()) {
        console.log(`[TEAM_CHOOSER] Team rotation in progress - skipping trigger check`);
        return false;
    }
    const spectators = getSpectators();
    const redCount = getRedPlayers().length;
    const blueCount = getBluePlayers().length;
    // Additional validation: ensure spectators are actually valid and online
    const validSpectators = spectators.filter(p => {
        try {
            const playerObj = index_1.room.getPlayer(p.id);
            if (!playerObj)
                return false; // Player left
            const augPlayer = (0, index_1.toAug)(playerObj);
            return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
        }
        catch (error) {
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
exports.shouldTriggerSelection = shouldTriggerSelection;
// Check if we should show the "waiting for ball out" message
const checkAndShowWaitingMessage = () => {
    // Don't show waiting message during team rotation
    if ((0, index_1.getTeamRotationInProgress)()) {
        return;
    }
    // Don't show if selection is already active
    if (chooserState.isActive)
        return;
    // Throttle message to prevent spam
    const now = Date.now();
    if (now - lastWaitingMessageTime < WAITING_MESSAGE_COOLDOWN)
        return;
    // Get current valid spectators (non-AFK)
    const spectators = getSpectators();
    const redCount = getRedPlayers().length;
    const blueCount = getBluePlayers().length;
    // Additional validation: ensure spectators are actually valid and online
    const validSpectators = spectators.filter(p => {
        try {
            const playerObj = index_1.room.getPlayer(p.id);
            if (!playerObj)
                return false; // Player left
            const augPlayer = (0, index_1.toAug)(playerObj);
            return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
        }
        catch (error) {
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
        index_1.room.sendAnnouncement(message, undefined, 0xFFFF00, "bold", 1);
        lastWaitingMessageTime = now;
        console.log(`[TEAM_CHOOSER] Waiting for ball out - ${validSpectators.length} valid spectators ready`);
    }
    else if (spectators.length > 0 && validSpectators.length === 0) {
        // All spectators are AFK or invalid - log this situation
        console.log(`[TEAM_CHOOSER] Found ${spectators.length} spectators but none are valid (likely AFK or left)`);
    }
};
exports.checkAndShowWaitingMessage = checkAndShowWaitingMessage;
// Check if teams are uneven and auto-balance by moving players to spectators
const checkAndAutoBalance = () => {
    // Don't auto-balance during team rotation
    if ((0, index_1.getTeamRotationInProgress)()) {
        console.log(`[TEAM_CHOOSER] Team rotation in progress - skipping auto-balance`);
        return false;
    }
    const redPlayers = getRedPlayers();
    const bluePlayers = getBluePlayers();
    const rawSpectators = getSpectators();
    // Validate spectators to exclude AFK/invalid ones
    const validSpectators = rawSpectators.filter(p => {
        try {
            const playerObj = index_1.room.getPlayer(p.id);
            if (!playerObj)
                return false; // Player left
            const augPlayer = (0, index_1.toAug)(playerObj);
            return !augPlayer.afk && playerObj.team === 0; // Double-check not AFK and still spectator
        }
        catch (error) {
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
            index_1.room.setPlayerTeam(player.id, 0); // Move to spectators
            console.log(`[AUTO_BALANCE] Moved ${player.name} (ID: ${player.id}) to spectators`);
        });
        const teamName = advantagedTeam === "red" ? "Kırmızı" : "Mavi";
        const movedNames = playersToMoveToSpec.map(p => p.name).join(", ");
        (0, message_1.sendMessage)(`⚖️ Takımlar dengelendi! ${teamName} takımından ${movedNames} izleyiciye geçti.`, null);
        return true; // Auto-balancing occurred
    }
    return false;
};
exports.checkAndAutoBalance = checkAndAutoBalance;
// Enhanced team selection with atomic operations
const startSelection = () => __awaiter(void 0, void 0, void 0, function* () {
    if (chooserState.isActive) {
        console.log(`[TEAM_CHOOSER] Selection already active, ignoring start request`);
        return;
    }
    // Don't start selection during team rotation
    if ((0, index_1.getTeamRotationInProgress)()) {
        console.log(`[TEAM_CHOOSER] Team rotation in progress - delaying selection start`);
        return;
    }
    const release = yield teamMutex_1.teamMutex.acquire("startSelection");
    try {
        console.log(`[TEAM_CHOOSER] Starting atomic team selection process`);
        chooserState.startTime = Date.now();
        // Get and validate current spectators before starting
        const validSpectators = getValidSpectators();
        if (validSpectators.length === 0) {
            console.log(`[TEAM_CHOOSER] No valid spectators available for selection`);
            return;
        }
        // Validate team state before starting
        const redPlayers = getRedPlayers();
        const bluePlayers = getBluePlayers();
        console.log(`[TEAM_CHOOSER] Current state - Red: ${redPlayers.length}, Blue: ${bluePlayers.length}, Valid Spectators: ${validSpectators.length}`);
        if (redPlayers.length >= 6 && bluePlayers.length >= 6) {
            console.log(`[TEAM_CHOOSER] Both teams already full, no selection needed`);
            return;
        }
        if (Math.abs(redPlayers.length - bluePlayers.length) > 3) {
            console.log(`[TEAM_CHOOSER] Team imbalance too large (${redPlayers.length}v${bluePlayers.length}), manual intervention required`);
            (0, message_1.sendMessage)(`⚠️ Takım dengesizliği çok büyük (${redPlayers.length}v${bluePlayers.length}). Manuel müdahale gerekli.`);
            return;
        }
        // Pause game for selection
        index_1.room.pauseGame(true);
        // Set state atomically
        chooserState.isActive = true;
        chooserState.spectators = validSpectators;
        chooserState.redTeam = redPlayers.map(p => (0, index_1.toAug)(p));
        chooserState.blueTeam = bluePlayers.map(p => (0, index_1.toAug)(p));
        chooserState.selections = {};
        chooserState.timeout = null;
        chooserState.validationHash = generateStateHash();
        console.log(`[TEAM_CHOOSER] Starting selection with ${chooserState.spectators.length} valid spectators:`, chooserState.spectators.map(s => `${s.name}(${s.id})`));
        // Determine selection logic based on team balance
        const redCount = redPlayers.length;
        const blueCount = bluePlayers.length;
        if (redCount < blueCount) {
            (0, message_1.sendMessage)("🔴 Kırmızı takım daha az oyuncuya sahip - sadece onlar seçim yapabilir");
        }
        else if (blueCount < redCount) {
            (0, message_1.sendMessage)("🔵 Mavi takım daha az oyuncuya sahip - sadece onlar seçim yapabilir");
        }
        else {
            // Teams equal - alternate or both choose
            if (validSpectators.length === 1) {
                // Only one spectator - use alternating system
                const choosingTeam = lastFirstTeam === 1 ? 2 : 1;
                const teamName = choosingTeam === 1 ? "Kırmızı" : "Mavi";
                (0, message_1.sendMessage)(`⚖️ Takımlar eşit - ${teamName} takımının seçim sırası`);
                lastFirstTeam = choosingTeam;
            }
            else {
                (0, message_1.sendMessage)("⚖️ Takımlar eşit - her iki takım da seçim yapabilir");
            }
        }
        sendSpectatorList();
        startSelectionTimeout();
        console.log(`[TEAM_CHOOSER] Selection started successfully`);
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error starting selection: ${error}`);
        // Cleanup on error
        chooserState.isActive = false;
        chooserState.spectators = [];
        chooserState.redTeam = [];
        chooserState.blueTeam = [];
        chooserState.selections = {};
        if (chooserState.timeout) {
            clearTimeout(chooserState.timeout);
            chooserState.timeout = null;
        }
        index_1.room.pauseGame(false);
    }
    finally {
        release();
    }
});
exports.startSelection = startSelection;
// Enhanced spectator selection with deadlock prevention
const handleSpectatorSelection = (player, selection) => __awaiter(void 0, void 0, void 0, function* () {
    if (!chooserState.isActive) {
        return false;
    }
    // Validate state consistency before processing
    if (!validateStateConsistency()) {
        console.error(`[TEAM_CHOOSER] State corruption detected, ending selection`);
        // Use direct call to avoid deadlock
        setImmediate(() => (0, exports.endSelection)());
        return true;
    }
    const release = yield teamMutex_1.teamMutex.acquire(`spectatorSelection-${player.id}`);
    try {
        console.log(`[TEAM_CHOOSER] Processing selection: ${selection} from ${player.name} (ID: ${player.id})`);
        // Validate player still exists and is on correct team
        const freshPlayer = index_1.room.getPlayer(player.id);
        if (!freshPlayer) {
            console.warn(`[TEAM_CHOOSER] Player ${player.id} no longer exists`);
            return true;
        }
        // Check team membership
        const playerIsInRed = freshPlayer.team === 1;
        const playerIsInBlue = freshPlayer.team === 2;
        if (!playerIsInRed && !playerIsInBlue) {
            (0, message_1.sendMessage)("❌ Sadece takım oyuncuları seçim yapabilir.", player);
            return true;
        }
        // Determine team eligibility
        const redCount = chooserState.redTeam.length;
        const blueCount = chooserState.blueTeam.length;
        let canRedChoose = false;
        let canBlueChoose = false;
        if (redCount < blueCount) {
            canRedChoose = true;
        }
        else if (blueCount < redCount) {
            canBlueChoose = true;
        }
        else {
            // Teams equal
            if (chooserState.spectators.length === 1) {
                // Single spectator - use alternating
                canRedChoose = lastFirstTeam === 1;
                canBlueChoose = lastFirstTeam === 2;
            }
            else {
                // Multiple spectators - both can choose
                canRedChoose = true;
                canBlueChoose = true;
            }
        }
        // Check if this player's team can select
        if ((playerIsInRed && !canRedChoose) || (playerIsInBlue && !canBlueChoose)) {
            const reason = redCount < blueCount ? "Mavi takım daha az oyuncuya sahip" :
                blueCount < redCount ? "Kırmızı takım daha az oyuncuya sahip" :
                    "Şu anda sizin takımınızın seçim sırası değil";
            (0, message_1.sendMessage)(`❌ ${reason}.`, player);
            return true;
        }
        // Parse and validate selection
        const selectionNum = parseInt(selection.trim());
        if (isNaN(selectionNum) || selectionNum < 1 || selectionNum > chooserState.spectators.length) {
            (0, message_1.sendMessage)(`❌ Geçersiz seçim. 1-${chooserState.spectators.length} arası sayı girin.`, player);
            return true;
        }
        // Get selected player and validate
        const selectedPlayer = chooserState.spectators[selectionNum - 1];
        const selectedPlayerObj = index_1.room.getPlayer(selectedPlayer.id);
        if (!selectedPlayerObj || selectedPlayerObj.team !== 0) {
            (0, message_1.sendMessage)("❌ Seçilen oyuncu artık mevcut değil.", player);
            updateSpectatorListNonBlocking();
            sendSpectatorList();
            return true;
        }
        // Check for duplicate selection
        if (chooserState.selections[selectedPlayer.id]) {
            (0, message_1.sendMessage)("❌ Bu oyuncu zaten seçildi.", player);
            return true;
        }
        // Perform direct team assignment to avoid nested mutex
        const targetTeam = playerIsInRed ? 1 : 2;
        const teamName = targetTeam === 1 ? "Kırmızı" : "Mavi";
        const success = (0, teamMutex_1.setPlayerTeamDirect)(selectedPlayer.id, targetTeam, `team-selection-by-${player.name}`);
        if (!success) {
            (0, message_1.sendMessage)("❌ Oyuncu atanamadı. Tekrar deneyin.", player);
            return true;
        }
        // Update state
        chooserState.selections[selectedPlayer.id] = targetTeam;
        chooserState.spectators = chooserState.spectators.filter(p => p.id !== selectedPlayer.id);
        // Update validation hash
        chooserState.validationHash = generateStateHash();
        // Announce selection
        (0, message_1.sendMessage)(`🎯 ${teamName} takımından ${player.name}, ${selectedPlayer.name} oyuncusunu seçti!`);
        // Clear timeout and check if selection should continue
        if (chooserState.timeout) {
            clearTimeout(chooserState.timeout);
            chooserState.timeout = null;
        }
        // Update team counts
        const newRedCount = getRedPlayers().length;
        const newBlueCount = getBluePlayers().length;
        // Check continuation
        const specCount = chooserState.spectators.length;
        const shouldContinue = specCount > 0 &&
            (newRedCount < 6 && newBlueCount < 6) &&
            Math.abs(newRedCount - newBlueCount) <= 1;
        if (shouldContinue) {
            // Update team references
            chooserState.redTeam = getRedPlayers().map(p => (0, index_1.toAug)(p));
            chooserState.blueTeam = getBluePlayers().map(p => (0, index_1.toAug)(p));
            sendSpectatorList();
            startSelectionTimeout();
        }
        else {
            // Schedule endSelection to run after this mutex is released
            setImmediate(() => (0, exports.endSelection)());
        }
        return true;
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error in spectator selection: ${error}`);
        (0, message_1.sendMessage)("❌ Seçim işleminde hata oluştu.", player);
        return true;
    }
    finally {
        release();
    }
});
exports.handleSpectatorSelection = handleSpectatorSelection;
// Check if selection should continue
const checkContinueSelection = () => {
    const redCount = getRedPlayers().length;
    const blueCount = getBluePlayers().length;
    const specCount = chooserState.spectators.length;
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
// Send numbered spectator list to captains
const sendSpectatorList = () => {
    if (!chooserState.isActive)
        return;
    let message = "🔄 Oyuncu Seçimi:\n";
    chooserState.spectators.forEach((spec, index) => {
        message += `${index + 1}. ${spec.name} [Lvl.${spec.level}]\n`;
    });
    const redPlayers = getRedPlayers();
    const bluePlayers = getBluePlayers();
    const spectators = getValidSpectators();
    // Determine selection eligibility
    const redCount = redPlayers.length;
    const blueCount = bluePlayers.length;
    let canRedChoose = false;
    let canBlueChoose = false;
    if (redCount < blueCount) {
        canRedChoose = true;
    }
    else if (blueCount < redCount) {
        canBlueChoose = true;
    }
    else {
        // Teams equal
        if (chooserState.spectators.length === 1) {
            // Single spectator - use alternating
            canRedChoose = lastFirstTeam === 1;
            canBlueChoose = lastFirstTeam === 2;
        }
        else {
            // Multiple spectators - both can choose
            canRedChoose = true;
            canBlueChoose = true;
        }
    }
    // Send to red team if they can choose
    if (canRedChoose) {
        const redMessage = message + `\n🔴 Kırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.spectators.length})`;
        redPlayers.forEach(member => {
            index_1.room.sendAnnouncement(redMessage, member.id, 0xFF0000, "bold", 2);
        });
    }
    // Send to blue team if they can choose
    if (canBlueChoose) {
        const blueMessage = message + `\n🔵 Mavi takım üyeleri, oyuncu seçmek için sayı yazın (1-${chooserState.spectators.length})`;
        bluePlayers.forEach(member => {
            index_1.room.sendAnnouncement(blueMessage, member.id, 0x0000FF, "bold", 2);
        });
    }
    // Send info to spectators
    const activeTeams = [];
    if (canRedChoose)
        activeTeams.push("Kırmızı");
    if (canBlueChoose)
        activeTeams.push("Mavi");
    const infoMessage = `⏸️ Oyun durduruldu. ${activeTeams.join(" ve ")} takım${activeTeams.length > 1 ? 'ları' : 'ı'} oyuncu seçiyor...`;
    spectators.forEach(player => {
        (0, message_1.sendMessage)(infoMessage, player);
    });
};
// Enhanced team selection timeout with deadlock prevention
const startSelectionTimeout = () => {
    if (chooserState.timeout) {
        clearTimeout(chooserState.timeout);
    }
    chooserState.timeout = setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
        if (chooserState.isActive) {
            console.log(`[TEAM_CHOOSER] Selection timeout triggered`);
            // Determine which team should get auto-assignment
            const redCount = getRedPlayers().length;
            const blueCount = getBluePlayers().length;
            let targetTeam = 1; // Default to red
            let teamName = "Kırmızı";
            if (redCount < blueCount) {
                targetTeam = 1;
                teamName = "Kırmızı";
            }
            else if (blueCount < redCount) {
                targetTeam = 2;
                teamName = "Mavi";
            }
            else {
                // Teams equal - use alternating
                targetTeam = lastFirstTeam === 1 ? 1 : 2;
                teamName = targetTeam === 1 ? "Kırmızı" : "Mavi";
            }
            (0, message_1.sendMessage)(`⏰ ${teamName} takımının seçim süresi doldu. Otomatik oyuncu atanıyor...`);
            // Auto-assign first available spectator using direct assignment
            if (chooserState.spectators.length > 0) {
                const autoSelected = chooserState.spectators[0];
                const success = (0, teamMutex_1.setPlayerTeamDirect)(autoSelected.id, targetTeam, "timeout-auto-assignment");
                if (success) {
                    (0, message_1.sendMessage)(`🤖 ${autoSelected.name} otomatik olarak ${teamName} takımına atandı.`);
                    chooserState.spectators.shift(); // Remove assigned player
                    // Check if selection should continue
                    const newRedCount = getRedPlayers().length;
                    const newBlueCount = getBluePlayers().length;
                    const specCount = chooserState.spectators.length;
                    const shouldContinue = specCount > 0 &&
                        (newRedCount < 6 && newBlueCount < 6) &&
                        Math.abs(newRedCount - newBlueCount) <= 1;
                    if (shouldContinue) {
                        sendSpectatorList();
                        startSelectionTimeout();
                    }
                    else {
                        (0, exports.endSelection)();
                    }
                }
                else {
                    console.error(`[TEAM_CHOOSER] Failed to auto-assign player during timeout`);
                    (0, exports.endSelection)();
                }
            }
            else {
                (0, exports.endSelection)();
            }
        }
    }), SELECTION_TIMEOUT);
};
// End selection with comprehensive cleanup
const endSelection = () => __awaiter(void 0, void 0, void 0, function* () {
    if (!chooserState.isActive)
        return;
    const release = yield teamMutex_1.teamMutex.acquire("endSelection");
    try {
        console.log(`[TEAM_CHOOSER] Ending selection process`);
        // Clear timeout
        if (chooserState.timeout) {
            clearTimeout(chooserState.timeout);
            chooserState.timeout = null;
        }
        // Reset state atomically
        chooserState.isActive = false;
        chooserState.redTeam = [];
        chooserState.blueTeam = [];
        chooserState.spectators = [];
        chooserState.selections = {};
        chooserState.startTime = null;
        chooserState.validationHash = null;
        // Resume game
        index_1.room.pauseGame(false);
        // Final team counts
        const finalRed = getRedPlayers().length;
        const finalBlue = getBluePlayers().length;
        (0, message_1.sendMessage)(`✅ Oyuncu seçimi tamamlandı! Kırmızı: ${finalRed}, Mavi: ${finalBlue}`);
        console.log(`[TEAM_CHOOSER] Selection ended - Final teams Red: ${finalRed}, Blue: ${finalBlue}`);
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error ending selection: ${error}`);
        // Force cleanup on error
        chooserState.isActive = false;
        chooserState.redTeam = [];
        chooserState.blueTeam = [];
        chooserState.spectators = [];
        chooserState.selections = {};
        chooserState.startTime = null;
        chooserState.validationHash = null;
        if (chooserState.timeout) {
            clearTimeout(chooserState.timeout);
            chooserState.timeout = null;
        }
        index_1.room.pauseGame(false);
    }
    finally {
        release();
    }
});
exports.endSelection = endSelection;
// Non-blocking spectator list update to avoid deadlocks
const updateSpectatorListNonBlocking = () => {
    try {
        const currentSpectators = getValidSpectators();
        // Remove spectators who are no longer valid
        chooserState.spectators = chooserState.spectators.filter(spec => currentSpectators.some(current => current.id === spec.id));
        // Update validation hash
        chooserState.validationHash = generateStateHash();
        if (chooserState.spectators.length === 0) {
            console.log(`[TEAM_CHOOSER] No spectators remaining, scheduling end selection`);
            // Schedule endSelection to avoid deadlock
            setImmediate(() => (0, exports.endSelection)());
        }
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error updating spectator list: ${error}`);
    }
};
// Export the main selection handler for use in index.ts
exports.handleSelection = exports.handleSpectatorSelection;
// Enhanced player leave handling with deadlock prevention
const handlePlayerLeave = (player) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Don't handle during team rotation
        if ((0, index_1.getTeamRotationInProgress)()) {
            return;
        }
        if (!chooserState.isActive) {
            return;
        }
        const release = yield teamMutex_1.teamMutex.acquire(`playerLeave-${player.id}`);
        try {
            // Remove from any ongoing selections
            delete chooserState.selections[player.id];
            // If a spectator leaves, update list
            const wasSpectator = chooserState.spectators.some(spec => spec.id === player.id);
            if (wasSpectator) {
                updateSpectatorListNonBlocking();
                if (chooserState.spectators.length > 0) {
                    sendSpectatorList();
                }
            }
            // If a team player leaves, update team references
            chooserState.redTeam = chooserState.redTeam.filter(p => p.id !== player.id);
            chooserState.blueTeam = chooserState.blueTeam.filter(p => p.id !== player.id);
            // Update validation hash
            chooserState.validationHash = generateStateHash();
        }
        finally {
            release();
        }
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error handling player leave: ${error}`);
    }
});
exports.handlePlayerLeave = handlePlayerLeave;
// Force end selection for admin commands
const forceEndSelection = () => __awaiter(void 0, void 0, void 0, function* () {
    console.log(`[TEAM_CHOOSER] Force ending selection`);
    yield (0, exports.endSelection)();
});
exports.forceEndSelection = forceEndSelection;
// Check if selection is active
const isSelectionActive = () => {
    return chooserState.isActive;
};
exports.isSelectionActive = isSelectionActive;
// Clean up stale spectator data to prevent false triggers and console spam
const cleanupStaleSpectators = () => {
    // Only run if we're not in an active selection
    if (chooserState.isActive)
        return;
    try {
        const currentSpectators = getValidSpectators();
        let removedCount = 0;
        // Get initial count
        const initialCount = currentSpectators.length;
        // Validate each spectator and filter out invalid ones
        const validSpectators = currentSpectators.filter(p => {
            try {
                const playerObj = index_1.room.getPlayer(p.id);
                if (!playerObj) {
                    removedCount++;
                    return false; // Player left
                }
                const augPlayer = (0, index_1.toAug)(playerObj);
                if (augPlayer.afk || playerObj.team !== 0) {
                    removedCount++;
                    return false; // Player is AFK or changed teams
                }
                return true;
            }
            catch (error) {
                removedCount++;
                return false;
            }
        });
        if (removedCount > 0) {
            console.log(`[TEAM_CHOOSER] Cleaned up ${removedCount} stale spectators. Valid spectators remaining: ${validSpectators.length}`);
        }
        // Actually update the global spectator cache if this was called during non-selection periods
        // This helps keep the spectator list accurate for future team chooser triggers
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error in spectator cleanup: ${error}`);
    }
};
exports.cleanupStaleSpectators = cleanupStaleSpectators;
// Enhanced periodic cleanup that actually maintains state consistency
const performPeriodicCleanup = () => {
    try {
        // Clean up stale spectators
        (0, exports.cleanupStaleSpectators)();
        // If there's no active selection, we can do more aggressive cleanup
        if (!chooserState.isActive) {
            // Reset any stale state that might be lingering
            if (chooserState.spectators.length > 0) {
                console.log(`[TEAM_CHOOSER] Clearing ${chooserState.spectators.length} stale spectators from inactive chooser state`);
                chooserState.spectators = [];
                chooserState.redTeam = [];
                chooserState.blueTeam = [];
                chooserState.selections = {};
                chooserState.validationHash = null;
            }
            // Clear any orphaned timeout
            if (chooserState.timeout) {
                console.log(`[TEAM_CHOOSER] Clearing orphaned selection timeout`);
                clearTimeout(chooserState.timeout);
                chooserState.timeout = null;
            }
        }
        // Additional memory cleanup for team chooser state
        const currentPlayerIds = new Set(index_1.room.getPlayerList().map(p => p.id));
        // Clean up selections for players who left
        let selectionsCleaned = 0;
        for (const playerId in chooserState.selections) {
            if (!currentPlayerIds.has(parseInt(playerId))) {
                delete chooserState.selections[playerId];
                selectionsCleaned++;
            }
        }
        if (selectionsCleaned > 0) {
            console.log(`[TEAM_CHOOSER] Cleaned up ${selectionsCleaned} stale player selections`);
        }
    }
    catch (error) {
        console.error(`[TEAM_CHOOSER] Error in periodic cleanup: ${error}`);
    }
};
// Auto-cleanup every 30 seconds to prevent stale data buildup
setInterval(performPeriodicCleanup, 30000);
