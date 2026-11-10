# optimize_local_assets.py — 本地文件版提交包的图片轻量化（只作用于 local/assets）
#   JPEG: 最长边 > 1600 时缩至 1600，重编码 quality 82（progressive + optimize）
#   PNG : >200KB 时检查 alpha——近不透明（min ≥ 200）→ 白底压平转 JPEG（同名存放，
#         浏览器按内容嗅探解码，扩展名不影响）；真透明 → 保持 PNG，仅缩放重编码
#   原始素材（仓库根 assets/）不动；该步骤只服务 local/ 与提交 ZIP 的体积控制。
import os
import sys
from PIL import Image

MAX_SIDE = 1600
JPG_QUALITY = 82

def main(root):
    if not os.path.isdir(root):
        print('  assets 目录不存在：' + root)
        return 1
    saved = 0
    skipped = 0
    touched = 0
    for dirpath, _, files in os.walk(root):
        for name in sorted(files):
            p = os.path.join(dirpath, name)
            ext = os.path.splitext(name)[1].lower()
            if ext not in ('.jpg', '.jpeg', '.png'):
                continue
            size0 = os.path.getsize(p)
            try:
                im = Image.open(p)
                im.load()
            except Exception:
                skipped += 1
                continue
            w, h = im.size
            side = max(w, h)
            if ext in ('.jpg', '.jpeg'):
                # 縮放 + 重编码
                if side > MAX_SIDE:
                    scale = MAX_SIDE / side
                    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
                if im.mode not in ('RGB', 'L'):
                    im = im.convert('RGB')
                im.save(p, 'JPEG', quality=JPG_QUALITY, optimize=True, progressive=True)
            else:  # .png
                if size0 <= 200_000:
                    continue
                rgba = im.convert('RGBA')
                alpha = rgba.getchannel('A')
                mn, _ = alpha.getextrema()
                if mn >= 200:
                    # 近不透明 → 白底压平 → JPEG 内容同名存放
                    out = Image.new('RGB', rgba.size, (255, 255, 255))
                    out.paste(rgba, mask=alpha)
                    if max(out.size) > MAX_SIDE:
                        scale = MAX_SIDE / max(out.size)
                        out = out.resize((max(1, round(out.size[0] * scale)), max(1, round(out.size[1] * scale))), Image.LANCZOS)
                    out.save(p, 'JPEG', quality=JPG_QUALITY + 3, optimize=True, progressive=True)
                else:
                    # 真透明 → 保持 PNG，仅缩放
                    if side > MAX_SIDE:
                        scale = MAX_SIDE / side
                        rgba = rgba.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
                    rgba.save(p, 'PNG', optimize=True)
            size1 = os.path.getsize(p)
            if size1 < size0:
                saved += size0 - size1
                touched += 1
            else:
                skipped += 0  # 未变小（已是精优图），文件保留原字节
    print(f'  压缩 {touched} 张 / 跳过 {skipped} 张 / 节省 {saved / 1048576:.1f} MB')
    return 0

if __name__ == '__main__':
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else os.path.join('local', 'assets')))
