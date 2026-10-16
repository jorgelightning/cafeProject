/* The cafe page, and a postcard worth sending.

   What to order is now the first thing under the name (a glyph, the drink, its price, how often, and
   when last), the top ten get a gold rank tile, a drink's options read as pills, and the owner's note
   is set as a quotation. "Share spot" draws a postcard to a canvas — rank, name, what to get, the
   owner's line — and sends it as a picture where the device can, as the link where it cannot.
   It is built from c.area and never areaOf(c): it goes to someone else. */
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

  const seed = admin => pg.evaluate(a => {
    isAdmin = a; applyMode();
    cafes = [
      { id: "top", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.77, lng: -122.42, rating: 5, elo: 1800, matches: 6, emoji: "🍵",
        review: "The hojicha latte is the reason to come. Quiet, tidy, and the records are good too.",
        drinks: [{ n: "Hojicha latte", orders: [
          { date: "2026-09-23", p: 7.25, sweet: "0%", ice: "Warm", milk: "Oat", size: "12 oz", reorder: "yes" },
          { date: "2026-09-01", p: 7.25, sweet: "0%", ice: "Warm", milk: "Oat", size: "12 oz", reorder: "yes" }] }] },
      { id: "mid", name: "Middle Cafe", area: "Oakland, CA", lat: 37.8, lng: -122.27, rating: 3, elo: 1500, matches: 3,
        drinks: [{ n: "Drip", orders: [{ date: "2026-08-01", p: "" }] }] },
      { id: "pv", name: "Friend's Place", area: "", custom: true, lat: 21.3, lng: -157.8, rating: 5, elo: 1400, matches: 3,
        review: "Best patio in town.", drinks: [{ n: "Flat white", orders: [{ date: "2026-07-01", p: 5 }] }] }
    ];
    /* ten more above Middle Cafe, so it sits outside the top ten */
    for (let i = 0; i < 10; i++) cafes.push({ id: "f" + i, name: "Filler " + i, area: "Area", rating: 4, elo: 1700 - i, matches: 3, drinks: [] });
    privDetail = { pv: { area: "742 Evergreen Terrace #12", lat: 21.30123, lng: -157.80456 } };
    show("list"); renderList(); openDetail("top", "list");
    const ba = document.getElementById("d-orderagain"), rk = document.getElementById("d-rank");
    const hero = document.getElementById("d-hero"), more = document.getElementById("d-more"), det = document.getElementById("d-details");
    return {
      banner: ba.querySelector(".oa-name").textContent + " | " + ba.querySelector(".oa-meta").textContent,
      glyph: ba.querySelector(".oa-gl").textContent, bannerButtons: ba.querySelectorAll("button").length,
      medalInHero: hero.contains(rk), moreShown: getComputedStyle(more).display !== "none", detailsShown: getComputedStyle(det).display !== "none",
      detailsOpen: det.open, folded: document.querySelectorAll("#d-drinks .foldbox .drinkcard").length,
      moreBtn: (document.querySelector("#d-drinks .morebtn") || {}).textContent || "",
      gold: rk.classList.contains("top"), rankText: rk.textContent,
      pills: [...document.querySelectorAll("#d-drinks .drinksum .mpill")].map(x => x.textContent),
      quote: getComputedStyle(document.getElementById("d-review"), "::before").content,
      doc: document.documentElement.scrollWidth, win: window.innerWidth
    };
  }, admin);

  const v = await seed(false);
  eq(v.banner, "Hojicha latte | $7.25 · 2× ordered · last Sep 23, 2026", "what to order leads: the drink, its price, how often, and when last");
  eq(v.glyph, "🍵", "…with a glyph for the kind of drink");
  eq(v.bannerButtons, 0, "the order block is information, not a second way to log: the bar at the bottom is the one");
  eq(v.medalInHero, true, "the rank is a medal on the hero, not a tile beside the name");
  eq([v.moreShown, v.detailsShown], [false, false], "a viewer has no edit menu and no bookkeeping");
  eq(v.gold, true, "a top-ten cafe gets the gold rank tile");
  eq(v.pills, ["12 oz", "0% sweet", "Warm", "🥛 Oat"], "a drink's options read as pills, not one grey line");
  eq(/201C/i.test(JSON.stringify(v.quote)) || /“/.test(v.quote), true, "the note is set as a quotation");
  eq(v.doc <= v.win + 1, true, "nothing scrolls sideways at 375px");

  const o = await seed(true);
  eq([o.moreShown, o.detailsShown, o.detailsOpen], [true, true, false], "the owner gets a ⋯ menu for Edit and Delete, and the comparisons and edit time folded under Details");
  const mid = await pg.evaluate(() => { openDetail("mid", "list"); return document.getElementById("d-rank").classList.contains("top"); });
  eq(mid, false, "…and a cafe outside the top ten has no gold");

  // ---- a long drink list shows three, then "Show N more" ----
  const fold = await pg.evaluate(() => {
    cafes.push({ id: "many", name: "Many Drinks", area: "SF", rating: 4, elo: 1450, matches: 8,
      drinks: ["A", "B", "C", "D", "E"].map(n => ({ n: "Drink " + n, orders: [{ date: "2026-09-0" + (n.charCodeAt(0) - 64), p: 5 }] })) });
    openDetail("many", "list");
    const box = document.querySelector("#d-drinks .foldbox"), btn = document.querySelector("#d-drinks .morebtn");
    const before = getComputedStyle(box).display;
    btn.click();
    const res = { shown: document.querySelectorAll("#d-drinks > .drinkcard").length, folded: box.querySelectorAll(".drinkcard").length, label: btn.dataset.lab,
             before, after: getComputedStyle(box).display, total: document.querySelectorAll("#d-drinks .drinkcard").length };
    cafes = cafes.filter(c => c.id !== "many");
    return res;
  });
  eq([fold.shown, fold.folded, fold.total], [3, 2, 5], "five drinks are three in view and two folded (nothing is dropped)");
  eq([fold.label, fold.before, fold.after], ["Show 2 more", "none", "block"], "…behind a Show 2 more that opens them");

  // ---- the postcard ----
  await pg.evaluate(() => { openDetail("top", "list"); });
  const p = await pg.evaluate(() => {
    document.getElementById("d-share").focus(); openPostcard();
    const m = document.getElementById("pcmodal"), cv = document.getElementById("pc-canvas");
    const ctx = cv.getContext("2d");
    const px = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3).join(",");
    return { open: !m.hidden, size: [cv.width, cv.height], focus: document.activeElement.id,
             header: px(540, 200), body: px(40, 900), footer: px(60, 1300),
             modal: m.getAttribute("aria-modal"), text: postcardText(cafes[0]) };
  });
  eq(p.open, true, "Share spot opens the postcard");
  eq(p.size, [1080, 1350], "…a 4:5 picture");
  eq(p.focus, "pc-share", "…with focus moved into it");
  eq(p.modal, "true", "…as a modal dialog");
  eq(p.header !== p.body, true, "…drawn, not blank: the tile and the card are different colours");
  eq(p.text.split("\n").slice(0, 4), ["Kissaten HiFi — #1 of 13 on my list", "San Francisco, CA", "What to get: Hojicha latte ($7.25)", "“The hojicha latte is the reason to come. Quiet, tidy, and the records are good too.”"],
     "the message carries rank, place, what to get, and the owner's line");
  eq(/\?cafe=top$/.test(p.text), true, "…and ends with the link to this cafe");

  const priv = await pg.evaluate(() => { const t = postcardText(cafes[2]); return { t, leaks: /Evergreen|21\.3|-157\.8/.test(t) }; });
  eq(priv.leaks, false, "a private spot's address never travels with the postcard (" + priv.t.split("\n")[1] + ")");

  // sharing: a device that can send files, then one that cannot
  const shared = await pg.evaluate(() => new Promise(res => {
    window.__sh = null;
    navigator.canShare = x => !!(x && x.files && x.files.length);
    navigator.share = d => { window.__sh = { files: (d.files || []).map(f => f.name + ":" + f.type), url: d.url, title: d.title }; return Promise.resolve(); };
    sendPostcard();
    setTimeout(() => res(window.__sh), 400);
  }));
  eq(shared.files, ["kissaten-hifi.png:image/png"], "where the device can send files, the picture goes");
  eq(/\?cafe=top$/.test(shared.url) && shared.title === "Kissaten HiFi", true, "…with the link and the name");
  const dl = await pg.evaluate(() => new Promise(res => {
    navigator.canShare = undefined; window.__dl = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { window.__dl = this.download; };
    sendPostcard();
    setTimeout(() => { HTMLAnchorElement.prototype.click = orig; res(window.__dl); }, 400);
  }));
  eq(dl, "kissaten-hifi.png", "where it cannot, the picture is handed over as a file");

  const closed = await pg.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { hidden: document.getElementById("pcmodal").hidden, back: document.activeElement.id };
  });
  eq(closed, { hidden: true, back: "d-share" }, "Escape closes it and focus goes back to the button");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
