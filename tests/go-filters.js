/* Go by kind and region, Best coffee, and no dead ends (user test, 26 Oct).

   Go was one standing for gelato, boba and coffee across six countries, so "the best coffee in California" took
   scrolling. Now a region menu and a row of kinds filter it, counting positions inside what is shown. The List gets
   Best coffee beside Best tea. A search with no match offers the best places of the kind it was about instead of a
   "Clear filters" with nothing to clear, and Near me with location off offers regions instead of only a toast. */
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

  await pg.evaluate(() => {
    const at = { ca: [37.77, -122.42, "San Francisco, CA"], hi: [21.3, -157.83, "Kaimuki"], tw: [25.03, 121.5, "Ximen"] };
    const mk = (id, where, drink, elo) => ({
      id, name: id, area: at[where][2], lat: at[where][0], lng: at[where][1], rating: 5, elo, matches: 10,
      drinks: [{ n: drink, orders: [{ id: id + "o", date: "2026-03-01", p: "6" }] }],
    });
    cafes = [
      mk("TaiwanMatcha", "tw", "Matcha latte", 1640),
      mk("CaCoffeeA", "ca", "Flat White", 1630),
      mk("HiCoffee", "hi", "Flat White", 1620),
      mk("CaMatcha", "ca", "Hojicha latte", 1610),
      mk("CaCoffeeB", "ca", "Cortado", 1600),
      mk("CaBoba", "ca", "Brown sugar milk tea", 1590),
      mk("HiMatcha", "hi", "Matcha latte", 1580),
    ];
    privDetail = {};
    isAdmin = false;
    applyMode();
    /* location is refused, straight away */
    navigator.geolocation.getCurrentPosition = (ok, bad) => setTimeout(() => bad({ code: 1 }), 10);
  });

  const board = () => pg.evaluate(() => ({
    names: [...document.querySelectorAll("#cmp-body .lbrow .lbname")].map(e => e.textContent),
    ranks: [...document.querySelectorAll("#cmp-body .lbrow .lbrank")].map(e => e.textContent),
  }));

  /* ---- Go ---- */
  const c = await pg.evaluate(() => {
    show("compare"); renderBoard();
    return {
      regions: [...document.querySelectorAll("#cmp-body .goreg option")].map(o => o.textContent),
      kinds: [...document.querySelectorAll("#cmp-body .gokinds button")].map(x => x.textContent),
    };
  });
  eq(c.regions, ["Everywhere · 7", "California · 4", "Hawaii · 2", "Taiwan · 1"], "Go has a region menu, biggest first, with counts");
  eq(c.kinds, ["All", "Coffee", "Matcha", "Boba"], "…and a row of the kinds there are");
  await pg.evaluate(() => { setGoRegion(regionOf(cafes.find(x => x.id === "CaCoffeeA")).val); setGoKind("coffee"); });
  let r = await board();
  eq(r.names, ["CaCoffeeA", "CaCoffeeB"], "Coffee in California: only those, best first");
  eq(r.ranks, ["🥇", "🥈"], "…numbered inside what is shown, so the best coffee in California is first");
  const k = await pg.evaluate(() => [...document.querySelectorAll("#cmp-body .gokinds button")].map(x => x.textContent + ":" + x.getAttribute("aria-pressed")));
  eq(k, ["All:false", "Coffee:true", "Matcha:false", "Boba:false"], "…with Coffee shown as on");
  await pg.evaluate(() => goReset());
  r = await board();
  eq(r.names.length, 7, "All and Everywhere bring the whole standing back");

  /* ---- Near me, refused, on Go ---- */
  await pg.evaluate(() => { const nb = [...document.querySelectorAll("#cmp-body .gochip")].find(x => /Near me/.test(x.textContent)); nb.click(); });
  await pg.waitForFunction(() => !!document.querySelector("#cmp-body .gonear"));
  const near = await pg.evaluate(() => [...document.querySelectorAll("#cmp-body .gonear button")].map(x => x.textContent));
  eq(near, ["California", "Hawaii", "Taiwan"], "Near me with location off offers the regions on Go, not just a toast");
  await pg.locator("#cmp-body .gonear button", { hasText: "Hawaii" }).click();
  r = await board();
  eq(r.names, ["HiCoffee", "HiMatcha"], "…and picking one shows the best there");
  await pg.evaluate(() => { goReset(); _locFailed = false; });

  /* ---- the List: Best coffee ---- */
  const bc = await pg.evaluate(() => {
    show("list"); clearAll(); setGuide("coffee");
    return [...document.querySelectorAll("#grid .card .n")].map(e => e.textContent);
  });
  eq(bc, ["CaCoffeeA", "HiCoffee", "CaCoffeeB"], "Best coffee lists the loved coffee places, best first");

  /* ---- a search that finds nothing ---- */
  const s = await pg.evaluate(() => {
    clearAll();
    $("q").value = "pour over";
    renderList();
    const e = document.querySelector("#grid .emptyx");
    return {
      title: e.querySelector("h3").textContent,
      rows: [...e.querySelectorAll(".nearrow b")].map(x => x.textContent),
      buttons: [...e.querySelectorAll(".btn")].map(x => x.textContent),
    };
  });
  eq(s.title, "No “pour over” logged yet", "a search with no match says so plainly");
  eq(s.rows, ["CaCoffeeA", "HiCoffee", "CaCoffeeB"], "…and offers the best coffee places, since pour over is coffee");
  eq(s.buttons, ["Show all coffee"], "…with no Clear filters, because no filter is on");
  const f = await pg.evaluate(() => {
    activeChip = "matcha";
    $("q").value = "zzz";
    renderList();
    return [...document.querySelectorAll("#grid .emptyx .btn")].map(x => x.textContent);
  });
  eq(f, ["Clear filters"], "with a filter on, the empty list still offers to clear it");
  await pg.evaluate(() => clearAll());

  /* ---- Near me, refused, on the List ---- */
  await pg.evaluate(() => setGuide("near"));
  await pg.waitForFunction(() => !$("dnsheet").hidden);
  const sheet = await pg.evaluate(() => ({ title: $("dns-title").textContent, regions: [...document.querySelectorAll("#dns-panel .dntag")].map(x => x.textContent) }));
  eq(sheet, { title: "Where are you?", regions: ["California 4", "Hawaii 2", "Taiwan 1"] }, "on the List, Near me refused asks where you are");
  await pg.locator("#dns-panel .dntag", { hasText: "California" }).click();
  const after = await pg.evaluate(() => ({
    open: !$("dnsheet").hidden,
    names: [...document.querySelectorAll("#grid .card .n")].map(e => e.textContent),
    chip: [...document.querySelectorAll("#guiderow button")].find(x => x.getAttribute("aria-pressed") === "true").textContent,
  }));
  eq(after, { open: false, names: ["CaCoffeeA", "CaMatcha", "CaCoffeeB", "CaBoba"], chip: "📍 California" }, "…and the guide becomes that region, best first, and says so");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
