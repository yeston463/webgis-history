// build-local.cjs - 生成可直接双击的本地文件版（file://）
// 产物：local/ 目录，包含经典脚本 bundle、本地数据注册表、样式、vendor、图片。
// 不使用 ES Module / fetch 加载本地数据，因此无需 HTTP 服务器。
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'local');
const DATA = path.join(ROOT, 'data');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error('缺少目录: ' + src);
  fs.cpSync(src, dest, { recursive: true });
}
function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

// 浮点瘦身：所有数字统一舍入到 6 位小数（≈0.1 m 级坐标精度，mm 级高度/统计精度）。
// 源数据的坐标动辄 14+ 位小数，是 GeoJSON 文本膨胀的主因之一；此变换对渲染、
// Turf/PostGIS 换算（面积/缓冲）与读数（km² 保留 2 位）均无可见影响。
function roundNums(x) {
  if (typeof x === 'number') return Math.round(x * 1e6) / 1e6;
  if (Array.isArray(x)) { for (let i = 0; i < x.length; i++) x[i] = roundNums(x[i]); return x; }
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = roundNums(x[k]); return x; }
  return x;
}
const origReadJson = readJson;
readJson = (rel) => roundNums(origReadJson(rel));

// 压缩包内图片（本地副本）：JPEG 最长边 1600/质量 82；
// 大 PNG 若近不透明（alpha 最小值 ≥200）→ 白底压平转 JPEG 同名存放；真透明 → 仅缩放重存。
// 原始素材保持原样，仅在 local/ 与提交 ZIP 中生效；local/README.txt 有披露。
function optimizeAssets() {
  try {
    const res = require('child_process').spawnSync('python', [path.join(__dirname, 'optimize_local_assets.py'), path.join(OUT, 'assets')], { stdio: 'inherit' });
    if (res.error || res.status !== 0) console.log('  (资产压缩步骤被跳过：' + (res.error ? res.error.code || res.error.message : 'python 退出码 ' + res.status) + '，打包体积不受正确性影响)');
  } catch (e) {
    console.log('  (资产压缩步骤被跳过：' + e.message + ')');
  }
}
function writeRegistry(name, keys) {
  const pairs = keys.map((key) => `${JSON.stringify(key)}:${JSON.stringify(readJson(key))}`);
  const js = `window.__LOCAL_FILE_BUILD__ = true;\nwindow.__LOCAL_DATA__ = Object.assign(window.__LOCAL_DATA__ || {}, {\n${pairs.join(',\n')}\n});\n`;
  fs.writeFileSync(path.join(OUT, 'js', name), js, 'utf8');
  console.log(`  ${name}  ${(js.length / 1048576).toFixed(1)} MB`);
}
function buildHtml(srcRel, destRel, dataScripts, bundleScript, prefix) {
  let html = fs.readFileSync(path.join(ROOT, srcRel), 'utf8');
  const re = /<script type="module">[\s\S]*?<\/script>/;
  if (!re.test(html)) throw new Error('未找到模块入口: ' + srcRel);
  const scripts = dataScripts.map((name) => `<script src="${prefix}js/${name}"></script>`).join('\n  ');
  html = html.replace(re, `${scripts}\n  <script src="${prefix}js/${bundleScript}"></script>`);
  html = html.replace(/\?build=20261028b/g, '').replace(/&build=20261028b/g, '');
  fs.writeFileSync(path.join(OUT, destRel), html, 'utf8');
}

console.log('清理 local/ ...');
fs.rmSync(OUT, { recursive: true, force: true });
ensureDir(path.join(OUT, 'js'));
ensureDir(path.join(OUT, 'pages'));

console.log('复制样式 / vendor / 图片 / 文档 ...');
copyDir(path.join(ROOT, 'css'), path.join(OUT, 'css'));
copyDir(path.join(ROOT, 'vendor'), path.join(OUT, 'vendor'));
copyDir(path.join(ROOT, 'assets'), path.join(OUT, 'assets'));
copyDir(path.join(ROOT, 'docs'), path.join(OUT, 'docs'));
fs.copyFileSync(path.join(ROOT, 'README.md'), path.join(OUT, 'README.md'));
optimizeAssets();

const basemapKeys = [
  'data/china-provinces.geojson',
];
const citiesKeys = [
  'data/cities.json',
  'data/heritage.geojson',
  'data/reform-events.json',
  'data/city-statistics.json',
];
const urbanKeys = fs.readdirSync(path.join(DATA, 'urban-expansion'))
  .filter((f) => f.endsWith('.geojson'))
  .sort()
  .map((f) => 'data/urban-expansion/' + f);
const buildingsDir = path.join(DATA, 'buildings');
const hasBuildings = fs.existsSync(buildingsDir);
const analysisKeys = [
  'data/heritage.geojson',
  'data/reform-events.json',
  'data/urban-expansion/urban-index.json',
  ...(hasBuildings ? ['data/buildings/buildings-meta.json'] : []),
  ...urbanKeys,
];

console.log('生成本地数据注册表 ...');
writeRegistry('local-data-shared.js', basemapKeys);
writeRegistry('local-data-home.js', ['data/cities.json']);
writeRegistry('local-data-cities.js', citiesKeys);
writeRegistry('local-data-analysis.js', analysisKeys);

// 九城建筑轮廓体量大，拆成 data/buildings/*.geojson.js 分片，由 ensureLocalChunk 按需注入
if (hasBuildings) {
  const outDir = path.join(OUT, 'data', 'buildings');
  ensureDir(outDir);
  let total = 0, count = 0;
  for (const f of fs.readdirSync(buildingsDir).filter((n) => n.endsWith('.geojson')).sort()) {
    const key = 'data/buildings/' + f;
    const js = `window.__LOCAL_DATA__ = Object.assign(window.__LOCAL_DATA__ || {}, {${JSON.stringify(key)}:${JSON.stringify(readJson(key))}});\n`;
    fs.writeFileSync(path.join(outDir, f + '.js'), js, 'utf8');
    total += js.length; count += 1;
  }
  console.log(`  data/buildings/*.geojson.js  ${count} 片  ${(total / 1048576).toFixed(1)} MB（按需加载）`);
}

console.log('生成本地 HTML ...');
buildHtml('index.html', 'index.html', ['local-data-home.js'], 'home.bundle.js', '');
buildHtml('pages/cities.html', 'pages/cities.html', ['local-data-shared.js', 'local-data-cities.js'], 'cities.bundle.js', '../');
buildHtml('pages/analysis.html', 'pages/analysis.html', ['local-data-shared.js', 'local-data-analysis.js'], 'analysis.bundle.js', '../');

console.log('打包经典脚本 ...');
esbuild.buildSync({
  entryPoints: {
    home: path.join(ROOT, 'scripts/local-entries/home.js'),
    cities: path.join(ROOT, 'scripts/local-entries/cities.js'),
    analysis: path.join(ROOT, 'scripts/local-entries/analysis.js'),
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outdir: path.join(OUT, 'js'),
  entryNames: '[name].bundle',
  logLevel: 'info',
});

fs.writeFileSync(path.join(OUT, '打开本地版.bat'),
  '@echo off\r\nstart "" "%~dp0index.html"\r\n', 'ascii');

fs.writeFileSync(path.join(OUT, 'README.txt'), `山海新篇 · 本地文件版
========================================

打开方式
1. 使用最新版 Chrome 或 Edge。
2. 直接双击本目录下的 index.html（或“打开本地版.bat”）。
3. 不需要 Node.js、PostGIS 或 GeoServer。

本版本的能力
- 首页、四城记忆、分析实验室的全部地图与图表可用。
- 九城建成区卷帘、测地面积、PostGIS 缓冲区的等价计算由本地 Turf.js 测地引擎完成。
- 分析实验室「3D 建筑演化」模块可用：OpenStreetMap 逐栋真实轮廓（© OpenStreetMap contributors，ODbL）× AUE 建成区年代分层，1:1 米高度、累计/新增时间轴与播放。
- 地图统一使用天地图在线底图（GS(2023)336号），缩放上限锁定至原生最高瓦片级（需联网加载底图瓦片）。

本地版不启用的部分
- GeoServer WFS 实时请求与 PostGIS 在线入库需要运行完整 Node 后端，本地版已在“服务与入库”模块中标注并禁用相关按钮。
- 完整全栈版本的启动方式见项目 README.md 与 server/ 目录。详细数据来源、AI 辅助获取/清洗/推断说明见 docs/data-sources.md。

数据与脚本
- 常规 JSON / GeoJSON 已内嵌到 js/local-data-*.js，避免 file:// 的 fetch 限制。
- 九城建筑轮廓体积较大，放在 data/buildings/*.geojson.js，首次用到某座城市时才注入该片，不会在打开页面时全部读入。
- 页面逻辑已打包到 js/*.bundle.js，避免 file:// 的 ES Module 限制。
- 为控制提交包体积，本包内媒体与数据做过轻量化处理：图片最长边压缩至 1600px（JPEG 质量 82，大图不透明 PNG 压平为 JPEG 同名存放）；坐标与统计数值统一按 6 位小数存放（≈0.1 m 精度）。新闻发布会或高清投影展示如有需求，可用仓库完整版 assets/ 原件替换。
`, 'utf8');

console.log('完成：local/');
