# device_ui.ps1 - adb and uiautomator helpers for mobile/scripts/device_session.ps1.
#
# Dot-source it:   . "$PSScriptRoot\device_ui.ps1"
# Windows PowerShell 5.1, ASCII only (a BOM-less file with other characters is read as ANSI by 5.1).
#
# What is in here, and nothing else:
#   - one place that starts native programs (adb, node) and captures stdout/stderr as bytes, with a time limit;
#   - one place that logs, and removes the device serial, private IPv4 addresses and the Windows profile path
#     from everything that is printed or written to the session log (the repository is public, DR-019);
#   - the uiautomator dump parser and the node lookup (exact text, content-desc, regex; centre of the bounds);
#   - taps, long-presses, swipes, scrolls, screenshots, and the read of a logcat file that is still being written.
# The A9 / tour / judge logic is in device_session.ps1 and device_judge.ps1.

Set-StrictMode -Version 2

if (-not (Get-Variable -Name Ctx -Scope Script -ErrorAction SilentlyContinue)) {
  $script:Ctx = [ordered]@{
    Adb      = ''          # full path of adb.exe (never printed: it holds the Windows user name)
    Serial   = ''          # in memory only; printed as <device-serial>
    DryRun   = $false
    Package  = 'com.cardiacmri.workspace'
    Screen   = $null       # @{ W = 1080; H = 2340 }
    LogFile  = ''
    Secrets  = New-Object System.Collections.ArrayList
    UiDumpDir = ''         # where Save-UiDump / failure artifacts go
    LastDump = $null
  }
}

$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# ----------------------------------------------------------------------------------------------------------------
# Redaction and logging
# ----------------------------------------------------------------------------------------------------------------

$script:PrivateIpv4 = '(?<![\d.])(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3}|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3})(?![\d])'

function Add-Secret {
  # A value that must never be printed or written to a text file: it is replaced by the mask.
  param([string]$Value, [string]$Mask)
  if ([string]::IsNullOrEmpty($Value)) { return }
  [void]$script:Ctx.Secrets.Add(@($Value, $Mask))
}

function Hide-Secret {
  param([AllowNull()][string]$Text)
  if ($null -eq $Text -or $Text -eq '') { return $Text }
  foreach ($s in $script:Ctx.Secrets) {
    $Text = [regex]::Replace($Text, [regex]::Escape($s[0]), $s[1], 'IgnoreCase')
  }
  $Text = [regex]::Replace($Text, $script:PrivateIpv4, '<ip>')
  if ($env:USERPROFILE) {
    $Text = [regex]::Replace($Text, [regex]::Escape($env:USERPROFILE), '<home>', 'IgnoreCase')
  }
  return $Text
}

function Write-Log {
  param([string]$Message, [ValidateSet('INFO', 'WARN', 'ERROR', 'STEP', 'OK', 'DRY')][string]$Level = 'INFO')
  $text = Hide-Secret $Message
  $line = '{0} [{1}] {2}' -f (Get-Date -Format 'HH:mm:ss'), $Level, $text
  $colour = 'Gray'
  if ($Level -eq 'WARN') { $colour = 'Yellow' }
  elseif ($Level -eq 'ERROR') { $colour = 'Red' }
  elseif ($Level -eq 'STEP') { $colour = 'Cyan' }
  elseif ($Level -eq 'OK') { $colour = 'Green' }
  elseif ($Level -eq 'DRY') { $colour = 'Magenta' }
  Write-Host $line -ForegroundColor $colour
  if ($script:Ctx.LogFile) {
    try { [System.IO.File]::AppendAllText($script:Ctx.LogFile, $line + "`n", $script:Utf8NoBom) } catch { }
  }
}

function Write-TextFile {
  # UTF-8 without BOM, LF line ends: what git and node expect (PowerShell 5.1 '>' writes BOM + CRLF).
  param([string]$Path, [string]$Text)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
  $t = $Text -replace "`r`n", "`n"
  [System.IO.File]::WriteAllText($Path, $t, $script:Utf8NoBom)
}

function Read-SharedText {
  # Reads a file another process is still appending to (the logcat capture).
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  $fs = $null
  try {
    $fs = New-Object System.IO.FileStream($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    $sr = New-Object System.IO.StreamReader($fs, $script:Utf8NoBom)
    return $sr.ReadToEnd()
  } catch {
    return ''
  } finally {
    if ($fs) { $fs.Dispose() }
  }
}

# ----------------------------------------------------------------------------------------------------------------
# Native programs
# ----------------------------------------------------------------------------------------------------------------

function ConvertTo-ArgString {
  # Windows command-line quoting (CommandLineToArgvW rules) for a ProcessStartInfo.Arguments string.
  param([string[]]$ArgumentList)
  $parts = New-Object System.Collections.Generic.List[string]
  foreach ($a in @($ArgumentList)) {
    if ($null -eq $a) { continue }
    if ($a -eq '') { $parts.Add('""'); continue }
    if ($a -notmatch '[\s"]') { $parts.Add($a); continue }
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append('"')
    $backslashes = 0
    foreach ($ch in $a.ToCharArray()) {
      if ($ch -eq '\') { $backslashes++; continue }
      if ($ch -eq '"') {
        [void]$sb.Append('\', ($backslashes * 2 + 1))
        [void]$sb.Append('"')
      } else {
        if ($backslashes -gt 0) { [void]$sb.Append('\', $backslashes) }
        [void]$sb.Append($ch)
      }
      $backslashes = 0
    }
    if ($backslashes -gt 0) { [void]$sb.Append('\', ($backslashes * 2)) }
    [void]$sb.Append('"')
    $parts.Add($sb.ToString())
  }
  return ($parts -join ' ')
}

function Invoke-Native {
  # Runs a program, returns @{ ExitCode; TimedOut; Bytes; StdOut; StdErr }. Never throws on a non-zero exit.
  # stdin is closed at once (adb forwards stdin and would otherwise swallow keystrokes meant for Read-Host).
  # A grandchild that inherits the pipes (the adb server on its first start) cannot hang us: after the program
  # itself has exited we wait 2.5 s for the pipes and keep what has arrived.
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [int]$TimeoutSec = 120,
    [string]$WorkingDirectory = ''
  )
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = ConvertTo-ArgString $ArgumentList
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  if ($WorkingDirectory) { $psi.WorkingDirectory = $WorkingDirectory }
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $so = New-Object System.IO.MemoryStream
  $se = New-Object System.IO.MemoryStream
  $timedOut = $false
  try {
    [void]$p.Start()
    $t1 = $p.StandardOutput.BaseStream.CopyToAsync($so)
    $t2 = $p.StandardError.BaseStream.CopyToAsync($se)
    try { $p.StandardInput.Close() } catch { }
    if (-not $p.WaitForExit($TimeoutSec * 1000)) {
      $timedOut = $true
      try { $p.Kill() } catch { }
      [void]$p.WaitForExit(3000)
    }
    try { [void]$t1.Wait(2500) } catch { }
    try { [void]$t2.Wait(2500) } catch { }
    $code = -1
    if ($p.HasExited) { $code = $p.ExitCode }
    $bytes = $so.ToArray()
    return [pscustomobject]@{
      ExitCode = $code
      TimedOut = $timedOut
      Bytes    = $bytes
      StdOut   = $script:Utf8NoBom.GetString($bytes)
      StdErr   = $script:Utf8NoBom.GetString($se.ToArray())
    }
  } finally {
    $p.Dispose()
  }
}

# The 8.3 short spelling of a folder (ADMINI~1) and its long one name the same place; GetLongPathName expands one to the other.
if (-not ('CmwLongPath' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class CmwLongPath {
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  static extern uint GetLongPathNameW(string shortPath, StringBuilder longPath, uint bufferSize);
  public static string Expand(string path) {
    StringBuilder sb = new StringBuilder(2048);
    uint n = GetLongPathNameW(path, sb, (uint)sb.Capacity);
    return (n > 0 && n < sb.Capacity) ? sb.ToString() : path;
  }
}
'@
}

function Get-LongPath {
  # A full path with every 8.3 short name expanded, so two spellings of one folder compare equal. The folder need not
  # exist: the nearest existing ancestor is expanded and the missing part is appended as given.
  param([string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
  $missing = New-Object System.Collections.ArrayList
  $head = $full
  while ($head -and -not (Test-Path -LiteralPath $head)) {
    $leaf = [System.IO.Path]::GetFileName($head)
    $parent = [System.IO.Path]::GetDirectoryName($head)
    if (-not $leaf -or -not $parent) { break }
    $missing.Insert(0, $leaf)
    $head = $parent.TrimEnd('\')
  }
  if ($head -and (Test-Path -LiteralPath $head)) { $head = [CmwLongPath]::Expand($head).TrimEnd('\') }
  $result = $head
  foreach ($m in $missing) { $result = $result + '\' + $m }
  return $result
}

function Test-OutsideGit {
  # The output folder must not be inside the repository (or any git work tree): serial, addresses and screenshots.
  # Paths are compared in their long (8.3-expanded) form: a short-name alias of a folder inside the repository is inside.
  param([string]$Path, [string]$Repo)
  $full = (Get-LongPath $Path) + '\'
  $roots = New-Object System.Collections.ArrayList
  [void]$roots.Add((Get-LongPath $Repo) + '\')
  $git = Get-Command git -ErrorAction SilentlyContinue
  if ($git) {
    $probe = $Path
    while ($probe -and -not (Test-Path -LiteralPath $probe)) { $probe = Split-Path -Parent $probe }
    if ($probe) {
      $r = Invoke-Native -FilePath $git.Source -ArgumentList @('-C', $probe, 'rev-parse', '--show-toplevel') -TimeoutSec 20
      if ($r.ExitCode -eq 0 -and $r.StdOut.Trim()) {
        [void]$roots.Add((Get-LongPath $r.StdOut.Trim()) + '\')
      }
    }
  }
  foreach ($root in $roots) {
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

function Invoke-Adb {
  # adb for the pinned device. -NoSerial for commands that are not about a device (devices, start-server).
  param(
    [string[]]$Arguments,
    [int]$TimeoutSec = 60,
    [switch]$NoSerial
  )
  $argv = @()
  if (-not $NoSerial) {
    if (-not $script:Ctx.Serial) { throw 'internal error: adb call before a device was pinned' }
    $argv += @('-s', $script:Ctx.Serial)
  }
  $argv += $Arguments
  if ($script:Ctx.DryRun) {
    Write-Log ('adb ' + ($Arguments -join ' ')) 'DRY'
    return [pscustomobject]@{ ExitCode = 0; TimedOut = $false; Bytes = (New-Object byte[] 0); StdOut = ''; StdErr = ''; DryRun = $true }
  }
  return Invoke-Native -FilePath $script:Ctx.Adb -ArgumentList $argv -TimeoutSec $TimeoutSec
}

function Invoke-AdbShell {
  param([string[]]$Arguments, [int]$TimeoutSec = 60)
  return Invoke-Adb -Arguments (@('shell') + $Arguments) -TimeoutSec $TimeoutSec
}

function Start-NativeToFile {
  # Starts a long-running program (adb logcat) and streams its stdout into a file that can be read while it is
  # written. Returns a handle for Stop-NativeCapture.
  param([string]$FilePath, [string[]]$ArgumentList, [string]$OutFile)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FilePath
  $psi.Arguments = ConvertTo-ArgString $ArgumentList
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $p = New-Object System.Diagnostics.Process
  $p.StartInfo = $psi
  $fs = New-Object System.IO.FileStream($OutFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, ([System.IO.FileShare]::ReadWrite -bor [System.IO.FileShare]::Delete), 1)
  $err = New-Object System.IO.MemoryStream
  [void]$p.Start()
  $task = $p.StandardOutput.BaseStream.CopyToAsync($fs)
  $task2 = $p.StandardError.BaseStream.CopyToAsync($err)
  try { $p.StandardInput.Close() } catch { }
  return [pscustomobject]@{ Process = $p; Stream = $fs; Task = $task; Task2 = $task2; Path = $OutFile; Stopped = $false }
}

function Stop-NativeCapture {
  param($Handle)
  if ($null -eq $Handle -or $Handle.Stopped) { return }
  $Handle.Stopped = $true
  try { if (-not $Handle.Process.HasExited) { $Handle.Process.Kill() } } catch { }
  try { [void]$Handle.Process.WaitForExit(3000) } catch { }
  try { [void]$Handle.Task.Wait(2500) } catch { }
  try { $Handle.Stream.Flush() } catch { }
  try { $Handle.Stream.Dispose() } catch { }
  try { $Handle.Process.Dispose() } catch { }
}

function Test-CaptureAlive {
  param($Handle)
  if ($null -eq $Handle -or $Handle.Stopped) { return $false }
  try { return (-not $Handle.Process.HasExited) } catch { return $false }
}

# ----------------------------------------------------------------------------------------------------------------
# uiautomator dump
# ----------------------------------------------------------------------------------------------------------------

function Normalize-UiText {
  param([AllowNull()][string]$Text)
  if ($null -eq $Text) { return '' }
  return ([regex]::Replace($Text, '\s+', ' ')).Trim()
}

function ConvertFrom-UiXml {
  # The uiautomator hierarchy -> a flat list of nodes (a regex parse: no XML parser to trip on odd characters).
  # Order is document order. Bounds are screen pixels.
  param([string]$Xml)
  $nodes = New-Object System.Collections.Generic.List[object]
  if ([string]::IsNullOrEmpty($Xml)) { return @() }
  $tagRe = New-Object System.Text.RegularExpressions.Regex('<node\s((?:[^>"]|"[^"]*")*?)/?>')
  $attrRe = New-Object System.Text.RegularExpressions.Regex('([\w:.-]+)="([^"]*)"')
  $boundsRe = New-Object System.Text.RegularExpressions.Regex('\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]')
  $i = 0
  foreach ($m in $tagRe.Matches($Xml)) {
    $a = @{}
    foreach ($am in $attrRe.Matches($m.Groups[1].Value)) {
      $a[$am.Groups[1].Value] = [System.Net.WebUtility]::HtmlDecode($am.Groups[2].Value)
    }
    $x1 = 0; $y1 = 0; $x2 = 0; $y2 = 0
    if ($a.ContainsKey('bounds')) {
      $bm = $boundsRe.Match($a['bounds'])
      if ($bm.Success) {
        $x1 = [int]$bm.Groups[1].Value; $y1 = [int]$bm.Groups[2].Value
        $x2 = [int]$bm.Groups[3].Value; $y2 = [int]$bm.Groups[4].Value
      }
    }
    $text = ''; if ($a.ContainsKey('text')) { $text = $a['text'] }
    $desc = ''; if ($a.ContainsKey('content-desc')) { $desc = $a['content-desc'] }
    $cls = ''; if ($a.ContainsKey('class')) { $cls = $a['class'] }
    $res = ''; if ($a.ContainsKey('resource-id')) { $res = $a['resource-id'] }
    $pkg = ''; if ($a.ContainsKey('package')) { $pkg = $a['package'] }
    $nodes.Add([pscustomobject]@{
      Index      = $i
      Text       = $text
      Desc       = $desc
      TextN      = (Normalize-UiText $text)
      DescN      = (Normalize-UiText $desc)
      Class      = $cls
      Res        = $res
      Pkg        = $pkg
      Clickable  = ($a.ContainsKey('clickable') -and $a['clickable'] -eq 'true')
      Enabled    = (-not $a.ContainsKey('enabled') -or $a['enabled'] -eq 'true')
      Scrollable = ($a.ContainsKey('scrollable') -and $a['scrollable'] -eq 'true')
      Checked    = ($a.ContainsKey('checked') -and $a['checked'] -eq 'true')
      X1 = $x1; Y1 = $y1; X2 = $x2; Y2 = $y2
      CX = [int](($x1 + $x2) / 2)
      CY = [int](($y1 + $y2) / 2)
      W  = ($x2 - $x1)
      H  = ($y2 - $y1)
    })
    $i++
  }
  return $nodes.ToArray()
}

function Get-UiScreenSize {
  # From the dump itself: the largest right/bottom edge of any node.
  param([object[]]$Nodes)
  $w = 0; $h = 0
  foreach ($n in @($Nodes)) {
    if ($n.X2 -gt $w) { $w = $n.X2 }
    if ($n.Y2 -gt $h) { $h = $n.Y2 }
  }
  return @{ W = $w; H = $h }
}

function Find-UiNodes {
  # Matches, best first. Tiers: 0 exact text, 1 exact content-desc, 2 text contains (-Text only) / regex on text,
  # 3 regex on content-desc. Inside a tier: top to bottom, then left to right. Case-insensitive, whitespace
  # normalised (Android capitalises dialog buttons: "A9 30-STEP").
  #   -Text   exact string (then, after the exact tiers, a substring)
  #   -Regex  regular expression
  #   -YMin/-YMax  keep nodes whose centre lies inside this fraction of the screen height (tab bar: -YMin 0.88)
  param(
    [object[]]$Nodes,
    [string]$Text = '',
    [string]$Regex = '',
    [string]$Package = '',
    [double]$YMin = -1,
    [double]$YMax = -1,
    [int]$ScreenH = 0,
    [switch]$ClickableOnly,
    [switch]$EnabledOnly,
    [switch]$NoSubstring
  )
  $found = New-Object System.Collections.Generic.List[object]
  if ($ScreenH -le 0) { $ScreenH = (Get-UiScreenSize $Nodes).H }
  $textN = Normalize-UiText $Text
  $re = $null
  if ($Regex) { $re = New-Object System.Text.RegularExpressions.Regex($Regex, 'IgnoreCase') }
  foreach ($n in @($Nodes)) {
    if ($n.W -le 0 -or $n.H -le 0) { continue }
    if ($Package -and $n.Pkg -ne $Package) { continue }
    if ($ClickableOnly -and -not $n.Clickable) { continue }
    if ($EnabledOnly -and -not $n.Enabled) { continue }
    if ($ScreenH -gt 0) {
      if ($YMin -ge 0 -and $n.CY -lt ($YMin * $ScreenH)) { continue }
      if ($YMax -ge 0 -and $n.CY -gt ($YMax * $ScreenH)) { continue }
    }
    $tier = -1
    if ($textN) {
      if ($n.TextN -ieq $textN) { $tier = 0 }
      elseif ($n.DescN -ieq $textN) { $tier = 1 }
      elseif (-not $NoSubstring -and $n.TextN -and $n.TextN.IndexOf($textN, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { $tier = 2 }
      elseif (-not $NoSubstring -and $n.DescN -and $n.DescN.IndexOf($textN, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { $tier = 3 }
    }
    if ($tier -lt 0 -and $re) {
      if ($n.TextN -and $re.IsMatch($n.TextN)) { $tier = 2 }
      elseif ($n.DescN -and $re.IsMatch($n.DescN)) { $tier = 3 }
    }
    if ($tier -ge 0) { $found.Add([pscustomobject]@{ Tier = $tier; Node = $n }) }
  }
  $sorted = @($found | Sort-Object -Property @{ Expression = { $_.Tier } }, @{ Expression = { $_.Node.CY } }, @{ Expression = { $_.Node.CX } })
  return @($sorted | ForEach-Object { $_.Node })
}

function Find-UiNode {
  # The best match, or $null. -Last: the bottom-most of the best tier (a tab label rather than a heading).
  param(
    [object[]]$Nodes,
    [string]$Text = '',
    [string]$Regex = '',
    [string]$Package = '',
    [double]$YMin = -1,
    [double]$YMax = -1,
    [int]$ScreenH = 0,
    [switch]$ClickableOnly,
    [switch]$EnabledOnly,
    [switch]$NoSubstring,
    [switch]$Last
  )
  $all = @(Find-UiNodes -Nodes $Nodes -Text $Text -Regex $Regex -Package $Package -YMin $YMin -YMax $YMax -ScreenH $ScreenH `
      -ClickableOnly:$ClickableOnly -EnabledOnly:$EnabledOnly -NoSubstring:$NoSubstring)
  if ($all.Count -eq 0) { return $null }
  if (-not $Last) { return $all[0] }
  # the best tier is the tier of all[0]; find which items share it
  $first = $all[0]
  $tier0 = Get-UiTier -Node $first -Text $Text -Regex $Regex -NoSubstring:$NoSubstring
  $best = $first
  foreach ($n in $all) {
    if ((Get-UiTier -Node $n -Text $Text -Regex $Regex -NoSubstring:$NoSubstring) -eq $tier0) { $best = $n }
  }
  return $best
}

function Get-UiTier {
  param($Node, [string]$Text = '', [string]$Regex = '', [switch]$NoSubstring)
  $textN = Normalize-UiText $Text
  if ($textN) {
    if ($Node.TextN -ieq $textN) { return 0 }
    if ($Node.DescN -ieq $textN) { return 1 }
    if (-not $NoSubstring -and $Node.TextN -and $Node.TextN.IndexOf($textN, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return 2 }
    if (-not $NoSubstring -and $Node.DescN -and $Node.DescN.IndexOf($textN, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return 3 }
  }
  if ($Regex) {
    $re = New-Object System.Text.RegularExpressions.Regex($Regex, 'IgnoreCase')
    if ($Node.TextN -and $re.IsMatch($Node.TextN)) { return 2 }
    if ($Node.DescN -and $re.IsMatch($Node.DescN)) { return 3 }
  }
  return 9
}

function Test-UiText {
  # Is there a node whose text or content-desc matches the regex?
  param([object[]]$Nodes, [string]$Regex, [string]$Package = '')
  return (@(Find-UiNodes -Nodes $Nodes -Regex $Regex -Package $Package).Count -gt 0)
}

function Get-UiScrollable {
  # The scrollable node with the largest area (the screen's own ScrollView / list), or $null.
  param([object[]]$Nodes, [string]$Package = '')
  $best = $null
  foreach ($n in @($Nodes)) {
    if (-not $n.Scrollable) { continue }
    if ($Package -and $n.Pkg -ne $Package) { continue }
    if ($n.W -le 0 -or $n.H -le 0) { continue }
    if ($null -eq $best -or ($n.W * $n.H) -gt ($best.W * $best.H)) { $best = $n }
  }
  return $best
}

# The labels of buttons that WRITE to the backend (a review, a finding). A read-only tour never taps them: Invoke-UiTap
# refuses, whatever the caller asked for.
$script:WriteActionPattern = '^(accept|flag|mark corrected|not reviewed|save|reset|cancel edits|resolve|reopen|create finding|brush|add|erase|undo|redo|new finding here|discard and leave|retry slice)$'

function Test-WriteAction {
  param($Node)
  if ($null -eq $Node) { return $false }
  return ($Node.TextN -imatch $script:WriteActionPattern) -or ($Node.DescN -imatch $script:WriteActionPattern)
}

# ----------------------------------------------------------------------------------------------------------------
# Device state and input
# ----------------------------------------------------------------------------------------------------------------

function Get-DeviceList {
  # Parses `adb devices -l`: [{ Serial; State; Model }]. The raw text is never logged (it holds the serial).
  $r = Invoke-Adb -Arguments @('devices', '-l') -NoSerial -TimeoutSec 30
  $list = New-Object System.Collections.Generic.List[object]
  foreach ($line in ($r.StdOut -split "`r?`n")) {
    $t = $line.Trim()
    if (-not $t -or $t -like 'List of devices*' -or $t -like '`**') { continue }
    $f = $t -split '\s+'
    if ($f.Count -lt 2) { continue }
    $model = ''
    foreach ($tok in $f) { if ($tok -like 'model:*') { $model = $tok.Substring(6) } }
    $list.Add([pscustomobject]@{ Serial = $f[0]; State = $f[1]; Model = $model })
  }
  return $list.ToArray()
}

function Get-ScreenSize {
  # wm size: "Physical size: 1080x2340" and, when set, "Override size: ...". The override is what the UI uses.
  $r = Invoke-AdbShell -Arguments @('wm', 'size')
  $w = 0; $h = 0
  foreach ($m in [regex]::Matches($r.StdOut, '(Physical|Override) size:\s*(\d+)x(\d+)')) {
    $w = [int]$m.Groups[2].Value; $h = [int]$m.Groups[3].Value
  }
  if ($w -gt 0) { $script:Ctx.Screen = @{ W = $w; H = $h } }
  return $script:Ctx.Screen
}

function Invoke-UiTap {
  param([int]$X, [int]$Y)
  [void](Invoke-AdbShell -Arguments @('input', 'tap', "$X", "$Y"))
}

function Invoke-UiTapNode {
  param($Node, [string]$Why = '')
  if ($null -eq $Node) { throw 'Invoke-UiTapNode: no node' }
  if (Test-WriteAction $Node) {
    throw ('refused to tap a button that writes to the backend: ' + (Get-NodeLabel $Node))
  }
  Write-Log ('tap {0} at ({1},{2}){3}' -f (Get-NodeLabel $Node), $Node.CX, $Node.CY, $(if ($Why) { ' - ' + $Why } else { '' }))
  Invoke-UiTap -X $Node.CX -Y $Node.CY
}

function Get-NodeLabel {
  param($Node)
  if ($null -eq $Node) { return '<none>' }
  $t = $Node.TextN
  if (-not $t) { $t = $Node.DescN }
  if (-not $t) { $t = '<' + ($Node.Class -replace '^.*\.', '') + '>' }
  if ($t.Length -gt 60) { $t = $t.Substring(0, 57) + '...' }
  return "'" + $t + "'"
}

function Invoke-UiLongPress {
  # A long-press is a swipe that does not move; 1200 ms is above the 800 ms of SliceScrubber.
  param([int]$X, [int]$Y, [int]$Ms = 1200)
  [void](Invoke-AdbShell -Arguments @('input', 'swipe', "$X", "$Y", "$X", "$Y", "$Ms"))
}

function Invoke-UiSwipe {
  param([int]$X1, [int]$Y1, [int]$X2, [int]$Y2, [int]$Ms = 400)
  [void](Invoke-AdbShell -Arguments @('input', 'swipe', "$X1", "$Y1", "$X2", "$Y2", "$Ms"))
}

function Invoke-UiScroll {
  # Scrolls the content of the largest scrollable node DOWN (the finger moves up) by half its height.
  # Never swipes outside it: a swipe on the slice viewport would pan the image.
  param($Dump, [switch]$Up)
  $sc = $null
  if ($Dump) { $sc = Get-UiScrollable -Nodes $Dump.Nodes -Package $script:Ctx.Package }
  if ($null -eq $sc) {
    $s = $script:Ctx.Screen
    if ($null -eq $s) { $s = @{ W = 1080; H = 2340 } }
    $x = [int]($s.W / 2); $ya = [int]($s.H * 0.70); $yb = [int]($s.H * 0.35)
  } else {
    $x = $sc.CX
    $ya = [int]($sc.Y1 + $sc.H * 0.78)
    $yb = [int]($sc.Y1 + $sc.H * 0.22)
  }
  if ($Up) { $t = $ya; $ya = $yb; $yb = $t }
  Write-Log ("scroll {0}" -f $(if ($Up) { 'up' } else { 'down' }))
  Invoke-UiSwipe -X1 $x -Y1 $ya -X2 $x -Y2 $yb -Ms 450
  Start-Sleep -Milliseconds 700
}

function Invoke-UiKey {
  param([string]$Key)
  [void](Invoke-AdbShell -Arguments @('input', 'keyevent', $Key))
}

function Get-UiDump {
  # One fresh dump: @{ Xml; Nodes; Taken } or $null after the retries ("could not get idle state" while the
  # screen animates is the usual reason). Never call this during a measured pass.
  param([int]$Retries = 4)
  for ($i = 1; $i -le $Retries; $i++) {
    $r = Invoke-AdbShell -Arguments @('uiautomator', 'dump', '/sdcard/cmw_ui.xml') -TimeoutSec 45
    $ok = (-not $r.TimedOut) -and ($r.StdOut -notmatch 'ERROR') -and ($r.StdErr -notmatch 'ERROR')
    if ($ok) {
      $x = Invoke-Adb -Arguments @('exec-out', 'cat', '/sdcard/cmw_ui.xml') -TimeoutSec 30
      if ($x.StdOut -match '<hierarchy') {
        $nodes = ConvertFrom-UiXml -Xml $x.StdOut
        $d = [pscustomobject]@{ Xml = $x.StdOut; Nodes = $nodes; Taken = (Get-Date) }
        $script:Ctx.LastDump = $d
        return $d
      }
    }
    Start-Sleep -Milliseconds 900
  }
  return $null
}

function Save-UiDump {
  param($Dump, [string]$Path)
  if ($null -eq $Dump) { return }
  Write-TextFile -Path $Path -Text $Dump.Xml
}

function Save-Screenshot {
  # adb exec-out screencap -p -> a PNG on the PC. The bytes are checked for the PNG signature; some builds print a
  # warning line first, which is cut off. Falls back to screencap on the phone + pull.
  param([string]$Path)
  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Path $dir) }
  $r = Invoke-Adb -Arguments @('exec-out', 'screencap', '-p') -TimeoutSec 40
  $b = $r.Bytes
  $start = -1
  $limit = [Math]::Min($b.Length - 8, 4096)
  for ($i = 0; $i -le $limit; $i++) {
    if ($b[$i] -eq 0x89 -and $b[$i + 1] -eq 0x50 -and $b[$i + 2] -eq 0x4E -and $b[$i + 3] -eq 0x47) { $start = $i; break }
  }
  if ($start -ge 0) {
    $png = New-Object byte[] ($b.Length - $start)
    [Array]::Copy($b, $start, $png, 0, $png.Length)
    [System.IO.File]::WriteAllBytes($Path, $png)
    return $true
  }
  [void](Invoke-AdbShell -Arguments @('screencap', '-p', '/sdcard/cmw_shot.png'))
  [void](Invoke-Adb -Arguments @('pull', '/sdcard/cmw_shot.png', $Path) -TimeoutSec 40)
  [void](Invoke-AdbShell -Arguments @('rm', '/sdcard/cmw_shot.png'))
  return (Test-Path -LiteralPath $Path)
}

function Wait-UiNode {
  # Polls fresh dumps until a node matches (or the time is up). Returns @{ Node; Dump } or $null.
  # -ScrollIfMissing scrolls the screen's own scrollable between polls (up to -MaxScrolls times).
  param(
    [string]$Text = '',
    [string]$Regex = '',
    [int]$TimeoutSec = 30,
    [int]$PollMs = 1200,
    [double]$YMin = -1,
    [double]$YMax = -1,
    [switch]$Last,
    [switch]$EnabledOnly,
    [switch]$NoSubstring,
    [switch]$ScrollIfMissing,
    [int]$MaxScrolls = 10,
    [switch]$AppOnly
  )
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $scrolls = 0
  $prevXml = ''
  $pkg = ''
  if ($AppOnly) { $pkg = $script:Ctx.Package }
  $d = $null
  do {
    $d = Get-UiDump
    if ($d) {
      $n = Find-UiNode -Nodes $d.Nodes -Text $Text -Regex $Regex -Package $pkg -YMin $YMin -YMax $YMax -Last:$Last -EnabledOnly:$EnabledOnly -NoSubstring:$NoSubstring
      if ($n) { return [pscustomobject]@{ Node = $n; Dump = $d } }
      if ($ScrollIfMissing -and $scrolls -lt $MaxScrolls) {
        # an unchanged screen after a scroll means the end of the content: stop scrolling
        if ($d.Xml -eq $prevXml) { $scrolls = $MaxScrolls }
        else {
          $prevXml = $d.Xml
          Invoke-UiScroll -Dump $d
          $scrolls++
          continue
        }
      }
    }
    Start-Sleep -Milliseconds $PollMs
  } while ((Get-Date) -lt $deadline)
  return $null
}

function Wait-UiGone {
  # Polls until NO node matches. Returns $true when gone, $false on timeout.
  param([string]$Regex, [int]$TimeoutSec = 30, [int]$PollMs = 1200)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  do {
    $d = Get-UiDump
    if ($d -and -not (Test-UiText -Nodes $d.Nodes -Regex $Regex)) { return $true }
    Start-Sleep -Milliseconds $PollMs
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Get-LogMatchCount {
  param([string]$Path, [string]$Regex)
  $re = New-Object System.Text.RegularExpressions.Regex($Regex)
  $n = 0
  foreach ($line in ((Read-SharedText -Path $Path) -split "`r?`n")) { if ($re.IsMatch($line)) { $n++ } }
  return $n
}

function Wait-LogMatch {
  # Polls a logcat file that is still being written until -Count lines match the regex. Returns the last of them
  # (the Nth match) or $null. -Handle: the capture; if its process dies (adb lost) the wait ends at once with $null.
  param([string]$Path, [string]$Regex, [int]$TimeoutSec = 60, [int]$PollMs = 1000, $Handle = $null, [int]$Count = 1)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $re = New-Object System.Text.RegularExpressions.Regex($Regex)
  do {
    $text = Read-SharedText -Path $Path
    $n = 0
    foreach ($line in ($text -split "`r?`n")) {
      if ($re.IsMatch($line)) { $n++; if ($n -ge $Count) { return $line } }
    }
    if ($null -ne $Handle -and -not (Test-CaptureAlive $Handle)) { return $null }
    Start-Sleep -Milliseconds $PollMs
  } while ((Get-Date) -lt $deadline)
  return $null
}
