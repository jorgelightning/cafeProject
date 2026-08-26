/* The deploy trap that actually bit: five commits changed js/ while the ?v= on the script
   tags and sw.js's CACHE_V both sat still, so the service worker served that build forever
   and the fixes never reached the browser. A README warning did not prevent it. This does. */
const { ROOT, serve, launch, checker } = require("./harness");
const fs = require("fs");
const path = require("path");
const { eq, done } = checker();

const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
  const html = read("index.html");
  const sw = read("sw.js");

  /* every script and stylesheet carries the same ?v= */
  const tagVs = [...html.matchAll(/(?:src|href)="[^"]*\?v=(\d+)"/g)].map(m => m[1]);
  eq(tagVs.length > 0, true, "index.html versions its assets (" + tagVs.length + " tags)");
  eq([...new Set(tagVs)].length, 1, "…and they all agree (" + [...new Set(tagVs)].join(", ") + ")");
  const assetV = tagVs[0];

  /* sw.js precaches by that exact string, so a mismatch caches URLs nobody requests */
  const swAsset = (sw.match(/ASSET_V\s*=\s*"\?v=(\d+)"/) || [])[1];
  eq(swAsset, assetV, "sw.js ASSET_V matches the tags");

  /* and its cache name has to move with them, or activate() never drops the old cache */
  const cacheV = (sw.match(/CACHE_V\s*=\s*"cafemap-v(\d+)"/) || [])[1];
  eq(cacheV, assetV, "sw.js CACHE_V matches the tags");

  /* every js file index.html loads must be in the precache list, or it is fetched fresh
     every launch and the app is not really offline-capable */
  const loaded = [...html.matchAll(/src="(js\/[^"?]+)/g)].map(m => m[1]);
  const missing = loaded.filter(f => !sw.includes('"./' + f + '"'));
  eq(missing, [], "every script index.html loads is precached");

  /* the worker must not be able to pin a stale build again */
  eq(/caches\.match\(req\)\.then\(function\(hit\)\{ return hit \|\| net; \}\)/.test(sw), true,
     "the shell revalidates in the background rather than serving cache-first forever");

  /* prove it end to end: a file changed underneath a live worker is picked up on reload */
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage();
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    if (r.active && r.active.state !== "activated") {
      await new Promise(res => { const t = setTimeout(res, 3000);
        r.active.addEventListener("statechange", () => { if (r.active.state === "activated") { clearTimeout(t); res(); } }); });
    }
  });

  const probe = "js/config.js?v=" + assetV;
  const first = await pg.evaluate(u => fetch(u).then(r => r.text()).then(t => t.length), probe);

  const cfg = path.join(ROOT, "js/config.js");
  const original = fs.readFileSync(cfg, "utf8");
  try {
    fs.writeFileSync(cfg, original + "\n/* touched by cache-version test */\n");
    await pg.evaluate(u => fetch(u), probe);          // this load refreshes the cache
    await pg.waitForTimeout(300);
    const after = await pg.evaluate(u => fetch(u).then(r => r.text()).then(t => t.length), probe);
    eq(after > first, true,
       "a changed file reaches the page on the next load (" + first + " -> " + after + " bytes)");
  } finally {
    fs.writeFileSync(cfg, original);
  }

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
