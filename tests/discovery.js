/* Finding a cafe, and what the app shows when there is nothing to find.

   U1  Verdict and area are filters you can combine with the type chip and the search box, with a
       live "N of M" line and one Clear that resets all of it. The map button shares the same
       filter, so what you see in the list is what it shows on the map. Cards lead with the one
       thing you open a cafe to learn: what to order.
   U3  A first paint shaped like the list, empty states that say why and offer the next step, and
       "Order again" under a cafe's name.
   U2  The tab bar is drawn, not typed. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const open = async (admin) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    /* Freeze the first paint: hold the data request until the skeleton has been read. The app replaces
       the placeholders when its data arrives, so with the data held the check no longer races the load
       (it used to fail about one run in four when the page was quick). Registered after the catch-all
       above, so it is matched first. */
    let release;
    const held = new Promise(r => { release = r; });
    await pg.route(u => new URL(u).pathname === "/cafes.json", async r => { await held; r.continue(); });
    await pg.goto(srv.origin + "/index.html", { waitUntil: "domcontentloaded" });
    const skel = await pg.evaluate(() => ({ cards: document.querySelectorAll("#grid .skel-card").length, busy: document.getElementById("grid").getAttribute("aria-busy") }));
    release();
    await pg.waitForTimeout(700);
    await pg.evaluate(admin => {
      isAdmin = admin; applyMode(); window.google = undefined;
      const mk = (id, name, area, rating, drinks, extra) => Object.assign({ id, name, area, rating, drinks: drinks || [], lat: 37.8, lng: -122.27 }, extra || {});
      const d = (n, dates) => ({ n, orders: dates.map(t => ({ date: t })) });
      cafes = [
        mk("a1", "Kettle & Kiln", "Downtown, CA", 5, [d("Matcha latte", ["2026-09-01", "2026-09-10", "2026-09-27"])]),
        mk("a2", "Hojicha House", "Downtown", 5, [d("Hojicha", ["2026-08-01"])]),
        mk("a3", "Ember Roasters", "Southside", 4, [d("Espresso", ["2026-07-02"])]),
        mk("a4", "Tin Cup Cafe", "Southside", 3, [d("Latte", ["2026-06-02"])]),
        mk("a5", "Paper Crane", "Shattuck", 1, [d("Pour-over", ["2026-05-02"])]),
        mk("w1", "Little Orbit", "Shattuck", 0, [], { wish: true }),
        mk("w2", "Moss & Mortar <b>x</b>", "Downtown", 0, [], { wish: true })
      ];
      activeChip = ""; favOnly = false; activeVerdict = ""; activeArea = ""; listTab = "been";
      show("list"); renderList();
    }, admin);
    return { ctx, pg, errs, skel };
  };

  const { ctx, pg, errs, skel } = await open(true);
  eq([skel.cards, skel.busy], [6, "true"], "the list first paints as 6 placeholder cards, marked busy, before any data has arrived");

  let r = await pg.evaluate(() => ({ busy: document.getElementById("grid").getAttribute("aria-busy"), skels: document.querySelectorAll("#grid .skel-card").length,
                                      cards: document.querySelectorAll("#grid .card").length }));
  eq(r, { busy: null, skels: 0, cards: 5 }, "…and they are replaced by the real cards, not left behind");
  r = await pg.evaluate(async () => { const css = await (await fetch("styles.css?x=" + Date.now())).text();
    return { reduced: /prefers-reduced-motion:reduce\)\{ \.skel\{ animation:none; \}/.test(css),
             sameHeight: /\.skel-card \.sk-ph\{ height:104px/.test(css) && /\.card \.ph\{ height:104px/.test(css) }; });
  eq(r, { reduced: true, sameHeight: true }, "the shimmer stops for reduced motion, and the placeholder photo is the card's height, so nothing jumps");

  // ---- U1: the filter groups -------------------------------------------------
  await pg.evaluate(() => { if (document.getElementById("listpanel").hidden) toggleListFilters(); });
  r = await pg.evaluate(() => ({
    verdicts: [...document.querySelectorAll("#verdictchips .chip")].map(c => c.textContent.replace(/\s+/g, " ").trim()),
    areas: [...document.querySelectorAll("#areachips .chip")].map(c => c.textContent.replace(/\s+/g, " ").trim()),
    labels: ["lab-type", "lab-verdict", "lab-area"].map(i => document.getElementById(i).textContent),
    result: document.getElementById("resultline").hidden }));
  eq(r.verdicts, ["Loved it 3", "It was fine 1", "Not for me 1"], "verdict chips carry their counts (4 and 5 stars are both \"loved\")");
  eq(r.areas, ["Downtown 2", "Southside 2"], "area chips group \"Downtown, CA\" with \"Downtown\", and a one-off area (Shattuck) gets no chip");
  eq(r.labels, ["Type", "Verdict", "Area"], "each group is labelled, for screen readers too");
  eq(r.result, true, "nothing filtered, so no result line");

  r = await pg.evaluate(() => { setVerdict("loved");
    const a = [...document.querySelectorAll("#grid .card .n")].map(n => n.textContent).sort();
    const line = document.getElementById("resultline").textContent.replace(/\s+/g, " ");
    setArea("Southside");
    const b = [...document.querySelectorAll("#grid .card .n")].map(n => n.textContent);
    return { a, line, b, badge: document.getElementById("fcount").textContent, fromMap: filteredCafes("").map(c => c.name) }; });
  eq(r.a, ["Ember Roasters", "Hojicha House", "Kettle & Kiln"], "Loved it narrows the list");
  eq(r.line, "3 of 5 placesClear", "…and says how many are showing, with Clear beside it");
  eq(r.b, ["Ember Roasters"], "adding an area combines with the verdict");
  eq(r.badge, "2", "the Filters badge counts both");
  eq(r.fromMap, ["Ember Roasters"], "the map button's list comes from the same filter, so it cannot drift from this one");

  r = await pg.evaluate(() => { document.getElementById("q").value = "espresso"; renderList();
    const typed = [...document.querySelectorAll("#grid .card .n")].map(n => n.textContent);
    clearAll();
    return { typed, q: document.getElementById("q").value, cards: document.querySelectorAll("#grid .card").length, line: document.getElementById("resultline").hidden, v: activeVerdict, a: activeArea }; });
  eq(r.typed, ["Ember Roasters"], "search still combines with the filters");
  eq([r.q, r.cards, r.line, r.v, r.a], ["", 5, true, "", ""], "Clear resets the search and every filter at once");

  r = await pg.evaluate(() => { setListTab("want"); return { hidden: document.getElementById("verdictgroup").hidden, cards: document.querySelectorAll("#grid .card").length }; });
  eq(r, { hidden: true, cards: 2 }, "the Want tab has no verdict filter — a place you have not been has no verdict");

  // ---- U1: card hierarchy -------------------------------------------------------
  r = await pg.evaluate(() => { setListTab("been"); const cards = [...document.querySelectorAll("#grid .card")];
    const by = n => cards.find(c => c.querySelector(".n").textContent === n);
    const k = by("Kettle & Kiln");
    const order = [...k.querySelectorAll(".b > div")].map(d => d.className);
    setListLayout(true); const hiddenCompact = getComputedStyle([...document.querySelectorAll("#grid .card")].find(c => c.querySelector(".n").textContent === "Kettle & Kiln").querySelector(".cdrink")).display; setListLayout(false);
    setListTab("want"); const wishDrink = document.querySelectorAll("#grid .cdrink").length; setListTab("been");
    return { text: k.querySelector(".cdrink .cdn").textContent, order, hiddenCompact, wishDrink }; });
  eq(r.text, "Order the Matcha latte", "a card says what to order");
  eq(r.order, ["n", "m", "cdrink"], "…in the order name, where, then the drink");
  eq([r.hiddenCompact, r.wishDrink], ["none", 0], "the compact list stays one line per cafe, and a place you have not been has no order to suggest");

  // ---- U3: empty states -----------------------------------------------------------
  r = await pg.evaluate(() => { cafes = cafes.filter(c => !c.wish); setListTab("want");
    const e = document.querySelector("#grid .emptyx");
    return { title: e.querySelector("h3").textContent, art: !!e.querySelector("svg.emptyart[aria-hidden='true']"), btn: (e.querySelector("button") || {}).textContent }; });
  eq(r, { title: "Nothing to try yet", art: true, btn: "Save a place" }, "an empty wishlist says so, shows art, and offers to save a place (owner)");

  r = await pg.evaluate(() => { setListTab("been"); document.getElementById("q").value = 'xx<img src=x onerror=1>'; renderList();
    const e = document.querySelector("#grid .emptyx");
    return { title: e.querySelector("h3").textContent, injected: e.querySelectorAll("img").length, body: e.querySelector("p").textContent, btn: e.querySelector("button").textContent }; });
  eq([r.title, r.injected, r.btn], ["No matches", 0, "Clear filters"], "no matches offers Clear, and what you typed cannot inject markup");
  eq(/xx<img src=x onerror=1>/.test(r.body), true, "…it is shown back to you as text");
  r = await pg.evaluate(() => { document.querySelector("#grid .emptyx button").click(); return { q: document.getElementById("q").value, cards: document.querySelectorAll("#grid .card").length }; });
  eq(r, { q: "", cards: 5 }, "…and the button really clears it");

  r = await pg.evaluate(() => { favOnly = true; renderList(); const e = document.querySelector("#grid .emptyx"); const t = e.querySelector("h3").textContent; favOnly = false; renderList(); return t; });
  eq(r, "No favorites yet", "no favourites keeps its own wording");

  // ---- U3: order again ---------------------------------------------------------------
  r = await pg.evaluate(() => { openDetail("a1", "list"); const el = document.getElementById("d-orderagain");
    const t = el.textContent, shown = !el.hidden; openDetail("a5", "list"); const t2 = document.getElementById("d-orderagain").textContent;
    return { t, shown, t2 }; });
  eq([r.shown, r.t], [true, "Order again: Matcha latte · 3× · last Sep 27, 2026"], "a cafe page says what to order, how often, and when last");
  eq(r.t2, "Order again: Pour-over · 1× · last May 2, 2026", "…for every cafe with a history");

  // ---- U2: the tab bar is drawn ---------------------------------------------------------
  r = await pg.evaluate(() => { const tabs = document.querySelectorAll(".tabbar .tab");
    const emoji = /[☀-➿\u{1F300}-\u{1FAFF}️＋]/u;
    return { svgs: document.querySelectorAll(".tabbar svg").length, withText: [...tabs].filter(t => emoji.test(t.textContent)).length,
             color: [...document.querySelectorAll(".tabbar .ti svg")].every(s => getComputedStyle(s).stroke !== "none") }; });
  eq([r.svgs, r.withText, r.color], [6, 0, true], "six tab icons are inline SVG, and none leaves an emoji in the tab bar");

  eq(errs, [], "no page errors (owner)");
  await ctx.close();

  // ---- a viewer gets no button for something they cannot do ---------------------------------
  const v = await open(false);
  r = await v.pg.evaluate(() => { cafes = cafes.filter(c => !c.wish); setListTab("want"); const e = document.querySelector("#grid .emptyx");
    return { title: e.querySelector("h3").textContent, btn: !!e.querySelector("button") }; });
  eq(r, { title: "Nothing to try yet", btn: false }, "a viewer sees the empty state without an Add button");
  eq(v.errs, [], "no page errors (viewer)");
  await v.ctx.close();

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
