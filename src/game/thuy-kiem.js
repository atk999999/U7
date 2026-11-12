// ============================================================================
// MODULE: THỦY KIẾM V2 — TAM KIẾM GIÁNG LÂM (KỸ NĂNG 04 · 100% Code Offline)
// Nguồn: /Thuy_Kiem_V2_Nang_Cap_Hieu_Ung_OFFLINE.html
// Cơ chế:
//  - Nhấn thi triển 1 lần (Phím 4 hoặc nút Kỹ năng 4), không cần giữ nút.
//  - Pha 1 (KẾT ẤN - 5.0s): Diệp Tu kết ấn dẫn thủy linh lực hội tụ, hiện pháp trận
//    nước 3 tầng, ấn quyết bát giác và thanh tiến trình kết ấn.
//  - Pha 2 (THỦY QUANG - 1.05s): 3 đạo thủy quang xanh biếc bắn vút từ Diệp Tu lên trời.
//  - Pha 3 (KIẾM GIÁNG): 3 thanh cự kiếm bằng nước lần lượt lao từ cổng xoáy nước
//    trên không xuống mục tiêu (cách nhau 0.72s, mỗi kiếm rơi 0.85s, tự bám mục tiêu).
//  - Va chạm & Khống chế: Mỗi kiếm trúng đích gây sát thương lớn, kích hoạt hiệu ứng
//    thủy kích riêng (sóng xung kích / phễu nước xoáy / cột thủy trụ xung thiên) và
//    đặt lại Làm Chậm 6 giây (giảm 65% tốc độ di chuyển, tốc độ còn 35%) kèm 3 dải
//    thủy tỏa xoay quanh thân mục tiêu.
//  - Hồi chiêu: 40 giây sau nhát kiếm thứ 3.
// ============================================================================

import { game, camera, settings, player, motion, clamp } from './state.js';

const TAU = Math.PI * 2;

export const THUY_KIEM_SCALE = 1.24;

export const THUY_KIEM_SPEC = Object.freeze({
  slot: 4,
  code: 'Digit4',
  kind: 'water',
  name: 'THỦY KIẾM',
  manaCost: 60,
  castSeconds: 5.0,
  cooldownSeconds: 40.0,
  slowSeconds: 6.0,
  slowMultiplier: 0.35, // Giảm 65% tốc độ di chuyển (còn 35%)
  raySeconds: 1.05,
  strikeGapSeconds: 0.72,
  strikeFallSeconds: 0.85,
  swordDamages: [110, 130, 180], // Tổng 420 sát thương cho 3 thanh cự kiếm
  scale: THUY_KIEM_SCALE,
});

let seed = 7;
function rnd() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
function rand(a, b) {
  return a + (b - a) * rnd();
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function easeOutCubic(t) {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 3);
}

const MAX_PARTICLES = 440;

export function createThuyKiemState() {
  return {
    phase: 'ready', // 'ready' | 'seal' | 'rise' | 'fall' | 'cooldown'
    cast: 0,
    cd: 0,
    world: 0,
    stage: 0,
    hitCount: 0,
    flash: 0,
    targetId: null,
    anchorX: 0,
    anchorY: 0,
    rays: [],
    swords: [],
    fx: [],
    rings: [],
    smokes: [],
    impactVisuals: [],
  };
}

export function sprayThuyKiem(state, x, y, vx, vy, life, size, type) {
  if (state.fx.length >= MAX_PARTICLES) state.fx.shift();
  state.fx.push({ x, y, vx, vy, life, max: life, size, type });
}

export function startThuyKiemSeal(state, targetPos) {
  state.phase = 'seal';
  state.cast = 0;
  state.stage = 0;
  state.hitCount = 0;
  state.rays = [];
  state.swords = [];
  state.fx = [];
  state.rings = [];
  state.smokes = [];
  state.impactVisuals = [];
  state.anchorX = targetPos ? targetPos.x : player.x + player.facing * 260;
  state.anchorY = targetPos ? targetPos.feetY : player.y;
}

export function startThuyKiemRays(state, targetPos) {
  state.phase = 'rise';
  state.stage = 0;
  const tx = targetPos ? targetPos.x : state.anchorX;
  const ty = targetPos ? targetPos.feetY : state.anchorY;
  state.anchorX = tx;
  state.anchorY = ty;

  const px = player.x;
  const py = player.y + (motion.bobOffset || 0);
  const face = player.facing;

  state.rays = Array.from({ length: 3 }, (_, i) => ({
    i,
    u: 0,
    x: px + face * 18 + (i - 1) * 13,
    y: py - 54,
    targetX: tx + (i - 1) * 62,
    skyY: Math.min(py, ty) - 310,
    tail: [],
  }));

  for (let i = 0; i < 90; i++) {
    sprayThuyKiem(
      state,
      px + face * 16,
      py - 48,
      rand(-95, 95),
      rand(-185, 12),
      rand(0.4, 1.2),
      rand(1.2, 3.6),
      'aqua'
    );
  }
  state.flash = 0.22;
}

export function startThuyKiemDownfall(state, targetPos) {
  state.phase = 'fall';
  state.stage = 0;
  const tx = targetPos ? targetPos.x : state.anchorX;
  const ty = targetPos ? targetPos.feetY : state.anchorY;
  state.anchorX = tx;
  state.anchorY = ty;

  const skyOffset = 275 * THUY_KIEM_SCALE;
  state.swords = Array.from({ length: 3 }, (_, i) => ({
    i,
    start: i * THUY_KIEM_SPEC.strikeGapSeconds,
    t: -i * THUY_KIEM_SPEC.strikeGapSeconds,
    x: tx + [-20, 0, 20][i],
    portalY: ty - skyOffset,
    tip: ty - skyOffset,
    targetY: ty - 10,
    land: false,
    trail: [],
  }));
}

export function triggerThuyKiemSwordImpact(state, s, impactY) {
  if (s.land) return;
  s.land = true;
  state.hitCount++;
  state.flash = s.i === 2 ? 0.30 : 0.22;

  const x = s.x;
  const y = impactY;

  state.impactVisuals.push({
    x,
    y,
    kind: s.i,
    age: 0,
    duration: s.i === 2 ? 1.35 : 1.02,
  });

  for (let i = 0; i < 74; i++) {
    const a = rand(-Math.PI, 0);
    const sp = rand(48, 210);
    sprayThuyKiem(
      state,
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp - rand(0, 42),
      rand(0.45, 1.15),
      rand(1.6, 4.8),
      rnd() < 0.55 ? 'aqua' : 'foam'
    );
  }
  for (let i = 0; i < 14; i++) {
    const a = rand(0, TAU);
    const sp = rand(24, 84);
    sprayThuyKiem(
      state,
      x,
      y,
      Math.cos(a) * sp,
      Math.sin(a) * sp * 0.42,
      rand(0.4, 0.85),
      rand(1.6, 3.2),
      'spark'
    );
  }
  if (s.i === 1) {
    for (let j = 0; j < 20; j++) {
      const a = (j * TAU) / 20;
      sprayThuyKiem(
        state,
        x + Math.cos(a) * 16,
        y + Math.sin(a) * 6,
        -Math.sin(a) * rand(26, 78),
        -rand(42, 125),
        rand(0.55, 0.96),
        rand(1.4, 3.2),
        'aqua'
      );
    }
  }
  if (s.i === 2) {
    for (let j = 0; j < 46; j++) {
      const a = (j * TAU) / 46;
      const sp = rand(56, 220);
      sprayThuyKiem(
        state,
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp * 0.55 - rand(42, 120),
        rand(0.55, 1.16),
        rand(2.0, 5.0),
        j % 4 === 0 ? 'foam' : 'aqua'
      );
    }
  }

  state.rings.push({ x, y, r: 4, life: 0.7, max: 0.7, width: 3 });
  state.rings.push({ x, y, r: 4, life: 0.95, max: 0.95, width: 2 });
  for (let j = 0; j < 10; j++) {
    state.smokes.push({
      x: x + rand(-24, 24),
      y: y + rand(-8, 10),
      vx: rand(-18, 18),
      vy: rand(-48, -18),
      life: rand(0.35, 0.72),
      r: rand(10, 24),
    });
  }
}

export function stepThuyKiemParticles(state, dt) {
  state.world += dt;
  state.flash = Math.max(0, state.flash - dt);

  if (state.phase === 'seal') {
    const q = state.cast / THUY_KIEM_SPEC.castSeconds;
    const px = player.x + player.facing * 6;
    const py = player.y + (motion.bobOffset || 0);
    const a = rand(0, TAU);
    const rr = (18 + rand(0, 42) * q) * THUY_KIEM_SCALE;
    const x = px + Math.cos(a) * rr;
    const y = py - 34 + Math.sin(a) * rr * 0.6;
    const count = q > 0.65 ? 4 : 2;
    for (let i = 0; i < count; i++) {
      sprayThuyKiem(
        state,
        x + rand(-7, 7),
        y + rand(-4, 4),
        -Math.sin(a) * rand(5, 34),
        -rand(6, 50),
        rand(0.45, 0.9),
        rand(1.2, 3.0),
        'aqua'
      );
    }
    if (rnd() < dt * (14 + q * 20)) {
      state.rings.push({
        x: px,
        y: py - 10,
        r: 6,
        life: 0.9,
        max: 0.9,
        width: 1.2,
      });
    }
  } else if (state.phase === 'rise') {
    for (const r of state.rays) {
      r.u = Math.min(1, state.stage / THUY_KIEM_SPEC.raySeconds);
      const progress = easeOutCubic(r.u);
      const x =
        lerp(r.x, r.targetX, progress) +
        Math.sin(state.world * 34 + r.i) * 5 * (1 - progress);
      const y = lerp(r.y, r.skyY, progress);
      r.tail.push({ x, y });
      if (r.tail.length > 85) r.tail.shift();
      for (let i = 0; i < 3; i++) {
        sprayThuyKiem(
          state,
          x + rand(-6, 6),
          y + rand(-6, 6),
          rand(-32, 32),
          rand(10, 44),
          rand(0.2, 0.5),
          rand(1.2, 2.8),
          i === 0 ? 'foam' : 'spark'
        );
      }
    }
  } else if (state.phase === 'fall') {
    for (const s of state.swords) {
      if (s.land) continue;
      const local = state.stage - s.start;
      if (local < 0) continue;
      const p = clamp(local / THUY_KIEM_SPEC.strikeFallSeconds, 0, 1);
      const desiredX = state.anchorX + [-14, 0, 14][s.i];
      s.x = lerp(s.x, desiredX, dt * 6);
      s.targetY = state.anchorY - 10;
      s.portalY = s.targetY - 275 * THUY_KIEM_SCALE;
      s.tip = lerp(s.portalY, s.targetY, p * p);
      s.trail.push({ x: s.x, y: s.tip });
      if (s.trail.length > 12) s.trail.shift();
      for (let j = 0; j < 4; j++) {
        sprayThuyKiem(
          state,
          s.x + rand(-24, 24),
          s.tip - rand(5, 115),
          rand(-48, 48),
          rand(-45, 35),
          rand(0.25, 0.65),
          rand(1.2, 3.4),
          rnd() < 0.6 ? 'aqua' : 'foam'
        );
      }
    }
  }

  for (let i = state.fx.length - 1; i >= 0; i--) {
    const a = state.fx[i];
    a.life -= dt;
    if (a.life <= 0) {
      state.fx.splice(i, 1);
      continue;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.vy += (a.type === 'foam' ? 195 : a.type === 'aqua' ? 42 : 14) * dt;
    a.vx *= Math.pow(0.58, dt);
  }

  for (let i = state.rings.length - 1; i >= 0; i--) {
    const a = state.rings[i];
    a.life -= dt;
    if (a.life <= 0) {
      state.rings.splice(i, 1);
      continue;
    }
    a.r += (a.width >= 2.5 ? 135 : 92) * dt;
  }

  for (let i = state.smokes.length - 1; i >= 0; i--) {
    const a = state.smokes[i];
    a.life -= dt;
    if (a.life <= 0) {
      state.smokes.splice(i, 1);
      continue;
    }
    a.x += a.vx * dt;
    a.y += a.vy * dt;
  }

  for (let i = state.impactVisuals.length - 1; i >= 0; i--) {
    const a = state.impactVisuals[i];
    a.age += dt;
    if (a.age >= a.duration) {
      state.impactVisuals.splice(i, 1);
    }
  }
}

// ----------------------------------------------------------------------------
// Hàm vẽ Canvas 2D trong không gian thế giới (World-Space Rendering)
// ----------------------------------------------------------------------------

function rect(c, x, y, w, h, col) {
  c.fillStyle = col;
  c.fillRect(Math.round(x), Math.round(y), w, h);
}

function ellipse(c, x, y, rx, ry, stroke, fill, lw = 1) {
  if (rx <= 0 || ry <= 0) return;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function poly(c, pts, col, stroke, lw = 1) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  if (col) {
    c.fillStyle = col;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = lw;
    c.stroke();
  }
}

function gradCircle(c, x, y, r, mid, col) {
  if (r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, mid);
  g.addColorStop(1, col);
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawSeal(c, state, wx0, wy0) {
  if (state.phase !== 'seal') return;
  const q = clamp(state.cast / THUY_KIEM_SPEC.castSeconds, 0, 1);
  const t = state.world;
  const sc = THUY_KIEM_SCALE;

  const gx = player.x + player.facing * 6 - wx0;
  const gy = player.y + (motion.bobOffset || 0) - 18 - wy0;

  gradCircle(
    c,
    gx,
    gy,
    (38 + q * 37) * sc,
    `rgba(71,221,255,${0.16 + q * 0.22})`,
    'rgba(70,219,255,0)'
  );

  for (let k = 0; k < 3; k++) {
    const r = (18 + q * (13 + k * 5) + k * 9) * sc;
    const a = t * (k % 2 ? -1.7 : 1.4) + k * 1.3;
    c.save();
    c.translate(gx, gy);
    c.rotate(a);
    c.lineWidth = (1.4 + k * 0.35) * sc;
    c.strokeStyle = [
      'rgba(101,215,255,.65)',
      'rgba(220,251,255,.80)',
      'rgba(34,148,255,.60)',
    ][k];
    c.setLineDash([6 * sc, (4 + k * 2) * sc]);
    c.beginPath();
    c.ellipse(0, 0, r, r * 0.44, 0, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  const fy = gy - 8 * sc - 16 * sc * Math.sin(t * 2);
  for (let k = 0; k < 3; k++) {
    const a = t * 4 + (k * TAU) / 3;
    const r = (8 + q * 22) * sc;
    ellipse(
      c,
      gx + Math.cos(a) * r,
      fy + Math.sin(a) * r * 0.55,
      (2.5 + q) * sc,
      (2.5 + q) * sc,
      null,
      'rgba(198,247,255,.92)'
    );
  }

  // Pháp trận bát giác kết ấn
  c.save();
  c.translate(gx, gy);
  c.rotate(t * 0.4);
  c.strokeStyle = `rgba(121,230,255,${0.27 + q * 0.42})`;
  c.lineWidth = 1.2 * sc;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8;
    const rx = (20 + q * 22) * sc;
    const ry = (12 + q * 9) * sc;
    if (i) c.lineTo(Math.cos(a) * rx, Math.sin(a) * ry);
    else c.moveTo(Math.cos(a) * rx, Math.sin(a) * ry);
  }
  c.closePath();
  c.stroke();
  c.restore();

  // Thanh tiến trình kết ấn 5s trên đầu Diệp Tu
  const barY = gy - 98 * sc;
  c.save();
  c.fillStyle = 'rgba(10, 28, 44, 0.85)';
  c.fillRect(gx - 38, barY - 1, 76, 7);
  c.fillStyle = '#193b50';
  c.fillRect(gx - 36, barY, 72, 5);
  c.fillStyle = '#93edff';
  c.fillRect(gx - 36, barY, 72 * q, 5);
  c.font = 'bold 10px system-ui, sans-serif';
  c.textAlign = 'center';
  c.fillStyle = '#d8f8ff';
  c.shadowColor = '#04101c';
  c.shadowBlur = 4;
  c.fillText(`KẾT ẤN THỦY KIẾM · ${(THUY_KIEM_SPEC.castSeconds - state.cast).toFixed(1)}s`, gx, barY - 5);
  c.restore();
}

function drawRays(c, state, wx0, wy0) {
  if (state.phase !== 'rise') return;
  const sc = THUY_KIEM_SCALE;
  for (const r of state.rays) {
    if (r.tail.length < 2) continue;
    const head = r.tail[r.tail.length - 1];
    const hx = head.x - wx0;
    const hy = head.y - wy0;
    gradCircle(c, hx, hy, 22 * sc, 'rgba(189,255,255,.72)', 'rgba(71,194,255,0)');
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      r.tail.forEach((p, i) => {
        const dx = (k - 1) * 3 * sc;
        const px = p.x - wx0 + dx;
        const py = p.y - wy0;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      });
      c.strokeStyle = [
        'rgba(42,143,255,.38)',
        'rgba(145,241,255,.75)',
        'rgba(242,255,255,.94)',
      ][k];
      c.lineWidth = [13 * sc, 5 * sc, 1.6 * sc][k];
      c.lineCap = 'round';
      c.stroke();
    }
    ellipse(c, hx, hy, 4 * sc, 6 * sc, null, '#f4ffff');
  }
}

function drawSword(c, state, s, wx0, wy0) {
  if (s.land || state.stage < s.start) return;
  const x = s.x - wx0;
  const y = s.tip - wy0;
  const world = state.world;
  const progress = clamp((state.stage - s.start) / THUY_KIEM_SPEC.strikeFallSeconds, 0, 1);

  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(world * 9 + s.i) * 0.035);
  const swordScale = [1.18, 1.28, 1.57][s.i] * THUY_KIEM_SCALE;
  c.scale(swordScale, swordScale);
  c.globalAlpha = 1;

  const glow = c.createLinearGradient(-27, 0, 27, 0);
  glow.addColorStop(0, 'rgba(36,142,255,0)');
  glow.addColorStop(0.5, 'rgba(93,223,255,.27)');
  glow.addColorStop(1, 'rgba(36,142,255,0)');
  c.fillStyle = glow;
  c.fillRect(-27, -140, 54, 145);

  const blade = [
    [-17, -96],
    [-18, -53],
    [-14, -33],
    [0, 0],
    [14, -33],
    [18, -53],
    [17, -96],
  ];
  poly(c, blade, 'rgba(30,139,227,.79)', '#b4faff', 2.2);
  poly(
    c,
    [
      [-14, -94],
      [-12, -46],
      [-2, -9],
      [-1, -97],
    ],
    'rgba(117,237,255,.67)'
  );
  poly(
    c,
    [
      [2, -98],
      [13, -92],
      [12, -48],
      [2, -10],
    ],
    'rgba(30,86,180,.65)'
  );

  // Dòng thủy lưu nội kiếm chuyển động
  c.strokeStyle = 'rgba(235,255,255,.83)';
  c.lineWidth = 2;
  c.beginPath();
  for (let yy = -87; yy < -20; yy += 4) {
    const xx = -4 + Math.sin(yy * 0.16 + world * 8) * 3;
    if (yy === -87) c.moveTo(xx, yy);
    else c.lineTo(xx, yy);
  }
  c.stroke();

  c.strokeStyle = 'rgba(71,223,255,.93)';
  c.lineWidth = 1.4;
  c.beginPath();
  for (let yy = -94; yy < -21; yy += 3) {
    const xx = 6 + Math.sin(yy * 0.23 - world * 10) * 2.6;
    if (yy === -94) c.moveTo(xx, yy);
    else c.lineTo(xx, yy);
  }
  c.stroke();

  // Ấn văn nước dọc thân kiếm
  for (let k = 0; k < 4; k++) {
    const yy = -83 + k * 16;
    const pulse = 0.60 + 0.28 * Math.sin(world * 6 + k * 1.5 + s.i);
    c.strokeStyle = `rgba(238,255,255,${pulse})`;
    c.lineWidth = 1.05;
    c.beginPath();
    c.moveTo(-5, yy);
    c.lineTo(0, yy - 4);
    c.lineTo(5, yy);
    c.lineTo(0, yy + 4);
    c.closePath();
    c.stroke();
    c.strokeStyle = `rgba(100,230,255,${pulse * 0.8})`;
    c.beginPath();
    c.moveTo(-8, yy + 6);
    c.lineTo(8, yy + 6);
    c.stroke();
  }

  // Giọt sương dọc lưỡi kiếm
  for (let k = 0; k < 6; k++) {
    const yy = -96 + ((k / 6 + world * 0.75 + s.i * 0.1) % 1) * 89;
    const wiggle = Math.sin(yy * 0.22 + world * 8) * 1.3;
    rect(c, -17 + wiggle + (k % 2) * 29, yy, 1.5, 2, k % 3 ? '#adf5ff' : '#f5ffff');
  }

  // Chắn kiếm & chuôi kiếm thủy tinh
  poly(
    c,
    [
      [-30, -103],
      [-14, -108],
      [-5, -101],
      [5, -101],
      [14, -108],
      [30, -103],
      [22, -96],
      [13, -95],
      [7, -99],
      [-7, -99],
      [-13, -95],
      [-22, -96],
    ],
    '#2eaff0',
    '#d6ffff',
    1.5
  );
  poly(
    c,
    [
      [-4, -127],
      [4, -127],
      [4, -109],
      [-4, -109],
    ],
    '#79dfff',
    '#efffff',
    1.6
  );
  ellipse(c, 0, -130, 6, 7, '#eaffff', 'rgba(55,163,232,.85)', 1.5);
  ellipse(c, -2, -132, 1.5, 2, null, '#f9ffff');

  for (let k = 0; k < 9; k++) {
    const u = (k / 9 + world * 0.9) % 1;
    const sy = -94 + u * 88;
    const sx = (k % 2 ? -1 : 1) * (9 + Math.sin(u * 15 + world * 8) * 3);
    rect(c, sx, sy, 1.3, 2.4, k % 3 ? '#9af6ff' : '#efffff');
  }

  if (progress > 0.2) {
    c.strokeStyle = 'rgba(112,219,255,.25)';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-23, -141);
    c.lineTo(-19, -113);
    c.moveTo(24, -136);
    c.lineTo(20, -107);
    c.stroke();
  }
  c.restore();
}

function drawFall(c, state, wx0, wy0) {
  if (state.phase !== 'fall') return;
  const sc = THUY_KIEM_SCALE;
  const world = state.world;

  for (let i = 0; i < 3; i++) {
    const s = state.swords[i];
    if (!s || state.stage < s.start || s.land) continue;
    const sx = s.x - wx0;
    const portalY = s.portalY - wy0;
    const tipY = s.tip - wy0;

    gradCircle(
      c,
      sx,
      portalY - 24 * sc,
      (38 + (s.i === 2 ? 8 : 0)) * sc,
      'rgba(80,198,255,.24)',
      'rgba(88,205,255,0)'
    );
    ellipse(c, sx, portalY, 18 * sc, 3.5 * sc, 'rgba(122,232,255,.65)', null, 1.2 * sc);

    // Xoáy nước trên bầu trời mở cổng cho từng thanh cự kiếm
    c.save();
    c.translate(sx, portalY + 3 * sc);
    c.rotate(world * (s.i % 2 ? -1 : 1) * 1.5);
    for (let j = 0; j < 3; j++) {
      const rx = (19 + j * 8 + (s.i === 2 ? 5 : 0)) * sc;
      const ry = (4 + j * 1.8) * sc;
      c.beginPath();
      c.ellipse(
        0,
        0,
        rx,
        ry,
        j * 0.25,
        world * 0.7 + j * 0.6,
        world * 0.7 + TAU * 0.82 + j * 0.6
      );
      c.strokeStyle = `rgba(${j === 0 ? '225,252,255' : '90,202,255'},${0.62 - j * 0.15})`;
      c.lineWidth = 1.5 * sc;
      c.stroke();
    }
    c.restore();

    if (tipY > portalY - 20 * sc) {
      const trail = c.createLinearGradient(sx, portalY - 20 * sc, sx, tipY);
      trail.addColorStop(0, 'rgba(62,192,255,0)');
      trail.addColorStop(1, 'rgba(137,235,255,.22)');
      c.fillStyle = trail;
      c.fillRect(
        sx - 15 * sc,
        portalY - 18 * sc,
        30 * sc,
        Math.max(4, tipY - (portalY - 18 * sc))
      );
    }

    drawSword(c, state, s, wx0, wy0);
  }
}

function drawImpactVisuals(c, state, wx0, wy0) {
  const sc = THUY_KIEM_SCALE;
  const world = state.world;
  for (const a of state.impactVisuals) {
    const p = clamp(a.age / a.duration, 0, 1);
    const fade = (1 - p) * (1 - p);
    const x = a.x - wx0;
    const y = a.y - wy0;

    c.save();
    if (a.kind === 0) {
      // Kiếm 1: Sóng xung kích nước lan rộng tầm thấp
      for (let j = 0; j < 3; j++) {
        const r = (6 + p * (52 + j * 13)) * sc;
        ellipse(
          c,
          x,
          y + (5 + j * 3) * sc,
          r,
          (3 + p * 6) * sc,
          `rgba(125,228,255,${fade * (0.68 - j * 0.14)})`,
          null,
          (2 - j * 0.3) * sc
        );
      }
      for (let k = 0; k < 8; k++) {
        const ang = Math.PI * (1.05 + (k / 7) * 0.9);
        const r = (12 + 48 * p) * Math.sin(((k + 1) / 9) * Math.PI) * sc;
        const sx = x + Math.cos(ang) * r;
        const sy = y + 4 * sc + Math.sin(ang) * 16 * (1 - p) * sc;
        rect(c, sx, sy, 2 * sc, 2.3 * sc, k % 2 ? '#7ddfff' : '#dfffff');
      }
    } else if (a.kind === 1) {
      // Kiếm 2: Phễu nước xoáy cuốn thẳng đứng
      for (let strand = 0; strand < 3; strand++) {
        c.strokeStyle = `rgba(${strand === 1 ? '210,248,255' : '68,191,255'},${fade * 0.72})`;
        c.lineWidth = (1.8 + strand * 0.5) * sc;
        c.beginPath();
        for (let k = 0; k <= 23; k++) {
          const u = k / 23;
          const yy = y - 4 * sc - u * 88 * (1 - p) * sc;
          const radius = (12 + u * 11) * (1 - p * 0.25) * sc;
          const xx = x + Math.cos(u * TAU * 2.4 + world * 10 + (strand * TAU) / 3) * radius;
          if (k) c.lineTo(xx, yy);
          else c.moveTo(xx, yy);
        }
        c.stroke();
      }
      ellipse(
        c,
        x,
        y + 5 * sc,
        (23 + p * 32) * sc,
        (4 + p * 8) * sc,
        `rgba(105,221,255,${fade * 0.6})`,
        null,
        2 * sc
      );
    } else {
      // Kiếm 3: Cột thủy trụ xung thiên + sóng nước bùng nổ
      const width = (9 + 16 * p) * sc;
      const top = y - (142 - 95 * p) * sc;
      const g = c.createLinearGradient(0, top, 0, y);
      g.addColorStop(0, `rgba(190,248,255,${fade * 0.08})`);
      g.addColorStop(0.55, `rgba(93,210,255,${fade * 0.30})`);
      g.addColorStop(1, `rgba(210,255,255,${fade * 0.49})`);
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(x - width * 0.2, top);
      c.lineTo(x + width * 0.2, top);
      c.lineTo(x + width, y);
      c.lineTo(x - width, y);
      c.closePath();
      c.fill();

      for (let j = 0; j < 4; j++) {
        const r = (8 + p * (49 + j * 14)) * sc;
        ellipse(
          c,
          x,
          y + (5 + j * 1.5) * sc,
          r,
          (5 + p * (5 + j)) * sc,
          `rgba(${j % 2 ? '63,190,255' : '214,252,255'},${fade * (0.9 - j * 0.14)})`,
          null,
          (3 - j * 0.4) * sc
        );
      }
      for (let k = 0; k < 12; k++) {
        const ang = (k * TAU) / 12;
        const rr = (10 + p * (53 + (k % 3) * 8)) * sc;
        const sx = x + Math.cos(ang) * rr;
        const sy = y + Math.sin(ang) * rr * 0.34;
        rect(c, sx, sy, 2.5 * sc, 3 * sc, k % 3 ? '#91e8ff' : '#f5ffff');
      }
    }
    c.restore();
  }
}

function drawWaterBind(c, state, slowTarget, slowRemaining, wx0, wy0) {
  if (!slowTarget || slowRemaining <= 0) return;
  const sc = THUY_KIEM_SCALE;
  const t = state.world;
  const fade = clamp(slowRemaining / 0.7, 0, 1);
  const x = slowTarget.x - wx0;
  const y = slowTarget.y - 12 - wy0;

  c.save();
  // Hào quang làm chậm quanh thân mục tiêu
  gradCircle(
    c,
    x,
    y - 34 * sc,
    39 * sc,
    `rgba(84,208,255,${0.16 * fade})`,
    'rgba(72,216,255,0)'
  );

  // 3 dải thủy lưu xoay quanh chân và thân mục tiêu đang bị làm chậm 65%
  for (let band = 0; band < 3; band++) {
    const yy = y - (4 + band * 14) * sc;
    const rx = (20 + band * 2.8) * sc;
    c.strokeStyle = `rgba(110,222,255,${(0.36 + band * 0.09) * fade})`;
    c.lineWidth = (band === 1 ? 2.4 : 1.5) * sc;
    c.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = (k * TAU) / 32;
      const xx = x + Math.cos(a + t * 2.8 + band * 2.2) * rx;
      const py = yy + Math.sin(a + t * 2.8 + band * 2.2) * 5.8 * sc;
      if (k) c.lineTo(xx, py);
      else c.moveTo(xx, py);
    }
    c.stroke();

    for (let k = 0; k < 5; k++) {
      const a = (k * TAU) / 5 - t * 2 + band;
      const xx = x + Math.cos(a) * rx;
      const py = yy + Math.sin(a) * 5.5 * sc;
      rect(c, xx, py, 2.2 * sc, 2.2 * sc, k % 2 ? '#bff5ff' : '#53caff');
    }
  }
  c.restore();
}

export function renderThuyKiemWorld(state, slowTarget, slowRemaining) {
  const c = game.ctx;
  if (!c || settings.fxQuality === 'off') return;

  const hasActiveSkill =
    state.phase === 'seal' ||
    state.phase === 'rise' ||
    state.phase === 'fall' ||
    state.fx.length > 0 ||
    state.rings.length > 0 ||
    state.smokes.length > 0 ||
    state.impactVisuals.length > 0 ||
    (slowTarget && slowRemaining > 0);

  if (!hasActiveSkill) return;

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  const sc = THUY_KIEM_SCALE;

  c.save();
  drawSeal(c, state, wx0, wy0);
  drawRays(c, state, wx0, wy0);
  drawFall(c, state, wx0, wy0);

  for (const a of state.rings) {
    const alp = Math.pow(clamp(a.life / a.max, 0, 1), 1.5);
    const rx = a.x - wx0;
    const ry = a.y - wy0;
    ellipse(
      c,
      rx,
      ry,
      a.r * sc,
      a.r * 0.28 * sc,
      `rgba(156,236,255,${alp * 0.85})`,
      null,
      a.width * sc
    );
    ellipse(
      c,
      rx,
      ry,
      a.r * 0.7 * sc,
      a.r * 0.18 * sc,
      `rgba(45,147,236,${alp * 0.58})`,
      null,
      1 * sc
    );
  }

  for (const a of state.smokes) {
    const alp = clamp(a.life / 0.7, 0, 1) * 0.22;
    gradCircle(
      c,
      a.x - wx0,
      a.y - wy0,
      a.r * sc,
      `rgba(117,212,247,${alp})`,
      'rgba(119,218,250,0)'
    );
  }

  for (const a of state.fx) {
    const alp = clamp(a.life / a.max, 0, 1);
    const color =
      a.type === 'foam'
        ? '244,255,255'
        : a.type === 'spark'
        ? '160,241,255'
        : '72,195,247';
    const px = a.x - wx0;
    const py = a.y - wy0;
    c.fillStyle = `rgba(${color},${alp})`;
    c.fillRect(
      Math.round(px),
      Math.round(py),
      Math.max(1, a.size * sc),
      Math.max(1, a.size * 0.9 * sc)
    );
    if (a.size >= 2.6 && a.type === 'foam') {
      rect(c, px - 1, py - 1, 1.2 * sc, 1.2 * sc, `rgba(255,255,255,${alp})`);
    }
  }

  drawImpactVisuals(c, state, wx0, wy0);
  drawWaterBind(c, state, slowTarget, slowRemaining, wx0, wy0);
  c.restore();
}
