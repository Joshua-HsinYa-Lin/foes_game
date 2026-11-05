'use strict';
// Plays the real page through the keyboard and mouse only, the way a person would: grab weapons,
// aim at enemies and shoot, drink soup when hurt, open airdrops, stay inside the zone.
// It reads the screen state through the opt-in ?debug hook but never changes the game.
//
// Solo Paradise Brawl:
//   node tests/playtest.js [shots dir] [level 1-5] [character 1-4] [rounds]
// Several players in a LAN room (start `node server.js --port 8099` first):
//   node tests/playtest.js [shots dir] [level] [character] [rounds] --lan localhost:8099 --people 3 --mode coop --bots 12
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const outDir = pos[0] || path.join(__dirname, 'shots');
const level = pos[1] || '2';
const card = Number(pos[2] || 1);
const rounds = Number(pos[3] || 1);
const lan = flag('lan', '');
const people = Number(flag('people', 1));
const mode = flag('mode', 'ffa');
const bots = flag('bots', '13');
const url = 'file://' + path.join(__dirname, '..', 'yunwang_paradise.html') + '?debug';
const W = 1280;
const H = 760;
const GUNS = ['pistol', 'uzi', 'shotgun', 'rifle', 'sniper', 'minigun', 'chopsticks', 'bowl', 'harpoon'];
const GOOD = ['pan', 'cleaver', 'wok', 'swordfish', 'rifle', 'shotgun', 'minigun', 'sniper', 'chopsticks', 'bowl'];

function readView(page) {
  return page.evaluate(() => {
    const v = PF_DEBUG.view;
    if (!v) return null;
    const me = v.me;
    const mine = v.pl.find(p => p.i === v.you);
    const foes = v.pl.filter(p => p.i !== v.you && !p.d && !p.veh && !(me.tm && p.tm === me.tm)).map(p => ({ x: p.x, y: p.y, d: Math.hypot(p.x - me.x, p.y - me.y) })).sort((a, b) => a.d - b.d);
    const items = v.it.filter(i => !(i.t === 'drop' && i.f > 0)).map(i => ({ x: i.x, y: i.y, t: i.t, d: Math.hypot(i.x - me.x, i.y - me.y) })).sort((a, b) => a.d - b.d);
    return { alive: me.alive, rsp: me.rsp, st: v.st, x: me.x, y: me.y, hp: me.hp, mhp: me.mhp, so: me.so, sl: me.sl.map(s => s && s.t), act: me.act, foes: foes.slice(0, 3), items: items.slice(0, 6), zo: v.zo, overlay: !document.getElementById('overlay').hidden, lobby: !document.getElementById('lobby').hidden, t: v.t, k: me.k, st2: me.st, veh: me.veh, bu: mine ? mine.bu : 0 };
  });
}

// One player's hands on the keyboard and mouse.
class Player {
  constructor(page) {
    this.page = page;
    this.held = new Set();
    this.mouseHeld = false;
    this.nextShot = 0;
    this.lastF = 0;
    this.lastH = 0;
    this.wander = Math.random() * Math.PI * 2;
    this.wanderT = 0;
    this.lastPos = null;
    this.stuck = 0;
    this.escape = 0;
  }

  async setKeys(want) {
    for (const k of [...this.held]) {
      if (!want.has(k)) {
        await this.page.keyboard.up(k);
        this.held.delete(k);
      }
    }
    for (const k of want) {
      if (!this.held.has(k)) {
        await this.page.keyboard.down(k);
        this.held.add(k);
      }
    }
  }

  async release() {
    await this.setKeys(new Set());
    if (this.mouseHeld) await this.page.mouse.up();
    this.mouseHeld = false;
  }

  async tick(v) {
    const page = this.page;
    const want = new Set();
    const hasGun = v.sl.some(t => t && GUNS.indexOf(t) >= 0);
    const armed = v.sl.some(Boolean);
    let tx = null;
    let ty = null;
    const foe = v.foes[0];
    const now = Date.now();
    if (v.hp < v.mhp * 0.45 && v.so > 0 && now - this.lastH > 2500 && (!foe || foe.d > 350)) {
      await page.keyboard.press('KeyH');
      this.lastH = now;
    }
    if (foe && foe.d < (hasGun ? 700 : armed ? 220 : 120)) {
      const ang = Math.atan2(foe.y - v.y, foe.x - v.x);
      await page.mouse.move(W / 2 + Math.cos(ang) * 220, H / 2 + Math.sin(ang) * 220);
      const gunSlot = v.sl.findIndex(t => t && GUNS.indexOf(t) >= 0);
      if (hasGun && GUNS.indexOf(v.sl[v.act]) < 0 && gunSlot >= 0) await page.keyboard.press('Digit' + (gunSlot + 1));
      if (!this.mouseHeld && now > this.nextShot) {
        await page.mouse.down();
        this.mouseHeld = true;
      }
      const strafe = Math.floor(now / 900) % 2 ? 1 : -1;
      const close = foe.d < 160 && hasGun;
      tx = v.x - Math.sin(ang) * strafe * 100 + (close ? -Math.cos(ang) * 80 : Math.cos(ang) * (hasGun ? 0 : 120));
      ty = v.y + Math.cos(ang) * strafe * 100 + (close ? -Math.sin(ang) * 80 : Math.sin(ang) * (hasGun ? 0 : 120));
    } else {
      if (this.mouseHeld) {
        await page.mouse.up();
        this.mouseHeld = false;
        this.nextShot = now + 100;
      }
      const wantItem = v.items.find(i => i.d < 600 && (i.t === 'soup' || (i.t === 'bao' && v.hp < v.mhp) || i.t === 'bag' || i.t === 'drop' || (GUNS.indexOf(i.t) >= 0 && !hasGun) || (GOOD.indexOf(i.t) >= 0 && v.sl.filter(Boolean).length < 3)));
      const z = v.zo;
      const outside = z.on && Math.hypot(v.x - z.x, v.y - z.y) > z.tr * 0.85;
      if (this.escape > now) {
        tx = v.x + Math.cos(this.wander) * 200;
        ty = v.y + Math.sin(this.wander) * 200;
      } else if (outside) {
        tx = z.x;
        ty = z.y;
        want.add('Space');
      } else if (wantItem) {
        tx = wantItem.x;
        ty = wantItem.y;
        if (wantItem.d < 60 && now - this.lastF > 400) {
          await page.keyboard.press('KeyF');
          this.lastF = now;
        }
      } else {
        if (now > this.wanderT) {
          this.wander += (Math.random() - 0.5) * 2;
          this.wanderT = now + 3000;
        }
        tx = v.x + Math.cos(this.wander) * 200;
        ty = v.y + Math.sin(this.wander) * 200;
        if (v.st2 > 60) want.add('Space');
      }
      await page.mouse.move(W / 2 + (tx - v.x) * 0.5, H / 2 + (ty - v.y) * 0.5);
    }
    if (this.lastPos && Math.hypot(v.x - this.lastPos[0], v.y - this.lastPos[1]) < 3) this.stuck++;
    else this.stuck = 0;
    this.lastPos = [v.x, v.y];
    if (this.stuck > 8 && this.escape < now) {
      // Walled in: try a different direction for a moment, as a person would look for the door.
      this.wander = Math.random() * Math.PI * 2;
      this.escape = now + 1200;
      this.stuck = 0;
    }
    if (tx != null) {
      const dx = tx - v.x;
      const dy = ty - v.y;
      if (dx > 30) want.add('KeyD');
      if (dx < -30) want.add('KeyA');
      if (dy > 30) want.add('KeyS');
      if (dy < -30) want.add('KeyW');
    }
    await this.setKeys(want);
  }
}

async function newPage(browser, errors, name) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push(name + ' console: ' + m.text());
  });
  await page.goto(url);
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    PF_Sound.counts = {};
    const orig = PF_Sound.play.bind(PF_Sound);
    PF_Sound.play = (t, o) => {
      PF_Sound.counts[t] = (PF_Sound.counts[t] || 0) + 1;
      return orig(t, o);
    };
  });
  return page;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const pages = [];
  for (let i = 0; i < people; i++) pages.push(await newPage(browser, errors, 'P' + (i + 1)));
  const results = [];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      if (r === 0) {
        await page.click(lan ? '#btnLan' : '#btnRoyale');
        await page.click('#diff button[data-v="' + level + '"]');
        await page.click('.hero-card:nth-child(' + (((card - 1 + i) % 4) + 1) + ')');
        await page.fill('#name', 'Claude' + (people > 1 ? i + 1 : ''));
        if (lan) await page.fill('#server', lan);
        await page.click('#heroGo');
        await page.waitForTimeout(300);
      } else if (!lan) {
        await page.click('#ovAgain');
      }
    }
    if (lan) {
      const host = pages[0];
      await host.waitForFunction(n => PF_DEBUG.session && PF_DEBUG.session.room && PF_DEBUG.session.room.players.length === n && PF_DEBUG.session.room.state === 'lobby', people, { timeout: 30000 });
      await host.click('#roomMode button[data-v="' + mode + '"]');
      await host.click('#roomDiff button[data-v="' + level + '"]');
      await host.$eval('#roomBots', (el, b) => {
        el.value = b;
        el.dispatchEvent(new Event('input'));
        el.dispatchEvent(new Event('change'));
      }, bots);
      await host.waitForTimeout(500);
      await host.click('#roomStart');
    }
    for (const page of pages) await page.waitForFunction(() => window.PF_DEBUG && PF_DEBUG.view && PF_DEBUG.view.st === 'playing' && document.getElementById('lobby').hidden, null, { timeout: 20000 });
    const players = pages.map(p => new Player(p));
    const t0 = Date.now();
    let shotN = 0;
    const done = new Set();
    const downs = pages.map(() => 0);
    const wasAlive = pages.map(() => true);
    while (Date.now() - t0 < 480000 && done.size < players.length) {
      for (let i = 0; i < players.length; i++) {
        if (done.has(i)) continue;
        const v = await readView(players[i].page);
        if (!v) continue;
        if (wasAlive[i] && !v.alive) downs[i]++;
        wasAlive[i] = v.alive;
        if (v.st !== 'playing' || (!v.alive && !(v.rsp >= 0)) || v.overlay) {
          await players[i].release();
          done.add(i);
          continue;
        }
        if (!v.alive) {
          await players[i].release();
          continue;
        }
        await players[i].tick(v);
      }
      if (Date.now() - t0 > shotN * 20000) {
        await pages[0].screenshot({ path: path.join(outDir, 'p' + r + '_' + String(shotN).padStart(2, '0') + '.png') });
        shotN++;
      }
      await pages[0].waitForTimeout(50);
    }
    await pages[0].waitForTimeout(2500);
    for (let i = 0; i < pages.length; i++) {
      await pages[i].screenshot({ path: path.join(outDir, 'p' + r + '_end_' + (i + 1) + '.png') });
      const end = await pages[i].evaluate(() => ({ title: document.getElementById('ovTitle').textContent, t: Math.round(PF_DEBUG.view.t), k: PF_DEBUG.view.me.k, dmg: PF_DEBUG.view.me.dd, plc: PF_DEBUG.view.me.plc, killer: PF_DEBUG.view.me.killer || PF_DEBUG.view.me.killerNk }));
      end.downs = downs[i];
      results.push(end);
      console.log('round ' + (r + 1) + ' player ' + (i + 1) + ': ' + JSON.stringify(end));
    }
    if (lan && r < rounds - 1) {
      for (const page of pages) await page.waitForFunction(() => !document.getElementById('lobby').hidden, null, { timeout: 30000 });
    }
  }
  const counts = await pages[0].evaluate(() => PF_Sound.counts);
  console.log('sounds played: ' + JSON.stringify(counts));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => {
  console.log('playtest failed: ' + e.message);
  process.exit(1);
});
