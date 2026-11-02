// layerpanel.js - 通用图层面板：可折叠制图坞 + 复位视图 + 图层显隐 + GIS 量算 + 语义芯片图例
import { CATEGORIES, el } from './utils.js';
import { REFORM_COLORS, setHeritageVisible, setReformVisible, markerIconDataURL } from './layers.js';
import { attachMeasureTools, setChoroplethVisible, setReformFlowVisible, setGeoServerWfsVisible, setGeoServerWmsVisible } from './gis-tools.js';

/**
 * 初始化图层面板。
 * @param {HTMLElement} container
 * @param {() => object} getMap
 * @param {object} opts { layers, legend, customLegend, resetView, resetLabel, measure }
 */
export function initLayerPanel(container, getMap, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  container.classList.remove('is-collapsed');

  // ---------- 0. 顶部可折叠栏 ----------
  const startCollapsed = typeof window !== 'undefined' && window.innerWidth <= 640;
  if (startCollapsed) container.classList.add('is-collapsed');
  const toggleBtn = el('button', {
    class: 'lp-toggle',
    type: 'button',
    'aria-expanded': startCollapsed ? 'false' : 'true',
    'aria-label': '收起或展开图层面板',
    text: startCollapsed ? '展开' : '收起',
  });
  const head = el('div', { class: 'lp-head' }, [
    el('span', { class: 'lp-head-title', text: '制图控制' }),
    toggleBtn,
  ]);
  const bodyWrap = el('div', { class: 'lp-body' });

  toggleBtn.addEventListener('click', () => {
    const collapsed = container.classList.toggle('is-collapsed');
    toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggleBtn.textContent = collapsed ? '展开' : '收起';
  });

  container.appendChild(head);
  container.appendChild(bodyWrap);

  // ---------- 1. 视图工具 ----------
  if (opts.resetView) {
    const b = el('button', { class: 'lp-btn lp-tool', type: 'button', text: opts.resetLabel || '复位视图' });
    b.addEventListener('click', () => { try { opts.resetView(); } catch (e) {} });
    bodyWrap.appendChild(el('div', { class: 'lp-group' }, [
      el('div', { class: 'lp-title', text: '视图控制' }),
      b,
    ]));
  }

  // ---------- 2. 图层显隐控制 ----------
  const layers = Array.isArray(opts.layers) ? opts.layers : [];
  if (layers.length) {
    const lyrWrap = el('div', { class: 'lp-group' }, [el('div', { class: 'lp-title', text: '图层控制' })]);
    const list = el('div', { class: 'lp-layers' });
    layers.forEach((lyr) => {
      const chk = el('input', { type: 'checkbox' });
      chk.checked = lyr.on !== false;
      chk.addEventListener('change', () => {
        const m = getMap && getMap();
        const on = chk.checked;
        if (typeof lyr.onChange === 'function') {
          lyr.onChange(on, m);
          return;
        }
        if (!m) return;
        if (lyr.type === 'heritage') setHeritageVisible(m, on);
        else if (lyr.type === 'reform') setReformVisible(m, on);
        else if (lyr.type === 'choropleth') {
          setChoroplethVisible(m, on, lyr.field || 'heritage_count');
        } else if (lyr.type === 'flow') {
          setReformFlowVisible(m, on);
        } else if (lyr.type === 'wfs') {
          setGeoServerWfsVisible(m, on, lyr.typeName || 'webgis:heritage_sites');
        } else if (lyr.type === 'wms') {
          setGeoServerWmsVisible(m, on, lyr.layers || 'webgis:china_provinces,webgis:heritage_sites');
        }
      });
      const row = el('label', { class: 'lp-layer' }, [
        chk,
        el('span', { text: lyr.label }),
      ]);
      list.appendChild(row);
    });
    lyrWrap.appendChild(list);
    bodyWrap.appendChild(lyrWrap);
  }

  // ---------- 3. GIS 交互量算工具（测距 / 测面） ----------
  if (opts.measure !== false && getMap) {
    attachMeasureTools(bodyWrap, getMap);
  }

  // ---------- 4. 图例（真实芯片图标 + 按页面智能匹配） ----------
  if (opts.legend !== false) {
    const lg = el('div', { class: 'lp-group' }, [el('div', { class: 'lp-title', text: '图例' })]);
    const body = el('div', { class: 'lp-legend' });

    if (Array.isArray(opts.customLegend) && opts.customLegend.length) {
      opts.customLegend.forEach((item) => {
        body.appendChild(el('div', { class: 'lg-row', style: 'grid-column:1/-1;' }, [
          el('span', { class: 'lp-sw', style: `background:${item.color};border:1.5px solid ${item.border || item.color};` }),
          el('span', { text: item.label }),
        ]));
      });
    } else {
      const types = new Set(layers.map((l) => l.type));
      const showHer = types.size === 0 || types.has('heritage');
      const showRef = types.size === 0 || types.has('reform');

      if (showHer) {
        Object.entries(CATEGORIES).forEach(([k, c]) => {
          const icoUrl = markerIconDataURL('mk-' + k);
          body.appendChild(el('div', { class: 'lg-row' }, [
            icoUrl
              ? el('img', { class: 'lg-ico', src: icoUrl, alt: '', 'aria-hidden': 'true' })
              : el('span', { class: 'lg-dot', style: `background:${c.color}` }),
            el('span', { text: c.label }),
          ]));
        });
      }
      if (showRef) {
        Object.entries(REFORM_COLORS).forEach(([t, c]) => {
          const icoUrl = markerIconDataURL('rk-' + t);
          body.appendChild(el('div', { class: 'lg-row' }, [
            icoUrl
              ? el('img', { class: 'lg-ico', src: icoUrl, alt: '', 'aria-hidden': 'true' })
              : el('span', { class: 'lg-dot', style: `background:${c}` }),
            el('span', { text: t }),
          ]));
        });
      }
    }
    lg.appendChild(body);
    bodyWrap.appendChild(lg);
  }
}
