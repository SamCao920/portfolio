/* essay.js: on a wide screen, each note is also set in the right margin beside its mark; a thin bar at the top shows how far you have read. */
(function () {
  const main = document.querySelector(".essay"), art = main && main.querySelector("article"); if (!art) return;
  const bar = document.createElement("div"); bar.className = "progress"; document.body.appendChild(bar);
  const read = () => { const h = document.documentElement.scrollHeight - innerHeight; bar.style.width = (h > 0 ? Math.min(1, scrollY / h) * 100 : 0) + "%"; };
  addEventListener("scroll", read, { passive: true }); read();
  let made = [];
  function side() {
    made.forEach(n => n.remove()); made = [];
    const r = main.getBoundingClientRect();
    if (innerWidth - r.right < 270) return;                       /* no room: the notes stay at the end */
    main.style.position = "relative";
    let floor = 0;
    art.querySelectorAll("sup a[id^=r]").forEach(a => {
      const li = document.getElementById("fn" + a.id.slice(1)); if (!li) return;
      const n = document.createElement("aside"); n.className = "sidenote";
      n.innerHTML = `<b>${a.textContent}</b>` + li.innerHTML.replace(/<a class="back".*?<\/a>/, "");
      main.appendChild(n);
      const top = Math.max(floor, a.getBoundingClientRect().top - r.top - 4);
      n.style.top = top + "px"; n.style.left = (r.width + 26) + "px";
      floor = top + n.offsetHeight + 10; made.push(n);
    });
  }
  let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(side, 150); });
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(side);
})();
