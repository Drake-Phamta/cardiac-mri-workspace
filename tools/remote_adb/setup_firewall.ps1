<#
.SYNOPSIS
  ONE-TIME, run as Administrator on the device owner's machine. Confines the adb
  server port (TCP 5037) to the ZeroTier overlay before it is ever opened.

.WHY
  `adb` cannot listen on a single address ("listening on specified hostname
  currently unsupported"); `adb -a` listens on EVERY interface. On the leader's
  machine two auto-created `adb.exe` allow rules already admit Public / Remote Any,
  and the home Wi-Fi is categorised Public. Without this script, sharing the phone
  with the team would also share it with everyone on that Wi-Fi.

  Windows Firewall evaluates BLOCK before ALLOW, so a block rule covering every
  address outside the overlay subnet wins over those broad allow rules - they do not
  have to be deleted or edited.

.CHANGES
  Adds two inbound rules, both named "CardiacMRI remote adb ...". Changes nothing else.
  Undo:  Remove-NetFirewallRule -DisplayName "CardiacMRI remote adb*"
#>
#Requires -RunAsAdministrator
param(
    # ZeroTier network 3b19b3a71652c5f0 assigns from 10.134.129.0/24.
    [string]$OverlayFirst = '10.134.129.1',
    [string]$OverlayLast  = '10.134.129.254',
    [int]$Port = 5037
)
$ErrorActionPreference = 'Stop'

$blockName = "CardiacMRI remote adb - BLOCK outside overlay"
$allowName = "CardiacMRI remote adb - ALLOW overlay only"

# Everything except 10.134.129.1-254 - and except loopback, so the owner's own
# local adb (127.0.0.1 / ::1) keeps working. IPv4 and IPv6.
$outside = @(
    '0.0.0.0-10.134.129.0',
    '10.134.129.255-126.255.255.255',
    '128.0.0.0-255.255.255.255',
    '::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
)

foreach ($n in $blockName, $allowName) {
    if (Get-NetFirewallRule -DisplayName $n -ErrorAction SilentlyContinue) {
        Remove-NetFirewallRule -DisplayName $n
        Write-Host "  replaced existing rule: $n"
    }
}

New-NetFirewallRule -DisplayName $blockName -Direction Inbound -Action Block `
    -Protocol TCP -LocalPort $Port -RemoteAddress $outside -Profile Any | Out-Null

New-NetFirewallRule -DisplayName $allowName -Direction Inbound -Action Allow `
    -Protocol TCP -LocalPort $Port -RemoteAddress "$OverlayFirst-$OverlayLast" -Profile Any | Out-Null

Write-Host ""
Write-Host "  Rules now in force:"
Get-NetFirewallRule -DisplayName "CardiacMRI remote adb*" | ForEach-Object {
    $a = $_ | Get-NetFirewallAddressFilter
    $p = $_ | Get-NetFirewallPortFilter
    "    {0,-6} {1,-5} port {2}  remote {3}" -f $_.Action, $p.Protocol, ($p.LocalPort -join ','), ($a.RemoteAddress -join ', ')
}
Write-Host ""
Write-Host "  Done. Close this Administrator window. Run share_on.ps1 as a NORMAL user."
