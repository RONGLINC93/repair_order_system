@echo off
chcp 65001 >nul

:: 检查Python是否安装
echo 检查Python环境...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: Python未安装，请先安装Python
    pause
    exit /b 1
)

:: 检查依赖包是否安装
echo 检查依赖包...
python -c "import PyQt5; import PyQt5.QtWebEngineWidgets" >nul 2>&1
if %errorlevel% neq 0 (
    echo 正在安装依赖包...
    python -m pip install -r requirements.txt
    if %errorlevel% neq 0 (
        echo 错误: 依赖包安装失败
        pause
        exit /b 1
    )
)

:: 运行应用
echo 正在启动维修工单系统...
python main.py

pause