@echo off
chcp 65001 >nul
title منصة سند - خادم الويب المحلي PWA

echo ======================================================================
echo    تشغيل منصة سند لإدارة الحالات والمساعدات الإنسانية - خادم الويب PWA
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

:: 3. في حال عدم وجود Node.js، تنزيله تلقائياً بصيغة محمولة
echo [تنبيه] Node.js غير مثبت في هذا الجهاز.
echo جاري تنزيل نسخة Node.js المحمولة تلقائياً (تتم مرة واحدة فقط)...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip', '%~dp0node-temp.zip'); Expand-Archive -Path '%~dp0node-temp.zip' -DestinationPath '%~dp0.node' -Force; Remove-Item '%~dp0node-temp.zip'"

if exist "%~dp0.node\node-v20.18.0-win-x64\node.exe" (
    set "PATH=%~dp0.node\node-v20.18.0-win-x64;%PATH%"
    goto :node_ready
)

echo [خطأ] تعذر تجهيز Node.js. يرجى تثبيته من https://nodejs.org ثم المحاولة مجدداً.
pause
exit /b 1

:node_ready
:: فحص تثبيت الحزم node_modules
if not exist "%~dp0node_modules" (
    echo تثبيت حزم المشروع لأول مرة (npm install)...
    call npm install
)

echo جاري بدء خادم التطوير المحلي على: http://localhost:5173
call npm run dev
