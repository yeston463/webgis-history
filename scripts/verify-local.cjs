// verify-local.cjs — 验证本地 file:// 提交版（无 HTTP 服务）：3D 建筑分片按需注入
// 7 项检查：页面可启动、3D 模块初始化、首城分片数量、按需注入范围、LOD 阈值与图层区间、切城第二分片、致命控制台错误
// 用法：node scripts/verify-local.cjs   （先运行 node scripts/build-local.cjs）
const { chromium } = require('playwright');
const path = require('path');
const { pathToFileURL } = require('url');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, process.env.LOCAL_DIR || 'local');
const PAGE = pathToFileURL(path.join(DIR, 'pages', 'analysis.html')).href;
const OUT = path.join(ROOT, 'test-shots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
function log(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`);
}
function benign(e) {
  return /tianditu|tile|net::ERR_FILE_NOT_FOUND.*tianditu|Failed to fetch|Failed to load|ERR_|403|401|404|getImageData|cross-origin|Access-Control|WebGL|GroupMarkerNotSet/i.test(e);
}

(async () => {
  if (!fs.existsSync(path.join(DIR, 'data', 'buildings', 'shenzhen.geojson.js'))) {
    console.error('缺少 local/data/buildings/*.geojson.js，请先运行 node scripts/build-local.cjs');
    process.exit(1);
  }
  const browser = await chromium.launch({ args: ['--no-sandbox', '--allow-file-access-from-files'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push('PAGEERROR: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push('CONSOLE: ' + m.text()); });

  await page.goto(PAGE + '?city=shenzhen', { waitUntil: 'load', timeout: 60000 });

  /* 1. file:// 外壳可用 */
  const shell = await page.evaluate(() => ({
    localBuild: !!window.__LOCAL_FILE_BUILD__,
    registry: Object.keys(window.__LOCAL_DATA__ || {}).length,
    nav: document.querySelectorAll('.site-nav a, nav a').length,
    section: !!document.getElementById('lab-builtup-3d'),
  }));
  log('file:// 页面加载且本地数据注册表就位', shell.localBuild && shell.registry > 0 && shell.section,
    `注册表 ${shell.registry} 键, nav=${shell.nav}`);

  /* 2. 3D 模块初始化（分片按需注入） */
  await page.evaluate(() => document.getElementById('lab-builtup-3d').scrollIntoView({ block: 'center' }));
  const ready = await page.waitForFunction(() => {
    const b = window.__bu3D;
    return !!(b && b.map && b.map.getLayer('bu3d-city')); // 不依赖底图瓦片完成（限流时 isStyleLoaded 长期为 false）
  }, { timeout: 120000 }).then(() => true).catch(() => false);
  log('3D 模块在 file:// 下初始化', ready, ready ? '' : '超时，分片可能未注入');
  if (!ready) {
    await page.screenshot({ path: path.join(OUT, 'local-3d-fail.png') });
    log('后续断言', false, '3D 未就绪，跳过');
    console.log(`\n==== 本地版验证：${results.filter((r) => r.ok).length}/${results.length} 通过 ====`);
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2500);

  const sz = await page.evaluate(() => {
    const b = window.__bu3D, st = b.state;
    return {
      city: st.city,
      detail: (b.data[st.city] || { features: [] }).features.length,
      overview: (b.overview[st.city] || { features: [] }).features.length,
      chunkKeys: Object.keys(window.__LOCAL_DATA__ || {}).filter((k) => /buildings\/.*geojson/.test(k)),
      loadingHidden: document.getElementById('map-3d-loading').classList.contains('hide'),
      chip: document.getElementById('lab-3d-lod').textContent.replace(/\s+/g, ' '),
      lodZoom: st.lodZoom, camZoom: b.map.getZoom(),
      dmin: b.map.getLayer('bu3d-city').minzoom, omax: b.map.getLayer('bu3d-city-ov').maxzoom,
    };
  });
  log('首城 3D 分片注入且体块数与 HTTP 版一致',
    sz.city === 'shenzhen' && sz.detail === 13465 && sz.overview === 3086 && sz.loadingHidden,
    `深圳 全量 ${sz.detail} / 概览 ${sz.overview}`);
  log('按需注入：初始只有当前城市的分片', sz.chunkKeys.length === 2 && sz.chunkKeys.every((k) => /shenzhen/.test(k)),
    `已注入 ${sz.chunkKeys.length} 片：${sz.chunkKeys.map((k) => k.split('/').pop()).join(', ')}`);
  log('LOD 阈值 = 相机 + 1.4 且两层区间互补',
    Math.abs(sz.lodZoom - (sz.camZoom + 1.4)) < 0.02 && sz.dmin === sz.lodZoom && sz.omax === sz.lodZoom
    && /远景概览层/.test(sz.chip),
    `相机 ${sz.camZoom.toFixed(2)} → 阈值 ${sz.lodZoom.toFixed(2)}`);

  /* 3. 模块内城市下拉切换，触发第二个分片 */
  const selInfo = await page.evaluate(() => {
    const s = document.getElementById('lab-3d-city-select');
    return { options: s.options.length, value: s.value };
  });
  await page.selectOption('#lab-3d-city-select', 'chengdu');
  const switched = await page.waitForFunction(() => window.__bu3D.state.city === 'chengdu' && window.__bu3D.data.chengdu,
    null, { timeout: 120000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(2000);
  const cd = await page.evaluate(() => {
    const b = window.__bu3D;
    return {
      detail: (b.data.chengdu || { features: [] }).features.length,
      overview: (b.overview.chengdu || { features: [] }).features.length,
      chunkKeys: Object.keys(window.__LOCAL_DATA__ || {}).filter((k) => /buildings\/.*geojson/.test(k)),
      name: document.getElementById('lab-3d-city-select').selectedOptions[0].textContent,
      top: document.querySelector('#a-controls select').value,
    };
  });
  log('模块内下拉切换城市并触发第二分片（其余 7 城仍未注入）',
    selInfo.options === 9 && switched && cd.detail === 20000 && cd.overview === 4921
    && cd.chunkKeys.length === 4 && cd.chunkKeys.every((k) => /shenzhen|chengdu/.test(k))
    && cd.top === 'shenzhen',
    `${cd.name} 全量 ${cd.detail} / 概览 ${cd.overview}，累计注入 ${cd.chunkKeys.length} 片，顶部下拉仍为 ${cd.top}`);
  await page.screenshot({ path: path.join(OUT, 'local-3d-chengdu.png') });

  log('无致命控制台错误', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n==== 本地版验证：${passed}/${results.length} 通过 ====`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
