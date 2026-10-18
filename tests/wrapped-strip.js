/* The Wrapped strip at the top of Stats > You.

   The year told back to you: visits, your drink, where you went back, your busiest month, how you take it, and a
   Share card. It is counted from what Stats already counts, appears only once the year has 20 visits, goes to
   viewers too (nothing in it is money or a review), and reads no area, coordinate or review, so a private spot
   is a name, a count and a date and nothing more. */
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

  const seed = n => pg.evaluate(count => {
    const Y = new Date().getFullYear(), pad = x => String(x).padStart(2, "0");
    const day = (m, d) => Y + "-" + pad(m) + "-" + pad(d);
    cafes = [];
    /* "Home Base" (a private spot) is visited the most, then "Regular"; the rest once each, spread over months so August is busiest */
    const home = []; for (let i = 0; i < Math.min(count, 6); i++) home.push(day(3 + (i % 3), 1 + i));
    const reg = []; for (let i = 0; i < Math.min(Math.max(count - 6, 0), 5); i++) reg.push(day(2 + i, 20 + i));
    cafes.push({ id: "r", name: "Regular", area: "SECRETAREA 99", rating: 4, matches: 6, elo: 1400, drinks: [{ n: "Hojicha latte", orders: reg.map(d => ({ date: d, sweet: "0%", milk: "Oat" })) }] });
    cafes.push({ id: "h", name: "Home Base", area: "SECRETAREA 12", custom: true, lat: 1, lng: 1, review: "SECRETREVIEW", rating: 5, matches: 8, elo: 1600,
      drinks: [{ n: "Hojicha latte", orders: home.map(d => ({ date: d, sweet: "0%", milk: "Oat" })) }] });
    for (let i = 0; i < count - 11; i++) {
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
             btns: [...w.querySelectorAll("button")].filter(x => x.offsetParent).map(x => Math.round(x.getBoundingClientRect().height)),
             shareCard: !!(cards[cards.length - 1].offsetParent),
             inMoney: !!document.querySelector('.stabpanel[data-tab="money"] .wrapped') };
  }, admin);

  const Y = await seed(30);
  let o = await look(true);
  eq(o.present, true, "with 30 visits this year the strip shows");
  eq(o.first, true, "…at the very top of You");
  eq(o.heads, [Y + " so far", "Your drink", "You went back", "Busiest month", "How you take it", "Keep it"], "…its cards, in order, ending on Share");
  eq(o.lastShare, true, "…the last one is the gold Share card");
  eq(o.inMoney, false, "…and it is not in Money");
  eq(/30\s*visits/.test(o.text) && new RegExp("At 21 caf").test(o.text), true, "30 visits at 21 cafés (the wishlist and last year do not count)");
  eq(/Hojicha latte×18/.test(o.text), true, "your drink is Hojicha latte, eighteen of them (the Hojicha rows are folded together)");
  eq(/Flat white is a distant second, at 6/.test(o.text), true, "…with the runner-up named (a tie broken by name), and called a distant second when yours is three times it");
  eq(/All of them new to you/.test(o.text), true, "…and every café was new this year");
  eq(/Regular.*5 visits/.test(o.text), true, "you went back to Regular most, five times");
  eq(/Home Base/.test(o.html), false, "…and the private spot you visited more is never named");
  eq(/August/.test(o.text), true, "August is the busiest month");
  eq(o.dots, o.n, "one dot per card");
  eq(o.strip, { role: "region", tab: 0 }, "the strip is a labelled region you can reach and scroll by keyboard");
  eq(o.btns.length === 2 && o.btns.every(h => h >= 44), true, "both Share buttons clear the 44px floor (" + o.btns.join(", ") + ")");

  /* privacy and money */
  eq(/SECRETAREA|SECRETREVIEW/.test(o.html), false, "no area or review appears in it, private spot or not");
  eq(/\$|spent|price/i.test(o.text), false, "no money in it");
  const v = await look(false);
  eq(v.present, true, "a viewer gets it too");
  eq([v.btns.length, v.shareCard], [0, false], "…but Share, which sends the owner's year as their own, is the owner's: no button, no Share card");
  eq(/\$|spent/i.test(v.text), false, "…without any money");

  /* the floor */
  await seed(19);
  eq((await look(true)).present, false, "with 19 visits it stays out of the way");
  await seed(20);
  eq((await look(true)).present, true, "with 20 it appears");

  /* sharing: the Story picture, with a sentence from the same counts */
  await seed(30);
  const st = await pg.evaluate(() => {
    isAdmin = true; applyMode(); renderStats();
    document.querySelector(".wrapped .sech button").click();
    const cv = document.getElementById("pc-canvas");
    return { open: !document.getElementById("pcmodal").hidden, size: [cv.width, cv.height], aria: cv.getAttribute("aria-label"), dialog: document.getElementById("pcmodal").getAttribute("aria-label"), subject: { title: _pcSubject.title, message: _pcSubject.message, slug: _pcSubject.slug, url: _pcSubject.url } };
  });
  eq([st.open, st.size], [true, [1080, 1920]], "Share opens the year as a 9:16 Story");
  eq(/^My \d{4} in caf/.test(st.subject.title) && /30 visits at 21 cafés/.test(st.subject.message), true, "…with a sentence of the year's counts");
  eq(/SECRETAREA|SECRETREVIEW|\$|Home Base/.test(JSON.stringify(st)), false, "…which carries no area, review, money, or private spot");
  eq(/^my-\d{4}-in-cafes$/.test(st.subject.slug) && /^Your \d{4} in caf/.test(st.aria), true, "…and the picture and dialog are named for it (" + st.subject.slug + ")");
  const sent = await pg.evaluate(() => new Promise(res => {
    window.__sh = null;
    navigator.canShare = x => !!(x && x.files && x.files.length);
    navigator.share = d => { window.__sh = { files: (d.files || []).map(f => f.name + ":" + f.type), title: d.title, text: d.text }; return Promise.resolve(); };
    sendPostcard();
    setTimeout(() => res(window.__sh), 400);
  }));
  eq(sent && /^my-\d{4}-in-cafes\.png:image\/png$/.test(sent.files[0]), true, "where the device can send files, the Story goes as a picture");
  const copied = await pg.evaluate(async () => {
    navigator.share = undefined; navigator.canShare = undefined;
    let t = null;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: x => { t = x; return Promise.resolve(); } }, configurable: true });
    copyPostcardText();
    await new Promise(r => setTimeout(r, 50));
    closePostcard();
    return t;
  });
  eq(/30 visits/.test(copied || ""), true, "…and \"Copy message\" copies the sentence and the link");

  /* January: this year's strip once it has 20 visits; until then last year's, in review */
  const jan = await pg.evaluate(() => {
    const Y = new Date().getFullYear(), mk = (year, n) => Array.from({ length: n }, (_, i) => ({ id: year + "-" + i, name: "C" + year + i, rating: 4, drinks: [{ n: "Hojicha latte", orders: [{ date: year + "-" + String(1 + (i % 12)).padStart(2, "0") + "-10" }] }] }));
    const pick = list => { const r = wrappedPick(list); return r ? [r.w.year, r.review] : null; };
    const out = { both: pick(mk(Y, 25).concat(mk(Y - 1, 25))), onlyLast: pick(mk(Y, 3).concat(mk(Y - 1, 25))), none: pick(mk(Y, 3).concat(mk(Y - 1, 4))) };
    cafes = mk(Y, 3).concat(mk(Y - 1, 25)); isAdmin = true; applyMode(); _statsTab = "you"; show("stats"); renderStats();
    const w = document.querySelector(".wrapped");
    out.html = w ? { label: (w.querySelector(".wrev") || {}).textContent || "", first: w.querySelector(".wk").textContent, title: w.querySelector(".sech b").textContent } : null;
    return out;
  });
  eq(jan.both, [new Date().getFullYear(), false], "with 20 visits this year it is this year's");
  eq(jan.onlyLast, [new Date().getFullYear() - 1, true], "…in January, with too few, it is last year's, marked as in review");
  eq(jan.none, null, "…and with neither year at 20 there is no strip");
  eq(jan.html && jan.html.label === "in review" && / in review$/.test(jan.html.first) && jan.html.title === "Your " + (new Date().getFullYear() - 1), true, "…labelled \"in review\" on the strip and on its first card");

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
