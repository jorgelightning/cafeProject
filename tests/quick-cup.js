/* A cup on one screen, and Tidy up (user test, 26 Oct).

   "Log a drink here" opened the whole visit, and a new cup was 993px of fields at the counter. Now it is a sheet:
   this cafe's drinks most ordered first, "Same as last time", the last price, 👍 😐 👎, Save. More options is the
   full form with the cup in it. Tidy up in Settings counts the cafes with no drink, verdict, price or date and walks
   them one at a time, with Skip and I don't remember. */
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

  const T = await pg.evaluate(() => {
    const fw = d => ({ id: "fw" + d, date: "2026-10-0" + d, p: "5", size: "8 oz", sweet: "0%", ice: "Warm", milk: "Oat" });
    cafes = [
      { id: "kh", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.78, lng: -122.41, rating: 5, matches: 6, elo: 1600,
        drinks: [
          { n: "Flat White", orders: [fw(1), fw(2), fw(3)] },
          { n: "Hojicha latte", orders: [{ id: "hl1", date: "2026-09-01", p: "7.25", size: "12 oz" }] },
        ] },
      { id: "wl", name: "Someday Cafe", area: "Mission", lat: 37.76, lng: -122.42, wish: true, drinks: [] },
      /* for Tidy up */
      { id: "nd", name: "No Drink Cafe", area: "Soma", lat: 37.77, lng: -122.40, rating: 5, drinks: [] },
      { id: "nr", name: "No Verdict Cafe", area: "Soma", lat: 37.77, lng: -122.40, drinks: [{ n: "Latte", orders: [{ id: "nr1", date: "2026-08-01", p: "6" }] }] },
      { id: "np", name: "No Price Cafe", area: "Soma", lat: 37.77, lng: -122.40, rating: 3, drinks: [{ n: "Mocha", orders: [{ id: "np1", date: "2026-08-02" }] }] },
      { id: "nt", name: "No Date Cafe", area: "Soma", lat: 37.77, lng: -122.40, rating: 3, drinks: [{ n: "Drip", orders: [{ id: "nt1", p: "4" }] }] },
    ];
    privDetail = {};
    isAdmin = true;
    applyMode();
    openDetail("kh", "list");
    return localToday();
  });

  /* ---- the sheet ---- */
  await pg.getByRole("button", { name: "Log here", exact: true }).click();   /* the middle tab, on a cafe page (design audit D2) */
  let s = await pg.evaluate(() => ({
    open: !$("dnsheet").hidden,
    title: $("dns-title").textContent,
    chips: [...document.querySelectorAll("#dns-panel .dntag")].map(x => x.textContent),
    save: [...document.querySelectorAll("#dns-panel .btn")].find(x => x.textContent === "Save cup").disabled,
  }));
  eq([s.open, s.title], [true, "A cup at Kissaten HiFi"], "the Log here tab opens a sheet for a cup here, not the whole visit");
  eq(s.chips, ["Flat White 3", "Hojicha latte 1", "Something else"], "…this cafe's drinks, most ordered first");
  eq(s.save, true, "…and nothing to save until a drink is picked");
  await pg.locator('#dns-panel .dntag[data-n="Flat White"]').click();
  s = await pg.evaluate(() => ({ same: document.querySelector(".qcsame").innerText.replace(/\s+/g, " "), price: $("qc-price").value }));
  eq(s, { same: "✓ Same as last time 8 oz · oat · no sugar · warm", price: "5" }, "the drink brings its last options and its last price");
  await pg.getByRole("button", { name: "Would order again: yes" }).click();
  eq(await pg.evaluate(() => $("qc-price").value), "5", "choosing 👍 keeps the price in the box");
  await pg.getByRole("button", { name: "Save cup" }).click();
  s = await pg.evaluate(() => {
    const d = cafes[0].drinks.find(x => x.n === "Flat White"), o = d.orders[d.orders.length - 1];
    return { n: d.orders.length, o: [o.date, o.p, o.size, o.sweet, o.ice, o.milk, o.reorder, !!o.id], sheet: !$("dnsheet").hidden, view: app.dataset.view, chaser: !!_chaser };
  });
  eq(s.n, 4, "Save cup adds a fourth Flat White");
  eq(s.o, [T, "5", "8 oz", "0%", "Warm", "Oat", "yes", true], "…dated today, at the price, with the same options and the 👍");
  eq([s.sheet, s.view, s.chaser], [false, "detail", true], "…puts the sheet away, back on the cafe, with the ranking question that follows a visit");
  await pg.evaluate(() => { chaserDismiss(); });

  /* not the same as last time, and something new */
  await pg.evaluate(() => openQuickCup("Flat White"));
  await pg.locator(".qcsame").click();
  await pg.getByRole("button", { name: "Save cup" }).click();
  s = await pg.evaluate(() => { const d = cafes[0].drinks.find(x => x.n === "Flat White"), o = d.orders[d.orders.length - 1]; return [o.size || null, o.milk || null, o.p]; });
  eq(s, [null, null, "5"], "with Same as last time off, the options are left out and the price stays");
  await pg.evaluate(() => { chaserDismiss(); openQuickCup(); });
  await pg.getByRole("button", { name: "Something else" }).click();
  await pg.locator("#qc-other").fill("Cortado");
  await pg.waitForTimeout(400);
  await pg.locator("#qc-price").fill("5.50");
  await pg.getByRole("button", { name: "Save cup" }).click();
  s = await pg.evaluate(() => { const d = cafes[0].drinks.find(x => x.n === "Cortado"); return d ? [d.orders.length, d.orders[0].p, d.orders[0].date] : null; });
  eq(s, [1, "5.50", T], "Something else adds a new drink to the cafe");
  await pg.evaluate(() => chaserDismiss());

  /* More options, and a wishlist cafe */
  await pg.evaluate(() => openQuickCup("Hojicha latte"));
  await pg.locator("#qc-price").fill("7.50");
  await pg.getByRole("button", { name: "More options" }).click();
  await pg.waitForTimeout(300);
  s = await pg.evaluate(() => { const r = document.querySelector("#f-drinks .dr:not(.collapsed)"); return { view: app.dataset.view, n: r.querySelector(".dn").value, p: r.querySelector(".dp").value, d: r.querySelector(".dd").value }; });
  eq(s, { view: "form", n: "Hojicha latte", p: "7.50", d: T }, "More options opens the full visit with that cup already in it");
  await pg.evaluate(() => { _formSnap = null; openDetail("wl", "list"); openQuickCup(); });
  await pg.getByRole("button", { name: "Something else" }).click();
  await pg.locator("#qc-other").fill("Latte");
  await pg.waitForTimeout(400);
  await pg.getByRole("button", { name: "Save cup" }).click();
  eq(await pg.evaluate(() => { chaserDismiss(); return cafes.find(c => c.id === "wl").wish; }), false, "a cup at a wishlist cafe makes it a visit");

  /* ---- Tidy up ---- */
  /* the wishlist cafe just became a visit with no verdict and no price; Tidy up is about the four seeded gaps */
  const card = await pg.evaluate(() => { cafes = cafes.filter(c => c.id !== "wl"); show("settings"); renderSettings(); return [...document.querySelectorAll("#tidy-grid .tidyb")].map(x => x.innerText.replace(/\s+/g, " ")); });
  eq(card, ["1 no drink", "1 no verdict", "1 no price", "1 no date"], "Settings counts what is missing");
  await pg.evaluate(() => openTidy("rating"));
  eq(await pg.evaluate(() => $("dns-title").textContent), "No Verdict Cafe", "Tidy up opens on the first cafe with the gap");
  await pg.getByRole("button", { name: "Loved it" }).click();
  s = await pg.evaluate(() => ({ r: cafes.find(c => c.id === "nr").rating, title: $("dns-title").textContent }));
  eq(s, { r: 5, title: "All done" }, "one tap fills it in, and the queue moves on");
  await pg.evaluate(() => closeSheet());

  await pg.evaluate(() => openTidy("drink"));
  await pg.locator("#tidy-other").fill("Matcha latte");
  await pg.getByRole("button", { name: "Add drink" }).click();
  eq(await pg.evaluate(() => { const c = cafes.find(x => x.id === "nd"); return c.drinks.map(d => [d.n, d.orders.length, !!d.orders[0].id]); }), [["Matcha latte", 1, true]], "a drink can be added from Tidy up");
  await pg.evaluate(() => closeSheet());

  /* the drink just added has no price or date yet, so that cafe now leads those queues too */
  const priceFor = await pg.evaluate(() => { openTidy("price"); return $("dns-title").textContent; });
  await pg.locator("#tidy-p0").fill("6.25");
  await pg.getByRole("button", { name: "Save prices" }).click();
  eq(await pg.evaluate(n => cafes.find(x => x.name === n).drinks[0].orders[0].p, priceFor), "6.25", "…and a price (" + priceFor + ")");
  await pg.evaluate(() => closeSheet());

  const dateFor = await pg.evaluate(() => { openTidy("date"); return $("dns-title").textContent; });
  await pg.locator("#tidy-date").fill("2026-05-04");
  await pg.getByRole("button", { name: "Save date" }).click();
  eq(await pg.evaluate(n => cafes.find(x => x.name === n).drinks[0].orders[0].date, dateFor), "2026-05-04", "…and a date (" + dateFor + ")");
  await pg.evaluate(() => closeSheet());

  /* I don't remember: never asked again on this device */
  await pg.evaluate(() => { cafes.push({ id: "nr2", name: "Forgotten Cafe", area: "Soma", drinks: [{ n: "Latte", orders: [{ id: "f1", date: "2026-01-01", p: "5" }] }] }); openTidy("rating"); });
  await pg.getByRole("button", { name: "I don’t remember" }).click();
  s = await pg.evaluate(() => { closeSheet(); return { left: tidyQueue("rating").length, kept: JSON.parse(localStorage.getItem("cafemap.tidyskip")).rating }; });
  eq(s, { left: 0, kept: ["nr2"] }, "I don't remember takes a cafe out of the queue for good");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
