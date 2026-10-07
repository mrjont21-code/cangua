/**
 * advanced-bot.js — Bot cho chế độ Nâng cao
 * Chọn nước đi + chọn skill khi xuất quân.
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
      try {
        key = Actions.classify(m, state);
      } catch (e) {
        key = 'unknown';
      }
      // Ưu tiên thêm các type mới
      if (m.type === 'swap') key = 'kick'; // coi như aggressive
      if (m.warp) key = 'fly';
      if (m._comboExtra) key = 'move';

      const rank = Actions.rankOf(key);
      if (rank < bestRank) {
        bestRank = rank;
        best = m;
        bestKey = key;
      } else if (rank === bestRank && best) {
        if (m.horseId < best.horseId) {
          best = m;
          bestKey = key;
        }
      }
    }

    if (!best) best = moves[0];
    const mk = Actions.moveKey(best);
    const found = moves.some((m) => Actions.moveKey(m) === mk);
    if (!found) best = moves[0];
    best._botRule = bestKey;
    return best;
  }

  /**
   * Chọn skill khi xuất quân.
   * Ưu tiên theo trạng thái bàn + balance đội hình.
   */
  function chooseSkill(state, horseId) {
    const AS = global.AdvancedSkills;
    const horse = state.horses.find((h) => h.id === horseId);
    if (!horse) return 1;

    const colorId = horse.colorId;
    const myHorses = state.horses.filter((h) => h.colorId === colorId);
    const used = {};
    myHorses.forEach((h) => {
      if (h.skillId) used[h.skillId] = (used[h.skillId] || 0) + 1;
    });

    // Đếm hệ đã có
    const systemCount = { breakthrough: 0, defense: 0, disruption: 0 };
    myHorses.forEach((h) => {
      if (!h.skillId) return;
      const sk = AS.getSkill(h.skillId);
      if (sk) systemCount[sk.system] = (systemCount[sk.system] || 0) + 1;
    });

    // Ưu tiên hệ còn thiếu
    let preferredSystem = 'breakthrough';
    if (systemCount.defense <= systemCount.breakthrough && systemCount.defense <= systemCount.disruption) {
      preferredSystem = 'defense';
    } else if (systemCount.disruption <= systemCount.breakthrough) {
      preferredSystem = 'disruption';
    }

    // Điều chỉnh theo tình hình
    const enemiesOnTrack = state.horses.filter(
      (h) => h.colorId !== colorId && h.zone === 'track'
    ).length;
    const myOnTrack = myHorses.filter((h) => h.zone === 'track').length;

    if (enemiesOnTrack >= 3 && systemCount.disruption < 2) preferredSystem = 'disruption';
    if (myOnTrack >= 2 && systemCount.defense < 1) preferredSystem = 'defense';

    const candidates = AS.listBySystem(preferredSystem).filter((sk) =>
      AS.canSelectSkill(state, colorId, sk.id)
    );

    if (!candidates.length) {
      // fallback any available
      const all = AS.listSkills().filter((sk) => AS.canSelectSkill(state, colorId, sk.id));
      if (!all.length) return 1;
      return all[Math.floor(Math.random() * all.length)].id;
    }

    // Trong hệ: ưu tiên skill mạnh theo ngữ cảnh
    let best = candidates[0];
    if (preferredSystem === 'defense') {
      best = candidates.find((s) => s.id === 5) || candidates.find((s) => s.id === 6) || best;
    } else if (preferredSystem === 'disruption') {
      best = candidates.find((s) => s.id === 9) || candidates.find((s) => s.id === 10) || best;
    } else {
      best = candidates.find((s) => s.id === 1) || candidates.find((s) => s.id === 2) || best;
    }
    return best.id;
  }

  function classify(move, state) {
    return global.Actions.classify(move, state);
  }

  global.AdvancedBot = { chooseMove, chooseSkill, classify };
})(typeof window !== 'undefined' ? window : globalThis);
