/**
 * rules.js — Cá Ngựa
 * START không đếm bước / không chặn.
 * Lên chuồng: từ path, xúc N → vào home 1..N từng bước.
 * Trong home: chỉ tiến +1 khi xúc 1 (ô đích trống).
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

  function advanceSteps(colorId, fromIdx, steps) {
    const len = BD().pathLen(colorId);
    let idx = fromIdx;
    const cells = [];
    let counted = 0;
    while (counted < steps) {
      idx++;
      if (idx >= len) return null;
      const c = BD().cellAt(colorId, idx);
      if (!c) return null;
      if (isStartCell(c.gx, c.gy) && idx !== 0) continue;
      cells.push({ gx: c.gx, gy: c.gy });
      counted++;
    }
    return { pathIndex: idx, cells };
  }

  function blockedOnUsefulCells(state, horse, cellsExceptLast) {
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

    if (horse.zone === 'track' && dice === 1 && horse.pathIndex > 0) {
      const behind = BD().cellAt(horse.colorId, horse.pathIndex - 1);
      if (behind) {
        const occ = occupantAt(state, behind.gx, behind.gy, horse.id);
        if (occ && occ.colorId !== horse.colorId) {
          moves.push({
            type: 'kick_rear', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: horse.gx, toGy: horse.gy, pathIndex: horse.pathIndex,
            steps: 0, cells: [], kickId: occ.id
          });
        }
      }
    }

    if (horse.zone === 'track') {
      const len = BD().pathLen(horse.colorId);
      const adv = advanceSteps(horse.colorId, horse.pathIndex, dice);
      if (adv) {
        const mid = adv.cells.slice(0, -1);
        if (!blockedOnUsefulCells(state, horse, mid)) {
          const cell = adv.cells[adv.cells.length - 1];
          const occ = occupantAt(state, cell.gx, cell.gy, horse.id);
          if (!(occ && occ.colorId === horse.colorId)) {
            moves.push({
              type: occ ? 'kick' : 'move', horseId: horse.id, horseSlot: horse.slotIndex,
              toGx: cell.gx, toGy: cell.gy, pathIndex: adv.pathIndex,
              steps: adv.cells.length, cells: adv.cells, kickId: occ ? occ.id : null
            });
          }
        }
      } else {
        // Vào home: xúc N → home N, từng bước 1..N
        let usefulToEntry = 0;
        for (let i = horse.pathIndex + 1; i < len; i++) {
          const c = BD().cellAt(horse.colorId, i);
          if (!c) continue;
          if (isStartCell(c.gx, c.gy) && i !== 0) continue;
          usefulToEntry++;
        }
        const intoHome = dice - usefulToEntry;
        if (intoHome >= 1 && intoHome <= 6) {
          const pathCells = [];
          for (let i = horse.pathIndex + 1; i < len; i++) {
            const c = BD().cellAt(horse.colorId, i);
            if (!c) continue;
            if (isStartCell(c.gx, c.gy) && i !== 0) continue;
            pathCells.push({ gx: c.gx, gy: c.gy });
          }
          if (!blockedOnUsefulCells(state, horse, pathCells.slice(0, -1))) {
            const homeCells = [];
            let blocked = false;
            for (let h = 1; h <= intoHome; h++) {
              const cell = BD().homeCell(horse.colorId, h);
              if (!cell) { blocked = true; break; }
              if (occupantAt(state, cell.gx, cell.gy, horse.id)) { blocked = true; break; }
              homeCells.push({ gx: cell.gx, gy: cell.gy });
            }
            if (!blocked) {
              moves.push({
                type: 'home', horseId: horse.id, horseSlot: horse.slotIndex,
                toGx: homeCells[homeCells.length - 1].gx,
                toGy: homeCells[homeCells.length - 1].gy,
                homeIndex: intoHome, steps: pathCells.length + homeCells.length,
                cells: pathCells.concat(homeCells), kickId: null
              });
            }
          }
        }
      }
      return moves;
    }

    // Trong home: tiến từng bậc — xúc 1 → +1 ô (đích trống)
    if (horse.zone === 'home' && horse.homeIndex < 6) {
      const need = 1; // chỉ +1 mỗi lần
      if (dice === need) {
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
      if (state.dice === 6) state.extraTurn = true;
      return state;
    }
    if (move.type === 'exit') {
      horse.zone = 'track'; horse.pathIndex = 0; horse.homeIndex = 0;
      horse.gx = move.toGx; horse.gy = move.toGy; state.extraTurn = true;
    } else if (move.type === 'move' || move.type === 'kick') {
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
