/**
 * advanced-fx.js — Đạo diễn trình diễn V2.5 (Event-driven, max 800ms)
 */
(function (global) {
  'use strict';

  const AdvancedFX = {
    MAX_FX_DURATION: 800,

    /**
     * @param {object} move
     * @param {object} result - engine.apply result + state.pendingFeatFX
     * @param {object} api - { shakeCamera, showCombatText, spawnParticles, playSound, highlightTile, showCutinBanner }
     */
    async playFeat(move, result, api) {
      if (!move || !api) return;
      const fx = (result && result.pendingFeatFX) || (result && result.feat) || {};
      const {
        shakeCamera, showCombatText, spawnParticles, playSound, showCutinBanner
      } = api;

      const text = (horseId, msg, color) => {
        if (showCombatText) showCombatText(horseId, msg, color);
      };
      const shake = (mag, dur) => {
        if (shakeCamera) shakeCamera({ magnitude: mag, duration: dur });
      };
      const sfx = (name) => { if (playSound) playSound(name); };
      const particles = (type, gx, gy, color) => {
        if (spawnParticles) spawnParticles(type, gx, gy, color);
      };

      // 1. Shield reflect
      if (fx.shieldReflected || move._reflected) {
        sfx('metal_clash_heavy');
        shake(0.5, 220);
        text(move.horseId, `KHIÊN HỘ THỂ! CÒN ${fx.remainingShield != null ? fx.remainingShield : '?'} KHIÊN`, '#eab308');
        particles('hexagon_shield_shatter', move.toGx || move.gx, move.toGy || move.gy, '#eab308');
        return;
      }

      // 2. Kamikaze
      if (move._kamikaze || fx.kamikazeExploded) {
        sfx('nuke_explosion');
        shake(0.7, 280);
        text(move.horseId, 'CẢM TỬ ĐỒNG QUY VU TẬN!', '#dc2626');
        particles('nuclear_shockwave', move.toGx, move.toGy, '#dc2626');
        return;
      }

      // 3. Mine
      if (move._mineHit || fx.mineTriggered) {
        sfx('mine_blast');
        shake(0.45, 200);
        const vid = fx.victimId || move.horseId;
        text(vid, 'TRÚNG MÌN! BẬT LÙI 4 BƯỚC!', '#fbbf24');
        const mc = fx.mineCoords || { gx: move.toGx, gy: move.toGy };
        particles('sulphur_blast', mc.gx, mc.gy, '#fbbf24');
        return;
      }

      // 4. Leap (Phi Mã)
      if (move.leap) {
        sfx('wing_flap_heavy');
        text(move.horseId, 'PHI MÃ VƯỢT CHƯỚNG NGẠI!', '#e2e8f0');
        particles('pegasus_wings', move.toGx, move.toGy, '#ffffff');
        return;
      }

      // 5. Warp
      if (move.warpBonusSteps || fx.warpBonus) {
        sfx('warp_glitch');
        shake(0.2, 120);
        text(move.horseId, 'WARP SPEED +2!', '#06b6d4');
        particles('space_distortion', move.toGx, move.toGy, '#06b6d4');
        return;
      }

      // 6. Swap
      if (move.type === 'swap') {
        sfx('mirror_shatter');
        shake(0.25, 150);
        text(move.horseId, 'HOÁN VỊ CÀN KHÔN!', '#8b5cf6');
        particles('mirror_portal', move.toGx, move.toGy, '#8b5cf6');
        if (move.targetGx != null) {
          particles('mirror_portal', move.targetGx, move.targetGy, '#10b981');
        }
        return;
      }

      // 7. Phoenix
      if (move.type === 'exit' && move.phoenixFree) {
        sfx('phoenix_cry');
        text(move.horseId, 'PHƯỢNG HOÀNG NIẾT BÀN!', '#f97316');
        particles('celestial_fire_pillar', move.toGx, move.toGy, '#f97316');
        return;
      }

      // 8. Thiên Lý +1
      if (move.stepsAdded || (move.skillId === 1 && move.steps > 6)) {
        sfx('ting_speed');
        text(move.horseId, '+1 THẦN TỐC!', '#f59e0b');
        return;
      }

      // 9. Vampire
      if (fx.vampireSurge || move._vampireBonus) {
        sfx('vampire_roar');
        text(move.horseId, 'HÚT HUYẾT TIẾN 3 BƯỚC!', '#b91c1c');
        particles('crimson_orbs', move.toGx, move.toGy, '#b91c1c');
        return;
      }

      // 10. Combo
      if (move._comboExtra) {
        sfx('thunder_strike');
        shake(0.2, 150);
        text(move.horseId, 'COMBO ROLL! (KHÔNG ĐÁ)', '#a855f7');
        return;
      }

      // 11. Bounty
      if (fx.bountyAwarded) {
        text(move.horseId, 'BOUNTY ROLL!', '#fbbf24');
        return;
      }

      // Default kick feedback
      if (move.kickId != null && (move.type === 'kick' || move.type === 'fly_kick' || move.type === 'kick_rear')) {
        shake(0.3, 160);
      }
    },

    async revealSecretSkill(horse, triggerReason, api) {
      if (!api || !horse) return;
      const { playSound, showCutinBanner, spawnParticles, shakeCamera } = api;
      const sk = global.AdvancedSkills && global.AdvancedSkills.getSkill(horse.skillId);
      if (playSound) playSound('seal_shatter');
      if (shakeCamera) shakeCamera({ magnitude: 0.35, duration: 180 });
      if (spawnParticles) {
        spawnParticles('golden_seal_burst', horse.gx, horse.gy, (sk && sk.elementColor) || '#fbbf24');
      }
      if (showCutinBanner) {
        showCutinBanner({
          title: 'KỸ NĂNG BỘC LỘ!',
          skillName: sk ? sk.name : '???',
          reason: triggerReason,
          color: sk ? sk.elementColor : '#fbbf24'
        });
      }
    },

    // Backward compat
    play(move, result, api) {
      return this.playFeat(move, result, api);
    }
  };

  global.AdvancedFX = AdvancedFX;
})(typeof window !== 'undefined' ? window : globalThis);
