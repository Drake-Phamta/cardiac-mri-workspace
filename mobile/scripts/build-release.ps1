<#
.SYNOPSIS
  Build a release APK of the Cardiac MRI Workspace app (Windows, PowerShell 5.1+).

.DESCRIPTION
  1. Sets JAVA_HOME to JDK 17 and ANDROID_HOME to the Android SDK. The machine's
     default java is 1.8, which the Android Gradle Plugin refuses.
  2. Builds from a STAGING COPY of the committed HEAD at a short path (default
     <drive>:\cmw-build). Two reasons:
       - the React Native new architecture compiles C++ with CMake + ninja, and
         ninja fails on Windows once object paths pass ~250 characters
         ("manifest 'build.ninja' still dirty after 100 tries" - reproduced in
         an agent worktree);
       - the APK is then exactly a commit: `git archive HEAD` of mobile/, app/
         and contracts/ is what gets built, never an uncommitted edit.
     Everything the build writes, rewrites or prunes (npm install, expo
     prebuild, gradle, -Clean) happens INSIDE the staging directory. The only
     things written outside it are the copied APK and its .build.txt, in
     mobile/release/ of the checkout (gitignored). Nothing is ever deleted
     outside the staging directory.
  3. Runs scripts/prepare.mjs in the staging copy: generates the fixture bundle
     with contracts/api/generate_fixture.py and writes buildConfig.json (mode,
     backend URL, study id, git sha, time).
  4. Runs `expo prebuild` for Android.
  5. Runs `gradlew assembleRelease` - this also bundles the JS with Hermes.
  6. Copies the APK to mobile/release/ under a name carrying the mode and the
     build time, writes <apk>.build.txt next to it (timestamp, git sha, mode,
     backend URL, APK sha256), and prints both.

  The live backend URL is never in git (the repository is public). It is taken
  from -ApiBaseUrl, else the environment variable EXPO_PUBLIC_API_BASE_URL,
  else the untracked file mobile/.env.local:
      EXPO_PUBLIC_API_BASE_URL=http://<backend-host>:8000
  A live build with no URL is refused before anything is built.

  The release build is signed with the debug keystore that Expo's template
  generates: installable with adb for device testing, NOT a store build.

.PARAMETER Mode
  fixture (default) or live.

.PARAMETER ApiBaseUrl
  Live backend, scheme://host:port with no /api/v1. See the URL rule above.

.PARAMETER StudyId
  De-identified study id the app opens. Else CMW_STUDY_ID from the
  environment or mobile/.env.local; else STUDY_DEMO (the fixture's).

.PARAMETER Abis
  Native ABIs to compile. Default arm64-v8a (the Galaxy A17 5G); building one
  ABI instead of four cuts native build time by roughly 4x.

.PARAMETER Clean
  Regenerate the staging android/ from scratch (expo prebuild --clean).

.PARAMETER MaxWorkers
  Gradle workers (default 4). The C++ steps are memory-hungry; on a machine
  that is also training a model, fewer workers keep the Gradle daemon alive
  ("Gradle build daemon disappeared unexpectedly" is a killed daemon).

.PARAMETER StagingDir
  Where to build. Must be a short path OUTSIDE the repository and not a drive
  root. Default <drive of the checkout>:\cmw-build.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File mobile\scripts\build-release.ps1 -Mode live
#>
[CmdletBinding()]
param(
  [ValidateSet('fixture', 'live')] [string] $Mode = 'fixture',
  [string] $ApiBaseUrl = '',
  [string] $StudyId = '',
  [string] $Abis = 'arm64-v8a',
  [switch] $Clean,
  [int] $MaxWorkers = 4,
  [string] $StagingDir = '',
  [string] $JavaHome = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.16.8-hotspot',
  [string] $AndroidHome = (Join-Path $env:LOCALAPPDATA 'Android\Sdk')
)

$ErrorActionPreference = 'Stop'
$mobileRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $mobileRoot
$started = Get-Date

function Step([string] $text) { Write-Host ''; Write-Host "== $text" -ForegroundColor Cyan }

# Native tools (npx, gradle, java, git) write progress and warnings to stderr.
# Under PowerShell 5.1 with ErrorActionPreference=Stop, a redirected stderr
# line becomes a terminating error, so native calls run with Continue and are
# judged by their exit code only.
function Invoke-Checked([string] $what, [scriptblock] $block) {
  $ErrorActionPreference = 'Continue'
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$what failed with exit code $LASTEXITCODE" }
}

function Read-EnvFile([string] $path) {
  $values = @{}
  if (-not (Test-Path $path)) { return $values }
  foreach ($line in Get-Content $path) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $eq = $t.IndexOf('=')
    if ($eq -le 0) { continue }
    $key = $t.Substring(0, $eq).Trim()
    $value = $t.Substring($eq + 1).Trim().Trim('"').Trim("'")
    $values[$key] = $value
  }
  return $values
}

# --- 0. live URL and study, before anything is built -------------------------
# mobile/.env.local is untracked, so it is not in the staging copy: what the
# build needs from it is read here and passed on explicitly.
$envLocal = Read-EnvFile (Join-Path $mobileRoot '.env.local')
if ($Mode -eq 'live') {
  if (-not $ApiBaseUrl) { $ApiBaseUrl = $env:EXPO_PUBLIC_API_BASE_URL }
  if (-not $ApiBaseUrl) { $ApiBaseUrl = $envLocal['EXPO_PUBLIC_API_BASE_URL'] }
  if (-not $ApiBaseUrl) {
    throw 'live mode needs the backend URL: pass -ApiBaseUrl, set EXPO_PUBLIC_API_BASE_URL, or put EXPO_PUBLIC_API_BASE_URL=http://<backend-host>:8000 in mobile\.env.local (untracked). Nothing was built.'
  }
}
if (-not $StudyId) { $StudyId = $env:CMW_STUDY_ID }
if (-not $StudyId) { $StudyId = $envLocal['CMW_STUDY_ID'] }

# --- 1. toolchain -----------------------------------------------------------
Step 'toolchain'
if (-not (Test-Path (Join-Path $JavaHome 'bin\java.exe'))) { throw "JDK 17 not found at $JavaHome (pass -JavaHome)" }
if (-not (Test-Path (Join-Path $AndroidHome 'platform-tools'))) { throw "Android SDK not found at $AndroidHome (pass -AndroidHome)" }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidHome
$env:ANDROID_SDK_ROOT = $AndroidHome
$env:Path = (Join-Path $JavaHome 'bin') + ';' + (Join-Path $AndroidHome 'platform-tools') + ';' + $env:Path
$env:NODE_ENV = 'production'
Write-Host "JAVA_HOME    $env:JAVA_HOME"
Write-Host "ANDROID_HOME $env:ANDROID_HOME"
$javaExe = Join-Path $JavaHome 'bin\java.exe'
$javaVersion = cmd /c "`"$javaExe`" -version 2>&1" | Select-Object -First 1
Write-Host "java         $javaVersion"
Write-Host "node         $(node --version)"

$gitSha = (git -C $repoRoot rev-parse HEAD).Trim()
$branch = (git -C $repoRoot rev-parse --abbrev-ref HEAD).Trim()
$env:CMW_GIT_SHA = $gitSha

# --- 2. staging copy ------------------------------------------------------------
if (-not $StagingDir) { $StagingDir = (Split-Path -Qualifier $mobileRoot) + '\cmw-build' }
$StagingDir = [System.IO.Path]::GetFullPath($StagingDir).TrimEnd('\')
$repoFull = [System.IO.Path]::GetFullPath($repoRoot).TrimEnd('\')
if ($StagingDir.Length -le 3) { throw "StagingDir must not be a drive root: $StagingDir" }
if ($StagingDir.StartsWith($repoFull + '\', [System.StringComparison]::OrdinalIgnoreCase) -or $StagingDir -ieq $repoFull) {
  throw "StagingDir must be outside the repository: $StagingDir"
}
if ($repoFull.StartsWith($StagingDir + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "StagingDir must not contain the repository: $StagingDir"
}
if ($StagingDir.Length -gt 40) { Write-Warning "StagingDir is $($StagingDir.Length) chars; native paths may exceed the Windows limit" }

Step "staging copy of HEAD $($gitSha.Substring(0, 12)) at $StagingDir"
$pending = git -C $repoRoot status --porcelain -- mobile app contracts
if ($pending) {
  Write-Warning 'uncommitted changes under mobile/ app/ contracts/ are NOT in this build - only committed HEAD is:'
  $pending | ForEach-Object { Write-Warning "  $_" }
}
New-Item -ItemType Directory -Force $StagingDir | Out-Null
# One archive file inside the staging dir, overwritten by every build.
$tarFile = Join-Path $StagingDir '.cmw-source.tar'
Invoke-Checked 'git archive' { git -C $repoRoot archive --format=tar -o $tarFile HEAD mobile app contracts }
Invoke-Checked 'tar extract' { tar -xf $tarFile -C $StagingDir }
$buildRoot = Join-Path $StagingDir 'mobile'
Write-Host "building in  $buildRoot"

Push-Location $buildRoot
try {
  # node_modules lives in the staging copy and is reused while the lockfile
  # is unchanged.
  $lockHash = (Get-FileHash (Join-Path $buildRoot 'package-lock.json') -Algorithm SHA256).Hash
  $marker = Join-Path $buildRoot 'node_modules\.cmw-lock-sha256'
  $installed = if (Test-Path $marker) { (Get-Content $marker -Raw).Trim() } else { '' }
  if ($installed -ne $lockHash) {
    Step 'npm install in the staging copy (lockfile changed or node_modules missing)'
    Invoke-Checked 'npm install' { npm install --no-audit --no-fund --prefer-offline }
    [System.IO.File]::WriteAllText($marker, $lockHash)
  }

  # --- 3. generated inputs ----------------------------------------------------
  Step "prepare ($Mode)"
  $prepareArgs = @('scripts/prepare.mjs', '--mode', $Mode, '--strict')
  if ($Mode -eq 'live') { $prepareArgs += @('--api-base-url', $ApiBaseUrl) }
  if ($StudyId) { $prepareArgs += @('--study-id', $StudyId) }
  Invoke-Checked 'prepare.mjs' { node @prepareArgs }
  $buildConfig = Get-Content (Join-Path $buildRoot 'src\generated\buildConfig.json') -Raw | ConvertFrom-Json

  # --- 4. native project ------------------------------------------------------
  Step 'expo prebuild (android)'
  $prebuildArgs = @('expo', 'prebuild', '--platform', 'android', '--no-install')
  if ($Clean) { $prebuildArgs += '--clean' }
  $env:CI = '1'   # non-interactive: never stop to ask about a dirty git tree
  Invoke-Checked 'expo prebuild' { npx @prebuildArgs }

  # --- 5. gradle --------------------------------------------------------------
  Step "gradlew assembleRelease (ABIs: $Abis)"
  Push-Location (Join-Path $buildRoot 'android')
  try {
    Invoke-Checked 'gradlew assembleRelease' { .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$Abis" "--max-workers=$MaxWorkers" --console=plain }
  } finally {
    # Shared machine (a GPU training job runs alongside): never leave a Gradle
    # daemon holding gigabytes after the build, whether it passed or failed.
    $ErrorActionPreference = 'Continue'
    .\gradlew.bat --stop --console=plain | Out-Null
    $ErrorActionPreference = 'Stop'
    Pop-Location
  }
  $apk = Join-Path $buildRoot 'android\app\build\outputs\apk\release\app-release.apk'
  if (-not (Test-Path $apk)) { throw "gradle reported success but $apk does not exist" }
} finally {
  Pop-Location
}

# --- 6. artifact + timestamp -------------------------------------------------
Step 'artifact'
$finished = Get-Date
$stamp = $finished.ToString('yyyyMMdd-HHmmss')
$outDir = Join-Path $mobileRoot 'release'
New-Item -ItemType Directory -Force $outDir | Out-Null
$outApk = Join-Path $outDir ("cardiac-mri-workspace-$Mode-$stamp.apk")
Copy-Item $apk $outApk
$sha = (Get-FileHash $outApk -Algorithm SHA256).Hash.ToLower()
$sizeMb = [math]::Round((Get-Item $outApk).Length / 1MB, 1)
# Evidence redaction (N-4): this sidecar may be committed next to device
# evidence in a public repository. It names the backend by a SHA-256 of its
# URL - enough to prove two builds talked to the same backend, useless for
# finding it - and uses paths relative to the repository root only.
$urlHash = 'none (fixture build: no backend address)'
if ($buildConfig.apiBaseUrl) {
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $digest = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes([string]$buildConfig.apiBaseUrl))
  $urlHash = 'sha256:' + (($digest | ForEach-Object { $_.ToString('x2') }) -join '')
}
$relApk = "mobile\release\$(Split-Path -Leaf $outApk)"
$lines = @(
  "apk              $(Split-Path -Leaf $outApk)",
  "built_at         $($finished.ToString('yyyy-MM-ddTHH:mm:sszzz'))",
  "build_seconds    $([int]($finished - $started).TotalSeconds)",
  'build_type       release (Hermes, signed with the template debug keystore - not a store build)',
  "mode             $($buildConfig.mode)",
  "api_base_url     $urlHash",
  "study_id         $($buildConfig.studyId)",
  "contract         $($buildConfig.contractVersion)",
  "abis             $Abis",
  "git_sha          $gitSha",
  "git_branch       $branch",
  'source_tree      staging copy of committed HEAD (uncommitted changes excluded)',
  "apk_sha256       $sha",
  "apk_size_mb      $sizeMb",
  "install          adb install -r `"$relApk`"   (from the repository root)"
)
$buildTxt = "$outApk.build.txt"
[System.IO.File]::WriteAllText($buildTxt, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding $false))

Write-Host ''
Write-Host "APK        $relApk" -ForegroundColor Green
Write-Host "BUILD INFO $relApk.build.txt" -ForegroundColor Green
$lines | ForEach-Object { Write-Host "  $_" }
