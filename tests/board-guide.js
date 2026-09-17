/* The Board, read by somebody who is not the owner.

   It used to render "#1 · Zen Gelato & Bar · 11 comparisons · <area> · 7.4" and then tell the
   reader that 37 cafes had fewer than three comparisons so their places were provisional. A
   visitor was given the ranking's bookkeeping and none of the stars, drinks or written notes
   already stored against the cafe.

   A: every row carries its reason. D: the bookkeeping is for the owner only. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  const seed = () => pg.evaluate(() => {
    cafes = [
      { id: "z", name: "Zen Gelato & Bar", area: "Honolulu", rating: 5, elo: 1600, matches: 11,
        review: "There were four different types of matcha to choose from, and I have tried all of them across several visits.",
        drinks: [{ n: "Matcha latte - Samidori", orders: [{ date: "2026-08-01" }] },
                 { n: "Hojicha latte", orders: [{ date: "2026-08-02" }, { date: "2026-08-09" }, { date: "2026-08-11" }] }] },
      { id: "k", name: "Kissaten HiFi", area: "San Francisco", rating: 4, elo: 1560, matches: 13,
        review: "Go-to for hojicha lattes and flat white — consistent and cozy.",
        drinks: [{ n: "Hojicha Latte", orders: [{ date: "2026-09-01" }] }] },
      { id: "b", name: "Bare Cafe", area: "Oakland", elo: 1520, matches: 4, drinks: [] },
      { id: "n", name: "Never Ranked", area: "Seattle", rating: 3, matches: 0, drinks: [] }
    ];
  });

  const render = (admin) => pg.evaluate((a) => {
    isAdmin = a; applyMode && applyMode();
    renderBoard();
    const host = document.getElementById("cmp-body");
    const first = host.querySelector(".lbrow.guide");
    return {
      text: host.textContent.replace(/\s+/g, " ").trim(),
      rows: host.querySelectorAll(".lbrow.guide").length,
      firstStars: (first.querySelector(".lbstars") || {}).textContent || "",
      firstOrder: (first.querySelector(".lborder") || {}).textContent || "",
      firstSay: (first.querySelector(".lbsay") || {}).textContent || "",
      firstSub: (first.querySelector(".lbsub") || {}).textContent || "",
      scores: host.querySelectorAll(".lbscore").length,
      sub: (host.querySelector(".cs") || {}).textContent || "",
      statnote: !!host.querySelector(".statnote"),
      queue: /Never compared/.test(host.textContent)
    };
  }, admin);

  // ---- A: the row carries its reason ----
  await seed();
  let v = await render(false);
  eq(v.rows, 3, "the three ranked cafes are listed (the never-compared one is not ranked)");
  eq(v.firstStars, "★★★★★", "a row shows the rating that was already stored");
  eq(v.firstOrder, "Order the Hojicha latte · 3×",
     "…and the drink to order there, counted by orders rather than by record");
  eq(/four different types of matcha/.test(v.firstSay), true, "…and the owner's own words");
  /* The note is rendered inside curly quotes, so strip them before checking the trim. */
  const bare = v.firstSay.replace(/^[\u201c"]|[\u201d"]$/g, "");
  eq(/…$/.test(bare), true, "…trimmed, since notes run to 273 characters");
  eq(/\s…$/.test(bare) || /[a-z]…$/.test(bare), true, "…ending on a whole word, not mid-word");
  eq(bare.length <= 97, true, "…to a readable length (" + bare.length + " chars)");

  v = await pg.evaluate(() => {
    const rows = [...document.querySelectorAll("#cmp-body .lbrow.guide")];
    const bare = rows.find(r => /Bare Cafe/.test(r.textContent));
    return { order: !!bare.querySelector(".lborder"), stars: !!bare.querySelector(".lbstars"),
             say: !!bare.querySelector(".lbsay"), name: !!bare.querySelector(".lbname") };
  });
  eq(v, { order: false, stars: false, say: false, name: true },
     "a cafe with no rating, drink or note degrades to just its name rather than showing empty rows");

  // ---- D: the bookkeeping is the owner's ----
  v = await render(false);
  eq(/comparison/.test(v.firstSub), false, "a visitor is not told how many times it was compared");
  eq(v.scores, 0, "…nor shown the Elo score, where #1 and #2 can both print 7.4");
  eq(v.statnote, false, "…nor warned that places are provisional");
  eq(v.queue, false, "…nor shown the never-compared queue, which is the owner's chore");
  eq(/best first/.test(v.sub), true, "…and gets a line about the collection instead");
  eq(/head-to-head/.test(v.text), false, "the words 'head-to-head' never reach a visitor");
  eq(/Honolulu/.test(v.firstSub), true, "the area, which is about the cafe, stays");

  v = await render(true);
  eq(/11 comparisons/.test(v.firstSub), true, "the owner still sees the comparison count");
  eq(v.scores, 3, "…and the scores");
  eq(v.statnote, true, "…and the provisional caveat");
  eq(v.queue, true, "…and the never-compared queue");
  eq(/head-to-head/.test(v.sub), true, "…and the ranking progress in the header");

  // ---- the reason survives being the thing you tap ----
  v = await pg.evaluate(() => {
    const r = document.querySelector("#cmp-body .lbrow.guide");
    return { tappable: r.getAttribute("role") === "button" && r.tabIndex === 0,
             opens: /openDetail/.test(r.getAttribute("onclick") || "") };
  });
  eq(v.tappable, true, "a row is still reachable without a pointer");
  eq(v.opens, true, "…and still opens the cafe");

  // ---- stats leaderboards must not have been restyled ----
  v = await pg.evaluate(() => {
    renderStats();
    const mag = document.querySelector("#stats-body .lbrow.mag");
    return { exists: !!mag, guide: mag ? mag.classList.contains("guide") : null };
  });
  eq(v.exists, true, "the stats leaderboards still render");
  eq(v.guide, false, "…and did not pick up the board's row layout, which .lbrow alone would have");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
