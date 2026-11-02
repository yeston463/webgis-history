# 测试记录（Test Records）

本项目提供**三套自动化测试**（均基于 Playwright 无头 Chromium，视口 1600×900），当前 **10/10 全部通过**（2026-10-31 完成 blueyard.com 设计系统迁移后复跑）：

| 脚本 | 覆盖目标 | 项数 |
| --- | --- | --- |
| `scripts/smoke-test.cjs` | 首页、四城记忆、分析实验室、富卡片交互、导航仅保留两模块 | 5 |
| `scripts/detail-test.cjs` | 建成区测地面积（AUE）、缓冲区半径真实生效、断网降级 | 3 |
| `scripts/verify-basemap.cjs` | 天地图底图、图层面板、遗产/改革标记、卷帘双图 + AUE + 缓冲区模块 | 2 |

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

### 2.0 冒烟测试 5/5 通过（BlueYard 风格迁移后）
```
PASS  index 首页          -> cityCards=4,chapters=2,nav=时空序厅/四城记忆/分析实验室,noRemovedNav=true
PASS  cities 四城记忆      -> tabs=4,introLen=159,canvas=true,mapW=957,navOk=true
PASS  cities 富卡片交互    -> overlay=true,len=96
PASS  analysis 分析实验室  -> stats=5,bufStats=4,canvasA=true,noTabs=true,noB=true,areaA="145.04 km²"
PASS  subpage nav 解析     -> brand=/index.html,cities=/pages/cities.html,analysis=/pages/analysis.html,navCount=3
==== 结果：5/5 通过 ====
```

### 2.0b 交互细节 3/3 + 底图验证 2/2 通过
```
PASS  建成区面积真实测地（AUE）        -> 深圳 1990=145.04 km²，2014=1,257.29 km²
PASS  缓冲区半径真实生效（100→250km）  -> 31,482.46 km²→196,744.15 km²，命中 7→8
PASS  完全断网仍可用                   -> 离线底图、水系、九段线、提示横幅均正常
PASS  cities 底图+面板+双标记(无聚合)+地图加宽 -> mapW=957，legendRows=11
PASS  analysis 卷帘双图+AUE数据+缓冲区模块    -> bufStats=4，SQL 含 ST_Buffer/ST_DWithin，credit 标注 AUE / GHSL
```

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
