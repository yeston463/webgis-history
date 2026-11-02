// main.js - 共享外壳：顶部导航 / 品牌 / 页脚，以及页面通用初始化。
// 每个页面通过 import { initShell } 渲染统一头部，避免重复 HTML。

import { qsa, el, pageHref } from './utils.js';

// 站内导航统一带构建号，绕过旧 index.html / 子页的浏览器缓存。
// 本地文件版不需要缓存号，也避免 file:// 对查询参数的特殊处理。
const BUILD = location.protocol === 'file:' ? '' : '20261028b';
const withBuild = (href) => (BUILD ? href + (href.includes('?') ? '&' : '?') + 'build=' + BUILD : href);

const NAV = [
  { href: withBuild('index.html'),          label: '时空序厅',   key: 'home',     index: '01' },
  { href: withBuild('pages/cities.html'),   label: '四城记忆',   key: 'cities',   index: '02' },
  { href: withBuild('pages/analysis.html'), label: '分析实验室', key: 'analysis', index: '03' },
];

function currentKey() {
  const p = location.pathname.split('/').pop() || 'index.html';
  const hit = NAV.find((n) => n.href.split('?')[0].split('/').pop() === p);
  return hit ? hit.key : (p === 'index.html' ? 'home' : '');
}

export function initShell(opts = {}) {
  const header = document.getElementById('site-header');
  if (!header) return;
  const active = currentKey();

  const nav = el('nav', { class: 'topnav', 'aria-label': '主导航' }, NAV.map((n) =>
    el('a', {
      href: pageHref(n.href),
      class: 'topnav-link' + (n.key === active ? ' active' : ''),
      'data-key': n.key,
      'data-index': n.index,
      'aria-current': n.key === active ? 'page' : null,
    }, n.label)
  ));

  header.innerHTML = '';
  const markUrl = pageHref('assets/brand/shanhai-mark.png');
  header.appendChild(el('a', { class: 'brand', href: pageHref(withBuild('index.html')) }, [
    el('span', { class: 'brand-mark' }, [
      el('img', { src: markUrl, alt: '', width: 36, height: 36, decoding: 'async' }),
    ]),
    el('div', { class: 'brand-text' }, [
      el('span', { class: 'brand-title', text: '山海新篇' }),
      el('span', { class: 'brand-sub', text: 'Chronicles of China' }),
    ]),
  ]));
  header.appendChild(nav);

  const syncHeader = () => {
    header.classList.toggle('scrolled', window.scrollY > 18);
  };
  syncHeader();
  window.addEventListener('scroll', syncHeader, { passive: true });

  buildFooter();
}

function buildFooter() {
  const footer = document.getElementById('site-footer');
  if (!footer) return;
  footer.innerHTML = '';
  footer.appendChild(el('div', { class: 'footer-inner' }, [
    el('div', {}, [
      el('div', { class: 'footer-brand', text: '山海新篇' }),
      el('div', { class: 'footer-line', text: '四城记忆与 GIS 时空分析实验室 · 城市空间记忆与遥感演变' }),
    ]),
    el('div', { class: 'footer-right' }, [
      el('span', { class: 'footer-source', text: 'AUE 2016 / JRC GHSL / 公开统计与史志资料' }),
      el('a', { class: 'footer-top', href: '#top', text: '回到顶部' }),
    ]),
  ]));
}

// 通用：滚动入场（IntersectionObserver）。仅当此函数执行后才隐藏内容，
// 避免脚本失败时把正文留在 opacity: 0。
export function initRevealOnScroll() {
  const items = qsa('[data-reveal]');
  if (!items.length) return;
  if (!('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('revealed'));
    return;
  }
  document.documentElement.classList.add('js');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('revealed');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
  items.forEach((i) => io.observe(i));
}
