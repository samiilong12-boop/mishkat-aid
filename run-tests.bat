@echo off
chcp 65001 >nul
title منصة سند - تشغيل اختبارات القبول الآلية

echo ======================================================================
echo    تشغيل اختبارات القبول الآلية الشاملة (22 اختباراً لمراحل سند)
echo ======================================================================
cd /d "%~dp0"

:: 1. التحقق من وجود Node.js في بيئة النظام
where node >nul 2>nul
if %errorlevel% equ 0 goto :node_ready

:: 2. فحص مجلد Node المحمول داخل المشروع أو المجلدات المجاورة
if exist "%~dp0.node\node-v20.18.0-win-x64\node.exe" (
    set "PATH=%~dp0.node\node-v20.18.0-win-x64;%PATH%"
    goto :node_ready
)
if exist "%~dp0..\.node\node-v20.18.0-win-x64\node.exe" (
    set "PATH=%~dp0..\.node\node-v20.18.0-win-x64;%PATH%"
    goto :node_ready
)
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :node_ready
)
if exist "C:\Users\same\.gemini\antigravity\scratch\.node\node-v20.18.0-win-x64\node.exe" (
    set "PATH=C:\Users\same\.gemini\antigravity\scratch\.node\node-v20.18.0-win-x64;%PATH%"
    goto :node_ready
)

:node_ready
call npm test
pause
