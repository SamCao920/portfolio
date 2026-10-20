# fangyuancao.me

Static site on GitHub Pages (repo SamCao920/portfolio, branch master). Pages render from data/*.js via assets/site.js; admin.html edits the data files.

## Machines
- The Mac mini is the main machine: repo at ~/Desktop/Portfolio, set up by tools/mac/install.sh. launchd publishes admin saves (tools/mac/publish-admin.sh) and rebuilds the vault pages each morning (tools/mac/update-site.sh). Logs: tools/mac/*.log.
- The Windows PC (OneDrive copy, tools/*.ps1) is mostly off. Don't edit the OneDrive copy on the Mac; it is a sync of the PC's folder.

## Publishing (Claude)
- Attach the repo with push access (add_repo, access "push"), then work in a clone of origin/master.
- After changes: `python3 tools/bust-cache.py`, commit, `git push origin HEAD:master`. Pages redeploys in about a minute.
- Fetch and rebase on origin/master right before pushing; the Windows admin watcher also pushes to master.
- Never force-push.

## Rules
- No em dashes, curly quotes, no emojis in site copy.
- Strip EXIF/GPS from photos before committing: `python3 tools/optimize-images.py` (also shrinks images and makes studio thumbnails).
- Keep raw Goodreads, Letterboxd and Spotify exports out of the repo. No Goodreads or Letterboxd links.
- Read data files before writing; change them in place.
