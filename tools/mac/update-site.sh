#!/bin/bash
# Rebuilds the Vault graph, Art page, book notes and home-page quotes from the Obsidian vault,
# then commits and pushes only if something changed. launchd runs it every hour; run it by
# hand any time. The vault's location is in tools/mac/vault-path (written by install.sh).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SITE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$SITE" || exit 1
VAULT="${1:-$(cat tools/mac/vault-path 2>/dev/null)}"
LOG="$SITE/tools/mac/update.log"
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }
[ -d "$VAULT" ] || { log "vault not found at '$VAULT'; nothing published"; exit 1; }
[ -r "$VAULT" ] && ls "$VAULT" >/dev/null 2>&1 || { log "macOS won't let this script read the vault (see README, Full Disk Access)"; exit 1; }
# wait for the admin publisher if it's mid-push, then hold the same lock
LOCK="/tmp/site-git-$(id -u).lock"
for _ in $(seq 1 60); do mkdir "$LOCK" 2>/dev/null && break; sleep 5; done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
GENERATED="vault.html data/vault-index.js data/art.js data/notes.js data/quotes.js data/vault-notes assets/gallery"
stop_rebase() { [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && git rebase --abort >/dev/null 2>&1; }
# the scripts need numpy and Pillow: keep them in a private Python environment in .venv
PY="$SITE/.venv/bin/python3"
if ! "$PY" -c "import numpy, PIL" 2>/dev/null; then
  log "setting up Python packages (numpy, Pillow) in .venv, one time"
  python3 -m venv "$SITE/.venv" && "$PY" -m pip install -q --upgrade pip && "$PY" -m pip install -q numpy pillow \
    || { log "couldn't install numpy and Pillow; nothing published"; exit 1; }
fi
build() {
  "$PY" tools/build-graph.py "$VAULT" vault.html && "$PY" tools/import-art.py "$VAULT" && "$PY" tools/import-book-notes.py "$VAULT" \
    && "$PY" tools/import-quotes.py "$VAULT" && "$PY" tools/export-vault-notes.py "$VAULT" && "$PY" tools/bust-cache.py
}
for try in 1 2; do
  stop_rebase
  for g in $GENERATED; do git checkout -q -- "$g" 2>/dev/null; done
  if ! { git fetch -q origin master && git rebase -q --autostash origin/master; }; then stop_rebase; log "couldn't sync with GitHub before rebuilding; nothing published"; exit 1; fi
  build || { log "a build step failed; nothing published"; exit 1; }
  git add *.html $GENERATED 2>/dev/null
  git diff --cached --quiet && { log "no changes"; exit 0; }
  git commit -q -m "Update vault graph and art $(date +%F)"
  if git fetch -q origin master && git rebase -q origin/master; then git push -q origin HEAD:master && log "published"; exit 0; fi
  stop_rebase; git reset -q --keep HEAD~1      # someone pushed in between: rebuild on top
done
log "gave up after two tries; nothing published"; exit 1
