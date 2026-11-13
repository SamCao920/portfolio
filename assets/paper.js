/* paper.js: the home page. Four solutions of y' + y = sin x run down the page as strings; each opens a section,
   filled from the same data files the editor (admin.html) writes: content.js, books.js, films.js, art.js, notes.js, quotes.js. */
(function () {
  const S = window.SITE || {}, P = S.profile || {};
  const $ = (q, el = document) => el.querySelector(q), $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const slug = t => t.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
  const minus = v => String(v).replace("-", "−");
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const parse = d => { const [y, m, dd] = String(d || "").split("-").map(Number); return { y, m: (m || 1) - 1, d: dd }; };
  const fmtDate = d => { if (!d) return ""; const p = parse(d); return p.d ? `${MONTHS[p.m]} ${p.d}, ${p.y}` : `${MONTHS[p.m]} ${p.y}`; };
  const pad = n => String(n).padStart(2, "0");
  const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const TODAY = isoOf(new Date());
  /* text from the editor: simple HTML is allowed, plus *italic*, [text](url) and blank-line paragraphs */
  const inline = t => String(t || "").replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>').replace(/\*([^*\n]+)\*/g, "<i>$1</i>")
    .replace(/href="(?:writings|work|projects|appearances|studio)\.html(?:#[\w-]*)?"/g, 'href="#work"').replace(/href="(?:books|films|art|music)\.html(?:#[\w-]*)?"/g, 'href="#taste"').replace(/href="(?:about|socials)\.html"/g, 'href="#about"');
  const paras = t => String(t || "").split(/\n\s*\n/).filter(x => x.trim()).map(x => `<p>${inline(x.replace(/^#+\s*(.+)$/gm, "<b>$1.</b>")).replace(/\n/g, "<br>")}</p>`).join("");
  const ext = u => /^https?:/.test(u || "") ? ' target="_blank" rel="noopener"' : "";
  const rating = r => r == null ? "" : `<b>${Math.floor(r) || ""}${r % 1 ? "½" : ""}</b>`;
  const vaultLink = t => "vault.html?note=" + encodeURIComponent(t);
  const qed = '<span class="qed" role="img" aria-label="end of proof"></span>';

  /* ---------- data ---------- */
  const W_ALL = S.writings || [];
  const PAPERS = W_ALL.filter(w => w.type !== "appearance" && w.type !== "project");
  const PROJECTS = W_ALL.filter(w => w.type === "project");
  const when = w => String(w.start || w.end || "");
  const isUpcoming = w => (w.end || w.start) ? (w.end || w.start) >= TODAY : !!w.upcoming;
  const APPEAR = W_ALL.filter(w => w.type === "appearance").sort((a, b) => when(b).localeCompare(when(a)));
  const HUNT = window.HUNT || { photos: [], html: () => "", tally: () => "", done: () => false, count: () => 0, on: () => {} };
  const pin = k => HUNT.html(k) ? `<span class="pin">${HUNT.html(k)}</span>` : "";   /* a hidden print, out in the margin of a section */
  const STUDIO = ((S.studio || {}).items || []).filter(w => w.kind !== "Photography");   /* photographs are hidden around the site instead: assets/hunt.js */
  const thumbOf = src => /^assets\/studio\/[^/]+\.(jpe?g|png|webp)$/i.test(src || "") ? src.replace(/^assets\/studio\/([^/]+)\.\w+$/, "assets/studio/thumbs/$1.webp") : src;
  const NOTES = window.NOTES || {};
  const BOOKS = ((window.BOOKS || {}).items || []).map((b, i) => ({ ...b, i, notes: (NOTES.books || []).filter(n => n.book === `${b.t}|${b.a}`) }));
  const FD = window.FILMS || { items: [], diary: [], lists: [], watchlist: [], favorites: [] };
  const HIDDEN = new Set((S.hiddenFilms || []).map(s => s.normalize("NFKC")));
  const FILMS = FD.items.map((f, i) => ({ ...f, i, notes: (NOTES.films || []).filter(n => n.film === `${f.t}|${f.y}`) }));
  const shown = f => f && !HIDDEN.has(`${f.t} (${f.y})`.normalize("NFKC"));
  const ART = (window.ART || {}).items || [];
  const byDesc = k => (a, b) => String(b[k] || "").localeCompare(String(a[k] || ""));
  const SETS = {};      /* picture sets for the full-size viewer, by name */

  /* ---------- sections ---------- */
  const ref = (w, n) => {
    const link = w.link ? `<a class="go" href="${esc(w.link)}"${/\.html$/.test(w.link) ? "" : ' target="_blank" rel="noopener"'}>${esc(w.linkText || "Open")} →</a>` : "";
    const g = (w.gallery || []).map(x => typeof x === "string" ? { src: x } : x).filter(x => x && x.src);
    const key = "g-" + slug(w.title); SETS[key] = g.filter(x => !/youtu\.?be|vimeo/.test(x.src)).map(x => ({ src: x.src, cap: esc(x.cap || w.title), video: /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(x.src) }));
    let k = 0;
    const thumbs = g.length ? `<ul class="thumbs">${g.map(x => {
      const yt = x.src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
      if (yt) return `<li><a class="play" style="position:relative;display:block" href="${esc(x.src)}" target="_blank" rel="noopener" aria-label="Video on YouTube"><img alt="" loading="lazy" src="https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg"></a></li>`;
      if (/vimeo/.test(x.src)) return `<li><a href="${esc(x.src)}" target="_blank" rel="noopener">video</a></li>`;
      const n = k++, vid = SETS[key][n].video;
      return `<li><button type="button" class="${vid ? "play" : ""}" data-set="${key}" data-n="${n}" aria-label="${esc(x.cap || (vid ? "Video" : "Photo") + " " + (n + 1))}">${vid ? `<video src="${esc(x.src)}#t=0.5" preload="metadata" muted playsinline tabindex="-1"></video>` : `<img alt="" loading="lazy" src="${esc(x.src)}">`}</button></li>`;
    }).join("")}</ul>` : "";
    const live = w.type === "appearance" && isUpcoming(w) ? ' <span class="pill">upcoming</span>' : "";
    return `<li data-n="${n}" id="${slug(w.title)}"><div>
      <span class="cite"><i>${w.link ? `<a href="${esc(w.link)}"${/\.html$/.test(w.link) ? "" : ' target="_blank" rel="noopener"'}>${esc(w.title)}${/[.?!]$/.test(w.title) ? "" : "."}</a>` : esc(w.title) + (/[.?!]$/.test(w.title) ? "" : ".")}</i> ${esc(w.venue || "")}${w.venue && !/[.?!]$/.test(w.venue) ? "." : ""}${w.award ? ` ${esc(w.award)}.` : ""}${w.result ? ` ${inline(w.result)}.` : ""}${live}</span>
      ${w.claim ? `<span class="claim">${inline(w.claim)}</span>` : ""}
      ${w.body ? `<details class="more"><summary>Proof</summary><div class="proof">${paras(w.body)}</div></details>` : ""}
      ${link}${thumbs}</div></li>`;
  };
  function work() {
    let n = 0;
    SETS.studio = STUDIO.map(w => ({ src: w.img, cap: `<i>${esc(w.title)}</i>, ${esc(w.year)}<small>${esc(w.medium || "")}</small>` }));
    return `<p class="q"><b>Problem 1.</b> Show your work.</p>
      <h3><b>(a)</b> Papers <small>essays written for prize competitions, and independent research</small></h3>
      <ol class="refs">${PAPERS.map(w => ref(w, ++n)).join("")}</ol>
      ${PROJECTS.length ? `<h3><b>(b)</b> Projects <small>things I’ve built</small></h3>${pin(6)}<ol class="refs">${PROJECTS.map(w => ref(w, ++n)).join("")}</ol>` : ""}
      ${STUDIO.length ? `<h3><b>(c)</b> Drawings and paintings</h3>
        <div class="figs">${STUDIO.map((w, k) => `<figure><button type="button" data-set="studio" data-n="${k}" aria-label="${esc(w.title)}"><img alt="" loading="lazy" src="${esc(thumbOf(w.img))}" data-full="${esc(w.img)}" onerror="this.onerror=null;this.src=this.dataset.full"></button>
          <figcaption><b>Fig. ${k + 1}.</b> <i>${esc(w.title)}</i>, ${esc(w.year)}. ${esc((w.medium || "").replace(/\.$/, ""))}.</figcaption></figure>`).join("")}</div>` : ""}
      ${APPEAR.length ? `<h3><b>(d)</b> Appearances <small>conferences, talks and events</small></h3><ol class="refs">${APPEAR.map(w => ref(w, ++n)).join("")}</ol>` : ""}`;
  }

  const VI = () => (window.VAULT_INDEX || {}).notes || [];
  const pick = (arr, k) => { const a = arr.slice(), out = []; while (a.length && out.length < k) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]); return out; };
  const lemmas = () => pick(VI().filter(n => n[1] === "Notes" && n[2] >= 2), 3).map((n, k) => `<p><b>Lemma ${k + 1}.</b> <i><a href="${vaultLink(n[0])}">${esc(n[0])}.</a></i></p>`).join("");
  const quote = () => { const Q = (window.QUOTES || {}).items || []; if (!Q.length) return ""; const q = Q[Math.floor(Math.random() * Q.length)];
    return `<blockquote class="epi">${esc(q.q).replace(/\n/g, "<br>")}<footer>${q.by}</footer></blockquote>`; };
  function notes() {
    const all = VI(), claims = all.filter(n => n[1] === "Notes").length;
    const recent = all.filter(n => n[3] && n[3] <= TODAY).sort((a, b) => b[3].localeCompare(a[3])).slice(0, 6);
    const src = [...(NOTES.books || []), ...(NOTES.films || [])].filter(n => (n.ideas || []).length).sort((a, b) => b.ideas.length - a.ideas.length);
    return `<p class="q"><b>Problem 2.</b> Take notes.</p>
      <p><i>Solution.</i> ${all.length ? `${all.length} of them so far, ${claims} of which are single claims, each linked to the others it depends on.` : "Every idea I write down while reading, each linked to the others it depends on."} Three, stated without proof:</p>
      <div id="lemmas">${lemmas()}</div>
      <p>The proofs are in <a href="vault.html">the vault</a>, drawn as a map you can drag around. <button type="button" class="linkish" data-act="lemmas">Three more.</button></p>
      ${recent.length ? `<h3><b>(a)</b> Most recent</h3><ul class="rows">${recent.map(n => `<li><div class="row"><a class="t" href="${vaultLink(n[0])}">${esc(n[0])}</a><span class="r">${esc(fmtDate(n[3]).replace(/, \d{4}$/, ""))}</span></div></li>`).join("")}</ul>` : ""}
      ${pin(7)}${src.length ? `<h3><b>(b)</b> Sources <small>books and films I have taken notes on</small></h3><ul class="rows">${src.map(n => `<li><div class="row"><span><a class="t" href="${vaultLink(n.note)}"><i>${esc(n.title)}</i></a>${n.author ? `<span class="by">, ${esc(String(n.author).trim())}</span>` : ""}</span><span class="r">${plural(n.ideas.length, "idea")}</span></div></li>`).join("")}</ul>` : ""}
      ${(window.QUOTES || {}).items ? `<h3><b>(c)</b> Copied out</h3><div id="quote">${quote()}</div><p style="margin-top:8px"><button type="button" class="linkish" data-act="quote">Another.</button></p>` : ""}`;
  }

  const bookRow = b => `<li><button type="button" class="row" data-k="book" data-i="${b.i}"><span><span class="t"><i>${esc(b.t)}</i></span><span class="by">, ${esc(b.a || "")}</span></span><span class="r">${rating(b.r)}${b.fav ? " †" : ""}</span></button></li>`;
  const filmRow = (f, r) => `<li><button type="button" class="row" data-k="film" data-i="${f.i}"><span><span class="t"><i>${esc(f.t)}</i></span><span class="by"> (${esc(f.y || "")})</span></span><span class="r">${rating(r === undefined ? f.r : r)}${f.liked ? " †" : ""}</span></button></li>`;
  function taste() {
    const reading = BOOKS.filter(b => b.shelf === "reading");
    const read = BOOKS.filter(b => b.shelf === "read").sort((a, b) => String(b.read || "0" + b.added).localeCompare(String(a.read || "0" + a.added)));
    const favs = BOOKS.filter(b => b.fav).sort(byDesc("read"));
    const toRead = BOOKS.filter(b => b.shelf === "to-read").sort(byDesc("added"));
    const dnf = S.showDidNotFinish ? BOOKS.filter(b => b.shelf === "dnf") : [];
    const years = [...new Set(read.map(b => b.read ? parse(b.read).y : 0))];
    const films = FILMS.filter(shown), favF = (FD.favorites || []).map(i => FILMS[i]).filter(shown);
    const last = {}; FD.diary.forEach(d => { if (!last[d.f] || d.date > last[d.f]) last[d.f] = d.date; });
    const byRecent = films.slice().sort((a, b) => String(last[b.i] || b.added || "").localeCompare(String(last[a.i] || a.added || "")));
    const watch = (FD.watchlist || []);
    const artists = [...new Set(ART.map(a => a.artist))];
    SETS.art = ART.map(a => ({ src: a.img, remote: true, cap: `<i>${esc(a.t)}</i>, ${esc(a.artist)}${a.year ? ", " + esc(a.year) : ""}<small>${esc([a.museum, a.city].filter(Boolean).join(", "))}</small>${a.note ? paras(a.note) : ""}` }));
    const M = S.music || {}, lists = (M.lists || []).filter(l => l && l.name && (l.items || []).some(x => x.t)), play = (M.play || []).filter(p => p && p.t);
    let part = 0; const tag = () => `<b>(${"abcdefgh"[part++]})</b>`;
    return `<p class="q"><b>Problem 3.</b> <i>De gustibus non est disputandum.</i> Dispute anyway.</p>
      <p class="foot">Ratings are out of five. A dagger (†) marks a favorite. Click a row for the review.</p>
      <h3>${tag()} Books <small>${read.length} read</small></h3>
      ${reading.length ? `<h4>Reading now</h4><ul class="rows">${reading.map(bookRow).join("")}</ul>` : ""}
      ${favs.length ? `<h4>Favorites</h4><ul class="rows">${favs.map(bookRow).join("")}</ul>` : ""}
      <details><summary>All ${read.length} read, most recent first</summary>${years.map(y => `<p class="year">${y || "Earlier"}</p><ul class="rows">${read.filter(b => (b.read ? parse(b.read).y : 0) === y).map(bookRow).join("")}</ul>`).join("")}</details>
      ${toRead.length ? `<details><summary>${toRead.length} I want to read</summary><ul class="rows" style="margin-top:8px">${toRead.map(bookRow).join("")}</ul></details>` : ""}
      ${dnf.length ? `<details><summary>${dnf.length} I did not finish</summary><ul class="rows" style="margin-top:8px">${dnf.map(bookRow).join("")}</ul></details>` : ""}
      <h3>${tag()} Films <small>${films.length} seen</small></h3>
      ${pin(8)}${(FD.bio || "").trim() ? `<p>${esc(FD.bio)}</p>` : ""}
      ${favF.length ? `<h4>Favorites</h4><ul class="rows">${favF.map(f => filmRow(f)).join("")}</ul>` : ""}
      ${(FD.lists || []).map(l => `<details><summary>${esc(l.name)}</summary>${l.desc ? `<p>${esc(l.desc)}</p>` : ""}<ol class="rank">${(l.items || []).map(x => `<li><i>${esc(x.t)}</i>${x.y ? ` (${esc(x.y)})` : ""}</li>`).join("")}</ol></details>`).join("")}
      <details><summary>All ${films.length} seen, most recent first</summary><ul class="rows" style="margin-top:8px">${byRecent.map(f => filmRow(f)).join("")}</ul></details>
      ${watch.length ? `<details><summary>${watch.length} I want to see</summary><p class="run" style="margin-top:8px">${watch.map(f => `<i>${esc(f.t)}</i>${f.y ? ` (${f.y})` : ""}`).join('<i class="sep"> · </i>')}</p></details>` : ""}
      ${ART.length ? `<h3>${tag()} Paintings <small>${ART.length} works by ${plural(artists.length, "artist")}, seen in person or studied</small></h3>
        ${(S.artists || []).length ? `<p><i>Favorite painters.</i> ${(S.artists || []).map(a => esc(a.name)).join(", ")}.</p>` : ""}
        <h4>Most recent</h4><ul class="plates">${ART.slice(0, 6).map((a, k) => `<li><button type="button" data-set="art" data-n="${k}" aria-label="${esc(a.t)} by ${esc(a.artist)}"><img alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc(a.img || "")}" onerror="this.style.visibility='hidden'"></button><span class="cap"><i>${esc(a.t)}</i>, ${esc(a.artist)}</span></li>`).join("")}</ul>
        <details><summary>All ${ART.length}, by artist</summary>${artists.sort((a, b) => a.localeCompare(b)).map(name => `<p class="year">${esc(name)}</p><ul class="rows">${ART.map((a, k) => [a, k]).filter(([a]) => a.artist === name).map(([a, k]) =>
          `<li><button type="button" class="row" data-set="art" data-n="${k}"><span class="t"><i>${esc(a.t)}</i></span><span class="r">${esc(a.year || "")}</span></button></li>`).join("")}</ul>`).join("")}</details>` : ""}
      <h3>${tag()} Music</h3>
      ${(M.top || []).length ? `<p><i>Favorites.</i> ${M.top.map(esc).join(", ")}.</p>` : ""}
      ${play.length ? `<h4>At the violin</h4><ul class="rows">${play.map(p => `<li><div class="row"><span><span class="t"><i>${esc(p.t)}</i></span>${p.a ? `<span class="by">, ${esc(p.a)}</span>` : ""}</span><span class="r">${p.status === "now" ? "playing now" : p.status === "learn" ? "want to learn" : "played"}</span></div></li>`).join("")}</ul>` : ""}
      ${lists.map(l => `<details><summary>${esc(l.name)}</summary><ol class="rank">${l.items.filter(x => x.t).map(x => `<li><i>${esc(x.t)}</i>${x.a ? `, ${esc(x.a)}` : ""}</li>`).join("")}</ol></details>`).join("")}
      <figure class="fig"><img alt="A girl on a clifftop blown along by a gust of wind, her umbrella turned inside out." loading="lazy" src="assets/website/gust-full.png">
        <figcaption><b>Figure 1.</b> “De Gustibus non est disputandum.” Thomas Hood, <i>Whims and Oddities</i>, 1826. There is no arguing with a gust.</figcaption></figure>`;
  }
  function detail(kind, i) {
    if (kind === "book") { const b = BOOKS[i];
      const cover = b.cover || (b.isbn ? `https://covers.openlibrary.org/b/isbn/${b.isbn}-M.jpg?default=false` : "");
      const meta = [b.full && b.full !== b.t ? esc(b.full) : "", b.read ? "Read " + fmtDate(b.read) : b.shelf === "reading" ? "Reading since " + fmtDate(b.added) : b.shelf === "to-read" ? "Added " + fmtDate(b.added) : "", b.pages ? b.pages + " pages" : "", b.year ? "first published " + esc(b.year) : ""].filter(Boolean).join(" · ");
      return `<div class="detail${cover ? "" : " nocover"}">${cover ? `<img alt="" loading="lazy" src="${esc(cover)}" onerror="this.parentNode.classList.add('nocover');this.remove()">` : ""}<div>
        <p class="meta">${meta}</p>${b.review ? paras(b.review) : ""}
        ${b.notes.map(n => `<p><a href="${vaultLink(n.note)}">${(n.ideas || []).length ? plural(n.ideas.length, "idea") + " from it" : "My notes on it"} in the vault →</a></p>`).join("")}</div></div>`; }
    const f = FILMS[i], logs = FD.diary.filter(d => d.f === i).sort(byDesc("date"));
    return `<div class="detail${f.cover ? "" : " nocover"}">${f.cover ? `<img alt="" loading="lazy" src="${esc(f.cover)}" onerror="this.parentNode.classList.add('nocover');this.remove()">` : ""}<div>
      ${logs.length ? logs.map(d => `<p class="meta">${d.rewatch ? "Rewatched" : "Watched"} ${fmtDate(d.date)}${d.r != null ? " · " + rating(d.r).replace(/<\/?b>/g, "") + " of 5" : ""}</p>${d.review ? paras(d.review) : ""}`).join("") : `<p class="meta">${f.added ? "Logged " + fmtDate(f.added) : ""}</p>`}
      ${f.notes.map(n => `<p><a href="${vaultLink(n.note)}">${(n.ideas || []).length ? plural(n.ideas.length, "idea") + " from it" : "My notes on it"} in the vault →</a></p>`).join("")}</div></div>`;
  }
  function about() {
    const photo = P.aboutPhoto || P.avatar;
    return `<p class="q"><b>Problem 4.</b> Who is this?</p>
      ${photo ? `<img class="portrait" alt="${esc(P.name || "")}" src="${esc(encodeURI(photo))}">` : ""}
      ${(S.about || []).map((p, k) => `<p>${k ? "" : "<i>Solution.</i> "}${inline(p)}</p>`).join("")}
      ${(S.record || []).length ? `<h3><b>(a)</b> Record</h3>${pin(9)}<table class="cv">${S.record.map(([y, t]) => `<tr><td>${esc(y)}</td><td>${esc(t)}</td></tr>`).join("")}</table>` : ""}
      <h3><b>(b)</b> Contact <small>left as an exercise for the reader</small></h3>
      <table class="cv">${(S.socials || []).filter(s => s.url).map(s => `<tr><td>${esc(s.name)}</td><td>${/^mailto:/.test(s.url) ? esc(s.handle) : `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.handle || s.name)}</a>`}</td></tr>`).join("")}</table>
      <p style="text-align:right;max-width:none;margin-top:14px">${qed}</p>`;
  }

  function extra() {
    SETS.photos = HUNT.photos.map(w => ({ src: w.img, cap: `<i>${esc(w.title)}</i>, ${esc(w.year)}<small>${esc(w.medium || "")}</small>` }));
    return `<p class="q"><b>Problem 5</b> (extra credit). Find every photograph hidden on this site.</p>
      <p><i>Solution.</i> You did. Here they are at full size. <span class="grade" aria-hidden="true">${HUNT.photos.length}/${HUNT.photos.length}</span></p>
      <div class="figs">${HUNT.photos.map((w, k) => `<figure><button type="button" data-set="photos" data-n="${k}" aria-label="${esc(w.title)}"><img alt="" loading="lazy" src="${esc(thumbOf(w.img))}" data-full="${esc(w.img)}" onerror="this.onerror=null;this.src=this.dataset.full"></button>
        <figcaption><b>Plate ${k + 1}.</b> <i>${esc(w.title)}</i>, ${esc(w.year)}. ${esc(w.medium || "")}.</figcaption></figure>`).join("")}</div>
      <p style="text-align:right;max-width:none;margin-top:14px">${qed}</p>`;
  }
  const EXTRA = { key: "extra", tag: "Extra credit", C: 0, hz: 523.25, render: extra, extra: true };
  const SECTIONS = [
    { key: "work", tag: "Show your work", C: -1.5, hz: 196.0, render: work },
    { key: "notes", tag: "Take notes", C: -0.5, hz: 293.66, render: notes },
    { key: "taste", tag: "A matter of taste", C: 0.5, hz: 440.0, render: taste },
    { key: "about", tag: "Who is this?", C: 1.5, hz: 659.25, render: about }
  ];

  /* ---------- the page ---------- */
  const mail = (S.socials || []).find(s => /^mailto:/.test(s.url || ""));
  const links = (S.socials || []).filter(s => s.url && !/^mailto:/.test(s.url)).slice(0, 3);
  document.getElementById("app").innerHTML = `
    <div id="stage">
      <svg id="strings" aria-hidden="true"></svg>
      <header class="top">
        <div class="who">
          ${P.avatar ? `<a class="face" href="#about" aria-label="About ${esc(P.name || "me")}"><img alt="" src="${esc(encodeURI(P.avatar))}"></a>` : ""}
          <div><h1>${esc(P.name || "")} Cao <span>${esc(P.legalName || "")} ${esc(P.cjk || "")}</span></h1>
            <p><b>Problem.</b> Find every solution of <span class="eqn-inline"><i>y</i>′ + <i>y</i> = sin <i>x</i>.</span></p>
            <p class="how">Four are drawn below. Click one.</p></div>
        </div>
        <div class="snd"><button type="button" id="sound" aria-pressed="false">sound off</button><input type="range" id="vol" min="0" max="100" value="60" aria-label="Volume"></div>
      </header>
      <nav aria-label="Sections" id="keys"></nav>
      <p class="note" id="n1"><b>Four solutions.</b> Each is the same curve plus <i>Ce</i><sup>−<i>x</i></sup>; only <i>C</i> differs. Click one to open it. Pull one sideways and let go to pluck it.</p>
      <p class="note" id="n2"><b><i>x</i> = 1.</b> What made them different is already down to a third of what it was.</p>
      <p class="note" id="n3"><b><i>x</i> = 3.5.</b> The four are now within three pixels of each other.</p>
      <p class="aside eqn" id="eqn"><i>y</i> = <span class="frac"><span>1</span><span>2</span></span>(sin <i>x</i> − cos <i>x</i>) + <i>Ce</i><sup>−<i>x</i></sup><span class="no">(1)</span></p>
      <p class="aside rem" id="rem"><i>Remark.</i> Wherever a solution starts, the last term dies and this is what is left.</p>
      <div class="end" id="end">
        <h2>${esc(P.name || "")} Cao ${qed}</h2>
        <p>Contact is left as an exercise for the reader.</p>
        <ul>${mail ? `<li>${esc(mail.handle)}</li>` : ""}<li>${links.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(", ")}</li></ul>
        <span class="see" aria-hidden="true">see me</span>
      </div>
      <figure id="gust"><button type="button" aria-label="A matter of taste"><img alt="A girl blown along by a gust of wind, her umbrella turned inside out. Thomas Hood, 1826." src="assets/website/gust-girl.png"></button>
        <figcaption>De gustibus non est disputandum.</figcaption></figure>
      ${[0, 1, 2, 3, 4, 5].map(k => HUNT.html(k, "out")).join("")}
      <p class="colophon"><span id="tally">${esc(HUNT.tally())}</span>${P.updated ? `${HUNT.tally() ? " · " : ""}Updated ${esc(P.updated)}` : ""}</p>
    </div>
    <aside class="panel" id="panel" aria-label="Section" tabindex="-1"></aside>`;

  const stage = $("#stage"), svg = $("#strings"), panel = $("#panel"), keys = $("#keys");
  const NS = "http://www.w3.org/2000/svg";
  const SY = 70, PX = 220;           /* pixels per unit of y (sideways) and of x (down the page) */
  const BEND = 0.6;                  /* width of a bend, in units of x */
  let TOP = 190, W = 0, H = 0, x0 = 0, ORG = 0, open = -1;   /* ORG: where y = 0 sits, sideways */
  /* per string: how far it is straightened; and its bend: where (xc), how far now (cur), and either held by the pointer (to) or let go (amp, t0) */
  const st = [];
  const fresh = () => ({ flat: 0, flatTo: 0, xc: 0, cur: 0, held: false, to: 0, amp: 0, t0: -1e9 });
  const steady = x => 0.5 * (Math.sin(x) - Math.cos(x));
  const xAt = py => x0 + (py - TOP) / PX, pyAt = x => TOP + (x - x0) * PX;
  const railX = () => Math.max(22, Math.min(64, W * 0.07));
  const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  function addString(i) {
    const s = SECTIONS[i], g = mk("g", {}); g.dataset.i = i; if (s.extra) g.classList.add("extra");
    st[i] = fresh();
    const text = mk("text", { dy: -7 }), tp = mk("textPath", { href: "#guide" + i });
    tp.innerHTML = `<tspan class="n">${i + 1}.</tspan> ${s.tag}`; text.appendChild(tp);
    g.append(mk("path", { class: "s" }), mk("path", { class: "hit" }), mk("path", { class: "guide", id: "guide" + i }), text, mk("circle", { r: 4.5 }));
    svg.appendChild(g);
    const b = document.createElement("button"); b.type = "button"; b.className = "sr"; b.textContent = `Problem ${i + 1}. ${s.tag}`;
    b.addEventListener("click", () => toggle(i)); b.addEventListener("focus", () => g.classList.add("kb")); b.addEventListener("blur", () => g.classList.remove("kb"));
    keys.appendChild(b);
  }
  function build() {
    svg.appendChild(mk("g", { id: "axis" }));
    if (HUNT.done()) SECTIONS.push(EXTRA);
    SECTIONS.forEach((s, i) => addString(i));
  }
  /* every photograph found: the fifth string, C = 0, the steady state itself */
  HUNT.on((first, justDone) => {
    const t = $("#tally"); if (t) t.textContent = HUNT.tally();
    if (!justDone || SECTIONS.includes(EXTRA)) return;
    SECTIONS.push(EXTRA); addString(SECTIONS.length - 1); draw();
    SECTIONS.forEach((s, i) => setTimeout(() => { st[i].xc = xAt(scrollY + innerHeight / 2); letGo(i, 0.5); }, 160 * i));
  });
  function layout() {
    W = stage.clientWidth; const narrow = W < 700;
    TOP = Math.round($(".top").getBoundingClientRect().height + (narrow ? 30 : 16));
    x0 = -Math.log((0.40 * W) / (SY * 1.5));           /* the outer solutions start 40% of the width from the middle */
    ORG = W / 2 - steady(x0) * SY;                      /* shift the axis so the four starting points are centred */
    const xEnd = 3.5 + Math.PI * 1.75;
    H = Math.round(pyAt(xEnd)); stage.style.height = H + "px"; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const put = (id, x, side, gap) => { const el = document.getElementById(id), edge = ORG + (steady(x) + 1.5 * side * Math.exp(-x)) * SY;
      el.style.top = pyAt(x) + "px";
      if (side < 0) { el.style.left = ""; el.style.right = (W - edge + gap) + "px"; el.style.textAlign = "right"; el.style.maxWidth = (edge - gap - 34) + "px"; }
      else { el.style.right = ""; el.style.left = (edge + gap) + "px"; el.style.textAlign = "left"; el.style.maxWidth = (W - edge - gap - 16) + "px"; } };
    put("eqn", 3.25, narrow ? -1 : 1, narrow ? 14 : 40); put("rem", 5.5, -1, narrow ? 18 : 36);
    if (narrow) put("n1", 1, -1, 16); else put("n1", x0 + 1.6, 1, 44);
    $("#n2").hidden = narrow; put("n2", 1, -1, 34); put("n3", 3.6, -1, narrow ? 16 : 34);
    const end = $("#end"); end.style.top = pyAt(7.35) + "px"; end.style.right = (W - ORG + 2) + "px";
    /* the girl in the gust: bottom right, across the curve from the name. On a phone there is only room where the curve swings left. */
    const gust = $("#gust"), gx = narrow ? 5.05 : 7.2;
    gust.style.top = pyAt(gx) + "px"; gust.style.left = Math.min(W - gust.offsetWidth - 10, ORG + (narrow ? steady(5.6) : 0.72) * SY + (narrow ? 26 : 70)) + "px";
    /* six prints in the margins, each a set distance out from the curves */
    [[1.25, 1, 150], [2.3, -1, 190], [4.5, 1, 130], [4.6, -1, 170], [6.25, 1, 110], [6.55, -1, 210]].forEach(([x, side, gap], k) => {
      const el = $(`.print.out[data-hunt="${k}"]`); if (!el) return;
      const w = el.offsetWidth, edge = ORG + (steady(x) + 1.5 * side * Math.exp(-x)) * SY, g = narrow ? gap * 0.22 : gap;
      el.style.top = pyAt(x) + "px"; el.style.left = Math.max(30, Math.min(W - w - 8, side < 0 ? edge - g - w : edge + g)) + "px";
    });
    /* the x axis, down the left edge */
    const ax = $("#axis"), ax0 = 9; ax.innerHTML = "";
    ax.appendChild(mk("line", { x1: ax0, y1: TOP - 6, x2: ax0, y2: H - 34 }));
    ax.appendChild(mk("path", { d: `M${ax0 - 4} ${H - 41}L${ax0} ${H - 33}L${ax0 + 4} ${H - 41}` }));
    const xl = mk("text", { x: ax0 + 9, y: H - 32, style: "font-style: italic" }); xl.textContent = "x"; ax.appendChild(xl);
    for (let k = Math.ceil(x0); pyAt(k) < H - 70; k++) { ax.appendChild(mk("line", { x1: ax0, y1: pyAt(k), x2: ax0 + 6, y2: pyAt(k) }));
      const t = mk("text", { x: ax0 + 11, y: pyAt(k) + 5 }); t.textContent = minus(k); ax.appendChild(t); }
    draw();
  }
  const rest = (i, py) => { const x = xAt(py); return ORG + (steady(x) + SECTIONS[i].C * Math.exp(-x)) * SY; };
  function pos(i, py) {
    const q = st[i], x = xAt(py);
    let y = steady(x) + SECTIONS[i].C * Math.exp(-x);
    if (q.cur) { const u = (x - q.xc) / BEND; y += q.cur * Math.exp(-u * u); }   /* a soft, rounded bend centred where it was pulled */
    const natural = ORG + y * SY;
    return natural + (railX() - natural) * q.flat;
  }
  function draw() {
    const step = 6, span = W < 700 ? 230 : 300;
    $$("g[data-i]", svg).forEach((g, i) => {
      let d = "", pts = [];
      for (let py = TOP; py <= H; py += step) { const px = pos(i, py); d += (d ? "L" : "M") + px.toFixed(1) + " " + py; if (py <= TOP + span) pts.push([px, py]); }
      g.children[0].setAttribute("d", d); g.children[1].setAttribute("d", d);
      /* the label rides its own stretch of the curve; on the right-hand side the stretch runs upward so the words stay upright */
      const right = SECTIONS[i].C > 0; if (right) pts.reverse();
      g.children[2].setAttribute("d", pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1]).join(""));
      const tp = g.children[3].firstChild;
      if (right) { g.children[3].setAttribute("text-anchor", "end"); tp.setAttribute("startOffset", Math.max(0, g.children[2].getTotalLength() - 16)); }
      else tp.setAttribute("startOffset", 16);
      g.children[4].setAttribute("cx", pos(i, TOP).toFixed(1)); g.children[4].setAttribute("cy", TOP);
    });
  }
  let raf = 0;
  function tick(now) {
    let busy = false;
    st.forEach(q => {
      if (Math.abs(q.flatTo - q.flat) > 0.002) { q.flat += (q.flatTo - q.flat) * 0.14; busy = true; } else q.flat = q.flatTo;
      if (q.held) { q.cur += (q.to - q.cur) * 0.3; busy = true; }
      else { const age = (now - q.t0) / 1000;
        if (age < 3) { q.cur = q.amp * Math.exp(-2.1 * age) * Math.cos(age * 15); busy = true; } else q.cur = 0; }
    });
    draw(); raf = busy ? requestAnimationFrame(tick) : 0;
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  function letGo(i, amp) { const q = st[i]; q.held = false; q.amp = still.matches ? 0 : amp === undefined ? q.cur : amp; q.t0 = performance.now(); kick(); ping(i, Math.abs(amp === undefined ? q.cur : amp)); }

  /* ---------- opening a section ---------- */
  function toggle(i, keepHash) {
    open = open === i ? -1 : i;
    st.forEach((q, k) => q.flatTo = k === open ? 1 : 0);
    if (still.matches) st.forEach(q => q.flat = q.flatTo);
    svg.classList.toggle("open", open >= 0); stage.classList.toggle("open", open >= 0);
    $$("g[data-i]", svg).forEach((g, k) => g.classList.toggle("on", k === open));
    if (open >= 0) {
      const s = SECTIONS[open];
      panel.innerHTML = `<div class="bar"><button class="close" type="button" data-act="close">close</button></div><div class="sheet">${s.render()}</div>`;
      panel.classList.add("show"); panel.scrollTop = 0; if (s.after) s.after();
      st[open].xc = xAt(scrollY + innerHeight / 2); letGo(open, 0.45);
      setTimeout(() => panel.focus({ preventScroll: true }), 60);
    } else panel.classList.remove("show");
    if (!keepHash) history.replaceState(null, "", open >= 0 ? "#" + SECTIONS[open].key : location.pathname + location.search);
    kick();
  }
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    const k = SECTIONS.findIndex(s => s.key === h);
    if (k >= 0) { if (open !== k) toggle(k, true); return; }
    if (h && W_ALL.some(w => slug(w.title) === h)) {
      if (open !== 0) toggle(0, true);
      const el = document.getElementById(h); if (el) { el.scrollIntoView({ block: "start" }); el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
      return;
    }
    if (!h && open >= 0) toggle(open, true);
  }
  panel.addEventListener("click", e => {
    const act = e.target.closest("[data-act]");
    if (act) { const a = act.dataset.act;
      if (a === "close") toggle(open);
      if (a === "lemmas") $("#lemmas").innerHTML = lemmas();
      if (a === "quote") $("#quote").innerHTML = quote();
      return; }
    const pic = e.target.closest("[data-set]"); if (pic) return light(pic.dataset.set, +pic.dataset.n);
    const row = e.target.closest(".row[data-k]"); if (!row) return;
    const li = row.parentNode, had = $(".detail", li);
    if (had) had.remove(); else li.insertAdjacentHTML("beforeend", detail(row.dataset.k, +row.dataset.i));
  });

  /* ---------- full-size pictures ---------- */
  const dlg = document.createElement("dialog"); dlg.className = "light"; document.body.appendChild(dlg);
  let lset = [], lk = 0;
  function light(name, k) {
    lset = SETS[name] || []; lk = k; if (!lset.length) return;
    const show = () => { const p = lset[lk];
      dlg.innerHTML = `<div class="in">${p.video ? `<video src="${esc(p.src)}" controls playsinline autoplay></video>` : `<img alt="" src="${esc(p.src)}"${p.remote ? ' referrerpolicy="no-referrer"' : ""}>`}<div class="cap">${p.cap || ""}</div></div>
        <button class="x" type="button">close</button>${lset.length > 1 ? '<button class="nav prev" type="button" aria-label="Previous">prev</button><button class="nav next" type="button" aria-label="Next">next</button>' : ""}`; };
    show(); if (!dlg.open) dlg.showModal();
    dlg.onclick = e => { if (e.target.closest(".x") || e.target === dlg || e.target.classList.contains("in")) return dlg.close();
      const n = e.target.closest(".nav"); if (n) { lk = (lk + (n.classList.contains("next") ? 1 : -1) + lset.length) % lset.length; show(); } };
    dlg.onkeydown = e => { if (lset.length < 2) return; if (e.key === "ArrowRight") { lk = (lk + 1) % lset.length; show(); } if (e.key === "ArrowLeft") { lk = (lk - 1 + lset.length) % lset.length; show(); } };
  }
  dlg.addEventListener("close", () => { dlg.innerHTML = ""; });

  /* ---------- sound: the four strings of a violin, G D A E ---------- */
  let ctx = null, soundOn = false, volume = 0.6;
  function ping(i, vol) {
    if (!soundOn) return;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
      o.type = "triangle"; o.frequency.value = SECTIONS[i].hz;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(0.0009, Math.min(0.3, 0.1 + vol * 0.25) * volume), t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.6);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.7);
    } catch (e) {}
  }
  const volEl = $("#vol"), sndBtn = $("#sound");
  const setSound = on => { soundOn = on; sndBtn.textContent = "sound " + (on ? "on" : "off"); sndBtn.setAttribute("aria-pressed", on); sndBtn.parentNode.classList.toggle("on", on); };
  sndBtn.addEventListener("click", () => { setSound(!soundOn); if (soundOn) ping(1, 0.4); });
  volEl.addEventListener("input", () => { volume = volEl.value / 100; });
  volEl.addEventListener("change", () => { if (!soundOn) setSound(true); ping(1, 0.4); });

  /* ---------- pointer: click a string to open it; pull one sideways and it bends, then lets go ---------- */
  svg.addEventListener("click", e => { const g = e.target.closest("g[data-i]"); if (g) toggle(+g.dataset.i); });
  $("#gust button").addEventListener("click", () => toggle(2));
  let last = null, grabbed = -1;
  stage.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;
    const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, now = performance.now();
    if (open >= 0 || py < TOP + 10) { if (grabbed >= 0) { letGo(grabbed); grabbed = -1; } last = null; return; }
    if (grabbed < 0) SECTIONS.forEach((s, i) => {
      if (grabbed >= 0) return;
      const b = px - rest(i, py), a = last && now - last.t < 120 ? last.px - rest(i, last.py) : b;
      if (Math.abs(b) < 9 || a * b < 0) grabbed = i;
    });
    if (grabbed >= 0) { const q = st[grabbed], off = px - rest(grabbed, py), lim = 46;
      q.held = true; q.xc = xAt(py); q.to = Math.max(-lim, Math.min(lim, off)) / SY; kick();
      if (Math.abs(off) > lim) { q.cur = q.to; letGo(grabbed); grabbed = -1; } }
    last = { px, py, t: now };
  });
  stage.addEventListener("pointerleave", () => { if (grabbed >= 0) { letGo(grabbed); grabbed = -1; } last = null; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && open >= 0 && !dlg.open) toggle(open); });

  build(); layout(); route();
  addEventListener("resize", layout); addEventListener("hashchange", route);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  $$(".top img").forEach(im => im.addEventListener("load", layout));

  /* privacy-friendly visit counts: set analytics.goatcounter in content.js (or the editor) */
  const code = ((S.analytics || {}).goatcounter || "").trim();
  if (code && location.protocol !== "file:" && !/^(localhost|127\.)/.test(location.hostname)) {
    const sc = document.createElement("script"); sc.async = true; sc.src = "https://gc.zgo.at/count.js";
    sc.dataset.goatcounter = `https://${code.replace(/^https?:\/\//, "").replace(/\.goatcounter\.com.*$/, "")}.goatcounter.com/count`;
    document.body.appendChild(sc);
  }
})();
