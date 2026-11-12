import { beginSkillCollisionFrame, endSkillCollisionFrame } from './va-cham-ky-nang.js';
// ============================================================================
// MODULE: ENGINE (Điều phối vòng lặp game, Nạp tài nguyên, Điều khiển & Giao diện)
// Cấu trúc mô-đun:
//  - ./state.js     : Hằng số thế giới, Trạng thái dùng chung & Tiện ích HUD/Camera
//  - ./audio.js     : Âm thanh hành động Foley (bước chân, tiếp đất)
//  - ./map.js       : Bản đồ, Địa hình, Hang động, Đào đất & Cảnh nền Parallax
//  - ./character.js : Nhân vật Diệp Tu, 17 Hoạt ảnh, Vật lý, Tàn ảnh & NPC
//  - ./skills.js    : Kỹ năng Hỏa Cầu, Tụ lực, Auto-Target 900 & Hiệu ứng PixelFX
// ============================================================================

import {
  $,
  clamp,
  CELL,
  WORLD_W,
  WORLD_H,
  GRAVITY,
  SPRITE_TEXTURE_SIZE,
  CLIPS,
  sourceAssets,
  BASE_ZOOM,
  THAN_THUC_ZOOM,
  settings,
  game,
  initCanvas,
  keys,
  analog,
  player,
  motion,
  camera,
  dummy,
  showNotice,
  updateVitals,
  setFlightUI,
  setThanThucUI,
  setCharacterUI,
  bossState,
  updateBossUI,
  triggerRoundNotice,
} from './state.js';
import { actionAudio } from './audio.js';
import { resetBossAI, updateBossAI, drawBossEffects } from './boss-ai.js';
import {
  surfaceAt,
  createTerrain,
  excavate as mapExcavate,
  drawEnvironment,
  drawTerrain,
} from './map.js';
import {
  reactionLocked,
  canMove,
  startAction,
  resetMotion,
  updateAction,
  tryBufferedJump,
  toggleFlight,
  jump,
  selectPlayerAnimation,
  playerPose,
  updateAfterimages,
  drawAfterimages,
  drawPlayer,
  moveBody,
  testAction,
  cycleCodeNpc,
  codeNpcPose,
  resetDummy,
  updateDummy,
  hitDummy,
  toggleNpcPatrol,
  dummyHitTest,
  drawDummy,
  npcShape,
  npcBodyOverlap,
  npcFeetSupport,
} from './character.js';
import {
  AUTO_TARGET_RANGE,
  getAutoTargetRange,
  SKILL_SLOTS,
  getCharge,
  castLocked,
  getFireballs,
  getHoaCauExplosions,
  getFxInstances,
  getLoiBaoBlast,
  getThoThuan,
  isThoThuanActive,
  getThuyKiem,
  getNguHanh,
  isNguHanhSustaining,
  resetSkills,
  fxEmit,
  fxDust,
  fxUpdate,
  fxDraw,
  fxClear,
  fxTakeoff,
  fireOrbPoint,
  beginCharge,
  endCharge,
  abortCharge,
  toggleThoThuan,
  castThuyKiem,
  toggleNguHanh,
  triggerLockedSkillSlot,
  updateCharge,
  updateChargeTarget,
  updateFireballs,
  lockedTargetForUI,
  drawTargetLock,
  castHuyetThuSkill,
  beginHuyetKimTuyenSkill,
  releaseHuyetKimTuyenSkill,
  castThonLinhHuyetSkill,
  castHuyetBaoSkill,
  getHuyetThu,
  getHuyetKimTuyen,
  getThonLinhHuyet,
  getHuyetBao,
  updateHuyetDuBtnUI,
} from './skills.js';

initCanvas();

export function toggleThanThuc(forceState) {
  if (!game.running) return false;
  const next = typeof forceState === 'boolean' ? forceState : !settings.thanThuc;
  settings.thanThuc = next;
  settings.targetZoom = next ? THAN_THUC_ZOOM : BASE_ZOOM;
  if (next) {
    settings.thanThucPulse = 1.0;
    actionAudio.thanThucActivate();
    showNotice('Đã mở Thần Thức · Tầm nhìn xa gấp 4 lần & khóa mục tiêu 3600');
  } else {
    actionAudio.thanThucDeactivate();
    showNotice('Đã tắt Thần Thức · Trở về tầm nhìn bình thường');
  }
  if (getCharge()) {
    updateChargeTarget(getCharge(), 0);
  }
  setThanThucUI();
  return settings.thanThuc;
}

export function toggleCharacter(charName) {
  if (game.started && charName !== 'diep_tu') return settings.character;
  if (game.running && (castLocked() || getCharge())) {
    showNotice('Hãy hoàn tất chiêu thức trước khi đổi nhân vật.');
    return settings.character;
  }
  if (charName) {
    settings.character = charName;
  } else {
    settings.character = settings.character === 'huyet_du' ? 'diep_tu' : 'huyet_du';
  }
  actionAudio.stopAll();
  setCharacterUI();
  updateHuyetDuBtnUI();
  if (settings.character === 'huyet_du') {
    // Hủy các trận pháp đang duy trì của Diệp Tu nếu có
    const tk = getThuyKiem();
    if (tk && tk.phase !== 'idle') {
      tk.phase = 'idle';
      tk.swords = [];
      tk.rays = [];
    }
    const nh = getNguHanh();
    if (nh && nh.phase !== 'idle') {
      nh.phase = 'idle';
      nh.pillars = [];
      nh.streams = [];
    }
    showNotice('Đã chuyển sang nhân vật: HUYẾT DỰ (Tóc đỏ · Áo đen · 5 Kỹ Năng Ma Đạo)');
  } else {
    updateEarthBtnUI();
    showNotice('Đã chuyển sang nhân vật: DIỆP TU (Thanh bào · 5 Kỹ Năng Đạo Pháp)');
  }
  return settings.character;
}

function excavate(x = player.x, y = player.y + 28, r = 76) {
  mapExcavate(x, y, r, fxDust);
}

function resetWorld() {
  actionAudio.stopAll();
  setInput(false);
  resetMotion();
  resetSkills();
  const terrain = createTerrain();
  resetDummy();
  dummy.patrol = false;
  const patrolBtn = $('patrolBtn');
  if (patrolBtn) patrolBtn.textContent = 'NPC DI CHUYỂN: TẮT';

  player.x = 520;
  player.y = terrain.firstSolidY(player.x) - 0.5;
  // Nạp sẵn 6 chunk quanh vị trí xuất phát để khung hình đầu tiên mượt tức thì
  for (let cy = 0; cy <= 1; cy++) {
    for (let cx = 0; cx <= 2; cx++) {
      terrain.renderChunk(cx, cy);
    }
  }
  player.vx = 0;
  player.vy = 0;
  player.flying = false;
  player.grounded = true;
  player.anim = 'idle';
  player.animTime = 0;
  player.jumpTime = 999;
  player.landTime = 0;
  player.forceAnim = '';
  player.forceTime = 0;
  player.visualScale = 1;
  player.flash = 0;
  player.facing = 1;
  player.hp = player.maxHp;
  player.mana = player.maxMana;
  player.lastManaCost = 0;

  camera.x = player.x;
  camera.y = player.y - 26;
  camera.shakeTime = 0;
  camera.shakeMag = 0;
  camera.shakeX = 0;
  camera.shakeY = 0;
  game.hitStop = 0;

  settings.thanThuc = false;
  settings.targetZoom = BASE_ZOOM;
  settings.zoom = BASE_ZOOM;
  settings.thanThucPulse = 0;

  setFlightUI();
  setThanThucUI();
  setCharacterUI();
  updateVitals();
  updateBossUI(0);
}

function loadImage(key, path) {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      game.images[key] = img;
      resolve(true);
    };
    img.onerror = () => {
      console.warn('Asset failed', key);
      resolve(false);
    };
    img.src = import.meta.env.BASE_URL + path;
  });
}

async function preload() {
  const names = Object.keys(sourceAssets);
  let n = 0;
  const errors = [];
  for (const k of names) {
    const ok = await loadImage(k, sourceAssets[k]);
    if (!ok) errors.push(k);
    n++;
    $('loadStatus').textContent = `Đã tải ${n}/${names.length} tài nguyên`;
  }
  game.ready = CLIPS.every(
    ([id, count]) =>
      !!game.images[id] && game.images[id].naturalWidth === count * SPRITE_TEXTURE_SIZE &&
      !!game.images['huyet_du_' + id] && game.images['huyet_du_' + id].naturalWidth === count * SPRITE_TEXTURE_SIZE
  );
  $('startBtn').disabled = !game.ready;
  $('loadStatus').textContent = !game.ready
    ? 'Lỗi tải ảnh Diệp Tu hoặc Huyết Dự. Hãy tải lại game.'
    : errors.length
    ? `Tải thiếu ${errors.length} tài nguyên: ${errors.join(', ')}`
    : 'Sẵn sàng · Auto Target 900 · truy đuổi nhẹ';
}

function setMenu(which) {
  actionAudio.stopAll();
  game.menu = which;
  $('overlay').classList.remove('hidden');
  $('menu').classList.toggle('hidden', which !== 'menu');
  $('settings').classList.toggle('hidden', which !== 'settings');
  $('about').classList.toggle('hidden', which !== 'about');
  $('characterSelect').classList.toggle('hidden', which !== 'select');
  $('battleResult').classList.toggle('hidden', which !== 'result');
  game.running = false;
  setInput(false);
  $('controls').classList.add('hidden');
  $('fxDemo')?.classList.add('hidden');
  $('hud').classList.add('hidden');
  $('vitals').classList.add('hidden');
  $('bossHud')?.classList.add('hidden');
  $('roundNotice')?.classList.add('hidden');
  $('hint').classList.add('hidden');
  $('startBtn').textContent = player.hp <= 0 ? 'Chơi lại' : game.started ? 'Tiếp tục' : 'Bắt đầu';
  const defeat = $('defeatMessage');
  if (defeat) defeat.classList.toggle('hidden', player.hp > 0);
  $('restartBtn').classList.toggle('hidden', !game.started);
}

function play() {
  if (!game.ready) {
    showNotice('Tài nguyên đang được tải');
    return;
  }
  actionAudio.unlock();
  if (!game.started || player.hp <= 0 || ['victory', 'defeat'].includes(game.battlePhase)) {
    setMenu('select');
    return;
  }
  game.acc = 0;
  game.running = true;
  $('overlay').classList.add('hidden');
  $('controls').classList.toggle('hidden', game.battlePhase !== 'fight');
  $('hud').classList.remove('hidden');
  $('vitals').classList.remove('hidden');
  updateVitals();
  updateBossUI(0);
  $('hint').classList.toggle('hidden', game.battlePhase !== 'fight');
  game.last = 0;
  setTimeout(() => {
    $('hint').classList.add('hidden');
  }, 6200);
}

let introClock = 0;
let introGroundY = 0;
let cueTime = 0;

function startBattle() {
  settings.character = 'diep_tu';
  resetWorld();
  resetBossAI();
  game.started = true;
  game.battlePhase = 'waiting';
  introClock = 0;
  cueTime = 0;
  dummy.visible = false;
  bossState.active = false;
  bossState.hp = bossState.maxHp = dummy.maxHp;
  bossState.ghostHp = dummy.maxHp;
  $('battleIntro').classList.remove('hidden');
  $('introRound').classList.remove('hidden');
  $('introBoss').classList.add('hidden');
  $('introCue').classList.add('hidden');
  play();
}

function updateIntro(dt) {
  introClock += dt;
  if (game.battlePhase === 'waiting' && introClock >= 5) {
    game.battlePhase = 'arrival'; introClock = 0;
    dummy.x = Math.min(WORLD_W - 80, player.x + 280);
    introGroundY = game.terrain.firstSolidY(dummy.x) - .5;
    dummy.y = introGroundY - 380;
    dummy.vy = 0; dummy.visible = true; dummy.facing = -1;
    dummy.demoAction = 'fall'; dummy.demoTimer = 20; dummy.demoElapsed = 0;
    bossState.active = true; updateBossUI(0);
    $('introRound').classList.add('hidden'); $('introBoss').classList.remove('hidden');
  }
  if (game.battlePhase === 'arrival') {
    const t = Math.min(1, introClock / 1.35);
    dummy.y = introGroundY - 380 * (1 - t) * (1 - t);
    dummy.demoElapsed += dt;
    camera.x += (dummy.x - camera.x) * Math.min(1, dt * 4);
    camera.y += (dummy.y - 80 - camera.y) * Math.min(1, dt * 4);
    if (t >= 1) {
      dummy.y = introGroundY; dummy.demoTimer = 0;
      fxDust('groundBurst', dummy.x, dummy.y, 1.2, 1);
      actionAudio.land(360, 1);
      game.battlePhase = 'focus'; introClock = 0;
    }
  } else if (game.battlePhase === 'focus') {
    camera.x += (dummy.x - camera.x) * Math.min(1, dt * 5);
    camera.y += (dummy.y - 90 - camera.y) * Math.min(1, dt * 5);
    if (introClock >= 1.3) {
      game.battlePhase = 'recenter'; introClock = 0;
      $('introBoss').classList.add('hidden'); $('introCue').classList.remove('hidden');
    }
  } else if (game.battlePhase === 'recenter') {
    const mid = (player.x + dummy.x) / 2;
    camera.x += (mid - camera.x) * Math.min(1, dt * 4);
    camera.y += (player.y - 110 - camera.y) * Math.min(1, dt * 4);
    if (introClock >= 1) {
      game.battlePhase = 'fight'; introClock = 0; cueTime = .8;
      $('controls').classList.remove('hidden'); $('hint').classList.remove('hidden');
      showNotice('KHAI CHIẾN · DIỆP TU ĐỐI ĐẦU HUYẾT DỰ');
    }
  }
}

function finishBattle(won) {
  game.battlePhase = won ? 'victory' : 'defeat';
  $('battleIntro').classList.add('hidden');
  $('resultTitle').textContent = won ? 'CHIẾN THẮNG' : 'BẠI TRẬN';
  $('resultText').textContent = won ? 'Diệp Tu đã đánh bại Huyết Dự · Kim Đan cảnh.' : 'Diệp Tu đã bại trận trước Huyết Dự.';
  setMenu('result');
}

function rotated() {
  return $('game').classList.contains('rotate-cw')
    ? 1
    : $('game').classList.contains('rotate-ccw')
    ? -1
    : 0;
}

function pointerDelta(x, y, cx, cy) {
  const dx = x - cx;
  const dy = y - cy;
  const rot = rotated();
  return rot === 1 ? { x: dy, y: -dx } : rot === -1 ? { x: -dy, y: dx } : { x: dx, y: dy };
}

function setOrientation(mode, requestDevice = false) {
  settings.orientation = mode === 'portrait' ? 'portrait' : 'landscape';
  setInput(false);
  const gameEl = $('game');
  const landscape = window.innerWidth >= window.innerHeight;
  const wantsLandscape = settings.orientation === 'landscape';
  gameEl.classList.toggle('rotate-cw', !landscape && wantsLandscape);
  gameEl.classList.toggle('rotate-ccw', landscape && !wantsLandscape);
  $('orientationMode').value = settings.orientation;
  $('orientationBtn').textContent = wantsLandscape ? 'NGANG' : 'DỌC';
  $('orientationBtn').setAttribute(
    'aria-label',
    `Đang ở chế độ ${wantsLandscape ? 'ngang' : 'dọc'}. Chạm để chuyển sang ${
      wantsLandscape ? 'dọc' : 'ngang'
    }`
  );
  if (requestDevice && screen.orientation && typeof screen.orientation.lock === 'function') {
    Promise.resolve()
      .then(() => screen.orientation.lock(wantsLandscape ? 'landscape' : 'portrait'))
      .catch(() => {});
  }
  requestAnimationFrame(resize);
}

function resize() {
  const box = $('game');
  const w = Math.max(1, box.clientWidth);
  const h = Math.max(1, box.clientHeight);
  const dpr = Math.min(
    window.devicePixelRatio || 1,
    settings.quality === 'high' ? 2 : settings.quality === 'medium' ? 1.5 : 1
  );
  game.viewW = w;
  game.viewH = h;
  game.dpr = dpr;
  game.canvas.style.width = w + 'px';
  game.canvas.style.height = h + 'px';
  game.canvas.width = Math.round(w * dpr);
  game.canvas.height = Math.round(h * dpr);
  game.ctx.imageSmoothingEnabled = false;
}

function setInput(v) {
  abortCharge(true);
  motion.jumpBuffer = 0;
  for (const k of Object.keys(keys)) keys[k] = v;
  analog.moveX = analog.moveY = 0;
  document.querySelectorAll('[data-key]').forEach((x) => x.classList.remove('pressed'));
  for (const id of ['moveJoystick']) {
    const el = $(id);
    el.classList.remove('active');
    el._resetJoystick?.();
  }
}

function attachJoystick(id, axisX, axisY) {
  const el = $(id);
  const thumb = el.querySelector('.joy-thumb');
  let pointer = null;

  function updatePointer(e) {
    const r = el.getBoundingClientRect();
    const radius = el.offsetWidth * 0.33;
    const v = pointerDelta(e.clientX, e.clientY, r.left + r.width / 2, r.top + r.height / 2);
    const dx = v.x;
    const dy = v.y;
    const len = Math.hypot(dx, dy);
    const gain = Math.min(1, len / Math.max(radius, 1));
    const nx = (len > 0 ? dx / len : 0) * gain;
    const ny = (len > 0 ? dy / len : 0) * gain;
    const dead = 0.14;
    const remap = (val) =>
      Math.abs(val) <= dead ? 0 : Math.sign(val) * ((Math.abs(val) - dead) / (1 - dead));
    analog[axisX] = remap(nx);
    analog[axisY] = remap(ny);
    thumb.style.left = `calc(50% + ${nx * radius}px)`;
    thumb.style.top = `calc(50% + ${ny * radius}px)`;
  }

  const reset = () => {
    pointer = null;
    analog[axisX] = 0;
    analog[axisY] = 0;
    thumb.style.left = '50%';
    thumb.style.top = '50%';
    el.classList.remove('active');
  };
  el._resetJoystick = reset;

  el.addEventListener('pointerdown', (e) => {
    if (!game.running || pointer !== null) return;
    e.preventDefault();
    pointer = e.pointerId;
    el.setPointerCapture?.(pointer);
    el.classList.add('active');
    updatePointer(e);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId === pointer) {
      e.preventDefault();
      updatePointer(e);
    }
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    el.addEventListener(name, (e) => {
      if (e.pointerId === pointer) {
        e.preventDefault();
        reset();
      }
    });
  }
}

function update(dt) {
  if (!game.running) return;
  game.elapsed += dt;
  if (['waiting', 'arrival', 'focus', 'recenter'].includes(game.battlePhase)) {
    updateIntro(dt);
    fxUpdate(dt);
    return;
  }
  if (game.battlePhase !== 'fight') return;
  if (cueTime > 0) {
    cueTime -= dt;
    if (cueTime <= 0) $('battleIntro').classList.add('hidden');
  }
  game.statsTimer += dt;
  player.flash = Math.max(0, (player.flash || 0) - dt);
  updateAfterimages(dt);

  if (camera.shakeTime > 0) {
    camera.shakeTime = Math.max(0, camera.shakeTime - dt);
    const strength = camera.shakeMag * (camera.shakeTime / 0.16);
    camera.shakeX = Math.sin(game.elapsed * 92) * strength;
    camera.shakeY = Math.cos(game.elapsed * 114) * strength * 0.82;
  } else {
    camera.shakeX = 0;
    camera.shakeY = 0;
    camera.shakeMag = 0;
  }

  if (game.hitStop > 0) {
    game.hitStop = Math.max(0, game.hitStop - dt);
    fxUpdate(dt);
    return;
  }

  motion.jumpBuffer = Math.max(0, motion.jumpBuffer - dt);
  motion.coyote = player.grounded ? 0.10 : Math.max(0, motion.coyote - dt);
  if (!player.grounded) motion.airTime += dt;

  const launchedBefore = player.jumpTime;
  updateAction(dt);
  tryBufferedJump();

  const keyboardAxis = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
  const requestedAxis = keyboardAxis || analog.moveX;
  const axis = canMove() ? requestedAxis : 0;
  const isAnalog = !keyboardAxis && Math.abs(analog.moveX) > 0.02;
  const slow = keys.slow || (isAnalog && Math.abs(axis) < 0.67) || settings.speed < 75;
  const magnitude = Math.abs(axis);
  const moveFactor = isAnalog
    ? slow
      ? Math.min(1, magnitude / 0.67)
      : 0.75 + 0.25 * magnitude
    : magnitude;
  const speed = (slow ? 145 : 285) * (settings.speed / 100);
  let targetV = Math.sign(axis) * moveFactor * speed;

  const reversing = axis && player.vx * axis < 0 && Math.abs(player.vx) > 30;
  if (reversing) targetV = 0;
  const a = motion.action;
  const isCastOrCharge =
    getCharge() ||
    reactionLocked() ||
    a?.name === 'hand_seal' ||
    getHuyetKimTuyen()?.phase === 'charge' ||
    getHuyetThu()?.phase === 'cast';
  if (axis && !reversing && !isCastOrCharge) {
    player.facing = axis > 0 ? 1 : -1;
  }

  let stiffness = player.grounded ? 20 : player.flying ? 13 : 9.5;
  if (reversing || (!axis && player.grounded)) stiffness = 26;
  if (a && ['hurt', 'knockdown'].includes(a.name)) stiffness = player.grounded ? 9 : 2.6;
  if (
    (a && ['down_idle', 'getup', 'hand_seal', 'charge_recover'].includes(a.name)) ||
    getHuyetKimTuyen()?.phase === 'charge' ||
    getHuyetThu()?.phase === 'cast'
  ) {
    player.vx = 0;
  } else {
    player.vx += (targetV - player.vx) * (1 - Math.exp(-dt * stiffness));
  }
  if (Math.abs(player.vx) < 1 && !axis) player.vx = 0;

  if (player.flying) {
    const vertical = (keys.down ? 1 : 0) - (keys.up ? 1 : 0) || analog.moveY;
    const dir = isCastOrCharge ? 0 : vertical;
    const targetY = a?.name === 'takeoff' ? -155 : dir * 275;
    player.vy += (targetY - player.vy) * (1 - Math.exp(-dt * 10));
    if (Math.abs(dir) < 0.02 && a?.name !== 'takeoff') player.vy *= Math.exp(-4 * dt);
  } else {
    player.vy = Math.min(580, player.vy + GRAVITY * dt);
  }

  if (!(launchedBefore > 0 && player.jumpTime === 0)) player.jumpTime += dt;
  if (!isThoThuanActive() && !isNguHanhSustaining() && player.mana < player.maxMana) {
    player.mana = Math.min(player.maxMana, player.mana + player.manaRegen * dt);
  }

  const previousX = player.x;
  const wasMoving = ['walk', 'run'].includes(player.anim);
  moveBody(player.vx * dt, player.vy * dt);

  if (
    !motion.action &&
    !getCharge() &&
    player.grounded &&
    !axis &&
    wasMoving &&
    Math.abs(player.vx) < 22
  ) {
    startAction('brake');
  }

  updateCharge(dt);
  selectPlayerAnimation(dt, player.x - previousX, axis, slow);
  beginSkillCollisionFrame((x, y) => fxEmit('hitSpark', x, y, { palette: ['#5f1022', '#f13e48', '#ffad60', '#fff5cd'] }, null, 'front', { scale: 0.7 }));
  updateFireballs(dt);
  if (player.hp <= 0) {
    endSkillCollisionFrame();
    finishBattle(false);
    return;
  }
  if (dummy.broken || dummy.hp <= 0) {
    endSkillCollisionFrame();
    finishBattle(true);
    return;
  }
  updateDummy(dt);
  updateBossAI(dt);
  endSkillCollisionFrame();
  if (player.hp <= 0) {
    finishBattle(false);
    return;
  }
  if (dummy.broken || dummy.hp <= 0) {
    finishBattle(true);
    return;
  }
  fxUpdate(dt);

  // Nội suy mượt góc nhìn camera giữa Bình thường (0.70) và Thần Thức 4x (0.175)
  const targetZ = settings.targetZoom ?? BASE_ZOOM;
  if (Math.abs(settings.zoom - targetZ) > 0.0005) {
    settings.zoom += (targetZ - settings.zoom) * (1 - Math.exp(-dt * 10.5));
    if (Math.abs(settings.zoom - targetZ) <= 0.0005) {
      settings.zoom = targetZ;
    }
  }
  if (settings.thanThucPulse > 0) {
    settings.thanThucPulse = Math.max(0, settings.thanThucPulse - dt * 1.6);
  }

  const cx = player.x + player.vx * 0.24;
  const surfaceY = surfaceAt(player.x);
  const depthBelowSurface = player.y - surfaceY;
  const verticalLift = player.flying ? 90 : depthBelowSurface < 120 ? 128 : 92;
  let baseCy = player.y - verticalLift;
  if (depthBelowSurface < 140) baseCy = Math.min(baseCy, surfaceY + 54);

  // Khi bật Thần Thức 4x: nâng góc nhìn camera lên cao để mặt đất nằm ở ~1/4 dưới màn hình
  // (~76% màn hình là bầu trời, mặt đất và không gian chiến đấu phía trên; chỉ hạ xuống khi nhân vật xuống hang sâu)
  const halfWorldH = game.viewH / (2 * settings.zoom);
  const surfaceOverviewCy = Math.min(
    surfaceY - halfWorldH * 0.52,
    player.y - halfWorldH * 0.18
  );
  const undergroundBlend = clamp((depthBelowSurface - 140) / 320, 0, 1);
  const thanThucCy =
    surfaceOverviewCy + (player.y - 80 - surfaceOverviewCy) * undergroundBlend;
  const zoomBlend = clamp(
    (BASE_ZOOM - settings.zoom) / (BASE_ZOOM - THAN_THUC_ZOOM),
    0,
    1
  );
  const cy = baseCy + (thanThucCy - baseCy) * zoomBlend;

  camera.x += (cx - camera.x) * Math.min(1, dt * 5.2);
  camera.y += (cy - camera.y) * Math.min(1, dt * 7.2);
  const max = game.viewW / (2 * settings.zoom);
  camera.x = clamp(camera.x, Math.min(max, WORLD_W / 2), Math.max(max, WORLD_W / 2));
  camera.y = Math.round(clamp(camera.y, -2600, WORLD_H - 160));
  camera.x = Math.round(camera.x * 10) / 10;

  if (game.noticeTimer > 0) {
    game.noticeTimer -= dt;
    if (game.noticeTimer <= 0) $('notice').classList.add('hidden');
  }

  if (game.statsTimer >= 0.14) {
    game.statsTimer = 0;
    const posEl = $('pos');
    const zoneEl = $('zone');
    const fpsEl = $('fps');
    if (posEl) {
      posEl.textContent = `X ${Math.round(player.x)} · ${
        depthBelowSurface <= 0 ? 'Cao' : 'Sâu'
      } ${Math.round(Math.abs(depthBelowSurface))}`;
      posEl.style.display = settings.stats ? '' : 'none';
    }
    if (zoneEl) {
      zoneEl.textContent =
        depthBelowSurface < -180
          ? 'Không trung'
          : depthBelowSurface < 60
          ? 'Mặt đất'
          : depthBelowSurface < 200
          ? 'Địa tầng đất sét'
          : depthBelowSurface < 720
          ? 'Tầng đá'
          : 'Lòng đất sâu';
      zoneEl.style.display = settings.stats ? '' : 'none';
    }
    if (fpsEl) {
      fpsEl.textContent = Math.round(game.fps) + ' FPS';
      fpsEl.style.display = settings.stats ? '' : 'none';
    }
    updateVitals();
    updateBossUI(dt);
  }
}

function draw() {
  const ctx = game.ctx;
  const w = game.viewW;
  const h = game.viewH;
  if (!ctx || !w || !h) return;

  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  drawEnvironment();

  ctx.save();
  const z = settings.zoom;
  ctx.translate(w / 2 + (camera.shakeX || 0), h / 2 + (camera.shakeY || 0));
  ctx.scale(z, z);
  ctx.translate(-w / 2, -h / 2);

  if (game.terrain) drawTerrain();
  fxDraw('back');
  drawDummy();
  if (game.images.idle) {
    drawAfterimages();
    drawPlayer();
  }
  fxDraw('front');
  drawBossEffects();
  drawTargetLock();
  ctx.restore();

  if (game.running && settings.geology && game.terrain) {
    ctx.save();
    ctx.fillStyle = '#f9e6ba';
    ctx.font = '11px monospace';
    ctx.fillText(`Ô đất đã khoét: ${game.terrain.broken} · ${CELL}px/ô`, 13, h - 120);
    ctx.restore();
  }
}

function loop(now) {
  if (!game.last) game.last = now;
  const elapsed = clamp((now - game.last) / 1000, 0, 0.05);
  game.last = now;
  game.frames++;
  game.fpsAcc += elapsed;
  if (game.fpsAcc > 0.55) {
    game.fps = game.frames / game.fpsAcc;
    game.fpsAcc = 0;
    game.frames = 0;
  }
  if (game.running) {
    game.acc += elapsed;
    let count = 0;
    while (game.acc >= 1 / 60 && count < 4) {
      update(1 / 60);
      game.acc -= 1 / 60;
      count++;
    }
  }
  draw();
  requestAnimationFrame(loop);
}

function bindInput() {
  window.addEventListener(
    'pointerdown',
    () => {
      if (game.running) actionAudio.unlock();
    },
    { passive: true }
  );
  window.addEventListener('keydown', () => {
    if (game.running) actionAudio.unlock();
  });

  attachJoystick('moveJoystick', 'moveX', 'moveY');

  document.querySelectorAll('[data-key]').forEach((button) => {
    const key = button.dataset.key;
    const press = (e) => {
      e.preventDefault();
      if (!game.running) return;
      button.setPointerCapture?.(e.pointerId);
      button.classList.add('pressed');
      if (key === 'jump') jump();
      else keys[key] = true;
    };
    const release = (e) => {
      e.preventDefault();
      button.classList.remove('pressed');
      if (key !== 'jump') keys[key] = false;
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  });

  const flightButton = $('flightBtn');
  flightButton.addEventListener('pointerdown', (e) => {
    if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    flightButton.classList.add('pressed');
    toggleFlight();
  });
  const releaseFlight = () => flightButton.classList.remove('pressed');
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    flightButton.addEventListener(eventName, releaseFlight);
  }
  flightButton.addEventListener('click', (e) => {
    if (e.detail === 0 && !e.pointerType) toggleFlight();
  });

  $('digBtn')?.addEventListener('click', () => excavate());

  ['thanThucBtn', 'hudThanThucBtn'].forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      btn.classList.add('pressed');
      toggleThanThuc();
    });
    const releaseBtn = () => btn.classList.remove('pressed');
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      btn.addEventListener(eventName, releaseBtn);
    }
    btn.addEventListener('click', (e) => {
      if (e.detail === 0 && !e.pointerType) toggleThanThuc();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  ['charBtn', 'hudCharBtn'].forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      btn.classList.add('pressed');
      toggleCharacter();
    });
    const releaseBtn = () => btn.classList.remove('pressed');
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      btn.addEventListener(eventName, releaseBtn);
    }
    btn.addEventListener('click', (e) => {
      if (e.detail === 0 && !e.pointerType) toggleCharacter();
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.querySelectorAll('[data-charge]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      if (settings.character === 'huyet_du') {
        if (button.dataset.charge === 'fire') {
          castHuyetThuSkill();
        } else if (button.dataset.charge === 'lightning') {
          if (beginHuyetKimTuyenSkill(e.pointerId)) {
            button.setPointerCapture?.(e.pointerId);
          }
        }
        return;
      }
      if (beginCharge(button.dataset.charge, e.pointerId)) {
        button.setPointerCapture?.(e.pointerId);
      }
    });
    button.addEventListener('pointerup', (e) => {
      e.preventDefault();
      if (settings.character === 'huyet_du') {
        if (button.dataset.charge === 'lightning') {
          releaseHuyetKimTuyenSkill(e.pointerId);
        }
        return;
      }
      if (getCharge()?.pointerId === e.pointerId) endCharge(false);
    });
    button.addEventListener('pointercancel', (e) => {
      if (settings.character === 'huyet_du') {
        if (button.dataset.charge === 'lightning') {
          releaseHuyetKimTuyenSkill(e.pointerId);
        }
        return;
      }
      if (getCharge()?.pointerId === e.pointerId) endCharge(true);
    });
    button.addEventListener('lostpointercapture', (e) => {
      if (settings.character === 'huyet_du') {
        if (button.dataset.charge === 'lightning') {
          releaseHuyetKimTuyenSkill(e.pointerId);
        }
        return;
      }
      if (getCharge()?.pointerId === e.pointerId) endCharge(true);
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.querySelectorAll('[data-skill-toggle]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      if (button.dataset.skillToggle === 'earth') {
        if (settings.character === 'huyet_du') {
          castThonLinhHuyetSkill();
        } else {
          toggleThoThuan();
        }
      } else if (button.dataset.skillToggle === 'five_elements') {
        if (settings.character === 'huyet_du') {
          toggleThoThuan(); // Huyết Thuẫn hộ thể ma đạo
          return;
        }
        toggleNguHanh();
      }
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.querySelectorAll('[data-skill-cast]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      if (button.dataset.skillCast === 'water') {
        if (settings.character === 'huyet_du') {
          castHuyetBaoSkill();
          return;
        }
        castThuyKiem();
      }
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  document.querySelectorAll('[data-skill-locked]').forEach((button) => {
    button.addEventListener('pointerdown', (e) => {
      if (!game.running || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      triggerLockedSkillSlot(Number(button.dataset.skillLocked));
    });
    button.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  $('fxTestToggle')?.addEventListener('click', () => {
    $('fxDemo')?.classList.toggle('hidden');
  });
  $('hudBossBtn')?.addEventListener('click', () => {
    triggerRoundNotice(bossState.round, bossState.name, bossState.realm);
  });
  $('closeRoundNoticeBtn')?.addEventListener('click', () => {
    $('roundNotice')?.classList.add('hidden');
  });
  document.querySelectorAll('[data-demo]').forEach((b) =>
    b.addEventListener('click', () =>
      b.dataset.demo === 'dummy'
        ? hitDummy(100)
        : b.dataset.demo === 'npc'
        ? cycleCodeNpc()
        : b.dataset.demo === 'patrol'
        ? toggleNpcPatrol()
        : b.dataset.demo === 'round1'
        ? triggerRoundNotice(bossState.round, bossState.name, bossState.realm)
        : b.dataset.demo === 'huyet_thu'
        ? castHuyetThuSkill()
        : b.dataset.demo === 'huyet_kim_tuyen'
        ? (() => {
            beginHuyetKimTuyenSkill('demo');
            setTimeout(() => releaseHuyetKimTuyenSkill('demo'), 1200);
          })()
        : b.dataset.demo === 'thon_linh'
        ? castThonLinhHuyetSkill()
        : b.dataset.demo === 'huyet_bao'
        ? castHuyetBaoSkill()
        : b.dataset.demo === 'wound_10'
        ? (() => {
            player.hp = Math.round(player.maxHp * 0.10);
            updateVitals();
            showNotice('Thương thế chí mạng: HP còn 10% — Huyết Bạo đã mở khóa!');
          })()
        : testAction(b.dataset.demo)
    )
  );

  game.canvas.addEventListener('pointerdown', (e) => {
    if (!game.running) return;
    const rect = game.canvas.getBoundingClientRect();
    const p = pointerDelta(
      e.clientX,
      e.clientY,
      rect.left + rect.width / 2,
      rect.top + rect.height / 2
    );
    const wx = camera.x + p.x / settings.zoom;
    const wy = camera.y + p.y / settings.zoom;
    if (dummyHitTest(wx, wy)) {
      hitDummy(100);
      return;
    }
    if (game.terrain && game.terrain.solid(wx, wy)) excavate(wx, wy, 55);
  });

  const keymap = {
    ArrowLeft: 'left',
    KeyA: 'left',
    ArrowRight: 'right',
    KeyD: 'right',
    ArrowUp: 'up',
    KeyW: 'up',
    ArrowDown: 'down',
    KeyS: 'down',
    ShiftLeft: 'slow',
    ShiftRight: 'slow',
  };

  window.addEventListener('keydown', (e) => {
    if (game.running && game.battlePhase !== 'fight') {
      if (e.code === 'Escape') setMenu('menu');
      return;
    }
    const name = keymap[e.code];
    if (name) {
      if (game.running) {
        keys[name] = true;
        e.preventDefault();
      }
      return;
    }
    if (e.code === 'Digit1') {
      e.preventDefault();
      if (!e.repeat) {
        if (settings.character === 'huyet_du') {
          castHuyetThuSkill();
        } else {
          beginCharge('fire', e.code);
        }
      }
      return;
    }
    if (e.code === 'Digit2') {
      e.preventDefault();
      if (!e.repeat) {
        if (settings.character === 'huyet_du') {
          beginHuyetKimTuyenSkill(e.code);
        } else {
          beginCharge('lightning', e.code);
        }
      }
      return;
    }
    if (e.code === 'Digit3') {
      e.preventDefault();
      if (!e.repeat) {
        if (settings.character === 'huyet_du') {
          castThonLinhHuyetSkill();
        } else {
          toggleThoThuan();
        }
      }
      return;
    }
    if (e.code === 'Digit4') {
      e.preventDefault();
      if (!e.repeat) {
        if (settings.character === 'huyet_du') {
          castHuyetBaoSkill();
        } else {
          castThuyKiem();
        }
      }
      return;
    }
    if (e.code === 'Digit5') {
      e.preventDefault();
      if (!e.repeat) {
        if (settings.character === 'huyet_du') {
          toggleThoThuan(); // Huyết Thuẫn hộ thể ma đạo
        } else {
          toggleNguHanh();
        }
      }
      return;
    }
    if (e.repeat) return;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        jump();
        break;
      case 'KeyF':
        toggleFlight();
        break;
      case 'KeyP':
        // Vòng 1 chỉ có Diệp Tu là nhân vật được chọn.
        break;
      case 'KeyV':
      case 'Tab':
        e.preventDefault();
        toggleThanThuc();
        break;
      case 'KeyX':
      case 'KeyT':
        excavate();
        break;
      case 'Escape':
        if (game.running) setMenu('menu');
        else if (game.started) play();
        break;
    }
  });

  window.addEventListener('keyup', (e) => {
    const name = keymap[e.code];
    if (name) keys[name] = false;
    if (getCharge()?.pointerId === e.code) endCharge(false);
    if (e.code === 'Digit2' && settings.character === 'huyet_du') {
      releaseHuyetKimTuyenSkill(e.code);
    }
  });

  document
    .querySelectorAll('.joystick')
    .forEach((el) => el.addEventListener('contextmenu', (e) => e.preventDefault()));

  window.addEventListener('blur', () => {
    setInput(false);
    if (game.running) setMenu('menu');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setInput(false);
      if (game.running) setMenu('menu');
    }
  });
}

function bindUI() {
  actionAudio.restore();
  $('soundEnabled').checked = settings.soundEnabled;
  $('soundVolume').value = settings.soundVolume;
  $('soundVolumeOut').textContent = settings.soundVolume + '%';
  $('soundEnabled').onchange = (e) => actionAudio.change(e.target.checked, settings.soundVolume);
  $('soundVolume').oninput = (e) => {
    actionAudio.change(settings.soundEnabled, e.target.value);
    $('soundVolumeOut').textContent = settings.soundVolume + '%';
  };
  $('startBtn').disabled = true;
  $('startBtn').onclick = play;
  $('restartBtn').onclick = () => setMenu('select');
  $('selectDiepTu').onclick = () => {
    settings.character = 'diep_tu';
    $('selectDiepTu').setAttribute('aria-pressed', 'true');
  };
  $('confirmCharacter').onclick = startBattle;
  $('backCharacterSelect').onclick = () => setMenu(['victory', 'defeat'].includes(game.battlePhase) ? 'result' : 'menu');
  $('resultRetry').onclick = () => setMenu('select');
  $('resultMenu').onclick = () => {
    game.started = false; game.battlePhase = 'menu'; player.hp = player.maxHp;
    bossState.active = false; dummy.visible = false;
    setMenu('menu');
  };
  $('pauseBtn').onclick = () => setMenu('menu');
  $('settingsBtn').onclick = () => setMenu('settings');
  $('aboutBtn').onclick = () => setMenu('about');
  $('backSettings').onclick = () => setMenu('menu');
  $('closeSettingsTop').onclick = () => setMenu('menu');
  $('backAbout').onclick = () => setMenu('menu');
  $('speedRange').oninput = (e) => {
    settings.speed = Number(e.target.value);
    $('speedOut').textContent = settings.speed + '%';
  };
  $('orientationBtn').onclick = () =>
    setOrientation(settings.orientation === 'landscape' ? 'portrait' : 'landscape', true);
  $('orientationMode').onchange = (e) => setOrientation(e.target.value, true);
  $('quality').onchange = (e) => {
    settings.quality = e.target.value;
    resize();
  };
  $('statsToggle').onchange = (e) => (settings.stats = e.target.checked);
  $('geoToggle').onchange = (e) => (settings.geology = e.target.checked);
  $('fxQuality').onchange = (e) => {
    const old = settings.fxQuality;
    settings.fxQuality = e.target.value;
    if (settings.fxQuality === 'off') fxClear();
    else if (old === 'off' && player.flying) fxTakeoff();
  };
  $('joystickSize').onchange = (e) => {
    $('game').classList.toggle('joy-small', e.target.value === 'small');
    $('game').classList.toggle('joy-large', e.target.value === 'large');
  };
  window.addEventListener('resize', () => setOrientation(settings.orientation));
  window.addEventListener('orientationchange', () =>
    setTimeout(() => setOrientation(settings.orientation), 250)
  );
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => setOrientation(settings.orientation));
  }
}

window.PK_QA = {
  spriteInfo: () => ({
    size: SPRITE_TEXTURE_SIZE,
    clips: CLIPS.length,
    frames: CLIPS.reduce((a, b) => a + b[1], 0),
    ready: game.ready,
    zoom: settings.zoom,
  }),
  hitDummy: () => hitDummy(100),
  snapshot: () => {
    const charge = getCharge();
    const fireballs = getFireballs();
    const fxInstances = getFxInstances();
    const loiBao = getLoiBaoBlast();
    return {
      dummyHp: dummy.hp,
      dummyX: dummy.x,
      dummyY: dummy.y,
      dummyStun: dummy.stun,
      npcHeight: npcShape().height,
      npcHalfWidth: npcShape().half,
      npcBodyOverlap: npcBodyOverlap(player.x, player.y),
      npcSupport: npcFeetSupport(player.x, player.y),
      dummyBroken: dummy.broken,
      dummyCodeAction: codeNpcPose().name,
      npcAtlasReady:
        !!game.images.idle && game.images.idle.complete && game.images.idle.naturalWidth > 0,
      x: player.x,
      y: player.y,
      vx: player.vx,
      vy: player.vy,
      facing: player.facing,
      running: game.running,
      audio: actionAudio.status(),
      action: motion.action ? { name: motion.action.name, time: motion.action.time } : null,
      motion: motion.mode,
      pose: playerPose(),
      jumpBuffer: motion.jumpBuffer,
      gait: motion.gait,
      visualScale: player.visualScale,
      cameraX: camera.x,
      cameraY: camera.y,
      flying: player.flying,
      grounded: player.grounded,
      anim: player.anim,
      fallFrame: player.anim === 'fall' ? Math.floor(player.animTime * 20) % 8 : null,
      skillSlots: SKILL_SLOTS,
      charge: charge
        ? {
            kind: charge.kind,
            time: charge.time,
            chargedSeconds: charge.chargedSeconds || 0,
            phase: charge.phase,
            power: charge.power,
            aimPitch: charge.aimPitch,
            targetArmDeg: charge.targetArmDeg,
            aimFrame: charge.aimFrame,
            orb: fireOrbPoint(charge),
            castFrame: charge.phase === 'cast' ? Math.floor(charge.castTime * 20) : null,
            fired: charge.fired,
          }
        : null,
      loiBao: loiBao
        ? {
            phase: loiBao.phase,
            chargedSeconds: loiBao.chargedSeconds,
            blastAge: loiBao.blastAge,
            targetId: loiBao.targetId,
          }
        : null,
      thoThuan: {
        active: getThoThuan().active,
        blockedDamage: getThoThuan().blockedDamage,
        blockedHits: getThoThuan().blockedHits,
        absorbedMana: getThoThuan().absorbedMana,
        shots: getThoThuan().shots.length,
      },
      thuyKiem: {
        phase: getThuyKiem().phase,
        cd: getThuyKiem().cd,
        cast: getThuyKiem().cast,
        swords: getThuyKiem().swords.length,
      },
      nguHanh: {
        phase: getNguHanh().phase,
        lockSec: getNguHanh().lockSec,
        pulses: getNguHanh().pulses,
      },
      huyetThu: {
        phase: getHuyetThu().phase,
        cd: getHuyetThu().cooldown,
      },
      huyetKimTuyen: {
        phase: getHuyetKimTuyen().phase,
        cd: getHuyetKimTuyen().cooldown,
      },
      thonLinhHuyet: {
        phase: getThonLinhHuyet().phase,
        cd: getThonLinhHuyet().cd,
        drainHp: getThonLinhHuyet().totalDrainHp,
      },
      huyetBao: {
        phase: getHuyetBao().phase,
        usedOnce: getHuyetBao().usedOnce,
        radius: getHuyetBao().radius,
      },
      hp: player.hp,
      mana: player.mana,
      fxCount: fxInstances.length,
      fxKinds: fxInstances.map((e) => e.fx.meta.name || 'custom'),
      hoaCauExplosions: getHoaCauExplosions().length,
      targetLock: {
        range: getAutoTargetRange(),
        baseRange: AUTO_TARGET_RANGE,
        turnRateDeg: 70,
        id: lockedTargetForUI(),
        chargeTarget: charge?.targetId || null,
      },
      thanThuc: settings.thanThuc,
      targetZoom: settings.targetZoom,
      patrol: dummy.patrol,
      fireballs: fireballs.map((f) => ({
        x: f.x,
        y: f.y,
        vx: f.vx,
        vy: f.vy,
        angle: Math.atan2(f.vy, f.vx),
        speed: f.speed,
        targetId: f.targetId,
        chargeTime: f.chargeTime,
        power: f.power,
      })),
      dummyBurn: dummy.burn,
      dummySlow: dummy.slow,
      dummyTrapped: dummy.trapped,
      broken: game.terrain?.broken,
      ready: game.ready,
      quality: settings.fxQuality,
      zoom: settings.zoom,
      orientation: settings.orientation,
      rotated: rotated(),
      viewW: game.viewW,
      viewH: game.viewH,
    };
  },
  testAction,
  beginCharge,
  endCharge,
  abortCharge,
  toggleThoThuan,
  castThuyKiem,
  toggleNguHanh,
  castHuyetThuSkill,
  beginHuyetKimTuyenSkill,
  releaseHuyetKimTuyenSkill,
  castThonLinhHuyetSkill,
  castHuyetBaoSkill,
  toggleThanThuc,
  toggleCharacter,
  toggleNpcPatrol,
  triggerRoundNotice,
  bossState,
  setNpcTestPosition: (x, y) => {
    dummy.patrol = false;
    dummy.x = Math.max(70, Math.min(WORLD_W - 70, Number(x)));
    dummy.y = Number.isFinite(y) ? Number(y) : game.terrain.firstSolidY(dummy.x) - 0.5;
    dummy.vy = 0;
    return { x: dummy.x, y: dummy.y };
  },
  setNpcTestBroken: (v) => {
    dummy.broken = !!v;
    if (!v) {
      dummy.hp = dummy.maxHp;
      dummy.respawn = 0;
    }
    return dummy.broken;
  },
};

function init() {
  bindUI();
  bindInput();
  setOrientation(settings.orientation);
  resize();
  resetWorld();
  updateVitals();
  requestAnimationFrame(loop);
  preload();
}

init();
