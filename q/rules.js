/**
 * rules.js
 * - START không đếm trên đường đi thường; đá hậu ĐƯỢC đi lùi qua START
 * - Đá hậu: chỉ khi xúc = đúng khoảng cách hữu ích phía sau + không vật cản
 * - Lên chuồng: chỉ từ ENTRY; lần đầu xúc N → home N; sau đó xúc đúng số bậc đích
 * - ENTRY là điểm cuối path, không đi quá
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

  /** Tiến hữu ích: bỏ START (không đếm), không vượt ENTRY */
  function usefulForward(colorId, fromIdx, maxSteps) {
    const len = BD().pathLen(colorId);
    const cells = [];
    let idx = fromIdx;
    while (cells.length < maxSteps) {
      idx++;
      if (idx >= len) break; // không đi quá ENTRY
      const c = BD().cellAt(colorId, idx);
      if (!c) break;
      if (isStartCell(c.gx, c.gy) && idx !== 0) continue;
      cells.push({ gx: c.gx, gy: c.gy, pathIndex: idx });
    }
    return cells;
  }

  /**
   * Lùi hữu ích cho đá hậu: KHÔNG đếm ô START (giống di chuyển).
   * Được đi lùi qua vùng START nhưng START không tính bước.
   * Không đá được quân đang đứng trên START.
   */
  function usefulBackward(colorId, fromIdx, maxSteps) {
    const cells = [];
    let idx = fromIdx;
    while (cells.length < maxSteps && idx > 0) {
      idx--;
      const c = BD().cellAt(colorId, idx);
      if (!c) break;
      // START không đếm bước (trừ index 0 là START của chính mình khi xuất — vẫn skip khi lùi)
      if (isStartCell(c.gx, c.gy)) continue;
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

  /** Chặn giữa đá hậu: ô START đã bị bỏ khi đếm; quân trên ô thường thì chặn */
  function blockedMidRear(state, horse, cellsExceptLast) {
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

    // —— Trong home ——
    // Lần đầu đã vào (homeIndex >= 1): chỉ lên bậc đích khi xúc ĐÚNG số bậc đó
    // Ví dụ đang ở 3 → xúc 4 mới lên 4; xúc 5 mới lên 5; xúc 6 mới lên 6
    if (horse.zone === 'home') {
      if (horse.homeIndex >= 1 && horse.homeIndex < 6) {
        const target = dice; // xúc N → chỉ lên đúng bậc N
        if (target > horse.homeIndex && target <= 6) {
          // chỉ cho phép nếu đích = dice và các bậc trung gian trống? 
          // Theo user: xúc 4 → lên bậc 4 (từ 3). Không nhảy 3→5 bằng xúc 5 nếu... user said xúc 5 → bậc 5.
          // Vậy từ 3, xúc 5 → lên 5 (có thể nhảy qua 4?) User said "bắt buộc phải lên từng bậc 4,5,6" 
          // AND "điều kiện lên bậc 4 là mặt 4". So from 3 only dice 4 works to go to 4.
          // From 4 only dice 5. From 5 only dice 6.
          // Cannot skip: only target === homeIndex + 1 && dice === target
          if (target === horse.homeIndex + 1) {
            const cell = BD().homeCell(horse.colorId, target);
            if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
              moves.push({
                type: 'home', horseId: horse.id, horseSlot: horse.slotIndex,
                toGx: cell.gx, toGy: cell.gy, homeIndex: target,
                steps: 1, cells: [{ gx: cell.gx, gy: cell.gy }], kickId: null
              });
            }
          }
        }
      }
      return moves;
    }

    if (horse.zone !== 'track') return moves;

    // —— Đá hậu: xúc = đúng khoảng cách lùi + không vật cản ——
    {
      const back = usefulBackward(horse.colorId, horse.pathIndex, dice);
      if (back.length === dice) {
        const mid = back.slice(0, -1);
        if (!blockedMidRear(state, horse, mid)) {
          const last = back[back.length - 1];
          const occ = occupantAt(state, last.gx, last.gy, horse.id);
          // Không đá quân đang đứng trên ô xuất quân
          if (occ && occ.colorId !== horse.colorId && !isStartCell(last.gx, last.gy)) {
            moves.push({
              type: 'kick_rear', horseId: horse.id, horseSlot: horse.slotIndex,
              toGx: last.gx, toGy: last.gy, pathIndex: last.pathIndex,
              steps: back.length,
              cells: back.map((c) => ({ gx: c.gx, gy: c.gy })),
              kickId: occ.id, backward: true
            });
          }
        }
      }
    }

    // —— Bay / Đá bay (xúc 1): ENTRY gần nhất CCW ——
    if (dice === 1 && horse.pathIndex < len - 1) {
      const entries = BD().ENTRY;
      function isAnyEntry(gx, gy) {
        const eps = 0.35;
        for (const k of Object.keys(entries)) {
          const e = entries[k];
          if (Math.abs(e.gx - gx) < eps && Math.abs(e.gy - gy) < eps) return true;
        }
        return false;
      }
      const forward = usefulForward(horse.colorId, horse.pathIndex, 99);
      let clear = true;
      let target = null;
      for (let i = 0; i < forward.length; i++) {
        const c = forward[i];
        if (!isAnyEntry(c.gx, c.gy)) {
          if (occupantAt(state, c.gx, c.gy, horse.id)) { clear = false; break; }
          continue;
        }
        target = c;
        break;
      }
      if (clear && target) {
        const occ = occupantAt(state, target.gx, target.gy, horse.id);
        if (!occ) {
          moves.push({
            type: 'fly', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: target.gx, toGy: target.gy, pathIndex: target.pathIndex,
            steps: 1, cells: [{ gx: target.gx, gy: target.gy }],
            kickId: null, fly: true
          });
        } else if (occ.colorId !== horse.colorId) {
          moves.push({
            type: 'fly_kick', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: target.gx, toGy: target.gy, pathIndex: target.pathIndex,
            steps: 1, cells: [{ gx: target.gx, gy: target.gy }],
            kickId: occ.id, fly: true
          });
        }
      }
    }

    // —— Di chuyển / đá tiến: không vượt ENTRY ——
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

    // —— Lên chuồng lần đầu: CHỈ khi đứng đúng ENTRY (pathIndex === len-1) ——
    // Xúc N (1..6) → vào home N, nhảy từng bậc 1..N
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
