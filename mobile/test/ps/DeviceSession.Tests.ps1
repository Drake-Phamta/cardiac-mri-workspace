# Pester wrapper (written for Pester 3.4, also fine on 4.x) around the offline checks of device_session.ps1:
#   Invoke-Pester mobile\test\ps
# The same checks run without Pester:  powershell -File mobile\scripts\device_session.ps1 -SelfTest
# No phone, no network; fixtures are generated (see DeviceSession.SelfTest.ps1).

$scripts = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'scripts'
. (Join-Path $scripts 'device_ui.ps1')
. (Join-Path $scripts 'device_judge.ps1')
. (Join-Path $PSScriptRoot 'DeviceSession.SelfTest.ps1')

Describe 'device_session.ps1 offline checks' {
  $checks = Get-DeviceSessionSelfChecks -ScriptsDir $scripts
  foreach ($c in $checks) {
    It $c.Name -TestCases @(@{ Block = $c.Block }) {
      param($Block)
      & $Block | Out-Null
    }
  }
}

Describe 'device_session.ps1 files' {
  It 'every script parses under Windows PowerShell 5.1' {
    foreach ($f in 'device_session.ps1', 'device_ui.ps1', 'device_judge.ps1') {
      $errs = $null; $tok = $null
      [void][System.Management.Automation.Language.Parser]::ParseFile((Join-Path $scripts $f), [ref]$tok, [ref]$errs)
      if (@($errs).Count -gt 0) { throw ("{0}: {1} at line {2}" -f $f, $errs[0].Message, $errs[0].Extent.StartLineNumber) }
    }
  }
  It 'every script is ASCII (a BOM-less file with other characters is read as ANSI by 5.1)' {
    foreach ($f in 'device_session.ps1', 'device_ui.ps1', 'device_judge.ps1') {
      $bytes = [System.IO.File]::ReadAllBytes((Join-Path $scripts $f))
      $bad = @($bytes | Where-Object { $_ -gt 127 }).Count
      if ($bad -gt 0) { throw "$f has $bad non-ASCII bytes" }
    }
  }
  It '-DryRun with no phone and no adb exits 0 and writes nothing' {
    $out = Join-Path ([System.IO.Path]::GetTempPath()) 'cmw_device_session_dryrun_probe'
    $r = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $scripts 'device_session.ps1') -DryRun -Out $out -Adb 'Z:\no\such\adb.exe' 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "exit $LASTEXITCODE" }
    if ($r -notmatch 'DRY RUN') { throw 'no dry-run banner' }
    if (Test-Path -LiteralPath $out) { throw 'the dry run created the output folder' }
  }
}

# --- end to end against the fake phone (test/ps/fake_adb): the whole session with no device -----------------------------
# A synthetic APK + sidecar, a fake adb that models the app's screens, and the real script. About 45 s for the A9 part;
# the tour part (about 2 min) runs when CMW_E2E_TOUR=1.
Describe 'end to end against the fake phone' {
  $fake = Join-Path $PSScriptRoot 'fake_adb\fake_adb.cmd'
  $root = Join-Path ([System.IO.Path]::GetTempPath()) 'cmw_device_session_e2e'
  function Initialize-E2E {
    param([string]$Name)
    if (-not (Test-Path -LiteralPath $root)) { [void](New-Item -ItemType Directory -Path $root) }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss-fff'
    $d = Join-Path $root ("{0}_{1}" -f $Name, $stamp)
    [void](New-Item -ItemType Directory -Path $d)
    $apk = Join-Path $d 'cardiac-mri-workspace-live-test.apk'
    [System.IO.File]::WriteAllBytes($apk, [byte[]](1..255 | ForEach-Object { $_ }))
    $sha = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    $side = "apk              cardiac-mri-workspace-live-test.apk`nbuilt_at         2026-10-18T09:27:31+07:00`nmode             live`napi_base_url     configured (not recorded)`ncontract         1.1.0`ngit_sha          0123456789abcdef0123456789abcdef01234567`ngit_branch       main`napk_sha256       $sha`n"
    [System.IO.File]::WriteAllText($apk + '.build.txt', $side)
    return @{ Apk = $apk; Out = (Join-Path $d 'out'); Fake = (Join-Path $d 'fake') }
  }
  function Invoke-E2E {
    param($E, [string]$Steps, [string[]]$Extra = @(), [hashtable]$Env = @{})
    $env:FAKE_ADB_DIR = $E.Fake
    foreach ($k in $Env.Keys) { Set-Item -Path ("Env:" + $k) -Value $Env[$k] }
    try {
      $psArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $scripts 'device_session.ps1'), '-Adb', $fake, '-Apk', $E.Apk, '-Out', $E.Out, '-Steps', $Steps, '-Unattended') + $Extra
      $text = & powershell.exe @psArgs 2>&1 | Out-String
      return @{ Text = $text; Exit = $LASTEXITCODE }
    } finally {
      foreach ($k in $Env.Keys) { Remove-Item -Path ("Env:" + $k) -ErrorAction SilentlyContinue }
      Remove-Item Env:FAKE_ADB_DIR -ErrorAction SilentlyContinue
    }
  }
  It 'preflight, install, one repetition, judge: PASS; no touch during the run; nothing sensitive written' {
    $e = Initialize-E2E 'a9'
    $r = Invoke-E2E -E $e -Steps 'preflight,install,a9,judge' -Extra @('-Reps', '1')
    if ($r.Exit -ne 0) { throw ("exit {0}`n{1}" -f $r.Exit, $r.Text) }
    $sum = Get-Content -LiteralPath (Join-Path $e.Out 'SUMMARY.md') -Raw -Encoding UTF8
    if ($sum -notmatch 'TC-PERF-001 PASS') { throw 'verdict is not PASS' }
    if (Test-Path -LiteralPath (Join-Path $e.Fake 'violations.txt')) { throw ('the script touched the phone during a pass or tapped a write button: ' + (Get-Content (Join-Path $e.Fake 'violations.txt') -Raw)) }
    foreach ($f in Get-ChildItem -LiteralPath $e.Out -File) {
      $t = [System.IO.File]::ReadAllText($f.FullName)
      if ($t -match 'FAKE0123456789') { throw ("the device serial is in {0}" -f $f.Name) }
      if ($t -match '192\.168\.1\.55') { throw ("an IP address is in {0}" -f $f.Name) }
    }
    foreach ($n in 'A9_rep1_logcat.txt', 'A9_rep1_meminfo_M0.txt', 'A9_rep1_meminfo_M1.txt', 'slice_timing_rep1.txt', 'l4_report_rep1.txt', 'PROVENANCE_DRAFT.md', 'apk_build_record.txt') {
      if (-not (Test-Path -LiteralPath (Join-Path $e.Out $n))) { throw "missing $n" }
    }
    $calls = Get-Content -LiteralPath (Join-Path $e.Fake 'adb_calls.txt')
    $iTap = [array]::IndexOf($calls, ($calls | Where-Object { $_ -match '^shell input tap 540 1240$' } | Select-Object -First 1))
    $iM1 = -1; for ($i = $iTap + 1; $i -lt $calls.Count; $i++) { if ($calls[$i] -match 'dumpsys meminfo') { $iM1 = $i; break } }
    if ($iTap -lt 0 -or $iM1 -ne ($iTap + 1)) { throw 'between "A9 30-step" and M1 the script made an adb call' }
  }
  It 'a slow run FAILs T1, exit code 2' {
    $e = Initialize-E2E 'slow'
    $r = Invoke-E2E -E $e -Steps 'install,a9,judge' -Extra @('-Reps', '1') -Env @{ FAKE_A9 = 'slow' }
    if ($r.Exit -ne 2) { throw ("exit {0}, expected 2`n{1}" -f $r.Exit, $r.Text) }
    if ($r.Text -notmatch 'TC-PERF-001 FAIL') { throw 'verdict is not FAIL' }
  }
  It 'a hung run uses the one rerun, then stops: NOT MEASURED' {
    $e = Initialize-E2E 'hang'
    $r = Invoke-E2E -E $e -Steps 'install,a9,judge' -Extra @('-Reps', '2', '-A9TimeoutSec', '20') -Env @{ FAKE_A9 = 'hang' }
    if ($r.Exit -ne 2) { throw ("exit {0}, expected 2`n{1}" -f $r.Exit, $r.Text) }
    if ($r.Text -notmatch 'NOT MEASURED') { throw 'verdict is not NOT MEASURED' }
    if (-not (Test-Path -LiteralPath (Join-Path $e.Out 'A9_rep1_attempt1_logcat.txt'))) { throw 'attempt 1 was not kept as A9_rep1_attempt1_logcat.txt' }
  }
  It 'no phone: a clear message and exit 1' {
    $e = Initialize-E2E 'nophone'
    $r = Invoke-E2E -E $e -Steps 'preflight' -Env @{ FAKE_NO_DEVICE = '1' }
    if ($r.Exit -ne 1) { throw "exit $($r.Exit)" }
    if ($r.Text -notmatch 'No phone found on adb') { throw 'no helpful message' }
  }
  It 'the tour takes its screenshots, never taps a write button, never opens SCR-06 unless asked' {
    if (-not $env:CMW_E2E_TOUR) { return }
    $e = Initialize-E2E 'tour'
    $r = Invoke-E2E -E $e -Steps 'tour'
    if ($r.Exit -ne 0) { throw ("exit {0}`n{1}" -f $r.Exit, $r.Text) }
    $shots = @(Get-ChildItem -LiteralPath (Join-Path $e.Out 'screens') -Filter '*.png')
    if ($shots.Count -lt 12) { throw ("only {0} screenshots" -f $shots.Count) }
    if (Test-Path -LiteralPath (Join-Path $e.Fake 'violations.txt')) { throw 'a write button was tapped' }
    if (Test-Path -LiteralPath (Join-Path $e.Fake 'backend_writes.txt')) { throw 'SCR-06 was opened without the operator saying yes' }
  }
}