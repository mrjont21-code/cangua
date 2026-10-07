# CHANGELOG — Cá Ngựa 3D

## [Advanced] 2026-10-08 — Chế độ Nâng cao (Skill System)

### Thêm mới
- `SPEC-ADVANCED.md` — đặc tả đầy đủ
- `advanced-skills.js` — 12 kỹ năng (3 hệ khắc chế)
- `advanced-rules.js` — luật nâng cao (override moves/apply)
- `advanced-bot.js` — bot chọn nước + chọn skill
- `advanced-fx.js` — hook hiệu ứng trình diễn vật lý
- `tests/selftest-advanced.js` — 240 ván advanced + classic sanity

### Sửa
- `engine.js` — hỗ trợ `ruleMode: "classic" | "advanced"`, `assignSkill`, auto skill cho bot
- `dice6d.js` — thời gian lắc mặc định còn **2/3** (≈1733 ms)
- `index.html`:
  - UI chọn chế độ Truyền thống / Nâng cao
  - Bottom Sheet chọn skill khi xuất quân
  - MINI_DICE_TIMING giảm còn 2/3
  - Tích hợp AdvancedBot + skill select trong vòng lượt
- `actions.js` — nhận type `swap`

### Không đổi
- `rules.js`, `bot.js` gốc — classic 100% giữ nguyên
- Selftest classic 1500 ván: **PASS**

### Kiểm thử
- Classic: 1500 ván PASS, deterministic OK
- Advanced: 240 ván (2/3/4 người) PASS, deterministic OK, skills được gán

### 12 Skills
1 Thiên Lý Mã · 2 Phi Mã · 3 Warp Rider · 4 Combo Rider  
5 Thiết Giáp · 6 Phoenix · 7 Ghost · 8 Gatekeeper  
9 Ôm Bom · 10 Trapper · 11 Vampire · 12 Trickster

---

## [SPEC-001] trước đó
- actions / gamelog / engine / bot / selftest
- chơi với máy + action log + xúc xắc mini
