/**
 * rules.js
 * - START không đếm / không chặn
 * - Lên chuồng: CHỈ khi đứng đúng ENTRY (mũi tên), xúc N → home 1..N từng bước
 * - Trong home: xúc 1 → +1 bậc (ô trống)
 * - Đá hậu: địch gần nhất trong ≤6 bước phía sau; mình nhảy lùi từng bước
 * - Bay (xúc 1): nhảy thẳng tới ENTRY nếu đường trống; địch trên ENTRY → đá bay
 */
(function (global) {
  'use strict';
  const BD = () => global.BoardData;

  function createHorseState(colorId, slotIndex) {
    const slot = BD().penSlots(colorId)[slotIndex];
    return {
      id: colorId * 4 + slotIndex, colorId, slotIndex,
      zone: 'pen', pathIndex: -1, homeIndex: 0,
      gx: slot.gx, gy: slot.gy
    };
  }

  function createGameState(numPlayers) {
    const n = Math.max(2, Math.min(4, numPlayers || 4));
    const order = [2, 3, 1, 0].slice(0, n);
    const horses = [];
    order.forEach((cid) => { for (let s = 0; s < 4; s++) horses.push(createHorseState(cid, s)); });
    return {
      players: order.map((cid, i) => ({ colorId: cid, name: BD().COLORS[cid].name, index: i })),
      horses, current: 0, dice: 0, phase: 'turn', winner: null, extraTurn: false
    };
  }

  function horsesOf(state, colorId) {
    return state.horses.filter((h) => h.colorId === colorId);
  }

  function occupantAt(state, gx, gy, exceptId) {
    const eps = 0.25;
    return state.horses.find((h) =>
      h.id !== exceptId && h.zone !== 'pen' && h.zone !== 'done' &&
      Math.abs(h.gx - gx) < eps && Math.abs(h.gy - gy) < eps
    );
  }

  function isStartCell(gx, gy) {
    const eps = 0.3, S = BD().START;
    for (const k of Object.keys(S)) {
      const s = S[k];
      if (Math.abs(s.gx - gx) < eps && Math.abs(s.gy - gy) < eps) return true;
    }
    return false;
  }

  /** Ô hữu ích phía trước: bỏ START */
  function usefulForward(colorId, fromIdx, maxSteps) {
    const len = BD().pathLen(colorId);
    const cells = [];
    let idx = fromIdx;
    while (cells.length < maxSteps) {
      idx++;
      if (idx >= len) break;
      const c = BD().cellAt(colorId, idx);
      if (!c) break;
      if (isStartCell(c.gx, c.gy) && idx !== 0) continue;
      cells.push({ gx: c.gx, gy: c.gy, pathIndex: idx });
    }
    return cells;
  }

  function usefulBackward(colorId, fromIdx, maxSteps) {
    const cells = [];
    let idx = fromIdx;
    while (cells.length < maxSteps && idx > 0) {
      idx--;
      const c = BD().cellAt(colorId, idx);
      if (!c) break;
      if (isStartCell(c.gx, c.gy) && idx !== 0) continue;
      cells.push({ gx: c.gx, gy: c.gy, pathIndex: idx });
    }
    return cells;
  }

  function blockedMid(state, horse, cellsExceptLast) {
    for (let i = 0; i < cellsExceptLast.length; i++) {
      const c = cellsExceptLast[i];
      if (isStartCell(c.gx, c.gy)) continue;
      if (occupantAt(state, c.gx, c.gy, horse.id)) return true;
    }
    return false;
  }

  function movesForHorse(state, horse, dice) {
    const moves = [];
    if (!horse || dice < 1 || dice > 6) return moves;
    const len = BD().pathLen(horse.colorId);

    // —— Xuất quân ——
    if (horse.zone === 'pen') {
      if (dice === 6) {
        const st = BD().START[horse.colorId];
        const occ = occupantAt(state, st.gx, st.gy, horse.id);
        if (!(occ && occ.colorId === horse.colorId)) {
          moves.push({
            type: 'exit', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: st.gx, toGy: st.gy, pathIndex: 0, steps: 1,
            cells: [{ gx: st.gx, gy: st.gy }],
            kickId: occ && occ.colorId !== horse.colorId ? occ.id : null
          });
        }
      }
      return moves;
    }

    // —— Trong home: xúc 1 → +1 ——
    if (horse.zone === 'home') {
      if (dice === 1 && horse.homeIndex < 6) {
        const next = horse.homeIndex + 1;
        const cell = BD().homeCell(horse.colorId, next);
        if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
          moves.push({
            type: 'home', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: cell.gx, toGy: cell.gy, homeIndex: next,
            steps: 1, cells: [{ gx: cell.gx, gy: cell.gy }], kickId: null
          });
        }
      }
      return moves;
    }

    if (horse.zone !== 'track') return moves;

    // —— Đá hậu: địch gần nhất ≤6 bước sau ——
    if (dice >= 1) {
      const back = usefulBackward(horse.colorId, horse.pathIndex, 6);
      for (let i = 0; i < back.length; i++) {
        const c = back[i];
        const occ = occupantAt(state, c.gx, c.gy, horse.id);
        if (occ && occ.colorId !== horse.colorId) {
          // cells lùi từng bước tới ô địch
          const cells = back.slice(0, i + 1).map((x) => ({ gx: x.gx, gy: x.gy }));
          moves.push({
            type: 'kick_rear', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: c.gx, toGy: c.gy, pathIndex: c.pathIndex,
            steps: cells.length, cells: cells, kickId: occ.id, backward: true
          });
          break; // gần nhất
        }
        // nếu có quân mình chặn phía sau thì dừng tìm
        if (occ && occ.colorId === horse.colorId) break;
      }
    }

    // —— Bay / Đá bay (xúc 1): nhảy thẳng ENTRY ——
    if (dice === 1 && horse.pathIndex < len - 1) {
      const entryIdx = len - 1;
      const entry = BD().cellAt(horse.colorId, entryIdx);
      // kiểm tra vật cản trên các ô hữu ích giữa hiện tại và ENTRY (không gồm ENTRY)
      const forward = usefulForward(horse.colorId, horse.pathIndex, 99);
      const toEntry = [];
      let clear = true;
      for (let i = 0; i < forward.length; i++) {
        const c = forward[i];
        if (c.pathIndex >= entryIdx) break;
        if (occupantAt(state, c.gx, c.gy, horse.id)) { clear = false; break; }
        toEntry.push({ gx: c.gx, gy: c.gy });
      }
      if (clear && entry) {
        const occ = occupantAt(state, entry.gx, entry.gy, horse.id);
        if (!occ) {
          moves.push({
            type: 'fly', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: entry.gx, toGy: entry.gy, pathIndex: entryIdx,
            steps: 1, cells: [{ gx: entry.gx, gy: entry.gy }], // bay thẳng 1 nhảy
            kickId: null, fly: true
          });
        } else if (occ.colorId !== horse.colorId) {
          moves.push({
            type: 'fly_kick', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: entry.gx, toGy: entry.gy, pathIndex: entryIdx,
            steps: 1, cells: [{ gx: entry.gx, gy: entry.gy }],
            kickId: occ.id, fly: true
          });
        }
      }
    }

    // —— Di chuyển thường ——
    {
      const cells = usefulForward(horse.colorId, horse.pathIndex, dice);
      if (cells.length === dice) {
        const mid = cells.slice(0, -1);
        if (!blockedMid(state, horse, mid)) {
          const last = cells[cells.length - 1];
          const occ = occupantAt(state, last.gx, last.gy, horse.id);
          if (!(occ && occ.colorId === horse.colorId)) {
            moves.push({
              type: occ ? 'kick' : 'move', horseId: horse.id, horseSlot: horse.slotIndex,
              toGx: last.gx, toGy: last.gy, pathIndex: last.pathIndex,
              steps: cells.length,
              cells: cells.map((c) => ({ gx: c.gx, gy: c.gy })),
              kickId: occ ? occ.id : null
            });
          }
        }
      }
    }

    // —— Lên chuồng: CHỈ khi đang đứng ENTRY ——
    if (horse.pathIndex === len - 1 && dice >= 1 && dice <= 6) {
      const homeCells = [];
      let ok = true;
      for (let h = 1; h <= dice; h++) {
        const cell = BD().homeCell(horse.colorId, h);
        if (!cell || occupantAt(state, cell.gx, cell.gy, horse.id)) { ok = false; break; }
        homeCells.push({ gx: cell.gx, gy: cell.gy });
      }
      if (ok) {
        moves.push({
          type: 'home', horseId: horse.id, horseSlot: horse.slotIndex,
          toGx: homeCells[homeCells.length - 1].gx,
          toGy: homeCells[homeCells.length - 1].gy,
          homeIndex: dice, steps: homeCells.length,
          cells: homeCells, kickId: null
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
        victim.zone = 'pen'; victim.pathIndex = -1; victim.homeIndex = 0;
        victim.gx = slot.gx; victim.gy = slot.gy;
      }
    }

    if (move.type === 'kick_rear') {
      horse.zone = 'track';
      horse.pathIndex = move.pathIndex;
      horse.gx = move.toGx; horse.gy = move.toGy;
    } else if (move.type === 'exit') {
      horse.zone = 'track'; horse.pathIndex = 0; horse.homeIndex = 0;
      horse.gx = move.toGx; horse.gy = move.toGy; state.extraTurn = true;
    } else if (move.type === 'move' || move.type === 'kick' || move.type === 'fly' || move.type === 'fly_kick') {
      horse.zone = 'track'; horse.pathIndex = move.pathIndex;
      horse.gx = move.toGx; horse.gy = move.toGy;
    } else if (move.type === 'home') {
      horse.zone = 'home'; horse.pathIndex = -1;
      horse.homeIndex = move.homeIndex;
      horse.gx = move.toGx; horse.gy = move.toGy;
    }

    if (state.dice === 6) state.extraTurn = true;
    checkWin(state, horse.colorId);
    return state;
  }

  function checkWin(state, colorId) {
    const hs = horsesOf(state, colorId);
    const idx = new Set(hs.filter((h) => h.zone === 'home' && h.homeIndex >= 3 && h.homeIndex <= 6).map((h) => h.homeIndex));
    if (idx.has(6) && idx.has(5) && idx.has(4) && idx.has(3)) {
      state.winner = colorId; state.phase = 'win';
    }
  }

  function nextPlayer(state) {
    if (state.winner != null) return state;
    if (state.extraTurn) { state.extraTurn = false; state.phase = 'turn'; state.dice = 0; return state; }
    state.current = (state.current + 1) % state.players.length;
    state.phase = 'turn'; state.dice = 0;
    return state;
  }

  global.Rules = { createGameState, horsesOf, legalMoves, movesForHorse, applyMove, nextPlayer };
})(typeof window !== 'undefined' ? window : globalThis);
