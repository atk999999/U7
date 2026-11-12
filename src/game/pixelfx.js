/* PixelFX v0.3.0, MIT, bundled from user-provided source — see PixelFX_LICENSE.txt
    Includes built-in hit-spark plus original movement effects authored with PixelFX Painter. */
(function(root){'use strict';const modules={"core/fx.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createFrame = createFrame;
exports.clearFrame = clearFrame;
exports.painterFor = painterFor;
exports.resolveOptions = resolveOptions;
exports.createFx = createFx;
exports.composite = composite;
const painter_js_1 = require("./painter.js");
const math_js_1 = require("./math.js");
const actor_js_1 = require("./actor.js");
const color_js_1 = require("./color.js");
function createFrame(w, h, ox = 0, oy = 0) {
    return { w, h, ox, oy, color: new Uint32Array(w * h), light: new Uint32Array(w * h) };
}
function clearFrame(f) {
    f.color.fill(0);
    f.light.fill(0);
    return f;
}
const painters = new WeakMap();
function painterFor(frame) {
    let p = painters.get(frame);
    if (!p)
        painters.set(frame, (p = new painter_js_1.Painter(frame)));
    return p.reset();
}
const FADE = 0.3;
const isRamp = (v) => Array.isArray(v) && v.length > 0 && v.every((c) => typeof c === "number" || /^#[0-9a-f]{3,8}$/i.test(c));
function resolveOptions(meta, o = {}) {
    const opts = { ...(meta.options ?? {}), ...o };
    for (const [k, def] of Object.entries(meta.options ?? {}))
        if (isRamp(def) && isRamp(o[k]) && o[k].length !== def.length)
            opts[k] = (0, color_js_1.fit)(o[k], def.length).map(color_js_1.toHex);
    if (meta.actor && !opts.actor)
        opts.actor = (0, actor_js_1.stockActor)(meta.actor === 2 ? 2 : 1);
    return opts;
}
function createFx(mod, o = {}) {
    const meta = mod.meta ?? {};
    const opts = resolveOptions(meta, o);
    const impl = mod.create ? mod.create(opts) : mod;
    const D = meta.duration ?? 1;
    let t = 0, stopAt = Infinity;
    return {
        meta,
        options: opts,
        get t() {
            return t;
        },
        update(dt) {
            t += dt;
            if (!impl.update)
                return;
            const n = Math.max(1, Math.ceil(dt * 120 - 1e-9));
            for (let i = 0; i < n; i++)
                impl.update(dt / n, opts);
        },
        draw(frame, layer) {
            const p = painterFor(frame);
            p.place(opts.x ?? 0, opts.y ?? 0, !!opts.flip, opts.angle ?? 0);
            p.fade = stopAt === Infinity ? 1 : (0, math_js_1.clamp)(1 - (t - stopAt) / FADE);
            p.lightK = opts.light ?? 1;
            const tt = meta.loop ? t % D : Math.min(t, D);
            if (layer !== "front" && impl.drawBack) {
                p.layer = "back";
                impl.drawBack(p, tt, opts);
            }
            if (layer !== "back") {
                p.layer = "front";
                impl.draw(p, tt, opts);
            }
        },
        stop() {
            if (stopAt === Infinity)
                stopAt = t;
        },
        done() {
            return t - stopAt >= FADE || (!meta.loop && t >= D);
        },
    };
}
function composite(f, out, bg = null, lightK = 1) {
    const n = f.w * f.h, C = f.color, L = f.light, flat = typeof bg === "number";
    for (let i = 0; i < n; i++) {
        const c = C[i], l = L[i] & 0xffffff;
        let r, g, b, a;
        const ca = c >>> 24;
        if (ca === 255) {
            r = c & 255;
            g = (c >>> 8) & 255;
            b = (c >>> 16) & 255;
            a = 255;
        }
        else if (bg === null) {
            r = c & 255;
            g = (c >>> 8) & 255;
            b = (c >>> 16) & 255;
            a = ca;
        }
        else {
            const k = flat ? bg : bg[i], f = ca / 255;
            r = (c & 255) * f + (k & 255) * (1 - f);
            g = ((c >>> 8) & 255) * f + ((k >>> 8) & 255) * (1 - f);
            b = ((c >>> 16) & 255) * f + ((k >>> 16) & 255) * (1 - f);
            a = 255;
        }
        if (l) {
            const lr = (l & 255) * lightK, lg = ((l >>> 8) & 255) * lightK, lb = ((l >>> 16) & 255) * lightK;
            if (a < 255) {
                const pa = a / 255, pr = r * pa + lr, pg = g * pa + lg, pb = b * pa + lb;
                const na = Math.min(1, Math.max(pa, Math.max(lr, lg, lb) / 255));
                if (na > 0) {
                    r = Math.min(255, pr / na);
                    g = Math.min(255, pg / na);
                    b = Math.min(255, pb / na);
                    a = na * 255;
                }
            }
            else {
                r = Math.min(255, r + lr);
                g = Math.min(255, g + lg);
                b = Math.min(255, b + lb);
            }
        }
        const j = i * 4;
        out[j] = r;
        out[j + 1] = g;
        out[j + 2] = b;
        out[j + 3] = a;
    }
    return out;
}

},
"core/painter.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Painter = void 0;
const math_js_1 = require("./math.js");
const color_js_1 = require("./color.js");
const font_js_1 = require("./font.js");
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const OUT = { c: 0, a: 1, l: 0, k: 0 };
const sprites = new WeakMap();
const call = (v, ...args) => (typeof v === "function" ? v(...args) : v);
class Painter {
    constructor(frame) {
        this.frame = frame;
        this.reset();
    }
    reset() {
        const f = this.frame;
        this.w = f.w;
        this.h = f.h;
        this.ox = f.ox | 0;
        this.oy = f.oy | 0;
        this.C = f.color;
        this.L = f.light;
        this.tx = 0;
        this.ty = 0;
        this.fx = 1;
        this.cs = 1;
        this.sn = 0;
        this.fade = 1;
        this.lightK = 1;
        this.layer = "front";
        return this;
    }
    place(x, y, flip = false, angle = 0) {
        this.tx = x;
        this.ty = y;
        this.fx = flip ? -1 : 1;
        this.cs = Math.cos(angle);
        this.sn = Math.sin(angle);
        return this;
    }
    toX(x, y) { return this.tx + x * this.fx * this.cs - y * this.sn; }
    toY(x, y) { return this.ty + x * this.fx * this.sn + y * this.cs; }
    fromX(sx, sy) { const dx = sx - this.tx, dy = sy - this.ty; return (dx * this.cs + dy * this.sn) * this.fx; }
    fromY(sx, sy) { const dx = sx - this.tx, dy = sy - this.ty; return -dx * this.sn + dy * this.cs; }
    cellX(x, y) { return Math.floor(this.toX(Math.floor(x) + 0.5, Math.floor(y) + 0.5)); }
    cellY(x, y) { return Math.floor(this.toY(Math.floor(x) + 0.5, Math.floor(y) + 0.5)); }
    put(sx, sy, c, a = 1) {
        if (!c)
            return;
        a *= this.fade;
        if (a < 1 && a <= BAYER[((sy & 3) << 2) | (sx & 3)])
            return;
        const x = sx - this.ox, y = sy - this.oy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h)
            return;
        this.C[y * this.w + x] = c;
    }
    add(sx, sy, c, k = 1) {
        k *= this.fade * this.lightK;
        if (k <= 0.004)
            return;
        const x = sx - this.ox, y = sy - this.oy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h)
            return;
        const i = y * this.w + x, d = this.L[i];
        const r = Math.min(255, (d & 255) + (c & 255) * k) | 0;
        const g = Math.min(255, ((d >>> 8) & 255) + ((c >>> 8) & 255) * k) | 0;
        const b = Math.min(255, ((d >>> 16) & 255) + ((c >>> 16) & 255) * k) | 0;
        this.L[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
    blendPx(sx, sy, c, a) {
        a *= this.fade;
        if (!c || a <= 0.004)
            return;
        const x = sx - this.ox, y = sy - this.oy;
        if (x < 0 || y < 0 || x >= this.w || y >= this.h)
            return;
        const i = y * this.w + x, d = this.C[i], da = (d >>> 24) / 255, oa = a + da * (1 - a), k = a / oa;
        const ch = (s) => ((((c >>> s) & 255) * k + ((d >>> s) & 255) * (1 - k)) & 255);
        this.C[i] = (((oa * 255) & 255) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
    }
    blend(x, y, c, a) { this.blendPx(this.cellX(x, y), this.cellY(x, y), c, a); }
    disc(cx, cy, r, c, a) {
        if (r < 0.5)
            return this.blend(cx, cy, call(c, 0, 0), call(a, 0, 0));
        this.each(cx - r, cy - r, cx + r, cy + r, (x, y, sx, sy) => {
            const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
            if (d2 > r * r)
                return;
            const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
            this.blendPx(sx, sy, call(c, d, ang), call(a, d, ang));
        });
    }
    get(x, y) {
        const sx = this.cellX(x, y) - this.ox, sy = this.cellY(x, y) - this.oy;
        return sx < 0 || sy < 0 || sx >= this.w || sy >= this.h ? 0 : this.C[sy * this.w + sx];
    }
    px(x, y, c) { this.put(this.cellX(x, y), this.cellY(x, y), c, 1); }
    dot(x, y, c, a = 1) { if (a > 0)
        this.put(this.cellX(x, y), this.cellY(x, y), c, a); }
    light(x, y, c, k = 1) { this.add(this.cellX(x, y), this.cellY(x, y), c, k); }
    each(x0, y0, x1, y1, fn) {
        let ax = Infinity, bx = -Infinity, ay = Infinity, by = -Infinity;
        for (let k = 0; k < 4; k++) {
            const x = k & 1 ? x1 : x0, y = k & 2 ? y1 : y0, sx = this.toX(x, y), sy = this.toY(x, y);
            if (sx < ax)
                ax = sx;
            if (sx > bx)
                bx = sx;
            if (sy < ay)
                ay = sy;
            if (sy > by)
                by = sy;
        }
        const sx0 = Math.max(Math.floor(ax), this.ox), sx1 = Math.min(Math.ceil(bx), this.ox + this.w - 1);
        const sy0 = Math.max(Math.floor(ay), this.oy), sy1 = Math.min(Math.ceil(by), this.oy + this.h - 1);
        for (let sy = sy0; sy <= sy1; sy++)
            for (let sx = sx0; sx <= sx1; sx++) {
                const cx = sx + 0.5, cy = sy + 0.5;
                fn(this.fromX(cx, cy), this.fromY(cx, cy), sx, sy);
            }
    }
    shade(x0, y0, x1, y1, fn) {
        const o = OUT;
        this.each(x0, y0, x1, y1, (lx, ly, sx, sy) => {
            o.c = 0;
            o.a = 1;
            o.l = 0;
            o.k = 0;
            const c = fn(lx, ly, o) || o.c;
            if (c)
                this.put(sx, sy, c, o.a);
            if (o.k > 0)
                this.add(sx, sy, o.l || c, o.k);
        });
    }
    line(x0, y0, x1, y1, c, a = 1) {
        let sx = this.cellX(x0, y0), sy = this.cellY(x0, y0);
        const ex = this.cellX(x1, y1), ey = this.cellY(x1, y1);
        const dx = Math.abs(ex - sx), dy = -Math.abs(ey - sy), stepx = sx < ex ? 1 : -1, stepy = sy < ey ? 1 : -1;
        const n = Math.max(dx, -dy) || 1, fc = typeof c === "function", fa = typeof a === "function";
        let err = dx + dy, i = 0;
        for (;;) {
            const u = i++ / n;
            this.put(sx, sy, fc ? c(u) : c, fa ? a(u) : a);
            if (sx === ex && sy === ey)
                break;
            const e2 = 2 * err;
            if (e2 >= dy) {
                err += dy;
                sx += stepx;
            }
            if (e2 <= dx) {
                err += dx;
                sy += stepy;
            }
        }
    }
    polyline(pts, c, a = 1) {
        for (let i = 1; i < pts.length; i++)
            this.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c, a);
    }
    beam(x0, y0, x1, y1, width, c, a = 1) {
        const r = width / 2, dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1e-9;
        this.shade(Math.min(x0, x1) - r, Math.min(y0, y1) - r, Math.max(x0, x1) + r, Math.max(y0, y1) + r, (x, y, o) => {
            const u = (0, math_js_1.clamp)(((x - x0) * dx + (y - y0) * dy) / L2), px = x0 + dx * u - x, py = y0 + dy * u - y;
            const d2 = px * px + py * py;
            if (d2 > r * r)
                return;
            const v = Math.sqrt(d2) / r;
            o.c = call(c, u, v);
            o.a = call(a, u, v);
        });
    }
    circle(cx, cy, r, c, a = 1) {
        if (r < 0.6)
            return this.dot(cx, cy, call(c, 0, 0), call(a, 0, 0));
        this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
            const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
            if (d2 > r * r)
                return;
            const d = Math.sqrt(d2) / r, ang = Math.atan2(dy, dx);
            o.c = call(c, d, ang);
            o.a = call(a, d, ang);
        });
    }
    ellipse(cx, cy, rx, ry, c, a = 1) {
        if (rx <= 0 || ry <= 0)
            return;
        this.shade(cx - rx, cy - ry, cx + rx, cy + ry, (x, y, o) => {
            const dx = (x - cx) / rx, dy = (y - cy) / ry, d2 = dx * dx + dy * dy;
            if (d2 > 1)
                return;
            const d = Math.sqrt(d2), ang = Math.atan2(dy, dx);
            o.c = call(c, d, ang);
            o.a = call(a, d, ang);
        });
    }
    ring(cx, cy, r, w, c, a = 1) {
        const r0 = Math.max(0, r - w);
        this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
            const dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy;
            if (d2 > r * r || d2 < r0 * r0)
                return;
            const v = w > 0 ? (Math.sqrt(d2) - r0) / (r - r0 || 1) : 1, ang = Math.atan2(dy, dx);
            o.c = call(c, v, ang);
            o.a = call(a, v, ang);
        });
    }
    arc(cx, cy, r, w, a0, a1, c, a = 1) {
        const span = a1 - a0, wf = typeof w === "function";
        this.shade(cx - r, cy - r, cx + r, cy + r, (x, y, o) => {
            const dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy);
            if (d > r)
                return;
            let ang = Math.atan2(dy, dx) - a0;
            ang -= Math.floor(ang / (Math.PI * 2)) * Math.PI * 2;
            if (ang > span)
                return;
            const u = ang / span, ww = wf ? w(u) : w;
            if (ww <= 0 || d < r - ww)
                return;
            const v = (d - (r - ww)) / ww;
            o.c = call(c, u, v);
            o.a = call(a, u, v);
        });
    }
    rect(x, y, w, h, c, a = 1) {
        if (this.sn === 0) {
            const X0 = Math.round(x), Y0 = Math.round(y), X1 = Math.round(x + w), Y1 = Math.round(y + h);
            for (let yy = Y0; yy < Y1; yy++)
                for (let xx = X0; xx < X1; xx++)
                    this.put(this.cellX(xx, yy), this.cellY(xx, yy), c, a);
            return;
        }
        this.shade(x, y, x + w, y + h, (lx, ly, o) => {
            if (lx < x || ly < y || lx >= x + w || ly >= y + h)
                return;
            o.c = c;
            o.a = a;
        });
    }
    poly(pts, c, a = 1) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of pts) {
            if (x < x0)
                x0 = x;
            if (x > x1)
                x1 = x;
            if (y < y0)
                y0 = y;
            if (y > y1)
                y1 = y;
        }
        const n = pts.length;
        this.shade(x0, y0, x1, y1, (x, y, o) => {
            let inside = false;
            for (let i = 0, j = n - 1; i < n; j = i++) {
                const [xi, yi] = pts[i], [xj, yj] = pts[j];
                if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
                    inside = !inside;
            }
            if (!inside)
                return;
            o.c = call(c, x, y);
            o.a = call(a, x, y);
        });
    }
    tri(x0, y0, x1, y1, x2, y2, c, a = 1) { this.poly([[x0, y0], [x1, y1], [x2, y2]], c, a); }
    glow(x, y, r, c, k = 0.5) {
        if (r < 1 || k <= 0.004)
            return;
        const cx = this.toX(x, y), cy = this.toY(x, y);
        const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
        for (let sy = y0; sy <= y1; sy++) {
            const dy = (sy + 0.5 - cy) / r;
            for (let sx = x0; sx <= x1; sx++) {
                const dx = (sx + 0.5 - cx) / r, d = dx * dx + dy * dy;
                if (d >= 1)
                    continue;
                const f = 1 - Math.sqrt(d);
                this.add(sx, sy, c, f * f * k);
            }
        }
    }
    glowLine(x0, y0, x1, y1, r, c, k = 0.5) {
        if (r < 1 || k <= 0.004)
            return;
        const ax = this.toX(x0, y0), ay = this.toY(x0, y0), bx = this.toX(x1, y1), by = this.toY(x1, y1);
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
        const X0 = Math.floor(Math.min(ax, bx) - r), X1 = Math.ceil(Math.max(ax, bx) + r);
        const Y0 = Math.floor(Math.min(ay, by) - r), Y1 = Math.ceil(Math.max(ay, by) + r);
        for (let sy = Y0; sy <= Y1; sy++)
            for (let sx = X0; sx <= X1; sx++) {
                const px = sx + 0.5, py = sy + 0.5, u = (0, math_js_1.clamp)(((px - ax) * dx + (py - ay) * dy) / L2);
                const ex = ax + dx * u - px, ey = ay + dy * u - py, d = Math.sqrt(ex * ex + ey * ey) / r;
                if (d >= 1)
                    continue;
                const f = 1 - d;
                this.add(sx, sy, c, f * f * k);
            }
    }
    glowRing(x, y, R, r, c, k = 0.5) {
        if (r < 1 || k <= 0.004)
            return;
        const cx = this.toX(x, y), cy = this.toY(x, y), E = R + r;
        for (let sy = Math.floor(cy - E); sy <= Math.ceil(cy + E); sy++)
            for (let sx = Math.floor(cx - E); sx <= Math.ceil(cx + E); sx++) {
                const d = Math.abs(Math.hypot(sx + 0.5 - cx, sy + 0.5 - cy) - R) / r;
                if (d >= 1)
                    continue;
                const f = 1 - d;
                this.add(sx, sy, c, f * f * k);
            }
    }
    sprite(rows, pal, x, y, opts = {}) {
        let s = sprites.get(rows);
        if (!s)
            sprites.set(rows, (s = rows.map((r) => [...r])));
        const k = opts.scale ?? 1, a = opts.a ?? 1, W = s[0]?.length ?? 0, cache = {};
        for (let r = 0; r < s.length; r++)
            for (let q = 0; q < s[r].length; q++) {
                const ch = s[r][q];
                if (ch === "." || ch === " ")
                    continue;
                let c = opts.tint;
                if (c === undefined) {
                    c = cache[ch];
                    if (c === undefined)
                        c = cache[ch] = pal[ch] === undefined ? 0 : (0, color_js_1.hex)(pal[ch]);
                }
                if (!c)
                    continue;
                const col = opts.flip ? W - 1 - q : q, row = opts.flipY ? s.length - 1 - r : r;
                if (k === 1)
                    this.dot(x + col, y + row, c, a);
                else
                    this.rect(x + col * k, y + row * k, k, k, c, a);
            }
    }
    text(str, x, y, c, opts = {}) {
        const font = opts.font ?? "mini", k = opts.scale ?? 1, a = opts.a ?? 1, w = (0, font_js_1.textWidth)(str, font) * k;
        const left = Math.round(opts.align === "center" ? x - w / 2 : opts.align === "right" ? x - w : x), top = Math.round(y);
        const ol = opts.outline, sh = opts.shadow;
        if (ol !== undefined)
            (0, font_js_1.rasterText)(str, font, (gx, gy) => this.rect(left + gx * k - 1, top + gy * k - 1, k + 2, k + 2, ol, a));
        if (sh !== undefined)
            (0, font_js_1.rasterText)(str, font, (gx, gy) => this.rect(left + gx * k + 1, top + gy * k + 1, k, k, sh, a));
        (0, font_js_1.rasterText)(str, font, (gx, gy) => this.rect(left + gx * k, top + gy * k, k, k, call(c, gx, gy), a));
    }
    measure(str, opts = {}) {
        const k = opts.scale ?? 1;
        return [(0, font_js_1.textWidth)(str, opts.font ?? "mini") * k, font_js_1.FONTS[opts.font ?? "mini"].h * k];
    }
    mask(m, x, y, c, a = 1) {
        for (let my = 0; my < m.h; my++)
            for (let mx = 0; mx < m.w; mx++)
                if (m.data[my * m.w + mx])
                    this.dot(x + mx, y + my, call(c, mx, my), call(a, mx, my));
    }
    outline(m, x, y, c, a = 1) {
        const at = (mx, my) => mx >= 0 && my >= 0 && mx < m.w && my < m.h && m.data[my * m.w + mx];
        for (let my = -1; my <= m.h; my++)
            for (let mx = -1; mx <= m.w; mx++)
                if (!at(mx, my) && (at(mx - 1, my) || at(mx + 1, my) || at(mx, my - 1) || at(mx, my + 1)))
                    this.dot(x + mx, y + my, call(c, mx, my), call(a, mx, my));
    }
}
exports.Painter = Painter;

},
"core/math.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rng = exports.Rng = exports.rand = exports.ease = exports.angleTo = exports.dist = exports.pingpong = exports.bump = exports.smooth = exports.seg = exports.wrap = exports.fract = exports.remap = exports.invLerp = exports.lerp = exports.clamp = exports.TAU = void 0;
exports.hash = hash;
exports.noise = noise;
exports.noise2 = noise2;
exports.fbm = fbm;
exports.tileNoise = tileNoise;
exports.tileFbm = tileFbm;
exports.loopNoise = loopNoise;
exports.TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
exports.clamp = clamp;
const lerp = (a, b, t) => a + (b - a) * t;
exports.lerp = lerp;
const invLerp = (a, b, x) => (b === a ? 0 : (x - a) / (b - a));
exports.invLerp = invLerp;
const remap = (x, a0, a1, b0, b1) => (0, exports.lerp)(b0, b1, (0, exports.invLerp)(a0, a1, x));
exports.remap = remap;
const fract = (x) => x - Math.floor(x);
exports.fract = fract;
const wrap = (x, m) => ((x % m) + m) % m;
exports.wrap = wrap;
const seg = (t, t0, t1) => (0, exports.clamp)((t - t0) / (t1 - t0));
exports.seg = seg;
const smooth = (e0, e1, x) => {
    const t = (0, exports.seg)(x, e0, e1);
    return t * t * (3 - 2 * t);
};
exports.smooth = smooth;
const bump = (t, t0, t1) => (t <= t0 || t >= t1 ? 0 : Math.sin(Math.PI * (0, exports.seg)(t, t0, t1)));
exports.bump = bump;
const pingpong = (x) => 1 - Math.abs((0, exports.wrap)(x, 2) - 1);
exports.pingpong = pingpong;
const dist = (x0, y0, x1, y1) => Math.hypot(x1 - x0, y1 - y0);
exports.dist = dist;
const angleTo = (x0, y0, x1, y1) => Math.atan2(y1 - y0, x1 - x0);
exports.angleTo = angleTo;
exports.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inQuart: (t) => t * t * t * t,
    outQuart: (t) => 1 - Math.pow(1 - t, 4),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    inBack: (t, s = 1.70158) => (t <= 0 ? 0 : t >= 1 ? 1 : (s + 1) * t * t * t - s * t * t),
    outBack: (t, s = 1.70158) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2)),
    outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
    outBounce: (t) => {
        const n = 7.5625, d = 2.75;
        if (t < 1 / d)
            return n * t * t;
        if (t < 2 / d)
            return n * (t -= 1.5 / d) * t + 0.75;
        if (t < 2.5 / d)
            return n * (t -= 2.25 / d) * t + 0.9375;
        return n * (t -= 2.625 / d) * t + 0.984375;
    },
};
function hash(...ns) {
    let h = 0x9e3779b9;
    for (const n of ns) {
        h = Math.imul(h ^ (n | 0), 0x85ebca6b);
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
    }
    return h >>> 0;
}
const rand = (...ns) => hash(...ns) / 4294967296;
exports.rand = rand;
class Rng {
    constructor(seed = 1) {
        this.s = seed >>> 0 || 1;
    }
    next() {
        let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) {
        return a + (b - a) * this.next();
    }
    int(a, b) {
        return Math.floor(this.range(a, b + 1));
    }
    chance(p) {
        return this.next() < p;
    }
    sign() {
        return this.next() < 0.5 ? -1 : 1;
    }
    pick(list) {
        return list[Math.floor(this.next() * list.length)];
    }
    gauss() {
        return (this.next() + this.next() + this.next() + this.next() - 2) * 1.732;
    }
}
exports.Rng = Rng;
const rng = (...ns) => new Rng(hash(...ns));
exports.rng = rng;
function noise(x, seed = 0) {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return (0, exports.lerp)((0, exports.rand)(i, seed), (0, exports.rand)(i + 1, seed), u) * 2 - 1;
}
function noise2(x, y, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = (0, exports.rand)(ix, iy, seed), b = (0, exports.rand)(ix + 1, iy, seed), c = (0, exports.rand)(ix, iy + 1, seed), d = (0, exports.rand)(ix + 1, iy + 1, seed);
    return (0, exports.lerp)((0, exports.lerp)(a, b, ux), (0, exports.lerp)(c, d, ux), uy) * 2 - 1;
}
function fbm(x, y, seed = 0, octaves = 3) {
    let s = 0, a = 0.5, n = 0;
    for (let o = 0; o < octaves; o++) {
        s += noise2(x, y, seed + o * 101) * a;
        n += a;
        x *= 2.03;
        y *= 2.03;
        a *= 0.5;
    }
    return s / n;
}
function tileNoise(x, y, px = 0, py = 0, seed = 0) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = px ? (0, exports.wrap)(ix, px) : ix, x1 = px ? (0, exports.wrap)(ix + 1, px) : ix + 1;
    const y0 = py ? (0, exports.wrap)(iy, py) : iy, y1 = py ? (0, exports.wrap)(iy + 1, py) : iy + 1;
    const a = (0, exports.rand)(x0, y0, seed), b = (0, exports.rand)(x1, y0, seed), c = (0, exports.rand)(x0, y1, seed), d = (0, exports.rand)(x1, y1, seed);
    return (0, exports.lerp)((0, exports.lerp)(a, b, ux), (0, exports.lerp)(c, d, ux), uy) * 2 - 1;
}
function tileFbm(x, y, px = 0, py = 0, seed = 0, octaves = 3) {
    let s = 0, a = 0.5, n = 0, k = 1;
    for (let o = 0; o < octaves; o++) {
        s += tileNoise(x * k, y * k, px * k, py * k, seed + o * 101) * a;
        n += a;
        a *= 0.5;
        k *= 2;
    }
    return s / n;
}
function loopNoise(phase, radius = 1, seed = 0) {
    const a = phase * exports.TAU;
    return noise2(Math.cos(a) * radius + 50, Math.sin(a) * radius + 50, seed);
}

},
"core/color.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PATCH = exports.INK = exports.BLACK = exports.WHITE = exports.RAMP = exports.PAL = exports.at = exports.ramp = exports.luma = exports.scale = exports.toHex = exports.blue = exports.green = exports.red = exports.rgb = void 0;
exports.hex = hex;
exports.mix = mix;
exports.fit = fit;
exports.blend = blend;
const math_js_1 = require("./math.js");
const rgb = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
exports.rgb = rgb;
const red = (c) => c & 255;
exports.red = red;
const green = (c) => (c >>> 8) & 255;
exports.green = green;
const blue = (c) => (c >>> 16) & 255;
exports.blue = blue;
function hex(h) {
    if (typeof h === "number")
        return h;
    let s = h.replace("#", "");
    if (s.length === 3)
        s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    const v = parseInt(s.slice(0, 6), 16);
    return (0, exports.rgb)((v >> 16) & 255, (v >> 8) & 255, v & 255);
}
const toHex = (c) => "#" + [(0, exports.red)(c), (0, exports.green)(c), (0, exports.blue)(c)].map((v) => v.toString(16).padStart(2, "0")).join("");
exports.toHex = toHex;
function mix(a, b, t) {
    t = (0, math_js_1.clamp)(t);
    return (0, exports.rgb)((0, exports.red)(a) + ((0, exports.red)(b) - (0, exports.red)(a)) * t, (0, exports.green)(a) + ((0, exports.green)(b) - (0, exports.green)(a)) * t, (0, exports.blue)(a) + ((0, exports.blue)(b) - (0, exports.blue)(a)) * t);
}
const scale = (c, k) => (0, exports.rgb)(Math.min(255, (0, exports.red)(c) * k), Math.min(255, (0, exports.green)(c) * k), Math.min(255, (0, exports.blue)(c) * k));
exports.scale = scale;
const luma = (c) => (0.299 * (0, exports.red)(c) + 0.587 * (0, exports.green)(c) + 0.114 * (0, exports.blue)(c)) / 255;
exports.luma = luma;
const ramp = (list) => list.map(hex);
exports.ramp = ramp;
function fit(r, n) {
    r = r.map(hex);
    if (r.length === n)
        return r;
    return Array.from({ length: n }, (_, i) => r[Math.round((i * (r.length - 1)) / Math.max(1, n - 1))]);
}
const at = (r, t) => r[(0, math_js_1.clamp)(Math.floor(t * r.length), 0, r.length - 1)];
exports.at = at;
function blend(r, t) {
    const x = (0, math_js_1.clamp)(t) * (r.length - 1), i = Math.min(r.length - 2, Math.floor(x));
    return mix(r[i], r[i + 1], x - i);
}
exports.PAL = {
    fire: ["#1f0b10", "#4a1118", "#8c1d1c", "#cc3a1a", "#f2701f", "#ffae35", "#ffe27a", "#fff8d6"],
    ember: ["#1a0a0e", "#3d1012", "#701a14", "#a8301a", "#e0561e", "#ff8a2a", "#ffc46a"],
    lava: ["#14060a", "#380a10", "#6e1210", "#ac2410", "#e8501a", "#ff8c2a", "#ffd25a"],
    smoke: ["#0e0c12", "#1d1a22", "#2e2a35", "#433e4b", "#5c5664", "#7b7484", "#a39cab"],
    dust: ["#1c1610", "#33281c", "#4f3f2c", "#6e5a40", "#927a58", "#b89f78", "#dcc8a2"],
    ice: ["#0c1430", "#162c5c", "#1f4f94", "#2f7fcc", "#58b4ec", "#9bdcff", "#d8f4ff", "#ffffff"],
    water: ["#081830", "#0e2e5a", "#14508c", "#1c76bc", "#36a2e0", "#78ccf4", "#c4ecff", "#ffffff"],
    electric: ["#0a0f2e", "#172a78", "#2550d0", "#3f8cff", "#7cc8ff", "#c8f0ff", "#ffffff"],
    volt: ["#24160a", "#5e3a0c", "#a8680f", "#e8a218", "#ffd23c", "#fff08a", "#ffffff"],
    poison: ["#0d1a0c", "#173a14", "#265e18", "#3f8a1e", "#6cb82a", "#a8e04a", "#e0ff8a"],
    holy: ["#2a1c08", "#5a3e10", "#9a6c18", "#d8a428", "#ffd84a", "#fff09a", "#fffbe6", "#ffffff"],
    heal: ["#08201a", "#0f3f2c", "#17663e", "#24924e", "#3ec466", "#7ee88a", "#c8ffc4", "#ffffff"],
    arcane: ["#140a26", "#2b1252", "#481c88", "#6b2cc0", "#9a48ec", "#c684ff", "#ecc8ff", "#ffffff"],
    shadow: ["#050308", "#0f0a18", "#1c1230", "#2c1a4a", "#432468", "#5e3290", "#8048b8", "#a970e0"],
    blood: ["#14040a", "#3a0a14", "#6a101c", "#a01824", "#d42a30", "#ff5a50", "#ff9a8a"],
    earth: ["#140e0a", "#2a1e14", "#47321e", "#69492a", "#8e6638", "#b88a52", "#dcb47c"],
    stone: ["#0e0e12", "#1c1c24", "#2c2c38", "#42424f", "#5c5c6b", "#7d7d8c", "#a4a4b2", "#d0d0da"],
    gold: ["#1e1206", "#4a2c08", "#86520c", "#c48412", "#f0b424", "#ffe066", "#fff6c4", "#ffffff"],
    leaf: ["#0c1a0e", "#163418", "#225224", "#357530", "#4f9a3a", "#7cc048", "#b4e070", "#e4ffb0"],
    wood: ["#160c06", "#2e1a0c", "#4a2c14", "#6a421e", "#8e5c2c", "#b47c40", "#d8a464"],
    metal: ["#0c0e14", "#1c2230", "#2e3648", "#4a5468", "#6e7a90", "#9aa6ba", "#d0d8e6", "#ffffff"],
    bone: ["#1a1814", "#3a352c", "#5e5648", "#8a806c", "#b8ad96", "#e4dcc8", "#fffaf0"],
    neon: ["#1a0516", "#3d0a33", "#701560", "#b0228f", "#f53cd1", "#ff86e6", "#ffd2f6", "#ffffff"],
    cyber: ["#041418", "#08303a", "#0c5260", "#108088", "#18b4b0", "#4ce8d8", "#b4fff0", "#ffffff"],
    matrix: ["#020a04", "#05200c", "#0a3c16", "#106624", "#1a9a34", "#3cd650", "#a4ffa8", "#e8ffe8"],
    candy: ["#ff4a5a", "#ff9a2a", "#ffe03c", "#5ad84a", "#3cc8ff", "#7a6cff", "#f53cd1"],
    night: ["#07060d", "#0c0a18", "#131026", "#1b1734", "#241f44", "#2f2956"],
};
exports.RAMP = Object.fromEntries(Object.entries(exports.PAL).map(([k, v]) => [k, (0, exports.ramp)(v)]));
exports.WHITE = hex("#ffffff");
exports.BLACK = hex("#000000");
exports.INK = hex("#0b0a10");
exports.PATCH = hex("#f53cd1");

},
"core/font.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FONTS = void 0;
exports.textWidth = textWidth;
exports.rasterText = rasterText;
const MINI = {
    A: ".#.|#.#|###|#.#|#.#", B: "##.|#.#|##.|#.#|##.", C: ".##|#..|#..|#..|.##", D: "##.|#.#|#.#|#.#|##.",
    E: "###|#..|##.|#..|###", F: "###|#..|##.|#..|#..", G: ".##|#..|#.#|#.#|.##", H: "#.#|#.#|###|#.#|#.#",
    I: "###|.#.|.#.|.#.|###", J: "..#|..#|..#|#.#|.#.", K: "#.#|#.#|##.|#.#|#.#", L: "#..|#..|#..|#..|###",
    M: "#.#|###|###|#.#|#.#", N: "##.|#.#|#.#|#.#|#.#", O: ".#.|#.#|#.#|#.#|.#.", P: "##.|#.#|##.|#..|#..",
    Q: ".#.|#.#|#.#|##.|.##", R: "##.|#.#|##.|#.#|#.#", S: ".##|#..|.#.|..#|##.", T: "###|.#.|.#.|.#.|.#.",
    U: "#.#|#.#|#.#|#.#|###", V: "#.#|#.#|#.#|#.#|.#.", W: "#.#|#.#|###|###|#.#", X: "#.#|#.#|.#.|#.#|#.#",
    Y: "#.#|#.#|.#.|.#.|.#.", Z: "###|..#|.#.|#..|###",
    0: "###|#.#|#.#|#.#|###", 1: ".#.|##.|.#.|.#.|###", 2: "##.|..#|.#.|#..|###", 3: "##.|..#|.#.|..#|##.",
    4: "#.#|#.#|###|..#|..#", 5: "###|#..|##.|..#|##.", 6: ".##|#..|###|#.#|###", 7: "###|..#|.#.|.#.|.#.",
    8: "###|#.#|###|#.#|###", 9: "###|#.#|###|..#|##.",
    "+": "...|.#.|###|.#.|...", "-": "...|...|###|...|...", "!": "#|#|#|.|#", "?": "##.|..#|.#.|...|.#.",
    ".": ".|.|.|.|#", ",": "..|..|..|.#|#.", ":": ".|#|.|#|.", "/": "..#|..#|.#.|#..|#..",
    "%": "#.#|..#|.#.|#..|#.#", x: "...|#.#|.#.|#.#|...", "*": "#.#|.#.|#.#|...|...", "'": "#|#|.|.|.",
    "(": ".#|#.|#.|#.|.#", ")": "#.|.#|.#|.#|#.", "<": "..#|.#.|#..|.#.|..#", ">": "#..|.#.|..#|.#.|#..",
    "=": "...|###|...|###|...", _: "...|...|...|...|###", "#": "#.#|###|#.#|###|#.#",
};
const BIG = {
    A: ".###.|#...#|#...#|#####|#...#|#...#|#...#", B: "####.|#...#|#...#|####.|#...#|#...#|####.",
    C: ".###.|#...#|#....|#....|#....|#...#|.###.", D: "####.|#...#|#...#|#...#|#...#|#...#|####.",
    E: "#####|#....|#....|####.|#....|#....|#####", F: "#####|#....|#....|####.|#....|#....|#....",
    G: ".###.|#...#|#....|#.###|#...#|#...#|.####", H: "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    I: "###|.#.|.#.|.#.|.#.|.#.|###", J: "..###|...#.|...#.|...#.|...#.|#..#.|.##..",
    K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", L: "#....|#....|#....|#....|#....|#....|#####",
    M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", N: "#...#|#...#|##..#|#.#.#|#..##|#...#|#...#",
    O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.", P: "####.|#...#|#...#|####.|#....|#....|#....",
    Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    S: ".####|#....|#....|.###.|....#|....#|####.", T: "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.", V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    W: "#...#|#...#|#...#|#.#.#|#.#.#|#.#.#|.#.#.", X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", Z: "#####|....#|...#.|..#..|.#...|#....|#####",
    0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", 1: ".#.|##.|.#.|.#.|.#.|.#.|###",
    2: ".###.|#...#|....#|...#.|..#..|.#...|#####", 3: "#####|...#.|..#..|...#.|....#|#...#|.###.",
    4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", 5: "#####|#....|####.|....#|....#|#...#|.###.",
    6: "..##.|.#...|#....|####.|#...#|#...#|.###.", 7: "#####|....#|...#.|..#..|.#...|.#...|.#...",
    8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.", 9: ".###.|#...#|#...#|.####|....#|...#.|.##..",
    "!": "#|#|#|#|#|.|#", "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "+": ".....|..#..|..#..|#####|..#..|..#..|.....",
    "-": "....|....|....|####|....|....|....", ".": ".|.|.|.|.|.|#", ",": "..|..|..|..|..|.#|#.", ":": ".|.|#|.|.|#|.",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....", "%": "##...|##..#|...#.|..#..|.#...|#..##|...##",
    x: ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#", "*": ".....|..#..|#.#.#|.###.|#.#.#|..#..|.....", "'": "#|#|.|.|.|.|.",
    "<": "...#|..#.|.#..|#...|.#..|..#.|...#", ">": "#...|.#..|..#.|...#|..#.|.#..|#...", "=": "....|....|####|....|####|....|....",
    "(": "..#|.#.|#..|#..|#..|.#.|..#", ")": "#..|.#.|..#|..#|..#|.#.|#..", "#": ".#.#.|.#.#.|#####|.#.#.|#####|.#.#.|.#.#.",
};
function build(table, h) {
    const out = {};
    for (const [ch, src] of Object.entries(table)) {
        const rows = src.split("|");
        out[ch] = { w: rows[0].length, rows: rows.map((r) => [...r].map((c) => c === "#")) };
        if (rows.length !== h)
            throw new Error(`glyph ${ch} has ${rows.length} rows, expected ${h}`);
    }
    return out;
}
exports.FONTS = {
    mini: { h: 5, space: 2, gap: 1, glyphs: build(MINI, 5) },
    big: { h: 7, space: 3, gap: 1, glyphs: build(BIG, 7) },
};
function textWidth(str, font = "mini") {
    const F = exports.FONTS[font];
    let w = 0;
    for (const ch of String(str)) {
        const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
        w += (g ? g.w : F.space) + F.gap;
    }
    return Math.max(0, w - F.gap);
}
function rasterText(str, font, plot) {
    const F = exports.FONTS[font];
    let x = 0;
    for (const ch of String(str)) {
        const g = F.glyphs[ch] ?? F.glyphs[ch.toUpperCase()];
        if (!g) {
            x += F.space + F.gap;
            continue;
        }
        for (let r = 0; r < F.h; r++)
            for (let c = 0; c < g.w; c++)
                if (g.rows[r][c])
                    plot(x + c, r);
        x += g.w + F.gap;
    }
}

},
"core/actor.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DUMMY_PAL = exports.HERO_PAL = exports.HERO2 = exports.HERO = exports.actorAlphaOf = void 0;
exports.stockActor = stockActor;
exports.drawActor = drawActor;
const color_js_1 = require("./color.js");
const HERO = [
    "....kkkkk...",
    "..kkhhhhhk..",
    ".khhhhhhhhk.",
    ".khhhhhhhhhk",
    ".khhssssshhk",
    ".khsessesshk",
    ".khsessesshk",
    "..ksssssssk.",
    "...kkSSSkk..",
    "..kttttttk..",
    ".kttTttTttk.",
    ".ksttTTttsk.",
    ".kstttttttk.",
    "..kbbbbbbk..",
    "..kppkkppk..",
    "..kppk.kppk.",
    "..kppk.kppk.",
    "..koook.kook",
    "..kkkkk.kkkk",
];
exports.HERO = HERO;
const HERO_PAL = {
    k: "#17121f", h: "#7a4128", s: "#f3c49d", S: "#c98b6c", e: "#17121f",
    t: "#5f6f94", T: "#46536f", b: "#8a5a32", p: "#38334a", o: "#6a4030",
    H: "#a35d34", w: "#ffffff", m: "#a3564a", g: "#e8c060", L: "#7f90b6", O: "#8f5a3f", P: "#4b4560",
    c: "#f53cd1", C: "#ff8fe6", D: "#a31f8a",
};
exports.HERO_PAL = HERO_PAL;
const DUMMY_PAL = {
    k: "#0e0c14", A: "#e4e6ec", B: "#b6b9c3", C: "#868995", D: "#5c5e6a", E: "#6e707c", F: "#4b4d58", G: "#34353f", J: "#2a2b33", m: "#f53cd1",
};
exports.DUMMY_PAL = DUMMY_PAL;
const HERO2 = [
    "...........kkk..........",
    "..........kAABk.........",
    ".........kAAABJk........",
    ".........kABBJJk........",
    ".........kBBBJCDk.......",
    ".........kBCJDDDk.......",
    ".........kkJJJDk........",
    ".......kkkkABBJCkk......",
    "......kAABCJBCCCkDk.....",
    "......kABBCJCCCmDkDk....",
    "......kBBCDDJCDDDkDk....",
    "......kABCDJDDDDDkk.....",
    ".....kAABDkDDDDJkk......",
    ".....kABCDkDDJJGkk......",
    ".....kABCkJJJGGGkk......",
    "....kJJCDkFFFGGGk.......",
    "....kAJJDkJJJGGGk.......",
    "....kJCJJkABBJGGk.......",
    ".....kJCCkBBCDJJJk......",
    ".....kCCCJBBCDJJDk......",
    ".....kCCCDJCCDkJDDk.....",
    "......kCDDJBCDkDDDk.....",
    ".......kDJJJCDkDDDkk....",
    ".......kJBCJCDkDDDkk....",
    ".......kBDJBCDkCDDkk....",
    "........kJJBCDkCDDk.....",
    "........kBBBCDkCCDDk....",
    "........kBBBCDkCCDDk....",
    ".........kBBCDkJDDDk....",
    "........kBJJJJkCJJJk....",
    "........kBBCCDkCCDDk....",
    "........kBBCDDkCDDk.....",
    "........kBBCDkCCDDk.....",
    "........kBCCDkCCDDk.....",
    "........kBCDDkCDDDk.....",
    ".......kJBCJkkkDJkkkk...",
    ".......kAJJAAAAkCCCCCk..",
    "........kkkkkkkkkkkkk...",
];
exports.HERO2 = HERO2;
function maskOf(rows, k = 1) {
    const h = rows.length * k, w = rows[0].length * k, data = new Uint8Array(w * h);
    rows.forEach((r, y) => [...r].forEach((ch, x) => {
        if (ch === ".")
            return;
        for (let j = 0; j < k * k; j++)
            data[(y * k + ((j / k) | 0)) * w + x * k + (j % k)] = 1;
    }));
    return { w, h, data };
}
const MASKS = { 1: maskOf(HERO, 1), 2: maskOf(HERO2, 1) };
const SPRITES = { 1: HERO, 2: HERO2 };
function pixelsOf(rows, pal) {
    const w = rows[0].length, data = new Uint32Array(w * rows.length);
    rows.forEach((r, y) => [...r].forEach((ch, x) => (data[y * w + x] = ch === "." ? 0 : (0, color_js_1.hex)(pal[ch]))));
    return data;
}
const PIXELS = { 1: pixelsOf(HERO, HERO_PAL), 2: pixelsOf(HERO2, DUMMY_PAL) };
function stockActor(k = 1) {
    k = k === 2 ? 2 : 1;
    const m = MASKS[k], x = -Math.floor(m.w / 2), y = -m.h;
    return { mask: m, pixels: PIXELS[k], x, y, w: m.w, h: m.h, k, head: [0, y], chest: [0, k === 2 ? -26 : y + 11], ...(k === 2 ? { eyes: [[13, 3], [15, 3]] } : {}) };
}
function drawActor(p, actor = stockActor(), a = 1) {
    if (a > 0)
        p.sprite(SPRITES[actor.k === 2 ? 2 : 1], actor.k === 2 ? DUMMY_PAL : HERO_PAL, actor.x, actor.y, { a });
}
const actorAlphaOf = (mod, t, o) => (typeof mod.actorAlpha === "function" ? mod.actorAlpha(t, o) : 1);
exports.actorAlphaOf = actorAlphaOf;

},
"fx/impacts/hit-spark.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.meta = void 0;
exports.create = create;
const index_js_1 = require("../../core/index.js");
exports.meta = {
    name: "Hit spark",
    desc: "The everyday hit: a sharp, lopsided cross flare with one long ray along the blow round a white diamond core, then a cone of sparks and hot chips that fall and bounce.",
    tags: ["impact", "hit", "spark", "combat", "directional", "one-shot"],
    size: [136, 80],
    origin: [44, 64],
    duration: 0.5,
    loop: false,
    fps: 30,
    bg: "ground",
    options: { palette: ["#4a1712", "#c9281f", "#f2561d", "#ff8a2a", "#ffe26b", "#fff3a6", "#ffffff"], height: 20, aim: 0.1, seed: 4 },
};
function ray(p, x, y, a, L, w, C, from = 0) {
    const c = Math.cos(a), s = Math.sin(a);
    for (let d = from * L; d <= L; d += 0.5) {
        const u = d / L, hw = w * Math.pow(1 - u, 1.6);
        const col = u < 0.3 ? index_js_1.WHITE : u < 0.62 ? C[5] : u < 0.88 ? C[4] : C[3];
        p.px(x + c * d, y + s * d, col);
        if (hw > 0.45)
            for (let o = 0.5; o <= hw; o += 0.5)
                for (const e of [-o, o])
                    p.px(x + c * d - s * e, y + s * d + c * e, u < 0.3 && o < 1 ? C[5] : C[4]);
    }
}
function diamond(p, x, y, r, C) {
    for (let dy = -r - 1; dy <= r + 1; dy++)
        for (let dx = -r - 1; dx <= r + 1; dx++) {
            const m = Math.abs(dx) + Math.abs(dy);
            if (m <= r)
                p.px(x + dx, y + dy, index_js_1.WHITE);
            else if (m === r + 1)
                p.px(x + dx, y + dy, C[3]);
        }
}
function create(o) {
    const C = (0, index_js_1.fit)(o.palette, 7), R = new index_js_1.Rng(o.seed), X = 0, Y = -o.height, A = o.aim, floor = () => 0;
    const ps = new index_js_1.Particles({ rng: R, ground: floor, sparks: [C[6], C[5], C[4], C[2]] });
    const lights = new index_js_1.Lights();
    const tilt = R.range(-0.08, 0.08);
    const rays = [
        { a: A + tilt, L: R.range(33, 37), w: 2.2 },
        { a: A + Math.PI + tilt, L: R.range(8, 10), w: 2.2 },
        { a: A - Math.PI / 2 + tilt, L: R.range(15, 18), w: 2.6 },
        { a: A + Math.PI / 2 + tilt, L: R.range(10, 12), w: 2.3 },
        { a: A - Math.PI / 4 + tilt, L: R.range(5, 7), w: 1 },
    ];
    lights.add(X, Y, 38, C[4], 0.35, 0.18);
    lights.add(X + Math.cos(A) * 10, Y + Math.sin(A) * 10, 22, C[5], 0.45, 0.1);
    lights.add(X, -2, 26, C[3], 0.22, 0.22);
    for (let i = 0; i < 9; i++) {
        const a = A + R.range(-0.6, 0.6) - 0.15, v = R.range(170, 360);
        ps.spawn(index_js_1.P.SPARK, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - 40, R.range(0.25, 0.45), index_js_1.WHITE, 1, i > 6 ? R.range(0.01, 0.03) : 0);
    }
    for (let i = 0; i < 6; i++) {
        const a = A + R.range(-1.1, 0.5) - 0.3, v = R.range(70, 170);
        ps.spawn(index_js_1.P.GRIT, X + 1, Y, Math.cos(a) * v, Math.sin(a) * v - R.range(30, 80), R.range(0.35, 0.45), R.pick([C[5], C[4], C[4], C[3]]), 1);
    }
    let t = 0;
    return {
        update(dt) {
            t += dt;
            ps.update(dt);
            lights.update(dt);
        },
        draw(p) {
            ps.draw(p);
            if (t < 0.025) {
                for (const r of rays)
                    ray(p, X, Y, r.a, r.L, r.w, C);
                diamond(p, X, Y, 4, C);
            }
            else if (t < 0.058) {
                for (const r of rays)
                    ray(p, X, Y, r.a, r.L * 1.2, r.w * 0.55, C, 0.12);
                diamond(p, X, Y, 3, C);
            }
            else if (t < 0.092) {
                const r = rays[0];
                ray(p, X, Y, r.a, r.L * 1.3, 0.6, [C[0], C[1], C[2], C[3], C[3], C[4]], 0.4);
            }
            const pop = Math.exp(-t / 0.045);
            if (pop > 0.02) {
                p.glow(X, Y, 22, C[4], 0.3 * pop);
                p.glow(X, Y, 7, index_js_1.WHITE, 0.15 * pop);
                p.glowLine(X, Y, X + Math.cos(A) * 26, Y + Math.sin(A) * 26, 4, C[5], 0.25 * pop);
            }
            lights.draw(p);
        },
    };
}

},
"core/index.js":function(require,module,exports){
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftHits = exports.shiftKeys = exports.chain = exports.READY = exports.posedParts = exports.skeleton = exports.posed = exports.SKINS = exports.STAND = exports.Target = exports.lerpPose = exports.poseAt = exports.actTiming = exports.actSpan = exports.actBounds = exports.createAct = exports.BACKDROPS = exports.backdrop = exports.DUMMY_PAL = exports.HERO_PAL = exports.HERO2 = exports.HERO = exports.actorAlphaOf = exports.drawActor = exports.stockActor = exports.resolveOptions = exports.painterFor = exports.composite = exports.createFx = exports.clearFrame = exports.createFrame = exports.textWidth = exports.FONTS = exports.Painter = exports.crystal = exports.band = exports.flare = exports.sparkle = exports.SMOKE_RAMP = exports.FIRE_RAMP = exports.GRAVITY = exports.B = exports.PF = exports.P = exports.Blazes = exports.Lights = exports.Bits = exports.Particles = void 0;
__exportStar(require("./math.js"), exports);
__exportStar(require("./color.js"), exports);
__exportStar(require("./particles.js"), exports);
__exportStar(require("./shapes.js"), exports);
var sim_js_1 = require("./sim.js");
Object.defineProperty(exports, "Particles", { enumerable: true, get: function () { return sim_js_1.Particles; } });
Object.defineProperty(exports, "Bits", { enumerable: true, get: function () { return sim_js_1.Bits; } });
Object.defineProperty(exports, "Lights", { enumerable: true, get: function () { return sim_js_1.Lights; } });
Object.defineProperty(exports, "Blazes", { enumerable: true, get: function () { return sim_js_1.Blazes; } });
Object.defineProperty(exports, "P", { enumerable: true, get: function () { return sim_js_1.P; } });
Object.defineProperty(exports, "PF", { enumerable: true, get: function () { return sim_js_1.PF; } });
Object.defineProperty(exports, "B", { enumerable: true, get: function () { return sim_js_1.B; } });
Object.defineProperty(exports, "GRAVITY", { enumerable: true, get: function () { return sim_js_1.GRAVITY; } });
Object.defineProperty(exports, "FIRE_RAMP", { enumerable: true, get: function () { return sim_js_1.FIRE_RAMP; } });
Object.defineProperty(exports, "SMOKE_RAMP", { enumerable: true, get: function () { return sim_js_1.SMOKE_RAMP; } });
Object.defineProperty(exports, "sparkle", { enumerable: true, get: function () { return sim_js_1.sparkle; } });
Object.defineProperty(exports, "flare", { enumerable: true, get: function () { return sim_js_1.flare; } });
Object.defineProperty(exports, "band", { enumerable: true, get: function () { return sim_js_1.band; } });
Object.defineProperty(exports, "crystal", { enumerable: true, get: function () { return sim_js_1.crystal; } });
var painter_js_1 = require("./painter.js");
Object.defineProperty(exports, "Painter", { enumerable: true, get: function () { return painter_js_1.Painter; } });
var font_js_1 = require("./font.js");
Object.defineProperty(exports, "FONTS", { enumerable: true, get: function () { return font_js_1.FONTS; } });
Object.defineProperty(exports, "textWidth", { enumerable: true, get: function () { return font_js_1.textWidth; } });
var fx_js_1 = require("./fx.js");
Object.defineProperty(exports, "createFrame", { enumerable: true, get: function () { return fx_js_1.createFrame; } });
Object.defineProperty(exports, "clearFrame", { enumerable: true, get: function () { return fx_js_1.clearFrame; } });
Object.defineProperty(exports, "createFx", { enumerable: true, get: function () { return fx_js_1.createFx; } });
Object.defineProperty(exports, "composite", { enumerable: true, get: function () { return fx_js_1.composite; } });
Object.defineProperty(exports, "painterFor", { enumerable: true, get: function () { return fx_js_1.painterFor; } });
Object.defineProperty(exports, "resolveOptions", { enumerable: true, get: function () { return fx_js_1.resolveOptions; } });
var actor_js_1 = require("./actor.js");
Object.defineProperty(exports, "stockActor", { enumerable: true, get: function () { return actor_js_1.stockActor; } });
Object.defineProperty(exports, "drawActor", { enumerable: true, get: function () { return actor_js_1.drawActor; } });
Object.defineProperty(exports, "actorAlphaOf", { enumerable: true, get: function () { return actor_js_1.actorAlphaOf; } });
Object.defineProperty(exports, "HERO", { enumerable: true, get: function () { return actor_js_1.HERO; } });
Object.defineProperty(exports, "HERO2", { enumerable: true, get: function () { return actor_js_1.HERO2; } });
Object.defineProperty(exports, "HERO_PAL", { enumerable: true, get: function () { return actor_js_1.HERO_PAL; } });
Object.defineProperty(exports, "DUMMY_PAL", { enumerable: true, get: function () { return actor_js_1.DUMMY_PAL; } });
var scene_js_1 = require("./scene.js");
Object.defineProperty(exports, "backdrop", { enumerable: true, get: function () { return scene_js_1.backdrop; } });
Object.defineProperty(exports, "BACKDROPS", { enumerable: true, get: function () { return scene_js_1.BACKDROPS; } });
var act_js_1 = require("./act.js");
Object.defineProperty(exports, "createAct", { enumerable: true, get: function () { return act_js_1.createAct; } });
Object.defineProperty(exports, "actBounds", { enumerable: true, get: function () { return act_js_1.actBounds; } });
Object.defineProperty(exports, "actSpan", { enumerable: true, get: function () { return act_js_1.actSpan; } });
Object.defineProperty(exports, "actTiming", { enumerable: true, get: function () { return act_js_1.actTiming; } });
Object.defineProperty(exports, "poseAt", { enumerable: true, get: function () { return act_js_1.poseAt; } });
Object.defineProperty(exports, "lerpPose", { enumerable: true, get: function () { return act_js_1.lerpPose; } });
Object.defineProperty(exports, "Target", { enumerable: true, get: function () { return act_js_1.Target; } });
Object.defineProperty(exports, "STAND", { enumerable: true, get: function () { return act_js_1.STAND; } });
Object.defineProperty(exports, "SKINS", { enumerable: true, get: function () { return act_js_1.SKINS; } });
Object.defineProperty(exports, "posed", { enumerable: true, get: function () { return act_js_1.posed; } });
var rig_js_1 = require("./rig.js");
Object.defineProperty(exports, "skeleton", { enumerable: true, get: function () { return rig_js_1.skeleton; } });
Object.defineProperty(exports, "posedParts", { enumerable: true, get: function () { return rig_js_1.posedParts; } });
var poses_js_1 = require("./poses.js");
Object.defineProperty(exports, "READY", { enumerable: true, get: function () { return poses_js_1.READY; } });
var chain_js_1 = require("./chain.js");
Object.defineProperty(exports, "chain", { enumerable: true, get: function () { return chain_js_1.chain; } });
Object.defineProperty(exports, "shiftKeys", { enumerable: true, get: function () { return chain_js_1.shiftKeys; } });
Object.defineProperty(exports, "shiftHits", { enumerable: true, get: function () { return chain_js_1.shiftHits; } });

},
"core/particles.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Particles = void 0;
exports.fly = fly;
exports.flyV = flyV;
exports.burst = burst;
exports.cycle = cycle;
exports.stream = stream;
const math_js_1 = require("./math.js");
function fly(x, y, vx, vy, t, g = 0, drag = 0) {
    if (drag <= 0)
        return [x + vx * t, y + vy * t + 0.5 * g * t * t];
    const f = (1 - Math.exp(-drag * t)) / drag, vt = g / drag;
    return [x + vx * f, y + vt * t + (vy - vt) * f];
}
function flyV(vx, vy, t, g = 0, drag = 0) {
    if (drag <= 0)
        return [vx, vy + g * t];
    const e = Math.exp(-drag * t), vt = g / drag;
    return [vx * e, vt + (vy - vt) * e];
}
function burst(n, seed, fn) {
    for (let i = 0; i < n; i++)
        fn((0, math_js_1.rng)(seed, i), i);
}
function cycle(t, period, count, seed, life, fn) {
    for (let i = 0; i < count; i++) {
        const g = (0, math_js_1.rng)(seed, i, 911);
        const born = g.next() * period;
        const L = typeof life === "function" ? life(g) : life;
        let age = (((t - born) % period) + period) % period;
        for (; age < L; age += period)
            fn(age, L, (0, math_js_1.rng)(seed, i), i);
    }
}
function stream(t, t0, t1, rate, seed, life, fn) {
    const n = Math.floor((Math.min(t, t1) - t0) * rate);
    for (let i = 0; i <= n; i++) {
        const born = t0 + i / rate, g = (0, math_js_1.rng)(seed, i, 911), L = typeof life === "function" ? life(g) : life;
        const age = t - born;
        if (age >= 0 && age < L)
            fn(age, L, (0, math_js_1.rng)(seed, i), i);
    }
}
class Particles {
    constructor() {
        this.list = [];
    }
    add(p) {
        p.age = 0;
        p.g ?? (p.g = 0);
        p.drag ?? (p.drag = 0);
        this.list.push(p);
        return p;
    }
    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            if ((p.age += dt) >= p.life) {
                this.list.splice(i, 1);
                continue;
            }
            p.vx -= p.vx * p.drag * dt;
            p.vy += p.g * dt - p.vy * p.drag * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.ground !== undefined && p.y > p.ground) {
                p.y = p.ground;
                p.vy = -Math.abs(p.vy) * (p.bounce ?? 0.3);
                p.vx *= 0.7;
            }
        }
    }
    static k(p) {
        return (0, math_js_1.clamp)(1 - p.age / p.life);
    }
}
exports.Particles = Particles;

},
"core/shapes.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bolt = bolt;
exports.forks = forks;
exports.star = star;
exports.ngon = ngon;
exports.trail = trail;
const math_js_1 = require("./math.js");
function bolt(r, x0, y0, x1, y1, { jag = 0.22, depth = 5 } = {}) {
    let pts = [[x0, y0], [x1, y1]];
    for (let d = 0; d < depth; d++) {
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
            const off = (r.next() * 2 - 1) * jag * L;
            next.push([(ax + bx) / 2 + (-dy / (L || 1)) * off, (ay + by) / 2 + (dx / (L || 1)) * off], pts[i]);
        }
        pts = next;
    }
    return pts;
}
function forks(r, path, { count = 3, len = 20, jag = 0.3, spread = 0.9 } = {}) {
    const out = [];
    for (let k = 0; k < count; k++) {
        const i = 1 + Math.floor(r.next() * (path.length - 2)), [x, y] = path[i], [px, py] = path[i - 1];
        const a = Math.atan2(y - py, x - px) + (r.next() < 0.5 ? -1 : 1) * spread * (0.4 + 0.6 * r.next());
        const l = len * (0.4 + 0.6 * r.next());
        out.push(bolt(r, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, { jag, depth: 3 }));
    }
    return out;
}
function star(cx, cy, r0, r1, n = 5, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const a = rot + (i * Math.PI) / n, r = i % 2 ? r0 : r1;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
}
function ngon(cx, cy, r, n = 6, rot = 0) {
    return Array.from({ length: n }, (_, i) => [cx + Math.cos(rot + (i * math_js_1.TAU) / n) * r, cy + Math.sin(rot + (i * math_js_1.TAU) / n) * r]);
}
function trail(pos, t, n, dt) {
    const out = [];
    for (let i = 0; i < n; i++)
        out.push(pos(Math.max(0, t - i * dt)));
    return out;
}

},
"core/sim.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Lights = exports.Bits = exports.B = exports.Blazes = exports.Particles = exports.PF = exports.P = exports.SMOKE_RAMP = exports.FIRE_RAMP = exports.GRAVITY = void 0;
exports.sparkle = sparkle;
exports.flare = flare;
exports.band = band;
exports.crystal = crystal;
const math_js_1 = require("./math.js");
const color_js_1 = require("./color.js");
exports.GRAVITY = 950;
const CROSS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const HOT = ["#fff3a6", "#ffe26b", "#ff8a2a", "#f2561d"].map(color_js_1.hex);
exports.FIRE_RAMP = ["#ffffff", "#fff3a6", "#ffe26b", "#ffc23d", "#ff8a2a", "#f2561d", "#c9281f", "#8a1f17", "#4a1712"].map(color_js_1.hex);
exports.SMOKE_RAMP = ["#7b6f72", "#5d5660", "#433d48", "#2b2630", "#1a171e"].map(color_js_1.hex);
const rampAt = (r, t) => r[Math.min(r.length - 1, Math.max(0, Math.floor(t * r.length)))];
exports.P = { SPARK: 0, MOTE: 1, STREAK: 2, FLAKE: 3, VAPOUR: 4, DUST: 5, STAR: 6, EMBER: 7, SMOKE: 8, FIRE: 9, BRAND: 10, GRIT: 11 };
exports.PF = { SMOKES: 1, BIG: 2, BACK: 4 };
const SOFT = new Set([exports.P.VAPOUR, exports.P.DUST, exports.P.SMOKE]);
class Particles {
    constructor(opts = {}) {
        this.R = opts.rng ?? new math_js_1.Rng(opts.seed ?? 1);
        this.list = [];
        this.t = 0;
        this.ground = opts.ground ?? (() => Infinity);
        this.sparks = (opts.sparks ?? HOT).map(color_js_1.hex);
        this.haze = opts.haze === undefined ? null : (0, color_js_1.hex)(opts.haze);
        this.onLand = opts.onLand ?? null;
    }
    spawn(k, x, y, vx, vy, life, col = color_js_1.WHITE, size = 1, delay = 0, flag = 0) {
        this.list.push({ k, x, y, vx, vy, life, max: life, col: col ? (0, color_js_1.hex)(col) : 0, size, seed: this.R.next() * 100, delay, flag });
    }
    get count() {
        return this.list.length;
    }
    update(dt) {
        this.t += dt;
        const R = this.R, t = this.t;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            if (p.delay > 0) {
                p.delay -= dt;
                continue;
            }
            if ((p.life -= dt) <= 0) {
                if (p.k === exports.P.FIRE && p.flag & exports.PF.SMOKES) {
                    const big = p.flag & exports.PF.BIG;
                    this.spawn(exports.P.SMOKE, p.x, p.y, p.vx * 0.6, p.vy * 0.6 - 6, big ? R.range(1.3, 2.3) : R.range(0.8, 1.4), 0, p.size * (big ? 0.85 : 0.7), 0, big ? exports.PF.BIG : 0);
                }
                this.list.splice(i, 1);
                continue;
            }
            switch (p.k) {
                case exports.P.FIRE:
                    p.vy -= 95 * dt;
                    p.vx += Math.sin(t * 17 + p.seed) * 30 * dt;
                    p.vx -= p.vx * 5 * dt;
                    p.vy -= p.vy * 3.2 * dt;
                    break;
                case exports.P.GRIT: {
                    p.vy += exports.GRAVITY * dt;
                    p.vx -= p.vx * 0.8 * dt;
                    const g = this.ground(p.x), ny = p.y + p.vy * dt;
                    p.x += p.vx * dt;
                    if (p.vy > 0 && p.y <= g && ny >= g) {
                        p.y = g - 0.25;
                        if (p.vy > 130 && R.chance(0.4))
                            (p.vy = -p.vy * 0.25), (p.vx = p.vx * 0.5 + R.range(-10, 10));
                        else
                            (p.vx = p.vy = 0), (p.life = Math.min(p.life, 0.5));
                    }
                    else
                        p.y = ny;
                    continue;
                }
                case exports.P.BRAND: {
                    p.vy += exports.GRAVITY * 0.8 * dt;
                    p.vx -= p.vx * 0.9 * dt;
                    if (R.chance(0.9 * Math.min(1, dt * 60)))
                        this.spawn(exports.P.FIRE, p.x, p.y, p.vx * 0.1 + R.range(-7, 7), p.vy * 0.1 - 10, R.range(0.16, 0.32), 0, R.range(0.9, 1.7) * (0.5 + (p.life / p.max) * 0.6), 0, R.chance(0.4) ? exports.PF.SMOKES : 0);
                    const g = this.ground(p.x), ny = p.y + p.vy * dt;
                    p.x += p.vx * dt;
                    if (p.vy > 0 && p.y <= g && ny >= g) {
                        this.onLand?.(p.x, g);
                        this.list.splice(i, 1);
                    }
                    else
                        p.y = ny;
                    continue;
                }
                case exports.P.SPARK: {
                    p.vy += exports.GRAVITY * 0.45 * dt;
                    p.vx -= p.vx * 2.2 * dt;
                    p.vy -= p.vy * 2.2 * dt;
                    const g = this.ground(p.x), ny = p.y + p.vy * dt;
                    p.x += p.vx * dt;
                    if (p.vy > 0 && p.y <= g && ny >= g)
                        (p.vy = -p.vy * 0.45), (p.vx *= 0.7), (p.y = g - 0.25);
                    else
                        p.y = ny;
                    continue;
                }
                case exports.P.STREAK:
                    (p.vx += p.vx * 3 * dt), (p.vy += p.vy * 3 * dt);
                    break;
                case exports.P.FLAKE:
                    p.vx -= p.vx * 2.2 * dt;
                    p.vy -= p.vy * 2.2 * dt - 35 * dt;
                    p.x += Math.sin(this.t * 2.5 + p.seed) * 7 * dt;
                    break;
                case exports.P.EMBER:
                    p.vy += (-30 + Math.sin(t * 3 + p.seed) * 20) * dt;
                    p.vx += Math.cos(t * 2.3 + p.seed) * 45 * dt;
                    p.vx -= p.vx * 1.6 * dt;
                    p.vy -= p.vy * 1.6 * dt;
                    break;
                case exports.P.SMOKE: {
                    const big = p.flag & exports.PF.BIG;
                    p.vy -= (big ? 23 : 16) * dt;
                    p.vx += Math.sin(t * 1.3 + p.seed) * 8 * dt;
                    p.vx -= p.vx * 1.6 * dt;
                    p.vy -= p.vy * 1.2 * dt;
                    break;
                }
                case exports.P.MOTE:
                    p.vx -= p.vx * 0.6 * dt;
                    p.vy -= p.vy * 0.6 * dt;
                    break;
                default: {
                    const drag = SOFT.has(p.k) ? 4 : 1.6;
                    p.vx -= p.vx * drag * dt;
                    p.vy -= p.vy * drag * dt + 5 * dt;
                }
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }
    draw(p, layer) {
        for (const q of this.list) {
            if (q.delay > 0)
                continue;
            if (layer && (SOFT.has(q.k) || q.flag & exports.PF.BACK ? "back" : "front") !== layer)
                continue;
            const k = q.life / q.max, x = q.x, y = q.y, sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
            switch (q.k) {
                case exports.P.SPARK: {
                    const S = this.sparks, head = k > 0.6 ? S[0] : k > 0.3 ? S[1] : S[2], len = Math.min(9, 1 + sp * 0.022);
                    p.line(x - ux * len, y - uy * len, x - ux * len * 0.4, y - uy * len * 0.4, k > 0.5 ? head : S[S.length - 1]);
                    p.line(x - ux * len * 0.45, y - uy * len * 0.45, x, y, head);
                    p.glow(x, y, 3, head, 0.45 * k);
                    break;
                }
                case exports.P.MOTE: {
                    const len = Math.min(16, 0.5 + sp * 0.026) * q.size, a = k < 0.35 ? k / 0.35 : 1;
                    p.line(x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, (0, color_js_1.scale)(q.col, 0.55), a);
                    p.line(x - ux * len * 0.4, y - uy * len * 0.4, x, y, q.col, a);
                    p.glow(x, y, 2.5 + q.size, q.col, 0.4 * k);
                    break;
                }
                case exports.P.STREAK: {
                    const L = (0, math_js_1.clamp)(sp / 30, 1, 7);
                    for (let d = L; d >= 0; d -= 0.5)
                        p.dot(x - ux * d, y - uy * d, d < 1 ? color_js_1.WHITE : d < L * 0.5 ? q.col : (0, color_js_1.scale)(q.col, 0.6), d < L * 0.5 ? 1 : 1.2 - d / L);
                    p.glow(x, y, 4, q.col, 0.4);
                    break;
                }
                case exports.P.FLAKE: {
                    const a = Math.min(1, k * 3);
                    p.dot(x, y, q.col, a);
                    if (q.size > 1.3)
                        for (const [dx, dy] of CROSS)
                            p.dot(x + dx, y + dy, (0, color_js_1.scale)(q.col, 0.8), a * 0.8);
                    break;
                }
                case exports.P.VAPOUR: {
                    const r = q.size * (0.6 + (1 - k) * 0.9);
                    p.disc(x, y, r, q.col, Math.pow(k, 1.3) * 0.45);
                    if (this.haze)
                        p.glow(x, y, r * 1.8, this.haze, 0.16 * k);
                    break;
                }
                case exports.P.DUST:
                    p.disc(x, y, q.size * (0.6 + (1 - k) * 0.9), q.col, Math.pow(k, 1.3) * 0.7);
                    break;
                case exports.P.SMOKE: {
                    const age = 1 - k, big = q.flag & exports.PF.BIG;
                    const r = q.size * (0.65 + Math.min(1, age * 2.5) * 0.45 + age * (big ? 0.5 : 0.4));
                    const a = Math.min(1, age * 12) * Math.min(1, k * 2.4) * (big ? 0.7 : 0.58);
                    const c = q.col ? (0, color_js_1.mix)(q.col, rampAt(exports.SMOKE_RAMP, age), age) : rampAt(exports.SMOKE_RAMP, age * 1.05);
                    p.disc(x, y, r, c, a * 0.45);
                    p.disc(x + r * 0.05, y + r * 0.06, r * 0.74, c, a * 0.62);
                    if (age < 0.5)
                        p.disc(x - r * 0.22, y - r * 0.3, r * 0.5, (0, color_js_1.mix)(c, color_js_1.WHITE, 0.12), a * 0.4 * (1 - age * 2));
                    break;
                }
                case exports.P.FIRE: {
                    const age = 1 - k, heat = Math.min(0.999, Math.pow(age, 0.62) + (q.seed % 1) * 0.1), F = exports.FIRE_RAMP, n = F.length;
                    const idx = Math.min(n - 2, Math.floor(heat * (n - 1)));
                    const r = q.size * (0.55 + 0.45 * Math.min(1, age * 7)) * (1 - age * 0.55), c = F[idx];
                    if (idx >= n - 2)
                        p.disc(x, y, r, c, Math.min(1, k * 3) * 0.85);
                    else {
                        p.circle(x, y, r, F[Math.min(n - 1, idx + 2)]);
                        p.circle(x - r * 0.16, y - r * 0.22, r * 0.78, c);
                        if (r > 1.6)
                            p.circle(x, y - r * 0.9, r * 0.42, c);
                        if (idx <= 3 && r > 1.8)
                            p.circle(x - r * 0.28, y - r * 0.34, r * 0.36, F[Math.max(0, idx - 1)]);
                        if (idx < 6)
                            p.glow(x, y, r * 2.4 + 2, c, 0.18 * k);
                    }
                    break;
                }
                case exports.P.BRAND:
                    p.circle(x, y, 1.6, HOT[3]);
                    p.px(x, y, Math.sin(this.t * 40 + q.seed) > 0 ? HOT[0] : HOT[1]);
                    p.px(x + 1, y, HOT[1]);
                    p.glow(x, y, 7, HOT[2], 0.45);
                    break;
                case exports.P.GRIT:
                    if (k > 0.25 || k * 4 > 0.5) {
                        p.px(x, y, q.col);
                        if (q.size >= 2)
                            p.px(x + 1, y, q.col), p.px(x, y + 1, (0, color_js_1.scale)(q.col, 0.8)), p.px(x + 1, y + 1, (0, color_js_1.scale)(q.col, 0.7));
                    }
                    break;
                case exports.P.EMBER: {
                    const c = k > 0.6 ? this.sparks[0] : k > 0.3 ? this.sparks[1] : this.sparks[2];
                    if (k < 0.25 && Math.sin(this.t * 40 + q.seed) < 0)
                        break;
                    p.px(x, y, c);
                    if (q.size > 1.5)
                        p.px(x, y + 1, this.sparks[this.sparks.length - 1]);
                    p.glow(x, y, 3 + q.size, c, 0.35 * k);
                    break;
                }
                default: {
                    const tw = 0.6 + 0.4 * Math.sin(this.t * (8 + (q.seed % 5)) + q.seed);
                    if (q.size < 1) {
                        if (tw * k > 0.25)
                            p.px(x, y, tw > 0.8 ? color_js_1.WHITE : q.col);
                        p.glow(x, y, 3, q.col, 0.4 * k * tw);
                        break;
                    }
                    sparkle(p, x, y, q.size * tw * Math.min(1, k * 3), q.col, (0, color_js_1.scale)(q.col, 0.75), 0.5 * k * tw);
                }
            }
        }
    }
}
exports.Particles = Particles;
class Blazes {
    constructor(ps) {
        this.ps = ps;
        this.list = [];
    }
    add(x, y, life, power) {
        this.list.push({ x, y, life, max: life, acc: this.ps.R.next(), power });
    }
    get count() {
        return this.list.length;
    }
    update(dt) {
        const ps = this.ps, R = ps.R;
        for (let i = this.list.length - 1; i >= 0; i--) {
            const b = this.list[i];
            if ((b.life -= dt) <= 0) {
                this.list.splice(i, 1);
                continue;
            }
            const k = b.life / b.max, intensity = b.power * (k > 0.7 ? 1 : 0.35 + (k / 0.7) * 0.65);
            for (b.acc += dt * (6 + 16 * intensity); b.acc > 1; b.acc--) {
                const s = R.range(1.2, 2.8) * intensity;
                ps.spawn(exports.P.FIRE, b.x + R.range(-1.5, 1.5), b.y - s * 0.6, R.range(-6, 6), R.range(-30, -12), R.range(0.28, 0.6), 0, s, 0, exports.PF.BACK | (R.chance(0.3) ? exports.PF.SMOKES : 0));
                if (R.chance(0.06))
                    ps.spawn(exports.P.EMBER, b.x, b.y - 1.5, R.range(-15, 15), R.range(-45, -15), R.range(0.6, 1.4), HOT[2], 1, 0, exports.PF.BACK);
            }
        }
    }
    drawBack(p) {
        for (const b of this.list) {
            const k = b.life / b.max;
            p.px(b.x, b.y, k > 0.4 ? (Math.sin(b.life * 31 + b.x) > 0 ? HOT[1] : HOT[2]) : HOT[3]);
            p.glow(b.x, b.y, 6 + 5 * k * b.power, HOT[2], 0.3 * k * b.power);
        }
    }
}
exports.Blazes = Blazes;
exports.B = { SHARD: 0, CHUNK: 1, DRIP: 2 };
class Bits {
    constructor(opts = {}) {
        this.list = [];
        this.ground = opts.ground ?? (() => Infinity);
    }
    add(b) {
        const life = b.life ?? 1;
        this.list.push({ kind: exports.B.SHARD, vx: 0, vy: 0, a: 0, va: 0, s: 1, c: color_js_1.WHITE, g: 1, drag: 0, bounce: 0, rest: false, ...b, life, max: life });
    }
    get count() {
        return this.list.length;
    }
    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const b = this.list[i];
            if ((b.life -= dt) <= 0) {
                this.list.splice(i, 1);
                continue;
            }
            if (b.rest)
                continue;
            b.vy += exports.GRAVITY * b.g * dt;
            b.vx -= b.vx * b.drag * dt;
            b.vy -= b.vy * b.drag * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.a += b.va * dt;
            const floor = this.ground(b.x), sp = b.vy;
            if (b.g <= 0 || b.y < floor || sp <= 0)
                continue;
            b.y = floor - 0.01;
            if (b.kind === exports.B.DRIP)
                b.life = 0;
            else if (b.bounce > 0 && sp > 70)
                (b.vy = -sp * b.bounce), (b.vx *= 0.7), (b.va *= 0.6);
            else
                (b.rest = true), (b.vx = b.vy = 0);
        }
    }
    draw(p) {
        for (const b of this.list) {
            const a = Math.min(1, b.life / 0.4), ca = Math.cos(b.a), sa = Math.sin(b.a);
            if (b.kind === exports.B.SHARD) {
                for (let d = -b.s / 2; d <= b.s / 2; d += 0.5)
                    p.dot(b.x + ca * d, b.y + sa * d, d > b.s / 2 - 0.6 ? color_js_1.WHITE : (0, color_js_1.hex)(b.c), a);
            }
            else if (b.kind === exports.B.DRIP) {
                p.dot(b.x, b.y, (0, color_js_1.hex)(b.c), a);
                p.dot(b.x, b.y - 1, (0, color_js_1.hex)(b.c), a * 0.5);
            }
            else {
                const R = (b.ramp ?? ["#1c2030", "#3a4a66", "#6e86a8", "#a8c0dc", "#e8f2ff"]).map(color_js_1.hex), n = R.length;
                const x = Math.round(b.x), y = Math.round(b.y), r = Math.ceil(b.s) + 1;
                for (let py = -r; py <= r; py++)
                    for (let px = -r; px <= r; px++) {
                        const u = (px + 0.5) * ca + (py + 0.5) * sa, v = -(px + 0.5) * sa + (py + 0.5) * ca;
                        const d = Math.abs(u) / b.s + Math.abs(v) / (b.s * 0.62);
                        if (d > 1.3)
                            continue;
                        p.dot(x + px, y + py, d > 1 ? R[0] : v < 0 ? (u < 0 ? R[n - 1] : R[n - 2]) : u < 0 ? R[n - 3] : R[Math.max(1, n - 4)], a);
                    }
            }
        }
    }
}
exports.Bits = Bits;
class Lights {
    constructor() {
        this.list = [];
    }
    add(x, y, r, color, k, life) {
        this.list.push({ x, y, r, color: (0, color_js_1.hex)(color), k, life, max: life });
    }
    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--)
            if ((this.list[i].life -= dt) <= 0)
                this.list.splice(i, 1);
    }
    draw(p) {
        for (const l of this.list) {
            const k = l.life / l.max;
            p.glow(l.x, l.y, l.r * (0.55 + 0.45 * k), l.color, l.k * k * k);
        }
    }
}
exports.Lights = Lights;
function sparkle(p, x, y, arm, c, tip = c, k = 0.6) {
    const n = Math.round(arm);
    if (n < 1)
        return;
    const X = Math.floor(x), Y = Math.floor(y);
    for (let d = 1; d <= n; d++) {
        const cc = d > n * 0.6 ? tip : c;
        for (const [dx, dy] of CROSS)
            p.px(X + dx * d, Y + dy * d, cc);
    }
    if (n >= 3)
        for (const [dx, dy] of DIAG)
            p.px(X + dx, Y + dy, c);
    if (n >= 6)
        for (const [dx, dy] of DIAG)
            p.px(X + dx * 2, Y + dy * 2, tip);
    p.px(X, Y, color_js_1.WHITE);
    p.glow(x, y, 4 + n * 2, c, k);
}
function flare(p, x, y, L, k, ramp) {
    if (L < 1)
        return;
    const R = ramp.map(color_js_1.hex), n = R.length;
    for (let i = 0; i < 8; i++) {
        const an = (i * Math.PI) / 4, len = i % 4 === 0 ? L : i % 2 === 0 ? L * 0.6 : L * 0.3, ca = Math.cos(an), sa = Math.sin(an);
        for (let d = 0; d <= len; d += 0.5) {
            const u = d / len;
            p.dot(x + ca * d, y + sa * d, u < 0.35 ? color_js_1.WHITE : u < 0.7 ? R[n - 2] : R[n - 3], u < 0.6 ? 1 : k * 1.5 * (1 - u) + 0.2);
        }
    }
}
function band(p, cx, cy, r, sy, th, k, ramp, keep = () => true, hot = false) {
    if (r <= 0 || k <= 0)
        return;
    const R = ramp.map(color_js_1.hex), n = R.length;
    for (let j = 0, m = Math.ceil(r * math_js_1.TAU * 1.2); j < m; j++) {
        const ang = (j / m) * math_js_1.TAU, ca = Math.cos(ang), sa = Math.sin(ang);
        if (!keep(ang))
            continue;
        for (let o = th; o >= 0; o -= 0.5) {
            const u = o / th, c = u < 0.15 ? (hot ? color_js_1.WHITE : R[n - 1]) : u < 0.4 ? R[n - 2] : u < 0.7 ? R[n - 3] : R[n - 4];
            p.dot(cx + ca * (r - o), cy + sa * (r - o) * sy, c, k * (u < 0.4 ? 1.2 : 1.15 - u));
        }
    }
}
function crystal(p, x, base, h, w, lean, ramp, opts = {}) {
    if (h < 1.5)
        return;
    const R = ramp.map(color_js_1.hex), n = R.length, C = (i) => R[Math.max(0, n - 1 - i)];
    const a = opts.a ?? 1, top = base - h, ridge0 = x - w * 0.14, glint = opts.glint ?? -1;
    const inside = (px, py) => {
        const u = (base - (py + 0.5)) / h;
        return u >= 0 && u <= 1 && Math.abs(px + 0.5 - (x + lean * u)) <= (w / 2) * (1 - u) + 0.35;
    };
    for (let py = Math.floor(top) - 1; py < Math.ceil(base); py++)
        for (let px = Math.floor(x - w / 2 - Math.abs(lean) - 2); px <= Math.ceil(x + w / 2 + Math.abs(lean) + 2); px++) {
            if (!inside(px, py)) {
                if (inside(px - 1, py) || inside(px + 1, py) || inside(px, py + 1) || (inside(px, py - 1) && py < base - 1))
                    p.dot(px, py, R[0], a);
                continue;
            }
            if (opts.white) {
                p.dot(px, py, color_js_1.WHITE, a);
                continue;
            }
            const u = (base - (py + 0.5)) / h, rx = ridge0 + (x + lean - ridge0) * u, c = x + lean * u, hw = (w / 2) * (1 - u) + 0.35, fx = px + 0.5;
            let col = u > 0.9 ? color_js_1.WHITE : Math.abs(fx - rx) < 0.55 ? C(1)
                : fx < rx ? (fx - (c - hw) < 1 ? C(1) : (fx - (c - hw)) / Math.max(1, rx - (c - hw)) > 0.55 ? C(2) : C(3))
                    : c + hw - fx < 1.2 ? C(Math.min(n - 2, 6)) : (fx - rx) / Math.max(1, c + hw - rx) > 0.5 ? C(5) : C(4);
            if (glint >= 0 && fx <= rx + 0.6) {
                const g = Math.abs(u - glint);
                if (g < 0.05)
                    col = color_js_1.WHITE;
                else if (g < 0.1)
                    col = C(1);
            }
            p.dot(px, py, col, a);
        }
}

},
"core/scene.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BACKDROPS = void 0;
exports.backdrop = backdrop;
const color_js_1 = require("./color.js");
const math_js_1 = require("./math.js");
const SKY = (0, color_js_1.hex)("#15131d"), SKY_TOP = (0, color_js_1.hex)("#0d0b14"), SKY_LOW = (0, color_js_1.hex)("#221d33");
const FLOOR_EDGE = (0, color_js_1.hex)("#4a4263"), FLOOR = (0, color_js_1.hex)("#2b2639"), FLOOR_DARK = (0, color_js_1.hex)("#211d2d"), MORTAR = (0, color_js_1.hex)("#1a1724");
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
exports.BACKDROPS = ["dark", "ground", "sky", "light", "black"];
function backdrop(kind, w, h, groundY = h) {
    const out = new Uint32Array(w * h);
    if (kind === "light")
        return out.fill((0, color_js_1.hex)("#ebe8f0"));
    if (kind === "black")
        return out.fill((0, color_js_1.hex)("#000000"));
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            let c = SKY;
            if (kind === "sky") {
                const t = y / Math.max(1, h - 1), step = (t * 5 + BAYER[((y & 3) << 2) | (x & 3)] / 16) | 0;
                c = (0, color_js_1.mix)(SKY_TOP, SKY_LOW, Math.min(1, step / 4));
                const r = (0, math_js_1.rand)(x, y, 77);
                if (r > 0.994)
                    c = (0, color_js_1.mix)(c, (0, color_js_1.hex)("#cfc8ff"), 0.35 + (r - 0.994) * 90);
            }
            if (kind === "ground" && y >= groundY) {
                const gy = y - groundY;
                if (gy === 0)
                    c = FLOOR_EDGE;
                else {
                    const row = Math.floor((gy - 1) / 5), off = row % 2 ? 6 : 0;
                    const mortar = (gy - 1) % 5 === 4 || (x + off) % 12 === 0;
                    c = mortar ? MORTAR : gy < 3 ? FLOOR : FLOOR_DARK;
                }
            }
            out[y * w + x] = c;
        }
    return out;
}

},
"core/act.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Target = exports.SKINS = exports.posed = exports.STAND = void 0;
exports.lerpPose = lerpPose;
exports.poseAt = poseAt;
exports.actSpan = actSpan;
exports.createAct = createAct;
exports.actTiming = actTiming;
exports.actBounds = actBounds;
const math_js_1 = require("./math.js");
const color_js_1 = require("./color.js");
const fx_js_1 = require("./fx.js");
const actor_js_1 = require("./actor.js");
const rig_js_1 = require("./rig.js");
Object.defineProperty(exports, "posed", { enumerable: true, get: function () { return rig_js_1.posed; } });
Object.defineProperty(exports, "STAND", { enumerable: true, get: function () { return rig_js_1.STAND; } });
const lerp = (a, b, u) => a + (b - a) * u;
function lerpPose(a, b, u) {
    const out = { ...rig_js_1.STAND, ...a };
    const B = { ...rig_js_1.STAND, ...b };
    for (const k of Object.keys(B)) {
        const v = B[k];
        if (typeof v === "number" && typeof out[k] === "number")
            out[k] = lerp(out[k], v, u);
        else if (out[k] === undefined && typeof v === "number")
            out[k] = v;
    }
    for (const k of ["hx", "hy", "lean", "crouch"])
        if (B[k] === undefined && typeof out[k] === "number")
            out[k] = lerp(out[k], 0, u);
    if (B.wl === undefined && typeof out.wl === "number")
        out.wl = lerp(out.wl, 1, u);
    return out;
}
const eases = { out: (u) => 1 - (1 - u) * (1 - u), in: (u) => u * u, line: (u) => u };
function poseAt(track, t) {
    if (t <= track[0][0])
        return track[0][1];
    for (let i = 0; i < track.length - 1; i++) {
        const [t0, a] = track[i], [t1, b, how] = track[i + 1];
        if (t >= t1)
            continue;
        if (how === "snap")
            return a;
        const e = eases[how] ?? ((u) => u * u * (3 - 2 * u));
        const stepped = t0 + Math.floor((t - t0) * 12 + 1e-6) / 12;
        const out = lerpPose(a, b, e((stepped - t0) / (t1 - t0)));
        const u = e((t - t0) / (t1 - t0));
        out.x = lerp(a.x ?? 0, b.x ?? 0, u);
        out.y = lerp(a.y ?? 0, b.y ?? 0, u);
        return out;
    }
    return track[track.length - 1][1];
}
function isHeld(track, t) {
    if (t >= track[track.length - 1][0] || t < track[0][0])
        return true;
    for (let i = 0; i < track.length - 1; i++) {
        if (t >= track[i + 1][0])
            continue;
        const a = { ...rig_js_1.STAND, ...track[i][1] }, b = { ...rig_js_1.STAND, ...track[i + 1][1] };
        return track[i + 1][0] - track[i][0] > 0.4 && ["fx", "fy", "bx", "by", "crouch", "lean", "x", "y"].every((k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) < 1.5);
    }
    return true;
}
const TW = 38, TH = 52;
const TP = Object.fromEntries(Object.entries({ ink: "#0b0a1a", wood: "#724c2e", woodL: "#a0703a", woodD: "#4e331f", straw: "#d2aa55", strawL: "#f0d98a", burlapD: "#86643a", burlap: "#b38b57", burlapL: "#c9a26c", red: "#9a2f3c", redL: "#c4434f", white: "#ffffff" }).map(([k, v]) => [k, (0, color_js_1.hex)(v)]));
const DUST = ["#efe7dc", "#c9bfb8", "#8f8693", "#5a5468"].map(color_js_1.hex);
const DUMMY = new Uint32Array(TW * TH);
(function buildDummy() {
    const px = (x, y, c) => { if (x >= 0 && y >= 0 && x < TW && y < TH)
        DUMMY[y * TW + x] = c; };
    const R = (x, y, w, h, c) => { for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++)
            px(x + i, y + j, c); };
    R(15, 38, 8, 14, TP.ink);
    R(16, 34, 6, 18, TP.wood);
    R(16, 34, 2, 18, TP.woodL);
    R(20, 34, 2, 18, TP.woodD);
    R(1, 18, 36, 1, TP.ink);
    R(1, 23, 36, 1, TP.ink);
    R(1, 19, 36, 4, TP.wood);
    R(1, 19, 36, 1, TP.woodL);
    R(1, 22, 36, 1, TP.woodD);
    for (const [bx, s] of [[0, -1], [33, 1]]) {
        R(bx, 17, 5, 8, TP.straw);
        for (const [dx, dy, c] of [[2, 16, TP.straw], [3, 15, TP.strawL], [1, 17, TP.strawL], [2, 25, TP.straw], [1, 26, TP.strawL], [3, 25, TP.burlapD], [2, 19, TP.strawL], [3, 21, TP.strawL], [1, 22, TP.burlapD], [2, 23, TP.strawL]])
            px(bx + dx, dy, c);
        px(s < 0 ? bx - 1 : bx + 5, 19, TP.straw);
        px(s < 0 ? bx - 1 : bx + 5, 22, TP.strawL);
    }
    const sack = (x, y, w, h) => {
        R(x + 1, y, w - 2, 1, TP.ink);
        R(x + 1, y + h - 1, w - 2, 1, TP.ink);
        R(x, y + 1, 1, h - 2, TP.ink);
        R(x + w - 1, y + 1, 1, h - 2, TP.ink);
        R(x + 1, y + 1, w - 2, h - 2, TP.burlap);
        R(x + w - 4, y + 1, 3, h - 2, TP.burlapD);
        R(x + 1, y + h - 3, w - 2, 2, TP.burlapD);
        R(x + 1, y + 1, 1, h - 4, TP.burlapL);
        R(x + 1, y + 1, w - 6, 1, TP.burlapL);
        for (let j = y + 2; j < y + h - 2; j += 3)
            for (let i = x + 3 + (j % 2); i < x + w - 4; i += 4)
                px(i, j, TP.burlapD);
    };
    sack(9, 17, 20, 24);
    for (let y = 19; y < 36; y++)
        for (let x = 11; x < 27; x++) {
            const d = Math.hypot(x - 18.5, y - 27);
            if ((d > 4 && d < 5.4) || d < 1.9)
                px(x, y, x + y < 45 ? TP.redL : TP.red);
        }
    for (let x = 10; x < 28; x++) {
        px(x, 36, x & 1 ? TP.woodL : TP.straw);
        px(x, 37, x & 1 ? TP.woodD : TP.wood);
    }
    for (const [x, y, c] of [[11, 41, TP.straw], [12, 42, TP.strawL], [14, 41, TP.strawL], [15, 42, TP.straw], [23, 41, TP.straw], [24, 42, TP.strawL], [26, 41, TP.straw], [13, 43, TP.straw], [25, 43, TP.straw]])
        px(x, y, c);
    sack(10, 1, 18, 16);
    for (const ex of [14, 23])
        for (let d = -2; d <= 2; d++) {
            px(ex + d, 7 + d, TP.ink);
            px(ex - d, 7 + d, TP.ink);
        }
    for (let x = 14; x < 24; x++)
        px(x, 12, x & 1 ? TP.ink : TP.burlapD);
    for (const x of [15, 18, 21]) {
        px(x, 11, TP.ink);
        px(x, 13, TP.ink);
    }
    for (let x = 12; x < 26; x++) {
        px(x, 16, x & 1 ? TP.woodL : TP.straw);
        px(x, 17, x & 1 ? TP.wood : TP.woodD);
    }
    for (const [x, y, c] of [[13, 0, TP.straw], [15, 0, TP.strawL], [18, 0, TP.straw], [21, 0, TP.strawL], [24, 0, TP.straw], [9, 4, TP.straw], [28, 6, TP.straw], [8, 7, TP.strawL], [29, 3, TP.strawL]])
        px(x, y, c);
})();
exports.SKINS = { flash: [TP.white, 1], char: [(0, color_js_1.hex)("#1a0c0e"), 0.72], ice: [(0, color_js_1.hex)("#a8e8ff"), 0.72], shadow: [(0, color_js_1.hex)("#3a1a70"), 0.5], holy: [(0, color_js_1.hex)("#fff4c0"), 0.5], red: [(0, color_js_1.hex)("#ff2040"), 0.45], shock: [(0, color_js_1.hex)("#8fd6ff"), 0.6], poison: [(0, color_js_1.hex)("#58c43a"), 0.5] };
const STRAW = [TP.strawL, TP.straw, TP.straw, TP.burlapD, TP.burlapD];
class Target {
    constructor(x, seed = 5) {
        Object.assign(this, { x, theta: 0, omega: 0, flashT: 0, skin: null, skinFade: 0, shiver: 0, clock: 0, R: new math_js_1.Rng(seed), straw: [] });
    }
    hit({ push = 1.2, straw = 8, flash = 0.05, skin, shiver = 0, y = -26 } = {}) {
        this.omega += push;
        this.flashT = Math.max(this.flashT, flash);
        if (skin !== undefined)
            this.skin = skin;
        if (shiver)
            this.shiver = shiver;
        const R = this.R;
        for (let k = 0; k < straw; k++) {
            const back = R.next() < 0.3;
            this.straw.push({ x: this.x + R.range(-3, 3), y: y + R.range(-3, 3), vx: back ? R.range(-60, -5) : R.range(10, 130), vy: R.range(-120, -5), age: 0, life: R.range(1.2, 2.2), big: R.next() < 0.5 });
        }
    }
    step(dt) {
        this.clock += dt;
        this.omega += (-60 * this.theta - 3.4 * this.omega) * dt;
        this.theta = (0, math_js_1.clamp)(this.theta + this.omega * dt, -0.4, 0.42);
        if (this.flashT > 0)
            this.flashT -= dt;
        if (this.shiver > 0)
            this.shiver -= dt;
        for (const s of this.straw) {
            s.age += dt;
            s.vy += 210 * dt;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            if (s.y >= 0) {
                s.y = 0;
                s.vx *= 0.2;
                s.vy = 0;
            }
        }
        this.straw = this.straw.filter((s) => s.age < s.life);
    }
    draw(C, W, H, X, Y, flip) {
        const tan = Math.tan(this.theta), sv = this.shiver > 0 ? (Math.floor(this.clock * 30) & 1 ? 1 : -1) : 0, name = this.flashT > 0 ? "flash" : this.skin, sk = name ? exports.SKINS[name] : null;
        const base = X + (flip ? -this.x - 1 : this.x);
        for (let r = 0; r < TH; r++) {
            const o = Math.round((TH - 1 - r) * tan * 0.8) + sv;
            for (let x = 0; x < TW; x++) {
                const c = DUMMY[r * TW + x];
                if (!c)
                    continue;
                const px = base + (flip ? -(x - 19 + o) - 1 : x - 19 + o), py = Y - TH + r;
                if (px >= 0 && py >= 0 && px < W && py < H)
                    C[py * W + px] = sk ? (0, color_js_1.mix)(c, sk[0], sk[1]) : c;
            }
        }
    }
    drawStraw(C, W, H, X, Y, flip) {
        for (const s of this.straw) {
            const c = STRAW[Math.min(4, Math.floor((s.age / s.life) * 5))], lx = Math.round(s.x), ly = Math.round(s.y) - 1;
            for (let i = 0; i < (s.big ? 2 : 1); i++) {
                const px = X + (flip ? -(lx + i) - 1 : lx + i), py = Y + ly;
                if (px >= 0 && py >= 0 && px < W && py < H)
                    C[py * W + px] = c;
            }
        }
    }
}
exports.Target = Target;
const GHOST_LIFE = 0.16;
const REST_MASK = new Uint8Array(24 * 38), REST_PX = new Uint32Array(24 * 38);
actor_js_1.HERO2.forEach((row, r) => [...row].forEach((ch, c) => {
    if (ch !== ".") {
        REST_MASK[r * 24 + c] = 1;
        REST_PX[r * 24 + c] = (0, color_js_1.hex)(actor_js_1.DUMMY_PAL[ch]);
    }
}));
const NEAREST = new Int16Array(24 * 38).fill(-1);
for (let r = 0; r < 38; r++)
    for (let c = 0; c < 24; c++) {
        let best = -1, bd = 1e9;
        for (let y = Math.max(0, r - 7); y < Math.min(38, r + 8); y++)
            for (let x = Math.max(0, c - 7); x < Math.min(24, c + 8); x++) {
                const d = (x - c) * (x - c) + (y - r) * (y - r);
                if (REST_MASK[y * 24 + x] && d < bd) {
                    bd = d;
                    best = y * 24 + x;
                }
            }
        NEAREST[r * 24 + c] = best;
    }
const lum = (c) => (0.3 * (c & 255) + 0.59 * ((c >>> 8) & 255) + 0.11 * ((c >>> 16) & 255)) / 255;
function carry(v, rest, own) {
    const lv = lum(v);
    if (lv > 0.9 || v >>> 24 < 255)
        return v;
    const k = Math.max(0.45, Math.min(1.5, lum(own) / Math.max(0.08, lum(rest))));
    const ch = (n) => Math.min(255, Math.round(((v >>> n) & 255) * k));
    return (255 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
function actSpan(mod) {
    const a = mod.act, D = mod.meta?.duration ?? 1, k = a?.poses;
    return { from: Math.min(0, k?.[0]?.[0] ?? 0), to: mod.meta?.loop ? Infinity : Math.max(D, k?.[k.length - 1]?.[0] ?? 0) };
}
function createAct(mod, o = {}) {
    const a = mod.act ?? {}, meta = mod.meta ?? {}, D = meta.duration ?? 1, flip = !!o.flip, seed = o.seed ?? meta.options?.seed ?? 1;
    const fx = (0, fx_js_1.createFx)(mod, o), track = a.poses ?? [[0, { ...rig_js_1.STAND }]], span = actSpan(mod);
    const X = o.x ?? 0, Y = o.y ?? 0;
    const targets = (a.targets ?? (a.target ? [a.target] : [])).map((g, i) => new Target(g.x ?? 66, seed + 4 + i));
    const hits = (a.hits ?? []).map((h) => ({ ...h })).sort((p, q) => p.t - q.t), dust = (a.dust ?? []).slice();
    const R = new math_js_1.Rng(seed + 9), specks = [];
    const ramp = o.palette ?? meta.options?.palette, ghosts = [], gc = (0, color_js_1.hex)(a.ghost ?? ramp?.[Math.floor(ramp.length * 0.7)] ?? "#8fb4ff");
    let t = span.from, stop = 0, stopped = false, shakeT = 0, shake0 = 0, amp = 0, nh = 0, nd = 0, loopN = 0, gAcc = 0, last = null;
    const poseNow = () => {
        let tt = t;
        if (meta.loop && t >= D)
            tt = t % D;
        let q = poseAt(track, tt);
        if (!meta.loop && isHeld(track, tt)) {
            const up = Math.floor(tt * 3) & 1;
            q = { ...rig_js_1.STAND, ...q, crouch: (q.crouch ?? 0) + up, fy: (q.fy ?? rig_js_1.STAND.fy) + up, by: (q.by ?? rig_js_1.STAND.by) + up };
        }
        last = q;
        return q;
    };
    let scratch = null;
    const scratchFor = (f) => {
        if (!scratch || scratch.a.w !== f.w || scratch.a.h !== f.h)
            scratch = { a: (0, fx_js_1.createFrame)(f.w, f.h, f.ox, f.oy), b: (0, fx_js_1.createFrame)(f.w, f.h, f.ox, f.oy) };
        return scratch;
    };
    const out = {
        fx, meta, act: a, targets,
        get t() { return t; },
        get shake() {
            if (shakeT <= 0)
                return [0, 0];
            const k = amp * (shakeT / shake0), f = Math.floor(shakeT * 60);
            return [Math.round(Math.sin(f * 2.4) * k), Math.round(Math.cos(f * 3.7) * k * 0.7)];
        },
        get frozen() { return stop > 0; },
        get pose() { return last; },
        update(dt) {
            if (shakeT > 0)
                shakeT -= dt;
            if (stop > 0) {
                stop -= dt;
                return;
            }
            const t0 = t;
            t += dt;
            if (t >= 0)
                fx.update(t0 < 0 ? t : dt);
            if (meta.loop && t >= D) {
                const n = Math.floor(t / D);
                if (n !== loopN) {
                    loopN = n;
                    nh = 0;
                    nd = 0;
                }
            }
            const tt = meta.loop && t >= D ? t % D : t;
            for (; nh < hits.length && hits[nh].t <= tt; nh++) {
                const h = hits[nh];
                if (h.stop)
                    stop = Math.max(stop, h.stop);
                if (h.shake) {
                    shakeT = shake0 = h.shake;
                    amp = h.amp ?? 2;
                }
                if (h.target !== false)
                    targets.forEach((g, i) => (h.at === undefined || h.at === i) && g.hit(h));
                out.onHit?.(h);
            }
            for (; nd < dust.length && dust[nd].t <= tt; nd++) {
                const d = dust[nd], n = d.n ?? 6;
                for (let i = 0; i < n; i++) {
                    const dir = d.dir ?? (R.next() < 0.5 ? -1 : 1);
                    specks.push({ x: d.x + R.range(-3, 3), y: -1 - R.range(0, 2), vx: dir * R.range(22, 90), vy: R.range(-34, -6), age: 0, life: R.range(0.16, 0.4), big: R.next() < 0.45, c: d.c ? (0, color_js_1.hex)(d.c) : 0 });
                }
            }
            for (const k of specks) {
                k.age += dt;
                k.vx *= 1 - 5 * dt;
                k.vy += 110 * dt;
                k.x += k.vx * dt;
                k.y = Math.min(-1, k.y + k.vy * dt);
            }
            for (let i = specks.length - 1; i >= 0; i--)
                if (specks[i].age >= specks[i].life)
                    specks.splice(i, 1);
            const q = poseNow();
            for (const g of targets)
                g.step(dt);
            gAcc += dt;
            if (q.ghost && gAcc >= 1 / 30) {
                gAcc = 0;
                ghosts.push({ q, age: 0 });
                if (ghosts.length > 7)
                    ghosts.shift();
            }
            for (const g of ghosts)
                g.age += dt;
            while (ghosts.length && ghosts[0].age > GHOST_LIFE)
                ghosts.shift();
        },
        draw(frame, { body = true, target: showTarget = true } = {}) {
            const W = frame.w, H = frame.h, q = last ?? poseNow(), active = t >= 0;
            const tgt = showTarget ? targets : [];
            const drawTargets = () => tgt.forEach((g) => g.draw(frame.color, W, H, FX, FY, flip));
            const drawStraw = () => tgt.forEach((g) => g.drawStraw(frame.color, W, H, FX, FY, flip));
            const drawDust = () => {
                for (const k of specks) {
                    const c = k.c || DUST[Math.min(3, Math.floor((k.age / k.life) * 4))], lx = Math.round(k.x), py = FY + Math.round(k.y);
                    for (let i = 0; i < (k.big ? 2 : 1); i++) {
                        const px = flip ? FX - lx - i - 1 : FX + lx + i;
                        if (px >= 0 && py >= 0 && px < W && py < H)
                            frame.color[py * W + px] = c;
                    }
                }
            };
            const FX = X - (frame.ox | 0), FY = Y - (frame.oy | 0);
            if (!body) {
                if (active)
                    fx.draw(frame, "back");
                drawTargets();
                if (active)
                    fx.draw(frame, "front");
                drawStraw();
                return;
            }
            const rx = Math.round(q.x ?? 0), ry = Math.round(q.y ?? 0), BX = FX + (flip ? -rx : rx), BY = FY + ry;
            const r = (0, rig_js_1.posed)(q), mirror = flip;
            const paint = (i, color) => {
                const px = mirror ? BX - r.xs[i] - 1 : BX + r.xs[i], py = BY + r.ys[i];
                if (px < 0 || py < 0 || px >= W || py >= H)
                    return;
                frame.color[py * W + px] = color;
                if (ghosts.length)
                    frame.light[py * W + px] = 0;
            };
            const drawGhosts = () => {
                for (const g of ghosts) {
                    const gr = (0, rig_js_1.posed)(g.q), gx = FX + (flip ? -Math.round(g.q.x ?? 0) : Math.round(g.q.x ?? 0)), gy = FY + Math.round(g.q.y ?? 0), k = 0.5 * (1 - g.age / GHOST_LIFE);
                    const gm = flip, r0 = (gc & 255) * k, g0 = ((gc >>> 8) & 255) * k, b0 = ((gc >>> 16) & 255) * k;
                    for (let i = 0; i < gr.n; i++) {
                        const px = gm ? gx - gr.xs[i] - 1 : gx + gr.xs[i], py = gy + gr.ys[i];
                        if (px < 0 || py < 0 || px >= W || py >= H)
                            continue;
                        const j = py * W + px, d = frame.light[j];
                        frame.light[j] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + b0) << 16) | (Math.min(255, ((d >>> 8) & 255) + g0) << 8) | Math.min(255, (d & 255) + r0);
                    }
                }
            };
            const shadow = () => {
                const sy = FY, cx = FX + (flip ? -rx : rx), hw = 10 + (Math.abs(q.ffx - q.fbx) >> 1) - Math.min(8, Math.abs(ry) >> 1);
                if (sy < 0 || sy >= H)
                    return;
                for (let dy = 0; dy < 2; dy++)
                    for (let x = -hw + dy * 2; x <= hw - dy * 2; x++) {
                        const px = cx + x, i = (sy + dy) * W + px;
                        if (px < 0 || px >= W || sy + dy >= H)
                            continue;
                        frame.color[i] = (frame.color[i] & 0xffffff) | (Math.max(frame.color[i] >>> 24, 110) << 24);
                    }
            };
            if (!a.onBody) {
                if (active)
                    fx.draw(frame, "back");
                drawTargets();
                shadow();
                drawGhosts();
                for (let i = 0; i < r.n; i++)
                    paint(i, r.color[i]);
                if (active)
                    fx.draw(frame, "front");
                drawStraw();
                drawDust();
                return;
            }
            const { a: A, b: B } = scratchFor(frame);
            (0, fx_js_1.clearFrame)(A);
            (0, fx_js_1.clearFrame)(B);
            if (active)
                fx.draw(A, "back");
            B.color.set(A.color);
            B.light.set(A.light);
            const tt = meta.loop ? (t < 0 ? 0 : t % D) : (0, math_js_1.clamp)(t, 0, D), alpha = active ? (0, actor_js_1.actorAlphaOf)(mod, tt, fx.options) : 1;
            (0, actor_js_1.drawActor)((0, fx_js_1.painterFor)(B).place(FX, FY, flip), fx.options.actor ?? (0, actor_js_1.stockActor)(2), alpha);
            if (active)
                fx.draw(B, "front");
            const follow = a.follow ?? 1, lean = (q.lean ?? 0) * follow, cr = (q.crouch ?? 0) * follow;
            const shiftOf = (ly) => {
                const k = (0, math_js_1.clamp)((-11 - ly) / 7, 0, 1), f = (0, math_js_1.clamp)((-1 - ly) / 6, 0, 1);
                return [Math.round(lean * k + rx * f), Math.round(cr * k + ry * f)];
            };
            const rest = (sx, sy) => {
                const c = (flip ? FX - sx - 1 : sx - FX) + 12, r0 = sy - FY + 38;
                return c >= 0 && r0 >= 0 && c < 24 && r0 < 38 && REST_MASK[r0 * 24 + c] === 1;
            };
            const C = frame.color, Ls = frame.light;
            const copy = (buf, sx, sy, s) => {
                const [dx, dy] = shiftOf(sy - FY), px = sx + (flip ? -dx : dx), py = sy + dy;
                if (px < 0 || py < 0 || px >= W || py >= H)
                    return;
                const i = py * W + px;
                if (buf === Ls) {
                    const d = Ls[i];
                    Ls[i] = (255 << 24) | (Math.min(255, ((d >>> 16) & 255) + ((s >>> 16) & 255)) << 16) | (Math.min(255, ((d >>> 8) & 255) + ((s >>> 8) & 255)) << 8) | Math.min(255, (d & 255) + (s & 255));
                }
                else if (s >>> 24 === 255 || !C[i])
                    C[i] = s;
                else {
                    const k = (s >>> 24) / 255, d = C[i];
                    const ch = (n) => Math.round(((s >>> n) & 255) * k + ((d >>> n) & 255) * (1 - k));
                    C[i] = (Math.max(s >>> 24, d >>> 24) << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0);
                }
            };
            drawTargets();
            shadow();
            for (let sy = 0; sy < H; sy++)
                for (let sx = 0; sx < W; sx++) {
                    const c = A.color[sy * W + sx];
                    if (c)
                        copy(C, sx, sy, c);
                }
            drawGhosts();
            const restIndex = (s) => {
                const c = s % 24, r0 = (s / 24) | 0, sx = flip ? FX - (c - 12) - 1 : FX + c - 12, sy = FY + r0 - 38;
                return sx >= 0 && sy >= 0 && sx < W && sy < H ? sy * W + sx : -1;
            };
            for (let i = 0; i < r.n; i++) {
                const s = r.src[i] >= 0 ? NEAREST[r.src[i]] : -1;
                if (s < 0) {
                    if (alpha > 0.5)
                        paint(i, r.color[i]);
                    continue;
                }
                const j = restIndex(s), v = j >= 0 ? B.color[j] : REST_PX[s];
                if (!v)
                    continue;
                paint(i, v === REST_PX[s] ? r.color[i] : carry(v, REST_PX[s], r.color[i]));
            }
            for (let sy = 0; sy < H; sy++)
                for (let sx = 0; sx < W; sx++) {
                    const j = sy * W + sx;
                    if (B.color[j] && B.color[j] !== A.color[j] && !rest(sx, sy))
                        copy(C, sx, sy, B.color[j]);
                    if (B.light[j] & 0xffffff)
                        copy(Ls, sx, sy, B.light[j]);
                }
            drawStraw();
            drawDust();
        },
        stop() {
            fx.stop();
            stopped = true;
        },
        done() {
            return stopped ? fx.done() : t >= span.to && stop <= 0;
        },
    };
    poseNow();
    return out;
}
function actTiming(mod) {
    const a = mod.act;
    if (!a)
        return null;
    const { from, to } = actSpan(mod), D = mod.meta?.duration ?? 1;
    return {
        windup: -from,
        recovery: mod.meta?.loop ? 0 : Math.max(0, to - D),
        onBody: !!a.onBody,
        targets: (a.targets ?? (a.target ? [a.target] : [])).map((g) => g.x ?? 66),
        hits: (a.hits ?? []).map((h) => ({ t: h.t, freeze: h.stop ?? 0, shake: h.shake ?? 0, amp: h.amp ?? 0, push: h.target === false ? 0 : h.push ?? 1.2, skin: h.skin, at: h.at })),
        poses: (a.poses ?? []).map(([t, pose, how]) => ({ t, how: how ?? "smooth", pose })),
    };
}
function actBounds(mod) {
    const a = mod.act, [w, h] = mod.meta.size, [ox, oy] = mod.meta.origin;
    let x0 = -ox, y0 = -oy, x1 = w - ox, y1 = h - oy;
    const see = (p) => {
        const r = (0, rig_js_1.posed)(p), X = Math.round(p.x ?? 0), Y = Math.round(p.y ?? 0), a = r.x0, b = r.x1;
        x0 = Math.min(x0, a + X - 1);
        x1 = Math.max(x1, b + X + 1);
        y0 = Math.min(y0, r.y0 + Y - 1);
        y1 = Math.max(y1, r.y1 + Y + 1);
    };
    const k = a?.poses;
    if (k) {
        for (let t = k[0][0]; t <= k[k.length - 1][0]; t += 1 / 12)
            see(poseAt(k, t));
        for (const key of k)
            see(key[1]);
    }
    else
        see(rig_js_1.STAND);
    for (const g of a?.targets ?? (a?.target ? [a.target] : [])) {
        const tx = g.x ?? 66;
        x0 = Math.min(x0, tx - 30);
        x1 = Math.max(x1, tx + 36);
        y0 = Math.min(y0, -56);
    }
    return { x0, y0, x1, y1 };
}

},
"core/rig.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEAPONS = exports.STAND = void 0;
exports.shortfall = shortfall;
exports.posed = posed;
exports.skeleton = skeleton;
exports.posedParts = posedParts;
const color_js_1 = require("./color.js");
const actor_js_1 = require("./actor.js");
const PAL = Object.fromEntries(Object.entries(actor_js_1.DUMMY_PAL).map(([k, v]) => [k, (0, color_js_1.hex)(v) >>> 0]));
const INK = PAL.k, SEAM = PAL.J, MARK = PAL.m;
const SHELL = [PAL.A, PAL.B, PAL.C, PAL.D], CORE = [PAL.E, PAL.F, PAL.G, PAL.G];
const DEG = Math.PI / 180, W0 = 24, H0 = 38;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => mul(a, 1 / (len(a) || 1e-6));
const rotY = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (t) => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const mm = (A, B) => { const o = new Array(9); for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
        o[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]; return o; };
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
const tv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const M = {
    pelvis: 19.7, spine1: 2.8, spine2: 4.6, shoulderUp: 2.5, shoulderOut: 5.9, neckUp: 4.0, headUp: 3.1,
    hipDown: 1.1, hipOut: 2.8, thigh: 8.6, shin: 8.3, upper: 7.6, fore: 7.4, turn: 36 * DEG,
};
exports.STAND = { lean: 0, crouch: 0, yaw: 0, fx: -3, fy: -15, bx: 5, by: -15, ffx: -2, ffy: -4, fbx: 3, fby: -4 };
function ik(a, target, L1, L2, pole) {
    let to = sub(target, a), d = len(to);
    const reach = L1 + L2 - 0.02;
    if (d > reach) {
        to = mul(to, reach / d);
        d = reach;
    }
    const u = unit(to), along = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - along * along));
    let v = sub(pole, mul(u, dot(pole, u)));
    v = len(v) < 1e-4 ? unit(cross(u, [0, 0, 1])) : unit(v);
    return { joint: add(a, add(mul(u, along), mul(v, h))), end: add(a, to), u, v };
}
function frame(t, R) {
    return { t, R };
}
function boneFrame(a, b, pole) {
    const x = unit(sub(b, a));
    let y = sub(pole, mul(x, dot(pole, x)));
    y = len(y) < 1e-4 ? unit(cross(x, [0, 0, 1])) : unit(y);
    const z = cross(x, y);
    return frame(a, [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]]);
}
const weaponOf = (name) => exports.WEAPONS[name];
function solve(pose) {
    const q = { ...exports.STAND, ...pose }, lean = q.lean, W = q.weapon && weaponOf(q.weapon), OW = q.offWeapon && weaponOf(q.offWeapon);
    const sa = q.sa ?? 0, wl = q.wl ?? 1, axisZ = Math.sqrt(Math.max(0, 1 - wl * wl)) * (q.wz ?? 1);
    const axis = [Math.cos(sa) * wl, -Math.sin(sa) * wl, axisZ], side = [-Math.sin(sa), -Math.cos(sa), 0];
    const two = !!(q.two && W), nearZ = q.fz ?? (two ? 3 : 4.5);
    const fwd = (q.fx - exports.STAND.fx) / 24, farFwd = two ? 0 : (q.bx - exports.STAND.bx) / 22;
    let turn = M.turn + (fwd >= 0 ? -44 * DEG * Math.min(1, fwd) : 28 * DEG * Math.min(1, -fwd * 1.8));
    turn += (farFwd > 0 ? 34 * DEG * Math.min(1, farFwd) : 0) + (q.twist ?? 0) * 4 * DEG;
    if (q.turn !== undefined)
        turn = q.turn;
    const hipTurn = M.turn + (turn - M.turn) * 0.45, tilt = Math.atan2(lean, 13);
    const Rp = mm(rotZ(-tilt * 0.25), rotY(-hipTurn)), Rc = mm(rotZ(-tilt), rotY(-turn));
    const ankleN = [q.ffx, -q.ffy - 1.8, q.fzz ?? 2.4], ankleF = [q.fbx, -q.fby - 1.8, q.bzz ?? -2.4];
    let pelvis = [lean * 0.2, M.pelvis - q.crouch, 0];
    const hipAt = (s) => add(pelvis, mv(Rp, [0, -M.hipDown, s * M.hipOut]));
    const maxLeg = (M.thigh + M.shin) * 0.995;
    for (const [s, a] of [[1, ankleN], [-1, ankleF]]) {
        const h = hipAt(s), dx = h[0] - a[0], dz = h[2] - a[2], flat = dx * dx + dz * dz;
        if (flat < maxLeg * maxLeg) {
            const top = a[1] + Math.sqrt(maxLeg * maxLeg - flat);
            if (h[1] > top)
                pelvis = [pelvis[0], pelvis[1] - (h[1] - top), pelvis[2]];
        }
    }
    const waist = add(pelvis, [Math.sin(tilt * 0.45) * M.spine1, Math.cos(tilt * 0.45) * M.spine1, 0]);
    const chest = add(waist, [Math.sin(tilt) * M.spine2, Math.cos(tilt) * M.spine2, 0]);
    const neck = add(chest, mv(Rc, [0, M.neckUp, 0]));
    const headTurn = M.turn * 0.9 + (turn - M.turn) * 0.35, nod = tilt * 0.35 + (q.hy ?? 0) * 7 * DEG, roll = (q.hx ?? 0) * 7 * DEG;
    const Rh = mm(rotZ(-nod - roll), rotY(-headTurn));
    const head = add(neck, mv(Rh, [0.15, M.headUp, 0]));
    const pick = (s, target) => {
        const base = add(chest, mv(Rc, [0, M.shoulderUp, s * M.shoulderOut])), to = sub(target, base), d = len(to);
        return add(base, mul(unit(to), Math.min(1.8, Math.max(0, d - 11) * 0.35)));
    };
    const nearT = [q.fx, -q.fy, nearZ];
    const farT = two ? [q.fx + axis[0] * W.two, -q.fy + axis[1] * W.two, nearZ + axis[2] * W.two] : [q.bx, -q.by, q.bz ?? (q.armsFront ? 5.5 : -4.5)];
    const sN = pick(1, nearT), sF = pick(-1, farT);
    const pole = (s, T, shoulder, hold) => {
        const up = clamp01((T[1] - shoulder[1] + 2) / 10);
        const base = [-0.55 + up * 1.1, -1 + up * 0.9, s * (0.45 + up * 0.5)];
        if (!hold)
            return base;
        const u = unit(sub(T, shoulder));
        let best = base, score = Infinity;
        for (let i = 0; i < 16; i++) {
            const a = (i / 16) * Math.PI * 2, x = unit(cross(u, [0.3, 1, 0.2])), y = cross(u, x), v = add(mul(x, Math.cos(a)), mul(y, Math.sin(a)));
            const A = ik(shoulder, T, M.upper, M.fore, v), f = unit(sub(A.end, A.joint));
            const cost = Math.abs(dot(f, hold)) * 0.7 + (1 - dot(unit(base), v)) * 0.55;
            if (cost < score) {
                score = cost;
                best = v;
            }
        }
        return best;
    };
    const holdN = W ? (W.across ? side : axis) : null, holdF = two ? (W.across ? side : axis) : OW ? [Math.cos(q.sb ?? Math.PI), -Math.sin(q.sb ?? Math.PI), 0] : null;
    const armN = ik(sN, nearT, M.upper, M.fore, pole(1, nearT, sN, holdN)), armF = ik(sF, farT, M.upper, M.fore, pole(-1, farT, sF, holdF));
    const kneePole = (s) => mv(Rp, [1, 0, s * 0.35]);
    const hipN = hipAt(1), hipF = hipAt(-1);
    const legN = ik(hipN, ankleN, M.thigh, M.shin, kneePole(1)), legF = ik(hipF, ankleF, M.thigh, M.shin, kneePole(-1));
    const footDir = (s) => { const t = hipTurn * 0.6 + s * 8 * DEG; return [Math.cos(t), 0, Math.sin(t)]; };
    const B = {
        pelvis: frame(pelvis, Rp), waist: frame(waist, mm(rotZ(-tilt * 0.6), rotY(-(turn + hipTurn) / 2))), chest: frame(chest, Rc), head: frame(head, Rh), neck: frame(neck, Rh),
        upperN: boneFrame(sN, armN.joint, armN.v), foreN: boneFrame(armN.joint, armN.end, armN.v), upperF: boneFrame(sF, armF.joint, armF.v), foreF: boneFrame(armF.joint, armF.end, armF.v),
        thighN: boneFrame(hipN, legN.joint, legN.v), shinN: boneFrame(legN.joint, legN.end, legN.v), thighF: boneFrame(hipF, legF.joint, legF.v), shinF: boneFrame(legF.joint, legF.end, legF.v),
    };
    B.footN = frame(legN.end, mm(rotY(-Math.atan2(footDir(1)[2], footDir(1)[0])), rotZ(q.toeF ? -55 * DEG : 0)));
    B.footF = frame(legF.end, mm(rotY(-Math.atan2(footDir(-1)[2], footDir(-1)[0])), rotZ(q.toeB ? -55 * DEG : 0)));
    return { B, W, OW, q, axis, side, armN, armF, legN, legF, sN, sF, hipN, hipF, turn };
}
const BW = 300, BH = 240, OX = 150, OY = 180;
const Zb = new Float32Array(BW * BH), Tone = new Float32Array(BW * BH), Part = new Int8Array(BW * BH), Mat = new Int8Array(BW * BH), Fr = new Int8Array(BW * BH), LX = new Float32Array(BW * BH), LY = new Float32Array(BW * BH), Col = new Uint32Array(BW * BH);
const touched = [];
const LIGHT = unit([-0.55, 0.72, 0.5]);
let clipBody = false, clipWeapon = false, curFrameIndex = 0, curDim = 0, onlyPart = 0;
const FRAME_IDS = ["pelvis", "waist", "chest", "head", "neck", "upperN", "foreN", "upperF", "foreF", "thighN", "shinN", "thighF", "shinF", "footN", "footF"];
function plot(i, z, tone, part, mat, wx, wy, color) {
    if (onlyPart && part !== onlyPart)
        return;
    if (Part[i] === 0)
        touched.push(i);
    else if (z <= Zb[i])
        return;
    Zb[i] = z;
    Tone[i] = tone;
    Part[i] = part;
    Mat[i] = mat;
    Fr[i] = curFrameIndex;
    LX[i] = wx;
    LY[i] = wy;
    Col[i] = color;
}
function sphere(c, r, part, mat) {
    const x0 = Math.floor(c[0] - r), x1 = Math.ceil(c[0] + r), y0 = Math.floor(c[1] - r), y1 = Math.ceil(c[1] + r);
    for (let wy = y0; wy <= y1; wy++)
        for (let wx = x0; wx <= x1; wx++) {
            const dx = wx - c[0], dy = wy - c[1], d2 = dx * dx + dy * dy;
            if (d2 > r * r || (clipBody && wy < 1.5))
                continue;
            const dz = Math.sqrt(r * r - d2), n = [dx / r, dy / r, dz / r], i = (OY - wy) * BW + (OX + wx);
            plot(i, c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
        }
}
function sweep(a, b, ra, rb, part, mat, bulge = 0) {
    const n = Math.max(2, Math.ceil(len(sub(b, a)) / 0.4));
    for (let k = 0; k <= n; k++) {
        const u = k / n;
        sphere(add(a, mul(sub(b, a), u)), ra + (rb - ra) * u + bulge * Math.sin(u * Math.PI), part, mat);
    }
}
function ellipsoid(c, R, r, part, mat) {
    const big = Math.max(r[0], r[1], r[2]), x0 = Math.floor(c[0] - big), x1 = Math.ceil(c[0] + big), y0 = Math.floor(c[1] - big), y1 = Math.ceil(c[1] + big);
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]], D = [1 / (r[0] * r[0]), 1 / (r[1] * r[1]), 1 / (r[2] * r[2])];
    const A = new Array(9);
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            A[i * 3 + j] = R[i * 3] * D[0] * R[j * 3] + R[i * 3 + 1] * D[1] * R[j * 3 + 1] + R[i * 3 + 2] * D[2] * R[j * 3 + 2];
    void Rt;
    for (let wy = y0; wy <= y1; wy++)
        for (let wx = x0; wx <= x1; wx++) {
            if (clipBody && wy < 1.5)
                continue;
            const dx = wx - c[0], dy = wy - c[1];
            const qa = A[8], qb = 2 * (A[2] * dx + A[5] * dy), qc = A[0] * dx * dx + 2 * A[1] * dx * dy + A[4] * dy * dy - 1, disc = qb * qb - 4 * qa * qc;
            if (disc < 0)
                continue;
            const dz = (-qb + Math.sqrt(disc)) / (2 * qa);
            const n = unit([A[0] * dx + A[1] * dy + A[2] * dz, A[3] * dx + A[4] * dy + A[5] * dz, A[6] * dx + A[7] * dy + A[8] * dz]);
            plot((OY - wy) * BW + (OX + wx), c[2] + dz, dot(n, LIGHT), part, mat, wx, wy, 0);
        }
}
const PART = { pelvis: 1, waist: 2, chest: 3, neck: 4, head: 5, face: 6, upperN: 7, elbowN: 8, foreN: 9, handN: 10, upperF: 11, elbowF: 12, foreF: 13, handF: 14, thighN: 15, kneeN: 16, shinN: 17, footN: 18, thighF: 19, kneeF: 20, shinF: 21, footF: 22, weapon: 23, offWeapon: 24 };
const useFrame = (name) => { curFrameIndex = FRAME_IDS.indexOf(name); };
function drawBody(S) {
    const { B, armN, armF, legN, legF, sN, sF, hipN, hipF, turn } = S, F_ = (name) => B[name];
    useFrame("pelvis");
    ellipsoid(add(F_("pelvis").t, mv(F_("pelvis").R, [0, -0.2, 0])), F_("pelvis").R, [2.9, 2.6, 4.2], PART.pelvis, 0);
    useFrame("waist");
    sweep(F_("pelvis").t, F_("chest").t, 3, 3.3, PART.waist, 1);
    useFrame("chest");
    ellipsoid(add(F_("chest").t, mv(F_("chest").R, [0.2, 0.9, 0])), F_("chest").R, [3.4, 4.2, 5.5], PART.chest, 0);
    useFrame("neck");
    sweep(F_("neck").t, add(F_("neck").t, mv(F_("head").R, [0, 1.6, 0])), 1.25, 1.15, PART.neck, 1);
    useFrame("head");
    ellipsoid(F_("head").t, F_("head").R, [3, 3.3, 2.8], PART.head, 0);
    ellipsoid(add(F_("head").t, mv(F_("head").R, [0.85, -0.45, 0])), F_("head").R, [2.4, 2.7, 2.35], PART.face, 0);
    const arm = (far, A, sh, up, el, fo, ha, nameU, nameF) => {
        curDim = far ? 1 : 0;
        useFrame(nameU);
        sphere(sh, 2.5, up, 0);
        sweep(sh, A.joint, 2.1, 1.6, up, 0);
        sphere(A.joint, 1.45, el, 1);
        useFrame(nameF);
        sweep(A.joint, A.end, 1.6, 1.2, fo, 0, 0.15);
        sphere(A.end, 1.9, ha, 0);
        curDim = 0;
    };
    arm(false, armN, sN, PART.upperN, PART.elbowN, PART.foreN, PART.handN, "upperN", "foreN");
    arm(true, armF, sF, PART.upperF, PART.elbowF, PART.foreF, PART.handF, "upperF", "foreF");
    const leg = (far, L, hip, th, kn, sh, fo, nameT, nameS, nameFt) => {
        useFrame(nameT);
        sweep(hip, L.joint, 3.2, 2.2, th, 0);
        sphere(L.joint, 1.9, kn, 1);
        useFrame(nameS);
        sweep(L.joint, L.end, 2.15, 1.4, sh, 0, 0.4);
        useFrame(nameFt);
        const R = F_(nameFt).R, a = F_(nameFt).t;
        sweep(add(a, mv(R, [-1.5, -0.6, 0])), add(a, mv(R, [4.6, -1.1, 0])), 1.7, 1.25, fo, 0);
    };
    leg(false, legN, hipN, PART.thighN, PART.kneeN, PART.shinN, PART.footN, "thighN", "shinN", "footN");
    leg(true, legF, hipF, PART.thighF, PART.kneeF, PART.shinF, PART.footF, "thighF", "shinF", "footF");
    void turn;
}
function along(H, axis, side, part) {
    const n = cross(axis, side);
    const T = (i, k, c, lift = 0) => {
        const x = H[0] + axis[0] * i + side[0] * k + n[0] * lift, y = H[1] + axis[1] * i + side[1] * k + n[1] * lift, z = H[2] + axis[2] * i + side[2] * k + n[2] * lift;
        const wx = Math.round(x), wy = Math.round(y);
        if (clipWeapon && wy < 0)
            return;
        const idx = (OY - wy) * BW + (OX + wx);
        if (idx < 0 || idx >= BW * BH)
            return;
        curFrameIndex = -1;
        plot(idx, z + 0.05, 2, part, 2, wx, wy, c);
    };
    T.at = (i, k) => [H[0] + axis[0] * i + side[0] * k, H[1] + axis[1] * i + side[1] * k, H[2] + axis[2] * i + side[2] * k];
    return T;
}
const STEEL = Object.fromEntries(Object.entries({ hi: "#ffffff", a: "#e8edf6", b: "#a4afc6", d: "#68748f", gold: "#ffd84a", goldD: "#b8862a", grip: "#7a3a2a", gripD: "#4a2018", wood: "#8a5a32", woodD: "#5a3820", dark: "#3a3448", darkD: "#262033", olive: "#58663f", oliveA: "#7d8c58", oliveD: "#3a4529" }).map(([k, v]) => [k, (0, color_js_1.hex)(v) >>> 0]));
function blade(T, from, length, w) {
    for (let i = from; i <= from + length + 0.01; i += 0.4) {
        const r = i - from, wd = r > length - 5 ? Math.max(0, ((length - r) / 5) * w) : w;
        for (let k = -wd; k <= wd + 0.01; k += 0.4)
            T(i, k, k < -w * 0.4 ? STEEL.hi : k > w * 0.4 ? STEEL.d : STEEL.a);
    }
}
const haft = (T, from, to, a, d, r = 0.8) => {
    for (let i = from; i <= to; i += 0.4)
        for (let k = -r; k <= r + 0.01; k += 0.4)
            T(i, k, k > 0.1 ? d : a);
};
exports.WEAPONS = {
    sword: { two: -4.4, draw(T, q) {
            const end = q.two ? -6.5 : -2.6;
            haft(T, end, 2.2, STEEL.grip, STEEL.gripD);
            for (let k = -1.4; k <= 1.4; k += 0.4)
                T(end - 0.4, k, STEEL.gold);
            for (let k = -4.6; k <= 4.6; k += 0.4)
                (T(2.6, k, Math.abs(k) > 3.8 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
            blade(T, 3.2, 25, 2.2);
        } },
    greatsword: { two: -4.8, draw(T) {
            haft(T, -7.2, 2.2, STEEL.grip, STEEL.gripD);
            for (let k = -1.8; k <= 1.8; k += 0.4)
                T(-7.6, k, STEEL.gold);
            for (let k = -6.6; k <= 6.6; k += 0.4)
                (T(2.6, k, Math.abs(k) > 5.6 ? STEEL.goldD : STEEL.gold), T(3, k, STEEL.goldD));
            blade(T, 3.2, 31, 3);
            for (let i = 4; i <= 28; i += 0.4)
                T(i, 0, STEEL.b);
        } },
    dagger: { draw(T) {
            haft(T, -2.4, 1.8, STEEL.grip, STEEL.gripD);
            for (let k = -2.6; k <= 2.6; k += 0.4)
                T(2.2, k, STEEL.goldD);
            blade(T, 2.6, 10, 1.3);
        } },
    spear: { two: -12, draw(T) {
            haft(T, -18, 36, STEEL.wood, STEEL.woodD, 0.5);
            blade(T, 36, 11, 2);
            for (let k = -2.4; k <= 2.4; k += 0.4)
                T(36, k, STEEL.goldD);
        } },
    hammer: { two: -7, draw(T) {
            for (const lift of [-0.8, 0, 0.8])
                for (let i = -10; i <= 18; i += 0.4)
                    for (let k = -0.8; k <= 0.81; k += 0.4)
                        T(i, k, k > 0.1 ? STEEL.woodD : STEEL.wood, lift);
            for (let i = 18; i <= 28; i += 0.4)
                for (let k = -9; k <= 9; k += 0.4) {
                    const face = Math.abs(k) > 7.4 ? (k < 0 ? STEEL.a : STEEL.d) : i < 20 ? STEEL.hi : i > 26.4 ? STEEL.d : Math.abs(k) < 2 ? STEEL.gold : STEEL.b;
                    T(i, k, face, 4.5);
                    T(i, k, face, -4.5);
                    if (i < 18.4 || i > 27.6 || Math.abs(k) > 8.6)
                        for (let l = -4; l <= 4; l += 0.4)
                            T(i, k, k < 0 ? STEEL.a : i > 27.6 ? STEEL.d : STEEL.b, l);
                }
        } },
    scythe: { two: -11, draw(T) {
            haft(T, -16, 31, STEEL.dark, STEEL.darkD, 0.5);
            for (let j = 0; j <= 28; j += 0.4) {
                const u = j / 28, w = 3.2 * (1 - u) + 0.3, b = 31.5 - u * u * 12;
                for (let k = -w; k <= w; k += 0.4)
                    T(b + k, j + 0.8, k > w * 0.3 ? STEEL.hi : k < -w * 0.4 ? STEEL.d : STEEL.b);
            }
        } },
    claw: { draw(T) {
            for (const q0 of [-2.4, 0, 2.4])
                for (let i = 2; i <= 9.5; i += 0.4) {
                    const u = (i - 2) / 7.5, k = q0 + u * u * 1.8;
                    T(i, k, u > 0.55 ? STEEL.hi : STEEL.a);
                    if (u < 0.6)
                        T(i, k + 0.8, STEEL.d);
                }
        } },
    bow: { across: true, draw(T, q, off) {
            for (let u = -1; u <= 1.001; u += 0.025) {
                const k = u * 17, i = 6 * (1 - u * u) - 1;
                T(i, k, Math.abs(u) > 0.85 ? STEEL.goldD : STEEL.wood);
                T(i + 0.8, k, STEEL.woodD);
            }
            const tipA = T.at(-1, -17), tipB = T.at(-1, 17), mid = q.pull ? off : T.at(-1, 0);
            const line = (A, B, c) => {
                const n = Math.max(2, Math.ceil(len(sub(B, A)) / 0.4)), Z = STEEL.a;
                for (let k = 0; k <= n; k++) {
                    const P = add(A, mul(sub(B, A), k / n)), wx = Math.round(P[0]), wy = Math.round(P[1]), idx = (OY - wy) * BW + (OX + wx);
                    curFrameIndex = -1;
                    plot(idx, P[2] + 0.05, 2, PART.weapon, 2, wx, wy, c ?? Z);
                }
            };
            line(tipA, mid);
            line(tipB, mid);
            if (q.nocked) {
                const nock = mid, tip = T.at(13, 0);
                line(nock, tip, STEEL.wood);
                for (let i = 9; i <= 13; i += 0.4)
                    for (let k = -(13 - i) * 0.45; k <= (13 - i) * 0.45; k += 0.4)
                        T(i, k, STEEL.hi);
            }
        } },
    pistol: { across: true, draw(T) {
            for (let i = -1; i <= 9.5; i += 0.4)
                for (let k = -4.2; k <= -2.4; k += 0.4)
                    T(i, k, k < -3.6 ? STEEL.a : k > -2.9 ? STEEL.d : STEEL.b);
            for (let i = -1.2; i <= 1.2; i += 0.4)
                for (let k = -2.4; k <= 2.4; k += 0.4)
                    T(i, k, STEEL.gripD);
            T(9, -4.6, STEEL.hi);
        } },
    launcher: { two: -9, draw(T) {
            for (let i = -14; i <= 22; i += 0.4)
                for (let k = -6; k <= -1; k += 0.4)
                    T(i, k, k < -4.8 ? STEEL.oliveA : k > -2.2 ? STEEL.oliveD : Math.abs(i - 3) < 1.4 ? STEEL.gold : STEEL.olive);
            for (let k = -6.8; k <= -0.2; k += 0.4)
                (T(22.4, k, STEEL.b), T(-14.4, k, STEEL.d));
        } },
    handle: { draw(T) {
            haft(T, -2.6, 6, STEEL.grip, STEEL.gripD);
            for (let k = -1.6; k <= 1.6; k += 0.4)
                (T(-3, k, STEEL.gold), T(6.4, k, STEEL.gold));
        } },
};
function finish(S, restFrames) {
    const dim = (part) => part >= PART.upperF && part <= PART.handF ? 1 : part >= PART.thighF && part <= PART.footF ? 1 : 0;
    const toneOf = (v, part) => {
        let t = v > 0.8 ? 0 : v > 0.42 ? 1 : v > 0.08 ? 2 : 3;
        t = Math.min(3, t + dim(part));
        return t;
    };
    const tones = new Map();
    for (const i of touched)
        tones.set(i, toneOf(Tone[i], Part[i]));
    for (const i of touched) {
        if (Mat[i] === 2)
            continue;
        const t = tones.get(i), votes = [0, 0, 0, 0];
        let same = false;
        for (const d of [-1, 1, -BW, BW]) {
            const j = i + d;
            if (Part[j] !== Part[i] || !tones.has(j))
                continue;
            const u = tones.get(j);
            votes[u]++;
            if (u === t)
                same = true;
        }
        if (!same && votes.some((v) => v > 0))
            tones.set(i, votes.indexOf(Math.max(...votes)));
    }
    for (const i of touched) {
        if (Mat[i] === 2)
            continue;
        Col[i] = (Mat[i] === 1 ? CORE : SHELL)[tones.get(i)];
    }
    const marks = new Map();
    for (const i of touched) {
        for (const d of [1, BW]) {
            const j = i + d;
            if (Part[j] === 0 || Part[j] === Part[i])
                continue;
            const far = Zb[i] < Zb[j] ? i : j, dz = Math.abs(Zb[i] - Zb[j]), steel = Mat[i] === 2 || Mat[j] === 2;
            if (Mat[far] === 2 && dz < 1)
                continue;
            const ink = steel || dz > 2.2;
            if (ink)
                marks.set(far, INK);
            else if (!marks.has(far))
                marks.set(far, SEAM);
        }
    }
    for (const [i, c] of marks)
        Col[i] = c;
    const { B } = S, chestAt = add(B.chest.t, mv(B.chest.R, [3, 1.6, -1.8]));
    if (mv(B.chest.R, [1, 0, 0])[2] > 0.15) {
        const i = (OY - Math.round(chestAt[1])) * BW + (OX + Math.round(chestAt[0]));
        if (Part[i] === PART.chest)
            Col[i] = MARK;
    }
    const list = touched.slice(), ring = new Map();
    for (const i of list)
        for (const d of [-1, 1, -BW, BW]) {
            const j = i + d;
            if (Part[j] === 0 && !ring.has(j))
                ring.set(j, i);
        }
    const n = list.length + ring.size, out = { n, xs: new Int16Array(n), ys: new Int16Array(n), color: new Uint32Array(n), src: new Int16Array(n), ink: new Uint8Array(n), x0: 0, y0: 0, x1: 0, y1: 0 };
    const srcFor = (i) => {
        const f = Fr[i];
        if (f < 0 || !restFrames)
            return -1;
        const name = FRAME_IDS[f], A = B[name], R0 = restFrames[name], wx = (i % BW) - OX, wy = OY - ((i / BW) | 0), P = [wx, wy, Zb[i]];
        const lp = tv(A.R, sub(P, A.t)), rp = add(R0.t, mv(R0.R, lp)), c = Math.round(rp[0]) + 12, r = 38 - Math.round(rp[1]);
        return c < 0 || r < 0 || c >= W0 || r >= H0 ? -1 : r * W0 + c;
    };
    let k = 0, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const push = (i, c, s, isInk) => {
        const x = (i % BW) - OX, y = ((i / BW) | 0) - OY;
        out.xs[k] = x;
        out.ys[k] = y;
        out.color[k] = c;
        out.src[k] = s;
        out.ink[k] = isInk ? 1 : 0;
        if (x < x0)
            x0 = x;
        if (x > x1)
            x1 = x;
        if (y < y0)
            y0 = y;
        if (y > y1)
            y1 = y;
        k++;
    };
    for (const i of list)
        push(i, Col[i], srcFor(i), Col[i] === INK);
    for (const [j, i] of ring)
        push(j, INK, srcFor(i), true);
    let zs = 0;
    for (const i of list)
        zs += Zb[i];
    Object.assign(out, { x0, y0, x1, y1, z: list.length ? zs / list.length : 0 });
    for (const i of list)
        Part[i] = 0;
    touched.length = 0;
    return out;
}
const turnAll = (S, a) => {
    const R = rotY(-a), P = (v) => mv(R, v);
    for (const f of Object.values(S.B)) {
        f.t = P(f.t);
        f.R = mm(R, f.R);
    }
    for (const A of [S.armN, S.armF, S.legN, S.legF]) {
        A.joint = P(A.joint);
        A.end = P(A.end);
    }
    S.sN = P(S.sN);
    S.sF = P(S.sF);
    S.hipN = P(S.hipN);
    S.hipF = P(S.hipF);
    S.axis = P(S.axis);
    S.side = P(S.side);
};
let REST_FRAMES = null;
function render(pose) {
    const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
    if (whole)
        turnAll(S, whole);
    const air = (q.y ?? 0) < -0.5;
    clipBody = !air;
    clipWeapon = !air;
    drawBody(S);
    clipBody = false;
    if (S.W)
        S.W.draw(along(S.armN.end, S.axis, S.side, PART.weapon), q, S.armF.end);
    if (S.OW) {
        const sb = q.sb ?? Math.PI;
        let ax = [Math.cos(sb), -Math.sin(sb), 0], sd = [-Math.sin(sb), -Math.cos(sb), 0];
        if (whole) {
            const R = rotY(-whole);
            ax = mv(R, ax);
            sd = mv(R, sd);
        }
        S.OW.draw(along(S.armF.end, ax, sd, PART.offWeapon), q, S.armF.end);
    }
    clipWeapon = false;
    return finish(S, REST_FRAMES);
}
REST_FRAMES = solve({}).B;
const CACHE = new Map();
const keyOf = (p) => {
    let s = (p.y ?? 0) < -0.5 ? "air," : "";
    for (const k of Object.keys(p).sort()) {
        const v = p[k];
        if (v === undefined || k === "x" || k === "y" || k === "ghost")
            continue;
        s += k + (typeof v === "number" ? (k === "sa" || k === "sb" || k === "wl" || k === "yaw" || k === "turn" ? Math.round(v * 20) : Math.round(v)) : v) + ",";
    }
    return s;
};
function shortfall(pose) {
    const S = solve(pose), q = S.q, near = len(sub(S.armN.end, [q.fx, -q.fy, S.armN.end[2]])), far = q.two ? 0 : len(sub(S.armF.end, [q.bx, -q.by, S.armF.end[2]]));
    return Math.max(near, far);
}
function posed(pose) {
    const key = keyOf(pose);
    let r = CACHE.get(key);
    if (!r) {
        if (CACHE.size > 6000)
            CACHE.clear();
        CACHE.set(key, (r = render(pose)));
    }
    return r;
}
function skeleton(pose) {
    const S = solve(pose), q = S.q, whole = (q.yaw ?? 0) + (q.face === -1 ? Math.PI : 0);
    if (whole)
        turnAll(S, whole);
    const { B, armN, armF, legN, legF, sN, sF, hipN, hipF } = S, at = (f, v) => add(f.t, mv(f.R, v));
    const J = {
        pelvis: B.pelvis.t, waist: B.waist.t, chest: B.chest.t, neck: B.neck.t, head: B.head.t, crown: at(B.head, [0, 3.3, 0]),
        shoulderN: sN, elbowN: armN.joint, handN: armN.end, shoulderF: sF, elbowF: armF.joint, handF: armF.end,
        hipN, kneeN: legN.joint, ankleN: legN.end, toeN: at(B.footN, [4.6, -1.1, 0]), hipF, kneeF: legF.joint, ankleF: legF.end, toeF: at(B.footF, [4.6, -1.1, 0]),
    };
    const joints = Object.fromEntries(Object.entries(J).map(([k, v]) => [k, [v[0], -v[1], v[2]]]));
    const bones = [["pelvis", "waist"], ["waist", "chest"], ["chest", "neck"], ["neck", "head"], ["head", "crown"], ["chest", "shoulderN"], ["shoulderN", "elbowN"], ["elbowN", "handN"], ["chest", "shoulderF"], ["shoulderF", "elbowF"], ["elbowF", "handF"], ["pelvis", "hipN"], ["hipN", "kneeN"], ["kneeN", "ankleN"], ["ankleN", "toeN"], ["pelvis", "hipF"], ["hipF", "kneeF"], ["kneeF", "ankleF"], ["ankleF", "toeF"]];
    return { joints, bones, handles: ["handN", "handF", "ankleN", "ankleF"] };
}
function posedParts(pose) {
    const out = [];
    for (const [name, part] of Object.entries(PART)) {
        onlyPart = part;
        const r = render(pose);
        onlyPart = 0;
        if (!r.n)
            continue;
        let cx = 0, cy = 0;
        for (let i = 0; i < r.n; i++) {
            cx += r.xs[i];
            cy += r.ys[i];
        }
        out.push({ name, part, n: r.n, xs: r.xs, ys: r.ys, color: r.color, cx: cx / r.n, cy: cy / r.n, z: r.z });
    }
    return out;
}

},
"core/poses.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READY = void 0;
exports.READY = { crouch: 3, fx: 11, fy: -21, bx: 9, by: -21, ffx: 7, fbx: -7 };

},
"core/chain.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shiftHits = exports.shiftKeys = void 0;
exports.chain = chain;
const fx_js_1 = require("./fx.js");
function chain(cues) {
    return (o) => {
        const list = cues.map(({ fx, t, until, x, y, flip, ...opts }, i) => ({ fx, t: t ?? 0, until: until ?? Infinity, x: x ?? 0, y: y ?? 0, flip: !!flip, opts: { ...opts, seed: (o.seed ?? 1) + i }, inst: null, over: false }));
        let t = 0;
        const at = (v) => (typeof v === "function" ? v(t) : v);
        const each = (p, layer) => {
            const { frame, tx, ty, fx: sign, cs, sn, fade, lightK } = p;
            for (const c of list) {
                if (!c.inst || c.over)
                    continue;
                c.inst.options.x = tx + sign * at(c.x);
                c.inst.options.y = ty + at(c.y);
                c.inst.options.flip = sign < 0 !== c.flip;
                c.inst.draw(frame, layer);
            }
            Object.assign(p, { tx, ty, fx: sign, cs, sn, fade, lightK });
        };
        return {
            update(dt) {
                t += dt;
                for (const c of list) {
                    if (c.over || t < c.t)
                        continue;
                    if (!c.inst)
                        c.inst = (0, fx_js_1.createFx)(c.fx, c.opts);
                    else
                        c.inst.update(dt);
                    if (t >= c.until || (c.inst.done() && !c.fx.meta?.loop))
                        c.over = true;
                }
            },
            drawBack: (p) => each(p, "back"),
            draw: (p) => each(p, "front"),
        };
    };
}
const shiftKeys = (keys, dt, { dx = 0, ...over } = {}) => keys.map(([t, pose, how]) => [t + dt, { ...pose, ...over, x: (pose.x ?? 0) + dx }, how]);
exports.shiftKeys = shiftKeys;
const shiftHits = (hits, dt) => hits.map((h) => ({ ...h, t: h.t + dt }));
exports.shiftHits = shiftHits;

},
"custom/pk-effects.js":function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.impactMote = exports.sealGather = exports.qiStop = exports.hoverQi = exports.qiIgnite = exports.groundBurst = exports.footsteps = void 0;
const rgb = s => { if (typeof s === 'number')
    return s; const n = parseInt(s.slice(1), 16); return (0xff000000 | ((n & 255) << 16) | (n & 0xff00) | ((n >> 16) & 255)) >>> 0; };
const h = (n, s) => { const a = Math.sin(n * 12.9898 + s * 78.233) * 43758.5453; return a - Math.floor(a); };
const tone = (o, i) => rgb((o.palette || ['#76503b', '#9e7954', '#d9b383'])[i % 3]);
exports.footsteps = { meta: { duration: .36, loop: false, options: { palette: ['#76503b', '#9e7954', '#d9b383'], power: 1, seed: 1, side: 1, count: 9 } }, draw(p, t, o) {
        const u = Math.min(1, t / .36), k = 1 - u, N = o.count;
        for (let i = 0; i < N; i++) {
            let q = h(i, o.seed), r = h(i + 19, o.seed), sx = ((q - .5) * 24 + o.side * (2 + 8 * u)) * o.power, sy = -1 - u * (7 + 14 * r) * o.power, rad = (1.1 + 2.4 * r) * (0.5 + u * .9);
            p.disc(sx, sy, rad, tone(o, i), Math.max(0, .34 * k * (.45 + r)));
        }
        for (let i = 0; i < 4; i++) {
            const v = h(i + 41, o.seed), x = (v - .5) * 26 + o.side * u * 8, y = -(3 + u * 17 * (.4 + v)) + 24 * u * u;
            p.dot(x, y, tone(o, i + 1), k * .75);
        }
    } };
exports.groundBurst = { meta: { duration: .65, loop: false, options: { palette: ['#76503b', '#9e7954', '#d9b383'], power: 1, seed: 1, side: 1, count: 17 } }, draw(p, t, o) {
        const u = Math.min(1, t / .65), k = (1 - u) ** 1.6, P = Math.min(2.1, Math.max(.35, o.power)), n = Math.min(40, o.count);
        for (let i = 0; i < n; i++) {
            const q = h(i, o.seed), r = h(i + 22, o.seed);
            const sign = i % 2 ? 1 : -1;
            const sx = sign * (4 + u * (16 + 51 * r) * P), sy = -2 - u * (10 + 27 * q) * P + u * u * 15 * P, sz = (1.7 + 4 * r) * P * (.6 + u * .5);
            p.disc(sx, sy, sz, tone(o, i), Math.max(0, k * (.22 + .24 * r)));
        }
        for (let i = 0; i < Math.min(16, Math.ceil(7 * P)); i++) {
            const q = h(i + 10, o.seed), r = h(i + 57, o.seed), sg = i % 2 ? 1 : -1;
            const x = sg * (4 + (24 + 55 * q) * u * P), y = -2 - 65 * r * u * P + 85 * u * u * P;
            p.rect(x, y, 1.2 + P * .5, 1.1 + P * .4, tone(o, i + 1), Math.max(0, 1 - u * .75));
        }
        if (t < .13) {
            p.arc(0, -1, 3 + 36 * (t / .13) * P, 1, Math.PI, 2 * Math.PI, tone(o, 2), .28 * (1 - t / .13));
        }
    } };
exports.qiIgnite = { meta: { duration: .48, loop: false, options: { seed: 1, side: 1 } }, draw(p, t, o) {
        const u = Math.min(1, t / .48), k = 1 - u;
        p.arc(0, -1, 6 + 25 * u, 1.2, Math.PI * .02, Math.PI * .98, rgb('#8fefff'), k * .75);
        p.glow(0, -5, 16 + 13 * u, rgb('#5ad6ed'), .27 * k);
        for (let i = 0; i < 18; i++) {
            const a = i * 2.399 + o.seed, r = (5 + 25 * u) * (.3 + h(i, o.seed));
            p.dot(Math.cos(a) * r, -2 - 15 * u - Math.abs(Math.sin(a)) * r, rgb(i % 3 ? '#69cfe3' : '#e3ffff'), k * .8);
        }
    } };
exports.hoverQi = { meta: { duration: 1.6, loop: true, options: { seed: 1, side: 1 } }, drawBack(p, t, o) {
        const ph = t / 1.6 * Math.PI * 2;
        p.glow(0, -12, 24, rgb('#40bddf'), .20);
        p.ring(0, -5, 10 + Math.sin(ph) * 1.5, 1, rgb('#6cdaf4'), .35);
        for (let i = 0; i < 7; i++) {
            const a = ph * (i % 2 ? 1 : -1) + i * 2.4;
            const r = 11 + (i % 3) * 5;
            p.dot(Math.cos(a) * r, -13 + Math.sin(a) * 4 - 7 * (i % 3), rgb('#64cbef'), .24);
        }
    }, draw(p, t, o) {
        const ph = t / 1.6 * Math.PI * 2;
        for (let i = 0; i < 12; i++) {
            const q = (i / 12 + ph / (Math.PI * 2) * .7) % 1;
            const dx = Math.sin(i * 2.65 + ph * .6) * (7 + 10 * q), dy = -3 - 33 * q;
            p.dot(dx, dy, rgb(i % 3 ? '#5bbff5' : '#f0ffff'), (1 - q) * .85);
            if (i % 3 === 0)
                p.glow(dx, dy, 2.5, rgb('#50d5ea'), (1 - q) * .13);
        }
    } };
exports.qiStop = { meta: { duration: .30, loop: false, options: { seed: 1 } }, draw(p, t, o) { const u = Math.min(1, t / .3); p.arc(0, -8, 17 * (1 - u) + 3, 1.3, 0, Math.PI * 2, rgb('#5ad9f4'), (1 - u) * .7); for (let i = 0; i < 12; i++) {
        const a = i * 2.399, r = (4 + 23 * u) * h(i, o.seed);
        p.dot(Math.cos(a) * r, -8 + Math.sin(a) * r * .7, rgb('#94eafa'), 1 - u);
    } } };
exports.sealGather = { meta: { duration: .62, loop: false, options: { seed: 1 } }, draw(p, t, o) {
        const u = Math.min(1, t / .62), power = Math.sin(Math.PI * Math.min(1, u)) ** .65;
        for (let i = 0; i < 19; i++) {
            const angle = i * 2.399 + o.seed * 1.11, r = (23 * (1 - u) + 3) * (0.4 + h(i, o.seed));
            p.dot(Math.cos(angle) * r, Math.sin(angle) * r * .75, rgb(i % 4 ? '#92dff9' : '#f0fdff'), power * .95);
        }
        p.glow(0, 0, 9 + 16 * power, rgb('#5db9e8'), power * .38);
        if (u > .20 && u < .87) {
            p.arc(0, 0, 9 + 3 * Math.sin(u * 9), 1, 0, 2 * Math.PI, rgb('#7bdcff'), power * .75);
            p.dot(0, 0, rgb('#eaffff'), power);
        }
    } };
exports.impactMote = { meta: { duration: .28, loop: false, options: { seed: 1, side: 1 } }, draw(p, t, o) {
        const u = Math.min(1, t / .28), k = 1 - u;
        if (t < .11) {
            p.glow(0, 0, 18, rgb('#ffe5d1'), .45 * k);
            p.ring(0, 0, 2 + 10 * u, 1, rgb('#fff2db'), k * .9);
        }
        for (let i = 0; i < 11; i++) {
            const a = (i / 11) * Math.PI * 2 + o.seed * .4, dist = (5 + 27 * u) * (0.6 + h(i, o.seed));
            p.dot(Math.cos(a) * dist, Math.sin(a) * dist, rgb(i % 3 ? '#ffbca7' : '#ffffff'), k);
        }
    } };

}};
const cache={};
function load(key){if(cache[key])return cache[key].exports;const fn=modules[key];if(!fn)throw Error('Missing PixelFX module: '+key);const m={exports:{}};cache[key]=m;
 const rel=(src)=>{if(!src.startsWith('.'))throw Error('Non-local PixelFX require: '+src);const arr=key.split('/').slice(0,-1);for(const p of src.split('/')){if(p==='..')arr.pop();else if(p!=='.')arr.push(p);}let k=arr.join('/');if(!k.endsWith('.js'))k+='.js';return load(k);};fn(rel,m,m.exports);return m.exports;}
 const core=load('core/fx.js');const hitSpark=load('fx/impacts/hit-spark.js');const custom=load('custom/pk-effects.js');
 root.PK_PIXELFX={...core,hitSpark,...custom,version:'0.3.0'};
})(typeof window!=='undefined'?window:globalThis);
