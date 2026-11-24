'use strict';
// Usage: node tests/browser_test.js [screenshot dir] [page url]
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const outDir = process.argv[2] || path.join(__dirname, 'shots');
const url = process.argv[3] || 'file://' + path.join(__dirname, '..', 'index.html') + '?debug&autoquiz';

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
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(outDir, '01_title.png') });
  await page.click('#tLang');
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(outDir, '01b_title_en.png') });
  await page.click('#tLang');
  await page.click('#btnRoyale');
  await page.waitForTimeout(300);
  await page.click('.hero-card:nth-child(2)');
  await page.fill('#name', 'Tester');
  await page.screenshot({ path: path.join(outDir, '02_heroes.png') });
  await page.click('#heroGo');
  await page.waitForTimeout(800);
  await page.mouse.move(900, 300);
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.keyboard.up('Space');
  await page.keyboard.press('ShiftLeft');
  await page.mouse.click(900, 300, { button: 'right' });
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
  await page.screenshot({ path: path.join(outDir, '03_royale.png') });
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '04_map.png') });
  await page.keyboard.press('KeyM');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outDir, '05_pause.png') });
  await page.click('#pauseResume');
  await page.waitForTimeout(400);
  const fps = await page.evaluate(() => new Promise(res => {
    let n = 0;
    const t0 = performance.now();
    function f() {
      n++;
      if (performance.now() - t0 < 2000) requestAnimationFrame(f);
      else res(n / ((performance.now() - t0) / 1000));
    }
    requestAnimationFrame(f);
  }));
  console.log('fps (headless, software render): ' + fps.toFixed(1));
  console.log('errors: ' + (errors.length ? '\n' + errors.join('\n') : 'none'));
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => {
  console.log('test failed: ' + e.message);
  process.exit(1);
});
