(function () {
  'use strict';
  const D = globalThis.PF_DATA;
  const I = globalThis.YW_I18N;
  const TAU = Math.PI * 2;
  const PR = D.PLAYER_R;
  const FONT = "'Trebuchet MS', 'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', 'WenQuanYi Zen Hei', 'Heiti TC', sans-serif";
  const OUT = '#2b2a28';
  const CANOPY = 1.8;
  // Semi-3D view: how much north-south ground distances shrink when seen at the camera's angle.
  const TILT = 0.68;

  function hash(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = n + (n << 3);
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return (n >>> 0) / 4294967296;
  }

  function rnd(seed, i) {
    return hash((seed * 7919 + i * 104729 + 1) | 0);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, TAU);
  }

  function heart(ctx, x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.7);
    ctx.bezierCurveTo(x - s * 1.2, y - s * 0.2, x - s * 0.5, y - s, x, y - s * 0.35);
    ctx.bezierCurveTo(x + s * 0.5, y - s, x + s * 1.2, y - s * 0.2, x, y + s * 0.7);
    ctx.closePath();
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const d = i % 2 ? r * 0.3 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.closePath();
  }

  function fillStroke(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = OUT;
    ctx.lineWidth = lw || 4;
    ctx.stroke();
  }

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255;
    let g = (n >> 8) & 255;
    let b = n & 255;
    if (f < 0) {
      r = Math.round(r * (1 + f));
      g = Math.round(g * (1 + f));
      b = Math.round(b * (1 + f));
    } else {
      r = Math.round(r + (255 - r) * f);
      g = Math.round(g + (255 - g) * f);
      b = Math.round(b + (255 - b) * f);
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function nameOf(p) {
    if (p.nk) {
      const [kind, id] = p.nk.split(':');
      if (kind === 'foe' && D.FOES[id]) return I.pick(D.FOES[id].name);
      if (kind === 'char' && D.CHARS[id]) return I.pick(D.CHARS[id].name);
    }
    return p.n || '';
  }

  function itemName(t) {
    if (D.WEAPONS[t]) return I.pick(D.WEAPONS[t].name);
    if (D.ITEMS[t]) return I.pick(D.ITEMS[t].name);
    return t;
  }

  const PACK_COL = { yunwang: '#8a5a30', luap: '#3a3a3a', auhsoj: '#4a6b8a', meibao: '#e56f9f', bubbles: '#4fa3c7', jinjin: '#c99a1a', bing: '#5d7f9a' };
  // Trouser colour for the standing figures in the 3D view.
  const PANTS = { yunwang: '#3a3a3a', luap: '#222222', auhsoj: '#3c4a5c', meibao: '#5b3a6e', afeng: '#2b4a3a', bubbles: '#3b5f7a', jinjin: '#4a3a2a', bing: '#55606b', thug: '#3a3a50', elite: '#1f1f1f', boss: '#1f2f4f' };
  const SHIRT = { yunwang: '#ffffff', luap: '#d63a32', auhsoj: '#5c6b7a', meibao: '#ff9cc6', afeng: '#2fa36b', bubbles: '#7fd0e8', jinjin: '#f4c430', bing: '#d9ecf7', thug: '#ffffff', elite: '#2a2f3a', boss: '#1f2f4f' };
  const CAR_COL = ['#e0574a', '#4a8fe0', '#f0c043', '#5cc08a'];
  const BIKE_COL = ['#e07a2e', '#c43d7a', '#4f6fd0', '#2f2f2f'];
  const CONTAINER_COL = ['#c2563f', '#3f78b5', '#3f9a6b', '#d1932f', '#7c5aa6'];
  const DEBRIS = { plank: '#a87a4a', tree: '#5a3d22', bamboo: '#7fb24a', rock: '#a3a8ac', crate: '#d49a4a', bush: '#3f8f3a', wall: '#7a6450', container: '#8a6a52', table: '#ffffff', stove: '#444444', vehicle: '#555555' };
  const TRACER = { pistol: 60, uzi: 55, shotgun: 40, rifle: 90, sniper: 180, minigun: 80, turret: 50 };

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = 1;
      this.H = 1;
      this.dpr = 1;
      this.zoom = 0;
      this.camX = 0;
      this.camY = 0;
      this.map = null;
      this.mini = null;
      this.particles = [];
      this.fx = [];
      this.rings = [];
      this.dmgNums = [];
      this.banners = [];
      this.flash = new Map();
      this.roofAlpha = new Map();
      this.time = 0;
      this.shake = 0;
      this.hitMarkT = -10;
      this.hurtT = -10;
      this.hit = { slots: [], heal: null, skill: null, mini: null };
      this.rockCache = new Map();
      this.groundPattern = this.makeGroundPattern();
      this.plazaPattern = this.makePlazaPattern();
      this.resize();
    }

    resize() {
      // Phones get a lower pixel density: much less drawing work for a small loss in sharpness.
      const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      this.dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2);
      this.W = window.innerWidth;
      this.H = window.innerHeight;
      this.cv.width = Math.round(this.W * this.dpr);
      this.cv.height = Math.round(this.H * this.dpr);
      this.cv.style.width = this.W + 'px';
      this.cv.style.height = this.H + 'px';
    }

    makeGroundPattern() {
      const c = document.createElement('canvas');
      const S = 400;
      c.width = S;
      c.height = S;
      const g = c.getContext('2d');
      g.fillStyle = '#8cc456';
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 30; i++) {
        const x = rnd(1, i) * S;
        const y = rnd(2, i) * S;
        const r = 20 + rnd(3, i) * 50;
        g.fillStyle = rnd(4, i) < 0.5 ? 'rgba(70,130,50,0.12)' : 'rgba(170,215,110,0.14)';
        for (const ox of [-S, 0, S]) {
          for (const oy of [-S, 0, S]) {
            circle(g, x + ox, y + oy, r);
            g.fill();
          }
        }
      }
      g.strokeStyle = 'rgba(70,125,45,0.5)';
      g.lineWidth = 2;
      g.lineCap = 'round';
      for (let i = 0; i < 70; i++) {
        const x = rnd(5, i) * S;
        const y = rnd(6, i) * S;
        g.beginPath();
        g.moveTo(x - 4, y);
        g.lineTo(x - 6, y - 8);
        g.moveTo(x, y);
        g.lineTo(x, y - 10);
        g.moveTo(x + 4, y);
        g.lineTo(x + 6, y - 8);
        g.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const x = rnd(7, i) * S;
        const y = rnd(8, i) * S;
        g.fillStyle = rnd(9, i) < 0.5 ? '#f6d2e0' : '#fff6c8';
        for (let k = 0; k < 5; k++) {
          circle(g, x + Math.cos((k / 5) * TAU) * 3, y + Math.sin((k / 5) * TAU) * 3, 2.4);
          g.fill();
        }
        g.fillStyle = '#e8a33a';
        circle(g, x, y, 1.8);
        g.fill();
      }
      return this.ctx.createPattern(c, 'repeat');
    }

    makePlazaPattern() {
      const c = document.createElement('canvas');
      c.width = 80;
      c.height = 80;
      const g = c.getContext('2d');
      g.fillStyle = '#d9cfba';
      g.fillRect(0, 0, 80, 80);
      g.strokeStyle = '#bfb39a';
      g.lineWidth = 3;
      g.strokeRect(0, 0, 40, 40);
      g.strokeRect(40, 40, 40, 40);
      g.strokeRect(40, 0, 40, 40);
      g.strokeRect(0, 40, 40, 40);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(4, 4, 32, 32);
      g.fillRect(44, 44, 32, 32);
      return this.ctx.createPattern(c, 'repeat');
    }

    setMap(map) {
      this.map = map;
      this.particles.length = 0;
      this.fx.length = 0;
      this.rings.length = 0;
      this.dmgNums.length = 0;
      this.banners.length = 0;
      this.flash.clear();
      this.roofAlpha.clear();
      this.rockCache.clear();
      this.walk = new Map();
      this.zoom = 0;
      this.mini = this.renderMiniMap(map, 512);
    }

    renderMiniMap(map, size) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const s = size / map.size;
      g.fillStyle = '#8cc456';
      g.fillRect(0, 0, size, size);
      g.fillStyle = '#d9cfba';
      circle(g, map.plaza.x * s, map.plaza.y * s, map.plaza.r * s);
      g.fill();
      const yd = map.yard;
      g.fillStyle = '#b9b5ad';
      g.fillRect((yd.x - yd.w / 2) * s, (yd.y - yd.h / 2) * s, yd.w * s, yd.h * s);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const road of map.roads) {
        g.strokeStyle = '#d9c08a';
        g.lineWidth = Math.max(2, road.w * s);
        g.beginPath();
        road.pts.forEach((p, i) => (i ? g.lineTo(p[0] * s, p[1] * s) : g.moveTo(p[0] * s, p[1] * s)));
        g.stroke();
      }
      for (const o of map.obstacles) {
        if (o.k === 'tree') {
          g.fillStyle = '#4a9b3f';
          circle(g, o.x * s, o.y * s, Math.max(1.5, o.r * CANOPY * s));
          g.fill();
        } else if (o.k === 'bamboo') {
          g.fillStyle = '#7fb24a';
          circle(g, o.x * s, o.y * s, Math.max(1.5, 30 * s));
          g.fill();
        } else if (o.k === 'rock') {
          g.fillStyle = '#a3a8ac';
          circle(g, o.x * s, o.y * s, Math.max(1, o.r * s));
          g.fill();
        } else if (o.k === 'container') {
          g.fillStyle = CONTAINER_COL[o.v % CONTAINER_COL.length];
          g.fillRect((o.x - o.hw) * s, (o.y - o.hh) * s, o.hw * 2 * s, o.hh * 2 * s);
        }
      }
      for (const b of map.buildings) {
        g.fillStyle = b.type === 'restaurant' ? '#2f6b62' : b.type === 'stall' ? '#e05a4a' : D.ROOFS[b.roof];
        g.fillRect((b.x - b.w / 2) * s, (b.y - b.h / 2) * s, b.w * s, b.h * s);
        if (b.type === 'restaurant') {
          g.strokeStyle = '#c9a23a';
          g.lineWidth = 2;
          g.strokeRect((b.x - b.w / 2) * s, (b.y - b.h / 2) * s, b.w * s, b.h * s);
        }
      }
      return c;
    }

    // ---------- effects ----------

    addParticles(x, y, n, color, speed, life, size, kind) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = speed * (0.3 + Math.random() * 0.9);
        this.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), color, kind: kind || 0, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8 });
      }
    }

    banner(txt, col) {
      this.banners.push({ txt, col: col || '#ffd75e', t: this.time });
      if (this.banners.length > 3) this.banners.shift();
    }

    onEvent(e, myId, camX, camY) {
      switch (e.e) {
        case 'shot':
          if (e.i) this.flash.set(e.i, this.time);
          if (e.i === myId) this.shake = Math.max(this.shake, e.w === 'sniper' ? 6 : e.w === 'shotgun' ? 5 : 1.5);
          break;
        case 'hit':
          if (e.ty === 'p') {
            this.addParticles(e.x, e.y, 6, '#d6403a', 160, 0.45, 5);
            if (e.w && D.WEAPONS[e.w] && D.WEAPONS[e.w].rare) this.addParticles(e.x, e.y, 6, '#ffe27a', 240, 0.3, 4);
            if (e.by === myId) this.hitMarkT = this.time;
          } else if (e.ty === 'o') {
            this.addParticles(e.x, e.y, 4, DEBRIS[e.k] || '#777', 140, 0.4, 4);
            if (e.w === 'bowl') this.addParticles(e.x, e.y, 5, '#f4f4f4', 180, 0.35, 3);
          } else {
            this.addParticles(e.x, e.y, 5, '#ffd36b', 260, 0.25, 3);
          }
          break;
        case 'dmg':
          if (e.i === myId) this.hurtT = this.time;
          if (e.by === myId && e.i !== myId && e.n > 0) this.dmgNums.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y - 34, n: e.n, t: this.time });
          break;
        case 'break':
          this.addParticles(e.x, e.y, 16, DEBRIS[e.k] || '#777', 260, 0.8, 8, 1);
          break;
        case 'exp': {
          this.fx.push({ x: e.x, y: e.y, r: e.r, t: this.time });
          this.addParticles(e.x, e.y, 14, '#6b6b6b', 120, 1.5, 26, 3);
          this.addParticles(e.x, e.y, 12, '#ffb347', 380, 0.4, 6);
          const d = Math.hypot(e.x - camX, e.y - camY);
          this.shake = Math.max(this.shake, clamp(22 - d / 50, 0, 20));
          break;
        }
        case 'heal':
          this.addParticles(e.x, e.y, 8, '#7ee08a', 90, 0.6, 5);
          break;
        case 'leech':
          this.addParticles(e.x, e.y, 5, '#7ee08a', 60, 0.5, 4);
          if (e.i === myId) this.dmgNums.push({ x: e.x, y: e.y - 50, n: '+' + e.n, t: this.time, c: '#8ef08a' });
          break;
        case 'kill':
          this.addParticles(e.x, e.y, 14, '#c0352f', 200, 0.7, 7);
          break;
        case 'skill':
          if (e.s === 'flame') {
            this.rings.push({ x: e.x, y: e.y, r: 165, t: this.time, col: '#ff8a2a', life: 0.55 });
            for (let i = 0; i < 26; i++) {
              const a = (i / 26) * TAU;
              this.particles.push({ x: e.x + Math.cos(a) * 30, y: e.y + Math.sin(a) * 30, vx: Math.cos(a) * 330, vy: Math.sin(a) * 330, life: 0.5, max: 0.5, size: 13, color: i % 2 ? '#ffb02e' : '#ff5a2a', kind: 0, rot: 0, vr: 0 });
            }
            if (Math.hypot(e.x - camX, e.y - camY) < 600) this.shake = Math.max(this.shake, 8);
          } else if (e.s === 'rush') {
            this.addParticles(e.x, e.y, 10, '#ffffff', 120, 0.4, 6);
          } else if (e.s === 'boba') {
            this.addParticles(e.x, e.y, 14, '#ffb6d5', 140, 0.8, 5);
            this.addParticles(e.x, e.y, 8, '#4a3020', 100, 0.6, 4);
          } else if (e.s === 'turret') {
            this.addParticles(e.x, e.y, 8, '#7fd3ff', 120, 0.5, 4);
          } else if (e.s === 'freeze') {
            this.rings.push({ x: e.x, y: e.y, r: e.od ? 266 : 190, t: this.time, col: '#bfe8ff', life: 0.7 });
            this.addParticles(e.x, e.y, 26, '#e8f7ff', 260, 0.9, 6);
          } else if (e.s === 'bubble') {
            this.rings.push({ x: e.x, y: e.y, r: 200, t: this.time, col: '#7fd0e8', life: 0.6 });
          } else if (e.s === 'coins') {
            this.addParticles(e.x, e.y, 8, '#f4c430', 160, 0.4, 4);
          } else if (e.s === 'salt') {
            this.addParticles(e.x, e.y, 18, '#ffffff', 300, 0.5, 4);
          }
          break;
        case 'meow':
          for (let i = 0; i < 4; i++) {
            this.particles.push({ x: e.x + (Math.random() - 0.5) * 24, y: e.y - 16, vx: (Math.random() - 0.5) * 40, vy: -60 - Math.random() * 40, life: 1.4, max: 1.4, size: 8 + Math.random() * 4, color: '#ff6f9f', kind: 5, rot: 0, vr: 0 });
          }
          break;
        case 'gadget':
          this.rings.push({ x: e.x, y: e.y, r: 120, t: this.time, col: '#5fd36b', life: 0.45 });
          this.addParticles(e.x, e.y, 10, '#b9f5a0', 160, 0.5, 5);
          break;
        case 'overdrive':
          this.rings.push({ x: e.x, y: e.y, r: 170, t: this.time, col: '#b46bff', life: 0.7 });
          this.addParticles(e.x, e.y, 22, '#d9b0ff', 260, 0.8, 6);
          if (e.i === myId) this.banner(I.t('odLabel').replace(/[（(].*/, '') + '！', '#d9b0ff');
          break;
        case 'pop':
          this.addParticles(e.x, e.y, 12, '#c9f0ff', 200, 0.5, 5);
          break;
        case 'respawn':
          this.rings.push({ x: e.x, y: e.y, r: 90, t: this.time, col: '#8fe07a', life: 0.6 });
          this.addParticles(e.x, e.y, 14, '#c9ffc0', 180, 0.7, 5);
          break;
        case 'collapse': {
          for (let i = 0; i < 26; i++) {
            const px = e.x + (Math.random() - 0.5) * e.w;
            const py = e.y + (Math.random() - 0.5) * e.h;
            this.addParticles(px, py, 1, i % 4 ? '#a87a4a' : '#7a4a2a', 220, 1, 10, 1);
          }
          for (let i = 0; i < 10; i++) this.addParticles(e.x + (Math.random() - 0.5) * e.w, e.y + (Math.random() - 0.5) * e.h, 1, '#cbb89a', 90, 1.6, 34, 3);
          const d = Math.hypot(e.x - camX, e.y - camY);
          this.shake = Math.max(this.shake, clamp(16 - d / 60, 0, 14));
          break;
        }
        case 'land':
          this.rings.push({ x: e.x, y: e.y, r: 110, t: this.time, col: '#ffffff', life: 0.5 });
          this.addParticles(e.x, e.y, 12, '#d8c7a6', 150, 1.1, 18, 3);
          break;
        case 'open':
          this.rings.push({ x: e.x, y: e.y, r: 130, t: this.time, col: '#ffcf3a', life: 0.6 });
          this.addParticles(e.x, e.y, 16, '#ffe27a', 260, 0.7, 5);
          this.addParticles(e.x, e.y, 10, '#9fdcff', 200, 0.7, 5);
          break;
        case 'msg':
          if (e.box) {
            this.rings.push({ x: e.x, y: e.y, r: 120, t: this.time, col: '#7fd3ff', life: 0.6 });
            this.addParticles(e.x, e.y, 18, '#c9f0ff', 200, 0.8, 5);
          }
          break;
      }
    }

    updateParticles(dt) {
      const ps = this.particles;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life -= dt;
        if (p.life <= 0) {
          ps.splice(i, 1);
          continue;
        }
        const k = Math.exp(-(p.kind === 3 ? 1.5 : p.kind === 5 ? 0.6 : 4) * dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      if (ps.length > 800) ps.splice(0, ps.length - 800);
      this.fx = this.fx.filter(f => this.time - f.t < 0.6);
      this.rings = this.rings.filter(f => this.time - f.t < f.life);
      this.dmgNums = this.dmgNums.filter(d => this.time - d.t < 0.9);
      this.banners = this.banners.filter(b => this.time - b.t < 2);
    }

    // ---------- world ----------

    // vm: how much wider than normal the camera's view is (driving, scopes), sent by the simulation.
    computeZoom(vm) {
      const vh = D.VIEW_H * (vm || 1);
      // Small phone screens zoom in a little so characters and names stay readable.
      const phone = Math.min(this.W, this.H) < 500 ? 1.2 : 1;
      return Math.max(this.H / vh, this.W / (vh * D.MAX_ASPECT)) * phone;
    }

    draw(view, ui, dt) {
      if (this.mode3d) {
        this.draw3D(view, ui, dt);
        return;
      }
      this.time += dt;
      const ctx = this.ctx;
      const map = this.map;
      if (!map || !view) return;
      this.updateParticles(dt);
      const target = this.computeZoom(view.cvm || (view.cveh ? 1.2 : 1));
      this.zoom = this.zoom ? lerp(this.zoom, target, Math.min(1, dt * 4)) : target;
      const z = this.zoom;
      this.camX = view.cx;
      this.camY = view.cy;
      this.myTeam = view.me.tm || 0;
      this.tmode = view.tmode || 'ffa';
      this.shake = Math.max(0, this.shake - dt * 40);
      const sx = (Math.random() - 0.5) * this.shake;
      const sy = (Math.random() - 0.5) * this.shake;
      const dpr = this.dpr;
      const W = this.W;
      const H = this.H;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#3b5a2c';
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - this.camX * z + sx), dpr * (H / 2 - this.camY * z + sy));
      const x0 = this.camX - W / z / 2 - 60;
      const y0 = this.camY - H / z / 2 - 60;
      const x1 = this.camX + W / z / 2 + 60;
      const y1 = this.camY + H / z / 2 + 60;
      const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
      this.vis = vis;

      ctx.fillStyle = this.groundPattern;
      ctx.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(map.size, x1) - Math.max(0, x0), Math.min(map.size, y1) - Math.max(0, y0));
      ctx.strokeStyle = 'rgba(40,60,25,0.6)';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, map.size, map.size);
      this.drawYard(ctx, map.yard, vis);
      this.drawRoads(ctx);
      this.drawPlaza(ctx, map.plaza, vis);

      const camP = view.pl.find(p => p.i === view.cam);
      const cx = camP ? camP.x : this.camX;
      const cy = camP ? camP.y : this.camY;
      const camInside = this.buildingAt(cx, cy);
      for (const b of map.buildings) {
        if (vis(b.x, b.y, Math.max(b.w, b.h))) this.drawFloor(ctx, b);
      }
      for (const sc of map.secrets || []) {
        if (vis(sc.x, sc.y, 40)) this.drawSecretSpot(ctx, sc);
      }
      const extras = view.sx || [];
      for (const q of extras) {
        if (q.k === 'gold' && vis(q.x, q.y, 40)) this.drawGold(ctx, q);
        else if (q.k === 'plane') this.drawPlane(ctx, q, true);
      }
      for (const it of view.it) {
        if (vis(it.x, it.y, 40)) this.drawGroundItem(ctx, it);
      }
      for (const m of view.mi || []) this.drawMine(ctx, m, m.o === view.you || (this.myTeam && m.tm === this.myTeam));
      if (ui.guide) this.drawAimGuide(ctx, view, ui.guide);
      const obs = [];
      for (const o of map.obstacles) {
        if (o.dead) continue;
        const ext = o.k === 'tree' ? o.r * CANOPY : o.k === 'bamboo' ? 44 : o.s === 'c' ? o.r : Math.max(o.hw, o.hh);
        if (vis(o.x, o.y, ext)) obs.push(o);
      }
      for (const p of view.pl) {
        if (p.d) this.drawBody(ctx, p);
      }
      for (const o of obs) {
        if (o.k === 'rock') this.drawRock(ctx, o);
        else if (o.k === 'crate') this.drawCrate(ctx, o);
        else if (o.k === 'wall') this.drawWall(ctx, o);
        else if (o.k === 'plank') this.drawPlank(ctx, o);
        else if (o.k === 'tree') this.drawTrunk(ctx, o);
        else if (o.k === 'table') this.drawTable(ctx, o);
        else if (o.k === 'stove') this.drawStove(ctx, o);
        else if (o.k === 'container') this.drawContainer(ctx, o);
        else if (o.k === 'lantern') this.drawLanternPost(ctx, o);
        else if (o.k === 'bamboo') this.drawBambooBase(ctx, o);
        else if (o.k === 'board') this.drawBoard(ctx, o);
      }
      for (const t of view.tu || []) {
        if (vis(t.x, t.y, 40)) this.drawTurret(ctx, t);
      }
      const plMap = new Map();
      for (const p of view.pl) plMap.set(p.i, p);
      for (const v of view.ve) {
        if (!vis(v.x, v.y, 90)) continue;
        // Tyre smoke from the rear wheels while a vehicle slides sideways.
        if (v.sl && Math.random() < 0.6) {
          const L = D.VEHICLES[v.t].len * 0.35;
          const Wd = D.VEHICLES[v.t].wid * 0.4;
          for (const side of [-1, 1]) {
            const px = v.x - Math.cos(v.a) * L - Math.sin(v.a) * Wd * side;
            const py = v.y - Math.sin(v.a) * L + Math.cos(v.a) * Wd * side;
            this.addParticles(px, py, 1, '#d9d4cc', 30, 0.7, 12, 3);
          }
        }
        this.drawVehicle(ctx, v, plMap);
      }
      for (const q of extras) {
        if (q.k === 'cat' && vis(q.x, q.y, 40)) this.drawCat(ctx, q);
      }
      for (const p of view.pl) {
        if (p.d || p.veh) continue;
        const aim = p.i === view.you && ui.aim != null ? ui.aim : p.a;
        // Faded until they are in play (still solving the math problem, or bots waiting for everyone).
        if (p.qz) ctx.globalAlpha = 0.45;
        this.drawPlayer(ctx, p, aim);
        ctx.globalAlpha = 1;
      }
      for (const p of view.pl) {
        if (!p.d && !p.veh && (p.od || p.bb || p.gd)) this.drawAuras(ctx, p, p.x, p.y, p.r || PR);
      }
      this.drawBullets(ctx, view.bu);
      for (const b of view.bo || []) {
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 14, 9, 0, 0, TAU);
        ctx.fill();
        this.drawParcel(ctx, b.x, b.y - b.z, 1 + b.z / 260);
      }
      this.drawRings(ctx);
      this.drawParticles(ctx, vis, false);
      for (const o of obs) {
        if (o.k === 'bush') this.drawBush(ctx, o, Math.hypot(cx - o.x, cy - o.y) < o.r + PR * 0.5 ? 0.55 : 1);
      }
      for (const o of obs) {
        if (o.k === 'tree') this.drawCanopy(ctx, o, Math.hypot(cx - o.x, cy - o.y) < o.r * CANOPY + PR ? 0.45 : 1);
        else if (o.k === 'bamboo') this.drawBambooLeaves(ctx, o, Math.hypot(cx - o.x, cy - o.y) < 60 ? 0.45 : 1);
      }
      for (const b of map.buildings) {
        if (!vis(b.x, b.y, Math.max(b.w, b.h))) continue;
        const tgt = camInside === b || b.broken ? 0 : 1;
        let a = this.roofAlpha.get(b.id);
        a = a == null ? tgt : lerp(a, tgt, Math.min(1, dt * 8));
        this.roofAlpha.set(b.id, a);
        if (a > 0.02) this.drawRoof(ctx, b, a);
      }
      for (const o of obs) {
        if (o.k === 'lantern') this.drawLanternTop(ctx, o);
        else if (o.k === 'board') this.drawBoardTop(ctx, o);
      }
      for (const it of view.it) {
        if (it.t === 'drop' && it.f > 0 && vis(it.x, it.y, 260)) this.drawFallingDrop(ctx, it);
      }
      for (const q of extras) {
        if (q.k === 'plane' && vis(q.x, q.y, 320)) this.drawPlane(ctx, q, false);
      }
      this.drawParticles(ctx, vis, true);
      this.drawExplosions(ctx);
      if (view.zo.on) this.drawZone(ctx, view.zo, x0, y0, x1, y1);
      this.drawTags(ctx, view, camInside);
      this.drawDamageNumbers(ctx);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ui.noHud) this.drawHUD(ctx, view, ui);
    }

    buildingAt(x, y) {
      for (const b of this.map.buildings) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) return b;
      }
      return null;
    }

    path(ctx, pts) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    }

    drawRoads(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const r of this.map.roads) {
        this.path(ctx, r.pts);
        ctx.strokeStyle = '#a88c58';
        ctx.lineWidth = r.w + 10;
        ctx.stroke();
      }
      for (const r of this.map.roads) {
        this.path(ctx, r.pts);
        ctx.strokeStyle = '#dcc48e';
        ctx.lineWidth = r.w;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,245,215,0.35)';
        ctx.lineWidth = 6;
        ctx.setLineDash([30, 40]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawPlaza(ctx, pz, vis) {
      if (!vis(pz.x, pz.y, pz.r)) return;
      circle(ctx, pz.x, pz.y, pz.r);
      ctx.fillStyle = this.plazaPattern;
      ctx.fill();
      ctx.strokeStyle = '#a89a7e';
      ctx.lineWidth = 10;
      ctx.stroke();
      circle(ctx, pz.x, pz.y, pz.r - 22);
      ctx.strokeStyle = 'rgba(180,60,50,0.35)';
      ctx.lineWidth = 6;
      ctx.setLineDash([24, 18]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawYard(ctx, yd, vis) {
      if (!vis(yd.x, yd.y, Math.max(yd.w, yd.h))) return;
      const x = yd.x - yd.w / 2;
      const y = yd.y - yd.h / 2;
      roundRect(ctx, x, y, yd.w, yd.h, 16);
      ctx.fillStyle = '#b9b5ad';
      ctx.fill();
      ctx.strokeStyle = '#8e8a82';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,190,60,0.7)';
      ctx.lineWidth = 6;
      ctx.setLineDash([26, 22]);
      ctx.beginPath();
      ctx.moveTo(x + 30, yd.y);
      ctx.lineTo(x + yd.w - 30, yd.y);
      ctx.moveTo(yd.x, y + 30);
      ctx.lineTo(yd.x, y + yd.h - 30);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawFloor(ctx, b) {
      const x = b.x - b.w / 2;
      const y = b.y - b.h / 2;
      if (b.type === 'restaurant') {
        ctx.fillStyle = '#c99a62';
        ctx.fillRect(x, y, b.w, b.h);
        ctx.strokeStyle = '#b5864f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let yy = y + 28; yy < y + b.h; yy += 28) {
          ctx.moveTo(x, yy);
          ctx.lineTo(x + b.w, yy);
        }
        ctx.stroke();
        roundRect(ctx, b.x - b.w * 0.36, b.y - 70, b.w * 0.72, 260, 14);
        ctx.fillStyle = '#a8322a';
        ctx.fill();
        ctx.strokeStyle = '#d9b14a';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.fillStyle = '#9aa0a3';
        ctx.fillRect(x + 18, y + 18, b.w - 36, 70);
        return;
      }
      const col = b.type === 'stall' ? '#e8d6b0' : D.FLOORS[b.floor];
      ctx.fillStyle = col;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.strokeStyle = shade(col, -0.15);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let yy = y + 24; yy < y + b.h; yy += 24) {
        ctx.moveTo(x, yy);
        ctx.lineTo(x + b.w, yy);
      }
      ctx.stroke();
      if (b.broken) this.drawRubble(ctx, b);
    }

    // Broken planks and roof pieces left where a wooden building fell in.
    drawRubble(ctx, b) {
      const n = Math.round((b.w * b.h) / 2600);
      for (let i = 0; i < n; i++) {
        const px = b.x + (rnd(b.id * 97 + 3, i) - 0.5) * b.w * 0.92;
        const py = b.y + (rnd(b.id * 89 + 7, i) - 0.5) * b.h * 0.92;
        const len = 18 + rnd(b.id * 31 + 1, i) * 34;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(rnd(b.id * 13 + 5, i) * Math.PI);
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        ctx.fillRect(-len / 2 + 3, -2, len, 9);
        ctx.fillStyle = i % 3 === 0 ? (b.type === 'stall' ? (i % 2 ? '#e05a4a' : '#ffffff') : '#7a4a2a') : '#a87a4a';
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2;
        ctx.fillRect(-len / 2, -5, len, 9);
        ctx.strokeRect(-len / 2, -5, len, 9);
        ctx.restore();
      }
    }

    drawRoof(ctx, b, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      if (b.type === 'restaurant') {
        this.drawRestaurantRoof(ctx, b);
        ctx.restore();
        return;
      }
      const m = 6;
      const x = b.x - b.w / 2 - m;
      const y = b.y - b.h / 2 - m;
      const w = b.w + m * 2;
      const h = b.h + m * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 10, y + 12, w, h);
      if (b.type === 'stall') {
        roundRect(ctx, x, y, w, h, 8);
        ctx.save();
        ctx.clip();
        const stripe = 26;
        for (let i = 0; i * stripe < w; i++) {
          ctx.fillStyle = i % 2 ? '#ffffff' : '#e05a4a';
          ctx.fillRect(x + i * stripe, y, stripe, h);
        }
        ctx.restore();
        roundRect(ctx, x, y, w, h, 8);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.restore();
        return;
      }
      const col = b.weak ? '#8a5a34' : D.ROOFS[b.roof];
      roundRect(ctx, x, y, w, h, 10);
      fillStroke(ctx, col, 6);
      const horiz = w >= h;
      ctx.save();
      roundRect(ctx, x, y, w, h, 10);
      ctx.clip();
      ctx.fillStyle = shade(col, -0.14);
      if (horiz) ctx.fillRect(x, y + h / 2, w, h / 2);
      else ctx.fillRect(x + w / 2, y, w / 2, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (horiz) {
        for (let xx = x + 18; xx < x + w; xx += 18) {
          ctx.moveTo(xx, y);
          ctx.lineTo(xx, y + h);
        }
      } else {
        for (let yy = y + 18; yy < y + h; yy += 18) {
          ctx.moveTo(x, yy);
          ctx.lineTo(x + w, yy);
        }
      }
      ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = shade(col, 0.25);
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (horiz) {
        ctx.moveTo(x + 20, y + h / 2);
        ctx.lineTo(x + w - 20, y + h / 2);
      } else {
        ctx.moveTo(x + w / 2, y + 20);
        ctx.lineTo(x + w / 2, y + h - 20);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawRestaurantRoof(ctx, b) {
      const m = 24;
      const x = b.x - b.w / 2 - m;
      const y = b.y - b.h / 2 - m;
      const w = b.w + m * 2;
      const h = b.h + m * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(x + 12, y + 16, w, h);
      roundRect(ctx, x, y, w, h, 18);
      fillStroke(ctx, '#2f6b62', 7);
      ctx.save();
      roundRect(ctx, x, y, w, h, 18);
      ctx.clip();
      ctx.fillStyle = '#285c54';
      ctx.fillRect(x, y + h / 2, w, h / 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let xx = x + 16; xx < x + w; xx += 20) {
        ctx.moveTo(xx, y);
        ctx.lineTo(xx, y + h);
      }
      ctx.stroke();
      ctx.restore();
      roundRect(ctx, x + 10, y + 10, w - 20, h - 20, 14);
      ctx.strokeStyle = '#a8322a';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = '#d9b14a';
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 70, y + h / 2);
      ctx.lineTo(x + w - 70, y + h / 2);
      ctx.stroke();
      for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * 4, cy + dy * 40);
        ctx.quadraticCurveTo(cx - dx * 18, cy - dy * 18, cx + dx * 40, cy + dy * 4);
        ctx.strokeStyle = '#d9b14a';
        ctx.lineWidth = 9;
        ctx.stroke();
      }
      for (const ex of [x + 70, x + w - 70]) {
        circle(ctx, ex, y + h / 2, 14);
        fillStroke(ctx, '#d9b14a', 4);
      }
      const sw = 190;
      const sh = 70;
      const sx = b.x - sw / 2;
      const sy = y + h - sh / 2 - 6;
      roundRect(ctx, sx, sy, sw, sh, 10);
      fillStroke(ctx, '#7a1f1a', 6);
      roundRect(ctx, sx + 8, sy + 8, sw - 16, sh - 16, 6);
      ctx.strokeStyle = '#d9b14a';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.font = 'bold 40px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f2cf5c';
      ctx.fillText('允望樓', b.x, sy + sh / 2 + 2);
      ctx.textBaseline = 'alphabetic';
    }

    rockShape(o) {
      let s = this.rockCache.get(o.id);
      if (s) return s;
      s = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rnd(o.v, i) * 0.3;
        const r = 0.88 + rnd(o.v, i + 20) * 0.18;
        s.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      this.rockCache.set(o.id, s);
      return s;
    }

    poly(ctx, pts, x, y, r) {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(x + p[0] * r, y + p[1] * r) : ctx.moveTo(x + p[0] * r, y + p[1] * r)));
      ctx.closePath();
    }

    drawRock(ctx, o) {
      const s = this.rockShape(o);
      ctx.lineJoin = 'round';
      this.poly(ctx, s, o.x, o.y, o.r);
      fillStroke(ctx, '#a3a8ac', 5);
      this.poly(ctx, s, o.x - o.r * 0.12, o.y - o.r * 0.14, o.r * 0.58);
      ctx.fillStyle = '#bcc0c3';
      ctx.fill();
    }

    drawCrate(ctx, o) {
      const k = o.mhp ? 0.72 + 0.28 * clamp(o.hp / o.mhp, 0, 1) : 1;
      const hw = o.hw * k;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(o.x - hw + 5, o.y - hw + 6, hw * 2, hw * 2);
      roundRect(ctx, o.x - hw, o.y - hw, hw * 2, hw * 2, 5);
      fillStroke(ctx, '#d49a4a', 5);
      ctx.strokeStyle = '#a8732f';
      ctx.lineWidth = 4;
      ctx.strokeRect(o.x - hw + 7, o.y - hw + 7, hw * 2 - 14, hw * 2 - 14);
      this.outlinedText(ctx, '?', o.x, o.y + hw * 0.42, Math.round(hw * 1.2), '#fff1c9');
    }

    drawWall(ctx, o) {
      const b = o.b >= 0 ? this.map.buildings[o.b] : null;
      ctx.beginPath();
      ctx.rect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
      fillStroke(ctx, b && b.type === 'restaurant' ? '#8a2a22' : '#7a6450', 4);
    }

    drawPlank(ctx, o) {
      const x = o.x - o.hw;
      const y = o.y - o.hh;
      const w = o.hw * 2;
      const h = o.hh * 2;
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      fillStroke(ctx, '#a87a4a', 3.5);
      ctx.strokeStyle = '#7a5530';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const horiz = w >= h;
      const L = horiz ? w : h;
      for (let d = 22; d < L; d += 22 + (Math.floor(d) % 3) * 6) {
        if (horiz) {
          ctx.moveTo(x + d, y + 2);
          ctx.lineTo(x + d, y + h - 2);
        } else {
          ctx.moveTo(x + 2, y + d);
          ctx.lineTo(x + w - 2, y + d);
        }
      }
      ctx.stroke();
      const f = o.mhp ? o.hp / o.mhp : 1;
      if (f < 0.7) {
        const cracks = f < 0.35 ? 5 : 2;
        ctx.strokeStyle = '#2b1a0e';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        for (let i = 0; i < cracks; i++) {
          const t = rnd(o.id * 7 + 1, i);
          const cx = horiz ? x + 10 + t * (w - 20) : o.x;
          const cy = horiz ? o.y : y + 10 + t * (h - 20);
          const s = horiz ? h : w;
          ctx.moveTo(cx - (horiz ? 4 : s / 2), cy - (horiz ? s / 2 : 4));
          ctx.lineTo(cx + 3, cy);
          ctx.lineTo(cx - (horiz ? 2 : -s / 2), cy + (horiz ? s / 2 : 3));
        }
        ctx.stroke();
      }
    }

    drawTable(ctx, o) {
      circle(ctx, o.x + 4, o.y + 5, o.r);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + 0.3;
        circle(ctx, o.x + Math.cos(a) * (o.r + 14), o.y + Math.sin(a) * (o.r + 14), 9);
        fillStroke(ctx, '#7a3a26', 3);
      }
      circle(ctx, o.x, o.y, o.r);
      fillStroke(ctx, '#fbf6ec', 4);
      circle(ctx, o.x, o.y, o.r * 0.5);
      fillStroke(ctx, '#e8d9bf', 3);
      const dishes = ['#e8a33a', '#d6403a', '#7ac35a'];
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + o.v;
        circle(ctx, o.x + Math.cos(a) * o.r * 0.25, o.y + Math.sin(a) * o.r * 0.25, 5);
        ctx.fillStyle = dishes[i];
        ctx.fill();
      }
    }

    drawStove(ctx, o) {
      roundRect(ctx, o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2, 6);
      fillStroke(ctx, '#55595c', 4);
      const n = Math.max(1, Math.floor((o.hw * 2) / 60));
      for (let i = 0; i < n; i++) {
        const bx = o.x - o.hw + (i + 0.5) * ((o.hw * 2) / n);
        circle(ctx, bx, o.y, 13);
        fillStroke(ctx, '#2a2a2a', 3);
        const f = 0.6 + Math.sin(this.time * 9 + i) * 0.2;
        circle(ctx, bx, o.y, 7 * f + 3);
        ctx.fillStyle = 'rgba(255,140,40,0.85)';
        ctx.fill();
      }
    }

    drawContainer(ctx, o) {
      const col = CONTAINER_COL[o.v % CONTAINER_COL.length];
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(o.x - o.hw + 8, o.y - o.hh + 10, o.hw * 2, o.hh * 2);
      roundRect(ctx, o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2, 4);
      fillStroke(ctx, col, 5);
      ctx.strokeStyle = shade(col, -0.25);
      ctx.lineWidth = 3;
      ctx.beginPath();
      const long = o.hw > o.hh;
      if (long) {
        for (let xx = o.x - o.hw + 12; xx < o.x + o.hw; xx += 12) {
          ctx.moveTo(xx, o.y - o.hh + 4);
          ctx.lineTo(xx, o.y + o.hh - 4);
        }
      } else {
        for (let yy = o.y - o.hh + 12; yy < o.y + o.hh; yy += 12) {
          ctx.moveTo(o.x - o.hw + 4, yy);
          ctx.lineTo(o.x + o.hw - 4, yy);
        }
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(120,70,40,0.35)';
      circle(ctx, o.x + o.hw * 0.4, o.y + o.hh * 0.3, 10);
      ctx.fill();
    }

    drawLanternPost(ctx, o) {
      circle(ctx, o.x, o.y, o.r);
      fillStroke(ctx, '#5a3a22', 3);
    }

    drawLanternTop(ctx, o) {
      const g = ctx.createRadialGradient(o.x, o.y - 18, 4, o.x, o.y - 18, 60);
      g.addColorStop(0, 'rgba(255,200,90,0.35)');
      g.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = g;
      circle(ctx, o.x, o.y - 18, 60);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(o.x, o.y - 18, 15, 19, 0, 0, TAU);
      fillStroke(ctx, '#d9372b', 3);
      ctx.fillStyle = '#d9b14a';
      ctx.fillRect(o.x - 8, o.y - 40, 16, 5);
      ctx.fillRect(o.x - 8, o.y + 1, 16, 5);
      ctx.strokeStyle = 'rgba(255,220,140,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - 36);
      ctx.lineTo(o.x, o.y);
      ctx.stroke();
    }

    drawBambooBase(ctx, o) {
      for (let i = 0; i < 4; i++) {
        const a = rnd(o.v, i) * TAU;
        const d = i === 0 ? 0 : 9 + rnd(o.v, i + 4) * 6;
        circle(ctx, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 6.5);
        fillStroke(ctx, '#9ccf5a', 3);
        circle(ctx, o.x + Math.cos(a) * d, o.y + Math.sin(a) * d, 3);
        ctx.fillStyle = '#6f9e3a';
        ctx.fill();
      }
    }

    drawBambooLeaves(ctx, o, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU + rnd(o.v, 7) * TAU;
        const len = 30 + rnd(o.v, i + 30) * 16;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.quadraticCurveTo(len * 0.5, -10, len, 0);
        ctx.quadraticCurveTo(len * 0.5, 10, 6, 0);
        ctx.fillStyle = i % 2 ? '#5aa547' : '#6fbd4f';
        ctx.fill();
        ctx.strokeStyle = 'rgba(43,42,40,0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }

    drawTrunk(ctx, o) {
      circle(ctx, o.x, o.y, o.r * 0.6);
      fillStroke(ctx, '#7a5432', 4);
    }

    drawCanopy(ctx, o, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const r = o.r * CANOPY;
      const blossom = o.v % 5 === 0;
      circle(ctx, o.x, o.y, r);
      fillStroke(ctx, blossom ? '#e88fae' : '#4a9b3f', 5);
      circle(ctx, o.x - r * 0.15, o.y - r * 0.15, r * 0.62);
      ctx.fillStyle = blossom ? '#f3a9c4' : '#5bb04c';
      ctx.fill();
      circle(ctx, o.x - r * 0.3, o.y - r * 0.32, r * 0.22);
      ctx.fillStyle = blossom ? '#fbd0df' : '#6dc05a';
      ctx.fill();
      ctx.restore();
    }

    drawBush(ctx, o, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      circle(ctx, o.x, o.y, o.r);
      fillStroke(ctx, '#3f8f3a', 5);
      circle(ctx, o.x - o.r * 0.2, o.y - o.r * 0.2, o.r * 0.55);
      ctx.fillStyle = '#4fa548';
      ctx.fill();
      if (o.v % 3 === 0) {
        for (let i = 0; i < 5; i++) {
          circle(ctx, o.x + (rnd(o.v, i) - 0.5) * o.r * 1.2, o.y + (rnd(o.v, i + 9) - 0.5) * o.r * 1.2, 5);
          fillStroke(ctx, '#e0463e', 2);
        }
      }
      ctx.restore();
    }

    // ---------- weapons and items ----------

    drawGun(ctx, t, x, y, scale) {
      const W = D.WEAPONS[t];
      const len = W.len * scale;
      const wid = W.wid * scale;
      ctx.lineJoin = 'round';
      if (t === 'harpoon') {
        roundRect(ctx, x, y - wid / 2, len * 0.7, wid, 3 * scale);
        fillStroke(ctx, W.color, 3 * scale);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 4 * scale;
        ctx.beginPath();
        ctx.moveTo(x + len * 0.6, y);
        ctx.lineTo(x + len, y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + len + 8 * scale, y);
        ctx.lineTo(x + len - 4 * scale, y - 6 * scale);
        ctx.lineTo(x + len - 4 * scale, y + 6 * scale);
        ctx.closePath();
        fillStroke(ctx, '#c9d1d6', 2 * scale);
        return;
      }
      roundRect(ctx, x, y - wid / 2, len, wid, 2 * scale);
      fillStroke(ctx, W.color, 3 * scale);
      if (t !== 'pistol' && t !== 'uzi') {
        roundRect(ctx, x - 10 * scale, y - wid / 2 - 1, 14 * scale, wid + 2, 3 * scale);
        fillStroke(ctx, t === 'shotgun' ? '#9a6234' : shade(W.color, 0.2), 3 * scale);
      }
      if (t === 'sniper') {
        roundRect(ctx, x + len * 0.3, y - wid / 2 - 5 * scale, len * 0.3, 5 * scale, 2);
        fillStroke(ctx, '#1f262c', 2.5 * scale);
      }
      if (t === 'minigun') {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        ctx.moveTo(x + len * 0.4, y - wid * 0.2);
        ctx.lineTo(x + len, y - wid * 0.2);
        ctx.moveTo(x + len * 0.4, y + wid * 0.2);
        ctx.lineTo(x + len, y + wid * 0.2);
        ctx.stroke();
      }
    }

    // Kitchen and melee tools drawn pointing along +x from (x, y).
    drawMelee(ctx, t, x, y, s) {
      ctx.lineJoin = 'round';
      if (t === 'knife' || t === 'cleaver') {
        roundRect(ctx, x - 12 * s, y - 3.5 * s, 16 * s, 7 * s, 2);
        fillStroke(ctx, '#6b4a2b', 3 * s);
        if (t === 'cleaver') {
          roundRect(ctx, x + 4 * s, y - 13 * s, 34 * s, 22 * s, 3 * s);
          fillStroke(ctx, '#cfd6db', 3 * s);
          circle(ctx, x + 32 * s, y - 7 * s, 3 * s);
          ctx.fillStyle = OUT;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x + 4 * s, y - 5 * s);
          ctx.lineTo(x + 28 * s, y - 5 * s);
          ctx.lineTo(x + 36 * s, y);
          ctx.lineTo(x + 28 * s, y + 5 * s);
          ctx.lineTo(x + 4 * s, y + 5 * s);
          ctx.closePath();
          fillStroke(ctx, '#c9d1d6', 3 * s);
        }
      } else if (t === 'pan') {
        roundRect(ctx, x - 10 * s, y - 4 * s, 26 * s, 8 * s, 3);
        fillStroke(ctx, '#3a3a3a', 3 * s);
        circle(ctx, x + 34 * s, y, 19 * s);
        fillStroke(ctx, '#4d5257', 3.5 * s);
        circle(ctx, x + 34 * s, y, 13 * s);
        ctx.fillStyle = '#2f3336';
        ctx.fill();
        circle(ctx, x + 29 * s, y - 5 * s, 4 * s);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fill();
      } else if (t === 'wok') {
        roundRect(ctx, x - 14 * s, y - 4 * s, 26 * s, 8 * s, 3);
        fillStroke(ctx, '#7a4b2a', 3 * s);
        circle(ctx, x + 36 * s, y, 24 * s);
        fillStroke(ctx, '#2f3336', 4 * s);
        circle(ctx, x + 36 * s, y, 17 * s);
        ctx.fillStyle = '#e8762a';
        ctx.fill();
        circle(ctx, x + 32 * s, y - 4 * s, 5 * s);
        ctx.fillStyle = '#ffd04a';
        ctx.fill();
      } else if (t === 'rollingpin') {
        roundRect(ctx, x - 14 * s, y - 4 * s, 12 * s, 8 * s, 3);
        fillStroke(ctx, '#8a5a30', 3 * s);
        roundRect(ctx, x - 2 * s, y - 8 * s, 56 * s, 16 * s, 7 * s);
        fillStroke(ctx, '#e3b878', 3 * s);
        roundRect(ctx, x + 54 * s, y - 4 * s, 12 * s, 8 * s, 3);
        fillStroke(ctx, '#8a5a30', 3 * s);
      } else if (t === 'swordfish') {
        ctx.beginPath();
        ctx.moveTo(x - 16 * s, y);
        ctx.lineTo(x - 26 * s, y - 12 * s);
        ctx.lineTo(x - 26 * s, y + 12 * s);
        ctx.closePath();
        fillStroke(ctx, '#5f8fc0', 3 * s);
        ctx.beginPath();
        ctx.ellipse(x + 12 * s, y, 30 * s, 11 * s, 0, 0, TAU);
        fillStroke(ctx, '#7fb6e8', 3 * s);
        ctx.beginPath();
        ctx.moveTo(x + 40 * s, y - 3 * s);
        ctx.lineTo(x + 78 * s, y);
        ctx.lineTo(x + 40 * s, y + 3 * s);
        ctx.closePath();
        fillStroke(ctx, '#cfe3f3', 2.5 * s);
        circle(ctx, x + 30 * s, y - 3 * s, 2.5 * s);
        ctx.fillStyle = OUT;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(x - 4 * s, y + 6 * s);
        ctx.lineTo(x + 20 * s, y + 6 * s);
        ctx.stroke();
      }
    }

    drawChopsticks(ctx, x, y, s) {
      ctx.lineCap = 'round';
      for (const off of [-3, 3]) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 5 * s;
        ctx.beginPath();
        ctx.moveTo(x - 14 * s, y + off * s * 1.4);
        ctx.lineTo(x + 18 * s, y + off * s * 0.4);
        ctx.stroke();
        ctx.strokeStyle = '#c98a4a';
        ctx.lineWidth = 2.5 * s;
        ctx.stroke();
      }
    }

    drawBowl(ctx, x, y, s, spin) {
      circle(ctx, x, y, 13 * s);
      fillStroke(ctx, '#f7f4ee', 3 * s);
      circle(ctx, x, y, 9 * s);
      ctx.strokeStyle = '#3f6fc0';
      ctx.lineWidth = 2.5 * s;
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin || 0);
      ctx.strokeStyle = '#3f6fc0';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(-4 * s, 0);
      ctx.lineTo(4 * s, 0);
      ctx.stroke();
      ctx.restore();
    }

    drawItemIcon(ctx, t, x, y, scale) {
      ctx.save();
      ctx.translate(x, y);
      const W = D.WEAPONS[t];
      if (t === 'chopsticks') {
        ctx.rotate(-0.6);
        this.drawChopsticks(ctx, 0, 0, scale * 1.1);
      } else if (t === 'bowl') {
        this.drawBowl(ctx, 0, 0, scale * 1.2, 0);
      } else if (W && !W.melee) {
        const s = scale * Math.min(1, 52 / W.len);
        ctx.rotate(-0.45);
        this.drawGun(ctx, t, (-W.len * s) / 2, 0, s);
      } else if (W && W.melee) {
        const len = t === 'swordfish' ? 100 : t === 'rollingpin' ? 80 : t === 'pan' || t === 'wok' ? 60 : 50;
        const s = scale * Math.min(1, 56 / len);
        ctx.rotate(-0.7);
        this.drawMelee(ctx, t, (-len * s) / 2 + 12 * s, 0, s);
      } else if (t === 'soup') {
        roundRect(ctx, -11 * scale, -14 * scale, 22 * scale, 28 * scale, 6 * scale);
        fillStroke(ctx, '#e8e2d4', 3 * scale);
        roundRect(ctx, -11 * scale, -14 * scale, 22 * scale, 8 * scale, 4 * scale);
        fillStroke(ctx, '#c9533f', 3 * scale);
        ctx.fillStyle = '#e8a33a';
        ctx.fillRect(-7 * scale, 0, 14 * scale, 8 * scale);
      } else if (t === 'bao') {
        circle(ctx, 0, 0, 16 * scale);
        fillStroke(ctx, '#d9b36a', 3 * scale);
        for (const [dx, dy] of [[-6, -5], [6, -5], [0, 6]]) {
          circle(ctx, dx * scale, dy * scale, 6.5 * scale);
          fillStroke(ctx, '#fbf3e4', 2 * scale);
        }
      } else if (t === 'bag') {
        roundRect(ctx, -14 * scale, -12 * scale, 28 * scale, 24 * scale, 4 * scale);
        fillStroke(ctx, '#f0c043', 3 * scale);
        ctx.fillStyle = '#2b2a28';
        ctx.font = 'bold ' + Math.round(9 * scale) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('允', 0, 4 * scale);
      } else if (D.ITEMS[t] && D.ITEMS[t].lv) {
        scale *= 1.3;
        roundRect(ctx, -17 * scale, -6 * scale, 22 * scale, 12 * scale, 3 * scale);
        fillStroke(ctx, '#3b4148', 2.5 * scale);
        circle(ctx, 9 * scale, 0, 11 * scale);
        fillStroke(ctx, '#3b4148', 3 * scale);
        circle(ctx, 9 * scale, 0, 7 * scale);
        ctx.fillStyle = D.ITEMS[t].lv === 8 ? '#ffd76a' : D.ITEMS[t].lv === 4 ? '#9fe0a0' : '#9fd4ff';
        ctx.fill();
        ctx.strokeStyle = '#2b2a28';
        ctx.lineWidth = 1.5 * scale;
        ctx.beginPath();
        ctx.moveTo(2 * scale, 0);
        ctx.lineTo(16 * scale, 0);
        ctx.moveTo(9 * scale, -7 * scale);
        ctx.lineTo(9 * scale, 7 * scale);
        ctx.stroke();
        this.outlinedText(ctx, D.ITEMS[t].lv + 'x', -6 * scale, 20 * scale, 11 * scale, '#ffffff');
      } else if (t === 'coldbox') {
        roundRect(ctx, -16 * scale, -14 * scale, 32 * scale, 28 * scale, 4 * scale);
        fillStroke(ctx, '#d8f2ff', 3 * scale);
        ctx.fillStyle = '#4aa3e0';
        ctx.fillRect(-16 * scale, -3 * scale, 32 * scale, 6 * scale);
        ctx.strokeStyle = '#2f7fc0';
        ctx.lineWidth = 2 * scale;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.moveTo(Math.cos(a) * 8 * scale, Math.sin(a) * 8 * scale - 0);
          ctx.lineTo(-Math.cos(a) * 8 * scale, -Math.sin(a) * 8 * scale);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    drawGroundItem(ctx, it) {
      const bob = Math.sin(this.time * 3 + it.i) * 2;
      const W = D.WEAPONS[it.t];
      if (it.t === 'drop') {
        if (it.f > 0) {
          const k = clamp(1 - it.f / 4, 0.2, 1);
          ctx.fillStyle = 'rgba(0,0,0,' + (0.1 + k * 0.2) + ')';
          ctx.beginPath();
          ctx.ellipse(it.x, it.y, 34 * k, 24 * k, 0, 0, TAU);
          ctx.fill();
        } else {
          this.drawDropCrate(ctx, it.x, it.y, 1, true);
        }
        return;
      }
      if (it.t === 'coldbox') {
        const pulse = 0.5 + Math.sin(this.time * 4) * 0.5;
        const g = ctx.createRadialGradient(it.x, it.y, 6, it.x, it.y, 70);
        g.addColorStop(0, 'rgba(140,220,255,' + (0.55 + pulse * 0.3) + ')');
        g.addColorStop(1, 'rgba(140,220,255,0)');
        ctx.fillStyle = g;
        circle(ctx, it.x, it.y, 70);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(it.x - 26, it.y - 30, 18, Math.PI, 0);
        ctx.closePath();
        fillStroke(ctx, '#ffffff', 3);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(it.x - 44, it.y - 30);
        ctx.lineTo(it.x - 12, it.y - 10);
        ctx.moveTo(it.x - 8, it.y - 30);
        ctx.lineTo(it.x - 12, it.y - 10);
        ctx.stroke();
        this.drawItemIcon(ctx, it.t, it.x, it.y + bob, 1.3);
        return;
      }
      const rare = W && W.rare;
      circle(ctx, it.x, it.y, 28);
      ctx.fillStyle = rare ? 'rgba(255,215,90,0.32)' : 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.strokeStyle = rare ? (W.legendary ? '#7fd3ff' : '#ffcf3a') : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = rare ? 3.5 : 2;
      ctx.stroke();
      if (rare) {
        const a = this.time * 2 + it.i;
        for (let k = 0; k < 3; k++) {
          const aa = a + (k / 3) * TAU;
          ctx.fillStyle = '#fff6c8';
          circle(ctx, it.x + Math.cos(aa) * 30, it.y + Math.sin(aa) * 30, 3);
          ctx.fill();
        }
      }
      this.drawItemIcon(ctx, it.t, it.x, it.y + bob, 1);
    }

    // ---------- hidden details ----------

    twinkle(ctx, x, y, seed) {
      const t = (this.time + seed * 0.37) % 3.5;
      if (t > 0.6) return;
      ctx.globalAlpha = 1 - t / 0.6;
      star(ctx, x, y, 7 + t * 8);
      ctx.fillStyle = '#fffbe0';
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    drawBoard(ctx, o) {
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(o.x - o.hw + 4, o.y - o.hh + 5, o.hw * 2, o.hh * 2);
      roundRect(ctx, o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2, 3);
      fillStroke(ctx, '#8a5a30', 3);
      for (const sx of [-1, 1]) {
        circle(ctx, o.x + sx * (o.hw - 6), o.y, 6);
        fillStroke(ctx, '#5a3a22', 2.5);
      }
    }

    drawBoardTop(ctx, o) {
      const x = o.x;
      const y = o.y - 46;
      roundRect(ctx, x - 40, y - 28, 80, 54, 5);
      fillStroke(ctx, '#8a5a30', 3.5);
      roundRect(ctx, x - 33, y - 21, 66, 40, 2);
      ctx.fillStyle = '#f3e2b8';
      ctx.fill();
      ctx.fillStyle = '#b8322a';
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(I.lang === 'en' ? 'NOTICE' : '允望樓 公告', x, y - 7);
      ctx.fillStyle = 'rgba(70,50,30,0.55)';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - 25, y + i * 6, i === 2 ? 30 : 50, 2.2);
      circle(ctx, x + 22, y + 11, 5);
      ctx.fillStyle = 'rgba(200,40,30,0.75)';
      ctx.fill();
      this.twinkle(ctx, x + 34, y - 24, o.v || 0);
    }

    drawSecretSpot(ctx, sc) {
      if (sc.id === 'log') {
        circle(ctx, sc.x + 18, sc.y + 6, 15);
        fillStroke(ctx, '#c9a56a', 3);
        circle(ctx, sc.x + 18, sc.y + 6, 7);
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.save();
        ctx.translate(sc.x - 8, sc.y);
        ctx.rotate(-0.25);
        roundRect(ctx, -14, -11, 28, 22, 3);
        fillStroke(ctx, '#3f5f7a', 2.5);
        ctx.strokeStyle = '#e8d8a8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(0, 6);
        ctx.moveTo(-5, 3);
        ctx.quadraticCurveTo(0, 9, 5, 3);
        ctx.moveTo(-4, -4);
        ctx.lineTo(4, -4);
        ctx.stroke();
        ctx.restore();
        this.twinkle(ctx, sc.x - 18, sc.y - 14, sc.x);
      } else if (sc.id === 'recipe') {
        ctx.save();
        ctx.translate(sc.x, sc.y);
        ctx.rotate(0.3);
        roundRect(ctx, -18, -8, 36, 16, 3);
        fillStroke(ctx, '#f3e2b8', 2.5);
        for (const ex of [-18, 18]) {
          circle(ctx, ex, 0, 5);
          fillStroke(ctx, '#a8732f', 2);
        }
        circle(ctx, 4, 2, 4);
        ctx.fillStyle = '#c4362c';
        ctx.fill();
        ctx.restore();
        this.twinkle(ctx, sc.x + 16, sc.y - 14, sc.y);
      }
    }

    drawGold(ctx, g) {
      const pulse = 0.5 + Math.sin(this.time * 3) * 0.5;
      const gr = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 46);
      gr.addColorStop(0, 'rgba(255,220,90,' + (0.35 + pulse * 0.25) + ')');
      gr.addColorStop(1, 'rgba(255,220,90,0)');
      ctx.fillStyle = gr;
      circle(ctx, g.x, g.y, 46);
      ctx.fill();
      const y = g.y + Math.sin(this.time * 2.5) * 2;
      ctx.beginPath();
      ctx.ellipse(g.x, y, 15, 12, 0, 0, TAU);
      fillStroke(ctx, '#ffd23a', 3);
      ctx.strokeStyle = '#c99a1a';
      ctx.lineWidth = 1.8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(g.x, y - 3);
        ctx.lineTo(g.x + i * 5, y - 11);
        ctx.stroke();
      }
      circle(ctx, g.x, y - 4, 3);
      ctx.fillStyle = '#fff3b0';
      ctx.fill();
      this.twinkle(ctx, g.x + 14, y - 14, 3);
    }

    drawCat(ctx, c) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      ctx.scale(1.35, 1.35);
      const walk = c.s ? 0 : Math.sin(this.time * 12) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(3, 4, 18, 11, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      if (c.s) ctx.quadraticCurveTo(-20, 16, 2, 14);
      else ctx.quadraticCurveTo(-26, walk * 2, -30, -8 + walk);
      ctx.stroke();
      ctx.strokeStyle = '#e39b4a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.beginPath();
      ctx.ellipse(-2, 0, c.s ? 12 : 15, 10, 0, 0, TAU);
      fillStroke(ctx, '#e39b4a', 2.5);
      ctx.strokeStyle = '#b8692a';
      ctx.lineWidth = 2;
      for (const sx of [-8, -2, 4]) {
        ctx.beginPath();
        ctx.moveTo(sx, -8);
        ctx.lineTo(sx + 1, -3);
        ctx.moveTo(sx, 8);
        ctx.lineTo(sx + 1, 3);
        ctx.stroke();
      }
      for (const sy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(15, sy * 3);
        ctx.lineTo(19, sy * 10);
        ctx.lineTo(10, sy * 8);
        ctx.closePath();
        fillStroke(ctx, '#e39b4a', 2);
      }
      circle(ctx, 14, 0, 7.5);
      fillStroke(ctx, '#f0ad5c', 2.5);
      ctx.restore();
      if (c.h) {
        heart(ctx, c.x, c.y - 38 + Math.sin(this.time * 5) * 2, 8);
        ctx.fillStyle = '#ff6f9f';
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    drawDropCrate(ctx, x, y, s, chuteDown) {
      if (chuteDown) {
        ctx.beginPath();
        ctx.ellipse(x + 30, y - 18, 26, 12, 0.5, 0, TAU);
        fillStroke(ctx, 'rgba(240,248,255,0.9)', 2.5);
        ctx.strokeStyle = '#38b7e8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(x + 30, y - 18, 16, 6, 0.5, 0, TAU);
        ctx.stroke();
      }
      const h = 26 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x - h + 5, y - h + 6, h * 2, h * 2);
      roundRect(ctx, x - h, y - h, h * 2, h * 2, 6 * s);
      fillStroke(ctx, '#e9f4fb', 4);
      ctx.fillStyle = '#38b7e8';
      ctx.fillRect(x - h + 3, y - 5 * s, h * 2 - 6, 10 * s);
      ctx.strokeStyle = '#2a7fae';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(x - Math.cos(a) * 12 * s, y - h * 0.55 - Math.sin(a) * 12 * s + 4 * s);
        ctx.lineTo(x + Math.cos(a) * 12 * s, y - h * 0.55 + Math.sin(a) * 12 * s + 4 * s);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold ' + Math.round(10 * s) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('允望', x, y + 4 * s);
    }

    drawFallingDrop(ctx, it) {
      const lift = it.f * 55;
      const sway = Math.sin(this.time * 2 + it.i) * 6;
      const x = it.x + sway;
      const y = it.y - lift;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (const ex of [-30, -10, 10, 30]) {
        ctx.moveTo(x + ex * 1.6, y - 70);
        ctx.lineTo(x + ex * 0.6, y - 20);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x, y - 72, 56, 26, 0, Math.PI, 0);
      ctx.closePath();
      fillStroke(ctx, '#f4f9ff', 3);
      ctx.fillStyle = '#38b7e8';
      ctx.beginPath();
      ctx.ellipse(x, y - 72, 20, 26, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      this.drawDropCrate(ctx, x, y, 0.85, false);
    }

    drawPlane(ctx, q, shadow) {
      ctx.save();
      if (shadow) {
        ctx.translate(q.x + 150, q.y + 190);
        ctx.scale(0.9, 0.9);
      } else {
        ctx.translate(q.x, q.y);
      }
      ctx.rotate(q.a);
      const body = new Path2D();
      body.moveTo(-120, -14);
      body.lineTo(90, -16);
      body.quadraticCurveTo(135, -14, 140, 0);
      body.quadraticCurveTo(135, 14, 90, 16);
      body.lineTo(-120, 14);
      body.closePath();
      const wings = new Path2D();
      for (const sy of [-1, 1]) {
        wings.moveTo(30, sy * 14);
        wings.lineTo(-20, sy * 150);
        wings.lineTo(-48, sy * 150);
        wings.lineTo(-30, sy * 14);
        wings.closePath();
        wings.moveTo(-95, sy * 12);
        wings.lineTo(-122, sy * 54);
        wings.lineTo(-138, sy * 54);
        wings.lineTo(-125, sy * 12);
        wings.closePath();
      }
      if (shadow) {
        ctx.fillStyle = 'rgba(0,0,0,0.16)';
        ctx.fill(wings);
        ctx.fill(body);
        ctx.restore();
        return;
      }
      ctx.lineJoin = 'round';
      ctx.fillStyle = '#e4ecf2';
      ctx.fill(wings);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 4;
      ctx.stroke(wings);
      for (const sy of [-1, 1]) {
        for (const d of [55, 100]) {
          roundRect(ctx, -10 - d * 0.28, sy * d - 7, 34, 14, 6);
          fillStroke(ctx, '#9aa7b1', 3);
        }
      }
      ctx.fillStyle = '#f7fafc';
      ctx.fill(body);
      ctx.stroke(body);
      ctx.fillStyle = '#38b7e8';
      ctx.fillRect(-118, -5, 220, 10);
      ctx.fillStyle = '#2b2a28';
      ctx.beginPath();
      ctx.moveTo(112, -8);
      ctx.quadraticCurveTo(128, -7, 130, 0);
      ctx.quadraticCurveTo(128, 7, 112, 8);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#1f6f9a';
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('允望', -95, 30);
      ctx.fillText('冷鏈', 95, 30);
      ctx.restore();
    }

    // ---------- characters ----------

    drawBody(ctx, p) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      circle(ctx, p.x, p.y, PR * 0.8);
      fillStroke(ctx, '#8d8d8d', 4);
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(p.x - 7, p.y - 7);
      ctx.lineTo(p.x + 7, p.y + 7);
      ctx.moveTo(p.x + 7, p.y - 7);
      ctx.lineTo(p.x - 7, p.y + 7);
      ctx.stroke();
      ctx.restore();
    }

    skinOf(ch) {
      if (D.CHARS[ch]) return D.CHARS[ch].skin;
      return D.SKIN_FOE[ch] || '#e9b98c';
    }

    hand(ctx, x, y, skin, ch) {
      if (ch === 'luap') {
        circle(ctx, x, y, 11.5);
        fillStroke(ctx, '#d63a32', 4);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        circle(ctx, x - 3, y - 3, 3.5);
        ctx.fill();
        return;
      }
      circle(ctx, x, y, ch === 'boss' ? 11 : 9);
      fillStroke(ctx, skin, 4);
    }

    // Draws a character's head gear in local coords where +x is the facing direction.
    drawHeadgear(ctx, ch, R) {
      if (ch === 'afeng') {
        circle(ctx, 0, 0, R * 0.92);
        fillStroke(ctx, '#f2a33a', 3.5);
        ctx.beginPath();
        ctx.arc(0, 0, R * 0.78, -0.7, 0.7);
        ctx.strokeStyle = '#2b4a6a';
        ctx.lineWidth = 7;
        ctx.stroke();
        return;
      }
      if (ch === 'bubbles') {
        for (const [bx, by, br] of [[-6, -6, 0.32], [-2, 7, 0.26], [-11, 3, 0.22]]) {
          circle(ctx, bx, by, R * br);
          ctx.fillStyle = 'rgba(190,235,255,0.8)';
          ctx.fill();
          ctx.strokeStyle = '#4fa3c7';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        return;
      }
      if (ch === 'jinjin') {
        ctx.beginPath();
        ctx.arc(0, 0, R - 3, -1.2, 1.2);
        ctx.strokeStyle = '#3aa067';
        ctx.lineWidth = 7;
        ctx.stroke();
        return;
      }
      if (ch === 'bing') {
        circle(ctx, -2, 0, R * 0.8);
        fillStroke(ctx, '#8a6a4a', 3);
        circle(ctx, -2, 0, R * 0.8);
        ctx.strokeStyle = '#f4f4f4';
        ctx.lineWidth = 5;
        ctx.stroke();
        return;
      }
      if (ch === 'yunwang') {
        ctx.beginPath();
        ctx.arc(-R * 0.1, 0, R * 0.98, Math.PI * 0.62, Math.PI * 1.38);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 6;
        ctx.stroke();
        for (const [dx, dy, r] of [[-6, 0, 0.5], [-3, -8, 0.34], [-3, 8, 0.34], [3, 0, 0.36]]) {
          circle(ctx, dx, dy, R * r);
          fillStroke(ctx, '#ffffff', 3.5);
        }
      } else if (ch === 'luap') {
        ctx.beginPath();
        ctx.arc(0, 0, R - 4, -1.25, 1.25);
        ctx.strokeStyle = '#d63a32';
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-R + 2, -3);
        ctx.lineTo(-R - 12, -9);
        ctx.moveTo(-R + 2, 3);
        ctx.lineTo(-R - 11, 8);
        ctx.strokeStyle = '#d63a32';
        ctx.lineWidth = 5;
        ctx.stroke();
      } else if (ch === 'auhsoj') {
        circle(ctx, -3, 0, R * 0.78);
        fillStroke(ctx, '#2f6fd6', 4);
        ctx.beginPath();
        ctx.ellipse(R * 0.55, 0, R * 0.45, R * 0.62, 0, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        fillStroke(ctx, '#2558b0', 4);
        circle(ctx, -6, 0, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (ch === 'meibao') {
        circle(ctx, -4, 0, R * 0.82);
        fillStroke(ctx, '#3b2418', 4);
        for (const sy of [-1, 1]) {
          circle(ctx, -R * 0.45, sy * R * 0.72, R * 0.4);
          fillStroke(ctx, '#3b2418', 4);
          ctx.beginPath();
          ctx.ellipse(-R * 0.2, sy * R * 0.58, 7, 4, sy * 0.6, 0, TAU);
          fillStroke(ctx, '#ff8fbf', 2.5);
        }
      } else if (ch === 'thug') {
        ctx.beginPath();
        ctx.arc(-2, 0, R * 0.72, Math.PI * 0.55, Math.PI * 1.45);
        ctx.closePath();
        fillStroke(ctx, '#c83a32', 3.5);
        circle(ctx, -R * 0.75, 0, 5);
        fillStroke(ctx, '#c83a32', 2.5);
      } else if (ch === 'elite') {
        circle(ctx, -3, 0, R * 0.7);
        fillStroke(ctx, '#2a2f3a', 4);
        ctx.strokeStyle = '#c83a32';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(-3, 0, R * 0.7, Math.PI * 0.7, Math.PI * 1.3);
        ctx.stroke();
      } else if (ch === 'boss') {
        ctx.beginPath();
        ctx.arc(R * 0.1, 0, R * 0.88, -1.0, 1.0);
        ctx.strokeStyle = '#f4f4f4';
        ctx.lineWidth = 9;
        ctx.stroke();
        circle(ctx, -5, 0, R * 0.78);
        fillStroke(ctx, '#1f2f4f', 5);
        ctx.beginPath();
        ctx.ellipse(R * 0.4, 0, R * 0.3, R * 0.66, 0, -Math.PI / 2, Math.PI / 2);
        ctx.closePath();
        fillStroke(ctx, '#1a2640', 4);
        ctx.strokeStyle = '#e2b84a';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(4, 0);
        ctx.moveTo(-5, -7);
        ctx.lineTo(-5, 7);
        ctx.arc(-5, 0, 7, 0.4, Math.PI - 0.4);
        ctx.stroke();
      }
    }

    // Body ring that hints at outfit: chef jacket, striped shirt, and so on.
    drawOutfit(ctx, ch, R) {
      let col = null;
      if (ch === 'yunwang') col = '#ffffff';
      else if (ch === 'meibao') col = '#ff9cc6';
      else if (ch === 'auhsoj') col = '#5c6b7a';
      else if (D.CHARS[ch] && SHIRT[ch]) col = SHIRT[ch];
      else if (ch === 'elite') col = '#2a2f3a';
      if (ch === 'thug') {
        for (let i = 0; i < 10; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, R - 3, (i / 10) * TAU, ((i + 0.5) / 10) * TAU);
          ctx.strokeStyle = '#2f4f8a';
          ctx.lineWidth = 6;
          ctx.stroke();
        }
        return;
      }
      if (ch === 'boss') col = '#1f2f4f';
      if (!col) return;
      circle(ctx, 0, 0, R - 3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 6;
      ctx.stroke();
    }

    drawPlayer(ctx, p, aim) {
      const ch = p.ch;
      const R = p.r || PR;
      const skin = this.skinOf(ch);
      const jz = p.jz || 0;
      const sc = (1 + jz * 0.28) * (R / PR);
      ctx.save();
      ctx.translate(p.x, p.y);
      if ((this.tmode === 'teams' && p.tm) || (this.tmode === 'coop' && p.tm === 1)) {
        circle(ctx, 0, 0, R + 8);
        ctx.strokeStyle = this.tmode === 'coop' ? 'rgba(120,220,110,0.85)' : p.tm === 1 ? 'rgba(230,70,60,0.9)' : 'rgba(70,140,240,0.9)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      if (p.sh) {
        circle(ctx, 0, 0, R + 14);
        ctx.fillStyle = 'rgba(160,230,255,' + (0.18 + Math.sin(this.time * 10) * 0.08) + ')';
        ctx.fill();
        ctx.strokeStyle = 'rgba(200,245,255,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (p.rs) {
        ctx.save();
        ctx.rotate(aim);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        for (const off of [-14, 0, 14]) {
          ctx.beginPath();
          ctx.moveTo(-R - 10, off);
          ctx.lineTo(-R - 50 - Math.random() * 20, off);
          ctx.stroke();
        }
        ctx.restore();
      }
      if (p.fx & 4) {
        circle(ctx, 0, 0, R + 8);
        ctx.strokeStyle = 'rgba(255,150,200,0.6)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      circle(ctx, 4 + jz * 14, 6 + jz * 18, R);
      ctx.fill();
      ctx.scale(sc, sc);
      ctx.rotate(aim);
      if (p.bp) {
        roundRect(ctx, -PR - 12, -18, 24, 36, 7);
        fillStroke(ctx, '#f0c043', 4);
        ctx.fillStyle = '#c9533f';
        ctx.fillRect(-PR - 9, -3, 18, 6);
      } else if (ch === 'afeng') {
        roundRect(ctx, -PR - 14, -20, 28, 40, 5);
        fillStroke(ctx, '#f2a33a', 4);
        ctx.fillStyle = '#c97f1f';
        ctx.fillRect(-PR - 14, -3, 28, 6);
      } else if (PACK_COL[ch]) {
        roundRect(ctx, -PR - 7, -14, 17, 28, 6);
        fillStroke(ctx, PACK_COL[ch], 4);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-PR - 4, -6);
        ctx.lineTo(-PR + 6, -6);
        ctx.stroke();
      }
      const t = p.w;
      const W = D.WEAPONS[t];
      const sw = p.sw || 0;
      const prog = sw ? Math.sin((1 - Math.abs(sw)) * Math.PI) : 0;
      const side = sw >= 0 ? 1 : -1;
      const ranged = W && !W.melee;
      const handCh = ch === 'luap' && t === 'fists' ? 'luap' : ch === 'boss' ? 'boss' : '';
      if (ranged && !W.thrown) {
        const recoil = this.flash.has(p.i) && this.time - this.flash.get(p.i) < 0.06 ? 4 : 0;
        const gx = (t === 'pistol' ? PR - 4 : PR * 0.3) - recoil;
        this.drawGun(ctx, t, gx, 0, 1);
        if (recoil) {
          ctx.fillStyle = '#ffe27a';
          circle(ctx, gx + W.len + 10, 0, 8);
          ctx.fill();
        }
      }
      circle(ctx, 0, 0, PR);
      fillStroke(ctx, skin, 5);
      this.drawOutfit(ctx, ch, PR);
      this.drawHeadgear(ctx, ch, PR);
      if (p.hit) {
        circle(ctx, 0, 0, PR - 2);
        ctx.fillStyle = 'rgba(255,60,50,0.45)';
        ctx.fill();
      }
      if (p.fx & 2) {
        circle(ctx, 0, 0, PR);
        ctx.fillStyle = 'rgba(150,220,255,0.45)';
        ctx.fill();
      }
      if (ranged && !W.thrown) {
        if (t === 'pistol') {
          this.hand(ctx, PR + 2, 7, skin, handCh);
          this.hand(ctx, PR + 2, -7, skin, handCh);
        } else {
          this.hand(ctx, PR * 0.85, 6, skin, handCh);
          this.hand(ctx, PR * 0.3 + W.len * 0.6, -3, skin, handCh);
        }
      } else if (t === 'chopsticks' || t === 'bowl') {
        const throwP = this.flash.has(p.i) && this.time - this.flash.get(p.i) < 0.12 ? 10 : 0;
        this.hand(ctx, PR * 0.7, -PR * 0.65, skin);
        ctx.save();
        ctx.translate(PR * 1.0 + throwP, PR * 0.55);
        if (t === 'chopsticks') this.drawChopsticks(ctx, 6, 0, 1);
        else this.drawBowl(ctx, 4, 0, 1, 0);
        ctx.restore();
        this.hand(ctx, PR * 0.85 + throwP, PR * 0.55, skin);
      } else if (W && W.melee && t !== 'fists') {
        ctx.save();
        ctx.rotate(-0.4 - prog * 1.4);
        this.drawMelee(ctx, t, PR * 0.9, PR * 0.55, 1);
        this.hand(ctx, PR * 0.85, PR * 0.55, skin);
        ctx.restore();
        this.hand(ctx, PR * 0.7, -PR * 0.65, skin);
      } else {
        const ext = prog * PR * 0.8;
        this.hand(ctx, PR * 0.72 + (side > 0 ? ext : 0), PR * 0.65 - (side > 0 ? prog * 10 : 0), skin, handCh);
        this.hand(ctx, PR * 0.72 + (side < 0 ? ext : 0), -PR * 0.65 + (side < 0 ? prog * 10 : 0), skin, handCh);
      }
      if (p.inj) {
        ctx.save();
        ctx.translate(PR * 1.0, 0);
        ctx.rotate(Math.PI / 2);
        this.drawItemIcon(ctx, 'soup', 0, 0, 0.6);
        ctx.restore();
      }
      ctx.restore();
      if (p.inj) {
        ctx.strokeStyle = 'rgba(90,220,110,0.9)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -this.time * 30;
        circle(ctx, p.x, p.y, R + 10);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if ((p.fx & 1) && Math.random() < 0.5) {
        this.particles.push({ x: p.x + (Math.random() - 0.5) * R, y: p.y + (Math.random() - 0.5) * R, vx: 0, vy: -40, life: 0.4, max: 0.4, size: 7, color: Math.random() < 0.5 ? '#ff8a2a' : '#ffd04a', kind: 0, rot: 0, vr: 0 });
      }
    }

    drawTurret(ctx, t) {
      ctx.save();
      ctx.translate(t.x, t.y);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * TAU + 0.5;
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 22, Math.sin(a) * 22);
        ctx.stroke();
      }
      circle(ctx, 0, 0, 14);
      fillStroke(ctx, '#7a8794', 4);
      ctx.rotate(t.a);
      roundRect(ctx, 4, -5, 26, 10, 3);
      fillStroke(ctx, '#3f4a55', 3);
      circle(ctx, 0, 0, 6);
      ctx.fillStyle = Math.floor(this.time * 4) % 2 ? '#7fd3ff' : '#ffffff';
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(t.x, t.y, 20, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(t.lf / 10, 0, 1));
      ctx.strokeStyle = 'rgba(127,211,255,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    drawVehicle(ctx, v, plMap) {
      const V = D.VEHICLES[v.t];
      const drv = v.d ? plMap.get(v.d) : null;
      const L = V.len;
      const Wd = V.wid;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.a);
      ctx.lineJoin = 'round';
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      roundRect(ctx, -L / 2 + 5, -Wd / 2 + 7, L, Wd, 14);
      ctx.fill();
      if (v.t === 'car') {
        for (const sxx of [-1, 1]) {
          for (const syy of [-1, 1]) {
            roundRect(ctx, sxx * L * 0.3 - 14, syy * (Wd / 2) - 8, 28, 16, 5);
            fillStroke(ctx, '#333333', 4);
          }
        }
        const col = CAR_COL[v.c % CAR_COL.length];
        roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 16);
        fillStroke(ctx, col, 5);
        roundRect(ctx, -L * 0.45, -Wd / 2 + 6, L * 0.5, Wd - 12, 8);
        fillStroke(ctx, '#f4f1e8', 4);
        ctx.fillStyle = col;
        ctx.font = 'bold 18px ' + FONT;
        ctx.textAlign = 'center';
        ctx.save();
        ctx.translate(-L * 0.2, 0);
        ctx.rotate(Math.PI / 2);
        ctx.fillText('允望樓', 0, 6);
        ctx.restore();
        roundRect(ctx, L * 0.12, -Wd / 2 + 10, 12, Wd - 20, 4);
        fillStroke(ctx, '#bfe3f2', 3);
        circle(ctx, L / 2 - 8, -Wd / 2 + 12, 5);
        fillStroke(ctx, '#fff2a8', 2);
        circle(ctx, L / 2 - 8, Wd / 2 - 12, 5);
        fillStroke(ctx, '#fff2a8', 2);
        if (drv) {
          circle(ctx, L * 0.28, -Wd * 0.16, 14);
          fillStroke(ctx, this.skinOf(drv.ch), 4);
        }
      } else {
        roundRect(ctx, L * 0.36 - 13, -7, 26, 14, 6);
        fillStroke(ctx, '#333333', 4);
        roundRect(ctx, -L * 0.36 - 13, -7, 26, 14, 6);
        fillStroke(ctx, '#333333', 4);
        const col = BIKE_COL[v.c % BIKE_COL.length];
        roundRect(ctx, -L * 0.3, -9, L * 0.6, 18, 7);
        fillStroke(ctx, col, 4);
        roundRect(ctx, -L * 0.5, -14, 20, 28, 4);
        fillStroke(ctx, '#f0c043', 3);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(L * 0.24, -18);
        ctx.lineTo(L * 0.24, 18);
        ctx.stroke();
        if (drv) {
          const skin = this.skinOf(drv.ch);
          this.hand(ctx, L * 0.22, -16, skin);
          this.hand(ctx, L * 0.22, 16, skin);
          circle(ctx, -4, 0, PR * 0.9);
          fillStroke(ctx, skin, 5);
          ctx.save();
          ctx.translate(-4, 0);
          ctx.scale(0.9, 0.9);
          this.drawHeadgear(ctx, drv.ch, PR);
          ctx.restore();
        }
      }
      ctx.restore();
      if (v.hp < 0.4 && Math.random() < 0.25) {
        this.particles.push({ x: v.x + (Math.random() - 0.5) * 20, y: v.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 1.2, max: 1.2, size: 12 + Math.random() * 10, color: '#6b6b6b', kind: 3, rot: 0, vr: 0 });
      }
      if (v.hp < 0.999) this.bar(ctx, v.x, v.y - V.r - 18, 64, v.hp, v.hp > 0.5 ? '#8fd46f' : v.hp > 0.25 ? '#f0c043' : '#e0574a');
    }

    bar(ctx, x, y, w, f, col) {
      roundRect(ctx, x - w / 2 - 2, y - 2, w + 4, 10, 5);
      fillStroke(ctx, '#3a3a3a', 3);
      ctx.fillStyle = col;
      ctx.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 6);
    }

    drawBullets(ctx, bullets) {
      ctx.lineCap = 'round';
      for (const b of bullets) {
        if (b.w === 'chop') continue;
        const W = D.WEAPONS[b.w];
        if (b.w === 'chopsticks') {
          if (b.tr < 20) continue;
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.dy, b.dx));
          this.drawChopsticks(ctx, 0, 0, 1);
          ctx.restore();
          continue;
        }
        if (b.w === 'bowl') {
          this.drawBowl(ctx, b.x, b.y, 1.2, this.time * 20);
          continue;
        }
        if (b.w === 'coin') {
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, 7, 7 * Math.abs(Math.sin(this.time * 18 + b.i)) + 1.5, 0, 0, TAU);
          fillStroke(ctx, '#f4c430', 2);
          continue;
        }
        if (b.w === 'harpoon') {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(Math.atan2(b.dy, b.dx));
          ctx.strokeStyle = '#d9c9a0';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-40, 0);
          ctx.lineTo(-Math.min(b.tr, 400), Math.sin(this.time * 20) * 4);
          ctx.stroke();
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 6;
          ctx.beginPath();
          ctx.moveTo(-44, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();
          ctx.strokeStyle = '#8d99a6';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(0, -8);
          ctx.lineTo(0, 8);
          ctx.closePath();
          fillStroke(ctx, '#d0d8de', 2.5);
          ctx.restore();
          continue;
        }
        const tail = Math.min(TRACER[b.w] || 60, b.tr - 34);
        if (tail <= 2) continue;
        const sx = b.x - b.dx * tail;
        const sy = b.y - b.dy * tail;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = 'rgba(43,42,40,0.55)';
        ctx.lineWidth = b.w === 'sniper' ? 8 : 6.5;
        ctx.stroke();
        ctx.strokeStyle = b.w === 'turret' ? '#7fd3ff' : W && W.proj === 'salt' ? '#ffffff' : '#ffdf5a';
        ctx.lineWidth = b.w === 'sniper' ? 4.5 : 3.5;
        ctx.stroke();
      }
    }

    drawRings(ctx) {
      for (const r of this.rings) {
        const t = (this.time - r.t) / r.life;
        circle(ctx, r.x, r.y, r.r * (0.3 + t * 0.8));
        ctx.strokeStyle = r.col;
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 14 * (1 - t) + 2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    drawParticles(ctx, vis, top) {
      for (const p of this.particles) {
        if ((p.kind === 3 || p.kind === 5) !== top || !vis(p.x, p.y, p.size)) continue;
        const a = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        if (p.kind === 5) {
          ctx.globalAlpha = Math.min(1, a * 2);
          heart(ctx, p.x, p.y, p.size);
          ctx.fill();
          ctx.strokeStyle = OUT;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        } else if (p.kind === 3) {
          ctx.globalAlpha = a * 0.5;
          circle(ctx, p.x, p.y, p.size * (1.6 - a * 0.6));
          ctx.fill();
        } else if (p.kind === 1) {
          ctx.globalAlpha = Math.min(1, a * 1.5);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
        } else {
          ctx.globalAlpha = a;
          circle(ctx, p.x, p.y, p.size * (0.5 + a * 0.5));
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    drawExplosions(ctx) {
      for (const f of this.fx) {
        const t = (this.time - f.t) / 0.6;
        if (t < 0 || t > 1) continue;
        circle(ctx, f.x, f.y, f.r * (0.35 + t * 0.75));
        ctx.fillStyle = 'rgba(255,170,60,' + 0.8 * (1 - t) + ')';
        ctx.fill();
        circle(ctx, f.x, f.y, f.r * (0.2 + t * 0.4));
        ctx.fillStyle = 'rgba(255,245,200,' + (1 - t) + ')';
        ctx.fill();
      }
    }

    drawZone(ctx, zo, x0, y0, x1, y1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 100, y0 - 100, x1 - x0 + 200, y1 - y0 + 200);
      ctx.moveTo(zo.x + zo.r, zo.y);
      ctx.arc(zo.x, zo.y, Math.max(0, zo.r), 0, TAU, true);
      ctx.fillStyle = 'rgba(255,110,40,0.3)';
      ctx.fill('evenodd');
      circle(ctx, zo.x, zo.y, zo.r);
      ctx.strokeStyle = '#7fd3ff';
      ctx.lineWidth = 10;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 30]);
      ctx.lineDashOffset = -this.time * 20;
      ctx.stroke();
      ctx.setLineDash([]);
      if (zo.tr < zo.r - 5) {
        circle(ctx, zo.x, zo.y, zo.tr);
        ctx.strokeStyle = 'rgba(127,211,255,0.7)';
        ctx.lineWidth = 3 / this.zoom;
        ctx.setLineDash([18 / this.zoom, 14 / this.zoom]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    outlinedText(ctx, s, x, y, size, color, align, lw) {
      ctx.font = 'bold ' + size + 'px ' + FONT;
      ctx.textAlign = align || 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw || Math.max(3, size * 0.28);
      ctx.strokeStyle = OUT;
      ctx.strokeText(s, x, y);
      ctx.fillStyle = color || '#fff';
      ctx.fillText(s, x, y);
    }

    drawTags(ctx, view, camInside) {
      for (const p of view.pl) {
        if (p.d || p.veh || p.i === view.you) continue;
        if (p.bu && p.i !== view.cam) continue;
        const b = this.buildingAt(p.x, p.y);
        if (b && b !== camInside) continue;
        const R = p.r || PR;
        const ally = this.myTeam !== 0 && p.tm === this.myTeam;
        const foe = view.mode === 'story' ? p.tm === 2 : this.myTeam !== 0 && p.tm !== 0 && p.tm !== this.myTeam;
        if (p.hp >= 0 && (foe || ally) && (p.hp < 1 || p.ch === 'boss' || ally)) this.bar(ctx, p.x, p.y + R + 10, R * 2.2, p.hp, foe ? '#e8453b' : '#7ad35e');
        const enemyCol = this.tmode === 'teams' ? (p.tm === 1 ? '#ffa294' : '#a8cfff') : '#ffffff';
        if (p.hu || ally) this.outlinedText(ctx, (p.lv ? 'Lv' + p.lv + ' ' : '') + nameOf(p), p.x, p.y - R - 14, Math.max(16, 11 / (this.zoom || 1)), ally ? '#b8f5a0' : enemyCol);
        if (p.qz && p.hu) this.outlinedText(ctx, I.t('quizSolving'), p.x, p.y - R - 34, Math.max(14, 10 / (this.zoom || 1)), '#ffe27a');
      }
    }

    drawDamageNumbers(ctx) {
      for (const d of this.dmgNums) {
        const t = (this.time - d.t) / 0.9;
        ctx.globalAlpha = 1 - t;
        this.outlinedText(ctx, String(d.n), d.x, d.y - t * 40, 22, d.c || '#ffe14d');
      }
      ctx.globalAlpha = 1;
    }

    // ---------- aiming ----------

    // How far a shot from (x, y) at angle a travels before a bullet-stopping obstacle, up to range.
    rayLength(x, y, a, range) {
      const SIM = globalThis.PF_SIM;
      const x1 = x + Math.cos(a) * range;
      const y1 = y + Math.sin(a) * range;
      const minx = Math.min(x, x1) - 80;
      const maxx = Math.max(x, x1) + 80;
      const miny = Math.min(y, y1) - 80;
      const maxy = Math.max(y, y1) + 80;
      let best = 1;
      for (const o of this.map.obstacles) {
        if (o.dead || o.x < minx || o.x > maxx || o.y < miny || o.y > maxy) continue;
        const def = D.OBST[o.k];
        if (!def || !def.blk) continue;
        const t = o.s === 'c' ? SIM.segCircle(x, y, x1, y1, o.x, o.y, o.r) : SIM.segRect(x, y, x1, y1, o.x - o.hw, o.y - o.hh, o.x + o.hw, o.y + o.hh);
        if (t >= 0 && t < best) best = t;
      }
      return best * range;
    }

    // The on-ground aim guide: where the attack or skill will go, cut short by walls. White for attacks,
    // yellow for skills, purple during Wok Overdrive, grey when a drag has been pulled back to cancel.
    drawAimGuide(ctx, view, g) {
      const me = view.me;
      const mp = view.pl.find(p => p.i === view.you);
      const x = mp ? mp.x : me.x;
      const y = mp ? mp.y : me.y;
      const a = g.a;
      const R = PR;
      const od = me.odT > 0;
      const base = g.cancel ? '150,150,150' : g.mode === 'skill' ? (od ? '190,120,255' : '255,215,94') : '255,255,255';
      const fill = 'rgba(' + base + ',' + (g.mode === 'skill' || g.strong ? 0.34 : 0.22) + ')';
      const edge = 'rgba(' + base + ',' + (g.mode === 'skill' || g.strong ? 0.9 : 0.6) + ')';
      const band = (len, half, from) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        roundRect(ctx, from, -half, Math.max(0, len - from), half * 2, half);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      };
      const cone = (len, half) => {
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * R, y + Math.sin(a) * R);
        ctx.arc(x, y, len, a - half, a + half);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2;
        ctx.stroke();
      };
      const ring = (cx, cy, r) => {
        circle(ctx, cx, cy, r);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([12, 8]);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      ctx.save();
      if (g.mode === 'attack') {
        const sl = me.sl[me.act];
        const t = sl ? sl.t : 'fists';
        const W = D.WEAPONS[t];
        if (W.melee) {
          cone(R + W.range + 10, W.arc);
        } else {
          const len = this.rayLength(x, y, a, W.range);
          if (W.pellets > 1) cone(len, ((W.spread || 8) * Math.PI) / 180);
          else band(len, t === 'sniper' ? 4 : 8, R);
          circle(ctx, x + Math.cos(a) * len, y + Math.sin(a) * len, 5);
          ctx.fillStyle = edge;
          ctx.fill();
        }
      } else {
        const sk = me.sk;
        const pk = me.pk;
        if (sk === 'flame') ring(x, y, 165 * (pk === 'fierce' ? 1.3 : 1) * (od ? 1.4 : 1));
        else if (sk === 'freeze') ring(x, y, 190 * (od ? 1.4 : 1));
        else if (sk === 'bubble') ring(x, y, 220 * (pk === 'wide' ? 1.5 : 1));
        else if (sk === 'boba') ring(x, y, od ? 260 : R + 14);
        else if (sk === 'rush') band(this.rayLength(x, y, a, 3.2 * D.SPEED * 0.38 * (od ? 1.4 : 1) + R), R, 0);
        else if (sk === 'coins') cone(this.rayLength(x, y, a, D.WEAPONS.coin.range), (od ? 1.2 : 0.9) / 2);
        else if (sk === 'turret') {
          const n = od ? 3 : pk === 'twin' ? 2 : 1;
          for (let k = 0; k < n; k++) {
            const ta = a + (k - (n - 1) / 2) * 0.7;
            ring(x + Math.cos(ta) * (R + 30), y + Math.sin(ta) * (R + 30), 18);
          }
        } else if (sk === 'parcel') {
          const n = od ? 3 : 1;
          const want = clamp(g.ad || 380, 80, 420);
          for (let k = 0; k < n; k++) {
            const pa = a + (k - (n - 1) / 2) * 0.32;
            const px = x + Math.cos(pa) * want;
            const py = y + Math.sin(pa) * want;
            ctx.strokeStyle = edge;
            ctx.lineWidth = 3;
            ctx.setLineDash([6, 10]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(px, py);
            ctx.stroke();
            ctx.setLineDash([]);
            ring(px, py, 140 * (pk === 'bigbox' ? 1.35 : 1));
          }
        }
      }
      ctx.restore();
    }

    // ---------- semi-3D view ----------

    // The camera looks down at an angle: north-south ground distances shrink by TILT, and anything with
    // height rises straight up the screen from the spot it stands on. Raised things are drawn back to front.
    // In "upright" space a ground point (x, y) sits at (x, y * TILT) and height goes up the screen.

    viewOffsetY() {
      return this.mode3d ? this.H * 0.04 : 0;
    }

    // World aim angle for a screen point, from the player's feet at the centre of the view.
    aimAt(sx, sy) {
      if (!this.mode3d) return Math.atan2(sy - this.H / 2, sx - this.W / 2);
      return Math.atan2((sy - (this.H / 2 + this.viewOffsetY())) / TILT, sx - this.W / 2);
    }

    // World ground area on screen, for comparing the two views.
    visibleArea() {
      const z = this.zoom || 1;
      return (this.W / z) * (this.H / (z * (this.mode3d ? TILT : 1)));
    }

    // Screen point for a world ground point, in the current view (the inverse of aimAt and aimDist).
    worldToScreen(x, y) {
      const z = this.zoom || 1;
      if (!this.mode3d) return [this.W / 2 + (x - this.camX) * z, this.H / 2 + (y - this.camY) * z];
      return [this.W / 2 + (x - this.camX) * z, this.H / 2 + this.viewOffsetY() + (y - this.camY) * z * TILT];
    }

    // World distance from the player's feet to a screen point.
    aimDist(sx, sy) {
      const z = this.zoom || 1;
      const dx = (sx - this.W / 2) / z;
      const dy = this.mode3d ? (sy - (this.H / 2 + this.viewOffsetY())) / (z * TILT) : (sy - this.H / 2) / z;
      return Math.hypot(dx, dy);
    }

    // World direction for a drag on screen (touch aim stick).
    screenDir(dx, dy) {
      return Math.atan2(this.mode3d ? dy / TILT : dy, dx);
    }

    roofHeight(b) {
      if (b.type === 'restaurant') return 84;
      if (b.type === 'stall') return 50;
      return b.weak ? 62 : 70;
    }

    // Draws fn's top-down art on a flat plane lifted h above the ground (current transform: upright).
    plane3D(ctx, h, fn) {
      ctx.save();
      ctx.translate(0, -h);
      ctx.scale(1, TILT);
      fn();
      ctx.restore();
    }

    // Draws fn's art (made for flat world coordinates) standing at its ground spot, unsquashed.
    stand3D(ctx, y, lift, fn) {
      ctx.save();
      ctx.translate(0, y * TILT - y - lift);
      fn();
      ctx.restore();
    }

    // A box on a rectangular footprint: darker front face, lit top.
    prism3D(ctx, o, h, top, front, alpha, planks) {
      const fy = (o.y + o.hh) * TILT;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.rect(o.x - o.hw, fy - h, o.hw * 2, h);
      fillStroke(ctx, front, 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (planks) {
        for (let xx = o.x - o.hw + 16; xx < o.x + o.hw - 4; xx += 16) {
          ctx.moveTo(xx, fy - h + 2);
          ctx.lineTo(xx, fy - 2);
        }
      } else {
        ctx.moveTo(o.x - o.hw + 3, fy - h * 0.5);
        ctx.lineTo(o.x + o.hw - 3, fy - h * 0.5);
      }
      ctx.stroke();
      if (planks && o.mhp && o.hp < o.mhp * 0.7) {
        ctx.strokeStyle = '#2b1a0e';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const cracks = o.hp < o.mhp * 0.35 ? 4 : 2;
        for (let i = 0; i < cracks; i++) {
          const cx = o.x - o.hw + 10 + rnd(o.id * 7 + 1, i) * (o.hw * 2 - 20);
          ctx.moveTo(cx - 6, fy - h + 6);
          ctx.lineTo(cx + 4, fy - h * 0.5);
          ctx.lineTo(cx - 3, fy - 6);
        }
        ctx.stroke();
      }
      this.plane3D(ctx, h, () => {
        ctx.beginPath();
        ctx.rect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
        fillStroke(ctx, top, 3);
      });
      ctx.restore();
    }

    // Stacks a flat silhouette from the ground up to h for solid-looking irregular shapes.
    extrude3D(ctx, h, path, col) {
      const steps = Math.max(2, Math.round(h / 5));
      for (let i = 0; i < steps; i++) {
        this.plane3D(ctx, (h * i) / steps, () => {
          path();
          ctx.fillStyle = col;
          ctx.fill();
          if (i === 0) {
            ctx.strokeStyle = OUT;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        });
      }
    }

    // True when the watched player stands just behind (north of) something tall, so it should fade.
    hides3D(x, y, halfW, frontY, h, cx, cy) {
      return cy < frontY && cy > frontY - h / TILT - 60 && Math.abs(cx - x) < halfW + 30;
    }

    draw3DObstacle(ctx, o, cx, cy) {
      const T = TILT;
      if (o.k === 'wall' || o.k === 'plank') {
        const b = o.b >= 0 ? this.map.buildings[o.b] : null;
        const h = b ? this.roofHeight(b) : 60;
        const rest = b && b.type === 'restaurant';
        const top = o.k === 'plank' ? '#c0915e' : rest ? '#b04437' : '#a8917a';
        const front = o.k === 'plank' ? '#a87a4a' : rest ? '#7a231d' : '#6e5a48';
        const fade = this.hides3D(o.x, o.y, o.hw, o.y + o.hh, h, cx, cy) ? 0.45 : 1;
        this.prism3D(ctx, o, h, top, front, fade, o.k === 'plank');
      } else if (o.k === 'crate') {
        const k = o.mhp ? 0.72 + 0.28 * clamp(o.hp / o.mhp, 0, 1) : 1;
        const q = { x: o.x, y: o.y, hw: o.hw * k, hh: o.hh * k, id: o.id };
        const h = q.hw * 1.5;
        this.prism3D(ctx, q, h, '#d49a4a', '#a8732f', 1, true);
        this.plane3D(ctx, h, () => {
          ctx.strokeStyle = '#a8732f';
          ctx.lineWidth = 4;
          ctx.strokeRect(q.x - q.hw + 7, q.y - q.hh + 7, q.hw * 2 - 14, q.hh * 2 - 14);
        });
        this.outlinedText(ctx, '?', q.x, (q.y + q.hh) * T - h * 0.25, Math.round(q.hw * 0.9), '#fff1c9');
      } else if (o.k === 'container') {
        const col = CONTAINER_COL[o.v % CONTAINER_COL.length];
        const h = 74;
        const fade = this.hides3D(o.x, o.y, o.hw, o.y + o.hh, h, cx, cy) ? 0.45 : 1;
        this.prism3D(ctx, o, h, shade(col, 0.12), shade(col, -0.22), fade, true);
      } else if (o.k === 'stove') {
        this.prism3D(ctx, o, 34, '#55595c', '#3a3d40', 1, false);
        this.plane3D(ctx, 34, () => this.drawStove(ctx, o));
      } else if (o.k === 'table') {
        ctx.fillStyle = '#5a3d22';
        ctx.fillRect(o.x - 5, o.y * T - 24, 10, 24);
        this.plane3D(ctx, 24, () => this.drawTable(ctx, o));
      } else if (o.k === 'rock') {
        const h = o.r * 0.8;
        const pts = this.rockShape(o);
        this.extrude3D(ctx, h, () => this.poly(ctx, pts, o.x, o.y, o.r), '#7f868b');
        this.plane3D(ctx, h, () => this.drawRock(ctx, o));
      } else if (o.k === 'tree') {
        const trunk = 44;
        const cr = o.r * 1.3;
        const fade = Math.hypot(cx - o.x, cy - o.y) < cr * 1.5 && cy < o.y + o.r ? 0.45 : 1;
        ctx.beginPath();
        ctx.rect(o.x - 8, o.y * T - trunk, 16, trunk);
        fillStroke(ctx, '#6b4a2b', 3);
        this.drawCanopy(ctx, { x: o.x, y: o.y * T - trunk - cr * 0.55, r: cr / CANOPY, v: o.v }, fade);
      } else if (o.k === 'bamboo') {
        const fade = Math.hypot(cx - o.x, cy - o.y) < 70 && cy < o.y + 20 ? 0.45 : 1;
        ctx.save();
        ctx.globalAlpha = fade;
        for (let i = 0; i < 3; i++) {
          const bx = o.x + (i - 1) * 7;
          const bh = 84 + rnd(o.v, i) * 18;
          ctx.beginPath();
          ctx.rect(bx - 3, o.y * T - bh, 6, bh);
          fillStroke(ctx, '#7fb24a', 2);
          ctx.fillStyle = '#5d8f33';
          for (let yy = 20; yy < bh; yy += 22) ctx.fillRect(bx - 3, o.y * T - yy, 6, 2);
        }
        ctx.restore();
        this.drawBambooLeaves(ctx, { x: o.x, y: o.y * T - 92, v: o.v }, fade);
      } else if (o.k === 'bush') {
        const inside = Math.hypot(cx - o.x, cy - o.y) < o.r + PR * 0.5;
        this.plane3D(ctx, 6, () => this.drawBush(ctx, { x: o.x, y: o.y + 4, r: o.r, v: o.v + 1 }, inside ? 0.5 : 0.95));
        this.plane3D(ctx, 26, () => this.drawBush(ctx, o, inside ? 0.5 : 1));
      } else if (o.k === 'lantern') {
        ctx.beginPath();
        ctx.rect(o.x - 3, o.y * T - 58, 6, 58);
        fillStroke(ctx, '#5a3a22', 2);
        this.stand3D(ctx, o.y, 46, () => this.drawLanternTop(ctx, o));
      } else if (o.k === 'board') {
        for (const sx of [-1, 1]) {
          ctx.beginPath();
          ctx.rect(o.x + sx * (o.hw - 8) - 3, o.y * T - 36, 6, 36);
          fillStroke(ctx, '#5a3a22', 2);
        }
        this.stand3D(ctx, o.y, -6, () => this.drawBoardTop(ctx, o));
      }
    }

    // A standing character: shadow, legs, the portrait bust, weapon held at the aimed angle, effects.
    drawFigure3D(ctx, p, aim, view) {
      const T = TILT;
      const R = p.r || PR;
      const ch = p.ch;
      const u = R / PR;
      const lift = (p.jz || 0) * 34;
      const gx = p.x;
      const gy = p.y * T;
      if (!this.walk) this.walk = new Map();
      let w = this.walk.get(p.i);
      if (!w) {
        w = { x: p.x, y: p.y, ph: 0, sp: 0 };
        this.walk.set(p.i, w);
      }
      const moved = Math.hypot(p.x - w.x, p.y - w.y);
      if (moved < 60) {
        w.ph += moved * 0.11;
        w.sp = w.sp * 0.8 + moved * 0.2;
      }
      w.x = p.x;
      w.y = p.y;
      const walking = w.sp > 0.6;
      const face = Math.cos(aim) < 0 ? -1 : 1;
      const legH = 22 * u;
      const hip = gy - lift - legH;
      const k = 0.56 * u;
      const sa = Math.atan2(Math.sin(aim) * T, Math.cos(aim));
      if ((this.tmode === 'teams' && p.tm) || (this.tmode === 'coop' && p.tm === 1)) {
        ctx.beginPath();
        ctx.ellipse(gx, gy, R + 6, (R + 6) * T, 0, 0, TAU);
        ctx.strokeStyle = this.tmode === 'coop' ? 'rgba(120,220,110,0.9)' : p.tm === 1 ? 'rgba(230,70,60,0.95)' : 'rgba(70,140,240,0.95)';
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      if (p.fx & 2) {
        ctx.beginPath();
        ctx.ellipse(gx, gy, R + 2, (R + 2) * T, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(127,211,255,0.9)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      const legCol = PANTS[ch] || '#333333';
      for (const side of [-1, 1]) {
        const swing = walking ? Math.sin(w.ph + (side > 0 ? 0 : Math.PI)) * 5 * u : 0;
        roundRect(ctx, gx + side * 8 * u - 6 * u + swing * face * 0.4, hip - 2, 12 * u, legH + 2 - Math.max(0, -swing) * 0.4, 4.5 * u);
        fillStroke(ctx, legCol, 2.5);
      }
      const weaponFirst = Math.sin(aim) < -0.3;
      const drawWeapon = () => this.figureWeapon(ctx, p, face, gx + face * 17 * u, hip - 31 * u, sa, u * 1.3);
      if (weaponFirst) drawWeapon();
      if (p.bp) {
        roundRect(ctx, gx - face * 23 * u - 12 * u, hip - 52 * u, 24 * u, 31 * u, 6);
        fillStroke(ctx, '#f0c043', 3);
      }
      ctx.save();
      ctx.translate(gx, hip - 52 * k + 6 * u);
      ctx.scale(k * face, k);
      this.drawBust(ctx, ch);
      ctx.restore();
      if (p.hit) {
        circle(ctx, gx, hip - 48 * k, 36 * k);
        ctx.fillStyle = 'rgba(255,70,50,0.35)';
        ctx.fill();
      }
      if (!weaponFirst) drawWeapon();
      this.drawAuras(ctx, p, gx, hip - 34 * u, R * 1.3);
      if (p.sh) {
        circle(ctx, gx, hip - 34 * u, R * 1.3 + 16);
        ctx.fillStyle = 'rgba(160,230,255,0.18)';
        ctx.fill();
      }
      if (p.inj) this.drawItemIcon(ctx, 'soup', gx, hip - 106 * u, 0.9);
      if ((p.fx & 1) && Math.random() < 0.5) this.addParticles(p.x + (Math.random() - 0.5) * R, p.y, 1, Math.random() < 0.5 ? '#ff8a2a' : '#ffd36b', 40, 0.5, 6, 3);
      if (p.rs) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 4;
        for (const off of [-12, 0, 12]) {
          ctx.beginPath();
          ctx.moveTo(gx - Math.cos(sa) * (R + 6), hip - 34 * u + off - Math.sin(sa) * (R + 6));
          ctx.lineTo(gx - Math.cos(sa) * (R + 50), hip - 34 * u + off - Math.sin(sa) * (R + 50));
          ctx.stroke();
        }
      }
    }

    figureHeight(p) {
      return 98 * ((p.r || PR) / PR) + (p.jz || 0) * 34;
    }

    // The held weapon, drawn with the existing side-on art, rotated to the on-screen aim angle.
    figureWeapon(ctx, p, face, hx, hy, sa, u) {
      const t = p.w;
      const W = D.WEAPONS[t];
      const skin = this.skinOf(p.ch);
      const sw = p.sw || 0;
      const prog = sw ? Math.sin((1 - Math.abs(sw)) * Math.PI) : 0;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(sa + (W && W.melee ? -prog * 1.2 * face : 0));
      if (Math.cos(sa) < 0) ctx.scale(1, -1);
      const sc = 0.75 * u;
      if (W && !W.melee && !W.thrown && t !== 'turret') {
        const recoil = this.flash.has(p.i) && this.time - this.flash.get(p.i) < 0.06 ? 3 : 0;
        this.drawGun(ctx, t, -4 - recoil, 0, sc);
      } else if (t === 'chopsticks') {
        this.drawChopsticks(ctx, 4, 0, sc);
      } else if (t === 'bowl') {
        this.drawBowl(ctx, 6, 0, sc, 0);
      } else if (W && W.melee && t !== 'fists') {
        this.drawMelee(ctx, t, 2, 0, sc);
      } else {
        const punch = prog * 10;
        circle(ctx, 6 + punch, 0, 6.5 * u);
        fillStroke(ctx, p.ch === 'luap' ? '#d63a32' : skin, 2.5);
      }
      circle(ctx, 0, 0, 5 * u);
      fillStroke(ctx, skin, 2.5);
      ctx.restore();
    }

    drawVehicle3D(ctx, v, plMap) {
      const V = D.VEHICLES[v.t];
      const h = v.t === 'car' ? 30 : 20;
      const L = V.len;
      const Wd = V.wid;
      this.extrude3D(ctx, h, () => {
        ctx.save();
        ctx.translate(v.x, v.y);
        ctx.rotate(v.a);
        roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 12);
        ctx.restore();
      }, '#2f2f33');
      this.plane3D(ctx, h, () => this.drawVehicle(ctx, v, plMap));
    }

    drawTags3D(ctx, view, hidden) {
      const T = TILT;
      for (const p of view.pl) {
        if (p.d || p.veh || p.i === view.you || hidden.has(p.i)) continue;
        const R = p.r || PR;
        const ally = this.myTeam !== 0 && p.tm === this.myTeam;
        const foe = view.mode === 'story' ? p.tm === 2 : this.myTeam !== 0 && p.tm !== 0 && p.tm !== this.myTeam;
        const top = p.y * T - this.figureHeight(p);
        if (p.hp >= 0 && (foe || ally) && (p.hp < 1 || p.ch === 'boss' || ally)) this.bar(ctx, p.x, top - 8, R * 2.2, p.hp, foe ? '#e8453b' : '#7ad35e');
        const enemyCol = this.tmode === 'teams' ? (p.tm === 1 ? '#ffa294' : '#a8cfff') : '#ffffff';
        if (p.hu || ally) this.outlinedText(ctx, (p.lv ? 'Lv' + p.lv + ' ' : '') + nameOf(p), p.x, top - 16, Math.max(15, 11 / (this.zoom || 1)), ally ? '#b8f5a0' : enemyCol);
        if (p.qz && p.hu) this.outlinedText(ctx, I.t('quizSolving'), p.x, top - 36, Math.max(14, 10 / (this.zoom || 1)), '#ffe27a');
      }
    }

    draw3D(view, ui, dt) {
      this.time += dt;
      const ctx = this.ctx;
      const map = this.map;
      if (!map || !view) return;
      this.updateParticles(dt);
      const T = TILT;
      // Zoomed so the tilted view shows the same ground area as the flat view (no advantage either way)
      // and never more than the game sends.
      const target = this.computeZoom(view.cvm || (view.cveh ? 1.2 : 1)) / Math.sqrt(TILT);
      this.zoom = this.zoom ? lerp(this.zoom, target, Math.min(1, dt * 4)) : target;
      const z = this.zoom;
      this.camX = view.cx;
      this.camY = view.cy;
      this.myTeam = view.me.tm || 0;
      this.tmode = view.tmode || 'ffa';
      this.shake = Math.max(0, this.shake - dt * 40);
      const shx = (Math.random() - 0.5) * this.shake;
      const shy = (Math.random() - 0.5) * this.shake;
      const dpr = this.dpr;
      const W = this.W;
      const H = this.H;
      const offY = this.viewOffsetY();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#2f4a24';
      ctx.fillRect(0, 0, W, H);
      const ox = dpr * (W / 2 - this.camX * z + shx);
      const oy = dpr * (H / 2 + offY - this.camY * T * z + shy);
      const ground = () => ctx.setTransform(dpr * z, 0, 0, dpr * z * T, ox, oy);
      const upright = () => ctx.setTransform(dpr * z, 0, 0, dpr * z, ox, oy);
      const x0 = this.camX - W / z / 2 - 100;
      const x1 = this.camX + W / z / 2 + 100;
      const y0 = this.camY - (H / 2 + offY) / (z * T) - 60;
      const y1 = this.camY + (H / 2 - offY) / (z * T) + 200;
      const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
      this.vis = vis;

      ground();
      ctx.fillStyle = this.groundPattern;
      ctx.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(map.size, x1) - Math.max(0, x0), Math.min(map.size, y1) - Math.max(0, y0));
      ctx.strokeStyle = 'rgba(40,60,25,0.6)';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, map.size, map.size);
      this.drawYard(ctx, map.yard, vis);
      this.drawRoads(ctx);
      this.drawPlaza(ctx, map.plaza, vis);
      const camP = view.pl.find(p => p.i === view.cam);
      const cx = camP ? camP.x : this.camX;
      const cy = camP ? camP.y : this.camY;
      const camInside = this.buildingAt(cx, cy);
      for (const b of map.buildings) {
        if (vis(b.x, b.y, Math.max(b.w, b.h))) this.drawFloor(ctx, b);
      }
      for (const sc of map.secrets || []) {
        if (vis(sc.x, sc.y, 40)) this.drawSecretSpot(ctx, sc);
      }
      const extras = view.sx || [];
      for (const q of extras) {
        if (q.k === 'gold' && vis(q.x, q.y, 40)) this.drawGold(ctx, q);
        else if (q.k === 'plane') this.drawPlane(ctx, q, true);
      }
      for (const it of view.it) {
        if (vis(it.x, it.y, 40)) this.drawGroundItem(ctx, it);
      }
      for (const m of view.mi || []) this.drawMine(ctx, m, m.o === view.you || (this.myTeam && m.tm === this.myTeam));
      for (const p of view.pl) {
        if (p.d) this.drawBody(ctx, p);
      }
      // Soft shadows, lit from the upper left.
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      for (const o of map.obstacles) {
        if (o.dead || (o.k !== 'tree' && o.k !== 'bamboo') || !vis(o.x, o.y, 80)) continue;
        circle(ctx, o.x + 14, o.y + 10, o.k === 'tree' ? o.r * 1.15 : 30);
        ctx.fill();
      }
      for (const p of view.pl) {
        if (p.d || p.veh) continue;
        const sh = Math.max(0.4, 1 - (p.jz || 0) * 0.5);
        ctx.beginPath();
        ctx.ellipse(p.x + 3, p.y + 3, (p.r || PR) * 1.15 * sh, (p.r || PR) * 1.15 * sh, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill();
      }
      for (const v of view.ve) {
        if (!vis(v.x, v.y, 90)) continue;
        ctx.save();
        ctx.translate(v.x + 10, v.y + 12);
        ctx.rotate(v.a);
        roundRect(ctx, -D.VEHICLES[v.t].len / 2, -D.VEHICLES[v.t].wid / 2, D.VEHICLES[v.t].len, D.VEHICLES[v.t].wid, 12);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();
        ctx.restore();
      }
      for (const b of view.bo || []) {
        ctx.beginPath();
        ctx.ellipse(b.x, b.y, 14, 14, 0, 0, TAU);
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fill();
      }
      if (view.zo.on) this.drawZone(ctx, view.zo, x0, y0, x1, y1);
      this.drawRings(ctx);
      this.drawExplosions(ctx);
      this.drawParticles(ctx, vis, false);
      if (ui.guide) this.drawAimGuide(ctx, view, ui.guide);

      upright();
      const list = [];
      const add = (k, f) => list.push({ k, f });
      for (const o of map.obstacles) {
        if (o.dead) continue;
        const ext = o.k === 'tree' ? o.r * 1.6 : o.s === 'c' ? o.r : Math.max(o.hw, o.hh);
        if (!vis(o.x, o.y, ext + 40)) continue;
        add(o.s === 'c' ? o.y + o.r * 0.4 : o.y + o.hh, () => this.draw3DObstacle(ctx, o, cx, cy));
      }
      for (const b of map.buildings) {
        if (!vis(b.x, b.y, Math.max(b.w, b.h))) continue;
        const tgt = camInside === b || b.broken ? 0 : 1;
        let a = this.roofAlpha.get(b.id);
        a = a == null ? tgt : lerp(a, tgt, Math.min(1, dt * 8));
        this.roofAlpha.set(b.id, a);
        if (a > 0.02) add(b.y + b.h / 2 + 1, () => this.plane3D(ctx, this.roofHeight(b), () => this.drawRoof(ctx, b, a)));
      }
      const plMap = new Map();
      for (const p of view.pl) plMap.set(p.i, p);
      // People hidden in a bush stay hidden, as in the flat view, unless they are you, a teammate, or close.
      const hidden = new Set();
      for (const p of view.pl) {
        if (p.d || p.veh) continue;
        if (p.bu && p.i !== view.you && !(this.myTeam && p.tm === this.myTeam) && Math.hypot(p.x - cx, p.y - cy) > 140) {
          hidden.add(p.i);
          continue;
        }
        const aim = p.i === view.you && ui.aim != null ? ui.aim : p.a;
        add(p.y + 0.5, () => {
          if (p.qz) ctx.globalAlpha = 0.45;
          this.drawFigure3D(ctx, p, aim, view);
          ctx.globalAlpha = 1;
        });
      }
      for (const v of view.ve) {
        if (vis(v.x, v.y, 90)) add(v.y + 8, () => this.drawVehicle3D(ctx, v, plMap));
      }
      for (const t of view.tu || []) {
        if (vis(t.x, t.y, 40)) add(t.y, () => {
          ctx.beginPath();
          ctx.rect(t.x - 10, t.y * T - 14, 20, 14);
          fillStroke(ctx, '#55606b', 2);
          this.plane3D(ctx, 14, () => this.drawTurret(ctx, t));
        });
      }
      for (const q of extras) {
        if (q.k === 'cat' && vis(q.x, q.y, 40)) add(q.y, () => this.plane3D(ctx, 4, () => this.drawCat(ctx, q)));
      }
      for (const b of view.bo || []) add(b.y, () => this.drawParcel(ctx, b.x, b.y * T - b.z - 12, 1.1));
      for (const it of view.it) {
        if (it.t === 'drop' && it.f > 0 && vis(it.x, it.y, 260)) add(it.y, () => this.stand3D(ctx, it.y, 0, () => this.drawFallingDrop(ctx, it)));
      }
      list.sort((a, b) => a.k - b.k);
      for (const d of list) d.f();
      this.plane3D(ctx, 26, () => this.drawBullets(ctx, view.bu));
      this.plane3D(ctx, 36, () => this.drawParticles(ctx, vis, true));
      for (const q of extras) {
        if (q.k === 'plane' && vis(q.x, q.y, 320)) this.plane3D(ctx, 300, () => this.drawPlane(ctx, q, false));
      }
      this.drawTags3D(ctx, view, hidden);
      for (const d of this.dmgNums) {
        const t = (this.time - d.t) / 0.9;
        ctx.globalAlpha = Math.max(0, 1 - t);
        this.outlinedText(ctx, String(d.n), d.x, (d.y + 34) * T - 92 - t * 40, 22, d.c || '#ffe14d');
      }
      ctx.globalAlpha = 1;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ui.noHud) this.drawHUD(ctx, view, ui);
    }

    // ---------- portraits (menu and dialogue) ----------

    // Front-facing cartoon portrait of a speaker drawn into a square of size s at (x, y).
    drawPortrait(ctx, who, x, y, s) {
      ctx.save();
      ctx.translate(x + s / 2, y + s * 0.56);
      const k = s / 150;
      ctx.scale(k, k);
      this.drawBust(ctx, who);
      ctx.restore();
    }

    // Front view of a character from the shoulders up, in 150-unit portrait space with the face at the origin.
    // Used for menu and dialogue portraits and for the standing figures in the 3D view.
    drawBust(ctx, who) {
      if (who === 'boss') who = 'captain';
      ctx.save();
      ctx.lineJoin = 'round';
      if (who === 'narrator') {
        roundRect(ctx, -44, -44, 88, 88, 12);
        fillStroke(ctx, '#b8322a', 5);
        roundRect(ctx, -36, -36, 72, 72, 8);
        ctx.strokeStyle = '#f6e6c8';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = '#f6e6c8';
        ctx.font = 'bold 30px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('允望', 0, -2);
        ctx.fillText('樓', 0, 30);
        ctx.restore();
        return;
      }
      const skin = who === 'captain' ? '#c79a7a' : this.skinOf(who);
      this.bustBack(ctx, who);
      if (who === 'luap') {
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 46, 28, 18);
          fillStroke(ctx, '#d63a32', 4);
        }
      }
      ctx.beginPath();
      ctx.ellipse(0, 52, 46, 26, 0, Math.PI, 0);
      ctx.closePath();
      const shirt = { yunwang: '#ffffff', luap: '#d63a32', auhsoj: '#5c6b7a', meibao: '#ff9cc6', captain: '#1f2f4f', afeng: '#2fa36b', bubbles: '#7fd0e8', jinjin: '#f4c430', bing: '#d9ecf7', thug: '#ffffff', elite: '#2a2f3a' }[who] || '#777';
      fillStroke(ctx, shirt, 4);
      this.bustShirt(ctx, who);
      if (PACK_COL[who]) {
        for (const sx of [-1, 1]) {
          roundRect(ctx, sx * 24 - 6, 30, 12, 34, 4);
          fillStroke(ctx, PACK_COL[who], 3);
        }
      }
      if (who === 'meibao') {
        circle(ctx, 0, -4, 40);
        fillStroke(ctx, '#3b2418', 4);
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 30, -38, 16);
          fillStroke(ctx, '#3b2418', 4);
          ctx.beginPath();
          ctx.ellipse(sx * 20, -46, 9, 5, sx * 0.5, 0, TAU);
          fillStroke(ctx, '#ff8fbf', 3);
        }
      }
      circle(ctx, 0, 4, 34);
      fillStroke(ctx, skin, 4);
      if (who === 'meibao') {
        ctx.beginPath();
        ctx.arc(0, -2, 34, Math.PI * 1.05, Math.PI * 1.95);
        ctx.quadraticCurveTo(0, -18, -32, -14);
        ctx.fillStyle = '#3b2418';
        ctx.fill();
      }
      ctx.fillStyle = OUT;
      for (const sx of [-1, 1]) {
        circle(ctx, sx * 12, 4, 4.5);
        ctx.fill();
      }
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 3;
      ctx.beginPath();
      if (who === 'captain') ctx.arc(0, 26, 10, Math.PI * 1.15, Math.PI * 1.85);
      else ctx.arc(0, 14, 10, 0.2, Math.PI - 0.2);
      ctx.stroke();
      if (who === 'meibao') {
        ctx.fillStyle = 'rgba(255,120,150,0.45)';
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 22, 16, 6);
          ctx.fill();
        }
      }
      if (who === 'yunwang') {
        ctx.beginPath();
        ctx.moveTo(-28, -18);
        ctx.lineTo(28, -18);
        ctx.lineTo(24, -36);
        ctx.lineTo(-24, -36);
        ctx.closePath();
        fillStroke(ctx, '#ffffff', 4);
        for (const [dx, dy, r] of [[-20, -50, 18], [0, -58, 21], [20, -50, 18]]) {
          circle(ctx, dx, dy, r);
          fillStroke(ctx, '#ffffff', 4);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-22, -42, 44, 12);
      } else if (who === 'luap') {
        ctx.fillStyle = '#d63a32';
        roundRect(ctx, -35, -20, 70, 12, 5);
        fillStroke(ctx, '#d63a32', 3);
      } else if (who === 'auhsoj') {
        ctx.beginPath();
        ctx.arc(0, -8, 36, Math.PI, 0);
        ctx.closePath();
        fillStroke(ctx, '#2f6fd6', 4);
        ctx.beginPath();
        ctx.ellipse(10, -10, 36, 9, 0, 0, Math.PI);
        fillStroke(ctx, '#2558b0', 4);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 3;
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 12, 4, 10);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(-2, 4);
        ctx.lineTo(2, 4);
        ctx.stroke();
      } else if (who === 'captain') {
        ctx.beginPath();
        ctx.moveTo(-34, 6);
        ctx.quadraticCurveTo(0, 62, 34, 6);
        ctx.quadraticCurveTo(0, 30, -34, 6);
        fillStroke(ctx, '#f4f4f4', 4);
        ctx.beginPath();
        ctx.moveTo(-42, -16);
        ctx.lineTo(42, -16);
        ctx.lineTo(34, -48);
        ctx.lineTo(-34, -48);
        ctx.closePath();
        fillStroke(ctx, '#1f2f4f', 4);
        roundRect(ctx, -44, -22, 88, 10, 4);
        fillStroke(ctx, '#1a2640', 3);
        ctx.strokeStyle = '#e2b84a';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(0, -44);
        ctx.lineTo(0, -26);
        ctx.moveTo(-7, -38);
        ctx.lineTo(7, -38);
        ctx.arc(0, -32, 7, 0.4, Math.PI - 0.4);
        ctx.stroke();
      }
      this.bustHat(ctx, who);
      ctx.restore();
    }

    // Pieces of the new characters' and the gang's busts: behind the body, on the shirt, on the head.
    bustBack(ctx, who) {
      if (who === 'afeng') {
        roundRect(ctx, -46, -24, 92, 74, 8);
        fillStroke(ctx, '#f2a33a', 4);
        ctx.fillStyle = '#c97f1f';
        ctx.fillRect(-46, -2, 92, 8);
      } else if (who === 'jinjin') {
        circle(ctx, 0, 0, 39);
        fillStroke(ctx, '#2b2018', 4);
      } else if (who === 'bubbles') {
        circle(ctx, 0, -2, 37);
        fillStroke(ctx, '#7a5434', 4);
      }
    }

    bustShirt(ctx, who) {
      if (who === 'thug') {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(0, 52, 44, 24, 0, Math.PI, 0);
        ctx.clip();
        ctx.fillStyle = '#2f4f8a';
        for (let yy = 30; yy < 56; yy += 10) ctx.fillRect(-50, yy, 100, 5);
        ctx.restore();
      } else if (who === 'bubbles') {
        roundRect(ctx, -20, 32, 40, 26, 5);
        fillStroke(ctx, '#ffffff', 3);
      } else if (who === 'bing') {
        roundRect(ctx, -32, 26, 64, 13, 6);
        fillStroke(ctx, '#3f78b5', 3);
      } else if (who === 'jinjin') {
        ctx.beginPath();
        ctx.moveTo(-12, 27);
        ctx.lineTo(0, 44);
        ctx.lineTo(12, 27);
        ctx.closePath();
        fillStroke(ctx, '#ffffff', 3);
      }
    }

    bustHat(ctx, who) {
      if (who === 'afeng') {
        ctx.beginPath();
        ctx.arc(0, -2, 38, Math.PI, 0);
        ctx.closePath();
        fillStroke(ctx, '#f2a33a', 4);
        roundRect(ctx, -30, -12, 60, 11, 5);
        fillStroke(ctx, '#2b4a6a', 3);
      } else if (who === 'bubbles') {
        ctx.fillStyle = '#7a5434';
        ctx.beginPath();
        ctx.arc(0, -2, 34, Math.PI * 1.05, Math.PI * 1.95);
        ctx.quadraticCurveTo(10, -14, -30, -12);
        ctx.fill();
        for (const [bx, by, br] of [[-18, -44, 11], [6, -52, 14], [26, -40, 9]]) {
          circle(ctx, bx, by, br);
          ctx.fillStyle = 'rgba(190,235,255,0.75)';
          ctx.fill();
          ctx.strokeStyle = '#4fa3c7';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          circle(ctx, bx - br * 0.35, by - br * 0.35, br * 0.25);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      } else if (who === 'jinjin') {
        ctx.fillStyle = '#2b2018';
        ctx.beginPath();
        ctx.arc(0, -2, 34, Math.PI * 1.02, Math.PI * 1.98);
        ctx.lineTo(30, -10);
        ctx.lineTo(-30, -10);
        ctx.fill();
        roundRect(ctx, -34, -24, 68, 9, 4);
        fillStroke(ctx, '#3aa067', 3);
        ctx.beginPath();
        ctx.ellipse(0, -16, 30, 9, 0, 0, Math.PI);
        fillStroke(ctx, 'rgba(58,160,103,0.85)', 3);
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 35, 18, 5);
          fillStroke(ctx, '#f4c430', 2);
        }
      } else if (who === 'bing') {
        for (const sx of [-1, 1]) {
          roundRect(ctx, sx * 36 - 9, -14, 18, 34, 8);
          fillStroke(ctx, '#f4f4f4', 3);
        }
        roundRect(ctx, -34, -52, 68, 34, 10);
        fillStroke(ctx, '#8a6a4a', 4);
        roundRect(ctx, -40, -26, 80, 15, 7);
        fillStroke(ctx, '#f4f4f4', 3);
        ctx.strokeStyle = '#f4f4f4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(-12, 20);
        ctx.quadraticCurveTo(-4, 26, 0, 20);
        ctx.quadraticCurveTo(4, 26, 12, 20);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,110,120,0.4)';
        for (const sx of [-1, 1]) {
          circle(ctx, sx * 22, 14, 6);
          ctx.fill();
        }
      } else if (who === 'thug') {
        roundRect(ctx, -35, -22, 70, 13, 5);
        fillStroke(ctx, '#d63a32', 3);
        ctx.beginPath();
        ctx.moveTo(33, -16);
        ctx.lineTo(48, -24);
        ctx.lineTo(48, -6);
        ctx.closePath();
        fillStroke(ctx, '#d63a32', 3);
      } else if (who === 'elite') {
        roundRect(ctx, -26, -4, 52, 14, 5);
        fillStroke(ctx, '#151515', 3);
      }
    }

    // ---------- HUD ----------

    panel(ctx, x, y, w, h, r) {
      roundRect(ctx, x, y, w, h, r || 10);
      ctx.fillStyle = 'rgba(30,30,28,0.55)';
      ctx.fill();
    }

    fmtTime(t) {
      t = Math.max(0, Math.ceil(t));
      return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    }

    drawHUD(ctx, view, ui) {
      const W = this.W;
      const H = this.H;
      // Screen areas a tap can hit, filled in as the HUD is drawn.
      this.hit = { slots: [], heal: null, skill: null, mini: null };
      const s = clamp(Math.min(H / 860, W / 1400), 0.65, 1.3);
      const me = view.me;
      const hud = view.cme || me;
      const spectating = view.cam !== view.you || !!view.spec;

      const hurtAge = this.time - this.hurtT;
      const low = me.alive && me.hp < me.mhp * 0.3;
      if (hurtAge < 0.35 || low) {
        const a = Math.max(hurtAge < 0.35 ? (0.35 - hurtAge) * 1.4 : 0, low ? 0.25 + Math.sin(this.time * 5) * 0.1 : 0);
        const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        gr.addColorStop(0, 'rgba(200,0,0,0)');
        gr.addColorStop(1, 'rgba(200,0,0,' + a + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }

      let ky;
      if (view.obj) {
        const o = view.obj;
        const title = I.pick(I.STORY.titles[view.chap]);
        let goal = '';
        if (o.ty === 'kill') goal = I.t('obj_kill', o.cur, o.need);
        else if (o.ty === 'collect') goal = I.t('obj_collect', o.cur, o.need);
        else if (o.ty === 'survive') goal = I.t('obj_survive');
        else if (o.ty === 'eliminate') goal = I.t('obj_eliminate', o.cur);
        else if (o.ty === 'boss') goal = I.t('obj_boss');
        const timer = o.ty === 'collect' ? I.t('thawIn', this.fmtTime(o.tl)) : o.ty === 'survive' ? I.t('timeLeft', this.fmtTime(o.tl)) : '';
        ctx.font = 'bold ' + Math.round(18 * s) + 'px ' + FONT;
        const pw = Math.max(260 * s, ctx.measureText(goal).width + 40 * s);
        this.panel(ctx, 14 * s, 14 * s, pw, (timer ? 84 : 62) * s);
        this.outlinedText(ctx, title, 26 * s, 36 * s, 13 * s, '#ffd75e', 'left');
        this.outlinedText(ctx, goal, 26 * s, 62 * s, 18 * s, '#ffffff', 'left');
        if (timer) this.outlinedText(ctx, timer, 26 * s, 86 * s, 15 * s, o.ty === 'collect' && o.tl < 30 ? '#ff8a7a' : '#9fdcff', 'left');
        ky = (timer ? 124 : 102) * s;
      } else {
        let kx = 192;
        if (view.ta) {
          const coop = view.tmode === 'coop';
          this.panel(ctx, 14 * s, 14 * s, 250 * s, 46 * s);
          if (coop) {
            this.outlinedText(ctx, I.t('coopAlive', view.ta[0], view.ta[1]), 26 * s, 46 * s, 20 * s, '#b8f5a0', 'left');
          } else {
            const mine = me.tm === 1 ? '#ffa294' : '#a8cfff';
            this.outlinedText(ctx, I.t('teamAlive', view.ta[0], view.ta[1]), 26 * s, 46 * s, 20 * s, mine, 'left');
          }
          kx = 272;
        } else {
          this.panel(ctx, 14 * s, 14 * s, 170 * s, 46 * s);
          this.outlinedText(ctx, I.t('alive', view.al), 26 * s, 46 * s, 22 * s, '#ffffff', 'left');
        }
        this.panel(ctx, kx * s, 14 * s, 130 * s, 46 * s);
        this.outlinedText(ctx, I.t('kills', me.k), (kx + 12) * s, 46 * s, 22 * s, '#ffd75e', 'left');
        ky = 90 * s;
        if (!me.alive && me.rsp >= 0) this.outlinedText(ctx, I.t('respawnIn', Math.ceil(me.rsp)), this.W / 2, this.H * 0.32, 30 * s, '#b8f5a0');
      }
      if (ui.tip) {
        ctx.font = 'bold ' + Math.round(15 * s) + 'px ' + FONT;
        const tw = ctx.measureText(ui.tip).width;
        roundRect(ctx, 14 * s, ky - 22 * s, tw + 28 * s, 32 * s, 10);
        ctx.fillStyle = 'rgba(255,215,94,0.9)';
        ctx.fill();
        ctx.fillStyle = '#2b2a28';
        ctx.textAlign = 'left';
        ctx.fillText(ui.tip, 28 * s, ky);
        ky += 40 * s;
      }
      for (const k of ui.killfeed) {
        const age = this.time - k.t;
        if (age > 7) continue;
        ctx.globalAlpha = clamp(7 - age, 0, 1);
        this.outlinedText(ctx, k.txt, 18 * s, ky, 15 * s, k.mine ? '#ffd75e' : '#ffffff', 'left');
        ctx.globalAlpha = 1;
        ky += 24 * s;
      }

      const ms = Math.round(190 * s);
      const mx = W - ms - 14 * s;
      const my = 14 * s;
      this.drawMinimap(ctx, view, mx, my, ms, 1800);
      this.hit.mini = { x: mx, y: my, w: ms, h: ms };
      let ly = my + ms + 12 * s;
      if (view.lb && view.lb.length && H >= 480) {
        this.panel(ctx, mx, ly, ms, (view.lb.length * 20 + 34) * s);
        this.outlinedText(ctx, I.t('leaderboard'), mx + 10 * s, ly + 22 * s, 14 * s, '#ffffff', 'left');
        ly += 44 * s;
        view.lb.forEach((e, i) => {
          const col = e.i === view.you ? '#ffd75e' : '#ffffff';
          this.outlinedText(ctx, i + 1 + '. ' + nameOf(e), mx + 10 * s, ly, 13 * s, col, 'left');
          this.outlinedText(ctx, String(e.k), mx + ms - 10 * s, ly, 13 * s, col, 'right');
          ly += 20 * s;
        });
      }

      if (view.boss) {
        const bw = Math.min(520 * s, W * 0.5);
        const bx = W / 2 - bw / 2;
        const by = 24 * s;
        this.outlinedText(ctx, I.pick(D.FOES.boss.name), W / 2, by + 4 * s, 18 * s, '#ffd75e');
        roundRect(ctx, bx, by + 12 * s, bw, 20 * s, 10 * s);
        fillStroke(ctx, '#3a3a38', 4);
        roundRect(ctx, bx + 3, by + 12 * s + 3, (bw - 6) * clamp(view.boss.hp / view.boss.mhp, 0, 1), 20 * s - 6, 8 * s);
        ctx.fillStyle = '#e8453b';
        ctx.fill();
      }

      if (hud.alive || spectating) this.drawPlayerHUD(ctx, view, ui, hud, s);

      if (spectating && view.specName) {
        this.panel(ctx, W / 2 - 170 * s, (view.boss ? 70 : 14) * s, 340 * s, 40 * s);
        this.outlinedText(ctx, I.t('spectating', view.specName), W / 2, (view.boss ? 98 : 42) * s, 18 * s, '#ffffff');
      }

      let ny = (view.boss ? 140 : 120) * s;
      for (const n of ui.notices) {
        const age = this.time - n.t;
        if (age > 4) continue;
        ctx.globalAlpha = clamp(4 - age, 0, 1);
        this.outlinedText(ctx, n.txt, W / 2, ny, 24 * s, n.col || '#ffffff');
        ctx.globalAlpha = 1;
        ny += 34 * s;
      }
      for (const b of this.banners) {
        const age = this.time - b.t;
        const pop = 1 + Math.max(0, 0.3 - age) * 2;
        ctx.globalAlpha = clamp(2 - age, 0, 1);
        this.outlinedText(ctx, b.txt, W / 2, H * 0.33, Math.round(40 * s * pop), b.col, 'center', 8);
        ctx.globalAlpha = 1;
      }

      if (ui.bigMap) {
        const bs = Math.min(W, H) * 0.84;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        this.drawMinimap(ctx, view, (W - bs) / 2, (H - bs) / 2, bs, 0);
        this.outlinedText(ctx, I.t('mapClose'), W / 2, (H + bs) / 2 + 28, 15, '#ffffff');
      }

      if (me.alive && !ui.bigMap && ui.mouseX != null && !ui.touch) this.drawCrosshair(ctx, ui, me);
    }

    drawMinimap(ctx, view, x, y, size, span) {
      const map = this.map;
      ctx.save();
      roundRect(ctx, x - 4, y - 4, size + 8, size + 8, 12);
      ctx.fillStyle = 'rgba(30,30,28,0.6)';
      ctx.fill();
      roundRect(ctx, x, y, size, size, 9);
      ctx.clip();
      const full = !span;
      const sp = full ? map.size : span;
      const wx0 = (full ? map.size / 2 : view.cx) - sp / 2;
      const wy0 = (full ? map.size / 2 : view.cy) - sp / 2;
      const k = size / sp;
      ctx.fillStyle = '#3b5a2c';
      ctx.fillRect(x, y, size, size);
      const ms = this.mini.width / map.size;
      ctx.drawImage(this.mini, wx0 * ms, wy0 * ms, sp * ms, sp * ms, x, y, size, size);
      const tx = wx => x + (wx - wx0) * k;
      const ty = wy => y + (wy - wy0) * k;
      const zo = view.zo;
      if (zo.on) {
        ctx.beginPath();
        ctx.rect(x, y, size, size);
        ctx.moveTo(tx(zo.x) + zo.r * k, ty(zo.y));
        ctx.arc(tx(zo.x), ty(zo.y), Math.max(0, zo.r * k), 0, TAU, true);
        ctx.fillStyle = 'rgba(255,110,40,0.4)';
        ctx.fill('evenodd');
        circle(ctx, tx(zo.x), ty(zo.y), zo.r * k);
        ctx.strokeStyle = '#7fd3ff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      for (const m of view.marks || []) {
        let mx = tx(m[0]);
        let my = ty(m[1]);
        const edge = mx < x + 6 || mx > x + size - 6 || my < y + 6 || my > y + size - 6;
        mx = clamp(mx, x + 6, x + size - 6);
        my = clamp(my, y + 6, y + size - 6);
        roundRect(ctx, mx - 5, my - 5, 10, 10, 2);
        ctx.fillStyle = edge ? 'rgba(127,211,255,0.8)' : '#7fd3ff';
        ctx.fill();
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (const q of view.sx || []) {
        if (q.k !== 'plane') continue;
        ctx.save();
        ctx.translate(tx(q.x), ty(q.y));
        ctx.rotate(q.a);
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(-6, -7);
        ctx.lineTo(-3, 0);
        ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = '#38b7e8';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
      for (const p of view.pl) {
        if (p.d || p.i === view.cam || !this.myTeam || p.tm !== this.myTeam) continue;
        circle(ctx, tx(p.x), ty(p.y), full ? 5 : 3.5);
        ctx.fillStyle = '#8fe07a';
        ctx.fill();
      }
      const px = tx(view.cx);
      const py = ty(view.cy);
      circle(ctx, px, py, full ? 7 : 5);
      ctx.fillStyle = view.cam === view.you ? '#ffffff' : '#ffb02e';
      ctx.fill();
      ctx.strokeStyle = OUT;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
    }

    drawPlayerHUD(ctx, view, ui, hud, s) {
      const W = this.W;
      const H = this.H;
      const n = hud.sl.length;
      const bw = 96 * s;
      const bh = 76 * s;
      const gap = 10 * s;
      const total = n * bw + (n - 1) * gap;
      let x = W / 2 - total / 2;
      const y = H - bh - 16 * s;
      const own = hud === view.me;
      for (let i = 0; i < n; i++) {
        const sl = hud.sl[i];
        const active = hud.act === i;
        const yy = active ? y - 6 * s : y;
        if (own) this.hit.slots.push({ x, y: yy, w: bw, h: bh, i });
        const rare = sl && D.WEAPONS[sl.t] && D.WEAPONS[sl.t].rare;
        roundRect(ctx, x, yy, bw, bh, 12 * s);
        ctx.fillStyle = active ? 'rgba(255,255,255,0.32)' : 'rgba(30,30,28,0.55)';
        ctx.fill();
        if (active || rare) {
          ctx.strokeStyle = rare ? '#ffcf3a' : '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        this.outlinedText(ctx, String(i + 1), x + 12 * s, yy + 20 * s, 14 * s, '#ffffff');
        if (sl) {
          this.drawItemIcon(ctx, sl.t, x + bw / 2, yy + bh * 0.42, 0.85 * s);
          this.outlinedText(ctx, itemName(sl.t), x + bw / 2, yy + bh - 10 * s, 12 * s, rare ? '#ffe27a' : '#ffffff');
          if (sl.m != null) this.outlinedText(ctx, sl.m + '/' + D.WEAPONS[sl.t].mag, x + bw - 8 * s, yy + 20 * s, 12 * s, sl.m === 0 ? '#ff8a7a' : '#ffffff', 'right');
        } else {
          this.outlinedText(ctx, I.t('fists'), x + bw / 2, yy + bh / 2 + 6 * s, 13 * s, 'rgba(255,255,255,0.6)');
        }
        x += bw + gap;
      }

      if (hud.so != null) {
        const px = W / 2 + total / 2 + 18 * s;
        const pw = 72 * s;
        if (own) this.hit.heal = { x: px, y, w: pw, h: bh };
        roundRect(ctx, px, y, pw, bh, 12 * s);
        ctx.fillStyle = 'rgba(30,30,28,0.55)';
        ctx.fill();
        if (hud.so > 0) {
          ctx.strokeStyle = '#7be07b';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        ctx.globalAlpha = hud.so > 0 ? 1 : 0.4;
        this.drawItemIcon(ctx, 'soup', px + pw / 2, y + bh * 0.42, 0.85 * s);
        ctx.globalAlpha = 1;
        this.outlinedText(ctx, 'H', px + 12 * s, y + 20 * s, 14 * s, '#ffffff');
        this.outlinedText(ctx, I.t('medPouch') + ' ' + hud.so + '/' + hud.soc, px + pw / 2, y + bh - 10 * s, 12 * s, hud.so > 0 ? '#b8f5a0' : 'rgba(255,255,255,0.6)');
        if (hud.zm > 1) this.outlinedText(ctx, itemName('scope' + hud.zm), px + pw / 2, y - 10 * s, 13 * s, '#ffe27a');
      }

      if (hud.ch) {
        const r = 34 * s;
        const cx = W / 2 - total / 2 - r - 20 * s;
        const cy = y + bh / 2 - 4 * s;
        if (own) this.hit.skill = { x: cx - r, y: cy - r, w: r * 2, h: r * 2 };
        circle(ctx, cx, cy, r);
        ctx.fillStyle = hud.sc <= 0 ? 'rgba(255,215,94,0.9)' : 'rgba(30,30,28,0.6)';
        ctx.fill();
        ctx.strokeStyle = hud.sc <= 0 ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
        this.drawSkillIcon(ctx, hud.sk, cx, cy, r * 0.62);
        if (hud.sc > 0) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * hud.sc);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fill();
          this.outlinedText(ctx, String(hud.scs), cx, cy + 8 * s, 22 * s, '#ffffff');
        }
        this.outlinedText(ctx, ui.touch ? I.t('skill') : I.lang === 'zh' ? '右鍵 / X' : 'RMB / X', cx, cy + r + 16 * s, 11 * s, '#ffffff');
        this.drawPowerButtons(ctx, hud, own, cx, cy, r, s, ui);
      }

      const hbw = Math.max(total, 330 * s);
      const hx = W / 2 - hbw / 2;
      const hy = y - 52 * s;
      roundRect(ctx, hx, hy, hbw, 26 * s, 13 * s);
      fillStroke(ctx, '#3a3a38', 4);
      const hpf = clamp(hud.hp / hud.mhp, 0, 1);
      if (hpf > 0) {
        roundRect(ctx, hx + 3, hy + 3, (hbw - 6) * hpf, 26 * s - 6, 10 * s);
        ctx.fillStyle = hpf > 0.6 ? '#7ad35e' : hpf > 0.3 ? '#f0c043' : '#e8453b';
        ctx.fill();
      }
      this.outlinedText(ctx, Math.ceil(hud.hp) + ' / ' + hud.mhp, W / 2, hy + 19 * s, 15 * s, '#ffffff');
      const sty = hy + 32 * s;
      roundRect(ctx, hx + hbw * 0.15, sty, hbw * 0.7, 9 * s, 4.5 * s);
      ctx.fillStyle = 'rgba(30,30,28,0.6)';
      ctx.fill();
      if (hud.st > 0) {
        roundRect(ctx, hx + hbw * 0.15, sty, hbw * 0.7 * clamp(hud.st / 100, 0, 1), 9 * s, 4.5 * s);
        ctx.fillStyle = hud.bo ? '#ff9cc6' : '#62b8f0';
        ctx.fill();
      }

      const me = view.me;
      if (me.alive && me.pr && !ui.bigMap && !ui.touch) {
        const pr = me.pr;
        const name = pr.k === 'drive' ? I.pick(D.VEHICLES[pr.t].name) : pr.t ? itemName(pr.t) : '';
        this.outlinedText(ctx, '[F]  ' + I.t(pr.k, name), W / 2, hy - 18 * s, 18 * s, '#ffffff');
      }
      let py = H / 2 + 90 * s;
      for (const m of ui.pickups) {
        const age = this.time - m.t;
        if (age > 2.2) continue;
        ctx.globalAlpha = clamp(2.2 - age, 0, 1);
        this.outlinedText(ctx, m.txt, W / 2, py, 15 * s, '#e8f5d8');
        ctx.globalAlpha = 1;
        py += 22 * s;
      }
      if (hud.inj >= 0) {
        const r = 34 * s;
        const cx = W / 2;
        const cy = H / 2 - 80 * s;
        circle(ctx, cx, cy, r + 6 * s);
        ctx.fillStyle = 'rgba(30,30,28,0.6)';
        ctx.fill();
        ctx.strokeStyle = '#7be07b';
        ctx.lineWidth = 7 * s;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * hud.inj);
        ctx.stroke();
        this.outlinedText(ctx, I.t('healing'), cx, cy + 6 * s, 14 * s, '#ffffff');
      }
    }

    newSkillIcon(ctx, sk, r) {
      ctx.lineJoin = 'round';
      if (sk === 'parcel') {
        roundRect(ctx, -r * 0.7, -r * 0.55, r * 1.4, r * 1.1, 3);
        fillStroke(ctx, '#d49a4a', 3);
        ctx.strokeStyle = '#8a5a30';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.55);
        ctx.lineTo(0, r * 0.55);
        ctx.moveTo(-r * 0.7, 0);
        ctx.lineTo(r * 0.7, 0);
        ctx.stroke();
      } else if (sk === 'bubble') {
        circle(ctx, 0, 0, r * 0.85);
        ctx.fillStyle = 'rgba(190,235,255,0.85)';
        ctx.fill();
        ctx.strokeStyle = '#4fa3c7';
        ctx.lineWidth = 3;
        ctx.stroke();
        circle(ctx, -r * 0.3, -r * 0.3, r * 0.2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      } else if (sk === 'coins') {
        for (const [dx, dy] of [[-r * 0.3, r * 0.15], [r * 0.25, -r * 0.2]]) {
          circle(ctx, dx, dy, r * 0.5);
          fillStroke(ctx, '#f4c430', 3);
          ctx.fillStyle = '#b8860b';
          ctx.font = 'bold ' + Math.round(r * 0.6) + 'px ' + FONT;
          ctx.textAlign = 'center';
          ctx.fillText('$', dx, dy + r * 0.2);
        }
      } else if (sk === 'freeze') {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          ctx.lineTo(-Math.cos(a) * r, -Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.strokeStyle = '#7fd3ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // The gadget button (green, uses left as dots) to the left of the skill circle, and the Wok Overdrive
    // meter as a purple ring around the skill circle with a button above it once full.
    drawPowerButtons(ctx, hud, own, cx, cy, r, s, ui) {
      if (hud.gd) {
        const gr = 24 * s;
        const gx = cx - r - gr - 12 * s;
        const gy = cy + 4 * s;
        if (own) this.hit.gadget = { x: gx - gr, y: gy - gr, w: gr * 2, h: gr * 2 };
        const ready = hud.gu > 0 && hud.gc <= 0;
        circle(ctx, gx, gy, gr);
        ctx.fillStyle = ready ? 'rgba(95,211,107,0.95)' : 'rgba(30,30,28,0.6)';
        ctx.fill();
        ctx.strokeStyle = ready ? '#ffffff' : 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 3;
        ctx.stroke();
        const G = D.GADGETS[hud.gd];
        this.outlinedText(ctx, I.pick(G.name).slice(0, I.lang === 'zh' ? 1 : 2), gx, gy + 7 * s, 19 * s, '#ffffff');
        if (hud.gc > 0) {
          ctx.beginPath();
          ctx.moveTo(gx, gy);
          ctx.arc(gx, gy, gr, -Math.PI / 2, -Math.PI / 2 + TAU * hud.gc);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.fill();
        }
        for (let i = 0; i < D.GADGET_USES; i++) {
          circle(ctx, gx - 10 * s + i * 10 * s, gy + gr + 8 * s, 3.5 * s);
          ctx.fillStyle = i < hud.gu ? '#5fd36b' : 'rgba(255,255,255,0.25)';
          ctx.fill();
        }
        this.outlinedText(ctx, ui.touch ? '' : 'G', gx, gy - gr - 6 * s, 11 * s, '#ffffff');
      }
      if (hud.odOk) {
        const active = hud.odT > 0;
        const frac = active ? hud.odT / D.OVERDRIVE.time : hud.od;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 6 * s, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.strokeStyle = active ? '#e0b8ff' : '#b46bff';
        ctx.lineWidth = 6 * s;
        ctx.stroke();
        if (hud.od >= 1 && !active) {
          const oy = cy - r - 34 * s;
          const orr = 20 * s;
          if (own) this.hit.od = { x: cx - orr - 6, y: oy - orr - 6, w: orr * 2 + 12, h: orr * 2 + 12 };
          const pulse = 0.85 + Math.sin(this.time * 8) * 0.15;
          circle(ctx, cx, oy, orr * pulse);
          ctx.fillStyle = '#9b4dff';
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
          this.outlinedText(ctx, ui.touch ? '火' : 'V', cx, oy + 7 * s, 18 * s, '#ffffff');
        }
      }
    }

    // Effects on a character that show in both views: bubble shield, Overdrive aura, mouthguard.
    drawAuras(ctx, p, x, y, R) {
      if (p.od) {
        for (let i = 0; i < 6; i++) {
          const a = this.time * 4 + (i / 6) * TAU;
          const fl = 0.6 + Math.sin(this.time * 13 + i) * 0.4;
          circle(ctx, x + Math.cos(a) * R * 1.05, y + Math.sin(a) * R * 1.05, R * 0.28 * fl + 2);
          ctx.fillStyle = 'rgba(180,107,255,0.55)';
          ctx.fill();
        }
      }
      if (p.bb) {
        circle(ctx, x, y, R + 12);
        ctx.fillStyle = 'rgba(190,235,255,0.28)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(127,208,232,0.9)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        circle(ctx, x - R * 0.5, y - R * 0.6, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fill();
      }
      if (p.gd) {
        circle(ctx, x, y, R + 5);
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawParcel(ctx, x, y, s) {
      roundRect(ctx, x - 12 * s, y - 10 * s, 24 * s, 20 * s, 3);
      fillStroke(ctx, '#d49a4a', 2.5);
      ctx.strokeStyle = '#8a5a30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y - 10 * s);
      ctx.lineTo(x, y + 10 * s);
      ctx.stroke();
    }

    drawMine(ctx, m, mine) {
      circle(ctx, m.x, m.y, 14);
      fillStroke(ctx, '#4a4f55', 3);
      circle(ctx, m.x, m.y, 5);
      ctx.fillStyle = m.arm && Math.sin(this.time * 9) > 0 ? (mine ? '#5fd36b' : '#ff4a3a') : '#7a7f85';
      ctx.fill();
    }

    drawSkillIcon(ctx, sk, x, y, r) {
      ctx.save();
      ctx.translate(x, y);
      if (sk === 'parcel' || sk === 'bubble' || sk === 'coins' || sk === 'freeze') {
        this.newSkillIcon(ctx, sk, r);
        ctx.restore();
        return;
      }
      if (sk === 'flame') {
        ctx.beginPath();
        ctx.moveTo(0, -r);
        ctx.quadraticCurveTo(r * 0.9, -r * 0.1, r * 0.55, r * 0.7);
        ctx.quadraticCurveTo(0, r * 1.05, -r * 0.55, r * 0.7);
        ctx.quadraticCurveTo(-r * 0.9, -r * 0.1, 0, -r);
        fillStroke(ctx, '#ff7a2a', 3);
        circle(ctx, 0, r * 0.35, r * 0.35);
        ctx.fillStyle = '#ffd04a';
        ctx.fill();
      } else if (sk === 'rush') {
        circle(ctx, r * 0.2, 0, r * 0.6);
        fillStroke(ctx, '#d63a32', 3);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        for (const off of [-0.4, 0, 0.4]) {
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, off * r);
          ctx.lineTo(-r, off * r);
          ctx.stroke();
        }
      } else if (sk === 'turret') {
        circle(ctx, 0, r * 0.2, r * 0.5);
        fillStroke(ctx, '#7a8794', 3);
        roundRect(ctx, 0, -r * 0.1, r, r * 0.5, 3);
        fillStroke(ctx, '#3f4a55', 3);
      } else if (sk === 'boba') {
        roundRect(ctx, -r * 0.5, -r * 0.6, r, r * 1.4, r * 0.25);
        fillStroke(ctx, '#f3d9b8', 3);
        ctx.fillStyle = '#4a3020';
        for (let i = 0; i < 4; i++) {
          circle(ctx, -r * 0.25 + (i % 2) * r * 0.5, r * 0.45 - Math.floor(i / 2) * r * 0.3, r * 0.12);
          ctx.fill();
        }
        ctx.strokeStyle = '#ff6fa8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(r * 0.15, -r * 0.6);
        ctx.lineTo(r * 0.35, -r * 1.05);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCrosshair(ctx, ui, me) {
      const x = ui.mouseX;
      const y = ui.mouseY;
      ctx.lineCap = 'round';
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? '#ffffff' : OUT;
        ctx.lineWidth = pass ? 2.5 : 5.5;
        circle(ctx, x, y, 11);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 18, y);
        ctx.lineTo(x - 6, y);
        ctx.moveTo(x + 6, y);
        ctx.lineTo(x + 18, y);
        ctx.moveTo(x, y - 18);
        ctx.lineTo(x, y - 6);
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x, y + 18);
        ctx.stroke();
      }
      if (this.time - this.hitMarkT < 0.18) {
        ctx.strokeStyle = '#ff4b3e';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          ctx.moveTo(x + dx * 22, y + dy * 22);
          ctx.lineTo(x + dx * 13, y + dy * 13);
        }
        ctx.stroke();
      }
      if (me.rl >= 0) {
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 7;
        circle(ctx, x, y, 26);
        ctx.stroke();
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * me.rl);
        ctx.stroke();
      }
    }
  }

  Renderer.nameOf = nameOf;
  Renderer.itemName = itemName;
  globalThis.PF_Renderer = Renderer;
})();
