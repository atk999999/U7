import { trackSkillSegment, queueSkillImpact, skillCollisionRatio, resetSkillCollisions } from './va-cham-ky-nang.js';
// ============================================================================
// MODULE: SKILLS & PIXELFX (Hệ thống 5 Kỹ năng: 1 Hỏa Cầu, 2 Lôi Bạo, 3 Thổ Thuẫn, 4 Thủy Kiếm, 5 Ngũ Hành)
// ============================================================================

import {
  $,
  clamp,
  CHAR_SCALE,
  WORLD_W,
  WORLD_H,
  NPC_HALF,
  settings,
  game,
  player,
  motion,
  camera,
  dummy,
  addCameraShake,
  triggerHitStop,
  showNotice,
  spendMana,
  updateVitals,
} from './state.js';
import { geoMaterial } from './map.js';
import {
  reactionLocked,
  startAction,
  finishAction,
  setAnim,
  spawnAfterimage,
  dummyDamage,
  dummyHitTest,
  npcShape,
  codeNpcPose,
  applyUnblockedPlayerHit,
} from './character.js';
import { LOI_BAO_SPEC, renderLoiBaoWorld } from './loi-bao.js';
import { HOA_CAU_SPEC, renderHoaCauWorld } from './hoa-cau.js';
import { THO_THUAN_SPEC, createShatterRocks, renderThoThuanWorld } from './tho-thuan.js';
import {
  THUY_KIEM_SPEC,
  createThuyKiemState,
  startThuyKiemSeal,
  startThuyKiemRays,
  startThuyKiemDownfall,
  triggerThuyKiemSwordImpact,
  stepThuyKiemParticles,
  renderThuyKiemWorld,
} from './thuy-kiem.js';
import {
  NGU_HANH_SPEC,
  NGU_HANH_ELEMENTS,
  createNguHanhState,
  getNguHanhUpkeepRate,
  drainNguHanhMana,
  startNguHanhLaunch,
  startNguHanhForm,
  startNguHanhPrison,
  startNguHanhConverge,
  startNguHanhDetonate,
  triggerNguHanhBeatVisuals,
  stepNguHanhParticlesAndStreams,
  renderNguHanhWorld,
} from './ngu-hanh.js';
import {
  HUYET_THU_SPEC,
  createHuyetThuState,
  castHuyetThu,
  stepHuyetThu,
  renderHuyetThuWorld,
} from './huyet-thu.js';
import {
  HUYET_KIM_TUYEN_SPEC,
  createHuyetKimTuyenState,
  beginHuyetKimTuyen,
  releaseHuyetKimTuyen,
  stepHuyetKimTuyen,
  renderHuyetKimTuyenWorld,
} from './huyet-kim-tuyen.js';
import {
  THON_LINH_HUYET_SPEC,
  createThonLinhHuyetState,
  castThonLinhHuyet,
  canCastThonLinhHuyet,
  stopThonLinhHuyet,
  stepThonLinhHuyet,
  renderThonLinhHuyetWorld,
} from './thon-linh-huyet.js';
import {
  HUYET_BAO_SPEC,
  createHuyetBaoState,
  canCastHuyetBao,
  castHuyetBao,
  stepHuyetBao,
  renderHuyetBaoWorld,
} from './huyet-bao.js';
import { actionAudio } from './audio.js';

const PixelFX = window.PK_PIXELFX;
if (!PixelFX) {
  throw new Error('PixelFX bundle must load before skills.js');
}

// Giới hạn số lượng hạt hiệu ứng theo cấu hình
export const FXLIMIT = { high: 24, medium: 13, low: 6, off: 0 };

export const FX_PALETTE = {
  1: ['#4c3425', '#8c6147', '#c6a783'], // Đất mặt
  2: ['#6c4d34', '#b08960', '#dfbd8d'], // Đất sét / trầm tích
  3: ['#414b53', '#7f8589', '#b8bec2'], // Đá
  4: ['#283540', '#63757f', '#9aaebb'], // Đá sâu
};

export const HOA_CAU_SPARK_PALETTE = [
  '#491014',
  '#b92b16',
  '#eb4c16',
  '#ff7f19',
  '#ffb02d',
  '#ffdb5b',
  '#fffdf0',
];

export const LIGHTNING_PALETTE = [
  '#170e05',
  '#382007',
  '#75440b',
  '#b8780b',
  '#efb71b',
  '#ffd43e',
  '#fff39d',
  '#ffffff',
];

// Danh sách 5 ô kỹ năng của nhân vật
export const SKILL_SLOTS = [
  {
    slot: 1,
    code: 'Digit1',
    kind: 'fire',
    label: 'HỎA CẦU',
    sub: 'GIỮ · CHÁY 10S',
    unlocked: true,
  },
  {
    slot: 2,
    code: 'Digit2',
    kind: 'lightning',
    label: 'LÔI BẠO',
    sub: 'GIỮ · TÊ LIỆT',
    unlocked: true,
  },
  {
    slot: 3,
    code: 'Digit3',
    kind: 'earth',
    label: 'THỔ THUẪN',
    sub: 'BẬT · HỘ THỂ',
    unlocked: true,
  },
  {
    slot: 4,
    code: 'Digit4',
    kind: 'water',
    label: 'THỦY KIẾM',
    sub: '5S ẤN · TAM KIẾM',
    unlocked: true,
  },
  {
    slot: 5,
    code: 'Digit5',
    kind: 'five_elements',
    label: 'NGŨ HÀNH',
    sub: 'BẬT · ĐẠI TRẬN',
    unlocked: true,
  },
];

export const CHARGE_SKILLS = {
  fire: {
    slot: 1,
    label: 'HỎA CẦU',
    palette: HOA_CAU_SPARK_PALETTE,
  },
  lightning: {
    slot: 2,
    label: 'LÔI BẠO',
    palette: LIGHTNING_PALETTE,
  },
};

export const CHARGE_ANGLES = [0, 7, 19, 33, 49, 68, 89, 106];
export const CHARGE_RAISE_TIME = 0.40;

// Tọa độ bàn tay trong dải hoạt ảnh cast_fire (12 khung)
export const FIRE_CAST_HANDS = [
  [206, 73],
  [200, 80],
  [186, 109],
  [161, 142],
  [171, 121],
  [164, 105],
  [175, 112],
  [190, 131],
  [190, 131],
  [176, 139],
  [163, 145],
  [151, 151],
];

export const CAST_LAUNCH_FRAME = 7;
export const CAST_FRAME_RATE = 20;
export const CAST_DURATION = 12 / CAST_FRAME_RATE;

// Cấu hình Auto Target Lock & góc bẻ lái đạn (Tăng gấp 4 lần khi bật Thần Thức: 900 -> 3600)
export const AUTO_TARGET_RANGE = 900;
export const THAN_THUC_TARGET_RANGE = 3600;
export const getAutoTargetRange = () =>
  settings.thanThuc ? THAN_THUC_TARGET_RANGE : AUTO_TARGET_RANGE;
export const FIREBALL_WEAK_TURN_RATE = (70 * Math.PI) / 180;

let fxInstances = [];
let fxSeed = 0;
let charge = null;
let fireballs = [];
let hoaCauExplosions = [];
let hoaCauSeed = 100;
let loiBaoBlast = null;
let loiBaoCastId = 0;
let thoThuan = {
  active: false,
  blockedDamage: 0,
  blockedHits: 0,
  damageTaken: 0,
  absorbedMana: 0,
  impacts: [],
  shatter: null,
  shots: [],
  shotSeed: 0,
};
let thuyKiem = createThuyKiemState();
let nguHanh = createNguHanhState();
export const huyetThu = createHuyetThuState();
export const huyetKimTuyen = createHuyetKimTuyenState();
export const thonLinhHuyet = createThonLinhHuyetState();
export const huyetBao = createHuyetBaoState();

export const getCharge = () => charge;
export const getFireballs = () => fireballs;
export const getHoaCauExplosions = () => hoaCauExplosions;
export const getFxInstances = () => fxInstances;
export const getLoiBaoBlast = () => loiBaoBlast;
export const getThoThuan = () => thoThuan;
export const getThuyKiem = () => thuyKiem;
export const getNguHanh = () => nguHanh;
export const getHuyetThu = () => huyetThu;
export const getHuyetKimTuyen = () => huyetKimTuyen;
export const getThonLinhHuyet = () => thonLinhHuyet;
export const getHuyetBao = () => huyetBao;
export { HUYET_THU_SPEC, HUYET_KIM_TUYEN_SPEC, THON_LINH_HUYET_SPEC, HUYET_BAO_SPEC };
export const isThoThuanActive = () => !!thoThuan.active;
export const isNguHanhSustaining = () =>
  ['launch', 'form', 'prison'].includes(nguHanh.phase);
export const castLocked = () =>
  (!!charge && ['windup', 'cast'].includes(charge.phase)) ||
  huyetThu.phase === 'cast' ||
  huyetKimTuyen.phase === 'charge' ||
  thonLinhHuyet.phase === 'cast' ||
  thonLinhHuyet.phase === 'drain' ||
  ['seal', 'gather', 'pinch', 'blast'].includes(huyetBao.phase);

function bloodCastBlocked() {
  return !game.running || player.hp <= 0 || !!charge || castLocked() || reactionLocked() ||
    (!!motion.action && !['brake', 'flight_stop'].includes(motion.action.name));
}

export function updateFireBtnUI() {
  const subEl = $('hoaCauSub');
  if (!subEl) return;
  if (charge && charge.kind === 'fire' && ['raise', 'hold'].includes(charge.phase)) {
    const d = Math.round(HOA_CAU_SPEC.rad(charge.time) * 2);
    const dmg = HOA_CAU_SPEC.dmg(charge.time);
    subEl.textContent = `${d}PX · ${dmg}`;
  } else {
    subEl.textContent = 'GIỮ · CHÁY 10S';
  }
}

export function updateLightningBtnUI() {
  const subEl = $('loiBaoSub');
  if (!subEl) return;
  if (charge && charge.kind === 'lightning' && ['raise', 'hold'].includes(charge.phase)) {
    const rings = (charge.chargedSeconds || 0) + 1;
    const dmg =
      LOI_BAO_SPEC.baseDamage + LOI_BAO_SPEC.extraDamagePerSecond * (charge.chargedSeconds || 0);
    subEl.textContent = `${rings} VÒNG · ${dmg}`;
  } else {
    subEl.textContent = 'GIỮ · TÊ LIỆT';
  }
}

export function updateEarthBtnUI() {
  if (settings.character === 'huyet_du') {
    updateHuyetDuBtnUI();
    return;
  }
  const btn = $('thoThuanBtn');
  const subEl = $('thoThuanSub');
  const titleEl = $('skill3Title');

  if (titleEl) {
    titleEl.textContent = 'THỔ THUẪN';
  }

  if (btn) {
    btn.classList.toggle('active', !!thoThuan.active);
    btn.classList.remove('blood-shield');
    btn.classList.add('earth');
  }

  if (subEl) {
    subEl.textContent = thoThuan.active
      ? thoThuan.blockedHits > 0
        ? `ĐỠ ${thoThuan.blockedDamage}`
        : 'ĐANG HỘ THỂ'
      : 'BẬT · HỘ THỂ';
  }
}

export function updateWaterBtnUI() {
  const btn = $('thuyKiemBtn');
  const subEl = $('thuyKiemSub');
  const isHuyetDu = settings.character === 'huyet_du';
  if (isHuyetDu) return;

  const active = ['seal', 'rise', 'fall'].includes(thuyKiem.phase);
  const onCd = thuyKiem.phase === 'cooldown';
  if (btn) {
    btn.classList.toggle('active', active);
    btn.classList.toggle('cooldown', onCd);
  }
  if (!subEl) return;
  if (thuyKiem.phase === 'seal') {
    subEl.textContent = `ẤN ${Math.max(0.1, THUY_KIEM_SPEC.castSeconds - thuyKiem.cast).toFixed(1)}S`;
  } else if (thuyKiem.phase === 'rise') {
    subEl.textContent = 'THỦY QUANG';
  } else if (thuyKiem.phase === 'fall') {
    subEl.textContent = `KIẾM ${thuyKiem.hitCount}/3`;
  } else if (onCd) {
    subEl.textContent = `HỒI ${Math.ceil(thuyKiem.cd)}S`;
  } else {
    subEl.textContent = '5S ẤN · TAM KIẾM';
  }
}

export function updateFiveElementsBtnUI() {
  const btn = $('nguHanhBtn');
  const subEl = $('nguHanhSub');
  const isHuyetDu = settings.character === 'huyet_du';
  if (isHuyetDu) return;

  const active = nguHanh.phase !== 'idle';
  const overloaded =
    nguHanh.phase === 'prison' && nguHanh.lockSec >= NGU_HANH_SPEC.baseLimitSeconds;
  if (btn) {
    btn.classList.toggle('active', active);
    btn.classList.toggle('overload', overloaded);
  }
  if (!subEl) return;
  if (nguHanh.phase === 'launch') {
    subEl.textContent = 'NGŨ LINH';
  } else if (nguHanh.phase === 'form') {
    subEl.textContent = 'DỰNG TRẬN';
  } else if (nguHanh.phase === 'prison') {
    const rate = getNguHanhUpkeepRate(nguHanh.lockSec);
    subEl.textContent = overloaded
      ? `QUÁ TẢI · -${rate}MP`
      : `THU TRẬN · ${Math.floor(nguHanh.lockSec)}S`;
  } else if (nguHanh.phase === 'converge') {
    subEl.textContent = 'QUY NHẤT';
  } else if (nguHanh.phase === 'blast') {
    subEl.textContent = 'BẠO SÁT!';
  } else {
    subEl.textContent = 'BẬT · ĐẠI TRẬN';
  }
}

export function updateHuyetDuBtnUI() {
  const isHuyetDu = settings.character === 'huyet_du';
  const btn1 = document.querySelector('[data-charge="fire"]');
  const btn2 = document.querySelector('[data-charge="lightning"]');
  const btn3 = $('thoThuanBtn');
  const btn4 = $('thuyKiemBtn');
  const btn5 = $('nguHanhBtn');
  const sub1 = $('hoaCauSub');
  const sub2 = $('loiBaoSub');
  const sub3 = $('thoThuanSub');
  const sub4 = $('thuyKiemSub');
  const sub5 = $('nguHanhSub');
  const title1 = $('skill1Title');
  const title2 = $('skill2Title');
  const title3 = $('skill3Title');
  const title4 = $('thuyKiemTitle');
  const title5 = $('nguHanhTitle');
  const thanThucTitle = $('thanThucTitle');
  const hintEl = $('hint');

  // Cả hai nhân vật đều hiển thị đủ 5 nút kỹ năng!
  if (btn4) btn4.classList.remove('hidden');
  if (btn5) btn5.classList.remove('hidden');

  if (hintEl) {
    hintEl.textContent = isHuyetDu
      ? 'Phím 1-5: 5 KỸ NĂNG HUYẾT DỰ · P: ĐỔI DIỆP TU · V: MA THỨC'
      : 'Phím 1-5: 5 KỸ NĂNG DIỆP TU · P: ĐỔI HUYẾT DỰ · V: THẦN THỨC';
  }

  if (thanThucTitle) {
    thanThucTitle.textContent = isHuyetDu ? 'MA THỨC' : 'THẦN THỨC';
  }

  if (isHuyetDu) {
    if (title1) title1.textContent = 'HUYẾT THỦ';
    if (title2) title2.textContent = 'KIM TUYẾN';
    if (title3) title3.textContent = 'THÔN LINH';
    if (title4) title4.textContent = 'HUYẾT BẠO';
    if (title5) title5.textContent = 'HUYẾT THUẪN';

    if (btn1) {
      btn1.classList.add('blood-hand');
      btn1.classList.remove('fire');
      btn1.classList.toggle('cooldown', huyetThu.cooldown > 0);
      btn1.classList.toggle('active', huyetThu.phase === 'cast' || huyetThu.phase === 'hand');
    }
    if (btn2) {
      btn2.classList.add('blood-thread');
      btn2.classList.remove('lightning');
      btn2.classList.toggle('cooldown', huyetKimTuyen.cooldown > 0);
      btn2.classList.toggle('active', huyetKimTuyen.phase === 'charge');
    }
    if (btn3) {
      btn3.classList.add('blood-drain');
      btn3.classList.remove('earth', 'blood-shield');
      btn3.classList.toggle('active', thonLinhHuyet.phase === 'drain' || thonLinhHuyet.phase === 'cast');
      btn3.classList.toggle('cooldown', thonLinhHuyet.phase === 'cooldown');
    }
    if (btn4) {
      btn4.classList.add('blood-blast');
      btn4.classList.remove('water');
      const hpRatio = player.hp / (player.maxHp || 500);
      const readyToBlow = hpRatio <= 0.1 + 1e-9 && !huyetBao.usedOnce && huyetBao.phase === 'idle';
      const blastActive = ['seal', 'gather', 'pinch', 'blast'].includes(huyetBao.phase);
      btn4.classList.toggle('ready-to-blow', readyToBlow);
      btn4.classList.toggle('active', blastActive);
      btn4.classList.toggle('used', huyetBao.usedOnce);
    }
    if (btn5) {
      btn5.classList.add('blood-shield');
      btn5.classList.remove('five-elements');
      btn5.classList.toggle('active', !!thoThuan.active);
    }

    if (sub1) {
      if (huyetThu.phase === 'cast') {
        sub1.textContent = `ẤN ${(HUYET_THU_SPEC.castSeconds - huyetThu.castTime).toFixed(1)}S`;
      } else if (huyetThu.phase === 'hand') {
        sub1.textContent = 'TRUY KÍCH';
      } else if (huyetThu.phase === 'impact') {
        sub1.textContent = 'BẠO HUYẾT';
      } else if (huyetThu.cooldown > 0) {
        sub1.textContent = `HỒI ${Math.ceil(huyetThu.cooldown)}S`;
      } else {
        sub1.textContent = 'TRẢO HỒN · 8S MÁU';
      }
    }
    if (sub2) {
      if (huyetKimTuyen.phase === 'charge') {
        sub2.textContent = `TỤ ${huyetKimTuyen.chargeTime.toFixed(1)}S · -6HP`;
      } else if (huyetKimTuyen.phase === 'release') {
        sub2.textContent = 'HỒNG TUYẾN';
      } else if (huyetKimTuyen.cooldown > 0) {
        sub2.textContent = `HỒI ${Math.ceil(huyetKimTuyen.cooldown)}S`;
      } else {
        sub2.textContent = 'TỤ LỰC ∞ · CD 8S';
      }
    }
    if (sub3) {
      if (thonLinhHuyet.phase === 'cast') {
        sub3.textContent = `ẤN ${(0.65 - thonLinhHuyet.t).toFixed(1)}S`;
      } else if (thonLinhHuyet.phase === 'drain') {
        sub3.textContent = `HÚT ${thonLinhHuyet.t.toFixed(1)}/6S`;
      } else if (thonLinhHuyet.phase === 'cooldown') {
        sub3.textContent = `HỒI ${Math.ceil(thonLinhHuyet.cd)}S`;
      } else {
        sub3.textContent = 'HÚT HP+MP · 6S';
      }
    }
    if (sub4) {
      if (['seal', 'gather', 'pinch'].includes(huyetBao.phase)) {
        sub4.textContent = 'NÉN HUYẾT...';
      } else if (huyetBao.phase === 'blast') {
        sub4.textContent = 'BẠO PHÁT!';
      } else if (huyetBao.usedOnce) {
        sub4.textContent = 'ĐÃ DÙNG · 1 LẦN';
      } else if (player.hp / (player.maxHp || 500) <= 0.1 + 1e-9) {
        sub4.textContent = 'SẴN SÀNG BẠO PHÁT!';
      } else {
        sub4.textContent = 'HP ≤ 10% · GIỮ 1%';
      }
    }
    if (sub5) {
      if (thoThuan.active) {
        sub5.textContent = thoThuan.blockedHits > 0 ? `ĐỠ ${thoThuan.blockedDamage}` : 'HUYẾT HỘ · -2MP';
      } else {
        sub5.textContent = 'BẬT · HỘ THỂ';
      }
    }
  } else {
    if (title1) title1.textContent = 'HỎA CẦU';
    if (title2) title2.textContent = 'LÔI BẠO';
    if (title3) title3.textContent = 'THỔ THUẪN';
    if (title4) title4.textContent = 'THỦY KIẾM';
    if (title5) title5.textContent = 'NGŨ HÀNH';
    if (btn1) {
      btn1.classList.remove('blood-hand');
      btn1.classList.add('fire');
      btn1.classList.remove('cooldown');
    }
    if (btn2) {
      btn2.classList.remove('blood-thread');
      btn2.classList.add('lightning');
      btn2.classList.remove('cooldown');
    }
    if (btn3) {
      btn3.classList.remove('blood-drain', 'blood-shield');
      btn3.classList.add('earth');
      btn3.classList.remove('cooldown');
    }
    if (btn4) {
      btn4.classList.remove('blood-blast', 'ready-to-blow', 'used');
      btn4.classList.add('water');
    }
    if (btn5) {
      btn5.classList.remove('blood-shield');
      btn5.classList.add('five-elements');
    }
    updateFireBtnUI();
    updateLightningBtnUI();
    updateEarthBtnUI();
    updateWaterBtnUI();
    updateFiveElementsBtnUI();
  }
}

export function castHuyetThuSkill(target = dummy) {
  if (bloodCastBlocked()) return false;
  if (huyetThu.phase !== 'ready' && huyetThu.phase !== 'cooldown') return false;
  if (huyetThu.cooldown > 0) {
    showNotice(`Huyết Thủ đang hồi chiêu (${huyetThu.cooldown.toFixed(1)}s)`);
    return false;
  }
  if (!spendMana(HUYET_THU_SPEC.manaCost)) {
    return false;
  }
  if (target && !target.broken && Math.abs(target.x - player.x) > 4) {
    player.facing = target.x >= player.x ? 1 : -1;
  }
  player.vx = 0;
  motion.jumpBuffer = 0;
  startAction('hand_seal', { duration: HUYET_THU_SPEC.castSeconds });
  setAnim('hand_seal', true);
  fxSeal();
  const ok = castHuyetThu(huyetThu, player, target);
  if (ok) {
    showNotice('Huyết Dự kết ấn: Triệu hồi Huyết Thủ Trảo Hồn!');
  }
  return ok;
}

export function beginHuyetKimTuyenSkill(pointerId = null, target = dummy) {
  if (bloodCastBlocked()) return false;
  if (huyetKimTuyen.phase !== 'ready' && huyetKimTuyen.phase !== 'cooldown') return false;
  if (huyetKimTuyen.cooldown > 0) {
    showNotice(`Huyết Kim Tuyến đang hồi chiêu (${huyetKimTuyen.cooldown.toFixed(1)}s)`);
    return false;
  }
  if (player.hp <= 1 || player.mana <= 0) {
    showNotice('Không đủ máu hoặc mana để tiếp tục tụ Huyết Kim Tuyến');
    return false;
  }
  if (target && !target.broken && Math.abs(target.x - player.x) > 4) {
    player.facing = target.x >= player.x ? 1 : -1;
  }
  player.vx = 0;
  motion.jumpBuffer = 0;
  motion.lean = 0;
  finishAction();
  setAnim('charge_raise', true);
  const ok = beginHuyetKimTuyen(huyetKimTuyen, player, target, pointerId);
  if (ok) {
    showNotice('Tụ lực Huyết Kim Tuyến: −6 HP/s, −12 MP/s!');
  }
  return ok;
}

export function releaseHuyetKimTuyenSkill(pointerId = null) {
  if (huyetKimTuyen.phase !== 'charge') return false;
  if (huyetKimTuyen.heldPointerId !== null && pointerId !== huyetKimTuyen.heldPointerId) return false;
  const ok = releaseHuyetKimTuyen(huyetKimTuyen);
  finishAction();
  setAnim('cast_fire', true);
  startAction('charge_recover', { fromFrame: 7, duration: 0.32 });
  if (ok) {
    showNotice(`Huyết Kim Tuyến xuất thủ (${huyetKimTuyen.shots.length} sợi kim tuyến)!`);
  }
  return ok;
}

export function castThonLinhHuyetSkill(target = null) {
  if (bloodCastBlocked()) return false;
  if (thonLinhHuyet.phase !== 'ready') {
    if (thonLinhHuyet.phase === 'cooldown') {
      showNotice(`Thôn Linh Huyết đang hồi chiêu (${thonLinhHuyet.cd.toFixed(1)}s)!`);
    } else {
      showNotice('Thôn Linh Huyết đang được thi triển!');
    }
    return false;
  }
  const tgt = target || (!dummy.broken ? dummy : null);
  if (tgt && Math.abs(tgt.x - player.x) > 4) {
    player.facing = tgt.x >= player.x ? 1 : -1;
  }
  player.vx = 0;
  motion.jumpBuffer = 0;
  startAction('hand_seal', { duration: THON_LINH_HUYET_SPEC.castSeconds });
  setAnim('hand_seal', true);
  fxSeal();
  const ok = castThonLinhHuyet(thonLinhHuyet, player, tgt);
  if (ok) {
    showNotice('Thôn Linh Huyết phát động! Rút Kim Tuyến xanh (MP) & đỏ (HP) của địch!');
  }
  return ok;
}

export function castHuyetBaoSkill(target = dummy) {
  if (bloodCastBlocked()) return false;
  if (huyetBao.usedOnce) {
    showNotice('Huyết Bạo là cấm thuật tự hủy, đã dùng trong trận này!');
    return false;
  }
  if (player.hp / (player.maxHp || 500) > 0.1 + 1e-9) {
    const pct = ((player.hp / (player.maxHp || 500)) * 100).toFixed(0);
    showNotice(`Chưa đủ điều kiện! HP hiện tại ${pct}% (Phải còn ≤ 10% để dùng Huyết Bạo)!`);
    return false;
  }
  player.vx = 0;
  motion.jumpBuffer = 0;
  startAction('hand_seal', { duration: HUYET_BAO_SPEC.castDuration });
  setAnim('hand_seal', true);
  fxSeal();
  const ok = castHuyetBao(huyetBao, player);
  return ok;
}

export function triggerLockedSkillSlot(slotNum) {
  if (!game.running) return false;
  if (settings.character === 'huyet_du') {
    if (slotNum === 1) return castHuyetThuSkill();
    if (slotNum === 2) return beginHuyetKimTuyenSkill();
    if (slotNum === 3) return castThonLinhHuyetSkill();
    if (slotNum === 4) return castHuyetBaoSkill();
    if (slotNum === 5) return toggleThoThuan();
    return false;
  }
  if (slotNum === 4) return castThuyKiem();
  if (slotNum === 5) return toggleNguHanh();
  return false;
}

export function resetSkills() {
  resetSkillCollisions();
  actionAudio.stopChargeLoop();
  charge = null;
  fireballs = [];
  hoaCauExplosions = [];
  loiBaoBlast = null;
  thoThuan = {
    active: false,
    blockedDamage: 0,
    blockedHits: 0,
    damageTaken: 0,
    absorbedMana: 0,
    impacts: [],
    shatter: null,
    shots: [],
    shotSeed: 0,
  };
  thuyKiem = createThuyKiemState();
  nguHanh = createNguHanhState();
  huyetThu.phase = 'ready';
  huyetThu.castTime = 0;
  huyetThu.cooldown = 0;
  huyetThu.hand = null;
  huyetThu.particles = [];
  huyetThu.drops = [];
  huyetThu.shock = [];
  huyetThu.bloodPools = [];
  huyetThu.targetBleed.active = false;
  huyetThu.targetBleed.timeLeft = 0;
  huyetThu.targetBleed.spawnTimer = 0;
  huyetThu.targetBleed.tickTimer = 0;
  huyetThu.targetBleed.targetRef = null;
  huyetThu.hits = 0;

  huyetKimTuyen.phase = 'ready';
  huyetKimTuyen.chargeTime = 0;
  huyetKimTuyen.cooldown = 0;
  huyetKimTuyen.motes = [];
  huyetKimTuyen.shots = [];
  huyetKimTuyen.sparks = [];
  huyetKimTuyen.wisps = [];
  huyetKimTuyen.impactRings = [];
  huyetKimTuyen.bloodDrops = [];
  huyetKimTuyen.wounds = [];
  huyetKimTuyen.bloodPools = [];
  huyetKimTuyen.bleedTimer = 0;
  huyetKimTuyen.bleedTickTimer = 0;
  huyetKimTuyen.hits = 0;
  huyetKimTuyen.heldPointerId = null;
  huyetKimTuyen.targetRef = null;

  thonLinhHuyet.phase = 'ready';
  thonLinhHuyet.t = 0;
  thonLinhHuyet.cd = 0;
  thonLinhHuyet.totalDrainHp = 0;
  thonLinhHuyet.totalDrainMp = 0;
  thonLinhHuyet.particles = [];
  thonLinhHuyet.bloodDrops = [];
  thonLinhHuyet.rings = [];

  huyetBao.phase = 'idle';
  huyetBao.clock = 0;
  huyetBao.total = 0;
  huyetBao.usedOnce = false;
  huyetBao.radius = 0;
  huyetBao.shake = 0;
  huyetBao.flash = 0;
  huyetBao.ashen = false;
  huyetBao.damage = 0;
  huyetBao.targetHit = false;
  huyetBao.motes = [];
  huyetBao.debris = [];
  huyetBao.smoke = [];
  huyetBao.cracks = [];

  dummy.slow = 0;
  dummy.trapped = false;
  updateFireBtnUI();
  updateLightningBtnUI();
  updateEarthBtnUI();
  updateWaterBtnUI();
  updateFiveElementsBtnUI();
  updateHuyetDuBtnUI();
  fxClear();
}

// ----------------------------------------------------------------------------
// Quản lý hệ thống hiệu ứng PixelFX
// ----------------------------------------------------------------------------

const pfxFrame = (w = 192, h = 160) => {
  const frame = PixelFX.createFrame(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  const image = context.createImageData(w, h);
  return { frame, canvas, context, image };
};

export function fxEmit(kind, x, y, opts = {}, follow = null, layer = 'front', visual = {}) {
  if (settings.fxQuality === 'off' || !PixelFX[kind]) return null;
  const limit = FXLIMIT[settings.fxQuality];
  if (fxInstances.length >= limit) {
    const idx = fxInstances.findIndex((v) => v.follow === null);
    if (idx >= 0) fxInstances.splice(idx, 1);
    else return null;
  }

  const frameSize = {
    groundBurst: [224, 160],
    hitSpark: [176, 144],
  };

  const [w, h] = frameSize[kind] || [160, 144];
  const ox = visual.ox ?? w / 2;
  const oy = visual.oy ?? h / 2;
  const surface = pfxFrame(w, h);
  const fx = PixelFX.createFx(PixelFX[kind], { x: ox, y: oy, seed: ++fxSeed, light: 0.74, ...opts });
  const inst = {
    fx,
    ...surface,
    x,
    y,
    follow,
    layer,
    acc: 0,
    dirty: true,
    originX: ox,
    originY: oy,
    renderScale: visual.scale || 1,
    opacity: visual.opacity ?? 1,
    mirror: !!visual.mirror,
    rotation: visual.rotation || 0,
  };
  fxInstances.push(inst);
  return inst;
}

export function fxDust(
  kind,
  x,
  y,
  power = 1,
  material = geoMaterial(x, y),
  side = player.facing
) {
  const palette = FX_PALETTE[material] || FX_PALETTE[1];
  const count =
    (kind === 'footsteps' ? 10 : 22) *
    (settings.fxQuality === 'low' ? 0.5 : settings.fxQuality === 'medium' ? 0.75 : 1);
  fxEmit(kind, x, y, { palette, power, side, count: Math.round(count) });
}

export function fxUpdate(dt) {
  if (!game.running) return;
  for (let i = fxInstances.length - 1; i >= 0; i--) {
    const q = fxInstances[i];
    q.fx.update(dt);
    q.acc += dt;
    if (q.fx.done()) {
      fxInstances.splice(i, 1);
      continue;
    }
    if (q.follow === 'feet') {
      q.x = player.x;
      q.y = player.y - 4;
    }
    if (q.follow === 'hands') {
      q.x = player.x + player.facing * 11;
      q.y = player.y - 75;
    }
    if (q.acc >= 1 / 30) {
      q.acc %= 1 / 30;
      q.dirty = true;
    }
  }
}

export function fxDraw(layer) {
  const ctx = game.ctx;
  if (!ctx || settings.fxQuality === 'off') return;
  const wx0 = camera.x - game.viewW / 2;
  const wy0 = camera.y - game.viewH / 2;
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  const z = settings.zoom || 0.7;
  const marginX = (game.viewW / z - game.viewW) * 0.5;
  const marginY = (game.viewH / z - game.viewH) * 0.5;

  for (const q of fxInstances) {
    if (q.layer !== layer) continue;
    const px = q.x - wx0;
    const py = q.y - wy0;
    const sc = q.renderScale || 1;
    if (
      px < -310 * sc - marginX ||
      px > game.viewW + 310 * sc + marginX ||
      py < -290 * sc - marginY ||
      py > game.viewH + 290 * sc + marginY
    ) {
      continue;
    }
    if (q.dirty) {
      PixelFX.clearFrame(q.frame);
      q.fx.draw(q.frame);
      PixelFX.composite(q.frame, q.image.data, null, 0.82);
      q.context.putImageData(q.image, 0, 0);
      q.dirty = false;
    }
    ctx.save();
    ctx.translate(Math.round(px), Math.round(py));
    if (q.rotation) ctx.rotate(q.rotation);
    ctx.scale(q.mirror ? -sc : sc, sc);
    ctx.globalAlpha = q.opacity ?? 1;
    ctx.drawImage(q.canvas, -q.originX, -q.originY);
    ctx.restore();
  }
  ctx.restore();

  if (layer === 'back') {
    renderNguHanhWorld(nguHanh, 'back');
  }

  if (layer === 'front') {
    drawThoThuanLayer();
    drawHoaCauLayer();
    drawLoiBaoLayer();
    drawThuyKiemLayer();
    renderNguHanhWorld(nguHanh, 'front');
    renderHuyetThuWorld(huyetThu);
    renderHuyetKimTuyenWorld(huyetKimTuyen);
    renderThonLinhHuyetWorld(thonLinhHuyet, player, dummy);
    renderHuyetBaoWorld(huyetBao, player);
  }
}

function drawThuyKiemLayer() {
  const slowTarget =
    !dummy.broken && dummy.slow > 0
      ? { x: dummy.x, y: dummy.y + (codeNpcPose().lift || 0) }
      : null;
  renderThuyKiemWorld(thuyKiem, slowTarget, !dummy.broken ? dummy.slow : 0);
}

function drawThoThuanLayer() {
  renderThoThuanWorld({
    active: thoThuan.active,
    heroX: player.x,
    heroFeetY: player.y + (motion.bobOffset || 0) + 2,
    impacts: thoThuan.impacts,
    shatter: thoThuan.shatter,
    shots: thoThuan.shots,
  });
}

function drawHoaCauLayer() {
  const isChargingFire =
    !!charge &&
    charge.kind === 'fire' &&
    ((charge.phase === 'raise' && charge.time >= 0.10) ||
      ['hold', 'windup'].includes(charge.phase) ||
      (charge.phase === 'cast' && !charge.fired));

  const pitch = charge?.aimPitch || 0;
  const chargeAimAngle = player.facing < 0 ? Math.PI - pitch : pitch;
  const chargeEmerge = charge ? clamp((charge.time - 0.10) / 0.22, 0.35, 1) : 1;
  const burnTarget =
    !dummy.broken && dummy.burn > 0
      ? { x: dummy.x, y: dummy.y + (codeNpcPose().lift || 0) }
      : null;

  renderHoaCauWorld({
    charging: isChargingFire,
    chargeOrigin: isChargingFire ? fireOrbPoint(charge) : null,
    chargeTime: charge?.time || 0,
    chargeAimAngle,
    chargeEmerge,
    fireballs,
    explosions: hoaCauExplosions,
    burnTarget,
    burnRemaining: !dummy.broken ? dummy.burn : 0,
  });
}

function drawLoiBaoLayer() {
  if (charge && charge.kind === 'lightning' && ['raise', 'hold', 'windup'].includes(charge.phase)) {
    const n = charge.chargedSeconds || 0;
    const origin = lightningOrbPoint(charge);
    const target =
      targetPosition(charge.targetId) || { x: origin.x + player.facing * 420, y: origin.y };
    renderLoiBaoWorld({
      phase: 'charging',
      castId: loiBaoCastId,
      chargeTime: charge.time,
      chargedSeconds: n,
      ringRadius: LOI_BAO_SPEC.initialRingRadius + n * LOI_BAO_SPEC.radiusPerSecond,
      blastAge: 0,
      stunRemaining: dummy.stun || 0,
      origin,
      target,
    });
  } else if (loiBaoBlast && loiBaoBlast.phase === 'firing') {
    renderLoiBaoWorld({
      ...loiBaoBlast,
      stunRemaining: dummy.stun || 0,
    });
  } else if (!dummy.broken && dummy.stun > 0) {
    renderLoiBaoWorld({
      phase: 'idle',
      castId: loiBaoCastId,
      chargedSeconds: 0,
      ringRadius: LOI_BAO_SPEC.initialRingRadius,
      blastAge: 0,
      stunRemaining: dummy.stun,
      origin: { x: dummy.x, y: dummy.y - 77 },
      target: { x: dummy.x, y: dummy.y - 77 },
    });
  }
}

export function fxClear() {
  fxInstances = [];
  fxSeed = 0;
}

export function stopHandSealFx() {
  for (const q of fxInstances) {
    if (q.follow === 'hands') {
      q.follow = null;
      q.fx.stop();
    }
  }
}

export function fxTakeoff() {
  fxEmit('qiIgnite', player.x, player.y - 4, {}, null, 'back');
  fxEmit('hoverQi', player.x, player.y - 4, {}, 'feet', 'front');
}

export function fxFlightStop() {
  for (const q of fxInstances) {
    if (q.follow === 'feet') q.fx.stop();
  }
  fxEmit('qiStop', player.x, player.y - 4, {}, null, 'back');
}

export function fxSeal() {
  fxEmit('sealGather', player.x + player.facing * 11, player.y - 75, {}, 'hands');
}

export function fxHit() {
  fxEmit('hitSpark', player.x + player.facing * 14, player.y - 54, {
    height: 0,
    aim: player.facing > 0 ? Math.PI : 0,
    palette: ['#392b2d', '#75413d', '#bf6857', '#e8a184', '#ffe3bd', '#fff0dc', '#ffffff'],
  });
}

// Kích hoạt trạng thái Thiêu Đốt Toàn Thân 10 giây trên mục tiêu
export function igniteDummy(chargeTime = 0, multiplier = 1) {
  if (!game.running || dummy.broken) return;
  dummy.burn = HOA_CAU_SPEC.burnDuration;
  dummy.burnTick = 0.25;
  dummy.burnPower = Math.max(dummy.burnPower || 0, HOA_CAU_SPEC.burnDps(chargeTime) * multiplier);
}

// ----------------------------------------------------------------------------
// Auto Target Lock (900) & Hệ thống Tụ lực Kỹ năng (Hỏa Cầu + Lôi Bạo)
// ----------------------------------------------------------------------------

const skillTargets = {
  dummy: () => (!dummy.broken ? { x: dummy.x, y: dummy.y - 77 } : null),
};

export function targetPosition(id) {
  return id && skillTargets[id] ? skillTargets[id]() : null;
}

export function targetDistanceFromPlayer(point) {
  return Math.hypot(point.x - player.x, point.y - (player.y - 67));
}

export function acquireSkillTarget(range = getAutoTargetRange()) {
  let best = null;
  let closest = range;
  for (const id of Object.keys(skillTargets)) {
    const target = targetPosition(id);
    if (!target) continue;
    const distance = targetDistanceFromPlayer(target);
    if (distance <= closest) {
      best = id;
      closest = distance;
    }
  }
  return best;
}

export function shoulderPoint() {
  const sc = CHAR_SCALE * player.visualScale;
  const lx = (150 - 128) * sc;
  const ly = -(238 - 87) * sc;
  const lean = motion.lean || 0;
  const cosL = Math.cos(lean);
  const sinL = Math.sin(lean);
  return {
    x: player.x + player.facing * (lx * cosL - ly * sinL),
    y: player.y + (motion.bobOffset || 0) + (lx * sinL + ly * cosL),
  };
}

export function computeTargetAimPitch(c = charge) {
  const pos = c ? targetPosition(c.targetId) : null;
  if (!pos || targetDistanceFromPlayer(pos) > getAutoTargetRange()) {
    return 0;
  }
  const sh = shoulderPoint();
  const dx = Math.max(24, Math.abs(pos.x - sh.x));
  const playerTorsoY = player.y - 77 + (motion.bobOffset || 0);
  const rawDy = pos.y - playerTorsoY;
  const dy = Math.abs(rawDy) < 14 ? 0 : rawDy;
  return clamp(Math.atan2(dy, dx), -0.62, 1.08);
}

export function updateChargeTarget(c, dt = 0) {
  if (!c) return;
  const maxRange = getAutoTargetRange();
  let pos = targetPosition(c.targetId);
  if (!pos || targetDistanceFromPlayer(pos) > maxRange) {
    c.targetId = acquireSkillTarget(maxRange);
    pos = targetPosition(c.targetId);
  }
  if (pos && !c.fired && Math.abs(pos.x - player.x) > 3) {
    player.facing = pos.x >= player.x ? 1 : -1;
  }

  const desiredPitch = computeTargetAimPitch(c);
  if (c.aimPitch === undefined || dt <= 0) {
    c.aimPitch = desiredPitch;
  } else {
    c.aimPitch += (desiredPitch - c.aimPitch) * (1 - Math.exp(-dt * 18));
  }

  // Góc nâng cánh tay tương đối so với thân người (106° giơ chuẩn khi mục tiêu ngang tầm, 19°–89° hạ thấp khi mục tiêu ở dưới)
  const bodyPitch = c.aimPitch - (motion.lean || 0);
  c.targetArmDeg = clamp(106 - (bodyPitch * 180) / Math.PI, 19, 106);

  // Ánh xạ vào khung cánh tay trong charge_raise (khung 2..7) có trễ chống nhấp nháy
  let bestIdx = 7;
  let bestDiff = Infinity;
  for (let idx = 2; idx <= 7; idx++) {
    const diff = Math.abs(CHARGE_ANGLES[idx] - c.targetArmDeg);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = idx;
    }
  }
  if (
    c.aimFrame === undefined ||
    Math.abs(CHARGE_ANGLES[c.aimFrame] - c.targetArmDeg) > bestDiff + 3.5
  ) {
    c.aimFrame = bestIdx;
  }
}

export function lockedTargetForUI() {
  const maxRange = getAutoTargetRange();
  if (
    charge?.targetId &&
    targetPosition(charge.targetId) &&
    targetDistanceFromPlayer(targetPosition(charge.targetId)) <= maxRange
  ) {
    return charge.targetId;
  }
  if (
    loiBaoBlast?.phase === 'firing' &&
    loiBaoBlast.targetId &&
    targetPosition(loiBaoBlast.targetId) &&
    targetDistanceFromPlayer(targetPosition(loiBaoBlast.targetId)) <= maxRange
  ) {
    return loiBaoBlast.targetId;
  }
  if (
    ['seal', 'rise', 'fall'].includes(thuyKiem.phase) &&
    thuyKiem.targetId &&
    targetPosition(thuyKiem.targetId) &&
    targetDistanceFromPlayer(targetPosition(thuyKiem.targetId)) <= maxRange
  ) {
    return thuyKiem.targetId;
  }
  if (
    nguHanh.phase !== 'idle' &&
    nguHanh.targetId &&
    targetPosition(nguHanh.targetId) &&
    targetDistanceFromPlayer(targetPosition(nguHanh.targetId)) <= maxRange
  ) {
    return nguHanh.targetId;
  }
  for (const f of fireballs) {
    if (
      f.targetId &&
      targetPosition(f.targetId) &&
      targetDistanceFromPlayer(targetPosition(f.targetId)) <= maxRange
    ) {
      return f.targetId;
    }
  }
  return null;
}

export const chargePower = (c) =>
  clamp(0.24 + Math.max(0, (c?.time || 0) - CHARGE_RAISE_TIME) / 0.95, 0.24, 1.28);

export function chargeFrame() {
  if (!charge) return 0;
  const targetF = charge.aimFrame ?? 7;
  if (charge.phase === 'hold' || charge.phase === 'cast') return targetF;
  if (charge.phase === 'windup') {
    const f = clamp(charge.windupTime / Math.max(0.001, charge.windupDuration), 0, 1);
    return Math.round(charge.windupFrom + (targetF - charge.windupFrom) * f);
  }
  const progress = clamp(charge.time / CHARGE_RAISE_TIME, 0, 1);
  return Math.min(targetF, Math.floor(progress * (targetF + 0.99)));
}

export function chargeArmDegrees(c = charge) {
  if (!c) return 0;
  const targetDeg = CHARGE_ANGLES[c.aimFrame ?? 7] ?? c.targetArmDeg ?? 106;
  if (c.phase === 'hold' || c.phase === 'cast') return targetDeg;
  if (c.phase === 'windup') {
    const u = clamp(c.windupTime / Math.max(0.001, c.windupDuration), 0, 1);
    const fromDeg = CHARGE_ANGLES[c.windupFrom] ?? targetDeg;
    return fromDeg + (targetDeg - fromDeg) * u;
  }
  return targetDeg * clamp(c.time / CHARGE_RAISE_TIME, 0, 1);
}

export function chargeHand() {
  let sx;
  let sy;
  if (charge?.phase === 'cast') {
    const exact = clamp(charge.castTime * CAST_FRAME_RATE, 0, 11);
    const f0 = Math.min(11, Math.floor(exact));
    const f1 = Math.min(11, f0 + 1);
    const frac = exact - f0;
    const [x0, y0] = FIRE_CAST_HANDS[f0];
    const [x1, y1] = FIRE_CAST_HANDS[f1];
    sx = x0 + (x1 - x0) * frac;
    sy = y0 + (y1 - y0) * frac;
    // Nội suy mượt từ vị trí giơ tay theo góc ngắm trong 60ms đầu của cast_fire
    if (charge.castTime < 0.06) {
      const aHold = (chargeArmDegrees(charge) * Math.PI) / 180;
      const rx = 150 - Math.cos(aHold) + 58 * Math.sin(aHold);
      const ry = 87 + Math.sin(aHold) + 58 * Math.cos(aHold);
      const w = clamp(charge.castTime / 0.06, 0, 1);
      sx = rx + (sx - rx) * w;
      sy = ry + (sy - ry) * w;
    } else {
      // Bù góc bàn tay khi phóng chiêu theo độ cao mục tiêu
      const pitchOffset = clamp((charge.aimPitch || 0) * 0.65, -0.38, 0.58);
      const dx = sx - 150;
      const dy = sy - 87;
      const cosP = Math.cos(pitchOffset);
      const sinP = Math.sin(pitchOffset);
      sx = 150 + dx * cosP - dy * sinP;
      sy = 87 + dx * sinP + dy * cosP;
    }
  } else {
    const a = (chargeArmDegrees(charge) * Math.PI) / 180;
    sx = 150 - Math.cos(a) + 58 * Math.sin(a);
    sy = 87 + Math.sin(a) + 58 * Math.cos(a);
  }
  const sc = CHAR_SCALE * player.visualScale;
  const lx = (sx - 128) * sc;
  const ly = -(238 - sy) * sc;
  const lean = motion.lean || 0;
  const cosL = Math.cos(lean);
  const sinL = Math.sin(lean);
  return {
    x: player.x + player.facing * (lx * cosL - ly * sinL),
    y: player.y + (motion.bobOffset || 0) + (lx * sinL + ly * cosL),
  };
}

export function fireOrbPoint(c = charge) {
  if (c?.kind === 'lightning') return lightningOrbPoint(c);

  // Trong pha cast_fire, khung 1..3 nhân vật thu tay về ngực kết ấn trước khi đẩy ra trước ở khung 7.
  // Giữ điểm neo quả cầu chuyển động mượt từ vị trí bàn tay giơ tụ lực sang vị trí đẩy chưởng để cầu không giật lùi vào bụng.
  let hand;
  if (c?.phase === 'cast') {
    const aHold = (chargeArmDegrees(c) * Math.PI) / 180;
    const holdSx = 150 - Math.cos(aHold) + 58 * Math.sin(aHold);
    const holdSy = 87 + Math.sin(aHold) + 58 * Math.cos(aHold);

    const pitchOffset = clamp((c.aimPitch || 0) * 0.65, -0.38, 0.58);
    const cosP = Math.cos(pitchOffset);
    const sinP = Math.sin(pitchOffset);
    const launchDx = 192 - 150;
    const launchDy = 118 - 87;
    const launchSx = 150 + launchDx * cosP - launchDy * sinP;
    const launchSy = 87 + launchDx * sinP + launchDy * cosP;

    const u = clamp(((c.castTime || 0) * CAST_FRAME_RATE) / CAST_LAUNCH_FRAME, 0, 1);
    const smoothU = u * u * (3 - 2 * u);
    const sx = holdSx + (launchSx - holdSx) * smoothU;
    const sy = holdSy + (launchSy - holdSy) * smoothU;

    const sc = CHAR_SCALE * player.visualScale;
    const lx = (sx - 128) * sc;
    const ly = -(238 - sy) * sc;
    const lean = motion.lean || 0;
    const cosL = Math.cos(lean);
    const sinL = Math.sin(lean);
    hand = {
      x: player.x + player.facing * (lx * cosL - ly * sinL),
      y: player.y + (motion.bobOffset || 0) + (lx * sinL + ly * cosL),
    };
  } else {
    hand = chargeHand();
  }

  const r = HOA_CAU_SPEC.rad(c?.time || 0);
  const rWorld = r * (HOA_CAU_SPEC.pfxScale || 1.45);
  const phase = c?.phase;
  const castPush =
    phase === 'cast'
      ? 18 * Math.max(0, Math.min(1, ((c.castTime || 0) * CAST_FRAME_RATE) / CAST_LAUNCH_FRAME))
      : 0;
  const pitch = c?.aimPitch || 0;
  // Khi tụ lực, tâm quả cầu neo trực tiếp tại lòng bàn tay giơ lên; khi phóng chiêu đẩy mượt ra trước
  const distFromHand = phase === 'cast' ? castPush : 4;
  return {
    x: hand.x + player.facing * Math.cos(pitch) * distFromHand,
    y: hand.y + Math.sin(pitch) * distFromHand - 2,
  };
}

export function lightningOrbPoint(c = charge) {
  const hand = chargeHand();
  const pitch = c?.aimPitch || 0;
  // Neo trực tiếp tại lòng bàn tay giơ lên của nhân vật
  const distFromHand = 4;
  return {
    x: hand.x + player.facing * Math.cos(pitch) * distFromHand,
    y: hand.y + Math.sin(pitch) * distFromHand - 2,
  };
}

export function abortCharge(recover = false) {
  if (!charge) return;
  actionAudio.stopChargeLoop();
  const fromFrame = charge.phase === 'cast' ? 0 : chargeFrame();
  document.querySelectorAll('[data-charge]').forEach((b) => b.classList.remove('charging'));
  charge = null;
  updateFireBtnUI();
  updateLightningBtnUI();
  if (recover && fromFrame > 0 && !reactionLocked()) {
    startAction('charge_recover', { fromFrame, duration: 0.10 + fromFrame * 0.02 });
  }
}

export function beginCharge(kind = 'fire', pointerId = null) {
  if (
    !game.running ||
    !CHARGE_SKILLS[kind] ||
    charge ||
    (kind === 'lightning' && loiBaoBlast && loiBaoBlast.phase === 'firing') ||
    reactionLocked() ||
    (motion.action && !['brake', 'flight_stop'].includes(motion.action.name))
  ) {
    return false;
  }

  if (kind === 'lightning') {
    if (player.mana < LOI_BAO_SPEC.initialManaCost) {
      showNotice(`Không đủ ${LOI_BAO_SPEC.initialManaCost} linh lực để khởi tụ Lôi Bạo`);
      return false;
    }
    spendMana(LOI_BAO_SPEC.initialManaCost);
  } else if (player.mana < HOA_CAU_SPEC.minManaCost) {
    showNotice('Không đủ linh lực để tụ Hỏa Cầu Thuật');
    return false;
  }

  finishAction();
  motion.jumpBuffer = 0;
  player.vx = 0;
  motion.lean = 0;

  const targetId = acquireSkillTarget();
  const target = targetPosition(targetId);
  if (target && Math.abs(target.x - player.x) > 3) {
    player.facing = target.x >= player.x ? 1 : -1;
  }

  charge = {
    kind,
    pointerId,
    targetId,
    time: 0,
    chargedSeconds: 0,
    phase: 'raise',
    windupTime: 0,
    windupDuration: 0.1,
    windupFrom: 0,
    castTime: 0,
    fired: false,
    power: 0.24,
    aimPitch: 0,
    targetArmDeg: 106,
    aimFrame: 7,
  };
  updateChargeTarget(charge, 0);

  document
    .querySelectorAll('[data-charge]')
    .forEach((b) => b.classList.toggle('charging', b.dataset.charge === kind));
  updateFireBtnUI();
  updateLightningBtnUI();
  actionAudio.startChargeLoop(kind);
  setAnim('charge_raise', true);
  return true;
}

export function endCharge(cancel = false) {
  if (!charge || charge.phase === 'windup' || charge.phase === 'cast') return;
  if (cancel) {
    abortCharge(true);
    return;
  }
  const c = charge;
  const power = chargePower(c);

  if (c.kind === 'fire') {
    const desiredMana = Math.round(
      HOA_CAU_SPEC.minManaCost + Math.min(HOA_CAU_SPEC.maxChargeSeconds, c.time) * 4
    );
    if (player.mana < HOA_CAU_SPEC.minManaCost) {
      showNotice('Không đủ linh lực');
      abortCharge(true);
      return;
    }
    c.manaCost = Math.min(player.mana, desiredMana);
  } else {
    // Lôi Bạo đã trừ 100 linh lực lúc bắt đầu và 5 linh lực mỗi giây tụ lực
    c.manaCost = 0;
  }

  document.querySelectorAll('[data-charge]').forEach((b) => b.classList.remove('charging'));
  c.power = power;
  c.windupFrom = chargeFrame();
  const targetF = c.aimFrame ?? 7;
  c.windupTime = 0;
  c.windupDuration = Math.max(0.02, Math.abs(targetF - c.windupFrom) * 0.035);
  c.castTime = 0;
  c.fired = false;
  c.phase = 'windup';
  updateFireBtnUI();
  updateLightningBtnUI();
  setAnim('charge_raise');
}

function fireballTouchesTerrain(x, y, r) {
  const terrain = game.terrain;
  if (!terrain) return false;
  return (
    terrain.solid(x + r * 0.48, y) ||
    terrain.solid(x - r * 0.48, y) ||
    terrain.solid(x, y - r * 0.4) ||
    terrain.solid(x, y + r * 0.4)
  );
}

// ----------------------------------------------------------------------------
// Phóng Kỹ năng 2: Lôi Bạo (Thiên Lôi Hoàng Kim + Tê Liệt 5s)
// ----------------------------------------------------------------------------

export function spawnLightningBolt(c) {
  updateChargeTarget(c);
  const origin = lightningOrbPoint(c);
  const n = Math.max(0, c.chargedSeconds || 0);
  const face = player.facing;

  motion.squashX = 1.06;
  motion.squashY = 0.94;
  spawnAfterimage('#ffe066', 0.42, 0.22);
  addCameraShake(1.8 + Math.min(3.2, n * 0.35), 0.12);
  actionAudio.lightningStrike(n);

  let target = targetPosition(c.targetId);
  let targetId = c.targetId || null;

  if (!target || targetDistanceFromPlayer(target) > getAutoTargetRange()) {
    targetId = null;
    const maxDist = settings.thanThuc ? 1920 : 480;
    let tx = origin.x + face * maxDist;
    let ty = origin.y;
    const steps = settings.thanThuc ? 72 : 40;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const sx = origin.x + (tx - origin.x) * u;
      const sy = origin.y + (ty - origin.y) * u;
      if (dummyHitTest(sx, sy)) {
        tx = dummy.x;
        ty = dummy.y - 77;
        targetId = 'dummy';
        break;
      }
      if (game.terrain && game.terrain.solid(sx, sy)) {
        tx = sx;
        ty = sy;
        break;
      }
    }
    target = { x: tx, y: ty };
  }

  loiBaoCastId++;
  loiBaoBlast = {
    phase: 'firing',
    castId: loiBaoCastId,
    chargedSeconds: n,
    ringRadius: LOI_BAO_SPEC.initialRingRadius + n * LOI_BAO_SPEC.radiusPerSecond,
    blastAge: 0,
    impactTriggered: false,
    origin: { ...origin },
    target: { ...target },
    targetId,
  };

  fxEmit(
    'hitSpark',
    origin.x,
    origin.y,
    {
      height: 0,
      aim: face > 0 ? Math.PI : 0,
      palette: LIGHTNING_PALETTE.slice(1),
    },
    null,
    'front',
    { scale: 0.62, opacity: 0.9 }
  );
}

export function updateLightningBlast(dt) {
  if (!loiBaoBlast || loiBaoBlast.phase !== 'firing') return;
  const b = loiBaoBlast;
  const before = b.blastAge;
  b.blastAge += dt;

  if (b.targetId) {
    const pos = targetPosition(b.targetId);
    if (pos && !b.impactTriggered) {
      b.target = { ...pos };
    }
  }

  if (
    !b.impactTriggered &&
    before < LOI_BAO_SPEC.boltTravelSeconds &&
    b.blastAge >= LOI_BAO_SPEC.boltTravelSeconds
  ) {
    b.impactTriggered = true;
    const n = Math.max(0, b.chargedSeconds);
    const damage = LOI_BAO_SPEC.baseDamage + LOI_BAO_SPEC.extraDamagePerSecond * n;
    const beamWidth = Math.min(
      LOI_BAO_SPEC.maxRenderedBeamWidth,
      LOI_BAO_SPEC.baseBeamWidth + LOI_BAO_SPEC.beamWidthPerSecond * n
    );

    addCameraShake(2.6 + Math.min(4.2, n * 0.4), 0.18);
    actionAudio.lightningThunder(n);

    const hitNpc =
      !dummy.broken &&
      (b.targetId === 'dummy' ||
        Math.hypot(dummy.x - b.target.x, dummy.y - 77 - b.target.y) < 68 + beamWidth);

    if (hitNpc) {
      triggerHitStop(0.042);
      dummy.stun = LOI_BAO_SPEC.stunSeconds;
      dummyDamage(damage, {
        notice: false,
        palette: LIGHTNING_PALETTE.slice(1),
        sparkX: dummy.x,
        sparkY: dummy.y - 77,
      });
    }
  }

  if (b.blastAge > 0.78) {
    b.phase = 'idle';
  }
}

// ----------------------------------------------------------------------------
// Phóng Kỹ năng 1: Hỏa Cầu Thuật mới (PixelFX 100% Code + Cháy toàn thân 10s)
// ----------------------------------------------------------------------------

export function spawnFireball(c) {
  const hand = chargeHand();
  const focus = fireOrbPoint(c);
  const chargeTime = clamp(c.time || 0, 0, HOA_CAU_SPEC.maxChargeSeconds);
  const r = HOA_CAU_SPEC.rad(chargeTime);
  const rWorld = r * (HOA_CAU_SPEC.pfxScale || 1.45);
  const radius = Math.min(56, rWorld * 0.85);
  const power = c.power;
  updateChargeTarget(c);

  motion.squashX = 1.055;
  motion.squashY = 0.95;
  spawnAfterimage('#ffae52', 0.36, 0.20);
  addCameraShake(1.5 + Math.min(2.8, chargeTime * 0.25), 0.10);
  actionAudio.fireCast(chargeTime);

  const face = player.facing;
  const sx = focus.x;
  const sy = focus.y;
  const target = targetPosition(c.targetId);
  const pitch = c.aimPitch || 0;
  const initialAngle = target
    ? Math.atan2(target.y - sy, target.x - sx)
    : face > 0
    ? pitch
    : Math.PI - pitch;
  const flySpeed = 380 + Math.min(220, chargeTime * 18) + player.vx * face * 0.18;
  const vx = Math.cos(initialAngle) * flySpeed;
  const vy = Math.sin(initialAngle) * flySpeed;

  const along = (dummy.x - player.x) * face;
  const orbAlong = (sx - player.x) * face;
  const closeHit =
    !dummy.broken &&
    along > 0 &&
    along <= orbAlong + radius + NPC_HALF &&
    Math.abs(dummy.y - 76 - sy) < 78 + radius;

  let blocked = null;
  const traceSteps = Math.max(1, Math.ceil(Math.hypot(sx - hand.x, sy - hand.y) / 7));
  for (let k = 1; k <= traceSteps; k++) {
    const t = k / traceSteps;
    const x = hand.x + (sx - hand.x) * t;
    const y = hand.y + (sy - hand.y) * t;
    if (fireballTouchesTerrain(x, y, Math.min(radius, 8))) {
      blocked = { x, y };
      break;
    }
  }

  const fbData = {
    x: sx,
    y: sy,
    vx,
    vy,
    speed: flySpeed,
    targetId: c.targetId || null,
    face,
    radius,
    chargeTime,
    power,
    life: Math.max(1.5 + chargeTime * 0.08, (getAutoTargetRange() + 180) / flySpeed + 0.65),
  };

  if (blocked) {
    explodeFireball(fbData, blocked.x, blocked.y);
  } else if (closeHit) {
    const impactX = dummy.x - face * (npcShape().half + Math.min(7, radius * 0.35));
    explodeFireball(fbData, impactX, sy);
  } else {
    fireballs.push(fbData);
  }

  fxEmit(
    'hitSpark',
    hand.x + face * 10,
    hand.y,
    {
      height: 0,
      aim: face > 0 ? Math.PI : 0,
      palette: HOA_CAU_SPARK_PALETTE,
    },
    null,
    'front',
    { scale: 0.54, opacity: 0.82 }
  );
}

export function explodeFireball(fb, x, y) {
  const chargeTime = fb.chargeTime || 0;
  const r = HOA_CAU_SPEC.rad(chargeTime);
  addCameraShake(2.2 + Math.min(3.8, chargeTime * 0.32), 0.16);
  actionAudio.fireExplode(chargeTime);

  hoaCauExplosions.push({
    x,
    y,
    age: 0,
    chargeTime,
    r,
    seed: ++hoaCauSeed,
  });

  const dx = Math.abs(dummy.x - x);
  const dy = Math.abs(dummy.y - 76 - y);
  if (!dummy.broken && dx < 58 + fb.radius && dy < 78 + fb.radius) {
    triggerHitStop(0.036);
    const multiplier = skillCollisionRatio(fb);
    const dmg = HOA_CAU_SPEC.dmg(chargeTime) * multiplier;
    igniteDummy(chargeTime, multiplier);
    dummyDamage(dmg, {
      notice: false,
      palette: HOA_CAU_SPARK_PALETTE.slice(1),
    });
  }
}

export function updateCharge(dt) {
  if (!charge) return;
  const c = charge;
  updateChargeTarget(c, dt);
  if (c.phase === 'raise' || c.phase === 'hold') {
    c.time += dt;
    c.power = chargePower(c);
    actionAudio.updateChargeLoop(c.kind, c.time, c.chargedSeconds || 0);

    if (c.kind === 'fire') {
      updateFireBtnUI();
      if (c.time >= HOA_CAU_SPEC.maxChargeSeconds) {
        c.time = HOA_CAU_SPEC.maxChargeSeconds;
        showNotice('Hỏa Cầu đạt cực hạn 14s · Tự động phóng!');
        endCharge(false);
        return;
      }
    } else if (c.kind === 'lightning') {
      while (
        Math.floor(c.time + 1e-9) > c.chargedSeconds &&
        (c.phase === 'raise' || c.phase === 'hold')
      ) {
        if (player.mana >= LOI_BAO_SPEC.manaPerSecond) {
          spendMana(LOI_BAO_SPEC.manaPerSecond);
          c.chargedSeconds++;
          addCameraShake(1.0 + Math.min(2.2, c.chargedSeconds * 0.22), 0.08);
          actionAudio.lightningRing(c.chargedSeconds);
          actionAudio.updateChargeLoop(c.kind, c.time, c.chargedSeconds);
          updateLightningBtnUI();
        } else {
          showNotice('Cạn linh lực · Lôi Bạo tự động phóng!');
          endCharge(false);
          return;
        }
      }
    }

    if (c.time >= CHARGE_RAISE_TIME) c.phase = 'hold';
  } else if (c.phase === 'windup') {
    c.windupTime = Math.min(c.windupDuration, c.windupTime + dt);
    if (c.windupTime >= c.windupDuration) {
      c.phase = 'cast';
      c.castTime = 0;
      setAnim('cast_fire', true);
    }
  } else if (c.phase === 'cast') {
    c.castTime += dt;
    if (!c.fired && c.castTime >= CAST_LAUNCH_FRAME / CAST_FRAME_RATE) {
      if (c.kind === 'lightning') {
        c.fired = true;
        spawnLightningBolt(c);
      } else if (spendMana(c.manaCost)) {
        c.fired = true;
        spawnFireball(c);
      } else {
        abortCharge(true);
      }
    }
    if (charge === c && c.castTime >= CAST_DURATION) {
      charge = null;
      updateFireBtnUI();
      updateLightningBtnUI();
    }
  }
}

// ----------------------------------------------------------------------------
// Kỹ năng 3: Thổ Thuẫn (Thổ linh lực hộ thể · Chặn 100% sát thương bằng mana)
// ----------------------------------------------------------------------------

function spawnThoThuanShatter(disperse = false) {
  thoThuan.shatter = {
    age: 0,
    kind: disperse ? 'disperse' : 'break',
    rocks: createShatterRocks(130, 120),
  };
}

export function toggleThoThuan() {
  if (!game.running) return false;
  const isHuyetDu = settings.character === 'huyet_du';
  if (isHuyetDu && !thoThuan.active && bloodCastBlocked()) return false;
  const name = isHuyetDu ? 'Huyết Thuẫn' : 'Thổ Thuẫn';
  if (thoThuan.active) {
    thoThuan.active = false;
    spawnThoThuanShatter(true);
    if (isHuyetDu) {
      actionAudio.bloodShieldDisperse();
    } else {
      actionAudio.earthDisperse();
    }
    updateEarthBtnUI();
    showNotice(`Đã thu hồi ${name}`);
    return false;
  }
  if (player.mana <= 0) {
    showNotice(`Không đủ linh lực · Hãy chờ hồi linh lực để kích hoạt ${name}`);
    return false;
  }
  thoThuan.active = true;
  thoThuan.shatter = null;
  updateEarthBtnUI();
  addCameraShake(1.5, 0.10);
  if (isHuyetDu) {
    actionAudio.bloodShieldActivate();
  } else {
    actionAudio.earthActivate();
  }
  showNotice(`${name} khởi động · ${isHuyetDu ? 'Huyết quang ma đạo' : 'Thổ linh lực'} hộ thể (-2 MP/giây)`);
  return true;
}

export function breakThoThuan() {
  if (!thoThuan.active) return;
  const isHuyetDu = settings.character === 'huyet_du';
  const name = isHuyetDu ? 'Huyết Thuẫn' : 'Thổ Thuẫn';
  thoThuan.active = false;
  player.mana = 0;
  spawnThoThuanShatter(false);
  addCameraShake(3.2, 0.18);
  if (isHuyetDu) {
    actionAudio.bloodShieldBreak();
  } else {
    actionAudio.earthBreak();
  }
  updateEarthBtnUI();
  updateVitals();
  showNotice(`Linh lực đã cạn! ${name} tan vỡ!`);
}

export function receivePlayerDamage(amount = 100, opts = {}) {
  const dmg = Math.max(0, Math.round(Number(amount) || 0));
  if (dmg === 0) return { blocked: 0, hpLost: 0, manaSpent: 0, broken: false };

  const dir =
    opts.fromX !== undefined
      ? opts.fromX >= player.x
        ? 1
        : -1
      : !dummy.broken
      ? dummy.x >= player.x
        ? 1
        : -1
      : player.facing;

  const shieldCenterY =
    player.y +
    (motion.bobOffset || 0) +
    2 -
    (THO_THUAN_SPEC.feetOffset - 3) * THO_THUAN_SPEC.pfxScale;
  const hitY = opts.hitY ?? shieldCenterY;

  if (thoThuan.active && player.mana > 0) {
    const cost = Math.ceil(THO_THUAN_SPEC.hitFlatCost + THO_THUAN_SPEC.hitManaFactor * dmg);
    const spent = Math.min(cost, player.mana);
    player.mana = Math.max(0, player.mana - spent);
    player.lastManaCost = spent;
    thoThuan.blockedDamage += dmg;
    thoThuan.blockedHits++;
    thoThuan.absorbedMana += spent;

    const impactX = player.x + dir * THO_THUAN_SPEC.rx * THO_THUAN_SPEC.pfxScale * 0.9;
    thoThuan.impacts.push({
      x: impactX,
      y: hitY,
      age: 0,
      damage: dmg,
      blocked: true,
      seed: ++thoThuan.shotSeed,
    });
    addCameraShake(clamp(dmg / 140, 1.2, 3.0), 0.12);

    const broken = player.mana <= 0.0001;
    if (broken) {
      breakThoThuan();
    } else {
      const isHuyetDu = settings.character === 'huyet_du';
      if (isHuyetDu) {
        actionAudio.bloodShieldBlock(dmg);
      } else {
        actionAudio.earthBlock(dmg);
      }
      updateEarthBtnUI();
      updateVitals();
      if (opts.notice !== false) {
        const name = isHuyetDu ? 'Huyết Thuẫn' : 'Thổ Thuẫn';
        showNotice(`${name} đã đỡ ${dmg} sát thương · Tiêu hao ${Math.round(spent)} linh lực`);
      }
    }
    return { blocked: dmg, hpLost: 0, manaSpent: spent, broken };
  }

  const lost = Math.min(player.hp, dmg);
  player.hp = Math.max(0, player.hp - lost);
  thoThuan.damageTaken += lost;
  thoThuan.impacts.push({
    x: player.x + dir * 13,
    y: hitY,
    age: 0,
    damage: dmg,
    blocked: false,
    seed: ++thoThuan.shotSeed,
  });

  if (player.hp <= 0) {
    updateVitals();
    showNotice('Sinh mệnh cạn kiệt · Bại trận!');
  } else {
    updateVitals();
    if (opts.notice !== false) {
      showNotice(`Thổ Thuẫn đang tắt · Mất ${lost} máu`);
    }
  }
  return { blocked: 0, hpLost: lost, manaSpent: 0, broken: false };
}

export function fireThoThuanTestShot(damage) {
  if (!game.running || thoThuan.shots.length >= 6) return false;
  const dmg = Number(damage) || [100, 300, 700][thoThuan.shotSeed % 3];
  const fromRight = !dummy.broken ? dummy.x >= player.x : player.facing >= 0;
  const distToDummy = Math.abs(dummy.x - player.x);
  const startX =
    !dummy.broken && distToDummy > 110 && distToDummy < 480
      ? dummy.x
      : player.x + (fromRight ? 300 : -300);
  const dir = startX >= player.x ? -1 : 1;
  const shieldCenterY =
    player.y +
    (motion.bobOffset || 0) +
    2 -
    (THO_THUAN_SPEC.feetOffset - 3) * THO_THUAN_SPEC.pfxScale;

  thoThuan.shotSeed++;
  const shotY = shieldCenterY + ((thoThuan.shotSeed % 3) - 1) * 18;
  thoThuan.shots.push({
    x: startX,
    y: shotY,
    dir,
    damage: dmg,
    age: 0,
    seed: thoThuan.shotSeed,
  });
  showNotice(`Đòn tấn công ${dmg} sát thương đang bay tới Diệp Tu!`);
  return true;
}

export function updateThoThuan(dt) {
  if (thoThuan.active) {
    player.mana = Math.max(0, player.mana - THO_THUAN_SPEC.upkeepPerSecond * dt);
    if (player.mana <= 0.0001) {
      breakThoThuan();
    }
  }

  for (let i = thoThuan.shots.length - 1; i >= 0; i--) {
    const s = thoThuan.shots[i];
    s.age += dt;
    const toPlayer = player.x >= s.x ? 1 : -1;
    s.dir = toPlayer;
    s.x += toPlayer * THO_THUAN_SPEC.projectileSpeed * dt;

    const shieldRadiusWorld = THO_THUAN_SPEC.rx * THO_THUAN_SPEC.pfxScale * 0.93;
    const limitDist = thoThuan.active ? shieldRadiusWorld : 14;
    if (Math.abs(s.x - player.x) <= limitDist) {
      const res = receivePlayerDamage(s.damage, {
        fromX: s.x - toPlayer * 45,
        hitY: s.y,
      });
      if (!res.blocked) {
        applyUnblockedPlayerHit(s.damage >= 300 ? 'knockdown' : 'hurt');
      }
      thoThuan.shots.splice(i, 1);
    } else if (s.age > 3.5) {
      thoThuan.shots.splice(i, 1);
    }
  }

  for (let i = thoThuan.impacts.length - 1; i >= 0; i--) {
    thoThuan.impacts[i].age += dt;
    if (thoThuan.impacts[i].age > 1.05) {
      thoThuan.impacts.splice(i, 1);
    }
  }

  if (thoThuan.shatter) {
    thoThuan.shatter.age += dt;
    if (thoThuan.shatter.age > 1.65) {
      thoThuan.shatter = null;
    }
  }
}

// ============================================================================
// KỸ NĂNG 4: THỦY KIẾM V2 · TAM KIẾM GIÁNG LÂM
// ============================================================================
export function resetThuyKiemCooldown() {
  thuyKiem.cd = 0;
  if (thuyKiem.phase === 'cooldown') {
    thuyKiem.phase = 'ready';
    thuyKiem.stage = 0;
  }
  updateWaterBtnUI();
}

export function castThuyKiem() {
  if (!game.running) return false;
  if (reactionLocked()) return false;
  if (thuyKiem.phase === 'cooldown' || thuyKiem.cd > 0) {
    showNotice(`Thủy Kiếm đang hồi chiêu: còn ${thuyKiem.cd.toFixed(1)}s`);
    return false;
  }
  if (['seal', 'rise', 'fall'].includes(thuyKiem.phase)) {
    showNotice('Đang kết ấn Thủy Kiếm · Tam Kiếm Giáng Lâm');
    return false;
  }
  if (player.mana < THUY_KIEM_SPEC.manaCost) {
    showNotice(`Không đủ ${THUY_KIEM_SPEC.manaCost} linh lực để thi triển Thủy Kiếm`);
    return false;
  }
  if (charge) {
    abortCharge(true);
  }

  const targetId = acquireSkillTarget();
  const targetPos = targetPosition(targetId);
  thuyKiem.targetId = targetPos ? targetId : null;

  let anchorX = player.x + player.facing * 260;
  let groundY = game.terrain ? game.terrain.firstSolidY(anchorX) - 0.5 : player.y;

  if (targetPos) {
    anchorX = targetPos.x;
    groundY = dummy.y;
    const dx = targetPos.x - player.x;
    if (Math.abs(dx) > 6) player.facing = dx > 0 ? 1 : -1;
  }

  spendMana(THUY_KIEM_SPEC.manaCost);
  startThuyKiemSeal(thuyKiem, { x: anchorX, feetY: groundY });
  startAction('hand_seal', { duration: THUY_KIEM_SPEC.castSeconds });
  setAnim('hand_seal', true);
  fxSeal(player.x + player.facing * 20, player.y - 68);
  actionAudio.waterSeal();
  updateWaterBtnUI();
  showNotice('Thủy Kiếm V2 · Kết ấn 5 giây khai mở Thủy Pháp Trận!');
  return true;
}

export function updateThuyKiem(dt) {
  const oldSwords = new Map(thuyKiem.swords.map(s => [s, { x: s.x, tip: s.tip }]));
  const previousStage = thuyKiem.stage;
  // Cập nhật hồi chiêu
  if (thuyKiem.cd > 0) {
    thuyKiem.cd = Math.max(0, thuyKiem.cd - dt);
    if (thuyKiem.cd <= 0 && thuyKiem.phase === 'cooldown') {
      thuyKiem.phase = 'ready';
      thuyKiem.stage = 0;
      showNotice('Thủy Kiếm V2 đã hồi chiêu xong!');
    }
  }

  // Cập nhật vị trí mục tiêu nếu còn sống trong tầm
  if (thuyKiem.targetId && !dummy.broken && dummy.hp > 0) {
    const dist = Math.hypot(dummy.x - player.x, (dummy.y - 64) - (player.y - 62));
    if (dist <= getAutoTargetRange() * 1.25) {
      thuyKiem.anchorX = dummy.x;
      thuyKiem.anchorY = dummy.y;
    }
  }

  if (thuyKiem.phase === 'seal') {
    if (reactionLocked()) {
      thuyKiem.phase = 'cooldown';
      thuyKiem.cd = THUY_KIEM_SPEC.cooldownSeconds;
      showNotice('Thủy Kiếm bị ngắt do trúng đòn!');
      return;
    }
    thuyKiem.cast += dt;

    // Giữ động tác kết ấn liên tục trong 5 giây nếu người chơi không bị trúng đòn ngắt
    if (!reactionLocked() && motion.action?.name === 'hand_seal') {
      player.vx *= 0.6;
    }

    if (thuyKiem.cast >= THUY_KIEM_SPEC.castSeconds) {
      startThuyKiemRays(thuyKiem, { x: thuyKiem.anchorX, feetY: thuyKiem.anchorY });
      actionAudio.waterRays();
      addCameraShake(3.2, 0.14);
      fxEmit('hitSpark', player.x + player.facing * 22, player.y - 68, {
        palette: ['#071b30', '#124a78', '#2289c7', '#56d1f7', '#a8f5ff', '#ffffff'],
      });
      showNotice('Tam đạo Thủy Quang phóng thẳng lên trời!');
    }
  } else if (thuyKiem.phase === 'rise') {
    thuyKiem.stage += dt;
    if (thuyKiem.stage >= THUY_KIEM_SPEC.raySeconds) {
      startThuyKiemDownfall(thuyKiem, { x: thuyKiem.anchorX, feetY: thuyKiem.anchorY });
      showNotice('Thủy Kiếm V2 · Tam Kiếm Giáng Lâm!');
    }
  } else if (thuyKiem.phase === 'fall') {
    thuyKiem.stage += dt;
    let allLanded = true;

    for (let i = 0; i < 3; i++) {
      const s = thuyKiem.swords[i];
      if (!s) continue;
      if (!s.land) {
        allLanded = false;
        const local = thuyKiem.stage - s.start;
        if (local >= THUY_KIEM_SPEC.strikeFallSeconds) {
          const impactTime = dt > 0 ? (s.start + THUY_KIEM_SPEC.strikeFallSeconds - previousStage) / dt : 1;
          queueSkillImpact(s, impactTime, () => {
            triggerThuyKiemSwordImpact(thuyKiem, s, s.targetY);
            actionAudio.waterImpact(s.i);
            addCameraShake(s.i === 2 ? 7.8 : 5.4, s.i === 2 ? 0.22 : 0.16);
            triggerHitStop(s.i === 2 ? 0.045 : 0.028);
  
            // Kiểm tra sát thương lên NPC
            if (!dummy.broken && dummy.hp > 0) {
              const distToDummy = Math.hypot(dummy.x - s.x, dummy.y - s.targetY);
              if (distToDummy <= 145) {
                const dmg = (THUY_KIEM_SPEC.swordDamages[s.i] || 120) * skillCollisionRatio(s);
                dummyDamage(dmg, {
                  slowDuration: THUY_KIEM_SPEC.slowSeconds,
                  color: '#8bf4ff',
                  noAnim: false,
                });
                fxHit(dummy.x, dummy.y - 68);
              }
            }
          });
        }
      }
    }

    if (allLanded && thuyKiem.hitCount >= 3) {
      thuyKiem.phase = 'cooldown';
      thuyKiem.cd = THUY_KIEM_SPEC.cooldownSeconds;
      thuyKiem.stage = 0;
    }
  }

  stepThuyKiemParticles(thuyKiem, dt);
  if (thuyKiem.phase === 'fall') for (const sword of thuyKiem.swords) {
    if (sword.land || thuyKiem.stage < sword.start) continue;
    const old = oldSwords.get(sword) || { x: sword.x, tip: sword.portalY };
    const t0 = dt > 0 ? Math.max(0, (sword.start - previousStage) / dt) : 0;
    const t1 = dt > 0 ? Math.min(1, (sword.start + THUY_KIEM_SPEC.strikeFallSeconds - previousStage) / dt) : 1;
    const len = 96 * [1.18, 1.28, 1.57][sword.i] * 1.24;
    for (let j = 0; j <= 4; j++) {
      const offset = len * j / 4;
      trackSkillSegment({ ref: sword, side: 'player', kind: 'water_sword', x0: old.x, y0: old.tip-offset, x1: sword.x, y1: sword.tip-offset, t0, t1, radius: 21, power: THUY_KIEM_SPEC.swordDamages[sword.i], onDestroy: () => { if (!sword.land) { sword.land = true; thuyKiem.hitCount++; } } });
    }
  }
  updateWaterBtnUI();
}

// ============================================================================
// KỸ NĂNG 5: NGŨ HÀNH DIỆT SÁT TRẬN (DUY TRÌ LINH LỰC & HỢP NHẤT PHÁ TRẬN)
// ============================================================================
export function toggleNguHanh() {
  if (!game.running) return false;
  if (reactionLocked()) return false;

  // Nếu đang mở trận (launch / form / prison) -> Chủ động Thu trận & Hợp nhất 5 trụ thành Vụ Nổ 200 ST
  if (['launch', 'form', 'prison'].includes(nguHanh.phase)) {
    startNguHanhConverge(nguHanh);
    actionAudio.fiveConverge();
    addCameraShake(4.8, 0.16);
    updateFiveElementsBtnUI();
    showNotice('Chủ động thu trận · Ngũ Hành Hợp Nhất kích phát Đại Bạo Tạc!');
    return false;
  }

  if (['converge', 'blast'].includes(nguHanh.phase)) {
    return false;
  }

  // Khai trận mới: kiểm tra 200 MP khởi động
  if (!spendMana(NGU_HANH_SPEC.initialManaCost)) {
    showNotice(
      `Không đủ Linh Lực khai mở Ngũ Hành Diệt Sát Trận (Cần ${NGU_HANH_SPEC.initialManaCost} MP)`
    );
    return false;
  }

  if (charge) {
    abortCharge(true);
  }

  const targetId = acquireSkillTarget();
  const targetPos = targetPosition(targetId);
  let stageX = player.x + player.facing * 250;
  let stageY = player.y;
  if (targetPos) {
    stageX = dummy.x;
    stageY = dummy.y;
    const dx = stageX - player.x;
    if (Math.abs(dx) > 6) player.facing = dx > 0 ? 1 : -1;
  } else {
    stageX = clamp(player.x + player.facing * 250, 120, WORLD_W - 120);
    stageY = game.terrain ? game.terrain.firstSolidY(stageX) - 0.5 : player.y;
  }

  startNguHanhLaunch(nguHanh, stageX, stageY, targetPos ? targetId : null);
  startAction('hand_seal', 0.62);
  setAnim('hand_seal', true);
  fxSeal(player.x + player.facing * 20, player.y - 68);
  actionAudio.fiveLaunch();
  addCameraShake(4.2, 0.15);
  updateVitals();
  updateFiveElementsBtnUI();
  showNotice('Khai mở Ngũ Hành Diệt Sát Trận · 5 cột Kim Mộc Thủy Hỏa Thổ vây khốn mục tiêu!');
  return true;
}

export function updateNguHanh(dt) {
  if (nguHanh.phase === 'idle') {
    dummy.trapped = false;
    stepNguHanhParticlesAndStreams(nguHanh, dt);
    updateFiveElementsBtnUI();
    return;
  }

  // Giữ tâm trận khóa vào mục tiêu nếu mục tiêu còn sống
  if (
    ['launch', 'form', 'prison'].includes(nguHanh.phase) &&
    nguHanh.targetId &&
    !dummy.broken &&
    dummy.hp > 0
  ) {
    const distToCenter = Math.hypot(dummy.x - nguHanh.stageX, dummy.y - nguHanh.stageY);
    if (distToCenter <= 180) {
      nguHanh.stageX = dummy.x;
      nguHanh.stageY = dummy.y;
      dummy.trapped = true;
      dummy.vx = 0;
    } else {
      dummy.trapped = false;
    }
  } else {
    dummy.trapped = false;
  }

  nguHanh.clock += dt;

  if (nguHanh.phase === 'launch') {
    const launchDone = stepNguHanhParticlesAndStreams(nguHanh, dt);
    if (launchDone || nguHanh.clock >= 1.25) {
      startNguHanhForm(nguHanh);
      actionAudio.fiveForm();
      addCameraShake(5.5, 0.18);
    }
  } else if (nguHanh.phase === 'form') {
    stepNguHanhParticlesAndStreams(nguHanh, dt);
    if (nguHanh.clock >= NGU_HANH_SPEC.formSeconds) {
      startNguHanhPrison(nguHanh);
      showNotice('Ngũ Hành Diệt Sát Trận đã thành hình · Rút 10 MP/s (Quá 20s tăng dần)!');
    }
  } else if (nguHanh.phase === 'prison') {
    stepNguHanhParticlesAndStreams(nguHanh, dt);

    // Tiêu hao linh lực duy trì theo thời gian thực (0..20s: 10 MP/s; >20s: +1 MP/s mỗi giây vượt ngưỡng)
    const exhausted = drainNguHanhMana(nguHanh.lockSec, dt);
    nguHanh.lockSec += dt;

    if (
      !nguHanh.overloadedNotified &&
      nguHanh.lockSec >= NGU_HANH_SPEC.baseLimitSeconds
    ) {
      nguHanh.overloadedNotified = true;
      showNotice('Ngũ Hành Trận quá 20s: Linh Lực tiêu hao tăng dần!');
    }

    const currentPulses = Math.floor(nguHanh.lockSec / NGU_HANH_SPEC.pulseIntervalSeconds);
    while (nguHanh.pulses < currentPulses) {
      nguHanh.pulses++;
      const elIdx = (nguHanh.pulses - 1) % 5;
      const el = NGU_HANH_ELEMENTS[elIdx];
      triggerNguHanhBeatVisuals(nguHanh, el);
      actionAudio.fivePulse(nguHanh.pulses);

      if (!dummy.broken && dummy.hp > 0) {
        const dist = Math.hypot(dummy.x - nguHanh.stageX, dummy.y - nguHanh.stageY);
        if (dist <= 175) {
          dummyDamage(NGU_HANH_SPEC.pulseDamage, {
            color: el.c,
            noAnim: true,
          });
          fxHit(dummy.x, dummy.y - 68);
        }
      }
    }

    // Nếu cạn sạch Linh Lực -> Tự động hợp nhất 5 trụ nổ 200 ST kết liễu
    if (exhausted || player.mana <= 1e-4) {
      player.mana = 0;
      startNguHanhConverge(nguHanh);
      actionAudio.fiveConverge();
      addCameraShake(5.5, 0.18);
      showNotice('Cạn Linh Lực · Ngũ Hành Diệt Sát Trận tự động hợp nhất phát nổ!');
    }
    updateVitals();
  } else if (nguHanh.phase === 'converge') {
    stepNguHanhParticlesAndStreams(nguHanh, dt);

    if (nguHanh.clock >= NGU_HANH_SPEC.convergeSeconds) {
      startNguHanhDetonate(nguHanh);
      actionAudio.fiveBlast();
      addCameraShake(9.5, 0.28);
      triggerHitStop(0.055);

      if (!dummy.broken && dummy.hp > 0) {
        const dist = Math.hypot(dummy.x - nguHanh.stageX, dummy.y - nguHanh.stageY);
        if (dist <= 220) {
          dummyDamage(NGU_HANH_SPEC.finisherDamage, {
            knockdown: true,
            color: '#fff3a6',
          });
          fxHit(dummy.x, dummy.y - 68);
        }
      }
      dummy.trapped = false;
    }
  } else if (nguHanh.phase === 'blast') {
    stepNguHanhParticlesAndStreams(nguHanh, dt);
    dummy.trapped = false;
    if (nguHanh.clock >= NGU_HANH_SPEC.blastSeconds) {
      nguHanh.phase = 'idle';
      nguHanh.clock = 0;
    }
  }

  updateFiveElementsBtnUI();
}

export function updateFireballs(dt) {
  updateLightningBlast(dt);
  updateThoThuan(dt);
  updateThuyKiem(dt);
  updateNguHanh(dt);
  stepHuyetThu(huyetThu, dt, player, dummy);
  stepHuyetKimTuyen(huyetKimTuyen, dt, player, dummy);
  stepThonLinhHuyet(thonLinhHuyet, dt, player, dummy);
  stepHuyetBao(huyetBao, dt, player, dummy);
  if (huyetKimTuyen.phase === 'charge') {
    updateVitals();
  }
  updateHuyetDuBtnUI();

  for (let i = hoaCauExplosions.length - 1; i >= 0; i--) {
    hoaCauExplosions[i].age += dt;
    if (hoaCauExplosions[i].age >= HOA_CAU_SPEC.explosionDuration) {
      hoaCauExplosions.splice(i, 1);
    }
  }

  for (let i = fireballs.length - 1; i >= 0; i--) {
    const fb = fireballs[i];
    fb.life -= dt;
    if (fb.life <= 0) {
      explodeFireball(fb, fb.x, fb.y);
      fireballs.splice(i, 1);
      continue;
    }
    const speed = fb.speed || Math.hypot(fb.vx, fb.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / 8));
    const stepDt = dt / steps;
    let hit = false;

    for (let s = 0; s < steps; s++) {
      const candidate = targetPosition(fb.targetId);
      const target =
        candidate && targetDistanceFromPlayer(candidate) <= getAutoTargetRange() ? candidate : null;
      if (target) {
        const desired = Math.atan2(target.y - fb.y, target.x - fb.x);
        const current = Math.atan2(fb.vy, fb.vx);
        const difference = Math.atan2(Math.sin(desired - current), Math.cos(desired - current));
        const next =
          current +
          clamp(difference, -FIREBALL_WEAK_TURN_RATE * stepDt, FIREBALL_WEAK_TURN_RATE * stepDt);
        fb.vx = Math.cos(next) * speed;
        fb.vy = Math.sin(next) * speed;
      } else {
        fb.targetId = null;
      }

      const x0 = fb.x, y0 = fb.y;
      fb.x += fb.vx * stepDt;
      fb.y += fb.vy * stepDt;
      trackSkillSegment({ ref: fb, side: 'player', kind: 'fireball', x0, y0, x1: fb.x, y1: fb.y, t0: s / steps, t1: (s + 1) / steps, radius: fb.radius, power: HOA_CAU_SPEC.dmg(fb.chargeTime || 0), onDestroy: () => { const i = fireballs.indexOf(fb); if (i >= 0) fireballs.splice(i, 1); } });
      if (dummyHitTest(fb.x, fb.y) || fireballTouchesTerrain(fb.x, fb.y, fb.radius)) {
        const hitX = fb.x, hitY = fb.y;
        queueSkillImpact(fb, (s + 1) / steps, () => { explodeFireball(fb, hitX, hitY); const i = fireballs.indexOf(fb); if (i >= 0) fireballs.splice(i, 1); });
        hit = true;
        break;
      }
    }

    if (hit) {
      continue;
    }
    if (fb.x < -50 || fb.x > WORLD_W + 50 || fb.y < -1600 || fb.y > WORLD_H + 120) {
      fireballs.splice(i, 1);
      continue;
    }
  }
}

export function drawTargetLock() {
  const ctx = game.ctx;
  if (!ctx) return;

  const z = settings.zoom || 0.7;
  const invScale = clamp(0.70 / z, 1, 3.2);
  const maxRange = getAutoTargetRange();
  const halfViewW = game.viewW / (2 * z) + 180;
  const halfViewH = game.viewH / (2 * z) + 180;

  const heroScreenX = player.x - camera.x + game.viewW / 2;
  const heroScreenY = player.y - 62 - camera.y + game.viewH / 2;

  // 1. Hiệu ứng sóng Thần Thức lan tỏa và định vị Linh Nhãn khi bật Thần Thức 5x
  if (settings.thanThuc || z < 0.62 || settings.thanThucPulse > 0) {
    ctx.save();

    // Sóng tâm nhãn lan tỏa lúc mới kích hoạt Thần Thức
    if (settings.thanThucPulse > 0) {
      const p = 1 - settings.thanThucPulse;
      const waveR = 40 + p * 2600;
      ctx.save();
      ctx.translate(heroScreenX, heroScreenY);
      ctx.strokeStyle = '#6cf0ff';
      ctx.lineWidth = Math.max(1.5, 2.2 * invScale);
      ctx.globalAlpha = Math.max(0, (1 - p) * 0.55);
      ctx.beginPath();
      ctx.arc(0, 0, waveR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Định vị Chân Thân (Diệp Tu) và Mục Tiêu bằng Linh Nhãn khi đang ở góc nhìn xa
    if (settings.thanThuc || z < 0.55) {
      const fade = clamp((0.66 - z) / 0.35, 0.25, 1);
      const pulse = 1 + 0.08 * Math.sin(game.elapsed * 4.5);

      // Vòng sáng Chân Thân quanh Diệp Tu
      ctx.save();
      ctx.translate(heroScreenX, heroScreenY);
      ctx.scale(invScale, invScale);
      ctx.globalAlpha = 0.85 * fade;
      ctx.strokeStyle = '#6cf0ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = '#f8e09b';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(0, 0, 33, game.elapsed * 0.9, game.elapsed * 0.9 + Math.PI * 1.65);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 10px system-ui,sans-serif';
      ctx.shadowColor = '#04101c';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#9ef7ff';
      ctx.fillText('👁 CHÂN THÂN', 0, 36);
      ctx.restore();

      // Định vị Linh Nhãn trên mục tiêu NPC (nếu còn sống)
      const npcTarget = targetPosition('dummy');
      if (npcTarget) {
        const tx = npcTarget.x - camera.x + game.viewW / 2;
        const ty = npcTarget.y - camera.y + game.viewH / 2;
        const dist = Math.round(targetDistanceFromPlayer(npcTarget));

        // Đường tơ linh thức nối từ Chân Thân tới Mục Tiêu
        ctx.save();
        ctx.globalAlpha = 0.36 * fade;
        ctx.strokeStyle = dist <= maxRange ? '#72f2eb' : '#9ab4c7';
        ctx.lineWidth = Math.max(1, 1.3 * invScale);
        ctx.setLineDash([8 * invScale, 6 * invScale]);
        ctx.beginPath();
        ctx.moveTo(heroScreenX, heroScreenY);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.restore();

        // Nếu chưa hiện khung khóa đỏ/vàng lúc đang tụ chiêu thì hiện vòng Linh Nhãn định vị mục tiêu
        if (!lockedTargetForUI()) {
          ctx.save();
          ctx.translate(tx, ty);
          ctx.scale(invScale, invScale);
          ctx.globalAlpha = 0.88 * fade;
          ctx.strokeStyle = '#ffd978';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.arc(0, 0, 28 * pulse, 0, Math.PI * 2);
          ctx.stroke();

          // Bốn mũi định vị thoi quanh mục tiêu
          for (let k = 0; k < 4; k++) {
            const a = (k * Math.PI) / 2 + game.elapsed * 0.6;
            const r0 = 31;
            const r1 = 37;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
            ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
            ctx.stroke();
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.font = 'bold 10px system-ui,sans-serif';
          ctx.shadowColor = '#04101c';
          ctx.shadowBlur = 4;
          ctx.fillStyle = '#ffe699';
          ctx.fillText(`MỤC TIÊU · ${dist} / ${maxRange}`, 0, -38);
          ctx.restore();
        }
      }
    }

    ctx.restore();
  }

  // 2. Khung khóa mục tiêu khi đang tụ lực hoặc đạn đang truy đuổi
  const id = lockedTargetForUI();
  const target = targetPosition(id);
  if (!target) return;

  if (
    Math.abs(target.x - camera.x) > halfViewW ||
    Math.abs(target.y - camera.y) > halfViewH
  ) {
    return;
  }

  const sx = target.x - camera.x + game.viewW / 2;
  const sy = target.y - camera.y + game.viewH / 2;

  const isLightning =
    charge?.kind === 'lightning' || (loiBaoBlast && loiBaoBlast.phase === 'firing');
  const r = 34 + Math.sin(game.elapsed * 5) * 1.5;
  const edge = 12;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(invScale, invScale);
  ctx.strokeStyle = isLightning ? '#ffd84a' : '#ff7166';
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.93;

  for (let k = 0; k < 4; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 2);
    ctx.beginPath();
    ctx.moveTo(r - edge, -r);
    ctx.lineTo(r, -r);
    ctx.lineTo(r, -r + edge);
    ctx.stroke();
    ctx.restore();
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = '#061019';
  ctx.shadowBlur = 4;
  ctx.fillStyle = isLightning ? '#fff0a6' : '#ffd0bc';
  ctx.font = 'bold 10px system-ui,sans-serif';
  ctx.fillText(
    'KHÓA · ' + Math.round(targetDistanceFromPlayer(target)) + ' / ' + maxRange,
    0,
    -r - 9
  );
  ctx.restore();
}

// Giao diện độc lập tương thích với /Tho_Thuan_Skill_03_PixelFX_OFFLINE.html
window.ThoThuanSkill = {
  CONFIG: THO_THUAN_SPEC,
  activate: toggleThoThuan,
  receiveDamage: (amount) => receivePlayerDamage(amount),
  getState: () => ({
    hp: player.hp,
    mana: player.mana,
    shield: thoThuan.active,
    blockedDamage: thoThuan.blockedDamage,
    blockedHits: thoThuan.blockedHits,
    damageTaken: thoThuan.damageTaken,
    absorbedMana: thoThuan.absorbedMana,
  }),
  refresh: () => {
    player.hp = player.maxHp;
    player.mana = player.maxMana;
    thoThuan.active = false;
    thoThuan.blockedDamage = 0;
    thoThuan.blockedHits = 0;
    thoThuan.damageTaken = 0;
    thoThuan.absorbedMana = 0;
    thoThuan.shots = [];
    thoThuan.impacts = [];
    thoThuan.shatter = null;
    updateEarthBtnUI();
    updateVitals();
  },
  step: (dt) => updateThoThuan(dt),
  attack: (d = 100) => fireThoThuanTestShot(d),
};

// Giao diện độc lập tương thích với /Thuy_Kiem_V2_Nang_Cap_Hieu_Ung_OFFLINE.html
window.ThuyKiemSkill = {
  CONFIG: THUY_KIEM_SPEC,
  cast: castThuyKiem,
  resetCooldown: resetThuyKiemCooldown,
  getState: () => ({
    phase: thuyKiem.phase,
    cooldown: thuyKiem.cd,
    sealProgress: Math.min(1, thuyKiem.cast / THUY_KIEM_SPEC.castSeconds),
    slowRemaining: dummy.slow,
    anchorX: thuyKiem.anchorX,
  }),
};

// Giao diện độc lập tương thích với /Ngu_Hanh_Diet_Sat_Tran_PixelFX_Duy_Tri_V2_OFFLINE.html
window.NguHanhSkill = {
  CONFIG: NGU_HANH_SPEC,
  toggle: toggleNguHanh,
  getState: () => ({
    phase: nguHanh.phase,
    lockSec: nguHanh.lockSec,
    upkeepRate: isNguHanhSustaining() ? getNguHanhUpkeepRate(nguHanh.lockSec) : 0,
    totalDamage: nguHanh.totalDamage,
    mana: player.mana,
  }),
};

