@echo off
chcp 65001 >nul
echo ================================================
echo    WorkBuddy - Git 安装与 GitHub 上传工具
echo ================================================
echo.

:: 检查 Git 是否已安装
where git >nul 2>&1
if %errorlevel% == 0 (
    echo [✓] Git 已安装
    git --version
    goto :upload
)

echo [1/3] Git 未安装，正在下载...
echo 请稍候，这可能需要几分钟...

:: 使用 Git 官方下载链接
powershell -Command "& { $url = 'https://github.com/git-for-windows/git/releases/download/v2.49.0.windows.1/Git-2.49.0.1-64-bit.exe'; $output = '$env:TEMP\Git-2.49.0.1-64-bit.exe'; Write-Host '正在下载 Git...'; Invoke-WebRequest -Uri $url -OutFile $output; Write-Host '下载完成，正在启动安装...'; Start-Process $output -Wait; Write-Host '安装完成！请重启电脑后再次运行此脚本。' }"

echo.
echo [重要] 请重启电脑，然后再次运行此脚本完成上传！
echo.
pause
goto :eof

:upload
echo.
echo [2/3] 开始上传代码到 GitHub...
echo.

cd /d "%~dp0"

:: 初始化 Git（如果还没有初始化）
if not exist ".git" (
    echo 初始化 Git 仓库...
    git init
    git config user.name "yangxiaoling1222-eng"
    git config user.email "[email address removed]"
)

:: 添加文件
echo 添加文件到 Git...
git add .

:: 检查状态
echo.
echo [检查] 以下文件将被提交：
git status --short

echo.
set /p confirm="确认上传以上文件？(Y/N): "
if /i not "%confirm%"=="Y" (
    echo 已取消上传。
    pause
    goto :eof
)

:: 提交
echo.
echo 提交代码...
git commit -m "初始提交：WorkBuddy 亚马逊广告 AI 优化平台"

:: 关联远程仓库
echo.
echo 关联 GitHub 远程仓库...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E.git

:: 推送
echo.
echo [3/3] 推送到 GitHub...
echo 注意：推送时需要输入 GitHub 用户名和密码（Personal Access Token）
echo.
git branch -M main
git push -u origin main

echo.
echo ================================================
echo  上传完成！
echo ================================================
echo.
echo 如果推送失败，请确认：
echo  1. 已创建 GitHub 仓库: https://github.com/yangxiaoling1222-eng/Amazon-Ads-AI-E
echo  2. 已生成 Personal Access Token
echo  3. 推送时密码栏填入 Token（不是登录密码）
echo.
pause
