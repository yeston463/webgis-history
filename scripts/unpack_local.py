# unpack_local.py — 解压提交用 ZIP 到临时目录，供 file:// 断言复跑（验证压缩包本身可用，而不只是源目录）
# 用法：python scripts/unpack_local.py [目标目录]   默认 test-results/zipcheck
import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZIP = os.path.join(ROOT, "山海新篇-本地文件版.zip")
DEST = os.path.join(ROOT, sys.argv[1]) if len(sys.argv) > 1 else os.path.join(ROOT, "test-results", "zipcheck")


def entry_name(info):
    # 打包时中文条目名为 GBK 且未置 UTF-8 标志位，zipfile 会按 cp437 解码，这里还原回真实文件名
    if info.flag_bits & 0x800:
        return info.filename
    try:
        return info.filename.encode("cp437").decode("gbk")
    except UnicodeError:
        return info.filename


def main():
    if not os.path.exists(ZIP):
        raise SystemExit("缺少 ZIP，请先运行 python scripts/package_local.py")
    shutil.rmtree(DEST, ignore_errors=True)
    os.makedirs(DEST)
    with zipfile.ZipFile(ZIP) as z:
        bad = z.testzip()
        if bad is not None:
            raise SystemExit("CRC 校验失败: " + bad)
        for info in z.infolist():
            if info.is_dir():
                continue
            name = entry_name(info)
            target = os.path.join(DEST, *name.split("/"))
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with z.open(info) as src, open(target, "wb") as dst:
                shutil.copyfileobj(src, dst)
    n = sum(len(fs) for _, _, fs in os.walk(DEST))
    print(f"解压 {n} 个文件 -> {DEST}")


if __name__ == "__main__":
    main()
