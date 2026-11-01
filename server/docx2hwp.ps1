# Convert DOCX to HWP or PDF using the installed Hancom Office (HWPFrame.HwpObject COM).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File docx2hwp.ps1 <in.docx> <out> [HWP|PDF]
# Paths should be ASCII-only (the caller uses the system temp folder).
param([Parameter(Mandatory)] [string]$In, [Parameter(Mandatory)] [string]$Out, [string]$Format = 'HWP')
$ErrorActionPreference = 'Stop'
$hwp = New-Object -ComObject 'HWPFrame.HwpObject'
try {
  # Security module suppresses the "allow file access?" prompt when it is installed
  try { [void]$hwp.RegisterModule('FilePathCheckDLL', 'FilePathCheckerModule') } catch {}
  $hwp.XHwpWindows.Item(0).Visible = $false
  if (-not $hwp.Open($In, '', 'forceopen:true')) { throw "OPEN_FAILED" }
  if (-not $hwp.SaveAs($Out, $Format, '')) { throw "SAVE_FAILED" }
  'OK'
} finally {
  try { $hwp.Clear(1) } catch {}
  $hwp.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($hwp)
}
