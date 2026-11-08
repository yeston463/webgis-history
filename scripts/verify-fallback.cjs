// verify-fallback.cjs - 确定性验证天地图限流的自动降级与恢复（自绘中国标准矢量底图）
// 2026-11-08 合规改造：降级底图不再使用任何外国栅格源（Esri/OSM 无九段线、把台湾标注成
// 独立国家），改为仓库自绘「中国标准矢量底图」：省级陆地填充/省界线 + 十段线虚线。
// 1) 劫持天地图全部 429 → 天地图图层隐藏，自绘降级图层（wb-fb-land / wb-fb-prov /
//    wb-fb-dash）可见；不得存在任何外国栅格备用层（wb-esr/wb-hot/wb-osm）；
//    横幅披露「自绘中国标准矢量底图」；十段线源恰含 10 段折线；
//    降级图层位于 3D 建筑之下（不遮楼），中文注记按缩放分级切换（省级 ↔ 焦点城市）。
// 2) 放开天地图（返回 canvas 生成的真实 PNG，满足 >500B 校验）→ 自动切回天地图，
//    自绘降级图层隐藏、DOM 注记拆除。
// 用法：需先启动 node server/server.cjs，然后 node scripts/verify-fallback.cjs
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

  let throttleTdt = true;
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

  await page.goto(`${BASE}/pages/analysis.html?city=shenzhen`, { waitUntil: 'load', timeout: 40000 });
  await page.evaluate(() => document.getElementById('lab-builtup-3d').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => !!(window.__bu3D && window.__bu3D.map && window.__bu3D.map.getLayer('bu3d-city')), { timeout: 90000 });
  await page.waitForTimeout(1200);

  /* 1. 限流 → 隐藏天地图、启用自绘矢量降级底图 */
  const t0 = Date.now();
  const swapped = await page.waitForFunction(() => {
    const m = window.__bu3D.map;
    return ['tdt-vec', 'tdt-cva'].every((id) => m.getLayoutProperty(id, 'visibility') === 'none')
      && ['wb-fb-land', 'wb-fb-prov', 'wb-fb-dash'].every(
        (id) => !!m.getLayer(id) && m.getLayoutProperty(id, 'visibility') === 'visible');
  }, { timeout: 30000 }).then(() => true).catch(() => false);
  log('天地图 429 → 隐藏天地图并启用自绘降级底图（陆地/省界/十段线）', swapped,
    swapped ? `${((Date.now() - t0) / 1000).toFixed(1)}s 内完成切换` : '30s 内未按预期切换');
  if (!swapped) {
    await page.screenshot({ path: 'test-shots/fallback-swap-failed.png' });
    await browser.close();
    process.exit(1);
  }

  const noForeign = await page.evaluate(() => {
    const m = window.__bu3D.map;
    return ['wb-esr', 'wb-hot', 'wb-osm'].filter((id) => !!m.getLayer(id));
  });
  log('降级时不存在任何外国栅格备用层（无 Esri/OSM）', noForeign.length === 0, JSON.stringify(noForeign));

  const dashInfo = await page.waitForFunction(() => {
    const m = window.__bu3D.map;
    const segs = Array.isArray(m._wbFbDashCoords) ? m._wbFbDashCoords.length : 0;
    const probe = { segs };
    if (segs) {
      probe.first = m._wbFbDashCoords[0][0];
      const lastLine = m._wbFbDashCoords[m._wbFbDashCoords.length - 1];
      probe.last = lastLine[lastLine.length - 1];
    }
    return probe.segs ? probe : null;
  }, { timeout: 15000 }).then((h) => h.jsonValue()).catch(() => null);
  log('十段线源恰含 10 段折线（南海诸岛断续线，内嵌几何校验首末坐标）',
    !!dashInfo && dashInfo.segs === 10
      && Math.abs(dashInfo.first[0] - 109.5176) < 0.01
      && Math.abs(dashInfo.last[1] - 16.2656) < 0.01,
    JSON.stringify(dashInfo));

  const order = await page.evaluate(() => {
    const m = window.__bu3D.map;
    const ids = m.getStyle().layers.map((l) => l.id);
    const fbIdx = Math.max(...['wb-fb-land', 'wb-fb-prov', 'wb-fb-dash'].map((id) => ids.indexOf(id)));
    const bldIdx = Math.min(...['bu3d-city', 'bu3d-city-ov'].map((id) => ids.indexOf(id)).filter((i) => i >= 0));
    return { fbIdx, bldIdx };
  });
  log('降级图层位于 3D 建筑之下（不遮楼）', order.fbIdx >= 0 && order.fbIdx < order.bldIdx,
    `fb 层序=${order.fbIdx}, 建筑层序=${order.bldIdx}`);

  const bannerText = await page.evaluate(() => (document.getElementById('wb-basemap-banner') || {}).textContent || '');
  log('降级横幅披露「自绘中国标准矢量底图」署名', /自绘中国标准矢量底图/.test(bannerText), bannerText.slice(0, 70));

  /* 1b. 中文注记分级（缓冲区地图 __bufMap 无 minzoom 锁）：z4 标省级，z11 标焦点城市 */
  await page.waitForFunction(() => !!(window.__bufMap && window.__bufMap._wbFbDashCoords), { timeout: 30000 });
  await page.evaluate(() => window.__bufMap.jumpTo({ center: [116.5, 33], zoom: 4, pitch: 0, bearing: 0 }));
  const provOnCityOff = await page.waitForFunction(() => {
    const el = window.__bufMap.getContainer();
    const vis = (q) => [...el.querySelectorAll(q)]
      .filter((n) => n.style.display !== 'none').length;
    return { prov: vis('.wbfb-label-prov'), city: vis('.wbfb-label-city'), dash: vis('.wbfb-label-dash') };
  }, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
  log('低层级（z4）注记：省级 ≥20 可见、焦点城市隐藏、南海诸岛可见',
    !!provOnCityOff && provOnCityOff.prov >= 20 && provOnCityOff.city === 0 && provOnCityOff.dash >= 1,
    JSON.stringify(provOnCityOff));
  await page.screenshot({ path: 'test-shots/fallback-vector-base.png' });

  await page.evaluate(() => window.__bufMap.jumpTo({ zoom: 11 }));
  const cityOnProvOff = await page.waitForFunction(() => {
    const el = window.__bufMap.getContainer();
    const vis = (q) => [...el.querySelectorAll(q)]
      .filter((n) => n.style.display !== 'none').length;
    return { prov: vis('.wbfb-label-prov'), city: vis('.wbfb-label-city') };
  }, { timeout: 10000 }).then((h) => h.jsonValue()).catch(() => null);
  log('高层级（z11）注记：焦点城市 9 域可见、省级隐藏', !!cityOnProvOff && cityOnProvOff.city === 9 && cityOnProvOff.prov === 0,
    JSON.stringify(cityOnProvOff));

  /* 2. 限流解除 → 自动切回天地图（探测 60s 间隔 ×2 轮） */
  throttleTdt = false;
  const tRecover = Date.now();
  let recovered = false;
  let probeTicksSeen = 0;
  while (Date.now() - tRecover < 200000) {
    await page.waitForTimeout(15000);
    const probe = await page.evaluate(() => ({
      ticks: window.__tdtProbeTicks || 0,
      markers: window.__bu3D.map.getContainer().querySelectorAll('.wbfb-label').length,
      vec: window.__bu3D.map.getLayoutProperty('tdt-vec', 'visibility'),
      cva: window.__bu3D.map.getLayoutProperty('tdt-cva', 'visibility'),
      fb: ['wb-fb-land', 'wb-fb-prov', 'wb-fb-dash'].map((id) => {
        const l = window.__bu3D.map.getLayer(id);
        return l ? window.__bu3D.map.getLayoutProperty(id, 'visibility') : 'none';
      }),
    }));
    probeTicksSeen = probe.ticks;
    if (probe.vec === 'visible' && probe.cva === 'visible'
      && probe.fb.every((v) => v === 'none') && probe.markers === 0) { recovered = true; break; }
  }
  log('限流解除（探测成功）→ 自动切回天地图并拆除自绘注记', recovered,
    `${((Date.now() - tRecover) / 1000).toFixed(1)}s 内切回, 探测 ticks=${probeTicksSeen}`);
  await page.screenshot({ path: 'test-shots/fallback-recovered.png' });

  const nPass = results.filter((r) => r.ok).length;
  console.log(`\n==== 限流降级验证：${nPass}/${results.length} 通过 ====`);
  await browser.close();
  process.exit(nPass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
