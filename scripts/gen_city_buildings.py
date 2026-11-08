#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen_city_buildings.py — 九城 OSM 真实建筑轮廓 + 按建成区位置推断年代层

输入：
  - OpenStreetMap 建筑多边形（Overpass API, © OpenStreetMap contributors, ODbL）
  - 各城 AUE 建成区轮廓 data/urban-expansion/{city}_{1990,2000,2014}.geojson

输出：
  data/buildings/{city}.geojson          逐栋轮廓，属性 h / era / hs
  data/buildings/buildings-meta.json     每城窗口、数量、年代分布、高度来源占比、统计量

年代归属（era）＝ 该建筑底面质心**首次落入建成区范围**的时相：
  1990 → 落在 1990 建成区内
  2000 → 不在 1990、但落在 2000 建成区内
  2014 → 不在前两期、但落在 2014 建成区内
  2024 → 三期都不在（现状 OSM 有、AUE 2014 范围无 → 2014 年后新建/范围外）
  这是"按建成区位置推断的年代层"，不是竣工年份，界面必须这样标注。

高度取值（hs 码）：
  0 = OSM height 标签（米）
  1 = OSM building:levels × 3.2 m
  2 = 同城市·同年代·同 building 类型的已标注中位数（样本 ≥8 才用，插补）
  3 = 同城市·同年代已标注中位数（插补）
  4 = 8 m 兜底（该城该年代完全无依据）

用法：
  python scripts/gen_city_buildings.py                 # 拉取 + 处理 + 输出
  python scripts/gen_city_buildings.py --reuse-raw     # 复用 test-results/osm/raw/*.json
"""
import argparse
import json
import math
import os
import re
import sys
import time
import urllib.parse
import urllib.request

from shapely.geometry import shape, Point
from shapely.strtree import STRtree

EP = "https://overpass-api.de/api/interpreter"
UA = "ShanhaiWebGIS/1.0 (course project)"
FLOOR = 3.2
FALLBACK = 8.0
SIMPLIFY_DEG = 2.2e-5          # ≈ 2.4m，控制体积同时保住轮廓形状
COORD_ROUND = 5                # ≈ 1.1m 精度
MIN_AREA_M2 = 40.0             # 丢掉车棚/小亭等噪声面
MAX_BUILDINGS = 20000          # 单城渲染预算，超出按底面积优先保留

# 核心区窗口由 scripts/pick_city_windows.py 依据 AUE 建成区几何搜索得到
WINDOWS_PATH = "data/buildings/windows.json"
WINDOWS = None
CITY_CN = {"shenzhen": "深圳", "shanghai": "上海", "guangzhou": "广州", "xiamen": "厦门",
           "beijing": "北京", "hangzhou": "杭州", "wuhan": "武汉", "chengdu": "成都",
           "qingdao": "青岛"}


def fetch(city, bbox, retries=4):
    s, w, n, e = bbox
    q = f"[out:json][timeout:300];way[building]({s},{w},{n},{e});out body geom;"
    body = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(EP, data=body, headers={
                "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded"})
            with urllib.request.urlopen(req, timeout=420) as r:
                return json.loads(r.read().decode("utf-8"))
        except Exception as ex:                      # noqa: BLE001
            last = ex
            print(f"    {city} 第 {attempt + 1} 次失败：{ex}", file=sys.stderr, flush=True)
            time.sleep(25 * (attempt + 1))
    raise RuntimeError(f"{city} Overpass 拉取失败：{last}")


def ue_area(poly):
    """度面积 → 平方米（核心区尺度足够）。"""
    return poly.area * (111320.0 * math.cos(math.radians(poly.centroid.y))) * 110574.0


def build_epoch_trees(city):
    trees = {}
    for y in (1990, 2000, 2014):
        path = f"data/urban-expansion/{city}_{y}.geojson"
        if not os.path.exists(path):
            trees[y] = None
            continue
        d = json.load(open(path, encoding="utf-8"))
        geoms = []
        for f in d["features"]:
            g = shape(f["geometry"])
            if not g.is_valid:
                g = g.buffer(0)
            if not g.is_empty:
                geoms.append(g)
        trees[y] = STRtree(geoms) if geoms else None
    return trees


def classify(geoms, trees):
    """返回按 1990/2000/2014/2024 分组的年代码。"""
    pts = [g.centroid for g in geoms]
    era = [2024] * len(geoms)
    for y in (2014, 2000, 1990):
        t = trees.get(y)
        if t is None:
            continue
        for i, p in enumerate(pts):
            if era[i] == y:
                continue
            hit = any(t.geometries[j].contains(p) for j in t.query(p))
            if hit:
                era[i] = y
    return era


def parse_h(tags):
    raw = (tags.get("height") or "").strip()
    if raw:
        m = re.search(r"(\d+(?:\.\d+)?)", raw)
        if m:
            v = float(m.group(1))
            if 0 < v <= 900:
                return v
    return None


def parse_levels(tags):
    raw = (tags.get("building:levels") or "").strip()
    if raw:
        nums = re.findall(r"\d+(?:\.\d+)?", raw)
        if nums:
            v = float(nums[0]) if len(nums) == 1 else max(float(x) for x in nums)
            if 0 < v <= 300:
                return v
    return None


def median(vals):
    if not vals:
        return None
    v = sorted(vals)
    return v[len(v) // 2] if len(v) % 2 else (v[len(v) // 2 - 1] + v[len(v) // 2]) / 2.0


def process(city, raw, trees):
    geoms, tags_list = [], []
    for el in raw.get("elements", []):
        if el.get("type") != "way":
            continue
        gpts = el.get("geometry") or []
        tags = el.get("tags") or {}
        if len(gpts) < 4:
            continue
        pts = [(p["lon"], p["lat"]) for p in gpts]
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        try:
            poly = shape({"type": "Polygon", "coordinates": [pts]})
            if not poly.is_valid:
                poly = poly.buffer(0)
            if poly.is_empty or poly.geom_type != "Polygon" or ue_area(poly) < MIN_AREA_M2:
                continue
            poly = poly.simplify(SIMPLIFY_DEG, preserve_topology=True)
            if poly.is_empty or poly.geom_type != "Polygon" or len(poly.exterior.coords) < 4:
                continue
        except Exception:                            # noqa: BLE001
            continue
        geoms.append(poly)
        tags_list.append(tags)

    eras = classify(geoms, trees)

    # 第一遍：真实标签高度
    h0 = [None] * len(geoms)
    src = [None] * len(geoms)
    for i, tg in enumerate(tags_list):
        hv = parse_h(tg)
        if hv is not None:
            h0[i], src[i] = hv, 0
            continue
        lv = parse_levels(tg)
        if lv is not None:
            h0[i], src[i] = lv * FLOOR, 1

    city_labelled = [h for h in h0 if h]
    by_era, by_era_type = {}, {}
    for i, h in enumerate(h0):
        if not h:
            continue
        by_era.setdefault(eras[i], []).append(h)
        bt = (tags_list[i].get("building") or "yes").split(":")[0]
        by_era_type.setdefault((eras[i], bt), []).append(h)

    feats, stats = [], {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0}
    era_counts = {}
    for i, poly in enumerate(geoms):
        h = h0[i]
        s = src[i]
        if h is None:
            bt = (tags_list[i].get("building") or "yes").split(":")[0]
            grp = by_era_type.get((eras[i], bt), [])
            m_type = median(grp) if len(grp) >= 8 else None
            m_era = median(by_era.get(eras[i], []))
            if m_type:
                h, s = m_type, 2
            elif m_era:
                h, s = m_era, 3
            else:
                h, s = FALLBACK, 4
        h = round(min(max(h, 2.0), 700.0), 1)
        stats[str(s)] += 1
        era_counts[eras[i]] = era_counts.get(eras[i], 0) + 1
        ring = [[round(x, COORD_ROUND), round(y, COORD_ROUND)] for x, y in poly.exterior.coords]
        feats.append({"type": "Feature",
                      "properties": {"h": h, "era": eras[i], "hs": s},
                      "geometry": {"type": "Polygon", "coordinates": [ring]}})

    # 预算控制：超量时按底面积从大到小保留（视觉上先留住大体量建筑）
    thinned = 0
    if len(feats) > MAX_BUILDINGS:
        order = sorted(range(len(geoms)), key=lambda k: -geoms[k].area)
        keep = set(order[:MAX_BUILDINGS])
        thinned = len(feats) - MAX_BUILDINGS
        kept_era = {}
        for i in sorted(keep):
            kept_era[feats[i]["properties"]["era"]] = kept_era.get(feats[i]["properties"]["era"], 0) + 1
        stats = {"0": 0, "1": 0, "2": 0, "3": 0, "4": 0}
        for i in sorted(keep):
            stats[str(feats[i]["properties"]["hs"])] += 1
        feats = [feats[i] for i in sorted(keep)]
        era_counts = kept_era

    hs = sorted(f["properties"]["h"] for f in feats)
    pct = lambda q: hs[min(len(hs) - 1, int(len(hs) * q))] if hs else 0
    tallest = max(feats, key=lambda f: f["properties"]["h"]) if feats else None
    n = len(feats) or 1
    meta = {
        "city": city, "name_cn": CITY_CN[city], "window": list(WINDOWS[city]),
        "buildings": len(feats), "thinned_out": thinned,
        "era_counts": {str(k): v for k, v in sorted(era_counts.items())},
        "era_share_pct": {str(k): round(100.0 * v / n, 1) for k, v in sorted(era_counts.items())},
        "height_median_m": round(pct(0.5), 1), "height_p90_m": round(pct(0.9), 1),
        "height_max_m": hs[-1] if hs else 0,
        "tallest": {"h": tallest["properties"]["h"], "era": tallest["properties"]["era"]} if tallest else None,
        "height_source_pct": {"osm_height": round(100.0 * stats["0"] / n, 1),
                              "levels": round(100.0 * stats["1"] / n, 1),
                              "type_median": round(100.0 * stats["2"] / n, 1),
                              "era_median": round(100.0 * stats["3"] / n, 1),
                              "fallback": round(100.0 * stats["4"] / n, 1)},
    }
    return feats, meta


def load_windows():
    if not os.path.exists(WINDOWS_PATH):
        raise SystemExit("缺少 " + WINDOWS_PATH + "，请先运行 scripts/pick_city_windows.py")
    doc = json.load(open(WINDOWS_PATH, encoding="utf-8"))
    return {k: tuple(v["window"]) for k, v in doc["cities"].items()}


OVERVIEW_CELL_DEG = 0.0013      # 约 145m 网格：远景每格保留最高（同高取底面最大）的一栋


def build_overview(feats):
    """按 200m 网格抽稀：每格保留最高（同高取底面最大）的一栋，几何原样保留。"""
    best = {}
    for f in feats:
        ring = f["geometry"]["coordinates"][0]
        cx = sum(p[0] for p in ring) / len(ring)
        cy = sum(p[1] for p in ring) / len(ring)
        key = (round(cx / OVERVIEW_CELL_DEG), round(cy / OVERVIEW_CELL_DEG))
        area = abs(_ring_area(ring))
        cur = best.get(key)
        if cur is None or (f["properties"]["h"], area) > (cur[0]["properties"]["h"], cur[1]):
            best[key] = (f, area)
    return [v[0] for v in best.values()]


def _ring_area(ring):
    s2 = 0.0
    for i in range(1, len(ring)):
        s2 += ring[i - 1][0] * ring[i][1] - ring[i][1] * ring[i - 1][0]
    return s2 / 2.0


def main():
    global WINDOWS
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="仅处理指定城市")
    ap.add_argument("--reuse-raw", action="store_true")
    ap.add_argument("--raw-dir", default="test-results/osm/raw")
    ap.add_argument("--out-dir", default="data/buildings")
    args = ap.parse_args()

    WINDOWS = load_windows()
    os.makedirs(args.raw_dir, exist_ok=True)
    os.makedirs(args.out_dir, exist_ok=True)
    metas = []
    todo = [(c, b) for c, b in WINDOWS.items() if not args.only or c in args.only]
    for city, bbox in todo:
        raw_path = os.path.join(args.raw_dir, f"{city}.json")
        if args.reuse_raw and os.path.exists(raw_path):
            raw = json.load(open(raw_path, encoding="utf-8"))
            print(f"  {city}: 复用原始响应", flush=True)
        else:
            print(f"  {city}: Overpass 拉取中…", flush=True)
            raw = fetch(city, bbox)
            with open(raw_path, "w", encoding="utf-8") as f:
                json.dump(raw, f)
            time.sleep(6)
        trees = build_epoch_trees(city)
        feats, meta = process(city, raw, trees)
        out = os.path.join(args.out_dir, f"{city}.geojson")
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": feats}, f,
                      ensure_ascii=False, separators=(",", ":"))
        meta["bytes"] = os.path.getsize(out)
        ov = build_overview(feats)
        ov_path = os.path.join(args.out_dir, f"{city}-overview.geojson")
        with open(ov_path, "w", encoding="utf-8") as f:
            json.dump({"type": "FeatureCollection", "features": ov}, f, ensure_ascii=False, separators=(",", ":"))
        meta["overview_buildings"] = len(ov)
        meta["overview_cell_deg"] = OVERVIEW_CELL_DEG
        meta["overview_bytes"] = os.path.getsize(ov_path)
        meta["overview_ratio_pct"] = round(100.0 * len(ov) / (len(feats) or 1), 1)
        metas.append(meta)
        print(f"  {city}: {meta['buildings']:,} 栋 (抽稀 {meta['thinned_out']}) 概览 {meta['overview_buildings']:,} "
              f"({meta['overview_ratio_pct']}%) era={meta['era_counts']} {meta['bytes']/1e6:.2f}MB", flush=True)

    meta_path = os.path.join(args.out_dir, "buildings-meta.json")
    merged, order = {}, []
    if os.path.exists(meta_path):                       # --only 时保留其余城市已有条目
        old = json.load(open(meta_path, encoding="utf-8"))
        for m in old.get("cities", []):
            merged[m["city"]] = m
            order.append(m["city"])
    for m in metas:
        if m["city"] not in merged:
            order.append(m["city"])
        merged[m["city"]] = m
        order = [c for c in order if c in merged]
    cities_out = [merged[c] for c in order if c in merged]
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({"generated_by": "scripts/gen_city_buildings.py",
                   "license": "© OpenStreetMap contributors (ODbL); AUE extents: Atlas of Urban Expansion",
                   "cities": cities_out}, f, ensure_ascii=False, indent=1)
    print(json.dumps({"total_buildings": sum(m["buildings"] for m in metas),
                      "total_bytes": sum(m["bytes"] for m in metas)}, indent=1))


if __name__ == "__main__":
    main()
