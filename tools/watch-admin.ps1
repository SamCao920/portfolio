# Watches the files admin.html writes. 10 seconds after the last save,
# runs git add -A, commits and pushes. Started hidden at logon by run-watch-admin.vbs.
# Every 10 minutes it also pulls from GitHub, so edits made on another computer arrive here
# before you edit. If a merge ever conflicts, it backs out cleanly and says so in watch-admin.log.
$site = Split-Path -Parent $PSScriptRoot
Set-Location $site
$mutex = New-Object System.Threading.Mutex($false, "Local\SiteAdminAutoPush")
if (-not $mutex.WaitOne(0)) { exit 0 }   # already running

$files = "data\content.js", "data\books.js", "data\films.js", "data\theme.js", "data\listening.js"
function Stamp { ($files | ForEach-Object { if (Test-Path $_) { (Get-Item $_).LastWriteTimeUtc.Ticks } }) -join "," }
function Stop-Rebase { if ((Test-Path .git\rebase-merge) -or (Test-Path .git\rebase-apply)) { git rebase --abort 2>&1 | Out-Null } }
function Publish {
  Stop-Rebase
  git add -A 2>&1 | Out-Null
  git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) { git commit -q -m "Admin edit $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
  git pull --rebase -q 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Stop-Rebase
    "$(Get-Date -Format s) NOT published: this edit conflicts with a change made on another computer. Ask Claude to merge them."
    return
  }
  git status -sb | Select-String "ahead" | Out-Null
  if ($?) { git push -q 2>&1 | Out-Null; "$(Get-Date -Format s) pushed" }
}
function Sync {
  if (-not (git status --porcelain)) {   # only when nothing is waiting to be published
    git pull --rebase -q 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Stop-Rebase }
  }
}

"$(Get-Date -Format s) watcher started"
Stop-Rebase
$last = Stamp
$changedAt = $null
$synced = Get-Date
# Publish saves made while the watcher was not running, and anything stuck from before.
git diff --quiet HEAD -- $files
if ($LASTEXITCODE -ne 0) { $changedAt = (Get-Date).AddSeconds(-10) }
if (git status -sb | Select-String "ahead") { Publish }
while ($true) {
  Start-Sleep -Seconds 3
  $now = Stamp
  if ($now -ne $last) { $last = $now; $changedAt = Get-Date; continue }
  if ($changedAt -and ((Get-Date) - $changedAt).TotalSeconds -ge 10) {
    $changedAt = $null
    Publish
    $synced = Get-Date
  }
  elseif (-not $changedAt -and ((Get-Date) - $synced).TotalMinutes -ge 10) {
    Sync
    $synced = Get-Date; $last = Stamp
  }
}
