# Rebuilds the Vault graph and the Art page from the Obsidian vault,
# then commits and pushes only if something changed.
# Run by hand, or on a schedule with Windows Task Scheduler (see README).
$site  = Split-Path -Parent $PSScriptRoot
$vault = Join-Path $env:USERPROFILE "Commonplace"
Set-Location $site

python tools/build-graph.py $vault vault.html
if ($LASTEXITCODE -ne 0) { exit 1 }
python tools/import-art.py $vault
if ($LASTEXITCODE -ne 0) { exit 1 }

git add vault.html data/art.js assets/gallery
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { exit 0 }   # nothing new
git commit -m "Update vault graph and art $(Get-Date -Format yyyy-MM-dd)"
git push
