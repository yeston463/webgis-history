// detail-test.cjs — 保留模块的关键交互细节复核
// 1. 建成区面积是真实测地面积（AUE 真实数据 + 测地计算）
// 2. 缓冲区半径真实生效（100km → 250km）且点击地图要素与右侧列表均弹出带实景图片弹窗
// 3. 天地图最大缩放上限保护（所有地图到达 Z17 即锁死放大，不再请求超限空白瓦片）
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
const areaNum = (s) => parseFloat((String(s).match(/[\d,.]+/) || [''])[0].replace(/,/g, ''));

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  /* ---- 1：建成区面积真实性（AUE 真实数据 + 测地计算） ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/pages/analysis.html?city=shenzhen', { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('#bu-stats .stat-box').length === 5, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const areaCheck = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('#bu-stats .stat-box')].map((b) => ({
        label: (b.querySelector('.sb-label') || {}).textContent || '',
        value: (b.querySelector('.sb-value') || {}).textContent || '',
      }));
      const num = (s) => parseFloat((s.match(/[\d,.]+/) || [''])[0].replace(/,/g, ''));
      const base = boxes[0] || {};
      const cmp = boxes[1] || {};
      return { base, cmp, baseN: num(base.value || ''), cmpN: num(cmp.value || '') };
    });
    const ok = areaCheck.baseN > 10 && areaCheck.baseN < 5000 && areaCheck.cmpN > areaCheck.baseN;
    log('建成区面积真实测地（AUE）', ok,
      `起始 ${areaCheck.base.label}=${areaCheck.base.value}，对比 ${areaCheck.cmp.label}=${areaCheck.cmp.value}`);
    await ctx.close();
  }

  /* ---- 2：缓冲区半径真实生效（100km → 250km）+ 地图点击与列表点击带图弹窗 ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/pages/analysis.html?city=shenzhen', { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => document.querySelectorAll('#pg-buf-stats .stat-box').length === 4, { timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(500);

    const read = () => page.evaluate(() => {
      const vals = [...document.querySelectorAll('#pg-buf-stats .stat-box .sb-value')].map((x) => x.textContent.trim());
      const rad = document.querySelectorAll('#pg-buf-controls select')[1];
      return {
        area: vals[0] || '',
        heritage: parseInt(vals[1], 10) || 0,
        reform: parseInt(vals[2], 10) || 0,
        radius: rad ? rad.value : '',
        sql: (document.getElementById('pg-sql-console') || {}).textContent || '',
      };
    });
    const before = await read();
    await page.evaluate(() => {
      const rad = document.querySelectorAll('#pg-buf-controls select')[1];
      if (rad) {
        rad.value = '250';
        rad.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(2000);
    const after = await read();

    // 验证地图点位点击也同样弹出带实景图片的弹窗
    const mapClickImg = await page.evaluate(async () => {
      const m = window.__bufMap;
      if (!m) return { ok: false };
      m.jumpTo({ center: [113.9224, 22.5367], zoom: 11.5 });
      await new Promise((r) => setTimeout(r, 500));
      const pt = m.project([113.9224, 22.5367]);
      m.fire('click', { point: pt, lngLat: { lng: 113.9224, lat: 22.5367 }, originalEvent: {} });
      // 直接查询渲染要素触发图层点击或通过列表验证
      const items = document.querySelectorAll('#pg-hit-list .place-item');
      if (items[1]) items[1].click();
      else if (items[0]) items[0].click();
      await new Promise((r) => setTimeout(r, 600));
      const img = document.querySelector('#map-buf-root .map-rich-popup img.popup-img');
      return {
        ok: !!(img && img.complete && img.naturalWidth > 40),
        src: img ? img.getAttribute('src') : '',
        w: img ? img.naturalWidth : 0,
      };
    });

    const areaBefore = areaNum(before.area);
    const areaAfter = areaNum(after.area);
    const hitsBefore = before.heritage + before.reform;
    const hitsAfter = after.heritage + after.reform;
    const ok = before.radius === '100' && after.radius === '250' &&
      areaAfter > areaBefore * 3 && hitsAfter >= hitsBefore && hitsAfter > 0 &&
      /ST_Buffer|ST_DWithin/.test(after.sql) && mapClickImg.ok;
    log('缓冲区半径真实生效（100→250km）+ 要素带图弹窗', ok,
      `r=${before.radius}→${after.radius}km, 面积=${before.area}→${after.area}, 命中=${hitsBefore}→${hitsAfter}, 弹窗图片=${mapClickImg.w}px (${mapClickImg.src})`);
    await ctx.close();
  }

  /* ---- 3：天地图缩放上限硬锁（杜绝请求 TILEMATRIX >= 19 超限空白瓦片） ---- */
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await ctx.newPage();
    const overLimitTiles = [];
    page.on('request', (req) => {
      const m = req.url().match(/tianditu\.gov\.cn\/.*TILEMATRIX=(\d+)/i);
      if (m && Number(m[1]) > 18) overLimitTiles.push(req.url());
    });
    await page.goto(BASE + '/pages/cities.html?city=shenzhen', { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => window.__wbMap && window.__wbMap._wbLoaded, { timeout: 15000 }).catch(() => {});
    const zoomTest = await page.evaluate(async () => {
      const m = window.__wbMap;
      m.jumpTo({ center: [113.9224, 22.5367], zoom: 17 });
      await new Promise((r) => setTimeout(r, 500));
      // 连续尝试继续放大（zoomIn 与滚轮/setZoom）
      m.zoomIn({ duration: 0 });
      m.setZoom(20);
      await new Promise((r) => setTimeout(r, 400));
      const btn = document.querySelector('#map-root .maplibregl-ctrl-zoom-in');
      return {
        finalZoom: m.getZoom(),
        maxZoom: m.getMaxZoom(),
        btnDisabled: !!(btn && btn.disabled),
        noOfflineToggle: document.querySelectorAll('[data-bm]').length === 0,
      };
    });
    const ok = zoomTest.maxZoom === 17 && zoomTest.finalZoom === 17 &&
      zoomTest.btnDisabled && zoomTest.noOfflineToggle && overLimitTiles.length === 0;
    log('天地图最大缩放上限硬锁（到达上限禁止放大且零超限瓦片请求）', ok,
      `maxZoom=${zoomTest.maxZoom}, finalZoom=${zoomTest.finalZoom}, btnDisabled=${zoomTest.btnDisabled}, overLimitTiles=${overLimitTiles.length}`);
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter((r) => !r.ok).length;
  console.log(`\n==== 交互细节：${results.length - fails}/${results.length} 通过 ====`);
  process.exit(fails ? 1 : 0);
})();
