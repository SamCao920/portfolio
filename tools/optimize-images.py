"""Shrinks the site's photos and strips their EXIF (GPS, camera), in place.

Usage:  python3 tools/optimize-images.py        (needs Pillow: pip install pillow)

- Every image under assets/ loses its EXIF. assets/art (original scans, not used by any page) is left alone.
- Images the site uses (paths in data/*.js) are capped at 2000 px on the long side and re-saved
  when that makes them smaller. A PNG photo without transparency becomes .jpg, a large PNG with
  transparency becomes .webp, and data/content.js is updated to the new name.
- Studio images get a small copy in assets/studio/thumbs/<name>.webp for the grid.
Admin does the same to new uploads, so this is only needed for files added another way.
"""
import glob, io, os, re
from PIL import Image, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
IMG = re.compile(r'\.(jpe?g|png|webp)$', re.I)
SKIP = ("assets/art/", "assets/website/", "assets/studio/thumbs/")
MAX, THUMB = 2000, 800

def encode(im, fmt, **kw):
    b = io.BytesIO(); im.save(b, fmt, **kw); return b.getvalue()

def has_alpha(im):
    if im.mode not in ("RGBA", "LA", "PA", "P"): return False
    if im.mode == "P" and "transparency" not in im.info: return False
    return im.convert("RGBA").getextrema()[3][0] < 255

def main():
    data = {f: open(f, encoding="utf-8").read() for f in glob.glob("data/*.js")}
    used = set()
    for t in data.values(): used |= set(re.findall(r'"(assets/[^"]+?\.(?:jpe?g|png|webp))"', t, re.I))
    renames, saved = {}, 0
    for f in sorted(glob.glob("assets/**/*", recursive=True)):
        f = f.replace(os.sep, "/")
        if not IMG.search(f) or f.startswith(SKIP) or not os.path.isfile(f): continue
        before = os.path.getsize(f)
        im = Image.open(f); fmt = im.format
        exif = bool(im.getexif()) or "exif" in im.info
        if f not in used and not exif: continue
        im = ImageOps.exif_transpose(im)
        resized = f in used and max(im.size) > MAX
        if resized: im.thumbnail((MAX, MAX), Image.LANCZOS)
        worth = lambda b: exif or resized or len(b) < before * 0.9   # re-encoding a JPEG again for a 2% gain only loses quality
        out, new = None, f
        if fmt == "PNG" and f in used and before > 300_000:
            if has_alpha(im): out, new = encode(im, "WEBP", quality=88, method=6), f[:-4] + ".webp"
            else: out, new = encode(im.convert("RGB"), "JPEG", quality=86, optimize=True, progressive=True), f[:-4] + ".jpg"
        elif fmt == "JPEG":
            out = encode(im.convert("RGB"), "JPEG", quality=86, optimize=True, progressive=True)
            if not worth(out): out = None
        elif fmt == "PNG":
            out = encode(im, "PNG", optimize=True)
            if not worth(out): out = None
        elif fmt == "WEBP":
            out = encode(im, "WEBP", quality=88, method=6)
            if not worth(out): out = None
        if out is None: continue
        if new != f and os.path.exists(new): new = new[:new.rfind(".")] + "-web" + new[new.rfind("."):]
        open(new, "wb").write(out)
        if new != f: os.remove(f); renames[f] = new
        saved += before - len(out)
        print(f"{f}: {before // 1024} KB -> {len(out) // 1024} KB" + (f" as {new}" if new != f else "") + (" (EXIF removed)" if exif else ""))
    for f, t in data.items():
        n = t
        for a, b in renames.items(): n = n.replace(f'"{a}"', f'"{b}"')
        if n != t: open(f, "w", encoding="utf-8", newline="\n").write(n)
    # thumbnails for the studio grid
    os.makedirs("assets/studio/thumbs", exist_ok=True)
    for f in sorted(glob.glob("assets/studio/*")):
        if not IMG.search(f): continue
        t = os.path.join("assets/studio/thumbs", os.path.splitext(os.path.basename(f))[0] + ".webp")
        if os.path.exists(t) and os.path.getmtime(t) >= os.path.getmtime(f): continue
        im = ImageOps.exif_transpose(Image.open(f)); im.thumbnail((THUMB, THUMB), Image.LANCZOS)
        im.save(t, "WEBP", quality=78, method=6)
        print(f"thumb {t}: {os.path.getsize(t) // 1024} KB")
    print(f"saved {saved // 1024} KB")

if __name__ == "__main__":
    main()
