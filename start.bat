@echo off
echo ========================================
echo   交互式动态网站 - MYSQL数据库示例
echo ========================================
echo.
echo 正在启动服务器...
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: Node.js未安装或未添加到PATH环境变量
    echo 请先安装Node.js: https://nodejs.org/
    pause
    exit /b 1
)

REM 检查是否已安装依赖
if not exist "node_modules" (
    echo 正在安装依赖包...
    npm install
    echo.
)

echo 启动服务器...
node server.js

pause