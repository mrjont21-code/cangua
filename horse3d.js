/**
 * horse3d.js — MODULE QUÂN NGỰA 3D CHUẨN (tái sử dụng cho toàn bộ game)
 * Gốc hình học: dichuyen.html (đế 3 tầng + đai vàng + đầu ngựa extrude + mắt).
 *
 * ═══ HAI ĐIỂM NEO ═══════════════════════════════════════════════
 *  1) BASE   = tâm đáy đế  → gán VỊ TRÍ (setPosition / moveTo / jump)
 *              Toạ độ (0,0,0) cục bộ của root. Đổi size không làm lệch điểm này.
 *  2) CENTER = tâm giữa    → tâm XOAY 360° (spin / flip / nghiêng)
 *              Nằm trên trục dọc đi qua BASE, ở nửa chiều cao quân.
 *
 * ═══ CÁCH DÙNG ══════════════════════════════════════════════════
 *  import { Horse3D, HEADING } from './horse3d.js';
 *  const horse = new Horse3D({ color: 0xdc2626, material: 'plastic', size: 1 });
 *  horse.addTo(scene);
 *  horse.setPosition(10, 0, 5).setHeading(HEADING.NORTH);
 *  horse.setView(camera, 'threeQuarter');          // đặt camera quanh quân
 *  await horse.play('jump', { to: { x: 26, z: 5 }, height: 4.6 });
 *  await horse.play('spin', { turns: 1 });         // xoay 360° quanh CENTER
 *  // trong vòng lặp render:  horse.update(dt);
 *
 * ═══ QUY ƯỚC TOẠ ĐỘ (kích thước gốc: đường kính đế = 8 đơn vị) ══
 *  • Y hướng lên. Nhìn từ trên xuống: +X sang phải, -Z lên trên.
 *  • heading (độ) quay quanh trục Y, 0 = mũi ngựa hướng +X, tăng dần = ngược chiều kim đồng hồ.
 *  • Mặt phải của ngựa (khi nhìn theo hướng mũi) là phía +Z (khi heading = 0).
 */
import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** Thông số chuẩn của quân (không đổi — mọi nơi trong game dùng chung). */
export const HORSE_STANDARD = Object.freeze({
  BASE_DIAMETER: 8,     // đường kính đáy đế ở size = 1
  PEDESTAL_TOP: 2.6,    // độ cao mặt trên đế (chỗ đặt cổ ngựa)
  UPPER_SCALE: 1.5,     // tỉ lệ phần ngựa so với đế
  ACCENT: 0xf59e0b,     // màu đai vàng mặc định
});

/** Hướng quy ước nhìn từ trên xuống (độ). */
export const HEADING = Object.freeze({ EAST: 0, NORTH: 90, WEST: 180, SOUTH: -90 });

/** Góc nhìn dựng sẵn. az: 0 = nhìn vào mặt trước (mũi), 90 = bên trái, -90 = bên phải, 180 = phía sau. el: góc nâng (độ). */
export const VIEWS = Object.freeze({
  front: { az: 0, el: 8 },
  back: { az: 180, el: 8 },
  left: { az: 90, el: 8 },
  right: { az: -90, el: 8 },
  top: { az: 0, el: 89 },
  threeQuarter: { az: -45, el: 25 },
  video: { az: -80, el: 30 },     // góc máy của dichuyen.html
});

const EASE = {
  linear: (t) => t,
  in: (t) => t * t,
  out: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

// ─── Hình học & vật liệu dùng chung (tạo 1 lần cho mọi quân) ───────────
let SHARED = null;

function createHorseShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.9, -0.2);
  s.bezierCurveTo(-1.3, 1.5, -1.4, 3.2, -0.9, 4.6);
  s.bezierCurveTo(-1.0, 5.4, -0.8, 6.2, -0.3, 6.6);
  s.lineTo(-0.1, 6.7);
  s.bezierCurveTo(0.0, 5.9, 0.3, 5.5, 0.7, 5.3);
  s.bezierCurveTo(1.3, 5.0, 2.3, 4.3, 2.7, 3.6);
  s.bezierCurveTo(2.8, 3.1, 2.3, 2.8, 1.8, 2.9);
  s.bezierCurveTo(1.4, 2.7, 1.0, 2.3, 0.8, 1.7);
  s.bezierCurveTo(0.6, 0.9, 0.7, 0.3, 0.8, -0.2);
  s.closePath();
  return s;
}

function getShared() {
  if (SHARED) return SHARED;
  const horseGeo = new THREE.ExtrudeGeometry(createHorseShape(), {
    steps: 2, depth: 1.4, bevelEnabled: true,
    bevelThickness: 0.35, bevelSize: 0.3, bevelOffset: 0, bevelSegments: 8,
  });
  horseGeo.center();
  horseGeo.computeBoundingBox();
  SHARED = {
    horseGeo,
    bot: new THREE.CylinderGeometry(3.6, 4.0, 0.8, 48),
    mid: new THREE.CylinderGeometry(3.0, 3.4, 0.6, 48),
    top: new THREE.CylinderGeometry(2.4, 3.0, 1.2, 48),
    belt: new THREE.TorusGeometry(3.2, 0.15, 16, 48),
    eye: {
      socket: new THREE.SphereGeometry(0.43, 40, 28),
      ball: new THREE.SphereGeometry(0.34, 48, 32),
      pupil: new THREE.SphereGeometry(0.145, 32, 24),
      iris: new THREE.RingGeometry(0.17, 0.265, 48),
      glint1: new THREE.SphereGeometry(0.072, 20, 16),
      glint2: new THREE.SphereGeometry(0.032, 16, 12),
    },
    eyeMat: {
      ball: new THREE.MeshPhysicalMaterial({ color: 0x5b3518, roughness: 0.12, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.04 }),
      pupil: new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
      iris: new THREE.MeshBasicMaterial({ color: 0x8a4b20, side: THREE.DoubleSide }),
      glint: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    },
    dims: null,
  };
  return SHARED;
}

function makeMaterial(color, type) {
  switch (type) {
    case 'plastic':
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, reflectivity: 0.9 });
    case 'wood':
      return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0 });
    case 'metal':   // kim loại theo màu tuỳ chọn
      return new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.9 });
    case 'gold':    // vàng cố định, bỏ qua color
      return new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.15, metalness: 0.9 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color, roughness: 0.1, metalness: 0.1, transmission: 0.6, opacity: 0.9, transparent: true, ior: 1.5, thickness: 2 });
    default:
      return new THREE.MeshStandardMaterial({ color });
  }
}

/** Mắt ngựa. side = +1 (mặt +Z) hoặc -1 (mặt -Z) → nhìn từ mọi góc đều thấy mắt. */
function buildEye(sh, socketMat, side) {
  const g = new THREE.Group();
  g.position.set(0.78, 0.98, 0.56 * side);
  g.rotation.y = side > 0 ? -0.08 : Math.PI + 0.08;
  g.scale.setScalar(1.65);
  const sx = side; // quay π làm lật trục x cục bộ → đảo dấu các độ lệch theo x
  const add = (geo, mat, sc, pos, rotScaleY) => {
    const m = new THREE.Mesh(geo, mat);
    if (sc) m.scale.set(...sc);
    m.position.set(...pos);
    g.add(m);
    return m;
  };
  add(sh.eye.socket, socketMat, [1, 0.82, 0.34], [0, 0, 0.10]);
  add(sh.eye.ball, sh.eyeMat.ball, [1, 0.92, 0.55], [0, 0, 0.16]);
  add(sh.eye.pupil, sh.eyeMat.pupil, [1, 1.08, 0.45], [0.025 * sx, -0.005, 0.40]);
  add(sh.eye.iris, sh.eyeMat.iris, [1, 0.92, 1], [0, 0, 0.39]);
  add(sh.eye.glint1, sh.eyeMat.glint, null, [-0.09 * sx, 0.105, 0.56]);
  add(sh.eye.glint2, sh.eyeMat.glint, null, [0.105 * sx, -0.015, 0.55]);
  return g;
}

const newAcc = () => ({ x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, hd: 0, nz: 0, ny: 0 });
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const pt = (p) => (p ? { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 } : null);

// ─── Lớp chính ────────────────────────────────────────────────────────
export class Horse3D {
  /**
   * @param {object} o
   *  color (hex), material ('plastic'|'wood'|'metal'|'gold'|'glass'), accent (hex đai),
   *  size (hệ số, 1 = đế rộng 8), heading (độ), position ({x,y,z}), shadows (mặc định true)
   */
  constructor(o = {}) {
    const sh = getShared();
    this.color = o.color ?? 0xdc2626;
    this.materialType = o.material ?? 'plastic';
    this.accent = o.accent ?? HORSE_STANDARD.ACCENT;
    this.size = 1;
    this.state = { pos: new THREE.Vector3(), heading: 0 };   // heading: radian
    this._tracks = [];
    this._ev = {};
    this._acc = newAcc();
    this._markers = null;

    this.mat = makeMaterial(this.color, this.materialType);
    this.socketMat = new THREE.MeshPhysicalMaterial({ roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.beltMat = new THREE.MeshStandardMaterial({ color: this.accent, metalness: 0.8, roughness: 0.2 });
    this._bodyMeshes = [];
    const shadows = o.shadows !== false;

    // --- model: toạ độ gốc = tâm đáy đế ---
    const model = new THREE.Group();
    model.name = 'HorseModel';
    const body = (geo, y) => {
      const m = new THREE.Mesh(geo, this.mat);
      m.position.y = y;
      m.castShadow = m.receiveShadow = shadows;
      model.add(m);
      this._bodyMeshes.push(m);
    };
    body(sh.bot, 0.4); body(sh.mid, 1.1); body(sh.top, 2.0);
    const belt = new THREE.Mesh(sh.belt, this.beltMat);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.8;
    model.add(belt);

    // neck: khớp cổ tại mặt đế → dùng cho gật / lắc đầu
    this.neck = new THREE.Group();
    this.neck.name = 'Neck';
    this.neck.position.y = HORSE_STANDARD.PEDESTAL_TOP;
    model.add(this.neck);
    const upper = new THREE.Group();
    upper.scale.setScalar(HORSE_STANDARD.UPPER_SCALE);
    upper.position.y = -sh.horseGeo.boundingBox.min.y * HORSE_STANDARD.UPPER_SCALE;
    this.neck.add(upper);
    const head = new THREE.Mesh(sh.horseGeo, this.mat);
    head.position.x = 0.75;
    head.castShadow = head.receiveShadow = shadows;
    upper.add(head);
    this._bodyMeshes.push(head);
    head.add(buildEye(sh, this.socketMat, 1), buildEye(sh, this.socketMat, -1));

    // --- kích thước chuẩn (đo 1 lần) ---
    if (!sh.dims) {
      const b = new THREE.Box3().setFromObject(model);
      const height = b.max.y - b.min.y;
      const cy = b.min.y + height / 2;
      let r = 0;
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        r = Math.max(r, Math.hypot(x, y - cy, z));
      }
      sh.dims = { height, centerY: cy, radius: r, baseDiameter: HORSE_STANDARD.BASE_DIAMETER };
    }
    this.dims = sh.dims;

    // --- cây phân cấp: root(BASE) → pivot(CENTER) → model ---
    this.root = new THREE.Group();
    this.root.name = 'Horse3D';
    this.root.userData.horse3d = this;
    this.pivot = new THREE.Group();
    this.pivot.name = 'Pivot';
    this.pivot.position.y = this.dims.centerY;
    this.root.add(this.pivot);
    model.position.y = -this.dims.centerY;
    this.pivot.add(model);
    this.anchors = { base: new THREE.Object3D(), center: new THREE.Object3D() };
    this.anchors.base.name = 'ANCHOR_BASE';
    this.anchors.center.name = 'ANCHOR_CENTER';
    this.root.add(this.anchors.base);
    this.pivot.add(this.anchors.center);

    this._syncColors();
    this.configure({ size: o.size, heading: o.heading, position: o.position });
  }

  // ═══ Cấu hình nhanh ═══
  configure(o = {}) {
    if (o.material) this.setMaterial(o.material);
    if (o.color != null) this.setColor(o.color);
    if (o.accent != null) this.setAccent(o.accent);
    if (o.size != null) this.setSize(o.size);
    if (o.heading != null) this.setHeading(o.heading);
    if (o.position) this.setPosition(o.position);
    return this;
  }

  // ═══ Màu / vật liệu / kích thước ═══
  _syncColors() {
    const c = this.materialType === 'gold' ? 0xf59e0b : this.color;
    this.mat.color.set(c);
    this.socketMat.color.set(c);
  }
  setColor(hex) { this.color = hex; this._syncColors(); return this; }
  setAccent(hex) { this.accent = hex; this.beltMat.color.set(hex); return this; }
  setMaterial(type) {
    if (type === this.materialType) return this;
    this.materialType = type;
    const old = this.mat;
    this.mat = makeMaterial(this.color, type);
    this._bodyMeshes.forEach((m) => { m.material = this.mat; });
    old.dispose();
    this._syncColors();
    return this;
  }
  /** size = hệ số tỉ lệ đều quanh tâm đáy đế (1 → đế rộng 8 đơn vị). */
  setSize(s) { this.size = s; this.root.scale.setScalar(s); return this; }
  /** Đặt kích thước theo đường kính đế mong muốn (vd. bằng 1 ô cờ). */
  setBaseDiameter(d) { return this.setSize(d / HORSE_STANDARD.BASE_DIAMETER); }
  setVisible(v) { this.root.visible = v; return this; }

  // ═══ Vị trí (gán theo tâm đáy đế) & hướng ═══
  setPosition(x, y, z) {
    if (typeof x === 'object') { y = x.y ?? 0; z = x.z ?? 0; x = x.x ?? 0; }
    this.state.pos.set(x ?? 0, y ?? 0, z ?? 0);
    this._apply(this._acc);
    return this;
  }
  setHeading(deg) { this.state.heading = deg * DEG; this._apply(this._acc); return this; }
  /** Quay mặt về một điểm trên mặt phẳng XZ. */
  faceTo(x, z) {
    if (typeof x === 'object') { z = x.z; x = x.x; }
    const dx = x - this.state.pos.x, dz = z - this.state.pos.z;
    if (Math.hypot(dx, dz) > 1e-6) this.state.heading = Math.atan2(-dz, dx);
    this._apply(this._acc);
    return this;
  }
  get headingDeg() { return this.state.heading / DEG; }

  /** Vị trí thế giới của tâm đáy đế. */
  getBasePosition(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.anchors.base.getWorldPosition(out); }
  /** Vị trí thế giới của tâm giữa (tâm xoay 360°). */
  getCenterPosition(out = new THREE.Vector3()) { this.root.updateMatrixWorld(true); return this.anchors.center.getWorldPosition(out); }
  /** Kích thước thực tế (đã nhân size). */
  getDimensions() {
    const s = this.size;
    return { baseDiameter: this.dims.baseDiameter * s, height: this.dims.height * s, centerHeight: this.dims.centerY * s, radius: this.dims.radius * s };
  }

  // ═══ Góc nhìn ═══
  /**
   * Đặt camera quanh tâm giữa của quân.
   * @param view  tên trong VIEWS hoặc {az, el}
   * @param o     { az, el, distance, relative=true (az tính theo hướng quân; false = theo trục thế giới) }
   */
  setView(camera, view = 'threeQuarter', o = {}) {
    const v = typeof view === 'string' ? (VIEWS[view] || VIEWS.threeQuarter) : view;
    const az = (o.az ?? v.az ?? 0) * DEG, el = (o.el ?? v.el ?? 20) * DEG;
    const c = this.getCenterPosition();
    const dist = o.distance ?? this._fitDistance(camera);
    const a = (o.relative === false ? 0 : this.state.heading) + az;
    camera.position.set(
      c.x + Math.cos(a) * Math.cos(el) * dist,
      c.y + Math.sin(el) * dist,
      c.z - Math.sin(a) * Math.cos(el) * dist,
    );
    camera.lookAt(c);
    return camera;
  }
  _fitDistance(camera) {
    const R = this.dims.radius * this.size;
    if (!camera.isPerspectiveCamera) return R * 4;
    const fv = camera.fov * DEG;
    const fh = 2 * Math.atan(Math.tan(fv / 2) * camera.aspect);
    return (R / Math.sin(Math.min(fv, fh) / 2)) * 1.1;
  }

  // ═══ Hành động ═══
  /**
   * Chạy 1 hành động, trả về Promise<boolean> (true = hoàn tất, false = bị dừng).
   *  'jump'  { to:{x,z}, height=4.6, duration=1.15, tilt=0.2, twist=0.18, face=true }
   *  'move'  { to:{x,z}, duration | speed=10, face=true }
   *  'turn'  { heading(độ) | to:{x,z}, duration=0.5 }
   *  'spin'  { turns=1, duration=1.4, reverse=false }  xoay quanh trục dọc qua CENTER
   *  'flip'  { turns=1, duration=1.0, side=false }     lộn nhào quanh CENTER
   *  'nod'   { times=2, amp=0.28, duration=0.9 }       gật đầu
   *  'shake' { times=3, amp=0.35, duration=0.9 }       lắc đầu
   *  'idle'  { duration=2.4 }                          thở nhẹ, lặp tới khi stop('idle')
   * Mọi hành động nhận thêm: ease ('linear'|'in'|'out'|'inOut'), loop, delay.
   */
  play(name, o = {}) {
    const def = ACTIONS[name];
    if (!def) return Promise.reject(new Error(`Horse3D: hành động không tồn tại "${name}"`));
    return new Promise((resolve) => {
      const tr = def(this, o);
      tr.name = name; tr.o = o; tr.t0 = -(o.delay ?? 0); tr.resolve = resolve;
      tr.dur = tr.dur ?? o.duration ?? 1;
      tr.ease = EASE[o.ease] || (typeof o.ease === 'function' ? o.ease : tr.ease || EASE.inOut);
      tr.loop = o.loop ?? tr.loop ?? false;
      this._tracks.push(tr);
      this._emit('start', { action: name });
    });
  }
  /** Dừng hành động theo tên (hoặc tất cả). Không chốt vị trí đích. */
  stop(name) {
    this._tracks = this._tracks.filter((tr) => {
      if (name && tr.name !== name) return true;
      tr.resolve(false);
      return false;
    });
    return this;
  }
  get busy() { return this._tracks.some((t) => !t.loop); }

  /** Gọi mỗi khung hình với dt (giây). */
  update(dt) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    const acc = this._acc = newAcc();
    for (const tr of this._tracks.slice()) {
      tr.t0 += dt;
      if (tr.t0 < 0) continue;
      let t = tr.t0 / tr.dur;
      if (tr.loop) t %= 1;
      if (t >= 1 && !tr.loop) {
        this._tracks.splice(this._tracks.indexOf(tr), 1);
        tr.end?.(this);
        tr.resolve(true);
        this._emit('end', { action: tr.name });
        if (tr.landed) this._emit('land', { action: tr.name, position: this.state.pos.clone() });
      } else {
        tr.step(t, acc, tr.ease(t), this);
      }
    }
    this._apply(acc);
  }
  _apply(acc) {
    const s = this.state;
    this.root.position.set(s.pos.x + acc.x, s.pos.y + acc.y, s.pos.z + acc.z);
    this.root.rotation.y = s.heading + acc.hd;
    this.pivot.rotation.set(acc.rx, acc.ry, acc.rz);
    this.neck.rotation.set(0, acc.ny, acc.nz);
  }

  // ═══ Sự kiện: 'start' | 'end' | 'land' (kết thúc jump) ═══
  on(evt, fn) { (this._ev[evt] ||= new Set()).add(fn); return () => this._ev[evt].delete(fn); }
  off(evt, fn) { this._ev[evt]?.delete(fn); return this; }
  _emit(evt, data) { this._ev[evt]?.forEach((f) => f(data, this)); }

  // ═══ Hiển thị 2 điểm neo để kiểm tra (đỏ = BASE, xanh = CENTER) ═══
  showAnchors(on = true) {
    if (on && !this._markers) {
      const mk = (parent, color) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
        m.renderOrder = 999; parent.add(m); return m;
      };
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, this.dims.centerY, 0)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
      );
      line.renderOrder = 999; this.root.add(line);
      this._markers = [mk(this.anchors.base, 0xef4444), mk(this.anchors.center, 0x22c55e), line];
    }
    this._markers?.forEach((m) => { m.visible = on; });
    return this;
  }

  // ═══ Thêm / gỡ / giải phóng ═══
  addTo(parent) { parent.add(this.root); return this; }
  removeFrom() { this.root.removeFromParent(); return this; }
  dispose() {
    this.stop(); this.removeFrom();
    this.mat.dispose(); this.socketMat.dispose(); this.beltMat.dispose();
    this._markers?.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
  }
}

// ─── Bảng hành động: mỗi hành động trả về { dur, step(t, acc, k, h), end(h) } ───
const faceDelta = (h, dx, dz) => (Math.hypot(dx, dz) > 1e-6 ? wrapPi(Math.atan2(-dz, dx) - h.state.heading) : 0);

function travel(h, o, defaults) {
  const from = h.state.pos.clone();
  const to = pt(o.to) || { x: from.x, y: from.y, z: from.z };
  const dest = new THREE.Vector3(to.x, o.to?.y ?? from.y, to.z);
  const delta = o.face === false ? 0 : faceDelta(h, dest.x - from.x, dest.z - from.z);
  const dist = from.distanceTo(dest);
  return { from, dest, delta, dist, apply: (acc, k, t) => {
    acc.x += (dest.x - from.x) * k; acc.y += (dest.y - from.y) * k; acc.z += (dest.z - from.z) * k;
    acc.hd += delta * EASE.out(Math.min(1, t / 0.3));
  }, commit: () => { h.state.pos.copy(dest); h.state.heading = wrapPi(h.state.heading + delta); } };
}

const ACTIONS = {
  jump(h, o) {
    const m = travel(h, o);
    const height = (o.height ?? 4.6) * h.size, tilt = o.tilt ?? 0.2, twist = o.twist ?? 0.18;
    return {
      dur: o.duration ?? 1.15, ease: EASE.out, landed: true,
      step(t, acc, k) {
        const arc = Math.sin(Math.PI * t);
        m.apply(acc, k, t);
        acc.y += arc * height;
        acc.rx += arc * tilt; acc.ry += arc * twist;
      },
      end: () => m.commit(),
    };
  },
  move(h, o) {
    const m = travel(h, o);
    return { dur: o.duration ?? Math.max(0.4, m.dist / (o.speed ?? 10)), step: (t, acc, k) => m.apply(acc, k, t), end: () => m.commit() };
  },
  turn(h, o) {
    const dest = o.heading != null ? o.heading * DEG : (o.to ? Math.atan2(-(o.to.z - h.state.pos.z), o.to.x - h.state.pos.x) : h.state.heading);
    const delta = wrapPi(dest - h.state.heading);
    return { dur: o.duration ?? 0.5, step: (t, acc, k) => { acc.hd += delta * k; }, end: () => { h.state.heading = wrapPi(h.state.heading + delta); } };
  },
  spin(h, o) {
    const a = (o.turns ?? 1) * TAU * (o.reverse ? -1 : 1);
    return { dur: o.duration ?? 1.4, step: (t, acc, k) => { acc.hd += a * k; }, end: () => { h.state.heading = wrapPi(h.state.heading + a); } };
  },
  flip(h, o) {
    const a = (o.turns ?? 1) * TAU;
    return { dur: o.duration ?? 1.0, step: (t, acc, k) => { if (o.side) acc.rx += a * k; else acc.rz -= a * k; } };
  },
  nod: (h, o) => ({ dur: o.duration ?? 0.9, step: (t, acc) => { acc.nz -= (o.amp ?? 0.28) * (1 - Math.cos(t * TAU * (o.times ?? 2))) / 2; } }),
  shake: (h, o) => ({ dur: o.duration ?? 0.9, step: (t, acc) => { acc.ny += (o.amp ?? 0.35) * Math.sin(t * TAU * (o.times ?? 3)) * Math.sin(Math.PI * t); } }),
  idle: (h, o) => ({ dur: o.duration ?? 2.4, loop: true, ease: EASE.linear, step: (t, acc) => { acc.y += 0.12 * h.size * Math.sin(t * TAU); acc.nz += 0.03 * Math.sin(t * TAU + 1); } }),
};

export default Horse3D;
