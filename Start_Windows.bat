@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 🔖 栞 (Shiori) - AI 日语智能私教 (v0.1.1)

where node >nul 2>nul
if %errorlevel% equ 0 (
    node "%~dp0scripts\server.cjs"
) else (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\server.ps1"
)

if %errorlevel% neq 0 (
    echo.
    echo 服务已停止。
    pause
)
