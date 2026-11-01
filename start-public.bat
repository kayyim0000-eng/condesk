@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ConDesk - temporary public address mode

if not exist tools\cloudflared.exe goto no_tool
if not exist node_modules call npm install
if not exist dist call npm run build
if not exist data mkdir data

rem 처음 한 번 로그인 비밀번호를 정한다 (바꾸려면 data\app_password.txt 를 지우고 다시 실행)
if exist data\app_password.txt goto have_password
powershell -NoProfile -ExecutionPolicy Bypass -File "server\set-password.ps1" -File "data\app_password.txt"
if errorlevel 1 goto fail
:have_password

echo.
echo  앱과 인터넷 터널을 시작합니다. 잠시 뒤 외부 접속 주소가 표시됩니다.
echo  이 PC가 켜져 있고 이 창이 열려 있는 동안만 접속되며, 주소는 실행할 때마다 바뀝니다.
echo.
set CONDESK_TUNNEL=1
node server\index.js
goto end

:no_tool
echo [오류] tools\cloudflared.exe 가 없습니다. README의 외부 공개 모드를 참고해 주세요.
goto end

:fail
echo  비밀번호를 정하지 못해 종료합니다.

:end
pause
