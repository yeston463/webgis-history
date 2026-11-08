// verify-3d.cjs — 验证九城建筑三维演化（OSM 真实轮廓 × AUE 建成区年代分层）
// 18 项检查：懒加载、数据规模与年代/高度属性、时间轴过滤、按年代配色、累计/新增模式、播放、
// 城市联动（顶部下拉 + 模块内下拉）、两级 LOD 阈值、自适应降级、生长动画、署名与推断文案、读数、控制台错误
// 用法：node scripts/verify-3d.cjs   （需先启动 node server/server.cjs，且已生成 data/buildings/*.geojson）
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
  return /tianditu|tile|net::|Failed to fetch|Failed to load|ERR_|403|401|404|getImageData|cross-origin|Access-Control|WebGL|GroupMarkerNotSet/i.test(e);
}
const YEARS = [1990, 2000, 2014, 2024];

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!benign(e.message)) errors.push('PAGEERROR: ' + e.message); });
  page.on('console', (m) => { if (m.type() === 'error' && !benign(m.text())) errors.push('CONSOLE: ' + m.text()); });

  await page.goto(`${BASE}/pages/analysis.html?city=shenzhen`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction(() => !!document.getElementById('lab-builtup-3d'), { timeout: 10000 }).catch(() => {});

  /* 1. 懒加载 */
  const beforeScroll = await page.evaluate(() => !!window.__bu3D);
  await page.evaluate(() => document.getElementById('lab-builtup-3d').scrollIntoView({ block: 'center' }));
  const ready = await page.waitForFunction(() => {
    const b = window.__bu3D;
    if (!b || !b.map || !b.map.getLayer) return false;
    // 就绪判定不依赖底图瓦片结果：isStyleLoaded 会因栅格瓦片限流重试长期为 false，
    // 这里只要求样式与 3D 图层装配完成。
    try {
      const st = b.map.getStyle();
      return !!(b.map.getLayer('bu3d-city')
        && (st && st.layers || []).some((l) => l.id === 'tdt-vec' || l.id === 'tdt-cva' || l.id === 'tdt-bg'));
    } catch (e) { return false; }
  }, { timeout: 90000 }).then(() => true).catch(() => false);
  log('3D 模块滚动进入视口才初始化', ready && !beforeScroll,
    `滚动前=${beforeScroll ? '已加载' : '未加载'}, 滚动后=${ready ? '已就绪' : '超时'}`);
  if (!ready) {
    await page.screenshot({ path: path.join(OUT, 'v-3d-fail.png') });
    log('后续断言', false, '3D 地图未就绪，跳过');
    console.log(`\n==== 3D 验证：${results.filter((r) => r.ok).length}/${results.length} 通过 ====`);
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(2500);

  /* 2. 默认城市与轮廓数据 */
  const init = await page.evaluate(() => {
    const b = window.__bu3D;
    const f = (b.data[b.state.city] || { features: [] }).features;
    const eras = {}; const heights = new Set();
    let bad = 0;
    f.forEach((x) => {
      const p = x.properties;
      eras[p.era] = (eras[p.era] || 0) + 1;
      heights.add(p.h);
      if (!(p.h > 0 && p.h <= 700)) bad += 1;
    });
    return {
      city: b.state.city, name: document.getElementById('lab-3d-city-select').selectedOptions[0].textContent,
      year: b.state.year, n: f.length, eras, distinctHeights: heights.size, bad,
      filter: JSON.stringify(b.map.getFilter('bu3d-city')),
      color: JSON.stringify(b.map.getPaintProperty('bu3d-city', 'fill-extrusion-color')),
      heightExpr: JSON.stringify(b.map.getPaintProperty('bu3d-city', 'fill-extrusion-height')),
      pitch: Math.round(b.map.getPitch()),
      legendRows: document.querySelectorAll('#lab-3d-legend .lab-3d-legend-row').length,
      loadingHidden: document.getElementById('map-3d-loading').classList.contains('hide'),
    };
  });
  log('默认城市与轮廓数据规模', init.city === 'shenzhen' && init.n > 8000 && init.bad === 0 && init.loadingHidden,
    `${init.name} ${init.n.toLocaleString()} 栋, 越界高度=${init.bad}`);
  log('年代分层覆盖 >=3 个年代且高度非单一值',
    Object.keys(init.eras).length >= 3 && init.distinctHeights > 20,
    `年代=${JSON.stringify(init.eras)} 不同高度数=${init.distinctHeights}`);
  log('时间轴过滤与 1:1 高度绑定',
    init.filter === '["<=",["get","era"],2014]' && init.heightExpr === '["coalesce",["feature-state","gh"],["get","h"]]',
    `filter=${init.filter}, height(gh 生长态, 静态回落 h)=${init.heightExpr}, pitch=${init.pitch}°`);
  log('按年代配色（4 档）与图例计数',
    ['0f6e7c', 'd0471f', '9a6a10', '6b4fa1'].every((c) => init.color.includes(c)) && init.legendRows === 4,
    `图例=${init.legendRows} 行`);

  /* 3. 时间轴（累计模式） */
  const steps = {};
  for (const y of YEARS) {
    await page.click(`[data-3d-year="${y}"]`);
    await page.waitForTimeout(600);
    steps[y] = await page.evaluate(() => {
      const b = window.__bu3D;
      const txt = document.getElementById('lab-3d-stats').textContent.replace(/\s+/g, ' ');
      const m = txt.match(/可见建筑[^0-9]{0,12}([\d,]+)\s*\/\s*([\d,]+)/);
      return {
        filter: JSON.stringify(b.map.getFilter('bu3d-city')),
        visible: m ? Number(m[1].replace(/,/g, '')) : -1,
        total: m ? Number(m[2].replace(/,/g, '')) : -1,
      };
    });
  }
  const monotonic = YEARS.every((y, i) => i === 0 || steps[y].visible >= steps[YEARS[i - 1]].visible);
  log('累计模式：1990→现状 建筑数单调不减',
    monotonic && steps[1990].visible > 0 && steps[2024].visible === steps[2024].total
    && steps[1990].visible < steps[2024].visible,
    YEARS.map((y) => `${y}:${steps[y].visible}`).join(' → ') + ` / 共 ${steps[2024].total}`);

  /* 4. 只看新增模式 */
  await page.click('#btn-3d-incremental');
  await page.waitForTimeout(400);
  const inc = {};
  for (const y of YEARS) {
    await page.click(`[data-3d-year="${y}"]`);
    await page.waitForTimeout(500);
    inc[y] = await page.evaluate(() => {
      const b = window.__bu3D;
      const txt = document.getElementById('lab-3d-stats').textContent.replace(/\s+/g, ' ');
      const m = txt.match(/可见建筑[^0-9]{0,12}([\d,]+)\s*\/\s*([\d,]+)/);
      return { filter: JSON.stringify(b.map.getFilter('bu3d-city')), visible: m ? Number(m[1].replace(/,/g, '')) : -1 };
    });
  }
  const sumInc = YEARS.reduce((a, y) => a + inc[y].visible, 0);
  log('只看新增模式：filter 精确匹配单一年代且各年代之和=总数',
    inc[2014].filter === '["==",["get","era"],2014]' && sumInc === steps[2024].total,
    `各年代新增=${YEARS.map((y) => inc[y].visible).join('/')}，合计 ${sumInc} vs 总数 ${steps[2024].total}`);
  await page.click('#btn-3d-incremental');
  await page.waitForTimeout(400);

  /* 5. 播放 */
  await page.click('[data-3d-year="1990"]');
  await page.waitForTimeout(300);
  await page.click('#btn-3d-play');
  const played = await page.waitForFunction(() => window.__bu3D.state.year === 2024 && !window.__bu3D.state.playing,
    { timeout: 25000 }).then(() => true).catch(() => false);
  const playState = await page.evaluate(() => ({
    year: window.__bu3D.state.year, playing: window.__bu3D.state.playing,
    label: document.getElementById('btn-3d-play').textContent.trim(),
  }));
  log('播放演化自动推进并自行停止', played && playState.year === 2024 && !playState.playing && /播放/.test(playState.label),
    `结束于 ${playState.year}, 按钮="${playState.label}"`);

  /* 6. 城市联动 */
  const cityResults = {};
  for (const c of ['shanghai', 'beijing']) {
    await page.selectOption('#a-controls select', c);
    const ok = await page.waitForFunction((cc) => window.__bu3D.state.city === cc && window.__bu3D.data[cc],
      c, { timeout: 120000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(1800);
    cityResults[c] = await page.evaluate(() => {
      const b = window.__bu3D;
      const f = (b.data[b.state.city] || { features: [] }).features;
      const eras = {};
      f.forEach((x) => { eras[x.properties.era] = (eras[x.properties.era] || 0) + 1; });
      return {
        n: f.length, eras, waited: true,
        sel: document.getElementById('lab-3d-city-select').value,
        name: document.getElementById('lab-3d-city-select').selectedOptions[0].textContent,
        zoom: +b.map.getZoom().toFixed(2),
        cached: Object.keys(b.data).length,
      };
    });
    cityResults[c].waited = ok;
  }
  log('城市下拉联动 3D 并按需加载',
    ['shanghai', 'beijing'].every((c) => cityResults[c].waited && cityResults[c].n > 3000
      && Object.keys(cityResults[c].eras).length >= 2 && cityResults[c].sel === c),
    Object.entries(cityResults).map(([k, v]) => `${v.name || k}=${v.n.toLocaleString()}栋/${Object.keys(v.eras).length}年代`).join(', '));
  log('城市数据缓存随切换累积', cityResults.beijing.cached >= 3, `已缓存 ${cityResults.beijing.cached} 座城市`);

  /* 6b. 模块内城市下拉：就近切换，且不牵动上方卷帘模块 */
  const localSel = await page.evaluate(() => {
    const s = document.getElementById('lab-3d-city-select');
    return { options: s.options.length, value: s.value, values: Array.from(s.options).map((o) => o.value) };
  });
  const beforeTop = await page.evaluate(() => document.querySelector('#a-controls select').value);
  await page.selectOption('#lab-3d-city-select', 'xiamen');
  const moved = await page.waitForFunction((c) => window.__bu3D.state.city === c && window.__bu3D.data[c],
    'xiamen', { timeout: 120000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(2000);
  const afterLocal = await page.evaluate(() => {
    const b = window.__bu3D, m = b.map;
    const meta = (b.state.meta.cities || []).find((x) => x.city === 'xiamen');
    const [s, w, n, e] = meta.window;
    const ctr = m.getCenter();
    return {
      top: document.querySelector('#a-controls select').value,
      sel: document.getElementById('lab-3d-city-select').value,
      n: (b.data.xiamen || { features: [] }).features.length,
      inWindow: ctr.lng > w && ctr.lng < e && ctr.lat > s && ctr.lat < n,
      cityLabel: document.getElementById('lab-3d-city-select').selectedOptions[0].textContent,
    };
  });
  log('3D 模块自带城市下拉（九城，可就近切换）',
    localSel.options === 9 && localSel.values.includes('xiamen') && moved
    && afterLocal.sel === 'xiamen' && afterLocal.n === 4377 && afterLocal.inWindow,
    `${localSel.options} 个选项；选到${afterLocal.cityLabel} ${afterLocal.n} 栋，相机已落入其窗口=${afterLocal.inWindow}`);
  log('模块内切换不重载上方卷帘（顶部下拉保持原城市）',
    afterLocal.top === beforeTop, `顶部下拉仍为 ${afterLocal.top}（模块内已切到 ${afterLocal.sel}）`);

  await page.selectOption('#a-controls select', 'shenzhen');
  await page.waitForTimeout(3000);
  await page.click('[data-3d-year="2024"]');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(OUT, 'v-3d-evolution-2024.png') });
  await page.click('[data-3d-year="1990"]');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'v-3d-evolution-1990.png') });

  /* 7. 两级 LOD：阈值随相机浮动，默认远景只画概览层 */
  const lodA = await page.evaluate(() => {
    const b = window.__bu3D, m = b.map, st = b.state;
    const d = m.getLayer('bu3d-city'), o = m.getLayer('bu3d-city-ov');
    return {
      camZoom: +m.getZoom().toFixed(2), lodZoom: +st.lodZoom.toFixed(2), lodRaw: st.lodZoom,
      dmin: d.minzoom, dmax: d.maxzoom, omin: o.minzoom, omax: o.maxzoom,
      chip: document.getElementById('lab-3d-lod').textContent.replace(/\s+/g, ' '),
      srcMz: m.getSource('bu3d-src').maxzoom, ovMz: m.getSource('bu3d-ov-src').maxzoom,
    };
  });
  await page.evaluate(() => { window.__bu3D.map.jumpTo({ zoom: window.__bu3D.state.lodZoom + 0.3 }); });
  await page.waitForTimeout(1800);
  const lodB = await page.evaluate(() => ({
    chip: document.getElementById('lab-3d-lod').textContent.replace(/\s+/g, ' '),
    cls: document.getElementById('lab-3d-lod').className,
    zoom: +window.__bu3D.map.getZoom().toFixed(2),
  }));
  await page.click('#btn-3d-reset');
  await page.waitForTimeout(1500);
  log('两级 LOD 阈值随相机浮动并实时提示',
    lodA.lodZoom >= lodA.camZoom + 1.3 && lodA.dmin === lodA.lodRaw && lodA.omax === lodA.lodRaw
    && /远景概览层/.test(lodA.chip) && /m 网格/.test(lodA.chip)
    && /逐栋细节层/.test(lodB.chip) && /is-detail/.test(lodB.cls),
    `相机 ${lodA.camZoom} 级 → 阈值 ${lodA.lodZoom} 级；源码层 maxzoom=${lodA.srcMz}/${lodA.ovMz}`);

  /* 8. 文案与读数 */
  const copy = await page.evaluate(() => ({
    note: document.getElementById('lab-3d-note').textContent,
    stats: document.getElementById('lab-3d-stats').textContent.replace(/\s+/g, ' '),
  }));
  log('OSM 署名与推断说明就位',
    /OpenStreetMap contributors/.test(copy.note) && /ODbL/.test(copy.note)
    && /年代分层而非竣工年份/.test(copy.note) && /1:1/.test(copy.note),
    copy.note.slice(0, 40) + '…');
  log('读数含可见数与高度来源占比', /可见建筑/.test(copy.stats) && /高度来源/.test(copy.stats) && /%/.test(copy.stats),
    copy.stats.slice(0, 60) + '…');

  /* 8b. 自适应降级：细节层帧时过低时自动上调阈值回概览层并披露 */
  const lod0 = await page.evaluate(() => {
    const s = window.__bu3D.state, m = window.__bu3D.map;
    s.autoLod = true; s.autoRaise = 0; s.autoCool = 0;
    return { lodZoom: +s.lodZoom.toFixed(2) };
  });
  const autoR = await page.evaluate(() => new Promise((resolve) => {
    const st = window.__bu3D.state, m = window.__bu3D.map;
    st.samples.times.length = 0;                    // 注入 180ms 帧时样本，模拟低端机细节层卡顿
    for (let i = 0; i < 34; i++) st.samples.times.push(180 + (i % 3));
    m.jumpTo({ zoom: st.lodZoom + 0.2, pitch: 56 }); // 相机需处于细节层之上
    setTimeout(() => {
      m.setBearing(m.getBearing() + 0.5);            // 触发一帧 render，让 evaluateAutoLod 消费样本
      setTimeout(() => resolve({
        raise: st.autoRaise, lodZoom: +st.lodZoom.toFixed(2),
        chip: document.getElementById('lab-3d-lod').textContent.replace(/\s+/g, ' '),
        dMin: m.getLayer('bu3d-city').minzoom, oMax: m.getLayer('bu3d-city-ov').maxzoom,
      }), 250);
    }, 120);
  }));
  await page.click('#btn-3d-reset');
  await page.waitForTimeout(1200);
  const autoReset = await page.evaluate(() => window.__bu3D.state.autoRaise);
  log('自适应降级：细节层帧时过低自动上调阈值并在读数披露',
    autoR.raise > 0 && autoR.dMin === autoR.lodZoom && autoR.oMax === autoR.lodZoom
    && /已临时上调/.test(autoR.chip) && autoReset === 0,
    `阈值 ${lod0.lodZoom} → ${autoR.lodZoom}（+${autoR.raise.toFixed(1)} 复位后清零=${autoReset === 0}）`);

  /* 8c. 生长动画：相邻年份切换对楼宇升起表现与归零（默认相机在概览层，写的是 b3d-ov-src） */
  {
    const sample = await page.evaluate(() => {
      const B = window.__bu3D;
      const feats = (B.overview[B.state.city] || { features: [] }).features;
      const ids = [];
      for (let i = 0; i < feats.length && ids.length < 40; i++) {
        if (Number(feats[i].properties.era) === 2000) ids.push(feats[i].id != null ? feats[i].id : i);
      }
      return { ids };
    });
    await page.click('[data-3d-year="1990"]');
    await page.waitForTimeout(2300); // 收缩复位，1990 段动画自然结束
    await page.click('[data-3d-year="2000"]');
    await page.waitForTimeout(520);
    const during = await page.evaluate((ids) => {
      const m = window.__bu3D.map;
      let withGh = 0;
      for (const id of ids) {
        const st = m.getFeatureState({ source: 'bu3d-ov-src', id });
        if (st && st.gh != null && Number(st.gh) >= 0) withGh += 1;
      }
      return { withGh, total: ids.length };
    }, sample.ids);
    await page.waitForTimeout(2400);
    const after = await page.evaluate((ids) => {
      const m = window.__bu3D.map;
      let leftover = 0;
      for (const id of ids) {
        const st = m.getFeatureState({ source: 'bu3d-ov-src', id });
        if (st && st.gh != null) leftover += 1;
      }
      return leftover;
    }, sample.ids);
    log('生长动画：揭楼期写入 gh、收尾归零（1:1 满高回归）',
      during.withGh > 0 && after === 0,
      `动画中含 gh 样本=${during.withGh}/${during.total}，结束后残留=${after}`);
  }

  /* 9. 控制台 */
  log('无致命控制台错误', errors.length === 0, errors.slice(0, 3).join(' ;; '));

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n==== 3D 验证：${passed}/${results.length} 通过 ====`);
  await browser.close();
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
