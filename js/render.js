(function () {
  'use strict';
  const D = globalThis.PF_DATA;
  const TAU = Math.PI * 2;
  const PR = D.PLAYER_R;
  const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";

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
    ctx.arc(x, y, r, 0, TAU);
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

  const VEST_COL = ['', '#8a9468', '#56623e', '#2c3128'];
  const HELM_COL = ['', '#7f8b5a', '#4c5838', '#25292a'];
  const PACK_COL = ['', '#8a6a44', '#6f5634', '#4f4026'];
  const JEEP_COL = ['#5d6b3b', '#7b2f2c', '#2f4b6d', '#a68f5d'];
  const BIKE_COL = ['#d0652a', '#2f8fbf', '#c8b13a', '#7a3fa0'];
  const DEBRIS = { tree: '#6b4a2b', rock: '#8b8f93', crate: '#a9783f', mcrate: '#5a6b3c', bush: '#3f7d34', barrel: '#b33a2c', wall: '#4a3e35', vehicle: '#555555' };
  const TRACER = { pistol: 70, smg: 70, shotgun: 45, rifle: 110, dmr: 150, sniper: 220, lmg: 110 };
  const TRACER_W = { pistol: 2, smg: 2, shotgun: 2, rifle: 2.5, dmr: 3, sniper: 3.5, lmg: 2.5 };

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
      this.decals = [];
      this.fx = [];
      this.dmgNums = [];
      this.flash = new Map();
      this.roofAlpha = new Map();
      this.time = 0;
      this.shake = 0;
      this.hitMarkT = -10;
      this.hurtT = -10;
      this.shapeCache = new Map();
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
      const S = 512;
      c.width = S;
      c.height = S;
      const g = c.getContext('2d');
      g.fillStyle = '#7aa04f';
      g.fillRect(0, 0, S, S);
      const put = (fn) => {
        for (const ox of [-S, 0, S]) {
          for (const oy of [-S, 0, S]) fn(ox, oy);
        }
      };
      for (let i = 0; i < 40; i++) {
        const x = rnd(1, i) * S;
        const y = rnd(2, i) * S;
        const r = 30 + rnd(3, i) * 70;
        const col = rnd(4, i) < 0.5 ? 'rgba(60,100,40,0.08)' : 'rgba(150,180,90,0.07)';
        put((ox, oy) => {
          g.fillStyle = col;
          circle(g, x + ox, y + oy, r);
          g.fill();
        });
      }
      for (let i = 0; i < 1400; i++) {
        const x = rnd(5, i) * S;
        const y = rnd(6, i) * S;
        const t = rnd(7, i);
        g.fillStyle = t < 0.45 ? '#6e9545' : t < 0.9 ? '#86ad5a' : '#9ab968';
        g.fillRect(x, y, 2 + rnd(8, i) * 2, 2 + rnd(9, i) * 2);
      }
      g.strokeStyle = 'rgba(70,110,45,0.55)';
      g.lineWidth = 1.5;
      for (let i = 0; i < 160; i++) {
        const x = rnd(10, i) * S;
        const y = rnd(11, i) * S;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x - 3, y - 7);
        g.moveTo(x + 2, y);
        g.lineTo(x + 3, y - 8);
        g.moveTo(x + 4, y);
        g.lineTo(x + 8, y - 6);
        g.stroke();
      }
      for (let i = 0; i < 26; i++) {
        const x = rnd(12, i) * S;
        const y = rnd(13, i) * S;
        g.fillStyle = rnd(14, i) < 0.5 ? '#e8e2c8' : '#e6c64a';
        circle(g, x, y, 2.2);
        g.fill();
      }
      return this.ctx.createPattern(c, 'repeat');
    }

    setMap(map) {
      this.map = map;
      this.particles.length = 0;
      this.decals.length = 0;
      this.fx.length = 0;
      this.dmgNums.length = 0;
      this.flash.clear();
      this.roofAlpha.clear();
      this.shapeCache.clear();
      this.zoom = 0;
      this.mini = this.renderMiniMap(map, 640);
    }

    renderMiniMap(map, size) {
      const c = document.createElement('canvas');
      c.width = size;
      c.height = size;
      const g = c.getContext('2d');
      const s = size / map.size;
      g.fillStyle = '#76a04c';
      g.fillRect(0, 0, size, size);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const road of map.roads) {
        g.strokeStyle = '#b8a072';
        g.lineWidth = Math.max(2, road.w * s);
        g.beginPath();
        road.pts.forEach((p, i) => (i ? g.lineTo(p[0] * s, p[1] * s) : g.moveTo(p[0] * s, p[1] * s)));
        g.stroke();
      }
      g.strokeStyle = '#3d7ea6';
      g.lineWidth = map.river.w * s;
      g.beginPath();
      map.river.pts.forEach((p, i) => (i ? g.lineTo(p[0] * s, p[1] * s) : g.moveTo(p[0] * s, p[1] * s)));
      g.stroke();
      for (const b of map.bridges) {
        g.save();
        g.translate(b.x * s, b.y * s);
        g.rotate(b.a);
        g.fillStyle = '#8a6a45';
        g.fillRect((-b.len / 2) * s, (-b.w / 2) * s, b.len * s, b.w * s);
        g.restore();
      }
      for (const o of map.obstacles) {
        if (o.k === 'tree') {
          g.fillStyle = 'rgba(40,85,40,0.75)';
          circle(g, o.x * s, o.y * s, Math.max(1.2, o.cr * s));
          g.fill();
        } else if (o.k === 'rock') {
          g.fillStyle = '#8b8f93';
          circle(g, o.x * s, o.y * s, Math.max(1, o.r * s));
          g.fill();
        }
      }
      for (const b of map.buildings) {
        g.fillStyle = D.ROOFS[b.roof];
        if (b.type === 'warehouse') g.fillStyle = '#5f6a74';
        g.fillRect((b.x - b.w / 2) * s, (b.y - b.h / 2) * s, b.w * s, b.h * s);
      }
      return c;
    }

    // ---------- events / particles ----------

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
          if (e.w !== 'shotgun') {
            const a = e.a + Math.PI / 2;
            this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 120 + (Math.random() - 0.5) * 60, vy: Math.sin(a) * 120 + (Math.random() - 0.5) * 60, life: 0.5, max: 0.5, size: 3, color: '#d9b440', kind: 2, rot: e.a, vr: 14 });
          }
          if (e.i === myId) this.shake = Math.max(this.shake, e.w === 'sniper' ? 6 : e.w === 'shotgun' ? 5 : 1.5);
          break;
        case 'hit':
          if (e.ty === 'p') {
            this.addParticles(e.x, e.y, 6, '#a3201b', 160, 0.45, 4);
            if (e.by === myId) this.hitMarkT = this.time;
          } else if (e.ty === 'o') {
            this.addParticles(e.x, e.y, 4, DEBRIS[e.k] || '#777', 140, 0.4, 3.5);
          } else {
            this.addParticles(e.x, e.y, 5, '#ffd36b', 260, 0.25, 2.5);
          }
          break;
        case 'dmg':
          if (e.i === myId) this.hurtT = this.time;
          if (e.by === myId && e.i !== myId && e.n > 0) this.dmgNums.push({ x: e.x + (Math.random() - 0.5) * 20, y: e.y - 30, n: e.n, t: this.time });
          break;
        case 'break':
          this.addParticles(e.x, e.y, 18, DEBRIS[e.k] || '#777', 260, 0.8, 7, 1);
          break;
        case 'exp': {
          this.fx.push({ x: e.x, y: e.y, r: e.r, t: this.time });
          this.addParticles(e.x, e.y, 16, '#5b5b5b', 120, 1.6, 26, 3);
          this.addParticles(e.x, e.y, 12, '#ffb347', 380, 0.4, 5);
          this.decals.push({ x: e.x, y: e.y, r: e.r * 0.45, v: Math.random() });
          if (this.decals.length > 40) this.decals.shift();
          const d = Math.hypot(e.x - camX, e.y - camY);
          this.shake = Math.max(this.shake, clamp(22 - d / 50, 0, 20));
          break;
        }
        case 'kill':
          this.addParticles(e.x, e.y, 14, '#8f1b16', 200, 0.7, 6);
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
        const drag = p.kind === 3 ? 1.5 : 4;
        const k = Math.exp(-drag * dt);
        p.vx *= k;
        p.vy *= k;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      if (ps.length > 900) ps.splice(0, ps.length - 900);
      for (let i = this.fx.length - 1; i >= 0; i--) {
        if (this.time - this.fx[i].t > 0.6) this.fx.splice(i, 1);
      }
      for (let i = this.dmgNums.length - 1; i >= 0; i--) {
        if (this.time - this.dmgNums[i].t > 0.9) this.dmgNums.splice(i, 1);
      }
    }

    // ---------- main draw ----------

    computeZoom(scope, veh) {
      const vh = D.VIEW_H[scope] * (veh ? 1.2 : 1);
      return Math.max(this.H / vh, this.W / (vh * D.MAX_ASPECT));
    }

    draw(view, ui, dt) {
      this.time += dt;
      const ctx = this.ctx;
      const map = this.map;
      if (!map || !view) return;
      this.updateParticles(dt);
      const target = this.computeZoom(view.csc, view.cveh);
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
      ctx.fillStyle = '#22331d';
      ctx.fillRect(0, 0, W, H);
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - this.camX * z + sx), dpr * (H / 2 - this.camY * z + sy));
      const vw = W / z;
      const vh = H / z;
      const x0 = this.camX - vw / 2 - 40;
      const y0 = this.camY - vh / 2 - 40;
      const x1 = this.camX + vw / 2 + 40;
      const y1 = this.camY + vh / 2 + 40;
      const vis = (x, y, r) => x + r > x0 && x - r < x1 && y + r > y0 && y - r < y1;
      this.vis = vis;

      ctx.fillStyle = this.groundPattern;
      ctx.fillRect(Math.max(0, x0), Math.max(0, y0), Math.min(map.size, x1) - Math.max(0, x0), Math.min(map.size, y1) - Math.max(0, y0));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, map.size, map.size);
      ctx.clip();
      this.drawRoads(ctx);
      this.drawRiver(ctx);
      this.drawBridges(ctx, vis);
      ctx.restore();

      const camInside = this.buildingAt(this.camX, this.camY);
      for (const b of map.buildings) {
        if (vis(b.x, b.y, Math.max(b.w, b.h))) this.drawFloor(ctx, b);
      }
      for (const d of this.decals) {
        if (!vis(d.x, d.y, d.r)) continue;
        const gr = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
        gr.addColorStop(0, 'rgba(25,20,15,0.55)');
        gr.addColorStop(1, 'rgba(25,20,15,0)');
        ctx.fillStyle = gr;
        circle(ctx, d.x, d.y, d.r);
        ctx.fill();
      }
      for (const l of view.lo) {
        if (vis(l.x, l.y, 30)) this.drawLoot(ctx, l);
      }
      const visibleObs = [];
      for (const o of map.obstacles) {
        if (o.dead) continue;
        const ext = o.k === 'tree' ? o.cr : o.s === 'c' ? o.r : Math.max(o.hw, o.hh);
        if (vis(o.x, o.y, ext)) visibleObs.push(o);
      }
      for (const p of view.pl) {
        if (p.d) this.drawBody(ctx, p);
      }
      for (const o of visibleObs) {
        if (o.k === 'rock') this.drawRock(ctx, o);
        else if (o.k === 'crate' || o.k === 'mcrate') this.drawCrate(ctx, o);
        else if (o.k === 'barrel') this.drawBarrel(ctx, o);
        else if (o.k === 'wall') this.drawWall(ctx, o);
        else if (o.k === 'tree') this.drawTrunk(ctx, o);
      }
      const plMap = new Map();
      for (const p of view.pl) plMap.set(p.i, p);
      for (const v of view.ve) this.drawVehicle(ctx, v, plMap);
      for (const g of view.gr) this.drawGrenade(ctx, g);
      for (const p of view.pl) {
        if (p.d || p.veh) continue;
        const aim = p.i === view.you && ui.aim != null && view.me.alive ? ui.aim : p.a;
        this.drawPlayer(ctx, p, aim, p.i !== view.you);
      }
      this.drawBullets(ctx, view.bu);
      this.drawParticles(ctx, vis, false);
      const me = view.pl.find(p => p.i === view.cam);
      const camX = me ? me.x : this.camX;
      const camY = me ? me.y : this.camY;
      for (const o of visibleObs) {
        if (o.k === 'bush') {
          const inside = Math.hypot(camX - o.x, camY - o.y) < o.r + PR * 0.5;
          this.drawBush(ctx, o, inside ? 0.55 : 0.96);
        }
      }
      for (const o of visibleObs) {
        if (o.k === 'tree') {
          const inside = Math.hypot(camX - o.x, camY - o.y) < o.cr + PR;
          this.drawCanopy(ctx, o, inside ? 0.42 : 0.94);
        }
      }
      for (const b of map.buildings) {
        if (!vis(b.x, b.y, Math.max(b.w, b.h))) continue;
        const tgt = camInside === b ? 0 : 1;
        let a = this.roofAlpha.get(b.id);
        if (a == null) a = tgt;
        a = lerp(a, tgt, Math.min(1, dt * 8));
        this.roofAlpha.set(b.id, a);
        if (a > 0.02) this.drawRoof(ctx, b, a);
      }
      this.drawParticles(ctx, vis, true);
      this.drawExplosions(ctx);
      this.drawDamageNumbers(ctx);
      this.drawZone(ctx, view.zo, x0, y0, x1, y1);
      for (const p of view.pl) {
        if (p.d || p.veh || p.i === view.you || !p.hu) continue;
        if (p.bu && p.i !== view.cam) continue;
        const b = this.buildingAt(p.x, p.y);
        if (b && b !== camInside) continue;
        ctx.font = 'bold 13px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(p.n, p.x + 1, p.y + PR + 19);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(p.n, p.x, p.y + PR + 18);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ui.noHud) this.drawHUD(ctx, view, ui);
    }

    buildingAt(x, y) {
      for (const b of this.map.buildings) {
        if (Math.abs(x - b.x) < b.w / 2 && Math.abs(y - b.y) < b.h / 2) return b;
      }
      return null;
    }

    strokePath(ctx, pts) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        if (i) ctx.lineTo(pts[i][0], pts[i][1]);
        else ctx.moveTo(pts[i][0], pts[i][1]);
      }
      ctx.stroke();
    }

    drawRoads(ctx) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const r of this.map.roads) {
        ctx.strokeStyle = '#97804f';
        ctx.lineWidth = r.w + 14;
        this.strokePath(ctx, r.pts);
      }
      for (const r of this.map.roads) {
        ctx.strokeStyle = '#b9a173';
        ctx.lineWidth = r.w;
        this.strokePath(ctx, r.pts);
        ctx.strokeStyle = 'rgba(205,188,145,0.55)';
        ctx.lineWidth = r.w * 0.42;
        this.strokePath(ctx, r.pts);
      }
    }

    drawRiver(ctx) {
      const rv = this.map.river;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#c9b47b';
      ctx.lineWidth = rv.w + 46;
      this.strokePath(ctx, rv.pts);
      ctx.strokeStyle = '#8f8b5d';
      ctx.lineWidth = rv.w + 14;
      this.strokePath(ctx, rv.pts);
      ctx.strokeStyle = '#3e7fa7';
      ctx.lineWidth = rv.w;
      this.strokePath(ctx, rv.pts);
      ctx.strokeStyle = '#356f95';
      ctx.lineWidth = rv.w * 0.5;
      this.strokePath(ctx, rv.pts);
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth = 3;
      ctx.setLineDash([26, 70]);
      ctx.lineDashOffset = -this.time * 40;
      this.strokePath(ctx, rv.pts);
      ctx.setLineDash([]);
    }

    drawBridges(ctx, vis) {
      for (const b of this.map.bridges) {
        if (!vis(b.x, b.y, b.len)) continue;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.a);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(-b.len / 2 + 6, -b.w / 2 + 8, b.len, b.w);
        ctx.fillStyle = '#8b6a44';
        ctx.fillRect(-b.len / 2, -b.w / 2, b.len, b.w);
        ctx.strokeStyle = '#6e5233';
        ctx.lineWidth = 2;
        for (let x = -b.len / 2 + 16; x < b.len / 2; x += 18) {
          ctx.beginPath();
          ctx.moveTo(x, -b.w / 2);
          ctx.lineTo(x, b.w / 2);
          ctx.stroke();
        }
        ctx.fillStyle = '#5a4128';
        ctx.fillRect(-b.len / 2, -b.w / 2 - 4, b.len, 9);
        ctx.fillRect(-b.len / 2, b.w / 2 - 5, b.len, 9);
        ctx.restore();
      }
    }

    drawFloor(ctx, b) {
      const x = b.x - b.w / 2;
      const y = b.y - b.h / 2;
      const col = D.FLOORS[b.floor];
      ctx.fillStyle = col;
      ctx.fillRect(x, y, b.w, b.h);
      ctx.strokeStyle = shade(col, -0.18);
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (b.floor === 0 || b.floor === 2) {
        for (let yy = y + 20; yy < y + b.h; yy += 20) {
          ctx.moveTo(x, yy);
          ctx.lineTo(x + b.w, yy);
        }
        for (let yy = y, row = 0; yy < y + b.h; yy += 20, row++) {
          for (let xx = x + ((row * 37) % 90); xx < x + b.w; xx += 90) {
            ctx.moveTo(xx, yy);
            ctx.lineTo(xx, Math.min(yy + 20, y + b.h));
          }
        }
      } else {
        const step = b.floor === 1 ? 32 : 64;
        for (let xx = x + step; xx < x + b.w; xx += step) {
          ctx.moveTo(xx, y);
          ctx.lineTo(xx, y + b.h);
        }
        for (let yy = y + step; yy < y + b.h; yy += step) {
          ctx.moveTo(x, yy);
          ctx.lineTo(x + b.w, yy);
        }
      }
      ctx.stroke();
    }

    drawRoof(ctx, b, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const m = 8;
      const x = b.x - b.w / 2 - m;
      const y = b.y - b.h / 2 - m;
      const w = b.w + m * 2;
      const h = b.h + m * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(x + 10, y + 12, w, h);
      if (b.type === 'warehouse') {
        ctx.fillStyle = '#66717c';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#56606a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (let xx = x + 14; xx < x + w; xx += 18) {
          ctx.moveTo(xx, y);
          ctx.lineTo(xx, y + h);
        }
        ctx.stroke();
        ctx.fillStyle = '#7b8792';
        ctx.fillRect(x + w * 0.2, y + h * 0.3, 60, 40);
        ctx.fillRect(x + w * 0.65, y + h * 0.55, 60, 40);
        ctx.strokeStyle = '#4a535c';
        ctx.lineWidth = 6;
        ctx.strokeRect(x, y, w, h);
      } else {
        const col = D.ROOFS[b.roof];
        const horiz = b.w >= b.h;
        ctx.fillStyle = shade(col, 0.08);
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = shade(col, -0.18);
        if (horiz) ctx.fillRect(x, y + h / 2, w, h / 2);
        else ctx.fillRect(x + w / 2, y, w / 2, h);
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (horiz) {
          for (let yy = y + 16; yy < y + h; yy += 16) {
            ctx.moveTo(x, yy);
            ctx.lineTo(x + w, yy);
          }
        } else {
          for (let xx = x + 16; xx < x + w; xx += 16) {
            ctx.moveTo(xx, y);
            ctx.lineTo(xx, y + h);
          }
        }
        ctx.stroke();
        ctx.strokeStyle = shade(col, -0.4);
        ctx.lineWidth = 6;
        ctx.beginPath();
        if (horiz) {
          ctx.moveTo(x + 8, y + h / 2);
          ctx.lineTo(x + w - 8, y + h / 2);
        } else {
          ctx.moveTo(x + w / 2, y + 8);
          ctx.lineTo(x + w / 2, y + h - 8);
        }
        ctx.stroke();
        if (b.id % 3 !== 0) {
          const cx = horiz ? x + w * (0.25 + (b.id % 5) * 0.1) : x + w * 0.28;
          const cy = horiz ? y + h * 0.28 : y + h * (0.25 + (b.id % 5) * 0.1);
          ctx.fillStyle = '#6d5f57';
          ctx.fillRect(cx - 14, cy - 14, 28, 28);
          ctx.fillStyle = '#2e2724';
          ctx.fillRect(cx - 8, cy - 8, 16, 16);
        }
        ctx.strokeStyle = shade(col, -0.45);
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
    }

    hpScale(o, min) {
      if (!o.mhp) return 1;
      return min + (1 - min) * clamp(o.hp / o.mhp, 0, 1);
    }

    rockShape(o) {
      let s = this.shapeCache.get(o.id);
      if (s) return s;
      s = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(o.v, i) * 0.4;
        const r = 0.82 + rnd(o.v, i + 20) * 0.26;
        s.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      this.shapeCache.set(o.id, s);
      return s;
    }

    polyPath(ctx, pts, x, y, r) {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const px = x + pts[i][0] * r;
        const py = y + pts[i][1] * r;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
    }

    drawRock(ctx, o) {
      const r = o.r * this.hpScale(o, 0.6);
      const s = this.rockShape(o);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      this.polyPath(ctx, s, o.x + 4, o.y + 5, r);
      ctx.fill();
      ctx.fillStyle = '#868b90';
      this.polyPath(ctx, s, o.x, o.y, r);
      ctx.fill();
      ctx.strokeStyle = '#5b5f63';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.fillStyle = '#a2a7ab';
      this.polyPath(ctx, s, o.x - r * 0.16, o.y - r * 0.18, r * 0.55);
      ctx.fill();
      ctx.strokeStyle = 'rgba(70,72,75,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(o.x + r * 0.1, o.y + r * 0.1);
      ctx.lineTo(o.x + r * 0.45, o.y + r * 0.3);
      ctx.lineTo(o.x + r * 0.55, o.y + r * 0.6);
      ctx.stroke();
    }

    drawCrate(ctx, o) {
      const k = this.hpScale(o, 0.72);
      const hw = o.hw * k;
      const mil = o.k === 'mcrate';
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(o.x - hw + 5, o.y - hw + 6, hw * 2, hw * 2);
      ctx.fillStyle = mil ? '#5a6b3c' : '#a9783f';
      ctx.fillRect(o.x - hw, o.y - hw, hw * 2, hw * 2);
      ctx.strokeStyle = mil ? '#3d4a28' : '#7a5228';
      ctx.lineWidth = 5;
      ctx.strokeRect(o.x - hw + 2.5, o.y - hw + 2.5, hw * 2 - 5, hw * 2 - 5);
      if (mil) {
        ctx.fillStyle = '#d1b64a';
        ctx.fillRect(o.x - hw + 5, o.y - 5, hw * 2 - 10, 10);
        ctx.fillStyle = '#e9e6d6';
        circle(ctx, o.x, o.y, 5);
        ctx.fill();
      } else {
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(o.x - hw + 5, o.y - hw + 5);
        ctx.lineTo(o.x + hw - 5, o.y + hw - 5);
        ctx.moveTo(o.x + hw - 5, o.y - hw + 5);
        ctx.lineTo(o.x - hw + 5, o.y + hw - 5);
        ctx.stroke();
      }
    }

    drawBarrel(ctx, o) {
      const r = o.r * this.hpScale(o, 0.8);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      circle(ctx, o.x + 4, o.y + 5, r);
      ctx.fill();
      ctx.fillStyle = '#b33a2c';
      circle(ctx, o.x, o.y, r);
      ctx.fill();
      ctx.strokeStyle = '#7a2219';
      ctx.lineWidth = 3;
      ctx.stroke();
      circle(ctx, o.x, o.y, r * 0.68);
      ctx.stroke();
      ctx.fillStyle = '#e0c040';
      ctx.beginPath();
      ctx.moveTo(o.x, o.y - r * 0.38);
      ctx.lineTo(o.x + r * 0.34, o.y + r * 0.24);
      ctx.lineTo(o.x - r * 0.34, o.y + r * 0.24);
      ctx.closePath();
      ctx.fill();
    }

    drawWall(ctx, o) {
      const wh = o.b >= 0 && this.map.buildings[o.b] && this.map.buildings[o.b].type === 'warehouse';
      ctx.fillStyle = wh ? '#4f555c' : '#4a3d33';
      ctx.fillRect(o.x - o.hw, o.y - o.hh, o.hw * 2, o.hh * 2);
      ctx.strokeStyle = wh ? '#3a3f45' : '#33291f';
      ctx.lineWidth = 2;
      ctx.strokeRect(o.x - o.hw + 1, o.y - o.hh + 1, o.hw * 2 - 2, o.hh * 2 - 2);
    }

    drawTrunk(ctx, o) {
      ctx.fillStyle = '#5b3d24';
      circle(ctx, o.x, o.y, o.r);
      ctx.fill();
      ctx.strokeStyle = '#3e2916';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    starPath(ctx, x, y, n, ro, ri, rot) {
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? ri : ro;
        const a = rot + (i / (n * 2)) * TAU;
        if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      ctx.closePath();
    }

    drawCanopy(ctx, o, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      const cr = o.cr;
      const rot = rnd(o.v, 1) * TAU;
      if (o.v % 3 !== 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        this.starPath(ctx, o.x + 10, o.y + 12, 13, cr, cr * 0.8, rot);
        ctx.fill();
        const cols = ['#254d2a', '#2f6334', '#3b7a3f', '#4b8f4b'];
        const sizes = [1, 0.78, 0.55, 0.3];
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = cols[i];
          this.starPath(ctx, o.x, o.y, 13 - i * 2, cr * sizes[i], cr * sizes[i] * 0.8, rot + i * 0.4);
          ctx.fill();
        }
      } else {
        const autumn = o.v % 4 === 0;
        const base = autumn ? (o.v % 8 === 0 ? '#b8792c' : '#c25a2c') : '#3b7a33';
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        circle(ctx, o.x + 10, o.y + 12, cr);
        ctx.fill();
        ctx.fillStyle = shade(base, -0.3);
        circle(ctx, o.x, o.y, cr);
        ctx.fill();
        ctx.fillStyle = base;
        for (let i = 0; i < 7; i++) {
          const a = rot + (i / 7) * TAU;
          circle(ctx, o.x + Math.cos(a) * cr * 0.5, o.y + Math.sin(a) * cr * 0.5, cr * 0.45);
          ctx.fill();
        }
        ctx.fillStyle = shade(base, 0.15);
        circle(ctx, o.x - cr * 0.12, o.y - cr * 0.12, cr * 0.42);
        ctx.fill();
      }
      ctx.restore();
    }

    drawBush(ctx, o, alpha) {
      const r = o.r * this.hpScale(o, 0.65);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#2f6a2b';
      circle(ctx, o.x, o.y, r);
      ctx.fill();
      ctx.fillStyle = '#3f8137';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + rnd(o.v, 3);
        circle(ctx, o.x + Math.cos(a) * r * 0.48, o.y + Math.sin(a) * r * 0.48, r * 0.5);
        ctx.fill();
      }
      ctx.fillStyle = '#52983f';
      circle(ctx, o.x - r * 0.15, o.y - r * 0.15, r * 0.45);
      ctx.fill();
      if (o.v % 4 === 0) {
        ctx.fillStyle = '#c23a3a';
        for (let i = 0; i < 6; i++) {
          circle(ctx, o.x + (rnd(o.v, i + 5) - 0.5) * r * 1.3, o.y + (rnd(o.v, i + 15) - 0.5) * r * 1.3, 3.5);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // ---------- items ----------

    drawGunShape(ctx, w, x, y, scale) {
      const W = D.WEAPONS[w];
      const len = W.len * scale;
      const wid = W.wid * scale;
      ctx.fillStyle = W.color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - len / 2, y - wid / 2, len, wid);
      ctx.strokeRect(x - len / 2, y - wid / 2, len, wid);
      if (w !== 'pistol') {
        ctx.fillRect(x - len / 2 - 4 * scale, y - wid / 2, 8 * scale, wid + 6 * scale);
      }
      ctx.fillRect(x - len * 0.1, y + wid / 2, 5 * scale, 6 * scale);
      if (w === 'sniper' || w === 'dmr') {
        ctx.fillStyle = '#111';
        ctx.fillRect(x - len * 0.15, y - wid / 2 - 4 * scale, len * 0.3, 4 * scale);
      }
      if (w === 'shotgun') {
        ctx.fillStyle = '#8a5a30';
        ctx.fillRect(x - len / 2, y - wid / 2, len * 0.35, wid);
      }
    }

    drawLoot(ctx, l) {
      const k = l.k;
      const rar = PF_SIM.itemRarity(k, l.it);
      ctx.fillStyle = 'rgba(20,24,20,0.5)';
      circle(ctx, l.x, l.y, 19);
      ctx.fill();
      ctx.strokeStyle = D.RARITY[rar];
      ctx.lineWidth = 2.5;
      ctx.stroke();
      const x = l.x;
      const y = l.y;
      if (k === 'gun') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.5);
        this.drawGunShape(ctx, l.it, 0, 0, 30 / Math.max(30, D.WEAPONS[l.it].len));
        ctx.restore();
      } else if (k === 'melee') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-0.7);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(-12, -2, 24, 4);
        ctx.fillStyle = '#b8bec4';
        ctx.fillRect(6, -8, 8, 9);
        ctx.restore();
      } else if (k === 'ammo') {
        const col = D.AMMO[l.it].color;
        for (let i = -1; i <= 1; i++) {
          ctx.fillStyle = col;
          roundRect(ctx, x + i * 7 - 2.5, y - 8, 5, 16, 2.5);
          ctx.fill();
          ctx.fillStyle = '#c9a24a';
          ctx.fillRect(x + i * 7 - 2.5, y + 2, 5, 6);
        }
      } else if (k === 'heal') {
        if (l.it === 'bandage') {
          ctx.fillStyle = '#efe8d8';
          roundRect(ctx, x - 11, y - 6, 22, 12, 3);
          ctx.fill();
          ctx.fillStyle = '#d8c2a0';
          ctx.fillRect(x - 4, y - 6, 8, 12);
        } else if (l.it === 'medkit') {
          ctx.fillStyle = '#f2f2f2';
          roundRect(ctx, x - 11, y - 9, 22, 18, 3);
          ctx.fill();
          ctx.fillStyle = '#d03a32';
          ctx.fillRect(x - 2.5, y - 6.5, 5, 13);
          ctx.fillRect(x - 6.5, y - 2.5, 13, 5);
        } else {
          ctx.fillStyle = '#2d7fc1';
          roundRect(ctx, x - 6, y - 11, 12, 22, 3);
          ctx.fill();
          ctx.fillStyle = '#f2b233';
          ctx.fillRect(x - 6, y - 3, 12, 6);
        }
      } else if (k === 'frag') {
        ctx.fillStyle = '#3f5f30';
        circle(ctx, x, y + 2, 8);
        ctx.fill();
        ctx.fillStyle = '#9aa0a4';
        ctx.fillRect(x - 2, y - 10, 4, 6);
      } else if (k === 'vest') {
        ctx.fillStyle = VEST_COL[l.it];
        roundRect(ctx, x - 10, y - 11, 20, 22, 5);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x - 1, y - 11, 2, 22);
      } else if (k === 'helmet') {
        ctx.fillStyle = HELM_COL[l.it];
        circle(ctx, x, y, 11);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        circle(ctx, x - 3, y - 3, 4);
        ctx.fill();
      } else if (k === 'pack') {
        ctx.fillStyle = PACK_COL[l.it];
        roundRect(ctx, x - 10, y - 10, 20, 20, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x - 7, y - 2, 14, 3);
      } else if (k === 'scope') {
        ctx.strokeStyle = '#e8e8e8';
        ctx.lineWidth = 2;
        circle(ctx, x, y, 9);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 9, y);
        ctx.lineTo(x + 9, y);
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x, y + 9);
        ctx.stroke();
      }
      if (k === 'vest' || k === 'helmet' || k === 'pack' || k === 'scope') {
        ctx.font = 'bold 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(k === 'scope' ? D.SCOPES[l.it] + 'x' : String(l.it), x + 12, y + 17);
      } else if (l.c > 1) {
        ctx.font = 'bold 10px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        ctx.fillText(String(l.c), x + 12, y + 17);
      }
    }

    // ---------- actors ----------

    drawBody(ctx, p) {
      ctx.fillStyle = 'rgba(120,20,15,0.45)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 30, 22, 0.4, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5e5e5e';
      circle(ctx, p.x, p.y, 13);
      ctx.fill();
      ctx.strokeStyle = '#d6d6d6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.x - 5, p.y - 5);
      ctx.lineTo(p.x + 5, p.y + 5);
      ctx.moveTo(p.x + 5, p.y - 5);
      ctx.lineTo(p.x - 5, p.y + 5);
      ctx.stroke();
    }

    hand(ctx, x, y, skin) {
      ctx.fillStyle = skin;
      circle(ctx, x, y, 7.5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    drawPlayer(ctx, p, aim, other) {
      const skin = D.SKINS[p.sk] || D.SKINS[0];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      circle(ctx, 3, 5, PR + 1);
      ctx.fill();
      ctx.rotate(aim);
      if (p.b) {
        ctx.fillStyle = PACK_COL[p.b];
        circle(ctx, -PR * 0.62, 0, 9 + p.b * 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const w = p.w;
      const W = D.WEAPONS[w];
      const sw = p.sw || 0;
      const prog = sw ? Math.sin((1 - Math.abs(sw)) * Math.PI) : 0;
      const side = sw >= 0 ? 1 : -1;
      if (W && w !== 'pistol') {
        const gx = PR * 0.35;
        ctx.fillStyle = W.color;
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.fillRect(gx, -W.wid / 2, W.len, W.wid);
        ctx.strokeRect(gx, -W.wid / 2, W.len, W.wid);
        if (w === 'shotgun') {
          ctx.fillStyle = '#8a5a30';
          ctx.fillRect(gx + W.len * 0.35, -W.wid / 2, W.len * 0.25, W.wid);
        }
      }
      ctx.fillStyle = skin;
      circle(ctx, 0, 0, PR);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (p.v) {
        ctx.strokeStyle = VEST_COL[p.v];
        ctx.lineWidth = 6;
        circle(ctx, 0, 0, PR - 3);
        ctx.stroke();
      }
      if (p.h) {
        ctx.fillStyle = HELM_COL[p.h];
        circle(ctx, -2, 0, PR * 0.62);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        circle(ctx, -6, -4, 4);
        ctx.fill();
      }
      if (p.hit) {
        ctx.fillStyle = 'rgba(255,40,30,0.4)';
        circle(ctx, 0, 0, PR);
        ctx.fill();
      }
      if (W) {
        if (w === 'pistol') {
          ctx.fillStyle = W.color;
          ctx.strokeStyle = '#111';
          ctx.lineWidth = 2;
          ctx.fillRect(PR - 2, -W.wid / 2, W.len, W.wid);
          ctx.strokeRect(PR - 2, -W.wid / 2, W.len, W.wid);
          this.hand(ctx, PR, 4, skin);
          this.hand(ctx, PR + 1, -4, skin);
        } else {
          const gx = PR * 0.35;
          this.hand(ctx, PR * 0.8, 3, skin);
          this.hand(ctx, gx + W.len * 0.55, -2, skin);
        }
        const ft = this.flash.get(p.i);
        if (ft != null && this.time - ft < 0.06) {
          const tip = w === 'pistol' ? PR - 2 + W.len : PR * 0.35 + W.len;
          ctx.fillStyle = 'rgba(255,220,120,0.9)';
          this.starPath(ctx, tip + 8, 0, 5, 12, 5, this.time * 50);
          ctx.fill();
        }
      } else if (w === 'hatchet') {
        ctx.save();
        ctx.rotate(-prog * 1.1);
        ctx.fillStyle = '#7a5530';
        ctx.fillRect(PR * 0.7, PR * 0.55 - 2, 38, 5);
        ctx.fillStyle = '#b8bec4';
        ctx.fillRect(PR * 0.7 + 28, PR * 0.55 - 12, 10, 12);
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(PR * 0.7 + 28, PR * 0.55 - 12, 10, 12);
        this.hand(ctx, PR * 0.75, PR * 0.6, skin);
        ctx.restore();
        this.hand(ctx, PR * 0.72, -PR * 0.62, skin);
      } else if (w === 'frag') {
        this.hand(ctx, PR * 0.72, -PR * 0.62, skin);
        ctx.fillStyle = '#3f5f30';
        circle(ctx, PR * 0.95, PR * 0.62, 7);
        ctx.fill();
        this.hand(ctx, PR * 0.8, PR * 0.62, skin);
      } else {
        const ext = prog * PR * 0.8;
        this.hand(ctx, PR * 0.72 + (side > 0 ? ext : 0), PR * 0.62 - (side > 0 ? prog * 8 : 0), skin);
        this.hand(ctx, PR * 0.72 + (side < 0 ? ext : 0), -PR * 0.62 + (side < 0 ? prog * 8 : 0), skin);
      }
      ctx.restore();
      if (p.ac) {
        ctx.strokeStyle = 'rgba(120,230,120,0.9)';
        ctx.lineWidth = 3;
        circle(ctx, p.x, p.y, PR + 7);
        ctx.setLineDash([6, 6]);
        ctx.lineDashOffset = -this.time * 30;
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawVehicle(ctx, v, plMap) {
      if (!this.vis(v.x, v.y, 80)) return;
      const V = D.VEHICLES[v.t];
      const drv = v.d ? plMap.get(v.d) : null;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.rotate(v.a);
      const L = V.len;
      const Wd = V.wid;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      roundRect(ctx, -L / 2 + 5, -Wd / 2 + 7, L, Wd, 12);
      ctx.fill();
      if (v.t === 'jeep') {
        ctx.fillStyle = '#1d1d1d';
        for (const sx of [-1, 1]) {
          for (const sy of [-1, 1]) {
            roundRect(ctx, sx * L * 0.3 - 13, sy * (Wd / 2) - 7, 26, 14, 4);
            ctx.fill();
          }
        }
        const col = JEEP_COL[v.c % JEEP_COL.length];
        ctx.fillStyle = col;
        roundRect(ctx, -L / 2, -Wd / 2, L, Wd, 12);
        ctx.fill();
        ctx.strokeStyle = shade(col, -0.45);
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = shade(col, 0.12);
        roundRect(ctx, L * 0.14, -Wd / 2 + 6, L * 0.32, Wd - 12, 6);
        ctx.fill();
        ctx.fillStyle = 'rgba(160,200,220,0.85)';
        ctx.fillRect(L * 0.04, -Wd / 2 + 7, 9, Wd - 14);
        ctx.fillStyle = shade(col, -0.3);
        roundRect(ctx, -L * 0.2, -Wd / 2 + 8, L * 0.18, Wd * 0.34, 4);
        ctx.fill();
        roundRect(ctx, -L * 0.2, Wd / 2 - 8 - Wd * 0.34, L * 0.18, Wd * 0.34, 4);
        ctx.fill();
        ctx.strokeStyle = '#2a2a2a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-L * 0.28, -Wd / 2 + 4);
        ctx.lineTo(-L * 0.28, Wd / 2 - 4);
        ctx.stroke();
        ctx.fillStyle = '#ffe58a';
        circle(ctx, L / 2 - 4, -Wd / 2 + 10, 4.5);
        ctx.fill();
        circle(ctx, L / 2 - 4, Wd / 2 - 10, 4.5);
        ctx.fill();
        if (drv) {
          const skin = D.SKINS[drv.sk] || D.SKINS[0];
          ctx.fillStyle = drv.h ? HELM_COL[drv.h] : skin;
          circle(ctx, -L * 0.11, -Wd * 0.17, 13);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.5)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else {
        ctx.fillStyle = '#1d1d1d';
        roundRect(ctx, L * 0.36 - 12, -6, 24, 12, 5);
        ctx.fill();
        roundRect(ctx, -L * 0.36 - 12, -6, 24, 12, 5);
        ctx.fill();
        const col = BIKE_COL[v.c % BIKE_COL.length];
        ctx.fillStyle = col;
        roundRect(ctx, -L * 0.3, -8, L * 0.6, 16, 6);
        ctx.fill();
        ctx.strokeStyle = shade(col, -0.45);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(L * 0.24, -16);
        ctx.lineTo(L * 0.24, 16);
        ctx.stroke();
        if (drv) {
          const skin = D.SKINS[drv.sk] || D.SKINS[0];
          this.hand(ctx, L * 0.22, -14, skin);
          this.hand(ctx, L * 0.22, 14, skin);
          ctx.fillStyle = skin;
          circle(ctx, -4, 0, PR * 0.9);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          if (drv.v) {
            ctx.strokeStyle = VEST_COL[drv.v];
            ctx.lineWidth = 5;
            circle(ctx, -4, 0, PR * 0.9 - 3);
            ctx.stroke();
          }
          if (drv.h) {
            ctx.fillStyle = HELM_COL[drv.h];
            circle(ctx, -6, 0, PR * 0.56);
            ctx.fill();
          }
        }
      }
      ctx.restore();
      if (v.hp < 0.4 && Math.random() < 0.25) {
        this.particles.push({ x: v.x + (Math.random() - 0.5) * 20, y: v.y + (Math.random() - 0.5) * 20, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 1.2, max: 1.2, size: 12 + Math.random() * 10, color: v.hp < 0.2 ? '#333333' : '#777777', kind: 3, rot: 0, vr: 0 });
      }
      if (v.hp < 0.999) {
        const bw = 60;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(v.x - bw / 2, v.y - V.r - 18, bw, 6);
        ctx.fillStyle = v.hp > 0.5 ? '#9ed36a' : v.hp > 0.25 ? '#e3b23c' : '#d9463e';
        ctx.fillRect(v.x - bw / 2 + 1, v.y - V.r - 17, (bw - 2) * v.hp, 4);
      }
    }

    drawGrenade(ctx, g) {
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      circle(ctx, g.x + 2, g.y + 3, 6);
      ctx.fill();
      const lift = g.z * 34;
      const s = 1 + g.z * 0.5;
      ctx.fillStyle = '#3f5f30';
      circle(ctx, g.x, g.y - lift, 7 * s);
      ctx.fill();
      ctx.strokeStyle = '#1f2f18';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (g.f < 1.2 && Math.floor(this.time * 10) % 2 === 0) {
        ctx.fillStyle = '#ff3b2e';
        circle(ctx, g.x, g.y - lift, 2.5 * s);
        ctx.fill();
      }
    }

    drawBullets(ctx, bullets) {
      ctx.lineCap = 'round';
      for (const b of bullets) {
        const tail = Math.min(TRACER[b.w] || 80, b.tr - 30);
        if (tail <= 2) continue;
        const sx = b.x - b.dx * tail;
        const sy = b.y - b.dy * tail;
        const gr = ctx.createLinearGradient(sx, sy, b.x, b.y);
        gr.addColorStop(0, 'rgba(255,236,170,0)');
        gr.addColorStop(1, 'rgba(255,248,215,0.95)');
        ctx.strokeStyle = gr;
        ctx.lineWidth = TRACER_W[b.w] || 2;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    drawParticles(ctx, vis, top) {
      for (const p of this.particles) {
        const isTop = p.kind === 3;
        if (isTop !== top) continue;
        if (!vis(p.x, p.y, p.size)) continue;
        const a = clamp(p.life / p.max, 0, 1);
        if (p.kind === 3) {
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = p.color;
          circle(ctx, p.x, p.y, p.size * (1.6 - a * 0.6));
          ctx.fill();
        } else if (p.kind === 1 || p.kind === 2) {
          ctx.globalAlpha = Math.min(1, a * 1.5);
          ctx.fillStyle = p.color;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          if (p.kind === 2) ctx.fillRect(-1.5, -4, 3, 8);
          else ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
          ctx.restore();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
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
        const r = f.r * (0.35 + t * 0.75);
        const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        gr.addColorStop(0, 'rgba(255,250,210,' + (1 - t) + ')');
        gr.addColorStop(0.35, 'rgba(255,170,60,' + (0.85 * (1 - t)) + ')');
        gr.addColorStop(1, 'rgba(200,60,20,0)');
        ctx.fillStyle = gr;
        circle(ctx, f.x, f.y, r);
        ctx.fill();
      }
    }

    drawDamageNumbers(ctx) {
      ctx.textAlign = 'center';
      for (const d of this.dmgNums) {
        const t = (this.time - d.t) / 0.9;
        ctx.globalAlpha = 1 - t;
        ctx.font = 'bold ' + Math.round(20 / Math.max(0.6, this.zoom)) + 'px ' + FONT;
        ctx.fillStyle = '#000';
        ctx.fillText(String(d.n), d.x + 1.5, d.y - t * 40 + 1.5);
        ctx.fillStyle = '#ffe14d';
        ctx.fillText(String(d.n), d.x, d.y - t * 40);
      }
      ctx.globalAlpha = 1;
    }

    drawZone(ctx, zo, x0, y0, x1, y1) {
      if (!zo) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0 - 100, y0 - 100, x1 - x0 + 200, y1 - y0 + 200);
      ctx.moveTo(zo.x + Math.max(0, zo.r), zo.y);
      ctx.arc(zo.x, zo.y, Math.max(0, zo.r), 0, TAU, true);
      ctx.fillStyle = 'rgba(176,32,32,0.3)';
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255,90,80,0.85)';
      ctx.lineWidth = 5 / this.zoom;
      circle(ctx, zo.x, zo.y, Math.max(0, zo.r));
      ctx.stroke();
      if (zo.st !== 'final' && (zo.tr < zo.r - 1 || zo.st === 'shrink')) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3 / this.zoom;
        ctx.setLineDash([22 / this.zoom, 14 / this.zoom]);
        circle(ctx, zo.tx, zo.ty, Math.max(0, zo.tr));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // ---------- HUD ----------

    panel(ctx, x, y, w, h, r) {
      ctx.fillStyle = 'rgba(12,16,12,0.55)';
      roundRect(ctx, x, y, w, h, r || 8);
      ctx.fill();
    }

    text(ctx, s, x, y, size, color, align, bold) {
      ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + FONT;
      ctx.textAlign = align || 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(s, x + 1, y + 1);
      ctx.fillStyle = color || '#fff';
      ctx.fillText(s, x, y);
    }

    drawHUD(ctx, view, ui) {
      const W = this.W;
      const H = this.H;
      const s = clamp(Math.min(H / 900, W / 1500), 0.62, 1.3);
      const me = view.me;
      const spectating = view.cam !== view.you || view.spec;

      const hurtAge = this.time - this.hurtT;
      const low = me.alive && me.hp < 30;
      if (hurtAge < 0.35 || low) {
        const a = Math.max(hurtAge < 0.35 ? (0.35 - hurtAge) * 1.4 : 0, low ? 0.25 + Math.sin(this.time * 5) * 0.1 : 0);
        const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        gr.addColorStop(0, 'rgba(160,0,0,0)');
        gr.addColorStop(1, 'rgba(160,0,0,' + a + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);
      }

      this.panel(ctx, 14 * s, 14 * s, 96 * s, 58 * s);
      this.text(ctx, String(view.al), 62 * s, 46 * s, 28 * s, '#fff', 'center');
      this.text(ctx, 'ALIVE', 62 * s, 64 * s, 11 * s, '#cfd8c8', 'center');
      this.panel(ctx, 118 * s, 14 * s, 80 * s, 58 * s);
      this.text(ctx, String(me.k), 158 * s, 46 * s, 28 * s, '#ffd75e', 'center');
      this.text(ctx, 'KILLS', 158 * s, 64 * s, 11 * s, '#cfd8c8', 'center');

      let ky = 96 * s;
      for (const k of ui.killfeed) {
        const age = this.time - k.t;
        if (age > 7) continue;
        ctx.globalAlpha = clamp(7 - age, 0, 1);
        ctx.font = 'bold ' + Math.round(13 * s) + 'px ' + FONT;
        const tw = ctx.measureText(k.txt).width;
        this.panel(ctx, 14 * s, ky - 15 * s, tw + 16 * s, 22 * s, 5);
        this.text(ctx, k.txt, 22 * s, ky, 13 * s, k.mine ? '#ffd75e' : '#f0f0f0');
        ctx.globalAlpha = 1;
        ky += 26 * s;
      }

      const ms = Math.round(200 * s);
      const mx = W - ms - 14 * s;
      const my = 14 * s;
      this.drawMinimap(ctx, view, mx, my, ms, 2200);
      const zo = view.zo;
      let zt = '';
      if (zo.st === 'wait') zt = 'Fog moves in ' + this.fmtTime(zo.tl);
      else if (zo.st === 'shrink') zt = 'Fog closing  ' + this.fmtTime(zo.tl);
      else zt = 'Final zone';
      this.panel(ctx, mx, my + ms + 6 * s, ms, 26 * s, 6);
      this.text(ctx, zt, mx + ms / 2, my + ms + 24 * s, 14 * s, zo.st === 'shrink' ? '#ff8a7a' : '#ffffff', 'center');
      let ly = my + ms + 52 * s;
      if (view.lb && view.lb.length) {
        this.panel(ctx, mx, ly - 4 * s, ms, (view.lb.length * 18 + 26) * s, 6);
        this.text(ctx, 'TOP KILLS', mx + 10 * s, ly + 12 * s, 11 * s, '#cfd8c8');
        ly += 30 * s;
        for (const e of view.lb) {
          const mine = e.i === view.you;
          this.text(ctx, e.n, mx + 10 * s, ly, 12 * s, mine ? '#ffd75e' : '#ffffff', 'left', false);
          this.text(ctx, String(e.k), mx + ms - 10 * s, ly, 12 * s, mine ? '#ffd75e' : '#ffffff', 'right');
          ly += 18 * s;
        }
      }

      if (me.alive || spectating) this.drawPlayerHUD(ctx, view, ui, s);

      if (spectating && view.specName) {
        this.panel(ctx, W / 2 - 160 * s, 14 * s, 320 * s, 34 * s, 8);
        this.text(ctx, 'Spectating ' + view.specName, W / 2, 37 * s, 16 * s, '#fff', 'center');
      }

      let ny = 96 * s;
      for (const n of ui.notices) {
        const age = this.time - n.t;
        if (age > 4) continue;
        ctx.globalAlpha = clamp(4 - age, 0, 1);
        this.text(ctx, n.txt, W / 2, (spectating ? 70 : ny) * s + (spectating ? 26 : 0), 20 * s, n.col || '#ffffff', 'center');
        ctx.globalAlpha = 1;
        ny += 30;
      }

      if (ui.bigMap) {
        const bs = Math.min(W, H) * 0.86;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(0, 0, W, H);
        this.drawMinimap(ctx, view, (W - bs) / 2, (H - bs) / 2, bs, 0);
        this.text(ctx, 'Press M to close the map', W / 2, (H + bs) / 2 + 24, 14, '#ddd', 'center');
      }

      if (me.alive && !ui.bigMap && ui.mouseX != null) this.drawCrosshair(ctx, ui, me);
    }

    fmtTime(t) {
      t = Math.max(0, Math.ceil(t));
      const m = Math.floor(t / 60);
      const sec = t % 60;
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    drawMinimap(ctx, view, x, y, size, span) {
      const map = this.map;
      ctx.save();
      this.panel(ctx, x - 4, y - 4, size + 8, size + 8, 8);
      roundRect(ctx, x, y, size, size, 6);
      ctx.clip();
      const full = !span;
      const sp = full ? map.size : span;
      const cx = full ? map.size / 2 : view.cx;
      const cy = full ? map.size / 2 : view.cy;
      const wx0 = cx - sp / 2;
      const wy0 = cy - sp / 2;
      const k = size / sp;
      ctx.fillStyle = '#22331d';
      ctx.fillRect(x, y, size, size);
      const ms = this.mini.width / map.size;
      ctx.drawImage(this.mini, wx0 * ms, wy0 * ms, sp * ms, sp * ms, x, y, size, size);
      const tx = wx => x + (wx - wx0) * k;
      const ty = wy => y + (wy - wy0) * k;
      const zo = view.zo;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size, size);
      ctx.moveTo(tx(zo.x) + Math.max(0, zo.r * k), ty(zo.y));
      ctx.arc(tx(zo.x), ty(zo.y), Math.max(0, zo.r * k), 0, TAU, true);
      ctx.fillStyle = 'rgba(176,32,32,0.35)';
      ctx.fill('evenodd');
      ctx.restore();
      ctx.strokeStyle = '#ff6a5c';
      ctx.lineWidth = 2;
      circle(ctx, tx(zo.x), ty(zo.y), Math.max(0, zo.r * k));
      ctx.stroke();
      if (zo.st !== 'final') {
        ctx.strokeStyle = '#ffffff';
        ctx.setLineDash([5, 4]);
        circle(ctx, tx(zo.tx), ty(zo.ty), Math.max(0, zo.tr * k));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (full) {
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'center';
        const cols = 'ABCDEFGH';
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + (i * size) / 8, y, 1, size);
          ctx.fillRect(x, y + (i * size) / 8, size, 1);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillText(cols[i], x + ((i + 0.5) * size) / 8, y + 14);
          ctx.fillText(String(i + 1), x + 10, y + ((i + 0.5) * size) / 8 + 4);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 1;
        const vw = this.W / this.zoom;
        const vh = this.H / this.zoom;
        ctx.strokeRect(tx(view.cx - vw / 2), ty(view.cy - vh / 2), vw * k, vh * k);
      }
      const px = tx(view.cx);
      const py = ty(view.cy);
      ctx.fillStyle = '#ffffff';
      circle(ctx, px, py, full ? 6 : 4.5);
      ctx.fill();
      ctx.fillStyle = view.cam === view.you ? '#2f8fff' : '#ffb02e';
      circle(ctx, px, py, full ? 4 : 3);
      ctx.fill();
      ctx.restore();
    }

    drawPlayerHUD(ctx, view, ui, s) {
      const W = this.W;
      const H = this.H;
      const me = view.cme || view.me;
      const bw = 340 * s;
      const bx = W / 2 - bw / 2;
      const by = H - 44 * s;
      this.panel(ctx, bx - 6 * s, by - 6 * s, bw + 12 * s, 34 * s, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx, by, bw, 22 * s);
      const hpf = clamp(me.hp / D.MAX_HP, 0, 1);
      ctx.fillStyle = me.hp > 60 ? '#e9efe2' : me.hp > 30 ? '#f1c04a' : '#e2483b';
      ctx.fillRect(bx, by, bw * hpf, 22 * s);
      this.text(ctx, String(Math.ceil(me.hp)), W / 2, by + 17 * s, 15 * s, me.hp > 60 ? '#222' : '#fff', 'center');
      const seg = bw / 4;
      for (let i = 0; i < 4; i++) {
        const f = clamp((me.bo - i * 25) / 25, 0, 1);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(bx + i * seg + 1, by - 12 * s, seg - 2, 6 * s);
        ctx.fillStyle = i < 2 ? '#ff9a2e' : '#ff6a2e';
        ctx.fillRect(bx + i * seg + 1, by - 12 * s, (seg - 2) * f, 6 * s);
      }

      const gear = [['vest', me.v], ['helmet', me.h], ['pack', me.b], ['scope', me.sc]];
      let gx = bx;
      const gy = by - 54 * s;
      for (const [k, lvl] of gear) {
        const label = k === 'scope' ? D.SCOPES[lvl] + 'x' : lvl ? 'L' + lvl : '-';
        this.panel(ctx, gx, gy, 46 * s, 34 * s, 6);
        this.text(ctx, k === 'pack' ? 'PACK' : k === 'helmet' ? 'HELM' : k.toUpperCase(), gx + 23 * s, gy + 13 * s, 9 * s, '#cfd8c8', 'center');
        this.text(ctx, label, gx + 23 * s, gy + 29 * s, 14 * s, lvl ? D.RARITY[k === 'scope' ? lvl + 1 : lvl] : '#888', 'center');
        gx += 51 * s;
      }

      const act = me.sl[me.act];
      if (me.act <= 1 && act) {
        const Wp = D.WEAPONS[act.w];
        const ax = bx + bw;
        this.text(ctx, String(act.m), ax - 54 * s, gy + 30 * s, 30 * s, act.m === 0 ? '#e2483b' : '#ffffff', 'right');
        this.text(ctx, '/ ' + me.am[Wp.ammo], ax - 48 * s, gy + 30 * s, 15 * s, '#cfd8c8', 'left');
      } else if (me.act === 3) {
        this.text(ctx, 'x' + me.it.frag, bx + bw - 10 * s, gy + 30 * s, 26 * s, '#ffffff', 'right');
      }

      const sx = W - 250 * s;
      let sy = H - 4 * 50 * s - 14 * s;
      for (let i = 0; i < 4; i++) {
        const sl = me.sl[i];
        let name = '';
        let sub = '';
        if (i <= 1) {
          if (sl) {
            const Wp = D.WEAPONS[sl.w];
            name = Wp.name;
            sub = sl.m + ' / ' + me.am[Wp.ammo];
          }
        } else if (i === 2) {
          name = D.MELEE[sl.w].name;
        } else {
          if (me.it.frag > 0) {
            name = D.FRAG.name;
            sub = 'x' + me.it.frag;
          }
        }
        const active = me.act === i;
        ctx.fillStyle = active ? 'rgba(255,255,255,0.22)' : 'rgba(12,16,12,0.55)';
        roundRect(ctx, sx, sy, 236 * s, 44 * s, 7);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        this.text(ctx, String(i + 1), sx + 14 * s, sy + 27 * s, 14 * s, '#cfd8c8', 'center');
        if (name) {
          const rar = i <= 1 ? D.WEAPONS[sl.w].rarity : i === 2 ? D.MELEE[sl.w].rarity : 1;
          this.text(ctx, name, sx + 30 * s, sy + 20 * s, 14 * s, D.RARITY[rar]);
          if (sub) this.text(ctx, sub, sx + 30 * s, sy + 37 * s, 12 * s, '#e0e0e0', 'left', false);
          if (i <= 1) {
            ctx.save();
            ctx.globalAlpha = 0.9;
            this.drawGunShape(ctx, sl.w, sx + 196 * s, sy + 22 * s, s * 0.7);
            ctx.restore();
          }
        } else {
          this.text(ctx, i === 3 ? 'Throwable' : 'Empty', sx + 30 * s, sy + 27 * s, 13 * s, '#7c847a', 'left', false);
        }
        sy += 50 * s;
      }

      const lx = 14 * s;
      let lyy = H - 7 * 30 * s - 14 * s;
      const rows = [
        ['5', 'Bandage', me.it.bandage, D.HEALS.bandage.cap[me.b], '#efe8d8'],
        ['6', 'Med Kit', me.it.medkit, D.HEALS.medkit.cap[me.b], '#ff6a5c'],
        ['7', 'Energy Drink', me.it.soda, D.HEALS.soda.cap[me.b], '#ffb02e']
      ];
      for (const r of rows) {
        this.panel(ctx, lx, lyy, 190 * s, 26 * s, 6);
        this.text(ctx, r[0], lx + 12 * s, lyy + 18 * s, 12 * s, '#cfd8c8', 'center');
        this.text(ctx, r[1], lx + 26 * s, lyy + 18 * s, 13 * s, r[2] ? r[4] : '#7c847a');
        this.text(ctx, r[2] + '/' + r[3], lx + 180 * s, lyy + 18 * s, 12 * s, r[2] ? '#ffffff' : '#7c847a', 'right', false);
        lyy += 30 * s;
      }
      lyy += 6 * s;
      for (const t of ['light', 'medium', 'shells', 'heavy']) {
        const A = D.AMMO[t];
        this.panel(ctx, lx, lyy, 190 * s, 22 * s, 6);
        ctx.fillStyle = A.color;
        circle(ctx, lx + 12 * s, lyy + 11 * s, 5 * s);
        ctx.fill();
        this.text(ctx, A.name, lx + 26 * s, lyy + 16 * s, 12 * s, me.am[t] ? '#ffffff' : '#7c847a', 'left', false);
        this.text(ctx, me.am[t] + '/' + A.cap[me.b], lx + 180 * s, lyy + 16 * s, 12 * s, me.am[t] ? '#ffffff' : '#7c847a', 'right', false);
        lyy += 26 * s;
      }

      if (me.alive && me.pr && !ui.bigMap) {
        const txt = '[F]  ' + me.pr;
        ctx.font = 'bold ' + Math.round(16 * s) + 'px ' + FONT;
        const tw = ctx.measureText(txt).width;
        this.panel(ctx, W / 2 - tw / 2 - 14 * s, H / 2 + 52 * s, tw + 28 * s, 32 * s, 8);
        this.text(ctx, txt, W / 2, H / 2 + 74 * s, 16 * s, '#ffffff', 'center');
      }
      let py = H / 2 + 108 * s;
      for (const m of ui.pickups) {
        const age = this.time - m.t;
        if (age > 2.2) continue;
        ctx.globalAlpha = clamp(2.2 - age, 0, 1);
        this.text(ctx, m.txt, W / 2, py, 14 * s, '#e8f5d8', 'center');
        ctx.globalAlpha = 1;
        py += 20 * s;
      }
      if (me.ac) {
        const H2 = D.HEALS[me.ac.item];
        const r = 34 * s;
        const cx = W / 2;
        const cy = H / 2 - 70 * s;
        ctx.fillStyle = 'rgba(12,16,12,0.6)';
        circle(ctx, cx, cy, r + 6 * s);
        ctx.fill();
        ctx.strokeStyle = '#7be07b';
        ctx.lineWidth = 6 * s;
        ctx.beginPath();
        ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * me.ac.p);
        ctx.stroke();
        this.text(ctx, me.ac.tl.toFixed(1), cx, cy + 6 * s, 16 * s, '#fff', 'center');
        this.text(ctx, 'Using ' + H2.name, cx, cy + r + 26 * s, 14 * s, '#fff', 'center');
      }
      if (me.wa && me.alive && !me.veh) this.text(ctx, 'Wading through water - slowed', W / 2, H - 112 * s, 12 * s, '#9fd0f0', 'center', false);
    }

    drawCrosshair(ctx, ui, me) {
      const x = ui.mouseX;
      const y = ui.mouseY;
      const hm = this.time - this.hitMarkT < 0.18;
      ctx.lineCap = 'round';
      const gap = 6;
      const len = 9;
      const lines = [[gap, 0, gap + len, 0], [-gap, 0, -gap - len, 0], [0, gap, 0, gap + len], [0, -gap, 0, -gap - len]];
      for (const pass of [0, 1]) {
        ctx.strokeStyle = pass ? '#ffffff' : 'rgba(0,0,0,0.6)';
        ctx.lineWidth = pass ? 2 : 4;
        ctx.beginPath();
        for (const l of lines) {
          ctx.moveTo(x + l[0], y + l[1]);
          ctx.lineTo(x + l[2], y + l[3]);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      circle(ctx, x, y, 1.6);
      ctx.fill();
      if (hm) {
        ctx.strokeStyle = '#ff4b3e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 14);
        ctx.lineTo(x - 7, y - 7);
        ctx.moveTo(x + 14, y - 14);
        ctx.lineTo(x + 7, y - 7);
        ctx.moveTo(x - 14, y + 14);
        ctx.lineTo(x - 7, y + 7);
        ctx.moveTo(x + 14, y + 14);
        ctx.lineTo(x + 7, y + 7);
        ctx.stroke();
      }
      if (me.rl >= 0) {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 5;
        circle(ctx, x, y, 22);
        ctx.stroke();
        ctx.strokeStyle = '#ffd75e';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * me.rl);
        ctx.stroke();
      }
    }
  }

  globalThis.PF_Renderer = Renderer;
})();
