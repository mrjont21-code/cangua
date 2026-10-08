// ============================================================================
// dice6d.js — Viên xúc sắc 6 mặt 3D (module Three.js)
// ----------------------------------------------------------------------------
// Đặc điểm:
//   • Đủ 6 mặt theo chuẩn xúc sắc (tổng 2 mặt đối diện = 7):
//       +Y=1  -Y=6   +Z=2  -Z=5   +X=3  -X=4
//   • Thân hình lập phương bo tròn cả cạnh lẫn đỉnh (RoundedBoxGeometry).
//   • Chấm (pip) trên mặt có thể phóng to theo tuỳ chọn (mặc định gấp đôi).
//   • API quay về một mặt xác định: mỗi lần gọi cùng một mặt kết quả nhưng
//     quỹ đạo quay KHÁC NHAU (trục quay, số vòng, hướng đều ngẫu nhiên).
//
// CÁCH DÙNG (trong module script):
//   import * as THREE from 'three';
//   import { Dice6D } from './dice6d.js';
//
//   const dice = new Dice6D({ size: 1.22, radius: 0.22, dotScale: 2 });
//   dice.group.position.set(0, 1.12, 0);
//   scene.add(dice.group);
//
//   // 1) Gọi quay về một mặt cụ thể (1..6) — quỹ đạo random mỗi lần
//   dice.rollTo(6, {
//     duration: 3000,
//     onDone: (face) => console.log('Kết quả:', face)
//   });
//
//   // 2) Quay ngẫu nhiên — trả về mặt kết quả ngay, onDone gọi khi dừng
//   const ketQua = dice.roll({ duration: 2600, onDone: (f) => {...} });
//
//   // 3) Đặt ngay lập tức một mặt (không quay)
//   dice.showFace(3);
//
//   // 4) Các tiện ích
//   dice.getFace();      // mặt hiện tại (1..6)
//   dice.isRolling();    // có đang quay không
//   dice.stop();         // dừng ngay giữa chừng
//   dice.dispose();      // giải phóng tài nguyên
// ============================================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);

// Vector pháp tuyến (local) của từng mặt trong tư thế gốc (identity).
export const FACE_NORMALS = {
  1: new THREE.Vector3(0, 1, 0),
  2: new THREE.Vector3(0, 0, 1),
  3: new THREE.Vector3(1, 0, 0),
  4: new THREE.Vector3(-1, 0, 0),
  5: new THREE.Vector3(0, 0, -1),
  6: new THREE.Vector3(0, -1, 0),
};

// Quaternion đích CỐ ĐỊNH để mặt N hướng lên +Y (xoay bội số π/2 quanh trục chính).
const qAxis = (axis, ang) => new THREE.Quaternion().setFromAxisAngle(axis, ang);
const FACE_TARGETS = {
  1: new THREE.Quaternion(),               // mặt 1 đã sẵn ở +Y
  2: qAxis(AX, -Math.PI / 2),              // +Z  -> +Y
  3: qAxis(AZ, Math.PI / 2),               // +X  -> +Y
  4: qAxis(AZ, -Math.PI / 2),              // -X  -> +Y
  5: qAxis(AX, Math.PI / 2),               // -Z  -> +Y
  6: qAxis(AX, Math.PI),                   // -Y  -> +Y
};

const FACES = [1, 2, 3, 4, 5, 6];

// Vẽ hình chữ nhật bo góc (dùng arcTo để tương thích mọi trình duyệt)
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export class Dice6D {
  /**
   * @param {object} [o]
   * @param {number} [o.size=1.22]       kích thước cạnh khối lập phương
   * @param {number} [o.radius=0.22]     bán kính bo tròn cạnh + đỉnh
   * @param {number} [o.segments=18]    độ mượt của phần bo tròn
   * @param {number} [o.dotScale=2]     hệ số đường kính chấm (1 = gốc, 2 = gấp đôi)
   * @param {number} [o.bodyColor=0xf1e8d7]
   * @param {number} [o.anisotropy=1]   chất lượng texture (truyền maxAnisotropy của renderer)
   */
  constructor(o = {}) {
    this.size = o.size ?? 1.22;
    this.radius = o.radius ?? 0.22;
    this.segments = o.segments ?? 18;
    this.dotScale = o.dotScale ?? 2;
    this.bodyColor = o.bodyColor ?? 0xf1e8d7;
    this.roughness = o.roughness ?? 0.36;
    this.metalness = o.metalness ?? 0.03;
    this.anisotropy = o.anisotropy ?? 1;
    this.faceGap = o.faceGap ?? 0.008;
    // Mặt phẳng đặt vừa trong phần còn phẳng của khối đã bo tròn
    this.faceSize = Math.max(0.1, this.size - 2 * this.radius - 0.06);

    this.group = new THREE.Group();
    this._currentFace = 1;
    this._rollToken = 0;
    this._rolling = false;

    this._buildBody();
    this._buildFaces();
  }

  // ---------- dựng hình ----------
  _buildBody() {
    const geo = new RoundedBoxGeometry(
      this.size, this.size, this.size, this.segments, this.radius
    );
    const mat = new THREE.MeshStandardMaterial({
      color: this.bodyColor,
      roughness: this.roughness,
      metalness: this.metalness,
    });
    this.body = new THREE.Mesh(geo, mat);
    this.group.add(this.body);
  }

  // Vẽ texture một mặt (canvas 512×512). Chấm to gấp đôi & giãn vị trí tránh đè.
  _makeFaceTexture(number) {
    const S = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(S / 2, S / 2, 50, S / 2, S / 2, 350);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f3ebd9');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, S, S);

    // Viền bo tròn (hài hoà với thân đã bo tròn)
    const m = 8, r = 46;
    roundRectPath(ctx, m, m, S - 2 * m, S - 2 * m, r);
    ctx.strokeStyle = '#d6cbba';
    ctx.lineWidth = 16;
    ctx.stroke();

    const isOne = number === 1;
    const dotColor = (isOne || number === 4) ? '#dc2626' : '#1e293b';
    // Đường kính chấm tăng gấp đôi so với bản gốc (42 -> 84; mặt 1: 75 -> 150)
    const dotRadius = (isOne ? 75 : 42) * this.dotScale;

    const drawDot = (x, y) => {
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
      const inner = ctx.createRadialGradient(
        x - 5, y - 5, dotRadius * 0.2, x, y, dotRadius
      );
      inner.addColorStop(0, 'rgba(255,255,255,.3)');
      inner.addColorStop(0.8, 'rgba(0,0,0,.2)');
      inner.addColorStop(1, 'rgba(0,0,0,.5)');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    };

    // Giãn lề chấm ra để chấm to không đè lên nhau
    const c = S / 2, edge = 80;
    const l = edge, r2 = S - edge, t = edge, b = S - edge;
    switch (number) {
      case 1: drawDot(c, c); break;
      case 2: drawDot(l, t); drawDot(r2, b); break;
      case 3: drawDot(l, t); drawDot(c, c); drawDot(r2, b); break;
      case 4: drawDot(l, t); drawDot(r2, t); drawDot(l, b); drawDot(r2, b); break;
      case 5: drawDot(l, t); drawDot(r2, t); drawDot(c, c); drawDot(l, b); drawDot(r2, b); break;
      case 6: drawDot(l, t); drawDot(r2, t); drawDot(l, c); drawDot(r2, c); drawDot(l, b); drawDot(r2, b); break;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    return tex;
  }

  _facePlate(number, axis) {
    const tex = this._makeFaceTexture(number);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.44,
      metalness: 0.02,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(this.faceSize, this.faceSize), mat
    );
    const off = this.size / 2 + this.faceGap;
    switch (axis) {
      case '+Y': mesh.rotation.x = -Math.PI / 2; mesh.position.y = off; break;
      case '-Y': mesh.rotation.x = Math.PI / 2;  mesh.position.y = -off; break;
      case '+Z': mesh.position.z = off; break;
      case '-Z': mesh.rotation.y = Math.PI;      mesh.position.z = -off; break;
      case '+X': mesh.rotation.y = Math.PI / 2;  mesh.position.x = off; break;
      case '-X': mesh.rotation.y = -Math.PI / 2; mesh.position.x = -off; break;
    }
    return mesh;
  }

  _buildFaces() {
    this.group.add(this._facePlate(1, '+Y'));
    this.group.add(this._facePlate(2, '+Z'));
    this.group.add(this._facePlate(3, '+X'));
    this.group.add(this._facePlate(6, '-Y'));
    this.group.add(this._facePlate(5, '-Z'));
    this.group.add(this._facePlate(4, '-X'));
  }

  // ---------- API công khai ----------

  /** Đặt ngay lập tức mặt chỉ định hướng lên (không quay). */
  showFace(face) {
    if (!FACE_TARGETS[face]) throw new Error('Mặt không hợp lệ, phải từ 1..6');
    this._cancelRoll();
    this._currentFace = face;
    this.group.quaternion.copy(FACE_TARGETS[face]);
  }

  /** Mặt hiện tại (mặt sẽ/còn hướng lên sau khi quay xong). */
  getFace() { return this._currentFace; }

  /** Đang trong quá trình quay? */
  isRolling() { return this._rolling; }

  /** Dừng ngay animation quay hiện tại (giữ nguyên tư thế giữa chừng). */
  stop() { this._cancelRoll(); }

  /**
   * Quay về một mặt xác định.
   * Mỗi lần gọi đều có quỹ đạo KHÁC NHAU (trục quay, số vòng 3..6, hướng ngẫu nhiên)
   * nhưng kết quả cuối cùng LUÔN đúng mặt yêu cầu.
   *
   * @param {number} face - 1..6
   * @param {object} [o]
   * @param {number} [o.duration=2600] - thời gian quay (ms)
   * @param {number} [o.wobble=0.06]   - biên độ lắc ngang tắt dần
   * @param {(face:number)=>void} [o.onDone] - callback khi dừng hẳn
   * @returns {number} token của lần quay (dùng để huỷ)
   */
  rollTo(face, o = {}) {
    if (!FACE_TARGETS[face]) throw new Error('Mặt không hợp lệ, phải từ 1..6');
    const duration = o.duration ?? Math.round(2600 * (2/3));
    const onDone = o.onDone;
    const wobble = o.wobble ?? 0.06;

    this._cancelRoll();
    const token = ++this._rollToken;
    this._rolling = true;
    this._currentFace = face;

    const startQ = this.group.quaternion.clone();
    const targetQ = FACE_TARGETS[face].clone();
    // Đảm bảo slerp đi cung ngắn nhất giữa hai orientation (q và -q là cùng một tư thế)
    if (startQ.dot(targetQ) < 0) targetQ.multiplyScalar(-1);

    // --- Quỹ đạo ngẫu nhiên: trục bất kỳ + 3..6 vòng + hướng ngẫu nhiên ---
    const axis = new THREE.Vector3(
      Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1
    ).normalize();
    const spins = 3 + Math.floor(Math.random() * 4); // 3,4,5,6 vòng
    const dir = Math.random() < 0.5 ? -1 : 1;
    const spinAngle = spins * Math.PI * 2 * dir;

    const startPos = this.group.position.clone();
    const t0 = performance.now();
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    const qSlerp = new THREE.Quaternion();
    const qSpin = new THREE.Quaternion();

    const step = (now) => {
      if (token !== this._rollToken) return; // đã bị huỷ / thay thế
      const t = Math.min((now - t0) / duration, 1);
      const p = easeOutQuart(t);

      THREE.Quaternion.slerp(startQ, targetQ, qSlerp, p);
      qSpin.setFromAxisAngle(axis, spinAngle * (1 - p));
      // qSpin (giảm từ nhiều vòng về 0) nhân vào đường slerp
      // => p=0 và p=1 đều triệt tiêu, giữa chừng thì tạo quỹ đạo xoay tự do 3D
      this.group.quaternion.copy(qSpin.multiply(qSlerp));

      // Lắc ngang tắt dần (giả lập va chạm nhẹ)
      const w = (1 - t) * wobble;
      const ph = spinAngle * (1 - p);
      this.group.position.x = startPos.x + w * Math.sin(ph + 1.7);
      this.group.position.z = startPos.z + w * Math.cos(ph * 0.9);

      if (t >= 1) {
        this.group.quaternion.copy(FACE_TARGETS[face]);
        this.group.position.copy(startPos);
        this._rolling = false;
        if (onDone) onDone(face);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return token;
  }

  /**
   * Quay ngẫu nhiên.
   * @returns {number} mặt kết quả (1..6) — trả về ngay, onDone gọi khi dừng.
   */
  roll(o = {}) {
    const face = FACES[Math.floor(Math.random() * 6)];
    this.rollTo(face, o);
    return face;
  }


  /**
   * QUAY KIỂU MỞ HỘP: quay tít nhiều vòng, giảm tốc, dừng đúng mặt.
   * @param {number} face 1..6
   * @param {object} [o]
   */
  spinTo(face, o = {}) {
    if (!FACE_TARGETS[face]) throw new Error('Mặt không hợp lệ, phải từ 1..6');
    const duration = o.duration ?? Math.round(2600 * (2/3));
    const onDone = o.onDone;
    const wobble = o.wobble ?? 0.06;

    this._cancelRoll();
    const token = ++this._rollToken;
    this._rolling = true;
    this._currentFace = face;

    const baseQ = FACE_TARGETS[face];
    const baseE = new THREE.Euler().setFromQuaternion(baseQ, 'XYZ');
    const cur = this.group.rotation;

    const sign = () => (Math.random() < 0.5 ? -1 : 1);
    const kY = (5 + Math.floor(Math.random() * 5)) * sign();
    const kX = (1 + Math.floor(Math.random() * 3)) * sign();
    const kZ = Math.floor(Math.random() * 3) * sign();
    const TAU = Math.PI * 2;
    const dY = cur.y - baseE.y + TAU * kY;
    const dX = cur.x - baseE.x + TAU * kX;
    const dZ = cur.z - baseE.z + TAU * kZ;

    const startPos = this.group.position.clone();
    const t0 = performance.now();
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

    const step = (now) => {
      if (token !== this._rollToken) return;
      const t = Math.min((now - t0) / duration, 1);
      const p = easeOutQuart(t);
      const f = 1 - p;
      this.group.rotation.set(
        baseE.x + dX * f,
        baseE.y + dY * f,
        baseE.z + dZ * f,
        'XYZ'
      );
      const w = (1 - t) * wobble;
      const ph = dY * f;
      this.group.position.x = startPos.x + w * Math.sin(ph + 1.7);
      this.group.position.z = startPos.z + w * Math.cos(ph * 0.9);
      if (t >= 1) {
        this.group.quaternion.copy(baseQ);
        this.group.position.copy(startPos);
        this._rolling = false;
        if (onDone) onDone(face);
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return token;
  }

  /** Quay ngẫu nhiên kiểu mở hộp */
  spin(o = {}) {
    const face = FACES[Math.floor(Math.random() * 6)];
    this.spinTo(face, o);
    return face;
  }

  _cancelRoll() {
    this._rollToken++;
    this._rolling = false;
  }

  dispose() {
    this._cancelRoll();
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
  }
}

export default Dice6D;
