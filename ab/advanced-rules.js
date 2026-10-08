/**
 * advanced-rules.js — Luật nâng cao V2.5
 * Giữ nguyên rules.js classic. Engine chọn ActiveRules theo ruleMode.
 */
(function (global) {
  'use strict';

  const BD = () => global.BoardData;
  const AS = () => global.AdvancedSkills;

  function createHorseState(colorId, slotIndex) {
    const slot = BD().penSlots(colorId)[slotIndex];
    return {
      id: colorId * 4 + slotIndex,
      colorId, slotIndex,
      zone: 'pen', pathIndex: -1, homeIndex: 0,
      gx: slot.gx, gy: slot.gy,
      skillId: null,
      isRevealed: false,
      shieldHp: 0,
      revivesLeft: 0,
      cooldownTurns: 0,
      stealthTurns: 0,
      starvationCounter: 0,
      stunTurns: 0,
      phoenixPending: false
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
        colorId: cid, name: BD().COLORS[cid].name, index: i
      })),
      horses, current: 0, dice: 0, phase: 'turn',
      winner: null, extraTurn: false,
      mines: [],
      bounties: {},
      turnCount: 0,
      ruleMode: 'advanced',
      isBonusRoll: false,
      pendingFeatFX: null
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
        h.zone !== 'pen' && h.zone !== 'done' &&
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

  function isCornerOrEntry(gx, gy) {
    const eps = 0.4;
    const E = BD().ENTRY;
    for (const k of Object.keys(E)) {
      const e = E[k];
      if (Math.abs(e.gx - gx) < eps && Math.abs(e.gy - gy) < eps) return true;
    }
    // 4 góc bàn gần đúng
    const corners = [
      { gx: 1, gy: 1 }, { gx: 1, gy: 39 }, { gx: 39, gy: 1 }, { gx: 39, gy: 39 },
      { gx: 16, gy: 1 }, { gx: 24, gy: 1 }, { gx: 1, gy: 16 }, { gx: 1, gy: 24 },
      { gx: 39, gy: 16 }, { gx: 39, gy: 24 }, { gx: 16, gy: 39 }, { gx: 24, gy: 39 }
    ];
    for (const c of corners) {
      if (Math.abs(c.gx - gx) < eps && Math.abs(c.gy - gy) < eps) return true;
    }
    return false;
  }

  /** Quy đổi gx,gy → pathIndex theo màu (fix lệch tọa độ swap) */
  function getPathIndexFromGrid(colorId, gx, gy) {
    const len = BD().pathLen(colorId);
    const eps = 0.4;
    for (let i = 0; i < len; i++) {
      const c = BD().cellAt(colorId, i);
      if (c && Math.abs(c.gx - gx) < eps && Math.abs(c.gy - gy) < eps) return i;
    }
    return -1;
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

  function sendToPen(state, horse, opts) {
    opts = opts || {};
    const slot = BD().penSlots(horse.colorId)[horse.slotIndex];
    horse.zone = 'pen';
    horse.pathIndex = -1;
    horse.homeIndex = 0;
    horse.gx = slot.gx;
    horse.gy = slot.gy;
    // Phoenix
    if (AS().isPhoenix(horse) && (horse.revivesLeft || 0) > 0) {
      horse.phoenixPending = true;
      horse.revivesLeft -= 1;
    }
    // Combo stun when kicked
    if (horse.skillId === 4 && opts.kicked) {
      horse.stunTurns = 1;
    }
  }

  function applyMineEffect(state, horse, steps) {
    steps = steps || 4;
    if (horse.zone !== 'track') return;
    // Thiên Lý dẫm mìn → 5 bước
    if (horse.skillId === 1) steps = 5;
    const back = usefulBackward(horse.colorId, horse.pathIndex, steps);
    if (back.length > 0) {
      const last = back[back.length - 1];
      horse.pathIndex = last.pathIndex;
      horse.gx = last.gx;
      horse.gy = last.gy;
    } else {
      sendToPen(state, horse, { kicked: true });
    }
  }

  function movesForHorse(state, horse, dice) {
    const moves = [];
    if (!horse || dice < 1) return moves;
    const Skills = AS();
    const len = BD().pathLen(horse.colorId);
    const isBonus = !!state.isBonusRoll;

    if (horse.stunTurns > 0) return moves;
    if (horse.cooldownTurns > 0 && Skills.isTrickster(horse) && dice === 1) {
      // still can move normally, just no swap
    }

    // Phoenix free exit
    if (horse.zone === 'pen' && horse.phoenixPending) {
      const st = BD().START[horse.colorId];
      const occ = occupantAt(state, st.gx, st.gy, horse.id);
      if (!(occ && occ.colorId === horse.colorId)) {
        moves.push({
          type: 'exit', horseId: horse.id, horseSlot: horse.slotIndex,
          toGx: st.gx, toGy: st.gy, pathIndex: 0, steps: 1,
          cells: [{ gx: st.gx, gy: st.gy }],
          kickId: occ && occ.colorId !== horse.colorId ? occ.id : null,
          phoenixFree: true
        });
      }
      return moves;
    }

    let effectiveDice = Skills.modifyDiceForSkill(horse, dice, state);
    if (effectiveDice < 1 && horse.zone !== 'pen') return moves;

    // —— Xuất quân ——
    if (horse.zone === 'pen') {
      if (dice === 6 || horse.phoenixPending) {
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

    // —— Home ——
    if (horse.zone === 'home') {
      if (horse.homeIndex >= 1 && horse.homeIndex < 6) {
        const target = dice; // home đi đúng số nút
        if (target === horse.homeIndex + 1 && target <= 6) {
          const cell = BD().homeCell(horse.colorId, target);
          if (cell && !occupantAt(state, cell.gx, cell.gy, horse.id)) {
            moves.push({
              type: 'home', horseId: horse.id, horseSlot: horse.slotIndex,
              toGx: cell.gx, toGy: cell.gy, homeIndex: target, steps: 1,
              cells: [{ gx: cell.gx, gy: cell.gy }], kickId: null
            });
          }
        }
      }
      return moves;
    }

    if (horse.zone !== 'track') return moves;

    const allowLeap = Skills.canLeap(horse);
    const canDoKick = Skills.canKick(horse, isBonus);

    // —— Đá hậu ——
    {
      const back = usefulBackward(horse.colorId, horse.pathIndex, effectiveDice);
      if (back.length === effectiveDice) {
        const mid = back.slice(0, -1);
        if (!blockedMid(state, horse, mid, allowLeap)) {
          const last = back[back.length - 1];
          const occ = occupantAt(state, last.gx, last.gy, horse.id);
          if (
            occ && occ.colorId !== horse.colorId &&
            !isStartCell(last.gx, last.gy) &&
            canDoKick &&
            !Skills.isGhostStealth(occ)
          ) {
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

    // —— Bay (xúc 1) ——
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
      let clear = true, target = null;
      for (let i = 0; i < forward.length; i++) {
        const c = forward[i];
        if (!isAnyEntry(c.gx, c.gy)) {
          if (occupantAt(state, c.gx, c.gy, horse.id)) { clear = false; break; }
          continue;
        }
        target = c; break;
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
        } else if (
          occ.colorId !== horse.colorId && canDoKick && !Skills.isGhostStealth(occ)
        ) {
          moves.push({
            type: 'fly_kick', horseId: horse.id, horseSlot: horse.slotIndex,
            toGx: target.gx, toGy: target.gy, pathIndex: target.pathIndex,
            steps: 1, cells: [{ gx: target.gx, gy: target.gy }],
            kickId: occ.id, fly: true
          });
        }
      }
    }

    // —— Trickster swap ——
    if (
      dice === 1 && Skills.isTrickster(horse) &&
      (horse.cooldownTurns || 0) <= 0
    ) {
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
          type: 'swap', horseId: horse.id, horseSlot: horse.slotIndex,
          toGx: target.gx, toGy: target.gy, pathIndex: target.pathIndex,
          steps: 0, cells: [], kickId: null,
          swapWithId: target.id,
          targetGx: target.gx, targetGy: target.gy
        });
      }
    }

    // —— Di chuyển / đá tiến ——
    {
      const cells = usefulForward(horse.colorId, horse.pathIndex, effectiveDice);
      if (cells.length === effectiveDice) {
        const mid = cells.slice(0, -1);
        if (!blockedMid(state, horse, mid, allowLeap)) {
          const last = cells[cells.length - 1];
          const occ = occupantAt(state, last.gx, last.gy, horse.id);
          if (!(occ && occ.colorId === horse.colorId)) {
            // Phi Mã leap: không đá quân giữa (đã skip trong blockedMid)
            const wantKick = occ && canDoKick && !Skills.isGhostStealth(occ);
            moves.push({
              type: wantKick ? 'kick' : 'move',
              horseId: horse.id, horseSlot: horse.slotIndex,
              toGx: last.gx, toGy: last.gy, pathIndex: last.pathIndex,
              steps: cells.length,
              cells: cells.map((c) => ({ gx: c.gx, gy: c.gy })),
              kickId: wantKick ? occ.id : null,
              leap: allowLeap && mid.some((c) => occupantAt(state, c.gx, c.gy, horse.id)),
              stepsAdded: horse.skillId === 1 && horse.zone === 'track' ? 1 : 0,
              skillId: horse.skillId
            });
          }
        }
      }
    }

    // —— Warp bonus: nếu đích là góc/ENTRY → đánh dấu +2 (apply sau) ——
    // (xử lý trong applyMove)

    // —— Lên chuồng lần đầu ——
    if (horse.pathIndex === len - 1 && dice >= 1 && dice <= 6) {
      const homeCells = [];
      let ok = true;
      for (let h = 1; h <= dice; h++) {
        const cell = BD().homeCell(horse.colorId, h);
        if (!cell || occupantAt(state, cell.gx, cell.gy, horse.id)) {
          ok = false; break;
        }
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
    const Skills = AS();
    const horse = state.horses.find((h) => h.id === move.horseId);
    if (!horse) return state;

    const resultFlags = {
      shieldReflected: false,
      remainingShield: 0,
      kamikazeExploded: false,
      mineTriggered: false,
      mineCoords: null,
      victimId: null,
      vampireSurge: false,
      bountyAwarded: false,
      warpBonus: false,
      revealedSkill: null
    };

    if (move.type === 'exit') horse.phoenixPending = false;
    if (horse.stunTurns > 0) horse.stunTurns -= 1;

    // —— Kick resolution ——
    if (move.kickId != null) {
      const victim = state.horses.find((h) => h.id === move.kickId);
      if (victim) {
        // Reveal skills
        if (!victim.isRevealed && victim.skillId) {
          victim.isRevealed = true;
          resultFlags.revealedSkill = { horseId: victim.id, skillId: victim.skillId, reason: 'kicked' };
        }
        if (!horse.isRevealed && horse.skillId) {
          horse.isRevealed = true;
          resultFlags.revealedSkill = { horseId: horse.id, skillId: horse.skillId, reason: 'kick' };
        }

        // Thiết Giáp phản
        if (Skills.isImmuneToKick(victim)) {
          victim.shieldHp = Math.max(0, (victim.shieldHp || 0) - 1);
          resultFlags.shieldReflected = true;
          resultFlags.remainingShield = victim.shieldHp;
          // attacker lùi 1
          const back = usefulBackward(horse.colorId, horse.pathIndex, 1);
          if (back.length) {
            horse.pathIndex = back[0].pathIndex;
            horse.gx = back[0].gx;
            horse.gy = back[0].gy;
          }
          state.extraTurn = false;
          // Ôm Bom dẫm khiên → tự nổ
          if (Skills.isKamikaze(horse)) {
            sendToPen(state, horse, { kicked: true });
            resultFlags.kamikazeExploded = true;
          }
          move._reflected = true;
        } else if (Skills.isKamikaze(horse) && !move.backward) {
          // Ôm Bom đồng quy (không phải đá hậu)
          sendToPen(state, victim, { kicked: true });
          sendToPen(state, horse, { kicked: true });
          move._kamikaze = true;
          resultFlags.kamikazeExploded = true;
        } else if (Skills.isKamikaze(victim) && move.backward) {
          // Đá hậu Ôm Bom → bom xịt, chỉ victim chết
          sendToPen(state, victim, { kicked: true });
        } else {
          // Kick thường
          // Bounty for Thiên Lý
          if (victim.skillId === 1) {
            state.bounties = state.bounties || {};
            state.bounties[horse.colorId] = (state.bounties[horse.colorId] || 0) + 1;
            state.extraTurn = true;
            resultFlags.bountyAwarded = true;
          }
          sendToPen(state, victim, { kicked: true });

          // Vampire +3
          if (Skills.isVampire(horse)) {
            const bonus = usefulForward(horse.colorId, move.pathIndex, 3);
            if (bonus.length) {
              const last = bonus[bonus.length - 1];
              move._vampireBonus = {
                pathIndex: last.pathIndex, gx: last.gx, gy: last.gy
              };
              resultFlags.vampireSurge = true;
            }
            horse.starvationCounter = 0;
          }
        }
      }
    } else if (Skills.isVampire(horse) && move.type !== 'exit' && move.type !== 'home' && move.type !== 'swap') {
      horse.starvationCounter = (horse.starvationCounter || 0) + 1;
    }

    // —— Position update ——
    if (move._reflected) {
      // already moved attacker back
    } else if (move._kamikaze) {
      // both in pen
    } else if (move.type === 'swap') {
      const other = state.horses.find((h) => h.id === move.swapWithId);
      if (other) {
        const targetA = { gx: other.gx, gy: other.gy };
        const targetB = { gx: horse.gx, gy: horse.gy };
        horse.gx = targetA.gx; horse.gy = targetA.gy;
        other.gx = targetB.gx; other.gy = targetB.gy;
        // CRITICAL: convert grid → pathIndex per color
        const piA = getPathIndexFromGrid(horse.colorId, targetA.gx, targetA.gy);
        const piB = getPathIndexFromGrid(other.colorId, targetB.gx, targetB.gy);
        if (piA >= 0) horse.pathIndex = piA;
        if (piB >= 0) other.pathIndex = piB;
        horse.cooldownTurns = 3;
        if (!horse.isRevealed) {
          horse.isRevealed = true;
          resultFlags.revealedSkill = { horseId: horse.id, skillId: 12, reason: 'swap' };
        }
      }
    } else if (move.type === 'exit') {
      horse.zone = 'track';
      horse.pathIndex = 0;
      horse.homeIndex = 0;
      horse.gx = move.toGx;
      horse.gy = move.toGy;
      if (Skills.allowsExtraTurnOn6(horse) && !move.phoenixFree && state.dice === 6) {
        state.extraTurn = true;
      }
    } else if (
      move.type === 'move' || move.type === 'kick' ||
      move.type === 'fly' || move.type === 'fly_kick' ||
      move.type === 'kick_rear'
    ) {
      if (!move._kamikaze && !move._reflected) {
        horse.zone = 'track';
        horse.pathIndex = move.pathIndex;
        horse.gx = move.toGx;
        horse.gy = move.toGy;

        // Warp Rider +2 if land on corner/ENTRY
        if (horse.skillId === 3 && isCornerOrEntry(horse.gx, horse.gy)) {
          const extra = usefulForward(horse.colorId, horse.pathIndex, 2);
          if (extra.length) {
            const last = extra[extra.length - 1];
            // check not blocked / not own piece
            const occ = occupantAt(state, last.gx, last.gy, horse.id);
            if (!occ || occ.colorId !== horse.colorId) {
              horse.pathIndex = last.pathIndex;
              horse.gx = last.gx;
              horse.gy = last.gy;
              move.warpBonusSteps = extra.length;
              resultFlags.warpBonus = true;
              if (occ && occ.colorId !== horse.colorId && Skills.canKick(horse, false)) {
                sendToPen(state, occ, { kicked: true });
                move.kickId = occ.id;
              }
            }
          }
        }

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

    // Trapper place mine
    if (
      Skills.isTrapper(horse) &&
      (move.type === 'move' || move.type === 'kick' || move.type === 'kick_rear') &&
      !move._kamikaze
    ) {
      const myMines = (state.mines || []).filter((m) => m.horseId === horse.id);
      if (myMines.length >= 2) {
        // remove oldest
        const oldest = myMines[0];
        removeMine(state, oldest.gx, oldest.gy);
      }
      state.mines = state.mines || [];
      state.mines.push({
        gx: horse.gx, gy: horse.gy,
        ownerColorId: horse.colorId, horseId: horse.id,
        createdAtTurn: state.turnCount || 0
      });
    }

    // Mine trigger
    if (horse.zone === 'track') {
      const m = mineAt(state, horse.gx, horse.gy);
      if (m && m.horseId !== horse.id) {
        // Ghost / leap không nổ
        const skip = Skills.isGhostStealth(horse) || move.leap || move.fly;
        if (!skip) {
          applyMineEffect(state, horse, 4);
          removeMine(state, m.gx, m.gy);
          move._mineHit = true;
          resultFlags.mineTriggered = true;
          resultFlags.mineCoords = { gx: m.gx, gy: m.gy };
          resultFlags.victimId = horse.id;
          if (!horse.isRevealed && horse.skillId) {
            horse.isRevealed = true;
          }
        }
      }
    }

    // Ghost accidental overlap reveal
    if (horse.zone === 'track') {
      const other = occupantAt(state, horse.gx, horse.gy, horse.id);
      if (other && Skills.isGhostStealth(other) && !move.kickId) {
        // accidental land on ghost → kick ghost
        sendToPen(state, other, { kicked: true });
        other.isRevealed = true;
        move._ghostRevealed = other.id;
      }
    }

    // Extra turn on 6
    if (state.dice === 6 && Skills.allowsExtraTurnOn6(horse) && !move.phoenixFree && !move._reflected) {
      state.extraTurn = true;
    }

    // Combo Rider: even 2/4 → bonus roll flag
    if (horse.skillId === 4 && (state.dice === 2 || state.dice === 4) && !state.isBonusRoll) {
      move._comboExtra = true;
      state.extraTurn = true;
      state.isBonusRoll = true; // next roll is bonus (no kick)
    } else if (state.isBonusRoll) {
      state.isBonusRoll = false;
    }

    // Stealth countdown at end of own move
    if (horse.skillId === 7 && horse.stealthTurns > 0) {
      horse.stealthTurns -= 1;
    }
    // Cooldown countdown
    if (horse.cooldownTurns > 0) {
      horse.cooldownTurns -= 1;
    }

    state.pendingFeatFX = resultFlags;
    checkWin(state, horse.colorId);
    return state;
  }

  function checkWin(state, colorId) {
    const hs = horsesOf(state, colorId);
    const idx = new Set(
      hs.filter((h) => h.zone === 'home' && h.homeIndex >= 3 && h.homeIndex <= 6)
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
    state.turnCount = (state.turnCount || 0) + 1;
    state.isBonusRoll = false;
    return state;
  }

  function assignSkill(state, horseId, skillId) {
    const horse = state.horses.find((h) => h.id === horseId);
    if (!horse) return false;
    if (!AS().canSelectSkill(state, horse.colorId, skillId)) return false;
    AS().initSkillRuntime(horse, skillId);
    return true;
  }

  global.AdvancedRules = {
    createGameState, createHorseState, horsesOf,
    legalMoves, movesForHorse, applyMove, nextPlayer,
    assignSkill, occupantAt, isStartCell, getPathIndexFromGrid
  };
})(typeof window !== 'undefined' ? window : globalThis);
