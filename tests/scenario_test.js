'use strict';
// Drives story mode and special situations through the opt-in ?debug hook and saves screenshots.
// Usage: node tests/scenario_test.js [screenshot dir]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const url = 'file://' + path.join(__dirname, '..', 'index.html') + '?debug';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  const notes = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  const shot = name => page.screenshot({ path: path.join(outDir, name) });
  const sim = fn => page.evaluate(fn);

  await page.goto(url);
  await page.waitForTimeout(800);
  await page.click('#btnStory');
  await page.click('.hero-card:nth-child(1)');
  await page.fill('#name', 'Tester');
  await page.click('#heroGo');
  await page.waitForTimeout(200);
  await shot('s0_chapters.png');
  await page.click('.chapter:nth-child(1)');
  await page.waitForTimeout(1200);
  await shot('s1_dialogue_prologue.png');
  for (let i = 0; i < 3; i++) {
    await page.click('#dialogue');
    await page.waitForTimeout(80);
  }
  await page.click('#dialogue');
  await page.waitForTimeout(900);
  await shot('s1b_dialogue_captain.png');
  await page.click('#dlgSkip');
  await page.waitForTimeout(1500);
  await page.mouse.move(900, 320);
  await shot('s2_ch1_start.png');
  notes.push('ch1 tip shown: ' + (await sim(() => document.querySelector('#dialogue').hidden)));

  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    me.slots[0] = { t: 'pan' };
    me.slots[1] = { t: 'chopsticks', m: 24 };
    me.skillCool = 0;
    const foe = s.players.find(p => p.team === 2);
    foe.ai.sleepT = 0;
    foe.x = me.x + 70;
    foe.y = me.y;
    me.input.aim = 0;
  });
  await page.mouse.move(1000, 430);
  await page.mouse.down();
  await page.waitForTimeout(160);
  await shot('s3_pan_swing.png');
  await page.mouse.up();
  await page.mouse.click(1000, 430, { button: 'right' });
  await page.waitForTimeout(150);
  await shot('s4_flame_skill.png');
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(250);
  await shot('s5_chopsticks.png');
  await page.mouse.up();

  await sim(() => {
    const s = PF_DEBUG.session.sim;
    for (const p of s.players) if (p.team === 2 && p.alive) s.killPlayer(p, PF_DEBUG.session.myId, 'pan');
  });
  await page.waitForTimeout(2200);
  await shot('s6_outro.png');
  const outroOpen = await sim(() => !!PF_DEBUG.dialogue);
  await sim(() => PF_DEBUG.endDialogue());
  await page.waitForTimeout(400);
  await shot('s7_chapter_clear.png');
  const clearTitle = await sim(() => document.getElementById('ovTitle').textContent);
  notes.push('ch1 outro opened: ' + outroOpen + ', result title: ' + clearTitle);

  await page.click('#ovAgain');
  await page.waitForTimeout(500);
  await sim(() => PF_DEBUG.endDialogue());
  await page.waitForTimeout(600);
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const box = [...s.items.values()].find(i => i.t === 'coldbox');
    me.x = box.x - 160;
    me.y = box.y;
  });
  await page.waitForTimeout(800);
  await shot('s8_ch2_coldbox.png');
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const box = [...s.items.values()].find(i => i.t === 'coldbox');
    me.x = box.x;
    me.y = box.y;
  });
  await page.waitForTimeout(300);
  const collected = await sim(() => PF_DEBUG.session.sim.story.collected);
  notes.push('ch2 crates collected after walking onto one: ' + collected);
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    s.story.tl = 0.5;
  });
  await page.waitForTimeout(2200);
  await shot('s9_ch2_fail.png');
  const failTitle = await sim(() => document.getElementById('ovTitle').textContent + ' / ' + document.getElementById('ovSub').textContent);
  notes.push('ch2 timeout result: ' + failTitle);

  await sim(() => PF_DEBUG.startChapter(4));
  await page.waitForTimeout(400);
  await sim(() => PF_DEBUG.endDialogue());
  await page.waitForTimeout(500);
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const boss = s.players.find(p => p.kind === 'boss');
    boss.ai.sleepT = 0;
    boss.x = me.x + 260;
    boss.y = me.y - 40;
    for (const p of s.players) {
      if (p.team === 1 && p !== me) {
        p.x = me.x - 60 + Math.random() * 40;
        p.y = me.y + 80 + Math.random() * 40;
      }
    }
  });
  await page.waitForTimeout(1600);
  await shot('s10_boss.png');
  const bossBar = await sim(() => !!PF_DEBUG.view.boss);
  notes.push('boss bar present: ' + bossBar);
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const boss = s.players.find(p => p.kind === 'boss');
    s.killPlayer(boss, PF_DEBUG.session.myId, 'pan');
  });
  await page.waitForTimeout(2300);
  await sim(() => {
    for (let i = 0; i < 3; i++) PF_DEBUG.advanceDialogue();
  });
  await page.waitForTimeout(1500);
  await shot('s11_ending.png');
  await sim(() => PF_DEBUG.endDialogue());
  await page.waitForTimeout(300);
  const endTitle = await sim(() => document.getElementById('ovTitle').textContent);
  const progress = await sim(() => localStorage.getItem('yw.progress'));
  notes.push('finale result title: ' + endTitle + ', saved progress: ' + progress);

  await page.click('#ovMenu');
  await page.click('#btnRoyale');
  await page.click('.hero-card:nth-child(3)');
  await page.click('#heroGo');
  await page.waitForTimeout(600);
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const ring = ['pan', 'cleaver', 'rollingpin', 'wok', 'swordfish', 'chopsticks', 'bowl', 'soup', 'bao', 'bag', 'rifle', 'shotgun'];
    ring.forEach((t, i) => {
      const a = (i / ring.length) * Math.PI * 2;
      s.spawnItem(me.x + Math.cos(a) * 170, me.y + Math.sin(a) * 130, t);
    });
    me.skillCool = 0;
    const bot = s.players.find(p => p.bot && p.alive);
    bot.x = me.x + 300;
    bot.y = me.y;
  });
  await page.mouse.click(1000, 430, { button: 'right' });
  await page.waitForTimeout(1200);
  await shot('s12_kitchen_loot_turret.png');
  await sim(() => {
    const s = PF_DEBUG.session.sim;
    const me = s.playerMap.get(PF_DEBUG.session.myId);
    const bot = s.players.find(p => p.bot && p.alive);
    s.damagePlayer(me, 999, bot.id, 'rifle');
  });
  await page.waitForTimeout(2200);
  await shot('s13_royale_death.png');
  const placed = await sim(() => document.getElementById('ovTitle').textContent);
  notes.push('royale death title: ' + placed);

  console.log(notes.join('\n'));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  const ok = !errors.length && outroOpen && collected === 1 && bossBar && progress === '5';
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
