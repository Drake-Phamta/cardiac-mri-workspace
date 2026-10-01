<#
.SYNOPSIS
  Run the backend locally (Windows PowerShell 5.1) on http://<BindHost>:<Port>.

.DESCRIPTION
  Serves the derived data under -DataRoot (CARDIAC_BACKEND_DATA): data_cache/
  from python -m backend.app.ingest, experiments/ (Contract 2 packages, when
  present), var/ (review database, rendered predictions). The data root must be
  outside any git work tree; the service refuses otherwise. Stop with Ctrl+C.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\run_local.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File backend\scripts\run_local.ps1 -DataRoot D:\02_Research\cardiac-data\backend_cache -Port 8000
#>
param(
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 8000,
  [string]$DataRoot = $env:CARDIAC_BACKEND_DATA
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repo
if (-not $DataRoot) { $DataRoot = "D:\02_Research\cardiac-data\backend_cache" }
$env:CARDIAC_BACKEND_DATA = $DataRoot
if (-not (Test-Path (Join-Path $DataRoot "data_cache\index.json"))) {
  Write-Warning "No data cache under $DataRoot yet: every case endpoint will answer CASE_NOT_FOUND. Build it with: python -m backend.app.ingest"
}
Write-Host "Serving API Contract 11 on http://${BindHost}:${Port} (health: /health, API: /api/v1), data: $DataRoot"
python -m uvicorn backend.app.main:app --host $BindHost --port $Port
