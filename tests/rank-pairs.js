/* Rank a pair asks the useful question first (user test, 26 Oct).

   The first question was a tea house with no dates against a specialty coffee bar in another city, while two cafes
   one row apart both read "#20". Now: a never-compared cafe first, then one still being placed, then two settled
   cafes on one score (asked against each other, "Tied at =N"), and an opponent of the same kind in the same region
   is preferred. The chip's count includes the ties, and the question says what the two have in common. */
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

  const seed = extra => pg.evaluate(x => {
    const ca = [37.77, -122.42], hi = [21.3, -157.83];
    const mk = (id, at, drink, elo, m) => ({
      id, name: id, area: "Area " + id, lat: at[0], lng: at[1], rating: 5, elo, matches: m == null ? 10 : m,
      drinks: [{ n: drink, orders: [{ id: id + "o", date: "2026-09-01", p: "6" }] }],
    });
    cafes = [
      mk("CoffeeA", ca, "Flat White", 1600),
      mk("CoffeeB", ca, "Flat White", 1600),
      mk("CoffeeC", ca, "Cortado", 1580),
      mk("CoffeeD", ca, "Cortado", 1560),
      mk("CoffeeE", ca, "Flat White", 1540),
      mk("CoffeeF", ca, "Flat White", 1520),
      mk("CoffeeG", ca, "Cortado", 1500),
      mk("MatchaHI1", hi, "Matcha latte", 1590),
      mk("MatchaHI2", hi, "Matcha latte", 1570),
      mk("MatchaHI3", hi, "Matcha latte", 1550),
      mk("MatchaHI4", hi, "Matcha latte", 1530),
      mk("MatchaHI5", hi, "Matcha latte", 1510),
    ];
    if (x === "never") cafes.push(mk("Brand New", ca, "Flat White", 1500, 0));
    privDetail = {};
    _chaserSeen = [];
    isAdmin = true;
    applyMode();
  }, extra);

  /* ---- two settled cafes on one score are asked against each other ---- */
  await seed();
  const t = await pg.evaluate(() => {
    show("compare"); renderBoard();
    const chip = [...document.querySelectorAll("#cmp-body .gochip")].find(x => /Rank a pair/.test(x.textContent));
    boardRank();
    const pair = [_chaser.cafe, _chaser.opp].sort();
    return { em: chip.querySelector("em") && chip.querySelector("em").textContent, title: chip.title, tier: _chaser.tier, pair, why: document.querySelector("#d-chaser .ch-why").textContent };
  });
  eq([t.em, t.title], ["1", "1 tie"], "the Rank a pair chip counts the tie as something to settle");
  eq([t.tier, t.pair], ["T", ["CoffeeA", "CoffeeB"]], "with nothing new or still placing, the question is the two tied cafes against each other");
  eq(t.why, "Tied at =1 · Both coffee, both California", "…and it says why it is asking");
  await pg.evaluate(() => chaserDismiss());

  /* ---- a never-compared cafe still comes first ---- */
  await seed("never");
  const n = await pg.evaluate(() => { boardRank(); const r = { cafe: _chaser.cafe, tier: _chaser.tier }; chaserDismiss(); return r; });
  eq(n.cafe, "Brand New", "a cafe that has never been compared is asked about before any tie");

  /* ---- the opponent: same kind, same region ---- */
  await seed();
  const picks = await pg.evaluate(() => {
    const out = [];
    for (let i = 0; i < 30; i++) {
      _chaserSeen = [];
      chaserArm("CoffeeE");
      out.push(_chaser.opp);
    }
    return out;
  });
  eq(picks.every(id => /^Coffee/.test(id)), true, "a settled coffee bar in California is asked against coffee bars in California, 30 times out of 30 (" + [...new Set(picks)].join(", ") + ")");

  const why = await pg.evaluate(() => [
    pairWhy(cafes.find(c => c.id === "CoffeeA"), cafes.find(c => c.id === "CoffeeC")),
    pairWhy(cafes.find(c => c.id === "CoffeeA"), cafes.find(c => c.id === "MatchaHI1")),
    pairWhy(cafes.find(c => c.id === "MatchaHI1"), cafes.find(c => c.id === "MatchaHI2")),
  ]);
  eq(why, ["Both coffee, both California", "", "Both matcha, both Hawaii"], "what two cafes have in common, or nothing when they share nothing");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
