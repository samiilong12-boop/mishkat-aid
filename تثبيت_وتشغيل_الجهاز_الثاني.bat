@echo off
chcp 65001 >nul
title منصة سند - معالج التثبيت والتشغيل للجهاز الثاني

echo ======================================================================
echo    مرحباً بك في منصة سند لإدارة الحالات والمساعدات الإنسانية
echo    معالج التثبيت والإعداد التلقائي للجهاز الجديد / الثاني
echo ======================================================================
cd /d "%~dp0"

echo.
echo [1/3] فحص بيئة التشغيل ومحرك Node.js...

:: 1. التحقق من وجود Node.js في بيئة النظام
where node >nul 2>nul
if %errorlevel% equ 0 goto :node_ready

:: 2. فحص مجلد Node المحمول المرفق
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

:: 3. في حال عدم وجود Node.js، تنزيله تلقائياً بصيغة محمولة
echo Node.js غير مثبت في هذا الجهاز.
echo جاري تنزيل نسخة Node.js المحمولة تلقائياً (تتم مرة واحدة فقط بدون صلاحيات مدير)...
powershell -NoProfile -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://nodejs.org/dist/v20.18.0/node-v20.18.0-win-x64.zip', '%~dp0node-temp.zip'); Expand-Archive -Path '%~dp0node-temp.zip' -DestinationPath '%~dp0.node' -Force; Remove-Item '%~dp0node-temp.zip'"

if exist "%~dp0.node\node-v20.18.0-win-x64\node.exe" (
    set "PATH=%~dp0.node\node-v20.18.0-win-x64;%PATH%"
    goto :node_ready
)

echo [خطأ] تعذر تنزيل Node.js تلقائياً. يرجى التأكد من اتصال الإنترنت أو تثبيت Node.js من: https://nodejs.org
pause
exit /b 1

:node_ready
echo ✓ محرك Node.js جاهز:
call node -v

echo.
echo [2/3] فحص وتثبيت حزم ومكتبات النظام...
if not exist "%~dp0node_modules" (
    echo جاري تثبيت الحزم والمكتبات عبر npm install...
    call npm install
) else (
    echo ✓ الحزم والمكتبات مثبتة مسبقاً.
)

echo.
echo [3/3] فحص بناء حزمة الإنتاج...
if not exist "%~dp0dist\index.html" (
    echo جاري بناء ملفات التطبيق (npm run build)...
    call npm run build
) else (
    echo ✓ حزمة الإنتاج جاهزة ومحدثة.
)

echo.
echo ======================================================================
echo    تم تجهيز النظام بنجاح! اختر طريقة التشغيل التي تفضلها:
echo ======================================================================
echo    [1] تشغيل تطبيق سطح المكتب المخصص (Windows Desktop App - نافذة ويندوز أصلية)
echo    [2] تشغيل خادم الويب المحلي PWA (للمتصفح والأجهزة اللوحية والموبايل)
echo    [3] تشغيل اختبارات القبول الآلية الشاملة (22 اختباراً للتحقق من سلامة النظام)
echo    [4] خروج
echo ======================================================================
echo.

set /p choice="أدخل رقم الخيار (1 أو 2 أو 3 أو 4) ثم اضغط Enter: "

if "%choice%"=="1" (
    echo جاري إطلاق تطبيق سطح المكتب...
    call npx electron .
    goto :end
)
if "%choice%"=="2" (
    echo جاري تشغيل خادم الويب المحلي على http://localhost:5173 ...
    call npm run dev
    goto :end
)
if "%choice%"=="3" (
    echo جاري تشغيل الاختبارات الآلية...
    call npm test
    pause
    goto :end
)

:end
