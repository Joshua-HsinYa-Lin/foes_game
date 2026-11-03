'use strict';
// Usage: node server.js --port 8099 --lobby 3 &  then  node tests/lan_test.js <screenshot dir> [url]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const url = process.argv[3] || 'http://localhost:8099/';

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  const pages = [];
  for (const name of ['Alice', 'Bob']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push(name + ' console: ' + m.text());
    });
    await page.goto(url);
    await page.waitForTimeout(500);
    await page.fill('#name', name);
    await page.click('#playLan');
    pages.push(page);
  }
  await pages[0].waitForTimeout(1000);
  await pages[0].screenshot({ path: path.join(outDir, 'lan_01_lobby.png') });
  await pages[0].waitForFunction(() => document.getElementById('lobby').hidden, null, { timeout: 20000 });
  await pages[1].waitForFunction(() => document.getElementById('lobby').hidden, null, { timeout: 20000 });
  await pages[0].waitForTimeout(1000);
  await pages[0].mouse.move(800, 300);
  await pages[0].keyboard.down('KeyD');
  await pages[1].keyboard.down('KeyA');
  await pages[0].waitForTimeout(1500);
  await pages[0].keyboard.up('KeyD');
  await pages[1].keyboard.up('KeyA');
  await pages[0].mouse.down();
  await pages[0].waitForTimeout(600);
  await pages[0].mouse.up();
  await pages[0].screenshot({ path: path.join(outDir, 'lan_02_alice.png') });
  await pages[1].screenshot({ path: path.join(outDir, 'lan_03_bob.png') });
  const info = await pages[0].evaluate(() => {
    const c = document.getElementById('game');
    return { w: c.width, h: c.height };
  });
  console.log('canvas ' + info.w + 'x' + info.h);
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
