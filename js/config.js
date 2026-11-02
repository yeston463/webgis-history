// config.js - 地图底图与缩放边界配置
//
// 说明：
//  - 全局统一采用国家地理信息公共服务平台「天地图」在线矢量底图（vec_w 球面墨卡托 + cva_w 中文注记），
//    审图号 GS(2023)336号，完整包含中国国界、南海诸岛与九段线，符合《地图管理条例》。
//  - 天地图 vec_w / cva_w WMTS 瓦片尺寸为 256×256，最高原生瓦片级别为 TILEMATRIX = 18（19 级起无数据）。
//    MapLibre GL JS 以 512px 为基准计算缩放层级（256px 栅格源请求级别为 Math.round(zoom + 1)），
//    因此将地图实例 maxZoom 锁定为 17（对应天地图原生最高 18 级 1:1 清晰度），到达上限即禁止继续放大，
//    从根源避免超限空白瓦片或过度拉伸模糊。

// 天地图浏览器端密钥
export const TIANDITU_TK = '0115fe79a0a766de4b4d1ea971fe18c3';

// 天地图 WMTS 最高原生瓦片矩阵级（TILEMATRIX 1..18）
export const TIANDITU_TILE_MAX_ZOOM = 18;

// MapLibre 地图缩放上下限（maxZoom=17 对应 256px WMTS TILEMATRIX=18 原生 1:1 上限）
export const TIANDITU_MIN_ZOOM = 2.2;
export const TIANDITU_MAX_ZOOM = 17;

// 天地图申请指引（密钥失效时提示用户）
export const TIANDITU_APPLY_URL = 'https://console.tianditu.gov.cn/api/key';

// 建成区数据说明（Atlas of Urban Expansion 真实遥感解译数据）
export const SIMULATED_NOTE = '建成区轮廓采用 Atlas of Urban Expansion（AUE, 2016）真实数据（Landsat 解译，约 1990/2000/2014）；面积由 Turf.js 测地计算。';

// 生成天地图单张 WMTS 瓦片 URL（用于可用性探测）
export function tiandituTileURL(layer, z, x, y) {
  const sub = 't' + ((x + y) % 8);
  return `https://${sub}.tianditu.gov.cn/${layer}/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer.split('_')[0]}&STYLE=default&TILEMATRIXSET=w&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=tiles&tk=${TIANDITU_TK}`;
}
