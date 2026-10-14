/* Brand / chain detection.

   `brand` already grouped a cafe's other locations (detail page), but only when it was typed by
   hand: 10 of 121 cafes had one. Now the name says it. Stripping the location off a name, the
   spelling other cafes already use, a short seed list, and a name two cafes share all point at a
   brand; the form fills the box only while the person has not decided it, and the backfill only
   touches empty brands. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  // ---- names ----
  let r = await pg.evaluate(() =>
    [
      "Molly Tea (San Mateo)",
      "ChaHalo 茶话弄 - Berkeley",
      "Formosa Aroma 島嶼茶鄉 - San Jose, CA",
      "Tea House @ Stonestown",
      "Cafe #12",
      "Coffee or Tea?",
      "Plain Name",
      "(Hidden)",
    ].map(brandBaseName)
  );
  eq(
    r,
    ["Molly Tea", "ChaHalo 茶话弄", "Formosa Aroma 島嶼茶鄉", "Tea House", "Cafe", "Coffee or Tea?", "Plain Name", "(Hidden)"],
    "the location is stripped from a name — parentheses, dash, @ and #; a name that would vanish is kept"
  );
  r = await pg.evaluate(() => [brandKey("Coffee Or Tea"), brandKey("Coffee or Tea?"), brandKey("HeyTea (Stonestown Galleria)")]);
  eq(r, ["coffee or tea", "coffee or tea", "heytea"], "case and punctuation do not make a different brand");

  // ---- inference ----
  r = await pg.evaluate(() => {
    const L = [
      { id: "a", name: "Molly Tea (San Mateo)", brand: "Molly tea" },
      { id: "b", name: "Lone Wolf" },
      { id: "c", name: "Twin Beans - Oakland" },
      { id: "d", name: "Twin Beans (SF)" },
    ];
    const ib = (n, ex, seeds) => inferBrand(n, L, ex || null, seeds || KNOWN_BRANDS);
    return {
      existing: ib("Molly Tea - Cupertino"),
      seed: ib("Blue Bottle Coffee Oakland"),
      seedExact: ib("heytea"),
      shared: ib("Twin Beans - Berkeley"),
      lone: ib("Unique Place - Somewhere"),
      loneSelf: ib("Lone Wolf", "b"),
      selfOnly: ib("Twin Beans", "c").via,
      empty: ib("   "),
      noSeedFor: ib("Bluebird Cafe"),
    };
  });
  eq(r.existing, { brand: "Molly tea", via: "existing" }, "a brand another cafe already uses keeps its spelling");
  eq(r.seed, { brand: "Blue Bottle", via: "seed" }, "a name starting with a known chain files under it");
  eq(r.seedExact.brand, "HeyTea", "…whatever its capitalisation");
  eq(r.shared, { brand: "Twin Beans", via: "shared" }, "two cafes with the same base name are one brand");
  eq([r.lone, r.loneSelf, r.empty, r.noSeedFor], [null, null, null, null], "a one-off cafe gets no brand, and a prefix is not a chain (Bluebird is not Blue Bottle)");
  eq(r.selfOnly, "shared", "a cafe is not matched against itself, only against its twin");

  // ---- the form ----
  r = await pg.evaluate(() => {
    isAdmin = true;
    applyMode();
    cafes = [
      { id: "m1", name: "Molly Tea (San Mateo)", brand: "Molly tea", drinks: [] },
      { id: "x1", name: "Mine", brand: "My Group", drinks: [] },
    ];
    listTab = "been";
    _formSnap = null;
    openForm();
    const out = {};
    $("f-name").value = "Molly Tea - Cupertino";
    autoBrand();
    out.fill = $("f-brand").value;
    out.hint = $("f-brand-hint").textContent;
    $("f-name").value = "Molly Tea - Palo Alto";
    autoBrand();
    out.follows = $("f-brand").value;
    $("f-name").value = "Some Lone Cafe";
    autoBrand();
    out.cleared = $("f-brand").value + "|" + $("f-brand-hint").hidden;
    $("f-name").value = "Molly Tea - Cupertino";
    autoBrand();
    $("f-brand").value = "Typed By Me";
    $("f-brand").dispatchEvent(new Event("input", { bubbles: true }));
    $("f-name").value = "Blue Bottle Mint Plaza";
    autoBrand();
    out.typed = $("f-brand").value;
    $("f-brand").value = "";
    $("f-brand").dispatchEvent(new Event("input", { bubbles: true }));
    $("f-name").value = "Molly Tea - Fremont";
    autoBrand();
    out.clearedByHand = $("f-brand").value;
    openForm("x1");
    $("f-name").value = "Blue Bottle Somewhere";
    autoBrand();
    out.stored = $("f-brand").value;
    return out;
  });
  eq([r.fill, r.hint], ["Molly tea", "Detected: Molly tea"], "typing a chain's name fills the brand box and says so");
  eq(r.follows, "Molly tea", "the box follows the name while it is still the detector's own value");
  eq(r.cleared, "|true", "…and empties again when the name stops matching");
  eq(r.typed, "Typed By Me", "a brand you typed is never overwritten");
  eq(r.clearedByHand, "", "a brand you cleared stays cleared");
  eq(r.stored, "My Group", "a cafe that already has a brand keeps it when its name is edited");

  // ---- the backfill ----
  r = await pg.evaluate(() => {
    cafes = [
      { id: "a", name: "Twin Beans - Oakland", drinks: [] },
      { id: "b", name: "Twin beans (SF)", drinks: [] },
      { id: "c", name: "Blue Bottle Mint Plaza", drinks: [] },
      { id: "d", name: "Lone Wolf", drinks: [] },
      { id: "e", name: "Molly Tea (San Mateo)", brand: "Molly tea", drinks: [] },
      { id: "f", name: "Molly Tea - Cupertino", drinks: [] },
      { id: "g", name: "Twin Beans Berkeley", brand: "Chosen", drinks: [] },
    ];
    const before = JSON.stringify(cafes);
    isAdmin = true;
    const dry = backfillBrands(true);
    const untouched = JSON.stringify(cafes) === before;
    const plan = backfillBrands(false);
    return {
      dry: dry.map(p => p.id + ":" + p.brand),
      untouched,
      done: plan.length,
      brands: cafes.map(c => c.id + ":" + (c.brand || "")),
    };
  });
  eq(r.untouched, true, "the dry run writes nothing");
  eq(r.dry, ["a:Twin Beans", "b:Twin Beans", "c:Blue Bottle", "f:Molly tea"], "the plan: shared names, a seed chain, and a sibling of an existing brand — one spelling per group");
  eq(r.brands, ["a:Twin Beans", "b:Twin Beans", "c:Blue Bottle", "d:", "e:Molly tea", "f:Molly tea", "g:Chosen"], "applied: a one-off stays empty and a brand already set is never changed");

  // ---- the Settings button ----
  r = await pg.evaluate(() => {
    cafes = [{ id: "a", name: "Twin Beans - Oakland", drinks: [] }, { id: "b", name: "Twin Beans (SF)", drinks: [] }];
    updateBrandBtn();
    const on = [$("ab-brand").style.display, $("ab-brand").textContent];
    cafes.forEach(c => (c.brand = "Twin Beans"));
    updateBrandBtn();
    return { on, off: $("ab-brand").style.display };
  });
  eq(r, { on: ["", "🏷 Fill in 2 brands"], off: "none" }, "Settings offers the backfill with a count, and hides it when there is nothing to do");

  // ---- the real data: dry run only ----
  r = await pg.evaluate(async () => {
    const d = await (await fetch("cafes.json")).json();
    const L = Array.isArray(d) ? d : d.cafes;
    const plan = brandBackfillPlan(L, KNOWN_BRANDS);
    return { n: L.length, plan: plan.length, overwrote: plan.filter(p => (L.find(c => c.id === p.id).brand || "").trim()).length };
  });
  eq(r.overwrote, 0, "against the real cafes.json the plan never touches a cafe that has a brand (" + r.plan + " of " + r.n + " would be filled)");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close();
  srv.close();
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
