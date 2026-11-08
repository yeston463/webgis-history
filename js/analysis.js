// analysis.js - GIS 时空分析实验室：
//  模块一：九城建成区时空卷帘对比（PostGIS ST_UnaryUnion + ST_Difference + Turf 测地计算 + 内存缓存）与扩张速率图
//  模块二：PostGIS 测地缓冲区与古今空间耦合分析（ST_Buffer + ST_DWithin + ST_Distance）
//  模块三：GeoServer (OGC WFS/WMS) 控制台与 PostGIS 在线空间入库 (ST_MakePoint)

import { bindLifecycle, restackLayers } from './map.js';
import { buildOnlineStyle, setupBasemap, bindZoomLimitControl, formatZoomReadout, basemapLabel, repairBasemapTiles } from './basemap.js';
import { TIANDITU_MIN_ZOOM, TIANDITU_MAX_ZOOM } from './config.js';
import { addHeritagePoints, addReformPoints, setActiveMarker, showPopup, closePopup, REFORM_COLORS, markerIconDataURL } from './layers.js';
import { initLayerPanel } from './layerpanel.js';
import {
  fetchJSON, el, toast, formatArea, formatNumber, dataUrl, guardFileProtocol,
  categoryColor, categoryLabel, escapeHtml, assetUrl, placeholderDataURI, normalizeSourceUrl, isBaikeUrl,
} from './utils.js';
import { createChart, barOption, computeBuiltupMetrics, describeBuiltupTrend, builtupExpansionOption, builtupCompareOption } from './charts.js';

let URBAN = null;
let mapA = null, mapB = null;   // 卷帘双图
let mapBuf = null;              // 模块二：PostGIS 缓冲区交互地图
let buChart = null;
let bufChart = null;
let startCity = 'shenzhen';

// 扩张速率图状态
const buView = { mode: 'single', scale: 'linear', metric: 'rate', compact: null };
let _lastBuCityKey = 'shenzhen';
let _lastBuMetrics = null;          // 当前城市指标（由已加载 GeoJSON 的测地面积计算）
let _allCityMetricsPromise = null;  // 九城指标（首次切换到对比视图时按同一来源计算并缓存）
let _buRenderSeq = 0;

// 内存缓存：避免切换城市/年份时在主线程重复执行耗时多边形合并 (turf.union)
const _mergedCache = new Map();
const _diffCache = new Map();

export function initAnalysisPage() {
  bindLifecycle();
  if (guardFileProtocol('#map-loading')) return;
  window.addEventListener('pagehide', () => {
    try { if (mapA && !mapA._removed) { mapA.remove(); mapA._removed = true; } } catch (e) {}
    try { if (mapB && !mapB._removed) { mapB.remove(); mapB._removed = true; } } catch (e) {}
    try { if (mapBuf && !mapBuf._removed) { mapBuf.remove(); mapBuf._removed = true; } } catch (e) {}
    try { if (BU3D.timer) clearTimeout(BU3D.timer); } catch (e) {}
    try { if (map3D && !map3D._removed) { map3D.remove(); map3D._removed = true; } } catch (e) {}
    try { if (map3D && !map3D._removed) { map3D.remove(); map3D._removed = true; } } catch (e) {}
  });
  const params = new URLSearchParams(location.search);
  startCity = params.get('city') || 'shenzhen';

  probeArchitectureStatus();

  fetchJSON(dataUrl('urban-expansion/urban-index.json')).then((urban) => {
    URBAN = urban;
    const cities = URBAN.cities ? Object.keys(URBAN.cities) : [];
    if (cities.length && !cities.includes(startCity)) startCity = cities[0];
    buildControls();
    buildLabA();
    initBuChartControls();
    initLayerPanel(document.getElementById('layer-panel'), () => mapA, {
      layers: [
        {
          id: 'newbu-toggle',
          label: '新增建成区差值 (布尔差)',
          on: true,
          onChange: (on) => {
            [mapA, mapB].forEach((m) => {
              ['newbu-lyr', 'newbu-line'].forEach((lid) => {
                if (m && m.getLayer && m.getLayer(lid)) {
                  m.setLayoutProperty(lid, 'visibility', on ? 'visible' : 'none');
                }
              });
            });
          },
        },
      ],
      customLegend: [
        { color: 'rgba(200, 90, 23, 0.56)', border: '#7a2e06', label: '起始年建成区 (左帘)' },
        { color: 'rgba(15, 110, 124, 0.34)', border: '#0a4c57', label: '对比年存量基底 (右帘)' },
        { color: 'rgba(224, 62, 26, 0.64)', border: '#7f1907', label: '新增扩张斑块 (ST_Difference)' },
      ],
      resetView: () => {
        const curCity = (document.querySelector('#a-controls select') || {}).value || startCity;
        jumpSwipeToCity(curCity, true);
      },
      resetLabel: '复位 · 当前城市',
      measure: false,
    });
    window.analysisAPI = {
      setCity: (c) => { const s = document.querySelector('#a-controls select'); if (s) { s.value = c; s.dispatchEvent(new Event('change')); } },
      loadYears: (a, b) => { const s = document.querySelectorAll('#a-controls select'); s[1].value = a; s[2].value = b; reloadA(false); },
    };
  }).catch((e) => toast('分析数据加载失败：' + e.message, 'error', 4000));

  initPostgisBufferLab();
  initOgcAndInsertPanel();
  initBuiltup3D();
}

/* ----------------------------- 架构状态探针 ----------------------------- */
async function probeArchitectureStatus() {
  const bPg = document.getElementById('badge-pg');
  const bGs = document.getElementById('badge-gs');
  if (window.__LOCAL_FILE_BUILD__) {
    if (bPg) { bPg.textContent = '本地文件版 · Turf.js 测地引擎'; bPg.className = 'tag tag-blue'; }
    if (bGs) { bGs.textContent = 'OGC 服务需本地全栈'; bGs.className = 'tag tag-blue'; }
    return;
  }
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const st = await res.json();
      if (bPg) {
        bPg.textContent = st.postgis.engineLabel;
        bPg.className = 'tag tag-blue';
      }
      if (bGs) {
        bGs.textContent = st.geoserver.serviceLabel;
        bGs.className = 'tag tag-blue';
      }
      return;
    }
  } catch (e) {}
  if (bPg) bPg.textContent = '离线测地引擎 (Turf.js)';
  if (bGs) bGs.textContent = '本地静态要素源';
}

/* ----------------------------- 模块一：建成区时空卷帘对比 ----------------------------- */
function cityZoom(city) {
  if (city === 'xiamen') return 9.6;
  if (city === 'shanghai' || city === 'beijing' || city === 'guangzhou') return 8.3;
  if (city === 'wuhan' || city === 'chengdu' || city === 'hangzhou') return 8.6;
  return 8.8;
}

function jumpSwipeToCity(city, animate = true) {
  if (!URBAN || !URBAN.cities || !URBAN.cities[city]) return;
  const meta = URBAN.cities[city];
  if (!Array.isArray(meta.center)) return;
  const z = cityZoom(city);
  if (mapA) {
    try { mapA.stop(); } catch (e) {}
    if (animate) {
      mapA.easeTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0, duration: 600, essential: true });
    } else {
      mapA.jumpTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0 });
    }
  }
  if (mapB) {
    try { mapB.stop(); } catch (e) {}
    mapB.jumpTo({ center: meta.center, zoom: z, bearing: 0, pitch: 0 });
  }
  syncMaps();
  setTimeout(syncMaps, 120);
  setTimeout(syncMaps, 650);
}

function isSwipeMapReady(m) {
  if (!m) return false;
  if (m._swipeReady) return true;
  return Boolean(m.style && m.style._loaded);
}

function buildControls() {
  const ctl = document.getElementById('a-controls');
  if (!ctl) return;
  ctl.innerHTML = '';
  const years = (c) => URBAN.cities[c].years;
  const citySel = field('城市', selectEl(Object.keys(URBAN.cities).map((c) => [c, URBAN.cities[c].label]), startCity));
  const yaSel = field('起始年份', selectEl(years(startCity).map((y) => [String(y), String(y)]), String(years(startCity)[0])));
  const ybSel = field('对比年份', selectEl(years(startCity).map((y) => [String(y), String(y)]), String(years(startCity).slice(-1)[0])));

  citySel.querySelector('select').addEventListener('change', (e) => {
    const c = e.target.value;
    const ys = years(c);
    replaceOptions(yaSel, ys.map((y) => [String(y), String(y)]), String(ys[0]));
    replaceOptions(ybSel, ys.map((y) => [String(y), String(y)]), String(ys[ys.length - 1]));
    // 切换城市下拉框时立即跳转卷帘双图视角（无需等待瓦片或矢量布尔运算完成）
    jumpSwipeToCity(c, false);
    loadBuiltup(c, ys[0], ys[ys.length - 1], true);
    // 3D 建筑模块跟随城市切换（未初始化时先记下城市，滚动到模块时再用）
    if (BU3D.started) { applyCity(c).catch(() => {}); } else { BU3D.city = c; }
  });
  yaSel.querySelector('select').addEventListener('change', () => reloadA(false));
  ybSel.querySelector('select').addEventListener('change', () => reloadA(false));

  ctl.appendChild(citySel); ctl.appendChild(yaSel); ctl.appendChild(ybSel);
  const note = document.getElementById('a-note');
  if (note && URBAN && URBAN.metadata && URBAN.metadata.note) note.textContent = URBAN.metadata.note;
}

function reloadA(moveCamera = false) {
  const c = document.querySelector('#a-controls select').value;
  const ya = document.querySelectorAll('#a-controls select')[1].value;
  const yb = document.querySelectorAll('#a-controls select')[2].value;
  loadBuiltup(c, Number(ya), Number(yb), moveCamera);
}

function buildLabA() {
  const divider = document.getElementById('swipe-divider');
  const wrap = document.getElementById('swipe-wrap');
  let dragging = false;
  const applyPos = (p) => {
    const next = Math.max(2, Math.min(98, p));
    divider.style.left = next + '%';
    const mb = document.getElementById('map-b');
    if (mb) mb.style.clipPath = `inset(0 0 0 ${next}%)`;
    divider.setAttribute('aria-valuenow', String(Math.round(next)));
    divider.setAttribute('aria-valuetext', `卷帘位置 ${Math.round(next)}%`);
  };
  const setPos = (clientX) => {
    const r = wrap.getBoundingClientRect();
    if (!r.width) return;
    applyPos(((clientX - r.left) / r.width) * 100);
  };
  divider.addEventListener('pointerdown', (e) => { dragging = true; divider.setPointerCapture(e.pointerId); });
  divider.addEventListener('pointermove', (e) => { if (dragging) setPos(e.clientX); });
  divider.addEventListener('pointerup', () => { dragging = false; });
  divider.addEventListener('keydown', (e) => {
    const cur = parseFloat(divider.style.left) || 50;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      applyPos(cur + (e.key === 'ArrowRight' ? 2 : -2));
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      applyPos(e.key === 'Home' ? 2 : 98);
    }
  });
  wrap.addEventListener('pointerdown', (e) => { if (e.target === divider) return; setPos(e.clientX); });

  const applyClip = () => {
    const r = wrap.getBoundingClientRect();
    if (!r || !r.width) return false;
    setPos(r.left + r.width / 2);
    return true;
  };
  if (!applyClip()) {
    let tries = 0;
    const t = setInterval(() => { if (applyClip() || ++tries > 40) clearInterval(t); }, 120);
  }

  const years = URBAN.cities[startCity].years;
  loadBuiltup(startCity, years[0], years.slice(-1)[0], true);
}

function ensureSwipeCurtainBadges() {
  const host = document.getElementById('map-slot');
  if (!host) return;
  if (!document.getElementById('swipe-badge-left')) {
    host.appendChild(el('div', { id: 'swipe-badge-left', class: 'swipe-year-badge is-left', 'aria-hidden': 'true' }));
  }
  if (!document.getElementById('swipe-badge-right')) {
    host.appendChild(el('div', { id: 'swipe-badge-right', class: 'swipe-year-badge is-right', 'aria-hidden': 'true' }));
  }
}

function ensureSwipeMaps() {
  if (mapA) return;
  const initMeta = (URBAN && URBAN.cities && URBAN.cities[startCity]) || { center: [114.06, 22.55] };
  const initCenter = initMeta.center || [114.06, 22.55];
  const initZ = cityZoom(startCity);
  const style = buildOnlineStyle();
  mapA = new maplibregl.Map({
    container: 'map-a',
    style,
    center: initCenter,
    zoom: initZ,
    minZoom: TIANDITU_MIN_ZOOM,
    maxZoom: TIANDITU_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  mapB = new maplibregl.Map({
    container: 'map-b',
    style,
    center: initCenter,
    zoom: initZ,
    minZoom: TIANDITU_MIN_ZOOM,
    maxZoom: TIANDITU_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    interactive: false,
  });

  mapA.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapA.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: 'metric' }), 'bottom-right');
  // 将 mapA 控件层提升至 #map-slot，避免被 #map-b 的右侧裁剪层遮蔽
  const slot = document.getElementById('map-slot');
  const ctrlBox = mapA.getContainer() && mapA.getContainer().querySelector('.maplibregl-control-container');
  if (slot && ctrlBox) slot.appendChild(ctrlBox);
  bindZoomLimitControl(mapA, slot);
  ensureSwipeCurtainBadges();

  let readyCount = 0;
  const onReady = async () => {
    readyCount++;
    if (readyCount < 2) return;
    await setupBasemap(mapA);
    await setupBasemap(mapB);
    mapA._basemapMode = 'online';
    mapB._basemapMode = 'online';
    mapA._swipeReady = true;
    mapB._swipeReady = true;
    attachSwipeStatusBar();
    loadBuiltup(
      document.querySelector('#a-controls select').value,
      Number(document.querySelectorAll('#a-controls select')[1].value),
      Number(document.querySelectorAll('#a-controls select')[2].value),
      true,
    );
  };
  mapA.on('load', onReady);
  mapB.on('load', onReady);
  mapA.on('move', syncMaps);
  mapA.on('error', () => {});
  mapB.on('error', () => {});
  window.__swipeA = mapA; window.__swipeB = mapB;
}

function attachSwipeStatusBar() {
  const host = document.getElementById('map-slot');
  if (!host || !mapA || host.querySelector('.map-statusbar')) return;
  const suffix = ' · 建成区为 AUE / GHSL 遥感解译数据';
  const bar = document.createElement('div');
  bar.className = 'map-statusbar';
  bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">中心点</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">缩放</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">比例尺</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">对比</span><span class="msb-value">卷帘双图 · 左起始 / 右对比+新增</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit" data-suffix="${suffix}">${basemapLabel()}${suffix}</span></div>`;
  host.appendChild(bar);
  const cEl = bar.querySelector('[data-sb="center"]');
  const zEl = bar.querySelector('[data-sb="zoom"]');
  const sEl = bar.querySelector('[data-sb="scale"]');
  const M_PER_PX_AT_EQ = 156543.03392;
  const update = () => {
    try {
      const c = mapA.getCenter();
      const z = mapA.getZoom();
      cEl.textContent = `${Math.abs(c.lat).toFixed(4)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lng).toFixed(4)}°${c.lng >= 0 ? 'E' : 'W'}`;
      zEl.textContent = formatZoomReadout(mapA);
      const latFactor = Math.max(0.05, Math.cos((c.lat * Math.PI) / 180));
      const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);
      const groundPerCm = metersPerPx * (96 / 2.54);
      let sVal = groundPerCm, u = 'm';
      if (sVal >= 1000) { sVal /= 1000; u = 'km'; }
      sEl.textContent = `1cm ≈ ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${u}`;
    } catch (e) {}
  };
  mapA.on('move', update);
  mapA.on('zoom', update);
  update();
}

function syncMaps() {
  if (!mapA || !mapB) return;
  mapB.jumpTo({ center: mapA.getCenter(), zoom: mapA.getZoom(), bearing: mapA.getBearing(), pitch: mapA.getPitch() });
}

function whenMapReady(map, cb, timeoutMs = 4000) {
  if (!map) return;
  const ready = () => isSwipeMapReady(map);
  if (ready()) { cb(); return; }
  const t0 = Date.now();
  const tick = () => {
    if (ready() || Date.now() - t0 > timeoutMs) { try { cb(); } catch (e) {} return; }
    setTimeout(tick, 80);
  };
  tick();
}

// 获取并缓存某城市某年份的合并建成区与测地面积（每个 city_year 至多计算一次！）
async function getMergedCityYear(city, yr) {
  const key = `${city}_${yr}`;
  if (_mergedCache.has(key)) return _mergedCache.get(key);
  const fc = await fetchJSON(dataUrl(`urban-expansion/${city}_${yr}.geojson`));
  const merged = mergeBuiltup(fc);
  let area = 0;
  if (merged) {
    try { area = turf.area(merged); } catch (e) {}
  } else {
    (fc.features || []).forEach((f) => { try { area += turf.area(f); } catch (e) {} });
  }
  const entry = { fc, merged, area };
  _mergedCache.set(key, entry);
  return entry;
}

let _lastSwipeCity = null;
let _buReqSeq = 0;

async function loadBuiltup(city, ya, yb, moveCamera = false, _retryDepth = 0) {
  const reqId = _retryDepth === 0 ? ++_buReqSeq : _buReqSeq;
  ensureSwipeMaps();
  if (!mapA || !mapB) {
    if (_retryDepth < 5) setTimeout(() => loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1), 120);
    return;
  }
  // 只要城市发生切换或显式要求移动镜头，立即跳转地图中心，不被任何瓦片加载阻塞
  if (moveCamera || _lastSwipeCity !== city) {
    _lastSwipeCity = city;
    jumpSwipeToCity(city, false);
  }
  if (!isSwipeMapReady(mapA) || !isSwipeMapReady(mapB)) {
    if (_retryDepth < 4) {
      whenMapReady(mapA, () => whenMapReady(mapB, () => {
        if (reqId === _buReqSeq) loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1);
      }));
    }
    return;
  }
  const meta = URBAN.cities[city];
  if (!meta) return;

  // 并行加载该城市全部年份的建成区数据，同时请求后端 /api/spatial/builtup 校验 PostGIS 空间计算
  const [yearEntries, pgBuiltup] = await Promise.all([
    Promise.all(meta.years.map((y) => getMergedCityYear(city, y))),
    window.__LOCAL_FILE_BUILD__
      ? Promise.resolve(null)
      : fetch(`/api/spatial/builtup?city=${encodeURIComponent(city)}&ya=${ya}&yb=${yb}&slim=1`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
  ]);
  // 若等待期间用户已切换到其他城市/年份，丢弃本次过期结果
  if (reqId !== _buReqSeq) return;

  const areas = meta.years.map((y, idx) => [y, yearEntries[idx].area]);
  const entryA = await getMergedCityYear(city, ya);
  const entryB = await getMergedCityYear(city, yb);
  if (reqId !== _buReqSeq) return;

  // 左图 mapA 仅渲染起始年建成区（暖赭石 + 深褐描边），保证左半帘清晰展现历史起点
  const okA = putBuiltup(mapA, 'bu', entryA.fc, '#c85a17', 0.52, '#7a2e06', 1.45);
  // 右图 mapB 渲染对比年存量基底（沉静青黛），再叠加鲜明朱砂色 ST_Difference 新增扩张斑块
  const okB = putBuiltup(mapB, 'bu', entryB.fc, '#0f6e7c', 0.28, '#0a4c57', 1.15);
  if (!okA || !okB) {
    if (_retryDepth < 3) {
      whenMapReady(mapA, () => whenMapReady(mapB, () => {
        if (reqId === _buReqSeq) loadBuiltup(city, ya, yb, moveCamera, _retryDepth + 1);
      }));
    }
    return;
  }

  const areaA = entryA.area, areaB = entryB.area;
  const delta = areaB - areaA;
  const rate = areaA > 0 ? (delta / areaA) * 100 : null;

  // 计算或读取缓存的新增建成区布尔差 (ST_Difference / turf.difference)，叠加在右图 mapB 上
  const diffKey = `${city}_${ya}_${yb}`;
  let diffResult = _diffCache.get(diffKey);
  if (!diffResult) {
    let newArea = null;
    let diffFc = { type: 'FeatureCollection', features: [] };
    try {
      if (entryA.merged && entryB.merged) {
        const diff = turf.difference(entryB.merged, entryA.merged);
        if (diff && diff.geometry) {
          newArea = turf.area(diff);
          diffFc = { type: 'FeatureCollection', features: Array.isArray(diff) ? diff : [diff] };
        }
      }
    } catch (e) {}
    if (newArea == null && pgBuiltup && pgBuiltup.newArea != null) {
      newArea = pgBuiltup.newArea;
    }
    diffResult = { newArea, diffFc };
    _diffCache.set(diffKey, diffResult);
  }

  putBuiltup(mapB, 'newbu', diffResult.diffFc, '#e03e1a', 0.62, '#7f1907', 1.35);
  // 清理左图可能残留的 newbu，保持左图纯粹为起始年
  if (mapA.getSource('newbu-src')) {
    mapA.getSource('newbu-src').setData({ type: 'FeatureCollection', features: [] });
  }

  // 当前城市扩张指标：与统计卡片同源（已加载 GeoJSON 的 Turf 测地面积）
  _lastBuCityKey = city;
  _lastBuMetrics = computeBuiltupMetrics({
    key: city,
    label: meta.label,
    years: meta.years,
    areasKm2: areas.map((a) => a[1] / 1e6),
  });

  // 说明文字：只陈述由数值计算得到的变化，并按城市给出数据来源与口径
  const note = document.getElementById('a-note');
  if (note) {
    const engineTag = (pgBuiltup && pgBuiltup.engine) || (window.__LOCAL_FILE_BUILD__ ? 'Turf.js 椭球测地计算' : 'PostGIS (ST_UnaryUnion + ST_Area) + Turf.js');
    const trend = describeBuiltupTrend(_lastBuMetrics);
    note.replaceChildren(
      el('strong', { text: `${meta.label}：` }),
      document.createTextNode(trend ? `${trend}。` : ''),
      el('span', {
        class: 'lab-note-source',
        text: `数据：${meta.source || '—'}；口径：${meta.resolution || '—'}；面积计算：${engineTag}。`,
      }),
    );
  }

  renderBuStats({ city: meta.label, ya, yb, areaA, areaB, delta, rate, newArea: diffResult.newArea });
  renderBuChart();
  if (moveCamera) {
    jumpSwipeToCity(city, false);
  } else {
    syncMaps();
  }
}

function initBuChartControls() {
  // 同一组按钮只切换 active / aria-pressed，不改动其他 class，保证尺寸与样式稳定
  const bindGroup = (selector, attr, key) => {
    const group = document.querySelector(selector);
    if (!group) return;
    group.querySelectorAll(`[data-${attr}]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        const value = btn.dataset[attr];
        if (buView[key] === value) return;
        buView[key] = value;
        group.querySelectorAll(`[data-${attr}]`).forEach((b) => {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        renderBuChart();
      });
    });
  };
  bindGroup('#bu-view-group', 'view', 'mode');
  bindGroup('#bu-scale-group', 'scale', 'scale');
  bindGroup('#bu-metric-group', 'metric', 'metric');

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (isBuChartCompact() !== buView.compact) renderBuChart();
    }, 150);
  });
}

function isBuChartCompact() {
  const dom = document.getElementById('bu-chart');
  return !!dom && dom.clientWidth > 0 && dom.clientWidth < 620;
}

// 口径与多数城市不同的城市（来源于 urban-index.json 的元数据，而非写死城市名）
function flaggedBuiltupCities() {
  const cities = (URBAN && URBAN.cities) || {};
  const ghsl = [];
  const metro = [];
  Object.entries(cities).forEach(([key, meta]) => {
    if (/GHSL|JRC/i.test(meta.source || '')) ghsl.push({ key, meta });
    else if (/广佛|Metropolitan/i.test(`${meta.resolution || ''} ${meta.source || ''}`)) metro.push({ key, meta });
  });
  const parts = [];
  if (ghsl.length) {
    const lastYearNote = ghsl.some(({ meta }) => /2015\s*→\s*2014/.test(meta.source || '')) ? '，末期为 2015 年数据按 2014 标注' : '';
    parts.push(`${ghsl.map((c) => c.meta.label).join('、')}采用 JRC GHSL 100m 建成区${lastYearNote}`);
  }
  if (metro.length) parts.push(`${metro.map((c) => c.meta.label).join('、')}为广佛连片大都市区范围`);
  if (parts.length) parts.push('其余城市为 AUE 2016 城市轮廓（约 30m）。口径不同，跨城数值仅作趋势参考');
  return { keys: [...ghsl, ...metro].map((c) => c.key), caption: parts.length ? `* ${parts.join('；')}。` : '' };
}

function loadAllCityMetrics() {
  if (!_allCityMetricsPromise) {
    const keys = Object.keys((URBAN && URBAN.cities) || {});
    _allCityMetricsPromise = Promise.all(keys.map(async (key) => {
      const meta = URBAN.cities[key];
      const entries = await Promise.all(meta.years.map((y) => getMergedCityYear(key, y)));
      return computeBuiltupMetrics({ key, label: meta.label, years: meta.years, areasKm2: entries.map((e) => e.area / 1e6) });
    })).catch((err) => {
      _allCityMetricsPromise = null;
      throw err;
    });
  }
  return _allCityMetricsPromise;
}

function putBuiltup(map, id, fc, color, opacity = 0.5, lineColor = color, lineWidth = 1.35) {
  if (!isSwipeMapReady(map)) return false;
  const srcId = id + '-src';
  const lyId = id + '-lyr';
  const lineId = id + '-line';
  try {
    if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: fc });
    else map.getSource(srcId).setData(fc);
    if (!map.getLayer(lyId)) {
      map.addLayer({ id: lyId, type: 'fill', source: srcId, paint: { 'fill-color': color, 'fill-opacity': opacity } });
    } else {
      map.setPaintProperty(lyId, 'fill-color', color);
      map.setPaintProperty(lyId, 'fill-opacity', opacity);
    }
    if (!map.getLayer(lineId)) {
      const vis = map.getLayoutProperty(lyId, 'visibility') || 'visible';
      map.addLayer({
        id: lineId,
        type: 'line',
        source: srcId,
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: vis },
        paint: { 'line-color': lineColor, 'line-width': lineWidth, 'line-opacity': 0.9 },
      });
    } else {
      map.setPaintProperty(lineId, 'line-color', lineColor);
      map.setPaintProperty(lineId, 'line-width', lineWidth);
    }
    restackLayers(map);
    return true;
  } catch (e) {
    return false;
  }
}

function mergeBuiltup(fc) {
  const feats = (fc && fc.features) || [];
  if (feats.length === 0) return null;
  if (feats.length === 1) return feats[0];
  // 所有城市建成区数据均已在预处理阶段完成拓扑合并 (unary_union)，各斑块互不重叠，
  // 直接使用 turf.combine 合成为 MultiPolygon（耗时 < 5ms），避免主线程循环调用 turf.union
  try {
    const comb = turf.combine(fc);
    if (comb && comb.features && comb.features[0]) return comb.features[0];
  } catch (e) {}
  return feats[0];
}

function renderBuStats(d) {
  const grid = document.getElementById('bu-stats');
  if (!grid) return;
  grid.innerHTML = '';
  const rateText = d.rate == null ? '-' : (d.rate >= 0 ? '+' : '') + d.rate.toFixed(1) + '%';
  const boxes = [
    [`${d.city} ${d.ya} 建成区`, formatArea(d.areaA), '起始规模'],
    [`${d.city} ${d.yb} 建成区`, formatArea(d.areaB), '对比规模'],
    ['面积变化量', (d.delta >= 0 ? '+' : '') + formatArea(d.delta), 'B − A'],
    ['变化率', rateText, '相对起始'],
    ['新增建成区', d.newArea == null ? '-' : formatArea(d.newArea), '空间分布'],
  ];
  boxes.forEach(([l, v, s], idx) => {
    grid.appendChild(el('div', { class: 'stat-box' + (idx === 2 || idx === 3 ? ' stat-box-highlight' : '') }, [
      el('div', { class: 'sb-label', text: l }),
      el('div', { class: 'sb-value', text: v }),
      el('div', { class: 'sb-sub', text: s }),
    ]));
  });

  ensureSwipeCurtainBadges();
  const badgeL = document.getElementById('swipe-badge-left');
  const badgeR = document.getElementById('swipe-badge-right');
  if (badgeL) {
    badgeL.innerHTML =
      `<span class="syb-dir">◀ 左帘</span>` +
      `<span class="syb-sw" style="background:rgba(200,90,23,0.62);border-color:#7a2e06"></span>` +
      `<strong>${escapeHtml(String(d.ya))}</strong>` +
      `<span class="syb-meta">${escapeHtml(formatArea(d.areaA))}</span>`;
  }
  if (badgeR) {
    badgeR.innerHTML =
      `<span class="syb-sw" style="background:rgba(224,62,26,0.68);border-color:#7f1907"></span>` +
      `<strong>${escapeHtml(String(d.yb))}</strong>` +
      `<span class="syb-meta">${escapeHtml(formatArea(d.areaB))}${d.rate != null ? ' (' + escapeHtml(rateText) + ')' : ''}</span>` +
      `<span class="syb-dir">右帘 ▶</span>`;
  }
}

async function renderBuChart() {
  const dom = document.getElementById('bu-chart');
  if (!dom) return;
  const seq = ++_buRenderSeq;
  const compact = isBuChartCompact();
  buView.compact = compact;
  const isCompare = buView.mode === 'compare';

  const scaleGroup = document.getElementById('bu-scale-group');
  const metricGroup = document.getElementById('bu-metric-group');
  const desc = document.getElementById('bu-chart-desc');
  const caption = document.getElementById('bu-chart-caption');
  if (scaleGroup) scaleGroup.hidden = isCompare;
  if (metricGroup) metricGroup.hidden = !isCompare;
  if (desc) {
    desc.textContent = isCompare
      ? '九城两个阶段的对比，可切换年均新增面积（km²/年）或年均复合增速（%/年）；当前城市以深色显示'
      : '上：各期测地面积，横轴按实际年份间隔排布；下：各阶段年均新增面积，柱宽对应阶段时长';
  }

  if (!isCompare) {
    if (caption) caption.hidden = true;
    if (!_lastBuMetrics) return;
    buChart = createChart(dom, builtupExpansionOption(_lastBuMetrics, { logScale: buView.scale === 'log', compact }));
    return;
  }

  const flagged = flaggedBuiltupCities();
  if (caption) {
    caption.textContent = flagged.caption;
    caption.hidden = !flagged.caption;
  }
  if (buChart && !buChart.isDisposed()) {
    buChart.showLoading({ text: '正在计算九城面积…', color: '#c63a18', textColor: '#090b11', maskColor: 'rgba(255,253,251,0.8)' });
  }
  let list;
  try {
    list = await loadAllCityMetrics();
  } catch (e) {
    if (buChart && !buChart.isDisposed()) buChart.hideLoading();
    toast('九城面积计算失败，请稍后重试');
    return;
  }
  if (seq !== _buRenderSeq || buView.mode !== 'compare') return;
  buChart = createChart(dom, builtupCompareOption(list, {
    activeKey: _lastBuCityKey,
    metric: buView.metric,
    compact,
    flaggedKeys: flagged.keys,
  }));
}

/* ============================================================================
 * 模块二：PostGIS 测地缓冲区与古今空间叠加实验室
 * ========================================================================== */

const BUFFER_PRESETS = [
  { key: 'shenzhen', label: '深圳 · 蛇口 / 南头', lng: 113.95, lat: 22.52, r: 90 },
  { key: 'guangzhou', label: '广州 · 十三行 / 沙面', lng: 113.25, lat: 23.11, r: 120 },
  { key: 'shanghai', label: '上海 · 外滩 / 浦东', lng: 121.48, lat: 31.24, r: 150 },
  { key: 'xiamen', label: '厦门 · 鼓浪屿 / 泉州', lng: 118.12, lat: 24.55, r: 100 },
  { key: 'beijing', label: '北京 · 故宫 / 三中全会', lng: 116.40, lat: 39.92, r: 120 },
  { key: 'xian', label: '西安 · 兵马俑 / 大雁塔', lng: 109.05, lat: 34.28, r: 80 },
];

let _herFeaturesAll = [];
let _refEventsAll = [];
let _bufReqSeq = 0;
let _rebindBufferMarkers = null;

function mountBufferMapHud(host) {
  if (!host || host.querySelector('#buf-map-hud')) return;
  const startCollapsed = typeof window !== 'undefined' && window.innerWidth <= 640;
  const hud = el('aside', {
    id: 'buf-map-hud',
    class: 'layer-panel buf-hud' + (startCollapsed ? ' is-collapsed' : ''),
    'aria-label': '缓冲区制图控制',
  });
  const toggleBtn = el('button', {
    class: 'lp-toggle',
    type: 'button',
    'aria-expanded': startCollapsed ? 'false' : 'true',
    text: startCollapsed ? '展开' : '收起',
  });
  const head = el('div', { class: 'lp-head' }, [
    el('span', { class: 'lp-head-title', text: '测地图例' }),
    toggleBtn,
  ]);
  const body = el('div', { class: 'lp-body' });
  toggleBtn.addEventListener('click', () => {
    const collapsed = hud.classList.toggle('is-collapsed');
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.textContent = collapsed ? '展开' : '收起';
  });

  const lgWrap = el('div', { class: 'lp-group' }, [
    el('div', { class: 'lp-title', text: '测地符号' }),
    el('div', { class: 'buf-legend-list' }, [
      el('div', { class: 'lg-row' }, [
        el('span', { class: 'buf-sw-target', 'aria-hidden': 'true' }),
        el('span', { text: '缓冲区中心靶标' }),
      ]),
      el('div', { class: 'lg-row' }, [
        el('span', { class: 'buf-sw-ring', 'aria-hidden': 'true' }),
        el('span', { text: '50% / 100% 测地缓冲圈' }),
      ]),
      el('div', { class: 'lg-row' }, [
        el('span', { class: 'buf-sw-spoke', 'aria-hidden': 'true' }),
        el('span', { text: 'ST_DWithin 命中连线' }),
      ]),
    ]),
    el('div', { class: 'buf-hud-hint', text: '点击空白处重设靶心 · 点击要素看实景与距离' }),
  ]);
  body.appendChild(lgWrap);

  hud.appendChild(head);
  hud.appendChild(body);
  host.appendChild(hud);
}

function attachBufferStatusBar() {
  const host = document.getElementById('map-buf-root');
  if (!host || !mapBuf || host.querySelector('.map-statusbar')) return;
  const suffix = ' · ST_Buffer(geography) 椭球测地分析';
  const bar = document.createElement('div');
  bar.className = 'map-statusbar';
  bar.innerHTML = `
    <div class="msb-item"><span class="msb-label">中心点</span><span class="msb-value" data-sb="center">-</span></div>
    <div class="msb-item"><span class="msb-label">缩放</span><span class="msb-value" data-sb="zoom">-</span></div>
    <div class="msb-item"><span class="msb-label">比例尺</span><span class="msb-value" data-sb="scale">-</span></div>
    <div class="msb-item"><span class="msb-label">靶心半径</span><span class="msb-value" data-sb="buf-meta">-</span></div>
    <div class="msb-spacer"></div>
    <div class="msb-item"><span class="msb-credit" data-suffix="${suffix}">${basemapLabel()}${suffix}</span></div>`;
  host.appendChild(bar);
  const cEl = bar.querySelector('[data-sb="center"]');
  const zEl = bar.querySelector('[data-sb="zoom"]');
  const sEl = bar.querySelector('[data-sb="scale"]');
  const M_PER_PX_AT_EQ = 156543.03392;
  const update = () => {
    try {
      const c = mapBuf.getCenter();
      const z = mapBuf.getZoom();
      cEl.textContent = `${Math.abs(c.lat).toFixed(4)}°${c.lat >= 0 ? 'N' : 'S'} ${Math.abs(c.lng).toFixed(4)}°${c.lng >= 0 ? 'E' : 'W'}`;
      zEl.textContent = formatZoomReadout(mapBuf);
      const latFactor = Math.max(0.05, Math.cos((c.lat * Math.PI) / 180));
      const metersPerPx = M_PER_PX_AT_EQ * latFactor / Math.pow(2, z);
      const groundPerCm = metersPerPx * (96 / 2.54);
      let sVal = groundPerCm, u = 'm';
      if (sVal >= 1000) { sVal /= 1000; u = 'km'; }
      sEl.textContent = `1cm ≈ ${sVal >= 100 ? Math.round(sVal) : sVal.toFixed(sVal < 10 ? 2 : 1)} ${u}`;
    } catch (e) {}
  };
  mapBuf.on('move', update);
  mapBuf.on('zoom', update);
  update();
}

function findHeritageRecord(id, fallback = {}) {
  const hit = _herFeaturesAll.find((f) => f && f.properties && String(f.properties.id) === String(id));
  return hit ? { ...fallback, ...hit.properties } : fallback;
}

function findReformRecord(id, fallback = {}) {
  const hit = _refEventsAll.find((e) => e && String(e.id) === String(id));
  return hit ? { ...fallback, ...hit } : fallback;
}

function buildBufferPopupHtml({ title, kicker, city, period, image, category, description, sourceUrl, distKm, statusLabel }) {
  const realImg = assetUrl(image);
  const fallbackImg = placeholderDataURI(title || '要素影像', category || 'building', 560, 320);
  const imgSrc = realImg || fallbackImg;
  const metaParts = [kicker, city, period].filter(Boolean).map((x) => escapeHtml(String(x)));
  const descText = description ? escapeHtml(String(description)) : '';
  const srcHref = sourceUrl ? normalizeSourceUrl(sourceUrl) : '';
  const srcLabel = isBaikeUrl(sourceUrl) ? '百度百科 ↗' : '资料出处 ↗';
  const distStr = Number.isFinite(Number(distKm)) ? Number(distKm).toFixed(2) : String(distKm || '0.00');
  return `<div class="buf-popup-card">` +
    `<div class="popup-media">` +
      `<img class="popup-img" src="${escapeHtml(imgSrc)}" data-fallback="${escapeHtml(fallbackImg)}" alt="${escapeHtml(title || '')}实景照片" />` +
    `</div>` +
    `<div class="popup-body">` +
      `<div class="popup-kicker">${metaParts.join(' · ')}</div>` +
      `<div class="popup-title">${escapeHtml(title || '')}</div>` +
      (descText ? `<p class="popup-desc">${descText}</p>` : '') +
      `<div class="popup-foot">` +
        `<span class="popup-meta">距靶心 <strong>${distStr} km</strong> · ${escapeHtml(statusLabel || '')}</span>` +
        (srcHref ? `<a class="popup-link" href="${escapeHtml(srcHref)}" target="_blank" rel="noopener noreferrer">${srcLabel}</a>` : '') +
      `</div>` +
    `</div>` +
  `</div>`;
}

async function initPostgisBufferLab() {
  const ctl = document.getElementById('pg-buf-controls');
  const mapHost = document.getElementById('map-pg-buffer');
  const mapRoot = document.getElementById('map-buf-root');
  if (!ctl || !mapHost) return;

  try {
    const [herFc, refData] = await Promise.all([
      fetchJSON(dataUrl('heritage.geojson')),
      fetchJSON(dataUrl('reform-events.json')),
    ]);
    _herFeaturesAll = herFc.features || [];
    _refEventsAll = refData.events || [];
  } catch (e) {}

  const presetSel = selectEl(BUFFER_PRESETS.map((p) => [p.key, p.label]), startCity);
  const radSel = selectEl([
    ['30', '30 km（城市尺度）'],
    ['60', '60 km（都市圈内圈）'],
    ['100', '100 km（区域都市圈）'],
    ['150', '150 km（城市群走廊）'],
    ['250', '250 km（跨省经济带）'],
  ], '100');
  const coordReadout = el('input', {
    type: 'text',
    readonly: true,
    style: 'min-width:190px;background:var(--surface-2);font-family:var(--font-mono);font-size:12.5px;',
    value: '113.9500°E, 22.5200°N',
  });

  ctl.appendChild(field('缓冲区中心点（或点击地图选点）', presetSel));
  ctl.appendChild(field('PostGIS ST_Buffer 测地半径', radSel));
  ctl.appendChild(field('当前中心坐标 (WGS84)', coordReadout));

  // 初始化缓冲区地图（统一天地图底图 + 锁定最大缩放上限）
  mapBuf = new maplibregl.Map({
    container: 'map-pg-buffer',
    style: buildOnlineStyle(),
    center: [113.95, 22.52],
    zoom: 6.4,
    minZoom: TIANDITU_MIN_ZOOM,
    maxZoom: TIANDITU_MAX_ZOOM,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
  });
  window.__bufMap = mapBuf;
  mapBuf.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  mapBuf.addControl(new maplibregl.ScaleControl({ maxWidth: 108, unit: 'metric' }), 'bottom-right');
  bindZoomLimitControl(mapBuf, mapRoot);

  let curCenter = [113.95, 22.52];
  const initPreset = BUFFER_PRESETS.find((p) => p.key === startCity) || BUFFER_PRESETS[0];
  curCenter = [initPreset.lng, initPreset.lat];
  radSel.value = String(initPreset.r >= 140 ? 150 : 100);

  const highlightBufferHitRow = (nodeKey) => {
    document.querySelectorAll('#pg-hit-list .place-item').forEach((btn) => {
      btn.classList.toggle('is-active', Boolean(nodeKey && btn.dataset.nodeKey === nodeKey));
    });
  };

  const inspectBufferNode = ({
    nodeKey, title, kicker, city, period, image, category, description, sourceUrl, coords, color, distOverride, statusOverride, pan = false,
  }) => {
    if (!mapBuf || !Array.isArray(coords)) return;
    const rKm = Number(radSel.value) || 100;
    let distKm = distOverride;
    if (!Number.isFinite(distKm)) {
      distKm = 0;
      try {
        distKm = turf.distance(turf.point(curCenter), turf.point(coords), { units: 'kilometers' });
      } catch (e) {}
    }
    const inside = distKm <= rKm + 0.05;
    highlightBufferHitRow(inside ? nodeKey : null);
    setActiveMarker(mapBuf, coords, color || '#bf3718');
    const container = mapBuf.getContainer();
    const w = (container && container.clientWidth) || 860;
    const h = (container && container.clientHeight) || 500;
    if (pan) {
      const targetY = Math.max(Math.round(h * 0.5), Math.min(h - 56, 346));
      mapBuf.easeTo({
        center: coords,
        zoom: Math.min(TIANDITU_MAX_ZOOM, Math.max(mapBuf.getZoom() || 7.5, 8.4)),
        offset: [0, targetY - Math.round(h / 2)],
        duration: 620,
      });
    } else {
      try {
        const pt = mapBuf.project(coords);
        const safeX = Math.min(w - 160, Math.max(160, pt.x));
        const safeY = Math.min(h - 52, Math.max(284, pt.y));
        if (Math.abs(safeX - pt.x) > 4 || Math.abs(safeY - pt.y) > 4) {
          mapBuf.easeTo({
            center: coords,
            offset: [Math.round(safeX - w / 2), Math.round(safeY - h / 2)],
            duration: 380,
          });
        }
      } catch (e) {}
    }
    showPopup(
      mapBuf,
      coords,
      buildBufferPopupHtml({
        title,
        kicker,
        city,
        period,
        image,
        category,
        description,
        sourceUrl,
        distKm,
        statusLabel: statusOverride || (inside ? '圈内命中' : '圈外要素'),
      }),
      { maxWidth: '296px', className: 'map-rich-popup', anchor: 'bottom', offset: 16, closeOnClick: false },
    );
  };

  const bindBufferMarkers = () => {
    if (!mapBuf) return;
    addHeritagePoints(mapBuf, _herFeaturesAll, {
      onClick: (p, ll, coords) => {
        const rec = findHeritageRecord(p.id, p);
        inspectBufferNode({
          nodeKey: 'her-' + rec.id,
          title: rec.name || '',
          kicker: `文化遗产 · ${categoryLabel(rec.category)}`,
          city: rec.city || '',
          period: rec.period || '',
          image: rec.image || '',
          category: rec.category || 'building',
          description: rec.description || '',
          sourceUrl: rec.sourceUrl || '',
          coords: coords || [ll.lng, ll.lat],
          color: categoryColor(rec.category),
        });
      },
    });
    addReformPoints(mapBuf, _refEventsAll, {
      onClick: (p, ll, coords) => {
        const rec = findReformRecord(p.id, p);
        const fullDesc = [rec.description, rec.significance].filter(Boolean).join(' ');
        inspectBufferNode({
          nodeKey: 'ref-' + rec.id,
          title: `${rec.year ? rec.year + ' · ' : ''}${rec.title || ''}`,
          kicker: `改革事件 · ${rec.type || '事件'}`,
          city: rec.city || '',
          period: rec.year ? `${rec.year} 年` : '',
          image: rec.image || '',
          category: 'trade',
          description: fullDesc,
          sourceUrl: rec.sourceUrl || '',
          coords: coords || [ll.lng, ll.lat],
          color: REFORM_COLORS[rec.type] || '#bf3718',
        });
      },
    });
  };
  _rebindBufferMarkers = bindBufferMarkers;

  mapBuf.on('load', async () => {
    await setupBasemap(mapBuf);
    mapBuf._basemapMode = 'online';
    mapBuf._swipeReady = true;
    mountBufferMapHud(mapRoot);
    attachBufferStatusBar();
    bindBufferMarkers();
    runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
  });

  mapBuf.on('click', (e) => {
    // 若点击在文化遗产或改革事件图章/名称签上，仅弹出带图详情卡片，不误移缓冲区中心点
    try {
      const checkLayers = ['heritage-symbol', 'heritage-label', 'reform-symbol', 'reform-label'].filter((id) => mapBuf.getLayer(id));
      if (checkLayers.length) {
        const hit = mapBuf.queryRenderedFeatures(e.point, { layers: checkLayers });
        if (hit && hit.length) return;
      }
    } catch (err) {}
    closePopup();
    highlightBufferHitRow(null);
    setActiveMarker(mapBuf, null);
    curCenter = [+e.lngLat.lng.toFixed(4), +e.lngLat.lat.toFixed(4)];
    coordReadout.value = `${curCenter[0]}°E, ${curCenter[1]}°N`;
    runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), false);
  });

  presetSel.addEventListener('change', () => {
    const p = BUFFER_PRESETS.find((x) => x.key === presetSel.value) || BUFFER_PRESETS[0];
    closePopup();
    highlightBufferHitRow(null);
    setActiveMarker(mapBuf, null);
    curCenter = [p.lng, p.lat];
    coordReadout.value = `${curCenter[0].toFixed(4)}°E, ${curCenter[1].toFixed(4)}°N`;
    runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
  });

  radSel.addEventListener('change', () => {
    runBufferAnalysis(curCenter[0], curCenter[1], Number(radSel.value), true);
  });

  async function runBufferAnalysis(lng, lat, radiusKm, shouldFly) {
    const reqId = ++_bufReqSeq;
    coordReadout.value = `${lng.toFixed(4)}°E, ${lat.toFixed(4)}°N`;
    const metaSb = document.querySelector('#map-buf-root [data-sb="buf-meta"]');
    if (metaSb) metaSb.textContent = `R = ${radiusKm} km`;
    if (shouldFly && mapBuf) {
      const z = radiusKm <= 40 ? 8.6 : radiusKm <= 80 ? 7.5 : radiusKm <= 150 ? 6.5 : 5.5;
      try { mapBuf.stop(); } catch (e) {}
      mapBuf.easeTo({ center: [lng, lat], zoom: z, duration: 700, essential: true });
    }
    let data = null;
    if (!window.__LOCAL_FILE_BUILD__) {
      try {
        const res = await fetch(`/api/spatial/buffer?lng=${lng}&lat=${lat}&radiusKm=${radiusKm}`);
        if (res.ok) data = await res.json();
      } catch (e) {}
    }

    // 半径或中心点连续变化时，丢弃较慢旧请求，避免旧结果覆盖最新选择。
    if (reqId !== _bufReqSeq) return;

    if (!data || !data.ok) {
      // 离线/纯静态模式下自动使用 Turf.js 测地计算兜底
      const pt = turf.point([lng, lat]);
      const bufFeat = turf.buffer(pt, radiusKm, { units: 'kilometers', steps: 64 });
      const areaSqm = turf.area(bufFeat);
      const heritageHits = [];
      _herFeaturesAll.forEach((f) => {
        const c = f.geometry && f.geometry.coordinates;
        if (!c) return;
        const dKm = turf.distance(pt, turf.point(c), { units: 'kilometers' });
        if (dKm <= radiusKm) {
          heritageHits.push({
            id: f.properties.id, name: f.properties.name, category: f.properties.category,
            city: f.properties.city, dist_km: +dKm.toFixed(2), coordinates: c,
          });
        }
      });
      heritageHits.sort((a, b) => a.dist_km - b.dist_km);
      const reformHits = [];
      _refEventsAll.forEach((e) => {
        if (!e.coordinates) return;
        const dKm = turf.distance(pt, turf.point(e.coordinates), { units: 'kilometers' });
        if (dKm <= radiusKm) {
          reformHits.push({
            id: e.id, year: e.year, title: e.title, city: e.city, type: e.type,
            dist_km: +dKm.toFixed(2), coordinates: e.coordinates,
          });
        }
      });
      reformHits.sort((a, b) => a.dist_km - b.dist_km);
      data = {
        ok: true,
        engine: 'Turf.js Geodesic Engine',
        sql: `SELECT h.id, h.name, h.category, ROUND((ST_Distance(h.geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)/1000)::numeric, 2) AS dist_km\nFROM heritage_sites h\nWHERE ST_DWithin(h.geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusKm * 1000});`,
        bufferAreaSqm: areaSqm,
        bufferFeature: bufFeat,
        heritageHits,
        reformHits,
      };
    }

    // 渲染多圈层测地缓冲区、中心靶标、径向测地连线与命中光晕
    if (isSwipeMapReady(mapBuf)) {
      try {
        const fc = { type: 'FeatureCollection', features: [data.bufferFeature] };
        if (!mapBuf.getSource('pg-buf-src')) {
          mapBuf.addSource('pg-buf-src', { type: 'geojson', data: fc });
          mapBuf.addLayer({ id: 'buffer-fill', type: 'fill', source: 'pg-buf-src', paint: { 'fill-color': '#bf3718', 'fill-opacity': 0.11 } });
          mapBuf.addLayer({ id: 'buffer-casing', type: 'line', source: 'pg-buf-src', paint: { 'line-color': '#fffdf9', 'line-width': 4.4, 'line-opacity': 0.82 } });
          mapBuf.addLayer({ id: 'buffer-line', type: 'line', source: 'pg-buf-src', paint: { 'line-color': '#090b11', 'line-width': 2.1, 'line-dasharray': [4, 2] } });
        } else {
          mapBuf.getSource('pg-buf-src').setData(fc);
        }

        // 50% 同心内圈参考线
        let halfFc = { type: 'FeatureCollection', features: [] };
        try {
          const halfFeat = turf.buffer(turf.point([lng, lat]), radiusKm * 0.5, { units: 'kilometers', steps: 64 });
          if (halfFeat) halfFc = { type: 'FeatureCollection', features: [halfFeat] };
        } catch (err) {}
        if (!mapBuf.getSource('pg-buf-half-src')) {
          mapBuf.addSource('pg-buf-half-src', { type: 'geojson', data: halfFc });
          mapBuf.addLayer({
            id: 'buffer-half-line',
            type: 'line',
            source: 'pg-buf-half-src',
            paint: { 'line-color': '#bf3718', 'line-width': 1.25, 'line-opacity': 0.48, 'line-dasharray': [2, 2.5] },
          });
        } else {
          mapBuf.getSource('pg-buf-half-src').setData(halfFc);
        }

        // 径向测地连线 (Spokes) 与圈内命中光晕
        const spokeFeatures = [];
        const hitFeatures = [];
        data.heritageHits.forEach((h) => {
          if (!Array.isArray(h.coordinates)) return;
          const col = categoryColor(h.category);
          spokeFeatures.push({
            type: 'Feature',
            properties: { color: col },
            geometry: { type: 'LineString', coordinates: [[lng, lat], h.coordinates] },
          });
          hitFeatures.push({
            type: 'Feature',
            properties: { color: col },
            geometry: { type: 'Point', coordinates: h.coordinates },
          });
        });
        data.reformHits.forEach((r) => {
          if (!Array.isArray(r.coordinates)) return;
          const col = REFORM_COLORS[r.type] || '#bf3718';
          spokeFeatures.push({
            type: 'Feature',
            properties: { color: col },
            geometry: { type: 'LineString', coordinates: [[lng, lat], r.coordinates] },
          });
          hitFeatures.push({
            type: 'Feature',
            properties: { color: col },
            geometry: { type: 'Point', coordinates: r.coordinates },
          });
        });
        const spokesFc = { type: 'FeatureCollection', features: spokeFeatures };
        const hitsFc = { type: 'FeatureCollection', features: hitFeatures };
        if (!mapBuf.getSource('pg-buf-spokes-src')) {
          mapBuf.addSource('pg-buf-spokes-src', { type: 'geojson', data: spokesFc });
          mapBuf.addLayer({
            id: 'buffer-spokes',
            type: 'line',
            source: 'pg-buf-spokes-src',
            paint: { 'line-color': ['get', 'color'], 'line-width': 1.3, 'line-opacity': 0.52, 'line-dasharray': [2, 2] },
          });
        } else {
          mapBuf.getSource('pg-buf-spokes-src').setData(spokesFc);
        }

        if (!mapBuf.getSource('pg-buf-hits-src')) {
          mapBuf.addSource('pg-buf-hits-src', { type: 'geojson', data: hitsFc });
          mapBuf.addLayer({
            id: 'buffer-hit-halo',
            type: 'circle',
            source: 'pg-buf-hits-src',
            paint: {
              'circle-radius': 17,
              'circle-color': ['get', 'color'],
              'circle-opacity': 0.18,
              'circle-stroke-color': ['get', 'color'],
              'circle-stroke-width': 1.2,
              'circle-stroke-opacity': 0.52,
            },
          });
        } else {
          mapBuf.getSource('pg-buf-hits-src').setData(hitsFc);
        }

        // 中心靶心双环标记
        const centerFc = {
          type: 'FeatureCollection',
          features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } }],
        };
        if (!mapBuf.getSource('pg-buf-center-src')) {
          mapBuf.addSource('pg-buf-center-src', { type: 'geojson', data: centerFc });
          mapBuf.addLayer({
            id: 'buf-center-outer',
            type: 'circle',
            source: 'pg-buf-center-src',
            paint: {
              'circle-radius': 11,
              'circle-color': 'rgba(255, 253, 249, 0.88)',
              'circle-stroke-color': '#bf3718',
              'circle-stroke-width': 2.3,
            },
          });
          mapBuf.addLayer({
            id: 'buf-center-inner',
            type: 'circle',
            source: 'pg-buf-center-src',
            paint: {
              'circle-radius': 4.2,
              'circle-color': '#bf3718',
              'circle-stroke-color': '#fffdf9',
              'circle-stroke-width': 1.4,
            },
          });
        } else {
          mapBuf.getSource('pg-buf-center-src').setData(centerFc);
        }

        restackLayers(mapBuf);
      } catch (e) {}
    }

    // 更新统计框
    const statsGrid = document.getElementById('pg-buf-stats');
    if (statsGrid) {
      statsGrid.innerHTML = '';
      const hCnt = data.heritageHits.length;
      const rCnt = data.reformHits.length;
      const cooccurrence = hCnt > 0 && rCnt > 0 ? '双类共现' : (hCnt + rCnt > 0 ? '单类分布' : '圈内无要素');
      [
        ['ST_Buffer 测地面积', formatArea(data.bufferAreaSqm), `半径 ${radiusKm} km`],
        ['圈内历史文化遗产', `${hCnt} 处`, 'ST_DWithin 命中'],
        ['圈内改革开放事件', `${rCnt} 起`, 'ST_DWithin 命中'],
        ['圈内要素共现', cooccurrence, `共 ${hCnt + rCnt} 个时空节点`],
      ].forEach(([l, v, s], idx) => {
        statsGrid.appendChild(el('div', { class: 'stat-box' + (idx === 3 ? ' stat-box-highlight' : '') }, [
          el('div', { class: 'sb-label', text: l }),
          el('div', { class: 'sb-value', text: v }),
          el('div', { class: 'sb-sub', text: s }),
        ]));
      });
    }

    // 更新 SQL 面板
    const sqlPre = document.getElementById('pg-sql-console');
    if (sqlPre) sqlPre.textContent = data.sql || '';
    const engBadge = document.getElementById('pg-buf-engine');
    if (engBadge) engBadge.textContent = data.engine || 'PostGIS';

    // 更新命中列表与图表
    const hitList = document.getElementById('pg-hit-list');
    if (hitList) {
      hitList.innerHTML = '';
      const combined = [
        ...data.heritageHits.map((h) => {
          const rec = findHeritageRecord(h.id, h);
          return {
            nodeKey: 'her-' + h.id,
            name: rec.name || h.name,
            kicker: `文化遗产 · ${categoryLabel(rec.category || h.category)}`,
            city: rec.city || h.city || '',
            period: rec.period || h.period || '',
            image: rec.image || '',
            category: rec.category || h.category || 'building',
            description: rec.description || '',
            sourceUrl: rec.sourceUrl || '',
            sub: `[文化遗产·${categoryLabel(rec.category || h.category)}] ${rec.city || h.city || ''}`,
            dist: h.dist_km,
            color: categoryColor(rec.category || h.category),
            icon: markerIconDataURL('mk-' + (rec.category || h.category)),
            coords: h.coordinates,
          };
        }),
        ...data.reformHits.map((r) => {
          const rec = findReformRecord(r.id, r);
          const yr = rec.year || r.year;
          const tp = rec.type || r.type;
          return {
            nodeKey: 'ref-' + r.id,
            name: `${yr ? yr + ' · ' : ''}${rec.title || r.title}`,
            kicker: `改革事件 · ${tp}`,
            city: rec.city || r.city || '',
            period: yr ? `${yr} 年` : '',
            image: rec.image || '',
            category: 'trade',
            description: [rec.description, rec.significance].filter(Boolean).join(' '),
            sourceUrl: rec.sourceUrl || '',
            sub: `[改革事件·${tp}] ${rec.city || r.city || ''}`,
            dist: r.dist_km,
            color: REFORM_COLORS[tp] || '#c63a18',
            icon: markerIconDataURL('rk-' + tp),
            coords: r.coordinates,
          };
        }),
      ].sort((a, b) => a.dist - b.dist);

      if (!combined.length) {
        hitList.appendChild(el('div', { style: 'color:var(--muted);font-size:13px;padding:8px;', text: '当前缓冲半径内暂无要素，请调大半径或切换中心城市。' }));
      } else {
        combined.forEach((it) => {
          const thumbUrl = assetUrl(it.image) || placeholderDataURI(it.name, it.category, 112, 76);
          const thumbImg = el('img', {
            class: 'pi-thumb',
            src: thumbUrl,
            alt: '',
          });
          thumbImg.addEventListener('error', () => {
            const fb = placeholderDataURI(it.name, it.category, 112, 76);
            if (thumbImg.src !== fb) thumbImg.src = fb;
          }, { once: true });

          const row = el('button', { class: 'place-item', type: 'button', 'data-node-key': it.nodeKey }, [
            it.icon ? el('img', { class: 'pi-icon', src: it.icon, alt: '' }) : el('span', { class: 'pi-dot', style: `background:${it.color}` }),
            el('div', { style: 'flex:1;min-width:0;' }, [
              el('div', { class: 'pi-name', text: it.name }),
              el('div', { class: 'pi-meta', text: it.sub }),
            ]),
            thumbImg,
            el('span', { class: 'tag', style: 'font-family:var(--font-mono);flex:none;', text: `${it.dist} km` }),
          ]);
          row.addEventListener('click', () => {
            if (!mapBuf || !it.coords) return;
            inspectBufferNode({
              nodeKey: it.nodeKey,
              title: it.name,
              kicker: it.kicker,
              city: it.city,
              period: it.period,
              image: it.image,
              category: it.category,
              description: it.description,
              sourceUrl: it.sourceUrl,
              coords: it.coords,
              color: it.color,
              distOverride: Number(it.dist),
              statusOverride: 'ST_DWithin 命中',
              pan: true,
            });
          });
          hitList.appendChild(row);
        });
      }
    }

    const chartDom = document.getElementById('pg-buf-chart');
    if (chartDom) {
      const cats = ['文化遗产', '经济特区', '沿海开放', '创新/自贸/园区'];
      const herCnt = data.heritageHits.length;
      const sezCnt = data.reformHits.filter((r) => r.type === '经济特区').length;
      const coastCnt = data.reformHits.filter((r) => r.type === '沿海开放').length;
      const otherRef = data.reformHits.length - sezCnt - coastCnt;
      bufChart = createChart(chartDom, barOption(cats, [herCnt, sezCnt, coastCnt, otherRef], { name: '命中数量', unit: '个' }));
    }
  }
}

/* ============================================================================
 * 模块三：GeoServer OGC 服务探针与 PostGIS 在线空间入库
 * ========================================================================== */

function initOgcAndInsertPanel() {
  const btnInsert = document.getElementById('btn-postgis-insert');
  const msgEl = document.getElementById('add-result-msg');
  if (window.__LOCAL_FILE_BUILD__) {
    const note = document.getElementById('local-mode-note');
    if (note) {
      note.hidden = false;
      note.textContent = '当前为本地文件版：PostGIS 在线入库与 GeoServer WFS 需在本地运行 node server/server.cjs 后使用；其余空间分析由 Turf.js 测地引擎完成。';
    }
    if (btnInsert) {
      btnInsert.disabled = true;
      btnInsert.textContent = '需本地全栈运行';
    }
    document.querySelectorAll('[data-ogc]').forEach((b) => { b.disabled = true; });
    const preview = document.getElementById('ogc-preview');
    if (preview) preview.textContent = '本地文件版未连接 GeoServer。OGC 服务的启动方式见项目 README 与 server 目录。';
    return;
  }
  if (btnInsert) {
    btnInsert.addEventListener('click', async () => {
      const payload = {
        name: (document.getElementById('add-name') || {}).value,
        category: (document.getElementById('add-cat') || {}).value,
        city: (document.getElementById('add-city') || {}).value,
        period: (document.getElementById('add-period') || {}).value,
        lng: Number((document.getElementById('add-lng') || {}).value),
        lat: Number((document.getElementById('add-lat') || {}).value),
        description: (document.getElementById('add-desc') || {}).value,
      };
      const originalLabel = btnInsert.textContent;
      btnInsert.disabled = true;
      btnInsert.setAttribute('aria-busy', 'true');
      btnInsert.textContent = '写入中…';
      if (msgEl) msgEl.textContent = '正在写入空间数据库…';
      try {
        const res = await fetch('/api/heritage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (d && d.ok) {
          if (msgEl) msgEl.textContent = `已入库 (${d.engine}): ${payload.name} [${payload.lng}, ${payload.lat}]`;
          if (d.feature) {
            _herFeaturesAll.push(d.feature);
            if (_rebindBufferMarkers) _rebindBufferMarkers();
            else if (mapBuf) addHeritagePoints(mapBuf, _herFeaturesAll);
            if (mapBuf) mapBuf.easeTo({ center: [payload.lng, payload.lat], zoom: 7.5, duration: 900 });
          }
          const sqlPre = document.getElementById('pg-sql-console');
          if (sqlPre && d.sql) sqlPre.textContent = d.sql;
          toast(`成功将「${payload.name}」写入 PostGIS 空间数据库！`, 'info', 3000);
        } else {
          if (msgEl) msgEl.textContent = '入库失败：' + (d.error || '未知错误');
        }
      } catch (e) {
        if (msgEl) msgEl.textContent = '请通过 node server/server.cjs 启动空间后端以使用 PostGIS 入库';
      } finally {
        btnInsert.disabled = false;
        btnInsert.removeAttribute('aria-busy');
        btnInsert.textContent = originalLabel;
        try { btnInsert.focus({ preventScroll: true }); } catch (e) {}
      }
    });
  }

  const ogcBtns = [...document.querySelectorAll('[data-ogc]')];
  const preview = document.getElementById('ogc-preview');
  ogcBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.getAttribute('data-ogc');
      ogcBtns.forEach((b) => { b.disabled = true; });
      btn.setAttribute('aria-busy', 'true');
      if (preview) preview.textContent = `正在请求 OGC 服务: ${url} …`;
      try {
        const res = await fetch(url);
        const text = await res.text();
        if (preview) {
          try {
            const parsed = JSON.parse(text);
            preview.textContent = JSON.stringify(parsed, null, 2).slice(0, 2600) + '\n… (OGC WFS FeatureCollection 响应成功)';
          } catch (e) {
            preview.textContent = text.slice(0, 2600);
          }
        }
      } catch (e) {
        if (preview) preview.textContent = `请求异常: ${e.message}`;
      } finally {
        ogcBtns.forEach((b) => { b.disabled = false; });
        btn.removeAttribute('aria-busy');
        try { btn.focus({ preventScroll: true }); } catch (e) {}
      }
    });
  });
}

/* ----------------------------- 工具 ----------------------------- */
function field(label, control) { return el('div', { class: 'field' }, [el('label', { text: label }), control]); }
function selectEl(pairs, value) {
  const s = el('select');
  pairs.forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (String(v) === String(value)) o.selected = true; s.appendChild(o); });
  return s;
}
function replaceOptions(fieldEl, pairs, value) {
  const s = fieldEl.querySelector('select'); s.innerHTML = '';
  pairs.forEach(([v, t]) => { const o = el('option', { value: v, text: t }); if (String(v) === String(value)) o.selected = true; s.appendChild(o); });
}

/* ----------------------------- 模块一附加：九城建筑三维演化（OSM 真实轮廓 × 建成区年代分层） ----------------------------- */
// era = 建筑底面质心首次落入 AUE 建成区范围的时相（1990/2000/2014，三期外记 2024），是推断的年代层而非竣工年份。
// 时间轴按 era ≤ 当前时相 累计显示；颜色表示年代，高度按 1:1 米渲染（OSM 标注或分级插补）。
let map3D = null;
const BU3D = { started: false, city: 'shenzhen', year: 2014, mode: 'cumulative', playing: false, timer: null, data: {}, overview: {}, meta: null, current: null, summaryCache: {}, lodZoom: 14.7,
  // 自适应降级：细节层下交互帧时持续过低（中位 ≥150ms）时，临时上调 LOD 阈值回到概览层；
  // 调整只在交互中生效，城市切换 / 复位视角后清零重试。autoLod=false 可整体关闭（perf 脚本用它固定行为）。
  autoLod: true, autoRaise: 0, autoCool: 0,
  // 生长动画：token 用于在换城/换年时终止在跑的动画；spawn 缓存 [城市][源][年代]→按"建成区中心
  // 向外"排序的楼栋索引；rise 记录当前动画状态（startsWith t0/era/frames）。
  spawn: {}, rise: { token: 0, active: false, t0: 0, srcId: '', chunks: [], ramp: 260, stride: 60 } };
// 帧时环形缓冲：render 事件间隔（交互/补间时才密集出现），供自适应降级判定；
// 挂到 BU3D.samples 上，测试/调试可以从外部注入样本再触发一次 render 验证阈值调整。
const B3D_FPS = { last: 0, times: [] };
BU3D.samples = B3D_FPS;
const BU3D_YEARS = [1990, 2000, 2014, 2024];
const BU3D_ERA = {
  1990: { label: '1990 前已建成', color: '#0f6e7c' },
  2000: { label: '1990–2000 新增', color: '#d0471f' },
  2014: { label: '2000–2014 新增', color: '#9a6a10' },
  2024: { label: '2014 后新增', color: '#6b4fa1' },
};
const BU3D_HS = ['OSM height 标签', '层数 × 3.2m', '同年代同类型中位数', '同年代中位数', '8m 兜底'];
// LOD：远景只画概览层（每 145m 网格保留最高的一栋，体块数约为全量的 22–34%）。
// 软件渲染实测概览层 24.9–32.2fps、默认相机强开逐栋全量降至 4.9–8.9fps（详见 docs/test-records.md 2.0d.1），
// 所以细节层的接管阈值跟着相机走，而不是写死一个固定层级。
const BU3D_LOD_DELTA = 1.4;

function initBuiltup3D() {
  const section = document.getElementById('lab-builtup-3d');
  if (!section || BU3D.started) return;
  if (typeof maplibregl === 'undefined') { show3DError('MapLibre 未加载，无法显示 3D 建筑'); return; }
  const start = () => { if (!BU3D.started) { BU3D.started = true; startBuiltup3DMap(); } };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
    }, { rootMargin: '360px 0px' });
    io.observe(section);
  } else {
    start();
  }
}

function bu3dView() {
  const sel = document.querySelector('#a-controls select');
  const city = (sel && sel.value) || BU3D.city;
  return { city };
}

function startBuiltup3DMap() {
  const container = document.getElementById('map-3d');
  BU3D.city = bu3dView().city;
  // 渲染开销控制：
  // - pixelRatio 封顶 1.5：Retina/高分屏不做 2x 全屏采样，填充率降到一半以下，楼体边缘仍有 1.5x 采样；
  // - antialias 只在低分屏保留 MSAA（高分屏靠 pixelRatio 保边缘锐度）；
  // - renderWorldCopies:false：最小 8.5 级下无意义的世界副本回放直接关掉。
  const dpr = window.devicePixelRatio || 1;
  map3D = new maplibregl.Map({
    container,
    style: buildOnlineStyle(),
    center: [114.07, 22.58],
    zoom: 11.4,
    pitch: 56,
    bearing: -18,
    minZoom: TIANDITU_MIN_ZOOM,
    maxZoom: TIANDITU_MAX_ZOOM,
    maxPitch: 72,
    attributionControl: false,
    dragRotate: true,
    pitchWithRotate: true,
    pixelRatio: Math.min(dpr, 1.5),
    antialias: dpr <= 1.25,
    renderWorldCopies: false,
  });
  map3D.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
  map3D.addControl(new maplibregl.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-right');
  map3D.on('error', () => {});
  map3D.on('move', () => {
    if (map3D.__lodRaf) return;
    map3D.__lodRaf = requestAnimationFrame(() => { map3D.__lodRaf = null; updateLodChip(); });
  });
  map3D.on('render', () => {
    const now = performance.now();
    if (B3D_FPS.last) {
      const dt = now - B3D_FPS.last;
      if (dt > 0 && dt < 5000) {
        B3D_FPS.times.push(dt);
        if (B3D_FPS.times.length > 48) B3D_FPS.times.shift();
      }
    }
    B3D_FPS.last = now;
    evaluateAutoLod();
  });

  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(() => { try { map3D && map3D.resize(); } catch (e) {} });
    ro.observe(container);
  } else {
    window.addEventListener('resize', () => { try { map3D && map3D.resize(); } catch (e) {} });
  }

  map3D.on('load', async () => {
    try {
      await setupBasemap(map3D);
      try { map3D.setMinZoom(8.5); } catch (e) {}
      apply3DSky();
      bind3DControls();
      BU3D.meta = await fetchJSON(dataUrl('buildings/buildings-meta.json'));
      await applyCity(BU3D.city);
      const loading = document.getElementById('map-3d-loading');
      if (loading) loading.classList.add('hide');
      window.__bu3D = {
        map: map3D,
        state: BU3D,
        get data() { return BU3D.data; },
        get overview() { return BU3D.overview; },
        setYear: set3DYear,
        setCity: applyCity,
        play: startPlay,
        stop: stopPlay,
        toggleMode: toggle3DMode,
      };
    } catch (e) {
      show3DError('3D 建筑数据加载失败：' + (e && e.message ? e.message : e));
    }
  });
}

function apply3DSky() {
  if (!map3D || typeof map3D.setSky !== 'function') return;
  try {
    map3D.setSky({
      'sky-color': '#ffd9b8',
      'horizon-color': '#fff6f4',
      'fog-color': '#fff6f4',
      'fog-ground-blend': 0.55,
      'horizon-fog-blend': 0.6,
      'sky-horizon-blend': 0.65,
      'atmosphere-blend': 0.16,
    });
  } catch (e) { /* 旧版 MapLibre 无天空 API */ }
}

function bu3dPaint() {
  return {
    'fill-extrusion-color': [
      'match', ['get', 'era'],
      1990, BU3D_ERA[1990].color,
      2000, BU3D_ERA[2000].color,
      2014, BU3D_ERA[2014].color,
      2024, BU3D_ERA[2024].color,
      '#8a8f87',
    ],
    // 生长动画：feature-state 'gh' 存在时用它（0→h 过渡值），否则回落到 1:1 真实高度 h。
    // 只走归一化路口，不建数据（buildings h 恒为准；动画用 setFeatureState 增量写 'gh'）。
    'fill-extrusion-height': [
      'coalesce', ['feature-state', 'gh'], ['get', 'h'],
    ],
    'fill-extrusion-base': 0,
    // 不透明渲染（透明度 1 才能开深度写入）：先压后画的重叠楼体由深度测试直接剔除，
    // 免掉半透明混合与逐片排序，是逐栋大场景帧时最直接的收益之一；
    // 0.95 → 1.0 在视觉上不可辨（颜色本身即为实色）。
    'fill-extrusion-opacity': 1,
    'fill-extrusion-vertical-gradient': true,
  };
}

// 直接按窗口宽度反算相机：fitBounds 在 56° 俯仰下会把镜头推到 minZoom（建筑缩成亚像素，
// 且全部要素同屏导致掉帧），所以这里按"窗口宽度占画布约 78%"确定缩放，再叠加俯仰。
function bu3dCamera(meta) {
  const [s, w, n, e] = meta.window;
  const lat = (s + n) / 2;
  const rad = (lat * Math.PI) / 180;
  const canvasW = Math.max(320, ((map3D.getContainer().clientWidth || 1200) - 160));
  const kmWide = (e - w) * 111.32 * Math.cos(rad);
  const mPerPx = (kmWide * 1000) / (canvasW * 0.78);
  const zoom = Math.max(10.8, Math.min(13.4, Math.log2((156543.03392 * Math.cos(rad)) / mPerPx)));
  return { center: [(w + e) / 2, lat], zoom, pitch: 56, bearing: -18 };
}

function bu3dFilter() {
  return BU3D.mode === 'incremental'
    ? ['==', ['get', 'era'], BU3D.year]
    : ['<=', ['get', 'era'], BU3D.year];
}

// 两级 LOD 的图层区间同步（阈值变化或城市切换后都要走一遍，保持互补）
function set3DLodRanges() {
  if (!map3D || map3D._removed) return;
  try {
    if (map3D.getLayer('bu3d-city')) map3D.setLayerZoomRange('bu3d-city', BU3D.lodZoom, 24);
    if (map3D.getLayer('bu3d-city-ov')) map3D.setLayerZoomRange('bu3d-city-ov', 0, BU3D.lodZoom);
  } catch (e) { /* 图层尚未就位时忽略 */ }
}

/* ------------------------- 生长动画（feature-state 分波写入） -------------------------
 * 触发：set3DYear / toggle3DMode 使「可见年代集」增大时，对新纳入的年代做升起表现：
 *   - 每栋楼从本年代楼群按"建成区中心向外"的次序依次从 0 长到 1:1 高度（easeOutCubic）；
 *   - 实现不逐帧建网格：height 表达式已挂 'gh' feature-state（见 bu3dPaint），每帧只对
 *     活跃波段的楼栋 setFeatureState 重写顶点高度，单帧写入 ≤ ~2 波 ≈ 480 栋，帧时可控；
 *   - 楼群上限 RISE_CAP：超出的楼栋不进动画、直接以满高出现（概览层 ≤ ~5k，逐栋 ≤ 20k）；
 *   - 播放（1.4s/步）用更快的 stride/ramp 让一整步动画收在节拍内；单次点年份用较缓节奏；
 *   - 有效源 = 当前可见层（概览/逐栋缩放阈值决定），另一侧保持满高不受影响。
 * 终止与复位：换城 / 换年缩小 / cancel token；setData 换城即清除全部 feature-state。
 */
const RISE_CAP = 2600;
const RISE_EASE = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

function cancelEraRise(resetAll) {
  BU3D.rise.token += 1;
  BU3D.rise.active = false;
  if (resetAll && map3D && !map3D._removed) {
    try {
      if (map3D.getSource('bu3d-src')) map3D.removeFeatureState({ source: 'bu3d-src' });
      if (map3D.getSource('bu3d-ov-src')) map3D.removeFeatureState({ source: 'bu3d-ov-src' });
    } catch (e) { /* 源尚未就绪时忽略 */ }
  }
}

// 生长次序缓存：[城市][源][年代] → 索引数组（按楼底到建成区中心距离升序）
function getSpawnOrder(city, srcKey, era) {
  const fcSrc = srcKey === 'detail' ? (BU3D.data[city] || {}) : (BU3D.overview[city] || {});
  const store = (BU3D.spawn[city] = BU3D.spawn[city] || {});
  const src = (store[srcKey] = store[srcKey] || {});
  if (src[era]) return src[era];
  const meta = BU3D.current;
  let clat = 30, clng = 108;
  if (meta && meta.window) { clat = (meta.window[0] + meta.window[2]) / 2; clng = (meta.window[1] + meta.window[3]) / 2; }
  const arr = [];
  (fcSrc.features || []).forEach((f, i) => {
    const p = f.properties || {};
    if (Number(p.era) !== era) return;
    let d = 0;
    try {
      const ring = f.geometry && f.geometry.coordinates[0];
      if (ring && ring[0]) {
        const la = ring[0][1], lo = ring[0][0];
        const dy = (la - clat) * 111.32;
        const dx = (lo - clng) * 111.32 * Math.cos((la * Math.PI) / 180);
        d = Math.sqrt(dx * dx + dy * dy);
      }
    } catch (e) { d = 0; }
    arr.push({ i, d, h: Math.max(0, Number(p.h) || 0) });
  });
  arr.sort((a, b) => a.d - b.d);
  return (src[era] = arr);
}

function startEraRise(prevYear, prevMode) {
  if (!map3D || map3D._removed || !BU3D.current) return;
  const year = BU3D.year;
  const mode = prevMode || BU3D.mode; // toggle 场景需要用切换前的口径判断“先前是否可见”
  const incremental = BU3D.mode === 'incremental';
  const wants = (era) => (incremental ? era === year : era <= year);
  const was = (era) => (mode === 'incremental' ? era === prevYear : era <= prevYear);
  const newEras = BU3D_YEARS.filter((era) => wants(era) && !was(era));
  if (!newEras.length || year < prevYear) { cancelEraRise(true); return; }

  const inDetail = map3D.getZoom() >= BU3D.lodZoom;
  const srcKey = inDetail ? 'detail' : 'overview';
  const srcId = inDetail ? 'bu3d-src' : 'bu3d-ov-src';
  if (!map3D.getSource(srcId)) { cancelEraRise(false); return; }

  const token = ++BU3D.rise.token;
  // 播放节拍 1.4s/步：压缩 waves；单点年份给更从容的节奏
  const stride = BU3D.playing ? 55 : 85;
  const ramp = BU3D.playing ? 240 : 420;

  // 排序：先年代序，再按半径向外（新楼宇"从里往外长"）；超出上限的楼群直接满高出现
  const subset = [];
  for (const era of newEras) {
    for (const rec of getSpawnOrder(BU3D.city, srcKey, era)) {
      if (subset.length >= RISE_CAP) break;
      subset.push(rec);
    }
    if (subset.length >= RISE_CAP) break;
  }
  if (!subset.length) { cancelEraRise(false); return; }

  const chunkSize = 240;
  const chunks = [];
  for (let i = 0; i < subset.length; i += chunkSize) chunks.push(subset.slice(i, i + chunkSize));
  BU3D.rise.active = true;
  BU3D.rise.srcId = srcId;
  BU3D.rise.t0 = performance.now();
  BU3D.rise.chunks = chunks;
  BU3D.rise.stride = stride;
  BU3D.rise.ramp = ramp;

  const t0 = BU3D.rise.t0;
  const tick = () => {
    if (token !== BU3D.rise.token) { // 被新动画/复位顶掉：清掉自己残写的半高 state（新动画下一帧会重写活跃波）
      try { if (map3D && !map3D._removed && map3D.getSource(srcId)) map3D.removeFeatureState({ source: srcId }); } catch (e) {}
      return;
    }
    const now = performance.now();
    const totalEnd = t0 + (chunks.length - 1) * stride + ramp;
    if (now >= totalEnd) { // 动画结束：清掉全部 gh，楼体回到静态 1:1 满高
      BU3D.rise.active = false;
      try { map3D.removeFeatureState({ source: srcId }); } catch (e) {}
      return;
    }
    if (document.hidden) { requestAnimationFrame(tick); return; } // 后台页暂停写入
    let writes = 0;
    for (let c = 0; c < chunks.length; c++) {
      const startAt = t0 + c * stride;
      if (now < startAt) break; // 后续波段还没开始（chunks 有序）
      const p = RISE_EASE(Math.min(1, (now - startAt) / ramp));
      if (p >= 1) continue; // 已长满的波跳过写
      for (const rec of chunks[c]) {
        try { map3D.setFeatureState({ source: srcId, id: rec.i }, { gh: rec.h * p }); writes += 1; } catch (e) { break; }
      }
      if (writes > 700) break; // 单帧写入上限
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
/* ------------------------------- 生长动画（结束） ------------------------------- */

// 自适应降级：细节层下的交互帧中位数持续 ≥150ms（<6.7fps，软件渲染/低端核显的最坏区间）
// 时，把 LOD 阈值上调一档（+0.7，上限 +1.0）让相机回到概览层；12 秒内不再重复调整。
// 换城 / 复位视角会清零 autoRaise 重新尝试细节层；perf 脚本把 autoLod 置 false 以固定行为。
function evaluateAutoLod() {
  if (!BU3D.autoLod || !map3D || map3D._removed || !BU3D.current) return;
  if (document.hidden) return;
  const t = B3D_FPS.times;
  if (t.length < 24) return;
  const a = t.slice().sort((x, y) => x - y);
  const med = a[a.length >> 1];
  const now = Date.now();
  const detailVisible = map3D.getZoom() >= BU3D.lodZoom - 0.01;
  if (detailVisible && med >= 150 && now > BU3D.autoCool && BU3D.autoRaise < 1.0) {
    BU3D.autoRaise = Math.min(1.0, BU3D.autoRaise + 0.7);
    BU3D.autoCool = now + 12000;
    BU3D.lodZoom = Math.min(16, Math.max(map3D.getZoom() + BU3D_LOD_DELTA + BU3D.autoRaise, BU3D.lodZoom));
    set3DLodRanges();
    updateLodChip(true);
    B3D_FPS.times.length = 0; // 门槛重置，避免同一批样本反复触发
  }
}

function toggle3DMode() {
  const prevMode = BU3D.mode;
  BU3D.mode = BU3D.mode === 'cumulative' ? 'incremental' : 'cumulative';
  const prevYear = BU3D.year;
  ['bu3d-city', 'bu3d-city-ov'].forEach((id) => {
    if (map3D && map3D.getLayer(id)) map3D.setFilter(id, bu3dFilter());
  });
  if (prevMode === 'incremental') {
    // 增量→累计：显示中新增了更早的年代，做生长动画
    startEraRise(prevYear, prevMode);
  } else {
    cancelEraRise(true); // 累计→增量：可见集收缩，取消动画并复位全部 gh
  }
  apply3DControlsState();
  render3DStats();
}

let applyCityToken = 0;
async function applyCity(city) {
  if (!map3D || !BU3D.meta) return;
  const meta = (BU3D.meta.cities || []).find((m) => m.city === city);
  if (!meta) { show3DError(`${city} 暂无 3D 建筑数据`); return; }
  const token = ++applyCityToken;
  BU3D.city = city;
  BU3D.current = meta;
  build3DCitySelect();
  if (!BU3D.data[city]) {
    const [detail, overview] = await Promise.all([
      fetchJSON(dataUrl(`buildings/${city}.geojson`)),
      fetchJSON(dataUrl(`buildings/${city}-overview.geojson`)),
    ]);
    // 为 setFeatureState（生长动画）与 queryRenderedFeatures 稳定身份编号；id=索引即可
    (detail.features || []).forEach((f, i) => { f.id = i; });
    (overview.features || []).forEach((f, i) => { f.id = i; });
    BU3D.data[city] = detail;
    BU3D.overview[city] = overview;
    BU3D.spawn[city] = {}; // 换城重算生长次序缓存
  }
  if (applyCityToken !== token || !map3D || map3D._removed) return; // 期间又切了城，本次结果作废
  const fc = BU3D.data[city];
  const ov = BU3D.overview[city];
  const cam = bu3dCamera(meta);
  // 阈值 = 相机层级 + 1.4 级：同屏面积缩到窗口的约 1/14，逐栋层的体块数随之下降。
  // autoRaise 为自适应降级余量（帧率过低时自动换回概览层），换城清零重新尝试细节层。
  BU3D.autoRaise = 0;
  BU3D.lodZoom = Math.min(16, cam.zoom + BU3D_LOD_DELTA);
  if (!map3D.getSource('bu3d-src')) {
    // buffer 由默认 128px 降到 24px：单栋楼体基本不跨瓦片，默认 buffer 会让楼在相邻瓦片
    // 里重复 2–4 份上传；24px（z14 约 110m）覆盖绝大多数楼宽且跨缝楼仍闭合。
    map3D.addSource('bu3d-src', { type: 'geojson', data: fc, maxzoom: 14, buffer: 24, tolerance: 0.375 });
    map3D.addLayer({ id: 'bu3d-city', type: 'fill-extrusion', source: 'bu3d-src', minzoom: BU3D.lodZoom, paint: bu3dPaint(), filter: bu3dFilter() });
  } else {
    map3D.getSource('bu3d-src').setData(fc);
    map3D.setLayerZoomRange('bu3d-city', BU3D.lodZoom, 24);
  }
  if (!map3D.getSource('bu3d-ov-src')) {
    map3D.addSource('bu3d-ov-src', { type: 'geojson', data: ov, maxzoom: 13, buffer: 16, tolerance: 0.375 });
    map3D.addLayer({ id: 'bu3d-city-ov', type: 'fill-extrusion', source: 'bu3d-ov-src', maxzoom: BU3D.lodZoom, paint: bu3dPaint(), filter: bu3dFilter() });
  } else {
    map3D.getSource('bu3d-ov-src').setData(ov);
    map3D.setLayerZoomRange('bu3d-city-ov', 0, BU3D.lodZoom);
  }
  // 换城后必须清投标额 state：feature-state 按 id 持久化，setData 不清，旧城 id 会串到新城
  cancelEraRise(true);
  try {
    map3D.easeTo(Object.assign(cam, {
      duration: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700,
    }));
    // 切城相机到位后补载底图：新窗口一组瓦片若被天地图限流（429）拒掉，
    // MapLibre 不会自动重发，会留下成片空洞——这里主动 reload 一轮。
    map3D.once('moveend', () => repairBasemapTiles(map3D));
  } catch (err) {
    repairBasemapTiles(map3D); /* 容器尚未可见时 easeTo 抛错，直接补载一次 */
  }
  render3DLegend();
  render3DNote();
  render3DStats();
  apply3DControlsState();
  updateLodChip(true);
}

function set3DYear(year) {
  const prev = BU3D.year;
  BU3D.year = Number(year);
  if (prev === BU3D.year) return;
  ['bu3d-city', 'bu3d-city-ov'].forEach((id) => {
    if (map3D && map3D.getLayer(id)) map3D.setFilter(id, bu3dFilter());
  });
  startEraRise(prev);
  apply3DControlsState();
  render3DStats();
}

function startPlay() {
  stopPlay();
  BU3D.playing = true;
  let i = BU3D_YEARS.indexOf(BU3D.year);
  if (i < 0 || i >= BU3D_YEARS.length - 1) i = -1;
  apply3DControlsState();
  const tick = () => {
    if (!BU3D.playing) return;
    i += 1;
    if (i >= BU3D_YEARS.length) { stopPlay(); return; }
    set3DYear(BU3D_YEARS[i]);
    if (i >= BU3D_YEARS.length - 1) BU3D.timer = setTimeout(stopPlay, 1600);
    else BU3D.timer = setTimeout(tick, 1400);
  };
  BU3D.timer = setTimeout(tick, 320);
}

function stopPlay() {
  if (BU3D.timer) clearTimeout(BU3D.timer);
  BU3D.timer = null;
  BU3D.playing = false;
  apply3DControlsState();
}

function apply3DControlsState() {
  document.querySelectorAll('[data-3d-year]').forEach((btn) => {
    const on = Number(btn.getAttribute('data-3d-year')) === BU3D.year;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const play = document.getElementById('btn-3d-play');
  if (play) {
    play.classList.toggle('active', BU3D.playing);
    play.textContent = BU3D.playing ? '■ 停止' : '▶ 播放演化';
    play.setAttribute('aria-pressed', BU3D.playing ? 'true' : 'false');
  }
  const sel = document.getElementById('lab-3d-city-select');
  if (sel && sel.value !== BU3D.city) sel.value = BU3D.city;
  const inc = document.getElementById('btn-3d-incremental');
  if (inc) {
    const on = BU3D.mode === 'incremental';
    inc.classList.toggle('active', on);
    inc.setAttribute('aria-pressed', on ? 'true' : 'false');
    inc.textContent = on ? '只看新增' : '累计显示';
  }
}

function summarizeCity(fc, meta) {
  const ck = `${BU3D.city}|${BU3D.mode}|${BU3D.year}`;
  if (BU3D.summaryCache[ck]) return BU3D.summaryCache[ck];
  const feats = fc.features || [];
  const inView = (era) => (BU3D.mode === 'incremental' ? era === BU3D.year : era <= BU3D.year);
  const visible = [];
  const eraCount = { 1990: 0, 2000: 0, 2014: 0, 2024: 0 };
  const hs = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  let tallest = null;
  for (const f of feats) {
    const p = f.properties || {};
    const era = Number(p.era);
    if (eraCount[era] != null) eraCount[era] += 1;
    if (!tallest || Number(p.h) > Number(tallest.h)) tallest = p;
    if (inView(era)) {
      visible.push(Number(p.h));
      if (hs[p.hs] != null) hs[p.hs] += 1;
    }
  }
  visible.sort((a, b) => a - b);
  const pct = (q) => (visible.length ? visible[Math.min(visible.length - 1, Math.floor(visible.length * q))] : 0);
  const out = {
    total: feats.length,
    visible: visible.length,
    eraCount,
    hs,
    median: pct(0.5),
    p90: pct(0.9),
    tallest: tallest || { h: 0, era: 0 },
    meta,
  };
  BU3D.summaryCache = { [ck]: out };
  return out;
}

function render3DLegend() {
  const host = document.getElementById('lab-3d-legend');
  if (!host) return;
  const fc = BU3D.data[BU3D.city];
  if (!fc) { host.innerHTML = ''; return; }
  const s = summarizeCity(fc, BU3D.current);
  host.innerHTML = '';
  host.appendChild(el('span', { class: 'lab-3d-legend-title', text: '首次进入建成区' }));
  BU3D_YEARS.forEach((y) => {
    const row = el('span', { class: 'lab-3d-legend-row' + (y <= BU3D.year ? '' : ' is-off') }, [
      el('i', { class: 'era-' + y }),
      el('span', { text: BU3D_ERA[y].label }),
      el('em', { class: 'lab-3d-legend-count', text: formatNumber(s.eraCount[y]) }),
    ]);
    host.appendChild(row);
  });
}

let lodChipText = '';
function updateLodChip(force) {
  const host = document.getElementById('lab-3d-lod');
  if (!host || !map3D) return;
  const z = map3D.getZoom();
  const detail = z >= BU3D.lodZoom;
  const m = BU3D.current;
  const dn = (BU3D.data[BU3D.city] || { features: [] }).features.length;
  const on = (BU3D.overview[BU3D.city] || { features: [] }).features.length;
  const ratio = dn ? Math.round((100 * on) / dn) : 0;
  const cell = (m && m.overview_cell_deg) || 0.0013;
  const lat = m ? (m.window[0] + m.window[2]) / 2 : 30;
  const cw = Math.round(cell * 111320 * Math.cos((lat * Math.PI) / 180));
  const ch = Math.round(cell * 110570);
  const degrade = BU3D.autoRaise > 0 ? ` · 帧率低，已临时上调细节阈值 ${BU3D.autoRaise.toFixed(1)} 级` : '';
  const text = detail
    ? `逐栋细节层 · ${formatNumber(dn)} 栋全量轮廓（放大中，软件渲染或低端显卡旋转可能变慢）`
    : `远景概览层 · 每 ${cw}×${ch}m 网格保留最高一栋，${formatNumber(on)} / ${formatNumber(dn)} 栋（${ratio}%）`
      + ` · 放大到 ${BU3D.lodZoom.toFixed(1)} 级切换逐栋轮廓${degrade}`;
  // 连续旋转时每个 move 帧都会进来：内容没变就不重写 DOM（触发回流）
  if (!force && text === lodChipText) { host.classList.toggle('is-detail', detail); return; }
  lodChipText = text;
  host.textContent = text;
  host.classList.toggle('is-detail', detail);
}

function render3DNote() {
  const host = document.getElementById('lab-3d-note');
  if (!host || !BU3D.current) return;
  const m = BU3D.current;
  const kmx = ((m.window[3] - m.window[1]) * 111.32 * 0.92).toFixed(1);
  const kmy = ((m.window[2] - m.window[0]) * 110.57).toFixed(1);
  host.textContent = '轮廓：OpenStreetMap 建筑多边形（© OpenStreetMap contributors，ODbL），反映当前地图状态；该城市 OSM 收录可能不完整，轮廓稀疏处不代表实地没有建筑。'
    + `年代：按建筑底面质心首次落入 AUE 建成区（1990 / 2000 / 2014）的时相推断，三期范围外记为「2014 后新增」，是年代分层而非竣工年份。`
    + '高度：OSM height 标签 → building:levels × 3.2m → 同年代同类型中位数 → 同年代中位数 → 8m 兜底，按 1:1 米渲染。'
    + `窗口：由建成区几何搜索确定的${m.name_cn}核心区（约 ${kmx} × ${kmy} km），非全市域。`;
}

function render3DStats() {
  const host = document.getElementById('lab-3d-stats');
  if (!host) return;
  const fc = BU3D.data[BU3D.city];
  if (!fc) { host.textContent = ''; return; }
  const s = summarizeCity(fc, BU3D.current);
  const n = s.total || 1;
  const items = [
    ['时相', BU3D.year === 2024 ? '现状（2014 后）' : String(BU3D.year)],
    [BU3D.mode === 'incremental' ? '可见建筑（本年代新增）' : '可见建筑（累计）', `${formatNumber(s.visible)} / ${formatNumber(s.total)}`],
    ['中位高度', `${Number(s.median).toFixed(1)} m`],
    ['P90 高度', `${Number(s.p90).toFixed(1)} m`],
    ['最高建筑（全时段）', `${Number(s.tallest.h).toFixed(1)} m`],
    ['高度来源 实测/标签', `${((100 * s.hs[0]) / n).toFixed(1)}%`],
    ['高度来源 层数推算', `${((100 * s.hs[1]) / n).toFixed(1)}%`],
    ['高度来源 同类中位数', `${((100 * (s.hs[2] + s.hs[3])) / n).toFixed(1)}%`],
    ['高度来源 兜底', `${((100 * s.hs[4]) / n).toFixed(1)}%`],
  ];
  // 老城占比过高时主动说明：窗口内的扩张主要发生在更外围，避免被误读为"城市没长高/没长大"
  if (s.meta && s.meta.thinned_out > 0) {
    items.push(['收录抽稀', `保留 ${formatNumber(s.total)}，舍弃 ${formatNumber(s.meta.thinned_out)}（按底面积优先）`]);
  }
  const topEra = Object.entries(s.eraCount).sort((a, b) => b[1] - a[1])[0];
  if (topEra && s.total > 0 && topEra[1] / s.total >= 0.8) {
    items.push(['年代构成提示',
      `${BU3D_ERA[topEra[0]].label} 占 ${((100 * topEra[1]) / s.total).toFixed(0)}%，该城扩张多在窗口外围，可切「只看新增」看各年代增量`]);
  }
  host.innerHTML = '';
  items.forEach(([label, value]) => {
    host.appendChild(el('div', { class: 'lab-3d-stat' }, [
      el('span', { class: 'lab-3d-stat-label', text: label }),
      el('strong', { class: 'lab-3d-stat-value tabular-nums', text: value }),
    ]));
  });
  render3DLegend();
}

// 3D 模块在长页底部，顶部「城市」下拉够不着，所以模块自带一个城市选择器。
// 它只切换本模块，不会重载卷帘/图表；顶部下拉变化时由 apply3DControlsState 同步到这里。
function build3DCitySelect() {
  const sel = document.getElementById('lab-3d-city-select');
  if (!sel || sel.options.length) return;
  const names = {};
  ((BU3D.meta && BU3D.meta.cities) || []).forEach((m) => { names[m.city] = m.name_cn; });
  const keys = Object.keys(URBAN.cities).filter((c) => names[c]);
  sel.innerHTML = '';
  keys.forEach((c) => sel.appendChild(el('option', { value: c, text: names[c] })));
  sel.value = BU3D.city;
  sel.addEventListener('change', () => applyCity(sel.value).catch(() => {}));
}

function bind3DControls() {
  document.querySelectorAll('[data-3d-year]').forEach((btn) => {
    btn.addEventListener('click', () => { stopPlay(); set3DYear(Number(btn.getAttribute('data-3d-year'))); });
  });
  const play = document.getElementById('btn-3d-play');
  if (play) play.addEventListener('click', () => { if (BU3D.playing) stopPlay(); else startPlay(); });
  const inc = document.getElementById('btn-3d-incremental');
  if (inc) inc.addEventListener('click', toggle3DMode);
  const reset = document.getElementById('btn-3d-reset');
  if (reset) {
    reset.addEventListener('click', () => {
      const m = BU3D.current;
      if (!m) return;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      try {
        const cam = bu3dCamera(m);
        map3D.easeTo(Object.assign(cam, { duration: reduce ? 0 : 700 }));
        BU3D.autoRaise = 0; // 复位视角同时重试细节层
        BU3D.lodZoom = Math.min(16, cam.zoom + BU3D_LOD_DELTA);
        set3DLodRanges();
        updateLodChip(true);
        cancelEraRise(true); // 复位时终止生长动画并把楼体归位满高
      } catch (e2) {}
    });
  }
  apply3DControlsState();
}

function show3DError(msg) {
  const loading = document.getElementById('map-3d-loading');
  if (loading) { loading.classList.remove('hide'); loading.textContent = msg; }
  toast(msg, 'error', 4000);
}

// 天地图限流自动降级/恢复的页面提示（basemap.js 会在 10s 内 8 次栅格失败时切换备用底图）
// 复用既有 .basemap-banner 样式（map.js 同款文案横幅），无 data-bm 属性，不影响无 survey 断言。
function showBasemapFallbackBanner(msg, ms) {
  try {
    let bar = document.getElementById('wb-basemap-banner');
    if (!bar) {
      bar = el('div', { id: 'wb-basemap-banner', class: 'basemap-banner', role: 'status' });
      document.body.appendChild(bar);
    }
    bar.textContent = msg;
    bar.classList.add('show');
    clearTimeout(bar._t);
    bar._t = setTimeout(() => bar.classList.remove('show'), ms || 8000);
  } catch (err) {}
}
document.addEventListener('wb-basemap-fallback', (e) => {
  try {
    const on = !!(e && e.detail && e.detail.fallback);
    if (on) {
      const name = (e.detail && e.detail.name) || '备用底图';
      const attr = (e.detail && e.detail.attr) || '';
      showBasemapFallbackBanner(`天地图今日瓦片配额受限，已临时切换到${name}（${attr}），恢复后自动切回`, 10000);
    } else {
      showBasemapFallbackBanner('天地图底图已恢复（© 天地图 · GS(2023)336号）', 8000);
    }
  } catch (err) {}
});
