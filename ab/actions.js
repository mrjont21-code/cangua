/**
 * actions.js — Danh mục hành động + bảng ưu tiên bot + moveKey
 */
(function (global) {
  'use strict';

  function moveKey(move) {
    if (!move) return '';
    return String(move.type) + ':' + String(move.horseId);
  }

  /** Ưu tiên bot: hạng nhỏ hơn = ưu tiên cao hơn */
  const BOT_PRIORITY = [
    { rank: 1, key: 'home',       match: (m) => m.type === 'home' },
    { rank: 2, key: 'exit',       match: (m) => m.type === 'exit' },
    { rank: 3, key: 'kick',       match: (m) => m.type === 'kick' || m.type === 'swap' },
    { rank: 4, key: 'fly_kick',   match: (m) => m.type === 'fly_kick' },
    { rank: 5, key: 'kick_rear',  match: (m) => m.type === 'kick_rear' },
    { rank: 6, key: 'fly',        match: (m) => m.type === 'fly' },
    { rank: 7, key: 'move_near',  match: (m, st) => {
      if (m.type !== 'move') return false;
      const BD = global.BoardData;
      if (!BD || !st) return false;
      const h = (st.horses || []).find((x) => x.id === m.horseId);
      if (!h || h.zone !== 'track') return false;
      const len = BD.pathLen(h.colorId);
      const remain = len - 1 - (h.pathIndex || 0);
      return remain <= 12;
    }},
    { rank: 8, key: 'move',       match: (m) => m.type === 'move' },
  ];

  function classify(move, state) {
    for (let i = 0; i < BOT_PRIORITY.length; i++) {
      const r = BOT_PRIORITY[i];
      try {
        if (r.match(move, state)) return r.key;
      } catch (e) { /* ignore */ }
    }
    return 'unknown';
  }

  function rankOf(key) {
    for (let i = 0; i < BOT_PRIORITY.length; i++) {
      if (BOT_PRIORITY[i].key === key) return BOT_PRIORITY[i].rank;
    }
    return 999;
  }

  global.Actions = { moveKey, BOT_PRIORITY, classify, rankOf };
})(typeof window !== 'undefined' ? window : globalThis);
