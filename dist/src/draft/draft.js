"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.performDraft = void 0;
const fs = __importStar(require("fs"));
const node_path_1 = __importDefault(require("node:path"));
const message_1 = require("../message");
const __1 = require("../..");
const utils_1 = require("../utils");
/* Will be moved to separate NPM module,
 * therefore in a separate folder */
const performDraft = (room, players, maxTeamSize, afkHandler) => __awaiter(void 0, void 0, void 0, function* () {
    room.stopGame();
    players.forEach((p) => room.setPlayerTeam(p.id, 0));
    const draftMap = fs.readFileSync(node_path_1.default.join(__dirname, "draft.hbs"), {
        encoding: "utf8",
        flag: "r",
    });
    room.setCustomStadium(draftMap);
    // set blue players kickable (kicking them by red players results in
    // choose)
    players.slice(0, 2).forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
        room.setPlayerTeam(p.id, 1);
    }));
    yield (0, utils_1.sleep)(100);
    room.startGame();
    yield (0, utils_1.sleep)(100);
    players.slice(0, 2).forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
        if (room.getPlayer(p.id)) {
            room.setPlayerDiscProperties(p.id, {
                cGroup: room.CollisionFlags.red |
                    room.CollisionFlags.c3 |
                    room.CollisionFlags.c1,
            });
        }
    }));
    (0, message_1.sendMessage)("Draft has started. Captains choose players by KICKING (X).");
    let redPicker = players[0];
    let bluePicker = players[1];
    players.slice(2).forEach((p) => __awaiter(void 0, void 0, void 0, function* () {
        room.setPlayerTeam(p.id, 2);
        yield (0, utils_1.sleep)(100);
        if (room.getPlayer(p.id)) {
            room.setPlayerDiscProperties(p.id, {
                cGroup: room.CollisionFlags.blue |
                    room.CollisionFlags.c3 |
                    room.CollisionFlags.c1,
            });
        }
    }));
    (0, message_1.sendMessage)("BLUE enter the draft area (20s).");
    yield (0, utils_1.sleep)(20000);
    room
        .getPlayerList()
        .filter((p) => p.team == 2)
        .forEach((p) => room.setPlayerDiscProperties(p.id, {
        cGroup: room.CollisionFlags.blue |
            room.CollisionFlags.kick |
            room.CollisionFlags.c1,
    })); // dont collide with middle line blocks and set kickable
    const setLock = (p) => {
        const props = room.getPlayerDiscProperties(p.id);
        room.setPlayerDiscProperties(p.id, {
            cGroup: room.CollisionFlags.red |
                room.CollisionFlags.c3 |
                room.CollisionFlags.c1,
        });
        if (Math.abs(props.x) <= 55) {
            room.setPlayerDiscProperties(p.id, { x: Math.sign(props.x) * 70 });
        }
    };
    const setUnlock = (p) => {
        room.setPlayerDiscProperties(p.id, {
            cGroup: room.CollisionFlags.red | room.CollisionFlags.c1,
        });
    };
    const redZone = { x: [-360, -210], y: [0, 300] };
    const blueZone = { x: [210, 360], y: [0, 300] };
    const midZone = { x: [-15, 15], y: [-300, 600] };
    const playersInZone = (zone) => room
        .getPlayerList()
        .filter((p) => p.team == 2)
        .filter((p) => {
        if (!room.getScores()) {
            return [];
        }
        const props = room.getPlayerDiscProperties(p.id);
        return (props.x > zone.x[0] &&
            props.x < zone.x[1] &&
            props.y > zone.y[0] &&
            props.y < zone.y[1]);
    });
    // segment [62] and [63] is middle draft block
    // segment [64] is left chooser block
    // segment [65] is right chooser block
    // f0c0f0 set cmask: c3
    // spawn: x: -150, y: 150
    // x: 25
    (0, message_1.sendMessage)(redPicker.name + " picks teammate...");
    (0, message_1.sendMessage)("PICK YOUR TEAMMATE by KICKING him!", redPicker);
    let pickingNow = "red";
    let totalWait = 0;
    const pickTimeLimit = 20000; // ms
    const sleepTime = 100; // ms
    setUnlock(redPicker);
    let previousMidZoneLength = 0;
    while (playersInZone(midZone).length != 0) {
        const setNewPickerRed = () => __awaiter(void 0, void 0, void 0, function* () {
            if (room
                .getPlayerList()
                .map((p) => p.id)
                .includes(redPicker.id)) {
                room.setPlayerTeam(redPicker.id, 0);
                if (afkHandler) {
                    afkHandler(redPicker);
                }
            }
            const midPlayers = playersInZone(midZone);
            redPicker = midPlayers[0];
            room.setPlayerTeam(redPicker.id, 1);
            yield (0, utils_1.sleep)(100);
            room.setPlayerDiscProperties(redPicker.id, { x: -120, y: 0 });
            if (pickingNow == "red") {
                setUnlock(redPicker);
            }
            else {
                setLock(redPicker);
            }
            totalWait = 0;
        });
        const setNewPickerBlue = () => __awaiter(void 0, void 0, void 0, function* () {
            if (room
                .getPlayerList()
                .map((p) => p.id)
                .includes(bluePicker.id)) {
                room.setPlayerTeam(bluePicker.id, 0);
                if (afkHandler) {
                    afkHandler(bluePicker);
                }
            }
            const midPlayers = playersInZone(midZone);
            bluePicker = midPlayers[0];
            room.setPlayerTeam(bluePicker.id, 1);
            yield (0, utils_1.sleep)(100);
            room.setPlayerDiscProperties(bluePicker.id, { x: 120, y: 0 });
            if (pickingNow == "blue") {
                setUnlock(bluePicker);
            }
            else {
                setLock(bluePicker);
            }
            totalWait = 0;
        });
        // if teams full
        if (playersInZone(redZone).length == maxTeamSize - 1 &&
            playersInZone(blueZone).length == maxTeamSize - 1) {
            break;
        }
        // if picker left
        if (!room
            .getPlayerList()
            .map((p) => p.id)
            .includes(redPicker.id) ||
            (0, __1.toAug)(redPicker).afk) {
            (0, message_1.sendMessage)("Red picker left. Changing red picker...");
            yield setNewPickerRed();
        }
        if (!room
            .getPlayerList()
            .map((p) => p.id)
            .includes(bluePicker.id) ||
            (0, __1.toAug)(bluePicker).afk) {
            (0, message_1.sendMessage)("Blue picker left. Changing blue picker...");
            yield setNewPickerBlue();
        }
        totalWait += sleepTime;
        // reset wait if player was picked
        if (playersInZone(midZone).length != previousMidZoneLength) {
            previousMidZoneLength = playersInZone(midZone).length;
            totalWait = 0;
        }
        if (pickingNow == "red") {
            if (playersInZone(redZone).length >= playersInZone(blueZone).length + 1 ||
                totalWait > pickTimeLimit) {
                if (totalWait > pickTimeLimit) {
                    (0, message_1.sendMessage)("Timeout. Changing red picker...");
                    yield setNewPickerRed();
                    continue;
                }
                pickingNow = "blue";
                (0, message_1.sendMessage)(bluePicker.name + " picks teammate...");
                (0, message_1.sendMessage)("Pick 2 players by KICKING them.", bluePicker);
                setUnlock(bluePicker);
                setLock(redPicker);
                totalWait = 0;
                continue;
            }
        }
        else {
            if (playersInZone(blueZone).length >= playersInZone(redZone).length + 1 ||
                totalWait > pickTimeLimit) {
                if (totalWait > pickTimeLimit) {
                    (0, message_1.sendMessage)("Timeout. Changing blue picker...");
                    yield setNewPickerBlue();
                    continue;
                }
                pickingNow = "red";
                (0, message_1.sendMessage)(`${redPicker.name} picks teammate...`);
                (0, message_1.sendMessage)("Pick 2 players by KICKING them!", redPicker);
                setUnlock(redPicker);
                setLock(bluePicker);
                totalWait = 0;
                continue;
            }
        }
        yield (0, utils_1.sleep)(sleepTime);
        if (!room.getScores()) {
            (0, message_1.sendMessage)("Draft cancelled.");
            break;
        }
    }
    yield (0, utils_1.sleep)(100); // wait for last pick to arrive in box
    const red = [...playersInZone(redZone), redPicker];
    const blue = [...playersInZone(blueZone), bluePicker];
    room
        .getPlayerList()
        .filter((p) => ![...red, ...blue, ...playersInZone(midZone)]
        .map((pp) => pp.id)
        .includes(p.id))
        .forEach((p) => {
        if (afkHandler) {
            afkHandler(p);
        }
    });
    room.stopGame();
    (0, message_1.sendMessage)("Draft finished.");
    return { red, blue };
});
exports.performDraft = performDraft;
