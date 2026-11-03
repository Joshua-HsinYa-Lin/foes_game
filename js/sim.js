(function () {
  'use strict';
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const D = isNode ? require('./data.js') : globalThis.PF_DATA;

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const PR = D.PLAYER_R;

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function angleDiff(a, b) {
    let d = (b - a) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    const qx = ax + t * dx - px;
    const qy = ay + t * dy - py;
    return qx * qx + qy * qy;
  }

  function polyDist(px, py, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = segDist2(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // Returns the fraction t in [0,1] along the segment where it first touches the circle, or -1.
  function segCircle(x0, y0, x1, y1, cx, cy, r) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const fx = x0 - cx;
    const fy = y0 - cy;
    const c = fx * fx + fy * fy - r * r;
    if (c <= 0) return 0;
    const a = dx * dx + dy * dy;
    if (a === 0) return -1;
    const b = 2 * (fx * dx + fy * dy);
    let disc = b * b - 4 * a * c;
    if (disc < 0) return -1;
    disc = Math.sqrt(disc);
    const t = (-b - disc) / (2 * a);
    if (t >= 0 && t <= 1) return t;
    return -1;
  }

  // Slab test of a segment against an axis-aligned box.
  function segRect(x0, y0, x1, y1, minx, miny, maxx, maxy) {
    let tmin = 0;
    let tmax = 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    if (Math.abs(dx) < 1e-9) {
      if (x0 < minx || x0 > maxx) return -1;
    } else {
      let t1 = (minx - x0) / dx;
      let t2 = (maxx - x0) / dx;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-9) {
      if (y0 < miny || y0 > maxy) return -1;
    } else {
      let t1 = (miny - y0) / dy;
      let t2 = (maxy - y0) / dy;
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const rx = bx - ax;
    const ry = by - ay;
    const sx = dx - cx;
    const sy = dy - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
    const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [ax + rx * t, ay + ry * t];
  }

  function obstacleSegT(o, x0, y0, x1, y1) {
    if (o.s === 'c') return segCircle(x0, y0, x1, y1, o.x, o.y, o.r);
    return segRect(x0, y0, x1, y1, o.x - o.hw, o.y - o.hh, o.x + o.hw, o.y + o.hh);
  }

  function circleHitsObstacle(x, y, r, o) {
    if (o.s === 'c') {
      const dx = x - o.x;
      const dy = y - o.y;
      const m = r + o.r;
      return dx * dx + dy * dy < m * m;
    }
    const cx = clamp(x, o.x - o.hw, o.x + o.hw);
    const cy = clamp(y, o.y - o.hh, o.y + o.hh);
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy < r * r;
  }

  // Pushes ent (x,y) out of obstacle o; returns the push normal or null.
  function pushOut(ent, r, o) {
    if (o.s === 'c') {
      const dx = ent.x - o.x;
      const dy = ent.y - o.y;
      const m = r + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= m * m) return null;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? dx / d : 1;
      const ny = d > 1e-6 ? dy / d : 0;
      ent.x = o.x + nx * m;
      ent.y = o.y + ny * m;
      return [nx, ny];
    }
    const cx = clamp(ent.x, o.x - o.hw, o.x + o.hw);
    const cy = clamp(ent.y, o.y - o.hh, o.y + o.hh);
    const dx = ent.x - cx;
    const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > 1e-9) {
      if (d2 >= r * r) return null;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      ent.x = cx + nx * r;
      ent.y = cy + ny * r;
      return [nx, ny];
    }
    const px = o.hw - Math.abs(ent.x - o.x);
    const py = o.hh - Math.abs(ent.y - o.y);
    if (px < py) {
      const nx = ent.x >= o.x ? 1 : -1;
      ent.x = o.x + nx * (o.hw + r);
      return [nx, 0];
    }
    const ny = ent.y >= o.y ? 1 : -1;
    ent.y = o.y + ny * (o.hh + r);
    return [0, ny];
  }

  class Grid {
    constructor(size, cell) {
      this.cell = cell;
      this.n = Math.ceil(size / cell) + 1;
      this.cells = [];
      for (let i = 0; i < this.n * this.n; i++) this.cells.push([]);
      this.stamp = 0;
    }
    range(x0, y0, x1, y1) {
      const n = this.n;
      const c = this.cell;
      return [clamp(Math.floor(x0 / c), 0, n - 1), clamp(Math.floor(y0 / c), 0, n - 1), clamp(Math.floor(x1 / c), 0, n - 1), clamp(Math.floor(y1 / c), 0, n - 1)];
    }
    insert(o) {
      const ex = o.s === 'c' ? o.r : o.hw;
      const ey = o.s === 'c' ? o.r : o.hh;
      const [a, b, c, d] = this.range(o.x - ex, o.y - ey, o.x + ex, o.y + ey);
      for (let j = b; j <= d; j++) {
        for (let i = a; i <= c; i++) this.cells[j * this.n + i].push(o);
      }
    }
    query(x0, y0, x1, y1, out) {
      this.stamp++;
      const st = this.stamp;
      const [a, b, c, d] = this.range(x0, y0, x1, y1);
      for (let j = b; j <= d; j++) {
        for (let i = a; i <= c; i++) {
          const cell = this.cells[j * this.n + i];
          for (let k = 0; k < cell.length; k++) {
            const o = cell[k];
            if (o._s !== st) {
              o._s = st;
              out.push(o);
            }
          }
        }
      }
      return out;
    }
  }

  class LootGrid {
    constructor(size, cell) {
      this.cell = cell;
      this.n = Math.ceil(size / cell) + 1;
      this.cells = [];
      for (let i = 0; i < this.n * this.n; i++) this.cells.push(new Set());
    }
    idx(x, y) {
      const n = this.n;
      return clamp(Math.floor(y / this.cell), 0, n - 1) * n + clamp(Math.floor(x / this.cell), 0, n - 1);
    }
    add(l) {
      l._c = this.idx(l.x, l.y);
      this.cells[l._c].add(l);
    }
    remove(l) {
      this.cells[l._c].delete(l);
    }
    query(x0, y0, x1, y1, out) {
      const n = this.n;
      const c = this.cell;
      const a = clamp(Math.floor(x0 / c), 0, n - 1);
      const b = clamp(Math.floor(y0 / c), 0, n - 1);
      const e = clamp(Math.floor(x1 / c), 0, n - 1);
      const f = clamp(Math.floor(y1 / c), 0, n - 1);
      for (let j = b; j <= f; j++) {
        for (let i = a; i <= e; i++) {
          for (const l of this.cells[j * n + i]) out.push(l);
        }
      }
      return out;
    }
  }

  // kind, item, count, weight (normal), weight (military)
  const LOOT_TABLE = [
    ['gun', 'pistol', 1, 16, 4],
    ['gun', 'smg', 1, 12, 9],
    ['gun', 'shotgun', 1, 11, 8],
    ['gun', 'rifle', 1, 8, 14],
    ['gun', 'dmr', 1, 3.5, 9],
    ['gun', 'sniper', 1, 1.6, 6],
    ['gun', 'lmg', 1, 1.6, 5],
    ['melee', 'hatchet', 1, 3, 1],
    ['ammo', 'light', 30, 8, 3],
    ['ammo', 'medium', 30, 7, 5],
    ['ammo', 'shells', 10, 5, 3],
    ['ammo', 'heavy', 10, 2, 3],
    ['heal', 'bandage', 5, 12, 6],
    ['heal', 'medkit', 1, 4, 7],
    ['heal', 'soda', 1, 6, 6],
    ['frag', 'frag', 2, 5, 7],
    ['vest', 1, 1, 5, 2],
    ['vest', 2, 1, 2.5, 5],
    ['vest', 3, 1, 0.5, 3],
    ['helmet', 1, 1, 5, 2],
    ['helmet', 2, 1, 2.5, 5],
    ['helmet', 3, 1, 0.5, 3],
    ['pack', 1, 1, 4, 2],
    ['pack', 2, 1, 2, 4],
    ['pack', 3, 1, 0.5, 2.5],
    ['scope', 1, 1, 3, 3],
    ['scope', 2, 1, 1.2, 3],
    ['scope', 3, 1, 0.3, 1.5]
  ];

  function itemLabel(k, it, c) {
    if (k === 'gun') return D.WEAPONS[it].name;
    if (k === 'melee') return D.MELEE[it].name;
    if (k === 'ammo') return D.AMMO[it].name + ' x' + c;
    if (k === 'heal') return D.HEALS[it].name + (c > 1 ? ' x' + c : '');
    if (k === 'frag') return D.FRAG.name + (c > 1 ? ' x' + c : '');
    if (k === 'vest' || k === 'helmet' || k === 'pack' || k === 'scope') return D.GEAR_NAMES[k][it];
    return k;
  }

  function itemRarity(k, it) {
    if (k === 'gun') return D.WEAPONS[it].rarity;
    if (k === 'melee') return D.MELEE[it].rarity;
    if (k === 'heal') return D.HEALS[it].rarity;
    if (k === 'frag') return D.FRAG.rarity;
    if (k === 'vest' || k === 'helmet' || k === 'pack') return it;
    if (k === 'scope') return it + 1;
    return 0;
  }

  const VALID_ACTIONS = { slot: 1, swap: 1, cycle: 1, reload: 1, interact: 1, use: 1, autoheal: 1, scope: 1, cancel: 1 };

  class Sim {
    constructor(opts) {
      opts = opts || {};
      this.seed = (opts.seed >>> 0) || ((Math.random() * 4294967296) >>> 0);
      this.rng = mulberry32(this.seed);
      this.size = D.MAP_SIZE;
      this.difficulty = D.BOT_SKILL[opts.difficulty] ? opts.difficulty : 'normal';
      this.time = 0;
      this.nextId = 1;
      this.players = [];
      this.playerMap = new Map();
      this.bullets = [];
      this.grenades = [];
      this.vehicles = [];
      this.obstacles = [];
      this.buildings = [];
      this.roads = [];
      this.bridges = [];
      this.river = null;
      this.events = [];
      this.state = 'playing';
      this.winner = null;
      this.grid = new Grid(this.size, 200);
      this.lootGrid = new LootGrid(this.size, 200);
      this.loot = new Map();
      this._q = [];
      this._q2 = [];
      this.usedNames = new Set();
      this.generateMap();
      this.initZone();
    }

    rand(a, b) {
      return a + this.rng() * (b - a);
    }

    ev(e) {
      this.events.push(e);
    }

    // ---------- map generation ----------

    generateMap() {
      const S = this.size;
      const R = this.rng;
      this.noise = [];
      const NG = 12;
      for (let i = 0; i < (NG + 1) * (NG + 1); i++) this.noise.push(R());
      this.noiseN = NG;

      const horiz = R() < 0.5;
      const base = S * (0.35 + R() * 0.3);
      const A1 = 220 + R() * 220;
      const A2 = 70 + R() * 100;
      const f1 = (1.2 + R() * 1.2) * TAU / S;
      const f2 = (3 + R() * 3) * TAU / S;
      const p1 = R() * TAU;
      const p2 = R() * TAU;
      const rpts = [];
      for (let s = -240; s <= S + 240; s += 140) {
        const o = base + Math.sin(s * f1 + p1) * A1 + Math.sin(s * f2 + p2) * A2;
        rpts.push(horiz ? [s, o] : [o, s]);
      }
      const rw = 160 + R() * 50;
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const p of rpts) {
        bx0 = Math.min(bx0, p[0]);
        by0 = Math.min(by0, p[1]);
        bx1 = Math.max(bx1, p[0]);
        by1 = Math.max(by1, p[1]);
      }
      this.river = { w: rw, pts: rpts, bb: [bx0 - rw, by0 - rw, bx1 + rw, by1 + rw] };

      const villages = [];
      for (let tries = 0; tries < 600 && villages.length < 8; tries++) {
        const x = 650 + R() * (S - 1300);
        const y = 650 + R() * (S - 1300);
        if (polyDist(x, y, rpts) < rw / 2 + 480) continue;
        let ok = true;
        for (const v of villages) {
          if (Math.hypot(v.x - x, v.y - y) < 1250) ok = false;
        }
        if (!ok) continue;
        villages.push({ x, y, r: 360 + R() * 180 });
      }
      this.villages = villages;

      const ROAD_W = 86;
      const edges = [];
      if (villages.length > 1) {
        const inTree = [0];
        const left = [];
        for (let i = 1; i < villages.length; i++) left.push(i);
        while (left.length) {
          let best = null;
          for (const a of inTree) {
            for (const b of left) {
              const d = Math.hypot(villages[a].x - villages[b].x, villages[a].y - villages[b].y);
              if (!best || d < best[2]) best = [a, b, d];
            }
          }
          edges.push([best[0], best[1]]);
          inTree.push(best[1]);
          left.splice(left.indexOf(best[1]), 1);
        }
        for (let k = 0; k < 2; k++) {
          const a = Math.floor(R() * villages.length);
          const b = Math.floor(R() * villages.length);
          if (a !== b && !edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b]);
        }
      }
      for (const [ai, bi] of edges) {
        const a = villages[ai];
        const b = villages[bi];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        const nx = -dy / L;
        const ny = dx / L;
        const bend = (R() - 0.5) * L * 0.25;
        const pts = [[a.x, a.y]];
        const n = 5;
        for (let i = 1; i < n; i++) {
          const t = i / n;
          const off = Math.sin(t * Math.PI) * bend + (R() - 0.5) * 50;
          pts.push([a.x + dx * t + nx * off, a.y + dy * t + ny * off]);
        }
        pts.push([b.x, b.y]);
        this.roads.push({ w: ROAD_W, pts });
      }
      // two roads that run off the map edge
      for (let k = 0; k < 2 && villages.length; k++) {
        const v = villages[Math.floor(R() * villages.length)];
        const side = Math.floor(R() * 4);
        const ex = side === 0 ? -100 : side === 1 ? S + 100 : v.x + (R() - 0.5) * 600;
        const ey = side === 2 ? -100 : side === 3 ? S + 100 : v.y + (R() - 0.5) * 600;
        const pts = [[v.x, v.y]];
        for (let i = 1; i < 4; i++) {
          const t = i / 4;
          pts.push([v.x + (ex - v.x) * t + (R() - 0.5) * 120, v.y + (ey - v.y) * t + (R() - 0.5) * 120]);
        }
        pts.push([ex, ey]);
        this.roads.push({ w: ROAD_W, pts });
      }
      for (const road of this.roads) {
        for (let i = 0; i < road.pts.length - 1; i++) {
          const a = road.pts[i];
          const b = road.pts[i + 1];
          for (let j = 0; j < rpts.length - 1; j++) {
            const c = rpts[j];
            const d = rpts[j + 1];
            const hit = segSeg(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
            if (hit) {
              this.bridges.push({ x: hit[0], y: hit[1], a: Math.atan2(b[1] - a[1], b[0] - a[0]), len: rw + 90, w: ROAD_W + 22 });
            }
          }
        }
      }

      for (const v of villages) {
        const count = 3 + Math.floor(R() * 4);
        let placed = 0;
        for (let t = 0; t < 80 && placed < count; t++) {
          const ang = R() * TAU;
          const d = 120 + R() * v.r;
          const w = Math.round((260 + R() * 150) / 10) * 10;
          const h = Math.round((220 + R() * 120) / 10) * 10;
          if (this.tryBuilding(v.x + Math.cos(ang) * d, v.y + Math.sin(ang) * d, w, h, 'house')) placed++;
        }
      }
      let wh = 0;
      for (let t = 0; t < 200 && wh < 2; t++) {
        const w = Math.round((560 + R() * 80) / 10) * 10;
        const h = Math.round((360 + R() * 60) / 10) * 10;
        if (this.tryBuilding(400 + R() * (S - 800), 400 + R() * (S - 800), w, h, 'warehouse')) wh++;
      }
      let cabins = 0;
      for (let t = 0; t < 300 && cabins < 12; t++) {
        const w = Math.round((200 + R() * 40) / 10) * 10;
        const h = Math.round((180 + R() * 30) / 10) * 10;
        if (this.tryBuilding(300 + R() * (S - 600), 300 + R() * (S - 600), w, h, 'cabin')) cabins++;
      }

      let trees = 0;
      for (let t = 0; t < 12000 && trees < 1150; t++) {
        const x = R() * S;
        const y = R() * S;
        const n = this.noiseAt(x, y);
        if (R() > n * n * 1.6 + 0.04) continue;
        const cr = 70 + R() * 55;
        const r = cr * 0.27;
        if (!this.freeSpot(x, y, r, 54, 40)) continue;
        this.addObstacle('tree', 'c', x, y, { r, cr });
        trees++;
      }
      this.scatter('rock', 260, () => ({ r: 30 + R() * 26 }), 50, 30);
      this.scatter('bush', 420, () => ({ r: 38 + R() * 18 }), 0, 20);
      this.scatter('crate', 150, () => ({ hw: 30, hh: 30 }), 46, 30);
      this.scatter('mcrate', 14, () => ({ hw: 34, hh: 34 }), 46, 30);
      this.scatter('barrel', 70, () => ({ r: 24 }), 46, 30);

      let gl = 0;
      for (let t = 0; t < 2000 && gl < 150; t++) {
        const x = 100 + R() * (S - 200);
        const y = 100 + R() * (S - 200);
        if (this.inWater(x, y)) continue;
        if (this.blockedAt(x, y, 24)) continue;
        if (this.insideBuilding(x, y, 0)) continue;
        this.spawnLootRoll(x, y, 0);
        gl++;
      }

      const vtypes = ['jeep', 'jeep', 'jeep', 'jeep', 'jeep', 'jeep', 'jeep', 'bike', 'bike', 'bike', 'bike', 'bike'];
      for (const vt of vtypes) {
        for (let t = 0; t < 60 && this.roads.length; t++) {
          const road = this.roads[Math.floor(R() * this.roads.length)];
          const i = Math.floor(R() * (road.pts.length - 1));
          const a = road.pts[i];
          const b = road.pts[i + 1];
          const f = R();
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (R() < 0.5 ? Math.PI : 0);
          const x = a[0] + (b[0] - a[0]) * f + Math.cos(ang + Math.PI / 2) * 22;
          const y = a[1] + (b[1] - a[1]) * f + Math.sin(ang + Math.PI / 2) * 22;
          if (x < 150 || y < 150 || x > S - 150 || y > S - 150) continue;
          if (this.inWater(x, y)) continue;
          if (this.blockedAt(x, y, D.VEHICLES[vt].r + 10)) continue;
          if (this.vehicles.some(v => Math.hypot(v.x - x, v.y - y) < 260)) continue;
          this.spawnVehicle(vt, x, y, ang);
          break;
        }
      }
    }

    noiseAt(x, y) {
      const n = this.noiseN;
      const fx = clamp(x / this.size, 0, 0.9999) * n;
      const fy = clamp(y / this.size, 0, 0.9999) * n;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      let tx = fx - ix;
      let ty = fy - iy;
      tx = tx * tx * (3 - 2 * tx);
      ty = ty * ty * (3 - 2 * ty);
      const g = this.noise;
      const w = n + 1;
      const a = g[iy * w + ix];
      const b = g[iy * w + ix + 1];
      const c = g[(iy + 1) * w + ix];
      const d = g[(iy + 1) * w + ix + 1];
      return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
    }

    nearRoad(x, y, margin) {
      for (const road of this.roads) {
        if (polyDist(x, y, road.pts) < road.w / 2 + margin) return true;
      }
      return false;
    }

    rectHitsRoads(x0, y0, x1, y1) {
      for (const road of this.roads) {
        for (let i = 0; i < road.pts.length - 1; i++) {
          const a = road.pts[i];
          const b = road.pts[i + 1];
          if (segRect(a[0], a[1], b[0], b[1], x0, y0, x1, y1) >= 0) return true;
        }
      }
      return false;
    }

    insideBuilding(x, y, margin) {
      for (const b of this.buildings) {
        if (Math.abs(x - b.x) < b.w / 2 + margin && Math.abs(y - b.y) < b.h / 2 + margin) return b;
      }
      return null;
    }

    freeSpot(x, y, r, gap, edge) {
      const S = this.size;
      if (x < edge || y < edge || x > S - edge || y > S - edge) return false;
      if (this.river && polyDist(x, y, this.river.pts) < this.river.w / 2 + r + 30) return false;
      if (this.nearRoad(x, y, r + 14)) return false;
      if (this.insideBuilding(x, y, r + 40)) return false;
      const q = this.grid.query(x - r - gap - 60, y - r - gap - 60, x + r + gap + 60, y + r + gap + 60, this._q);
      let ok = true;
      for (const o of q) {
        if (!o.solid && gap > 0) continue;
        if (circleHitsObstacle(x, y, r + gap, o)) {
          ok = false;
          break;
        }
      }
      q.length = 0;
      return ok;
    }

    scatter(kind, count, shapeFn, gap, edge) {
      let n = 0;
      for (let t = 0; t < count * 8 && n < count; t++) {
        const x = this.rng() * this.size;
        const y = this.rng() * this.size;
        const sh = shapeFn();
        const r = sh.r || sh.hw * 1.42;
        if (!this.freeSpot(x, y, r, gap, edge)) continue;
        this.addObstacle(kind, sh.r ? 'c' : 'r', x, y, sh);
        n++;
      }
    }

    addObstacle(kind, shape, x, y, sh) {
      const def = D.OBST[kind];
      const o = {
        id: this.obstacles.length,
        k: kind,
        s: shape,
        x,
        y,
        r: sh.r || 0,
        hw: sh.hw || 0,
        hh: sh.hh || 0,
        cr: sh.cr || 0,
        hp: def.hp,
        mhp: def.hp,
        solid: def.solid,
        blk: def.blk,
        dead: false,
        v: Math.floor(this.rng() * 1000),
        b: sh.b != null ? sh.b : -1,
        _s: 0
      };
      this.obstacles.push(o);
      this.grid.insert(o);
      return o;
    }

    tryBuilding(x, y, w, h, type) {
      const S = this.size;
      x = Math.round(x);
      y = Math.round(y);
      if (x - w / 2 < 150 || y - h / 2 < 150 || x + w / 2 > S - 150 || y + h / 2 > S - 150) return false;
      const diag = Math.hypot(w, h) / 2;
      if (polyDist(x, y, this.river.pts) < this.river.w / 2 + diag + 40) return false;
      if (this.rectHitsRoads(x - w / 2 - 70, y - h / 2 - 70, x + w / 2 + 70, y + h / 2 + 70)) return false;
      for (const b of this.buildings) {
        if (Math.abs(b.x - x) < (b.w + w) / 2 + 90 && Math.abs(b.y - y) < (b.h + h) / 2 + 90) return false;
      }
      const q = this.grid.query(x - w / 2 - 40, y - h / 2 - 40, x + w / 2 + 40, y + h / 2 + 40, this._q);
      const blocked = q.length > 0;
      q.length = 0;
      if (blocked) return false;
      this.addBuilding(x, y, w, h, type);
      return true;
    }

    addBuilding(x, y, w, h, type) {
      const R = this.rng;
      const b = {
        id: this.buildings.length,
        x,
        y,
        w,
        h,
        type,
        roof: Math.floor(R() * D.ROOFS.length),
        floor: type === 'warehouse' ? 3 : Math.floor(R() * 3)
      };
      this.buildings.push(b);
      const T = 16;
      const door = 78;
      const order = [0, 1, 2, 3];
      for (let i = 3; i > 0; i--) {
        const j = Math.floor(R() * (i + 1));
        const s = order[i];
        order[i] = order[j];
        order[j] = s;
      }
      const ndoors = type === 'warehouse' ? 3 : (R() < 0.5 ? 1 : 2);
      const doors = new Set(order.slice(0, ndoors));
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const y0 = y - h / 2;
      const y1 = y + h / 2;
      const hwall = (ax, bx, wy) => {
        if (bx - ax < 2) return;
        this.addObstacle('wall', 'r', (ax + bx) / 2, wy, { hw: (bx - ax) / 2, hh: T / 2, b: b.id });
      };
      const vwall = (ay, by, wx) => {
        if (by - ay < 2) return;
        this.addObstacle('wall', 'r', wx, (ay + by) / 2, { hw: T / 2, hh: (by - ay) / 2, b: b.id });
      };
      for (let side = 0; side < 4; side++) {
        const horizontal = side === 0 || side === 2;
        const len = horizontal ? w : h;
        const lo = horizontal ? x0 : y0 + T;
        const hi = horizontal ? x1 : y1 - T;
        const fixed = side === 0 ? y0 + T / 2 : side === 2 ? y1 - T / 2 : side === 1 ? x1 - T / 2 : x0 + T / 2;
        const mk = horizontal ? (a, c) => hwall(a, c, fixed) : (a, c) => vwall(a, c, fixed);
        if (doors.has(side) && len > door + 120) {
          const dc = lo + 50 + door / 2 + R() * (hi - lo - 100 - door);
          mk(lo, dc - door / 2);
          mk(dc + door / 2, hi);
        } else {
          mk(lo, hi);
        }
      }
      if (type === 'house' && w >= 320 && R() < 0.6) {
        const px = Math.round(x + (R() - 0.5) * w * 0.2);
        const dc = y0 + T + 40 + door / 2 + R() * (h - 2 * T - 80 - door);
        vwall(y0 + T, dc - door / 2, px);
        vwall(dc + door / 2, y1 - T, px);
      }
      const ix0 = x0 + T + 40;
      const iy0 = y0 + T + 40;
      const ix1 = x1 - T - 40;
      const iy1 = y1 - T - 40;
      const corners = [[ix0, iy0], [ix1, iy0], [ix0, iy1], [ix1, iy1]];
      const ncrates = type === 'warehouse' ? 4 : type === 'cabin' ? 1 : 1 + Math.floor(R() * 2);
      for (let i = 0; i < ncrates && i < corners.length; i++) {
        const c = corners[Math.floor(R() * corners.length)];
        if (this.blockedAt(c[0], c[1], 32)) continue;
        const mil = type === 'warehouse' ? R() < 0.6 : R() < 0.08;
        this.addObstacle(mil ? 'mcrate' : 'crate', 'r', c[0], c[1], mil ? { hw: 34, hh: 34 } : { hw: 30, hh: 30 });
      }
      if (type === 'warehouse') {
        for (let i = 0; i < 3; i++) {
          const cx = x + (R() - 0.5) * (w - 200);
          const cy = y + (R() - 0.5) * (h - 200);
          if (!this.blockedAt(cx, cy, 70)) this.addObstacle('crate', 'r', cx, cy, { hw: 30, hh: 30 });
        }
      }
      const nloot = type === 'warehouse' ? 6 : type === 'cabin' ? 2 : 2 + Math.floor(R() * 3);
      for (let i = 0; i < nloot; i++) {
        for (let t = 0; t < 10; t++) {
          const lx = ix0 + R() * (ix1 - ix0);
          const ly = iy0 + R() * (iy1 - iy0);
          if (this.blockedAt(lx, ly, 26)) continue;
          this.spawnLootRoll(lx, ly, type === 'warehouse' ? 1 : 0);
          break;
        }
      }
    }

    // ---------- loot ----------

    rollLoot(tier) {
      let total = 0;
      for (const e of LOOT_TABLE) total += e[3 + tier];
      let r = this.rng() * total;
      for (const e of LOOT_TABLE) {
        r -= e[3 + tier];
        if (r <= 0) return e;
      }
      return LOOT_TABLE[0];
    }

    spawnLootRoll(x, y, tier) {
      const e = this.rollLoot(tier);
      this.spawnLoot(x, y, e[0], e[1], e[2]);
      if (e[0] === 'gun') {
        const W = D.WEAPONS[e[1]];
        const n = 1 + (this.rng() < 0.6 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const a = this.rng() * TAU;
          this.spawnLoot(x + Math.cos(a) * 38, y + Math.sin(a) * 38, 'ammo', W.ammo, D.AMMO[W.ammo].stack);
        }
      }
    }

    spawnLoot(x, y, k, it, c, extra) {
      const l = { id: this.nextId++, x: clamp(x, 30, this.size - 30), y: clamp(y, 30, this.size - 30), k, it, c, m: extra && extra.m != null ? extra.m : null, by: extra && extra.by ? extra.by : 0, bt: this.time, _c: 0 };
      const q = this.grid.query(l.x - 60, l.y - 60, l.x + 60, l.y + 60, this._q2);
      for (const o of q) {
        if (o.solid && !o.dead) pushOut(l, D.LOOT_R, o);
      }
      q.length = 0;
      this.loot.set(l.id, l);
      this.lootGrid.add(l);
      return l;
    }

    removeLoot(l) {
      if (!this.loot.has(l.id)) return;
      this.loot.delete(l.id);
      this.lootGrid.remove(l);
    }

    scatterDrop(p, k, it, c, extra) {
      const a = this.rng() * TAU;
      const d = 20 + this.rng() * 45;
      return this.spawnLoot(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, k, it, c, extra);
    }

    // ---------- vehicles ----------

    spawnVehicle(t, x, y, a) {
      const V = D.VEHICLES[t];
      const v = { id: this.nextId++, t, x, y, a, sp: 0, hp: V.hp, mhp: V.hp, driver: 0, dead: false, col: Math.floor(this.rng() * 4) };
      this.vehicles.push(v);
      return v;
    }

    // ---------- zone ----------

    initZone() {
      const S = this.size;
      this.zone = { x: S / 2, y: S / 2, r: S * 0.72, tx: S / 2, ty: S / 2, tr: S * 0.72, sx: 0, sy: 0, sr: 0, phase: 0, state: 'wait', timer: D.ZONE[0].wait, dps: D.ZONE[0].dps };
      this.pickZoneTarget();
    }

    pickZoneTarget() {
      const z = this.zone;
      const ph = D.ZONE[z.phase];
      const S = this.size;
      const room = Math.max(0, z.r - ph.r);
      let tx = z.x;
      let ty = z.y;
      for (let t = 0; t < 40; t++) {
        const a = this.rng() * TAU;
        const d = Math.sqrt(this.rng()) * room;
        const cx = z.x + Math.cos(a) * d;
        const cy = z.y + Math.sin(a) * d;
        const m = Math.min(ph.r * 0.5 + 300, S * 0.3);
        if (cx < m || cy < m || cx > S - m || cy > S - m) continue;
        tx = cx;
        ty = cy;
        break;
      }
      z.tx = tx;
      z.ty = ty;
      z.tr = ph.r;
    }

    updateZone(dt) {
      const z = this.zone;
      if (z.state === 'final') return;
      z.timer -= dt;
      if (z.state === 'wait') {
        if (z.timer <= 0) {
          z.state = 'shrink';
          z.timer = D.ZONE[z.phase].shrink;
          z.sx = z.x;
          z.sy = z.y;
          z.sr = z.r;
          this.ev({ e: 'msg', g: 1, txt: 'The red fog is closing in!' });
        }
        return;
      }
      const ph = D.ZONE[z.phase];
      const f = clamp(1 - z.timer / ph.shrink, 0, 1);
      z.x = z.sx + (z.tx - z.sx) * f;
      z.y = z.sy + (z.ty - z.sy) * f;
      z.r = z.sr + (z.tr - z.sr) * f;
      if (z.timer <= 0) {
        z.x = z.tx;
        z.y = z.ty;
        z.r = z.tr;
        z.phase++;
        if (z.phase >= D.ZONE.length) {
          z.state = 'final';
          z.phase = D.ZONE.length - 1;
          z.dps = D.ZONE[z.phase].dps * 1.5;
          return;
        }
        z.dps = D.ZONE[z.phase].dps;
        z.state = 'wait';
        z.timer = D.ZONE[z.phase].wait;
        this.pickZoneTarget();
        this.ev({ e: 'msg', g: 1, txt: 'Next safe zone marked. Fog moves in ' + Math.round(z.timer) + 's' });
      }
    }

    // ---------- players ----------

    pickBotName() {
      for (let t = 0; t < 50; t++) {
        const n = D.BOT_NAMES_A[Math.floor(this.rng() * D.BOT_NAMES_A.length)] + D.BOT_NAMES_B[Math.floor(this.rng() * D.BOT_NAMES_B.length)];
        if (!this.usedNames.has(n)) {
          this.usedNames.add(n);
          return n;
        }
      }
      return 'Bot' + this.nextId;
    }

    addPlayer(name, isBot, skin) {
      const id = this.nextId++;
      const nm = isBot ? this.pickBotName() : (String(name || '').replace(/[^\w \-.!?]/g, '').trim().slice(0, 16) || 'Player');
      const p = {
        id,
        name: nm,
        bot: !!isBot,
        skin: Number.isInteger(skin) ? clamp(skin, 0, D.SKINS.length - 1) : Math.floor(this.rng() * D.SKINS.length),
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        kx: 0,
        ky: 0,
        a: 0,
        hp: D.MAX_HP,
        boost: 0,
        alive: true,
        slots: [null, null, { w: 'fists' }, null],
        act: 2,
        lastAct: 2,
        ammo: { light: 0, medium: 0, shells: 0, heavy: 0 },
        items: { bandage: 0, medkit: 0, soda: 0, frag: 0 },
        vest: 0,
        helmet: 0,
        pack: 0,
        scope: 0,
        scopes: [true, false, false, false],
        cool: 0,
        deploy: 0,
        reload: null,
        action: null,
        bloom: 0,
        swingT: 0,
        swingSide: 1,
        kills: 0,
        dmgDealt: 0,
        veh: 0,
        placement: 0,
        killer: '',
        killerId: 0,
        deadT: 0,
        hitT: -10,
        lastAttacker: 0,
        lastShot: -10,
        ranT: 0,
        inWater: false,
        inBush: false,
        aspect: 16 / 9,
        input: { mx: 0, my: 0, aim: 0, shoot: false, aimDist: 300, brake: false },
        actions: [],
        triggerHeld: false,
        joinT: this.time,
        ai: null
      };
      if (isBot) {
        p.ai = { t: this.rng() * 0.5, target: 0, goal: null, goalT: 0, mode: 'loot', strafe: 1, strafeT: 0, stuckT: 1, lastX: 0, lastY: 0, unstuck: 0, unstuckDir: 0, aimErr: 0, los: false, lostT: 0, side: this.rng() < 0.5 ? 1 : -1, lootId: 0, crateId: 0, throwT: 0, thrown: false, lastThrow: -20, wanderT: 0 };
      }
      this.spawnPoint(p);
      this.players.push(p);
      this.playerMap.set(id, p);
      if (p.ai) {
        p.ai.lastX = p.x;
        p.ai.lastY = p.y;
      }
      return id;
    }

    spawnPoint(p) {
      const S = this.size;
      let bx = S / 2;
      let by = S / 2;
      let bestScore = -1;
      for (let t = 0; t < 80; t++) {
        const x = 200 + this.rng() * (S - 400);
        const y = 200 + this.rng() * (S - 400);
        if (this.inWater(x, y) || this.blockedAt(x, y, PR + 6)) continue;
        let md = 99999;
        for (const q of this.players) {
          if (q.alive) md = Math.min(md, Math.hypot(q.x - x, q.y - y));
        }
        if (md > 750) {
          bx = x;
          by = y;
          bestScore = md;
          break;
        }
        if (md > bestScore) {
          bestScore = md;
          bx = x;
          by = y;
        }
      }
      p.x = bx;
      p.y = by;
    }

    removePlayer(id) {
      const p = this.playerMap.get(id);
      if (!p) return;
      if (p.alive) this.killPlayer(p, 0, 'left');
      p.left = true;
    }

    fillBots(total) {
      while (this.players.length < total) this.addPlayer('', true);
    }

    setInput(id, inp) {
      const p = this.playerMap.get(id);
      if (!p || !inp) return;
      const i = p.input;
      i.mx = clamp(Number(inp.mx) || 0, -1, 1);
      i.my = clamp(Number(inp.my) || 0, -1, 1);
      const aim = Number(inp.aim);
      if (Number.isFinite(aim)) i.aim = aim;
      i.shoot = !!inp.shoot;
      i.aimDist = clamp(Number(inp.aimDist) || 0, 0, 3000);
      i.brake = !!inp.brake;
    }

    pushAction(id, act) {
      const p = this.playerMap.get(id);
      if (!p || !act || !VALID_ACTIONS[act.a]) return;
      if (p.actions.length > 12) return;
      const a = { a: act.a };
      if (act.i != null) a.i = clamp(Math.floor(Number(act.i) || 0), -1, 3);
      if (typeof act.item === 'string' && D.HEALS[act.item]) a.item = act.item;
      p.actions.push(a);
    }

    setAspect(id, aspect) {
      const p = this.playerMap.get(id);
      if (p) p.aspect = clamp(Number(aspect) || 1.7, 0.5, 4);
    }

    capacity(p, k, it) {
      if (k === 'ammo') return D.AMMO[it].cap[p.pack];
      if (k === 'heal') return D.HEALS[it].cap[p.pack];
      if (k === 'frag') return D.FRAG.cap[p.pack];
      return 0;
    }

    toPlayer(p, txt, ok) {
      this.ev({ e: 'pick', to: p.id, txt, ok: ok ? 1 : 0 });
    }

    tryPickup(p, l, manual) {
      const k = l.k;
      if (!manual && l.by === p.id && this.time - l.bt < 3) return false;
      if (k === 'ammo' || k === 'heal' || k === 'frag') {
        const store = k === 'ammo' ? p.ammo : p.items;
        const key = k === 'frag' ? 'frag' : l.it;
        const space = this.capacity(p, k, l.it) - store[key];
        if (space <= 0) {
          if (manual) this.toPlayer(p, 'No room for more ' + itemLabel(k, l.it, 1));
          return false;
        }
        const take = Math.min(space, l.c);
        store[key] += take;
        l.c -= take;
        if (l.c <= 0) this.removeLoot(l);
        this.toPlayer(p, '+' + take + ' ' + itemLabel(k, l.it, 1).replace(/ x\d+$/, ''), true);
        if (k === 'ammo') {
          const g = p.act <= 1 ? p.slots[p.act] : null;
          if (g && g.m === 0 && D.WEAPONS[g.w].ammo === l.it) this.startReload(p);
        }
        return true;
      }
      if (k === 'scope') {
        if (p.scopes[l.it]) return false;
        p.scopes[l.it] = true;
        if (l.it > p.scope) p.scope = l.it;
        this.removeLoot(l);
        this.toPlayer(p, itemLabel(k, l.it), true);
        return true;
      }
      if (k === 'vest' || k === 'helmet' || k === 'pack') {
        const cur = p[k];
        if (l.it === cur) return false;
        if (l.it < cur && !manual) return false;
        this.removeLoot(l);
        if (cur > 0) this.scatterDrop(p, k, cur, 1, { by: p.id });
        p[k] = l.it;
        if (k === 'pack') this.clampInventory(p);
        this.toPlayer(p, itemLabel(k, l.it), true);
        return true;
      }
      if (k === 'gun') {
        let slot = -1;
        if (!p.slots[0]) slot = 0;
        else if (!p.slots[1]) slot = 1;
        if (slot < 0) {
          if (!manual) return false;
          slot = p.act <= 1 ? p.act : 0;
          const old = p.slots[slot];
          this.scatterDrop(p, 'gun', old.w, 1, { m: old.m, by: p.id });
        }
        p.slots[slot] = { w: l.it, m: l.m != null ? l.m : D.WEAPONS[l.it].mag };
        this.removeLoot(l);
        if (p.act === slot) {
          p.reload = null;
          p.deploy = 0.3;
        } else if (p.act === 2 || p.act === 3) {
          this.switchSlot(p, slot);
        }
        this.toPlayer(p, itemLabel(k, l.it), true);
        return true;
      }
      if (k === 'melee') {
        const cur = p.slots[2].w;
        if (cur === l.it) return false;
        if (!manual && cur !== 'fists') return false;
        this.removeLoot(l);
        if (cur !== 'fists') this.scatterDrop(p, 'melee', cur, 1, { by: p.id });
        p.slots[2] = { w: l.it };
        this.toPlayer(p, itemLabel(k, l.it), true);
        return true;
      }
      return false;
    }

    clampInventory(p) {
      for (const t in p.ammo) {
        const cap = D.AMMO[t].cap[p.pack];
        if (p.ammo[t] > cap) {
          this.scatterDrop(p, 'ammo', t, p.ammo[t] - cap, { by: p.id });
          p.ammo[t] = cap;
        }
      }
      for (const t in D.HEALS) {
        const cap = D.HEALS[t].cap[p.pack];
        if (p.items[t] > cap) {
          this.scatterDrop(p, 'heal', t, p.items[t] - cap, { by: p.id });
          p.items[t] = cap;
        }
      }
      if (p.items.frag > D.FRAG.cap[p.pack]) {
        this.scatterDrop(p, 'frag', 'frag', p.items.frag - D.FRAG.cap[p.pack], { by: p.id });
        p.items.frag = D.FRAG.cap[p.pack];
      }
    }

    nearestLoot(p, range) {
      const q = this.lootGrid.query(p.x - range, p.y - range, p.x + range, p.y + range, this._q2);
      let best = null;
      let bd = range * range;
      for (const l of q) {
        const d = (l.x - p.x) * (l.x - p.x) + (l.y - p.y) * (l.y - p.y);
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      q.length = 0;
      return best;
    }

    nearestFreeVehicle(p) {
      let best = null;
      let bd = Infinity;
      for (const v of this.vehicles) {
        if (v.dead || v.driver) continue;
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < D.VEHICLES[v.t].r + 55 && d < bd) {
          bd = d;
          best = v;
        }
      }
      return best;
    }

    interact(p) {
      if (p.veh) {
        this.exitVehicle(p);
        return;
      }
      const l = this.nearestLoot(p, D.PICKUP_RANGE);
      if (l && this.tryPickup(p, l, true)) return;
      const v = this.nearestFreeVehicle(p);
      if (v) this.enterVehicle(p, v);
    }

    enterVehicle(p, v) {
      v.driver = p.id;
      p.veh = v.id;
      p.reload = null;
      p.vx = 0;
      p.vy = 0;
      p.x = v.x;
      p.y = v.y;
      this.toPlayer(p, 'Driving ' + D.VEHICLES[v.t].name + '  [F] to exit');
    }

    exitVehicle(p) {
      const v = this.vehicles.find(q => q.id === p.veh);
      p.veh = 0;
      if (!v) return;
      v.driver = 0;
      const V = D.VEHICLES[v.t];
      const offs = [Math.PI / 2, -Math.PI / 2, Math.PI, 0];
      for (const o of offs) {
        const d = o === 0 || o === Math.PI ? V.len / 2 + PR + 8 : V.wid / 2 + PR + 8;
        const x = v.x + Math.cos(v.a + o) * d;
        const y = v.y + Math.sin(v.a + o) * d;
        if (!this.blockedAt(x, y, PR)) {
          p.x = x;
          p.y = y;
          return;
        }
      }
      p.x = v.x + Math.cos(v.a + Math.PI / 2) * (V.wid / 2 + PR + 8);
      p.y = v.y + Math.sin(v.a + Math.PI / 2) * (V.wid / 2 + PR + 8);
    }

    switchSlot(p, i) {
      if (!Number.isInteger(i) || i === p.act || i < 0 || i > 3) return;
      if (i <= 1 && !p.slots[i]) return;
      if (i === 3 && p.items.frag <= 0) return;
      p.lastAct = p.act;
      p.act = i;
      p.reload = null;
      p.deploy = i === 2 ? 0.1 : 0.28;
      p.bloom = 0;
      p.triggerHeld = true;
    }

    availableSlots(p) {
      const out = [];
      if (p.slots[0]) out.push(0);
      if (p.slots[1]) out.push(1);
      out.push(2);
      if (p.items.frag > 0) out.push(3);
      return out;
    }

    startReload(p) {
      if (p.veh || p.reload) return;
      const g = p.act <= 1 ? p.slots[p.act] : null;
      if (!g) return;
      const W = D.WEAPONS[g.w];
      if (g.m >= W.mag || p.ammo[W.ammo] <= 0) return;
      p.action = null;
      p.reload = { t: 0, total: W.reload };
      this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
    }

    finishReload(p) {
      const g = p.act <= 1 ? p.slots[p.act] : null;
      p.reload = null;
      if (!g) return;
      const W = D.WEAPONS[g.w];
      if (W.shell) {
        if (p.ammo[W.ammo] > 0 && g.m < W.mag) {
          g.m++;
          p.ammo[W.ammo]--;
        }
        if (g.m < W.mag && p.ammo[W.ammo] > 0) p.reload = { t: 0, total: W.reload };
        return;
      }
      const take = Math.min(W.mag - g.m, p.ammo[W.ammo]);
      g.m += take;
      p.ammo[W.ammo] -= take;
    }

    useItem(p, item) {
      const H = D.HEALS[item];
      if (!H || p.items[item] <= 0) return;
      if (p.action && p.action.item === item) {
        p.action = null;
        return;
      }
      if (item === 'bandage' && p.hp >= H.max) {
        this.toPlayer(p, 'Bandages only heal up to ' + H.max + ' HP');
        return;
      }
      if (item === 'medkit' && p.hp >= D.MAX_HP) {
        this.toPlayer(p, 'Already at full health');
        return;
      }
      if (item === 'soda' && p.boost >= 100) {
        this.toPlayer(p, 'Boost already full');
        return;
      }
      p.reload = null;
      p.action = { item, t: 0, total: H.time };
    }

    autoHeal(p) {
      if (p.hp < 55 && p.items.medkit > 0) this.useItem(p, 'medkit');
      else if (p.hp < 75 && p.items.bandage > 0) this.useItem(p, 'bandage');
      else if (p.boost < 50 && p.items.soda > 0) this.useItem(p, 'soda');
      else if (p.hp < 100 && p.items.medkit > 0) this.useItem(p, 'medkit');
      else this.toPlayer(p, 'Nothing to use');
    }

    finishAction(p) {
      const a = p.action;
      p.action = null;
      if (!a || p.items[a.item] <= 0) return;
      const H = D.HEALS[a.item];
      p.items[a.item]--;
      if (a.item === 'bandage') p.hp = Math.max(p.hp, Math.min(H.max, p.hp + H.heal));
      else if (a.item === 'medkit') p.hp = D.MAX_HP;
      else if (a.item === 'soda') p.boost = Math.min(100, p.boost + H.boost);
      this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
    }

    handleAction(p, act) {
      switch (act.a) {
        case 'slot':
          this.switchSlot(p, act.i);
          break;
        case 'swap': {
          const av = this.availableSlots(p);
          if (av.indexOf(p.lastAct) >= 0 && p.lastAct !== p.act) this.switchSlot(p, p.lastAct);
          else {
            const other = av.find(s => s !== p.act && s <= 1);
            if (other != null) this.switchSlot(p, other);
          }
          break;
        }
        case 'cycle': {
          const av = this.availableSlots(p);
          const idx = av.indexOf(p.act);
          const dir = act.i < 0 ? -1 : 1;
          this.switchSlot(p, av[(idx + dir + av.length) % av.length]);
          break;
        }
        case 'reload':
          this.startReload(p);
          break;
        case 'interact':
          this.interact(p);
          break;
        case 'use':
          if (act.item) this.useItem(p, act.item);
          break;
        case 'autoheal':
          this.autoHeal(p);
          break;
        case 'scope': {
          const dir = act.i < 0 ? -1 : 1;
          let s = p.scope;
          for (let k = 0; k < 4; k++) {
            s = (s + dir + 4) % 4;
            if (p.scopes[s]) break;
          }
          p.scope = s;
          break;
        }
        case 'cancel':
          p.action = null;
          p.reload = null;
          break;
      }
    }

    inWater(x, y) {
      const rv = this.river;
      if (!rv) return false;
      const bb = rv.bb;
      if (x < bb[0] || y < bb[1] || x > bb[2] || y > bb[3]) return false;
      if (polyDist(x, y, rv.pts) > rv.w / 2) return false;
      for (const b of this.bridges) {
        const dx = x - b.x;
        const dy = y - b.y;
        const c = Math.cos(b.a);
        const s = Math.sin(b.a);
        const lx = dx * c + dy * s;
        const ly = -dx * s + dy * c;
        if (Math.abs(lx) < b.len / 2 && Math.abs(ly) < b.w / 2) return false;
      }
      return true;
    }

    blockedAt(x, y, r) {
      const q = this.grid.query(x - r, y - r, x + r, y + r, this._q2);
      let hit = false;
      for (const o of q) {
        if (!o.solid || o.dead) continue;
        if (circleHitsObstacle(x, y, r, o)) {
          hit = true;
          break;
        }
      }
      q.length = 0;
      if (!hit) {
        for (const v of this.vehicles) {
          if (v.dead) continue;
          const m = D.VEHICLES[v.t].r + r;
          if ((v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) < m * m) {
            hit = true;
            break;
          }
        }
      }
      return hit;
    }

    inBushAt(x, y) {
      const q = this.grid.query(x - 60, y - 60, x + 60, y + 60, this._q2);
      let hit = false;
      for (const o of q) {
        if (o.k !== 'bush' || o.dead) continue;
        const dx = x - o.x;
        const dy = y - o.y;
        if (dx * dx + dy * dy < o.r * o.r) {
          hit = true;
          break;
        }
      }
      q.length = 0;
      return hit;
    }

    losBlocked(x0, y0, x1, y1, wallsOnly) {
      const q = this.grid.query(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), this._q2);
      let hit = false;
      for (const o of q) {
        if (!o.blk || o.dead) continue;
        if (wallsOnly && o.k !== 'wall') continue;
        if (obstacleSegT(o, x0, y0, x1, y1) >= 0) {
          hit = true;
          break;
        }
      }
      q.length = 0;
      return hit;
    }

    resolvePlayer(p) {
      const S = this.size;
      for (let iter = 0; iter < 2; iter++) {
        const q = this.grid.query(p.x - PR - 4, p.y - PR - 4, p.x + PR + 4, p.y + PR + 4, this._q);
        for (const o of q) {
          if (!o.solid || o.dead) continue;
          pushOut(p, PR, o);
        }
        q.length = 0;
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const m = D.VEHICLES[v.t].r + PR;
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < m * m) {
          const d = Math.sqrt(d2) || 1;
          p.x = v.x + (dx / d) * m;
          p.y = v.y + (dy / d) * m;
        }
      }
      p.x = clamp(p.x, PR, S - PR);
      p.y = clamp(p.y, PR, S - PR);
    }

    updatePlayer(p, dt) {
      if (!p.alive) return;
      for (const act of p.actions) this.handleAction(p, act);
      p.actions.length = 0;
      if (!p.alive) return;
      const inp = p.input;
      if (!p.veh) p.a = inp.aim;
      p.inWater = this.inWater(p.x, p.y);
      p.inBush = this.inBushAt(p.x, p.y);
      if (p.swingT > 0) p.swingT -= dt;

      if (!p.veh) {
        let mx = inp.mx;
        let my = inp.my;
        const ml = Math.hypot(mx, my);
        if (ml > 1) {
          mx /= ml;
          my /= ml;
        }
        let speed = D.PLAYER_SPEED;
        const g = p.act <= 1 ? p.slots[p.act] : null;
        if (g) speed *= D.WEAPONS[g.w].move;
        if (p.action) speed *= 0.55;
        if (p.boost >= 50) speed *= 1.08;
        if (p.inWater) speed *= 0.6;
        if (this.time - p.lastShot < 0.25) speed *= 0.9;
        const k = Math.min(1, dt * 14);
        p.vx += (mx * speed - p.vx) * k;
        p.vy += (my * speed - p.vy) * k;
        p.x += (p.vx + p.kx) * dt;
        p.y += (p.vy + p.ky) * dt;
        const kd = Math.exp(-6 * dt);
        p.kx *= kd;
        p.ky *= kd;
        this.resolvePlayer(p);
      }

      p.cool -= dt;
      p.deploy -= dt;
      const g = p.act <= 1 ? p.slots[p.act] : null;
      if (g) p.bloom = Math.max(0, p.bloom - dt * 6);
      if (p.reload) {
        p.reload.t += dt;
        if (p.reload.t >= p.reload.total) this.finishReload(p);
      }
      if (p.action) {
        p.action.t += dt;
        if (p.action.t >= p.action.total) this.finishAction(p);
      }
      if (!inp.shoot) p.triggerHeld = false;
      if (inp.shoot && !p.veh) {
        if (p.act <= 1) this.fireGun(p);
        else if (p.act === 2) this.swingMelee(p);
        else if (p.act === 3) this.throwFrag(p);
      }

      if (!p.veh) {
        const q = this.lootGrid.query(p.x - PR - 30, p.y - PR - 30, p.x + PR + 30, p.y + PR + 30, this._q);
        const near = q.slice();
        q.length = 0;
        for (const l of near) {
          const m = PR + D.LOOT_R;
          if ((l.x - p.x) * (l.x - p.x) + (l.y - p.y) * (l.y - p.y) < m * m) this.tryPickup(p, l, false);
        }
      }

      const z = this.zone;
      if (this.state === 'playing' && Math.hypot(p.x - z.x, p.y - z.y) > z.r) {
        this.damagePlayer(p, z.dps * dt, 0, 'fog', false);
        if (!p.alive) return;
      }

      if (p.boost > 0) {
        p.boost = Math.max(0, p.boost - 1.5 * dt);
        const regen = p.boost >= 50 ? 1.5 : 1;
        p.hp = Math.min(D.MAX_HP, p.hp + regen * dt);
      }
    }

    fireGun(p) {
      const g = p.slots[p.act];
      if (!g) return;
      const W = D.WEAPONS[g.w];
      if (p.cool > 0 || p.deploy > 0) return;
      if (p.reload) {
        if (W.shell && g.m > 0) p.reload = null;
        else return;
      }
      if (g.m <= 0) {
        if (p.ammo[W.ammo] > 0) this.startReload(p);
        else if (!p.triggerHeld) this.toPlayer(p, 'Out of ' + D.AMMO[W.ammo].name + ' ammo');
        p.triggerHeld = true;
        p.cool = 0.25;
        return;
      }
      p.action = null;
      g.m--;
      p.cool = W.delay;
      p.lastShot = this.time;
      const moving = Math.hypot(p.vx, p.vy) > 40;
      const spread = (W.spread * (moving ? 1.5 : 1) + p.bloom) * DEG;
      for (let i = 0; i < W.pellets; i++) {
        const ang = p.a + (this.rng() * 2 - 1) * spread;
        const sv = W.pellets > 1 ? 0.88 + this.rng() * 0.24 : 1;
        const rv = W.pellets > 1 ? 0.8 + this.rng() * 0.35 : 1;
        this.bullets.push({ id: this.nextId++, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), sp: W.speed * sv, range: W.range * rv, trav: 0, dmg: W.dmg, owner: p.id, w: g.w });
      }
      p.bloom = Math.min(W.maxBloom, p.bloom + W.recoil);
      this.ev({ e: 'shot', i: p.id, x: p.x, y: p.y, a: p.a, w: g.w });
      if (g.m === 0 && p.ammo[W.ammo] > 0) {
        p.reload = { t: -W.delay, total: W.reload };
        this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
      }
    }

    swingMelee(p) {
      if (p.cool > 0 || p.deploy > 0) return;
      const M = D.MELEE[p.slots[2].w];
      p.cool = M.delay;
      p.swingT = 0.22;
      p.swingSide = -p.swingSide;
      p.action = null;
      this.ev({ e: 'swing', i: p.id, x: p.x, y: p.y, w: p.slots[2].w });
      let best = null;
      let bd = Infinity;
      for (const q of this.players) {
        if (q === p || !q.alive || q.veh) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > PR * 2 + M.range) continue;
        if (Math.abs(angleDiff(p.a, Math.atan2(dy, dx))) > 0.95) continue;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      const hx = p.x + Math.cos(p.a) * (PR + M.range * 0.55);
      const hy = p.y + Math.sin(p.a) * (PR + M.range * 0.55);
      if (best) {
        this.damagePlayer(best, M.dmg, p.id, p.slots[2].w, true);
        this.ev({ e: 'hit', x: (best.x + p.x) / 2, y: (best.y + p.y) / 2, ty: 'p', by: p.id });
        const n = Math.max(1, bd);
        best.kx += ((best.x - p.x) / n) * 70;
        best.ky += ((best.y - p.y) / n) * 70;
        return;
      }
      const q = this.grid.query(hx - 30, hy - 30, hx + 30, hy + 30, this._q);
      let target = null;
      for (const o of q) {
        if (o.dead || !o.mhp) continue;
        if (circleHitsObstacle(hx, hy, 24, o)) {
          target = o;
          break;
        }
      }
      q.length = 0;
      if (target) {
        this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: target.k, by: p.id });
        this.damageObstacle(target, M.dmg * M.obj, p.id);
        return;
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        if (Math.hypot(v.x - hx, v.y - hy) < D.VEHICLES[v.t].r + 10) {
          this.damageVehicle(v, M.dmg * 0.5, p.id);
          this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: p.id });
          return;
        }
      }
    }

    throwFrag(p) {
      if (p.triggerHeld) return;
      p.triggerHeld = true;
      if (p.cool > 0 || p.deploy > 0 || p.items.frag <= 0) return;
      p.items.frag--;
      p.cool = 0.7;
      p.action = null;
      const dist = clamp(p.input.aimDist, 60, D.FRAG.maxThrow);
      const k = 2.2;
      const v0 = dist * k;
      const sx = p.x + Math.cos(p.a) * (PR + 6);
      const sy = p.y + Math.sin(p.a) * (PR + 6);
      this.grenades.push({ id: this.nextId++, x: sx, y: sy, vx: Math.cos(p.a) * v0, vy: Math.sin(p.a) * v0, fuse: D.FRAG.fuse, t: 0, owner: p.id });
      this.ev({ e: 'throw', i: p.id, x: p.x, y: p.y });
      if (p.items.frag <= 0) {
        const back = p.lastAct !== 3 ? p.lastAct : 2;
        if (back <= 1 && !p.slots[back]) this.switchSlot(p, 2);
        else this.switchSlot(p, back);
      }
    }

    damagePlayer(p, amt, src, cause, armor) {
      if (!p.alive || amt <= 0) return;
      if (armor) amt *= (1 - D.VEST[p.vest]) * (1 - D.HELMET[p.helmet]);
      p.hp -= amt;
      p.hitT = this.time;
      const att = src ? this.playerMap.get(src) : null;
      if (att && att !== p) {
        att.dmgDealt += amt;
        p.lastAttacker = src;
      }
      this.ev({ e: 'dmg', i: p.id, x: p.x, y: p.y, by: src, n: Math.round(amt) });
      if (p.hp <= 0) this.killPlayer(p, src, cause);
    }

    killPlayer(p, src, cause) {
      if (!p.alive) return;
      p.hp = 0;
      p.alive = false;
      p.deadT = this.time;
      p.action = null;
      p.reload = null;
      if (p.veh) this.exitVehicle(p);
      let alive = 0;
      for (const q of this.players) if (q.alive) alive++;
      p.placement = alive + 1;
      for (let i = 0; i < 2; i++) {
        const g = p.slots[i];
        if (g) this.scatterDrop(p, 'gun', g.w, 1, { m: g.m });
      }
      if (p.slots[2].w !== 'fists') this.scatterDrop(p, 'melee', p.slots[2].w, 1);
      for (const t in p.ammo) if (p.ammo[t] > 0) this.scatterDrop(p, 'ammo', t, p.ammo[t]);
      for (const t in D.HEALS) if (p.items[t] > 0) this.scatterDrop(p, 'heal', t, p.items[t]);
      if (p.items.frag > 0) this.scatterDrop(p, 'frag', 'frag', p.items.frag);
      if (p.vest) this.scatterDrop(p, 'vest', p.vest, 1);
      if (p.helmet) this.scatterDrop(p, 'helmet', p.helmet, 1);
      if (p.pack) this.scatterDrop(p, 'pack', p.pack, 1);
      for (let s = 1; s < 4; s++) if (p.scopes[s]) this.scatterDrop(p, 'scope', s, 1);
      p.slots = [null, null, { w: 'fists' }, null];
      p.act = 2;
      const killer = src ? this.playerMap.get(src) : null;
      if (killer && killer !== p) {
        killer.kills++;
        p.killer = killer.name;
        p.killerId = killer.id;
      } else {
        p.killer = cause === 'fog' ? 'the red fog' : cause === 'left' ? '' : 'their own mistake';
      }
      this.ev({ e: 'kill', g: 1, k: killer && killer !== p ? killer.name : '', kid: killer ? killer.id : 0, v: p.name, vid: p.id, w: cause, x: p.x, y: p.y });
      this.checkWin();
    }

    checkWin() {
      if (this.state !== 'playing' || this.players.length < 2) return;
      let alive = 0;
      let last = null;
      for (const q of this.players) {
        if (q.alive) {
          alive++;
          last = q;
        }
      }
      if (alive <= 1) {
        this.state = 'ended';
        this.winner = last;
        if (last) last.placement = 1;
        this.ev({ e: 'win', g: 1, n: last ? last.name : '', i: last ? last.id : 0 });
      }
    }

    damageObstacle(o, dmg, src) {
      if (o.dead || !o.mhp) return;
      o.hp -= dmg;
      if (o.hp > 0) return;
      o.hp = 0;
      o.dead = true;
      this.ev({ e: 'break', x: o.x, y: o.y, k: o.k, id: o.id });
      if (o.k === 'crate') {
        const n = 1 + (this.rng() < 0.45 ? 1 : 0);
        for (let i = 0; i < n; i++) this.spawnLootRoll(o.x + (this.rng() - 0.5) * 30, o.y + (this.rng() - 0.5) * 30, 0);
      } else if (o.k === 'mcrate') {
        for (let i = 0; i < 2; i++) this.spawnLootRoll(o.x + (this.rng() - 0.5) * 40, o.y + (this.rng() - 0.5) * 40, 1);
      } else if (o.k === 'barrel') {
        this.explode(o.x, o.y, 190, 80, src, 'barrel');
      } else if (o.k === 'bush' && this.rng() < 0.15) {
        this.spawnLootRoll(o.x, o.y, 0);
      }
    }

    damageVehicle(v, dmg, src) {
      if (v.dead) return;
      v.hp -= dmg;
      if (v.hp > 0) return;
      v.dead = true;
      const drv = v.driver ? this.playerMap.get(v.driver) : null;
      if (drv) this.exitVehicle(drv);
      v.driver = 0;
      this.explode(v.x, v.y, 230, 90, src, 'explosion');
      this.ev({ e: 'break', x: v.x, y: v.y, k: 'vehicle' });
    }

    explode(x, y, radius, dmg, src, cause) {
      this.ev({ e: 'exp', x, y, r: radius });
      for (const p of this.players) {
        if (!p.alive || p.veh) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > radius + PR) continue;
        let f = 1 - Math.max(0, d - PR) / radius;
        if (this.losBlocked(x, y, p.x, p.y, true)) f *= 0.25;
        const n = Math.max(1, d);
        p.kx += ((p.x - x) / n) * 420 * f;
        p.ky += ((p.y - y) / n) * 420 * f;
        this.damagePlayer(p, dmg * f, src, cause, true);
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d > radius + 30) continue;
        const f = 1 - Math.max(0, d - 30) / radius;
        if (v.t === 'bike' && v.driver) {
          const drv = this.playerMap.get(v.driver);
          if (drv) this.damagePlayer(drv, dmg * f * 0.6, src, cause, true);
        }
        this.damageVehicle(v, dmg * f * 1.2, src);
      }
      const q = this.grid.query(x - radius, y - radius, x + radius, y + radius, []);
      for (const o of q) {
        if (o.dead || !o.mhp) continue;
        const d = Math.hypot(o.x - x, o.y - y);
        if (d > radius + (o.r || o.hw)) continue;
        const f = 1 - Math.max(0, d - (o.r || o.hw)) / radius;
        this.damageObstacle(o, dmg * f * 1.6, src);
      }
    }

    // ---------- step ----------

    step(dt) {
      this.events.length = 0;
      this.time += dt;
      this.updateZone(dt);
      for (const p of this.players) {
        if (p.bot && p.alive) this.botUpdate(p, dt);
      }
      for (const p of this.players) this.updatePlayer(p, dt);
      this.updateVehicles(dt);
      this.updateBullets(dt);
      this.updateGrenades(dt);
    }

    updateVehicles(dt) {
      const S = this.size;
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const V = D.VEHICLES[v.t];
        const drv = v.driver ? this.playerMap.get(v.driver) : null;
        if (drv && !drv.alive) v.driver = 0;
        const inp = drv && drv.alive ? drv.input : null;
        let thr = 0;
        let steer = 0;
        let brake = false;
        if (inp) {
          thr = -inp.my;
          steer = inp.mx;
          brake = inp.brake;
        }
        if (thr > 0.1) {
          if (v.sp < 0) v.sp += V.accel * 2 * dt;
          else v.sp += V.accel * thr * dt;
        } else if (thr < -0.1) {
          if (v.sp > 0) v.sp -= V.accel * 1.6 * dt;
          else v.sp -= V.accel * 0.6 * dt;
        } else {
          v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), 240 * dt);
        }
        if (brake) v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), 900 * dt);
        const water = this.inWater(v.x, v.y);
        const maxF = V.max * (water ? 0.45 : 1);
        v.sp = clamp(v.sp, -V.rev, maxF);
        if (water && v.sp > maxF) v.sp = maxF;
        const turnF = clamp(v.sp / 220, -1, 1);
        v.a += steer * V.turn * turnF * dt;
        v.x += Math.cos(v.a) * v.sp * dt;
        v.y += Math.sin(v.a) * v.sp * dt;
        const q = this.grid.query(v.x - V.r - 4, v.y - V.r - 4, v.x + V.r + 4, v.y + V.r + 4, this._q);
        for (const o of q) {
          if (!o.solid || o.dead) continue;
          const n = pushOut(v, V.r, o);
          if (!n) continue;
          const impact = Math.abs(v.sp);
          if (o.mhp && impact > 260 && (o.k === 'crate' || o.k === 'barrel' || o.k === 'mcrate')) {
            this.damageObstacle(o, impact * 0.5, v.driver);
            v.sp *= 0.7;
          } else {
            if (impact > 220) this.damageVehicle(v, (impact - 200) * 0.08, 0);
            if (impact > 120) this.ev({ e: 'crash', x: v.x, y: v.y });
            v.sp *= -0.25;
          }
        }
        q.length = 0;
        if (v.dead) continue;
        if (v.x < V.r || v.x > S - V.r || v.y < V.r || v.y > S - V.r) {
          v.x = clamp(v.x, V.r, S - V.r);
          v.y = clamp(v.y, V.r, S - V.r);
          v.sp *= -0.25;
        }
        for (const u of this.vehicles) {
          if (u === v || u.dead) continue;
          const m = V.r + D.VEHICLES[u.t].r;
          const dx = v.x - u.x;
          const dy = v.y - u.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < m * m) {
            const d = Math.sqrt(d2) || 1;
            v.x = u.x + (dx / d) * m;
            v.y = u.y + (dy / d) * m;
            const impact = Math.abs(v.sp - u.sp * Math.cos(u.a - v.a));
            if (impact > 220) {
              this.damageVehicle(v, impact * 0.04, u.driver);
              this.damageVehicle(u, impact * 0.04, v.driver);
            }
            v.sp *= -0.3;
          }
        }
        if (v.dead) continue;
        for (const p of this.players) {
          if (!p.alive || p.veh) continue;
          const m = V.r + PR;
          const dx = p.x - v.x;
          const dy = p.y - v.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= m * m) continue;
          const d = Math.sqrt(d2) || 1;
          const nx = dx / d;
          const ny = dy / d;
          const sp = Math.abs(v.sp);
          if (sp > 150 && this.time - p.ranT > 0.6) {
            p.ranT = this.time;
            p.kx += nx * sp * 0.9;
            p.ky += ny * sp * 0.9;
            this.damagePlayer(p, sp * V.ram, v.driver, 'vehicle', false);
            this.ev({ e: 'hit', x: p.x, y: p.y, ty: 'p', by: v.driver });
            v.sp *= 0.75;
          }
          p.x = v.x + nx * m;
          p.y = v.y + ny * m;
          this.resolvePlayer(p);
        }
        if (drv && drv.alive) {
          drv.x = v.x;
          drv.y = v.y;
          drv.vx = Math.cos(v.a) * v.sp;
          drv.vy = Math.sin(v.a) * v.sp;
        }
      }
      for (let i = this.vehicles.length - 1; i >= 0; i--) {
        if (this.vehicles[i].dead) this.vehicles.splice(i, 1);
      }
    }

    updateBullets(dt) {
      const out = this._q;
      for (let i = this.bullets.length - 1; i >= 0; i--) {
        const b = this.bullets[i];
        let step = b.sp * dt;
        const remain = b.range - b.trav;
        let done = false;
        if (step >= remain) {
          step = remain;
          done = true;
        }
        const x1 = b.x + b.dx * step;
        const y1 = b.y + b.dy * step;
        let bestT = 2;
        let hitObj = null;
        let hitType = 0;
        out.length = 0;
        this.grid.query(Math.min(b.x, x1) - 2, Math.min(b.y, y1) - 2, Math.max(b.x, x1) + 2, Math.max(b.y, y1) + 2, out);
        for (const o of out) {
          if (o.dead || !o.blk) continue;
          const t = obstacleSegT(o, b.x, b.y, x1, y1);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hitObj = o;
            hitType = 1;
          }
        }
        out.length = 0;
        for (const p of this.players) {
          if (!p.alive || p.id === b.owner || p.veh) continue;
          const t = segCircle(b.x, b.y, x1, y1, p.x, p.y, PR);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hitObj = p;
            hitType = 2;
          }
        }
        for (const v of this.vehicles) {
          if (v.dead || v.driver === b.owner) continue;
          const t = segCircle(b.x, b.y, x1, y1, v.x, v.y, D.VEHICLES[v.t].r * 0.9);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hitObj = v;
            hitType = 3;
          }
        }
        if (hitObj) {
          const hx = b.x + (x1 - b.x) * bestT;
          const hy = b.y + (y1 - b.y) * bestT;
          const W = D.WEAPONS[b.w];
          let dmg = b.dmg;
          if (W.fall) dmg *= 1 - W.fall * ((b.trav + step * bestT) / W.range);
          if (hitType === 1) {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: hitObj.k, by: b.owner });
            this.damageObstacle(hitObj, dmg, b.owner);
          } else if (hitType === 2) {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'p', by: b.owner });
            this.damagePlayer(hitObj, dmg, b.owner, b.w, true);
          } else {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: b.owner });
            if (hitObj.t === 'bike' && hitObj.driver) {
              const drv = this.playerMap.get(hitObj.driver);
              if (drv) this.damagePlayer(drv, dmg * 0.5, b.owner, b.w, true);
              this.damageVehicle(hitObj, dmg * 0.5, b.owner);
            } else {
              this.damageVehicle(hitObj, dmg, b.owner);
            }
          }
          this.bullets.splice(i, 1);
          continue;
        }
        b.x = x1;
        b.y = y1;
        b.trav += step;
        if (done) this.bullets.splice(i, 1);
      }
    }

    updateGrenades(dt) {
      const out = this._q;
      for (let i = this.grenades.length - 1; i >= 0; i--) {
        const g = this.grenades[i];
        g.t += dt;
        g.fuse -= dt;
        const nx = g.x + g.vx * dt;
        const ny = g.y + g.vy * dt;
        out.length = 0;
        this.grid.query(Math.min(g.x, nx) - 8, Math.min(g.y, ny) - 8, Math.max(g.x, nx) + 8, Math.max(g.y, ny) + 8, out);
        let bestT = 2;
        let hit = null;
        for (const o of out) {
          if (!o.solid || o.dead) continue;
          const t = obstacleSegT(o, g.x, g.y, nx, ny);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hit = o;
          }
        }
        out.length = 0;
        if (hit && g.t > 0.05) {
          const hx = g.x + (nx - g.x) * bestT;
          const hy = g.y + (ny - g.y) * bestT;
          let nxv;
          let nyv;
          if (hit.s === 'c') {
            const d = Math.hypot(hx - hit.x, hy - hit.y) || 1;
            nxv = (hx - hit.x) / d;
            nyv = (hy - hit.y) / d;
          } else {
            const px = Math.abs(hx - hit.x) / (hit.hw || 1);
            const py = Math.abs(hy - hit.y) / (hit.hh || 1);
            if (px > py) {
              nxv = Math.sign(hx - hit.x) || 1;
              nyv = 0;
            } else {
              nxv = 0;
              nyv = Math.sign(hy - hit.y) || 1;
            }
          }
          const dot = g.vx * nxv + g.vy * nyv;
          g.vx = (g.vx - 2 * dot * nxv) * 0.5;
          g.vy = (g.vy - 2 * dot * nyv) * 0.5;
          g.x = hx + nxv * 4;
          g.y = hy + nyv * 4;
        } else {
          g.x = clamp(nx, 5, this.size - 5);
          g.y = clamp(ny, 5, this.size - 5);
        }
        const k = Math.exp(-2.2 * dt);
        g.vx *= k;
        g.vy *= k;
        if (g.fuse <= 0) {
          this.grenades.splice(i, 1);
          this.explode(g.x, g.y, D.FRAG.radius, D.FRAG.dmg, g.owner, 'frag');
        }
      }
    }

    // ---------- bots ----------

    botWantLoot(p, l) {
      const k = l.k;
      if (k === 'gun') {
        const W = D.WEAPONS[l.it];
        if (!p.slots[0] || !p.slots[1]) return 8 + W.rarity;
        const worst = Math.min(D.WEAPONS[p.slots[0].w].rarity, D.WEAPONS[p.slots[1].w].rarity);
        return W.rarity > worst ? 3 + W.rarity - worst : 0;
      }
      if (k === 'ammo') {
        for (let i = 0; i < 2; i++) {
          const g = p.slots[i];
          if (g && D.WEAPONS[g.w].ammo === l.it && p.ammo[l.it] < D.AMMO[l.it].cap[p.pack]) return 5;
        }
        return 0;
      }
      if (k === 'heal') return p.items[l.it] < D.HEALS[l.it].cap[p.pack] ? (l.it === 'medkit' ? 5 : 3.5) : 0;
      if (k === 'frag') return p.items.frag < D.FRAG.cap[p.pack] ? 2 : 0;
      if (k === 'vest' || k === 'helmet' || k === 'pack') return l.it > p[k] ? 5 + l.it : 0;
      if (k === 'scope') return !p.scopes[l.it] ? 2 : 0;
      if (k === 'melee') return p.slots[2].w === 'fists' ? 2 : 0;
      return 0;
    }

    botDecide(p, P) {
      const ai = p.ai;
      let tgt = ai.target ? this.playerMap.get(ai.target) : null;
      if (tgt && (!tgt.alive || Math.hypot(tgt.x - p.x, tgt.y - p.y) > P.sight * 1.3)) tgt = null;
      let best = null;
      let bd = Infinity;
      const ramp = this.time < 60 ? 0.3 + 0.7 * (this.time / 60) : 1;
      for (const q of this.players) {
        if (q === p || !q.alive) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        let sight = P.sight * ramp;
        if (q.inBush && this.time - q.lastShot > 1.5) sight *= 0.35;
        if (d > sight || d >= bd) continue;
        if (this.losBlocked(p.x, p.y, q.x, q.y)) continue;
        best = q;
        bd = d;
      }
      if (best && (!tgt || bd < Math.hypot(tgt.x - p.x, tgt.y - p.y) * 0.7)) tgt = best;
      if (!tgt && p.lastAttacker && this.time - p.hitT < 2.5) {
        const a = this.playerMap.get(p.lastAttacker);
        if (a && a.alive && Math.hypot(a.x - p.x, a.y - p.y) < 1500) tgt = a;
      }
      if (tgt) {
        ai.los = !this.losBlocked(p.x, p.y, tgt.x, tgt.y);
        if (!ai.los) {
          ai.lostT += P.react;
          if (ai.lostT > 5) {
            tgt = null;
            ai.lostT = 0;
          }
        } else {
          ai.lostT = 0;
        }
      }
      ai.target = tgt ? tgt.id : 0;
      ai.aimErr = (this.rng() * 2 - 1) * P.aimNoise;

      const usable = i => {
        const g = p.slots[i];
        return g && (g.m > 0 || p.ammo[D.WEAPONS[g.w].ammo] > 0);
      };
      if (ai.throwT <= 0) {
        if (tgt) {
          const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
          let bs = -1;
          let bScore = -1;
          for (let i = 0; i < 2; i++) {
            if (!usable(i)) continue;
            const W = D.WEAPONS[p.slots[i].w];
            let s = W.rarity + 1;
            if (W.range < d * 1.05) s -= 4;
            if (p.slots[i].w === 'shotgun') s += d < 260 ? 4 : -2;
            if (p.slots[i].w === 'sniper' || p.slots[i].w === 'dmr') s += d > 450 ? 3 : -1;
            if (p.slots[i].m === 0) s -= 1.5;
            if (s > bScore) {
              bScore = s;
              bs = i;
            }
          }
          const want = bs >= 0 ? bs : 2;
          if (p.act !== want) p.actions.push({ a: 'slot', i: want });
          if (p.items.frag > 0 && !ai.los && d > 220 && d < 560 && this.time - ai.lastThrow > 8 && this.rng() < 0.25) {
            ai.throwT = 1.2;
            ai.thrown = false;
            ai.lastThrow = this.time;
            p.actions.push({ a: 'slot', i: 3 });
          }
        } else {
          if (p.act >= 2) {
            const g = usable(0) ? 0 : usable(1) ? 1 : -1;
            if (g >= 0) p.actions.push({ a: 'slot', i: g });
          }
        }
      }

      const threat = tgt && ai.los && Math.hypot(tgt.x - p.x, tgt.y - p.y) < 650;
      if (!p.action && !threat) {
        if (p.hp < 50 && p.items.medkit > 0) p.actions.push({ a: 'use', item: 'medkit' });
        else if (p.hp < 72 && p.items.bandage > 0) p.actions.push({ a: 'use', item: 'bandage' });
        else if (p.boost < 40 && p.items.soda > 0 && p.hp < 95) p.actions.push({ a: 'use', item: 'soda' });
      }
      if (!threat && !p.action && !p.reload && p.act <= 1) {
        const g = p.slots[p.act];
        if (g && g.m < D.WEAPONS[g.w].mag * 0.6) p.actions.push({ a: 'reload' });
      }

      const z = this.zone;
      const dCur = Math.hypot(p.x - z.x, p.y - z.y);
      const dTgt = Math.hypot(p.x - z.tx, p.y - z.ty);
      const urgent = z.state === 'shrink' || z.state === 'final' || z.timer < 25;
      const danger = dCur > z.r - 60 || (urgent && dTgt > z.tr * 0.9);
      if (danger && !(threat && dCur < z.r - 200)) {
        ai.mode = 'zone';
        if (!ai.goal || ai.goalKind !== 'zone' || Math.hypot(ai.goal[0] - z.tx, ai.goal[1] - z.ty) > z.tr * 0.6 + 1) {
          const a = this.rng() * TAU;
          const r = Math.sqrt(this.rng()) * z.tr * 0.5;
          ai.goal = [z.tx + Math.cos(a) * r, z.ty + Math.sin(a) * r];
          ai.goalKind = 'zone';
        }
        return;
      }
      const armed = usable(0) || usable(1);
      if (tgt && !armed) {
        const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        const provoked = p.lastAttacker === tgt.id && this.time - p.hitT < 4;
        if (d > 240 && !provoked) tgt = null;
      }
      if (tgt) {
        ai.mode = 'fight';
        return;
      }
      ai.mode = 'loot';
      let cur = ai.lootId ? this.loot.get(ai.lootId) : null;
      if (cur && this.botWantLoot(p, cur) <= 0) cur = null;
      if (!cur) {
        ai.lootId = 0;
        const q = this.lootGrid.query(p.x - 900, p.y - 900, p.x + 900, p.y + 900, []);
        let bestL = null;
        let bestS = 0;
        for (const l of q) {
          const w = this.botWantLoot(p, l);
          if (w <= 0) continue;
          if (Math.hypot(l.x - z.tx, l.y - z.ty) > z.tr && urgent) continue;
          const d = Math.hypot(l.x - p.x, l.y - p.y);
          const s = w / (1 + d / 250);
          if (s > bestS) {
            bestS = s;
            bestL = l;
          }
        }
        if (bestL) {
          ai.lootId = bestL.id;
          cur = bestL;
        }
      }
      if (cur) {
        ai.goal = [cur.x, cur.y];
        ai.goalKind = 'loot';
        ai.crateId = 0;
        const d = Math.hypot(cur.x - p.x, cur.y - p.y);
        if (d < 60 && (cur.k === 'gun' || cur.k === 'melee' || cur.k === 'vest' || cur.k === 'helmet' || cur.k === 'pack')) {
          if (cur.k === 'gun' && p.slots[0] && p.slots[1]) {
            const worst = D.WEAPONS[p.slots[0].w].rarity <= D.WEAPONS[p.slots[1].w].rarity ? 0 : 1;
            if (p.act !== worst) p.actions.push({ a: 'slot', i: worst });
            else p.actions.push({ a: 'interact' });
          } else {
            p.actions.push({ a: 'interact' });
          }
        }
        return;
      }
      let crate = ai.crateId ? this.obstacles[ai.crateId] : null;
      if (crate && crate.dead) crate = null;
      if (!crate) {
        ai.crateId = 0;
        const q = this.grid.query(p.x - 700, p.y - 700, p.x + 700, p.y + 700, []);
        let bdc = Infinity;
        for (const o of q) {
          if (o.dead || (o.k !== 'crate' && o.k !== 'mcrate')) continue;
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < bdc) {
            bdc = d;
            crate = o;
          }
        }
        if (crate) ai.crateId = crate.id;
      }
      if (crate) {
        ai.goal = [crate.x, crate.y];
        ai.goalKind = 'crate';
        return;
      }
      ai.wanderT -= P.react;
      if (!ai.goal || ai.goalKind !== 'wander' || ai.wanderT <= 0 || Math.hypot(ai.goal[0] - p.x, ai.goal[1] - p.y) < 80) {
        const a = this.rng() * TAU;
        const r = Math.sqrt(this.rng()) * Math.max(200, z.tr * 0.85);
        ai.goal = [clamp(z.tx + Math.cos(a) * r, 100, this.size - 100), clamp(z.ty + Math.sin(a) * r, 100, this.size - 100)];
        ai.goalKind = 'wander';
        ai.wanderT = 10;
      }
    }

    botSteer(p, mx, my) {
      const len = Math.hypot(mx, my);
      if (len < 1e-6) return [0, 0];
      const base = Math.atan2(my, mx);
      const offs = [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.4, -2.4];
      for (const o of offs) {
        const a = base + o * p.ai.side;
        const px = p.x + Math.cos(a) * 42;
        const py = p.y + Math.sin(a) * 42;
        if (!this.blockedAt(px, py, PR * 0.9)) return [Math.cos(a) * len, Math.sin(a) * len];
      }
      return [mx, my];
    }

    botUpdate(p, dt) {
      const ai = p.ai;
      const P = D.BOT_SKILL[this.difficulty];
      const inp = p.input;
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.t = P.react * (0.7 + 0.6 * this.rng());
        this.botDecide(p, P);
      }
      const tgt = ai.target ? this.playerMap.get(ai.target) : null;
      let mx = 0;
      let my = 0;
      if (ai.mode === 'fight' && tgt && tgt.alive) {
        const dx = tgt.x - p.x;
        const dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const g = p.act <= 1 ? p.slots[p.act] : null;
        const pref = g ? (g.w === 'shotgun' ? 150 : g.w === 'sniper' || g.w === 'dmr' ? 600 : g.w === 'pistol' || g.w === 'smg' ? 280 : 420) : 30;
        let ap = 0;
        if (!ai.los) ap = 1;
        else if (d > pref * 1.2) ap = 1;
        else if (d < pref * 0.7) ap = -0.8;
        if (p.action || (p.reload && g && g.m === 0)) ap = -1;
        ai.strafeT -= dt;
        if (ai.strafeT <= 0) {
          ai.strafeT = 0.5 + this.rng() * 1.1;
          ai.strafe = this.rng() < 0.5 ? -1 : 1;
        }
        const sf = ai.los ? 0.85 : 0.2;
        mx = ux * ap - uy * ai.strafe * sf;
        my = uy * ap + ux * ai.strafe * sf;
      } else if (ai.goal) {
        const dx = ai.goal[0] - p.x;
        const dy = ai.goal[1] - p.y;
        const d = Math.hypot(dx, dy);
        const stopAt = ai.goalKind === 'crate' ? 70 : 6;
        if (d > stopAt) {
          mx = dx / d;
          my = dy / d;
        }
      }
      if (mx || my) {
        const s = this.botSteer(p, mx, my);
        mx = s[0];
        my = s[1];
      }
      ai.stuckT -= dt;
      if (ai.stuckT <= 0) {
        const moved = Math.hypot(p.x - ai.lastX, p.y - ai.lastY);
        if (moved < 30 && (Math.abs(inp.mx) + Math.abs(inp.my)) > 0.3) {
          ai.unstuck = 0.7 + this.rng() * 0.6;
          ai.unstuckDir = this.rng() * TAU;
          ai.side = -ai.side;
          if (ai.goalKind === 'loot') ai.lootId = 0;
          if (ai.goalKind === 'crate') ai.crateId = 0;
        }
        ai.lastX = p.x;
        ai.lastY = p.y;
        ai.stuckT = 1.2;
      }
      if (ai.unstuck > 0) {
        ai.unstuck -= dt;
        mx = Math.cos(ai.unstuckDir);
        my = Math.sin(ai.unstuckDir);
      }
      inp.mx = mx;
      inp.my = my;

      let want = null;
      let shoot = false;
      if (tgt && tgt.alive && (ai.los || ai.throwT > 0)) {
        const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        const g = p.act <= 1 ? p.slots[p.act] : null;
        const sp = g ? D.WEAPONS[g.w].speed : 2000;
        const tt = (d / sp) * P.lead;
        want = Math.atan2(tgt.y + tgt.vy * tt - p.y, tgt.x + tgt.vx * tt - p.x) + ai.aimErr * (ai.throwT > 0 ? 0.3 : 1);
        const err = Math.abs(angleDiff(p.a, want));
        if (ai.throwT > 0) {
          ai.throwT -= dt;
          inp.aimDist = d;
          if (p.act === 3 && p.deploy <= 0 && !ai.thrown && err < 0.15) {
            shoot = true;
            ai.thrown = true;
          }
          if (p.act !== 3 && ai.throwT < 0.7) ai.throwT = 0;
        } else if (g) {
          const W = D.WEAPONS[g.w];
          shoot = err < P.shootAngle + (W.pellets > 1 ? 0.08 : 0) && d < W.range * 0.92 && !p.action;
        } else if (p.act === 2) {
          shoot = d < PR * 2 + D.MELEE[p.slots[2].w].range && err < 0.5;
        }
      } else if (ai.goalKind === 'crate' && ai.crateId) {
        const o = this.obstacles[ai.crateId];
        if (o && !o.dead) {
          const d = Math.hypot(o.x - p.x, o.y - p.y);
          if (d < 140) {
            want = Math.atan2(o.y - p.y, o.x - p.x);
            const err = Math.abs(angleDiff(p.a, want));
            if (p.act === 2) shoot = d < 100 && err < 0.3;
            else if (p.act <= 1 && p.slots[p.act] && p.slots[p.act].m > 0) shoot = err < 0.2;
          }
        }
      }
      if (want == null && (mx || my)) want = Math.atan2(my, mx);
      if (want != null) {
        const diff = angleDiff(p.a, want);
        const maxTurn = P.turn * dt;
        p.a += clamp(diff, -maxTurn, maxTurn);
      }
      inp.aim = p.a;
      inp.shoot = shoot;
      if (ai.throwT <= 0 && ai.thrown) ai.thrown = false;
    }

    // ---------- views ----------

    viewHalf(p, aspect) {
      const h = D.VIEW_H[p.scope] * (p.veh ? 1.2 : 1);
      const w = h * clamp(aspect, 1, D.MAX_ASPECT);
      return [w / 2 + 160, h / 2 + 160];
    }

    activeWeapon(p) {
      if (p.act <= 1 && p.slots[p.act]) return p.slots[p.act].w;
      if (p.act === 3) return 'frag';
      return p.slots[2].w;
    }

    promptFor(p) {
      if (!p.alive) return '';
      if (p.veh) return 'Exit vehicle';
      const l = this.nearestLoot(p, D.PICKUP_RANGE);
      if (l) {
        if (l.k === 'gun' && p.slots[0] && p.slots[1]) return 'Swap for ' + itemLabel(l.k, l.it, l.c);
        return 'Pick up ' + itemLabel(l.k, l.it, l.c);
      }
      const v = this.nearestFreeVehicle(p);
      if (v) return 'Drive ' + D.VEHICLES[v.t].name;
      return '';
    }

    getMapData() {
      const r1 = v => Math.round(v * 10) / 10;
      return {
        size: this.size,
        seed: this.seed,
        river: { w: this.river.w, pts: this.river.pts.map(p => [r1(p[0]), r1(p[1])]) },
        roads: this.roads.map(r => ({ w: r.w, pts: r.pts.map(p => [r1(p[0]), r1(p[1])]) })),
        bridges: this.bridges.map(b => ({ x: r1(b.x), y: r1(b.y), a: b.a, len: b.len, w: b.w })),
        buildings: this.buildings.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, type: b.type, roof: b.roof, floor: b.floor })),
        obstacles: this.obstacles.map(o => ({ id: o.id, k: o.k, s: o.s, x: r1(o.x), y: r1(o.y), r: r1(o.r), hw: r1(o.hw), hh: r1(o.hh), cr: r1(o.cr), hp: o.hp, mhp: o.mhp, v: o.v, dead: o.dead ? 1 : 0, b: o.b }))
      };
    }

    camFor(id, spectateId) {
      const me = this.playerMap.get(id);
      if (!me) return null;
      if (!me.alive && spectateId) {
        const s = this.playerMap.get(spectateId);
        if (s) return s;
      }
      return me;
    }

    eventsFor(id, spectateId) {
      const me = this.playerMap.get(id);
      const out = [];
      if (!me) return out;
      const cam = this.camFor(id, spectateId);
      const hv = this.viewHalf(cam, me.aspect);
      const mx = hv[0] + 400;
      const my = hv[1] + 400;
      for (const e of this.events) {
        if (e.to != null) {
          if (e.to === id) out.push(e);
          continue;
        }
        if (e.g || e.i === id || e.by === id || (e.x != null && Math.abs(e.x - cam.x) < mx && Math.abs(e.y - cam.y) < my)) out.push(e);
      }
      return out;
    }

    hudData(me, full) {
      const r1 = v => Math.round(v * 10) / 10;
      return {
          id: me.id,
          alive: me.alive,
          x: r1(me.x),
          y: r1(me.y),
          hp: Math.round(me.hp * 10) / 10,
          bo: Math.round(me.boost),
          sl: me.slots.map(s => (s ? { w: s.w, m: s.m != null ? s.m : null } : null)),
          act: me.act,
          am: Object.assign({}, me.ammo),
          it: Object.assign({}, me.items),
          v: me.vest,
          h: me.helmet,
          b: me.pack,
          sc: me.scope,
          scs: me.scopes.slice(),
          rl: me.reload ? clamp(me.reload.t / me.reload.total, 0, 1) : -1,
          ac: me.action ? { item: me.action.item, p: clamp(me.action.t / me.action.total, 0, 1), tl: Math.max(0, me.action.total - me.action.t) } : null,
          k: me.kills,
          dd: Math.round(me.dmgDealt),
          veh: me.veh,
          plc: me.placement,
          killer: me.killer,
          killerId: me.killerId,
          pr: full ? this.promptFor(me) : '',
          wa: me.inWater ? 1 : 0
      };
    }

    snapshotFor(id, spectateId) {
      const me = this.playerMap.get(id);
      if (!me) return null;
      const cam = this.camFor(id, spectateId);
      const hv = this.viewHalf(cam, me.aspect);
      const x0 = cam.x - hv[0];
      const x1 = cam.x + hv[0];
      const y0 = cam.y - hv[1];
      const y1 = cam.y + hv[1];
      const inView = (x, y, m) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;
      const r1 = v => Math.round(v * 10) / 10;
      const pl = [];
      for (const q of this.players) {
        if (!inView(q.x, q.y, 60)) continue;
        if (!q.alive && (this.time - q.deadT > 300 || q.left)) continue;
        pl.push({
          i: q.id,
          x: r1(q.x),
          y: r1(q.y),
          a: Math.round(q.a * 1000) / 1000,
          w: this.activeWeapon(q),
          v: q.vest,
          h: q.helmet,
          b: q.pack,
          sk: q.skin,
          n: q.name,
          veh: q.veh,
          d: q.alive ? 0 : 1,
          ac: q.action ? 1 : 0,
          sw: q.swingT > 0 ? Math.round((q.swingT / 0.22) * q.swingSide * 100) / 100 : 0,
          hit: this.time - q.hitT < 0.12 ? 1 : 0,
          bu: q.inBush ? 1 : 0,
          hu: q.bot ? 0 : 1
        });
      }
      const bu = [];
      for (const b of this.bullets) {
        if (!inView(b.x, b.y, 200)) continue;
        bu.push({ i: b.id, x: r1(b.x), y: r1(b.y), dx: Math.round(b.dx * 1000) / 1000, dy: Math.round(b.dy * 1000) / 1000, w: b.w, tr: Math.round(b.trav) });
      }
      const gr = [];
      for (const g of this.grenades) {
        if (!inView(g.x, g.y, 50)) continue;
        const z = g.t < 0.9 ? Math.sin((g.t / 0.9) * Math.PI) : 0;
        gr.push({ i: g.id, x: r1(g.x), y: r1(g.y), z: Math.round(z * 100) / 100, f: Math.round(g.fuse * 10) / 10 });
      }
      const lo = [];
      const lq = this.lootGrid.query(x0 - 30, y0 - 30, x1 + 30, y1 + 30, []);
      for (const l of lq) lo.push({ i: l.id, x: r1(l.x), y: r1(l.y), k: l.k, it: l.it, c: l.c });
      const ve = [];
      for (const v of this.vehicles) {
        if (!inView(v.x, v.y, 100)) continue;
        ve.push({ i: v.id, t: v.t, x: r1(v.x), y: r1(v.y), a: Math.round(v.a * 1000) / 1000, hp: Math.round((v.hp / v.mhp) * 100) / 100, d: v.driver, c: v.col, sp: Math.round(v.sp) });
      }
      const ob = [];
      const oq = this.grid.query(x0, y0, x1, y1, []);
      for (const o of oq) {
        if (o.mhp && o.hp < o.mhp) ob.push([o.id, Math.round(o.hp)]);
      }
      const ev = this.eventsFor(id, spectateId);
      let alive = 0;
      for (const q of this.players) if (q.alive) alive++;
      const lb = this.players.filter(q => q.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 5).map(q => ({ n: q.name, k: q.kills, i: q.id }));
      const z = this.zone;
      return {
        t: Math.round(this.time * 1000) / 1000,
        you: id,
        cam: cam.id,
        cx: r1(cam.x),
        cy: r1(cam.y),
        csc: cam.scope,
        cveh: cam.veh ? 1 : 0,
        me: this.hudData(me, true),
        cme: cam !== me ? this.hudData(cam, false) : null,
        pl,
        bu,
        gr,
        lo,
        ve,
        ob,
        zo: { x: r1(z.x), y: r1(z.y), r: r1(z.r), tx: r1(z.tx), ty: r1(z.ty), tr: r1(z.tr), ph: z.phase, st: z.state, tl: Math.max(0, Math.round(z.timer * 10) / 10), dps: z.dps },
        al: alive,
        tot: this.players.length,
        ev,
        lb,
        st: this.state,
        win: this.winner ? this.winner.name : '',
        winId: this.winner ? this.winner.id : 0
      };
    }
  }

  const API = { Sim, itemLabel, itemRarity, clamp, angleDiff, polyDist, segCircle, segRect, mulberry32 };
  if (isNode) {
    module.exports = API;
  } else {
    globalThis.PF_SIM = API;
  }
})();
