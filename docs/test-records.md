# 测试记录（Test Records）

本项目提供**六套自动化测试**（均基于 Playwright 无头 Chromium），当前 **44/44 全部通过**（2026-11-08 底图降级合规改造：自绘中国标准矢量底图取代外国栅格备用链，`verify-fallback.cjs` 断言重写为 8 项，`verify-3d.cjs` 生长动画采样改有界轮询消除换装竞态假阴性；此前 2026-11-06 以"九城建筑三维演化"模块取代已删除的 GHSL 体块版，LOD 阈值改为随相机浮动，模块内就近可用的「3D 城市」下拉；同日第二轮渲染开销优化追加「自适应降级」断言，傍晚新增天地图限流的多源自动降级/恢复断言，晚间为年代切换新增「生长动画」断言；上一轮为 2026-10-31 blueyard.com 设计系统迁移）：

| 脚本 | 覆盖目标 | 项数 |
| --- | --- | --- |
| `scripts/smoke-test.cjs` | 首页、四城记忆、分析实验室、富卡片交互、导航仅保留两模块 | 5 |
| `scripts/detail-test.cjs` | 建成区测地面积（AUE）、缓冲区半径真实生效 + 要素带图弹窗、天地图缩放上限硬锁 | 3 |
| `scripts/verify-basemap.cjs` | 天地图底图、图层面板、遗产/改革标记、卷帘双图 + AUE + 缓冲区模块 | 2 |
| `scripts/verify-3d.cjs` | 3D 懒加载、OSM 轮廓规模与高度取值、年代分层、累计/新增时间轴、播放、顶部下拉联动、模块内城市下拉、两级 LOD 阈值、自适应降级（注入帧样本）、生长动画（gh 分波写入/归零）、署名与读数、控制台错误 | 18 |
| `scripts/verify-local.cjs` | 本地 `file://` 提交版：3D 分片按需注入、分片数量与 HTTP 版一致、LOD 阈值、模块内下拉切城注入第二分片 | 7 |
| `scripts/verify-fallback.cjs` | 天地图持续 429 → 隐藏天地图、切换**自绘中国标准矢量底图**（陆地/省界/十段线三层可见；**无任何外国栅格备用层**；十段线恰 10 段；横幅披露自绘署名；层序位于 3D 建筑之下；注记按缩放分级省↔城切换；**降级态常驻徽标**）；限流解除（探测 2 轮命中）→ 自动切回天地图并拆除徽标与注记 | 9 |

另有 `scripts/perf-3d.cjs`：不是通过/失败断言，而是帧时实测工具（软件渲染下界），输出 `test-results/perf-3d.json`，结果记录在 2.0d。

> **底图截图说明（2026-11-06）**：本机对天地图瓦片的请求返回 **HTTP 429（限流）**，因此所有 3D 截图的底图为样式的 `tdt-bg` 米色背景层而非真实栅格影像。`detail-test.cjs` / `verify-basemap.cjs` 断言的是底图图层配置、缩放上限锁与超限瓦片请求数，不依赖瓦片像素，故仍为真实通过；底图影像本身在限流环境下**未获视觉确认**。
>
> **2026-11-08 补注（主底图根因修复）**：晚些时候复查确认上注的「429 限流」**并非根因**——自 `tdtQ://` 协议上线（2026-11-06）起，`tdtTiles()` 用 `encodeURIComponent` 编码真实 URL 时把 `{z}/{y}/{x}` 转义成了 `%7Bz%7D`，而 MapLibre 的占位符替换只匹配 `'{z}'` 字面量**完全未命中**，结果真实请求一直带着字面 `{z}` 送往天地图（400「invalid params」），主底图从未渲染出一张真实瓦片。修复：编码后把花括号还原（`%7B→{`、`%7D→}`），MapLibre 替换在 tdtQ 串上即生效。修复后 22s 观察窗内 **448/448 瓦片全部 200**（按 2s 分桶 0 bad），不再触发降级。同日顺带确认：tiles 走 MapLibre raster 源的模板替换仍只在**未编码**的 `{z}` 上工作，是本仓底图链路的隐性契约，修 `tdtTiles` 时勿再丢掉花括号还原。
>
> **切城后底图空洞（2026-11-06 下午修复）**：3D 模块切换城市后底图成片缺失——天地图按 tk 限流（429），一次 easeTo 拉起 60–200 个瓦片请求全被拒，而 MapLibre 对失败瓦片不自动重发。修复两层：① `js/basemap.js` 新增 `tdtQ://` 协议（`maplibregl.addProtocol`），天地图栅格请求统一收口：全局并发上限 6、429/5xx/网络失败按 700ms·2ⁿ 退避重试 3 次、abort 立即让槽、队列上限 128；② `repairBasemapTiles(map)`：切城 easeTo 结束（moveend）后对仍处于 pending/errored 的栅格源整体 `reload()` 一轮（最多补 4 遍，sourceCache 有 `.loaded()` 判守，不会白取）。实测链路（`test-results/probe-recovery.cjs`）：静默 75s 后 errored 瓦片 41 张（协议退避拒单落地）；切城触发补载后 errored→loading 重新拉起，本机 429 全天未解所以 200 未能取得，但 errored→重发→等配额恢复即入图的闭环成立，配额内环境（真机常态）不再出现永久空洞。3D 模块就绪判定相应放宽：`scripts/verify-3d.cjs` / `verify-local.cjs` 不再依赖 `isStyleLoaded()`（栅格重试会让它长期为 false），改为「样式装配 + 业务图层挂载」断言。
>
> **限流触发兜底·多源备用底图链（2026-11-06 傍晚起四轮）**：tk 当日配额被自动化测试压满时**每张瓦片都 429**（用户 DevTools 实测 121 请求全 429/0B），重试与补载也救不了配额，页面只剩米色背景。为此 basemap.js 在 tdtQ 协议内维护健康环——10s 内 ≥8 次天地图失败即全局自动降级：隐藏天地图图层、按**多源级联链**启用备用栅格底图，现行候选链 `Esri Light Gray Canvas（z16，大陆可达，首连较慢）→ OSM-FR HOT（z19，可达性较好）→ OSM 官方标准瓦片（z19，部分网络不可达，探测自动跳过）`，换装时**并行探档·最快返回健康图片者胜出**（3s 封顶，健康=200 且 content-type: image/*——CARTO 免密端点返回「API KEY REQUIRED」占位图 HTTP 200 被校验淘汰出链；链序仅作并列时的稳定性），并在**显示图层前把当前视野 3×3 瓦片 fetch 进 HTTP 缓存（3s 封顶）**，首图命中缓存即现，不再逐张慢连空窗。备选一律要求 **WGS84/3857 同基准 + 免密钥 + CORS 开放**（高德/腾讯/百度系 GCJ-02/BD-09 会整体偏移 300–500m，与 OSM 建筑轮廓不可对齐，故排除；Wikimedia 域名在大陆不可达，OpenTopoMap 本地实测不可达）。两个真实用户反馈的坑也已修掉：**①兜底栅格动态 addLayer 到栈顶会整片遮住 3D 楼体**——插入时锚定在业务图层之下（`bu3d-city(-ov)/tdt-vec` 之前，`verify-fallback` 有层序断言：wb-hot=2 低于建筑=6）；**②天地图排队任务在降级后仍继续空打 429**——swap 时 `flushTdtQueue` 泄压清队列。页面顶部以 `.basemap-banner` 提示当前档位与完整署名，同时**停发天地图请求让配额冷却**，每 60s 单张样例瓦片探测（复用 `probeOnlineAvailable`），连续 2 次命中自动切回天地图；`watchBasemapHealth` 对晚注册地图（如 3D 模块 load 较晚）注册时同步应用当前状态。页面顶部以 `.basemap-banner` 提示当前档位与完整署名，同时停发天地图请求让配额冷却，每 60s 单张样例瓦片探测（复用 `probeOnlineAvailable`），连续 2 次命中自动切回天地图；`watchBasemapHealth` 对晚注册地图（如 3D 模块 load 较晚）注册时同步应用当前状态。`scripts/verify-fallback.cjs` 用路由劫持做确定性验证（天地图 429 + 链首 Esri 500 → 级联 HOT、横幅署名、低档隐藏、层序正确 → 解除后切回天地图五项），实测 0.1s 级联、120.1s 恢复切回；备用底图是限流兜底（含答辩环境网络波动的容错），主底图仍是天地图。
>
> **底图降级合规改造·自绘矢量底图（2026-11-08）**：GitHub Pages 公网部署后（用户反馈 + 截图），天地图 tk 配额耗尽触发自动降级落到 **Esri 灰底 Canvas**——该瓦片**不含九段线**，并把台湾标注成独立国家的 **"TAIWAN"** 英文字样（另有 "Luzon Strait" 等外国注记），作为面向公众的中国主题地图属违规"问题地图"（依据《地图管理条例》与自然资源部"问题地图"专项治理要求）。处置：**备用底图退役全部外国栅格链**（Esri / OSM-FR HOT / OSM 官方三档与其并行探档、视口预热的 raster 逻辑一并移除），降级底图改为**仓库自绘**——
> - 陆地填充与省界线：`data/china-provinces.geojson`（34 个省级要素，台湾省/港澳齐全，台湾省按省级标注、港澳细分仅绘图形不标名）；
> - **十段线**：10 段南海诸岛断续线，几何描摹自民政部全国行政区划信息查询平台 `xzqh.mca.gov.cn` 标准行政区划底图（geojson.cn 十段线数据集整理，OSM relation 3939323 校核），常量内嵌 `js/basemap.js`，赭石虚线绘出，配"南海诸岛"注记；
> - 中文注记：DOM 标签（样式未配 glyphs，不走 symbol 文本层），z<6.3 标省级地名，z≥6.3 切换九个焦点城市，随 zoom 事件实时级联；图层锚定仍在 3D 建筑之下，`flushTdtQueue` 泄压与 60s×2 探测回切天地图的机制**原样保留**。
> `scripts/verify-fallback.cjs` 重写为 8 项断言：隐藏天地图且陆地/省界/十段线三层可见（≤30s）、无任何外国栅格备用层（wb-esr/wb-hot/wb-osm 不得存在）、十段线源恰含 10 段折线、降级层序低于 3D 建筑、横幅含"自绘中国标准矢量底图"、低层级注记省级≥20/城市 0/南海诸岛 1、高层级注记城市 9/省级 0、解除限流后自动切回且注记拆除。**实测（2026-11-08 多次复跑）**：换装在断言窗口内即刻完成（30s 上限，0.0s 即命中——页面加载早期 8 次失败已触发）；恢复切回 75.1–120.1s（60s 间隔单瓦片探测连续 2 命中，退避轮次不同所致）。见下文 2.0d.3。
>
> 实务说明：3D 模块地图有独立 `setMinZoom(8.5)` 锁（`analysis.js`），注记分级断言因此在无 minzoom 锁的缓冲区地图 `__bufMap` 上进行（z4 ↔ z11 两级切换）；港澳特别行政区按省标但**不标名**（小面积地名拥挤），台湾省随省级要素完整标注，"南海诸岛"独立注记悬浮于十段线围合海域。

> **站点精简记录（2026-10-28）**：应用户要求，站点仅保留**四城记忆**与**分析实验室**。历史文化页、改革开放页及其专属脚本已移至 `_archive/2026-10-28-removed/`，导航与首页入口同步收敛。旧页面与六幕演示相关测试项已删除；下方 2.1–2.3 为精简前存档，不再作为当前验收依据。

测试目标是验证"页面可加载、无运行时报错、关键 DOM/地图/分析正确"。

---

## 1. 运行环境
- 后端：`node server/server.cjs`（默认 `http://127.0.0.1:8000`）；端口被占用时可用 `PORT=8010 node server/server.cjs`
- 仅做静态页验证时也可用 `python -m http.server 8000`，此时空间分析自动降级到 Turf.js
- 测试运行：
  ```
  node scripts/smoke-test.cjs
  node scripts/detail-test.cjs
  node scripts/verify-basemap.cjs
  # 非 8000 端口：
  BASE_URL=http://127.0.0.1:8010 node scripts/smoke-test.cjs
  ```
- 浏览器：Playwright Chromium（无头），视口 1600×900
- 第三方库：本地 `vendor/`（maplibre / echarts / turf）

## 2. 当前结果（两模块版，2026-10-28）

### 2.0 冒烟测试 5/5 通过（2026-11-06 复跑）
```
PASS  index 首页          -> cityCards=4,chapters=2,nav=时空序厅/四城记忆/分析实验室,noRemovedNav=true,noDemo=true,noFooterMeta=true
PASS  cities 四城记忆      -> tabs=4,introLen=159,canvas=true,mapW=957,navOk=true
PASS  cities 富卡片交互    -> overlay=true,len=128
PASS  analysis 分析实验室  -> stats=5,bufStats=4,canvasA=true,noTabs=true,noB=true,areaA="145.04 km²"
PASS  subpage nav 解析     -> brand=/index.html,cities=/pages/cities.html,analysis=/pages/analysis.html,navCount=3
==== 结果：5/5 通过 ====
```

### 2.0b 交互细节 3/3 + 底图验证 2/2 通过（2026-11-06 复跑）
```
PASS  建成区面积真实测地（AUE）  -> 起始 深圳 1990 建成区=145.04 km²，对比 深圳 2014 建成区=1,257.29 km²
PASS  缓冲区半径真实生效（100→250km）+ 要素带图弹窗 -> r=100→250km, 面积=31,482.46 km²→196,744.15 km², 命中=20→21, 弹窗图片=1920px (../assets/heritage/shekou.jpg)
PASS  天地图最大缩放上限硬锁（到达上限禁止放大且零超限瓦片请求） -> maxZoom=17, finalZoom=17, btnDisabled=true, overLimitTiles=0
==== 交互细节：3/3 通过 ====
PASS  cities 纯天地图底图+无离线层+缩放上限锁(Z17)+双标记 -> tdt=true/true,noOffline=true,noSwitch=true,maxZ=17,clamped=17,btnDisabled=true,sbZ="17.00 (上限)"
PASS  analysis 卷帘+缩放上限锁+缓冲区实景图片弹窗 -> tdt=true/true/true,noOffline=true,clamped=17/17,popupImg=true(1920px,"南头古城",unclipped=true),credit="天地图 · GS(2023)336号 · 建成区为 AUE / GHSL 遥感解译数据"
==== 底图与弹窗验证：2/2 通过 ====
```

> 2.0b 旧版曾列有一项「完全断网仍可用 -> 离线底图、水系、九段线、提示横幅均正常」：站点已改为纯天地图在线底图，本地增强底图与相关断言随之下线，该项**不再存在**，当前离线行为见 2.0d 与 gis-methods 4.3。

### 2.0c 全栈接口核验（Node 后端，回退引擎；2026-10-31 复跑）
```
/api/status        -> PostGIS 兼容引擎 (Node.js Geodesic)；GeoServer 2.27 直连+网关
站点范围           -> nav=[时空序厅,四城记忆,分析实验室]，chapters=2，history/reform 均 404
cities (广州)      -> 双轴图渲染，toHref=analysis.html?city=guangzhou&build=20261028b
analysis (广州)    -> 建成区统计 5 项、缓冲区统计 4 项、ST_Buffer/ST_DWithin SQL 正常
九城下拉切换        -> 深圳/上海/广州/厦门/北京/杭州/武汉/成都/青岛中心与面积均正常
```

> **设计系统迁移记录（2026-10-31）**：使用 `extract-design-system` 提取 `https://blueyard.com/`，得到 Instrument Sans / Geist Mono、8px 间距与直角/1px 边框线索；提取器未捕获 canvas 背景色板，桃色 `#ffcf9e`、珊瑚 `#ff6b4a`、淡紫 `#babfff` 由页面实测补录。实现文件为 `css/base.css`（令牌）、`css/blueyard.css`（组件皮肤）、`css/responsive-blueyard.css`（响应式覆盖），字体本地化为 `assets/fonts/instrument-sans-latin.woff2` 与 `geist-mono-latin.woff2`。

> 以下为**精简前版本的历史存档**（含历史文化/改革开放页、六幕演示、播放与旧版缓冲区），仅供追溯。

---


### 2.0d 3D 建筑演化验证 17/17 通过（2026-11-06 复跑，视口 1600×1000）
```
PASS  3D 模块滚动进入视口才初始化                 -> 滚动前=未加载, 滚动后=已就绪
PASS  默认城市与轮廓数据规模                       -> 深圳 13,465 栋, 越界高度=0
PASS  年代分层覆盖 >=3 个年代且高度非单一值         -> 年代={"1990":8999,"2000":3137,"2014":1123,"2024":206} 不同高度数=195
PASS  时间轴过滤与 1:1 高度绑定                     -> filter=["<=",["get","era"],2014], height=["get","h"], pitch=56°
PASS  按年代配色（4 档）与图例计数                  -> 图例=4 行
PASS  累计模式：1990→现状 建筑数单调不减            -> 1990:8999 → 2000:12136 → 2014:13259 → 2024:13465 / 共 13465
PASS  只看新增模式：filter 精确匹配且各年代之和=总数 -> 各年代新增=8999/3137/1123/206，合计 13465 vs 总数 13465
PASS  播放演化自动推进并自行停止                     -> 结束于 2024, 按钮="▶ 播放演化"
PASS  城市下拉联动 3D 并按需加载                     -> 上海=11,693栋/4年代, 北京=8,581栋/3年代
PASS  城市数据缓存随切换累积                         -> 已缓存 3 座城市
PASS  3D 模块自带城市下拉（九城，可就近切换）           -> 9 个选项；选到厦门 4,377 栋，相机已落入其窗口=true
PASS  模块内切换不重载上方卷帘（顶部下拉保持原城市）     -> 顶部下拉仍为 beijing（模块内已切到 xiamen）
PASS  两级 LOD 阈值随相机浮动并实时提示               -> 相机 13.32 级 → 阈值 14.72 级；源码层 maxzoom=14/13
PASS  OSM 署名与推断说明就位                         -> 轮廓：OpenStreetMap 建筑多边形（© OpenStreetMap contributors，ODbL）…
PASS  读数含可见数与高度来源占比                     -> 时相1990 可见建筑（累计）8,999 / 13,465 …
PASS  自适应降级：细节层帧时过低自动上调阈值并在读数披露 -> 阈值 14.72 → 16（+0.7 复位后清零=true）
PASS  无致命控制台错误
==== 3D 验证：17/17 通过 ====
```
- 九城数据规模（`data/buildings/buildings-meta.json`）：全量 103,830 栋（深圳 13,465 / 上海 11,693 / 广州 18,056 / 厦门 4,377 / 北京 8,581 / 杭州 14,473 / 武汉 5,787 / 成都 20,000 / 青岛 7,398），概览层 1,393–4,921 栋/城、合计 27,567 栋（占全量 22–34%）。
- 截图：`test-shots/v-3d-evolution-1990.png`、`v-3d-evolution-2024.png`（默认相机 · 概览层）、`lod-1-overview-2024.png`、`lod-2-detail.png`（阈值以上逐栋）、`lod-3-mobile-chengdu.png`（390px）、`3d-select-1600.png` / `3d-select-900.png` / `3d-select-390.png`（模块头部的「3D 城市」下拉，桌面 112×36、手机 257×44）。底图因本机瓦片限流呈米色背景（见页首说明）。

#### 2.0d.1 帧时实测（`scripts/perf-3d.cjs`，可重跑）
headless Chromium + SwiftShader 软件渲染，1600×1000，pitch 56°，5 秒连续方位角扫转，取 `render` 事件间隔中位数；样本城市深圳/上海/广州/成都（含最大体量成都 20,000 栋）。perf 脚本会把自适应降级关掉（`state.autoLod=false`）再测，让固定两级行的语义稳定；同屏体块数为几何顶点投影独立统计，两次运行在 easeTo 插值时点上有百栋级漂移，对比以帧时为准。

**优化前 → 优化后**（2026-11-06 同机同方法当日复跑，间隔约 1 小时；优化内容见下方「第二轮渲染开销控制」）：

| 配置 | 同屏体块 | 帧时中位（优化前） | 帧时中位（优化后） | fps 前 → 后 |
| --- | --- | --- | --- | --- |
| 出厂 LOD · 默认相机（概览层） | 1,518–2,731 | 45.9–70.3 ms | 31.1–40.2 ms | 14.2–21.8 → 24.9–32.2 |
| 出厂 LOD · 阈值 +0.4 级（逐栋） | 566–3,235 | 47.2–97.5 ms | 30.9–50.9 ms | 10.3–21.2 → 19.6–32.4 |
| 出厂 LOD · 阈值 +1.2 级（逐栋） | 164–1,222 | 36.6–75.9 ms | 26.6–43.6 ms | 13.2–27.3 → 22.9–37.6 |
| 对照：默认相机强开逐栋全量 | 5,556–17,302 | 111.8–205.1 ms | 55.7–96.3 ms | 4.9–8.9 → 10.4–18.0 |

（同屏体块取两次运行的范围；上一轮记录的同区间数字 51–75 / 54–114 / 43–83 / 111–206 ms 为当日早些时候的另一次采样，机器抖动范围内的迁移属正常，结论方向一致。）

**第二轮渲染开销控制（2026-11-06 下午，帧时收益见上表）**：
- **不透明渲染**：`fill-extrusion-opacity 0.95 → 1.0`。透明度一旦小于 1 就退化为半透明混合、关闭深度写入；不透明后深度可写，先画入的楼体把重叠背片直接挡掉（early-Z 免掉大量无效着色）。本轮把不透明化、buffer 压减等一起合并测量，未做单项归因。
- **瓦片 buffer 128 → 24（细节）/ 16（概览）**：单栋楼基本不跨瓦片，默认 128px 的 `buffer` 会把楼在相邻瓦片重复 2–4 份上传与建网格；24px（z14 约 110 m）仍覆盖绝大多数楼宽，跨缝楼靠相邻瓦片的 buffer 条带拼合，双份重叠在不透明渲染下不可见。截图（`test-shots/probe-hidpi-detail.png`）复核未见接缝、破楼与 z-fighting。
- **高分屏采样率封顶**：3D 地图 `pixelRatio = min(devicePixelRatio, 1.5)`，`antialias` 仅在 dpr≤1.25 保留 MSAA（高分屏靠 1.5x 采样保边缘锐度）。dsf=2 软件渲染探针实测画布比率 2.0→1.5 生效，细节层扫转 41.5 fps；不封顶时全屏碎片采样率还要再高约 78%。
- **LOD 提示条不再每帧重写 DOM**：连续旋转时按内容变更检测，静止/一致时跳过 `textContent` 写入与回流。
- **自适应降级**：细节层下交互帧时中位数持续 ≥150 ms（<6.7 fps）时，自动把 LOD 阈值上调 0.7 级（上限 +1.0）回到概览层，读数条注明「已临时上调细节阈值」，换城/复位视角清零重试；perf 脚本与真实拖拽不复现的机器上不触发。`scripts/verify-3d.cjs` 通过注入帧样本断言该路径（阈值上调、两层区间同步、文案披露、复位清零）。
- LOD 收益（轮内既有）：同屏体块降至约 1/4–1/13（广州 5.0→11.6、成都 4.9→8.8、深圳 6.6→13.4、上海 9.0→18.6 fps，按上一轮基线口径）。
- **阈值改为随相机浮动**（`lodZoom = 相机 zoom + 1.4`，上限 16）：+1.4 级使同屏面积恒为窗口的约 1/14，窄屏（390px）实测阈值 12.9 级，同一规则；旧实现写死 13.6 级，恰好落在"整窗逐栋同屏"的最坏情况。
- GeoJSON 切片密度对照（`scripts/perf-maxzoom.cjs`，`bu3d-src` maxzoom 14 vs 16，数据 `test-results/perf-maxzoom.json`）：帧时差异无一致方向，维持 14，不增加瓦片与内存。
- 以上均为**软件渲染下界**，带 GPU 的浏览器显著更好；结论只用于比较配置之间的相对改善，不代表真实机器帧率。

> **作废数字**：本轮之前的"逐栋全量 146–219 ms（5–7 fps）""概览层深圳 73.3 ms、提升 2.2×""概览 1,374–2,820 栋（14–24%）""固定阈值 ≥13.6 级切换"分别对应 200m 概览网格与写死阈值的旧实现，已被上表取代；旧截图与旧产物一并归档在 `_archive/2026-11-06-removed/`。

#### 2.0d.2 生长动画（2026-11-06 晚间，年代切换的表现层）
切换年份或「播放演化」时，**新纳入可见集的年代**（深圳例：1990→2000 新揭 ~3,137 栋）按「建成区中心向外」的半径次序，从地面长到 1:1 真实高度（easeOutCubic 缓出）。实现与守恒：

- **不逐帧建网格**：`fill-extrusion-height` 是烘焙进顶点的数据驱动属性，逐帧 `setPaintProperty` 会触发全部瓦片重建（掉帧）；正确姿势是 height 表达式挂 `['coalesce', ['feature-state','gh'], ['get','h']]`（静态回落 1:1 高度 `h`），动画用 `setFeatureState` 增量写 `gh`，只重写受影响楼栋的顶点属性。verify-3d 的高度绑定断言随之更新为 coalesce 形式。
- **分波写入、帧时封顶**：楼栋按（年代序×半径序）切成波次，节拍因触发方式而异：播放 55ms/步×240ms 生长（收在 1.4s 播放节拍内）、单点年份 85ms×420ms；单帧写入上限 700 栋（实测同屏 2,731 栋概览层 + 2,600 栋动画波次帧时中位 45.6ms（≈22fps，p90 53.3ms），比静态概览（31–40ms）高 ~6ms/帧，软件渲染下界）；整个动画只驱动与波次齐拍的 repaint（深圳 2,600 栋 19 帧）。
- **楼群上限 RISE_CAP=2,600**：更大体积的新年代（成都单年代 14,681 栋）超出部分直接以满高出现，动画不改变任何读数或数据；反向切换（收缩）与换城/复位立即清全部 `gh`（`removeFeatureState` 全源复位，`setData` 不清 state、动画被顶掉时残留半高也一并清）。
- 有效源 = 当前可见层（概览/逐栋按 LOD 阈值），跨阈值缩放时另一侧保持满高；`prefers-reduced-motion` 下动画仍执行（几何生长非页面位移，不构成前庭刺激），但页面隐藏（`document.hidden`）时暂停写入。
- 回归断言（`verify-3d.cjs` §8c）：动画中期样本楼必须有 `gh` 写入（40/40 命中），收尾后清零无残留（0/40）。

- **数据可复现**：`python scripts/pick_city_windows.py`（窗口几何搜索，输出 `data/buildings/windows.json`）→ `python scripts/gen_city_buildings.py`（Overpass 拉取 + 年代/高度分级，`--reuse-raw` 可离线重跑，不重复请求 Overpass）。

#### 2.0d.3 底图限流降级·自绘中国标准矢量底图（`scripts/verify-fallback.cjs`，2026-11-08）
背景与机制见页首说明「底图降级合规改造」。本轮复跑 8/8：

```
PASS  天地图 429 → 隐藏天地图并启用自绘降级底图（陆地/省界/十段线）  -> 0.0s 内完成切换
PASS  降级时不存在任何外国栅格备用层（无 Esri/OSM）                  -> []
PASS  十段线源恰含 10 段折线（南海诸岛断续线，内嵌几何校验首末坐标）  -> {segs:10, 首段首点 109.5176, 末段末点 16.2656}
PASS  降级图层位于 3D 建筑之下（不遮楼）                             -> fb 层序=3, 建筑层序=6
PASS  降级横幅披露「自绘中国标准矢量底图」署名                       -> 天地图今日瓦片配额受限，已临时切换到自绘中国标准矢量底图（…），恢复后自动切回
PASS  低层级（z4）注记：省级 ≥20 可见、焦点城市隐藏、南海诸岛可见      -> {prov:32, city:0, dash:1}
PASS  高层级（z11）注记：焦点城市 9 域可见、省级隐藏                  -> {prov:0, city:9}
PASS  限流解除（探测成功）→ 自动切回天地图并拆除自绘注记              -> 90.1s 内切回, 探测 ticks=4
```

复跑要点：
- 注记分级在缓冲区地图 `window.__bufMap` 上断言（3D 地图 `setMinZoom(8.5)`，无法到 z4）；省名标注数 32（34 要素 − 港澳不标名）。
- 恢复切回耗时受 60s 间隔探测×2 轮所限，多轮实测 75.1 / 90.1 / 105.1 / 120.1s，均属机制内波动。
- `verify-3d` 的 LOD/年代断言不受底图降级影响（楼体数据来自 GeoJSON 源而非栅格底图）。

### 2.0e 本地 file:// 提交版验证 7/7 通过（2026-11-08 复跑）
```
PASS  file:// 页面加载且本地数据注册表就位        -> 注册表 32 键, nav=7
PASS  3D 模块在 file:// 下初始化
PASS  首城 3D 分片注入且体块数与 HTTP 版一致       -> 深圳 全量 13465 / 概览 3086
PASS  按需注入：初始只有当前城市的分片             -> 已注入 2 片：shenzhen-overview.geojson, shenzhen.geojson
PASS  LOD 阈值 = 相机 + 1.4 且两层区间互补         -> 相机 13.28 → 阈值 14.68
PASS  模块内下拉切换城市并触发第二分片（其余 7 城仍未注入） -> 成都 全量 20000 / 概览 4921，累计注入 4 片，顶部下拉仍为 shenzhen
PASS  无致命控制台错误
==== 本地版验证：7/7 通过 ====
```
- 同一套断言跑过两遍：`local/` 目录本身，以及 `python scripts/unpack_local.py` 解压 ZIP 后用 `LOCAL_DIR=test-results/zipcheck node scripts/verify-local.cjs` 复跑，结果一致（截图 `test-shots/local-3d-chengdu.png` 来自解压副本）。
- 打包链：`node scripts/build-local.cjs`（18 个建筑分片，31.6 MB，按需注入）→ `python scripts/package_local.py`（189 条目，原始 92.9 MB → ZIP 57.5 MB；中文条目名写 GBK 且不置 UTF-8 标志位，保证 Windows 资源管理器解压不乱码）。
- ZIP 完整性：`unpack_local.py` 解压前先跑 `testzip()`，全部条目 CRC 校验通过、189 个文件全部落盘。

> 2.1 起为**精简前的历史存档**（含历史文化页、改革开放页、六幕演示），不再作为当前验收依据。

### 2.1 冒烟测试 12/12 通过

```
PASS  index 首页                -> cityCards=4
PASS  history 历史文化          -> filters=6,places=20,canvas=true,loadingHidden=true
PASS  reform 时间轴             -> nodes=6,canvas=true,year=1978
PASS  cities 四城记忆           -> tabs=4,introLen=117,canvas=true
PASS  analysis A 建成区         -> tabs=3,stats=5,canvasA=true,api=true,areaA="106.37 km²",newBu="2,571.60 km²"
PASS  analysis B 缓冲区         -> bSelects=2,runBtn=true
PASS  tour 演示恢复             -> overlayShown=true
PASS  history 档案交互          -> archiveLen=110
PASS  reform 播放推进           -> year=1982
PASS  analysis B 执行缓冲       -> stats=4,pie=true
PASS  subpage nav 解析          -> brand=/index.html,home=/index.html,hist=/pages/history.html
PASS  subpage→index 跳转        -> isIndex=true,pathOk=true
==== 结果：12/12 通过 ====
```

### 关键校验点解读
- **areaA="106.37 km²"**：深圳 1980 建成区面积，经 `turf.area`（合并去重叠）测得，非 0、非经纬度平方。✅
- **newBu="2,571.60 km²"**：深圳 1980→2020 新增建成区（差值面）面积，经 `turf.difference`（合并后几何）测得。✅ 此前因 Turf v6 不接受 `FeatureCollection` 入参且未合并，曾返回 `—`；已修复。
- **reform 播放推进 year=1982**：时间轴播放后年份从 1978 推进，时间轴逻辑正确。✅
- **analysis B 执行缓冲 stats=4,pie=true**：缓冲区分析执行后生成 4 个统计盒与饼图 canvas。✅

### 2.2 六幕答辩演示 E2E 9/9 通过

```
PASS  第1幕 全国时空全景   -> file=history.html,  title="第一幕 · 全国时空全景",  step="演示 1 / 6", shown=true
PASS  第2幕 改革开放时间轴 -> file=reform.html,   title="第二幕 · 改革开放时间轴", step="演示 2 / 6"
PASS  第3幕 飞往深圳       -> file=cities.html,   title="第三幕 · 飞往深圳",        step="演示 3 / 6"
PASS  第4幕 卷帘对比       -> file=analysis.html, title="第四幕 · 深圳建成区卷帘对比", step="演示 4 / 6"
PASS  第5幕 缓冲区分析     -> file=analysis.html, title="第五幕 · 缓冲区空间分析",    step="演示 5 / 6"
PASS  第6幕 总结致谢       -> file=index.html,    title="第六幕 · 总结与致谢",        step="演示 6 / 6"
PASS  演示全程无页面异常   -> 0 errors
PASS  退出演示             -> overlayHidden=true, tourParam=null, sessionStorage=null
PASS  上一步边界（首幕点上一部不越界） -> step1=true
==== 六幕演示：9/9 通过 ====
```

> 该测试模拟真实答辩操作：从首页点"▶ 开始演示"起，连点"下一步"走完六幕，逐幕校验落地页面、覆盖层标题与序号，全程零页面异常，并验证退出演示后 URL 与 sessionStorage 均已清理、首幕点"上一步"不越界。

### 2.3 交互细节真实性 5/5 通过

```
PASS  面积数量级合理（真实测地面积）
      -> 深圳1980基期面积≈106.37 km²（经纬度平方近似会是 ~1e-5）
         1980=106.37 km², 2020=2,677.97 km², 变化量=+2,571.60 km², 变化率=+2417.5%, 新增=2,571.60 km²
PASS  缓冲半径真实生效且有区分度（50km≠300km）
      -> 50km: [50 km, 2 个, 10.0%, 2 类] || 300km: [300 km, 5 个, 25.0%, 4 类]
PASS  时间轴节点/按钮可推进年份 -> 1978 → 1980 → 1988, nodes=6
PASS  无图占位不破图           -> imgs=5, allLoaded=true, src=data:image/svg+xml
PASS  完全断网仍可用（零外部依赖） -> 首页cards=4, 历史页places=20, canvas=true, 外部请求=0
==== 交互细节：5/5 通过 ====
```

关键校验点解读：
- **面积量级**：若误用经纬度平方近似，深圳建成区面积会是 `1e-5` 量级；实测 106.37 km² 与 2677.97 km² 符合真实城市量级，证明测地计算生效。
- **缓冲区分度**：50 km 覆盖 2 个点、300 km 覆盖 5 个点，单调不减，符合空间分析预期（早期版本因半径尺度与数据分布不匹配，恒为 1 个点）。
- **完全断网可用**：拦截全部非 `127.0.0.1` 请求后页面与地图仍完全正常，外部请求数为 **0**，证明零 CDN 依赖（真实照片亦已全部本地化，不依赖任何图片外链）。
- **无图不破图**：档案面板主图与画廊缩略图全部 `naturalWidth > 0`，加载失败时回退为中性「照片暂缺」占位（不使用示意图）。

## 3. 修复记录（Bug Fix Log）
| 序号 | 问题 | 原因 | 修复 | 状态 |
| --- | --- | --- | --- | --- |
| 1 | `setHeritageVisible` 未导出 | 错误从 `map.js` 导入 | 改为从 `layers.js` 导入 | ✅ |
| 2 | 子页 `data/*.json` 全部 404 | 使用了根相对路径 | 新增 `dataUrl()` 自动加 `../` | ✅ |
| 3 | 分析B"Style is not done loading" | 样式未加载完即加图层 | `ensureMainMap(onReady)` 延迟加层 | ✅ |
| 4 | Turf 面积=0 / difference 报错"not a valid Polygon" | 生成脚本 `circle_polygon` 返回 `[ring]` 导致 MultiPolygon 坐标多嵌套一层 | 改返回 `ring`，并重新生成 `urban-expansion/*` | ✅ |
| 5 | 建成区面积被重叠区重复计入 + 差值面错误 | `turf.area` 对重叠 MultiPolygon 子面求和；`turf.difference` 不接受 FeatureCollection | 新增 `mergeBuiltup()` 先 `turf.union` 合并再求面积/差值，并传 `features[0]` | ✅ |
| 6 | 子页内页头导航/演示跳转 404 | 页头 NAV 与 `tour.js` 使用裸相对路径（`index.html`/`pages/...`），在 `pages/` 子目录下解析为 `/pages/index.html` 等错误地址 | 新增 `pageHref()`（与 `dataUrl()` 同逻辑，按是否在 `pages/` 决定加 `../`），页头 NAV、品牌链接、演示跨页跳转统一改用 `pageHref()`；品牌改为可点击回首页 | ✅ |
| 7 | `file://` 直接打开页面卡住 | 浏览器禁止本地文件协议加载 ES Module / fetch 本地 JSON/GeoJSON，地图一直显示"地图加载中..." | 新增 `guardFileProtocol()` 在 4 个页面入口检测 `file://`，替换 loading 为可见提示；首页城市卡片同样提示；新增 `start-server.bat` 双击启动脚本 | ✅ |
| 8 | 演示中偶发 `Cannot read properties of undefined (reading 'getLayer')` | **根因**：`bindLifecycle()` 在 `pagehide` 销毁地图，但改革页时间轴 `play()` 的 `setInterval` 未清理，跳转后仍在对已销毁地图调 `getLayer`（其内部 `this.style` 已undefined） | ①`layers.js` 新增 `mapReady()` 守卫覆盖全部图层入口（检测 `_wbRemoved`/`style===undefined`/`isStyleLoaded` + try/catch）；②`reform.js` 在 `pagehide` 执行 `TIMELINE.pause()+destroy()` 根治定时器泄漏（该页已于 2026-10-28 归档）；③`analysis.js` 用 `whenMapReady()` 轮询替代 `once('load')`（避免事件已过导致永不回调、统计框为空） | ✅ |
| 9 | 缓冲半径无区分度（任何半径恒为 1 个点） | 半径档位为 0.5–5 km 街区尺度，而 20 处遗产点跨城市间距普遍 >70 km，尺度与数据分布严重不匹配 | 半径档位扩充为 1/5/50/100/300 km + 自定义（上限 2000 km）；默认中心改沙面历史街区（与十三行 0.8 km）、默认 100 km；镜头缩放按尺度自适应 | ✅ |
| 10 | 缓冲区结果文案不完整 | `renderBufferDetail` 中残留空占位表达式（`within.length ? '' : ''`、`${''}`），半径未显示 | 重写文案，补全半径与"未覆盖其他点（该点较孤立）"的说明 | ✅ |
| 11 | 卷帘对比看不到起始年建成区 | `map-b`（对比年）默认完整覆盖 `map-a`，`clip-path` 仅在拖拽时设置，初始化未应用裁剪 | `buildLabA` 结束时主动应用一次裁剪；因容器可能仍为 `display:none`（宽度为 0），改为"宽度有效才应用 + 轮询重试"，避免算出 `NaN%` | ✅ |
| 12 | 图片抓取混入 8 张"图片不存在"占位图 | 百度百科词条页含 `api.map.baidu.com/images/iw3.png`（固定 690×786 / 7719 字节）占位图，体积阈值过低未拦住 | 选图规则排除该域与体积下限提至 20 KB；并按内容哈希 + URL 双重去重 | ✅ |
| 13 | 城市封面抓到静物特写（标本盘/蝴蝶/稻米） | 仅按"面积最大"排序，大尺寸静物排在城市全景之前 | 选图改为优先横图宽幅（ar 1.1–2.4）、`/pic/` 词条主图加权、`/smart/` 推广图降权；厦门改用鼓浪屿词条 | ✅ |
| 14 | 画廊报 `appendChild ... not of type 'Node'` | `.map()` 返回数组直接传入 `appendChild` | 用 `el('div', {class:'gallery'}, [...])` 包裹为容器节点 | ✅ |

## 4. 手动核查表（建议答辩前逐项点检）
- [ ] 启动服务后首页正常显示：四城卡片可点，两个入口分别为四城记忆/分析实验室，导航仅三项。
- [ ] 四城记忆：深圳/上海/广州/厦门切换正常；地标与改革事件标记可点，富卡片不遮挡图层面板；人口/GDP 双轴图渲染。
- [ ] 四城记忆：测距/测面工具可用；底图在线/离线切换可用。
- [ ] 分析实验室模块一：九城下拉切换后镜头立即跳转；起止年份切换后统计、趋势图与新增建成区高亮更新；卷帘可拖。
- [ ] 分析实验室模块二：预设城市或地图点选中心；调整半径后测地面积与命中数量变化；SQL 控制台展示 `ST_Buffer`/`ST_DWithin`。
- [ ] 分析实验室模块三：新增文化地标可写入（无 PostGIS 时走回退引擎）；WFS `GetFeature`/`GetCapabilities` 有响应。
- [ ] 浏览器控制台无报错（F12 查看）。
- [ ] 断网情况下（仍经本地服务）页面与地图正常，自动降级本地增强底图。
- [ ] **误用 file:// 打开时，页面给出明确运行提示而非一直转圈。**

## 5. 已知非阻断告警
- MapLibre 可能输出少量 "Vector tile ... not found" 类的内部日志（因使用空白样式无瓦片），不影响渲染与功能，已被测试忽略。
- 图片字段为 `null` 时的 `loadImage` 失败属预期，已由 SVG 占位回退处理，不产生破图。
