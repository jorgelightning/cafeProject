/* One set of parts (UI audit, 26 Oct).

   The app had grown about twenty-five chip styles, four card styles on Stats, two back buttons, three icon languages
   and a visitor's verdict that changed from screen to screen. This holds the fixes: one header and back button, one
   chip, drawn marks for drinks, options as one line, one word for visitors everywhere outside Go, a List a visitor
   can read (by last visit, no "No visit date", no bare numbers for places), a quieter map whose pill follows the view,
   a wider laptop sidebar, Near me as the visitor's raised button, and one label style in the form. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const seed = admin => pg.evaluate(a => {
    const day = n => { const d = new Date(Date.now() - n * 86400000); return d.toISOString().slice(0, 10); };
    const mk = (id, extra) => Object.assign({ id, name: id, area: "San Francisco, CA", lat: 37.77, lng: -122.42, rating: 5, matches: 10, elo: 1500, drinks: [] }, extra);
    cafes = [
      mk("Recent", { elo: 1640, updated: new Date(Date.now() - 60 * 86400000).toISOString(),
        drinks: [{ n: "Flat White", orders: [{ id: "a1", date: day(2), p: "5", size: "8 oz", milk: "Oat", sweet: "0%", ice: "Warm" }] }] }),
      mk("Edited", { elo: 1600, updated: new Date().toISOString(),
        drinks: [{ n: "Hojicha latte", orders: [{ id: "b1", date: day(70), p: "7" }] }] }),
      mk("Tokyo", { area: "36", lat: 35.73, lng: 139.71, elo: 1560, drinks: [{ n: "Latte", orders: [{ id: "c1", p: "6" }] }] }),
      mk("Taipei", { area: "Ximen", lat: 25.04, lng: 121.5, elo: 1520, drinks: [{ n: "Milk tea", orders: [{ id: "d1", date: day(10), p: "4" }] }] }),
    ];
    privDetail = {};
    _sortChosen = false;
    isAdmin = a;
    applyMode();
  }, admin);

  /* ---- one header, one back button ---- */
  await seed(false);
  const hd = await pg.evaluate(() => {
    const title = view => { show(view); if (view === "compare") renderBoard(); return (document.querySelector("#pane-" + view + " .pagehead .ct") || {}).textContent || null; };
    const backs = [...document.querySelectorAll("#pane-settings .backbtn, #pane-form .backbtn")].map(x => ({ svg: !!x.querySelector("svg"), text: x.textContent.trim() }));
    return { go: title("compare"), stats: title("stats"), settings: title("settings"), backs, oldBack: document.querySelectorAll("#app .iconbtn[aria-label='Back']").length };
  });
  eq([hd.go, hd.stats, hd.settings], ["Where to go", "Jorge’s numbers", "Settings"], "Go, Stats and Settings open with the same header");
  eq(hd.backs, [{ svg: true, text: "" }, { svg: true, text: "" }], "Settings and the form have one back button, drawn, not a typed “‹”");
  eq(hd.oldBack, 0, "…and the grey square back buttons are gone");

  /* ---- one chip ---- */
  const chips = await pg.evaluate(() => {
    show("list"); renderList(); show("compare"); renderBoard();
    const pick = [document.querySelector("#guiderow button"), document.querySelector("#cmp-body .gochip:not(.p)"), document.querySelector('#cmp-body .gokinds button[aria-pressed="false"]')];
    const look = el => { const s = getComputedStyle(el); return [parseFloat(s.borderTopLeftRadius) >= 22, s.fontWeight, s.fontSize, s.boxShadow === "none"]; };
    const on = document.querySelector('#cmp-body .gokinds button[aria-pressed="true"]');
    const ink = getComputedStyle(document.body).color;
    return { looks: pick.map(el => (el ? look(el) : null)), onBg: on && getComputedStyle(on).backgroundColor, ink, emoji: [...document.querySelectorAll("#guiderow button")].some(x => /\p{Extended_Pictographic}/u.test(x.textContent)), icons: document.querySelectorAll("#guiderow button svg").length };
  });
  eq(chips.looks.every(l => l && JSON.stringify(l) === JSON.stringify(chips.looks[0])), true, "a List guide, a Go chip and a Go kind are one chip: pill, same weight and size, no shadow (" + JSON.stringify(chips.looks) + ")");
  eq(chips.onBg, chips.ink, "…and a chosen chip is filled with the ink colour");
  eq([chips.emoji, chips.icons], [false, 5], "the guides carry line icons, not emoji");

  /* ---- drawn drink marks, options as one line ---- */
  const dr = await pg.evaluate(() => {
    openDetail("Recent", "list");
    const card = document.querySelector("#d-drinks .drinkcard");
    return {
      mark: !!card.querySelector(".drinkicon svg.mkv[data-k='coffee']"),
      text: card.querySelector(".drinkicon").textContent.trim(),
      order: !!document.querySelector("#d-orderagain .oa-gl svg.mkv"),
      opts: card.querySelector(".drinksum .dopts").textContent,
      pills: card.querySelectorAll(".drinksum .mpill").length,
    };
  });
  eq([dr.mark, dr.text, dr.order], [true, "", true], "a drink is drawn with its kind's vessel, as cafe tiles are, in the list and in What to order");
  eq([dr.opts, dr.pills], ["8 oz · oat · no sugar · warm", 0], "its options read as one quiet line, not four coloured pills");

  /* ---- one word for visitors ---- */
  const vs = await pg.evaluate(() => {
    setListLayout(true);
    show("list"); renderList();
    const row = [...document.querySelectorAll("#grid .card")].find(c => c.querySelector(".n").textContent === "Recent");
    openPeek("Recent");
    const pk = $("peek");
    return { row: row.querySelector(".tierchip") && row.querySelector(".tierchip").textContent, rank: row.querySelectorAll(".rkcol:not(.tierchip)").length,
             peek: pk.querySelector(".bkpill.tier") && pk.querySelector(".bkpill.tier").textContent, peekRank: !!pk.querySelector(".dranktile"), tile: !!pk.querySelector(".peektile svg") };
  });
  eq([vs.row, vs.rank], ["Must go", 0], "a visitor's List row says the same word as the cafe page, not a position");
  eq([/^Must go/.test(vs.peek || ""), vs.peekRank, vs.tile], [true, false, true], "…and so does the map preview, with the cafe's mark where the number was");
  await pg.evaluate(() => closePeek());

  /* ---- a List a visitor can read ---- */
  const ls = await pg.evaluate(() => {
    show("list"); renderList();
    const cards = [...document.querySelectorAll("#grid .card")];
    return {
      sort: sortMode,
      order: cards.map(c => c.querySelector(".n").textContent),
      bands: [...document.querySelectorAll("#grid .band")].map(x => x.textContent),
      tokyo: cards.find(c => c.querySelector(".n").textContent === "Tokyo").querySelector(".m").textContent,
      noDate: cards.some(c => /No visit date/.test(c.textContent)),
      badge: $("fcount").hidden,
    };
  });
  eq(ls.sort, "visited", "a visitor's List opens by last visit, the date each row shows");
  eq(ls.order.slice(0, 3), ["Recent", "Taipei", "Edited"], "…newest visit first, whatever was edited last");
  eq(/^This week/.test(ls.bands[0] || ""), true, "…so “This week” means visited this week (" + ls.bands.join(", ") + ")");
  eq([/Japan/.test(ls.tokyo), /\b36\b/.test(ls.tokyo), ls.noDate], [true, false, false], "a bare number is not shown as a place, and no row says “No visit date” (" + ls.tokyo + ")");
  eq(ls.badge, true, "…and the default order is not counted as a filter");
  await seed(true);
  eq(await pg.evaluate(() => { show("list"); renderList(); return sortMode; }), "recent", "the owner's List still opens on what was edited last");

  /* ---- the map pill follows the view ---- */
  const pill = await pg.evaluate(() => {
    const ca = regionOf(cafes[0]).val;
    setPillLabel(ca);
    const before = $("pill-lbl").textContent.trim();
    const was = gmap;
    gmap = { getBounds: () => ({ contains: p => p.lng > 100 }) };
    syncPillToView();
    const after = $("pill-lbl").textContent.trim();
    gmap = was;
    return { before, after, quiet: MAP_STYLES.some(s => s.featureType === "transit") };
  });
  eq([pill.before, pill.after], ["California", "All places"], "the map pill stops naming California once the map shows somewhere else");
  eq(pill.quiet, true, "the map style hides transit, among the rest of the noise");

  /* ---- the form: one label style ---- */
  const fm = await pg.evaluate(() => {
    openForm();
    const u = document.querySelector(".usuallbl"), m = document.querySelector("#f-drinks .drmore");
    const r = { caps: u ? getComputedStyle(u).textTransform : "none", row: m ? getComputedStyle(m).borderTopStyle : "none" };
    _formSnap = null;
    show("list");
    return r;
  });
  eq(fm, { caps: "none", row: "solid" }, "the form's labels share one style, and a cup's options are a row you can see");

  /* ---- Near me is the visitor's raised button ---- */
  await seed(false);
  await pg.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, bad) => setTimeout(() => bad({ code: 1 }), 10); });
  const nm = await pg.evaluate(() => { const t = $("t-near"); return { shown: !!(t && t.offsetParent), label: t && t.textContent.trim(), find: !!$("t-find") }; });
  eq(nm, { shown: true, label: "Near me", find: false }, "a visitor's raised button is Near me, not a second way into search");
  await pg.locator("#t-near").click();
  await pg.waitForFunction(() => !!document.querySelector("#cmp-body .gonear"));
  eq(await pg.evaluate(() => app.dataset.view), "compare", "…it opens Go, and with location off offers the regions");

  /* ---- the laptop sidebar ---- */
  await pg.setViewportSize({ width: 1280, height: 800 });
  await pg.waitForTimeout(200);
  const side = await pg.evaluate(() => Math.round(document.querySelector(".sidebar").getBoundingClientRect().width));
  eq(side >= 480, true, "on a 1280px laptop the sidebar is about 480px, not 420 (" + side + ")");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
