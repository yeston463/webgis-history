// analysis.js - GIS 时空分析实验室：
//  模块一：九城建成区时空卷帘对比（PostGIS ST_UnaryUnion + ST_Difference + Turf 测地计算 + 内存缓存）与扩张速率图
//  模块二：PostGIS 测地缓冲区与古今空间耦合分析（ST_Buffer + ST_DWithin + ST_Distance）
//  模块三：GeoServer (OGC WFS/WMS) 控制台与 PostGIS 在线空间入库 (ST_MakePoint)

import { bindLifecycle, restackLayers } from './map.js';
import { buildOnlineStyle, setupBasemap, bindZoomLimitControl, formatZoomReadout, basemapLabel } from './basemap.js';
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
