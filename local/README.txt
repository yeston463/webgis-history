山海新篇 · 本地文件版
========================================

打开方式
1. 使用最新版 Chrome 或 Edge。
2. 直接双击本目录下的 index.html（或“打开本地版.bat”）。
3. 不需要 Node.js、PostGIS 或 GeoServer。

本版本的能力
- 首页、四城记忆、分析实验室的全部地图与图表可用。
- 九城建成区卷帘、测地面积、PostGIS 缓冲区的等价计算由本地 Turf.js 测地引擎完成。
- 地图统一使用天地图在线底图（GS(2023)336号），缩放上限锁定至原生最高瓦片级（需联网加载底图瓦片）。

本地版不启用的部分
- GeoServer WFS 实时请求与 PostGIS 在线入库需要运行完整 Node 后端，本地版已在“服务与入库”模块中标注并禁用相关按钮。
- 完整全栈版本的启动方式见项目根目录 README 与 server/ 目录。

数据与脚本
- 所有 JSON / GeoJSON 已内嵌到 js/local-data-*.js，避免 file:// 的 fetch 限制。
- 页面逻辑已打包到 js/*.bundle.js，避免 file:// 的 ES Module 限制。
