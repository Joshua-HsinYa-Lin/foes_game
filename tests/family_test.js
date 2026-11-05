'use strict';
// Eight people in one room, as at a family get-together. Start a server first:
//   node server.js --port 8099 --stats
// then:  node tests/family_test.js [screenshot dir] [server address]
// Six people open the page the server serves, two open the single-file build and type the address.
// Round 1: red vs blue with chosen sides. Round 2: everyone leaves and comes back for family co-op.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const addr = process.argv[3] || 'localhost:8099';
const served = 'http://' + addr + '/?debug';
const fileUrl = 'file://' + path.join(__dirname, '..', 'yunwang_paradise.html') + '?debug';
const FAMILY = [
  { name: '阿嬤', card: 1, team: 1 },
  { name: '阿公', card: 2, team: 2 },
  { name: '爸爸', card: 3, team: 1 },
  { name: '媽媽', card: 4, team: 2 },
  { name: 'Auhsoj', card: 3, team: 1, file: true },
  { name: '允望', card: 1, team: 2 },
  { name: '阿姨', card: 4, team: 1, file: true },
  { name: '表弟', card: 2, team: 2 }
];

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

  const join = async (who) => {
    const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(who.name + ' pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(who.name + ' console: ' + m.text());
    });
    await page.goto(who.file ? fileUrl : served);
    await page.waitForTimeout(300);
    await page.click('#btnLan');
    await page.click('.hero-card:nth-child(' + who.card + ')');
    await page.fill('#name', who.name);
    if (who.file) await page.fill('#server', addr);
    await page.click('#heroGo');
    return { who, page, ctx };
  };

  const room = async () => {
    const people = [];
    for (const who of FAMILY) {
      people.push(await join(who));
      await people[0].page.waitForTimeout(120);
    }
    await people[0].page.waitForFunction(n => document.querySelectorAll('#roomPlayers .room-player').length === n, FAMILY.length, { timeout: 15000 });
    return people;
  };

  const playFor = async (people, ms) => {
    const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
    const t0 = Date.now();
    let k = 0;
    while (Date.now() - t0 < ms) {
      for (const p of people) {
        const key = keys[(k + people.indexOf(p)) % 4];
        await p.page.keyboard.down(key);
        await p.page.mouse.move(200 + ((k * 137 + people.indexOf(p) * 71) % 560), 150 + ((k * 89) % 300));
        await p.page.mouse.down();
      }
      await people[0].page.waitForTimeout(700);
      for (const p of people) {
        await p.page.mouse.up();
        for (const key of keys) await p.page.keyboard.up(key);
      }
      k++;
    }
  };

  const measure = page => page.evaluate(() => new Promise(resolve => {
    const ws = PF_DEBUG.session.ws;
    let msgs = 0;
    let frames = 0;
    const onMsg = () => msgs++;
    ws.addEventListener('message', onMsg);
    const t0 = performance.now();
    const raf = () => {
      frames++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
    setTimeout(() => {
      ws.removeEventListener('message', onMsg);
      resolve({ snapsPerSec: msgs / 2, fps: frames / 2 });
    }, 2000);
  }));

  // Round 1: red vs blue.
  let people = await room();
  const host = people[0].page;
  await host.click('#roomMode button[data-v="teams"]');
  await host.waitForTimeout(300);
  for (const p of people) {
    await p.page.waitForFunction(() => !document.getElementById('roomTeamRow').hidden, null, { timeout: 5000 });
    await p.page.click('#roomTeam button[data-v="' + p.who.team + '"]');
  }
  await host.$eval('#roomBots', el => {
    el.value = '6';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  await host.click('#roomDiff button[data-v="2"]');
  await host.waitForTimeout(600);
  const roomView = await people[7].page.evaluate(() => ({
    cards: document.querySelectorAll('#roomPlayers .room-player').length,
    red: document.querySelectorAll('#roomPlayers .room-player.team1').length,
    blue: document.querySelectorAll('#roomPlayers .room-player.team2').length,
    summary: document.getElementById('roomSummary').textContent,
    guestCanStart: !document.getElementById('roomStart').hidden
  }));
  expect(roomView.cards === 8 && roomView.red === 4 && roomView.blue === 4 && !roomView.guestCanStart, 'room with 8 people, 4 red and 4 blue, seen by the last to join: ' + roomView.summary);
  await host.screenshot({ path: path.join(outDir, 'f1_room_8_people.png') });
  await host.click('#roomStart');
  for (const p of people) await p.page.waitForFunction(() => document.getElementById('lobby').hidden && window.PF_DEBUG && PF_DEBUG.view && PF_DEBUG.view.st === 'playing', null, { timeout: 15000 });
  const start = await Promise.all(people.map(p => p.page.evaluate(() => ({ tot: PF_DEBUG.view.tot, tm: PF_DEBUG.view.me.tm, mode: PF_DEBUG.view.tmode, ta: PF_DEBUG.view.ta }))));
  expect(start.every(v => v.tot === 14 && v.mode === 'teams'), 'everyone is in one red-vs-blue match of 14 (8 people + 6 bots)');
  expect(start.every((v, i) => v.tm === FAMILY[i].team), 'everyone is on the side they picked');
  expect(start[0].ta && start[0].ta[0] === 7 && start[0].ta[1] === 7, 'bots even the sides out: ' + JSON.stringify(start[0].ta));
  await playFor(people, 8000);
  const m1 = await measure(people[4].page);
  const m2 = await measure(people[0].page);
  notes.push('     snapshots/s and frames/s with 8 browsers on one test machine: file:// player ' + JSON.stringify(m1) + ', served player ' + JSON.stringify(m2));
  expect(m1.snapsPerSec >= 20 && m2.snapsPerSec >= 20, 'every player keeps getting at least 20 snapshots a second');
  await people[0].page.screenshot({ path: path.join(outDir, 'f2_teams_red_view.png') });
  await people[1].page.screenshot({ path: path.join(outDir, 'f3_teams_blue_view.png') });
  const seen = await people[0].page.evaluate(() => {
    const v = PF_DEBUG.view;
    return v.pl.filter(p => p.hu && p.i !== v.you).map(p => p.n + ':' + p.tm).join(', ');
  });
  notes.push('     阿嬤 can see: ' + (seen || 'no one nearby'));

  for (const p of people) await p.ctx.close();
  await new Promise(r => setTimeout(r, 1500));

  // Round 2: family co-op, everyone comes back.
  people = await room();
  const host2 = people[0].page;
  await host2.click('#roomMode button[data-v="coop"]');
  await host2.$eval('#roomBots', el => {
    el.value = '12';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  await host2.click('#roomDiff button[data-v="3"]');
  await host2.waitForTimeout(500);
  const hint = await people[3].page.evaluate(() => ({ hint: document.getElementById('roomModeHint').textContent, teamRow: !document.getElementById('roomTeamRow').hidden }));
  expect(hint.hint.length > 10 && !hint.teamRow, 'co-op explains itself and hides the side picker: ' + hint.hint);
  await host2.screenshot({ path: path.join(outDir, 'f4_room_coop.png') });
  await host2.click('#roomStart');
  for (const p of people) await p.page.waitForFunction(() => document.getElementById('lobby').hidden && window.PF_DEBUG && PF_DEBUG.view && PF_DEBUG.view.st === 'playing', null, { timeout: 15000 });
  const coop = await Promise.all(people.map(p => p.page.evaluate(() => ({ tot: PF_DEBUG.view.tot, tm: PF_DEBUG.view.me.tm, ta: PF_DEBUG.view.ta }))));
  expect(coop.every(v => v.tot === 20 && v.tm === 1), 'co-op: all 8 on the family side against 12 bots');
  // Watch every page for a fall and a return during the next stretch of play.
  for (const p of people) {
    await p.page.evaluate(() => {
      window.__downs = 0;
      window.__backs = 0;
      let was = true;
      setInterval(() => {
        const v = PF_DEBUG.view;
        if (!v) return;
        if (was && !v.me.alive) window.__downs++;
        if (!was && v.me.alive) window.__backs++;
        was = v.me.alive;
      }, 100);
    });
  }
  await playFor(people, 30000);
  await host2.screenshot({ path: path.join(outDir, 'f5_coop_play.png') });
  const downs = await Promise.all(people.map(p => p.page.evaluate(() => [window.__downs, window.__backs, PF_DEBUG.view.st, document.getElementById('overlay').hidden])));
  const totalDowns = downs.reduce((a, d) => a + d[0], 0);
  const totalBacks = downs.reduce((a, d) => a + d[1], 0);
  notes.push('     co-op, 30 s at level 3: ' + totalDowns + ' falls, ' + totalBacks + ' returns; per person [falls, returns, state, overlay hidden]: ' + JSON.stringify(downs));
  expect(totalDowns === 0 || totalBacks > 0, 'fallen family members come back while the match goes on');
  const downPage = people.find((p, i) => downs[i][0] > downs[i][1]);
  if (downPage) await downPage.page.screenshot({ path: path.join(outDir, 'f6_coop_waiting_to_return.png') });

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? '\n' + errors.slice(0, 10).join('\n') : 'none'));
  await browser.close();
  process.exit(!errors.length && !fails.length ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
