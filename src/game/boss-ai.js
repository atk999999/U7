import { game, player, dummy, WORLD_W, NPC_HALF, HERO_HALF, settings, showNotice } from './state.js';
import { receivePlayerDamage } from './skills.js';
import { applyUnblockedPlayerHit } from './character.js';
import { createHuyetThuState, castHuyetThu, stepHuyetThu, renderHuyetThuWorld } from './huyet-thu.js';
import { createHuyetKimTuyenState, beginHuyetKimTuyen, releaseHuyetKimTuyen, stepHuyetKimTuyen, renderHuyetKimTuyenWorld } from './huyet-kim-tuyen.js';
import { createThonLinhHuyetState, castThonLinhHuyet, stopThonLinhHuyet, stepThonLinhHuyet, renderThonLinhHuyetWorld } from './thon-linh-huyet.js';
import { createHuyetBaoState, castHuyetBao, stepHuyetBao, renderHuyetBaoWorld } from './huyet-bao.js';
import { renderThoThuanWorld } from './tho-thuan.js';
import { actionAudio } from './audio.js';

// AI có nhịp chờ và thời gian báo chiêu; sát thương cơ bản được cân đối cho nhân vật 500 HP.
let ai;
function makeDamage(scale) {
  let fractional = 0;
  return (victim, amount, options = {}) => {
    if (victim !== player || player.hp <= 0 || !game.running || game.battlePhase !== 'fight') return 0;
    fractional += Math.max(0, amount * scale);
    const whole = Math.floor(fractional + 1e-8);
    if (!whole) return 0;
    fractional -= whole;
    const result = receivePlayerDamage(whole, { fromX: dummy.x, notice: false });
    if (result.hpLost > 0 && !options.isDot && whole >= 35 && player.hp > 0) applyUnblockedPlayerHit('hurt');
    return result.hpLost;
  };
}
export function resetBossAI() {
  ai = { thu: createHuyetThuState(), kim: createHuyetKimTuyenState(), thon: createThonLinhHuyetState(), bao: createHuyetBaoState(), choice: 0, wait: 1.7, charge: 0, shield: 0, shieldCooldown: 8, sequenceAtBao: 0 };
  ai.thu.damageTarget = makeDamage(.32);
  ai.kim.damageTarget = makeDamage(.32);
  ai.thon.damageTarget = makeDamage(.5);
  ai.bao.damageTarget = makeDamage(1);
  dummy.shieldActive = false; dummy.bossAction = ''; dummy.bossWalk = false; dummy.bossActionTime = 0;
  return ai;
}
export function getBossAI() { return ai; }
function action(name) { if (dummy.bossAction !== name) { dummy.bossAction = name; dummy.bossActionTime = 0; } }
export function updateBossAI(dt) {
  if (!ai || game.battlePhase !== 'fight' || !dummy.visible || dummy.broken || player.hp <= 0) return;
  dummy.facing = player.x < dummy.x ? -1 : 1;
  dummy.mana = Math.min(dummy.maxMana, dummy.mana + 5 * dt);
  ai.shieldCooldown = Math.max(0, ai.shieldCooldown - dt);
  if (dummy.shieldActive) {
    ai.shield -= dt;
    dummy.mana = Math.max(0, dummy.mana - 2 * dt);
    if (ai.shield <= 0 || dummy.mana <= 0) dummy.shieldActive = false;
  }
  if (['seal','gather','pinch'].includes(ai.bao.phase) && dummy.hitSequence !== ai.sequenceAtBao) {
    ai.bao.phase = 'done'; ai.bao.motes = []; ai.bao.flash = 0; ai.bao.radius = 0;
    actionAudio.stopBloodCataclysmGather();
    ai.wait = 2.5; action(''); showNotice('ĐÃ NGẮT HUYẾT BẠO!');
  }
  if (dummy.stun > 0 || dummy.trapped) {
    if (ai.thu.phase === 'cast') { ai.thu.phase = 'cooldown'; ai.thu.cooldown = 5; }
    if (ai.kim.phase === 'charge') { ai.kim.phase = 'cooldown'; ai.kim.cooldown = 8; ai.kim.heldPointerId = null; actionAudio.stopBloodThreadCharge(); }
    if (['cast', 'drain'].includes(ai.thon.phase)) stopThonLinhHuyet(ai.thon, dummy);
    ai.wait = Math.max(ai.wait, 1);
  }
  stepHuyetThu(ai.thu, dt, dummy, player);
  stepHuyetKimTuyen(ai.kim, dt, dummy, player);
  stepThonLinhHuyet(ai.thon, dt, dummy, player);
  stepHuyetBao(ai.bao, dt, dummy, player);
  if (player.hp <= 0) return;

  if (ai.kim.phase === 'charge') {
    ai.charge += dt;
    if (ai.charge >= 1.2) releaseHuyetKimTuyen(ai.kim);
  }
  const baoCast = ['seal','gather','pinch','blast'].includes(ai.bao.phase);
  const busy = baoCast || ai.thu.phase === 'cast' || ai.kim.phase === 'charge' || ['cast','drain'].includes(ai.thon.phase);
  if (baoCast) action('hand_seal');
  else if (ai.thu.phase === 'cast' || ai.thon.phase === 'cast') action('hand_seal');
  else if (ai.kim.phase === 'charge' || ai.thon.phase === 'drain') action('charge_hold');
  else if (ai.kim.phase === 'release' && ai.kim.elapsed < .4) action('cast_fire');
  else action('');
  dummy.bossActionTime += dt;
  dummy.bossWalk = false;
  if (busy || dummy.stun > 0 || dummy.trapped) return;

  // Giữ khoảng cách, không xuyên người chơi hoặc địa hình.
  const dx = player.x - dummy.x;
  const distance = Math.abs(dx);
  if (distance > 280 && game.terrain) {
    const speed = dummy.slow > 0 ? 38 : 108;
    const next = Math.max(65, Math.min(WORLD_W - 65, dummy.x + Math.sign(dx) * speed * dt));
    const foot = game.terrain.firstSolidY(next) - .5;
    const clear = Math.abs(next - player.x) > HERO_HALF + NPC_HALF + 7 && Math.abs(foot - dummy.y) < 25 && !game.terrain.solid(next, foot - 65);
    if (clear) { dummy.x = next; dummy.y = foot; dummy.gait += speed * dt / 50 * 8; dummy.bossWalk = true; }
  }
  ai.wait -= dt;
  if (ai.wait > 0) return;
  if (dummy.hp > 0 && dummy.hp <= dummy.maxHp * .1 && !ai.bao.usedOnce) {
    dummy.shieldActive = false;
    if (castHuyetBao(ai.bao, dummy)) { ai.sequenceAtBao = dummy.hitSequence; action('hand_seal'); ai.wait = 1; showNotice('HUYẾT DỰ KẾT ẤN HUYẾT BẠO! TẤN CÔNG ĐỂ NGẮT CHIÊU!'); return; }
  }
  const index = ai.choice++ % 4;
  if (index === 0 && ai.thu.phase === 'ready' && dummy.mana >= 35) {
    dummy.mana -= 35; castHuyetThu(ai.thu, dummy, player); action('hand_seal'); showNotice('HUYẾT DỰ · HUYẾT THỦ!');
  } else if (index === 1 && ai.kim.phase === 'ready' && dummy.mana > 15 && dummy.hp > 20) {
    ai.charge = 0; beginHuyetKimTuyen(ai.kim, dummy, player, 'boss'); action('charge_hold'); showNotice('HUYẾT DỰ · HUYẾT KIM TUYẾN!');
  } else if (index === 2 && ai.thon.phase === 'ready' && distance < 850) {
    castThonLinhHuyet(ai.thon, dummy, player); action('hand_seal'); showNotice('HUYẾT DỰ · THÔN LINH HUYẾT!');
  } else if (index === 3 && ai.shieldCooldown <= 0 && dummy.mana > 15) {
    dummy.shieldActive = true; ai.shield = 2.6; ai.shieldCooldown = 14; showNotice('HUYẾT DỰ · HUYẾT THUẪN!');
  }
  ai.wait = 2.8;
}
export function drawBossEffects() {
  if (!ai || dummy.visible === false || settings.fxQuality === 'off') return;
  renderHuyetThuWorld(ai.thu);
  renderHuyetKimTuyenWorld(ai.kim);
  renderThonLinhHuyetWorld(ai.thon, dummy, player);
  renderHuyetBaoWorld(ai.bao, dummy);
  if (dummy.shieldActive) renderThoThuanWorld({active:true, blood:true, heroX:dummy.x, heroFeetY:dummy.y, impacts:[], shots:[]});
}
