# Rebuilds the Vault graph, Art page, book notes and home-page quotes from the Obsidian vault,
# then commits and pushes only if something changed.
# Run by hand, or on a schedule with Windows Task Scheduler (see README).
# If GitHub has changes this copy can't merge, it stops cleanly and says so in update-site.log
# instead of leaving git half-way through a rebase.
$site  = Split-Path -Parent $PSScriptRoot
$vault = Join-Path $env:USERPROFILE "Commonplace"
Set-Location $site
$generated = "vault.html", "data/vault-index.js", "data/art.js", "data/notes.js", "data/quotes.js", "data/vault-notes", "assets/gallery"

function Stop-Rebase { if ((Test-Path .git\rebase-merge) -or (Test-Path .git\rebase-apply)) { git rebase --abort 2>&1 | Out-Null } }
function Build {
  python tools/build-graph.py $vault vault.html;   if ($LASTEXITCODE -ne 0) { return $false }
  python tools/import-art.py $vault;               if ($LASTEXITCODE -ne 0) { return $false }
  python tools/import-book-notes.py $vault;        if ($LASTEXITCODE -ne 0) { return $false }
  python tools/import-quotes.py $vault;            if ($LASTEXITCODE -ne 0) { return $false }
  python tools/export-vault-notes.py $vault;       if ($LASTEXITCODE -ne 0) { return $false }
  python tools/bust-cache.py
  return $true
}

for ($try = 1; $try -le 2; $try++) {
  Stop-Rebase
  # start from what's on GitHub, so the rebuild sits on top of the other computer's work
  git checkout -q -- $generated 2>&1 | Out-Null
  git pull --rebase --autostash -q
  if ($LASTEXITCODE -ne 0) { Stop-Rebase; "$(Get-Date -Format s) couldn't sync with GitHub before rebuilding; nothing published"; exit 1 }
  if (-not (Build)) { exit 1 }
  git add *.html $generated
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) { exit 0 }   # nothing new
  git commit -q -m "Update vault graph and art $(Get-Date -Format yyyy-MM-dd)"
  git pull --rebase -q
  if ($LASTEXITCODE -eq 0) { git push -q; "$(Get-Date -Format s) published"; exit 0 }
  # someone pushed generated files in between: drop this rebuild and do it again on top
  Stop-Rebase
  git reset -q --keep HEAD~1
}
"$(Get-Date -Format s) gave up after two tries; nothing published"
exit 1
