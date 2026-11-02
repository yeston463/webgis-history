// cities.js - 四城记忆页逻辑（含历史地标、改革事件、地图双向联动靶标、1980-2020 人口与 GDP 双轴图）
import { createMap, whenReady, flyToCity, flyTo, getOpticalPadding, bindLifecycle, attachStatusBar } from './map.js';
import { addHeritagePoints, addReformPoints, setActiveMarker, REFORM_COLORS, markerIconDataURL } from './layers.js';
import { initLayerPanel } from './layerpanel.js';
import { createChart, dualAxisCityOption } from './charts.js';
import {
  categoryColor, categoryLabel, fetchJSON, el, loadImage, dataUrl, guardFileProtocol, placeholderDataURI,
  normalizeSourceUrl, isBaikeUrl, assetUrl, escapeHtml, formatNumber,
} from './utils.js';

let MAP = null;
let CITIES = [], HERITAGE = [], REFORM = [], CITY_STATS = {};
let current = 'shenzhen';

/* ---------------- 富信息卡片（主图 + 简介 + 影像画廊 + 百科） ---------------- */
function richPlaceCard(p) {
  const img = assetUrl(p.image);
  const gal = Array.isArray(p.gallery) ? p.gallery.filter(Boolean).slice(0, 4) : [];
  const tags = [
    `<span class="tag tag-blue">${escapeHtml(categoryLabel(p.category))}</span>`,
    p.period ? `<span class="tag">${escapeHtml(p.period)}</span>` : '',
    p.city ? `<span class="tag">${escapeHtml(p.city)}</span>` : '',
  ].join('');
  const gallery = gal.length
    ? `<div class="rc-gallery">${gal.map((g) => `<img src="${assetUrl(g)}" alt="">`).join('')}</div>`
    : '';
  const baike = p.sourceUrl
    ? `<a class="rc-baike" href="${normalizeSourceUrl(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">${isBaikeUrl(p.sourceUrl) ? '在百度百科查看「' + escapeHtml(p.name) + '」' : '查看资料出处'}</a>`
    : '';
  return `<div class="rc-card">
    ${img ? `<img class="rc-img" src="${img}" alt="${escapeHtml(p.name)}实景照片">` : ''}
    <div class="rc-body">
      <div class="rc-tags">${tags}</div>
      <h3 class="rc-title">${escapeHtml(p.name)}</h3>
      <p class="rc-desc">${escapeHtml(p.description || '')}</p>
      ${gallery}
      ${baike}
    </div>
  </div>`;
}

function richReformCard(e) {
  const img = assetUrl(e.image);
  const tags = [
    `<span class="tag tag-blue">${escapeHtml(e.type || '事件')}</span>`,
    e.year ? `<span class="tag">${e.year}</span>` : '',
    e.city ? `<span class="tag">${escapeHtml(e.city)}</span>` : '',
  ].join('');
  const baike = e.sourceUrl
    ? `<a class="rc-baike" href="${normalizeSourceUrl(e.sourceUrl)}" target="_blank" rel="noopener noreferrer">${isBaikeUrl(e.sourceUrl) ? '在百度百科查看「' + escapeHtml(e.title || e.city || '改革事件') + '」' : '查看资料出处'}</a>`
    : '';
  return `<div class="rc-card">
    ${img ? `<img class="rc-img" src="${img}" alt="${escapeHtml(e.title || '')}历史与城市影像">` : ''}
    <div class="rc-body">
      <div class="rc-tags">${tags}</div>
      <h3 class="rc-title">${escapeHtml(e.title || e.name || '')}</h3>
      ${e.description ? `<p class="rc-desc">${escapeHtml(e.description)}${e.significance ? ' ' + escapeHtml(e.significance) : ''}</p>` : ''}
      ${baike}
    </div>
  </div>`;
}

/* ---------------- 地图右上图版铭牌 ---------------- */
function updateCityMapBadge(city, herCount, refCount) {
  const root = document.getElementById('map-root');
  if (!root || !city) return;
  let badge = document.getElementById('city-map-badge');
  if (!badge) {
    badge = el('div', { id: 'city-map-badge', class: 'map-plate-badge', 'aria-hidden': 'true' });
    root.appendChild(badge);
  }
  badge.innerHTML = `
    <span class="mpb-city">${escapeHtml(city.name)}</span>
    <span class="mpb-en">${escapeHtml(city.en || '')}</span>
    <span class="mpb-sep">·</span>
    <span class="mpb-meta">${herCount} 处历史地标 / ${refCount} 起改革事件</span>`;
}

function setSidebarActiveItem(nodeId) {
  document.querySelectorAll('#city-detail .place-item').forEach((btn) => {
    btn.classList.toggle('is-active', Boolean(nodeId && btn.dataset.nodeId === nodeId));
  });
}

/* ---------------- 富卡片浮层（独立 DOM 浮在地图上，自动避让左上角图层面板与选中点） ---------------- */
let _overlay = null;
let _overlayReturnFocus = null;
function ensureOverlay() {
  if (_overlay) return _overlay;
  const root = document.getElementById('map-root');
  if (!root) return null;
  _overlay = el('div', {
    class: 'rich-overlay',
    role: 'dialog',
    'aria-label': '地标档案',
  });
  root.appendChild(_overlay);
  return _overlay;
}

function focusNodeOnMap({ id, coords, color, html, pan = false }) {
  if (!Array.isArray(coords) || coords.length < 2) return;
  setSidebarActiveItem(id);
  if (MAP) {
    setActiveMarker(MAP, coords, color || '#bf3718');
    if (pan) {
      const city = CITIES.find((c) => c.key === current) || CITIES[0];
      const targetZoom = Math.max(MAP.getZoom() || 10.5, ((city && city.zoom) || 10.6) + 0.35);
      const pad = getOpticalPadding(MAP);
      // 卡片浮层宽约 320px，将镜头内边距微调使地标落在右侧或左侧净区，不与浮层互相遮盖
      flyTo({
        center: coords,
        zoom: Math.min(13.2, targetZoom),
        padding: { ...pad, right: Math.max(pad.right, 160) },
        duration: 720,
      });
    }
  }
  showRichCard({ lng: coords[0], lat: coords[1] }, html);
}

function showRichCard(lngLat, html) {
  const o = ensureOverlay();
  if (!o) return;
  _overlayReturnFocus = document.activeElement;
  o.innerHTML = html + '<button class="ro-close" type="button" aria-label="关闭">×</button>';
  const close = o.querySelector('.ro-close');
  close.addEventListener('click', hideRichCard);
  o.onkeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideRichCard();
    }
  };
  o._lngLat = Array.isArray(lngLat) ? { lng: lngLat[0], lat: lngLat[1] } : lngLat;
  o.classList.add('show');
  positionOverlay();
  requestAnimationFrame(() => { try { close.focus({ preventScroll: true }); } catch (e) {} });
}

function hideRichCard() {
  if (_overlay) {
    _overlay.classList.remove('show');
    _overlay._lngLat = null;
  }
  setSidebarActiveItem(null);
  if (MAP) setActiveMarker(MAP, null);
  const back = _overlayReturnFocus;
  _overlayReturnFocus = null;
  if (back && back.isConnected) {
    try { back.focus({ preventScroll: true }); } catch (e) {}
  }
}

function positionOverlay() {
  const o = _overlay;
  if (!o || !o.classList.contains('show') || !o._lngLat || !MAP) return;
  const root = document.getElementById('map-root');
  if (!root) return;
  const mr = root.getBoundingClientRect();
  const pr = MAP.project(o._lngLat);
  const cw = o.offsetWidth || 320;
  const ch = o.offsetHeight || 320;
  const gap = 24;
  // 计算左上角图层面板安全边界，折叠时仅需避让小按钮
  const lp = document.getElementById('layer-panel');
  const lpCollapsed = lp && lp.classList.contains('is-collapsed');
  const lpRight = lp && !lpCollapsed ? (lp.offsetLeft + lp.offsetWidth + 12) : 14;
  const availMid = (lpRight + mr.width) / 2;
  let x = pr.x <= availMid ? pr.x + gap : pr.x - cw - gap;
  let y = pr.y - ch / 2;
  x = Math.max(lpRight, Math.min(Math.max(lpRight, mr.width - cw - 12), x));
  y = Math.max(46, Math.min(Math.max(12, mr.height - ch - 36), y));
  o.style.left = Math.round(x) + 'px';
  o.style.top = Math.round(y) + 'px';
}

export function initCitiesPage() {
  bindLifecycle();
  if (guardFileProtocol('#map-loading')) return;
  const params = new URLSearchParams(location.search);
  current = params.get('city') || 'shenzhen';

  MAP = createMap('map-city', { zoom: 10.5 });
  MAP.on('move', () => { try { positionOverlay(); } catch (e) {} });

  window.addEventListener('pagehide', () => { try { hideRichCard(); } catch (e) {} });
  window.addEventListener('pageshow', (e) => { if (e.persisted) { try { hideRichCard(); } catch (e) {} } });
  const loading = document.getElementById('map-loading');

  initLayerPanel(document.getElementById('layer-panel'), () => MAP, {
    layers: [
      { id: 'heritage', label: '文化遗产点', type: 'heritage', on: true },
      { id: 'reform', label: '改革开放事件', type: 'reform', on: true },
      ...(window.__LOCAL_FILE_BUILD__ ? [] : [
        { id: 'wfs', label: 'GeoServer WFS 要素', type: 'wfs', typeName: 'webgis:heritage_sites', on: false },
      ]),
    ],
    resetView: () => {
      const c = CITIES.find((x) => x.key === current) || CITIES[0];
      if (c) {
        hideRichCard();
        flyToCity(c.center, c.zoom);
      }
    },
    resetLabel: '复位 · 当前城市',
  });

  Promise.all([
    fetchJSON(dataUrl('cities.json')),
    fetchJSON(dataUrl('heritage.geojson')),
    fetchJSON(dataUrl('reform-events.json')),
    fetchJSON(dataUrl('city-statistics.json')).catch(() => ({ series: {} })),
  ]).then(([cities, her, ref, stats]) => {
    CITIES = cities;
    REFORM = ref.events;
    HERITAGE = her.features;
    CITY_STATS = (stats && stats.series) || {};
    buildTabs();
    if (loading) loading.classList.add('hide');
    attachStatusBar('map-root');
    whenReady(() => selectCity(current));
  }).catch((e) => { if (loading) loading.textContent = '数据加载失败：' + e.message; });
}

function buildTabs() {
  const tabs = document.getElementById('city-tabs');
  tabs.innerHTML = '';
  CITIES.forEach((c) => {
    const t = el('button', {
      class: 'city-tab' + (c.key === current ? ' active' : ''),
      type: 'button',
      'aria-pressed': c.key === current ? 'true' : 'false',
    }, [
      el('span', { class: 'ct-name', text: c.name }),
      el('span', { class: 'ct-en', text: c.en || '' }),
      el('span', { class: 'ct-period', text: c.period || '' }),
    ]);
    t.addEventListener('click', () => {
      current = c.key;
      [...tabs.children].forEach((x) => {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      t.classList.add('active');
      t.setAttribute('aria-pressed', 'true');
      selectCity(c.key);
    });
    tabs.appendChild(t);
  });
}

function selectCity(key) {
  const city = CITIES.find((c) => c.key === key) || CITIES[0];
  current = city.key;
  hideRichCard();
  try {
    const nextUrl = new URL(location.href);
    nextUrl.searchParams.set('city', city.key);
    history.replaceState(null, '', nextUrl);
  } catch (e) {}

  const intro = document.getElementById('city-intro');
  const cover = el('img', { alt: city.name + '城市实景', width: 640, height: 480, decoding: 'async' });
  const realCover = assetUrl(city.cover);
  if (realCover) loadImage(cover, realCover, city.name, city.coverCategory);
  else cover.src = placeholderDataURI(city.name, city.coverCategory, 640, 480);

  const stats = CITY_STATS[city.key] || {};
  const lastPop = Array.isArray(stats.population) && stats.population.length ? stats.population[stats.population.length - 1] : null;
  const lastGdp = Array.isArray(stats.gdp) && stats.gdp.length ? stats.gdp[stats.gdp.length - 1] : null;
  const figures = el('div', { class: 'city-figures' });
  if (lastPop) {
    figures.appendChild(el('div', { class: 'city-figure' }, [
      el('span', { class: 'cf-value', text: `约 ${formatNumber(lastPop[1])}` }),
      el('span', { class: 'cf-label', text: `${lastPop[0]} 常住人口（万人）` }),
    ]));
  }
  if (lastGdp) {
    figures.appendChild(el('div', { class: 'city-figure' }, [
      el('span', { class: 'cf-value', text: `约 ${formatNumber(lastGdp[1])}` }),
      el('span', { class: 'cf-label', text: `${lastGdp[0]} 地区 GDP（亿元）` }),
    ]));
  }

  intro.innerHTML = '';
  intro.appendChild(el('figure', { class: 'city-cover' }, [cover]));
  intro.appendChild(el('div', { class: 'city-copy' }, [
    el('div', {}, [
      el('span', { class: 'city-name', text: city.name }),
      el('span', { class: 'city-en', text: city.en || '' }),
    ]),
    el('span', { class: 'city-period', text: city.period || '' }),
    el('p', { class: 'city-desc', text: city.description || '' }),
  ]));
  intro.appendChild(figures);

  const herFeats = HERITAGE.filter((f) => f.properties.city && f.properties.city.includes(city.name));
  const refEvents = REFORM.filter((e) => e.city === city.name);

  updateCityMapBadge(city, herFeats.length, refEvents.length);

  addHeritagePoints(MAP, herFeats, {
    onClick: (p, ll, coords) => {
      const src = ((HERITAGE.find((h) => h.properties && h.properties.id === p.id) || {}).properties) || p;
      focusNodeOnMap({
        id: 'her-' + src.id,
        coords: coords || [ll.lng, ll.lat],
        color: categoryColor(src.category),
        html: richPlaceCard(src),
        pan: false,
      });
    },
  });
  addReformPoints(MAP, refEvents, {
    onClick: (p, ll, coords) => {
      const src = REFORM.find((e) => e.id === p.id) || p;
      focusNodeOnMap({
        id: 'ref-' + src.id,
        coords: coords || [ll.lng, ll.lat],
        color: REFORM_COLORS[src.type] || '#bf3718',
        html: richReformCard(src),
        pan: false,
      });
    },
  });
  flyToCity(city.center, city.zoom);

  renderDetail(city, herFeats, refEvents);
  renderGallery(city);
}

function renderGallery(city) {
  const box = document.getElementById('city-gallery');
  if (!box) return;
  const items = Array.isArray(city.gallery) ? city.gallery.filter((g) => g && g.image) : [];
  box.innerHTML = '';
  box.hidden = !items.length;
  if (!items.length) return;

  box.appendChild(el('div', { class: 'city-gallery-head' }, [
    el('h2', { class: 'city-gallery-title', text: '城市影像' }),
    el('p', { class: 'city-gallery-count', text: `${city.name} · ${items.length} 张档案影像` }),
  ]));

  const grid = el('div', { class: 'city-gallery-grid' });
  items.forEach((item) => {
    const src = assetUrl(item.image);
    const img = el('img', {
      alt: item.caption || city.name + '城市影像',
      width: 640,
      height: 420,
      loading: 'lazy',
      decoding: 'async',
    });
    if (src) loadImage(img, src, item.caption || city.name, city.coverCategory);
    else img.src = placeholderDataURI(item.caption || city.name, city.coverCategory, 640, 420);
    const link = el('a', {
      class: 'gallery-link',
      href: src || '#',
      target: '_blank',
      rel: 'noopener noreferrer',
      'aria-label': `查看大图：${item.caption || city.name}`,
    }, [img, el('span', { class: 'gallery-caption', text: item.caption || '' })]);
    grid.appendChild(el('figure', { class: 'gallery-item' }, [link]));
  });
  box.appendChild(grid);
  box.appendChild(el('p', { class: 'gallery-source', text: '图片：百度百科词条配图；版权归原作者与机构所有。' }));
}

function renderDetail(city, herFeats, refEvents) {
  const box = document.getElementById('city-detail');
  box.innerHTML = '';

  box.appendChild(el('h3', { text: '历史地标' }));
  if (herFeats.length) {
    const list = el('div', { class: 'place-list' });
    herFeats.forEach((f) => {
      const p = f.properties;
      const iconUrl = markerIconDataURL('mk-' + p.category);
      const nodeId = 'her-' + p.id;
      const item = el('button', { class: 'place-item', type: 'button', 'data-node-id': nodeId }, [
        iconUrl ? el('img', { class: 'pi-icon', src: iconUrl, alt: '' }) : el('span', { class: 'pi-dot', style: `background:${categoryColor(p.category)}` }),
        el('div', { style: 'flex:1;min-width:0;' }, [
          el('div', { class: 'pi-name', text: p.name }),
          el('div', { class: 'pi-meta', text: categoryLabel(p.category) + ' · ' + (p.period || '') }),
        ]),
      ]);
      const realSrc = assetUrl(p.image);
      const thumbImg = el('img', {
        alt: p.name + '照片',
        style: 'width:56px;height:38px;object-fit:cover;border-radius:0;border:1px solid var(--line);flex:none;',
      });
      if (realSrc) loadImage(thumbImg, realSrc, p.name, p.category);
      else thumbImg.src = placeholderDataURI(p.name, p.category, 112, 76);
      item.appendChild(thumbImg);

      item.addEventListener('click', () => {
        focusNodeOnMap({
          id: nodeId,
          coords: f.geometry.coordinates,
          color: categoryColor(p.category),
          html: richPlaceCard(p),
          pan: true,
        });
      });
      list.appendChild(item);
    });
    box.appendChild(list);
  } else {
    box.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;', text: '该城市在遗产名录中暂无独立条目。' }));
  }

  box.appendChild(el('h3', { text: '改革开放关键事件' }));
  if (refEvents.length) {
    const list = el('div', { class: 'place-list' });
    refEvents.forEach((e) => {
      const iconUrl = markerIconDataURL('rk-' + e.type);
      const nodeId = 'ref-' + e.id;
      const item = el('button', { class: 'place-item', type: 'button', 'data-node-id': nodeId }, [
        iconUrl ? el('img', { class: 'pi-icon', src: iconUrl, alt: '' }) : el('span', { class: 'pi-dot', style: `background:${REFORM_COLORS[e.type] || '#ccc'}` }),
        el('div', {}, [el('div', { class: 'pi-name', text: `${e.year} · ${e.title}` }), el('div', { class: 'pi-meta', text: e.type })]),
      ]);
      item.addEventListener('click', () => {
        focusNodeOnMap({
          id: nodeId,
          coords: e.coordinates,
          color: REFORM_COLORS[e.type] || '#bf3718',
          html: richReformCard(e),
          pan: true,
        });
      });
      list.appendChild(item);
    });
    box.appendChild(list);
  } else {
    box.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;', text: '该城市在改革开放事件库中暂无标注事件。' }));
  }

  const st = CITY_STATS[city.key];
  if (st && Array.isArray(st.population) && st.population.length) {
    box.appendChild(el('h3', { text: `${city.name} 1980-2020 人口与 GDP 跃迁` }));
    const chartDom = el('div', { style: 'width:100%;height:195px;margin-top:4px;' });
    box.appendChild(chartDom);
    const years = st.population.map((x) => String(x[0]));
    const pops = st.population.map((x) => x[1]);
    const gdps = (st.gdp || []).map((x) => x[1]);
    setTimeout(() => {
      createChart(chartDom, dualAxisCityOption(years, pops, gdps));
    }, 30);
  }

  box.appendChild(el('h3', { text: '空间变化与缓冲区分析' }));
  box.appendChild(el('p', { style: 'color:var(--muted);font-size:12.5px;', text: `进入 GIS 分析实验室，对 ${city.name} 进行多期建成区卷帘对比与 PostGIS 测地缓冲区分析。` }));
  const buildSuffix = window.__LOCAL_FILE_BUILD__ ? '' : '&build=20261028b';
  const btn = el('a', { id: 'to-analysis', class: 'btn btn-primary btn-sm', href: `analysis.html?city=${city.key}${buildSuffix}`, text: `分析 ${city.name} 建成区与缓冲区` });
  box.appendChild(btn);
}
