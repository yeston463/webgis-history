# scripts/collect_all_urban.py — 从 AUE (Atlas of Urban Expansion) 与 JRC GHSL 收集多城真实建成区数据
import os
import json
import zipfile
import urllib.request
import numpy as np
import pyogrio
import rasterio
from rasterio.features import shapes
from rasterio.warp import transform_geom, transform_bounds
from shapely.geometry import shape, mapping, Polygon
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GHSL_DIR = os.path.join(ROOT, "data", "urban-expansion", "_ghsl")
OUT_DIR = os.path.join(ROOT, "data", "urban-expansion")
os.makedirs(GHSL_DIR, exist_ok=True)

AUE_CITIES = [
    ("shanghai", "Shanghai__Shanghai.zip", "Shanghai,_Shanghai.zip", 0.00050),
    ("guangzhou", "Guangzhou__Guangdong.zip", "Guangzhou,_Guangdong.zip", 0.00055),
    ("beijing", "Beijing__Beijing.zip", "Beijing,_Beijing.zip", 0.00055),
    ("hangzhou", "Hangzhou__Zhejiang.zip", "Hangzhou,_Zhejiang.zip", 0.00050),
    ("wuhan", "Wuhan__Hubei.zip", "Wuhan,_Hubei.zip", 0.00050),
    ("chengdu", "Chengdu__Sichuan.zip", "Chengdu,_Sichuan.zip", 0.00050),
    ("qingdao", "Qingdao__Shandong.zip", "Qingdao,_Shandong.zip", 0.00045),
]

def download_file(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 100000:
        print(f"[CACHE] 已存在 {os.path.basename(dest)} ({os.path.getsize(dest)//1024} KB)")
        return
    print(f"[DL] 正在下载 {url} -> {os.path.basename(dest)} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=180) as resp, open(dest, "wb") as f:
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            f.write(chunk)
    print(f"[DL] 完成 {os.path.basename(dest)} ({os.path.getsize(dest)//1024} KB)")

def round_coords(geom_dict, digits=5):
    def _rc(c):
        if isinstance(c[0], (int, float)):
            return [round(float(c[0]), digits), round(float(c[1]), digits)]
        return [_rc(x) for x in c]
    return {"type": geom_dict["type"], "coordinates": _rc(geom_dict["coordinates"])}

def process_aue_city(city_key, zip_filename, url_filename, simplify_tol=0.0005):
    url = f"http://www.atlasofurbanexpansion.org/file-manager/userfiles/data_page/Phase%20I%20GIS/{url_filename}"
    zpath = os.path.join(GHSL_DIR, zip_filename)
    download_file(url, zpath)

    zf = zipfile.ZipFile(zpath)
    names = zf.namelist()
    epochs = {"t1": 1990, "t2": 2000, "t3": 2014}
    for t, year in epochs.items():
        shp_matches = [n for n in names if n.lower().endswith(f"urban_edge_{t}.shp")]
        if not shp_matches:
            print(f"[WARN] {city_key} {year} 未找到 urban_edge_{t}.shp")
            continue
        shp_rel = shp_matches[0]
        vsi_path = f"/vsizip/{zpath}/{shp_rel}"
        gdf = pyogrio.read_dataframe(vsi_path)
        gdf_wgs = gdf.to_crs("EPSG:4326")
        valid_geoms = []
        for g in gdf_wgs.geometry:
            if g is None or g.is_empty:
                continue
            if not g.is_valid:
                g = g.buffer(0)
            if not g.is_empty:
                valid_geoms.append(g)
        merged = unary_union(valid_geoms)
        simp = merged.simplify(simplify_tol, preserve_topology=True)
        if not simp.is_valid:
            simp = simp.buffer(0)
        geoms = list(simp.geoms) if simp.geom_type == "MultiPolygon" else [simp]
        geoms = [g for g in geoms if g.area >= 2e-6]
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {}, "geometry": round_coords(mapping(g), 5)}
                for g in geoms
            ],
        }
        out_path = os.path.join(OUT_DIR, f"{city_key}_{year}.geojson")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
        print(f"[AUE] {city_key}_{year}.geojson -> {len(geoms)} 斑块 ({os.path.getsize(out_path)//1024} KB)")

def process_ghsl_xiamen():
    # 精确贴合厦门六区（思明、湖里、集美、海沧、同安、翔安）市域多边形，剔除漳州龙海与泉州晋江/南安边界外斑块
    xm_boundary = Polygon([
        (117.90, 24.42),
        (118.18, 24.41),
        (118.36, 24.52),
        (118.35, 24.68),
        (118.20, 24.82),
        (118.02, 24.85),
        (117.92, 24.68),
        (117.88, 24.52),
    ])
    bbox = xm_boundary.bounds
    epoch_map = {1990: 1990, 2000: 2000, 2015: 2014}
    for ghsl_epoch, out_year in epoch_map.items():
        all_polys = []
        for row_idx in [6, 7]:
            tname = f"GHS_BUILT_S_E{ghsl_epoch}_GLOBE_R2023A_54009_100_V1_0_R{row_idx}_C30"
            zpath = os.path.join(GHSL_DIR, f"{tname}.zip")
            vsi = f"/vsizip/{zpath}/{tname}.tif"
            with rasterio.open(vsi) as src:
                mol_bounds = transform_bounds("EPSG:4326", src.crs, *bbox, densify_pts=21)
                tb = src.bounds
                ix0, iy0 = max(mol_bounds[0], tb.left), max(mol_bounds[1], tb.bottom)
                ix1, iy1 = min(mol_bounds[2], tb.right), min(mol_bounds[3], tb.top)
                if ix0 >= ix1 or iy0 >= iy1:
                    continue
                win = rasterio.windows.from_bounds(ix0, iy0, ix1, iy1, transform=src.transform)
                win = win.round_offsets().round_lengths()
                data = src.read(1, window=win)
                wtransform = src.window_transform(win)
                # 100m 网格建成面积 >= 1800 m²，并在投影坐标系 (米) 下进行形态学闭运算平滑街区空隙
                mask = (data >= 1800) & (data != src.nodata)
                tile_geoms = [shape(geom) for geom, val in shapes(data.astype("float32"), mask=mask, transform=wtransform)]
                if tile_geoms:
                    tile_merged = unary_union(tile_geoms).buffer(110).buffer(-95)
                    g_wgs = shape(transform_geom(src.crs, "EPSG:4326", mapping(tile_merged), precision=5))
                    if not g_wgs.is_valid:
                        g_wgs = g_wgs.buffer(0)
                    all_polys.append(g_wgs)
        merged = unary_union(all_polys)
        clipped = merged.intersection(xm_boundary)
        simp = clipped.simplify(0.00042, preserve_topology=True)
        if not simp.is_valid:
            simp = simp.buffer(0)
        geoms = list(simp.geoms) if simp.geom_type == "MultiPolygon" else [simp]
        # 滤除零星孤立农房碎斑 (< 12 公顷)，保留城市建成区连片斑块
        geoms = [g for g in geoms if g.area >= 1.2e-5]
        fc = {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "properties": {}, "geometry": round_coords(mapping(g), 5)}
                for g in geoms
            ],
        }
        out_path = os.path.join(OUT_DIR, f"xiamen_{out_year}.geojson")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
        print(f"[GHSL] xiamen_{out_year}.geojson -> {len(geoms)} 斑块 ({os.path.getsize(out_path)//1024} KB)")

if __name__ == "__main__":
    process_ghsl_xiamen()
    for city_key, zip_fn, url_fn, tol in AUE_CITIES:
        process_aue_city(city_key, zip_fn, url_fn, simplify_tol=tol)
