# device_judge.ps1 - the laptop-side judge of a TC-PERF-001 / A9 phone session, and the evidence writers.
#
# Dot-source it (after device_ui.ps1):   . "$PSScriptRoot\device_judge.ps1"
# Windows PowerShell 5.1, ASCII only.
#
# It runs the report commands of mobile/A9_TC_PERF_001_SCRIPT.md section 4 and reads their output:
#   T1  p95 <= 200 ms over the measured pass     the "A9:measured" row of slice-timing-report.mjs: n 31, p95 <= 200
#   T2  release + live                           no "(DEV build)" row; every CMW_RUN_START reads "dev":false,"mode":"live"
#   T3  the measured pass was cached navigation  31 CMW_GESTURE all "cache_hit":true; the two CMW_NET_TOTALS equal in
#                                                requests, bytes, unattributed, late; no CMW_STEP_TIMEOUT in it
#   T4  no full-volume request per gesture       l4-report.mjs "problems": []
# The functions that decide are pure (text in, object out), so the self-test runs them on fixtures with no phone.

Set-StrictMode -Version 2

if (-not (Get-Command Invoke-Native -ErrorAction SilentlyContinue)) {
  . (Join-Path $PSScriptRoot 'device_ui.ps1')
}

$script:Em = [string][char]0x2014    # the dash of the written verdict lines; the script file itself stays ASCII
$script:LeaderName = 'Ph' + [char]0x1EA1 + 'm Tu' + [char]0x1EA5 + 'n Anh'

$script:ExpectedSteps = 31           # [0, ...30-step sequence], per pass
$script:ExpectedCounts = [ordered]@{ CMW_SLICE = 62; CMW_GESTURE = 63; CMW_RUN_END = 2; CMW_NET_TOTALS = 2 }
$script:P95LimitMs = 200

# ----------------------------------------------------------------------------------------------------------------
# Log facts (T2 and T3), as the PowerShell of section 4.1 / 4.2 reads them
# ----------------------------------------------------------------------------------------------------------------

function Get-TagCounts {
  # "foreach tag: Select-String -Pattern tag | count" of section 3.5.
  param([string]$Text)
  $counts = [ordered]@{}
  $lines = $Text -split "`r?`n"
  foreach ($tag in 'CMW_SLICE', 'CMW_GESTURE', 'CMW_RUN_START', 'CMW_RUN_END', 'CMW_NET_TOTALS', 'CMW_STEP_TIMEOUT') {
    $n = 0
    foreach ($l in $lines) { if ($l.Contains($tag)) { $n++ } }
    $counts[$tag] = $n
  }
  return $counts
}

function Get-Prop {
  # $obj.name or $null: a marker from an older build may lack a field, and strict mode would throw.
  param($Object, [string]$Name)
  if ($null -eq $Object) { return $null }
  $p = $Object.PSObject.Properties[$Name]
  if ($null -eq $p) { return $null }
  return $p.Value
}

function Get-LogStamp {
  param([string]$Line)
  $m = [regex]::Match($Line, '^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)')
  if ($m.Success) { return $m.Groups[1].Value }
  return $null
}

function ConvertFrom-MarkerLine {
  # "<prefix> CMW_RUN_START {json}" -> the object, or $null.
  param([string]$Line, [string]$Tag)
  $i = $Line.IndexOf($Tag + ' ')
  if ($i -lt 0) { return $null }
  $json = $Line.Substring($i + $Tag.Length + 1).Trim()
  try { return ($json | ConvertFrom-Json) } catch { return $null }
}

function Get-LogFacts {
  param([string]$Text)
  $facts = [ordered]@{
    Counts           = (Get-TagCounts $Text)
    A9Starts         = New-Object System.Collections.ArrayList     # parsed CMW_RUN_START objects of run A9
    A9Ends           = New-Object System.Collections.ArrayList
    OtherRunStarts   = 0
    StartLines       = 0                                           # all CMW_RUN_START lines
    StartsLive       = 0                                           # of those, "dev":false,"mode":"live"
    MeasuredGestures = 0
    MeasuredMisses   = 0
    WarmGestures     = 0
    TimeoutsMeasured = 0
    TimeoutsWarm     = 0
    TimeoutsOther    = 0
    NetTotals        = @{}                                         # 'warm' / 'measured' -> object
    NetTotalsCount   = 0
    ManualSlices     = 0                                           # CMW_SLICE outside a run
    Windows          = [ordered]@{ warm = @{ Start = $null; End = $null }; measured = @{ Start = $null; End = $null } }
  }
  $pass = $null          # 'A9:warm' | 'A9:measured' | 'other'
  foreach ($line in ($Text -split "`r?`n")) {
    if ($line.Contains('CMW_RUN_START ')) {
      $facts.StartLines++
      if ($line -match '"dev":false,"mode":"live"') { $facts.StartsLive++ }
      $o = ConvertFrom-MarkerLine -Line $line -Tag 'CMW_RUN_START'
      $pass = 'other'
      if ($null -ne $o -and (Get-Prop $o 'run') -eq 'A9') {
        [void]$facts.A9Starts.Add($o)
        $pv = [string](Get-Prop $o 'pass')
        $pass = 'A9:' + $pv
        if ($pv -eq 'warm' -or $pv -eq 'measured') { $facts.Windows[$pv].Start = (Get-LogStamp $line) }
      } else { $facts.OtherRunStarts++ }
      continue
    }
    if ($line.Contains('CMW_RUN_END ')) {
      $o = ConvertFrom-MarkerLine -Line $line -Tag 'CMW_RUN_END'
      if ($null -ne $o -and (Get-Prop $o 'run') -eq 'A9') {
        [void]$facts.A9Ends.Add($o)
        $pv = [string](Get-Prop $o 'pass')
        if ($pv -eq 'warm' -or $pv -eq 'measured') { $facts.Windows[$pv].End = (Get-LogStamp $line) }
      }
      $pass = $null
      continue
    }
    if ($line.Contains('CMW_NET_TOTALS ')) {
      $facts.NetTotalsCount++
      $o = ConvertFrom-MarkerLine -Line $line -Tag 'CMW_NET_TOTALS'
      if ($null -ne $o -and (Get-Prop $o 'run') -eq 'A9') {
        $pv = [string](Get-Prop $o 'pass')
        if (-not $facts.NetTotals.ContainsKey($pv)) { $facts.NetTotals[$pv] = $o }
      }
      continue
    }
    if ($line.Contains('CMW_STEP_TIMEOUT')) {
      if ($pass -eq 'A9:measured') { $facts.TimeoutsMeasured++ }
      elseif ($pass -eq 'A9:warm') { $facts.TimeoutsWarm++ }
      else { $facts.TimeoutsOther++ }
      continue
    }
    if ($line.Contains('CMW_GESTURE ')) {
      if ($pass -eq 'A9:measured') {
        $facts.MeasuredGestures++
        if ($line -notmatch '"cache_hit":true') { $facts.MeasuredMisses++ }
      } elseif ($pass -eq 'A9:warm') { $facts.WarmGestures++ }
      continue
    }
    if ($line.Contains('CMW_SLICE ')) {
      if ($null -eq $pass) { $facts.ManualSlices++ }
    }
  }
  return [pscustomobject]$facts
}

# ----------------------------------------------------------------------------------------------------------------
# The two report tools
# ----------------------------------------------------------------------------------------------------------------

function ConvertFrom-TimingReport {
  # slice-timing-report.mjs rows -> objects. "A9:measured   n  31  min 12  p50 20  p95 40  max 90  (ms_to_frame)"
  param([string]$Text)
  $rows = New-Object System.Collections.ArrayList
  $re = '^(?<pass>\S.*?)\s+n\s+(?<n>\d+)\s+min\s+(?<min>\S+)\s+p50\s+(?<p50>\S+)\s+p95\s+(?<p95>\S+)\s+max\s+(?<max>\S+)\s+\(ms_to_frame\)\s*$'
  foreach ($line in ($Text -split "`r?`n")) {
    $m = [regex]::Match($line, $re)
    if (-not $m.Success) { continue }
    $pass = $m.Groups['pass'].Value.Trim()
    $dev = $pass.EndsWith('(DEV build)')
    $name = $pass
    if ($dev) { $name = $pass.Substring(0, $pass.Length - '(DEV build)'.Length).Trim() }
    [void]$rows.Add([pscustomobject]@{
      Pass = $pass; Name = $name; Dev = $dev; N = [int]$m.Groups['n'].Value
      Min = [double]$m.Groups['min'].Value; P50 = [double]$m.Groups['p50'].Value
      P95 = [double]$m.Groups['p95'].Value; Max = [double]$m.Groups['max'].Value
    })
  }
  return $rows.ToArray()
}

function ConvertFrom-L4Report {
  # l4-report.mjs output: a JSON block, some lines, and "L4 PASS|FAIL|CANNOT_JUDGE". For an A9 capture the expected,
  # passing shape is "problems": [] and CANNOT_JUDGE (the report counts L4 markers only; R1-R4 still run).
  param([string]$Text, [int]$ExitCode = 0, [string]$StdErr = '')
  $res = [ordered]@{ Parsed = $false; Verdict = ''; Problems = @(); Note = ''; Counts = $null; Raw = $Text }
  $lines = $Text -split "`r?`n"
  $start = -1; $end = -1
  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($start -lt 0 -and $lines[$i] -eq '{') { $start = $i; continue }
    if ($start -ge 0 -and $lines[$i] -eq '}') { $end = $i; break }
  }
  if ($start -ge 0 -and $end -gt $start) {
    try {
      $j = ($lines[$start..$end] -join "`n") | ConvertFrom-Json
      $res.Parsed = $true
      $res.Problems = @($j.problems)
      $res.Counts = $j.counts
      if ($j.PSObject.Properties['note'] -and $j.note) { $res.Note = [string]$j.note }
    } catch { }
  }
  foreach ($l in $lines) {
    $m = [regex]::Match($l, '^L4 (PASS|FAIL|CANNOT_JUDGE)\s*$')
    if ($m.Success) { $res.Verdict = $m.Groups[1].Value }
  }
  if (-not $res.Parsed -and $StdErr) { $res.Note = $StdErr.Trim() }
  return [pscustomobject]$res
}

function Find-NodeExe {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

function Invoke-NodeScript {
  # node --no-warnings <script> <args>: --no-warnings keeps the absolute path of a file on this PC out of stderr
  # (MODULE_TYPELESS_PACKAGE_JSON, #77 QA re-check R-2).
  param([string]$Node, [string]$Script, [string[]]$ScriptArgs = @(), [int]$TimeoutSec = 120)
  return Invoke-Native -FilePath $Node -ArgumentList (@('--no-warnings', $Script) + $ScriptArgs) -TimeoutSec $TimeoutSec
}

# ----------------------------------------------------------------------------------------------------------------
# T1 - T4 for one repetition, and the verdict
# ----------------------------------------------------------------------------------------------------------------

function New-Check {
  param([bool]$Pass, [string]$Detail)
  return [pscustomobject]@{ Pass = $Pass; Detail = $Detail }
}

function Get-RepEvaluation {
  param(
    [int]$K,
    $Facts,
    [object[]]$TimingRows,
    $L4,
    [string]$TimingStdErr = ''
  )
  $rows = @($TimingRows)
  $warm = $rows | Where-Object { $_.Name -eq 'A9:warm' -and -not $_.Dev } | Select-Object -First 1
  $meas = $rows | Where-Object { $_.Name -eq 'A9:measured' -and -not $_.Dev } | Select-Object -First 1
  $devRows = @($rows | Where-Object { $_.Dev })
  $manualRows = @($rows | Where-Object { $_.Name -eq 'manual' })
  $notes = New-Object System.Collections.ArrayList
  # measured = the measured pass ran to its end (or left a row): a run that started and never finished is NOT MEASURED,
  # not a failure of T1-T3 (A9 script, phone budget: "TC-PERF-001 NOT MEASURED - <reason>")
  $started = ($Facts.A9Starts.Count -gt 0)
  $a9Present = ($null -ne $meas) -or [bool]($Facts.Windows['measured'].End)

  # T1
  if ($null -eq $meas) {
    $other = @($rows | ForEach-Object { $_.Pass }) -join ', '
    if (-not $other) { $other = 'no timing rows at all' }
    $t1 = New-Check $false ('no A9:measured row (rows present: ' + $other + ')')
  } else {
    $okN = ($meas.N -eq $script:ExpectedSteps)
    $okP = ($meas.P95 -le $script:P95LimitMs)
    $d = 'A9:measured n {0} p50 {1} p95 {2} max {3} ms (need n {4}, p95 <= {5})' -f $meas.N, $meas.P50, $meas.P95, $meas.Max, $script:ExpectedSteps, $script:P95LimitMs
    $t1 = New-Check ($okN -and $okP) $d
  }

  # T2
  $t2Problems = New-Object System.Collections.ArrayList
  if ($devRows.Count -gt 0) { [void]$t2Problems.Add('a (DEV build) row: ' + (($devRows | ForEach-Object { $_.Name }) -join ', ')) }
  if ($Facts.StartLines -eq 0) { [void]$t2Problems.Add('no CMW_RUN_START line') }
  elseif ($Facts.StartsLive -ne $Facts.StartLines) { [void]$t2Problems.Add(('{0} of {1} CMW_RUN_START lines are not "dev":false,"mode":"live"' -f ($Facts.StartLines - $Facts.StartsLive), $Facts.StartLines)) }
  if ($Facts.A9Starts.Count -ne 2) { [void]$t2Problems.Add(('{0} A9 CMW_RUN_START lines, expected 2 (warm, measured)' -f $Facts.A9Starts.Count)) }
  if ($t2Problems.Count -eq 0) { $t2 = New-Check $true ('both CMW_RUN_START lines read "dev":false,"mode":"live"; no (DEV build) row') }
  else { $t2 = New-Check $false ($t2Problems -join '; ') }

  # T3
  $t3Problems = New-Object System.Collections.ArrayList
  if ($Facts.MeasuredGestures -ne $script:ExpectedSteps) { [void]$t3Problems.Add(('{0} CMW_GESTURE in the measured pass, expected {1}' -f $Facts.MeasuredGestures, $script:ExpectedSteps)) }
  if ($Facts.MeasuredMisses -ne 0) { [void]$t3Problems.Add(('{0} measured gestures are not cache hits' -f $Facts.MeasuredMisses)) }
  if ($Facts.TimeoutsMeasured -ne 0) { [void]$t3Problems.Add(('{0} CMW_STEP_TIMEOUT in the measured pass' -f $Facts.TimeoutsMeasured)) }
  $tw = $null; $tm = $null
  if ($Facts.NetTotals.ContainsKey('warm')) { $tw = $Facts.NetTotals['warm'] }
  if ($Facts.NetTotals.ContainsKey('measured')) { $tm = $Facts.NetTotals['measured'] }
  $totalsText = 'CMW_NET_TOTALS missing'
  if ($null -eq $tw -or $null -eq $tm) {
    [void]$t3Problems.Add('CMW_NET_TOTALS for warm and/or measured is missing (an APK older than #88?)')
  } else {
    $diff = New-Object System.Collections.ArrayList
    foreach ($f in 'requests', 'bytes', 'unattributed', 'late') {
      $a = $null; $b = $null
      if ($tw.PSObject.Properties[$f]) { $a = $tw.$f }
      if ($tm.PSObject.Properties[$f]) { $b = $tm.$f }
      if ($a -ne $b) { [void]$diff.Add(('{0} {1} -> {2}' -f $f, $a, $b)) }
    }
    if ($diff.Count -gt 0) { [void]$t3Problems.Add('totals changed between the passes: ' + ($diff -join ', ')) }
    $totalsText = 'totals warm = measured (requests {0}, bytes {1}, unattributed {2}, late {3})' -f $tm.requests, $tm.bytes, $tm.unattributed, $tm.late
  }
  if ($t3Problems.Count -eq 0) {
    $t3 = New-Check $true ('measured gestures {0}, not cache hits 0, step timeouts 0; {1}' -f $Facts.MeasuredGestures, $totalsText)
  } else { $t3 = New-Check $false ($t3Problems -join '; ') }
  if ($Facts.TimeoutsWarm -gt 0) { [void]$notes.Add(('{0} CMW_STEP_TIMEOUT in the WARM pass (noted, not a failure)' -f $Facts.TimeoutsWarm)) }
  if ($Facts.TimeoutsOther -gt 0) { [void]$notes.Add(('{0} CMW_STEP_TIMEOUT outside the A9 passes' -f $Facts.TimeoutsOther)) }
  if ($manualRows.Count -gt 0) { [void]$notes.Add(('a "manual" timing row (n {0}): slices moved outside the run, not TC-PERF-001 samples' -f $manualRows[0].N)) }

  # T4
  if ($null -eq $L4 -or -not $L4.Parsed) {
    $why = 'l4-report gave no readable JSON'
    if ($null -ne $L4 -and $L4.Note) { $why += ': ' + $L4.Note }
    $t4 = New-Check $false $why
  } elseif ($L4.Problems.Count -gt 0 -or $L4.Verdict -eq 'FAIL') {
    $first = @($L4.Problems | Select-Object -First 3) -join ' | '
    $t4 = New-Check $false ('l4-report problems ({0}): {1}' -f $L4.Problems.Count, $first)
  } else {
    $t4 = New-Check $true ('l4-report "problems": [] (verdict ' + $L4.Verdict + '; CANNOT_JUDGE is the expected shape for an A9 capture)')
  }

  $failed = New-Object System.Collections.ArrayList
  if (-not $t1.Pass) { [void]$failed.Add('T1') }
  if (-not $t2.Pass) { [void]$failed.Add('T2') }
  if (-not $t3.Pass) { [void]$failed.Add('T3') }
  if (-not $t4.Pass) { [void]$failed.Add('T4') }
  $verdict = 'PASS'
  if (-not $a9Present) { $verdict = 'NOT MEASURED' }
  elseif ($failed.Count -gt 0) { $verdict = 'FAIL' }

  return [pscustomobject]@{
    K = $K; Verdict = $verdict; Failed = $failed.ToArray(); A9Present = $a9Present; Started = $started
    T1 = $t1; T2 = $t2; T3 = $t3; T4 = $t4
    Warm = $warm; Measured = $meas; Notes = $notes.ToArray()
  }
}

function Get-ScopeText {
  # What the capture covers, from the first A9 CMW_RUN_START (has_run, gt_overlay, prediction_overlay).
  param($Facts, [string]$CaseId = 'CASE_0061')
  if ($Facts.A9Starts.Count -eq 0) { return ('MRI + ground-truth path; prediction overlay not covered (no A9 run in the capture)') }
  $s = $Facts.A9Starts[0]
  $hasRun = ((Get-Prop $s 'has_run') -eq $true)
  $gt = ((Get-Prop $s 'gt_overlay') -eq $true)
  $pred = ((Get-Prop $s 'prediction_overlay') -eq $true)
  if (-not $hasRun) {
    if ($gt) { return 'MRI + ground-truth path; prediction overlay not covered' }
    return 'MRI path only (ground-truth overlay was OFF); prediction overlay not covered'
  }
  $parts = @('MRI')
  if ($gt) { $parts += 'ground truth' }
  if ($pred) { $parts += 'prediction overlay' } else { $parts += '(prediction overlay OFF)' }
  return (($parts -join ' + ') + ' (case has an analysis run)')
}

function Get-OverallVerdict {
  # TC-PERF-001 PASS / FAIL / INCOMPLETE / NOT MEASURED, in the wording of the written script (section 4 end).
  param([object[]]$Evaluations, [int]$Expected, [string]$CaseId, [string]$Scope, [bool]$Rehearsal = $false, [string]$RehearsalWhy = '')
  $ev = @($Evaluations)
  $measured = @($ev | Where-Object { $_.A9Present })
  $key = ''
  $line = ''
  if ($Rehearsal) {
    $key = 'NOT EVIDENCE'
    $line = 'TC-PERF-001 NOT MEASURED ' + $script:Em + ' rehearsal, not evidence: ' + $RehearsalWhy
    return [pscustomobject]@{ Key = $key; Line = $line }
  }
  if ($measured.Count -eq 0) {
    $key = 'NOT MEASURED'
    $line = 'TC-PERF-001 NOT MEASURED ' + $script:Em + ' no A9 rows in any capture (the A9 run never started)'
    $began = @($ev | Where-Object { (Get-Prop $_ 'Started') -eq $true })
    if ($began.Count -gt 0) { $line = 'TC-PERF-001 NOT MEASURED ' + $script:Em + ' the A9 run started but the measured pass never finished (hung, or the capture was cut): no CMW_RUN_END' }
  } else {
    $failedReps = @($measured | Where-Object { $_.Verdict -eq 'FAIL' })
    if ($failedReps.Count -gt 0) {
      $key = 'FAIL'
      $bits = @($failedReps | ForEach-Object { ('{0}, repetition {1}' -f ($_.Failed -join '+'), $_.K) })
      $line = 'TC-PERF-001 FAIL ' + $script:Em + ' ' + ($bits -join '; ')
      if ($measured.Count -lt $Expected) { $line += ' (and only {0} of {1} repetitions measured)' -f $measured.Count, $Expected }
    } elseif ($measured.Count -lt $Expected) {
      $key = 'INCOMPLETE'
      $line = ('TC-PERF-001 INCOMPLETE ' + $script:Em + ' {0} of {1}') -f $measured.Count, $Expected
    } else {
      $key = 'PASS'
      $line = ('TC-PERF-001 PASS ' + $script:Em + ' {0}, {1}, {2}/{3} repetitions') -f $Scope, $CaseId, $measured.Count, $Expected
    }
  }
  return [pscustomobject]@{ Key = $key; Line = $line }
}

# ----------------------------------------------------------------------------------------------------------------
# dumpsys meminfo (recorded, never judged)
# ----------------------------------------------------------------------------------------------------------------

function ConvertFrom-Meminfo {
  param([string]$Text)
  $r = [ordered]@{ Found = $false; TotalPssKb = $null; NativeHeapKb = $null; GraphicsKb = $null; JavaHeapKb = $null }
  if ([string]::IsNullOrEmpty($Text) -or $Text -match 'No process found') { return [pscustomobject]$r }
  $m = [regex]::Match($Text, 'TOTAL PSS:\s*(\d+)')
  if (-not $m.Success) { $m = [regex]::Match($Text, '(?m)^\s*TOTAL\s+(\d+)') }
  if ($m.Success) { $r.TotalPssKb = [int64]$m.Groups[1].Value; $r.Found = $true }
  foreach ($pair in @(@('NativeHeapKb', 'Native Heap'), @('GraphicsKb', 'Graphics'), @('JavaHeapKb', 'Java Heap'))) {
    $label = [regex]::Escape($pair[1])
    $m = [regex]::Match($Text, $label + ':\s+(\d+)')
    if (-not $m.Success) { $m = [regex]::Match($Text, '(?m)^\s*' + $label + '\s+(\d+)') }
    if ($m.Success) { $r[$pair[0]] = [int64]$m.Groups[1].Value }
  }
  return [pscustomobject]$r
}

# ----------------------------------------------------------------------------------------------------------------
# Redaction scan: nothing that is committed may hold the serial, a private IPv4, a URL host, the Windows user
# ----------------------------------------------------------------------------------------------------------------

function Find-SensitiveText {
  # Returns [{ File; Line; Kind }] - never the matched text, so the report itself can be pasted anywhere.
  param([string[]]$Paths, [string[]]$Serials = @())
  $hits = New-Object System.Collections.ArrayList
  $ipRe = New-Object System.Text.RegularExpressions.Regex('(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d]|\.\d)')
  $privRe = New-Object System.Text.RegularExpressions.Regex($script:PrivateIpv4)
  $urlRe = New-Object System.Text.RegularExpressions.Regex('https?://(?!<)[^\s"''<>]+', 'IgnoreCase')
  $user = ''
  if ($env:USERNAME -and $env:USERNAME.Length -ge 4) { $user = $env:USERNAME }
  $userRe = $null
  if ($user) { $userRe = New-Object System.Text.RegularExpressions.Regex('\b' + [regex]::Escape($user) + '\b', 'IgnoreCase') }
  $homeRe = $null
  if ($env:USERPROFILE) { $homeRe = New-Object System.Text.RegularExpressions.Regex([regex]::Escape($env:USERPROFILE), 'IgnoreCase') }
  foreach ($p in @($Paths)) {
    if (-not (Test-Path -LiteralPath $p)) { continue }
    $text = [System.IO.File]::ReadAllText($p, $script:Utf8NoBom)
    $n = 0
    foreach ($line in ($text -split "`r?`n")) {
      $n++
      $name = Split-Path -Leaf $p
      foreach ($s in @($Serials)) {
        if ($s -and $line.IndexOf($s, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'device-serial' }) }
      }
      if ($privRe.IsMatch($line)) { [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'private-ipv4' }) }
      else {
        foreach ($m in $ipRe.Matches($line)) {
          $o = @($m.Groups[1].Value, $m.Groups[2].Value, $m.Groups[3].Value, $m.Groups[4].Value | ForEach-Object { [int]$_ })
          if (($o | Where-Object { $_ -gt 255 }).Count -gt 0) { continue }
          if ($o[0] -eq 127 -or ($o[0] -eq 0 -and $o[1] -eq 0)) { continue }
          [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'ipv4' })
          break
        }
      }
      if ($urlRe.IsMatch($line)) { [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'url' }) }
      if ($homeRe -and $homeRe.IsMatch($line)) { [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'windows-profile-path' }) }
      elseif ($userRe -and $userRe.IsMatch($line)) { [void]$hits.Add([pscustomobject]@{ File = $name; Line = $n; Kind = 'windows-user-name' }) }
    }
  }
  return $hits.ToArray()
}

# ----------------------------------------------------------------------------------------------------------------
# Evidence files
# ----------------------------------------------------------------------------------------------------------------

function ConvertTo-RedactedBuildRecord {
  # The APK's .build.txt, as apk_build_record.txt: an api_base_url that is anything but "configured (not recorded)"
  # (a build older than DR-021 rule 3 recorded an unsalted sha256 of the address) is replaced by <redacted>.
  param([string]$Text)
  $out = New-Object System.Collections.ArrayList
  foreach ($l in ($Text -split "`r?`n")) {
    if ($l -match '^\s*api_base_url\s+(.*)$' -and $Matches[1].Trim() -ne 'configured (not recorded)') {
      [void]$out.Add('api_base_url     <redacted>')
    } else { [void]$out.Add($l) }
  }
  return ($out -join "`n")
}

function ConvertFrom-BuildRecord {
  # <apk>.build.txt: "key<spaces>value" lines -> hashtable.
  param([string]$Text)
  $h = [ordered]@{}
  foreach ($l in ($Text -split "`r?`n")) {
    $m = [regex]::Match($l, '^(\S+)\s+(.*)$')
    if ($m.Success) { $h[$m.Groups[1].Value] = $m.Groups[2].Value.Trim() }
  }
  return $h
}

function Get-PreflightBlock {
  # The lines from "preflight:" to "PREFLIGHT ..." of preflight-live.mjs output (what the L4 folder keeps).
  param([string]$Text)
  $out = New-Object System.Collections.ArrayList
  $on = $false
  foreach ($l in ($Text -split "`r?`n")) {
    if (-not $on -and $l -match '^preflight:') { $on = $true }
    if ($on) {
      [void]$out.Add($l.TrimEnd())
      if ($l -match '^PREFLIGHT\s') { break }
    }
  }
  return ($out -join "`n")
}

function Get-BackendFacts {
  # What the app preflight says about the backend, without its address: contract, case count, runs.
  param([string]$PreflightText)
  $parts = New-Object System.Collections.ArrayList
  $m = [regex]::Match($PreflightText, 'backend contract (\S+?)[,;]')
  if ($m.Success) { [void]$parts.Add('contract ' + $m.Groups[1].Value) }
  $m = [regex]::Match($PreflightText, '(\d+) rows')
  if ($m.Success) { [void]$parts.Add($m.Groups[1].Value + ' cases') }
  $m = [regex]::Match($PreflightText, '\| run (none|[A-Za-z0-9_.-]+)')
  if ($m.Success) { if ($m.Groups[1].Value -eq 'none') { [void]$parts.Add('0 analysis runs for the case (MRI + ground truth only)') } else { [void]$parts.Add('run ' + $m.Groups[1].Value) } }
  if ($parts.Count -eq 0) { return 'Backend answered the app preflight (details in preflight.txt).' }
  return ('Backend, from the app preflight: ' + ($parts -join ', ') + '.')
}

function Get-FileFacts {
  param([string]$Path)
  $fi = Get-Item -LiteralPath $Path
  $h = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  return [pscustomobject]@{ Name = $fi.Name; Bytes = $fi.Length; Sha256 = $h }
}

function Get-CommitCandidates {
  # The few files meant for management/evidence/TC_PERF_001/<folder>/ : logcat text, memory, the reports, SUMMARY,
  # PROVENANCE. Not: the dumps, the pooled copy, screenshots, UI xml, session logs.
  param([string]$OutDir, [int]$Reps)
  $names = New-Object System.Collections.ArrayList
  for ($k = 1; $k -le $Reps; $k++) {
    foreach ($n in "A9_rep${k}_logcat.txt", "A9_rep${k}_meminfo_M0.txt", "A9_rep${k}_meminfo_M1.txt", "slice_timing_rep${k}.txt", "l4_report_rep${k}.txt") { [void]$names.Add($n) }
  }
  foreach ($n in 'slice_timing_all_reps.txt', 'apk_build_record.txt', 'preflight.txt', 'SUMMARY.md', 'PROVENANCE_DRAFT.md') { [void]$names.Add($n) }
  $files = New-Object System.Collections.ArrayList
  foreach ($n in $names) { $p = Join-Path $OutDir $n; if (Test-Path -LiteralPath $p) { [void]$files.Add($p) } }
  foreach ($f in @(Get-ChildItem -LiteralPath $OutDir -Filter 'A9_rep*_attempt1_*' -File -ErrorAction SilentlyContinue)) {
    if ($f.Name -notmatch '_dump\.txt$') { [void]$files.Add($f.FullName) }
  }
  return $files.ToArray()
}

# ----------------------------------------------------------------------------------------------------------------
# The session judge: reports per repetition and pooled, written next to the captures
# ----------------------------------------------------------------------------------------------------------------

function Select-RepLog {
  # The streamed capture, unless the buffer dump holds more CMW lines (S1_L4 section 3.1: judge the dump, say so).
  param([string]$OutDir, [int]$K)
  $stream = Join-Path $OutDir "A9_rep${K}_logcat.txt"
  $dump = Join-Path $OutDir "A9_rep${K}_logcat_dump.txt"
  $cs = -1; $cd = -1
  if (Test-Path -LiteralPath $stream) { $t = Read-SharedText $stream; $cs = @($t -split "`r?`n" | Where-Object { $_.Contains('CMW_') }).Count }
  if (Test-Path -LiteralPath $dump) { $t = Read-SharedText $dump; $cd = @($t -split "`r?`n" | Where-Object { $_.Contains('CMW_') }).Count }
  if ($cs -lt 0 -and $cd -lt 0) { return [pscustomobject]@{ Path = $null; Source = 'none'; StreamLines = 0; DumpLines = 0 } }
  if ($cd -gt $cs) { return [pscustomobject]@{ Path = $dump; Source = 'dump'; StreamLines = [Math]::Max($cs, 0); DumpLines = $cd } }
  return [pscustomobject]@{ Path = $stream; Source = 'stream'; StreamLines = $cs; DumpLines = [Math]::Max($cd, 0) }
}

function Invoke-RepJudge {
  # Runs both report tools on one capture, writes slice_timing_rep<k>.txt and l4_report_rep<k>.txt, returns the
  # evaluation plus the facts. $K = 0 means "pooled" (file names without the repetition number are the caller's).
  param([string]$LogPath, [string]$Node, [string]$MobileDir, [string]$TimingOut, [string]$L4Out, [int]$K)
  $text = Read-SharedText $LogPath
  $facts = Get-LogFacts $text
  $tScript = Join-Path $MobileDir 'scripts\slice-timing-report.mjs'
  $lScript = Join-Path $MobileDir 'scripts\l4-report.mjs'
  $t = Invoke-NodeScript -Node $Node -Script $tScript -ScriptArgs @($LogPath)
  $timingText = $t.StdOut
  if ($t.ExitCode -ne 0 -and $t.StdErr) { $timingText = ($t.StdOut + $t.StdErr).Trim() }
  if ($TimingOut) { Write-TextFile -Path $TimingOut -Text $timingText }
  $l = Invoke-NodeScript -Node $Node -Script $lScript -ScriptArgs @($LogPath)
  if ($L4Out) { Write-TextFile -Path $L4Out -Text ($l.StdOut + $(if ($l.StdErr) { "`n" + $l.StdErr } else { '' })) }
  $rows = ConvertFrom-TimingReport $t.StdOut
  $l4 = ConvertFrom-L4Report -Text $l.StdOut -ExitCode $l.ExitCode -StdErr $l.StdErr
  $ev = Get-RepEvaluation -K $K -Facts $facts -TimingRows $rows -L4 $l4 -TimingStdErr $t.StdErr
  return [pscustomobject]@{ Eval = $ev; Facts = $facts; Rows = $rows; L4 = $l4; TimingText = $timingText }
}

function Invoke-SessionJudge {
  # Per repetition, then pooled. Files: slice_timing_rep<k>.txt, l4_report_rep<k>.txt, A9_all_reps_logcat.txt,
  # slice_timing_all_reps.txt.
  param([string]$OutDir, [string]$MobileDir, [int]$Reps, [string]$CaseId = 'CASE_0061', [string]$Node = '', [bool]$Rehearsal = $false, [string]$RehearsalWhy = '')
  if (-not $Node) { $Node = Find-NodeExe }
  if (-not $Node) { throw 'node is not on PATH: the report tools (slice-timing-report.mjs, l4-report.mjs) need it' }
  $perRep = New-Object System.Collections.ArrayList
  $sources = New-Object System.Collections.ArrayList
  for ($k = 1; $k -le $Reps; $k++) {
    $sel = Select-RepLog -OutDir $OutDir -K $k
    if ($null -eq $sel.Path) {
      [void]$perRep.Add([pscustomobject]@{ K = $k; Selection = $sel; Judged = $null })
      continue
    }
    $j = Invoke-RepJudge -LogPath $sel.Path -Node $Node -MobileDir $MobileDir -K $k `
      -TimingOut (Join-Path $OutDir "slice_timing_rep${k}.txt") -L4Out (Join-Path $OutDir "l4_report_rep${k}.txt")
    [void]$perRep.Add([pscustomobject]@{ K = $k; Selection = $sel; Judged = $j })
    [void]$sources.Add($sel.Path)
  }
  # pooled: the three captures, one after the other (nothing dropped, D5)
  $pooled = $null
  if ($sources.Count -gt 0) {
    $all = Join-Path $OutDir 'A9_all_reps_logcat.txt'
    $sb = New-Object System.Text.StringBuilder
    foreach ($p in $sources) {
      $t = Read-SharedText $p
      [void]$sb.Append($t.TrimEnd("`r", "`n")); [void]$sb.Append("`n")
    }
    Write-TextFile -Path $all -Text $sb.ToString()
    $t = Invoke-NodeScript -Node $Node -Script (Join-Path $MobileDir 'scripts\slice-timing-report.mjs') -ScriptArgs @($all)
    $timingText = $t.StdOut
    if ($t.ExitCode -ne 0 -and $t.StdErr) { $timingText = ($t.StdOut + $t.StdErr).Trim() }
    Write-TextFile -Path (Join-Path $OutDir 'slice_timing_all_reps.txt') -Text $timingText
    $rows = ConvertFrom-TimingReport $t.StdOut
    $pooled = [pscustomobject]@{
      Rows = $rows
      Warm = @($rows | Where-Object { $_.Name -eq 'A9:warm' -and -not $_.Dev }) | Select-Object -First 1
      Measured = @($rows | Where-Object { $_.Name -eq 'A9:measured' -and -not $_.Dev }) | Select-Object -First 1
    }
  }
  $evals = @($perRep | Where-Object { $null -ne $_.Judged } | ForEach-Object { $_.Judged.Eval })
  $scope = 'MRI + ground-truth path; prediction overlay not covered'
  $firstFacts = @($perRep | Where-Object { $null -ne $_.Judged } | ForEach-Object { $_.Judged.Facts }) | Select-Object -First 1
  if ($null -ne $firstFacts) { $scope = Get-ScopeText -Facts $firstFacts -CaseId $CaseId }
  # a fixture / dev capture is a rehearsal whatever the operator meant
  if (-not $Rehearsal) {
    foreach ($pr in $perRep) {
      if ($null -ne $pr.Judged) {
        foreach ($s in $pr.Judged.Facts.A9Starts) {
          $md = Get-Prop $s 'mode'
          if (($null -ne $md -and $md -ne 'live') -or ((Get-Prop $s 'dev') -eq $true)) {
            $Rehearsal = $true; $RehearsalWhy = 'the capture was made by a fixture or debug build (mode/dev markers)'
          }
        }
      }
    }
  }
  $overall = Get-OverallVerdict -Evaluations $evals -Expected $Reps -CaseId $CaseId -Scope $scope -Rehearsal $Rehearsal -RehearsalWhy $RehearsalWhy
  return [pscustomobject]@{ PerRep = $perRep.ToArray(); Pooled = $pooled; Overall = $overall; Scope = $scope; Reps = $Reps; CaseId = $CaseId; Rehearsal = $Rehearsal }
}

# ----------------------------------------------------------------------------------------------------------------
# SUMMARY.md and PROVENANCE_DRAFT.md
# ----------------------------------------------------------------------------------------------------------------

function Format-Row {
  param($Row)
  if ($null -eq $Row) { return 'n/a' }
  return ('n {0}, p50 {1}, p95 {2}, max {3}, min {4}' -f $Row.N, $Row.P50, $Row.P95, $Row.Max, $Row.Min)
}

function Format-Window {
  param($W)
  if ($null -eq $W -or -not $W.Start) { return 'n/a' }
  $e = $W.End; if (-not $e) { $e = '(no CMW_RUN_END)' }
  return ('{0} -> {1}' -f $W.Start, $e)
}

function New-SummaryMarkdown {
  # $State: the session state (hashtable: Started, Warnings, Deviations, Manual, Tour, RepMeta, Apk, Device ...)
  param($J, $State, [string]$OutDir)
  $nl = "`n"
  $sb = New-Object System.Text.StringBuilder
  $null = $sb.Append('# TC-PERF-001 / A9 phone session - SUMMARY' + $nl + $nl)
  $null = $sb.Append('**Verdict:** ' + $J.Overall.Line + $nl + $nl)
  $null = $sb.Append('Scope: ' + $J.Scope + '. Case ' + $J.CaseId + '. Generated by mobile/scripts/device_session.ps1 from the files next to this one; every repetition and the pooled row are listed, none is dropped (DEMO_STANDARD D5).' + $nl + $nl)
  if ($J.Rehearsal) { $null = $sb.Append('**This session is a REHEARSAL (not evidence).**' + $nl + $nl) }

  $null = $sb.Append('## Checks per repetition' + $nl + $nl)
  $null = $sb.Append('| Rep | Verdict | T1 p95 <= 200 ms (A9:measured) | T2 release + live | T3 cached, totals equal | T4 problems [] | log source |' + $nl)
  $null = $sb.Append('|---|---|---|---|---|---|---|' + $nl)
  foreach ($pr in $J.PerRep) {
    if ($null -eq $pr.Judged) { $null = $sb.Append(('| {0} | NOT RUN | - | - | - | - | no capture file |' -f $pr.K) + $nl); continue }
    $e = $pr.Judged.Eval
    if ($e.Verdict -eq 'NOT MEASURED') { $null = $sb.Append(('| {0} | NOT MEASURED | n/a | n/a | n/a | n/a | {1} |' -f $pr.K, $pr.Selection.Source) + $nl); continue }
    $mk = { param($c) if ($c.Pass) { 'pass' } else { 'FAIL' } }
    $null = $sb.Append(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} |' -f $pr.K, $e.Verdict, (& $mk $e.T1), (& $mk $e.T2), (& $mk $e.T3), (& $mk $e.T4), $pr.Selection.Source) + $nl)
  }
  $null = $sb.Append($nl + '## Timing (ms_to_frame, nearest-rank, no outlier removal)' + $nl + $nl)
  $null = $sb.Append('| Rep | A9:warm | A9:measured |' + $nl + '|---|---|---|' + $nl)
  foreach ($pr in $J.PerRep) {
    if ($null -eq $pr.Judged) { continue }
    $null = $sb.Append(('| {0} | {1} | {2} |' -f $pr.K, (Format-Row $pr.Judged.Eval.Warm), (Format-Row $pr.Judged.Eval.Measured)) + $nl)
  }
  if ($null -ne $J.Pooled) { $null = $sb.Append(('| pooled | {0} | {1} |' -f (Format-Row $J.Pooled.Warm), (Format-Row $J.Pooled.Measured)) + $nl) }
  $null = $sb.Append($nl + '## Details' + $nl + $nl)
  foreach ($pr in $J.PerRep) {
    if ($null -eq $pr.Judged) { $null = $sb.Append(('### Repetition {0}' -f $pr.K) + $nl + 'No capture file.' + $nl + $nl); continue }
    $e = $pr.Judged.Eval; $f = $pr.Judged.Facts
    $null = $sb.Append(('### Repetition {0}: {1}' -f $pr.K, $e.Verdict) + $nl + $nl)
    foreach ($id in 'T1', 'T2', 'T3', 'T4') {
      $c = $e.$id
      $null = $sb.Append(('- {0} {1}: {2}' -f $id, $(if ($c.Pass) { 'pass' } else { 'FAIL' }), $c.Detail) + $nl)
    }
    $cnt = $f.Counts
    $null = $sb.Append(('- counts: CMW_SLICE {0} (expect 62), CMW_GESTURE {1} (expect 63), CMW_RUN_END {2} (expect 2), CMW_NET_TOTALS {3} (expect 2)' -f $cnt['CMW_SLICE'], $cnt['CMW_GESTURE'], $cnt['CMW_RUN_END'], $cnt['CMW_NET_TOTALS']) + $nl)
    $null = $sb.Append(('- run window (phone clock, MM-DD HH:MM:SS.mmm): warm {0}; measured {1}' -f (Format-Window $f.Windows['warm']), (Format-Window $f.Windows['measured'])) + $nl)
    if ($f.A9Starts.Count -gt 0) {
      $s = $f.A9Starts[0]
      $null = $sb.Append(('- start of the run: has_run {0}, gt_overlay {1}, prediction_overlay {2}, nz {3}' -f (Get-Prop $s 'has_run'), (Get-Prop $s 'gt_overlay'), (Get-Prop $s 'prediction_overlay'), (Get-Prop $s 'nz')) + $nl)
    }
    foreach ($n in $e.Notes) { $null = $sb.Append('- note: ' + $n + $nl) }
    if ($pr.Selection.Source -eq 'dump') { $null = $sb.Append(('- note: judged from the buffer dump ({0} CMW lines) because the streamed file had fewer ({1})' -f $pr.Selection.DumpLines, $pr.Selection.StreamLines) + $nl) }
    $meta = $null
    if ($State.RepMeta.ContainsKey([string]$pr.K)) { $meta = $State.RepMeta[[string]$pr.K] }
    $m0 = Join-Path $OutDir ("A9_rep{0}_meminfo_M0.txt" -f $pr.K); $m1 = Join-Path $OutDir ("A9_rep{0}_meminfo_M1.txt" -f $pr.K)
    if ((Test-Path -LiteralPath $m0) -and (Test-Path -LiteralPath $m1)) {
      $a = ConvertFrom-Meminfo (Read-SharedText $m0); $b = ConvertFrom-Meminfo (Read-SharedText $m1)
      $null = $sb.Append(('- memory M0 -> M1 (KB, recorded only): TOTAL PSS {0} -> {1}; Native Heap {2} -> {3}; Graphics {4} -> {5}' -f $a.TotalPssKb, $b.TotalPssKb, $a.NativeHeapKb, $b.NativeHeapKb, $a.GraphicsKb, $b.GraphicsKb) + $nl)
    } else { $null = $sb.Append('- memory: M0/M1 file missing' + $nl) }
    if ($null -ne $meta) {
      if ($meta.ContainsKey('Battery0')) { $null = $sb.Append(('- battery at start of the repetition: {0}; at end: {1}' -f $meta['Battery0'], $meta['Battery1']) + $nl) }
      foreach ($mn in @($meta['Manual'])) { $null = $sb.Append('- done by hand: ' + $mn + $nl) }
    }
    $null = $sb.Append($nl)
  }
  if ($State.Tour.Count -gt 0) {
    $null = $sb.Append('## Tour screenshots (outside git)' + $nl + $nl + '| # | Screen | Result | File / note |' + $nl + '|---|---|---|---|' + $nl)
    $i = 0
    foreach ($t in $State.Tour) { $i++; $null = $sb.Append(('| {0} | {1} | {2} | {3} |' -f $i, $t.Screen, $t.Status, $t.Note) + $nl) }
    $null = $sb.Append($nl)
  }
  if ($State.Warnings.Count -gt 0) {
    $null = $sb.Append('## Warnings' + $nl + $nl)
    foreach ($w in $State.Warnings) { $null = $sb.Append('- ' + $w + $nl) }
    $null = $sb.Append($nl)
  }
  $null = $sb.Append('## Not judged here' + $nl + $nl)
  $null = $sb.Append('- Server cross-check (written script 4.4): copy requests.jsonl and uvicorn.log from the Mac mini and run backend/scripts/summarize_request_log.py; the server wins any disagreement.' + $nl)
  $null = $sb.Append('- Memory is recorded, not a pass criterion (written script 3.5).' + $nl)
  return $sb.ToString()
}

function New-ProvenanceMarkdown {
  param($J, $State, [string]$OutDir, [string]$PcNow, [string]$PhoneNow, [object[]]$OutsideFiles)
  $nl = "`n"
  $sb = New-Object System.Text.StringBuilder
  $dev = $State.Device
  $apk = $State.Apk
  $manualAny = $false
  foreach ($k in $State.RepMeta.Keys) { if (@($State.RepMeta[$k]['Manual']).Count -gt 0) { $manualAny = $true } }
  foreach ($t in $State.Tour) { if ($t.Status -eq 'by hand') { $manualAny = $true } }
  $null = $sb.Append('# PROVENANCE (DRAFT) ' + $script:Em + ' TC-PERF-001 / A9 in the product app' + $nl + $nl)
  $null = $sb.Append('Draft written by mobile/scripts/device_session.ps1. Fields marked TODO need the leader. The serial and every address are not recorded (DR-019).' + $nl + $nl)
  $op = '**The leader''s Claude session, driving the phone through `adb` (`input tap`, `input swipe`) at ' + $script:LeaderName + '''s request**. He connected the phone, was present, and did not touch it during the runs. The A9 run itself is the app''s own scripted 30-step pass (warm, then measured).'
  if ($manualAny) { $op += ' Some steps the automation could not do were done by hand by the leader; they are listed under Deviations.' }
  $null = $sb.Append('| Role | Person |' + $nl + '|---|---|' + $nl)
  $null = $sb.Append('| Operator | ' + $op + ' |' + $nl)
  $null = $sb.Append('| V1 owner | ' + $script:LeaderName + ' |' + $nl)
  $null = $sb.Append('| Reviewer | TODO (leader) |' + $nl + $nl)
  $null = $sb.Append('| Field | Value |' + $nl + '|---|---|' + $nl)
  $devText = 'unknown'
  if ($dev.Count -gt 0) {
    $devText = ('{0} {1} ({2}), Android {3} (SDK {4}), ABI {5}. Battery at start {6}. Animation scales (window/transition/animator): {7}. Refresh-rate settings: {8}. The serial is not recorded.' -f `
      $dev['Brand'], $dev['Model'], $dev['Name'], $dev['Android'], $dev['Sdk'], $dev['Abi'], $dev['BatteryStart'], $dev['Animation'], $dev['RefreshRate'])
  }
  $null = $sb.Append('| **Device** | ' + $devText + ' TODO: Motion smoothness setting (Settings > Display), read by eye |' + $nl)
  $null = $sb.Append('| **Network path** | TODO: Wi-Fi + ZeroTier, DIRECT from `zerotier-cli peers` on the Mac mini. No addresses are recorded |' + $nl)
  $apkText = 'unknown'
  if ($apk.Count -gt 0) {
    $apkText = ('`{0}`, SHA-256 `{1}` (verified by hashing the file on this PC: {2}), {3}, mode {4}, contract {5}, built from `{6}` (branch {7}), built_at {8}, versionName {9} on the phone. The build sidecar is in `apk_build_record.txt`.' -f `
      $apk['Name'], $apk['Sha256'], $apk['Verified'], $apk['BuildType'], $apk['Mode'], $apk['Contract'], $apk['GitSha'], $apk['GitBranch'], $apk['BuiltAt'], $apk['VersionName'])
  }
  $null = $sb.Append('| **APK** | ' + $apkText + ' |' + $nl)
  $null = $sb.Append('| **Backend** | ' + $State.BackendLine + ' TODO: deployed `main` commit of the backend |' + $nl)
  $pfRef = ''
  if ($State.PreflightLine -like 'PREFLIGHT*') { $pfRef = ' (`preflight.txt`)' }
  $null = $sb.Append('| **Preflight** | ' + $State.PreflightLine + $pfRef + ' |' + $nl)
  $labels = New-Object System.Collections.ArrayList
  foreach ($k in ($State.RepMeta.Keys | Sort-Object)) { $lb = $State.RepMeta[$k]['ViewerLabel']; if ($lb) { [void]$labels.Add($lb) } }
  $startText = ''
  if ($labels.Count -gt 0) { $startText = ' Viewer label at the start of the run: ' + (($labels | Select-Object -Unique) -join ' / ') + '.' }
  $null = $sb.Append('| **Case and scope** | ' + $J.CaseId + ', ' + $J.Scope + '.' + $startText + ' Ground-truth overlay as logged in CMW_RUN_START (`gt_overlay`). |' + $nl)
  $windows = New-Object System.Collections.ArrayList
  foreach ($pr in $J.PerRep) {
    if ($null -eq $pr.Judged) { continue }
    $f = $pr.Judged.Facts
    [void]$windows.Add(('rep {0}: warm {1}; measured {2}' -f $pr.K, (Format-Window $f.Windows['warm']), (Format-Window $f.Windows['measured'])))
  }
  $null = $sb.Append('| **Run windows (phone clock, MM-DD HH:MM:SS.mmm; +07 if the phone is on Vietnam time)** | ' + ($windows -join ' / ') + ' |' + $nl + $nl)
  $null = $sb.Append('## Verdict' + $nl + $nl + '**' + $J.Overall.Line + '**' + $nl + $nl)
  $null = $sb.Append('| Rep | A9:measured n / p50 / p95 / max (ms) | T1 | T2 | T3 | T4 | memory M0 -> M1: TOTAL PSS / Native Heap / Graphics (KB) |' + $nl + '|---|---|---|---|---|---|---|' + $nl)
  foreach ($pr in $J.PerRep) {
    if ($null -eq $pr.Judged) { continue }
    $e = $pr.Judged.Eval; $m = $e.Measured
    $mt = 'n/a'; if ($null -ne $m) { $mt = '{0} / {1} / {2} / {3}' -f $m.N, $m.P50, $m.P95, $m.Max }
    $mem = 'n/a'
    $m0 = Join-Path $OutDir ("A9_rep{0}_meminfo_M0.txt" -f $pr.K); $m1 = Join-Path $OutDir ("A9_rep{0}_meminfo_M1.txt" -f $pr.K)
    if ((Test-Path -LiteralPath $m0) -and (Test-Path -LiteralPath $m1)) {
      $a = ConvertFrom-Meminfo (Read-SharedText $m0); $b = ConvertFrom-Meminfo (Read-SharedText $m1)
      $mem = '{0} -> {1} / {2} -> {3} / {4} -> {5}' -f $a.TotalPssKb, $b.TotalPssKb, $a.NativeHeapKb, $b.NativeHeapKb, $a.GraphicsKb, $b.GraphicsKb
    }
    $c = { param($x) if ($x.Pass) { 'pass' } else { 'FAIL' } }
    $null = $sb.Append(('| {0} | {1} | {2} | {3} | {4} | {5} | {6} |' -f $pr.K, $mt, (& $c $e.T1), (& $c $e.T2), (& $c $e.T3), (& $c $e.T4), $mem) + $nl)
  }
  if ($null -ne $J.Pooled -and $null -ne $J.Pooled.Measured) {
    $pm = $J.Pooled.Measured
    $null = $sb.Append(('| pooled | {0} / {1} / {2} / {3} | | | | | |' -f $pm.N, $pm.P50, $pm.P95, $pm.Max) + $nl)
  }
  $null = $sb.Append($nl + '## Deviations, recorded' + $nl + $nl)
  $dn = 0
  foreach ($d in $State.Deviations) { $dn++; $null = $sb.Append(('{0}. {1}' -f $dn, $d) + $nl) }
  if ($manualAny) {
    foreach ($k in $State.RepMeta.Keys) { foreach ($m in @($State.RepMeta[$k]['Manual'])) { $dn++; $null = $sb.Append(('{0}. Repetition {1}: step done by hand by the leader: {2}' -f $dn, $k, $m) + $nl) } }
  }
  $dn++
  $null = $sb.Append(('{0}. Clocks: PC time {1}; phone time {2} (read at the start of the session). The phone and the server are the reference; the PC clock is not.' -f $dn, $PcNow, $PhoneNow) + $nl)
  $dn++
  $null = $sb.Append(('{0}. Memory is recorded only at M0 and M1 and is not a criterion.' -f $dn) + $nl + $nl)
  $null = $sb.Append('## Files' + $nl + $nl + '| File | What |' + $nl + '|---|---|' + $nl)
  $null = $sb.Append('| `A9_rep{1,2,3}_logcat.txt` | each repetition''s streamed `ReactNativeJS` log (the app never logs a URL, host or payload) |' + $nl)
  $null = $sb.Append('| `A9_rep{1,2,3}_meminfo_M0.txt`, `..._M1.txt` | `dumpsys meminfo` before / after each run |' + $nl)
  $null = $sb.Append('| `slice_timing_rep{1,2,3}.txt`, `slice_timing_all_reps.txt`, `l4_report_rep{1,2,3}.txt` | report tool output |' + $nl)
  $null = $sb.Append('| `apk_build_record.txt`, `preflight.txt`, `SUMMARY.md` | build sidecar, preflight lines, this session''s summary |' + $nl + $nl)
  $null = $sb.Append('## Kept outside git' + $nl + $nl + '| File | Bytes | SHA-256 |' + $nl + '|---|---:|---|' + $nl)
  foreach ($f in @($OutsideFiles)) { $null = $sb.Append(('| `{0}` | {1} | `{2}` |' -f $f.Name, $f.Bytes, $f.Sha256) + $nl) }
  return $sb.ToString()
}
