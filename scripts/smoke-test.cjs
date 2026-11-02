// smoke-test.cjs — 用 Playwright 对《山海新篇》保留页面做冒烟测试
// 覆盖：首页、四城记忆、分析实验室、保留页交互与跨页导航。
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const OUT = path.join(__dirname, '..', 'test-shots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
function benign(e) {
  return /tianditu|tile|net::|Failed to (fetch|load)|ERR_|403|401|getImageData|404|cross-origin|Access-Control/i.test(e);
}

async function checkPage(browser, url, opts) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push('PAGEERROR: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push('CONSOLE: ' + m.text()); });
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(opts.wait || 4000);
    const checks = await page.evaluate(opts.eval);
    await page.screenshot({ path: path.join(OUT, opts.shot) });
    log(opts.label, checks.ok !== false && errors.length === 0, (checks.detail || '') + (errors.length ? ' | ERRORS: ' + errors.slice(0, 4).join(' ;; ') : ''));
  } catch (e) {
    log(opts.label, false, 'EXCEPTION: ' + e.message);
  } finally {
    await ctx.close();
  }
}

const navLabels = () => [...document.querySelectorAll('.topnav-link')].map((a) => a.textContent.trim());

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  // 1. 首页：四城卡片 + 两大入口 + 导航仅保留两个模块
  await checkPage(browser, BASE + '/index.html', {
    label: 'index 首页', shot: 'index.png', wait: 3500,
    eval: () => {
      const cards = document.querySelectorAll('.city-card').length;
      const entries = document.querySelectorAll('.chapter').length;
      const labels = [...document.querySelectorAll('.topnav-link')].map((a) => a.textContent.trim());
      const noRemovedNav = !labels.some((l) => /历史文化|改革开放/.test(l));
      const noDemo = !document.getElementById('btn-demo');
      const noFooterMeta = !document.querySelector('.footer-meta');
      return {
        ok: cards === 4 && entries === 2 && labels.length === 3 && noRemovedNav && noDemo && noFooterMeta,
        detail: `cityCards=${cards},chapters=${entries},nav=${labels.join('/')},noRemovedNav=${noRemovedNav},noDemo=${noDemo},noFooterMeta=${noFooterMeta}`,
      };
    },
  });

  // 2. 四城记忆
  await checkPage(browser, BASE + '/pages/cities.html?city=shenzhen', {
    label: 'cities 四城记忆', shot: 'cities.png', wait: 6000,
    eval: () => {
      const tabs = document.querySelectorAll('#city-tabs .city-tab').length;
      const intro = document.getElementById('city-intro').textContent.length;
      const canvas = !!document.querySelector('#map-city canvas');
      const mapW = Math.round(document.querySelector('#map-root').getBoundingClientRect().width);
      const labels = [...document.querySelectorAll('.topnav-link')].map((a) => a.textContent.trim());
      const navOk = labels.length === 3 && labels.includes('四城记忆') && labels.includes('分析实验室') && !labels.some((l) => /历史文化|改革开放/.test(l));
      return { ok: tabs === 4 && intro > 20 && canvas && mapW > 700 && navOk, detail: `tabs=${tabs},introLen=${intro},canvas=${canvas},mapW=${mapW},navOk=${navOk}` };
    },
  });

  // 3. 四城记忆：点击地标清单打开富信息卡片
  await checkPage(browser, BASE + '/pages/cities.html?city=shenzhen', {
    label: 'cities 富卡片交互', shot: 'cities-card.png', wait: 6000,
    eval: () => new Promise((res) => {
      const item = document.querySelector('#city-detail .place-item');
      if (item) item.click();
      setTimeout(() => {
        const o = document.querySelector('.rich-overlay.show');
        res({ ok: !!o && o.textContent.trim().length > 50, detail: `overlay=${!!o},len=${o ? o.textContent.trim().length : 0}` });
      }, 600);
    }),
  });

  // 4. 分析实验室：建成区卷帘统计 + 缓冲区模块
  await checkPage(browser, BASE + '/pages/analysis.html?city=shenzhen', {
    label: 'analysis 分析实验室', shot: 'analysis-a.png', wait: 8000,
    eval: () => new Promise((res) => {
      setTimeout(() => {
        const stats = document.querySelectorAll('#bu-stats .stat-box').length;
        const bufStats = document.querySelectorAll('#pg-buf-stats .stat-box').length;
        const canvasA = !!document.querySelector('#map-a canvas');
        const noTabs = !document.getElementById('lab-tabs');
        const noB = !document.getElementById('block-b') && !document.getElementById('b-controls');
        const api = !!window.analysisAPI;
        const vals = [...document.querySelectorAll('#bu-stats .stat-box')].map((b) => b.querySelector('.sb-value').textContent.trim());
        const areaA = vals[0] || '';
        const areaOk = /km|万/.test(areaA) && areaA !== '—' && !/^0/.test(areaA);
        res({ ok: stats === 5 && bufStats === 4 && canvasA && noTabs && noB && api && areaOk, detail: `stats=${stats},bufStats=${bufStats},canvasA=${canvasA},noTabs=${noTabs},noB=${noB},areaA="${areaA}"` });
      }, 1500);
    }),
  });

  // 5. 子页导航解析正确性（品牌 + 两个保留模块）
  await checkPage(browser, BASE + '/pages/analysis.html', {
    label: 'subpage nav 解析', shot: 'nav-resolve.png', wait: 4000,
    eval: () => {
      const brand = document.querySelector('.brand');
      const links = [...document.querySelectorAll('.topnav-link')];
      const cities = links.find((a) => a.textContent.includes('四城记忆'));
      const analysis = links.find((a) => a.textContent.includes('分析实验室'));
      const abs = (a) => new URL(a.getAttribute('href'), location.href).pathname;
      const brandAbs = abs(brand);
      const citiesAbs = cities ? abs(cities) : '';
      const analysisAbs = analysis ? abs(analysis) : '';
      const ok = brandAbs.endsWith('/index.html') && citiesAbs.endsWith('/pages/cities.html') && analysisAbs.endsWith('/pages/analysis.html') && links.length === 3;
      return { ok, detail: `brand=${brandAbs},cities=${citiesAbs},analysis=${analysisAbs},navCount=${links.length}` };
    },
  });

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n==== 结果：${results.length - fails}/${results.length} 通过 ====`);
  process.exit(fails ? 1 : 0);
})();
