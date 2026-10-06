/**
 * rules.js — Luật Cá Ngựa (1 xúc xắc, xuất bằng 6)
 * Trạng thái quân: pen | track | home | done
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
      zone: 'pen',       // pen | track | home | done
      pathIndex: -1,     // 0..47 on track
      homeIndex: 0,      // 1..6 when in home; 0 = chưa
      gx: slot.gx,
      gy: slot.gy
    };
  }

  function createGameState(numPlayers) {
    const n = Math.max(2, Math.min(4, numPlayers || 4));
    // Dùng 4 màu theo thứ tự: Đỏ(2), Xanh(3), Ngà(1), Đen(0) — hoặc 0..n-1
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
      phase: 'turn', // turn | rolled | choose | anim | win
      winner: null,
      extraTurn: false
    };
  }

  function horsesOf(state, colorId) {
    return state.horses.filter((h) => h.colorId === colorId);
  }

  function occupantAt(state, gx, gy, exceptId) {
    const eps = 0.15;
    return state.horses.find(
      (h) =>
        h.id !== exceptId &&
        h.zone !== 'pen' &&
        h.zone !== 'done' &&
        Math.abs(h.gx - gx) < eps &&
        Math.abs(h.gy - gy) < eps
    );
  }

  /**
   * Nước đi hợp lệ cho 1 quân với xúc xắc d.
   * Trả về { type, horseId, toGx, toGy, pathIndex?, homeIndex?, kickId? } hoặc null
   */
  function movesForHorse(state, horse, dice) {
    const moves = [];
    if (!horse || dice < 1 || dice > 6) return moves;

    // —— Xuất quân ——
    if (horse.zone === 'pen' && dice === 6) {
      const st = BD().START[horse.colorId];
      const occ = occupantAt(state, st.gx, st.gy, horse.id);
      if (occ && occ.colorId === horse.colorId) {
        // ô start bị quân mình chiếm → không xuất
      } else {
        moves.push({
          type: 'exit',
          horseId: horse.id,
          toGx: st.gx,
          toGy: st.gy,
          pathIndex: 0,
          kickId: occ && occ.colorId !== horse.colorId ? occ.id : null
        });
      }
      return moves;
    }

    if (horse.zone === 'pen') return moves;

    // —— Trên đường ——
    if (horse.zone === 'track') {
      const len = BD().pathLen(horse.colorId);
      const dest = horse.pathIndex + dice;

      if (dest < len) {
        // còn trên path
        const cell = BD().cellAt(horse.colorId, dest);
        const occ = occupantAt(state, cell.gx, cell.gy, horse.id);
        if (occ && occ.colorId === horse.colorId) return moves; // không đè quân mình
        // kiểm tra cản: có quân (bất kỳ) chắn giữa?
        let blocked = false;
        for (let i = horse.pathIndex + 1; i < dest; i++) {
          const c = BD().cellAt(horse.colorId, i);
          const o = occupantAt(state, c.gx, c.gy, horse.id);
          if (o) {
            blocked = true;
            break;
          }
        }
        if (blocked) return moves;
        moves.push({
          type: occ ? 'kick' : 'move',
          horseId: horse.id,
          toGx: cell.gx,
          toGy: cell.gy,
          pathIndex: dest,
          kickId: occ ? occ.id : null
        });
      } else {
        // vào home: overflow
        // đứng ở ENTRY (len-1) hoặc vượt: số bước vào home = dest - (len - 1)
        // từ pathIndex, cần (len - 1 - pathIndex) bước tới ENTRY, còn lại vào home
        const toEntry = len - 1 - horse.pathIndex;
        const intoHome = dice - toEntry;
        if (intoHome >= 1 && intoHome <= 6) {
          // lần đầu: được vào đúng ô intoHome
          const ok = canEnterHome(state, horse, intoHome);
          if (ok) {
            const cell = BD().homeCell(horse.colorId, intoHome);
            moves.push({
              type: 'home',
              horseId: horse.id,
              toGx: cell.gx,
              toGy: cell.gy,
              homeIndex: intoHome,
              kickId: null
            });
          }
        }
      }
      return moves;
    }

    // —— Trong home ——
    if (horse.zone === 'home') {
      // chỉ được đi từng ô, không nhảy cách, không đè mình
      const next = horse.homeIndex + 1;
      if (dice === 1 && next <= 6) {
        // chỉ cho phép +1 mỗi lần xúc 1? User: "bắt buộc phải đi từng ô không được phép nhảy cách"
        // → mỗi lượt chỉ tiến 1 ô nếu xúc khớp khoảng trống tuần tự
        // Thực tế phổ biến: xúc N thì chỉ đi được nếu N == 1 khi đã vào (đi từng ô)
        // Hoặc: xúc đúng số ô còn trống phía trước 1 bước duy nhất
        // Áp dụng: chỉ tiến đúng 1 ô khi dice >= 1 và ô kế tiếp trống; yêu cầu dice === 1 để khớp "từng ô"
        const cell = BD().homeCell(horse.colorId, next);
        const occ = occupantAt(state, cell.gx, cell.gy, horse.id);
        if (!occ && dice === 1) {
          moves.push({
            type: next >= 3 && next <= 6 ? 'home' : 'home',
            horseId: horse.id,
            toGx: cell.gx,
            toGy: cell.gy,
            homeIndex: next,
            kickId: null
          });
        }
      }
      // Cho phép xúc số đúng bằng khoảng cách tới ô đích tiếp theo trong dãy 3-6 nếu muốn linh hoạt hơn:
      // Alternative: if dice === 1 only for sequential — keep as is
      return moves;
    }

    return moves;
  }

  function canEnterHome(state, horse, homeIndex) {
    const cell = BD().homeCell(horse.colorId, homeIndex);
    if (!cell) return false;
    const occ = occupantAt(state, cell.gx, cell.gy, horse.id);
    if (occ) return false;
    return true;
  }

  /** Mọi nước hợp lệ của người đang chơi */
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

    // đá
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

    if (move.type === 'exit') {
      horse.zone = 'track';
      horse.pathIndex = 0;
      horse.homeIndex = 0;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
      state.extraTurn = true; // thưởng khi xuất (tuỳ chọn — bật)
    } else if (move.type === 'move' || move.type === 'kick') {
      horse.zone = 'track';
      horse.pathIndex = move.pathIndex;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
    } else if (move.type === 'home') {
      horse.zone = move.homeIndex >= 3 ? (move.homeIndex <= 6 ? 'home' : 'home') : 'home';
      horse.pathIndex = -1;
      horse.homeIndex = move.homeIndex;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
      if (move.homeIndex >= 3 && move.homeIndex <= 6) {
        // check done pieces on 6,5,4,3
      }
    }

    // Đánh dấu done nếu đứng đúng 6/5/4/3 và đủ 4 quân trên các ô đó
    updateDoneFlags(state, horse.colorId);

    // Thưởng lượt khi ra 6
    if (state.dice === 6) state.extraTurn = true;

    return state;
  }

  function updateDoneFlags(state, colorId) {
    const hs = horsesOf(state, colorId);
    const onTarget = hs.filter((h) => h.zone === 'home' && h.homeIndex >= 3 && h.homeIndex <= 6);
    // thắng khi có quân ở đủ 6,5,4,3
    const indexes = new Set(onTarget.map((h) => h.homeIndex));
    if (indexes.has(6) && indexes.has(5) && indexes.has(4) && indexes.has(3)) {
      hs.forEach((h) => {
        if (h.homeIndex >= 3 && h.homeIndex <= 6) h.zone = 'done';
      });
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
    createHorseState,
    horsesOf,
    legalMoves,
    movesForHorse,
    applyMove,
    nextPlayer,
    occupantAt
  };
})(typeof window !== 'undefined' ? window : globalThis);
