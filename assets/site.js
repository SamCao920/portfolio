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
  const STUDIO = ((S.studio || {}).items || []).map((w, i) => ({ ...w, t: w.title, artist: S.profile.name, movements: [], kind: "studio", i }));
  const POOL = { book: BOOKS, film: FILMS_ALL, watch: WATCH, art: ART, studio: STUDIO };
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
    ["writings.html", "Writing", "writings"],
    ["studio.html", "Studio", "studio"],
    ["books.html", "Books", "books"],
    ["films.html", "Films", "films"],
    ["art.html", "Art", "art"],
    ["vault.html", "Vault", "vault"],
    ["about.html", "About", "about"],
    ["socials.html", "Socials", "socials"]
  ];

  /* ---------- chrome ---------- */
  /* grouped menu items: each group is one entry in the top bar with a dropdown, and a switcher on its pages */
  const GROUPS = [
    { label: "Work", after: "home", items: [["writings.html", "Writing", "writings"], ["studio.html", "Studio", "studio"]] },
    { label: "Taste", after: "studio", items: [["books.html", "Books", "books"], ["films.html", "Films", "films"], ["art.html", "Art", "art"]] }
  ];
  const TASTE = GROUPS[1].items;
  const groupCount = k => ({ writings: S.writings.filter(w => w.type !== "appearance").length, studio: STUDIO.length,
    books: BOOKS.filter(b => b.shelf === "read").length, films: FILMS.length, art: ART.length })[k];
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
  const coverKey = it => it.kind === "book" ? `cv:b:${it.t}|${it.a}` : `cv:f:${it.t}|${it.y}`;
  /* Known image: manual override, ISBN cover, or a URL found on an earlier visit. */
  function knownCover(it) {
    const o = (S.posterOverrides || {})[it.t];
    if (o) return o;
    const nc = it.kind === "book" && it.notes && it.notes.find(n => n.cover);
    if (nc) return nc.cover;
    const c = store.get(coverKey(it));
    if (c && c !== "none") return c;
    if (it.kind === "book" && it.isbn && c !== "none") return `https://covers.openlibrary.org/b/isbn/${it.isbn}-M.jpg?default=false`;
    return null;
  }
  function poster(it, extra = "") {
    const sub = it.kind === "book" ? it.a : (it.y || "");
    const src = knownCover(it);
    const remote = !src && store.get(coverKey(it)) !== "none";
    const label = `${it.t}${it.kind === "book" ? " by " + it.a : it.y ? ` (${it.y})` : ""}`;
    return `<button class="poster${it.notes && it.notes.length ? " has-notes" : ""}" type="button" data-kind="${it.kind}" data-i="${it.i}"${remote ? " data-remote" : ""} title="${esc(label)}" aria-label="${esc(label)}"${extra}>${coverFace(it.t, sub)}${src ? `<img alt="" loading="lazy" src="${esc(src)}" onerror="window.__coverMiss(this)">` : ""}</button>`;
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
    let url = null;
    try {
      if (it.kind === "book") {
        const q = new URLSearchParams({ title: it.t, author: it.a, limit: 1, fields: "cover_i" });
        const j = await (await fetch("https://openlibrary.org/search.json?" + q)).json();
        const id = j.docs && j.docs[0] && j.docs[0].cover_i;
        if (id) url = `https://covers.openlibrary.org/b/id/${id}-M.jpg`;
      } else {
        const q = new URLSearchParams({ action: "query", generator: "search", gsrsearch: `${it.t} ${it.y || ""} film`, gsrlimit: 1,
          prop: "pageimages", piprop: "thumbnail", pithumbsize: 342, pilicense: "any", format: "json", origin: "*" });
        const j = await (await fetch("https://en.wikipedia.org/w/api.php?" + q)).json();
        const pg = j.query && Object.values(j.query.pages)[0];
        url = (pg && pg.thumbnail && pg.thumbnail.source) || null;
      }
    } catch (e) { return; }  /* offline or blocked: try again next visit */
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
  function statsRow(items) {
    return `<div class="stats">${items.map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join("")}</div>`;
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
      const sub = e.it.kind === "book" ? e.it.a : (e.it.y || "");
      return `<tr><td class="month">${cal}</td><td class="day">${d ? String(d).padStart(2, "0") : "–"}</td>
        <td class="book"><button type="button" class="linkish" data-kind="${e.it.kind}" data-i="${e.it.i}"><b>${esc(e.it.t)}</b></button><span>${esc(sub)}</span></td>
        <td>${stars(e.r)}</td><td class="icons">${heart(e.it.liked)}${e.rewatch ? '<span class="rewatch" title="Rewatch" aria-label="Rewatch">↻</span>' : ""}${e.review ? '<span class="has-review" title="Has review" aria-label="Has review">≡</span>' : ""}</td></tr>`;
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
      <div class="art-cap"><b>${esc(a.t)}</b><span>${esc(a.artist)}</span></div></li>`;
  }
  const countBy = (arr, f) => { const m = new Map(); arr.forEach(x => [].concat(f(x)).filter(Boolean).forEach(k => m.set(k, (m.get(k) || 0) + 1))); return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))); };

  /* ---------- writing ---------- */
  const TYPE_LABEL = { essay: "Essay", research: "Research", project: "Project", appearance: "Appearance" };
  function workCover(w) { return w.cover ? `<img alt="" loading="lazy" src="${esc(w.cover)}">` : coverFace(w.title, w.venue.split(/[,·]/)[0]); }
  function workPoster(w) {
    return `<li class="poster-item"><a class="poster" href="writings.html#${slug(w.title)}" title="${esc(w.title)}" aria-label="${esc(w.title)}">${workCover(w)}</a>
      <div class="poster-meta"><span class="poster-caption">${esc(w.award || TYPE_LABEL[w.type])}</span></div></li>`;
  }
  function entry(w) {
    const ext = w.link && !w.link.endsWith(".html") ? ' target="_blank" rel="noopener"' : "";
    const link = w.link ? `<a class="read-link" href="${esc(w.link)}"${ext}>${esc(w.linkText || "Open")} <span class="arr">→</span></a>` : "";
    const title = w.link ? `<a href="${esc(w.link)}"${ext}>${esc(w.title)}</a>` : esc(w.title);
    return `<li class="entry" id="${slug(w.title)}">
      <div class="entry-poster"><span class="poster" aria-hidden="true">${workCover(w)}</span></div>
      <div class="entry-text"><h3>${title}</h3>
        <div class="entry-meta"><span class="pill">${TYPE_LABEL[w.type] || esc(w.type)}</span>
          ${w.award ? `<span class="pill award">${esc(w.award)}</span>` : ""}
          ${isOngoing(w) ? '<span class="pill live"><i class="pulse"></i>Happening now</span>' : isUpcoming(w) && w.type === "appearance" ? '<span class="pill wip">Upcoming</span>' : ""}
          <span>${esc(w.venue)}</span></div>
        ${w.result ? `<div class="entry-result">${esc(w.result)}</div>` : ""}
        <p class="claim">${w.claim}</p>
        ${w.body ? `<details><summary>More</summary><p>${w.body}</p></details>` : ""}
        ${link}</div></li>`;
  }

  /* ---------- activity heatmap: books finished, films logged, art logged ---------- */
  function heatmap() {
    const counts = new Map();
    const add = (d, k) => { if (!d || !String(d).startsWith(String(thisYear))) return; const e = counts.get(d) || { b: 0, f: 0, a: 0 }; e[k]++; counts.set(d, e); };
    BOOKS.forEach(b => b.shelf === "read" && add(b.read, "b"));
    filmDiary.forEach(d => add(d.date, "f"));
    ART.forEach(a => add(a.seen || a.logged, "a"));
    const first = new Date(thisYear, 0, 1), last = new Date(thisYear, 11, 31);
    const d = new Date(first); d.setDate(d.getDate() - d.getDay());
    const cells = [], months = []; let col = 0, total = 0;
    while (d <= last) {
      for (let r = 0; r < 7; r++, d.setDate(d.getDate() + 1)) {
        const iso = isoOf(d), inYear = d.getFullYear() === thisYear, future = iso > TODAY;
        if (inYear && d.getDate() === 1) months.push([d.getMonth(), col]);
        const e = counts.get(iso), n = e ? e.b + e.f + e.a : 0; total += n;
        const lvl = !inYear ? "x" : future ? "f" : n === 0 ? 0 : n === 1 ? 1 : n === 2 ? 2 : n < 5 ? 3 : 4;
        const tip = !inYear ? "" : `${MONTHS[d.getMonth()]} ${d.getDate()}: ` + (n ? [e.b && plural(e.b, "book"), e.f && plural(e.f, "film"), e.a && plural(e.a, "artwork")].filter(Boolean).join(", ") : "nothing logged");
        cells.push(`<i class="hm-c l${lvl}"${tip ? ` data-tip="${tip}"` : ""}></i>`);
      }
      col++;
    }
    const sum = k => [...counts.values()].reduce((s, e) => s + e[k], 0);
    return `<section class="section activity">${sectionHead(`${thisYear} in books, films and art`)}
      <div class="hm-scroll"><div class="hm" style="--cols:${col}">
        <div class="hm-months">${months.map(([m, c]) => `<span style="--c:${c}">${MONTHS[m]}</span>`).join("")}</div>
        <div class="hm-grid">${cells.join("")}</div></div></div>
      <div class="hm-foot"><span>${plural(sum("b"), "book")} · ${plural(sum("f"), "film")} · ${plural(sum("a"), "artwork")} logged this year</span>
        <span class="hm-legend">Less <i class="hm-c l0"></i><i class="hm-c l1"></i><i class="hm-c l2"></i><i class="hm-c l3"></i><i class="hm-c l4"></i> More</span></div></section>`;
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
    /* loose title match: "Moby Dick" finds "Moby-Dick or, The Whale" */
    const loose = t => String(t).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
    const findBook = q => { const n = loose(q); return BOOKS.find(b => loose(b.t) === n) || BOOKS.find(b => loose(b.t).startsWith(n) || loose(b.full || "").startsWith(n)); };
    const homeBooks = (S.homeBooks && S.homeBooks.length ? S.homeBooks.map(findBook).filter(Boolean) : bookFavs()).slice(0, 4);
    const favFilms = FD.favorites.map(i => FILMS_ALL[i]).filter(shown);
    const upcoming = S.writings.filter(w => w.type === "appearance" && isUpcoming(w)).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const now = upcoming.find(isOngoing), next = upcoming.find(w => !isOngoing(w));
    const status = now ? `<span class="status live"><i class="pulse"></i>Now: ${esc(now.title)}${now.place ? ", " + esc(now.place) : ""}</span>`
      : next ? `<span class="status"><i class="dot"></i>Next: ${esc(next.title)}${next.place ? ", " + esc(next.place) : ""} · ${esc(fmtDate(next.start).replace(/, \d{4}$/, ""))}</span>`
      : `<span class="status"><i class="dot"></i>${esc(p.location)}</span>`;
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
      ${heatmap()}
      <div class="cols">
        <div>
          <section class="section">${sectionHead("Favorite books", "books.html#favorites", "All favorites")}
            <ul class="posters four">${homeBooks.map(b => posterItem(b)).join("")}</ul></section>
          <section class="section">${sectionHead("Favorite films", "films.html", "All films")}
            <ul class="posters four">${favFilms.map(f => posterItem(f)).join("")}</ul></section>
          ${ART.length ? `<section class="section">${sectionHead("Recently seen art", "art.html", "All art")}
            <ul class="art-grid five">${ART.slice(0, 5).map(artTile).join("")}</ul></section>` : ""}
        </div>
        <aside>
          ${upcoming.length ? `<section class="side-block">${sectionHead("Upcoming")}<ul class="upcoming">${upcoming.map(w =>
            `<li><a href="writings.html#${slug(w.title)}">${esc(w.title)}</a><span>${esc(w.venue)}</span></li>`).join("")}</ul></section>` : ""}
          <section class="side-block">${sectionHead("Now")}<ul>${p.now.map(n => `<li>${esc(n)}</li>`).join("")}</ul></section>
          <section class="side-block">${sectionHead("Reading")}
            <ul class="posters two">${booksReading().map(b => posterItem(b, { caption: "Since " + fmtDate(b.added) })).join("") || '<li class="empty">Nothing right now.</li>'}</ul></section>
          ${filmDiary.length ? `<section class="side-block">${sectionHead("Watched", "films.html#diary", "Diary")}${diaryMini(filmDiary, 2)}</section>` : ""}
        </aside>
      </div>`;
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

  function writingsPage() {
    const types = ["all", ...new Set(S.writings.map(w => w.type))];
    const html = `
      <h1 class="page-title">Writing &amp; projects</h1>
      <p class="page-sub">Essays, research, projects and appearances.</p>
      <div class="filterbar"><div class="group" role="group" aria-label="Filter by type">
        ${types.map(t => `<button class="chip" type="button" data-type="${t}" aria-pressed="${t === "all"}">${t === "all" ? "All" : (TYPE_LABEL[t] || t) + (t === "research" ? "" : "s")}</button>`).join("")}
      </div><div class="group"><span id="w-count"></span></div></div>
      <ul class="entries" id="w-list"></ul>`;
    setTimeout(() => {
      let type = "all";
      const draw = () => {
        const list = S.writings.filter(w => type === "all" || w.type === type);
        $("#w-list").innerHTML = list.map(entry).join("") || '<li class="empty">Nothing here yet.</li>';
        linkVault($("#w-list"));
        $("#w-count").textContent = plural(list.length, "entry").replace("entrys", "entries");
      };
      $$(".chip[data-type]").forEach(btn => btn.addEventListener("click", () => {
        type = btn.dataset.type;
        $$(".chip[data-type]").forEach(b => b.setAttribute("aria-pressed", b === btn));
        draw();
      }));
      draw();
      if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) { t.scrollIntoView(); t.classList.add("flash"); } }
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
      <div class="page-head"><div><h1 class="page-title">Films</h1><p class="page-sub">${esc(FD.bio || "")}</p></div>
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
            <label class="select" for="a-sort">Sort <select id="a-sort"><option value="logged">Recently logged</option><option value="artist">Artist</option><option value="title">Title</option></select></label>
          </div><span class="count" id="a-count"></span></div>
          <ul class="art-grid" id="a-grid"></ul><div class="more-wrap" id="a-more"></div></section>
          ${noted.length ? `<section class="section">${sectionHead("Notes")}<ul class="entries">${noted.map(a => `<li class="entry art-note">
            <div class="entry-poster"><button class="art-tile" type="button" data-kind="art" data-i="${a.i}" aria-label="${esc(a.t)}">${coverFace(a.t, a.artist)}${a.img ? `<img alt="" loading="lazy" src="${esc(a.img)}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</button></div>
            <div class="entry-text"><h3><button type="button" class="linkish" data-kind="art" data-i="${a.i}">${esc(a.t)}</button></h3>
              <div class="entry-meta"><span>${esc(a.artist)}</span>${a.medium ? `<span class="pill">${esc(a.medium)}</span>` : ""}</div>
              ${a.note.split("\n").map(p => `<p>${esc(p)}</p>`).join("")}</div></li>`).join("")}</ul></section>` : ""}
        </div>
        <aside>
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

  function studioTile(w) {
    return `<li class="art-item"><button class="art-tile" type="button" data-kind="studio" data-i="${w.i}" aria-label="${esc(w.t)}, ${esc(w.year)}"><img alt="" loading="lazy" src="${esc(w.img)}"></button>
      <div class="art-cap"><b>${esc(w.t)}</b><span>${esc(w.year)} · ${esc(w.kind === "studio" ? w.medium.split(" on ")[0] : "")}</span></div></li>`;
  }
  function studioPage() {
    const kinds = [...new Set(STUDIO.map(w => w.kind === "studio" ? (S.studio.items[w.i].kind) : ""))].filter(Boolean);
    const html = `
      <div class="page-head"><div><h1 class="page-title">Studio</h1><p class="page-sub">${esc((S.studio || {}).intro || "")}</p></div>
        ${statsRow([[STUDIO.length, "Works"], ...kinds.map(k => [STUDIO.filter(w => S.studio.items[w.i].kind === k).length, k === "Photography" ? "Photos" : k + "s"])])}</div>
      <div class="filterbar"><div class="group" role="group" aria-label="Filter by medium">
        ${["All", ...kinds].map(k => `<button class="chip" type="button" data-medium="${k}" aria-pressed="${k === "All"}">${k}</button>`).join("")}
      </div><span class="count" id="s-count"></span></div>
      <div class="studio" id="s-grid"></div>`;
    setTimeout(() => {
      const draw = k => {
        const list = STUDIO.filter(w => k === "All" || S.studio.items[w.i].kind === k);
        $("#s-count").textContent = plural(list.length, "work");
        $("#s-grid").innerHTML = list.map(w => `<figure class="studio-item"><button class="studio-img" type="button" data-kind="studio" data-i="${w.i}" aria-label="${esc(w.t)}">
            <img alt="${esc(w.t)}" loading="lazy" src="${esc(w.img)}"></button>
          <figcaption><b>${esc(w.t)}</b><span>${esc(w.year)} · ${esc(w.medium)}</span></figcaption></figure>`).join("");
      };
      $$(".chip[data-medium]").forEach(b => b.addEventListener("click", () => {
        $$(".chip[data-medium]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(b.dataset.medium);
      }));
      draw("All");
    });
    return html;
  }

  function vaultPage() {
    return `
      <h1 class="page-title">The Vault</h1>
      <p class="page-sub">A live map of my reading notes. Every idea I have written down, and the links between them: the same graph I read and write in. Hover a node to trace what connects to what, drag one to disturb its neighbourhood, scroll to zoom, double-click to reset.</p>
      <div id="graph-wrap">
        <canvas id="graph" aria-label="Interactive map of my notes"></canvas>
        <div class="graph-tip" id="graph-tip" aria-hidden="true"></div>
        <div class="graph-legend" id="graph-legend"></div>
        ${new URLSearchParams(location.search).get("note") ? `<div class="graph-focus"><span>Showing</span><b>${esc(new URLSearchParams(location.search).get("note"))}</b><a href="vault.html">Show everything</a></div>` : ""}
      </div>
      ${vaultStamp()}`;
  }

  function aboutPage() {
    return `
      <div class="cols">
        <div>
          <h1 class="page-title">About</h1>
          <div class="prose" style="margin-top:20px">${S.about.map(p => `<p>${p}</p>`).join("")}</div>
          <section class="section">${sectionHead("Selected record")}
            <ul class="timeline">${S.record.map(([y, t]) => `<li><span class="yr">${esc(y)}</span><span>${esc(t)}</span></li>`).join("")}</ul></section>
        </div>
        <aside>
          ${(S.profile.aboutPhoto || S.profile.avatar) ? `<div class="about-portrait"><img src="${esc(S.profile.aboutPhoto || S.profile.avatar)}" alt="${esc(S.profile.name)}"></div>` : ""}
          <section class="side-block">${sectionHead("Details")}
            <dl class="facts">${S.facts.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></section>
          <section class="side-block">${sectionHead("Interests")}
            <div class="tags">${S.interests.map(t => `<span class="tag">${esc(t)}</span>`).join("")}</div></section>
        </aside>
      </div>`;
  }

  function socialsPage() {
    const rows = S.socials.filter(s => s.url).map(s => {
      const i = S.socials.indexOf(s);
      const action = s.copy ? `<button class="btn" type="button" data-copy="${i}">Copy</button>`
        : `<a class="btn go" href="${esc(s.url)}" target="_blank" rel="noopener">Visit</a>`;
      const name = s.copy ? esc(s.handle) : `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.handle)}</a>`;
      return `<li class="social"><span class="social-icon">${esc(s.name[0])}</span>
        <div class="social-body"><b>${esc(s.name)}</b><span>${name}</span></div>${action}</li>`;
    }).join("");
    setTimeout(() => $$("[data-copy]").forEach(btn => btn.addEventListener("click", () => {
      const text = S.socials[btn.dataset.copy].copy;
      const done = () => { btn.textContent = "Copied"; btn.classList.add("ok"); toast("Email copied to clipboard"); setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("ok"); }, 1600); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => { btn.textContent = text; });
      else btn.textContent = text;
    })));
    return `<h1 class="page-title">Socials</h1>
      <p class="page-sub">I’m always happy to connect, whether about research, writing, or anything in between. Email is best.</p>
      <ul class="social-list" style="margin-top:22px">${rows}</ul>`;
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
            ${it.note ? it.note.split("\n").map(p => `<p class="review">${esc(p)}</p>`).join("") : ""}
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
        body = it.review ? esc(it.review) : "";
      } else {
        sub = String(it.y || "");
        const logs = it.kind === "film" ? filmDiary.filter(d => d.f === it.i) : [];
        if (logs.length) meta.push("Watched " + logs.map(d => fmtDate(d.date) + (d.rewatch ? " (rewatch)" : "")).join(", "));
        else if (it.kind === "watch") meta.push("On my watchlist");
        body = logs.filter(d => d.review).map(d => esc(d.review)).join("<br>");
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
          ${body ? `<p class="review">${body}</p>` : ""}${link}${notesHtml}</div></div>`;
      dlg.classList.toggle("wide", !!notesHtml);
      linkVault(dlg);
      $(".dlg-close", dlg).onclick = () => dlg.close();
      make3d($(".dlg .poster", dlg), it.kind === "book" ? "book" : "film", it.kind === "book" ? Math.round(Math.min(34, Math.max(10, (it.pages || 300) / 22))) : 4);
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
      ...S.writings.map(w => ({ type: TYPE_LABEL[w.type] || "Writing", t: w.title, sub: w.venue, href: "writings.html#" + slug(w.title) })),
      ...BOOKS.filter(b => b.shelf !== "to-read").map(b => ({ type: "Book", t: b.t, sub: b.a, it: b, href: "books.html" })),
      ...FILMS.map(f => ({ type: "Film", t: f.t, sub: String(f.y || ""), it: f, href: "films.html" })),
      ...ART.map(a => ({ type: "Art", t: a.t, sub: a.artist, it: a, href: "art.html" })),
      ...STUDIO.map(w => ({ type: "Studio", t: w.t, sub: `${w.year} · my work`, it: w, href: "studio.html" }))
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

  const PAGES = { notfound: notFoundPage, home, writings: writingsPage, books: booksPage, films: filmsPage, art: artPage, studio: studioPage, vault: vaultPage, about: aboutPage, socials: socialsPage };
  document.body.insertAdjacentHTML("afterbegin", header());
  const app = document.getElementById("app");
  app.innerHTML = `<div class="wrap">${groupOf(page) ? tasteNav() : ""}${(PAGES[page] || home)()}</div>`;
  document.body.insertAdjacentHTML("beforeend", footer());
  detailDialog();
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
