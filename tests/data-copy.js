/* A copy of your data, from Settings.

   The automatic daily backup lives on GitHub; this is the other half, a button that saves a copy to wherever
   you want it. It is the owner's, it reads the list and writes nothing (the old export also cleared the
   "edits not synced yet" flag, which a download must never do), and it says what is in it and the date of the
   newest automatic backup copy, from backup.json (scripts/build-site.js writes it at deploy). */
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

  /* the dated line, read from backup.json; a header would not do: Pages dates every file by the last deploy */
  /* fetch is stood in for in the page: the service worker answers this request, and its own fetch is out of a
     page route's reach. tests/site-build.js serves a real backup.json. */
  const backupLine = body => pg.evaluate(async body => {
    const real = window.fetch;
    let asked = "";
    window.fetch = u => { asked = String(u);
      return Promise.resolve(body === null ? { ok: false, json: () => Promise.reject(new Error("404")) } : { ok: true, json: () => Promise.resolve().then(() => JSON.parse(body)) }); };
    renderDataCard();
    await new Promise(r => setTimeout(r, 50));
    window.fetch = real;
    return { text: document.getElementById("ab-backup").textContent, asked };
  }, body);
  const got = await backupLine(JSON.stringify({ at: "2026-10-16T09:17:41.000Z" }));
  const dated = got.text;
  eq(/^backup\.json\?t=\d+$/.test(got.asked), true, "the card asks backup.json, past any cache (" + got.asked + ")");
  eq(/The latest copy is from Oct 1[56]/.test(dated), true, "when backup.json carries a date, the card says when the newest copy was made (" + dated.slice(0, 70) + ")");
  const none = [(await backupLine(null)).text, (await backupLine("not json")).text, (await backupLine(JSON.stringify({ at: "someday" }))).text];
  eq(none.map(t => /^Backed up automatically every day/.test(t) && !/latest copy/.test(t)), [true, true, true],
     "…and with no backup.json (a local run), a broken one or no usable date, it says what the backup is, not when");
  const offline = await pg.evaluate(async () => {
    const real = window.fetch; window.fetch = () => Promise.reject(new Error("offline"));
    renderDataCard(); await new Promise(r => setTimeout(r, 50)); window.fetch = real;
    return document.getElementById("ab-backup").textContent;
  });
  eq(/^Backed up automatically every day/.test(offline) && !/latest copy/.test(offline), true, "…and offline the same");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
