# 山海新篇 · 四城记忆与 GIS 时空分析实验室 (WebGIS 全栈版)

> 🌐 **在线演示（GitHub Pages）**：[https://yeston463.github.io/webgis-history/](https://yeston463.github.io/webgis-history/)  
> 一个基于 **Node.js + PostGIS 空间数据库 + GeoServer (OGC WMS/WFS) + MapLibre GL JS + Turf.js** 的全栈 WebGIS 课程大作业。
> 聚焦"真实空间数据 + PostGIS/Turf 椭球测地空间分析 + OGC 标准服务"，支持现场答辩与自由探索。
> 当前站点仅保留**四城记忆**与**分析实验室**两大模块；历史文化/改革开放独立页已归档至 `_archive/2026-10-28-removed/`。

---

## 0. 一句话介绍

《山海新篇》以 **太阳系图册式的空间叙事 + 专业 GIS 工作台**视觉语言，通过 **PostGIS 空间数据库**与 **GeoServer OGC 服务**，将**四城记忆**（深圳、上海、广州、厦门的历史地标、改革事件与 1980-2020 人口 GDP 跃迁）与**GIS 时空分析实验室**（九城多期建成区卷帘与布尔差值、PostGIS 缓冲区要素共现、GeoServer WFS/WMS 控制台与 PostGIS 在线空间入库）统一到多源底图之上。

> 视觉方向：从 [blueyard.com](https://blueyard.com/) 提取的 **Instrument Sans + Geist Mono**、墨色 `#090b11`、白色直角卡片与细边框，叠加桃色/珊瑚/淡紫的太阳系渐变与颗粒质感；中文标题回落到系统中文无衬线字体。大标题采用负字距与留白，数据使用等宽字体，界面控件退居安静的辅助层。主题锁定为浅色图册模式，以保证与在线/离线地图瓦片和专题数据配色一致。
> 设计提取记录见 `.extract-design-system/` 与 `design-system/`；提取器只捕获到字体/间距，canvas 渐变背景与三类强调色由页面实测补录，最终实现集中在 `css/blueyard.css` 与 `css/responsive-blueyard.css`。

---

## 1. 全栈 WebGIS 技术架构

| 层级 | 采用技术 | 核心职责与空间能力 |
| --- | --- | --- |
| **空间数据库层** | **PostgreSQL 18 + PostGIS 3.x** (`webgis_history`) | 存储 5 张空间表（`heritage_sites`、`reform_events`、`cities`、`urban_builtup`、`china_provinces`），全部建立 `GIST` 空间索引；提供 `ST_Buffer(geography)`、`ST_DWithin`、`ST_UnaryUnion`、`ST_Difference`、`ST_Area(geography)` 与省域空间连接视图 `v_province_spatial_stats` |
| **GIS 服务器层** | **GeoServer 2.27** (`workspace: webgis`, `store: postgis_history`) + 内置 OGC 网关 | 发布标准 **OGC WMS / WFS** 服务（`webgis:heritage_sites`、`webgis:reform_events`、`webgis:urban_builtup`、`webgis:china_provinces`），支持 `GetCapabilities` 与 `GetFeature` GeoJSON 矢量流 |
| **Web 后端层** | **Node.js 原生空间后端** (`server/server.cjs` + `server/pg-wire.cjs`) | 零外部依赖直连 PostGIS Wire Protocol v3，提供 RESTful 空间分析接口（`/api/spatial/buffer`、`/api/spatial/builtup`、`/api/spatial/provinces-stats`、`/api/heritage` CRUD）及 GeoServer 反向代理与离线降级兜底 |
| **Web 前端层** | 原生 HTML5 / CSS3 / **ES Module** + **MapLibre GL JS** + **Turf.js 6.5** + **ECharts 5.5** | 国家地理信息公共服务平台「天地图」在线矢量底图（`vec_w` + `cva_w`，审图号 GS(2023)336号），严格锁定原生最高级别 Z17 防止空白瓦片；交互式测地距离/面积量算工具、四城遗产/改革事件图层联动、人口/GDP 双轴图表 |

---

## 2. 运行方式（必读）

### 方式一：Windows 一键启动（推荐）

直接双击项目根目录的 **`start-server.bat`**：
- 自动启动 **Node.js + PostGIS + GeoServer 空间后端** (`node server/server.cjs`，监听 `http://127.0.0.1:8000`)；
- 自动初始化本地 PostgreSQL/PostGIS 数据库 `webgis_history`（端口 5432）、导入全部空间要素并向 GeoServer（端口 4000）同步发布 `webgis` 工作空间图层；
- 自动打开浏览器访问 `http://127.0.0.1:8000/`。

### 方式二：命令行启动

```bash
# 1. 启动 Node.js + PostGIS + GeoServer 全栈后端（默认端口 8000）
node server/server.cjs

# 2. 单独执行 PostGIS 建库入库与 GeoServer 图层发布脚本（可选）
node server/init-postgis-geoserver.cjs

# 3. 浏览器访问
http://127.0.0.1:8000/
```

> **高可靠双引擎降级机制**：若答辩现场电脑未启动 PostgreSQL 或 GeoServer 服务，`server/server.cjs` 会自动降级到内置的 **Node.js + Turf.js 测地空间计算引擎** 与 **内置 OGC WFS/WMS 网关**，所有空间分析、WFS 请求与地图交互均 100% 正常可用、零报错。

### 方式三：本地文件版（无需服务器，适合提交）

```bash
node scripts/build-local.cjs
```

生成自包含的 `local/` 目录。直接双击 `local/index.html`（或 `打开本地版.bat`）即可在 Chrome/Edge 中查看，不需要 Node、PostGIS 或 GeoServer。该版本把 JSON/GeoJSON 内嵌为本地数据注册表、把页面逻辑打包为经典脚本，绕过 `file://` 对 ES Module 与 `fetch` 的限制；建成区与缓冲区分析由 Turf.js 完成，GeoServer 在线入库/WFS 模块会明确标注并禁用。

---

## 3. 目录结构

```
webgis-history/
├── index.html              # 首页·序厅（hero + 数据指标 + 两大章节 + 四城卡片）
├── pages/                  # 两个功能子页
│   ├── cities.html         # 四城记忆（深圳/上海/广州/厦门 + 1980–2020 人口与 GDP 双轴联动图表）
│   └── analysis.html       # GIS 时空分析实验室（九城建成区卷帘对比 + PostGIS 缓冲区耦合分析 + OGC/PostGIS 在线入库）
├── css/                    # 设计令牌与 BlueYard 皮肤
│   ├── base.css            # 令牌、本地字体、排版与可访问性基线
│   ├── blueyard.css        # 太阳系渐变、白色卡片、固定页头与页面皮肤
│   └── responsive-blueyard.css # 新皮肤的窄屏覆盖
├── design-system/          # extract-design-system 的原始令牌输出（仅字体/间距）
├── .extract-design-system/ # 提取中间产物 raw.json / normalized.json
├── server/                 # Node.js + PostGIS + GeoServer 后端
│   ├── server.cjs          # 主 HTTP 服务、REST 空间分析 API 与 OGC WFS/WMS 网关
│   ├── pg-wire.cjs         # 纯原生 PostgreSQL v3 Wire Protocol 客户端
│   ├── init-postgis-geoserver.cjs # 自动建库、导入 PostGIS 空间表并发布 GeoServer 图层
│   └── sql/
│       └── init_postgis.sql# PostGIS 空间表结构、GIST 索引与省域空间统计视图脚本
├── js/                     # 12 个前端 ES 模块
│   ├── gis-tools.js        # 交互式测地测距/测面、GeoServer WFS 图层与专题图层工具
│   ├── layerpanel.js       # 通用图层面板（图层显隐 + 量算工具 + 真实语义芯片图例）
│   ├── map.js              # 地图实例管理、精确 Web Mercator 比例尺/分辨率状态栏
│   ├── basemap.js          # 底图引擎（天地图在线矢量瓦片 + 缩放上限硬锁管控）
│   ├── layers.js           # 遗产点 / 改革事件矢量芯片图层与省域真实边界高亮
│   ├── charts.js           # ECharts 墨色/珊瑚/淡紫数据主题（折线/面积、柱状、人口+GDP双轴图）
│   ├── cities.js           # 四城记忆页逻辑
│   └── analysis.js         # 三大 GIS 实验室前端逻辑（含多边形合并内存缓存与带图弹窗）
├── _archive/               # 归档历史与离线底图备份文件
├── data/                   # 空间与统计数据集
│   ├── heritage.geojson    # 34 处历史文化遗产（四城重点全覆盖，配有真实照片与史料出处）
│   ├── reform-events.json  # 32 起改革开放关键空间事件（1978–2020，沿海开放城市精准至开发区/港区）
│   ├── cities.json         # 深圳/上海/广州/厦门四城元信息与大事记
│   ├── city-statistics.json# 四城 1980–2020 人口与 GDP 统计序列（附权威统计年鉴出处）
│   ├── china-provinces.geojson # 中国省级行政区划（WGS84）
│   └── urban-expansion/    # 九城多时期建成区轮廓（1990/2000/2014，AUE 遥感真实解译）
├── vendor/                 # 本地第三方库（MapLibre GL / ECharts / Turf.js）
├── assets/                 # 本地化遗产与城市实景照片（附 credits.json）
└── scripts/                # 数据生成与 Playwright 自动化测试套件
```

---

## 4. 核心 GIS 空间分析与亮点功能

1. **九城多期建成区卷帘对比与布尔差值 (`pages/analysis.html` 模块一)**：
   - 覆盖**深圳、上海、广州、厦门、北京、杭州、武汉、成都、青岛**九座都会（1990 / 2000 / 2014 三期）；
   - 先通过 `PostGIS ST_UnaryUnion` / `turf.union` 合并同一年份多斑块消除重叠（带内存级缓存，切换秒响应），再以 `ST_Area(geom::geography)` / `turf.area` 计算球面测地面积；
   - 通过 `ST_Difference` / `turf.difference` 提取新增建成区空间分布（右图金色高亮层，支持图层面板一键显隐）。
2. **PostGIS 缓冲区与古今要素共现检索 (`pages/analysis.html` 模块二)**：
   - 支持预设城市或**直接点击地图任意位置**作为中心点，自由选择 30–250 km 缓冲半径；
   - 后端执行 `ST_Buffer(geog, r)` 与 `ST_DWithin`、`ST_Distance`，返回精确测地缓冲面及圈内命中的历史文化遗产与改革开放事件距离明细表，用于观察空间共现关系，不直接推断历史因果，并展示对应的 **PostGIS Spatial SQL**。
3. **GeoServer OGC (WFS/WMS) 服务与 PostGIS 在线空间入库 (`pages/analysis.html` 模块三)**：
   - 支持在线填写新文化地标名称、类别与经纬度，通过 `INSERT INTO heritage_sites ... ST_SetSRID(ST_MakePoint(lng, lat), 4326)` 实时写入 PostGIS 并在地图渲染；
   - 支持一键请求 GeoServer `WFS GetFeature` / `GetCapabilities` 并实时预览标准 OGC GeoJSON 响应。
4. **四城记忆与站点通用交互 (`pages/cities.html`, `js/gis-tools.js`)**：
   - 四城记忆页内置 **📏 测距（球面测地长度）** 与 **📐 测面（球面测地面积+周长）** 工具，以及文化遗产/改革事件图层开关与富信息档案卡片；
   - 四城记忆页内置 **1980–2020 常住人口与 GDP 双轴时空联动图表**；
   - 分析实验室支持九城下拉切换、地图任意点选缓冲区中心与 30–250 km 半径联动。
