@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ConDesk - fixed address mode

set "TS=C:\Program Files\Tailscale\tailscale.exe"
if not exist "%TS%" goto no_tailscale
if not exist node_modules call npm install
if not exist dist call npm run build
if not exist data mkdir data

rem 처음 한 번 로그인 비밀번호를 정한다 (바꾸려면 data\app_password.txt 를 지우고 다시 실행)
if exist data\app_password.txt goto have_password
powershell -NoProfile -ExecutionPolicy Bypass -File "server\set-password.ps1" -File "data\app_password.txt"
if errorlevel 1 goto fail
:have_password

rem Tailscale Funnel: 고정 주소를 이 PC의 5179번으로 연결 (설정은 PC를 껐다 켜도 유지)
"%TS%" funnel --bg 5179 >nul 2>&1
if errorlevel 1 goto funnel_error

echo.
echo  ================================================================
for /f "tokens=1" %%u in ('"%TS%" funnel status ^| findstr /b "https://"') do echo   고정 접속 주소:  %%u
echo   휴대폰이나 다른 PC에서 이 주소로 접속한 뒤 로그인하세요.
echo   이 PC가 켜져 있고 이 창이 열려 있는 동안 접속됩니다.
echo  ================================================================
echo.
set CONDESK_PUBLIC=1
node server\index.js
goto end

:no_tailscale
echo [오류] Tailscale이 설치되어 있지 않습니다. https://tailscale.com/download 에서 설치해 주세요.
goto end

:funnel_error
echo.
echo  Funnel을 켜지 못했습니다. 아래 안내의 링크에서 Funnel을 허용해 주세요.
"%TS%" funnel --bg 5179
goto end

:fail
echo  비밀번호를 정하지 못해 종료합니다.

:end
pause
