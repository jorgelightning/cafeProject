/* The ranking becomes the spine of the app.

   The comparison engine has been here all along — the Go tab has force-ranked cafes with Elo
   for months. What was missing is that nothing else on screen knew about it: the input was
   five stars (75 of 90 rated cafes sat on 4 or 5, so it separated almost nothing), the list
   never showed a position, and the wishlist — the other half of what the app is for — was one
   chip among seven, two taps deep behind Filters.

   A: the input is the three-way call a comparison ranking wants. B: position goes everywhere,
   because it is the one number that is actually a given cafe's own. C: been and want-to-try
   are the two lists, not a filter. E: Stats opens with the collection. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  // ================= A: three buckets =================
  const buckets = await pg.evaluate(() => ({
    map: [5, 4, 3, 2, 1, 0].map(r => bucketOf({ rating: r })),
    labels: BUCKETS.map(x => x[2]),
    writes: BUCKETS.map(x => x[1]),
    colours: [5, 4, 3, 2, 1, 0].map(r => ratingColor(r))
  }));
  eq(buckets.map, ["loved", "loved", "fine", "meh", "meh", ""],
     "4 and 5 are one judgement, 1 and 2 are another — which is why nothing had to be migrated");
  eq(buckets.labels, ["Loved it", "It was fine", "Not for me"], "three answers, each a sentence");
  eq(buckets.writes, [5, 3, 1], "…and a new save lands on the canonical value for its bucket");
  eq([...new Set(buckets.colours)].length, 4, "one colour per bucket plus unrated");
  eq(buckets.colours[0], buckets.colours[1], "a 5 and a 4 are the same colour on the map now");

  /* Every cafe in the live file has to land in a bucket, or the migration-free claim is false. */
  const real = JSON.parse(fs.readFileSync(path.join(ROOT, "cafes.json"), "utf8"));
  const list = Array.isArray(real) ? real : (real.cafes || Object.values(real));
  const stray = list.filter(c => {
    const r = c.rating || 0;
    return r !== 0 && !(r >= 1 && r <= 5);
  });
  eq(stray, [], "every one of the " + list.length + " stored ratings reads as a bucket");

  const widget = await pg.evaluate(() => {
    isAdmin = true; applyMode(); editId = null; _formSnap = null; openForm();
    const read = () => ({
      on: [...document.querySelectorAll("#f-rate .bkt")].filter(b => b.classList.contains("on"))
            .map(b => b.textContent.trim()),
      rating: formRating });
    setBucket("loved");  const a = read();
    setBucket("fine");   const c = read();
    setBucket("fine");   const d = read();   /* tapping the lit one again */
    setBucket("meh");    const e = read();
    return { a, c, d, e };
  });
  eq(widget.a, { on: ["Loved it"], rating: 5 }, "choosing an answer lights it and stores its value");
  eq(widget.c, { on: ["It was fine"], rating: 3 }, "…one at a time");
  eq(widget.d, { on: [], rating: 0 }, "…and tapping the lit one clears it, which is the only way back to no opinion");
  eq(widget.e, { on: ["Not for me"], rating: 1 }, "…then any of them can be chosen again");

  const js = fs.readdirSync(path.join(ROOT, "js"))
    .map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n");
  eq(/starsHTML/.test(js), false, "the star renderer is gone, not left behind unused");

  // ================= B: position, everywhere =================
  const ranks = await pg.evaluate(() => {
    /* two cafes on an identical score, so competition ranking has a tie to handle */
    cafes = [
      { id: "a", name: "Top",   rating: 5, elo: 1700, matches: 9, drinks: [] },
      { id: "b", name: "Tie 1", rating: 5, elo: 1600, matches: 9, drinks: [] },
      { id: "c", name: "Tie 2", rating: 5, elo: 1600, matches: 9, drinks: [] },
      { id: "d", name: "Last",  rating: 3, elo: 1400, matches: 9, drinks: [] },
      { id: "e", name: "Never compared", rating: 4, matches: 0, drinks: [] },
      { id: "w", name: "Someday", wish: true, rating: 0, drinks: [] }
    ];
    const m = rankMap();
    return { a: m.a, b: m.b, c: m.c, d: m.d, never: m.e || null, wish: m.w || null, n: m._n };
  });
  eq([ranks.a, ranks.b, ranks.c, ranks.d], [1, 2, 2, 4],
     "competition ranking: a tie shares a position and the next one skips");
  eq(ranks.never, null, "a cafe nobody has compared has no position — sixteen of them share the untouched 5.0");
  eq(ranks.wish, null, "…and somewhere you have not been is not in the ranking at all");
  eq(ranks.n, 4, "the total counts only what is actually ranked");

  const badges = await pg.evaluate(() => {
    isAdmin = false; applyMode(); document.getElementById("q").value = "";
    setListTab("been"); show("list"); renderList();
    const cards = [...document.querySelectorAll(".card")];
    return { cards: cards.length,
             badged: cards.filter(c => c.querySelector(".rankbadge")).length,
             first: (cards[0].querySelector(".rankbadge") || {}).textContent || null,
             unranked: cards.filter(c => !c.querySelector(".rankbadge"))
                            .map(c => c.querySelector(".n").textContent) };
  });
  eq(badges.cards, 5, "the five places you have been");
  eq(badges.badged, 4, "…four of which carry a position");
  eq(badges.unranked, ["Never compared"], "…and the one that does not is the one never compared");
  eq(/^#\d+$/.test(badges.first || ""), true, "the badge is a bare position (" + badges.first + ")");

  const detail = await pg.evaluate(() => {
    openDetail("b", "list");
    const m = document.getElementById("d-meta").textContent;
    const pill = document.querySelector("#d-stars .bkpill");
    return { meta: m.replace(/\s+/g, " ").trim(), pill: pill ? pill.textContent.trim() : null };
  });
  eq(/#2 of 4/.test(detail.meta), true, "the detail page leads with the position: " + detail.meta);
  eq(detail.pill, "Loved it", "…and says the judgement in words, not a run of glyphs");

  // ================= C: been, and want to try =================
  const tabs = await pg.evaluate(() => {
    const read = () => ({
      labels: [...document.querySelectorAll("#listtabs button")].map(b => b.textContent.replace(/\s+/g, " ").trim()),
      on: [...document.querySelectorAll('#listtabs button[aria-pressed="true"]')].map(b => b.textContent.trim().split(" ")[0]),
      names: [...document.querySelectorAll(".card .n")].map(e => e.textContent)
    });
    setListTab("been"); const been = read();
    setListTab("want"); const want = read();
    setListTab("been");
    return { been, want,
             wishChip: /🔖/.test(document.getElementById("filterchips").textContent),
             count: activeFilterCount() };
  });
  eq(tabs.been.labels, ["Been 5", "Want to try 1"], "both lists are named, with their own counts");
  eq(tabs.been.on, ["Been"], "…and the one you are looking at says so");
  eq(tabs.been.names.indexOf("Someday"), -1, "\"Been\" means been — the wishlist stops padding it");
  eq(tabs.want.names, ["Someday"], "…and \"Want to try\" is only the places you have not been");
  eq(tabs.wishChip, false, "the wishlist is no longer a chip behind Filters");
  eq(tabs.count, 0, "…and which list you are on is navigation, so it never counts as a filter");

  const sticky = await pg.evaluate(() => {
    setListTab("want"); clearFilters();
    const afterClear = listTab;
    toggleFavFilter(); const afterFav = listTab;
    toggleFavFilter(); setListTab("been");
    return { afterClear, afterFav };
  });
  eq(sticky.afterClear, "want", "\"All\" clears the filters, not the list you are looking at");
  eq(sticky.afterFav, "want", "…and neither does turning on favourites");

  // ================= E: Stats opens with the collection =================
  const profile = await pg.evaluate(() => {
    cafes = [
      /* country comes from the coordinates, not a stored code, so these have to be real places */
      { id: "a", name: "One", area: "SoMa", lat: 37.78, lng: -122.41, rating: 5, elo: 1600, matches: 4,
        drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01" }, { date: "2026-09-02" }] }] },
      { id: "b", name: "Two", area: "Taipei", lat: 25.04, lng: 121.56, rating: 4, elo: 1500, matches: 2,
        drinks: [{ n: "Matcha latte", orders: [{ date: "2026-09-03" }] }] },
      { id: "w", name: "Someday", wish: true, drinks: [] }
    ];
    show("stats"); renderStats();
    const body = document.getElementById("stats-body");
    const prof = body.querySelector(".profile");
    return { first: body.firstElementChild.className,
             figs: [...prof.querySelectorAll(".pfig")].map(f =>
               f.querySelector("b").textContent + " " + f.querySelector("span").textContent),
             line: (body.querySelector(".pline") || {}).textContent || "" };
  });
  eq(profile.first, "profile", "Stats opens with the collection, before any chart");
  eq(profile.figs[0], "2 cafes", "…the places you have been");
  eq(profile.figs.indexOf("2 countries") > -1, true, "…how far they spread");
  /* "Other" is what an unplaceable cafe resolves to, and six real ones do. It is not a country. */
  const other = await pg.evaluate(() => {
    cafes = cafes.concat([{ id: "x", name: "Nowhere", rating: 4, elo: 1500, matches: 2, drinks: [] }]);
    renderStats();
    return [...document.querySelectorAll(".profile .pfig")].map(f =>
      f.querySelector("b").textContent + " " + f.querySelector("span").textContent);
  });
  eq(other.indexOf("2 countries") > -1, true, "a cafe that resolves to \"Other\" does not become a country");
  eq(/Most ordered/.test(profile.line), true, "…and what you actually order: " + profile.line.trim());
  eq(/still to try/.test(profile.line), true, "…with the other list not forgotten");

  eq(errs, [], "no page errors");

  const ok = done();
  await ctx.close(); await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
