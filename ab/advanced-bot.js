/**
 * advanced-bot.js — Bot V2.5: heuristic đa chiều + chọn skill khắc chế
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

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      let key;
      try { key = Actions.classify(m, state); } catch (e) { key = 'unknown'; }
      if (m.type === 'swap') key = 'kick';
      if (m.warp || m.warpBonusSteps) key = 'fly';
      if (m.leap) key = 'move';
      if (m._comboExtra) key = 'move';

      const rank = Actions.rankOf(key);
      // Ưu tiên kick vào Thiết Giáp nếu có khiên? Không — tránh
      if (m.kickId != null) {
        const vic = state.horses.find((h) => h.id === m.kickId);
        if (vic && vic.skillId === 5 && (vic.shieldHp || 0) > 0) {
          // penalize attacking shield unless kamikaze
          const att = state.horses.find((h) => h.id === m.horseId);
          if (!att || att.skillId !== 9) {
            // lower priority
            if (rank + 2 < bestRank) { /* skip prefer */ }
            else continue;
          }
        }
      }

      if (rank < bestRank) {
        bestRank = rank; best = m; bestKey = key;
      } else if (rank === bestRank && best && m.horseId < best.horseId) {
        best = m; bestKey = key;
      }
    }
    if (!best) best = moves[0];
    const mk = Actions.moveKey(best);
    if (!moves.some((m) => Actions.moveKey(m) === mk)) best = moves[0];
    best._botRule = bestKey;
    return best;
  }

  function chooseSkill(state, horseId) {
    const AS = global.AdvancedSkills;
    const horse = state.horses.find((h) => h.id === horseId);
    if (!horse) return 1;
    const colorId = horse.colorId;
    const myHorses = state.horses.filter((h) => h.colorId === colorId);

    const systemCount = { breakthrough: 0, defense: 0, disruption: 0 };
    myHorses.forEach((h) => {
      if (!h.skillId) return;
      const sk = AS.getSkill(h.skillId);
      if (sk) systemCount[sk.system]++;
    });

    // Đọc thế cờ đối phương
    const enemies = state.horses.filter((h) => h.colorId !== colorId);
    const enemySystems = { breakthrough: 0, defense: 0, disruption: 0 };
    enemies.forEach((h) => {
      if (!h.skillId || !h.isRevealed) return;
      const sk = AS.getSkill(h.skillId);
      if (sk) enemySystems[sk.system]++;
    });

    // Khắc chế: Đột Phá > Phòng Thủ > Phá Hoại > Đột Phá
    // Nếu địch nhiều Phòng Thủ → chọn Đột Phá
    // Nếu địch nhiều Đột Phá → chọn Phá Hoại
    // Nếu địch nhiều Phá Hoại → chọn Phòng Thủ
    let preferred = 'breakthrough';
    if (enemySystems.defense >= enemySystems.breakthrough && enemySystems.defense >= enemySystems.disruption) {
      preferred = 'breakthrough';
    } else if (enemySystems.breakthrough >= enemySystems.disruption) {
      preferred = 'disruption';
    } else {
      preferred = 'defense';
    }

    // Balance đội mình
    if (systemCount[preferred] >= 2) {
      const order = ['breakthrough', 'defense', 'disruption'];
      preferred = order.find((s) => systemCount[s] < 2) || preferred;
    }

    const candidates = AS.listBySystem(preferred).filter((sk) =>
      AS.canSelectSkill(state, colorId, sk.id)
    );
    if (!candidates.length) {
      const all = AS.listSkills().filter((sk) => AS.canSelectSkill(state, colorId, sk.id));
      return all.length ? all[Math.floor(Math.random() * all.length)].id : 1;
    }

    // Ưu tiên skill mạnh theo hệ
    const priority = {
      breakthrough: [1, 2, 3, 4],
      defense: [5, 6, 8, 7],
      disruption: [9, 11, 10, 12]
    };
    const order = priority[preferred] || candidates.map((c) => c.id);
    for (const id of order) {
      if (candidates.some((c) => c.id === id)) return id;
    }
    return candidates[0].id;
  }

  function classify(move, state) {
    return global.Actions.classify(move, state);
  }

  global.AdvancedBot = { chooseMove, chooseSkill, classify };
})(typeof window !== 'undefined' ? window : globalThis);
