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
  const clean = t => String(t || "").replace(/\\[rn]/g, " ").replace(/\s+/g, " ").trim();   /* stray "\r" left by the vault's front matter */
  const vaultLink = t => "vault.html?note=" + encodeURIComponent(t);
  const qed = '<span class="qed" role="img" aria-label="end of proof"></span>';

  /* ---------- data ---------- */
  const W_ALL = S.writings || [];
  const PAPERS = W_ALL.filter(w => w.type !== "appearance" && w.type !== "project");
  const PROJECTS = W_ALL.filter(w => w.type === "project");
  const when = w => String(w.start || w.end || "");
  const isUpcoming = w => (w.end || w.start) ? (w.end || w.start) >= TODAY : !!w.upcoming;
  const APPEAR = W_ALL.filter(w => w.type === "appearance").sort((a, b) => when(b).localeCompare(when(a)));
  const STUDIO = ((S.studio || {}).items || []).filter(w => w.kind !== "Photography");
  const PHOTOS = ((S.studio || {}).items || []).filter(w => w.kind === "Photography");
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
  const ref = (w0, n) => {
    /* a paper whose link is a PDF has a typeset page of its own (essays/, built by tools/build-essays.py); the PDF stays one click further */
    const pdf = w0.type !== "project" && w0.type !== "appearance" && /\.pdf$/i.test(w0.link || "") ? w0.link : "";
    const w = pdf ? { ...w0, link: `essays/${slug(w0.title)}.html` } : w0;
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
      ${thumbs}</div></li>`;
  };
  function work() {
    let n = 0;
    const set = ws => ws.map(w => ({ src: w.img, cap: `<i>${esc(w.title)}</i>, ${esc(w.year)}<small>${esc(w.medium || "")}</small>` }));
    SETS.studio = set(STUDIO); SETS.photos = set(PHOTOS);
    const figs = (ws, name, from) => `<div class="figs">${ws.map((w, k) => `<figure><button type="button" data-set="${name}" data-n="${k}" aria-label="${esc(w.title)}"><img alt="" loading="lazy" src="${esc(thumbOf(w.img))}" data-full="${esc(w.img)}" onerror="this.onerror=null;this.src=this.dataset.full"></button>
      <figcaption><b>Plate ${k + 1 + from}.</b> <i>${esc(w.title)}</i>, ${esc(w.year)}. ${esc((w.medium || "").replace(/\.$/, ""))}.</figcaption></figure>`).join("")}</div>`;
    const parts = "abcdef"; let part = 2 + (APPEAR.length ? 1 : 0);
    return `<p class="q"><b>Problem 1.</b> Show your work.</p>
      <h3><b>(a)</b> Papers <small>essays written for prize competitions, and independent research</small></h3>
      <ol class="refs">${PAPERS.map((w, k) => ref(w, ++n)).join("")}</ol>
      ${PROJECTS.length ? `<h3><b>(b)</b> Projects <small>things I’ve built</small></h3><ol class="refs">${PROJECTS.map(w => ref(w, ++n)).join("")}</ol>` : ""}
      ${APPEAR.length ? `<h3><b>(c)</b> Appearances <small>conferences, talks and events</small></h3><ol class="refs">${APPEAR.map(w => ref(w, ++n)).join("")}</ol>` : ""}
      ${STUDIO.length ? `<h3><b>(${parts[part++]})</b> Drawings and paintings</h3>${figs(STUDIO, "studio", 0)}` : ""}
      ${PHOTOS.length ? `<h3><b>(${parts[part++]})</b> Photographs</h3>${figs(PHOTOS, "photos", STUDIO.length)}` : ""}`;
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
      ${hoodFig("tree", "A mystery.")}
      ${recent.length ? `<h3><b>(a)</b> Most recent</h3><ul class="rows">${recent.map(n => `<li><div class="row"><a class="t" href="${vaultLink(n[0])}">${esc(n[0])}</a><span class="r">${esc(fmtDate(n[3]).replace(/, \d{4}$/, ""))}</span></div></li>`).join("")}</ul>` : ""}
      ${src.length ? `<h3><b>(b)</b> Sources <small>books and films I have taken notes on</small></h3><ul class="rows">${src.map(n => `<li><div class="row"><span><a class="t" href="${vaultLink(n.note)}"><i>${esc(n.title)}</i></a>${clean(n.author) ? `<span class="by">, ${esc(clean(n.author))}</span>` : ""}</span><span class="r">${plural(n.ideas.length, "idea")}</span></div></li>`).join("")}</ul>` : ""}
      ${(window.QUOTES || {}).items ? `<h3><b>(c)</b> Copied out</h3><div id="quote">${quote()}</div><p style="margin-top:8px"><button type="button" class="linkish" data-act="quote">Another.</button></p>` : ""}`;
  }

  const bookRow = b => `<li><button type="button" class="row" data-k="book" data-i="${b.i}"><span><span class="t"><i>${esc(b.t)}</i></span><span class="by">, ${esc(b.a || "")}</span></span><span class="r">${rating(b.r)}${b.fav ? " †" : ""}</span></button></li>`;
  const filmRow = (f, r) => `<li><button type="button" class="row" data-k="film" data-i="${f.i}"><span><span class="t"><i>${esc(f.t)}</i></span><span class="by"> (${esc(f.y || "")})</span></span><span class="r">${rating(r === undefined ? f.r : r)}${f.liked ? " †" : ""}</span></button></li>`;
  function taste() {
    const reading = BOOKS.filter(b => b.shelf === "reading");
    const read = BOOKS.filter(b => b.shelf === "read").sort((a, b) => String(b.read || "0" + b.added).localeCompare(String(a.read || "0" + a.added)));
    const favs = BOOKS.filter(b => b.fav).sort(byDesc("read"));
    const dnf = S.showDidNotFinish ? BOOKS.filter(b => b.shelf === "dnf") : [];
    const years = [...new Set(read.map(b => b.read ? parse(b.read).y : 0))];
    const films = FILMS.filter(shown), favF = (FD.favorites || []).map(i => FILMS[i]).filter(shown);
    const top = (FD.lists || []).find(l => /favou?rite/i.test(l.name) && (l.items || []).length);   /* my ranked favorites list, shown in full; the four-film row is only a fallback */
    const last = {}; FD.diary.forEach(d => { if (!last[d.f] || d.date > last[d.f]) last[d.f] = d.date; });
    const byRecent = films.slice().sort((a, b) => String(last[b.i] || b.added || "").localeCompare(String(last[a.i] || a.added || "")));
    const artists = [...new Set(ART.map(a => a.artist))];
    SETS.art = ART.map(a => ({ src: a.img, remote: true, cap: `<i>${esc(a.t)}</i>, ${esc(a.artist)}${a.year ? ", " + esc(a.year) : ""}<small>${esc([a.museum, a.city].filter(Boolean).join(", "))}</small>${a.note ? paras(a.note) : ""}` }));
    const M = S.music || {}, lists = (M.lists || []).filter(l => l && l.name && (l.items || []).some(x => x.t)), play = (M.play || []).filter(p => p && p.t);
    let part = 0; const tag = () => `<b>(${"abcdefgh"[part++]})</b>`;
    return `<p class="q"><b>Problem 3.</b> A matter of taste.</p>
      <p class="foot">Ratings are out of five. A dagger (†) marks a favorite. Click a row for the review.</p>
      <h3>${tag()} Books <small>${read.length} read</small></h3>
      ${reading.length ? `<h4>Reading now</h4><ul class="rows">${reading.map(bookRow).join("")}</ul>` : ""}
      ${favs.length ? `<h4>Favorites</h4><ul class="rows">${favs.map(bookRow).join("")}</ul>` : ""}
      <details><summary>All ${read.length} read, most recent first</summary>${years.map(y => `<p class="year">${y || "Earlier"}</p><ul class="rows">${read.filter(b => (b.read ? parse(b.read).y : 0) === y).map(bookRow).join("")}</ul>`).join("")}</details>
      ${dnf.length ? `<details><summary>${dnf.length} I did not finish</summary><ul class="rows" style="margin-top:8px">${dnf.map(bookRow).join("")}</ul></details>` : ""}
      <h3>${tag()} Films <small>${films.length} seen</small></h3>
      ${top ? `<h4>${esc(top.name)}</h4><ol class="rows ranked">${top.items.map(x => FILMS[x.f] ? filmRow(FILMS[x.f]) : `<li><div class="row"><span class="t"><i>${esc(x.t)}</i></span></div></li>`).join("")}</ol>`
        : favF.length ? `<h4>Favorites</h4><ul class="rows">${favF.map(f => filmRow(f)).join("")}</ul>` : ""}
      ${(FD.lists || []).filter(l => l !== top).map(l => `<details><summary>${esc(l.name)}</summary>${l.desc ? `<p>${esc(l.desc)}</p>` : ""}<ol class="rank">${(l.items || []).map(x => `<li><i>${esc(x.t)}</i>${x.y ? ` (${esc(x.y)})` : ""}</li>`).join("")}</ol></details>`).join("")}
      <details><summary>All ${films.length} seen, most recent first</summary><ul class="rows" style="margin-top:8px">${byRecent.map(f => filmRow(f)).join("")}</ul></details>
      ${ART.length ? `<h3>${tag()} Paintings <small>${ART.length} works by ${plural(artists.length, "artist")}, seen in person or studied</small></h3>
        ${(S.artists || []).length ? `<p><i>Favorite painters.</i> ${(S.artists || []).map(a => esc(a.name)).join(", ")}.</p>` : ""}
        <h4>Most recent</h4><ul class="plates eight">${ART.slice(0, 24).map((a, k) => `<li><button type="button" data-set="art" data-n="${k}" aria-label="${esc(a.t)} by ${esc(a.artist)}"><img alt="" loading="lazy" referrerpolicy="no-referrer" src="${esc(a.img || "")}" onerror="this.closest('li').remove()"></button><span class="cap"><i>${esc(a.t)}</i>, ${esc(a.artist)}</span></li>`).join("")}</ul>
        <details><summary>All ${ART.length}, by artist</summary>${artists.sort((a, b) => a.localeCompare(b)).map(name => `<p class="year">${esc(name)}</p><ul class="rows">${ART.map((a, k) => [a, k]).filter(([a]) => a.artist === name).map(([a, k]) =>
          `<li><button type="button" class="row" data-set="art" data-n="${k}"><span class="t"><i>${esc(a.t)}</i></span><span class="r">${esc(a.year || "")}</span></button></li>`).join("")}</ul>`).join("")}</details>` : ""}
      <h3>${tag()} Music</h3>
      ${(M.top || []).length ? `<p><i>Favorites.</i> ${M.top.map(esc).join(", ")}.</p>` : ""}
      ${play.length ? `<h4>At the violin</h4><ul class="rows">${play.map(p => `<li><div class="row"><span><span class="t"><i>${esc(p.t)}</i></span>${p.a ? `<span class="by">, ${esc(p.a)}</span>` : ""}</span><span class="r">${p.status === "now" ? "playing now" : p.status === "learn" ? "want to learn" : "played"}</span></div></li>`).join("")}</ul>` : ""}
      ${lists.map(l => `<details><summary>${esc(l.name)}</summary><ol class="rank">${l.items.filter(x => x.t).map(x => `<li><i>${esc(x.t)}</i>${x.a ? `, ${esc(x.a)}` : ""}</li>`).join("")}</ol></details>`).join("")}
      ${hoodFig("pandeans")}`;
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
      <h3>Contact <small>left as an exercise for the reader</small></h3>
      <table class="cv">${(S.socials || []).filter(s => s.url).map(s => `<tr><td>${esc(s.name)}</td><td>${/^mailto:/.test(s.url) ? esc(s.handle) : `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.handle || s.name)}</a>`}</td></tr>`).join("")}</table>
      ${hoodFig("well")}
      <p style="text-align:right;max-width:none;margin-top:14px">${qed}</p>`;
  }

  const SECTIONS = [
    { key: "work", tag: "Show your work", C: -1.5, hz: 196.0, render: work },
    { key: "notes", tag: "Take notes", C: -0.5, hz: 293.66, render: notes },
    { key: "taste", tag: "A matter of taste", C: 0.5, hz: 440.0, render: taste },
    { key: "about", tag: "Who is this?", C: 1.5, hz: 659.25, render: about }
  ];

  /* Thomas Hood's drawings (Whims and Oddities, 1826). Each is a figure, numbered once for the whole site:
     the four on the home page first, then the ones inside the sections. My own work is numbered separately, as plates. */
  const HOODS = [
    { k: "spring", src: "assets/website/hood-spring.png", cap: "Spring and Fall.", alt: "A man vaulting a fence lands on a bull." },
    { k: "dream", src: "assets/website/hood-dream.png", cap: "A Dream.", alt: "A tangle of faces sharing their features: an eyebrow of one is the mouth of another." },
    { k: "sea", src: "assets/website/hood-sea.png", cap: "“Come o’er the sea!”", alt: "A skeleton rowing a coffin across the sea." },
    { k: "gust", src: "assets/website/gust-girl.png", cap: "De gustibus non est disputandum.", alt: "A girl blown along by a gust of wind, her umbrella turned inside out." },
    { k: "tree", src: "assets/website/hood-tree.png", cap: "Miss Tree.", alt: "A man starts back from a tree that has the shape of a woman." },
    { k: "pandeans", src: "assets/website/hood-pandeans.png", cap: "Pandeans.", alt: "A face in the clouds blowing a set of pan pipes." },
    { k: "well", src: "assets/website/hood-well.png", cap: "“All’s well that ends well.”", alt: "A mermaid combing her hair beside a well." }
  ];
  const figNo = k => HOODS.findIndex(h => h.k === k) + 1;
  SETS.hood = HOODS.map(h => ({ src: h.src, cap: `<b>Fig. ${figNo(h.k)}.</b> ${h.cap}<small>Thomas Hood, <i>Whims and Oddities</i>, 1826</small>` }));
  const hoodBtn = k => { const i = HOODS.findIndex(h => h.k === k), h = HOODS[i]; return `<button type="button" data-set="hood" data-n="${i}" aria-label="${esc(h.alt)} Open full size."><img class="hood-img" alt="${esc(h.alt)}" loading="lazy" src="${h.src}"></button>`; };
  const hoodFig = (k, more = "") => `<figure class="fig">${hoodBtn(k)}<figcaption><b>Fig. ${figNo(k)}.</b> ${HOODS.find(h => h.k === k).cap} Thomas Hood, <i>Whims and Oddities</i>, 1826.${more ? " " + more : ""}</figcaption></figure>`;
  const hoodDeco = k => `<figure class="deco" id="${k}">${hoodBtn(k)}<figcaption>Fig. ${figNo(k)}. ${HOODS.find(h => h.k === k).cap}</figcaption></figure>`;

  /* three stanzas set beside the strings */
  const POEMS = [
    { by: "William Wordsworth, 1802", lines: ["My heart leaps up when I behold", "A rainbow in the sky:", "So was it when my life began;", "So is it now I am a man;", "So be it when I shall grow old,", "Or let me die!", "The Child is father of the Man;", "And I could wish my days to be", "Bound each to each by natural piety."] },
    { by: "Percy Bysshe Shelley, <i>Hymn to Intellectual Beauty</i>, 1816", lines: ["Thus let thy power, which like the truth", "Of nature on my passive youth", "Descended, to my onward life supply", "Its calm – to one who worships thee,", "And every form containing thee,", "Whom, Spirit fair, thy spells did bind", "To fear himself, and love all human kind."] },
    { by: "Lord Byron, <i>Childe Harold’s Pilgrimage</i>, 1812", lines: ["With thee, my bark, I’ll swiftly go", " Athwart the foaming brine;", "Nor care what land thou bear’st me to,", " So not again to mine.", "Welcome, welcome, ye dark blue waves!", " And when you fail my sight,", "Welcome, ye deserts, and ye caves!", " My Native Land – Good Night!"] }
  ];

  /* ---------- the page ---------- */
  const mail = (S.socials || []).find(s => /^mailto:/.test(s.url || ""));
  const links = (S.socials || []).filter(s => s.url && !/^mailto:/.test(s.url)).slice(0, 3);
  document.getElementById("app").innerHTML = `
    <div id="stage">
      <canvas id="field" aria-hidden="true"></canvas>
      <svg id="strings" aria-hidden="true"></svg>
      <header class="top">
        <div class="who">
          ${P.avatar ? `<a class="face" href="#about" aria-label="About ${esc(P.name || "me")}"><img alt="" src="${esc(encodeURI(P.avatar))}"></a>` : ""}
          <div><h1>${esc(P.name || "")} Cao <span>${esc(P.legalName || "")} ${esc(P.cjk || "")}</span></h1>
            <p><b>Problem.</b> Find every solution of <span class="eqn-inline"><i>y</i>' + <i>y</i> = sin <i>x</i>.</span> <span class="how">Four are drawn below: click one to open it, or pull it sideways and let go.</span></p>
</div>
        </div>
        <div class="controls"><button type="button" id="theme-toggle" aria-pressed="false">dark mode off</button><div class="snd"><button type="button" id="sound" aria-pressed="false">sound off</button><input type="range" id="vol" min="0" max="100" value="60" aria-label="Volume"></div></div>
      </header>
      <nav aria-label="Sections" id="keys"></nav>
      ${POEMS.map((p, k) => `<figure class="poem" id="poem${k}"><blockquote>${p.lines.map(l => `<span class="${/^\s/.test(l) ? "in" : ""}">${esc(l.trim())}</span>`).join("")}</blockquote><figcaption>${p.by}</figcaption></figure>`).join("")}
      <div class="end" id="end">
        <h2>${esc(P.name || "")} Cao ${qed}</h2>
        <p>Contact is left as an exercise for the reader.</p>
        <ul>${mail ? `<li>${esc(mail.handle)}</li>` : ""}<li>${links.map(s => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>`).join(", ")}</li></ul>
        <span class="see" aria-hidden="true">see me</span>
      </div>
      ${["spring", "dream", "sea", "gust"].map(hoodDeco).join("")}
      ${P.updated ? `<p class="colophon">Updated ${esc(P.updated)}</p>` : ""}
    </div>
    <aside class="panel" id="panel" aria-label="Section" tabindex="-1"></aside>`;

  const stage = $("#stage"), svg = $("#strings"), panel = $("#panel"), keys = $("#keys");
  const NS = "http://www.w3.org/2000/svg";
  const SY = 70, PX = 220;           /* pixels per unit of y (sideways) and of x (down the page) */
  const BEND = 1.15;                 /* width of a bend, in units of x: wide, so the string leans rather than kinks */
  const QUIET = 150;                 /* pixels below the starting point where the string does not move at all (its label sits there) */
  let TOP = 190, W = 0, H = 0, x0 = 0, xEnd = 8, ORG = 0, open = -1;   /* ORG: where y = 0 sits, sideways */
  /* per string: how far it is straightened; and its bend: where (xc), how far now (cur), and either held by the pointer (to) or let go (amp, t0) */
  const st = [];
  /* per string: flat = how far it is straightened (0..1). The bend is a spring: cur = how far it leans now, vel = how fast that is changing,
     to = where the pointer holds it while held, xc = where along the string the bend sits (it glides to xcTo), hit = when it was last flicked */
  const fresh = () => ({ flat: 0, flatTo: 0, xc: 0, xcTo: 0, cur: 0, vel: 0, held: false, to: 0, hit: -1e9 });
  const steady = x => 0.5 * (Math.sin(x) - Math.cos(x));
  const xAt = py => x0 + (py - TOP) / PX, pyAt = x => TOP + (x - x0) * PX;
  const railX = () => Math.max(22, Math.min(64, W * 0.07));
  const mk = (n, a) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const still = matchMedia("(prefers-reduced-motion: reduce)");

  function addString(i) {
    const s = SECTIONS[i], g = mk("g", {}); g.dataset.i = i;
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
    SECTIONS.forEach((s, i) => addString(i));
  }
  function layout() {
    W = stage.clientWidth; const narrow = W < 700;
    TOP = Math.round($(".top").getBoundingClientRect().height + (narrow ? 40 : 44));
    x0 = -Math.log((0.40 * W) / (SY * 1.5));           /* the outer solutions start 40% of the width from the middle */
    ORG = W / 2 - steady(x0) * SY;                      /* shift the axis so the four starting points are centred */
    xEnd = 3.5 + Math.PI * (narrow ? 2.58 : 1.36);   /* a phone needs another swing of the curve to fit the stanzas */
    H = Math.round(pyAt(xEnd)); stage.style.height = H + "px"; svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const put = (id, x, side, gap) => { const el = document.getElementById(id), edge = ORG + (steady(x) + 1.5 * side * Math.exp(-x)) * SY;
      el.style.top = pyAt(x) + "px";
      if (side < 0) { el.style.left = ""; el.style.right = (W - edge + gap) + "px"; el.style.textAlign = el.classList.contains("poem") ? "left" : "right"; el.style.maxWidth = (edge - gap - 34) + "px"; }
      else { el.style.right = ""; el.style.left = (edge + gap) + "px"; el.style.textAlign = "left"; el.style.maxWidth = (W - edge - gap - 16) + "px"; } };
    /* the stanzas go where the curve leaves room: on a phone that means alternating sides as it swings */
    if (narrow) { put("poem0", 1.0, -1, 14); put("poem1", 4.35, 1, 16); put("poem2", 7.05, -1, 18); }
    else { put("poem0", x0 + 1.55, 1, 56); put("poem1", 1.75, -1, 64); put("poem2", 4.55, 1, 70); }
    const xe = narrow ? 8.45 : 6.35, end = $("#end"); end.style.top = pyAt(xe) + "px"; end.style.right = (W - (ORG + Math.min(steady(xe), steady(xe + 0.7)) * SY) + 16) + "px";   /* clear of the curve, which is moving right here */
    /* the girl in the gust: bottom right, across the curve from the name. On a phone there is only room where the curve swings left. */
    const gust = $("#gust"), gx = narrow ? 10.45 : 6.2;
    gust.style.top = pyAt(gx) + "px"; gust.style.left = Math.min(W - gust.offsetWidth - 10, ORG + (narrow ? steady(11) : 0.72) * SY + (narrow ? 26 : 70)) + "px";
    /* three more of Hood's drawings: the leap beside "My heart leaps up", the dream on the left under Shelley, the sea under Byron */
    /* each stanza has a drawing across the strings from it */
    if (narrow) { put("spring", 1.25, 1, 10); put("dream", 4.6, -1, 22); put("sea", 7.35, 1, 12); }
    else { put("spring", 0.0, -1, 200); put("dream", 1.85, 1, 150); put("sea", 4.75, -1, 150); }
    labels = true; field();
    /* the x axis, down the left edge */
    const ax = $("#axis"), ax0 = 9; ax.innerHTML = "";
    ax.appendChild(mk("line", { x1: ax0, y1: TOP - 6, x2: ax0, y2: H - 34 }));
    ax.appendChild(mk("path", { d: `M${ax0 - 4} ${H - 41}L${ax0} ${H - 33}L${ax0 + 4} ${H - 41}` }));
    const xl = mk("text", { x: ax0 + 9, y: H - 32, style: "font-style: italic" }); xl.textContent = "x"; ax.appendChild(xl);
    for (let k = Math.ceil(x0); pyAt(k) < H - 70; k++) { ax.appendChild(mk("line", { x1: ax0, y1: pyAt(k), x2: ax0 + 6, y2: pyAt(k) }));
      const t = mk("text", { x: ax0 + 11, y: pyAt(k) + 5 }); t.textContent = minus(k); ax.appendChild(t); }
    draw();
  }
  /* ---------- behind everything: a field of slope-field dashes that flows in from the side edges into the strings ----------
     Same coordinates as the strings: x runs down the page (py = pyAt(x)) and y runs sideways (px = ORG + y * SY).
     Dashes are born just outside the left and right edges, at an even but uneven spread of heights and times, and each picks one of
     the four strings (all four equally often, so the field is as full between the strings as outside them). A dash follows a solution
     curve of y' = sin x - y, shifted so it ends exactly on its string: after descending s px its sideways distance from the string is
     d0 * (e^(-s/PX) - e^(-len/PX)) / (1 - e^(-len/PX)). So its heading at the edge is the slope field's, it bends the way the true
     solutions do, and it meets the string at an angle, at full strength, fading only over its last FIELD_FADE px. It follows the
     string's own x, so it also follows a plucked string. A dash about to reach the far edge fades out first. Speed along the path is
     FIELD_SPEED for every dash while sound is off, and varies a little per dash (pace) while it is on. Nothing is ever removed in
     flight: a dash ends only by reaching its string. */
  const FIELD_SPEED = 100;            /* px a second along a dash's path */
  const FIELD_PEAK = 0.32;            /* opacity of a dash where the field is at full strength (low on the page) */
  const FIELD_HALF = 6;               /* half the length of a dash, px */
  const FIELD_RATE = 36;              /* dashes born a second per 1000 px of page height, on each side */
  const FIELD_FADE = 14;              /* px of path over which a dash fades into its string; at full strength until then */
  const FIELD_TOP = 0.25;             /* how strong the field is at the top of the page; it grows to full strength lower down */
  const smooth = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const fieldRamp = py => FIELD_TOP + (1 - FIELD_TOP) * Math.min(1, Math.max(0, (xAt(py) - (x0 + 1)) / 5.5));
  let fieldRaf = 0, fieldLastT = 0, fieldPointer = null, fieldKey = "", fieldDashes = [], fieldWait = [0, 0], fieldPhase = [Math.random(), Math.random()], fieldAge = 0, fieldPace = 0, fieldInk = "#121315", fieldInkFor = null, fieldGo = false;

  /* a new dash at height py0 on the given side (-1 left, +1 right), heading for string `target` */
  function makeDash(side, py0, target) {
    const px0 = side < 0 ? -8 : W + 8, d0 = px0 - natural(target, py0), a = Math.abs(d0);
    const len = Math.min(H - 12 - py0, Math.max(150, Math.min(440, 280 + 0.12 * a)));
    return { side, target, py0, d0, len, tail: Math.exp(-len / PX), s: 0, travel: 0, pace: 0.86 + Math.random() * 0.28 };
  }
  /* where a dash is, which way it points, and how far (sideways) it still is from its string */
  function dashPose(p, s = p.s) {
    s = Math.min(s, p.len);
    const py = p.py0 + s, e = Math.exp(-s / PX), k0 = p.d0 / (1 - p.tail), off = k0 * (e - p.tail);
    const slope = (natural(p.target, py + 1) - natural(p.target, py - 1)) / 2 - k0 * e / PX;   /* sideways px per px down */
    const k = Math.hypot(1, slope);
    return { px: natural(p.target, py) + off, py, off, tx: slope / k, ty: 1 / k, k };
  }
  /* move a dash forward dt seconds at a steady speed along its path (a midpoint step, so it stays steady where the path turns); returns where it was */
  function advanceDash(p, dt, pace) {
    const pose = dashPose(p), v = FIELD_SPEED * pace * dt;
    p.s += v / dashPose(p, p.s + v / pose.k / 2).k; p.travel += v;
    return pose;
  }
  /* opacity: stronger lower on the page, in from the edge, out only over the last FIELD_FADE px into the string, out before the far edge, out around the cursor */
  function dashAlpha(p, pose, cursor) {
    const farEdge = p.side < 0 ? W - pose.px : pose.px, left = Math.max(0, p.len - p.s) * pose.k;
    let a = FIELD_PEAK * fieldRamp(pose.py) * smooth(p.travel / 70) * smooth(left / FIELD_FADE) * smooth(farEdge / 90);
    if (cursor) a *= Math.min(1, Math.max(0, (Math.hypot(pose.px - cursor.x, pose.py - cursor.y) - 28) / 172));
    return a;
  }
  /* births: a Poisson stream on each side (uneven gaps in time); heights step by the golden ratio (even cover that never forms a pattern) */
  function emitDashes(dt) {
    fieldAge += dt;
    const rate = FIELD_RATE * H / 1000 * smooth(fieldAge / 3);   /* births a second on each side, easing in over the first 3 s */
    if (rate < 0.5) return;
    for (let side = 0; side < 2; side++) {
      fieldWait[side] -= dt;
      if (fieldDashes.length >= 3500) { fieldWait[side] = Math.max(fieldWait[side], 0); continue; }
      while (fieldWait[side] <= 0) {
        fieldWait[side] += -Math.log(1 - Math.random()) / rate;
        fieldPhase[side] = (fieldPhase[side] + 0.6180339887) % 1;
        const sd = side ? 1 : -1, lo = TOP + 30, hi = Math.max(lo + 60, H - 170);
        const py0 = Math.min(hi, Math.max(lo, lo + (hi - lo) * fieldPhase[side] + (Math.random() - 0.5) * 14));
        fieldDashes.push(makeDash(sd, py0, Math.floor(Math.random() * st.length)));
      }
    }
  }
  /* the canvas stays blank until the page has finished loading, then the first dashes arrive a moment later */
  const fieldStart = () => setTimeout(() => { fieldGo = true; }, 400);
  if (document.readyState === "complete") fieldStart(); else addEventListener("load", fieldStart);
  function field() {
    const cv = $("#field"); if (!cv) return;
    const dpr = Math.min(2, devicePixelRatio || 1), g = cv.getContext("2d");
    cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const LEVELS = 16, buckets = Array.from({ length: LEVELS }, () => []);
    const render = now => {
      const dt = Math.min(0.05, fieldLastT ? (now - fieldLastT) / 1000 : 0); fieldLastT = now;
      const key = `${W}:${H}:${TOP}`;
      if (key !== fieldKey) { fieldKey = key; fieldDashes = []; fieldWait = [0, 0]; fieldAge = 0; }   /* a new layout starts from a clean canvas */
      const theme = document.documentElement.dataset.theme || "";
      if (theme !== fieldInkFor) { fieldInkFor = theme; fieldInk = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#121315"; }
      fieldPace += ((soundOn ? 1 : 0) - fieldPace) * (1 - Math.exp(-dt / 0.35));   /* sound on or off changes speeds gradually, not in a jump */
      g.clearRect(0, 0, W, H);
      if (!fieldGo) { fieldRaf = requestAnimationFrame(render); return; }
      emitDashes(dt);
      g.strokeStyle = fieldInk; g.lineWidth = 0.9; g.lineCap = "round";
      const sr = stage.getBoundingClientRect(), cursor = fieldPointer ? { x: fieldPointer.x - sr.left, y: fieldPointer.y - sr.top } : null;
      buckets.forEach(b => { b.length = 0; });
      for (let i = fieldDashes.length - 1; i >= 0; i--) {
        const p = fieldDashes[i], pose = advanceDash(p, dt, 1 + fieldPace * (p.pace - 1));
        if (p.s >= p.len) { fieldDashes.splice(i, 1); continue; }   /* it has joined its string */
        if (pose.px < -FIELD_HALF || pose.px > W + FIELD_HALF) continue;
        const a = dashAlpha(p, pose, cursor); if (a < 0.008) continue;
        buckets[Math.min(LEVELS - 1, Math.round(a / FIELD_PEAK * (LEVELS - 1)))].push(
          pose.px - pose.tx * FIELD_HALF, pose.py - pose.ty * FIELD_HALF, pose.px + pose.tx * FIELD_HALF, pose.py + pose.ty * FIELD_HALF);
      }
      buckets.forEach((b, lv) => {
        if (!b.length) return;
        g.globalAlpha = lv / (LEVELS - 1) * FIELD_PEAK; g.beginPath();
        for (let k = 0; k < b.length; k += 4) { g.moveTo(b[k], b[k + 1]); g.lineTo(b[k + 2], b[k + 3]); }
        g.stroke();
      });
      fieldRaf = requestAnimationFrame(render);
    };
    if (!cv.dataset.pointerTracking) {
      stage.addEventListener("pointermove", e => { fieldPointer = { x: e.clientX, y: e.clientY }; });
      stage.addEventListener("pointerleave", () => { fieldPointer = null; });
      cv.dataset.pointerTracking = "true";
    }
    if (fieldRaf) cancelAnimationFrame(fieldRaf);
    fieldLastT = 0; fieldRaf = requestAnimationFrame(render);
  }
  const rest = (i, py) => { const x = xAt(py); return ORG + (steady(x) + SECTIONS[i].C * Math.exp(-x)) * SY; };
  /* where string i is at height py, with any bend from being plucked but before it is straightened against the left rail */
  function natural(i, py) {
    const q = st[i], x = xAt(py);
    let y = steady(x) + SECTIONS[i].C * Math.exp(-x);
    if (q.cur) { const u = (x - q.xc) / BEND, t = Math.min(1, Math.max(0, (py - TOP - QUIET) / 240)); y += q.cur * Math.exp(-u * u) * t * t * (3 - 2 * t); }   /* fades to nothing at the top, so the starting point never moves */   /* a soft, rounded bend centred where it was pulled */
    return ORG + y * SY;
  }
  function pos(i, py) { const n = natural(i, py); return n + (railX() - n) * st[i].flat; }
  function draw() {
    const step = 6, span = W < 700 ? 230 : 300, doLabels = labels; labels = false;
    $$("g[data-i]", svg).forEach((g, i) => {
      let d = "", pts = [];
      for (let py = TOP; py <= H; py += step) { const px = pos(i, py); d += (d ? "L" : "M") + px.toFixed(1) + " " + py; if (doLabels && py <= TOP + span) { const r0 = rest(i, py); pts.push([r0 + (railX() - r0) * st[i].flat, py]); } }   /* the label follows the string at rest, so it never wobbles */
      g.children[0].setAttribute("d", d); g.children[1].setAttribute("d", d);
      if (!doLabels) return;
      /* the label rides its own stretch of the curve; on the right-hand side the stretch runs upward so the words stay upright */
      const right = SECTIONS[i].C > 0; if (right) pts.reverse();
      g.children[2].setAttribute("d", pts.map((p, k) => (k ? "L" : "M") + p[0].toFixed(1) + " " + p[1]).join(""));
      const tp = g.children[3].firstChild;
      if (right) { g.children[3].setAttribute("text-anchor", "end"); tp.setAttribute("startOffset", Math.max(0, g.children[2].getTotalLength() - 16)); }
      else tp.setAttribute("startOffset", 16);
      g.children[4].setAttribute("cx", pos(i, TOP).toFixed(1)); g.children[4].setAttribute("cy", TOP);
    });
  }
  let raf = 0, lastT = 0, labels = true;   /* labels: the label paths need redrawing (only on layout and while a string straightens) */
  function tick(now) {
    const dt = Math.min(0.034, lastT ? (now - lastT) / 1000 : 0.016); lastT = now;
    let busy = false;
    st.forEach(q => {
      if (Math.abs(q.flatTo - q.flat) > 0.002) { q.flat += (q.flatTo - q.flat) * (1 - Math.exp(-dt * 9)); busy = true; labels = true; } else if (q.flat !== q.flatTo) { q.flat = q.flatTo; labels = true; }
      q.xc += (q.xcTo - q.xc) * (1 - Math.exp(-dt * 14));
      /* held: follows the pointer without overshoot. Let go: swings back and settles. Two half-steps keep it steady on slow frames. */
      const target = q.held ? q.to : 0, w = q.held ? 18 : 8, z = q.held ? 1 : 0.2;
      for (let k = 0; k < 2; k++) { const h = dt / 2; q.vel += (-w * w * (q.cur - target) - 2 * z * w * q.vel) * h; q.cur += q.vel * h; }
      if (q.held || Math.abs(q.cur) > 0.0012 || Math.abs(q.vel) > 0.008) busy = true; else { q.cur = 0; q.vel = 0; }
    });
    draw();
    if (busy) raf = requestAnimationFrame(tick); else { raf = 0; lastT = 0; }
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
  /* where along the string a bend sits: set straight away if the string is at rest, otherwise glide there */
  const aim = (q, x) => { q.xcTo = x; if (Math.abs(q.cur) < 0.01 && Math.abs(q.vel) < 0.05) q.xc = x; };
  const letGo = i => { const q = st[i]; if (!q.held) return; q.held = false; kick(); ping(i, Math.min(1, Math.abs(q.cur) * 2.5), q.xc); };
  /* a flick: push the string sideways with some speed and let the spring do the rest */
  const flick = (i, x, v) => { const q = st[i]; aim(q, x); q.vel += Math.max(-3, Math.min(3, v)); q.hit = performance.now(); kick(); ping(i, Math.min(1, Math.abs(v) / 3), x); };

  /* ---------- opening a section ---------- */
  function toggle(i, keepHash) {
    open = open === i ? -1 : i;
    st.forEach((q, k) => q.flatTo = k === open ? 1 : 0);
    svg.classList.toggle("open", open >= 0); stage.classList.toggle("open", open >= 0);
    $$("g[data-i]", svg).forEach((g, k) => g.classList.toggle("on", k === open));
    if (open >= 0) {
      const s = SECTIONS[open];
      panel.innerHTML = `<div class="bar"><button class="close" type="button" data-act="close">close</button></div><div class="sheet">${s.render()}</div>`;
      panel.classList.add("show"); panel.scrollTop = 0; if (s.after) s.after();
      flick(open, xAt(scrollY + innerHeight / 2), 1.5);
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
    const sum = e.target.closest("summary"), det = sum && sum.parentNode;
    if (det && det.open && !det.classList.contains("shut")) { e.preventDefault(); det.classList.add("shut"); setTimeout(() => { det.open = false; det.classList.remove("shut"); }, 220); return; }
    const act = e.target.closest("[data-act]");
    if (act) { const a = act.dataset.act;
      if (a === "close") toggle(open);
      if (a === "lemmas") $("#lemmas").innerHTML = lemmas();
      if (a === "quote") $("#quote").innerHTML = quote();
      return; }
    const pic = e.target.closest("[data-set]"); if (pic) return light(pic.dataset.set, +pic.dataset.n);
    const row = e.target.closest(".row[data-k]"); if (!row) return;
    const li = row.parentNode, had = $(".detail", li);
    if (had) { had.classList.add("out"); setTimeout(() => had.remove(), 220); } else li.insertAdjacentHTML("beforeend", detail(row.dataset.k, +row.dataset.i));
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
    dlg.onclick = e => { if (e.target.closest(".x") || e.target === dlg || (e.target.classList.contains("in") && !dlg.querySelector("video"))) return dlg.close();
      const n = e.target.closest(".nav"); if (n) { lk = (lk + (n.classList.contains("next") ? 1 : -1) + lset.length) % lset.length; show(); } };
    dlg.onkeydown = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); dlg.close(); return; } if (lset.length < 2) return; if (e.key === "ArrowRight") { lk = (lk + 1) % lset.length; show(); } if (e.key === "ArrowLeft") { lk = (lk - 1 + lset.length) % lset.length; show(); } };
  }
  let lightShut = -1e9;
  dlg.addEventListener("close", () => { dlg.innerHTML = ""; lightShut = performance.now(); });

  /* ---------- sound: the four strings of a violin, G D A E ---------- */
  let ctx = null, soundOn = false, volume = 0.6;
  /* Pitch works like stopping a violin string. The four strings are tuned in fifths, G D A E. Touching a string lower down is like
     pressing it closer to the bridge: what is left to vibrate is shorter, so it sounds higher, by f = f0 / (1 - stopped). The top of the
     page is the open string and the foot of the page is the middle of the string, an octave up. Every string rises by the same interval
     at the same height, so they stay a fifth apart. The rise is rounded to steps of a major scale, so each string plays a tune. */
  const OPEN = [55, 62, 69, 76], STEPS = [0, 2, 4, 5, 7, 9, 11, 12];
  const midiAt = (i, x) => {
    const stopped = 0.5 * Math.min(1, Math.max(0, (x - x0) / Math.max(1, xEnd - x0)));
    const rise = -12 * Math.log2(1 - stopped);                     /* semitones */
    return OPEN[i] + STEPS.reduce((b, n) => Math.abs(n - rise) < Math.abs(b - rise) ? n : b, 0);
  };
  function ping(i, vol, x) {
    if (!soundOn) return;
    try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      const f = 440 * Math.pow(2, ((x == null ? OPEN[i] : midiAt(i, x)) - 69) / 12), t = ctx.currentTime;
      /* a plucked string: bright at the attack, mellowing as it rings */
      const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = "sawtooth"; o.frequency.value = f;
      lp.type = "lowpass"; lp.Q.value = 0.7; lp.frequency.setValueAtTime(Math.min(12000, f * 9), t); lp.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Math.max(0.0009, Math.min(0.22, 0.07 + vol * 0.18) * volume), t + 0.006); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
      o.connect(lp).connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.9);
    } catch (e) {}
  }

  const volEl = $("#vol"), sndBtn = $("#sound");
  const themeBtn = $("#theme-toggle");
  const setDark = on => {
    document.documentElement.dataset.theme = on ? "dark" : "light";
    themeBtn.textContent = `dark mode ${on ? "on" : "off"}`;
    themeBtn.setAttribute("aria-pressed", on);
    try { localStorage.setItem("theme", on ? "dark" : "light"); } catch (_) {}
  };
  let darkMode = false;
  try { darkMode = localStorage.getItem("theme") === "dark"; } catch (_) {}
  setDark(darkMode);
  themeBtn.addEventListener("click", () => setDark(document.documentElement.dataset.theme !== "dark"));
  const setSound = on => { soundOn = on; sndBtn.textContent = "sound " + (on ? "on" : "off"); sndBtn.setAttribute("aria-pressed", on); sndBtn.parentNode.classList.toggle("on", on); };
  sndBtn.addEventListener("click", () => { setSound(!soundOn); if (soundOn) ping(1, 0.4); });
  volEl.addEventListener("input", () => { volume = volEl.value / 100; });
  volEl.addEventListener("change", () => { if (!soundOn) setSound(true); ping(1, 0.4); });

  /* ---------- pointer: click a string to open it; pull one sideways and it bends, then lets go ---------- */
  svg.addEventListener("click", e => { const g = e.target.closest("g[data-i]"); if (g) toggle(+g.dataset.i); });
  stage.addEventListener("click", e => { const pic = e.target.closest("[data-set]"); if (pic) light(pic.dataset.set, +pic.dataset.n); });
  let last = null, grabbed = -1;
  stage.addEventListener("pointermove", e => {
    if (e.pointerType === "touch") return;   /* the strings move even under "reduce motion": it is a small movement the visitor makes themselves */
    const r = stage.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, now = performance.now(), lim = 26;
    if (open >= 0 || py < TOP + QUIET) { if (grabbed >= 0) { letGo(grabbed); grabbed = -1; } last = null; return; }
    const recent = last && now - last.t < 120, speed = recent ? (px - last.px) / Math.max(4, now - last.t) * 1000 : 0;   /* sideways, pixels a second */
    if (grabbed < 0) SECTIONS.forEach((s, i) => {
      if (grabbed >= 0) return;
      const b = px - rest(i, py), a = recent ? last.px - rest(i, last.py) : b, crossed = a * b < 0;
      if (!crossed && Math.abs(b) >= 9) return;
      /* crossed too fast to hold: flick it. Otherwise take hold and let it follow the pointer. */
      if (crossed && (Math.abs(b) > lim || Math.abs(speed) > 900)) { if (now - st[i].hit > 140) flick(i, xAt(py), speed / SY * 0.11); }
      else grabbed = i;
    });
    if (grabbed >= 0) { const q = st[grabbed], off = px - rest(grabbed, py);
      if (Math.abs(off) > lim) { const v = speed / SY * 0.11; letGo(grabbed); if (Math.abs(v) > 0.5) flick(grabbed, xAt(py), v); grabbed = -1; }   /* pulled past its reach: let go, carrying the pointer's speed */
      else { q.held = true; aim(q, xAt(py)); q.to = off / SY; kick(); } }
    last = { px, py, t: now };
  });
  stage.addEventListener("pointerleave", () => { if (grabbed >= 0) { letGo(grabbed); grabbed = -1; } last = null; });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && open >= 0 && !dlg.open && performance.now() - lightShut > 400) toggle(open); });

  build(); layout(); route();
  /* on arrival the strings stir once, left to right, to show they can be moved */
  if (open < 0) SECTIONS.forEach((s, i) => setTimeout(() => { if (open < 0 && scrollY < 200) flick(i, x0 + 2.3, i % 2 ? -1.5 : 1.5); }, 1100 + i * 170));
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
