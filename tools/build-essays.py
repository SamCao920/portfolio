#!/usr/bin/env python3
"""
Typeset the essay PDFs as pages of the site: essays/<slug>.html, in the site's own type.

    python3 tools/build-essays.py

Reads data/content.js for the papers (entries of type essay or research whose link is a PDF in assets/),
reads each PDF's text with poppler's `pdftohtml -xml`, and rebuilds paragraphs, headings, italics, block
quotations, footnotes and the bibliography from the position and size of each line. The PDF stays the
source of truth and is linked from the page. Re-run after replacing a PDF.
"""
import collections, html, json, os, re, subprocess, sys, tempfile, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'essays')


# Things the positions on the page cannot tell us, by essay: text to drop, and what to put where a table or figure stood.
EXTRA = {
    'beyond-carbon-subsidies': {
        'table': '''<figure class="tbl"><table><thead><tr><th></th><th>Carbon pricing</th><th>Energy subsidy</th></tr></thead><tbody>
<tr><th><i>Emissions impact</i></th><td>Substantially reduces emissions; highly effective in reducing CO₂.</td><td>Minimal impact; often leads to only slight or no decreases in emissions.</td></tr>
<tr><th><i>Cost-effectiveness</i></th><td>Lower costs; generates revenue; more economically efficient.</td><td>Higher costs; less efficient due to high marginal abatement costs.</td></tr>
<tr><th><i>Feasibility</i></th><td>Politically challenging, though public support is rising.</td><td>Popular and feasible; perceived by voters as beneficial.</td></tr>
</tbody></table></figure>''',
        'figures': {'Figure 2.': '../assets/essays/carbon-tax-cap-and-trade.png'},
    },
    'why-one-child': {'drop': [r'^Fangyuan Cao\b', r'^Miramonte High School']},
}


def slug(t):
    t = unicodedata.normalize('NFKD', t.lower())
    return re.sub(r'\s+', '-', re.sub(r'[^\w\s-]', '', t).strip())


def papers():
    src = open(os.path.join(ROOT, 'data', 'content.js'), encoding='utf-8').read()
    site = json.loads(src[src.index('{'):src.rstrip().rstrip(';').rindex('}') + 1])
    return [w for w in site.get('writings', []) if w.get('type') in ('essay', 'research') and str(w.get('link', '')).lower().endswith('.pdf')]


def read_pdf(path):
    """-> pages: list of lines; a line is {top, left, right, runs: [(text, size, bold, italic)]}"""
    with tempfile.TemporaryDirectory() as d:
        subprocess.run(['pdftohtml', '-xml', '-i', '-q', '-nodrm', path, os.path.join(d, 'o')], check=True)
        x = open(os.path.join(d, 'o.xml'), encoding='utf-8').read()
    pages = []
    for pm in re.finditer(r'<page number="\d+"[^>]*height="(\d+)" width="(\d+)">(.*?)</page>', x, re.S):
        sizes = dict((a, int(b)) for a, b in re.findall(r'<fontspec id="(\d+)" size="(\d+)"', x[:pm.end()]))
        items = []
        for m in re.finditer(r'<text top="(\d+)" left="(\d+)" width="(\d+)" height="(\d+)" font="(\d+)">(.*?)</text>', pm.group(3), re.S):
            top, left, width, height, font, inner = int(m[1]), int(m[2]), int(m[3]), int(m[4]), m[5], m[6]
            bold, ital = '<b>' in inner, '<i>' in inner
            text = html.unescape(re.sub(r'<[^>]+>', '', inner))
            if text == '': continue
            items.append(dict(top=top, left=left, right=left + width, h=height, size=sizes.get(font, 0), text=text, bold=bold, ital=ital))
        pages.append(dict(h=int(pm[1]), w=int(pm[2]), items=items))
    return pages


def convert(path, extra=None):
    extra = extra or {}
    pages = read_pdf(path)
    count = collections.Counter()
    for p in pages:
        for it in p['items']: count[it['size']] += len(it['text'])
    body = count.most_common(1)[0][0]
    tiny = lambda it: it['size'] <= body * 0.72            # superscript numerals
    margin = collections.Counter(it['left'] for p in pages for it in p['items'] if it['size'] == body).most_common(1)[0][0]

    blocks, notes = [], {}          # blocks: [kind, html]; notes: number -> html
    cur = None                      # the open paragraph: [kind, [parts]]
    state = dict(bib=False, note=None, endnotes=False, table=False)

    def run_html(it):
        t = html.escape(it['text'], quote=False)
        if it['ital'] and t.strip(): t = re.sub(r'^(\s*)(.*?)(\s*)$', r'\1<i>\2</i>\3', t, flags=re.S)
        return t

    nj = lambda its: (lambda t: t.rstrip() if re.search(r'[\w/]-\s*$', t) and not re.search(r'\s-\s*$', t) else t + ' ')(''.join(run_html(i) for i in its))
    gap_from = lambda pb, ln: (ln['top'] - pb) if pb is not None else 0

    def close():
        nonlocal cur
        if cur:
            text = re.sub(r'\s+', ' ', ''.join(cur[1])).strip()
            text = re.sub(r'</i>(\s*)<i>', r'\1', text)
            text = re.sub(r'(\w)- (\w)', lambda m: m[0] if False else m[1] + '-' + m[2], text) if False else text
            if text: blocks.append([cur[0], text])
        cur = None

    for p in pages:
        # group into lines: superscripts sit a few pixels above the line they belong to
        items = sorted(p['items'], key=lambda it: (it['top'], it['left']))
        lines = []
        for it in items:
            base = it['top'] + it['h']
            home = None
            for ln in reversed(lines[-4:]):
                if abs(ln['base'] - base) <= 9 or (tiny(it) and it['left'] > ln['left'] + 8 and ln['top'] - 6 <= it['top'] <= ln['base']) or (ln['tiny'] and it['top'] - 6 <= ln['top'] <= base):
                    home = ln; break
            if home is None:
                home = dict(top=it['top'], base=base, items=[], tiny=tiny(it), left=it['left']); lines.append(home)
            home['items'].append(it); home['left'] = min(home['left'], it['left'])
            if not tiny(it): home['top'], home['base'], home['tiny'] = min(home['top'], it['top']) if not home['tiny'] else it['top'], max(home['base'], base) if not home['tiny'] else base, False
        lines.sort(key=lambda ln: ln['top'])
        for ln in lines: ln['items'].sort(key=lambda it: it['left'])

        # where the footnotes start on this page: the first line that opens with a superscript number at the margin, in smaller type than the body
        foot = None
        for k, ln in enumerate(lines):
            its = ln['items']
            if tiny(its[0]) and re.fullmatch(r'\s*\d+\s*', its[0]['text']) and its[0]['left'] <= margin + 25 and ln['top'] > p['h'] * 0.3:
                rest = [i for i in its[1:] if i['text'].strip()]
                nxt = rest or [i for l2 in lines[k + 1:k + 2] for i in l2['items']]
                if nxt and nxt[0]['size'] < body: foot = k; break

        prev_bottom, prev_lefts = None, set()
        hanging_p = lambda left, gap: bool(cur and cur[0] == 'p' and left in prev_lefts and gap <= body * 1.4)
        for k, ln in enumerate(lines):
            its = ln['items']
            text = ''.join(i['text'] for i in its).strip()
            if not text: continue
            left = min(i['left'] for i in its if i['text'].strip())
            in_foot = foot is not None and k >= foot
            # running heads and page numbers
            if re.fullmatch(r'\d{1,3}', text) and (ln['top'] < p['h'] * 0.09 or ln['top'] > p['h'] * 0.9 or left > p['w'] * 0.6) and not in_foot and not tiny(its[0]): continue
            if ln['top'] < p['h'] * 0.12 and re.fullmatch(r'[A-Z][a-z]+ \d{1,3}', text): continue
            if any(re.search(d, text) for d in extra.get('drop', [])): continue
            # a table row: text in columns, with wide gaps between
            solid = [i for i in its if i['text'].strip()]
            if 'table' in extra and (any(b['left'] - a['right'] > 40 for a, b in zip(solid, solid[1:])) or (state['table'] and gap_from(prev_bottom, ln) < body * 4 and not re.match(r'Table \d', text) and left != margin and left != margin + 54)):
                if not state['table']: close(); blocks.append(['raw', extra.get('table', '')]); state['table'] = True
                prev_bottom = ln['base']; continue
            if re.match(r'(Table|Figure) \d+\.', text) and len(text) < 160:
                close(); state['table'] = False
                img = next((v for k2, v in extra.get('figures', {}).items() if text.startswith(k2)), None)
                cap = html.escape(re.sub(r'\s+', ' ', text), quote=False)
                if img: blocks.append(['raw', f'<figure class="plate"><img alt="" loading="lazy" src="{img}"><figcaption>{cap}</figcaption></figure>'])
                elif blocks and blocks[-1][0] == 'raw' and blocks[-1][1].endswith('</figure>'): blocks[-1][1] = blocks[-1][1][:-9] + f'<figcaption>{cap}</figcaption></figure>'
                else: blocks.append(['cap', cap])
                prev_bottom = ln['base']; continue
            state['table'] = False

            if state['endnotes']:
                if tiny(its[0]) and re.fullmatch(r'\s*\d+\s*', its[0]['text']):
                    state['note'] = int(its[0]['text']); notes.setdefault(state['note'], []); its = its[1:]
                if state['note'] is not None and not (all(i['ital'] or i['bold'] for i in solid) and left > margin + 150 and len(text) < 40):
                    notes[state['note']].append(nj(its)); prev_bottom = ln['base']; continue

            if in_foot:
                if tiny(its[0]) and re.fullmatch(r'\s*\d+\s*', its[0]['text']):
                    state['note'] = int(its[0]['text']); notes.setdefault(state['note'], []); its = its[1:]
                if state['note'] is not None:
                    notes[state['note']].append(nj(its))
                continue

            allbold = all(i['bold'] for i in its if i['text'].strip())
            big = max(i['size'] for i in its) > body + 1
            parts = []
            for i in its:
                if tiny(i) and re.fullmatch(r'\s*\d+\s*', i['text']):
                    n = int(i['text']); parts.append(f'<sup><a href="#fn{n}" id="r{n}">{n}</a></sup>')
                else: parts.append(run_html(i))
            line = ''.join(parts)
            line = line.rstrip() if re.search(r'[a-z]-\s*$', line) and not re.search(r'\s-\s*$', line) else line + ' '       # a word broken across lines keeps its hyphen, without a space
            gap = (ln['top'] - prev_bottom) if prev_bottom is not None else 0
            prev_bottom = ln['base']

            centred_ital = all(i['ital'] for i in solid) and left > margin + 150 and len(text) < 40
            numbered = bool(re.fullmatch(r'\d{1,2}\.\s+[A-Z][^.]{2,70}', text))
            if (allbold or big or centred_ital or numbered) and len(text) < 110:
                close()
                t = re.sub(r'\s+', ' ', text)
                if blocks and blocks[-1][0] == 'h' and (re.fullmatch(r'[IVX]+\.?', blocks[-1][1]) or blocks[-1][2] == ln['top']): blocks[-1][1] += ' ' + t; blocks[-1][2] = ln['top']
                else: blocks.append(['h', t, ln['top']])
                name = blocks[-1][1].strip()
                state['bib'] = bool(re.match(r'(bibliography|works cited|references)\b', name, re.I)) or (state['bib'] and not re.match(r'[IVX]+\.', t))
                state['endnotes'] = bool(re.fullmatch(r'(end ?notes|notes)', name, re.I))
                if state['endnotes']: blocks.pop(); state['note'] = None
                continue
            indent = left - margin
            if state['bib']:
                if indent < 12 or cur is None: close(); cur = ['bib', []]
                cur[1].append(line); continue
            kind = 'quote' if indent >= 90 and (cur is None or cur[0] == 'quote' or gap > body * 1.4) and not hanging_p(left, gap) else 'p'
            hanging = left in prev_lefts and gap <= body * 1.4        # the next line of a list item or an indented block
            starts = cur is None or cur[0] != kind or (kind == 'p' and 30 <= indent and not hanging) or gap > body * 2.3 or bool(re.match(r'\((?:[ivx]+|\d+|[a-z])\)\s', text))
            if kind == 'quote' and cur and cur[0] == 'quote' and gap <= body * 1.9: starts = False
            if starts: close(); cur = [kind, []]
            cur[1].append(line); prev_lefts = set(i['left'] for i in solid)
        # a paragraph may run on to the next page
    close()
    notes = {n: re.sub(r'</i>(\s*)<i>', r'\1', re.sub(r'\s+', ' ', ''.join(v)).strip()) for n, v in notes.items()}
    return blocks, notes


def stamp(rel):
    import hashlib
    return hashlib.md5(open(os.path.join(ROOT, rel), 'rb').read().replace(b'\r\n', b'\n')).hexdigest()[:8]


def page(w, blocks, notes):
    title = w['title']
    # drop the title page matter that repeats what the header already says
    while blocks and blocks[0][0] == 'h' and (slug(blocks[0][1])[:18] == slug(title)[:18] or blocks[0][1].isupper()): blocks.pop(0)
    out, sub = [], []
    seen_h = False
    for b in blocks:
        kind, t = b[0], b[1]
        if kind == 'h':
            seen_h = True
            out.append(f'<h2 id="{slug(t)}">{html.escape(t, quote=False)}</h2>')
        elif kind == 'raw': out.append(t)
        elif kind == 'cap': out.append(f'<p class="cap">{t}</p>')
        elif kind == 'bib': out.append(f'<p class="bib">{t}</p>')
        elif kind == 'quote': out.append(f'<blockquote><p>{t}</p></blockquote>')
        else: out.append(f'<p>{t}</p>')
    meta = '. '.join(x for x in [w.get('venue', ''), w.get('award', ''), re.sub(r'<[^>]+>', '', w.get('result', ''))] if x)
    foot = ''
    if notes:
        foot = '<section class="notes"><h2 id="notes">Notes</h2><ol>' + ''.join(
            f'<li id="fn{n}" value="{n}">{t} <a class="back" href="#r{n}" aria-label="Back to the text">↩</a></li>' for n, t in sorted(notes.items())) + '</ol></section>'
    desc = html.escape(re.sub(r'<[^>]+>', '', w.get('claim', '')), quote=True)
    pdf = html.escape(w['link'], quote=True)
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)} · Fangyuan Cao</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:title" content="{html.escape(title, quote=True)}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="https://fangyuancao.me/assets/share/home.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="https://fangyuancao.me/essays/{slug(title)}.html">
<link rel="icon" href="../assets/website/my-notion-face-transparent.ico" type="image/x-icon">
<link rel="preload" href="../assets/fonts/newcm/newcm-book.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="../assets/paper.css?v={stamp('assets/paper.css')}">
</head>
<body data-page="essay">
<main class="essay">
  <a class="back" href="../index.html#work">← Sam Cao</a>
  <header>
    <h1>{html.escape(title, quote=False)}</h1>
    <p class="byline">Fangyuan Cao</p>
    {f'<p class="meta">{html.escape(meta, quote=False)}.</p>' if meta else ''}
    <p class="meta"><a href="../{pdf}">The original PDF</a></p>
  </header>
  <article>
{chr(10).join(out)}
  </article>
  {foot}
  <p class="fin"><span class="qed" role="img" aria-label="end"></span></p>
</main>
<script src="../assets/essay.js?v={stamp('assets/essay.js')}"></script>
</body>
</html>
'''


def main():
    os.makedirs(OUT, exist_ok=True)
    for w in papers():
        blocks, notes = convert(os.path.join(ROOT, w['link']), EXTRA.get(slug(w['title'])))
        refs = set(int(n) for b in blocks for n in re.findall(r'id="r(\d+)"', b[1]))
        path = os.path.join(OUT, slug(w['title']) + '.html')
        open(path, 'w', encoding='utf-8', newline='\n').write(page(w, blocks, notes))
        words = sum(len(re.sub(r'<[^>]+>', '', b[1]).split()) for b in blocks if b[0] != 'raw')
        print(f"{os.path.relpath(path, ROOT)}: {len(blocks)} blocks, {words} words, {len(notes)} notes, {len(refs)} note marks" + ('' if refs == set(notes) else f'  (marks without notes: {sorted(refs - set(notes))[:8]}, notes without marks: {sorted(set(notes) - refs)[:8]})'))


if __name__ == '__main__':
    sys.exit(main())
