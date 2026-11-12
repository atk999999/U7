// ============================================================================
// MODULE: AUDIO (Âm thanh bước chân, tiếp đất & Âm thanh 3 Kỹ năng đa tầng bằng Code)
// Phương án 1:
//  - Kỹ năng 1 (Hỏa Cầu): Khởi tụ lửa, vòng lặp hỏa khí mạnh dần (0–14s), phóng cầu, nổ & cháy 10s
//  - Kỹ năng 2 (Lôi Bạo): Khởi tụ điện, vòng lặp lôi khí, nạp vòng mới mỗi giây, thiên lôi giáng
//  - Kỹ năng 3 (Thổ Thuẫn): Kết thuẫn, thu hồi cát đá, đỡ đòn theo sát thương & nổ vỡ thuẫn
// ============================================================================

import { settings, game, clamp } from './state.js';

function createPRNG(seedInit) {
  let seed = seedInit >>> 0 || 1;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function normalizePCM(pcm, targetPeak = 0.82, fadeOutSec = 0.014, sampleRate = 32000) {
  let peak = 0;
  const fadeSamples = Math.max(1, Math.floor(fadeOutSec * sampleRate));
  const attackSamples = Math.max(1, Math.floor(0.0015 * sampleRate));
  for (let i = 0; i < pcm.length; i++) {
    let env = 1;
    if (i < attackSamples) env *= i / attackSamples;
    if (i > pcm.length - fadeSamples) {
      const u = (pcm.length - i) / fadeSamples;
      env *= u * u;
    }
    pcm[i] *= env;
    peak = Math.max(peak, Math.abs(pcm[i]));
  }
  const gain = targetPeak / Math.max(0.001, peak);
  for (let i = 0; i < pcm.length; i++) pcm[i] *= gain;
  pcm[0] = pcm[pcm.length - 1] = 0;
  return pcm;
}

function makeFoleyPCM(kind, material, variant, sampleRate = 32000) {
  const landing = kind === 'land';
  const m = Math.max(1, Math.min(4, material | 0));
  const profile = [
    { body: 115, cut: 3300, grit: 0.76, tail: 0.060, grains: 27 }, // Đất mặt / cỏ và cát sỏi
    { body: 132, cut: 2600, grit: 0.56, tail: 0.045, grains: 17 }, // Đất sét trầm tích
    { body: 185, cut: 6800, grit: 0.48, tail: 0.032, grains: 12 }, // Đá
    { body: 154, cut: 4900, grit: 0.40, tail: 0.040, grains: 15 }, // Đá sâu
  ][m - 1];

  const random = createPRNG(0x39e8a27 + variant * 6143 + m * 3761 + (landing ? 9857 : 0));

  const duration = landing ? 0.43 : 0.21;
  const pcm = new Float32Array(Math.ceil(duration * sampleRate));
  const grit = new Float32Array(pcm.length);
  const scale = 0.94 + random() * 0.12;
  const roll = (landing ? 0.020 : 0.030) + random() * 0.012;

  for (let g = 0; g < profile.grains * (landing ? 2 : 1); g++) {
    const at = Math.floor(
      (0.007 + Math.pow(random(), 1.7) * (landing ? 0.25 : 0.145)) * sampleRate
    );
    const len = Math.floor(sampleRate * (0.0006 + random() * 0.0024));
    const amp =
      (0.05 + random() * 0.15) * Math.exp(-at / sampleRate / (landing ? 0.11 : 0.065));
    for (let j = 0; j < len && at + j < grit.length; j++) {
      grit[at + j] += (random() * 2 - 1) * Math.sin((Math.PI * j) / len) * amp;
    }
  }

  const coefficient = (f) => 1 - Math.exp((-2 * Math.PI * f) / sampleRate);
  const aBody = coefficient(420);
  const aLow = coefficient(220);
  const aHigh = coefficient(profile.cut);
  const dc = Math.exp((-2 * Math.PI * 30) / sampleRate);

  let bodyNoise = 0;
  let lo = 0;
  let hi = 0;
  let previous = 0;
  let filtered = 0;
  let phase = 0;

  for (let i = 0; i < pcm.length; i++) {
    const t = i / sampleRate;
    const noise = random() * 2 - 1;
    bodyNoise += aBody * (noise - bodyNoise);
    lo += aLow * (noise - lo);
    hi += aHigh * (noise - hi);

    const heel = (1 - Math.exp(-t / 0.0016)) * Math.exp(-t / (landing ? 0.058 : 0.027));
    const rt = Math.max(0, t - roll);
    const toe =
      t > roll ? (1 - Math.exp(-rt / 0.004)) * Math.exp(-rt / (landing ? 0.085 : 0.035)) : 0;
    const scrape =
      (1 - Math.exp(-t / 0.003)) * Math.exp(-t / (profile.tail * (landing ? 1.9 : 1)));

    phase +=
      (2 *
        Math.PI *
        (profile.body * scale * (landing ? 0.65 : 1)) *
        (0.74 + 0.26 * Math.exp(-t * 48))) /
      sampleRate;
    const resonance = Math.sin(phase) * Math.exp(-t / (landing ? 0.033 : 0.016));

    let value =
      bodyNoise * (heel * (landing ? 2.9 : 2.0) + toe * 0.95) +
      (hi - lo) * profile.grit * (scrape * 0.40 + toe * 0.34) +
      resonance * (landing ? 0.22 : 0.16) +
      grit[i] * (landing ? 1.15 : 0.85);

    if (m >= 3) value += noise * 0.11 * Math.exp(-t / 0.0035) * (1 - Math.exp(-t / 0.0007));

    filtered = dc * (filtered + value - previous);
    previous = value;
    pcm[i] = filtered;
  }

  return normalizePCM(pcm, landing ? 0.82 : 0.72, 0.016, sampleRate);
}

// ----------------------------------------------------------------------------
// Tổng hợp PCM cho 3 Kỹ năng (Hỏa Cầu, Lôi Bạo, Thổ Thuẫn)
// ----------------------------------------------------------------------------

function makeSkillPCM(kind, variant = 0, sampleRate = 32000) {
  const random = createPRNG(0x7a41c93 + variant * 8191 + kind.length * 131071);
  const coeff = (f) => 1 - Math.exp((-2 * Math.PI * f) / sampleRate);

  // 1. HỎA CẦU — Khởi tụ lửa bùng lên
  if (kind === 'fire_ignite') {
    const duration = 0.34;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let bp = 0;
    let phase = 0;
    const aLp = coeff(480);
    const aBp = coeff(1650);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.12);
      const freq = 115 + 160 * Math.exp(-t * 14);
      phase += (2 * Math.PI * freq) / sampleRate;
      const crackle = random() > 0.985 ? (random() * 2 - 1) * 0.45 * Math.exp(-t / 0.22) : 0;
      pcm[i] = (lp * 1.65 + (bp - lp) * 0.55 + Math.sin(phase) * 0.32) * env + crackle;
    }
    return normalizePCM(pcm, 0.76, 0.025, sampleRate);
  }

  // 2. HỎA CẦU — Vòng lặp hỏa khí cuộn khi giữ tụ lực (khớp nối đầu-cuối mượt)
  if (kind === 'fire_loop') {
    const duration = 1.2;
    const len = Math.ceil(duration * sampleRate);
    const raw = new Float32Array(len);
    let lp1 = 0;
    let lp2 = 0;
    let hi = 0;
    const a1 = coeff(210);
    const a2 = coeff(620);
    const aHi = coeff(2800);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp1 += a1 * (n - lp1);
      lp2 += a2 * (n - lp2);
      hi += aHi * (n - hi);
      const pulse = 0.72 + 0.28 * Math.sin(2 * Math.PI * 5.0 * (t / duration));
      const sub = Math.sin(2 * Math.PI * 75 * t + Math.sin(2 * Math.PI * 2.5 * t) * 1.4) * 0.28;
      const spark = random() > 0.992 ? (random() * 2 - 1) * 0.28 : 0;
      raw[i] = (lp1 * 1.4 + (lp2 - lp1) * 0.85) * pulse + sub + (hi - lp2) * 0.14 + spark;
    }
    // Crossfade đầu-cuối để lặp vô hạn không bị tiếng click
    const fadeLen = Math.floor(0.08 * sampleRate);
    const pcm = new Float32Array(len - fadeLen);
    for (let i = 0; i < pcm.length; i++) {
      if (i < fadeLen) {
        const u = i / fadeLen;
        pcm[i] = raw[i] * u + raw[pcm.length + i] * (1 - u);
      } else {
        pcm[i] = raw[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = 0.68 / Math.max(0.001, peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  }

  // 3. HỎA CẦU — Đẩy chưởng phóng cầu lửa
  if (kind === 'fire_launch') {
    const duration = 0.42;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let mid = 0;
    let phase = 0;
    const aLp = coeff(380);
    const aMid = coeff(1450);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      mid += aMid * (n - mid);
      const whooshEnv = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.13);
      const freq = 240 * Math.exp(-t * 6.5) + 58;
      phase += (2 * Math.PI * freq) / sampleRate;
      const jet = Math.sin(phase) * Math.exp(-t / 0.095) * 0.55;
      pcm[i] = (lp * 1.4 + (mid - lp) * 0.95) * whooshEnv + jet;
    }
    return normalizePCM(pcm, 0.86, 0.025, sampleRate);
  }

  // 4. HỎA CẦU — Nổ va chạm (sub-bass chấn động + lửa tạt + tàn lửa)
  if (kind === 'fire_explode') {
    const duration = 0.72;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let body = 0;
    let hiss = 0;
    let phase = 0;
    const aSub = coeff(135);
    const aBody = coeff(580);
    const aHiss = coeff(2900);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      body += aBody * (n - body);
      hiss += aHiss * (n - hiss);

      const impactEnv = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.21);
      const tailEnv = (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.32);
      const boomFreq = 46 + 115 * Math.exp(-t * 24);
      phase += (2 * Math.PI * boomFreq) / sampleRate;
      const boom = Math.sin(phase) * Math.exp(-t / 0.14) * 0.95;
      const crackle =
        t > 0.04 && random() > 0.978
          ? (random() * 2 - 1) * 0.42 * Math.exp(-t / 0.36)
          : 0;

      pcm[i] =
        boom +
        sub * 1.85 * impactEnv +
        (body - sub) * 1.15 * tailEnv +
        (hiss - body) * 0.38 * tailEnv +
        crackle;
    }
    return normalizePCM(pcm, 0.94, 0.035, sampleRate);
  }

  // 5. HỎA CẦU — Tiếng lửa thiêu đốt mỗi nhịp rút máu
  if (kind === 'fire_sizzle') {
    const duration = 0.17;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let hp = 0;
    const aLp = coeff(900);
    const aHp = coeff(3800);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      hp += aHp * (n - hp);
      const env = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.055);
      const snap = random() > 0.965 ? (random() * 2 - 1) * 0.5 : 0;
      pcm[i] = ((hp - lp) * 1.2 + lp * 0.45 + snap) * env;
    }
    return normalizePCM(pcm, 0.52, 0.015, sampleRate);
  }

  // 6. LÔI BẠO — Khởi tụ lôi hoàn
  if (kind === 'lightning_start') {
    const duration = 0.30;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let phase1 = 0;
    let phase2 = 0;
    const aBp = coeff(3400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.11);
      const f1 = 220 + 480 * Math.exp(-t * 18);
      const f2 = 660 + 920 * (t / duration);
      phase1 += (2 * Math.PI * f1) / sampleRate;
      phase2 += (2 * Math.PI * f2) / sampleRate;
      const arc = random() > 0.94 ? (random() * 2 - 1) * 0.65 : 0;
      pcm[i] =
        (Math.sin(phase1) * 0.45 +
          Math.sign(Math.sin(phase2)) * 0.18 +
          (n - bp) * 0.55 +
          arc * 0.4) *
        env;
    }
    return normalizePCM(pcm, 0.78, 0.02, sampleRate);
  }

  // 7. LÔI BẠO — Vòng lặp lôi khí cao tần khi giữ tụ lực
  if (kind === 'lightning_loop') {
    const duration = 1.0;
    const len = Math.ceil(duration * sampleRate);
    const raw = new Float32Array(len);
    let lp = 0;
    let hi = 0;
    const aLp = coeff(420);
    const aHi = coeff(4200);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      hi += aHi * (n - hi);
      const hum =
        Math.sin(2 * Math.PI * 110 * t) * 0.26 +
        Math.sin(2 * Math.PI * 220 * t + Math.sin(2 * Math.PI * 14 * t) * 1.8) * 0.22 +
        Math.sin(2 * Math.PI * 440 * t) * 0.10;
      const crackle =
        random() > 0.982
          ? (random() * 2 - 1) * (0.45 + 0.35 * Math.sin(2 * Math.PI * 8 * t))
          : 0;
      raw[i] = hum + lp * 0.35 + (hi - lp) * 0.22 + crackle;
    }
    const fadeLen = Math.floor(0.06 * sampleRate);
    const pcm = new Float32Array(len - fadeLen);
    for (let i = 0; i < pcm.length; i++) {
      if (i < fadeLen) {
        const u = i / fadeLen;
        pcm[i] = raw[i] * u + raw[pcm.length + i] * (1 - u);
      } else {
        pcm[i] = raw[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = 0.62 / Math.max(0.001, peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  }

  // 8. LÔI BẠO — Tiếng mở thêm vòng Lôi Hoàn mỗi giây (arc snap + chuông điện)
  if (kind === 'lightning_ring') {
    const duration = 0.26;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let phase1 = 0;
    let phase2 = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      const snapEnv = Math.exp(-t / 0.018);
      const ringEnv = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.095);
      phase1 += (2 * Math.PI * (520 + 240 * Math.exp(-t * 35))) / sampleRate;
      phase2 += (2 * Math.PI * 1040) / sampleRate;
      const zap = n * snapEnv * 0.85;
      const tone = (Math.sin(phase1) * 0.55 + Math.sin(phase2) * 0.32) * ringEnv;
      pcm[i] = zap + tone;
    }
    return normalizePCM(pcm, 0.82, 0.018, sampleRate);
  }

  // 9. LÔI BẠO — Phóng tia thiên lôi & Sấm nổ giáng xuống mục tiêu
  if (kind === 'lightning_thunder') {
    const duration = 0.82;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let mid = 0;
    let high = 0;
    let phase = 0;
    const aSub = coeff(140);
    const aMid = coeff(980);
    const aHigh = coeff(5400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      mid += aMid * (n - mid);
      high += aHigh * (n - high);

      // Tiếng sét xé không khí ở 60ms đầu + sấm rền phía sau
      const crackEnv = (1 - Math.exp(-t / 0.0008)) * Math.exp(-t / 0.055);
      const thunderEnv =
        (1 - Math.exp(-t / 0.018)) *
        Math.exp(-t / 0.34) *
        (0.78 + 0.22 * Math.sin(2 * Math.PI * 11 * t));
      const freq = 52 + 190 * Math.exp(-t * 28);
      phase += (2 * Math.PI * freq) / sampleRate;
      const shock = Math.sin(phase) * Math.exp(-t / 0.15) * 0.92;
      const arcBursts =
        random() > 0.965 ? (random() * 2 - 1) * 0.55 * Math.exp(-t / 0.42) : 0;

      pcm[i] =
        (high - mid) * 1.45 * crackEnv +
        shock +
        sub * 1.75 * thunderEnv +
        (mid - sub) * 0.95 * thunderEnv +
        arcBursts;
    }
    return normalizePCM(pcm, 0.95, 0.04, sampleRate);
  }

  // 10. THỔ THUẪN — Kích hoạt vòm thuẫn hộ thể (địa mạch trồi lên + kết tinh nham thạch)
  if (kind === 'earth_activate') {
    const duration = 0.48;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let low = 0;
    let grit = 0;
    let p1 = 0;
    let p2 = 0;
    const aLow = coeff(210);
    const aGrit = coeff(1200);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      low += aLow * (n - low);
      grit += aGrit * (n - grit);
      const riseEnv = (1 - Math.exp(-t / 0.035)) * Math.exp(-t / 0.20);
      const lockTime = Math.max(0, t - 0.07);
      const lockEnv =
        t > 0.07 ? (1 - Math.exp(-lockTime / 0.004)) * Math.exp(-lockTime / 0.16) : 0;
      const fRise = 72 + 68 * Math.min(1, t / 0.22);
      p1 += (2 * Math.PI * fRise) / sampleRate;
      p2 += (2 * Math.PI * 392) / sampleRate; // Âm cộng hưởng thổ tinh ấm
      pcm[i] =
        (low * 1.8 + (grit - low) * 0.65 + Math.sin(p1) * 0.65) * riseEnv +
        (Math.sin(p2) * 0.36 + Math.sin(p2 * 1.5) * 0.18) * lockEnv;
    }
    return normalizePCM(pcm, 0.84, 0.025, sampleRate);
  }

  // 11. THỔ THUẪN — Thu hồi thuẫn chủ động (cát đá tản nhẹ)
  if (kind === 'earth_disperse') {
    const duration = 0.36;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let sand = 0;
    let phase = 0;
    const aLp = coeff(340);
    const aSand = coeff(2400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      sand += aSand * (n - sand);
      const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.13);
      const freq = 210 * Math.exp(-t * 5.2) + 60;
      phase += (2 * Math.PI * freq) / sampleRate;
      pcm[i] = (lp * 0.9 + (sand - lp) * 0.65 + Math.sin(phase) * 0.32) * env;
    }
    return normalizePCM(pcm, 0.70, 0.02, sampleRate);
  }

  // 12. THỔ THUẪN — Đỡ đòn tấn công (tiếng va đập đanh chắc vào giáp đá + ngân thổ tinh)
  if (kind === 'earth_block') {
    const duration = 0.42;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let stone = 0;
    let p1 = 0;
    let p2 = 0;
    const aSub = coeff(190);
    const aStone = coeff(1850);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      stone += aStone * (n - stone);
      const hitEnv = (1 - Math.exp(-t / 0.0012)) * Math.exp(-t / 0.085);
      const ringEnv = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / 0.14);
      const thudFreq = 68 + 145 * Math.exp(-t * 36);
      p1 += (2 * Math.PI * thudFreq) / sampleRate;
      p2 += (2 * Math.PI * (310 + (variant % 3) * 28)) / sampleRate;
      const pebbles =
        t > 0.015 && random() > 0.972
          ? (random() * 2 - 1) * 0.38 * Math.exp(-t / 0.18)
          : 0;
      pcm[i] =
        (Math.sin(p1) * 0.95 + sub * 1.5 + (stone - sub) * 0.85) * hitEnv +
        Math.sin(p2) * 0.28 * ringEnv +
        pebbles;
    }
    return normalizePCM(pcm, 0.90, 0.022, sampleRate);
  }

  // 14. THẦN THỨC — Mở Linh Nhãn (âm ngân tâm nhãn thanh thoát + sóng linh thức lan tỏa)
  if (kind === 'than_thuc_on') {
    const duration = 0.56;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    let air = 0;
    const aAir = coeff(2100);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      air += aAir * (n - air);
      const env = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.24);
      const fBase = 432 + 108 * (1 - Math.exp(-t * 9));
      p1 += (2 * Math.PI * fBase) / sampleRate;
      p2 += (2 * Math.PI * (fBase * 1.5)) / sampleRate;
      p3 += (2 * Math.PI * (fBase * 2.0)) / sampleRate;
      pcm[i] =
        (Math.sin(p1) * 0.52 + Math.sin(p2) * 0.34 + Math.sin(p3) * 0.20 + air * 0.16) * env;
    }
    return normalizePCM(pcm, 0.80, 0.025, sampleRate);
  }

  // 15. THẦN THỨC — Thu hồi Linh Nhãn (âm ngân hạ xuống êm dịu)
  if (kind === 'than_thuc_off') {
    const duration = 0.38;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let p1 = 0;
    let p2 = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.15);
      const fBase = 540 - 160 * (1 - Math.exp(-t * 11));
      p1 += (2 * Math.PI * fBase) / sampleRate;
      p2 += (2 * Math.PI * (fBase * 1.5)) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.58 + Math.sin(p2) * 0.28) * env;
    }
    return normalizePCM(pcm, 0.74, 0.02, sampleRate);
  }

  // 16. THỦY KIẾM — Khởi kết ấn Thủy Linh (sóng nước ngân + bọt thủy tinh)
  if (kind === 'water_seal') {
    const duration = 0.54;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let bp = 0;
    let p1 = 0;
    let p2 = 0;
    const aLp = coeff(480);
    const aBp = coeff(2100);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.025)) * Math.exp(-t / 0.24);
      const f1 = 360 + 85 * Math.sin(t * 14);
      const f2 = 720 + 110 * Math.cos(t * 19);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * f2) / sampleRate;
      pcm[i] =
        (Math.sin(p1) * 0.44 + Math.sin(p2) * 0.24 + (bp - lp) * 0.52 + lp * 0.45) * env;
    }
    return normalizePCM(pcm, 0.78, 0.025, sampleRate);
  }

  // 17. THỦY KIẾM — 3 đạo thủy quang phóng vút lên trời
  if (kind === 'water_rays') {
    const duration = 0.62;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let hi = 0;
    let p1 = 0;
    let p2 = 0;
    const aBp = coeff(1200);
    const aHi = coeff(4600);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      hi += aHi * (n - hi);
      const env = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.25);
      const f1 = 320 + 780 * Math.min(1, t / 0.48);
      const f2 = f1 * 1.498;
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * f2) / sampleRate;
      pcm[i] =
        (Math.sin(p1) * 0.46 + Math.sin(p2) * 0.28 + (hi - bp) * 0.68) * env;
    }
    return normalizePCM(pcm, 0.85, 0.025, sampleRate);
  }

  // 18. THỦY KIẾM — Cự kiếm giáng xuống mục tiêu (kiếm khí chém + sóng nước nổ tung)
  if (kind === 'water_impact') {
    const duration = 0.66;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let splash = 0;
    let foam = 0;
    let p1 = 0;
    let p2 = 0;
    const aSub = coeff(175);
    const aSplash = coeff(1150);
    const aFoam = coeff(3800);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      splash += aSplash * (n - splash);
      foam += aFoam * (n - foam);

      const slashEnv = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.09);
      const waveEnv = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.28);
      const fSlash = 680 * Math.exp(-t * 16) + 95;
      const fChime = 520 - 140 * Math.min(1, t / 0.35);
      p1 += (2 * Math.PI * fSlash) / sampleRate;
      p2 += (2 * Math.PI * fChime) / sampleRate;
      pcm[i] =
        (Math.sin(p1) * 0.68 + sub * 1.45) * slashEnv +
        ((splash - sub) * 1.05 + (foam - splash) * 0.62 + Math.sin(p2) * 0.22) * waveEnv;
    }
    return normalizePCM(pcm, 0.92, 0.03, sampleRate);
  }

  // 19. NGŨ HÀNH — Khai trận phóng 5 luồng linh quang
  if (kind === 'five_launch') {
    const duration = 0.64;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    const freqs = [261.6, 329.6, 392.0, 493.9, 587.3];
    const phases = [0, 0, 0, 0, 0];
    let air = 0;
    const aAir = coeff(2400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      air += aAir * (n - air);
      let chord = 0;
      for (let k = 0; k < 5; k++) {
        const delay = k * 0.065;
        if (t >= delay) {
          const lt = t - delay;
          const envK = (1 - Math.exp(-lt / 0.008)) * Math.exp(-lt / 0.22);
          phases[k] += (2 * Math.PI * (freqs[k] * (1 + 0.15 * Math.exp(-lt * 12)))) / sampleRate;
          chord += Math.sin(phases[k]) * envK * 0.24;
        }
      }
      const whoosh = air * (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.28) * 0.45;
      pcm[i] = chord + whoosh;
    }
    return normalizePCM(pcm, 0.86, 0.028, sampleRate);
  }

  // 20. NGŨ HÀNH — Dựng 5 linh trụ phong tỏa thiên địa
  if (kind === 'five_form') {
    const duration = 0.58;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let low = 0;
    let mid = 0;
    let p1 = 0;
    let p2 = 0;
    const aLow = coeff(180);
    const aMid = coeff(1450);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      low += aLow * (n - low);
      mid += aMid * (n - mid);
      const env = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.24);
      const f1 = 82 + 90 * Math.exp(-t * 18);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * 392) / sampleRate;
      pcm[i] =
        (Math.sin(p1) * 0.78 + low * 1.55 + (mid - low) * 0.65 + Math.sin(p2) * 0.28) * env;
    }
    return normalizePCM(pcm, 0.88, 0.025, sampleRate);
  }

  // 21. NGŨ HÀNH — Nhịp xung sát thương 5 nguyên tố trong đại trận
  if (kind === 'five_pulse') {
    const duration = 0.24;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let p1 = 0;
    let p2 = 0;
    const aBp = coeff(1900);
    const baseF = [220, 277.2, 329.6, 392, 440][variant % 5];
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.004)) * Math.exp(-t / 0.085);
      p1 += (2 * Math.PI * baseF) / sampleRate;
      p2 += (2 * Math.PI * (baseF * 1.5)) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.48 + Math.sin(p2) * 0.26 + bp * 0.42) * env;
    }
    return normalizePCM(pcm, 0.62, 0.016, sampleRate);
  }

  // 22. NGŨ HÀNH — Quy nhất thu trận (hút linh lực ép vào tâm trận)
  if (kind === 'five_converge') {
    const duration = 0.68;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let p1 = 0;
    let p2 = 0;
    const aLp = coeff(950);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const u = t / duration;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      const env = Math.pow(u, 0.7) * Math.exp(-(1 - u) * 0.4);
      const f1 = 140 + 520 * (u * u);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * (f1 * 1.5)) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.56 + Math.sin(p2) * 0.32 + lp * 0.48) * env;
    }
    return normalizePCM(pcm, 0.86, 0.02, sampleRate);
  }

  // 23. NGŨ HÀNH — Đại nổ NGŨ HÀNH BẠO SÁT
  if (kind === 'five_blast') {
    const duration = 0.92;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let body = 0;
    let hi = 0;
    let pBoom = 0;
    let pChord = 0;
    const aSub = coeff(125);
    const aBody = coeff(780);
    const aHi = coeff(4200);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      body += aBody * (n - body);
      hi += aHi * (n - hi);

      const impactEnv = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.28);
      const tailEnv = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.42);
      const fBoom = 44 + 165 * Math.exp(-t * 24);
      pBoom += (2 * Math.PI * fBoom) / sampleRate;
      pChord += (2 * Math.PI * 293.66) / sampleRate;
      const shock = Math.sin(pBoom) * Math.exp(-t / 0.18) * 1.05;
      const ring =
        (Math.sin(pChord) * 0.24 + Math.sin(pChord * 1.5) * 0.18) * tailEnv;
      pcm[i] =
        shock +
        sub * 1.95 * impactEnv +
        (body - sub) * 1.2 * tailEnv +
        (hi - body) * 0.55 * impactEnv +
        ring;
    }
    return normalizePCM(pcm, 0.96, 0.04, sampleRate);
  }

  // 13. THỔ THUẪN — Nổ vỡ thuẫn khi cạn linh lực (đá tảng nứt vỡ + sỏi đá rơi)
  if (kind === 'earth_shatter') {
    const duration = 0.68;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let low = 0;
    let mid = 0;
    let phase = 0;
    const aLow = coeff(240);
    const aMid = coeff(2200);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      low += aLow * (n - low);
      mid += aMid * (n - mid);
      const crackEnv = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / 0.18);
      const freq = 58 + 130 * Math.exp(-t * 22);
      phase += (2 * Math.PI * freq) / sampleRate;
      const debris =
        random() > 0.955 ? (random() * 2 - 1) * 0.55 * Math.exp(-t / 0.35) : 0;
      pcm[i] =
        (Math.sin(phase) * 0.82 + low * 1.65 + (mid - low) * 1.05) * crackEnv + debris;
    }
    return normalizePCM(pcm, 0.92, 0.03, sampleRate);
  }

  // 24. HUYẾT DỰ - KỸ NĂNG 1: HUYẾT THỦ — Khởi ấn triệu hồi ma trảo
  if (kind === 'blood_hand_cast') {
    const duration = 0.42;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let bp = 0;
    let p1 = 0;
    let p2 = 0;
    const aLp = coeff(280);
    const aBp = coeff(1400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.16);
      const f1 = 88 + 120 * Math.exp(-t * 14);
      const f2 = 185 + 40 * Math.sin(t * 22);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * f2) / sampleRate;
      const swirl = (bp - lp) * 0.72;
      pcm[i] = (Math.sin(p1) * 0.55 + Math.sin(p2) * 0.32 + lp * 1.25 + swirl) * env;
    }
    return normalizePCM(pcm, 0.82, 0.02, sampleRate);
  }

  // 25. HUYẾT DỰ - KỸ NĂNG 1: HUYẾT THỦ — Ma trảo xé gió lao đi
  if (kind === 'blood_hand_fly') {
    const duration = 0.38;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let hi = 0;
    let p1 = 0;
    const aBp = coeff(920);
    const aHi = coeff(3600);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      hi += aHi * (n - hi);
      const env = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.18);
      const f1 = 480 * Math.exp(-t * 7.5) + 95;
      p1 += (2 * Math.PI * f1) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.45 + (hi - bp) * 0.85 + bp * 0.5) * env;
    }
    return normalizePCM(pcm, 0.76, 0.02, sampleRate);
  }

  // 26. HUYẾT DỰ - KỸ NĂNG 1: HUYẾT THỦ — Bạo huyết bóp nát mục tiêu
  if (kind === 'blood_hand_burst') {
    const duration = 0.68;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let mid = 0;
    let hi = 0;
    let pSub = 0;
    let pRing = 0;
    const aSub = coeff(110);
    const aMid = coeff(850);
    const aHi = coeff(4400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      mid += aMid * (n - mid);
      hi += aHi * (n - hi);
      const impactEnv = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.16);
      const crushEnv = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.28);
      const fSub = 58 + 140 * Math.exp(-t * 26);
      pSub += (2 * Math.PI * fSub) / sampleRate;
      pRing += (2 * Math.PI * 196) / sampleRate;
      const squelch = random() > 0.94 ? (random() * 2 - 1) * 0.6 * Math.exp(-t / 0.22) : 0;
      pcm[i] =
        (Math.sin(pSub) * 0.9 + sub * 1.85) * impactEnv +
        ((mid - sub) * 1.1 + Math.sin(pRing) * 0.25) * crushEnv +
        (hi - mid) * 0.65 * impactEnv +
        squelch;
    }
    return normalizePCM(pcm, 0.92, 0.03, sampleRate);
  }

  // 27. HUYẾT DỰ - HUYẾT TÍCH / HUYẾT ẤN — Nhịp rớt máu rút sinh mệnh
  if (kind === 'blood_bleed_tick') {
    const duration = 0.14;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let p1 = 0;
    const aBp = coeff(2800);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.045);
      const f1 = 820 * Math.exp(-t * 38) + 160;
      p1 += (2 * Math.PI * f1) / sampleRate;
      const snap = random() > 0.97 ? (random() * 2 - 1) * 0.45 : 0;
      pcm[i] = (Math.sin(p1) * 0.42 + bp * 0.75 + snap) * env;
    }
    return normalizePCM(pcm, 0.48, 0.012, sampleRate);
  }

  // 28. HUYẾT DỰ - KỸ NĂNG 2: HUYẾT KIM TUYẾN — Tụ huyết châm (vòng lặp 1.0s)
  if (kind === 'blood_thread_charge') {
    const duration = 1.0;
    const len = Math.ceil(duration * sampleRate);
    const raw = new Float32Array(len);
    let lp = 0;
    let hi = 0;
    const aLp = coeff(180);
    const aHi = coeff(3800);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      hi += aHi * (n - hi);
      const hum =
        Math.sin(2 * Math.PI * 68 * t) * 0.28 +
        Math.sin(2 * Math.PI * 340 * t) * 0.18 +
        Math.sin(2 * Math.PI * 680 * t + Math.sin(2 * Math.PI * 12 * t) * 1.5) * 0.22 +
        Math.sin(2 * Math.PI * 1360 * t) * 0.12;
      const prickle = random() > 0.985 ? (random() * 2 - 1) * 0.4 : 0;
      raw[i] = hum + lp * 0.32 + (hi - lp) * 0.18 + prickle;
    }
    const fadeLen = Math.floor(0.06 * sampleRate);
    const pcm = new Float32Array(len - fadeLen);
    for (let i = 0; i < pcm.length; i++) {
      if (i < fadeLen) {
        const u = i / fadeLen;
        pcm[i] = raw[i] * u + raw[pcm.length + i] * (1 - u);
      } else {
        pcm[i] = raw[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = 0.58 / Math.max(0.001, peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  }

  // 29. HUYẾT DỰ - KỸ NĂNG 2: HUYẾT KIM TUYẾN — Phóng loạt kim tuyến
  if (kind === 'blood_thread_release') {
    const duration = 0.52;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let hi = 0;
    const aHi = coeff(5200);
    const count = 5 + (variant % 6);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      hi += aHi * (n - hi);
      let needles = 0;
      for (let k = 0; k < count; k++) {
        const delay = k * 0.032;
        if (t >= delay && t < delay + 0.18) {
          const lt = t - delay;
          const envK = (1 - Math.exp(-lt / 0.003)) * Math.exp(-lt / 0.045);
          const f = 1600 + (k % 4) * 320 + 900 * Math.exp(-lt * 25);
          needles += Math.sin((2 * Math.PI * f * lt)) * envK * 0.35;
        }
      }
      const whoosh = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.25) * hi * 0.45;
      pcm[i] = needles + whoosh;
    }
    return normalizePCM(pcm, 0.84, 0.02, sampleRate);
  }

  // 30. HUYẾT DỰ - KỸ NĂNG 2: HUYẾT KIM TUYẾN — Kim tuyến ghim xuyên địch
  if (kind === 'blood_thread_hit') {
    const isFinal = variant > 0;
    const duration = isFinal ? 0.62 : 0.28;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let mid = 0;
    let hi = 0;
    let p = 0;
    const aSub = coeff(140);
    const aMid = coeff(1100);
    const aHi = coeff(4800);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      mid += aMid * (n - mid);
      hi += aHi * (n - hi);
      const snapEnv = (1 - Math.exp(-t / 0.001)) * Math.exp(-t / (isFinal ? 0.12 : 0.04));
      const bodyEnv = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / (isFinal ? 0.26 : 0.09));
      const f = (isFinal ? 1200 : 880) * Math.exp(-t * 32) + 120;
      p += (2 * Math.PI * f) / sampleRate;
      pcm[i] =
        (Math.sin(p) * 0.6 + (hi - mid) * 0.85) * snapEnv +
        (sub * (isFinal ? 1.7 : 0.8) + (mid - sub) * 0.7) * bodyEnv;
    }
    return normalizePCM(pcm, isFinal ? 0.90 : 0.68, 0.018, sampleRate);
  }

  // 31. HUYẾT DỰ - KỸ NĂNG 3: THÔN LINH HUYẾT — Khởi ấn hút hồn
  if (kind === 'blood_siphon_start') {
    const duration = 0.56;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let bp = 0;
    let p1 = 0;
    let p2 = 0;
    const aBp = coeff(1700);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.26);
      const f1 = 280 + 90 * Math.sin(t * 16);
      const f2 = 396 + 60 * Math.cos(t * 12); // Demonic tritone resonance
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * f2) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.5 + Math.sin(p2) * 0.35 + bp * 0.6) * env;
    }
    return normalizePCM(pcm, 0.78, 0.025, sampleRate);
  }

  // 32. HUYẾT DỰ - KỸ NĂNG 3: THÔN LINH HUYẾT — Vòng lặp rút sinh mệnh & linh lực (1.2s)
  if (kind === 'blood_siphon_loop') {
    const duration = 1.2;
    const len = Math.ceil(duration * sampleRate);
    const raw = new Float32Array(len);
    let lp = 0;
    let bp = 0;
    const aLp = coeff(240);
    const aBp = coeff(1800);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      bp += aBp * (n - bp);
      const beat1 = Math.exp(-Math.pow((t % 0.6) - 0.08, 2) / 0.002);
      const beat2 = Math.exp(-Math.pow((t % 0.6) - 0.22, 2) / 0.0025);
      const pulse = (beat1 * 0.45 + beat2 * 0.28) * Math.sin(2 * Math.PI * 52 * t);
      const hum =
        Math.sin(2 * Math.PI * 165 * t) * 0.22 +
        Math.sin(2 * Math.PI * 247 * t + Math.sin(2 * Math.PI * 6 * t) * 1.2) * 0.20;
      raw[i] = pulse + hum + lp * 0.25 + bp * 0.18;
    }
    const fadeLen = Math.floor(0.06 * sampleRate);
    const pcm = new Float32Array(len - fadeLen);
    for (let i = 0; i < pcm.length; i++) {
      if (i < fadeLen) {
        const u = i / fadeLen;
        pcm[i] = raw[i] * u + raw[pcm.length + i] * (1 - u);
      } else {
        pcm[i] = raw[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = 0.54 / Math.max(0.001, peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  }

  // 33. HUYẾT DỰ - KỸ NĂNG 3: THÔN LINH HUYẾT — Nhịp nuốt linh huyết
  if (kind === 'blood_siphon_drain') {
    const duration = 0.22;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let p = 0;
    const aLp = coeff(380);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.08);
      const f = 190 * Math.exp(-t * 12) + 75;
      p += (2 * Math.PI * f) / sampleRate;
      pcm[i] = (Math.sin(p) * 0.65 + lp * 0.8) * env;
    }
    return normalizePCM(pcm, 0.56, 0.015, sampleRate);
  }

  // 34. HUYẾT DỰ - KỸ NĂNG 4: HUYẾT BẠO · TỰ HỦY — Kết ấn cấm thuật
  if (kind === 'blood_cataclysm_seal') {
    const duration = 0.88;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let p1 = 0;
    let p2 = 0;
    let p3 = 0;
    const aSub = coeff(140);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      const env = (1 - Math.exp(-t / 0.02)) * Math.exp(-t / 0.42);
      p1 += (2 * Math.PI * 98) / sampleRate;
      p2 += (2 * Math.PI * 147) / sampleRate;
      p3 += (2 * Math.PI * 294) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.55 + Math.sin(p2) * 0.38 + Math.sin(p3) * 0.22 + sub * 1.1) * env;
    }
    return normalizePCM(pcm, 0.88, 0.03, sampleRate);
  }

  // 35. HUYẾT DỰ - KỸ NĂNG 4: HUYẾT BẠO · TỰ HỦY — Vạn huyết quy nguyên (hút xoáy cực đại)
  if (kind === 'blood_cataclysm_gather') {
    const duration = 1.15;
    const len = Math.ceil(duration * sampleRate);
    const raw = new Float32Array(len);
    let lp = 0;
    let bp = 0;
    const aLp = coeff(320);
    const aBp = coeff(2100);
    for (let i = 0; i < len; i++) {
      const t = i / sampleRate;
      const u = t / duration;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      bp += aBp * (n - bp);
      const f = 65 + 240 * (u * u);
      const vortex = Math.sin(2 * Math.PI * f * t) * (0.4 + 0.5 * u);
      const whoosh = bp * (0.35 + 0.45 * u);
      raw[i] = vortex + whoosh + lp * 0.4;
    }
    const fadeLen = Math.floor(0.06 * sampleRate);
    const pcm = new Float32Array(len - fadeLen);
    for (let i = 0; i < pcm.length; i++) {
      if (i < fadeLen) {
        const u = i / fadeLen;
        pcm[i] = raw[i] * u + raw[pcm.length + i] * (1 - u);
      } else {
        pcm[i] = raw[i];
      }
    }
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    const g = 0.72 / Math.max(0.001, peak);
    for (let i = 0; i < pcm.length; i++) pcm[i] *= g;
    return pcm;
  }

  // 36. HUYẾT DỰ - KỸ NĂNG 4: HUYẾT BẠO · TỰ HỦY — Nén áp súc cực hạn (khoảng lặng)
  if (kind === 'blood_cataclysm_pinch') {
    const duration = 0.75;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let p = 0;
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const u = t / duration;
      const env = Math.pow(1 - u, 1.8) * Math.min(1, t / 0.02);
      const f = 2400 * (1 - u * 0.75);
      p += (2 * Math.PI * f) / sampleRate;
      pcm[i] = Math.sin(p) * 0.28 * env;
    }
    return normalizePCM(pcm, 0.42, 0.015, sampleRate);
  }

  // 37. HUYẾT DỰ - KỸ NĂNG 4: HUYẾT BẠO · TỰ HỦY — Đại nổ Huyết Nhật nuốt trọn map
  if (kind === 'blood_cataclysm_blast') {
    const duration = 1.45;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let body = 0;
    let hi = 0;
    let pBoom = 0;
    let pSub = 0;
    const aSub = coeff(85);
    const aBody = coeff(620);
    const aHi = coeff(5200);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      body += aBody * (n - body);
      hi += aHi * (n - hi);
      const crackEnv = (1 - Math.exp(-t / 0.0008)) * Math.exp(-t / 0.08);
      const blastEnv = (1 - Math.exp(-t / 0.005)) * Math.exp(-t / 0.45);
      const roarEnv = (1 - Math.exp(-t / 0.03)) * Math.exp(-t / 0.75);
      const fBoom = 36 + 180 * Math.exp(-t * 18);
      pBoom += (2 * Math.PI * fBoom) / sampleRate;
      pSub += (2 * Math.PI * 32) / sampleRate;
      pcm[i] =
        (hi - body) * 1.6 * crackEnv +
        (Math.sin(pBoom) * 1.1 + sub * 2.2) * blastEnv +
        (body * 1.25 + Math.sin(pSub) * 0.6) * roarEnv;
    }
    return normalizePCM(pcm, 0.98, 0.05, sampleRate);
  }

  // 38. HUYẾT DỰ - KỸ NĂNG 5: HUYẾT THUẪN — Kích hoạt ma huyết hộ thể
  if (kind === 'blood_shield_activate') {
    const duration = 0.46;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let low = 0;
    let bp = 0;
    let p1 = 0;
    let p2 = 0;
    const aLow = coeff(220);
    const aBp = coeff(1600);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      low += aLow * (n - low);
      bp += aBp * (n - bp);
      const env = (1 - Math.exp(-t / 0.015)) * Math.exp(-t / 0.22);
      const f1 = 110 + 130 * Math.min(1, t / 0.25);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * 261.6) / sampleRate;
      pcm[i] = (low * 1.6 + bp * 0.7 + Math.sin(p1) * 0.62 + Math.sin(p2) * 0.35) * env;
    }
    return normalizePCM(pcm, 0.82, 0.02, sampleRate);
  }

  // 39. HUYẾT DỰ - KỸ NĂNG 5: HUYẾT THUẪN — Hấp thụ sát thương va chạm
  if (kind === 'blood_shield_block') {
    const duration = 0.40;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let mid = 0;
    let p1 = 0;
    let p2 = 0;
    const aSub = coeff(160);
    const aMid = coeff(1400);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      mid += aMid * (n - mid);
      const hitEnv = (1 - Math.exp(-t / 0.0015)) * Math.exp(-t / 0.095);
      const ringEnv = (1 - Math.exp(-t / 0.008)) * Math.exp(-t / 0.16);
      const f1 = 78 + 110 * Math.exp(-t * 28);
      p1 += (2 * Math.PI * f1) / sampleRate;
      p2 += (2 * Math.PI * 220) / sampleRate;
      pcm[i] = (Math.sin(p1) * 0.85 + sub * 1.45 + mid * 0.6) * hitEnv + Math.sin(p2) * 0.3 * ringEnv;
    }
    return normalizePCM(pcm, 0.88, 0.02, sampleRate);
  }

  // 40. HUYẾT DỰ - KỸ NĂNG 5: HUYẾT THUẪN — Vỡ thuẫn huyết sắc
  if (kind === 'blood_shield_break') {
    const duration = 0.58;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let sub = 0;
    let hi = 0;
    let p = 0;
    const aSub = coeff(180);
    const aHi = coeff(3800);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      sub += aSub * (n - sub);
      hi += aHi * (n - hi);
      const popEnv = (1 - Math.exp(-t / 0.001)) * Math.exp(-t / 0.06);
      const splashEnv = (1 - Math.exp(-t / 0.012)) * Math.exp(-t / 0.28);
      p += (2 * Math.PI * (480 * Math.exp(-t * 16) + 90)) / sampleRate;
      pcm[i] = (Math.sin(p) * 0.7 + hi * 1.1) * popEnv + (sub * 1.35) * splashEnv;
    }
    return normalizePCM(pcm, 0.90, 0.025, sampleRate);
  }

  // 41. HUYẾT DỰ - KỸ NĂNG 5: HUYẾT THUẪN — Thu hồi ma huyết
  if (kind === 'blood_shield_disperse') {
    const duration = 0.32;
    const pcm = new Float32Array(Math.ceil(duration * sampleRate));
    let lp = 0;
    let p = 0;
    const aLp = coeff(420);
    for (let i = 0; i < pcm.length; i++) {
      const t = i / sampleRate;
      const n = random() * 2 - 1;
      lp += aLp * (n - lp);
      const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.14);
      p += (2 * Math.PI * (240 * Math.exp(-t * 6) + 60)) / sampleRate;
      pcm[i] = (lp * 0.85 + Math.sin(p) * 0.4) * env;
    }
    return normalizePCM(pcm, 0.68, 0.018, sampleRate);
  }

  return new Float32Array(Math.ceil(0.1 * sampleRate));
}

export function makeActionAudio() {
  const STORE = 'pk-loan-chien-action-audio-v1';
  let context = null;
  let master = null;
  let limiter = null;
  let unavailable = false;
  let serial = 0;
  let lastStep = -Infinity;
  let lastLanding = -Infinity;
  let lastSizzle = -Infinity;
  let lastEvent = null;
  let totalPlayed = 0;
  const buffers = new Map();
  const voices = new Set();
  let chargeVoice = null;
  let bloodThreadVoice = null;
  let bloodSiphonVoice = null;
  let bloodGatherVoice = null;

  function restore() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORE) || 'null');
      if (saved && typeof saved.enabled === 'boolean') settings.soundEnabled = saved.enabled;
      if (saved && Number.isFinite(saved.volume)) {
        settings.soundVolume = Math.max(0, Math.min(100, saved.volume));
      }
    } catch {}
  }

  function persist() {
    try {
      window.localStorage.setItem(
        STORE,
        JSON.stringify({ enabled: settings.soundEnabled, volume: settings.soundVolume })
      );
    } catch {}
  }

  function sync() {
    if (!master || !context || context.state === 'closed') return;
    const volume = settings.soundEnabled ? 0.76 * Math.pow(settings.soundVolume / 100, 1.35) : 0;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(volume, context.currentTime, 0.012);
  }

  function isReady() {
    return (
      game.running &&
      !document.hidden &&
      settings.soundEnabled &&
      settings.soundVolume > 0 &&
      !!context &&
      context.state === 'running'
    );
  }

  function unlock() {
    if (!settings.soundEnabled || settings.soundVolume <= 0 || document.hidden) return false;
    try {
      if (!context || context.state === 'closed') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) {
          unavailable = true;
          return false;
        }
        context = new AudioContextClass({ latencyHint: 'interactive' });
        buffers.clear();
        voices.clear();
        chargeVoice = null;
        master = context.createGain();
        master.gain.value = 0;
        limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -9;
        limiter.knee.value = 6;
        limiter.ratio.value = 4;
        limiter.attack.value = 0.003;
        limiter.release.value = 0.09;
        master.connect(limiter);
        limiter.connect(context.destination);
        unavailable = false;
      }
      if (context.state === 'suspended' || context.state === 'interrupted') {
        const pending = context.resume();
        if (pending?.catch) pending.catch(() => {});
      }
      sync();
      return true;
    } catch {
      unavailable = true;
      return false;
    }
  }

  function getFoleyBuffer(kind, material, variant) {
    const key = 'foley:' + kind + ':' + material + ':' + variant;
    if (buffers.has(key)) return buffers.get(key);
    const data = makeFoleyPCM(kind, material, variant);
    const buffer = context.createBuffer(1, data.length, 32000);
    buffer.getChannelData(0).set(data);
    buffers.set(key, buffer);
    return buffer;
  }

  function getSkillBuffer(kind, variant = 0) {
    const key = 'skill:' + kind + ':' + variant;
    if (buffers.has(key)) return buffers.get(key);
    const data = makeSkillPCM(kind, variant);
    const buffer = context.createBuffer(1, data.length, 32000);
    buffer.getChannelData(0).set(data);
    buffers.set(key, buffer);
    return buffer;
  }

  function stopVoice(voice) {
    if (!voice || !context) return;
    try {
      const now = context.currentTime;
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, 0.008);
      voice.source.stop(now + 0.03);
    } catch {}
  }

  function stopChargeLoop() {
    if (!chargeVoice) return;
    const v = chargeVoice;
    chargeVoice = null;
    voices.delete(v);
    stopVoice(v);
  }

  function stopBloodThreadCharge() {
    if (!bloodThreadVoice) return;
    const v = bloodThreadVoice;
    bloodThreadVoice = null;
    voices.delete(v);
    stopVoice(v);
  }

  function stopBloodSiphonLoop() {
    if (!bloodSiphonVoice) return;
    const v = bloodSiphonVoice;
    bloodSiphonVoice = null;
    voices.delete(v);
    stopVoice(v);
  }

  function stopBloodCataclysmGather() {
    if (!bloodGatherVoice) return;
    const v = bloodGatherVoice;
    bloodGatherVoice = null;
    voices.delete(v);
    stopVoice(v);
  }

  function stopAll() {
    stopChargeLoop();
    stopBloodThreadCharge();
    stopBloodSiphonLoop();
    stopBloodCataclysmGather();
    for (const voice of voices) stopVoice(voice);
    voices.clear();
    lastStep = lastLanding = lastSizzle = -Infinity;
  }

  function playOneShot(buffer, gainValue = 0.65, playbackRate = 1, eventMeta = null) {
    if (!isReady() || !buffer) return false;
    const now = context.currentTime;
    let source;
    let gain;
    try {
      if (voices.size >= 8) {
        const oldest = voices.values().next().value;
        if (
          oldest &&
          oldest !== chargeVoice &&
          oldest !== bloodThreadVoice &&
          oldest !== bloodSiphonVoice &&
          oldest !== bloodGatherVoice
        ) {
          stopVoice(oldest);
          voices.delete(oldest);
        }
      }
      source = context.createBufferSource();
      gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = clamp(playbackRate, 0.45, 2.4);
      gain.gain.value = clamp(gainValue, 0.02, 1.25);
      source.connect(gain);
      gain.connect(master);
      const voice = { source, gain };
      voices.add(voice);
      source.onended = () => {
        voices.delete(voice);
        try {
          source.disconnect();
          gain.disconnect();
        } catch {}
      };
      source.start(now + 0.001);
      totalPlayed++;
      if (eventMeta) lastEvent = eventMeta;
      return true;
    } catch {
      if (source) {
        for (const v of voices) if (v.source === source) voices.delete(v);
        try {
          source.disconnect();
        } catch {}
      }
      try {
        gain?.disconnect();
      } catch {}
      return false;
    }
  }

  function emitFoley(kind, intensity, material) {
    if (!isReady()) return false;
    const now = context.currentTime;
    const step = kind === 'step';
    if ((step && now - lastStep < 0.07) || (!step && now - lastLanding < 0.12)) return false;
    const m = Math.max(1, Math.min(4, material | 0));
    const v = serial++ % 4;
    const strength = Math.max(0, Math.min(1, intensity));
    const gainValue =
      (step ? 0.30 + 0.48 * strength : 0.46 + 0.54 * strength) * (v % 2 ? 0.94 : 1);
    const rate = [0.97, 1.025, 0.99, 1.015][v] * (step ? 1 : 0.94);
    const ok = playOneShot(getFoleyBuffer(kind, m, v), gainValue, rate, {
      kind,
      material: m,
      intensity: strength,
      variant: v,
    });
    if (ok) {
      if (step) lastStep = now;
      else lastLanding = now;
    }
    return ok;
  }

  function footstep(speed, material) {
    return emitFoley('step', Math.min(1, Math.abs(speed) / 220), material);
  }

  function land(speed, material, body = false) {
    return emitFoley(
      'land',
      Math.min(1, Math.max(0, (speed - 80) / 460) + (body ? 0.16 : 0)),
      material
    );
  }

  // --------------------------------------------------------------------------
  // Giao diện Âm thanh Kỹ năng (Phương án 1)
  // --------------------------------------------------------------------------

  function startChargeLoop(kind = 'fire') {
    unlock();
    stopChargeLoop();
    if (!isReady()) return false;

    const isLightning = kind === 'lightning';
    const v = serial++ % 2;
    playOneShot(
      getSkillBuffer(isLightning ? 'lightning_start' : 'fire_ignite', v),
      isLightning ? 0.62 : 0.66,
      isLightning ? 1.0 : 0.98 + (v % 2) * 0.04,
      { kind: isLightning ? 'lightning_start' : 'fire_ignite' }
    );

    try {
      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = getSkillBuffer(isLightning ? 'lightning_loop' : 'fire_loop', 0);
      source.loop = true;
      source.playbackRate.value = isLightning ? 0.94 : 0.88;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.setTargetAtTime(isLightning ? 0.24 : 0.26, now, 0.06);
      source.connect(gain);
      gain.connect(master);
      chargeVoice = { source, gain, kind };
      voices.add(chargeVoice);
      source.start(now + 0.01);
      return true;
    } catch {
      chargeVoice = null;
      return false;
    }
  }

  function updateChargeLoop(kind, chargeTime = 0, chargedSeconds = 0) {
    if (!chargeVoice || chargeVoice.kind !== kind || !context || context.state !== 'running') {
      return;
    }
    const now = context.currentTime;
    if (kind === 'fire') {
      const u = clamp(chargeTime / 14, 0, 1);
      const targetRate = 0.88 + u * 0.50;
      const targetGain = 0.25 + u * 0.34;
      chargeVoice.source.playbackRate.setTargetAtTime(targetRate, now, 0.04);
      chargeVoice.gain.gain.setTargetAtTime(targetGain, now, 0.04);
    } else if (kind === 'lightning') {
      const u = clamp(chargedSeconds / 10, 0, 1);
      const targetRate = 0.94 + u * 0.56;
      const targetGain = 0.24 + u * 0.32;
      chargeVoice.source.playbackRate.setTargetAtTime(targetRate, now, 0.04);
      chargeVoice.gain.gain.setTargetAtTime(targetGain, now, 0.04);
    }
  }

  function fireCast(chargeTime = 0) {
    stopChargeLoop();
    const u = clamp(chargeTime / 14, 0, 1);
    const v = serial++ % 2;
    return playOneShot(
      getSkillBuffer('fire_launch', v),
      0.66 + u * 0.26,
      1.08 - u * 0.22,
      { kind: 'fire_launch', chargeTime }
    );
  }

  function fireExplode(chargeTime = 0) {
    const u = clamp(chargeTime / 14, 0, 1);
    const v = serial++ % 2;
    return playOneShot(
      getSkillBuffer('fire_explode', v),
      0.74 + u * 0.32,
      1.12 - u * 0.30,
      { kind: 'fire_explode', chargeTime }
    );
  }

  function fireBurnTick() {
    if (!isReady()) return false;
    const now = context.currentTime;
    if (now - lastSizzle < 0.18) return false;
    lastSizzle = now;
    const v = serial++ % 3;
    return playOneShot(
      getSkillBuffer('fire_sizzle', v),
      0.32,
      0.94 + (v % 3) * 0.06,
      { kind: 'fire_sizzle' }
    );
  }

  function lightningRing(ringCount = 1) {
    const v = serial++ % 2;
    const rate = clamp(0.92 + Math.min(12, ringCount) * 0.055, 0.92, 1.65);
    return playOneShot(
      getSkillBuffer('lightning_ring', v),
      0.64 + Math.min(0.24, ringCount * 0.025),
      rate,
      { kind: 'lightning_ring', ringCount }
    );
  }

  function lightningStrike(chargedSeconds = 0) {
    stopChargeLoop();
    const u = clamp(chargedSeconds / 10, 0, 1);
    const v = serial++ % 2;
    return playOneShot(
      getSkillBuffer('lightning_ring', v),
      0.72 + u * 0.22,
      1.28 - u * 0.14,
      { kind: 'lightning_cast', chargedSeconds }
    );
  }

  function lightningThunder(chargedSeconds = 0) {
    const u = clamp(chargedSeconds / 10, 0, 1);
    const v = serial++ % 2;
    return playOneShot(
      getSkillBuffer('lightning_thunder', v),
      0.82 + u * 0.28,
      1.06 - u * 0.20,
      { kind: 'lightning_thunder', chargedSeconds }
    );
  }

  function earthActivate() {
    unlock();
    return playOneShot(getSkillBuffer('earth_activate', 0), 0.76, 1.0, {
      kind: 'earth_activate',
    });
  }

  function earthDisperse() {
    return playOneShot(getSkillBuffer('earth_disperse', 0), 0.64, 1.0, {
      kind: 'earth_disperse',
    });
  }

  function earthBlock(damage = 100) {
    const u = clamp(damage / 700, 0.12, 1);
    const v = serial++ % 3;
    return playOneShot(
      getSkillBuffer('earth_block', v),
      0.68 + u * 0.28,
      1.08 - u * 0.18,
      { kind: 'earth_block', damage }
    );
  }

  function earthBreak() {
    return playOneShot(getSkillBuffer('earth_shatter', 0), 0.92, 0.96, {
      kind: 'earth_shatter',
    });
  }

  function thanThucActivate() {
    unlock();
    return playOneShot(getSkillBuffer('than_thuc_on', 0), 0.72, 1.0, {
      kind: 'than_thuc_on',
    });
  }

  function thanThucDeactivate() {
    return playOneShot(getSkillBuffer('than_thuc_off', 0), 0.62, 1.0, {
      kind: 'than_thuc_off',
    });
  }

  function waterSeal() {
    unlock();
    const v = serial++ % 2;
    return playOneShot(getSkillBuffer('water_seal', v), 0.72, 1.0, {
      kind: 'water_seal',
    });
  }

  function waterRays() {
    return playOneShot(getSkillBuffer('water_rays', 0), 0.80, 1.0, {
      kind: 'water_rays',
    });
  }

  function waterImpact(swordIndex = 0) {
    const rate = swordIndex === 2 ? 0.88 : swordIndex === 1 ? 0.98 : 1.06;
    const gain = swordIndex === 2 ? 0.95 : 0.78;
    return playOneShot(getSkillBuffer('water_impact', swordIndex), gain, rate, {
      kind: 'water_impact',
      swordIndex,
    });
  }

  function fiveLaunch() {
    unlock();
    return playOneShot(getSkillBuffer('five_launch', 0), 0.82, 1.0, {
      kind: 'five_launch',
    });
  }

  function fiveForm() {
    return playOneShot(getSkillBuffer('five_form', 0), 0.86, 1.0, {
      kind: 'five_form',
    });
  }

  function fivePulse(pulseIndex = 0) {
    return playOneShot(getSkillBuffer('five_pulse', pulseIndex % 5), 0.42, 0.96 + (pulseIndex % 5) * 0.04, {
      kind: 'five_pulse',
      pulseIndex,
    });
  }

  function fiveConverge() {
    return playOneShot(getSkillBuffer('five_converge', 0), 0.84, 1.0, {
      kind: 'five_converge',
    });
  }

  function fiveBlast() {
    return playOneShot(getSkillBuffer('five_blast', 0), 0.98, 0.96, {
      kind: 'five_blast',
    });
  }

  // --------------------------------------------------------------------------
  // Âm thanh 5 Kỹ năng Ma Đạo (Huyết Dự)
  // --------------------------------------------------------------------------

  function bloodHandCast() {
    unlock();
    return playOneShot(getSkillBuffer('blood_hand_cast', 0), 0.78, 1.0, {
      kind: 'blood_hand_cast',
    });
  }

  function bloodHandFly() {
    return playOneShot(getSkillBuffer('blood_hand_fly', 0), 0.74, 1.0, {
      kind: 'blood_hand_fly',
    });
  }

  function bloodHandBurst() {
    return playOneShot(getSkillBuffer('blood_hand_burst', 0), 0.92, 1.0, {
      kind: 'blood_hand_burst',
    });
  }

  function bloodBleedTick() {
    if (!isReady()) return false;
    const now = context.currentTime;
    if (now - lastSizzle < 0.14) return false;
    lastSizzle = now;
    const v = serial++ % 3;
    return playOneShot(getSkillBuffer('blood_bleed_tick', v), 0.42, 0.96 + (v % 3) * 0.04, {
      kind: 'blood_bleed_tick',
    });
  }

  function startBloodThreadCharge() {
    unlock();
    stopBloodThreadCharge();
    if (!isReady()) return false;
    try {
      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = getSkillBuffer('blood_thread_charge', 0);
      source.loop = true;
      source.playbackRate.value = 0.92;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.setTargetAtTime(0.25, now, 0.05);
      source.connect(gain);
      gain.connect(master);
      bloodThreadVoice = { source, gain, kind: 'blood_thread' };
      voices.add(bloodThreadVoice);
      source.start(now + 0.01);
      return true;
    } catch {
      bloodThreadVoice = null;
      return false;
    }
  }

  function updateBloodThreadCharge(chargeTime = 0) {
    if (!bloodThreadVoice || !context || context.state !== 'running') return;
    const now = context.currentTime;
    const u = clamp(chargeTime / 10, 0, 1);
    const targetRate = 0.92 + u * 0.52;
    const targetGain = 0.25 + u * 0.35;
    bloodThreadVoice.source.playbackRate.setTargetAtTime(targetRate, now, 0.04);
    bloodThreadVoice.gain.gain.setTargetAtTime(targetGain, now, 0.04);
  }

  function bloodThreadRelease(shotCount = 10) {
    stopBloodThreadCharge();
    const v = serial++ % 3;
    return playOneShot(getSkillBuffer('blood_thread_release', v), 0.84, 1.0, {
      kind: 'blood_thread_release',
      shotCount,
    });
  }

  function bloodThreadHit(final = false) {
    const v = final ? 1 : 0;
    return playOneShot(
      getSkillBuffer('blood_thread_hit', v),
      final ? 0.94 : 0.62,
      final ? 0.95 : 1.05,
      { kind: 'blood_thread_hit', final }
    );
  }

  function bloodSiphonStart() {
    unlock();
    return playOneShot(getSkillBuffer('blood_siphon_start', 0), 0.76, 1.0, {
      kind: 'blood_siphon_start',
    });
  }

  function startBloodSiphonLoop() {
    unlock();
    stopBloodSiphonLoop();
    if (!isReady()) return false;
    try {
      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = getSkillBuffer('blood_siphon_loop', 0);
      source.loop = true;
      source.playbackRate.value = 1.0;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.setTargetAtTime(0.34, now, 0.08);
      source.connect(gain);
      gain.connect(master);
      bloodSiphonVoice = { source, gain, kind: 'blood_siphon' };
      voices.add(bloodSiphonVoice);
      source.start(now + 0.01);
      return true;
    } catch {
      bloodSiphonVoice = null;
      return false;
    }
  }

  function bloodSiphonDrain() {
    if (!isReady()) return false;
    const v = serial++ % 2;
    return playOneShot(getSkillBuffer('blood_siphon_drain', v), 0.52, 0.98 + v * 0.04, {
      kind: 'blood_siphon_drain',
    });
  }

  function bloodCataclysmSeal() {
    unlock();
    return playOneShot(getSkillBuffer('blood_cataclysm_seal', 0), 0.88, 1.0, {
      kind: 'blood_cataclysm_seal',
    });
  }

  function bloodCataclysmGather() {
    unlock();
    stopBloodCataclysmGather();
    if (!isReady()) return false;
    try {
      const now = context.currentTime;
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = getSkillBuffer('blood_cataclysm_gather', 0);
      source.loop = true;
      source.playbackRate.value = 0.95;
      gain.gain.setValueAtTime(0.01, now);
      gain.gain.setTargetAtTime(0.38, now, 0.1);
      source.connect(gain);
      gain.connect(master);
      bloodGatherVoice = { source, gain, kind: 'blood_gather' };
      voices.add(bloodGatherVoice);
      source.start(now + 0.01);
      return true;
    } catch {
      bloodGatherVoice = null;
      return false;
    }
  }

  function bloodCataclysmPinch() {
    stopBloodCataclysmGather();
    return playOneShot(getSkillBuffer('blood_cataclysm_pinch', 0), 0.72, 1.0, {
      kind: 'blood_cataclysm_pinch',
    });
  }

  function bloodCataclysmBlast() {
    stopBloodCataclysmGather();
    return playOneShot(getSkillBuffer('blood_cataclysm_blast', 0), 1.0, 0.96, {
      kind: 'blood_cataclysm_blast',
    });
  }

  function bloodShieldActivate() {
    unlock();
    return playOneShot(getSkillBuffer('blood_shield_activate', 0), 0.78, 1.0, {
      kind: 'blood_shield_activate',
    });
  }

  function bloodShieldBlock(damage = 100) {
    const u = clamp(damage / 700, 0.12, 1);
    const v = serial++ % 2;
    return playOneShot(
      getSkillBuffer('blood_shield_block', v),
      0.72 + u * 0.26,
      1.04 - u * 0.12,
      { kind: 'blood_shield_block', damage }
    );
  }

  function bloodShieldBreak() {
    return playOneShot(getSkillBuffer('blood_shield_break', 0), 0.94, 1.0, {
      kind: 'blood_shield_break',
    });
  }

  function bloodShieldDisperse() {
    return playOneShot(getSkillBuffer('blood_shield_disperse', 0), 0.65, 1.0, {
      kind: 'blood_shield_disperse',
    });
  }

  function change(enabled, volume) {
    settings.soundEnabled = !!enabled;
    settings.soundVolume = Math.max(0, Math.min(100, Number(volume) || 0));
    persist();
    sync();
    if (!settings.soundEnabled || settings.soundVolume <= 0) stopAll();
    else unlock();
  }

  return {
    restore,
    unlock,
    stopAll,
    stopChargeLoop,
    stopBloodThreadCharge,
    stopBloodSiphonLoop,
    stopBloodCataclysmGather,
    change,
    footstep,
    land,
    startChargeLoop,
    updateChargeLoop,
    fireCast,
    fireExplode,
    fireBurnTick,
    lightningRing,
    lightningStrike,
    lightningThunder,
    earthActivate,
    earthDisperse,
    earthBlock,
    earthBreak,
    thanThucActivate,
    thanThucDeactivate,
    waterSeal,
    waterRays,
    waterImpact,
    fiveLaunch,
    fiveForm,
    fivePulse,
    fiveConverge,
    fiveBlast,
    bloodHandCast,
    bloodHandFly,
    bloodHandBurst,
    bloodBleedTick,
    startBloodThreadCharge,
    updateBloodThreadCharge,
    bloodThreadRelease,
    bloodThreadHit,
    bloodSiphonStart,
    startBloodSiphonLoop,
    bloodSiphonDrain,
    bloodCataclysmSeal,
    bloodCataclysmGather,
    bloodCataclysmPinch,
    bloodCataclysmBlast,
    bloodShieldActivate,
    bloodShieldBlock,
    bloodShieldBreak,
    bloodShieldDisperse,
    status: () => ({
      enabled: settings.soundEnabled,
      volume: settings.soundVolume,
      state: context?.state || (unavailable ? 'unavailable' : 'locked'),
      buffers: buffers.size,
      voices: voices.size,
      chargingLoop:
        chargeVoice?.kind ||
        bloodThreadVoice?.kind ||
        bloodSiphonVoice?.kind ||
        bloodGatherVoice?.kind ||
        null,
      played: totalPlayed,
      lastEvent,
    }),
  };
}

export const actionAudio = makeActionAudio();
