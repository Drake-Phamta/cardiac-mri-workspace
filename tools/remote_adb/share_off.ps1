<#
.SYNOPSIS
  Stop sharing the phone. Restarts adb in its normal loopback-only mode.
#>
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
& $adb kill-server 2>$null | Out-Null
& $adb start-server 2>$null | Out-Null
$l = Get-NetTCPConnection -LocalPort 5037 -State Listen -ErrorAction SilentlyContinue
Write-Host "  adb now listening on: $(($l | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', ')"
if ($l | Where-Object { $_.LocalAddress -ne '127.0.0.1' }) {
    Write-Host "  WARNING: still listening beyond loopback - close the 'REMOTE ADB - SHARING ON' window." -ForegroundColor Red
} else {
    Write-Host "  Sharing OFF." -ForegroundColor Green
}
