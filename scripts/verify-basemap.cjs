// verify-basemap.cjs — 验证天地图在线底图 / 缩放上限锁 / 移除离线底图 / 图层面板 / 缓冲区带图弹窗
// 用法：NODE_PATH=C:/Users/赵航/node_modules node scripts/verify-basemap.cjs
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
  return /tianditu|tile|net::|Failed to fetch|Failed to load|ERR_|403|401|getImageData|404|cross-origin|Access-Control/i.test(e);
}
async function newCtx(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push('PAGEERROR: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push('CONSOLE: ' + m.text()); });
  return { ctx, page, errors };
}
const waitMap = async (page) => {
  await page.waitForFunction(() => window.__wbMap && window.__wbMap._wbLoaded, { timeout: 15000 }).catch(() => {});
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });

  /* ---------- 1. cities 页：纯天地图在线底图 + 移除离线开关 + 缩放上限锁 ---------- */
  {
    const { ctx, page, errors } = await newCtx(browser);
    await page.goto(BASE + '/pages/cities.html?city=shenzhen', { waitUntil: 'load', timeout: 20000 });
    await waitMap(page);
    await page.waitForFunction(() => window.__wbMap && window.__wbMap.getLayer && window.__wbMap.getLayer('heritage-symbol'), { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const m = window.__wbMap;
      const origZoom = m.getZoom();
      m.jumpTo({ zoom: 22 });
      const clampedZoom = m.getZoom();
      const zoomBtnIn = document.querySelector('#map-root .maplibregl-ctrl-zoom-in');
      const zoomInDisabledAtMax = !!(zoomBtnIn && zoomBtnIn.disabled);
      const sbZoomAtMax = (document.querySelector('.map-statusbar [data-sb="zoom"]') || {}).textContent || '';
      m.jumpTo({ zoom: origZoom });
      return {
        map: !!m,
        tdtVec: m && !!m.getLayer('tdt-vec'),
        tdtCva: m && !!m.getLayer('tdt-cva'),
        noOfflineLayers: m && !m.getLayer('river-line') && !m.getLayer('nine-dash-line') && !m.getLayer('province-fill'),
        noBasemapSwitch: document.querySelectorAll('[data-bm]').length === 0,
        maxZoom: m && m.getMaxZoom(),
        clampedZoom,
        zoomInDisabledAtMax,
        sbZoomAtMax,
        panel: !!document.querySelector('#layer-panel .lp-legend'),
        legendRows: document.querySelectorAll('#layer-panel .lg-row').length,
        heritage: m && !!m.getLayer('heritage-symbol'),
        reform: m && !!m.getLayer('reform-symbol'),
        noCluster: m && !m.getLayer('heritage-cluster'),
        mapW: Math.round(document.querySelector('#map-root').getBoundingClientRect().width),
        scale: (document.querySelector('.map-statusbar [data-sb="scale"]') || {}).textContent || '',
      };
    });
    await page.locator('#map-root').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.locator('#map-root').screenshot({ path: path.join(OUT, 'v-cities.png') });
    const ok = r.map && r.tdtVec && r.tdtCva && r.noOfflineLayers && r.noBasemapSwitch &&
      r.maxZoom === 17 && r.clampedZoom === 17 && r.zoomInDisabledAtMax && /上限/.test(r.sbZoomAtMax) &&
      r.panel && r.legendRows >= 6 && r.heritage && r.reform && r.noCluster && r.mapW > 700 && /cm|km|m/.test(r.scale) && errors.length === 0;
    log('cities 纯天地图底图+无离线层+缩放上限锁(Z17)+双标记', ok,
      `tdt=${r.tdtVec}/${r.tdtCva},noOffline=${r.noOfflineLayers},noSwitch=${r.noBasemapSwitch},maxZ=${r.maxZoom},clamped=${r.clampedZoom},btnDisabled=${r.zoomInDisabledAtMax},sbZ="${r.sbZoomAtMax}"` +
      (errors.length ? ' | ERR:' + errors.slice(0, 3).join(' ;; ') : ''));
    await ctx.close();
  }

  /* ---------- 2. analysis 卷帘双图 + 缩放上限锁 + 缓冲区共现带实景图弹窗 ---------- */
  {
    const { ctx, page, errors } = await newCtx(browser);
    await page.goto(BASE + '/pages/analysis.html?city=shenzhen', { waitUntil: 'load', timeout: 20000 });
    await page.waitForFunction(() => {
      const A = window.__swipeA;
      const sb = document.querySelector('#map-slot .map-statusbar');
      return A && A.getLayer && A.getLayer('bu-lyr') && sb && sb.querySelector('[data-sb="scale"]') && sb.querySelector('[data-sb="scale"]').textContent.trim().length > 0;
    }, { timeout: 25000 }).catch(() => {});
    await page.waitForFunction(() => document.querySelectorAll('#pg-buf-stats .stat-box').length === 4 && document.querySelectorAll('#pg-hit-list .place-item').length > 0, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(500);

    // 先捕获模块一卷帘地图截图，并验证所有地图缩放上限锁
    await page.locator('#map-slot').scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.locator('#map-slot').screenshot({ path: path.join(OUT, 'v-analysis-a.png') });

    const zoomLockCheck = await page.evaluate(() => {
      const A = window.__swipeA, M = window.__bufMap;
      const origA = A.getZoom(), origBuf = M.getZoom();
      A.jumpTo({ zoom: 22 });
      M.jumpTo({ zoom: 22 });
      const clampedA = A.getZoom();
      const clampedBuf = M.getZoom();
      const swipeZoomDisabled = !!(document.querySelector('#map-slot .maplibregl-ctrl-zoom-in') || {}).disabled;
      const bufZoomDisabled = !!(document.querySelector('#map-buf-root .maplibregl-ctrl-zoom-in') || {}).disabled;
      A.jumpTo({ zoom: origA });
      M.jumpTo({ zoom: origBuf });
      return { clampedA, clampedBuf, swipeZoomDisabled, bufZoomDisabled };
    });

    // 点击缓冲区共现右侧命中要素，触发地图带图弹窗并等待镜头缓动与图片加载完成
    await page.click('#pg-hit-list .place-item');
    await page.waitForFunction(() => {
      const img = document.querySelector('#map-buf-root .map-rich-popup img.popup-img');
      return img && img.complete && img.naturalWidth > 40;
    }, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(750);

    const r = await page.evaluate((zl) => {
      const A = window.__swipeA, B = window.__swipeB, M = window.__bufMap;
      const has = (m, id) => m && !!m.getLayer(id);
      const mapBox = document.getElementById('map-buf-root').getBoundingClientRect();
      const popEl = document.querySelector('#map-buf-root .map-rich-popup .maplibregl-popup-content');
      const popBox = popEl ? popEl.getBoundingClientRect() : null;
      const popupUnclipped = !!(
        popBox &&
        popBox.top >= mapBox.top &&
        popBox.bottom <= mapBox.bottom - 24 &&
        popBox.left >= mapBox.left &&
        popBox.right <= mapBox.right
      );
      const popupImg = document.querySelector('#map-buf-root .map-rich-popup img.popup-img');
      const popupTitle = (document.querySelector('#map-buf-root .map-rich-popup .popup-title') || {}).textContent || '';
      return {
        ...zl,
        A: !!A, B: !!B, M: !!M, canvasA: !!document.querySelector('#map-a canvas'),
        tdtA: has(A, 'tdt-vec'), tdtB: has(B, 'tdt-vec'), tdtBuf: has(M, 'tdt-vec'),
        noOffline: !has(A, 'river-line') && !has(B, 'river-line') && !has(M, 'river-line') && document.querySelectorAll('[data-bm]').length === 0,
        buA: has(A, 'bu-lyr'), buB: has(B, 'bu-lyr'),
        note: (document.getElementById('a-note') || {}).textContent || '',
        bufStats: document.querySelectorAll('#pg-buf-stats .stat-box').length,
        sql: (document.getElementById('pg-sql-console') || {}).textContent || '',
        scale: (document.querySelector('#map-slot .map-statusbar [data-sb="scale"]') || {}).textContent || '',
        credit: (document.querySelector('#map-slot .map-statusbar .msb-credit') || {}).textContent || '',
        popupHasImg: !!(popupImg && popupImg.complete && popupImg.naturalWidth > 40),
        popupImgW: popupImg ? popupImg.naturalWidth : 0,
        popupUnclipped,
        popupTitle,
      };
    }, zoomLockCheck);
    await page.locator('#lab-buffer .lab-grid').screenshot({ path: path.join(OUT, 'v-analysis-buffer-popup.png') });
    const noteOk = /AUE|Atlas|真实/.test(r.note);
    const ok = r.A && r.B && r.M && r.canvasA && r.tdtA && r.tdtB && r.tdtBuf && r.noOffline &&
      r.clampedA === 17 && r.clampedBuf === 17 && r.swipeZoomDisabled && r.bufZoomDisabled &&
      r.buA && r.buB && r.bufStats === 4 && /ST_Buffer|ST_DWithin/.test(r.sql) &&
      r.popupHasImg && r.popupUnclipped && noteOk && /cm|km|m/.test(r.scale) && errors.length === 0;
    log('analysis 卷帘+缩放上限锁+缓冲区实景图片弹窗', ok,
      `tdt=${r.tdtA}/${r.tdtB}/${r.tdtBuf},noOffline=${r.noOffline},clamped=${r.clampedA}/${r.clampedBuf},` +
      `popupImg=${r.popupHasImg}(${r.popupImgW}px,"${r.popupTitle}",unclipped=${r.popupUnclipped}),credit="${r.credit}"` +
      (errors.length ? ' | ERR:' + errors.slice(0, 3).join(' ;; ') : ''));
    await ctx.close();
  }

  await browser.close();
  const fails = results.filter((x) => !x.ok).length;
  console.log(`\n==== 底图与弹窗验证：${results.length - fails}/${results.length} 通过 ====`);
  process.exit(fails ? 1 : 0);
})();
