// basemap.js - 天地图在线底图引擎
//
// 统一采用「天地图」球面墨卡托矢量底图（vec_w）与中文注记（cva_w），审图号 GS(2023)336号。
// 通过栅格色彩降饱和与暖纸底色匀光，使底图与历史地理图册视觉融为一体；
// 同时锁定地图最大缩放级别（TIANDITU_MAX_ZOOM = 17，对应 256px WMTS 原生第 18 级），到达上限即禁止继续放大。

import {
  TIANDITU_TK,
  TIANDITU_TILE_MAX_ZOOM,
  TIANDITU_MIN_ZOOM,
  TIANDITU_MAX_ZOOM,
  tiandituTileURL,
} from './config.js';
import { fetchJSON, dataUrl, el } from './utils.js';

export const BASE_ONLINE_LAYERS = ['tdt-vec', 'tdt-cva'];

const TDT_VEC_PAINT = {
  'raster-opacity': 0.9,
  'raster-saturation': -0.56,
  'raster-contrast': -0.05,
  'raster-brightness-min': 0.05,
  'raster-brightness-max': 0.99,
};

const TDT_CVA_PAINT = {
  'raster-opacity': 0.95,
  'raster-saturation': -0.45,
  'raster-contrast': 0.06,
};

/* ---------------------- 天地图瓦片加载（原生管线 + 事件驱动健康环） ----------------------
 * 2026-11-10 关键修正：放弃 tdtQ:// 自定义协议，恢复 MapLibre 原生 raster 管线。
 * 原因（实证自 min-repro）：自定义协议把"相机飞行中的瓦片中止"放大成自有 AbortError——
 * MapLibre 会把 中止/失败的 tile 标为 unloaded 并把它视作"已就绪"，页面一进 idle 便再无
 * 渲染帧去触发 _update，终帧瓦片永远不落地（复现了四城记忆/首页"进页即无底图"；2D/3D
 * 分析模块 11-08 的底图缺失问题同根）。原生管线对中止/expired/errored 的瓦片会自行重拉，
 * 无需我们代理；同飞行场景 raw 管线 loaded=true 132 张 200（tdtQ 协议形态 loaded=false）。
 * 天地图浏览端 tk 的瞬时限流（超并发窗口被 400/429 拒）由下方事件驱动健康环：
 *   - 10s 内连续 ≥8 次失败 → 隐藏天地图、切换为「自绘中国标准矢量底图」并广播
 *     `wb-basemap-fallback` 事件，同时停发天地图瓦片让配额冷却，每 60s 探测恢复；
 *   - 连续 2 次探测成功（间隔 60s）→ 自动切回天地图。
 */
function tdtTiles(layer) {
  const subs = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
  return subs.map((s) =>
    `https://${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split('_')[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${TIANDITU_TK}`);
}


/* ------------------- 限流自动降级：自绘中国标准矢量底图 -------------------
 * tk 当日配额耗尽/限流时每张瓦片都 429，页面只剩米色背景。健康状态由各地图的
 * `error` 事件（天地图源瓦片失败）驱动：
 *   - 10s 内连续 ≥8 次失败 → 全部已注册地图把天地图图层隐藏、切换为「自绘中国标准
 *     矢量底图」，并广播事件 `wb-basemap-fallback` 供页面提示与署名更新；同时揭除
 *     天地图失败计数冷却，每 60s 用单张样例瓦片探测恢复。
 *   - 连续 2 次探测成功（间隔 60s）→ 自动切回天地图。
 * 2026-11-08 合规改造：备用底图不再使用任何外国栅格源（此前降级链会落到
 * Esri / OSM 瓦片——两者都不含九段线，还把台湾标注成独立国家的 "TAIWAN" 字样，
 * 作为面向公众的中国主题地图属于"问题地图"，须杜绝）。降级底图改为仓库自绘：
 *   - 陆地与省级行政区划（含台湾省、港澳特别行政区）：data/china-provinces.geojson；
 *   - 十段线（南海诸岛断续线，10 段）：几何描摹自民政部全国行政区划信息查询平台
 *     xzqh.mca.gov.cn 的标准底图（geojson.cn 十段线数据集整理，OSM relation 3939323
 *     校核），常量内嵌、虚线绘出；
 *   - 中文注记（省级地名、南海诸岛、焦点城市）由 DOM 标签实时绘出，只表达中国
 *     行政区划，不渲染任何外国地图内容；配额恢复后自动切回天地图主底图。
 */
const TDT_STALL_FAILS = 8;
const TDT_STALL_WINDOW_MS = 10000;
const TDT_RECOVER_PROBES = 2;
const TDT_PROBE_INTERVAL_MS = 60000;

const basemapWatchers = new Set();
const tdtHealth = { fails: [], swapped: false, probeWins: 0, probeTimer: null };

/* 自绘矢量降级底图的图层标识 */
const WB_FB_SRC_LAND = 'wb-fb-land-src';
const WB_FB_SRC_DASH = 'wb-fb-dash-src';
const WB_FB_L_LAND = 'wb-fb-land';
const WB_FB_L_PROV = 'wb-fb-prov';
const WB_FB_L_DASH = 'wb-fb-dash';

// 十段线：南海诸岛断续线 10 段，描摹自民政部 xzqh.mca.gov.cn 标准行政区划底图
// （geojson.cn 十段线数据集整理，OSM relation 3939323 校核）。
const WB_TEN_DASH_COORDS = [
  [[109.51763678906526, 16.360467782665847], [109.72339159230361, 16.05587198177934], [109.8780414893003, 15.766823920473868], [109.96506402665503, 15.526031073258686], [109.98526818797363, 15.335615618596712]],
  [[110.48331454715199, 12.431407837351566], [110.48240767589328, 12.085792287259398], [110.45136562643113, 11.863835000833953], [110.25652028695671, 11.393616070326182]],
  [[108.3388949586325, 7.26656318024262], [108.30727608084116, 6.727803403200289], [108.35631901989032, 6.112648053307836]],
  [[111.94112275674237, 3.553559321848772], [112.40151782268552, 3.646409974664658], [112.92104341055976, 3.845112027649191]],
  [[115.69079809651517, 7.29016984601141], [116.4095482213759, 8.137962397303875]],
  [[118.63503455703679, 11.080904139262175], [118.85587024190139, 11.457907321145406], [119.10128629647166, 12.062751715859875], [119.12181771101825, 12.135585760471585]],
  [[119.60808384544805, 18.143451232827125], [119.91075760817219, 18.77194701315816], [120.11918953031866, 19.117669954512905]],
  [[121.40591812413318, 20.8001943859176], [122.12216430894797, 21.716094829922323]],
  [[122.80328441666389, 23.665545127578547], [123.00481138309124, 24.74934291726869]],
  [[119.16836075308866, 15.107448879733406], [119.16981236678279, 15.755038547478351], [119.17823197590195, 16.265658015720753]],
];

// 降级底图上的焦点城市注记（与 data/cities.json 四城及 3D 模块九城一致）
const WB_FB_CITY_LABELS = [
  { name: '深圳', lng: 114.0579, lat: 22.5431 },
  { name: '上海', lng: 121.4737, lat: 31.2304 },
  { name: '广州', lng: 113.2644, lat: 23.1291 },
  { name: '厦门', lng: 118.0894, lat: 24.4798 },
  { name: '北京', lng: 116.4074, lat: 39.9042 },
  { name: '杭州', lng: 120.1551, lat: 30.2741 },
  { name: '武汉', lng: 114.3055, lat: 30.5928 },
  { name: '成都', lng: 104.0668, lat: 30.5728 },
  { name: '青岛', lng: 120.3826, lat: 36.0671 },
];

// 降级底图数据（省级 GeoJSON 只拉一次，全页面共享；失败的 Promise 可重置重试）
let wbFbDataPromise = null;
function wbFbGeoJson() {
  if (!wbFbDataPromise) {
    wbFbDataPromise = fetchJSON(dataUrl('china-provinces.geojson'), { noCache: true })
      .then((provinces) => ({ provinces }))
      .catch((err) => { wbFbDataPromise = null; throw err; });
  }
  return wbFbDataPromise;
}

// 首个地图注册后低优先级预取（layers/gis-tools 多半已把同一份 data 写进 utils 缓存，
// 这里命中即零网络零解析）：保证降级换装瞬时完成，不把首次解析塞进动画/滚动关键时段
function wbFbPreload() {
  if (wbFbDataPromise) return;
  setTimeout(() => { try { wbFbGeoJson().catch(() => {}); } catch (e) {} }, 300);
}

/* —— 自绘降级底图：图层与注记 —— */

// 省面几何的顶点平均质心（注记定位用，零依赖且精度足够）
function polygonCentroid(geom) {
  try {
    const polys = geom.type === 'Polygon' ? [geom.coordinates]
      : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    let sx = 0, sy = 0, n = 0;
    for (const poly of polys) for (const ring of poly) for (const [x, y] of ring) { sx += x; sy += y; n += 1; }
    return n ? { lng: sx / n, lat: sy / n } : null;
  } catch (e) { return null; }
}

// 锚点：按【样式栈实际顺序】找第一个业务底图/建筑层。候选列表的 find 存在盲区：
// bu3d-city(-ov) 与 tdt 系层挂载时序错开时，栈序中的相对位置与候选列表不一致，
// 会把降级层插到楼体之上。此处按 getStyle().layers 的真实顺序扫描。
function wbFbAnchorId(map) {
  try {
    const want = new Set(['bu3d-city-ov', 'bu3d-city', 'tdt-vec', 'tdt-cva']);
    for (const l of (map.getStyle().layers || [])) {
      if (want.has(l.id)) return l.id;
    }
  } catch (e) {}
  return undefined;
}

// 按需创建降级底图图层（陆地填充 / 省界线 / 十段线），并用 moveLayer 显式校正三者
// 到「首个业务层之下」，不依赖 addLayer 的插入次序（防止挂载时序错开把降级层顶到楼上）
function ensureFbLayers(map, provinces) {
  if (!map.getSource(WB_FB_SRC_LAND)) {
    map.addSource(WB_FB_SRC_LAND, { type: 'geojson', data: provinces });
  }
  if (!map.getSource(WB_FB_SRC_DASH)) {
    map.addSource(WB_FB_SRC_DASH, {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: '十段线' },
          geometry: { type: 'MultiLineString', coordinates: WB_TEN_DASH_COORDS },
        }],
      },
    });
    // 供 verify-fallback.cjs 做数据级断言（不依赖 MapLibre source 内部实现）
    map._wbFbDashCoords = WB_TEN_DASH_COORDS;
    map._wbFbProvNames = (() => {
      try {
        const names = new Set();
        for (const f of (provinces.features || [])) {
          const n = f.properties && f.properties.name;
          if (n && !/^(香港|澳门)特别行政区$/.test(n)) names.add(n);
        }
        return [...names];
      } catch (e) { return []; }
    })();
  }
  if (!map.getLayer(WB_FB_L_LAND)) {
    map.addLayer({
      id: WB_FB_L_LAND, type: 'fill', source: WB_FB_SRC_LAND,
      paint: { 'fill-color': '#ece2cc', 'fill-opacity': 0.97 },
    });
  }
  if (!map.getLayer(WB_FB_L_PROV)) {
    map.addLayer({
      id: WB_FB_L_PROV, type: 'line', source: WB_FB_SRC_LAND,
      paint: { 'line-color': '#c3b28c', 'line-width': 0.9, 'line-opacity': 0.9 },
    });
  }
  if (!map.getLayer(WB_FB_L_DASH)) {
    map.addLayer({
      id: WB_FB_L_DASH, type: 'line', source: WB_FB_SRC_DASH,
      paint: { 'line-color': '#9a5524', 'line-width': 1.8, 'line-dasharray': [2, 1.8], 'line-opacity': 0.95 },
    });
  }
  // 显式落位：land 在锚点（首个业务层）之下，prov 在 land 之下，dash 在 prov 之下
  const at = wbFbAnchorId(map);
  if (at) {
    try { map.moveLayer(WB_FB_L_LAND, at); } catch (e) {}
    try { map.moveLayer(WB_FB_L_PROV, WB_FB_L_LAND); } catch (e) {}
    try { map.moveLayer(WB_FB_L_DASH, WB_FB_L_PROV); } catch (e) {}
  }
}

// 降级底图中文注记：DOM 标签（地图样式未配 glyphs，不用 symbol 文本图层）。
// z<6.3 标省级名，z≥6.3 切换为九个焦点城市名；香港/澳门特别行政区只绘图形不标名。
function ensureFbMarkers(map, provinces) {
  if (map._wbFbMarkers) return;
  const made = [];
  const add = (lng, lat, cls, text, isCity) => {
    const node = el('span', { class: `wbfb-label ${cls}` });
    node.textContent = text;
    node._wbCity = !!isCity;
    made.push(new maplibregl.Marker({ element: node, anchor: 'center' }).setLngLat([lng, lat]).addTo(map));
  };
  const seen = new Set();
  for (const f of (provinces.features || [])) {
    const name = f.properties && f.properties.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (/^(香港|澳门)特别行政区$/.test(name)) continue;
    const c = polygonCentroid(f.geometry);
    if (c) add(c.lng, c.lat, 'wbfb-label-prov', name, false);
  }
  add(114.6, 13.6, 'wbfb-label-dash', '南海诸岛', false);
  for (const c of WB_FB_CITY_LABELS) add(c.lng, c.lat, 'wbfb-label-city', c.name, true);
  const sync = () => {
    let showCity = false;
    try { showCity = map.getZoom() >= 6.3; } catch (e) { return; }
    for (const mk of made) {
      const node = mk.getElement();
      node.style.display = (!!node._wbCity) === showCity ? 'block' : 'none';
    }
  };
  map.on('zoom', sync);
  sync();
  map._wbFbMarkers = {
    made,
    off() {
      try { map.off('zoom', sync); } catch (e) {}
      for (const mk of made) { try { mk.remove(); } catch (e) {} }
    },
  };
}

// 降级状态应用器：on=true 启用自绘矢量底图并隐藏天地图；on=false 还原天地图并拆除注记
async function swapMapBasemap(map, on) {
  if (!map || map._wbRemoved) return;
  for (const id of BASE_ONLINE_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible');
  }
  // 降级态常驻徽标：让"当前是自绘底图"这件事可见（此前只有 10s 横幅，错过就无感知）
  try {
    const container = map.getContainer();
    if (container) {
      let badge = container.querySelector('.wbfb-badge');
      if (on && !badge) {
        badge = document.createElement('div');
        badge.className = 'wbfb-badge';
        badge.setAttribute('role', 'status');
        badge.title = '天地图在线瓦片当前不可达（网络/代理或 key 配额），已临时切换为自绘中国标准矢量底图；探测恢复后自动切回。';
        badge.textContent = '自绘底图 · 天地图暂不可达';
        container.appendChild(badge);
      } else if (!on && badge) {
        badge.remove();
      }
    }
  } catch (e) {}
  if (!on) {
    for (const id of [WB_FB_L_LAND, WB_FB_L_PROV, WB_FB_L_DASH]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
    if (map._wbFbMarkers) { map._wbFbMarkers.off(); map._wbFbMarkers = null; }
    return;
  }
  try {
    const { provinces } = await wbFbGeoJson();
    ensureFbLayers(map, provinces);
    ensureFbMarkers(map, provinces);
    for (const id of [WB_FB_L_LAND, WB_FB_L_PROV, WB_FB_L_DASH]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    }
  } catch (err) {
    // 数据加载失败（极罕见，仓库内静态资源）：保留天地图隐藏状态，等待下次探测恢复
    console.warn('[basemap] 自绘降级底图数据加载失败', err);
  }
}

function announceFallback(on, detail) {
  try {
    document.dispatchEvent(new CustomEvent('wb-basemap-fallback', { detail: Object.assign({ fallback: on }, detail || {}) }));
  } catch (e) {}
}

// 挑级降级换装：逐图应用「自绘中国标准矢量底图」，完成后广播降级署名。
// 健康环由各地图的 error 事件驱动——天地图栅格瓦片失败（含瞬时限流 400/429 与配额耗尽）
// 都会触发 map 'error'。
async function swapToFallback() {
  for (const map of basemapWatchers) { try { await swapMapBasemap(map, true); } catch (e) {} }
  announceFallback(true, {
    name: '自绘中国标准矢量底图',
    attr: '省级区划（含台湾省）与十段线均为仓库自绘数据',
  });
}

function startRecoveryProbe() {
  if (tdtHealth.probeTimer) return;
  tdtHealth.probeWins = 0;
  tdtHealth.probeTimer = setInterval(async () => {
    try { window.__tdtProbeTicks = (window.__tdtProbeTicks || 0) + 1; } catch (e) {}
    if (!tdtHealth.swapped) { stopRecoveryProbe(); return; }
    if (navigator.onLine === false) return;
    try {
      const ok = await probeOnlineAvailable(6000);
      if (ok) {
        tdtHealth.probeWins += 1;
        if (tdtHealth.probeWins >= TDT_RECOVER_PROBES) {
          tdtHealth.swapped = false;
          stopRecoveryProbe();
          for (const map of basemapWatchers) { swapMapBasemap(map, false).catch(() => {}); }
          announceFallback(false);
        }
      } else {
        tdtHealth.probeWins = 0;
      }
    } catch (e) {}
  }, TDT_PROBE_INTERVAL_MS);
}

function stopRecoveryProbe() {
  if (tdtHealth.probeTimer) { clearInterval(tdtHealth.probeTimer); tdtHealth.probeTimer = null; }
  tdtHealth.probeWins = 0;
}

// 协议每收到一次天地图响应都回报（每个 HTTP 结果一次；成功不清零，靠时间窗滑出）
function noteTdtResult(ok) {
  const now = Date.now();
  if (ok) {
    if (!tdtHealth.swapped) return; // 判定只看连续失败；备用状态下由探测器驱动回切
    return;
  }
  tdtHealth.fails.push(now);
  while (tdtHealth.fails.length && now - tdtHealth.fails[0] > TDT_STALL_WINDOW_MS) tdtHealth.fails.shift();
  if (!tdtHealth.swapped && tdtHealth.fails.length >= TDT_STALL_FAILS) {
    tdtHealth.swapped = true;
    swapToFallback(); // 异步挑档 + 全局换装
    startRecoveryProbe();
  }
}

// setupBasemap / 各地图初始化完成后调用：成为自动降级的观察对象；
// 若注册时已处于降级状态（页面早段限流，3D 地图 load 晚于 swap 阈值），立即同步应用。
// 原生管线没有"全网收口"，健康环挂各地图自己的 error 事件（天地图源瓦片失败计数）。
export function watchBasemapHealth(map) {
  if (!map || basemapWatchers.has(map)) return;
  basemapWatchers.add(map);
  wbFbPreload();
  if (!map._wbHealthHook) {
    map._wbHealthHook = true;
    map.on('error', (e) => {
      try {
        const src = (e && e.sourceId) || '';
        const msg = (e && ((e.error && e.error.message) || e.message)) || '';
        if (BASE_ONLINE_LAYERS.indexOf(src) >= 0 || /tianditu|GetTile|tile/i.test(msg)) noteTdtResult(false);
      } catch (err) {}
    });
  }
  if (tdtHealth.swapped) swapMapBasemap(map, true).catch(() => {});
  const onRemove = () => {
    basemapWatchers.delete(map);
    try { map.off('remove', onRemove); } catch (e) {}
    if (!basemapWatchers.size) { tdtHealth.swapped = false; stopRecoveryProbe(); }
  };
  try { map.on('remove', onRemove); } catch (e) {}
}

// 当前是否处于备用底图状态（限流中）
export function basemapFallbackActive() { return tdtHealth.swapped; }

// 初始底图画布样式（先以暖纸底色瞬时完成 style load，再由 setupBasemap 立即挂载天地图 vec_w / cva_w，
// 避免远程瓦片网络抖动阻塞业务矢量图层与 PostGIS 空间分析初始化）
export function buildOnlineStyle() {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'tdt-bg', type: 'background', paint: { 'background-color': '#f3ede2' } },
    ],
  };
}

// 确保地图已装配天地图底图图层与缩放上下限锁
export async function setupBasemap(map) {
  await waitMapReady(map);
  if (!mapReady(map)) return;

  try {
    if (typeof map.setMinZoom === 'function') map.setMinZoom(TIANDITU_MIN_ZOOM);
    if (typeof map.setMaxZoom === 'function') map.setMaxZoom(TIANDITU_MAX_ZOOM);
  } catch (e) {}

  if (!map.getSource('tdt-vec')) {
    map.addSource('tdt-vec', {
      type: 'raster',
      tiles: tdtTiles('vec_w'),
      tileSize: 256,
      minzoom: 1,
      maxzoom: TIANDITU_TILE_MAX_ZOOM,
    });
  }
  if (!map.getSource('tdt-cva')) {
    map.addSource('tdt-cva', {
      type: 'raster',
      tiles: tdtTiles('cva_w'),
      tileSize: 256,
      minzoom: 1,
      maxzoom: TIANDITU_TILE_MAX_ZOOM,
    });
  }
  if (!map.getLayer('tdt-vec')) {
    map.addLayer({ id: 'tdt-vec', type: 'raster', source: 'tdt-vec', paint: TDT_VEC_PAINT });
  }
  if (!map.getLayer('tdt-cva')) {
    map.addLayer({ id: 'tdt-cva', type: 'raster', source: 'tdt-cva', paint: TDT_CVA_PAINT });
  }
  watchBasemapHealth(map); // 纳入限流自动降级观察
}

// 绑定缩放上限状态同步：到达天地图最大原生级别时禁用放大按钮并更新提示文案
export function bindZoomLimitControl(map, hostEl) {
  if (!map) return;
  const sync = () => {
    try {
      const z = map.getZoom();
      const maxZ = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : TIANDITU_MAX_ZOOM;
      const minZ = typeof map.getMinZoom === 'function' ? map.getMinZoom() : TIANDITU_MIN_ZOOM;
      const atMax = z >= maxZ - 0.01;
      const atMin = z <= minZ + 0.01;
      const root = hostEl || (map.getContainer && map.getContainer().parentElement) || (map.getContainer && map.getContainer());
      if (!root) return;
      const btnIn = root.querySelector('.maplibregl-ctrl-zoom-in');
      const btnOut = root.querySelector('.maplibregl-ctrl-zoom-out');
      if (btnIn) {
        btnIn.disabled = atMax;
        btnIn.setAttribute('aria-disabled', atMax ? 'true' : 'false');
        const tip = atMax ? `已达天地图最大缩放级别（Z${maxZ} / 瓦片18级）` : '放大';
        btnIn.title = tip;
        btnIn.setAttribute('aria-label', tip);
      }
      if (btnOut) {
        btnOut.disabled = atMin;
        btnOut.setAttribute('aria-disabled', atMin ? 'true' : 'false');
      }
    } catch (e) {}
  };
  map.on('zoom', sync);
  map.on('zoomend', sync);
  map.on('load', sync);
  setTimeout(sync, 60);
}

// 格式化状态栏缩放级别读数（达上限时给出明确标记）
export function formatZoomReadout(map) {
  const z = map.getZoom();
  const maxZ = typeof map.getMaxZoom === 'function' ? map.getMaxZoom() : TIANDITU_MAX_ZOOM;
  return z >= maxZ - 0.01 ? `${z.toFixed(2)} (上限)` : z.toFixed(2);
}

// 补载被限流/失败的天地图瓦片：429 拒掉后 MapLibre 不会自动重发这些瓦片（尤其 3D 模块
// 切换城市后相机动辄几十张新瓦片，一次被限流就留下成片空洞）。这里在需要时对两侧栅格
// 源整体 reload 一轮（只针对 loaded()==false 的源，避免白白重取完整底图）。
// 调用方：3D 建筑演化切城 easeTo 结束后；肉眼可见的空洞多在 2 次内补齐。
export function repairBasemapTiles(map) {
  if (!map || map._wbRemoved || typeof map.isStyleLoaded !== 'function') return;
  if (basemapFallbackActive()) return; // 备用底图生效时不重取天地图
  let once = 0;
  const attempt = () => {
    if (!map || map._wbRemoved) return;
    let reloaded = false;
    try {
      const caches = (map.style && map.style.sourceCaches) || {};
      for (const id of BASE_ONLINE_LAYERS) {
        const c = caches[id];
        if (!c || typeof c.reload !== 'function' || typeof c.loaded !== 'function') continue;
        if (!c.loaded()) { try { c.reload(); reloaded = true; } catch (e) {} }
      }
    } catch (e) { /* 样式未就绪时忽略 */ }
    once += 1;
    if (reloaded && once < 4) setTimeout(attempt, 2600);
  };
  attempt();
}

// 探测天地图在线瓦片是否可访问
export async function probeOnlineAvailable(timeoutMs = 3000) {  try {
    const url = tiandituTileURL('vec_w', 4, 12, 6);
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    const res = await fetch(url, { method: 'GET', signal: ctrl ? ctrl.signal : undefined });
    if (timer) clearTimeout(timer);
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    const ct = res.headers.get('content-type') || '';
    return buf.byteLength > 500 && ct.indexOf('image') !== -1;
  } catch (e) {
    return false;
  }
}

export function basemapLabel() {
  return '天地图 · GS(2023)336号';
}

function mapReady(map) {
  if (!map || map._wbRemoved) return false;
  if (map.style === undefined) return false;
  try { return !map.isStyleLoaded || map.isStyleLoaded(); } catch (e) { return false; }
}

function waitMapReady(map, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const ok = () => { try { return map && !map._wbRemoved && map.isStyleLoaded && map.isStyleLoaded(); } catch (e) { return false; } };
    if (ok()) return resolve();
    const t0 = Date.now();
    const tick = () => {
      if (ok() || Date.now() - t0 > timeoutMs) return resolve();
      setTimeout(tick, 90);
    };
    tick();
  });
}
