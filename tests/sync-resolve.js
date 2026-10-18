/* Answering a sync conflict decides only what clashed.

   When two devices change the same cafe, the app merges what it can and asks only about the fields both changed:
   "Everything else was merged for you, pick which of these to keep." The two buttons used to keep one whole
   version, which threw the merge away with it. A phone and an iPad each log a visit and both change the rating:
   "Keep this phone's" deleted the iPad's visit and note, "Use the cloud's" deleted the phone's visit. Now the
   choice goes to the clashing fields and everything else stays merged. */
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

  const run = (scenario, useLocal) => pg.evaluate(([sc, useLocal]) => {
    const order = (id, date) => ({ id, date, p: 6 });
    const base = { id: "cx", name: "Test Cafe", rating: 4, review: "ok", drinks: [{ n: "Latte", orders: [order("o1", "2026-09-01")] }], updated: "2026-09-01T10:00:00Z" };
    const mine = JSON.parse(JSON.stringify(base)), theirs = JSON.parse(JSON.stringify(base));
    if (sc === "visits") {
      mine.rating = 5; mine.drinks[0].orders.push(order("o2", "2026-10-01"));
      theirs.rating = 3; theirs.review = "great now"; theirs.drinks[0].orders.push(order("o3", "2026-10-02"));
    } else if (sc === "orderEdits") {
      /* both corrected the same order's price; the iPad also added a drink */
      mine.drinks[0].orders[0].p = 7;
      theirs.drinks[0].orders[0].p = 8; theirs.drinks.push({ n: "Mocha", orders: [order("o9", "2026-10-03")] });
    } else if (sc === "deleted") {
      /* this phone deleted the cafe; the iPad logged a visit to it */
      theirs.drinks[0].orders.push(order("o3", "2026-10-02"));
    }
    const value = sc === "deleted" ? null : mine;
    isAdmin = true;
    cafes = cafes.filter(c => c.id !== "cx");
    if (value) cafes.push(JSON.parse(JSON.stringify(value)));
    syncPending = { cx: { token: "t", base: JSON.parse(JSON.stringify(base)), value: JSON.parse(JSON.stringify(value)), conflict: true, remote: JSON.parse(JSON.stringify(theirs)), conflictFields: ["x"] } };
    resolveSyncConflict(useLocal);
    const ids = v => (v && v.drinks ? v.drinks.flatMap(d => (d.orders || []).map(o => o.id)).sort() : []);
    const op = syncPending.cx, screen = cafes.find(c => c.id === "cx") || null;
    const pick = v => v && { rating: v.rating, review: v.review, orders: ids(v), price: v.drinks && v.drinks[0] && v.drinks[0].orders[0].p, drinks: (v.drinks || []).map(d => d.n).sort() };
    const out = { pending: !!op, conflict: !!(op && op.conflict), baseIsCloud: !!op && syncEqual(op.base, theirs), toWrite: op ? pick(op.value) : null, screen: pick(screen) };
    syncPending = {}; cafes = cafes.filter(c => c.id !== "cx");
    return out;
  }, [scenario, useLocal]);

  let r = await run("visits", true);
  eq(r.toWrite && r.toWrite.orders, ["o1", "o2", "o3"], "Keep this phone's: both visits are written, the iPad's included");
  eq([r.toWrite.rating, r.toWrite.review], [5, "great now"], "…the phone's rating (the one that clashed) and the iPad's note (which did not)");
  eq([r.pending, r.conflict, r.baseIsCloud], [true, false, true], "…queued against what the cloud holds now, no longer a conflict");
  eq(r.screen && r.screen.orders, ["o1", "o2", "o3"], "…and the screen shows the merged cafe, not one side");

  r = await run("visits", false);
  eq(r.toWrite && r.toWrite.orders, ["o1", "o2", "o3"], "Use the cloud's: the phone's visit is kept too");
  eq([r.toWrite.rating, r.toWrite.review], [3, "great now"], "…with the cloud's rating, the one that clashed");
  eq(r.screen && r.screen.orders, ["o1", "o2", "o3"], "…and on screen");

  r = await run("orderEdits", true);
  eq([r.toWrite.price, r.toWrite.drinks], [7, ["Latte", "Mocha"]], "an order both corrected takes the chosen side's price, and the iPad's new drink stays");
  r = await run("orderEdits", false);
  eq([r.toWrite.price, r.toWrite.drinks], [8, ["Latte", "Mocha"]], "…the other way round too");

  r = await run("deleted", true);
  eq([r.pending, r.toWrite, r.screen], [true, null, null], "deleted here, visited there: keeping this phone's still deletes it, as asked");
  r = await run("deleted", false);
  eq([r.pending, r.screen && r.screen.orders], [false, ["o1", "o3"]], "…and using the cloud's brings it back with the visit, nothing left to send");

  /* the background merge, with no answer to give, is unchanged: a clash still asks */
  const bg = await pg.evaluate(() => {
    const base = { id: "q", rating: 4, drinks: [] }, a = Object.assign({}, base, { rating: 5 }), t = Object.assign({}, base, { rating: 3, review: "x" });
    const m = syncMerge(base, a, t);
    return { conflicts: m.conflicts.map(c => c.field), rating: m.value.rating, review: m.value.review };
  });
  eq(bg, { conflicts: ["rating"], rating: 5, review: "x" }, "the background merge still asks about a clash and merges the rest");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
