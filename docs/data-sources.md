# 数据来源说明（Data Sources）

本文件逐项说明 `data/` 下每个数据文件的**真实性、来源与用途**。项目坚持"真实可核、模拟明示"的原则：凡是模拟/示意数据，均在文件内 `metadata.note` 与界面提示中标注，不冒充实测。

---

## 1. 真实数据

### 1.1 `data/heritage.geojson` — 20 处中国历史文化遗产（点要素）
- **真实性**：坐标与名称均为真实点位，取自公开权威资料（世界遗产名录、国家文物局、地方志与公开地图）。
- **字段**：`id / name / category / city / longitude / latitude / period / description / image / gallery / source / sourceUrl / imageSource / imageSourcePage / imageCredit`
- **类别（6 类）**：`building`(城址/建筑)、`port`(港口)、`trade`(商埠)、`industry`(工业)、`district`(特区/新区)、`ruins`(遗址)
- **示例点位**：故宫(116.397,39.918)、长城(116.017,40.359)、秦始皇陵兵马俑(109.279,34.385)、莫高窟(94.809,40.038)、丽江古城(100.233,26.872)、平遥古城(112.181,37.202)、鼓浪屿(118.067,24.447)、外滩(121.490,31.246)、广州十三行(113.244,23.114)、南头古城(113.530,22.532)、蛇口(113.902,22.471)、沙面(113.243,23.107)、大雁塔(108.964,34.218)、苏州古典园林(120.616,31.322)、良渚(119.949,30.395)、泉州(118.589,24.887)、都江堰(103.618,31.004)、布达拉宫(91.117,29.656)、龙门石窟(112.476,34.562)、开平碉楼(112.578,22.293)
- **图片**：**实景照片**，存于 `assets/heritage/`（20 处共 74 张，含主图 + 画廊图），由 `scripts/fetch-heritage-images.cjs` 从对应百度百科词条抓取并**下载到本地**。
  - `image` = 主图路径；`gallery` = 同词条其余实景照片路径（档案面板画廊，点击可切换主图）
  - 抓取方式：用 Playwright 打开词条页，在**页面上下文内fetch** 转base64（百度图片 CDN 有防盗链，命令行直连会被302 拦截，浏览器内则正常）。
  - 选图规则：排除 logo/图标/占位图（`api.map.baidu.com/images/iw3.png` 固定 690×786/7.7 KB）与带推广水印的 `/smart/` 图；优先 `/pic/` 词条主图；按内容与URL 双重去重。
  - **兜底**：若某张图片缺失或加载失败，前端回退为**中性「照片暂缺」占位**（不使用示意图/插画），保证不破图。
- **版权**：图片版权归原作者/机构所有，此处仅用于课程作业非商业展示。逐张来源、原图 URL 与词条页记录于 `assets/heritage/credits.json`；界面档案面板亦显示「图片来源：百度百科 · 词条配图」及版权提示。
- **来源说明**：点位为"城市/遗产地"级近似经纬度，精度满足地市级空间表达，非厘米级测绘；请勿据此做工程定位。

### 1.1b `assets/city/` — 4 座城市封面照片
- **内容**：深圳、上海、广州、厦门（鼓浪屿）各 1 张城市实景封面照 + 若干候选，存于 `assets/city/`。
- **来源**：同样由 `scripts/fetch-city-images.cjs` 从百科词条抓取下载；选图**优先横图宽幅的城市天际线**（早期按"面积最大"排序曾误抓到静物特写，已修正）。
- **说明**：厦门词条为 React 简版、实测仅 4 张图且全为 logo/统计图，故改用「鼓浪屿」词条作为厦门封面来源。
- **版权**：同 1.1，来源清单见 `assets/city/credits.json`。

### 1.2 `data/reform-events.json` — 改革开放关键空间事件（1978–2001）
- **真实性**：年份与事件均为史实，坐标为城市/地点近似位置。
- **事件构成（共 22 条）**：
  - 1978：十一届三中全会（北京，改革开放起点）
  - 1980：四大经济特区——深圳、珠海、汕头、厦门
  - 1984：国务院批准 14 个沿海开放城市（大连、秦皇岛、天津、烟台、青岛、连云港、南通、上海、宁波、温州、福州、广州、湛江、北海）
  - 1988：海南建省并设经济特区
  - 1990：上海浦东开发开放
  - 2001：中国加入 WTO
- **来源**：新华社、中国政府网、各地方志公开资料。坐标为城市/地点近似经纬度。
- **字段**：`year / title / type / city / coordinates / description`；`type` 含 `sez`(特区)、`coastal`(沿海开放城市)、`milestone`(里程碑) 等，供色彩区分与筛选。

### 1.3 `data/china-provinces.geojson` — 省级行政边界（离线底图）
- **真实性**：采用 DataV.GeoAtlas 公开行政边界数据（GCJ-02/国测局标准投影，仅作示意底图）。
- **用途**：作为 MapLibre 的离线底图来源（`fill` + `line`），**不依赖任何在线瓦片服务**。
- **覆盖范围**：34 个省级行政区（含港澳台，按公开标准呈现）。

### 1.4 `data/cities.json` — 四城元信息
- **真实性**：深圳/上海/广州/厦门四城的名称、英文、中心经纬度、简介均为真实公开信息。
- **字段**：`key / name / en / period / short / center / zoom / description / heritageIds / reformHighlights`
- **用途**：驱动"四城记忆"页的城市切换与地图飞行定位。

### 1.5 `data/city-statistics.json` — 四城人口 / GDP 参考序列
- **真实性**：**近似公开值**。取自各市统计公报/统计年鉴的近似数据，仅用于背景对比与图表说明。
- **标注**（文件内 `metadata.note`）：**并非本项目空间测算结果**；建成区面积以 `urban-expansion` 中 GeoJSON 经 Turf 实测为准。
- **单位**：人口=万人，GDP=亿元（现价）。

---

## 2. 真实地理数据 · 城市建成区（Atlas of Urban Expansion）

### 2.1 `data/urban-expansion/*.geojson` — 城市建成区时序（真实，AUE）
- **真实性**：**真实数据**。采用 **Atlas of Urban Expansion（AUE, 2016 Edition, Phase I）**——由 Landsat 中分辨率影像解译的城市建成范围（urban extent）多边形。
- **来源**：NYU Urban Expansion / Lincoln Institute of Land Policy / UN-Habitat（公开免费）。原始为 WGS84 UTM Z50N 矢量（`urban_edge_t1/t2/t3.shp`），由 `scripts/gen_urban_aue.py` 重投影至 WGS84、合并、简化后生成本地 GeoJSON；源 zip 存于 `data/urban-expansion/_ghsl/`。
- **覆盖**：深圳、上海，各三个时期约 **1990 / 2000 / 2014** 年。
- **面积计算**：多边形经 Turf.js 以测地方式真实计算（`turf.area`），**非经纬度平方近似**；多斑块先合并去重叠再求面积（见 `gis-methods.md`）。
- **边界说明**：受 Landsat 分辨率与 AUE "urban extent"（含建成+城市化开敞空间）定义影响，边界为解译近似值；面积量级符合真实城市，但不宜作精确到年的年表。
- **界面提示**：分析实验室功能A 页面顶部说明已标注数据来源与"约 1990/2000/2014、AUE 真实数据"。

### 2.2 `data/urban-expansion/urban-index.json`
- 描述各城市可用年份、中心点、分辨率与来源声明，供前端构建年份下拉与说明。

### 2.3 `data/urban-expansion/_ghsl/simulated_backup/`
- 早期"模拟斑块版"建成区数据（1980/2000/2020）的备份，仅作历史留存，不再被前端引用。

---

## 3. 数据加载与容错
- 统一通过 `utils.js` 的 `fetchJSON()` + `dataUrl()` 加载；`dataUrl()` 自动适配根页与 `pages/` 子页的相对路径（子页前加 `../`）。
- 所有 `fetch` 失败会 `toast` 提示，地图/图表区域显示"数据加载失败"提示而非白屏。
- 图片缺失统一回退到 SVG 占位图（见 `utils.js` 的 `placeholderDataURI` 与 `loadImage`）。

## 4. 来源汇总表

| 文件 | 类型 | 真实性 | 主要来源 |
| --- | --- | --- | --- |
| heritage.geojson | 点 | 真实（近似点位） | 世遗名录/国家文物局/地方志 |
| reform-events.json | 点+属性 | 真实（史实+近似点位） | 新华社/中国政府网/地方志 |
| china-provinces.geojson | 面 | 真实（行政边界） | DataV.GeoAtlas |
| cities.json | 属性 | 真实 | 公开资料 |
| city-statistics.json | 序列 | 近似公开值（参考） | 各市统计公报/年鉴 |
| urban-expansion/* | 面 | 真实（AUE） | Atlas of Urban Expansion 2016（NYU/Lincoln/UN-Habitat） |
