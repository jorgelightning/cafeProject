/* The List as rows, with landmarks.

   111 photo cards were 12,000px of scroll on a phone, two columns of near-identical blocks with nowhere to
   land. Rows are the default now (three lines: name, what to order and its price, place and time; the rank
   at the right), grouped under sticky bands that follow the sort: Top 10 / 11 to 30 / 31 to 60 / the rest by
   rank, This week / This month by recency, a verdict by rating. The photo cards stay a layout choice. */
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

  const seeded = await pg.evaluate(() => {
    localStorage.removeItem("cafemap.listLayout");
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    cafes = [];
    for (let i = 1; i <= 40; i++)
      cafes.push({ id: "c" + i, name: "Cafe " + i, area: "Area", rating: i % 7 === 0 ? 3 : 5, elo: 1700 - i * 8, matches: 8, updated: new Date(Date.now() - i * 3 * 86400000).toISOString(),
        drinks: [{ n: "Hojicha latte", orders: [{ date: day(i), p: i === 1 ? 7.25 : "" }] }] });
    isAdmin = false; applyMode(); sortMode = "ranked"; activeGuide = ""; $("q").value = "";
    return true;
  });
  const fresh = await pg.evaluate(() => { listCompact = localStorage.getItem("cafemap.listLayout") !== "grid"; return listCompact; });
  eq(fresh, true, "with no saved choice the List is rows");

  const r = await pg.evaluate(() => {
    listCompact = true; show("list"); renderList();
    const g = document.getElementById("grid");
    const bands = [...g.querySelectorAll(".band")].map(x => x.textContent);
    const first = g.querySelector(".card");
    const rk = [...g.querySelectorAll(".rkcol")].map(x => x.textContent + (x.classList.contains("g") ? "*" : ""));
    return { bands, rk: rk.slice(0, 12), plus: g.querySelectorAll(".again").length, lines: [...first.querySelectorAll(".b > div")].map(x => x.className),
             price: first.querySelector(".cdp") ? first.querySelector(".cdp").textContent : "", oHidden: getComputedStyle(first.querySelector(".cdo")).display,
             tile: first.querySelector(".ph").style.background, doc: document.documentElement.scrollWidth, win: innerWidth };
  });
  eq(r.bands, ["Top 10 · 10", "11 to 30 · 20", "31 to 60 · 10"], "sorted by rank, the list has Top 10, 11 to 30 and 31 to 60 landmarks with their counts");
  eq(r.rk.slice(0, 2).concat(r.rk.slice(10, 11)), ["#1*", "#2*", "#11"], "the rank sits at the right, gold for the top ten");
  eq(r.plus, 0, "no card carries a +");
  eq(r.lines, ["n", "m", "cdrink"], "each row is name, place and time, then the order (the order is moved up by CSS)");
  eq(r.price, "$7.25", "the price rides on the order line");
  eq(r.oHidden, "none", "…and the words 'Order the' are put away in a row: the drink name is the answer");
  eq(/color-mix/.test(r.tile), true, "a placeholder tile is a soft wash of the verdict colour, not a loud block");
  eq(r.doc <= r.win + 1, true, "nothing scrolls sideways at 375px");

  const other = await pg.evaluate(() => {
    sortMode = "recent"; renderList();
    const recent = [...document.querySelectorAll("#grid .band")].map(x => x.textContent);
    sortMode = "ranked"; $("q").value = "Cafe 1"; renderList();
    const searching = document.querySelectorAll("#grid .band").length;
    $("q").value = ""; setGuide("top10");
    const guided = document.querySelectorAll("#grid .band").length;
    clearAll(); setListLayout(false); renderList();
    const photo = document.querySelectorAll("#grid .band").length;
    setListLayout(true);
    return { recent, searching, guided, photo };
  });
  eq(other.recent.length >= 2 && /^This week/.test(other.recent[0]), true, "by recency the landmarks are This week, This month and Earlier (" + other.recent.join(" | ") + ")");
  eq([other.searching, other.guided, other.photo], [0, 0, 0], "no bands while searching, inside a guide, or in the photo layout");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
