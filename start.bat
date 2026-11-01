@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo [1/3] 처음 실행: 필요한 패키지를 설치합니다...
  call npm install
)
if not exist dist (
  echo [2/3] 화면을 빌드합니다...
  call npm run build
)
echo [3/3] 앱을 시작합니다: http://localhost:5179
start "" http://localhost:5179
node server\index.js
pause
