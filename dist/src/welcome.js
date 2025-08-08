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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initPlayer = exports.welcomePlayer = void 0;
const message_1 = require("./message");
const db_1 = require("./db");
const __1 = require("..");
const config_1 = __importDefault(require("../config"));
const welcomePlayer = (room, p) => {
    (0, message_1.sendMessage)(`${config_1.default.roomName}\nTüm komutları görmek için "!help" yaz.`, p);
    (0, message_1.sendMessage)(`"X" tuşuna kısa bas kaydır, uzun bas koş. Takım içi paslar topa daha güçlü vurmanı sağlar.`, p);
    (0, message_1.sendMessage)(`Discord: discord.gg/profstriker`, p);
};
exports.welcomePlayer = welcomePlayer;
const initPlayer = (p) => __awaiter(void 0, void 0, void 0, function* () {
    let newPlayer = new __1.PlayerAugmented(p);
    if (__1.game) {
        const found = __1.game.holdPlayers.find((pp) => pp.auth == p.auth);
        // If player reconnected into the same game, apply cooldowns, cards and
        // injuries.
        if (found) {
            // player was already in game
            // disallow reconnect on the same game (giving red card)
            newPlayer = new __1.PlayerAugmented(Object.assign(Object.assign({}, p), { foulsMeter: 2, cardsAnnounced: 2 }));
            found.id = p.id; // so that the elo decrease is shown to him
        }
        else {
            // when he connects during the game, push in with team: 0 to not
            // assign any points, but not let him back in on reconnect (in
            // case he abuses red card + reconnect during warmup)
            __1.game.holdPlayers.push({ id: p.id, auth: p.auth, team: 0 });
        }
    }
    __1.players.push(newPlayer);
    const readPlayer = yield (0, db_1.getOrCreatePlayer)(p);
    newPlayer.elo = readPlayer.elo;
    yield __1.db.run("UPDATE players SET name=? WHERE auth=?", [p.name, p.auth]);
});
exports.initPlayer = initPlayer;
