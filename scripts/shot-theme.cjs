// shot-theme.cjs — 截图检视 MapViewer 浅色主题改造效果
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const OUT = path.join(__dirname, '..', 'test-shots');
fs.mkdirSync(OUT, { recursive: true });

const pages = [
  ['index.html', 'theme-index.png', 4000],
  ['pages/cities.html?city=shenzhen', 'theme-cities.png', 7000],
  ['pages/analysis.html?city=shenzhen', 'theme-analysis.png', 9000],
];

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });
  for (const [rel, shot, wait] of pages) {
    const ctx = await b.newContext({ viewport: { width: 1600, height: 900 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto(BASE + '/' + rel, { waitUntil: 'load', timeout: 25000 });
    await p.waitForTimeout(wait);
    // 四城记忆页点开一个地标，便于检视富信息卡片
    if (rel.includes('cities')) {
      await p.evaluate(() => {
        const li = document.querySelector('#city-detail .place-item');
        if (li) li.click();
      });
      await p.waitForTimeout(1200);
    }
    await p.screenshot({ path: path.join(OUT, shot) });
    console.log(`${shot}  ${errs.length ? 'ERR: ' + errs.slice(0, 2).join(' | ') : 'ok'}`);
    await ctx.close();
  }
  await b.close();
})();