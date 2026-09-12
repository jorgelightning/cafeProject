/* Logging a drink you have had before.

   "Hojicha latte" is the most-ordered drink on the map by a wide margin, and every one of
   those cups was typed out by hand. That produced five records that are the same drink spelled
   differently — "Hojica latte", "Hojicha lattye", "Houjicha Latte" — each with its own count
   and its own Elo, so the ranking was quietly being split.

   Three things are tested here: a shortcut that fills the drink in for you (so it is never
   retyped), a guard that asks before a near-miss becomes a new drink, and a cleanup for the
   ones already on record. The guard must ASK and never correct: "Hojicha latte (Snoopy
   version)" and "Hojicha Einspanner" are real, separate drinks. */
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

  /* A small, explicit map: one drink ordered a lot with consistent options, two of its
     misspellings, a deliberate variant, and some noise. */
  const seedCafes = () => pg.evaluate(() => {
    isAdmin = true; editId = null; picked = null; gReady = false;
    window.__saved = 0;
    save = function(){ window.__saved++; };
    saveCafe = function(){ window.__saved++; };
    cafes = [
      { id: "c1", name: "Kissaten HiFi", area: "Tokyo", tags: [], drinks: [
        { n: "Hojicha latte", orders: [
          { date: "2026-08-01", p: "7", size: "12 oz", sweet: "0%", ice: "Warm", milk: "Oat" },
          { date: "2026-08-09", p: "7", size: "12 oz", sweet: "0%", ice: "Warm", milk: "Oat" },
          { date: "2026-08-17", p: "7", size: "12 oz", sweet: "0%", ice: "Warm", milk: "Soy" }
        ], elo: 1560, matches: 6 },
        { n: "Hojicha latte (Snoopy version)", orders: [{ date: "2026-08-02", p: "8" }] }
      ]},
      { id: "c2", name: "SOHN", area: "Seoul", tags: [], drinks: [
        { n: "Hojicha latte", orders: [{ date: "2026-07-02", p: "6", ice: "Warm" }], elo: 1500, matches: 2 },
        { n: "Hojica latte",  orders: [{ date: "2026-07-20", p: "6" }], elo: 1400, matches: 9 }
      ]},
      { id: "c3", name: "Mashio Project", area: "Honolulu", tags: [], drinks: [
        { n: "Hojica latte", orders: [{ date: "2026-06-11", p: "5" }] }
      ]},
      { id: "c4", name: "Flat Land", area: "Oakland", tags: [], drinks: [
        { n: "Flat white", orders: [{ date: "2026-05-01" }, { date: "2026-05-08" }] }
      ]}
    ];
  });
  await seedCafes();

  // ---- the index --------------------------------------------------------
  let r = await pg.evaluate(() => {
    const ix = drinkIndex();
    const h = ix["hojicha latte"];
    return { cups: h.count, name: h.n, spec: usualSpec(h),
             top: topUsuals(ix, 3).map(e => e.n + ":" + e.count),
             variantSeparate: !!ix["hojicha latte (snoopy version)"] };
  });
  eq(r.cups, 4, "the index counts cups across every cafe, not rows");
  eq(r.spec, { size: "12 oz", sweet: "0%", ice: "Warm", milk: "Oat" },
     "…and learns what you usually order — Oat wins 2:1 over the one Soy");
  eq(r.top[0], "Hojicha latte:4", "the most-ordered drink leads the shortcut row");
  eq(r.variantSeparate, true, "a deliberate variant stays its own drink in the index");
  eq(await pg.evaluate(() => topUsuals(drinkIndex(), 3).some(e => e.count === 1)), false,
     "a drink ordered once is not a 'usual'");

  // ---- A: one tap fills in the whole order ------------------------------
  r = await pg.evaluate(() => {
    openForm();
    return { shown: !document.getElementById("f-usuals").hidden,
             chips: [...document.querySelectorAll("#f-usuals .uchip")].map(c => c.dataset.key) };
  });
  eq(r.shown, true, "the shortcut row shows on the form");
  eq(r.chips[0], "hojicha latte", "…led by the drink you order most");
  eq(r.chips.length <= 3, true, "…capped at three, so it stays a shortcut (" + r.chips.length + ")");

  r = await pg.evaluate(() => {
    document.querySelector('#f-usuals .uchip[data-key="hojicha latte"]').click();
    const row = document.querySelector("#f-drinks .dr");
    const g = s => { const el = row.querySelector(s); return el ? el.value : null; };
    const set = s => { const el = row.querySelector(s); return el && el.dataset.set === "1"; };
    return { name: g(".dn"), date: g(".dd"), today: localToday(),
             size: set(".dsz") ? g(".dsz") : null, sweet: set(".dsw") ? g(".dsw") : null,
             milk: g(".dmk"), price: g(".dp"),
             focused: document.activeElement && document.activeElement.className };
  });
  eq(r.name, "Hojicha latte", "tapping it spells the drink the way you spell it");
  eq(r.date, r.today, "…dated today");
  eq({ size: r.size, sweet: r.sweet, milk: r.milk }, { size: "12", sweet: "0", milk: "Oat" },
     "…with your usual options already set, so nothing has to be re-picked");
  eq(r.price, "", "…and no price, because that is the part that actually differs");
  eq(r.focused, "dp", "…so the cursor lands in the price field");

  /* The saved record has to come out as one drink with a new order, not a second drink. */
  r = await pg.evaluate(() => {
    /* opened on the cafe, the way a tap actually happens — the existing orders are on screen
       as a group, and the chip adds one more beside them */
    editId = "c1"; openForm("c1");
    document.querySelector('#f-usuals .uchip[data-key="hojicha latte"]').click();
    const fresh = [...document.querySelectorAll("#f-drinks .dr")].filter(x => !x.closest(".drgroup"))[0];
    fresh.querySelector(".dp").value = "7.50";
    saveForm();
    const c = cafes.find(x => x.id === "c1");
    const h = c.drinks.filter(d => d.n.toLowerCase() === "hojicha latte");
    return { records: h.length, orders: h[0] ? drinkOrders(h[0]).length : 0,
             elo: h[0] && h[0].elo, names: c.drinks.map(d => d.n) };
  });
  eq(r.records, 1, "saving adds an order to the drink rather than a second record");
  eq(r.orders, 4, "…so it now has four dated orders");
  eq(r.elo, 1560, "…and keeps its ranking");
  eq(r.names.includes("Hojicha latte (Snoopy version)"), true, "…leaving the real variant alone");

  // ---- D: the guard -----------------------------------------------------
  /* The typo must NOT already be on record, or it is simply a drink you log and the guard is
     right to stay quiet. So this seed has the real spelling only. */
  const seedClean = () => pg.evaluate(() => {
    isAdmin = true; editId = null; picked = null;
    window.__saved = 0; save = function(){ window.__saved++; }; saveCafe = function(){ window.__saved++; };
    cafes = [
      { id: "c1", name: "Kissaten HiFi", area: "Tokyo", tags: [], drinks: [
        { n: "Hojicha latte", orders: [
          { date: "2026-08-01", p: "7" }, { date: "2026-08-09", p: "7" },
          { date: "2026-08-17", p: "7" }, { date: "2026-08-21", p: "7" }
        ], elo: 1560, matches: 6 },
        { n: "Hojicha latte (Snoopy version)", orders: [{ date: "2026-08-02", p: "8" }] }
      ]},
      { id: "c4", name: "Flat Land", area: "Oakland", tags: [], drinks: [
        { n: "Flat white", orders: [{ date: "2026-05-01" }, { date: "2026-05-08" }] }
      ]}
    ];
  });

  /* Typed the way a person types it: a brand-new drink row, not an existing one overwritten. */
  const typeNewDrink = (name, answer) => pg.evaluate(({ name, answer }) => {
    window.__asked = [];
    window.confirm = (m) => { window.__asked.push(m); return answer; };
    editId = "c4"; openForm("c4");
    const row = addDrinkRow("", "", localToday());
    row.querySelector(".dn").value = name;
    saveForm();
    const c = cafes.find(x => x.id === "c4");
    return { asked: window.__asked.length, msg: window.__asked[0] || "",
             names: c.drinks.map(d => d.n) };
  }, { name, answer });

  await seedClean();
  let g = await typeNewDrink("Hojica latte", true);
  eq(g.asked, 1, "a name one keystroke from one you use asks before saving");
  eq(/Hojicha latte/.test(g.msg) && /4 times/.test(g.msg), true,
     "…naming the drink it means and how often you have logged it");
  eq(g.names.includes("Hojicha latte"), true, "…and accepting files it under the right name");
  eq(g.names.includes("Hojica latte"), false, "…not the typo");

  await seedClean();
  g = await typeNewDrink("Hojica latte", false);
  eq(g.names.includes("Hojica latte"), true,
     "declining keeps it as typed — the guard asks, it never corrects");

  await seedClean();
  g = await typeNewDrink("Hojicha Einspanner", true);
  eq(g.asked, 0, "a genuinely new drink is saved without a question");
  eq(g.names.includes("Hojicha Einspanner"), true, "…as itself");

  await seedClean();
  g = await typeNewDrink("Hojicha latte (Snoopy version)", true);
  eq(g.asked, 0, "a deliberate variant is not mistaken for a typo of the drink it extends");

  await seedClean();
  g = await typeNewDrink("Flat white", true);
  eq(g.asked, 0, "a name you already use exactly is never questioned");

  await seedClean();
  g = await typeNewDrink("Tea", true);
  eq(g.asked, 0, "a very short name is never guessed at — too little to be sure of");

  // ---- E: fix what is already split -------------------------------------
  /* Now the typos ARE on record, which is the situation this exists for. The real spelling
     has to dominate: two drinks you order about equally are different drinks. */
  const seedSplit = () => pg.evaluate(() => {
    isAdmin = true; editId = null;
    window.__saved = 0; save = function(){ window.__saved++; }; saveCafe = function(){ window.__saved++; };
    cafes = [
      { id: "c1", name: "Kissaten HiFi", area: "Tokyo", tags: [], drinks: [
        { n: "Hojicha latte", orders: [
          { date: "2026-08-01" }, { date: "2026-08-09" }, { date: "2026-08-17" },
          { date: "2026-08-21" }, { date: "2026-08-24" }, { date: "2026-08-28" },
          { date: "2026-08-30" }, { date: "2026-09-02" }, { date: "2026-09-05" }
        ]}
      ]},
      { id: "c2", name: "SOHN", area: "Seoul", tags: [], drinks: [
        { n: "Hojicha latte", orders: [{ date: "2026-07-02", p: "6" }], elo: 1500, matches: 2 },
        { n: "Hojica latte",  orders: [{ date: "2026-07-20", p: "6" }], elo: 1400, matches: 9 }
      ]},
      { id: "c3", name: "Mashio Project", area: "Honolulu", tags: [], drinks: [
        { n: "Hojica latte", orders: [{ date: "2026-06-11", p: "5" }] }
      ]},
      { id: "c5", name: "Twin Peaks", area: "SF", tags: [], drinks: [
        { n: "Matcha latte - Saemidori", orders: [{ date: "2026-04-01" }] },
        { n: "Matcha latte - Samidori",  orders: [{ date: "2026-04-02" }] }
      ]}
    ];
  });

  await seedSplit();
  let e = await pg.evaluate(() => spellingFixPlan()
    .map(x => x.from + "→" + x.to + "@" + x.cafe.name + (x.merge ? "[merge]" : "")).sort());
  eq(e, ["Hojica latte→Hojicha latte@Mashio Project", "Hojica latte→Hojicha latte@SOHN[merge]"],
     "the cleanup finds both shapes: a plain rename, and one that merges with the drink already there");
  eq(e.join(" ").indexOf("Samidori") < 0, true,
     "…and leaves two cultivars you order equally alone — one letter apart, but not a typo");

  e = await pg.evaluate(() => {
    window.confirm = () => true;
    fixDrinkSpellings();
    const sohn = cafes.find(c => c.id === "c2");
    const keep = sohn.drinks.find(d => d.n.toLowerCase() === "hojicha latte");
    return {
      sohnRecords: sohn.drinks.length,
      sohnOrders: drinkOrders(keep).map(o => o.date).sort(),
      sohnElo: keep.elo, sohnMatches: keep.matches,
      mashio: cafes.find(c => c.id === "c3").drinks.map(d => d.n),
      cultivars: cafes.find(c => c.id === "c5").drinks.length,
      saved: window.__saved > 0,
      leftToFix: spellingFixPlan().length
    };
  });
  eq(e.sohnRecords, 1, "the two records at SOHN become one");
  eq(e.sohnOrders, ["2026-07-02", "2026-07-20"], "…keeping every order and date from both");
  eq({ elo: e.sohnElo, matches: e.sohnMatches }, { elo: 1400, matches: 9 },
     "…and taking the ranking from the record with more matches, which is the one the board knows");
  eq(e.mashio, ["Hojicha latte"], "the lone misspelling elsewhere is simply renamed");
  eq(e.cultivars, 2, "the two cultivars are still two drinks");
  eq(e.saved, true, "the change is written");
  eq(e.leftToFix, 0, "…and running it again finds nothing, so it settles");

  await pg.evaluate(() => { window.confirm = () => false; });

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
