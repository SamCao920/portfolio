/* admin.js: a small local editor for data/content.js, data/books.js, data/films.js and data/listening.js.
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
  const MANAGED = ["theme", "analytics", "studio", "profile", "about", "interests", "facts", "record", "writings", "socials", "homeBooks", "showDidNotFinish", "posterOverrides", "music"];
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
    for (const n of LOGS) {
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
      for (const n of LOGS) {
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
      if (logState.listening.dirty) await writeFile("data/listening.js", new Blob([listeningJs()], { type: "text/javascript" }));
      for (const n of LOGS) { const st = logState[n]; if (st.dirty) { st.dirty = st.armed = false; st.stamp = (await readLog(n)).stamp; } }
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
      help: "Essays, research and projects show on the Writing page; appearances show on their own Appearances page, newest first, with an optional photo gallery. Featured items also show on the home page. Appearances with dates drive the “Next:” line and drop off Upcoming after the end date. Simple HTML like <em>italic</em> works in text boxes.",
      render: () => `<button class="btn go add" type="button" data-add="writings">+ Add entry</button>
        <div id="w-cards">${(data.writings || []).map((w, i) => card(w, i)).join("")}</div>`,
      collect: el => {
        data.writings = $$(".card", el).map(c => {
          const o = clone((data.writings || [])[+c.dataset.i] || {}); readInto(c, o);
          if ($("[data-k=galleryText]", c)) { const g = parseGallery(o.galleryText); if (g.length) o.gallery = g; else delete o.gallery; }
          delete o.galleryText; return o;
        });
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
  let listening = clone(window.LISTENING || {}); ["items", "diary", "lists", "queue", "favorites"].forEach(k => { listening[k] = listening[k] || []; });
  const LOGS = ["books", "films", "listening"];
  const logState = Object.fromEntries(LOGS.map(n => [n, { dirty: false, stamp: 0, armed: false }]));
  const today = () => new Date().toLocaleDateString("en-CA");
  const norm = s => String(s ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const starTxt = r => r == null || r === "" ? "" : "★".repeat(Math.floor(+r)) + (+r % 1 ? "½" : "");
  const SHELVES = [["read", "Read"], ["reading", "Reading"], ["to-read", "Want to read"], ["dnf", "Did not finish"]];
  const BOOK_R = [["", "No rating"], ...[1, 2, 3, 4, 5].map(n => [String(n), starTxt(n)])];
  const FILM_R = [["", "No rating"], ...Array.from({ length: 10 }, (_, k) => (k + 1) / 2).map(n => [String(n), starTxt(n)])];
  let bookForm = { mode: "add", v: { shelf: "read", read: today() } };
  let filmForm = { mode: "log", v: { date: today() } };
  let watchForm = {}, toReadForm = {};

  async function readLog(n) {
    const f = await (await (await dir.getDirectoryHandle("data")).getFileHandle(n + ".js")).getFile();
    const box = {}; new Function("window", await f.text())(box);
    return { val: box[n.toUpperCase()], stamp: f.lastModified };
  }
  function setLog(n, v) {
    if (n === "books") { books = v; books.items = books.items || []; }
    else if (n === "listening") { listening = v; ["items", "diary", "lists", "queue", "favorites"].forEach(k => { listening[k] = listening[k] || []; }); }
    else { films = v; ["items", "diary", "lists", "watchlist", "favorites"].forEach(k => { films[k] = films[k] || []; }); }
  }
  function markLog(n) { logState[n].dirty = true; markDirty(); }
  /* one array element per line, so git diffs stay readable */
  function logJs(n, obj, keys, note) {
    obj.updated = today();
    keys.forEach(k => (obj[k] || []).forEach(x => { if (x && typeof x === "object") delete x.noCover; }));
    const o = { ...obj }, parts = {};
    keys.forEach(k => { parts[k] = "[\n" + (o[k] || []).map(x => "  " + JSON.stringify(x)).join(",\n") + "\n]"; o[k] = "@@" + k + "@@"; });
    let s = JSON.stringify(o);
    keys.forEach(k => { s = s.replace(JSON.stringify("@@" + k + "@@"), () => parts[k]); });
    return `/* ${note}\n   Edit it with admin.html. It must stay valid JavaScript. */\nwindow.${n.toUpperCase()} = ${s};\n`;
  }
  const booksJs = () => logJs("books", books, ["items"], "Books: what I have read, am reading and want to read.");
  const filmsJs = () => logJs("films", films, ["items", "diary", "watchlist"], "Films: everything I have seen, a dated diary, ranked lists and a watchlist.");
  const listeningJs = () => logJs("listening", listening, ["items", "diary", "queue"], "Music: albums I've listened to, a dated diary, ranked lists and a to-listen list.");

  /* ----- covers: find one with assets/covers.js and save it in the data, so visitors don't each search ----- */
  const KIND_OF = { books: "book", films: "film", listening: "album" };
  async function autoCover(log, item, kind) {
    if (!window.findCover || item.cover || (log === "books" && item.isbn)) return false;
    const url = await window.findCover({ ...item, kind: kind || KIND_OF[log], t: item.t || item.full });
    if (!url) return false;
    item.cover = url; markLog(log);
    return true;
  }
  let coverRun = null;
  /* every entry in a log (and its to-do list) that has no cover yet; one at a time, with progress */
  async function fillCovers(log) {
    if (coverRun) { toast("Already finding covers…"); return; }
    const L = log === "books" ? books.items.map(b => [b, "book"])
      : log === "films" ? [...films.items.map(f => [f, "film"]), ...films.watchlist.map(w => [w, "watch"])]
      : [...listening.items.map(a => [a, "album"]), ...listening.queue.map(q => [q, "queue"])];
    const todo = L.filter(([x]) => !x.cover && !(log === "books" && x.isbn) && !x.noCover);
    if (!todo.length) { toast("Everything already has a cover."); return; }
    coverRun = { done: 0, found: 0, total: todo.length };
    for (const [x, kind] of todo) {
      const ok = await autoCover(log, x, kind).catch(() => false);
      if (!ok) x.noCover = true;   /* don't retry in this session */
      coverRun.done++; if (ok) coverRun.found++;
      const b = $(`[data-act=covers-${log}]`); if (b) b.textContent = `Finding covers… ${coverRun.done}/${coverRun.total}`;
    }
    toast(`Found ${coverRun.found} of ${coverRun.total} covers. Save to keep them.`);
    coverRun = null; render();
  }
  const coversBtn = log => `<button class="btn" type="button" data-act="covers-${log}" title="Search Apple, Deezer, Open Library, Google Books and Wikipedia for missing covers">Find missing covers</button>`;

  /* ----- ranked lists, shared by Watching and Music ----- */
  const LIST_KINDS = {
    films: { lists: () => films.lists, items: () => films.items, label: f => filmLabel(f), noun: "film",
      find: label => films.items.findIndex(f => filmLabel(f) === label),
      entry: (fi, pos) => ({ pos, f: fi, t: films.items[fi].t, y: String(films.items[fi].y || "") }), idx: x => x.f },
    listening: { lists: () => listening.lists, items: () => listening.items, label: a => albumLabel(a), noun: "piece",
      find: label => listening.items.findIndex(a => albumLabel(a) === label),
      entry: (m, pos) => ({ pos, m }), idx: x => x.m }
  };
  const listRow = (kind, label = "") => `<div class="row rank-row"><span class="rank-n" aria-hidden="true"></span><input value="${esc(label)}" list="dl-${kind}-all" placeholder="Start typing a ${LIST_KINDS[kind].noun} you’ve logged" aria-label="List entry">
    <button class="icon-btn" type="button" data-rowmove="-1" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-rowmove="1" aria-label="Move down">↓</button><button class="icon-btn danger" type="button" data-rowdel aria-label="Remove">×</button></div>`;
  function listsHtml(kind) {
    const K = LIST_KINDS[kind], L = K.lists(), items = K.items();
    return `<div class="section-head" style="margin-top:26px"><h2>Lists</h2></div>
      <p class="ed-help">Ranked lists, shown on the Lists tab. Entries must be ${K.noun}s you’ve logged; use the arrows to rank them.</p>
      <div data-lists="${kind}">${L.map((l, j) => `<div class="card open" data-list="${j}">
        <div class="card-head"><b>${esc(l.name || "Untitled list")}</b><span class="pill">${(l.items || []).length}</span>
          <button class="icon-btn danger" type="button" data-act="ls-del" data-kind="${kind}" data-j="${j}" aria-label="Delete list">×</button></div>
        <div class="card-body"><div class="grid2"><label class="f"><span>Name</span><input type="text" data-ls="name" value="${esc(l.name || "")}"></label>
          <label class="f"><span>Description</span><input type="text" data-ls="desc" value="${esc(l.desc || "")}"></label></div>
          <div class="rows top5-rows wide" data-rows="ls-${kind}-${j}">${(l.items || []).map(x => listRow(kind, items[K.idx(x)] ? K.label(items[K.idx(x)]) : "")).join("")}</div>
          <button class="btn add" type="button" data-act="ls-add" data-kind="${kind}" data-j="${j}">+ Add ${K.noun}</button></div></div>`).join("")}</div>
      <button class="btn add" type="button" data-act="ls-new" data-kind="${kind}">+ New list</button>
      <datalist id="dl-${kind}-all">${items.map(x => `<option value="${esc(K.label(x))}"></option>`).join("")}</datalist>`;
  }
  /* read the list editor back into data; unknown entries are reported, not saved */
  function collectLists(el, kind) {
    const box = $(`[data-lists=${kind}]`, el); if (!box) return;
    const K = LIST_KINDS[kind], missing = [];
    const next = $$("[data-list]", box).map(card => {
      const entries = [];
      $$(".rows input", card).forEach(i => {
        const v = i.value.trim(); if (!v) return;
        const k = K.find(v);
        if (k < 0) missing.push(v); else if (!entries.some(e => K.idx(e) === k)) entries.push(K.entry(k, entries.length + 1));
      });
      return { name: $("[data-ls=name]", card).value.trim() || "Untitled list", desc: $("[data-ls=desc]", card).value.trim(), items: entries };
    });
    const L = K.lists(); L.splice(0, L.length, ...next);
    if (missing.length) toast(`Not in your log, so left out: ${missing.slice(0, 3).join("; ")}${missing.length > 3 ? "…" : ""}. Log it first.`);
  }

  /* ----- Reading ----- */
  const bookVals = b => ({ full: b.full || b.t, a: b.a || "", shelf: b.shelf || "read", read: b.read || "", added: b.added || "", r: b.r == null ? "" : String(b.r),
    fav: !!b.fav, pages: b.pages ? String(b.pages) : "", year: b.year ? String(b.year) : "", isbn: b.isbn || "", review: b.review || "" });
  function bookFormHtml() {
    const f = bookForm, v = f.v, editing = f.mode === "edit", p = { prefix: "bk-" };
    return `<div class="logform" id="bk-form">
      <h2>${editing ? "Edit book" : "Log a book"}</h2>
      <div class="grid2">${field(v, "full", "Title", { ...p, placeholder: "Start typing a title; pick a result to fill in the rest" }).replace("<input ", '<input autocomplete="off" ')}${field(v, "a", "Author", p)}</div>
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
    if (msg.startsWith("Added")) autoCover("books", b, "book");
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
      <div class="grid3">${field(v, "t", "Title", { ...p, placeholder: "Start typing a title; pick a result to fill in the rest" }).replace("<input ", `<input autocomplete="off" ${diary ? "readonly " : ""}`)}${field(v, "y", "Year", { ...p, placeholder: "1957" }).replace("<input ", diary ? "<input readonly " : "<input ")}${field(v, "date", "Date watched", { ...p, type: "date" })}</div>
      <div class="grid3">${field(v, "r", "Rating", { ...p, type: "select", options: FILM_R })}<div>${field(v, "liked", "Liked ♥", { type: "check" })}</div><div>${field(v, "rewatch", "Rewatch", { type: "check" })}</div></div>
      <input type="hidden" data-k="cover" value="${esc(v.cover || "")}">
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
      if (v.cover && !it.cover) it.cover = v.cover;
      if (v.r) it.r = +v.r;
      it.liked = !!v.liked;
      if (y && !it.y) it.y = y;
      films.diary.unshift({ f: fi, date: v.date || today(), r: v.r ? +v.r : null, rewatch: !!v.rewatch, review: v.review || null });
      films.watchlist = films.watchlist.filter(w => !(norm(w.t) === norm(it.t) && (!w.y || !it.y || w.y === it.y)));
      toast(isHidden(it.t, it.y) ? `Logged, but ${it.t} is on your hidden-films list, so the site won’t show it.` : "Logged " + it.t);
      autoCover("films", it, "film");
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

  /* ----- Music ----- */
  /* An entry is a piece of music at whatever size I rate it: an album, a song, or a classical work.
     Works are rated as pieces; who played it goes on each diary entry ("perf"). Classical is a tag ("side"). */
  const FORMS = [["album", "Album"], ["song", "Song"], ["work", "Work (classical piece)"]];
  const albumLabel = a => `${a.t} · ${a.a || "Unknown"}`;
  const findAlbum = (t, a) => listening.items.findIndex(x => norm(x.t) === norm(t) && (!a || !x.a || norm(x.a) === norm(a)));
  /* "https://open.spotify.com/album/ID?si=…" or "spotify:album:ID" → "album/ID" */
  const spPath = v => { const m = String(v || "").match(/(album|track|playlist)[/:]([A-Za-z0-9]{10,})/); return m ? `${m[1]}/${m[2]}` : ""; };
  const MU_SIDE = () => (window.MUSIC || {}).artistSide || {};
  const MU_ALBUMS = () => { const M = window.MUSIC || {}; return (M.albums || []).map(a => ({ t: a.t, a: a.a, sp: "track/" + a.id, form: "album", side: (M.artistSide || {})[a.a] || "other" })); };
  const freshForm = () => ({ mode: "log", v: { date: today(), form: "album" } });
  let albumForm = freshForm();
  let queueForm = {};
  const albumVals = (a, extra = {}) => ({ t: a.t, a: a.a || "", y: a.y ? String(a.y) : "", form: a.form || "album", classical: a.side === "classical", r: a.r == null ? "" : String(a.r), liked: !!a.liked,
    sp: a.sp ? "https://open.spotify.com/" + a.sp : "", cover: a.cover || "", added: a.added || "", ...extra });
  const formLabel = f => (FORMS.find(x => x[0] === f) || FORMS[0])[1].split(" (")[0];
  function albumFormHtml() {
    const f = albumForm, v = f.v, p = { prefix: "al-" };
    const common = `<div class="grid2">${field(v, "sp", "Spotify link (optional)", { ...p, placeholder: "https://open.spotify.com/album/… or /track/…", hint: "Gives it a cover and a Listen link. For a work, link the recording you like." })}${field(v, "cover", "Cover image (optional)", { ...p, type: "file", dir: "assets/music", accept: "image/*" })}</div>`;
    const what = `<div class="grid3">${field(v, "form", "What is it", { ...p, type: "select", options: FORMS })}${field(v, "y", "Year", { ...p, placeholder: "Released or composed" })}<div>${field(v, "classical", "Classical", { type: "check" })}</div></div>`;
    if (f.mode === "album") return `<div class="logform" id="al-form"><h2>Edit ${formLabel(v.form).toLowerCase()}</h2>
      <div class="grid3">${field(v, "t", "Title", p)}${field(v, "a", "Artist or composer", p)}${field(v, "r", "Rating", { ...p, type: "select", options: FILM_R })}</div>
      ${what}<div class="grid3"><div>${field(v, "liked", "Liked ♥", { type: "check" })}</div>${field(v, "added", "Date added", { ...p, type: "date" })}<div></div></div>${common}
      <p class="ed-help">${plural(listening.diary.filter(d => d.m === f.i).length, "diary entry", "diary entries")}. Deleting it also removes them and takes it off your lists and favorites.</p>
      <div class="logbtns"><button class="btn go" type="button" data-act="al-save">Update</button><button class="btn" type="button" data-act="al-cancel">Cancel</button><button class="btn danger-btn" type="button" data-act="al-del">Delete</button></div></div>`;
    const diary = f.mode === "diary", ro = diary ? "readonly " : "";
    const known = [...listening.items.map(albumLabel), ...MU_ALBUMS().map(albumLabel)].filter((x, i, a) => a.indexOf(x) === i);
    return `<div class="logform" id="al-form"><h2>${diary ? "Edit diary entry" : "Log a listen"}</h2>
      <div class="grid3">${field(v, "t", "Title", { ...p, placeholder: "Type a work, album or song; pick a result to fill in the rest" }).replace("<input ", `<input autocomplete="off" ${ro}`)}${field(v, "a", "Artist or composer", p).replace("<input ", "<input " + ro)}${field(v, "date", "Date listened", { ...p, type: "date" })}</div>
      <div class="grid3">${field(v, "perf", "Performed by (optional)", { ...p, placeholder: "Click to see recordings of this piece", hint: "Who played it this time. Picking a recording also uses its cover." })}${field(v, "r", "Rating", { ...p, type: "select", options: FILM_R })}<div>${field(v, "liked", "Liked ♥", { type: "check" })}${field(v, "again", "Relisten", { type: "check" })}</div></div>
      ${diary ? "" : what + common}
      ${field(v, "review", "Review", { ...p, type: "textarea", rows: 3 })}
      <div class="logbtns">${diary ? `<button class="btn go" type="button" data-act="al-save">Update entry</button><button class="btn" type="button" data-act="al-cancel">Cancel</button><button class="btn danger-btn" type="button" data-act="al-del">Delete entry</button>`
        : `<button class="btn go" type="button" data-act="al-save">Log it</button>`}</div>
      <datalist id="al-titles">${known.map(x => `<option value="${esc(x)}"></option>`).join("")}</datalist></div>`;
  }
  function commitAlbum(v) {
    const f = albumForm;
    if (!v.t) { toast("Give it a title."); return; }
    const y = v.y ? +v.y || null : null, sp = spPath(v.sp) || null, side = v.classical ? "classical" : "other", form = v.form || "album";
    if (f.mode === "album") {
      const it = listening.items[f.i];
      Object.assign(it, { t: v.t, a: v.a || "", y, form, side, r: v.r ? +v.r : null, liked: !!v.liked, sp, cover: v.cover || null, added: v.added || it.added });
      toast("Updated " + v.t);
    } else if (f.mode === "diary") {
      const d = listening.diary[f.i], it = listening.items[d.m];
      Object.assign(d, { date: v.date || d.date, perf: v.perf || null, r: v.r ? +v.r : null, again: !!v.again, review: v.review || null });
      it.liked = !!v.liked; if (v.r) it.r = +v.r;
      toast("Updated entry");
    } else {
      let mi = findAlbum(v.t, v.a);
      if (mi < 0) { listening.items.push({ t: v.t, a: v.a || "", y, form, side, r: null, liked: false, added: today(), sp, cover: v.cover || null }); mi = listening.items.length - 1; }
      const it = listening.items[mi];
      if (v.r) it.r = +v.r;
      it.liked = !!v.liked;
      if (y && !it.y) it.y = y;
      if (sp && !it.sp) it.sp = sp;
      if (v.cover && !it.cover) it.cover = v.cover;
      listening.diary.unshift({ m: mi, date: v.date || today(), perf: v.perf || null, r: v.r ? +v.r : null, again: !!v.again, review: v.review || null });
      listening.queue = listening.queue.filter(q => !(norm(q.t) === norm(it.t) && (!q.a || norm(q.a) === norm(it.a))));
      toast("Logged " + it.t);
      autoCover("listening", it, "album").then(ok => { if (ok && section === "music") render(); });
    }
    listening.diary.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    albumForm = freshForm();
    markLog("listening"); render();
  }
  function deleteAlbum(mi) {
    const m = i => i > mi ? i - 1 : i;
    listening.items.splice(mi, 1);
    listening.diary = listening.diary.filter(d => d.m !== mi).map(d => ({ ...d, m: m(d.m) }));
    listening.lists.forEach(l => { l.items = (l.items || []).filter(x => x.m !== mi).map((x, k) => ({ ...x, m: m(x.m), pos: k + 1 })); });
    listening.favorites = listening.favorites.filter(i => i !== mi).map(m);
  }
  function albumRows() {
    const q = norm(($("#al-q") || {}).value), mode = ($("#al-show") || {}).value || "diary";
    if (mode === "albums") {
      const L = listening.items.map((a, i) => [a, i]).filter(([a]) => !q || norm(albumLabel(a)).includes(q)).reverse();
      return L.slice(0, 100).map(([a, i]) => `<li><button type="button" class="lrow f4" data-act="al-edit" data-i="${i}"><b>${esc(a.t)}</b><span>${esc(a.a || "")} · ${formLabel(a.form)}</span>
        <span class="lr-stars">${starTxt(a.r)}${a.liked ? " ♥" : ""}</span><span class="lr-date">${esc(a.added || "")}</span></button></li>`).join("") || '<li class="lempty">Nothing logged yet.</li>';
    }
    const L = listening.diary.map((d, i) => [d, i, listening.items[d.m] || { t: "?" }]).filter(([d, , a]) => !q || norm(albumLabel(a) + " " + (d.perf || "")).includes(q));
    return (L.slice(0, 100).map(([d, i, a]) => `<li><button type="button" class="lrow f4" data-act="al-diary" data-i="${i}"><b>${esc(a.t)}</b><span>${esc([a.a, d.perf].filter(Boolean).join(" · "))}</span>
      <span class="lr-stars">${starTxt(d.r)}${d.again ? " ↻" : ""}${d.review ? " ✎" : ""}</span><span class="lr-date">${esc(d.date)}</span></button></li>`).join("") || '<li class="lempty">Nothing logged yet.</li>')
      + (L.length > 100 ? `<li class="lempty">Showing 100 of ${L.length}. Search to narrow.</li>` : "");
  }
  /* top five composers and artists: one ranked list in content.js as data.music.top */
  function topFiveHtml() {
    const m = data.music || {};
    const names = (m.top || [...(m.classical || []), ...(m.other || [])]).slice(0, 5);
    while (names.length < 5) names.push("");
    return `<div class="section-head" style="margin-top:26px"><h2>Top five composers and artists</h2></div>
      <p class="ed-help">One ranked list, shown near the top of the Music page. Leave it empty to hide it.</p>
      <div class="rows top5-rows" data-rows="m-top">${names.map((n, i) => `<div class="row rank-row"><span class="rank-n" aria-hidden="true"></span><input value="${esc(n)}" list="dl-top" placeholder="Composer or artist" aria-label="Top five, number ${i + 1}">
        <button class="icon-btn" type="button" data-rowmove="-1" aria-label="Move up">↑</button><button class="icon-btn" type="button" data-rowmove="1" aria-label="Move down">↓</button></div>`).join("")}</div>
      <datalist id="dl-top">${Object.keys(MU_SIDE()).map(a => `<option value="${esc(a)}"></option>`).join("")}</datalist>`;
  }

  const LOG_SECTIONS = {
    reading: {
      label: "Reading",
      help: "Log books here; this is now where the Books page gets its data. Pick an existing title from the suggestions to update it (for example, move it from Want to read to Read). Save writes data/books.js.",
      render: () => {
        const reading = books.items.map((b, i) => [b, i]).filter(([b]) => b.shelf === "reading");
        return `<div data-nodirty>${bookFormHtml()}
        ${reading.length ? `<div class="section-head" style="margin-top:26px"><h2>Currently reading</h2></div><ul class="chips">${reading.map(([b, i]) =>
          `<li><span>${esc(b.full || b.t)}</span><button class="btn" type="button" data-act="bk-finish" data-i="${i}">Finished</button></li>`).join("")}</ul>` : ""}
        <div class="section-head" style="margin-top:26px"><h2>Want to read</h2></div>
        <div class="lfilter" id="tr-form"><input type="text" data-tr="t" placeholder="Title" aria-label="Title" value="${esc(toReadForm.t || "")}"><input type="text" data-tr="a" placeholder="Author" aria-label="Author" value="${esc(toReadForm.a || "")}">
          <button class="btn" type="button" data-act="tr-add">+ Add</button></div>
        <p class="ed-help">${plural(books.items.filter(b => b.shelf === "to-read").length, "book")} on the list. Use Finished or the form above when you read one.</p>
        <div class="section-head" style="margin-top:26px"><h2>Library</h2>${coversBtn("books")}</div>
        <div class="lfilter"><input type="search" id="bk-q" placeholder="Search ${books.items.length} books" aria-label="Search books">
          <select id="bk-shelf" aria-label="Status"><option value="all">All</option>${SHELVES.map(([k, l]) => `<option value="${k}">${l} (${books.items.filter(b => b.shelf === k).length})</option>`).join("")}</select></div>
        <ul class="llist" id="bk-list">${bookRows()}</ul></div>`;
      },
      collect: el => { const fm = $("#bk-form", el); if (fm) { const v = {}; readInto(fm, v); bookForm.v = v; } $$("[data-tr]", el).forEach(i => { toReadForm[i.dataset.tr] = i.value; }); }
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
        ${listsHtml("films")}
        <div class="section-head" style="margin-top:26px"><h2>History</h2>${coversBtn("films")}</div>
        <div class="lfilter"><input type="search" id="fm-q" placeholder="Search" aria-label="Search films">
          <select id="fm-show" aria-label="Show"><option value="diary">Diary (${films.diary.length})</option><option value="films">Films (${films.items.length})</option></select></div>
        <ul class="llist" id="fm-list">${filmRows()}</ul></div>`;
      },
      collect: el => {
        const fm = $("#fm-form", el); if (fm) { const v = {}; readInto(fm, v); filmForm.v = v; }
        $$("[data-wl]", el).forEach(i => { watchForm[i.dataset.wl] = i.value; });
        collectLists(el, "films");
      }
    },
    music: {
      label: "Music",
      help: "Log music here, like films. An entry can be an album, a song or a classical work: rate a Beethoven quartet as a work, and note who played it on each listen. Logging adds a diary entry, adds the piece if it’s new, updates its rating and takes it off To listen. Save writes data/listening.js.",
      render: () => {
        const opts = listening.items.map((a, i) => [a, i]).sort(([a], [b]) => a.t.localeCompare(b.t));
        return `<div data-nodirty>${albumFormHtml()}
        <div class="section-head" style="margin-top:26px"><h2>Favorites</h2></div>
        <div class="grid2 favs">${[0, 1, 2, 3].map(k => `<label class="f"><span>Favorite ${k + 1}</span><select data-afav="${k}"><option value="">None</option>${opts.map(([a, i]) =>
          `<option value="${i}" ${listening.favorites[k] === i ? "selected" : ""}>${esc(albumLabel(a))}</option>`).join("")}</select></label>`).join("")}</div>
        <div class="section-head" style="margin-top:26px"><h2>To listen</h2></div>
        <div class="lfilter" id="ql-form"><input type="text" data-ql="t" placeholder="Title" aria-label="Title" value="${esc(queueForm.t || "")}" list="al-titles-q"><input type="text" data-ql="a" placeholder="Artist or composer" aria-label="Artist or composer" value="${esc(queueForm.a || "")}">
          <select data-ql="form" aria-label="What is it">${FORMS.map(([k, l]) => `<option value="${k}" ${queueForm.form === k ? "selected" : ""}>${l.split(" (")[0]}</option>`).join("")}</select>
          <button class="btn" type="button" data-act="ql-add">+ Add</button></div>
        <datalist id="al-titles-q">${MU_ALBUMS().map(x => `<option value="${esc(x.t)}">${esc(x.a)}</option>`).join("")}</datalist>
        <ul class="llist">${listening.queue.map((q, i) => `<li class="lrow static"><b>${esc(q.t)}</b><span>${esc(q.a || "")}</span><span class="lr-date">${esc(q.added || "")}</span>
          <span class="lr-acts"><button class="btn" type="button" data-act="ql-done" data-i="${i}">Listened</button><button class="icon-btn danger" type="button" data-act="ql-del" data-i="${i}" aria-label="Remove">×</button></span></li>`).join("") || '<li class="lempty">Empty.</li>'}</ul>
        ${listsHtml("listening")}
        <div class="section-head" style="margin-top:26px"><h2>History</h2>${coversBtn("listening")}</div>
        <div class="lfilter"><input type="search" id="al-q" placeholder="Search" aria-label="Search albums">
          <select id="al-show" aria-label="Show"><option value="diary">Diary (${listening.diary.length})</option><option value="albums">Library (${listening.items.length})</option></select></div>
        <ul class="llist" id="al-list">${albumRows()}</ul></div>
        ${topFiveHtml()}`;
      },
      collect: el => {
        const fm = $("#al-form", el); if (fm) { const v = {}; readInto(fm, v); albumForm.v = v; }
        $$("[data-ql]", el).forEach(i => { queueForm[i.dataset.ql] = i.value; });
        collectLists(el, "listening");
        const read = side => $$(`[data-rows=m-${side}] input`, el).map(i => i.value.trim()).filter(Boolean);
        if ($("[data-rows=m-top]", el)) data.music = { top: read("top") };
      }
    }
  };

  document.addEventListener("input", e => {
    const t = e.target;
    if (t.id === "bk-q") { $("#bk-list").innerHTML = bookRows(); return; }
    if (t.id === "fm-q") { $("#fm-list").innerHTML = filmRows(); return; }
    if (t.id === "al-q") { $("#al-list").innerHTML = albumRows(); return; }
    if (t.closest("[data-lists]")) { markLog(t.closest("[data-lists]").dataset.lists); return; }
    if (t.matches("#al-form [data-k=t]") && albumForm.mode === "log") {
      const hit = listening.items.find(a => albumLabel(a) === t.value) || MU_ALBUMS().find(a => albumLabel(a) === t.value);
      if (hit) {
        const F = $("#al-form"), set = (k, v) => { const i = $(`[data-k=${k}]`, F); if (i && v != null && v !== "") i.type === "checkbox" ? i.checked = !!v : i.value = v; };
        t.value = hit.t; set("a", hit.a); set("y", hit.y); if (hit.sp) set("sp", "https://open.spotify.com/" + hit.sp);
        set("form", hit.form || "album"); set("classical", (hit.side || MU_SIDE()[hit.a]) === "classical");
        if (listening.items.includes(hit)) { set("liked", hit.liked); set("again", true); }
      }
    }
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
    if (t.id === "al-show") { $("#al-list").innerHTML = albumRows(); return; }
    if (t.matches("#al-form [data-k=form]") && t.value === "work") { const c = $("#al-form [data-k=classical]"); if (c) c.checked = true; }
    if (t.matches("[data-afav]")) {
      const sel = $$("[data-afav]").map(s => s.value).filter(Boolean).map(Number);
      listening.favorites = sel.filter((v, i) => sel.indexOf(v) === i); markLog("listening"); return;
    }
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
      autoCover("films", films.watchlist[0], "watch");
    }
    else if (act === "wl-del") { const w = films.watchlist.splice(i, 1)[0]; markLog("films"); collect(); render(); toast("Removed " + w.t); }
    else if (act === "tr-add") {
      SECTIONS.reading.collect(el);
      const t = (toReadForm.t || "").trim(), au = (toReadForm.a || "").trim();
      if (!t) { toast("Give the book a title."); return; }
      if (books.items.some(b => norm(b.full || b.t) === norm(t))) { toast(`${t} is already in your library.`); return; }
      books.items.unshift({ t: t.split(/:\s/)[0].trim(), full: t, a: au, isbn: null, r: null, read: null, added: today(), shelf: "to-read", fav: false, review: null, pages: null, year: null });
      toReadForm = {}; markLog("books"); render(); toast("Added to Want to read");
      autoCover("books", books.items[0], "book");
    }
    else if (act === "al-save") { SECTIONS.music.collect(el); commitAlbum(albumForm.v); }
    else if (act === "al-cancel") { albumForm = freshForm(); render(); }
    else if (act === "al-edit") { albumForm = { mode: "album", i, v: albumVals(listening.items[i]) }; top(); }
    else if (act === "al-diary") { const d = listening.diary[i], a = listening.items[d.m] || {}; albumForm = { mode: "diary", i, v: albumVals(a, { date: d.date, perf: d.perf || "", r: d.r == null ? "" : String(d.r), again: !!d.again, review: d.review || "" }) }; top(); }
    else if (act === "al-del") {
      if (!armed()) return;
      if (albumForm.mode === "album") { const t = listening.items[albumForm.i].t; deleteAlbum(albumForm.i); toast("Deleted " + t); }
      else { listening.diary.splice(albumForm.i, 1); toast("Deleted entry"); }
      albumForm = freshForm(); markLog("listening"); render();
    }
    else if (act === "ql-add") {
      SECTIONS.music.collect(el);
      const t = (queueForm.t || "").trim();
      if (!t) { toast("Give the album a title."); return; }
      const [tt, aa] = t.includes(" · ") && !queueForm.a ? t.split(" · ") : [t, queueForm.a || ""];
      const hit = MU_ALBUMS().find(a => norm(a.t) === norm(tt) && (!aa || norm(a.a) === norm(aa)));
      const form = queueForm.form || "album", side = form === "work" || MU_SIDE()[aa.trim()] === "classical" ? "classical" : "other";
      listening.queue.unshift({ t: tt.trim(), a: aa.trim(), form, side, sp: hit ? hit.sp : null, added: today() });
      autoCover("listening", listening.queue[0], "queue");
      queueForm = {}; markLog("listening"); render(); toast("Added to To listen");
    }
    else if (act === "ql-del") { const q = listening.queue.splice(i, 1)[0]; markLog("listening"); collect(); render(); toast("Removed " + q.t); }
    else if (act === "ql-done") { const q = listening.queue[i]; albumForm = { mode: "log", v: { t: q.t, a: q.a || "", form: q.form || "album", classical: q.side === "classical", sp: q.sp ? "https://open.spotify.com/" + q.sp : "", date: today() } }; top(); $("#al-r").focus(); }
    else if (act === "ls-new" || act === "ls-add" || act === "ls-del") {
      const kind = a.dataset.kind, j = +a.dataset.j;
      if (act === "ls-del" && !armed()) return;
      collect();
      const L = LIST_KINDS[kind].lists();
      if (act === "ls-new") L.push({ name: "New list", desc: "", items: [] });
      if (act === "ls-del") L.splice(j, 1);
      markLog(kind); render();
      if (act === "ls-add") { $(`[data-rows=ls-${kind}-${j}]`).insertAdjacentHTML("beforeend", listRow(kind)); $(`[data-rows=ls-${kind}-${j}] .row:last-child input`).focus(); }
      if (act === "ls-new") { const c = $$(`[data-lists=${kind}] [data-list]`).at(-1); c.scrollIntoView({ block: "center" }); $("[data-ls=name]", c).select(); }
    }
    else if (act.startsWith("covers-")) { fillCovers(act.slice(7)); }
    else if (act === "wl-watched") { const w = films.watchlist[i]; filmForm = { mode: "log", v: { t: w.t, y: w.y ? String(w.y) : "", date: today() } }; top(); $("#fm-r").focus(); }
  });


  /* ---------- autocomplete: type a few letters, pick a result, the rest of the form fills itself ----------
     Sources (all free, no keys, called from this browser):
       your own logs first, then
       music: Open Opus (classical composers and works) and Apple iTunes (songs, albums, artists, recordings)
       films: Apple iTunes movies       books: Open Library
     Each source fails quietly; you can always type freely. */
  const NET = () => window.coverNet || null;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const yearOf = d => (String(d || "").match(/\d{4}/) || [""])[0];
  const art = (url, size = "100x100") => url ? url.replace(/\/\d+x\d+bb(-\d+)?\.(jpg|png)$/, `/${size}bb.$2`) : "";
  const workTitle = t => String(t || "").replace(/\s*:\s*(I|II|III|IV|V|VI|VII|VIII|IX|X|\d+)\.\s.*$/, "").replace(/\s*-\s*Remaster(ed)?.*$/i, "").trim();
  const near = (a, b) => norm(a).includes(norm(b)) || norm(b).includes(norm(a));
  const uniq = (list, key) => { const seen = new Set(); return list.filter(x => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  async function openOpus(q) {
    const j = await NET().json(`https://api.openopus.org/omnisearch/${encodeURIComponent(q)}/0.json`);
    return (j && j.results) || [];
  }
  async function itunes(q, params) {
    const j = await NET().jsonp(`https://itunes.apple.com/search?limit=15&${params}&term=${encodeURIComponent(q)}`);
    return (j && j.results) || [];
  }

  /* what each field searches, and what a pick fills in. fill: { field: value }, done(): extra work */
  const SOURCES = {
    /* Music: the piece */
    "al-t": async q => {
      const local = listening.items.filter(a => norm(albumLabel(a)).includes(norm(q))).slice(0, 4)
        .map(a => ({ label: a.t, sub: `${a.a} · in your log`, img: a.cover, value: albumLabel(a) }));
      const past = MU_ALBUMS().filter(a => norm(albumLabel(a)).includes(norm(q))).slice(0, 3)
        .map(a => ({ label: a.t, sub: `${a.a} · from your Spotify history`, value: albumLabel(a) }));
      if (!NET()) return [...local, ...past];
      const [oo, it] = await Promise.all([openOpus(q).catch(() => []), itunes(q, "media=music&entity=song,album").catch(() => [])]);
      const works = oo.filter(r => r.work && r.composer).slice(0, 6).map(r => ({
        label: r.work.title + (r.work.subtitle ? ` ${r.work.subtitle}` : ""), sub: `${r.composer.complete_name} · ${r.work.genre || "work"} · Open Opus`,
        fill: { t: r.work.title + (r.work.subtitle ? ` ${r.work.subtitle}` : ""), a: r.composer.complete_name, form: "work", classical: true } }));
      const recs = it.slice(0, 10).map(x => {
        const album = x.wrapperType === "collection", classical = /classical/i.test(x.primaryGenreName || "");
        const t = album ? x.collectionName : classical ? workTitle(x.trackName) : x.trackName;
        return { label: t, sub: `${x.artistName} · ${album ? "Album" : classical ? "Recording" : "Song"}${yearOf(x.releaseDate) ? " · " + yearOf(x.releaseDate) : ""}`, img: art(x.artworkUrl100),
          fill: { t, a: x.artistName, y: classical ? "" : yearOf(x.releaseDate), form: album ? "album" : classical ? "work" : "song", classical, cover: art(x.artworkUrl100, "600x600"), perf: classical && !album ? x.artistName : "" } };
      });
      return uniq([...local, ...past, ...works, ...recs], s => norm(s.label + "|" + s.sub.split(" · ")[0]));
    },
    /* Music: artist or composer */
    "al-a": async q => {
      const mine = uniq(listening.items.map(a => a.a).filter(a => a && norm(a).includes(norm(q))), norm).slice(0, 4).map(a => ({ label: a, sub: "in your log", fill: { a } }));
      const hist = Object.keys(MU_SIDE()).filter(a => norm(a).includes(norm(q))).slice(0, 4).map(a => ({ label: a, sub: "from your Spotify history", fill: { a, classical: MU_SIDE()[a] === "classical" } }));
      if (!NET()) return uniq([...mine, ...hist], s => norm(s.label));
      const [oo, it] = await Promise.all([openOpus(q).catch(() => []), itunes(q, "media=music&entity=musicArtist").catch(() => [])]);
      const comps = uniq(oo.filter(r => r.composer && !r.work), r => r.composer.id).slice(0, 5).map(r => ({ label: r.composer.complete_name, sub: `Composer · ${r.composer.epoch || ""}`, fill: { a: r.composer.complete_name, classical: true } }));
      const arts = it.slice(0, 6).map(x => ({ label: x.artistName, sub: x.primaryGenreName || "Artist", fill: { a: x.artistName, classical: /classical/i.test(x.primaryGenreName || "") } }));
      return uniq([...mine, ...hist, ...comps, ...arts], s => norm(s.label));
    },
    /* Music: who played it — recordings of this piece, plus performers you've logged before */
    "al-perf": async q => {
      const F = $("#al-form"), t = ($("[data-k=t]", F) || {}).value || "", a = ($("[data-k=a]", F) || {}).value || "";
      /* performers you've logged for this same piece rank above others you've logged */
      const forThis = d => { const it = listening.items[d.m]; return it && norm(it.t) === norm(t) ? 0 : 1; };
      const mine = uniq([...listening.diary].sort((x, y) => forThis(x) - forThis(y)).map(d => d.perf).filter(p => p && (!q || norm(p).includes(norm(q)))), norm).slice(0, 4)
        .map(p => ({ label: p, sub: "you’ve logged them before", fill: { perf: p } }));
      if (!NET() || !t) return mine;
      const it = await itunes(`${a} ${t}`, "media=music&entity=album").catch(() => []);
      const surname = NET().words(a).slice(-1)[0] || "";
      const recs = it.filter(x => NET().believable({ t, a }, `${x.collectionName} ${x.artistName}`) || norm(x.collectionName).includes(norm(t)))
        .map(x => ({ who: x.artistName, x })).filter(r => r.who && !norm(r.who).includes(surname) && (!q || norm(r.who).includes(norm(q))))
        .slice(0, 8).map(({ who, x }) => ({ label: who, sub: `${x.collectionName}${yearOf(x.releaseDate) ? " · " + yearOf(x.releaseDate) : ""}`, img: art(x.artworkUrl100),
          fill: { perf: who, cover: art(x.artworkUrl100, "600x600") } }));
      /* recordings of this piece first; performers you've logged before after them */
      return uniq([...recs, ...mine], s => norm(s.label));
    },
    /* Films */
    "fm-t": async q => {
      const local = films.items.filter(f => norm(filmLabel(f)).includes(norm(q))).slice(0, 5).map(f => ({ label: f.t, sub: `${f.y || ""} · in your log`, value: filmLabel(f) }));
      if (!NET()) return local;
      const it = await itunes(q, "media=movie&entity=movie").catch(() => []);
      const web = it.slice(0, 8).map(x => ({ label: x.trackName, sub: `${yearOf(x.releaseDate)}${x.artistName ? " · dir. " + x.artistName : ""}`, img: art(x.artworkUrl100),
        fill: { t: x.trackName, y: yearOf(x.releaseDate), cover: art(x.artworkUrl100, "400x600") } }));
      return uniq([...local, ...web], s => norm(s.label + s.sub.slice(0, 4)));
    },
    /* Books */
    "bk-full": async q => {
      const local = books.items.filter(b => norm(`${b.full || b.t} ${b.a}`).includes(norm(q))).slice(0, 5).map(b => ({ label: b.full || b.t, sub: `${b.a || ""} · in your library`, value: b.full || b.t }));
      if (!NET()) return local;
      const j = await NET().json("https://openlibrary.org/search.json?" + new URLSearchParams({ q, limit: 8, fields: "title,subtitle,author_name,first_publish_year,cover_i,isbn,number_of_pages_median" })).catch(() => null);
      const web = ((j && j.docs) || []).map(d => {
        const isbn = (d.isbn || []).find(x => /^97[89]\d{10}$/.test(x)) || (d.isbn || [])[0] || "";
        return { label: d.title + (d.subtitle ? `: ${d.subtitle}` : ""), sub: `${(d.author_name || []).slice(0, 2).join(", ")}${d.first_publish_year ? " · " + d.first_publish_year : ""}`,
          img: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg` : "",
          fill: { full: d.title + (d.subtitle ? `: ${d.subtitle}` : ""), a: (d.author_name || [])[0] || "", year: d.first_publish_year ? String(d.first_publish_year) : "", pages: d.number_of_pages_median ? String(d.number_of_pages_median) : "", isbn } };
      });
      return uniq([...local, ...web], s => norm(s.label + s.sub.split(" · ")[0]));
    }
  };
  /* the performer list is useful before typing anything, once the piece is known */
  const SHOW_ON_FOCUS = new Set(["al-perf"]);

  const box = document.createElement("div");
  box.className = "suggest"; box.setAttribute("role", "listbox"); box.hidden = true;
  document.body.appendChild(box);
  let active = null, items = [], sel = -1, ticket = 0;
  const close = () => { box.hidden = true; items = []; sel = -1; active = null; };
  const place = () => { if (!active) return; const r = active.getBoundingClientRect(); box.style.left = r.left + "px"; box.style.top = (r.bottom + 4) + "px"; box.style.width = Math.min(Math.max(r.width, 460), innerWidth - r.left - 16) + "px"; };
  const paint = (loading) => {
    if (!active) return;
    if (!items.length && !loading) { box.hidden = true; return; }
    box.innerHTML = items.map((s, k) => `<div class="sg-item" role="option" data-n="${k}" aria-selected="${k === sel}">
      ${s.img ? `<img src="${esc(s.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<span class="sg-noimg"></span>'}
      <span class="sg-text"><b>${esc(s.label)}</b><small>${esc(s.sub || "")}</small></span></div>`).join("") + (loading ? '<div class="sg-loading">Searching…</div>' : "");
    box.hidden = false; place();
  };
  const search = debounce(async (inp, id) => {
    const q = inp.value.trim(), my = ++ticket;
    if (q.length < 2 && !SHOW_ON_FOCUS.has(id)) { close(); return; }
    items = []; paint(true);
    let res = [];
    try { res = await SOURCES[id](q); } catch (e) { res = []; }
    if (my !== ticket || active !== inp) return;
    items = res.slice(0, 12); sel = -1; paint(false);
  }, 280);
  function pick(s) {
    const inp = active; if (!inp || !s) return;
    const form = inp.closest(".logform");
    close();
    if (s.value != null) {   /* one of yours: let the existing handlers switch to it */
      inp.value = s.value; inp.dispatchEvent(new Event("input", { bubbles: true })); return;
    }
    Object.entries(s.fill || {}).forEach(([k, v]) => {
      const el = $(`[data-k=${k}]`, form); if (!el || v == null) return;
      if (el.type === "checkbox") el.checked = !!v;
      else if (v !== "" || el === inp) el.value = v;
    });
    const next = $("[data-k=r], [data-k=review]", form); if (next && inp.dataset.k !== "perf") next.focus();
    toast("Filled in from " + (s.sub || "").split(" · ").slice(-1)[0].replace(/^\d{4}$/, "the catalogue"));
  }
  const idOf = el => el && el.matches && el.matches("input[data-k]") && !el.readOnly && SOURCES[el.id] ? el.id : null;
  document.addEventListener("input", e => { const id = idOf(e.target); if (!id || !e.isTrusted) return; active = e.target; search(e.target, id); });
  document.addEventListener("focusin", e => { const id = idOf(e.target); if (id && SHOW_ON_FOCUS.has(id)) { active = e.target; search(e.target, id); } });
  document.addEventListener("keydown", e => {
    if (box.hidden || !active || e.target !== active) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); sel = (sel + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length; paint(false); }
    else if (e.key === "Enter" && sel >= 0) { e.preventDefault(); pick(items[sel]); }
    else if (e.key === "Escape") close();
  });
  box.addEventListener("mousedown", e => { const it = e.target.closest(".sg-item"); if (it) { e.preventDefault(); pick(items[+it.dataset.n]); } });
  document.addEventListener("focusout", e => { if (e.target === active) setTimeout(() => { if (document.activeElement !== active) close(); }, 150); });
  addEventListener("scroll", place, true); addEventListener("resize", place);

  Object.assign(SECTIONS, LOG_SECTIONS);
  const ORDER = ["theme", "profile", "now", "writings", "studio", "reading", "watching", "music", "about", "socials", "settings"];
  /* moving or removing a list entry changes that log */
  document.addEventListener("click", e => { const b = e.target.closest("[data-lists] [data-rowmove], [data-lists] [data-rowdel]"); if (b) markLog(b.closest("[data-lists]").dataset.lists); }, true);

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
  /* photo gallery for an appearance: one photo per line, "path | caption" */
  const galleryText = w => (w.gallery || []).map(g => typeof g === "string" ? g : g.src + (g.cap ? " | " + g.cap : "")).join("\n");
  const parseGallery = txt => String(txt || "").split("\n").map(l => l.trim()).filter(Boolean).map(l => { const [src, ...cap] = l.split("|"); const o = { src: src.trim() }; if (cap.join("|").trim()) o.cap = cap.join("|").trim(); return o; });
  function galleryField(w, i) {
    return `<label class="f" for="w${i}-gallery"><span>Photo gallery</span>
      <textarea id="w${i}-gallery" data-k="galleryText" rows="${Math.min(8, Math.max(3, (w.gallery || []).length + 1))}" placeholder="assets/appearances/photo.jpg | Optional caption">${esc(galleryText(w))}</textarea>
      <small>Shown under the entry on the Appearances page; click a photo to view it large. One per line; add “| caption” after the path for a caption. Reorder photos by moving lines.</small></label>
      <label class="btn" tabindex="0">Add photos<input type="file" hidden multiple accept="image/*" data-gallery="${i}"></label>`;
  }
  /* re-encode a photo: at most 2000 px on the long side, JPEG; drops EXIF (GPS, camera) along the way */
  async function cleanPhoto(file) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const c = document.createElement("canvas"); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise(res => c.toBlob(res, "image/jpeg", 0.88));
  }
  document.addEventListener("change", async e => {
    const inp = e.target.closest("input[type=file][data-gallery]"); if (!inp || !inp.files.length) return;
    const cardEl = inp.closest(".card"), box = $("[data-k=galleryText]", cardEl);
    const title = ($("[data-k=title]", cardEl) || {}).value || "event";
    const folder = "assets/appearances/" + title.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
    let added = 0;
    for (const f of inp.files) {
      try {
        const blob = await cleanPhoto(f);
        const name = f.name.replace(/\.[^.]+$/, "").replace(/[^\w.\- ()]+/g, "_") + ".jpg";
        const path = `${folder}/${name}`;
        pendingFiles.push({ path, file: blob });
        box.value = (box.value.trim() ? box.value.trim() + "\n" : "") + path; added++;
      } catch (err) { toast(`Couldn’t read ${f.name}: ${err.message}`); }
    }
    inp.value = "";
    box.rows = Math.min(8, box.value.split("\n").length + 1);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    toast(`${added} photo${added === 1 ? "" : "s"} added (location data removed). ${dir ? "They’re copied in on Save." : "Connect the folder before saving."}`);
  });
  /* switching an entry to Appearance shows its gallery box */
  document.addEventListener("change", e => {
    const t = e.target; if (!t.matches || !t.matches(".card [data-k=type]") || section !== "writings") return;
    const i = +t.closest(".card").dataset.i; collect(); render();
    const c = $(`.card[data-i="${i}"]`); if (c) c.classList.add("open");
  });
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
        ${w.type === "appearance" ? galleryField(w, i) : ""}
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
