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

function tdtTiles(layer) {
  const subs = ['t0', 't1', 't2', 't3', 't4', 't5', 't6', 't7'];
  return subs.map((s) =>
    `tdtQ://${encodeURIComponent(`https://${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split('_')[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${TIANDITU_TK}`)}`);
}

/* -------------------------- 天地图瓦片请求节流与 429 退避重试 --------------------------
 * 现象：3D 模块切换城市 / 卷帘扫过新区域时一次会拉起几十到上百张瓦片请求，天地图对 tk 有
 * QPS/分钟配额，瞬时爆发整批 429 被拒；MapLibre 对失败瓦片不自动补请求，留下持续空洞。
 * 措施：自定义 tdtQ:// 协议收口全部天地图栅格请求——
 *   1) 全局并发上限 6，削减瞬时突发；
 *   2) 429 / 5xx / 网络失败按 700ms·2^n 退避重试 3 次，重试成功即可正常入图；
 *   3) abort 立即让出槽位；排队上限 128，超限直接拒绝（优先保住当前视野的首屏瓦片）。
 */
const TDT_SCHEME = 'tdtQ';
const TDT_MAX_CONCURRENT = 6;
const TDT_RETRY_MAX = 3;
const TDT_RETRY_BASE_MS = 700;
const TDT_QUEUE_MAX = 128;
let tdtActive = 0;
const tdtQueue = [];

function abortErr() { return new DOMException('Aborted', 'AbortError'); }

function tdtEnqueue(task, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortErr());
    if (tdtQueue.length >= TDT_QUEUE_MAX) { const qe = new Error('tdt queue overflow'); qe.status = 429; return reject(qe); }
    const job = { task, done: false };
    job.cancel = () => {
      if (job.done) return;
      const idx = tdtQueue.indexOf(job);
      if (idx >= 0) tdtQueue.splice(idx, 1); // 还在排队：让出位置
      job.done = true;
      job.cleanup();
      reject(abortErr());
    };
    job.cleanup = () => { if (signal) Signal_remove(signal, job.cancel); };
    job.settle = (err, value) => {
      if (job.done) return;
      job.done = true;
      tdtActive = Math.max(0, tdtActive - 1);
      job.cleanup();
      err ? reject(err) : resolve(value);
      pumpTdt();
    };
    if (signal) signal.addEventListener('abort', job.cancel, { once: true });
    tdtQueue.push(job);
    pumpTdt();
  });
}
function Signal_remove(signal, fn) { if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', fn); }

function pumpTdt() {
  while (tdtActive < TDT_MAX_CONCURRENT && tdtQueue.length) {
    const job = tdtQueue.shift();
    tdtActive += 1;
    Promise.resolve().then(() => job.task()).then(
      (v) => job.settle(null, v),
      (e) => job.settle(e),
    );
  }
}

async function tdtLoadProtocol(params, abortController) {
  const real = decodeURIComponent(String(params.url || '').slice((TDT_SCHEME + '://').length));
  const signal = abortController ? abortController.signal : undefined;
  for (let attempt = 0; ; attempt++) {
    let buf;
    try {
      if (signal && signal.aborted) throw abortErr();
      buf = await tdtEnqueue(async () => {
        const r = await fetch(real, { signal, credentials: 'omit', referrerPolicy: 'no-referrer-when-downgrade' });
        if (!r.ok) { const err = new Error('tianditu ' + r.status); err.status = r.status; throw err; }
        return r.arrayBuffer();
      }, signal);
      if (!buf.byteLength) { const err = new Error('tianditu empty'); err.status = 502; throw err; }
      noteTdtResult(true);
      return { data: buf };
    } catch (err) {
      if (signal && signal.aborted) throw abortErr();
      const status = err && err.status;
      const retriable = attempt < TDT_RETRY_MAX
        && (status === 429 || (status >= 500 && status <= 599) || status === undefined);
      if (status === undefined || (status >= 400 && status <= 599) || status === 429) noteTdtResult(false);
      if (!retriable) throw err;
      await new Promise((r) => setTimeout(r, TDT_RETRY_BASE_MS * Math.pow(2, attempt)));
    }
  }
}

function registerTdtProtocol() {
  if (typeof maplibregl === 'undefined' || typeof maplibregl.addProtocol !== 'function') return;
  if (maplibregl.__wbTdtThrottled) return;
  maplibregl.__wbTdtThrottled = true;
  maplibregl.addProtocol(TDT_SCHEME, tdtLoadProtocol);
}
registerTdtProtocol();

/* -------------------------- 备用底图与限流自动降级 --------------------------
 * tk 当日配额耗尽时每张瓦片都 429，客户端重试救不了配额，页面只剩米色背景。
 * 天地图栅格请求收口在 tdtQ:// 协议里，天然拥有全网状态：
 *   - 10s 内连续 ≥8 次失败 → 全部已注册地图把天地图图层隐藏、显示备用栅格底图，
 *     并发事件 `wb-basemap-fallback` 供页面提示与署名更新；同时停发天地图瓦片，
 *     让配额冷却，并每 60s 用单张样例瓦片探测恢复。
 *   - 连续 2 次探测成功（间隔 60s）→ 自动切回天地图。
 * 备用底图是多源开源降级链，换装时「并行探档·最快到者优先 → 当前视野瓦片预取入 HTTP 缓存
 * → 再显示图层（首图即现）」；每档要求 WGS84/3857 同基准、免密钥、CORS 开放：
 *   1) Esri Light Gray Canvas … © Esri（灰色底图，大陆可达，首连较慢属正常）
 *   2) OSM-FR HOT … © OpenStreetMap contributors（浅暖风格，大陆可达性较好）
 *   3) OSM 标准瓦片 … © OpenStreetMap contributors（部分网络不可达，探测自动跳过）
 * 排除项：CARTO 免密端点已强制门禁（返回 "API KEY REQUIRED" 占位图 200）；
 * 高德/腾讯/百度系 GCJ-02/BD-09 与 OSM 建筑轮廓整体偏移 300–500m 不可对齐。
 * 备用底图是「限流兜底」，主底图仍是天地图（GS(2023)336号），恢复即回。
 */
const TDT_STALL_FAILS = 8;
const TDT_STALL_WINDOW_MS = 10000;
const TDT_RECOVER_PROBES = 2;
const TDT_PROBE_INTERVAL_MS = 60000;
// 多源降级链：id 唯一、tiles 为 MapLibre raster 模板数组、maxzoom 为该源原生上限
const WB_FALLBACK_CHAIN = [
  {
    id: 'wb-esr',
    label: 'Esri 灰底 Canvas',
    attr: '© Esri · World Light Gray Canvas',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
    maxzoom: 16,
    probe: { z: 9, y: 223, x: 419 },
  },
  {
    id: 'wb-hot',
    label: 'OSM FR HOT 瓦片',
    attr: '© OpenStreetMap contributors · 风格 HOT（Humanitarian OSM Team）via openstreetmap.fr',
    tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png`),
    maxzoom: 19,
    probe: { z: 9, y: 223, x: 419 },
  },
  {
    id: 'wb-osm',
    label: 'OSM 官方标准瓦片',
    attr: '© OpenStreetMap contributors',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    maxzoom: 19,
    probe: { z: 9, y: 223, x: 419 },
  },
];
const WB_FALLBACK_PAINT = { 'raster-opacity': 0.92, 'raster-saturation': -0.35, 'raster-contrast': -0.03 };
const TDT_FALLBACK_TIMEOUT_MS = 3000;
const basemapWatchers = new Set();
const tdtHealth = { fails: [], swapped: false, probeWins: 0, probeTimer: null, chainIdx: 0 };

function wbFallbackSourceId(idx) { return WB_FALLBACK_CHAIN[idx].id; }

function wbProbeUrl(item) {
  return item.tiles[0]
    .replace('{z}', item.probe ? item.probe.z : 5)
    .replace('{x}', item.probe ? item.probe.x : 13)
    .replace('{y}', item.probe ? item.probe.y : 6);
}

// 选档：并行探测，**最快返回健康图片者胜出**（首图延迟优先），链序仅作并列时的稳定性；
// 全部失败/超时 → 回落链首。健康图片 = 200 且 content-type: image/*（防 CARTO 占位图/错误页）。
function pickFallbackIdx() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (i) => { if (!done) { done = true; resolve(i); } };
    WB_FALLBACK_CHAIN.forEach((item, i) => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TDT_FALLBACK_TIMEOUT_MS);
      fetch(wbProbeUrl(item), { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer-when-downgrade' })
        .then((res) => {
          clearTimeout(timer);
          const ct = res.headers.get('content-type') || '';
          if (res.ok && ct.indexOf('image/') === 0) finish(i);
        })
        .catch(() => clearTimeout(timer));
    });
    setTimeout(() => finish(0), TDT_FALLBACK_TIMEOUT_MS + 120);
  });
}

function ensureFallbackSources(map) {
  // 底图类图层必须插到业务图层之下：3D 建筑是 fill-extrusion，若在降级时把栅格
  // addLayer 到栈顶，会整片盖住楼体。锚点取「第一个存在的天地图/建筑图层」。
  const anchor = ['bu3d-city-ov', 'bu3d-city', 'tdt-vec', 'tdt-cva']
    .find((id) => map.getLayer(id)) || undefined;
  for (const item of WB_FALLBACK_CHAIN) {
    if (!map.getSource(item.id)) {
      map.addSource(item.id, {
        type: 'raster',
        tiles: item.tiles,
        tileSize: 256,
        minzoom: 0,
        maxzoom: item.maxzoom,
        attribution: item.attr,
      });
    }
    if (!map.getLayer(item.id)) {
      map.addLayer({ id: item.id, type: 'raster', source: item.id, paint: WB_FALLBACK_PAINT, layout: { visibility: 'none' } }, anchor);
    }
  }
}

function swapMapBasemap(map, on) {
  ensureFallbackSources(map);
  // on=true：启用当前降级档位、隐藏天地图与其余档位；on=false：全部隐藏并恢复天地图
  for (const item of WB_FALLBACK_CHAIN) {
    if (map.getLayer(item.id)) {
      const want = on && item.id === wbFallbackSourceId(tdtHealth.chainIdx) ? 'visible' : 'none';
      map.setLayoutProperty(item.id, 'visibility', want);
    }
  }
  for (const id of BASE_ONLINE_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'none' : 'visible');
  }
}

function announceFallback(on, detail) {
  try {
    document.dispatchEvent(new CustomEvent('wb-basemap-fallback', { detail: Object.assign({ fallback: on }, detail || {}) }));
  } catch (e) {}
}

// 挑选可用档位后整体换装（多档级联，CARTO→Esri→OSM）
// 天地图请求立即泄压：降级后天地图图层已隐藏，排队中的节流任务继续空打只会拖慢整体
function flushTdtQueue(reason) {
  if (!tdtQueue.length) return;
  const queued = tdtQueue.splice(0, tdtQueue.length);
  for (const job of queued) { try { job.cancel(); } catch (e) {} }
}

function wbTileUrl(item, z, x, y) {
  return item.tiles[(x + y) % item.tiles.length]
    .replace('{z}', z).replace('{x}', x).replace('{y}', y);
}

// 视口瓦片预热：拿当前相机的 3×3 瓦片模板 URL，挂图层前先经 fetch 写进 HTTP 缓存，
// MapLibre 随后同 URL 的请求直接命中缓存——省掉"图层已显示但每张瓦片各自慢连"的空窗。
function wbViewportTileUrls(map, item) {
  const urls = [];
  try {
    const z = Math.max(2, Math.min(item.maxzoom, Math.ceil(Math.max(0, map.getZoom()))));
    const c = map.getCenter();
    const lat = Math.max(-85, Math.min(85, c.lat));
    const n = 1 << z;
    const xt = Math.floor(((c.lng + 180) / 360) * n);
    const s = Math.sin((lat * Math.PI) / 180);
    const yt = Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = xt + dx, y = yt + dy;
        if (x < 0 || y < 0 || x >= n || y >= n) continue;
        urls.push(wbTileUrl(item, z, x, y));
      }
    }
  } catch (e) { /* 相机未就绪时跳过 */ }
  return urls;
}

async function warmViewportTiles(item) {
  const jobs = [];
  for (const map of basemapWatchers) {
    for (const url of wbViewportTileUrls(map, item)) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);
      jobs.push(fetch(url, { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer-when-downgrade' })
        .catch(() => {})
        .finally(() => clearTimeout(timer)));
    }
  }
  if (!jobs.length) return;
  // 预热封顶 3s：缓存命中多少算多少图，不拖住换装
  const cap = new Promise((r) => setTimeout(r, 3000));
  await Promise.race([Promise.allSettled(jobs), cap]);
}

// 挑选可用档位后整体换装（并行探档·首到者胜出 → 视口预取 → 换装显示）
async function swapToFallback() {
  flushTdtQueue('fallback');
  let idx = 0;
  try { idx = await pickFallbackIdx(); } catch (e) {}
  tdtHealth.chainIdx = idx;
  // 预热放在"图层可见"之前：命中缓存的首图即刻入画
  await warmViewportTiles(WB_FALLBACK_CHAIN[idx]).catch(() => {});
  for (const map of basemapWatchers) { try { swapMapBasemap(map, true); } catch (e) {} }
  const item = WB_FALLBACK_CHAIN[tdtHealth.chainIdx];
  announceFallback(true, { name: item.label, attr: item.attr });
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
          for (const map of basemapWatchers) { try { swapMapBasemap(map, false); } catch (e) {} }
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
export function watchBasemapHealth(map) {
  if (!map || basemapWatchers.has(map)) return;
  basemapWatchers.add(map);
  if (tdtHealth.swapped) { try { swapMapBasemap(map, true); } catch (e) {} }
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
