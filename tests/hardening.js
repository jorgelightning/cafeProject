/* The 14 Oct audit's findings, pinned.

   Head: a description and link-preview tags (the app has a Share button, and a shared link used to
   preview blank), the non-deprecated PWA meta, no dead cache meta, one visible heading outline.
   Accessibility: emoji icons are decoration, not part of a button's name.
   Security: no shared passphrase in a file served to every visitor; ids that could break out of an
   inline handler never reach the page; the one place a name was inserted raw is escaped; the map
   clusterer is a local file, not a third-party host. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

(async () => {
  const html = read("index.html"), sw = read("sw.js"), cfg = read("js/config.js");

  // ---- head ----------------------------------------------------------------
  const has = re => re.test(html);
  eq(has(/<meta name="description" content="[^"]{40,}"/), true, "a meta description (40+ characters) exists");
  eq(["og:title", "og:description", "og:image", "og:url", "og:type"].every(k => has(new RegExp('property="' + k + '"'))), true,
     "Open Graph title, description, image, url and type are set");
  eq(/property="og:image" content="https:\/\/[^"]+\.png"/.test(html), true, "…with an absolute image URL, which link previews require");
  eq(has(/name="mobile-web-app-capable"/), true, "mobile-web-app-capable is present (the apple-only tag is deprecated)");
  eq(has(/http-equiv="(Cache-Control|Pragma|Expires)"/), false, "the ignored cache meta tags are gone — the service worker and ?v= are the cache strategy");

  // ---- the vendored clusterer ----------------------------------------------
  eq(/unpkg\.com/.test(html), false, "no script loads from unpkg any more");
  eq(/<script src="vendor\/markerclusterer-2\.5\.3\.min\.js"><\/script>/.test(html), true, "the clusterer is a local, version-named file");
  eq(fs.existsSync(path.join(ROOT, "vendor/markerclusterer-2.5.3.min.js")) && fs.existsSync(path.join(ROOT, "vendor/markerclusterer-LICENSE.txt")), true,
     "…with its licence beside it");
  eq(/\.\/vendor\/markerclusterer-2\.5\.3\.min\.js/.test(sw), true, "…and the offline shell caches it");
  eq(/^var markerClusterer=/.test(read("vendor/markerclusterer-2.5.3.min.js")), true, "…and it still defines the global the app calls");

  // ---- secrets ---------------------------------------------------------------
  eq(/ADMIN_PASS/.test(cfg) || /ADMIN_PASS/.test(read("js/storage.js")), false, "no shared passphrase in a file served to every visitor");

  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage({ viewport: { width: 390, height: 844 } });
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  // ---- headings and names ------------------------------------------------------
  let r = await pg.evaluate(() => {
    /* hidden with CSS clip counts as present for assistive tech; display:none does not */
    const vis = e => getComputedStyle(e).display !== "none" && getComputedStyle(e).visibility !== "hidden" && !e.closest("[hidden]");
    const h1s = [...document.querySelectorAll("h1")].filter(vis).length;
    const accName = el => { const c = el.cloneNode(true); c.querySelectorAll('[aria-hidden="true"]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, " ").trim(); };
    const tabs = [...document.querySelectorAll(".tabbar .tab")].map(accName);
    const side = [...document.querySelectorAll(".side-nav button")].map(accName);
    const emoji = /[☀-➿\u{1F300}-\u{1FAFF}️＋☰]/u;
    return { h1s, formIsH2: document.getElementById("form-title").tagName, tabs, side,
             leaks: [...tabs, ...side].filter(t => emoji.test(t)) };
  });
  eq(r.h1s, 1, "exactly one <h1> exposed to assistive tech on a phone — where both visible titles are hidden");
  eq(r.formIsH2, "H2", "the form's title is a second-level heading, not another <h1>");
  eq(r.leaks, [], "no emoji in any tab or nav button's accessible name (" + r.tabs.join(", ") + ")");

  await pg.setViewportSize({ width: 1440, height: 900 });
  r = await pg.evaluate(() => [...document.querySelectorAll("h1")].filter(e => getComputedStyle(e).display !== "none").length);
  eq(r, 1, "…and exactly one on a laptop");
  await pg.setViewportSize({ width: 390, height: 844 });

  // ---- no passphrase path -------------------------------------------------------
  r = await pg.evaluate(() => {
    let prompted = false; const _p = window.prompt; window.prompt = () => { prompted = true; return "anything"; };
    isAdmin = false; fbAuth = null; localStorage.removeItem(ADMIN_FLAG);
    toggleAdmin(); window.prompt = _p;
    return { prompted, isAdmin, flag: localStorage.getItem(ADMIN_FLAG), typeofPass: typeof ADMIN_PASS };
  });
  eq(r, { prompted: false, isAdmin: false, flag: null, typeofPass: "undefined" },
     "without Google sign-in there is no passphrase prompt and no way into editing mode");

  // ---- ids and names --------------------------------------------------------------
  r = await pg.evaluate(() => {
    const good = { id: "abc_12-X", name: "Fine" };
    const bad = [{ id: "x');alert(1);('", name: "Bad quote" }, { id: "has space", name: "Space" }, { id: "", name: "Empty" }, { id: "a".repeat(65), name: "Long" }];
    const out = adoptCafes([good].concat(bad));
    return { kept: out.map(c => c.name) };
  });
  eq(r.kept, ["Fine"], "a record whose id could break out of an inline handler never reaches the page");

  r = await pg.evaluate(() => {
    const nameHtml = nophotoHTML({ name: "<img src=x onerror=alert(1)> Cafe", emoji: "☕" });
    const probe = document.createElement("div"); probe.innerHTML = nameHtml;
    let threw = false; try { applyCardPhoto('a"] .x, [data-id="b', "https://example.com/p.jpg"); } catch (e) { threw = true; }
    return { img: probe.querySelectorAll("img").length, text: probe.textContent, threw };
  });
  eq([r.img, r.threw], [0, false], "a name starting with markup cannot inject an element through the card initials, and a hostile id cannot break the photo selector");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
