#!/usr/bin/env python3
"""
Export the text of every note on the Vault graph to data/vault-notes.js, so visitors can
click a node on the Vault page and read the note.

    python3 tools/export-vault-notes.py [path/to/Commonplace]

Run after tools/build-graph.py (it publishes exactly the notes on the graph).
Markdown is converted to simple HTML here, so the browser needs no parser. Front matter,
embedded files (![[...]]) and %%comments%% are dropped. [[Links]] to other notes on the
graph become links; links to notes that are not on the graph become plain text.
Keep a note's text off the site by adding `publish: false` to its front matter.
"""
import html, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VAULT = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Commonplace')
SKIP = {'.trash', '.obsidian', '.claude', '.claudian', '.pandoc', '5 - Templates', '0 - Assets', '.git'}

graph_html = open(os.path.join(ROOT, 'vault.html'), encoding='utf-8').read()
graph = json.loads(re.search(r'<script id="vault-data" type="application/json">(.*?)</script>', graph_html, re.S).group(1))
TITLES = {n[0] for n in graph['n']}

def front(text):
    m = re.match(r'---\r?\n(.*?)\r?\n---\r?\n?(.*)', text, re.S)
    return (m.group(1), m.group(2)) if m else ('', text)

def inline(s):
    """Escape, then apply inline markdown. Code spans are protected first."""
    codes = []
    def keep_code(m):
        codes.append('<code>' + html.escape(m.group(1), quote=False) + '</code>')
        return f'\x00{len(codes) - 1}\x00'
    s = re.sub(r'`([^`]+)`', keep_code, s)
    s = re.sub(r'!\[\[[^\]]*\]\]', '', s)                     # embeds
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', s)                # images
    links = []
    def wikilink(m):
        target, alias = m.group(1).strip(), m.group(3)
        target = target.split('/')[-1]
        text = (alias or re.sub(r'\.(pdf|canvas)$', '', target)).strip()
        if '#' in text and not alias: text = text.replace('#', ' › ')
        name = target.split('#')[0].strip()
        t = html.escape(text, quote=False)
        if name in TITLES:
            links.append(f'<a class="wl" data-note="{html.escape(name)}">{t}</a>')   # the page fills in href
        else:
            links.append(f'<span class="wl-off">{t}</span>')
        return f'\x01{len(links) - 1}\x01'
    s = re.sub(r'\[\[([^\]|]+?)(\|([^\]]*))?\]\]', wikilink, s)
    def mdlink(m):
        url = m.group(2).strip()
        if not re.match(r'https?://', url): return m.group(1)
        links.append(f'<a href="{html.escape(url)}" target="_blank" rel="noopener">{html.escape(m.group(1), quote=False)}</a>')
        return f'\x01{len(links) - 1}\x01'
    s = re.sub(r'\[([^\]]+)\]\(([^)\s]+)\)', mdlink, s)
    s = html.escape(s, quote=False)
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'__(.+?)__', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?![\w*])', r'<em>\1</em>', s)
    s = re.sub(r'(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?![\w_])', r'<em>\1</em>', s)
    s = re.sub(r'~~(.+?)~~', r'<s>\1</s>', s)
    s = re.sub(r'==(.+?)==', r'<mark>\1</mark>', s)
    s = re.sub(r'\x01(\d+)\x01', lambda m: links[int(m.group(1))], s)
    s = re.sub(r'\x00(\d+)\x00', lambda m: codes[int(m.group(1))], s)
    return s

def convert(md):
    md = re.sub(r'%%.*?%%', '', md, flags=re.S)
    lines = md.replace('\r\n', '\n').split('\n')
    out, para, stack = [], [], []           # stack: list of (indent, tag)
    def flush_para():
        if para:
            out.append('<p>' + inline(' '.join(para)) + '</p>'); para.clear()
    def close_lists(to=-1):
        while stack and stack[-1][0] > to:
            out.append(f'</li></{stack.pop()[1]}>')
    i = 0
    while i < len(lines):
        raw = lines[i]
        line = raw.rstrip()
        if not line.strip():
            flush_para(); i += 1; continue
        if line.strip().startswith('```'):
            flush_para(); close_lists()
            code = []; i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                code.append(lines[i]); i += 1
            out.append('<pre><code>' + html.escape('\n'.join(code), quote=False) + '</code></pre>'); i += 1; continue
        h = re.match(r'^(#{1,6})\s+(.*)$', line)
        if h:
            flush_para(); close_lists()
            lvl = min(6, len(h.group(1)) + 2)
            out.append(f'<h{lvl}>{inline(h.group(2))}</h{lvl}>'); i += 1; continue
        if re.match(r'^\s*(-{3,}|\*{3,}|_{3,})\s*$', line):
            flush_para(); close_lists(); out.append('<hr>'); i += 1; continue
        if line.lstrip().startswith('>'):
            flush_para(); close_lists()
            quote = []
            while i < len(lines) and lines[i].lstrip().startswith('>'):
                quote.append(re.sub(r'^\s*>\s?', '', lines[i])); i += 1
            title = ''
            m = re.match(r'^\[!(\w+)\][+-]?\s*(.*)$', quote[0]) if quote else None
            if m:
                title = m.group(2) or m.group(1).capitalize(); quote = quote[1:]
            body = convert('\n'.join(quote))
            out.append('<blockquote>' + (f'<p class="callout-title">{inline(title)}</p>' if title else '') + body + '</blockquote>')
            continue
        if line.lstrip().startswith('|') and i + 1 < len(lines) and re.match(r'^\s*\|?\s*:?-{2,}', lines[i + 1]):
            flush_para(); close_lists()
            cells = lambda r: [c.strip() for c in r.strip().strip('|').split('|')]
            head = cells(line); i += 2; rows = []
            while i < len(lines) and lines[i].lstrip().startswith('|'):
                rows.append(cells(lines[i])); i += 1
            out.append('<table><thead><tr>' + ''.join(f'<th>{inline(c)}</th>' for c in head) + '</tr></thead><tbody>'
                       + ''.join('<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in rows) + '</tbody></table>')
            continue
        li = re.match(r'^(\s*)([-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?(.*)$', raw)
        if li:
            flush_para()
            indent = len(li.group(1).replace('\t', '    '))
            tag = 'ol' if li.group(2)[0].isdigit() else 'ul'
            if not stack or indent > stack[-1][0]:
                out.append(f'<{tag}><li>'); stack.append((indent, tag))
            else:
                close_lists(indent)
                if stack and stack[-1][0] == indent: out.append('</li><li>')
                else: out.append(f'<{tag}><li>'); stack.append((indent, tag))
            out.append(inline(li.group(3))); i += 1; continue
        if stack and raw[:1] in (' ', '\t'):     # continuation of a list item
            out.append(' ' + inline(line.strip())); i += 1; continue
        close_lists()
        para.append(line.strip()); i += 1
    flush_para(); close_lists()
    return ''.join(out)

notes = {}
for dp, dn, fn in os.walk(VAULT):
    dn[:] = [d for d in dn if d not in SKIP and not d.startswith('.')]
    for f in fn:
        if not f.endswith('.md') or f[:-3] not in TITLES or f[:-3] in notes: continue
        fm, body = front(open(os.path.join(dp, f), encoding='utf-8', errors='ignore').read())
        if re.search(r'^publish:\s*(false|no)\s*$', fm, re.M | re.I):
            notes[f[:-3]] = '<p class="private">This note is private.</p>'; continue
        notes[f[:-3]] = convert(body.strip())

out = os.path.join(ROOT, 'data', 'vault-notes.js')
data = json.dumps(notes, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
new = '/* Generated by tools/export-vault-notes.py from the Obsidian vault. Re-run the script; do not edit by hand. */\nwindow.VAULT_NOTES = ' + data + ';\n'
try:
    if open(out, encoding='utf-8').read() == new:
        print(f'{out}: {len(notes)} notes, unchanged'); sys.exit(0)
except OSError:
    pass
open(out, 'w', encoding='utf-8', newline='\n').write(new)
print(f'wrote {out}: {len(notes)} notes, {len(new) // 1024} KB')
