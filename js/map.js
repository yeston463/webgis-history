// map.js - 统一地图实例管理（MapLibre GL JS + 天地图在线底图）
// 设计要点：
//  - 统一采用天地图在线矢量底图（vec_w + cva_w，GS(2023)336号），移除本地开源离线底图。
//  - 缩放上限严格锁定在 TIANDITU_MAX_ZOOM（17，对应 256px 瓦片原生最高第 18 级），到达上限即禁止继续放大。
//  - 单例：提供清晰的 初始化 / 更新 / 图层重排 / 状态栏 / 销毁 方法。

import { showMapError } from './utils.js';
import {
  buildOnlineStyle,
  setupBasemap,
  bindZoomLimitControl,
  formatZoomReadout,
  probeOnlineAvailable,
  basemapLabel,
} from './basemap.js';
import { TIANDITU_MIN_ZOOM, TIANDITU_MAX_ZOOM } from './config.js';

let map = null;
let loadPromise = null;
const CHINA_CENTER = [104.5, 35.5];
const CHINA_ZOOM = 3.1;

export function isMapReady() {
  return !!(map && !map._wbRemoved && map._wbLoaded);
}

// 初始化地图。options: { center, zoom, onLoad(map) }
export function createMap(containerId, options = {}) {
  if (map && !map._wbRemoved) {
    if (options.onLoad) safeOnLoad(options.onLoad);
    return map;
  }
  const initZoom = Math.min(TIANDITU_MAX_ZOOM, Math.max(TIANDITU_MIN_ZOOM, options.zoom || CHINA_ZOOM));
  map = new maplibregl.Map({
    container: containerId,
    style: buildOnlineStyle(),
    center: options.center || CHINA_CENTER,
    zoom: initZoom,
    minZoom: TIANDITU_MIN_ZOOM,
    maxZoom: TIANDITU_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    antialias: true,
  });
  map._wbRemoved = false;
  map._wbLoaded = false;
  map._basemapMode = 'online';
  if (typeof window !== 'undefined') window.__wbMap = map;

  map.addControl(new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: 'metric' }), 'bottom-right');
  bindZoomLimitControl(map);

  map.on('error', (e) => {
    const msg = (e && e.error && e.error.message) || '';
    const src = (e && e.sourceId) || '';
    const isTileErr = /tianditu|tile|raster|GetTile|429|Too Many Requests/i.test(msg + ' ' + src);
    if (!isTileErr) console.warn('[map] 非致命错误:', msg || e);
  });

  loadPromise = new Promise((resolve) => {
    map.on('load', async () => {
      try {
        await setupBasemap(map);
        map._wbLoaded = true;
        probeOnlineAvailable().then((ok) => {
          if (!ok) {
            showBasemapBanner('天地图在线瓦片暂不可访问，请检查网络连接或密钥状态。');
          } else {
            hideBasemapBanner();
          }
        }).catch(() => {});
        resolve(map);
        if (options.onLoad) options.onLoad(map);
      } catch (err) {
        showMapError(containerId, err);
        resolve(null);
      }
    });
  });
  return map;
}

// 在地图框内底部展示底图网络状态提示横幅
function showBasemapBanner(msg) {
  try {
    let bar = document.getElementById('basemap-banner');
    const host = (map && map.getContainer && map.getContainer().closest('#map-root, #map-slot, #map-buf-root, .map-root, .swipe-wrap'))
      || document.querySelector('#map-root, #map-slot, .map-root, .map-shell')
      || document.body;
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'basemap-banner';
      bar.className = 'basemap-banner';
      host.appendChild(bar);
    } else if (bar.parentElement !== host) {
      host.appendChild(bar);
    }
    bar.textContent = msg;
    bar.setAttribute('role', 'status');
    bar.setAttribute('aria-live', 'polite');
    bar.classList.add('show');
    clearTimeout(bar._t);
    bar._t = setTimeout(() => bar.classList.remove('show'), 5500);
  } catch (e) { /* ignore */ }
}

function hideBasemapBanner() {
  const bar = document.getElementById('basemap-banner');
  if (bar) {
    clearTimeout(bar._t);
    bar.classList.remove('show');
  }
}

function safeOnLoad(fn) {
  if (isMapReady()) fn(map);
  else if (loadPromise) loadPromise.then((m) => { if (m) fn(m); });
}

export function getMap() { return map; }
export function whenReady(fn) { if (loadPromise) loadPromise.then((m) => { if (m) fn(m); }); else if (fn) fn(map); }

/**
 * 挂载底部制图状态栏：实时显示中心点经纬度、缩放级别（达上限标注）、
 * 当前比例尺与地面分辨率。
 */
export function attachStatusBar(containerId, opts = {}) {
  const host = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
  const m = map;
  if (!host || !m || m._sbAttached) return;
  m._sbAttached = true;

  const bar = document.createElement('div');
  bar.className = 'map-statusbar';
  bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">中心点</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">缩放</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">比例尺</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">分辨率</span><span class="msb-value" data-sb="res">-</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit">${opts.credit || basemapLabel()}</span></div>`;
  host.appendChild(bar);

  const centerEl = bar.querySelector('[data-sb="center"]');
  const zoomEl = bar.querySelector('[data-sb="zoom"]');
  const scaleEl = bar.querySelector('[data-sb="scale"]');
  const resEl = bar.querySelector('[data-sb="res"]');

  const M_PER_PX_AT_EQ = 156543.03392;

  const update = () => {
    try {
      const c = m.getCenter();
      const z = m.getZoom();
      centerEl.textContent =
        `${Math.abs(c.lat).toFixed(4)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lng).toFixed(4)}°${c.lng >= 0 ? 'E' : 'W'}`;
      zoomEl.textContent = formatZoomReadout(m);

      const latFactor = Math.max(0.05, Math.cos((c.lat * Math.PI) / 180));
      const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);

      const pxPerCm = 96 / 2.54;
      const groundPerCm = metersPerPx * pxPerCm;
      let sVal = groundPerCm, sUnit = 'm';
      if (sVal >= 1000) { sVal /= 1000; sUnit = 'km'; }
      scaleEl.textContent = `1cm ≈ ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${sUnit}`;

      const denom = metersPerPx / (0.0254 / 96);
      resEl.textContent = `${metersPerPx >= 1 ? metersPerPx.toFixed(1) : metersPerPx.toFixed(3)} m/px · 1:${Math.round(denom).toLocaleString('en-US')}`;
    } catch (e) { /* 地图销毁后忽略 */ }
  };

  m.on('move', update);
  m.on('zoom', update);
  update();
}

// 安全增删
export function ensureSource(id, spec) {
  if (!map) return;
  if (!map.getSource(id)) map.addSource(id, spec);
}
export function ensureLayer(id, spec) {
  if (!map) return;
  if (!map.getLayer(id)) map.addLayer(spec);
}
export function removeLayer(id) { if (map && map.getLayer(id)) map.removeLayer(id); }
export function removeSource(id) {
  if (!map) return;
  if (map.getLayer(id + '-circle')) map.removeLayer(id + '-circle');
  if (map.getLayer(id + '-label')) map.removeLayer(id + '-label');
  if (map.getSource(id)) map.removeSource(id);
}

/**
 * 统一图层层级（Label Sandwich 制图规范）：
 * 天地图底图面 (tdt-vec) → 专题面层（建成区/缓冲面/统计分级面）→ 天地图中文注记 (tdt-cva) →
 * 建成区/缓冲区边界线与连线 → 命中靶标 → 激活态高亮环 → 标牌与语义图标 → 交互量算置顶。
 */
const LAYER_ORDER = [
  'tdt-vec',
  'choropleth-fill',
  'gs-wms-layer', 'bu-lyr', 'newbu-lyr', 'buffer-fill',
  'tdt-cva',
  'bu-casing', 'bu-line', 'newbu-line',
  'buffer-half-line', 'buffer-casing', 'buffer-line', 'buffer-spokes',
  'reform-flow-line', 'wfs-halo-layer',
  'sel-region-fill', 'sel-region-line',
  'buffer-hit-halo', 'buf-center-outer', 'buf-center-inner',
  'active-pin-halo', 'active-pin-ring',
  'heritage-label', 'reform-label',
  'heritage-cluster', 'heritage-symbol', 'reform-symbol', 'query-sel-symbol',
  'measure-poly', 'measure-line', 'measure-pts',
];
export function restackLayers(m) {
  const target = m || map;
  if (!target || !target.style || !target.moveLayer) return;
  LAYER_ORDER.forEach((id) => { if (target.getLayer(id)) target.moveLayer(id); });
}

// 计算当前地图左侧图层面板占用的内边距，保证镜头中心落在右侧可视净区
export function getOpticalPadding(targetMap) {
  const m = targetMap || map;
  if (!m || !m.getContainer) return { top: 20, right: 20, bottom: 32, left: 20 };
  const container = m.getContainer();
  const cw = container ? container.clientWidth : 0;
  if (cw < 680) return { top: 16, right: 16, bottom: 32, left: 16 };
  const root = container.closest('.map-root, .lab-map') || document;
  const lp = root.querySelector('.layer-panel');
  const lpOpen = lp && !lp.classList.contains('is-collapsed') && lp.offsetWidth > 60;
  return {
    top: 24,
    right: 28,
    bottom: 38,
    left: lpOpen ? Math.min(230, lp.offsetWidth + 24) : 28,
  };
}

// 镜头：使用 easeTo（线性平移+缩放），并严格钳制在 TIANDITU_MAX_ZOOM 以内
export function flyTo(opts) {
  if (!map) return;
  const next = { ...opts };
  if (typeof next.zoom === 'number') {
    next.zoom = Math.min(TIANDITU_MAX_ZOOM, Math.max(TIANDITU_MIN_ZOOM, next.zoom));
  }
  map.easeTo({ essential: true, duration: 1100, ...next });
}
export function flyToCity(center, zoom = 10.5) {
  flyTo({ center, zoom, padding: getOpticalPadding(map), duration: 1200 });
}
export function fitChina() {
  flyTo({ center: CHINA_CENTER, zoom: CHINA_ZOOM, padding: { top: 16, right: 16, bottom: 30, left: 16 }, duration: 1100 });
}

// 销毁（页面卸载时调用，避免泄漏）
export function destroyMap() {
  if (map && !map._wbRemoved) {
    try { map.remove(); } catch (e) { /* ignore */ }
    map._wbRemoved = true;
    map = null;
    loadPromise = null;
  }
}

// 页面隐藏/卸载时清理
export function bindLifecycle() {
  const cleanup = () => destroyMap();
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);
}
