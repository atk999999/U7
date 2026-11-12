// ============================================================================
// MODULE: CHARACTER & NPC (Nhân vật Diệp Tu, 17 Hoạt ảnh, Vật lý, Tàn ảnh & NPC)
// ============================================================================

import {
  $,
  clamp,
  CELL,
  WORLD_W,
  WORLD_H,
  CHAR_SCALE,
  GRAVITY,
  SPRITE_TEXTURE_SIZE,
  HERO_HALF,
  HERO_HEIGHT,
  NPC_HALF,
  NPC_HEIGHT,
  CONTACT_EPS,
  CLIPS,
  clipMap,
  settings,
  game,
  player,
  motion,
  camera,
  dummy,
  bossState,
  addCameraShake,
  triggerHitStop,
  showNotice,
  setFlightUI,
} from './state.js';
import { actionAudio } from './audio.js';
import { geoMaterial } from './map.js';
import {
  CAST_FRAME_RATE,
  getCharge,
  isThoThuanActive,
  castLocked,
  chargeFrame,
  abortCharge,
  receivePlayerDamage,
  fireThoThuanTestShot,
  fxEmit,
  fxDust,
  fxTakeoff,
  fxFlightStop,
  fxSeal,
  fxHit,
  stopHandSealFx,
  getHuyetThu,
  getHuyetKimTuyen,
  getThonLinhHuyet,
  getHuyetBao,
  HUYET_THU_SPEC,
} from './skills.js';

export const ACTION_TIME = {
  jump_prepare: 0.055,
  takeoff: 0.30,
  flight_stop: 0.13,
  land: 0.23,
  brake: 0.15,
  hand_seal: 0.64,
  hurt: 0.46,
  knockdown: 0.44,
  down_idle: 0.54,
  getup: 0.64,
  charge_recover: 0.24,
};

export const CODE_NPC_STATES = CLIPS.map(([id]) => id);
export const CODE_NPC_NAMES = {
  idle: 'ĐỨNG',
  walk: 'ĐI BỘ',
  run: 'CHẠY',
  jump_start: 'LẤY ĐÀ',
  jump_air: 'NHẢY',
  fall: 'RƠI',
  land: 'TIẾP ĐẤT',
  hand_seal: 'KẾT ẤN',
  hurt: 'TRÚNG ĐÒN',
  knockdown: 'NGÃ',
  down_idle: 'NẰM',
  getup: 'ĐỨNG DẬY',
  fly_up: 'CẤT CÁNH',
  hover: 'LƠ LỬNG',
  charge_raise: 'GIƠ TAY',
  charge_hold: 'TỤ LỰC',
  cast_fire: 'PHÓNG HỎA CẦU',
};

export const NPC_FRAME_RATE = {
  idle: 10,
  walk: 11,
  run: 16,
  jump_start: 8,
  jump_air: 9,
  fall: 13,
  land: 8,
  hand_seal: 10,
  hurt: 13,
  knockdown: 11,
  down_idle: 8,
  getup: 10,
  fly_up: 11,
  hover: 12,
  charge_raise: 12,
  charge_hold: 8,
  cast_fire: 14,
};

let afterimages = [];

const tintCanvas = document.createElement('canvas');
tintCanvas.width = SPRITE_TEXTURE_SIZE;
tintCanvas.height = SPRITE_TEXTURE_SIZE;
const tintCtx = tintCanvas.getContext('2d');

export const reactionLocked = () =>
  !!motion.action && ['hurt', 'knockdown', 'down_idle', 'getup'].includes(motion.action.name);

export function canMove() {
  const ht = getHuyetThu?.();
  const hkt = getHuyetKimTuyen?.();
  const tlh = getThonLinhHuyet?.();
  const hb = getHuyetBao?.();
  if (ht && ht.phase === 'cast') return false;
  if (hkt && hkt.phase === 'charge') return false;
  if (tlh && (tlh.phase === 'cast' || tlh.phase === 'drain')) return false;
  if (hb && ['seal', 'gather', 'pinch', 'blast'].includes(hb.phase)) return false;
  return (
    !getCharge() &&
    (!motion.action ||
      ['jump_prepare', 'takeoff', 'flight_stop', 'brake'].includes(motion.action.name))
  );
}

export function setAnim(anim, restart = false) {
  if (player.anim !== anim || restart) {
    player.anim = anim;
    player.animTime = 0;
  }
}

export function spawnAfterimage(color = null, alpha = 0.32, life = 0.18) {
  if (settings.fxQuality === 'off' || !game.images.idle) return;
  const pose = playerPose();
  const actualColor = color || (settings.character === 'huyet_du' ? '#ff3244' : '#7ce8ff');
  if (afterimages.length >= 7) afterimages.shift();
  afterimages.push({
    x: player.x,
    y: player.y + motion.bobOffset,
    facing: player.facing,
    lean: motion.lean,
    id: pose.id,
    f: pose.f,
    anchor: pose.anchor,
    scale: CHAR_SCALE * player.visualScale,
    squashX: motion.squashX,
    squashY: motion.squashY,
    color: actualColor,
    alpha,
    life,
    maxLife: life,
  });
}

export function updateAfterimages(dt) {
  for (let i = afterimages.length - 1; i >= 0; i--) {
    afterimages[i].life -= dt;
    if (afterimages[i].life <= 0) afterimages.splice(i, 1);
  }
}

export function startAction(name, extra = {}) {
  const old = motion.action;
  if (old?.name === 'hand_seal') stopHandSealFx();
  motion.action = { name, time: 0, duration: ACTION_TIME[name], face: player.facing, ...extra };
  if (
    !['jump_prepare', 'takeoff', 'flight_stop', 'land', 'hurt', 'knockdown', 'brake'].includes(
      name
    )
  ) {
    player.vx = 0;
  }
  if (name === 'jump_prepare') {
    motion.squashX = 1.065;
    motion.squashY = 0.925;
  } else if (name === 'takeoff') {
    motion.squashX = 0.935;
    motion.squashY = 1.07;
    spawnAfterimage('#7ce8ff', 0.34, 0.20);
  } else if (name === 'brake') {
    motion.squashX = 1.035;
    motion.squashY = 0.965;
  }
  setAnim(
    name === 'jump_prepare'
      ? 'jump_start'
      : name === 'takeoff'
      ? 'fly_up'
      : name === 'flight_stop'
      ? 'fall'
      : name === 'brake'
      ? 'land'
      : name === 'charge_recover'
      ? 'charge_raise'
      : name,
    true
  );
}

export function finishAction() {
  if (motion.action?.name === 'hand_seal') stopHandSealFx();
  motion.action = null;
}

export function resetMotion() {
  Object.assign(motion, {
    action: null,
    jumpBuffer: 0,
    coyote: 0.10,
    gait: 0,
    lastFoot: -1,
    mode: 'idle',
    lean: 0,
    squashX: 1,
    squashY: 1,
    bobOffset: 0,
    afterimageTimer: 0,
    airTime: 0,
    landingSpeed: 0,
  });
  afterimages = [];
  player.flash = 0;
  player.forceAnim = '';
  player.forceTime = 0;
  player.demo = null;
}

export function launchJump() {
  finishAction();
  motion.jumpBuffer = 0;
  motion.coyote = 0;
  motion.airTime = 0;
  player.vy = -485;
  player.grounded = false;
  player.jumpTime = 0;
  motion.squashX = 0.915;
  motion.squashY = 1.095;
  spawnAfterimage('#8be8ff', 0.30, 0.18);
  setAnim('jump_start', true);
  fxDust('groundBurst', player.x, player.y, 0.68);
}

export function updateAction(dt) {
  const a = motion.action;
  if (!a) return;
  a.time += dt;
  if (a.name === 'knockdown') {
    if (player.grounded) {
      if (a.groundAt === undefined) a.groundAt = a.time;
      if (a.time >= Math.max(a.duration, a.groundAt + 0.19)) startAction('down_idle');
    }
    return;
  }
  if (a.time < a.duration) return;
  if (a.name === 'jump_prepare') {
    if (player.grounded || motion.coyote > 0) launchJump();
    else finishAction();
  } else if (a.name === 'down_idle') {
    startAction('getup');
  } else {
    finishAction();
  }
}

export function landCharacter(speed) {
  actionAudio.land(speed, geoMaterial(player.x, player.y), motion.action?.name === 'knockdown');
  motion.landingSpeed = speed;
  motion.airTime = 0;
  const compression = clamp(speed / 520, 0.035, 0.125);
  motion.squashX = 1 + compression * 0.78;
  motion.squashY = 1 - compression;
  if (speed > 340) addCameraShake(clamp((speed - 300) / 110, 1.2, 3.4), 0.13);
  if (motion.jumpBuffer > 0) motion.jumpBuffer = Math.max(motion.jumpBuffer, 0.15);
  if (motion.action?.name === 'knockdown') {
    motion.action.groundAt = motion.action.time;
    player.vx *= 0.45;
  } else if (!getCharge() && !reactionLocked() && motion.action?.name !== 'hand_seal') {
    startAction('land', { duration: speed > 440 ? 0.32 : 0.23 });
  }
  if (speed > 85) fxDust('groundBurst', player.x, player.y, Math.min(1.85, 0.35 + speed / 430));
}

export function tryBufferedJump() {
  if (motion.jumpBuffer <= 0 || player.flying || getCharge() || reactionLocked()) return;
  const a = motion.action;
  if (a && !(a.name === 'land' && a.time >= 0.10) && a.name !== 'brake') return;
  if (player.grounded) {
    if (a?.name === 'land') launchJump();
    else {
      motion.jumpBuffer = 0;
      startAction('jump_prepare');
    }
  } else if (motion.coyote > 0) {
    launchJump();
  }
}

export function toggleFlight() {
  if (
    !game.running ||
    reactionLocked() ||
    castLocked() ||
    (motion.action &&
      !['takeoff', 'flight_stop', 'brake', 'land', 'charge_recover'].includes(motion.action.name))
  ) {
    return;
  }
  abortCharge();
  finishAction();
  motion.jumpBuffer = 0;
  motion.coyote = 0;
  player.flying = !player.flying;
  player.jumpTime = 999;
  if (player.flying) {
    player.grounded = false;
    player.y -= 3;
    player.vy = -95;
    startAction('takeoff');
    fxTakeoff();
  } else {
    fxFlightStop();
    player.vy = Math.max(45, player.vy);
    player.grounded = false;
    startAction('flight_stop');
  }
  setFlightUI();
  showNotice(
    player.flying
      ? 'Đang BAY: kéo vòng trái lên/xuống để thay độ cao'
      : 'Đã tắt BAY: Diệp Tu rơi tự do'
  );
}

export function jump() {
  if (!game.running || player.flying || reactionLocked() || castLocked()) return;
  if (getCharge()) {
    if (!player.grounded && motion.coyote <= 0) return;
    abortCharge();
  }
  motion.jumpBuffer = 0.16;
  tryBufferedJump();
}

export function selectPlayerAnimation(dt, dx, axis, slow) {
  const a = motion.action;
  const charge = getCharge();
  const ht = getHuyetThu?.();
  const hkt = getHuyetKimTuyen?.();
  const tlh = getThonLinhHuyet?.();
  let mode;
  if (charge) {
    mode =
      charge.phase === 'cast'
        ? 'cast_fire'
        : charge.phase === 'hold' && (charge.aimFrame ?? 7) >= 7
        ? 'charge_hold'
        : 'charge_raise';
  } else if (hkt && hkt.phase === 'charge') {
    mode = hkt.chargeTime >= 0.35 ? 'charge_hold' : 'charge_raise';
  } else if (hkt && hkt.phase === 'release' && hkt.elapsed < 0.32) {
    mode = 'cast_fire';
  } else if (ht && ht.phase === 'cast') {
    mode = 'hand_seal';
  } else if (tlh && tlh.phase === 'drain') {
    mode = 'charge_hold';
  } else if (a) {
    mode =
      a.name === 'jump_prepare'
        ? 'jump_start'
        : a.name === 'takeoff'
        ? 'fly_up'
        : a.name === 'flight_stop'
        ? 'fall'
        : a.name === 'brake'
        ? 'land'
        : a.name === 'charge_recover'
        ? 'charge_raise'
        : a.name;
  } else if (player.flying) {
    mode = player.vy < -45 ? 'fly_up' : 'hover';
  } else if (!player.grounded) {
    mode =
      player.jumpTime < 0.105 && player.vy < 0 ? 'jump_start' : player.vy < 0 ? 'jump_air' : 'fall';
  } else if (Math.abs(dx) > 0.025) {
    const fast = !slow && Math.abs(player.vx) > (player.anim === 'run' ? 150 : 175);
    mode = fast ? 'run' : 'walk';
  } else {
    mode = 'idle';
  }

  setAnim(mode);
  player.animTime += dt;

  motion.mode = charge
    ? charge.phase === 'cast'
      ? 'cast'
      : 'charge'
    : hkt && hkt.phase === 'charge'
    ? 'charge'
    : hkt && hkt.phase === 'release' && hkt.elapsed < 0.32
    ? 'cast'
    : ht && ht.phase === 'cast'
    ? 'hand_seal'
    : a?.name ||
      (player.flying
        ? player.vy < -45
          ? 'fly_up'
          : player.vy > 45
          ? 'fly_down'
          : Math.abs(player.vx) > 20
          ? 'fly_move'
          : 'hover'
        : axis && player.vx * axis < 0
        ? 'turn'
        : mode);

  if (mode === 'walk' || mode === 'run') {
    const stride = mode === 'run' ? 88 : 50;
    const before = Math.floor(motion.gait / 4);
    motion.gait += (Math.abs(dx) / stride) * 8;
    const after = Math.floor(motion.gait / 4);
    if (after !== before && player.grounded) {
      fxDust('footsteps', player.x - player.facing * 5, player.y, mode === 'run' ? 1.02 : 0.52);
      actionAudio.footstep(player.vx, geoMaterial(player.x, player.y));
      motion.lastFoot = after;
    }
  } else if (mode === 'idle') {
    motion.gait = 0;
    motion.lastFoot = -1;
  }

  // Nội suy mượt tỷ lệ hiển thị giữa các dải sprite
  const targetScale = mode === 'fly_up' ? 1.10 : mode === 'hover' ? 0.97 : 1;
  const scaleEase = 1 - Math.exp(-dt * 14);
  player.visualScale += (targetScale - player.visualScale) * scaleEase;
  if (Math.abs(targetScale - player.visualScale) < 0.001) player.visualScale = targetScale;

  // Hồi biến dạng đàn hồi (Squash & Stretch) về 1.0
  const squashEase = 1 - Math.exp(-dt * 16);
  motion.squashX += (1 - motion.squashX) * squashEase;
  motion.squashY += (1 - motion.squashY) * squashEase;

  // Nhịp lơ lửng khi ngự không (chỉ hiển thị)
  const canBob =
    player.flying &&
    !charge &&
    !reactionLocked() &&
    a?.name !== 'hand_seal' &&
    !(ht && ht.phase === 'cast') &&
    !(hkt && hkt.phase === 'charge');
  const flightSpeedRatio = clamp(Math.hypot(player.vx, player.vy) / 310, 0, 0.65);
  const targetBob = canBob ? Math.sin(game.elapsed * 3.1) * 3.4 * (1 - flightSpeedRatio) : 0;
  motion.bobOffset += (targetBob - motion.bobOffset) * (1 - Math.exp(-dt * 10));

  // Nghiêng thân người theo góc ngắm tụ lực, quán tính bay, chạy nhanh hoặc phanh gấp
  let desiredLean = 0;
  if (charge && !reactionLocked()) {
    desiredLean = clamp((charge.aimPitch || 0) * 0.16, -0.075, 0.11);
  } else if (hkt && hkt.phase === 'charge' && !reactionLocked()) {
    desiredLean = 0.045;
  } else if (!charge && a?.name !== 'hand_seal' && !(ht && ht.phase === 'cast') && !reactionLocked()) {
    if (player.flying) {
      desiredLean =
        clamp((player.vx * player.facing) / 285, -1, 1) * 0.078 +
        clamp(player.vy / 340, -0.4, 0.4) * 0.022;
    } else if (a?.name === 'brake') {
      desiredLean = -0.045;
    } else if (mode === 'run') {
      desiredLean = clamp((player.vx * player.facing) / 285, -1, 1) * 0.038;
    }
  }
  motion.lean += (desiredLean - motion.lean) * (1 - Math.exp(-dt * 12));

  // Phát tàn ảnh khi bay nhanh hoặc nhảy tốc độ cao
  motion.afterimageTimer = Math.max(0, motion.afterimageTimer - dt);
  const totalSpeed = Math.hypot(player.vx, player.vy);
  if (
    motion.afterimageTimer <= 0 &&
    ((player.flying && totalSpeed > 235) || (!player.grounded && totalSpeed > 440))
  ) {
    motion.afterimageTimer = 0.055;
    spawnAfterimage(player.flying ? '#7ce8ff' : '#a8efff', 0.26, 0.16);
  }
}

export function playerPose() {
  let id = player.anim;
  let f = 0;
  let anchor = 238;
  const clip = clipMap[id] || clipMap.idle;
  const a = motion.action;
  const charge = getCharge();
  const ht = getHuyetThu?.();
  const hkt = getHuyetKimTuyen?.();
  const tlh = getThonLinhHuyet?.();

  if (charge) {
    if (charge.phase === 'cast') {
      id = 'cast_fire';
      f = Math.min(11, Math.floor(charge.castTime * CAST_FRAME_RATE));
    } else if (charge.phase === 'hold' && (charge.aimFrame ?? 7) >= 7) {
      id = 'charge_hold';
      f = Math.floor(player.animTime * 10) % 4;
    } else {
      id = 'charge_raise';
      f = chargeFrame();
    }
  } else if (hkt && hkt.phase === 'charge') {
    if (hkt.chargeTime < 0.35) {
      id = 'charge_raise';
      f = Math.min(7, Math.floor((hkt.chargeTime / 0.35) * 8));
    } else {
      id = 'charge_hold';
      f = Math.floor(player.animTime * 10) % 4;
    }
  } else if (hkt && hkt.phase === 'release' && hkt.elapsed < 0.32) {
    id = 'cast_fire';
    const releaseU = clamp(hkt.elapsed / 0.32, 0, 1);
    f = Math.min(11, 6 + Math.floor(releaseU * 6));
  } else if (ht && ht.phase === 'cast') {
    id = 'hand_seal';
    const castProgress = clamp(ht.castTime / (HUYET_THU_SPEC?.castSeconds || 0.7), 0, 0.99999);
    f = Math.min(7, Math.floor(castProgress * 8));
  } else if (tlh && tlh.phase === 'drain') {
    id = 'charge_hold';
    f = Math.floor(player.animTime * 10) % 4;
  } else if (a) {
    const u = clamp(a.time / a.duration, 0, 0.99999);
    switch (a.name) {
      case 'jump_prepare':
        id = 'jump_start';
        f = 0;
        break;
      case 'takeoff':
        id = 'fly_up';
        f = Math.min(5, Math.floor(u * 6));
        break;
      case 'flight_stop':
        id = 'fall';
        f = Math.min(2, Math.floor(u * 3));
        break;
      case 'brake':
        id = 'land';
        f = a.time < 0.065 ? 1 : 2;
        break;
      case 'land':
        id = 'land';
        f = u < 0.18 ? 0 : u < 0.68 ? 1 : 2;
        break;
      case 'hand_seal':
        id = 'hand_seal';
        f =
          a.duration > 1.0
            ? a.time < 0.25
              ? Math.min(3, Math.floor((a.time / 0.25) * 4))
              : 3 + (Math.floor((a.time - 0.25) * 9) % 5)
            : Math.min(7, Math.floor(u * 8));
        break;
      case 'hurt':
        id = 'hurt';
        f = [1, 2, 3, 3, 4, 5, 6, 7][Math.min(7, Math.floor(u * 8))];
        break;
      case 'knockdown':
        id = 'knockdown';
        f =
          a.groundAt === undefined
            ? Math.min(4, Math.floor(a.time * 16))
            : Math.min(7, 5 + Math.floor((a.time - a.groundAt) / 0.065));
        break;
      case 'down_idle':
        id = 'knockdown';
        f = 7;
        break;
      case 'getup': {
        const frames = [
          ['knockdown', 7],
          ['getup', 0],
          ['getup', 0],
          ['getup', 1],
          ['getup', 2],
          ['getup', 3],
          ['getup', 4],
          ['getup', 5],
          ['getup', 6],
          ['getup', 7],
        ];
        [id, f] = frames[Math.min(9, Math.floor(u * 10))];
        break;
      }
      case 'charge_recover':
        id = 'charge_raise';
        f = Math.max(0, Math.round(a.fromFrame * (1 - u)));
        break;
    }
  } else if (id === 'walk' || id === 'run') {
    f = Math.floor(motion.gait) % 8;
  } else if (id === 'jump_start') {
    f = player.jumpTime < 0.05 ? 1 : 2;
  } else if (id === 'jump_air') {
    if (player.vy < -110) {
      id = 'jump_air';
      f = player.vy < -310 ? 0 : player.vy < -200 ? 1 : 2;
    } else {
      id = 'fall';
      f = player.vy < -45 ? 0 : 1;
    }
  } else if (id === 'fly_up') {
    f = [2, 3, 4, 5, 4, 3][Math.floor(player.animTime * 12) % 6];
  } else if (id === 'hover' && player.flying && player.vy > 50) {
    id = 'fall';
    f = [0, 1, 2, 1][Math.floor(player.animTime * 8) % 4];
  } else {
    const rate = id === 'idle' ? 10 : id === 'hover' ? 12 : 16;
    f = Math.floor(player.animTime * rate);
    f = clip.loop ? f % clip.frames : Math.min(f, clip.frames - 1);
  }

  if (id === 'jump_start') anchor = [238, 234, 221][f];
  if (id === 'jump_air') anchor = [213, 200, 210][f];
  if (id === 'fall') anchor = [233, 233, 234, 234, 233, 233, 233, 233][f];
  return { id, f, anchor };
}

export function atlasAnchor(id, f) {
  if (id === 'jump_start') return [238, 234, 221][f] || 238;
  if (id === 'jump_air') return [213, 200, 210][f] || 238;
  if (id === 'fall') return [233, 233, 234, 234, 233, 233, 233, 233][f] || 238;
  return 238;
}

// Buffer xử lý sắc thái cho Huyết Dự (Tóc đỏ, Áo đen, Viền huyết quang)
const huyetDuCanvas = document.createElement('canvas');
huyetDuCanvas.width = SPRITE_TEXTURE_SIZE;
huyetDuCanvas.height = SPRITE_TEXTURE_SIZE;
const huyetDuCtx = huyetDuCanvas.getContext('2d', { willReadFrequently: true });

// Bộ nhớ cache khung hình đã shader hóa của Huyết Dự để giữ mượt tuyệt đối 60 FPS
const huyetDuFrameCache = new Map();

function getHuyetDuFrameCanvas(clipId, frameIndex) {
  const cacheKey = `${clipId}_${frameIndex}`;
  if (huyetDuFrameCache.has(cacheKey)) {
    return huyetDuFrameCache.get(cacheKey);
  }

  const clip = clipMap[clipId] || clipMap.idle;
  const candidate = game.images['huyet_du_' + clip.id];
  const customSheet = candidate && candidate.naturalWidth === clip.frames * SPRITE_TEXTURE_SIZE && candidate.naturalHeight === SPRITE_TEXTURE_SIZE ? candidate : null;
  const img = customSheet || game.images[clip.id];
  if (!img) return null;

  if (customSheet) {
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = SPRITE_TEXTURE_SIZE;
    frameCanvas.height = SPRITE_TEXTURE_SIZE;
    const frameCtx = frameCanvas.getContext('2d');
    frameCtx.drawImage(img, frameIndex * SPRITE_TEXTURE_SIZE, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE, 0, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE);
    huyetDuFrameCache.set(cacheKey, frameCanvas);
    return frameCanvas;
  }

  huyetDuCtx.clearRect(0, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE);
  huyetDuCtx.drawImage(
    img,
    frameIndex * SPRITE_TEXTURE_SIZE,
    0,
    SPRITE_TEXTURE_SIZE,
    SPRITE_TEXTURE_SIZE,
    0,
    0,
    SPRITE_TEXTURE_SIZE,
    SPRITE_TEXTURE_SIZE
  );

  const imgData = huyetDuCtx.getImageData(0, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE);
  const d = imgData.data;
  const len = d.length;

  for (let i = 0; i < len; i += 4) {
    const a = d[i + 3];
    if (a < 8) continue;

    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    // Phát hiện màu da mặt / tay: (R cao, G vừa, B thấp, R > G + 20) -> Giữ nguyên màu da thịt tự nhiên
    const isSkin = r > 165 && g > 115 && b > 85 && r > g + 15 && g > b;
    if (isSkin) {
      continue;
    }

    // Phát hiện mái tóc của Diệp Tu (Nâu sẫm, nâu nhạt, hạt dẻ):
    // R > 45 && R < 165, B < 120, R > B + 12 -> Đổi sang Tóc Đỏ Huyết Diễm Ma Đạo
    const isHair = (r > 38 && r < 165 && b < 135 && r >= g && r > b + 8) ||
                  (r > 130 && r < 190 && g > 70 && g < 140 && b < 100);
    if (isHair) {
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      // Tóc đỏ rực: đỏ thẫm ở chân tóc, đỏ rực ở thân và highlight cam đỏ ở ngọn
      d[i] = Math.min(255, Math.round(180 + lum * 75));
      d[i + 1] = Math.round(lum * lum * 55);
      d[i + 2] = Math.round(15 + lum * 40);
      continue;
    }

    // Phát hiện y phục áo lam / xanh / trắng ngọc của Diệp Tu:
    // Chuyển thành Huyền Hắc Bào (Áo đen tuyền) viền huyết quang
    const isRobe = (b > r + 8 && b > 60) || (g > r + 8 && g > 60) || (r > 160 && g > 160 && b > 160);
    if (isRobe) {
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      if (lum > 0.72) {
        // Viền áo / nẹp áo / đai lưng: chuyển thành viền Huyết Ngọc ma đạo rực sáng
        d[i] = Math.min(255, Math.round(210 + lum * 45));
        d[i + 1] = Math.round(22 + lum * 28);
        d[i + 2] = Math.round(30 + lum * 35);
      } else {
        // Thân áo bào: chuyển thành Dạ Hành Hắc Bào màu than chì / hắc ngọc đậm
        const dark = Math.round(12 + lum * 32);
        d[i] = dark + 4;
        d[i + 1] = dark;
        d[i + 2] = dark + 6;
      }
      continue;
    }

    // Các phần viền áo tối hoặc nếp gấp áo: chuyển sang tông hắc sắc viền đỏ
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    if (lum < 0.35) {
      d[i] = Math.round(r * 0.6 + 18);
      d[i + 1] = Math.round(g * 0.25);
      d[i + 2] = Math.round(b * 0.25);
    }
  }

  const cachedCanvas = document.createElement('canvas');
  cachedCanvas.width = SPRITE_TEXTURE_SIZE;
  cachedCanvas.height = SPRITE_TEXTURE_SIZE;
  const cCtx = cachedCanvas.getContext('2d');
  cCtx.putImageData(imgData, 0, 0);

  huyetDuFrameCache.set(cacheKey, cachedCanvas);
  return cachedCanvas;
}

export function drawAtlasFrame(id, f, scale, anchor, customSkin = settings.character) {
  const ctx = game.ctx;
  if (!ctx) return false;
  const clip = clipMap[id] || clipMap.idle;
  const frame = Math.max(0, Math.min(clip.frames - 1, f | 0));

  if (customSkin === 'huyet_du') {
    const cached = getHuyetDuFrameCanvas(clip.id, frame);
    if (cached) {
      ctx.drawImage(
        cached,
        0,
        0,
        SPRITE_TEXTURE_SIZE,
        SPRITE_TEXTURE_SIZE,
        -128 * scale,
        -anchor * scale,
        256 * scale,
        256 * scale
      );
      return true;
    }
  }

  const img = game.images[clip.id];
  if (!img) return false;
  ctx.drawImage(
    img,
    frame * SPRITE_TEXTURE_SIZE,
    0,
    SPRITE_TEXTURE_SIZE,
    SPRITE_TEXTURE_SIZE,
    -128 * scale,
    -anchor * scale,
    256 * scale,
    256 * scale
  );
  return true;
}

export function drawTintedAtlasFrame(id, f, scale, anchor, color = '#fff2b2', alpha = 0.55, customSkin = settings.character) {
  const ctx = game.ctx;
  if (!ctx || alpha <= 0.01 || !tintCtx) return false;
  const clip = clipMap[id] || clipMap.idle;
  const frame = Math.max(0, Math.min(clip.frames - 1, f | 0));

  let sourceToTint = null;
  let customFrame = false;
  if (customSkin === 'huyet_du') {
    sourceToTint = getHuyetDuFrameCanvas(clip.id, frame);
    customFrame = !!sourceToTint;
  }
  if (!sourceToTint) {
    sourceToTint = game.images[clip.id];
  }
  if (!sourceToTint) return false;

  tintCtx.clearRect(0, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE);
  tintCtx.globalCompositeOperation = 'source-over';
  if (customFrame) {
    tintCtx.drawImage(sourceToTint, 0, 0);
  } else {
    tintCtx.drawImage(
      sourceToTint,
      frame * SPRITE_TEXTURE_SIZE,
      0,
      SPRITE_TEXTURE_SIZE,
      SPRITE_TEXTURE_SIZE,
      0,
      0,
      SPRITE_TEXTURE_SIZE,
      SPRITE_TEXTURE_SIZE
    );
  }
  tintCtx.globalCompositeOperation = 'source-in';
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, SPRITE_TEXTURE_SIZE, SPRITE_TEXTURE_SIZE);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(
    tintCanvas,
    0,
    0,
    SPRITE_TEXTURE_SIZE,
    SPRITE_TEXTURE_SIZE,
    -128 * scale,
    -anchor * scale,
    256 * scale,
    256 * scale
  );
  ctx.restore();
  return true;
}

export function drawAfterimages() {
  const ctx = game.ctx;
  if (!ctx || !afterimages.length || settings.fxQuality === 'off') return;
  for (const g of afterimages) {
    const px = g.x - camera.x + game.viewW / 2;
    const py = g.y - camera.y + game.viewH / 2;
    const ratio = clamp(g.life / g.maxLife, 0, 1);
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (g.facing < 0) ctx.scale(-1, 1);
    ctx.rotate(g.lean);
    ctx.scale(g.squashX || 1, g.squashY || 1);
    ctx.imageSmoothingEnabled = false;
    drawTintedAtlasFrame(g.id, g.f, g.scale, g.anchor, g.color, g.alpha * ratio * ratio);
    ctx.restore();
  }
}

export function drawPlayer() {
  const ctx = game.ctx;
  if (!ctx || !game.images.idle) return;
  const pose = playerPose();
  const px = player.x - camera.x + game.viewW / 2;
  const py = player.y + (motion.bobOffset || 0) - camera.y + game.viewH / 2;
  const scale = CHAR_SCALE * player.visualScale;

  ctx.save();
  ctx.translate(Math.round(px), Math.round(py));
  if (player.facing < 0) ctx.scale(-1, 1);
  ctx.rotate(motion.lean);
  if (motion.squashX && motion.squashY) ctx.scale(motion.squashX, motion.squashY);
  ctx.imageSmoothingEnabled = false;
  drawAtlasFrame(pose.id, pose.f, scale, pose.anchor);
  if (player.flash > 0) {
    drawTintedAtlasFrame(
      pose.id,
      pose.f,
      scale,
      pose.anchor,
      '#fff2b2',
      Math.min(0.65, player.flash * 2.8)
    );
  }
  ctx.restore();
}

export function applyUnblockedPlayerHit(kind = 'hurt') {
  if (!game.running || reactionLocked()) return false;
  abortCharge();
  finishAction();
  motion.jumpBuffer = 0;
  motion.coyote = 0;

  if (kind === 'hurt') {
    startAction('hurt');
    player.vx = -player.facing * 82;
    player.flash = 0.20;
    motion.squashX = 1.065;
    motion.squashY = 0.935;
    addCameraShake(2.2, 0.13);
    fxHit();
  } else {
    if (player.flying) {
      player.flying = false;
      fxFlightStop();
      setFlightUI();
    }
    startAction('knockdown');
    player.vx = -player.facing * 140;
    player.flash = 0.24;
    motion.squashX = 1.08;
    motion.squashY = 0.92;
    addCameraShake(3.6, 0.18);
    triggerHitStop(0.028);
    player.vy = player.grounded ? -125 : Math.max(75, player.vy);
    player.grounded = false;
    fxHit();
  }
  return true;
}

export function testAction(kind) {
  if (!game.running) return false;
  if (kind === 'shield_atk') {
    return fireThoThuanTestShot();
  }
  if (reactionLocked()) return false;
  if (!['seal', 'hurt', 'knockdown'].includes(kind)) return false;
  if (kind === 'seal') {
    if (getCharge() || motion.action) return false;
    abortCharge();
    finishAction();
    motion.jumpBuffer = 0;
    motion.coyote = 0;
    startAction('hand_seal');
    fxSeal();
    return true;
  }

  const dmg = kind === 'knockdown' ? 300 : 100;
  if (isThoThuanActive()) {
    const res = receivePlayerDamage(dmg);
    if (res.blocked > 0) return true;
  }

  receivePlayerDamage(dmg, { notice: false });
  return applyUnblockedPlayerHit(kind);
}

// ----------------------------------------------------------------------------
// Hệ thống NPC mục tiêu (Diệp Tu WebP) & Va chạm giữa 2 nhân vật
// ----------------------------------------------------------------------------

export function npcShape() {
  const down = dummy.demoTimer > 0 && dummy.demoAction === 'knockdown';
  return { half: down ? 48 : NPC_HALF, height: down ? 39 : NPC_HEIGHT };
}

export function npcEnabled() {
  return dummy.visible !== false && !dummy.broken;
}

export function npcWidthOverlap(x) {
  return npcEnabled() && Math.abs(x - dummy.x) < HERO_HALF + npcShape().half - CONTACT_EPS;
}

export function npcBodyOverlap(x, y) {
  if (!npcWidthOverlap(x)) return false;
  const top = dummy.y - npcShape().height;
  return y > top + CONTACT_EPS && y - HERO_HEIGHT < dummy.y - CONTACT_EPS;
}

export function npcFeetSupport(x, y) {
  return npcWidthOverlap(x) && Math.abs(y - (dummy.y - npcShape().height)) < 1.25;
}

export function npcLanding(x, previousFoot, nextFoot) {
  if (!npcWidthOverlap(x)) return false;
  const top = dummy.y - npcShape().height;
  return previousFoot <= top + CONTACT_EPS && nextFoot >= top - CONTACT_EPS;
}

export function npcHeadContact(x, previousHead, nextHead) {
  return (
    npcWidthOverlap(x) &&
    previousHead >= dummy.y - CONTACT_EPS &&
    nextHead <= dummy.y + CONTACT_EPS
  );
}

export function npcCanStandOnPlayer(x, previousFoot, nextFoot) {
  const top = player.y - HERO_HEIGHT;
  return (
    npcEnabled() &&
    Math.abs(x - player.x) < HERO_HALF + npcShape().half - CONTACT_EPS &&
    previousFoot <= top + CONTACT_EPS &&
    nextFoot >= top - CONTACT_EPS
  );
}

const collideX = (x, y) => {
  const terrain = game.terrain;
  if (!terrain) return false;
  return (
    terrain.solid(x - 17, y - 7) ||
    terrain.solid(x + 17, y - 7) ||
    terrain.solid(x - 17, y - 55) ||
    terrain.solid(x + 17, y - 55) ||
    terrain.solid(x - 17, y - 99) ||
    terrain.solid(x + 17, y - 99)
  );
};

export function moveBody(dx, dy) {
  const terrain = game.terrain;
  if (!terrain) return;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
  const xstep = dx / steps;
  const ystep = dy / steps;
  let landingSpeed = 0;

  const terrainSupport = (x, y) =>
    terrain.solid(x - 12, y + 1) || terrain.solid(x + 12, y + 1) || terrain.solid(x, y + 1);
  const support = (x, y) => terrainSupport(x, y) || npcFeetSupport(x, y);

  for (let i = 0; i < steps; i++) {
    const wasGrounded = player.grounded;
    const x = player.x + xstep;
    let nextX = player.x;
    let nextY = player.y;

    if (x > 19 && x < WORLD_W - 19 && !collideX(x, nextY)) {
      nextX = x;
    } else if (wasGrounded && x > 19 && x < WORLD_W - 19) {
      let stepped = false;
      for (let rise = 2; rise <= 20; rise += 2) {
        if (!collideX(x, nextY - rise)) {
          nextX = x;
          nextY -= rise;
          stepped = true;
          break;
        }
      }
      if (!stepped) player.vx = 0;
    } else {
      player.vx = 0;
    }

    if (npcBodyOverlap(nextX, nextY)) {
      if (xstep > 0) nextX = Math.min(player.x, dummy.x - (HERO_HALF + npcShape().half));
      else if (xstep < 0) nextX = Math.max(player.x, dummy.x + (HERO_HALF + npcShape().half));
      else nextX = player.x;
      if (collideX(nextX, player.y)) nextX = player.x;
      nextY = player.y;
      player.vx = 0;
    }

    player.x = nextX;
    player.y = nextY;

    if (wasGrounded && !player.flying && ystep >= 0 && !support(player.x, player.y)) {
      let snap = 0;
      for (let d = 1; d <= 20; d++) {
        if (support(player.x, player.y + d)) {
          snap = d;
          break;
        }
      }
      if (snap) {
        if (
          npcLanding(player.x, player.y, player.y + snap) &&
          !terrainSupport(player.x, player.y + snap)
        ) {
          player.y = dummy.y - npcShape().height;
        } else {
          player.y = Math.floor((player.y + snap + 1) / CELL) * CELL - 1;
        }
        player.vy = 0;
      } else {
        player.grounded = false;
      }
    }

    const previousY = player.y;
    const y = previousY + ystep;
    if (ystep >= 0) {
      if (npcLanding(player.x, previousY, y)) {
        if (!player.grounded && player.vy > 85) landingSpeed = Math.max(landingSpeed, player.vy);
        player.y = dummy.y - npcShape().height;
        player.vy = 0;
        player.grounded = true;
        if (player.flying) {
          player.flying = false;
          fxFlightStop();
          setFlightUI();
          landingSpeed = Math.max(landingSpeed, 90);
        }
      } else if (terrainSupport(player.x, y)) {
        if (!player.grounded && player.vy > 85) landingSpeed = Math.max(landingSpeed, player.vy);
        player.y = Math.floor((y + 1) / CELL) * CELL - 1;
        player.vy = 0;
        player.grounded = true;
        if (player.flying) {
          player.flying = false;
          fxFlightStop();
          setFlightUI();
          landingSpeed = Math.max(landingSpeed, 90);
        }
      } else {
        player.y = y;
        player.grounded = false;
      }
    } else if (npcHeadContact(player.x, previousY - HERO_HEIGHT, y - HERO_HEIGHT)) {
      player.y = dummy.y + HERO_HEIGHT;
      player.vy = Math.max(0, player.vy);
      player.grounded = false;
    } else if (
      terrain.solid(player.x - 12, y - 100) ||
      terrain.solid(player.x + 12, y - 100) ||
      terrain.solid(player.x, y - 100)
    ) {
      player.vy = Math.max(0, player.vy);
    } else {
      player.y = y;
      player.grounded = false;
    }
  }

  if (landingSpeed) landCharacter(landingSpeed);
  player.x = clamp(player.x, 20, WORLD_W - 20);
  player.y = clamp(player.y, -1400, WORLD_H - 20);
}

export function cycleCodeNpc() {
  if (!game.running || dummy.broken) return;
  dummy.demoIndex = (dummy.demoIndex + 1) % CODE_NPC_STATES.length;
  dummy.demoAction = CODE_NPC_STATES[dummy.demoIndex];
  dummy.demoTimer = 2.5;
  dummy.demoElapsed = 0;
  const label = 'NPC GỐC: ' + CODE_NPC_NAMES[dummy.demoAction];
  const btn = document.querySelector('[data-demo="npc"]');
  if (btn) btn.textContent = label;
  showNotice('Diệp Tu WEBP · ' + CODE_NPC_NAMES[dummy.demoAction] + ' · phím N: chuyển 17 động tác');
}

export function codeNpcPose() {
  const name = dummy.broken
    ? 'knockdown'
    : dummy.demoTimer > 0
    ? dummy.demoAction
    : dummy.recoil > 0 || dummy.stun > 0 || dummy.trapped
    ? 'hurt'
    : dummy.bossAction
    ? dummy.bossAction
    : dummy.bossWalk
    ? 'walk'
    : dummy.patrol
    ? 'walk'
    : 'idle';
  const clip = clipMap[name] || clipMap.idle;
  const elapsed = dummy.demoTimer > 0 ? dummy.demoElapsed : dummy.bossAction ? dummy.bossActionTime : game.elapsed;
  const rate = NPC_FRAME_RATE[name] || 10;
  let f = Math.floor(elapsed * rate);

  if (dummy.broken) f = 7;
  else if (dummy.recoil > 0 && dummy.demoTimer <= 0) {
    f = Math.min(7, Math.floor((0.42 - dummy.recoil) * 17));
  } else if ((dummy.stun > 0 || dummy.trapped) && dummy.demoTimer <= 0) {
    f = 2 + (Math.floor(game.elapsed * 12) % 2);
  } else if (name === 'walk' && (dummy.patrol || dummy.bossWalk) && dummy.demoTimer <= 0) {
    f = Math.floor(dummy.gait || 0) % 8;
  } else {
    f = clip.loop ? f % clip.frames : Math.min(f, clip.frames - 1);
  }

  let lift = 0;
  if (name === 'jump_air') lift = -33 * Math.sin(Math.PI * Math.min(1, dummy.demoElapsed / 2.5));
  else if (name === 'fly_up' || name === 'hover') lift = -13 - 4 * Math.sin(game.elapsed * 2.8);
  else if (name === 'fall') lift = -18 * (1 - Math.min(1, dummy.demoElapsed / 2.5));

  return { name, f, lift, anchor: atlasAnchor(name, f) };
}

export function drawCodeNpcRig() {
  const ctx = game.ctx;
  if (!ctx || !game.images.idle) return false;
  const p = codeNpcPose();
  const scale = CHAR_SCALE * (dummy.visualScale || 1);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(0, p.lift);
  if ((dummy.isBoss && dummy.facing < 0) || (!dummy.isBoss && dummy.patrol && dummy.patrolDir < 0)) ctx.scale(-1, 1);
  if (dummy.lean) ctx.rotate(dummy.lean);
  if (dummy.squashX && dummy.squashY) ctx.scale(dummy.squashX, dummy.squashY);
  if (dummy.shake > 0) {
    ctx.translate(Math.sin(game.elapsed * 58) * Math.min(4, dummy.shake * 11), 0);
  } else if ((dummy.stun > 0 || dummy.trapped) && !dummy.broken) {
    ctx.translate(Math.floor(game.elapsed * 22) % 2 ? 1.2 : -1.2, 0);
  }

  const npcSkin = dummy.skin || (bossState.active ? 'huyet_du' : 'diep_tu');
  const ok = drawAtlasFrame(p.name, p.f, scale, p.anchor, npcSkin);
  if (ok && dummy.flash > 0) {
    drawTintedAtlasFrame(
      p.name,
      p.f,
      scale,
      p.anchor,
      '#fff2b2',
      Math.min(0.68, dummy.flash * 2.8),
      npcSkin
    );
  } else if (ok && dummy.stun > 0 && !dummy.broken) {
    drawTintedAtlasFrame(
      p.name,
      p.f,
      scale,
      p.anchor,
      '#ffd84a',
      0.16 + 0.12 * Math.sin(game.elapsed * 20),
      npcSkin
    );
  } else if (ok && dummy.trapped && !dummy.broken) {
    drawTintedAtlasFrame(
      p.name,
      p.f,
      scale,
      p.anchor,
      '#c99dfb',
      0.15 + 0.10 * Math.sin(game.elapsed * 14),
      npcSkin
    );
  } else if (ok && dummy.slow > 0 && !dummy.broken) {
    drawTintedAtlasFrame(
      p.name,
      p.f,
      scale,
      p.anchor,
      '#68d8ff',
      0.14 + 0.08 * Math.sin(game.elapsed * 8),
      npcSkin
    );
  }
  ctx.restore();
  return ok;
}

export function resetDummy(avoidPlayer = false) {
  const terrain = game.terrain;
  if (!terrain) return;
  dummy.x = 660;
  dummy.y = terrain.firstSolidY(dummy.x) - 0.5;
  if (
    avoidPlayer &&
    Math.abs(player.x - dummy.x) < HERO_HALF + NPC_HALF + 6 &&
    player.y > dummy.y - NPC_HEIGHT &&
    player.y - HERO_HEIGHT < dummy.y
  ) {
    const spots = [780, 540, 850, 470];
    for (const testX of spots) {
      const testY = terrain.firstSolidY(testX) - 0.5;
      if (
        Math.abs(player.x - testX) > HERO_HALF + NPC_HALF + 6 ||
        player.y <= testY - NPC_HEIGHT ||
        player.y - HERO_HEIGHT >= testY
      ) {
        dummy.x = testX;
        dummy.y = testY;
        break;
      }
    }
  }
  dummy.vy = 0;
  dummy.patrolDir = 1;
  dummy.patrolAnchor = dummy.x;
  dummy.hp = dummy.maxHp;
  dummy.mana = dummy.maxMana;
  dummy.shieldActive = false;
  dummy.hitSequence = 0;
  dummy.bossAction = '';
  dummy.bossWalk = false;
  dummy.facing = -1;
  dummy.flash = 0;
  dummy.shake = 0;
  dummy.damageTimer = 0;
  dummy.lastDamage = 100;
  dummy.respawn = 0;
  dummy.broken = false;
  dummy.burn = 0;
  dummy.burnTick = 0;
  dummy.burnPower = 0;
  dummy.stun = 0;
  dummy.slow = 0;
  dummy.trapped = false;
  dummy.recoil = 0;
  dummy.demoTimer = 0;
  dummy.demoElapsed = 0;
  dummy.gait = 0;
  dummy.lastFoot = -1;
  dummy.visualScale = 1;
  dummy.lean = 0;
  dummy.squashX = 1;
  dummy.squashY = 1;
}

export function updateDummy(dt) {
  const terrain = game.terrain;
  if (!terrain || dummy.visible === false) return;
  dummy.flash = Math.max(0, dummy.flash - dt);
  dummy.shake = Math.max(0, dummy.shake - dt);
  dummy.damageTimer = Math.max(0, dummy.damageTimer - dt);
  dummy.recoil = Math.max(0, dummy.recoil - dt);
  if (dummy.stun > 0) {
    dummy.stun = Math.max(0, dummy.stun - dt);
  }
  if (dummy.slow > 0) {
    dummy.slow = Math.max(0, dummy.slow - dt);
  }
  if (dummy.demoTimer > 0) {
    dummy.demoTimer = Math.max(0, dummy.demoTimer - dt);
    dummy.demoElapsed += dt;
  }

  const poseName = dummy.broken
    ? 'knockdown'
    : dummy.demoTimer > 0
    ? dummy.demoAction
    : dummy.recoil > 0 || dummy.stun > 0 || dummy.trapped
    ? 'hurt'
    : dummy.patrol
    ? 'walk'
    : 'idle';
  const targetScale = poseName === 'fly_up' ? 1.10 : poseName === 'hover' ? 0.97 : 1;
  dummy.visualScale += (targetScale - (dummy.visualScale || 1)) * (1 - Math.exp(-dt * 14));
  const squashEase = 1 - Math.exp(-dt * 16);
  dummy.squashX += (1 - (dummy.squashX || 1)) * squashEase;
  dummy.squashY += (1 - (dummy.squashY || 1)) * squashEase;

  if (dummy.broken) {
    dummy.burn = 0;
    dummy.burnTick = 0;
    dummy.burnPower = 0;
    dummy.stun = 0;
    dummy.slow = 0;
    dummy.trapped = false;
    dummy.lean = 0;
    dummy.respawn -= dt;
    if (!dummy.isBoss && dummy.respawn <= 0) resetDummy(true);
    return;
  }

  let movedX = 0;
  if (dummy.patrol && dummy.demoTimer <= 0 && dummy.stun <= 0 && !dummy.trapped) {
    const left = Math.max(65, dummy.patrolAnchor - 45);
    const right = Math.min(WORLD_W - 65, dummy.patrolAnchor + 340);
    const speedMult = dummy.slow > 0 ? 0.35 : 1;
    const proposed = dummy.x + dummy.patrolDir * 116 * speedMult * dt;
    if (proposed <= left || proposed >= right) {
      dummy.patrolDir *= -1;
    } else {
      const foot = terrain.firstSolidY(proposed) - 0.5;
      const intersectsHero =
        Math.abs(proposed - player.x) < HERO_HALF + NPC_HALF + 5 &&
        player.y > foot - NPC_HEIGHT &&
        player.y - HERO_HEIGHT < foot;
      if (intersectsHero || Math.abs(foot - dummy.y) > 24 || terrain.solid(proposed, foot - 65)) {
        dummy.patrolDir *= -1;
      } else {
        movedX = Math.abs(proposed - dummy.x);
        dummy.x = proposed;
        dummy.y = foot;
        dummy.vy = 0;
      }
    }
  }

  if (movedX > 0) {
    const before = Math.floor(dummy.gait / 4);
    dummy.gait += (movedX / 43) * 8;
    const after = Math.floor(dummy.gait / 4);
    if (after !== before) {
      fxDust(
        'footsteps',
        dummy.x - dummy.patrolDir * 5,
        dummy.y,
        0.46,
        geoMaterial(dummy.x, dummy.y),
        dummy.patrolDir
      );
      dummy.lastFoot = after;
    }
    dummy.lean += (0.022 - dummy.lean) * (1 - Math.exp(-dt * 10));
  } else {
    dummy.lean += (0 - dummy.lean) * (1 - Math.exp(-dt * 12));
  }

  if (dummy.burn > 0) {
    dummy.burn = Math.max(0, dummy.burn - dt);
    dummy.burnTick -= dt;
    if (dummy.burnTick <= 0) {
      dummy.burnTick = 0.25;
      actionAudio.fireBurnTick();
      const tickDmg = Math.max(3, Math.round((dummy.burnPower || 11) * 0.25));
      dummyDamage(tickDmg, {
        notice: false,
        isDot: true,
        palette: ['#491014', '#b92b16', '#ff7f19', '#ffdb5b', '#fff2b1', '#fffdf0'],
        sparkX: dummy.x + Math.sin(game.elapsed * 8) * 12,
        sparkY: dummy.y - 82 + Math.cos(game.elapsed * 10) * 10,
      });
    }
  } else {
    dummy.burnPower = 0;
  }

  if (terrain.solid(dummy.x, dummy.y + 3)) {
    dummy.vy = 0;
    return;
  }
  if (npcCanStandOnPlayer(dummy.x, dummy.y, dummy.y + 1)) {
    dummy.y = player.y - HERO_HEIGHT;
    dummy.vy = 0;
    return;
  }

  dummy.vy = Math.min(640, dummy.vy + GRAVITY * dt);
  const n = Math.max(1, Math.ceil((Math.abs(dummy.vy) * dt) / 4));
  const dy = (dummy.vy * dt) / n;
  for (let i = 0; i < n; i++) {
    if (npcCanStandOnPlayer(dummy.x, dummy.y, dummy.y + dy)) {
      dummy.y = player.y - HERO_HEIGHT;
      dummy.vy = 0;
      break;
    }
    if (terrain.solid(dummy.x, dummy.y + dy + 3)) {
      dummy.y = Math.floor((dummy.y + dy + 3) / CELL) * CELL - 1;
      dummy.vy = 0;
      break;
    }
    dummy.y += dy;
  }
}

export function dummyDamage(amount = 100, opts = {}) {
  if (!game.running || dummy.broken || dummy.visible === false) return false;
  if (dummy.shieldActive && dummy.mana > 0) {
    dummy.mana = Math.max(0, dummy.mana - Math.ceil(25 + Math.max(0, amount) * .65));
    dummy.flash = 0.16;
    if (dummy.mana <= 0) dummy.shieldActive = false;
    return true;
  }
  if (amount > 0) dummy.hitSequence++;
  if (opts.slowDuration > 0) dummy.slow = Math.max(dummy.slow, opts.slowDuration);
  const palette = opts.palette || [
    '#352314',
    '#80502c',
    '#c58b4d',
    '#e9ba71',
    '#ffdf9c',
    '#fff5d9',
    '#ffffff',
  ];
  dummy.hp = Math.max(0, dummy.hp - amount);
  dummy.flash = 0.20;
  dummy.recoil = 0.42;
  dummy.shake = Math.max(dummy.shake, 0.32);
  dummy.damageTimer = Math.max(dummy.damageTimer, 0.8);
  dummy.lastDamage = amount;

  if (!opts.isDot) {
    dummy.squashX = 1.065;
    dummy.squashY = 0.935;
    addCameraShake(clamp(amount / 65, 1.5, 3.8), 0.12);
  }

  fxEmit(
    'hitSpark',
    opts.sparkX ?? dummy.x + 5,
    opts.sparkY ?? dummy.y - 78,
    { height: 0, aim: player.facing > 0 ? Math.PI : 0, palette },
    null,
    'front'
  );

  if (dummy.hp === 0) {
    dummy.broken = true;
    dummy.burn = 0;
    dummy.burnTick = 0;
    dummy.burnPower = 0;
    dummy.stun = 0;
    dummy.slow = 0;
    dummy.trapped = false;
    dummy.respawn = 3.0;
    addCameraShake(4.2, 0.18);
    fxDust('groundBurst', dummy.x, dummy.y - 22, 1.25, 1);
  }
  return true;
}

export function hitDummy(amount = 100) {
  return dummyDamage(amount, { notice: false });
}

export function toggleNpcPatrol() {
  dummy.patrol = !dummy.patrol;
  dummy.patrolDir = 1;
  dummy.patrolAnchor = dummy.x;
  const b = $('patrolBtn');
  if (b) b.textContent = 'NPC DI CHUYỂN: ' + (dummy.patrol ? 'BẬT' : 'TẮT');
  showNotice(
    dummy.patrol
      ? 'NPC thử đang di chuyển · Kỹ năng tự khóa mục tiêu'
      : 'Đã dừng NPC di chuyển'
  );
  return dummy.patrol;
}

export function dummyHitTest(wx, wy) {
  return dummy.visible !== false && !dummy.broken && Math.abs(wx - dummy.x) < 48 && wy > dummy.y - 156 && wy < dummy.y + 12;
}

export function drawDummy() {
  const ctx = game.ctx;
  if (!ctx || dummy.visible === false) return;
  const px = dummy.x - camera.x + game.viewW / 2;
  const py = dummy.y - camera.y + game.viewH / 2;
  const z = settings.zoom || 0.7;
  const marginX = (game.viewW / z - game.viewW) * 0.5 + 160;
  const marginY = (game.viewH / z - game.viewH) * 0.5 + 240;
  if (
    px < -marginX ||
    px > game.viewW + marginX ||
    py < -marginY ||
    py > game.viewH + marginY
  ) {
    return;
  }

  ctx.save();
  ctx.translate(px, py);
  const ready = drawCodeNpcRig();
  const by = -144 + Math.min(0, codeNpcPose().lift);

  // Phóng lớn thanh máu & chữ trạng thái vừa phải khi bật Thần Thức 4x để đọc rõ từ xa
  const hudScale = clamp(0.70 / z, 1, 3.1);
  ctx.save();
  ctx.translate(0, by);
  ctx.scale(hudScale, hudScale);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.font = 'bold 11px system-ui,sans-serif';
  const isBoss = !!bossState.active;
  ctx.shadowColor = isBoss ? '#ff1d32' : '#06111a';
  ctx.shadowBlur = isBoss ? 6 : 4;
  ctx.fillStyle = isBoss ? '#ffd4d8' : '#c9f1ff';
  ctx.fillText(isBoss ? 'BOSS: HUYẾT DỰ · KIM ĐAN CẢNH' : 'DIỆP TU', 0, -8);

  ctx.shadowBlur = 0;
  ctx.fillStyle = '#081521';
  ctx.fillRect(-57, 0, 114, 10);
  ctx.fillStyle = isBoss ? '#471015' : '#56292c';
  ctx.fillRect(-55, 2, 110, 6);
  ctx.fillStyle = isBoss
    ? (dummy.hp > dummy.maxHp * 0.35 ? '#ff3348' : '#ff7a86')
    : (dummy.hp > 300 ? '#85ce79' : '#ed895c');
  ctx.fillRect(-55, 2, (110 * dummy.hp) / dummy.maxHp, 6);
  ctx.strokeStyle = dummy.trapped
    ? '#d59eff'
    : dummy.stun > 0
    ? '#ffd84a'
    : dummy.slow > 0
    ? '#68d8ff'
    : dummy.burn > 0
    ? '#ff7f19'
    : isBoss
    ? '#ff4255'
    : '#e4be79';
  ctx.strokeRect(-57.5, -0.5, 115, 11);

  if (!dummy.broken && (dummy.trapped || dummy.stun > 0 || dummy.slow > 0 || dummy.burn > 0)) {
    const tags = [];
    if (dummy.trapped) tags.push('☯ PHONG TỎA');
    if (dummy.stun > 0) tags.push(`⚡ TÊ LIỆT ${dummy.stun.toFixed(1)}s`);
    if (dummy.slow > 0) tags.push(`🌊 CHẬM ${dummy.slow.toFixed(1)}s`);
    if (dummy.burn > 0) tags.push(`🔥 CHÁY ${dummy.burn.toFixed(1)}s`);

    ctx.font = 'bold 10px system-ui,sans-serif';
    ctx.fillStyle = dummy.trapped
      ? '#e6c2ff'
      : dummy.stun > 0
      ? '#ffdf5d'
      : dummy.slow > 0
      ? '#98edff'
      : '#ffb347';
    ctx.fillText(tags.join(' · '), 0, -24);
  } else if (dummy.demoTimer > 0) {
    ctx.fillStyle = '#d5eaff';
    ctx.font = 'bold 9px system-ui,sans-serif';
    ctx.fillText(CODE_NPC_NAMES[dummy.demoAction], 0, -25);
  }
  ctx.restore();

  if (!ready) {
    ctx.fillStyle = '#bde4ef';
    ctx.font = '10px system-ui,sans-serif';
    ctx.fillText('Đang tải hoạt ảnh...', 0, -65);
  }
  if (dummy.damageTimer > 0) {
    ctx.save();
    ctx.translate(0, -103 - (0.8 - dummy.damageTimer) * 30 * hudScale);
    ctx.scale(hudScale, hudScale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.globalAlpha = Math.min(1, dummy.damageTimer * 1.7);
    ctx.fillStyle = dummy.trapped
      ? '#f3c6ff'
      : dummy.stun > 0
      ? '#ffe56b'
      : dummy.slow > 0
      ? '#a4f3ff'
      : dummy.burn > 0
      ? '#ffd56c'
      : '#ffce83';
    ctx.font = 'bold 19px system-ui,sans-serif';
    ctx.fillText('-' + dummy.lastDamage, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}


