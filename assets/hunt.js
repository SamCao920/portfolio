/* hunt.js: my photographs are hidden around the site as small prints. Clicking one opens it and counts it as found
   (kept in this browser only). Finding them all unlocks "Extra credit" on the home page. Used by index.html and vault.html. */
window.HUNT = (function () {
  const S = window.SITE || {};
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SLOTS = 11;                  /* places a print can hide: two on the home page, seven inside the sections, one in the vault, one on the 404 page */
  const photos = ((S.studio || {}).items || []).filter(w => w.kind === "Photography").slice(0, SLOTS);
  const thumb = src => /^assets\/studio\/[^/]+\.(jpe?g|png|webp)$/i.test(src || "") ? src.replace(/^assets\/studio\/([^/]+)\.\w+$/, "assets/studio/thumbs/$1.webp") : src;
  const KEY = "hunt:found";
  let found = new Set();
  try { found = new Set(JSON.parse(localStorage.getItem(KEY) || "[]").filter(src => photos.some(p => p.img === src))); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...found])); } catch (e) {} };
  const subs = [];
  const done = () => photos.length > 0 && found.size >= photos.length;
  /* the print in slot k, tilted a little; "" if there is no photograph for that slot */
  const html = (k, cls) => { const p = photos[k]; if (!p) return "";
    return `<button type="button" class="print${found.has(p.img) ? " got" : ""}${cls ? " " + cls : ""}" data-hunt="${k}" style="--tilt:${((k * 37) % 9) - 4}deg" aria-label="A photograph: ${esc(p.title)}"><img alt="" loading="lazy" src="${esc(thumb(p.img))}" data-full="${esc(p.img)}" onerror="this.onerror=null;this.src=this.dataset.full"></button>`; };
  const tally = () => photos.length ? `Photographs found: ${found.size} of ${photos.length}` : "";
  const dlg = document.createElement("dialog"); dlg.className = "light";
  function show(k) {
    const p = photos[k]; if (!p) return;
    const first = !found.has(p.img), was = done();
    found.add(p.img); save();
    document.querySelectorAll(`[data-hunt="${k}"]`).forEach(b => b.classList.add("got"));
    if (!dlg.parentNode) document.body.appendChild(dlg);
    dlg.innerHTML = `<div class="in"><img alt="" src="${esc(p.img)}"><div class="cap"><i>${esc(p.title)}</i>, ${esc(p.year || "")}<small>${esc(p.medium || "")}</small>
      <small class="tally">${done() ? (was ? `All ${photos.length} found.` : `That is all ${photos.length}. Extra credit has appeared on the home page.`) : (first ? "Found. " : "") + tally() + "."}</small></div></div><button class="x" type="button">close</button>`;
    if (!dlg.open) dlg.showModal();
    subs.forEach(f => f(first, !was && done()));
  }
  dlg.addEventListener("click", e => { if (e.target.closest(".x") || e.target === dlg || e.target.classList.contains("in")) dlg.close(); });
  document.addEventListener("click", e => { const b = e.target.closest("[data-hunt]"); if (b) { e.stopPropagation(); show(+b.dataset.hunt); } });
  return { photos, html, tally, done, count: () => found.size, on: f => subs.push(f) };
})();
