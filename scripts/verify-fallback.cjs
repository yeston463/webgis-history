// verify-fallback.cjs — 确定性验证天地图限流的自动降级与恢复（多源级联）：
//   降级链：Esri 灰底 Canvas → OSM FR HOT → OSM 官方标准瓦片（tiered，探测可用性后启用当前档）
// 1) 劫持天地图全部 429 + 链首 Esri 全部 500 → 应级联到 OSM-FR HOT 并显示对应署名横幅；
//    天地图图层隐藏、更低的 OSM 官方档保持隐藏、兜底层序在 3D 建筑之下；
// 2) 放开天地图（返回 canvas 生成的真实 PNG，满足 >500B 校验）→ 自动切回天地图。
// 用法：node scripts/verify-fallback.cjs   （需先启动 node server/server.cjs）
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const results = [];
function log(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (/\[tdtHealth\]/.test(m.text())) console.log('  (page) ' + m.text().replace(/\[tdtHealth\] /, '').trim());
  });

  let throttleTdt = true;
  let killEsri = true; // 链首持续被拒，逼迫级联到 OSM FR HOT 档
  let fakeTilePng = null;
  const ensureFakePng = async () => {
    if (fakeTilePng) return fakeTilePng;
    fakeTilePng = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const g = c.getContext('2d');
      g.fillStyle = '#f5efe6';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#9aa0a6';
      g.fillRect(80, 80, 96, 96);
      return c.toDataURL('image/png').split(',')[1];
    });
    return fakeTilePng;
  };
  const pngFulfill = (route) => ensureFakePng()
    .then((png) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') }))
    .catch(() => route.abort());

  await page.route(/tianditu\.gov\.cn/, (route) => (throttleTdt
    ? route.fulfill({ status: 429, body: 'throttled', contentType: 'text/plain' })
    : pngFulfill(route)));
  await page.route(/arcgisonline\.com/, (route) => (killEsri
    ? route.fulfill({ status: 500, body: 'down', contentType: 'text/plain' })
    : pngFulfill(route)));
  await page.route(/openstreetmap\.fr|openstreetmap\.org/, (route) => pngFulfill(route));

  await page.goto(`${BASE}/pages/analysis.html?city=shenzhen`, { waitUntil: 'load', timeout: 40000 });
  await page.evaluate(() => document.getElementById('lab-builtup-3d').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => !!(window.__bu3D && window.__bu3D.map && window.__bu3D.map.getLayer('bu3d-city')), { timeout: 90000 });
  await page.waitForTimeout(1200);

  /* 1. 限流 → 自动降级，且链首 Esri 不可达时级联到 OSM FR HOT 档 */
  const t0 = Date.now();
  const cascaded = await page.waitForFunction(() => {
    const m = window.__bu3D.map;
    return !!m.getLayer('wb-hot')
      && m.getLayoutProperty('wb-hot', 'visibility') === 'visible'
      && m.getLayer('wb-esr') && m.getLayoutProperty('wb-esr', 'visibility') === 'none'
      && ['tdt-vec', 'tdt-cva'].every((id) => m.getLayoutProperty(id, 'visibility') === 'none');
  }, { timeout: 30000 }).then(() => true).catch(() => false);
  log('天地图 429 且链首 Esri 不可达 → 级联到 OSM-FR HOT 并隐藏天地图', cascaded,
    cascaded ? `${((Date.now() - t0) / 1000).toFixed(1)}s 内级联` : '30s 内未按预期级联');
  if (!cascaded) {
    await page.screenshot({ path: 'test-shots/fallback-cascade-failed.png' });
    await browser.close();
    process.exit(1);
  }
  const bannerText = await page.evaluate(() => (document.getElementById('wb-basemap-banner') || {}).textContent || '');
  log('降级横幅含当前档位署名（OSM FR HOT）', /OSM FR HOT/.test(bannerText), bannerText.slice(0, 70));

  const stHot = await page.evaluate(() => {
    const m = window.__bu3D.map;
    const ids = m.getStyle().layers.map((l) => l.id);
    return {
      hot: m.getLayoutProperty('wb-hot', 'visibility'),
      osm: m.getLayer('wb-osm') ? m.getLayoutProperty('wb-osm', 'visibility') : 'NO-LAYER',
      hotIdx: ids.indexOf('wb-hot'),
      bldIdx: Math.min(...['bu3d-city', 'bu3d-city-ov'].map((id) => ids.indexOf(id)).filter((i) => i >= 0)),
    };
  });
  log('未启用的更下一档保持隐藏', stHot.hot === 'visible' && stHot.osm === 'none', JSON.stringify(stHot));
  log('兜底图层位于 3D 建筑之下（不遮楼）', stHot.hotIdx >= 0 && stHot.hotIdx < stHot.bldIdx,
    `wb-hot 层序=${stHot.hotIdx}, 建筑层序=${stHot.bldIdx}`);

  /* 2. 限流解除 → 自动切回天地图（探测 60s 间隔 ×2 轮） */
  throttleTdt = false;
  const tRecover = Date.now();
  let recovered = false;
  let probeTicksSeen = 0;
  while (Date.now() - tRecover < 200000) {
    await page.waitForTimeout(15000);
    const probe = await page.evaluate(() => ({
      ticks: window.__tdtProbeTicks || 0,
      vec: window.__bu3D.map.getLayoutProperty('tdt-vec', 'visibility'),
      cva: window.__bu3D.map.getLayoutProperty('tdt-cva', 'visibility'),
      esr: window.__bu3D.map.getLayer('wb-esr') ? window.__bu3D.map.getLayoutProperty('wb-esr', 'visibility') : 'none',
      hot: window.__bu3D.map.getLayer('wb-hot') ? window.__bu3D.map.getLayoutProperty('wb-hot', 'visibility') : 'none',
      osm: window.__bu3D.map.getLayer('wb-osm') ? window.__bu3D.map.getLayoutProperty('wb-osm', 'visibility') : 'none',
    }));
    probeTicksSeen = probe.ticks;
    if (probe.vec === 'visible' && probe.cva === 'visible'
      && ['esr', 'hot', 'osm'].every((k) => probe[k] === 'none')) { recovered = true; break; }
  }
  log('限流解除（探测成功）→ 自动切回天地图', recovered,
    `${((Date.now() - tRecover) / 1000).toFixed(1)}s 内切回, 探测 ticks=${probeTicksSeen}`);
  await page.screenshot({ path: 'test-shots/fallback-recovered.png' });

  const nPass = results.filter((r) => r.ok).length;
  console.log(`\n==== 限流降级验证：${nPass}/${results.length} 通过 ====`);
  await browser.close();
  process.exit(nPass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
