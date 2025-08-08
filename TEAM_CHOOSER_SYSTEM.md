# ✅ Team Chooser System - COMPLETE

## 🎯 Overview

A balanced team selection mechanism that allows **all team members** (not just captains) to choose players from spectators when there are 2+ spectators available. The system automatically triggers during ball out events and pauses the game for selection.

## 🚀 Key Features

### **1. Automatic Triggering**
- ✅ Activates when there are **2+ spectators** 
- ✅ Teams aren't full (max 6 per team)
- ✅ Teams are balanced (max 1 player difference)
- ✅ Triggers during ball out events: **throw-in, corner kick, free kick, penalty**

### **2. Team-Based Selection**
- ✅ **All team members** can choose (not just captains)
- ✅ Team with **fewer players chooses first**
- ✅ If teams are equal, **red team goes first**
- ✅ Teams alternate selection turns

### **3. Game Management**
- ✅ **Automatic game pause** during selection
- ✅ **30-second timeout** with auto-assignment
- ✅ **Game resumes** after selection completes
- ✅ **Admin override** command available

## 🎮 How It Works

### **Triggering Conditions:**
```
✓ 2+ spectators available
✓ Red team < 6 players OR Blue team < 6 players  
✓ |Red count - Blue count| ≤ 1
✓ Ball goes out (throw-in, corner, free kick, penalty)
```

### **Selection Process:**
1. **Game Pauses** ⏸️
2. **Current team gets numbered list** of spectators
3. **Team members type number** to select player
4. **Player assigned** to team
5. **Switch to other team** or end selection
6. **Game Resumes** ▶️

## 💬 Chat Interface

### **For Selecting Team:**
```
🔄 Oyuncu Seçimi:
1. PlayerName [Lvl.3]
2. AnotherPlayer [Lvl.5]  
3. ThirdPlayer [Lvl.2]

Kırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-3)
```

### **For Other Players:**
```
⏸️ Oyun durduruldu. Kırmızı takımı oyuncu seçiyor...
```

### **Selection Result:**
```
🎯 Kırmızı takımından PlayerName, AnotherPlayer oyuncusunu seçti!
```

### **Completion:**
```
▶️ Oyuncu seçimi tamamlandı. Oyun devam ediyor!
```

## 🎛️ Commands

### **Number Selection (During Active Selection):**
- **Usage**: Just type `1`, `2`, `3`, etc.
- **Who**: Only current selecting team members
- **Effect**: Assigns the numbered spectator to your team

### **Admin Commands:**
- **`!seçimiptal`** - Force end active selection (Admin only)

## ⚙️ Technical Details

### **Files Created/Modified:**

#### **New File: `src/teamChooser.ts`**
- Core team selection logic
- State management and timeouts
- Player selection validation
- Game pause/resume handling

#### **Modified Files:**
- **`src/command.ts`** - Number input handling & admin commands
- **`src/out.ts`** - Integration with ball out events  
- **`src/chooser.ts`** - Player leave event handling
- **`index.ts`** - Player leave event integration

### **System State:**
```typescript
interface ChooserState {
  isActive: boolean;           // Selection in progress
  waitingForRed: boolean;      // Red team's turn
  waitingForBlue: boolean;     // Blue team's turn  
  availableSpectators: PlayerAugmented[];
  selectionTimeout: NodeJS.Timeout | null;
}
```

## 🔧 Configuration

### **Adjustable Settings:**
- **Selection timeout**: `30 seconds` (SELECTION_TIMEOUT)
- **Max team size**: `6 players` (from settings.teamSize)
- **Balance threshold**: `1 player difference`

### **Trigger Events:**
- Throw-in (ball out top/bottom)
- Corner kick (ball out left/right)  
- Free kick (fouls)
- Penalty (box fouls)

## 🎪 Example Flow

### **Scenario: 4v3 game with 3 spectators**
1. **Ball goes out** → System checks conditions ✅
2. **Game pauses** ⏸️
3. **Blue team** (3 players) gets to choose first
4. **All blue players** see numbered spectator list
5. **Any blue player types "2"** → Selects spectator #2
6. **Player assigned** to blue team → Now 4v4
7. **Red team's turn** → They see remaining spectators  
8. **Red player types "1"** → Selects spectator #1
9. **Now 5v4** → Selection continues or ends based on balance
10. **Game resumes** ▶️

## 🛡️ Error Handling

### **Automatic Safeguards:**
- ✅ **Player leaves during selection** → Update lists or cancel
- ✅ **Team becomes empty** → Cancel selection  
- ✅ **Spectator leaves** → Remove from selection list
- ✅ **Invalid number input** → Error message to player
- ✅ **Wrong team member** → "Not your turn" message
- ✅ **Selection timeout** → Auto-assign first available spectator

### **Admin Controls:**
- ✅ **`!seçimiptal`** → Force end selection anytime
- ✅ **Game state protection** → Can't break game flow

## ✨ Benefits

1. **🎯 Balanced Teams**: Automatically maintains team balance
2. **⚡ Fast Selection**: 30-second timeout prevents delays  
3. **🤝 Democratic**: All team members can participate in selection
4. **🔄 Automatic**: Triggers seamlessly during natural game pauses
5. **🛡️ Robust**: Handles all edge cases and player leaves
6. **🎮 Non-Intrusive**: Only activates when needed (2+ spectators)

## 🎊 Result

Your Haxball room now has an intelligent, automatic team balancing system that maintains fair gameplay while keeping games flowing smoothly!