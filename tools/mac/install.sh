#!/bin/bash
# One-time setup on the Mac. Run in Terminal:
#   bash ~/Desktop/Portfolio/tools/mac/install.sh     (or, before cloning: see README)
# Run it again after moving the folder: it points the background jobs at the new place.
# It clones the site if needed (keep it out of OneDrive and iCloud, so git isn't synced between computers),
# checks you can push to GitHub, finds your Obsidian vault and installs two background jobs:
#   - publish admin saves 10 seconds after you save, and pull every 10 minutes
#   - rebuild the vault pages every morning at 7:50
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.homebrew/bin:$PATH"
# the site folder: the copy this script is in, or ~/Desktop/Portfolio for a fresh clone
HERE="$(cd "$(dirname "$0")/../.." 2>/dev/null && pwd)"
if [ -d "$HERE/.git" ]; then SITE="$HERE"; else SITE="$HOME/Desktop/Portfolio"; fi
REPO="https://github.com/SamCao920/portfolio.git"
command -v git >/dev/null || { echo "Installing Apple's command line tools (git, python3); run this again when it finishes."; xcode-select --install; exit 1; }
if [ ! -d "$SITE/.git" ]; then echo "Cloning the site to $SITE ..."; git clone -q "$REPO" "$SITE"; fi
cd "$SITE"; git pull -q --rebase || true
git config user.name >/dev/null || git config user.name "Sam Cao"
git config user.email >/dev/null || git config user.email "samcao920@gmail.com"
# GitHub sign-in: use gh if it's there, otherwise whatever git already has in the keychain
# GitHub no longer takes passwords, so sign in with gh (installed with Homebrew if it's missing)
if ! GIT_TERMINAL_PROMPT=0 git push --dry-run -q origin HEAD >/dev/null 2>&1; then
  if ! command -v gh >/dev/null; then
    if command -v brew >/dev/null; then echo "Installing GitHub's sign-in tool (gh)..."; brew install gh
    else echo "Install Homebrew first (https://brew.sh), then run this script again."; exit 1; fi
  fi
  gh auth status >/dev/null 2>&1 || gh auth login -h github.com -p https -w
  gh auth setup-git
fi
if ! GIT_TERMINAL_PROMPT=0 git push --dry-run -q origin HEAD >/dev/null 2>&1; then
  echo; echo "git can't push to GitHub yet. Run:  brew install gh && gh auth login   then run this script again."; exit 1
fi
echo "GitHub sign-in works."
# the Obsidian vault
VAULT="$(cat tools/mac/vault-path 2>/dev/null || true)"
if [ ! -d "$VAULT" ]; then
  VAULT=""
  for root in "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents" "$HOME/Library/CloudStorage" "$HOME/Documents" "$HOME/Desktop" "$HOME"; do
    [ -d "$root" ] || continue
    depth=4; [ "$root" = "$HOME" ] && depth=1
    VAULT="$(find "$root" -maxdepth $depth -type d -name Commonplace -not -path '*/.Trash/*' 2>/dev/null | while read -r d; do [ -d "$d/.obsidian" ] && echo "$d" && break; done)"
    [ -n "$VAULT" ] && break
  done
  if [ -z "$VAULT" ]; then read -r -p "Where is your Commonplace vault? Drag the folder here and press Return: " VAULT; VAULT="${VAULT%/}"; VAULT="${VAULT//\\ / }"; fi
  echo "$VAULT" > tools/mac/vault-path
fi
echo "Vault: $VAULT"
chmod +x tools/mac/*.sh
AG="$HOME/Library/LaunchAgents"; mkdir -p "$AG"
cat > "$AG/me.fangyuancao.publish-admin.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>me.fangyuancao.publish-admin</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SITE/tools/mac/publish-admin.sh</string></array>
  <key>WatchPaths</key><array><string>$SITE/data</string></array>
  <key>StartInterval</key><integer>600</integer>
  <key>RunAtLoad</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
</dict></plist>
P
cat > "$AG/me.fangyuancao.update-site.plist" <<P
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>me.fangyuancao.update-site</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SITE/tools/mac/update-site.sh</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>7</integer><key>Minute</key><integer>50</integer></dict>
</dict></plist>
P
for j in publish-admin update-site; do
  launchctl bootout "gui/$(id -u)/me.fangyuancao.$j" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$AG/me.fangyuancao.$j.plist"
done
echo "Background jobs installed for $SITE."
case "$SITE" in "$HOME/Desktop"*|"$HOME/Documents"*|"$HOME/Downloads"*)
  echo "Note: macOS blocks background jobs from $SITE unless /bin/bash has Full Disk Access"
  echo "(System Settings > Privacy & Security > Full Disk Access, +, Cmd+Shift+G, /bin/bash).";;
esac
echo "Running the vault update once now to check it works..."
bash tools/mac/update-site.sh || echo "The vault update failed; see the message above."
echo
echo "Done. Open $SITE/admin.html, click Change folder and pick $SITE. Saves now publish on their own."
open "$SITE/admin.html" 2>/dev/null || true
