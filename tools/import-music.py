"""Builds data/music.js from a Spotify Extended Streaming History export.

Usage:  python3 tools/import-music.py "/path/to/Spotify Extended Streaming History" [--covers]

Only rankings are written: top artists, albums and tracks (all time and per year,
split into classical and everything else) and recently played albums. Listening
time is used to rank, but no hours or play counts are published. IP addresses, devices, countries and the raw play log never
leave the export folder. Plays in private sessions and podcasts are left out.

Tracks in any playlist CSV in tools/music-exclude/ (an Exportify export, with a
"Track URI" column) are left out entirely, e.g. a study playlist.
tools/music-classical.txt lists the artists counted as classical.

--covers asks Spotify's public oEmbed service for album art (needs internet; run it
from your own terminal). Found art is cached in tools/music-covers.json, so it is
fetched only once per album.
"""
import csv, glob, json, os, re, sys, time, urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(SITE, "tools", "music-covers.json")
OUT = os.path.join(SITE, "data", "music.js")
MOVED_EAST = "2026-08-15"  # dates before this are Pacific time, after it Eastern
TOP = {"artists": 50, "albums": 60, "tracks": 50}
TOP_YEAR = {"artists": 25, "albums": 30, "tracks": 25}
SIDES = ("classical", "other")
# titles that mark a classical recording: catalogue numbers and classical forms
CLASSICAL_TITLE = re.compile(r"\b(Op\.|BWV|K\.\s?\d|KV\s?\d|Hob\.|RV\s?\d|D\.\s?\d|S\.\s?\d|TH\s?\d|WoO|HWV|Symphon|Concerto|Sonata|Sonate|Quartet|Quintet|Trio in|Nocturne|[EÉ]tude|Prelude|Fugue|Partita|Suite No|Overture|Mass in|Requiem|Waltz,|Mazurka|Polonaise|Rhapsod|Variations|Adagio|Allegro|Andante|Largo|Presto|Scherzo)", re.I)

def load_exclusions():
    uris, names = set(), set()
    for f in glob.glob(os.path.join(SITE, "tools", "music-exclude", "*.csv")):
        with open(f, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if r.get("Track URI"): uris.add(r["Track URI"].strip())
                for a in re.split(r"[;,]", r.get("Artist Name(s)", "")):
                    if r.get("Track Name") and a.strip(): names.add((r["Track Name"].strip().lower(), a.strip().lower()))
    return uris, names

def load_classical():
    """Returns (artists always classical, artists never classical: lines starting with !)."""
    f = os.path.join(SITE, "tools", "music-classical.txt")
    if not os.path.exists(f): return set(), set()
    lines = [l.strip() for l in open(f, encoding="utf-8") if l.strip() and not l.startswith("#")]
    return {l for l in lines if not l.startswith("!")}, {l[1:].strip() for l in lines if l.startswith("!")}

def clean(t):
    t = re.sub(r"\s+-\s+(\d{4}\s+)?(Digitally\s+)?Remaster(ed)?(\s+\d{4})?(\s+Version)?$", "", t, flags=re.I)
    t = re.sub(r"\s+\((\d{4}\s+)?(Digitally\s+)?Remaster(ed)?(\s+\d{4})?\)$", "", t, flags=re.I)
    return t.strip()

def local_date(ts):
    d = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    zone = "America/New_York" if ts[:10] >= MOVED_EAST else "America/Los_Angeles"
    return d.astimezone(ZoneInfo(zone)).date().isoformat()

def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src, want_covers = sys.argv[1], "--covers" in sys.argv
    rows = []
    for f in sorted(glob.glob(os.path.join(src, "Streaming_History_Audio_*.json"))):
        with open(f, encoding="utf-8") as fh:
            rows += json.load(fh)
    if not rows:
        sys.exit("No Streaming_History_Audio_*.json files found in " + src)
    ex_uris, ex_names = load_exclusions()
    plays, excluded = [], 0
    for r in rows:
        if not r.get("master_metadata_track_name") or r.get("incognito_mode") or not r.get("spotify_track_uri"):
            continue
        if r["spotify_track_uri"] in ex_uris or (r["master_metadata_track_name"].strip().lower(), (r["master_metadata_album_artist_name"] or "").strip().lower()) in ex_names:
            excluded += 1
            continue
        plays.append({
            "date": local_date(r["ts"]), "ms": r["ms_played"],
            "artist": r["master_metadata_album_artist_name"] or "Unknown",
            "album": clean(r["master_metadata_album_album_name"] or ""),
            "track": clean(r["master_metadata_track_name"]),
            "id": r["spotify_track_uri"].split(":")[-1],
        })
    plays.sort(key=lambda p: p["date"])

    # classical or not, decided per artist
    listed, never = load_classical()
    ms_all, ms_cl = Counter(), Counter()
    for p in plays:
        ms_all[p["artist"]] += p["ms"]
        if CLASSICAL_TITLE.search(p["track"]) or CLASSICAL_TITLE.search(p["album"]): ms_cl[p["artist"]] += p["ms"]
    classical = {a for a in ms_all if a not in never and (a in listed or ms_cl[a] >= 0.5 * ms_all[a])}
    for p in plays: p["side"] = "classical" if p["artist"] in classical else "other"

    # interned albums and tracks, so period lists are short index arrays
    albums, album_ix, tracks, track_ix = [], {}, [], {}
    album_track = defaultdict(Counter)  # album -> track id -> ms, to pick a representative track
    for p in plays:
        album_track[(p["album"], p["artist"])][p["id"]] += p["ms"]
    def album_i(key):
        if key not in album_ix:
            album_ix[key] = len(albums)
            albums.append({"t": key[0], "a": key[1], "id": album_track[key].most_common(1)[0][0]})
        return album_ix[key]
    def track_i(p):
        key = (p["track"], p["artist"])
        if key not in track_ix:
            track_ix[key] = len(tracks)
            tracks.append({"t": p["track"], "a": p["artist"], "id": p["id"], "al": album_i((p["album"], p["artist"]))})
        return track_ix[key]

    hrs = lambda ms: round(ms / 3.6e6, 1)
    def period(ps, top):
        A, AL, T, TN = Counter(), Counter(), Counter(), Counter()
        for p in ps:
            A[p["artist"]] += p["ms"]; AL[(p["album"], p["artist"])] += p["ms"]
            T[(p["track"], p["artist"])] += p["ms"]
            if p["ms"] >= 30000: TN[(p["track"], p["artist"])] += 1
        first = {}
        for p in ps: first.setdefault((p["track"], p["artist"]), p)
        return {
            "hours": hrs(sum(p["ms"] for p in ps)),
            "plays": sum(1 for p in ps if p["ms"] >= 30000),
            "artists": [[a, hrs(ms)] for a, ms in A.most_common(top["artists"])],
            "albums": [[album_i(k), hrs(ms)] for k, ms in AL.most_common(top["albums"])],
            "tracks": [[track_i(first[k]), hrs(ms), TN[k]] for k, ms in T.most_common(top["tracks"])],
            "artistCount": len(A), "trackCount": len(T),
        }

    by_year = defaultdict(list)
    for p in plays: by_year[p["date"][:4]].append(p)
    years = sorted((y for y, ps in by_year.items() if sum(p["ms"] for p in ps) >= 10 * 3.6e6), reverse=True)
    totals = period(plays, {"artists": 0, "albums": 0, "tracks": 0})
    periods = {}
    for side in SIDES:
        mine = [p for p in plays if p["side"] == side]
        periods[side] = {"all": period(mine, TOP)}
        for y in years: periods[side][y] = period([p for p in by_year[y] if p["side"] == side], TOP_YEAR)

    last = plays[-1]["date"]
    cutoff = datetime.fromisoformat(last).date().toordinal() - 30
    recent_ps = [p for p in plays if datetime.fromisoformat(p["date"]).date().toordinal() > cutoff]
    on_repeat = {side: period([p for p in recent_ps if p["side"] == side], {"artists": 10, "albums": 8, "tracks": 10}) for side in SIDES}
    # every artist with at least an hour, for the admin top-five pickers
    artist_hours = {a: [hrs(ms), "classical" if a in classical else "other"] for a, ms in ms_all.most_common() if ms >= 3.6e6}

    # recently played albums: most recent day each album got at least 10 minutes
    day_album = defaultdict(int)
    for p in plays[-20000:]: day_album[(p["date"], p["album"], p["artist"])] += p["ms"]
    recent, seen = [], set()
    for (d, al, ar), ms in sorted(day_album.items(), key=lambda kv: kv[0][0], reverse=True):
        if ms >= 10 * 60000 and (al, ar) not in seen:
            seen.add((al, ar)); recent.append({"date": d, "al": album_i((al, ar)), "h": hrs(ms), "side": "classical" if ar in classical else "other"})
        if len(recent) == 24: break

    # daily hours for the current year's heatmap
    this_year = last[:4]
    daily = defaultdict(int)
    for p in by_year.get(this_year, []): daily[p["date"]] += p["ms"]

    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    if want_covers:
        need = [a["id"] for a in albums if a["id"] not in cache]
        for n, tid in enumerate(need, 1):
            try:
                url = "https://open.spotify.com/oembed?url=https://open.spotify.com/track/" + tid
                with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=10) as r:
                    cache[tid] = json.load(r).get("thumbnail_url")
            except Exception as e:
                print("cover failed", tid, e)
            if n % 20 == 0: print(f"covers {n}/{len(need)}"); json.dump(cache, open(CACHE, "w"), indent=0)
            time.sleep(0.2)
        json.dump(cache, open(CACHE, "w", encoding="utf-8"), indent=0)
    for a in albums:
        if cache.get(a["id"]): a["cover"] = cache[a["id"]]

    data = {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "since": plays[0]["date"], "until": last,
        "years": [int(y) for y in years],
        "periods": {side: {k: {"artists": [a for a, _ in P["artists"]], "albums": [i for i, _ in P["albums"]], "tracks": [t[0] for t in P["tracks"]]}
                           for k, P in periods[side].items() if P["hours"] > 0} for side in SIDES},
        "recent": [{"date": r["date"], "al": r["al"], "side": r["side"]} for r in recent],
        "artistSide": {a: v[1] for a, v in artist_hours.items()},
        "albums": albums, "tracks": tracks,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("/* Generated by tools/import-music.py from a Spotify export. Re-run the script; do not edit by hand. */\n")
        fh.write("window.MUSIC = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    print(f"left out {excluded} plays of excluded playlist tracks")
    print(f"classical {periods['classical']['all']['hours']} h, other {periods['other']['all']['hours']} h, {len(classical)} classical artists")
    print(f"{len(plays)} plays, {totals['hours']} hours, {len(albums)} albums, {len(tracks)} tracks -> {OUT}")
    print("albums without covers:", sum(1 for a in albums if not a.get("cover")))

if __name__ == "__main__":
    main()
