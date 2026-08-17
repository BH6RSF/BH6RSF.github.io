# RsfNotes - deploy cache version bumper
# Called by deploy-<sync>.bat automatically; can also run manually:
#   powershell -NoProfile -ExecutionPolicy Bypass -File version-bump.ps1
#
# Purpose: replace ?v=xxx timestamps on referenced css/js files in all HTML
#          files with the current timestamp, forcing browsers to reload.
#
# NOTE: keep this file ASCII-only and WITHOUT a BOM-safe regex:
#       Windows PowerShell 5.1 reads BOM-less UTF-8 as ANSI, which corrupts
#       non-ASCII text and breaks string literals. The replacement below
#       avoids $1-style backreferences by using a MatchEvaluator.

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ts = Get-Date -Format "yyyyMMddHHmmss"

# Match css/js references (with optional existing ?v= param)
$pattern = '(css/style\.css|js/posts\.js|js/app\.js|js/games\.js|js/game2048\.js|js/game-race\.js)(\?v=\d+)?'

# MatchEvaluator: builds "filename?v=timestamp" per match (safe under any encoding)
$evaluator = [System.Text.RegularExpressions.MatchEvaluator]{
  param($m)
  return $m.Groups[1].Value + '?v=' + $ts
}

$changed = 0
Get-ChildItem -Path $dir -Filter "*.html" | ForEach-Object {
  $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
  $new = [regex]::Replace($c, $pattern, $evaluator)
  if ($new -ne $c) {
    [System.IO.File]::WriteAllText($_.FullName, $new, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host ("  updated " + $_.Name + " -> v=" + $ts)
    $changed++
  }
}

if ($changed -eq 0) {
  Write-Host "  (no HTML files changed)"
} else {
  Write-Host ("  done: " + $changed + " file(s) version bumped")
}
