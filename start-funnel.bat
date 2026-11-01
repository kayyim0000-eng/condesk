@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ConDesk - 고정 주소 모드 (이 창을 닫으면 접속이 끊깁니다)

set TS="C:\Program Files\Tailscale\tailscale.exe"
if not exist %TS% (
  echo [오류] Tailscale이 설치되어 있지 않습니다. https://tailscale.com/download 에서 설치해 주세요.
  pause
  exit /b 1
)
if not exist node_modules (
  echo 처음 실행: 필요한 패키지를 설치합니다...
  call npm install
)
if not exist dist (
  echo 화면을 빌드합니다...
  call npm run build
)
if not exist data mkdir data

rem 처음 한 번 로그인 비밀번호를 정한다 (data\app_password.txt, 바꾸려면 이 파일을 지우고 다시 실행)
if not exist data\app_password.txt (
  echo.
  echo  인터넷에서 접속할 때 쓸 로그인 비밀번호를 정합니다. 길고 추측하기 어렵게 정해 주세요.
  powershell -NoProfile -Command "$a=Read-Host '비밀번호' -AsSecureString; $b=Read-Host '한 번 더' -AsSecureString; $p1=[Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a)); $p2=[Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b)); if ($p1.Length -lt 8) { Write-Host '8자 이상으로 정해 주세요.'; exit 1 }; if ($p1 -ne $p2) { Write-Host '두 비밀번호가 다릅니다.'; exit 1 }; [IO.File]::WriteAllText('data\app_password.txt', $p1)"
  if errorlevel 1 (
    pause
    exit /b 1
  )
  echo  비밀번호를 저장했습니다.
)

rem Tailscale Funnel: 고정 주소(https://condesk.xxxx.ts.net)를 이 PC의 5179번으로 연결 (설정은 PC를 껐다 켜도 유지)
%TS% funnel --bg 5179 >nul 2>&1
if errorlevel 1 (
  echo.
  echo  Funnel을 켜지 못했습니다. 아래 명령의 안내(링크)를 따라 관리 화면에서 Funnel을 허용해 주세요.
  %TS% funnel --bg 5179
  pause
  exit /b 1
)
echo.
echo  ================================================================
for /f "tokens=1" %%u in ('%TS% funnel status ^| findstr /b "https://"') do echo   고정 접속 주소:  %%u
echo   (휴대폰·다른 PC에서 이 주소로 접속 → 로그인 비밀번호 입력)
echo  ================================================================
echo   이 PC가 켜져 있고 이 창이 열려 있는 동안 접속됩니다.
echo.
set CONDESK_PUBLIC=1
node server\index.js
pause
