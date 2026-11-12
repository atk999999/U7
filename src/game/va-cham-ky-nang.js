// Va chạm liên tục giữa các chiêu thức của hai phe, tính theo thời gian trong khung hình.
let frame = null;
let strength = new WeakMap();
const clamp01 = n => Math.max(0, Math.min(1, n));

export function resetSkillCollisions() { frame = null; strength = new WeakMap(); }
export function beginSkillCollisionFrame(effect) { frame = { player: [], boss: [], impacts: [], effect }; }
function info(ref, power = 1) {
  let value = strength.get(ref);
  if (!value) { value = { initial: Math.max(0.001, power), power: Math.max(0.001, power), ended: false }; strength.set(ref, value); }
  return value;
}
export function skillCollisionRatio(ref) { const s = strength.get(ref); return s ? s.power / s.initial : 1; }
export function trackSkillSegment(segment) {
  if (!frame) return;
  const s = { t0: 0, t1: 1, ...segment };
  if (s.t1 < s.t0 || info(s.ref, s.power).ended) return;
  frame[s.side].push(s);
}
export function queueSkillImpact(ref, time, callback) {
  if (!frame) { callback(); return; }
  frame.impacts.push({ time: clamp01(time), ref, callback, type: 'impact' });
}
function at(s, t) {
  const q = s.t1 === s.t0 ? 1 : clamp01((t - s.t0) / (s.t1 - s.t0));
  return { x: s.x0 + (s.x1 - s.x0) * q, y: s.y0 + (s.y1 - s.y0) * q };
}
// Thời điểm hai hình tròn chuyển động gặp nhau, kể cả khi bay nhanh xuyên qua nhau.
export function segmentCircleTOI(x0, y0, x1, y1, cx, cy, radius) {
  const x = x0 - cx, y = y0 - cy, vx = x1 - x0, vy = y1 - y0;
  const c = x*x + y*y - radius*radius;
  if (c <= 0) return 0;
  const a = vx*vx + vy*vy;
  if (a < 1e-12) return null;
  const b = 2*(x*vx + y*vy), d = b*b - 4*a*c;
  if (d < 0) return null;
  const t = (-b - Math.sqrt(d)) / (2*a);
  return t >= 0 && t <= 1 ? t : null;
}
function collision(a, b) {
  const lo = Math.max(a.t0, b.t0), hi = Math.min(a.t1, b.t1);
  if (hi < lo) return null;
  const a0 = at(a, lo), b0 = at(b, lo), a1 = at(a, hi), b1 = at(b, hi);
  const u = segmentCircleTOI(a0.x-b0.x, a0.y-b0.y, a1.x-b1.x, a1.y-b1.y, 0, 0, a.radius+b.radius);
  if (u === null) return null;
  const time = lo + (hi-lo)*u, p = at(a, time), q = at(b, time);
  return { time, x: (p.x+q.x)/2, y: (p.y+q.y)/2, a, b, type: 'collision' };
}
export function endSkillCollisionFrame() {
  if (!frame) return;
  const f = frame; frame = null;
  const events = f.impacts.slice();
  for (const a of f.player) for (const b of f.boss) {
    if (a.kind === 'water_sword' && b.kind === 'blood_thread') continue;
    const hit = collision(a,b); if (hit) events.push(hit);
  }
  events.sort((a,b) => a.time-b.time || (a.type === 'collision' ? -1 : 1));
  let effects = 0;
  for (const event of events) {
    if (event.type === 'impact') {
      const s = info(event.ref); if (s.ended) continue;
      s.ended = true; event.callback(); continue;
    }
    const a = info(event.a.ref, event.a.power), b = info(event.b.ref, event.b.power);
    if (a.ended || b.ended) continue;
    // Một cặp đối tượng chỉ trao đổi sức mạnh một lần, dù có nhiều đoạn/điểm chạm.
    if (!a.met) a.met = new WeakSet();
    if (a.met.has(event.b.ref)) continue;
    a.met.add(event.b.ref);
    const ap = a.power, bp = b.power;
    a.power = Math.max(0, ap-bp); b.power = Math.max(0, bp-ap);
    if (a.power <= 1e-8) { a.ended = true; event.a.onDestroy?.(); }
    if (b.power <= 1e-8) { b.ended = true; event.b.onDestroy?.(); }
    if (effects++ < 4) f.effect?.(event.x,event.y);
  }
}
