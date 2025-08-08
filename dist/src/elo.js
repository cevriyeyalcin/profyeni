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
exports.changeElo = void 0;
const __1 = require("..");
const k = 30;
const getp1 = (elo, enemyTeamElo) => 1 / (1 + 10 ** ((elo - enemyTeamElo) / 400));
const getAvgElo = (playerListWithElo) => {
    if (playerListWithElo.length == 0) {
        throw ("There are no players with elo in one of the teams.");
    }
    return playerListWithElo
        .map(p => p.elo)
        .reduce((a, b) => a + b, 0) / playerListWithElo.length;
};
const changeElo = (game, winnerTeamId) => __awaiter(void 0, void 0, void 0, function* () {
    const holdPlayersWithElo = [];
    for (const holdPlayer of game.holdPlayers) {
        const result = yield __1.db.get("SELECT elo FROM players WHERE auth=?", [
            holdPlayer.auth,
        ]);
        holdPlayersWithElo.push(Object.assign(Object.assign({}, holdPlayer), { elo: result.elo }));
    }
    const loserTeamId = winnerTeamId == 1 ? 2 : 1;
    const winners = holdPlayersWithElo.filter(p => p.team == winnerTeamId);
    const losers = holdPlayersWithElo.filter(p => p.team == loserTeamId);
    const winnerTeamElo = getAvgElo(winners);
    const loserTeamElo = getAvgElo(losers);
    const changeLosers = losers.map(p => {
        const p1 = getp1(p.elo, winnerTeamElo);
        const change = -Math.round((k * (1 - p1)));
        if (isNaN(change)) {
            throw ("Change is not a number.");
        }
        return { id: p.id, auth: p.auth, change };
    });
    const changeWinners = winners.map(p => {
        const p1 = getp1(p.elo, loserTeamElo);
        const change = Math.round((k * p1));
        if (isNaN(change)) {
            throw ("Change is not a number.");
        }
        return { id: p.id, auth: p.auth, change };
    });
    const changeList = [...changeWinners, ...changeLosers];
    for (const changeTuple of changeList) {
        yield __1.db.run(`UPDATE players SET elo=elo+? WHERE auth=?`, [changeTuple.change, changeTuple.auth]);
    }
    return changeList;
});
exports.changeElo = changeElo;
