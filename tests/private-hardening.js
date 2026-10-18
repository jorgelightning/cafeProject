/* Three gaps from the risk review, closed.

   A private spot no longer carries a Google place id (it opens the exact address on Google Maps), in the app or in
   the daily backup. Signing out leaves the browser holding no exact address, except a write still waiting for the
   cloud. And the averages a barely-compared cafe is pulled towards follow a changed verdict at once. */
const { serve, launch, checker, ready, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  /* the backup job strips it too, and refuses to commit a file that still has one */
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/backup.yml"), "utf8");
  eq(/del\(\.pid\)/.test(wf), true, "the daily backup drops a private spot's place id");
  eq(/has\("pid"\)\s*\|\s*not/.test(wf), true, "…and refuses to commit a backup that still has one");

  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  /* M1: the place id */
  const pid = await pg.evaluate(() => {
    const priv = redactPrivate({ id: "p", custom: true, lat: 21.30123, lng: -157.80456, area: "Kaimuki", pid: "ChIJ-secret" });
    const pub = redactPrivate({ id: "q", lat: 21.30123, lng: -157.80456, area: "Kaimuki", pid: "ChIJ-public" });
    _needsHeal = {};
    const adopted = adoptCafes([{ id: "h", name: "Old", custom: true, lat: 21.3, lng: -157.8, area: "Kaimuki", pid: "ChIJ-old", drinks: [] }])[0];
    return { priv: "pid" in priv, pub: pub.pid, adopted: "pid" in adopted, heal: !!_needsHeal.h };
  });
  eq(pid.priv, false, "a private spot is published without its place id");
  eq(pid.pub, "ChIJ-public", "…a public cafe keeps its own, for photos and directions");
  eq([pid.adopted, pid.heal], [false, true], "an old private record found with one is cleaned on load and queued to be healed in the cloud");

  /* M2: signing out */
  const out = await pg.evaluate(() => {
    privDetail = { a: { area: "742 Evergreen Terrace #12", lat: 21.30123, lng: -157.80456 }, b: { area: "Somewhere 9", lat: 1, lng: 2 } };
    privPending = {};
    persistPrivate();
    const before = localStorage.getItem("cafemap.private.v1").length > 10;
    const waiting = forgetPrivateHere();
    const r = { before, waiting, mirror: localStorage.getItem("cafemap.private.v1"), queue: localStorage.getItem("cafemap.private.pending.v1"), mem: Object.keys(privDetail) };
    /* now with one write still waiting for the cloud */
    privDetail = { a: { area: "742 Evergreen Terrace #12", lat: 21.30123, lng: -157.80456 }, b: { area: "Somewhere 9", lat: 1, lng: 2 } };
    privPending = { b: { base: null, value: privDetail.b } };
    persistPrivate();
    r.waiting2 = forgetPrivateHere();
    r.mirror2 = JSON.parse(localStorage.getItem("cafemap.private.v1") || "{}");
    r.queue2 = JSON.parse(localStorage.getItem("cafemap.private.pending.v1") || "{}");
    privDetail = {}; privPending = {}; persistPrivate(); localStorage.removeItem("cafemap.private.v1"); localStorage.removeItem("cafemap.private.pending.v1");
    return r;
  });
  eq(out.before, true, "while signed in, this device keeps a copy of the exact addresses (for offline use)");
  eq([out.waiting, out.mirror, out.queue, out.mem], [0, null, null, []], "signing out with nothing waiting leaves no address in the browser, stored or in memory");
  eq([out.waiting2, Object.keys(out.mirror2), Object.keys(out.queue2)], [1, ["b"], ["b"]], "…a write still waiting for the cloud is kept, and only that one");

  const signout = fs.readFileSync(path.join(ROOT, "js/storage.js"), "utf8").replace(/\r\n/g, "\n");
  eq(/!ok && isAdmin\) \{[\s\S]{0,200}forgetPrivateHere\(\)/.test(signout), true, "…and it runs when the owner signs out");

  /* L1: the cache behind the verdict averages */
  const l1 = await pg.evaluate(() => {
    const loved = cafes.find(c => !c.wish && !isProvisional(c) && bucketOf(c) === "loved");
    _priorSig = -1; const before = tierPriors().loved;
    const old = loved.rating; loved.rating = 3;
    const after = tierPriors().loved;
    loved.rating = old; _priorSig = -1;
    return { moved: before !== after };
  });
  eq(l1.moved, true, "moving a cafe from Loved to Fine changes the Loved average at once, not at the next comparison");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
