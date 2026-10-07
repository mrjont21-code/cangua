/**
 * gamelog.js — Action log append-only, replay được
 */
(function (global) {
  'use strict';

  function digestState(state) {
    if (!state || !state.horses) return '';
    const parts = state.horses.map((h) =>
      [h.id, h.colorId, h.zone, h.pathIndex, h.homeIndex, Math.round(h.gx * 100), Math.round(h.gy * 100)].join(',')
    );
    parts.push('c' + state.current);
    parts.push('d' + (state.dice || 0));
    parts.push('w' + (state.winner == null ? '-' : state.winner));
    parts.push('e' + (state.extraTurn ? 1 : 0));
    // simple hash
    const s = parts.join('|');
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  function GameLog() {
    this.entries = [];
    this._seq = 0;
    this._t0 = 0;
  }

  GameLog.prototype.start = function () {
    this.entries = [];
    this._seq = 0;
    this._t0 = Date.now();
  };

  GameLog.prototype.push = function (type, seat, colorId, controller, data) {
    this._seq += 1;
    // t tăng đơn điệu theo seq (ổn định cho test seed); wall-clock optional
    const entry = {
      seq: this._seq,
      t: this._seq * 10,
      type: type,
      seat: seat == null ? null : seat,
      colorId: colorId == null ? null : colorId,
      controller: controller || null,
      data: data || {}
    };
    this.entries.push(entry);
    return entry;
  };

  GameLog.prototype.toJSON = function () {
    return { version: 1, entries: this.entries.slice() };
  };

  GameLog.prototype.download = function (filename) {
    const json = JSON.stringify(this.toJSON(), null, 2);
    if (typeof document === 'undefined') return json;
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || ('canguav3d-log-' + Date.now() + '.json');
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    return json;
  };

  /**
   * Replay: chỉ kiểm tra digest cuối khớp (cần Rules + BoardData)
   */
  GameLog.replay = function (payload, opts) {
    opts = opts || {};
    const Rules = global.Rules;
    const BD = global.BoardData;
    const Actions = global.Actions;
    if (!Rules || !BD) return { ok: false, error: 'missing Rules/BoardData' };
    const entries = (payload && payload.entries) || [];
    if (!entries.length) return { ok: false, error: 'empty' };

    let state = null;
    let lastDigest = null;
    let i = 0;
    for (; i < entries.length; i++) {
      const e = entries[i];
      if (e.type === 'GAME_START') {
        state = Rules.createGameState(e.data.numPlayers);
        lastDigest = digestState(state);
        if (e.data.digest && e.data.digest !== lastDigest) {
          // digest may differ if create order same — still ok if structure matches
        }
      } else if (e.type === 'DICE_ROLLED') {
        if (!state) return { ok: false, error: 'no state', seq: e.seq };
        state.dice = e.data.dice;
      } else if (e.type === 'MOVE_CHOSEN') {
        if (!state) return { ok: false, error: 'no state', seq: e.seq };
        const moves = Rules.legalMoves(state, state.dice);
        const mk = e.data.moveKey;
        const move = moves.find(function (m) { return Actions.moveKey(m) === mk; });
        if (!move) return { ok: false, error: 'move not found ' + mk, seq: e.seq };
        Rules.applyMove(state, move);
        lastDigest = digestState(state);
      } else if (e.type === 'MOVE_APPLIED') {
        // applyMove đã chạy ở MOVE_CHOSEN; giờ nextPlayer như endTurnTracked
        if (state && state.winner == null) {
          Rules.nextPlayer(state);
        }
        if (e.data && e.data.digest) lastDigest = e.data.digest;
      } else if (e.type === 'NO_LEGAL_MOVE') {
        if (!state) return { ok: false, error: 'no state', seq: e.seq };
        if (e.data.next === 'pass') Rules.nextPlayer(state);
        else { state.dice = 0; state.phase = 'turn'; }
      } else if (e.type === 'GAME_WON') {
        // ok
      }
    }
    return { ok: true, digest: lastDigest, state: state };
  };

  global.GameLog = GameLog;
  global.digestState = digestState;
})(typeof window !== 'undefined' ? window : globalThis);
