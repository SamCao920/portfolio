#!/usr/bin/env python3
"""
Stamp each CSS/JS reference in the HTML pages with a short hash of the file (?v=1a2b3c4d),
so browsers fetch the new version as soon as it changes instead of showing a cached copy.
Runs automatically before every commit (.git/hooks/pre-commit) and in tools/update-site.ps1.
"""
import hashlib, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = re.compile(r'((?:src|href)=")((?:assets|data)/[^"?#]+\.(?:js|css))(?:\?v=[0-9a-f]*)?(")')

def stamp(m):
    path = os.path.join(ROOT, m.group(2))
    if not os.path.exists(path):
        return m.group(0)
    h = hashlib.md5(open(path, 'rb').read()).hexdigest()[:8]
    return f'{m.group(1)}{m.group(2)}?v={h}{m.group(3)}'

changed = []
for fn in sorted(os.listdir(ROOT)):
    if not fn.endswith('.html'):
        continue
    p = os.path.join(ROOT, fn)
    s = open(p, encoding='utf-8', newline='').read()
    t = REF.sub(stamp, s)
    if t != s:
        open(p, 'w', encoding='utf-8', newline='').write(t); changed.append(fn)
print('cache stamps updated:', ', '.join(changed) if changed else 'none')
