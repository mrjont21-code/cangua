/**
 * board3d.js — MODULE BÀN CỜ CÁ NGỰA 3D CHUẨN
 *
 * ═══ MỤC ĐÍCH ═══
 *  1. Toạ độ tâm mọi ô: chuồng, xuất phát, đường đi, đường về chuồng
 *  2. Định vị gán quân cờ (dùng chung với horse3d.js)
 *  3. Hiển thị 3D + highlight live diễn biến ván chơi
 *
 * ═══ QUY ƯỚC ═══
 *  • Lưới 15×15, gốc (0,0) = góc trên-trái bàn cờ
 *  • col 0→14 trái→phải, row 0→14 trên→dưới
 *  • World: x=(col-7)*CELL, z=(row-7)*CELL, y=0 (mặt bàn)
 *  • Track: 52 ô theo chiều kim đồng hồ (khi nhìn từ trên xuống)
 *  • Mỗi màu: 4 chuồng + 1 ô xuất phát + 6 ô home path + 1 goal
 */

import * as THREE from 'three';

// ═══ CẤU HÌNH ═══
export const BOARD_CONFIG = Object.freeze({
  GRID: 15,
  CELL: 1.0,
  THICKNESS: 0.4,
  COLORS: {
    RED:        0xdc2626,
    YELLOW:     0xeab308,
    GREEN:      0x16a34a,
    BLUE:       0x2563eb,
    TRACK:      0x334155,
    SAFE:       0xf59e0b,
    BOARD_BG:   0xfde68a,
    BOARD_EDGE: 0x0f172a,
    HIGHLIGHT:  0x38bdf8,
    MOVE_PATH:  0x22d3ee,
  },
});

const gc = (col, row) => ({ col, row });
const key = (c, r) => `${c},${r}`;

// ═══ 4 CHUỒNG — mỗi màu 4 vị trí (index 0..3) ═══
export const STABLES = Object.freeze({
  RED:    [gc(1,1), gc(3,1), gc(1,3), gc(3,3)],
  YELLOW: [gc(11,1), gc(13,1), gc(11,3), gc(13,3)],
  GREEN:  [gc(1,11), gc(3,11), gc(1,13), gc(3,13)],
  BLUE:   [gc(11,11), gc(13,11), gc(11,13), gc(13,13)],
});

// ═══ VÙNG CHUỒNG (6×6 mỗi góc) ═══
export const STABLE_ZONES = Object.freeze({
  RED:    { col: 0, row: 0,  w: 6, h: 6 },
  YELLOW: { col: 9, row: 0,  w: 6, h: 6 },
  GREEN:  { col: 0, row: 9,  w: 6, h: 6 },
  BLUE:   { col: 9, row: 9,  w: 6, h: 6 },
});

// ═══ 52 Ô TRACK — đi theo chiều kim đồng hồ từ (1,6) ═══
export const TRACK = Object.freeze([
  // 0-4: hàng trên nhánh trái (đi sang phải)
  gc(1,6), gc(2,6), gc(3,6), gc(4,6), gc(5,6),
  // 5-10: cột trái nhánh trên (đi lên)
  gc(6,5), gc(6,4), gc(6,3), gc(6,2), gc(6,1), gc(6,0),
  // 11: đỉnh nhánh trên — RED home entry
  gc(7,0),
  // 12-17: cột phải nhánh trên (đi xuống)
  gc(8,0), gc(8,1), gc(8,2), gc(8,3), gc(8,4), gc(8,5),
  // 18-23: hàng trên nhánh phải (đi sang phải)
  gc(9,6), gc(10,6), gc(11,6), gc(12,6), gc(13,6), gc(14,6),
  // 24: đỉnh nhánh phải — YELLOW home entry
  gc(14,7),
  // 25-30: hàng dưới nhánh phải (đi sang trái)
  gc(14,8), gc(13,8), gc(12,8), gc(11,8), gc(10,8), gc(9,8),
  // 31-36: cột phải nhánh dưới (đi xuống)
  gc(8,9), gc(8,10), gc(8,11), gc(8,12), gc(8,13), gc(8,14),
  // 37: đỉnh nhánh dưới — GREEN home entry
  gc(7,14),
  // 38-43: cột trái nhánh dưới (đi lên)
  gc(6,14), gc(6,13), gc(6,12), gc(6,11), gc(6,10), gc(6,9),
  // 44-49: hàng dưới nhánh trái (đi sang trái)
  gc(5,8), gc(4,8), gc(3,8), gc(2,8), gc(1,8), gc(0,8),
  // 50: đỉnh nhánh trái — BLUE home entry
  gc(0,7),
  // 51: kết vòng
  gc(0,6),
]);

if (TRACK.length !== 52) console.error('TRACK length error:', TRACK.length);

// ═══ VỊ TRÍ XUẤT PHÁT (index track) ═══
export const START_INDEX = Object.freeze({
  RED: 0,      // (1,6)
  YELLOW: 13,  // (8,1)
  BLUE: 26,    // (13,8)
  GREEN: 39,   // (6,13)
});

// ═══ VỊ TRÍ XUẤT PHÁT (grid) ═══
export const STARTS = Object.freeze({
  RED:    gc(1,6),
  YELLOW: gc(8,1),
  BLUE:   gc(13,8),
  GREEN:  gc(6,13),
});

// ═══ ĐƯỜNG VỀ CHUỒNG — 6 ô mỗi màu (theo thứ tự từ ngoài vào trong) ═══
// Cell 1 = vào đầu tiên (gần tip), cell 6 = goal (giáp tâm)
export const HOME_PATHS = Object.freeze({
  RED:    [gc(7,1), gc(7,2), gc(7,3), gc(7,4), gc(7,5), gc(7,6)],
  YELLOW: [gc(13,7), gc(12,7), gc(11,7), gc(10,7), gc(9,7), gc(8,7)],
  GREEN:  [gc(1,7), gc(2,7), gc(3,7), gc(4,7), gc(5,7), gc(6,7)],
  BLUE:   [gc(7,13), gc(7,12), gc(7,11), gc(7,10), gc(7,9), gc(7,8)],
});

// ═══ Ô AN TOÀN — không bị đá ═══
// 4 ô xuất phát + 4 ô cách 8
export const SAFE_INDICES = Object.freeze([0, 8, 13, 21, 26, 34, 39, 47]);

// ═══ CHUYỂN ĐỔI TOẠ ĐỘ ═══
export function gridToWorld(col, row, cell = BOARD_CONFIG.CELL) {
  const h = BOARD_CONFIG.GRID / 2 - 0.5;
  return { x: (col - h) * cell, y: 0, z: (row - h) * cell };
}
export function worldToGrid(x, z, cell = BOARD_CONFIG.CELL) {
  const h = BOARD_CONFIG.GRID / 2 - 0.5;
  return { col: Math.round(x / cell + h), row: Math.round(z / cell + h) };
}

// ═══ TRA CỨU NGƯỢC (grid → mô tả) ═══
const _cache = new Map();
function buildCache() {
  if (_cache.size) return _cache;
  const add = (entry) => {
    const k = key(entry.col, entry.row);
    const cur = _cache.get(k);
    if (!cur) _cache.set(k, entry);
    else if (Array.isArray(cur)) cur.push(entry);
    else _cache.set(k, [cur, entry]);
  };
  for (const color of Object.keys(STABLES))
    STABLES[color].forEach((p, i) => add({ type: 'stable', color, index: i, ...p }));
  for (const color of Object.keys(STARTS))
    add({ type: 'start', color, trackIndex: START_INDEX[color], ...STARTS[color] });
  for (const color of Object.keys(HOME_PATHS))
    HOME_PATHS[color].forEach((p, i) => add({ type: 'home', color, step: i + 1, ...p }));
  TRACK.forEach((p, i) => add({
    type: 'track', index: i, safe: SAFE_INDICES.includes(i), ...p,
  }));
  return _cache;
}

export function whatIsAt(col, row) {
  buildCache();
  return _cache.get(key(col, row)) || null;
}

// ═══ "STEP" CONVENTION ═══
/**
 * step < 0     : trong chuồng (index = -step-1, 0..3)
 * step 0..51   : trên track (0 = ô xuất phát)
 * step 52..57  : trên home path (52 = ô home đầu tiên, 57 = goal)
 * step >= 58   : đã về đích (giữ ở goal)
 */
export const STEP_GOAL = 58;

export function getHorsePosition(color, step) {
  if (step < 0) {
    const idx = Math.min(3, Math.max(0, -step - 1));
    const p = STABLES[color][idx];
    return { type: 'stable', color, index: idx, step, ...gridToWorld(p.col, p.row) };
  }
  if (step <= 51) {
    const startIdx = START_INDEX[color];
    const trackIdx = (startIdx + step) % 52;
    const p = TRACK[trackIdx];
    return {
      type: 'track', color, trackIndex: trackIdx, step,
      safe: SAFE_INDICES.includes(trackIdx),
      ...gridToWorld(p.col, p.row),
    };
  }
  if (step <= 57) {
    const homeIdx = step - 52;
    const p = HOME_PATHS[color][homeIdx];
    return { type: 'home', color, step: homeIdx + 1, ...gridToWorld(p.col, p.row) };
  }
  const p = HOME_PATHS[color][5];
  return { type: 'goal', color, step: 58, ...gridToWorld(p.col, p.row) };
}

// ═══════════════════════════════════════════════════════════════
//  LỚP BOARD3D — hiển thị + tương tác + live playback
// ═══════════════════════════════════════════════════════════════
export class Board3D {
  constructor(opts = {}) {
    this.opts = {
      cell: BOARD_CONFIG.CELL,
      thickness: BOARD_CONFIG.THICKNESS,
      showNumbers: opts.showNumbers !== false,
      showTrack: opts.showTrack !== false,
      showStables: opts.showStables !== false,
      showHomePaths: opts.showHomePaths !== false,
      showStartMarkers: opts.showStartMarkers !== false,
      showCenter: opts.showCenter !== false,
      showGridLabels: opts.showGridLabels === true,
      ...opts,
    };
    this.root = new THREE.Group();
    this.root.name = 'Board3D';
    this._highlights = new Map();
    this._cellMeshes = new Map();
    this._pathPreview = [];
    this._disposables = [];
    this._build();
  }

  _build() {
    const cfg = BOARD_CONFIG;
    const c = this.opts.cell;
    const N = cfg.GRID;
    const size = N * c;

    // ── Mặt bàn ──
    const baseGeo = new THREE.BoxGeometry(size, this.opts.thickness, size);
    const baseMat = new THREE.MeshStandardMaterial({
      color: cfg.COLORS.BOARD_BG, roughness: 0.9, metalness: 0.05,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -this.opts.thickness / 2;
    base.receiveShadow = true;
    this.root.add(base);
    this._disposables.push(baseGeo, baseMat);

    // ── Viền bàn ──
    const edgeMat = new THREE.MeshStandardMaterial({
      color: cfg.COLORS.BOARD_EDGE, roughness: 0.5, metalness: 0.35,
    });
    const eT = c * 0.15, eH = this.opts.thickness + 0.15;
    for (const s of [
      { w: size + eT * 2, h: eH, d: eT, x: 0, z: -size / 2 - eT / 2 },
      { w: size + eT * 2, h: eH, d: eT, x: 0, z:  size / 2 + eT / 2 },
      { w: eT, h: eH, d: size, x: -size / 2 - eT / 2, z: 0 },
      { w: eT, h: eH, d: size, x:  size / 2 + eT / 2, z: 0 },
    ]) {
      const g = new THREE.BoxGeometry(s.w, s.h, s.d);
      const m = new THREE.Mesh(g, edgeMat);
      m.position.set(s.x, s.h / 2 - this.opts.thickness / 2, s.z);
      m.castShadow = true;
      this.root.add(m);
      this._disposables.push(g);
    }
    this._disposables.push(edgeMat);

    // ── Vùng chuồng ──
    if (this.opts.showStables)
      for (const color of Object.keys(STABLE_ZONES))
        this._buildStableZone(color, STABLE_ZONES[color]);

    // ── Ô track ──
    if (this.opts.showTrack) {
      TRACK.forEach((p, i) => {
        const isSafe = SAFE_INDICES.includes(i);
        this._buildCell(p.col, p.row, {
          color: isSafe ? cfg.COLORS.SAFE : cfg.COLORS.TRACK,
          emissive: isSafe ? 0x7c2d12 : 0x000000,
          emissiveIntensity: isSafe ? 0.25 : 0,
          name: `track_${i}`,
          key: key(p.col, p.row),
        });
      });
    }

    // ── Home path ──
    if (this.opts.showHomePaths) {
      for (const color of Object.keys(HOME_PATHS)) {
        HOME_PATHS[color].forEach((p, i) => {
          this._buildCell(p.col, p.row, {
            color: cfg.COLORS[color],
            name: `home_${color}_${i + 1}`,
            key: key(p.col, p.row),
            number: this.opts.showNumbers ? i + 1 : null,
          });
        });
      }
    }

    // ── Marker xuất phát ──
    if (this.opts.showStartMarkers)
      for (const color of Object.keys(STARTS))
        this._buildStartMarker(color, STARTS[color]);

    // ── Center ──
    if (this.opts.showCenter) this._buildCenter();

    // ── Grid labels (debug) ──
    if (this.opts.showGridLabels) this._buildGridLabels();
  }

  _buildCell(col, row, o = {}) {
    const c = this.opts.cell;
    const pad = c * 0.08;
    const sz = c - pad * 2;
    const geo = new THREE.BoxGeometry(sz, 0.06, sz);
    const mat = new THREE.MeshStandardMaterial({
      color: o.color ?? 0x334155,
      roughness: 0.7, metalness: 0.1,
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = gridToWorld(col, row, c);
    mesh.position.set(pos.x, 0.03, pos.z);
    mesh.receiveShadow = true;
    mesh.userData.grid = { col, row };
    mesh.userData.name = o.name;
    this.root.add(mesh);
    this._disposables.push(geo, mat);
    if (o.key) this._cellMeshes.set(o.key, mesh);

    if (o.number != null) {
      const tex = this._numberTexture(String(o.number));
      const g2 = new THREE.PlaneGeometry(sz * 0.55, sz * 0.55);
      const m2 = new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false,
      });
      const n = new THREE.Mesh(g2, m2);
      n.rotation.x = -Math.PI / 2;
      n.position.set(pos.x, 0.065, pos.z);
      this.root.add(n);
      this._disposables.push(g2, m2, tex);
    }
    return mesh;
  }

  _numberTexture(text) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 92px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 68);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _buildStableZone(color, z) {
    const c = this.opts.cell;
    const w = z.w * c, h = z.h * c;
    const h2 = BOARD_CONFIG.GRID / 2 - 0.5;
    const cx = (z.col + z.w / 2 - 0.5 - h2) * c;
    const cz = (z.row + z.h / 2 - 0.5 - h2) * c;

    const geo = new THREE.BoxGeometry(w - c * 0.15, 0.08, h - c * 0.15);
    const mat = new THREE.MeshStandardMaterial({
      color: BOARD_CONFIG.COLORS[color],
      roughness: 0.55, metalness: 0.1,
      transparent: true, opacity: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, 0.04, cz);
    this.root.add(mesh);
    this._disposables.push(geo, mat);

    // Vòng tròn trang trí
    const rg = new THREE.RingGeometry(c * 2.1, c * 2.4, 64);
    const rm = new THREE.MeshBasicMaterial({
      color: BOARD_CONFIG.COLORS[color],
      side: THREE.DoubleSide, transparent: true, opacity: 0.7,
    });
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(cx, 0.09, cz);
    this.root.add(ring);
    this._disposables.push(rg, rm);
  }

  _buildStartMarker(color, p) {
    const c = this.opts.cell;
    const pos = gridToWorld(p.col, p.row, c);
    const g = new THREE.RingGeometry(c * 0.32, c * 0.46, 32);
    const m = new THREE.MeshBasicMaterial({
      color: BOARD_CONFIG.COLORS[color],
      side: THREE.DoubleSide, transparent: true, opacity: 0.95,
    });
    const r = new THREE.Mesh(g, m);
    r.rotation.x = -Math.PI / 2;
    r.position.set(pos.x, 0.08, pos.z);
    this.root.add(r);
    this._disposables.push(g, m);
  }

  _buildCenter() {
    const c = this.opts.cell;
    const p = gridToWorld(7, 7, c);
    const g = new THREE.CircleGeometry(c * 1.6, 32);
    const m = new THREE.MeshStandardMaterial({
      color: 0x0f172a, roughness: 0.5, metalness: 0.5,
      emissive: 0xf59e0b, emissiveIntensity: 0.15,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.07, p.z);
    this.root.add(mesh);
    this._disposables.push(g, m);
  }

  _buildGridLabels() {
    for (let col = 0; col < BOARD_CONFIG.GRID; col++) {
      for (let row = 0; row < BOARD_CONFIG.GRID; row++) {
        if (col % 5 !== 0 && row % 5 !== 0) continue;
        const p = gridToWorld(col, row, this.opts.cell);
        const cv = document.createElement('canvas');
        cv.width = cv.height = 64;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = 'bold 24px system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${col},${row}`, 32, 32);
        const t = new THREE.CanvasTexture(cv);
        const g = new THREE.PlaneGeometry(0.6, 0.6);
        const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
        const mesh = new THREE.Mesh(g, m);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(p.x, 0.5, p.z);
        this.root.add(mesh);
        this._disposables.push(g, m, t);
      }
    }
  }

  // ═══ API PUBLIC ═══
  addTo(parent) { parent.add(this.root); return this; }
  removeFrom() { this.root.removeFromParent(); return this; }
  setVisible(v) { this.root.visible = v; return this; }

  getWorldPosition(col, row) { return gridToWorld(col, row, this.opts.cell); }
  getHorsePosition(color, step) { return getHorsePosition(color, step); }
  getTrackPosition(index) {
    const p = TRACK[((index % 52) + 52) % 52];
    return gridToWorld(p.col, p.row, this.opts.cell);
  }
  getStablePosition(color, i) {
    const p = STABLES[color][i];
    return gridToWorld(p.col, p.row, this.opts.cell);
  }
  getHomePathPosition(color, step1to6) {
    const i = Math.max(0, Math.min(5, step1to6 - 1));
    const p = HOME_PATHS[color][i];
    return gridToWorld(p.col, p.row, this.opts.cell);
  }
  getStartPosition(color) {
    const p = STARTS[color];
    return gridToWorld(p.col, p.row, this.opts.cell);
  }

  /** Highlight một ô (col,row). */
  highlight(col, row, o = {}) {
    this.unhighlight(col, row);
    const c = this.opts.cell;
    const p = gridToWorld(col, row, c);
    const color = o.color ?? BOARD_CONFIG.COLORS.HIGHLIGHT;
    const g = new THREE.RingGeometry(c * 0.35, c * 0.48, 32);
    const m = new THREE.MeshBasicMaterial({
      color, side: THREE.DoubleSide,
      transparent: true, opacity: o.opacity ?? 0.9, depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(p.x, 0.1, p.z);
    mesh.renderOrder = 100;
    this.root.add(mesh);
    this._highlights.set(key(col, row), { mesh, geo: g, mat: m });
    return this;
  }

  unhighlight(col, row) {
    const k = key(col, row);
    const h = this._highlights.get(k);
    if (!h) return this;
    h.mesh.parent?.remove(h.mesh);
    h.geo.dispose(); h.mat.dispose();
    this._highlights.delete(k);
    return this;
  }

  clearHighlights() {
    for (const h of this._highlights.values()) {
      h.mesh.parent?.remove(h.mesh);
      h.geo.dispose(); h.mat.dispose();
    }
    this._highlights.clear();
    return this;
  }

  /** Preview đường đi cho quân sắp di chuyển. */
  showPathPreview(color, fromStep, diceValue, opts = {}) {
    this.clearPathPreview();
    const colorCode = opts.color ?? BOARD_CONFIG.COLORS.MOVE_PATH;
    for (let i = 0; i < diceValue; i++) {
      const step = fromStep + i + 1;
      const pos = getHorsePosition(color, step);
      const c = this.opts.cell;
      const g = new THREE.RingGeometry(c * 0.3, c * 0.42, 24);
      const m = new THREE.MeshBasicMaterial({
        color: colorCode, side: THREE.DoubleSide,
        transparent: true, opacity: 0.55, depthWrite: false,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(pos.x, 0.09, pos.z);
      mesh.renderOrder = 90;
      this.root.add(mesh);
      this._pathPreview.push({ mesh, geo: g, mat: m });
    }
    return this;
  }

  clearPathPreview() {
    for (const h of this._pathPreview) {
      h.mesh.parent?.remove(h.mesh);
      h.geo.dispose(); h.mat.dispose();
    }
    this._pathPreview = [];
    return this;
  }

  showStartCells(on = true) {
    for (const color of Object.keys(STARTS)) {
      const p = STARTS[color];
      if (on) this.highlight(p.col, p.row, {
        color: BOARD_CONFIG.COLORS[color], opacity: 0.8,
      });
      else this.unhighlight(p.col, p.row);
    }
    return this;
  }

  update(time) {
    for (const h of this._highlights.values()) {
      if (h.mat.userData?.pulse) {
        h.mat.opacity = 0.5 + 0.5 * Math.sin(time * 4);
      }
    }
  }

  dispose() {
    this.clearHighlights();
    this.clearPathPreview();
    for (const d of this._disposables) d.dispose?.();
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
    });
    this.root.removeFromParent();
  }
}

export default Board3D;
