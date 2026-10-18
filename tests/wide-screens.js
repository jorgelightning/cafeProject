/* The calmer screens, at the widths they were not first drawn for.

   Checked at iPad Mini (744) and laptop (1280, 1600): the List rows were one 700px strip with the price a long
   way from the name, a chart's text scaled to 2.3 times its size, and a single-card grid left half empty. Rows are
   two columns on a tablet, charts stop growing at 520px, a lone card takes the row, and nothing on any screen
   sticks out at any of the three widths. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const screens = {
    list: () => { isAdmin = true; applyMode(); _formSnap = null; show("list"); renderList(); },
    viewer: () => { isAdmin = false; applyMode(); _formSnap = null; show("list"); renderList(); },
    cafe: () => { isAdmin = true; applyMode(); _formSnap = null; openDetail(cafes.find(c => rankOf(c) === 3).id, "list"); },
    you: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "you"; show("stats"); renderStats(); },
    habits: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "habits"; show("stats"); renderStats(); },
    money: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "money"; show("stats"); renderStats(); },
    board: () => { isAdmin = true; applyMode(); _formSnap = null; show("compare"); renderBoard(); },
    form: () => { isAdmin = true; applyMode(); _formSnap = null; openForm(); },
    settings: () => { isAdmin = true; applyMode(); _formSnap = null; show("settings"); }
  };
  for (const [name, w, h] of [["iPad Mini", 744, 1024], ["laptop", 1280, 800], ["large", 1600, 900]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await ready(pg);
    const sticking = [];
    for (const k of Object.keys(screens)) {
      await pg.evaluate("(" + screens[k].toString() + ")()");
      await pg.waitForTimeout(250);
      const bad = await pg.evaluate(() => [...document.querySelectorAll("#app *")].filter(e => {
        if (!e.offsetParent) return false;
        const r = e.getBoundingClientRect();
        return r.width > 0 && (r.right > innerWidth + 1 || r.left < -1) && !e.closest(".mapwrap, svg, .wstrip");
      }).slice(0, 3).map(e => e.tagName + "." + String(e.className).slice(0, 24)));
      if (bad.length) sticking.push(k + ": " + bad.join(", "));
    }
    eq(sticking, [], "at " + name + " nothing sticks out on any of the eight screens");
    eq(errs, [], "…and no page errors at " + name);

    if (w === 744) {
      await pg.evaluate(() => { _formSnap = null; listCompact = true; sortMode = "ranked"; isAdmin = false; applyMode(); show("list"); renderList(); });
      await pg.waitForTimeout(300);
      const r = await pg.evaluate(() => {
        const cards = [...document.querySelectorAll("#grid .card")].slice(0, 4), band = document.querySelector("#grid .band"), grid = document.getElementById("grid");
        const lefts = [...new Set(cards.map(c => Math.round(c.getBoundingClientRect().left)))];
        const bw = band.getBoundingClientRect().width, gw = grid.getBoundingClientRect().width;
        _statsTab = "money"; isAdmin = true; applyMode(); show("stats"); renderStats();
        const svg = document.querySelector('.stabpanel[data-tab="money"] .sc-svg');
        const spent = [...document.querySelectorAll('.stabpanel[data-tab="money"] .statgrid .statcard')][0];
        return { cols: lefts.length, bandWide: bw > gw * 0.9, bw, gw,
                 svg: Math.round(svg.getBoundingClientRect().width), spent: Math.round(spent.getBoundingClientRect().width), pane: Math.round(spent.parentElement.getBoundingClientRect().width) };
      });
      eq(r.cols, 2, "on an iPad the rows are two columns, not one 700px strip");
      eq(r.bandWide, true, "…and a landmark band still spans both (" + r.bw + " of " + r.gw + ")");
      eq(r.svg <= 520, true, "a chart stops at 520px instead of scaling its text to 2.3 times (" + r.svg + "px)");
      eq(r.spent >= r.pane - 2, true, "a lone card takes the whole row (" + r.spent + " of " + r.pane + "px)");
    }
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
