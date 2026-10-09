#!/usr/bin/env python3
"""
Link books and films on the site to their notes in the Obsidian vault.

    python3 tools/import-book-notes.py [path/to/Commonplace]

Reads "2 - Source Material/2.a - Books & Textbooks" and "2.e - Films", matches each note
to a book in data/books.js (by title, and author when titles are ambiguous) or a film in
data/films.js (by title), and writes data/notes.js: the note's Summary and Significance,
the idea notes it links to, its cover (books only), and whether it appears on the Vault
graph (so the site can link to it there).
It also writes `links`: the titles (and aliases) of works, writings and maps of content
that are on the Vault graph, so the site can link any mention of them to the Vault.
Run after tools/build-graph.py so the graph check is current.
"""
import json, os, re, sys, datetime, unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VAULT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Commonplace')
NOTES = os.path.join(VAULT, '2 - Source Material', '2.a - Books & Textbooks')
FILM_NOTES = os.path.join(VAULT, '2 - Source Material', '2.e - Films')

def loose(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', ' ', s).strip()

def display(stem):
    return re.sub(r'\s*\((book|play|novel|excerpts|film|painting|essay)\)\s*$', '', stem).strip()

def front(text):
    m = re.match(r'---\n(.*?)\n---\n?(.*)', text, re.S)
    if not m:
        return {}, text
    d, cur = {}, None
    for line in m.group(1).split('\n'):
        if re.match(r'^[A-Za-z][\w-]*:', line):
            k, v = line.split(':', 1); cur = k.strip(); v = v.strip().strip('"\'')
            d[cur] = v if v else []
        elif line.strip().startswith('- ') and cur:
            if not isinstance(d[cur], list): d[cur] = [d[cur]] if d[cur] else []
            d[cur].append(line.strip()[2:].strip('"\''))
    return d, m.group(2)

def sections(body):
    out, cur = {}, None
    for line in body.split('\n'):
        h = re.match(r'^##\s+(.+?)\s*$', line)
        if h: cur = h.group(1); out[cur] = []
        elif cur: out[cur].append(line)
    return {k: '\n'.join(v).strip() for k, v in out.items()}

def clean(md):
    """Obsidian markdown -> plain paragraphs (links become their text)."""
    md = re.sub(r'!\[\[[^\]]*\]\]', '', md)
    md = re.sub(r'\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]', r'\2', md)
    md = re.sub(r'\[\[([^\]|#]+)(?:#[^\]]*)?\]\]', lambda m: re.sub(r'\.canvas$', '', m.group(1)), md)
    md = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', md)
    md = re.sub(r'[*_]{1,2}([^*_]+)[*_]{1,2}', r'\1', md)
    paras = [re.sub(r'^\s*[-*]\s+', '', p).strip() for p in re.split(r'\n\s*\n|\n(?=\s*[-*]\s)', md)]
    return [p for p in paras if p and not p.startswith('#')]

def links(md):
    seen, out = set(), []
    for m in re.finditer(r'\[\[([^\]|#]+)', md):
        t = m.group(1).strip()
        if t.endswith('.canvas') or t in seen: continue
        seen.add(t); out.append(t)
    return out

# books on the site
raw = open(os.path.join(ROOT, 'data', 'books.js'), encoding='utf-8').read()
books = json.loads(re.search(r'window\.BOOKS = (.*);\s*$', raw, re.S).group(1))['items']

# notes on the Vault graph
graph = set()
try:
    v = open(os.path.join(ROOT, 'vault.html'), encoding='utf-8').read()
    data = json.loads(re.search(r'<script id="vault-data" type="application/json">(.*?)</script>', v, re.S).group(1))
    graph = {n[0] for n in data['n']}
except Exception as e:
    print('  (could not read the graph from vault.html:', e, ')')

def match(title, author, aliases):
    keys = [loose(title)] + [loose(a) for a in aliases]
    surname = loose(author.split()[-1]) if author else ''
    cands = []
    for b in books:
        bt, bf = loose(b['t']), loose(b.get('full') or b['t'])
        if not bt: continue   # e.g. titles only in Chinese characters
        for k in keys:
            if not k: continue
            if k == bt or k == bf: score = 3
            elif bt.startswith(k) or bf.startswith(k) or (len(bt) > 3 and k.startswith(bt)): score = 2
            elif len(k) > 6 and (k in bf): score = 1
            else: continue
            if surname and surname in loose(b['a']): score += 2
            cands.append((score, b))
    if surname and not any(c[0] >= 3 for c in cands):
        # fallback: most words shared and the same author ("Protestant Work Ethic" vs "Protestant Ethic")
        kw = set(keys[0].split())
        for b in books:
            if surname not in loose(b['a']): continue
            bw = set(loose(b.get('full') or b['t']).split())
            if kw and len(kw & bw) / len(kw | bw) >= 0.6: cands.append((3, b))
    if not cands: return None
    cands.sort(key=lambda c: -c[0])
    best = cands[0]
    return best[1] if best[0] >= 3 else None   # exact title, or partial title plus matching author

out, unmatched = [], []
for fn in sorted(os.listdir(NOTES)):
    if not fn.endswith('.md'): continue
    stem = fn[:-3]
    d, body = front(open(os.path.join(NOTES, fn), encoding='utf-8').read())
    author = d.get('author') or ''
    author = author[0] if isinstance(author, list) and author else (author if isinstance(author, str) else '')
    aliases = d.get('aliases') or []
    aliases = [aliases] if isinstance(aliases, str) else aliases
    sec = sections(body)
    idea_md = '\n'.join(v for k, v in sec.items() if k not in ('Summary', 'Significance', 'References'))
    b = match(display(stem), author, aliases)
    entry = {
        'note': stem, 'title': display(stem), 'author': author,
        'book': f"{b['t']}|{b['a']}" if b else None,
        'cover': d.get('cover') if isinstance(d.get('cover'), str) and d.get('cover', '').startswith('http') else None,
        'summary': clean(sec.get('Summary', '')),
        'significance': clean(sec.get('Significance', '')),
        'ideas': [t for t in links(idea_md)],
        'inGraph': stem in graph,
    }
    entry['ideasInGraph'] = [t for t in entry['ideas'] if t in graph]
    out.append(entry)
    if not b: unmatched.append(stem)

# films on the site
raw = open(os.path.join(ROOT, 'data', 'films.js'), encoding='utf-8').read()
films = json.loads(re.search(r'window\.FILMS = (.*);\s*$', raw, re.S).group(1))['items']
film_out, film_unmatched = [], []
for fn in sorted(os.listdir(FILM_NOTES)) if os.path.isdir(FILM_NOTES) else []:
    if not fn.endswith('.md'): continue
    stem = fn[:-3]
    d, body = front(open(os.path.join(FILM_NOTES, fn), encoding='utf-8').read())
    director = d.get('author') or ''
    director = ', '.join(director) if isinstance(director, list) else director
    aliases = d.get('aliases') or []
    aliases = [aliases] if isinstance(aliases, str) else aliases
    keys = {loose(display(stem))} | {loose(a) for a in aliases}
    hits = [f for f in films if loose(f['t']) in keys]
    f = max(hits, key=lambda f: (f.get('r') or 0, f.get('added') or '')) if hits else None
    sec = sections(body)
    idea_md = '\n'.join(v for k, v in sec.items() if k not in ('Summary', 'Significance', 'References', 'Characters'))
    entry = {
        'note': stem, 'title': display(stem), 'author': director,
        'film': f"{f['t']}|{f['y']}" if f else None,
        'summary': clean(sec.get('Summary', '')),
        'significance': clean(sec.get('Significance', '')),
        'ideas': links(idea_md),
        'inGraph': stem in graph,
    }
    entry['ideasInGraph'] = [t for t in entry['ideas'] if t in graph]
    film_out.append(entry)
    if not f: film_unmatched.append(stem)

# titles worth linking wherever the site mentions them: works, my writings, maps of content
SKIP_MOC = {'quote bank', 'writing ideas'}
link_out, seen = [], set()
for folder in ['2 - Source Material', '3 - Writings', '4 - Maps of Content']:
    base = os.path.join(VAULT, folder)
    for dirpath, _, files in os.walk(base):
        for fn in files:
            if not fn.endswith('.md'): continue
            stem = fn[:-3]
            if stem not in graph or stem in SKIP_MOC: continue
            d, _ = front(open(os.path.join(dirpath, fn), encoding='utf-8').read())
            aliases = d.get('aliases') or []
            aliases = [aliases] if isinstance(aliases, str) else aliases
            for text in [display(stem)] + [a for a in aliases if isinstance(a, str)]:
                text = re.sub(r'\s*\([^)]*\)\s*$', '', text).strip()   # drop a trailing note like (Unfinished)
                if len(text) >= 3 and text.lower() not in seen:
                    seen.add(text.lower()); link_out.append([text, stem])

path = os.path.join(ROOT, 'data', 'notes.js')
with open(path, 'w', encoding='utf-8', newline='\n') as f:
    f.write('/* Generated by tools/import-book-notes.py on %s from the Obsidian vault. Re-run the script; do not edit by hand. */\n' % datetime.date.today())
    f.write('window.NOTES = ')
    json.dump({'books': out, 'films': film_out, 'links': link_out}, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(f'wrote {path}: {len(out)} notes, {len(out) - len(unmatched)} matched to Goodreads books')
if unmatched: print('  no matching book on the site:', ', '.join(unmatched))
print(f'  {len(film_out)} film notes, {len(film_out) - len(film_unmatched)} matched; {len(link_out)} linkable titles')
if film_unmatched: print('  no matching film on the site:', ', '.join(film_unmatched))
