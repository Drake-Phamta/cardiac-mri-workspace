<#
  Build the Spike B S-1 measurement APK (RELEASE). Day 22, 2026-10-01.

  THROWAWAY SPIKE TOOLING. Written by a Claude agent under the leader's recovery
  override; owner-delegated revalidation was recorded 2026-10-03.

    powershell -ExecutionPolicy Bypass -File spikes\spike_b_3d\s1_app\build_release.ps1
    powershell -ExecutionPolicy Bypass -File spikes\spike_b_3d\s1_app\build_release.ps1 -Assets <staged spike_b_s1> -BuildRoot <short path outside repository> -JavaHome <JDK 17> -AndroidHome <Android SDK>

  WHY A SEPARATE BUILD ROOT. React Native's native (CMake/ninja) build fails on Windows when
  object paths pass ~250 characters, which a git worktree under .claude\worktrees\ does. The
  app's five source files (App.js, index.js, app.json, package.json, package-lock.json) are
  copied from this folder to a short directory OUTSIDE the repository, their SHA-256 are
  checked equal to the repository files, and the APK is built there. build_record.json
  records both, so the APK still traces to a repository commit.

  Without -Assets it uses the folder named in mesh\out_real\s1_assets\LATEST.txt (written by
  s1\stage_assets.py). Those assets are derived from a patient mask: they live only in the
  staging folder, the build root's android\app\src\main\assets\spike_b_s1 and the APK. The
  APK is copied to mesh\out_real\s1_build\<stamp>\ (gitignored). Nothing is deleted here.
#>
param(
  [string]$Assets = "",
  [string]$BuildRoot = (Join-Path $env:TEMP "cmw-spike-b-s1-build"),
  [string]$JavaHome = $env:JAVA_HOME,
  [string]$AndroidHome = $env:ANDROID_HOME
)
$ErrorActionPreference = "Stop"

$app = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $app "..\..\..")).Path
$outReal = Join-Path $repo "spikes\spike_b_3d\mesh\out_real"
if (-not $Assets) { $Assets = (Get-Content (Join-Path $outReal "s1_assets\LATEST.txt")).Trim() }
if (-not (Test-Path (Join-Path $Assets "s1_manifest.json"))) { throw "no staged assets at $Assets - run s1\stage_assets.py" }
if ($BuildRoot.StartsWith($repo)) { throw "-BuildRoot must be outside the repository" }

if (-not $JavaHome) { throw "Set JAVA_HOME or pass -JavaHome to a JDK 17 installation" }
if (-not $AndroidHome) {
  if (-not $env:LOCALAPPDATA) { throw "Set ANDROID_HOME or pass -AndroidHome to the Android SDK" }
  $AndroidHome = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not (Test-Path (Join-Path $JavaHome "bin\java.exe"))) { throw "JDK 17 not found at $JavaHome" }
if (-not (Test-Path (Join-Path $AndroidHome "platform-tools"))) { throw "Android SDK platform-tools not found at $AndroidHome" }
$env:JAVA_HOME = (Resolve-Path $JavaHome).Path
$env:ANDROID_HOME = (Resolve-Path $AndroidHome).Path
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$started = Get-Date
$head = (git -C $repo rev-parse HEAD).Trim()
$dirty = (git -C $repo status --porcelain -- spikes/spike_b_3d/s1 spikes/spike_b_3d/s1_app spikes/spike_b_3d/app)
Write-Host "repo HEAD $head  clean=$(-not $dirty)"

New-Item -ItemType Directory -Force $BuildRoot | Out-Null
$sources = @("App.js", "index.js", "app.json", "package.json", "package-lock.json")
$sourceHashes = [ordered]@{}
foreach ($f in $sources) {
  Copy-Item -Force (Join-Path $app $f) (Join-Path $BuildRoot $f)
  $a = (Get-FileHash (Join-Path $app $f)).Hash.ToLower()
  $b = (Get-FileHash (Join-Path $BuildRoot $f)).Hash.ToLower()
  if ($a -ne $b) { throw "copy of $f differs" }
  $sourceHashes[$f] = $a
}

Push-Location $BuildRoot
try {
  if (-not (Test-Path (Join-Path $BuildRoot "node_modules"))) { npm ci --no-audit --no-fund; if ($LASTEXITCODE) { throw "npm ci failed" } }
  if (-not (Test-Path (Join-Path $BuildRoot "android"))) {
    npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE) { throw "expo prebuild failed" }
  }
  # The Galaxy A17 is arm64-v8a. x86_64 is kept only so the SAME APK can be smoke-tested on
  # a diagnostic emulator before the session (never used for a B number).
  $props = Join-Path $BuildRoot "android\gradle.properties"
  $text = [IO.File]::ReadAllText($props)
  $text = [Text.RegularExpressions.Regex]::Replace($text, "(?m)^reactNativeArchitectures=.*$", "reactNativeArchitectures=arm64-v8a,x86_64")
  [IO.File]::WriteAllText($props, $text, (New-Object System.Text.UTF8Encoding $false))

  $dest = Join-Path $BuildRoot "android\app\src\main\assets\spike_b_s1"
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item -Recurse -Force (Join-Path $Assets "*") $dest
  # The destination must hold exactly the staged files - a stale extra file would ship.
  $staged = Get-ChildItem -Recurse -File $Assets | ForEach-Object { $_.FullName.Substring($Assets.Length).TrimStart('\') } | Sort-Object
  $shipped = Get-ChildItem -Recurse -File $dest | ForEach-Object { $_.FullName.Substring($dest.Length).TrimStart('\') } | Sort-Object
  $diff = Compare-Object $staged $shipped
  if ($diff) { throw "android assets differ from the staged set (move the stale spike_b_s1 asset folder away by hand): $($diff | Out-String)" }
  foreach ($f in $staged) {
    if ((Get-FileHash (Join-Path $Assets $f)).Hash -ne (Get-FileHash (Join-Path $dest $f)).Hash) { throw "asset $f differs after copy" }
  }

  Push-Location (Join-Path $BuildRoot "android")
  try {
    .\gradlew.bat assembleRelease
    if ($LASTEXITCODE) { throw "gradle assembleRelease failed" }
  } finally { Pop-Location }
} finally { Pop-Location }

$apk = Join-Path $BuildRoot "android\app\build\outputs\apk\release\app-release.apk"
$finished = Get-Date
$stamp = $finished.ToString("yyyyMMddTHHmmss")
$outDir = Join-Path $outReal "s1_build\$stamp"
New-Item -ItemType Directory -Force $outDir | Out-Null
$copy = Join-Path $outDir "spike_b_s1_$stamp.apk"
Copy-Item $apk $copy
$manifest = Get-Content (Join-Path $Assets "s1_manifest.json") -Raw | ConvertFrom-Json
$record = [ordered]@{
  record = "spike_b_s1_apk_build"
  apk = $copy
  apk_sha256 = (Get-FileHash $copy -Algorithm SHA256).Hash.ToLower()
  apk_bytes = (Get-Item $copy).Length
  apk_built_at = (Get-Item $apk).LastWriteTime.ToString("yyyy-MM-ddTHH:mm:sszzz")
  build_started = $started.ToString("yyyy-MM-ddTHH:mm:sszzz")
  build_finished = $finished.ToString("yyyy-MM-ddTHH:mm:sszzz")
  variant = "release"
  package = "com.cardiacmri.spikebs1"
  abis = "arm64-v8a,x86_64"
  build_root = $BuildRoot
  repo_head = $head
  repo_head_committed_at = (git -C $repo show -s --format=%cI $head).Trim()
  tree_clean_for_s1_code = (-not $dirty)
  app_source_sha256 = $sourceHashes
  assets_dir = $Assets
  assets_build_id = $manifest.build_id
  assets_source_commit = $manifest.source_commit
  java = (cmd /c "`"$env:JAVA_HOME\bin\java.exe`" -version 2>&1" | Select-Object -First 1)
  node = (node --version).Trim()
}
$json = $record | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $outDir "build_record.json"), $json, (New-Object System.Text.UTF8Encoding $false))
$json
Write-Host "APK: $copy"
