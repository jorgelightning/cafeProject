/* Cadence, price and taste on the Stats screen.

   Three charts the data could already support but nothing drew: a heatmap of the last 30 weeks
   with the longest streak and the weekday split, the spread of drink prices with a monthly trend
   and the verdict split with the wishlist and
   tags. They are plain SVG and CSS on the theme tokens, and they must never carry a location. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const seed = async admin => pg.evaluate(a => {
    isAdmin = a; applyMode();
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
    cafes = [
      { id: "a", name: "Alpha", area: "SoMa", lat: 37.78, lng: -122.41, rating: 5, cc: "US", tags: ["cozy", "matcha"],
        drinks: [{ n: "Hojicha latte", orders: [{ date: day(1), p: 6 }, { date: day(2), p: 7 }, { date: day(3), p: 7 }, { date: day(40), p: 8 }] }] },
      { id: "b", name: "Bravo", area: "Taipei", lat: 25.04, lng: 121.56, rating: 3, cc: "TW", tags: ["cozy"],
        drinks: [{ n: "Matcha latte", orders: [{ date: day(10), p: 4 }, { date: day(11), p: 4 }, { date: day(50), p: 5 }] }] },
      { id: "c", name: "Charlie", area: "Evergreen Terrace 12", lat: 21.3, lng: -157.8, rating: 1, custom: true,
        drinks: [{ n: "Flat white", orders: [{ date: day(20), p: 9 }, { date: day(21), p: 9 }] }] },
      { id: "w", name: "Someday", wish: true, drinks: [] }
    ];
    show("stats"); renderStats();
    const body = document.getElementById("stats-body");
    return {
      heads: [...body.querySelectorAll(".statsec")].map(e => e.textContent),
      cards: body.querySelectorAll(".sc-wide").length,
      html: [...body.querySelectorAll(".sc-wide")].map(e => e.innerHTML).join(""),
      overflow: body.scrollWidth > body.clientWidth,
      spent: /Spent/.test(body.textContent) && /\$\d/.test(body.textContent.slice(body.textContent.indexOf("Spent")))
    };
  }, admin);

  const o = await seed(true);
  eq(o.cards >= 3, true, "at least the three chart cards: cadence, price spread and taste");
  eq(["Cadence", "Price spread", "Taste"].every(t => o.heads.some(h => h.indexOf(t) > -1)), true, "…each under its own heading");
  eq(o.overflow, false, "nothing sticks out at 375px");
  eq(o.spent, true, "the owner sees what they spent");
  eq(/Evergreen|21\.3|-157\.8/.test(o.html), false, "a private spot's address and coordinates never reach the page");
  eq(/<svg class="sc-svg heat"/.test(o.html) && /<svg class="sc-svg donut"/.test(o.html), true, "the heatmap and the verdict ring are inline SVG");
  eq(/<script|chart\.js|d3/i.test(o.html), false, "no chart library");

  const v = await seed(false);
  eq(/Spent/.test(await pg.evaluate(() => document.getElementById("stats-body").textContent)), false, "a viewer never sees the total spent, a money figure");
  eq(v.cards >= 3, true, "…but still gets the three charts");

  const num = await pg.evaluate(() => {
    isAdmin = true; applyMode(); renderStats();
    const t = document.getElementById("stats-body").textContent;
    return { median: /Median \$7\.00/.test(t), streak: /3 days/.test(t), loved: /33%/.test(t), wish: /Still to try/.test(t) };
  });
  eq(num, { median: true, streak: true, loved: true, wish: true },
     "median price, the 3-day streak, the loved share and the wishlist split come out of the seed");

  const tok = await pg.evaluate(() => {
    const rgb = t => { const d = document.createElement("div"); d.style.color = "var(" + t + ")"; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const fill = sel => getComputedStyle(document.querySelector(sel)).fill;
    return { hist: fill(".sc-svg .hb") === rgb("--acc"), txt: fill(".heat text") === rgb("--faint"), cell: fill(".heat .hc:not(.on)") === rgb("--star-off") };
  });
  eq(tok, { hist: true, txt: true, cell: true }, "chart colours come from theme tokens, so both themes follow");

  eq(errs, [], "no page errors");
  const ok = done();
  await ctx.close(); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
