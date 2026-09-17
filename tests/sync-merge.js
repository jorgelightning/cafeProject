/* Automatic merging, and the cases where it must refuse.

   A conflict used to be declared by comparing the WHOLE record against the base this device
   started from, so two devices changing different things about the same cafe collided — a
   rating here, a drink there — and you were asked to choose between two versions mid-edit.
   That is not a disagreement, it is two people working on different fields.

   The merge below uses the base the outbox already captures. The dangerous direction is
   merging something it should have asked about, so most of this file is about refusals. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  const merge = (base, mine, theirs) => pg.evaluate(({ base, mine, theirs }) => {
    const r = syncMerge(base, mine, theirs);
    return { value: r.value, conflicts: r.conflicts.map(c => c.field) };
  }, { base, mine, theirs });

  const cafe = (over) => Object.assign({ id: "c1", name: "Kissaten HiFi", area: "San Francisco",
    rating: 4, review: "Cozy.", tags: ["cozy"], drinks: [], updated: "2026-09-01T00:00:00.000Z" }, over || {});

  // ============ what SHOULD merge ============
  let r = await merge(cafe(), cafe({ rating: 5 }), cafe({ area: "SoMa" }));
  eq(r.conflicts, [], "two devices changing different fields is not a conflict");
  eq({ rating: r.value.rating, area: r.value.area }, { rating: 5, area: "SoMa" },
     "…and both edits survive, which is the whole point");

  r = await merge(cafe(), cafe({ rating: 5 }), cafe({ rating: 5 }));
  eq(r.conflicts, [], "both sides reaching the same value is not a conflict either");
  eq(r.value.rating, 5, "…and that value is kept");

  r = await merge(cafe(), cafe(), cafe({ review: "Changed remotely." }));
  eq(r.conflicts, [], "a field only the cloud moved takes the cloud's value");
  eq(r.value.review, "Changed remotely.", "…without asking");

  r = await merge(cafe({ tags: ["cozy"] }), cafe({ tags: ["cozy", "quiet"] }), cafe({ tags: ["cozy"] }));
  eq(r.conflicts, [], "a list only one side changed merges");
  eq(r.value.tags, ["cozy", "quiet"], "…keeping that side's version");

  // ---- the common case: each device logs a different drink ----
  const withOrders = (orders) => cafe({ drinks: [{ n: "Hojicha latte", orders }] });
  const o1 = { id: "o1", date: "2026-09-01", p: "7" },
        o2 = { id: "o2", date: "2026-09-16", p: "7.5" },
        o3 = { id: "o3", date: "2026-09-17", p: "8" };
  r = await merge(withOrders([o1]), withOrders([o1, o2]), withOrders([o1, o3]));
  eq(r.conflicts, [], "each device adding a different order is not a conflict");
  eq(r.value.drinks[0].orders.map(o => o.id).sort(), ["o1", "o2", "o3"],
     "…both new orders are kept, none is lost");

  r = await merge(cafe({ drinks: [] }), cafe({ drinks: [{ n: "Flat white", orders: [o2] }] }),
                  cafe({ drinks: [{ n: "Matcha latte", orders: [o3] }] }));
  eq(r.conflicts, [], "each device adding a different drink is not a conflict");
  eq(r.value.drinks.map(d => d.n).sort(), ["Flat white", "Matcha latte"], "…and both drinks survive");

  // ---- deletions are respected, not undone ----
  r = await merge(withOrders([o1, o2]), withOrders([o1]), withOrders([o1, o2]));
  eq(r.conflicts, [], "deleting an order the other side left alone is not a conflict");
  eq(r.value.drinks[0].orders.map(o => o.id), ["o1"],
     "…and the deletion sticks — a merge must never resurrect what you removed");

  r = await merge(cafe({ drinks: [{ n: "Gone", orders: [o1] }] }), cafe({ drinks: [] }),
                  cafe({ drinks: [{ n: "Gone", orders: [o1] }] }));
  eq(r.value.drinks.length, 0, "a whole drink you deleted stays deleted");

  // ---- ranking metadata follows the better-informed side ----
  r = await merge(cafe({ elo: 1500, matches: 2 }), cafe({ elo: 1520, matches: 3 }),
                  cafe({ elo: 1470, matches: 9 }));
  eq(r.conflicts, [], "Elo is never worth interrupting somebody over");
  eq({ elo: r.value.elo, matches: r.value.matches }, { elo: 1470, matches: 9 },
     "…it follows whichever side has seen more comparisons");

  r = await merge(cafe({ updated: "2026-09-01T00:00:00.000Z" }),
                  cafe({ updated: "2026-09-16T10:00:00.000Z" }),
                  cafe({ updated: "2026-09-16T12:00:00.000Z" }));
  eq(r.conflicts, [], "the edited-at stamp is metadata, never a conflict");
  eq(r.value.updated, "2026-09-16T12:00:00.000Z", "…and the later one wins");

  // ============ what must NEVER merge ============
  r = await merge(cafe({ rating: 4 }), cafe({ rating: 5 }), cafe({ rating: 3 }));
  eq(r.conflicts, ["rating"], "the same field changed to two different values must be asked about");

  r = await merge(cafe(), cafe({ review: "Mine." }), cafe({ review: "Theirs." }));
  eq(r.conflicts, ["review"], "two different rewrites of the same note must be asked about");

  r = await merge(cafe(), null, cafe({ rating: 5 }));
  eq(r.conflicts.length > 0, true, "deleted here, edited there must be asked about");

  r = await merge(cafe(), cafe({ rating: 5 }), null);
  eq(r.conflicts.length > 0, true, "…and the same the other way round");

  r = await merge(cafe(), null, null);
  eq(r.conflicts, [], "both sides deleting it agree");
  eq(r.value, null, "…and it stays deleted");

  r = await merge(withOrders([o1]), withOrders([{ id: "o1", date: "2026-09-01", p: "9" }]),
                  withOrders([{ id: "o1", date: "2026-09-01", p: "6" }]));
  eq(r.conflicts.length > 0, true, "the same order priced differently on each side must be asked about");

  /* Legacy records predate order ids. Merging those by position would silently reshuffle
     prices between dates, so the whole drinks list falls back to all-or-nothing. */
  const noId = { date: "2026-09-01", p: "7" };
  r = await merge(cafe({ drinks: [{ n: "Old", orders: [noId] }] }),
                  cafe({ drinks: [{ n: "Old", orders: [noId, { date: "2026-09-16", p: "8" }] }] }),
                  cafe({ drinks: [{ n: "Old", orders: [noId, { date: "2026-09-17", p: "9" }] }] }));
  eq(r.conflicts.length > 0, true,
     "orders with no id are never merged by guesswork — it asks instead");

  // ---- a merge must not invent or drop fields ----
  r = await merge(cafe(), cafe({ brand: "Blue Bottle" }), cafe());
  eq(r.value.brand, "Blue Bottle", "a field only one side added is kept");
  r = await merge(cafe({ brand: "X" }), cafe(), cafe({ brand: "X" }));
  eq(r.value.brand === undefined, true, "…and a field one side removed stays removed");

  // ============ when it reconciles ============
  /* Incoming changes already arrive on a live listener. The gap was outgoing: a queue filled
     while offline waited for the next edit, and "online" often does not fire when a phone
     resumes from background. */
  r = await pg.evaluate(() => {
    let flushes = 0, privates = 0;
    window.flushSync = function(){ flushes++; };
    window.flushPrivate = function(){ privates++; };
    syncOnResume("test");
    document.dispatchEvent(new Event("visibilitychange"));
    return { flushes, privates, hasHook: typeof syncOnResume === "function" };
  });
  eq(r.hasHook, true, "there is a single place that reconciles on coming back");
  eq(r.flushes >= 1, true, "…which flushes whatever this device still owes the cloud");
  eq(r.privates >= 1, true, "…including a private address the cloud refused earlier");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
