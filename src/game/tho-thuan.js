// ============================================================================
// MODULE: THỔ THUẪN — KỸ NĂNG 03 (PixelFX v0.3.0 · 100% Code Offline)
// Nguồn: /Tho_Thuan_Skill_03_PixelFX_OFFLINE.html
// Cơ chế:
//  - Bật / tắt tức thì (Phím 3 hoặc nút Kỹ năng 3).
//  - Khi thuẫn bật: Chặn 100% sát thương máu, chuyển hóa thành tiêu hao linh lực
//    theo công thức: 25 + 65% sát thương.
//  - Duy trì thuẫn tiêu hao 2 linh lực / giây.
//  - Nếu đòn đánh làm cạn linh lực, đòn đó vẫn được đỡ hoàn toàn rồi thuẫn mới vỡ.
// ============================================================================

import { game, camera, settings, clamp } from './state.js';

const PixelFX = window.PK_PIXELFX;
if (!PixelFX) {
  throw new Error('PixelFX bundle must load before tho-thuan.js');
}

const { createFrame, clearFrame, painterFor, composite } = PixelFX;

const rgb = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

export function hex(h) {
  if (typeof h === 'number') return h;
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s.slice(0, 6), 16);
  return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
}

const TAU = Math.PI * 2;

// Tỉ lệ hiển thị PixelFX sang đơn vị thế giới (khớp chiều cao Diệp Tu ~108px)
export const THO_THUAN_SCALE = 0.92;

export const THO_THUAN_SPEC = Object.freeze({
  slot: 3,
  code: 'Digit3',
  kind: 'earth',
  name: 'THỔ THUẪN',
  upkeepPerSecond: 2,
  hitFlatCost: 25,
  hitManaFactor: 0.65,
  projectileSpeed: 350,
  rx: 58,
  ry: 83,
  feetOffset: 84,
  pfxScale: THO_THUAN_SCALE,
});

// Bảng màu nguyên bản từ /Tho_Thuan_Skill_03_PixelFX_OFFLINE.html
const C_EARTH = {
  night: hex('#201c18'),
  dirt: hex('#403321'),
  dark: hex('#634327'),
  stone: hex('#765638'),
  earth: hex('#9d7544'),
  amber: hex('#c69b5b'),
  bright: hex('#eed38c'),
  light: hex('#fff1c0'),
  dust: hex('#baa078'),
  dust2: hex('#d7c19a'),
  spark: hex('#fff8d4'),
  hit: hex('#f3a171'),
  enemy: hex('#e86e52'),
  flare: hex('#ffcf96'),
  smoke: hex('#675b50'),
};

// Bảng màu Huyết Thuẫn riêng cho Huyết Dự (Ma Đạo Hộ Thể · Huyết Quang Rực Sáng)
const C_BLOOD = {
  night: hex('#18040a'),
  dirt: hex('#380914'),
  dark: hex('#580e1c'),
  stone: hex('#781426'),
  earth: hex('#ad1a34'),
  amber: hex('#e62e4a'),
  bright: hex('#ff6b84'),
  light: hex('#ffd4dd'),
  dust: hex('#b8485a'),
  dust2: hex('#d97788'),
  spark: hex('#ffffff'),
  hit: hex('#ff4d6d'),
  enemy: hex('#e86e52'),
  flare: hex('#ffa6b8'),
  smoke: hex('#5a1a24'),
};

// Proxy màu linh hoạt: tự động chuyển sang Huyết Thuẫn ma đạo khi chơi Huyết Dự
let forceBloodPalette = false;
const C = new Proxy(C_EARTH, {
  get(target, prop) {
    const isBlood = forceBloodPalette || settings.character === 'huyet_du';
    const chosen = isBlood ? C_BLOOD : target;
    return chosen[prop] ?? target[prop];
  },
});

// Kích thước khung đệm PixelFX cục bộ
const BUF_W = 520;
const BUF_H = 300;
const frame = createFrame(BUF_W, BUF_H);
const rawRgba = new Uint8ClampedArray(BUF_W * BUF_H * 4);
const offCanvas = document.createElement('canvas');
offCanvas.width = BUF_W;
offCanvas.height = BUF_H;
const offCtx = offCanvas.getContext('2d');
const offImg = offCtx.createImageData(BUF_W, BUF_H);

let fxClock = 0;

export function createShatterRocks(cx, cy, rx = THO_THUAN_SPEC.rx, ry = THO_THUAN_SPEC.ry) {
  return Array.from({ length: 45 }, (_, i) => {
    const a = i * 2.39996;
    const rr = 0.4 + ((i * 17) % 17) / 30;
    return {
      x: cx + Math.cos(a) * rx * rr,
      y: cy + Math.sin(a) * ry * rr,
      vx: Math.cos(a) * (60 + (i % 7) * 19),
      vy: Math.sin(a) * (62 + (i % 11) * 15) - 35,
      size: 1 + (i % 4),
      spin: i * 1.9,
    };
  });
}

// 1. Hạt bụi linh lực bay quanh thuẫn (moteFX nguyên bản)
function moteFX(p, t, HC) {
  for (let i = 0; i < 42; i++) {
    const a = i * 2.39996 + t * (0.85 + (i % 4) * 0.08);
    const xx = HC.x + Math.cos(a) * (HC.rx + 7 + (i % 10));
    const yy = HC.y + Math.sin(a * 1.7 + i) * HC.ry * 0.72;
    p.dot(
      xx,
      yy,
      i % 5 === 0 ? C.bright : i % 3 === 0 ? C.amber : C.dust,
      0.25 + 0.4 * Math.sin(t * 2 + i) ** 2
    );
    if (i % 7 === 0) p.glow(xx, yy, 3, C.amber, 0.10);
  }
}

// 2. Vòm Thổ Thuẫn hộ thể, 3 đai xoay, 18 mảnh đá, 9 dải linh mạch & pháp trận dưới chân (shieldFX nguyên bản)
function shieldFX(p, t, HC) {
  const cx = HC.x;
  const cy = HC.y;
  const rx = HC.rx + Math.sin(t * 2.9) * 0.9;
  const ry = HC.ry;
  const rot = t * 0.95;

  p.glow(cx, cy, 89, C.earth, 0.16);
  p.glow(cx, cy, 56, C.bright, 0.07);

  // Lớp vỏ thổ linh bán trong suốt & viền sáng (không che khuất nhân vật bên trong)
  for (let yy = Math.floor(cy - ry - 2); yy <= cy + ry + 2; yy += 1) {
    const vn = (yy - cy) / ry;
    if (Math.abs(vn) > 1.01) continue;
    const w = rx * Math.sqrt(Math.max(0, 1 - vn * vn));
    const x0 = Math.floor(cx - w);
    const x1 = Math.ceil(cx + w);
    for (let xx = x0; xx <= x1; xx += 1) {
      const dx = (xx - cx) / rx;
      const d = Math.sqrt(dx * dx + vn * vn);
      if (d > 1.015) continue;
      const band = Math.sin((xx - cx) * 0.21 + (yy - cy) * 0.12 + rot * 2.4);
      const haze = 0.023 + 0.042 * (0.5 + 0.5 * band);
      if (d < 0.96) {
        if (((xx + yy) & 1) === 0) {
          p.blend(xx, yy, band > 0.15 ? C.amber : C.stone, haze);
        }
      } else {
        const rr = Math.round((d - 0.96) * 100);
        p.blend(
          xx,
          yy,
          rr > 3 ? C.bright : C.earth,
          0.36 + 0.22 * Math.sin(t * 5 + (yy - cy) * 0.09) ** 2
        );
        if ((xx + yy) % 4 === 0) p.light(xx, yy, C.amber, 0.26);
      }
    }
  }

  // 3 vòng đai thổ linh xoay quanh toàn thân
  for (let belt = 0; belt < 3; belt++) {
    let old = null;
    for (let j = 0; j <= 144; j++) {
      const u = (j / 144) * 1.88 - 0.94;
      const turn = rot * (belt % 2 ? -1 : 1) + u * (3.4 + belt * 0.26) + (belt * TAU) / 3;
      const rr = rx * Math.sqrt(Math.max(0, 1 - u * u));
      const x = cx + rr * Math.cos(turn);
      const y = cy + ry * u;
      const front = Math.sin(turn) > 0;
      const brightness = 0.28 + 0.56 * Math.pow(Math.max(0, Math.sin(turn)), 2);
      if (old) {
        p.line(
          old[0],
          old[1],
          x,
          y,
          front ? (belt === 1 ? C.bright : C.amber) : C.dark,
          front ? brightness : 0.26
        );
        if (front && j % 4 === 0) {
          p.glow(x, y, 3.3, C.amber, 0.13);
          p.light(x, y, C.bright, 0.38);
        }
      }
      old = [x, y];
    }
  }

  // 18 mảnh nham thạch lơ lửng quanh vỏ thuẫn
  for (let i = 0; i < 18; i++) {
    const a = (i * TAU) / 18 + rot * (i % 2 ? -0.24 : 0.35);
    const x = cx + (rx + 1 + 2 * Math.sin(i * 3 + t)) * Math.cos(a);
    const y = cy + (ry + 1) * Math.sin(a);
    const r = i % 4 === 0 ? 4.2 : 2.7;
    const ang = a + 1.2;
    p.poly(
      [
        [x - r * Math.cos(ang), y - r * Math.sin(ang)],
        [x + r * 0.2, y - r],
        [x + r, y + r * 0.1],
        [x - r * 0.15, y + r],
      ],
      i % 3 === 0 ? C.earth : i % 2 ? C.stone : C.dark,
      0.65
    );
    p.line(
      x - r * 0.5,
      y - r * 0.3,
      x + r * 0.35,
      y - r * 0.8,
      i % 3 ? C.amber : C.bright,
      0.65
    );
  }

  // 9 luồng địa mạch dâng từ mặt đất ôm dọc thân người
  for (let k = 0; k < 9; k++) {
    const phase = (k * TAU) / 9 + rot * 0.58;
    const u = (t * (0.21 + (k % 3) * 0.04) + k / 9) % 1;
    const y = HC.feet - 148 * u;
    const x =
      cx +
      Math.cos(phase + u * 5.3) *
        rx *
        Math.sqrt(Math.max(0.08, 1 - (y - cy) ** 2 / (ry * ry)));
    if (Math.abs(y - cy) < ry) {
      p.glow(x, y, 3.5, C.amber, 0.2);
      p.dot(x, y, k % 2 ? C.bright : C.dust2, 0.8);
    }
  }

  // 4 dải linh quang quét quanh chu vi thuẫn
  for (let k = 0; k < 4; k++) {
    const off = rot * (k % 2 ? -0.8 : 1.1) + (k * TAU) / 4;
    for (let j = 0; j < 27; j++) {
      const a = off + j * 0.054;
      const ww = rx + 6 + 2 * Math.sin(a * 7 + t * 2);
      const x = cx + Math.cos(a) * ww;
      const y = cy + Math.sin(a) * ry * 1.07;
      p.dot(x, y, j % 5 === 0 ? C.light : C.bright, 0.35 + 0.38 * (j / 27));
      if (j % 9 === 0) p.glow(x, y, 4, C.bright, 0.13);
    }
  }

  // Pháp trận thổ linh dưới chân nhân vật
  for (let j = 0; j < 75; j++) {
    const a = (j * TAU) / 75;
    const xx = cx + Math.cos(a) * 51;
    const yy = HC.feet + Math.sin(a) * 10;
    p.dot(xx, yy, j % 4 === 0 ? C.bright : C.earth, 0.35);
  }
  p.glow(cx, HC.feet, 62, C.amber, 0.17);
  moteFX(p, t, HC);
}

// 3. Đạn tấn công thử thuẫn (projectileFX nguyên bản, hỗ trợ bay từ trái hoặc phải)
function projectileFX(p, s, t) {
  const x = s.x;
  const y = s.y;
  const dir = s.dir || -1; // -1: bay từ phải sang trái, +1: bay từ trái sang phải
  const tailSign = -dir;
  const k = Math.min(1, s.damage / 500);

  p.glow(x, y, 20 + 11 * k, C.enemy, 0.34);
  p.glow(x, y, 9 + 6 * k, C.flare, 0.36);

  for (let j = 0; j < 8; j++) {
    const a = (j * TAU) / 8 + t * 3;
    const r = 8 + 4 * k;
    p.line(
      x + Math.cos(a) * r,
      y + Math.sin(a) * r,
      x + Math.cos(a) * r * 1.6,
      y + Math.sin(a) * r * 1.5,
      j % 2 ? C.enemy : C.flare,
      0.65
    );
  }

  p.circle(x, y, 5 + k * 3, C.hit, 0.85);
  p.circle(x + dir, y - 1, 2 + k * 2, C.flare, 0.9);

  for (let j = 0; j < 15; j++) {
    const off = j * 6 + Math.sin(j * 3 + t * 17) * 3;
    const yy = y + Math.sin(t * 14 + j * 1.7) * 7;
    p.beam(
      x + tailSign * (8 + off),
      y + (yy - y) * 0.4,
      x + tailSign * (off + 2),
      yy,
      1.1 + (j % 3) * 0.4,
      j % 4 === 0 ? C.flare : C.enemy,
      0.17 + 0.38 * (1 - j / 15)
    );
  }
}

// 4. Sóng chấn hấp thụ đòn đánh trên bề mặt thuẫn (impactFX nguyên bản)
function impactFX(p, b, t) {
  if (!b) return;
  const age = b.age;
  const d = clamp(1 - age / 0.92, 0, 1);
  const x = b.x;
  const y = b.y;
  const m = Math.min(1.8, 0.7 + b.damage / 650);

  p.glow(x, y, Math.min(52, 25 + age * 26) * m, b.blocked ? C.bright : C.enemy, 0.30 * d);

  if (age < 0.6) {
    const radius = 4 + age * 69 * m;
    for (let i = 0; i < 44; i++) {
      const a = (i * TAU) / 44;
      const x1 = x + Math.cos(a) * radius * 0.68;
      const y1 = y + Math.sin(a) * radius;
      if (i % 2 === 0) p.dot(x1, y1, b.blocked ? C.bright : C.enemy, d * 0.7);
      if (i % 6 === 0) {
        p.line(
          x + Math.cos(a) * (radius - 7),
          y + Math.sin(a) * (radius - 7),
          x1,
          y1,
          b.blocked ? C.amber : C.hit,
          d
        );
      }
    }
  }

  for (let i = 0; i < 36; i++) {
    const a = i * 2.39996 + ((b.seed || 1) % 3) * 0.23;
    const v = (12 + (i % 7) * 4 + age * (43 + (i % 4) * 8)) * m;
    const xx = x + Math.cos(a) * v;
    const yy = y + Math.sin(a) * v - age * age * 22;
    const r = Math.max(1, (1 - age) * ((i % 3) + 1));
    if (age < 0.85) {
      p.dot(xx, yy, b.blocked ? (i % 5 ? C.dust : C.bright) : C.enemy, d * 0.85);
      if (i % 4 === 0) p.glow(xx, yy, r + 2, b.blocked ? C.amber : C.enemy, 0.10 * d);
    }
  }

  if (b.blocked && age < 0.55) {
    for (let k = 0; k < 9; k++) {
      const a = -1.3 + k * 0.32 + t * 0.4;
      const len = (17 + (k % 4) * 8) * (1 - age / 0.6);
      const mx = x + Math.cos(a) * len;
      const my = y + Math.sin(a) * len;
      p.line(x, y, mx, my, k % 3 ? C.bright : C.light, d * 0.6);
    }
  }
}

// 5. Hiệu ứng vỡ thuẫn khi cạn linh lực hoặc thu hồi thuẫn (shatterFX nguyên bản)
function shatterFX(p, b, HC) {
  if (!b) return;
  const u = b.age;
  const fade = clamp(1 - u / 1.65, 0, 1);
  const disperse = b.kind === 'disperse';

  if (!disperse) {
    p.glow(HC.x, HC.y, 100, C.amber, 0.36 * fade);
    for (let k = 0; k < 54; k++) {
      const a = (k * TAU) / 54;
      const r = u * 140;
      const xx = HC.x + Math.cos(a) * r * 0.72;
      const yy = HC.y + Math.sin(a) * r;
      if (u < 1.3 && k % 2 === 0) {
        p.dot(xx, yy, k % 4 ? C.bright : C.light, fade * 0.85);
      }
    }
  }

  for (let i = 0; i < b.rocks.length; i++) {
    const s = b.rocks[i];
    const x = s.x + s.vx * u;
    const y = s.y + s.vy * u + 82 * u * u;
    const size = Math.max(0.4, s.size * (1 - u / 1.6));
    if (size < 0.6) continue;
    p.poly(
      [
        [x - size, y - size],
        [x + size * 0.5, y - size * 1.2],
        [x + size, y + size * 0.4],
        [x - size * 0.5, y + size],
      ],
      disperse ? C.amber : i % 3 ? C.earth : C.bright,
      fade * 0.9
    );
    if (i % 5 === 0) p.glow(x, y, 4, C.dust, 0.15 * fade);
  }
}

function drawWorldRegion(mainCtx, centerWorldX, centerWorldY, boxW, boxH, drawCallback) {
  const w = Math.min(BUF_W, Math.max(32, Math.ceil(boxW)));
  const h = Math.min(BUF_H, Math.max(32, Math.ceil(boxH)));
  const worldW = w * THO_THUAN_SCALE;
  const worldH = h * THO_THUAN_SCALE;

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  const leftWorld = centerWorldX - worldW / 2;
  const topWorld = centerWorldY - worldH / 2;
  const screenX = leftWorld - wx0;
  const screenY = topWorld - wy0;

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

  frame.w = w;
  frame.h = h;
  clearFrame(frame);
  const p = painterFor(frame);
  drawCallback(p, w / 2, h / 2);

  const pixelCount = w * h;
  const subRgba = rawRgba.subarray(0, pixelCount * 4);
  composite(frame, subRgba);

  for (let row = 0; row < h; row++) {
    const srcOffset = row * w * 4;
    const dstOffset = row * BUF_W * 4;
    offImg.data.set(subRgba.subarray(srcOffset, srcOffset + w * 4), dstOffset);
  }
  offCtx.putImageData(offImg, 0, 0, 0, 0, w, h);

  mainCtx.drawImage(offCanvas, 0, 0, w, h, screenX, screenY, worldW, worldH);
}

export function renderThoThuanWorld(state) {
  if (!state || settings.fxQuality === 'off') return;
  const mainCtx = game.ctx;
  if (!mainCtx) return;

  const {
    active,
    heroX,
    heroFeetY,
    impacts = [],
    shatter = null,
    shots = [],
  } = state;

  if (!active && impacts.length === 0 && !shatter && shots.length === 0) return;
  forceBloodPalette = !!state.blood;

  fxClock = game.elapsed;

  // Tọa độ tâm vòm Thổ Thuẫn trong thế giới (mép dưới vòm đặt ngay dưới chân Diệp Tu)
  const shieldCenterX = heroX;
  const shieldCenterY = heroFeetY - (THO_THUAN_SPEC.feetOffset - 3) * THO_THUAN_SCALE;

  mainCtx.save();
  mainCtx.imageSmoothingEnabled = false;

  // 1. Vẽ Thổ Thuẫn hộ thể, mảnh vỡ thuẫn và sóng chấn va chạm quanh nhân vật
  if (active || shatter || impacts.length > 0) {
    drawWorldRegion(mainCtx, shieldCenterX, shieldCenterY, 260, 240, (p, cx, cy) => {
      const HC = {
        x: cx,
        y: cy,
        rx: THO_THUAN_SPEC.rx,
        ry: THO_THUAN_SPEC.ry,
        feet: cy + THO_THUAN_SPEC.feetOffset,
      };
      if (active) {
        shieldFX(p, fxClock, HC);
      }
      if (shatter) {
        shatterFX(p, shatter, HC);
      }
      for (const imp of impacts) {
        const localImp = {
          ...imp,
          x: cx + (imp.x - shieldCenterX) / THO_THUAN_SCALE,
          y: cy + (imp.y - shieldCenterY) / THO_THUAN_SCALE,
        };
        impactFX(p, localImp, fxClock);
      }
    });
  }

  // 2. Vẽ các đạn tấn công thử thuẫn đang bay tới
  for (const s of shots) {
    drawWorldRegion(mainCtx, s.x, s.y, 220, 96, (p, cx, cy) => {
      projectileFX(
        p,
        {
          ...s,
          x: cx,
          y: cy,
        },
        fxClock
      );
    });
  }

  // 3. Nhãn trạng thái phía trên vòm thuẫn
  if (active) {
    const wx0 = camera.x - game.viewW / 2;
    const wy0 = camera.y - game.viewH / 2;
    const labelX = shieldCenterX - wx0;
    const labelY = shieldCenterY - (THO_THUAN_SPEC.ry + 12) * THO_THUAN_SCALE - wy0;
    const isHuyetDu = !!state.blood || settings.character === 'huyet_du';
    mainCtx.textAlign = 'center';
    mainCtx.textBaseline = 'bottom';
    mainCtx.font = 'bold 10px system-ui,sans-serif';
    mainCtx.shadowColor = '#0b1014';
    mainCtx.shadowBlur = 4;
    mainCtx.fillStyle = isHuyetDu ? '#ff9db0' : '#f9e3aa';
    mainCtx.fillText(isHuyetDu ? 'HUYẾT QUANG · HỘ THỂ' : 'THỔ LINH · HỘ THỂ', labelX, labelY);
  }

  mainCtx.restore();
  forceBloodPalette = false;
}
