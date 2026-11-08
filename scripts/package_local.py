# package_local.py — 把 local/ 打成提交用 ZIP（山海新篇-本地文件版.zip）
# 文件名编码：中文条目名写 GBK 且不置 UTF-8 标志位，保证 Windows 资源管理器解压不乱码；
#             纯 ASCII 条目名保持原样。
# 用法：python scripts/package_local.py
import os
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "local")
OUT = os.path.join(ROOT, "山海新篇-本地文件版.zip")
SKIP = {".DS_Store"}


class GbkZipInfo(zipfile.ZipInfo):
    def _encodeFilenameFlags(self):
        try:
            return self.filename.encode("ascii"), self.flag_bits
        except UnicodeEncodeError:
            try:
                return self.filename.encode("gbk"), self.flag_bits
            except UnicodeEncodeError:
                return self.filename.encode("utf-8"), self.flag_bits | 0x800


def main():
    if not os.path.isdir(SRC):
        raise SystemExit("缺少 local/，请先运行 node scripts/build-local.cjs")
    entries = []
    for dirpath, dirnames, filenames in os.walk(SRC):
        dirnames.sort()
        for name in sorted(filenames):
            if name in SKIP:
                continue
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, SRC).replace(os.sep, "/")
            entries.append((rel, full))
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel, full in entries:
            info = GbkZipInfo.from_file(full, rel)
            info.compress_type = zipfile.ZIP_DEFLATED
            with open(full, "rb") as fh:
                z.writestr(info, fh.read())
    raw = sum(os.path.getsize(f) for _, f in entries)
    print(f"条目 {len(entries)} 个，原始 {raw/1e6:.1f} MB -> ZIP {os.path.getsize(OUT)/1e6:.1f} MB")
    print("输出 " + OUT)


if __name__ == "__main__":
    main()
