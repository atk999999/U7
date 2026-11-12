// ============================================================================
// MODULE: THÔN LINH HUYẾT — ĐẠI CHIÊU 03 (Huyết Dự · PixelFX Offline)
// Nguồn: /Huyet_Du_Skill_03_Thon_Linh_Huyet_PixelFX_OFFLINE.html
// Cơ chế:
//  - Huyết Dự giơ tay khai thuật (0.65s). Vòng tròn đỏ xoáy và ma trận huyết văn
//    hình thành ngay tại bàn tay giơ lên.
//  - Khóa mục tiêu và liên tục rút ra hai luồng năng lượng trong 6.0s:
//      + Kim Tuyến xanh: rút linh lực (MP) đối thủ.
//      + Kim Tuyến đỏ: rút sinh mệnh (HP) đối thủ.
//  - Bản thân Huyết Dự hấp thu và hồi phục HP + Linh lực với hiệu suất 82%.
//  - Đích đến có hiệu ứng co giật, vòng chấn huyết khí, vệt máu rơi và điểm hút.
//  - Thời gian duy trì: 6.0 giây · Hồi chiêu: 14.0 giây.
// ============================================================================

import { camera, clamp, updateVitals, showNotice, game, settings, motion, player } from './state.js';
import { dummyDamage, setAnim } from './character.js';
import { actionAudio } from './audio.js';

export const THON_LINH_HUYET_SPEC = Object.freeze({
  slot: 3,
  code: 'Digit3',
  name: 'THÔN LINH HUYẾT',
  castSeconds: 0.65,
  activeDuration: 6.0,
  cooldownSeconds: 14.0,
  hpDrainRate: 25.0,  // HP rút mỗi giây từ mục tiêu
  mpDrainRate: 15.0,  // MP rút mỗi giây
  healRatio: 0.82,    // Tỷ lệ hồi cho bản thân
  range: 950,
});

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function createThonLinhHuyetState() {
  return {
    phase: 'ready', // 'ready' | 'cast' | 'drain' | 'cooldown'
    t: 0,
    cd: 0,
    totalDrainHp: 0,
    totalDrainMp: 0,
    spin: 0,
    impactGlow: 0,
    armLift: 0,
    drainPulseTimer: 0,
    particles: [],
    bloodDrops: [],
    rings: [],
  };
}

export function canCastThonLinhHuyet(state) {
  return state.phase === 'ready';
}

export function castThonLinhHuyet(state, caster, target) {
  if (state.phase !== 'ready') return false;
  state.phase = 'cast';
  state.t = 0;
  state.totalDrainHp = 0;
  state.totalDrainMp = 0;
  state.impactGlow = 0;
  state.armLift = 0;
  state.drainPulseTimer = 0;
  state.particles = [];
  state.bloodDrops = [];
  state.rings = [];
  actionAudio.bloodSiphonStart();
  return true;
}

export function stopThonLinhHuyet(state, caster = null) {
  if (state.phase === 'cast' || state.phase === 'drain') {
    actionAudio.stopBloodSiphonLoop();
    state.phase = 'cooldown';
    state.cd = THON_LINH_HUYET_SPEC.cooldownSeconds;
    state.t = 0;
    state.armLift = 0;
    if (caster === player && caster.anim === 'charge_hold') {
      setAnim('idle', true);
    }
  }
}

export function getThonLinhHandPos(caster) {
  const facing = caster?.facing ?? 1;
  const bob = motion?.bobOffset || 0;
  return {
    x: (caster?.x ?? 0) + facing * 40,
    y: (caster?.y ?? 0) + bob - 87,
  };
}

export function getThonLinhTargetPos(target) {
  if (!target) return { x: 0, y: 0 };
  const lift = target.lift || 0;
  return {
    x: target.x,
    y: target.y + lift - 70,
  };
}

function emitMist(state, x, y, colA = 'rgba(255,72,98,', scale = 1) {
  state.particles.push({
    type: 'mist',
    x,
    y,
    vx: rand(-18, 18) * scale,
    vy: rand(-16, 10) * scale,
    life: rand(0.25, 0.6),
    max: 0.6,
    size: rand(8, 20) * scale,
    col: colA,
  });
}

function emitSpark(state, x, y, col = 'red', scale = 1) {
  state.particles.push({
    type: 'spark',
    x,
    y,
    vx: rand(-60, 60) * scale,
    vy: rand(-60, 60) * scale,
    life: rand(0.18, 0.45),
    max: 0.45,
    size: rand(1.5, 3.5) * scale,
    col,
  });
}

function spawnBlood(state, x, y, scale = 1) {
  state.bloodDrops.push({
    x,
    y,
    vx: rand(-12, 12) * scale,
    vy: rand(12, 35) * scale,
    life: rand(0.5, 0.95),
    max: 0.95,
    size: rand(2.2, 5.0) * scale,
    splash: false,
  });
}

export function stepThonLinhHuyet(state, dt, caster, target) {
  dt = clamp(dt, 0, 0.05);
  state.spin += dt * 3.6;
  state.impactGlow = Math.max(0, state.impactGlow - dt);

  const hp = getThonLinhHandPos(caster);
  const tp = getThonLinhTargetPos(target);

  if (state.phase === 'cast') {
    state.t += dt;
    state.armLift = clamp(state.t / 0.55, 0, 1);
    for (let i = 0; i < 2; i++) {
      emitMist(state, hp.x + rand(-10, 10), hp.y + rand(-10, 10), 'rgba(255,84,112,', 0.8);
    }
    if (Math.random() < dt * 18) {
      emitSpark(state, hp.x + rand(-12, 12), hp.y + rand(-12, 12), 'red', 0.7);
    }
    if (state.t >= THON_LINH_HUYET_SPEC.castSeconds) {
      state.phase = 'drain';
      state.t = 0;
      state.drainPulseTimer = 0;
      state.armLift = 1;
      if (caster === player) setAnim('charge_hold', true);
      actionAudio.startBloodSiphonLoop();
    }
  } else if (state.phase === 'drain') {
    const drainDt = Math.min(dt, Math.max(0, THON_LINH_HUYET_SPEC.activeDuration - state.t));
    state.t += drainDt;
    state.armLift = 1;

    if (caster) {
      caster.vx = 0;
      if (caster === player && caster.anim !== 'charge_hold') {
        setAnim('charge_hold');
      }
      if (target && !target.broken && Math.abs(target.x - caster.x) > 4) {
        caster.facing = target.x >= caster.x ? 1 : -1;
      }
    }

    // Khoảng cách tới mục tiêu
    const dist = Math.hypot(tp.x - hp.x, tp.y - hp.y);
    const inRange = dist <= THON_LINH_HUYET_SPEC.range && target && !target.broken && target.hp > 0;

    if (inRange) {
      const dHp = Math.min(target.hp, THON_LINH_HUYET_SPEC.hpDrainRate * drainDt);
      const availableMana = Number.isFinite(target.mana) ? Math.max(0, target.mana) : 0;
      const dMp = Math.min(availableMana, THON_LINH_HUYET_SPEC.mpDrainRate * drainDt);
      if (Number.isFinite(target.mana)) target.mana = Math.max(0, target.mana - dMp);

      // Gây sát thương liên tục lên mục tiêu
      const dealt = (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts) ? damage : 0))(target, dHp, {
        isDot: true,
        sparkX: tp.x + rand(-12, 12),
        sparkY: tp.y + rand(-12, 12),
        palette: ['#580010', '#a0152b', '#ff3855', '#ff94a5'],
      });

      // Bản thân hồi phục HP và Linh lực
      if (caster) {
        caster.hp = Math.min(caster.maxHp, caster.hp + (Number(dealt) || 0) * THON_LINH_HUYET_SPEC.healRatio);
        caster.mana = Math.min(caster.maxMana, caster.mana + dMp * THON_LINH_HUYET_SPEC.healRatio);
        updateVitals();
      }

      state.totalDrainHp += dHp;
      state.totalDrainMp += dMp;
      state.impactGlow = 0.2;

      state.drainPulseTimer = (state.drainPulseTimer || 0) + dt;
      if (state.drainPulseTimer >= 0.42) {
        state.drainPulseTimer = 0;
        actionAudio.bloodSiphonDrain();
      }

      // Sinh hạt mist & sparks ở cả tay người phóng và cơ thể nạn nhân
      for (let i = 0; i < 2; i++) {
        emitMist(
          state,
          hp.x + rand(-10, 10),
          hp.y + rand(-10, 10),
          Math.random() < 0.5 ? 'rgba(255,82,110,' : 'rgba(88,208,255,',
          0.7
        );
      }
      for (let i = 0; i < 2; i++) {
        emitMist(
          state,
          tp.x + rand(-14, 14),
          tp.y + rand(-14, 14),
          Math.random() < 0.5 ? 'rgba(255,82,110,' : 'rgba(88,208,255,',
          0.75
        );
      }
      if (Math.random() < dt * 18) {
        spawnBlood(state, tp.x + rand(-12, 12), tp.y + rand(-10, 10), 0.95);
      }
      if (Math.random() < dt * 16) {
        emitSpark(state, tp.x + rand(-15, 15), tp.y + rand(-15, 15), 'blue', 0.8);
        emitSpark(state, tp.x + rand(-15, 15), tp.y + rand(-15, 15), 'red', 0.85);
      }
      if (Math.random() < dt * 8) {
        state.rings.push({
          x: tp.x,
          y: tp.y,
          r: 8,
          max: 28,
          life: 0.45,
          maxLife: 0.45,
          col: 'rgba(255,114,130,',
        });
      }
    }

    if (state.t >= THON_LINH_HUYET_SPEC.activeDuration - 1e-9 || (target && target.hp <= 0)) {
      actionAudio.stopBloodSiphonLoop();
      state.phase = 'cooldown';
      state.cd = THON_LINH_HUYET_SPEC.cooldownSeconds;
      state.t = 0;
      state.armLift = 0;
      if (caster && caster.anim === 'charge_hold') {
        if (caster === player) setAnim('idle', true);
      }
      showNotice('Thôn Linh Huyết kết thúc · Đang hồi chiêu 14s');
    }
  } else if (state.phase === 'cooldown') {
    state.cd = Math.max(0, state.cd - dt);
    if (state.cd <= 0) {
      state.phase = 'ready';
    }
  }

  // Cập nhật hạt
  state.particles = state.particles.filter((p) => (p.life -= dt) > 0);
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type === 'mist') {
      p.vx *= Math.pow(0.08, dt);
      p.vy -= 4 * dt;
    } else {
      p.vx *= Math.pow(0.18, dt);
      p.vy += 18 * dt;
    }
  }

  state.bloodDrops = state.bloodDrops.filter((b) => (b.life -= dt) > 0);
  for (const b of state.bloodDrops) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.vy += 60 * dt;
    if (!b.splash && b.y >= (target?.y ?? 600)) {
      b.splash = true;
      for (let i = 0; i < 3; i++) emitSpark(state, b.x, b.y, 'red', 0.4);
      b.vx *= 0.2;
      b.vy *= 0.15;
    }
  }

  state.rings = state.rings.filter((r) => (r.life -= dt) > 0);
  for (const r of state.rings) {
    r.r += 65 * dt;
  }
}

// ============================================================================
// VẼ HIỆU ỨNG THÔN LINH HUYẾT
// ============================================================================

function glowCircle(ctx, cx, cy, r, c1, c2 = 'rgba(255,255,255,0)') {
  if (r <= 0 || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return;
  const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, r);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
}

function drawHandCircle(ctx, hp, spin) {
  glowCircle(ctx, hp.x, hp.y, 34, 'rgba(255,68,104,0.35)');
  for (let j = 0; j < 3; j++) {
    ctx.strokeStyle = `rgba(255,${94 + j * 24},${114 + j * 18},${0.38 - j * 0.08})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.22; a += 0.22) {
      const rr = 16 + j * 8 + Math.sin(a * 5 + spin * (j ? -0.8 : 1)) * 2.2;
      const px = hp.x + Math.cos(a + spin * (j ? -0.7 : 1)) * rr;
      const py = hp.y + Math.sin(a + spin * (j ? -0.7 : 1)) * rr * 0.68;
      if (a === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(255,208,215,0.7)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(hp.x - 10, hp.y);
  ctx.lineTo(hp.x + 10, hp.y);
  ctx.moveTo(hp.x, hp.y - 8);
  ctx.lineTo(hp.x, hp.y + 8);
  ctx.stroke();
}

function drawSiphonLine(ctx, x0, y0, x1, y1, type, seed, spin) {
  const base =
    type === 'blue'
      ? ['rgba(22,120,190,0.40)', 'rgba(70,225,255,0.85)', 'rgba(226,251,255,0.95)']
      : ['rgba(80,0,15,0.40)', 'rgba(230,38,60,0.85)', 'rgba(255,210,215,0.95)'];
  const amp = type === 'blue' ? 14 : 16;
  const phaseOff = spin * 2.4 + seed * 1.35;

  // Lớp vẽ sợi ánh sáng uốn lượn
  for (let layer = 0; layer < 3; layer++) {
    ctx.strokeStyle = base[layer];
    ctx.lineWidth = layer === 0 ? 6.5 : layer === 1 ? 3.6 : 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const x = x0 + (x1 - x0) * t;
      const sway = Math.sin(t * 8 + phaseOff + layer * 0.4) * amp * (1 - t * 0.15);
      const y = y0 + (y1 - y0) * t + sway * ((1 - t) * 0.6 + 0.08);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Hạt năng lượng chạy dọc theo sợi (moving beads)
  for (let k = 0; k < 3; k++) {
    const tt = (spin * 0.35 + k * 0.25 + seed * 0.08) % 1;
    const x = x0 + (x1 - x0) * tt;
    const sway = Math.sin(tt * 8 + phaseOff) * amp * (1 - tt * 0.15);
    const y = y0 + (y1 - y0) * tt + sway * ((1 - tt) * 0.6 + 0.08);

    glowCircle(
      ctx,
      x,
      y,
      type === 'blue' ? 12 : 14,
      type === 'blue' ? 'rgba(110,240,255,0.35)' : 'rgba(255,82,110,0.35)'
    );
    ctx.fillStyle = type === 'blue' ? 'rgba(236,252,255,0.98)' : 'rgba(255,236,240,0.98)';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    ctx.fillStyle = type === 'blue' ? 'rgba(82,225,255,0.95)' : 'rgba(255,88,118,0.95)';
    ctx.fillRect(x - 3, y - 3, 6, 6);
  }
}

export function renderThonLinhHuyetWorld(state, caster, target) {
  if (
    state.phase === 'ready' &&
    state.particles.length === 0 &&
    state.bloodDrops.length === 0 &&
    state.rings.length === 0
  ) {
    return;
  }

  const ctx = game.ctx;
  if (!ctx || settings.fxQuality === 'off') return;

  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(-wx0, -wy0);

  const hp = getThonLinhHandPos(caster);
  const tp = getThonLinhTargetPos(target);

  // 1. Vòng xoáy đỏ tại bàn tay giơ lên
  if (state.phase === 'cast' || state.phase === 'drain') {
    drawHandCircle(ctx, hp, state.spin);
  }

  // 2. Kim Tuyến xanh & đỏ liên tục truyền dẫn
  if (state.phase === 'drain' && target && !target.broken && target.hp > 0) {
    const sourceBlue = [
      { x: tp.x - 10, y: tp.y - 18 },
      { x: tp.x + 12, y: tp.y - 6 },
      { x: tp.x - 4, y: tp.y + 10 },
    ];
    const sourceRed = [
      { x: tp.x - 18, y: tp.y - 12 },
      { x: tp.x + 16, y: tp.y - 14 },
      { x: tp.x + 2, y: tp.y + 16 },
    ];

    if (target.mana > 0) sourceBlue.forEach((p, i) => drawSiphonLine(ctx, p.x, p.y, hp.x, hp.y, 'blue', i, state.spin));
    sourceRed.forEach((p, i) => drawSiphonLine(ctx, p.x, p.y, hp.x, hp.y, 'red', i + 3, state.spin));

    // Hiệu ứng phát sáng & xung kích tại mục tiêu
    glowCircle(ctx, tp.x, tp.y, 38, 'rgba(255,80,100,0.22)');
    glowCircle(ctx, tp.x, tp.y, 30, 'rgba(90,220,255,0.20)');
    ctx.strokeStyle = `rgba(255,95,118,${0.3 + Math.sin(state.spin * 3) * 0.15})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 20 + Math.sin(state.spin * 3) * 3, 0, Math.PI * 2);
    ctx.stroke();

    // Nhãn trạng thái nổi trên đầu đối thủ khi bị thôn phệ
    const timeLeft = Math.max(0, THON_LINH_HUYET_SPEC.activeDuration - state.t);
    const label = `THÔN PHỆ ${timeLeft.toFixed(1)}s`;
    const lift = target.lift || 0;
    const labelY = target.y + lift - 165;
    ctx.font = 'bold 10px monospace, system-ui';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(40,10,22,.88)';
    ctx.fillRect(tp.x - tw / 2 - 6, labelY - 12, tw + 12, 16);
    ctx.strokeStyle = '#e62e4a';
    ctx.lineWidth = 1;
    ctx.strokeRect(tp.x - tw / 2 - 6, labelY - 12, tw + 12, 16);
    ctx.fillStyle = '#ffb3c1';
    ctx.textAlign = 'center';
    ctx.fillText(label, tp.x, labelY);
  }

  // 3. Các hạt khói sương & tia sáng
  for (const p of state.particles) {
    const a = Math.min(1, p.life / (p.max || 1));
    if (p.type === 'mist') {
      glowCircle(ctx, p.x, p.y, p.size, p.col + a * 0.5 + ')', 'rgba(255,0,0,0)');
    } else {
      ctx.fillStyle =
        p.col === 'blue'
          ? `rgba(105,230,255,${a})`
          : `rgba(255,84,114,${a})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  // 4. Giọt máu rơi
  for (const d of state.bloodDrops) {
    const a = Math.min(1, d.life / (d.max || 1));
    ctx.fillStyle = `rgba(180,18,40,${a})`;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y - d.size * 0.9);
    ctx.quadraticCurveTo(d.x + d.size * 0.8, d.y - d.size * 0.25, d.x, d.y + d.size);
    ctx.quadraticCurveTo(d.x - d.size * 0.8, d.y - d.size * 0.25, d.x, d.y - d.size * 0.9);
    ctx.fill();
  }

  // 5. Vòng sóng xung huyết sắc
  for (const r of state.rings) {
    const a = Math.min(1, r.life / r.maxLife);
    ctx.strokeStyle = r.col + a + ')';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.r * 1.25, r.r * 0.65, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
