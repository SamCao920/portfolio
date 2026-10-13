/* covers.js: finds a cover image for a book, film or piece of music from free public sources.
   window.findCover(item) resolves to an image URL or null. Used by site.js (to fill missing covers
   for visitors) and admin.js (to save a cover into the data when you log something).

   item: { kind: "book" | "film" | "watch" | "album" | "queue", t: title, a: author/artist/composer,
           y: year, form: "album" | "song" | "work", isbn, sp: "album/ID" or "track/ID" }

   Sources, tried in order until one gives a believable match:
     music: Spotify link (oEmbed) → Apple iTunes Search → Deezer
     books: Open Library → Google Books → Apple Books (iTunes)
     films: Wikipedia → Apple iTunes (movies)
   Apple and Deezer are called with JSONP, which works from any page without CORS. */
(function () {
  const TIMEOUT = 6000;
  const norm = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const words = s => norm(s).replace(/[^\p{L}\p{N}]+/gu, " ").split(" ").filter(Boolean);
  const STOP = new Set(["the", "and", "for", "with", "from", "minor", "major", "flat", "sharp", "part", "op", "no", "in", "a", "of", "de", "la", "le", "der", "die", "das", "und"]);

  /* JSONP: inject a <script> whose callback receives the JSON */
  let seq = 0;
  function jsonp(url) {
    return new Promise(resolve => {
      const name = "__cv" + Date.now().toString(36) + (seq++);
      const s = document.createElement("script");
      const done = v => { clearTimeout(timer); try { delete window[name]; } catch (e) { window[name] = undefined; } s.remove(); resolve(v); };
      const timer = setTimeout(() => done(null), TIMEOUT);
      window[name] = data => done(data);
      s.onerror = () => done(null);
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + name;
      document.head.appendChild(s);
    });
  }
  async function json(url) {
    const ctl = "AbortController" in window ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), TIMEOUT);
    try { const r = await fetch(url, ctl ? { signal: ctl.signal } : {}); return r.ok ? await r.json() : null; }
    catch (e) { return null; } finally { clearTimeout(timer); }
  }

  /* does a search hit plausibly belong to this item? the creator's surname and most key title words must appear */
  function believable(it, hay) {
    const h = " " + words(hay).join(" ") + " ";
    const who = words(it.a).filter(w => w.length > 2);
    if (who.length && !h.includes(" " + who[who.length - 1] + " ") && !who.some(w => w.length > 3 && h.includes(" " + w + " "))) return false;
    const key = words(it.t).filter(w => !STOP.has(w) && (w.length > 2 || /\d/.test(w))).slice(0, 4);
    if (!key.length) return true;
    const hit = key.filter(w => h.includes(" " + w + " ")).length;
    return hit >= Math.ceil(key.length * 0.6);
  }
  const big = (url, size) => url ? url.replace(/\/\d+x\d+bb(-\d+)?\.(jpg|png|webp)$/, `/${size}bb.$2`).replace(/^http:/, "https:") : null;

  /* ---------- music ---------- */
  async function spotify(it) {
    if (!it.sp) return null;
    const j = await json("https://open.spotify.com/oembed?url=" + encodeURIComponent("https://open.spotify.com/" + it.sp));
    return j && j.thumbnail_url || null;
  }
  async function itunesMusic(it) {
    const entity = it.form === "album" || !it.form ? "album" : "song";
    const term = `${it.t} ${it.a || ""}`.replace(/[“”"]/g, "").trim();
    const j = await jsonp(`https://itunes.apple.com/search?media=music&entity=${entity}&limit=15&term=${encodeURIComponent(term)}`);
    const r = j && (j.results || []).find(x => believable(it, `${x.trackName || ""} ${x.collectionName || ""} ${x.artistName || ""}`));
    return r ? big(r.artworkUrl100, "600x600") : null;
  }
  async function deezer(it) {
    const type = it.form === "album" || !it.form ? "album" : "track";
    const j = await jsonp(`https://api.deezer.com/search/${type}?output=jsonp&limit=15&q=${encodeURIComponent(`${it.t} ${it.a || ""}`)}`);
    const r = j && (j.data || []).find(x => believable(it, `${x.title || ""} ${(x.album || {}).title || ""} ${(x.artist || {}).name || ""}`));
    return r ? (r.cover_xl || r.cover_big || (r.album && (r.album.cover_xl || r.album.cover_big))) || null : null;
  }

  /* ---------- books ---------- */
  async function openLibrary(it) {
    const q = new URLSearchParams({ title: it.t, author: it.a || "", limit: 3, fields: "cover_i,title,author_name" });
    const j = await json("https://openlibrary.org/search.json?" + q);
    const d = j && (j.docs || []).find(x => x.cover_i && believable(it, `${x.title} ${(x.author_name || []).join(" ")}`));
    return d ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null;
  }
  async function googleBooks(it) {
    const q = `intitle:${it.t}` + (it.a ? ` inauthor:${it.a}` : "");
    const j = await json("https://www.googleapis.com/books/v1/volumes?maxResults=5&q=" + encodeURIComponent(q));
    const v = j && (j.items || []).map(x => x.volumeInfo || {}).find(x => x.imageLinks && believable(it, `${x.title} ${(x.authors || []).join(" ")}`));
    if (!v) return null;
    return (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail).replace(/^http:/, "https:").replace("&edge=curl", "").replace(/zoom=\d/, "zoom=1");
  }
  async function appleBooks(it) {
    const j = await jsonp(`https://itunes.apple.com/search?media=ebook&limit=10&term=${encodeURIComponent(`${it.t} ${it.a || ""}`)}`);
    const r = j && (j.results || []).find(x => believable(it, `${x.trackName || ""} ${x.artistName || ""}`));
    return r ? big(r.artworkUrl100, "400x600") : null;
  }

  /* ---------- films ---------- */
  async function wikipedia(it) {
    const q = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `${it.t} ${it.y || ""} film`, gsrlimit: 1,
      prop: "pageimages", piprop: "thumbnail", pithumbsize: 342, pilicense: "any", format: "json", origin: "*" });
    const j = await json("https://en.wikipedia.org/w/api.php?" + q);
    const pg = j && j.query && Object.values(j.query.pages)[0];
    return (pg && pg.thumbnail && pg.thumbnail.source) || null;
  }
  async function appleMovies(it) {
    const j = await jsonp(`https://itunes.apple.com/search?media=movie&entity=movie&limit=10&term=${encodeURIComponent(it.t)}`);
    const want = words(it.t).join(" ");
    const r = j && (j.results || []).find(x => words(x.trackName).join(" ") === want && (!it.y || String(x.releaseDate || "").startsWith(String(it.y))))
      || j && (j.results || []).find(x => words(x.trackName).join(" ") === want);
    return r ? big(r.artworkUrl100, "400x600") : null;
  }

  async function firstOf(it, fns) {
    for (const f of fns) {
      try { const url = await f(it); if (url) return url; } catch (e) { /* try the next source */ }
    }
    return null;
  }
  window.findCover = it => {
    if (it.kind === "book") return firstOf(it, [openLibrary, googleBooks, appleBooks]);
    if (it.kind === "album" || it.kind === "queue") return firstOf(it, [spotify, itunesMusic, deezer]);
    return firstOf(it, [wikipedia, appleMovies]);
  };
})();
