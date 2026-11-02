/* A ghost price (v122).

   An empty price box shows a guess in grey, and under it where the guess comes from: the middle of real prices for
   like drinks at this cafe, else near it, else anywhere, in the cup's own currency. Swiping across the box takes the
   guess, with no keyboard; a tap opens the keyboard as before; the right arrow takes it from a keyboard. Left alone,
   the cup saves with no price: a guess is never saved unless you took it. */
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

  const SF = { lat: 37.78, lng: -122.46 }, TPE = { lat: 25.04, lng: 121.5 };
  let s = await pg.evaluate(([SF, TPE]) => {
    const cup = (id, p, extra) => Object.assign({ id, date: "2026-09-01", p }, extra || {});
    cafes = [
      { id: "A", name: "Here Cafe", area: "SF", lat: 37.781, lng: -122.461, rating: 5,
        drinks: [{ n: "Hojicha latte", orders: [cup("a1", "7.00"), cup("a2", "7.50")] }, { n: "Cloud 9", orders: [cup("a3", "7.60")] }] },
      { id: "B", name: "Near One", area: "SF", lat: 37.77, lng: -122.45, rating: 4, drinks: [{ n: "Hojicha Latte", orders: [cup("b1", "6.00")] }] },
      { id: "C", name: "Near Two", area: "SF", lat: 37.76, lng: -122.44, rating: 4, drinks: [{ n: "Iced hojicha latte", orders: [cup("c1", "8.00")] }] },
      { id: "F", name: "Friend", area: "", custom: true, lat: 37.75, lng: -122.43, rating: 5, drinks: [{ n: "Hojicha latte", orders: [cup("f1", "0")] }] },
      { id: "E", name: "Far Away", area: "Los Angeles", lat: 34.05, lng: -118.24, rating: 4, drinks: [{ n: "Hojicha latte", orders: [cup("e1", "9.00")] }] },
      { id: "T", name: "Hoji Taipei", area: "Ximen", cc: "TW", lat: 25.042, lng: 121.507, rating: 5,
        drinks: [{ n: "Hojicha latte", orders: [cup("t1", "2.90", { pl: "90", pc: "TWD" })] }] },
      { id: "U", name: "Hoji Taipei Two", area: "Da'an", cc: "TW", lat: 25.03, lng: 121.53, rating: 4,
        drinks: [{ n: "Hojicha latte", orders: [cup("u1", "2.58", { pl: "80", pc: "TWD" })] }] },
      { id: "N", name: "New To Me", area: "SF", lat: 37.779, lng: -122.459, rating: 4, drinks: [{ n: "Drip", orders: [cup("n1", "4.00")] }] },
    ];
    privDetail = {};
    isAdmin = true;
    applyMode();
    const g = (n, c) => { const r = guessPrice(n, c); return r ? [r.amount, r.why] : null; };
    return {
      here: g("Hojicha latte", { id: "A", code: "USD", at: SF }),
      near: g("Hojicha latte", { id: "new", code: "USD", at: SF }),
      anywhere: g("Hojicha latte", { id: "new", code: "USD", at: null }),
      twd: g("Hojicha latte", { id: "new", code: "TWD", at: TPE }),
      oneOff: g("Cloud 9", { id: "new", code: "USD", at: SF }),
      none: g("Pistachio latte", { id: "new", code: "USD", at: SF }),
      empty: g("  ", { id: "new", code: "USD", at: SF }),
    };
  }, [SF, TPE]);
  eq(s.here, [7.25, "like your hojicha lattes here"], "a drink's guess comes first from like drinks at this cafe");
  eq(s.near, [7.25, "like your hojicha lattes near here"], "…then from at least two within 25 miles: $6, $7, $7.50 and $8; never the friend's free cup, Taipei's, or LA's");
  eq(s.anywhere, [7.5, "like your hojicha lattes"], "…then from at least three anywhere, in the cup's currency");
  eq(s.twd, [85, "like your hojicha lattes near here"], "a Taipei cup is guessed in NT$ from NT$ prices, to the nearest 5");
  eq([s.oneOff, s.none, s.empty], [null, null, null], "no guess from one cup in no family, from nothing, or for no name");

  /* ---- the quick cup ---- */
  await pg.evaluate(() => { openDetail("N", "list"); openQuickCup("Hojicha latte"); });
  const box = pg.locator("#qc-price");
  /* where the box and the rows under it sit: none of it may move as the guess is taken, typed over or cleared (v123) */
  const at = () => pg.evaluate(() => { const y = e => Math.round(e.getBoundingClientRect().top);
    return [y($("qc-price")), y(document.querySelector("#dns-panel .dnq[aria-label='Would order again?']")), y($("dns-panel")), Math.round($("qc-ctx").getBoundingClientRect().height)]; });
  const still = await at();
  s = await pg.evaluate(() => ({ value: $("qc-price").value, ph: $("qc-price").placeholder, say: $("qc-say").textContent,
    by: $("qc-price").getAttribute("aria-describedby"), touch: getComputedStyle($("qc-price")).touchAction }));
  eq([s.value, s.ph], ["", "7.25"], "a drink with no price here: an empty box with the guess in grey");
  eq([s.say, s.by], ["≈ $7.25, like your hojicha lattes near here. Swipe across the price to use it.", "qc-say"],
     "…and under it, where the guess comes from and how to take it, which the box is described by");
  eq(s.touch, "pan-y", "…and a sideways finger on it is a swipe, not a pan");

  await box.click();
  eq(await pg.evaluate(() => [$("qc-price").value, document.activeElement.id]), ["", "qc-price"], "a tap opens the box to type, and takes nothing");
  await pg.evaluate(() => document.activeElement.blur());

  const bb = await box.boundingBox();
  const cy = bb.y + bb.height / 2;
  await pg.mouse.move(bb.x + 20, cy); await pg.mouse.down(); await pg.mouse.move(bb.x + 22, cy + 80, { steps: 5 }); await pg.mouse.up();
  eq(await pg.evaluate(() => $("qc-price").value), "", "an up-and-down drag is not a swipe");

  await pg.mouse.move(bb.x + 20, cy); await pg.mouse.down(); await pg.mouse.move(bb.x + 120, cy + 6, { steps: 5 }); await pg.mouse.up();
  s = await pg.evaluate(() => ({ value: $("qc-price").value, say: $("qc-say").textContent }));
  eq(s.value, "7.25", "a swipe across the box takes the guess");
  eq(/^Your hojicha lattes: .* cost more.$/.test(s.say), true, "…and the same line now places that price among like cups (" + s.say + ")");
  eq(await at(), still, "…and nothing moved: the box, the rows under it and the sheet's top stay where they were");
  await box.fill("8.5");
  eq(await at(), still, "typing a price moves nothing either");

  await box.fill("");
  eq(await pg.evaluate(() => $("qc-say").textContent), "≈ $7.25, like your hojicha lattes near here. Swipe across the price to use it.", "emptying the box brings the guess back");
  eq(await at(), still, "…in the same place");
  await box.focus();
  await pg.keyboard.press("ArrowRight");
  eq(await pg.evaluate(() => $("qc-price").value), "7.25", "with a keyboard, the right arrow in the empty box takes it");

  /* left alone, nothing is saved */
  await box.fill("");
  await pg.getByRole("button", { name: "Save cup" }).click();
  s = await pg.evaluate(() => {
    const d = cafes.find(c => c.id === "N").drinks.find(x => /hojicha/i.test(x.n));
    const o = d && drinkOrders(d).slice(-1)[0];
    return o ? { p: o.p || "", saved: true } : { saved: false };
  });
  eq(s, { p: "", saved: true }, "a cup saved without taking the guess has no price: a guess is never saved unless you took it");

  /* a drink already priced here brings its last price, not a guess */
  await pg.evaluate(() => { closeSheet(); openDetail("A", "list"); openQuickCup("Hojicha latte"); });
  s = await pg.evaluate(() => ({ value: $("qc-price").value, guess: /Swipe/.test($("qc-ctx").textContent), ghost: $("qc-price").dataset.ghost || "" }));
  eq(s, { value: "7.50", guess: false, ghost: "" }, "a drink priced here last time starts at that price, with no guess");
  await pg.evaluate(() => closeSheet());

  /* ---- the new-cafe form ---- */
  await pg.evaluate(() => { openForm(); });
  const dn = pg.locator("#f-drinks .dr .dn").first();
  const rowH = () => pg.evaluate(() => Math.round(document.querySelector("#f-drinks .dr").getBoundingClientRect().height));
  const h0 = await rowH();
  await dn.fill("Hojicha latte");
  s = await pg.evaluate(() => { const dp = document.querySelector("#f-drinks .dr .dp"); const n = $(dp.getAttribute("aria-describedby"));
    return { ph: dp.placeholder, note: n && n.textContent, shown: n && !n.hidden, sr: n && n.classList.contains("sr-only") }; });
  eq(s, { ph: "7.50", note: "≈ $7.50, like your hojicha lattes. Swipe across the price to use it.", shown: true, sr: true },
     "the form's drink row guesses as the name is typed, from everywhere until the place is known; its reason is read by a screen reader");
  eq(await rowH(), h0, "…and the row does not grow as the guess arrives (v123)");
  await pg.evaluate(SF => { picked = SF; syncWhere(); }, SF);
  eq(await pg.evaluate(() => document.querySelector("#f-drinks .dr .dp").placeholder), "7.25", "…and from near the place once it is picked");
  await dn.fill("");
  s = await pg.evaluate(() => { const dp = document.querySelector("#f-drinks .dr .dp"); return { ph: dp.placeholder, ghost: dp.dataset.ghost || "", note: $(dp.getAttribute("aria-describedby")).hidden }; });
  eq(s, { ph: "Price", ghost: "", note: true }, "…and a row with no drink has no guess");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
