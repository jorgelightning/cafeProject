/* The List screen, cleaned up.

   Two things were wrong with it. Every card without a photo — which is every card, because
   photos are only fetched when a cafe is opened — got one of eight saturated hues hashed off
   its name, so 111 tiles carried 8 colours that meant nothing. And the controls above the
   grid ran to four stacked rows (search, chips, a count beside a sort menu, a layout toggle
   alone), 217px of chrome on a 390x844 phone before a single cafe appeared.

   A: the tint carries the rating, on the same scale the map pins use, with ink that stays
   legible on all five steps. C: the chips, the sort and the layout toggle fold into one
   Filters control that says how many are active. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

/* WCAG relative luminance, so the ink assertions are about contrast rather than about the
   particular hex values the palette happens to hold today. */
function lum(rgb) {
  const ch = rgb.map(x => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function hexRgb(h) { const v = parseInt(h.replace("#", ""), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
function ratio(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(700);

  const seed = () => pg.evaluate(() => {
    isAdmin = false; applyMode && applyMode();
    favOnly = false; listTab = "been"; activeChip = null; sortMode = "recent"; listCompact = false;
    cafes = [
      { id: "a", name: "Aurora Roasters",  area: "Honolulu", rating: 5, drinks: [] },
      { id: "z", name: "Zephyr & Vine",    area: "Honolulu", rating: 5, drinks: [] },
      { id: "m", name: "Midpoint Coffee",  area: "Oakland",  rating: 3, drinks: [] },
      { id: "u", name: "Unrated Corner",   area: "Seattle",             drinks: [] }
    ];
    document.getElementById("q").value = "";
    show("list"); renderList();
  });

  // ---------- A: the tint carries the rating ----------
  await seed();

  const tints = await pg.evaluate(() => {
    const of = id => {
      const el = document.querySelector('.card[data-id="' + id + '"] .ph');
      return { cls: el.className, bg: el.style.background || el.style.backgroundColor, ink: el.style.color };
    };
    return { a: of("a"), z: of("z"), m: of("m"), u: of("u"),
             steps: [0, 1, 2, 3, 4, 5].map(r => tintFor({ rating: r })) };
  });

  eq(/nophoto/.test(tints.a.cls), true, "a cafe with no photo gets the placeholder tile");
  eq(tints.a.bg === tints.z.bg, true,
     "two 5-star cafes with unrelated names are now the same colour");
  eq(tints.a.bg !== tints.m.bg, true, "…and a 3-star cafe is a different one");
  eq(tints.m.bg !== tints.u.bg, true, "…and an unrated cafe is different again");

  const uniq = [...new Set(tints.steps)];
  /* Four, not six: 4 and 5 were two names for "loved" and 1 and 2 for "not for me". The rank
     badge on the tile is what separates one loved cafe from another now. */
  eq(uniq.length, 4, "one colour per bucket plus unrated, not eight hashed hues");
  eq(tints.steps[5], await pg.evaluate(() => ratingColor(5)),
     "the tint is the same scale the map pins use");

  // ---------- A: the ink stays legible on every step ----------
  const ink = await pg.evaluate(() => {
    return [0, 1, 2, 3, 4, 5].map(r => { const t = tintFor({ rating: r }); return [t, inkOn(t)]; });
  });
  ink.forEach(([tint, on]) => {
    /* the dark ink is rgba(0,0,0,.72) over the tint, so composite it before measuring */
    const bg = hexRgb(tint);
    const fg = on === "#fff" ? [255, 255, 255] : bg.map(c => Math.round(c * (1 - 0.72)));
    const r = ratio(fg, bg);
    eq(r >= 3, true, "ink on " + tint + " clears 3:1 (" + r.toFixed(2) + ":1)");
  });
  eq(ink.some(p => p[1] === "#fff") && ink.some(p => p[1] !== "#fff"), true,
     "…which means the ink flips rather than being fixed white");

  const js = ["core", "list", "detail", "rank", "photos", "map", "form", "stats", "storage"]
    .map(f => fs.readFileSync(path.join(ROOT, "js", f + ".js"), "utf8")).join("\n");
  eq(/cafeColor/.test(js), false, "the name-hash palette is gone, not left behind unused");

  // ---------- C: one control row ----------
  const shape = await pg.evaluate(() => {
    const pane = document.getElementById("pane-list");
    const grid = document.getElementById("grid");
    const rows = [...pane.children].filter(el => !el.hidden && el.getBoundingClientRect().height > 0
                                                 && !el.classList.contains("scroll"));
    return {
      chrome: Math.round(grid.getBoundingClientRect().top - pane.getBoundingClientRect().top),
      rows: rows.length,
      panelHidden: document.getElementById("listpanel").hidden,
      inPanel: ["sortsel", "filterchips"]
        .map(id => !!document.getElementById("listpanel").querySelector("#" + id)),
      layoutMoved: !document.getElementById("listpanel").querySelector("#list-layout"),
      expanded: document.getElementById("filterbtn").getAttribute("aria-expanded"),
      doc: document.documentElement.scrollWidth, win: window.innerWidth
    };
  });

  eq(shape.rows, 2, "the controls are a search box and one bar, not four stacked rows");
  eq(shape.chrome <= 130, true,
     "…so the grid starts " + shape.chrome + "px down instead of 217px");
  eq(shape.panelHidden, true, "the panel is closed at rest");
  eq(shape.inPanel, [true, true], "sort and the filter chips both live inside it");
  eq(shape.layoutMoved, true, "…and the layout toggle does not — it is a preference, not a filter");
  eq(shape.expanded, "false", "…and the button says so");
  eq(shape.doc <= shape.win + 1, true, "nothing scrolls sideways");

  // ---------- C: nothing is lost behind the fold ----------
  const opened = await pg.evaluate(() => {
    toggleListFilters();
    const p = document.getElementById("listpanel"), b = document.getElementById("filterbtn");
    const vis = id => { const el = document.getElementById(id); const r = el.getBoundingClientRect();
                        return r.width > 0 && r.height > 0; };
    return { hidden: p.hidden, expanded: b.getAttribute("aria-expanded"),
             sort: vis("sortsel"),
             chips: p.querySelectorAll("#filterchips .chip").length };
  });
  eq(opened.hidden, false, "tapping Filters opens the panel");
  eq(opened.expanded, "true", "…and updates aria-expanded for a screen reader");
  eq(opened.sort, true, "sort is reachable once it is open");
  eq(opened.chips > 0, true, "…and so are the filter chips");

  // ---------- C: the badge says how many are on ----------
  const badge = await pg.evaluate(() => {
    const read = () => { const el = document.getElementById("fcount");
                         return { n: el.textContent, hidden: el.hidden,
                                  on: document.getElementById("filterbtn").classList.contains("on") }; };
    const at = {};
    renderList(); at.rest = read();
    sortMode = "rating"; renderList(); at.sorted = read();
    favOnly = true; renderList(); at.favSorted = read();
    favOnly = false; sortMode = "recent"; renderList(); at.back = read();
    return at;
  });
  eq(badge.rest, { n: "", hidden: true, on: false }, "no badge when nothing is filtered");
  eq(badge.sorted, { n: "1", hidden: false, on: true }, "changing the sort counts as one");
  eq(badge.favSorted, { n: "2", hidden: false, on: true }, "…favourites only makes it two");
  eq(badge.back, { n: "", hidden: true, on: false }, "…and clearing both puts it away");

  eq(errs, [], "no page errors");

  const ok = done();
  await ctx.close(); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
