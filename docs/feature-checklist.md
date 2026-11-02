# 功能清单与实现状态（Feature Checklist · 全栈升级版）

按优先级排序：**PostGIS/GeoServer 空间架构 > 真实数据与正确空间分析 > 系统稳定性 > 交互体验 > 视觉美观**。
状态：✅ 已实现并验证。

---

## 一、全栈空间架构与基础约束
| 功能 | 状态 | 说明 |
| --- | --- | --- |
| **PostgreSQL + PostGIS 空间数据库** | ✅ | `webgis_history` 库，5 张空间表（`GEOMETRY` + `GIST` 索引）+ 省域空间统计视图 |
| **GeoServer OGC WMS / WFS 服务** | ✅ | 自动创建 `webgis` 工作空间与 `postgis_history` 数据存储，发布 4 个空间图层 |
| **Node.js 空间后端 (`server/server.cjs`)** | ✅ | 提供 REST 空间分析接口（`/api/spatial/buffer`、`/api/spatial/builtup`、`/api/heritage`）与 OGC 网关 |
| 原生 HTML/CSS/ES Module（前端零框架） | ✅ | 严格符合，未引入 Vue/React 等 |
| 本地 vendor 第三方库 | ✅ | MapLibre GL / ECharts / Turf.js 均在 `vendor/` |
| 天地图在线底图 + 本地增强离线底图 | ✅ | 支持图层面板一键切换；断网自动降级 |

## 二、首页·序厅
| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 立意 hero 区 | ✅ | 标题/副标题/入场动画 |
| 功能入口 | ✅ | 数据指标带 + 四城记忆 / 分析实验室两大章节 |
| 四城快捷卡片 | ✅ | 来自 `cities.json`，点击跳转 |

## 三、四城记忆 (`pages/cities.html`)
| 功能 | 状态 | 说明 |
| --- | --- | --- |
| 四城切换（深圳/上海/广州/厦门） | ✅ | `?city=` 参数联动 |
| **1980–2020 人口与 GDP 双轴联动图** | ✅ | 激活 `city-statistics.json`，柱线双轴展示城市跃迁 |
| 历史地标 + 关联事件富卡片（避让面板） | ✅ | 自动避让左上角图层面板，不遮挡控件 |
| 城市影像画廊 | ✅ | 每城 1 张封面 + 4 张城市/遗产实景，支持点击打开大图 |
| 四城全量跳转建成区与缓冲区分析 | ✅ | 深圳、上海、广州、厦门四城均支持一键进入分析实验室 |

## 四、GIS 时空分析实验室 (`pages/analysis.html`)
| 功能 | 状态 | 说明 |
| --- | --- | --- |
| **模块一：九城建成区时空卷帘对比** | ✅ | 深圳/上海/广州/厦门/北京/杭州/武汉/成都/青岛九城三期（1990/2000/2014），左起始年、右对比年+新增差值层 |
| **多斑块合并去重与内存级缓存** | ✅ | `PostGIS ST_UnaryUnion` / `mergeBuiltup` 缓存，消除重复计算卡顿 |
| **模块二：PostGIS 缓冲区与古今要素共现** | ✅ | `ST_Buffer(geography)` + `ST_DWithin` + `ST_Distance`，支持地图任意点选与 30–250km 半径；展示共现数量与距离，不直接推断历史因果 |
| **PostGIS 兼容 SQL 控制台** | ✅ | 展示当前空间分析对应的 SQL 语句与距离明细 |
| **模块三：PostGIS 在线空间入库与 OGC 探针** | ✅ | 支持在线新增文化地标写入 PostGIS (`ST_MakePoint`) 及实时请求 GeoServer WFS 要素流 |
