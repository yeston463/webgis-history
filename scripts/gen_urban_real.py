# gen_urban_real.py — 用 GHSL (JRC) 真实建成区栅格生成四城建成区轮廓 GeoJSON
#
# 数据源：GHS-BUILT-S R2023A（欧盟 JRC，公开免费，Mollweide EPSG:54009，100m，built_surface=m²/格）
#   引用：Pesaresi, Martino; Politis, Panagiotis (2023): GHS-BUILT-S R2023A. European Commission, JRC.
#   DOI: 10.2905/9F06F36F-4B11-47EC-ABB0-4F8B7B1D72EA
#
# 做法：本地 zip 内 tif 用 /vsizip/ 只读中国窗口 → 栅格矢量化(built_surface>阈值) →
#       合并为整体轮廓 → 重投影 Mollweide→WGS84 → 按城市 bbox 裁剪 → 简化 → 写 GeoJSON。
#
# 用法（在项目根目录，用 geo venv 的 python）：
#   python scripts/gen_urban_real.py <epoch>          # 例：python scripts/gen_urban_real.py 2020
# 约定：zip 已下载到 data/urban-expansion/_ghsl/E<epoch>.zip，处理后删除以节省磁盘。

import sys, os, json
import numpy as np
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform_geom
from shapely.geometry import shape, mapping, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GHSL_DIR = os.path.join(ROOT, "data", "urban-expansion", "_ghsl")
OUT_DIR = os.path.join(ROOT, "data", "urban-expansion")
INNER = "GHS_BUILT_S_E{epoch}_GLOBE_R2023A_54009_100_V1_0.tif"

# 中国读取窗口（WGS84，覆盖深圳+上海），比城市 bbox 宽，避免边缘效应
CHINA_WGS = (110, 18, 124, 34)  # lngmin, latmin, lngmax, latmax

# 每个城市：需要该 epoch 时的裁剪 bbox（WGS84）与简化容差（度）
CITIES = {
    "shenzhen": {"bbox": (113.72, 22.42, 114.66, 22.90), "simplify": 0.0008},
    "shanghai": {"bbox": (120.80, 30.60, 122.10, 31.70), "simplify": 0.0008},
}
# 每个 epoch 生成哪些城市文件
EPOCH_CITIES = {
    1980: ["shenzhen"],
    1990: ["shanghai"],
    2000: ["shenzhen", "shanghai"],
    2020: ["shenzhen", "shanghai"],
}
# 建成区阈值：built_surface(m²/格) >= 该值视为建成。0=任一建成即计入；适当提高可去噪。
THRESHOLD = 200  # m²（即该 100m 格至少 2% 建成），滤除零星噪点

def read_china_window(zip_path, epoch):
    inner = INNER.format(epoch=epoch)
    vsi = f"/vsizip/{zip_path}/{inner}"
    with rasterio.open(vsi) as src:
        from rasterio.warp import transform_bounds
        mol = transform_bounds("EPSG:4326", src.crs, *CHINA_WGS, densify_pts=21)
        win = rasterio.windows.from_bounds(*mol, transform=src.transform)
        win = win.round_offsets().round_lengths()
        data = src.read(1, window=win)
        wtransform = src.window_transform(win)
        return data, wtransform, src.crs, src.nodata

def polygonize_city(data, wtransform, src_crs, city):
    cfg = CITIES[city]
    mask = data >= THRESHOLD
    geoms = []
    for geom, val in shapes(data.astype("float32"), mask=mask, transform=wtransform):
        geoms.append(shape(geom))
    if not geoms:
        return None
    merged = unary_union(geoms)  # 合并为整体轮廓（消除大量碎斑）
    # 重投影 Mollweide -> WGS84
    merged_wgs = shape(transform_geom(src_crs, "EPSG:4326", mapping(merged), precision=6))
    # 按城市 bbox 裁剪（略外扩，保边）
    clip = box(*cfg["bbox"])
    if not merged_wgs.intersects(clip):
        return None
    clipped = merged_wgs.intersection(clip)
    if clipped.is_empty:
        return None
    simplified = clipped.simplify(cfg["simplify"], preserve_topology=True)
    return simplified

def main():
    epoch = int(sys.argv[1])
    zip_path = os.path.join(GHSL_DIR, f"E{epoch}.zip")
    if not os.path.exists(zip_path):
        print(f"[ERR] 缺少 {zip_path}"); sys.exit(1)
    print(f"[{epoch}] 读取中国窗口…")
    data, wtransform, src_crs, nodata = read_china_window(zip_path, epoch)
    print(f"[{epoch}] 窗口 {data.shape}  min={data.min()} max={data.max()} nodata={nodata}")
    for city in EPOCH_CITIES[epoch]:
        geom = polygonize_city(data, wtransform, src_crs, city)
        if geom is None:
            print(f"[{epoch}] {city}: 无建成区（阈值过高或窗口不符）"); continue
        # 统一输出为 FeatureCollection（MultiPolygon/Polygon 拆分）
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        fc = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {}, "geometry": mapping(p)} for p in polys
        ]}
        out = os.path.join(OUT_DIR, f"{city}_{epoch}.geojson")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False)
        # 测地面积（近似：WGS84 下用等积近似，前端 turf 会精确算）
        area_m2 = geom.area  # 度²（近似，仅日志参考）
        print(f"[{epoch}] {city}: {len(polys)} 个多边形, ~{area_m2*111000*97000/1e6:.0f} km²(近似) -> {os.path.basename(out)}")

if __name__ == "__main__":
    main()
