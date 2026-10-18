/* A copy of your data, from Settings.

   The automatic daily backup lives on GitHub; this is the other half, a button that saves a copy to wherever
   you want it. It is the owner's, it reads the list and writes nothing (the old export also cleared the
   "edits not synced yet" flag, which a download must never do), and it says what is in it and when the last
   automatic backup ran. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const seed = () => pg.evaluate(() => {
    cafes = [
      { id: "a", name: "Kiss of Matcha", area: "Outer Sunset", rating: 4, drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01", p: 7 }] }] },
      { id: "pv", name: "Friend's Place", area: "", custom: true, lat: 21.3, lng: -157.8, rating: 5, drinks: [] },
      { id: "w", name: "Someday", wish: true, drinks: [] }
    ];
    localStorage.setItem(DIRTY_FLAG, "1");
  });
  await seed();

  const card = admin => pg.evaluate(a => { isAdmin = a; applyMode(); show("settings"); renderSettings();
    const c = document.getElementById("card-data");
    return { shown: getComputedStyle(c).display !== "none", note: document.getElementById("ab-copynote").textContent, backup: document.getElementById("ab-backup").textContent,
             h: Math.round(document.getElementById("ab-download").getBoundingClientRect().height) }; }, admin);
  const v = await card(false);
  eq(v.shown, false, "a visitor has no Your data card");
  const o = await card(true);
  eq(o.shown, true, "the owner does");
  eq(/^2 visited cafes and 1 to try\./.test(o.note), true, "…it says what a copy holds: 2 visited cafes and 1 to try (" + o.note.slice(0, 40) + ")");
  eq(/Backed up automatically every day/.test(o.backup), true, "…and that the daily backup exists (" + o.backup.slice(0, 50) + ")");
  eq(o.h >= 44, true, "…with a button that clears the 44px floor (" + o.h + ")");

  const dl = await Promise.all([pg.waitForEvent("download"), pg.click("#ab-download")]);
  const file = dl[0], name = file.suggestedFilename();
  const body = JSON.parse(require("fs").readFileSync(await file.path(), "utf8"));
  eq(/^cafes-\d{4}-\d{2}-\d{2}\.json$/.test(name), true, "the download is a dated file (" + name + ")");
  eq(body.map(c => c.id), ["a", "pv", "w"], "…holding every cafe, the wishlist too");
  eq(await pg.evaluate(() => localStorage.getItem(DIRTY_FLAG)), "1", "…and saving a copy does not mark unsynced edits as done");

  /* the dated line, when the backup file says when it was written */
  const dated = await pg.evaluate(async () => {
    const real = window.fetch;
    window.fetch = () => Promise.resolve({ ok: true, headers: { get: k => (k.toLowerCase() === "last-modified" ? "Fri, 16 Oct 2026 09:17:41 GMT" : null) } });
    renderDataCard();
    await new Promise(r => setTimeout(r, 50));
    window.fetch = real;
    return document.getElementById("ab-backup").textContent;
  });
  eq(/The last one was Oct 1[56]/.test(dated), true, "when the backup file carries a date, the card says when (" + dated.slice(0, 70) + ")");
  const offline = await pg.evaluate(async () => {
    const real = window.fetch; window.fetch = () => Promise.reject(new Error("offline"));
    renderDataCard(); await new Promise(r => setTimeout(r, 50)); window.fetch = real;
    return document.getElementById("ab-backup").textContent;
  });
  eq(/^Backed up automatically every day/.test(offline) && !/last one/.test(offline), true, "…and offline it says what the backup is, not when");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
