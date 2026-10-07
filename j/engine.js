/**
 * engine.js — lõi thuần JS: state + log, không DOM
 */
(function (global) {
  'use strict';

  function Engine(opts) {
    opts = opts || {};
    const Rules = global.Rules;
    const BD = global.BoardData;
    const Actions = global.Actions;
    const GameLog = global.GameLog;
    const digestState = global.digestState;

    this.rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
    this.humanSeat = opts.humanSeat != null ? opts.humanSeat : 0;
    this.state = Rules.createGameState(opts.numPlayers || 2);
    this.log = new GameLog();
    this.log.start();

    const n = this.state.players.length;
    const seatOpts = opts.seats || [];
    this.seats = [];
    for (let i = 0; i < n; i++) {
      const p = this.state.players[i];
      const c = (seatOpts[i] && seatOpts[i].controller) || 'human-local';
      this.seats.push({ seat: i, colorId: p.colorId, controller: c });
    }

    this._pendingMoves = [];
    this._turnReason = 'first';
    this._started = false;
  }

  Engine.create = function (opts) {
    return new Engine(opts);
  };

  Engine.prototype.currentSeat = function () {
    return this.state.current;
  };

  Engine.prototype.seatInfo = function (seat) {
    return this.seats[seat] || null;
  };

  Engine.prototype.isLocalHuman = function (seat) {
    const s = this.seats[seat];
    return s && s.controller === 'human-local';
  };

  Engine.prototype._push = function (type, data) {
    const seat = this.state.current;
    const info = this.seats[seat] || {};
    return this.log.push(type, seat, info.colorId, info.controller, data);
  };

  Engine.prototype.beginGame = function () {
    this._started = true;
    this.log.start();
    const digest = global.digestState(this.state);
    this.log.push('GAME_START', null, null, null, {
      numPlayers: this.state.players.length,
      seats: this.seats.map(function (s) {
        return { seat: s.seat, colorId: s.colorId, controller: s.controller };
      }),
      humanSeat: this.humanSeat,
      digest: digest
    });
    this._turnReason = 'first';
  };

  Engine.prototype.beginTurn = function (reason) {
    const r = reason || this._turnReason || 'next';
    this.state.phase = 'turn';
    this.state.dice = 0;
    this._push('TURN_START', { reason: r });
    this._turnReason = 'next';
  };

  Engine.prototype.roll = function (forcedDice) {
    let dice;
    if (forcedDice != null && forcedDice >= 1 && forcedDice <= 6) {
      dice = forcedDice | 0;
    } else {
      dice = 1 + Math.floor(this.rng() * 6);
    }
    this.state.dice = dice;
    this._push('DICE_ROLLED', { dice: dice });
    const moves = global.Rules.legalMoves(this.state, dice);
    this._pendingMoves = moves;
    const keys = moves.map(function (m) { return global.Actions.moveKey(m); });
    this._push('LEGAL_MOVES', { dice: dice, moves: keys });
    return { dice: dice, moves: moves, noMove: moves.length === 0 };
  };

  Engine.prototype.resolveNoMove = function () {
    const dice = this.state.dice;
    if (dice === 6) {
      this._push('NO_LEGAL_MOVE', { dice: dice, next: 'reroll' });
      this.state.dice = 0;
      this.state.phase = 'turn';
      this._turnReason = 'reroll6';
      return { next: 'reroll' };
    }
    this._push('NO_LEGAL_MOVE', { dice: dice, next: 'pass' });
    global.Rules.nextPlayer(this.state);
    this._turnReason = 'next';
    return { next: 'pass' };
  };

  Engine.prototype.choose = function (move, by, meta) {
    meta = meta || {};
    const key = global.Actions.moveKey(move);
    // verify membership
    const ok = this._pendingMoves.some(function (m) {
      return global.Actions.moveKey(m) === key;
    });
    if (!ok) {
      this._push('ERROR', { where: 'engine.choose', moveKey: key, msg: 'not in legalMoves' });
    }
    this._push('MOVE_CHOSEN', {
      moveKey: key,
      by: by || 'human',
      auto: !!meta.auto,
      rule: meta.rule || null
    });
    return move;
  };

  Engine.prototype.apply = function (move) {
    if (!(this.state.dice >= 1 && this.state.dice <= 6)) {
      this._push('ERROR', { where: 'engine.apply', msg: 'state.dice invalid', dice: this.state.dice });
    }
    const beforeKick = move.kickId;
    global.Rules.applyMove(this.state, move);
    const dig = global.digestState(this.state);
    const data = {
      moveKey: global.Actions.moveKey(move),
      type: move.type,
      horseId: move.horseId,
      toGx: move.toGx,
      toGy: move.toGy,
      pathIndex: move.pathIndex,
      homeIndex: move.homeIndex,
      steps: move.steps,
      kick: beforeKick != null ? { kickId: beforeKick } : null,
      extraTurn: !!this.state.extraTurn,
      digest: dig
    };
    this._push('MOVE_APPLIED', data);
    if (this.state.winner != null) {
      this._push('GAME_WON', { winner: this.state.winner, colorId: this.state.winner });
    }
    return {
      kick: beforeKick,
      extraTurn: !!this.state.extraTurn,
      winner: this.state.winner
    };
  };

  Engine.prototype.endTurn = function () {
    if (this.state.winner != null) return { extra: false, done: true };
    const wasExtra = !!this.state.extraTurn;
    global.Rules.nextPlayer(this.state);
    if (wasExtra && this.state.extraTurn === false && this.state.phase === 'turn') {
      // nextPlayer cleared extra and kept same player if extra was set
    }
    // Rules.nextPlayer: if extraTurn, clears it and keeps current; else advances
    this._turnReason = wasExtra ? 'extra' : 'next';
    // Actually after applyMove, extraTurn may be true. nextPlayer consumes it.
    // Detect: if current didn't change from before nextPlayer... we need before
    return { extra: this._turnReason === 'extra', done: false };
  };

  /** endTurn that tracks seat change properly */
  Engine.prototype.endTurnTracked = function () {
    if (this.state.winner != null) return { extra: false, done: true };
    const prev = this.state.current;
    const hadExtra = !!this.state.extraTurn;
    global.Rules.nextPlayer(this.state);
    const same = this.state.current === prev;
    this._turnReason = same ? 'extra' : 'next';
    return { extra: same, done: false };
  };

  global.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
