"""Download a poster for every film in data/films.js that has none, save it to
assets/films/<slug>.webp (300px wide) and write "cover" into the data.

Usage: python3 tools/fetch-film-posters.py
Finds each film's page from its boxd.it link (or its title when there is none) and takes
the poster from the page's structured data. Only the image is kept; no links are added.
Re-running skips films that already have a cover."""
import io, json, re, sys, time, unicodedata, urllib.request
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "films.js"
OUT = ROOT / "assets" / "films"
UA = {"User-Agent": "Mozilla/5.0 (fangyuancao.me poster fetch)"}

def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.geturl(), r.read()

def slugify(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")

def page_for(f):
    urls = [f["uri"]] if f.get("uri") else []
    s = slugify(f["t"])
    if f.get("y"): urls.append(f"https://letterboxd.com/film/{s}-{f['y']}/")
    urls.append(f"https://letterboxd.com/film/{s}/")
    for u in urls:
        try:
            final, body = get(u)
        except Exception:
            continue
        html = body.decode("utf-8", "ignore")
        m = re.search(r'application/ld\+json">\s*(?:/\* <!\[CDATA\[ \*/)?\s*(\{.*?\})\s*(?:/\* \]\]> \*/)?\s*</script>', html, re.S)
        if not m: continue
        try: ld = json.loads(m.group(1))
        except ValueError: continue
        year = str((ld.get("releasedEvent") or [{}])[0].get("startDate", ""))[:4]
        if not f.get("uri") and f.get("y") and year and year != str(f["y"]):
            continue  # a title guess that landed on a different film
        if ld.get("image"):
            return final.rstrip("/").split("/")[-1], ld["image"]
    return None

def main():
    src = DATA.read_text(encoding="utf-8")
    films = json.loads(src[src.index("{"):src.rstrip().rstrip(";").rindex("}") + 1])
    OUT.mkdir(parents=True, exist_ok=True)
    todo = {}
    for f in films["items"] + films["watchlist"]:
        if not f.get("cover"): todo.setdefault((f["t"], f.get("y")), f)
    covers, missed = {}, []
    for n, (key, f) in enumerate(todo.items(), 1):
        try:
            hit = page_for(f)
            if not hit: raise ValueError("no page")
            slug, img = hit
            path = OUT / f"{slug}.webp"
            if not path.exists():
                im = Image.open(io.BytesIO(get(img)[1])).convert("RGB")
                im.thumbnail((300, 450))
                im.save(path, "WEBP", quality=78)
            covers[key] = f"assets/films/{slug}.webp"
            print(f"{n}/{len(todo)} {f['t']}", flush=True)
        except Exception as e:
            missed.append(f["t"]); print(f"{n}/{len(todo)} MISS {f['t']}: {e}", flush=True)
        time.sleep(0.6)
    # write "cover" into each one-object-per-line entry, leaving the rest of the file as is
    lines = src.split("\n")
    for i, line in enumerate(lines):
        m = re.match(r'(\s*)(\{"t":.*\})(,?)$', line)
        if not m or '"cover"' in line: continue
        f = json.loads(m.group(2))
        c = covers.get((f["t"], f.get("y")))
        if c: lines[i] = f'{m.group(1)}{m.group(2)[:-1]},"cover":{json.dumps(c)}}}{m.group(3)}'
    DATA.write_text("\n".join(lines), encoding="utf-8")
    print(f"done: {len(covers)} covers, {len(missed)} missed: {missed}")

if __name__ == "__main__":
    sys.exit(main())
