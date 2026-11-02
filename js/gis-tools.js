// js/gis-tools.js - WebGIS 专业交互工具集：
//  1. 交互式测地距离量算 (turf.length) 与测地面积量算 (turf.area)
//  2. PostGIS 省域密度分级统计专题图 (Choropleth Map)
//  3. 改革开放空间扩散流向轨迹图层 (Spatial Diffusion Flow)
//  4. GeoServer OGC WFS / WMS 标准图层接入

import { fetchJSON, dataUrl, formatArea, formatNumber, el, toast } from './utils.js';
import { restackLayers } from './map.js';

const EMPTY_FC = { type: 'FeatureCollection', features: [] };

/* ============================================================================
 * 1. 交互式地图量算工具（测距 / 测面）
 * ========================================================================== */

export function attachMeasureTools(container, getMap) {
  if (!container) return;
  let mode = null; // 'distance' | 'area' | null
  let pts = [];    // [[lng, lat], ...]
  let mapBound = null;

  const wrap = el('div', { class: 'lp-group' }, [
    el('div', { class: 'lp-title', text: 'GIS 量算工具' }),
  ]);

  const btnRow = el('div', { class: 'lp-basemap', style: 'gap:4px;' });
  const btnDist = el('button', { class: 'lp-btn', type: 'button', title: '在地图上点击多个点测量球面测地距离', text: '测距' });
  const btnArea = el('button', { class: 'lp-btn', type: 'button', title: '在地图上点击至少3个点测量球面测地面积', text: '测面' });
  const btnClear = el('button', { class: 'lp-btn', type: 'button', title: '清除量算图形', style: 'flex:0 0 auto;padding:4px 9px;white-space:nowrap;', text: '清除' });
  btnRow.appendChild(btnDist);
  btnRow.appendChild(btnArea);
  btnRow.appendChild(btnClear);

  const readout = el('div', {
    class: 'measure-readout',
    style: 'display:none;margin-top:6px;padding:6px 8px;background:var(--blue-pale);border:1px solid var(--blue-light);border-radius:2px;font-size:11.5px;color:var(--blue-dark);line-height:1.45;',
    text: '',
  });

  wrap.appendChild(btnRow);
  wrap.appendChild(readout);
  container.appendChild(wrap);

  function ensureMeasureLayers(map) {
    if (!map || !map.getSource) return false;
    if (!map.getSource('measure-src')) {
      map.addSource('measure-src', { type: 'geojson', data: EMPTY_FC });
    }
    if (!map.getLayer('measure-poly')) {
      map.addLayer({
        id: 'measure-poly',
        type: 'fill',
        source: 'measure-src',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#c63a18', 'fill-opacity': 0.18 },
      });
    }
    if (!map.getLayer('measure-line')) {
      map.addLayer({
        id: 'measure-line',
        type: 'line',
        source: 'measure-src',
        filter: ['in', '$type', 'LineString', 'Polygon'],
        paint: { 'line-color': '#090b11', 'line-width': 2.5, 'line-dasharray': [2, 1.5] },
      });
    }
    if (!map.getLayer('measure-pts')) {
      map.addLayer({
        id: 'measure-pts',
        type: 'circle',
        source: 'measure-src',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#c63a18',
          'circle-stroke-width': 2.2,
        },
      });
    }
    return true;
  }

  function renderGeometry() {
    const map = getMap && getMap();
    if (!map || !ensureMeasureLayers(map)) return;
    const features = pts.map((c, idx) => ({
      type: 'Feature',
      properties: { idx },
      geometry: { type: 'Point', coordinates: c },
    }));

    if (mode === 'distance' && pts.length >= 2) {
      const line = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      };
      features.push(line);
      const km = turf.length(line, { units: 'kilometers' });
      const distStr = km >= 1 ? `${formatNumber(km, 2)} km` : `${formatNumber(km * 1000, 0)} m`;
      readout.style.display = 'block';
      readout.innerHTML = `<strong>测地距离：${distStr}</strong><br><span style="color:var(--text-2);">节点数：${pts.length}（继续点击地图累加）</span>`;
    } else if (mode === 'area' && pts.length >= 3) {
      const ring = [...pts, pts[0]];
      const poly = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
      features.push(poly);
      const sqm = turf.area(poly);
      const perimKm = turf.length({ type: 'Feature', geometry: { type: 'LineString', coordinates: ring } }, { units: 'kilometers' });
      readout.style.display = 'block';
      readout.innerHTML = `<strong>测地面积：${formatArea(sqm)}</strong><br><span style="color:var(--text-2);">周长：${formatNumber(perimKm, 2)} km（${pts.length} 顶点）</span>`;
    } else if (mode === 'area' && pts.length === 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: pts },
      });
      readout.style.display = 'block';
      readout.textContent = '已选 2 个点，请再点击至少 1 个点闭合多边形…';
    } else if (mode && pts.length === 1) {
      readout.style.display = 'block';
      readout.textContent = '已选起点，请继续点击地图添加测量节点…';
    }

    map.getSource('measure-src').setData({ type: 'FeatureCollection', features });
  }

  function onMapClick(e) {
    if (!mode) return;
    pts.push([+e.lngLat.lng.toFixed(5), +e.lngLat.lat.toFixed(5)]);
    renderGeometry();
  }

  function bindMapEvents() {
    const map = getMap && getMap();
    if (!map || mapBound === map) return;
    mapBound = map;
    map.on('click', onMapClick);
  }

  function setMode(nextMode) {
    bindMapEvents();
    const map = getMap && getMap();
    if (mode === nextMode) nextMode = null;
    mode = nextMode;
    pts = [];
    btnDist.classList.toggle('active', mode === 'distance');
    btnArea.classList.toggle('active', mode === 'area');
    if (map && map.getCanvas) {
      map.getCanvas().style.cursor = mode ? 'crosshair' : '';
    }
    if (!mode) {
      readout.style.display = 'none';
      if (map && map.getSource && map.getSource('measure-src')) {
        map.getSource('measure-src').setData(EMPTY_FC);
      }
    } else {
      readout.style.display = 'block';
      readout.textContent = mode === 'distance'
        ? '测距模式：请在地图上依次点击两个或多个位置'
        : '测面模式：请在地图上依次点击至少 3 个顶点';
    }
  }

  btnDist.addEventListener('click', () => setMode('distance'));
  btnArea.addEventListener('click', () => setMode('area'));
  btnClear.addEventListener('click', () => {
    pts = [];
    setMode(null);
  });
}

/* ============================================================================
 * 2. 省域空间密度分级统计专题图 (Choropleth Map, PostGIS v_province_spatial_stats)
 * ========================================================================== */

let _choroplethData = null;

async function loadChoroplethData() {
  if (_choroplethData) return _choroplethData;
  try {
    // 优先请求 Node.js + PostGIS 空间聚合接口
    const res = await fetch('/api/spatial/provinces-stats');
    if (res.ok) {
      const d = await res.json();
      if (d && d.features && d.features.length) {
        _choroplethData = d;
        return d;
      }
    }
  } catch (e) {}

  // 静态服务下由前端 Turf 实时做 Point-in-Polygon 聚合
  const [provFc, herFc, refData] = await Promise.all([
    fetchJSON(dataUrl('china-provinces.geojson')),
    fetchJSON(dataUrl('heritage.geojson')),
    fetchJSON(dataUrl('reform-events.json')),
  ]);
  const features = (provFc.features || []).map((pf) => {
    let herCount = 0;
    let refCount = 0;
    try {
      (herFc.features || []).forEach((hf) => {
        if (hf.geometry && turf.booleanPointInPolygon(hf.geometry.coordinates, pf)) herCount++;
      });
      (refData.events || []).forEach((re) => {
        if (re.coordinates && turf.booleanPointInPolygon(re.coordinates, pf)) refCount++;
      });
    } catch (e) {}
    return {
      ...pf,
      properties: {
        ...pf.properties,
        heritage_count: herCount,
        reform_count: refCount,
        total_score: herCount + refCount,
      },
    };
  });
  _choroplethData = { type: 'FeatureCollection', features };
  return _choroplethData;
}

export async function setChoroplethVisible(map, visible, field = 'heritage_count') {
  if (!map || !map.style) return;
  if (!map.getSource('choropleth-src')) {
    const fc = await loadChoroplethData();
    if (!map.getSource('choropleth-src')) {
      map.addSource('choropleth-src', { type: 'geojson', data: fc });
    }
  }
  if (!map.getLayer('choropleth-fill')) {
    map.addLayer({
      id: 'choropleth-fill',
      type: 'fill',
      source: 'choropleth-src',
      layout: { visibility: visible ? 'visible' : 'none' },
      paint: {
        'fill-color': [
          'step',
          ['coalesce', ['get', field], 0],
          'rgba(239, 243, 255, 0.35)',
          1, 'rgba(189, 215, 231, 0.58)',
          2, 'rgba(107, 174, 214, 0.65)',
          3, 'rgba(49, 130, 189, 0.72)',
          5, 'rgba(8, 81, 156, 0.78)',
        ],
        'fill-outline-color': '#2b6cb0',
      },
    });
  } else {
    map.setPaintProperty('choropleth-fill', 'fill-color', [
      'step',
      ['coalesce', ['get', field], 0],
      'rgba(239, 243, 255, 0.35)',
      1, 'rgba(189, 215, 231, 0.58)',
      2, 'rgba(107, 174, 214, 0.65)',
      3, 'rgba(49, 130, 189, 0.72)',
      5, 'rgba(8, 81, 156, 0.78)',
    ]);
    map.setLayoutProperty('choropleth-fill', 'visibility', visible ? 'visible' : 'none');
  }
  restackLayers(map);
}

/* ============================================================================
 * 3. 改革开放空间扩散轨迹线图层 (Spatial Diffusion Flow Arcs)
 * ========================================================================== */

let _allFlowArcs = null;

function buildCurvedArc(fromCoord, toCoord, props) {
  const [x1, y1] = fromCoord;
  const [x2, y2] = toCoord;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // 法向偏移产生优美弧线
  const cx = mx - dy * 0.16;
  const cy = my + dx * 0.16;
  const coords = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x1 + 2 * u * t * cx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * cy + t * t * y2;
    coords.push([+x.toFixed(4), +y.toFixed(4)]);
  }
  return {
    type: 'Feature',
    properties: props,
    geometry: { type: 'LineString', coordinates: coords },
  };
}

export function addReformFlowLayer(map, events) {
  if (!map || !events || !events.length) return;
  const bj = [116.3974, 39.9183];
  const sz = [114.06, 22.55];
  const sh = [121.47, 31.23];

  const arcs = [];
  events.forEach((e) => {
    if (!e.coordinates) return;
    if (e.year === 1980) {
      // 1978 北京三中全会 -> 1980 四大特区
      arcs.push(buildCurvedArc(bj, e.coordinates, { year: 1980, stage: '1980 特区破冰', color: '#3da9c9' }));
    } else if (e.year === 1984) {
      // 1980 深圳特区先导 -> 1984 沿海14城开放扩散
      arcs.push(buildCurvedArc(sz, e.coordinates, { year: 1984, stage: '1984 沿海扩散', color: '#e08a3c' }));
    } else if (e.year === 1988) {
      arcs.push(buildCurvedArc(sz, e.coordinates, { year: 1988, stage: '1988 海南建省特区', color: '#3da9c9' }));
    } else if (e.year === 1990) {
      arcs.push(buildCurvedArc(bj, e.coordinates, { year: 1990, stage: '1990 浦东龙头带动', color: '#8a6fb0' }));
    } else if (e.year === 2001) {
      arcs.push(buildCurvedArc(sh, e.coordinates, { year: 2001, stage: '2001 全面入世联通', color: '#6fae6f' }));
    }
  });

  _allFlowArcs = arcs;
  const fc = { type: 'FeatureCollection', features: arcs };
  if (!map.getSource('reform-flow')) {
    map.addSource('reform-flow', { type: 'geojson', data: fc });
  } else {
    map.getSource('reform-flow').setData(fc);
  }
  if (!map.getLayer('reform-flow-line')) {
    map.addLayer({
      id: 'reform-flow-line',
      type: 'line',
      source: 'reform-flow',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2.2,
        'line-opacity': 0.72,
        'line-dasharray': [2, 1.5],
      },
    });
  }
  restackLayers(map);
}

export function setReformFlowYear(map, year) {
  if (!map || !map.style || !_allFlowArcs) return;
  const sub = _allFlowArcs.filter((a) => a.properties.year <= year);
  if (map.getSource('reform-flow')) {
    map.getSource('reform-flow').setData({ type: 'FeatureCollection', features: sub });
  }
}

export function setReformFlowVisible(map, visible) {
  if (!map || !map.style) return;
  if (map.getLayer('reform-flow-line')) {
    map.setLayoutProperty('reform-flow-line', 'visibility', visible ? 'visible' : 'none');
  }
}

/* ============================================================================
 * 4. GeoServer OGC WFS 矢量服务图层叠加
 * ========================================================================== */

export async function setGeoServerWfsVisible(map, visible, typeName = 'webgis:heritage_sites') {
  if (!map || !map.style) return;
  if (!visible) {
    if (map.getLayer('wfs-halo-layer')) {
      map.setLayoutProperty('wfs-halo-layer', 'visibility', 'none');
    }
    return;
  }
  const wfsUrl = `/geoserver/webgis/wfs?service=WFS&version=1.0.0&request=GetFeature&typeName=${encodeURIComponent(typeName)}&outputFormat=application/json&srsName=EPSG:4326`;
  let fc = null;
  try {
    const res = await fetch(wfsUrl);
    if (res.ok) fc = await res.json();
  } catch (e) {}
  if (!fc || !fc.features) {
    fc = await fetchJSON(dataUrl('heritage.geojson'));
  }

  if (!map.getSource('wfs-src')) {
    map.addSource('wfs-src', { type: 'geojson', data: fc });
  } else {
    map.getSource('wfs-src').setData(fc);
  }
  if (!map.getLayer('wfs-halo-layer')) {
    map.addLayer({
      id: 'wfs-halo-layer',
      type: 'circle',
      source: 'wfs-src',
      paint: {
        'circle-radius': 15,
        'circle-color': 'rgba(0, 122, 194, 0.14)',
        'circle-stroke-color': '#c63a18',
        'circle-stroke-width': 2,
      },
    });
  } else {
    map.setLayoutProperty('wfs-halo-layer', 'visibility', 'visible');
  }
  restackLayers(map);
  toast(`已加载 GeoServer WFS 图层 (${typeName}，共 ${fc.features.length} 个空间要素)`, 'info', 2800);
}

/* ============================================================================
 * 5. GeoServer OGC WMS 栅格瓦片服务图层叠加 (EPSG:3857)
 * ========================================================================== */

export function setGeoServerWmsVisible(map, visible, layersStr = 'webgis:china_provinces,webgis:heritage_sites') {
  if (!map || !map.style) return;
  if (!visible) {
    if (map.getLayer('gs-wms-layer')) {
      map.setLayoutProperty('gs-wms-layer', 'visibility', 'none');
    }
    return;
  }
  const wmsTileTemplate = `/geoserver/webgis/wms?service=WMS&version=1.1.1&request=GetMap&layers=${encodeURIComponent(layersStr)}&styles=&bbox={bbox-epsg-3857}&width=256&height=256&srs=EPSG:3857&format=image/png&transparent=true`;
  if (!map.getSource('gs-wms-src')) {
    map.addSource('gs-wms-src', {
      type: 'raster',
      tiles: [wmsTileTemplate],
      tileSize: 256,
    });
  }
  if (!map.getLayer('gs-wms-layer')) {
    map.addLayer({
      id: 'gs-wms-layer',
      type: 'raster',
      source: 'gs-wms-src',
      paint: { 'raster-opacity': 0.72 },
    });
  } else {
    map.setLayoutProperty('gs-wms-layer', 'visibility', 'visible');
  }
  restackLayers(map);
  toast(`已加载 GeoServer WMS 服务图层 (${layersStr})`, 'info', 2600);
}
