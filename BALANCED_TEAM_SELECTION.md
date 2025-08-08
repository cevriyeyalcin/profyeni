# ⚖️ BALANCED TEAM SELECTION SYSTEM

## 🎯 **New Rules Implemented**

### **1. ✅ Equal Teams → Both Can Choose**
When teams have equal players, both teams can select simultaneously from any available spectators.

### **2. ✅ Disadvantaged Team Priority**
When one team has fewer players, **only the disadvantaged team** can choose until teams are balanced.

### **3. ✅ Prevent Over-Selection**
Advantaged teams are **blocked from choosing** when they already have more players than the opposing team.

## 🎮 **Selection Scenarios**

### **Scenario 1: Equal Teams (2v2 with 2 spectators)**
```
Red Team: 2 players
Blue Team: 2 players
Spectators: PlayerA, PlayerB

🔄 Oyuncu Seçimi:
1. PlayerA [Lvl.3]
2. PlayerB [Lvl.5]
```

**Both teams see selection messages:**
- **Red Team**: "Kırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-2)"
- **Blue Team**: "Mavi takım üyeleri, oyuncu seçmek için sayı yazın (1-2)"

**Possible Selections:**
- ✅ **Red types "1"** → PlayerA goes to Red (now 3v2)
- ✅ **Blue types "2"** → PlayerB goes to Blue (now 3v3 or 2v3)
- ✅ **Both can choose any number** from the list

---

### **Scenario 2: Red Team Disadvantaged (1v2 with 3 spectators)**
```
Red Team: 1 player  ← Disadvantaged
Blue Team: 2 players
Spectators: PlayerA, PlayerB, PlayerC

🔄 Oyuncu Seçimi:
1. PlayerA [Lvl.3]
2. PlayerB [Lvl.5] 
3. PlayerC [Lvl.2]
```

**Only Red Team sees selection message:**
- **Red Team**: "Kırmızı takım üyeleri, oyuncu seçmek için sayı yazın (1-3)"
- **Blue Team**: Gets info message: "⏸️ Oyun durduruldu. Kırmızı takımı oyuncu seçiyor..."

**Selection Rules:**
- ✅ **Red can choose any number** (1, 2, or 3)
- ❌ **Blue team is blocked** from choosing
- 🔄 **After Red selects** → Teams become 2v2 → Both can choose

**If Blue tries to select:**
```
❌ Mavi takım şu anda seçim yapamaz. Kırmızı takım daha az oyuncuya sahip.
```

---

### **Scenario 3: Blue Team Disadvantaged (3v1 with 2 spectators)**
```
Red Team: 3 players
Blue Team: 1 player  ← Disadvantaged
Spectators: PlayerA, PlayerB

🔄 Oyuncu Seçimi:
1. PlayerA [Lvl.3]
2. PlayerB [Lvl.5]
```

**Only Blue Team sees selection message:**
- **Blue Team**: "Mavi takım üyeleri, oyuncu seçmek için sayı yazın (1-2)"
- **Red Team**: Gets info message: "⏸️ Oyun durduruldu. Mavi takımı oyuncu seçiyor..."

**Selection Rules:**
- ✅ **Blue can choose any number** (1 or 2)
- ❌ **Red team is blocked** from choosing
- 🔄 **After Blue selects** → Teams become 3v2 → Only Blue can still choose
- 🔄 **After Blue selects again** → Teams become 3v3 → Both can choose

**If Red tries to select:**
```
❌ Kırmızı takım şu anda seçim yapamaz. Mavi takım daha az oyuncuya sahip.
```

## 🔄 **Dynamic Team Balancing**

The system recalculates team selection rights after each choice:

### **Example Flow (1v1 → 2v2):**
1. **Start**: 1v1 with 2 spectators → Both teams can choose
2. **Red chooses**: Now 2v1 → Only Blue can choose  
3. **Blue chooses**: Now 2v2 → Both teams can choose again

### **Example Flow (1v3 → 3v3):**
1. **Start**: 1v3 with 4 spectators → Only Red can choose
2. **Red chooses**: Now 2v3 → Only Red can choose
3. **Red chooses**: Now 3v3 → Both teams can choose

## 🧠 **Smart Selection Logic**

### **After Each Selection:**
```typescript
if (redCount < blueCount) {
  // Only red team can choose (disadvantaged)
  waitingForRed = true;
  waitingForBlue = false;
} else if (blueCount < redCount) {
  // Only blue team can choose (disadvantaged)  
  waitingForRed = false;
  waitingForBlue = true;
} else {
  // Teams equal, both can choose
  waitingForRed = true;
  waitingForBlue = true;
}
```

## 🎯 **Key Benefits**

### **1. 🚫 Prevents Unfair Advantages**
- Teams can't "stack" players when they already have more
- Disadvantaged teams get priority selection

### **2. ⚖️ Automatic Balancing**
- System dynamically adjusts selection rights
- Always works toward team balance

### **3. 🎮 Flexible Selection**
- Equal teams can compete for any spectator
- Multiple choices possible when allowed
- Numbers 1-6+ represent spectators in order

### **4. 🔄 Smart Transitions**
- Seamlessly switches between selection modes
- Clear messaging about who can select
- Automatic game resumption when balanced

## 🎪 **Complete Example (2v2 → 4v4)**

**Initial**: 2v2 with 4 spectators
```
🔄 Oyuncu Seçimi:
1. PlayerA [Lvl.3]
2. PlayerB [Lvl.5]
3. PlayerC [Lvl.2] 
4. PlayerD [Lvl.4]

Both teams can choose any number (1-4)
```

**Selections:**
1. **Red chooses "3"** → PlayerC to Red (3v2) → Only Blue can choose
2. **Blue chooses "1"** → PlayerA to Blue (3v3) → Both can choose
3. **Red chooses "4"** → PlayerD to Red (4v3) → Only Blue can choose
4. **Blue chooses "2"** → PlayerB to Blue (4v4) → Selection ends

**Result**: Perfectly balanced 4v4 teams! 🎉

The system ensures fair, balanced team selection while maintaining flexibility and preventing team stacking!