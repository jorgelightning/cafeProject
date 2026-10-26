/* What a visitor reads, from the user test of 26 Oct.

   A friend opening a cafe had to scroll past every drink to find Directions, read "Loved it" next to "#86 of 115",
   saw two "#20"s one row apart, and was told "Your drink" in Stats, which is not theirs. Now: a Directions, Hours
   and Share row under the name; one word for how good a place is (Must go, Great, Good, Okay, Skip it) instead of
   the number; "=20" for a shared position; Stats in the owner's name; and the region menu files "Cupertino, CA"
   under Cupertino rather than as a second town. */
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
    const Y = new Date().getFullYear();
    const mk = (i, extra) => Object.assign({
      id: "c" + i, name: "Cafe " + i, area: "San Francisco, CA", lat: 37.77 + i / 1000, lng: -122.42, rating: 5, elo: 1650 - i * 6, matches: 10,
      drinks: [{ n: "Flat White", orders: [{ id: "o" + i, date: Y + "-03-0" + (1 + (i % 9)), p: "5", size: "8 oz", sweet: "0%" }] }],
    }, extra || {});
    const list = [];
    for (let i = 1; i <= 30; i++) list.push(mk(i));
    list[24].rating = 3;                                  /* a "fine" far down the list */
    list[27].rating = 1;                                  /* a "not for me" */
    list[28].elo = list[29].elo = 1470;                   /* two cafes on one score */
    list.push(mk(31, { name: "Cupertino One", area: "Cupertino", lat: 37.32, lng: -122.03 }));
    list.push(mk(32, { name: "Cupertino Two", area: "Cupertino, CA", lat: 37.33, lng: -122.04, pid: "PLACE123" }));
    list.push({ id: "pv", name: "Friend's Place", custom: true, lat: null, lng: null, area: "", rating: 5, drinks: [] });
    cafes = list;
    privDetail = {};
    isAdmin = a;
    applyMode();
    return true;
  }, admin);

  /* ---- the cafe page, as a visitor ---- */
  await seed(false);
  const v = await pg.evaluate(() => {
    const read = id => {
      openDetail(id, "list");
      return {
        pill: $("d-stars").textContent.trim(),
        tile: $("d-rank").hidden,
        go: [...document.querySelectorAll("#d-go > *")].filter(e => !e.hidden).map(e => e.textContent.trim()),
        hours: $("d-go-hours").getAttribute("href"),
      };
    };
    return { first: read("c1"), eleventh: read("c11"), fifteenth: read("c15"), fine: read("c25"), meh: read("c28"), cup: read("c32"), priv: read("pv") };
  });
  eq([v.first.pill, v.first.tile], ["Must go · top 4", true], "a visitor reads one word for how good the top place is, and no number (the top tenth of 32)");
  eq(v.eleventh.pill, "Great · top 40%", "…Great inside the top 40%");
  eq(v.fifteenth.pill, "Good", "…Good for the rest of what was loved");
  eq(v.fine.pill, "Okay", "…Okay for a “fine” outside the top 40%");
  eq(v.meh.pill, "Skip it", "…and Skip it for a “not for me”, wherever it sits");
  eq(v.first.go, ["Directions", "Hours", "Share"], "Directions, Hours and Share sit under the name");
  const once = await pg.evaluate(() => {
    openDetail("c1", "list");
    const shown = [...document.querySelectorAll("#pane-detail button, #pane-detail a")].filter(e => e.offsetParent && e.getClientRects().length);
    return ["Directions", "Share"].map(w => shown.filter(e => new RegExp("^" + w).test(e.textContent.trim())).length);
  });
  eq(once, [1, 1], "…and only there: the page has one Directions and one Share, not a second pair at the bottom");
  eq(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Cafe%201%20San%20Francisco%2C%20CA$/.test(v.first.hours), true, "Hours opens the cafe on Google Maps (" + v.first.hours + ")");
  eq(/&query_place_id=PLACE123$/.test(v.cup.hours), true, "…the exact place when there is a place id");
  eq([v.priv.go, v.priv.hours], [["Share"], "#"], "a private spot has neither Directions nor Hours: it is somebody's home");

  /* ---- ties ---- */
  const t = await pg.evaluate(() => {
    show("list"); renderList();
    const ranks = [...document.querySelectorAll("#grid .card")].filter(c => /Cafe (29|30)$/.test(c.querySelector(".n").textContent)).map(c => c.querySelector(".rkcol").textContent);
    show("compare"); renderBoard();
    const board = [...document.querySelectorAll("#cmp-body .lbrow")].filter(r => /Cafe (29|30)$/.test(r.querySelector(".lbname").textContent)).map(r => r.querySelector(".lbrank").textContent);
    const rm = rankMap();
    return { ranks, board, text: [rankText(rm.c29, rm), rankText(rm.c1, rm)], enumerable: Object.keys(rm).indexOf("_tied") };
  });
  eq(t.ranks.length === 2 && t.ranks[0] === t.ranks[1] && /^=\d+$/.test(t.ranks[0]), true, "two cafes on one score both read “=N” on the List (" + t.ranks.join(", ") + ")");
  eq(t.board.length === 2 && t.board.every(x => /^=\d+$/.test(x)), true, "…and on Go (" + t.board.join(", ") + ")");
  eq(t.text[1], "#1", "a position nobody shares is still #N");
  eq(t.enumerable, -1, "the tie counts stay out of the rank map's cafe ids");

  /* ---- the owner keeps the number ---- */
  await seed(true);
  const o = await pg.evaluate(() => { openDetail("c1", "list"); return { pill: $("d-stars").textContent.trim(), tile: $("d-rank").hidden, num: $("d-rank").textContent }; });
  eq(o, { pill: "Loved it", tile: false, num: "#1of 32" }, "the owner still reads the verdict and the position");

  /* ---- Stats in the owner's name ---- */
  const voice = admin => pg.evaluate(a => {
    isAdmin = a; applyMode(); show("stats");
    const body = document.getElementById("stats-body");
    const tabs = [...body.querySelectorAll(".stabs button")].map(x => x.textContent);
    body.querySelectorAll("[hidden]").forEach(e => e.removeAttribute("hidden"));
    return { tabs, text: body.innerText };
  }, admin);
  const vs = await voice(false);
  eq(vs.tabs, ["Jorge", "Habits", "Money"], "a visitor's first Stats tab is named for Jorge, not “You”");
  const yous = (vs.text.match(/\b(you|your|you’re|yours)\b/gi) || []);
  eq(yous, [], "…and nothing in Stats calls the visitor “you”");
  eq(/Jorge rated/.test(vs.text), true, "…the verdict line says whose ratings they are");
  const os = await voice(true);
  eq([os.tabs[0], /you rated/.test(os.text)], ["You", true], "the owner still reads “you”");

  /* ---- regions ---- */
  const r = await pg.evaluate(() => {
    renderLocationSelect();
    const opts = [...$("locsel").options];
    const cup = opts.filter(o => /Cupertino/.test(o.textContent)).map(o => o.textContent.trim());
    const one = opts.find(o => o.textContent.trim() === "Cupertino");
    setPillLabel(regionOf(cafes[0]).val);
    return { cup, n: one ? locationList(one.value).length : 0, pill: $("pill-lbl").textContent.trim() };
  });
  eq(r.cup, ["Cupertino"], "“Cupertino” and “Cupertino, CA” are one town in the region menu");
  eq(r.n, 2, "…and choosing it shows both cafes");
  eq(r.pill, "California", "the map pill names the region it opened on, not “World”");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
