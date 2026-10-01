<#
.SYNOPSIS
  Deploy the backend to the backend host (DR-003) and start it on <BindHost>:<Port>.

.DESCRIPTION
  Run from a Windows PowerShell 5.1 prompt on the operator's PC, with ssh
  BatchMode key access to the host. Host-specific values are parameters (or
  untracked environment variables) - no address or host alias is committed:

    -SshHost   ssh alias or user@host       (or $env:CARDIAC_DEPLOY_SSH_HOST)
    -BindHost  the overlay interface address uvicorn binds on the host
                                            (or $env:CARDIAC_DEPLOY_BIND_HOST)
    -BindAll   explicit opt-in to bind 0.0.0.0 instead of -BindHost

  Steps:
    1. checks the local derived data cache (<DataCache>/index.json, outside
       the repository); it holds 8-bit slice PNGs + JSON only - never NRRD;
    2. packs the code (backend/app, requirements, serve script, the contract
       files the service loads) and the data cache into tar.gz files in a
       fixed stage directory under %TEMP% (overwritten on every run, never
       deleted by this script);
    3. downloads the pinned requirements as Python 3.9 macOS-arm64 wheels, so
       the host installs offline (skip with -NoWheels);
    4. ssh: creates ~/<RemoteDir> (code) and ~/<RemoteDataDir> (derived data,
       review database, logs), copies and unpacks in place - nothing deleted;
    5. runs backend/scripts/serve_macmini.sh there: venv from /usr/bin/python3,
       pip install, restart uvicorn in the background (pid file + log under
       ~/<RemoteDataDir>/var), and curl /health on the host itself;
    6. calls /health from this PC at http://<BindHost>:<Port>.

.EXAMPLE
  $env:CARDIAC_DEPLOY_SSH_HOST = "<ssh-alias>"; $env:CARDIAC_DEPLOY_BIND_HOST = "<overlay-address>"
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy_macmini.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\deploy_macmini.ps1 -SshHost <ssh-alias> -BindHost <overlay-address> -DataCache D:\02_Research\cardiac-data\backend_cache\data_cache
#>
param(
  [string]$SshHost = $env:CARDIAC_DEPLOY_SSH_HOST,
  [string]$BindHost = $env:CARDIAC_DEPLOY_BIND_HOST,
  [switch]$BindAll,
  [int]$Port = 8000,
  [string]$DataCache = "",
  [string]$RemoteDir = "cardiac-backend",
  [string]$RemoteDataDir = "cardiac-backend-data",
  [switch]$SkipData,
  [switch]$SkipInstall,
  [switch]$NoWheels
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if (-not $SshHost) { throw "Pass -SshHost <ssh-alias> or set CARDIAC_DEPLOY_SSH_HOST (kept out of the repository)." }
if ($BindAll) { $BindHost = "0.0.0.0" }
if (-not $BindHost) { throw "Pass -BindHost <overlay-address> (or set CARDIAC_DEPLOY_BIND_HOST); binding 0.0.0.0 needs the explicit -BindAll." }
if (-not $DataCache) {
  $root = $env:CARDIAC_BACKEND_DATA
  if (-not $root) { $root = "D:\02_Research\cardiac-data\backend_cache" }
  $DataCache = Join-Path $root "data_cache"
}

function Invoke-Native {
  param([string]$What, [scriptblock]$Command)
  & $Command
  if ($LASTEXITCODE -ne 0) { throw "$What failed with exit code $LASTEXITCODE" }
}

function Test-InsideGitWorktree([string]$Path) {
  $current = [System.IO.Path]::GetFullPath($Path)
  while ($current) {
    if (Test-Path (Join-Path $current ".git")) { return $true }
    $parent = [System.IO.Path]::GetDirectoryName($current)
    if ($parent -eq $current) { break }
    $current = $parent
  }
  return $false
}

Write-Host "== 1/6 local checks"
if (-not $SkipData) {
  if (Test-InsideGitWorktree $DataCache) { throw "$DataCache is inside a git work tree; derived patient data must live outside the repository." }
  $index = Join-Path $DataCache "index.json"
  if (-not (Test-Path $index)) {
    throw "No data cache at $DataCache. Build it first: python -m backend.app.ingest --out $DataCache"
  }
  $cases = (Get-Content $index -Raw | ConvertFrom-Json).cases
  Write-Host "   data cache: $DataCache ($($cases.Count) cases)"
}
Invoke-Native "ssh $SshHost" { ssh -o BatchMode=yes -o ConnectTimeout=15 $SshHost "echo connected" }

$stage = Join-Path ([System.IO.Path]::GetTempPath()) "cardiac-backend-deploy"
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
  # pip evaluated markers on THIS interpreter; prove the set installs on the host's CPython 3.9.6.
  Invoke-Native "wheel closure check" {
    python (Join-Path $repo "backend\scripts\check_wheel_closure.py") --wheels $wheels `
      --requirements (Join-Path $repo "backend\requirements.txt")
  }
  $wheelTar = Join-Path $stage "wheels.tar.gz"
  Invoke-Native "tar (wheels)" { tar -czf $wheelTar -C $stage wheels }
  $uploads += $wheelTar
} else {
  Write-Host "== 3/6 wheels skipped (the host installs from PyPI, or not at all with -SkipInstall)"
}

Write-Host "== 4/6 copy to ${SshHost}: ~/$RemoteDir (code), ~/$RemoteDataDir (data)"
Invoke-Native "ssh mkdir" { ssh -o BatchMode=yes $SshHost "mkdir -p ~/$RemoteDir ~/$RemoteDataDir/data_cache ~/$RemoteDataDir/var" }
foreach ($file in $uploads) {
  Invoke-Native "scp $(Split-Path $file -Leaf)" { scp -o BatchMode=yes -q $file "${SshHost}:$RemoteDir/" }
}
$unpack = "cd ~/$RemoteDir && tar -xzf code.tar.gz"
if (-not $SkipData) { $unpack += " && tar -xzf data_cache.tar.gz -C ~/$RemoteDataDir/data_cache" }
if ($shipWheels) { $unpack += " && tar -xzf wheels.tar.gz" }
Invoke-Native "ssh unpack" { ssh -o BatchMode=yes $SshHost $unpack }

Write-Host "== 5/6 install and start on ${BindHost}:${Port} (serve_macmini.sh)"
$skip = 0
if ($SkipInstall) { $skip = 1 }
Invoke-Native "serve_macmini.sh" {
  ssh -o BatchMode=yes $SshHost "bash ~/$RemoteDir/backend/scripts/serve_macmini.sh $Port $BindHost `$HOME/$RemoteDataDir $skip"
}

Write-Host "== 6/6 /health from this PC"
if ($BindAll) {
  Write-Host "   bound to 0.0.0.0: check http://<overlay-address>:${Port}/health from the phone"
} else {
  try {
    $health = Invoke-RestMethod -Uri "http://${BindHost}:${Port}/health" -TimeoutSec 15
    Write-Host ("   OK: contract {0}, cases {1}, experiments {2}" -f $health.contract_version, $health.cases.total, $health.experiments)
  } catch {
    Write-Warning "The host answers locally but not from this PC: $($_.Exception.Message). Check the overlay and the macOS firewall for python3."
  }
}
Write-Host "Deployed. API base: http://${BindHost}:${Port}/api/v1   health: http://${BindHost}:${Port}/health"
Write-Host "Logs: ssh $SshHost 'tail -f ~/$RemoteDataDir/var/uvicorn.log'"
Write-Host "Stop: ssh $SshHost 'kill `$(cat ~/$RemoteDataDir/var/uvicorn.pid)'"
