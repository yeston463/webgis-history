// perf-3d.cjs — 实测九城 3D 建筑演化的渲染帧时（headless Chromium + 软件 WebGL，保守下界）
// 方法：1600x1000 视口、pitch 56°，5 秒连续方位角扫转，采样 MapLibre 'render' 事件间隔；
//       同时统计同屏体块数（几何顶点投影命中），用于解释帧时差异。
// 注意：固定关闭产品的自适应降级（state.autoLod=false）再测，让「概览层 / 逐栋层」行语义稳定；
//       自适应降级（细节层帧时中位 ≥150ms 自动上调阈值回概览）是交互期行为，另行人工复核。
// 用法：node scripts/perf-3d.cjs [city1 city2 ...]   （需先启动 node server/server.cjs）
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8000';
const LIST = process.argv.slice(2).length ? process.argv.slice(2) : ['shenzhen', 'shanghai', 'guangzhou', 'chengdu'];
const SWEEP_MS = 5000;
const OUT = path.join(__dirname, '..', 'test-results', 'perf-3d.json');

function stats(times) {
  const a = times.filter((t) => t > 0 && t < 5000).sort((x, y) => x - y);
  if (!a.length) return { frames: 0, median: 0, p90: 0, fps: 0 };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  return { frames: a.length, median: +q(0.5).toFixed(1), p90: +q(0.9).toFixed(1), fps: +(1000 / q(0.5)).toFixed(1) };
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', () => {});

  await page.goto(`${BASE}/pages/analysis.html?city=${LIST[0]}`, { waitUntil: 'load', timeout: 40000 });
  await page.evaluate(() => document.getElementById('lab-builtup-3d').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => {
    const b = window.__bu3D;
    return !!(b && b.map && b.map.getLayer('bu3d-city') && b.map.isStyleLoaded());
  }, { timeout: 120000 });
  await page.waitForTimeout(2500);

  // mode: 'auto' 出厂两级 LOD | 'detail-all' 强制逐栋全量（对照，不随产品发布）
  async function measure(city, mode, dz) {
    const setup = await page.evaluate(async ({ city, mode, dz }) => {
      const b = window.__bu3D, m = b.map, st = b.state;
      st.autoLod = false; st.autoRaise = 0; st.autoCool = 0; // perf 表测固定两级 LOD，先关自适应降级（产品代码默认开启）
      if (st.city !== city) { await b.setCity(city); await new Promise((r) => setTimeout(r, 2500)); }
      const d = m.getLayer('bu3d-city'), o = m.getLayer('bu3d-city-ov');
      if (mode === 'detail-all') { m.setLayerZoomRange(d.id, 0, 24); m.setLayerZoomRange(o.id, 30, 30); }
      else { m.setLayerZoomRange(d.id, st.lodZoom, 24); m.setLayerZoomRange(o.id, 0, st.lodZoom); }
      const zoom = +(st.lodZoom + dz).toFixed(2);
      m.jumpTo({ zoom, pitch: 56 });
      await new Promise((r) => setTimeout(r, 2000));

      const canvas = m.getCanvas();
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const useDetail = mode === 'detail-all' || zoom >= st.lodZoom;
      const fc = useDetail ? b.data[st.city] : b.overview[st.city];
      let inView = 0;
      for (const f of fc.features) {
        let vis = false;
        const walk = (a) => {
          if (vis) return;
          if (typeof a[0] === 'number') {
            const p = m.project(a);
            if (p && isFinite(p.x) && isFinite(p.y) && p.x >= -16 && p.x <= W + 16 && p.y >= -16 && p.y <= H + 16) vis = true;
          } else { for (const x of a) walk(x); }
        };
        walk(f.geometry.coordinates);
        if (vis) inView += 1;
      }
      const lodLayer = zoom >= st.lodZoom ? 'detail' : 'overview';
      return { zoom, inView, total: fc.features.length, lodZoom: +st.lodZoom.toFixed(2), active: mode === 'detail-all' ? 'detail(强制)' : lodLayer };
    }, { city, mode, dz });

    const times = await page.evaluate((ms) => new Promise((resolve) => {
      const m = window.__bu3D.map;
      const out = [];
      let last = performance.now();
      const onRender = () => { const t = performance.now(); out.push(t - last); last = t; };
      m.on('render', onRender);
      let bearing = m.getBearing();
      const timer = setInterval(() => { bearing = (bearing + 2.5) % 360; m.setBearing(bearing); }, 40);
      setTimeout(() => { clearInterval(timer); m.off('render', onRender); resolve(out); }, ms);
    }), SWEEP_MS);

    const row = Object.assign({ city, mode, dz }, setup, stats(times));
    console.log(
      `${row.city.padEnd(9)} ${mode === 'detail-all' ? '逐栋全量(对照)' : '出厂LOD'} `
      + `z=${String(row.zoom).padEnd(5)} 层=${row.active.padEnd(11)} 同屏=${String(row.inView).padStart(5)}/${String(row.total).padStart(5)}`
      + `  帧时中位=${String(row.median).padStart(6)}ms p90=${String(row.p90).padStart(6)}ms  ${String(row.fps).padStart(5)}fps`
    );
    return row;
  }

  const rows = [];
  for (const city of LIST) {
    rows.push(await measure(city, 'auto', -1.4));   // 默认相机：概览层
    rows.push(await measure(city, 'auto', +0.4));   // 刚过阈值：逐栋细节层
    rows.push(await measure(city, 'auto', +1.2));
    rows.push(await measure(city, 'detail-all', -1.4)); // 默认相机强开逐栋（旧出厂行为，对照）
  }

  await page.evaluate(() => {
    const m = window.__bu3D.map, st = window.__bu3D.state;
    m.setLayerZoomRange('bu3d-city', st.lodZoom, 24);
    m.setLayerZoomRange('bu3d-city-ov', 0, st.lodZoom);
  });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
  const worst = rows.filter((r) => r.mode === 'auto').reduce((a, r) => (r.median > a.median ? r : a), rows[0]);
  console.log(`\n出厂 LOD 最慢：${worst.city} z=${worst.zoom} ${worst.active} ${worst.median}ms (${worst.fps}fps)`);
  console.log('写入 ' + OUT);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
