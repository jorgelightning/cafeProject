/* Settings, and the map overlay that used to sit on top of the app.

   Theme lived in two places and behaved differently in each: a labelled button in the desktop
   side nav — the only one of the four that did not navigate — and an unlabelled 🌗 in the List
   search bar that cycled auto → light → dark blind, with a toast to say where it landed. It
   was reachable from the List tab and nowhere else.

   The preferences now share one screen, reached by a single ⚙︎ that also replaced the lock
   pill in four places. Everything here is about what a person can still reach and still see.

   The second half is a stacking bug found while measuring this. Every other piece of map
   chrome is offset past the browse column on a laptop; the full-pane map message was not, and
   at z-index 5 against the sidebar's 2 a Google Maps failure painted its error over the whole
   app — header, nav, search box and all 111 cafes. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  const srv = await serve();
  const b = await launch();

  const open = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(900);
    return { ctx, pg, errs };
  };

  // ================= the settings screen =================
  const phone = await open(390, 844);
  const pg = phone.pg;

  await pg.evaluate(() => { isAdmin = false; applyMode && applyMode(); setTheme(""); show("list"); renderList(); });

  // ---- one door, and it is reachable from more than one screen ----
  const doors = await pg.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const on = sel => [...document.querySelectorAll(sel + ' button')]
      .filter(vis).map(x => (x.getAttribute("aria-label") || x.textContent).trim());
    show("list"); const list = on(".search");
    show("map");  const map  = on(".mapsearch");
    return { list, map, cyclerGone: typeof window.cycleTheme === "undefined",
             lockButtons: document.querySelectorAll(".lockbtn").length };
  });
  eq(doors.list, ["Settings"], "the List search bar carries one button now, not a lock and a theme cycler");
  eq(doors.map, ["Settings"], "…and the map overlay carries the same one");
  eq(doors.cyclerGone, true, "the blind cycle is gone, not left behind unused");
  eq(doors.lockButtons, 0, "…and so is every lock pill it replaced");

  const js = fs.readdirSync(path.join(ROOT, "js"))
    .map(f => fs.readFileSync(path.join(ROOT, "js", f), "utf8")).join("\n");
  eq(/cycleTheme/.test(js), false, "no script still calls it");

  // ---- the appearance control shows its state instead of hiding it in a cycle ----
  const seg = async () => pg.evaluate(() => {
    const g = document.getElementById("seg-theme");
    return { on: [...g.querySelectorAll("button.on")].map(b => b.dataset.v),
             pressed: [...g.querySelectorAll("button")].map(b => b.getAttribute("aria-pressed")),
             labels: [...g.querySelectorAll("button")].map(b => b.textContent.trim()),
             attr: document.documentElement.dataset.theme || "",
             stored: localStorage.getItem("cafemap.theme") || "" };
  });

  await pg.evaluate(() => show("settings"));
  eq((await seg()).labels, ["Auto", "Light", "Dark"], "three states, each named");
  eq((await seg()).on, [""], "auto is on to start with");
  eq((await seg()).pressed, ["true", "false", "false"], "…and a screen reader is told which");

  for (const [v, attr] of [["dark", "dark"], ["light", "light"], ["", ""]]) {
    await pg.evaluate(t => setTheme(t), v);
    const s = await seg();
    eq(s.on, [v], "choosing " + (v || "auto") + " lights that segment");
    eq(s.attr, attr, "…and sets the root attribute to " + JSON.stringify(attr));
    eq(s.stored, v, "…and remembers it" + (v ? "" : " by clearing the key, which is what auto means"));
  }

  /* The manual override needs its own meta tag: the two in the markup are media-scoped to the
     SYSTEM preference, so without it the browser chrome stays on the other theme. */
  const meta = await pg.evaluate(async () => {
    setTheme("dark"); const dark = (document.getElementById("tc-override") || {}).content;
    setTheme("");     const auto = !!document.getElementById("tc-override");
    return { dark, auto };
  });
  eq(meta.dark, "#15110e", "a manual dark choice also moves the browser chrome");
  eq(meta.auto, false, "…and going back to auto hands it back to the media query");

  // ---- the other two preferences are here, and they are live ----
  const layout = await pg.evaluate(() => {
    const read = () => ({
      on: [...document.querySelectorAll("#seg-layout button.on")].map(b => b.dataset.v),
      compact: document.getElementById("grid").classList.contains("compact-list"),
      stored: localStorage.getItem("cafemap.listLayout") });
    setListLayout(true);  const a = read();
    setListLayout(false); const c = read();
    return { a, c };
  });
  eq(layout.a, { on: ["compact"], compact: true, stored: "compact" },
     "the layout preference moved here, and still redraws the list");
  eq(layout.c, { on: ["grid"], compact: false, stored: "grid" }, "…in both directions");

  const editing = await pg.evaluate(() => {
    const read = () => ({ mode: document.getElementById("set-mode").textContent.trim(),
                          btn: document.getElementById("set-admin").textContent.trim() });
    isAdmin = false; applyMode(); const viewer = read();
    isAdmin = true;  applyMode(); const admin = read();
    isAdmin = false; applyMode();
    return { viewer, admin };
  });
  eq(editing.viewer.btn, "Sign in to edit", "editing mode moved here too");
  eq(/Viewer/.test(editing.viewer.mode), true, "…and says which mode you are in");
  eq(editing.admin.btn, "Sign out", "…and follows a sign-in without reopening the screen");
  eq(/Editing/.test(editing.admin.mode), true, "…on both halves of the row");

  /* A hard-coded version string drifts the moment the deploy version moves, and "am I on the
     new build?" is exactly what this line exists to answer. It reads the loaded script tag. */
  const ver = await pg.evaluate(() => ({
    shown: document.getElementById("set-ver").textContent,
    tag: (/\?v=(\d+)/.exec(document.querySelector('script[src*="js/boot.js"]').getAttribute("src")) || [])[1]
  }));
  eq(ver.shown, "JL Cafe Project · v" + ver.tag, "the version line is read from the build, not typed in");

  // ---- getting there and back ----
  const nav = await pg.evaluate(() => {
    show("list"); show("settings"); const at = app.dataset.view;
    goBack(); const back = app.dataset.view;
    show("map"); show("settings"); goBack();
    return { at, back, fromMap: app.dataset.view };
  });
  eq(nav.at, "settings", "the door opens the screen");
  eq(nav.back, "list", "…and back returns to the List you came from");
  eq(nav.fromMap, "map", "…or to the Map, when that is where you were");

  // ---- every control here is a real one, and big enough to hit ----
  const reach = await pg.evaluate(() => {
    show("settings");
    const btns = [...document.querySelectorAll("#pane-settings button")];
    return { count: btns.length,
             small: btns.filter(b => b.getBoundingClientRect().height < 40)
                        .map(b => (b.getAttribute("aria-label") || b.textContent).trim()),
             labelled: btns.every(b => (b.textContent || "").trim() || b.getAttribute("aria-label")),
             groups: [...document.querySelectorAll("#pane-settings .seg")]
                       .every(g => g.getAttribute("aria-labelledby") &&
                                   document.getElementById(g.getAttribute("aria-labelledby"))) };
  });
  eq(reach.count, 7, "back, three appearance states, two layouts and the sign-in button");
  eq(reach.small, [], "nothing is under the 40px floor");
  eq(reach.labelled, true, "every control says what it does");
  eq(reach.groups, true, "…and each group of segments points at its own heading");

  eq(phone.errs, [], "no page errors on the phone");
  await phone.ctx.close();

  // ================= the map message stops covering the app =================
  const lap = await open(1440, 900);

  const cover = await lap.pg.evaluate(() => {
    isAdmin = false; applyMode && applyMode(); show("list"); renderList();
    const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width) }; };
    const hit = (x, y) => { const e = document.elementFromPoint(x, y); return e ? e.closest(".sidebar, .mapbox").className : "none"; };
    const side = document.querySelector(".sidebar").getBoundingClientRect();
    return { shown: document.getElementById("map-msg").classList.contains("show"),
             msg: box(document.getElementById("map-msg")),
             sidebar: Math.round(side.width),
             header: hit(200, 40), nav: hit(60, 88), cards: hit(200, 400),
             search: hit(200, 130) };
  });

  /* Maps cannot load in this harness — every cross-origin request is aborted — so the failure
     the bug needed is the default state here rather than something to simulate. */
  eq(cover.shown, true, "the map failed to load, so its full-pane message is showing");
  eq(cover.msg.x, cover.sidebar, "the message starts where the map does, not at the window edge");
  eq(cover.msg.w, 1440 - cover.sidebar, "…and covers only the map column");
  ["header", "nav", "search", "cards"].forEach(k =>
    eq(/sidebar/.test(cover[k]), true, "the " + k + " is still the thing you touch, not the error"));

  eq(lap.errs, [], "no page errors on the laptop");

  /* The same inset bug, in the one other overlay that had it. */
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const desktop = (css.match(/@media \(min-width:900px\)\{[^}]*\.map-msg[^@]*?\}\s*\}/) || [""])[0];
  eq(/\.rulewarn\{\s*left:calc\(var\(--sidebar\)/.test(desktop), true,
     "the private-address warning is offset past the sidebar too");

  await lap.ctx.close();

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
