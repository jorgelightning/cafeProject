/* The Wrapped strip at the top of Stats > You.

   The year told back to you: visits, your drink, where you went back, your busiest month, how you take it, and a
   Share card. It is counted from what Stats already counts, appears only once the year has 20 visits, goes to
   viewers too (nothing in it is money or a review), and reads no area, coordinate or review, so a private spot
   is a name, a count and a date and nothing more. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  const seed = n => pg.evaluate(count => {
    const Y = new Date().getFullYear(), pad = x => String(x).padStart(2, "0");
    const day = (m, d) => Y + "-" + pad(m) + "-" + pad(d);
    cafes = [];
    /* "Home Base" is visited the most; the rest once each, spread over months so August is busiest */
    const home = []; for (let i = 0; i < Math.min(count, 6); i++) home.push(day(3 + (i % 3), 1 + i));
    cafes.push({ id: "h", name: "Home Base", area: "SECRETAREA 12", custom: true, lat: 1, lng: 1, review: "SECRETREVIEW", rating: 5, matches: 8, elo: 1600,
      drinks: [{ n: "Hojicha latte", orders: home.map(d => ({ date: d, sweet: "0%", milk: "Oat" })) }] });
    for (let i = 0; i < count - 6; i++) {
      const m = i % 3 === 0 ? 8 : 1 + (i % 7);
      cafes.push({ id: "c" + i, name: "Cafe " + i, area: "SECRETAREA " + i, rating: 4, matches: 6, elo: 1500 - i,
        drinks: [{ n: ["Hojicha latte", i % 2 ? "Flat white" : "Flat White", "Matcha latte"][i % 3], orders: [{ date: day(m, 10 + (i % 15)), sweet: i % 5 ? "0%" : "25%", milk: "Oat", p: "6.50" }] }] });
    }
    cafes.push({ id: "w", name: "Someday", wish: true, drinks: [{ n: "Hojicha latte", orders: [{ date: day(2, 2) }] }] });
    cafes.push({ id: "old", name: "Last year", area: "X", drinks: [{ n: "Hojicha latte", orders: [{ date: (Y - 1) + "-05-05" }, { date: (Y - 1) + "-05-06" }] }] });
    return Y;
  }, n);

  const look = admin => pg.evaluate(a => {
    isAdmin = a; applyMode(); _statsTab = "you"; show("stats"); renderStats();
    const panel = document.querySelector('.stabpanel[data-tab="you"]');
    const w = panel.querySelector(".wrapped");
    if (!w) return { present: false };
    const cards = [...w.querySelectorAll(".wc")];
    return { present: true, first: panel.firstElementChild === w, heads: cards.map(c => (c.querySelector(".wk") || {}).textContent),
             text: w.textContent.replace(/\s+/g, " "), html: w.innerHTML, n: cards.length,
             lastShare: cards[cards.length - 1].classList.contains("share"),
             strip: { role: w.querySelector(".wstrip").getAttribute("role"), tab: w.querySelector(".wstrip").tabIndex },
             dots: w.querySelectorAll(".wdots i").length,
             btns: [...w.querySelectorAll("button")].map(x => Math.round(x.getBoundingClientRect().height)),
             inMoney: !!document.querySelector('.stabpanel[data-tab="money"] .wrapped') };
  }, admin);

  const Y = await seed(30);
  let o = await look(true);
  eq(o.present, true, "with 30 visits this year the strip shows");
  eq(o.first, true, "…at the very top of You");
  eq(o.heads, [Y + " so far", "Your drink", "You went back", "Busiest month", "How you take it", "Keep it"], "…its cards, in order, ending on Share");
  eq(o.lastShare, true, "…the last one is the gold Share card");
  eq(o.inMoney, false, "…and it is not in Money");
  eq(/30s*visits/.test(o.text) && new RegExp("At 25 caf").test(o.text), true, "30 visits at 25 cafés (the wishlist and last year do not count)");
  eq(/Hojicha latte×14/.test(o.text), true, "your drink is Hojicha latte, fourteen of them (the Hojicha rows are folded together)");
  eq(/Next is Flat white, at 8/.test(o.text), true, "…with the runner-up named, ties broken by name");
  eq(/All of them new to you/.test(o.text), true, "…and every café was new this year");
  eq(/Home Base.*6 visits/.test(o.text), true, "you went back to Home Base most, six times");
  eq(/August/.test(o.text), true, "August is the busiest month");
  eq(o.dots, o.n, "one dot per card");
  eq(o.strip, { role: "region", tab: 0 }, "the strip is a labelled region you can reach and scroll by keyboard");
  eq(o.btns.every(h => h >= 44), true, "both Share buttons clear the 44px floor (" + o.btns.join(", ") + ")");

  /* privacy and money */
  eq(/SECRETAREA|SECRETREVIEW/.test(o.html), false, "no area or review appears in it, private spot or not");
  eq(/\$|spent|price/i.test(o.text), false, "no money in it");
  const v = await look(false);
  eq(v.present, true, "a viewer gets it too");
  eq(/\$|spent/i.test(v.text), false, "…without any money");

  /* the floor */
  await seed(19);
  eq((await look(true)).present, false, "with 19 visits it stays out of the way");
  await seed(20);
  eq((await look(true)).present, true, "with 20 it appears");

  /* sharing: text only, from the same counts */
  await seed(30);
  const s = await pg.evaluate(() => {
    isAdmin = true; applyMode(); renderStats();
    let got = null;
    navigator.share = o => { got = o; return Promise.resolve(); };
    shareWrapped();
    return got;
  });
  eq(!!s && /My \d{4} in caf/.test(s.title) && /30 visits at 25 cafés/.test(s.text), true, "Share hands over a sentence with the year's counts");
  eq(/SECRETAREA|SECRETREVIEW|\$/.test(JSON.stringify(s)), false, "…which carries no area, review or money");
  const copied = await pg.evaluate(async () => {
    navigator.share = undefined;
    let t = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: x => { t = x; return Promise.resolve(); } }, configurable: true });
    shareWrapped();
    await new Promise(r => setTimeout(r, 50));
    return t;
  });
  eq(/30 visits/.test(copied || ""), true, "…and with no share sheet it copies the message");

  /* the dots follow the scroll */
  const dots = await pg.evaluate(async () => {
    renderStats();
    const st = document.querySelector(".wstrip");
    st.scrollLeft = st.children[2].offsetLeft - st.children[0].offsetLeft;
    await new Promise(r => setTimeout(r, 150));
    return [...document.querySelectorAll(".wdots i")].findIndex(i => i.classList.contains("on"));
  });
  eq(dots >= 1, true, "scrolling moves the dot on (" + dots + ")");

  /* nothing but the strip itself scrolls sideways */
  eq(await pg.evaluate(() => { const bd = document.getElementById("stats-body"); return bd.scrollWidth > bd.clientWidth; }), false, "the page does not scroll sideways at 375px");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
