const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = __dirname;
const releaseDir = path.join(rootDir, 'release', 'Shiori-AI-Japanese-Tutor');
const zipFile = path.join(rootDir, 'Shiori-AI-Japanese-Tutor_v0.1.1.zip');
const cnZipFile = path.join(rootDir, '栞-Shiori-AI日语私教_v0.1.1.zip');

console.log('1. 清理旧 release 目录与压缩包...');
if (fs.existsSync(releaseDir)) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}
fs.readdirSync(rootDir).filter(f => f.endsWith('.zip')).forEach(f => {
  try { fs.unlinkSync(path.join(rootDir, f)); } catch (e) {}
});

fs.mkdirSync(releaseDir, { recursive: true });

console.log('2. 复制 dist 目录...');
fs.cpSync(path.join(rootDir, 'dist'), path.join(releaseDir, 'dist'), { recursive: true });

console.log('3. 创建干净规范的启动脚本与说明文件...');

// 1. 双击启动.bat (Windows 启动脚本 - 采用纯 ASCII 编码彻底杜绝系统字符集乱码)
const batContent = `@echo off
cd /d "%~dp0"
title Shiori AI Tutor (v0.1.1)

where node >nul 2>nul
if %errorlevel% equ 0 (
    node server.cjs
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
)

if %errorlevel% neq 0 (
    echo.
    echo Server stopped.
    pause
)
`;
fs.writeFileSync(path.join(releaseDir, '双击启动.bat'), batContent, 'ascii');
fs.writeFileSync(path.join(releaseDir, 'Start_Windows.bat'), batContent, 'ascii');

// 2. Start_Mac_Linux.sh
const shContent = `#!/usr/bin/env bash
cd "$(dirname "$0")"

echo "======================================================"
echo "   🌸 正在启动「栞 (Shiori)」AI 日语自适应智能私教..."
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
`;
fs.writeFileSync(path.join(releaseDir, '启动_Mac_Linux.sh'), shContent, 'utf8');

// 3. 复制 server.cjs, server.ps1, 使用说明.txt
fs.copyFileSync(path.join(rootDir, 'server.cjs'), path.join(releaseDir, 'server.cjs'));
fs.copyFileSync(path.join(rootDir, 'server.ps1'), path.join(releaseDir, 'server.ps1'));
fs.copyFileSync(path.join(rootDir, '使用说明.txt'), path.join(releaseDir, '使用说明.txt'));
fs.copyFileSync(path.join(rootDir, '使用说明.txt'), path.join(releaseDir, 'README.txt'));

console.log('4. 正在压缩为 zip 压缩包 (PowerShell Compress-Archive)...');
const psCommand = `powershell -NoProfile -Command "Compress-Archive -Path '${releaseDir}' -DestinationPath '${zipFile}' -Force"`;
execSync(psCommand, { stdio: 'inherit' });

console.log('5. 复制中文命名的压缩包以方便国内用户识别...');
fs.copyFileSync(zipFile, cnZipFile);

const stats = fs.statSync(zipFile);
console.log(`\n🎉 打包完成！`);
console.log(`压缩包文件1: ${zipFile}`);
console.log(`压缩包文件2: ${cnZipFile}`);
console.log(`文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
