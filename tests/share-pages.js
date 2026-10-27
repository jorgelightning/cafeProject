/* A shared link previews as the cafe (user test, 26 Oct).

   Every ?cafe= link previewed in Messages as "JL Cafe Project" and the app icon. Now Share sends /c/<id>, a small
   page per public cafe (scripts/share-pages.js) carrying its name, place, verdict and what to order, which forwards
   to the app. 404.html forwards a link to a cafe too new to have a page. Private spots never get one. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");
const { ROOT, serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();
const { build, page } = require("../scripts/share-pages.js");
const { buildSite } = require("../scripts/build-site.js");

(async () => {
  /* ---- the pages ---- */
  const kh = { id: "kh", name: "Kissaten <HiFi> & Co", area: "San Francisco, CA", rating: 5, drinks: [
    { n: "Hojicha latte", orders: [{ id: "a" }] },
    { n: "Flat White", orders: [{ id: "b" }, { id: "c", qty: 2 }] },
  ] };
  const html = page(kh);
  eq(/<title>Kissaten &lt;HiFi&gt; &amp; Co · San Francisco, CA<\/title>/.test(html), true, "a page is titled with the cafe and its place, escaped");
  eq(/og:description" content="Loved it · Get the Flat White · JL Cafe Project"/.test(html), true, "…described by its verdict and what to order (the drink ordered most)");
  eq(/location\.replace\("\.\.\/\?cafe=kh"\)/.test(html) && /http-equiv="refresh" content="0; url=\.\.\/\?cafe=kh"/.test(html), true, "…and it forwards to the app at once");
  eq(/og:description" content="On the want-to-try list · JL Cafe Project"/.test(page({ id: "w", name: "Someday", wish: true, drinks: [] })), true, "a want-to-try cafe says so");
  eq(page({ id: "pv", name: "Friend's Place", custom: true }), null, "a private spot never gets a page");
  eq(page({ id: "bad id!", name: "X" }), null, "nor does an id that could not be a file name");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "share-"));
  fs.writeFileSync(path.join(dir, "gone.html"), "old");
  const n = build([kh, { id: "pv", name: "P", custom: true }, { id: "w", name: "W", wish: true }], dir);
  eq([n, fs.readdirSync(dir).sort()], [2, ["kh.html", "w.html"]], "a build writes the public cafes and removes pages for cafes that are gone");

  /* ---- the published pages match the data ----
     They are made at deploy from the cafes.json that goes out (scripts/build-site.js), not committed */
  const site = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  buildSite({ out: site, minify: false, log: () => {} });
  const data = JSON.parse(fs.readFileSync(path.join(site, "cafes.json"), "utf8"));
  const want = data.filter(c => page(c)).map(c => c.id + ".html").sort();
  const have = fs.readdirSync(path.join(site, "c")).filter(f => f.endsWith(".html")).sort();
  eq(have.length === want.length && have.every((f, i) => f === want[i]), true, "the site's c/ has a page for every public cafe in its cafes.json and nothing else (" + have.length + ")");
  const priv = data.filter(c => c.custom).map(c => c.id + ".html");
  eq(priv.filter(f => have.indexOf(f) >= 0), [], "…and none for a private spot");
  eq(execSync("git ls-files c", { cwd: ROOT, encoding: "utf8" }).trim(), "",
     "main does not carry share pages of its own: a stale copy there could outlive a cafe made private");

  /* ---- 404.html sends a link with no page yet on to the app ---- */
  const src = /<script>([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(ROOT, "404.html"), "utf8"))[1];
  const go = p => { let to = null; vm.runInNewContext(src, { location: { pathname: p, replace: u => (to = u) } }); return to; };
  eq([go("/cafeProject/c/abc"), go("/cafeProject/c/abc.html"), go("/cafeProject/nope")], ["/cafeProject/?cafe=abc", "/cafeProject/?cafe=abc", "/cafeProject/"], "404.html forwards /c/<id> to ?cafe=<id>, and anything else to the app");

  /* ---- in the browser, on the built site ---- */
  const srv = await serve(site);
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  const id = want[0].replace(/\.html$/, "");
  await pg.goto(srv.origin + "/c/" + id + ".html");
  await pg.waitForURL(u => /\?cafe=/.test(String(u)));
  await ready(pg);
  await pg.waitForFunction(() => app.dataset.view === "detail", null, { timeout: 8000 });
  const landed = await pg.evaluate(() => ({ q: location.search, cur: curId, share: cafeShareUrl(curId) }));
  eq([landed.q, landed.cur], ["?cafe=" + id, id], "opening a share page lands on that cafe in the app");
  eq(landed.share, srv.origin + "/c/" + id, "Share hands out the /c/ link");
  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  fs.rmSync(site, { recursive: true, force: true });
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
