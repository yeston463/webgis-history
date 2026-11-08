#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pick_city_windows.py — 为九城挑选"能看到扩张"的 3D 建筑窗口

思路：窗口若以 1990 老城斑块质心为中心，几乎整框都落在 1990 建成区内，
年代分层会退化成"全是 1990"。因此改为在 2014 最大斑块范围内滑动一个固定尺寸
窗口，挑出**老城面积与新扩张面积最均衡**的位置（扩张锋面）。

输入：data/urban-expansion/{city}_{1990,2000,2014}.geojson
输出：data/buildings/windows.json（供 gen_city_buildings.py 使用）

评分：
  约束  a2014 ≥ 0.45·|B|（框内大部分到 2014 已城市化，保证有楼可画）
        a1990 ≥ 0.08·|B|（框内要有老城核心，否则没有 1990 层）
  目标  max min(a1990, a2014 − a1990)，同分时取 a2014 更大者
"""
import json
import os

import shapely
from shapely.geometry import shape
from shapely.prepared import prep

W, H = 0.124, 0.100          # 经度约 12.8km × 纬度约 11.0km
STEP = 0.020
MAX_OFF_KM = 7.0        # 窗口中心到市中心的最大偏移（配合"必须覆盖市中心"）
# 近似 CBD 锚点：用于把窗口钉在"当代天际线所在"的位置，而不是被面积均衡目标
# 拽到收录稀疏的郊区，或落在以低层旧城为主、楼高中位只有 3.2m 的历史中心。
# 北京取国贸、上海取陆家嘴（两城的 AUE 1990 范围极大，历史中心框内几乎无年代增量）。
CBD = {
    "shenzhen": (114.062, 22.542), "shanghai": (121.500, 31.235),   # 陆家嘴 CBD "guangzhou": (113.267, 23.129),
    "xiamen": (118.089, 24.479), "beijing": (116.461, 39.908),   # 国贸 CBD "hangzhou": (120.169, 30.276),
    "wuhan": (114.305, 30.593), "chengdu": (104.066, 30.657), "qingdao": (120.383, 36.097),
}
CITIES = ["shenzhen", "shanghai", "guangzhou", "xiamen", "beijing",
          "hangzhou", "wuhan", "chengdu", "qingdao"]


def load_union(city, year):
    d = json.load(open(f"data/urban-expansion/{city}_{year}.geojson", encoding="utf-8"))
    geoms = []
    for f in d["features"]:
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        if not g.is_empty:
            geoms.append(shapely.set_precision(g, grid_size=1e-6))
    u = shapely.union_all(geoms)
    if not u.is_valid:
        u = u.buffer(0)
    return u


def largest_patch(u):
    ps = list(u.geoms) if u.geom_type == "MultiPolygon" else [u]
    ps = [p for p in ps if p.geom_type == "Polygon"]
    return max(ps, key=lambda p: p.area)


def search(city, max_off_km, min_growth):
    u90, u00, u14 = load_union(city, 1990), load_union(city, 2000), load_union(city, 2014)
    p90 = largest_patch(u90)          # 1990 主斑块 = 真正的老城核心
    p14 = largest_patch(u14)
    minx, miny, maxx, maxy = p14.bounds
    # 滑动范围：让窗口中心覆盖整个最大斑块
    # 自适应步长：把候选框数量压到 ~40×40 以内，避免超大斑块（北京/上海）搜索爆炸
    step = max(STEP, (maxx - minx - W) / 40.0, (maxy - miny - H) / 40.0)
    cxs = frange(minx + W / 2, maxx - W / 2, step) or [p14.centroid.x]
    cys = frange(miny + H / 2, maxy - H / 2, step) or [p14.centroid.y]
    box_area = W * H
    best = None
    pr90, pr14, prp90 = prep(u90), prep(u14), prep(p90)
    ocx, ocy = CBD.get(city, (p90.centroid.x, p90.centroid.y))
    for cx in cxs:
        for cy in cys:
            b = shapely.box(cx - W / 2, cy - H / 2, cx + W / 2, cy + H / 2)
            if not pr14.intersects(b) or not prp90.intersects(b):
                continue
            a14 = b.intersection(u14).area
            if a14 < 0.45 * box_area:
                continue
            a90 = b.intersection(u90).area
            a90core = b.intersection(p90).area
            if a90 < 0.08 * box_area or a90core < 0.08 * box_area:
                continue
            # 均衡项：老城核心面积 vs 1990 后新增城市化面积
            balance = min(a90core, a14 - a90) / box_area
            # 距离惩罚：偏离市中心越远越差
            # 硬约束：窗口必须**覆盖市中心锚点**，否则画面里没有天际线（北京/上海此前就栽在这一点上）
            if not (cx - W / 2 <= ocx <= cx + W / 2 and cy - H / 2 <= ocy <= cy + H / 2):
                continue
            dist_km = (((cx - ocx) * 102.8) ** 2 + ((cy - ocy) * 110.57) ** 2) ** 0.5
            if dist_km > max_off_km:
                continue
            if (a14 - a90) < min_growth * box_area:   # 必须含足量 1990 后新增建设用地
                continue
            score = balance - 0.010 * dist_km
            key = (round(score, 5), a14)
            if best is None or key > best[0]:
                a00 = b.intersection(u00).area
                best = (key, (round(cy - H / 2, 4), round(cx - W / 2, 4),
                              round(cy + H / 2, 4), round(cx + W / 2, 4)),
                        {k: round(100 * v / box_area, 1) for k, v in
                         (("in1990", a90), ("in2000", a00), ("in2014", a14))})
    return best


def frange(a, b, step):
    out, x = [], a
    while x <= b + 1e-9:
        out.append(round(x, 6))
        x += step
    return out


def main():
    result = {}
    for c in CITIES:
        best = None
        # 逐级放宽：先要求窗口紧贴老城且含 >=12% 新增；老城被 1990 建成区整个包住的城市
        # （如北京）再允许外扩到 16 / 24 km，保证时间轴上能看到扩张而不是全 1990。
        for max_off, min_growth in ((9.0, 0.12), (16.0, 0.12), (24.0, 0.10), (24.0, 0.0)):
            best = search(c, max_off, min_growth)
            if best:
                print(f"  {c}: 采用 偏移≤{max_off}km 新增≥{min_growth:.0%}")
                break
        if not best:
            print(f"  {c}: 未找到满足约束的窗口，回落到 1990 老城斑块质心")
            cx, cy = largest_patch(load_union(c, 1990)).centroid.x, largest_patch(load_union(c, 1990)).centroid.y
            win = (round(cy - H / 2, 4), round(cx - W / 2, 4), round(cy + H / 2, 4), round(cx + W / 2, 4))
            mix = {}
        else:
            win, mix = best[1], best[2]
        print(f"  {c}: 市中心锚点={CBD.get(c)}")
        result[c] = {"window": list(win), "urban_share_pct": mix}
        print(f"  {c}: window={win} 建成区占比%={mix}")
    os.makedirs("data/buildings", exist_ok=True)
    with open("data/buildings/windows.json", "w", encoding="utf-8") as f:
        json.dump({"window_deg": [W, H], "cities": result}, f, ensure_ascii=False, indent=1)
    print("已写出 data/buildings/windows.json")


if __name__ == "__main__":
    main()
