// scripts/verify-fullstack.cjs — 验证全栈架构 (Node.js + PostGIS + GeoServer) 与三步改进项
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const OUT = path.join(__dirname, '..', 'test-shots');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const page = await ctx.newPage();

  // 1. 验证后端 /api/status (Node.js + PostGIS + GeoServer 全部在线)
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 20000 });
  const statusRes = await page.evaluate(async () => {
    const r = await fetch(location.origin + '/api/status');
    return r.json();
  });
  console.log('1. /api/status:', JSON.stringify({
    postgisOnline: statusRes.postgis && statusRes.postgis.online,
    geoserverOnline: statusRes.geoserver && statusRes.geoserver.online,
    counts: statusRes.postgis && statusRes.postgis.counts,
  }));

  // 2. 验证站点范围：导航仅两个模块，已下线页面返回 404
  await page.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(1200);
  const scopeCheck = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.topnav-link')].map((a) => a.textContent.trim());
    return {
      nav: labels,
      chapters: document.querySelectorAll('.chapter').length,
      noRemovedNav: !labels.some((l) => /历史文化|改革开放/.test(l)),
    };
  });
  const removedStatus = {};
  for (const p of ['/pages/history.html', '/pages/reform.html']) {
    const resp = await page.goto(BASE + p, { waitUntil: 'load', timeout: 20000 });
    removedStatus[p] = resp ? resp.status() : null;
  }
  console.log('2. 站点范围校验:', JSON.stringify({ ...scopeCheck, removedStatus }));

  // 3. 验证四城记忆页：广州 & 厦门双轴人口/GDP 图表与建成区跳转
  await page.goto(BASE + '/pages/cities.html?city=guangzhou', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(3500);
  const cityCheck = await page.evaluate(() => {
    const hasChart = !!document.querySelector('#city-detail canvas');
    const toHref = (document.getElementById('to-analysis') || {}).getAttribute('href') || '';
    return { hasChart, toHref };
  });
  console.log('3. cities (广州) 校验:', JSON.stringify(cityCheck));
  await page.screenshot({ path: path.join(OUT, 'fullstack-cities-gz.png') });

  // 4. 验证分析实验室：广州建成区对比 + PostGIS 测地缓冲区 + GeoServer WFS 控制台
  await page.goto(BASE + '/pages/analysis.html?city=guangzhou', { waitUntil: 'load', timeout: 20000 });
  await page.waitForTimeout(4500);
  const analysisCheck = await page.evaluate(() => {
    const curCity = (document.querySelector('#a-controls select') || {}).value;
    const statLabel0 = (document.querySelector('#bu-stats .stat-box .sb-label') || {}).textContent || '';
    const bufStats = document.querySelectorAll('#pg-buf-stats .stat-box').length;
    const sqlText = (document.getElementById('pg-sql-console') || {}).textContent || '';
    const pgBadge = (document.getElementById('badge-pg') || {}).textContent || '';
    const gsBadge = (document.getElementById('badge-gs') || {}).textContent || '';
    return {
      curCity,
      statLabel0,
      bufStats,
      hasSql: sqlText.includes('ST_Buffer') || sqlText.includes('ST_DWithin'),
      pgBadge,
      gsBadge,
    };
  });
  console.log('4. analysis (广州+PostGIS+GeoServer) 校验:', JSON.stringify(analysisCheck));
  await page.screenshot({ path: path.join(OUT, 'fullstack-analysis.png'), fullPage: true });

  // 5. 验证分析实验室下拉框切换九座城市时地图中心立即自动跳转且面积真实加载
  const jumpResults = {};
  for (const targetCity of ['shanghai', 'guangzhou', 'xiamen', 'beijing', 'hangzhou', 'wuhan', 'chengdu', 'qingdao', 'shenzhen']) {
    await page.selectOption('#a-controls select', targetCity);
    await page.waitForTimeout(550);
    const centerInfo = await page.evaluate(() => {
      const cA = window.__swipeA && window.__swipeA.getCenter();
      const cB = window.__swipeB && window.__swipeB.getCenter();
      const label = (document.querySelector('#bu-stats .stat-box .sb-label') || {}).textContent || '';
      const areaA = (document.querySelector('#bu-stats .stat-box .sb-value') || {}).textContent || '';
      return {
        a: cA ? [+cA.lng.toFixed(2), +cA.lat.toFixed(2)] : null,
        b: cB ? [+cB.lng.toFixed(2), +cB.lat.toFixed(2)] : null,
        label,
        areaA,
      };
    });
    jumpResults[targetCity] = centerInfo;
  }
  console.log('5. 下拉框切换九城自动跳转与面积校验:', JSON.stringify(jumpResults));

  await browser.close();
})();
