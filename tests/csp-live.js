/* The Content Security Policy against the real network — NOT part of `npm test`: it talks to Google Maps, the live
   Firebase database (a read of the public cafes) and gstatic, so it needs a connection and says nothing about the
   code when offline. Run it after changing the policy or adding anything that loads from a new host:

     node tests/csp-live.js

   Every other test aborts cross-origin requests, so a policy that blocked Maps or the database would pass them all;
   this is the one place the policy meets the hosts it names. It listens for securitypolicyviolation, the browser's
   own report of anything refused, and fails on any.

   Maps checks the page's own address against the key's allowed sites (a Referer header is not enough: it reads the
   location), so the browser here is pointed at the live address and every request for it is answered from this
   checkout. The page Maps sees is the live site; the code it runs is this branch. Nothing is published. */
const { launch, checker, ready, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");
const LIVE = "https://jorgelightning.github.io/cafeProject/";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };
const srv = { origin: LIVE.replace(/\/$/, "") };

async function open(b, _srv, opts) {
  /* no service worker: it would answer from its cache, out of reach of the route below */
  const ctx = await b.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: "block" });
  await ctx.route(LIVE + "**", r => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname.slice("/cafeProject/".length)) || "index.html";
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return r.fulfill({ status: 404, body: "" });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  const pg = await ctx.newPage();
  await pg.addInitScript(o => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e =>
      window.__csp.push(e.violatedDirective + " " + (e.blockedURI || "inline") + (e.sourceFile ? " @" + e.sourceFile + ":" + e.lineNumber : ""))
    );
    if (o.noSocket) window.WebSocket = undefined; /* Firebase then falls back to long-polling, which loads scripts */
  }, opts || {});
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  pg.on("console", m => { if (/Refused to|Content Security Policy|integrity/i.test(m.text())) errs.push(m.text()); });
  await pg.goto(LIVE + "index.html", { waitUntil: "load" });
  await ready(pg, 30000);
  return { ctx, pg, errs };
}

(async () => {
  const b = await launch();

  /* 1. the normal page: Maps, the database over a WebSocket, a cafe's photo, the sign-in script */
  const a = await open(b, srv);
  await a.pg.waitForFunction(() => window.gReady === true || document.getElementById("map-msg").classList.contains("show"), null, { timeout: 30000 }).catch(() => {});
  const r1 = await a.pg.evaluate(async () => {
    const out = { maps: typeof gReady !== "undefined" && gReady === true, mapMsg: document.getElementById("map-msg").textContent.trim() };
    out.policy = !!document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    try {
      const snap = await Promise.race([fbDb.ref("cafes").limitToFirst(1).once("value"), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 15000))]);
      out.db = !!snap.val();
    } catch (e) { out.db = String(e); }
    const auth = await Promise.race([ensureAuth(), new Promise(r => setTimeout(() => r("timeout"), 15000))]);
    out.auth = !!auth && auth !== "timeout" && typeof firebase.auth === "function";
    /* a cafe page asks Places for its photo */
    const withPid = (cafes || []).find(c => c.pid && !c.private);
    if (withPid) { openDetail(withPid.id, "list"); }
    out.pid = !!withPid;
    return out;
  });
  await a.pg.waitForTimeout(6000); /* photos, tiles, fonts and the auth iframe arrive after the calls above return */
  const v1 = await a.pg.evaluate(() => window.__csp);
  eq(r1.policy, true, "the page carries the policy");
  eq(r1.maps, true, "Google Maps loads and calls back under the policy — " + (r1.mapMsg || "no map message"));
  eq(r1.db, true, "the database answers a read over the WebSocket");
  eq(r1.auth, true, "the sign-in script loads, by hash, and starts");
  eq(r1.pid, true, "there was a cafe with a place id to open");
  eq(v1, [], "nothing refused by the policy (page 1)");
  eq(a.errs, [], "no page errors or refusals in the console (page 1)");
  await a.ctx.close();

  /* 2. no WebSocket: the database's long-polling fallback loads scripts from *.firebaseio.com */
  const c = await open(b, srv, { noSocket: true });
  const r2 = await c.pg.evaluate(async () => {
    try {
      const snap = await Promise.race([fbDb.ref("cafes").limitToFirst(1).once("value"), new Promise((_, j) => setTimeout(() => j(new Error("timeout")), 20000))]);
      return !!snap.val();
    } catch (e) { return String(e); }
  });
  const v2 = await c.pg.evaluate(() => window.__csp);
  eq(r2, true, "the database answers over long-polling too");
  eq(v2, [], "nothing refused by the policy (long-polling)");
  eq(c.errs, [], "no page errors or refusals in the console (long-polling)");
  await c.ctx.close();

  const ok = done();
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
