/* Site theme: colours and fonts. Written by admin.html (Theme). Loaded in <head> so nothing flashes. */
(function () {
  var d = document.documentElement;
  d.dataset.palette = "ink";
  d.dataset.accent = "cobalt";
  var f = {"display":{"q":"Fraunces:opsz,wght@9..144,600;9..144,700","s":"Fraunces, Georgia, serif","w":650},"body":{"q":"Manrope:wght@400;600;700","s":"Manrope, Arial, sans-serif","w":400},"cjk":{"q":"Noto+Serif+SC:wght@600","s":"\"Noto Serif SC\", \"Songti SC\", SimSun, serif","w":600}};
  var fam = [f.display.q, f.body.q, f.cjk.q, "Source+Serif+4:ital,opsz,wght@0,8..60,700;1,8..60,400"].filter(function (v, i, a) { return a.indexOf(v) === i; });
  var l = document.createElement("link"); l.rel = "stylesheet"; l.id = "site-fonts";
  l.href = "https://fonts.googleapis.com/css2?family=" + fam.join("&family=") + "&display=swap";
  document.head.appendChild(l);
  d.style.setProperty("--display", f.display.s); d.style.setProperty("--dw", f.display.w);
  d.style.setProperty("--body", f.body.s);
  d.style.setProperty("--cjk", f.cjk.s); d.style.setProperty("--cjkw", f.cjk.w);
})();
