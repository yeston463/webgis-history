# GIS 方法学说明（GIS Methods）

本文件说明《山海新篇》**建成区时空对比**所采用的**空间分析方法、算法依据与精度处理**。核心原则：**面积一律采用测地计算，严禁经纬度平方近似；重叠区域不重复计入。**

---

## 0. 统一约定

- **坐标与投影**：前端地图为 Web Mercator（EPSG:3857）显示；面积计算使用 Turf.js 的**球面几何**（`turf.area` 基于球体模型，单位为平方米），不依赖显示投影的平面量算。
- **底图**：默认天地图在线瓦片（合规国界/南海诸岛/九段线）；网络不可用时自动降级为本地增强底图（省界 + Natural Earth 水系/道路/铁路 + 合规地名 + 九段线），均不进入面积计算。
- **空间运算库**：Turf.js 6.5.0（本地 vendor）。

---

## 1. 功能A · 城市建成区卷帘对比（Spatial Change / Area）

### 1.1 目标
- 统计研究区内建成区面积（起始年 vs 对比年）。
- 计算面积变化量与变化率。
- 显示新增建成区的空间分布（差值面）。

### 1.2 数据与图层
- 数据：`data/urban-expansion/{city}_{year}.geojson`，采用 **Atlas of Urban Expansion（AUE, 2016）**真实建成区轮廓——由 Landsat 影像解译的城市 urban extent，重投影至 WGS84 后为若干多边形斑块（一个 `FeatureCollection`，含多个 `Polygon`）。三个时期约 1990 / 2000 / 2014。
- 渲染：双图卷帘——左图为起始年（橙色），右图为对比年（蓝青色），右图通过 `clip-path` 按卷帘位置裁切，形成左右对比的"拉帘"效果（`map.css` + `analysis.js` 拖拽逻辑）。

### 1.3 面积计算（重点）
- **逐个斑块测地面积求和**本不可取：斑块之间会重叠，直接对 `MultiPolygon` 各子面求和会**重复计入重叠区**。
- **正确做法**：先用 `turf.union` 将同年份的所有斑块合并为单一多边形（`mergeBuiltup()`），再对合并结果调用 `turf.area` 求总面积。
  - 合并后面积 = 真实覆盖面积（去重叠）。
  - 例（深圳 1990→2014，AUE 真实数据）：1990 合并面积 ≈ 145 km²；2014 合并面积 ≈ 1257 km²。
- **变化量**：`Δ = 面积(对比年) − 面积(起始年)`。
- **变化率**：`率 = Δ / 面积(起始年) × 100%`。

### 1.4 新增建成区（差值面）
- 对**合并后的**两个年份几何做布尔差：`turf.difference(合并(对比年), 合并(起始年))`。
- 结果几何即为"对比年有、起始年无"的建成区空间分布，渲染为金色高亮面（`newbu` 图层）。
- 其面积即为"新增建成区面积"，与 `Δ` 在几何意义上一致（重叠处理后）。
- **注意**：Turf v6 的 `difference` 不接受 `FeatureCollection` 直接入参，须传入要素（`features[0]`）；本项目已按此修正并先合并，结果已通过 `turf.area` 实测校验。

### 1.5 趋势图
- 对城市所有可用年份分别合并求面积，得到面积—年份序列，用 ECharts 折线图（面积填充）展示扩张趋势。

---

## 2. 地图与性能

### 4.1 实例生命周期
- 每页至多一个主地图实例；分析实验室功能A 使用双实例（`mapA`/`mapB`）做卷帘，`pagehide` 时统一 `remove()` 释放，避免 WebGL 上下文泄漏。
- 图层增删统一经 `ensureSource/ensureLayer/removeLayer/removeSource` 守卫，避免重复添加报错。

### 4.1.1 就绪/销毁竞态防护（MapLibre getLayer 抛错）
**症状**：`TypeError: Cannot read properties of undefined (reading 'getLayer')`，演示第二幕之后偶发，整页 JS 中断。

**根因**：`MapLibre.getLayer()` 内部读 `this.style`。以下两种状态会使 `style` 为 `undefined`：

| 情形 | 触发路径 |
| --- | --- |
| ① 样式尚未 load 完成 | 演示模式自动播放时间轴，`setInterval` 中的 `setYear` 在地图就绪前触发 |
| ② **地图已被 `remove()` 销毁** | `bindLifecycle()` 在 `pagehide` 销毁地图，但**时间轴的 `setInterval` 未被清理**；跳转离开改革页后定时器仍在跑，下一 tick 就对已销毁地图调用 `getLayer` |

情形 ② 是本项目的真实根因——堆栈定位为 `setReformYear ← Timeline.onYearChange ← Timeline.setYear`，发生在 `reform.html` 而非分析页（该页已于 2026-10-28 按站点精简要求归档，守卫逻辑仍保留）。

**修复（三重保障）**：
1. `layers.js` 新增 `mapReady(map)` 守卫，在**所有**图层操作入口（`setReformYear` / `setReformVisible` / `setHeritageFilter` / `setHeritageVisible`）统一拦截：同时检测 `_wbRemoved`、`style === undefined`、`isStyleLoaded()`，并用 try/catch 兜底，异常一律视为"不可操作"而非抛出。
2. `reform.js` 在 `pagehide` 时执行 `TIMELINE.pause() + TIMELINE.destroy()`，**根治定时器泄漏**。
3. `analysis.js` 新增 `whenMapReady(map, cb, timeoutMs)` 轮询等待，处理情形 ①。

> **另一处实现陷阱（曾导致回归）**：等待就绪**不能**用 `map.once('load', cb)`。
> `load` 是一次性事件——若它在注册监听之前就已触发，`once` 将**永不回调**，导致
> `loadBuiltup()` 静默提前 `return`、统计框始终为空（`stats=0`）。这种"事件已过"的竞态
> 在快慢机器上表现不一致，极难排查。故`whenMapReady` 采用**轮询 `isStyleLoaded()`**
> （150 ms 间隔、8 s 超时兜底），无论事件是否已触发都能最终执行。

> **方法论要点**：跨页面演示会频繁创建与销毁地图实例。任何持有地图引用的**异步/定时回调**都必须随页面生命周期清理，否则必然在跳转后操作到已销毁对象。

### 4.2 面积精度说明
- `turf.area` 为球面测地面积，与真实椭球（WGS84）存在微小偏差（城市尺度下可忽略）。
- AUE 建成区轮廓为 Landsat 解译近似值，边界存在解译误差；面积量级符合真实城市，但不宜作精确年表。

### 4.3 离线约束
- 所有库、数据均本地化；底图在线不可用时自动降级本地增强底图，断网不影响页面可用。

---

## 3. 方法学自检清单
- [x] 面积用 `turf.area` 测地计算，无经纬度平方近似。
- [x] 多斑块建成区先合并去重叠再求面积。
- [x] 新增建成区用 `turf.difference`（合并后几何）真实求差。
- [x] 地图就绪竞态已防护：图层入口统一 `mapReady()` 守卫 + `whenMapReady()` 轮询，卷帘加载不会因 style 未加载抛错。
- [x] 页面卸载时清理地图实例，避免操作已销毁对象。
- [x] 在线瓦片持续失败时自动降级本地增强底图，避免白图。
- [x] 四城记忆页地标/事件富卡片与双轴图表正常（Playwright 冒烟测试验证）。
- [x] 分析实验室缓冲区模块与九城切换正常（Playwright 冒烟/细节测试验证）。
- [x] 建成区采用 AUE 真实数据，来源与"约 1990/2000/2014、解译近似"已在界面与文档标注。
