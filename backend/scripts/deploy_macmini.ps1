<#
.SYNOPSIS
  Deploy the backend to the Mac mini (DR-003 host) and start it on 0.0.0.0:8000.

.DESCRIPTION
  Run from a Windows PowerShell 5.1 prompt on the leader's PC (ssh alias
  "macmini" with BatchMode key access). One command, in this order:

    1. checks the local derived data cache (backend/data_cache/index.json);
       it holds 8-bit slice PNGs + JSON only - never raw NRRD;
    2. packs the code (backend/app, requirements, serve script, the contract
       files the service loads) and the data cache into tar.gz files in the
       gitignored stage directory backend/var/deploy_stage (overwritten on
       every run, never deleted by this script);
    3. downloads the pinned requirements as Python 3.9 macOS-arm64 wheels, so
       the Mac mini installs offline (skip with -NoWheels);
    4. ssh macmini: creates ~/cardiac-backend and copies + unpacks everything
       in place (files are overwritten, nothing is deleted);
    5. runs backend/scripts/serve_macmini.sh there: venv from /usr/bin/python3,
       pip install, restart uvicorn in the background (pid file + log), and
       curl /health on the Mac mini itself;
    6. calls /health from this PC over the overlay (http://<OverlayIp>:<Port>).

  Nothing on the Mac mini outside ~/cardiac-backend is touched. The review
  database (backend/var/backend.sqlite3) persists across redeploys.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy_macmini.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy_macmini.ps1 -DataCache D:\path\to\data_cache
#>
param(
  [string]$HostAlias = "macmini",
  [string]$RemoteDir = "cardiac-backend",
  [string]$DataCache = "",
  [string]$OverlayIp = "10.64.193.115",
  [int]$Port = 8000,
  [switch]$SkipData,
  [switch]$SkipInstall,
  [switch]$NoWheels
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $DataCache) { $DataCache = Join-Path $repo "backend\data_cache" }

function Invoke-Native {
  param([string]$What, [scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

Write-Host "== 1/6 local checks"
if (-not $SkipData) {
  $index = Join-Path $DataCache "index.json"
  if (-not (Test-Path $index)) {
    throw "No data cache at $DataCache. Build it first: python -m backend.app.ingest --package-root <LASC extracted root>"
  }
  $cases = (Get-Content $index -Raw | ConvertFrom-Json).cases
  Write-Host "   data cache: $DataCache ($($cases.Count) cases)"
}
Invoke-Native "ssh $HostAlias" { ssh -o BatchMode=yes -o ConnectTimeout=15 $HostAlias "echo connected to `$(hostname)" }

$stage = Join-Path $repo "backend\var\deploy_stage"
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Write-Host "== 2/6 pack into $stage"
$codeTar = Join-Path $stage "code.tar.gz"
$codePaths = @(
  "backend/app", "backend/requirements.txt", "backend/scripts/serve_macmini.sh",
  "contracts/api/contract.json", "contracts/api/schema.json", "contracts/api/validate_api_contract.py",
  "contracts/ingestion/contract2_experiment_artifact/schema.json",
  "contracts/ingestion/contract2_experiment_artifact/validate_contract2.py"
)
Invoke-Native "tar (code)" { tar -czf $codeTar --exclude "__pycache__" -C $repo $codePaths }
$uploads = @($codeTar)
if (-not $SkipData) {
  $dataTar = Join-Path $stage "data_cache.tar.gz"
  Invoke-Native "tar (data cache)" { tar -czf $dataTar -C $DataCache . }
  $raw = tar -tzf $dataTar | Select-String -Pattern '\.(nrrd|nii|nii\.gz|dcm|mha|mhd|raw)$'
  if ($raw) { throw "the data cache contains raw image files; refusing to copy them: $raw" }
  Write-Host ("   data cache archive: {0:N0} MB" -f ((Get-Item $dataTar).Length / 1MB))
  $uploads += $dataTar
}

$shipWheels = (-not $NoWheels) -and (-not $SkipInstall)
if ($shipWheels) {
  Write-Host "== 3/6 wheels for Python 3.9 / macOS arm64"
  $wheels = Join-Path $stage "wheels"
  Invoke-Native "pip download" {
    python -m pip download --quiet --disable-pip-version-check --platform macosx_11_0_arm64 --python-version 3.9 `
      --implementation cp --only-binary=:all: -r (Join-Path $repo "backend\requirements.txt") -d $wheels
  }
  $wheelTar = Join-Path $stage "wheels.tar.gz"
  Invoke-Native "tar (wheels)" { tar -czf $wheelTar -C $stage wheels }
  $uploads += $wheelTar
} else {
  Write-Host "== 3/6 wheels skipped (the Mac mini installs from PyPI, or not at all with -SkipInstall)"
}

Write-Host "== 4/6 copy to ${HostAlias}:~/$RemoteDir"
Invoke-Native "ssh mkdir" { ssh -o BatchMode=yes $HostAlias "mkdir -p ~/$RemoteDir/backend/data_cache ~/$RemoteDir/backend/var" }
foreach ($file in $uploads) {
  Invoke-Native "scp $(Split-Path $file -Leaf)" { scp -o BatchMode=yes -q $file "${HostAlias}:$RemoteDir/" }
}
$unpack = "cd ~/$RemoteDir && tar -xzf code.tar.gz"
if (-not $SkipData) { $unpack += " && tar -xzf data_cache.tar.gz -C backend/data_cache" }
if ($shipWheels) { $unpack += " && tar -xzf wheels.tar.gz" }
Invoke-Native "ssh unpack" { ssh -o BatchMode=yes $HostAlias $unpack }

Write-Host "== 5/6 install and start (serve_macmini.sh)"
$skip = 0
if ($SkipInstall) { $skip = 1 }
Invoke-Native "serve_macmini.sh" { ssh -o BatchMode=yes $HostAlias "bash ~/$RemoteDir/backend/scripts/serve_macmini.sh $Port $skip" }

Write-Host "== 6/6 /health from this PC over the overlay"
try {
  $health = Invoke-RestMethod -Uri "http://${OverlayIp}:${Port}/health" -TimeoutSec 15
  Write-Host ("   OK: contract {0}, cases {1}, experiments {2}" -f $health.contract_version, $health.cases.total, $health.experiments)
} catch {
  Write-Warning "The Mac mini answers locally but not over the overlay from this PC: $($_.Exception.Message). Check ZeroTier and the macOS firewall for python3."
}
Write-Host "Deployed. Phone base URL: http://${OverlayIp}:${Port}/api/v1   health: http://${OverlayIp}:${Port}/health"
Write-Host "Logs: ssh $HostAlias 'tail -f ~/$RemoteDir/backend/var/uvicorn.log'"
Write-Host "Stop: ssh $HostAlias 'kill `$(cat ~/$RemoteDir/backend/var/uvicorn.pid)'"
