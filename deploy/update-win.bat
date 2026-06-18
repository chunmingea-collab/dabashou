@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
::  Huzoo 互圈 - Windows 更新脚本
::
::  代码更新后执行此脚本，自动重新安装依赖并重启服务
::
::  使用方法：
::    cd D:\huzoo\deploy
::    update-win.bat
:: ============================================================

echo.
echo  [Huzoo] 正在更新服务...
echo.

:: 切换到项目根目录
cd /d "%~dp0.."
set "PROJECT_DIR=%cd%"

:: 安装/更新依赖
echo  [1/2] 更新项目依赖...
cd /d "%PROJECT_DIR%\server"
call npm install --production
if %errorlevel% neq 0 (
    echo  [错误] 依赖安装失败
    pause
    exit /b 1
)

:: 重启 PM2 服务
echo  [2/2] 重启 Huzoo 服务...
call pm2 restart huzoo
if %errorlevel% neq 0 (
    echo  [错误] 服务重启失败，请尝试重新运行 setup-win.bat
    pause
    exit /b 1
)

echo.
echo  [完成] Huzoo 服务已更新并重启！
echo.
call pm2 status
echo.
pause
