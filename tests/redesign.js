/* One visual language, held in place.

   The redesign audit found the app speaking two languages: share cards drawn in line art and coloured by what a
   place serves, an app of pale verdict-green tiles with emoji, 27 emoji used as buttons beside 5 line icons, Go's
   first cafe a third of the way down under grey bars, up to 10 button styles on a screen, and two rules for what a
   drink is. This pins the fixes: drawn marks everywhere (the rank sheet too), line icons on every control, content
   first on Go, three button styles, one drink rule, 44px targets on the Log form, one overlay at a time on the map. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  /* ---- 4: one rule for what a drink is ---- */
  const drinks = await pg.evaluate(() => {
    const kindEmoji = { matcha: "🍵", tea: "🍵", boba: "🧋", coffee: "☕", gelato: "🍨", pastry: "🥐" };
    let n = 0, off = 0;
    cafes.forEach(c => (c.drinks || []).forEach(d => { const k = drinkKind(d.n); if (!k) return; n++; if (drinkGlyph(d.n) !== kindEmoji[k]) off++; }));
    return { n, off, flat: drinkGlyph("Flat White"), ceylon: drinkGlyph("Ceylon black tea") };
  });
  eq([drinks.off, drinks.flat, drinks.ceylon], [0, "☕", "🍵"], "the cafe page and the share card agree on every drink (" + drinks.n + " checked): a Flat White is a coffee cup on both");

  /* ---- 1 + 8: the drawn mark on tiles, the cafe page, the Go queue and the rank sheet ---- */
  const marks = await pg.evaluate(() => {
    isAdmin = true; applyMode(); _formSnap = null; listCompact = true; sortMode = "ranked"; show("list"); renderList();
    const tiles = [...document.querySelectorAll("#grid .card .ph.nophoto")].slice(0, 20);
    const drawn = tiles.filter(t => t.querySelector("svg.mkv")).length, colours = new Set(tiles.map(t => getComputedStyle(t).backgroundImage)).size;
    show("compare"); renderBoard(); boardRank();
    const th = [...document.querySelectorAll(".ch-th")];
    const sheet = { n: th.length, drawn: th.filter(t => t.querySelector("svg.mkv")).length, initials: th.filter(t => /^[A-Z?]{1,2}$/.test(t.textContent.trim())).length };
    chaserDismiss();
    return { tiles: tiles.length, drawn, colours, sheet };
  });
  eq(marks.drawn, marks.tiles, "every tile without a photo draws the cafe's vessel (" + marks.drawn + " of " + marks.tiles + ")");
  eq(marks.colours >= 3, true, "…on the colour of what it serves, so the first twenty tiles are not one green (" + marks.colours + " colours)");
  eq([marks.sheet.n > 0, marks.sheet.drawn === marks.sheet.n, marks.sheet.initials], [true, true, 0], "the rank sheet shows the same drawn marks, no initials");

  /* ---- 2: no emoji on any control ---- */
  const icons = await pg.evaluate(() => {
    const EMO = /[\u{1F300}-\u{1FAFF}☀-➿←-⇿⬀-⯿]/u;
    const screens = { list: () => { show("list"); renderList(); }, cafe: () => openDetail(cafes.find(c => !c.wish).id, "list"), go: () => { show("compare"); renderBoard(); }, stats: () => { show("stats"); renderStats(); }, settings: () => { show("settings"); renderSettings(); } };
    const bad = [];
    for (const [name, open] of Object.entries(screens)) {
      open();
      document.querySelectorAll("#app button, #app summary, #app .handoff, #app .gochip, .side-nav button, .apptitle, .setmode").forEach(el => {
        if (!el.offsetParent || el.closest(".chiprow, .usuals, #filterchips, .seg, .tagpick, .rb, .rbtns, .ch-opt, .card, .wstrip, .lbrow, .reord")) return;
        const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join("");
        if (EMO.test(own)) bad.push(name + ": " + own.trim().slice(0, 24));
      });
    }
    const uses = [...document.querySelectorAll("svg.ico use")].map(u => u.getAttribute("href"));
    const missing = [...new Set(uses)].filter(h => !document.querySelector(h));
    return { bad: [...new Set(bad)], used: new Set(uses).size, missing };
  });
  eq(icons.bad, [], "no button, menu or heading uses an emoji as its icon");
  eq([icons.used > 10, icons.missing], [true, []], "…they draw from one line-icon set, and every icon they ask for exists (" + icons.used + " in use)");

  /* ---- 3: content first ---- */
  const first = await pg.evaluate(() => {
    isAdmin = true; applyMode(); show("compare"); renderBoard();
    const row = document.querySelector("#cmp-body .lbrow.guide"), chips = [...document.querySelectorAll("#cmp-body .gobar .gochip, #cmp-body .gochips .gochip")];
    show("list"); renderList();
    return { goTop: Math.round(row.getBoundingClientRect().top), chips: chips.map(c => c.textContent.replace(/\s+/g, " ").trim()), primary: chips.filter(c => c.classList.contains("p")).length,
             searchButtons: document.querySelectorAll(".search button").length, headerSettings: !!document.querySelector(".searchrow > .setdoor") };
  });
  eq(first.goTop < 220, true, "Go's first cafe starts in the top quarter of the phone (" + first.goTop + "px; it was 279)");
  eq([first.chips.some(c => /^Rank a pair/.test(c)), first.primary], [true, 1], "…its actions are one row of chips, Rank a pair the one filled");
  eq([first.searchButtons, first.headerSettings], [0, true], "the List's search field is only a search field; Settings sits beside it");

  /* ---- 5: three button styles ---- */
  const styles = await pg.evaluate(() => {
    const kinds = sel => { const s = new Set(); document.querySelectorAll(sel).forEach(e => { if (!e.offsetParent) return; const cs = getComputedStyle(e); const filled = cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent"; const bordered = parseFloat(cs.borderTopWidth) > 0; s.add((filled ? (cs.color === "rgb(255, 255, 255)" ? "primary" : "secondary") : bordered ? "outline" : "quiet")); }); return [...s].sort(); };
    isAdmin = true; applyMode(); openDetail(cafes.find(c => !c.wish).id, "list");
    const cafe = kinds("#pane-detail .btn, #pane-detail .handoff, #pane-detail .morebtn");
    show("settings"); renderSettings();
    const settings = kinds("#pane-settings .setactions button, #pane-settings .btn");
    return { cafe, settings };
  });
  eq(styles.cafe.length <= 3 && styles.settings.length <= 3, true, "the cafe page and Settings use at most three button styles (" + styles.cafe.join(", ") + " | " + styles.settings.join(", ") + ")");

  /* ---- 6: the Log form ---- */
  const small = await pg.evaluate(() => {
    isAdmin = true; applyMode(); _formSnap = null; openForm(cafes.find(x => !x.wish && (x.drinks || []).length > 2).id);
    const d = document.getElementById("f-details"); if (d) d.open = true;
    const m = document.getElementById("f-more"); if (m) m.open = true;
    return [...document.querySelectorAll("#pane-form button, #pane-form [role=button], #pane-form summary, #pane-form .tagpick .chip")]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[hidden]") && r.height < 40; })
      .map(e => String(e.className).split(" ")[0] + " " + Math.round(e.getBoundingClientRect().height));
  });
  eq(small, [], "nothing you tap on the Log form is under 40px tall");

  /* ---- 7: one overlay at a time on the map ---- */
  const map = await pg.evaluate(() => {
    setMapPanel(true); toggleLegend(true);
    const c = cafes.find(x => !x.wish && x.lat != null);
    try { onMarkerClick(c, null); } catch (e) { /* the peek card needs the map, which tests stub; the panel closes first */ }
    return { panel: document.getElementById("mapsearch").dataset.open, legend: (document.querySelector(".mapbox") || {}).dataset ? document.querySelector(".mapbox").dataset.legend : "" };
  });
  eq([map.panel, map.legend], ["false", ""], "tapping a pin closes the region menu and the legend before its card opens");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
