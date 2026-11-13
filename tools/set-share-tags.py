# Per-page link previews: title, description and a 1200x630 card for every page.
import glob, re, sys, os
root = sys.argv[1]
META = {
 'home':     ('Fangyuan Cao', 'Sam (Fangyuan) Cao, Johns Hopkins. Essays on political economy, philosophy and history, notes, and the books, films and art I love.', 'home'),
 'vault':    ('The Vault · Sam Cao', 'A live, interactive map of Sam Cao’s reading notes and the links between them.', 'vault'),
}
esc = lambda s: s.replace('&', '&amp;').replace('"', '&quot;')
for f in glob.glob(os.path.join(root, '*.html')):
    h = open(f, encoding='utf-8').read()
    m = re.search(r'<body data-page="(\w+)"', h)
    if not m or m.group(1) not in META: continue
    title, desc, card = META[m.group(1)]
    img = f'https://fangyuancao.me/assets/share/{card}.jpg'
    h = re.sub(r'<meta name="description" content="[^"]*">', f'<meta name="description" content="{esc(desc)}">', h, count=1)
    h = re.sub(r'<meta property="og:title" content="[^"]*">', f'<meta property="og:title" content="{esc(title)}">', h, count=1)
    h = re.sub(r'<meta property="og:description" content="[^"]*">', f'<meta property="og:description" content="{esc(desc)}">', h, count=1)
    h = re.sub(r'<meta property="og:image" content="[^"]*">(\r?\n<meta property="og:image:[^>]*>)*', f'<meta property="og:image" content="{img}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">', h, count=1)
    h = re.sub(r'<meta name="twitter:card" content="[^"]*">(\r?\n<meta name="twitter:(title|description|image)"[^>]*>)*',
               f'<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="{esc(title)}">\n<meta name="twitter:description" content="{esc(desc)}">\n<meta name="twitter:image" content="{img}">', h, count=1)
    open(f, 'w', encoding='utf-8', newline='').write(h)
    print(os.path.basename(f), '->', card)
