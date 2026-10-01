<#
.SYNOPSIS
  Run the backend locally (Windows PowerShell 5.1) on http://<BindHost>:<Port>.

.DESCRIPTION
  Serves backend/data_cache (build it with python -m backend.app.ingest) and,
  when present, the Contract 2 packages under backend/experiments. Stop with
  Ctrl+C. Environment overrides: CARDIAC_DATA_CACHE, CARDIAC_EXPERIMENTS_ROOT,
  CARDIAC_DB, CARDIAC_RENDER_CACHE, CARDIAC_STUDY_ID.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\run_local.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\run_local.ps1 -BindHost 0.0.0.0 -Port 8000
#>
param(
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8000,
  [string]$DataCache = "",
  [string]$ExperimentsRoot = ""
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
if ($DataCache) { $env:CARDIAC_DATA_CACHE = $DataCache }
if ($ExperimentsRoot) { $env:CARDIAC_EXPERIMENTS_ROOT = $ExperimentsRoot }
if (-not (Test-Path (Join-Path $repo "backend\data_cache\index.json")) -and -not $DataCache) {
  Write-Warning "No data cache yet: every case endpoint will answer CASE_NOT_FOUND. Build it with: python -m backend.app.ingest"
}
Write-Host "Serving API Contract 11 v1.0.0 on http://${BindHost}:${Port} (health: /health, API: /api/v1)"
python -m uvicorn backend.app.main:app --host $BindHost --port $Port
