# 외부 접속용 로그인 비밀번호를 정해 data\app_password.txt 에 저장한다.
# start-funnel.bat / start-public.bat 이 처음 실행될 때 호출한다.
param([Parameter(Mandatory)] [string]$File)

function Read-Secret([string]$prompt) {
  $s = Read-Host $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

Write-Host ''
Write-Host ' 인터넷에서 접속할 때 쓸 로그인 비밀번호를 정합니다. (8자 이상, 입력하는 글자는 보이지 않습니다)'
for ($i = 0; $i -lt 3; $i++) {
  $p1 = Read-Secret ' 비밀번호'
  if ($p1.Length -lt 8) { Write-Host ' 8자 이상으로 정해 주세요.'; continue }
  $p2 = Read-Secret ' 한 번 더'
  if ($p1 -ne $p2) { Write-Host ' 두 비밀번호가 다릅니다. 다시 입력해 주세요.'; continue }
  [IO.File]::WriteAllText($File, $p1)
  Write-Host ' 비밀번호를 저장했습니다.'
  exit 0
}
Write-Host ' 비밀번호를 정하지 못했습니다. 창을 닫고 다시 실행해 주세요.'
exit 1
