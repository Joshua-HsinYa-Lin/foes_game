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

  // Fraction t in [0,1] where the segment first touches the circle, or -1.
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
    return t >= 0 && t <= 1 ? t : -1;
  }

  // Slab test of a segment against an axis-aligned box; fraction t or -1.
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
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    if (Math.abs(dy) < 1e-9) {
      if (y0 < miny || y0 > maxy) return -1;
    } else {
      let t1 = (miny - y0) / dy;
      let t2 = (maxy - y0) / dy;
      if (t1 > t2) {
        const s = t1;
        t1 = t2;
        t2 = s;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
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
    const dx = x - clamp(x, o.x - o.hw, o.x + o.hw);
    const dy = y - clamp(y, o.y - o.hh, o.y + o.hh);
    return dx * dx + dy * dy < r * r;
  }

  // Moves ent out of obstacle o; returns the push normal or null.
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
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
      return [dx / d, dy / d];
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
          for (const o of this.cells[j * this.n + i]) {
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

  class ItemGrid {
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
    add(it) {
      it._c = this.idx(it.x, it.y);
      this.cells[it._c].add(it);
    }
    remove(it) {
      this.cells[it._c].delete(it);
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
          for (const it of this.cells[j * n + i]) out.push(it);
        }
      }
      return out;
    }
  }

  function itemName(t) {
    if (D.WEAPONS[t]) return D.WEAPONS[t].name;
    if (t === 'syringe') return D.SYRINGE.name;
    if (t === 'medpack') return D.MEDPACK.name;
    if (t === 'backpack') return D.BACKPACK.name;
    return t;
  }

  function isGun(t) {
    return !!D.WEAPONS[t] && !D.WEAPONS[t].melee;
  }

  const RANK = { fists: 0, knife: 1, sword: 2, pistol: 3, uzi: 4, shotgun: 4, sniper: 5, rifle: 6, minigun: 6 };
  const VALID_ACTIONS = { slot: 1, cycle: 1, reload: 1, interact: 1, drop: 1, jump: 1 };

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
      this.vehicles = [];
      this.obstacles = [];
      this.buildings = [];
      this.roads = [];
      this.items = new Map();
      this.events = [];
      this.state = 'playing';
      this.winner = null;
      this.grid = new Grid(this.size, 200);
      this.itemGrid = new ItemGrid(this.size, 200);
      this._q = [];
      this._q2 = [];
      this.usedNames = new Set();
      this.closingAnnounced = false;
      this.generateMap();
      this.initZone();
    }

    ev(e) {
      this.events.push(e);
    }

    // ---------- map ----------

    generateMap() {
      const S = this.size;
      const R = this.rng;
      this.noise = [];
      this.noiseN = 10;
      for (let i = 0; i < 121; i++) this.noise.push(R());

      const towns = [];
      for (let t = 0; t < 400 && towns.length < 5; t++) {
        const x = 550 + R() * (S - 1100);
        const y = 550 + R() * (S - 1100);
        if (towns.some(v => Math.hypot(v.x - x, v.y - y) < 1150)) continue;
        towns.push({ x, y, r: 300 + R() * 150 });
      }
      this.towns = towns;

      const ROAD_W = 80;
      const edges = [];
      if (towns.length > 1) {
        const inTree = [0];
        const left = towns.map((_, i) => i).slice(1);
        while (left.length) {
          let best = null;
          for (const a of inTree) {
            for (const b of left) {
              const d = Math.hypot(towns[a].x - towns[b].x, towns[a].y - towns[b].y);
              if (!best || d < best[2]) best = [a, b, d];
            }
          }
          edges.push([best[0], best[1]]);
          inTree.push(best[1]);
          left.splice(left.indexOf(best[1]), 1);
        }
      }
      for (const [ai, bi] of edges) {
        const a = towns[ai];
        const b = towns[bi];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const L = Math.hypot(dx, dy);
        const bend = (R() - 0.5) * L * 0.25;
        const pts = [[a.x, a.y]];
        for (let i = 1; i < 5; i++) {
          const t = i / 5;
          const off = Math.sin(t * Math.PI) * bend;
          pts.push([a.x + dx * t - (dy / L) * off, a.y + dy * t + (dx / L) * off]);
        }
        pts.push([b.x, b.y]);
        this.roads.push({ w: ROAD_W, pts });
      }

      for (const v of towns) {
        const count = 3 + Math.floor(R() * 3);
        let placed = 0;
        for (let t = 0; t < 80 && placed < count; t++) {
          const ang = R() * TAU;
          const d = 110 + R() * v.r;
          const w = Math.round((240 + R() * 140) / 10) * 10;
          const h = Math.round((210 + R() * 110) / 10) * 10;
          if (this.tryBuilding(v.x + Math.cos(ang) * d, v.y + Math.sin(ang) * d, w, h)) placed++;
        }
      }
      let cabins = 0;
      for (let t = 0; t < 300 && cabins < 8; t++) {
        if (this.tryBuilding(300 + R() * (S - 600), 300 + R() * (S - 600), 220, 190)) cabins++;
      }

      let trees = 0;
      for (let t = 0; t < 9000 && trees < 430; t++) {
        const x = R() * S;
        const y = R() * S;
        const n = this.noiseAt(x, y);
        if (R() > n * n * 1.5 + 0.05) continue;
        const r = 34 + R() * 22;
        if (!this.freeSpot(x, y, r, 56, 30)) continue;
        this.addObstacle('tree', 'c', x, y, { r });
        trees++;
      }
      this.scatter('rock', 150, () => ({ r: 28 + R() * 24 }), 52);
      this.scatter('bush', 230, () => ({ r: 38 + R() * 16 }), 0);
      this.scatter('crate', 90, () => ({ hw: 30, hh: 30 }), 46);

      let n = 0;
      for (let t = 0; t < 2000 && n < 75; t++) {
        const x = 80 + R() * (S - 160);
        const y = 80 + R() * (S - 160);
        if (this.blockedAt(x, y, 26) || this.insideBuilding(x, y, 0)) continue;
        this.spawnItem(x, y, this.rollItem(0));
        n++;
      }

      const vtypes = ['car', 'car', 'car', 'car', 'car', 'bike', 'bike', 'bike', 'bike'];
      for (const vt of vtypes) {
        for (let t = 0; t < 60 && this.roads.length; t++) {
          const road = this.roads[Math.floor(R() * this.roads.length)];
          const i = Math.floor(R() * (road.pts.length - 1));
          const a = road.pts[i];
          const b = road.pts[i + 1];
          const f = R();
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]) + (R() < 0.5 ? Math.PI : 0);
          const x = a[0] + (b[0] - a[0]) * f;
          const y = a[1] + (b[1] - a[1]) * f;
          if (x < 150 || y < 150 || x > S - 150 || y > S - 150) continue;
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
      const w = n + 1;
      const g = this.noise;
      const top = g[iy * w + ix] + (g[iy * w + ix + 1] - g[iy * w + ix]) * tx;
      const bot = g[(iy + 1) * w + ix] + (g[(iy + 1) * w + ix + 1] - g[(iy + 1) * w + ix]) * tx;
      return top + (bot - top) * ty;
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
      if (this.nearRoad(x, y, r + 12)) return false;
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

    scatter(kind, count, shapeFn, gap) {
      let n = 0;
      for (let t = 0; t < count * 8 && n < count; t++) {
        const x = this.rng() * this.size;
        const y = this.rng() * this.size;
        const sh = shapeFn();
        const r = sh.r || sh.hw * 1.42;
        if (!this.freeSpot(x, y, r, gap, 40)) continue;
        this.addObstacle(kind, sh.r ? 'c' : 'r', x, y, sh);
        n++;
      }
    }

    addObstacle(kind, shape, x, y, sh) {
      const def = D.OBST[kind];
      const o = { id: this.obstacles.length, k: kind, s: shape, x, y, r: sh.r || 0, hw: sh.hw || 0, hh: sh.hh || 0, hp: def.hp, mhp: def.hp, solid: def.solid, blk: def.blk, dead: false, v: Math.floor(this.rng() * 1000), b: sh.b != null ? sh.b : -1, _s: 0 };
      this.obstacles.push(o);
      this.grid.insert(o);
      return o;
    }

    tryBuilding(x, y, w, h) {
      const S = this.size;
      x = Math.round(x);
      y = Math.round(y);
      if (x - w / 2 < 120 || y - h / 2 < 120 || x + w / 2 > S - 120 || y + h / 2 > S - 120) return false;
      if (this.rectHitsRoads(x - w / 2 - 60, y - h / 2 - 60, x + w / 2 + 60, y + h / 2 + 60)) return false;
      for (const b of this.buildings) {
        if (Math.abs(b.x - x) < (b.w + w) / 2 + 90 && Math.abs(b.y - y) < (b.h + h) / 2 + 90) return false;
      }
      const q = this.grid.query(x - w / 2 - 40, y - h / 2 - 40, x + w / 2 + 40, y + h / 2 + 40, this._q);
      const blocked = q.length > 0;
      q.length = 0;
      if (blocked) return false;
      this.addBuilding(x, y, w, h);
      return true;
    }

    addBuilding(x, y, w, h) {
      const R = this.rng;
      const b = { id: this.buildings.length, x, y, w, h, roof: Math.floor(R() * D.ROOFS.length), floor: Math.floor(R() * D.FLOORS.length) };
      this.buildings.push(b);
      const T = 16;
      const door = 80;
      const doorSides = new Set();
      doorSides.add(Math.floor(R() * 4));
      if (R() < 0.6) doorSides.add(Math.floor(R() * 4));
      const x0 = x - w / 2;
      const x1 = x + w / 2;
      const y0 = y - h / 2;
      const y1 = y + h / 2;
      const seg = (horizontal, lo, hi, fixed) => {
        if (hi - lo < 2) return;
        if (horizontal) this.addObstacle('wall', 'r', (lo + hi) / 2, fixed, { hw: (hi - lo) / 2, hh: T / 2, b: b.id });
        else this.addObstacle('wall', 'r', fixed, (lo + hi) / 2, { hw: T / 2, hh: (hi - lo) / 2, b: b.id });
      };
      for (let side = 0; side < 4; side++) {
        const horizontal = side === 0 || side === 2;
        const lo = horizontal ? x0 : y0 + T;
        const hi = horizontal ? x1 : y1 - T;
        const fixed = side === 0 ? y0 + T / 2 : side === 2 ? y1 - T / 2 : side === 1 ? x1 - T / 2 : x0 + T / 2;
        if (doorSides.has(side)) {
          const dc = lo + 40 + door / 2 + R() * (hi - lo - 80 - door);
          seg(horizontal, lo, dc - door / 2, fixed);
          seg(horizontal, dc + door / 2, hi, fixed);
        } else {
          seg(horizontal, lo, hi, fixed);
        }
      }
      const ix0 = x0 + T + 40;
      const iy0 = y0 + T + 40;
      const ix1 = x1 - T - 40;
      const iy1 = y1 - T - 40;
      if (R() < 0.7) {
        const cx = R() < 0.5 ? ix0 : ix1;
        const cy = R() < 0.5 ? iy0 : iy1;
        if (!this.blockedAt(cx, cy, 32)) this.addObstacle('crate', 'r', cx, cy, { hw: 30, hh: 30 });
      }
      const nloot = 2 + Math.floor(R() * 2);
      for (let i = 0; i < nloot; i++) {
        for (let t = 0; t < 10; t++) {
          const lx = ix0 + R() * (ix1 - ix0);
          const ly = iy0 + R() * (iy1 - iy0);
          if (this.blockedAt(lx, ly, 26)) continue;
          this.spawnItem(lx, ly, this.rollItem(0));
          break;
        }
      }
    }

    // ---------- items ----------

    rollItem(tier) {
      let total = 0;
      for (const e of D.LOOT) total += e[1 + tier];
      let r = this.rng() * total;
      for (const e of D.LOOT) {
        r -= e[1 + tier];
        if (r <= 0) return e[0];
      }
      return D.LOOT[0][0];
    }

    spawnItem(x, y, t, m, by) {
      const it = { id: this.nextId++, x: clamp(x, 30, this.size - 30), y: clamp(y, 30, this.size - 30), t, m: m != null ? m : isGun(t) ? D.WEAPONS[t].mag : null, by: by || 0, bt: this.time, _c: 0 };
      const q = this.grid.query(it.x - 60, it.y - 60, it.x + 60, it.y + 60, this._q2);
      for (const o of q) {
        if (o.solid && !o.dead) pushOut(it, D.ITEM_R, o);
      }
      q.length = 0;
      this.items.set(it.id, it);
      this.itemGrid.add(it);
      return it;
    }

    removeItem(it) {
      if (!this.items.has(it.id)) return;
      this.items.delete(it.id);
      this.itemGrid.remove(it);
    }

    dropNear(p, t, m) {
      const a = this.rng() * TAU;
      const d = 15 + this.rng() * 40;
      return this.spawnItem(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, t, m, p.id);
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
      const cx = S / 2 + (this.rng() - 0.5) * S * 0.25;
      const cy = S / 2 + (this.rng() - 0.5) * S * 0.25;
      let r0 = 0;
      for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) r0 = Math.max(r0, Math.hypot(x - cx, y - cy));
      r0 += 40;
      this.zone = { x: cx, y: cy, r: r0, r0, tr: r0, dps: D.ZONE.dps };
    }

    updateZone(dt) {
      const z = this.zone;
      const Z = D.ZONE;
      let alive = 0;
      for (const p of this.players) if (p.alive) alive++;
      const total = Math.max(1, this.players.length);
      const byPlayers = total > 1 ? z.r0 * Math.max(Z.minFrac, Math.pow(alive / total, 0.35)) : z.r0;
      let byTime = z.r0;
      if (this.time > Z.timeStart) byTime = z.r0 * Math.max(0, 1 - (this.time - Z.timeStart) / Z.timeDur);
      z.tr = Math.min(byPlayers, byTime);
      if (z.r > z.tr) z.r = Math.max(z.tr, z.r - Z.speed * dt);
      if (!this.closingAnnounced && this.time > Z.timeStart) {
        this.closingAnnounced = true;
        this.ev({ e: 'msg', g: 1, txt: 'The red zone is closing in!' });
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
        stamina: 100,
        sprintT: -10,
        jumpT: 0,
        jumpCool: 0,
        jx: 0,
        jy: 0,
        alive: true,
        slots: [null, null, null],
        nslots: D.SLOTS,
        act: 0,
        cool: 0,
        deploy: 0,
        reload: null,
        inject: null,
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
        inBush: false,
        aspect: 16 / 9,
        input: { mx: 0, my: 0, aim: 0, shoot: false, sprint: false, brake: false },
        actions: [],
        triggerHeld: false,
        ai: null
      };
      if (isBot) {
        p.ai = { t: this.rng() * 0.5, target: 0, goal: null, goalKind: '', mode: 'loot', strafe: 1, strafeT: 0, stuckT: 1, lastX: 0, lastY: 0, unstuck: 0, unstuckDir: 0, aimErr: 0, los: false, lostT: 0, side: this.rng() < 0.5 ? 1 : -1, itemId: 0, crateId: 0, wanderT: 0, heal: false };
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
        const x = 150 + this.rng() * (S - 300);
        const y = 150 + this.rng() * (S - 300);
        if (this.blockedAt(x, y, PR + 6)) continue;
        let md = 99999;
        for (const q of this.players) {
          if (q.alive) md = Math.min(md, Math.hypot(q.x - x, q.y - y));
        }
        if (md > 600) {
          bx = x;
          by = y;
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
      i.sprint = !!inp.sprint;
      i.brake = !!inp.brake;
    }

    pushAction(id, act) {
      const p = this.playerMap.get(id);
      if (!p || !act || !VALID_ACTIONS[act.a] || p.actions.length > 12) return;
      const a = { a: act.a };
      if (act.i != null) a.i = clamp(Math.floor(Number(act.i) || 0), -1, 2);
      p.actions.push(a);
    }

    setAspect(id, aspect) {
      const p = this.playerMap.get(id);
      if (p) p.aspect = clamp(Number(aspect) || 1.7, 0.5, 4);
    }

    activeType(p) {
      const s = p.slots[p.act];
      return s ? s.t : 'fists';
    }

    toPlayer(p, txt, ok) {
      this.ev({ e: 'pick', to: p.id, txt, ok: ok ? 1 : 0 });
    }

    // Weapons and syringes go into the held slot if it is empty, then any empty slot,
    // otherwise they replace the held item, which is dropped.
    tryPickup(p, it, manual) {
      if (it.t === 'medpack') {
        if (p.hp >= D.MAX_HP) {
          if (manual) this.toPlayer(p, 'Already at full health');
          return false;
        }
        p.hp = Math.min(D.MAX_HP, p.hp + D.MEDPACK.heal);
        this.removeItem(it);
        this.toPlayer(p, '+' + D.MEDPACK.heal + ' health', true);
        this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
        return true;
      }
      if (it.t === 'backpack') {
        if (p.nslots >= D.SLOTS_BACKPACK) {
          if (manual) this.toPlayer(p, 'You already have a backpack');
          return false;
        }
        p.nslots = D.SLOTS_BACKPACK;
        this.removeItem(it);
        this.toPlayer(p, 'Backpack: 3 slots', true);
        return true;
      }
      if (!manual) return false;
      let slot = p.act;
      if (p.slots[slot]) {
        for (let i = 0; i < p.nslots; i++) {
          if (!p.slots[i]) {
            slot = i;
            break;
          }
        }
      }
      const old = p.slots[slot];
      this.removeItem(it);
      if (old) this.dropNear(p, old.t, old.m);
      p.slots[slot] = isGun(it.t) ? { t: it.t, m: it.m != null ? it.m : D.WEAPONS[it.t].mag } : { t: it.t };
      if (slot === p.act) {
        p.reload = null;
        p.inject = null;
        p.deploy = 0.25;
      }
      this.toPlayer(p, itemName(it.t), true);
      return true;
    }

    nearestItem(p, range) {
      const q = this.itemGrid.query(p.x - range, p.y - range, p.x + range, p.y + range, this._q2);
      let best = null;
      let bd = range * range;
      for (const it of q) {
        const d = (it.x - p.x) * (it.x - p.x) + (it.y - p.y) * (it.y - p.y);
        if (d < bd) {
          bd = d;
          best = it;
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
      const tg = this.interactTarget(p);
      if (tg && tg.item) this.tryPickup(p, tg.item, true);
      else if (tg && tg.vehicle) this.enterVehicle(p, tg.vehicle);
    }

    // An item almost underfoot wins; otherwise a vehicle in reach; otherwise any item in reach.
    interactTarget(p) {
      const it = this.nearestItem(p, D.PICKUP_RANGE);
      if (it && Math.hypot(it.x - p.x, it.y - p.y) < PR + D.ITEM_R) return { item: it };
      const v = this.nearestFreeVehicle(p);
      if (v) return { vehicle: v };
      return it ? { item: it } : null;
    }

    enterVehicle(p, v) {
      v.driver = p.id;
      p.veh = v.id;
      p.reload = null;
      p.inject = null;
      p.jumpT = 0;
      p.x = v.x;
      p.y = v.y;
      this.toPlayer(p, 'Driving ' + D.VEHICLES[v.t].name + ' - press F to get out', true);
    }

    exitVehicle(p) {
      const v = this.vehicles.find(q => q.id === p.veh);
      p.veh = 0;
      if (!v) return;
      v.driver = 0;
      const V = D.VEHICLES[v.t];
      for (const o of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
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

    selectSlot(p, i) {
      if (!Number.isInteger(i) || i < 0 || i >= p.nslots || i === p.act) return;
      p.act = i;
      p.reload = null;
      p.inject = null;
      p.deploy = 0.2;
      p.triggerHeld = true;
    }

    cycleSlot(p, dir) {
      this.selectSlot(p, (p.act + (dir < 0 ? -1 : 1) + p.nslots) % p.nslots);
    }

    dropActive(p) {
      const s = p.slots[p.act];
      if (!s || p.veh) return;
      p.slots[p.act] = null;
      p.reload = null;
      p.inject = null;
      this.dropNear(p, s.t, s.m);
      this.toPlayer(p, 'Dropped ' + itemName(s.t), false);
    }

    startReload(p) {
      const s = p.slots[p.act];
      if (!s || !isGun(s.t) || p.reload || p.veh) return;
      const W = D.WEAPONS[s.t];
      if (s.m >= W.mag) return;
      p.reload = { t: 0, total: W.reload };
      this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
    }

    jump(p) {
      if (p.veh || p.jumpCool > 0 || p.inject) return;
      let dx = p.input.mx;
      let dy = p.input.my;
      const l = Math.hypot(dx, dy);
      if (l < 0.1) {
        dx = Math.cos(p.a);
        dy = Math.sin(p.a);
      } else {
        dx /= l;
        dy /= l;
      }
      p.jx = dx;
      p.jy = dy;
      p.jumpT = D.JUMP_TIME;
      p.jumpCool = D.JUMP_COOL;
      this.ev({ e: 'jump', i: p.id, x: p.x, y: p.y });
    }

    handleAction(p, act) {
      switch (act.a) {
        case 'slot':
          this.selectSlot(p, act.i);
          break;
        case 'cycle':
          this.cycleSlot(p, act.i);
          break;
        case 'reload':
          this.startReload(p);
          break;
        case 'interact':
          this.interact(p);
          break;
        case 'drop':
          this.dropActive(p);
          break;
        case 'jump':
          this.jump(p);
          break;
      }
    }

    blockedAt(x, y, r) {
      const q = this.grid.query(x - r, y - r, x + r, y + r, this._q2);
      let hit = false;
      for (const o of q) {
        if (o.solid && !o.dead && circleHitsObstacle(x, y, r, o)) {
          hit = true;
          break;
        }
      }
      q.length = 0;
      if (!hit) {
        for (const v of this.vehicles) {
          const m = D.VEHICLES[v.t].r + r;
          if (!v.dead && (v.x - x) * (v.x - x) + (v.y - y) * (v.y - y) < m * m) {
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
        if (o.k === 'bush' && (x - o.x) * (x - o.x) + (y - o.y) * (y - o.y) < o.r * o.r) {
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
        if (!o.blk || o.dead || (wallsOnly && o.k !== 'wall')) continue;
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
          if (o.solid && !o.dead) pushOut(p, PR, o);
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
      const inp = p.input;
      if (!p.veh) p.a = inp.aim;
      p.inBush = this.inBushAt(p.x, p.y);
      if (p.swingT > 0) p.swingT -= dt;
      p.jumpCool = Math.max(0, p.jumpCool - dt);

      if (!p.veh) {
        let mx = inp.mx;
        let my = inp.my;
        const ml = Math.hypot(mx, my);
        if (ml > 1) {
          mx /= ml;
          my /= ml;
        }
        let speed = D.SPEED;
        const t = this.activeType(p);
        if (isGun(t)) speed *= D.WEAPONS[t].move;
        if (p.inject) speed *= 0.5;
        const sprinting = inp.sprint && ml > 0.1 && p.stamina > 0 && !p.inject;
        if (sprinting) {
          speed *= D.SPRINT_MUL;
          p.stamina = Math.max(0, p.stamina - D.STAMINA_DRAIN * dt);
          p.sprintT = this.time;
        } else if (this.time - p.sprintT > 0.8) {
          p.stamina = Math.min(100, p.stamina + D.STAMINA_REGEN * dt);
        }
        let tvx = mx * speed;
        let tvy = my * speed;
        let k = Math.min(1, dt * 14);
        if (p.jumpT > 0) {
          p.jumpT -= dt;
          tvx = p.jx * D.SPEED * D.JUMP_MUL;
          tvy = p.jy * D.SPEED * D.JUMP_MUL;
          k = 1;
        }
        p.vx += (tvx - p.vx) * k;
        p.vy += (tvy - p.vy) * k;
        p.x += (p.vx + p.kx) * dt;
        p.y += (p.vy + p.ky) * dt;
        const kd = Math.exp(-6 * dt);
        p.kx *= kd;
        p.ky *= kd;
        this.resolvePlayer(p);
      }

      p.cool -= dt;
      p.deploy -= dt;
      if (p.reload) {
        p.reload.t += dt;
        if (p.reload.t >= p.reload.total) {
          const s = p.slots[p.act];
          if (s && isGun(s.t)) s.m = D.WEAPONS[s.t].mag;
          p.reload = null;
        }
      }
      if (p.inject) {
        p.inject.t += dt;
        if (p.inject.t >= p.inject.total) {
          p.inject = null;
          const s = p.slots[p.act];
          if (s && s.t === 'syringe') {
            p.slots[p.act] = null;
            p.hp = Math.min(D.MAX_HP, p.hp + D.SYRINGE.heal);
            this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
          }
        }
      }
      if (!inp.shoot) p.triggerHeld = false;
      if (inp.shoot && !p.veh && p.jumpT <= 0) {
        const t = this.activeType(p);
        if (t === 'syringe') this.useSyringe(p);
        else if (isGun(t)) this.fireGun(p);
        else this.swingMelee(p);
      }

      if (!p.veh) {
        const q = this.itemGrid.query(p.x - PR - 30, p.y - PR - 30, p.x + PR + 30, p.y + PR + 30, this._q);
        const near = q.slice();
        q.length = 0;
        for (const it of near) {
          if (it.t !== 'medpack' && it.t !== 'backpack') continue;
          const m = PR + D.ITEM_R;
          if ((it.x - p.x) * (it.x - p.x) + (it.y - p.y) * (it.y - p.y) < m * m) this.tryPickup(p, it, false);
        }
      }

      const z = this.zone;
      if (this.state === 'playing' && Math.hypot(p.x - z.x, p.y - z.y) > z.r) {
        this.damagePlayer(p, z.dps * dt, 0, 'zone', false);
      }
    }

    useSyringe(p) {
      if (p.inject || p.triggerHeld || p.deploy > 0) return;
      p.triggerHeld = true;
      if (p.hp >= D.MAX_HP) {
        this.toPlayer(p, 'Already at full health');
        return;
      }
      p.reload = null;
      p.inject = { t: 0, total: D.SYRINGE.time };
    }

    fireGun(p) {
      const s = p.slots[p.act];
      const W = D.WEAPONS[s.t];
      if (p.cool > 0 || p.deploy > 0 || p.reload) return;
      if (s.m <= 0) {
        this.startReload(p);
        return;
      }
      s.m--;
      p.cool = W.delay;
      p.lastShot = this.time;
      const moving = Math.hypot(p.vx, p.vy) > 40;
      const spread = W.spread * (moving ? 1.5 : 1) * DEG;
      for (let i = 0; i < W.pellets; i++) {
        const ang = p.a + (this.rng() * 2 - 1) * spread;
        const sv = W.pellets > 1 ? 0.88 + this.rng() * 0.24 : 1;
        const rv = W.pellets > 1 ? 0.8 + this.rng() * 0.35 : 1;
        this.bullets.push({ id: this.nextId++, x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), sp: W.speed * sv, range: W.range * rv, trav: 0, dmg: W.dmg, owner: p.id, w: s.t });
      }
      this.ev({ e: 'shot', i: p.id, x: p.x, y: p.y, a: p.a, w: s.t });
      if (s.m === 0) {
        p.reload = { t: -W.delay, total: W.reload };
        this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
      }
    }

    swingMelee(p) {
      if (p.cool > 0 || p.deploy > 0) return;
      const t = this.activeType(p);
      const M = D.WEAPONS[t];
      p.cool = M.delay;
      p.swingT = 0.22;
      p.swingSide = -p.swingSide;
      this.ev({ e: 'swing', i: p.id, x: p.x, y: p.y, w: t });
      let best = null;
      let bd = Infinity;
      for (const q of this.players) {
        if (q === p || !q.alive || q.veh) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > PR * 2 + M.range) continue;
        if (Math.abs(angleDiff(p.a, Math.atan2(dy, dx))) > M.arc) continue;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (best) {
        this.damagePlayer(best, M.dmg, p.id, t, true);
        this.ev({ e: 'hit', x: (best.x + p.x) / 2, y: (best.y + p.y) / 2, ty: 'p', by: p.id });
        const n = Math.max(1, bd);
        best.kx += ((best.x - p.x) / n) * 70;
        best.ky += ((best.y - p.y) / n) * 70;
        return;
      }
      const hx = p.x + Math.cos(p.a) * (PR + M.range * 0.55);
      const hy = p.y + Math.sin(p.a) * (PR + M.range * 0.55);
      const q = this.grid.query(hx - 30, hy - 30, hx + 30, hy + 30, this._q);
      let target = null;
      for (const o of q) {
        if (!o.dead && o.solid && circleHitsObstacle(hx, hy, 24, o)) {
          target = o;
          break;
        }
      }
      q.length = 0;
      if (target) {
        this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: target.k, by: p.id });
        this.damageObstacle(target, M.dmg * 1.5, p.id);
        return;
      }
      for (const v of this.vehicles) {
        if (!v.dead && Math.hypot(v.x - hx, v.y - hy) < D.VEHICLES[v.t].r + 10) {
          this.damageVehicle(v, M.dmg * 0.5, p.id);
          this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: p.id });
          return;
        }
      }
    }

    damagePlayer(p, amt, src, cause) {
      if (!p.alive || amt <= 0) return;
      p.hp -= amt;
      p.hitT = this.time;
      if (p.inject && cause !== 'zone') p.inject = null;
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
      p.reload = null;
      p.inject = null;
      if (p.veh) this.exitVehicle(p);
      let alive = 0;
      for (const q of this.players) if (q.alive) alive++;
      p.placement = alive + 1;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (s) this.dropNear(p, s.t, s.m);
        p.slots[i] = null;
      }
      if (p.nslots > D.SLOTS) this.dropNear(p, 'backpack');
      const killer = src ? this.playerMap.get(src) : null;
      if (killer && killer !== p) {
        killer.kills++;
        p.killer = killer.name;
        p.killerId = killer.id;
      } else {
        p.killer = cause === 'zone' ? 'the red zone' : '';
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
        this.spawnItem(o.x, o.y, this.rollItem(1));
        if (this.rng() < 0.35) this.spawnItem(o.x + 30, o.y + 10, this.rollItem(1));
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
      this.explode(v.x, v.y, 220, 85, src);
    }

    explode(x, y, radius, dmg, src) {
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
        this.damagePlayer(p, dmg * f, src, 'explosion');
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d < radius) this.damageVehicle(v, dmg * (1 - d / radius), src);
      }
      const q = this.grid.query(x - radius, y - radius, x + radius, y + radius, []);
      for (const o of q) {
        if (!o.dead && o.mhp && Math.hypot(o.x - x, o.y - y) < radius) this.damageObstacle(o, dmg, src);
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
    }

    updateVehicles(dt) {
      const S = this.size;
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const V = D.VEHICLES[v.t];
        const drv = v.driver ? this.playerMap.get(v.driver) : null;
        if (drv && !drv.alive) v.driver = 0;
        const inp = drv && drv.alive ? drv.input : null;
        const thr = inp ? -inp.my : 0;
        const steer = inp ? inp.mx : 0;
        if (thr > 0.1) {
          v.sp += (v.sp < 0 ? V.accel * 2 : V.accel * thr) * dt;
        } else if (thr < -0.1) {
          v.sp -= (v.sp > 0 ? V.accel * 1.6 : V.accel * 0.6) * dt;
        } else {
          v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), 240 * dt);
        }
        if (inp && inp.brake) v.sp -= Math.sign(v.sp) * Math.min(Math.abs(v.sp), 900 * dt);
        v.sp = clamp(v.sp, -V.rev, V.max);
        v.a += steer * V.turn * clamp(v.sp / 220, -1, 1) * dt;
        v.x += Math.cos(v.a) * v.sp * dt;
        v.y += Math.sin(v.a) * v.sp * dt;
        const q = this.grid.query(v.x - V.r - 4, v.y - V.r - 4, v.x + V.r + 4, v.y + V.r + 4, this._q);
        for (const o of q) {
          if (!o.solid || o.dead) continue;
          if (!pushOut(v, V.r, o)) continue;
          const impact = Math.abs(v.sp);
          if (o.k === 'crate' && impact > 260) {
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
            this.damagePlayer(p, sp * V.ram, v.driver, 'vehicle');
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
        let hit = null;
        let type = 0;
        out.length = 0;
        this.grid.query(Math.min(b.x, x1) - 2, Math.min(b.y, y1) - 2, Math.max(b.x, x1) + 2, Math.max(b.y, y1) + 2, out);
        for (const o of out) {
          if (o.dead || !o.blk) continue;
          const t = obstacleSegT(o, b.x, b.y, x1, y1);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hit = o;
            type = 1;
          }
        }
        out.length = 0;
        for (const p of this.players) {
          if (!p.alive || p.id === b.owner || p.veh) continue;
          const t = segCircle(b.x, b.y, x1, y1, p.x, p.y, PR);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hit = p;
            type = 2;
          }
        }
        for (const v of this.vehicles) {
          if (v.dead || v.driver === b.owner) continue;
          const t = segCircle(b.x, b.y, x1, y1, v.x, v.y, D.VEHICLES[v.t].r * 0.9);
          if (t >= 0 && t < bestT) {
            bestT = t;
            hit = v;
            type = 3;
          }
        }
        if (hit) {
          const hx = b.x + (x1 - b.x) * bestT;
          const hy = b.y + (y1 - b.y) * bestT;
          let dmg = b.dmg;
          if (b.w === 'shotgun') dmg *= 1 - 0.55 * ((b.trav + step * bestT) / D.WEAPONS.shotgun.range);
          if (type === 1) {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: hit.k, by: b.owner });
            this.damageObstacle(hit, dmg, b.owner);
          } else if (type === 2) {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'p', by: b.owner });
            this.damagePlayer(hit, dmg, b.owner, b.w);
          } else {
            this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: b.owner });
            if (hit.t === 'bike' && hit.driver) {
              const drv = this.playerMap.get(hit.driver);
              if (drv) this.damagePlayer(drv, dmg * 0.5, b.owner, b.w);
              this.damageVehicle(hit, dmg * 0.5, b.owner);
            } else {
              this.damageVehicle(hit, dmg, b.owner);
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

    // ---------- bots ----------

    worstWeaponSlot(p) {
      let worst = -1;
      let wr = Infinity;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (!s || s.t === 'syringe') continue;
        if (RANK[s.t] < wr) {
          wr = RANK[s.t];
          worst = i;
        }
      }
      return worst;
    }

    hasEmptySlot(p) {
      for (let i = 0; i < p.nslots; i++) if (!p.slots[i]) return true;
      return false;
    }

    countType(p, t) {
      let n = 0;
      for (let i = 0; i < p.nslots; i++) if (p.slots[i] && p.slots[i].t === t) n++;
      return n;
    }

    botWant(p, it) {
      if (it.t === 'medpack') return p.hp < 85 ? 2 + 7 * (1 - p.hp / 100) : 0;
      if (it.t === 'backpack') return p.nslots < D.SLOTS_BACKPACK ? 6 : 0;
      if (it.t === 'syringe') return this.hasEmptySlot(p) && this.countType(p, 'syringe') < 2 && this.countType(p, 'syringe') < p.nslots - 1 ? 4 : 0;
      const r = RANK[it.t] || 0;
      let weapons = 0;
      for (let i = 0; i < p.nslots; i++) if (p.slots[i] && p.slots[i].t !== 'syringe') weapons++;
      if (this.hasEmptySlot(p) && weapons < 2) return 6 + r;
      const w = this.worstWeaponSlot(p);
      if (w < 0) return 0;
      const wr = RANK[p.slots[w].t];
      return r > wr + 1 ? 3 + r - wr : 0;
    }

    botDecide(p, P) {
      const ai = p.ai;
      let tgt = ai.target ? this.playerMap.get(ai.target) : null;
      if (tgt && (!tgt.alive || Math.hypot(tgt.x - p.x, tgt.y - p.y) > P.sight * 1.3)) tgt = null;
      const ramp = this.time < 75 ? 0.15 + 0.85 * (this.time / 75) : 1;
      let best = null;
      let bd = Infinity;
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
        if (a && a.alive && Math.hypot(a.x - p.x, a.y - p.y) < 1400) tgt = a;
      }
      let gunSlot = -1;
      let gunRank = -1;
      let meleeSlot = -1;
      let meleeRank = 0;
      let syrSlot = -1;
      let emptySlot = -1;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (!s) {
          if (emptySlot < 0) emptySlot = i;
        } else if (s.t === 'syringe') {
          if (syrSlot < 0) syrSlot = i;
        } else if (isGun(s.t)) {
          if (RANK[s.t] > gunRank) {
            gunRank = RANK[s.t];
            gunSlot = i;
          }
        } else if (RANK[s.t] > meleeRank) {
          meleeRank = RANK[s.t];
          meleeSlot = i;
        }
      }
      if (tgt && gunSlot < 0) {
        const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        const provoked = p.lastAttacker === tgt.id && this.time - p.hitT < 4;
        if (d > 260 && !provoked) tgt = null;
      }
      if (tgt) {
        ai.los = !this.losBlocked(p.x, p.y, tgt.x, tgt.y);
        ai.lostT = ai.los ? 0 : ai.lostT + P.react;
        if (ai.lostT > 5) {
          tgt = null;
          ai.lostT = 0;
        }
      }
      ai.target = tgt ? tgt.id : 0;
      ai.aimErr = (this.rng() * 2 - 1) * P.aimNoise;
      const threat = tgt && ai.los && Math.hypot(tgt.x - p.x, tgt.y - p.y) < 600;

      ai.heal = false;
      if (syrSlot >= 0 && !threat && p.hp < 60) {
        ai.heal = true;
        if (p.act !== syrSlot) p.actions.push({ a: 'slot', i: syrSlot });
      } else if (!p.inject) {
        let want = p.act;
        if (gunSlot >= 0) want = gunSlot;
        else if (meleeSlot >= 0) want = meleeSlot;
        else if (emptySlot >= 0) want = emptySlot;
        if (p.act !== want) p.actions.push({ a: 'slot', i: want });
      }
      if (!threat && !p.reload && p.act === gunSlot && gunSlot >= 0) {
        const s = p.slots[gunSlot];
        if (s.m < D.WEAPONS[s.t].mag * 0.5) p.actions.push({ a: 'reload' });
      }

      const z = this.zone;
      const dz = Math.hypot(p.x - z.x, p.y - z.y);
      if (dz > Math.min(z.r, z.tr + 150) - 120) {
        ai.mode = 'zone';
        if (ai.goalKind !== 'zone' || !ai.goal || Math.hypot(ai.goal[0] - z.x, ai.goal[1] - z.y) > z.tr * 0.5 + 1) {
          const a = this.rng() * TAU;
          const r = Math.sqrt(this.rng()) * z.tr * 0.4;
          ai.goal = [z.x + Math.cos(a) * r, z.y + Math.sin(a) * r];
          ai.goalKind = 'zone';
        }
        return;
      }
      if (tgt) {
        ai.mode = 'fight';
        return;
      }
      ai.mode = 'loot';
      let cur = ai.itemId ? this.items.get(ai.itemId) : null;
      if (cur && this.botWant(p, cur) <= 0) cur = null;
      if (!cur) {
        ai.itemId = 0;
        const q = this.itemGrid.query(p.x - 800, p.y - 800, p.x + 800, p.y + 800, []);
        let bs = 0;
        for (const it of q) {
          const w = this.botWant(p, it);
          if (w <= 0 || Math.hypot(it.x - z.x, it.y - z.y) > z.tr) continue;
          const s = w / (1 + Math.hypot(it.x - p.x, it.y - p.y) / 250);
          if (s > bs) {
            bs = s;
            cur = it;
          }
        }
        if (cur) ai.itemId = cur.id;
      }
      if (cur) {
        ai.goal = [cur.x, cur.y];
        ai.goalKind = 'item';
        if (Math.hypot(cur.x - p.x, cur.y - p.y) < 50 && cur.t !== 'medpack' && cur.t !== 'backpack') {
          let slot = -1;
          for (let i = 0; i < p.nslots; i++) {
            if (!p.slots[i]) {
              slot = i;
              break;
            }
          }
          if (slot < 0) slot = this.worstWeaponSlot(p);
          if (slot >= 0 && p.act !== slot) p.actions.push({ a: 'slot', i: slot });
          else p.actions.push({ a: 'interact' });
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
          if (o.dead || o.k !== 'crate') continue;
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
        const r = Math.sqrt(this.rng()) * Math.max(200, z.tr * 0.8);
        ai.goal = [clamp(z.x + Math.cos(a) * r, 100, this.size - 100), clamp(z.y + Math.sin(a) * r, 100, this.size - 100)];
        ai.goalKind = 'wander';
        ai.wanderT = 10;
      }
    }

    botSteer(p, mx, my) {
      const len = Math.hypot(mx, my);
      if (len < 1e-6) return [0, 0];
      const base = Math.atan2(my, mx);
      for (const o of [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.4, -2.4]) {
        const a = base + o * p.ai.side;
        if (!this.blockedAt(p.x + Math.cos(a) * 44, p.y + Math.sin(a) * 44, PR * 0.9)) return [Math.cos(a) * len, Math.sin(a) * len];
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
      const t = this.activeType(p);
      let mx = 0;
      let my = 0;
      let sprint = false;
      if (ai.mode === 'fight' && tgt && tgt.alive) {
        const dx = tgt.x - p.x;
        const dy = tgt.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;
        const pref = isGun(t) ? (t === 'shotgun' ? 150 : t === 'sniper' ? 650 : t === 'pistol' || t === 'uzi' ? 280 : 420) : 20;
        let ap = 0;
        if (!ai.los || d > pref * 1.2) ap = 1;
        else if (d < pref * 0.7) ap = -0.8;
        if (p.inject || (p.reload && isGun(t))) ap = -1;
        ai.strafeT -= dt;
        if (ai.strafeT <= 0) {
          ai.strafeT = 0.5 + this.rng() * 1.1;
          ai.strafe = this.rng() < 0.5 ? -1 : 1;
        }
        const sf = ai.los ? 0.85 : 0.2;
        mx = ux * ap - uy * ai.strafe * sf;
        my = uy * ap + ux * ai.strafe * sf;
        sprint = !isGun(t) && d > 120;
        if (this.time - p.hitT < 0.3 && p.jumpCool <= 0 && this.rng() < 0.08) p.actions.push({ a: 'jump' });
      } else if (ai.goal) {
        const dx = ai.goal[0] - p.x;
        const dy = ai.goal[1] - p.y;
        const d = Math.hypot(dx, dy);
        if (d > (ai.goalKind === 'crate' ? 70 : 6)) {
          mx = dx / d;
          my = dy / d;
        }
        sprint = ai.mode === 'zone' || (d > 500 && p.stamina > 60);
      }
      if (ai.heal && p.inject) {
        mx *= 0.5;
        my *= 0.5;
      }
      if (mx || my) {
        const s = this.botSteer(p, mx, my);
        mx = s[0];
        my = s[1];
      }
      ai.stuckT -= dt;
      if (ai.stuckT <= 0) {
        const moved = Math.hypot(p.x - ai.lastX, p.y - ai.lastY);
        if (moved < 30 && Math.abs(inp.mx) + Math.abs(inp.my) > 0.3) {
          ai.unstuck = 0.7 + this.rng() * 0.6;
          ai.unstuckDir = this.rng() * TAU;
          ai.side = -ai.side;
          if (ai.goalKind === 'item') ai.itemId = 0;
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
      inp.sprint = sprint;

      let want = null;
      let shoot = false;
      if (ai.heal && t === 'syringe') {
        shoot = !p.inject && !p.triggerHeld;
      } else if (tgt && tgt.alive && ai.los) {
        const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        const W = D.WEAPONS[t];
        const lead = isGun(t) ? (d / W.speed) * P.lead : 0;
        want = Math.atan2(tgt.y + tgt.vy * lead - p.y, tgt.x + tgt.vx * lead - p.x) + ai.aimErr;
        const err = Math.abs(angleDiff(p.a, want));
        if (isGun(t)) shoot = err < P.shootAngle + (W.pellets > 1 ? 0.08 : 0) && d < W.range * 0.92;
        else if (W) shoot = d < PR * 2 + W.range && err < 0.5;
      } else if (ai.goalKind === 'crate' && ai.crateId) {
        const o = this.obstacles[ai.crateId];
        if (o && !o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 140) {
          want = Math.atan2(o.y - p.y, o.x - p.x);
          const err = Math.abs(angleDiff(p.a, want));
          shoot = D.WEAPONS[t] ? err < 0.25 : false;
        }
      }
      if (want == null && (mx || my)) want = Math.atan2(my, mx);
      if (want != null) {
        const maxTurn = P.turn * dt;
        p.a += clamp(angleDiff(p.a, want), -maxTurn, maxTurn);
      }
      inp.aim = p.a;
      inp.shoot = shoot;
    }

    // ---------- views ----------

    viewHalf(p, aspect) {
      const h = D.VIEW_H * (p.veh ? 1.2 : 1);
      const w = h * clamp(aspect, 1, D.MAX_ASPECT);
      return [w / 2 + 160, h / 2 + 160];
    }

    promptFor(p) {
      if (!p.alive) return '';
      if (p.veh) return 'Get out';
      const tg = this.interactTarget(p);
      if (!tg) return '';
      if (tg.vehicle) return 'Drive ' + D.VEHICLES[tg.vehicle.t].name;
      const it = tg.item;
      if (it.t === 'medpack' || it.t === 'backpack') return 'Pick up ' + itemName(it.t);
      let free = !p.slots[p.act];
      for (let i = 0; i < p.nslots; i++) if (!p.slots[i]) free = true;
      return (free ? 'Pick up ' : 'Swap for ') + itemName(it.t);
    }

    getMapData() {
      const r1 = v => Math.round(v * 10) / 10;
      return {
        size: this.size,
        seed: this.seed,
        roads: this.roads.map(r => ({ w: r.w, pts: r.pts.map(p => [r1(p[0]), r1(p[1])]) })),
        buildings: this.buildings.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, roof: b.roof, floor: b.floor })),
        obstacles: this.obstacles.map(o => ({ id: o.id, k: o.k, s: o.s, x: r1(o.x), y: r1(o.y), r: r1(o.r), hw: r1(o.hw), hh: r1(o.hh), hp: o.hp, mhp: o.mhp, v: o.v, dead: o.dead ? 1 : 0, b: o.b }))
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

    hudData(p, full) {
      const r1 = v => Math.round(v * 10) / 10;
      return {
        id: p.id,
        alive: p.alive,
        x: r1(p.x),
        y: r1(p.y),
        hp: Math.round(p.hp * 10) / 10,
        st: Math.round(p.stamina),
        sl: p.slots.slice(0, p.nslots).map(s => (s ? { t: s.t, m: s.m != null ? s.m : null } : null)),
        act: p.act,
        rl: p.reload ? clamp(p.reload.t / p.reload.total, 0, 1) : -1,
        inj: p.inject ? clamp(p.inject.t / p.inject.total, 0, 1) : -1,
        jc: Math.round((p.jumpCool / D.JUMP_COOL) * 100) / 100,
        k: p.kills,
        dd: Math.round(p.dmgDealt),
        veh: p.veh,
        plc: p.placement,
        killer: p.killer,
        killerId: p.killerId,
        pr: full ? this.promptFor(p) : ''
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
        if (!inView(q.x, q.y, 60) || q.left) continue;
        if (!q.alive && this.time - q.deadT > 300) continue;
        pl.push({
          i: q.id,
          x: r1(q.x),
          y: r1(q.y),
          a: Math.round(q.a * 1000) / 1000,
          w: this.activeType(q),
          sk: q.skin,
          n: q.name,
          veh: q.veh,
          d: q.alive ? 0 : 1,
          bp: q.nslots > D.SLOTS ? 1 : 0,
          inj: q.inject ? 1 : 0,
          sw: q.swingT > 0 ? Math.round((q.swingT / 0.22) * q.swingSide * 100) / 100 : 0,
          jz: q.jumpT > 0 ? Math.round(Math.sin((1 - q.jumpT / D.JUMP_TIME) * Math.PI) * 100) / 100 : 0,
          hit: this.time - q.hitT < 0.12 ? 1 : 0,
          bu: q.inBush ? 1 : 0,
          hu: q.bot ? 0 : 1
        });
      }
      const bu = [];
      for (const b of this.bullets) {
        if (inView(b.x, b.y, 200)) bu.push({ i: b.id, x: r1(b.x), y: r1(b.y), dx: Math.round(b.dx * 1000) / 1000, dy: Math.round(b.dy * 1000) / 1000, w: b.w, tr: Math.round(b.trav) });
      }
      const it = [];
      for (const t of this.itemGrid.query(x0 - 30, y0 - 30, x1 + 30, y1 + 30, [])) it.push({ i: t.id, x: r1(t.x), y: r1(t.y), t: t.t });
      const ve = [];
      for (const v of this.vehicles) {
        if (inView(v.x, v.y, 100)) ve.push({ i: v.id, t: v.t, x: r1(v.x), y: r1(v.y), a: Math.round(v.a * 1000) / 1000, hp: Math.round((v.hp / v.mhp) * 100) / 100, d: v.driver, c: v.col, sp: Math.round(v.sp) });
      }
      const ob = [];
      for (const o of this.grid.query(x0, y0, x1, y1, [])) {
        if (o.mhp && o.hp < o.mhp) ob.push([o.id, Math.round(o.hp)]);
      }
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
        cveh: cam.veh ? 1 : 0,
        me: this.hudData(me, true),
        cme: cam !== me ? this.hudData(cam, false) : null,
        pl,
        bu,
        it,
        ve,
        ob,
        zo: { x: r1(z.x), y: r1(z.y), r: r1(z.r), tr: r1(z.tr) },
        al: alive,
        tot: this.players.length,
        ev: this.eventsFor(id, spectateId),
        lb,
        st: this.state,
        win: this.winner ? this.winner.name : '',
        winId: this.winner ? this.winner.id : 0
      };
    }
  }

  const API = { Sim, itemName, isGun, clamp, angleDiff, polyDist, segCircle, segRect, mulberry32 };
  if (isNode) {
    module.exports = API;
  } else {
    globalThis.PF_SIM = API;
  }
})();
