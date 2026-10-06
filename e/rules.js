/**
 * rules.js — Luật Cá Ngựa (1 xúc xắc, xuất = 6)
 * - Không được nhảy cách qua nút xuất quân (START của bất kỳ màu)
 * - Đá hậu: xúc 1 + đối phương ngay ô phía sau → đá về chuồng (trình diễn như đá quân)
 */
(function (global) {
  'use strict';
  const BD = () => global.BoardData;

  function createHorseState(colorId, slotIndex) {
    const slot = BD().penSlots(colorId)[slotIndex];
    return {
      id: colorId * 4 + slotIndex,
      colorId,
      slotIndex,
      zone: 'pen',
      pathIndex: -1,
      homeIndex: 0,
      gx: slot.gx,
      gy: slot.gy
    };
  }

  function createGameState(numPlayers) {
    const n = Math.max(2, Math.min(4, numPlayers || 4));
    const order = [2, 3, 1, 0].slice(0, n);
    const horses = [];
    order.forEach((cid) => {
      for (let s = 0; s < 4; s++) horses.push(createHorseState(cid, s));
    });
    return {
      players: order.map((cid, i) => ({
        colorId: cid,
        name: BD().COLORS[cid].name,
        index: i
      })),
      horses,
      current: 0,
      dice: 0,
      phase: 'turn',
      winner: null,
      extraTurn: false
    };
  }

  function horsesOf(state, colorId) {
    return state.horses.filter((h) => h.colorId === colorId);
  }

  function occupantAt(state, gx, gy, exceptId) {
    const eps = 0.2;
    return state.horses.find(
      (h) =>
        h.id !== exceptId &&
        h.zone !== 'pen' &&
        h.zone !== 'done' &&
        Math.abs(h.gx - gx) < eps &&
        Math.abs(h.gy - gy) < eps
    );
  }

  function isStartCell(gx, gy) {
    const eps = 0.2;
    const S = BD().START;
    for (const k of Object.keys(S)) {
      const s = S[k];
      if (Math.abs(s.gx - gx) < eps && Math.abs(s.gy - gy) < eps) return true;
    }
    return false;
  }

  function pathCellsBetween(colorId, fromIdx, toIdx) {
    const cells = [];
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const c = BD().cellAt(colorId, i);
      if (c) cells.push({ gx: c.gx, gy: c.gy });
    }
    return cells;
  }

  /** Có bị chắn giữa (quân hoặc nút xuất quân) không — không tính ô đích */
  function blockedBetween(state, horse, fromIdx, toIdx) {
    for (let i = fromIdx + 1; i < toIdx; i++) {
      const c = BD().cellAt(horse.colorId, i);
      if (!c) continue;
      if (isStartCell(c.gx, c.gy)) return true; // không nhảy cách qua nút xuất quân
      if (occupantAt(state, c.gx, c.gy, horse.id)) return true;
    }
    return false;
  }

  function movesForHorse(state, horse, dice) {
    const moves = [];
    if (!horse || dice < 1 || dice > 6) return moves;

    // —— Xuất quân ——
    if (horse.zone === 'pen') {
      if (dice === 6) {
        const st = BD().START[horse.colorId];
        const occ = occupantAt(state, st.gx, st.gy, horse.id);
        if (!(occ && occ.colorId === horse.colorId)) {
          moves.push({
            type: 'exit',
            horseId: horse.id,
            horseSlot: horse.slotIndex,
            toGx: st.gx,
            toGy: st.gy,
            pathIndex: 0,
            steps: 1,
            cells: [{ gx: st.gx, gy: st.gy }],
            kickId: occ && occ.colorId !== horse.colorId ? occ.id : null
          });
        }
      }
      return moves;
    }

    // —— Đá hậu: xúc 1 + đối phương ngay ô phía sau trên path ——
    if (horse.zone === 'track' && dice === 1 && horse.pathIndex > 0) {
      const behind = BD().cellAt(horse.colorId, horse.pathIndex - 1);
      if (behind) {
        const occ = occupantAt(state, behind.gx, behind.gy, horse.id);
        if (occ && occ.colorId !== horse.colorId) {
          moves.push({
            type: 'kick_rear',
            horseId: horse.id,
            horseSlot: horse.slotIndex,
            toGx: horse.gx,
            toGy: horse.gy,
            pathIndex: horse.pathIndex,
            steps: 0,
            cells: [],
            kickId: occ.id
          });
        }
      }
    }

    // —— Trên đường ——
    if (horse.zone === 'track') {
      const len = BD().pathLen(horse.colorId);
      const dest = horse.pathIndex + dice;

      if (dest < len) {
        if (blockedBetween(state, horse, horse.pathIndex, dest)) return moves;
        const cell = BD().cellAt(horse.colorId, dest);
        const occ = occupantAt(state, cell.gx, cell.gy, horse.id);
        if (occ && occ.colorId === horse.colorId) return moves;
        moves.push({
          type: occ ? 'kick' : 'move',
          horseId: horse.id,
          horseSlot: horse.slotIndex,
          toGx: cell.gx,
          toGy: cell.gy,
          pathIndex: dest,
          steps: dice,
          cells: pathCellsBetween(horse.colorId, horse.pathIndex, dest),
          kickId: occ ? occ.id : null
        });
      } else {
        const toEntry = len - 1 - horse.pathIndex;
        const intoHome = dice - toEntry;
        if (intoHome >= 1 && intoHome <= 6) {
          if (blockedBetween(state, horse, horse.pathIndex, len - 1)) return moves;
          const cell = BD().homeCell(horse.colorId, intoHome);
          if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
            const cells = pathCellsBetween(horse.colorId, horse.pathIndex, len - 1);
            cells.push({ gx: cell.gx, gy: cell.gy });
            moves.push({
              type: 'home',
              horseId: horse.id,
              horseSlot: horse.slotIndex,
              toGx: cell.gx,
              toGy: cell.gy,
              homeIndex: intoHome,
              steps: cells.length,
              cells,
              kickId: null
            });
          }
        }
      }
      return moves;
    }

    if (horse.zone === 'home' && dice === 1 && horse.homeIndex < 6) {
      const next = horse.homeIndex + 1;
      const cell = BD().homeCell(horse.colorId, next);
      if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
        moves.push({
          type: 'home',
          horseId: horse.id,
          horseSlot: horse.slotIndex,
          toGx: cell.gx,
          toGy: cell.gy,
          homeIndex: next,
          steps: 1,
          cells: [{ gx: cell.gx, gy: cell.gy }],
          kickId: null
        });
      }
    }
    return moves;
  }

  function legalMoves(state, dice) {
    const pl = state.players[state.current];
    const list = [];
    horsesOf(state, pl.colorId).forEach((h) => {
      movesForHorse(state, h, dice).forEach((m) => list.push(m));
    });
    return list;
  }

  function applyMove(state, move) {
    const horse = state.horses.find((h) => h.id === move.horseId);
    if (!horse) return state;

    if (move.kickId != null) {
      const victim = state.horses.find((h) => h.id === move.kickId);
      if (victim) {
        const slot = BD().penSlots(victim.colorId)[victim.slotIndex];
        victim.zone = 'pen';
        victim.pathIndex = -1;
        victim.homeIndex = 0;
        victim.gx = slot.gx;
        victim.gy = slot.gy;
      }
    }

    if (move.type === 'kick_rear') {
      // đứng yên, chỉ đá
      if (state.dice === 6) state.extraTurn = true;
      return state;
    }

    if (move.type === 'exit') {
      horse.zone = 'track';
      horse.pathIndex = 0;
      horse.homeIndex = 0;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
      state.extraTurn = true;
    } else if (move.type === 'move' || move.type === 'kick') {
      horse.zone = 'track';
      horse.pathIndex = move.pathIndex;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
    } else if (move.type === 'home') {
      horse.zone = 'home';
      horse.pathIndex = -1;
      horse.homeIndex = move.homeIndex;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
    }

    if (state.dice === 6) state.extraTurn = true;
    checkWin(state, horse.colorId);
    return state;
  }

  function checkWin(state, colorId) {
    const hs = horsesOf(state, colorId);
    const idx = new Set(
      hs.filter((h) => h.zone === 'home' && h.homeIndex >= 3 && h.homeIndex <= 6).map((h) => h.homeIndex)
    );
    if (idx.has(6) && idx.has(5) && idx.has(4) && idx.has(3)) {
      state.winner = colorId;
      state.phase = 'win';
    }
  }

  function nextPlayer(state) {
    if (state.winner != null) return state;
    if (state.extraTurn) {
      state.extraTurn = false;
      state.phase = 'turn';
      state.dice = 0;
      return state;
    }
    state.current = (state.current + 1) % state.players.length;
    state.phase = 'turn';
    state.dice = 0;
    return state;
  }

  global.Rules = {
    createGameState,
    horsesOf,
    legalMoves,
    movesForHorse,
    applyMove,
    nextPlayer
  };
})(typeof window !== 'undefined' ? window : globalThis);
