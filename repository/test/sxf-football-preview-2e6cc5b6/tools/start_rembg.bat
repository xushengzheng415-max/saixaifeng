@echo off
REM 启动 rembg 队徽抠图服务（本地）
REM 双击运行，保持窗口打开以查看服务状态

set "PYTHON_EXE=C:\Users\Administrator\.workbuddy\binaries\python\versions\3.13.12\python.exe"
set "SCRIPT_DIR=%~dp0"
set "SERVER_PY=%SCRIPT_DIR%rembg_server.py"

echo ===================================================
echo  rembg 队徽抠图服务
echo ===================================================
echo.

REM 检查 Python 是否存在
if not exist "%PYTHON_EXE%" (
    echo [错误] 找不到 Python：%PYTHON_EXE%
    echo 请修改此 bat 文件中的 PYTHON_EXE 路径
    pause
    exit /b 1
)

REM 检查服务端是否存在
if not exist "%SERVER_PY%" (
    echo [错误] 找不到服务端文件：%SERVER_PY%
    pause
    exit /b 1
)

REM 检查 rembg 是否安装
"%PYTHON_EXE%" -c "import rembg" 2>nul
if errorlevel 1 (
    echo [警告] rembg 未安装，正在安装...
    "%PYTHON_EXE%" -m pip install "rembg[cpu]"
)

echo [信息] 启动服务：%SERVER_PY%
echo [信息] 服务地址：<ADDRESS_REMOVED>
echo [信息] 关闭此窗口即可停止服务
echo.
echo ===================================================
echo.

"%PYTHON_EXE%" "%SERVER_PY%"

echo.
echo [信息] 服务已停止
pause
