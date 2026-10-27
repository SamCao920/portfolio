#!/usr/bin/env python3
"""
Rebuild the vault graph embedded in vault.html.

Reads an Obsidian vault, extracts the [[wikilink]] graph, solves the layout
with the SAME force law the browser runs (so the shipped positions are already
the simulation's fixed point and the graph opens settled), and rewrites the
<script id="vault-data"> block in place.

    python3 tools/build-graph.py "/path/to/vault" [path/to/vault.html]

Requires numpy. Excludes .trash, .obsidian, templates and assets, plus every folder
and note listed in tools/vault-private.txt and any note marked "publish: false".
"""
import json, os, re, sys
from datetime import datetime, timezone
import numpy as np

SKIP = {'.trash', '.obsidian', '.claude', '.claudian', '.pandoc',
        '5 - Templates', '0 - Assets', '.git'}

# Personal notes and folders kept off the site: tools/vault-private.txt, one name per line.
# Notes with "publish: false" in their front matter are left out too.
def load_private():
    f = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vault-private.txt')
    names = set()
    if os.path.exists(f):
        for line in open(f, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#'):
                names.add(line.lower())
    return names or {'inbox'}
PRIVATE = load_private()
PRIVATE_FM = re.compile(r'\A---\s*\n(.*?)\n---', re.S)

def is_private(path):
    try:
        head = open(path, encoding='utf-8', errors='ignore').read(4000)
    except OSError:
        return False
    m = PRIVATE_FM.match(head)
    return bool(m and re.search(r'^publish:\s*(false|no)\s*$', m.group(1), re.M | re.I))

# When a note was made: "created:" in its front matter, else the file's creation time (macOS keeps one), else unknown.
CREATED_FM = re.compile(r'^created:\s*["\']?(\d{4}-\d{2}-\d{2})', re.M)
def created(path):
    try:
        head = open(path, encoding='utf-8', errors='ignore').read(4000)
    except OSError:
        return None
    m = PRIVATE_FM.match(head)
    c = m and CREATED_FM.search(m.group(1))
    if c:
        return c.group(1)
    born = getattr(os.stat(path), 'st_birthtime', None)
    return datetime.fromtimestamp(born).strftime('%Y-%m-%d') if born else None

# Must match the constants in the page's vaultGraph() module.
REPEL, SPRING, LINK_LEN, CENTER, DAMP = 26.0, 0.045, 26.0, 0.010, 0.72
ITERS = 1500

LINK_RE = re.compile(r'\[\[([^\]\|#\^]+)(?:[#\^][^\]\|]*)?(?:\|[^\]]*)?\]\]')


def scan(vault):
    notes = {}
    for dp, dn, fn in os.walk(vault):
        dn[:] = [d for d in dn if d not in SKIP and not d.startswith('.') and d.lower() not in PRIVATE]
        top = os.path.relpath(dp, vault).split(os.sep)[0]
        if top in SKIP or top.lower() in PRIVATE:
            continue
        for f in fn:
            if not f.endswith('.md') or f.endswith('.excalidraw.md'):
                continue
            name = f[:-3]
            if name.strip().lower() in PRIVATE or is_private(os.path.join(dp, f)):
                continue
            notes[name] = {'folder': top if top != '.' else 'root',
                           'path': os.path.join(dp, f)}
    edges = set()
    for k, v in notes.items():
        try:
            txt = open(v['path'], encoding='utf-8', errors='ignore').read()
        except OSError:
            continue
        for m in LINK_RE.findall(txt):
            t = m.strip().split('/')[-1]
            if t in notes and t != k:
                edges.add(tuple(sorted((k, t))))
    return notes, sorted(edges)


def solve(n, links):
    L = np.array(links, dtype=np.int64)
    rng = np.random.default_rng(7)
    P = rng.normal(0, 120, (n, 2))
    V = np.zeros_like(P)
    for it in range(ITERS):
        alpha = 0.9 * (1 - it / ITERS) ** 1.2 + 0.02
        d = P[:, None, :] - P[None, :, :]
        d2 = (d * d).sum(-1)
        np.fill_diagonal(d2, np.inf)
        F = ((REPEL / d2)[..., None] * d).sum(1)
        dv = P[L[:, 1]] - P[L[:, 0]]
        dl = np.sqrt((dv * dv).sum(-1)) + 1e-9
        f = ((dl - LINK_LEN) * SPRING / dl)[:, None] * dv
        np.add.at(F, L[:, 0], f)
        np.add.at(F, L[:, 1], -f)
        F -= P * CENTER
        V = (V + F * alpha) * DAMP
        s = np.sqrt((V * V).sum(-1)).max()
        if s > 10:
            V *= 10 / s
        P += V
    return P - P.mean(0)


def main():
    vault = sys.argv[1]
    page = sys.argv[2] if len(sys.argv) > 2 else 'vault.html'

    notes, edges = scan(vault)
    deg = {}
    for a, b in edges:
        deg[a] = deg.get(a, 0) + 1
        deg[b] = deg.get(b, 0) + 1
    keep = sorted(k for k in notes if deg.get(k, 0) > 0)      # drop orphans
    idx = {k: i for i, k in enumerate(keep)}
    links = [[idx[a], idx[b]] for a, b in edges]
    print(f'{len(keep)} notes, {len(links)} links; solving layout…')

    P = solve(len(keep), links)
    folders = sorted({notes[k]['folder'] for k in keep})
    fi = {f: i for i, f in enumerate(folders)}
    data = {
        'folders': folders,
        'n': [[k, fi[notes[k]['folder']], deg[k],
               round(float(P[i, 0]), 1), round(float(P[i, 1]), 1)]
              for i, k in enumerate(keep)],
        'l': links,
        'built': datetime.now(timezone.utc).isoformat(timespec='minutes'),   # shown as "Last synced" on the page
    }
    blob = json.dumps(data, ensure_ascii=False, separators=(',', ':'))

    html = open(page, encoding='utf-8').read()
    open_tag = '<script id="vault-data" type="application/json">'
    a = html.index(open_tag) + len(open_tag)
    b = html.index('</script>', a)
    open(page, 'w', encoding='utf-8').write(html[:a] + blob + html[b:])
    print(f'wrote {len(blob)} bytes into {page}')
    # small title index so site search can find notes on every page (loaded on demand)
    label = lambda f: re.sub(r'^\d+(\.\w+)?\s*-\s*', '', f)
    idx_path = os.path.join(os.path.dirname(os.path.abspath(page)), 'data', 'vault-index.js')
    with open(idx_path, 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('/* Generated by tools/build-graph.py. Note titles for site search, and the date each note was made (home page "Lately"). */\n')
        fh.write('window.VAULT_INDEX = ' + json.dumps({'built': data['built'], 'notes': [[k, label(notes[k]['folder']), deg[k], created(notes[k]['path'])] for k in keep]}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'wrote {idx_path}')


if __name__ == '__main__':
    main()
