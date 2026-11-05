'use strict';
// Multiplayer room test. Start a server first:  node server.js --port 8099
// then:  node tests/lan_test.js [screenshot dir] [server address]
// Alice and Bob open the page the server serves; Carol opens the single-file build from disk
// and types the server address. Alice (host) sets the bots and starts the match.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const addr = process.argv[3] || 'localhost:8099';
const fileUrl = 'file://' + path.join(__dirname, '..', 'yunwang_paradise.html') + '?debug';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const notes = [];
  const pages = {};
  const join = async (name, url, card, typeAddr) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(name + ' console: ' + m.text());
    });
    await page.goto(url);
    await page.waitForTimeout(500);
    await page.click('#btnLan');
    await page.click('.hero-card:nth-child(' + card + ')');
    await page.fill('#name', name);
    if (typeAddr) await page.fill('#server', addr);
    await page.click('#heroGo');
    pages[name] = page;
    return page;
  };
  const alice = await join('Alice', 'http://' + addr + '/?debug', 1, false);
  await alice.waitForTimeout(400);
  const bob = await join('Bob', 'http://' + addr + '/?debug', 4, false);
  const carol = await join('Carol', fileUrl, 2, true);
  await carol.waitForFunction(() => document.querySelectorAll('#roomPlayers .room-player').length === 3, null, { timeout: 10000 });
  await alice.waitForTimeout(500);

  const hostView = await alice.evaluate(() => ({ start: !document.getElementById('roomStart').hidden, slider: !document.getElementById('roomBots').disabled }));
  const guestView = await bob.evaluate(() => ({ start: !document.getElementById('roomStart').hidden, slider: !document.getElementById('roomBots').disabled }));
  notes.push('host controls: ' + JSON.stringify(hostView) + ', guest controls: ' + JSON.stringify(guestView));

  await alice.$eval('#roomBots', el => {
    el.value = '3';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  await alice.click('#roomDiff button[data-v="5"]');
  await bob.waitForFunction(() => document.getElementById('roomSummary').textContent.indexOf('+ 3 ') >= 0 && document.querySelector('#roomDiff button[data-v="5"]').classList.contains('on'), null, { timeout: 5000 });
  const bobSummary = await bob.evaluate(() => document.getElementById('roomSummary').textContent + ' | level 5 on: ' + document.querySelector('#roomDiff button[data-v="5"]').classList.contains('on') + ' | buttons: ' + document.querySelectorAll('#roomDiff button').length);
  const serverDiff = await alice.evaluate(() => PF_DEBUG.session.room.diff);
  notes.push('Bob sees: ' + bobSummary + ' (room level ' + serverDiff + ')');
  const lobbyMusic = await carol.evaluate(() => PF_Sound.current + ' / mode ' + PF_Sound.mode);
  notes.push('Carol music in lobby: ' + lobbyMusic);
  await alice.screenshot({ path: path.join(outDir, 'lan_01_room_host.png') });
  await carol.screenshot({ path: path.join(outDir, 'lan_02_room_guest_file.png') });

  await alice.click('#roomStart');
  for (const p of [alice, bob, carol]) await p.waitForFunction(() => document.getElementById('lobby').hidden && window.PF_DEBUG && PF_DEBUG.view, null, { timeout: 15000 });
  await alice.waitForTimeout(800);
  const total = await alice.evaluate(() => PF_DEBUG.view.tot);
  const gameMusic = await carol.evaluate(() => PF_Sound.current + ' / mode ' + PF_Sound.mode);
  notes.push('players in match: ' + total + ' (expected 3 people + 3 bots = 6); Carol music in match: ' + gameMusic);
  await alice.mouse.move(800, 300);
  await alice.keyboard.down('KeyD');
  await bob.keyboard.down('KeyA');
  await carol.keyboard.down('KeyW');
  await alice.waitForTimeout(1200);
  await alice.keyboard.up('KeyD');
  await bob.keyboard.up('KeyA');
  await carol.keyboard.up('KeyW');
  await alice.screenshot({ path: path.join(outDir, 'lan_03_alice_match.png') });
  await carol.screenshot({ path: path.join(outDir, 'lan_04_carol_match.png') });

  // Fresh room: everyone leaves, two people come back, the host picks 0 bots, Bob leaves mid-match,
  // Alice is the last one standing and the room returns on its own.
  for (const p of [alice, bob, carol]) await p.close();
  await new Promise(r => setTimeout(r, 1200));
  const dana = await join('Dana', 'http://' + addr + '/?debug', 3, false);
  await dana.waitForTimeout(400);
  const eli = await join('Eli', fileUrl, 1, true);
  await dana.waitForFunction(() => document.querySelectorAll('#roomPlayers .room-player').length === 2, null, { timeout: 10000 });
  await dana.$eval('#roomBots', el => {
    el.value = '0';
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
  });
  await dana.waitForTimeout(400);
  await dana.click('#roomStart');
  await dana.waitForFunction(() => document.getElementById('lobby').hidden && PF_DEBUG.view, null, { timeout: 15000 });
  const total2 = await dana.evaluate(() => PF_DEBUG.view.tot);
  await eli.close();
  await dana.waitForFunction(() => !document.getElementById('overlay').hidden, null, { timeout: 15000 });
  const winTitle = await dana.evaluate(() => document.getElementById('ovTitle').textContent);
  await dana.waitForFunction(() => !document.getElementById('lobby').hidden, null, { timeout: 20000 });
  await dana.waitForTimeout(500);
  const backMusic = await dana.evaluate(() => PF_Sound.current + ' / mode ' + PF_Sound.mode);
  const roomAfter = await dana.evaluate(() => {
    const r = PF_DEBUG.session.room;
    return { state: r.state, players: r.players.length, startVisible: !document.getElementById('roomStart').hidden, summary: document.getElementById('roomSummary').textContent };
  });
  notes.push('0-bot match players: ' + total2 + ' (expected 2); Dana saw: ' + winTitle);
  notes.push('after match: back in room ' + JSON.stringify(roomAfter) + ', music ' + backMusic);
  await dana.screenshot({ path: path.join(outDir, 'lan_05_back_in_room.png') });
  await dana.click('#roomStart');
  await dana.waitForFunction(() => document.getElementById('lobby').hidden && PF_DEBUG.view && PF_DEBUG.view.st === 'playing', null, { timeout: 15000 });
  const total3 = await dana.evaluate(() => PF_DEBUG.view.tot);
  notes.push('solo host match players: ' + total3 + ' (expected 1 person + 1 bot minimum = 2)');

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  const ok = !errors.length && serverDiff === 5 && bobSummary.indexOf('level 5 on: true') >= 0 && hostView.start && hostView.slider && !guestView.start && !guestView.slider && total === 6 && lobbyMusic.startsWith('quiet') && gameMusic.startsWith('theme') && roomAfter.state === 'lobby' && roomAfter.startVisible && backMusic.startsWith('quiet') && total2 === 2 && total3 === 2;
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
