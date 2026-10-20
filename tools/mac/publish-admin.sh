#!/bin/bash
# Publishes admin.html saves: launchd runs this when a data file changes and every 10 minutes.
# Waits until the files have been quiet for 10 seconds, then commits and pushes. With nothing
# to publish it just pulls, so edits made elsewhere (for example by Claude) arrive before you edit.
# A merge conflict is backed out cleanly and reported in tools/mac/publish.log.
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
SITE="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$SITE" || exit 1
LOG="$SITE/tools/mac/publish.log"
LOCK="/tmp/site-git-$(id -u).lock"   # shared with update-site.sh so the two never run git at once
mkdir "$LOCK" 2>/dev/null || exit 0            # another run is already working
trap 'rmdir "$LOCK"' EXIT
log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }
stop_rebase() { [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] && git rebase --abort >/dev/null 2>&1; }
stamp() { if [ "$(uname)" = Darwin ]; then stat -f %m data/*.js; else stat -c %Y data/*.js; fi 2>/dev/null | tr "\n" ,; }

stop_rebase
if [ -z "$(git status --porcelain)" ] && ! git status -sb | grep -q ahead; then
  { git fetch -q origin master && git rebase -q origin/master; } >/dev/null 2>&1 || stop_rebase      # nothing to publish: just sync
  exit 0
fi
# wait for Save to finish writing (admin writes several files)
prev=""; for _ in $(seq 1 20); do now=$(stamp); [ "$now" = "$prev" ] && break; prev=$now; sleep 10; done
git add -A >/dev/null 2>&1
git diff --cached --quiet || git commit -q -m "Admin edit $(date '+%Y-%m-%d %H:%M')"
if ! { git fetch -q origin master && git rebase -q origin/master; } >/dev/null 2>&1; then
  stop_rebase
  log "NOT published: this edit conflicts with a change made elsewhere. Ask Claude to merge them."
  exit 1
fi
if git push -q origin HEAD:master >/dev/null 2>&1; then log "pushed"; else log "NOT published: git push failed (check GitHub sign-in: gh auth status)"; fi
