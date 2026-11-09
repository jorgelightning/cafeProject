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
const { drawCards, setPoster, posterHTML, kindOf, W, H } = require("../scripts/share-cards.js");
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
  eq(/og:image" content="https:\/\/[^"]+\/c\/kh\.jpg"/.test(html) && /og:image:width" content="1200"/.test(html) && /og:image:height" content="630"/.test(html) && /twitter:card" content="summary_large_image"/.test(html), true, "…and previews with its own wide picture, not the app's icon");
  eq(/og:image:alt" content="A poster for Kissaten &lt;HiFi&gt; &amp; Co"/.test(html), true, "…described for a screen reader, escaped");
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

  /* ---- the pictures ---- */
  const t = posterHTML(kh);
  eq([t.includes("<HiFi>"), t.includes("&lt;HiFi&gt;"), t.includes("Get the Flat White"), t.includes("Loved it"), t.includes("San Francisco, CA")], [false, true, true, true, true], "a poster has the cafe, its area, what to get and the verdict, escaped");
  const wishful = posterHTML({ id: "w", name: "Someday", wish: true });
  eq([wishful.includes("On the want-to-try list"), wishful.includes("Get the")], [true, false], "a want-to-try cafe's says so and recommends nothing");
  const nope = { id: "n", name: "No", rating: 1, drinks: [{ n: "Drip", count: 1 }] };
  eq([posterHTML({ id: "f", name: "Fine", rating: 3 }).includes("It was fine"), posterHTML(nope).includes("Not for me"), posterHTML(nope).includes("Tried the Drip"), posterHTML(nope).includes("Get the")], [true, true, true, false], "the other verdicts are worded as the app words them, and a cafe that was not for you recommends nothing");
  eq(page(nope).includes("Not for me · Tried the Drip"), true, "…and the words under the picture agree with it");
  eq(/id="p"/.test(posterHTML({ id: "u", name: "Unrated" })), false, "a cafe with no verdict has no verdict on it");
  const matcha = posterHTML({ id: "m", name: "M", drinks: [{ n: "Matcha latte", count: 1 }] });
  eq([/data-k="matcha"/.test(matcha), matcha.includes("#4f8a3c"), /data-k="boba"/.test(posterHTML({ id: "b", name: "B", emoji: "\ud83e\uddcb" })), /data-k="gelato"/.test(posterHTML({ id: "g", name: "G", kind: "gelato" }))], [true, true, true, true], "its colour and drawing follow what the place serves, and an emoji or kind you chose wins");
  const good = { n: "Good", count: 1 }, bad = { n: "Bad", count: 5, reorder: "no" };
  eq([posterHTML({ id: "q", name: "Q", rating: 5, drinks: [bad, good] }).includes("Get the Good"), posterHTML({ id: "q", name: "Q", rating: 5, drinks: [bad] }).includes("Get the")], [true, false], "a drink given a thumbs down is never the one to get, however often it was ordered");
  const cards = fs.mkdtempSync(path.join(os.tmpdir(), "cards-"));
  const long = "The Extraordinarily Long Named Neighbourhood Specialty Coffee Roasters And Tea House";
  const hard = [kh, { id: "pv", name: "A Friend's Home", area: "742 Evergreen", custom: true, rating: 5 }, { id: "wi", name: "Someday", wish: true },
    { id: "lo", name: long, area: "A Very Long Area Name, Somewhere Far Away, In A Long Country", rating: 3, drinks: [{ n: "Freshly Milled Reserved Ceremonial Grade Matcha Latte With Oat Milk And Extra Foam", orders: [{ id: "x" }] }] },
    { id: "bare", name: "Bare", rating: 1 }, { id: "wd", name: "Kaffeehausgesellschaft", rating: 5 }, { id: "zh", name: "鹿角巷的茶与咖啡", area: "台北", rating: 5, drinks: [{ n: "黑糖珍珠鲜奶", orders: [{ id: "y" }] }] }];
  const drew = await drawCards(hard, cards);
  eq([drew.drawn, drew.fell, fs.readdirSync(cards).sort()], [6, [], ["bare.jpg", "kh.jpg", "lo.jpg", "wd.jpg", "wi.jpg", "zh.jpg"]], "a picture for each public cafe and none for a private spot");
  const fitB = await launch();
  const fitPg = await fitB.newPage({ viewport: { width: W, height: H } });
  const jpg = fs.readFileSync(path.join(cards, "kh.jpg"));
  const drawn = await fitPg.evaluate(src => new Promise(ok => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.src = src; }), "data:image/jpeg;base64," + jpg.toString("base64"));
  eq([drawn, W, H, jpg.length < 300 * 1024], [[1200, 630], 1200, 630, true], "…a real picture of the size link previews want, small enough for chat apps to keep (" + Math.round(jpg.length / 1024) + " KB)");
  const fitted = [];
  for (const c of hard.filter(x => !x.custom)) fitted.push((await setPoster(fitPg, c)).fits);
  eq(fitted.every(Boolean), true, "every poster's text fits with nothing cut, even a very long name or a single long word (" + JSON.stringify(fitted) + ")");
  await fitB.close();
  fs.rmSync(cards, { recursive: true, force: true });
  const deploy = fs.readFileSync(path.join(ROOT, ".github/workflows/deploy.yml"), "utf8");
  const stepAt = s => deploy.indexOf(s);
  eq(stepAt("scripts/build-site.js --data") > 0 && stepAt("scripts/build-site.js --data") < stepAt("scripts/share-cards.js --site _site") && stepAt("scripts/share-cards.js --site _site") < stepAt("upload-pages-artifact"), true, "the deploy draws them after building the site and before publishing it");

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
  const onSite = JSON.parse(fs.readFileSync(path.join(site, "cafes.json"), "utf8"));
  const appKind = await pg.evaluate(() => Object.fromEntries(cafes.map(c => [c.id, markKind(c)])));
  eq(onSite.filter(c => page(c) && appKind[c.id] !== kindOf(c)).map(c => c.id + ": " + appKind[c.id] + " in the app, " + kindOf(c) + " on the poster"), [], "every cafe's poster is the same kind as its page in the app");
  await ctx.close();
  await b.close();
  srv.close();
  fs.rmSync(site, { recursive: true, force: true });
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
