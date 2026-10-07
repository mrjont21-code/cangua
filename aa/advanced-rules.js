/**
 * advanced-rules.js — Luật nâng cao: skill system trên nền classic Rules
 * Không sửa rules.js gốc. Engine sẽ chọn ActiveRules theo ruleMode.
 */
(function (global) {
  'use strict';

  const BD = () => global.BoardData;
  const AS = () => global.AdvancedSkills;
  const Classic = () => global.Rules;

  function createHorseState(colorId, slotIndex) {
    const h = Classic().createGameState(2).horses[0]; // reuse shape
    const slot = BD().penSlots(colorId)[slotIndex];
    return {
      id: colorId * 4 + slotIndex,
      colorId,
      slotIndex,
      zone: 'pen',
      pathIndex: -1,
      homeIndex: 0,
      gx: slot.gx,
      gy: slot.gy,
      skillId: null,
      // skill runtime
      phoenixPending: false,   // Phoenix: xuất miễn phí lượt sau
      stunTurns: 0,            // Trickster stun
      vampireMiss: 0,          // Vampire: số lượt không đá
      leapUsed: false
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
      extraTurn: false,
      // advanced
      mines: [],                 // { gx, gy, ownerColorId, horseId }
      ruleMode: 'advanced',
      pendingSkillSelect: null   // { horseId } when exit needs skill
    };
  }

  function horsesOf(state, colorId) {
    return state.horses.filter((h) => h.colorId === colorId);
  }

  function occupantAt(state, gx, gy, exceptId) {
    const eps = 0.25;
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
    const eps = 0.3;
    const S = BD().START;
    for (const k of Object.keys(S)) {
      const s = S[k];
      if (Math.abs(s.gx - gx) < eps && Math.abs(s.gy - gy) < eps) return true;
    }
    return false;
  }

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
      if (isStartCell(c.gx, c.gy)) continue;
      cells.push({ gx: c.gx, gy: c.gy, pathIndex: idx });
    }
    return cells;
  }

  function blockedMid(state, horse, cellsExceptLast, allowLeap) {
    let blockedCount = 0;
    for (let i = 0; i < cellsExceptLast.length; i++) {
      const c = cellsExceptLast[i];
      if (isStartCell(c.gx, c.gy)) continue;
      if (occupantAt(state, c.gx, c.gy, horse.id)) {
        blockedCount++;
        if (!allowLeap || blockedCount > 1) return true;
      }
    }
    return false;
  }

  function mineAt(state, gx, gy) {
    const eps = 0.3;
    return (state.mines || []).find(
      (m) => Math.abs(m.gx - gx) < eps && Math.abs(m.gy - gy) < eps
    );
  }

  function removeMine(state, gx, gy) {
    const eps = 0.3;
    state.mines = (state.mines || []).filter(
      (m) => !(Math.abs(m.gx - gx) < eps && Math.abs(m.gy - gy) < eps)
    );
  }

  function sendToPen(state, horse) {
    const slot = BD().penSlots(horse.colorId)[horse.slotIndex];
    horse.zone = 'pen';
    horse.pathIndex = -1;
    horse.homeIndex = 0;
    horse.gx = slot.gx;
    horse.gy = slot.gy;
    if (AS().isPhoenix(horse)) {
      horse.phoenixPending = true;
    }
  }

  function applyMineEffect(state, horse) {
    // lùi 4 ô hữu ích
    if (horse.zone !== 'track') return;
    const back = usefulBackward(horse.colorId, horse.pathIndex, 4);
    if (back.length > 0) {
      const last = back[back.length - 1];
      horse.pathIndex = last.pathIndex;
      horse.gx = last.gx;
      horse.gy = last.gy;
    } else {
      // quá gần START → về pen
      sendToPen(state, horse);
    }
  }

  function movesForHorse(state, horse, dice) {
    const moves = [];
    if (!horse || dice < 1) return moves;
    const Skills = AS();
    const len = BD().pathLen(horse.colorId);

    // Stun (Trickster)
    if (horse.stunTurns > 0) return moves;

    // Phoenix free exit
    if (horse.zone === 'pen' && horse.phoenixPending) {
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
          kickId: occ && occ.colorId !== horse.colorId ? occ.id : null,
          phoenixFree: true
        });
      }
      return moves;
    }

    // Modify dice by skill
    let effectiveDice = Skills.modifyDiceForSkill(horse, dice);
    if (effectiveDice < 1 && horse.zone !== 'pen') return moves;

    // Gatekeeper slow outside home
    if (horse.skillId === 8 && horse.zone === 'track') {
      const ahead = usefulForward(horse.colorId, horse.pathIndex, 6);
      const enemyNear = ahead.some((c) => {
        const o = occupantAt(state, c.gx, c.gy, horse.id);
        return o && o.colorId !== horse.colorId;
      });
      if (enemyNear) {
        effectiveDice = Math.max(1, Math.floor(effectiveDice * 0.5));
      }
    }

    // —— Xuất quân ——
    if (horse.zone === 'pen') {
      if (dice === 6 || horse.phoenixPending) {
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

    // —— Trong home ——
    if (horse.zone === 'home') {
      if (horse.homeIndex >= 1 && horse.homeIndex < 6) {
        const target = dice;
        if (target === horse.homeIndex + 1 && target <= 6) {
          const cell = BD().homeCell(horse.colorId, target);
          if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
            moves.push({
              type: 'home',
              horseId: horse.id,
              horseSlot: horse.slotIndex,
              toGx: cell.gx,
              toGy: cell.gy,
              homeIndex: target,
              steps: 1,
              cells: [{ gx: cell.gx, gy: cell.gy }],
              kickId: null
            });
          }
        }
        // Gatekeeper: đá đối phương đang cố vào cùng bậc
        if (horse.skillId === 8) {
          // handled in legalMoves context if needed
        }
      }
      return moves;
    }

    if (horse.zone !== 'track') return moves;

    const allowLeap = Skills.canLeap(horse);

    // —— Đá hậu ——
    {
      const back = usefulBackward(horse.colorId, horse.pathIndex, effectiveDice);
      if (back.length === effectiveDice) {
        const mid = back.slice(0, -1);
        if (!blockedMid(state, horse, mid, allowLeap)) {
          const last = back[back.length - 1];
          const occ = occupantAt(state, last.gx, last.gy, horse.id);
          if (
            occ &&
            occ.colorId !== horse.colorId &&
            !isStartCell(last.gx, last.gy) &&
            Skills.canKick(horse) &&
            !Skills.isImmuneToKick(occ) &&
            !Skills.isGhost(occ)
          ) {
            moves.push({
              type: 'kick_rear',
              horseId: horse.id,
              horseSlot: horse.slotIndex,
              toGx: last.gx,
              toGy: last.gy,
              pathIndex: last.pathIndex,
              steps: back.length,
              cells: back.map((c) => ({ gx: c.gx, gy: c.gy })),
              kickId: occ.id,
              backward: true
            });
          }
        }
      }
    }

    // —— Bay / Đá bay (xúc 1 gốc, không modify) ——
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
          if (occupantAt(state, c.gx, c.gy, horse.id)) {
            clear = false;
            break;
          }
          continue;
        }
        target = c;
        break;
      }
      if (clear && target) {
        const occ = occupantAt(state, target.gx, target.gy, horse.id);
        if (!occ) {
          moves.push({
            type: 'fly',
            horseId: horse.id,
            horseSlot: horse.slotIndex,
            toGx: target.gx,
            toGy: target.gy,
            pathIndex: target.pathIndex,
            steps: 1,
            cells: [{ gx: target.gx, gy: target.gy }],
            kickId: null,
            fly: true
          });
        } else if (
          occ.colorId !== horse.colorId &&
          Skills.canKick(horse) &&
          !Skills.isImmuneToKick(occ) &&
          !Skills.isGhost(occ)
        ) {
          moves.push({
            type: 'fly_kick',
            horseId: horse.id,
            horseSlot: horse.slotIndex,
            toGx: target.gx,
            toGy: target.gy,
            pathIndex: target.pathIndex,
            steps: 1,
            cells: [{ gx: target.gx, gy: target.gy }],
            kickId: occ.id,
            fly: true
          });
        }
      }
    }

    // —— Trickster swap on dice 1 ——
    if (dice === 1 && Skills.isTrickster(horse)) {
      const candidates = state.horses.filter(
        (h) =>
          h.colorId !== horse.colorId &&
          h.zone === 'track' &&
          Math.abs(h.pathIndex - horse.pathIndex) <= 6
      );
      candidates.sort(
        (a, b) =>
          Math.abs(a.pathIndex - horse.pathIndex) -
          Math.abs(b.pathIndex - horse.pathIndex)
      );
      if (candidates.length) {
        const target = candidates[0];
        moves.push({
          type: 'swap',
          horseId: horse.id,
          horseSlot: horse.slotIndex,
          toGx: target.gx,
          toGy: target.gy,
          pathIndex: target.pathIndex,
          steps: 0,
          cells: [],
          kickId: null,
          swapWithId: target.id
        });
      }
    }

    // —— Warp Rider: bay tới góc nếu đúng số ——
    if (horse.skillId === 3 && effectiveDice >= 1) {
      // Góc cua ≈ các điểm chuyển hướng lớn (đơn giản hóa: ENTRY của các màu hoặc điểm path đặc biệt)
      // Ở đây dùng: nếu effectiveDice đưa đúng tới một ENTRY bất kỳ phía trước
      const forward = usefulForward(horse.colorId, horse.pathIndex, effectiveDice + 2);
      const entries = BD().ENTRY;
      function isAnyEntry(gx, gy) {
        const eps = 0.4;
        for (const k of Object.keys(entries)) {
          const e = entries[k];
          if (Math.abs(e.gx - gx) < eps && Math.abs(e.gy - gy) < eps) return true;
        }
        return false;
      }
      for (let i = 0; i < forward.length; i++) {
        const c = forward[i];
        if (isAnyEntry(c.gx, c.gy) && i + 1 === effectiveDice) {
          const occ = occupantAt(state, c.gx, c.gy, horse.id);
          if (!occ || (occ.colorId !== horse.colorId && Skills.canKick(horse) && !Skills.isImmuneToKick(occ))) {
            moves.push({
              type: occ ? 'kick' : 'move',
              horseId: horse.id,
              horseSlot: horse.slotIndex,
              toGx: c.gx,
              toGy: c.gy,
              pathIndex: c.pathIndex,
              steps: effectiveDice,
              cells: forward.slice(0, i + 1).map((x) => ({ gx: x.gx, gy: x.gy })),
              kickId: occ ? occ.id : null,
              warp: true
            });
          }
          break;
        }
      }
    }

    // —— Di chuyển / đá tiến ——
    {
      const cells = usefulForward(horse.colorId, horse.pathIndex, effectiveDice);
      if (cells.length === effectiveDice || (allowLeap && cells.length >= 1)) {
        // với leap có thể có số bước khác một chút, đơn giản hóa: yêu cầu đúng
        if (cells.length === effectiveDice) {
          const mid = cells.slice(0, -1);
          if (!blockedMid(state, horse, mid, allowLeap)) {
            const last = cells[cells.length - 1];
            const occ = occupantAt(state, last.gx, last.gy, horse.id);
            if (!(occ && occ.colorId === horse.colorId)) {
              const canDoKick =
                !occ ||
                (Skills.canKick(horse) &&
                  !Skills.isImmuneToKick(occ) &&
                  !Skills.isGhost(occ));
              if (canDoKick) {
                // Combo Rider: dẫm trúng → bản thân lùi 1
                let selfPenalty = false;
                if (occ && !Skills.canKick(horse)) {
                  selfPenalty = true;
                }
                moves.push({
                  type: occ && !selfPenalty ? 'kick' : 'move',
                  horseId: horse.id,
                  horseSlot: horse.slotIndex,
                  toGx: last.gx,
                  toGy: last.gy,
                  pathIndex: last.pathIndex,
                  steps: cells.length,
                  cells: cells.map((c) => ({ gx: c.gx, gy: c.gy })),
                  kickId: occ && !selfPenalty ? occ.id : null,
                  selfPenalty: selfPenalty
                });
              }
            }
          }
        }
      }
    }

    // —— Lên chuồng lần đầu ——
    if (horse.pathIndex === len - 1 && dice >= 1 && dice <= 6) {
      // Phoenix không được đứng ENTRY? (weakness: không đứng ô an toàn)
      if (horse.skillId === 6) {
        // vẫn cho vào home
      }
      const homeCells = [];
      let ok = true;
      for (let h = 1; h <= dice; h++) {
        const cell = BD().homeCell(horse.colorId, h);
        if (!cell || occupantAt(state, cell.gx, cell.gy, horse.id)) {
          ok = false;
          break;
        }
        homeCells.push({ gx: cell.gx, gy: cell.gy });
      }
      if (ok) {
        moves.push({
          type: 'home',
          horseId: horse.id,
          horseSlot: horse.slotIndex,
          toGx: homeCells[homeCells.length - 1].gx,
          toGy: homeCells[homeCells.length - 1].gy,
          homeIndex: dice,
          steps: homeCells.length,
          cells: homeCells,
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
    // Filter Ghost: đối thủ không thể chủ động đá Ghost (đã filter trong movesForHorse)
    return list;
  }

  function applyMove(state, move) {
    const Skills = AS();
    const horse = state.horses.find((h) => h.id === move.horseId);
    if (!horse) return state;

    // Clear phoenix pending on successful exit
    if (move.type === 'exit') {
      horse.phoenixPending = false;
    }

    // Stun countdown
    if (horse.stunTurns > 0) {
      horse.stunTurns -= 1;
    }

    // —— Kick handling ——
    if (move.kickId != null) {
      const victim = state.horses.find((h) => h.id === move.kickId);
      if (victim) {
        // Thiết Giáp phản
        if (Skills.isImmuneToKick(victim)) {
          // attacker dội ngược 1 ô
          const back = usefulBackward(horse.colorId, horse.pathIndex, 1);
          if (back.length) {
            const b = back[0];
            horse.pathIndex = b.pathIndex;
            horse.gx = b.gx;
            horse.gy = b.gy;
          }
          // victim đứng yên, attacker mất extraTurn
          state.extraTurn = false;
          // vẫn ghi nhận không kick
          move._reflected = true;
        } else if (Skills.isKamikaze(horse)) {
          // Ôm Bom: cả hai về pen
          sendToPen(state, victim);
          sendToPen(state, horse);
          move._kamikaze = true;
        } else {
          // Thiên Lý Mã: victim lùi thêm 2
          sendToPen(state, victim);
          if (horse.skillId === 1) {
            // extra penalty already in pen, just mark
            move._extraPenalty = 2;
          }
          // Vampire: hút bước
          if (Skills.isVampire(horse) && move.steps) {
            const bonus = usefulForward(horse.colorId, move.pathIndex, move.steps);
            if (bonus.length) {
              const last = bonus[bonus.length - 1];
              move._vampireBonus = {
                pathIndex: last.pathIndex,
                gx: last.gx,
                gy: last.gy
              };
            }
            horse.vampireMiss = 0;
          }
        }
      }
    } else if (Skills.isVampire(horse) && move.type !== 'exit' && move.type !== 'home') {
      horse.vampireMiss = (horse.vampireMiss || 0) + 1;
      if (horse.vampireMiss >= 3) {
        const back = usefulBackward(horse.colorId, horse.pathIndex, 2);
        if (back.length) {
          const last = back[back.length - 1];
          horse.pathIndex = last.pathIndex;
          horse.gx = last.gx;
          horse.gy = last.gy;
        }
        horse.vampireMiss = 0;
      }
    }

    // Self penalty (Combo Rider)
    if (move.selfPenalty) {
      const back = usefulBackward(horse.colorId, horse.pathIndex, 1);
      if (back.length) {
        const b = back[0];
        horse.pathIndex = b.pathIndex;
        horse.gx = b.gx;
        horse.gy = b.gy;
      }
      // không kick
    } else if (move._reflected) {
      // already handled position
    } else if (move._kamikaze) {
      // both already in pen
    } else if (move.type === 'swap') {
      const other = state.horses.find((h) => h.id === move.swapWithId);
      if (other) {
        const tmp = {
          pathIndex: horse.pathIndex,
          gx: horse.gx,
          gy: horse.gy
        };
        horse.pathIndex = other.pathIndex;
        horse.gx = other.gx;
        horse.gy = other.gy;
        other.pathIndex = tmp.pathIndex;
        other.gx = tmp.gx;
        other.gy = tmp.gy;
        horse.stunTurns = 1;
      }
    } else if (move.type === 'exit') {
      horse.zone = 'track';
      horse.pathIndex = 0;
      horse.homeIndex = 0;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
      if (Skills.allowsExtraTurnOn6(horse) || move.phoenixFree) {
        state.extraTurn = true;
      }
      // Skill select is handled by UI/Engine before apply
    } else if (
      move.type === 'move' ||
      move.type === 'kick' ||
      move.type === 'fly' ||
      move.type === 'fly_kick' ||
      move.type === 'kick_rear'
    ) {
      if (!move._kamikaze && !move._reflected) {
        horse.zone = 'track';
        horse.pathIndex = move.pathIndex;
        horse.gx = move.toGx;
        horse.gy = move.toGy;
        if (move._vampireBonus) {
          horse.pathIndex = move._vampireBonus.pathIndex;
          horse.gx = move._vampireBonus.gx;
          horse.gy = move._vampireBonus.gy;
        }
      }
    } else if (move.type === 'home') {
      horse.zone = 'home';
      horse.pathIndex = -1;
      horse.homeIndex = move.homeIndex;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
    }

    // Trapper: đặt mìn tại vị trí dừng
    if (
      Skills.isTrapper(horse) &&
      (move.type === 'move' || move.type === 'kick' || move.type === 'kick_rear') &&
      !move._kamikaze
    ) {
      // xóa mìn cũ của chính ngựa này nếu có
      state.mines = (state.mines || []).filter((m) => m.horseId !== horse.id);
      state.mines.push({
        gx: horse.gx,
        gy: horse.gy,
        ownerColorId: horse.colorId,
        horseId: horse.id
      });
    }

    // Check mine on landing
    if (horse.zone === 'track') {
      const m = mineAt(state, horse.gx, horse.gy);
      if (m && m.horseId !== horse.id) {
        applyMineEffect(state, horse);
        removeMine(state, m.gx, m.gy);
        move._mineHit = true;
      }
    }

    // Ghost accidental overlap already handled by not allowing intentional kick;
    // if somehow same cell (rare), send Ghost to pen
    if (horse.zone === 'track') {
      const other = occupantAt(state, horse.gx, horse.gy, horse.id);
      if (other && Skills.isGhost(other)) {
        sendToPen(state, other);
        move._ghostRevealed = other.id;
      }
      if (other && Skills.isGhost(horse)) {
        sendToPen(state, horse);
        move._ghostRevealed = horse.id;
      }
    }

    // Extra turn on 6 (classic + skill filter)
    if (state.dice === 6 && Skills.allowsExtraTurnOn6(horse) && !move.phoenixFree) {
      state.extraTurn = true;
    }

    // Combo Rider: extra roll on even (handled by Engine via flag)
    if (horse.skillId === 4 && (state.dice === 2 || state.dice === 4 || state.dice === 6)) {
      move._comboExtra = true;
    }

    checkWin(state, horse.colorId);
    return state;
  }

  function checkWin(state, colorId) {
    const hs = horsesOf(state, colorId);
    const idx = new Set(
      hs
        .filter((h) => h.zone === 'home' && h.homeIndex >= 3 && h.homeIndex <= 6)
        .map((h) => h.homeIndex)
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

  function assignSkill(state, horseId, skillId) {
    const horse = state.horses.find((h) => h.id === horseId);
    if (!horse) return false;
    if (!AS().canSelectSkill(state, horse.colorId, skillId)) return false;
    horse.skillId = skillId;
    return true;
  }

  global.AdvancedRules = {
    createGameState,
    createHorseState,
    horsesOf,
    legalMoves,
    movesForHorse,
    applyMove,
    nextPlayer,
    assignSkill,
    occupantAt,
    isStartCell
  };
})(typeof window !== 'undefined' ? window : globalThis);
