# Watches the files admin.html writes. 10 seconds after the last save,
# runs git add -A, commits and pushes. Started hidden at logon by run-watch-admin.vbs.
$site = Split-Path -Parent $PSScriptRoot
Set-Location $site
$mutex = New-Object System.Threading.Mutex($false, "Local\SiteAdminAutoPush")
if (-not $mutex.WaitOne(0)) { exit 0 }   # already running

$files = "data\content.js", "data\books.js", "data\films.js", "data\theme.js"
function Stamp { ($files | ForEach-Object { if (Test-Path $_) { (Get-Item $_).LastWriteTimeUtc.Ticks } }) -join "," }

"$(Get-Date -Format s) watcher started" | Add-Content tools\watch-admin.log
$last = Stamp
$changedAt = $null
# Publish saves made while the watcher was not running.
git diff --quiet HEAD -- $files
if ($LASTEXITCODE -ne 0) { $changedAt = (Get-Date).AddSeconds(-10) }
while ($true) {
  Start-Sleep -Seconds 3
  $now = Stamp
  if ($now -ne $last) { $last = $now; $changedAt = Get-Date; continue }
  if ($changedAt -and ((Get-Date) - $changedAt).TotalSeconds -ge 10) {
    $changedAt = $null
    git add -A
    git diff --cached --quiet
    if ($LASTEXITCODE -ne 0) {
      git commit -m "Admin edit $(Get-Date -Format 'yyyy-MM-dd HH:mm')"   # pre-commit hook stamps cache-busting
      git push
      "$(Get-Date -Format s) pushed" | Add-Content tools\watch-admin.log
    }
  }
}
