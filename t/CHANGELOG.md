# CHANGELOG — SPEC-001 chơi với máy + action log + xúc xắc mini

## File thêm
- `actions.js` — moveKey, BOT_PRIORITY, classify
- `gamelog.js` — GameLog append-only, replay, download
- `engine.js` — Engine wrapper quanh Rules + log
- `bot.js` — Bot.chooseMove theo ưu tiên
- `tests/selftest.js` — 500 ván × {2,3,4} bot, deterministic, replay

## File sửa
- `index.html` — setup bot, mini dice, vòng lượt qua engine, nút TẢI LOG

## File KHÔNG đổi (sha256 khớp SPEC)
- rules.js, board-data.js, board.html, dice6d.js, Lac_hop.html, Mat_dice.html

## selftest
- 1500 ván bot kết thúc, 0 duplicate moveKey, deterministic OK, replay OK
- Cả 7 loại nước đi xuất hiện

## Ghi chú
- Hot-seat 2/3/4: `allHuman: true` — UI/luồng như cũ qua engine
- `?botdelay=0` — bot không chờ; `?debug=1` — `window.__gameLog`
