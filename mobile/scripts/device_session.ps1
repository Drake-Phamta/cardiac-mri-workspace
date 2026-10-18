<#
.SYNOPSIS
  One-command phone session for the cardiac MRI app on the Galaxy A17: preflight, install, the A9 / TC-PERF-001
  runs (3 repetitions), a screenshot tour of SCR-01..SCR-08, and the judge. Plug in, unlock, answer a few prompts.

.DESCRIPTION
  Follows mobile/A9_TC_PERF_001_SCRIPT.md (the procedure and the pass criteria T1-T4) and mobile/S1_L4_SCRIPT.md
  (adb conventions). It drives the phone with `adb shell uiautomator dump` + `input tap/swipe`, looks every control up
  by its on-screen text, and never touches the screen while a pass runs. If one UI step fails it saves a screenshot and
  the UI dump, says what it expected, and asks you to do that one step by hand.

  Everything it writes goes to -Out, which must be OUTSIDE the git repository (default
  D:\02_Research\cardiac-runs\_device_sessions\<yyyyMMdd-HHmmss>\). The device serial is used in memory only and printed
  as <device-serial>; no address, no screenshot and no MRI image is ever written into the repository (DR-019).
  Opening SCR-06 makes the app send ONE idempotent review_create (status NOT_REVIEWED) to the backend; the script asks
  before it does that, never taps Accept / Flag / Save or any other write button, and never commits a review.

  Steps (in this order): preflight, install, a9, tour, judge. Exit code: 0 = ran to the end, 2 = ran but the verdict is
  not PASS, 1 = stopped by an error or by the operator.

.PARAMETER Apk        APK to install (default: the newest mobile\release\*live*.apk).
.PARAMETER Out        Output folder, outside git (default D:\02_Research\cardiac-runs\_device_sessions\<timestamp>).
.PARAMETER Reps       A9 repetitions (default 3).
.PARAMETER Steps      all (default) or a comma list of: preflight, install, a9, tour, judge.
.PARAMETER Adb        adb.exe (default $env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe).
.PARAMETER Case       The A9 case (default CASE_0061: opens with no analysis run, MRI + ground truth).
.PARAMETER TourCase   The case of the screenshot tour (default CASE_0042; one with an analysis run shows SCR-04/05/06).
.PARAMETER MobileDir  The mobile folder of the checkout the APK was built from (default: this script's checkout).
.PARAMETER DryRun     Print what would be done and check what can be checked offline. No phone needed, nothing is sent.
.PARAMETER Record     Also record a 60 s screen video of a short hero-flow pass (adb screenrecord) after the tour.
.PARAMETER NoStayAwake Do not set "stay awake while charging" for the session (it is restored at the end otherwise).
.PARAMETER Unattended  Answer every question with its default (no disturbance, do not open SCR-06, skip a step that needs a hand). For tests and rehearsals.
.PARAMETER A9TimeoutSec Seconds to wait for the measured pass to end (default 180, the written script's 3 minutes).
.PARAMETER SelfTest   Run the offline self-checks (parser, judge, redaction) and exit.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1 -DryRun
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1 -Steps judge -Out D:\02_Research\cardiac-runs\_device_sessions\20261018-101500
#>
[CmdletBinding()]
param(
  [string]$Apk = '',
  [string]$Out = '',
  [ValidateRange(1, 5)][int]$Reps = 3,
  [string[]]$Steps = @('all'),
  [string]$Adb = '',
  [string]$Case = 'CASE_0061',
  [string]$TourCase = 'CASE_0042',
  [string]$MobileDir = '',
  [switch]$DryRun,
  [switch]$Record,
  [switch]$NoStayAwake,
  [switch]$Unattended,
  [ValidateRange(20, 900)][int]$A9TimeoutSec = 180,
  [switch]$SelfTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

. (Join-Path $PSScriptRoot 'device_ui.ps1')
. (Join-Path $PSScriptRoot 'device_judge.ps1')

if ($SelfTest) {
  . (Join-Path $PSScriptRoot '..\test\ps\DeviceSession.SelfTest.ps1')
  $bad = Invoke-DeviceSessionSelfTest -ScriptsDir $PSScriptRoot
  if ($bad -eq 0) { exit 0 } else { exit 1 }
}

$script:RepsGiven = $PSBoundParameters.ContainsKey('Reps')
$script:AllSteps = @('preflight', 'install', 'a9', 'tour', 'judge')
$script:Pkg = 'com.cardiacmri.workspace'
$script:DefaultOutRoot = 'D:\02_Research\cardiac-runs\_device_sessions'
$script:Cap = $null               # the running logcat capture (stopped in the cleanup)
$script:RecordHandle = $null
$script:CurrentManual = New-Object System.Collections.ArrayList
$script:FailureSeq = 0
$script:S = $null
$script:P = $null

# ================================================================================================================
# Session: parameters, paths, state
# ================================================================================================================

function Resolve-Session {
  $requested = @()
  foreach ($s in $Steps) { foreach ($t in ($s -split '[,\s]+')) { if ($t) { $requested += $t.ToLowerInvariant() } } }
  if ($requested.Count -eq 0 -or $requested -contains 'all') { $requested = $script:AllSteps }
  foreach ($t in $requested) {
    if ($script:AllSteps -notcontains $t) { throw ("unknown step '{0}' (use all, or a list of: {1})" -f $t, ($script:AllSteps -join ', ')) }
  }
  $run = @($script:AllSteps | Where-Object { $requested -contains $_ })

  $mobile = $MobileDir
  if (-not $mobile) { $mobile = Split-Path -Parent $PSScriptRoot }
  if (-not (Test-Path -LiteralPath $mobile)) { throw ("-MobileDir '{0}' does not exist" -f $mobile) }
  $mobile = (Resolve-Path -LiteralPath $mobile).Path
  $repo = Split-Path -Parent $mobile

  $adb = $Adb
  if (-not $adb) { $adb = Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe' }

  $apk = $Apk
  $apkNote = 'given with -Apk'
  if (-not $apk) {
    $rel = Join-Path $mobile 'release'
    $cands = @()
    if (Test-Path -LiteralPath $rel) { $cands = @(Get-ChildItem -LiteralPath $rel -Filter '*live*.apk' -File | Sort-Object LastWriteTime -Descending) }
    if ($cands.Count -gt 0) { $apk = $cands[0].FullName; $apkNote = 'newest *live*.apk' }
  }

  $outRoot = $script:DefaultOutRoot
  if (-not (Test-Path -LiteralPath ([System.IO.Path]::GetPathRoot($outRoot)))) {
    $outRoot = Join-Path $env:LOCALAPPDATA 'cardiac-runs\_device_sessions'
  }
  $out = $Out
  $outNote = 'given'
  if (-not $out) {
    $judgeOnly = ($run.Count -eq 1 -and $run[0] -eq 'judge')
    $latest = $null
    if ($judgeOnly -and (Test-Path -LiteralPath $outRoot)) {
      $latest = Get-ChildItem -LiteralPath $outRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
    }
    if ($latest) { $out = $latest.FullName; $outNote = 'latest session folder (judge only)' }
    else { $out = Join-Path $outRoot (Get-Date -Format 'yyyyMMdd-HHmmss'); $outNote = 'default' }
  }
  $out = [System.IO.Path]::GetFullPath($out)

  return @{
    Run = $run; Mobile = $mobile; Repo = $repo; Adb = $adb; Apk = $apk; ApkNote = $apkNote; Out = $out; OutNote = $outNote
    Preflight = (Join-Path $mobile 'scripts\preflight-live.mjs')
  }
}

function Test-OutsideGit {
  # The output folder must not be inside the repository (or any git work tree): serial, addresses and screenshots.
  param([string]$Path, [string]$Repo)
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\') + '\'
  $roots = New-Object System.Collections.ArrayList
  [void]$roots.Add([System.IO.Path]::GetFullPath($Repo).TrimEnd('\') + '\')
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    $probe = $Path
    while ($probe -and -not (Test-Path -LiteralPath $probe)) { $probe = Split-Path -Parent $probe }
    if ($probe) {
      $r = Invoke-Native -FilePath $git.Source -ArgumentList @('-C', $probe, 'rev-parse', '--show-toplevel') -TimeoutSec 20
      if ($r.ExitCode -eq 0 -and $r.StdOut.Trim()) {
        [void]$roots.Add(([System.IO.Path]::GetFullPath($r.StdOut.Trim()).TrimEnd('\') + '\'))
      }
    }
  }
  foreach ($root in $roots) {
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function New-State {
  return @{
    Version = 1
    Started = (Get-Date).ToString('s')
    Case = $Case; TourCase = $TourCase; Reps = $Reps
    Device = @{}; Apk = @{}
    PreflightLine = 'not run'; BackendLine = 'backend not checked from the PC'; BackendHealth = 'not checked'
    RepMeta = @{}
    Tour = (New-Object System.Collections.ArrayList)
    Warnings = (New-Object System.Collections.ArrayList)
    Deviations = (New-Object System.Collections.ArrayList)
    PhoneClock = ''; PcClock = ''
    Rehearsal = $false; RehearsalWhy = ''
    RerunUsed = $false
    StayAwakeOriginal = ''
  }
}

function ConvertTo-HashtableDeep {
  param($Object)
  if ($null -eq $Object) { return $null }
  if ($Object -is [System.Management.Automation.PSCustomObject]) {
    $h = @{}
    foreach ($p in $Object.PSObject.Properties) { $h[$p.Name] = ConvertTo-HashtableDeep $p.Value }
    return $h
  }
  if ($Object -is [System.Array]) {
    $l = New-Object System.Collections.ArrayList
    foreach ($i in $Object) { [void]$l.Add((ConvertTo-HashtableDeep $i)) }
    return , $l
  }
  return $Object
}

function Save-State {
  $json = $script:S | ConvertTo-Json -Depth 8
  Write-TextFile -Path (Join-Path $script:P.Out 'session_state.json') -Text (Hide-Secret $json)
}

function Import-State {
  $f = Join-Path $script:P.Out 'session_state.json'
  if (-not (Test-Path -LiteralPath $f)) { return $false }
  try {
    $o = (Get-Content -LiteralPath $f -Raw) | ConvertFrom-Json
    $h = ConvertTo-HashtableDeep $o
    $base = New-State
    foreach ($k in $h.Keys) { $base[$k] = $h[$k] }
    $script:S = $base
    return $true
  } catch { return $false }
}

function Add-Warning {
  param([string]$Text)
  Write-Log $Text 'WARN'
  [void]$script:S.Warnings.Add((Hide-Secret $Text))
}

function Add-Deviation {
  param([string]$Text)
  [void]$script:S.Deviations.Add((Hide-Secret $Text))
}

# ================================================================================================================
# Operator prompts
# ================================================================================================================

function Read-Operator {
  param([string]$Prompt, [string]$Default = '')
  if ($Unattended) {
    Write-Host ($Prompt + '   (unattended: ' + $(if ($Default) { $Default } else { 'Enter' }) + ')') -ForegroundColor DarkGray
    return $Default
  }
  try { return ([string](Read-Host $Prompt)).Trim() }
  catch { throw 'there is no console to ask you something: run this script in an interactive PowerShell window' }
}

function Save-FailureArtifacts {
  param([string]$Name)
  $dir = Join-Path $script:P.Out 'failures'
  if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
  $script:FailureSeq++
  $safe = ($Name -replace '[^A-Za-z0-9]+', '_').Trim('_')
  if ($safe.Length -gt 40) { $safe = $safe.Substring(0, 40) }
  $base = '{0:00}_{1}' -f $script:FailureSeq, $safe
  try { [void](Save-Screenshot -Path (Join-Path $dir ($base + '.png'))) } catch { }
  try { $d = Get-UiDump -Retries 2; if ($d) { Save-UiDump -Dump $d -Path (Join-Path $dir ($base + '.xml')) } } catch { }
  return $base
}

function Request-ManualStep {
  # Returns 'done' or 'skip'; throws OPERATOR_QUIT.
  param([string]$Name, [string]$Expected)
  Write-Log ("UI step '{0}' did not work by itself." -f $Name) 'WARN'
  $base = Save-FailureArtifacts -Name $Name
  Write-Host ''
  Write-Host ('  What the script expected on the phone: {0}' -f $Expected) -ForegroundColor Yellow
  Write-Host ('  Screenshot and UI dump of what it saw: failures\{0}.png / .xml (outside git)' -f $base) -ForegroundColor Yellow
  Write-Host '  Please do THIS ONE STEP by hand on the phone now, then come back here.' -ForegroundColor Yellow
  $ans = Read-Operator '  Press Enter when it is done (S = skip this step, Q = stop the session)' -Default 'S'
  if ($ans -match '^[qQ]') { throw 'OPERATOR_QUIT' }
  if ($ans -match '^[sS]') { Write-Log ("operator skipped '{0}'" -f $Name) 'WARN'; return 'skip' }
  Write-Log ("operator did '{0}' by hand" -f $Name) 'INFO'
  return 'done'
}

function Invoke-Quiet {
  # Runs a step block; true only when the LAST thing it emitted is true (stray output cannot turn a failure into a
  # success). Exceptions are logged and mean false - except an operator quit and a refused write-button tap.
  param([scriptblock]$Block, [string]$Name)
  try {
    $r = @(& $Block)
    if ($r.Count -eq 0) { return $false }
    return [bool]$r[$r.Count - 1]
  } catch {
    $msg = $_.Exception.Message
    if ($msg -eq 'OPERATOR_QUIT' -or $msg -like 'refused to tap*' -or $msg -like 'FATAL:*') { throw }
    Write-Log ("step '{0}' raised: {1}" -f $Name, $msg) 'WARN'
    return $false
  }
}

function Invoke-UiStep {
  # Tries the action (twice), then falls back to "do it by hand". Returns 'auto' | 'manual' | 'skip'.
  param([string]$Name, [string]$Expected, [scriptblock]$Action, [scriptblock]$Verify = $null, [int]$Attempts = 2)
  for ($i = 1; $i -le $Attempts; $i++) {
    if (Invoke-Quiet -Block $Action -Name $Name) { return 'auto' }
    if ($i -lt $Attempts) {
      Write-Log ("step '{0}' did not work (try {1} of {2}); trying again" -f $Name, $i, $Attempts) 'WARN'
      Start-Sleep -Seconds 2
    }
  }
  for ($m = 1; $m -le 3; $m++) {
    $ans = Request-ManualStep -Name $Name -Expected $Expected
    if ($ans -eq 'skip') { return 'skip' }
    [void]$script:CurrentManual.Add($Name)
    if ($null -eq $Verify) { return 'manual' }
    if (Invoke-Quiet -Block $Verify -Name $Name) { return 'manual' }
    Write-Log 'the phone does not show the expected state yet' 'WARN'
  }
  return 'skip'
}

# ================================================================================================================
# Device: pin, profile, state
# ================================================================================================================

function Connect-Device {
  if (-not (Test-Path -LiteralPath $script:P.Adb)) {
    throw 'adb.exe was not found at the default place. Install the Android platform-tools, or pass -Adb <full path of adb.exe>.'
  }
  $script:Ctx.Adb = $script:P.Adb
  $script:Ctx.Package = $script:Pkg
  [void](Invoke-Adb -Arguments @('start-server') -NoSerial -TimeoutSec 30)
  $devs = @(Get-DeviceList)
  $ready = @($devs | Where-Object { $_.State -eq 'device' })
  $unauth = @($devs | Where-Object { $_.State -eq 'unauthorized' })
  $offline = @($devs | Where-Object { $_.State -eq 'offline' })
  if ($devs.Count -eq 0) {
    throw ('No phone found on adb. Plug the phone in with the USB cable, UNLOCK it, and if it asks "Allow USB debugging?" tap Allow (tick "Always allow from this computer"). ' +
      'Check that USB debugging is on (Settings > Developer options). Then run this command again.')
  }
  if ($ready.Count -eq 0 -and $unauth.Count -gt 0) {
    throw 'The phone is connected but has not authorised this PC. Unlock the phone, tap Allow on the "Allow USB debugging?" prompt (tick "Always allow"), then run this command again.'
  }
  if ($ready.Count -eq 0 -and $offline.Count -gt 0) {
    throw 'adb sees the phone as OFFLINE. Unplug the cable, plug it back in, unlock the phone and accept USB debugging if asked, then run this command again.'
  }
  if ($ready.Count -ne 1) {
    throw ('adb sees {0} authorised devices. Unplug the others so that exactly one phone is connected, then run this command again.' -f $ready.Count)
  }
  $script:Ctx.Serial = $ready[0].Serial
  Add-Secret -Value $ready[0].Serial -Mask '<device-serial>'
  $st = (Invoke-Adb -Arguments @('get-state')).StdOut.Trim()
  if ($st -ne 'device') { throw ("adb get-state says '{0}', not 'device'. Re-plug the phone and run again." -f $st) }
  Write-Log ('device pinned (exactly one authorised phone, model {0})' -f $ready[0].Model) 'OK'
  $script:S.Device['ModelId'] = $ready[0].Model
  [void](Get-ScreenSize)
}

function Get-PropMap {
  # `getprop` (all of it) -> only the keys we keep. The raw text holds the serial and is never logged or saved.
  $r = Invoke-AdbShell -Arguments @('getprop')
  $map = @{}
  foreach ($m in [regex]::Matches($r.StdOut, '(?m)^\[([^\]]+)\]:\s*\[([^\]]*)\]')) { $map[$m.Groups[1].Value] = $m.Groups[2].Value }
  return $map
}

function Get-Battery {
  # { Level; TempC; Text } from dumpsys battery
  $r = Invoke-AdbShell -Arguments @('dumpsys', 'battery')
  $lvl = $null; $tmp = $null
  $m = [regex]::Match($r.StdOut, '(?m)^\s*level:\s*(\d+)'); if ($m.Success) { $lvl = [int]$m.Groups[1].Value }
  $m = [regex]::Match($r.StdOut, '(?m)^\s*temperature:\s*(-?\d+)'); if ($m.Success) { $tmp = [int]$m.Groups[1].Value / 10.0 }
  $text = 'unknown'
  if ($null -ne $lvl) { $text = ('{0} %' -f $lvl) }
  if ($null -ne $tmp) { $text += (', {0} C' -f $tmp.ToString('0.0', [System.Globalization.CultureInfo]::InvariantCulture)) }
  return @{ Level = $lvl; TempC = $tmp; Text = $text }
}

function Get-Setting {
  param([string]$Namespace, [string]$Key)
  $r = Invoke-AdbShell -Arguments @('settings', 'get', $Namespace, $Key)
  return $r.StdOut.Trim()
}

function Get-DeviceProfile {
  $props = Get-PropMap
  $get = { param($k) if ($props.ContainsKey($k) -and $props[$k]) { $props[$k] } else { 'unknown' } }
  $bat = Get-Battery
  $d = $script:S.Device
  $d['Model'] = (& $get 'ro.product.model')
  $d['Brand'] = (& $get 'ro.product.brand')
  $d['Name'] = (& $get 'ro.product.device')
  $d['Android'] = (& $get 'ro.build.version.release')
  $d['Sdk'] = (& $get 'ro.build.version.sdk')
  $d['Abi'] = (& $get 'ro.product.cpu.abi')
  $d['SecurityPatch'] = (& $get 'ro.build.version.security_patch')
  $d['BatteryStart'] = $bat.Text
  $anim = @()
  foreach ($k in 'window_animation_scale', 'transition_animation_scale', 'animator_duration_scale') {
    $v = Get-Setting 'global' $k
    if (-not $v -or $v -eq 'null') { $v = 'default' }
    $anim += $v
  }
  $d['Animation'] = ($anim -join ' / ')
  $rr = @()
  foreach ($pair in @(@('secure', 'refresh_rate_mode'), @('system', 'peak_refresh_rate'), @('system', 'min_refresh_rate'))) {
    $v = Get-Setting $pair[0] $pair[1]
    if (-not $v) { $v = 'null' }
    $rr += ('{0}={1}' -f $pair[1], $v)
  }
  $d['RefreshRate'] = ($rr -join ', ')
  $d['LowPower'] = (Get-Setting 'global' 'low_power')
  $d['ScreenOffTimeoutMs'] = (Get-Setting 'system' 'screen_off_timeout')
  $d['StayOn'] = (Get-Setting 'global' 'stay_on_while_plugged_in')
  $dt = Invoke-AdbShell -Arguments @('date', '+%Y-%m-%dT%H:%M:%S%z')
  $script:S.PhoneClock = $dt.StdOut.Trim()
  $script:S.PcClock = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  return $bat
}

function Test-PhoneAwake {
  $r = Invoke-AdbShell -Arguments @('dumpsys', 'power')
  return ($r.StdOut -match 'mWakefulness=Awake')
}

function Test-PhoneLocked {
  $r = Invoke-AdbShell -Arguments @('dumpsys', 'window') -TimeoutSec 60
  if ($r.StdOut -match '(?i)(mDreamingLockscreen|isKeyguardShowing|mShowingLockscreen|mKeyguardShowing|keyguardShowing)\s*=\s*true') { return $true }
  # newer builds: the keyguard delegate block of the window-manager policy ("showing=true")
  return ($r.StdOut -match '(?is)mKeyguardDelegate:.{0,400}?\bshowing=true')
}

function Request-PhoneReady {
  # Awake and unlocked, or ask the operator (a secure lock cannot be opened over adb).
  for ($i = 1; $i -le 3; $i++) {
    $awake = Test-PhoneAwake
    if (-not $awake) { Invoke-UiKey 'KEYCODE_WAKEUP'; Start-Sleep -Milliseconds 900 }
    $locked = Test-PhoneLocked
    if ($awake -and -not $locked) { return }
    if (-not $locked) { return }
    Invoke-AdbShell -Arguments @('wm', 'dismiss-keyguard') | Out-Null
    Start-Sleep -Milliseconds 800
    if (-not (Test-PhoneLocked)) { return }
    [void](Read-Operator '  The phone is asleep or locked. Unlock it now and keep it awake, then press Enter')
  }
  Add-Warning 'the phone still looks locked; continuing, the UI steps will tell'
}

function Set-StayAwake {
  if ($NoStayAwake) { return }
  $orig = Get-Setting 'global' 'stay_on_while_plugged_in'
  if (-not $orig -or $orig -eq 'null') { $orig = '0' }
  $script:S.StayAwakeOriginal = $orig
  if ($orig -ne '3') {
    [void](Invoke-AdbShell -Arguments @('settings', 'put', 'global', 'stay_on_while_plugged_in', '3'))
    Write-Log ("'stay awake while charging' switched on for the session (it was {0}; restored at the end)" -f $orig)
    Add-Deviation ("'Stay awake while charging' was switched on by the script for the session (was {0}) and restored at the end." -f $orig)
  }
}

function Restore-StayAwake {
  if ($NoStayAwake -or -not $script:Ctx.Serial) { return }
  $orig = $script:S.StayAwakeOriginal
  if ($orig -and $orig -ne '3') {
    try { [void](Invoke-AdbShell -Arguments @('settings', 'put', 'global', 'stay_on_while_plugged_in', [string]$orig)); Write-Log ("'stay awake while charging' restored to {0}" -f $orig) } catch { }
  }
}

# ================================================================================================================
# APK
# ================================================================================================================

function Get-ApkInfo {
  # Identity from the file itself: name, size, SHA-256 of the bytes, and the .build.txt sidecar next to it.
  param([string]$Path)
  $info = @{}
  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) { return $null }
  $fi = Get-Item -LiteralPath $Path
  $info['Path'] = $fi.FullName
  $info['Name'] = $fi.Name
  $info['SizeMb'] = [Math]::Round($fi.Length / 1MB, 1)
  $info['Sha256'] = (Get-FileHash -LiteralPath $fi.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  $side = $fi.FullName + '.build.txt'
  $info['Sidecar'] = $side
  $info['HasSidecar'] = (Test-Path -LiteralPath $side)
  $info['Verified'] = 'no sidecar'
  $info['Mode'] = 'unknown'; $info['Contract'] = 'unknown'; $info['GitSha'] = 'unknown'; $info['GitBranch'] = 'unknown'
  $info['BuiltAt'] = 'unknown'; $info['BuildType'] = 'unknown'; $info['VersionName'] = 'not installed yet'
  if ($info['HasSidecar']) {
    $b = ConvertFrom-BuildRecord ([System.IO.File]::ReadAllText($side))
    $want = ''
    if ($b.Contains('apk_sha256')) { $want = $b['apk_sha256'].ToLowerInvariant() }
    if ($want -and $want -eq $info['Sha256']) { $info['Verified'] = 'matches the sidecar' }
    elseif ($want) { $info['Verified'] = 'MISMATCH with the sidecar' }
    else { $info['Verified'] = 'sidecar has no apk_sha256' }
    foreach ($pair in @(@('Mode', 'mode'), @('Contract', 'contract'), @('GitSha', 'git_sha'), @('GitBranch', 'git_branch'), @('BuiltAt', 'built_at'), @('BuildType', 'build_type'))) {
      if ($b.Contains($pair[1])) { $info[$pair[0]] = $b[$pair[1]] }
    }
    $info['SidecarText'] = [System.IO.File]::ReadAllText($side)
  }
  return $info
}

# ================================================================================================================
# Step: preflight
# ================================================================================================================

function Get-BackendUrl {
  $u = $env:EXPO_PUBLIC_API_BASE_URL
  if ($u) { return $u.Trim() }
  $f = Join-Path $script:P.Mobile '.env.local'
  if (Test-Path -LiteralPath $f) {
    foreach ($line in [System.IO.File]::ReadAllLines($f)) {
      $t = $line.Trim()
      if (-not $t -or $t.StartsWith('#')) { continue }
      $eq = $t.IndexOf('=')
      if ($eq -le 0) { continue }
      if ($t.Substring(0, $eq).Trim() -eq 'EXPO_PUBLIC_API_BASE_URL') { return $t.Substring($eq + 1).Trim().Trim('"').Trim("'") }
    }
  }
  return ''
}

function Test-BackendHealth {
  # "reachable" / "unreachable" / "not configured". The address is registered as a secret and never printed.
  $u = Get-BackendUrl
  if (-not $u) { return 'not configured' }
  Add-Secret -Value $u -Mask '<backend>'
  try { $h = ([System.Uri]$u).Host; Add-Secret -Value $h -Mask '<backend-host>' } catch { return 'unreachable' }
  try {
    $req = [System.Net.HttpWebRequest]::Create($u.TrimEnd('/') + '/health')
    $req.Timeout = 8000
    $resp = $req.GetResponse()
    $code = [int]$resp.StatusCode
    $resp.Close()
    if ($code -eq 200) { return 'reachable' }
    return 'unreachable'
  } catch { return 'unreachable' }
}

function Step-Preflight {
  Write-Log '== preflight' 'STEP'
  $info = Get-ApkInfo -Path $script:P.Apk
  if ($null -eq $info) { throw 'No APK found. Build one (mobile\scripts\build-release.ps1 -Mode live) or pass -Apk <file>.' }
  foreach ($k in $info.Keys) { if ($k -ne 'SidecarText') { $script:S.Apk[$k] = $info[$k] } }
  Write-Log ('APK {0} ({1} MB) sha256 {2}...' -f $info['Name'], $info['SizeMb'], $info['Sha256'].Substring(0, 12))
  Write-Log ('build record: mode {0}, contract {1}, git_sha {2}, branch {3}, built_at {4}; hash check: {5}' -f $info['Mode'], $info['Contract'], $info['GitSha'], $info['GitBranch'], $info['BuiltAt'], $info['Verified'])
  if ($info['Verified'] -like 'MISMATCH*') { throw 'The APK file does not match the apk_sha256 in its .build.txt: it is not the build that was recorded. Do not use it as evidence; rebuild or fetch the right file.' }
  if ($info['Mode'] -ne 'live') {
    $script:S.Rehearsal = $true; $script:S.RehearsalWhy = ('the APK is a {0} build, not live' -f $info['Mode'])
    Add-Warning ('This APK is "{0}", not "live": the session is a REHEARSAL, not evidence (fixture mode has no image store and no gesture log).' -f $info['Mode'])
  }
  if ($info['GitBranch'] -ne 'main') { Add-Warning ('The APK was built from branch "{0}", not main: not evidence for TC-PERF-001.' -f $info['GitBranch']) }
  $head = ''
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) { $h = Invoke-Native -FilePath $git.Source -ArgumentList @('-C', $script:P.Repo, 'rev-parse', 'HEAD') -TimeoutSec 20; if ($h.ExitCode -eq 0) { $head = $h.StdOut.Trim() } }
  if ($head -and $info['GitSha'] -ne 'unknown' -and $head -ne $info['GitSha']) {
    Write-Log ('note: this checkout is at {0}; the APK was built from {1}' -f $head.Substring(0, 7), $info['GitSha'].Substring(0, [Math]::Min(7, $info['GitSha'].Length)))
  }
  Write-TextFile -Path (Join-Path $script:P.Out 'apk_build_record.txt') -Text (ConvertTo-RedactedBuildRecord $info['SidecarText'])

  # the phone
  $bat = Get-DeviceProfile
  $d = $script:S.Device
  Write-Log ('device: {0} {1}, Android {2} (SDK {3}), ABI {4}, battery {5}' -f $d['Brand'], $d['Model'], $d['Android'], $d['Sdk'], $d['Abi'], $d['BatteryStart'])
  Write-Log ('screen {0}x{1}; animation scales {2}; refresh-rate settings {3}' -f $script:Ctx.Screen.W, $script:Ctx.Screen.H, $d['Animation'], $d['RefreshRate'])
  Write-Log ('phone clock {0}; PC clock {1}' -f $script:S.PhoneClock, $script:S.PcClock)
  if ($d['ModelId'] -ne 'SM_A176B') { Add-Warning ('the connected phone is model {0}, not the declared Galaxy A17 5G (SM-A176B): not the declared demo device (D1)' -f $d['Model']); Add-Deviation ('The phone was a {0}, not the declared Galaxy A17 5G SM-A176B.' -f $d['Model']) }
  if ($d['Animation'] -ne '1.0 / 1.0 / 1.0') { Write-Log ('animation scales are {0} (recorded; the written script only asks that they do not change during the session)' -f $d['Animation']) }
  if ($null -ne $bat.Level -and $bat.Level -lt 50) { Add-Warning ('battery is at {0} %: the written script wants more than 50 % (plug it in and let it charge)' -f $bat.Level) }
  if ($null -ne $bat.TempC -and $bat.TempC -ge 40) { Add-Warning ('battery temperature is {0} C: let the phone cool down first (note it in the PROVENANCE)' -f $bat.TempC) }
  if ($d['LowPower'] -eq '1') { Add-Warning 'battery saver is ON: switch it off, it changes timing' }
  $tmo = 0; [void][int]::TryParse($d['ScreenOffTimeoutMs'], [ref]$tmo)
  if ($tmo -gt 0 -and $tmo -lt 300000 -and $NoStayAwake) { Add-Warning ('screen timeout is {0} s (the written script wants at least 5 min)' -f [int]($tmo / 1000)) }
  Set-StayAwake
  Request-PhoneReady

  # the backend, from the PC: only "reachable" / "unreachable"
  $health = Test-BackendHealth
  $script:S.BackendHealth = $health
  Write-Log ('backend health from the PC: {0}' -f $health)
  if ($health -eq 'unreachable') { Add-Warning 'the backend did not answer /health from this PC (overlay down? backend stopped?): the phone will not load cases either' }
  if ($health -eq 'not configured') { Write-Log 'no EXPO_PUBLIC_API_BASE_URL in the environment or mobile\.env.local: the PC cannot check the backend; the phone-side check is that the case list loads' }

  # the app's own preflight (drives the backend with the app's code; never prints the address)
  $node = Find-NodeExe
  if (-not $node) { Add-Warning 'node is not on PATH: preflight-live.mjs and the judge need it' }
  elseif (-not (Test-Path -LiteralPath $script:P.Preflight)) { Add-Warning 'mobile\scripts\preflight-live.mjs does not exist in this checkout: its check is skipped' }
  else {
    $r = Invoke-NodeScript -Node $node -Script $script:P.Preflight -ScriptArgs @('--case', $Case) -TimeoutSec 240
    $text = Hide-Secret ($r.StdOut + $(if ($r.StdErr) { "`n" + $r.StdErr } else { '' }))
    $block = Get-PreflightBlock $text
    if ($block -and ($r.ExitCode -eq 0 -or $r.ExitCode -eq 1)) { Write-TextFile -Path (Join-Path $script:P.Out 'preflight.txt') -Text $block }
    foreach ($l in ($text -split "`r?`n")) { if ($l.Trim()) { Write-Log ('  ' + $l.TrimEnd()) } }
    if ($r.ExitCode -eq 0) { $script:S.PreflightLine = 'PREFLIGHT PASS'; $script:S.BackendLine = (Get-BackendFacts $block) }
    elseif ($r.ExitCode -eq 2) {
      $script:S.PreflightLine = 'not run (no backend URL on this PC)'
      Write-Log 'preflight-live.mjs: not configured (no backend URL here); continuing' 'WARN'
    } else {
      $script:S.PreflightLine = 'PREFLIGHT FAIL'
      Add-Warning 'PREFLIGHT did not pass (see above). The written script says to stop.'
      if ($script:P.Run -contains 'a9') {
        $a = Read-Operator '  Continue anyway (the result will not be evidence)? [y/N]' -Default 'n'
        if ($a -notmatch '^[yY]') { throw 'stopped: PREFLIGHT did not pass' }
        $script:S.Rehearsal = $true; $script:S.RehearsalWhy = 'PREFLIGHT did not pass'
      }
    }
  }
  Save-State
}

# ================================================================================================================
# Step: install
# ================================================================================================================

function Step-Install {
  Write-Log '== install' 'STEP'
  $info = Get-ApkInfo -Path $script:P.Apk
  if ($null -eq $info) { throw 'No APK found. Build one (mobile\scripts\build-release.ps1 -Mode live) or pass -Apk <file>.' }
  if ($info['Verified'] -like 'MISMATCH*') { throw 'The APK file does not match the apk_sha256 in its .build.txt.' }
  foreach ($k in $info.Keys) { if ($k -ne 'SidecarText') { $script:S.Apk[$k] = $info[$k] } }
  $before = Invoke-AdbShell -Arguments @('dumpsys', 'package', $script:Pkg)
  $m = [regex]::Match($before.StdOut, 'versionName=(\S+)')
  if ($m.Success) { Write-Log ('already installed: versionName {0}' -f $m.Groups[1].Value) } else { Write-Log 'not installed yet' }
  Write-Log ('adb install -r {0} (28 MB: 10-60 s; if the phone asks "Install via USB?", tap Install)' -f $info['Name'])
  $r = Invoke-Adb -Arguments @('install', '-r', $info['Path']) -TimeoutSec 600
  $out = ($r.StdOut + ' ' + $r.StdErr)
  if ($r.TimedOut) { throw 'adb install did not finish in 10 minutes. Is the phone waiting for you to confirm "Install via USB"? Unlock it and run again.' }
  if ($out -notmatch 'Success') {
    $fail = [regex]::Match($out, 'Failure \[[^\]]+\]')
    $why = 'no "Success" in the output'
    if ($fail.Success) { $why = $fail.Value }
    if ($out -match 'INSTALL_FAILED_UPDATE_INCOMPATIBLE|INSTALL_FAILED_VERSION_DOWNGRADE') {
      Write-Log ('install refused: {0}. The installed app was signed differently (or is newer).' -f $why) 'WARN'
      $a = Read-Operator '  Uninstall the old app from the phone and install this one? Its data is lost (it holds nothing you need). [y/N]' -Default 'n'
      if ($a -match '^[yY]') {
        [void](Invoke-Adb -Arguments @('uninstall', $script:Pkg) -TimeoutSec 60)
        $r = Invoke-Adb -Arguments @('install', $info['Path']) -TimeoutSec 600
        $out = ($r.StdOut + ' ' + $r.StdErr)
        Add-Deviation 'The previously installed app was uninstalled first (signature mismatch / downgrade), then this APK was installed.'
      }
    }
    if ($out -notmatch 'Success') { throw ('adb install failed: {0}' -f (Hide-Secret $why)) }
  }
  Write-Log 'adb install: Success' 'OK'
  $pk = Invoke-AdbShell -Arguments @('pm', 'list', 'packages', $script:Pkg)
  if ($pk.StdOut -notmatch ('package:' + [regex]::Escape($script:Pkg))) { throw 'the package is not on the phone after the install' }
  $after = Invoke-AdbShell -Arguments @('dumpsys', 'package', $script:Pkg)
  $vn = [regex]::Match($after.StdOut, 'versionName=(\S+)')
  $vc = [regex]::Match($after.StdOut, 'versionCode=(\d+)')
  if (-not $vn.Success) { throw 'dumpsys package shows no versionName: the install did not take' }
  $script:S.Apk['VersionName'] = $vn.Groups[1].Value
  if ($vc.Success) { $script:S.Apk['VersionCode'] = $vc.Groups[1].Value }
  Write-Log ('installed: {0}, versionName {1}{2}' -f $script:Pkg, $vn.Groups[1].Value, $(if ($vc.Success) { ', versionCode ' + $vc.Groups[1].Value } else { '' })) 'OK'
  Save-State
}

# ================================================================================================================
# UI flows (shared by the A9 repetitions and the tour)
# ================================================================================================================

function Start-App {
  [void](Invoke-AdbShell -Arguments @('monkey', '-p', $script:Pkg, '-c', 'android.intent.category.LAUNCHER', '1') -TimeoutSec 40)
}

function Stop-App {
  [void](Invoke-AdbShell -Arguments @('am', 'force-stop', $script:Pkg))
}

function Get-TapNode {
  param($Dump, [string]$Text = '', [string]$Regex = '', [double]$YMin = -1, [double]$YMax = -1, [switch]$Last, [switch]$NoSubstring, [switch]$EnabledOnly)
  return (Find-UiNode -Nodes $Dump.Nodes -Text $Text -Regex $Regex -Package $script:Pkg -YMin $YMin -YMax $YMax -Last:$Last -NoSubstring:$NoSubstring -EnabledOnly:$EnabledOnly)
}

function Invoke-TapText {
  # Wait for a node with this text (scrolling if asked), tap its centre.
  param([string]$Text = '', [string]$Regex = '', [int]$TimeoutSec = 20, [switch]$Scroll, [double]$YMin = -1, [double]$YMax = -1, [switch]$Last, [switch]$NoSubstring, [switch]$EnabledOnly)
  $r = Wait-UiNode -Text $Text -Regex $Regex -TimeoutSec $TimeoutSec -YMin $YMin -YMax $YMax -Last:$Last -ScrollIfMissing:$Scroll -NoSubstring:$NoSubstring -EnabledOnly:$EnabledOnly -AppOnly
  if ($null -eq $r) { return $false }
  Invoke-UiTapNode -Node $r.Node
  Start-Sleep -Milliseconds 900
  return $true
}

function Test-ProblemScreen {
  # StatePanel tags and the shell's blocking screens, from a dump. Returns the first one found or ''.
  param($Dump)
  foreach ($re in '^CONFIGURATION ERROR$', '^FATAL INVALID$', '^RECOVERABLE ERROR$', '^STALE MISMATCH$', 'failed while rendering and was stopped', 'could not be reached') {
    if (Test-UiText -Nodes $Dump.Nodes -Regex $re -Package $script:Pkg) { return $re.Trim('^$') }
  }
  return ''
}

function Wait-AppReady {
  # The app is up when the header shows its mode badge. CONFIGURATION ERROR = an APK built with no backend URL.
  $deadline = (Get-Date).AddSeconds(75)
  do {
    $d = Get-UiDump
    if ($d) {
      if (Test-UiText -Nodes $d.Nodes -Regex '^CONFIGURATION ERROR$' -Package $script:Pkg) {
        throw 'FATAL: the app opened on CONFIGURATION ERROR: this APK was built without a backend URL. Rebuild it in live mode (mobile\scripts\build-release.ps1 -Mode live).'
      }
      $b = Find-UiNode -Nodes $d.Nodes -Regex '^(LIVE|FIXTURE)\b' -Package $script:Pkg -YMax 0.2
      if ($b) {
        if ($b.TextN -match 'FIXTURE' -or $b.DescN -match '^FIXTURE') {
          $script:S.Rehearsal = $true; $script:S.RehearsalWhy = 'the app badge reads FIXTURE'
          Add-Warning 'the header badge reads FIXTURE: this is a rehearsal build (no image store, no gesture log)'
        } else { Write-Log 'header badge: LIVE' 'OK' }
        return $true
      }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Switch-Tab {
  param([string]$Label)
  return (Invoke-TapText -Text $Label -NoSubstring -YMin 0.86 -Last -TimeoutSec 20)
}

function Test-KeyboardShown {
  $r = Invoke-AdbShell -Arguments @('dumpsys', 'input_method')
  return ($r.StdOut -match 'mInputShown=true')
}

function Open-CaseFromList {
  # Cases tab -> the case's row (scrolling the list; typing in the search box if it is not found).
  param([string]$CaseId)
  if (-not (Switch-Tab 'Cases')) { return $false }
  $rowRe = '^' + [regex]::Escape($CaseId) + '(,|\s|$)'
  $row = $null
  $scrolls = 0
  for ($i = 0; $i -lt 14 -and $null -eq $row; $i++) {
    $d = Get-UiDump
    if (-not $d) { Start-Sleep -Seconds 1; continue }
    $row = Get-TapNode -Dump $d -Regex $rowRe -YMax 0.88
    if ($row) { break }
    $prob = Test-ProblemScreen $d
    if ($prob) {
      Write-Log ('the case list shows: {0}; tapping Retry' -f $prob) 'WARN'
      [void](Invoke-TapText -Text 'Retry' -NoSubstring -TimeoutSec 5)
      Start-Sleep -Seconds 4
      continue
    }
    if (Test-UiText -Nodes $d.Nodes -Regex 'cases? on this page' -Package $script:Pkg) {
      if ($scrolls -lt 6) { Invoke-UiScroll -Dump $d; $scrolls++ } else { break }
    } else { Start-Sleep -Seconds 2 }
  }
  if ($null -eq $row) {
    # typed search: "Search case ID", then the row
    Write-Log 'row not found by scrolling: trying the search box' 'WARN'
    if (-not (Invoke-TapText -Text 'Search case ID' -NoSubstring -TimeoutSec 10)) { return $false }
    [void](Invoke-AdbShell -Arguments @('input', 'text', $CaseId))
    Start-Sleep -Seconds 1
    if (Test-KeyboardShown) { Invoke-UiKey 'KEYCODE_BACK'; Start-Sleep -Milliseconds 700 }
    $d = Get-UiDump
    if ($d) { $row = Get-TapNode -Dump $d -Regex $rowRe -YMax 0.88 }
  }
  if ($null -eq $row) { return $false }
  Invoke-UiTapNode -Node $row -Why 'open the case'
  Start-Sleep -Seconds 1
  return $true
}

function Wait-ExplorerState {
  # 'ready' (slice label up) | 'chooser' (run / variant must be chosen) | 'problem:<what>' | 'timeout'
  param([int]$TimeoutSec = 90)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $d = Get-UiDump
    if ($d) {
      if (Test-UiText -Nodes $d.Nodes -Regex '^slice \d+ / \d+' -Package $script:Pkg) { return 'ready' }
      if ((Test-UiText -Nodes $d.Nodes -Regex '^Analysis run$' -Package $script:Pkg) -and (Test-UiText -Nodes $d.Nodes -Regex '^Prediction variant$|lists no analysis run' -Package $script:Pkg)) { return 'chooser' }
      $prob = Test-ProblemScreen $d
      if ($prob -and $prob -ne 'could not be reached') { return ('problem:' + $prob) }
    }
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  return 'timeout'
}

function Resolve-Chooser {
  # A case that HAS an analysis run asks for the run (when several) and the prediction variant. RAW, the first run.
  $d = Get-UiDump
  if (-not $d) { return $false }
  $head = Find-UiNode -Nodes $d.Nodes -Text 'Analysis run' -NoSubstring -Package $script:Pkg
  $next = Find-UiNode -Nodes $d.Nodes -Text 'Prediction variant' -NoSubstring -Package $script:Pkg
  if ($head -and $next) {
    $cands = @($d.Nodes | Where-Object { $_.Clickable -and $_.CY -gt $head.CY -and $_.CY -lt $next.CY -and $_.Pkg -eq $script:Pkg })
    if ($cands.Count -gt 0) {
      Write-Log ('the case has {0} analysis runs: choosing the first' -f $cands.Count)
      Invoke-UiTapNode -Node $cands[0] -Why 'first run'
      Start-Sleep -Seconds 2
      $d = Get-UiDump
      if (-not $d) { return $false }
    }
  }
  $raw = Get-TapNode -Dump $d -Text 'RAW' -NoSubstring
  if ($null -eq $raw) { return $false }
  Invoke-UiTapNode -Node $raw -Why 'prediction variant RAW'
  Add-Deviation ('A case with an analysis run asked for the prediction variant: RAW was chosen.')
  Start-Sleep -Seconds 2
  return $true
}

function Enter-CaseExplorer {
  # Opens the case in SCR-03 and waits for the MRI: the slice label, then the "open" gesture line in logcat.
  # Returns 'no-run' | 'run' | '' (failed).
  param([string]$CaseId, [string]$LogFile, [string]$StepPrefix = 'open the case')
  $openRe = '"kind":"open".*"outcome":"shown"'
  $had = 0
  if ($LogFile) { $had = Get-LogMatchCount -Path $LogFile -Regex $openRe }
  if (-not (Open-CaseFromList -CaseId $CaseId)) { return '' }
  $st = Wait-ExplorerState
  if ($st -eq 'chooser') {
    if (-not (Resolve-Chooser)) { return '' }
    $st = Wait-ExplorerState
  }
  if ($st -ne 'ready') { Write-Log ('the case viewer did not open: {0}' -f $st) 'WARN'; return '' }
  if ($LogFile) {
    $line = Wait-LogMatch -Path $LogFile -Regex $openRe -Count ($had + 1) -TimeoutSec 90 -Handle $script:Cap
    if (-not $line) { Write-Log 'no "open ... shown" gesture in logcat within 90 s: the MRI may not be on screen' 'WARN'; return '' }
  } else { Start-Sleep -Seconds 4 }
  $d = Get-UiDump
  $mode = 'no-run'
  if ($d -and -not (Test-UiText -Nodes $d.Nodes -Regex 'No analysis run for this case' -Package $script:Pkg)) { $mode = 'run' }
  return $mode
}

function Set-Overlay {
  # Brings "<Label>: OFF" to ON (or leaves it). The toggle is below the image, in the screen's own scroll area.
  param([string]$LabelRegex)    # e.g. '^Ground truth: (ON|OFF)$'
  for ($i = 1; $i -le 8; $i++) {
    $d = Get-UiDump
    if (-not $d) { Start-Sleep -Seconds 1; continue }
    $n = Get-TapNode -Dump $d -Regex $LabelRegex
    if ($null -eq $n) { Invoke-UiScroll -Dump $d; continue }
    if ($n.TextN -match ': ON$' -or $n.DescN -match ': ON$') { return $true }
    Invoke-UiTapNode -Node $n -Why 'overlay on'
    Start-Sleep -Milliseconds 1800
  }
  return $false
}

function Save-Meminfo {
  param([string]$Path)
  for ($i = 1; $i -le 2; $i++) {
    $r = Invoke-AdbShell -Arguments @('dumpsys', 'meminfo', $script:Pkg) -TimeoutSec 90
    if ($r.StdOut -notmatch 'No process found' -and $r.StdOut.Length -gt 200) {
      Write-TextFile -Path $Path -Text $r.StdOut
      return $true
    }
    Start-Sleep -Seconds 2
  }
  Write-Log 'dumpsys meminfo found no process or no output (is the app running?)' 'WARN'
  if ($r) { Write-TextFile -Path $Path -Text $r.StdOut }
  return $false
}

function Start-LogCapture {
  param([string]$Path)
  [void](Invoke-Adb -Arguments @('logcat', '-c'))
  $h = Start-NativeToFile -FilePath $script:Ctx.Adb -ArgumentList @('-s', $script:Ctx.Serial, 'logcat', '-v', 'threadtime', '-s', 'ReactNativeJS:V') -OutFile $Path
  Start-Sleep -Milliseconds 900
  if (-not (Test-CaptureAlive $h)) { Stop-NativeCapture $h; throw 'the logcat capture did not start (adb lost the phone?)' }
  return $h
}

function Save-LogDump {
  param([string]$Path)
  $r = Invoke-Adb -Arguments @('logcat', '-d', '-v', 'threadtime', '-s', 'ReactNativeJS:V') -TimeoutSec 60
  [System.IO.File]::WriteAllBytes($Path, $r.Bytes)
}

function Save-CrashProbe {
  # After a launch that never reached the JS: the crash buffer (the Hermes latin1 crash of 2026-10-01 looked like this).
  $r = Invoke-Adb -Arguments @('logcat', '-d', '-b', 'crash', '-v', 'brief') -TimeoutSec 30
  $t = Hide-Secret $r.StdOut
  if ($t.Trim()) {
    Write-TextFile -Path (Join-Path $script:P.Out 'crash_buffer.txt') -Text $t
    Write-Log 'the crash buffer has entries (saved as crash_buffer.txt, outside git); first lines:' 'WARN'
    foreach ($l in (($t -split "`r?`n") | Where-Object { $_.Trim() } | Select-Object -First 4)) { Write-Log ('  ' + $l) 'WARN' }
  }
}

# ================================================================================================================
# Step: a9
# ================================================================================================================

function Rename-RepFilesToAttempt1 {
  param([int]$K)
  $files = @(Get-ChildItem -LiteralPath $script:P.Out -Filter ("A9_rep{0}_*" -f $K) -File | Where-Object { $_.Name -notmatch '_attempt1_' })
  foreach ($f in $files) {
    $new = $f.Name -replace ("^A9_rep{0}_" -f $K), ("A9_rep{0}_attempt1_" -f $K)
    Rename-Item -LiteralPath $f.FullName -NewName $new
  }
}

function Invoke-A9Rep {
  # One repetition. Returns @{ Ok; Disturbed; Reason }.
  param([int]$K)
  $out = $script:P.Out
  $log = Join-Path $out ("A9_rep{0}_logcat.txt" -f $K)
  $meta = @{ Battery0 = ''; Battery1 = ''; Manual = (New-Object System.Collections.ArrayList); Attempts = 1 }
  $script:S.RepMeta[[string]$K] = $meta
  $script:CurrentManual = $meta.Manual
  Write-Log ('== A9 repetition {0} of {1}: cold start' -f $K, $Reps) 'STEP'
  Request-PhoneReady
  Stop-App
  $script:Cap = Start-LogCapture -Path $log
  $b = Get-Battery; $meta.Battery0 = $b.Text
  Start-App
  $up = Wait-LogMatch -Path $log -Regex 'Running "main"' -TimeoutSec 45 -Handle $script:Cap
  if (-not $up) { Write-Log 'no Running "main" in logcat after 45 s' 'WARN'; Save-CrashProbe }

  $r = Invoke-UiStep -Name 'app open with the header badge' -Expected 'the app "Cardiac MRI Workspace" is open and the header badge (top right) reads LIVE' `
    -Action { Wait-AppReady } -Verify { $d = Get-UiDump; [bool]($d -and (Test-UiText -Nodes $d.Nodes -Regex '^(LIVE|FIXTURE)\b' -Package $script:Pkg)) }
  if ($r -eq 'skip') { return @{ Ok = $false; Disturbed = $false; Reason = 'the app did not open' } }

  $mode = ''
  $script:modeOut = ''
  $r = Invoke-UiStep -Name ("open {0}" -f $Case) -Expected ("tap the Cases tab (bottom), then the row {0}; the case viewer opens with the MRI and the label under the image reads 'slice 45 / 88 (z = 44)'" -f $Case) `
    -Action { $script:modeOut = Enter-CaseExplorer -CaseId $Case -LogFile $log; [bool]$script:modeOut } `
    -Verify { $d = Get-UiDump; [bool]($d -and (Test-UiText -Nodes $d.Nodes -Regex '^slice \d+ / \d+' -Package $script:Pkg)) }
  if ($r -eq 'skip') { return @{ Ok = $false; Disturbed = $false; Reason = 'the case did not open' } }
  if ($r -eq 'auto') { $mode = $script:modeOut }
  # the label and the geometry the written script expects for CASE_0061
  $d = Get-UiDump
  if ($d) {
    $lab = Find-UiNode -Nodes $d.Nodes -Regex '^slice \d+ / \d+' -Package $script:Pkg
    if ($lab) {
      Write-Log ('viewer label: {0}' -f $lab.TextN)
      $meta['ViewerLabel'] = $lab.TextN
      if ($Case -eq 'CASE_0061' -and $lab.TextN -notmatch '^slice 45 / 88') { Add-Warning ("the viewer opened on '{0}', the written script expects 'slice 45 / 88 (z = 44)'" -f $lab.TextN) }
    }
    if (Test-UiText -Nodes $d.Nodes -Regex 'No analysis run for this case') { Write-Log 'scope: no analysis run for this case - MRI and ground truth only' }
    elseif ($mode) { Add-Deviation ("{0} has an analysis run now, so the viewer asked for a run / variant (RAW was chosen); the A9 scope is MRI + ground truth + prediction overlay." -f $Case) }
  }

  $r = Invoke-UiStep -Name 'ground truth overlay ON' -Expected "in the case viewer, under Overlays, tap 'Ground truth: OFF' so that it reads 'Ground truth: ON' (cyan outline on the image)" `
    -Action { Set-Overlay -LabelRegex '^Ground truth: (ON|OFF)$' } `
    -Verify { $d = Get-UiDump; [bool]($d -and (Test-UiText -Nodes $d.Nodes -Regex '^Ground truth: ON$' -Package $script:Pkg)) }
  if ($r -eq 'skip') { Add-Warning ('Repetition {0}: the ground-truth overlay was NOT switched on; the written script keeps it ON (the run logs gt_overlay)' -f $K); Add-Deviation ('Repetition {0} ran with the ground-truth overlay OFF.' -f $K) }
  Start-Sleep -Seconds 3      # the GT mask of this slice is on screen before M0

  # M0, then the run. From here to "A9 finished" nothing touches the screen.
  [void](Save-Meminfo -Path (Join-Path $out ("A9_rep{0}_meminfo_M0.txt" -f $K)))
  Write-Log 'M0 meminfo saved'

  $r = Invoke-UiStep -Name 'long-press the slice label, choose A9 30-step' -Expected "long-press the text 'slice 45 / 88 ...' under the image for 1 second; in the dialog 'Scripted slice navigation' tap 'A9 30-step' (NOT 'L4 15 + 15')" -Attempts 2 `
    -Action {
      $dd = Get-UiDump
      if (-not $dd) { return $false }
      # a dialog left over from a first try: just choose in it
      $btn = Find-UiNode -Nodes $dd.Nodes -Text 'A9 30-step' -NoSubstring -Package $script:Pkg
      if ($null -eq $btn) {
        $lab = Find-UiNode -Nodes $dd.Nodes -Regex '^slice \d+ / \d+' -Package $script:Pkg
        if ($null -eq $lab) { return $false }
        Write-Log ('long-press on {0} at ({1},{2}) for 1200 ms' -f (Get-NodeLabel $lab), $lab.CX, $lab.CY)
        Invoke-UiLongPress -X $lab.CX -Y $lab.CY -Ms 1200
        Start-Sleep -Milliseconds 1200
        $found = Wait-UiNode -Text 'A9 30-step' -NoSubstring -TimeoutSec 10 -AppOnly
        if ($null -eq $found) { return $false }
        $btn = $found.Node
      }
      Invoke-UiTapNode -Node $btn -Why 'start A9'
      return $true
    } `
    -Verify { [bool](Wait-LogMatch -Path $log -Regex 'CMW_RUN_START \{"run":"A9","pass":"warm"' -TimeoutSec 20 -Handle $script:Cap) }
  if ($r -eq 'skip') { return @{ Ok = $false; Disturbed = $false; Reason = 'the A9 run was not started' } }

  # the tap must have started the warm pass. If it did not, no run is in progress and the screen may be looked at (and the
  # button tapped again) without disturbing anything; the one rerun of the session is not spent on a missed tap.
  $warmRe = 'CMW_RUN_START \{"run":"A9","pass":"warm"'
  $w = Wait-LogMatch -Path $log -Regex $warmRe -TimeoutSec 15 -Handle $script:Cap
  for ($again = 1; $again -le 2 -and -not $w; $again++) {
    Write-Log 'no warm-pass start in logcat yet: looking at the screen (no run is in progress)' 'WARN'
    $dd = Get-UiDump
    $btn = $null
    if ($dd) { $btn = Find-UiNode -Nodes $dd.Nodes -Text 'A9 30-step' -NoSubstring -Package $script:Pkg }
    if ($null -eq $btn) { break }
    Invoke-UiTapNode -Node $btn -Why 'start A9 (again)'
    $w = Wait-LogMatch -Path $log -Regex $warmRe -TimeoutSec 15 -Handle $script:Cap
  }
  if (-not $w) { $w = Wait-LogMatch -Path $log -Regex $warmRe -TimeoutSec 20 -Handle $script:Cap }
  if (-not $w) {
    Write-Log 'no warm-pass start in logcat' 'WARN'
    return @{ Ok = $false; Disturbed = $true; Reason = 'the A9 run did not start' }
  }
  Write-Log 'A9 running: warm pass, then measured pass. Do not touch the phone. (about 30-90 s)' 'STEP'
  $t0 = Get-Date
  $endRe = 'CMW_RUN_END \{"run":"A9","pass":"measured"'
  $deadline = $t0.AddSeconds($A9TimeoutSec)
  $end = $null
  $lastNote = Get-Date
  while ((Get-Date) -lt $deadline) {
    $end = Wait-LogMatch -Path $log -Regex $endRe -TimeoutSec 5 -PollMs 1000 -Handle $script:Cap
    if ($end) { break }
    if (-not (Test-CaptureAlive $script:Cap)) { break }
    if (((Get-Date) - $lastNote).TotalSeconds -ge 20) { Write-Log ('  ... {0} s' -f [int]((Get-Date) - $t0).TotalSeconds); $lastNote = Get-Date }
  }
  if (-not $end) {
    if (-not (Test-CaptureAlive $script:Cap)) {
      Write-Log 'the logcat capture stopped: adb lost the phone during the run' 'ERROR'
      return @{ Ok = $false; Disturbed = $true; Reason = 'adb lost the phone during the run' }
    }
    Write-Log ('no measured-pass end within {0} s (the run hung, or the phone was disturbed)' -f $A9TimeoutSec) 'ERROR'
    [void](Save-FailureArtifacts -Name ("rep{0} no A9 finished" -f $K))
    return @{ Ok = $false; Disturbed = $true; Reason = ('no A9 finished within {0} s' -f $A9TimeoutSec) }
  }
  Write-Log 'measured pass ended; "A9 finished" dialog is up' 'OK'
  Start-Sleep -Milliseconds 800
  # M1 BEFORE dismissing the dialog (the cache holds every slice of the run)
  [void](Save-Meminfo -Path (Join-Path $out ("A9_rep{0}_meminfo_M1.txt" -f $K)))
  Write-Log 'M1 meminfo saved'
  $r = Invoke-UiStep -Name "dismiss 'A9 finished'" -Expected "tap OK in the dialog 'A9 finished'" -Attempts 2 `
    -Action {
      $btn = Wait-UiNode -Text 'OK' -NoSubstring -TimeoutSec 12 -AppOnly
      if ($null -eq $btn) { return $false }
      Invoke-UiTapNode -Node $btn.Node -Why 'dismiss A9 finished'
      return $true
    }
  Start-Sleep -Seconds 1
  Stop-NativeCapture $script:Cap
  $script:Cap = $null
  Save-LogDump -Path (Join-Path $out ("A9_rep{0}_logcat_dump.txt" -f $K))
  $b = Get-Battery; $meta.Battery1 = $b.Text

  $sel = Select-RepLog -OutDir $out -K $K
  $text = Read-SharedText $sel.Path
  $c = Get-TagCounts $text
  $line = 'counts (expect 62 / 63 / 2 / 2): CMW_SLICE {0}, CMW_GESTURE {1}, CMW_RUN_END {2}, CMW_NET_TOTALS {3}' -f $c['CMW_SLICE'], $c['CMW_GESTURE'], $c['CMW_RUN_END'], $c['CMW_NET_TOTALS']
  $okCounts = ($c['CMW_SLICE'] -eq 62 -and $c['CMW_GESTURE'] -eq 63 -and $c['CMW_RUN_END'] -eq 2 -and $c['CMW_NET_TOTALS'] -eq 2)
  Write-Log $line $(if ($okCounts) { 'OK' } else { 'WARN' })
  if ($sel.Source -eq 'dump') { Add-Deviation ("Repetition {0}: the streamed logcat had fewer CMW lines than the buffer dump; the dump was judged." -f $K) }
  return @{ Ok = $true; Disturbed = $false; Reason = ''; CountsOk = $okCounts }
}

function Step-A9 {
  $script:S.Reps = $Reps
  Write-Log ('== a9: {0} repetition(s) of the A9 30-step run on {1}' -f $Reps, $Case) 'STEP'
  Write-Log 'During each run (about a minute) do not touch the phone and do not unplug it.'
  for ($k = 1; $k -le $Reps; $k++) {
    $res = Invoke-A9Rep -K $k
    if ($null -ne $script:Cap) { Stop-NativeCapture $script:Cap; $script:Cap = $null }
    $disturbed = $res.Disturbed
    if ($res.Ok) {
      # decided BEFORE any report is read: was the phone disturbed? (S1_L4 2b, A9 3b)
      $ans = Read-Operator ('  Repetition {0} done. Was the phone disturbed during the run (touch, call, notification, screen lock)? [y/N]' -f $k) -Default 'n'
      if ($ans -match '^[yY]') { $disturbed = $true; $res.Reason = 'the operator reported a disturbance' }
    }
    if ($disturbed) {
      if (-not $script:S.RerunUsed) {
        $script:S.RerunUsed = $true
        Write-Log ('repetition {0} is disturbed ({1}); the one rerun of the session is used on it' -f $k, $res.Reason) 'WARN'
        Rename-RepFilesToAttempt1 -K $k
        Add-Deviation ("Repetition {0}: attempt 1 was disturbed ({1}); its files are kept as A9_rep{0}_attempt1_*, listed and never pooled; attempt 2 is the repetition." -f $k, $res.Reason)
        $script:S.RepMeta[[string]$k]['Attempts'] = 2
        $res = Invoke-A9Rep -K $k
        if ($null -ne $script:Cap) { Stop-NativeCapture $script:Cap; $script:Cap = $null }
        $script:S.RepMeta[[string]$k]['Attempts'] = 2
        if (-not $res.Ok) { Add-Warning ("Repetition {0} failed again ({1}); the written script stops after the one rerun." -f $k, $res.Reason); Save-State; break }
      } else {
        Add-Warning ("Repetition {0} was disturbed ({1}) and the one rerun is already used: it is kept as it is and judged, not hidden." -f $k, $res.Reason)
        Add-Deviation ("Repetition {0} was disturbed ({1}); no rerun was left." -f $k, $res.Reason)
        if (-not $res.Ok) { Save-State; break }
      }
    }
    Save-State
  }
}

# ================================================================================================================
# Step: tour (screenshots, outside git)
# ================================================================================================================

function Add-TourEntry {
  param([string]$Screen, [string]$Status, [string]$Note)
  $h = @{ Screen = $Screen; Status = $Status; Note = (Hide-Secret $Note) }
  [void]$script:S.Tour.Add($h)
}

function Save-TourShot {
  # Waits for the screen to settle (no LOADING tag), then one PNG into screens\.
  param([string]$File, [string]$Screen, [int]$SettleSec = 2)
  [void](Wait-UiGone -Regex '^LOADING$' -TimeoutSec 25)
  Start-Sleep -Seconds $SettleSec
  $path = Join-Path (Join-Path $script:P.Out 'screens') $File
  $ok = Save-Screenshot -Path $path
  if ($ok) { Write-Log ('screenshot: screens\{0}' -f $File) 'OK'; Add-TourEntry -Screen $Screen -Status 'ok' -Note ('screens\' + $File) }
  else { Add-TourEntry -Screen $Screen -Status 'failed' -Note 'screencap gave no PNG' }
  return $ok
}

function Save-TourScrolled {
  param([string]$BaseName, [string]$Screen, [int]$Pages)
  for ($i = 1; $i -le $Pages; $i++) {
    $d = Get-UiDump
    Invoke-UiScroll -Dump $d
    $suffix = [string][char](96 + $i + 1)    # b, c, ...
    $f = ($BaseName -replace '\.png$', ('_' + $suffix + '.png'))
    [void](Save-TourShot -File $f -Screen ($Screen + ' (scrolled ' + $i + ')') -SettleSec 1)
  }
}

function Invoke-Back {
  $r = Wait-UiNode -Text 'Back' -NoSubstring -YMax 0.2 -TimeoutSec 10 -AppOnly
  if ($null -eq $r) { return $false }
  Invoke-UiTapNode -Node $r.Node -Why 'header Back'
  Start-Sleep -Seconds 2
  return $true
}

function Step-TourScreen {
  # One tour screen with the manual fallback. $Action navigates AND takes the screenshot(s); true when done.
  param([string]$Screen, [string]$Expected, [scriptblock]$Action)
  $r = Invoke-UiStep -Name $Screen -Expected $Expected -Action $Action -Attempts 2
  if ($r -eq 'auto') { return $true }
  if ($r -eq 'manual') {
    # the operator navigated by hand: take the screenshot of what is now on screen
    $f = ('hand_{0}.png' -f ($Screen -replace '[^A-Za-z0-9]+', '_'))
    [void](Save-TourShot -File $f -Screen ($Screen + ' (by hand)'))
    $script:S.Tour[$script:S.Tour.Count - 1]['Status'] = 'by hand'
    return $true
  }
  Add-TourEntry -Screen $Screen -Status 'skipped' -Note 'operator skipped'
  return $false
}

function Invoke-TourHero {
  # A short hero-flow pass (SCR-01 -> SCR-02 -> SCR-03 -> SCR-04) for the screen recording. No screenshots.
  param([string]$LogFile)
  [void](Switch-Tab 'Study'); Start-Sleep -Seconds 3
  [void](Switch-Tab 'Experiments'); Start-Sleep -Seconds 4
  $mode = Enter-CaseExplorer -CaseId $TourCase -LogFile $LogFile
  if ($mode -eq 'run') {
    [void](Set-Overlay -LabelRegex '^Prediction \((RAW|PROCESSED)\): (ON|OFF)$')
    if (Invoke-TapText -Text 'Error inspector (SCR-04)' -NoSubstring -Scroll -EnabledOnly -TimeoutSec 20) {
      Start-Sleep -Seconds 3
      [void](Invoke-TapText -Regex '^Jump to worst' -Scroll -EnabledOnly -TimeoutSec 20)
      Start-Sleep -Seconds 4
    }
  } elseif ($mode) { [void](Set-Overlay -LabelRegex '^Ground truth: (ON|OFF)$') }
  Start-Sleep -Seconds 2
}

function Step-Tour {
  Write-Log ('== tour: screenshots of SCR-01..SCR-08 (tour case {0}); everything goes outside git' -f $TourCase) 'STEP'
  $out = $script:P.Out
  [void](New-Item -ItemType Directory -Force -Path (Join-Path $out 'screens'))
  $log = Join-Path $out 'tour_logcat.txt'
  $script:CurrentManual = New-Object System.Collections.ArrayList
  Request-PhoneReady
  Stop-App
  $script:Cap = Start-LogCapture -Path $log
  Start-App
  [void](Wait-LogMatch -Path $log -Regex 'Running "main"' -TimeoutSec 45 -Handle $script:Cap)
  if (-not (Wait-AppReady)) { throw 'the app did not open for the tour' }

  # SCR-01 Study overview (the root screen)
  [void](Step-TourScreen -Screen 'SCR-01 study overview' -Expected 'the app opens on the Study tab (SCR-01 Study Overview); wait until it has loaded' -Action {
    if (-not (Switch-Tab 'Study')) { return $false }
    [void](Save-TourShot -File '01_SCR-01_study_overview.png' -Screen 'SCR-01 study overview' -SettleSec 3)
    Save-TourScrolled -BaseName '01_SCR-01_study_overview.png' -Screen 'SCR-01 study overview' -Pages 1
    return $true
  })

  # SCR-07 Experiment comparison
  [void](Step-TourScreen -Screen 'SCR-07 experiment comparison' -Expected 'tap the Experiments tab (bottom); wait until the comparison has loaded' -Action {
    if (-not (Switch-Tab 'Experiments')) { return $false }
    [void](Save-TourShot -File '02_SCR-07_comparison.png' -Screen 'SCR-07 experiment comparison' -SettleSec 3)
    Save-TourScrolled -BaseName '02_SCR-07_comparison.png' -Screen 'SCR-07 experiment comparison' -Pages 2
    return $true
  })

  # SCR-02 Case list
  [void](Step-TourScreen -Screen 'SCR-02 case list' -Expected 'tap the Cases tab (bottom); wait until the list of cases is shown' -Action {
    if (-not (Switch-Tab 'Cases')) { return $false }
    $w = Wait-UiNode -Regex 'cases? on this page' -TimeoutSec 40 -AppOnly
    if ($null -eq $w) { return $false }
    [void](Save-TourShot -File '03_SCR-02_case_list.png' -Screen 'SCR-02 case list' -SettleSec 2)
    return $true
  })

  # SCR-03 Case explorer on the tour case
  $script:TourMode = ''
  $r3 = Step-TourScreen -Screen ('SCR-03 case explorer ' + $TourCase) -Expected ("open {0} from the Cases tab; if it asks for a run / variant choose RAW; wait until the MRI is shown" -f $TourCase) -Action {
    $m = Enter-CaseExplorer -CaseId $TourCase -LogFile $log
    if (-not $m) { return $false }
    $script:TourMode = $m
    if ($m -eq 'run') {
      [void](Set-Overlay -LabelRegex '^Prediction \((RAW|PROCESSED)\): (ON|OFF)$')
      [void](Set-Overlay -LabelRegex '^Ground truth: (ON|OFF)$')
      Start-Sleep -Seconds 2
      [void](Save-TourShot -File '04_SCR-03_explorer_prediction_overlay.png' -Screen ('SCR-03 explorer ' + $TourCase + ' (prediction + ground truth overlay ON)') -SettleSec 2)
    } else {
      [void](Set-Overlay -LabelRegex '^Ground truth: (ON|OFF)$')
      Start-Sleep -Seconds 2
      [void](Save-TourShot -File '04_SCR-03_explorer_no_run.png' -Screen ('SCR-03 explorer ' + $TourCase + ' (no analysis run: ground truth overlay only)') -SettleSec 2)
      Add-TourEntry -Screen 'SCR-04 / SCR-05 / SCR-06' -Status 'skipped' -Note ($TourCase + ' has no analysis run, so the error inspector, 3D and review entries are disabled')
    }
    return $true
  }

  if ($r3 -and $script:TourMode -eq 'run') {
    # SCR-04 Error inspector, then the worst slice
    [void](Step-TourScreen -Screen 'SCR-04 error inspector' -Expected "in the case viewer scroll down and tap 'Error inspector (SCR-04)'; then tap 'Jump to worst' in the Worst slices card" -Action {
      if (-not (Invoke-TapText -Text 'Error inspector (SCR-04)' -NoSubstring -Scroll -EnabledOnly -TimeoutSec 30)) { return $false }
      $w = Wait-UiNode -Regex '^Worst slices' -TimeoutSec 60 -AppOnly
      if ($null -eq $w) { return $false }
      Start-Sleep -Seconds 4
      [void](Save-TourShot -File '05_SCR-04_error_inspector.png' -Screen 'SCR-04 error inspector' -SettleSec 2)
      if (Invoke-TapText -Regex '^Jump to worst' -Scroll -EnabledOnly -TimeoutSec 30) {
        Start-Sleep -Seconds 5
        [void](Save-TourShot -File '05b_SCR-04_worst_slice.png' -Screen 'SCR-04 error inspector (worst slice)' -SettleSec 2)
      } else { Add-TourEntry -Screen 'SCR-04 worst slice' -Status 'skipped' -Note 'no enabled Jump to worst entry (the server returned no worst-slice selection?)' }
      return $true
    })

    # SCR-05 3D: wait for the mesh, tap a surface point, Open in 2D
    $script:ThreeD = $false
    [void](Step-TourScreen -Screen 'SCR-05 3D inspector' -Expected "in the error inspector scroll down and tap '3D error view (SCR-05)'; wait for the surface to appear (the layer rows show a triangle count)" -Action {
      if (-not (Invoke-TapText -Text '3D error view (SCR-05)' -NoSubstring -Scroll -EnabledOnly -TimeoutSec 30)) { return $false }
      $mesh = Wait-UiNode -Regex '^\d[\d,]* triangles$' -TimeoutSec 150 -PollMs 2500 -AppOnly
      if ($null -eq $mesh) {
        $d = Get-UiDump
        $why = 'no mesh within 150 s'
        if ($d) { $p = Test-ProblemScreen $d; if ($p) { $why = $p } }
        Add-TourEntry -Screen 'SCR-05 3D inspector' -Status 'failed' -Note $why
        return $true
      }
      Start-Sleep -Seconds 3
      [void](Save-TourShot -File '06_SCR-05_3d.png' -Screen 'SCR-05 3D inspector (mesh loaded)' -SettleSec 1)
      $script:ThreeD = $true
      return $true
    })
    if ($script:ThreeD) {
      [void](Step-TourScreen -Screen 'SCR-05 pick a surface point' -Expected 'tap the 3D surface once so that the Selected region card names a slice' -Action {
        $d = Get-UiDump
        if (-not $d) { return $false }
        $web = Get-TapNode -Dump $d -Text '3D surface of the segmentation' -NoSubstring
        if ($null -eq $web) { return $false }
        $offs = @(@(0, 0), @(-0.12, 0), @(0.12, 0), @(0, -0.12), @(0, 0.12), @(-0.2, -0.1), @(0.2, 0.1), @(-0.2, 0.1), @(0.2, -0.1))
        foreach ($o in $offs) {
          $x = [int]($web.CX + $o[0] * $web.W); $y = [int]($web.CY + $o[1] * $web.H)
          Write-Log ('tap the 3D surface at ({0},{1})' -f $x, $y)
          Invoke-UiTap -X $x -Y $y
          Start-Sleep -Milliseconds 1800
          $d2 = Get-UiDump
          if ($d2 -and (Test-UiText -Nodes $d2.Nodes -Regex 'picked on (prediction|ground truth)' -Package $script:Pkg)) {
            [void](Save-TourShot -File '06b_SCR-05_3d_selected.png' -Screen 'SCR-05 3D inspector (surface point selected)' -SettleSec 1)
            return $true
          }
        }
        return $false
      })
      [void](Step-TourScreen -Screen 'SCR-05 Open in 2D' -Expected "tap 'Open in 2D (SCR-03)'; the case viewer opens on the picked slice" -Action {
        $openRe = '"kind":"open".*"outcome":"shown"'
        $had = Get-LogMatchCount -Path $log -Regex $openRe
        if (-not (Invoke-TapText -Text 'Open in 2D (SCR-03)' -NoSubstring -Scroll -EnabledOnly -TimeoutSec 20)) { return $false }
        $st = Wait-ExplorerState -TimeoutSec 60
        if ($st -ne 'ready') { return $false }
        [void](Wait-LogMatch -Path $log -Regex $openRe -Count ($had + 1) -TimeoutSec 60 -Handle $script:Cap)
        Start-Sleep -Seconds 2
        [void](Save-TourShot -File '07_SCR-03_open_in_2d_from_3d.png' -Screen 'SCR-03 explorer (Open in 2D from SCR-05)' -SettleSec 1)
        return $true
      })
    }

    # SCR-06 review: opening it sends one idempotent review_create; nothing is saved or changed
    Write-Host ''
    Write-Host '  SCR-06 (Review / Correction): opening the screen makes the app send ONE review_create to the backend' -ForegroundColor Yellow
    Write-Host '  (idempotent: it returns the existing review of this run, or creates it as NOT_REVIEWED). The script will' -ForegroundColor Yellow
    Write-Host '  NOT tap Accept / Flag / Save or draw anything; no review is committed.' -ForegroundColor Yellow
    $a = Read-Operator '  Open SCR-06 for the screenshot? [Y/n]' -Default 'n'
    if ($a -match '^[nN]') { Add-TourEntry -Screen 'SCR-06 review' -Status 'skipped' -Note 'operator chose not to open it (review_create)' }
    else {
      [void](Step-TourScreen -Screen 'SCR-06 review (read-only)' -Expected "in the case viewer scroll down and tap 'Review / correct (SCR-06)'; take no action in it" -Action {
        if (-not (Invoke-TapText -Text 'Review / correct (SCR-06)' -NoSubstring -Scroll -EnabledOnly -TimeoutSec 30)) { return $false }
        $w = Wait-UiNode -Regex '^Review: ' -TimeoutSec 60 -AppOnly
        if ($null -eq $w) { return $false }
        Start-Sleep -Seconds 5
        [void](Save-TourShot -File '08_SCR-06_review.png' -Screen 'SCR-06 review (opened, nothing saved)' -SettleSec 1)
        [void](Invoke-Back)
        return $true
      })
    }
  }

  # SCR-08 Findings
  [void](Step-TourScreen -Screen 'SCR-08 findings' -Expected 'tap the Findings tab (bottom); wait until the list (or "No findings yet") is shown' -Action {
    if (-not (Switch-Tab 'Findings')) { return $false }
    Start-Sleep -Seconds 3
    [void](Save-TourShot -File '09_SCR-08_findings.png' -Screen 'SCR-08 findings' -SettleSec 2)
    return $true
  })

  if ($Record) {
    Write-Log 'recording a 60 s screen video of a short hero-flow pass' 'STEP'
    $dir = Join-Path $out 'videos'
    [void](New-Item -ItemType Directory -Force -Path $dir)
    [void](Invoke-AdbShell -Arguments @('rm', '-f', '/sdcard/cmw_hero.mp4'))
    $script:RecordHandle = Start-NativeToFile -FilePath $script:Ctx.Adb -ArgumentList @('-s', $script:Ctx.Serial, 'shell', 'screenrecord', '--time-limit', '60', '--bit-rate', '6000000', '/sdcard/cmw_hero.mp4') -OutFile (Join-Path $dir 'screenrecord_stdout.txt')
    Start-Sleep -Seconds 2
    try { Invoke-TourHero -LogFile $log } catch { Write-Log ('hero pass stopped: {0}' -f $_.Exception.Message) 'WARN' }
    $t = Get-Date
    while ((Test-CaptureAlive $script:RecordHandle) -and ((Get-Date) - $t).TotalSeconds -lt 75) { Start-Sleep -Seconds 2 }
    Stop-NativeCapture $script:RecordHandle
    $script:RecordHandle = $null
    $pull = Invoke-Adb -Arguments @('pull', '/sdcard/cmw_hero.mp4', (Join-Path $dir 'hero_flow.mp4')) -TimeoutSec 120
    [void](Invoke-AdbShell -Arguments @('rm', '-f', '/sdcard/cmw_hero.mp4'))
    if (Test-Path -LiteralPath (Join-Path $dir 'hero_flow.mp4')) { Write-Log 'video: videos\hero_flow.mp4 (outside git)' 'OK'; Add-TourEntry -Screen 'hero flow video' -Status 'ok' -Note 'videos\hero_flow.mp4' }
    else { Add-TourEntry -Screen 'hero flow video' -Status 'failed' -Note 'adb pull gave no file' }
  }

  if ($null -ne $script:Cap) { Stop-NativeCapture $script:Cap; $script:Cap = $null }
  [void](Switch-Tab 'Study')
  Save-State
}

# ================================================================================================================
# Step: judge
# ================================================================================================================

function Step-Judge {
  Write-Log '== judge' 'STEP'
  $out = $script:P.Out
  $reps = $Reps
  # judge only: the repetitions that session was told to run, and every capture that is there (up to 5)
  if ($script:P.Run.Count -eq 1) {
    if (-not $script:RepsGiven -and $script:S.Reps) { $reps = [int]$script:S.Reps }
    $have =@(Get-ChildItem -LiteralPath $out -Filter 'A9_rep*_logcat.txt' -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^A9_rep\d+_logcat\.txt$' })
    if ($have.Count -gt $reps) { $reps = $have.Count }
  }
  $j = Invoke-SessionJudge -OutDir $out -MobileDir $script:P.Mobile -Reps $reps -CaseId $Case -Rehearsal $script:S.Rehearsal -RehearsalWhy $script:S.RehearsalWhy
  foreach ($pr in $j.PerRep) {
    if ($null -eq $pr.Judged) { Write-Log ('rep {0}: no capture file' -f $pr.K) 'WARN'; continue }
    $e = $pr.Judged.Eval
    Write-Log ('rep {0}: {1}   T1 {2}  T2 {3}  T3 {4}  T4 {5}   (log: {6})' -f $pr.K, $e.Verdict, $(if ($e.T1.Pass) { 'pass' } else { 'FAIL' }), $(if ($e.T2.Pass) { 'pass' } else { 'FAIL' }), $(if ($e.T3.Pass) { 'pass' } else { 'FAIL' }), $(if ($e.T4.Pass) { 'pass' } else { 'FAIL' }), $pr.Selection.Source) $(if ($e.Verdict -eq 'PASS') { 'OK' } else { 'WARN' })
    foreach ($id in 'T1', 'T2', 'T3', 'T4') { if (-not $e.$id.Pass) { Write-Log ('   {0}: {1}' -f $id, $e.$id.Detail) 'WARN' } }
    if ($e.Measured) { Write-Log ('   A9:measured {0}' -f (Format-Row $e.Measured)) }
  }
  if ($null -ne $j.Pooled) { Write-Log ('pooled A9:measured {0}' -f (Format-Row $j.Pooled.Measured)) }
  Write-Log $j.Overall.Line $(if ($j.Overall.Key -eq 'PASS') { 'OK' } else { 'WARN' })

  # SUMMARY.md and PROVENANCE_DRAFT.md
  $summary = New-SummaryMarkdown -J $j -State $script:S -OutDir $out
  Write-TextFile -Path (Join-Path $out 'SUMMARY.md') -Text (Hide-Secret $summary)
  $outside = New-Object System.Collections.ArrayList
  foreach ($n in (Get-ChildItem -LiteralPath $out -File -ErrorAction SilentlyContinue | Sort-Object Name)) {
    if ($n.Name -match '_dump\.txt$|^A9_all_reps_logcat\.txt$|\.xml$|^session\.log$|^tour_logcat\.txt$|^crash_buffer\.txt$|attempt1_.*_dump') { [void]$outside.Add((Get-FileFacts $n.FullName)) }
  }
  $prov = New-ProvenanceMarkdown -J $j -State $script:S -OutDir $out -PcNow $script:S.PcClock -PhoneNow $script:S.PhoneClock -OutsideFiles $outside.ToArray()
  Write-TextFile -Path (Join-Path $out 'PROVENANCE_DRAFT.md') -Text (Hide-Secret $prov)

  # the redaction scan on what is meant to be committed
  $cands = @(Get-CommitCandidates -OutDir $out -Reps $j.Reps)
  $serials = @(); if ($script:Ctx.Serial) { $serials = @($script:Ctx.Serial) }
  $hits = @(Find-SensitiveText -Paths $cands -Serials $serials)
  $bad = @{}
  foreach ($h in $hits) { $bad[$h.File] = $true }
  Write-Host ''
  Write-Log ('outputs: {0}' -f $out) 'STEP'
  Write-Host '  Files meant to be committed as evidence (after you have read them):' -ForegroundColor Cyan
  foreach ($c in $cands) {
    $n = Split-Path -Leaf $c
    if ($bad.ContainsKey($n)) { Write-Host ('    HOLD  {0}   (redaction scan found something, see below)' -f $n) -ForegroundColor Red }
    else { Write-Host ('    ok    {0}' -f $n) -ForegroundColor Green }
  }
  if ($hits.Count -gt 0) {
    Write-Host '  Redaction scan hits (file:line kind; the text itself is not printed):' -ForegroundColor Red
    foreach ($h in ($hits | Select-Object -First 20)) { Write-Host ('    {0}:{1}  {2}' -f $h.File, $h.Line, $h.Kind) -ForegroundColor Red }
  } else { Write-Host '  Redaction scan: no device serial, no IPv4 address, no URL, no Windows user name in those files.' -ForegroundColor Green }
  if (-not $script:Ctx.Serial) { Write-Host '  (this run had no phone, so the device serial is not known: the scan checked addresses, URLs and the Windows user only; the phone session itself scanned for the serial)' -ForegroundColor Gray }
  Write-Host '  Stays outside git: the *_dump.txt files, A9_all_reps_logcat.txt, screens\, videos\, failures\, *.xml, session.log, session_state.json.' -ForegroundColor Gray
  Write-Host '  Suggested evidence folder: management/evidence/TC_PERF_001/a9_product_app_<YYYYMMDDTHHMMSS+0700>/ (leader decides).' -ForegroundColor Gray
  Write-Host '  Next: read SUMMARY.md; fill the TODO fields of PROVENANCE_DRAFT.md (reviewer, network path, Motion smoothness, backend commit) and save it as PROVENANCE.md;' -ForegroundColor Gray
  Write-Host '        copy the files marked ok to the evidence folder; the server cross-check (A9 script 4.4: requests.jsonl, uvicorn.log from the Mac mini) is still done by hand.' -ForegroundColor Gray
  Save-State
  return $j
}

# ================================================================================================================
# Dry run
# ================================================================================================================

function Show-Plan {
  $p = $script:P
  Write-Host ''
  Write-Log 'DRY RUN: no phone is needed, nothing is installed, tapped, written or sent. Offline checks only.' 'DRY'
  Write-Host ''
  Write-Host 'Resolved parameters' -ForegroundColor Cyan
  Write-Host ('  steps        : {0}' -f ($p.Run -join ', '))
  Write-Host ('  A9 case      : {0}   repetitions: {1}' -f $Case, $Reps)
  Write-Host ('  tour case    : {0}   record video: {1}' -f $TourCase, [bool]$Record)
  Write-Host ('  mobile dir   : {0}' -f (Hide-Secret $p.Mobile))
  $adbFound = Test-Path -LiteralPath $p.Adb
  Write-Host ('  adb          : {0}' -f $(if ($adbFound) { 'found' } else { 'NOT FOUND - install the Android platform-tools or pass -Adb <full path>' }))
  $node = Find-NodeExe
  Write-Host ('  node         : {0}' -f $(if ($node) { 'found' } else { 'NOT FOUND - the judge and preflight-live.mjs need it' }))
  Write-Host ('  preflight-live.mjs : {0}' -f $(if (Test-Path -LiteralPath $p.Preflight) { 'present' } else { 'MISSING in this checkout' }))
  $info = Get-ApkInfo -Path $p.Apk
  if ($null -eq $info) { Write-Host '  APK          : NOT FOUND (build one with mobile\scripts\build-release.ps1 -Mode live, or pass -Apk <file>)' -ForegroundColor Yellow }
  else {
    Write-Host ('  APK          : {0}  ({1} MB, {2})' -f $info['Name'], $info['SizeMb'], $p.ApkNote)
    Write-Host ('  APK identity : sha256 {0}...  hash check: {1}' -f $info['Sha256'].Substring(0, 12), $info['Verified'])
    Write-Host ('  build record : mode {0}, contract {1}, git_sha {2}, branch {3}, built_at {4}' -f $info['Mode'], $info['Contract'], $info['GitSha'], $info['GitBranch'], $info['BuiltAt'])
    if ($info['Mode'] -ne 'live') { Write-Host '  WARNING: not a live build: the session would be a rehearsal, not evidence' -ForegroundColor Yellow }
  }
  $outside = Test-OutsideGit -Path $p.Out -Repo $p.Repo
  Write-Host ('  output folder: {0}  ({1}; outside git: {2})' -f (Hide-Secret $p.Out), $p.OutNote, $(if ($outside) { 'yes' } else { 'NO - the real run refuses this folder' }))
  Write-Host ('  backend URL  : {0}' -f $(if (Get-BackendUrl) { 'configured (not printed)' } else { 'not set in the environment or mobile\.env.local: the PC health check would be skipped' }))
  Write-Host ''
  Write-Host 'What each step would do' -ForegroundColor Cyan
  $n = 0
  foreach ($s in $p.Run) {
    $n++
    switch ($s) {
      'preflight' {
        Write-Host ('  {0}. preflight' -f $n) -ForegroundColor White
        Write-Host '       - exactly one authorised phone on adb (else: plug in, unlock, accept USB debugging); record Android version, model, battery level/temperature, screen size, animation scales'
        Write-Host '       - hash the APK and compare with <apk>.build.txt (git_sha, apk_sha256); write apk_build_record.txt'
        Write-Host '       - turn "stay awake while charging" on for the session (restored at the end); wake the phone, ask you to unlock it if needed'
        Write-Host '       - backend /health from this PC (prints only reachable / unreachable), then: node mobile\scripts\preflight-live.mjs --case <case>  -> preflight.txt'
      }
      'install' {
        Write-Host ('  {0}. install' -f $n) -ForegroundColor White
        Write-Host '       - adb -s <device-serial> install -r <apk>   (expect Success); then pm list packages + dumpsys package -> versionName'
      }
      'a9' {
        Write-Host ('  {0}. a9: {1} repetition(s), each cold (the cache is empty)' -f $n, $Reps) -ForegroundColor White
        Write-Host '       per repetition:'
        Write-Host '         am force-stop; logcat -c; start "logcat -v threadtime -s ReactNativeJS:V" into A9_rep<k>_logcat.txt; monkey launch'
        Write-Host '         wait for the LIVE badge -> Cases tab -> the case row -> wait for slice 45 / 88 and the "open ... shown" gesture in logcat'
        Write-Host '         Ground truth: OFF -> ON; wait 3 s; dumpsys meminfo -> A9_rep<k>_meminfo_M0.txt'
        Write-Host '         long-press the slice label (input swipe x y x y 1200) -> tap "A9 30-step" (case-insensitive)'
        Write-Host '         from then on NO touch and no uiautomator call: poll the logcat file for CMW_RUN_END of the measured pass (3 min limit)'
        Write-Host '         dumpsys meminfo -> ..._M1.txt BEFORE tapping OK on "A9 finished"; stop the capture; logcat -d -> ..._logcat_dump.txt'
        Write-Host '         count CMW_SLICE / CMW_GESTURE / CMW_RUN_END / CMW_NET_TOTALS (expect 62 / 63 / 2 / 2); ask whether the phone was disturbed'
        Write-Host '       a UI step that fails: screenshot + UI dump into failures\, what was expected, and you do that one step by hand'
        Write-Host '       one rerun per session, only for a disturbed repetition or no "A9 finished" after 3 min (A9 script 3b)'
      }
      'tour' {
        Write-Host ('  {0}. tour (screenshots into screens\, outside git)' -f $n) -ForegroundColor White
        Write-Host '       SCR-01 study overview, SCR-07 comparison, SCR-02 case list, SCR-03 explorer on the tour case (prediction overlay ON when it has a run),'
        Write-Host '       SCR-04 error inspector + worst slice, SCR-05 3D (waits for the mesh, taps a surface point, Open in 2D), SCR-06 review (open only,'
        Write-Host '       asks first: opening it sends one review_create; never taps Accept/Flag/Save), SCR-08 findings. adb exec-out screencap -p -> PNG.'
        if ($Record) { Write-Host '       plus a 60 s screenrecord of a short hero-flow pass (-Record) -> videos\hero_flow.mp4' }
      }
      'judge' {
        Write-Host ('  {0}. judge' -f $n) -ForegroundColor White
        Write-Host '       - slice-timing-report.mjs and l4-report.mjs on each repetition and on the pooled capture; T1 (p95 <= 200 ms, n 31), T2 (release + live), T3 (cache hits, totals equal), T4 (problems [])'
        Write-Host '       - SUMMARY.md, PROVENANCE_DRAFT.md, then the redaction scan (no serial, no IPv4, no URL, no Windows user name) and the list of files to commit'
      }
    }
  }
  Write-Host ''
  Write-Host 'To run it for real: plug the phone in, unlock it, accept USB debugging, then run the same command without -DryRun.' -ForegroundColor Green
}

# ================================================================================================================
# Main
# ================================================================================================================

function Main {
  $script:P = Resolve-Session
  $script:Ctx.DryRun = [bool]$DryRun
  $script:Ctx.Adb = $script:P.Adb
  $script:Ctx.Package = $script:Pkg
  $script:S = New-State
  Write-Host ''
  Write-Host 'Cardiac MRI workspace - phone session (A9 / TC-PERF-001, tour, judge)' -ForegroundColor Cyan

  if ($DryRun) { Show-Plan; return 0 }

  if (-not (Test-OutsideGit -Path $script:P.Out -Repo $script:P.Repo)) {
    throw 'The output folder is inside a git work tree. Session files (screenshots, serial, addresses) must stay outside git: pass -Out <a folder outside the repository>.'
  }
  [void](New-Item -ItemType Directory -Force -Path $script:P.Out)
  $script:Ctx.LogFile = Join-Path $script:P.Out 'session.log'
  [void](Import-State)       # a folder from an earlier run keeps its notes (device, APK, deviations, tour)
  $script:S.StayAwakeOriginal = ''
  Write-Log ('output folder: {0}' -f $script:P.Out)
  Write-Log ('steps: {0}' -f ($script:P.Run -join ', '))

  $needDevice = ($script:P.Run -contains 'preflight') -or ($script:P.Run -contains 'install') -or ($script:P.Run -contains 'a9') -or ($script:P.Run -contains 'tour')
  $verdict = $null
  try {
    if ($needDevice) {
      Connect-Device
      if ($script:P.Run -notcontains 'preflight') {
        # the device profile and the APK identity are still needed for the PROVENANCE
        [void](Get-DeviceProfile)
        $info = Get-ApkInfo -Path $script:P.Apk
        if ($info) { foreach ($k in $info.Keys) { if ($k -ne 'SidecarText') { $script:S.Apk[$k] = $info[$k] } } }
        Set-StayAwake
      }
    }
    foreach ($s in $script:P.Run) {
      switch ($s) {
        'preflight' { Step-Preflight }
        'install' { Step-Install }
        'a9' { Step-A9 }
        'tour' { Step-Tour }
        'judge' { $verdict = Step-Judge }
      }
    }
    if ($script:P.Run -notcontains 'judge') { Write-Log 'judge was not part of this run: run again with -Steps judge -Out <this folder> when the captures are in' }
  } catch {
    $msg = $_.Exception.Message
    if ($msg -eq 'OPERATOR_QUIT') {
      Write-Log 'stopped by the operator; judging what exists' 'WARN'
      Save-State
      if ($script:P.Run -contains 'judge' -or $script:P.Run -contains 'a9') { try { $verdict = Step-Judge } catch { Write-Log ('judge failed: {0}' -f $_.Exception.Message) 'ERROR' } }
      return 1
    }
    throw
  } finally {
    if ($null -ne $script:Cap) { Stop-NativeCapture $script:Cap; $script:Cap = $null }
    if ($null -ne $script:RecordHandle) { Stop-NativeCapture $script:RecordHandle; $script:RecordHandle = $null }
    if ($needDevice -and $script:Ctx.Serial) {
      try { Restore-StayAwake } catch { }
      try { [void](Invoke-AdbShell -Arguments @('rm', '-f', '/sdcard/cmw_ui.xml')) } catch { }
    }
  }
  if ($null -ne $verdict -and $verdict.Overall.Key -ne 'PASS') { return 2 }
  return 0
}

$exit = 1
try {
  $res = @(Main)                     # the last value is the exit code; anything else a function leaked is dropped
  $exit = [int]$res[$res.Count - 1]
} catch {
  $m = $_.Exception.Message -replace '^FATAL:\s*', ''
  Write-Host ''
  Write-Log ('STOPPED: {0}' -f $m) 'ERROR'
  $exit = 1
}
exit $exit
