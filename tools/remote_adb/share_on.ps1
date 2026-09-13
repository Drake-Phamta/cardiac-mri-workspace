<#
.SYNOPSIS
  Share the USB-attached Galaxy A17 with a teammate over the ZeroTier overlay
  (DR-006a revision 1: the owner operates the device REMOTELY).
  Run as a NORMAL user - not Administrator - so adb does not run elevated.

.EFFECT
  Restarts the adb server listening on all interfaces, in its own window titled
  "REMOTE ADB - SHARING ON". Closing that window, or share_off.ps1, stops sharing.
  Refuses to start unless setup_firewall.ps1 has been run.
#>
$ErrorActionPreference = 'Stop'
$adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'
if (-not (Test-Path $adb)) { throw "adb not found at $adb" }

$block = Get-NetFirewallRule -DisplayName "CardiacMRI remote adb - BLOCK outside overlay" -ErrorAction SilentlyContinue
if (-not $block -or $block.Enabled -ne 'True') {
    Write-Host "  REFUSING: the overlay-only firewall rule is missing." -ForegroundColor Red
    Write-Host "  Run tools\remote_adb\setup_firewall.ps1 once, as Administrator, first."
    Write-Host "  Without it, adb -a would be reachable from the Wi-Fi as well."
    exit 1
}

$zt = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.InterfaceAlias -like 'ZeroTier*' } | Select-Object -First 1
if (-not $zt) { Write-Host "  ZeroTier is not up on this machine." -ForegroundColor Red; exit 1 }

& $adb kill-server 2>$null | Out-Null
Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'REMOTE ADB - SHARING ON (close to stop)'; & '$adb' -a -P 5037 nodaemon server"
)

# wait for the listener rather than sleeping a fixed time
$deadline = (Get-Date).AddSeconds(15)
do {
    $l = Get-NetTCPConnection -LocalPort 5037 -State Listen -ErrorAction SilentlyContinue
    if (-not $l) { Start-Sleep -Milliseconds 300 }
} until ($l -or (Get-Date) -gt $deadline)
if (-not $l) { Write-Host "  adb server did not start listening." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "  Listening on: $(($l | ForEach-Object { "$($_.LocalAddress):$($_.LocalPort)" }) -join ', ')"
Write-Host "  Devices:"
& $adb devices -l
Write-Host ""
Write-Host "  Tell the operator to run, on THEIR machine (overlay up):" -ForegroundColor Green
Write-Host "      adb -H $($zt.IPAddress) -P 5037 devices -l"
Write-Host "  Their platform-tools should match this one:  $((& $adb version | Select-Object -Skip 1 -First 1))"
Write-Host ""
Write-Host "  Stop sharing: close the 'REMOTE ADB - SHARING ON' window, or run share_off.ps1"
