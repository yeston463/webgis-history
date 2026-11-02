#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
link_images.py — 把下载好的真实图片写入 data/heritage.geojson

将 assets/heritage/credits.json 中的图片清单回填到 heritage.geojson 的
properties.image（主图）与 properties.gallery（画廊图组）字段，
并补上 imageCredit / imageSource 供界面署名。
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / 'data' / 'heritage.geojson'
CREDITS = ROOT / 'assets' / 'heritage' / 'credits.json'


def main():
    if not CREDITS.exists():
        print(f'找不到来源清单：{CREDITS}\n请先运行 node scripts/fetch-heritage-images.cjs')
        return
    credits = json.loads(CREDITS.read_text(encoding='utf-8'))
    by_id = {im['id']: im for im in credits['images']}

    gj = json.loads(GEO.read_text(encoding='utf-8'))
    updated = 0
    for f in gj['features']:
        p = f['properties']
        im = by_id.get(p['id'])
        if not im:
            continue
        # 主图（相对路径，运行时用 dataUrl 风格拼接；此处直接给 assets 相对路径）
        p['image'] = 'assets/heritage/' + im['main']
        p['gallery'] = ['assets/heritage/' + g['file'] for g in im['files'][1:]]
        p['imageSource'] = im['source']
        p['imageSourcePage'] = im['sourcePage']
        p['imageCredit'] = f"{im['source']} · 词条配图"
        updated += 1

    GEO.write_text(json.dumps(gj, ensure_ascii=False, indent=1), encoding='utf-8')
    print(f'已更新 {updated}/{len(gj["features"])} 条遗产的图片字段')
    f0 = gj['features'][0]['properties']
    print('示例：')
    print('  image        :', f0['image'])
    print('  gallery      :', f0.get('gallery'))
    print('  imageCredit  :', f0.get('imageCredit'))


if __name__ == '__main__':
    main()