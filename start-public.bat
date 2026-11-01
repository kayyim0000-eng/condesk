@echo off
chcp 65001 >nul
cd /d "%~dp0"
title ConDesk - 외부 공개 모드 (이 창을 닫으면 접속이 끊깁니다)

if not exist tools\cloudflared.exe (
  echo [오류] tools\cloudflared.exe 가 없습니다. README의 '외부 공개 모드'를 참고해 주세요.
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

echo.
echo  앱과 인터넷 터널을 시작합니다. 잠시 뒤 '외부 접속 주소'가 표시됩니다.
echo  - 이 PC가 켜져 있고 이 창이 열려 있는 동안만 접속됩니다.
echo  - 주소는 실행할 때마다 바뀝니다. (앱 설정 화면에서도 확인 가능)
echo.
set CONDESK_TUNNEL=1
node server\index.js
pause
