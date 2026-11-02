// fetch-city-images.cjs — 下载 4 座重点城市的真实封面照片
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'city');
fs.mkdirSync(IMG_DIR, { recursive: true });

const CITIES = [
  { key: 'shenzhen', name: '深圳', item: '深圳' },
  { key: 'shanghai', name: '上海', item: '上海' },
  { key: 'guangzhou', name: '广州', item: '广州' },
  // 「厦门」词条为 React 简版，仅有 logo/统计图（实测 4 张，无内容图），
  // 故改用鼓浪屿词条——厦门最具代表性的名片，且已在遗产名录中。
  { key: 'xiamen', name: '厦门（鼓浪屿）', item: '鼓浪屿' },
];

/**
 * 城市封面选图策略（实测教训）：
 *  · 仅按"面积最大"排序会抓到标本盘/蝴蝶/稻米等**静物特写**——它们分辨率大但毫无城市感。
 *  · 城市封面应当优先「词条主图（/pic/ 路径的竖版/方图）」与
 *    「图片带天际线/建筑/全景特征」的宽幅图。
 *  · 策略：先取 /pic/ 主图；再考虑宽幅（横图更像城市全景）；竖版与方图次之。
 */
const PICK_IMG = () => {
  const bad = /logo|icon|avatar|qrcode|blank|placeholder|loading|spacer|iw3\.png|api\.map\.baidu/i;
  const scored = [];
  document.querySelectorAll('img').forEach((im) => {
    const src = im.currentSrc || im.src || '';
    if (!src || src.startsWith('data:')) return;
    if (bad.test(src)) return;
    if (!/bkimg\.cdn\.bcebos\.com|bkssl\.bdimg\.com/.test(src)) return;
    const w = im.naturalWidth, h = im.naturalHeight;
    if (w < 300 || h < 200) return;
    const ar = w / h;
    if (ar < 1.1 || ar > 2.4) return;              // 只接受横图（城市全景多为横图）
    const isPic = /\/pic\//.test(src);
    const isSmart = /\/smart\//.test(src);        // 推广图常带水印，降权
    let score = w * h;
    if (isPic) score *= 2.2;                       // 词条主图优先
    if (isSmart) score *= 0.5;
    // 常见城市全景尺寸（如 2688x1520 / 1920x1080）加分
    if (ar > 1.4 && ar < 2.0) score *= 1.5;
    scored.push({ src, w, h, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8);
};

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const credits = [];
  let ok = 0;
  for (const c of CITIES) {
    try {
      const url = 'https://baike.baidu.com/item/' + encodeURIComponent(c.item);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      await page.evaluate(() => { window.scrollTo(0, 500); window.scrollTo(0, 0); });
      await page.waitForTimeout(1000);

      const cands = await page.evaluate(PICK_IMG);
      // 首选严格条件；若无命中则放宽（降低尺寸与比例门槛，但仍排除占位/图标）
      let candsAll = cands;
      if (!candsAll.length) {
        candsAll = await page.evaluate(() => {
          const bad = /logo|icon|avatar|qrcode|blank|placeholder|loading|iw3\.png|api\.map\.baidu/i;
          const out = [];
          document.querySelectorAll('img').forEach((im) => {
            const src = im.currentSrc || im.src || '';
            if (!src || src.startsWith('data:')) return;
            if (bad.test(src)) return;
            if (!/bkimg\.cdn\.bcebos\.com|bkssl\.bdimg\.com/.test(src)) return;
            const w = im.naturalWidth, h = im.naturalHeight;
            if (w < 200 || h < 150) return;
            const ar = w / h;
            if (ar < 0.5 || ar > 3.2) return;
            out.push({ src, w, h, score: w * h });
          });
          out.sort((a, b) => b.score - a.score);
          return out.slice(0, 6);
        });
      }
      const saved = [];
      for (const cd of candsAll) {
        if (saved.length >= 4) break;
        const r = await page.evaluate(async (src) => {
          try {
            const res = await fetch(src);
            if (!res.ok) return { ok: false };
            const blob = await res.blob();
            if (blob.size < 25000) return { ok: false, small: true };
            const buf = await blob.arrayBuffer();
            let bin = ''; const by = new Uint8Array(buf);
            for (let i = 0; i < by.length; i += 0x8000) bin += String.fromCharCode.apply(null, by.subarray(i, i + 0x8000));
            return { ok: true, type: blob.type, size: blob.size, b64: btoa(bin) };
          } catch (e) { return { ok: false, err: e.message }; }
        }, cd.src);
        if (r.ok && r.b64) {
          const ext = (r.type || 'image/jpeg').includes('png') ? 'png' : 'jpg';
          const fn = saved.length === 0 ? `${c.key}.${ext}` : `${c.key}-${saved.length + 1}.${ext}`;
          fs.writeFileSync(path.join(IMG_DIR, fn), Buffer.from(r.b64, 'base64'));
          saved.push({ file: fn, bytes: r.size, dims: `${cd.w}x${cd.h}`, remoteUrl: cd.src.split('?')[0] });
        }
      }
      if (saved.length) {
        ok++;
        credits.push({
          key: c.key, name: c.name,
          main: saved[0].file,
          candidates: saved.map((s) => s.file),
          files: saved,
          bytes: saved[0].bytes, dims: saved[0].dims, remoteUrl: saved[0].remoteUrl,
          source: '百度百科', sourcePage: url,
        });
        console.log(`  ✓ ${c.name}  ${saved.length} 张候选  主图 ${saved[0].file} ${(saved[0].bytes / 1024).toFixed(0)}KB ${saved[0].dims}`);
      } else {
        console.log(`  ✗ ${c.name} — 未获取到合适照片`);
      }
    } catch (e) {
      console.log(`  ✗ ${c.name} — ${e.message}`);
    }
  }

  fs.writeFileSync(path.join(IMG_DIR, 'credits.json'), JSON.stringify({
    note: '图片来源为百度百科城市词条配图，版权归原作者/机构所有，仅用于课程作业非商业展示。',
    total: ok, images: credits,
  }, null, 2), 'utf-8');

  console.log(`\n===== 城市封面：${ok}/${CITIES.length} 成功 → assets/city/ =====`);
  await ctx.close();
  await browser.close();
})();