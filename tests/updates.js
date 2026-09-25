/* Updates apply themselves.

   The app already noticed a new build — every 45 seconds and whenever it came back to the
   front — but then it showed a bar and waited for a tap, and until that tap the phone kept
   running whatever it had. So "is it live?" kept turning into "nvm, refreshing showed it".

   Now it reloads itself at the one moment a reload is invisible: before anything has been
   touched since the app came to the front. If someone is already using it, the bar appears
   instead and the update lands the next time they switch back. A half-logged visit is never
   reloaded away, and an automatic reload can never loop.

   The new build is faked by answering the app's own version check with the real page, its
   ?v= rewritten. Service workers are blocked so the route sees every request. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

const REAL = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const NEWER = REAL.replace(/\?v=\d+/g, "?v=99999");

(async () => {
  const srv = await serve();
  const b = await launch();

  /* One fresh browser per scenario, so sessionStorage — where the loop guard lives — starts
     empty each time. `serve.newer` flips what the version check hears. */
  const open = async () => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    const pg = await ctx.newPage();
    const serve = { newer: false };
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    await pg.route(/[?&]_chk=/, r => r.fulfill({ status: 200, contentType: "text/html",
                                                  body: serve.newer ? NEWER : REAL }));
    let navs = 0;
    pg.on("framenavigated", f => { if (f === pg.mainFrame()) navs++; });
    return { ctx, pg, serve, errs, navs: () => navs };
  };
  const barShown = pg => pg.evaluate(() => document.getElementById("updatebar").classList.contains("show"));
  const resume = pg => pg.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // ---------- nothing new: nothing happens ----------
  {
    const s = await open();
    await s.pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await s.pg.waitForTimeout(900);
    const before = s.navs();
    await s.pg.evaluate(() => checkForUpdate());
    await s.pg.waitForTimeout(400);
    eq(s.navs(), before, "the same build is left alone");
    eq(await barShown(s.pg), false, "…and no bar appears");
    eq(s.errs, [], "no page errors");
    await s.ctx.close();
  }

  // ---------- a new build found at launch applies itself ----------
  {
    const s = await open();
    s.serve.newer = true;
    await s.pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    /* the boot check fires at once; give the reload time to land and settle */
    await s.pg.waitForTimeout(2500);
    const url = s.pg.url();
    eq(/[?&]v=\d{10,}/.test(url), true,
       "a newer build found before anything was touched reloads the page by itself (" + url + ")");
    /* This is also the case the old logic got wrong: the very first check became the baseline,
       so a page booted from the offline cache adopted the newer build as "current". */
    eq(s.navs() >= 2, true, "…which is a real navigation, not just a repaint");

    /* The route keeps answering 99999 while the files on disk stay on the old build, so the
       reloaded page sees the same mismatch — exactly a half-finished deploy. It must not loop. */
    eq(await barShown(s.pg), true, "a second mismatch within the minute falls back to the bar instead of looping");
    const settled = s.navs();
    await s.pg.evaluate(() => checkForUpdate());
    await s.pg.waitForTimeout(600);
    eq(s.navs(), settled, "…and keeps asking rather than reloading again");
    await s.ctx.close();
  }

  // ---------- in use: the bar, then the next return to the app ----------
  {
    const s = await open();
    await s.pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await s.pg.waitForTimeout(900);
    await s.pg.mouse.click(200, 400);           /* someone is using it */
    s.serve.newer = true;
    const before = s.navs();
    await s.pg.evaluate(() => checkForUpdate());
    await s.pg.waitForTimeout(500);
    eq(s.navs(), before, "a new build spotted mid-use does not yank the screen away");
    eq(await barShown(s.pg), true, "…it offers the bar instead");

    await resume(s.pg);
    await s.pg.waitForTimeout(1500);
    eq(s.navs() > before, true, "the next time the app comes back to the front, it updates itself");
    eq(/[?&]v=\d{10,}/.test(s.pg.url()), true, "…onto the new build");
    await s.ctx.close();
  }

  // ---------- a half-logged visit is never reloaded away ----------
  {
    const s = await open();
    await s.pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await s.pg.waitForTimeout(900);
    /* set up without real input events, so only the unsaved form stands in the way */
    await s.pg.evaluate(() => { isAdmin = true; applyMode(); editId = null; _formSnap = null; openForm();
                                document.getElementById("f-name").value = "Half-typed cafe"; });
    const dirty = await s.pg.evaluate(() => formDirty());
    eq(dirty, true, "the form has unsaved work");
    s.serve.newer = true;
    const before = s.navs();
    await s.pg.evaluate(() => checkForUpdate());
    await s.pg.waitForTimeout(500);
    eq(s.navs(), before, "a new build does not reload over an unsaved visit");
    eq(await barShown(s.pg), true, "…it waits behind the bar");
    await resume(s.pg);
    await s.pg.waitForTimeout(800);
    eq(s.navs(), before, "…and coming back to the app does not force it either");
    eq(await s.pg.evaluate(() => document.getElementById("f-name").value), "Half-typed cafe",
       "…so what was typed is still there");
    await s.ctx.close();
  }

  // ---------- a tap on the bar always goes through ----------
  {
    const s = await open();
    await s.pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await s.pg.waitForTimeout(900);
    await s.pg.mouse.click(200, 400);
    await s.pg.evaluate(() => sessionStorage.setItem("cafemap.autoReload", String(Date.now())));
    s.serve.newer = true;
    await s.pg.evaluate(() => checkForUpdate());
    await s.pg.waitForTimeout(500);
    const before = s.navs();
    await s.pg.click("#updatebar");
    await s.pg.waitForTimeout(1200);
    eq(s.navs() > before, true, "the loop guard only limits automatic reloads — tapping the bar still reloads");
    await s.ctx.close();
  }

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
