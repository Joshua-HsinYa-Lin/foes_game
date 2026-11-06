'use strict';
// Phone check: an emulated Android phone and iPhone (touch, mobile viewport, landscape) play the
// single-file build with real multi-touch, through the opt-in ?debug hook.
// Usage: node tests/mobile_test.js [screenshot dir] [server address, optional, for the LAN part]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const addr = process.argv[3] || '';
const url = 'file://' + path.join(__dirname, '..', 'yunwang_paradise.html') + '?debug';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const notes = [];
  const fails = [];
  const expect = (cond, msg) => {
    notes.push((cond ? 'ok   ' : 'FAIL ') + msg);
    if (!cond) fails.push(msg);
  };
  const phone = async (ua, w, h, name) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: ua });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(name + ' console: ' + m.text());
    });
    const cdp = await ctx.newCDPSession(page);
    return { ctx, page, cdp };
  };
  // Multi-touch through the DevTools protocol: each point is [id, x, y].
  const touches = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ id: p[0], x: p[1], y: p[2], radiusX: 6, radiusY: 6, force: 1 })) });
  const view = page => page.evaluate(() => {
    const v = PF_DEBUG.view;
    return { x: v.me.x, y: v.me.y, act: v.me.act, su: v.me.su, sl: v.me.sl.map(s => s && s.t), alive: v.me.alive, dd: v.me.dd };
  });

  // ---------- Android phone, landscape ----------
  const A = await phone(ANDROID, 915, 412, 'Android');
  const page = A.page;
  await page.goto(url);
  await page.waitForTimeout(700);
  const start = await page.evaluate(() => ({ touch: document.body.classList.contains('touch'), full: !document.getElementById('tFull').hidden, help: getComputedStyle(document.querySelector('.touch-help')).display }));
  expect(start.touch && start.full && start.help === 'table', 'Android phone: touch mode on, fullscreen button and touch help shown');
  await page.evaluate(() => {
    document.querySelector('details.controls').open = true;
  });
  await page.screenshot({ path: path.join(outDir, 'm1_title_android.png') });
  const fitsTitle = await page.evaluate(() => {
    const r = document.getElementById('btnLan').getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.right <= window.innerWidth;
  });
  expect(fitsTitle, 'all three mode buttons fit on a landscape phone screen without scrolling');
  await page.tap('#btnRoyale');
  await page.tap('#diff button[data-v="1"]');
  await page.tap('.hero-card:nth-child(2)');
  await page.screenshot({ path: path.join(outDir, 'm2_heroes_android.png') });
  await page.tap('#heroGo');
  await page.waitForTimeout(900);
  const ui0 = await page.evaluate(() => ({ shown: !document.getElementById('touchUI').hidden, cross: PF_DEBUG.renderer.hit.slots.length }));
  expect(ui0.shown && ui0.cross === 3, 'in a match: touch controls shown and 3 tappable weapon slots');
  await page.evaluate(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    for (const p of s.players) {
      if (p === me) continue;
      p.ai.sleepT = 9999;
      p.x = 200;
      p.y = 200;
    }
    for (const o of s.obstacles) if (Math.hypot(o.x - me.x, o.y - me.y) < 420 && o.k !== 'wall' && o.k !== 'plank') o.dead = true;
    me.slots[0] = { t: 'rifle', m: 30 };
    me.act = 0;
  });
  const v0 = await view(page);
  // Left thumb pushes right, right thumb drags up-right: move and shoot at the same time.
  await touches(A.cdp, 'touchStart', [[1, 140, 300], [2, 700, 250]]);
  for (let i = 1; i <= 8; i++) {
    await touches(A.cdp, 'touchMove', [[1, 140 + i * 8, 300], [2, 700 + i * 6, 250 - i * 4]]);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, 'm3_two_thumbs_android.png') });
  await page.waitForTimeout(900);
  const shots = await page.evaluate(() => PF_DEBUG.view.me.sl[0] && PF_DEBUG.view.me.sl[0].m);
  await touches(A.cdp, 'touchEnd', []);
  const v1 = await view(page);
  expect(v1.x - v0.x > 120 && Math.abs(v1.y - v0.y) < 60, 'left thumb moves the player (' + Math.round(v1.x - v0.x) + ' px right)');
  expect(shots < 30, 'right thumb drag fires the rifle (' + (30 - shots) + ' shots)');
  const aimNow = await page.evaluate(() => PF_DEBUG.session.sim.playerMap.get(PF_DEBUG.session.myId).a);
  expect(aimNow < -0.3 && aimNow > -0.9, 'aim follows the right thumb direction (' + aimNow.toFixed(2) + ' rad)');

  const slot2 = await page.evaluate(() => {
    const r = PF_DEBUG.renderer.hit.slots[1];
    return [r.x + r.w / 2, r.y + r.h / 2];
  });
  await page.touchscreen.tap(slot2[0], slot2[1]);
  await page.waitForTimeout(200);
  expect((await view(page)).act === 1, 'tapping weapon slot 2 selects it');
  const skill = await page.evaluate(() => {
    const r = PF_DEBUG.renderer.hit.skill;
    return [r.x + r.w / 2, r.y + r.h / 2];
  });
  await page.evaluate(() => {
    PF_DEBUG.session.sim.playerMap.get(PF_DEBUG.session.myId).skillCool = 0;
  });
  await page.touchscreen.tap(skill[0], skill[1]);
  await page.waitForTimeout(900);
  expect((await view(page)).su === 1, 'tapping the skill circle uses the skill');

  await page.evaluate(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    for (const it of [...s.items.values()]) if (Math.hypot(it.x - me.x, it.y - me.y) < 150) s.removeItem(it);
    s.spawnItem(me.x + 10, me.y, 'pan');
  });
  await page.waitForTimeout(250);
  const use = await page.evaluate(() => ({ shown: !document.getElementById('tbUse').hidden, label: document.getElementById('tbUse').textContent }));
  expect(use.shown && use.label.length > 1, 'standing on a weapon shows the use button: ' + use.label);
  await page.screenshot({ path: path.join(outDir, 'm4_use_button_android.png') });
  await page.tap('#tbUse');
  await page.waitForTimeout(250);
  expect((await view(page)).sl.indexOf('pan') >= 0, 'tapping the use button picks the frying pan up');

  const panSlot = (await view(page)).sl.indexOf('pan');
  const ps = await page.evaluate(i => {
    const r = PF_DEBUG.renderer.hit.slots[i];
    return [r.x + r.w / 2, r.y + r.h / 2];
  }, panSlot);
  await touches(A.cdp, 'touchStart', [[5, ps[0], ps[1]]]);
  await page.waitForTimeout(800);
  await touches(A.cdp, 'touchEnd', []);
  await page.waitForTimeout(200);
  expect((await view(page)).sl.indexOf('pan') < 0, 'holding a weapon slot drops that weapon');

  const mini = await page.evaluate(() => {
    const r = PF_DEBUG.renderer.hit.mini;
    return [r.x + r.w / 2, r.y + r.h / 2];
  });
  await page.touchscreen.tap(mini[0], mini[1]);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, 'm5_big_map_android.png') });
  await page.touchscreen.tap(450, 200);
  await page.waitForTimeout(200);
  const facing = await page.evaluate(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const foe = s.players.find(p => p !== me && p.alive);
    // Clear the line of fire where the player stands now, and put the enemy in an open spot about
    // 13 degrees off a straight line, so only the aim decides whether shots land.
    for (const o of s.obstacles) if (Math.hypot(o.x - me.x, o.y - me.y) < 420) o.dead = true;
    for (const v of s.vehicles) if (Math.hypot(v.x - me.x, v.y - me.y) < 420) v.x += 900;
    const face = Math.atan2(s.size / 2 - me.y, s.size / 2 - me.x);
    foe.x = me.x + Math.cos(face - 0.23) * 268;
    foe.y = me.y + Math.sin(face - 0.23) * 268;
    foe.hp = 1000;
    foe.maxHp = 1000;
    me.slots[0] = { t: 'rifle', m: 30 };
    me.act = 0;
    return face;
  });
  await page.waitForTimeout(150);
  const before = (await view(page)).dd;
  // Face right with a short nudge of the left thumb, then quick taps on the right half: the enemy is about
  // 13 degrees off, and aim assist should land the shots.
  await touches(A.cdp, 'touchStart', [[7, 140, 300]]);
  await touches(A.cdp, 'touchMove', [[7, 140 + Math.cos(facing) * 20, 300 + Math.sin(facing) * 20]]);
  await page.waitForTimeout(80);
  await touches(A.cdp, 'touchEnd', []);
  for (let i = 0; i < 4; i++) {
    await page.touchscreen.tap(720, 230);
    await page.waitForTimeout(250);
  }
  const after = (await view(page)).dd;
  expect(after > before, 'quick taps on the right half shoot, with aim pulled onto a nearby enemy (' + Math.round(after - before) + ' damage)');
  const diag = await page.evaluate(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const foe = s.players.find(p => p !== me && p.alive && p.maxHp === 1000);
    const el = document.elementFromPoint(720, 230);
    return { under: el && (el.id || el.tagName), useLabel: document.getElementById('tbUse').hidden ? '' : document.getElementById('tbUse').textContent, ammo: me.slots[0] && me.slots[0].m, act: me.act, slots: me.slots.map(x => x && x.t).join('/'), aim: me.a.toFixed(2), toFoe: foe ? Math.atan2(foe.y - me.y, foe.x - me.x).toFixed(2) : '-', blocked: foe ? s.losBlocked(me.x, me.y, foe.x, foe.y) : '-' };
  });
  notes.push('     tap diagnostics: ' + JSON.stringify(diag));

  await page.tap('#tbPause');
  await page.waitForTimeout(200);
  const paused = await page.evaluate(() => !document.getElementById('pause').hidden && PF_DEBUG.session.paused);
  expect(paused, 'the pause button opens the menu and pauses the solo game');
  await page.screenshot({ path: path.join(outDir, 'm6_pause_android.png') });
  await page.tap('#pauseResume');
  await page.waitForTimeout(200);

  const wasFull = await page.evaluate(() => !!document.fullscreenElement);
  expect(wasFull, 'starting a match on Android went fullscreen');
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: 412, height: 915 });
  await page.waitForTimeout(400);
  const rot = await page.evaluate(() => ({ shown: !document.getElementById('rotate').hidden, paused: PF_DEBUG.session.paused }));
  expect(rot.shown && rot.paused, 'holding the phone upright shows the turn-sideways screen and waits');
  await page.screenshot({ path: path.join(outDir, 'm7_rotate_android.png') });
  await page.setViewportSize({ width: 915, height: 412 });
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({ hidden: document.getElementById('rotate').hidden, paused: PF_DEBUG.session.paused }));
  expect(back.hidden && !back.paused, 'turning it sideways again resumes the game');

  await page.tap('#tbPause');
  await page.tap('#pauseQuit');
  await page.waitForTimeout(400);
  await page.tap('#btnStory');
  await page.tap('#heroGo');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, 'm8_chapters_android.png') });
  await page.tap('.chapter:nth-child(1)');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'm9_dialogue_android.png') });
  await page.tap('#dlgSkip');
  await page.waitForTimeout(1500);
  const tip = await page.evaluate(() => document.getElementById('dialogue').hidden && PF_DEBUG.view && PF_DEBUG.view.chap);
  await page.screenshot({ path: path.join(outDir, 'm10_story_android.png') });
  expect(tip === 'ch1', 'story chapter 1 runs on the phone after the dialogue');

  // ---------- iPhone, landscape ----------
  const B = await phone(IPHONE, 844, 390, 'iPhone');
  await B.page.goto(url);
  await B.page.waitForTimeout(700);
  const ios = await B.page.evaluate(() => ({ touch: document.body.classList.contains('touch'), full: !document.getElementById('tFull').hidden, icon: !!document.querySelector('link[rel="apple-touch-icon"]') }));
  expect(ios.touch && !ios.full && ios.icon, 'iPhone: touch mode on, no fullscreen button (iOS has none), home-screen icon present');
  await B.page.tap('#btnRoyale');
  await B.page.tap('#heroGo');
  await B.page.waitForTimeout(900);
  // Log anything solid in the walking path, then clear it: this check is about the thumb stick, not the map.
  const path0 = await B.page.evaluate(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const inPath = s.obstacles.filter(o => !o.dead && o.solid && Math.abs(o.x - me.x) < 60 + (o.hw || o.r) && o.y < me.y && me.y - o.y < 420 + (o.hh || o.r)).map(o => o.k);
    for (const o of s.obstacles) if (Math.hypot(o.x - me.x, o.y - me.y) < 460) o.dead = true;
    for (const p of s.players) if (p !== me) p.ai.sleepT = 9999;
    return inPath.join(',') || 'nothing';
  });
  notes.push('     iPhone walking path had: ' + path0 + ' (cleared)');
  const i0 = await view(B.page);
  await touches(B.cdp, 'touchStart', [[1, 120, 280]]);
  for (let i = 1; i <= 6; i++) {
    await touches(B.cdp, 'touchMove', [[1, 120, 280 - i * 10]]);
    await B.page.waitForTimeout(30);
  }
  await B.page.waitForTimeout(700);
  await B.page.screenshot({ path: path.join(outDir, 'm11_iphone_play.png') });
  await touches(B.cdp, 'touchEnd', []);
  const i1 = await view(B.page);
  expect(i0.y - i1.y > 80, 'iPhone: dragging the left thumb up walks up (' + Math.round(i0.y - i1.y) + ' px)');

  // ---------- phone joins a LAN room ----------
  if (addr) {
    const C = await phone(ANDROID, 915, 412, 'LAN phone');
    await C.page.goto(url);
    await C.page.waitForTimeout(500);
    await C.page.tap('#btnLan');
    await C.page.fill('#name', '表妹');
    await C.page.fill('#server', addr);
    await C.page.tap('#heroGo');
    await C.page.waitForFunction(() => !document.getElementById('lobby').hidden && document.querySelectorAll('#roomPlayers .room-player').length >= 1, null, { timeout: 10000 });
    await C.page.screenshot({ path: path.join(outDir, 'm12_room_phone.png') });
    const startBtn = await C.page.evaluate(() => {
      const r = document.getElementById('roomStart');
      r.scrollIntoView();
      return !r.hidden;
    });
    if (startBtn) await C.page.tap('#roomStart');
    await C.page.waitForFunction(() => document.getElementById('lobby').hidden && PF_DEBUG.view && PF_DEBUG.view.st === 'playing', null, { timeout: 15000 });
    // The map lives on the server here, so instead of clearing a path, pick a direction the phone's own
    // copy of the map shows as open for 420 px.
    const dir = await C.page.evaluate(() => {
      const v = PF_DEBUG.view;
      const obs = PF_DEBUG.session.map.obstacles.filter(o => !o.dead && ['bush', 'lantern', 'board'].indexOf(o.k) < 0);
      const size = PF_DEBUG.session.map.size;
      const others = v.ve.map(q => [q.x, q.y, 90]).concat(v.pl.filter(q => q.i !== v.you && !q.d).map(q => [q.x, q.y, 60]));
      const blocked = a => {
        for (let d = 0; d <= 420; d += 20) {
          const x = v.me.x + Math.cos(a) * d;
          const y = v.me.y + Math.sin(a) * d;
          if (x < 60 || y < 60 || x > size - 60 || y > size - 60) return true;
          if (others.some(q => Math.hypot(x - q[0], y - q[1]) < q[2])) return true;
          if (obs.some(o => Math.hypot(x - o.x, y - o.y) < (o.s === 'c' ? o.r : Math.max(o.hw, o.hh)) + 34)) return true;
        }
        return false;
      };
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (!blocked(a)) return a;
      }
      return Math.PI;
    });
    const l0 = await view(C.page);
    await touches(C.cdp, 'touchStart', [[1, 140, 300]]);
    for (let i = 1; i <= 6; i++) {
      await touches(C.cdp, 'touchMove', [[1, 140 + Math.cos(dir) * i * 10, 300 + Math.sin(dir) * i * 10]]);
      await C.page.waitForTimeout(30);
    }
    await C.page.waitForTimeout(900);
    await touches(C.cdp, 'touchEnd', []);
    const l1 = await view(C.page);
    const went = (l1.x - l0.x) * Math.cos(dir) + (l1.y - l0.y) * Math.sin(dir);
    expect(went > 80 && !(await C.page.evaluate(() => document.getElementById('touchUI').hidden)), 'a phone in a LAN match moves with the thumb stick (' + Math.round(went) + ' px toward ' + Math.round((dir * 180) / Math.PI) + ' degrees)');
    await C.page.screenshot({ path: path.join(outDir, 'm13_lan_phone.png') });
  }

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(!errors.length && !fails.length ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
