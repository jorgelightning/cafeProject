/* Three small ones (v120): long-press shortcuts, the year on pace, and a price in context.

   - manifest.json gives the home-screen icon Log a cup, Near me and Want to try, each a ?do= the app runs as it
     starts and then drops from the address. Log waits for the launch fix, so it opens on the cafe you are in.
   - Wrapped's first card carries the year's new cafés to Dec 31: "On pace for about 99 new by Dec 31."
   - The quick cup's price sits among every like cup you have priced, as dots on one line and a sentence. */
const { serve, launch, checker, ready, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  const srv = await serve();
  const b = await launch();

  /* ---- shortcuts ---- */
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  eq(man.shortcuts.map(s => [s.name, s.url]), [["Log a cup", "./?do=log"], ["Near me", "./?do=near"], ["Want to try", "./?do=want"]],
     "the icon's long-press menu: Log a cup, Near me, Want to try");
  eq(man.shortcuts.every(s => s.icons && s.icons[0].src === "icon-192.png"), true, "…each with the app's icon");

  /** @param {string} q @param {{owner?: boolean, fix?: boolean}} o */
  const start = async (q, o) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, geolocation: { latitude: 37.78, longitude: -122.46 },
      permissions: o.fix ? ["geolocation"] : [] });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
    if (o.owner) await pg.addInitScript(() => localStorage.setItem("cafemap.admin", "1"));
    const errs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html" + q, { waitUntil: "load" });
    await ready(pg);
    return { ctx, pg, errs };
  };
  let r = await start("?do=want", {});
  let s = await r.pg.evaluate(() => ({ view: app.dataset.view, tab: listTab, q: location.search, welcome: !$("dnsheet").hidden }));
  eq(s, { view: "list", tab: "want", q: "", welcome: false }, "?do=want opens the List on Want to try, drops ?do= from the address, and no welcome covers it");
  await r.ctx.close();

  r = await start("?do=near", {});
  eq(await r.pg.evaluate(() => app.dataset.view), "compare", "?do=near opens Go, the best places near you");
  await r.ctx.close();

  r = await start("?do=log", {});
  eq(await r.pg.evaluate(() => app.dataset.view), "compare", "a visitor has nothing to log, so their Log is Near me");
  await r.ctx.close();

  r = await start("?do=log", { owner: true });
  await r.pg.waitForFunction(() => app.dataset.view === "form", null, { timeout: 10000 });
  eq(await r.pg.evaluate(() => app.dataset.view), "form", "the owner's Log with no location fix waits a few seconds, then opens the new-cafe form as Log does");
  await r.ctx.close();

  /* with location already allowed, Log asks for a fix itself (the map never loads here) and opens on the cafe you are in */
  r = await start("?do=log", { owner: true, fix: true });
  await r.pg.evaluate(() => {
    cafes.push({ id: "here", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.78, lng: -122.46, rating: 5,
      drinks: [{ n: "Flat White", orders: [{ id: "f1", date: "2026-10-01", p: "5" }] }] });
  });
  await r.pg.waitForFunction(() => !$("dnsheet").hidden && /A cup at/.test(($("dns-title") || {}).textContent || ""), null, { timeout: 10000 }).catch(() => {});
  s = await r.pg.evaluate(() => ({ title: ($("dns-title") || {}).textContent, here: !!document.querySelector(".qchere") }));
  eq(s, { title: "A cup at Kissaten HiFi", here: true }, "with location allowed, Log opens the quick cup of the cafe you are in");
  eq(r.errs, [], "no page errors on any shortcut");
  await r.ctx.close();

  /* ---- the rest on one page ---- */
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r2 => (r2.request().url().startsWith(srv.origin) ? r2.continue() : r2.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  /* ---- on pace ---- */
  s = await pg.evaluate(() => [
    wrappedPace(82, "2026-10-28"),
    wrappedPace(5, "2026-01-20"),
    wrappedPace(2, "2026-10-28"),
    wrappedPace(82, "2026-12-31"),
    wrappedPace(10, "2024-07-01"),
  ]);
  eq(s, [99, 0, 0, 0, 20], "on pace: 82 new by Oct 28 is about 99; nothing in January, under three new, or on the last day; a leap year counts 366 days");
  s = await pg.evaluate(() => {
    const t = localToday(), y = t.slice(0, 4), d = (m, dd) => y + "-" + m + "-" + dd;
    const w = { year: +y, visits: 12, cafes: 10, fresh: 8 };
    const fresh = wrappedCards(w, false)[0].cap, review = wrappedCards(w, true)[0].cap;
    return { fresh: /On pace for about \d+ new by Dec 31\./.test(fresh) === (wrappedPace(8, t) > 0), review: /On pace/.test(review), d: d("01", "01") };
  });
  eq([s.fresh, s.review], [true, false], "the year so far carries the pace line (when there is one to say); a year in review never does");

  /* ---- a price in context ---- */
  await pg.evaluate(() => {
    const hl = (id, p, n) => ({ n: n || "Hojicha latte", orders: [{ id, date: "2026-09-0" + (id.length % 9 + 1), p }] });
    cafes = [
      { id: "km", name: "Kiss of Matcha", area: "Outer Sunset", lat: 37.76, lng: -122.48, rating: 5,
        drinks: [{ n: "Hojicha latte", orders: [{ id: "k1", date: "2026-10-16", p: "8.14", pc: "USD", size: "12 oz" }] }] },
      { id: "a", name: "Komeya No Bento", area: "SF", lat: 37.8, lng: -122.43, rating: 5, drinks: [hl("a1", "6.75")] },
      { id: "b", name: "Paper Son", area: "SF", lat: 37.78, lng: -122.39, rating: 4, drinks: [hl("b1", "4.88", "Hojicha Latte")] },
      { id: "c", name: "Hardware", area: "SF", lat: 37.74, lng: -122.45, rating: 4, drinks: [hl("c1", "8.50", "Iced hojicha latte")] },
      { id: "d", name: "Friend's Place", area: "", custom: true, lat: 37.7, lng: -122.4, rating: 4, drinks: [hl("d1", "11")] },
      /* not like it: a hojicha that is not a latte, and a latte that is not hojicha */
      { id: "e", name: "Tea Place", area: "SF", lat: 37.7, lng: -122.4, rating: 4, drinks: [hl("e1", "3", "Hojicha tea"), hl("e2", "20", "Matcha latte")] },
      { id: "f", name: "Solo", area: "SF", lat: 37.7, lng: -122.4, rating: 4, drinks: [{ n: "Cloud 9", orders: [{ id: "f1", date: "2026-08-08", p: "7.60" }] }] },
    ];
    privDetail = {};
    isAdmin = true;
    applyMode();
    openDetail("km", "list");
    openQuickCup("Hojicha latte");
  });
  s = await pg.evaluate(() => ({
    text: $("qc-ctx").querySelector("p").textContent,
    dots: $("qc-ctx").querySelectorAll(".qcs-dot").length,
    me: !!$("qc-ctx").querySelector(".qcs-me"),
    titles: [...$("qc-ctx").querySelectorAll(".qcs-dot title")].map(t => t.textContent),
  }));
  eq(s.text, "Your hojicha lattes: $4.88 to $11.00, middle $8.14. 2 of 5 cost more.", "the last price, $8.14, among every hojicha latte priced: range, middle, and how many cost more");
  eq([s.dots, s.me], [5, true], "…a dot for each, and this cup in the accent");
  eq(s.titles.includes("$11.00 · Hojicha latte, a private spot") && s.titles.includes("$4.88 · Hojicha Latte, Paper Son"), true,
     "…each dot names its drink and cafe on hover, and a private spot only as a private spot");
  await pg.locator("#qc-price").fill("4.50");
  eq(await pg.evaluate(() => $("qc-ctx").querySelector("p").textContent), "Your hojicha lattes: $4.88 to $11.00, middle $8.14. All 5 cost more.", "typing a price moves it along the line");
  await pg.locator("#qc-price").fill("");
  eq(await pg.evaluate(() => $("qc-ctx").querySelector("p").textContent), "Your hojicha lattes: $4.88 to $11.00, middle $8.14.", "with no price, just the range");

  /* a drink with too few priced to compare shows nothing */
  await pg.evaluate(() => { closeSheet(); openDetail("f", "list"); openQuickCup("Cloud 9"); });
  eq(await pg.evaluate(() => $("qc-ctx").innerHTML), "", "under four priced cups, nothing to compare, so nothing shows");
  s = await pg.evaluate(() => [priceKin("Flat white").label, priceKin("Latte").label, priceKin("Matcha Einspanner").label, priceKin("Taro milk tea").label]);
  eq(s, ["coffees", "lattes", "matcha drinks", "milk teas"], "drinks are named by their family");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
