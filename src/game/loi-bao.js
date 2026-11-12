// ============================================================================
// MODULE: LÔI BẠO (Skill 2 — Tụ lực Lôi Hoàn · Thiên Lôi Hoàng Kim · Tê Liệt 5s)
// Chuyển thể nguyên bản từ gói PixelFX Lôi Bạo V2 Lite vào thế giới PK Loạn Chiến
// ============================================================================

import { clamp, settings, game, camera, dummy } from './state.js';

const PixelFX = window.PK_PIXELFX;
if (!PixelFX) {
  throw new Error('PixelFX bundle must load before loi-bao.js');
}

export const TAU = Math.PI * 2;

export const LOI_BAO_SPEC = Object.freeze({
  id: 'loi-bao',
  name: 'Lôi Bạo',
  initialManaCost: 25,
  manaPerSecond: 5,
  stunSeconds: 5,
  baseDamage: 120,
  extraDamagePerSecond: 40,
  baseBeamWidth: 4,
  beamWidthPerSecond: 2.8,
  maxRenderedBeamWidth: 40,
  initialRingRadius: 12,
  radiusPerSecond: 7,
  boltTravelSeconds: 0.16,
  boltHoldSeconds: 0.35,
});

// ----------------------------------------------------------------------------
// Tiện ích Màu & Toán học PixelFX cho Lôi Bạo
// ----------------------------------------------------------------------------

const rgb = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);

export function hex(h) {
  if (typeof h === 'number') return h;
  let s = h.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const v = parseInt(s.slice(0, 6), 16);
  return rgb((v >> 16) & 255, (v >> 8) & 255, v & 255);
}

export function fit(r, n) {
  const mapped = r.map(hex);
  if (mapped.length === n) return mapped;
  return Array.from(
    { length: n },
    (_, i) => mapped[Math.round((i * (mapped.length - 1)) / Math.max(1, n - 1))]
  );
}

export function hash(x, y = 0, z = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function rng(...seed) {
  let s = seed.reduce((a, v, i) => (a ^ ((v + 1) * (1103515245 + i * 12345))) | 0, 1337) || 1;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a = 0, b = 1) => a + (b - a) * next(),
    int: (a, b) => Math.floor(a + (b - a + 1) * next()),
    chance: (p = 0.5) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export const WHITE = hex('#ffffff');
export const GOLD = fit(
  ['#170e05', '#382007', '#75440b', '#b8780b', '#efb71b', '#ffd43e', '#fff39d', '#ffffff'],
  8
);
export const GLOW = hex('#ffd126');
export const PALE = hex('#fff3a0');
export const WHITE_GOLD = hex('#fffbd9');

// ----------------------------------------------------------------------------
// Thuật toán Tia sét phân nhánh PixelFX (zigzag, stroke, crackle)
// ----------------------------------------------------------------------------

export function zigzag(R, x0, y0, x1, y1, jag = 0.32, forks = 0.35, w = 1, depth = 0) {
  const out = { paths: [] };
  const L = Math.hypot(x1 - x0, y1 - y0);
  let pts = [
    [x0, y0],
    [x1, y1],
  ];
  let off = L * jag;
  while (pts.length < 2 + L / 3) {
    const nxt = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const l = Math.hypot(bx - ax, by - ay) || 1;
      const o = R.range(-off, off);
      nxt.push(
        [(ax + bx) / 2 + (-(by - ay) / l) * o, (ay + by) / 2 + ((bx - ax) / l) * o],
        [bx, by]
      );
    }
    pts = nxt;
    off *= 0.52;
  }
  out.paths.push({ pts, w });
  if (depth < 2) {
    for (let i = 2; i < pts.length - 3; i++) {
      if (R.chance(forks / (1 + depth) / Math.max(4, pts.length / 6))) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[Math.min(pts.length - 1, i + 3)];
        const a = Math.atan2(by - ay, bx - ax) + R.sign() * R.range(0.35, 0.9);
        const l = (L - (i / pts.length) * L) * R.range(0.25, 0.55);
        out.paths.push(
          ...zigzag(
            R,
            ax,
            ay,
            ax + Math.cos(a) * l,
            ay + Math.sin(a) * l,
            jag * 1.1,
            forks,
            w * 0.55,
            depth + 1
          ).paths
        );
      }
    }
  }
  return out;
}

const N = 1024;
const HALF = 512;
const GRID = new Uint8Array(N * N);
const HIT = [];
const CROSS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function mark(x, y, lvl) {
  const X = Math.floor(x) + HALF;
  const Y = Math.floor(y) + HALF;
  if (X < 0 || Y < 0 || X >= N || Y >= N) return;
  const i = Y * N + X;
  const v = GRID[i];
  if (!v) HIT.push(i);
  if (lvl > v) GRID[i] = lvl;
}

function stamp(x, y, r, lvl) {
  if (r <= 0.5) return mark(Math.round(x), Math.round(y), lvl);
  const r2 = r * r;
  for (let py = Math.floor(y - r); py <= Math.ceil(y + r); py++) {
    const dy = py + 0.5 - y;
    for (let px = Math.floor(x - r); px <= Math.ceil(x + r); px++) {
      const dx = px + 0.5 - x;
      if (dx * dx + dy * dy <= r2) mark(px, py, lvl);
    }
  }
}

function flush(p, cols, alphas) {
  for (const i of HIT) {
    const v = GRID[i];
    GRID[i] = 0;
    const x = (i % N) - HALF;
    const y = ((i / N) | 0) - HALF;
    const a = alphas ? alphas[v - 1] : 1;
    if (a >= 1) p.px(x, y, cols[v - 1]);
    else if (a > 0) p.dot(x, y, cols[v - 1], a);
  }
  HIT.length = 0;
}

const walk = (pts, fn) => {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const l = Math.max(1, Math.hypot(bx - ax, by - ay));
    for (let d = 0; d <= l; d += 0.5) {
      fn(ax + ((bx - ax) * d) / l, ay + ((by - ay) * d) / l, i);
    }
  }
};

export function stroke(p, b, k, C, s = 1, o = {}) {
  if (k <= 0.02) return;
  const lk = o.light ?? 0.5;
  for (const q of b.paths) {
    const trunk = q.w >= 1;
    if (!trunk && k < 0.5) continue;
    const rh = (trunk ? (k > 0.6 ? 2.1 : 1.6) : 1.1) * s;
    const rb = (trunk ? (k > 0.6 ? 1.3 : 0.8) : 0.5) * s;
    const pts =
      o.upTo !== undefined && trunk
        ? q.pts.slice(0, Math.max(2, Math.ceil(q.pts.length * o.upTo)))
        : q.pts;
    walk(pts, (x, y) => {
      stamp(x, y, rh, 1);
      stamp(x, y, rb, trunk ? 3 : 2);
      if (trunk && k > 0.3) {
        if (o.core) stamp(x, y, o.core, 4);
        else mark(x, y, 4);
      }
    });
    for (let i = 0; i < pts.length - 1; i += 3) {
      if (o.minY === undefined || pts[i][1] > o.minY) {
        p.glow(pts[i][0], pts[i][1], (trunk ? 14 : 7) * s, C[4], lk * k * q.w);
      }
    }
  }
  const a = o.a ?? 1;
  flush(p, o.hero ? [C[3], C[6], C[7], C[7]] : [C[2], C[4], C[5], C[7]], [a, a, a, a]);
}

export function crackle(p, b, k, C, glowK = 0.5, a = 1) {
  if (k <= 0.02) return;
  for (const q of b.paths) {
    const thick = q.w >= 1;
    walk(q.pts, (x, y) => {
      if (k > 0.45 && thick) {
        for (const [dx, dy] of CROSS) mark(x + dx * 1.5, y + dy * 1.5, 1);
      }
      if (k > 0.25 && (thick || q.w > 0.4)) {
        mark(x + 1, y, 2);
        mark(x, y + 1, 2);
      }
      mark(x, y, thick && k > 0.3 ? 4 : 3);
    });
    for (let i = 0; i < q.pts.length - 1; i += 3) {
      p.glow(q.pts[i][0], q.pts[i][1], (thick ? 9 : 5) * (0.5 + k * 0.5), C[4], glowK * k * q.w);
    }
  }
  flush(p, [C[3], C[5], C[5], C[7]], [Math.min(1, (k - 0.45) * 1.6) * a, a, a, a]);
}

// ----------------------------------------------------------------------------
// Vẽ hiệu ứng Lôi Bạo bằng PixelFX Painter (Charging, Firing, Paralysis)
// ----------------------------------------------------------------------------

function drawCharging(p, t, s, seed) {
  const x = s.origin.x;
  const y = s.origin.y;
  const n = s.chargedSeconds;
  const radius = Math.min(72, s.ringRadius);
  const pulse = 0.55 + 0.45 * Math.sin(t * (8 + Math.min(15, n * 0.7)));

  p.glow(x, y, Math.min(65, radius + 18), GLOW, 0.10 + Math.min(0.4, n * 0.025));
  p.ring(x, y, radius, 1.35, GOLD[5], 0.62 + 0.26 * pulse);
  p.ring(x, y, Math.max(4, radius - 3), 0.7, GOLD[3], 0.6);
  p.glowRing(x, y, radius, 2.5, GOLD[4], 0.2 + 0.06 * pulse);

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + t * 1.3;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    p.circle(px, py, 1.6, k % 2 ? WHITE : GOLD[6]);
    p.glow(px, py, 4.3, GOLD[5], 0.28);
    p.line(
      x + Math.cos(a) * (radius - 5),
      y + Math.sin(a) * (radius - 5),
      x + Math.cos(a) * (radius + 4),
      y + Math.sin(a) * (radius + 4),
      GOLD[5]
    );
  }

  const f = Math.floor(t * 38);
  const R = rng(seed, f, 33);
  const sparks = Math.min(34, 14 + n * 2);
  for (let i = 0; i < sparks; i++) {
    const a = R.range(0, TAU);
    const d = R.range(3, radius + 8);
    const sx = x + Math.cos(a) * d;
    const sy = y + Math.sin(a) * d;
    p.dot(sx, sy, i % 3 ? GOLD[5] : WHITE, R.range(0.35, 1));
    if (i % 4 === 0) p.glow(sx, sy, 3, GOLD[4], 0.23);
  }

  for (let i = 0; i < Math.min(6, 2 + Math.floor(n / 2)); i++) {
    const a = (TAU * i) / 5 + t * (1.4 + i * 0.22);
    const x1 = x + Math.cos(a) * (radius * 0.32);
    const y1 = y + Math.sin(a) * (radius * 0.32);
    const x2 = x + Math.cos(a + 0.4) * (radius - 1);
    const y2 = y + Math.sin(a + 0.4) * (radius - 1);
    const z = zigzag(rng(seed, f, i), x1, y1, x2, y2, 0.23, 0.05);
    crackle(p, z, 0.78, GOLD, 0.35);
  }

  const r = Math.min(10, 3 + n * 0.52) + pulse * 1.0;
  p.circle(x, y, r + 2, GOLD[3]);
  p.circle(x, y, r + 0.5, GOLD[5]);
  p.circle(x, y, r * 0.60, GOLD[6]);
  p.circle(x, y, Math.max(1.3, r * 0.28), WHITE_GOLD);
  p.glow(x, y, 13 + r * 1.2, GOLD[5], 0.32);
}

function paintChargedTrunk(p, bolt, reveal, width, fade) {
  const path = bolt.paths[0]?.pts;
  if (!path || reveal <= 0 || fade <= 0) return;
  const last = Math.min(path.length - 1, Math.max(1, Math.ceil((path.length - 1) * reveal)));
  const shell = Math.max(2.5, width);
  const hot = Math.max(1, width * 0.64);
  const core = Math.max(0.8, width * 0.28);

  for (let i = 0; i < last; i++) {
    const a = path[i];
    const b = path[i + 1];
    p.beam(a[0], a[1], b[0], b[1], shell, GOLD[3], 0.78 * fade);
    p.beam(a[0], a[1], b[0], b[1], hot, GOLD[5], 0.92 * fade);
    p.beam(a[0], a[1], b[0], b[1], core, GOLD[7], 0.96 * fade);
  }
  for (let i = 2; i < last; i += 9) {
    const a = path[i];
    p.glow(
      a[0],
      a[1],
      10 + width * 0.75,
      GOLD[5],
      Math.min(0.6, 0.18 + width * 0.008) * fade
    );
  }
}

function drawFiring(p, t, s, seed) {
  const age = s.blastAge;
  const A = s.origin;
  const B = s.target;
  const D = Math.hypot(B.x - A.x, B.y - A.y);
  const n = Math.max(0, s.chargedSeconds);
  const width = Math.min(
    LOI_BAO_SPEC.maxRenderedBeamWidth,
    LOI_BAO_SPEC.baseBeamWidth + LOI_BAO_SPEC.beamWidthPerSecond * n
  );
  const visual = Math.min(16, n);
  const travel = LOI_BAO_SPEC.boltTravelSeconds;
  const appear = clamp(age / travel, 0, 1);
  const hold = LOI_BAO_SPEC.boltHoldSeconds + Math.min(0.16, n * 0.018);
  const fade = clamp((travel + hold - age) / hold, 0, 1);
  const radius = Math.min(86, s.ringRadius);

  if (age < 0.3) {
    const q = age / 0.3;
    p.ring(A.x, A.y, Math.min(112, radius + q * 34), 1.8 + visual * 0.12, GOLD[6], 1 - q);
    p.glowRing(
      A.x,
      A.y,
      Math.min(112, radius + q * 34),
      3 + visual * 0.18,
      GOLD[4],
      0.23 * (1 - q)
    );
  }
  if (age < 0.20) {
    const q = 1 - age / 0.2;
    p.circle(A.x, A.y, Math.max(1, q * (7 + width * 0.18)), GOLD[6]);
    p.glow(A.x, A.y, 14 + width * 0.65, GOLD[5], 0.43 * q);
  }

  if (fade > 0.01) {
    const frame = Math.floor(age * 40);
    const R = rng(seed, s.castId, frame, 14);
    const jag = Math.min(0.15, 0.057 + visual * 0.0037 + D * 0.00010);
    const bolt = zigzag(R, A.x, A.y, B.x, B.y, jag, Math.min(0.89, 0.34 + visual * 0.035));
    paintChargedTrunk(p, bolt, appear, width, fade);
    if (age > 0.06) {
      const side = { paths: bolt.paths.slice(1) };
      if (side.paths.length) {
        stroke(p, side, fade, GOLD, 0.65 + Math.min(1.1, n * 0.075), {
          light: 0.09 + visual * 0.012,
          core: 0,
        });
      }
      const forks = Math.min(9, 2 + Math.floor(n / 2));
      for (let i = 0; i < forks; i++) {
        const u = R.range(0.16, Math.max(0.20, appear));
        const x = A.x + (B.x - A.x) * u;
        const y = A.y + (B.y - A.y) * u;
        const off = R.range(-12, 12) * (1 + visual * 0.10);
        const branch = zigzag(R, x, y, x + R.range(11, 32 + visual * 1.6), y + off, 0.20, 0.1);
        crackle(p, branch, fade * 0.64, GOLD, 0.11);
      }
    }
  }

  const sinceImpact = age - travel;
  if (sinceImpact >= 0 && sinceImpact <= 0.5) {
    const k = 1 - sinceImpact / 0.5;
    const size = (12 + width * 0.72) * (0.6 + Math.min(1, sinceImpact * 7));
    p.glow(B.x, B.y, 24 + width * 1.05, GOLD[5], 0.47 * k);
    p.ring(B.x, B.y, size, 1.2 + width * 0.06, GOLD[6], k);
    if (sinceImpact < 0.14) {
      p.circle(B.x, B.y, Math.max(1, (7 + width * 0.18) * (1 - sinceImpact / 0.14)), WHITE_GOLD);
    }
    const R = rng(seed, s.castId, Math.floor(age * 36), 26);
    const count = Math.min(58, 15 + n * 3);
    for (let i = 0; i < count; i++) {
      const a = R.range(0, TAU);
      const d = R.range(3, 25 + width * 0.7) * (0.4 + sinceImpact * 1.5);
      const x = B.x + Math.cos(a) * d;
      const y = B.y + Math.sin(a) * d;
      p.dot(x, y, i % 4 ? GOLD[5] : WHITE, R.range(0.3, 1) * k);
      if (i % 8 === 0) p.glow(x, y, 3.8, GOLD[5], 0.23 * k);
    }
  }
}

function drawParalysis(p, t, s, seed) {
  if (s.stunRemaining <= 0) return;
  const x = s.target.x;
  const y = s.target.y;
  const R = rng(seed, Math.floor(t * 24), s.castId, 72);
  const flash = 0.6 + 0.4 * Math.sin(t * 21);

  p.ring(x, y, 12.5 + Math.sin(t * 7) * 1.5, 0.7, GOLD[4], 0.33 + flash * 0.17);
  p.glow(x, y, 15, GOLD[4], 0.08 + flash * 0.08);

  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * TAU + R.range(-0.4, 0.4);
    const sx = x + Math.cos(a) * 8;
    const sy = y + Math.sin(a) * 12;
    const ex = x + Math.cos(a + 0.9) * 15;
    const ey = y + Math.sin(a + 0.9) * 19;
    crackle(p, zigzag(R, sx, sy, ex, ey, 0.28, 0), 0.64 + 0.2 * flash, GOLD, 0.12);
  }
  for (let i = 0; i < 5; i++) {
    const a = R.range(0, TAU);
    const d = R.range(9, 18);
    p.dot(x + Math.cos(a) * d, y + Math.sin(a) * d, i % 2 ? WHITE : PALE, 0.6);
  }
}

export function drawLoiBaoFX(p, t, state, seed = 27) {
  if (!state) return;
  if (state.phase === 'charging') drawCharging(p, t, state, seed);
  if (state.phase === 'firing') drawFiring(p, t, state, seed);
  drawParalysis(p, t, state, seed);
}

// ----------------------------------------------------------------------------
// Bộ đệm kết xuất PixelFX cho Lôi Bạo trong không gian thế giới
// ----------------------------------------------------------------------------

const PFX_SCALE = 1.85; // 1 điểm ảnh PixelFX = 1.85 đơn vị thế giới
let surfaceW = 0;
let surfaceH = 0;
let surfaceFrame = null;
let surfaceCanvas = null;
let surfaceCtx = null;
let surfaceImage = null;

function ensureSurface(w, h) {
  if (surfaceFrame && surfaceW === w && surfaceH === h) return;
  surfaceW = w;
  surfaceH = h;
  surfaceFrame = PixelFX.createFrame(w, h);
  surfaceCanvas = document.createElement('canvas');
  surfaceCanvas.width = w;
  surfaceCanvas.height = h;
  surfaceCtx = surfaceCanvas.getContext('2d');
  surfaceImage = surfaceCtx.createImageData(w, h);
}

export function renderLoiBaoWorld(loiBaoState) {
  const ctx = game.ctx;
  if (!ctx || settings.fxQuality === 'off' || !loiBaoState) return;
  const activePhase = loiBaoState.phase === 'charging' || loiBaoState.phase === 'firing';
  const hasParalysis = !dummy.broken && dummy.stun > 0;
  if (!activePhase && !hasParalysis) return;

  const worldOrigin = loiBaoState.origin;
  const worldTarget =
    hasParalysis && loiBaoState.phase === 'idle'
      ? { x: dummy.x, y: dummy.y - 77 }
      : loiBaoState.target;

  // Xác định vùng bao thế giới cần vẽ PixelFX
  let minX = worldOrigin.x - 180;
  let maxX = worldOrigin.x + 180;
  let minY = worldOrigin.y - 180;
  let maxY = worldOrigin.y + 180;

  if (loiBaoState.phase === 'firing' || hasParalysis) {
    minX = Math.min(minX, worldTarget.x - 180);
    maxX = Math.max(maxX, worldTarget.x + 180);
    minY = Math.min(minY, worldTarget.y - 180);
    maxY = Math.max(maxY, worldTarget.y + 180);
  }

  const worldW = Math.max(260, Math.min(4800, maxX - minX));
  const worldH = Math.max(240, Math.min(2400, maxY - minY));
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const leftWorld = centerX - worldW * 0.5;
  const topWorld = centerY - worldH * 0.5;

  const dynScale = Math.max(PFX_SCALE, worldW / 680, worldH / 420);
  const pw = Math.max(140, Math.ceil(worldW / dynScale));
  const ph = Math.max(130, Math.ceil(worldH / dynScale));
  ensureSurface(pw, ph);

  const localOrigin = {
    x: (worldOrigin.x - leftWorld) / dynScale,
    y: (worldOrigin.y - topWorld) / dynScale,
  };
  const localTarget = {
    x: (worldTarget.x - leftWorld) / dynScale,
    y: (worldTarget.y - topWorld) / dynScale,
  };

  PixelFX.clearFrame(surfaceFrame);
  const p = PixelFX.painterFor(surfaceFrame);
  p.lightK = 0.85;

  drawLoiBaoFX(
    p,
    game.elapsed,
    {
      ...loiBaoState,
      origin: localOrigin,
      target: localTarget,
      stunRemaining: hasParalysis ? dummy.stun : 0,
    },
    27
  );

  PixelFX.composite(surfaceFrame, surfaceImage.data, null, 0.85);
  surfaceCtx.putImageData(surfaceImage, 0, 0);

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  const screenX = leftWorld - wx0;
  const screenY = topWorld - wy0;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    surfaceCanvas,
    0,
    0,
    pw,
    ph,
    Math.round(screenX),
    Math.round(screenY),
    Math.round(pw * dynScale),
    Math.round(ph * dynScale)
  );
  ctx.restore();
}
