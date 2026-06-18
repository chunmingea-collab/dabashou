@echo off
chcp 65001 >nul 2>&1
setlocal

:: ============================================================
::  Huzoo 互圈 - Windows 停止脚本
::
::  使用方法：
::    cd D:\huzoo\deploy
::    stop-win.bat
:: ============================================================

echo.
echo  [Huzoo] 正在停止服务...
echo.

call pm2 stop huzoo
if %errorlevel% neq 0 (
    echo  [提示] 服务可能未在运行
) else (
    echo  [完成] Huzoo 服务已停止
)

echo.
echo  如需彻底移除 PM2 进程记录，执行：pm2 delete huzoo
echo  如需重新启动，执行：pm2 restart huzoo
echo.
pause
