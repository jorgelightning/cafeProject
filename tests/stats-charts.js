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
    /* the wishlist is the "1 still to try" in the line at the top; its own bar went (stats audit, 28 Oct) */
    return { median: /Median \$7\.00/.test(t), streak: /3 days/.test(t), loved: /33%/.test(t), wish: /1 still to try/.test(t) && !/Logged and still to try/.test(t) };
  });
  eq(num, { median: true, streak: true, loved: true, wish: true },
     "median price, the 3-day streak, the loved share and the wishlist count come out of the seed");

  const tok = await pg.evaluate(() => {
    const rgb = t => { const d = document.createElement("div"); d.style.color = "var(" + t + ")"; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    const fill = sel => getComputedStyle(document.querySelector(sel)).fill;
    return { hist: fill(".sc-svg .hb") === rgb("--acc"), txt: fill(".heat text") === rgb("--faint"), cell: fill(".heat .hc:not(.on)") === rgb("--star-off") };
  });
  eq(tok, { hist: true, txt: true, cell: true }, "chart colours come from theme tokens, so both themes follow");

  // ================= the stats audit (28 Oct) =================
  /* On the live site Worth it drew Regret in the map's loved green and Drink DNA gave 25% sugar the want-to-try violet;
     Size read 12, 16, 8, 14 oz; Taste said 81% loved in its title and 73% in its legend; the longest price band was one
     drink; and the trips, the regulars' rhythm and how each place went were not drawn anywhere. */
  const s = await pg.evaluate(() => {
    isAdmin = true; applyMode();
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return statDayKey(d); };
    const inMonth = (back, dd) => { const d = new Date(); return statDayKey(new Date(d.getFullYear(), d.getMonth() - back, dd)); };
    const o = (date, p, x) => Object.assign({ date: date, p: p }, x || {});
    const SF = (id, name, rating, drinks) => ({ id, name, area: "San Francisco, CA", lat: 37.77, lng: -122.42, rating, drinks });
    cafes = [
      SF("k", "Kissa", 5, [{ n: "Hojicha latte", orders: [o(day(1), 6, { reorder: "yes", size: "8 oz", sweet: "0%", ice: "Warm", milk: "Oat" }), o(day(8), 7, { reorder: "yes", size: "16 oz", sweet: "50%", ice: "Less ice", milk: "Oat" }),
        o(day(15), 7, { reorder: "yes", size: "12 oz", sweet: "25%", ice: "Hot", milk: "Oat" }), o(day(22), 8, { reorder: "yes", size: "12 oz", sweet: "0%", ice: "Regular ice", milk: "Oat" })] }]),
      SF("q", "Quiet Spot", 4, [{ n: "Cortado", orders: [o(day(70), 5, { reorder: "neutral", size: "8 oz", milk: "Oat" }), o(day(75), 5, { reorder: "no", milk: "Oat" })] }]),
      SF("m", "Middle", 3, [{ n: "Hojicha latte", orders: [o(day(30), 9, { reorder: "no", size: "16 oz", milk: "Oat" })] }]),
      SF("u", "Unrated", 0, [{ n: "Latte", orders: [o(day(5), 6, { reorder: "yes", milk: "Oat" })] }]),
      { id: "h1", name: "Hono One", area: "Honolulu", lat: 21.30, lng: -157.85, rating: 5, drinks: [{ n: "Latte", orders: [o(inMonth(2, 3), 6, { reorder: "yes", milk: "Oat" })] }] },
      { id: "h2", name: "Hono Two", area: "Honolulu", lat: 21.28, lng: -157.80, rating: 4, drinks: [{ n: "Latte", orders: [o(inMonth(2, 4), 6, { reorder: "yes", milk: "Oat" })] }] },
      { id: "h3", name: "Hono Three", area: "Honolulu", lat: 21.29, lng: -157.82, rating: 3, drinks: [{ n: "Latte", orders: [o(inMonth(2, 5), 6, { milk: "Oat" })] }] },
      { id: "x", name: "Nowhere", area: "", lat: 0.5, lng: -160.5, rating: 5, drinks: [{ n: "Latte", orders: [o(day(9), 6, { milk: "Lactose-free" })] }] },
      { id: "p", name: "Secret Garden", area: "Evergreen Terrace 12", lat: 37.70, lng: -122.45, rating: 2, custom: true, drinks: [{ n: "Mocha", orders: [o(inMonth(1, 6), 7, { reorder: "neutral", milk: "Oat" })] }] },
      { id: "w", name: "Someday", wish: true, drinks: [] },
    ];
    _growthMonth = ""; show("stats"); renderStats();
    const body = document.getElementById("stats-body");
    const card = t => { const e = [...body.querySelectorAll(".statsec")].find(x => x.textContent.indexOf(t) > -1); return e && e.nextElementSibling; };
    const worth = card("Worth it"), dna = card("Drink DNA"), coll = card("Your collection"), taste = card("Taste"), geo = card("Where you go");
    const capOf = (box, t) => [...box.querySelectorAll(".sc-cap")].find(e => e.textContent.indexOf(t) === 0);
    const segs = cap => { let n = cap.nextElementSibling; return n && n.classList.contains("sc-stack") ? [...n.children].map(e => e.title.split(" · ")[0] + "=" + e.style.background) : n && n.className; };
    const regRows = [...body.querySelectorAll(".lbrow.reg:not(.rg-axisrow)")];
    const out = {
      worthSegs: [...worth.querySelector(".sc-stack").children].map(e => e.style.background),
      worthLeg: [...worth.querySelectorAll(".legrows span")].map(e => e.textContent),
      bands: /Order-again rate by price/.test(body.textContent),
      noBorrowed: !/background:\s*var\(--(want|good)\)/.test(body.innerHTML),
      size: segs(capOf(dna, "Size")), ice: segs(capOf(dna, "Ice or heat")), milk: segs(capOf(dna, "Milk")),
      milkLine: capOf(dna, "Milk").nextElementSibling.textContent,
      collHead: coll && coll.querySelector(".sc-head").textContent,
      trip: coll && [...coll.querySelectorAll("svg.growth text")].map(e => e.textContent).filter(t => /\+\d/.test(t)),
      collTab: coll && coll.closest(".stabpanel").dataset.tab,
      hits: coll && coll.querySelectorAll(".gr-hit").length, keys: coll && coll.querySelectorAll('.gr-hit[role="button"][tabindex="0"]').length,
      stripCap: capOf(worth, "Your"), dotsNo: worth.querySelectorAll(".ps-no").length, dotsMid: worth.querySelectorAll(".ps-mid").length,
      stripText: [...worth.querySelectorAll("svg.pstrip text")].map(e => e.textContent).join("|"),
      tasteLeg: [...taste.querySelectorAll(".sc-donutrow .legrows > div")].map(d => d.querySelector("span").textContent + " " + d.querySelector("b").textContent),
      regs: regRows.map(r => [r.querySelector(".lbname").textContent.split(" · ")[0], r.querySelectorAll(".rg-tick").length, !!r.querySelector(".rg-note")]),
      axis: body.querySelectorAll(".rg-axis span").length,
      geoRows: [...geo.querySelectorAll(".hb-row")].map(r => r.querySelector(".hb-nm").textContent + ":" + r.querySelector(".hb-v").textContent + ":" + r.querySelectorAll(".sc-stack.thin > span").length),
      geoNote: geo.parentNode && [...body.querySelectorAll(".statnote")].map(e => e.textContent).find(t => /Farthest/.test(t)),
      rcov: body.querySelectorAll(".rcov").length,
      priv: /Secret Garden|Evergreen/.test(coll.innerHTML + worth.innerHTML),
    };
    out.stripCap = out.stripCap && out.stripCap.textContent;
    /* tap the trip month */
    setGrowthMonth(inMonth(2, 1).slice(0, 7));
    out.picked = card("Your collection").querySelector(".sc-pick").textContent;
    setGrowthMonth(inMonth(1, 1).slice(0, 7));
    out.pickedPriv = card("Your collection").querySelector(".sc-pick").textContent;
    const rgb = t => { const d = document.createElement("div"); d.style.color = "var(" + t + ")"; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    out.noFill = getComputedStyle(body.querySelector(".ps-no")).fill === rgb("--ch-no");
    out.overflow = body.scrollWidth > body.clientWidth;
    return out;
  });
  eq(s.worthSegs, ["var(--ch-yes)", "var(--ch-mid)", "var(--ch-no)"], "Worth it is green, yellow and red, the map's verdict colours, in that order");
  eq(s.worthLeg, ["👍 Order again", "😐 Maybe", "👎 Wouldn’t"], "…each with its emoji, so colour is never the only cue");
  eq(s.noBorrowed, true, "no Stats bar borrows the want-to-try violet or the loved green for something else");
  eq(s.size, ["8 oz=var(--ch-o1)", "12 oz=var(--ch-o3)", "16 oz=var(--ch-o4)"], "Size runs small to large, light to dark (three sizes spread over the four steps), whatever the counts");
  eq(s.ice, ["Regular ice=var(--ch-cold)", "Less ice=var(--ch-cool)", "Warm=var(--ch-warm)", "Hot=var(--ch-hot)"], "Ice or heat runs coldest to hottest, blue to orange, as the form's own scale does");
  eq([s.milk, s.milkLine], ["sc-one", "12 of 13 drinks. The rest: Lactose-free 1."], "a bar that would be 90% one colour is a sentence instead");
  eq(s.collTab, "habits", "the collection line opens Habits");
  eq(/^9 cafes/.test(s.collHead), true, "…counting every cafe with a first visit (" + s.collHead + ")");
  eq(s.trip, ["Hawaii +3"], "three new cafes away from home in one month are a trip, named on the line");
  eq([s.hits, s.keys > 0 && s.keys < s.hits], [24, true], "24 months to tap, and only the ones that added cafes are keyboard stops");
  eq(/Hono One, Hono Two, Hono Three/.test(s.picked) && /4 new/.test(s.picked), true, "tapping the trip's month lists what it added (" + s.picked + ")");
  eq(/a private spot/.test(s.pickedPriv) && !/Secret Garden/.test(s.pickedPriv), true, "…and a private spot is counted, never named");
  eq(s.bands, false, "the four price bands are gone");
  eq(s.stripCap, "Your two 👎 cost $5.00 and $9.00", "the price strip says what the 👎 drinks cost");
  eq([s.dotsNo, s.dotsMid], [2, 2], "…one dot for each 👎 and each 😐");
  eq(/Quiet Spot \$5\.00/.test(s.stripText) && /Middle \$9\.00/.test(s.stripText), true, "…and the two 👎 are named with their price");
  eq(s.priv, false, "a private spot's name and address are in neither the strip nor the collection");
  eq(s.noFill, true, "the strip's colours come from the chart tokens");
  eq(s.tasteLeg, ["Loved it 5 · 63%", "It was fine 2 · 25%", "Not for me 1 · 13%"], "Taste's legend counts the 8 rated cafes only, the same base as its title");
  eq(s.regs.map(r => r[0]), ["Kissa", "Quiet Spot"], "the two cafes with a second day are regulars");
  eq(s.regs[0][1], 4, "…Kissa's strip has a tick for each of its four days");
  eq([s.regs[0][2], s.regs[1][2]], [false, true], "…and Quiet Spot, last seen 70 days ago, says so");
  eq(s.axis, 9, "one month axis under the strips");
  eq(s.geoRows.some(r => /^Other:/.test(r)), false, "Where you go has no row called Other");
  eq(s.geoRows[0], "California:5:4", "California: 5 cafes, its bar split loved, fine, not for me and not rated");
  eq(/1 the app can’t place/.test(s.geoNote || ""), true, "…and the cafe with no country is counted in the note");
  eq(s.rcov, 0, "the monthly chart has no green coverage line");
  eq(s.overflow, false, "nothing sticks out at 375px");

  eq(errs, [], "no page errors");
  const ok = done();
  await ctx.close(); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
