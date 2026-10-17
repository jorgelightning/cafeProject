/* The ⋯ menu on the cafe page (Edit, Delete).

   It is a <details>, which stays open until told to close. Choosing Edit left it open, so after saving the
   visit it was back on the cafe page, floating over the content, and nothing put it away. It closes on any
   choice, on a tap anywhere else, on Escape (returning focus to the button), and whenever a cafe page opens. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  pg.on("dialog", d => d.dismiss());
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  const ids = await pg.evaluate(() => { isAdmin = true; applyMode(); _formSnap = null; return [rankOf0(1), rankOf0(2)]; function rankOf0(n) { return cafes.find(c => rankOf(c) === n).id; } });
  const open = id => pg.evaluate(i => { openDetail(i, "list"); }, id);
  const st = () => pg.evaluate(() => { const d = document.getElementById("d-more");
    return { open: d.open, view: document.getElementById("app").dataset.view, focusOnSummary: document.activeElement === d.querySelector("summary") }; });
  /* the button sits below the fold of a long cafe page, so tap it the way a thumb would after scrolling to it */
  const tap = sel => pg.evaluate(q => { const e = document.querySelector(q); e.scrollIntoView({ block: "center" }); e.click(); }, sel);

  await open(ids[0]);
  await tap("#d-more summary");
  let s = await st();
  eq(s.open, true, "tapping ⋯ opens the menu");
  await tap("#d-more summary");
  eq((await st()).open, false, "…and tapping it again closes it");

  /* the reported bug: Edit, then come back */
  await tap("#d-more summary");
  await tap(".dmorepop .btn.ghost");
  await pg.waitForTimeout(300);
  s = await st();
  eq([s.view, s.open], ["form", false], "choosing Edit closes the menu as the form opens");
  await open(ids[0]);
  s = await st();
  eq([s.view, s.open], ["detail", false], "…so it is not floating over the cafe page when you come back");

  /* Delete, declined */
  await tap("#d-more summary");
  await tap(".dmorepop .btn.danger");
  await pg.waitForTimeout(200);
  s = await st();
  eq(s.open, false, "choosing Delete closes it too, even when you decline the confirmation");
  eq(await pg.evaluate(i => cafes.some(c => c.id === i), ids[0]), true, "…and the cafe is still there");

  /* a tap anywhere else */
  await tap("#d-more summary");
  await tap("#d-hero");
  eq((await st()).open, false, "a tap anywhere else puts it away");

  /* Escape, with focus returned */
  await tap("#d-more summary");
  await pg.keyboard.press("Escape");
  s = await st();
  eq([s.open, s.focusOnSummary], [false, true], "Escape closes it and puts focus back on the ⋯ button");

  /* another cafe */
  await tap("#d-more summary");
  await open(ids[1]);
  eq((await st()).open, false, "opening another cafe starts with it closed");

  /* a click inside the menu that is not a choice does not close it before it acts */
  await tap("#d-more summary");
  const inside = await pg.evaluate(() => { const p = document.querySelector(".dmorepop"); p.dispatchEvent(new MouseEvent("click", { bubbles: true })); return document.getElementById("d-more").open; });
  eq(inside, true, "a tap on the menu's own panel does not close it");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
