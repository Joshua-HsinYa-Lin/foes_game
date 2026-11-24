'use strict';
// One person plays in the 2.5D view and one in the 2D view, in the same LAN match.
// Start a server first:  node server.js --port 8099
// then:  node tests/view_modes_test.js [server address]
const { chromium } = require('playwright');

const addr = process.argv[2] || 'localhost:8099';

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const notes = [];
  let ok = true;
  const check = (cond, msg) => {
    notes.push((cond ? 'ok   ' : 'FAIL ') + msg);
    if (!cond) ok = false;
  };
  const join = async (name, view, card) => {
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 760 } })).newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.goto('http://' + addr + '/?debug');
    await page.evaluate(v => localStorage.setItem('yw.view3d', v), view);
    await page.reload();
    await page.waitForTimeout(400);
    await page.click('#btnLan');
    await page.click('.hero-card:nth-child(' + card + ')');
    await page.fill('#name', name);
    await page.click('#heroGo');
    return page;
  };
  const alice = await join('Alice', '1', 1);
  await alice.waitForTimeout(300);
  const bob = await join('Bob', '0', 4);
  await alice.waitForFunction(() => PF_DEBUG.session.room && PF_DEBUG.session.room.players.length === 2, null, { timeout: 10000 });
  // Family co-op so the two start next to each other; one bot far away keeps the match going.
  await alice.click('#roomMode button[data-v="coop"]');
  await alice.$eval('#roomBots', el => {
    el.value = '1';
    el.dispatchEvent(new Event('change'));
  });
  await alice.click('#roomDiff button[data-v="1"]');
  await alice.waitForTimeout(300);
  await alice.click('#roomStart');
  for (const p of [alice, bob]) await p.waitForFunction(() => PF_DEBUG.view && PF_DEBUG.view.st === 'playing', null, { timeout: 15000 });
  await alice.waitForTimeout(800);

  // The start-of-match math problem: Alice solves first and can move; Bob is still solving.
  // qp is how many people are still solving; the bots come in when it reaches 0.
  const quiz = p => p.evaluate(() => ({ open: !document.getElementById('quiz').hidden, q: document.getElementById('quizQ').textContent, qp: PF_DEBUG.view.qp }));
  const qa = await quiz(alice);
  const qb = await quiz(bob);
  check(qa.open && qb.open && qa.q === qb.q && qa.qp === 2, 'both get the same math problem before they can move');
  await alice.waitForFunction(() => PF_DEBUG.solveQuiz(), null, { timeout: 5000 });
  await alice.waitForTimeout(600);
  const qa2 = await quiz(alice);
  const qb2 = await quiz(bob);
  check(!qa2.open && qb2.open && qa2.qp === 1, 'Alice solved it and plays while Bob is still solving');
  await bob.waitForFunction(() => PF_DEBUG.solveQuiz(), null, { timeout: 5000 });
  await bob.waitForTimeout(600);
  const qa3 = await quiz(alice);
  check(qa3.qp === 0, 'once Bob solves it too, nobody is left solving and the bots come in');

  const info = p => p.evaluate(() => ({ mode3d: PF_DEBUG.renderer.mode3d, area: PF_DEBUG.renderer.visibleArea(), you: PF_DEBUG.view.you, me: [PF_DEBUG.view.me.x, PF_DEBUG.view.me.y], tot: PF_DEBUG.view.tot }));
  const a = await info(alice);
  const b = await info(bob);
  check(a.mode3d === true && b.mode3d === false, 'Alice draws the 2.5D view, Bob the 2D view');
  check(a.tot === 3 && b.tot === 3, 'both are in the same match (2 people + 1 bot)');
  check(Math.abs(a.area / b.area - 1) < 0.05, 'both views show the same amount of map (' + Math.round(a.area) + ' and ' + Math.round(b.area) + ' square units)');

  const seen = (page, id) => page.evaluate(i => {
    const p = PF_DEBUG.view.pl.find(q => q.i === i);
    return p ? { x: p.x, y: p.y, a: p.a } : null;
  }, id);
  const bobSeesAlice = await seen(bob, a.you);
  check(bobSeesAlice && Math.hypot(bobSeesAlice.x - a.me[0], bobSeesAlice.y - a.me[1]) < 30, 'Bob sees Alice where she is');

  // Each points the mouse at the other on their own screen; the server must get the right world aim.
  const aimAt = async (page, target) => {
    for (let i = 0; i < 6; i++) {
      const t = await seen(page, target);
      const pt = await page.evaluate(q => PF_DEBUG.renderer.worldToScreen(q.x, q.y), t);
      await page.mouse.move(pt[0], pt[1]);
      await page.waitForTimeout(80);
    }
  };
  await aimAt(alice, b.you);
  await aimAt(bob, a.you);
  await alice.waitForTimeout(400);
  const a2 = await info(alice);
  const b2 = await info(bob);
  const aliceAimSeenByBob = await seen(bob, a.you);
  const bobAimSeenByAlice = await seen(alice, b.you);
  const want = (from, to) => Math.atan2(to[1] - from[1], to[0] - from[0]);
  const diff = (x, y) => Math.abs(Math.atan2(Math.sin(x - y), Math.cos(x - y)));
  check(diff(aliceAimSeenByBob.a, want(a2.me, b2.me)) < 0.15, 'Alice aims in 2.5D; Bob sees her facing him');
  check(diff(bobAimSeenByAlice.a, want(b2.me, a2.me)) < 0.15, 'Bob aims in 2D; Alice sees him facing her');

  // The map is random, so a tree or wall can be right in the way: if one direction is blocked, try the other.
  const walk = async (page, key, back, axis) => {
    for (const [k, sign] of [[key, 1], [back, -1]]) {
      const p0 = (await info(page)).me;
      await page.keyboard.down(k);
      await page.waitForTimeout(700);
      await page.keyboard.up(k);
      await page.waitForTimeout(400);
      const p1 = (await info(page)).me;
      if ((p1[axis] - p0[axis]) * sign > 100) return true;
    }
    return false;
  };
  const aliceMoved = await walk(alice, 'KeyD', 'KeyA', 0);
  const bobMoved = await walk(bob, 'KeyS', 'KeyW', 1);
  const a3 = await info(alice);
  const bobSeesAlice2 = await seen(bob, a.you);
  check(aliceMoved && bobMoved, 'both move: Alice sideways, Bob up or down');
  check(bobSeesAlice2 && Math.hypot(bobSeesAlice2.x - a3.me[0], bobSeesAlice2.y - a3.me[1]) < 30, 'Bob sees Alice\'s new position');

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? errors.join('\n') : 'none'));
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
