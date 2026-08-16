# RsfNotes - 部署前自动刷新静态资源缓存版本号
# 由 deploy.bat 自动调用；也可手动运行：
#   powershell -NoProfile -ExecutionPolicy Bypass -File version-bump.ps1
#
# 作用：把 4 个 HTML 中引用的 css/style.css、js/posts.js、js/app.js
#       的版本号（?v=xxx）替换为当前时间戳，强制浏览器加载最新文件。

$ErrorActionPreference = "Stop"
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ts = Get-Date -Format "yyyyMMddHHmmss"

# 匹配资源引用（含已有的 ?v= 参数），替换为 ?v=时间戳
$pattern = '(css/style\.css|js/posts\.js|js/app\.js)(\?v=\d+)?'
$replacement = '$1?v=' + $ts

$changed = 0
Get-ChildItem -Path $dir -Filter "*.html" | ForEach-Object {
  $c = [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8)
  $new = [regex]::Replace($c, $pattern, $replacement)
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
