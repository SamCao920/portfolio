/* site.js: renders every page from window.SITE (data/content.js),
   window.BOOKS (data/books.js) and window.FILMS (data/films.js).
   Each HTML page sets <body data-page="..."> and has an empty <main id="app">. */
(function () {
  const S = window.SITE;
  const page = document.body.dataset.page;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const parse = d => { const [y, m, day] = String(d || "").split("-").map(Number); return { y, m: (m || 1) - 1, d: day || null }; };
  const fmtDate = d => { const p = parse(d); return p.d ? `${MONTHS[p.m]} ${p.d}, ${p.y}` : `${MONTHS[p.m]} ${p.y}`; };
  /* ---------- markdown for anything I write (descriptions, reviews, notes, bios) ----------
     **bold**, *italic* or _italic_, `code`, [text](url), bare links, "- " lists, "1. " lists,
     "> " quotes, "## " headings, a blank line between paragraphs. A video link on a line of its
     own (YouTube, Vimeo, or an .mp4/.webm/.mov file) becomes a player. html: true keeps HTML
     already in the text (older entries use <em>). */
  function videoOf(u) {
    const s = String(u || "").trim();
    let m = s.match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
    if (m) return { kind: "youtube", id: m[1], thumb: `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`, embed: `https://www.youtube-nocookie.com/embed/${m[1]}?rel=0` };
    m = s.match(/^https?:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
    if (m) return { kind: "vimeo", id: m[1], thumb: "", embed: `https://player.vimeo.com/video/${m[1]}` };
    if (/^(?:https?:\/\/\S+|assets\/\S+|[\w./ ()-]+)\.(mp4|webm|mov|m4v)(?:[?#]\S*)?$/i.test(s)) return { kind: "file", src: s, thumb: "" };
    return null;
  }
  const videoPlayer = (v, title) => v.kind === "file"
    ? `<video class="vid" src="${esc(v.src)}" controls playsinline preload="metadata"></video>`
    : `<div class="vid"><iframe src="${esc(v.embed)}" title="${esc(title || "Video")}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
  function mdInline(text, html) {
    const keep = [];
    const hold = h => `\u0000${keep.push(h) - 1}\u0000`;
    let s = String(text);
    if (html) s = s.replace(/<[^>]+>/g, hold); else s = esc(s);
    s = s.replace(/`([^`\n]+)`/g, (m, c) => hold(`<code>${c}</code>`));
    const url = u => html ? u.replace(/&(?!amp;)/g, "&amp;").replace(/"/g, "&quot;") : u;
    const ext = u => /^https?:/.test(u) ? ' target="_blank" rel="noopener"' : "";
    s = s.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|mailto:|assets\/|[\w-]+\.html)[^\s)]*)\)/g, (m, t, u) => hold(`<a href="${url(u)}"${ext(u)}>`) + t + hold("</a>"));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)'"])/g, (m, pre, u) => pre + hold(`<a href="${url(u)}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/, "")}</a>`));
    s = s.replace(/\*\*(\S(?:[^*]*\S)?)\*\*/g, "<strong>$1</strong>").replace(/__(\S(?:[^_]*\S)?)__/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^\w*])\*(\S(?:[^*\n]*\S)?)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^\w])_(\S(?:[^_\n]*\S)?)_(?!\w)/g, "$1<em>$2</em>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, k) => keep[+k]).replace(/\u0000(\d+)\u0000/g, (m, k) => keep[+k]);
  }
  function md(text, opts = {}) {
    if (text == null || text === "") return "";
    const html = !!opts.html, inl = t => mdInline(t, html);
    return String(text).replace(/\r\n/g, "\n").split(/\n\s*\n/).map(b => b.replace(/^\n+|\s+$/g, "")).filter(Boolean).map(b => {
      const lines = b.split("\n");
      const v = lines.length === 1 && videoOf(b.trim().replace(/^<|>$/g, ""));
      if (v) return videoPlayer(v);
      let m = b.match(/^(#{1,4})\s+(.+)$/);
      if (m && lines.length === 1) { const n = Math.min(6, m[1].length + 2); return `<h${n} class="md-h">${inl(m[2])}</h${n}>`; }
      if (lines.every(l => /^\s*[-*•]\s+/.test(l))) return `<ul class="md-list">${lines.map(l => `<li>${inl(l.replace(/^\s*[-*•]\s+/, ""))}</li>`).join("")}</ul>`;
      if (lines.every(l => /^\s*\d+[.)]\s+/.test(l))) return `<ol class="md-list">${lines.map(l => `<li>${inl(l.replace(/^\s*\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`;
      if (lines.every(l => /^\s*(>|&gt;)/.test(l))) return `<blockquote>${inl(lines.map(l => l.replace(/^\s*(>|&gt;)\s?/, "")).join("\n")).replace(/\n/g, "<br>")}</blockquote>`;
      return `<p${opts.cls ? ` class="${opts.cls}"` : ""}>${inl(b).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  window.__md = md;   /* for tests */
  const slug = t => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ---------- data ---------- */
  const BOOKS = ((window.BOOKS || {}).items || []).map((b, i) => ({ ...b, kind: "book", i }));
  /* vault notes linked to books (data/notes.js, from tools/import-book-notes.py) */
  const BOOK_NOTES = ((window.NOTES || {}).books || []);
  BOOKS.forEach(b => { b.notes = BOOK_NOTES.filter(n => n.book === `${b.t}|${b.a}`); });
  const vaultLink = title => "vault.html?note=" + encodeURIComponent(title);
  const FD = window.FILMS || { items: [], diary: [], lists: [], watchlist: [], favorites: [] };
  const FILM_NOTES = ((window.NOTES || {}).films || []);
  const FILMS_ALL = FD.items.map((f, i) => ({ ...f, kind: "film", i, notes: FILM_NOTES.filter(n => n.film === `${f.t}|${f.y}`) }));
  const HIDDEN_FILMS = new Set((S.hiddenFilms || []).map(s => s.normalize("NFKC")));
  const shown = f => f && !HIDDEN_FILMS.has(`${f.t} (${f.y})`.normalize("NFKC"));
  const FILMS = FILMS_ALL.filter(shown);
  const WATCH = FD.watchlist.map((f, i) => ({ ...f, kind: "watch", i }));
  const ART = ((window.ART || {}).items || []).map((a, i) => ({ ...a, kind: "art", i }));
  /* my music log (data/listening.js, written by admin). Each entry is a piece of music at whatever
     size I rate it: an album, a song, or a classical work (rated as a piece; who played it goes on each diary entry). */
  const LD = window.LISTENING || {};
  ["items", "diary", "lists", "queue", "favorites"].forEach(k => { LD[k] = LD[k] || []; });
  const ALBUMS = LD.items.map((m, i) => ({ ...m, kind: "album", i, notes: [] }));
  const QUEUE = LD.queue.map((m, i) => ({ ...m, kind: "queue", i, notes: [] }));
  const FORMS = { album: "Album", song: "Song", work: "Work" };
  const formOf = it => FORMS[it.form] ? it.form : "album";
  const albumDiary = LD.diary.map(d => ({ ...d, rewatch: d.again, it: ALBUMS[d.m] })).filter(d => d.it).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const byArtist = k => k === "album" || k === "queue" || k === "book";
  const STUDIO = ((S.studio || {}).items || []).map((w, i) => ({ ...w, t: w.title, artist: S.profile.name, movements: [], kind: "studio", i }));
  const POOL = { book: BOOKS, film: FILMS_ALL, watch: WATCH, art: ART, studio: STUDIO, album: ALBUMS, queue: QUEUE };
  const byDateDesc = k => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));
  const booksRead = () => BOOKS.filter(b => b.shelf === "read").sort((a, b) => String(b.read || "0" + b.added).localeCompare(String(a.read || "0" + a.added)));
  const booksReading = () => BOOKS.filter(b => b.shelf === "reading");
  const bookFavs = () => BOOKS.filter(b => b.fav).sort((a, b) => String(b.read || "").localeCompare(String(a.read || "")));
  const thisYear = new Date().getFullYear();
  const pad = n => String(n).padStart(2, "0");
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = isoOf(new Date());
  const isUpcoming = w => (w.end || w.start) ? (w.end || w.start) >= TODAY : !!w.upcoming;
  const isOngoing = w => w.start && w.start <= TODAY && (w.end || w.start) >= TODAY;
  const filmDiary = FD.diary.map(d => ({ ...d, it: FILMS_ALL[d.f] })).filter(d => shown(d.it)).sort(byDateDesc("date"));

  const NAV = [
    ["index.html", "Home", "home"],
    ["work.html", "Work", "work"],
    ["books.html", "Books", "books"],
    ["films.html", "Films", "films"],
    ["art.html", "Art", "art"],
    ["music.html", "Music", "music"],
    ["vault.html", "Vault", "vault"],
    ["about.html", "About", "about"],
    ["socials.html", "Socials", "socials"]
  ];

  /* ---------- chrome ---------- */
  /* grouped menu items: each group is one entry in the top bar with a dropdown, and a switcher on its pages */
  const GROUPS = [
    { label: "Taste", after: "work", items: [["books.html", "Books", "books"], ["films.html", "Films", "films"], ["art.html", "Art", "art"], ["music.html", "Music", "music"]] }
  ];
  const TASTE = GROUPS[0].items;
  const groupCount = k => ({ books: BOOKS.filter(b => b.shelf === "read").length, films: FILMS.length, art: ART.length, music: favPeople().length + MU_LISTS.length + PLAY.filter(p => p.status !== "learn").length })[k];
  const tasteCount = groupCount;
  const groupOf = key => GROUPS.find(g => g.items.some(it => it[2] === key));
  function header() {
    const link = ([href, label, key]) => `<a href="${href}"${key === page ? ' aria-current="page"' : ""}><span class="nl">${label}</span></a>`;
    const chev = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const groupHtml = g => `<div class="nav-group"><a href="${g.items[0][0]}" class="nav-parent"${groupOf(page) === g ? ' aria-current="page"' : ""} aria-haspopup="true"><span class="nl">${g.label}${chev}</span></a>
      <div class="nav-menu" role="menu">${g.items.map(([href, label, key]) => `<a role="menuitem" href="${href}"${key === page ? ' aria-current="page"' : ""}><b>${label}</b><span>${groupCount(key)}</span></a>`).join("")}</div></div>`;
    const html = [];
    NAV.forEach(n => {
      const g = groupOf(n[2]);
      if (!g) html.push(link(n));
      else if (g.items[0][2] === n[2]) html.push(groupHtml(g));   // place the group where its first page was
    });
    const links = html.join("");
    return `<header class="site-header"><div class="wrap">
      <a class="brand" href="index.html" aria-label="${esc(S.profile.name)}, home"><span class="brand-mark"><img src="assets/website/logo.png" alt="" width="34" height="34"></span></a>
      <div class="header-right"><nav class="nav" aria-label="Main">${links}</nav>
      <button class="search-btn" id="search-btn" type="button" aria-label="Search the site"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><span>Search</span><kbd>${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd></button>
      <button class="theme-toggle" id="theme-toggle" type="button" aria-label="Switch to light mode" title="Switch theme">
        <svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        <svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      </button></div></div></header>`;
  }
  function footer() {
    const links = NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
    return `<footer class="site-footer"><div class="wrap">
      <nav aria-label="Footer">${links}</nav>
      <span>© ${new Date().getFullYear()} ${esc(S.profile.legalName || S.profile.name)} · Updated ${esc(S.profile.updated)}</span></div></footer>`;
  }
  function sectionHead(title, link, linkText) {
    return `<div class="section-head"><h2>${title}</h2>${link ? `<a href="${link}">${linkText || "More"}</a>` : ""}</div>`;
  }
  function stars(r) {
    if (r == null) return "";
    const full = Math.floor(r), half = r % 1 >= 0.5;
    return `<span class="stars" aria-label="${r} out of 5 stars">${"★".repeat(full)}${half ? "½" : ""}</span>`;
  }
  const heart = on => on ? '<span class="heart" aria-label="Liked">♥</span>' : "";

  /* ---------- posters and covers ---------- */
  const CLOTH = ["#3d5a4c", "#6b3a2e", "#2f4a6b", "#5c4a2a", "#4a3a5c", "#7a5a1f", "#2e5458", "#6b2f45", "#3b4a2a", "#4d4f57"];
  function clothFor(t) { let h = 0; for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0; return CLOTH[h % CLOTH.length]; }
  function coverFace(title, sub) {
    return `<span class="cover" style="background:linear-gradient(160deg, ${clothFor(title)}, #14181c 140%)">
      <span class="cover-title">${esc(title)}</span><span class="cover-author">${esc(sub)}</span></span>`;
  }
  /* "cv2": cache version; bumped when the cover finder improved so earlier misses are retried */
  const coverKey = it => it.kind === "book" ? `cv2:b:${it.t}|${it.a}` : byArtist(it.kind) ? `cv2:a:${it.sp || it.t + "|" + it.a}` : `cv2:f:${it.t}|${it.y}`;
  /* Known image: manual override, ISBN cover, or a URL found on an earlier visit. */
  function knownCover(it) {
    const o = (S.posterOverrides || {})[it.t];
    if (o) return o;
    if (it.cover) return it.cover;
    const nc = it.kind === "book" && it.notes && it.notes.find(n => n.cover);
    if (nc) return nc.cover;
    const c = store.get(coverKey(it));
    if (c && c !== "none") return c;
    if (it.kind === "book" && it.isbn && c !== "none") return `https://covers.openlibrary.org/b/isbn/${it.isbn}-M.jpg?default=false`;
    return null;
  }
  function poster(it, extra = "") {
    const sub = byArtist(it.kind) ? it.a : (it.y || "");
    const src = knownCover(it);
    const remote = !src && store.get(coverKey(it)) !== "none";
    const label = `${it.t}${byArtist(it.kind) ? " by " + it.a : it.y ? ` (${it.y})` : ""}`;
    return `<button class="poster${it.kind === "album" || it.kind === "queue" ? " sq" : ""}${it.notes && it.notes.length ? " has-notes" : ""}" type="button" data-kind="${it.kind}" data-i="${it.i}"${remote ? " data-remote" : ""} title="${esc(label)}" aria-label="${esc(label)}"${extra}>${coverFace(it.t, sub)}${src ? `<img alt="" loading="lazy" src="${esc(src)}" onerror="window.__coverMiss(this)">` : ""}</button>`;
  }
  function posterItem(it, opts = {}) {
    let meta;
    if (opts.caption != null) meta = `<span class="poster-caption">${esc(opts.caption)}</span>`;
    else meta = `${stars(opts.r !== undefined ? opts.r : it.r)}${heart(it.liked)}`;
    return `<li class="poster-item">${opts.rank ? `<span class="rank">${opts.rank}</span>` : ""}${poster(it)}<div class="poster-meta">${meta}</div></li>`;
  }
  /* An ISBN cover that 404s falls back to a title search. */
  window.__coverMiss = img => {
    const el = img.closest(".poster"); img.remove();
    if (!el || el.dataset.tried) return;
    el.dataset.tried = "1"; el.setAttribute("data-remote", ""); enqueue(el);
  };
  const queue = []; let active = 0;
  const io = "IntersectionObserver" in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); enqueue(e.target); } }), { rootMargin: "400px" })
    : null;
  function watchCovers(root = document) { $$(".poster[data-remote]", root).forEach(el => io ? io.observe(el) : enqueue(el)); }
  function enqueue(el) { queue.push(el); pump(); }
  function pump() {
    while (active < 4 && queue.length) {
      const el = queue.shift(); active++;
      lookup(el).finally(() => { active--; pump(); });
    }
  }
  async function lookup(el) {
    const it = POOL[el.dataset.kind][+el.dataset.i];
    if (!it) return;
    const key = coverKey(it);
    /* assets/covers.js tries several free sources and only accepts a believable match */
    if (!window.findCover) return;
    let url = null;
    try { url = await window.findCover(it); } catch (e) { return; }  /* offline or blocked: try again next visit */
    store.set(key, url || "none");
    el.removeAttribute("data-remote");
    if (!url) return;
    $$(`.poster[data-kind="${it.kind}"][data-i="${it.i}"]`).forEach(p => {
      if (p.querySelector("img")) return;
      const img = new Image(); img.alt = ""; img.className = "fade";
      img.onload = () => img.classList.add("in");
      img.onerror = () => img.remove();
      img.src = url; p.appendChild(img);
    });
  }

  /* ---------- shared widgets ---------- */
  /* a page's numbers, as one quiet line under its subtitle: "254 films · 12 this year · 3 lists" */
  function statsRow(items) {
    return `<p class="ledger">${items.filter(([n]) => n).map(([n, l]) => `<span><b>${n}</b> ${esc(l.toLowerCase())}</span>`).join("")}</p>`;
  }
  /* Letterboxd-style ratings histogram. */
  function histogram(rs, step) {
    const bins = []; for (let v = step; v <= 5; v += step) bins.push(+v.toFixed(1));
    const counts = bins.map(b => rs.filter(r => r === b).length);
    const max = Math.max(1, ...counts);
    const bars = bins.map((b, i) => `<span class="bar" style="height:${Math.max(2, counts[i] / max * 100)}%" data-tip="${plural(counts[i], "rating")} of ${b} ★"><span class="sr">${counts[i]} rated ${b}</span></span>`).join("");
    return `<div class="hist"><span class="hist-end">★</span><div class="bars">${bars}</div><span class="hist-end">★★★★★</span></div>`;
  }
  function ratingsBlock(rs, step, title = "Ratings") {
    return `<section class="side-block">${sectionHead(title)}<div class="hist-count">${plural(rs.length, "rating")}</div>${histogram(rs, step)}</section>`;
  }
  /* Compact month-grouped diary list, as on a Letterboxd profile sidebar. */
  function diaryMini(entries, months = 3) {
    const groups = [];
    for (const e of entries) {
      const p = parse(e.date), key = `${p.y}-${p.m}`;
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { if (groups.length === months) break; g = { key, m: p.m, y: p.y, rows: [] }; groups.push(g); }
      g.rows.push(e);
    }
    return groups.map(g => `<div class="dm"><span class="cal-sm"><b>${MONTHS[g.m]}</b>${g.y !== thisYear ? `<i>${g.y}</i>` : ""}</span>
      <ul>${g.rows.map(e => `<li><span class="dm-d">${parse(e.date).d || "–"}</span><button type="button" class="linkish" data-kind="${e.it.kind}" data-i="${e.it.i}">${esc(e.it.t)}</button></li>`).join("")}</ul></div>`).join("");
  }
  function diaryTable(entries, opts = {}) {
    let last = "";
    const rows = entries.map(e => {
      const { y, m, d } = parse(e.date), key = `${y}-${m}`;
      const cal = key !== last ? `<span class="cal"><b>${MONTHS[m]}</b><span>${y}</span></span>` : "";
      last = key;
      const sub = byArtist(e.it.kind) ? [e.it.a, e.perf].filter(Boolean).join(" · ") : (e.it.y || "");
      const again = e.it.kind === "album" ? "Relisten" : "Rewatch";
      return `<tr><td class="month">${cal}</td><td class="day">${d ? String(d).padStart(2, "0") : "–"}</td>
        <td class="book"><button type="button" class="linkish" data-kind="${e.it.kind}" data-i="${e.it.i}"><b>${esc(e.it.t)}</b></button><span>${esc(sub)}</span></td>
        <td>${stars(e.r)}</td><td class="icons">${heart(e.it.liked)}${e.rewatch ? `<span class="rewatch" title="${again}" aria-label="${again}">↻</span>` : ""}${e.review ? '<span class="has-review" title="Has review" aria-label="Has review">≡</span>' : ""}</td></tr>`;
    }).join("");
    return `<div class="diary-wrap"><table class="diary"><thead><tr><th>Month</th><th>Day</th><th>${opts.label || "Title"}</th><th>Rating</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  /* Filterable, sortable, paged poster grid. */
  function grid(mount, items, cfg) {
    const PAGE = 60;
    const state = { shown: PAGE };
    const controls = (cfg.filters || []).map(f => `<label class="select" for="${f.id}">${f.label} <select id="${f.id}">${f.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select></label>`).join("")
      + (cfg.sorts ? `<label class="select" for="${cfg.id}-sort">Sort <select id="${cfg.id}-sort">${cfg.sorts.map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}</select></label>` : "");
    mount.innerHTML = `<div class="filterbar slim"><div class="group">${controls}</div><span class="count" id="${cfg.id}-count"></span></div><ul class="posters" id="${cfg.id}-grid"></ul><div class="more-wrap" id="${cfg.id}-more"></div>`;
    const draw = (reset) => {
      if (reset) state.shown = PAGE;
      let list = items.filter(it => (cfg.filters || []).every(f => { const v = $("#" + f.id).value; return v === "all" || f.test(it, v); }));
      if (cfg.sorts) { const s = cfg.sorts.find(x => x[0] === $(`#${cfg.id}-sort`).value); list = [...list].sort(s[2]); }
      $(`#${cfg.id}-count`).textContent = plural(list.length, cfg.noun);
      $(`#${cfg.id}-grid`).innerHTML = list.slice(0, state.shown).map(it => posterItem(it, cfg.item ? cfg.item(it) : {})).join("") || `<li class="empty">Nothing matches.</li>`;
      $(`#${cfg.id}-more`).innerHTML = list.length > state.shown ? `<button class="btn" type="button">Show ${Math.min(PAGE, list.length - state.shown)} more</button>` : "";
      const more = $(`#${cfg.id}-more button`);
      if (more) more.onclick = () => { state.shown += PAGE; draw(false); };
      watchCovers(mount);
    };
    (cfg.filters || []).forEach(f => $("#" + f.id).addEventListener("change", () => draw(true)));
    if (cfg.sorts) $(`#${cfg.id}-sort`).addEventListener("change", () => draw(true));
    draw(true);
  }
  /* Tab strip; the active tab is mirrored in the URL hash. */
  function tabs(id, defs) {
    const html = `<nav class="tabs" role="tablist" aria-label="${id}">${defs.map(([k, l]) => `<button type="button" role="tab" class="tab" data-tab="${k}">${l}</button>`).join("")}<span class="tab-ink" aria-hidden="true"></span></nav><div class="tab-body" id="${id}-body"></div>`;
    const start = () => {
      const fromHash = location.hash.slice(1);
      const moveInk = () => { const a = $(".tab[aria-selected=true]"), ink = $(".tab-ink"); if (a && ink) { ink.style.width = a.offsetWidth + "px"; ink.style.transform = `translate(${a.offsetLeft}px, ${a.offsetTop + a.offsetHeight - 2}px)`; } };
      window.addEventListener("resize", moveInk);
      const show = k => {
        $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === k));
        moveInk();
        const body = $(`#${id}-body`); body.innerHTML = "";
        defs.find(d => d[0] === k)[2](body);
        watchCovers(body);
      };
      $$(".tab").forEach(t => t.addEventListener("click", () => { show(t.dataset.tab); try { history.replaceState(null, "", "#" + t.dataset.tab); } catch (e) {} }));
      show(defs.some(d => d[0] === fromHash) ? fromHash : defs[0][0]);
      /* Links to a tab on this same page (films.html#diary on Films): open the tab and scroll to it,
         even when the URL already ends in that hash. */
      const openTab = k => {
        show(k);
        try { history.replaceState(null, "", "#" + k); } catch (e) {}
        const strip = $(".tabs"); if (strip) strip.scrollIntoView({ behavior: "smooth", block: "start" });
      };
      document.addEventListener("click", e => {
        const a = e.target.closest && e.target.closest("a[href*='#']");
        if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
        const u = new URL(a.href, location.href);
        const k = u.hash.slice(1);
        if (u.pathname !== location.pathname || !defs.some(d => d[0] === k)) return;
        e.preventDefault();
        openTab(k);
      });
      window.addEventListener("hashchange", () => { const k = location.hash.slice(1); if (defs.some(d => d[0] === k)) openTab(k); });
    };
    return [html, start];
  }
  const ratingFilter = step => ({
    label: "Rating", options: [["all", "Any"], ...[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].filter(v => step === 0.5 || v % 1 === 0).map(v => [String(v), "★".repeat(Math.floor(v)) + (v % 1 ? "½" : "")]), ["none", "Unrated"]],
    test: (it, v) => v === "none" ? it.r == null : it.r === +v
  });

  /* ---------- art ---------- */
  function artTile(a) {
    return `<li class="art-item"><button class="art-tile" type="button" data-kind="art" data-i="${a.i}" title="${esc(a.t)}, ${esc(a.artist)}" aria-label="${esc(a.t)} by ${esc(a.artist)}">${coverFace(a.t, a.artist)}${a.img ? `<img alt="" loading="lazy" src="${esc(a.img)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</button>
      <div class="art-cap"><b>${esc(a.t)}</b><span>${esc(a.artist)}${a.year ? ", " + esc(a.year) : ""}</span></div></li>`;
  }
  const countBy = (arr, f) => { const m = new Map(); arr.forEach(x => [].concat(f(x)).filter(Boolean).forEach(k => m.set(k, (m.get(k) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

  /* ---------- writing ---------- */
  const TYPE_LABEL = { essay: "Essay", research: "Research", project: "Project", appearance: "Appearance" };
  const workHref = w => `work.html#${slug(w.title)}`;
  function workCover(w) { return w.cover ? `<img alt="" loading="lazy" src="${esc(w.cover)}">` : coverFace(w.title, w.venue.split(/[,·]/)[0]); }
  function workPoster(w) {
    return `<li class="poster-item"><a class="poster" href="${workHref(w)}" title="${esc(w.title)}" aria-label="${esc(w.title)}">${workCover(w)}</a>
      <div class="poster-meta"><span class="poster-caption">${esc(w.award || TYPE_LABEL[w.type])}</span></div></li>`;
  }
  /* photo gallery for an entry: w.gallery = [{ src, cap }] */
  const galleryOf = w => (w.gallery || []).map(g => typeof g === "string" ? { src: g } : g).filter(g => g && g.src);
  function galleryStrip(w) {
    const g = galleryOf(w);
    if (!g.length) return "";
    /* a gallery item can be a photo or a video: a YouTube/Vimeo link or an .mp4/.webm/.mov file */
    const face = p => { const v = videoOf(p.src);
      if (!v) return `<img src="${esc(p.src)}" alt="" loading="lazy">`;
      return (v.thumb ? `<img src="${esc(v.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : v.kind === "file" ? `<video src="${esc(v.src)}#t=0.5" preload="metadata" muted playsinline tabindex="-1"></video>` : "")
        + '<span class="gal-play" aria-hidden="true"></span>'; };
    return `<ul class="gallery" aria-label="Photos and videos">${g.map((p, k) => `<li><button type="button" class="gal-thumb${videoOf(p.src) ? " is-video" : ""}" data-gal="${esc(slug(w.title))}" data-k="${k}" aria-label="${esc(p.cap || (videoOf(p.src) ? "Video " : "Photo ") + (k + 1))}">
      ${face(p)}</button></li>`).join("")}</ul>`;
  }
  /* full-size viewer with arrows; one dialog for the whole page */
  function lightbox() {
    const dlg = document.createElement("dialog"); dlg.className = "lightbox"; document.body.appendChild(dlg);
    let set = [], k = 0;
    const show = () => {
      const p = set[k];
      dlg.innerHTML = `<button class="dlg-close" type="button" aria-label="Close">×</button>
        <figure>${videoOf(p.src) ? videoPlayer(videoOf(p.src), p.cap) : `<img src="${esc(p.src)}" alt="${esc(p.cap || "")}">`}${p.cap ? `<figcaption>${mdInline(p.cap)}</figcaption>` : ""}</figure>
        ${set.length > 1 ? `<div class="dlg-nav"><button type="button" class="nav-btn" data-step="-1" aria-label="Previous">←</button><span>${k + 1} / ${set.length}</span><button type="button" class="nav-btn" data-step="1" aria-label="Next">→</button></div>` : ""}`;
      $(".dlg-close", dlg).onclick = () => dlg.close();
      $$("[data-step]", dlg).forEach(b => b.onclick = () => step(+b.dataset.step));
    };
    const step = d => { if (set.length < 2) return; k = (k + d + set.length) % set.length; show(); };
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-gal]"); if (!t) return;
      const w = S.writings.find(x => slug(x.title) === t.dataset.gal); if (!w) return;
      set = galleryOf(w); k = +t.dataset.k; show(); if (!dlg.open) dlg.showModal();
    });
    dlg.addEventListener("keydown", e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => { dlg.innerHTML = ""; });   /* stops a playing video */
  }
  function entry(w) {
    const ext = w.link && !w.link.endsWith(".html") ? ' target="_blank" rel="noopener"' : "";
    const link = w.link ? `<a class="read-link" href="${esc(w.link)}"${ext}>${esc(w.linkText || "Open")} <span class="arr">→</span></a>` : "";
    const title = w.link ? `<a href="${esc(w.link)}"${ext}>${esc(w.title)}</a>` : esc(w.title);
    return `<li class="entry" id="${slug(w.title)}">
      <div class="entry-poster"><span class="poster" aria-hidden="true">${workCover(w)}</span></div>
      <div class="entry-text"><h3>${title}</h3>
        <div class="entry-meta">${w.award ? `<span class="pill award">${esc(w.award)}</span>` : ""}
          ${isOngoing(w) ? '<span class="pill live"><i class="pulse"></i>Happening now</span>' : isUpcoming(w) && w.type === "appearance" ? '<span class="pill wip">Upcoming</span>' : ""}
          <span>${esc(w.venue)}${w.result ? ` · ${mdInline(w.result, true)}` : ""}</span></div>
        <div class="claim">${md(w.claim, { html: true })}</div>
        ${w.body ? `<details><summary>More</summary>${md(w.body, { html: true })}</details>` : ""}
        ${link}${galleryStrip(w)}</div></li>`;
  }

  function tasteNav() {
    const g = groupOf(page);
    return `<nav class="subnav" aria-label="${g.label}"><span class="subnav-label">${g.label}</span><div class="seg">${g.items.map(([href, label, key]) =>
      `<a href="${href}"${key === page ? ' aria-current="page"' : ""}>${label}<span>${groupCount(key)}</span></a>`).join("")}</div></nav>`;
  }


  /* ---------- pages ---------- */
  function home() {
    const p = S.profile;
    const avatar = p.avatar ? `<img src="${esc(p.avatar)}" alt="${esc(p.name)}">` : esc(p.initials);
    const upcoming = S.writings.filter(w => w.type === "appearance" && isUpcoming(w)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    setTimeout(thread);
    const reading = booksReading().slice(0, 2);
    const playing = PLAY.filter(x => x.status === "now").slice(0, 3);
    setTimeout(lately);
    setTimeout(() => {   /* keep the sidebar in view while the long column scrolls, but only when it fits on screen */
      const side = $(".home-side"); if (!side) return;
      const fit = () => side.classList.toggle("stick", side.offsetHeight < innerHeight - 110 && matchMedia("(min-width: 781px)").matches);
      fit(); addEventListener("resize", fit); setTimeout(fit, 1500);
    });
    const artPick = ART.filter(a => a.img).sort(() => Math.random() - .5)[0];
    const doors = [["work.html", "Work", "Papers, projects, art, talks"], ["vault.html", "The Vault", "All my notes, as a map you can drag around"],
      ["books.html", "Taste", "Books, films, art and music I love"], ["socials.html", "Say hi", "Email is best"]];
    return `
      <section class="profile hero${(window.QUOTES || {}).items ? " with-quote" : ""}"><div class="hero-main">
        <div class="profile-id"><div class="avatar ring">${avatar}</div>
          <div class="hero-text"><p class="hello">Hi, I’m</p>
          <h1><span class="first">${esc(p.name.split(" ")[0])}</span> ${esc(p.name.split(" ").slice(1).join(" "))}${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ""}</h1>
          <p class="aka">${esc(p.legalName || "")} <span class="cjk">${esc(p.cjk)}</span></p>
          <p class="tagline">${esc(p.tagline)}</p></div></div>
</div>
        ${quoteBlock()}
      </section>
      <div class="cols">
        <div>
          <section class="section">${sectionHead("Follow a thread", "vault.html", "The whole map")}
            <p class="thread-intro">A note pulled at random from my vault. Click a link to follow where it leads, or pull another.</p>
            <article class="thread" id="thread" aria-live="polite"><p class="thread-loading">Pulling a note…</p></article>
            <ol class="thread-trail" id="thread-trail" aria-label="Where you have been"></ol></section>
          <section class="section">${sectionHead("Lately")}<ul class="feed" id="lately"></ul></section>
        </div>
        <aside class="home-side">
          ${upcoming.length ? `<section class="side-block">${sectionHead("Upcoming")}<ul class="upcoming">${upcoming.map(w =>
            `<li><a href="${workHref(w)}">${esc(w.title)}</a><span>${esc(w.venue)}</span></li>`).join("")}</ul></section>` : ""}
          <section class="side-block">${sectionHead("Now")}<ul>${p.now.map(n => `<li>${esc(n)}</li>`).join("")}</ul></section>
          ${reading.length ? `<section class="side-block">${sectionHead("Reading", "books.html", "Books")}
            <ul class="posters two">${reading.map(b => posterItem(b, { caption: "Since " + fmtDate(b.added).replace(/, \d{4}$/, "") })).join("")}</ul></section>` : ""}
          ${playing.length ? `<section class="side-block">${sectionHead("Practicing", "music.html", "Music")}<ul class="upcoming">${playing.map(x =>
            `<li><b>${esc(x.t)}</b><span>${esc(x.a || "")}</span></li>`).join("")}</ul></section>` : ""}
          ${artPick ? `<section class="side-block">${sectionHead("Looking at", "art.html", "All art")}
            <ul class="art-grid one">${artTile(artPick)}</ul></section>` : ""}
          <section class="side-block">${sectionHead("Around the site")}<ul class="doors">${doors.map(([href, t, sub]) =>
            `<li><a href="${href}"><b>${t}</b><span>${sub}</span></a></li>`).join("")}</ul></section>
        </aside>
      </div>`;
  }

  /* Lately: the newest things across the site, one list. Films, books and appearances come from the data files;
     notes I added come from data/vault-index.js (dates written by tools/build-graph.py); music, when content.js has
     "lastfm": { "user": ..., "key": ... }, comes from Last.fm, which Spotify can feed automatically. */
  let vaultIndexP;
  const vaultIndex = () => vaultIndexP || (vaultIndexP = window.VAULT_INDEX ? Promise.resolve() : loadScript("data/vault-index.js"));
  function lately() {
    const ul = $("#lately"); if (!ul) return;
    const rows = [
      ...filmDiary.map(d => ({ date: d.date, kind: "film", it: d.it, verb: d.rewatch ? "Rewatched" : "Watched", sub: String(d.it.y || ""), r: d.r })),
      ...booksRead().filter(b => b.read).map(b => ({ date: b.read, kind: "book", it: b, verb: "Finished", sub: b.a, r: b.r })),
      ...S.writings.filter(w => w.type === "appearance" && w.start && w.start <= TODAY).map(w => ({ date: w.start, kind: "work", w, verb: "Went to", sub: w.place || "" }))
    ];
    const short = d => d === TODAY ? "Today" : fmtDate(d).replace(/, \d{4}$/, "");
    const row = e => `<li${e.now ? ' class="now"' : ""}><time datetime="${esc(e.date)}">${e.now ? '<i class="pulse"></i>Now' : esc(short(e.date))}</time>
      <span class="feed-thumb">${e.it ? poster(e.it) : e.w ? `<a class="poster" href="${workHref(e.w)}" aria-label="${esc(e.w.title)}">${workCover(e.w)}</a>`
        : e.img ? `<span class="poster sq"><img alt="" loading="lazy" src="${esc(e.img)}" referrerpolicy="no-referrer" onerror="this.remove()"></span>` : `<span class="feed-dot${e.kind === "music" ? " music" : ""}" aria-hidden="true"></span>`}</span>
      <div><span class="feed-verb">${e.verb}</span> ${e.it ? `<button type="button" class="linkish" data-kind="${e.it.kind}" data-i="${e.it.i}">${esc(e.it.t)}</button>`
        : e.w ? `<a href="${workHref(e.w)}">${esc(e.w.title)}</a>`
        : e.notes ? e.notes.slice(0, 2).map(t => `<a href="${vaultLink(t)}">${esc(t)}</a>`).join('<span class="feed-sub">, </span>') + (e.notes.length > 2 ? ` <span class="feed-sub">and ${e.notes.length - 2} more</span>` : "")
        : `<b>${esc(e.title)}</b>`}
        ${e.sub ? `<span class="feed-sub">${esc(e.sub)}</span>` : ""} ${stars(e.r)}</div></li>`;
    const draw = () => {
      const seen = {};   /* at most three of a kind, so one log can’t fill the list */
      const list = rows.filter(e => e.date).sort((a, b) => (b.now - a.now) || String(b.date).localeCompare(String(a.date)))
        .filter(e => (seen[e.kind] = (seen[e.kind] || 0) + 1) <= 3).slice(0, 8);
      ul.innerHTML = list.map(row).join("");
      ul.closest(".section").hidden = !list.length;
      watchCovers(ul);
    };
    draw();
    /* notes added, one row per day */
    vaultIndex().then(() => {
      const byDay = new Map();
      ((window.VAULT_INDEX || {}).notes || []).forEach(([t, , , made]) => { if (made && made <= TODAY) byDay.set(made, [...(byDay.get(made) || []), t]); });
      [...byDay].filter(([, notes]) => notes.length <= 12).forEach(([date, notes]) =>   /* a bigger day is an import or a sync, not writing */
        rows.push({ date, kind: "note", notes, verb: notes.length === 1 ? "Wrote a note:" : `Wrote ${notes.length} notes:` }));
      if (byDay.size) draw();
    });
    /* music from Last.fm: plays grouped by album, newest first */
    const fm = S.lastfm || {};
    if (fm.user && fm.key) fetch(`https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks&user=${encodeURIComponent(fm.user)}&api_key=${encodeURIComponent(fm.key)}&format=json&limit=60`)
      .then(r => r.ok ? r.json() : null).then(j => {
        const tracks = (((j || {}).recenttracks || {}).track || []);
        const groups = [];
        tracks.forEach(t => {
          const artist = (t.artist || {})["#text"] || "", album = (t.album || {})["#text"] || "", now = ((t["@attr"] || {}).nowplaying === "true");
          const date = now ? TODAY : t.date ? isoOf(new Date(+t.date.uts * 1000)) : null; if (!date) return;
          const key = (album || t.name) + "|" + artist;
          const g = groups.find(x => x.key === key && x.date === date);
          if (g) { g.plays++; if (now) g.now = true; return; }
          const img = ((t.image || []).find(x => x.size === "medium") || {})["#text"] || "";
          groups.push({ key, date, now, plays: 1, kind: "music", verb: now ? "Listening to" : "Listened to", title: album || t.name, sub: artist, img: /2a96cbd8b46e442fc41c2b86b821562f/.test(img) ? "" : img });
        });
        if (groups.length) { rows.push(...groups); draw(); }
      }).catch(() => {});
  }

  /* Follow a thread: a random note from the vault, its links as next steps, and the path taken so far.
     Titles come from data/vault-index.js; note text from data/vault-notes/NN.js (the same shards the Vault page reads). */
  const loadScript = src => new Promise(res => { const sc = document.createElement("script"); sc.src = src; sc.onload = sc.onerror = res; document.head.appendChild(sc); });
  function thread() {
    const box = $("#thread"), trailEl = $("#thread-trail"); if (!box) return;
    const shardOf = t => { let h = 2166136261; for (const ch of String(t)) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0; return h % 32; };
    const shards = {};
    const noteHtml = async t => {
      const n = shardOf(t);
      shards[n] = shards[n] || loadScript(`data/vault-notes/${pad(n)}.js?v=${encodeURIComponent(window.VAULT_INDEX.built || "")}`);
      await shards[n];
      return (window.VAULT_NOTES || {})[t];
    };
    const trail = [];
    let known, starts;
    /* which book or film each note came from, so the card can show its cover (data/notes.js lists each source's ideas) */
    const SRC = new Map();
    [...BOOKS, ...FILMS_ALL].forEach(it => (it.notes || []).forEach(n => [n.note, ...(n.ideas || [])].forEach(t => SRC.has(t) || SRC.set(t, it))));
    /* no source: draw the note and its neighbours as a small star map; each point follows that link */
    const constellation = (t, next) => {
      const W = 120, H = 150, cx = 60, cy = 75, r = 44;
      const pts = next.map((n, k) => { const a = -Math.PI / 2 + k * 2 * Math.PI / next.length + (shardOf(t) % 7) * .1; return [n, cx + r * Math.cos(a), cy + r * 1.15 * Math.sin(a)]; });
      return `<svg class="constellation" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t)} and the ${plural(next.length, "note")} it links to">
        ${pts.map(([, x, y]) => `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`).join("")}
        ${pts.map(([n, x, y]) => `<g class="wl-go" data-note="${esc(n)}"><title>${esc(n)}</title><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="12" class="hit"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5"/></g>`).join("")}
        <circle class="me" cx="${cx}" cy="${cy}" r="8"/></svg>`;
    };
    const go = async (t, fromTrail, fresh) => {
      const html = await noteHtml(t);
      if (!html) return false;
      const doc = document.createElement("div"); doc.innerHTML = html;
      const heads = $$("h4", doc);
      const summaryHead = heads.find(h => /summary/i.test(h.textContent));
      let para = summaryHead ? summaryHead.nextElementSibling : $("p", doc);
      if (para && para.tagName !== "P") para = $("p", doc);
      const next = [...new Set($$("a.wl[data-note]", doc).map(a => a.dataset.note))].filter(n => n !== t && known.has(n)).slice(0, 6);
      if (fresh && next.length < 2) return false;   /* a fresh pull should lead somewhere */
      if (!fromTrail) { const k = trail.indexOf(t); if (k >= 0) trail.splice(k, 1); trail.push(t); if (trail.length > 6) trail.shift(); }
      const sum = para ? para.innerHTML.replace(/<a class="wl"[^>]*data-note="([^"]*)"[^>]*>(.*?)<\/a>/g, (m, n, txt) => known.has(n.replace(/&amp;/g, "&")) ? `<button type="button" class="wl-go" data-note="${n}">${txt}</button>` : txt) : "";
      box.classList.add("out");
      setTimeout(() => {
        const src = SRC.get(t);
        box.innerHTML = `<div class="thread-visual">${src ? poster(src) : constellation(t, next)}</div><div class="thread-text">
          <p class="thread-kicker">${src && src.notes.some(n => n.note === t) ? (src.kind === "book" ? "Book" : "Film") : esc(known.get(t) || "Note")}${src && !src.notes.some(n => n.note === t) ? ` · from <cite>${esc(src.t)}</cite>` : ""}</p>
          <h3>${esc(t)}</h3>
          ${sum ? `<p class="thread-body">${sum}</p>` : ""}
          ${next.length ? `<div class="thread-next"><span>Leads to</span>${next.map(n => `<button type="button" class="wl-go" data-note="${esc(n)}">${esc(n)}</button>`).join("")}</div>` : `<p class="thread-end">A dead end. Pull another.</p>`}
          <div class="thread-actions"><button type="button" class="btn" id="thread-pull">↻ Pull another</button><a class="read-link" href="${vaultLink(t)}">Read the whole note <span class="arr">→</span></a></div></div>`;
        watchCovers(box);
        trailEl.innerHTML = trail.length > 1 ? trail.map((n, k) => `<li>${k === trail.length - 1 ? `<span aria-current="step">${esc(n)}</span>` : `<button type="button" class="wl-back" data-note="${esc(n)}">${esc(n)}</button>`}</li>`).join("") : "";
        box.classList.remove("out");
      }, box.dataset.ready ? 180 : 0);
      box.dataset.ready = "1";
      return true;
    };
    const pull = async () => {
      trail.length = 0;
      for (let k = 0; k < 8; k++) if (await go(starts[Math.floor(Math.random() * starts.length)], false, k < 7)) return;
    };
    box.parentElement.addEventListener("click", e => {
      const b = e.target.closest(".wl-go, .wl-back, #thread-pull"); if (!b) return;
      if (b.id === "thread-pull") pull();
      else { if (b.classList.contains("wl-back")) trail.splice(trail.indexOf(b.dataset.note) + 1); go(b.dataset.note, b.classList.contains("wl-back")); }
    });
    vaultIndex().then(() => {
      const notes = (window.VAULT_INDEX || {}).notes || [];
      if (!notes.length) { box.closest(".section").remove(); return; }
      known = new Map(notes.map(([t, folder]) => [t, folder === "Notes" ? "Note" : folder]));
      starts = notes.filter(([t, folder]) => folder === "Notes" && SRC.has(t)).map(([t]) => t);
      if (!starts.length) starts = notes.map(([t]) => t);
      pull();
    });
  }

  /* a random line from the vault quote bank (data/quotes.js), different from the last one shown */
  function quoteBlock() {
    const Q = ((window.QUOTES || {}).items || []);
    if (!Q.length) return "";
    let i = -1;
    const last = +(store.get("lastQuote") ?? -1);
    const pick = () => {
      const all = Q.map((q, n) => n), P = all.filter(n => n !== i && n !== last);
      const from = P.length ? P : all;
      return from[Math.floor(Math.random() * from.length)];
    };
    const show = (fig, animate) => {
      i = pick(); store.set("lastQuote", String(i));
      const q = Q[i];
      const fill = () => {
        $("blockquote", fig).innerHTML = esc(q.q).replace(/\n/g, "<br>");
        $("figcaption", fig).innerHTML = q.by;
        fig.classList.toggle("long", q.q.length > 300);
        fig.classList.remove("out", "open");
        $$("blockquote, figcaption", fig).forEach(el => { delete el._vdone; });
        const bq = $("blockquote", fig);
        $(".qod-more", fig).hidden = bq.scrollHeight <= bq.clientHeight + 2;   /* long passages are clamped; offer the rest */
        linkVault(fig);
      };
      if (!animate) return fill();
      fig.classList.add("out"); setTimeout(fill, 220);
    };
    setTimeout(() => {
      const fig = $("#qod"); if (!fig) return;
      show(fig, false);
      $(".qod-next", fig).addEventListener("click", () => show(fig, true));
      $(".qod-more", fig).addEventListener("click", () => { fig.classList.add("open"); $(".qod-more", fig).hidden = true; });
    });
    return `<figure class="qod" id="qod" aria-live="polite"><blockquote></blockquote><button class="qod-more linkish" type="button" hidden>Read the rest</button><figcaption></figcaption>
      <button class="qod-next" type="button" aria-label="Show another quote" data-tip="Another">↻</button></figure>`;
  }

  /* ---------- link mentions of things in my vault ----------
     NOTES.links (tools/import-book-notes.py) lists the works, writings and maps of content on the Vault graph.
     Any mention of one in page text becomes a link to it on the Vault page. Multi-word titles match anywhere;
     one-word titles ("Hamlet", "Politics") only when set as a title, i.e. in italics. Once per paragraph. */
  const VLINKS = ((window.NOTES || {}).links || []).slice().sort((a, b) => b[0].length - a[0].length);
  const apos = s => s.replace(/[’‘]/g, "'");
  const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const VRE = VLINKS.length ? new RegExp(`(^|[^\\p{L}\\p{N}])(${VLINKS.map(([t]) => reEsc(apos(t)).replace(/'/g, "['’‘]")).join("|")})(?![\\p{L}\\p{N}])`, "gu") : null;
  const VMAP = new Map(VLINKS.map(([t, n]) => [apos(t), n]));
  const NO_LINK = "a, button, input, textarea, select, script, style, h1, h2, h3, .poster, .cover-face, .site-header, .site-footer, .hm, .stats, .filterbar, .tabs, .section-head, .vault-wrap, .dlg-nav, [data-novault]";
  function linkVault(root) {
    if (!VRE || page === "vault" || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => n.nodeValue.trim().length > 2 && !n.parentElement.closest(NO_LINK) ? 1 : 2 });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      const block = node.parentElement.closest("p, li, figcaption, blockquote, dd, td, .tag, div") || root;
      const done = block._vdone || (block._vdone = new Set());
      const text = node.nodeValue; let m, last = 0; const frag = document.createDocumentFragment(); let changed = false;
      VRE.lastIndex = 0;
      while ((m = VRE.exec(text))) {
        const title = apos(m[2]), note = VMAP.get(title);
        const start = m.index + m[1].length;
        const titled = /\s/.test(title) || node.parentElement.closest("em, i, cite");
        if (!note || done.has(note) || !titled) continue;
        done.add(note); changed = true;
        frag.append(text.slice(last, start));
        const a = document.createElement("a"); a.className = "vlink"; a.href = vaultLink(note); a.textContent = m[2]; a.dataset.tip = "In my vault";
        frag.append(a); last = start + m[2].length;
      }
      if (!changed) return;
      frag.append(text.slice(last)); node.replaceWith(frag);
    });
  }

  /* Work: papers, projects, art and appearances on one page. The switcher shows one kind or all of them;
     work.html#papers (or #projects, #art, #appearances) opens on that kind, work.html#<entry slug> on the entry. */
  function workPage() {
    const PAPERS = S.writings.filter(w => w.type !== "appearance" && w.type !== "project");
    const PR = S.writings.filter(w => w.type === "project");
    const AP = S.writings.filter(w => w.type === "appearance");
    const when = w => String(w.start || w.end || "");
    const upcoming = AP.filter(isUpcoming).sort((a, b) => when(a).localeCompare(when(b)));
    const past = AP.filter(w => !isUpcoming(w)).sort((a, b) => when(b).localeCompare(when(a)));
    const kinds = [...new Set(STUDIO.map(w => S.studio.items[w.i].kind))].filter(Boolean);
    const list = ws => `<ul class="entries">${ws.map(entry).join("")}</ul>`;
    const SECS = [
      ["papers", "Papers", "Essays written for prize competitions, and independent research.", PAPERS.length, () => list(PAPERS)],
      ["projects", "Projects", "Things I’ve built.", PR.length, () => list(PR)],
      ["art", "Art", esc((S.studio || {}).intro || "Drawings, paintings and photographs."), STUDIO.length, () => `
        <ul class="strip" aria-label="Art I’ve made">${STUDIO.map(w => `<li><button class="studio-img" type="button" data-kind="studio" data-i="${w.i}" aria-label="${esc(w.t)}">${thumbImg(w.img, w.t)}</button></li>`).join("")}</ul>
        <button class="linkish see-all" type="button" data-show="art">See all ${STUDIO.length} with titles <span class="arr">→</span></button>
        <div class="art-full">
          <div class="filterbar slim"><div class="group" role="group" aria-label="Filter by medium">
            ${["All", ...kinds].map(k => `<button class="chip" type="button" data-medium="${k}" aria-pressed="${k === "All"}">${k}</button>`).join("")}
          </div><span class="count" id="s-count"></span></div>
          <div class="studio" id="s-grid"></div></div>`],
      ["appearances", "Appearances", "Conferences, talks and events I’ve been part of.", AP.length, () =>
        (upcoming.length ? `<h3 class="sub-head">Upcoming</h3>${list(upcoming)}` : "") + (past.length ? `<h3 class="sub-head">Past</h3>${list(past)}` : "")]
    ].filter(x => x[3]);
    const html = `
      <div class="page-head"><div><h1 class="page-title">Work</h1><p class="page-sub">Things I’ve written, built, drawn and shown up to.</p>
        ${statsRow(SECS.map(([, label, , n]) => [n, label === "Art" ? (n === 1 ? "artwork" : "artworks") : n === 1 ? label.replace(/s$/, "") : label]))}</div></div>
      <nav class="subnav work-switch" aria-label="Show"><div class="seg">
        <a href="#all" data-show="all">All</a>${SECS.map(([id, label, , n]) => `<a href="#${id}" data-show="${id}">${label}<span>${n}</span></a>`).join("")}</div></nav>
      ${SECS.map(([id, label, sub, , body]) => `<section class="section work-sec" id="${id}" data-sec="${id}">
        <div class="work-sec-head"><h2>${label}</h2><p>${sub}</p></div>${body()}</section>`).join("")}`;
    setTimeout(() => {
      const app = $("#app");
      const drawArt = k => {
        const list = STUDIO.filter(w => k === "All" || S.studio.items[w.i].kind === k);
        $("#s-count").textContent = plural(list.length, "work");
        $("#s-grid").innerHTML = list.map(w => `<figure class="studio-item"><button class="studio-img" type="button" data-kind="studio" data-i="${w.i}" aria-label="${esc(w.t)}">
            ${thumbImg(w.img, w.t)}</button>
          <figcaption><b>${esc(w.t)}</b><span>${esc(w.year)} · ${esc(w.medium)}</span></figcaption></figure>`).join("");
      };
      $$(".chip[data-medium]").forEach(b => b.addEventListener("click", () => {
        $$(".chip[data-medium]").forEach(x => x.setAttribute("aria-pressed", x === b)); drawArt(b.dataset.medium);
      }));
      if ($("#s-grid")) drawArt("All");
      const show = (id, scroll) => {
        app.dataset.show = id;
        $$(".work-switch a").forEach(a => a.dataset.show === id ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
        if (scroll) window.scrollTo({ top: 0 });
      };
      app.addEventListener("click", e => {
        const a = e.target.closest("[data-show]"); if (!a) return;
        e.preventDefault(); show(a.dataset.show, a.classList.contains("see-all"));
        history.replaceState(null, "", a.dataset.show === "all" ? location.pathname : "#" + a.dataset.show);
      });
      const route = () => {
        const h = location.hash.slice(1);
        if (SECS.some(x => x[0] === h)) return show(h, true);
        show("all");
        const t = h && document.getElementById(h);
        if (t) { t.scrollIntoView(); t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); }
      };
      route();
      addEventListener("hashchange", route);
      linkVault(app);
    });
    return html;
  }

  function booksPage() {
    const read = booksRead(), dated = read.filter(b => b.read);
    const years = [...new Set(dated.map(b => parse(b.read).y))].sort((a, b) => b - a);
    const toRead = BOOKS.filter(b => b.shelf === "to-read").sort(byDateDesc("added"));
    const dnf = BOOKS.filter(b => b.shelf === "dnf");
    const defs = [
      ["read", "Read", body => grid(body, read, {
        id: "br", noun: "book",
        filters: [
          { id: "br-year", label: "Year", options: [["all", "All"], ...years.map(y => [String(y), String(y)]), ["undated", "Undated"]], test: (b, v) => v === "undated" ? !b.read : parse(b.read).y === +v },
          { id: "br-rating", ...ratingFilter(1) },
          { id: "br-notes", label: "Show", options: [["all", "All"], ["notes", "With my notes"]], test: b => b.notes.length > 0 }
        ],
        sorts: [["date", "Date read", (a, b) => String(b.read || "").localeCompare(String(a.read || ""))],
                ["rating", "Rating", (a, b) => (b.r ?? 0) - (a.r ?? 0)],
                ["title", "Title", (a, b) => a.t.localeCompare(b.t)],
                ["author", "Author", (a, b) => a.a.localeCompare(b.a)]]
      })],
      ["diary", "Diary", body => {
        body.innerHTML = diaryTable(dated.map(b => ({ date: b.read, it: b, r: b.r, review: b.review })), { label: "Book" })
          + `<p class="note">${plural(read.length - dated.length, "book")} read before I started logging dates ${read.length - dated.length === 1 ? "is" : "are"} under Read.</p>`;
      }],
      ["favorites", "Favorites", body => { body.innerHTML = `<ul class="posters">${bookFavs().map(b => posterItem(b)).join("")}</ul>`; }],
      ["to-read", "Want to read", body => grid(body, toRead, {
        id: "bt", noun: "book",
        sorts: [["added", "Recently added", byDateDesc("added")], ["title", "Title", (a, b) => a.t.localeCompare(b.t)], ["author", "Author", (a, b) => a.a.localeCompare(b.a)]],
        item: () => ({ caption: "" })
      })]
    ];
    if (S.showDidNotFinish && dnf.length) defs.push(["dnf", "Did not finish", body => { body.innerHTML = `<ul class="posters">${dnf.map(b => posterItem(b, { caption: "" })).join("")}</ul>`; }]);
    const [tabHtml, start] = tabs("books", defs);
    setTimeout(start);
    const reading = booksReading();
    return `
      <div class="page-head"><div><h1 class="page-title">Books</h1><p class="page-sub">What I’ve read, am reading and want to read.</p></div>
        ${statsRow([[read.length, "Read"], [dated.filter(b => parse(b.read).y === thisYear).length, "This year"], [bookFavs().length, "Favorites"], [toRead.length, "To read"]])}</div>
      <div class="cols">
        <div>
          ${reading.length ? `<section class="section">${sectionHead("Currently reading")}<ul class="posters six">${reading.map(b => posterItem(b, { caption: "Since " + fmtDate(b.added) })).join("")}</ul></section>` : ""}
          <section class="section">${tabHtml}</section>
        </div>
        <aside>
          ${ratingsBlock(read.filter(b => b.r != null).map(b => b.r), 1)}
          ${notedBlock(BOOKS, "Books")}
          <section class="side-block">${sectionHead("Recently read", "books.html#diary", "Diary")}${diaryMini(dated.map(b => ({ date: b.read, it: b })), 3)}</section>
        </aside>
      </div>`;
  }

  /* sidebar list of works that have notes in my vault, most ideas first */
  function notedBlock(list, noun) {
    const ideas = it => it.notes.reduce((s, n) => s + n.ideas.length, 0);
    const noted = list.filter(it => it.notes && it.notes.length).sort((a, b) => ideas(b) - ideas(a));
    if (!noted.length) return "";
    return `<section class="side-block">${sectionHead("In my notes")}<p class="side-note">${noun} with a dog-eared corner have notes in my vault. Open one to read them.</p>
      <ul class="noted">${noted.slice(0, 8).map(it => `<li><button type="button" class="linkish" data-kind="${it.kind}" data-i="${it.i}">${esc(it.t)}</button><span>${plural(ideas(it), "idea")}</span></li>`).join("")}</ul></section>`;
  }

  function filmsPage() {
    const decades = [...new Set(FILMS.filter(f => f.y).map(f => Math.floor(f.y / 10) * 10))].sort((a, b) => b - a);
    const favs = FD.favorites.map(i => FILMS_ALL[i]).filter(shown);
    const yearCount = new Set(filmDiary.filter(d => parse(d.date).y === thisYear).map(d => d.f)).size;
    const defs = [
      ["films", "Films", body => grid(body, FILMS, {
        id: "fg", noun: "film",
        filters: [
          { id: "fg-decade", label: "Decade", options: [["all", "All"], ...decades.map(d => [String(d), d + "s"])], test: (f, v) => f.y && Math.floor(f.y / 10) * 10 === +v },
          { id: "fg-rating", ...ratingFilter(0.5) },
          { id: "fg-liked", label: "Show", options: [["all", "All"], ["liked", "Liked"], ...(FILMS.some(f => f.notes.length) ? [["notes", "With my notes"]] : [])], test: (f, v) => v === "notes" ? f.notes.length > 0 : f.liked }
        ],
        sorts: [["added", "When added", (a, b) => b.i - a.i],
                ["rating", "Rating", (a, b) => (b.r ?? 0) - (a.r ?? 0)],
                ["new", "Newest release", (a, b) => (b.y || 0) - (a.y || 0)],
                ["old", "Oldest release", (a, b) => (a.y || 9999) - (b.y || 9999)],
                ["title", "Title", (a, b) => a.t.localeCompare(b.t)]]
      })],
      ["diary", "Diary", body => { body.innerHTML = diaryTable(filmDiary, { label: "Film" }); }],
      ["lists", "Lists", body => {
        body.innerHTML = FD.lists.map(l => `<section class="list-block"><h3 class="list-title">${esc(l.name)}</h3>
          ${l.desc ? `<p class="list-desc">${esc(l.desc)}</p>` : ""}<p class="list-count">${plural(l.items.length, "film")}</p>
          <ul class="posters six ranked">${l.items.map(x => shown(FILMS_ALL[x.f]) ? posterItem(FILMS_ALL[x.f], { rank: x.pos }) : "").join("")}</ul></section>`).join("");
      }],
      ["watchlist", "Watchlist", body => grid(body, WATCH, {
        id: "fw", noun: "film",
        sorts: [["added", "Recently added", byDateDesc("added")], ["new", "Newest release", (a, b) => (b.y || 0) - (a.y || 0)], ["title", "Title", (a, b) => a.t.localeCompare(b.t)]],
        item: () => ({ caption: "" })
      })]
    ];
    const [tabHtml, start] = tabs("films", defs);
    setTimeout(start);
    return `
      <div class="page-head"><div><h1 class="page-title">Films</h1><p class="page-sub">${mdInline(FD.bio || "")}</p></div>
        ${statsRow([[FILMS.length, "Films"], [yearCount, "This year"], [FD.lists.length, "Lists"], [WATCH.length, "Watchlist"]])}</div>
      <div class="cols">
        <div>
          <section class="section">${sectionHead("Favorite films")}<ul class="posters four">${favs.map(f => posterItem(f)).join("")}</ul></section>
          <section class="section">${sectionHead("Recent activity", "films.html#diary", "All")}
            <ul class="posters four">${filmDiary.slice(0, 4).map(d => posterItem(d.it, { r: d.r })).join("")}</ul></section>
          <section class="section">${tabHtml}</section>
        </div>
        <aside>
          ${ratingsBlock(FILMS.filter(f => f.r != null).map(f => f.r), 0.5)}
          ${notedBlock(FILMS, "Films")}
          <section class="side-block">${sectionHead("Diary", "films.html#diary", String(filmDiary.length))}${diaryMini(filmDiary, 3)}</section>
        </aside>
      </div>`;
  }

  /* my ranked favorite artists (admin > Art, content.js "artists"), each with the works by them I've logged */
  function favArtists() {
    const fav = (S.artists || []).filter(a => a && a.name);
    if (!fav.length) return "";
    const key = s => String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    return `<section class="side-block fav-artists">${sectionHead("Favorite artists")}<ol class="artist-rank">${fav.map((a, n) => {
      const works = ART.filter(w => key(w.artist) === key(a.name));
      return `<li><i class="ar-n">${n + 1}</i><div class="ar-text"><b>${works.length ? `<button type="button" class="linkish" data-artist="${esc(works[0].artist)}">${esc(a.name)}</button>` : esc(a.name)}</b>
        ${a.note ? `<p>${mdInline(a.note)}</p>` : ""}${works.length ? `<small>${plural(works.length, "work")} logged</small>` : ""}</div>
        ${works.length ? `<div class="ar-works">${works.slice(0, 4).map(w => `<button class="art-tile" type="button" data-kind="art" data-i="${w.i}" aria-label="${esc(w.t)}">${coverFace(w.t, w.artist)}${w.img ? `<img alt="" loading="lazy" src="${esc(w.img)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</button>`).join("")}</div>` : ""}</li>`;
    }).join("")}</ol></section>`;
  }
  function artPage() {
    const artists = countBy(ART, a => a.artist === "Unknown" ? null : a.artist);
    const movements = countBy(ART, a => a.movements);
    const media = countBy(ART, a => a.medium);
    const noted = ART.filter(a => a.note);
    const html = `
      <div class="page-head"><div><h1 class="page-title">Art</h1><p class="page-sub">Works I’ve seen in museums and want to remember, kept in my notes. Click any work to see it larger.</p></div>
        ${statsRow([[ART.length, "Works"], [artists.length, "Artists"], [movements.length, "Movements"], [noted.length, "Notes"]])}</div>
      <div class="cols">
        <div>
          <section class="section"><div class="filterbar slim"><div class="group">
            <label class="select" for="a-medium">Medium <select id="a-medium"><option value="all">All</option>${media.map(([m, n]) => `<option value="${esc(m)}">${esc(m)} (${n})</option>`).join("")}</select></label>
            <label class="select" for="a-move">Movement <select id="a-move"><option value="all">All</option>${movements.map(([m, n]) => `<option value="${esc(m)}">${esc(m)} (${n})</option>`).join("")}</select></label>
            <label class="select" for="a-artist">Artist <select id="a-artist"><option value="all">All</option>${artists.map(([m, n]) => `<option value="${esc(m)}">${esc(m)} (${n})</option>`).join("")}</select></label>
            <label class="select" for="a-sort">Sort <select id="a-sort"><option value="logged">Recently logged</option><option value="artist">Artist</option><option value="title">Title</option>${ART.some(a => a.year) ? '<option value="old">Year, oldest first</option><option value="new">Year, newest first</option>' : ""}</select></label>
          </div><span class="count" id="a-count"></span></div>
          <ul class="art-grid" id="a-grid"></ul><div class="more-wrap" id="a-more"></div></section>
          ${noted.length ? `<section class="section">${sectionHead("Notes")}<ul class="entries">${noted.map(a => `<li class="entry art-note">
            <div class="entry-poster"><button class="art-tile" type="button" data-kind="art" data-i="${a.i}" aria-label="${esc(a.t)}">${coverFace(a.t, a.artist)}${a.img ? `<img alt="" loading="lazy" src="${esc(a.img)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</button></div>
            <div class="entry-text"><h3><button type="button" class="linkish" data-kind="art" data-i="${a.i}">${esc(a.t)}</button></h3>
              <div class="entry-meta"><span>${esc(a.artist)}${a.year ? ", " + esc(a.year) : ""}</span>${a.medium ? `<span class="pill">${esc(a.medium)}</span>` : ""}</div>
              ${md(a.note)}</div></li>`).join("")}</ul></section>` : ""}
        </div>
        <aside>
          ${favArtists()}
          <section class="side-block">${sectionHead("Most seen artists")}<ul class="tally">${artists.slice(0, 10).map(([a, n]) => `<li><button type="button" class="linkish" data-artist="${esc(a)}">${esc(a)}</button><span class="tally-bar" style="width:${n / artists[0][1] * 100}%"></span><b>${n}</b></li>`).join("")}</ul></section>
          <section class="side-block">${sectionHead("Movements")}<div class="tags">${movements.map(([m, n]) => `<button type="button" class="tag" data-move="${esc(m)}">${esc(m)} <i>${n}</i></button>`).join("")}</div></section>
        </aside>
      </div>`;
    setTimeout(() => {
      let shown = 24;
      const draw = (reset = true) => {
        if (reset) shown = 24;
        const md = $("#a-medium").value, mv = $("#a-move").value, ar = $("#a-artist").value, so = $("#a-sort").value;
        let list = ART.filter(a => (md === "all" || a.medium === md) && (mv === "all" || a.movements.includes(mv)) && (ar === "all" || a.artist === ar));
        if (so === "artist") list = [...list].sort((a, b) => a.artist.localeCompare(b.artist) || a.t.localeCompare(b.t));
        if (so === "title") list = [...list].sort((a, b) => a.t.localeCompare(b.t));
        if (so === "old" || so === "new") {   /* works without a year go last; "c. 1665" and "1508–1512" sort by their first year */
          const yr = a => { const m = String(a.year || "").match(/\d{3,4}/); return m ? +m[0] * (/\bBCE?\b/i.test(a.year) ? -1 : 1) : null; };
          list = [...list].sort((a, b) => (yr(a) == null) - (yr(b) == null) || (so === "old" ? yr(a) - yr(b) : yr(b) - yr(a)));
        }
        $("#a-count").textContent = plural(list.length, "work");
        $("#a-grid").innerHTML = list.slice(0, shown).map(artTile).join("") || '<li class="empty">Nothing matches.</li>';
        $("#a-more").innerHTML = list.length > shown ? `<button class="btn" type="button">Show ${Math.min(24, list.length - shown)} more</button>` : "";
        const more = $("#a-more button"); if (more) more.onclick = () => { shown += 24; draw(false); };
      };
      ["#a-medium", "#a-move", "#a-artist", "#a-sort"].forEach(id => $(id).addEventListener("change", () => draw()));
      $$("[data-artist]").forEach(b => b.addEventListener("click", () => { $("#a-artist").value = b.dataset.artist; $("#a-move").value = "all"; draw(); $("#a-grid").scrollIntoView({ behavior: "smooth", block: "start" }); }));
      $$("[data-move]").forEach(b => b.addEventListener("click", () => { $("#a-move").value = b.dataset.move; $("#a-artist").value = "all"; draw(); $("#a-grid").scrollIntoView({ behavior: "smooth", block: "start" }); }));
      draw();
    });
    return html;
  }


  /* ---------- music: aggregates of my Spotify history (data/music.js) ---------- */
  /* Favorite composers and artists: my ranked picks from admin (content.js music.top: names, or {name, img, note}).
     Each has a portrait (mine, or Wikipedia's) and opens a panel: a short Wikipedia summary, my note, my most played
     tracks by them (from my Spotify history, data/music.js, loaded on the Music page only), what I play by them and
     where they appear in my lists. */
  const favPeople = () => { const m = S.music || {}; return (m.top || [...(m.classical || []), ...(m.other || [])]).map(x => typeof x === "string" ? { name: x } : x).filter(x => x && x.name); };
  const topPicks = () => favPeople().map(x => x.name);
  const wikiCache = {};
  function wikiSummary(name) {
    if (wikiCache[name]) return wikiCache[name];
    const key = "wk1:" + name;
    try { const c = JSON.parse(localStorage.getItem(key) || "null"); if (c && Date.now() - c.at < 14 * 864e5) return (wikiCache[name] = Promise.resolve(c.v)); } catch (e) {}
    return (wikiCache[name] = fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(name.replace(/ /g, "_")) + "?redirect=true")
      .then(r => r.ok ? r.json() : null).then(j => {
        const v = j && j.type !== "disambiguation" ? { img: (j.thumbnail || {}).source || "", text: j.extract || "", desc: j.description || "", url: ((j.content_urls || {}).desktop || {}).page || "" } : null;
        try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), v })); } catch (e) {}
        return v;
      }).catch(() => null));
  }
  const nameKey = s => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").trim();
  const samePerson = (a, b) => { const x = nameKey(a), y = nameKey(b); if (!x || !y) return false; if (x === y) return true;
    const lx = x.split(" ").pop(), ly = y.split(" ").pop(); return lx === ly && lx.length > 3; };
  /* my most played tracks by someone: all-time lists first, then each year's, in listening order */
  function mostPlayed(name, n = 5) {
    const M = window.MUSIC; if (!M) return [];
    const ids = [];
    for (const side of Object.keys(M.periods || {})) for (const per of ["all", ...Object.keys(M.periods[side]).filter(k => k !== "all").sort().reverse()])
      for (const i of (M.periods[side][per] || {}).tracks || []) if (!ids.includes(i) && M.tracks[i] && samePerson(M.tracks[i].a, name)) ids.push(i);
    return ids.slice(0, n).map(i => M.tracks[i]);
  }
  function topFive() {
    const people = favPeople();
    if (!people.length) return "";
    setTimeout(() => people.forEach((p, k) => { if (p.img) return; wikiSummary(p.name).then(v => { const im = $(`.fav-people [data-fp="${k}"] .fp-img`); if (v && v.img && im) { im.src = v.img; im.hidden = false; } }); }));
    return `<ol class="fav-people">${people.map((p, n) => `<li><button type="button" class="fp" data-fp="${n}" aria-label="${esc(p.name)}: more">
      <i class="fp-n">${n + 1}</i><span class="fp-face"><span class="fp-init" aria-hidden="true">${esc(p.name.split(" ").pop().slice(0, 1))}</span><img class="fp-img" alt="" ${p.img ? `src="${esc(p.img)}"` : "hidden"} referrerpolicy="no-referrer" onerror="this.hidden=true"></span>
      <span class="fp-text"><b>${esc(p.name)}</b>${p.note ? `<span>${mdInline(p.note)}</span>` : ""}</span><span class="fp-more" aria-hidden="true">→</span></button></li>`).join("")}</ol>`;
  }
  function personPanel() {
    const dlg = document.createElement("dialog"); dlg.className = "person-dlg"; document.body.appendChild(dlg);
    const open = async k => {
      const p = favPeople()[k]; if (!p) return;
      const tracks = mostPlayed(p.name), plays = PLAY.filter(x => samePerson(x.a, p.name));
      const inLists = MU_LISTS.flatMap(l => l.items.map((x, i) => ({ x, i, l })).filter(o => samePerson(o.x.a, p.name)));
      const body = w => `<button class="dlg-close" type="button" aria-label="Close">×</button>
        <div class="pp-head"><span class="pp-face">${p.img || (w && w.img) ? `<img src="${esc(p.img || w.img)}" alt="" referrerpolicy="no-referrer">` : `<span class="fp-init">${esc(p.name.split(" ").pop().slice(0, 1))}</span>`}</span>
          <div><p class="pp-rank">Number ${k + 1} of my favorites</p><h3>${esc(p.name)}</h3>${w && w.desc ? `<p class="by">${esc(w.desc)}</p>` : ""}</div></div>
        ${p.note ? `<div class="review">${md(p.note)}</div>` : ""}
        ${w && w.text ? `<p class="pp-wiki">${esc(w.text)} ${w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener">Wikipedia</a>` : ""}</p>` : w === undefined ? '<p class="pp-wiki note">Loading…</p>' : ""}
        ${tracks.length ? `<h4>What I listen to most</h4><ol class="pp-tracks">${tracks.map(t => `<li><a href="https://open.spotify.com/track/${esc(t.id)}" target="_blank" rel="noopener">${esc(t.t)}</a></li>`).join("")}</ol>` : ""}
        ${plays.length ? `<h4>What I play by them</h4><ul class="pp-tracks">${plays.map(x => `<li>${esc(x.t)}<span>${esc([PLAY_STATUS[x.status || "played"], x.with, x.when].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul>` : ""}
        ${inLists.length ? `<h4>In my lists</h4><ul class="pp-tracks">${inLists.map(o => `<li>${esc(o.x.t)}<span>Number ${o.i + 1} in <a href="#list-${slug(o.l.name)}">${esc(o.l.name)}</a></span></li>`).join("")}</ul>` : ""}`;
      const paint = w => { dlg.innerHTML = body(w); $(".dlg-close", dlg).onclick = () => dlg.close(); $$("a[href^='#list-']", dlg).forEach(a => a.addEventListener("click", () => dlg.close())); };
      paint(undefined); if (!dlg.open) dlg.showModal();
      paint(await wikiSummary(p.name));
    };
    document.addEventListener("click", e => { const b = e.target.closest("[data-fp]"); if (b) open(+b.dataset.fp); });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }
  /* ---------- music: my ranked lists and what I play (content.js "music", edited in admin) ---------- */
  const MU = S.music || {};
  const MU_LISTS = (MU.lists || []).filter(l => l && l.name && (l.items || []).some(x => x.t));
  const PLAY = (MU.play || []).filter(p => p && p.t);
  const PLAY_STATUS = { now: "Playing now", played: "Played", learn: "Want to learn" };
  const audioOf = u => /\.(mp3|m4a|wav|ogg|aac|flac)(?:[?#]\S*)?$/i.test(String(u || "").trim());
  function recording(u, title) {
    if (!u) return "";
    const v = videoOf(u);
    if (v) return videoPlayer(v, title);
    if (audioOf(u)) return `<audio class="aud" src="${esc(u)}" controls preload="none"></audio>`;
    return `<a class="read-link" href="${esc(u)}" target="_blank" rel="noopener">Listen <span class="arr">→</span></a>`;
  }
  const playMeta = p => [p.with, p.when].filter(Boolean).map(esc).join(" · ");
  function playEntry(p) {
    return `<li class="play-entry"><div class="pe-head"><h3>${esc(p.t)}</h3>${p.status && p.status !== "played" ? `<span class="pill${p.status === "now" ? " live" : ""}">${PLAY_STATUS[p.status]}</span>` : ""}</div>
      <p class="by">${esc(p.a || "")}${playMeta(p) ? ` <span>· ${playMeta(p)}</span>` : ""}</p>
      ${p.note ? `<div class="review">${md(p.note)}</div>` : ""}${recording(p.rec, p.t)}</li>`;
  }
  function musicList(l) {
    return `<section class="list-block mu-list" id="list-${slug(l.name)}"><h3 class="list-title">${esc(l.name)}</h3>
      ${l.desc ? `<div class="list-desc">${md(l.desc)}</div>` : ""}
      <ol class="mu-rank">${l.items.filter(x => x.t).map((x, n) => `<li><i>${n + 1}</i><div><b>${esc(x.t)}</b>${x.a ? `<span>${esc(x.a)}</span>` : ""}
        ${x.note ? `<p>${mdInline(x.note)}</p>` : ""}</div></li>`).join("")}</ol></section>`;
  }
  function musicPage() {
    setTimeout(personPanel);
    const now = PLAY.filter(p => p.status === "now"), learn = PLAY.filter(p => p.status === "learn"), played = PLAY.filter(p => p.status !== "now" && p.status !== "learn");
    const empty = msg => `<p class="note">${msg}</p>`;
    return `
      <div class="page-head"><div><h1 class="page-title">Music</h1><p class="page-sub">${mdInline(MU.bio || "The music I love, classical and otherwise, and what I play on the violin.")}</p></div>
        ${statsRow([[MU_LISTS.length, "Lists"], [PLAY.filter(p => p.status !== "learn").length, "Pieces played"], [now.length, "Playing now"]])}</div>
      <div class="cols">
        <div>
          ${favPeople().length ? `<section class="section">${sectionHead("Favorite composers and artists")}${topFive()}</section>` : ""}
          <section class="section">${sectionHead("What I play")}
            ${now.length || played.length ? `<ul class="play-list">${[...now, ...played].map(playEntry).join("")}</ul>` : empty("Nothing here yet.")}</section>
          <section class="section">${sectionHead("Lists")}${MU_LISTS.length ? MU_LISTS.map(musicList).join("") : empty("No lists yet.")}</section>
        </div>
        <aside>
          ${now.length ? `<section class="side-block">${sectionHead("On my stand")}<ul class="mu-side">${now.map(p => `<li><b>${esc(p.t)}</b><span>${esc([p.a, p.with].filter(Boolean).join(" · "))}</span></li>`).join("")}</ul></section>` : ""}
          ${learn.length ? `<section class="side-block">${sectionHead("Want to learn")}<ul class="mu-side">${learn.map(p => `<li><b>${esc(p.t)}</b><span>${esc(p.a || "")}</span></li>`).join("")}</ul></section>` : ""}
          ${MU_LISTS.length > 1 ? `<section class="side-block">${sectionHead("Lists")}<ul class="mu-side">${MU_LISTS.map(l => `<li><a href="#list-${slug(l.name)}">${esc(l.name)}</a><span>${plural(l.items.filter(x => x.t).length, "entry", "entries")}</span></li>`).join("")}</ul></section>` : ""}
        </aside>
      </div>`;
  }

  /* "Last synced" line: build time written by tools/build-graph.py, else the page's own modified date */
  function vaultStamp() {
    const el = document.getElementById("vault-data");
    const m = el && el.textContent.match(/"built":"([^"]+)"/);
    const when = new Date(m ? m[1] : document.lastModified);
    if (isNaN(when)) return "";
    const mins = Math.round((Date.now() - when) / 60000);
    const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? plural(Math.round(mins / 60), "hour") + " ago"
      : mins < 2880 ? "yesterday" : plural(Math.round(mins / 1440), "day") + " ago";
    const full = when.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    return `<p class="vault-stamp"><i></i>Last synced with my notes <time datetime="${when.toISOString()}" data-tip="${esc(full)}">${ago}</time></p>`;
  }

  /* studio grids show a small copy from assets/studio/thumbs/ (made by admin on upload or tools/optimize-images.py); full size if it is missing */
  const thumbOf = src => /^assets\/studio\/[^/]+\.(jpe?g|png|webp)$/i.test(src || "") ? src.replace(/^assets\/studio\/([^/]+)\.\w+$/, "assets/studio/thumbs/$1.webp") : src;
  const thumbImg = (src, alt) => `<img alt="${esc(alt)}" loading="lazy" decoding="async" src="${esc(thumbOf(src))}" data-full="${esc(src)}" onerror="this.onerror=null;this.src=this.dataset.full">`;
  function studioTile(w) {
    return `<li class="art-item"><button class="art-tile" type="button" data-kind="studio" data-i="${w.i}" aria-label="${esc(w.t)}, ${esc(w.year)}">${thumbImg(w.img, "")}</button>
      <div class="art-cap"><b>${esc(w.t)}</b><span>${esc(w.year)} · ${esc(w.kind === "studio" ? w.medium.split(" on ")[0] : "")}</span></div></li>`;
  }
  function vaultPage() {
    return `
      <h1 class="page-title">The Vault</h1>
      <p class="page-sub">A live map of my reading notes. Every idea I have written down, and the links between them: the same graph I read and write in. Hover a node to trace what connects to what, click one to read the note, drag one to disturb its neighbourhood, scroll to zoom, double-click to reset.</p>
      <div id="graph-wrap">
        <canvas id="graph" aria-label="Interactive map of my notes"></canvas>
        <div class="graph-tip" id="graph-tip" aria-hidden="true"></div>
        <div class="graph-legend" id="graph-legend"></div>
      </div>
      ${vaultStamp()}`;
  }

  /* the About photo: a halftone print in the accent colour; the pointer reveals the colour photo underneath,
     like a flashlight. Tap toggles full colour on touch screens. */
  function revealPortrait() {
    const box = $("#portrait-reveal"); if (!box) return;
    let raf = 0, tx = 50, ty = 40, x = 50, y = 40;
    const step = () => { x += (tx - x) * .18; y += (ty - y) * .18; box.style.setProperty("--mx", x.toFixed(1) + "%"); box.style.setProperty("--my", y.toFixed(1) + "%");
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .1 ? requestAnimationFrame(step) : 0; };
    const aim = e => { const r = box.getBoundingClientRect(); tx = (e.clientX - r.left) / r.width * 100; ty = (e.clientY - r.top) / r.height * 100; if (!raf) raf = requestAnimationFrame(step); };
    box.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { box.classList.add("on"); aim(e); } });
    box.addEventListener("pointermove", e => { if (e.pointerType === "mouse") aim(e); });
    box.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") box.classList.remove("on"); });
    box.addEventListener("click", e => { if (e.pointerType !== "mouse") box.classList.toggle("full"); });
  }
  function aboutPage() {
    setTimeout(revealPortrait);
    return `
      <div class="cols">
        <div>
          <h1 class="page-title">About</h1>
          <div class="prose" style="margin-top:20px">${S.about.map(p => md(p, { html: true })).join("")}</div>
          <section class="section">${sectionHead("Selected record")}
            <ul class="timeline">${S.record.map(([y, t]) => `<li><span class="yr">${esc(y)}</span><span>${esc(t)}</span></li>`).join("")}</ul></section>
        </div>
        <aside>
          ${(S.profile.aboutPhoto || S.profile.avatar) ? `<div class="portrait-reveal" id="portrait-reveal" style="--photo:url('${esc(new URL(encodeURI(S.profile.aboutPhoto || S.profile.avatar), location.href).href)}')">
              <div class="about-portrait"><img src="${esc(S.profile.aboutPhoto || S.profile.avatar)}" alt="${esc(S.profile.name)}"><i class="pr-tint" aria-hidden="true"></i><i class="pr-dots" aria-hidden="true"></i><i class="pr-color" aria-hidden="true"></i></div>
              <p class="pr-hint">Move over the photo</p></div>` : ""}
          <section class="side-block">${sectionHead("Details")}
            <dl class="facts">${S.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>
          <section class="side-block">${sectionHead("Interests")}
            <div class="tags">${S.interests.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></section>
        </aside>
      </div>`;
  }

  /* ---------- socials: a flippable contact card, my local time, a quick note composer, link tiles ---------- */
  const SOCIAL_NOTE = { email: "Best way to reach me", linkedin: "Education and experience", curius: "Articles I’m reading", substack: "Essays and longer writing",
    x: "Shorter thoughts", spotify: "Playlists", musescore: "Sheet music", github: "Code", instagram: "Photos", goodreads: "Books" };
  /* what I'm reading, last listened to and last watched, straight from my logs */
  function currently() {
    const rows = [];
    const book = booksReading()[0];
    if (book) rows.push(["Reading", book.t, book.a]);
    const playing = PLAY.find(p => p.status === "now");
    if (playing) rows.push(["Playing", playing.t, playing.a || ""]);
    const seen = filmDiary[0];
    if (seen) rows.push(["Watched", seen.it.t, String(seen.it.y || "")]);
    if (!rows.length) return `<p class="ccard-tag">${esc(S.profile.tagline || "")}</p>`;
    return `<dl class="ccard-now">${rows.slice(0, 3).map(([k, t, sub]) => `<div><dt>${k}</dt><dd><b>${esc(t)}</b>${sub ? ` <span>${esc(sub)}</span>` : ""}</dd></div>`).join("")}</dl>`;
  }
  function socialsPage() {
    const p = S.profile, links = S.socials.filter(s => s.url);
    const mail = links.find(s => s.copy || /^mailto:/.test(s.url));
    const email = mail ? (mail.copy || mail.url.replace(/^mailto:/, "")) : "";
    const full = /\s/.test(p.name) ? p.name : `${p.name} ${String(p.legalName || "").split(" ").slice(-1)[0]}`.trim();
    const zone = p.timezone || "America/New_York";
    const city = String(p.location || "").split(",")[0];
    const avatar = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : `<span>${esc(p.initials || full[0])}</span>`;
    const tiles = links.filter(s => s !== mail).map(s => {
      const i = S.socials.indexOf(s), key = s.name.toLowerCase();
      return `<li class="stile"><a href="${esc(s.url)}" target="_blank" rel="noopener">
          <span class="stile-mark" aria-hidden="true">${esc(Array.from(s.name)[0])}</span>
          <span class="stile-text"><b>${esc(s.name)}</b><span>${esc(s.note || SOCIAL_NOTE[key] || s.handle)}</span></span>
          <span class="stile-go" aria-hidden="true">↗</span></a>
        ${/^@?[\w.\-]+$/.test(s.handle || "") ? `<button type="button" class="stile-copy" data-copy-handle="${i}" title="Copy ${esc(s.handle)}">${esc(s.handle)}</button>` : ""}</li>`;
    }).join("");
    const topics = ["Writing", "Music", "Art", "Just saying hi"];
    setTimeout(() => {
      /* card: tilt toward the pointer, flip on click or Enter */
      const card = $("#ccard"), inner = $(".ccard-inner", card);
      const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
      /* the back holds buttons, so it stays still; only the front tilts */
      const still = () => { inner.style.setProperty("--ry", "0deg"); inner.style.setProperty("--rx", "0deg"); };
      card.addEventListener("pointermove", e => { if (calm || card.classList.contains("flipped")) return; const r = card.getBoundingClientRect();
        inner.style.setProperty("--ry", (((e.clientX - r.left) / r.width - .5) * 22).toFixed(1) + "deg");
        inner.style.setProperty("--rx", (-((e.clientY - r.top) / r.height - .5) * 16).toFixed(1) + "deg");
        inner.style.setProperty("--gx", ((e.clientX - r.left) / r.width * 100).toFixed(0) + "%"); inner.style.setProperty("--gy", ((e.clientY - r.top) / r.height * 100).toFixed(0) + "%"); });
      card.addEventListener("pointerleave", () => { inner.style.setProperty("--ry", "0deg"); inner.style.setProperty("--rx", "0deg"); });
      const flip = () => { still(); card.classList.toggle("flipped"); card.setAttribute("aria-pressed", card.classList.contains("flipped")); };
      card.addEventListener("click", e => { if (!e.target.closest("a, button:not(#ccard)")) flip(); });
      card.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target === card) { e.preventDefault(); flip(); } });
      /* save contact: a vCard any phone or address book can import */
      const vc = $("#vcard"); if (vc) vc.addEventListener("click", e => {
        e.stopPropagation();
        const esc2 = v => String(v || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
        const [given, ...rest] = String(p.legalName || full).split(" ");
        const lines = ["BEGIN:VCARD", "VERSION:3.0", `N:${esc2(rest.join(" "))};${esc2(given)};;;`, `FN:${esc2(full)}`, p.name ? `NICKNAME:${esc2(p.name.split(" ")[0])}` : "",
          email ? `EMAIL;TYPE=INTERNET:${email}` : "", "URL:https://fangyuancao.me", ...links.filter(s => s !== mail).map(s => `X-SOCIALPROFILE;TYPE=${esc2(s.name.toLowerCase())}:${s.url}`),
          p.tagline ? `NOTE:${esc2(p.tagline)}` : "", "END:VCARD"].filter(Boolean);
        const url = URL.createObjectURL(new Blob([lines.join("\r\n") + "\r\n"], { type: "text/vcard" }));
        const dl = document.createElement("a"); dl.href = url; dl.download = full.replace(/\s+/g, "-") + ".vcf"; document.body.appendChild(dl); dl.click(); dl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000); toast("Contact card downloaded");
      });
      /* copy buttons */
      const copy = (text, btn, msg) => {
        const done = () => { if (btn) { const o = btn.textContent; btn.textContent = "Copied"; btn.classList.add("ok"); setTimeout(() => { btn.textContent = o; btn.classList.remove("ok"); }, 1400); } toast(msg); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => toast(text)); else toast(text);
      };
      $$("[data-copy-email]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); copy(email, b, "Email copied"); }));
      $$("[data-copy-handle]").forEach(b => b.addEventListener("click", () => { const s = S.socials[b.dataset.copyHandle]; copy(s.handle, b, `${s.name} handle copied`); }));
      /* local time, updated each minute */
      const tick = () => {
        const now = new Date(), fmt = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" });
        const h = +new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", hourCycle: "h23" }).format(now);
        const awake = h >= 7 && h < 24;
        const el = $("#localtime"); if (!el) return;
        el.innerHTML = `<i class="lt-dot${awake ? " on" : ""}"></i><b>${fmt.format(now)}</b> in ${esc(city)} · ${awake ? "probably awake" : "probably asleep, I’ll reply in the morning"}`;
      };
      tick(); setInterval(tick, 30000);
      /* quick note: picks a topic, opens the visitor's own email app */
      let topic = topics[0];
      $$("[data-topic]").forEach(b => b.addEventListener("click", () => { topic = b.dataset.topic; $$("[data-topic]").forEach(x => x.setAttribute("aria-pressed", x === b)); }));
      const f = $("#note-form"); if (f) f.addEventListener("submit", e => {
        e.preventDefault();
        const msg = $("#note-msg").value.trim(), from = $("#note-name").value.trim();
        if (!msg) { $("#note-msg").focus(); toast("Write a line or two first"); return; }
        const subject = `${topic === "Just saying hi" ? "Hello" : topic}${from ? " from " + from : ""} (via fangyuancao.me)`;
        location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg + (from ? `\n\n${from}` : ""))}`;
      });
    });
    return `<h1 class="page-title">Socials</h1>
      <p class="page-sub">I’m always happy to connect, whether about research, writing, or anything in between. Email is best.</p>
      <div class="contact">
        <div class="ccard" id="ccard" role="button" tabindex="0" aria-pressed="false" aria-label="Contact card. Press to flip.">
          <div class="ccard-inner">
            <div class="ccard-face front">
              <div class="ccard-top"><span class="ccard-av">${avatar}</span><span class="ccard-site">fangyuancao.me</span></div>
              <div class="ccard-name"><b>${esc(full)}</b><span class="cjk">${esc(p.cjk || "")}</span></div>
              ${currently()}
              <div class="ccard-foot"><span>${esc(p.location || "")}</span><span class="ccard-hint">Flip ↻</span></div>
              <i class="ccard-glare" aria-hidden="true"></i>
            </div>
            <div class="ccard-face back">
              <span class="ccard-label">Email</span>
              <b class="ccard-mail">${esc(email)}</b>
              <div class="ccard-actions">
                <a class="btn go" href="mailto:${esc(email)}">Write</a>
                <button class="btn" type="button" data-copy-email>Copy</button>
                <button class="btn" type="button" id="vcard">Save contact</button>
              </div>
              <span class="ccard-hint">Flip back ↻</span>
              <i class="ccard-glare" aria-hidden="true"></i>
            </div>
          </div>
        </div>
        <div class="contact-side">
          <p class="localtime" id="localtime"></p>
          <form class="note" id="note-form">
            <h2>Write to me</h2>
            <div class="note-topics" role="group" aria-label="Topic">${topics.map((t, k) => `<button type="button" class="chip" data-topic="${t}" aria-pressed="${k === 0}">${t}</button>`).join("")}</div>
            <label class="sr" for="note-msg">Message</label>
            <textarea id="note-msg" rows="4" placeholder="A line or two is plenty."></textarea>
            <div class="note-row"><label class="sr" for="note-name">Your name</label><input id="note-name" type="text" placeholder="Your name (optional)" autocomplete="name">
              <button class="btn go" type="submit">Open in my email app ↗</button></div>
            <p class="note-fine">Opens your own email app with this filled in. Nothing is sent from this page.</p>
          </form>
        </div>
      </div>
      <section class="section">${sectionHead("Elsewhere")}<ul class="stiles">${tiles}</ul></section>`;
  }

  /* Wrap a cover or artwork in a box with real depth: front, back and four edges.
     kind: book (spine + page edges), film (thin card), canvas (stretched canvas), board (paper on board). */
  function make3d(el, kind, depth, frame) {
    if (!el) return;
    const wrap = document.createElement("div");
    wrap.className = `obj3d ${kind}${frame ? " framed " + frame : ""}`;
    wrap.style.setProperty("--d", depth + "px");
    el.replaceWith(wrap);
    wrap.innerHTML = `<div class="obj"><div class="face front"></div><i class="face side l"></i><i class="face side r"></i><i class="face side t"></i><i class="face side b"></i><i class="face back"></i><i class="glare"></i></div>`;
    if (frame) {
      /* moulding, optional mat for works on paper, then the picture; corner rosettes on gilt */
      const f = document.createElement("div");
      f.className = `frame ${frame}`;
      f.innerHTML = `${frame === "gilt" ? '<i class="rosette tl"></i><i class="rosette tr"></i><i class="rosette bl"></i><i class="rosette br"></i>' : ""}<div class="${frame === "gilt" ? "lip" : "mat"}"></div>`;
      f.lastElementChild.appendChild(el);
      $(".front", wrap).appendChild(f);
    } else $(".front", wrap).appendChild(el);
  }
  /* which frame suits a work: gilt for paintings, walnut + mat for works on paper, none for objects */
  function frameFor(it) {
    const m = String(it.kind === "studio" ? (S.studio.items[it.i] || {}).kind : it.medium || "").toLowerCase();
    if (/photo/.test(m)) return "black";
    if (/sculpture|glass|furniture|ceramic/.test(m)) return null;
    if (/painting/.test(m) || /oil/i.test(it.medium || "")) return "gilt";
    return "walnut";
  }

  let openDetail = () => {};
  /* ---------- detail dialog for any book or film ---------- */
  function detailDialog() {
    const dlg = document.createElement("dialog");
    dlg.id = "detail";
    document.body.appendChild(dlg);
    let ctx = [], pos = 0;
    const render = it => {
      if (it.kind === "art" || it.kind === "studio") {
        const meta = [it.medium, it.size, it.movements.join(", "), it.museum && (it.museum + (it.city ? ", " + it.city : "")), it.seen ? "Seen " + fmtDate(it.seen) : it.logged ? "Logged " + fmtDate(it.logged) : ""].filter(Boolean);
        dlg.innerHTML = `<button class="dlg-close" type="button" aria-label="Close">×</button>
          <div class="dlg-art">${it.img ? `<div class="dlg-art-img"><img alt="${esc(it.t)}" src="${esc(it.img)}" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></div>` : ""}
          <div class="dlg-art-text"><h3>${esc(it.t)}</h3><p class="by">${esc(it.artist)}${it.year ? ", " + esc(it.year) : ""}</p>
            <p class="poster-caption">${esc(meta.join(" · "))}</p>
            ${it.note ? `<div class="review">${md(it.note)}</div>` : ""}
            ${it.link ? `<a class="read-link" href="${esc(it.link)}" target="_blank" rel="noopener">Source →</a>` : ""}</div></div>`;
        $(".dlg-close", dlg).onclick = () => dlg.close();
        dlg.classList.add("wide");
        const fr = frameFor(it);
        make3d($(".dlg-art-img img", dlg), it.kind === "studio" ? "board" : "canvas", fr === "black" ? 14 : fr ? 26 : it.kind === "studio" ? 5 : 10, fr);
        if (!dlg.open) dlg.showModal();
        return;
      }
      dlg.classList.remove("wide");
      let sub, meta = [], body = "", link = "", notesHtml = "";
      if (it.kind === "book") {
        sub = it.a + (it.year ? ` · ${it.year}` : "");
        const shelf = { read: it.read ? `Read ${fmtDate(it.read)}` : "Read", reading: `Reading since ${fmtDate(it.added)}`, "to-read": "Want to read", dnf: "Did not finish" }[it.shelf];
        meta.push(shelf); if (it.pages) meta.push(`${it.pages} pages`);
        body = it.review ? md(it.review) : "";
      } else if (it.kind === "album" || it.kind === "queue") {
        sub = [it.a, it.y].filter(Boolean).join(" · ");
        const logs = it.kind === "album" ? albumDiary.filter(d => d.m === it.i) : [];
        meta.push(FORMS[formOf(it)] + (it.side === "classical" ? " · Classical" : ""));
        if (logs.length) meta.push("Listened " + logs.map(d => fmtDate(d.date) + [d.perf, d.again && "relisten"].filter(Boolean).map(x => ` (${x})`).join("")).join(", "));
        else if (it.kind === "queue") meta.push("On my listening list");
        body = logs.filter(d => d.review).map(d => md(d.review)).join("");
        if (it.sp) link = `<a class="read-link" href="https://open.spotify.com/${esc(it.sp)}" target="_blank" rel="noopener">Listen on Spotify <span class="arr">→</span></a>`;
      } else {
        sub = String(it.y || "");
        const logs = it.kind === "film" ? filmDiary.filter(d => d.f === it.i) : [];
        if (logs.length) meta.push("Watched " + logs.map(d => fmtDate(d.date) + (d.rewatch ? " (rewatch)" : "")).join(", "));
        else if (it.kind === "watch") meta.push("On my watchlist");
        body = logs.filter(d => d.review).map(d => md(d.review)).join("");
        if (it.notes && it.notes.length && it.notes[0].author) sub = [sub, it.notes[0].author].filter(Boolean).join(" · ");
      }
      {
        if (it.notes && it.notes.length) {
          notesHtml = it.notes.map(n => {
            const ideas = n.ideasInGraph.length ? n.ideasInGraph : n.ideas;
            return `<section class="dlg-notes">
              <h4>${it.notes.length > 1 ? esc(n.title) + " · " : ""}From my notes</h4>
              ${n.summary.map(p => `<p>${esc(p)}</p>`).join("")}
              ${n.significance.length ? `<h5>Why it matters</h5>${n.significance.map(p => `<p>${esc(p)}</p>`).join("")}` : ""}
              ${ideas.length ? `<h5>Ideas I took from it</h5><ul class="ideas">${ideas.slice(0, 8).map(t => n.ideasInGraph.includes(t)
                  ? `<li><a href="${vaultLink(t)}">${esc(t)}</a></li>` : `<li>${esc(t)}</li>`).join("")}</ul>
                ${ideas.length > 8 ? `<p class="more-ideas">and ${ideas.length - 8} more</p>` : ""}` : ""}
              ${n.inGraph ? `<a class="read-link" href="${vaultLink(n.note)}">See it in the Vault <span class="arr">→</span></a>` : ""}</section>`;
          }).join("");
        }
      }
      const title = it.kind === "book" ? it.full || it.t : it.t;
      dlg.innerHTML = `<button class="dlg-close" type="button" aria-label="Close">×</button>
        <div class="dlg"><div>${poster(it, ' tabindex="-1"')}</div>
        <div><h3>${esc(title)}</h3><p class="by">${esc(sub)}</p>
          <div class="poster-meta">${stars(it.r)}${heart(it.liked)}${it.fav ? '<span class="pill">Favorite</span>' : ""}</div>
          <p class="poster-caption">${esc(meta.join(" · "))}</p>
          ${body ? `<div class="review">${body}</div>` : ""}${link}${notesHtml}</div></div>`;
      dlg.classList.toggle("wide", !!notesHtml);
      linkVault(dlg);
      $(".dlg-close", dlg).onclick = () => dlg.close();
      make3d($(".dlg .poster", dlg), it.kind === "book" ? "book" : byArtist(it.kind) ? "record" : "film", it.kind === "book" ? Math.round(Math.min(34, Math.max(10, (it.pages || 300) / 22))) : 4);
      if (!dlg.open) dlg.showModal();
    };
    const nav = () => {
      if (ctx.length < 2) return;
      dlg.insertAdjacentHTML("beforeend", `<div class="dlg-nav"><button type="button" class="nav-btn" data-step="-1" aria-label="Previous">←</button><span>${pos + 1} / ${ctx.length}</span><button type="button" class="nav-btn" data-step="1" aria-label="Next">→</button></div>`);
      $$("[data-step]", dlg).forEach(b => b.onclick = () => step(+b.dataset.step));
    };
    const step = d => { if (ctx.length < 2) return; pos = (pos + d + ctx.length) % ctx.length; render(ctx[pos]); nav(); };
    openDetail = (it, list) => { ctx = list && list.length ? list : [it]; pos = Math.max(0, ctx.indexOf(it)); render(it); nav(); };
    document.addEventListener("click", e => {
      const t = e.target.closest("[data-kind][data-i]");
      if (!t || t.closest("dialog") || t.tagName === "A") return;
      const it = POOL[t.dataset.kind][+t.dataset.i];
      if (!it) return;
      const scope = t.closest(".tab-body, section, aside, main") || document;
      const seen = new Set(), list = [];
      $$(`[data-kind="${it.kind}"][data-i]`, scope).forEach(el => { const k = +el.dataset.i; if (!seen.has(k)) { seen.add(k); list.push(POOL[it.kind][k]); } });
      openDetail(it, list);
    });
    dlg.addEventListener("keydown", e => { if (e.key === "ArrowRight") step(1); if (e.key === "ArrowLeft") step(-1); });
    /* tilt the 3D object toward the pointer */
    const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    dlg.addEventListener("pointermove", e => {
      const o = $(".obj", dlg); if (!o || calm) return;
      const r = o.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (innerWidth / 3)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (innerHeight / 3)));
      o.classList.add("live");
      o.style.setProperty("--ry", (nx * 32).toFixed(2) + "deg");
      o.style.setProperty("--rx", (-ny * 14).toFixed(2) + "deg");
      o.style.setProperty("--gx", (50 + nx * 45).toFixed(1) + "%");
      o.style.setProperty("--gy", (50 + ny * 45).toFixed(1) + "%");
    });
    dlg.addEventListener("pointerleave", () => { const o = $(".obj", dlg); if (o) { o.classList.remove("live"); o.style.removeProperty("--ry"); o.style.removeProperty("--rx"); } });
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- search palette (Ctrl/Cmd+K or /) ---------- */
  function searchPalette() {
    const index = [
      ...NAV.map(([href, label]) => ({ type: "Page", t: label, sub: "", href })),
      ...S.writings.map(w => ({ type: TYPE_LABEL[w.type] || "Writing", t: w.title, sub: w.venue, href: workHref(w) })),
      ...BOOKS.filter(b => b.shelf !== "to-read").map(b => ({ type: "Book", t: b.t, sub: b.a, it: b, href: "books.html" })),
      ...FILMS.map(f => ({ type: "Film", t: f.t, sub: String(f.y || ""), it: f, href: "films.html" })),
      ...ART.map(a => ({ type: "Art", t: a.t, sub: a.artist, it: a, href: "art.html" })),
      ...PLAY.map(p => ({ type: "Music I play", t: p.t, sub: p.a || "", href: "music.html" })),
      ...MU_LISTS.flatMap(l => l.items.filter(x => x.t).map(x => ({ type: "Music", t: x.t, sub: [x.a, l.name].filter(Boolean).join(" · "), href: `music.html#list-${slug(l.name)}` }))),
      ...STUDIO.map(w => ({ type: "Studio", t: w.t, sub: `${w.year} · my work`, it: w, href: "work.html#art" }))
    ];
    const pal = document.createElement("dialog");
    pal.className = "palette";
    pal.innerHTML = `<div class="pal-box"><label class="pal-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="pal-q" type="search" placeholder="Search writing, books, films, art, notes…" autocomplete="off" spellcheck="false" aria-label="Search"></label>
      <ul class="pal-list" id="pal-list" role="listbox"></ul>
      <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div></div>`;
    document.body.appendChild(pal);
    const q = $("#pal-q", pal), ul = $("#pal-list", pal);
    let results = [], sel = 0;
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      if (!term) results = index.filter(x => x.type === "Page");
      else {
        const words = term.split(/\s+/);
        results = index.map(x => {
          const hay = (x.t + " " + x.sub).toLowerCase(), t = x.t.toLowerCase();
          if (!words.every(w => hay.includes(w))) return null;
          return [x, (t.startsWith(term) ? 0 : t.includes(term) ? 1 : 2) + (x.type === "Note" ? 0.5 : 0)];
        }).filter(Boolean).sort((a, b) => a[1] - b[1] || a[0].t.length - b[0].t.length).slice(0, 10).map(r => r[0]);
      }
      sel = 0;
      ul.innerHTML = results.map((x, i) => `<li role="option" class="pal-item" data-n="${i}" aria-selected="${i === sel}"><span class="pal-type">${esc(x.type)}</span><span class="pal-t">${esc(x.t)}</span><span class="pal-sub">${esc(x.sub)}</span></li>`).join("")
        || `<li class="pal-empty">Nothing found for “${esc(q.value)}”</li>`;
    };
    const mark = () => $$(".pal-item", ul).forEach(li => { const on = +li.dataset.n === sel; li.setAttribute("aria-selected", on); if (on) li.scrollIntoView({ block: "nearest" }); });
    const go = x => {
      if (!x) return;
      pal.close();
      if (x.it) openDetail(x.it);
      else location.href = x.href;
    };
    q.addEventListener("input", draw);
    q.addEventListener("keydown", e => {
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, results.length - 1); mark(); e.preventDefault(); }
      if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); mark(); e.preventDefault(); }
      if (e.key === "Enter") { go(results[sel]); e.preventDefault(); }
    });
    ul.addEventListener("click", e => { const li = e.target.closest(".pal-item"); if (li) go(results[+li.dataset.n]); });
    ul.addEventListener("mousemove", e => { const li = e.target.closest(".pal-item"); if (li && +li.dataset.n !== sel) { sel = +li.dataset.n; mark(); } });
    pal.addEventListener("click", e => { if (e.target === pal) pal.close(); });
    let notesLoaded = false;
    const loadNotes = () => {
      if (notesLoaded) return; notesLoaded = true;
      const add = () => (window.VAULT_INDEX ? window.VAULT_INDEX.notes : []).forEach(([t, folder]) =>
        index.push({ type: "Note", t, sub: folder, href: "vault.html?note=" + encodeURIComponent(t) }));
      if (window.VAULT_INDEX) { add(); return; }
      const sc = document.createElement("script"); sc.src = "data/vault-index.js";
      sc.onload = () => { add(); if (pal.open && q.value.trim()) draw(); };
      document.head.appendChild(sc);
    };
    const open = () => { if (pal.open) return; loadNotes(); q.value = ""; draw(); pal.showModal(); q.focus(); };
    $("#search-btn").addEventListener("click", open);
    document.addEventListener("keydown", e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); pal.open ? pal.close() : open(); }
      else if (e.key === "/" && !typing && !document.querySelector("dialog[open]")) { e.preventDefault(); open(); }
    });
  }

  /* ---------- small comforts ---------- */
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 1900);
  }
  function chrome() {
    const head = $(".site-header");
    const top = document.createElement("button");
    top.className = "to-top"; top.type = "button"; top.setAttribute("aria-label", "Back to top"); top.innerHTML = "↑";
    top.onclick = () => window.scrollTo({ top: 0, behavior: "smooth" });
    document.body.appendChild(top);
    const onScroll = () => { head.classList.toggle("scrolled", scrollY > 8); top.classList.toggle("show", scrollY > 700); };
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
    /* floating tooltip for anything with data-tip */
    const tip = document.createElement("div"); tip.className = "tip"; tip.setAttribute("aria-hidden", "true"); document.body.appendChild(tip);
    document.addEventListener("pointerover", e => {
      const t = e.target.closest("[data-tip]");
      if (!t) { tip.classList.remove("on"); return; }
      tip.textContent = t.dataset.tip;
      const r = t.getBoundingClientRect();
      tip.style.left = Math.min(innerWidth - 12, Math.max(12, r.left + r.width / 2)) + "px";
      tip.style.top = (r.top - 8) + "px";
      tip.classList.add("on");
    });
    addEventListener("scroll", () => tip.classList.remove("on"), { passive: true });
    /* count the profile stats up once on load */
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      $$(".hero .stat b").forEach(b => {
        const end = +b.textContent; if (!end) return;
        const t0 = performance.now(), dur = 700;
        const f = now => { const k = Math.min(1, (now - t0) / dur); b.textContent = Math.round(end * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(f); };
        requestAnimationFrame(f);
      });
    }
    /* heatmap starts scrolled to today */
    const hs = $(".hm-scroll"); if (hs) hs.scrollLeft = hs.scrollWidth;
  }

  /* ---------- theme toggle: dark (default) <-> cream ---------- */
  function themeToggle() {
    const root = document.documentElement, btn = document.getElementById("theme-toggle");
    const label = () => btn.setAttribute("aria-label", root.dataset.theme === "light" ? "Switch to dark mode" : "Switch to light mode");
    label();
    btn.addEventListener("click", () => {
      const next = root.dataset.theme === "light" ? "dark" : "light";
      const apply = () => {
        if (next === "light") root.dataset.theme = "light"; else delete root.dataset.theme;
        store.set("theme", next);
        label();
        window.dispatchEvent(new Event("themechange"));
      };
      const calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !calm) document.startViewTransition(apply); else apply();
    });
  }

  /* ---------- boot ---------- */
  function notFoundPage() {
    setTimeout(() => { const b = $("#nf-search"); if (b) b.onclick = () => $("#search-btn").click(); });
    const path = decodeURIComponent(location.pathname).replace(/^\//, "") || "this page";
    return `<section class="nf">
      <p class="nf-code">404</p>
      <h1 class="page-title">This page doesn’t exist</h1>
      <p class="page-sub">There’s nothing at <code>${esc(path)}</code>. It may have moved when the site was rebuilt.</p>
      <div class="nf-actions"><button class="btn go" type="button" id="nf-search">Search the site</button><a class="btn" href="index.html">Go home</a></div>
      <div class="nf-links">${NAV.filter(n => n[2] !== "home").map(([href, label]) => `<a href="${href}">${label}</a>`).join("")}</div>
    </section>`;
  }

  /* privacy-friendly visit counts: set analytics.goatcounter in content.js (or the editor) */
  function analytics() {
    const code = ((S.analytics || {}).goatcounter || "").trim();
    if (!code || location.protocol === "file:" || /^(localhost|127\.)/.test(location.hostname)) return;
    const sc = document.createElement("script");
    sc.async = true; sc.src = "https://gc.zgo.at/count.js";
    sc.dataset.goatcounter = `https://${code.replace(/^https?:\/\//, "").replace(/\.goatcounter\.com.*$/, "")}.goatcounter.com/count`;
    document.body.appendChild(sc);
  }

  const PAGES = { notfound: notFoundPage, home, work: workPage, books: booksPage, films: filmsPage, art: artPage, music: musicPage, vault: vaultPage, about: aboutPage, socials: socialsPage };
  document.body.insertAdjacentHTML("afterbegin", header());
  const app = document.getElementById("app");
  app.innerHTML = `<div class="wrap">${groupOf(page) ? tasteNav() : ""}${(PAGES[page] || home)()}</div>`;
  document.body.insertAdjacentHTML("beforeend", footer());
  detailDialog();
  lightbox();
  themeToggle();
  searchPalette();
  chrome();
  analytics();
  setTimeout(() => watchCovers(app));
  /* link vault mentions now and in anything drawn later (tabs, filters, dialogs) */
  linkVault(app);
  if (VRE && page !== "vault") new MutationObserver(recs => recs.forEach(r => r.addedNodes.forEach(n => {
    if (n.nodeType === 1 && !n.classList.contains("vlink")) linkVault(n);
  }))).observe(document.body, { childList: true, subtree: true });
})();
