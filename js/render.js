(function () {
  'use strict';
  const D = globalThis.PF_DATA;
  const TAU = Math.PI * 2;
  const PR = D.PLAYER_R;
  const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";
  const OUT = '#2b2a28';
  const CANOPY = 1.8;

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
    r = Math.min(r, w / 2, h / 2);
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

  const CAR_COL = ['#e0574a', '#4a8fe0', '#f0c043', '#5cc08a'];
  const BIKE_COL = ['#2f2f2f', '#e07a2e', '#4f6fd0', '#c43d7a'];
  const DEBRIS = { tree: '#5a3d22', rock: '#a3a8ac', crate: '#d49a4a', bush: '#3f8f3a', wall: '#7a6450', vehicle: '#555555' };
  const TRACER = { pistol: 60, uzi: 55, shotgun: 40, rifle: 90, sniper: 180, minigun: 80 };

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
      this.dmgNums = [];
      this.flash = new Map();
      this.roofAlpha = new Map();
      this.time = 0;
      this.shake = 0;
      this.hitMarkT = -10;
      this.hurtT = -10;
      this.rockCache = new Map();
      this.groundPattern = this.makeGroundPattern();
      this.resize();
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      return this.ctx.createPattern(c, 'repeat');
    }

    setMap(map) {
      this.map = map;
      this.particles.length = 0;
      this.fx.length = 0;
      this.dmgNums.length = 0;
      this.flash.clear();
      this.roofAlpha.clear();
      this.rockCache.clear();
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
        } else if (o.k === 'rock') {
          g.fillStyle = '#a3a8ac';
          circle(g, o.x * s, o.y * s, Math.max(1, o.r * s));
          g.fill();
        }
      }
      for (const b of map.buildings) {
        g.fillStyle = D.ROOFS[b.roof];
        g.fillRect((b.x - b.w / 2) * s, (b.y - b.h / 2) * s, b.w * s, b.h * s);
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

    onEvent(e, myId, camX, camY) {
      switch (e.e) {
        case 'shot':
          this.flash.set(e.i, this.time);
          if (e.i === myId) this.shake = Math.max(this.shake, e.w === 'sniper' ? 6 : e.w === 'shotgun' ? 5 : 1.5);
          break;
        case 'hit':
          if (e.ty === 'p') {
            this.addParticles(e.x, e.y, 6, '#d6403a', 160, 0.45, 5);
            if (e.by === myId) this.hitMarkT = this.time;
          } else if (e.ty === 'o') {
            this.addParticles(e.x, e.y, 4, DEBRIS[e.k] || '#777', 140, 0.4, 4);
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
        case 'kill':
          this.addParticles(e.x, e.y, 14, '#c0352f', 200, 0.7, 7);
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
        const k = Math.exp(-(p.kind === 3 ? 1.5 : 4) * dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      if (ps.length > 700) ps.splice(0, ps.length - 700);
      this.fx = this.fx.filter(f => this.time - f.t < 0.6);
      this.dmgNums = this.dmgNums.filter(d => this.time - d.t < 0.9);
    }

    // ---------- world ----------

    computeZoom(veh) {
      const vh = D.VIEW_H * (veh ? 1.2 : 1);
      return Math.max(this.H / vh, this.W / (vh * D.MAX_ASPECT));
    }

    draw(view, ui, dt) {
      this.time += dt;
      const ctx = this.ctx;
      const map = this.map;
      if (!map || !view) return;
      this.updateParticles(dt);
      const target = this.computeZoom(view.cveh);
      this.zoom = this.zoom ? lerp(this.zoom, target, Math.min(1, dt * 4)) : target;
      const z = this.zoom;
      this.camX = view.cx;
      this.camY = view.cy;
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
      this.drawRoads(ctx);

      const camP = view.pl.find(p => p.i === view.cam);
      const cx = camP ? camP.x : this.camX;
      const cy = camP ? camP.y : this.camY;
      const camInside = this.buildingAt(cx, cy);
      for (const b of map.buildings) {
        if (vis(b.x, b.y, Math.max(b.w, b.h))) this.drawFloor(ctx, b);
      }
      for (const it of view.it) {
        if (vis(it.x, it.y, 40)) this.drawGroundItem(ctx, it);
      }
      const obs = [];
      for (const o of map.obstacles) {
        if (o.dead) continue;
        const ext = o.k === 'tree' ? o.r * CANOPY : o.s === 'c' ? o.r : Math.max(o.hw, o.hh);
        if (vis(o.x, o.y, ext)) obs.push(o);
      }
      for (const p of view.pl) {
        if (p.d) this.drawBody(ctx, p);
      }
      for (const o of obs) {
        if (o.k === 'rock') this.drawRock(ctx, o);
        else if (o.k === 'crate') this.drawCrate(ctx, o);
        else if (o.k === 'wall') this.drawWall(ctx, o);
        else if (o.k === 'tree') this.drawTrunk(ctx, o);
      }
      const plMap = new Map();
      for (const p of view.pl) plMap.set(p.i, p);
      for (const v of view.ve) {
        if (vis(v.x, v.y, 90)) this.drawVehicle(ctx, v, plMap);
      }
      for (const p of view.pl) {
        if (p.d || p.veh) continue;
        const aim = p.i === view.you && ui.aim != null ? ui.aim : p.a;
        this.drawPlayer(ctx, p, aim);
      }
      this.drawBullets(ctx, view.bu);
      this.drawParticles(ctx, vis, false);
      for (const o of obs) {
        if (o.k === 'bush') this.drawBush(ctx, o, Math.hypot(cx - o.x, cy - o.y) < o.r + PR * 0.5 ? 0.55 : 1);
      }
      for (const o of obs) {
        if (o.k === 'tree') this.drawCanopy(ctx, o, Math.hypot(cx - o.x, cy - o.y) < o.r * CANOPY + PR ? 0.45 : 1);
      }
      for (const b of map.buildings) {
        if (!vis(b.x, b.y, Math.max(b.w, b.h))) continue;
        const tgt = camInside === b ? 0 : 1;
        let a = this.roofAlpha.get(b.id);
        a = a == null ? tgt : lerp(a, tgt, Math.min(1, dt * 8));
        this.roofAlpha.set(b.id, a);
        if (a > 0.02) this.drawRoof(ctx, b, a);
      }
      this.drawParticles(ctx, vis, true);
      this.drawExplosions(ctx);
      this.drawZone(ctx, view.zo, x0, y0, x1, y1);
      this.drawNames(ctx, view, camInside);
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

    drawFloor(ctx, b) {
      const x = b.x - b.w / 2;
      const y = b.y - b.h / 2;
      const col = D.FLOORS[b.floor];
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
    }

    drawRoof(ctx, b, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const m = 6;
      const x = b.x - b.w / 2 - m;
      const y = b.y - b.h / 2 - m;
      const w = b.w + m * 2;
      const h = b.h + m * 2;
      const col = D.ROOFS[b.roof];
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x + 10, y + 12, w, h);
      roundRect(ctx, x, y, w, h, 10);
      fillStroke(ctx, col, 6);
      const horiz = w >= h;
      ctx.fillStyle = shade(col, -0.14);
      ctx.save();
      roundRect(ctx, x, y, w, h, 10);
      ctx.clip();
      if (horiz) ctx.fillRect(x, y + h / 2, w, h / 2);
      else ctx.fillRect(x + w / 2, y, w / 2, h);
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
      if (b.id % 2 === 0) {
        const cx = horiz ? x + w * 0.72 : x + w * 0.25;
        const cy = horiz ? y + h * 0.25 : y + h * 0.72;
        roundRect(ctx, cx - 14, cy - 14, 28, 28, 4);
        fillStroke(ctx, '#8d7f78', 4);
      }
      ctx.restore();
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
      ctx.font = 'bold ' + Math.round(hw * 1.2) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 5;
      ctx.strokeStyle = OUT;
      ctx.strokeText('?', o.x, o.y + 2);
      ctx.fillStyle = '#fff1c9';
      ctx.fillText('?', o.x, o.y + 2);
      ctx.textBaseline = 'alphabetic';
    }

    drawWall(ctx, o) {
      ctx.beginPath();
      ctx.rect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
      fillStroke(ctx, '#7a6450', 4);
    }

    drawTrunk(ctx, o) {
      circle(ctx, o.x, o.y, o.r * 0.6);
      fillStroke(ctx, '#7a5432', 4);
    }

    drawCanopy(ctx, o, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const r = o.r * CANOPY;
      const pine = o.v % 3 === 0;
      if (pine) {
        ctx.beginPath();
        const n = 9;
        for (let i = 0; i < n * 2; i++) {
          const rr = i % 2 ? r * 0.8 : r;
          const a = rnd(o.v, 1) * TAU + (i / (n * 2)) * TAU;
          if (i) ctx.lineTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
          else ctx.moveTo(o.x + Math.cos(a) * rr, o.y + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.lineJoin = 'round';
        fillStroke(ctx, '#3f8a45', 5);
        circle(ctx, o.x - r * 0.1, o.y - r * 0.1, r * 0.45);
        ctx.fillStyle = '#52a356';
        ctx.fill();
      } else {
        circle(ctx, o.x, o.y, r);
        fillStroke(ctx, '#4a9b3f', 5);
        circle(ctx, o.x - r * 0.15, o.y - r * 0.15, r * 0.62);
        ctx.fillStyle = '#5bb04c';
        ctx.fill();
        circle(ctx, o.x - r * 0.3, o.y - r * 0.32, r * 0.22);
        ctx.fillStyle = '#6dc05a';
        ctx.fill();
      }
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

    // ---------- items and weapons ----------

    drawGun(ctx, t, x, y, scale) {
      const W = D.WEAPONS[t];
      const len = W.len * scale;
      const wid = W.wid * scale;
      ctx.lineJoin = 'round';
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

    drawBlade(ctx, t, x, y, scale) {
      const W = D.WEAPONS[t];
      const len = (t === 'sword' ? 70 : 34) * scale;
      roundRect(ctx, x - 12 * scale, y - 3 * scale, 14 * scale, 6 * scale, 2);
      fillStroke(ctx, '#6b4a2b', 3 * scale);
      if (t === 'sword') {
        ctx.beginPath();
        ctx.rect(x + 2 * scale, y - 8 * scale, 5 * scale, 16 * scale);
        fillStroke(ctx, '#b88a2e', 3 * scale);
      }
      ctx.beginPath();
      ctx.moveTo(x + 6 * scale, y - 5 * scale);
      ctx.lineTo(x + len - 8 * scale, y - 5 * scale);
      ctx.lineTo(x + len, y);
      ctx.lineTo(x + len - 8 * scale, y + 5 * scale);
      ctx.lineTo(x + 6 * scale, y + 5 * scale);
      ctx.closePath();
      fillStroke(ctx, W.color, 3 * scale);
    }

    drawItemIcon(ctx, t, x, y, scale) {
      ctx.save();
      ctx.translate(x, y);
      if (D.WEAPONS[t] && !D.WEAPONS[t].melee) {
        const W = D.WEAPONS[t];
        const s = scale * Math.min(1, 52 / W.len);
        ctx.rotate(-0.45);
        this.drawGun(ctx, t, -W.len * s / 2, 0, s);
      } else if (t === 'knife' || t === 'sword') {
        const s = scale * (t === 'sword' ? 0.7 : 1);
        ctx.rotate(-0.7);
        this.drawBlade(ctx, t, -(t === 'sword' ? 30 : 14) * s, 0, s);
      } else if (t === 'syringe') {
        ctx.rotate(-0.7);
        roundRect(ctx, -16 * scale, -6 * scale, 26 * scale, 12 * scale, 3);
        fillStroke(ctx, '#e8f4f8', 3 * scale);
        ctx.fillStyle = '#58d36a';
        ctx.fillRect(-12 * scale, -3 * scale, 16 * scale, 6 * scale);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 3 * scale;
        ctx.beginPath();
        ctx.moveTo(10 * scale, 0);
        ctx.lineTo(20 * scale, 0);
        ctx.moveTo(-16 * scale, 0);
        ctx.lineTo(-22 * scale, 0);
        ctx.moveTo(-22 * scale, -6 * scale);
        ctx.lineTo(-22 * scale, 6 * scale);
        ctx.stroke();
      } else if (t === 'medpack') {
        roundRect(ctx, -15 * scale, -12 * scale, 30 * scale, 24 * scale, 5 * scale);
        fillStroke(ctx, '#ffffff', 3 * scale);
        ctx.fillStyle = '#e0463e';
        ctx.fillRect(-3.5 * scale, -8 * scale, 7 * scale, 16 * scale);
        ctx.fillRect(-8 * scale, -3.5 * scale, 16 * scale, 7 * scale);
      } else if (t === 'backpack') {
        roundRect(ctx, -13 * scale, -14 * scale, 26 * scale, 28 * scale, 7 * scale);
        fillStroke(ctx, '#a8763e', 3 * scale);
        roundRect(ctx, -9 * scale, 0, 18 * scale, 10 * scale, 3 * scale);
        fillStroke(ctx, '#8a5e2e', 2.5 * scale);
      }
      ctx.restore();
    }

    drawGroundItem(ctx, it) {
      const bob = Math.sin(this.time * 3 + it.i) * 2;
      circle(ctx, it.x, it.y, 28);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      this.drawItemIcon(ctx, it.t, it.x, it.y + bob, 1);
    }

    // ---------- actors ----------

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

    hand(ctx, x, y, skin) {
      circle(ctx, x, y, 9);
      fillStroke(ctx, skin, 4);
    }

    drawPlayer(ctx, p, aim) {
      const skin = D.SKINS[p.sk] || D.SKINS[0];
      const jz = p.jz || 0;
      const sc = 1 + jz * 0.28;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      circle(ctx, 4 + jz * 14, 6 + jz * 18, PR);
      ctx.fill();
      ctx.scale(sc, sc);
      ctx.rotate(aim);
      if (p.bp) {
        roundRect(ctx, -PR - 6, -14, 18, 28, 6);
        fillStroke(ctx, '#a8763e', 4);
      }
      const t = p.w;
      const W = D.WEAPONS[t];
      const sw = p.sw || 0;
      const prog = sw ? Math.sin((1 - Math.abs(sw)) * Math.PI) : 0;
      const side = sw >= 0 ? 1 : -1;
      const isGun = W && !W.melee;
      if (isGun) {
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
      if (p.hit) {
        circle(ctx, 0, 0, PR - 2);
        ctx.fillStyle = 'rgba(255,60,50,0.45)';
        ctx.fill();
      }
      if (isGun) {
        if (t === 'pistol') {
          this.hand(ctx, PR + 2, 7, skin);
          this.hand(ctx, PR + 2, -7, skin);
        } else {
          this.hand(ctx, PR * 0.85, 6, skin);
          this.hand(ctx, PR * 0.3 + W.len * 0.6, -3, skin);
        }
      } else if (t === 'knife' || t === 'sword') {
        ctx.save();
        ctx.rotate(-0.4 - prog * 1.4 + (t === 'sword' ? 0 : 0.2));
        this.drawBlade(ctx, t, PR * 0.9, PR * 0.55, 1);
        this.hand(ctx, PR * 0.85, PR * 0.55, skin);
        ctx.restore();
        this.hand(ctx, PR * 0.7, -PR * 0.65, skin);
      } else if (t === 'syringe') {
        this.hand(ctx, PR * 0.7, -PR * 0.65, skin);
        ctx.save();
        ctx.translate(PR * 1.05, PR * 0.55);
        roundRect(ctx, -6, -5, 22, 10, 3);
        fillStroke(ctx, '#e8f4f8', 3);
        ctx.fillStyle = '#58d36a';
        ctx.fillRect(-3, -2.5, 14, 5);
        ctx.restore();
        this.hand(ctx, PR * 0.85, PR * 0.55, skin);
      } else {
        const ext = prog * PR * 0.8;
        this.hand(ctx, PR * 0.72 + (side > 0 ? ext : 0), PR * 0.65 - (side > 0 ? prog * 10 : 0), skin);
        this.hand(ctx, PR * 0.72 + (side < 0 ? ext : 0), -PR * 0.65 + (side < 0 ? prog * 10 : 0), skin);
      }
      ctx.restore();
      if (p.inj) {
        ctx.strokeStyle = 'rgba(90,220,110,0.9)';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -this.time * 30;
        circle(ctx, p.x, p.y, PR + 10);
        ctx.stroke();
        ctx.setLineDash([]);
      }
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
        roundRect(ctx, -L * 0.22, -Wd / 2 + 8, L * 0.46, Wd - 16, 10);
        fillStroke(ctx, shade(col, 0.2), 4);
        roundRect(ctx, L * 0.12, -Wd / 2 + 10, 12, Wd - 20, 4);
        fillStroke(ctx, '#bfe3f2', 3);
        circle(ctx, L / 2 - 8, -Wd / 2 + 12, 5);
        fillStroke(ctx, '#fff2a8', 2);
        circle(ctx, L / 2 - 8, Wd / 2 - 12, 5);
        fillStroke(ctx, '#fff2a8', 2);
        if (drv) {
          circle(ctx, -L * 0.04, -Wd * 0.16, 15);
          fillStroke(ctx, D.SKINS[drv.sk] || D.SKINS[0], 4);
        }
      } else {
        roundRect(ctx, L * 0.36 - 13, -7, 26, 14, 6);
        fillStroke(ctx, '#333333', 4);
        roundRect(ctx, -L * 0.36 - 13, -7, 26, 14, 6);
        fillStroke(ctx, '#333333', 4);
        const col = BIKE_COL[v.c % BIKE_COL.length];
        roundRect(ctx, -L * 0.3, -9, L * 0.6, 18, 7);
        fillStroke(ctx, col, 4);
        ctx.strokeStyle = OUT;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(L * 0.24, -18);
        ctx.lineTo(L * 0.24, 18);
        ctx.stroke();
        if (drv) {
          const skin = D.SKINS[drv.sk] || D.SKINS[0];
          this.hand(ctx, L * 0.22, -16, skin);
          this.hand(ctx, L * 0.22, 16, skin);
          circle(ctx, -4, 0, PR * 0.9);
          fillStroke(ctx, skin, 5);
        }
      }
      ctx.restore();
      if (v.hp < 0.4 && Math.random() < 0.25) {
        this.particles.push({ x: v.x + (Math.random() - 0.5) * 20, y: v.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 1.2, max: 1.2, size: 12 + Math.random() * 10, color: '#6b6b6b', kind: 3, rot: 0, vr: 0 });
      }
      if (v.hp < 0.999) {
        roundRect(ctx, v.x - 32, v.y - V.r - 22, 64, 10, 5);
        fillStroke(ctx, '#3a3a3a', 3);
        ctx.fillStyle = v.hp > 0.5 ? '#8fd46f' : v.hp > 0.25 ? '#f0c043' : '#e0574a';
        ctx.fillRect(v.x - 30, v.y - V.r - 20, 60 * v.hp, 6);
      }
    }

    drawBullets(ctx, bullets) {
      ctx.lineCap = 'round';
      for (const b of bullets) {
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
        ctx.strokeStyle = '#ffdf5a';
        ctx.lineWidth = b.w === 'sniper' ? 4.5 : 3.5;
        ctx.stroke();
      }
    }

    drawParticles(ctx, vis, top) {
      for (const p of this.particles) {
        if ((p.kind === 3) !== top || !vis(p.x, p.y, p.size)) continue;
        const a = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        if (p.kind === 3) {
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
      if (!zo) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 100, y0 - 100, x1 - x0 + 200, y1 - y0 + 200);
      ctx.moveTo(zo.x + zo.r, zo.y);
      ctx.arc(zo.x, zo.y, Math.max(0, zo.r), 0, TAU, true);
      ctx.fillStyle = 'rgba(220,40,40,0.32)';
      ctx.fill('evenodd');
      circle(ctx, zo.x, zo.y, zo.r);
      ctx.strokeStyle = '#e8352b';
      ctx.lineWidth = 8;
      ctx.stroke();
      if (zo.tr < zo.r - 5) {
        circle(ctx, zo.x, zo.y, zo.tr);
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
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

    drawNames(ctx, view, camInside) {
      for (const p of view.pl) {
        if (p.d || p.veh || p.i === view.you || !p.hu) continue;
        if (p.bu && p.i !== view.cam) continue;
        const b = this.buildingAt(p.x, p.y);
        if (b && b !== camInside) continue;
        this.outlinedText(ctx, p.n, p.x, p.y - PR - 14, 16, '#ffffff');
      }
    }

    drawDamageNumbers(ctx) {
      for (const d of this.dmgNums) {
        const t = (this.time - d.t) / 0.9;
        ctx.globalAlpha = 1 - t;
        this.outlinedText(ctx, String(d.n), d.x, d.y - t * 40, 22, '#ffe14d');
      }
      ctx.globalAlpha = 1;
    }

    // ---------- HUD ----------

    panel(ctx, x, y, w, h, r) {
      roundRect(ctx, x, y, w, h, r || 10);
      ctx.fillStyle = 'rgba(30,30,28,0.55)';
      ctx.fill();
    }

    drawHUD(ctx, view, ui) {
      const W = this.W;
      const H = this.H;
      const s = clamp(Math.min(H / 860, W / 1400), 0.65, 1.3);
      const me = view.me;
      const hud = view.cme || me;
      const spectating = view.cam !== view.you || !!view.spec;

      const hurtAge = this.time - this.hurtT;
      const low = me.alive && me.hp < 30;
      if (hurtAge < 0.35 || low) {
        const a = Math.max(hurtAge < 0.35 ? (0.35 - hurtAge) * 1.4 : 0, low ? 0.25 + Math.sin(this.time * 5) * 0.1 : 0);
        const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        gr.addColorStop(0, 'rgba(200,0,0,0)');
        gr.addColorStop(1, 'rgba(200,0,0,' + a + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }

      this.panel(ctx, 14 * s, 14 * s, 170 * s, 46 * s);
      this.outlinedText(ctx, view.al + ' alive', 26 * s, 46 * s, 22 * s, '#ffffff', 'left');
      this.panel(ctx, 192 * s, 14 * s, 120 * s, 46 * s);
      this.outlinedText(ctx, me.k + ' kills', 204 * s, 46 * s, 22 * s, '#ffd75e', 'left');

      let ky = 90 * s;
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
      let ly = my + ms + 12 * s;
      if (view.lb && view.lb.length) {
        this.panel(ctx, mx, ly, ms, (view.lb.length * 20 + 34) * s);
        this.outlinedText(ctx, 'Leaderboard', mx + 10 * s, ly + 22 * s, 14 * s, '#ffffff', 'left');
        ly += 44 * s;
        view.lb.forEach((e, i) => {
          const col = e.i === view.you ? '#ffd75e' : '#ffffff';
          this.outlinedText(ctx, (i + 1) + '. ' + e.n, mx + 10 * s, ly, 13 * s, col, 'left');
          this.outlinedText(ctx, String(e.k), mx + ms - 10 * s, ly, 13 * s, col, 'right');
          ly += 20 * s;
        });
      }

      if (hud.alive || spectating) this.drawPlayerHUD(ctx, view, ui, hud, s);

      if (spectating && view.specName) {
        this.panel(ctx, W / 2 - 170 * s, 14 * s, 340 * s, 40 * s);
        this.outlinedText(ctx, 'Spectating ' + view.specName, W / 2, 42 * s, 18 * s, '#ffffff');
      }

      let ny = 120 * s;
      for (const n of ui.notices) {
        const age = this.time - n.t;
        if (age > 4) continue;
        ctx.globalAlpha = clamp(4 - age, 0, 1);
        this.outlinedText(ctx, n.txt, W / 2, ny, 24 * s, n.col || '#ffffff');
        ctx.globalAlpha = 1;
        ny += 34 * s;
      }

      if (ui.bigMap) {
        const bs = Math.min(W, H) * 0.84;
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
        this.drawMinimap(ctx, view, (W - bs) / 2, (H - bs) / 2, bs, 0);
        this.outlinedText(ctx, 'Press M to close the map', W / 2, (H + bs) / 2 + 28, 15, '#ffffff');
      }

      if (me.alive && !ui.bigMap && ui.mouseX != null) this.drawCrosshair(ctx, ui, me);
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
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.moveTo(tx(zo.x) + zo.r * k, ty(zo.y));
      ctx.arc(tx(zo.x), ty(zo.y), Math.max(0, zo.r * k), 0, TAU, true);
      ctx.fillStyle = 'rgba(220,40,40,0.4)';
      ctx.fill('evenodd');
      circle(ctx, tx(zo.x), ty(zo.y), zo.r * k);
      ctx.strokeStyle = '#e8352b';
      ctx.lineWidth = 2.5;
      ctx.stroke();
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
      for (let i = 0; i < n; i++) {
        const sl = hud.sl[i];
        const active = hud.act === i;
        const yy = active ? y - 6 * s : y;
        roundRect(ctx, x, yy, bw, bh, 12 * s);
        ctx.fillStyle = active ? 'rgba(255,255,255,0.32)' : 'rgba(30,30,28,0.55)';
        ctx.fill();
        if (active) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        this.outlinedText(ctx, String(i + 1), x + 12 * s, yy + 20 * s, 14 * s, '#ffffff');
        if (sl) {
          this.drawItemIcon(ctx, sl.t, x + bw / 2, yy + bh * 0.42, 0.85 * s);
          const name = D.WEAPONS[sl.t] ? D.WEAPONS[sl.t].name : sl.t === 'syringe' ? D.SYRINGE.name : sl.t;
          this.outlinedText(ctx, name, x + bw / 2, yy + bh - 10 * s, 12 * s, '#ffffff');
          if (sl.m != null) this.outlinedText(ctx, sl.m + '/' + D.WEAPONS[sl.t].mag, x + bw - 8 * s, yy + 20 * s, 12 * s, sl.m === 0 ? '#ff8a7a' : '#ffffff', 'right');
        } else {
          this.outlinedText(ctx, 'Fists', x + bw / 2, yy + bh / 2 + 6 * s, 13 * s, 'rgba(255,255,255,0.6)');
        }
        x += bw + gap;
      }

      const hbw = Math.max(total, 330 * s);
      const hx = W / 2 - hbw / 2;
      const hy = y - 52 * s;
      roundRect(ctx, hx, hy, hbw, 26 * s, 13 * s);
      fillStroke(ctx, '#3a3a38', 4);
      const hpf = clamp(hud.hp / D.MAX_HP, 0, 1);
      if (hpf > 0) {
        roundRect(ctx, hx + 3, hy + 3, (hbw - 6) * hpf, 26 * s - 6, 10 * s);
        ctx.fillStyle = hud.hp > 60 ? '#7ad35e' : hud.hp > 30 ? '#f0c043' : '#e8453b';
        ctx.fill();
      }
      this.outlinedText(ctx, Math.ceil(hud.hp) + ' / 100', W / 2, hy + 19 * s, 15 * s, '#ffffff');
      const sty = hy + 32 * s;
      roundRect(ctx, hx + hbw * 0.15, sty, hbw * 0.7, 9 * s, 4.5 * s);
      ctx.fillStyle = 'rgba(30,30,28,0.6)';
      ctx.fill();
      if (hud.st > 0) {
        roundRect(ctx, hx + hbw * 0.15, sty, hbw * 0.7 * clamp(hud.st / 100, 0, 1), 9 * s, 4.5 * s);
        ctx.fillStyle = '#62b8f0';
        ctx.fill();
      }
      const jx = hx + hbw * 0.15 - 30 * s;
      circle(ctx, jx, sty + 4.5 * s, 11 * s);
      ctx.fillStyle = hud.jc > 0 ? 'rgba(30,30,28,0.6)' : 'rgba(98,184,240,0.85)';
      ctx.fill();
      if (hud.jc > 0) {
        ctx.beginPath();
        ctx.moveTo(jx, sty + 4.5 * s);
        ctx.arc(jx, sty + 4.5 * s, 11 * s, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - hud.jc));
        ctx.closePath();
        ctx.fillStyle = 'rgba(98,184,240,0.6)';
        ctx.fill();
      }
      this.outlinedText(ctx, 'J', jx, sty + 9.5 * s, 12 * s, '#ffffff');

      const me = view.me;
      if (me.alive && me.pr && !ui.bigMap) {
        this.outlinedText(ctx, '[F]  ' + me.pr, W / 2, hy - 18 * s, 18 * s, '#ffffff');
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
        this.outlinedText(ctx, 'Healing', cx, cy + 6 * s, 14 * s, '#ffffff');
      }
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

  globalThis.PF_Renderer = Renderer;
})();
