// fetch-reform-images.cjs — 为 22 个改革开放关键事件补充真实配图
//
// 策略：
//   1) 若事件所在城市在 cities.json 中有封面图（深圳/上海/广州/厦门），直接复用该封面，
//      离线可靠且画质高；
//   2) 否则按事件的 sourceUrl（百度百科词条）抓取真实配图，并按 sourceUrl 去重
//      （14 个"沿海开放城市"共用同一词条，仅抓取一次，供多条事件复用）。
//   3) 抓取失败的条目保留 image: null，由前端 loadImage 降级为示意图，不阻断。
//
// 输出：写回 data/reform-events.json 的 image 字段（以项目根为基准的路径），
//       同时生成 assets/reform/credits.json 作为来源署名。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'reform');
fs.mkdirSync(IMG_DIR, { recursive: true });

const BAIKE = 'https://baike.baidu.com/item/';

// 城市封面映射（与 data/cities.json 的 cover 字段保持一致）
const CITY_COVERS = {
  '深圳': 'assets/city/shenzhen.png',
  '上海': 'assets/city/shanghai.jpg',
  '广州': 'assets/city/guangzhou.jpg',
  '厦门': 'assets/city/xiamen.jpg',
};

// 与 fetch-heritage-images.cjs 一致的选图规则：优先干净 /pic/ 图，排除推广/占位图
const PICK_IMG = () => {
  const bad = /logo|icon|avatar|qrcode|blank|placeholder|loading|spacer|iw3\.png|api\.map\.baidu/i;
  const pic = [];
  const other = [];
  document.querySelectorAll('img').forEach((im) => {
    const src = im.currentSrc || im.src || '';
    if (!src || src.startsWith('data:')) return;
    if (bad.test(src)) return;
    if (!/bkimg\.cdn\.bcebos\.com|bkssl\.bdimg\.com/.test(src)) return;
    const w = im.naturalWidth, h = im.naturalHeight;
    if (w < 260 || h < 170) return;
    const ar = w / h;
    if (ar < 0.62 || ar > 2.6) return;
    const rec = { src, w, h, score: w * h };
    (ar < 1.45 ? pic : other).push(rec);
  });
  pic.sort((a, b) => b.score - a.score);
  return pic.concat(other).slice(0, 6);
};

(async () => {
  const events = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reform-events.json'), 'utf-8')).events;
  console.log(`共 ${events.length} 个关键事件待配图`);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const credits = [];
  let ok = 0, cover = 0, fail = 0;
  const byUrl = {};   // sourceUrl -> 已保存文件名
  let urlIdx = 0;

  for (const ev of events) {
    // 1) 优先复用城市封面
    if (CITY_COVERS[ev.city]) {
      ev.image = CITY_COVERS[ev.city];
      cover++;
      console.log(`  ✓ [封面] ${ev.title.padEnd(22)} ${ev.city} → ${ev.image}`);
      continue;
    }
    // 2) 按 sourceUrl 抓取（去重）
    const url = ev.sourceUrl;
    if (!url) { ev.image = null; fail++; console.log(`  ✗ ${ev.title} — 无来源链接`); continue; }
    if (byUrl[url]) { ev.image = byUrl[url]; ok++; console.log(`  ✓ [复用] ${ev.title.padEnd(22)} → ${ev.image}`); continue; }

    let saved = null;
    try {
      await page.goto(BAIKE + encodeURIComponent(decodeURIComponent(url.split('/item/')[1] || '')), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2600);
      await page.evaluate(() => { window.scrollTo(0, 400); window.scrollTo(0, 0); });
      await page.waitForTimeout(900);
      const cands = await page.evaluate(PICK_IMG);
      if (!cands.length) throw new Error('未找到合适的实景照片');
      for (const c of cands) {
        const r = await page.evaluate(async (src) => {
          try {
            const res = await fetch(src);
            if (!res.ok) return { ok: false, status: res.status };
            const blob = await res.blob();
            if (blob.size < 20000) return { ok: false, size: blob.size, why: 'too-small' };
            const buf = await blob.arrayBuffer();
            let bin = '';
            const bytes = new Uint8Array(buf);
            const CH = 0x8000;
            for (let k = 0; k < bytes.length; k += CH) bin += String.fromCharCode.apply(null, bytes.subarray(k, k + CH));
            return { ok: true, type: blob.type, size: blob.size, b64: btoa(bin) };
          } catch (e) { return { ok: false, err: e.name + ': ' + e.message }; }
        }, c.src);
        if (r.ok && r.b64) {
          const ext = (r.type || 'image/jpeg').includes('png') ? 'png' : (r.type || '').includes('webp') ? 'webp' : 'jpg';
          const fileName = `ref-${urlIdx}.${ext}`;
          fs.writeFileSync(path.join(IMG_DIR, fileName), Buffer.from(r.b64, 'base64'));
          saved = { file: fileName, bytes: r.size, remoteUrl: c.src.split('?')[0], dims: `${c.w}x${c.h}`, sourcePage: url };
          byUrl[url] = 'assets/reform/' + fileName;
          urlIdx++;
          break;
        }
      }
    } catch (e) {
      console.log(`  ✗ ${ev.title} — ${e.message}`);
    }

    if (saved) {
      ev.image = saved.file.startsWith('assets/') ? saved.file : 'assets/reform/' + saved.file;
      ok++;
      credits.push({ title: ev.title, city: ev.city, ...saved });
      console.log(`  ✓ [抓取] ${ev.title.padEnd(22)} ${ev.image.padEnd(20)} ${(saved.bytes / 1024).toFixed(0)}KB  ${saved.dims}`);
    } else {
      ev.image = null;
      fail++;
      if (!saved) console.log(`  ✗ ${ev.title} — 抓取失败，前端将降级为示意图`);
    }
  }

  // 写回 reform-events.json（保留其余字段，仅更新 image）
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'reform-events.json'), 'utf-8'));
  const imgMap = {};
  events.forEach((e) => { imgMap[e.id] = e.image; });
  raw.events.forEach((e) => { e.image = imgMap[e.id]; });
  fs.writeFileSync(path.join(ROOT, 'data', 'reform-events.json'), JSON.stringify(raw, null, 2), 'utf-8');

  fs.writeFileSync(
    path.join(IMG_DIR, 'credits.json'),
    JSON.stringify({
      note: '改革开放关键事件配图：城市封面取自 assets/city（百度百科·词条配图），其余按事件 sourceUrl 抓取百度百科词条配图。版权归原作者/机构所有，仅用于课程作业非商业展示。',
      generatedAt: new Date().toISOString(),
      total: credits.length,
      images: credits,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n===== 完成：封面 ${cover} + 抓取 ${ok} = ${cover + ok} 张有效，失败 ${fail} =====`);
  console.log(`事件配图已写回 data/reform-events.json`);
  await ctx.close();
  await browser.close();
})();
