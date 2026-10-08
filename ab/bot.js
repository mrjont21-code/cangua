/**
 * bot.js — chọn nước đi theo bảng ưu tiên Actions.BOT_PRIORITY
 */
(function (global) {
  'use strict';

  function chooseMove(state, moves) {
    const Actions = global.Actions;
    if (!moves || !moves.length) return null;
    if (moves.length === 1) return moves[0];

    let best = null;
    let bestRank = 999;
    let bestKey = 'unknown';
    const errors = [];

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let key;
      try {
        key = Actions.classify(m, state);
      } catch (e) {
        key = 'unknown';
        errors.push(e);
      }
      const rank = Actions.rankOf(key);
      if (rank < bestRank) {
        bestRank = rank;
        best = m;
        bestKey = key;
      } else if (rank === bestRank && best) {
        // tie-break: smaller horseId
        if (m.horseId < best.horseId) {
          best = m;
          bestKey = key;
        }
      }
    }

    if (!best) best = moves[0];

    // safety: must be in list
    const mk = Actions.moveKey(best);
    const found = moves.some(function (m) { return Actions.moveKey(m) === mk; });
    if (!found) best = moves[0];

    best._botRule = bestKey;
    return best;
  }

  function classify(move, state) {
    return global.Actions.classify(move, state);
  }

  global.Bot = { chooseMove, classify };
})(typeof window !== 'undefined' ? window : globalThis);
