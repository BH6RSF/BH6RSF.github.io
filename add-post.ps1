# RsfNotes - Interactive "Add New Post" helper
# Run via add-post.bat (double-click) or:
#   powershell -NoProfile -ExecutionPolicy Bypass -File add-post.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$postsFile = Join-Path $scriptDir "js\posts.js"

# When stdin is redirected (piped), decode it as UTF-8
if ([Console]::IsInputRedirected) {
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
}

function Read-Line {
  $line = [Console]::ReadLine()
  if ($null -eq $line) { return "" }
  return $line.TrimEnd()
}

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  RsfNotes - Add New Post" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Title
Write-Host "Post title: " -NoNewline -ForegroundColor Yellow
$title = Read-Line
while ([string]::IsNullOrWhiteSpace($title)) {
  Write-Host "Post title (required): " -NoNewline -ForegroundColor Yellow
  $title = Read-Line
}

# 2. ID
Write-Host "Post id (lowercase letters/numbers/hyphen, e.g. my-first-post): " -NoNewline -ForegroundColor Yellow
$id = (Read-Line).Trim().ToLower()
if ($id -notmatch '^[a-z0-9\-]+$') {
  Write-Host "[ERROR] Invalid id. Use only lowercase letters, numbers and '-'." -ForegroundColor Red
  exit 1
}

# 3. Date
Write-Host "Date YYYY-MM-DD (Enter = today): " -NoNewline -ForegroundColor Yellow
$date = (Read-Line).Trim()
if ([string]::IsNullOrWhiteSpace($date)) { $date = Get-Date -Format "yyyy-MM-dd" }
if ($date -notmatch '^\d{4}-\d{2}-\d{2}$') {
  Write-Host "[ERROR] Invalid date format." -ForegroundColor Red
  exit 1
}

# 4. Tags
Write-Host "Tags, comma separated (Enter = default): " -NoNewline -ForegroundColor Yellow
$tagsRaw = Read-Line
$tags = $tagsRaw -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
if ($tags.Count -eq 0) { $tags = @("随笔") }

# 5. Summary
Write-Host "Summary (one sentence shown on the list page): " -NoNewline -ForegroundColor Yellow
$summary = Read-Line

# 6. Content (multi-line until END)
Write-Host ""
Write-Host "Paste your Markdown content below (multi-line)." -ForegroundColor Yellow
Write-Host "Supported: ## heading, **bold**, inline code, fenced code blocks," -ForegroundColor Yellow
Write-Host "           - list, 1. list, > quote, | table |, [link](url), ---" -ForegroundColor Yellow
Write-Host "Type END on a line by itself to finish:" -ForegroundColor Yellow
$contentLines = @()
while ($true) {
  $line = Read-Line
  if ($line -eq "END") { break }
  $contentLines += $line
}
$content = $contentLines -join "`n"
if ([string]::IsNullOrWhiteSpace($content)) {
  Write-Host "[ERROR] Content is empty. Abort." -ForegroundColor Red
  exit 1
}

# Escape backtick and ${ so the JS template string stays valid
$content = $content.Replace('${', '\${').Replace('`', '\`')

# Escape double quotes and backslashes in title/summary/tags
$esc = { param($s) $s.Replace('\', '\\').Replace('"', '\"') }
$tagsJs = ($tags | ForEach-Object { '"' + (& $esc $_) + '"' }) -join ", "
$titleJs = & $esc $title
$summaryJs = & $esc $summary

# Build the JS object with a single-quoted here-string (backticks are literal)
# and placeholder replacement, so user input can never break the template.
$obj = @'
{
  id: "__ID__",
  title: "__TITLE__",
  date: "__DATE__",
  tags: [__TAGS__],
  summary: "__SUMMARY__",
  content: `
__CONTENT__
  `,
},
'@
$obj = $obj.Replace('__ID__', $id)
$obj = $obj.Replace('__TITLE__', $titleJs)
$obj = $obj.Replace('__DATE__', $date)
$obj = $obj.Replace('__TAGS__', $tagsJs)
$obj = $obj.Replace('__SUMMARY__', $summaryJs)
$obj = $obj.Replace('__CONTENT__', $content)

# Insert into POSTS array (right after "const POSTS = [")
$text = [System.IO.File]::ReadAllText($postsFile, [System.Text.Encoding]::UTF8)
$marker = "const POSTS = ["
$idx = $text.IndexOf($marker)
if ($idx -lt 0) {
  Write-Host "[ERROR] posts.js format changed: POSTS array not found." -ForegroundColor Red
  exit 1
}
$insertAt = $idx + $marker.Length
$newText = $text.Substring(0, $insertAt) + "`r`n" + $obj + $text.Substring($insertAt)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($postsFile, $newText, $utf8NoBom)

Write-Host ""
Write-Host "[OK] Post added: $title" -ForegroundColor Green
Write-Host "  - id:       $id"
Write-Host "  - date:     $date"
Write-Host "  - tags:     $($tags -join ', ')"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Preview locally : open http://localhost:8080"
Write-Host "  2. Deploy online   : double-click deploy.bat"
