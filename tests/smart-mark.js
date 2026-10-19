/* The guess at what a cafe serves, wherever the app shows its emoji.

   Most records hold the default coffee cup, so a hojicha bar showed a cup on its tile, its cafe page and its map
   pin, and searching "boba" or "matcha" missed it (search reads the emoji as a type word). cafeMark() is the one
   place that decides: the emoji you chose, else the guess the postcard already uses. */
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

  const r = await pg.evaluate(() => {
    isAdmin = true; applyMode(); _formSnap = null;
    const d = (n, p) => ({ n, orders: [{ date: "2026-09-01", p: p || 5 }] });
    cafes = [
      { id: "kiss", name: "Kiss of Matcha", area: "Outer Sunset", emoji: "☕", rating: 5, elo: 1700, matches: 6, drinks: [d("Hojicha latte")] },
      { id: "ool", name: "Oolong Tea Project", area: "Ximen", emoji: "☕", rating: 5, elo: 1650, matches: 6, drinks: [d("Cheese Foam Ruby Oolong Tea")] },
      { id: "cof", name: "Morning Glass", area: "Oakland", emoji: "☕", rating: 4, elo: 1600, matches: 6, drinks: [d("Drip")] },
      { id: "tea", name: "Charlie's Tea", area: "Taipei", rating: 4, elo: 1550, matches: 6, drinks: [d("Ceylon black tea")] },
      { id: "pick", name: "Corner Coffee", area: "Berkeley", emoji: "🥐", rating: 4, elo: 1500, matches: 6, drinks: [d("Latte")] },
      { id: "home", name: "Friend's Place", area: "", custom: true, emoji: "🏠", rating: 5, elo: 1450, matches: 6, drinks: [d("Flat white")] },
      { id: "new", name: "Never Compared Matcha Bar", area: "SoMa", emoji: "☕", rating: 4, matches: 0, drinks: [d("Matcha latte")] }
    ];
    const mark = id => cafeMark(cafes.find(c => c.id === id));
    show("list"); listCompact = true; sortMode = "ranked"; document.getElementById("q").value = ""; renderList();
    const tile = id => { const card = [...document.querySelectorAll("#grid .card")].find(x => (x.getAttribute("onclick") || "").indexOf("'" + id + "'") > -1); const em = card && card.querySelector(".em"); if (!em) return null; const v = em.querySelector("svg.mkv"); return v ? "drawn:" + v.dataset.k : em.textContent; };
    const names = q => { document.getElementById("q").value = q; renderList(); return [...document.querySelectorAll("#grid .card")].map(c => c.textContent.replace(/\s+/g, " ")).join("|"); };
    const out = {
      marks: { kiss: mark("kiss"), ool: mark("ool"), cof: mark("cof"), tea: mark("tea"), pick: mark("pick"), home: mark("home"), none: cafeMark(null) },
      tiles: { kiss: tile("kiss"), ool: tile("ool"), cof: tile("cof"), pick: tile("pick"), home: tile("home") }
    };
    const boba = names("boba"), matcha = names("matcha"), plain = names("tea");
    out.search = { boba: /Oolong/.test(boba) && !/Kiss of Matcha/.test(boba), matcha: /Kiss of Matcha/.test(matcha) && /Never Compared/.test(matcha) && !/Oolong/.test(matcha), tea: /Charlie/.test(plain) };
    document.getElementById("q").value = ""; renderList();
    openDetail("kiss", "list");
    const hv = document.querySelector("#d-hero-emoji svg.mkv"); out.hero = hv ? "drawn:" + hv.dataset.k : document.getElementById("d-hero-emoji").textContent; out.heroBg = getComputedStyle(document.getElementById("d-hero")).backgroundImage;
    show("compare"); renderBoard();
    out.queue = [...document.querySelectorAll(".gorow .gotile svg.mkv")].map(e => "drawn:" + e.dataset.k);
    return out;
  });
  eq(r.marks, { kiss: "🍵", ool: "🧋", cof: "☕", tea: "🍵", pick: "🥐", home: "🏠", none: "☕" },
     "the mark is the guess for the default cup, and your own choice (🥐, 🏠) always wins");
  eq(r.tiles, { kiss: "drawn:matcha", ool: "drawn:boba", cof: "drawn:coffee", pick: "drawn:pastry", home: "🏠" }, "the List tile draws it (bowl, boba cup, coffee cup, and 🥐 you chose as a pastry), and 🏠 you chose is shown as itself");
  eq(r.hero, "drawn:matcha", "…so does the cafe page");
  eq(/linear-gradient/.test(r.heroBg), true, "…on the colour of what it serves, as on its share card");
  eq(r.queue.includes("drawn:matcha"), true, "…and the Go queue's tile for a cafe not yet compared");
  eq(r.search, { boba: true, matcha: true, tea: true }, "search finds a boba shop by \"boba\" and a matcha bar by \"matcha\" without anyone choosing an emoji");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
