// layers.js - 在统一地图实例上叠加"文化遗产"与"改革开放事件"图层
//
// 制图升级要点：
//  · 2x HiDPI 矢量栅格化（pixelRatio: 2），在 Retina / 高分屏下边缘锐利无锯齿。
//  · 双形态图章：文化遗产采用暖白双线方印章（mk-*），改革事件采用顶部色带里程碑章（rk-*），
//    兼具色彩与造型双重可辨识性。
//  · 离线兼容的图上名称标牌（heritage-label / reform-label）：以 2x Canvas 生成带左侧色条的
//    纸质名签，icon-optional:true 智能避让，城市尺度清晰展示地标名，全国尺度自动收起不拥挤。
//  · 同址错位展开（co-location offset）：同一坐标或极近点位自动微距错位，绝不互相遮蔽。
//  · 激活态双环靶标（setActiveMarker）与悬停速览提示，打通右侧名录与地图双向联动。

import { categoryColor, categoryLabel, CATEGORIES, fetchJSON, dataUrl, escapeHtml } from './utils.js';
import { restackLayers } from './map.js';

export const REFORM_COLORS = {
  '历史转折': '#9a6a10',
  '经济特区': '#0f6e7c',
  '沿海开放': '#d0471f',
  '开发区':   '#6b4fa1',
  '入世':     '#2d6b4d',
  '制度创新': '#a3345c',
  '自贸区':   '#1f5f9e',
};

function reformColor(t) { return REFORM_COLORS[t] || '#888888'; }

function mapReady(map) {
  if (!map || map._wbRemoved) return false;
  if (map.style === undefined) return false;
  try {
    return !map.isStyleLoaded || map.isStyleLoaded();
  } catch (e) {
    return false;
  }
}

/* ---------------- 2x HiDPI 类别语义矢量图标（离线可用） ---------------- */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, alpha) {
  const m = String(hex || '').replace('#', '');
  if (m.length !== 6) return `rgba(9,11,17,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// size 为物理像素（72px @ pixelRatio=2 → 地图逻辑尺寸 36×36 CSS px）
function makeChip(drawGlyph, color, variant = 'heritage', size = 72) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  const p = 7;
  const box = size - p * 2;
  const r = variant === 'reform' ? 6 : 10;

  // 柔和制图投影，让图标从底图道路网中浮出
  ctx.save();
  ctx.shadowColor = 'rgba(9, 11, 17, 0.24)';
  ctx.shadowBlur = 7;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 2.5;
  roundRect(ctx, p, p, box, box, r);
  ctx.fillStyle = '#fffdf9';
  ctx.fill();
  ctx.restore();

  if (variant === 'reform') {
    // 改革事件：顶部彩色眉带 + 暖底里程碑章
    ctx.save();
    roundRect(ctx, p, p, box, box, r);
    ctx.clip();
    ctx.fillStyle = hexToRgba(color, 0.1);
    ctx.fillRect(p, p, box, box);
    ctx.fillStyle = color;
    ctx.fillRect(p, p, box, 6.5);
    ctx.restore();

    roundRect(ctx, p, p, box, box, r);
    ctx.lineWidth = 2.8;
    ctx.strokeStyle = color;
    ctx.stroke();
  } else {
    // 文化遗产：外层主色框 + 内层细线印章框
    roundRect(ctx, p, p, box, box, r);
    ctx.lineWidth = 3.0;
    ctx.strokeStyle = color;
    ctx.stroke();

    roundRect(ctx, p + 4, p + 4, box - 8, box - 8, Math.max(3, r - 3));
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hexToRgba(color, 0.28);
    ctx.stroke();
  }

  ctx.save();
  if (variant === 'reform') ctx.translate(0, 2);
  drawGlyph(ctx, size, color);
  ctx.restore();
  return ctx.getImageData(0, 0, size, size);
}

function strokeIcon(ctx, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function star(ctx, cx, cy, R, r, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const ang = (Math.PI / points) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

const GLYPH = {
  building(ctx, s, color) {
    strokeIcon(ctx, color);
    ctx.beginPath();
    ctx.moveTo(s * 0.25, s * 0.43); ctx.lineTo(s * 0.5, s * 0.27); ctx.lineTo(s * 0.75, s * 0.43);
    ctx.moveTo(s * 0.3, s * 0.47); ctx.lineTo(s * 0.3, s * 0.71); ctx.lineTo(s * 0.7, s * 0.71); ctx.lineTo(s * 0.7, s * 0.47);
    for (const x of [s * 0.39, s * 0.5, s * 0.61]) { ctx.moveTo(x, s * 0.5); ctx.lineTo(x, s * 0.71); }
    ctx.stroke();
  },
  port(ctx, s, color) {
    strokeIcon(ctx, color);
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.31, s * 0.055, 0, Math.PI * 2);
    ctx.moveTo(s * 0.5, s * 0.37); ctx.lineTo(s * 0.5, s * 0.71);
    ctx.moveTo(s * 0.36, s * 0.45); ctx.lineTo(s * 0.64, s * 0.45);
    ctx.moveTo(s * 0.31, s * 0.6); ctx.quadraticCurveTo(s * 0.5, s * 0.8, s * 0.69, s * 0.6);
    ctx.stroke();
  },
  trade(ctx, s, color) {
    strokeIcon(ctx, color);
    for (const [x, y, r] of [[0.39, 0.41, 0.1], [0.61, 0.41, 0.1], [0.5, 0.6, 0.1]]) {
      ctx.beginPath(); ctx.arc(s * x, s * y, s * r, 0, Math.PI * 2); ctx.stroke();
    }
  },
  industry(ctx, s, color) {
    strokeIcon(ctx, color);
    ctx.beginPath();
    ctx.moveTo(s * 0.25, s * 0.72); ctx.lineTo(s * 0.25, s * 0.51); ctx.lineTo(s * 0.38, s * 0.43); ctx.lineTo(s * 0.38, s * 0.52);
    ctx.lineTo(s * 0.51, s * 0.44); ctx.lineTo(s * 0.51, s * 0.53); ctx.lineTo(s * 0.63, s * 0.46); ctx.lineTo(s * 0.63, s * 0.72); ctx.closePath();
    ctx.moveTo(s * 0.7, s * 0.32); ctx.lineTo(s * 0.7, s * 0.72);
    ctx.moveTo(s * 0.25, s * 0.72); ctx.lineTo(s * 0.74, s * 0.72);
    ctx.stroke();
  },
  district(ctx, s, color) {
    strokeIcon(ctx, color);
    for (const x of [s * 0.26, s * 0.52]) {
      ctx.beginPath();
      ctx.moveTo(x, s * 0.47); ctx.lineTo(x + s * 0.11, s * 0.35); ctx.lineTo(x + s * 0.22, s * 0.47);
      ctx.moveTo(x, s * 0.47); ctx.lineTo(x, s * 0.71); ctx.lineTo(x + s * 0.22, s * 0.71); ctx.lineTo(x + s * 0.22, s * 0.47);
      ctx.moveTo(x + s * 0.09, s * 0.6); ctx.lineTo(x + s * 0.09, s * 0.71);
      ctx.stroke();
    }
  },
  ruins(ctx, s, color) {
    strokeIcon(ctx, color);
    for (const x of [s * 0.32, s * 0.5, s * 0.68]) { ctx.beginPath(); ctx.moveTo(x, s * 0.45); ctx.lineTo(x, s * 0.67); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(s * 0.26, s * 0.39); ctx.lineTo(s * 0.74, s * 0.39);
    ctx.moveTo(s * 0.26, s * 0.72); ctx.lineTo(s * 0.74, s * 0.72);
    ctx.moveTo(s * 0.26, s * 0.32); ctx.lineTo(s * 0.43, s * 0.32);
    ctx.moveTo(s * 0.57, s * 0.32); ctx.lineTo(s * 0.74, s * 0.32);
    ctx.stroke();
  },
};

const RGLYPH = {
  '历史转折': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.beginPath();
    ctx.moveTo(s * 0.35, s * 0.28); ctx.lineTo(s * 0.35, s * 0.73);
    ctx.moveTo(s * 0.35, s * 0.31); ctx.lineTo(s * 0.67, s * 0.39); ctx.lineTo(s * 0.35, s * 0.49); ctx.closePath();
    ctx.stroke();
  },
  '经济特区': (ctx, s, color) => { ctx.fillStyle = color; star(ctx, s / 2, s / 2, s * 0.2, s * 0.09, 5); },
  '沿海开放': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.beginPath();
    ctx.moveTo(s * 0.5, s * 0.29); ctx.lineTo(s * 0.5, s * 0.57);
    ctx.moveTo(s * 0.5, s * 0.31); ctx.lineTo(s * 0.67, s * 0.53); ctx.lineTo(s * 0.5, s * 0.53); ctx.closePath();
    ctx.moveTo(s * 0.28, s * 0.61); ctx.lineTo(s * 0.72, s * 0.61); ctx.lineTo(s * 0.65, s * 0.7); ctx.lineTo(s * 0.35, s * 0.7); ctx.closePath();
    ctx.moveTo(s * 0.28, s * 0.77); ctx.quadraticCurveTo(s * 0.5, s * 0.7, s * 0.72, s * 0.77);
    ctx.stroke();
  },
  '开发区': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.lineWidth = 2.8;
    for (const [x, y, w, h] of [[0.27, 0.49, 0.13, 0.23], [0.44, 0.38, 0.15, 0.34], [0.63, 0.52, 0.11, 0.2]]) {
      ctx.strokeRect(x * s, y * s, w * s, h * s);
    }
  },
  '入世': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.beginPath(); ctx.arc(s * 0.5, s * 0.5, s * 0.22, 0, Math.PI * 2);
    ctx.ellipse(s * 0.5, s * 0.5, s * 0.11, s * 0.22, 0, 0, Math.PI * 2);
    ctx.moveTo(s * 0.28, s * 0.5); ctx.lineTo(s * 0.72, s * 0.5);
    ctx.stroke();
  },
  // 制度创新：钥匙（土地拍卖、证券交易所、中外合作等"第一次"）
  '制度创新': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.beginPath(); ctx.arc(s * 0.37, s * 0.5, s * 0.11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s * 0.48, s * 0.5); ctx.lineTo(s * 0.74, s * 0.5);
    ctx.moveTo(s * 0.66, s * 0.5); ctx.lineTo(s * 0.66, s * 0.6);
    ctx.moveTo(s * 0.74, s * 0.5); ctx.lineTo(s * 0.74, s * 0.62);
    ctx.stroke();
  },
  // 自贸区：带闸口的方框（海关监管区）
  '自贸区': (ctx, s, color) => {
    strokeIcon(ctx, color);
    ctx.strokeRect(s * 0.28, s * 0.3, s * 0.44, s * 0.4);
    ctx.beginPath();
    ctx.moveTo(s * 0.28, s * 0.5); ctx.lineTo(s * 0.44, s * 0.5);
    ctx.moveTo(s * 0.56, s * 0.5); ctx.lineTo(s * 0.72, s * 0.5);
    ctx.moveTo(s * 0.5, s * 0.36); ctx.lineTo(s * 0.5, s * 0.64);
    ctx.stroke();
  },
};

// 生成 2x HiDPI 地图纸质标牌（带左侧类别色条与细黑框，离线零字体依赖）
function makeLabelCallout(text, color) {
  const ratio = 2;
  const label = String(text || '').length > 14 ? String(text).slice(0, 13) + '…' : String(text || '');
  const fs = 11.5 * ratio;
  const padX = 8 * ratio;
  const barW = 3.5 * ratio;
  const h = 23 * ratio;
  const margin = 2 * ratio;

  const c = document.createElement('canvas');
  let ctx = c.getContext('2d');
  const font = `600 ${fs}px "Noto Sans SC","Source Sans 3","PingFang SC","Microsoft YaHei",sans-serif`;
  ctx.font = font;
  const tw = Math.ceil(ctx.measureText(label).width);
  const boxW = barW + padX * 2 + tw;
  c.width = boxW + margin * 2;
  c.height = h + margin * 2;

  ctx = c.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(9, 11, 17, 0.16)';
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 1.5;
  ctx.fillStyle = 'rgba(255, 253, 249, 0.95)';
  ctx.fillRect(margin, margin, boxW, h);
  ctx.restore();

  ctx.fillStyle = color;
  ctx.fillRect(margin, margin, barW, h);

  ctx.lineWidth = 1.2 * ratio;
  ctx.strokeStyle = 'rgba(9, 11, 17, 0.45)';
  ctx.strokeRect(margin, margin, boxW, h);

  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#090b11';
  ctx.fillText(label, margin + barW + padX, margin + h / 2 + 0.5);

  return { image: ctx.getImageData(0, 0, c.width, c.height), ratio };
}

const _iconUrlCache = new Map();
export function markerIconDataURL(name) {
  if (_iconUrlCache.has(name)) return _iconUrlCache.get(name);
  let imageData = null;
  if (name.startsWith('mk-')) {
    const k = name.slice(3);
    imageData = makeChip(GLYPH[k] || GLYPH.building, (CATEGORIES[k] || {}).color || '#9a6a10', 'heritage');
  } else if (name.startsWith('rk-')) {
    const t = name.slice(3);
    imageData = makeChip(RGLYPH[t] || GLYPH.building, REFORM_COLORS[t] || '#888888', 'reform');
  } else {
    return '';
  }
  try {
    const c = document.createElement('canvas');
    c.width = imageData.width; c.height = imageData.height;
    c.getContext('2d').putImageData(imageData, 0, 0);
    const url = c.toDataURL('image/png');
    _iconUrlCache.set(name, url);
    return url;
  } catch (e) {
    return '';
  }
}

export function ensureMarkerImages(map) {
  if (!map || !map.addImage) return;
  const addImg = (id, imgData, ratio = 2) => {
    if (map.hasImage && map.hasImage(id)) return;
    try { map.addImage(id, imgData, { pixelRatio: ratio }); } catch (e) {}
  };
  Object.entries(CATEGORIES).forEach(([k, c]) => addImg('mk-' + k, makeChip(GLYPH[k] || GLYPH.building, c.color, 'heritage'), 2));
  Object.entries(REFORM_COLORS).forEach(([t, c]) => addImg('rk-' + t, makeChip(RGLYPH[t] || GLYPH.building, c, 'reform'), 2));
  addImg('sel', makeChip((ctx, s) => { ctx.fillStyle = '#bf3718'; star(ctx, s / 2, s / 2, s * 0.2, s * 0.09, 4); }, '#bf3718', 'heritage'), 2);
  map.__wbMarkersAdded = true;
}

function ensureLabelImage(map, id, text, color) {
  if (!map || !map.addImage) return;
  if (map.hasImage && map.hasImage(id)) return;
  try {
    const sp = makeLabelCallout(text, color);
    map.addImage(id, sp.image, { pixelRatio: sp.ratio });
  } catch (e) {}
}

/* ---------------- 同址/极近点位自动微距错位（使用标量 _slot，避免 geojson-vt 数组序列化失效） ---------------- */
// _slot 含义：
//   0: 单点默认（图章居中 [0,0]，标牌居右 anchor='left' [23,0]）
//   1: 同簇西南/左上槽位（图章 [-12,8]，标牌居左 anchor='right' [-35,8]）
//   2: 同簇东北/右下槽位（图章 [12,-8]，标牌居右 anchor='left' [35,-8]）
//   3: 同簇第三槽位（图章 [15,13]，标牌居右 anchor='left' [38,13]）
//   4: 同簇第四槽位（图章 [-15,-13]，标牌居左 anchor='right' [-38,-13]）
//   5: 单点左侧标牌槽位（东侧同纬度邻近有另一要素时，图章不偏移 [0,0]，标牌自动翻至左侧 [-23,0]）
const SYMBOL_OFFSET_EXPR = [
  'match', ['coalesce', ['get', '_slot'], 0],
  1, ['literal', [-12, 8]],
  2, ['literal', [12, -8]],
  3, ['literal', [15, 13]],
  4, ['literal', [-15, -13]],
  ['literal', [0, 0]],
];

const LABEL_ANCHOR_EXPR = [
  'match', ['coalesce', ['get', '_slot'], 0],
  [1, 4, 5], 'right',
  'left',
];

const LABEL_OFFSET_EXPR = [
  'match', ['coalesce', ['get', '_slot'], 0],
  1, ['literal', [-42, 8]],
  2, ['literal', [42, -8]],
  3, ['literal', [45, 13]],
  4, ['literal', [-45, -13]],
  5, ['literal', [-26, 0]],
  ['literal', [26, 0]],
];

function applyColocationOffsets(map) {
  if (!map) return;
  const herSrc = map.getSource && map.getSource('heritage');
  const refSrc = map.getSource && map.getSource('reform');
  const hFeats = (map.__wbHerData && map.__wbHerData.features) || [];
  const rFeats = (map.__wbRefData && map.__wbRefData.features) || [];
  const all = [
    ...hFeats.map((f) => ({ kind: 'h', f, c: f.geometry && f.geometry.coordinates })),
    ...rFeats.map((f) => ({ kind: 'r', f, c: f.geometry && f.geometry.coordinates })),
  ].filter((x) => Array.isArray(x.c));

  // 将距离 < 0.0085°（约 880m）的相邻要素归入同一簇，按西南→东北稳定排序后分配标量槽位
  const visited = new Set();
  for (let i = 0; i < all.length; i++) {
    if (visited.has(i)) continue;
    const group = [i];
    for (let j = i + 1; j < all.length; j++) {
      if (visited.has(j)) continue;
      const dx = all[i].c[0] - all[j].c[0];
      const dy = all[i].c[1] - all[j].c[1];
      if (Math.hypot(dx, dy) < 0.0085) {
        group.push(j);
        visited.add(j);
      }
    }
    visited.add(i);
    if (group.length === 1) {
      const self = all[i];
      // 若东侧 0.068° 内、纬度差 < 0.016° 存在邻近要素，且西侧无紧邻要素，则标牌翻向西侧避免遮挡东侧图章
      let hasEastNeighbor = false;
      let hasWestNeighbor = false;
      for (let k = 0; k < all.length; k++) {
        if (k === i) continue;
        const dlng = all[k].c[0] - self.c[0];
        const dlat = Math.abs(all[k].c[1] - self.c[1]);
        if (dlat < 0.016 && dlng > 0.008 && dlng < 0.068) hasEastNeighbor = true;
        if (dlat < 0.016 && dlng < -0.008 && dlng > -0.068) hasWestNeighbor = true;
      }
      self.f.properties._slot = (hasEastNeighbor && !hasWestNeighbor) ? 5 : 0;
    } else {
      group.sort((a, b) => (all[a].c[0] + all[a].c[1]) - (all[b].c[0] + all[b].c[1]));
      group.forEach((idx, gIdx) => {
        all[idx].f.properties._slot = (gIdx % 4) + 1;
      });
    }
  }
  if (herSrc && map.__wbHerData) {
    try { herSrc.setData(map.__wbHerData); } catch (e) {}
  }
  if (refSrc && map.__wbRefData) {
    try { refSrc.setData(map.__wbRefData); } catch (e) {}
  }
}

/* ---------------- 激活态靶标环（打通名录与地图双向视觉锚点） ---------------- */
const EMPTY_FC = { type: 'FeatureCollection', features: [] };

export function setActiveMarker(map, coords, color = '#bf3718') {
  if (!mapReady(map)) return;
  const fc = Array.isArray(coords) && coords.length >= 2
    ? {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { color }, geometry: { type: 'Point', coordinates: coords } }],
    }
    : EMPTY_FC;
  if (!map.getSource('active-pin-src')) {
    map.addSource('active-pin-src', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'active-pin-halo',
      type: 'circle',
      source: 'active-pin-src',
      paint: {
        'circle-radius': 26,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.18,
        'circle-blur': 0.25,
      },
    });
    map.addLayer({
      id: 'active-pin-ring',
      type: 'circle',
      source: 'active-pin-src',
      paint: {
        'circle-radius': 21,
        'circle-color': 'rgba(255, 253, 249, 0.35)',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': 2.2,
      },
    });
  } else {
    map.getSource('active-pin-src').setData(fc);
  }
  restackLayers(map);
}

/* ---------------- 悬停轻量提示框 ---------------- */
let _hoverTip = null;
function bindHoverPreview(map, layerId, formatHtml) {
  map.on('mouseenter', layerId, (e) => {
    map.getCanvas().style.cursor = 'pointer';
    if (!e.features || !e.features.length) return;
    const feat = e.features[0];
    const coords = (feat.geometry && feat.geometry.coordinates) || [e.lngLat.lng, e.lngLat.lat];
    if (_hoverTip) { try { _hoverTip.remove(); } catch (err) {} }
    _hoverTip = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 20,
      maxWidth: '240px',
      className: 'map-hover-popup',
    })
      .setLngLat(coords)
      .setHTML(formatHtml(feat.properties || {}))
      .addTo(map);
  });
  map.on('mouseleave', layerId, () => {
    map.getCanvas().style.cursor = '';
    if (_hoverTip) { try { _hoverTip.remove(); } catch (err) {} _hoverTip = null; }
  });
}

/* ---------------- 选中区域真实轮廓（省界 polygon） ---------------- */
export async function highlightRegion(map, lngLat, color, prefix = 'sel') {
  if (!mapReady(map)) return;
  if (!map.getSource('provinces')) return;
  let provData = map.getSource('provinces')._data;
  if (!provData || !provData.features) {
    try { provData = await fetchJSON(dataUrl('china-provinces.geojson')); } catch (e) { return; }
  }
  const pt = [lngLat.lng, lngLat.lat];
  let feat = null;
  for (const f of (provData.features || [])) {
    try { if (turf.booleanPointInPolygon(pt, f)) { feat = f; break; } } catch (e) {}
  }
  const srcId = prefix + '-region-src';
  const fc = feat ? { type: 'FeatureCollection', features: [feat] } : EMPTY_FC;
  if (!map.getSource(srcId)) map.addSource(srcId, { type: 'geojson', data: fc });
  else map.getSource(srcId).setData(fc);

  if (!map.getLayer(prefix + '-region-fill')) {
    map.addLayer({ id: prefix + '-region-fill', type: 'fill', source: srcId, paint: { 'fill-color': color, 'fill-opacity': 0.16 } });
  } else {
    map.setPaintProperty(prefix + '-region-fill', 'fill-color', color);
  }
  if (!map.getLayer(prefix + '-region-line')) {
    map.addLayer({ id: prefix + '-region-line', type: 'line', source: srcId, paint: { 'line-color': color, 'line-width': 2.4, 'line-opacity': 0.95 } });
  } else {
    map.setPaintProperty(prefix + '-region-line', 'line-color', color);
  }
  restackLayers(map);
}

export function clearRegion(map, prefix = 'sel') {
  if (!map) return;
  if (map.getLayer(prefix + '-region-fill')) map.removeLayer(prefix + '-region-fill');
  if (map.getLayer(prefix + '-region-line')) map.removeLayer(prefix + '-region-line');
  if (map.getSource(prefix + '-region-src')) map.removeSource(prefix + '-region-src');
}

/* ---------------- 文化遗产点（2x 印章图标 + 图上名称签） ---------------- */
let _heritageAll = null;
function buildHeritageData(map, features) {
  return {
    type: 'FeatureCollection',
    features: features.map((f, idx) => {
      const p = f.properties || {};
      const col = categoryColor(p.category);
      const lblId = 'hlbl-' + (p.id || idx);
      ensureLabelImage(map, lblId, p.name || '', col);
      return {
        ...f,
        properties: {
          ...p,
          color: col,
          _lbl: lblId,
          _slot: 0,
        },
      };
    }),
  };
}

export function addHeritagePoints(map, features, { onClick } = {}) {
  ensureMarkerImages(map);
  _heritageAll = features;
  const data = buildHeritageData(map, features);
  map.__wbHerData = data;
  if (!map.getSource('heritage')) {
    map.addSource('heritage', { type: 'geojson', data });
  } else {
    map.getSource('heritage').setData(data);
  }

  const allowOverlap = features.length <= 25;
  if (!map.getLayer('heritage-symbol')) {
    map.addLayer({
      id: 'heritage-symbol',
      type: 'symbol',
      source: 'heritage',
      layout: {
        'icon-image': ['concat', 'mk-', ['get', 'category']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.72, 7, 0.92, 11, 1.06, 14, 1.2],
        'icon-offset': SYMBOL_OFFSET_EXPR,
        'icon-allow-overlap': allowOverlap,
        'icon-ignore-placement': false,
        'icon-padding': 1,
      },
      paint: { 'icon-opacity': 0.99 },
    });
  }
  if (!map.getLayer('heritage-label')) {
    map.addLayer({
      id: 'heritage-label',
      type: 'symbol',
      source: 'heritage',
      minzoom: 9.2,
      layout: {
        'icon-image': ['get', '_lbl'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9.2, 0.92, 11, 1.0, 14, 1.06],
        'icon-anchor': LABEL_ANCHOR_EXPR,
        'icon-offset': LABEL_OFFSET_EXPR,
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-padding': 1,
      },
      paint: { 'icon-opacity': 0.97 },
    });
  }

  applyColocationOffsets(map);

  const fmtHover = (p) =>
    `<div class="popup-kicker">${escapeHtml(categoryLabel(p.category))}${p.period ? ' · ' + escapeHtml(p.period) : ''}</div><div class="popup-title">${escapeHtml(p.name || '')}</div>`;

  ['heritage-symbol', 'heritage-label'].forEach((lid) => {
    map.off('click', lid);
    map.off('mouseenter', lid);
    map.off('mouseleave', lid);
    if (onClick) {
      map.on('click', lid, (e) => {
        if (_hoverTip) { try { _hoverTip.remove(); } catch (err) {} _hoverTip = null; }
        onClick(e.features[0].properties, e.lngLat, e.features[0].geometry.coordinates);
      });
    }
    bindHoverPreview(map, lid, fmtHover);
  });

  restackLayers(map);
  return data;
}

export function setHeritageFilter(map, activeCats) {
  if (!mapReady(map) || !_heritageAll) return;
  const sub = (activeCats && activeCats.length)
    ? _heritageAll.filter((f) => activeCats.includes(f.properties.category))
    : [];
  const data = buildHeritageData(map, sub);
  map.__wbHerData = data;
  if (map.getSource('heritage')) map.getSource('heritage').setData(data);
  applyColocationOffsets(map);
}

export function setHeritageVisible(map, visible) {
  if (!mapReady(map)) return;
  const v = visible ? 'visible' : 'none';
  if (map.getLayer('heritage-symbol')) map.setLayoutProperty('heritage-symbol', 'visibility', v);
  if (map.getLayer('heritage-label')) map.setLayoutProperty('heritage-label', 'visibility', v);
}

/* ---------------- 改革开放事件点（2x 里程碑章 + 图上名称签） ---------------- */
let _reformAll = null;
function buildReformData(map, events) {
  return {
    type: 'FeatureCollection',
    features: events.map((e, idx) => {
      const col = reformColor(e.type);
      const lblId = 'rlbl-' + (e.id || idx);
      const shortTitle = `${e.year ? e.year + ' ' : ''}${e.title || ''}`;
      ensureLabelImage(map, lblId, shortTitle, col);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: e.coordinates },
        properties: {
          ...e,
          color: col,
          _lbl: lblId,
          _slot: 0,
        },
      };
    }),
  };
}

export function addReformPoints(map, events, { onClick } = {}) {
  ensureMarkerImages(map);
  _reformAll = events;
  const data = buildReformData(map, events);
  map.__wbRefData = data;
  if (!map.getSource('reform')) {
    map.addSource('reform', { type: 'geojson', data });
  } else {
    map.getSource('reform').setData(data);
  }

  const allowOverlap = events.length <= 25;
  if (!map.getLayer('reform-symbol')) {
    map.addLayer({
      id: 'reform-symbol',
      type: 'symbol',
      source: 'reform',
      layout: {
        'icon-image': ['concat', 'rk-', ['get', 'type']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 3, 0.7, 7, 0.9, 11, 1.04, 14, 1.16],
        'icon-offset': SYMBOL_OFFSET_EXPR,
        'icon-allow-overlap': allowOverlap,
        'icon-ignore-placement': false,
        'icon-padding': 1,
      },
      paint: { 'icon-opacity': 0.98 },
    });
  }
  if (!map.getLayer('reform-label')) {
    map.addLayer({
      id: 'reform-label',
      type: 'symbol',
      source: 'reform',
      minzoom: 9.2,
      layout: {
        'icon-image': ['get', '_lbl'],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 9.2, 0.9, 11, 0.98, 14, 1.04],
        'icon-anchor': LABEL_ANCHOR_EXPR,
        'icon-offset': LABEL_OFFSET_EXPR,
        'icon-allow-overlap': false,
        'icon-ignore-placement': false,
        'icon-padding': 1,
      },
      paint: { 'icon-opacity': 0.96 },
    });
  }

  applyColocationOffsets(map);

  const fmtHover = (p) =>
    `<div class="popup-kicker">${escapeHtml(p.type || '改革事件')}${p.year ? ' · ' + escapeHtml(String(p.year)) : ''}</div><div class="popup-title">${escapeHtml(p.title || '')}</div>`;

  ['reform-symbol', 'reform-label'].forEach((lid) => {
    map.off('click', lid);
    map.off('mouseenter', lid);
    map.off('mouseleave', lid);
    if (onClick) {
      map.on('click', lid, (e) => {
        if (_hoverTip) { try { _hoverTip.remove(); } catch (err) {} _hoverTip = null; }
        onClick(e.features[0].properties, e.lngLat, e.features[0].geometry.coordinates);
      });
    }
    bindHoverPreview(map, lid, fmtHover);
  });

  restackLayers(map);
  return data;
}

export function setReformYear(map, year) {
  if (!mapReady(map) || !_reformAll) return;
  const sub = _reformAll.filter((e) => e.year <= year);
  const data = buildReformData(map, sub);
  map.__wbRefData = data;
  if (map.getSource('reform')) map.getSource('reform').setData(data);
  applyColocationOffsets(map);
}

export function setReformVisible(map, visible) {
  if (!mapReady(map)) return;
  const v = visible ? 'visible' : 'none';
  if (map.getLayer('reform-symbol')) map.setLayoutProperty('reform-symbol', 'visibility', v);
  if (map.getLayer('reform-label')) map.setLayoutProperty('reform-label', 'visibility', v);
}

/* ---------------- 弹出气泡 ---------------- */
let _activePopup = null;
export function closePopup() {
  if (_activePopup) {
    try { _activePopup.remove(); } catch (e) {}
    _activePopup = null;
  }
}
export function showPopup(map, lngLat, html, opts = {}) {
  closePopup();
  const popupOpts = {
    closeButton: true,
    closeOnClick: opts.closeOnClick ?? true,
    offset: opts.offset ?? 16,
    focusAfterOpen: false,
    maxWidth: opts.maxWidth || '272px',
    className: opts.className || '',
  };
  if (opts.anchor) popupOpts.anchor = opts.anchor;
  const popup = new maplibregl.Popup(popupOpts).setLngLat(lngLat).setHTML(html).addTo(map);
  const elRoot = popup.getElement && popup.getElement();
  if (elRoot) {
    elRoot.querySelectorAll('img[data-fallback]').forEach((img) => {
      img.addEventListener('error', () => {
        const fb = img.getAttribute('data-fallback');
        if (fb && img.src !== fb) img.src = fb;
      }, { once: true });
    });
  }
  _activePopup = popup;
  popup.on('close', () => { if (_activePopup === popup) _activePopup = null; });
  return popup;
}
