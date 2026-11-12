// ============================================================================
// MODULE: HỎA CẦU THUẬT — PIXELFX 100% CODE (Kỹ năng 1)
// Tích hợp nguyên bản từ Hoa_Cau_Thuat_PixelFX_100_Code_OFFLINE.html:
//  - Tụ lực giữ nút (tối đa 14s): quả cầu lửa lớn dần từ R=10 (Ø20px) đến R=46 (Ø92px)
//  - Lõi cầu lửa nhiễu động (p.shade), lưỡi lửa bất đối xứng (tongue), vòng hỏa ấn
//  - Đạn bay có 18 dải đuôi lửa + 12 cụm khói cuộn xoay theo góc bay thực tế (Auto-Target 900)
//  - Vụ nổ 1.12s: chớp lõi, vòng xung kích lửa và 24–96 tia lửa hướng tâm
//  - Thiêu đốt toàn thân mục tiêu 10 giây liên tục (12 cột lửa gốc + 12 lưỡi lửa vai/đầu + tàn lửa)
// ============================================================================

import { clamp, settings, game, camera } from './state.js';

const PixelFX = window.PK_PIXELFX;
if (!PixelFX) {
  throw new Error('PixelFX bundle must load before hoa-cau.js');
}

// ----------------------------------------------------------------------------
// Toán học & Màu sắc nguyên bản từ Hoa_Cau_Thuat_PixelFX_100_Code_OFFLINE.html
// ----------------------------------------------------------------------------
const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;

function hash(...ns) {
  let h = 0x9e3779b9;
  for (const n of ns) {
    h = Math.imul(h ^ (n | 0), 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

const rand = (...ns) => hash(...ns) / 4294967296;

class Rng {
  constructor(seed = 1) {
    this.s = seed >>> 0 || 1;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + (b - a) * this.next();
  }
}

const rng = (...ns) => new Rng(hash(...ns));

function noise(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(rand(i, seed), rand(i + 1, seed), u) * 2 - 1;
}

const rgb = (r, g, b) =>
  (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

const hex = (h) => {
  const s = h.replace('#', '');
  const v = parseInt(s, 16);
  return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
};

// Bảng màu Hỏa Cầu Thuật nguyên bản
const C = {
  edge: hex('#491014'),
  dark: hex('#721716'),
  red: hex('#b92b16'),
  orange: hex('#eb4c16'),
  fire: hex('#ff7f19'),
  gold: hex('#ffb02d'),
  yellow: hex('#ffdb5b'),
  cream: hex('#fff2b1'),
  white: hex('#fffdf0'),
  smoke: hex('#4a4652'),
  smoke2: hex('#6a6471'),
};

// Tỷ lệ chuyển đổi 1 đơn vị PixelFX sang đơn vị thế giới (khớp chiều cao Diệp Tu 112px)
export const HOA_CAU_PFX_SCALE = 1.45;

// Thông số kỹ năng Hỏa Cầu Thuật nguyên bản
export const HOA_CAU_SPEC = {
  maxChargeSeconds: 14,
  burnDuration: 10,
  explosionDuration: 1.12,
  minManaCost: 22,
  pfxScale: HOA_CAU_PFX_SCALE,
  rad: (t) => Math.min(46, 10 + 3.1 * Math.max(0, t)),
  dmg: (t) => Math.round(180 + 62 * Math.max(0, t)),
  burnDps: (t) => 11 + Math.max(0, t) * 2.0,
};

// ----------------------------------------------------------------------------
// Các hàm vẽ PixelFX Painter nguyên bản từ Hoa_Cau_Thuat_PixelFX_100_Code_OFFLINE.html
// ----------------------------------------------------------------------------

export function tongue(p, clock, x, y, ang, len, width, age, seed, quality = 1) {
  const f = 1 - age;
  if (f <= 0.01 || len <= 0.5) return;
  const cr = Math.cos(ang);
  const sn = Math.sin(ang);
  const off = noise(clock * 7 + seed, seed) * Math.max(1, quality * 2);
  const tipx = x + cr * len + sn * off;
  const tipy = y + sn * len - cr * off;
  const midx = x + cr * len * 0.48 + sn * off * 0.2;
  const midy = y + sn * len * 0.48 - cr * off * 0.2;
  p.beam(x, y, midx, midy, width, C.red, 0.70 * f);
  p.beam(midx, midy, tipx, tipy, Math.max(0.55, width * 0.30), C.orange, 0.72 * f);
  p.beam(x, y, midx, midy, Math.max(0.7, width * 0.64), C.fire, 0.96 * f);
  p.beam(x, y, midx, midy, Math.max(0.7, width * 0.29), C.yellow, 0.97 * f);
  if (width > 3) p.line(x, y, midx, midy, C.cream, 0.65 * f);
}

export function drawOrb(p, x, y, r, t, launch = false, chargeTime = 0, flightAngle = 0) {
  const pulse = 1 + 0.045 * Math.sin(t * 17);
  r *= pulse;
  p.glow(x, y, Math.min(97, r * 2.20), C.orange, 0.30);
  p.glow(x, y, Math.min(65, r * 1.37), C.gold, 0.29);

  const cosF = Math.cos(flightAngle);
  const sinF = Math.sin(flightAngle);

  // Các lưỡi lửa quanh quả cầu (bất đối xứng và bị gió thổi ngược về phía đuôi khi đang bay)
  const blades = Math.min(27, 11 + Math.floor(r * 0.35));
  for (let k = 0; k < blades; k++) {
    const a = (k * TAU) / blades + noise(t * 1.8, k + 22) * 0.10;
    const relA = Math.atan2(Math.sin(a - flightAngle), Math.cos(a - flightAngle));
    const bx = x + Math.cos(a) * r * 0.83;
    const by = y + Math.sin(a) * r * 0.80;
    const isBackSide = Math.cos(relA) < 0;
    const direction = launch
      ? isBackSide
        ? flightAngle + Math.PI + Math.sin(relA) * 0.39
        : flightAngle + relA * -0.2 - 0.15
      : a - 0.16;
    const L =
      (4 + r * 0.48) *
      (0.4 + 0.65 * (0.5 + 0.5 * Math.sin(t * (6 + (k % 4)) + k * 1.8))) *
      (launch && isBackSide ? 1.5 : 1);
    tongue(p, t, bx, by, direction, L, Math.max(2.0, r * 0.23), 0.1, k + 3, 0.8);
  }

  // Lõi cầu lửa nhiễu động phân tầng từ vỏ đỏ sẫm vào tâm trắng rực
  p.shade(x - r - 2, y - r - 2, x + r + 2, y + r + 2, (X, Y) => {
    const dx = X - x;
    const dy = Y - y;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const turbulence =
      0.075 * Math.sin(a * 9 - t * 11) +
      0.048 * Math.cos(a * 15 + t * 13) +
      0.045 * noise(X * 0.21 + Y * 0.24 - t * 5, 17);
    const edge = r * (1 + turbulence);
    const u = d / edge;
    if (u > 1) return 0;
    if (u > 0.90) return C.dark;
    if (u > 0.76) return C.orange;
    if (u > 0.61) return C.fire;
    const swirl = Math.sin(a * 4 + u * 14 - t * 8) + Math.cos(a * 7 - u * 12 + t * 6);
    if (u > 0.39 && swirl < 0.5) return C.gold;
    if (u > 0.37) return C.yellow;
    if (u > 0.17) return C.cream;
    return C.white;
  });

  // 5 vân lửa nóng chảy di chuyển trên bề mặt
  for (let k = 0; k < 5; k++) {
    const a = t * (1.7 + k * 0.13) + (k * TAU) / 5;
    const rr = r * (0.30 + 0.18 * Math.sin(t * 2 + k));
    const sx = x + Math.cos(a) * rr;
    const sy = y + Math.sin(a) * rr;
    p.dot(sx, sy, k % 2 ? C.cream : C.white, 0.78);
  }

  // Các tàn lửa xoay quanh quả cầu
  const n = Math.min(35, 10 + Math.floor(r * 0.45));
  for (let i = 0; i < n; i++) {
    const a = i * 2.399963 + t * (0.8 + (i % 4) * 0.26);
    const relA = a - flightAngle;
    const dist = r + (3 + ((i * 19) % 17)) * (0.55 + 0.35 * Math.sin(t * 3 + i));
    const backShift = launch ? 4 + Math.abs(Math.cos(relA)) * r * 0.4 : 0;
    const sx = x + Math.cos(a) * dist - cosF * backShift;
    const sy = y + Math.sin(a) * dist - sinF * backShift;
    p.dot(sx, sy, i % 3 === 0 ? C.cream : C.gold, 0.6 + Math.sin(t * 11 + i) * 0.22);
    if (i % 7 === 0) p.glow(sx, sy, 3.5, C.fire, 0.2);
  }
}

export function chargeFX(p, t, cx, cy, chargeTime, emerge = 1) {
  const r = HOA_CAU_SPEC.rad(chargeTime) * emerge;
  const n = Math.min(52, 23 + Math.floor(chargeTime * 2));

  // Các hạt lửa hội tụ nuôi lớn quả cầu
  for (let i = 0; i < n; i++) {
    const b = (i * TAU) / n;
    const orbit = (i * 0.718 + t * (0.6 + (i % 3) * 0.1)) % TAU;
    const dr = (r + 16 + (i % 6) * 4) * emerge;
    const sx = cx + Math.cos(orbit + b) * dr;
    const sy = cy + Math.sin(orbit + b) * dr * 0.72;
    const inner = 0.6 + 0.15 * Math.sin(t * 5 + i);
    p.line(
      sx,
      sy,
      sx + (cx - sx) * 0.19 * inner,
      sy + (cy - sy) * 0.19 * inner,
      i % 4 ? C.fire : C.yellow,
      0.63 * emerge
    );
    if (i % 4 === 0) p.dot(sx, sy, C.cream, 0.7 * emerge);
  }

  // Vòng hỏa ấn mảnh phía sau quả cầu
  const ringR = r + 9 + 2 * Math.sin(t * 3);
  p.ring(cx, cy, ringR, 1.0, C.gold, 0.24 * emerge);
  for (let j = 0; j < 5; j++) {
    const a = t * 0.9 + (j * TAU) / 5;
    p.glow(cx + Math.cos(a) * ringR, cy + Math.sin(a) * ringR, 3.7, C.yellow, 0.25 * emerge);
  }

  drawOrb(p, cx, cy, r, t, false, chargeTime, 0);
}

export function flightFX(p, t, s) {
  const { x, y, r, charge = 0, angle = 0 } = s;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  // 18 dải đuôi lửa rực cháy phía sau theo hướng ngược vector vận tốc
  const trail = Math.min(100, 35 + r * 1.8);
  for (let i = 0; i < 18; i++) {
    const u = i / 18;
    const a = (i / 18 - 0.5) * 1.5;
    const localX = -r * (0.37 + 0.13 * Math.sin(t * 8 + i));
    const localY = Math.sin(i * 7 + t * 9) * r * 0.53;
    const bx = x + ux * localX + nx * localY;
    const by = y + uy * localX + ny * localY;
    const length = trail * (0.30 + u * 0.55);
    tongue(
      p,
      t,
      bx,
      by,
      angle + Math.PI + a * 0.47,
      length,
      Math.max(1.3, (1 - u) * r * 0.24),
      u * 0.57,
      220 + i,
      0.9
    );
  }

  // 12 cụm khói nguội dần phía sau đuôi lửa
  for (let k = 0; k < 12; k++) {
    const u = (k + 0.3) / 12;
    const localX = -r - u * trail;
    const localY = Math.sin(t * 4 + k * 2.7) * (4 + u * r * 0.55);
    const xx = x + ux * localX + nx * localY;
    const yy = y + uy * localX + ny * localY - u * 7;
    const sz = Math.max(2, 1 + u * 5);
    if (u > 0.35) {
      p.circle(xx, yy, sz, C.smoke, 0.08 * (u - 0.35));
    }
    if (k % 2 === 0) {
      p.dot(xx + 3 * Math.sin(k * 2), yy - 2, C.red, Math.max(0, 0.9 - u));
    }
  }

  drawOrb(p, x, y, r, t, true, charge, angle);
}

export function explosionFX(p, t, b) {
  const u = b.age / HOA_CAU_SPEC.explosionDuration;
  const k = clamp(1 - u, 0, 1);
  const x = b.x;
  const y = b.y;
  const r = b.r;

  if (u < 0.62) {
    p.glow(x, y, Math.min(110, r * 1.8 + 20), C.fire, k * 0.60);
    p.glow(x, y, Math.min(75, r + 23), C.yellow, k * 0.34);
  }
  if (u < 0.45) {
    p.circle(
      x,
      y,
      Math.max(1, r * (1 - u * 2.3)),
      u < 0.08 ? C.cream : C.gold,
      Math.max(0, 0.55 - u)
    );
  }
  if (u < 0.82) {
    const ring = r * 0.3 + u * (r * 2.2 + 25);
    p.ring(x, y, ring, Math.max(1.3, 4.5 * (1 - u)), C.orange, (1 - u) * 0.9);
    p.glowRing(x, y, ring, 3.5, C.gold, (1 - u) * 0.20);
  }

  const R = rng(603, b.seed);
  const count = clamp(Math.floor(r * 2.1), 24, 96);
  for (let i = 0; i < count; i++) {
    const ang = ((i + R.range(-0.45, 0.45)) * TAU) / count;
    const L = R.range(r * 0.35, r * 1.7) + u * R.range(15, 65);
    const rr = Math.min(r * 2.8, L * u + 4);
    const xx = x + Math.cos(ang) * rr;
    const yy = y + Math.sin(ang) * rr - u * u * R.range(0, 17);
    const sz = (1 - u) * R.range(2, 6);
    if (u < 0.76 && sz > 0.6) {
      p.beam(
        xx - Math.cos(ang) * sz * 2.3,
        yy - Math.sin(ang) * sz * 2.3,
        xx,
        yy,
        Math.max(1, sz),
        i % 4 === 0 ? C.yellow : i % 3 === 0 ? C.red : C.fire,
        Math.max(0, k * 0.9)
      );
    }
    if (i % 5 === 0 && k > 0.1) p.dot(xx, yy, C.cream, k);
  }

  // Các lưỡi lửa tàn dư cuộn lên tại tâm nổ
  if (u < 0.7) {
    for (let i = 0; i < 9; i++) {
      const x0 = x + Math.sin(i * 12.5) * r * 0.57;
      const y0 = y + Math.cos(i * 5.7) * r * 0.41;
      tongue(
        p,
        t,
        x0,
        y0,
        -Math.PI / 2 + (i - 4) * 0.13,
        r * (0.65 + u * 0.5),
        Math.max(1.2, 4.5 * (1 - u)),
        u * 0.55,
        i + 70
      );
    }
  }
}

export function burnFX(p, t, footX, footY, burn) {
  if (burn <= 0) return;
  const age = Math.max(0.12, HOA_CAU_SPEC.burnDuration - burn);
  const f = Math.min(1, age * 4, Math.max(0.15, burn * 0.8));
  const x = footX;
  const y = footY - 66;
  const dyFoot = footY - 218;

  // Quầng sáng & 12 cột lửa gốc bao trùm toàn bộ cơ thể mục tiêu từ chân lên đầu
  p.glow(x, y + 23, 51, C.red, 0.21 * f);
  p.glow(x, y + 10, 39, C.orange, 0.25 * f);

  const roots = [
    [0, 211, 49, 9],
    [-11, 204, 39, 6],
    [12, 205, 37, 7],
    [-15, 191, 37, 6],
    [15, 189, 34, 5],
    [-8, 177, 42, 6],
    [9, 177, 39, 6],
    [0, 184, 50, 8],
    [-4, 160, 28, 4],
    [5, 159, 29, 4],
    [-12, 171, 33, 5],
    [12, 171, 31, 5],
  ];
  for (let i = 0; i < roots.length; i++) {
    const [dx, base, len, w] = roots[i];
    const a = -Math.PI / 2 + Math.sin(t * 3.8 + i * 2.3) * (0.20 + (i % 4) * 0.03);
    const L = len * (0.72 + 0.16 * Math.sin(t * 7 + i * 1.9)) * f;
    tongue(p, t, x + dx, base + dyFoot, a, Math.max(1, L), Math.max(1.5, w * f), 0.02, i * 79, 0.85);
  }

  // 12 lưỡi lửa bốc quanh hai vai và đường viền cơ thể
  for (let i = 0; i < 12; i++) {
    const xx = x + Math.sin(i * 4.17) * (i % 4 === 0 ? 21 : i % 2 === 0 ? 17 : 10);
    const yy = 144 + (i % 6) * 10 + dyFoot;
    const len = (13 + ((i * 11) % 19) + 5 * Math.sin(t * 7 + i)) * f;
    tongue(
      p,
      t,
      xx,
      yy,
      -Math.PI / 2 + Math.sin(t * 3.6 + i * 2.3) * 0.45,
      Math.max(1, len),
      Math.max(1.2, (3.3 + (i % 4)) * f),
      0.07,
      i * 31,
      0.7
    );
  }

  // 30 tàn lửa & cụm khói xám bay lên
  for (let i = 0; i < 30; i++) {
    const life = (t * (11 + (i % 4) * 4) + i * 9.1) % 82;
    const xx = x + Math.sin(i * 3.1 + t * 0.52) * 18 + ((i * 23) % 13 - 6);
    const yy = 181 - life * 0.93 + dyFoot;
    if (life < 65) {
      p.dot(xx, yy, i % 5 === 0 ? C.cream : C.orange, (1 - life / 82) * f);
    }
    if (i % 4 === 0) {
      const smokeY = 143 - ((t * (11 + (i % 4) * 2) + i * 11) % 82) + dyFoot;
      const smokeX = x + Math.sin(i * 2 + t * 0.8) * 18;
      p.circle(smokeX, smokeY, 4 + (i % 3) * 1.7, C.smoke, 0.18 * f);
      p.dot(smokeX, smokeY - 1, C.smoke2, 0.18 * f);
    }
  }

  // 6 ngọn lửa dưới mặt đất ngay chân mục tiêu
  for (let i = 0; i < 6; i++) {
    const xx = x - 17 + i * 7;
    const yy = 216 + dyFoot;
    tongue(p, t, xx, yy, -Math.PI / 2, 9 + 5 * Math.sin(t * 7 + i), 2.8, 0, i + 133);
  }
}

// ----------------------------------------------------------------------------
// Hệ thống đệm vùng PixelFX tối ưu (vẽ chính xác từng vùng hiệu ứng vào thế giới)
// ----------------------------------------------------------------------------
const regionPool = [];

function getRegionSurface(slot, w, h) {
  let s = regionPool[slot];
  if (!s || s.w !== w || s.h !== h) {
    const frame = PixelFX.createFrame(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    s = { w, h, frame, canvas, ctx, img };
    regionPool[slot] = s;
  }
  return s;
}

function drawWorldRegion(mainCtx, slot, leftWorld, topWorld, worldW, worldH, paintFn) {
  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  const screenX = leftWorld - wx0;
  const screenY = topWorld - wy0;

  // Bỏ qua nếu vùng hiệu ứng nằm hoàn toàn ngoài khung nhìn camera
  const z = settings.zoom || 0.7;
  const marginX = (game.viewW / z - game.viewW) * 0.5 + 160;
  const marginY = (game.viewH / z - game.viewH) * 0.5 + 160;
  if (
    screenX + worldW < -marginX ||
    screenX > game.viewW + marginX ||
    screenY + worldH < -marginY ||
    screenY > game.viewH + marginY
  ) {
    return;
  }

  const pw = Math.max(48, Math.ceil(worldW / HOA_CAU_PFX_SCALE));
  const ph = Math.max(48, Math.ceil(worldH / HOA_CAU_PFX_SCALE));
  const surf = getRegionSurface(slot, pw, ph);

  PixelFX.clearFrame(surf.frame);
  const p = PixelFX.painterFor(surf.frame);
  p.lightK = 0.88;

  const toLocalX = (wx) => (wx - leftWorld) / HOA_CAU_PFX_SCALE;
  const toLocalY = (wy) => (wy - topWorld) / HOA_CAU_PFX_SCALE;

  paintFn(p, toLocalX, toLocalY);

  PixelFX.composite(surf.frame, surf.img.data, null, 0.88);
  surf.ctx.putImageData(surf.img, 0, 0);

  mainCtx.save();
  mainCtx.imageSmoothingEnabled = false;
  mainCtx.drawImage(
    surf.canvas,
    0,
    0,
    pw,
    ph,
    screenX,
    screenY,
    pw * HOA_CAU_PFX_SCALE,
    ph * HOA_CAU_PFX_SCALE
  );
  mainCtx.restore();
}

export function renderHoaCauWorld(state) {
  const mainCtx = game.ctx;
  if (!mainCtx || settings.fxQuality === 'off') return;

  const t = game.elapsed;
  let slot = 0;

  // 1. Vẽ quả cầu đang tụ lực trước bàn tay Diệp Tu
  if (state.charging && state.chargeOrigin) {
    const r = HOA_CAU_SPEC.rad(state.chargeTime || 0);
    const pad = Math.ceil((r + 48) * HOA_CAU_PFX_SCALE);
    const cx = state.chargeOrigin.x;
    const cy = state.chargeOrigin.y;
    drawWorldRegion(
      mainCtx,
      slot++,
      cx - pad,
      cy - pad,
      pad * 2,
      pad * 2,
      (p, toX, toY) => {
        chargeFX(p, t, toX(cx), toY(cy), state.chargeTime || 0, state.chargeEmerge ?? 1);
      }
    );
  }

  // 2. Vẽ các viên đạn Hỏa Cầu đang bay
  if (state.fireballs && state.fireballs.length > 0) {
    for (const fb of state.fireballs) {
      const r = HOA_CAU_SPEC.rad(fb.chargeTime || 0);
      const trailWorld = (Math.min(100, 35 + r * 1.8) + r + 28) * HOA_CAU_PFX_SCALE;
      const sideWorld = (r * 2.2 + 36) * HOA_CAU_PFX_SCALE;
      const padX = Math.ceil(Math.max(trailWorld, sideWorld));
      const padY = Math.ceil(Math.max(trailWorld * 0.75, sideWorld));
      drawWorldRegion(
        mainCtx,
        slot++,
        fb.x - padX,
        fb.y - padY,
        padX * 2,
        padY * 2,
        (p, toX, toY) => {
          flightFX(p, t, {
            x: toX(fb.x),
            y: toY(fb.y),
            r,
            charge: fb.chargeTime || 0,
            angle: Math.atan2(fb.vy, fb.vx),
          });
        }
      );
    }
  }

  // 3. Vẽ vụ nổ Hỏa Cầu
  if (state.explosions && state.explosions.length > 0) {
    for (const ex of state.explosions) {
      const pad = Math.ceil((ex.r * 3.1 + 42) * HOA_CAU_PFX_SCALE);
      drawWorldRegion(
        mainCtx,
        slot++,
        ex.x - pad,
        ex.y - pad,
        pad * 2,
        pad * 2,
        (p, toX, toY) => {
          explosionFX(p, t, {
            x: toX(ex.x),
            y: toY(ex.y),
            age: ex.age,
            r: ex.r,
            seed: ex.seed,
          });
        }
      );
    }
  }

  // 4. Vẽ hiệu ứng Thiêu Đốt Toàn Thân 10 giây trên mục tiêu
  if (state.burnTarget && state.burnRemaining > 0) {
    const fx = state.burnTarget.x;
    const fy = state.burnTarget.y;
    const halfW = Math.ceil(62 * HOA_CAU_PFX_SCALE);
    const topH = Math.ceil(132 * HOA_CAU_PFX_SCALE);
    const botH = Math.ceil(24 * HOA_CAU_PFX_SCALE);
    drawWorldRegion(
      mainCtx,
      slot++,
      fx - halfW,
      fy - topH,
      halfW * 2,
      topH + botH,
      (p, toX, toY) => {
        burnFX(p, t, toX(fx), toY(fy), state.burnRemaining);
      }
    );
  }
}
