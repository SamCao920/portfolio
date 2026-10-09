/* admin.js: a small local editor for data/content.js.
   Open admin.html in Chrome or Edge, click "Connect site folder", pick the portfolio folder,
   edit, then Save. Files you attach (PDFs, covers, photos) are copied into assets/.
   Other browsers can still edit and use "Download content.js". */
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  let data = clone(window.SITE || {});
  let dir = null, dirty = false, section = "theme";
  let loadedStamp = 0, staleArmed = false;
  /* top-level keys this editor edits; everything else in content.js (studio, hiddenFilms, …) is kept from disk on save */
  const MANAGED = ["theme", "profile", "about", "interests", "facts", "record", "writings", "socials", "homeBooks", "showDidNotFinish", "letterboxd", "posterOverrides"];
  const readDisk = async () => {
    const f = await (await (await dir.getDirectoryHandle("data")).getFileHandle("content.js")).getFile();
    const box = {}; new Function("window", await f.text())(box);
    return { site: box.SITE || {}, stamp: f.lastModified };
  };
  let onConnect = () => connect();
  const pendingFiles = [];   // [{path, file}] written into the folder on Save

  /* ---------- toast ---------- */
  function toast(msg) {
    let t = $("#toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function markDirty() { dirty = true; $("#dirty").hidden = false; $("#save").disabled = false; }
  window.addEventListener("beforeunload", e => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- folder access (File System Access API) ---------- */
  const DB = "site-editor", STORE = "handles";
  const idb = mode => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result.transaction(STORE, mode).objectStore(STORE));
    r.onerror = () => rej(r.error);
  });
  const saveHandle = h => idb("readwrite").then(s => s.put(h, "dir")).catch(() => {});
  const loadHandle = () => idb("readonly").then(s => new Promise(r => { const q = s.get("dir"); q.onsuccess = () => r(q.result || null); q.onerror = () => r(null); })).catch(() => null);
  function setStatus(on, text) { const el = $("#status"); el.classList.toggle("on", on); $("span", el).textContent = text; }

  async function useFolder(h) {
    try { await h.getDirectoryHandle("data"); } catch (e) { toast("That folder has no data/ folder. Pick the portfolio folder."); return false; }
    dir = h; await saveHandle(h);
    setStatus(true, "Connected to " + h.name);
    $("#connect").textContent = "Change folder";
    try {   /* re-read content.js from disk so the editor starts from the saved file */
      const f = await (await (await h.getDirectoryHandle("data")).getFileHandle("content.js")).getFile();
      const sandbox = {}; new Function("window", await f.text())(sandbox);
      if (sandbox.SITE && !dirty) { data = sandbox.SITE; loadedStamp = f.lastModified; applyTheme(); render(); }
    } catch (e) { toast("Could not read data/content.js: " + e.message); }
    return true;
  }
  async function connect() {
    if (!window.showDirectoryPicker) { toast("This browser can't write files. Use Chrome or Edge, or Download content.js."); return; }
    try { await useFolder(await window.showDirectoryPicker({ id: "site", mode: "readwrite" })); }
    catch (e) { if (e.name !== "AbortError") toast(e.message); }
  }
  async function reconnect() {
    const h = await loadHandle();
    if (!h) return;
    const p = await h.queryPermission({ mode: "readwrite" });
    if (p === "granted") return useFolder(h);
    setStatus(false, "Click to reconnect " + h.name);
    $("#connect").textContent = "Reconnect";
    onConnect = async () => {
      if ((await h.requestPermission({ mode: "readwrite" })) === "granted") { onConnect = connect; await useFolder(h); }
    };
  }

  /* ---------- serialise ---------- */
  function serialise() {
    const d = new Date();
    data.profile = data.profile || {};
    data.profile.updated = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return `/* ==========================================================================
   content.js: bio, writing, socials and settings for the site.
   Edit it with admin.html (recommended) or by hand. It must stay valid JavaScript.
   Books, films and art live in books.js, films.js and art.js (generated by tools/).
   ========================================================================== */

window.SITE = ${JSON.stringify(data, null, 2)};
`;
  }
  async function writeFile(path, blob) {
    const parts = path.split("/"); let d = dir;
    for (const p of parts.slice(0, -1)) d = await d.getDirectoryHandle(p, { create: true });
    const w = await (await d.getFileHandle(parts.at(-1), { create: true })).createWritable();
    await w.write(blob); await w.close();
  }
  async function save() {
    collect();
    if (!dir) { toast("Connect the site folder first, or use Download content.js."); return; }
    try {
      const disk = await readDisk();
      if (loadedStamp && disk.stamp > loadedStamp && !staleArmed) {
        staleArmed = true;
        toast("content.js changed since you opened the editor. Click Save again to keep your edits anyway, or reload to start from the new file.");
        return;
      }
      staleArmed = false;
      /* keep every section this editor doesn't manage exactly as it is on disk */
      const merged = { ...disk.site };
      MANAGED.forEach(k => { if (k in data) merged[k] = data[k]; else delete merged[k]; });
      data = { ...merged };
      for (const p of pendingFiles.splice(0)) await writeFile(p.path, p.file);
      await writeFile("data/content.js", new Blob([serialise()], { type: "text/javascript" }));
      const th = data.theme || {};
      await writeFile("data/theme.js", new Blob([`/* Site colour theme. Written by admin.html (Theme). Loaded in <head> so the page never flashes the wrong colours. */\ndocument.documentElement.dataset.palette = ${JSON.stringify(th.palette || "slate")};\ndocument.documentElement.dataset.accent = ${JSON.stringify(th.accent || "red")};\n`], { type: "text/javascript" }));
      loadedStamp = (await readDisk()).stamp;
      dirty = false; $("#dirty").hidden = true; $("#save").disabled = true;
      toast("Saved. Reload the site to see it.");
    } catch (e) { toast("Save failed: " + e.message); }
  }

  function download() {
    collect();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([serialise()], { type: "text/javascript" }));
    a.download = "content.js"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    if (pendingFiles.length) toast("Attached files are only copied when you Save to a connected folder.");
  }

  /* ---------- field builders ---------- */
  const val = (o, k) => o[k] ?? "";
  function field(o, k, label, opts = {}) {
    const id = `${opts.prefix || ""}${k}`;
    if (opts.type === "check") return `<label class="f check"><input type="checkbox" data-k="${k}" ${o[k] ? "checked" : ""}><span>${label}</span></label>`;
    let input;
    if (opts.type === "textarea") input = `<textarea id="${id}" data-k="${k}" rows="${opts.rows || 3}">${esc(val(o, k))}</textarea>`;
    else if (opts.type === "select") input = `<select id="${id}" data-k="${k}">${opts.options.map(([v, l]) => `<option value="${v}" ${val(o, k) === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
    else if (opts.type === "file") input = `<div class="filerow"><input type="text" id="${id}" data-k="${k}" value="${esc(val(o, k))}" placeholder="${opts.placeholder || "Path or URL"}"><label class="btn" tabindex="0">Choose file<input type="file" hidden data-file="${k}" data-dir="${opts.dir || "assets"}" accept="${opts.accept || ""}"></label></div>`;
    else input = `<input type="${opts.type || "text"}" id="${id}" data-k="${k}" value="${esc(val(o, k))}" placeholder="${esc(opts.placeholder || "")}">`;
    return `<label class="f" for="${id}"><span>${label}</span>${input}${opts.hint ? `<small>${opts.hint}</small>` : ""}</label>`;
  }
  /* read every [data-k] inside el back into obj */
  function readInto(el, obj) {
    $$("[data-k]", el).forEach(i => {
      const k = i.dataset.k;
      let v = i.type === "checkbox" ? i.checked : i.value.trim();
      if (v === "" && i.type !== "checkbox") { delete obj[k]; return; }
      obj[k] = v;
    });
  }
  /* attaching a file: queue it for Save and put its path in the box */
  document.addEventListener("change", e => {
    const inp = e.target.closest("input[type=file][data-file]");
    if (!inp || !inp.files[0]) return;
    const f = inp.files[0], name = f.name.replace(/[^\w.\- ()]+/g, "_");
    const path = `${inp.dataset.dir}/${name}`;
    pendingFiles.push({ path, file: f });
    const box = inp.closest(".filerow").querySelector("input[type=text]");
    box.value = path; box.dispatchEvent(new Event("input", { bubbles: true }));
    toast(dir ? `${name} will be copied to ${inp.dataset.dir}/ on Save` : `Connect the folder before saving so ${name} gets copied`);
  });
  document.addEventListener("input", e => { if (e.target.closest(".ed-main")) markDirty(); });
  document.addEventListener("change", e => { if (e.target.closest(".ed-main")) markDirty(); });

  /* ---------- colour themes ---------- */
  const PALETTES = [ // name, label, dark bg, dark surface, light bg, light surface
    ["slate", "Slate", "#14181c", "#2c3440", "#f2ebde", "#e0d4bd"],
    ["ink", "Ink", "#111112", "#26262a", "#f7f7f5", "#e4e4e0"],
    ["forest", "Forest", "#0f1714", "#22302a", "#eef2ea", "#d8e2cf"],
    ["navy", "Navy", "#0d1424", "#1d2a47", "#eef1f7", "#d8e0ef"],
    ["plum", "Plum", "#1a1220", "#30223b", "#f5eef3", "#e5d6e0"],
    ["espresso", "Espresso", "#1a1512", "#312821", "#f4ece2", "#e3d3c0"]
  ];
  const ACCENTS = [["red", "Red", "#f0525a"], ["amber", "Amber", "#f5a524"], ["emerald", "Emerald", "#2fd07a"], ["cobalt", "Cobalt", "#5b93ff"], ["violet", "Violet", "#a57bff"], ["rose", "Rose", "#ff6fae"], ["teal", "Teal", "#2cc8c0"]];
  const applyTheme = () => { const t = data.theme || {}; document.documentElement.dataset.palette = t.palette || "slate"; document.documentElement.dataset.accent = t.accent || "red"; };

  /* ---------- sections ---------- */
  const TYPES = [["essay", "Essay"], ["research", "Research"], ["project", "Project"], ["appearance", "Appearance"]];
  const SECTIONS = {
    theme: {
      label: "Theme",
      help: "Colours for the whole site. Visitors still get the sun/moon button, which switches your chosen theme between its dark and light versions. Click to preview here; Save to publish.",
      render: () => { const t = data.theme || (data.theme = { palette: "slate", accent: "red" }); return `
        <div class="section-head"><h2>Background</h2></div>
        <div class="swatches">${PALETTES.map(([k, l, db, ds, lb, ls]) => `<button type="button" class="pal-card" data-palette="${k}" aria-pressed="${(t.palette || "slate") === k}">
          <span class="pal-prev"><span style="background:${db}"><i style="background:${ds}"></i><i style="background:${ds}"></i></span><span style="background:${lb}"><i style="background:${ls}"></i><i style="background:${ls}"></i></span></span>
          <b>${l}</b></button>`).join("")}</div>
        <div class="section-head" style="margin-top:28px"><h2>Accent</h2></div>
        <div class="accents">${ACCENTS.map(([k, l, c]) => `<button type="button" class="acc" data-accent="${k}" aria-pressed="${(t.accent || "red") === k}"><i style="background:${c}"></i>${l}</button>`).join("")}</div>
        <div class="theme-demo"><span class="pill award">Award</span><span class="pill live">Live</span><a class="read-link" href="#" onclick="return false">Read the essay <span class="arr">→</span></a>
          <span class="hm-legend">Activity <i class="hm-c l1"></i><i class="hm-c l2"></i><i class="hm-c l3"></i><i class="hm-c l4"></i></span></div>`; },
      collect: () => {}
    },
    profile: {
      label: "Profile",
      help: "Your name, photo and the line under it on the home page.",
      render: () => { const p = data.profile || (data.profile = {}); return `<div data-scope="profile">
        <div class="grid3">${field(p, "name", "Name shown")}${field(p, "legalName", "Legal name")}${field(p, "cjk", "Chinese name")}</div>
        <div class="grid3">${field(p, "badge", "Badge", { hint: "Small orange tag, e.g. JHU ’30" })}${field(p, "location", "Location")}${field(p, "initials", "Initials")}</div>
        ${field(p, "tagline", "Tagline", { type: "textarea", rows: 2 })}
        ${field(p, "avatar", "Photo", { type: "file", dir: "assets/plates", accept: "image/*" })}</div>`; },
      collect: el => readInto($("[data-scope=profile]", el), data.profile)
    },
    now: {
      label: "Now",
      help: "The “Now” list on the home page. One item per line.",
      render: () => `<label class="f" for="now-lines"><span>Items</span><textarea id="now-lines" rows="8">${esc((data.profile.now || []).join("\n"))}</textarea></label>`,
      collect: el => { data.profile.now = $("#now-lines", el).value.split("\n").map(s => s.trim()).filter(Boolean); }
    },
    writings: {
      label: "Writing & events",
      help: "Essays, research, projects and appearances, in the order they appear. Featured items also show on the home page. Appearances with dates drive the “Next:” line and drop off Upcoming after the end date. Simple HTML like <em>italic</em> works in text boxes.",
      render: () => `<button class="btn go add" type="button" data-add="writings">+ Add entry</button>
        <div id="w-cards">${(data.writings || []).map((w, i) => card(w, i)).join("")}</div>`,
      collect: el => {
        data.writings = $$(".card", el).map(c => { const o = clone((data.writings || [])[+c.dataset.i] || {}); readInto(c, o); return o; });
      }
    },
    about: {
      label: "About",
      help: "Paragraphs on the About page. Leave a blank line between paragraphs. Links: <a href=\"books.html\">Books</a>.",
      render: () => `<label class="f" for="about-text"><span>Paragraphs</span><textarea id="about-text" rows="14">${esc((data.about || []).join("\n\n"))}</textarea></label>
        <label class="f" for="interests"><span>Interests</span><textarea id="interests" rows="3">${esc((data.interests || []).join(", "))}</textarea><small>Comma separated</small></label>
        <div class="section-head" style="margin-top:28px"><h2>Details</h2></div>${pairRows("facts", data.facts || [], ["Label", "Value"])}
        <div class="section-head" style="margin-top:28px"><h2>Selected record</h2></div>${pairRows("record", data.record || [], ["Year", "Achievement"])}`,
      collect: el => {
        data.about = $("#about-text", el).value.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
        data.interests = $("#interests", el).value.split(",").map(s => s.trim()).filter(Boolean);
        data.facts = readPairs(el, "facts"); data.record = readPairs(el, "record");
      }
    },
    socials: {
      label: "Socials",
      help: "Shown on the Socials page in this order. Rows without a URL are hidden. Fill “Copy text” to show a Copy button instead of Visit (used for email).",
      render: () => `<div class="rows" data-rows="socials">${(data.socials || []).map(socialRow).join("")}</div>
        <button class="btn add" type="button" data-add="socials">+ Add link</button>`,
      collect: el => {
        data.socials = $$("[data-rows=socials] .row", el).map(r => {
          const [name, handle, url, copy] = $$("input", r).map(i => i.value.trim());
          const o = { name, handle, url }; if (copy) o.copy = copy; return o;
        }).filter(s => s.name);
      }
    },
    settings: {
      label: "Settings",
      help: "Home page books, the Did-not-finish shelf, and cover fixes.",
      render: () => `<div data-scope="settings">
        ${field({ v: (data.homeBooks || []).join("\n") }, "v", "Home page books", { type: "textarea", rows: 4, prefix: "hb-", hint: "One title per line, up to four. Partial titles work (“Moby Dick”). Empty uses your four most recent favourites." })}
        ${field(data, "showDidNotFinish", "Show the Did-not-finish shelf on Books", { type: "check" })}
        ${field(data, "letterboxd", "Letterboxd profile URL")}</div>
        <div class="section-head" style="margin-top:28px"><h2>Cover fixes</h2></div>
        <p class="ed-help">If a book, film or artwork shows the wrong cover, enter its exact title and an image URL or file.</p>
        ${pairRows("overrides", Object.entries(data.posterOverrides || {}), ["Exact title", "Image URL or path"])}`,
      collect: el => {
        const hb = $("#hb-v", el).value;
        data.homeBooks = hb.split("\n").map(s => s.trim()).filter(Boolean);
        data.showDidNotFinish = $("[data-k=showDidNotFinish]", el).checked;
        const lb = $("[data-k=letterboxd]", el).value.trim(); if (lb) data.letterboxd = lb;
        data.posterOverrides = Object.fromEntries(readPairs(el, "overrides"));
      }
    }
  };

  function card(w, i) {
    const t = TYPES.find(x => x[0] === w.type);
    return `<div class="card" data-i="${i}" data-scope="w${i}">
      <div class="card-head" data-toggle><span class="chev">›</span><b>${esc(w.title || "Untitled")}</b>
        ${w.featured ? '<span class="pill award">Featured</span>' : ""}<span class="pill">${t ? t[1] : "Entry"}</span>
        <button class="icon-btn" type="button" data-move="-1" aria-label="Move up">↑</button>
        <button class="icon-btn" type="button" data-move="1" aria-label="Move down">↓</button>
        <button class="icon-btn danger" type="button" data-del aria-label="Delete">×</button></div>
      <div class="card-body">
        ${field(w, "title", "Title", { prefix: `w${i}-` })}
        <div class="grid3">${field(w, "type", "Type", { type: "select", options: TYPES, prefix: `w${i}-` })}${field(w, "award", "Award / badge", { prefix: `w${i}-`, placeholder: "e.g. 3rd Place" })}${field(w, "result", "Result line", { prefix: `w${i}-`, placeholder: "e.g. Top 1%" })}</div>
        ${field(w, "venue", "Venue", { prefix: `w${i}-`, placeholder: "Competition, publication or place" })}
        ${field(w, "claim", "Summary (always shown)", { type: "textarea", rows: 3, prefix: `w${i}-` })}
        ${field(w, "body", "More (behind the toggle)", { type: "textarea", rows: 4, prefix: `w${i}-` })}
        <div class="grid2">${field(w, "link", "Link or file", { type: "file", dir: "assets", accept: ".pdf,video/*,image/*", prefix: `w${i}-` })}${field(w, "linkText", "Link text", { prefix: `w${i}-`, placeholder: "Read the essay" })}</div>
        ${field(w, "cover", "Cover image", { type: "file", dir: "assets/plates", accept: "image/*", prefix: `w${i}-` })}
        <div class="grid3">${field(w, "start", "Start date", { type: "date", prefix: `w${i}-` })}${field(w, "end", "End date", { type: "date", prefix: `w${i}-` })}${field(w, "place", "Place (short)", { prefix: `w${i}-`, placeholder: "Madrid" })}</div>
        ${field(w, "featured", "Feature on the home page", { type: "check" })}
      </div></div>`;
  }
  function socialRow(s) {
    return `<div class="row three"><input value="${esc(s.name)}" placeholder="Name" aria-label="Name"><input value="${esc(s.handle)}" placeholder="Handle" aria-label="Handle"><input value="${esc(s.url)}" placeholder="https://…" aria-label="URL">
      <input value="${esc(s.copy || "")}" placeholder="Copy text (optional)" aria-label="Copy text">
      <button class="icon-btn" type="button" data-rowmove="-1" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-rowmove="1" aria-label="Move down">↓</button><button class="icon-btn danger" type="button" data-rowdel aria-label="Remove">×</button></div>`;
  }
  function pairRows(name, pairs, [a, b]) {
    const row = ([x, y] = ["", ""]) => `<div class="row"><input value="${esc(x)}" placeholder="${a}" aria-label="${a}"><input value="${esc(y)}" placeholder="${b}" aria-label="${b}">
      <button class="icon-btn" type="button" data-rowmove="-1" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-rowmove="1" aria-label="Move down">↓</button><button class="icon-btn danger" type="button" data-rowdel aria-label="Remove">×</button></div>`;
    return `<div class="rows" data-rows="${name}">${pairs.map(row).join("")}</div><button class="btn add" type="button" data-addrow="${name}">+ Add row</button>
      <template id="tpl-${name}">${row()}</template>`;
  }
  const readPairs = (el, name) => $$(`[data-rows=${name}] .row`, el).map(r => $$("input", r).slice(0, 2).map(i => i.value.trim())).filter(([x, y]) => x || y);

  /* ---------- render & events ---------- */
  function collect() { const el = $("#main"); if (SECTIONS[section] && el.firstChild) SECTIONS[section].collect(el); }
  function render() {
    $("#nav").innerHTML = Object.entries(SECTIONS).map(([k, s]) => `<button type="button" data-sec="${k}" aria-current="${k === section}">${s.label}</button>`).join("");
    const s = SECTIONS[section];
    $("#main").innerHTML = `<h1>${s.label}</h1><p class="ed-help">${esc(s.help)}</p>
      ${!window.showDirectoryPicker ? '<div class="notice">This browser can’t save into folders. Edit here, then use Download content.js and replace data/content.js with it. Chrome or Edge can save directly.</div>' : ""}
      ${s.render()}
      <div class="ed-tools"><p><b>Books, films, art and the vault graph</b> come from your exports and vault, not this editor. In the portfolio folder run:</p>
        <p><code>python tools/import-reading.py goodreads_library_export.csv films</code><br><code>python tools/import-art.py C:/Users/samca/Commonplace</code><br><code>powershell -File tools/update-site.ps1</code> (art + graph, then publishes)</p></div>`;
  }
  document.addEventListener("click", e => {
    const t = e.target;
    const sec = t.closest("[data-sec]");
    if (sec) { collect(); section = sec.dataset.sec; render(); scrollTo({ top: 0 }); return; }
    if (t.closest("#connect")) { onConnect(); return; }
    if (t.closest("#save")) { save(); return; }
    if (t.closest("#download")) { download(); return; }

    const pc = t.closest(".pal-card"), ac = t.closest(".acc");
    if (pc || ac) {
      data.theme = data.theme || {};
      if (pc) data.theme.palette = pc.dataset.palette; else data.theme.accent = ac.dataset.accent;
      $$(pc ? ".pal-card" : ".acc").forEach(b => b.setAttribute("aria-pressed", b === (pc || ac)));
      applyTheme(); markDirty(); return;
    }
    if (t.closest("#mode")) {
      const root = document.documentElement;
      if (root.dataset.theme === "light") delete root.dataset.theme; else root.dataset.theme = "light";
      $("#mode").textContent = root.dataset.theme === "light" ? "Preview dark" : "Preview light"; return;
    }

    /* writing cards */
    const cardEl = t.closest(".card");
    if (t.closest("[data-add=writings]")) {
      collect(); (data.writings = data.writings || []).unshift({ title: "New entry", type: "essay", venue: "", claim: "" });
      render(); const c = $(".card"); c.classList.add("open", "new"); $("input[data-k=title]", c).select(); markDirty(); return;
    }
    if (cardEl && t.closest("[data-move]")) {
      collect(); const i = +cardEl.dataset.i, j = i + +t.closest("[data-move]").dataset.move;
      if (j < 0 || j >= data.writings.length) return;
      [data.writings[i], data.writings[j]] = [data.writings[j], data.writings[i]];
      render(); $$(".card")[j].classList.add("new"); markDirty(); return;
    }
    if (cardEl && t.closest("[data-del]")) {
      const btn = t.closest("[data-del]");
      if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Sure?"; btn.style.width = "auto"; btn.style.padding = "0 8px"; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "×"; btn.style = ""; } }, 2500); return; }
      collect(); data.writings.splice(+cardEl.dataset.i, 1); render(); markDirty(); toast("Entry removed"); return;
    }
    if (cardEl && t.closest("[data-toggle]") && !t.closest("button")) { cardEl.classList.toggle("open"); return; }

    /* row lists */
    const row = t.closest(".row");
    if (row && t.closest("[data-rowdel]")) { row.remove(); markDirty(); return; }
    if (row && t.closest("[data-rowmove]")) {
      const d = +t.closest("[data-rowmove]").dataset.rowmove;
      if (d < 0 && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (d > 0 && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
      markDirty(); return;
    }
    if (t.closest("[data-addrow]")) {
      const n = t.closest("[data-addrow]").dataset.addrow;
      $(`[data-rows=${n}]`).insertAdjacentHTML("beforeend", $(`#tpl-${n}`).innerHTML);
      $(`[data-rows=${n}] .row:last-child input`).focus(); markDirty(); return;
    }
    if (t.closest("[data-add=socials]")) {
      $("[data-rows=socials]").insertAdjacentHTML("beforeend", socialRow({ name: "", handle: "", url: "" }));
      $("[data-rows=socials] .row:last-child input").focus(); markDirty(); return;
    }
  });
  document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); save(); } });

  if (!data.theme) data.theme = { palette: document.documentElement.dataset.palette || "slate", accent: document.documentElement.dataset.accent || "red" };
  render();
  reconnect();
  if (!window.SITE) toast("Couldn’t load data/content.js. Open this page from inside the portfolio folder.");
})();
