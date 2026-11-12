// ============================================================================
// MODULE: NGŨ HÀNH DIỆT SÁT TRẬN (KỸ NĂNG 05 · PixelFX Duy Trì V2 Offline)
// Nguồn: /Ngu_Hanh_Diet_Sat_Tran_PixelFX_Duy_Tri_V2_OFFLINE.html
// Cơ chế:
//  - Nhấn Phím 5 hoặc nút Kỹ năng 5 để KHAI TRẬN (tiêu hao 200 linh lực).
//  - Pha 1 (NGŨ LINH - launch): 5 luồng linh quang (Hỏa, Thủy, Lôi, Thổ, Mộc) phóng từ
//    tay Diệp Tu tới bao vây khóa chặt mục tiêu.
//  - Pha 2 (DỰNG TRẬN - form 0.85s): Mở đại trận 2 tầng dưới chân và dựng 5 linh trụ
//    ngũ hành giam cầm cứng mục tiêu tại tâm trận.
//  - Pha 3 (PHONG TỎA / QUÁ TẢI - prison): Giam cầm mục tiêu liên tục và rút máu bằng
//    5 nguyên tố (100 sát thương/giây · 50 sát thương mỗi nhịp 0.5s).
//    + 20 giây đầu: Tiêu hao 10 linh lực/giây.
//    + Sau 20 giây (QUÁ TẢI): Giây 21 tốn 11 MP/s, giây 22 tốn 12 MP/s (+1 MP/s mỗi giây).
//  - Pha 4 & 5 (QUY NHẤT & BẠO SÁT - converge 0.74s -> blast 1.7s):
//    Khi cạn linh lực hoặc người chơi nhấn Phím 5 / nút Kỹ năng 5 lần nữa để THU TRẬN,
//    5 linh trụ ép vào tâm trận và kích hoạt NGŨ HÀNH BẠO SÁT (+200 sát thương kết liễu).
// ============================================================================

import { game, camera, settings, player, motion, clamp } from './state.js';

const PixelFX = window.PK_PIXELFX;
if (!PixelFX) {
  throw new Error('PixelFX bundle must load before ngu-hanh.js');
}

const { createFrame, clearFrame, painterFor, composite } = PixelFX;

const rgb = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

function hex(h) {
  if (typeof h === 'number') return h;
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s.slice(0, 6), 16);
  return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
}

const TAU = Math.PI * 2;

export const NGU_HANH_SCALE = 1.18;

export const NGU_HANH_ELEMENTS = [
  { id: 'fire', label: 'HỎA', c: '#ff7446', bright: '#fff0bc', dark: '#9e232d', ang: -2.25 },
  { id: 'water', label: 'THỦY', c: '#50d1fd', bright: '#edfcff', dark: '#0869aa', ang: -0.35 },
  { id: 'thunder', label: 'LÔI', c: '#ffe27a', bright: '#ffffff', dark: '#b17a1b', ang: -1.55 },
  { id: 'earth', label: 'THỔ', c: '#d4a26c', bright: '#ffedb5', dark: '#6b4635', ang: 2.84 },
  { id: 'wood', label: 'MỘC', c: '#86e88b', bright: '#e5ffd1', dark: '#1f8664', ang: 0.85 },
];

export const NGU_HANH_SPEC = Object.freeze({
  slot: 5,
  code: 'Digit5',
  kind: 'five_elements',
  name: 'NGŨ HÀNH',
  fullName: 'NGŨ HÀNH DIỆT SÁT TRẬN',
  initialManaCost: 40,
  baseLimitSeconds: 20,
  baseDrainPerSecond: 10,
  overtimeStepPerSecond: 1,
  pulseIntervalSeconds: 0.50,
  pulseDamage: 50, // 5 nguyên tố × 10 = 50 sát thương mỗi 0.5s (100 sát thương/giây)
  finisherDamage: 200,
  formSeconds: 0.85,
  convergeSeconds: 0.74,
  blastSeconds: 1.70,
  radiusX: 82,
  radiusY: 29,
  scale: NGU_HANH_SCALE,
});

// Khung đệm PixelFX cho pháp trận mặt đất & xoáy nước tâm trận
const PFX_W = 240;
const PFX_H = 140;
const pfxFrame = createFrame(PFX_W, PFX_H);
const pfxCanvas = document.createElement('canvas');
pfxCanvas.width = PFX_W;
pfxCanvas.height = PFX_H;
const pfxCtx = pfxCanvas.getContext('2d');
const pfxImg = pfxCtx.createImageData(PFX_W, PFX_H);

const RUNE_COLORS = ['#225e72', '#368ca0', '#61afc1', '#8ce9f5', '#d6f8ee', '#ffffff'].map(hex);
const WATER_COLORS = ['#103853', '#17668c', '#1c8cac', '#2cabbc', '#67d7e0', '#b4f4f6'].map(hex);

let seed = 41377;
const rnd = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a, b) => a + (b - a) * rnd();
const ease = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

function rgba(hexStr, alpha) {
  if (!hexStr.startsWith('#')) return hexStr;
  let q = hexStr.slice(1);
  if (q.length === 3) q = q[0] + q[0] + q[1] + q[1] + q[2] + q[2];
  return `rgba(${parseInt(q.slice(0, 2), 16)},${parseInt(q.slice(2, 4), 16)},${parseInt(
    q.slice(4, 6),
    16
  )},${alpha})`;
}

export function computeVertices(stageX, stageY) {
  const R = NGU_HANH_SPEC.radiusX * NGU_HANH_SCALE;
  const Ry = NGU_HANH_SPEC.radiusY * NGU_HANH_SCALE;
  return NGU_HANH_ELEMENTS.map((e) => ({
    ...e,
    vx: stageX + Math.cos(e.ang) * R,
    vy: stageY + Math.sin(e.ang) * Ry,
  }));
}

export function createNguHanhState() {
  return {
    phase: 'idle', // 'idle' | 'launch' | 'form' | 'prison' | 'converge' | 'blast'
    now: 0,
    clock: 0,
    lockSec: 0,
    pulses: 0,
    totalDamage: 0,
    flash: 0,
    targetId: null,
    stageX: 0,
    stageY: 0,
    vertices: [],
    sequence: [],
    particles: [],
    ripples: [],
    overloadedNotified: false,
  };
}

export function addNguHanhParticle(state, p) {
  if (state.particles.length >= 690) state.particles.splice(0, 15);
  p.age = 0;
  p.max = p.life ?? 0.6;
  p.gravity ??= 0;
  p.size ??= 1.5;
  p.gl ??= 0;
  state.particles.push(p);
}

export function addNguHanhRing(state, x, y, r, col, life = 0.8, speed = 1) {
  state.ripples.push({ x, y, r, col, age: 0, life, speed });
}

export function explosionNguHanhParticles(state, x, y, col, n = 20, amp = 1) {
  const sc = NGU_HANH_SCALE;
  for (let i = 0; i < n; i++) {
    const a = range(0, TAU);
    const v = range(8, 60) * amp * sc;
    addNguHanhParticle(state, {
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v * 0.75,
      life: range(0.28, 0.85),
      col,
      size: range(1.1, 2.7),
      gl: rnd() < 0.24,
      gravity: 25 * sc,
    });
  }
}

export function getNguHanhUpkeepRate(lockSec) {
  if (lockSec < NGU_HANH_SPEC.baseLimitSeconds) return NGU_HANH_SPEC.baseDrainPerSecond;
  const overtime = Math.floor(lockSec - NGU_HANH_SPEC.baseLimitSeconds) + 1;
  return NGU_HANH_SPEC.baseDrainPerSecond + NGU_HANH_SPEC.overtimeStepPerSecond * overtime;
}

export function drainNguHanhMana(startElapsed, dt) {
  let remaining = dt;
  let elapsed = startElapsed;
  let spent = 0;
  const BASE_LIMIT = NGU_HANH_SPEC.baseLimitSeconds;
  const BASE_DRAIN = NGU_HANH_SPEC.baseDrainPerSecond;
  const STEP = NGU_HANH_SPEC.overtimeStepPerSecond;

  while (remaining > 1e-8) {
    const nextBoundary =
      elapsed < BASE_LIMIT ? BASE_LIMIT : BASE_LIMIT + Math.floor(elapsed - BASE_LIMIT) + 1;
    const segment = Math.min(remaining, Math.max(1e-8, nextBoundary - elapsed));
    const rate =
      elapsed < BASE_LIMIT
        ? BASE_DRAIN
        : BASE_DRAIN + STEP * (Math.floor(elapsed - BASE_LIMIT) + 1);
    spent += segment * rate;
    elapsed += segment;
    remaining -= segment;
  }

  const actual = Math.min(player.mana, spent);
  player.mana = Math.max(0, player.mana - actual);
  player.lastManaCost = actual;
  return actual < spent - 1e-6 || player.mana <= 1e-6;
}

export function startNguHanhLaunch(state, targetStageX, targetStageY, targetId = null) {
  state.phase = 'launch';
  state.clock = 0;
  state.lockSec = 0;
  state.pulses = 0;
  state.totalDamage = 0;
  state.flash = 0;
  state.overloadedNotified = false;
  state.targetId = targetId;
  state.stageX = targetStageX;
  state.stageY = targetStageY;
  state.vertices = computeVertices(targetStageX, targetStageY);
  state.particles = [];
  state.ripples = [];

  const fromX = player.x + player.facing * 16;
  const fromY = player.y + (motion.bobOffset || 0) - 58;
  state.sequence = state.vertices.map((e, i) => ({
    e,
    x: fromX,
    y: fromY,
    progress: 0,
    delay: i * 0.09,
    trail: [],
  }));

  for (let i = 0; i < 70; i++) {
    const e = state.vertices[i % 5];
    const a = range(0, TAU);
    const r = range(6, 44) * NGU_HANH_SCALE;
    addNguHanhParticle(state, {
      x: player.x + Math.cos(a) * r,
      y: player.y - 48 + Math.sin(a) * r * 0.65,
      vx: -Math.cos(a) * r * 0.9,
      vy: -Math.sin(a) * r * 0.45 - 10,
      life: 0.48,
      size: range(1.1, 2.4),
      col: e.c,
      gl: 1,
    });
  }
}

export function startNguHanhForm(state) {
  state.phase = 'form';
  state.clock = 0;
  state.vertices = computeVertices(state.stageX, state.stageY);
  for (let j = 0; j < 5; j++) {
    const e = state.vertices[j];
    explosionNguHanhParticles(state, e.vx, e.vy, e.c, 19, 1.5);
    addNguHanhRing(state, e.vx, e.vy, 10 * NGU_HANH_SCALE, e.c, 0.65, 0.65);
  }
}

export function startNguHanhPrison(state) {
  state.phase = 'prison';
  state.clock = 0;
  state.lockSec = 0;
  state.pulses = 0;
}

export function startNguHanhConverge(state) {
  state.phase = 'converge';
  state.clock = 0;
  state.flash = 0.25;
}

export function startNguHanhDetonate(state) {
  state.phase = 'blast';
  state.clock = 0;
  state.flash = 1.0;
  const sc = NGU_HANH_SCALE;
  const cx = state.stageX;
  const cy = state.stageY - 59 * sc;

  for (let j = 0; j < 5; j++) {
    const e = state.vertices[j] || NGU_HANH_ELEMENTS[j];
    for (let k = 0; k < 60; k++) {
      const a = e.ang + range(-0.8, 0.8);
      const sp = range(22, 145) * sc;
      addNguHanhParticle(state, {
        x: cx,
        y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.75,
        life: range(0.5, 1.35),
        size: range(1.2, 3.8),
        col: k % 3 === 0 ? e.bright : e.c,
        gl: k % 2,
        gravity: range(14, 52) * sc,
      });
    }
    addNguHanhRing(state, cx, cy, 5 * sc, e.c, 1.2, 1 + j * 0.16);
  }
}

export function triggerNguHanhBeatVisuals(state, el) {
  const sc = NGU_HANH_SCALE;
  const sx = state.stageX;
  const sy = state.stageY;
  const x = sx + range(-12, 12) * sc;
  const y = sy - 42 * sc;

  switch (el.id) {
    case 'fire':
      for (let j = 0; j < 20; j++) {
        addNguHanhParticle(state, {
          x: x + range(-25, 25) * sc,
          y: y + range(3, 38) * sc,
          vx: range(-14, 14) * sc,
          vy: range(-72, -28) * sc,
          col: j % 5 === 0 ? '#fff4ac' : j % 3 === 0 ? '#ffca54' : '#ff653b',
          life: range(0.3, 0.75),
          size: range(1.6, 4.2),
          gl: 0.5,
        });
      }
      break;
    case 'water':
      for (let j = 0; j < 25; j++) {
        const a = range(0, TAU);
        const rr = range(16, 44) * sc;
        addNguHanhParticle(state, {
          x: sx + Math.cos(a) * rr,
          y: sy - 25 * sc + Math.sin(a) * rr * 0.32,
          vx: -Math.sin(a) * 44 * sc,
          vy: -Math.cos(a) * 20 * sc - range(1, 10) * sc,
          col: j % 4 === 0 ? '#eaffff' : '#60ccff',
          life: range(0.3, 0.9),
          size: range(1.1, 2.2),
          gl: 0.2,
        });
      }
      addNguHanhRing(state, sx, sy - 2 * sc, 12 * sc, '#8eeaff', 0.65, 0.85);
      break;
    case 'thunder':
      for (let j = 0; j < 36; j++) {
        const a = range(0, TAU);
        const v = range(22, 82) * sc;
        addNguHanhParticle(state, {
          x,
          y: y - 22 * sc,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          col: j % 2 ? '#fff3a5' : '#ffffff',
          life: range(0.14, 0.45),
          size: range(1.1, 2.2),
          gl: 1,
        });
      }
      state.flash = Math.max(state.flash, 0.13);
      break;
    case 'earth':
      for (let j = 0; j < 25; j++) {
        const a = range(0, Math.PI);
        const v = range(22, 58) * sc;
        addNguHanhParticle(state, {
          x: x + range(-26, 26) * sc,
          y: sy + range(-2, 9) * sc,
          vx: Math.cos(a) * v,
          vy: -Math.sin(a) * v - range(7, 22) * sc,
          life: range(0.35, 0.8),
          col: j % 3 === 0 ? '#f1d39c' : '#bd9564',
          size: range(1.2, 3.8),
          gravity: 95 * sc,
        });
      }
      break;
    case 'wood':
      for (let j = 0; j < 22; j++) {
        const a = range(0, TAU);
        const v = range(19, 50) * sc;
        addNguHanhParticle(state, {
          x: x + range(-24, 24) * sc,
          y: y + range(-12, 22) * sc,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v - 14 * sc,
          life: range(0.35, 0.75),
          col: j % 4 === 0 ? '#e3ffba' : '#73df9b',
          size: range(1.6, 3.8),
          gravity: 11 * sc,
        });
      }
      break;
  }
}

export function stepNguHanhParticlesAndStreams(state, dt) {
  state.now += dt;
  state.flash = Math.max(0, state.flash - dt * 2.6);
  const sc = NGU_HANH_SCALE;

  if (state.phase === 'launch') {
    state.vertices = computeVertices(state.stageX, state.stageY);
    const fromX = player.x + player.facing * 14;
    const fromY = player.y + (motion.bobOffset || 0) - 52;
    let complete = 0;
    state.sequence.forEach((s, i) => {
      s.e = state.vertices[i];
      const t = clamp((state.clock - s.delay) / (1.05 + i * 0.035), 0, 1);
      s.progress = ease(t);
      const bend = Math.sin(t * Math.PI) * (24 + (i % 3) * 7) * sc;
      const sy0 = fromY + (i - 2) * 4 * sc;
      const x = lerp(fromX, s.e.vx, s.progress);
      const y = lerp(sy0, s.e.vy - 35 * sc, s.progress) - bend;
      s.x = x;
      s.y = y;
      if (t > 0 && t < 1) {
        if (rnd() < 0.7) {
          addNguHanhParticle(state, {
            x: x + range(-2, 2) * sc,
            y: y + range(-2, 2) * sc,
            vx: range(-20, 20) * sc,
            vy: range(-18, 18) * sc,
            life: range(0.18, 0.42),
            size: range(1.1, 2.2),
            col: s.e.c,
            gl: 1,
          });
        }
        s.trail.push({ x, y });
        if (s.trail.length > 12) s.trail.shift();
      }
      if (t >= 1) complete++;
    });
    return complete === 5;
  }

  if (state.phase === 'form') {
    for (let j = 0; j < 5; j++) {
      const e = state.vertices[j];
      if (rnd() < dt * 29) {
        addNguHanhParticle(state, {
          x: e.vx + range(-6, 6) * sc,
          y: state.stageY - 6 * sc - range(0, 88) * sc,
          vx: range(-6, 6) * sc,
          vy: range(-14, -4) * sc,
          life: range(0.3, 0.75),
          size: range(1.1, 2.2),
          col: e.c,
          gl: 1,
        });
      }
    }
  } else if (state.phase === 'prison') {
    for (let j = 0; j < 5; j++) {
      const e = state.vertices[j];
      const cx = e.vx;
      const cy = e.vy - 34 * sc;
      if (rnd() < dt * 38) {
        const a = range(0, TAU);
        const rr = range(3, 20) * sc;
        addNguHanhParticle(state, {
          x: cx + Math.cos(a) * rr * 0.35,
          y: cy + Math.sin(a) * rr,
          vx: range(-10, 10) * sc,
          vy: range(-28, -5) * sc,
          life: range(0.23, 0.65),
          size: range(0.9, 2.4),
          col: rnd() < 0.12 ? e.bright : e.c,
          gl: rnd() < 0.13,
        });
      }
    }
  } else if (state.phase === 'converge') {
    const u = 1 - clamp(state.clock / NGU_HANH_SPEC.convergeSeconds, 0, 1);
    for (let j = 0; j < 5; j++) {
      const e = state.vertices[j];
      for (let k = 0; k < 3; k++) {
        const a = range(0, TAU);
        const r = range(8, 25) * sc;
        addNguHanhParticle(state, {
          x: lerp(state.stageX, e.vx, u) + Math.cos(a) * r * 0.3,
          y: lerp(state.stageY - 55 * sc, e.vy - 43 * sc, u) + Math.sin(a) * r * 0.3,
          vx: (state.stageX - e.vx) * 1.7,
          vy: (state.stageY - 55 * sc - (e.vy - 43 * sc)) * 1.7,
          life: range(0.22, 0.5),
          size: range(1.1, 3.2),
          col: e.c,
          gl: 1,
        });
      }
    }
  }

  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.age += dt;
    if (p.age >= p.max) {
      state.particles.splice(i, 1);
      continue;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += p.gravity * dt;
    p.vx *= Math.pow(0.72, dt);
  }

  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const r = state.ripples[i];
    r.age += dt;
    r.r += 82 * sc * r.speed * dt;
    if (r.age >= r.life) {
      state.ripples.splice(i, 1);
    }
  }

  return false;
}

// ----------------------------------------------------------------------------
// Vẽ hiệu ứng Ngũ Hành Diệt Sát Trận (2 lớp Back & Front quanh nhân vật và NPC)
// ----------------------------------------------------------------------------

function linePath(g, points, color, width = 1, alpha = 1) {
  g.beginPath();
  points.forEach((p, i) => (i === 0 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1])));
  g.lineWidth = width;
  g.strokeStyle = color;
  g.globalAlpha = alpha;
  g.stroke();
  g.globalAlpha = 1;
}

function glow(g, x, y, r, col, alpha = 0.22) {
  if (alpha < 0.003 || r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, alpha));
  gr.addColorStop(0.35, rgba(col, alpha * 0.35));
  gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

function ellipse(g, x, y, rx, ry, color, fill = false, width = 1) {
  if (rx <= 0 || ry <= 0) return;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, TAU);
  if (fill) {
    g.fillStyle = color;
    g.fill();
  } else {
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
  }
}

function polygon(g, pts, fill, stroke = '', width = 1) {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  if (fill) {
    g.fillStyle = fill;
    g.fill();
  }
  if (stroke) {
    g.lineWidth = width;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

function spark(g, x, y, col, size = 2, a = 1) {
  g.save();
  g.globalAlpha = a;
  g.strokeStyle = col;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x - size, y);
  g.lineTo(x + size, y);
  g.moveTo(x, y - size);
  g.lineTo(x, y + size);
  g.stroke();
  g.restore();
}

function drawMiniRunes(g, x, y, rx, ry, n, col, alpha, t) {
  const sc = NGU_HANH_SCALE;
  g.save();
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) * TAU) / n + t;
    const cx = x + Math.cos(a) * rx;
    const cy = y + Math.sin(a) * ry;
    g.save();
    g.translate(cx, cy);
    g.rotate(a + Math.PI / 2);
    g.strokeStyle = col;
    g.lineWidth = 0.9 * sc;
    const s = i % 4;
    if (s === 0) {
      g.strokeRect(-2 * sc, -2 * sc, 4 * sc, 4 * sc);
    } else if (s === 1) {
      g.beginPath();
      g.moveTo(-2 * sc, -3 * sc);
      g.lineTo(0, 2 * sc);
      g.lineTo(2 * sc, -3 * sc);
      g.stroke();
    } else if (s === 2) {
      g.beginPath();
      g.moveTo(-2 * sc, 0);
      g.lineTo(2 * sc, 0);
      g.moveTo(0, -3 * sc);
      g.lineTo(0, 3 * sc);
      g.stroke();
    } else {
      g.beginPath();
      g.moveTo(-2 * sc, 2 * sc);
      g.lineTo(0, -3 * sc);
      g.lineTo(2 * sc, 2 * sc);
      g.stroke();
    }
    g.restore();
  }
  g.restore();
}

function drawPixelFxGroundCore(g, state, x, y, intensity) {
  clearFrame(pfxFrame);
  const p = painterFor(pfxFrame);
  const cx = PFX_W / 2;
  const cy = PFX_H / 2;
  const t = state.now;

  // Vòng cổ ngữ PixelFX + xoáy nước đáy trận
  p.glow(cx, cy, 46, RUNE_COLORS[3], 0.22 * intensity);
  for (let r = 0; r < 3; r++) {
    const rx = 26 + r * 22;
    const ry = 9 + r * 8;
    const steps = 48 + r * 16;
    for (let i = 0; i < steps; i++) {
      const a = (i * TAU) / steps + t * (r % 2 ? -0.9 : 1.1);
      const px = cx + Math.cos(a) * rx;
      const py = cy + Math.sin(a) * ry;
      const col = r === 1 ? WATER_COLORS[(i + Math.floor(t * 12)) % WATER_COLORS.length] : RUNE_COLORS[(i + r * 2) % RUNE_COLORS.length];
      p.dot(px, py, col, (0.55 - r * 0.12) * intensity);
    }
  }

  composite(pfxFrame, pfxImg.data, null, 0.78);
  pfxCtx.putImageData(pfxImg, 0, 0);

  const sc = NGU_HANH_SCALE;
  g.save();
  g.globalAlpha = 0.72 * intensity;
  g.drawImage(
    pfxCanvas,
    x - (PFX_W * sc) / 2,
    y - (PFX_H * sc) / 2,
    PFX_W * sc,
    PFX_H * sc
  );
  g.restore();
}

function drawFloorSigil(g, state, wx0, wy0, opacity = 1) {
  const sc = NGU_HANH_SCALE;
  const x = state.stageX - wx0;
  const y = state.stageY - wy0;
  const R = NGU_HANH_SPEC.radiusX * sc;
  const Ry = NGU_HANH_SPEC.radiusY * sc;

  g.save();
  g.globalAlpha = opacity;
  glow(g, x, y, 112 * sc, '#5d9fd5', 0.14 * opacity);
  ellipse(g, x, y, R + 8 * sc, Ry + 5 * sc, '#9bd8eb33', false, 2 * sc);
  ellipse(g, x, y, R, Ry, '#b0e1fa99', false, 2 * sc);
  ellipse(g, x, y, R - 9 * sc, Ry - 4 * sc, '#3ca6be66', false, 1 * sc);
  ellipse(g, x, y, 20 * sc, 8 * sc, '#d8f3ff70', false, 1 * sc);

  drawMiniRunes(g, x, y, R - 16 * sc, Ry - 6 * sc, 30, '#b7eeff', 0.62, state.now * 0.28);

  // Ngũ giác tinh 5 màu nối 5 đỉnh linh trụ
  const pts = state.vertices.map((e) => [e.vx - wx0, e.vy - wy0]);
  if (pts.length === 5) {
    const sorted = [0, 2, 4, 1, 3, 0];
    for (let j = 0; j < 5; j++) {
      const a = pts[sorted[j]];
      const b = pts[sorted[j + 1]];
      linePath(g, [a, b], rgba(state.vertices[j].c, 0.45), 1.3 * sc);
    }
    for (const e of state.vertices) {
      const vx = e.vx - wx0;
      const vy = e.vy - wy0;
      glow(g, vx, vy, 13 * sc, e.c, 0.22);
      g.fillStyle = e.bright;
      g.fillRect(vx - 1.5 * sc, vy - 1.5 * sc, 3 * sc, 3 * sc);
    }
  }
  g.restore();
}

function drawSpire(g, state, e, intensity, front, wx0, wy0) {
  if (front !== undefined && (e.vy > state.stageY) !== front) return;
  const sc = NGU_HANH_SCALE;
  const x = e.vx - wx0;
  const y = e.vy - wy0;
  const top = y - 105 * sc * intensity;

  const gr = g.createLinearGradient(x, y, x, top);
  gr.addColorStop(0, rgba(e.c, 0.02));
  gr.addColorStop(0.14, rgba(e.c, 0.24 * intensity));
  gr.addColorStop(0.82, rgba(e.c, 0.09));
  gr.addColorStop(1, rgba(e.c, 0.01));
  polygon(
    g,
    [
      [x - 9 * sc, y],
      [x - 7 * sc, top],
      [x + 7 * sc, top],
      [x + 9 * sc, y],
    ],
    gr
  );

  g.strokeStyle = rgba(e.bright, 0.62 * intensity);
  g.lineWidth = 1.1 * sc;
  g.beginPath();
  g.moveTo(x - 5 * sc, y);
  g.lineTo(x - 4 * sc, top + 3 * sc);
  g.lineTo(x + 4 * sc, top + 3 * sc);
  g.lineTo(x + 5 * sc, y);
  g.stroke();

  for (let j = 0; j < 5; j++) {
    const yy =
      y -
      18 * sc -
      j * 18 * sc * intensity +
      Math.sin(state.now * 1.8 + j + e.ang) * 1.2 * sc;
    g.strokeStyle = rgba(e.c, 0.25 * intensity);
    g.beginPath();
    g.moveTo(x - 5 * sc, yy);
    g.lineTo(x + 5 * sc, yy);
    g.stroke();
  }

  // Ấn phù ngũ hành xoay trên đỉnh mỗi linh trụ
  glow(g, x, top + 4 * sc, 17 * sc, e.c, 0.28 * intensity);
  g.save();
  g.translate(x, top + 3 * sc);
  g.rotate(state.now * 0.55 + e.ang);
  g.strokeStyle = rgba(e.bright, 0.9 * intensity);
  g.lineWidth = 1.4 * sc;
  g.beginPath();
  g.moveTo(0, -8 * sc);
  g.lineTo(6 * sc, 0);
  g.lineTo(0, 8 * sc);
  g.lineTo(-6 * sc, 0);
  g.closePath();
  g.stroke();
  g.fillStyle = rgba(e.c, 0.75 * intensity);
  g.fillRect(-2 * sc, -2 * sc, 4 * sc, 4 * sc);
  g.restore();
}

function drawCage(g, state, phaseFactor, front, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  const x = state.stageX - wx0;
  const y = state.stageY - wy0;
  const R = NGU_HANH_SPEC.radiusX * sc;
  const Ry = NGU_HANH_SPEC.radiusY * sc;
  const height = 96 * sc;

  const cols = state.vertices.filter((e) => (e.vy > state.stageY) === front);
  for (const e of cols) drawSpire(g, state, e, phaseFactor, undefined, wx0, wy0);

  g.save();
  g.globalAlpha = phaseFactor;
  for (let j = 0; j < 2; j++) {
    const yy = y - height * (0.38 + j * 0.54);
    const s = 1 - j * 0.14;
    ellipse(g, x, yy, R * s, Ry * 0.79 * s, '#86cafa22', false, 1 * sc);
    drawMiniRunes(
      g,
      x,
      yy,
      R * s,
      Ry * 0.79 * s,
      20,
      '#d9eeff',
      j === 0 ? 0.14 : 0.21,
      state.now * 0.18 * (j ? -1 : 1)
    );
  }
  g.restore();
}

function floorDraw(g, state, front, opacity, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  g.save();
  g.globalAlpha = opacity;
  const X = state.stageX - wx0;
  const Y = state.stageY - wy0;
  const R = NGU_HANH_SPEC.radiusX * sc;
  const Ry = NGU_HANH_SPEC.radiusY * sc;
  const ord = state.vertices.slice().sort((a, b) => a.ang - b.ang);
  if (ord.length < 5) {
    g.restore();
    return;
  }
  g.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 5; j++) {
    const e = ord[j];
    const a = e.ang;
    let b = ord[(j + 1) % 5].ang;
    if (j === 4) b += TAU;
    g.strokeStyle = rgba(e.c, 0.76);
    g.lineWidth = 2.2 * sc;
    g.beginPath();
    let prev = false;
    for (let k = 0; k <= 28; k++) {
      const ang = a + ((b - a) * k) / 28;
      const visible = (Math.sin(ang) >= 0) === front;
      const px = X + Math.cos(ang) * R;
      const py = Y + Math.sin(ang) * Ry;
      if (!visible) {
        prev = false;
        continue;
      }
      if (!prev) g.moveTo(px, py);
      else g.lineTo(px, py);
      prev = true;
    }
    g.stroke();
  }
  g.restore();
}

function drawBolt(g, state, x0, y0, x1, y1, strength = 1) {
  const sc = NGU_HANH_SCALE;
  const rng = (i) => Math.sin(i * 17.13 + state.now * 71) * 0.5;
  const pts = [[x0, y0]];
  for (let i = 1; i < 10; i++) {
    const u = i / 10;
    const px = lerp(x0, x1, u) + rng(i) * (11 + (1 - u) * 8) * sc;
    const py = lerp(y0, y1, u);
    pts.push([px, py]);
  }
  pts.push([x1, y1]);
  g.save();
  g.globalCompositeOperation = 'lighter';
  linePath(g, pts, rgba('#ffdc65', 0.25 * strength), 6 * sc, 1);
  linePath(g, pts, rgba('#fff6bc', 0.9 * strength), 2.5 * sc, 1);
  linePath(g, pts, '#ffffff', 0.85 * sc, 1);
  g.restore();
}

function drawElementEffects(g, state, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  const x = state.stageX - wx0;
  const y = state.stageY - wy0;
  const tt = state.now;

  // 1. MỘC: Dây leo mộc linh quấn quanh thân mục tiêu kèm lá xanh
  for (let k = 0; k < 3; k++) {
    g.beginPath();
    for (let z = 0; z <= 16; z++) {
      const u = z / 16;
      const xx = x + (Math.sin(u * 10 + k * 1.6 + tt * 1.7) * (11 + u * 8) + (k - 1.5) * 3) * sc;
      const yy = y + (4 - u * (36 + Math.sin(k) * 9)) * sc;
      if (z) g.lineTo(xx, yy);
      else g.moveTo(xx, yy);
    }
    g.strokeStyle = k % 2 ? '#3c8f57' : '#91ee80';
    g.lineWidth = (k % 2 ? 2 : 2.8) * sc;
    g.stroke();

    for (let m = 0; m < 4; m++) {
      const u = (m + 0.5) / 4;
      const xx = x + (Math.sin(u * 10 + k * 1.6 + tt * 1.7) * (11 + u * 8) + (k - 1.5) * 3) * sc;
      const yy = y + (4 - u * (36 + Math.sin(k) * 9)) * sc;
      g.save();
      g.translate(xx, yy);
      g.rotate(Math.sin(tt + k + m) * 0.4);
      polygon(
        g,
        [
          [0, 0],
          [3 * sc, -4 * sc],
          [6 * sc, -5 * sc],
          [4 * sc, 0],
          [1 * sc, 2 * sc],
        ],
        m % 2 ? '#8eea6c' : '#3bc38f'
      );
      g.restore();
    }
  }

  // 2. THỔ: Gai nham thạch trồi lên quanh chân mục tiêu
  for (let k = 0; k < 4; k++) {
    const px = x + (-27 + k * 17) * sc;
    const base = y + (6 + Math.abs(k - 2) * 2) * sc;
    const peak = (12 + 7 * Math.sin(tt * 2 + k * 2)) * (k === 2 ? 1.1 : 0.8) * sc;
    polygon(
      g,
      [
        [px - 7 * sc, base],
        [px - 4 * sc, base - peak * 0.45],
        [px + 1 * sc, base - peak],
        [px + 7 * sc, base - peak * 0.38],
        [px + 9 * sc, base],
      ],
      '#6b4b3f',
      '#b79160',
      0.9 * sc
    );
    polygon(
      g,
      [
        [px + 1 * sc, base - peak],
        [px + 4 * sc, base - peak * 0.45],
        [px + 2 * sc, base],
      ],
      '#d9b27c'
    );
  }

  // 3. THỦY: Hai dải thủy lưu xoắn ốc vờn quanh người
  for (let k = 0; k < 2; k++) {
    const a = tt * 1.8 + k * Math.PI;
    g.beginPath();
    for (let j = 0; j <= 36; j++) {
      const u = j / 36;
      const ang = a + u * Math.PI * 2.2;
      const rr = (16 + 12 * u) * sc;
      const px = x + Math.cos(ang) * rr;
      const py = y - (13 + u * 33) * sc + Math.sin(ang) * rr * 0.33;
      if (j) g.lineTo(px, py);
      else g.moveTo(px, py);
    }
    g.strokeStyle = k === 0 ? '#a6faff' : '#258ed1';
    g.lineWidth = (k === 0 ? 1.7 : 1.4) * sc;
    g.stroke();
  }

  // 4. HỎA: Tám lưỡi lửa hỏa ngục bốc lên
  for (let k = 0; k < 8; k++) {
    const a = tt * 8 + k * 2.399;
    const px = x + (-18 + Math.sin(a * 0.37 + k) * 18) * sc;
    const base = y + (-13 + Math.cos(k * 2) * 4) * sc;
    const peak = (10 + (Math.sin(tt * 9 + k * 2) + 1) * 6) * sc;
    const alpha = clamp(0.48 + Math.sin(tt * 9 + k) * 0.25, 0, 1);
    polygon(
      g,
      [
        [px - 3 * sc, base],
        [px - 5 * sc, base - 8 * sc],
        [px + Math.sin(a) * 4 * sc, base - peak],
        [px + 4 * sc, base - 7 * sc],
        [px + 3 * sc, base],
      ],
      rgba(k % 3 === 0 ? '#fff2ae' : k % 2 ? '#ffb457' : '#ff653a', alpha)
    );
  }

  // 5. LÔI: Tia thiên lôi đánh xuyên từ đỉnh lồng giam xuống mục tiêu
  if (Math.sin(tt * 17) > 0.39 || Math.sin(tt * 11.6 + 1) > 0.6) {
    drawBolt(
      g,
      state,
      x - 12 * sc,
      y - 113 * sc,
      x + range(-16, 16) * sc,
      y - 25 * sc,
      0.65
    );
    glow(g, x, y - 43 * sc, 25 * sc, '#ffe988', 0.18);
  }
}

function pillarElementSignatures(g, state, wx0, wy0) {
  if (state.phase !== 'prison' && state.phase !== 'form') return;
  const sc = NGU_HANH_SCALE;
  const intensity =
    state.phase === 'form' ? ease(clamp(state.clock / NGU_HANH_SPEC.formSeconds, 0, 1)) : 1;
  const tt = state.now;

  g.save();
  g.globalAlpha = intensity * 0.9;
  for (const e of state.vertices) {
    const x = e.vx - wx0;
    const y = e.vy - wy0;
    switch (e.id) {
      case 'fire': {
        for (let k = 0; k < 7; k++) {
          const yy = y - (12 + ((tt * 28 + k * 17) % 80)) * sc;
          const xx = x + Math.sin(tt * 8 + k * 2) * 4 * sc;
          const sz = (3.5 + 2 * Math.sin(tt * 9 + k)) * sc;
          polygon(
            g,
            [
              [xx - 3 * sc, yy + 3 * sc],
              [xx - 4 * sc, yy - 2 * sc],
              [xx + 1 * sc, yy - 8 * sc - sz],
              [xx + 4 * sc, yy - 2 * sc],
              [xx + 3 * sc, yy + 3 * sc],
            ],
            k % 3 ? '#f57036' : '#ffbd5d'
          );
        }
        glow(g, x, y - 55 * sc, 19 * sc, '#ff7446', 0.12);
        break;
      }
      case 'water': {
        for (let k = 0; k < 2; k++) {
          g.beginPath();
          for (let j = 0; j <= 25; j++) {
            const u = j / 25;
            const xx = x + Math.sin(u * 13 + tt * 3 + k * Math.PI) * 6 * sc;
            const yy = y - u * 100 * sc;
            if (j) g.lineTo(xx, yy);
            else g.moveTo(xx, yy);
          }
          g.strokeStyle = k ? '#92edff' : '#2387cb';
          g.lineWidth = (k ? 1.4 : 2.1) * sc;
          g.stroke();
        }
        for (let k = 0; k < 3; k++) {
          const yy = y - ((tt * 32 + k * 29) % 96) * sc;
          spark(g, x + Math.sin(tt * 4 + k) * 6 * sc, yy, '#e8ffff', 1.5 * sc, 0.6);
        }
        break;
      }
      case 'thunder': {
        if (Math.sin(tt * 13) > 0.25) {
          const v = tt * 5;
          const pts = [];
          for (let k = 0; k <= 9; k++) {
            const u = k / 9;
            pts.push([x + Math.sin(k * 9 + v) * 3 * sc, y - (3 + u * 98) * sc]);
          }
          linePath(g, pts, '#ffed97', 1.5 * sc, 0.85);
          glow(g, x, y - 55 * sc, 16 * sc, '#ffe576', 0.10);
        }
        for (let k = 0; k < 3; k++) {
          const yy = y - ((tt * 21 + k * 29) % 90) * sc;
          spark(g, x + Math.sin(k + tt) * 4 * sc, yy, '#fff9cd', 1.3 * sc, 0.65);
        }
        break;
      }
      case 'earth': {
        for (let k = 0; k < 7; k++) {
          const yy = y - (8 + ((tt * 16 + k * 19) % 92)) * sc;
          const xx = x + Math.sin(tt * 2 + k * 2.4) * 7 * sc;
          const ss = (2.3 + (k % 3)) * sc;
          polygon(
            g,
            [
              [xx, yy - ss],
              [xx + ss, yy],
              [xx, yy + ss * 0.65],
              [xx - ss, yy],
            ],
            k % 2 ? '#ad8668' : '#d8b47f',
            '#f7deb0',
            0.45 * sc
          );
        }
        break;
      }
      case 'wood': {
        g.beginPath();
        for (let k = 0; k <= 35; k++) {
          const u = k / 35;
          const yy = y - u * 100 * sc;
          const xx = x + Math.sin(u * 13 + tt * 2) * 6 * sc;
          if (k) g.lineTo(xx, yy);
          else g.moveTo(xx, yy);
        }
        g.strokeStyle = '#5dcf75';
        g.lineWidth = 2 * sc;
        g.stroke();
        for (let k = 0; k < 6; k++) {
          const u = (k + 0.5) / 6;
          const yy = y - u * 99 * sc;
          const xx = x + Math.sin(u * 13 + tt * 2) * 6 * sc;
          g.save();
          g.translate(xx, yy);
          g.rotate(Math.sin(tt * 2 + k) * 0.5);
          polygon(
            g,
            [
              [0, 0],
              [3 * sc, -4 * sc],
              [7 * sc, -5 * sc],
              [5 * sc, 0],
              [1 * sc, 3 * sc],
            ],
            k % 2 ? '#9ce979' : '#41ba7e'
          );
          g.restore();
        }
        break;
      }
    }
  }
  g.restore();
}

function drawCastStreams(g, state, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  for (let j = 0; j < state.sequence.length; j++) {
    const s = state.sequence[j];
    const e = s.e;
    if (s.progress <= 0) continue;
    const prev = s.trail;
    for (let i = 1; i < prev.length; i++) {
      const a = (i / prev.length) * 0.38;
      g.strokeStyle = rgba(e.c, a);
      g.lineWidth = lerp(0.6, 5.2, i / prev.length) * sc;
      g.beginPath();
      g.moveTo(prev[i - 1].x - wx0, prev[i - 1].y - wy0);
      g.lineTo(prev[i].x - wx0, prev[i].y - wy0);
      g.stroke();
    }
    const px = s.x - wx0;
    const py = s.y - wy0;
    glow(g, px, py, 17 * sc, e.c, 0.46);
    g.fillStyle = e.c;
    g.beginPath();
    g.arc(px, py, 4.2 * sc, 0, TAU);
    g.fill();
    g.fillStyle = e.bright;
    g.beginPath();
    g.arc(px, py, 2.2 * sc, 0, TAU);
    g.fill();
    spark(g, px, py, e.bright, 7 * sc, 0.87);
  }
}

function paintParticles(g, state, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  g.save();
  g.globalCompositeOperation = 'lighter';
  for (const p of state.particles) {
    const a = clamp(1 - p.age / p.max, 0, 1);
    const px = p.x - wx0;
    const py = p.y - wy0;
    const sz = p.size * sc;
    g.fillStyle = rgba(p.col, a);
    g.fillRect(px, py, sz, sz);
    if (p.gl && p.size >= 1.5 && a > 0.4) {
      g.strokeStyle = rgba(p.col, a * 0.5);
      g.beginPath();
      g.moveTo(px - 1 * sc, py);
      g.lineTo(px + 2 * sc, py);
      g.stroke();
    }
  }
  g.restore();

  for (const r of state.ripples) {
    const a = clamp(1 - r.age / r.life, 0, 1);
    const rx = r.x - wx0;
    const ry = r.y - wy0;
    ellipse(g, rx, ry, r.r, r.r * 0.38, rgba(r.col, a * 0.72), false, 1.8 * sc);
    ellipse(g, rx, ry, r.r * 0.7, r.r * 0.24, rgba(r.col, a * 0.25), false, 1 * sc);
  }
}

function drawFinal(g, state, wx0, wy0) {
  const sc = NGU_HANH_SCALE;
  const t = state.clock;
  const cx = state.stageX - wx0;
  const cy = state.stageY - 57 * sc - wy0;

  if (state.phase === 'converge') {
    const f = ease(clamp(t / NGU_HANH_SPEC.convergeSeconds, 0, 1));
    glow(g, cx, cy, (23 + 34 * f) * sc, '#fff9d1', 0.25 + 0.44 * f);
    for (let i = 0; i < 5; i++) {
      const e = state.vertices[i];
      const vx = e.vx - wx0;
      const vy = e.vy - 46 * sc - wy0;
      const sx = lerp(vx, cx, f);
      const sy = lerp(vy, cy, f);
      glow(g, sx, sy, (16 * (1 - f) + 4) * sc, e.c, 0.59);
      linePath(
        g,
        [
          [vx, vy],
          [sx, sy],
        ],
        rgba(e.c, 0.27),
        2 * sc
      );
      for (let k = 0; k < 3; k++) {
        const a = state.now * 4 + i * 1.4 + k * 2.2;
        const xx = sx + Math.cos(a) * range(3, 7) * sc;
        const yy = sy + Math.sin(a) * range(3, 7) * sc;
        spark(g, xx, yy, e.bright, 1.4 * sc, 0.48);
      }
    }
  } else if (state.phase === 'blast') {
    const p = clamp(t / NGU_HANH_SPEC.blastSeconds, 0, 1);
    const reach = (22 + 118 * ease(clamp(t / 0.72, 0, 1))) * sc;

    g.save();
    g.globalCompositeOperation = 'lighter';

    // 5 cánh hoa năng lượng Ngũ Hành nở bùng quanh lõi trắng
    for (let k = 0; k < 5; k++) {
      const e = state.vertices[k] || NGU_HANH_ELEMENTS[k];
      const a = e.ang + Math.sin(state.now * 3 + k) * 0.025;
      const f = clamp(t / 0.38, 0, 1);
      const petals = (16 + 67 * ease(f)) * sc;
      const plen = petals * (1 - 0.2 * p);

      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      const grad = g.createLinearGradient(0, 0, plen, 0);
      grad.addColorStop(0, rgba('#ffffff', 0.30 * (1 - p)));
      grad.addColorStop(0.23, rgba(e.bright, 0.43 * (1 - p)));
      grad.addColorStop(0.57, rgba(e.c, 0.32 * (1 - p)));
      grad.addColorStop(1, rgba(e.c, 0));
      polygon(
        g,
        [
          [0, 0],
          [plen * 0.30, -8 * sc * (1 - p)],
          [plen * 0.60, -19 * sc * (1 - p)],
          [plen, 0],
          [plen * 0.60, 19 * sc * (1 - p)],
          [plen * 0.30, 8 * sc * (1 - p)],
        ],
        grad
      );
      if (t < 0.55) {
        g.strokeStyle = rgba(e.bright, 0.64 * (1 - clamp(t / 0.55, 0, 1)));
        g.lineWidth = 2 * sc;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(plen * 0.35, -4 * sc);
        g.lineTo(plen * 0.60, 5 * sc);
        g.lineTo(plen, 0);
        g.stroke();
      }
      g.restore();
    }

    // Vòng sóng chấn động ngũ sắc kép
    for (let layer = 0; layer < 2; layer++) {
      const rr = layer ? reach * 0.72 : reach;
      const alpha = layer ? 0.23 : 0.80;
      const fade = 1 - clamp(t / (layer ? 0.94 : 1.12), 0, 1);
      if (fade > 0.001) {
        for (let k = 0; k < 5; k++) {
          const e = state.vertices[k] || NGU_HANH_ELEMENTS[k];
          const a = -Math.PI / 2 + (k * TAU) / 5;
          g.beginPath();
          g.arc(cx, cy, rr, a, a + TAU / 5 + 0.005);
          g.strokeStyle = rgba(e.c, alpha * fade);
          g.lineWidth = ((layer ? 4 : 8) * (1 - clamp(t / 1.05, 0, 1)) + 0.8) * sc;
          g.stroke();

          g.beginPath();
          g.arc(cx, cy, rr + 1.5 * sc, a, a + TAU / 5 + 0.005);
          g.strokeStyle = rgba(e.bright, 0.56 * fade);
          g.lineWidth = 1.6 * sc;
          g.stroke();
        }
      }
    }
    g.restore();

    if (t < 0.48) {
      const core = (15 + 29 * ease(clamp(t / 0.22, 0, 1))) * sc;
      glow(g, cx, cy, core * 2.0, '#fffbd9', 0.55 * (1 - t / 0.48));
      glow(g, cx, cy, core, '#e7feff', 0.70 * (1 - t / 0.48));
    }
  }
}

function drawPlayerHandSealAura(g, state, wx0, wy0) {
  if (state.phase === 'idle') return;
  const sc = NGU_HANH_SCALE;
  const hx = player.x + player.facing * 20 - wx0;
  const hy = player.y + (motion.bobOffset || 0) - 56 - wy0;

  glow(g, hx, hy, 22 * sc, '#87e3ff', 0.26);
  g.save();
  g.strokeStyle = '#e2ffff';
  g.lineWidth = 1.2 * sc;
  g.beginPath();
  g.arc(hx, hy, (6.5 + Math.sin(state.now * 13) * 0.6) * sc, 0, TAU);
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = state.now * 2.2 + (i * TAU) / 5;
    const e = NGU_HANH_ELEMENTS[i];
    spark(
      g,
      hx + Math.cos(a) * 14 * sc,
      hy + Math.sin(a) * 11 * sc,
      e.c,
      1.8 * sc,
      0.78
    );
  }
  g.restore();
}

export function renderNguHanhWorld(state, layer = 'front') {
  const g = game.ctx;
  if (!g || settings.fxQuality === 'off') return;
  if (state.phase === 'idle' && state.particles.length === 0 && state.ripples.length === 0) {
    return;
  }

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  const sc = NGU_HANH_SCALE;
  const active = ['form', 'prison', 'converge', 'blast'].includes(state.phase);

  if (layer === 'back') {
    if (!active) return;
    const t =
      state.phase === 'form'
        ? ease(clamp(state.clock / NGU_HANH_SPEC.formSeconds, 0, 1))
        : state.phase === 'prison'
        ? 1
        : state.phase === 'converge'
        ? 1 - 0.22 * ease(clamp(state.clock / NGU_HANH_SPEC.convergeSeconds, 0, 1))
        : state.phase === 'blast'
        ? clamp(1 - state.clock * 0.95, 0, 1)
        : 1;

    g.save();
    glow(
      g,
      state.stageX - wx0,
      state.stageY - 45 * sc - wy0,
      114 * sc,
      '#9b59ff',
      state.phase === 'prison' ? 0.065 : 0.12
    );
    drawFloorSigil(g, state, wx0, wy0, 0.78 * t);
    drawPixelFxGroundCore(g, state, state.stageX - wx0, state.stageY - wy0, t);
    drawCage(g, state, t, false, wx0, wy0);
    g.restore();
    return;
  }

  // Lớp 'front' (vẽ phía trước nhân vật & NPC)
  g.save();
  drawPlayerHandSealAura(g, state, wx0, wy0);

  if (active) {
    const t =
      state.phase === 'form'
        ? ease(clamp(state.clock / NGU_HANH_SPEC.formSeconds, 0, 1))
        : state.phase === 'prison'
        ? 1
        : state.phase === 'converge'
        ? 1 - 0.30 * ease(clamp(state.clock / NGU_HANH_SPEC.convergeSeconds, 0, 1))
        : state.phase === 'blast'
        ? clamp(1 - state.clock * 0.9, 0, 1)
        : 1;

    if (state.phase === 'prison') {
      drawElementEffects(g, state, wx0, wy0);
    }

    drawCage(g, state, t, true, wx0, wy0);
    floorDraw(g, state, true, t, wx0, wy0);

    // Màn chắn lăng kính 5 màu phía trước lồng giam
    if (state.vertices.length === 5) {
      for (let k = 0; k < 5; k++) {
        const a = state.vertices[k];
        const b = state.vertices[(k + 1) % 5];
        const cY = (a.vy + b.vy) / 2;
        if (cY < state.stageY - 4 * sc) continue;
        const gr = g.createLinearGradient(
          0,
          state.stageY - 108 * sc - wy0,
          0,
          state.stageY - wy0
        );
        gr.addColorStop(0, rgba(a.c, 0));
        gr.addColorStop(0.50, rgba(a.c, 0.06 * t));
        gr.addColorStop(1, rgba(b.c, 0.15 * t));
        polygon(
          g,
          [
            [a.vx - wx0, a.vy - 90 * sc * t - wy0],
            [b.vx - wx0, b.vy - 90 * sc * t - wy0],
            [b.vx - wx0, b.vy - wy0],
            [a.vx - wx0, a.vy - wy0],
          ],
          gr
        );
      }
    }

    pillarElementSignatures(g, state, wx0, wy0);
    drawFinal(g, state, wx0, wy0);

    // Nhãn trạng thái Đại Trận phía trên lồng giam
    if (state.phase === 'prison' || state.phase === 'converge') {
      const topX = state.stageX - wx0;
      const topY = state.stageY - 134 * sc - wy0;
      const overloaded = state.lockSec >= NGU_HANH_SPEC.baseLimitSeconds;
      const rate = getNguHanhUpkeepRate(state.lockSec);
      g.save();
      g.textAlign = 'center';
      g.font = 'bold 10px system-ui, sans-serif';
      g.shadowColor = '#04101c';
      g.shadowBlur = 4;
      g.fillStyle =
        state.phase === 'converge'
          ? '#fff2a6'
          : overloaded
          ? '#ff986b'
          : '#9ef5ff';
      g.fillText(
        state.phase === 'converge'
          ? '☯ NGŨ HÀNH QUY NHẤT · BẠO SÁT!'
          : overloaded
          ? `☯ QUÁ TẢI (${state.lockSec.toFixed(1)}s) · -${rate} MP/S`
          : `☯ NGŨ HÀNH PHONG TỎA (${state.lockSec.toFixed(1)}s / 20s) · -${rate} MP/S`,
        topX,
        topY
      );
      g.restore();
    }
  }

  if (state.phase === 'launch') {
    drawCastStreams(g, state, wx0, wy0);
  }
  paintParticles(g, state, wx0, wy0);
  g.restore();
}
