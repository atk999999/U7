// ============================================================================
// MODULE: HUYẾT BẠO · TỰ HỦY — CẤM THUẬT 04 (Huyết Dự · PixelFX Offline)
// Nguồn: /Huyet_Du_Skill_04_Huyet_Bao_Tu_Huy_Cataclysm_PixelFX_OFFLINE.html
// Cơ chế:
//  - Cấm thuật chỉ có thể kích hoạt khi HP của Huyết Dự còn ≤ 10% và CHỈ 1 LẦN.
//  - Tiến trình các giai đoạn:
//      + seal (1.05s): Kết ấn, ma trận huyết ấn dưới chân xoay tròn.
//      + gather (2.95s): Huyết cầu nén xoáy, hút vạn huyết khí từ 4 phương về thân.
//      + pinch (0.88s): Nén cực hạn, khoảng lặng trước khi bùng nổ, lõi sáng trắng.
//      + blast (3.35s): Huyết Nhật bùng nổ nuốt trọn toàn map, sóng xung kích,
//                      240+ mảnh vỡ, khói lửa, rung chấn dữ dội;
//                      Giữ lại 1% HP; sát thương bằng HP đã mất lúc kích hoạt.
//      + after (2.45s): Dư chấn và khói bụi trên chiến trường.
//      + done: Kết thúc, vĩnh viễn khóa đến khi chơi lại.
// ============================================================================

import { camera, game, WORLD_W, WORLD_H, clamp, addCameraShake, updateVitals, showNotice } from './state.js';
import { dummyDamage } from './character.js';
import { actionAudio } from './audio.js';

export const HUYET_BAO_SPEC = Object.freeze({
  slot: 4,
  code: 'Digit4',
  name: 'HUYẾT BẠO',
  sub: 'HP ≤ 10% · GIỮ 1%',
  castDuration: 1.05,
  gatherDuration: 2.95,
  pinchDuration: 0.88,
  blastDuration: 3.35,
  afterDuration: 2.45,
  maxRadius: Math.hypot(WORLD_W, WORLD_H), // Bao phủ cả góc xa nhất của bản đồ.
});

const TAU = Math.PI * 2;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

function smooth(t) {
  t = clamp(t, 0, 1);
  return t * t * (3 - 2 * t);
}

export function createHuyetBaoState() {
  return {
    phase: 'idle', // 'idle' | 'seal' | 'gather' | 'pinch' | 'blast' | 'after' | 'done'
    clock: 0,
    total: 0,
    usedOnce: false,
    radius: 0,
    shake: 0,
    flash: 0,
    compression: 0,
    pressure: 0,
    ashen: false,
    motes: [],
    debris: [],
    smoke: [],
    cracks: [],
    spawn: 0,
    smokeSpawn: 0,
    targetHit: false,
    damage: 0,
    sourceX: 0,
    sourceY: 0,
  };
}

export function canCastHuyetBao(state, caster) {
  if (state.usedOnce) return false;
  if (!['idle', 'done'].includes(state.phase)) return false;
  if (!caster || caster.hp <= 0) return false;
  // Điều kiện bắt buộc: HP phải còn ≤ 10%
  const hpRatio = caster.hp / (caster.maxHp || 500);
  return hpRatio <= 0.1 + 1e-9;
}

export function castHuyetBao(state, caster) {
  if (!canCastHuyetBao(state, caster)) {
    const hpRatio = (caster.hp / (caster.maxHp || 500)) * 100;
    if (state.usedOnce) {
      showNotice('Huyết Bạo là cấm thuật tự hủy, chỉ được thi triển 1 lần duy nhất!');
    } else {
      showNotice(`Chưa đủ điều kiện! HP hiện tại ${hpRatio.toFixed(0)}% (Cần HP ≤ 10% để kích hoạt)!`);
    }
    return false;
  }

  state.usedOnce = true;
  state.phase = 'seal';
  state.clock = 0;
  state.total = 0;
  state.radius = 0;
  state.shake = 0.5;
  state.flash = 0.3;
  state.ashen = false;
  state.targetHit = false;
  // Chốt lượng máu đã mất ngay khi kích hoạt; không đổi nếu HP thay đổi trong lúc tụ.
  state.damage = Math.max(0, (caster.maxHp || 500) - caster.hp);
  state.motes = [];
  state.debris = [];
  state.smoke = [];
  state.cracks = [];
  state.sourceX = caster.x;
  state.sourceY = caster.y - 65;

  actionAudio.bloodCataclysmSeal();
  showNotice('CẤM THUẬT HUYẾT BẠO KHỞI ĐỘNG! Toàn bộ huyết mệnh bốc cháy...');
  return true;
}

function addMote(state, sx, sy) {
  if (state.motes.length >= 260) return;
  const a = rand(0, TAU);
  const r = rand(90, 360);
  const life = rand(0.9, 2.2);
  state.motes.push({
    a,
    r,
    x: sx + Math.cos(a) * r,
    y: sy + Math.sin(a) * r * 0.72,
    oldX: sx,
    oldY: sy,
    speed: rand(90, 240),
    life,
    max: life,
    wob: rand(0, TAU),
    c: Math.random() < 0.3 ? '#ffb3c1' : Math.random() < 0.6 ? '#ff4d6d' : '#800f2f',
    s: rand(1.2, 3.2),
  });
}

function addSmoke(state, x, y, vx = 0, vy = 0, size = rand(5, 16), life = rand(0.8, 1.8), c = '#2b0914') {
  if (state.smoke.length >= 120) return;
  state.smoke.push({ x, y, vx, vy, size, life, max: life, c });
}

export function stepHuyetBao(state, dt, caster, target) {
  dt = clamp(dt, 0, 0.05);
  state.clock += dt;
  state.total += dt;
  state.shake = Math.max(0, state.shake - dt * 1.5);
  state.flash = Math.max(0, state.flash - dt * 2.2);

  const sx = state.sourceX || caster.x;
  const sy = state.sourceY || (caster.y - 65);

  if (state.phase === 'seal') {
    state.sourceX = caster.x;
    state.sourceY = caster.y - 65;
    if (Math.random() < dt * 45) addMote(state, sx, sy);
    if (state.clock >= HUYET_BAO_SPEC.castDuration) {
      state.phase = 'gather';
      state.clock = 0;
      actionAudio.bloodCataclysmGather();
      showNotice('Vạn huyết quy nguyên · Huyết khí bốc cháy mãnh liệt!');
    }
  } else if (state.phase === 'gather') {
    state.sourceX = caster.x;
    state.sourceY = caster.y - 65;
    state.compression = smooth(state.clock / HUYET_BAO_SPEC.gatherDuration);
    state.spawn += dt * (80 + state.compression * 180);
    while (state.spawn >= 1) {
      addMote(state, sx, sy);
      state.spawn--;
    }
    if (state.clock >= HUYET_BAO_SPEC.gatherDuration) {
      state.phase = 'pinch';
      state.clock = 0;
      state.pressure = 0;
      state.shake = 0.8;
      addCameraShake(1.2, 0.8);
      actionAudio.bloodCataclysmPinch();
      showNotice('Huyết mệnh áp súc cực hạn! Không gian tĩnh lặng trước hủy diệt...');
    }
  } else if (state.phase === 'pinch') {
    state.pressure = smooth(state.clock / HUYET_BAO_SPEC.pinchDuration);
    state.shake = 0.4 + 0.6 * state.pressure;
    if (state.clock >= HUYET_BAO_SPEC.pinchDuration) {
      // BẮT ĐẦU VỤ NỔ HUYẾT NHẬT (BLAST)
      state.phase = 'blast';
      state.clock = 0;
      state.radius = 0;
      state.shake = 6.0;
      state.flash = 1.0;
      addCameraShake(6.5, 1.8);
      actionAudio.bloodCataclysmBlast();

      // Giữ lại 1% máu tối đa theo cơ chế Huyết Bạo đã chọn.
      caster.hp = (caster.maxHp || 500) * 0.01;
      updateVitals();
      state.ashen = false;

      // Sinh 240+ mảnh vỡ bạo liệt phóng ra 360 độ
      for (let i = 0; i < 240; i++) {
        const a = rand(0, TAU);
        const v = rand(100, 750);
        state.debris.push({
          x: sx + rand(-10, 10),
          y: sy + rand(-10, 10),
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v * 0.85,
          life: rand(0.8, 2.8),
          max: 2.8,
          c: Math.random() < 0.25 ? '#fff5f5' : Math.random() < 0.5 ? '#ff758f' : '#c9184a',
          s: rand(2.0, 5.5),
          bright: Math.random() < 0.7,
        });
      }

      // 28 vết nứt mặt đất
      for (let i = 0; i < 28; i++) {
        state.cracks.push({
          a: (i * TAU) / 28 + rand(-0.15, 0.15),
          length: rand(180, 560),
          offset: rand(-12, 12),
        });
      }

      showNotice('HUYẾT BẠO! MẶT TRỜI HUYẾT SẮC NUỐT TRỌN CHIẾN TRƯỜNG!');
    }
  } else if (state.phase === 'blast') {
    state.radius = HUYET_BAO_SPEC.maxRadius * Math.pow(smooth(state.clock / HUYET_BAO_SPEC.blastDuration), 0.75);

    // Kiểm tra sát thương toàn bộ mục tiêu trong bán kính
    if (!state.targetHit && target && !target.broken) {
      const d = Math.hypot(target.x - sx, target.y - 70 - sy);
      if (state.radius >= d) {
        state.targetHit = true;
        (state.damageTarget || ((victim, damage, opts) => dummyDamage(damage, opts)))(target, state.damage, {
          sparkX: target.x,
          sparkY: target.y - 70,
          palette: ['#590d22', '#a4133c', '#ff4d6d', '#ffb3c1', '#ffffff'],
        });
        target.recoil = 1.0;
        target.shake = 1.0;
        addCameraShake(3.5, 0.5);
      }
    }

    if (state.clock < 1.2) {
      state.shake = Math.max(state.shake, 4.0 * (1 - state.clock / 1.2));
    }

    state.smokeSpawn += dt * (70 - 30 * clamp(state.clock / HUYET_BAO_SPEC.blastDuration, 0, 1));
    while (state.smokeSpawn >= 1) {
      state.smokeSpawn--;
      const a = rand(0, TAU);
      const r = Math.max(8, state.radius * 0.95 + rand(-20, 20));
      addSmoke(
        state,
        sx + Math.cos(a) * r,
        sy + Math.sin(a) * r * 0.76,
        Math.cos(a) * rand(20, 80),
        Math.sin(a) * rand(10, 60),
        rand(8, 22),
        rand(0.6, 1.6),
        Math.random() < 0.6 ? '#200810' : '#590d22'
      );
    }

    if (state.clock >= HUYET_BAO_SPEC.blastDuration) {
      state.radius = HUYET_BAO_SPEC.maxRadius;
      state.phase = 'after';
      state.clock = 0;
      showNotice('Huyết Nhật tiêu tán · Huyết Dự còn 1% sinh mệnh.');
    }
  } else if (state.phase === 'after') {
    if (Math.random() < dt * 25) {
      addSmoke(state, sx + rand(-40, 40), caster.y, rand(-12, 12), rand(-35, -12), rand(8, 20), rand(0.9, 1.8), '#1a050d');
    }
    if (state.clock >= HUYET_BAO_SPEC.afterDuration) {
      state.phase = 'done';
      showNotice('HUYẾT BẠO HOÀN TẤT. Huyết Dự giữ lại 1% HP.');
    }
  }

  // Cập nhật motes hội tụ
  if (state.phase === 'seal' || state.phase === 'gather' || state.phase === 'pinch') {
    for (const m of state.motes) {
      m.oldX = m.x;
      m.oldY = m.y;
      const speed = m.speed * (1 + state.compression * 0.85);
      m.r = Math.max(1, m.r - speed * dt);
      m.a += dt * (0.6 + state.compression * 1.2);
      const wob = Math.sin(m.wob + state.total * 8) * Math.min(8, m.r * 0.1);
      m.x = sx + Math.cos(m.a) * m.r + wob;
      m.y = sy + Math.sin(m.a) * m.r * 0.70 - wob * 0.5;
      m.life -= dt * 0.45;
      if (m.r < 8) m.life = -1;
    }
    state.motes = state.motes.filter((m) => m.life > 0);
  } else {
    state.motes.length = 0;
  }

  // Cập nhật mảnh vỡ nổ
  for (const d of state.debris) {
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.vx *= Math.pow(0.72, dt);
    d.vy += (d.bright ? 30 : 60) * dt;
    d.life -= dt;
  }
  state.debris = state.debris.filter((d) => d.life > 0);

  // Cập nhật khói
  for (const s of state.smoke) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vx *= Math.pow(0.35, dt);
    s.vy -= dt * 6;
    s.life -= dt;
    s.size += dt * 6;
  }
  state.smoke = state.smoke.filter((s) => s.life > 0);
}

// ============================================================================
// VẼ HIỆU ỨNG HUYẾT BẠO
// ============================================================================

export function renderHuyetBaoWorld(state, caster) {
  if (state.phase === 'idle' && state.debris.length === 0 && state.smoke.length === 0) {
    return;
  }

  const ctx = game.ctx;
  if (!ctx) return;

  const sx = state.sourceX || caster.x;
  const sy = state.sourceY || (caster.y - 65);

  ctx.save();
  // Engine đã áp dụng zoom; chuyển từ tọa độ thế giới sang tọa độ khung nhìn.
  ctx.translate(game.viewW / 2 - camera.x, game.viewH / 2 - camera.y);

  // 1. Pháp trận huyết ấn dưới chân (Floor seal)
  if (['seal', 'gather', 'pinch'].includes(state.phase)) {
    const v = state.phase === 'seal' ? smooth(state.clock / HUYET_BAO_SPEC.castDuration) : 1;
    for (let j = 0; j < 3; j++) {
      ctx.strokeStyle = j === 1 ? 'rgba(255,100,130,0.7)' : 'rgba(160,20,40,0.5)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      const r = 40 + j * 24;
      ctx.ellipse(sx, caster.y, r, r * 0.28, 0, 0, TAU);
      ctx.stroke();
    }
  }

  // 2. Vòng xoáy huyết sắc hội tụ (Inward vortex aura)
  if (['seal', 'gather', 'pinch'].includes(state.phase)) {
    const q = state.phase === 'seal' ? smooth(state.clock / HUYET_BAO_SPEC.castDuration) : state.phase === 'gather' ? smooth(state.clock / HUYET_BAO_SPEC.gatherDuration) : 1;
    const shrink = state.phase === 'pinch' ? 1 - 0.92 * smooth(state.clock / HUYET_BAO_SPEC.pinchDuration) : 1;
    const rad = (15 + q * 90) * shrink;

    // Hào quang tỏa ra quanh tâm
    const aura = ctx.createRadialGradient(sx, sy, 5, sx, sy, rad * 1.5 + 20);
    aura.addColorStop(0, 'rgba(255,230,230,0.85)');
    aura.addColorStop(0.3, 'rgba(255,50,90,0.75)');
    aura.addColorStop(0.7, 'rgba(130,10,35,0.4)');
    aura.addColorStop(1, 'rgba(20,0,5,0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(sx, sy, rad * 1.5 + 20, 0, TAU);
    ctx.fill();

    // Các dải roi năng lượng xoắn vào trong
    for (let arm = 0; arm < 12; arm++) {
      const base = (arm * TAU) / 12 + state.total * (1.2 + q * 1.5);
      const rMax = rad + 50;
      ctx.strokeStyle = arm % 3 === 0 ? 'rgba(255,180,200,0.85)' : 'rgba(240,40,75,0.7)';
      ctx.lineWidth = arm % 2 === 0 ? 3 : 1.8;
      ctx.beginPath();
      for (let j = 0; j <= 20; j++) {
        const u = j / 20;
        const a = base + u * (3.5 + q * 2.0);
        const r = rMax * (1 - u * 0.94);
        const xx = sx + Math.cos(a) * r;
        const yy = sy + Math.sin(a) * r * 0.78;
        if (j === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }

    // Nếu ở pha pinch: điểm sáng trắng nén cực đại
    if (state.phase === 'pinch') {
      const c = smooth(state.clock / HUYET_BAO_SPEC.pinchDuration);
      const whiteGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, 25 * (1 - c * 0.7));
      whiteGrad.addColorStop(0, 'rgba(255,255,255,1.0)');
      whiteGrad.addColorStop(0.5, 'rgba(255,200,210,0.8)');
      whiteGrad.addColorStop(1, 'rgba(255,50,80,0)');
      ctx.fillStyle = whiteGrad;
      ctx.beginPath();
      ctx.arc(sx, sy, 25 * (1 - c * 0.7), 0, TAU);
      ctx.fill();
    }
  }

  // 3. Các hạt motes bay hội tụ
  for (const m of state.motes) {
    const a = clamp(m.life / m.max, 0, 1);
    ctx.strokeStyle = m.c;
    ctx.lineWidth = m.s;
    ctx.beginPath();
    ctx.moveTo(m.oldX, m.oldY);
    ctx.lineTo(m.x, m.y);
    ctx.stroke();
  }

  // 4. HUYẾT NHẬT BÙNG NỔ (BLAST DOME)
  if (state.phase === 'blast' && state.radius > 5) {
    const r = state.radius;
    const q = clamp(state.clock / HUYET_BAO_SPEC.blastDuration, 0, 1);
    const f = 1 - q;

    // Vành hào quang khổng lồ (Halo)
    const haloR = r + 80;
    const halo = ctx.createRadialGradient(sx, sy, Math.max(0, r - 40), sx, sy, haloR);
    halo.addColorStop(0, 'rgba(255,180,170,0.45)');
    halo.addColorStop(0.5, 'rgba(247,57,96,0.60)');
    halo.addColorStop(0.85, 'rgba(160,10,50,0.35)');
    halo.addColorStop(1, 'rgba(50,0,15,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sx, sy, haloR, 0, TAU);
    ctx.fill();

    // Khối Huyết Nhật đặc ruột rực sáng
    const inner = ctx.createRadialGradient(sx - 10, sy - 12, Math.min(15, r * 0.1), sx, sy, r);
    inner.addColorStop(0, 'rgba(255,255,245,0.99)');
    inner.addColorStop(0.25, `rgba(255,235,215,${0.98 - 0.1 * q})`);
    inner.addColorStop(0.5, `rgba(255,170,160,${0.98 - 0.1 * q})`);
    inner.addColorStop(0.72, `rgba(249,90,110,${0.96 - 0.1 * q})`);
    inner.addColorStop(0.88, 'rgba(224,45,80,0.96)');
    inner.addColorStop(0.96, 'rgba(150,10,48,0.98)');
    inner.addColorStop(1, 'rgba(75,4,28,0.98)');
    ctx.fillStyle = inner;

    ctx.beginPath();
    const N = 80;
    for (let i = 0; i <= N; i++) {
      const a = (i * TAU) / N;
      const jig = 6.0 * Math.sin(i * 3.7 + state.clock * 11) + 4.5 * Math.sin(i * 7.2 - state.clock * 14);
      const rj = Math.max(1, r + jig);
      const xx = sx + Math.cos(a) * rj;
      const yy = sy + Math.sin(a) * rj;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.closePath();
    ctx.fill();

    // Vòng sóng áp lực đẩy ra xa
    for (let j = 0; j < 3; j++) {
      const rr = r - (j + 1) * (20 + 25 * q);
      if (rr > 10) {
        ctx.strokeStyle = j === 0 ? 'rgba(255,200,215,0.85)' : 'rgba(255,50,85,0.6)';
        ctx.lineWidth = 4 - j;
        ctx.beginPath();
        ctx.arc(sx, sy, rr, 0, TAU);
        ctx.stroke();
      }
    }
  }

  // 5. Vết nứt đất (Ground fractures)
  if (state.phase === 'blast' || state.phase === 'after') {
    for (const c of state.cracks) {
      const l = Math.min(c.length, state.radius * 1.05);
      ctx.strokeStyle = 'rgba(255,60,90,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx, caster.y);
      const ex = sx + Math.cos(c.a) * l;
      const ey = caster.y + Math.sin(c.a) * l * 0.3;
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }
  }

  // 6. Mảnh vỡ nổ & tia lửa
  for (const d of state.debris) {
    const a = clamp(d.life / d.max, 0, 1);
    ctx.fillStyle = d.c;
    ctx.fillRect(d.x - d.s / 2, d.y - d.s / 2, d.s, d.s);
  }

  // 7. Khói tro tàn
  for (const s of state.smoke) {
    const a = clamp(s.life / s.max, 0, 1);
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.size, 0, TAU);
    ctx.fill();
  }

  // 8. Đống tro tàn của Huyết Dự (Ashes)
  if (state.ashen && (state.phase === 'after' || state.phase === 'done' || (state.phase === 'blast' && state.clock > 0.4))) {
    ctx.fillStyle = 'rgba(50,20,30,0.75)';
    ctx.beginPath();
    ctx.ellipse(sx, caster.y - 4, 32, 10, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,80,100,0.6)';
    for (let i = 0; i < 20; i++) {
      const offX = Math.sin(i * 47) * 25;
      const offY = Math.cos(i * 31) * 7;
      ctx.fillRect(sx + offX, caster.y - 6 + offY, 3, 3);
    }
  }

  ctx.restore();

  // Flash màn hình toàn cảnh khi bạo phát
  if (state.flash > 0) {
    ctx.save();
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    ctx.fillStyle = `rgba(255,230,230,${Math.min(0.65, state.flash * 0.6)})`;
    ctx.fillRect(0, 0, game.viewW, game.viewH);
    ctx.restore();
  }
}
