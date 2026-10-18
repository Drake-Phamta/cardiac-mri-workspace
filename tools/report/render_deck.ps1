<#
.SYNOPSIS
  Export every slide of the deck to PNG with PowerPoint (COM) so the layout can be eyeballed.

.DESCRIPTION
  Windows with desktop PowerPoint only. The PNGs are written OUTSIDE git (default: a "_deck_render" folder under the
  temp directory) because they are build output. Nothing is modified: the deck is opened read-only, without a window.
  Without PowerPoint, build_deck.py already lints text extents (see its lint()), which is a weaker check.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\report\render_deck.ps1
  powershell -ExecutionPolicy Bypass -File tools\report\render_deck.ps1 -Deck management\presentation\final\CARDIAC_MRI_DECK_DRAFT.pptx -OutDir $env:TEMP\deck_png
#>
param(
    [string]$Deck = (Join-Path $PSScriptRoot "..\..\management\presentation\final\CARDIAC_MRI_DECK_DRAFT.pptx"),
    [string]$OutDir = (Join-Path ([System.IO.Path]::GetTempPath()) "_deck_render"),
    [int]$Width = 1600,
    [int]$Height = 900
)

$ErrorActionPreference = "Stop"
$deckPath = (Resolve-Path $Deck).Path
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$outPath = (Resolve-Path $OutDir).Path

$ppt = $null
$pres = $null
try {
    $ppt = New-Object -ComObject PowerPoint.Application
    # Open(FileName, ReadOnly, Untitled, WithWindow)
    $pres = $ppt.Presentations.Open($deckPath, -1, 0, 0)
    $pres.Export($outPath, "PNG", $Width, $Height)
    Write-Output ("slides: {0}; PNGs in {1}" -f $pres.Slides.Count, $outPath)
}
finally {
    if ($pres) { $pres.Close() }
    if ($ppt) { $ppt.Quit() }
}
