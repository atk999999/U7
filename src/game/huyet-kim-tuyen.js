import { trackSkillSegment, queueSkillImpact, skillCollisionRatio } from './va-cham-ky-nang.js';
// ============================================================================
// MODULE: SKILL 02 · HUYẾT KIM TUYẾN (HUYẾT DỰ - PIXELFX)
// Tụ lực vô hạn đổi máu và mana (-6 HP/s, -12 MP/s), huyết quang hội tụ về ngón tay,
// thả ra phóng hàng loạt sợi kim tuyến đỏ truy kích, xuyên huyết bạo,
// ghim huyết quang, rớt máu 6s, hồi chiêu 8s.
// Tích hợp từ Huyet_Du_Skill_02_Huyet_Kim_Tuyen_V3_Vo_Han_PixelFX_OFFLINE.html
// ============================================================================

import { clamp, settings, game, camera, addCameraShake, motion } from './state.js';
import { dummyDamage } from './character.js';
import { surfaceAt } from './map.js';
import { actionAudio } from './audio.js';

export const HUYET_KIM_TUYEN_SPEC = {
  hpDrainPerSec: 6,
  manaDrainPerSec: 12,
  cooldown: 8.0,
  bleedDuration: 6.0,
  maxMotes: 96,
  maxShots: 96,
  baseDamagePerShot: 14,
  finalBurstDamage: 90,
  bleedTickInterval: 0.75,
  bleedTickDamage: 16,
};

const TAU = Math.PI * 2;

function bezier(a, b, c, d, q) {
  const v = 1 - q;
  return v * v * v * a + 3 * v * v * q * b + 3 * v * q * q * c + q * q * q * d;
}

function rndSeed(seed, lo, hi) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return lo + (x - Math.floor(x)) * (hi - lo);
}

function smooth(q) {
  return q * q * (3 - 2 * q);
}

export function createHuyetKimTuyenState() {
  return {
    phase: 'ready', // 'ready' | 'charge' | 'release' | 'cooldown'
    chargeTime: 0,
    cooldown: 0,
    elapsed: 0,
    heldPointerId: null,
    motes: [],
    shots: [],
    sparks: [],
    wisps: [],
    impactRings: [],
    bloodDrops: [],
    wounds: [],
    bloodPools: [],
    bleedTimer: 0,
    bleedTickTimer: 0,
    afterPulse: 0,
    shake: 0,
    hits: 0,
    casterPos: { x: 0, y: 0, facing: 1 },
    targetPos: { x: 0, y: 0 },
    targetRef: null,
  };
}

function newMote() {
  const lane = Math.floor(Math.random() * 3);
  const life = 0.72 + Math.random() * 0.56;
  return {
    lane,
    life,
    age: Math.random() * life,
    size: 0.6 + Math.random() * 0.75,
    seed: Math.random() * 99,
    st: -5 + Math.random() * 10,
  };
}

export function beginHuyetKimTuyen(state, caster, target, pointerId = null) {
  if (state.phase !== 'ready' && state.phase !== 'cooldown') return false;
  if (state.cooldown > 0) return false;
  if (caster.hp <= 1 || caster.mana <= 0) return false;

  state.phase = 'charge';
  state.chargeTime = 0;
  state.elapsed = 0;
  state.heldPointerId = pointerId;
  state.motes = Array.from({ length: 4 }, newMote);
  state.shots = [];
  state.targetRef = target;
  state.casterPos = {
    x: caster.x,
    y: caster.y,
    facing: caster.facing || 1,
  };
  state.targetPos = {
    x: target ? target.x : caster.x + (caster.facing || 1) * 380,
    y: target ? target.y - 42 : caster.y - 42,
  };
  actionAudio.startBloodThreadCharge();
  return true;
}

export function releaseHuyetKimTuyen(state) {
  if (state.phase !== 'charge') return false;

  state.heldPointerId = null;
  state.phase = 'release';
  state.elapsed = 0;
  state.shots = [];

  const n = Math.max(
    4,
    Math.min(HUYET_KIM_TUYEN_SPEC.maxShots, 4 + Math.floor(state.chargeTime * 8))
  );

  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? i / (n - 1) - 0.5 : 0;
    const band = i % 3;
    const delay = Math.min(2.4, 0.008 * i + Math.floor(i / 10) * 0.026);
    state.shots.push({
      delay,
      time: 0,
      duration: 0.42 + Math.random() * 0.28 + delay * 0.2,
      dx: -3 + Math.random() * 6,
      dy: -4 + Math.random() * 8,
      bend: spread * 48 + (band - 1) * 16,
      hitOffset: spread * 28,
      trail: [],
      dead: false,
      final: i === n - 1,
    });
  }
  actionAudio.bloodThreadRelease(n);
  return true;
}

function spark(state, x, y, n = 8, power = 1) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI + Math.random() * Math.PI * 2;
    const spd = (16 + Math.random() * 38) * power;
    if (state.sparks.length >= 120) state.sparks.shift();
    state.sparks.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      age: 0,
      life: 0.24 + Math.random() * 0.48,
      kind: Math.random() < 0.2 ? 'pearl' : 'red',
      size: Math.random() < 0.2 ? 2.2 : 1.2,
    });
  }
}

function makeWisp(state, x, y, vx, vy, life = 0.6) {
  if (state.wisps.length >= 48) state.wisps.shift();
  state.wisps.push({
    x,
    y,
    vx,
    vy,
    life,
    max: life,
    r: 2.2 + Math.random() * 3.5,
    rot: -0.9 + Math.random() * 1.8,
  });
}

function dropBlood(state, x, y, power = 1) {
  if (state.bloodDrops.length >= 80) state.bloodDrops.shift();
  state.bloodDrops.push({
    x,
    y,
    vx: (-10 + Math.random() * 20) * power,
    vy: (-6 + Math.random() * 14) * power,
    life: 0.7 + Math.random() * 0.8,
    size: 1.8 + Math.random() * 2.2,
    floor: false,
  });
}

function addBloodPool(state, x, y) {
  if (state.bloodPools.length > 36) state.bloodPools.shift();
  state.bloodPools.push({
    x,
    y,
    r: 2.4 + Math.random() * 3.2,
    life: 5.0,
    max: 5.0,
  });
}

function triggerShotImpact(state, x, y, final, multiplier = 1) {
  state.hits++;
  const target = state.targetRef;
  const power = 1 + state.chargeTime * 0.22;

  state.afterPulse = final ? 0.85 : Math.max(state.afterPulse, 0.22);
  state.bleedMultiplier = multiplier;
  state.bleedTimer = HUYET_KIM_TUYEN_SPEC.bleedDuration; // 6.0s
  state.bleedTickTimer = 0;

  state.impactRings.push({
    x,
    y,
    r: 1.5,
    life: final ? 0.85 : 0.35,
    max: final ? 0.85 : 0.35,
    final,
  });
  if (state.impactRings.length > 14) state.impactRings.shift();

  spark(state, x, y, final ? Math.min(52, 28 + Math.floor(power * 8)) : 6, final ? 1.4 : 0.85);

  for (let i = 0; i < (final ? 12 : 3); i++) {
    makeWisp(
      state,
      x + (-6 + Math.random() * 12),
      y + (-8 + Math.random() * 16),
      -10 + Math.random() * 20,
      -12 + Math.random() * 16,
      0.35 + Math.random() * 0.5
    );
  }

  if (final || state.hits % 4 === 0) {
    for (let j = 0; j < (final ? 16 : 4); j++) {
      dropBlood(
        state,
        x + (-8 + Math.random() * 16),
        y + (-12 + Math.random() * 24),
        final ? 1.5 : 1
      );
    }
  }

  // Ghim sợi huyết quang trên thân địch
  if (state.wounds.length < 12 || final) {
    state.wounds.push({
      x: -12 + Math.random() * 24,
      y: -65 + Math.random() * 50,
      angle: -0.9 + Math.random() * 1.8,
      life: 6.0,
      max: 6.0,
      seed: Math.random() * 100,
    });
    if (state.wounds.length > 12) state.wounds.shift();
  }

  // Gây sát thương
  const dmg = final
    ? HUYET_KIM_TUYEN_SPEC.finalBurstDamage + Math.round(state.chargeTime * 12)
    : HUYET_KIM_TUYEN_SPEC.baseDamagePerShot + Math.round(state.chargeTime * 1.5);

  (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts)))(target, dmg * multiplier, {
    sparkX: x,
    sparkY: y,
    palette: ['#320715', '#941334', '#ed4464', '#ff7894', '#ffc2cb', '#fff2ec'],
  });

  actionAudio.bloodThreadHit(final);

  if (final) {
    addCameraShake(3.2, 0.18);
  }
}

function inFlow(palmX, palmY, m, q) {
  q = clamp(q, 0, 1);
  const z = m.seed * 11.3;
  const st = m.st;
  let a, b, c, d;
  if (m.lane === 0) {
    a = [palmX - 32 + rndSeed(z, -12, 12), palmY - 55 + rndSeed(z + 1, -10, 10)];
    b = [palmX - 22 + rndSeed(z + 2, -10, 10), palmY - 38 + rndSeed(z + 3, -8, 8)];
    c = [palmX - 10 + rndSeed(z + 4, -8, 8), palmY - 18 + rndSeed(z + 5, -6, 6)];
    d = [palmX + st * 0.22, palmY + st * 0.28];
  } else if (m.lane === 1) {
    a = [palmX + 44 + rndSeed(z, -15, 15), palmY - 34 + rndSeed(z + 1, -10, 10)];
    b = [palmX + 32 + rndSeed(z + 2, -12, 12), palmY - 18 + rndSeed(z + 3, -8, 8)];
    c = [palmX + 16 + rndSeed(z + 4, -8, 8), palmY - 6 + rndSeed(z + 5, -6, 6)];
    d = [palmX + st * 0.3, palmY + st * 0.24];
  } else {
    a = [palmX + 28 + rndSeed(z, -12, 12), palmY + 38 + rndSeed(z + 1, -10, 10)];
    b = [palmX + 20 + rndSeed(z + 2, -10, 10), palmY + 24 + rndSeed(z + 3, -8, 8)];
    c = [palmX + 10 + rndSeed(z + 4, -8, 8), palmY + 12 + rndSeed(z + 5, -6, 6)];
    d = [palmX + st * 0.28, palmY + st * 0.16];
  }
  return {
    x: bezier(a[0], b[0], c[0], d[0], q),
    y: bezier(a[1], b[1], c[1], d[1], q),
  };
}

export function stepHuyetKimTuyen(state, dt, caster, target) {
  state.elapsed += dt;
  state.afterPulse = Math.max(0, state.afterPulse - dt);

  if (caster) {
    state.casterPos = {
      x: caster.x,
      y: caster.y,
      facing: caster.facing || 1,
    };
  }
  if (target && !target.broken) {
    state.targetRef = target;
    state.targetPos = {
      x: target.x,
      y: target.y - 42,
    };
  }

  const bob = motion?.bobOffset || 0;
  const palmX = state.casterPos.x + state.casterPos.facing * 40;
  const palmY = state.casterPos.y + bob - 87;

  // 1. Giai đoạn TỤ LỰC VÔ HẠN (-6 HP/s, -12 MP/s)
  if (state.phase === 'charge') {
    // Trừ máu và mana của người thi triển
    if (caster) {
      const canHP = Math.max(0, (caster.hp - 1) / HUYET_KIM_TUYEN_SPEC.hpDrainPerSec);
      const canMP = Math.max(0, caster.mana / HUYET_KIM_TUYEN_SPEC.manaDrainPerSec);
      const actualDt = Math.max(0, Math.min(dt, canHP, canMP));

      state.chargeTime += actualDt;
      caster.hp = Math.max(1, caster.hp - HUYET_KIM_TUYEN_SPEC.hpDrainPerSec * actualDt);
      caster.mana = Math.max(0, caster.mana - HUYET_KIM_TUYEN_SPEC.manaDrainPerSec * actualDt);

      // Cạn kiệt máu hoặc mana -> tự động phóng ra!
      if (actualDt < dt - 1e-4 || caster.hp <= 1.001 || caster.mana <= 0.001) {
        releaseHuyetKimTuyen(state);
      }
    } else {
      state.chargeTime += dt;
    }
    actionAudio.updateBloodThreadCharge(state.chargeTime);

    // Cập nhật số hạt hội tụ theo thời gian tụ lực
    const desiredCount = Math.min(
      HUYET_KIM_TUYEN_SPEC.maxMotes,
      4 + Math.floor(state.chargeTime * 7)
    );
    while (state.motes.length < desiredCount) {
      state.motes.push(newMote());
    }
    for (const m of state.motes) {
      m.age += dt;
      if (m.age >= m.life) {
        m.age -= m.life;
        m.st = -5 + Math.random() * 10;
      }
    }

    const freq = 4 + Math.min(24, Math.log1p(state.chargeTime) * 7);
    if (Math.random() < freq * dt) {
      makeWisp(
        state,
        palmX + (-6 + Math.random() * 12),
        palmY + (-5 + Math.random() * 10),
        -8 + Math.random() * 16,
        -14 + Math.random() * 8,
        0.32 + Math.random() * 0.5
      );
    }
  }

  // 2. Giai đoạn PHÓNG HÀNG LOẠT KIM TUYẾN
  else if (state.phase === 'release') {
    let living = 0;
    const tgtX = state.targetPos.x;
    const tgtY = state.targetPos.y;

    for (const s of state.shots) {
      if (s.dead) continue;
      const previousTime = s.time;
      s.time += dt;
      if (s.time < s.delay) {
        living++;
        continue;
      }

      const q = clamp((s.time - s.delay) / s.duration, 0, 1);
      const v = smooth(q);
      const startX = palmX + s.dx;
      const startY = palmY + s.dy;
      const targetPointX = tgtX + rndSeed(s.bend * 3, -4, 4);
      const targetPointY = tgtY + s.hitOffset * 0.6;

      const mid1X = startX + (tgtX - startX) * 0.35 + s.bend * 0.25;
      const mid1Y = startY + (tgtY - startY) * 0.2 - s.bend * 0.65;
      const mid2X = tgtX - 50 * state.casterPos.facing;
      const mid2Y = targetPointY - 32 + s.bend * 0.3;

      const x = bezier(startX, mid1X, mid2X, targetPointX, v);
      const y = bezier(startY, mid1Y, mid2Y, targetPointY, v);

      const previous = s.trail[0] || { x: startX, y: startY };
      const t0 = dt > 0 ? Math.max(0, (s.delay - previousTime) / dt) : 0;
      const t1 = dt > 0 ? Math.min(1, (s.delay + s.duration - previousTime) / dt) : 1;
      if (state.damageTarget) trackSkillSegment({ ref: s, side: 'boss', kind: 'blood_thread', x0: previous.x, y0: previous.y, x1: x, y1: y, t0, t1, radius: 5, power: 12, onDestroy: () => { s.dead = true; } });
      s.trail.unshift({ x, y });
      if (s.trail.length > 14) s.trail.pop();
      if (q >= 1) {
        queueSkillImpact(s, t1, () => { s.dead = true; triggerShotImpact(state, x, y, s.final, skillCollisionRatio(s)); });
      }
      living++;
    }

    if (living === 0) {
      state.phase = 'cooldown';
      state.cooldown = HUYET_KIM_TUYEN_SPEC.cooldown;
    }
  }

  // 3. Giai đoạn HỒI CHIÊU (8.0s)
  else if (state.phase === 'cooldown') {
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.cooldown <= 0) {
      state.phase = 'ready';
      state.chargeTime = 0;
    }
  }

  // 4. Cập nhật trạng thái HUYẾT ẤN 6.0 GIÂY
  if (state.bleedTimer > 0) {
    state.bleedTimer = Math.max(0, state.bleedTimer - dt);
    state.bleedTickTimer += dt;

    if (target && !target.broken) {
      for (const w of state.wounds) {
        w.life = Math.min(w.life, state.bleedTimer);
      }
      if (Math.random() < dt * (7 + Math.min(11, state.chargeTime * 0.65))) {
        dropBlood(
          state,
          target.x + (-10 + Math.random() * 20),
          target.y - 48 + Math.random() * 38,
          1
        );
      }
      if (Math.random() < dt * 10) {
        makeWisp(
          state,
          target.x + (-12 + Math.random() * 24),
          target.y - 44 + Math.random() * 25,
          -4 + Math.random() * 8,
          -14 + Math.random() * 8,
          0.3 + Math.random() * 0.3
        );
      }

      // Sát thương rớt máu định kỳ
      if (state.bleedTickTimer >= HUYET_KIM_TUYEN_SPEC.bleedTickInterval) {
        state.bleedTickTimer = 0;
        (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts)))(target, HUYET_KIM_TUYEN_SPEC.bleedTickDamage * (state.bleedMultiplier ?? 1), {
          isDot: true,
          sparkX: target.x,
          sparkY: target.y - 45,
          palette: ['#640c27', '#ce274c', '#ff7894', '#fff2ec'],
        });
        actionAudio.bloodBleedTick();
      }
    }
  } else {
    state.wounds = [];
  }

  // Cập nhật giọt máu rơi
  state.bloodDrops.forEach((d) => {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vy += 45 * dt;
    d.life -= dt;

    const groundY = surfaceAt ? surfaceAt(d.x) : 600;
    if (!d.floor && d.y >= groundY - 2) {
      d.floor = true;
      d.y = groundY;
      d.vx = 0;
      d.vy = 0;
      addBloodPool(state, d.x, groundY);
    }
  });
  state.bloodDrops = state.bloodDrops.filter((d) => d.life > 0);

  // Cập nhật tia sáng tàn dư & sương
  state.wisps = state.wisps.filter((w) => (w.life -= dt) > 0);
  state.wisps.forEach((w) => {
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    w.vx *= Math.pow(0.15, dt);
    w.vy -= 4 * dt;
  });

  state.sparks = state.sparks.filter((v) => (v.age += dt) < v.life);
  state.sparks.forEach((v) => {
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.vx *= Math.pow(0.34, dt);
    v.vy += 38 * dt;
  });

  state.impactRings = state.impactRings.filter((r) => (r.life -= dt) > 0);
  state.impactRings.forEach((r) => (r.r += (r.final ? 54 : 32) * dt));

  state.bloodPools = state.bloodPools.filter((p) => (p.life -= dt) > 0);
}

// ----------------------------------------------------------------------------
// WORLD-SPACE RENDERING (CANVAS 2D PIXELFX)
// ----------------------------------------------------------------------------

function glow(ctx, cx, cy, r, c1, c2 = 'rgba(255,255,255,0)') {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

export function renderHuyetKimTuyenWorld(state) {
  const ctx = game.ctx;
  if (!ctx || settings.fxQuality === 'off') return;

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const bob = motion?.bobOffset || 0;
  const palmX = state.casterPos.x + state.casterPos.facing * 40 - wx0;
  const palmY = state.casterPos.y + bob - 87 - wy0;

  // 1. Hiệu ứng tụ lực: Dòng chảy huyết khí hội tụ về ngón tay
  if (state.phase === 'charge') {
    const power = Math.min(1, state.chargeTime / 12);

    // 3 dòng huyết khí uốn lượn về đầu ngón tay
    const streams = [
      [palmX - 35, palmY - 45, palmX - 25, palmY - 25, palmX - 12, palmY - 10],
      [palmX + 45, palmY - 35, palmX + 30, palmY - 18, palmX + 14, palmY - 6],
      [palmX + 30, palmY + 40, palmX + 20, palmY + 22, palmX + 10, palmY + 8],
    ];

    for (let i = 0; i < streams.length; i++) {
      const [ax, ay, bx, by, cx, cy] = streams[i];
      const fade = 0.28 + 0.32 * power;

      ctx.strokeStyle = `rgba(148,19,52,${fade * 0.7})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.bezierCurveTo(bx, by, cx, cy, palmX, palmY);
      ctx.stroke();

      for (let z = 0; z < 2 + Math.floor(power * 2); z++) {
        const t = (state.elapsed * (0.48 + power * 0.27) + z * 0.28 + i * 0.13) % 1;
        const r = Math.min(1, t + 0.05);
        const x = bezier(ax, bx, cx, palmX, t);
        const y = bezier(ay, by, cy, palmY, t);
        const nx = bezier(ax, bx, cx, palmX, r);
        const ny = bezier(ay, by, cy, palmY, r);

        ctx.strokeStyle = `rgba(255,120,148,${0.5 + 0.45 * power})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nx, ny);
        ctx.stroke();

        ctx.fillStyle = '#ffc2cb';
        ctx.fillRect(Math.round(nx) - 1, Math.round(ny) - 1, 2.5, 2.5);
      }
    }

    // Các hạt huyết quang với đuôi sao băng hội tụ về đầu ngón tay
    for (let i = 0; i < state.motes.length; i++) {
      const m = state.motes[i];
      const q = m.age / m.life;
      const head = inFlow(palmX, palmY, m, q);
      const ta = inFlow(palmX, palmY, m, Math.max(0, q - 0.16));
      const tb = inFlow(palmX, palmY, m, Math.max(0, q - 0.08));

      const fade = Math.max(0, Math.min(1, q * 7, (1 - q) * 6));
      if (fade <= 0) continue;
      const k = fade * (0.75 + 0.25 * power);

      ctx.strokeStyle = `rgba(206,39,76,${0.85 * k})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ta.x, ta.y);
      ctx.lineTo(tb.x, tb.y);
      ctx.lineTo(head.x, head.y);
      ctx.stroke();

      ctx.fillStyle = i % 5 === 0 ? '#fff2ec' : '#ffc2cb';
      ctx.fillRect(Math.round(head.x) - 1, Math.round(head.y) - 1, 2.5, 2.5);
      if (i % 3 === 0) {
        glow(ctx, head.x, head.y, 4 + m.size, 'rgba(237,68,100,.35)');
      }
    }

    // Huyết tinh lăng trụ (Faceted Blood Talisman) trên đầu ngón tay
    const r = 4.5 + Math.min(9.5, Math.log1p(state.chargeTime) * 3.2);
    glow(ctx, palmX, palmY, r * 3.5, 'rgba(237,68,100,.28)');
    glow(ctx, palmX, palmY, r * 1.6, 'rgba(255,120,148,.38)');

    ctx.fillStyle = '#ce274c';
    ctx.strokeStyle = '#ffc2cb';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(palmX, palmY - r * 2.15);
    ctx.lineTo(palmX + r * 0.83, palmY - r * 0.1);
    ctx.lineTo(palmX + r * 0.5, palmY + r * 0.45);
    ctx.lineTo(palmX, palmY + r * 1.68);
    ctx.lineTo(palmX - r * 0.72, palmY + r * 0.13);
    ctx.lineTo(palmX - r * 0.86, palmY - r * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff2ec';
    ctx.fillRect(Math.round(palmX) - 1.5, Math.round(palmY) - 2.5, 3, 3);
  }

  // 2. Hiệu ứng phóng: Tia Kim Tuyến uốn lượn truy kích
  for (const s of state.shots) {
    if (s.dead || !s.trail.length) continue;
    const n = s.trail.length;
    const h = s.trail[0];
    const headX = h.x - wx0;
    const headY = h.y - wy0;

    for (let j = n - 1; j > 0; j--) {
      const a = s.trail[j];
      const bb = s.trail[j - 1];
      const k = 1 - j / n;
      const ax = a.x - wx0;
      const ay = a.y - wy0;
      const bx = bb.x - wx0;
      const by = bb.y - wy0;

      ctx.strokeStyle = `rgba(100,12,39,${0.45 * k})`;
      ctx.lineWidth = 3.6;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      ctx.strokeStyle = `rgba(206,39,76,${0.65 * k})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();

      if (j < n * 0.45) {
        ctx.strokeStyle = `rgba(255,120,148,${0.85 * k})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }

    // Đầu mũi kim tuyến trắng hồng sáng rực
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(headX) - 1.5, Math.round(headY) - 1.5, 3, 3);
    glow(ctx, headX, headY, s.final ? 7 : 4.5, 'rgba(237,68,100,.45)');
  }

  // 3. Tia lửa & sương
  state.sparks.forEach((s) => {
    const v = 1 - s.age / s.life;
    const sx = s.x - wx0;
    const sy = s.y - wy0;
    ctx.strokeStyle = s.kind === 'pearl' ? `rgba(255,194,203,${v})` : `rgba(237,68,100,${v})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx - s.vx * 0.025, sy - s.vy * 0.025);
    ctx.lineTo(sx, sy);
    ctx.stroke();
    if (v > 0.4) {
      ctx.fillStyle = s.kind === 'pearl' ? '#fff2ec' : '#ff7894';
      ctx.fillRect(Math.round(sx), Math.round(sy), 2, 2);
    }
  });

  // 4. Vòng sóng va chạm (Impact Rings)
  state.impactRings.forEach((a) => {
    const fade = a.life / a.max;
    const ix = a.x - wx0;
    const iy = a.y - wy0;
    ctx.strokeStyle = a.final ? `rgba(255,120,148,${fade})` : `rgba(237,68,100,${fade * 0.8})`;
    ctx.lineWidth = a.final ? 2.8 : 1.8;
    ctx.beginPath();
    ctx.ellipse(ix, iy, a.r * 1.3, a.r * 0.65, 0, 0, TAU);
    ctx.stroke();
  });

  // 5. Vũng máu trên nền đất
  state.bloodPools.forEach((p) => {
    const a = Math.min(0.65, (p.life / p.max) * 0.65);
    const px = p.x - wx0;
    const py = p.y - wy0;
    ctx.fillStyle = `rgba(112,9,26,${a})`;
    ctx.beginPath();
    ctx.ellipse(px, py, p.r * 3.2, p.r * 0.8, 0, 0, TAU);
    ctx.fill();
  });

  // 6. Giọt máu rơi
  state.bloodDrops.forEach((d) => {
    const a = Math.min(1, d.life * 2);
    const dx = d.x - wx0;
    const dy = d.y - wy0;
    if (d.floor) {
      ctx.fillStyle = `rgba(148,19,52,${0.5 * a})`;
      ctx.fillRect(Math.round(dx) - 2, Math.round(dy), 4, 1.5);
    } else {
      ctx.fillStyle = `rgba(206,39,76,${0.85 * a})`;
      ctx.fillRect(Math.round(dx) - 1, Math.round(dy) - 2, 2, 4);
    }
  });

  // 7. Hiệu ứng HUYẾT ẤN 6.0 GIÂY trên mục tiêu
  if (state.bleedTimer > 0 && state.targetRef) {
    const target = state.targetRef;
    const visible = Math.min(1, state.bleedTimer * 1.5);
    const tm = state.elapsed * 0.8;
    const scx = target.x - wx0;
    const scy = target.y - 42 - wy0;
    const cr = 24 + Math.sin(tm * 2.4) * 2.2;

    // Pháp trận lục giác huyết ấn đập nhịp quanh thân địch
    glow(ctx, scx, scy, cr + 16, `rgba(237,68,100,${0.12 * visible})`);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `rgba(206,39,76,${0.45 * visible})`;
    ctx.beginPath();
    for (let j = 0; j < 6; j++) {
      const a = (j * TAU) / 6 + tm * 0.32;
      const ax = scx + Math.cos(a) * cr;
      const ay = scy + Math.sin(a) * cr * 1.15;
      if (j === 0) ctx.moveTo(ax, ay);
      else ctx.lineTo(ax, ay);
    }
    ctx.closePath();
    ctx.stroke();

    // Các sợi kim tuyến ghim xuyên thân địch
    for (const w of state.wounds) {
      const wx = scx + w.x;
      const wy = scy + w.y;
      const k = Math.min(1, w.life * 1.9);

      ctx.strokeStyle = `rgba(255,120,148,${0.85 * k})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(wx - 4, wy - 3);
      ctx.lineTo(wx + 4, wy + 3);
      ctx.stroke();

      ctx.fillStyle = '#ffc2cb';
      ctx.fillRect(Math.round(wx) - 1, Math.round(wy) - 1, 2, 2);
    }

    // Nhãn trạng thái nổi trên đầu mục tiêu: HUYẾT ẤN 6.0s
    const label = `HUYẾT ẤN ${state.bleedTimer.toFixed(1)}s`;
    ctx.font = 'bold 10px monospace, system-ui';
    const tw = ctx.measureText(label).width;
    const labelY = target.y - 165 - wy0;
    ctx.fillStyle = 'rgba(64,21,35,.88)';
    ctx.fillRect(scx - tw / 2 - 6, labelY - 12, tw + 12, 16);
    ctx.strokeStyle = '#c42b4d';
    ctx.lineWidth = 1;
    ctx.strokeRect(scx - tw / 2 - 6, labelY - 12, tw + 12, 16);
    ctx.fillStyle = '#ffd0da';
    ctx.textAlign = 'center';
    ctx.fillText(label, scx, labelY);
  }

  ctx.restore();
}
