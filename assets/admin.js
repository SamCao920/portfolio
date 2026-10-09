/* admin.js: a small local editor for data/content.js, data/books.js and data/films.js.
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
  const MANAGED = ["theme", "analytics", "studio", "profile", "about", "interests", "facts", "record", "writings", "socials", "homeBooks", "showDidNotFinish", "posterOverrides"];
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
      if (sandbox.SITE && !dirty) { data = sandbox.SITE; loadedStamp = f.lastModified; applyTheme(); if (data.theme && data.theme.fonts) applyFonts(data.theme.fonts); render(); }
    } catch (e) { toast("Could not read data/content.js: " + e.message); }
    let fresh = false;
    for (const n of ["books", "films"]) {
      if (logState[n].dirty) continue;
      try { const r = await readLog(n); if (r.val) { setLog(n, r.val); logState[n].stamp = r.stamp; fresh = true; } }
      catch (e) { toast(`Could not read data/${n}.js: ${e.message}`); }
    }
    if (fresh && LOG_SECTIONS[section]) render();
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
      for (const n of ["books", "films"]) {
        const st = logState[n]; if (!st.dirty) continue;
        const d = await readLog(n).catch(() => null);
        if (d && st.stamp && d.stamp > st.stamp && !st.armed) { st.armed = true; toast(`${n}.js changed on disk since you opened the editor. Click Save again to overwrite it, or reload.`); return; }
      }
      staleArmed = false;
      /* keep every section this editor doesn't manage exactly as it is on disk */
      const merged = { ...disk.site };
      MANAGED.forEach(k => { if (k in data) merged[k] = data[k]; else delete merged[k]; });
      data = { ...merged };
      for (const p of pendingFiles.splice(0)) await writeFile(p.path, p.file);
      await writeFile("data/content.js", new Blob([serialise()], { type: "text/javascript" }));
      await writeFile("data/theme.js", new Blob([themeJs(data.theme || {})], { type: "text/javascript" }));
      if (logState.books.dirty) await writeFile("data/books.js", new Blob([booksJs()], { type: "text/javascript" }));
      if (logState.films.dirty) await writeFile("data/films.js", new Blob([filmsJs()], { type: "text/javascript" }));
      for (const n of ["books", "films"]) { const st = logState[n]; if (st.dirty) { st.dirty = st.armed = false; st.stamp = (await readLog(n)).stamp; } }
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
    [["books", booksJs], ["films", filmsJs]].forEach(([n, fn]) => {
      if (!logState[n].dirty) return;
      const b = document.createElement("a"); b.href = URL.createObjectURL(new Blob([fn()], { type: "text/javascript" }));
      b.download = n + ".js"; b.click(); setTimeout(() => URL.revokeObjectURL(b.href), 1000);
    });
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
  document.addEventListener("change", e => {
    const sel = e.target.closest("select[data-font]");
    if (!sel) return;
    data.theme = data.theme || {}; data.theme.fonts = { ...DEFAULT_FONTS, ...(data.theme.fonts || {}), [sel.dataset.font]: sel.value };
    applyFonts(data.theme.fonts);
  });
  const edits = t => t.closest(".ed-main") && !t.closest("[data-nodirty]");
  document.addEventListener("input", e => { if (edits(e.target)) markDirty(); });
  document.addEventListener("change", e => { if (edits(e.target)) markDirty(); });

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
  /* fonts: [name, Google Fonts query, CSS stack, weight, description] */
  const FONTS = {"display": [["Hanken Grotesk", "Hanken+Grotesk:wght@400;600;700", "\"Hanken Grotesk\", \"Helvetica Neue\", Arial, sans-serif", 700, "Clean grotesk (current)"], ["Fraunces", "Fraunces:opsz,wght@9..144,600;9..144,700", "Fraunces, Georgia, serif", 650, "Soft, characterful serif"], ["Instrument Serif", "Instrument+Serif", "\"Instrument Serif\", Georgia, serif", 400, "Tall, elegant editorial serif"], ["DM Serif Display", "DM+Serif+Display", "\"DM Serif Display\", Georgia, serif", 400, "High-contrast display serif"], ["Cormorant Garamond", "Cormorant+Garamond:wght@600;700", "\"Cormorant Garamond\", Garamond, serif", 700, "Classical Garamond"], ["Newsreader", "Newsreader:opsz,wght@6..72,600;6..72,700", "Newsreader, Georgia, serif", 650, "Newspaper serif"], ["Bricolage Grotesque", "Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800", "\"Bricolage Grotesque\", Arial, sans-serif", 700, "Quirky grotesk with ink traps"], ["Syne", "Syne:wght@600;700;800", "Syne, Arial, sans-serif", 700, "Wide, art-gallery sans"], ["Unbounded", "Unbounded:wght@500;600", "Unbounded, Arial, sans-serif", 600, "Rounded, wide, modern"]], "body": [["Hanken Grotesk", "Hanken+Grotesk:wght@400;600;700", "\"Hanken Grotesk\", \"Helvetica Neue\", Arial, sans-serif", 400, "Clean grotesk (current)"], ["DM Sans", "DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700", "\"DM Sans\", Arial, sans-serif", 400, "Geometric, friendly"], ["Manrope", "Manrope:wght@400;600;700", "Manrope, Arial, sans-serif", 400, "Modern, slightly technical"], ["IBM Plex Sans", "IBM+Plex+Sans:wght@400;600;700", "\"IBM Plex Sans\", Arial, sans-serif", 400, "Engineered, distinctive"], ["Figtree", "Figtree:wght@400;600;700", "Figtree, Arial, sans-serif", 400, "Warm and open"], ["Newsreader", "Newsreader:opsz,wght@6..72,400;6..72,600;6..72,700", "Newsreader, Georgia, serif", 400, "Serif body, bookish"], ["Literata", "Literata:opsz,wght@7..72,400;7..72,600;7..72,700", "Literata, Georgia, serif", 400, "Serif made for long reading"]], "cjk": [["Noto Serif SC", "Noto+Serif+SC:wght@600", "\"Noto Serif SC\", \"Songti SC\", SimSun, serif", 600, "宋体 Song serif"], ["ZCOOL XiaoWei", "ZCOOL+XiaoWei", "\"ZCOOL XiaoWei\", \"Noto Serif SC\", serif", 400, "Refined, slightly calligraphic serif"], ["Ma Shan Zheng", "Ma+Shan+Zheng", "\"Ma Shan Zheng\", \"Noto Serif SC\", serif", 400, "楷书 brush, regular script"], ["Zhi Mang Xing", "Zhi+Mang+Xing", "\"Zhi Mang Xing\", \"Noto Serif SC\", serif", 400, "行书 brush, running script"], ["Long Cang", "Long+Cang", "\"Long Cang\", \"Noto Serif SC\", serif", 400, "Loose handwritten brush"], ["Noto Sans SC", "Noto+Sans+SC:wght@500", "\"Noto Sans SC\", \"PingFang SC\", sans-serif", 500, "黑体 sans (not recommended)"]]};
  const DEFAULT_FONTS = { display: "Hanken Grotesk", body: "Hanken Grotesk", cjk: "Noto Serif SC" };
  const fontRow = (role, name) => FONTS[role].find(f => f[0] === name) || FONTS[role][0];
  const fontSpec = fonts => { const o = {}; ["display", "body", "cjk"].forEach(r => { const f = fontRow(r, (fonts || {})[r] || DEFAULT_FONTS[r]); o[r] = { q: f[1], s: f[2], w: f[3] }; }); return o; };
  function applyFonts(fonts) {
    const f = fontSpec(fonts), d = document.documentElement;
    const fam = [f.display.q, f.body.q, f.cjk.q, "Source+Serif+4:ital,opsz,wght@0,8..60,700;1,8..60,400"].filter((v, i, a) => a.indexOf(v) === i);
    let l = document.getElementById("site-fonts");
    if (!l) { l = document.createElement("link"); l.rel = "stylesheet"; l.id = "site-fonts"; document.head.appendChild(l); }
    l.href = "https://fonts.googleapis.com/css2?family=" + fam.join("&family=") + "&display=swap";
    d.style.setProperty("--display", f.display.s); d.style.setProperty("--dw", f.display.w);
    d.style.setProperty("--body", f.body.s); d.style.setProperty("--cjk", f.cjk.s); d.style.setProperty("--cjkw", f.cjk.w);
  }
  function themeJs(th) {
    const f = fontSpec(th.fonts);
    return `/* Site theme: colours and fonts. Written by admin.html (Theme). Loaded in <head> so nothing flashes. */
(function () {
  var d = document.documentElement;
  d.dataset.palette = ${JSON.stringify(th.palette || "slate")};
  d.dataset.accent = ${JSON.stringify(th.accent || "red")};
  var f = ${JSON.stringify(f)};
  var fam = [f.display.q, f.body.q, f.cjk.q, "Source+Serif+4:ital,opsz,wght@0,8..60,700;1,8..60,400"].filter(function (v, i, a) { return a.indexOf(v) === i; });
  var l = document.createElement("link"); l.rel = "stylesheet"; l.id = "site-fonts";
  l.href = "https://fonts.googleapis.com/css2?family=" + fam.join("&family=") + "&display=swap";
  document.head.appendChild(l);
  d.style.setProperty("--display", f.display.s); d.style.setProperty("--dw", f.display.w);
  d.style.setProperty("--body", f.body.s);
  d.style.setProperty("--cjk", f.cjk.s); d.style.setProperty("--cjkw", f.cjk.w);
})();
`;
  }
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
        <div class="section-head" style="margin-top:28px"><h2>Fonts</h2></div>
        <div class="grid3">${[["display", "Titles and your name"], ["body", "Body text"], ["cjk", "Chinese"]].map(([r, l]) => `<label class="f" for="font-${r}"><span>${l}</span>
          <select id="font-${r}" data-font="${r}">${FONTS[r].map(f => `<option value="${esc(f[0])}" ${((t.fonts || {})[r] || DEFAULT_FONTS[r]) === f[0] ? "selected" : ""}>${esc(f[0])}: ${esc(f[4])}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="font-demo"><p class="fd-name">Sam Cao <span class="fd-cjk">曹方源</span></p><p class="fd-title">Programmable Money and the Abolition of Visible Failure</p>
          <p class="fd-body">Interventions have always failed in public, and that is what forced governments to retreat. Money that blocks the act before it happens leaves no failure to see.</p></div>
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
        <div class="grid2">${field(p, "avatar", "Home page photo", { type: "file", dir: "assets/plates", accept: "image/*" })}${field(p, "aboutPhoto", "About page photo", { type: "file", dir: "assets/plates", accept: "image/*", hint: "Empty uses the home page photo." })}</div></div>`; },
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
    studio: {
      label: "Studio",
      help: "Your own artwork on the Studio page, in this order. Type sets the filter (Drawing, Painting or Photography) and the frame in the 3D view: gold for paintings, walnut and mat for drawings, black gallery frame for photographs. Attach an image with Choose file; it is copied into assets/studio/ on Save.",
      render: () => { const st = data.studio || (data.studio = { intro: "", items: [] }); return `
        <label class="f" for="studio-intro"><span>Intro</span><textarea id="studio-intro" rows="3">${esc(st.intro || "")}</textarea></label>
        <button class="btn go add" type="button" data-add="studio">+ Add work</button>
        <div>${(st.items || []).map((w, i) => scard(w, i)).join("")}</div>`; },
      collect: el => {
        const st = data.studio || (data.studio = { items: [] });
        st.intro = $("#studio-intro", el).value.trim();
        st.items = $$(".card", el).map(c => { const o = clone((st.items || [])[+c.dataset.i] || {}); readInto(c, o); return o; });
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
        ${field(data.analytics || {}, "goatcounter", "Visitor counts (GoatCounter code)", { prefix: "gc-", placeholder: "e.g. samcao", hint: "Sign up free at goatcounter.com, pick a code, and enter it here. Counts appear at https://YOURCODE.goatcounter.com. Leave empty to turn counting off." })}</div>
        <div class="section-head" style="margin-top:28px"><h2>Cover fixes</h2></div>
        <p class="ed-help">If a book, film or artwork shows the wrong cover, enter its exact title and an image URL or file.</p>
        ${pairRows("overrides", Object.entries(data.posterOverrides || {}), ["Exact title", "Image URL or path"])}`,
      collect: el => {
        const hb = $("#hb-v", el).value;
        data.homeBooks = hb.split("\n").map(s => s.trim()).filter(Boolean);
        data.showDidNotFinish = $("[data-k=showDidNotFinish]", el).checked;
        const gc = $("#gc-goatcounter", el).value.trim();
        data.analytics = { ...(data.analytics || {}), goatcounter: gc.replace(/^https?:\/\//, "").replace(/\.goatcounter\.com.*$/, "") };
        data.posterOverrides = Object.fromEntries(readPairs(el, "overrides"));
      }
    }
  };


  /* ---------- reading & watching logs: data/books.js and data/films.js ---------- */
  let books = clone(window.BOOKS || {}); books.items = books.items || [];
  let films = clone(window.FILMS || {}); ["items", "diary", "lists", "watchlist", "favorites"].forEach(k => { films[k] = films[k] || []; });
  const logState = { books: { dirty: false, stamp: 0, armed: false }, films: { dirty: false, stamp: 0, armed: false } };
  const today = () => new Date().toLocaleDateString("en-CA");
  const norm = s => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const starTxt = r => r == null || r === "" ? "" : "★".repeat(Math.floor(+r)) + (+r % 1 ? "½" : "");
  const SHELVES = [["read", "Read"], ["reading", "Reading"], ["to-read", "Want to read"], ["dnf", "Did not finish"]];
  const BOOK_R = [["", "No rating"], ...[1, 2, 3, 4, 5].map(n => [String(n), starTxt(n)])];
  const FILM_R = [["", "No rating"], ...Array.from({ length: 10 }, (_, k) => (k + 1) / 2).map(n => [String(n), starTxt(n)])];
  let bookForm = { mode: "add", v: { shelf: "read", read: today() } };
  let filmForm = { mode: "log", v: { date: today() } };
  let watchForm = {};

  async function readLog(n) {
    const f = await (await (await dir.getDirectoryHandle("data")).getFileHandle(n + ".js")).getFile();
    const box = {}; new Function("window", await f.text())(box);
    return { val: box[n.toUpperCase()], stamp: f.lastModified };
  }
  function setLog(n, v) {
    if (n === "books") { books = v; books.items = books.items || []; }
    else { films = v; ["items", "diary", "lists", "watchlist", "favorites"].forEach(k => { films[k] = films[k] || []; }); }
  }
  function markLog(n) { logState[n].dirty = true; markDirty(); }
  /* one array element per line, so git diffs stay readable */
  function logJs(n, obj, keys, note) {
    obj.updated = today();
    const o = { ...obj }, parts = {};
    keys.forEach(k => { parts[k] = "[\n" + (o[k] || []).map(x => "  " + JSON.stringify(x)).join(",\n") + "\n]"; o[k] = "@@" + k + "@@"; });
    let s = JSON.stringify(o);
    keys.forEach(k => { s = s.replace(JSON.stringify("@@" + k + "@@"), () => parts[k]); });
    return `/* ${note}\n   Edit it with admin.html. It must stay valid JavaScript. */\nwindow.${n.toUpperCase()} = ${s};\n`;
  }
  const booksJs = () => logJs("books", books, ["items"], "Books: what I have read, am reading and want to read.");
  const filmsJs = () => logJs("films", films, ["items", "diary", "watchlist"], "Films: everything I have seen, a dated diary, ranked lists and a watchlist.");

  /* ----- Reading ----- */
  const bookVals = b => ({ full: b.full || b.t, a: b.a || "", shelf: b.shelf || "read", read: b.read || "", added: b.added || "", r: b.r == null ? "" : String(b.r),
    fav: !!b.fav, pages: b.pages ? String(b.pages) : "", year: b.year ? String(b.year) : "", isbn: b.isbn || "", review: b.review || "" });
  function bookFormHtml() {
    const f = bookForm, v = f.v, editing = f.mode === "edit", p = { prefix: "bk-" };
    return `<div class="logform" id="bk-form">
      <h2>${editing ? "Edit book" : "Log a book"}</h2>
      <div class="grid2">${field(v, "full", "Title", { ...p, placeholder: "Start typing; existing books are suggested" }).replace("<input ", '<input list="bk-titles" autocomplete="off" ')}${field(v, "a", "Author", p)}</div>
      <div class="grid3">${field(v, "shelf", "Status", { ...p, type: "select", options: SHELVES })}${field(v, "read", "Date finished", { ...p, type: "date", hint: "For Read and Did not finish." })}${field(v, "r", "Rating", { ...p, type: "select", options: BOOK_R })}</div>
      <div class="grid3">${field(v, "pages", "Pages", p)}${field(v, "year", "Year published", p)}${field(v, "isbn", "ISBN", { ...p, hint: "Used to find the cover." })}</div>
      ${field(v, "review", "Review", { ...p, type: "textarea", rows: 3 })}
      <div class="grid3">${field(v, "added", "Date added", { ...p, type: "date", hint: "Empty means today." })}<div>${field(v, "fav", "Favorite", { type: "check" })}</div></div>
      <div class="logbtns">${editing ? `<button class="btn go" type="button" data-act="bk-save">Update book</button><button class="btn" type="button" data-act="bk-cancel">Cancel</button><button class="btn danger-btn" type="button" data-act="bk-del">Delete</button>`
        : `<button class="btn go" type="button" data-act="bk-save">Add to library</button>`}</div>
      <datalist id="bk-titles">${books.items.map(b => `<option value="${esc(b.full || b.t)}">${esc(b.a || "")}</option>`).join("")}</datalist></div>`;
  }
  function bookRows() {
    const q = norm(($("#bk-q") || {}).value), sh = ($("#bk-shelf") || {}).value || "all";
    const L = books.items.map((b, i) => [b, i]).filter(([b]) => (sh === "all" || b.shelf === sh) && (!q || norm(`${b.full || b.t} ${b.a}`).includes(q)))
      .sort(([a], [b]) => String(b.read || b.added || "").localeCompare(String(a.read || a.added || "")));
    const lab = s => (SHELVES.find(x => x[0] === s) || ["", s])[1];
    return (L.slice(0, 100).map(([b, i]) => `<li><button type="button" class="lrow" data-act="bk-edit" data-i="${i}"><b>${esc(b.full || b.t)}</b><span>${esc(b.a || "")}</span>
      <span class="pill">${esc(lab(b.shelf))}</span><span class="lr-stars">${starTxt(b.r)}${b.fav ? " ♥" : ""}</span><span class="lr-date">${esc(b.read || b.added || "")}</span></button></li>`).join("")
      || '<li class="lempty">Nothing matches.</li>') + (L.length > 100 ? `<li class="lempty">Showing 100 of ${L.length}. Search to narrow.</li>` : "");
  }
  function commitBook(v) {
    if (!v.full) { toast("Give the book a title."); return; }
    let b = bookForm.mode === "edit" ? books.items[bookForm.i] : null, msg = "Updated " + v.full;
    if (!b) {
      const hit = books.items.find(x => norm(x.full || x.t) === norm(v.full) && (!v.a || !x.a || norm(x.a) === norm(v.a)));
      if (hit) b = hit;
      else { b = { t: "", full: "", a: "", isbn: null, r: null, read: null, added: today(), shelf: "read", fav: false, review: null, pages: null, year: null }; books.items.unshift(b); msg = "Added " + v.full; }
    }
    if (norm(b.full || b.t) !== norm(v.full)) b.t = v.full.split(/:\s/)[0].trim();
    b.full = v.full; b.a = v.a || "";
    b.shelf = v.shelf || "read";
    b.read = ["read", "dnf"].includes(b.shelf) ? (v.read || null) : null;
    b.added = v.added || b.added || today();
    b.r = v.r ? +v.r : null; b.fav = !!v.fav; b.review = v.review || null;
    b.pages = +v.pages || null; b.year = v.year || null; b.isbn = (v.isbn || "").replace(/[^\dXx]/g, "") || null;
    bookForm = { mode: "add", v: { shelf: "read", read: today() } };
    markLog("books"); render(); toast(msg);
  }

  /* ----- Watching ----- */
  const filmLabel = f => `${f.t}${f.y ? ` (${f.y})` : ""}`;
  const findFilm = (t, y) => films.items.findIndex(f => norm(f.t) === norm(t) && (!y || !f.y || f.y === +y));
  const isHidden = (t, y) => (data.hiddenFilms || []).some(h => norm(h) === norm(`${t} (${y})`));
  function filmFormHtml() {
    const f = filmForm, v = f.v, p = { prefix: "fm-" };
    if (f.mode === "film") return `<div class="logform" id="fm-form"><h2>Edit film</h2>
      <div class="grid3">${field(v, "t", "Title", p)}${field(v, "y", "Year", p)}${field(v, "r", "Rating", { ...p, type: "select", options: FILM_R })}</div>
      <div class="grid3">${field(v, "added", "Date added", { ...p, type: "date" })}<div>${field(v, "liked", "Liked ♥", { type: "check" })}</div></div>
      <p class="ed-help">${plural(films.diary.filter(d => d.f === f.i).length, "diary entry", "diary entries")}. Deleting the film also removes them and takes it off your lists and favorites.</p>
      <div class="logbtns"><button class="btn go" type="button" data-act="fm-save">Update film</button><button class="btn" type="button" data-act="fm-cancel">Cancel</button><button class="btn danger-btn" type="button" data-act="fm-del">Delete film</button></div></div>`;
    const diary = f.mode === "diary";
    return `<div class="logform" id="fm-form"><h2>${diary ? "Edit diary entry" : "Log a film"}</h2>
      <div class="grid3">${field(v, "t", "Title", { ...p, placeholder: "Start typing; films you’ve seen are suggested" }).replace("<input ", `<input list="fm-titles" autocomplete="off" ${diary ? "readonly " : ""}`)}${field(v, "y", "Year", { ...p, placeholder: "1957" }).replace("<input ", diary ? "<input readonly " : "<input ")}${field(v, "date", "Date watched", { ...p, type: "date" })}</div>
      <div class="grid3">${field(v, "r", "Rating", { ...p, type: "select", options: FILM_R })}<div>${field(v, "liked", "Liked ♥", { type: "check" })}</div><div>${field(v, "rewatch", "Rewatch", { type: "check" })}</div></div>
      ${field(v, "review", "Review", { ...p, type: "textarea", rows: 3 })}
      <div class="logbtns">${diary ? `<button class="btn go" type="button" data-act="fm-save">Update entry</button><button class="btn" type="button" data-act="fm-cancel">Cancel</button><button class="btn danger-btn" type="button" data-act="fm-del">Delete entry</button>`
        : `<button class="btn go" type="button" data-act="fm-save">Log it</button>`}</div>
      <datalist id="fm-titles">${films.items.map(x => `<option value="${esc(filmLabel(x))}"></option>`).join("")}</datalist></div>`;
  }
  function commitFilm(v) {
    const f = filmForm;
    if (!v.t) { toast("Give the film a title."); return; }
    const y = v.y ? +v.y || null : null;
    if (f.mode === "film") {
      const it = films.items[f.i];
      Object.assign(it, { t: v.t, y, r: v.r ? +v.r : null, liked: !!v.liked, added: v.added || it.added });
      toast("Updated " + v.t);
    } else if (f.mode === "diary") {
      const d = films.diary[f.i], it = films.items[d.f];
      Object.assign(d, { date: v.date || d.date, r: v.r ? +v.r : null, rewatch: !!v.rewatch, review: v.review || null });
      it.liked = !!v.liked; if (v.r) it.r = +v.r;
      toast("Updated entry");
    } else {
      let fi = findFilm(v.t, y);
      if (fi < 0) { films.items.push({ t: v.t, y, r: null, liked: false, added: today() }); fi = films.items.length - 1; }
      const it = films.items[fi];
      if (v.r) it.r = +v.r;
      it.liked = !!v.liked;
      if (y && !it.y) it.y = y;
      films.diary.unshift({ f: fi, date: v.date || today(), r: v.r ? +v.r : null, rewatch: !!v.rewatch, review: v.review || null });
      films.watchlist = films.watchlist.filter(w => !(norm(w.t) === norm(it.t) && (!w.y || !it.y || w.y === it.y)));
      toast(isHidden(it.t, it.y) ? `Logged, but ${it.t} is on your hidden-films list, so the site won’t show it.` : "Logged " + it.t);
    }
    films.diary.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    filmForm = { mode: "log", v: { date: today() } };
    markLog("films"); render();
  }
  function deleteFilm(fi) {
    const m = i => i > fi ? i - 1 : i;
    films.items.splice(fi, 1);
    films.diary = films.diary.filter(d => d.f !== fi).map(d => ({ ...d, f: m(d.f) }));
    films.lists.forEach(l => { l.items = (l.items || []).filter(x => x.f !== fi).map(x => ({ ...x, f: m(x.f) })); });
    films.favorites = films.favorites.filter(i => i !== fi).map(m);
  }
  function filmRows() {
    const q = norm(($("#fm-q") || {}).value), mode = ($("#fm-show") || {}).value || "diary";
    if (mode === "films") {
      const L = films.items.map((f, i) => [f, i]).filter(([f]) => !q || norm(filmLabel(f)).includes(q)).reverse();
      return L.slice(0, 100).map(([f, i]) => `<li><button type="button" class="lrow f4" data-act="fm-edit" data-i="${i}"><b>${esc(f.t)}</b><span>${esc(f.y || "")}</span>
        <span class="lr-stars">${starTxt(f.r)}${f.liked ? " ♥" : ""}</span><span class="lr-date">${esc(f.added || "")}</span></button></li>`).join("") || '<li class="lempty">Nothing matches.</li>';
    }
    const L = films.diary.map((d, i) => [d, i, films.items[d.f] || { t: "?" }]).filter(([, , f]) => !q || norm(filmLabel(f)).includes(q));
    return (L.slice(0, 100).map(([d, i, f]) => `<li><button type="button" class="lrow f4" data-act="fm-diary" data-i="${i}"><b>${esc(f.t)}</b><span>${esc(f.y || "")}</span>
      <span class="lr-stars">${starTxt(d.r)}${d.rewatch ? " ↻" : ""}${d.review ? " ✎" : ""}</span><span class="lr-date">${esc(d.date)}</span></button></li>`).join("") || '<li class="lempty">Nothing matches.</li>')
      + (L.length > 100 ? `<li class="lempty">Showing 100 of ${L.length}. Search to narrow.</li>` : "");
  }
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + "s"}`;

  const LOG_SECTIONS = {
    reading: {
      label: "Reading",
      help: "Log books here; this is now where the Books page gets its data. Pick an existing title from the suggestions to update it (for example, move it from Want to read to Read). Save writes data/books.js.",
      render: () => {
        const reading = books.items.map((b, i) => [b, i]).filter(([b]) => b.shelf === "reading");
        return `<div data-nodirty>${bookFormHtml()}
        ${reading.length ? `<div class="section-head" style="margin-top:26px"><h2>Currently reading</h2></div><ul class="chips">${reading.map(([b, i]) =>
          `<li><span>${esc(b.full || b.t)}</span><button class="btn" type="button" data-act="bk-finish" data-i="${i}">Finished</button></li>`).join("")}</ul>` : ""}
        <div class="section-head" style="margin-top:26px"><h2>Library</h2></div>
        <div class="lfilter"><input type="search" id="bk-q" placeholder="Search ${books.items.length} books" aria-label="Search books">
          <select id="bk-shelf" aria-label="Status"><option value="all">All</option>${SHELVES.map(([k, l]) => `<option value="${k}">${l} (${books.items.filter(b => b.shelf === k).length})</option>`).join("")}</select></div>
        <ul class="llist" id="bk-list">${bookRows()}</ul></div>`;
      },
      collect: el => { const fm = $("#bk-form", el); if (fm) { const v = {}; readInto(fm, v); bookForm.v = v; } }
    },
    watching: {
      label: "Watching",
      help: "Log films here; this is now where the Films page gets its data. Logging adds a diary entry, adds the film if it’s new, updates its rating and takes it off your watchlist. Ranked lists are kept as they are. Save writes data/films.js.",
      render: () => {
        const opts = films.items.map((f, i) => [f, i]).sort(([a], [b]) => a.t.localeCompare(b.t));
        return `<div data-nodirty>${filmFormHtml()}
        <div class="section-head" style="margin-top:26px"><h2>Favorite films</h2></div>
        <div class="grid2 favs">${[0, 1, 2, 3].map(k => `<label class="f"><span>Favorite ${k + 1}</span><select data-fav="${k}"><option value="">None</option>${opts.map(([f, i]) =>
          `<option value="${i}" ${films.favorites[k] === i ? "selected" : ""}>${esc(filmLabel(f))}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="section-head" style="margin-top:26px"><h2>Watchlist</h2></div>
        <div class="lfilter" id="wl-form"><input type="text" data-wl="t" placeholder="Title" aria-label="Watchlist title" value="${esc(watchForm.t || "")}"><input type="text" data-wl="y" placeholder="Year" aria-label="Year" class="short" value="${esc(watchForm.y || "")}">
          <button class="btn" type="button" data-act="wl-add">+ Add</button></div>
        <ul class="llist">${films.watchlist.map((w, i) => `<li class="lrow static"><b>${esc(w.t)}</b><span>${esc(w.y || "")}</span><span class="lr-date">${esc(w.added || "")}</span>
          <span class="lr-acts"><button class="btn" type="button" data-act="wl-watched" data-i="${i}">Watched</button><button class="icon-btn danger" type="button" data-act="wl-del" data-i="${i}" aria-label="Remove">×</button></span></li>`).join("") || '<li class="lempty">Empty.</li>'}</ul>
        <div class="section-head" style="margin-top:26px"><h2>History</h2></div>
        <div class="lfilter"><input type="search" id="fm-q" placeholder="Search" aria-label="Search films">
          <select id="fm-show" aria-label="Show"><option value="diary">Diary (${films.diary.length})</option><option value="films">Films (${films.items.length})</option></select></div>
        <ul class="llist" id="fm-list">${filmRows()}</ul></div>`;
      },
      collect: el => {
        const fm = $("#fm-form", el); if (fm) { const v = {}; readInto(fm, v); filmForm.v = v; }
        $$("[data-wl]", el).forEach(i => { watchForm[i.dataset.wl] = i.value; });
      }
    }
  };

  document.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "bk-q") { $("#bk-list").innerHTML = bookRows(); return; }
    if (t.id === "fm-q") { $("#fm-list").innerHTML = filmRows(); return; }
    if (t.matches("#bk-form [data-k=full]") && bookForm.mode === "add") {
      const i = books.items.findIndex(b => (b.full || b.t) === t.value);
      if (i >= 0) { bookForm = { mode: "edit", i, v: bookVals(books.items[i]) }; $("#bk-form").outerHTML = bookFormHtml(); toast("Editing your existing entry"); }
      return;
    }
    if (t.matches("#fm-form [data-k=t]") && filmForm.mode === "log") {
      const it = films.items.find(f => filmLabel(f) === t.value);
      if (it) { t.value = it.t; $("#fm-form [data-k=y]").value = it.y || ""; $("#fm-form [data-k=liked]").checked = !!it.liked; $("#fm-form [data-k=rewatch]").checked = true; }
    }
  });
  document.addEventListener("change", e => {
    const t = e.target;
    if (t.id === "bk-shelf") { $("#bk-list").innerHTML = bookRows(); return; }
    if (t.id === "fm-show") { $("#fm-list").innerHTML = filmRows(); return; }
    if (t.matches("[data-fav]")) {
      const sel = $$("[data-fav]").map(s => s.value).filter(Boolean).map(Number);
      films.favorites = sel.filter((v, i) => sel.indexOf(v) === i); markLog("films");
    }
  });
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-act]"); if (!a) return;
    const act = a.dataset.act, i = +a.dataset.i, el = $("#main");
    const armed = () => { if (a.dataset.armed) return true; a.dataset.armed = "1"; const o = a.textContent; a.textContent = "Sure?"; setTimeout(() => { if (a.isConnected) { delete a.dataset.armed; a.textContent = o; } }, 2500); return false; };
    const top = () => { render(); $(".logform").scrollIntoView({ behavior: "smooth", block: "start" }); };
    if (act === "bk-save") { SECTIONS.reading.collect(el); commitBook(bookForm.v); }
    else if (act === "bk-cancel") { bookForm = { mode: "add", v: { shelf: "read", read: today() } }; render(); }
    else if (act === "bk-edit") { bookForm = { mode: "edit", i, v: bookVals(books.items[i]) }; top(); }
    else if (act === "bk-finish") { bookForm = { mode: "edit", i, v: { ...bookVals(books.items[i]), shelf: "read", read: today() } }; top(); $("#bk-r").focus(); toast("Rate it, then Update book"); }
    else if (act === "bk-del") { if (!armed()) return; const b = books.items.splice(bookForm.i, 1)[0]; bookForm = { mode: "add", v: { shelf: "read", read: today() } }; markLog("books"); render(); toast("Deleted " + (b.full || b.t)); }
    else if (act === "fm-save") { SECTIONS.watching.collect(el); commitFilm(filmForm.v); }
    else if (act === "fm-cancel") { filmForm = { mode: "log", v: { date: today() } }; render(); }
    else if (act === "fm-edit") { const f = films.items[i]; filmForm = { mode: "film", i, v: { t: f.t, y: f.y ? String(f.y) : "", r: f.r == null ? "" : String(f.r), liked: !!f.liked, added: f.added || "" } }; top(); }
    else if (act === "fm-diary") { const d = films.diary[i], f = films.items[d.f] || {}; filmForm = { mode: "diary", i, v: { t: f.t, y: f.y ? String(f.y) : "", date: d.date, r: d.r == null ? "" : String(d.r), liked: !!f.liked, rewatch: !!d.rewatch, review: d.review || "" } }; top(); }
    else if (act === "fm-del") {
      if (!armed()) return;
      if (filmForm.mode === "film") { const t = films.items[filmForm.i].t; deleteFilm(filmForm.i); toast("Deleted " + t); }
      else { films.diary.splice(filmForm.i, 1); toast("Deleted entry"); }
      filmForm = { mode: "log", v: { date: today() } }; markLog("films"); render();
    }
    else if (act === "wl-add") {
      SECTIONS.watching.collect(el);
      const t = (watchForm.t || "").trim(), y = +watchForm.y || null;
      if (!t) { toast("Give the film a title."); return; }
      films.watchlist.unshift({ t, y, added: today() }); watchForm = {}; markLog("films"); render(); toast("Added to watchlist");
    }
    else if (act === "wl-del") { const w = films.watchlist.splice(i, 1)[0]; markLog("films"); collect(); render(); toast("Removed " + w.t); }
    else if (act === "wl-watched") { const w = films.watchlist[i]; filmForm = { mode: "log", v: { t: w.t, y: w.y ? String(w.y) : "", date: today() } }; top(); $("#fm-r").focus(); }
  });

  Object.assign(SECTIONS, LOG_SECTIONS);
  const ORDER = ["theme", "profile", "now", "writings", "studio", "reading", "watching", "about", "socials", "settings"];

  const KINDS = [["Drawing", "Drawing"], ["Painting", "Painting"], ["Photography", "Photography"]];
  function scard(w, i) {
    return `<div class="card" data-i="${i}">
      <div class="card-head" data-toggle><span class="chev">›</span>${w.img ? `<img class="card-thumb" src="${esc(w.img)}" alt="">` : ""}<b>${esc(w.title || "Untitled")}</b>
        <span class="pill">${esc(w.kind || "Work")}</span>
        <button class="icon-btn" type="button" data-move="-1" aria-label="Move up">↑</button>
        <button class="icon-btn" type="button" data-move="1" aria-label="Move down">↓</button>
        <button class="icon-btn danger" type="button" data-del aria-label="Delete">×</button></div>
      <div class="card-body">
        <div class="grid3">${field(w, "title", "Title", { prefix: `s${i}-` })}${field(w, "year", "Year", { prefix: `s${i}-`, placeholder: "2026" })}${field(w, "kind", "Type", { type: "select", options: KINDS, prefix: `s${i}-` })}</div>
        <div class="grid2">${field(w, "medium", "Medium or camera settings", { prefix: `s${i}-`, placeholder: "Charcoal on newsprint paper" })}${field(w, "size", "Size", { prefix: `s${i}-`, placeholder: "18 × 24 in" })}</div>
        ${field(w, "img", "Image", { type: "file", dir: "assets/studio", accept: "image/*", prefix: `s${i}-` })}
        ${field(w, "note", "Statement", { type: "textarea", rows: 4, prefix: `s${i}-` })}
      </div></div>`;
  }
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
    $("#nav").innerHTML = ORDER.map(k => [k, SECTIONS[k]]).map(([k, s]) => `<button type="button" data-sec="${k}" aria-current="${k === section}">${s.label}</button>`).join("");
    const s = SECTIONS[section];
    $("#main").innerHTML = `<h1>${s.label}</h1><p class="ed-help">${esc(s.help)}</p>
      ${!window.showDirectoryPicker ? '<div class="notice">This browser can’t save into folders. Edit here, then use Download content.js and replace data/content.js with it. Chrome or Edge can save directly.</div>' : ""}
      ${s.render()}
      <div class="ed-tools"><p><b>Art, book notes and the vault graph</b> come from your Obsidian vault, not this editor. They refresh on their own each day, or in the portfolio folder run:</p>
        <p><code>powershell -File tools/update-site.ps1</code> (art, notes and graph, then publishes)</p></div>`;
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

    /* cards (writing entries or studio works) */
    const cardEl = t.closest(".card");
    const L = section === "studio" ? ((data.studio = data.studio || { items: [] }).items = data.studio.items || []) : (data.writings = data.writings || []);
    if (t.closest("[data-add=studio]")) {
      collect(); data.studio.items.unshift({ title: "New work", year: String(new Date().getFullYear()), kind: "Drawing", medium: "", size: "", note: "", img: "" });
      render(); const c = $(".card"); c.classList.add("open", "new"); $("input[data-k=title]", c).select(); markDirty(); return;
    }
    if (t.closest("[data-add=writings]")) {
      collect(); (data.writings = data.writings || []).unshift({ title: "New entry", type: "essay", venue: "", claim: "" });
      render(); const c = $(".card"); c.classList.add("open", "new"); $("input[data-k=title]", c).select(); markDirty(); return;
    }
    if (cardEl && t.closest("[data-move]")) {
      collect(); const i = +cardEl.dataset.i, j = i + +t.closest("[data-move]").dataset.move;
      const LL = section === "studio" ? data.studio.items : data.writings;
      if (j < 0 || j >= LL.length) return;
      [LL[i], LL[j]] = [LL[j], LL[i]];
      render(); $$(".card")[j].classList.add("new"); markDirty(); return;
    }
    if (cardEl && t.closest("[data-del]")) {
      const btn = t.closest("[data-del]");
      if (!btn.dataset.armed) { btn.dataset.armed = "1"; btn.textContent = "Sure?"; btn.style.width = "auto"; btn.style.padding = "0 8px"; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = "×"; btn.style = ""; } }, 2500); return; }
      collect(); (section === "studio" ? data.studio.items : data.writings).splice(+cardEl.dataset.i, 1); render(); markDirty(); toast("Removed"); return;
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
