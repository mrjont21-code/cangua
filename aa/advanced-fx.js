/**
 * advanced-fx.js — Hiệu ứng trình diễn vật lý nhẹ cho chế độ Nâng cao
 * API được board.html / index gọi sau animateMove.
 * Không phụ thuộc DOM nặng; chỉ emit event + optional camera shake.
 */
(function (global) {
  'use strict';

  const FX = {
    /**
     * @param {object} move
     * @param {object} result from engine.apply
     * @param {object} [api] board API { shakeCamera, flash, spawnParticles }
     */
    play(move, result, api) {
      if (!move) return;
      api = api || {};
      const shake = typeof api.shakeCamera === 'function' ? api.shakeCamera : null;
      const flash = typeof api.flash === 'function' ? api.flash : null;

      if (move.type === 'kick' || move.type === 'fly_kick' || move.type === 'kick_rear') {
        if (shake) shake(0.35, 180);
        if (move._reflected && shake) shake(0.5, 220);
        if (move._kamikaze) {
          if (shake) shake(0.7, 280);
          if (flash) flash('#ff4400', 200);
        }
      }
      if (move.type === 'fly' || move.warp) {
        if (shake) shake(0.2, 120);
      }
      if (move._mineHit) {
        if (shake) shake(0.45, 200);
        if (flash) flash('#fbbf24', 150);
      }
      if (move.type === 'swap') {
        if (shake) shake(0.25, 150);
      }
      if (move.type === 'exit' && move.phoenixFree) {
        if (flash) flash('#f97316', 180);
      }
    }
  };

  global.AdvancedFX = FX;
})(typeof window !== 'undefined' ? window : globalThis);
