/* Show the barista (v120).

   What to order named the drink, but the order is the drink plus how you take it: size, milk, sugar and ice, already
   stored on every cup. A button on What to order puts the last cup on the whole screen in the counter's language,
   with the English under each word, and keeps the screen on. The words come from js/lib/order.js
   (tests/unit/order.test.mjs); this checks the button, the card, the language switch and the way back. */
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

  await pg.evaluate(() => {
    /* a wake lock that records what the card asks of it */
    window._wl = { req: 0, rel: 0 };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request: () => { window._wl.req++; return Promise.resolve({ release: () => { window._wl.rel++; return Promise.resolve(); } }); } },
    });
    cafes = [
      { id: "op", name: "Oolong Tea Project", area: "Ximen", cc: "TW", lat: 25.04, lng: 121.5, rating: 5, matches: 4, elo: 1588,
        drinks: [{ n: "Cheese Foam Ruby Oolong Tea (Large)", orders: [{ id: "op1", date: "2025-01-10", p: "2.06", sweet: "25%", ice: "Less ice" }] }] },
      { id: "kh", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.78, lng: -122.46, rating: 5, matches: 6, elo: 1591,
        drinks: [{ n: "Flat White", orders: [
          { id: "fw1", date: "2026-09-01", p: "5", size: "12 oz", sweet: "50%", ice: "Hot" },
          { id: "fw2", date: "2026-10-01", p: "5", size: "8 oz", sweet: "0%", ice: "Warm", milk: "Oat" },
        ] }] },
      { id: "dr", name: "Plain Drip", area: "Mission", lat: 37.76, lng: -122.42, rating: 4,
        drinks: [{ n: "Drip", orders: [{ id: "dr1", date: "2026-08-01", p: "3" }] }] },
    ];
    privDetail = {};
    isAdmin = false;
    applyMode();
    openDetail("op", "list");
  });

  /* ---- a visitor, at a Taipei counter ---- */
  const show = pg.getByRole("button", { name: "Show the barista" });
  eq(await show.count(), 1, "What to order carries Show the barista, for a visitor too");
  await show.click();
  let s = await pg.evaluate(() => ({
    open: !$("dnsheet").hidden && !!document.querySelector("#dns-panel .ocard"),
    title: $("dns-title").textContent,
    focus: document.activeElement && document.activeElement.id,
    pressed: [...document.querySelectorAll(".oclangs button")].filter(x => x.getAttribute("aria-pressed") === "true").map(x => x.textContent),
    sweet: [...document.querySelectorAll(".oclines li")].map(li => [li.querySelector("b").textContent, (li.querySelector("small") || {}).textContent || ""])[0],
    ice: [...document.querySelectorAll(".oclines li")].map(li => [li.querySelector("b").textContent, (li.querySelector("small") || {}).textContent || "", li.querySelector("b").lang]).pop(),
    lines: document.querySelectorAll(".oclines li").length,
    foot: document.querySelector(".ocfoot").textContent,
    full: Math.round(document.querySelector(".dnpanel").getBoundingClientRect().height),
    wl: window._wl.req,
  }));
  eq([s.open, s.title], [true, "Cheese Foam Ruby Oolong Tea (Large)"], "it opens a card for the drink What to order names, under the name you logged");
  eq(s.focus, "dns-title", "…with the keyboard on the drink, not on Close");
  eq(s.pressed, ["中文"], "…in Chinese, because the cafe is in Taiwan");
  eq(s.sweet, ["微糖", "25% sugar"], "…25% sugar reads 微糖, the level a Taipei counter takes, with the share you logged under it");
  eq(s.ice, ["少冰", "Less ice", "zh-Hant"], "…so less ice reads 少冰, with what you logged under it, tagged as Chinese");
  eq(s.lines, 2, "…and a line for each option the cup has: sugar and ice here, no size or milk invented");
  eq(s.foot, "Jorge’s order · last Jan 10, 2025", "…as Jorge's order, with the day of the cup");
  eq(s.full, 844, "it takes the whole phone screen, to be held up at the counter");
  eq(s.wl, 1, "it asks for the screen to stay on");

  await pg.getByRole("button", { name: "English", exact: true }).click();
  s = await pg.evaluate(() => ({
    words: [...document.querySelectorAll(".oclines b")].map(x => x.textContent),
    glosses: document.querySelectorAll(".oclines small").length,
    focus: document.activeElement && document.activeElement.textContent,
    wl: window._wl.req,
  }));
  eq(s.words, ["25% sugar", "Less ice"], "English is the order as logged");
  eq(s.glosses, 0, "…with nothing under it");
  eq(s.focus, "English", "…and the keyboard stays on the language just picked");
  eq(s.wl, 1, "switching language keeps the same lock");

  await pg.keyboard.press("Escape");
  s = await pg.evaluate(() => ({
    closed: $("dnsheet").hidden,
    focus: document.activeElement && document.activeElement.textContent.trim(),
    rel: window._wl.rel,
  }));
  eq(s, { closed: true, focus: "Show the barista", rel: 1 }, "Escape puts it away, lets the screen sleep, and gives the keyboard back to the button");

  /* ---- at home: English, the last cup's options, and the owner's own words ---- */
  await pg.evaluate(() => { isAdmin = true; applyMode(); openDetail("kh", "list"); });
  await pg.getByRole("button", { name: "Show the barista" }).click();
  s = await pg.evaluate(() => ({
    pressed: document.querySelector('.oclangs [aria-pressed="true"]').textContent,
    words: [...document.querySelectorAll(".oclines b")].map(x => x.textContent),
    foot: document.querySelector(".ocfoot").textContent,
  }));
  eq(s.pressed, "English", "a cafe in the US opens in English");
  eq(s.words, ["8 oz", "Oat milk", "No sugar", "Warm"], "…on the last cup, as Same as last time would log it");
  eq(s.foot.startsWith("Your order"), true, "…and the owner reads it as their own order");
  await pg.getByRole("button", { name: "Close" }).click();
  eq(await pg.evaluate(() => $("dnsheet").hidden), true, "Close puts it away");

  /* ---- nothing to show ---- */
  await pg.evaluate(() => openDetail("dr", "list"));
  eq(await pg.getByRole("button", { name: "Show the barista" }).count(), 0, "a cup with no size, milk, sugar or ice has no card: the name is already on the page");

  /* ---- a laptop keeps it a card ---- */
  await pg.setViewportSize({ width: 1280, height: 800 });
  await pg.evaluate(() => openDetail("kh", "list"));
  await pg.getByRole("button", { name: "Show the barista" }).click();
  const w = await pg.evaluate(() => Math.round(document.querySelector(".dnpanel").getBoundingClientRect().width));
  eq(w <= 520, true, "on a laptop it stays a centred card (" + w + "px)");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
