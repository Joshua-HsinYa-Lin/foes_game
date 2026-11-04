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
    const b = sim.buildings.find(q => q.w >= 300) || sim.buildings[0];
    me.x = b.x;
    me.y = b.y;
    sim.spawnItem(me.x, me.y, 'rifle');
    sim.spawnItem(me.x + 70, me.y + 40, 'backpack');
    const ring = ['pistol', 'uzi', 'shotgun', 'sniper', 'minigun', 'knife', 'sword', 'syringe', 'medpack'];
    ring.forEach((t, i) => {
      const a = (i / ring.length) * Math.PI * 2;
      sim.spawnItem(me.x + Math.cos(a) * 120, me.y + Math.sin(a) * 90, t);
    });
  });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    me.x += 70;
    me.y += 40;
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    me.slots[1] = { t: 'sword' };
    me.slots[2] = { t: 'syringe' };
  });
  await page.mouse.down();
  await page.waitForTimeout(350);
  await page.mouse.up();
  await page.screenshot({ path: path.join(outDir, 's1_inside_building.png') });

  await page.keyboard.press('Digit2');
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(outDir, 's1b_sword.png') });
  await page.mouse.up();

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const v = sim.vehicles.find(q => q.t === 'car');
    me.x = v.x + 70;
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
    me.hp = 35;
    me.slots[2] = { t: 'syringe' };
  });
  await page.keyboard.press('Digit3');
  await page.waitForTimeout(300);
  await page.mouse.down();
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, 's3_healing.png') });
  await page.keyboard.up('KeyD');
  await page.keyboard.up('Space');
  await page.waitForTimeout(1200);
  const healed = await page.evaluate(() => PF_DEBUG.session.sim.playerMap.get(PF_DEBUG.session.myId).hp);

  await page.evaluate(() => {
    const sim = PF_DEBUG.session.sim;
    const me = sim.playerMap.get(PF_DEBUG.session.myId);
    const bot = sim.players.find(p => p.bot && p.alive);
    me.kills = 3;
    sim.damagePlayer(me, 500, bot.id, 'rifle');
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
    for (const p of sim.players) if (p.bot) sim.damagePlayer(p, 999, PF_DEBUG.session.myId, 'rifle');
  });
  await page.waitForTimeout(2000);
  const won = await page.evaluate(() => document.getElementById('ovTitle').textContent);
  await page.screenshot({ path: path.join(outDir, 's6_victory.png') });
  console.log('hp after syringe (was 35): ' + Math.round(healed));
  console.log('death overlay shown: ' + overlay1);
  console.log('victory title: ' + won);
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(errors.length || !overlay1 || won.indexOf('Victory') < 0 || healed < 90 ? 1 : 0);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
