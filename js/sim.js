(function () {
  'use strict';
  const isNode = typeof module !== 'undefined' && !!module.exports;
  const D = isNode ? require('./data.js') : globalThis.PF_DATA;
  const Q = isNode ? require('./quiz.js') : globalThis.PF_QUIZ;

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

  // Outward normal of obstacle o at point (x, y) on its surface.
  function surfaceNormal(o, x, y) {
    if (o.s === 'c') {
      const d = Math.hypot(x - o.x, y - o.y) || 1;
      return [(x - o.x) / d, (y - o.y) / d];
    }
    const px = Math.abs(x - o.x) / (o.hw || 1);
    const py = Math.abs(y - o.y) / (o.hh || 1);
    if (px > py) return [x >= o.x ? 1 : -1, 0];
    return [0, y >= o.y ? 1 : -1];
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

  function isGun(t) {
    return !!D.WEAPONS[t] && !D.WEAPONS[t].melee;
  }

  function isWeapon(t) {
    return !!D.WEAPONS[t];
  }

  const RANK = { fists: 0, knife: 1, pistol: 3, uzi: 4, shotgun: 4, pan: 5, cleaver: 5, rollingpin: 5, sniper: 5, rifle: 6, minigun: 6, wok: 6, chopsticks: 6, bowl: 6, harpoon: 7, swordfish: 8 };
  const VALID_ACTIONS = { slot: 1, cycle: 1, reload: 1, interact: 1, drop: 1, jump: 1, skill: 1, heal: 1, gadget: 1, overdrive: 1, quiz: 1 };
  const ALLY_WEAPONS = { yunwang: 'shotgun', luap: 'uzi', auhsoj: 'rifle', meibao: 'chopsticks', afeng: 'uzi', bubbles: 'shotgun', jinjin: 'pistol', bing: 'rifle' };

  class Sim {
    constructor(opts) {
      opts = opts || {};
      this.mode = opts.mode === 'story' ? 'story' : 'royale';
      this.chapter = this.mode === 'story' ? D.STORY.find(c => c.id === opts.chapter) || D.STORY[0] : null;
      // Paradise Brawl: 'ffa' everyone for themselves, 'teams' red (1) against blue (2), 'coop' people (1) against bots (2).
      this.teamMode = this.mode === 'royale' && D.TEAM_MODES.indexOf(opts.teamMode) > 0 ? opts.teamMode : 'ffa';
      this.winTeam = 0;
      const seed = this.chapter ? this.chapter.seed : opts.seed;
      this.seed = (seed >>> 0) || ((Math.random() * 4294967296) >>> 0);
      this.rng = mulberry32(this.seed);
      this.size = D.MAP_SIZE;
      this.difficulty = D.diffLevel(opts.difficulty) || D.DIFF_DEFAULT;
      this.time = 0;
      // Wall clock: keeps running while the match waits on the math problem (this.time does not).
      this.clock = 0;
      this.quiz = null;
      this.nextId = 1;
      this.players = [];
      this.playerMap = new Map();
      this.bullets = [];
      this.turrets = [];
      this.bombs = [];
      this.mines = [];
      // Bots in a brawl play at this character level (the people's average level, set by the host).
      this.botLevel = clamp(Math.round(Number(opts.botLevel) || 1), 1, D.LEVELS.max);
      this.vehicles = [];
      this.obstacles = [];
      this.buildings = [];
      this.roads = [];
      this.items = new Map();
      this.events = [];
      this.state = 'playing';
      this.result = '';
      this.failReason = '';
      this.winner = null;
      this.hero = null;
      this.story = null;
      this.grid = new Grid(this.size, 200);
      this.itemGrid = new ItemGrid(this.size, 200);
      this._q = [];
      this._q2 = [];
      this.usedNames = new Set();
      this.closingAnnounced = false;
      // Hidden details use their own random stream so the map and the bots play out the same without them.
      this.sr = mulberry32((this.seed ^ 0x5ec2e7) >>> 0);
      this.secrets = [];
      this.cat = null;
      this.gold = null;
      this.plane = null;
      this.planeT = (this.mode === 'story' ? 50 : 70) + this.sr() * 30;
      this.generateMap();
      this.initZone();
    }

    ev(e) {
      this.events.push(e);
    }

    // Changes bot skill now; foe health applies to foes that spawn afterwards.
    setDifficulty(v) {
      const n = D.diffLevel(v);
      if (n) this.difficulty = n;
      return this.difficulty;
    }

    // ---------- map ----------

    generateMap() {
      const S = this.size;
      const R = this.rng;
      const cx = S / 2;
      const cy = S / 2;
      this.noise = [];
      this.noiseN = 10;
      for (let i = 0; i < 121; i++) this.noise.push(R());
      this.plaza = { x: cx, y: cy, r: 520 };

      const ROAD_W = 80;
      const spokes = [];
      const base = R() * TAU;
      for (let i = 0; i < 5; i++) {
        const a = base + (i / 5) * TAU + (R() - 0.5) * 0.4;
        const d = 1250 + R() * 350;
        spokes.push({ a, x: clamp(cx + Math.cos(a) * d, 450, S - 450), y: clamp(cy + Math.sin(a) * d, 450, S - 450) });
      }
      const yardSpoke = spokes[0];
      this.yard = { x: yardSpoke.x, y: yardSpoke.y, w: 640, h: 480 };
      this.towns = spokes.slice(1).map(s => ({ x: s.x, y: s.y, r: 260 + R() * 120 }));
      for (const s of spokes) {
        const sx = cx + Math.cos(s.a) * (this.plaza.r - 40);
        const sy = cy + Math.sin(s.a) * (this.plaza.r - 40);
        const dx = s.x - sx;
        const dy = s.y - sy;
        const L = Math.hypot(dx, dy);
        const bend = (R() - 0.5) * L * 0.2;
        const pts = [[sx, sy]];
        for (let i = 1; i < 5; i++) {
          const t = i / 5;
          const off = Math.sin(t * Math.PI) * bend;
          pts.push([sx + dx * t - (dy / L) * off, sy + dy * t + (dx / L) * off]);
        }
        pts.push([s.x, s.y]);
        this.roads.push({ w: ROAD_W, pts });
      }
      for (let i = 1; i < spokes.length; i++) {
        const a = spokes[i];
        const b = spokes[i === spokes.length - 1 ? 1 : i + 1];
        if (i === spokes.length - 1 || R() < 0.5) {
          const mx = (a.x + b.x) / 2 + (R() - 0.5) * 200;
          const my = (a.y + b.y) / 2 + (R() - 0.5) * 200;
          this.roads.push({ w: ROAD_W, pts: [[a.x, a.y], [mx, my], [b.x, b.y]] });
        }
      }

      this.restaurant = this.addRestaurant(cx, cy);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + 0.11;
        const x = cx + Math.cos(a) * (this.plaza.r - 30);
        const y = cy + Math.sin(a) * (this.plaza.r - 30);
        if (this.nearRoad(x, y, 6)) continue;
        this.addObstacle('lantern', 'c', x, y, { r: 11 });
      }

      const yd = this.yard;
      for (let gx = 0; gx < 3; gx++) {
        for (let gy = 0; gy < 3; gy++) {
          if (R() < 0.18) continue;
          const vertical = (gx + gy) % 2 === 0;
          const x = yd.x - yd.w / 2 + 110 + gx * ((yd.w - 220) / 2) + (R() - 0.5) * 40;
          const y = yd.y - yd.h / 2 + 90 + gy * ((yd.h - 180) / 2) + (R() - 0.5) * 40;
          if (this.nearRoad(x, y, vertical ? 40 : 80)) continue;
          this.addObstacle('container', 'r', x, y, vertical ? { hw: 32, hh: 78 } : { hw: 78, hh: 32 });
        }
      }

      for (const v of this.towns) {
        const count = 3 + Math.floor(R() * 2);
        let placed = 0;
        for (let t = 0; t < 80 && placed < count; t++) {
          const ang = R() * TAU;
          const d = 90 + R() * v.r;
          const stall = R() < 0.4;
          const w = stall ? 170 : Math.round((240 + R() * 120) / 10) * 10;
          const h = stall ? 140 : Math.round((210 + R() * 100) / 10) * 10;
          if (this.tryBuilding(v.x + Math.cos(ang) * d, v.y + Math.sin(ang) * d, w, h, stall ? 'stall' : 'house')) placed++;
        }
      }
      let cabins = 0;
      for (let t = 0; t < 300 && cabins < 6; t++) {
        if (this.tryBuilding(300 + R() * (S - 600), 300 + R() * (S - 600), 220, 190, 'house', true)) cabins++;
      }

      let trees = 0;
      for (let t = 0; t < 8000 && trees < 240; t++) {
        const x = R() * S;
        const y = R() * S;
        const n = this.noiseAt(x, y);
        if (R() > n * n * 1.5 + 0.05) continue;
        const r = 34 + R() * 20;
        if (!this.freeSpot(x, y, r, 56, 30)) continue;
        this.addObstacle('tree', 'c', x, y, { r });
        trees++;
      }
      let groves = 0;
      for (let t = 0; t < 600 && groves < 18; t++) {
        const gx = 200 + R() * (S - 400);
        const gy = 200 + R() * (S - 400);
        if (this.noiseAt(gx, gy) > 0.55 || Math.hypot(gx - cx, gy - cy) < 750) continue;
        const k = 3 + Math.floor(R() * 4);
        let ok = 0;
        for (let i = 0; i < k * 3 && ok < k; i++) {
          const x = gx + (R() - 0.5) * 200;
          const y = gy + (R() - 0.5) * 200;
          if (!this.freeSpot(x, y, 16, 50, 40)) continue;
          this.addObstacle('bamboo', 'c', x, y, { r: 16 });
          ok++;
        }
        if (ok) groves++;
      }
      this.scatter('rock', 90, () => ({ r: 28 + R() * 22 }), 52);
      this.scatter('bush', 85, () => ({ r: 38 + R() * 16 }), 0);
      this.scatter('crate', 75, () => ({ hw: 30, hh: 30 }), 46);

      if (this.mode === 'royale') {
        let n = 0;
        for (let t = 0; t < 2000 && n < 75; t++) {
          const x = 80 + R() * (S - 160);
          const y = 80 + R() * (S - 160);
          if (this.blockedAt(x, y, 26) || this.insideBuilding(x, y, 0)) continue;
          this.spawnItem(x, y, this.rollItem(0));
          n++;
        }
      }

      const vtypes = ['car', 'car', 'car', 'car', 'bike', 'bike', 'bike', 'bike'];
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
          if (Math.hypot(x - cx, y - cy) < this.plaza.r + 60) continue;
          if (this.blockedAt(x, y, D.VEHICLES[vt].r + 10)) continue;
          if (this.vehicles.some(v => Math.hypot(v.x - x, v.y - y) < 260)) continue;
          this.spawnVehicle(vt, x, y, ang);
          break;
        }
      }
      this.placeSecrets();
    }

    placeSecrets() {
      const R = this.sr;
      const pz = this.plaza;
      for (let t = 0; t < 60; t++) {
        const a = R() * TAU;
        const x = pz.x + Math.cos(a) * 405;
        const y = pz.y + Math.sin(a) * 405;
        if (this.nearRoad(x, y, 30) || this.insideBuilding(x, y, 30) || this.blockedAt(x, y, 46)) continue;
        this.addObstacle('board', 'r', x, y, { hw: 34, hh: 7, v: Math.floor(R() * 1000) });
        this.secrets.push({ id: 'notice', x, y, r: 74 });
        break;
      }
      const yd = this.yard;
      for (let t = 0; t < 80; t++) {
        const x = yd.x + (R() - 0.5) * (yd.w - 100);
        const y = yd.y + (R() - 0.5) * (yd.h - 100);
        if (this.blockedAt(x, y, 34) || this.nearRoad(x, y, 10)) continue;
        this.secrets.push({ id: 'log', x, y, r: 62 });
        break;
      }
      const houses = this.buildings.filter(b => b.type === 'house');
      for (let t = 0; t < 40 && houses.length; t++) {
        const b = houses[Math.floor(R() * houses.length)];
        const x = b.x + (R() - 0.5) * (b.w - 100);
        const y = b.y + (R() - 0.5) * (b.h - 100);
        if (this.blockedAt(x, y, 30)) continue;
        this.secrets.push({ id: 'recipe', x, y, r: 62 });
        break;
      }
      const bamboo = this.obstacles.filter(o => o.k === 'bamboo');
      for (let t = 0; t < 60 && bamboo.length; t++) {
        const o = bamboo[Math.floor(R() * bamboo.length)];
        const a = R() * TAU;
        const x = o.x + Math.cos(a) * 40;
        const y = o.y + Math.sin(a) * 40;
        if (this.blockedAt(x, y, 16)) continue;
        this.gold = { x, y, taken: false };
        break;
      }
      const c = { x: pz.x + 440, y: pz.y, a: Math.PI / 2, ang: 0, tx: 0, ty: 0, sitT: 3, petT: 0 };
      this.catTarget(c);
      c.x = c.tx;
      c.y = c.ty;
      this.catTarget(c);
      this.cat = c;
    }

    // The cat walks short hops around the plaza ring, outside the restaurant and inside the lanterns.
    catTarget(c) {
      const R = this.sr;
      c.ang += (R() < 0.5 ? -1 : 1) * (0.25 + R() * 0.25);
      const rr = 410 + R() * 60;
      c.tx = this.plaza.x + Math.cos(c.ang) * rr;
      c.ty = this.plaza.y + Math.sin(c.ang) * rr;
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

    inSpecialArea(x, y, margin) {
      if (Math.hypot(x - this.plaza.x, y - this.plaza.y) < this.plaza.r + margin) return true;
      const yd = this.yard;
      return Math.abs(x - yd.x) < yd.w / 2 + margin && Math.abs(y - yd.y) < yd.h / 2 + margin;
    }

    freeSpot(x, y, r, gap, edge) {
      const S = this.size;
      if (x < edge || y < edge || x > S - edge || y > S - edge) return false;
      if (this.nearRoad(x, y, r + 12)) return false;
      if (this.insideBuilding(x, y, r + 40)) return false;
      if (this.inSpecialArea(x, y, r + 20)) return false;
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
      const o = { id: this.obstacles.length, k: kind, s: shape, x, y, r: sh.r || 0, hw: sh.hw || 0, hh: sh.hh || 0, hp: def.hp, mhp: def.hp, solid: def.solid, blk: def.blk, dead: false, v: sh.v != null ? sh.v : Math.floor(this.rng() * 1000), b: sh.b != null ? sh.b : -1, _s: 0 };
      this.obstacles.push(o);
      this.grid.insert(o);
      return o;
    }

    tryBuilding(x, y, w, h, type, weak) {
      const S = this.size;
      x = Math.round(x);
      y = Math.round(y);
      if (x - w / 2 < 120 || y - h / 2 < 120 || x + w / 2 > S - 120 || y + h / 2 > S - 120) return false;
      if (this.rectHitsRoads(x - w / 2 - 50, y - h / 2 - 50, x + w / 2 + 50, y + h / 2 + 50)) return false;
      if (this.inSpecialArea(x, y, Math.max(w, h) / 2 + 40)) return false;
      for (const b of this.buildings) {
        if (Math.abs(b.x - x) < (b.w + w) / 2 + 80 && Math.abs(b.y - y) < (b.h + h) / 2 + 80) return false;
      }
      const q = this.grid.query(x - w / 2 - 40, y - h / 2 - 40, x + w / 2 + 40, y + h / 2 + 40, this._q);
      const blocked = q.length > 0;
      q.length = 0;
      if (blocked) return false;
      this.addBuilding(x, y, w, h, type, weak);
      return true;
    }

    // Walls for a rectangular building. doors maps side index (0 top, 1 right, 2 bottom, 3 left) to door center offset or true.
    buildWalls(b, doors, T, door) {
      const x0 = b.x - b.w / 2;
      const x1 = b.x + b.w / 2;
      const y0 = b.y - b.h / 2;
      const y1 = b.y + b.h / 2;
      // Wooden buildings get plank walls that break after enough hits.
      const kind = b.weak ? 'plank' : 'wall';
      b.walls = [];
      const seg = (horizontal, lo, hi, fixed) => {
        if (hi - lo < 2) return;
        let o;
        if (horizontal) o = this.addObstacle(kind, 'r', (lo + hi) / 2, fixed, { hw: (hi - lo) / 2, hh: T / 2, b: b.id });
        else o = this.addObstacle(kind, 'r', fixed, (lo + hi) / 2, { hw: T / 2, hh: (hi - lo) / 2, b: b.id });
        if (b.weak) {
          o.hp = Math.round(D.PLANK_HP[0] + (hi - lo) * D.PLANK_HP[1]);
          o.mhp = o.hp;
        }
        b.walls.push(o.id);
      };
      // Doorways are kept for bot routing: centre point and outward normal.
      b.doors = [];
      const NORMAL = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      for (let side = 0; side < 4; side++) {
        const horizontal = side === 0 || side === 2;
        const lo = horizontal ? x0 : y0 + T;
        const hi = horizontal ? x1 : y1 - T;
        const fixed = side === 0 ? y0 + T / 2 : side === 2 ? y1 - T / 2 : side === 1 ? x1 - T / 2 : x0 + T / 2;
        const d = doors[side];
        const nx = NORMAL[side][0];
        const ny = NORMAL[side][1];
        if (d === 'open') {
          const mid = (lo + hi) / 2;
          b.doors.push(horizontal ? { x: mid, y: fixed, nx, ny } : { x: fixed, y: mid, nx, ny });
          continue;
        }
        if (d != null) {
          const dc = typeof d === 'number' ? (lo + hi) / 2 + d : lo + 40 + door / 2 + this.rng() * (hi - lo - 80 - door);
          b.doors.push(horizontal ? { x: dc, y: fixed, nx, ny } : { x: fixed, y: dc, nx, ny });
          seg(horizontal, lo, dc - door / 2, fixed);
          seg(horizontal, dc + door / 2, hi, fixed);
        } else {
          seg(horizontal, lo, hi, fixed);
        }
      }
    }

    addBuilding(x, y, w, h, type, weak) {
      const R = this.rng;
      const b = { id: this.buildings.length, x, y, w, h, type, roof: Math.floor(R() * D.ROOFS.length), floor: Math.floor(R() * D.FLOORS.length), weak: !!weak || type === 'stall', broken: false };
      this.buildings.push(b);
      if (type === 'stall') {
        const doors = {};
        doors[Math.floor(R() * 4)] = 'open';
        this.buildWalls(b, doors, 14, 80);
        this.spawnItem(x, y, this.rollItem(0));
        return b;
      }
      const doors = {};
      doors[Math.floor(R() * 4)] = true;
      if (R() < 0.6) doors[Math.floor(R() * 4)] = true;
      this.buildWalls(b, doors, 16, 80);
      const T = 16;
      const ix0 = x - w / 2 + T + 40;
      const iy0 = y - h / 2 + T + 40;
      const ix1 = x + w / 2 - T - 40;
      const iy1 = y + h / 2 - T - 40;
      if (R() < 0.7) {
        const cx = R() < 0.5 ? ix0 : ix1;
        const cy = R() < 0.5 ? iy0 : iy1;
        if (!this.blockedAt(cx, cy, 32)) this.addObstacle('crate', 'r', cx, cy, { hw: 30, hh: 30 });
      }
      if (this.mode === 'royale') {
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
      return b;
    }

    addRestaurant(x, y) {
      const w = 620;
      const h = 440;
      const b = { id: this.buildings.length, x, y, w, h, type: 'restaurant', roof: 0, floor: 0 };
      this.buildings.push(b);
      this.buildWalls(b, { 1: 0, 2: 0, 3: 0 }, 18, 96);
      const y0 = y - h / 2;
      this.addObstacle('stove', 'r', x - 120, y0 + 52, { hw: 130, hh: 22, b: b.id });
      this.addObstacle('stove', 'r', x + 175, y0 + 52, { hw: 70, hh: 22, b: b.id });
      const tables = [[-180, -30], [0, -30], [180, -30], [-180, 120], [180, 120]];
      for (const [tx, ty] of tables) this.addObstacle('table', 'c', x + tx, y + ty, { r: 34, b: b.id });
      return b;
    }

    // ---------- items ----------

    rollItem(tier, R) {
      let total = 0;
      for (const e of D.LOOT) total += e[1 + tier];
      let r = (R || this.rng)() * total;
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
      const v = { id: this.nextId++, t, x, y, a, sp: 0, vx: 0, vy: 0, slip: 0, hp: V.hp, mhp: V.hp, driver: 0, dead: false, col: Math.floor(this.rng() * 4) };
      this.vehicles.push(v);
      return v;
    }

    // ---------- zone ----------

    initZone() {
      const S = this.size;
      const cx = S / 2 + (this.rng() - 0.5) * S * 0.2;
      const cy = S / 2 + (this.rng() - 0.5) * S * 0.2;
      let r0 = 0;
      for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) r0 = Math.max(r0, Math.hypot(x - cx, y - cy));
      r0 += 40;
      const z = this.chapter ? this.chapter.zone : null;
      this.zoneOn = this.mode === 'royale' || !!z;
      this.zoneCfg = Object.assign({}, D.ZONE, z || {});
      this.zone = { x: cx, y: cy, r: r0, r0, tr: r0, dps: this.zoneCfg.dps };
    }

    updateZone(dt) {
      if (!this.zoneOn) return;
      const z = this.zone;
      const Z = this.zoneCfg;
      let byPlayers = z.r0;
      if (this.mode === 'royale') {
        let alive = 0;
        for (const p of this.players) if (p.alive) alive++;
        const total = Math.max(1, this.players.length);
        if (total > 1) byPlayers = z.r0 * Math.max(Z.minFrac, Math.pow(alive / total, 0.35));
      }
      let byTime = z.r0;
      if (this.time > Z.timeStart) byTime = z.r0 * Math.max(Z.minFrac * 2, 1 - (this.time - Z.timeStart) / Z.timeDur);
      z.tr = Math.min(byPlayers, byTime);
      if (z.r > z.tr) z.r = Math.max(z.tr, z.r - Z.speed * dt);
      if (!this.closingAnnounced && this.time > Z.timeStart) {
        this.closingAnnounced = true;
        this.ev({ e: 'msg', g: 1, k: 'msg_zone' });
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

    // o: { char, team, kind, weapon, x, y, hpMul, ally, home }
    addPlayer(name, isBot, o) {
      o = o || {};
      const id = this.nextId++;
      const kind = D.FOES[o.kind] ? o.kind : 'player';
      const foe = D.FOES[kind];
      let char = null;
      if (kind === 'player') char = D.CHARS[o.char] ? o.char : D.CHAR_IDS[Math.floor(this.rng() * D.CHAR_IDS.length)];
      let nm = '';
      let nk = '';
      if (foe) nk = 'foe:' + kind;
      else if (isBot) {
        if (o.ally) nk = 'char:' + char;
        else nm = this.pickBotName();
      } else {
        nm = String(name || '').replace(/[^\w \-.!?㐀-鿿]/g, '').trim().slice(0, 16) || 'Player';
      }
      const lo = foe ? { level: 1, gadget: '', perk: '' } : isBot && o.level == null ? this.randomLoadout(char, this.botLevel) : this.loadout(char, o.level, o.gadget, o.perk);
      const lvMul = 1 + D.LEVELS.step * (lo.level - 1);
      const maxHp = foe ? Math.round(foe.hp * (o.hpMul || 1)) : Math.round(D.CHARS[char].hp * lvMul * (lo.perk === 'chin' ? 1.2 : 1));
      const p = {
        id,
        name: nm,
        nk,
        bot: !!isBot,
        kind,
        char,
        team: o.team || 0,
        r: foe ? foe.r : PR,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        kx: 0,
        ky: 0,
        a: 0,
        hp: maxHp,
        maxHp,
        stamina: 100,
        sprintT: -10,
        jumpT: 0,
        jumpCool: 0,
        jx: 0,
        jy: 0,
        rushT: 0,
        rushHit: null,
        rx: 0,
        ry: 0,
        skillCool: 2,
        skillUses: 0,
        boostT: 0,
        shieldT: 0,
        lvl: lo.level,
        dmgMul: lvMul,
        gadget: lo.gadget,
        perk: lo.perk,
        gUses: D.GADGET_USES,
        gCool: 0,
        odOk: kind === 'player' && lo.level >= D.LEVELS.overdrive,
        od: 0,
        odT: 0,
        bubHp: 0,
        bubT: 0,
        guardT: 0,
        clockUntil: 0,
        burnT: 0,
        burnDps: 0,
        burnSrc: 0,
        slowT: 0,
        slowMul: 1,
        alive: true,
        slots: [null, null, null, null],
        soups: 0,
        scope: 1,
        nslots: D.SLOTS,
        act: 0,
        cool: 0,
        deploy: 0,
        reload: null,
        inject: null,
        swingT: 0,
        swingSide: 1,
        kills: 0,
        streak: 0,
        streakT: -10,
        dmgDealt: 0,
        veh: 0,
        placement: 0,
        killer: '',
        killerNk: '',
        killerId: 0,
        deadT: 0,
        hitT: -10,
        lastAttacker: 0,
        lastShot: -10,
        ranT: 0,
        specialT: 4,
        inBush: false,
        aspect: 16 / 9,
        input: { mx: 0, my: 0, aim: 0, ad: 380, shoot: false, sprint: false, brake: false },
        actions: [],
        triggerHeld: false,
        ai: null
      };
      if (o.weapon) p.slots[0] = isGun(o.weapon) ? { t: o.weapon, m: D.WEAPONS[o.weapon].mag } : { t: o.weapon };
      if (isBot) p.ai = this.makeAi(kind, o);
      if (o.x != null) {
        p.x = o.x;
        p.y = o.y;
        this.resolvePlayer(p);
      } else {
        this.spawnPoint(p);
      }
      if (p.ai) {
        p.ai.lastX = p.x;
        p.ai.lastY = p.y;
        p.ai.home = [p.x, p.y];
      }
      this.players.push(p);
      this.playerMap.set(id, p);
      return id;
    }

    makeAi(kind, o) {
      return {
        t: this.rng() * 0.5,
        target: 0,
        goal: null,
        goalKind: '',
        mode: 'loot',
        strafe: 1,
        strafeT: 0,
        stuckT: 1,
        lastX: 0,
        lastY: 0,
        unstuck: 0,
        unstuckDir: 0,
        aimErr: 0,
        aimMul: kind === 'player' ? 1 : kind === 'boss' ? 1.6 : 1.45,
        los: false,
        lostT: 0,
        side: this.rng() < 0.5 ? 1 : -1,
        itemId: 0,
        crateId: 0,
        wanderT: 0,
        heal: false,
        noLoot: this.mode === 'story' && !o.loot,
        hunt: o.hunt || 0,
        follow: o.follow || 0,
        home: null,
        sleepT: 0
      };
    }

    // Lets the bot AI drive a player (used by tests and the menu demo).
    autopilot(id) {
      const p = this.playerMap.get(id);
      if (!p) return;
      p.bot = true;
      p.pilot = true;
      const collect = this.story && this.story.goal.type === 'collect';
      p.ai = this.makeAi(p.kind, { loot: true, hunt: this.mode === 'story' && !collect ? 1400 : 0 });
      p.ai.lastX = p.x;
      p.ai.lastY = p.y;
      p.ai.home = [p.x, p.y];
    }

    spawnPoint(p) {
      const S = this.size;
      let bx = S / 2;
      let by = S / 2;
      let bestScore = -1;
      for (let t = 0; t < 80; t++) {
        const x = 150 + this.rng() * (S - 300);
        const y = 150 + this.rng() * (S - 300);
        if (this.blockedAt(x, y, p.r + 6)) continue;
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

    // A free spot at distance [d0, d1] from (x, y).
    findSpot(x, y, d0, d1, r) {
      const S = this.size;
      for (let t = 0; t < 120; t++) {
        const a = this.rng() * TAU;
        const d = d0 + this.rng() * (d1 - d0);
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d;
        if (px < 80 || py < 80 || px > S - 80 || py > S - 80) continue;
        if (this.blockedAt(px, py, r + 4)) continue;
        return [px, py];
      }
      return [clamp(x + d0, 80, S - 80), clamp(y, 80, S - 80)];
    }

    // Called once people and bots are in. Coop: every person on team 1, bots on team 2.
    // Teams: people keep a chosen side (1 red, 2 blue), the rest and the bots even out the sides.
    setupTeams() {
      if (this.teamMode === 'ffa') return;
      const people = this.players.filter(p => this.isPerson(p));
      const bots = this.players.filter(p => !this.isPerson(p));
      if (this.teamMode === 'coop') {
        for (const p of people) p.team = 1;
        for (const p of bots) p.team = 2;
      } else {
        const n = [0, 0, 0];
        for (const p of people) if (p.team === 1 || p.team === 2) n[p.team]++;
        for (const p of people.concat(bots)) {
          if (p.team === 1 || p.team === 2) continue;
          p.team = n[1] <= n[2] ? 1 : 2;
          n[p.team]++;
        }
      }
      this.placeTeams();
    }

    // Each side starts together: teams on opposite sides of the map, coop families in one group with bots spread out.
    placeTeams() {
      const S = this.size;
      const a = this.rng() * TAU;
      const anchors = [null, [S / 2 + Math.cos(a) * 1150, S / 2 + Math.sin(a) * 1150], [S / 2 - Math.cos(a) * 1150, S / 2 - Math.sin(a) * 1150]];
      const sides = this.teamMode === 'coop' ? [1] : [1, 2];
      for (const t of sides) {
        const an = anchors[t];
        for (const p of this.players) {
          if (p.team !== t) continue;
          const sp = this.findSpot(an[0], an[1], 0, 300, p.r);
          p.x = sp[0];
          p.y = sp[1];
        }
      }
      if (this.teamMode === 'coop') {
        for (const p of this.players) {
          if (p.team !== 2) continue;
          p.x = -9999;
          p.y = -9999;
        }
        // Bots start well away from the family, since every one of them is after the family.
        const fam = this.players.filter(p => p.team === 1);
        const famDist = (x, y) => Math.min(...fam.map(f => Math.hypot(f.x - x, f.y - y)));
        for (const p of this.players) {
          if (p.team !== 2) continue;
          for (let t = 0; t < 12; t++) {
            this.spawnPoint(p);
            if (famDist(p.x, p.y) > 1100) break;
          }
        }
        for (const p of this.players) if (p.team === 1 && p.ai) p.ai.home = [p.x, p.y];
      }
    }

    // People are the human players; an autopilot (used by tests) still counts as one.
    isPerson(p) {
      return !p.bot || !!p.pilot;
    }

    // A person who joins a running team match goes to the smaller side (always team 1 in coop), next to a teammate.
    joinTeam(p) {
      if (this.teamMode === 'ffa') return;
      if (this.teamMode === 'coop') {
        p.team = 1;
      } else if (p.team !== 1 && p.team !== 2) {
        const n = [0, 0, 0];
        for (const q of this.players) if (q !== p && q.alive) n[q.team]++;
        p.team = n[1] <= n[2] ? 1 : 2;
      }
      const mate = this.players.find(q => q !== p && q.alive && q.team === p.team);
      if (mate) {
        const sp = this.findSpot(mate.x, mate.y, 60, 220, p.r);
        p.x = sp[0];
        p.y = sp[1];
      }
    }

    // Coop only: a fallen person comes back next to a living family member after D.RESPAWN_TIME seconds.
    respawnLeft(p) {
      if (this.teamMode !== 'coop' || p.alive || !this.isPerson(p) || p.left || this.state !== 'playing') return -1;
      if (!this.players.some(q => q.alive && this.isPerson(q) && q.team === p.team)) return -1;
      return Math.max(0, D.RESPAWN_TIME - (this.time - p.deadT));
    }

    updateRespawns() {
      if (this.teamMode !== 'coop' || this.state !== 'playing') return;
      for (const p of this.players) {
        if (this.respawnLeft(p) !== 0) continue;
        const mates = this.players.filter(q => q.alive && this.isPerson(q) && q.team === p.team);
        this.respawn(p, mates[Math.floor(this.rng() * mates.length)]);
      }
    }

    respawn(p, near) {
      const sp = this.findSpot(near.x, near.y, 60, 220, p.r);
      p.x = sp[0];
      p.y = sp[1];
      p.vx = 0;
      p.vy = 0;
      p.kx = 0;
      p.ky = 0;
      p.alive = true;
      p.hp = p.maxHp;
      p.stamina = 100;
      p.burnT = 0;
      p.slowT = 0;
      p.jumpT = 0;
      p.rushT = 0;
      p.cool = 0;
      p.reload = null;
      p.inject = null;
      p.slots = [{ t: 'pistol', m: D.WEAPONS.pistol.mag }, null, null, null];
      p.act = 0;
      p.nslots = D.SLOTS;
      p.soups = 1;
      p.scope = 1;
      p.killer = '';
      p.killerNk = '';
      p.killerId = 0;
      p.placement = 0;
      p.shieldT = this.time + 2;
      p.odT = 0;
      p.bubT = 0;
      p.bubHp = 0;
      this.ev({ e: 'respawn', i: p.id, x: p.x, y: p.y });
    }

    removePlayer(id) {
      const p = this.playerMap.get(id);
      if (!p) return;
      if (p.alive) this.killPlayer(p, 0, 'left');
      p.left = true;
    }

    fillBots(total) {
      const used = new Set(this.players.map(q => q.char));
      while (this.players.length < total) {
        const free = D.CHAR_IDS.filter(c => !used.has(c));
        const char = free.length ? free[Math.floor(this.rng() * free.length)] : null;
        if (char) used.add(char);
        this.addPlayer('', true, { char });
      }
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
      // How far away the player is aiming (thrown skills land there).
      const ad = Number(inp.ad);
      if (Number.isFinite(ad)) i.ad = clamp(ad, 80, 420);
    }

    pushAction(id, act) {
      const p = this.playerMap.get(id);
      if (!p || !act || !VALID_ACTIONS[act.a] || p.actions.length > 12) return;
      const a = { a: act.a };
      if (act.i != null) a.i = clamp(Math.floor(Number(act.i) || 0), -1, 3);
      if (act.a === 'quiz') {
        a.ans = String(act.ans || '').slice(0, 10);
        if (act.skip != null) a.skip = String(act.skip).slice(0, 20);
      }
      // A skill can carry its own aim (dragged from the skill button, or right mouse released).
      if (act.a === 'skill') {
        const aim = Number(act.aim);
        if (Number.isFinite(aim)) a.aim = aim;
        const ad = Number(act.ad);
        if (Number.isFinite(ad)) a.ad = clamp(ad, 80, 420);
      }
      p.actions.push(a);
    }

    setAspect(id, aspect) {
      const p = this.playerMap.get(id);
      if (p) p.aspect = clamp(Number(aspect) || 1.7, 0.5, 4);
    }

    enemies(a, b) {
      if (a === b) return false;
      if (a.team === 0 || b.team === 0) return true;
      return a.team !== b.team;
    }

    activeType(p) {
      const s = p.slots[p.act];
      return s ? s.t : 'fists';
    }

    healMul(p) {
      return p.char === 'yunwang' ? 1.5 : 1;
    }

    // Health back from damage dealt. The gain is shown as one "+N" once enough has built up, not per bullet.
    lifesteal(p, dealt) {
      const g = Math.min(p.maxHp - p.hp, dealt * D.LIFESTEAL * this.healMul(p));
      if (g <= 0) return;
      p.hp += g;
      p.lsAcc = (p.lsAcc || 0) + g;
      if (p.lsAcc >= 3 && this.time - (p.lsT || 0) > 0.7) {
        this.ev({ e: 'leech', i: p.id, x: p.x, y: p.y, n: Math.round(p.lsAcc) });
        p.lsAcc = 0;
        p.lsT = this.time;
      }
    }

    heal(p, amt) {
      p.hp = Math.min(p.maxHp, p.hp + amt * this.healMul(p));
      this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
    }

    toPlayer(p, k, args, ok) {
      if (p.bot) return;
      this.ev({ e: 'pick', to: p.id, k, a: args || [], ok: ok ? 1 : 0 });
    }

    soupCap(p) {
      return D.SOUP_CAP[p.nslots > D.SLOTS ? 1 : 0];
    }

    // Weapons go into the held slot if empty, then any empty slot, otherwise they replace the held weapon.
    // Healing items never use weapon slots: soup goes to the medical pouch, dumplings heal on the spot.
    tryPickup(p, it, manual) {
      if (it.t === 'drop') {
        if (!manual || this.time < it.land) return false;
        this.removeItem(it);
        this.openDrop(p, it);
        return true;
      }
      if (it.t === 'coldbox') {
        if (!this.story || p.team !== 1) return false;
        this.removeItem(it);
        this.story.collected++;
        this.ev({ e: 'msg', g: 1, k: 'msg_box', a: [this.story.collected, this.story.goal.count], x: it.x, y: it.y, box: 1 });
        return true;
      }
      if (it.t === 'bao') {
        if (p.hp >= p.maxHp) {
          if (manual) this.toPlayer(p, 'fullHp');
          return false;
        }
        this.removeItem(it);
        this.heal(p, D.ITEMS.bao.heal);
        this.toPlayer(p, 'pick_heal', [Math.round(D.ITEMS.bao.heal * this.healMul(p))], true);
        return true;
      }
      const SC = D.ITEMS[it.t] && D.ITEMS[it.t].lv;
      if (SC) {
        // Bots see the same either way, so scopes are left on the ground for people.
        if (p.bot) return false;
        if (SC <= p.scope) {
          if (manual) this.toPlayer(p, 'haveScope');
          return false;
        }
        this.removeItem(it);
        if (p.scope > 1) this.dropNear(p, 'scope' + p.scope);
        p.scope = SC;
        this.toPlayer(p, 'pick_item', [it.t], true);
        return true;
      }
      if (it.t === 'bag') {
        if (p.nslots >= D.SLOTS_BAG) {
          if (manual) this.toPlayer(p, 'haveBag');
          return false;
        }
        p.nslots = D.SLOTS_BAG;
        this.removeItem(it);
        this.toPlayer(p, 'pick_bag', [], true);
        return true;
      }
      if (it.t === 'soup') {
        const cap = this.soupCap(p);
        if (p.soups >= cap) {
          if (manual) this.toPlayer(p, 'soupFull');
          return false;
        }
        this.removeItem(it);
        p.soups++;
        this.toPlayer(p, 'pick_soup', [p.soups, cap], true);
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
      this.toPlayer(p, 'pick_item', [it.t], true);
      this.ev({ e: 'got', i: p.id, t: it.t, x: p.x, y: p.y });
      return true;
    }

    nearestItem(p, range) {
      const q = this.itemGrid.query(p.x - range, p.y - range, p.x + range, p.y + range, this._q2);
      let best = null;
      let bd = range * range;
      for (const it of q) {
        if (it.t === 'coldbox' || (it.t === 'drop' && it.land > this.time)) continue;
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

    // An item almost underfoot wins; otherwise a vehicle in reach; otherwise any item in reach.
    interactTarget(p) {
      const it = this.nearestItem(p, D.PICKUP_RANGE);
      if (it && Math.hypot(it.x - p.x, it.y - p.y) < p.r + D.ITEM_R) return { item: it };
      const v = this.nearestFreeVehicle(p);
      if (v) return { vehicle: v };
      if (!p.bot) {
        const sc = this.nearSecret(p);
        if (sc) return { secret: sc };
      }
      return it ? { item: it } : null;
    }

    nearSecret(p) {
      for (const sc of this.secrets) {
        if (Math.hypot(sc.x - p.x, sc.y - p.y) < sc.r) return sc;
      }
      const c = this.cat;
      if (c && Math.hypot(c.x - p.x, c.y - p.y) < 66) return { id: 'cat' };
      return null;
    }

    secret(p, id) {
      if (p.bot) return;
      this.ev({ e: 'secret', to: p.id, id });
    }

    useSecret(p, sc) {
      if (sc.id === 'cat') {
        const c = this.cat;
        c.petT = 2.6;
        c.sitT = Math.max(c.sitT, 3);
        c.a = Math.atan2(p.y - c.y, p.x - c.x);
        this.ev({ e: 'meow', x: c.x, y: c.y });
      }
      this.secret(p, sc.id);
    }

    // A cold-chain airdrop holds one rare kitchen weapon, one crate-tier item, one healing item and,
    // half the time, a 4x or 8x scope.
    openDrop(p, it) {
      const R = this.sr;
      const rares = D.LOOT.filter(e => D.WEAPONS[e[0]] && D.WEAPONS[e[0]].rare);
      let total = 0;
      for (const e of rares) total += e[2];
      let r = R() * total;
      let rare = rares[0][0];
      for (const e of rares) {
        r -= e[2];
        if (r <= 0) {
          rare = e[0];
          break;
        }
      }
      const got = [rare, this.rollItem(1, R), R() < 0.5 ? 'soup' : 'bao'];
      if (R() < 0.5) got.push(R() < 0.4 ? 'scope8' : 'scope4');
      got.forEach((t, i) => {
        const a = (i / got.length) * TAU + R();
        this.spawnItem(it.x + Math.cos(a) * 34, it.y + Math.sin(a) * 34, t);
      });
      this.ev({ e: 'open', x: it.x, y: it.y, i: p.id });
      this.toPlayer(p, 'pick_drop', [], true);
      this.secret(p, 'plane');
    }


    interact(p) {
      if (p.veh) {
        this.exitVehicle(p);
        return;
      }
      const tg = this.interactTarget(p);
      if (tg && tg.item) this.tryPickup(p, tg.item, true);
      else if (tg && tg.vehicle && p.kind === 'player') this.enterVehicle(p, tg.vehicle);
      else if (tg && tg.secret) this.useSecret(p, tg.secret);
    }

    enterVehicle(p, v) {
      v.driver = p.id;
      p.veh = v.id;
      p.reload = null;
      p.inject = null;
      p.jumpT = 0;
      p.rushT = 0;
      p.x = v.x;
      p.y = v.y;
      this.toPlayer(p, 'driving', [v.t], true);
    }

    exitVehicle(p) {
      const v = this.vehicles.find(q => q.id === p.veh);
      p.veh = 0;
      if (!v) return;
      v.driver = 0;
      const V = D.VEHICLES[v.t];
      for (const o of [Math.PI / 2, -Math.PI / 2, Math.PI, 0]) {
        const d = o === 0 || o === Math.PI ? V.len / 2 + p.r + 8 : V.wid / 2 + p.r + 8;
        const x = v.x + Math.cos(v.a + o) * d;
        const y = v.y + Math.sin(v.a + o) * d;
        if (!this.blockedAt(x, y, p.r)) {
          p.x = x;
          p.y = y;
          return;
        }
      }
      p.x = v.x + Math.cos(v.a + Math.PI / 2) * (V.wid / 2 + p.r + 8);
      p.y = v.y + Math.sin(v.a + Math.PI / 2) * (V.wid / 2 + p.r + 8);
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
      this.toPlayer(p, 'drop', [s.t], false);
    }

    reloadTime(p, W) {
      return W.reload * (p.char === 'auhsoj' ? 0.6 : 1);
    }

    startReload(p) {
      const s = p.slots[p.act];
      if (!s || !isGun(s.t) || p.reload || p.veh) return;
      const W = D.WEAPONS[s.t];
      if (s.m >= W.mag) return;
      p.reload = { t: 0, total: this.reloadTime(p, W) };
      this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
    }

    jump(p) {
      if (p.veh || p.jumpCool > 0 || p.inject || p.rushT > 0) return;
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

    useSkill(p) {
      if (!p.alive || p.veh || p.skillCool > 0 || !p.char) return;
      const C = D.CHARS[p.char];
      p.skillCool = C.skill.cd;
      p.skillUses++;
      const id = C.skill.id;
      // During Wok Overdrive every skill comes out in its stronger form.
      const od = p.odT > 0;
      this.ev({ e: 'skill', i: p.id, s: id, x: p.x, y: p.y, a: p.a, od: od ? 1 : 0 });
      if (id === 'flame') {
        const R = 165 * (p.perk === 'fierce' ? 1.3 : 1) * (od ? 1.4 : 1);
        const dmg = od ? 55 : 40;
        for (const q of this.players) {
          if (!q.alive || q.veh || !this.enemies(p, q)) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d > R + q.r) continue;
          const n = Math.max(1, d);
          this.knock(q, ((q.x - p.x) / n) * 380, ((q.y - p.y) / n) * 380);
          this.burn(q, 7, 3, p.id);
          this.damagePlayer(q, dmg, p.id, 'flame');
        }
        for (const o of this.grid.query(p.x - R, p.y - R, p.x + R, p.y + R, [])) {
          if (!o.dead && o.mhp && Math.hypot(o.x - p.x, o.y - p.y) < R) this.damageObstacle(o, 60, p.id);
        }
        this.heal(p, 15);
      } else if (id === 'rush') {
        p.rx = Math.cos(p.a);
        p.ry = Math.sin(p.a);
        p.rushT = 0.38 * (od ? 1.4 : 1);
        p.rushDmg = 45 * (p.perk === 'haymaker' ? 1.5 : 1) * (od ? 1.4 : 1);
        p.rushHit = new Set();
        p.jumpT = 0;
      } else if (id === 'turret') {
        const n = od ? 3 : p.perk === 'twin' ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const a = p.a + (k - (n - 1) / 2) * 0.7;
          const tx = p.x + Math.cos(a) * (p.r + 30);
          const ty = p.y + Math.sin(a) * (p.r + 30);
          const free = !this.blockedAt(tx, ty, 18);
          this.turrets.push({ id: this.nextId++, owner: p.id, team: p.team, x: free ? tx : p.x, y: free ? ty : p.y, a, life: od ? 14 : 10, cool: 0.4, ap: p.perk === 'ap', fast: this.time < p.clockUntil });
        }
        const mine = this.turrets.filter(t => t.owner === p.id);
        const keep = Math.max(2, n);
        for (let k = 0; k < mine.length - keep; k++) this.turrets.splice(this.turrets.indexOf(mine[k]), 1);
      } else if (id === 'boba') {
        const heal = p.perk === 'double' ? 60 : 30;
        p.hp = Math.min(p.maxHp, p.hp + heal);
        p.stamina = 100;
        p.boostT = od ? 7 : 5;
        this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
        if (od) {
          for (const q of this.players) {
            if (q === p || !q.alive || this.enemies(p, q) || Math.hypot(q.x - p.x, q.y - p.y) > 260) continue;
            q.hp = Math.min(q.maxHp, q.hp + heal);
            q.boostT = Math.max(q.boostT, 4);
            this.ev({ e: 'heal', i: q.id, x: q.x, y: q.y });
          }
        }
      } else if (id === 'parcel') {
        const n = od ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const a = p.a + (k - (n - 1) / 2) * 0.32;
          this.throwParcel(p, a, p.input.ad || 380, 140 * (p.perk === 'bigbox' ? 1.35 : 1), 55);
        }
      } else if (id === 'bubble') {
        const amount = od ? 120 : p.perk === 'thick' ? 90 : 50;
        const R = 220 * (p.perk === 'wide' ? 1.5 : 1);
        for (const q of this.players) {
          if (!q.alive) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (q === p || (!this.enemies(p, q) && d < R)) {
            q.bubHp = amount;
            q.bubT = 5;
          } else if (od && this.enemies(p, q) && !q.veh && d < R) {
            const n2 = Math.max(1, d);
            this.knock(q, ((q.x - p.x) / n2) * 520, ((q.y - p.y) / n2) * 520);
          }
        }
      } else if (id === 'coins') {
        const n = od ? 14 : p.perk === 'bills' ? 11 : 7;
        const dmg = (od ? 20 : 15) + (p.perk === 'jackpot' ? 5 : 0);
        const spread = od ? 1.2 : 0.9;
        for (let k = 0; k < n; k++) this.coin(p, p.a + (k / (n - 1) - 0.5) * spread, dmg);
      } else if (id === 'freeze') {
        const R = 190 * (od ? 1.4 : 1);
        const mul = od ? 0.3 : 0.5;
        const t = p.perk === 'deep' ? 5 : 3;
        for (const q of this.players) {
          if (!q.alive || q.veh || !this.enemies(p, q) || Math.hypot(q.x - p.x, q.y - p.y) > R + q.r) continue;
          this.chill(q, t, mul);
          this.damagePlayer(q, 20, p.id, 'freeze');
        }
      }
    }

    // Master Bing's passive: cold does not slow him.
    chill(q, t, mul) {
      if (q.char === 'bing') return;
      q.slowT = Math.max(q.slowT, t);
      q.slowMul = Math.min(q.slowT > t ? q.slowMul : 1, mul);
    }

    coin(p, a, dmg) {
      this.spawnBullet(p, 'coin', a, p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
      this.bullets[this.bullets.length - 1].dmg = dmg;
    }

    // A parcel is lobbed in an arc over walls and trees and blows up where it lands, inside the map.
    throwParcel(p, a, dist, r, dmg) {
      const S = this.size;
      const x1 = clamp(p.x + Math.cos(a) * dist, 20, S - 20);
      const y1 = clamp(p.y + Math.sin(a) * dist, 20, S - 20);
      this.bombs.push({ id: this.nextId++, owner: p.id, x0: p.x, y0: p.y, x1, y1, t: 0, T: 0.6, r, dmg });
    }

    // Kitchen gadgets: three uses a match, D.GADGET_CD seconds apart.
    useGadget(p) {
      if (!p.alive || p.veh || !p.gadget) return;
      if (p.gUses <= 0 || p.gCool > 0) {
        this.toPlayer(p, 'gadgetWait');
        return;
      }
      p.gUses--;
      p.gCool = D.GADGET_CD;
      const g = p.gadget;
      this.ev({ e: 'gadget', i: p.id, g, x: p.x, y: p.y });
      const near = R => this.players.filter(q => q.alive && !q.veh && this.enemies(p, q) && Math.hypot(q.x - p.x, q.y - p.y) < R + q.r);
      const away = (q, f) => {
        const d = Math.max(1, Math.hypot(q.x - p.x, q.y - p.y));
        this.knock(q, ((q.x - p.x) / d) * f, ((q.y - p.y) / d) * f);
      };
      if (g === 'chili') {
        for (const q of near(170)) this.burn(q, 10, 3, p.id);
      } else if (g === 'taste') {
        this.heal(p, 40);
        this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
      } else if (g === 'guard') {
        p.guardT = this.time + 3;
      } else if (g === 'second') {
        p.skillCool *= 0.5;
      } else if (g === 'mine') {
        this.mines.push({ id: this.nextId++, owner: p.id, team: p.team, x: p.x, y: p.y, arm: this.time + 0.8 });
        const mine = this.mines.filter(m => m.owner === p.id);
        if (mine.length > 3) this.mines.splice(this.mines.indexOf(mine[0]), 1);
      } else if (g === 'overclock') {
        p.clockUntil = this.time + 12;
        for (const t of this.turrets) if (t.owner === p.id) t.fast = true;
      } else if (g === 'pearls') {
        for (const q of near(190)) this.chill(q, 3, 0.55);
      } else if (g === 'sugar') {
        p.stamina = 100;
        p.boostT = Math.max(p.boostT, 2.5);
      } else if (g === 'swerve') {
        const ml = Math.hypot(p.input.mx, p.input.my);
        p.jx = ml > 0.1 ? p.input.mx / ml : Math.cos(p.a);
        p.jy = ml > 0.1 ? p.input.my / ml : Math.sin(p.a);
        p.jumpT = 0.42;
      } else if (g === 'extra') {
        this.spawnItem(p.x + 34, p.y, 'soup');
        this.spawnItem(p.x - 34, p.y, 'bao');
      } else if (g === 'soap') {
        for (const q of near(200)) away(q, 680);
      } else if (g === 'rinse') {
        p.burnT = 0;
        p.slowT = 0;
        this.heal(p, 25);
        this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
      } else if (g === 'refund') {
        for (const sl of p.slots) if (sl && isGun(sl.t)) sl.m = D.WEAPONS[sl.t].mag;
        p.reload = null;
      } else if (g === 'rain') {
        for (let k = 0; k < 12; k++) this.coin(p, (k / 12) * TAU, 15);
      } else if (g === 'nova') {
        for (const q of near(170)) {
          this.chill(q, 1, 0.05);
          this.damagePlayer(q, 10, p.id, 'freeze');
        }
      } else if (g === 'icepack') {
        p.burnT = 0;
        this.heal(p, 30);
        this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
      }
    }

    // Wok Overdrive: needs level 8 and a full meter.
    startOverdrive(p) {
      if (!p.alive || !p.odOk || p.od < 1 || p.odT > 0) {
        if (!p.bot) this.toPlayer(p, 'odWait');
        return;
      }
      p.odT = D.OVERDRIVE.time;
      p.od = 0;
      p.skillCool = 0;
      this.ev({ e: 'overdrive', i: p.id, x: p.x, y: p.y, g: 1 });
    }

    updateGadgets(dt) {
      for (let i = this.bombs.length - 1; i >= 0; i--) {
        const b = this.bombs[i];
        b.t += dt;
        if (b.t < b.T) continue;
        this.bombs.splice(i, 1);
        this.explode(b.x1, b.y1, b.r, b.dmg, b.owner, b.owner);
      }
      for (let i = this.mines.length - 1; i >= 0; i--) {
        const m = this.mines[i];
        if (this.time < m.arm) continue;
        const owner = this.playerMap.get(m.owner);
        const hit = this.players.some(q => q.alive && !q.veh && (owner ? this.enemies(owner, q) : true) && q.id !== m.owner && Math.hypot(q.x - m.x, q.y - m.y) < 60 + q.r);
        if (!hit) continue;
        this.mines.splice(i, 1);
        this.explode(m.x, m.y, 120, 70, m.owner, m.owner);
      }
    }

    // Which gadgets and perks a character may use at a level; anything else is dropped.
    loadout(char, level, gadget, perk) {
      return D.validLoadout(char, level, gadget, perk);
    }

    // A random but legal loadout, for bots and story allies.
    randomLoadout(char, level) {
      const pick = tbl => {
        const ids = Object.keys(tbl).filter(k => tbl[k].char === char);
        return ids[Math.floor(this.rng() * ids.length)] || '';
      };
      return this.loadout(char, level, pick(D.GADGETS), pick(D.PERKS));
    }

    burn(q, dps, t, src) {
      q.burnT = Math.max(q.burnT, t);
      q.burnDps = Math.max(q.burnDps, dps);
      q.burnSrc = src;
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
        case 'skill':
          if (act.aim != null) {
            p.a = act.aim;
            p.input.aim = act.aim;
          }
          if (act.ad != null) p.input.ad = act.ad;
          this.useSkill(p);
          break;
        case 'heal':
          this.drinkSoup(p);
          break;
        case 'gadget':
          this.useGadget(p);
          break;
        case 'overdrive':
          this.startOverdrive(p);
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
        if (o.k === 'bush' && !o.dead && (x - o.x) * (x - o.x) + (y - o.y) * (y - o.y) < o.r * o.r) {
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
        if (!o.blk || o.dead || (wallsOnly && o.k !== 'wall' && o.k !== 'plank')) continue;
        if (obstacleSegT(o, x0, y0, x1, y1) >= 0) {
          hit = true;
          break;
        }
      }
      q.length = 0;
      return hit;
    }

    // Heavier bodies (the boss, elites) are thrown less far by the same hit.
    massOf(p) {
      return (p.r / D.PLAYER_R) * (p.r / D.PLAYER_R);
    }

    knock(p, ix, iy) {
      if (this.held(p)) return;
      const m = this.massOf(p) * (p.char === 'bubbles' ? 2 : 1);
      p.kx += ix / m;
      p.ky += iy / m;
    }

    // Against a wall: walking into it slides along it, and being knocked into it stops with a small bounce
    // instead of pressing into the wall until the knockback fades.
    wallStop(p, n) {
      const kn = p.kx * n[0] + p.ky * n[1];
      if (kn < 0) {
        p.kx -= 1.25 * kn * n[0];
        p.ky -= 1.25 * kn * n[1];
      }
      const vn = p.vx * n[0] + p.vy * n[1];
      if (vn < 0) {
        p.vx -= vn * n[0];
        p.vy -= vn * n[1];
      }
    }

    // People on foot do not walk through each other: overlapping pairs are pushed apart, the lighter one more.
    separatePlayers() {
      const ps = this.players.filter(p => p.alive && !p.veh && p.jumpT <= 0);
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          const m = a.r + b.r;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= m * m) continue;
          const d = Math.sqrt(d2);
          const nx = d > 1e-6 ? dx / d : 1;
          const ny = d > 1e-6 ? dy / d : 0;
          const ia = 1 / this.massOf(a);
          const ib = 1 / this.massOf(b);
          const pen = m - d;
          a.x += (nx * pen * ia) / (ia + ib);
          a.y += (ny * pen * ia) / (ia + ib);
          b.x -= (nx * pen * ib) / (ia + ib);
          b.y -= (ny * pen * ib) / (ia + ib);
          this.resolvePlayer(a);
          this.resolvePlayer(b);
        }
      }
    }

    resolvePlayer(p) {
      const S = this.size;
      const r = p.r;
      for (let iter = 0; iter < 2; iter++) {
        const q = this.grid.query(p.x - r - 4, p.y - r - 4, p.x + r + 4, p.y + r + 4, this._q);
        for (const o of q) {
          if (!o.solid || o.dead) continue;
          const n = pushOut(p, r, o);
          if (n) this.wallStop(p, n);
        }
        q.length = 0;
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const m = D.VEHICLES[v.t].r + r;
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < m * m) {
          const d = Math.sqrt(d2) || 1;
          p.x = v.x + (dx / d) * m;
          p.y = v.y + (dy / d) * m;
        }
      }
      p.x = clamp(p.x, r, S - r);
      p.y = clamp(p.y, r, S - r);
    }

    updatePlayer(p, dt) {
      if (!p.alive) return;
      if (this.held(p)) {
        p.actions.length = 0;
        p.vx = 0;
        p.vy = 0;
        p.kx = 0;
        p.ky = 0;
        return;
      }
      for (const act of p.actions) this.handleAction(p, act);
      p.actions.length = 0;
      const inp = p.input;
      if (!p.veh) p.a = inp.aim;
      p.inBush = this.inBushAt(p.x, p.y);
      if (p.swingT > 0) p.swingT -= dt;
      p.jumpCool = Math.max(0, p.jumpCool - dt);
      p.skillCool = Math.max(0, p.skillCool - dt);
      p.boostT = Math.max(0, p.boostT - dt);
      p.gCool = Math.max(0, p.gCool - dt);
      p.odT = Math.max(0, p.odT - dt);
      p.bubT = Math.max(0, p.bubT - dt);
      if (p.bubT <= 0) p.bubHp = 0;
      p.slowT = Math.max(0, p.slowT - dt);

      if (!p.veh) {
        let mx = inp.mx;
        let my = inp.my;
        const ml = Math.hypot(mx, my);
        if (ml > 1) {
          mx /= ml;
          my /= ml;
        }
        let speed = D.SPEED * (p.char ? D.CHARS[p.char].speed : p.kind === 'boss' ? 0.85 : 0.95);
        const t = this.activeType(p);
        if (isGun(t)) speed *= D.WEAPONS[t].move;
        if (p.inject) speed *= 0.5;
        if (p.boostT > 0) speed *= 1.35;
        if (p.slowT > 0 && p.char !== 'bing') speed *= p.slowMul;
        if (p.odT > 0) speed *= D.OVERDRIVE.speed;
        if (p.perk === 'feather') speed *= 1.08;
        const sprinting = inp.sprint && ml > 0.1 && p.stamina > 0 && !p.inject;
        if (sprinting) {
          speed *= D.SPRINT_MUL;
          p.stamina = Math.max(0, p.stamina - D.STAMINA_DRAIN * (p.char === 'afeng' ? 0.7 : 1) * dt);
          p.sprintT = this.time;
        } else if (this.time - p.sprintT > 0.8) {
          p.stamina = Math.min(100, p.stamina + D.STAMINA_REGEN * (p.char === 'meibao' ? 1.5 : 1) * dt);
        }
        let tvx = mx * speed;
        let tvy = my * speed;
        let k = Math.min(1, dt * 14);
        if (p.rushT > 0) {
          p.rushT -= dt;
          tvx = p.rx * D.SPEED * 3.2;
          tvy = p.ry * D.SPEED * 3.2;
          k = 1;
        } else if (p.jumpT > 0) {
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
        if (p.rushT > 0) this.rushContacts(p);
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
          if (p.soups > 0) {
            p.soups--;
            this.heal(p, D.ITEMS.soup.heal);
          }
        }
      }
      if (!inp.shoot) p.triggerHeld = false;
      if (inp.shoot && !p.veh && p.jumpT <= 0 && p.rushT <= 0 && !p.inject) {
        if (isGun(this.activeType(p))) this.fireGun(p);
        else this.swingMelee(p);
      }

      if (!p.veh) {
        const q = this.itemGrid.query(p.x - p.r - 30, p.y - p.r - 30, p.x + p.r + 30, p.y + p.r + 30, this._q);
        const near = q.slice();
        q.length = 0;
        for (const it of near) {
          if (it.t !== 'bao' && it.t !== 'bag' && it.t !== 'soup' && it.t !== 'coldbox' && !(D.ITEMS[it.t] && D.ITEMS[it.t].lv)) continue;
          const m = p.r + D.ITEM_R;
          if ((it.x - p.x) * (it.x - p.x) + (it.y - p.y) * (it.y - p.y) < m * m) this.tryPickup(p, it, false);
        }
      }

      if (this.story && p === this.hero && this.time - p.hitT > 5 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + 3 * dt);
      if (p.burnT > 0) {
        p.burnT -= dt;
        this.damagePlayer(p, p.burnDps * dt, p.burnSrc, 'burn', true);
        if (!p.alive) return;
      }
      const z = this.zone;
      if (this.zoneOn && this.state === 'playing' && Math.hypot(p.x - z.x, p.y - z.y) > z.r) {
        this.damagePlayer(p, z.dps * dt, 0, 'zone', true);
      }
    }

    rushContacts(p) {
      for (const q of this.players) {
        if (!q.alive || q.veh || !this.enemies(p, q) || p.rushHit.has(q.id)) continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) > p.r + q.r + 10) continue;
        p.rushHit.add(q.id);
        this.knock(q, p.rx * 520, p.ry * 520);
        this.damagePlayer(q, p.rushDmg || 45, p.id, 'rush');
        if (p.perk === 'haymaker') this.chill(q, 1.5, 0.6);
        this.ev({ e: 'hit', x: q.x, y: q.y, ty: 'p', by: p.id, w: 'fists' });
      }
    }

    // Drinks one soup from the pouch; pressing again while drinking cancels.
    drinkSoup(p) {
      if (!p.alive || p.veh) return;
      if (p.inject) {
        p.inject = null;
        return;
      }
      if (p.soups <= 0) {
        this.toPlayer(p, 'noSoup');
        return;
      }
      if (p.hp >= p.maxHp) {
        this.toPlayer(p, 'fullHp');
        return;
      }
      p.reload = null;
      p.inject = { t: 0, total: D.ITEMS.soup.time * (p.perk === 'slurp' ? 0.5 : 1) };
    }

    spawnBullet(p, wid, ang, x, y) {
      const W = D.WEAPONS[wid];
      const sv = W.pellets > 1 ? 0.88 + this.rng() * 0.24 : 1;
      const rv = W.pellets > 1 ? 0.8 + this.rng() * 0.35 : 1;
      this.bullets.push({ id: this.nextId++, x: x != null ? x : p.x, y: y != null ? y : p.y, dx: Math.cos(ang), dy: Math.sin(ang), sp: W.speed * sv, range: W.range * rv, trav: 0, dmg: W.dmg, owner: p.id, team: p.team, w: wid, pierce: W.pierce || 0, bounce: W.bounce || 0, hits: null });
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
      const L = D.BOT_SKILL[this.difficulty];
      p.cool = W.delay * (p.kind === 'player' ? (p.bot && !p.pilot && !this.story ? L.botFire : 1) : (p.kind === 'boss' ? 2 : 1.8) * L.foeFire);
      p.lastShot = this.time;
      const moving = Math.hypot(p.vx, p.vy) > 40;
      const spread = W.spread * (moving ? 1.5 : 1) * DEG;
      for (let i = 0; i < W.pellets; i++) this.spawnBullet(p, s.t, p.a + (this.rng() * 2 - 1) * spread);
      this.ev({ e: 'shot', i: p.id, x: p.x, y: p.y, a: p.a, w: s.t });
      if (s.m === 0) {
        p.reload = { t: -W.delay, total: this.reloadTime(p, W) };
        this.ev({ e: 'reload', i: p.id, x: p.x, y: p.y });
      }
    }

    swingMelee(p) {
      if (p.cool > 0 || p.deploy > 0) return;
      const t = this.activeType(p);
      const M = D.WEAPONS[t];
      const boxer = t === 'fists' && p.char === 'luap';
      const dmg = boxer ? M.dmg * 2 : M.dmg;
      p.cool = boxer ? 0.26 : M.delay;
      p.swingT = 0.22;
      p.swingSide = -p.swingSide;
      this.ev({ e: 'swing', i: p.id, x: p.x, y: p.y, w: t });
      let best = null;
      let bd = Infinity;
      for (const q of this.players) {
        if (!q.alive || q.veh || !this.enemies(p, q)) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > p.r + q.r + M.range) continue;
        if (Math.abs(angleDiff(p.a, Math.atan2(dy, dx))) > M.arc) continue;
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      if (best) {
        const n = Math.max(1, bd);
        const kb = (M.kb || 70) * (best.kind === 'boss' ? 0.3 : 1);
        this.knock(best, ((best.x - p.x) / n) * kb, ((best.y - p.y) / n) * kb);
        if (M.burn) this.burn(best, M.burn.dps, M.burn.t, p.id);
        if (M.slow) {
          best.slowT = M.slow.t;
          best.slowMul = M.slow.mul;
        }
        this.damagePlayer(best, dmg, p.id, t);
        this.ev({ e: 'hit', x: (best.x + p.x) / 2, y: (best.y + p.y) / 2, ty: 'p', by: p.id, w: t });
        return;
      }
      const hx = p.x + Math.cos(p.a) * (p.r + M.range * 0.55);
      const hy = p.y + Math.sin(p.a) * (p.r + M.range * 0.55);
      const q = this.grid.query(hx - 30, hy - 30, hx + 30, hy + 30, this._q);
      let target = null;
      for (const o of q) {
        if (!o.dead && o.solid && o.k !== 'lantern' && circleHitsObstacle(hx, hy, 24, o)) {
          target = o;
          break;
        }
      }
      q.length = 0;
      if (target) {
        this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: target.k, by: p.id, w: t });
        this.damageObstacle(target, dmg * 1.5, p.id);
        return;
      }
      for (const v of this.vehicles) {
        if (!v.dead && Math.hypot(v.x - hx, v.y - hy) < D.VEHICLES[v.t].r + 10) {
          this.damageVehicle(v, dmg * 0.5, p.id);
          this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: p.id, w: t });
          return;
        }
      }
    }

    damagePlayer(p, amt, src, cause, quiet) {
      if (!p.alive || amt <= 0 || p.shieldT > this.time || this.held(p)) return;
      const att = src ? this.playerMap.get(src) : null;
      if (att && att !== p && !this.enemies(att, p)) return;
      if (att && att.kind !== 'player' && p.team === 1) amt *= D.BOT_SKILL[this.difficulty].foeDmg;
      else if (att && att.bot && !p.bot && this.mode === 'royale') amt *= D.BOT_SKILL[this.difficulty].botDmg * (this.teamMode === 'coop' ? D.COOP_BOT_DMG : 1);
      // Character level, Wok Overdrive and the Brittle perk raise damage dealt; Overdrive, the mouthguard and
      // Master Bing's cold blood lower damage taken; a bubble soaks up what is left first.
      if (att && att !== p && att.kind === 'player') amt *= att.dmgMul * (att.odT > 0 ? D.OVERDRIVE.dmg : 1) * (att.perk === 'brittle' && p.slowT > 0 ? 1.25 : 1);
      if (p.odT > 0) amt *= D.OVERDRIVE.taken;
      if (p.guardT > this.time) amt *= 0.4;
      if (cause === 'zone' && p.char === 'bing') amt *= 0.7;
      if (p.bubT > 0 && p.bubHp > 0) {
        const soak = Math.min(p.bubHp, amt);
        p.bubHp -= soak;
        amt -= soak;
        if (p.bubHp <= 0) this.ev({ e: 'pop', x: p.x, y: p.y });
        if (amt <= 0) return;
      }
      if (att && att !== p && att.odOk && att.odT <= 0) att.od = Math.min(1, att.od + amt / D.OVERDRIVE.need);
      if (att && att !== p && att.alive && att.kind === 'player') this.lifesteal(att, Math.min(amt, p.hp));
      p.hp -= amt;
      p.hitT = this.time;
      if (p.inject && cause !== 'zone' && cause !== 'burn') p.inject = null;
      if (att && att !== p) {
        att.dmgDealt += amt;
        p.lastAttacker = src;
      }
      if (!quiet) this.ev({ e: 'dmg', i: p.id, x: p.x, y: p.y, by: src, n: Math.round(amt) });
      if (p.hp <= 0) this.killPlayer(p, src, cause);
    }

    killPlayer(p, src, cause) {
      if (!p.alive) return;
      p.hp = 0;
      p.alive = false;
      p.deadT = this.time;
      p.reload = null;
      p.inject = null;
      p.burnT = 0;
      if (p.veh) this.exitVehicle(p);
      let alive = 0;
      for (const q of this.players) if (q.alive) alive++;
      p.placement = alive + 1;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (s && (p.kind === 'player' || this.rng() < (p.kind === 'boss' ? 1 : 0.35))) this.dropNear(p, s.t, s.m);
        p.slots[i] = null;
      }
      for (let i = 0; i < p.soups; i++) this.dropNear(p, 'soup');
      p.soups = 0;
      if (p.nslots > D.SLOTS) this.dropNear(p, 'bag');
      if (p.scope > 1) this.dropNear(p, 'scope' + p.scope);
      p.scope = 1;
      if (p.kind !== 'player' && this.rng() < 0.3) this.dropNear(p, 'bao');
      this.turrets = this.turrets.filter(t => t.owner !== p.id);
      const killer = src ? this.playerMap.get(src) : null;
      if (killer && killer !== p) {
        killer.kills++;
        if (killer.perk === 'tip') this.heal(killer, 25);
        if (killer.char === 'jinjin' && killer !== p) this.dropNear(p, 'bao');
        killer.streak = this.time - killer.streakT < 4 ? killer.streak + 1 : 1;
        killer.streakT = this.time;
        if (killer.streak >= 2) this.ev({ e: 'streak', to: killer.id, n: killer.streak });
        p.killer = killer.name;
        p.killerNk = killer.nk;
        p.killerId = killer.id;
      } else {
        p.killer = '';
        p.killerNk = cause === 'zone' ? 'zone' : '';
      }
      this.ev({ e: 'kill', g: 1, k: killer && killer !== p ? killer.name : '', knk: killer && killer !== p ? killer.nk : '', kid: killer ? killer.id : 0, v: p.name, vnk: p.nk, vid: p.id, w: cause, x: p.x, y: p.y, vt: p.team });
      if (this.story) {
        if (p.team === 2) this.story.killed++;
        if (p === this.hero) this.finish('fail', 'dead');
      } else {
        this.checkWin();
      }
    }

    checkWin() {
      if (this.state !== 'playing' || this.players.length < 2) return;
      if (this.teamMode !== 'ffa') {
        const left = new Set();
        for (const q of this.players) if (q.alive) left.add(q.team);
        if (left.size > 1) return;
        const team = left.size ? [...left][0] : 0;
        this.state = 'ended';
        this.winTeam = team;
        this.winner = this.players.find(q => q.alive) || null;
        this.result = team ? 'win' : 'none';
        for (const q of this.players) if (q.team === team) q.placement = 1;
        this.ev({ e: 'win', g: 1, n: this.winner ? this.winner.name : '', i: this.winner ? this.winner.id : 0, tm: team });
        return;
      }
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
        this.result = last ? 'win' : 'none';
        if (last) last.placement = 1;
        this.ev({ e: 'win', g: 1, n: last ? last.name : '', i: last ? last.id : 0 });
      }
    }

    finish(result, reason) {
      if (this.state !== 'playing') return;
      this.state = 'ended';
      this.result = result;
      this.failReason = reason || '';
      if (result === 'win') this.winner = this.hero;
      this.ev({ e: result === 'win' ? 'win' : 'fail', g: 1, r: reason || '', i: this.hero ? this.hero.id : 0 });
    }

    damageObstacle(o, dmg, src) {
      if (o.dead || !o.mhp) return;
      o.hp -= dmg;
      if (o.hp > 0) return;
      o.hp = 0;
      o.dead = true;
      this.ev({ e: 'break', x: o.x, y: o.y, k: o.k, id: o.id });
      if (o.k === 'plank' && o.b >= 0) this.checkCollapse(this.buildings[o.b]);
      if (o.k === 'crate') {
        this.spawnItem(o.x, o.y, this.rollItem(1));
        if (this.rng() < 0.35) this.spawnItem(o.x + 30, o.y + 10, this.rollItem(1));
      }
    }

    // A wooden building falls in once half of its wall pieces are broken: the rest of the walls and the roof go.
    checkCollapse(b) {
      if (!b || b.broken || !b.walls) return;
      let down = 0;
      for (const id of b.walls) if (this.obstacles[id].dead) down++;
      if (down * 2 < b.walls.length) return;
      b.broken = true;
      for (const id of b.walls) {
        const o = this.obstacles[id];
        o.dead = true;
        o.hp = 0;
      }
      this.ev({ e: 'collapse', x: b.x, y: b.y, w: b.w, h: b.h, id: b.id });
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

    explode(x, y, radius, dmg, src, spare) {
      this.ev({ e: 'exp', x, y, r: radius });
      for (const p of this.players) {
        if (!p.alive || p.veh || (spare && p.id === spare)) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d > radius + p.r) continue;
        let f = 1 - Math.max(0, d - p.r) / radius;
        if (this.losBlocked(x, y, p.x, p.y, true)) f *= 0.25;
        const n = Math.max(1, d);
        this.knock(p, ((p.x - x) / n) * 420 * f, ((p.y - y) / n) * 420 * f);
        this.damagePlayer(p, dmg * f, src, 'explosion');
      }
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const d = Math.hypot(v.x - x, v.y - y);
        if (d < radius) this.damageVehicle(v, dmg * (1 - d / radius), src);
      }
      for (const o of this.grid.query(x - radius, y - radius, x + radius, y + radius, [])) {
        if (!o.dead && o.mhp && Math.hypot(o.x - x, o.y - y) < radius) this.damageObstacle(o, dmg, src);
      }
    }

    // ---------- story ----------

    startStory(name, char, lo) {
      const ch = this.chapter;
      const S = this.size;
      let hx = S / 2;
      let hy = S / 2 - 60;
      if (ch.start === 'random') {
        const sp = this.findSpot(S / 2, S / 2, 300, 1300, PR);
        hx = sp[0];
        hy = sp[1];
      } else if (ch.start === 'yard') {
        const yd = this.yard;
        const a = Math.atan2(S / 2 - yd.y, S / 2 - yd.x);
        const sp = this.findSpot(yd.x + Math.cos(a) * 900, yd.y + Math.sin(a) * 900, 0, 120, PR);
        hx = sp[0];
        hy = sp[1];
      }
      const heroLo = lo || {};
      const heroId = this.addPlayer(name, false, { char, team: 1, x: hx, y: hy, level: heroLo.level, gadget: heroLo.gadget, perk: heroLo.perk });
      this.hero = this.playerMap.get(heroId);
      this.hero.skillCool = 0;
      this.story = { def: ch, goal: ch.goal, killed: 0, collected: 0, tl: ch.goal.time || 0, waveIdx: 0, waveT: ch.waves ? ch.waves.first || 6 : 0, boxes: [] };
      for (const g of ch.gifts || []) {
        const sp = this.findSpot(hx, hy, g.d * 0.7, g.d, D.ITEM_R);
        this.spawnItem(sp[0], sp[1], g.t);
      }
      for (let i = 0; i < (ch.crates || 0); i++) {
        const sp = this.findSpot(hx, hy, 260, 420, 44);
        this.addObstacle('crate', 'r', sp[0], sp[1], { hw: 30, hh: 30 });
      }
      for (let i = 0; i < 18; i++) {
        const sp = this.findSpot(S / 2, S / 2, 400, 1800, D.ITEM_R);
        this.spawnItem(sp[0], sp[1], this.rollItem(0));
      }
      if (ch.goal.type === 'collect') {
        const boxes = [];
        for (let t = 0; t < 400 && boxes.length < ch.goal.count; t++) {
          const sp = this.findSpot(S / 2, S / 2, 500, 1750, 30);
          if (Math.hypot(sp[0] - hx, sp[1] - hy) < 600) continue;
          if (boxes.some(b => Math.hypot(b[0] - sp[0], b[1] - sp[1]) < 800)) continue;
          boxes.push(sp);
        }
        while (boxes.length < ch.goal.count) boxes.push(this.findSpot(S / 2, S / 2, 500, 1700, 30));
        for (const b of boxes) this.spawnItem(b[0], b[1], 'coldbox');
        this.story.boxes = boxes;
      }
      const allyChars = D.CORE_IDS.filter(c => c !== char);
      for (let i = 0; i < (ch.allies || 0) && i < allyChars.length; i++) {
        const sp = this.findSpot(hx, hy, 60, 140, PR);
        const alo = this.randomLoadout(allyChars[i], this.hero.lvl);
        this.addPlayer('', true, { char: allyChars[i], team: 1, ally: true, weapon: ALLY_WEAPONS[allyChars[i]], x: sp[0], y: sp[1], follow: heroId, hunt: 0, level: alo.level, gadget: alo.gadget, perk: alo.perk });
      }
      for (const grp of ch.enemies || []) {
        for (let i = 0; i < grp.n; i++) {
          let sp;
          if (grp.near === 'boxes' && this.story.boxes.length) {
            const b = this.story.boxes[i % this.story.boxes.length];
            for (let t = 0; t < 20; t++) {
              sp = this.findSpot(b[0], b[1], 120, 380, 26);
              if (Math.hypot(sp[0] - hx, sp[1] - hy) > 750) break;
            }
          } else if (grp.near === 'yard') {
            sp = this.findSpot(this.yard.x, this.yard.y, 0, 260, D.FOES[grp.kind].r);
          } else if (grp.dist) {
            sp = this.findSpot(hx, hy, grp.dist[0], grp.dist[1], 26);
          } else {
            sp = this.findSpot(hx, hy, 900, 2200, 26);
          }
          const foe = this.spawnFoe(grp.kind, grp.weapons, sp[0], sp[1]);
          foe.ai.sleepT = grp.stagger ? 2 + i * grp.stagger : 3;
        }
      }
      if (this.players.some(p => p.kind === 'boss')) this.ev({ e: 'msg', g: 1, k: 'msg_boss' });
      return heroId;
    }

    spawnFoe(kind, weapons, x, y) {
      const hpMul = D.BOT_SKILL[this.difficulty].foeHp;
      const w = weapons[Math.floor(this.rng() * weapons.length)];
      const id = this.addPlayer('', true, { kind, team: 2, weapon: w === 'fists' ? null : w, x, y, hpMul, hunt: this.chapter.hunt || 800 });
      const p = this.playerMap.get(id);
      p.skillCool = 99999;
      p.ai.sightMul = kind === 'boss' ? 1.1 : 0.8;
      p.ai.reactMul = kind === 'boss' ? 1 : 1.3;
      return p;
    }

    updateStory(dt) {
      const st = this.story;
      if (!st || this.state !== 'playing') return;
      const g = st.goal;
      const ch = st.def;
      if (ch.waves) {
        st.waveT -= dt;
        if (st.waveT <= 0) {
          st.waveT = ch.waves.every;
          const n = ch.waves.n[Math.min(st.waveIdx, ch.waves.n.length - 1)];
          st.waveIdx++;
          const hero = this.hero;
          for (let i = 0; i < n; i++) {
            const k = this.rng() < 0.15 + st.waveIdx * 0.03 ? ch.waves.kinds[1] : ch.waves.kinds[0];
            let sp;
            if (ch.waves.near === 'yard') sp = this.findSpot(this.yard.x, this.yard.y, 200, 420, 26);
            else sp = this.findSpot(hero.x, hero.y, 1050, 1400, 26);
            this.spawnFoe(k[0], k[1], sp[0], sp[1]);
          }
          this.ev({ e: 'msg', g: 1, k: 'msg_wave', a: [st.waveIdx] });
        }
      }
      if (g.type === 'kill' && st.killed >= g.count) this.finish('win');
      else if (g.type === 'collect') {
        st.tl -= dt;
        if (st.collected >= g.count) this.finish('win');
        else if (st.tl <= 0) this.finish('fail', 'time');
      } else if (g.type === 'survive') {
        st.tl -= dt;
        if (st.tl <= 0) this.finish('win');
      } else if (g.type === 'eliminate') {
        if (!this.players.some(p => p.alive && p.team === 2)) this.finish('win');
      } else if (g.type === 'boss') {
        if (!this.players.some(p => p.alive && p.kind === 'boss')) this.finish('win');
      }
    }

    objective() {
      const st = this.story;
      if (!st) return null;
      const g = st.goal;
      const o = { ty: g.type, cur: 0, need: g.count || 0, tl: Math.max(0, Math.round(st.tl * 10) / 10) };
      if (g.type === 'kill') o.cur = Math.min(st.killed, g.count);
      else if (g.type === 'collect') o.cur = st.collected;
      else if (g.type === 'eliminate') o.cur = this.players.filter(p => p.alive && p.team === 2).length;
      return o;
    }

    // ---------- start-of-match math problem ----------

    // Each person brings their own problem (seed and grade, set on their account; an unsolved one comes back
    // until it is solved). Nothing moves until somebody solves theirs; each person starts as soon as they
    // solve theirs, and the bots come in together with the last person to solve one.
    startQuiz() {
      this.quiz = { clock: 0, open: false, botsIn: false };
      for (const p of this.players) this.giveQuiz(p);
      this.checkQuiz();
    }

    giveQuiz(p, spec) {
      if (!this.quiz || p.bot || p.kind !== 'player') return;
      spec = spec || p.quizSpec || {};
      const seed = Number(spec.seed) >>> 0 || Q.newSeed();
      p.quiz = { seed, grade: Q.normGrade(spec.grade == null ? Q.DEFAULT_GRADE : spec.grade), t0: this.quiz.clock, lock: 0, wrong: 0 };
    }

    // People still solving and bots still waiting are not in play: they cannot move, be hurt or be targeted.
    held(p) {
      return !!this.quiz && (!!p.quiz || (p.bot && !this.quiz.botsIn));
    }

    // Runs the problem part of a step. Returns false while the whole world is still waiting.
    stepQuiz(dt) {
      const qz = this.quiz;
      qz.clock += dt;
      for (const p of this.players) {
        if (!p.quiz) continue;
        for (const a of p.actions) if (a.a === 'quiz' && p.quiz) this.answerQuiz(p, a);
        p.actions.length = 0;
      }
      this.checkQuiz();
      return qz.open;
    }

    checkQuiz() {
      const qz = this.quiz;
      if (qz.botsIn || this.players.some(p => p.quiz && p.alive)) return;
      qz.open = true;
      qz.botsIn = true;
      if (this.players.some(p => p.bot && p.alive) && this.players.some(p => !p.bot)) this.ev({ e: 'msg', g: 1, k: 'msg_botsIn' });
    }

    answerQuiz(p, act) {
      const qz = this.quiz;
      const skip = act.skip != null;
      if (skip) {
        // The family skip code lets a person start without answering (and without experience).
        if (!Q.codeOk('skip', act.skip)) {
          this.ev({ e: 'quiz', to: p.id, ok: 0, code: 1 });
          return;
        }
      } else {
        if (qz.clock < p.quiz.lock) return;
        if (Q.norm(act.ans) !== Q.make(p.quiz.seed, p.quiz.grade).ans) {
          p.quiz.wrong++;
          p.quiz.lock = qz.clock + D.QUIZ_WAIT;
          this.ev({ e: 'quiz', to: p.id, ok: 0 });
          return;
        }
      }
      const t = Math.round((qz.clock - p.quiz.t0) * 10) / 10;
      const done = p.quiz;
      p.quiz = null;
      p.shieldT = this.time + 2;
      qz.open = true;
      this.ev({ e: 'quiz', to: p.id, ok: 1, t, s: done.seed, g: done.grade, skip: skip ? 1 : 0 });
      this.ev({ e: 'msg', g: 1, k: skip ? 'msg_skipped' : 'msg_solved', a: [p.name, t] });
    }

    quizHud(p) {
      if (!p.quiz) return null;
      const qz = this.quiz;
      return { s: p.quiz.seed, g: p.quiz.grade, lk: Math.max(0, Math.ceil(p.quiz.lock - qz.clock)), c: Math.round((qz.clock - p.quiz.t0) * 10) / 10 };
    }

    // ---------- step ----------

    step(dt) {
      this.events.length = 0;
      this.clock += dt;
      if (this.quiz && !this.stepQuiz(dt)) return;
      this.time += dt;
      this.updateZone(dt);
      for (const p of this.players) {
        if (p.bot && p.alive && !this.held(p)) this.botUpdate(p, dt);
      }
      for (const p of this.players) this.updatePlayer(p, dt);
      this.separatePlayers();
      this.updateTurrets(dt);
      this.updateVehicles(dt);
      this.updateBullets(dt);
      this.updateSecrets(dt);
      this.updateRespawns();
      this.updateGadgets(dt);
      this.updateStory(dt);
    }

    updateSecrets(dt) {
      const c = this.cat;
      if (c) {
        c.petT = Math.max(0, c.petT - dt);
        if (c.sitT > 0) {
          c.sitT -= dt;
        } else {
          const dx = c.tx - c.x;
          const dy = c.ty - c.y;
          const d = Math.hypot(dx, dy);
          if (d < 4) {
            c.sitT = 2 + this.sr() * 5;
            this.catTarget(c);
          } else {
            const step = Math.min(d, 55 * dt);
            c.a = Math.atan2(dy, dx);
            c.x += (dx / d) * step;
            c.y += (dy / d) * step;
          }
        }
      }
      const g = this.gold;
      if (g && !g.taken) {
        for (const p of this.players) {
          if (p.bot || !p.alive || p.veh || Math.hypot(p.x - g.x, p.y - g.y) > p.r + 16) continue;
          g.taken = true;
          p.hp = p.maxHp;
          p.boostT = Math.max(p.boostT, 4);
          this.ev({ e: 'heal', i: p.id, x: p.x, y: p.y });
          this.toPlayer(p, 'pick_gold', [], true);
          this.secret(p, 'gold');
          break;
        }
      }
      for (const it of this.items.values()) {
        if (it.t === 'drop' && !it.landed && this.time >= it.land) {
          it.landed = true;
          this.ev({ e: 'land', x: it.x, y: it.y });
        }
      }
      if (this.state !== 'playing') return;
      const pl = this.plane;
      if (!pl) {
        this.planeT -= dt;
        if (this.planeT <= 0) this.launchPlane();
        return;
      }
      const sp = 620 * dt;
      pl.x += pl.dx * sp;
      pl.y += pl.dy * sp;
      pl.trav += sp;
      if (!pl.dropped && pl.trav >= pl.dropAt) {
        pl.dropped = true;
        let open = 0;
        for (const it of this.items.values()) if (it.t === 'drop') open++;
        if (open < 2) {
          const it = this.spawnItem(pl.tx, pl.ty, 'drop');
          it.land = this.time + 4;
          it.landed = false;
        }
      }
      if (pl.trav >= pl.len) {
        this.plane = null;
        this.planeT = 75 + this.sr() * 35;
      }
    }

    // The cold-chain cargo plane crosses the map and drops a crate near the middle of the safe area.
    launchPlane() {
      const R = this.sr;
      const S = this.size;
      const z = this.zone;
      let tx = S / 2;
      let ty = S / 2;
      for (let t = 0; t < 40; t++) {
        let x;
        let y;
        if (this.zoneOn) {
          const a = R() * TAU;
          const d = Math.sqrt(R()) * z.tr * 0.6;
          x = z.x + Math.cos(a) * d;
          y = z.y + Math.sin(a) * d;
        } else {
          x = 400 + R() * (S - 800);
          y = 400 + R() * (S - 800);
        }
        if (x < 120 || y < 120 || x > S - 120 || y > S - 120) continue;
        if (this.blockedAt(x, y, 40) || this.insideBuilding(x, y, 20)) continue;
        tx = x;
        ty = y;
        break;
      }
      const a = R() * TAU;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const back = 3200;
      this.plane = { x: tx - dx * back, y: ty - dy * back, dx, dy, a, tx, ty, trav: 0, dropAt: back, len: back * 2, dropped: false };
      this.ev({ e: 'msg', g: 1, k: 'msg_plane' });
    }

    updateTurrets(dt) {
      for (let i = this.turrets.length - 1; i >= 0; i--) {
        const t = this.turrets[i];
        t.life -= dt;
        if (t.life <= 0) {
          this.turrets.splice(i, 1);
          continue;
        }
        t.cool -= dt;
        const owner = this.playerMap.get(t.owner);
        if (!owner) continue;
        // A bot's turret aims only as well as that bot would at this level.
        const P = owner.bot && !owner.pilot ? D.BOT_SKILL[this.difficulty] : null;
        let best = null;
        let bd = P ? Math.min(D.WEAPONS.turret.range, P.sight) : D.WEAPONS.turret.range;
        for (const q of this.players) {
          if (!q.alive || q.veh || !this.enemies(owner, q) || this.held(q)) continue;
          const d = Math.hypot(q.x - t.x, q.y - t.y);
          if (d < bd && !this.losBlocked(t.x, t.y, q.x, q.y)) {
            bd = d;
            best = q;
          }
        }
        if (!best) continue;
        const want = Math.atan2(best.y - t.y, best.x - t.x);
        t.a += clamp(angleDiff(t.a, want), -8 * dt, 8 * dt);
        if (t.cool <= 0 && Math.abs(angleDiff(t.a, want)) < 0.2) {
          t.cool = 0.28 * (P ? 1 + P.react : 1) * (t.fast ? 0.5 : 1);
          this.spawnBullet(owner, 'turret', t.a + (this.rng() - 0.5) * (0.06 + (P ? P.aimNoise * 2 : 0)), t.x + Math.cos(t.a) * 20, t.y + Math.sin(t.a) * 20);
          if (t.ap) this.bullets[this.bullets.length - 1].dmg *= 1.4;
          this.ev({ e: 'shot', i: 0, x: t.x, y: t.y, a: t.a, w: 'turret' });
        }
      }
    }

    // Vehicles keep their momentum in the world; the tyres pull the sideways part of it back toward the
    // heading, up to their grip, so hard cornering at speed slides and the handbrake drifts. The engine
    // pushes along the heading against air drag (which sets top speed) and rolling resistance. Steering
    // follows a fixed turning circle at low speed and the tyres' grip at high speed.
    updateVehicles(dt) {
      const S = this.size;
      for (const v of this.vehicles) {
        if (v.dead) continue;
        const V = D.VEHICLES[v.t];
        const drv = v.driver ? this.playerMap.get(v.driver) : null;
        if (drv && !drv.alive) v.driver = 0;
        const inp = drv && drv.alive ? drv.input : null;
        const thr = inp ? clamp(-inp.my, -1, 1) : 0;
        const steer = inp ? clamp(inp.mx, -1, 1) : 0;
        const handbrake = !!(inp && inp.brake);
        const fx = Math.cos(v.a);
        const fy = Math.sin(v.a);
        let vf = v.vx * fx + v.vy * fy;
        let vr = -v.vx * fy + v.vy * fx;
        // Afeng drives 20% faster: more engine force against the same drag curve scaled to the higher top speed.
        const rider = drv && drv.char === 'afeng' ? 1.2 : 1;
        if (thr > 0.05) vf += (vf < -20 ? V.brake : V.accel * rider * thr) * dt;
        else if (thr < -0.05) vf += (vf > 20 ? -V.brake : V.accel * 0.6 * thr) * dt;
        vf -= ((V.accel * rider) / (V.max * rider * V.max * rider)) * vf * Math.abs(vf) * dt;
        const roll = (Math.abs(thr) > 0.05 ? 30 : 170) * dt;
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), roll);
        if (handbrake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), V.brake * 0.8 * dt);
        if (vf < -V.rev) vf = -V.rev;
        const grip = V.grip * (handbrake ? 0.3 : 1);
        vr -= Math.sign(vr) * Math.min(Math.abs(vr), grip * dt);
        const sp = Math.abs(vf);
        const yaw = Math.min(sp / V.turnR, V.turn, (V.grip * (handbrake ? 1.6 : 1.1)) / Math.max(sp, 1));
        v.vx = fx * vf - fy * vr;
        v.vy = fy * vf + fx * vr;
        v.a += steer * yaw * Math.sign(vf) * dt;
        v.x += v.vx * dt;
        v.y += v.vy * dt;
        v.sp = vf;
        v.slip = Math.abs(vr);
        const q = this.grid.query(v.x - V.r - 4, v.y - V.r - 4, v.x + V.r + 4, v.y + V.r + 4, this._q);
        for (const o of q) {
          if (!o.solid || o.dead) continue;
          const n = pushOut(v, V.r, o);
          if (!n) continue;
          const vn = v.vx * n[0] + v.vy * n[1];
          if (vn >= 0) continue;
          const impact = -vn;
          // Crates and wooden walls give way to a hard enough hit; the vehicle loses some speed going through.
          if ((o.k === 'crate' && impact > 260) || (o.k === 'plank' && impact > 220)) {
            this.damageObstacle(o, impact * (o.k === 'plank' ? 0.7 : 0.5), v.driver);
            if (o.dead) {
              v.vx *= 0.75;
              v.vy *= 0.75;
              continue;
            }
          }
          this.bounce(v, n, vn, 0.3);
          if (impact > 220) this.damageVehicle(v, (impact - 200) * 0.08, 0);
          if (impact > 120) this.ev({ e: 'crash', x: v.x, y: v.y });
        }
        q.length = 0;
        if (v.dead) continue;
        const edge = [[v.x < V.r, 1, 0], [v.x > S - V.r, -1, 0], [v.y < V.r, 0, 1], [v.y > S - V.r, 0, -1]];
        v.x = clamp(v.x, V.r, S - V.r);
        v.y = clamp(v.y, V.r, S - V.r);
        for (const [hitEdge, nx, ny] of edge) {
          const vn = v.vx * nx + v.vy * ny;
          if (hitEdge && vn < 0) this.bounce(v, [nx, ny], vn, 0.3);
        }
      }
      this.vehicleCollisions();
      for (const v of this.vehicles) {
        if (v.dead) continue;
        this.vehicleHitsPlayers(v);
        const drv = v.driver ? this.playerMap.get(v.driver) : null;
        if (drv && drv.alive) {
          drv.x = v.x;
          drv.y = v.y;
          drv.vx = v.vx;
          drv.vy = v.vy;
        }
      }
      for (let i = this.vehicles.length - 1; i >= 0; i--) {
        if (this.vehicles[i].dead) this.vehicles.splice(i, 1);
      }
    }

    // Reflects the part of the velocity going into a surface (restitution e) and scrapes a little off the
    // part sliding along it; the sliding part is otherwise kept.
    bounce(v, n, vn, e) {
      v.vx -= (1 + e) * vn * n[0];
      v.vy -= (1 + e) * vn * n[1];
      const scrape = 1 - 0.15 * Math.min(1, -vn / 400);
      const tn = v.vx * n[0] + v.vy * n[1];
      v.vx = n[0] * tn + (v.vx - n[0] * tn) * scrape;
      v.vy = n[1] * tn + (v.vy - n[1] * tn) * scrape;
    }

    // Vehicle against vehicle: separate them and exchange momentum by mass along the contact line.
    vehicleCollisions() {
      const vs = this.vehicles;
      for (let i = 0; i < vs.length; i++) {
        const a = vs[i];
        if (a.dead) continue;
        const A = D.VEHICLES[a.t];
        for (let j = i + 1; j < vs.length; j++) {
          const b = vs[j];
          if (b.dead) continue;
          const B = D.VEHICLES[b.t];
          const m = A.r + B.r;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= m * m) continue;
          const d = Math.sqrt(d2) || 1;
          const nx = d2 > 0 ? dx / d : 1;
          const ny = d2 > 0 ? dy / d : 0;
          const inv = 1 / A.mass + 1 / B.mass;
          const pen = m - d;
          a.x += nx * pen * (1 / A.mass) / inv;
          a.y += ny * pen * (1 / A.mass) / inv;
          b.x -= nx * pen * (1 / B.mass) / inv;
          b.y -= ny * pen * (1 / B.mass) / inv;
          const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (rel >= 0) continue;
          const imp = (-(1 + 0.25) * rel) / inv;
          a.vx += (imp * nx) / A.mass;
          a.vy += (imp * ny) / A.mass;
          b.vx -= (imp * nx) / B.mass;
          b.vy -= (imp * ny) / B.mass;
          const impact = -rel;
          if (impact > 220) {
            this.damageVehicle(a, impact * 0.04 * (B.mass / A.mass), b.driver);
            this.damageVehicle(b, impact * 0.04 * (A.mass / B.mass), a.driver);
          }
          if (impact > 120) this.ev({ e: 'crash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        }
      }
    }

    // A person is far lighter than a vehicle. Only the vehicle's own motion toward the person counts: a
    // vehicle driving into someone throws them off at about its closing speed and, if fast enough, hurts
    // them; a person walking or running into a parked or slow vehicle just stops against it, like a wall.
    vehicleHitsPlayers(v) {
      const V = D.VEHICLES[v.t];
      const drv = v.driver ? this.playerMap.get(v.driver) : null;
      for (const p of this.players) {
        if (!p.alive || p.veh) continue;
        const m = V.r + p.r;
        const dx = p.x - v.x;
        const dy = p.y - v.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= m * m) continue;
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d;
        const ny = dy / d;
        p.x = v.x + nx * m;
        p.y = v.y + ny * m;
        const push = v.vx * nx + v.vy * ny;
        if (push > 40) {
          const rel = push - ((p.vx + p.kx) * nx + (p.vy + p.ky) * ny);
          if (rel > 0) {
            const pm = D.PLAYER_MASS * this.massOf(p);
            const dvp = (1.3 * rel * V.mass) / (V.mass + pm);
            p.kx += nx * dvp;
            p.ky += ny * dvp;
            v.vx -= (nx * dvp * pm) / V.mass;
            v.vy -= (ny * dvp * pm) / V.mass;
          }
          if (push > 150 && this.time - p.ranT > 0.6 && (!drv || this.enemies(drv, p))) {
            p.ranT = this.time;
            this.damagePlayer(p, push * V.ram, v.driver, 'vehicle');
            this.ev({ e: 'hit', x: p.x, y: p.y, ty: 'p', by: v.driver });
          }
        } else {
          this.wallStop(p, [nx, ny]);
        }
        this.resolvePlayer(p);
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
          if (b.team && p.team === b.team) continue;
          if (b.hits && b.hits.has(p.id)) continue;
          const t = segCircle(b.x, b.y, x1, y1, p.x, p.y, p.r);
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
        if (!hit) {
          b.x = x1;
          b.y = y1;
          b.trav += step;
          if (done) this.bullets.splice(i, 1);
          continue;
        }
        const hx = b.x + (x1 - b.x) * bestT;
        const hy = b.y + (y1 - b.y) * bestT;
        const W = D.WEAPONS[b.w];
        let dmg = b.dmg;
        if (W.falloff) dmg *= 1 - W.falloff * ((b.trav + step * bestT) / W.range);
        if (type === 1) {
          this.ev({ e: 'hit', x: hx, y: hy, ty: 'o', k: hit.k, by: b.owner, w: b.w });
          this.damageObstacle(hit, dmg, b.owner);
          if (b.bounce > 0 && !hit.dead) {
            const n = surfaceNormal(hit, hx, hy);
            const dot = b.dx * n[0] + b.dy * n[1];
            b.dx -= 2 * dot * n[0];
            b.dy -= 2 * dot * n[1];
            b.x = hx + n[0] * 3;
            b.y = hy + n[1] * 3;
            b.trav += step * bestT;
            b.bounce--;
            continue;
          }
          this.bullets.splice(i, 1);
          continue;
        }
        if (type === 2) {
          this.ev({ e: 'hit', x: hx, y: hy, ty: 'p', by: b.owner, w: b.w });
          if (W.kb) {
            const k = W.kb * (hit.kind === 'boss' ? 0.3 : 1);
            this.knock(hit, b.dx * k, b.dy * k);
          }
          this.damagePlayer(hit, dmg, b.owner, b.w === 'turret' ? 'turret' : b.w);
          if (b.pierce > 0) {
            b.pierce--;
            if (!b.hits) b.hits = new Set();
            b.hits.add(hit.id);
            b.x = hx + b.dx * 2;
            b.y = hy + b.dy * 2;
            b.trav += step * bestT;
            continue;
          }
          this.bullets.splice(i, 1);
          continue;
        }
        this.ev({ e: 'hit', x: hx, y: hy, ty: 'v', by: b.owner, w: b.w });
        if (hit.t === 'bike' && hit.driver) {
          const drv = this.playerMap.get(hit.driver);
          if (drv) this.damagePlayer(drv, dmg * 0.5, b.owner, b.w);
          this.damageVehicle(hit, dmg * 0.5, b.owner);
        } else {
          this.damageVehicle(hit, dmg, b.owner);
        }
        this.bullets.splice(i, 1);
      }
    }

    // ---------- bots ----------

    worstWeaponSlot(p) {
      let worst = -1;
      let wr = Infinity;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (!s) continue;
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

    botWant(p, it) {
      if (it.t === 'drop') return it.land <= this.time ? 8 : 0;
      if (it.t === 'coldbox') return p.team === 1 ? 9 : 0;
      if (it.t === 'bao') return p.hp < p.maxHp * 0.85 ? 2 + 7 * (1 - p.hp / p.maxHp) : 0;
      if (it.t === 'bag') return p.nslots < D.SLOTS_BAG ? 6 : 0;
      if (D.ITEMS[it.t] && D.ITEMS[it.t].lv) return 0;
      if (it.t === 'soup') return p.soups < this.soupCap(p) ? (p.hp < p.maxHp * 0.7 ? 6 : 3) : 0;
      const r = RANK[it.t] || 0;
      if (this.hasEmptySlot(p)) return 5 + r;
      const w = this.worstWeaponSlot(p);
      if (w < 0) return 0;
      const wr = RANK[p.slots[w].t];
      return r > wr + 1 ? 3 + r - wr : 0;
    }

    botDecide(p, P) {
      const ai = p.ai;
      let tgt = ai.target ? this.playerMap.get(ai.target) : null;
      if (tgt && (!tgt.alive || this.held(tgt) || Math.hypot(tgt.x - p.x, tgt.y - p.y) > P.sight * 1.3)) tgt = null;
      const ramp = this.mode === 'royale' && this.time < 75 ? 0.15 + 0.85 * (this.time / 75) : 1;
      let best = null;
      let bd = Infinity;
      for (const q of this.players) {
        if (!q.alive || !this.enemies(p, q) || this.held(q)) continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        let sight = P.sight * ramp * (ai.sightMul || 1);
        if (q.inBush && this.time - q.lastShot > 1.5) sight *= 0.35;
        if (d > sight || d >= bd) continue;
        if (this.losBlocked(p.x, p.y, q.x, q.y)) continue;
        best = q;
        bd = d;
      }
      if (best && (!tgt || bd < Math.hypot(tgt.x - p.x, tgt.y - p.y) * 0.7)) tgt = best;
      if (!tgt && p.lastAttacker && this.time - p.hitT < 2.5) {
        const a = this.playerMap.get(p.lastAttacker);
        if (a && a.alive && this.enemies(p, a) && Math.hypot(a.x - p.x, a.y - p.y) < 1400) tgt = a;
      }
      let gunSlot = -1;
      let gunRank = -1;
      let meleeSlot = -1;
      let meleeRank = 0;
      let emptySlot = -1;
      for (let i = 0; i < p.nslots; i++) {
        const s = p.slots[i];
        if (!s) {
          if (emptySlot < 0) emptySlot = i;
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
      if (tgt && gunSlot < 0 && this.mode === 'royale') {
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
      ai.aimErr = (this.rng() * 2 - 1) * P.aimNoise * ai.aimMul;
      const tdist = tgt ? Math.hypot(tgt.x - p.x, tgt.y - p.y) : Infinity;
      const threat = tgt && ai.los && tdist < 600;

      ai.heal = !!p.inject;
      if (p.soups > 0 && !threat && !p.inject && p.hp < p.maxHp * 0.6) {
        ai.heal = true;
        p.actions.push({ a: 'heal' });
      } else if (!p.inject) {
        let want = p.act;
        if (gunSlot >= 0 && (meleeSlot < 0 || tdist > 160 || meleeRank < 5)) want = gunSlot;
        else if (meleeSlot >= 0) want = meleeSlot;
        else if (gunSlot >= 0) want = gunSlot;
        else if (emptySlot >= 0) want = emptySlot;
        if (p.act !== want) p.actions.push({ a: 'slot', i: want });
      }
      if (!threat && !p.reload && p.act === gunSlot && gunSlot >= 0) {
        const s = p.slots[gunSlot];
        if (s.m < D.WEAPONS[s.t].mag * 0.5) p.actions.push({ a: 'reload' });
      }
      // In Paradise Brawl bots hold their skills for the first 20 seconds, while everyone gears up.
      if (p.char && p.skillCool <= 0 && !(this.mode === 'royale' && this.time < 20)) {
        const sk = D.CHARS[p.char].skill.id;
        if (sk === 'flame' && tgt && tdist < 150) p.actions.push({ a: 'skill' });
        else if (sk === 'rush' && tgt && ai.los && tdist > 120 && tdist < 330) {
          p.a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          p.input.aim = p.a;
          p.actions.push({ a: 'skill' });
        } else if (sk === 'turret' && tgt && ai.los && tdist < 600) p.actions.push({ a: 'skill' });
        else if (sk === 'boba' && (p.hp < p.maxHp * 0.6 || (tgt && tdist > 300 && tdist < 700))) p.actions.push({ a: 'skill' });
        else if ((sk === 'parcel' || sk === 'coins') && tgt && ai.los && tdist > 120 && tdist < (sk === 'parcel' ? 420 : 380)) {
          p.a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          p.input.aim = p.a;
          p.input.ad = tdist;
          p.actions.push({ a: 'skill' });
        } else if (sk === 'bubble' && (p.hp < p.maxHp * 0.7 || (tgt && tdist < 300))) p.actions.push({ a: 'skill' });
        else if (sk === 'freeze' && tgt && tdist < 180) p.actions.push({ a: 'skill' });
      }
      if (p.gadget && p.gUses > 0 && p.gCool <= 0 && tgt && tdist < 260 && this.rng() < 0.25 && !(this.mode === 'royale' && this.time < 20)) {
        const healer = p.gadget === 'taste' || p.gadget === 'rinse' || p.gadget === 'icepack' || p.gadget === 'extra';
        if (!healer || p.hp < p.maxHp * 0.55) p.actions.push({ a: 'gadget' });
      }
      if (p.odOk && p.od >= 1 && tgt && tdist < 500) p.actions.push({ a: 'overdrive' });
      if (p.kind === 'boss') {
        p.specialT -= P.react;
        if (p.specialT <= 0 && tgt && tdist < 500) {
          p.specialT = 6;
          for (let i = 0; i < 7; i++) this.spawnBullet(p, 'shotgun', p.a + (i - 3) * 0.13);
          this.ev({ e: 'shot', i: p.id, x: p.x, y: p.y, a: p.a, w: 'shotgun' });
          this.ev({ e: 'skill', i: p.id, s: 'salt', x: p.x, y: p.y, a: p.a });
        }
      }

      const z = this.zone;
      const dz = Math.hypot(p.x - z.x, p.y - z.y);
      if (this.zoneOn && dz > Math.min(z.r, z.tr + 150) - 120) {
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
      ai.mode = 'move';
      if (ai.follow) {
        const lead = this.playerMap.get(ai.follow);
        if (lead && lead.alive && Math.hypot(lead.x - p.x, lead.y - p.y) > 230) {
          ai.goal = [lead.x + (this.rng() - 0.5) * 120, lead.y + (this.rng() - 0.5) * 120];
          ai.goalKind = 'follow';
          return;
        }
      }
      if (ai.hunt) {
        let prey = null;
        let pd = ai.hunt;
        for (const q of this.players) {
          if (!q.alive || !this.enemies(p, q) || this.held(q)) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < pd) {
            pd = d;
            prey = q;
          }
        }
        if (prey) {
          ai.goal = [prey.x, prey.y];
          ai.goalKind = 'hunt';
          return;
        }
      }
      if (this.story && p === this.hero && this.story.goal.type === 'collect' && gunSlot >= 0) {
        let box = null;
        let bdb = Infinity;
        for (const it of this.items.values()) {
          if (it.t !== 'coldbox') continue;
          const d = Math.hypot(it.x - p.x, it.y - p.y);
          if (d < bdb) {
            bdb = d;
            box = it;
          }
        }
        if (box) {
          ai.goal = [box.x, box.y];
          ai.goalKind = 'box';
          return;
        }
      }
      if (!ai.noLoot) {
        let cur = ai.itemId ? this.items.get(ai.itemId) : null;
        if (cur && this.botWant(p, cur) <= 0) cur = null;
        if (!cur) {
          ai.itemId = 0;
          let bs = 0;
          for (const it of this.itemGrid.query(p.x - 800, p.y - 800, p.x + 800, p.y + 800, [])) {
            const w = this.botWant(p, it);
            if (w <= 0 || (this.zoneOn && Math.hypot(it.x - z.x, it.y - z.y) > z.tr)) continue;
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
          if (Math.hypot(cur.x - p.x, cur.y - p.y) < 50 && isWeapon(cur.t)) {
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
          } else if (cur.t === 'drop' && Math.hypot(cur.x - p.x, cur.y - p.y) < 50) {
            p.actions.push({ a: 'interact' });
          }
          return;
        }
        let crate = ai.crateId ? this.obstacles[ai.crateId] : null;
        if (crate && crate.dead) crate = null;
        if (!crate) {
          ai.crateId = 0;
          let bdc = Infinity;
          for (const o of this.grid.query(p.x - 700, p.y - 700, p.x + 700, p.y + 700, [])) {
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
      }
      ai.wanderT -= P.react;
      if (!ai.goal || ai.goalKind !== 'wander' || ai.wanderT <= 0 || Math.hypot(ai.goal[0] - p.x, ai.goal[1] - p.y) < 80) {
        const a = this.rng() * TAU;
        let gx;
        let gy;
        if (this.mode === 'story' && ai.home) {
          gx = ai.home[0] + Math.cos(a) * 300;
          gy = ai.home[1] + Math.sin(a) * 300;
        } else {
          const r = Math.sqrt(this.rng()) * Math.max(200, z.tr * 0.8);
          gx = z.x + Math.cos(a) * r;
          gy = z.y + Math.sin(a) * r;
        }
        ai.goal = [clamp(gx, 100, this.size - 100), clamp(gy, 100, this.size - 100)];
        ai.goalKind = 'wander';
        ai.wanderT = 10;
      }
    }

    // Leaving a building for a goal outside it (or entering one from outside): head for the best doorway first.
    routeVia(p, gx, gy) {
      let inB = this.insideBuilding(p.x, p.y, -4);
      let gB = this.insideBuilding(gx, gy, -4);
      if (inB && inB.broken) inB = null;
      if (gB && gB.broken) gB = null;
      if (inB === gB) return null;
      const b = inB || gB;
      if (!b.doors || !b.doors.length) return null;
      let best = null;
      let bd = Infinity;
      for (const dr of b.doors) {
        const d = Math.hypot(dr.x - p.x, dr.y - p.y) + Math.hypot(gx - dr.x, gy - dr.y);
        if (d < bd) {
          bd = d;
          best = dr;
        }
      }
      const out = inB ? 1 : -1;
      if (Math.hypot(best.x - p.x, best.y - p.y) < 50) return [best.x + best.nx * 75 * out, best.y + best.ny * 75 * out];
      return [best.x - best.nx * 42 * out, best.y - best.ny * 42 * out];
    }

    botSteer(p, mx, my) {
      const len = Math.hypot(mx, my);
      if (len < 1e-6) return [0, 0];
      const base = Math.atan2(my, mx);
      for (const o of [0, 0.55, -0.55, 1.1, -1.1, 1.65, -1.65, 2.4, -2.4]) {
        const a = base + o * p.ai.side;
        if (!this.blockedAt(p.x + Math.cos(a) * (p.r + 20), p.y + Math.sin(a) * (p.r + 20), p.r * 0.9)) return [Math.cos(a) * len, Math.sin(a) * len];
      }
      return [mx, my];
    }

    botUpdate(p, dt) {
      const ai = p.ai;
      // Story allies keep at least level-4 skill, so an easier level never weakens the hero's own team.
      const P = D.BOT_SKILL[this.story && p.team === 1 ? Math.max(this.difficulty, 4) : this.difficulty];
      const inp = p.input;
      if (ai.sleepT > 0) {
        ai.sleepT -= dt;
        if (this.time - p.hitT < 0.5) ai.sleepT = 0;
        inp.mx = 0;
        inp.my = 0;
        inp.shoot = false;
        return;
      }
      ai.t -= dt;
      if (ai.t <= 0) {
        ai.t = P.react * (ai.reactMul || 1) * (0.7 + 0.6 * this.rng());
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
        let ux = dx / d;
        let uy = dy / d;
        const via = ai.los ? null : this.routeVia(p, tgt.x, tgt.y);
        if (via) {
          const vd = Math.hypot(via[0] - p.x, via[1] - p.y) || 1;
          ux = (via[0] - p.x) / vd;
          uy = (via[1] - p.y) / vd;
        }
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
        if (this.time - p.hitT < 0.3 && p.jumpCool <= 0 && p.kind === 'player' && this.rng() < 0.08) p.actions.push({ a: 'jump' });
      } else if (ai.goal) {
        const via = this.routeVia(p, ai.goal[0], ai.goal[1]);
        const gx = via ? via[0] : ai.goal[0];
        const gy = via ? via[1] : ai.goal[1];
        const dx = gx - p.x;
        const dy = gy - p.y;
        const d = via ? Math.max(40, Math.hypot(dx, dy)) : Math.hypot(dx, dy);
        if (d > (ai.goalKind === 'crate' ? 70 : 6)) {
          mx = dx / d;
          my = dy / d;
        }
        sprint = ai.mode === 'zone' || ai.goalKind === 'follow' || (d > 500 && p.stamina > 60);
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
      if (tgt && tgt.alive && ai.los) {
        const d = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        const W = D.WEAPONS[t];
        const lead = isGun(t) ? (d / W.speed) * P.lead : 0;
        want = Math.atan2(tgt.y + tgt.vy * lead - p.y, tgt.x + tgt.vx * lead - p.x) + ai.aimErr;
        const err = Math.abs(angleDiff(p.a, want));
        if (isGun(t)) shoot = err < P.shootAngle + (W.pellets > 1 ? 0.08 : 0) && d < W.range * 0.92;
        else if (W) shoot = d < p.r + tgt.r + W.range && err < 0.5;
      } else if (ai.goalKind === 'crate' && ai.crateId) {
        const o = this.obstacles[ai.crateId];
        if (o && !o.dead && Math.hypot(o.x - p.x, o.y - p.y) < 140) {
          want = Math.atan2(o.y - p.y, o.x - p.x);
          shoot = D.WEAPONS[t] ? Math.abs(angleDiff(p.a, want)) < 0.25 : false;
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

    // How much bigger than normal this player's view is: driving and a scope each widen it.
    viewMul(p) {
      return (p.veh ? 1.2 : 1) * (D.SCOPE_ZOOM[p.scope] || 1);
    }

    viewHalf(p, aspect) {
      const h = D.VIEW_H * this.viewMul(p);
      const w = h * clamp(aspect, 1, D.MAX_ASPECT);
      return [w / 2 + 160, h / 2 + 160];
    }

    promptFor(p) {
      if (!p.alive) return null;
      if (p.veh) return { k: 'getOut' };
      const tg = this.interactTarget(p);
      if (!tg) return null;
      if (tg.vehicle) return { k: 'drive', t: tg.vehicle.t };
      if (tg.secret) return { k: 'see_' + tg.secret.id };
      const it = tg.item;
      if (it.t === 'drop') return { k: 'openDrop' };
      if (it.t === 'bao' || it.t === 'bag' || it.t === 'soup' || (D.ITEMS[it.t] && D.ITEMS[it.t].lv)) return { k: 'pickUp', t: it.t };
      let free = !p.slots[p.act];
      for (let i = 0; i < p.nslots; i++) if (!p.slots[i]) free = true;
      return { k: free ? 'pickUp' : 'swapFor', t: it.t };
    }

    getMapData() {
      const r1 = v => Math.round(v * 10) / 10;
      return {
        size: this.size,
        seed: this.seed,
        plaza: this.plaza,
        yard: this.yard,
        secrets: this.secrets.map(sc => ({ id: sc.id, x: r1(sc.x), y: r1(sc.y) })),
        roads: this.roads.map(r => ({ w: r.w, pts: r.pts.map(p => [r1(p[0]), r1(p[1])]) })),
        buildings: this.buildings.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, type: b.type, roof: b.roof, floor: b.floor, weak: b.weak ? 1 : 0, broken: b.broken ? 1 : 0 })),
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
      // In a team match a fallen player watches a living teammate.
      if (!me.alive && this.teamMode !== 'ffa') {
        const mate = this.players.find(q => q.alive && q.team === me.team && !q.bot) || this.players.find(q => q.alive && q.team === me.team);
        if (mate) return mate;
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
      const C = p.char ? D.CHARS[p.char] : null;
      return {
        id: p.id,
        alive: p.alive,
        x: r1(p.x),
        y: r1(p.y),
        hp: Math.round(p.hp * 10) / 10,
        mhp: p.maxHp,
        st: Math.round(p.stamina),
        sl: p.slots.slice(0, p.nslots).map(s => (s ? { t: s.t, m: s.m != null ? s.m : null } : null)),
        so: p.soups,
        qz: this.quizHud(p),
        zm: p.scope,
        soc: this.soupCap(p),
        act: p.act,
        rl: p.reload ? clamp(p.reload.t / p.reload.total, 0, 1) : -1,
        inj: p.inject ? clamp(p.inject.t / p.inject.total, 0, 1) : -1,
        jc: Math.round((p.jumpCool / D.JUMP_COOL) * 100) / 100,
        ch: p.char,
        sk: C ? C.skill.id : '',
        sc: C ? Math.round((p.skillCool / C.skill.cd) * 100) / 100 : 1,
        scs: Math.ceil(p.skillCool),
        su: p.skillUses,
        bo: p.boostT > 0 ? 1 : 0,
        k: p.kills,
        dd: Math.round(p.dmgDealt),
        veh: p.veh,
        plc: p.placement,
        killer: p.killer,
        killerNk: p.killerNk,
        killerId: p.killerId,
        tm: p.team,
        rsp: Math.round(this.respawnLeft(p) * 10) / 10,
        sh: p.shieldT > this.time ? 1 : 0,
        lv: p.lvl,
        gd: p.gadget,
        gu: p.gUses,
        gc: Math.round((p.gCool / D.GADGET_CD) * 100) / 100,
        pk: p.perk,
        odOk: p.odOk ? 1 : 0,
        od: Math.round(p.od * 100) / 100,
        odT: Math.round(p.odT * 10) / 10,
        pr: full ? this.promptFor(p) : null
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
        if (!q.alive && (this.time - q.deadT > 300 || q.kind !== 'player')) continue;
        pl.push({
          i: q.id,
          x: r1(q.x),
          y: r1(q.y),
          a: Math.round(q.a * 1000) / 1000,
          w: this.activeType(q),
          ch: q.char || q.kind,
          tm: q.team,
          r: q.r,
          n: q.name,
          nk: q.nk,
          veh: q.veh,
          d: q.alive ? 0 : 1,
          bp: q.nslots > D.SLOTS ? 1 : 0,
          inj: q.inject ? 1 : 0,
          sw: q.swingT > 0 ? Math.round((q.swingT / 0.22) * q.swingSide * 100) / 100 : 0,
          jz: q.jumpT > 0 ? Math.round(Math.sin((1 - q.jumpT / D.JUMP_TIME) * Math.PI) * 100) / 100 : 0,
          rs: q.rushT > 0 ? 1 : 0,
          lv: q.kind === 'player' ? q.lvl : 0,
          od: q.odT > 0 ? 1 : 0,
          bb: q.bubT > 0 && q.bubHp > 0 ? 1 : 0,
          gd: q.guardT > this.time ? 1 : 0,
          fx: (q.burnT > 0 ? 1 : 0) | (q.slowT > 0 ? 2 : 0) | (q.boostT > 0 ? 4 : 0),
          hp: q.kind !== 'player' || q.team !== 0 ? Math.round((q.hp / q.maxHp) * 100) / 100 : -1,
          hit: this.time - q.hitT < 0.12 ? 1 : 0,
          bu: q.inBush ? 1 : 0,
          sh: q.shieldT > this.time ? 1 : 0,
          hu: q.bot ? 0 : 1
        });
        if (this.held(q)) pl[pl.length - 1].qz = 1;
      }
      const bu = [];
      for (const b of this.bullets) {
        if (inView(b.x, b.y, 200)) bu.push({ i: b.id, x: r1(b.x), y: r1(b.y), dx: Math.round(b.dx * 1000) / 1000, dy: Math.round(b.dy * 1000) / 1000, w: b.w, tr: Math.round(b.trav) });
      }
      const tu = [];
      for (const t of this.turrets) {
        if (inView(t.x, t.y, 60)) tu.push({ i: t.id, x: r1(t.x), y: r1(t.y), a: Math.round(t.a * 100) / 100, tm: t.team, lf: Math.round(t.life * 10) / 10 });
      }
      const bo = [];
      for (const b of this.bombs) {
        const f = b.t / b.T;
        const x = b.x0 + (b.x1 - b.x0) * f;
        const y = b.y0 + (b.y1 - b.y0) * f;
        if (inView(x, y, 200)) bo.push({ i: b.id, x: r1(x), y: r1(y), z: Math.round(Math.sin(f * Math.PI) * 130), r: Math.round(b.r) });
      }
      const mi = [];
      for (const m of this.mines) {
        if (inView(m.x, m.y, 40)) mi.push({ i: m.id, x: r1(m.x), y: r1(m.y), tm: m.team, o: m.owner, arm: this.time >= m.arm ? 1 : 0 });
      }
      const it = [];
      for (const t of this.itemGrid.query(x0 - 30, y0 - 30, x1 + 30, y1 + 30, [])) {
        const o = { i: t.id, x: r1(t.x), y: r1(t.y), t: t.t };
        if (t.t === 'drop' && t.land > this.time) o.f = r1(t.land - this.time);
        it.push(o);
      }
      const sx = [];
      const cat = this.cat;
      if (cat && inView(cat.x, cat.y, 40)) sx.push({ i: -1, k: 'cat', x: r1(cat.x), y: r1(cat.y), a: Math.round(cat.a * 100) / 100, s: cat.sitT > 0 ? 1 : 0, h: cat.petT > 0 ? 1 : 0 });
      const gold = this.gold;
      if (gold && !gold.taken && inView(gold.x, gold.y, 30)) sx.push({ i: -2, k: 'gold', x: r1(gold.x), y: r1(gold.y) });
      const pn = this.plane;
      if (pn) sx.push({ i: -3, k: 'plane', x: r1(pn.x), y: r1(pn.y), a: Math.round(pn.a * 1000) / 1000 });
      const ve = [];
      for (const v of this.vehicles) {
        if (inView(v.x, v.y, 100)) ve.push({ i: v.id, t: v.t, x: r1(v.x), y: r1(v.y), a: Math.round(v.a * 1000) / 1000, hp: Math.round((v.hp / v.mhp) * 100) / 100, d: v.driver, c: v.col, sp: Math.round(v.sp), sl: v.slip > 160 ? 1 : 0 });
      }
      const ob = [];
      for (const o of this.grid.query(x0, y0, x1, y1, [])) {
        if (o.mhp && o.hp < o.mhp) ob.push([o.id, Math.round(o.hp)]);
      }
      let alive = 0;
      for (const q of this.players) if (q.alive) alive++;
      const lb = this.mode === 'royale' ? this.players.filter(q => q.kills > 0).sort((a, b) => b.kills - a.kills).slice(0, 5).map(q => ({ n: q.name, nk: q.nk, k: q.kills, i: q.id })) : [];
      const boss = this.players.find(q => q.kind === 'boss' && q.alive);
      const marks = [];
      if (this.story) {
        for (const t of this.items.values()) if (t.t === 'coldbox') marks.push([r1(t.x), r1(t.y)]);
      }
      const z = this.zone;
      return {
        t: Math.round(this.clock * 1000) / 1000,
        mt: Math.round(this.time * 10) / 10,
        qp: this.quiz && !this.quiz.botsIn ? this.players.filter(q => q.quiz && q.alive).length : 0,
        mode: this.mode,
        chap: this.chapter ? this.chapter.id : '',
        you: id,
        cam: cam.id,
        cx: r1(cam.x),
        cy: r1(cam.y),
        cveh: cam.veh ? 1 : 0,
        cvm: Math.round(this.viewMul(cam) * 1000) / 1000,
        me: this.hudData(me, true),
        cme: cam !== me ? this.hudData(cam, false) : null,
        pl,
        bu,
        tu,
        bo,
        mi,
        it,
        sx,
        ve,
        ob,
        zo: { x: r1(z.x), y: r1(z.y), r: r1(z.r), tr: r1(z.tr), on: this.zoneOn ? 1 : 0 },
        al: alive,
        tot: this.players.length,
        ev: this.eventsFor(id, spectateId),
        lb,
        obj: this.objective(),
        boss: boss ? { hp: Math.round(boss.hp), mhp: boss.maxHp } : null,
        marks,
        bk: this.buildings.filter(b => b.broken).map(b => b.id),
        tmode: this.teamMode,
        ta: this.teamMode === 'ffa' ? null : [1, 2].map(t => this.players.filter(q => q.alive && q.team === t).length),
        wt: this.winTeam,
        st: this.state,
        res: this.result,
        why: this.failReason,
        win: this.winner ? this.winner.name : '',
        winId: this.winner ? this.winner.id : 0
      };
    }
  }

  const API = { Sim, isGun, clamp, angleDiff, polyDist, segCircle, segRect, mulberry32 };
  if (isNode) {
    module.exports = API;
  } else {
    globalThis.PF_SIM = API;
  }
})();
