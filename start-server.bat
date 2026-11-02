@echo off
chcp 65001 >nul
setlocal

:: 切换到脚本所在目录（项目根目录），支持含中文路径
cd /d "%~dp0"

echo ==================================================================
echo  山海新篇 — WebGIS 空间后端启动器 (Node.js + PostGIS + GeoServer)
echo ==================================================================
echo.
echo 浏览器将自动打开 http://127.0.0.1:8000/
echo 正在启动 Node.js 空间服务并同步 PostGIS / GeoServer 图层...
echo 请勿关闭本窗口，关闭窗口即停止服务。
echo.

:: 先打开浏览器（start 会立即返回，不阻塞）
start "" "http://127.0.0.1:8000/"

:: 优先启动 Node.js + PostGIS + GeoServer 空间后端
node server/server.cjs
if errorlevel 1 (
  echo.
  echo [提示] Node.js 启动失败，尝试回退到 Python 静态服务...
  python -m http.server 8000
)

endlocal
