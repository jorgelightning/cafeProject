/* A first visit says whose list it is (user test, 26 Oct).

   A friend opening the link landed on a bare map. The first time a visitor opens the app, a sheet says it is Jorge's
   list, how many cafes, and offers a start: a region, the top 10, or just looking around. Once per device, never for
   the owner, never over a shared cafe link. The harness marks every other test's page as already welcomed. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const fresh = async url => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
    /* runs after the harness's own init script, so this page is a first visit */
    await ctx.addInitScript(() => {
      try { localStorage.removeItem("cafemap.welcomed"); } catch (e) {}
    });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
    const errs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + url, { waitUntil: "load" });
    await ready(pg);
    return { ctx, pg, errs };
  };

  /* ---- a first visit ---- */
  const a = await fresh("/index.html");
  await a.pg.waitForFunction(() => !$("dnsheet").hidden, null, { timeout: 5000 });
  const w = await a.pg.evaluate(() => ({
    title: $("dns-title").textContent,
    text: $("dns-panel").innerText,
    regions: document.querySelectorAll("#dns-panel .dntag").length,
    focus: document.activeElement && document.activeElement.closest("#dnsheet") ? "in sheet" : "outside",
    seen: localStorage.getItem("cafemap.welcomed"),
  }));
  eq(w.title, "Jorge’s cafe list", "a first visit opens with whose list it is");
  eq(/\d+ cafes in \d+ countr(y|ies), each ranked head-to-head/.test(w.text), true, "…how many, where, and how they are ranked");
  eq(w.regions > 0, true, "…offers regions to start from");
  eq([w.focus, w.seen], ["in sheet", "1"], "…takes the keyboard, and is remembered on this device");
  await a.pg.getByRole("button", { name: "Show the top 10" }).click();
  const top = await a.pg.evaluate(() => ({ view: app.dataset.view, open: !$("dnsheet").hidden }));
  eq(top, { view: "compare", open: false }, "Show the top 10 goes to Go and puts the sheet away");
  const again = await a.pg.evaluate(() => { show("map"); maybeWelcome(); return !$("dnsheet").hidden; });
  eq(again, false, "it does not come back on the same device");
  /* a region from the welcome becomes the region Go shows */
  const reg = await a.pg.evaluate(() => {
    openWelcome();
    const btn = document.querySelector("#dns-panel .dntag");
    const v = btn.dataset.v;
    btn.click();
    return { picked: pickedRegion === v, open: !$("dnsheet").hidden, view: app.dataset.view };
  });
  eq(reg, { picked: true, open: false, view: "map" }, "picking a region shows it on the map, and Go remembers it");
  const owner = await a.pg.evaluate(() => {
    localStorage.removeItem("cafemap.welcomed");
    isAdmin = true;
    show("map");
    maybeWelcome();
    return !$("dnsheet").hidden;
  });
  eq(owner, false, "the owner never gets it");
  eq(a.errs, [], "no page errors");
  await a.ctx.close();

  /* ---- a shared cafe link is about that cafe ---- */
  const id = require("../cafes.json").find(c => !c.custom && !c.wish && c.lat != null).id;
  const s = await fresh("/index.html?cafe=" + id);
  await s.pg.waitForTimeout(1200);
  const sh = await s.pg.evaluate(() => ({ sheet: !$("dnsheet").hidden, view: app.dataset.view }));
  eq(sh, { sheet: false, view: "detail" }, "a shared cafe link opens the cafe, with no welcome over it");
  eq(s.errs, [], "no page errors");
  await s.ctx.close();

  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
