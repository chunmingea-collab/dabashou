@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

:: ============================================================
::  Huzoo 互圈 - Windows 一键部署脚本
::
::  使用方法：
::    双击运行，或在 cmd 中执行：
::    cd D:\huzoo\deploy
::    setup-win.bat
::
::  这个脚本会：
::    - 检查 Node.js 环境
::    - 安装 PM2 进程管理器
::    - 安装项目依赖
::    - 自动生成 .env 配置文件
::    - 放行防火墙端口
::    - 启动 Huzoo 服务
:: ============================================================

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Huzoo 互圈 - Windows 部署向导      ║
echo  ╚══════════════════════════════════════╝
echo.

:: 切换到项目根目录（deploy 的上级目录）
cd /d "%~dp0.."
set "PROJECT_DIR=%cd%"
echo  [信息] 项目目录：%PROJECT_DIR%
echo.

:: ----------------------------------------------------------
::  步骤 1/7：检查 Node.js
:: ----------------------------------------------------------
echo  [步骤 1/7] 检查 Node.js 环境...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [错误] 未检测到 Node.js！
    echo.
    echo  请按以下步骤安装 Node.js 20.x LTS：
    echo    1. 打开 https://nodejs.org/
    echo    2. 下载 LTS 版本（推荐 20.x）
    echo    3. 双击安装，全部默认即可
    echo    4. 安装完成后关闭此窗口，重新运行本脚本
    echo.
    echo  或者用 winget 快速安装（管理员 PowerShell）：
    echo    winget install OpenJS.NodeJS.LTS
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set "NODE_VER=%%v"
echo  [完成] Node.js 版本：%NODE_VER%

:: ----------------------------------------------------------
::  步骤 2/7：检查/安装 PM2
:: ----------------------------------------------------------
echo.
echo  [步骤 2/7] 检查 PM2 进程管理器...

where pm2 >nul 2>&1
if %errorlevel% neq 0 (
    echo  [安装] 正在全局安装 PM2...
    call npm install -g pm2
    if %errorlevel% neq 0 (
        echo  [错误] PM2 安装失败，请检查网络连接
        pause
        exit /b 1
    )
)

for /f "tokens=*" %%v in ('pm2 -v') do set "PM2_VER=%%v"
echo  [完成] PM2 版本：%PM2_VER%

:: ----------------------------------------------------------
::  步骤 3/7：安装项目依赖
:: ----------------------------------------------------------
echo.
echo  [步骤 3/7] 安装项目依赖...

cd /d "%PROJECT_DIR%\server"
if not exist "package.json" (
    echo  [错误] 未找到 server\package.json，请确认项目目录正确
    pause
    exit /b 1
)

call npm install --production
if %errorlevel% neq 0 (
    echo  [错误] 依赖安装失败，请检查网络连接
    pause
    exit /b 1
)
echo  [完成] 项目依赖安装完成

:: ----------------------------------------------------------
::  步骤 4/7：生成 .env 配置文件
:: ----------------------------------------------------------
echo.
echo  [步骤 4/7] 配置环境变量...

if exist "%PROJECT_DIR%\server\.env" (
    echo  [跳过] .env 文件已存在，不覆盖
    echo         如需重新生成，请先删除 server\.env 再运行本脚本
) else (
    :: 获取本机局域网 IP
    set "LAN_IP=127.0.0.1"
    for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
        for /f "tokens=1" %%b in ("%%a") do set "LAN_IP=%%b"
    )

    :: 生成随机 JWT_SECRET（32字节 = 64个hex字符）
    set "JWT_SECRET="
    :: 用临时 JS 文件避免 batch 引号嵌套问题
    > "%TEMP%\huzoo-gen-secret.js" echo const crypto = require('crypto'); process.stdout.write(crypto.randomBytes(32).toString('hex'));
    for /f "tokens=*" %%s in ('node "%TEMP%\huzoo-gen-secret.js"') do set "JWT_SECRET=%%s"
    del "%TEMP%\huzoo-gen-secret.js" >nul 2>&1

    :: 写入 .env 文件
    (
        echo NODE_ENV=production
        echo PORT=3000
        echo JWT_SECRET=!JWT_SECRET!
        echo BASE_URL=http://!LAN_IP!:3000
        echo RATE_LIMIT=true
    ) > "%PROJECT_DIR%\server\.env"

    echo  [完成] 已生成 .env 配置文件
    echo         访问地址：http://!LAN_IP!:3000
)

:: ----------------------------------------------------------
::  步骤 5/7：创建日志目录
:: ----------------------------------------------------------
echo.
echo  [步骤 5/7] 创建日志目录...

if not exist "%PROJECT_DIR%\server\logs" (
    mkdir "%PROJECT_DIR%\server\logs"
    echo  [完成] 已创建 logs 目录
) else (
    echo  [跳过] logs 目录已存在
)

:: ----------------------------------------------------------
::  步骤 6/7：放行防火墙端口
:: ----------------------------------------------------------
echo.
echo  [步骤 6/7] 配置防火墙（需要管理员权限）...

net session >nul 2>&1
if %errorlevel% equ 0 (
    :: 有管理员权限，添加防火墙规则
    netsh advfirewall firewall delete rule name="Huzoo Server" >nul 2>&1
    netsh advfirewall firewall add rule name="Huzoo Server" dir=in action=allow protocol=tcp localport=3000 >nul 2>&1
    if !errorlevel! equ 0 (
        echo  [完成] 防火墙已放行 3000 端口
    ) else (
        echo  [警告] 防火墙规则添加失败，请手动放行 3000 端口
    )
) else (
    echo  [提示] 当前非管理员权限，无法自动配置防火墙
    echo         请手动操作：以管理员身份运行本脚本，或按以下步骤：
    echo         1. 搜索"Windows Defender 防火墙"
    echo         2. 点击"高级设置"
    echo         3. 入站规则 → 新建规则 → 端口 → TCP 3000 → 允许连接
)

:: ----------------------------------------------------------
::  步骤 7/7：启动 PM2 服务
:: ----------------------------------------------------------
echo.
echo  [步骤 7/7] 启动 Huzoo 服务...

cd /d "%PROJECT_DIR%\server"

:: 先删除旧的 PM2 进程（如果存在）
call pm2 delete huzoo >nul 2>&1

:: 启动服务
call pm2 start ecosystem.config.js
if %errorlevel% neq 0 (
    echo  [错误] 服务启动失败，请检查日志：
    echo         pm2 logs huzoo
    pause
    exit /b 1
)

:: 保存 PM2 进程列表
call pm2 save

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        部署完成！                     ║
echo  ╚══════════════════════════════════════╝
echo.

:: 读取局域网 IP 用于显示
set "LAN_IP=127.0.0.1"
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do set "LAN_IP=%%b"
)

echo  本机访问：http://localhost:3000
echo  局域网访问：http://!LAN_IP!:3000
echo.
echo  ──────── 常用命令 ────────
echo  pm2 status              查看服务状态
echo  pm2 logs huzoo          查看实时日志
echo  pm2 restart huzoo       重启服务
echo  pm2 stop huzoo          停止服务
echo.
echo  ──────── 设置开机自启 ────────
echo  Windows 下请使用 pm2-installer 设置系统服务：
echo    npm install -g pm2-installer
echo    pm2-installer install
echo    pm2 save
echo    pm2 startup
echo  （pm2-installer 会把 PM2 注册为 Windows 系统服务，开机自动启动）
echo.

pause
