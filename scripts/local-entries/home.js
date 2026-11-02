import { initShell, initRevealOnScroll } from '../../js/main.js';
import { fetchJSON, el, loadImage, assetUrl, placeholderDataURI } from '../../js/utils.js';

initShell();

(async () => {
  try {
    const cities = await fetchJSON('data/cities.json');
    const wrap = document.getElementById('city-cards');
    cities.forEach((c) => {
      const img = el('img', { alt: c.name + '城市实景', width: 640, height: 480, loading: 'lazy', decoding: 'async' });
      const realCover = assetUrl(c.cover);
      if (realCover) loadImage(img, realCover, c.name, c.coverCategory || 'building');
      else img.src = placeholderDataURI(c.name, c.coverCategory || 'building', 640, 480);
      const card = el('a', {
        class: 'city-card tap',
        href: `pages/cities.html?city=${c.key}`,
        'data-reveal': '',
      }, [
        el('figure', { class: 'cc-figure' }, [img]),
        el('div', { class: 'cc-body' }, [
          el('div', { class: 'cc-name', text: c.name }),
          el('div', { class: 'cc-en', text: c.en || '' }),
          el('div', { class: 'cc-period', text: c.period || '' }),
          el('div', { class: 'cc-desc', text: c.short || '' }),
          el('div', { class: 'cc-go', text: '查看城市档案' }),
        ]),
      ]);
      wrap.appendChild(card);
    });
  } catch (e) {
    console.error('城市卡片加载失败', e);
  }
  initRevealOnScroll();
})();
