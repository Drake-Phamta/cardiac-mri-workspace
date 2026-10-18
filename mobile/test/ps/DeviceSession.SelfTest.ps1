# DeviceSession.SelfTest.ps1 - offline checks of mobile/scripts/device_session.ps1 and its two libraries.
#
#   powershell -ExecutionPolicy Bypass -File mobile\scripts\device_session.ps1 -SelfTest
#   Invoke-Pester mobile\test\ps            (Pester 3.4 or later; wraps the same checks)
#
# No phone, no network, no write into the repository: fixtures are generated in memory or in
# %TEMP%\cmw_device_session_selftest (files are overwritten on each run, nothing is deleted).
# The checks: the uiautomator dump parser and the node lookup on a synthetic dump (SCR-02, SCR-03 and the A9 dialogs);
# the write-button guard; argument quoting; secret redaction; the judge (T1-T4) on a synthetic A9 capture that passes
# and on captures that must fail each check; the judge on the committed L4 capture, which must report "no A9 rows";
# the pooled run, SUMMARY.md and PROVENANCE_DRAFT.md; the redaction scan; the verdict wording.
# Windows PowerShell 5.1, ASCII only.

Set-StrictMode -Version 2

# ---------------------------------------------------------------------------------------------------------------
# Fixtures: a synthetic uiautomator dump
# ---------------------------------------------------------------------------------------------------------------

function New-FxNode {
  # One <node/>. Text and desc may hold {MID} (U+00B7) and {LAQ} (U+2039) as XML numeric entities.
  param([string]$Text = '', [string]$Desc = '', [string]$Class = 'android.widget.TextView', [int[]]$B = @(0, 0, 0, 0),
    [bool]$Clickable = $false, [bool]$Scrollable = $false, [bool]$Enabled = $true, [string]$Pkg = 'com.cardiacmri.workspace', [string]$ResId = '')
  $esc = {
    param($s)
    $e = [System.Security.SecurityElement]::Escape($s)
    $e = $e.Replace('{MID}', '&#183;').Replace('{LAQ}', '&#8249;').Replace('{NL}', '&#10;')
    return $e
  }
  return ('<node index="0" text="{0}" resource-id="{1}" class="{2}" package="{3}" content-desc="{4}" checkable="false" checked="false" clickable="{5}" enabled="{6}" focusable="{5}" focused="false" scrollable="{7}" long-clickable="false" password="false" selected="false" bounds="[{8},{9}][{10},{11}]" />' -f `
      (& $esc $Text), $ResId, $Class, $Pkg, (& $esc $Desc), $Clickable.ToString().ToLowerInvariant(), $Enabled.ToString().ToLowerInvariant(), $Scrollable.ToString().ToLowerInvariant(), $B[0], $B[1], $B[2], $B[3])
}

function New-FxXml {
  param([string[]]$Nodes)
  return ("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation=`"0`">" + ($Nodes -join '') + '</hierarchy>')
}

function New-FxChrome {
  # Header (LIVE badge, optional Back) and the four tabs at the bottom of a 1080 x 2340 screen.
  param([bool]$Back = $false)
  $n = @()
  $n += New-FxNode -Class 'android.widget.FrameLayout' -B 0, 0, 1080, 2340
  if ($Back) {
    $n += New-FxNode -Desc 'Back' -Class 'android.view.ViewGroup' -B 10, 130, 220, 250 -Clickable $true
    $n += New-FxNode -Text '{LAQ} Back' -B 40, 160, 190, 220
  }
  $n += New-FxNode -Text 'SCR-03 {MID} V1' -B 300, 140, 780, 180
  $n += New-FxNode -Text 'Case Explorer' -B 300, 180, 780, 240
  $n += New-FxNode -Desc 'LIVE {MID} backend http://<configured> {MID} study STUDY_LA_001' -Class 'android.view.ViewGroup' -B 880, 130, 1070, 250 -Clickable $true
  $n += New-FxNode -Text 'LIVE' -B 920, 170, 1030, 210
  $x = 0
  foreach ($t in @(@('Study', 'SCR-01'), @('Cases', 'SCR-02'), @('Experiments', 'SCR-07'), @('Findings', 'SCR-08'))) {
    $n += New-FxNode -Class 'android.view.ViewGroup' -B $x, 2150, ($x + 270), 2340 -Clickable $true
    $n += New-FxNode -Text $t[0] -B ($x + 60), 2190, ($x + 210), 2240
    $n += New-FxNode -Text $t[1] -B ($x + 90), 2250, ($x + 180), 2290
    $x += 270
  }
  return $n
}

function New-FxCaseList {
  $n = New-FxChrome
  $n += New-FxNode -Text 'Study STUDY_LA_001' -B 40, 270, 600, 320
  $n += New-FxNode -Text '' -Desc 'Search case ID' -Class 'android.widget.EditText' -B 40, 330, 1040, 450 -Clickable $true
  $n += New-FxNode -Text '21 cases on this page {MID} 20 evaluation {MID} 1 inference & review' -B 40, 600, 1040, 650
  $y = 670
  foreach ($c in @(@('CASE_0042', 'Evaluation'), @('CASE_0061', 'Evaluation'), @('CASE_0099', 'Inference & review'))) {
    $n += New-FxNode -Desc ($c[0] + ', ' + $c[1]) -Class 'android.view.ViewGroup' -B 40, $y, 1040, ($y + 200) -Clickable $true
    $n += New-FxNode -Text $c[0] -B 70, ($y + 20), 500, ($y + 80)
    $n += New-FxNode -Text $c[1] -B 70, ($y + 100), 500, ($y + 150)
    $y += 220
  }
  $n += New-FxNode -Class 'android.widget.ScrollView' -B 0, 560, 1080, 2150 -Scrollable $true
  return $n
}

function New-FxExplorer {
  param([string]$Gt = 'OFF')
  $n = New-FxChrome -Back $false
  $n += New-FxNode -Text 'CASE_0061' -B 40, 270, 400, 330
  $n += New-FxNode -Text 'No analysis run for this case - MRI and ground truth only' -B 40, 340, 1040, 400
  $n += New-FxNode -Text 'slice 45 / 88  (z = 44)' -Class 'android.view.ViewGroup' -B 200, 1600, 880, 1670 -Clickable $true
  $n += New-FxNode -Desc 'slice 45 / 88  (z = 44)' -Class 'android.view.View' -B 200, 1690, 880, 1800
  $n += New-FxNode -Class 'android.widget.ScrollView' -B 0, 1810, 1080, 2150 -Scrollable $true
  $n += New-FxNode -Text 'Overlays' -B 60, 1830, 400, 1880
  $n += New-FxNode -Text ('Ground truth: ' + $Gt) -Class 'android.view.ViewGroup' -B 60, 1950, 1000, 2040 -Clickable $true
  return $n
}

function New-FxDialog {
  param([string]$Kind = 'menu')
  $n = New-FxExplorer -Gt 'ON'
  if ($Kind -eq 'menu') {
    $n += New-FxNode -Text 'Scripted slice navigation' -ResId 'android:id/alertTitle' -B 150, 800, 930, 860
    $n += New-FxNode -Text 'CANCEL' -Class 'android.widget.Button' -B 200, 1100, 500, 1180 -Clickable $true
    $n += New-FxNode -Text 'A9 30-STEP' -Class 'android.widget.Button' -B 200, 1200, 880, 1280 -Clickable $true
    $n += New-FxNode -Text 'L4 15 + 15' -Class 'android.widget.Button' -B 200, 1300, 880, 1380 -Clickable $true
  } else {
    $n += New-FxNode -Text 'A9 finished' -ResId 'android:id/alertTitle' -B 150, 800, 930, 860
    $n += New-FxNode -Text 'OK' -Class 'android.widget.Button' -B 700, 1100, 900, 1180 -Clickable $true
  }
  return $n
}

# ---------------------------------------------------------------------------------------------------------------
# Fixtures: a synthetic A9 capture, as `adb logcat -v threadtime -s ReactNativeJS:V` writes it
# ---------------------------------------------------------------------------------------------------------------

function Get-NavSequence {
  # mobile/src/verticals/v1/explorer.mjs buildNavSequence, for nz slices
  param([int]$Nz = 88)
  $nav16 = 1, 2, 3, 4, 5, 6, 7, 8, 7, 6, 5, 4, 3, 2, 1, 0, 8, 0, 15, 4, 11, 2, 13, 6, 7, 8, 9, 10, 11, 12
  $scale = ($Nz - 1) / 15.0
  $out = New-Object System.Collections.Generic.List[int]
  $prev = 0; $pos = 0
  foreach ($t in $nav16) {
    $d16 = $t - $prev
    if ([Math]::Abs($d16) -eq 1) { $d = $d16 } else { $d = [int][Math]::Round($d16 * $scale, [MidpointRounding]::AwayFromZero) }
    $pos = [Math]::Max(0, [Math]::Min($Nz - 1, $pos + $d))
    $out.Add($pos)
    $prev = $t
  }
  return $out.ToArray()
}

function New-SyntheticA9Log {
  # Variants: pass | slow | miss | totals | dev | short | timeout | r1 | fixture | hang
  param([string]$Variant = 'pass', [int]$Rep = 1, [int]$Nz = 88)
  $lines = New-Object System.Collections.Generic.List[string]
  $t = [datetime]'2026-10-18T09:41:10'
  $stamp = { param($ms) ('{0} 12345 12400 I ReactNativeJS: ' -f ($script:T0.AddMilliseconds($ms).ToString('MM-dd HH:mm:ss.fff'))) }
  $script:T0 = $t.AddMinutes(($Rep - 1) * 6)
  $ms = 0
  $dev = 'false'; $mode = 'live'
  if ($Variant -eq 'dev') { $dev = 'true' }
  if ($Variant -eq 'fixture') { $mode = 'fixture' }
  $seq = Get-NavSequence -Nz $Nz
  $steps = @(0) + $seq
  $seqJson = '[' + (($seq | ForEach-Object { $_ }) -join ',') + ']'
  $lines.Add('--------- beginning of main')
  $lines.Add((& $stamp $ms) + 'Running "main"'); $ms += 900
  $lines.Add((& $stamp $ms) + 'CMW_HTTP {"endpointId":"case_list","url":"/api/v1/studies/STUDY_LA_001/cases","status":200,"ms":412,"bytes":1832}'); $ms += 800
  $gseq = 1
  $seen = New-Object System.Collections.Generic.HashSet[int]
  $newReqs = '[{"endpoint":"ground_truth_slice_get","bytes":517,"ms":120,"status":200},{"endpoint":"mri_slice_get","bytes":567,"ms":130,"status":200},{"endpoint":"artifact:mask","bytes":745,"ms":90,"status":200},{"endpoint":"artifact:mri","bytes":155389,"ms":140,"status":200}]'
  $requests = 0; $bytes = 0
  if ($Variant -ne 'fixture') {
    $lines.Add((& $stamp $ms) + ('CMW_GESTURE {{"seq":{0},"kind":"open","case":"CASE_0061","from":null,"to":44,"requests":{1},"cache_hit":false,"bytes_total":157218,"max_request_bytes":155389,"ms":520,"outcome":"shown"}}' -f $gseq, $newReqs)); $ms += 600
    $gseq++; [void]$seen.Add(44); $requests += 4; $bytes += 157218
    # the Ground truth toggle: its mask is fetched with no gesture open (unattributed)
    $requests += 1; $bytes += 745
  }
  $unattributed = 1
  $slow = @{}
  if ($Variant -eq 'slow') { foreach ($i in 3, 9, 14, 20, 25, 28) { $slow[$i] = 250 + $i } }
  $hung = $false
  foreach ($passName in 'warm', 'measured') {
    if ($hung) { break }
    $start = '{{"run":"A9","pass":"{0}","steps":{1},"sequence":{2},"nz":{3},"case_id":"CASE_0061","run_id":null,"variant":null,"has_run":false,"gt_declared":true,"gt_overlay":true,"prediction_overlay":false,"dev":{4},"mode":"{5}"}}' -f $passName, $steps.Count, $seqJson, $Nz, $dev, $mode
    $lines.Add((& $stamp $ms) + 'CMW_RUN_START ' + $start); $ms += 5
    $stepsHere = $steps
    if ($Variant -eq 'short' -and $passName -eq 'measured') { $stepsHere = $steps[0..29] }
    $i = 0
    $from = 44
    foreach ($z in $stepsHere) {
      $cached = $seen.Contains($z) -or ($passName -eq 'measured')
      if ($Variant -eq 'miss' -and $passName -eq 'measured' -and $i -eq 12) { $cached = $false }
      $reqJson = '[]'; $bt = 0; $mx = 0
      if (-not $cached) { $reqJson = $newReqs; $bt = 157218; $mx = 155389; $requests += 4; $bytes += $bt }
      if ($Variant -eq 'r1' -and $passName -eq 'warm' -and $i -eq 5) { $reqJson = '[{"endpoint":"case_get","bytes":362,"ms":80,"status":200}]'; $bt = 362; $mx = 362; $requests += 1; $bytes += 362; $cached = $false }
      [void]$seen.Add($z)
      if ($Variant -eq 'hang' -and $passName -eq 'warm' -and $i -eq 4) { $ms += 400; $hung = $true; break }
      if ($Variant -ne 'fixture') {
        $ch = 'false'; if ($cached) { $ch = 'true' }
        $lines.Add((& $stamp $ms) + ('CMW_GESTURE {{"seq":{0},"kind":"slice","case":"CASE_0061","from":{1},"to":{2},"requests":{3},"cache_hit":{4},"bytes_total":{5},"max_request_bytes":{6},"ms":{7},"outcome":"shown"}}' -f $gseq, $from, $z, $reqJson, $ch, $bt, $mx, 80))
        $gseq++
      }
      # ms_to_frame: cached slices are fast; a new slice is not
      $frame = 30 + (($i * 7 + $Rep * 3) % 40)
      if (-not $cached) { $frame = 420 + (($i * 13) % 90) }
      if ($passName -eq 'measured' -and $slow.ContainsKey($i)) { $frame = $slow[$i] }
      $how = 'image'; if ($Variant -eq 'fixture') { $how = 'no-image' }
      $lines.Add((& $stamp ($ms + 40)) + ('CMW_SLICE {{"slice":{0},"ms_to_data":{1},"ms_to_image":{2},"ms_to_frame":{3},"meta_cached":{4},"image_seen_before":{5},"how":"{6}","pass":"A9:{7}","dev":{8},"mode":"{9}"}}' -f $z, ($frame - 20), ($frame - 4), ($frame + 0.5).ToString('0.0#', [System.Globalization.CultureInfo]::InvariantCulture), $cached.ToString().ToLowerInvariant(), $cached.ToString().ToLowerInvariant(), $how, $passName, $dev, $mode))
      if ($Variant -eq 'timeout' -and $passName -eq 'measured' -and $i -eq 7) { $lines.Add((& $stamp ($ms + 45)) + ('CMW_STEP_TIMEOUT {{"slice":{0},"waited_ms":6000}}' -f $z)) }
      $from = $z
      $ms += 400
      $i++
    }
    if ($hung) { break }
    $lines.Add((& $stamp $ms) + ('CMW_RUN_END {{"run":"A9","pass":"{0}","steps":{1}}}' -f $passName, $stepsHere.Count))
    $tot = '{{"run":"A9","pass":"{0}","gestures":{1},"requests":{2},"bytes":{3},"unattributed":{4},"late":0}}' -f $passName, ($gseq - 1), $requests, $bytes, $unattributed
    if ($Variant -eq 'totals' -and $passName -eq 'measured') { $tot = '{{"run":"A9","pass":"{0}","gestures":{1},"requests":{2},"bytes":{3},"unattributed":{4},"late":0}}' -f $passName, ($gseq - 1), ($requests + 3), ($bytes + 3000), $unattributed }
    $lines.Add((& $stamp ($ms + 1)) + 'CMW_NET_TOTALS ' + $tot)
    $ms += 800
  }
  return (($lines.ToArray()) -join "`n") + "`n"
}

function New-FxMeminfo {
  param([int]$Pss = 200000, [int]$Native = 40000, [int]$Gfx = 80000)
  return @"
Applications Memory Usage (in Kilobytes):
Uptime: 5126345 Realtime: 5126345

** MEMINFO in pid 12345 [com.cardiacmri.workspace] **
                   Pss  Private  Private  SwapPss      Rss     Heap     Heap     Heap
                 Total    Dirty    Clean    Dirty    Total     Size    Alloc     Free
                ------   ------   ------   ------   ------   ------   ------   ------
  Native Heap    $Native    39000        0        0    50000    90000    60000    30000
  Dalvik Heap    30000    29000        0        0    40000    60000    30000    30000
        TOTAL   $Pss   150000    30000        0   300000   150000    90000    60000

 App Summary
                       Pss(KB)                        Rss(KB)
                        ------                         ------
           Java Heap:    30000                          40000
         Native Heap:    $Native                          50000
                Code:    20000                          40000
               Stack:      500                            500
            Graphics:    $Gfx                          80000
       Private Other:    10000
              System:    19500
             Unknown:                                   20000

           TOTAL PSS:   $Pss            TOTAL RSS:   300000       TOTAL SWAP PSS:        0
"@
}

# ---------------------------------------------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------------------------------------------

function Assert-True {
  param($Condition, [string]$Message = 'assertion failed')
  if (-not $Condition) { throw $Message }
}

function Assert-Equal {
  param($Actual, $Expected, [string]$Message = '')
  if ($Actual -ne $Expected) { throw ("{0}expected '{1}', got '{2}'" -f $(if ($Message) { $Message + ': ' } else { '' }), $Expected, $Actual) }
}

function Invoke-FxJudge {
  # Writes the synthetic capture of a variant to the temp folder and runs the real report tools on it.
  param([string]$Variant, [int]$Rep = 1)
  $f = Join-Path $script:ST.Tmp ("synthetic_{0}_{1}.txt" -f $Variant, $Rep)
  Write-TextFile -Path $f -Text (New-SyntheticA9Log -Variant $Variant -Rep $Rep)
  return Invoke-RepJudge -LogPath $f -Node (Find-NodeExe) -MobileDir $script:ST.Mobile -K $Rep -TimingOut '' -L4Out ''
}

function Get-DeviceSessionSelfChecks {
  param([string]$ScriptsDir)
  $mobile = Split-Path -Parent $ScriptsDir
  $repo = Split-Path -Parent $mobile
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) 'cmw_device_session_selftest'
  if (-not (Test-Path -LiteralPath $tmp)) { [void](New-Item -ItemType Directory -Path $tmp) }
  $script:ST = @{ Scripts = $ScriptsDir; Mobile = $mobile; Repo = $repo; Tmp = $tmp }
  $c = New-Object System.Collections.ArrayList

  function Add-Check { param([string]$Name, [scriptblock]$Block) [void]$c.Add(@{ Name = $Name; Block = $Block }) }

  # ---- uiautomator dump parser and lookup --------------------------------------------------------------------
  Add-Check 'parser: nodes, entities, bounds, centre' {
    $nodes = ConvertFrom-UiXml (New-FxXml (New-FxCaseList))
    Assert-True ($nodes.Count -gt 15) 'too few nodes'
    $badge = @($nodes | Where-Object { $_.DescN -like 'LIVE*' })[0]
    Assert-True ($badge.DescN.Contains([string][char]0xB7)) 'numeric entity &#183; not decoded'
    Assert-Equal $badge.CX 975 'badge centre x'
    Assert-Equal $badge.CY 190 'badge centre y'
    $amp = ConvertFrom-UiXml (New-FxXml @(New-FxNode -Text 'a & b < c "q"' -B 0, 0, 10, 10))
    Assert-Equal $amp[0].Text 'a & b < c "q"' 'xml escapes'
  }
  Add-Check 'parser: empty and garbage input give no nodes' {
    Assert-Equal @(ConvertFrom-UiXml '').Count 0
    Assert-Equal @(ConvertFrom-UiXml 'ERROR: could not get idle state.').Count 0
  }
  Add-Check 'lookup: the Cases tab is the bottom node, not a heading with the same word' {
    $x = New-FxCaseList + @(New-FxNode -Text 'Cases' -B 40, 700, 300, 760)
    $nodes = ConvertFrom-UiXml (New-FxXml $x)
    $n = Find-UiNode -Nodes $nodes -Text 'Cases' -NoSubstring -YMin 0.86 -Last -Package 'com.cardiacmri.workspace'
    Assert-True ($null -ne $n) 'tab not found'
    Assert-True ($n.CY -gt 2150) 'picked a node that is not in the tab bar'
  }
  Add-Check 'lookup: case-insensitive, whitespace-normalised ("A9 30-STEP")' {
    $nodes = ConvertFrom-UiXml (New-FxXml (New-FxDialog 'menu'))
    $n = Find-UiNode -Nodes $nodes -Text 'A9 30-step' -NoSubstring -Package 'com.cardiacmri.workspace'
    Assert-True ($null -ne $n) 'A9 30-step not found'
    Assert-Equal $n.TextN 'A9 30-STEP'
    Assert-Equal $n.CX 540 'button centre x'
    $l4 = Find-UiNode -Nodes $nodes -Text 'A9 30-step' -NoSubstring
    Assert-True ($l4.TextN -ne 'L4 15 + 15') 'matched the wrong button'
  }
  Add-Check 'lookup: the slice label is the text node, not the slider with the same content-desc' {
    $nodes = ConvertFrom-UiXml (New-FxXml (New-FxExplorer))
    $n = Find-UiNode -Nodes $nodes -Regex '^slice \d+ / \d+' -Package 'com.cardiacmri.workspace'
    Assert-Equal $n.CY 1635 'label centre y (the text, not the track at 1745)'
    Assert-Equal (@(Find-UiNodes -Nodes $nodes -Regex '^slice 45 / 88').Count) 2 'both candidates are listed'
  }
  Add-Check 'lookup: the case row by content-desc prefix' {
    $nodes = ConvertFrom-UiXml (New-FxXml (New-FxCaseList))
    $n = Find-UiNode -Nodes $nodes -Regex '^CASE_0061(,|\s|$)' -YMax 0.88
    Assert-True ($null -ne $n) 'row not found'
    Assert-True ($n.CY -ge 890 -and $n.CY -le 1090) ('picked a node outside the row of CASE_0061: y ' + $n.CY)
    $byDesc = @(Find-UiNodes -Nodes $nodes -Regex '^CASE_0061(,|\s|$)' | Where-Object { $_.DescN -like 'CASE_0061, Evaluation' })
    Assert-Equal $byDesc.Count 1 'the content-desc of the row is matched too'
    Assert-True ($null -eq (Find-UiNode -Nodes $nodes -Regex '^CASE_0062(,|\s|$)')) 'a case that is not listed was found'
  }
  Add-Check 'lookup: a toggle reads OFF then ON' {
    $off = ConvertFrom-UiXml (New-FxXml (New-FxExplorer 'OFF'))
    $on = ConvertFrom-UiXml (New-FxXml (New-FxExplorer 'ON'))
    Assert-True (Test-UiText -Nodes $off -Regex '^Ground truth: OFF$')
    Assert-True (-not (Test-UiText -Nodes $off -Regex '^Ground truth: ON$'))
    Assert-True (Test-UiText -Nodes $on -Regex '^Ground truth: ON$')
  }
  Add-Check 'lookup: the largest scrollable node, and the package filter' {
    $nodes = ConvertFrom-UiXml (New-FxXml ((New-FxExplorer) + @(New-FxNode -Text 'OK' -Pkg 'com.android.systemui' -B 0, 0, 100, 100)))
    $sc = Get-UiScrollable -Nodes $nodes -Package 'com.cardiacmri.workspace'
    Assert-True ($null -ne $sc) 'no scrollable'
    Assert-Equal $sc.Y1 1810
    Assert-True ($null -eq (Find-UiNode -Nodes $nodes -Text 'OK' -NoSubstring -Package 'com.cardiacmri.workspace')) 'matched a node of another package'
  }
  Add-Check 'guard: a button that writes to the backend is never tapped' {
    foreach ($label in 'Save', 'Accept', 'Flag', 'Mark corrected', 'Resolve', 'Create finding', 'Reset') {
      $n = (ConvertFrom-UiXml (New-FxXml @(New-FxNode -Text $label -B 0, 0, 100, 100 -Clickable $true)))[0]
      $threw = $false
      try { Invoke-UiTapNode -Node $n } catch { $threw = ($_.Exception.Message -like 'refused to tap*') }
      Assert-True $threw ("tapping '$label' was not refused")
    }
    $ok = (ConvertFrom-UiXml (New-FxXml @(New-FxNode -Text 'Review / correct (SCR-06)' -B 0, 0, 100, 100)))[0]
    Assert-True (-not (Test-WriteAction $ok)) 'the entry that opens the review screen must be allowed'
  }
  Add-Check 'process: argument quoting follows the Windows rules' {
    Assert-Equal (ConvertTo-ArgString @('a', 'b c', '', 'd"e')) 'a "b c" "" "d\"e"'
    Assert-Equal (ConvertTo-ArgString @('C:\x y\')) '"C:\x y\\"'
    Assert-Equal (ConvertTo-ArgString @('shell', 'input', 'tap', '10', '20')) 'shell input tap 10 20'
  }
  Add-Check 'process: Invoke-Native returns stdout, stderr, exit code and obeys the time limit' {
    $r = Invoke-Native -FilePath (Get-Command powershell.exe).Source -ArgumentList @('-NoProfile', '-Command', 'Write-Output hello; [Console]::Error.WriteLine("oops"); exit 3') -TimeoutSec 60
    Assert-Equal $r.ExitCode 3
    Assert-True ($r.StdOut -match 'hello') 'stdout lost'
    Assert-True ($r.StdErr -match 'oops') 'stderr lost'
    $t = Get-Date
    $r2 = Invoke-Native -FilePath (Get-Command powershell.exe).Source -ArgumentList @('-NoProfile', '-Command', 'Start-Sleep -Seconds 30') -TimeoutSec 2
    Assert-True $r2.TimedOut 'no time-out'
    Assert-True (((Get-Date) - $t).TotalSeconds -lt 20) 'the time limit was not applied'
  }
  Add-Check 'redaction: the serial, private IPv4 addresses and the profile path never reach a log line' {
    $saved = $script:Ctx.Secrets
    $script:Ctx.Secrets = New-Object System.Collections.ArrayList
    try {
      Add-Secret -Value 'R58M12ABCDE' -Mask '<device-serial>'
      # Synthetic private addresses are joined at run time: no committed line carries a dotted quad (DR-019 CI scan).
      $ipA = (192, 168, 1, 20) -join '.'; $ipB = (10, 147, 17, 5) -join '.'; $ipC = (172, 22, 0, 9) -join '.'
      $t = Hide-Secret ('adb -s R58M12ABCDE shell; backend ' + $ipA + ' and ' + $ipB + ' and ' + $ipC + '; ' + $env:USERPROFILE + '\x')
      Assert-True ($t -notmatch 'R58M12ABCDE') 'serial leaked'
      Assert-True ($t -match '<device-serial>') 'serial not masked'
      Assert-True ($t -notmatch '192\.168|10\.147|172\.22') 'private address leaked'
      Assert-True ($t -match '<home>') 'profile path leaked'
    } finally { $script:Ctx.Secrets = $saved }
  }

  # ---- the judge ---------------------------------------------------------------------------------------------
  Add-Check 'judge: the synthetic capture has the shape of the written script (62 / 63 / 2 / 2, 22 distinct slices)' {
    $text = New-SyntheticA9Log -Variant pass
    $cnt = Get-TagCounts $text
    Assert-Equal $cnt['CMW_SLICE'] 62; Assert-Equal $cnt['CMW_GESTURE'] 63; Assert-Equal $cnt['CMW_RUN_END'] 2; Assert-Equal $cnt['CMW_NET_TOTALS'] 2
    $seq = Get-NavSequence -Nz 88
    Assert-Equal $seq.Count 30
    Assert-Equal (@($seq | Sort-Object -Unique).Count + 0) 22 'distinct slices (without the opening slice 0 jump)'
    Assert-Equal ($seq[0..7] -join ',') '1,2,3,4,5,6,7,8'
    Assert-Equal ($seq[16..23] -join ',') '46,0,87,23,64,12,76,35'
  }
  Add-Check 'judge: a good run PASSES T1-T4' {
    $j = Invoke-FxJudge 'pass'
    $e = $j.Eval
    Assert-Equal $e.Verdict 'PASS' ('T1 ' + $e.T1.Detail + ' | T2 ' + $e.T2.Detail + ' | T3 ' + $e.T3.Detail + ' | T4 ' + $e.T4.Detail)
    Assert-Equal $e.Measured.N 31
    Assert-True ($e.Measured.P95 -le 200) 'p95'
    Assert-True ($e.Warm.P95 -gt 200) 'the warm pass fetches, it is slower and is not judged'
    Assert-Equal $j.L4.Verdict 'CANNOT_JUDGE' 'the expected shape for an A9 capture'
  }
  Add-Check 'judge: p95 above 200 ms fails T1 only' {
    $e = (Invoke-FxJudge 'slow').Eval
    Assert-Equal $e.Verdict 'FAIL'
    Assert-Equal ($e.Failed -join '+') 'T1'
    Assert-True ($e.Measured.P95 -gt 200) 'p95 should be above 200'
  }
  Add-Check 'judge: a measured cache miss fails T3 (and says which)' {
    $e = (Invoke-FxJudge 'miss').Eval
    Assert-Equal $e.Verdict 'FAIL'
    Assert-True ($e.Failed -contains 'T3') 'T3 should fail'
    Assert-True ($e.T3.Detail -match 'not cache hits') $e.T3.Detail
  }
  Add-Check 'judge: totals that change between the passes fail T3' {
    $e = (Invoke-FxJudge 'totals').Eval
    Assert-Equal ($e.Failed -join '+') 'T3'
    Assert-True ($e.T3.Detail -match 'totals changed') $e.T3.Detail
  }
  Add-Check 'judge: a CMW_STEP_TIMEOUT in the measured pass fails T3' {
    $e = (Invoke-FxJudge 'timeout').Eval
    Assert-True ($e.Failed -contains 'T3') 'T3 should fail'
    Assert-True ($e.T3.Detail -match 'CMW_STEP_TIMEOUT') $e.T3.Detail
  }
  Add-Check 'judge: a debug build fails T2 (the DEV row is never mixed in)' {
    $e = (Invoke-FxJudge 'dev').Eval
    Assert-True ($e.Failed -contains 'T2') 'T2 should fail'
    Assert-True ($e.T2.Detail -match 'DEV build') $e.T2.Detail
    Assert-True ($e.Failed -contains 'T1') 'with only DEV rows there is no A9:measured row for T1'
  }
  Add-Check 'judge: 30 measured steps instead of 31 cannot pass' {
    $e = (Invoke-FxJudge 'short').Eval
    Assert-True ($e.Failed -contains 'T1') 'n 30 must fail T1'
    Assert-True ($e.T1.Detail -match 'n 30') $e.T1.Detail
  }
  Add-Check 'judge: a per-slice rule broken in the capture fails T4' {
    $j = Invoke-FxJudge 'r1'
    Assert-True ($j.Eval.Failed -contains 'T4') ('T4 should fail: ' + $j.Eval.T4.Detail)
    Assert-True ($j.Eval.T4.Detail -match 'R1') $j.Eval.T4.Detail
  }
  Add-Check 'judge: a run that started and never finished is NOT MEASURED, not a failure of T1-T3' {
    $j = Invoke-FxJudge 'hang'
    $e = $j.Eval
    Assert-Equal $e.Verdict 'NOT MEASURED'
    Assert-True $e.Started 'the run did start'
    $v = Get-OverallVerdict -Evaluations @($e) -Expected 3 -CaseId 'CASE_0061' -Scope 'x'
    Assert-Equal $v.Key 'NOT MEASURED'
    Assert-True ($v.Line -match 'never finished') $v.Line
  }
  Add-Check 'judge: the committed L4 capture gives no A9 rows (NOT MEASURED), not a crash' {
    $l4 = Join-Path $script:ST.Repo 'spikes\spike_a_2d\EVIDENCE_RAW\l4_product_app_20261001T205817+0700\S1_L4_logcat.txt'
    if (-not (Test-Path -LiteralPath $l4)) { return }     # a checkout without the evidence folder: nothing to check
    $j = Invoke-RepJudge -LogPath $l4 -Node (Find-NodeExe) -MobileDir $script:ST.Mobile -K 1 -TimingOut '' -L4Out ''
    $e = $j.Eval
    Assert-Equal $e.Verdict 'NOT MEASURED'
    Assert-True (-not $e.A9Present) 'no A9 expected'
    Assert-True ($e.T1.Detail -match 'no A9:measured row') $e.T1.Detail
    Assert-True ($e.T1.Detail -match 'L4:new-15' -and $e.T1.Detail -match 'L4:revisit-15') ('the L4 rows should be named: ' + $e.T1.Detail)
    $v = Get-OverallVerdict -Evaluations @($e) -Expected 3 -CaseId 'CASE_0061' -Scope 'x'
    Assert-Equal $v.Key 'NOT MEASURED'
    Assert-True ($v.Line -match 'no A9 rows') $v.Line
  }
  Add-Check 'verdict wording: PASS, FAIL, INCOMPLETE, NOT MEASURED, rehearsal' {
    $ok = { param($k) [pscustomobject]@{ K = $k; Verdict = 'PASS'; Failed = @(); A9Present = $true } }
    $bad = { param($k) [pscustomobject]@{ K = $k; Verdict = 'FAIL'; Failed = @('T1', 'T3'); A9Present = $true } }
    $none = { param($k) [pscustomobject]@{ K = $k; Verdict = 'NOT MEASURED'; Failed = @(); A9Present = $false } }
    $em = [string][char]0x2014
    $scope = 'MRI + ground-truth path; prediction overlay not covered'
    $v = Get-OverallVerdict -Evaluations @((& $ok 1), (& $ok 2), (& $ok 3)) -Expected 3 -CaseId 'CASE_0061' -Scope $scope
    Assert-Equal $v.Line ("TC-PERF-001 PASS $em MRI + ground-truth path; prediction overlay not covered, CASE_0061, 3/3 repetitions")
    $v = Get-OverallVerdict -Evaluations @((& $ok 1), (& $bad 2), (& $ok 3)) -Expected 3 -CaseId 'CASE_0061' -Scope $scope
    Assert-Equal $v.Line ("TC-PERF-001 FAIL $em T1+T3, repetition 2")
    $v = Get-OverallVerdict -Evaluations @((& $ok 1), (& $ok 2), (& $none 3)) -Expected 3 -CaseId 'CASE_0061' -Scope $scope
    Assert-Equal $v.Line ("TC-PERF-001 INCOMPLETE $em 2 of 3")
    $v = Get-OverallVerdict -Evaluations @((& $none 1)) -Expected 3 -CaseId 'CASE_0061' -Scope $scope
    Assert-Equal $v.Key 'NOT MEASURED'
    $v = Get-OverallVerdict -Evaluations @((& $ok 1), (& $ok 2), (& $ok 3)) -Expected 3 -CaseId 'CASE_0061' -Scope $scope -Rehearsal $true -RehearsalWhy 'fixture'
    Assert-Equal $v.Key 'NOT EVIDENCE'
  }
  Add-Check 'judge: three repetitions + pooled run, SUMMARY.md and PROVENANCE_DRAFT.md' {
    $d = Join-Path $script:ST.Tmp 'session_pass'
    if (-not (Test-Path -LiteralPath $d)) { [void](New-Item -ItemType Directory -Path $d) }
    for ($k = 1; $k -le 3; $k++) {
      Write-TextFile -Path (Join-Path $d "A9_rep${k}_logcat.txt") -Text (New-SyntheticA9Log -Variant pass -Rep $k)
      Write-TextFile -Path (Join-Path $d "A9_rep${k}_meminfo_M0.txt") -Text (New-FxMeminfo -Pss 180000)
      Write-TextFile -Path (Join-Path $d "A9_rep${k}_meminfo_M1.txt") -Text (New-FxMeminfo -Pss 240000 -Gfx 120000)
    }
    $j = Invoke-SessionJudge -OutDir $d -MobileDir $script:ST.Mobile -Reps 3 -CaseId 'CASE_0061'
    Assert-Equal $j.Overall.Key 'PASS' $j.Overall.Line
    Assert-Equal $j.Pooled.Measured.N 93 'pooled measured n'
    Assert-Equal $j.Pooled.Warm.N 93 'pooled warm n'
    foreach ($n in 'slice_timing_rep1.txt', 'slice_timing_rep3.txt', 'slice_timing_all_reps.txt', 'l4_report_rep2.txt', 'A9_all_reps_logcat.txt') {
      Assert-True (Test-Path -LiteralPath (Join-Path $d $n)) "missing $n"
    }
    $state = @{
      Device = @{ Brand = 'samsung'; Model = 'SM-A176B'; Name = 'a17x'; Android = '16'; Sdk = '36'; Abi = 'arm64-v8a'; BatteryStart = '88 %, 30.5 C'; Animation = '1.0 / 1.0 / 1.0'; RefreshRate = 'refresh_rate_mode=1' }
      Apk = @{ Name = 'x.apk'; Sha256 = ('ab' * 32); Verified = 'matches the sidecar'; BuildType = 'release (Hermes)'; Mode = 'live'; Contract = '1.1.0'; GitSha = ('cd' * 20); GitBranch = 'main'; BuiltAt = '2026-10-18T09:27:31+07:00'; VersionName = '0.1.0' }
      RepMeta = @{ '1' = @{ Battery0 = '88 %'; Battery1 = '86 %'; Manual = @() } }
      Tour = (New-Object System.Collections.ArrayList); Warnings = (New-Object System.Collections.ArrayList); Deviations = (New-Object System.Collections.ArrayList)
      BackendLine = 'Backend answered the app preflight.'; PreflightLine = 'PREFLIGHT PASS'
    }
    $sum = New-SummaryMarkdown -J $j -State $state -OutDir $d
    Assert-True ($sum -match 'TC-PERF-001 PASS') 'verdict line missing from SUMMARY'
    Assert-True ($sum -match 'pooled \| n 93,') 'pooled row missing from SUMMARY'
    Assert-True ($sum -match 'TOTAL PSS 180000 -> 240000') 'memory line missing from SUMMARY'
    $prov = New-ProvenanceMarkdown -J $j -State $state -OutDir $d -PcNow 'pc' -PhoneNow 'phone' -OutsideFiles @()
    Assert-True ($prov -match 'adb` \(`input tap`, `input swipe`\)') 'operator wording missing'
    Assert-True ($prov -match 'not recorded') 'serial statement missing'
    Assert-True ($prov -notmatch 'R58M') 'serial leaked'
    $files = @(Get-CommitCandidates -OutDir $d -Reps 3 | ForEach-Object { Split-Path -Leaf $_ })
    Assert-True ($files -contains 'A9_rep1_logcat.txt') 'logcat not in the commit list'
    Assert-True ($files -notcontains 'A9_all_reps_logcat.txt') 'the pooled copy is not evidence'
    Assert-True (@($files | Where-Object { $_ -match '_dump' }).Count -eq 0) 'a dump is not for git'
  }
  Add-Check 'judge: a rep with no capture is reported, not invented (INCOMPLETE)' {
    $d = Join-Path $script:ST.Tmp 'session_two'
    if (-not (Test-Path -LiteralPath $d)) { [void](New-Item -ItemType Directory -Path $d) }
    foreach ($k in 1, 2) { Write-TextFile -Path (Join-Path $d "A9_rep${k}_logcat.txt") -Text (New-SyntheticA9Log -Variant pass -Rep $k) }
    $j = Invoke-SessionJudge -OutDir $d -MobileDir $script:ST.Mobile -Reps 3
    Assert-Equal $j.Overall.Key 'INCOMPLETE' $j.Overall.Line
    Assert-True ($j.Overall.Line -match '2 of 3') $j.Overall.Line
  }
  Add-Check 'judge: the buffer dump is judged when it holds more CMW lines than the stream' {
    $d = Join-Path $script:ST.Tmp 'session_dump'
    if (-not (Test-Path -LiteralPath $d)) { [void](New-Item -ItemType Directory -Path $d) }
    $full = New-SyntheticA9Log -Variant pass -Rep 1
    $cut = ($full -split "`n" | Select-Object -First 60) -join "`n"
    Write-TextFile -Path (Join-Path $d 'A9_rep1_logcat.txt') -Text $cut
    Write-TextFile -Path (Join-Path $d 'A9_rep1_logcat_dump.txt') -Text $full
    $sel = Select-RepLog -OutDir $d -K 1
    Assert-Equal $sel.Source 'dump'
    Write-TextFile -Path (Join-Path $d 'A9_rep1_logcat.txt') -Text $full
    Assert-Equal (Select-RepLog -OutDir $d -K 1).Source 'stream' 'on a tie the streamed file is judged'
  }

  # ---- evidence helpers ----------------------------------------------------------------------------------------
  Add-Check 'meminfo: TOTAL PSS, Native Heap and Graphics are read from the App Summary' {
    $m = ConvertFrom-Meminfo (New-FxMeminfo -Pss 200000 -Native 41000 -Gfx 81000)
    Assert-True $m.Found 'not found'
    Assert-Equal $m.TotalPssKb 200000
    Assert-Equal $m.NativeHeapKb 41000
    Assert-Equal $m.GraphicsKb 81000
    Assert-True (-not (ConvertFrom-Meminfo 'No process found for: com.cardiacmri.workspace').Found) 'a missing process must not parse'
  }
  Add-Check 'redaction scan: a serial, a private IPv4, a URL and the Windows user are found; clean files are clean' {
    $dir = $script:ST.Tmp
    $bad = Join-Path $dir 'scan_bad.txt'
    $good = Join-Path $dir 'scan_good.txt'
    $ipD = (192, 168, 4, 7) -join '.'
    Write-TextFile -Path $bad -Text ("line one`nbackend at $ipD here`nserial R58M12ABCDE here`nsee http://example.test:8000/x`nCMW_HTTP {`"url`":`"/api/v1/cases`"}`n")
    Write-TextFile -Path $good -Text ("CMW_GESTURE {`"seq`":1}`nbackend http://<configured> study STUDY_LA_001`nversion 1.1.0`n")
    $hits = @(Find-SensitiveText -Paths @($bad, $good) -Serials @('R58M12ABCDE'))
    $kinds = @($hits | ForEach-Object { $_.Kind + '@' + $_.Line })
    Assert-True ($kinds -contains 'private-ipv4@2') ('private ipv4 not found: ' + ($kinds -join ','))
    Assert-True ($kinds -contains 'device-serial@3') 'serial not found'
    Assert-True ($kinds -contains 'url@4') 'url not found'
    Assert-True (@($hits | Where-Object { $_.File -eq 'scan_good.txt' }).Count -eq 0) 'false positive on a clean file'
    Assert-True (@($hits | Where-Object { $_.PSObject.Properties['Text'] }).Count -eq 0) 'the scan must not carry the matched text'
  }
  Add-Check 'redaction scan: the committed L4 evidence is clean (no false positives on real logcat text)' {
    $dir = Join-Path $script:ST.Repo 'spikes\spike_a_2d\EVIDENCE_RAW\l4_product_app_20261001T205817+0700'
    if (-not (Test-Path -LiteralPath $dir)) { return }
    $files = @('S1_L4_logcat.txt', 'l4_report.txt', 'preflight.txt', 'apk_build_record.txt') | ForEach-Object { Join-Path $dir $_ } | Where-Object { Test-Path -LiteralPath $_ }
    $hits = @(Find-SensitiveText -Paths $files -Serials @())
    Assert-Equal $hits.Count 0 ('hits: ' + (($hits | ForEach-Object { $_.File + ':' + $_.Line + ' ' + $_.Kind }) -join ', '))
  }
  Add-Check 'build record: an unsalted sha256 of the address is redacted, "configured (not recorded)" is kept' {
    $old = "apk              x.apk`napi_base_url     sha256:0123abcd`nstudy_id         STUDY_LA_001`n"
    $new = "apk              x.apk`napi_base_url     configured (not recorded)`nstudy_id         STUDY_LA_001`n"
    Assert-True ((ConvertTo-RedactedBuildRecord $old) -match 'api_base_url     <redacted>') 'old record not redacted'
    Assert-True ((ConvertTo-RedactedBuildRecord $old) -notmatch '0123abcd') 'hash leaked'
    Assert-True ((ConvertTo-RedactedBuildRecord $new) -match 'configured \(not recorded\)') 'a clean record must be kept'
    $h = ConvertFrom-BuildRecord $new
    Assert-Equal $h['study_id'] 'STUDY_LA_001'
  }
  Add-Check 'preflight block: from "preflight:" to "PREFLIGHT PASS"' {
    $t = "noise`npreflight: backend http://<configured> | study S | case CASE_0061 | RAW`n  ok   P1 /health ok`nPREFLIGHT PASS`ntrailing`n"
    $b = Get-PreflightBlock $t
    Assert-True ($b.StartsWith('preflight:')) 'start'
    Assert-True ($b.EndsWith('PREFLIGHT PASS')) 'end'
    Assert-True ($b -notmatch 'noise|trailing') 'cut'
  }
  return $c
}

function Invoke-DeviceSessionSelfTest {
  param([string]$ScriptsDir)
  $checks = Get-DeviceSessionSelfChecks -ScriptsDir $ScriptsDir
  $bad = 0
  foreach ($c in $checks) {
    try {
      & $c.Block | Out-Null
      Write-Host ('selftest [PASS] {0}' -f $c.Name) -ForegroundColor Green
    } catch {
      $bad++
      Write-Host ('selftest [FAIL] {0}' -f $c.Name) -ForegroundColor Red
      Write-Host ('         {0}' -f $_.Exception.Message) -ForegroundColor Red
    }
  }
  Write-Host ('SELFTEST: {0} checks, {1} failed' -f $checks.Count, $bad)
  return $bad
}
