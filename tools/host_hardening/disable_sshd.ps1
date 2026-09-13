<#
.SYNOPSIS
  Run once, as Administrator, on the leader's laptop. Stops the OpenSSH SERVER
  and keeps it from starting again.

.WHY
  Found 2026-09-12 while measuring the overlay, and confirmed 2026-09-13 from the
  phone on the home Wi-Fi: TCP 22 answered from the LAN. sshd listened on
  0.0.0.0:22 and [::]:22, PasswordAuthentication was not set (sshd's default is
  yes), and there was no authorized_keys file. The leader confirmed on 2026-09-13
  that this laptop serves nothing but code for the project, so the server has no
  job to do here.

.WHAT IT DOES NOT TOUCH
  The SSH CLIENT. `ssh user@10.134.129.115` to the Mac mini keeps working - that
  is ssh.exe going out, not sshd listening in. No files are deleted and no
  firewall rule is changed.

.UNDO
  Set-Service sshd -StartupType Automatic; Start-Service sshd
#>
#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$svc = Get-Service -Name sshd -ErrorAction SilentlyContinue
if (-not $svc) {
    Write-Host "  sshd is not installed on this machine - nothing to do." -ForegroundColor Green
    exit 0
}

Write-Host "  before: status=$($svc.Status) startup=$($svc.StartType)"
if ($svc.Status -ne 'Stopped') { Stop-Service -Name sshd -Force }
Set-Service -Name sshd -StartupType Disabled

$svc = Get-Service -Name sshd
Write-Host "  after:  status=$($svc.Status) startup=$($svc.StartType)"

$l = Get-NetTCPConnection -LocalPort 22 -State Listen -ErrorAction SilentlyContinue
if ($l) {
    Write-Host "  WARNING: something still listens on port 22: $(($l | ForEach-Object { $_.LocalAddress }) -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "  Port 22 is no longer listening. Done." -ForegroundColor Green
Write-Host "  Undo:  Set-Service sshd -StartupType Automatic; Start-Service sshd"
