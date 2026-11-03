/* The round × in the List search (v126).

   Starting a new search meant backspacing the old one, or Clear under the box, which also drops every filter. Now
   a round × sits in the box while anything is typed: it empties the box, keeps the filters, and keeps the focus
   (and so a phone's keyboard) in the box. Escape does the same from a keyboard. The box never changes size as the
   × comes and goes. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const errs = [];

  for (const vp of [{ width: 375, height: 812 }, { width: 1280, height: 800 }]) {
    const ctx = await b.newContext({ viewport: vp });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await ready(pg);
    const at = vp.width + "px";

    const look = () => pg.evaluate(() => {
      const x = $("q-clear"), r = x.getBoundingClientRect();
      return { value: $("q").value, shown: !x.hidden && r.width > 0, w: Math.round(r.width), h: Math.round(r.height),
               box: Math.round(document.querySelector(".search").getBoundingClientRect().height),
               cards: document.querySelectorAll("#grid .card").length, focus: document.activeElement && document.activeElement.id,
               fav: favOnly, name: x.getAttribute("aria-label") };
    });

    await pg.evaluate(() => { isAdmin = true; applyMode(); show("list"); favOnly = true; renderList(); });
    const before = await look();
    await pg.fill("#q", "matcha");
    const typed = await look();
    await pg.click("#q-clear");
    const cleared = await look();

    eq([before.shown, typed.shown], [false, true], at + ": the × shows only with something typed");
    eq([typed.w, typed.h, typed.name], [44, 44, "Clear search"], at + ": …a 44px target named Clear search");
    eq([before.box, typed.box, cleared.box], [before.box, before.box, before.box], at + ": the box keeps its height as the × comes and goes (" + before.box + "px)");
    eq({ value: cleared.value, shown: cleared.shown, focus: cleared.focus, fav: cleared.fav, cards: cleared.cards },
       { value: "", shown: false, focus: "q", fav: true, cards: before.cards },
       at + ": a tap empties the box and lists everything again, the Favorites filter stays, and the cursor stays in the box");

    await pg.fill("#q", "latte");
    await pg.press("#q", "Escape");
    const esc = await look();
    eq([esc.value, esc.shown, esc.focus], ["", false, "q"], at + ": Escape in the box empties it too");

    await ctx.close();
  }

  eq(errs, [], "no page errors");
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
