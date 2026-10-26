/* One-tap ways in, for a friend and for the owner.

   A friend opening the app wants "where should I go", not a filter panel: four guides under the
   tabs (Top 10, Best tea, Go-to, Near me), a search box that says how many spots there are, and a
   card that says what to order and what it costs. The owner gets three working views inside
   Filters, where they cost no height at rest, and a + on each card that opens that cafe's visit
   with the usual drink already in it. Two columns at 375px, not one. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const seed = admin => pg.evaluate(a => {
    isAdmin = a; applyMode(); userLoc = null; clearAll(); listTab = "been";
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    cafes = [];
    for (let i = 1; i <= 12; i++)
      cafes.push({ id: "c" + i, name: "Cafe " + i, area: "Area " + (i % 3), lat: i <= 4 ? 37.78 + i / 1000 : 25.04, lng: i <= 4 ? -122.41 : 121.56,
        rating: 5, elo: 1700 - i * 10, matches: 4,
        drinks: [{ n: i % 2 ? "Hojicha latte" : "Flat white", orders: [{ date: day(i), p: i === 1 ? 7.25 : "", reorder: i <= 3 ? "yes" : "" }] }] });
    cafes.push({ id: "u", name: "Unranked One", area: "Area 0", rating: 3, drinks: [{ n: "Drip", orders: [{ date: day(90), p: 4 }] }] });
    cafes.push({ id: "w", name: "Someday", wish: true, drinks: [] });
    setListLayout(false); show("list"); renderList();
    const q = s => [...document.querySelectorAll(s)];
    const names = () => q("#grid .card .n").map(e => e.textContent);
    return { ok: true, n: names().length };
  }, admin);

  // ---- a viewer ----
  await seed(false);
  const v = await pg.evaluate(() => {
    const row = document.getElementById("guiderow"), btns = [...row.querySelectorAll("button")];
    const cards = [...document.querySelectorAll("#grid .card")];
    const tops = [...new Set(cards.slice(0, 4).map(c => Math.round(c.getBoundingClientRect().top)))];
    return { shown: !row.hidden, labels: btns.map(x => x.textContent.trim()), tall: btns.every(x => x.getBoundingClientRect().height >= 44),
             ph: document.getElementById("q").placeholder, again: !!document.querySelector(".card .again"),
             cols: tops.length, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  eq(v.shown, true, "a viewer sees the guide row under the tabs");
  eq(v.labels, ["🏆 Top 10", "☕ Best coffee", "🍵 Best tea", "🔁 Go-to", "📍 Near me"], "…five guides, Best coffee beside Best tea");
  eq(v.tall, true, "…each at the 44px touch floor");
  eq(/^13 spots/.test(v.ph), true, "the search box says how many spots there are (" + v.ph + ")");
  eq(v.again, false, "no card carries a + any more: the order line is information, the bottom bar is the way to log");
  eq(v.cols, 2, "the first four cards sit in two rows of two at 375px, not one long column");
  eq(v.doc <= v.win + 1, true, "nothing scrolls sideways");

  const price = await pg.evaluate(() => {
    const c = [...document.querySelectorAll("#grid .card")].find(x => x.querySelector(".n").textContent === "Cafe 1");
    const d = c.querySelector(".cdrink");
    return { text: d.querySelector(".cdn").textContent, price: (d.querySelector(".cdp") || {}).textContent || "" };
  });
  eq(price, { text: "Order the Hojicha latte", price: "$7.25" }, "the order line says what to order, and what it cost");
  const noPrice = await pg.evaluate(() => {
    const c = [...document.querySelectorAll("#grid .card")].find(x => x.querySelector(".n").textContent === "Cafe 2");
    return !c.querySelector(".cdp");
  });
  eq(noPrice, true, "…and says nothing about price when there is none, rather than $0.00");

  const guide = async g => pg.evaluate(k => { setGuide(k); const names = [...document.querySelectorAll("#grid .card .n")].map(e => e.textContent);
    return { names, pressed: [...document.querySelectorAll("#guiderow button")].filter(x => x.getAttribute("aria-pressed") === "true").length }; }, g);
  let r = await guide("top10");
  eq(r.names.length, 10, "Top 10 shows ten places");
  eq(r.names[0], "Cafe 1", "…best first");
  eq(r.pressed, 1, "…and the button says it is on");
  r = await guide("top10");
  eq(r.pressed, 0, "tapping it again turns it off");
  r = await guide("goto");
  eq(r.names, ["Cafe 1", "Cafe 2", "Cafe 3"], "Go-to shows only places with a drink you would order again");
  r = await guide("near");
  eq(r.names.length, 13, "Near me filters nothing until the app has a position, instead of an empty list");
  await pg.evaluate(() => { userLoc = { lat: 37.78, lng: -122.41 }; renderList(); });
  r = await pg.evaluate(() => [...document.querySelectorAll("#grid .card .n")].map(e => e.textContent));
  eq(r.length, 4, "…and with one it keeps only what is within 25 miles");
  const cleared = await pg.evaluate(() => { clearAll(); return document.querySelectorAll("#grid .card").length; });
  eq(cleared, 13, "Clear drops a guide with everything else");

  // ---- the owner ----
  await seed(true);
  const o = await pg.evaluate(() => {
    const row = document.getElementById("guiderow");
    const chips = [...document.querySelectorAll("#quickchips .chip")].map(c => c.textContent.replace(/\s+/g, " ").trim());
    return { rowHidden: row.hidden, plus: document.querySelectorAll("#grid .card .again").length, chips };
  });
  eq(o.rowHidden, true, "the owner has no guide row, so their chrome does not grow");
  eq(o.plus, 0, "the owner's cards carry no + either: logging again is the bar at the bottom of the cafe page");
  eq(o.chips.length, 3, "Recent, Unranked and Needs price live inside Filters");
  const un = await pg.evaluate(() => { setGuide("unranked"); return { names: [...document.querySelectorAll("#grid .card .n")].map(e => e.textContent), badge: document.getElementById("fcount").textContent }; });
  eq(un.names, ["Unranked One"], "Unranked shows the cafe that has never been compared");
  eq(un.badge, "1", "…and the Filters badge counts it, because the panel is where it lives");
  await pg.evaluate(() => clearAll());

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
