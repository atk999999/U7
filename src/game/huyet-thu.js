import { trackSkillSegment, queueSkillImpact, skillCollisionRatio, segmentCircleTOI } from './va-cham-ky-nang.js';
// ============================================================================
// MODULE: SKILL 01 · HUYẾT THỦ TRẢO HỒN (HUYẾT DỰ - PIXELFX)
// Triệu hồi bàn tay máu khổng lồ 5 móng vuốt lao tới kẻ địch, bạo huyết,
// hiệu ứng Huyết Tích rớt máu kéo dài 8s, hồi chiêu 5s.
// Tích hợp từ skill1.html
// ============================================================================

import { clamp, settings, game, camera, motion, WORLD_W, WORLD_H } from './state.js';
import { dummyDamage, dummyHitTest } from './character.js';
import { surfaceAt } from './map.js';
import { actionAudio } from './audio.js';

export const HUYET_THU_SPEC = {
  manaCost: 35,
  cooldown: 5.0,
  castSeconds: 0.7,
  bleedDuration: 8.0,
  speed: 540,
  impactDamage: 280,
  bleedTickInterval: 0.8,
  bleedTickDamage: 20,
};

export function createHuyetThuState() {
  return {
    phase: 'ready', // 'ready' | 'cast' | 'hand' | 'impact' | 'cooldown'
    castTime: 0,
    cooldown: 0,
    hand: null,
    sealSpin: 0,
    bloodDensity: 0,
    particles: [],
    drops: [],
    shock: [],
    bloodPools: [],
    // Mục tiêu đang chịu Huyết Tích
    targetBleed: {
      active: false,
      timeLeft: 0,
      spawnTimer: 0,
      tickTimer: 0,
      targetRef: null,
    },
    hits: 0,
    casterPos: { x: 0, y: 0, facing: 1 },
    targetPos: { x: 0, y: 0 },
  };
}

export function castHuyetThu(state, caster, target) {
  if (state.phase !== 'ready' && state.phase !== 'cooldown') return false;
  if (state.cooldown > 0) return false;

  state.phase = 'cast';
  state.castTime = 0;
  state.hand = null;
  state.shock = [];
  state.bloodDensity = 0.25;
  state.sealSpin = 0;
  state.casterPos = {
    x: caster.x,
    y: caster.y,
    facing: caster.facing || 1,
  };
  state.targetPos = {
    x: target ? target.x : caster.x + (caster.facing || 1) * 360,
    y: target ? target.y - 40 : caster.y - 40,
  };
  state.targetBleed.targetRef = target;
  actionAudio.bloodHandCast();
  return true;
}

function spawnHand(state) {
  state.phase = 'hand';
  const bob = motion?.bobOffset || 0;
  const startX = state.casterPos.x + state.casterPos.facing * 38;
  const startY = state.casterPos.y + bob - 76;
  const targetX = state.targetPos.x;
  const targetY = state.targetPos.y;

  const dx = targetX - startX;
  const dy = targetY - startY;
  const d = Math.hypot(dx, dy) || 1;
  const spd = HUYET_THU_SPEC.speed;

  state.hand = {
    x: startX,
    y: startY,
    vx: (dx / d) * spd,
    vy: (dy / d) * spd,
    targetX,
    targetY,
    rot: Math.atan2(dy, dx) + Math.PI / 2,
    life: 0,
    grab: 0,
    size: 1.85,
  };

  for (let i = 0; i < 16; i++) {
    emitParticle(state, 'mist', startX, startY, 1.2);
  }
  actionAudio.bloodHandFly();
}

function triggerImpact(state, hitX, hitY, target, multiplier = 1) {
  state.phase = 'impact';
  state.hits++;
  if (state.hand) {
    state.hand.grab = 0.45;
  }
  state.bloodDensity = 1.0;

  // Bạo huyết: 34 blood sparks, 18 mist, 14 droplets, 2 shockwaves
  for (let i = 0; i < 34; i++) {
    emitParticle(state, 'blood', hitX, hitY, 1.8);
  }
  for (let i = 0; i < 18; i++) {
    emitParticle(state, 'mist', hitX, hitY, 1.3);
  }
  for (let i = 0; i < 14; i++) {
    spawnDrop(state, hitX + (Math.random() - 0.5) * 20, hitY + (Math.random() - 0.5) * 16, 1.3);
  }
  state.shock.push(
    { x: hitX, y: hitY, r: 18, life: 0.55, max: 0.55, col: 'rgba(255,150,165,' },
    { x: hitX, y: hitY, r: 28, life: 0.75, max: 0.75, col: 'rgba(170,20,40,' }
  );

  // Sát thương va chạm ban đầu
  (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts)))(target, HUYET_THU_SPEC.impactDamage * multiplier, {
    sparkX: hitX,
    sparkY: hitY,
    palette: ['#3e0614', '#791124', '#c72e45', '#ff5d78', '#ffb6bf', '#ffffff'],
  });
  actionAudio.bloodHandBurst();

  // Kích hoạt hoặc làm mới hiệu ứng Huyết Tích 8 giây!
  state.targetBleed.multiplier = multiplier;
  state.targetBleed.active = true;
  state.targetBleed.timeLeft = HUYET_THU_SPEC.bleedDuration; // 8.0s
  state.targetBleed.spawnTimer = 0;
  state.targetBleed.tickTimer = 0;
  state.targetBleed.targetRef = target;
}

function emitParticle(state, type, x, y, scale = 1) {
  if (type === 'mist') {
    state.particles.push({
      type,
      x,
      y,
      vx: (Math.random() - 0.5) * 28 * scale,
      vy: (Math.random() - 0.5) * 24 * scale - 12,
      life: 0.35 + Math.random() * 0.55,
      max: 0.9,
      size: 8 + Math.random() * 16 * scale,
      col: Math.random() < 0.35 ? 'rgba(255,84,112,' : 'rgba(140,13,36,',
    });
    return;
  }
  state.particles.push({
    type,
    x,
    y,
    vx: (Math.random() - 0.5) * 45 * scale,
    vy: (Math.random() - 0.5) * 45 * scale - (type === 'blood' ? 14 : 0),
    life: 0.35 + Math.random() * 0.7,
    max: 1.0,
    size: 1.8 + Math.random() * 3.2 * scale,
    col:
      type === 'blood'
        ? Math.random() < 0.22
          ? '#ffb6bf'
          : Math.random() < 0.5
          ? '#ff5d78'
          : '#8a1227'
        : '#ffffff',
  });
}

function spawnDrop(state, x, y, scale = 1, isBleed = false) {
  state.drops.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 12 * scale,
    vy: 20 + Math.random() * 36 * scale,
    life: 0.8 + Math.random() * 0.9,
    max: 1.7,
    size: 2.2 + Math.random() * 3.5 * scale,
    splash: false,
    isBleed,
  });
}

function spawnBleedingDrop(state, target) {
  if (!target) return;
  const anchors = [
    [0, -68],
    [-12, -54],
    [10, -48],
    [-8, -26],
    [12, -18],
    [0, -4],
  ];
  const a = anchors[Math.floor(Math.random() * anchors.length)];
  const xx = target.x + a[0] + (Math.random() - 0.5) * 6;
  const yy = target.y + a[1] + (Math.random() - 0.5) * 8;

  state.drops.push({
    x: xx,
    y: yy,
    vx: (Math.random() - 0.5) * 22,
    vy: 24 + Math.random() * 36,
    life: 1.65,
    max: 1.65,
    size: 2.4 + Math.random() * 2.2,
    splash: false,
    isBleed: true,
  });
  if (Math.random() < 0.32) {
    emitParticle(state, 'blood', xx, yy, 0.4);
  }
}

function addBloodPool(state, x, y) {
  if (state.bloodPools.length > 40) state.bloodPools.shift();
  state.bloodPools.push({
    x,
    y,
    r: 2.2 + Math.random() * 3.6,
    life: 4.4,
    max: 4.4,
  });
}

export function stepHuyetThu(state, dt, caster, target) {
  state.sealSpin += dt * 2.2;
  state.bloodDensity = Math.max(0.08, state.bloodDensity - dt * 0.22);

  if (caster) {
    state.casterPos = {
      x: caster.x,
      y: caster.y,
      facing: caster.facing || 1,
    };
  }
  if (target && !target.broken) {
    state.targetPos = {
      x: target.x,
      y: target.y - 42,
    };
  }

  // 1. Giai đoạn KẾT ẤN (0.7s)
  if (state.phase === 'cast') {
    state.castTime += dt;
    state.bloodDensity = Math.min(1, 0.15 + state.castTime * 0.7);
    const bob = motion?.bobOffset || 0;
    const sealX = state.casterPos.x + state.casterPos.facing * 30;
    const sealY = state.casterPos.y + bob - 76;

    for (let i = 0; i < 2; i++) {
      emitParticle(
        state,
        'mist',
        sealX + (Math.random() - 0.5) * 16,
        sealY + (Math.random() - 0.5) * 16,
        0.7
      );
    }
    if (Math.random() < dt * 18) {
      spawnDrop(
        state,
        sealX + (Math.random() - 0.5) * 20,
        sealY - 10 + (Math.random() - 0.5) * 10,
        0.8
      );
    }

    if (state.castTime >= HUYET_THU_SPEC.castSeconds) {
      spawnHand(state);
    }
  }

  // 2. Giai đoạn HUYẾT THỦ LAO TỚI MỤC TIÊU
  else if (state.phase === 'hand' && state.hand) {
    const h = state.hand;
    const oldX = h.x, oldY = h.y;
    h.life += dt;
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    h.rot = Math.atan2(h.vy, h.vx) + Math.PI / 2;
    state.bloodDensity = Math.min(1, 0.45 + h.life * 0.5);

    for (let i = 0; i < 2; i++) {
      emitParticle(
        state,
        'mist',
        h.x + (Math.random() - 0.5) * 36,
        h.y + (Math.random() - 0.5) * 36,
        0.7
      );
    }
    if (Math.random() < dt * 32) {
      spawnDrop(state, h.x + (Math.random() - 0.5) * 32, h.y + 24, 0.85);
    }

    // Kiểm tra va chạm với mục tiêu
    const hitTarget = target && !target.broken;
    const tgtX = hitTarget ? target.x : h.targetX;
    const tgtY = hitTarget ? target.y - 42 : h.targetY;
    const distToTarget = Math.hypot(h.x - tgtX, h.y - tgtY);

    const impactTime = state.damageTarget && hitTarget ? segmentCircleTOI(oldX, oldY, h.x, h.y, tgtX, tgtY, 52) : null;
    if (state.damageTarget) {
      const t1 = impactTime ?? 1;
      trackSkillSegment({ ref: h, side: 'boss', kind: 'blood_hand', x0: oldX, y0: oldY, x1: oldX+(h.x-oldX)*t1, y1: oldY+(h.y-oldY)*t1, t1, radius: 32, power: 150, onDestroy: () => { if (state.hand === h) { state.phase = 'cooldown'; state.cooldown = HUYET_THU_SPEC.cooldown; state.hand = null; } } });
    }
    if (impactTime !== null || (!state.damageTarget && (distToTarget < 52 || (hitTarget && dummyHitTest(h.x, h.y))))) {
      queueSkillImpact(h, impactTime ?? 1, () => triggerImpact(state, tgtX, tgtY, target, skillCollisionRatio(h)));
    } else if (h.life > 3.5 || h.x < -100 || h.x > WORLD_W + 100 || h.y > WORLD_H + 100) {
      state.phase = 'cooldown'; state.cooldown = HUYET_THU_SPEC.cooldown; state.hand = null;
    }
  }

  // 3. Giai đoạn HUYẾT BẠO / SIẾT NẮM ĐẤM
  else if (state.phase === 'impact') {
    if (state.hand) {
      state.hand.grab = Math.max(0, state.hand.grab - dt);
      if (target) {
        state.hand.x += (target.x - state.hand.x) * dt * 8;
        state.hand.y += (target.y - 42 - state.hand.y) * dt * 8;
      }
    }
    if (Math.random() < dt * 26 && target) {
      emitParticle(
        state,
        'blood',
        target.x + (Math.random() - 0.5) * 20,
        target.y - 40 + (Math.random() - 0.5) * 20,
        1.1
      );
    }
    state.shock = state.shock.filter((s) => (s.life -= dt) > 0);
    state.shock.forEach((s) => (s.r += 80 * dt));

    if (!state.hand || state.hand.grab <= 0.05) {
      state.phase = 'cooldown';
      state.cooldown = HUYET_THU_SPEC.cooldown;
      state.hand = null;
    }
  }

  // 4. Giai đoạn HỒI CHIÊU (5.0s)
  else if (state.phase === 'cooldown') {
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.cooldown <= 0) {
      state.phase = 'ready';
    }
  }

  // 5. Cập nhật trạng thái HUYẾT TÍCH (8.0s) trên mục tiêu
  const tb = state.targetBleed;
  if (tb.active && tb.timeLeft > 0 && target && !target.broken) {
    tb.timeLeft = Math.max(0, tb.timeLeft - dt);
    tb.spawnTimer += dt;
    tb.tickTimer += dt;

    // ~10 giọt máu nhỏ xuống đất mỗi giây
    while (tb.spawnTimer >= 0.105) {
      tb.spawnTimer -= 0.105;
      spawnBleedingDrop(state, target);
      if (Math.random() < 0.28) {
        spawnBleedingDrop(state, target);
      }
    }

    // Gây sát thương rớt máu định kỳ
    if (tb.tickTimer >= HUYET_THU_SPEC.bleedTickInterval) {
      tb.tickTimer = 0;
      (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts)))(target, HUYET_THU_SPEC.bleedTickDamage * (tb.multiplier ?? 1), {
        isDot: true,
        sparkX: target.x,
        sparkY: target.y - 50,
        palette: ['#5e0f1f', '#b81936', '#ff5d78', '#ffcad4'],
      });
      actionAudio.bloodBleedTick();
    }

    if (tb.timeLeft <= 0) {
      tb.active = false;
    }
  }

  // Cập nhật hạt sương khí máu
  state.particles = state.particles.filter((p) => (p.life -= dt) > 0);
  state.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'mist') {
      p.vx *= Math.pow(0.06, dt);
      p.vy -= 6 * dt;
    } else {
      p.vx *= Math.pow(0.18, dt);
      p.vy += 28 * dt;
    }
  });

  // Cập nhật giọt máu rơi & va chạm mặt đất
  state.drops = state.drops.filter((d) => (d.life -= dt) > 0);
  state.drops.forEach((d) => {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 78 * dt;

    // Va chạm với địa hình mặt đất thực tế
    const groundY = surfaceAt ? surfaceAt(d.x) : 600;
    if (!d.splash && d.y >= groundY - 2) {
      d.splash = true;
      d.y = groundY;
      addBloodPool(state, d.x, groundY);
      for (let i = 0; i < (d.isBleed ? 2 : 4); i++) {
        emitParticle(state, 'blood', d.x, groundY - 2, d.isBleed ? 0.35 : 0.65);
      }
      d.vx = 0;
      d.vy = 0;
      d.life = Math.min(d.life, 0.12);
    }
  });

  // Cập nhật vũng máu trên nền đất (tồn tại 4.4 giây)
  state.bloodPools = state.bloodPools.filter((p) => (p.life -= dt) > 0);
}

// ----------------------------------------------------------------------------
// WORLD-SPACE RENDERING CANVAS 2D (PIXELFX)
// ----------------------------------------------------------------------------

function glow(ctx, cx, cy, r, c1, c2 = 'rgba(255,255,255,0)') {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function drawSeal(ctx, x, y, spin) {
  glow(ctx, x, y, 42, 'rgba(255,62,95,.24)');
  for (let i = 0; i < 2; i++) {
    ctx.strokeStyle = `rgba(255,${100 + i * 30},${120 + i * 20},${0.45 - i * 0.12})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.2; a += 0.25) {
      const rr = 24 + i * 12 + Math.sin(a * 5 + spin * (i ? -0.8 : 1)) * 2.2;
      const px = x + Math.cos(a + spin * (i ? -0.7 : 1)) * rr;
      const py = y + Math.sin(a + spin * (i ? -0.7 : 1)) * rr * 0.65;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,190,200,.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - 18, y);
  ctx.lineTo(x + 18, y);
  ctx.moveTo(x, y - 16);
  ctx.lineTo(x, y + 16);
  ctx.stroke();
}

export function drawHand(ctx, h) {
  // HUYẾT THỦ V3/V4 NGUYÊN BẢN: Bàn tay săn mồi với 5 móng vuốt vuốt cong
  const t = performance.now() * 0.001;
  const grip = h.grab > 0 ? Math.min(1, Math.max(0, (0.45 - h.grab) / 0.22)) : 0;
  const anticipation = Math.max(0, Math.min(1, (h.life - 0.28) / 0.25));
  const curl = Math.min(1, grip + anticipation * 0.22);
  const S = (h.size || 1.85) * (1 + (grip ? 0.12 : 0));

  ctx.save();
  ctx.translate(h.x, h.y);
  ctx.rotate(h.rot);
  ctx.scale(S, S);

  // Hào quang huyết khí quanh cổ tay
  glow(ctx, 0, -8, 54, 'rgba(231,33,61,.22)', 'rgba(80,0,18,0)');
  glow(ctx, 0, -18, 38, 'rgba(255,84,101,.16)', 'rgba(80,0,18,0)');

  // Các dải khí huyết cuộn sau cổ tay
  for (let i = 0; i < 6; i++) {
    const dx = (i - 2.5) * 5.2;
    const wiggle = Math.sin(t * 4 + i * 1.7) * 4;
    ctx.strokeStyle = i % 2 ? 'rgba(110,7,27,.78)' : 'rgba(203,28,57,.68)';
    ctx.lineWidth = 1.8 + (i % 3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(dx * 0.6, 16);
    ctx.bezierCurveTo(dx + wiggle, 30, dx * 1.5 - wiggle, 44, dx + Math.sin(t * 2.1 + i) * 7, 56);
    ctx.stroke();
  }

  // Giọt máu rớt dọc cổ tay
  for (let i = 0; i < 5; i++) {
    const a = t * (0.8 + i * 0.12) + i * 1.6;
    const dy = (a * 12) % 28;
    const xx = -12 + i * 6.3 + Math.sin(a) * 1.8;
    ctx.fillStyle = i % 2 ? 'rgba(255,127,143,.82)' : 'rgba(139,12,32,.88)';
    ctx.beginPath();
    ctx.ellipse(xx, 26 + dy, 1.4, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cổ tay hóa lỏng thành huyết dịch (không phải cổ tay người phẳng)
  const wr = ctx.createLinearGradient(-14, 4, 14, 5);
  wr.addColorStop(0, '#3e0614');
  wr.addColorStop(0.28, '#791124');
  wr.addColorStop(0.55, '#d7334c');
  wr.addColorStop(0.85, '#851027');
  wr.addColorStop(1, '#370611');
  ctx.fillStyle = wr;
  ctx.strokeStyle = '#330711';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-14, 8);
  ctx.lineTo(14, 8);
  ctx.quadraticCurveTo(14, 25, 11, 34);
  ctx.quadraticCurveTo(4, 28, -3, 36);
  ctx.quadraticCurveTo(-9, 29, -12, 35);
  ctx.quadraticCurveTo(-12, 20, -14, 8);
  ctx.fill();
  ctx.stroke();

  // BỐN NGÓN TAY VUỐT CONG SĂN MỒI
  const digits = [
    { x: -13.2, len: 32.5, w: 7.9, spread: -1.1 },
    { x: -4.4, len: 43.5, w: 8.5, spread: -0.38 },
    { x: 5.2, len: 41.5, w: 8.3, spread: 0.34 },
    { x: 14.2, len: 33.0, w: 7.4, spread: 1.02 },
  ];
  const coords = [];

  for (let i = 0; i < digits.length; i++) {
    const f = digits[i];
    const move = Math.sin(t * 5.4 + i * 1.3) * 0.85 * (1 - grip);
    const bx = f.x;
    const by = -12.0;
    const jx = bx + f.spread * 7.5 * (1 - curl * 0.65) + move;
    const jy = by - f.len * (0.57 - 0.08 * curl);
    const dx = bx + f.spread * 10.3 * (1 - curl * 0.7) - bx * 0.23 * curl;
    const dy = by - f.len * (0.96 - 0.34 * curl);
    const tx = dx - Math.sign(f.x) * 3.2 + Math.sin(i * 2) * 1.0 + -bx * 0.34 * curl;
    const ty = dy + 5.5 + curl * 11.8;
    coords.push([bx, by, jx, jy, dx, dy, tx, ty]);

    // Viền đậm tách ngón tay khỏi nền
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#310713';
    ctx.lineWidth = f.w + 3.2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(jx, jy, dx, dy);
    ctx.stroke();

    ctx.strokeStyle = i % 2 ? '#a91934' : '#bd203b';
    ctx.lineWidth = f.w + 0.2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(jx, jy, dx, dy);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(250,96,120,.46)';
    ctx.lineWidth = f.w * 0.35;
    ctx.beginPath();
    ctx.moveTo(bx - 1.2, by - 1);
    ctx.quadraticCurveTo(jx - 2, jy + 2, dx - 1.2, dy);
    ctx.stroke();

    // Đốt ngón thứ 2 gập mạnh về phía con mồi
    ctx.strokeStyle = '#420814';
    ctx.lineWidth = f.w * 0.8 + 2;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.quadraticCurveTo(tx + 1.4, ty - 5, tx, ty);
    ctx.stroke();

    ctx.strokeStyle = '#c72e45';
    ctx.lineWidth = f.w * 0.72;
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.quadraticCurveTo(tx + 1.4, ty - 5, tx, ty);
    ctx.stroke();

    // Rãnh khớp ngón tay
    ctx.strokeStyle = 'rgba(51,4,18,.82)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(jx - 3, jy - 1);
    ctx.lineTo(jx + 3, jy + 1);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,179,183,.65)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.moveTo(jx - 2, jy - 3);
    ctx.lineTo(jx + 2, jy - 2);
    ctx.stroke();

    // MÓNG VUỐT CONG NHỌN QUẶP VÀO TRONG
    const dxTip = -Math.sign(f.x || 1) * (5.8 + curl * 1.4);
    const dyTip = 5.8 + curl * 2.2;
    ctx.fillStyle = i === 1 ? '#ffacb9' : '#f7a2ad';
    ctx.strokeStyle = '#6b1024';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(tx - 2.5, ty - 2);
    ctx.quadraticCurveTo(tx + 2.3, ty - 1, tx + dxTip, ty + dyTip);
    ctx.quadraticCurveTo(tx - 1.3, ty + 1.4, tx - 2.5, ty - 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,245,232,.82)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 1);
    ctx.lineTo(tx + dxTip * 0.7, ty + dyTip * 0.7);
    ctx.stroke();
  }

  // LÒNG BÀN TAY & MU BÀN TAY CƠ BẮP GÂN MÁU
  const skin = ctx.createLinearGradient(-22, -12, 23, 16);
  skin.addColorStop(0, '#450616');
  skin.addColorStop(0.19, '#7f1029');
  skin.addColorStop(0.45, '#bd213d');
  skin.addColorStop(0.6, '#d3314b');
  skin.addColorStop(0.81, '#80112b');
  skin.addColorStop(1, '#300611');
  ctx.fillStyle = skin;
  ctx.strokeStyle = '#330712';
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(-18, -13);
  ctx.quadraticCurveTo(-23, -5, -19, 7);
  ctx.quadraticCurveTo(-15, 21, -2, 22);
  ctx.quadraticCurveTo(11, 23, 19, 9);
  ctx.quadraticCurveTo(23, -3, 16, -15);
  ctx.quadraticCurveTo(0, -21, -18, -13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // 4 phiến xương khớp bàn tay
  for (let i = 0; i < 4; i++) {
    const kx = -12.5 + i * 8.6;
    ctx.fillStyle = 'rgba(255,111,130,.22)';
    ctx.beginPath();
    ctx.ellipse(kx, -13, 4.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(252,150,163,.52)';
    ctx.lineWidth = 0.85;
    ctx.beginPath();
    ctx.arc(kx, -13, 2.9, Math.PI * 0.9, Math.PI * 1.85);
    ctx.stroke();
  }

  // Mạch máu đỏ tươi đập theo nhịp
  const pulse = 0.55 + Math.sin(t * 11) * 0.2;
  ctx.strokeStyle = `rgba(255,132,160,${pulse})`;
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-2, 18);
  ctx.bezierCurveTo(-4, 9, -10, 3, -12, -12);
  ctx.moveTo(-2, 18);
  ctx.bezierCurveTo(5, 11, 10, 1, 13, -12);
  ctx.moveTo(-2, 17);
  ctx.quadraticCurveTo(3, 3, 1, -12);
  ctx.stroke();

  // NGÓN CÁI ĐỐI XỨNG CỰC KỲ SẮC BÉN
  const baseX = -18;
  const baseY = -3;
  const midX = -23 + grip * 3.2;
  const midY = -12 + grip * 2.2;
  const tipX = -17 + grip * 7.4;
  const tipY = -27 + grip * 13.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#340710';
  ctx.lineWidth = 10.5;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX - 5, midY, midX, midY);
  ctx.quadraticCurveTo(midX + 3, midY - 9, tipX, tipY);
  ctx.stroke();

  ctx.strokeStyle = '#af2038';
  ctx.lineWidth = 7.5;
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX - 5, midY, midX, midY);
  ctx.quadraticCurveTo(midX + 3, midY - 9, tipX, tipY);
  ctx.stroke();

  // Móng vuốt ngón cái quặp ngang
  ctx.fillStyle = '#ffb5bd';
  ctx.strokeStyle = '#601020';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(tipX - 2.5, tipY - 2.3);
  ctx.quadraticCurveTo(tipX + 1, tipY - 5, tipX + 6.5 + grip * 4, tipY + 1.2 + grip * 4);
  ctx.lineTo(tipX + 1, tipY + 2.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  if (grip > 0) {
    const impactAlpha = 0.25 + grip * 0.4;
    ctx.strokeStyle = `rgba(255,181,190,${impactAlpha})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, -14, 32 - grip * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBleedingOverlay(ctx, target, timeLeft, wx0, wy0) {
  if (!target || timeLeft <= 0) return;
  const tt = performance.now() / 1000;
  const x = target.x - wx0;
  const y = target.y - wy0;
  const alpha = Math.min(1, timeLeft * 2.5);

  // 3 dòng huyết dịch sáng bóng chảy dọc cơ thể
  const streams = [
    [-10, -68, -8, -42, -9, -10],
    [5, -74, 12, -40, 8, 2],
    [-2, -45, -4, -22, -2, 14],
  ];

  ctx.save();
  for (let i = 0; i < streams.length; i++) {
    const q = streams[i];
    const pulse = 0.74 + Math.sin(tt * 7 + i * 1.9) * 0.16;
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = `rgba(201,18,46,${pulse * alpha})`;
    ctx.beginPath();
    ctx.moveTo(x + q[0], y + q[1]);
    ctx.quadraticCurveTo(x + q[2] + Math.sin(tt * 2 + i) * 2.5, y + q[3], x + q[4], y + q[5]);
    ctx.stroke();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(255,136,145,${alpha * 0.75})`;
    ctx.beginPath();
    ctx.moveTo(x + q[0] - 1, y + q[1] + 2);
    ctx.lineTo(x + q[2] - 1, y + q[3]);
    ctx.stroke();

    const dropPhase = (tt * 0.85 + i * 0.27) % 1;
    ctx.fillStyle = `rgba(249,65,88,${alpha * 0.88})`;
    ctx.fillRect(x + q[2] + Math.sin(tt * 2 + i) * 1.5, y + q[1] + (q[5] - q[1]) * dropPhase, 2.2, 4.5);
  }

  // Nhãn trạng thái nổi trên đầu mục tiêu
  const label = `HUYẾT TÍCH ${timeLeft.toFixed(1)}s`;
  ctx.font = 'bold 10px monospace, system-ui';
  const tw = ctx.measureText(label).width;
  const labelY = y - 165;
  ctx.fillStyle = 'rgba(41,7,18,.88)';
  ctx.fillRect(x - tw / 2 - 6, labelY - 12, tw + 12, 16);
  ctx.strokeStyle = '#9a243a';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - tw / 2 - 6, labelY - 12, tw + 12, 16);
  ctx.fillStyle = '#ff9da9';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, labelY);
  ctx.restore();
}

export function renderHuyetThuWorld(state, slowTarget = null) {
  const ctx = game.ctx;
  if (!ctx || settings.fxQuality === 'off') return;

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 1. Vẽ các vũng máu loang trên mặt đất (Blood Pools)
  state.bloodPools.forEach((p) => {
    const a = Math.min(0.65, (p.life / p.max) * 0.65);
    const px = p.x - wx0;
    const py = p.y - wy0;
    ctx.fillStyle = `rgba(112,9,26,${a})`;
    ctx.beginPath();
    ctx.ellipse(px, py, p.r * 3.2, p.r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(243,50,73,${a * 0.42})`;
    ctx.fillRect(px - p.r * 0.9, py - 0.5, p.r * 1.8, 1.2);
  });

  // 2. Vẽ pháp trận kết ấn nếu đang tụ ấn
  if (state.phase === 'cast') {
    const bob = motion?.bobOffset || 0;
    const sealX = state.casterPos.x + state.casterPos.facing * 30 - wx0;
    const sealY = state.casterPos.y + bob - 76 - wy0;
    drawSeal(ctx, sealX, sealY, state.sealSpin);
  }

  // 3. Vẽ bàn tay máu khổng lồ nếu đang bay hoặc đang va chạm
  if (state.hand) {
    const hScreen = {
      ...state.hand,
      x: state.hand.x - wx0,
      y: state.hand.y - wy0,
    };
    drawHand(ctx, hScreen);
  }

  // 4. Vẽ các hạt khí máu & sương đỏ
  state.particles.forEach((p) => {
    const a = Math.min(1, p.life / (p.max || 1));
    const px = p.x - wx0;
    const py = p.y - wy0;
    if (p.type === 'mist') {
      glow(ctx, px, py, p.size, p.col + a + ')', 'rgba(255,0,0,0)');
    } else {
      ctx.fillStyle = p.col;
      ctx.globalAlpha = a;
      ctx.fillRect(Math.round(px), Math.round(py), p.size, p.size);
      ctx.globalAlpha = 1;
    }
  });

  // 5. Vẽ giọt máu rơi
  state.drops.forEach((d) => {
    const a = Math.min(1, d.life / (d.max || 1));
    const dx = d.x - wx0;
    const dy = d.y - wy0;
    ctx.fillStyle = `rgba(185,18,42,${a})`;
    ctx.beginPath();
    ctx.moveTo(dx, dy - d.size * 0.9);
    ctx.quadraticCurveTo(dx + d.size * 0.8, dy - d.size * 0.25, dx, dy + d.size);
    ctx.quadraticCurveTo(dx - d.size * 0.8, dy - d.size * 0.25, dx, dy - d.size * 0.9);
    ctx.fill();
  });

  // 6. Vẽ sóng xung kích khi bạo huyết
  state.shock.forEach((s) => {
    const a = Math.min(1, s.life / s.max);
    const sx = s.x - wx0;
    const sy = s.y - wy0;
    ctx.strokeStyle = s.col + a + ')';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(sx, sy, s.r * 1.2, s.r * 0.6, 0, 0, Math.PI * 2);
    ctx.stroke();
  });

  // 7. Vẽ hiệu ứng Huyết Tích trên mục tiêu (chảy máu 8 giây)
  const tb = state.targetBleed;
  if (tb.active && tb.timeLeft > 0 && tb.targetRef) {
    drawBleedingOverlay(ctx, tb.targetRef, tb.timeLeft, wx0, wy0);
  }

  ctx.restore();
}
