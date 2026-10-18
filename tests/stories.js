/* The year and the top five, as Stories.

   Both are 1080 x 1920 pictures drawn with the same vessels, rings and footer as the cafe postcard, and both
   leave the top 14% and bottom 13% clear for Instagram's own bars. The top five is the owner's to send: its
   button is on the Go tab for the owner only, it needs three ranked cafes, and it leaves out private spots,
   which are somebody's home, and wishlist cafes, which are not ranked. */
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

  const seed = () => pg.evaluate(() => {
    const Y = new Date().getFullYear();
    const d = (n, dates) => ({ n, orders: dates.map(x => ({ date: Y + "-" + x, p: 6 })) });
    const mk = (id, name, elo, drink, extra) => Object.assign({ id, name, area: "Area " + id, rating: 4, elo, matches: 8, drinks: [drink] }, extra || {});
    cafes = [
      mk("a", "Kiss of Matcha", 1800, d("Hojicha latte", ["02-01", "03-01", "04-01"])),
      mk("pv", "Friend's Place", 1790, d("Flat white", ["02-02"]), { custom: true, area: "SECRETAREA 12", emoji: "🏠" }),
      mk("np", "Hot Newcomer", 1950, d("Latte", ["02-09"]), { matches: 2 }),
      mk("b", "Boba Corner Tea", 1700, d("Cheese Foam Oolong", ["02-03"])),
      mk("c", "Morning Glass", 1600, d("Drip", ["02-04", "05-04"])),
      mk("e", "Scoop Gelato", 1500, d("Affogato", ["06-05"])),
      mk("f", "Quiet Roasters", 1400, d("Cortado", ["07-06"])),
      mk("g", "Sixth Place", 1300, d("Drip", ["08-07"])),
      { id: "w", name: "Someday", wish: true, drinks: [] },
      { id: "u", name: "Never Compared", area: "X", rating: 3, matches: 0, drinks: [d("Latte", ["09-09"])] }
    ];
    for (let i = 0; i < 20; i++) cafes.push(mk("x" + i, "Filler " + i, 1000 - i, d("Drip", ["0" + (1 + (i % 9)) + "-1" + (i % 9)])));
    privDetail = { pv: { area: "742 Evergreen Terrace #12", lat: 21.30123, lng: -157.80456 } };
    return Y;
  });

  await seed();
  const go = admin => pg.evaluate(a => { isAdmin = a; applyMode(); _formSnap = null; show("compare"); renderBoard();
    const btn = [...document.querySelectorAll("#cmp-body .handoff")].find(x => /Share my top/.test(x.textContent));
    return { btn: btn ? btn.textContent.replace(/\s+/g, " ").trim() : null, items: top5Items().map(i => i.name) }; }, admin);
  const o = await go(true);
  eq(o.items, ["Kiss of Matcha", "Boba Corner Tea", "Morning Glass", "Scoop Gelato", "Quiet Roasters"],
     "the top five is the five best ranked: no private spot (Friend's Place is second by score), no wishlist, nothing unranked, and no cafe still being placed (Hot Newcomer scores highest after two answers)");
  eq(/Share my top 5/.test(o.btn || ""), true, "the owner gets \"Share my top 5\" on the Go tab");
  eq((await go(false)).btn, null, "…a visitor does not (it is the owner's list to send)");

  /* three ranked cafes is the floor */
  const few = await pg.evaluate(() => { const keep = cafes; cafes = keep.filter(c => ["a", "b"].includes(c.id)); isAdmin = true; applyMode(); show("compare"); renderBoard();
    const has = [...document.querySelectorAll("#cmp-body .handoff")].some(x => /Share my top/.test(x.textContent)); cafes = keep; return has; });
  eq(few, false, "with fewer than three ranked cafes there is nothing to share yet");

  /* the picture: dialog, size, and what is on it */
  const shot = await pg.evaluate(() => {
    isAdmin = true; applyMode(); show("compare"); renderBoard();
    const calls = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { calls.push({ t: String(t), x, y }); return orig.apply(this, arguments); };
    openTop5Story();
    CanvasRenderingContext2D.prototype.fillText = orig;
    const cv = document.getElementById("pc-canvas");
    return { open: !document.getElementById("pcmodal").hidden, size: [cv.width, cv.height], aria: cv.getAttribute("aria-label"), dialog: document.getElementById("pcmodal").getAttribute("aria-label"),
             texts: calls.map(c => c.t), ys: calls.map(c => c.y), title: _pcSubject.title, message: _pcSubject.message, slug: _pcSubject.slug };
  });
  eq([shot.open, shot.size], [true, [1080, 1920]], "Share my top 5 opens a 9:16 Story in the share dialog");
  eq([shot.title, shot.slug, shot.aria, shot.dialog], ["My top 5 cafés", "my-top-5-cafes", "Your top 5 cafés", "Share your top 5"], "…named for what it is");
  eq(shot.texts.filter(t => /Kiss of Matcha|Boba Corner|Morning Glass|Scoop Gelato|Quiet Roasters/.test(t)).length, 5, "…with all five names on it");
  eq(shot.texts.some(t => /Friend|SECRETAREA|Someday|Never Compared/.test(t)) || /Friend|SECRETAREA/.test(shot.message), false, "…and no private spot, no address, no wishlist cafe");
  eq(Math.min(...shot.ys) >= 269 && Math.max(...shot.ys) <= 1670, true, "…everything inside the Story's safe band (" + Math.round(Math.min(...shot.ys)) + " to " + Math.round(Math.max(...shot.ys)) + ")");
  eq(/^My top 5 cafés: 1\. Kiss of Matcha, 2\. Boba Corner Tea/.test(shot.message), true, "…and the message lists them in order");
  await pg.evaluate(() => closePostcard());

  /* the year Story: the same rule, with nothing private named */
  const yr = await pg.evaluate(() => {
    const calls = [];
    const orig = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { calls.push({ t: String(t), x, y }); return orig.apply(this, arguments); };
    isAdmin = true; applyMode();
    const w = wrappedYear(cafes.filter(c => !c.wish), new Date().getFullYear());
    const cv = document.createElement("canvas"); cv.width = 1080; cv.height = 1920;
    drawYearStory(cv, w);
    CanvasRenderingContext2D.prototype.fillText = orig;
    return { w: w && { visits: w.visits, drink: w.drink && w.drink.name, back: w.back && w.back.name }, texts: calls.map(c => c.t), ys: calls.map(c => c.y) };
  });
  eq(yr.w && yr.w.visits >= 20, true, "the year has enough visits to draw (" + (yr.w && yr.w.visits) + ")");
  eq(Math.min(...yr.ys) >= 269 && Math.max(...yr.ys) <= 1670, true, "the year Story stays in the safe band (" + Math.round(Math.min(...yr.ys)) + " to " + Math.round(Math.max(...yr.ys)) + ")");
  eq(yr.texts.some(t => /^MY \d{4} IN CAF/.test(t)) && yr.texts.includes("JL CAFE PROJECT"), true, "…headed with the year and signed with the footer");
  eq(yr.texts.some(t => /Friend|SECRETAREA/.test(t)), false, "…and names no private spot");
  eq(yr.texts.some(t => /[\u{1F300}-\u{1FAFF}☕]/u.test(t)), false, "…and types no emoji");

  /* the dialog still closes the way it did, with focus back */
  const closed = await pg.evaluate(() => {
    const opener = document.querySelector("#cmp-body .handoff"); opener.focus(); openTop5Story();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { hidden: document.getElementById("pcmodal").hidden, back: document.activeElement === opener };
  });
  eq(closed, { hidden: true, back: true }, "Escape closes the Story dialog and puts focus back on the button that opened it");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
