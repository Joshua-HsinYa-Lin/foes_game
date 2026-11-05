'use strict';
// Checks the difficulty levels, the hidden details and the new sound triggers in the real page,
// through the opt-in ?debug hook, and saves screenshots.
// Usage: node tests/details_test.js [screenshot dir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const url = 'file://' + path.join(__dirname, '..', 'yunwang_paradise.html') + '?debug';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  const notes = [];
  const fails = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  const shot = name => page.screenshot({ path: path.join(outDir, name) });
  const ev = fn => page.evaluate(fn);
  const expect = (cond, msg) => {
    notes.push((cond ? 'ok   ' : 'FAIL ') + msg);
    if (!cond) fails.push(msg);
  };

  await page.goto(url);
  await page.waitForTimeout(700);
  await ev(() => {
    PF_Sound.played = [];
    const orig = PF_Sound.play.bind(PF_Sound);
    PF_Sound.play = (t, o) => {
      PF_Sound.played.push(t);
      return orig(t, o);
    };
  });
  const played = () => ev(() => PF_Sound.played.splice(0));

  const sum0 = await ev(() => document.getElementById('secretsSum').textContent);
  expect(/0\/6/.test(sum0), 'title shows the hidden-details counter: ' + sum0);
  await page.hover('#btnRoyale');
  await page.hover('#btnStory');
  expect((await played()).indexOf('hover') >= 0, 'hovering menu buttons plays the hover tick');

  await page.click('#btnRoyale');
  const seg = await ev(() => Array.from(document.querySelectorAll('#diff button')).map(b => b.textContent + (b.classList.contains('on') ? '*' : '')));
  expect(seg.length === 5 && seg[1].endsWith('*'), 'hero screen has 5 difficulty levels, level 2 picked for a new player: ' + seg.join(' | '));
  await page.click('#diff button[data-v="1"]');
  const hint = await ev(() => document.getElementById('diffHint').textContent);
  expect(hint.length > 5 && (await ev(() => localStorage.getItem('yw.diff'))) === '1', 'picking level 1 saves it and shows its hint: ' + hint);
  await shot('d1_difficulty_levels.png');
  await page.click('.hero-card:nth-child(2)');
  await page.click('#heroGo');
  await page.waitForTimeout(800);
  expect((await played()).indexOf('gong') >= 0, 'a match start plays the gong');
  expect((await ev(() => PF_DEBUG.session.sim.difficulty)) === 1, 'the match runs at level 1');

  await ev(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    for (const p of s.players) {
      if (p === me) continue;
      p.x = 150;
      p.y = 150;
      p.ai.sleepT = 9999;
    }
    me.slots[1] = { t: 'rifle', m: 30 };
  });

  const teleport = (kind) => page.evaluate(k => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    let x;
    let y;
    if (k === 'cat') {
      s.cat.sitT = 20;
      x = s.cat.x + 34;
      y = s.cat.y;
    } else if (k === 'gold') {
      x = s.gold.x + 120;
      y = s.gold.y;
    } else {
      const sc = s.secrets.find(q => q.id === k);
      x = sc.x;
      y = sc.y + (k === 'notice' ? 40 : 0);
    }
    for (const it of [...s.items.values()]) if (Math.hypot(it.x - x, it.y - y) < 90) s.removeItem(it);
    me.x = x;
    me.y = y;
    me.vx = 0;
    me.vy = 0;
  }, kind);

  await teleport('notice');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  const note = await ev(() => ({ open: !document.getElementById('note').hidden, title: document.getElementById('noteTitle').textContent }));
  expect(note.open && note.title.length > 3, 'F at the notice board opens the note: ' + note.title);
  await shot('d2_notice_note.png');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(200);
  expect(await ev(() => document.getElementById('note').hidden), 'F closes the note');
  let snd = await played();
  expect(snd.indexOf('secret') >= 0 && snd.indexOf('paper') >= 0, 'finding a secret plays the jingle and the paper sound');

  await teleport('cat');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(450);
  await shot('d3_cat.png');
  snd = await played();
  expect(snd.indexOf('meow') >= 0, 'petting the cat meows');

  await teleport('gold');
  await page.waitForTimeout(300);
  await shot('d4_golden_dumpling.png');
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyA');
  await page.waitForTimeout(200);
  snd = await played();
  const goldTaken = await ev(() => PF_DEBUG.session.sim.gold.taken);
  expect(goldTaken, 'walking onto the golden dumpling takes it');
  expect(snd.indexOf('step') >= 0, 'walking plays footsteps');

  for (const k of ['log', 'recipe']) {
    await teleport(k);
    await page.waitForTimeout(300);
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(350);
    expect(await ev(() => !document.getElementById('note').hidden), 'F at the ' + k + ' opens its note');
    if (k === 'log') await shot('d5_logbook.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  expect(await ev(() => document.getElementById('pause').hidden), 'Esc closes the note without opening the pause menu');

  await page.keyboard.press('Digit2');
  await page.waitForTimeout(250);
  expect((await played()).indexOf('switch') >= 0, 'switching weapons clicks');

  await ev(() => {
    PF_DEBUG.session.sim.planeT = 0;
  });
  await page.waitForTimeout(150);
  await ev(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    me.x = s.plane.tx - 60;
    me.y = s.plane.ty + 140;
  });
  await page.waitForTimeout(4900);
  await shot('d6_cargo_plane.png');
  await page.waitForTimeout(1600);
  await shot('d7_airdrop_falling.png');
  const planeSnd = await played();
  expect(planeSnd.indexOf('plane') >= 0, 'the cargo plane plays its engine sound');
  await page.waitForTimeout(3300);
  await ev(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const d = [...s.items.values()].find(i => i.t === 'drop');
    for (const it of [...s.items.values()]) if (it !== d && Math.hypot(it.x - d.x, it.y - d.y) < 90) s.removeItem(it);
    me.x = d.x;
    me.y = d.y;
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(600);
  await shot('d8_airdrop_opened.png');
  snd = planeSnd.concat(await played());
  expect(snd.indexOf('landDrop') >= 0 && snd.indexOf('unlock') >= 0, 'the airdrop thuds on landing and clicks open');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const pause = await ev(() => ({ open: !document.getElementById('pause').hidden, row: !document.getElementById('pauseDiffRow').hidden, n: document.querySelectorAll('#pauseDiff button').length, on: (document.querySelector('#pauseDiff button.on') || {}).textContent }));
  expect(pause.open && pause.row && pause.n === 5 && /1/.test(pause.on || ''), 'pause menu shows the 5 levels with level 1 picked');
  await page.click('#pauseDiff button[data-v="3"]');
  await page.waitForTimeout(150);
  await shot('d9_pause_difficulty.png');
  expect((await ev(() => PF_DEBUG.session.sim.difficulty)) === 3, 'changing the level in the pause menu applies to the running match');
  await page.click('#pauseQuit');
  await page.waitForTimeout(500);

  const found = await ev(() => ({ sum: document.getElementById('secretsSum').textContent, saved: localStorage.getItem('yw.secrets') }));
  expect(/6\/6/.test(found.sum), 'all six hidden details are counted on the title screen: ' + found.sum + ' (' + found.saved + ')');
  await ev(() => {
    document.getElementById('secrets').open = true;
  });
  await page.waitForTimeout(150);
  await shot('d10_title_secrets.png');

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(!errors.length && !fails.length ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
