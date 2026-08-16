# RsfNotes - 添加新文章工具（支持 back 回退 + 最终确认）
# 双击 add-post.bat 运行；或手动执行：
#   powershell -NoProfile -ExecutionPolicy Bypass -File add-post.ps1

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$postsFile = Join-Path $scriptDir "js\posts.js"

# 输入流被重定向时按 UTF-8 解码（正常双击运行不受影响）
if ([Console]::IsInputRedirected) {
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
}

# 读取一行输入；输入流结束（EOF）时退出，避免死循环
function Read-Line {
  $line = [Console]::ReadLine()
  if ($null -eq $line) {
    Write-Host ""
    Write-Host "[已取消] 输入意外结束。请直接双击 add-post.bat 运行本工具。" -ForegroundColor Red
    exit 1
  }
  return $line.TrimEnd()
}

# 当前值（可在各步骤间共享，用于回退后显示原值）
$script:title = $null
$script:id = $null
$script:date = $null
$script:tags = $null
$script:summary = $null
$script:contentLines = $null

# ---------- 各步骤 ----------
function Ask-Title {
  while ($true) {
    $hint = if ($script:title) { "（回车 = 保留：$($script:title)）" } else { "" }
    Write-Host "[1/6] 文章标题 $hint：" -NoNewline -ForegroundColor Yellow
    $v = Read-Line
    if ($v -eq 'back') { return 'back' }
    if ($v -eq '\back') { $v = 'back' }
    if ([string]::IsNullOrWhiteSpace($v)) {
      if ($script:title) { return 'ok' }
      Write-Host "      标题不能为空，请重新输入（输入 back 可返回）" -ForegroundColor DarkGray
      continue
    }
    $script:title = $v
    return 'ok'
  }
}

function Ask-Id {
  while ($true) {
    $hint = if ($script:id) { "（回车 = 保留：$($script:id)）" } else { "" }
    Write-Host "[2/6] 文章 ID（英文小写/数字/横杠，用于网址，如 my-first-post）$hint：" -NoNewline -ForegroundColor Yellow
    $v = (Read-Line).Trim().ToLower()
    if ($v -eq 'back') { return 'back' }
    if ([string]::IsNullOrWhiteSpace($v) -and $script:id) { return 'ok' }
    if ($v -notmatch '^[a-z0-9\-]+$') {
      Write-Host "      ID 只能包含小写字母、数字和横杠，例如：my-first-post" -ForegroundColor DarkGray
      continue
    }
    $script:id = $v
    return 'ok'
  }
}

function Ask-Date {
  while ($true) {
    $hint = if ($script:date) { "（回车 = 保留：$($script:date)）" } else { "（回车 = 今天）" }
    Write-Host "[3/6] 日期 YYYY-MM-DD $hint：" -NoNewline -ForegroundColor Yellow
    $v = (Read-Line).Trim()
    if ($v -eq 'back') { return 'back' }
    if ([string]::IsNullOrWhiteSpace($v)) {
      if ($script:date) { return 'ok' }
      $script:date = Get-Date -Format "yyyy-MM-dd"
      return 'ok'
    }
    if ($v -notmatch '^\d{4}-\d{2}-\d{2}$') {
      Write-Host "      日期格式应为 YYYY-MM-DD，例如：2026-02-15" -ForegroundColor DarkGray
      continue
    }
    $script:date = $v
    return 'ok'
  }
}

function Ask-Tags {
  while ($true) {
    $hint = if ($script:tags) { "（回车 = 保留：$($script:tags -join ', ')）" } else { "（回车 = 随笔）" }
    Write-Host "[4/6] 标签，用逗号分隔 $hint：" -NoNewline -ForegroundColor Yellow
    $v = Read-Line
    if ($v -eq 'back') { return 'back' }
    if ([string]::IsNullOrWhiteSpace($v)) {
      if ($script:tags) { return 'ok' }
      $script:tags = @("随笔")
      return 'ok'
    }
    $script:tags = $v -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }
    if ($script:tags.Count -eq 0) { $script:tags = @("随笔") }
    return 'ok'
  }
}

function Ask-Summary {
  while ($true) {
    $hint = if ($script:summary) { "（回车 = 保留：$($script:summary)）" } else { "" }
    Write-Host "[5/6] 一句话摘要（显示在首页文章列表）$hint：" -NoNewline -ForegroundColor Yellow
    $v = Read-Line
    if ($v -eq 'back') { return 'back' }
    if ($v -eq '\back') { $v = 'back' }
    if ([string]::IsNullOrWhiteSpace($v)) {
      if ($script:summary) { return 'ok' }
      Write-Host "      摘要不能为空（输入 back 可返回）" -ForegroundColor DarkGray
      continue
    }
    $script:summary = $v
    return 'ok'
  }
}

function Ask-Content {
  $oldCount = if ($script:contentLines) { $script:contentLines.Count } else { 0 }
  $hint = if ($oldCount) { "（原正文 $oldCount 行，重新粘贴将覆盖；输入 back 返回）" } else { "" }
  Write-Host ""
  Write-Host "[6/6] 粘贴文章正文 $hint：" -ForegroundColor Yellow
  Write-Host '      支持：## 标题 | **加粗** | `行内代码` | ```js 代码块``` | - 列表 | > 引用 | [文字](网址)' -ForegroundColor DarkGray
  Write-Host "      粘贴完成后，单独输入 结束 并回车结束；输入 back 返回上一步" -ForegroundColor Cyan
  Write-Host "      （如果正文中需要出现「结束」或「back」这样的行，请在行首加反斜杠，如：\结束）" -ForegroundColor DarkGray
  $lines = @()
  while ($true) {
    $line = Read-Line
    if ($line -eq '结束') { break }
    if ($line -eq 'back' -and $lines.Count -eq 0) { return 'back' }
    # 转义：\结束 和 \back 表示输入字面内容
    if ($line -eq '\结束') { $line = '结束' }
    elseif ($line -eq '\back') { $line = 'back' }
    $lines += $line
  }
  if ($lines.Count -eq 0) {
    Write-Host "      正文不能为空" -ForegroundColor DarkGray
    return 'retry'
  }
  $script:contentLines = $lines
  return 'ok'
}

# ---------- 主流程（状态机） ----------
$state = 1
$fromConfirm = $false   # 是否处于"从确认页跳回来修改"模式
while ($true) {
  $r = switch ($state) {
    1 { Ask-Title }
    2 { Ask-Id }
    3 { Ask-Date }
    4 { Ask-Tags }
    5 { Ask-Summary }
    6 { Ask-Content }
    7 { 'confirm' }
  }

  if ($state -eq 7) {
    # 汇总确认
    Write-Host ""
    Write-Host "===== 请确认以下信息 =====" -ForegroundColor Cyan
    Write-Host "  1. 标题：$script:title"
    Write-Host "  2. ID：$script:id"
    Write-Host "  3. 日期：$script:date"
    Write-Host "  4. 标签：$($script:tags -join ' / ')"
    Write-Host "  5. 摘要：$script:summary"
    Write-Host "  6. 正文：共 $($script:contentLines.Count) 行"
    Write-Host "==========================" -ForegroundColor Cyan
    Write-Host "输入 y 确认写入；输入 1-6 修改对应项；输入 n 取消：" -NoNewline -ForegroundColor Yellow
    $ans = (Read-Line).Trim().ToLower()
    if ($ans -eq 'y') { break }
    elseif ($ans -eq 'n') { Write-Host "已取消，未做任何修改。" -ForegroundColor Yellow; exit 0 }
    elseif ($ans -match '^[1-6]$') { $state = [int]$ans; $fromConfirm = $true }
    else { Write-Host "      请输入 y / n / 1-6" -ForegroundColor DarkGray }
    continue
  }

  if ($r -eq 'back') {
    if ($fromConfirm) { $state = 7 }      # 修改模式下 back 直接回确认页
    elseif ($state -gt 1) { $state-- }
    else { Write-Host "已经是第一步了" -ForegroundColor DarkGray }
  }
  elseif ($r -eq 'ok') {
    if ($fromConfirm) { $state = 7 }      # 修改完成回确认页
    else { $state++ }
  }
}

# ---------- 写入 ----------
$content = $script:contentLines -join "`n"
# 转义反引号和模板插值符（$ 后跟花括号），保证 JS 模板字符串合法
$content = $content.Replace('$' + '{', '\$' + '{').Replace('`', '\`')
# 转义标题/摘要/标签中的双引号和反斜杠
$esc = { param($s) $s.Replace('\', '\\').Replace('"', '\"') }
$tagsJs = ($script:tags | ForEach-Object { '"' + (& $esc $_) + '"' }) -join ", "
$titleJs = & $esc $script:title
$summaryJs = & $esc $script:summary

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
$obj = $obj.Replace('__ID__', $script:id)
$obj = $obj.Replace('__TITLE__', $titleJs)
$obj = $obj.Replace('__DATE__', $script:date)
$obj = $obj.Replace('__TAGS__', $tagsJs)
$obj = $obj.Replace('__SUMMARY__', $summaryJs)
$obj = $obj.Replace('__CONTENT__', $content)

$text = [System.IO.File]::ReadAllText($postsFile, [System.Text.Encoding]::UTF8)
$marker = "const POSTS = ["
$idx = $text.IndexOf($marker)
if ($idx -lt 0) {
  Write-Host "[错误] 未找到 POSTS 数组，请检查 js/posts.js 是否被改动过。" -ForegroundColor Red
  exit 1
}
$insertAt = $idx + $marker.Length
$newText = $text.Substring(0, $insertAt) + "`r`n" + $obj + $text.Substring($insertAt)

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($postsFile, $newText, $utf8NoBom)

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  完成！文章《$script:title》已添加到 js/posts.js" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "接下来：" -ForegroundColor Cyan
Write-Host "  1. 本地预览：打开 http://localhost:8080 查看效果" -ForegroundColor White
Write-Host "  2. 确认无误后，双击 deploy.bat 部署上线" -ForegroundColor White
