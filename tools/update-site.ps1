# Rebuilds the Vault graph, Art page, book notes and home-page quotes from the Obsidian vault,
# then commits and pushes only if something changed.
# Run by hand, or on a schedule with Windows Task Scheduler (see README).
$site  = Split-Path -Parent $PSScriptRoot
$vault = Join-Path $env:USERPROFILE "Commonplace"
Set-Location $site

python tools/build-graph.py $vault vault.html
if ($LASTEXITCODE -ne 0) { exit 1 }
python tools/import-art.py $vault
if ($LASTEXITCODE -ne 0) { exit 1 }
python tools/import-book-notes.py $vault
if ($LASTEXITCODE -ne 0) { exit 1 }
python tools/import-quotes.py $vault
if ($LASTEXITCODE -ne 0) { exit 1 }
python tools/export-vault-notes.py $vault
if ($LASTEXITCODE -ne 0) { exit 1 }

python tools/bust-cache.py
git add *.html  data/vault-index.js data/art.js data/notes.js data/quotes.js data/vault-notes.js assets/gallery
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) { exit 0 }   # nothing new
git commit -m "Update vault graph and art $(Get-Date -Format yyyy-MM-dd)"
git push
