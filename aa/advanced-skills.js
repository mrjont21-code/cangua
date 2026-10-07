/**
 * advanced-skills.js — 12 kỹ năng cân bằng + pure helpers
 * Dùng cho chế độ Nâng cao.
 */
(function (global) {
  'use strict';

  const SKILLS = {
    1: {
      id: 1, name: 'Thiên Lý Mã', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Mọi xúc +1 bước',
      desc: 'Mọi số nút xúc xắc được cộng thêm 1 bước (xúc 6 = 7).',
      weakness: 'Bị đá → lùi thêm 2 ô. Dễ bị Thiết Giáp và Bẫy phạt.',
      color: '#f59e0b'
    },
    2: {
      id: 2, name: 'Phi Mã', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Nhảy qua 1 quân chắn',
      desc: 'Có thể nhảy qua đúng 1 quân đang chắn đường (kể cả đồng đội).',
      weakness: 'Không được extra turn khi xúc 6. Bị Vampire hút bước.',
      color: '#f59e0b'
    },
    3: {
      id: 3, name: 'Warp Rider', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Bay tới góc cua khi đúng số',
      desc: 'Khi xúc đúng khoảng cách tới góc cua tiếp theo → bay thẳng tới góc đó.',
      weakness: 'Xúc 6 luôn bị giảm thành 5. Bị Hoán Đổi & Gatekeeper.',
      color: '#f59e0b'
    },
    4: {
      id: 4, name: 'Combo Rider', system: 'breakthrough', systemName: 'Đột Phá',
      short: 'Xúc chẵn → tung thêm lần',
      desc: 'Xúc chẵn (2/4/6) → được tung thêm 1 lần (tối đa 1 lần/turn).',
      weakness: 'Không thể đá đối phương (dẫm trúng → bản thân lùi 1 ô).',
      color: '#f59e0b'
    },
    5: {
      id: 5, name: 'Thiết Giáp', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Miễn nhiễm đá + phản đòn',
      desc: 'Miễn nhiễm đá tiến & đá bay. Đối thủ dẫm trúng → dội ngược 1 ô + mất lượt.',
      weakness: 'Tốc độ -1 mọi xúc (xúc 1 = đứng yên). Bị Phi Mã / Warp vượt.',
      color: '#3b82f6'
    },
    6: {
      id: 6, name: 'Phoenix', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Bị đá → xuất ngay lượt sau',
      desc: 'Bị đá về chuồng → xuất chuồng lại ngay ở lượt kế tiếp (không cần 6).',
      weakness: 'Không được đứng ô an toàn (START / ENTRY).',
      color: '#3b82f6'
    },
    7: {
      id: 7, name: 'Ghost', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Tàng hình, khó bị nhắm',
      desc: 'Đối thủ không thể chủ động chọn đá quân này (bot bỏ qua, UI mờ).',
      weakness: 'Nếu vô tình trùng ô → bay về chuồng ngay.',
      color: '#3b82f6'
    },
    8: {
      id: 8, name: 'Gatekeeper', system: 'defense', systemName: 'Phòng Thủ',
      short: 'Bảo vệ home, đá không cần đúng số',
      desc: 'Khi đã vào home (bậc ≥1), có thể đá quân đối phương cố vào cùng bậc mà không cần đúng số.',
      weakness: 'Ngoài path tốc độ -50% nếu có đối phương trong bán kính 6 ô phía trước.',
      color: '#3b82f6'
    },
    9: {
      id: 9, name: 'Ôm Bom', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Đồng quy vu tận khi dẫm',
      desc: 'Dẫm trúng đối phương → cả hai về chuồng. Vẫn lên chuồng bình thường.',
      weakness: 'Chỉ được chọn tối đa 1 quân / team. Bị Thiết Giáp phản.',
      color: '#ef4444',
      maxPerTeam: 1
    },
    10: {
      id: 10, name: 'Trapper', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Để lại mìn tàng hình',
      desc: 'Dừng chân → để lại mìn tàng hình. Đối phương dẫm → lùi 4 ô.',
      weakness: 'Mìn có thể nổ trúng đồng đội. Bị Ghost / Phi Mã bỏ qua.',
      color: '#ef4444'
    },
    11: {
      id: 11, name: 'Vampire', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Hút bước khi đá',
      desc: 'Đá được đối phương → tiến thêm đúng số bước đối phương bị phạt.',
      weakness: '3 lượt liên tiếp không đá ai → tự lùi 2 ô.',
      color: '#ef4444'
    },
    12: {
      id: 12, name: 'Trickster', system: 'disruption', systemName: 'Phá Hoại',
      short: 'Xúc 1 → đổi chỗ gần',
      desc: 'Xúc 1 → có thể đổi chỗ với quân đối phương gần nhất trong phạm vi 6 ô.',
      weakness: 'Sau khi đổi thành công → bất động 1 lượt.',
      color: '#ef4444'
    }
  };

  const SYSTEMS = {
    breakthrough: { name: 'Đột Phá', color: '#f59e0b', ids: [1, 2, 3, 4] },
    defense:      { name: 'Phòng Thủ', color: '#3b82f6', ids: [5, 6, 7, 8] },
    disruption:   { name: 'Phá Hoại', color: '#ef4444', ids: [9, 10, 11, 12] }
  };

  function getSkill(id) {
    return SKILLS[id] || null;
  }

  function listSkills() {
    return Object.values(SKILLS);
  }

  function listBySystem(systemKey) {
    return (SYSTEMS[systemKey] || { ids: [] }).ids.map((id) => SKILLS[id]);
  }

  function canSelectSkill(state, colorId, skillId) {
    const sk = SKILLS[skillId];
    if (!sk) return false;
    if (sk.maxPerTeam) {
      const count = (state.horses || []).filter(
        (h) => h.colorId === colorId && h.skillId === skillId && h.zone !== 'pen'
      ).length;
      // Also count those still in pen that already have the skill assigned this game
      const penCount = (state.horses || []).filter(
        (h) => h.colorId === colorId && h.skillId === skillId
      ).length;
      if (penCount >= sk.maxPerTeam) return false;
    }
    return true;
  }

  /** Điều chỉnh số bước theo skill trước khi tính moves */
  function modifyDiceForSkill(horse, dice) {
    if (!horse || !horse.skillId) return dice;
    let d = dice;
    switch (horse.skillId) {
      case 1: // Thiên Lý Mã +1
        d = dice + 1;
        break;
      case 3: // Warp Rider: 6 → 5
        if (dice === 6) d = 5;
        break;
      case 5: // Thiết Giáp -1
        d = Math.max(0, dice - 1);
        break;
      case 8: // Gatekeeper slow (handled elsewhere with context)
        break;
      default:
        break;
    }
    return d;
  }

  /** Có được extra turn khi xúc 6 không */
  function allowsExtraTurnOn6(horse) {
    if (!horse || !horse.skillId) return true;
    if (horse.skillId === 2) return false; // Phi Mã
    return true;
  }

  /** Có thể đá đối phương không */
  function canKick(horse) {
    if (!horse || !horse.skillId) return true;
    if (horse.skillId === 4) return false; // Combo Rider
    return true;
  }

  /** Miễn nhiễm bị đá tiến/bay */
  function isImmuneToKick(horse) {
    return horse && horse.skillId === 5; // Thiết Giáp
  }

  /** Ghost: không thể bị chọn chủ động */
  function isGhost(horse) {
    return horse && horse.skillId === 7;
  }

  /** Phoenix: xuất lại không cần 6 */
  function isPhoenix(horse) {
    return horse && horse.skillId === 6;
  }

  /** Ôm Bom */
  function isKamikaze(horse) {
    return horse && horse.skillId === 9;
  }

  /** Trapper */
  function isTrapper(horse) {
    return horse && horse.skillId === 10;
  }

  /** Vampire */
  function isVampire(horse) {
    return horse && horse.skillId === 11;
  }

  /** Trickster */
  function isTrickster(horse) {
    return horse && horse.skillId === 12;
  }

  /** Phi Mã: có thể nhảy qua 1 quân */
  function canLeap(horse) {
    return horse && horse.skillId === 2;
  }

  global.AdvancedSkills = {
    SKILLS,
    SYSTEMS,
    getSkill,
    listSkills,
    listBySystem,
    canSelectSkill,
    modifyDiceForSkill,
    allowsExtraTurnOn6,
    canKick,
    isImmuneToKick,
    isGhost,
    isPhoenix,
    isKamikaze,
    isTrapper,
    isVampire,
    isTrickster,
    canLeap
  };
})(typeof window !== 'undefined' ? window : globalThis);
