// utils.js - 通用工具：DOM、数据请求、图像占位、格式化、提示
// 第三方库以 UMD 全局方式引入（maplibregl / echarts / turf），此处直接使用全局变量。

/* ----------------------------- 文化类别定义 ----------------------------- */
// 类别决定地图圆点颜色与列表图标，集中管理，避免散落硬编码。
// 色值已针对浅色底图（MapViewer 风格 #eef1f4）调校对比度，保证可辨识。
export const CATEGORIES = {
  building:   { label: '历史建筑',   color: '#9a6a10', glyph: 'building' },
  port:       { label: '港口码头',   color: '#0f6e7c', glyph: 'anchor' },
  trade:      { label: '商贸遗址',   color: '#d0471f', glyph: 'coins' },
  industry:   { label: '工业遗产',   color: '#8a3b2a', glyph: 'gear' },
  district:   { label: '历史街区',   color: '#6b4fa1', glyph: 'roof' },
  ruins:      { label: '考古遗址',   color: '#2d6b4d', glyph: 'arch' },
};

export function categoryColor(key) {
  return (CATEGORIES[key] && CATEGORIES[key].color) || '#cccccc';
}
export function categoryLabel(key) {
  return (CATEGORIES[key] && CATEGORIES[key].label) || key || '其他';
}

/* ----------------------------- DOM 助手 ----------------------------- */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v !== null && v !== undefined && v !== false) {
      node.setAttribute(k, v === true ? '' : v);
    }
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function escapeHtml(str = '') {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[m]));
}

/* ----------------------------- 数据请求（缓存 + 中断） ----------------------------- */
const _cache = new Map();

function localDataKey(url) {
  try {
    const pathname = decodeURIComponent(new URL(url, location.href).pathname);
    const idx = pathname.lastIndexOf('/data/');
    if (idx >= 0) return pathname.slice(idx + 1);
  } catch (e) { /* fall through */ }
  return String(url).split('?')[0].replace(/^(\.\.\/|\.\/)+/, '');
}

export async function fetchJSON(url, { signal, noCache = false } = {}) {
  if (!noCache && _cache.has(url)) return _cache.get(url);
  // 本地文件版把 JSON/GeoJSON 预生成为 window.__LOCAL_DATA__，绕开 file:// 的 fetch 限制。
  const key = localDataKey(url);
  if (window.__LOCAL_DATA__ && Object.prototype.hasOwnProperty.call(window.__LOCAL_DATA__, key)) {
    const data = window.__LOCAL_DATA__[key];
    if (!noCache) _cache.set(url, data);
    return data;
  }
  const res = await fetch(url, { signal, cache: 'no-cache' });
  if (!res.ok) throw new Error(`资源加载失败 ${url}（HTTP ${res.status}）`);
  const data = await res.json();
  if (!noCache) _cache.set(url, data);
  return data;
}

export function clearCache() { _cache.clear(); }

export const APP_VERSION = '16';

// 以项目根目录为基准的数据路径（兼容根页面与 pages/ 子目录页面，附带统一版本号防浏览器缓存旧 GeoJSON）
export function dataUrl(p) {
  const prefix = location.pathname.includes('/pages/') ? '../' : '';
  const sep = p.includes('?') ? '&' : '?';
  return prefix + 'data/' + p + sep + 'v=' + APP_VERSION;
}

// 将"以应用根为基准"的页面路径（如 'index.html'、'pages/cities.html'）解析为
// 当前页面可正确访问的相对 URL，无论当前处于根目录还是 pages/ 子目录。
// 这样无论从 index 直接访问，还是深链进入某个子页面，页头导航与跨页演示都能正确跳转。
export function pageHref(p) {
  const prefix = location.pathname.includes('/pages/') ? '../' : '';
  return prefix + p;
}

/* ----------------------------- 数字 / 面积格式化 ----------------------------- */
export function formatNumber(n, digits = 0) {
  if (n == null || isNaN(n)) return '-';
  return Number(n).toLocaleString('zh-CN', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

// 面积以平方米输入，自动换算为 km² 或 万㎡ 便于阅读
export function formatArea(sqm) {
  if (sqm == null || isNaN(sqm)) return '-';
  const km2 = sqm / 1e6;
  if (km2 >= 1) return `${formatNumber(km2, 2)} km²`;
  return `${formatNumber(sqm / 1e4, 1)} 万㎡`;
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

/* ----------------------------- 图像：占位 + 降级 ----------------------------- */
// 生成"数字展馆"风格的 SVG 占位图（离线可用，永不崩溃）。
// 若提供真实图片 URL 加载失败，自动降级到占位图，避免整页崩溃。
export function placeholderDataURI(name = '影像暂缺', category = 'building', w = 880, h = 560) {
  // 中性占位：纯色底 + "照片暂缺"，不使用任何示意图/插画
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 880 560">
  <rect width="${w}" height="${h}" fill="#eef1f4"/>
  <text x="${w / 2}" y="${h / 2 - 6}" text-anchor="middle" font-family="'Noto Serif SC','Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="44" font-weight="600" fill="#93a0ab">照片暂缺</text>
  <text x="${w / 2}" y="${h / 2 + 54}" text-anchor="middle" font-family="'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif" font-size="22" fill="#aab4bd">${escapeHtml(name)}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

function categoryGlyphPath(category) {
  switch (category) {
    case 'port':     return '<circle cx="0" cy="-30" r="14"/><line x1="0" y1="-16" x2="0" y2="46"/><line x1="-26" y1="20" x2="26" y2="20"/><path d="M-34 34 q34 22 68 0"/>';
    case 'trade':    return '<ellipse cx="-18" cy="0" rx="18" ry="18"/><ellipse cx="18" cy="0" rx="18" ry="18"/><line x1="-36" y1="6" x2="36" y2="6"/>';
    case 'industry': return '<circle cx="0" cy="0" r="20"/><g stroke-width="6"><line x1="0" y1="-34" x2="0" y2="-22"/><line x1="0" y1="22" x2="0" y2="34"/><line x1="-34" y1="0" x2="-22" y2="0"/><line x1="22" y1="0" x2="34" y2="0"/><line x1="-24" y1="-24" x2="-15" y2="-15"/><line x1="15" y1="15" x2="24" y2="24"/><line x1="24" y1="-24" x2="15" y2="-15"/><line x1="-15" y1="15" x2="-24" y2="24"/></g>';
    case 'district': return '<path d="M-44 30 L-30 -10 L-10 30 Z"/><path d="M-14 30 L0 -18 L18 30 Z"/><path d="M20 30 L34 -6 L48 30 Z"/>';
    case 'ruins':    return '<path d="M-40 30 L-40 -10 Q0 -42 40 -10 L40 30"/><line x1="-20" y1="30" x2="-20" y2="-2"/><line x1="0" y1="30" x2="0" y2="-18"/><line x1="20" y1="30" x2="20" y2="-2"/>';
    default:         return '<path d="M0 -40 L36 -16 L36 30 L-36 30 L-36 -16 Z"/><line x1="-16" y1="30" x2="-16" y2="6"/><line x1="16" y1="30" x2="16" y2="6"/><line x1="-16" y1="6" x2="16" y2="6"/>';
  }
}

// 给 <img> 赋值，失败时降级到占位图
export function loadImage(imgEl, url, name, category) {
  if (!imgEl) return;
  const fallback = placeholderDataURI(name, category);
  if (!url) { imgEl.src = fallback; return; }
  imgEl.onerror = () => { imgEl.onerror = null; imgEl.src = fallback; };
  imgEl.src = url;
}

/**
 * 标准化外部资料链接（当前为百度百科）。
 * 中文条目名必须做 URL 编码，否则部分环境/浏览器会解析失败或 404。
 */
export function normalizeSourceUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url, location.href);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      // 逐段编码路径中的中文，保留既有百分号编码不被二次转义
      u.pathname = u.pathname
        .split('/')
        .map((seg) => (/%[0-9a-fA-F]{2}/.test(seg) ? seg : encodeURIComponent(decodeURIComponent(seg))))
        .join('/');
      return u.toString();
    }
  } catch (e) {
    return url;
  }
  return url;
}

/**
 * 静态资源路径解析（与 dataUrl/pageHref 同逻辑）。
 * 数据中的 image 字段统一写作 'assets/heritage/xxx.jpg'（以项目根为基准），
 * 在 pages/ 子页面下需补 '../' 才能正确加载。
 */
export function assetUrl(p) {
  if (!p) return '';
  if (/^(https?:|data:|blob:)/i.test(p)) return p;
  const prefix = location.pathname.includes('/pages/') ? '../' : '';
  return prefix + p.replace(/^\.?\/+/, '');
}

// 判断是否百度百科链接（用于差异化入口样式与文案）
export function isBaikeUrl(url) {
  return typeof url === 'string' && /(^|\.)baike\.baidu\.com/i.test(url);
}

/* ----------------------------- 提示与错误 ----------------------------- */
let _toastTimer = null;
export function toast(msg, type = 'info', ms = 2600) {
  let box = qs('#toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(box);
  }
  box.className = `toast toast-${type}`;
  box.textContent = msg;
  box.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => box.classList.remove('show'), ms);
}

// 在地图容器内渲染可见的错误提示（满足"地图失败时提供可见提示"）
export function showMapError(containerId, err) {
  const c = qs('#' + containerId);
  if (!c) return;
  const overlay = el('div', { class: 'map-error', role: 'alert' }, [
    el('div', { class: 'map-error-box' }, [
      el('h3', { text: '地图加载异常' }),
      el('p', { text: (err && err.message) || '未知错误' }),
      el('p', { class: 'map-error-hint', text: window.__LOCAL_FILE_BUILD__ ? '本地文件版地图加载异常，请使用最新版 Chrome 或 Edge 打开 local/index.html。' : '请确认通过本地 HTTP 服务器访问（如 python -m http.server），而非 file:// 直接打开。' }),
    ]),
  ]);
  c.appendChild(overlay);
}

export function currentYearRange() { return null; }

// 检测是否通过 file:// 直接打开；若是，在指定 loading 元素内显示明显提示并返回 true
export function guardFileProtocol(loadingSelector) {
  if (location.protocol !== 'file:') return false;
  if (window.__LOCAL_FILE_BUILD__) return false;
  const loading = loadingSelector ? document.querySelector(loadingSelector) : null;
  if (loading) {
    loading.innerHTML = `
      <div class="file-protocol-warning">
        <strong>无法通过 file:// 直接打开</strong>
        <p>浏览器禁止本地文件协议加载 ES Module 与 JSON/GeoJSON 数据，导致地图卡在此处。</p>
        <p>请通过本地 HTTP 服务运行：</p>
        <code>python -m http.server 8000</code>
        <p>然后访问 <code>http://127.0.0.1:8000/</code>，或双击项目根目录的 <code>start-server.bat</code>。</p>
      </div>`;
    loading.classList.remove('hide');
  }
  return true;
}

