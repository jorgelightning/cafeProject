/* A long list does not download every photo at once.

   Photos are CSS backgrounds (so loading="lazy" cannot apply) and each card also probed its URL
   with new Image() as it rendered: 100+ photos requested before you had scrolled. They now load as a
   card nears the screen. The photos here are tiny same-origin files with a unique query each, so the
   requests can be counted. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  let hits = new Set();
  pg.on("request", rq => { const m = /icon-192\.png\?c=(\d+)/.exec(rq.url()); if (m) hits.add(m[1]); });
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(700);

  await pg.evaluate(() => {
    cafes = Array.from({ length: 60 }, (_, i) => ({ id: "c" + i, name: "Cafe " + i, area: "Area", rating: 4, photo: location.origin + "/icon-192.png?c=" + i, drinks: [] }));
    listTab = "been"; show("list"); renderList();
  });
  await pg.waitForTimeout(500);
  let r = await pg.evaluate(() => ({ cards: document.querySelectorAll("#grid .card").length,
    withImage: [...document.querySelectorAll("#grid .ph")].filter(e => e.style.backgroundImage).length,
    pending: document.querySelectorAll("#grid .ph[data-bg]").length }));
  eq(r.cards, 60, "all 60 cards render");
  eq(r.withImage > 0 && r.withImage < 20, true, "only the cards near the screen have their photo set (" + r.withImage + " of 60)");
  eq(r.withImage + r.pending, 60, "…the rest are waiting, not lost");
  eq(hits.size > 0 && hits.size < 20, true, "…and only those were requested (" + hits.size + " of 60)");

  const before = hits.size;
  await pg.evaluate(() => { const sc = document.querySelector("#pane-list .scroll"); sc.scrollTop = sc.scrollHeight; });
  await pg.waitForTimeout(700);
  eq(hits.size > before, true, "scrolling loads more (" + before + " -> " + hits.size + ")");
  r = await pg.evaluate(() => ({ first: !!document.querySelector("#grid .card .ph").style.backgroundImage,
    last: !!document.querySelector("#grid .card:last-child .ph").style.backgroundImage }));
  eq(r, { first: true, last: true }, "…the first cards stay loaded once scrolled past, and the last ones have arrived");

  /* a photo that arrives from elsewhere must not be overwritten by a stale pending one */
  r = await pg.evaluate(() => { const el = document.querySelector("#grid .ph[data-bg]"); if (!el) return { skipped: true };
    const id = el.closest(".card").dataset.id; applyCardPhoto(id, location.origin + "/icon-192.png?c=fresh");
    return { gone: !el.hasAttribute("data-bg"), img: el.style.backgroundImage }; });
  eq(r.skipped || (r.gone && /fresh/.test(r.img)), true, "a photo applied by other code cancels the pending one");

  /* no IntersectionObserver: everything loads at once, as before */
  r = await pg.evaluate(() => { const IO = window.IntersectionObserver; delete window.IntersectionObserver;
    const gone = !("IntersectionObserver" in window);
    renderList(); const pend = document.querySelectorAll("#grid .ph[data-bg]").length; window.IntersectionObserver = IO; return gone ? pend : -1; });
  eq(r, 0, "without IntersectionObserver every photo is set immediately — the old behaviour, never a blank list");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
