/**
 * advanced-skills.js — 12 kỹ năng V2.5 (Balanced Circular Counters)
 * Pure metadata + helpers. Không phụ thuộc DOM / WebGL.
 */
(function (global) {
  'use strict';

  const SKILLS = {
    1: {
      id: 1, name: 'Thiên Lý Mã', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Mọi xúc +1 bước trên track',
      desc: 'Trên track mọi xúc +1 (xúc 6 = 7). Vào home đi đúng số nút.',
      weakness: 'Bị đá → kẻ hạ gục được Bounty Roll. Dẫm mìn → lùi 5 bước.',
      color: '#f59e0b', elementColor: '#fbbf24',
      combatText: '+1 THẦN TỐC!'
    },
    2: {
      id: 2, name: 'Phi Mã', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Nhảy qua 1 quân chắn',
      desc: 'Nhảy qua đúng 1 quân chắn (đồng đội/địch). Xúc 6 vẫn nhận extraTurn.',
      weakness: 'Khi nhảy qua không được đá quân giữa đường. Ô đích có địch vẫn đá bình thường.',
      color: '#f59e0b', elementColor: '#e2e8f0',
      combatText: 'PHI MÃ VƯỢT CHƯỚNG NGẠI!'
    },
    3: {
      id: 3, name: 'Warp Rider', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Dừng góc/ENTRY → +2 bước',
      desc: 'Dừng đúng ô góc cua hoặc ENTRY → tự động lướt thêm 2 bước.',
      weakness: 'Trên đường thẳng xúc 6 chỉ đi 5 bước.',
      color: '#f59e0b', elementColor: '#06b6d4',
      combatText: 'WARP SPEED +2!'
    },
    4: {
      id: 4, name: 'Combo Rider', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Xúc chẵn 2/4 → tung thêm',
      desc: 'Xúc 2 hoặc 4 → được tung thêm 1 lần (tối đa 1 lần/lượt).',
      weakness: 'Lượt tung thêm không được đá. Bị đá về chuồng → bất động 1 lượt.',
      color: '#f59e0b', elementColor: '#a855f7',
      combatText: 'COMBO ROLL! (KHÔNG ĐÁ)'
    },
    5: {
      id: 5, name: 'Thiết Giáp', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Khiên 2 tầng + phản đòn',
      desc: 'shieldHp=2. Bị đá → không về chuồng, dội ngược kẻ tấn công 1 ô.',
      weakness: 'Xúc 6 chỉ đi 5. Hết khiên trở thành ngựa thường.',
      color: '#3b82f6', elementColor: '#eab308',
      combatText: 'KHIÊN HỘ THỂ PHẢN ĐÒN!'
    },
    6: {
      id: 6, name: 'Phoenix', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Hồi sinh xuất tự do (×2)',
      desc: 'Bị đá → lượt sau xuất với bất kỳ nút 1–6. Tối đa 2 lần.',
      weakness: 'Xuất miễn phí không nhận extraTurn, không đứng ô an toàn.',
      color: '#3b82f6', elementColor: '#f97316',
      combatText: 'PHƯỢNG HOÀNG NIẾT BÀN!'
    },
    7: {
      id: 7, name: 'Ghost', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Tàng hình 4 lượt đầu',
      desc: 'stealthTurns=4. Đối thủ/Bot không thể chủ động nhắm đá.',
      weakness: 'Vô tình trùng ô vẫn bị đá. Hết stealth trở lại bình thường.',
      color: '#3b82f6', elementColor: '#9333ea',
      combatText: 'ẢO ẢNH HƯ VÔ'
    },
    8: {
      id: 8, name: 'Gatekeeper', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Phong tỏa ENTRY −2 bước',
      desc: 'Khi ở home (≥1): địch trong bán kính 3 ô quanh ENTRY bị −2 bước.',
      weakness: 'Trên track: −1 bước nếu có địch trong 6 ô phía trước.',
      color: '#3b82f6', elementColor: '#ca8a04',
      combatText: '-2 BƯỚC (BỊ PHONG TỎA!)'
    },
    9: {
      id: 9, name: 'Ôm Bom', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Đồng quy khi dẫm địch',
      desc: 'Dẫm trúng địch → cả hai về chuồng. Tối đa 1 quân/team.',
      weakness: 'Bị đá từ sau → bom xịt. Dẫm Thiết Giáp → tự nổ một mình.',
      color: '#ef4444', elementColor: '#dc2626',
      combatText: 'CẢM TỬ ĐỒNG QUY VU TẬN!',
      maxPerTeam: 1
    },
    10: {
      id: 10, name: 'Trapper', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Đặt mìn (−4 bước)',
      desc: 'Dừng chân → chôn mìn (tối đa 2). Địch dẫm → lùi 4 bước.',
      weakness: 'Nổ cả đồng đội. Không nổ Ghost / Phi Mã đang bay.',
      color: '#ef4444', elementColor: '#fbbf24',
      combatText: 'TRÚNG MÌN! BẬT LÙI 4 BƯỚC!'
    },
    11: {
      id: 11, name: 'Vampire', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Đá → tiến thêm 3 bước',
      desc: 'Đá thành công → tiến thêm 3 bước thưởng.',
      weakness: '4 lượt liên tiếp không đá → suy nhược (−1 bước lần xúc sau).',
      color: '#ef4444', elementColor: '#b91c1c',
      combatText: 'HÚT HUYẾT TIẾN 3 BƯỚC!'
    },
    12: {
      id: 12, name: 'Trickster', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Xúc 1 → đổi chỗ (CD 3)',
      desc: 'Xúc 1 → hoán vị với địch trong 6 ô. Hồi chiêu 3 lượt.',
      weakness: 'Không swap quân đã vào home. Cooldown 3 lượt.',
      color: '#ef4444', elementColor: '#8b5cf6',
      combatText: 'HOÁN VỊ CÀN KHÔN!'
    }
  };

  const SYSTEMS = {
    breakthrough: { name: 'Đột Phá', color: '#f59e0b', ids: [1, 2, 3, 4] },
    defense:      { name: 'Phòng Thủ', color: '#3b82f6', ids: [5, 6, 7, 8] },
    disruption:   { name: 'Phá Hoại', color: '#ef4444', ids: [9, 10, 11, 12] }
  };

  function getSkill(id) { return SKILLS[id] || null; }
  function listSkills() { return Object.values(SKILLS); }
  function listBySystem(key) {
    return (SYSTEMS[key] || { ids: [] }).ids.map((id) => SKILLS[id]);
  }

  function canSelectSkill(state, colorId, skillId) {
    const sk = SKILLS[skillId];
    if (!sk) return false;
    if (sk.maxPerTeam) {
      const count = (state.horses || []).filter(
        (h) => h.colorId === colorId && h.skillId === skillId
      ).length;
      if (count >= sk.maxPerTeam) return false;
    }
    return true;
  }

  function initSkillRuntime(horse, skillId) {
    horse.skillId = skillId;
    horse.isRevealed = false;
    horse.shieldHp = skillId === 5 ? 2 : 0;
    horse.revivesLeft = skillId === 6 ? 2 : 0;
    horse.cooldownTurns = 0;
    horse.stealthTurns = skillId === 7 ? 4 : 0;
    horse.starvationCounter = 0;
    horse.stunTurns = 0;
    horse.phoenixPending = false;
  }

  function modifyDiceForSkill(horse, dice, state) {
    if (!horse || !horse.skillId) return dice;
    let d = dice;
    switch (horse.skillId) {
      case 1:
        if (horse.zone === 'track') d = dice + 1;
        break;
      case 3:
        if (dice === 6) d = 5;
        break;
      case 5:
        if (dice === 6) d = 5;
        break;
      case 8:
        if (horse.zone === 'track' && state) {
          const BD = global.BoardData;
          if (BD) {
            const len = BD.pathLen(horse.colorId);
            for (let i = 1; i <= 6; i++) {
              const idx = horse.pathIndex + i;
              if (idx >= len) break;
              const c = BD.cellAt(horse.colorId, idx);
              if (!c) break;
              const occ = (state.horses || []).find(
                (h) => h.id !== horse.id && h.zone === 'track' &&
                  Math.abs(h.gx - c.gx) < 0.3 && Math.abs(h.gy - c.gy) < 0.3
              );
              if (occ && occ.colorId !== horse.colorId) { d = Math.max(1, dice - 1); break; }
            }
          }
        }
        break;
      case 11:
        if (horse.starvationCounter >= 4) d = Math.max(1, dice - 1);
        break;
      default: break;
    }
    if (state && horse.zone === 'track') {
      const gatekeepers = (state.horses || []).filter(
        (h) => h.skillId === 8 && h.zone === 'home' && h.homeIndex >= 1 && h.colorId !== horse.colorId
      );
      if (gatekeepers.length) {
        const BD = global.BoardData;
        for (const gk of gatekeepers) {
          const entry = BD && BD.ENTRY[gk.colorId];
          if (entry) {
            const dist = Math.abs(horse.gx - entry.gx) + Math.abs(horse.gy - entry.gy);
            if (dist <= 3) { d = Math.max(1, d - 2); break; }
          }
        }
      }
    }
    return d;
  }

  function allowsExtraTurnOn6(horse) {
    if (!horse || !horse.skillId) return true;
    if (horse.phoenixPending) return false;
    return true;
  }

  function canKick(horse, isBonusRoll) {
    if (!horse) return true;
    if (horse.skillId === 4 && isBonusRoll) return false;
    return true;
  }

  function isImmuneToKick(horse) {
    return horse && horse.skillId === 5 && (horse.shieldHp || 0) > 0;
  }
  function isGhostStealth(horse) {
    return horse && horse.skillId === 7 && (horse.stealthTurns || 0) > 0;
  }
  function isPhoenix(horse) { return horse && horse.skillId === 6; }
  function isKamikaze(horse) { return horse && horse.skillId === 9; }
  function isTrapper(horse) { return horse && horse.skillId === 10; }
  function isVampire(horse) { return horse && horse.skillId === 11; }
  function isTrickster(horse) { return horse && horse.skillId === 12; }
  function canLeap(horse) { return horse && horse.skillId === 2; }

  global.AdvancedSkills = {
    SKILLS, SYSTEMS,
    getSkill, listSkills, listBySystem,
    canSelectSkill, initSkillRuntime,
    modifyDiceForSkill, allowsExtraTurnOn6, canKick,
    isImmuneToKick, isGhostStealth, isPhoenix, isKamikaze,
    isTrapper, isVampire, isTrickster, canLeap
  };
})(typeof window !== 'undefined' ? window : globalThis);
