// ============================================================================
// MODULE: STATE & CONSTANTS (Trạng thái dùng chung, Hằng số & Tiện ích cơ bản)
// ============================================================================

export const $ = (id) => document.getElementById(id);
export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export function hash(a, b) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Hằng số kích thước thế giới & nhân vật
export const CELL = 10;
export const CHUNK = 32;
export const WORLD_W = 4800;
export const WORLD_H = 2400;
export const CHAR_SCALE = 0.52;
export const CHAR_H = 238 * CHAR_SCALE;
export const GRAVITY = 840;
export const SPRITE_TEXTURE_SIZE = 128;

// Hitbox va chạm vật lý giữa Nhân vật và NPC (tính từ mốc chân y = 0)
export const HERO_HALF = 17;
export const HERO_HEIGHT = 100;
export const NPC_HALF = 23;
export const NPC_HEIGHT = 113;
export const CONTACT_EPS = 0.25;

// Danh sách 17 dải hoạt ảnh WebP của Diệp Tu: [tên_clip, số_khung, lặp_lại]
export const CLIPS = [
  ['idle', 8, true],
  ['walk', 8, true],
  ['run', 8, true],
  ['jump_start', 3, false],
  ['jump_air', 3, false],
  ['fall', 8, true],
  ['land', 3, false],
  ['hand_seal', 8, false],
  ['hurt', 8, false],
  ['knockdown', 8, false],
  ['down_idle', 8, true],
  ['getup', 8, false],
  ['fly_up', 6, false],
  ['hover', 8, true],
  ['charge_raise', 8, false],
  ['charge_hold', 4, true],
  ['cast_fire', 12, false],
];

export const clipMap = Object.fromEntries(
  CLIPS.map(([id, frames, loop]) => [id, { id, frames, loop }])
);

export const sourceAssets = {
  ...Object.fromEntries(CLIPS.map(([id]) => ['huyet_du_' + id, 'assets/sprites/huyet_du_' + id + '.webp'])),
  sky: 'assets/backgrounds/01_Khong_Trung.webp',
  surface: 'assets/backgrounds/02_Phong_Canh_Mat_Dat.webp',
  cave: 'assets/backgrounds/03_Hang_Dong_Sau.webp',
  ...Object.fromEntries(CLIPS.map(([id]) => [id, 'assets/sprites/' + id + '.webp'])),
};

export const BASE_ZOOM = 0.70;
export const THAN_THUC_ZOOM = 0.175; // Tầm nhìn xa gấp 4 lần (0.70 / 4)

// Cài đặt người chơi
export const settings = {
  speed: 100,
  quality: 'high',
  fxQuality: 'medium',
  stats: true,
  geology: false,
  zoom: BASE_ZOOM,
  targetZoom: BASE_ZOOM,
  thanThuc: false,
  thanThucPulse: 0,
  character: 'diep_tu', // 'diep_tu' | 'huyet_du'
  orientation: 'landscape',
  soundEnabled: true,
  soundVolume: 70,
};

// Trạng thái vận hành game
export const game = {
  started: false,
  running: false,
  battlePhase: 'menu',
  menu: 'menu',
  quality: 'high',
  images: {},
  ready: false,
  viewW: 0,
  viewH: 0,
  dpr: 1,
  last: 0,
  acc: 0,
  elapsed: 0,
  fps: 60,
  frames: 0,
  fpsAcc: 0,
  hitStop: 0,
  noticeTimer: 0,
  statsTimer: 0,
  terrain: null,
  canvas: null,
  ctx: null,
};

export function initCanvas() {
  const canvas = $('scene');
  const ctx = canvas.getContext('2d', { alpha: false });
  game.canvas = canvas;
  game.ctx = ctx;
  return { canvas, ctx };
}

// Điều khiển đầu vào
export const keys = { left: false, right: false, up: false, down: false, slow: false };
export const analog = { moveX: 0, moveY: 0 };

// Trạng thái Nhân vật chính (Diệp Tu)
export const player = {
  x: 520,
  y: 0,
  vx: 0,
  vy: 0,
  facing: 1,
  flying: false,
  grounded: false,
  anim: 'idle',
  animTime: 0,
  jumpTime: 999,
  landTime: 0,
  forceAnim: '',
  forceTime: 0,
  visualScale: 1,
  flash: 0,
  realm: 'LUYỆN KHÍ · SƠ KỲ',
  atk: 50,
  maxHp: 500,
  hp: 500,
  maxMana: 100,
  mana: 100,
  manaRegen: 10,
  lastManaCost: 0,
};

// Trạng thái chuyển động & biến dạng đàn hồi của Nhân vật
export const motion = {
  action: null,
  jumpBuffer: 0,
  coyote: 0,
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
};

// Camera & hiệu ứng rung chấn
export const camera = {
  x: 520,
  y: 300,
  shakeTime: 0,
  shakeMag: 0,
  shakeX: 0,
  shakeY: 0,
};

// Trạng thái Boss PK Vòng 1 (Huyết Dự · Kim Đan cảnh)
export const bossState = {
  active: false,
  round: 1,
  name: 'HUYẾT DỰ',
  realm: 'KIM ĐAN CẢNH',
  stage: 'TẦNG BA',
  maxHp: 3000,
  hp: 3000,
  ghostHp: 3000,
};

// Trạng thái NPC mục tiêu (Boss Huyết Dự / Diệp Tu WebP)
export const dummy = {
  x: 660,
  y: 0,
  vy: 0,
  maxHp: 3000,
  hp: 3000,
  isBoss: true,
  visible: false,
  facing: -1,
  bossWalk: false,
  bossAction: '',
  bossActionTime: 0,
  shieldActive: false,
  hitSequence: 0,
  maxMana: 100,
  mana: 100,
  skin: 'huyet_du',
  name: 'HUYẾT DỰ · KIM ĐAN CẢNH',
  flash: 0,
  shake: 0,
  damageTimer: 0,
  lastDamage: 100,
  respawn: 0,
  broken: false,
  burn: 0,
  burnTick: 0,
  burnPower: 0,
  stun: 0,
  slow: 0,
  trapped: false,
  recoil: 0,
  demoIndex: 0,
  demoAction: 'idle',
  demoElapsed: 0,
  demoTimer: 0,
  patrol: false,
  patrolDir: 1,
  patrolAnchor: 660,
  gait: 0,
  lastFoot: -1,
  visualScale: 1,
  lean: 0,
  squashX: 1,
  squashY: 1,
};

export function addCameraShake(mag = 2.5, duration = 0.14) {
  if (settings.fxQuality === 'off') return;
  camera.shakeMag = Math.max(camera.shakeMag || 0, mag);
  camera.shakeTime = Math.max(camera.shakeTime || 0, duration);
}

export function triggerHitStop(duration = 0.032) {
  if (settings.fxQuality === 'off') return;
  game.hitStop = Math.max(game.hitStop || 0, duration);
}

export function showNotice(message) {
  const el = $('notice');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hidden');
  game.noticeTimer = 2.1;
}

export function updateVitals() {
  const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
  const mpRatio = clamp(player.mana / player.maxMana, 0, 1);
  const hpFill = $('hpFill');
  const mpFill = $('mpFill');
  if (hpFill) hpFill.style.width = (hpRatio * 100).toFixed(1) + '%';
  if (mpFill) mpFill.style.width = (mpRatio * 100).toFixed(1) + '%';
  const hpText = $('hpText');
  const mpText = $('mpText');
  if (hpText) hpText.textContent = Math.round(player.hp) + ' / ' + player.maxHp;
  if (mpText) mpText.textContent = Math.round(player.mana) + ' / ' + player.maxMana;
  const realmBadge = $('playerRealmBadge');
  if (realmBadge) realmBadge.textContent = settings.character === 'huyet_du' ? 'KIM ĐAN CẢNH' : (player.realm || 'LUYỆN KHÍ · SƠ KỲ');
  const nameEl = $('playerCharName');
  if (nameEl) nameEl.textContent = settings.character === 'huyet_du' ? 'HUYẾT DỰ' : 'DIỆP TU';
}

export function spendMana(amount) {
  if (player.mana < amount) {
    showNotice('Không đủ linh lực');
    return false;
  }
  player.mana = Math.max(0, player.mana - amount);
  player.lastManaCost = amount;
  updateVitals();
  return true;
}

export function setFlightUI() {
  const flightBtn = $('flightBtn');
  const moveCaption = $('moveCaption');
  if (flightBtn) {
    flightBtn.classList.toggle('on', player.flying);
    flightBtn.textContent = player.flying ? 'RƠI' : 'BAY';
  }
  if (moveCaption) {
    moveCaption.textContent = player.flying
      ? 'TRÁI / PHẢI · LÊN / XUỐNG'
      : 'ĐI / CHẠY · ĐỘ CAO';
  }
}

export function setThanThucUI() {
  const active = !!settings.thanThuc;
  const btn = $('thanThucBtn');
  const sub = $('thanThucSub');
  const hudBtn = $('hudThanThucBtn');
  const zoomOut = $('zoomOut');

  if (btn) {
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (sub) {
    sub.textContent = active ? '4× · ĐANG BẬT' : 'TẦM NHÌN 4×';
  }
  if (hudBtn) {
    hudBtn.classList.toggle('on', active);
    hudBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
  if (zoomOut) {
    zoomOut.textContent = active ? '17.5% · Thần Thức 4×' : '70% · Bình thường';
  }
}

export function setCharacterUI() {
  const isHuyetDu = settings.character === 'huyet_du';
  const charBtn = $('charBtn');
  const hudCharBtn = $('hudCharBtn');
  const nameEl = $('playerCharName');
  const realmBadge = $('playerRealmBadge');
  if (nameEl) nameEl.textContent = isHuyetDu ? 'HUYẾT DỰ' : 'DIỆP TU';
  if (realmBadge) realmBadge.textContent = isHuyetDu ? 'KIM ĐAN CẢNH' : (player.realm || 'LUYỆN KHÍ · SƠ KỲ');

  if (charBtn) {
    charBtn.classList.toggle('huyet-du', isHuyetDu);
    charBtn.innerHTML = isHuyetDu
      ? '<span class="char-pill blood">MA</span><b>HUYẾT DỰ</b>'
      : '<span class="char-pill tao">ĐẠO</span><b>DIỆP TU</b>';
  }
  if (hudCharBtn) {
    hudCharBtn.classList.toggle('huyet-du', isHuyetDu);
    hudCharBtn.textContent = isHuyetDu ? 'HUYẾT DỰ' : 'DIỆP TU';
  }
}

// Cập nhật thanh máu dài của Boss Huyết Dự (Trúc Cơ Kỳ)
export function updateBossUI(dt = 0.016) {
  const bossHud = $('bossHud');
  if (!bossHud) return;

  if (!bossState.active) {
    bossHud.classList.add('hidden');
    return;
  }
  bossHud.classList.remove('hidden');

  bossState.hp = Math.max(0, Math.min(dummy.maxHp, dummy.hp));
  bossState.maxHp = dummy.maxHp || 3000;

  // Hiệu ứng thanh ma sát thương chậm (ghost damage bar)
  if (bossState.ghostHp > bossState.hp) {
    const step = Math.max(220, (bossState.ghostHp - bossState.hp) * 3.5);
    bossState.ghostHp = Math.max(bossState.hp, bossState.ghostHp - dt * step);
  } else {
    bossState.ghostHp = bossState.hp;
  }

  const ratio = clamp(bossState.hp / bossState.maxHp, 0, 1);
  const ghostRatio = clamp(bossState.ghostHp / bossState.maxHp, 0, 1);

  const fill = $('bossHpFill');
  const ghost = $('bossHpGhost');
  const text = $('bossHpText');
  const pct = $('bossHpPercent');

  if (fill) fill.style.width = (ratio * 100).toFixed(1) + '%';
  if (ghost) ghost.style.width = (ghostRatio * 100).toFixed(1) + '%';
  if (text) text.textContent = `${Math.round(bossState.hp)} / ${bossState.maxHp}`;
  if (pct) pct.textContent = `${Math.ceil(ratio * 100)}%`;
}

let roundNoticeTimeout = null;
export function triggerRoundNotice(round = 1, bossName = 'HUYẾT DỰ', realm = 'KIM ĐAN CẢNH') {
  const el = $('roundNotice');
  if (!el) return;
  const roundNum = $('roundNumText');
  const nameEl = $('roundBossNameText');
  const realmEl = $('roundRealmText');
  if (roundNum) roundNum.textContent = `VÒNG ${round}`;
  if (nameEl) nameEl.textContent = `BOSS: ${bossName}`;
  if (realmEl) realmEl.textContent = realm;

  el.classList.remove('hidden');
  el.classList.remove('fade-out');

  // Khởi động lại hiệu ứng animation
  el.classList.remove('play-anim');
  void el.offsetWidth;
  el.classList.add('play-anim');

  if (roundNoticeTimeout) clearTimeout(roundNoticeTimeout);
  roundNoticeTimeout = setTimeout(() => {
    el.classList.add('fade-out');
    setTimeout(() => {
      el.classList.add('hidden');
      el.classList.remove('play-anim');
      el.classList.remove('fade-out');
    }, 600);
  }, 4200);
}



