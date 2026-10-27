/* The site that gets published (scripts/build-site.js, run by .github/workflows/deploy.yml).

   Since E1 the live site is a folder the deploy builds, not the branch as it stands: only the app's own files go out
   (the branch used to publish tests/, the design notes and server.js too), the cafes.json comes from the nightly
   backup on the `data` branch, the share pages are made from it, and the JavaScript and CSS are minified. This
   checks each of those, then runs the built copy in the browser. `npm run test:site` goes further and runs the
   whole suite against a build. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");
const { ROOT, serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();
const { buildSite, checkData } = require("../scripts/build-site.js");

/** every file under `dir`, relative and with forward slashes */
const walk = (dir, pre) =>
  fs.readdirSync(dir).flatMap(f => (fs.statSync(path.join(dir, f)).isDirectory() ? walk(path.join(dir, f), (pre || "") + f + "/") : [(pre || "") + f]));

(async () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  const s = buildSite({ out, log: () => {} });
  const files = walk(out);

  /* ---- only the app ---- */
  const top = [...new Set(files.map(f => f.split("/")[0]))].sort();
  eq(top, ["404.html", "c", "cafes.json", "icon-180.png", "icon-192.png", "icon-512.png", "index.html", "js", "manifest.json", "styles.css", "styles.css.map", "sw.js", "sw.js.map", "vendor"],
     "the site is the app's own files, the data and the share pages: no tests, notes, tooling, rules or server.js");

  eq(s.backupAt, null, "built from main's cafes.json there is no backup date to give, so no backup.json");

  /* ---- everything the app loads is in it ---- */
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const wanted = [
    ...[...html.matchAll(/(?:src|href)="(?!https?:|data:|#|mailto:)([^"?#]+)/g)].map(m => m[1]),
    ...[...sw.matchAll(/"\.\/([^"?]+)/g)].map(m => m[1]),
    ...(manifest.icons || []).map(i => i.src),
  ].filter(f => f && !f.endsWith("/"));
  eq([...new Set(wanted)].filter(f => files.indexOf(f.replace(/^\.\//, "")) < 0), [], "every file index.html, sw.js and manifest.json name is published (" + new Set(wanted).size + ")");

  /* ---- smaller ---- */
  const kb = n => Math.round(n / 1024) + " KB";
  eq(s.sizes.min < s.sizes.raw * 0.65 && s.sizes.gzMin < s.sizes.gzRaw * 0.7, true,
     "minified, the JavaScript and CSS are a good third smaller (" + kb(s.sizes.raw) + " -> " + kb(s.sizes.min) + ", compressed " + kb(s.sizes.gzRaw) + " -> " + kb(s.sizes.gzMin) + ")");
  const core = fs.readFileSync(path.join(out, "js/core.js"), "utf8");
  eq([/\/\*|^\s*\/\/(?!# sourceMappingURL)/m.test(core), /\n\/\/# sourceMappingURL=core\.js\.map\n$/.test(core), JSON.parse(fs.readFileSync(path.join(out, "js/core.js.map"), "utf8")).sources],
     [false, true, ["core.js"]], "comments are gone from the published copy, and a source map beside each file leads back to the source");
  eq(fs.readFileSync(path.join(out, "vendor/markerclusterer-2.5.3.min.js"), "utf8") === fs.readFileSync(path.join(ROOT, "vendor/markerclusterer-2.5.3.min.js"), "utf8"), true,
     "the vendored library is published as it came");

  /* ---- the data: checked before it goes out ---- */
  const why = list => { try { checkData(list); return "ok"; } catch (e) { return String(e.message); } };
  const spot = { id: "p1", name: "Somewhere Secret", custom: true, lat: 37.77, lng: -122.42, area: "Mission" };
  eq([why([{ id: "a", name: "A" }, spot]), why([]), why({})], ["ok", "cafes.json is not a list of cafes", "cafes.json is not a list of cafes"], "a list with coarse private spots passes; anything that is not a list does not");
  const refused = [{ ...spot, lat: 37.774929 }, { ...spot, area: "123 Mission St" }, { ...spot, pid: "ChIJxxxx" }].map(c => why([{ id: "a" }, c]));
  eq(refused.map(m => /position 1 carries (precise coordinates|a street address|a place id); not publishing/.test(m)), [true, true, true],
     "a private spot with precise coordinates, a street address or a place id stops the build");
  eq(refused.filter(m => /Secret|37\.77|Mission|ChIJ/.test(m)), [], "…and the message says where it is in the list, never what it is");

  /* the data branch, as the deploy checks it out: a git repo whose last commit is the night's backup */
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "data-"));
  const nightly = [{ id: "n1", name: "Newer Cafe", area: "Oakland, CA", rating: 4 }, { id: "n2", name: "Hidden", custom: true, lat: 37.8, lng: -122.27 }];
  fs.writeFileSync(path.join(data, "cafes.json"), JSON.stringify(nightly));
  const night = "2026-10-20T09:17:41Z";
  execSync("git init -q && git add cafes.json && git -c user.name=bot -c user.email=bot@example.invalid commit -q -m backup", {
    cwd: data, env: { ...process.env, GIT_AUTHOR_DATE: night, GIT_COMMITTER_DATE: night } });
  const out2 = fs.mkdtempSync(path.join(os.tmpdir(), "site-"));
  const s2 = buildSite({ data, out: out2, minify: false, log: () => {} });
  eq([fs.readFileSync(path.join(out2, "cafes.json"), "utf8") === JSON.stringify(nightly), fs.readdirSync(path.join(out2, "c")), s2.cafes],
     [true, ["n1.html"], 2], "with --data the site publishes the nightly cafes.json, and makes share pages from it (none for the private spot)");
  const backupFile = fs.readFileSync(path.join(out2, "backup.json"), "utf8");
  eq(JSON.parse(backupFile), { at: "2026-10-20T09:17:41.000Z" },
     "…and backup.json carries when that backup was committed: Settings reads it, since Pages dates every file by the last deploy");
  const said = [];
  const s3 = buildSite({ data: path.join(data, "nothing-here"), out: out2, minify: false, log: m => said.push(m) });
  eq([fs.readFileSync(path.join(out2, "cafes.json"), "utf8") === fs.readFileSync(path.join(ROOT, "cafes.json"), "utf8"), said.some(m => /no cafes\.json in .*publishing the one on main/.test(m)), s3.backupAt, fs.existsSync(path.join(out2, "backup.json"))],
     [true, true, null, false], "before the first nightly backup there is no data branch: it publishes main's cafes.json, says so, and gives no date");
  let threw = "";
  try { buildSite({ out: ROOT, minify: false, log: () => {} }); } catch (e) { threw = e.message; }
  eq(/refusing to build into/.test(threw) && fs.existsSync(path.join(ROOT, "index.html")), true, "it will not empty the repo to build into it");

  /* ---- the minified copy runs ---- */
  const srv = await serve(out);
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  await pg.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective));
  });
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/");
  await ready(pg);

  /* the page calls the classic scripts' functions by name, and they read each other's top-level variables */
  const names = fs.readdirSync(path.join(ROOT, "js")).filter(f => f.endsWith(".js")).flatMap(f =>
    [...fs.readFileSync(path.join(ROOT, "js", f), "utf8").matchAll(/^(?:async\s+)?function\s+([\w$]+)|^(?:let|const|var)\s+([\w$]+)/gm)].map(m => m[1] || m[2]));
  /* reading a name that was never declared throws; one declared and still empty (boot.js `let rt;`) does not */
  const lost = await pg.evaluate(ns => ns.filter(n => { try { (0, eval)(n); return false; } catch (e) { return e instanceof ReferenceError; } }), names);
  eq(lost, [], "every top-level function and variable of the classic scripts keeps its name (" + names.length + ")");
  const onNames = [...html.matchAll(/data-on(?:-[a-z]+)?="([\w$]+)"/g)].map(m => m[1]);
  eq(await pg.evaluate(ns => ns.filter(n => typeof (/** @type {any} */ (window))[n] !== "function"), onNames), [], "…including every function index.html names in data-on (" + new Set(onNames).size + ")");

  const id = await pg.evaluate(() => { show("list"); const c = cafes.find(x => !x.custom && !x.wish); openDetail(c.id, "list"); return c.id; });
  await pg.waitForFunction(() => app.dataset.view === "detail");
  const shown = await pg.evaluate(() => ({ cur: curId, cards: document.querySelectorAll("#grid .card").length, lib: esc("<b>") + eloStep(1500, 1500, 16, 16, false).a }));
  eq([shown.cur, shown.cards > 0, shown.lib], [id, true, "&lt;b&gt;1508"], "the list renders, a cafe opens, and the module helpers answer");
  await pg.locator("#pane-detail [data-on]").first().click();

  /* Settings' backup line, from a real backup.json through the service worker */
  const lines = [];
  for (const file of [null, backupFile]) {
    if (file) fs.writeFileSync(path.join(out, "backup.json"), file);
    lines.push(await pg.evaluate(async () => {
      renderDataCard();
      const el = document.getElementById("ab-backup");
      for (let i = 0; i < 40 && !/latest copy/.test(el.textContent); i++) await new Promise(r => setTimeout(r, 50));
      return el.textContent;
    }));
  }
  eq([/latest copy/.test(lines[0]), /The latest copy is from Oct 2[01],/.test(lines[1])], [false, true],
     "Settings gives no date when the site has no backup.json, and the backup's date when it has one (" + lines[1].slice(0, 70) + ")");
  eq([errs, await pg.evaluate(() => window.__csp), await pg.evaluate(() => readProblems().length)], [[], [], 0],
     "no page errors, nothing the security policy blocked, and nothing in the problems log");

  await ctx.close();
  await b.close();
  srv.close();
  [out, out2, data].forEach(d => fs.rmSync(d, { recursive: true, force: true }));
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
