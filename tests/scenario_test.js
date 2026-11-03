'use strict';
// Drives specific situations through the opt-in ?debug hook and saves screenshots.
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
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  await page.goto(url);
  await page.waitForTimeout(500);
  await page.fill('#name', 'Tester');
  await page.click('#playSolo');
  await page.waitForTimeout(500);
  await page.mouse.move(980, 330);

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const b = sim.buildings.find(q => q.type === 'house' && q.w >= 300) || sim.buildings[0];
    me.x = b.x;
    me.y = b.y;
    sim.spawnLoot(me.x, me.y, 'gun', 'rifle', 1);
    sim.spawnLoot(me.x, me.y, 'gun', 'shotgun', 1);
    sim.spawnLoot(me.x, me.y, 'vest', 2, 1);
    sim.spawnLoot(me.x, me.y, 'helmet', 3, 1);
    sim.spawnLoot(me.x, me.y, 'pack', 2, 1);
    sim.spawnLoot(me.x, me.y, 'ammo', 'medium', 60);
    sim.spawnLoot(me.x, me.y, 'heal', 'bandage', 5);
    sim.spawnLoot(me.x, me.y, 'heal', 'medkit', 2);
    sim.spawnLoot(me.x, me.y, 'frag', 'frag', 2);
    sim.spawnLoot(me.x, me.y, 'scope', 2, 1);
    for (const k of ['gun', 'heal', 'vest', 'ammo', 'scope', 'pack', 'helmet', 'frag', 'melee']) {
      sim.spawnLoot(me.x + 60 + Math.random() * 40, me.y + 60, k === 'gun' ? 'gun' : k, k === 'gun' ? 'sniper' : k === 'heal' ? 'soda' : k === 'ammo' ? 'heavy' : k === 'frag' ? 'frag' : k === 'melee' ? 'hatchet' : 3, k === 'ammo' ? 10 : 1);
    }
  });
  await page.waitForTimeout(700);
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(400);
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.screenshot({ path: path.join(outDir, 's1_inside_building_geared.png') });

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const v = sim.vehicles.find(q => q.t === 'jeep');
    me.x = v.x + 60;
    me.y = v.y;
    sim.pushAction(me.id, { a: 'interact' });
  });
  await page.waitForTimeout(200);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 's2_driving.png') });
  await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const bot = sim.players.find(p => p.bot && p.alive);
    bot.x = me.x + 220;
    bot.y = me.y;
    sim.spawnLoot(me.x - 150, me.y, 'frag', 'frag', 1);
    me.hp = 40;
    sim.pushAction(me.id, { a: 'use', item: 'medkit' });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(outDir, 's3_healing.png') });

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const bot = sim.players.find(p => p.bot && p.alive);
    me.kills = 3;
    sim.damagePlayer(me, 500, bot.id, 'rifle', false);
  });
  await page.waitForTimeout(2200);
  const overlay1 = await page.evaluate(() => !document.getElementById('overlay').hidden);
  await page.screenshot({ path: path.join(outDir, 's4_death.png') });
  await page.click('#ovSpectate');
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(outDir, 's5_spectate.png') });
  await page.click('#specAgain');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    for (const p of sim.players) if (p.bot) sim.damagePlayer(p, 999, PF_DEBUG.session.myId, 'rifle', false);
  });
  await page.waitForTimeout(2000);
  const won = await page.evaluate(() => document.getElementById('ovTitle').textContent);
  await page.screenshot({ path: path.join(outDir, 's6_victory.png') });
  console.log('death overlay shown: ' + overlay1);
  console.log('victory title: ' + won);
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(errors.length || !overlay1 || won.indexOf('Victory') < 0 ? 1 : 0);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
