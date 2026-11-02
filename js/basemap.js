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
    `https://${s}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split('_')[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=tiles&tk=${TIANDITU_TK}`);
}

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

// 探测天地图在线瓦片是否可访问
export async function probeOnlineAvailable(timeoutMs = 3000) {
  try {
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
