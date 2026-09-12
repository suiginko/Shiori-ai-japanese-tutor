#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "======================================================"
echo "   🔖 正在启动「栞 (Shiori)」AI 日语自适应智能私教..."
echo "======================================================"

if command -v node >/dev/null 2>&1; then
    echo "[状态] 检测到 Node.js，正在启动..."
    node server.cjs
elif command -v python3 >/dev/null 2>&1; then
    echo "[状态] 检测到 Python3，正在启动本地服务..."
    cd dist && python3 -m http.server 5273
else
    echo "[错误] 未检测到 Node.js 或 Python3，请先安装其中之一。"
    exit 1
fi
