// ============================================================================
// MODULE: MAP & TERRAIN (Bản đồ, Địa hình, Hang động, Đào đất & Nền Parallax)
// ============================================================================

import {
  clamp,
  hash,
  CELL,
  CHUNK,
  WORLD_W,
  WORLD_H,
  settings,
  game,
  player,
  camera,
  showNotice,
} from './state.js';

// Độ cao bề mặt mặt đất theo tọa độ X thế giới
export function surfaceAt(x) {
  return 355 + Math.sin(x / 168) * 14 + Math.sin(x / 61) * 8 + Math.sin(x / 35) * 2;
}

// Xác định loại vật liệu địa chất (1: Đất mặt, 2: Trầm tích, 3: Đá, 4: Đá sâu)
export function geoMaterial(x, y) {
  const terrain = game.terrain;
  if (!terrain) return 1;
  const c = Math.floor(x / CELL);
  for (let dy = 0; dy < 5 * CELL; dy += CELL) {
    const t = terrain.get(c, Math.floor((y + dy) / CELL));
    if (t) return t;
  }
  return Math.max(1, Math.min(4, 1 + Math.floor((y - surfaceAt(x)) / 225)));
}

export class Terrain {
  constructor() {
    this.cols = Math.ceil(WORLD_W / CELL);
    this.rows = Math.ceil(WORLD_H / CELL);
    this.data = new Uint8Array(this.cols * this.rows);
    this.cache = new Map();
    this.broken = 0;
    this.excavations = [];
    this.overviewScale = 5; // 1 pixel overview = 5px thế giới (960 x 480 cho toàn bản đồ 4800 x 2400)
    this.overviewW = Math.ceil(WORLD_W / this.overviewScale);
    this.overviewH = Math.ceil(WORLD_H / this.overviewScale);
    this.overviewCanvas = document.createElement('canvas');
    this.overviewCanvas.width = this.overviewW;
    this.overviewCanvas.height = this.overviewH;
    this.overviewCtx = this.overviewCanvas.getContext('2d');
    this.overviewImg = this.overviewCtx.createImageData(this.overviewW, this.overviewH);
    this.overviewU32 = new Uint32Array(this.overviewImg.data.buffer);
    this.generate();
    this.baseData = this.data.slice();
    this.updateOverviewRegion(0, this.cols - 1, 0, this.rows - 1);
  }

  index(c, r) {
    return r * this.cols + c;
  }

  get(c, r) {
    if (c < 0 || c >= this.cols || r >= this.rows) return 4;
    if (r < 0) return 0;
    return this.data[this.index(c, r)];
  }

  getBase(c, r) {
    if (c < 0 || c >= this.cols || r >= this.rows) return 4;
    if (r < 0) return 0;
    return this.baseData[this.index(c, r)];
  }

  solid(x, y) {
    return this.get(Math.floor(x / CELL), Math.floor(y / CELL)) !== 0;
  }

  generate() {
    const cave = [
      [780, 900, 145, 84],
      [980, 1010, 145, 92],
      [1460, 670, 160, 88],
      [1640, 760, 135, 82],
      [2190, 1050, 220, 95],
      [2820, 720, 180, 90],
      [3400, 1130, 245, 105],
      [3970, 770, 188, 102],
      [1040, 1570, 200, 116],
      [2500, 1680, 220, 112],
      [3890, 1720, 240, 118],
    ];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        const d = y - surfaceAt(x);
        let t = 0;
        if (d >= 0) {
          t = d < 45 ? 1 : d < 190 ? 2 : d < 700 ? 3 : 4;
          for (const [cx, cy, rx, ry] of cave) {
            const dx = (x - cx) / rx;
            const dy = (y - cy) / ry;
            if (dx * dx + dy * dy < 1) {
              t = 0;
              break;
            }
          }
          // Khe nứt tự nhiên dưới lòng đất
          if (d > 290 && d < 1650) {
            const valley = Math.abs(
              Math.sin(x / 91 + y / 59) * 0.78 + Math.sin(x / 147 - y / 74) * 0.38
            );
            if (valley < 0.032 && hash(c >> 2, r >> 2) > 0.48) t = 0;
          }
        }
        this.data[this.index(c, r)] = t;
      }
    }
  }

  firstSolidY(x) {
    for (let y = 275; y < WORLD_H; y += CELL / 2) {
      if (this.solid(x, y)) return Math.floor(y / CELL) * CELL;
    }
    return WORLD_H - 20;
  }

  chunkKey(cx, cy) {
    return cx + ',' + cy;
  }

  invalidate(c, r) {
    const cx = Math.floor(c / CHUNK);
    const cy = Math.floor(r / CHUNK);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        this.cache.delete(this.chunkKey(cx + dx, cy + dy));
      }
    }
  }

  cut(wx, wy, radius) {
    let removed = 0;
    const minX = clamp(Math.floor((wx - radius - 7) / CELL), 0, this.cols - 1);
    const maxX = clamp(Math.floor((wx + radius + 7) / CELL), 0, this.cols - 1);
    const minY = clamp(Math.floor((wy - radius - 7) / CELL), 0, this.rows - 1);
    const maxY = clamp(Math.floor((wy + radius + 7) / CELL), 0, this.rows - 1);
    const invalidated = new Set();

    for (let r = minY; r <= maxY; r++) {
      for (let c = minX; c <= maxX; c++) {
        const t = this.get(c, r);
        if (!t) continue;
        const dx = c * CELL + 5 - wx;
        const dy = r * CELL + 5 - wy;
        const dist = Math.hypot(dx, dy);
        const jag = (hash(c, r) - 0.5) * CELL * 1.7;
        if (dist <= radius + jag) {
          this.data[this.index(c, r)] = 0;
          removed++;
          const cx = Math.floor(c / CHUNK);
          const cy = Math.floor(r / CHUNK);
          for (let uy = -1; uy <= 1; uy++) {
            for (let ux = -1; ux <= 1; ux++) {
              invalidated.add(this.chunkKey(cx + ux, cy + uy));
            }
          }
        }
      }
    }

    for (const k of invalidated) this.cache.delete(k);
    if (removed > 0) {
      this.excavations.push({ x: wx, y: wy, radius });
      this.updateOverviewRegion(minX - 1, maxX + 1, minY - 1, maxY + 1);
    }
    this.broken += removed;
    return removed;
  }

  // Cập nhật tầng Bản Đồ Toàn Cảnh (Macro LOD 1:5) siêu nhẹ (~2ms toàn bản đồ, ~0.05ms khi đào đất)
  updateOverviewRegion(minC, maxC, minR, maxR) {
    const sc = this.overviewScale;
    const ow = this.overviewW;
    const oh = this.overviewH;
    const u32 = this.overviewU32;
    const x0 = clamp(Math.floor((minC * CELL) / sc), 0, ow - 1);
    const x1 = clamp(Math.ceil(((maxC + 1) * CELL) / sc) - 1, 0, ow - 1);
    const y0 = clamp(Math.floor((minR * CELL) / sc), 0, oh - 1);
    const y1 = clamp(Math.ceil(((maxR + 1) * CELL) / sc) - 1, 0, oh - 1);

    // Precompute surfaceY cho từng cột ox
    const surfByOx = new Float32Array(x1 - x0 + 1);
    for (let ox = x0; ox <= x1; ox++) {
      surfByOx[ox - x0] = surfaceAt(ox * sc + sc * 0.5);
    }

    for (let oy = y0; oy <= y1; oy++) {
      const wy = oy * sc + sc * 0.5;
      const r = Math.floor(wy / CELL);
      const rowOffset = oy * ow;
      for (let ox = x0; ox <= x1; ox++) {
        const wx = ox * sc + sc * 0.5;
        const c = Math.floor(wx / CELL);
        const t = this.get(c, r);
        if (!t) {
          u32[rowOffset + ox] = 0;
          continue;
        }
        const sy = surfByOx[ox - x0];
        const depth = wy - sy;
        if (depth < -2) {
          u32[rowOffset + ox] = 0;
          continue;
        }

        // Kiểm tra mép lộ thiên (bề mặt hoặc trần/đáy hang)
        const openTop = this.get(c, r - 1) === 0;
        const openBot = this.get(c, r + 1) === 0;
        const openLeft = this.get(c - 1, r) === 0;
        const openRight = this.get(c + 1, r) === 0;
        const grain = (((ox * 374761393 + oy * 668265263) >>> 24) & 15) - 7;

        let rr;
        let gg;
        let bb;

        if (depth < 7 && openTop) {
          // Lớp cỏ & rêu bề mặt
          rr = 84 + grain;
          gg = 118 + grain;
          bb = 62 + (grain >> 1);
        } else if (depth < 46) {
          // Tầng đất mặt
          rr = 104 + grain;
          gg = 73 + grain;
          bb = 50 + (grain >> 1);
        } else if (depth < 195) {
          // Tầng đất sét / trầm tích
          const band = Math.sin(wx * 0.018 + wy * 0.045) * 8;
          rr = 114 + grain + band;
          gg = 83 + grain + band * 0.8;
          bb = 56 + (grain >> 1) + band * 0.5;
        } else if (depth < 700) {
          // Tầng đá
          const band = Math.sin(wx * 0.012 - wy * 0.032) * 7;
          rr = 76 + grain + band;
          gg = 84 + grain + band;
          bb = 91 + grain + band;
        } else {
          // Tầng đá sâu
          const band = Math.sin(wx * 0.01 + wy * 0.025) * 6;
          rr = 46 + grain + band;
          gg = 58 + grain + band;
          bb = 68 + grain + band;
        }

        // Làm tối nhẹ viền hang động để nổi khối tự nhiên khi nhìn xa 4x
        if (openTop && depth >= 7) {
          rr *= 1.12;
          gg *= 1.12;
          bb *= 1.12;
        } else if (openBot || openLeft || openRight) {
          rr *= 0.78;
          gg *= 0.78;
          bb *= 0.78;
        }

        const R = clamp(rr | 0, 0, 255);
        const G = clamp(gg | 0, 0, 255);
        const B = clamp(bb | 0, 0, 255);
        u32[rowOffset + ox] = (255 << 24) | (B << 16) | (G << 8) | R;
      }
    }

    this.overviewCtx.putImageData(
      this.overviewImg,
      0,
      0,
      x0,
      y0,
      x1 - x0 + 1,
      y1 - y0 + 1
    );
  }

  renderChunk(cx, cy) {
    const key = this.chunkKey(cx, cy);
    if (this.cache.has(key)) return this.cache.get(key);

    const startC = cx * CHUNK;
    const startR = cy * CHUNK;
    const nc = Math.min(CHUNK, this.cols - startC);
    const nr = Math.min(CHUNK, this.rows - startR);
    if (nc <= 0 || nr <= 0) return null;

    const W = nc * CELL;
    const H = nr * CELL;
    const baseX = startC * CELL;
    const baseY = startR * CELL;

    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const pen = off.getContext('2d');
    pen.imageSmoothingEnabled = false;
    const bitmap = pen.createImageData(W, H);
    const pixels = bitmap.data;

    const gridW = nc + 4;
    const gridH = nr + 4;
    const occupancy = new Uint8Array(gridW * gridH);
    const localCuts = this.excavations.filter(
      (d) =>
        d.x + d.radius + 14 >= baseX &&
        d.x - d.radius - 14 <= baseX + W &&
        d.y + d.radius + 14 >= baseY &&
        d.y - d.radius - 14 <= baseY + H
    );

    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        occupancy[gy * gridW + gx] = this.getBase(startC + gx - 2, startR + gy - 2) ? 1 : 0;
      }
    }

    const mix = (a, b, t) => a + (b - a) * t;
    const sat = (t) => Math.max(0, Math.min(1, t));
    const ease = (t) => {
      t = sat(t);
      return t * t * (3 - 2 * t);
    };
    const noise = (x, y, step) => {
      const ax = Math.floor(x / step);
      const ay = Math.floor(y / step);
      const u = ease(x / step - ax);
      const v = ease(y / step - ay);
      return mix(
        mix(hash(ax, ay), hash(ax + 1, ay), u),
        mix(hash(ax, ay + 1), hash(ax + 1, ay + 1), u),
        v
      );
    };

    const pal = [
      [100, 77, 56],
      [143, 106, 73],
      [95, 103, 107],
      [60, 73, 83],
    ];
    const geology = (d) => {
      if (d < 33) return [0, 0, 0];
      if (d < 53) return [0, 1, ease((d - 33) / 20)];
      if (d < 170) return [1, 1, 0];
      if (d < 214) return [1, 2, ease((d - 170) / 44)];
      if (d < 688) return [2, 2, 0];
      if (d < 730) return [2, 3, ease((d - 688) / 42)];
      return [3, 3, 0];
    };

    const xinfo = new Array(W);
    const yinfo = new Array(H);
    const surfaces = new Float32Array(W);
    const bed = new Float32Array(W);

    for (let x = 0; x < W; x++) {
      const wx = baseX + x + 0.5;
      const u = wx / CELL - 0.5;
      const c0 = Math.floor(u);
      xinfo[x] = [c0 - startC + 2, ease(u - c0), wx];
      surfaces[x] = surfaceAt(wx);
      bed[x] = Math.sin(wx / 48) * 3.5 + Math.sin(wx / 17) * 1.2;
    }
    for (let y = 0; y < H; y++) {
      const wy = baseY + y + 0.5;
      const u = wy / CELL - 0.5;
      const r0 = Math.floor(u);
      yinfo[y] = [r0 - startR + 2, ease(u - r0), wy];
    }

    for (let py = 0; py < H; py++) {
      const [gy, fy, wy] = yinfo[py];
      const row0 = gy * gridW;
      const row1 = (gy + 1) * gridW;
      let j = py * W * 4;
      for (let px = 0; px < W; px++, j += 4) {
        const [gx, fx, wx] = xinfo[px];
        const a = mix(occupancy[row0 + gx], occupancy[row0 + gx + 1], fx);
        const b = mix(occupancy[row1 + gx], occupancy[row1 + gx + 1], fx);
        let fill = mix(a, b, fy);
        const depth = wy - surfaces[px];
        if (depth < 13) fill = sat((depth + 0.65) / 1.3);
        if (fill < 0.35) continue;

        let cut = 1;
        let rimDist = 1000;
        for (let k = 0; k < localCuts.length; k++) {
          const dig = localCuts[k];
          const dx = wx - dig.x;
          const dy = wy - dig.y;
          if (Math.abs(dx) > dig.radius + 14 || Math.abs(dy) > dig.radius + 14) continue;
          const dist = Math.hypot(dx, dy);
          if (dist > dig.radius + 14) continue;
          let distEdge = dist - dig.radius;
          if (Math.abs(distEdge) < 9) {
            distEdge += (noise(wx, wy, 27) - 0.5) * 4.8 + (noise(wx, wy, 10) - 0.5) * 1.5;
          }
          const cutHere = sat((distEdge + 0.55) / 1.1);
          if (cutHere < cut) cut = cutHere;
          if (distEdge >= 0 && distEdge < rimDist) rimDist = distEdge;
          if (cut <= 0.001) break;
        }
        if (cut < 0.01) continue;

        const alpha = sat((fill - 0.36) * 5.8) * cut;
        if (alpha < 0.02) continue;

        const [m0, m1, t] = geology(depth + bed[px] * 0.25);
        const p0 = pal[m0];
        const p1 = pal[m1];
        const coarse = noise(wx, wy, 38) - 0.5;
        const small = noise(wx, wy, 7) - 0.5;
        const grain = hash(Math.floor(wx / 2), Math.floor(wy / 2));
        const fine = hash(Math.floor(wx), Math.floor(wy));

        let light = coarse * 16 + small * 15 + (grain - 0.5) * 17;
        if (fine > 0.955) light += 25;
        else if (fine < 0.085) light -= 19;

        const wave = (depth + bed[px]) / (m0 === 2 ? 32 : m0 === 3 ? 39 : 23);
        const band = Math.abs(wave - Math.round(wave));
        if (band < 0.050) light += (m0 === 1 ? 11 : -12) * (1 - band / 0.050);
        if (m0 === 1 && fine > 0.82 && grain < 0.34) light += 12;
        if (m0 >= 2) {
          const vein = Math.sin(wx * 0.115 + wy * 0.047 + coarse * 3.2);
          if (vein > 0.985 && small > 0.18) light += 17;
          if (vein < -0.987 && grain < 0.30) light -= 15;
        }

        const edgeFromGrid = sat((0.90 - fill) * 2.5);
        light -= edgeFromGrid * 10;
        if (rimDist < 12) light -= Math.max(0, 1 - rimDist / 12) * 26;
        if (rimDist < 2.3) light += 7;

        let rr = mix(p0[0], p1[0], t) + light;
        let gg = mix(p0[1], p1[1], t) + light * 0.87;
        let bb = mix(p0[2], p1[2], t) + light * 0.72;
        if (depth >= -0.8 && depth < 2.8) {
          const grass = (1 - depth / 3.4) * 0.45;
          rr = mix(rr, 97, grass);
          gg = mix(gg, 135, grass);
          bb = mix(bb, 68, grass);
        }

        pixels[j] = Math.round(sat(rr / 255) * 255);
        pixels[j + 1] = Math.round(sat(gg / 255) * 255);
        pixels[j + 2] = Math.round(sat(bb / 255) * 255);
        pixels[j + 3] = alpha > 0.96 ? 255 : Math.round(alpha * 255);
      }
    }

    pen.putImageData(bitmap, 0, 0);

    // Họa tiết vẽ nét: sỏi, mạch trầm tích, vân nứt đá, rễ cỏ
    pen.save();
    pen.globalCompositeOperation = 'source-atop';
    pen.lineCap = 'round';
    pen.lineJoin = 'round';

    for (const d of [
      41, 68, 102, 145, 185, 235, 302, 377, 460, 558, 666, 795, 930, 1100, 1330, 1590, 1860, 2150,
    ]) {
      const worldY = surfaceAt(baseX + W / 2) + d;
      if (worldY < baseY - 40 || worldY > baseY + H + 40) continue;
      const rocky = d >= 210;
      pen.beginPath();
      for (let x = 0; x <= W + 4; x += 4) {
        const wx = baseX + x;
        const yy =
          surfaceAt(wx) +
          d +
          Math.sin(wx / 52 + d * 0.085) * 2.7 +
          Math.sin(wx / 19 + d * 0.13) * 0.9 -
          baseY;
        if (x === 0) pen.moveTo(x, yy);
        else pen.lineTo(x, yy);
      }
      pen.strokeStyle = rocky ? 'rgba(21,30,39,.29)' : 'rgba(75,48,30,.22)';
      pen.lineWidth = rocky ? 1.1 : 1;
      pen.stroke();
      pen.translate(0, 2);
      pen.strokeStyle = rocky ? 'rgba(173,188,198,.15)' : 'rgba(223,182,125,.17)';
      pen.lineWidth = 0.8;
      pen.stroke();
      pen.translate(0, -2);
    }

    const grid = 34;
    for (let sy = Math.floor((baseY - 26) / grid); sy <= Math.ceil((baseY + H + 26) / grid); sy++) {
      for (
        let sx = Math.floor((baseX - 26) / grid);
        sx <= Math.ceil((baseX + W + 26) / grid);
        sx++
      ) {
        const q = hash(sx * 3, sy * 7);
        const wx = sx * grid + 5 + hash(sx + 12, sy) * 18;
        const wy = sy * grid + 4 + hash(sx, sy + 31) * 19;
        const x = wx - baseX;
        const y = wy - baseY;
        const depth = wy - surfaceAt(wx);
        if (depth < 8 || q < (depth < 190 ? 0.38 : 0.59)) continue;
        pen.save();
        pen.translate(Math.round(x), Math.round(y));
        if (depth < 190) {
          const rad = 1 + Math.floor(hash(sx + 9, sy + 1) * 4);
          pen.fillStyle = q > 0.75 ? 'rgba(212,178,128,.64)' : 'rgba(61,42,29,.34)';
          pen.beginPath();
          pen.moveTo(-rad, -1);
          pen.lineTo(0, -rad * 0.55);
          pen.lineTo(rad + 1, 0);
          pen.lineTo(rad * 0.5, rad * 0.65);
          pen.lineTo(-rad * 0.75, rad * 0.55);
          pen.closePath();
          pen.fill();
          if (rad >= 3) {
            pen.fillStyle = 'rgba(245,215,167,.43)';
            pen.fillRect(-rad + 1, -1, rad, 1);
          }
          if (q > 0.62) {
            pen.strokeStyle = 'rgba(65,44,30,.30)';
            pen.lineWidth = 1;
            pen.beginPath();
            pen.moveTo(-9, 6);
            pen.lineTo(-4, 5);
            pen.lineTo(0, 7);
            pen.lineTo(5, 6);
            pen.stroke();
          }
        } else {
          const ang = (hash(sx * 17, sy * 11) - 0.5) * 1.2;
          pen.rotate(ang);
          pen.fillStyle = q > 0.63 ? 'rgba(154,167,175,.23)' : 'rgba(15,22,30,.29)';
          pen.beginPath();
          pen.moveTo(-7, -3);
          pen.lineTo(-2, -5);
          pen.lineTo(7, -2);
          pen.lineTo(8, 2);
          pen.lineTo(3, 4);
          pen.lineTo(-7, 2);
          pen.closePath();
          pen.fill();
          pen.strokeStyle = 'rgba(20,27,34,.40)';
          pen.lineWidth = 1;
          pen.beginPath();
          pen.moveTo(-8, 3);
          pen.lineTo(-3, 1);
          pen.lineTo(3, 3);
          pen.lineTo(9, 1);
          pen.stroke();
          if (q > 0.66) {
            pen.strokeStyle = 'rgba(180,195,204,.38)';
            pen.beginPath();
            pen.moveTo(-6, -3);
            pen.lineTo(0, -4);
            pen.lineTo(6, -2);
            pen.stroke();
          }
        }
        pen.restore();
      }
    }

    // Rễ cây nhỏ trên đất mặt
    for (let gx = Math.floor((baseX - 12) / 22); gx <= Math.ceil((baseX + W + 12) / 22); gx++) {
      const wx = gx * 22 + Math.round(hash(gx, 7) * 13);
      const wy = surfaceAt(wx) + 2;
      if (wy < baseY - 16 || wy > baseY + H + 16 || hash(gx, 3) < 0.27) continue;
      const rx = wx - baseX;
      const ry = wy - baseY;
      const len = 5 + Math.floor(hash(gx, 17) * 13);
      pen.strokeStyle = 'rgba(56,43,30,.57)';
      pen.lineWidth = 1;
      pen.beginPath();
      pen.moveTo(rx, ry);
      pen.lineTo(rx - 2, ry + len * 0.42);
      pen.lineTo(rx - 1 + hash(gx, 10) * 4, ry + len);
      pen.stroke();
    }
    pen.restore();

    // Cỏ/nhánh mảnh trên bề mặt (không mọc trong vùng đã phá)
    pen.save();
    pen.globalCompositeOperation = 'source-over';
    pen.lineWidth = 1;
    pen.lineCap = 'round';
    for (let gx = Math.floor((baseX - 8) / 8); gx <= Math.ceil((baseX + W + 8) / 8); gx++) {
      const wx = gx * 8 + Math.floor(hash(gx, 9) * 4);
      const wy = surfaceAt(wx);
      if (wy < baseY - 7 || wy > baseY + H + 7) continue;
      if (hash(gx, 19) < 0.48) continue;
      if (localCuts.some((d) => Math.hypot(wx - d.x, wy - d.y) < d.radius + 4)) continue;
      const localX = wx - baseX;
      const localY = wy - baseY;
      const len = 1 + Math.floor(hash(gx, 11) * 4);
      pen.strokeStyle =
        hash(gx, 32) > 0.5 ? 'rgba(117,151,81,.92)' : 'rgba(78,116,59,.88)';
      pen.beginPath();
      pen.moveTo(localX, localY + 1);
      pen.lineTo(localX + (hash(gx, 16) > 0.5 ? 1 : -1), localY - len);
      pen.stroke();
    }
    pen.restore();

    this.cache.set(key, off);
    return off;
  }

  draw(ctx, left, top, w, h) {
    const z = settings.zoom || 0.7;

    // 1. Luôn vẽ tấm Bản Đồ Toàn Cảnh (Macro LOD) trong 1 lệnh drawImage duy nhất:
    //    - Khi bật Thần Thức 4x (zoom < 0.52): thay thế hoàn toàn việc tạo/ghép ~90 chunk nhỏ -> 0ms lag!
    //    - Khi ở góc nhìn thường (zoom >= 0.52): làm lớp lót tức thì cho các chunk chưa kịp tạo.
    ctx.drawImage(this.overviewCanvas, 0, 0, WORLD_W, WORLD_H);

    const maxCol = Math.ceil(this.cols / CHUNK) - 1;
    const maxRow = Math.ceil(this.rows / CHUNK) - 1;

    if (z >= 0.50) {
      // Chế độ Bình thường (1x): Vẽ đầy đủ các chunk chi tiết trong khung nhìn, tối đa tạo mới 2 chunk/frame
      const leftCol = clamp(Math.floor(left / (CELL * CHUNK)), 0, maxCol);
      const rightCol = clamp(Math.floor((left + w) / (CELL * CHUNK)), 0, maxCol);
      const startRow = clamp(Math.floor(top / (CELL * CHUNK)), 0, maxRow);
      const endRow = clamp(Math.floor((top + h) / (CELL * CHUNK)), 0, maxRow);

      let buildBudget = 2;
      for (let cy = startRow; cy <= endRow; cy++) {
        for (let cx = leftCol; cx <= rightCol; cx++) {
          const key = this.chunkKey(cx, cy);
          let img = this.cache.get(key);
          if (img === undefined) {
            if (buildBudget > 0) {
              buildBudget--;
              img = this.renderChunk(cx, cy);
            } else {
              continue;
            }
          }
          if (img) ctx.drawImage(img, cx * CHUNK * CELL, cy * CHUNK * CELL);
        }
      }
    } else {
      // Chế độ Thần Thức 4x: Không tạo thêm bất kỳ chunk 320x320 mới nào để tránh khựng máy,
      // chỉ vẽ đè vài chunk đã có sẵn trong bộ nhớ đệm ngay sát chân Diệp Tu.
      const heroCx = clamp(Math.floor(player.x / (CELL * CHUNK)), 0, maxCol);
      const heroCy = clamp(Math.floor(player.y / (CELL * CHUNK)), 0, maxRow);
      for (let cy = Math.max(0, heroCy - 1); cy <= Math.min(maxRow, heroCy + 1); cy++) {
        for (let cx = Math.max(0, heroCx - 1); cx <= Math.min(maxCol, heroCx + 1); cx++) {
          const img = this.cache.get(this.chunkKey(cx, cy));
          if (img) ctx.drawImage(img, cx * CHUNK * CELL, cy * CHUNK * CELL);
        }
      }
    }

    // Mở rộng nền đá sâu & vách biên khi Thần Thức nhìn xa vượt ngoài biên [0..WORLD_W, WORLD_H]
    if (left < 0) {
      const sy = surfaceAt(0);
      ctx.fillStyle = '#24303a';
      ctx.fillRect(left - 40, sy, -left + 42, Math.max(WORLD_H, top + h) - sy + 40);
      ctx.fillStyle = '#54763e';
      ctx.fillRect(left - 40, sy - 3, -left + 42, 6);
    }
    if (left + w > WORLD_W) {
      const sy = surfaceAt(WORLD_W);
      const extW = left + w - WORLD_W + 40;
      ctx.fillStyle = '#24303a';
      ctx.fillRect(WORLD_W - 2, sy, extW, Math.max(WORLD_H, top + h) - sy + 40);
      ctx.fillStyle = '#54763e';
      ctx.fillRect(WORLD_W - 2, sy - 3, extW, 6);
    }
    if (top + h > WORLD_H) {
      ctx.fillStyle = '#1d2730';
      ctx.fillRect(
        Math.min(0, left - 40),
        WORLD_H - 2,
        Math.max(WORLD_W, left + w) - Math.min(0, left - 40) + 80,
        top + h - WORLD_H + 80
      );
    }
  }
}

export function createTerrain() {
  game.terrain = new Terrain();
  return game.terrain;
}

export function excavate(x = player.x, y = player.y + 28, r = 76, emitDustFn = null) {
  if (!game.running || !game.terrain) return;
  const material = geoMaterial(x, y);
  const removed = game.terrain.cut(x, y, r);
  if (removed) {
    player.grounded = false;
    if (emitDustFn) emitDustFn('groundBurst', x, y, 1.45, material);
    showNotice(`Địa hình đã bị phá: ${removed} ô · Hố tồn tại cho đến khi chơi lại`);
  } else {
    showNotice('Vị trí này không có đất đá');
  }
}

export function drawBackdrop(img, alpha, parallax) {
  const ctx = game.ctx;
  if (!ctx || !img || alpha <= 0) return;
  const w = game.viewW;
  const h = game.viewH;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.imageSmoothingEnabled = true;

  const cover = Math.max(w / img.width, h / img.height);
  const scale = cover * 1.62;
  const dw = img.width * scale;
  const dh = img.height * scale;
  const roomX = Math.max(0, (dw - w) / 2);
  const calmParallax = parallax * 0.55;
  const shiftX =
    roomX > 0 ? roomX * Math.tanh(((camera.x - 520) * calmParallax) / Math.max(1, roomX)) : 0;
  const x = Math.round((w - dw) / 2 - shiftX);
  const y = Math.round((h - dh) / 2);

  ctx.drawImage(img, x, y, Math.round(dw), Math.round(dh));
  ctx.restore();
}

export function drawEnvironment() {
  const ctx = game.ctx;
  if (!ctx) return;
  const w = game.viewW;
  const h = game.viewH;
  ctx.fillStyle = '#152a42';
  ctx.fillRect(0, 0, w, h);

  drawBackdrop(game.images.surface, 1, 0.08);
  const skyAlpha = clamp((255 - camera.y) / 360, 0, 1);
  const caveAlpha = clamp((camera.y - 430) / 310, 0, 1);
  drawBackdrop(game.images.sky, skyAlpha, 0.12);
  drawBackdrop(game.images.cave, caveAlpha, 0.04);

  if (caveAlpha > 0) {
    ctx.fillStyle = `rgba(4,10,22,${0.13 * caveAlpha})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export function drawTerrain() {
  const ctx = game.ctx;
  const terrain = game.terrain;
  if (!ctx || !terrain) return;
  const w = game.viewW;
  const h = game.viewH;
  const z = settings.zoom;
  const worldW = w / z;
  const worldH = h / z;
  const left = camera.x - worldW / 2;
  const top = camera.y - worldH / 2;

  ctx.save();
  ctx.translate(-camera.x + w / 2, -camera.y + h / 2);
  ctx.imageSmoothingEnabled = false;
  terrain.draw(ctx, left, top, worldW, worldH);

  if (settings.geology) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffc987';
    ctx.lineWidth = Math.max(1, 0.7 / z);
    for (let x = Math.floor(left / 100) * 100; x < left + worldW; x += 100) {
      const sy = surfaceAt(x);
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + 100, surfaceAt(x + 100));
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

