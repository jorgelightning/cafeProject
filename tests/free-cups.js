/* Free cups (v121).

   A cup at a friend's place costs nothing and is logged as 0. It used to read as no price at all on the cafe page
   ($0.00 only in the cup history) and Tidy up asked for a price at every such place. Now 0 reads Free wherever a
   price is shown, in dollars or local money, and counts as a price given; every average, median and the quick cup's
   price strip still count only cups that cost something. */
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

  let s = await pg.evaluate(() => {
    cafes = [
      { id: "fr", name: "Cafe Plaza", area: "", custom: true, lat: 37.7, lng: -122.4, rating: 5,
        drinks: [{ n: "Matcha Latte", orders: [{ id: "a1", date: "2026-09-01", p: "0" }, { id: "a2", date: "2026-10-01", p: "0.00" }] }] },
      { id: "tw", name: "A friend in Taipei", area: "", custom: true, cc: "TW", lat: 25.04, lng: 121.5, rating: 5,
        drinks: [{ n: "Oolong", orders: [{ id: "t1", date: "2026-07-01", p: "0", pl: "0", pc: "TWD" }] }] },
      { id: "np", name: "No Price Cafe", area: "Soma", lat: 37.77, lng: -122.4, rating: 4, drinks: [{ n: "Drip", orders: [{ id: "n1", date: "2026-08-01", p: "" }] }] },
      { id: "pd", name: "Paid Cafe", area: "Soma", lat: 37.77, lng: -122.4, rating: 4,
        drinks: [{ n: "Matcha Latte", orders: [{ id: "p1", date: "2026-08-01", p: "6.50" }, { id: "p2", date: "2026-08-02", p: "7" }, { id: "p3", date: "2026-08-03", p: "7.50" }, { id: "p4", date: "2026-08-04", p: "8" }] }] },
    ];
    privDetail = {};
    isAdmin = true;
    applyMode();
    openDetail("fr", "list");
    return {
      what: $("d-orderagain").querySelector(".oa-meta").textContent,
      history: [...document.querySelectorAll("#d-drinks .pr")].map(x => x.textContent),
      local: priceHTML({ p: "0", pl: "0", pc: "TWD" }),
      paid: [fmtPrice("6.5"), fmtPrice(""), fmtLocal("65", "TWD"), fmtLocal("0", "TWD")],
      range: drinkGroupPriceText(cafes[0].drinks[0]),
      tidy: tidyQueue("price").map(c => c.id),
      noprice: cafes.filter(c => guideMatch(c, "noprice")).map(c => c.id),
    };
  });
  eq(s.what, "Free · 2× ordered · last Oct 1", "What to order at a friend's place reads Free, not a blank price");
  eq(s.history.length > 0 && s.history.every(x => x === "Free"), true, "…and so does each cup on the page (" + s.history.join(", ") + ")");
  eq(s.local, '<span class="pr">Free</span>', "a free cup in local money is one Free, not Free and Free");
  eq(s.paid, ["$6.50", "", "NT$65", "Free"], "a price that costs something reads as before; 0 in any currency reads Free");
  eq(s.range, "Free", "the form's drink row says Free too");
  eq(s.tidy, ["np"], "Tidy up asks for a price only where none was entered: a free cup has one");
  eq(s.noprice, ["np"], "…and so does the No price view");

  /* free cups never pull an average down */
  s = await pg.evaluate(() => {
    const k = priceKin("Matcha latte");
    return k.pts.map(x => x.p);
  });
  eq(s, [6.5, 7, 7.5, 8], "the quick cup's price strip counts only cups that cost something");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
