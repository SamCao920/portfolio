# fangyuancao.me

Plain HTML, CSS and JS, served by GitHub Pages. No build step.

## Structure
- `index.html`, `writings.html`, `books.html`, `films.html`, `art.html`, `vault.html`, `about.html`, `socials.html`: page shells; each sets `data-page` on `<body>`.
- `data/content.js`: bio, writing, socials and settings. Edit by hand.
- `data/books.js`, `data/films.js`: my reading and watching log, edited in `admin.html` (Reading, Watching).
- `data/art.js`, `assets/gallery/`: generated from the Visual Art notes in the Obsidian vault.
- `assets/site.js`: renders the header, footer and each page from the data.
- `assets/style.css`: the theme. Colours and fonts are tokens at the top.
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
