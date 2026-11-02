// fetch-heritage-images.cjs — 从百度百科词条下载 20 处文化遗产的真实主图到本地
//
// 背景：百度百科图片有防盗链（curl 直连 302），但浏览器可正常加载。
// 故用 Playwright 打开词条页，提取主图 src，在页面上下文中 fetch 转 base64，
// 再由Node 写入 assets/heritage/。这样既绕过防盗链，又让图片本地化、可离线。
//
// 同时产出 assets/heritage/credits.json 记录每张图的来源页与原始 URL，供署名。

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'assets', 'heritage');
fs.mkdirSync(IMG_DIR, { recursive: true });

/** 清理上一轮下载的图片（仅本脚本生成的 jpg/png，不触碰 credits.json） */
function cleanOldImages() {
  let n = 0;
  for (const f of fs.readdirSync(IMG_DIR)) {
    if (/^(.+)\.jpg$|^(.+)\.png$|^(.+)\.webp$/.test(f)) {
      try { fs.unlinkSync(path.join(IMG_DIR, f)); n++; } catch (e) { /* ignore */ }
    }
  }
  return n;
}

const BAIKE = 'https://baike.baidu.com/item/';

/** 从数据中读取 20 处遗产及其百科条目名 */
function loadHeritage() {
  const gj = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'heritage.geojson'), 'utf-8'));
  return gj.features.map((f) => {
    const p = f.properties;
    const m = /baike\.baidu\.com\/item\/(.+)$/.exec(p.sourceUrl || '');
    return {
      id: p.id,
      name: p.name,
      city: p.city,
      category: p.category,
      baikeItem: m ? decodeURIComponent(m[1]) : p.name,
      pageUrl: p.sourceUrl,
    };
  });
}

/** 在页面上下文中挑选最合适的真实照片
 *  经验（实测）：
 *   · bkimg.cdn.bcebos.com/pic/...  → 词条真实配图，多数干净
 *   · bkimg.cdn.bcebos.com/smart/... → 百科"智能推广图"，常带大标题水印（不合格）
 *   · api.map.baidu.com/images/iw3.png → "图片不存在"占位图（固定 690x786/7.7KB）
 *  故优先 /pic/，排除 /smart/ 与占位图。
 */
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
    // 竖版或接近方形（真实建筑照常见）优先
    (ar < 1.45 ? pic : other).push(rec);
  });
  // /pic/ 干净图优先，其间取面积大者
  pic.sort((a, b) => b.score - a.score);
  return pic.concat(other).slice(0, 8);
};

(async () => {
  const items = loadHeritage();
  console.log(`共 ${items.length} 处遗产待下载`);
  const cleaned = cleanOldImages();
  if (cleaned) console.log(`已清理上一轮 ${cleaned} 个图片文件\n`);

  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    locale: 'zh-CN',
  });
  const page = await ctx.newPage();

  const credits = [];
  let ok = 0, fail = 0;

  for (const it of items) {
    const url = BAIKE + encodeURIComponent(it.baikeItem);
    let done = false;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // 等主图区域渲染
      await page.waitForTimeout(2600);
      // 触发懒加载
      await page.evaluate(() => {
        window.scrollTo(0, 400); window.scrollTo(0, 0);
      });
      await page.waitForTimeout(900);

      const cands = await page.evaluate(PICK_IMG);
      if (!cands.length) throw new Error('未找到合适的实景照片');

      // 逐个尝试下载：主图 + 若干画廊图（同一词条的真实照片，用于"影像画廊"）
      const saved = [];
      for (const c of cands) {
        if (saved.length >= 4) break;
        const r = await page.evaluate(async (src) => {
          try {
            const res = await fetch(src);
            if (!res.ok) return { ok: false, status: res.status };
            const blob = await res.blob();
            // 真实照片至少 20KB；低于此值几乎必为占位图/图标
            if (blob.size < 20000) return { ok: false, status: res.status, size: blob.size, why: 'too-small' };
            const buf = await blob.arrayBuffer();
            let bin = '';
            const bytes = new Uint8Array(buf);
            const CH = 0x8000;
            for (let k = 0; k < bytes.length; k += CH) {
              bin += String.fromCharCode.apply(null, bytes.subarray(k, k + CH));
            }
            return { ok: true, type: blob.type, size: blob.size, b64: btoa(bin) };
          } catch (e) { return { ok: false, err: e.name + ': ' + e.message }; }
        }, c.src);
        if (r.ok && r.b64) {
          const ext = (r.type || 'image/jpeg').includes('png') ? 'png' : (r.type || '').includes('webp') ? 'webp' : 'jpg';
          // 去重：同一 URL（同一 img 标签的多种尺寸变体）只保留一张
          const key = c.src.split('?')[0];
          if (saved.some((s) => s.remoteUrl === key)) continue;
          // 内容去重：字节完全相同的也跳过
          if (saved.some((s) => s.bytes === r.size)) continue;
          // 第 1 张为主图 id.jpg，第 2..n 张为 id-2.jpg / id-3.jpg …
          const fileName = saved.length === 0
            ? `${it.id}.${ext}`
            : `${it.id}-${saved.length + 1}.${ext}`;
          fs.writeFileSync(path.join(IMG_DIR, fileName), Buffer.from(r.b64, 'base64'));
          saved.push({
            file: fileName,
            bytes: r.size,
            remoteUrl: key,
            dims: `${c.w}x${c.h}`,
          });
        }
      }

      if (saved.length) {
        ok++;
        credits.push({
          id: it.id, name: it.name, city: it.city, category: it.category,
          main: saved[0].file,
          gallery: saved.slice(1).map((s) => s.file),
          files: saved,
          dims: saved[0].dims, bytes: saved[0].bytes,
          source: '百度百科',
          sourcePage: it.pageUrl,
          remoteUrl: saved[0].remoteUrl,
        });
        console.log(`  ✓ ${it.name.padEnd(14)} ${saved.length} 张  主图 ${saved[0].file.padEnd(20)} ${(saved[0].bytes / 1024).toFixed(0)}KB  ${saved[0].dims}`);
      } else {
        fail++;
        console.log(`  ✗ ${it.name} — 所有候选图均下载失败`);
      }
    } catch (e) {
      fail++;
      console.log(`  ✗ ${it.name} — ${e.message}`);
    }
  }

  fs.writeFileSync(
    path.join(IMG_DIR, 'credits.json'),
    JSON.stringify({
      note: '图片来源为百度百科词条配图，版权归原作者/机构所有，此处仅用于课程作业非商业展示；引用前请遵循原图授权条款。',
      generatedAt: new Date().toISOString(),
      total: ok,
      images: credits,
    }, null, 2),
    'utf-8'
  );

  console.log(`\n===== 完成：成功 ${ok} / ${items.length}，失败 ${fail} =====`);
  console.log(`输出目录：assets/heritage/`);
  console.log(`来源清单：assets/heritage/credits.json`);

  await ctx.close();
  await browser.close();
})();