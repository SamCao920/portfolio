# fangyuancao.me

Plain HTML, CSS and JS, served by GitHub Pages. No build step.

## Structure
- `index.html`: the home page (four strings; Work, Notes, Taste and About open from it). `vault.html`: the notes map. Every other `*.html` except `admin.html` and `404.html` only redirects an old address to `index.html`.
- `data/content.js`: bio, writing, socials and settings. Edit by hand.
- `data/books.js`, `data/films.js`: my reading and watching log, edited in `admin.html` (Reading, Watching).
- `data/art.js`, `assets/gallery/`: generated from the Visual Art notes in the Obsidian vault.
- `assets/paper.js`: draws the home page and fills each section from the data. `assets/vault-graph.js`: the map on `vault.html`. (`assets/site.js` is the previous design and is no longer loaded.)
- `assets/paper.css`: the look of the public pages; colours and fonts are tokens at the top. Type is New Computer Modern (`assets/fonts/newcm`, GUST licence). `assets/style.css` now only styles `admin.html`.
- `assets/vault-graph.js`: the interactive notes graph on the Vault page.
- `tools/build-graph.py`: rebuilds the graph data inside `vault.html` from the Obsidian vault.

## Editing content
Open `admin.html` in Chrome or Edge (double-click it, or via `python -m http.server`), click **Connect site folder**, pick this folder, edit, then **Save** (or Ctrl+S). It rewrites `data/content.js` (plus `data/books.js` and `data/films.js` when you log something) and copies attached PDFs and images into `assets/`. Then commit and push.

## Common edits
- Add an essay: add an object to `writings`. `featured: true` puts it in the home page row; `cover` takes an image path; `award` shows a green badge.
- Log a book or film: admin.html → Reading or Watching. (`tools/import-reading.py` is the retired one-time importer; it refuses to run without `--overwrite`.)
- Covers: book covers come from Open Library, film posters from Wikipedia, fetched in the visitor's browser and cached. Fix a wrong one with `posterOverrides` in `content.js`.
- Update the Art page: `python3 tools/import-art.py "C:/Users/samca/Commonplace"`. Optional front matter it reads: `museum`, `city`, `seen` (YYYY-MM-DD), `year`. Vault images are resized and stripped of EXIF/GPS.
- Rebuild the vault graph: `python3 tools/build-graph.py "C:/Users/samca/Commonplace"` (writes into `vault.html`).

## Keep the Vault and Art pages current
`tools/update-site.ps1` rebuilds both from the vault and pushes only when something changed.
Schedule it once (PowerShell):
`schtasks /Create /SC DAILY /ST 03:00 /TN "Update personal site" /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\Users\samca\OneDrive\Desktop\portfolio\tools\update-site.ps1"`
Use `/SC HOURLY` instead of `/SC DAILY /ST 03:00` for hourly. It runs only while the computer is on. Needs Python with numpy and Pillow (`pip install numpy pillow`).

## Preview locally
Run `python3 -m http.server` in this folder and open http://localhost:8000.

## Mac setup (main machine)

In Terminal, once:

    git clone https://github.com/SamCao920/portfolio.git ~/Desktop/Portfolio && bash ~/Desktop/Portfolio/tools/mac/install.sh

Then open `~/Desktop/Portfolio/admin.html`, click Change folder and pick `~/Desktop/Portfolio`. Saves publish about
10 seconds later; the vault pages rebuild every hour. Problems are written to
`tools/mac/publish.log` and `tools/mac/update.log`. If the morning job says macOS won't let it read the
vault, add `/bin/bash` under System Settings > Privacy & Security > Full Disk Access.
