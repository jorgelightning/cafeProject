/* Stats in three tabs.

   Stats was one scroll of fourteen cards, 4,800px on a phone, with an emoji on every heading. It is You (who you
   are as a drinker), Habits (when you go) and Money (what it costs) now. Every card is still rendered, so nothing
   that reads the page loses anything; only the active tab shows. What you spent is a Money fact and the owner's alone. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const probe = admin => pg.evaluate(a => {
    isAdmin = a; applyMode(); _statsTab = "you";
    const day = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    cafes = [];
    for (let i = 1; i <= 12; i++)
      cafes.push({ id: "c" + i, name: "Cafe " + i, area: "Area", rating: i % 4 ? 5 : 3, elo: 1700 - i * 9, matches: 8, tags: ["cozy"],
        drinks: [{ n: i % 2 ? "Hojicha latte" : "Flat white", orders: [{ date: day(i), p: 5 + (i % 6), sweet: "0%", ice: "Warm", milk: "Oat", size: "12 oz", reorder: "yes" },
                                                                          { date: day(i + 20), p: 6, reorder: i % 5 ? "yes" : "no" }] }] });
    cafes.push({ id: "w", name: "Someday", wish: true, drinks: [] });
    show("stats"); renderStats();
    const body = document.getElementById("stats-body");
    const panel = t => body.querySelector('.stabpanel[data-tab="' + t + '"]');
    const heads = t => [...panel(t).querySelectorAll(".statsec")].map(e => e.textContent);
    const vis = () => [...body.querySelectorAll(".stabpanel")].filter(p => !p.hidden).map(p => p.dataset.tab);
    const out = { you: heads("you"), habits: heads("habits"), money: heads("money"), visible: vis(), pressed: [...body.querySelectorAll(".stabs button")].filter(x => x.getAttribute("aria-pressed") === "true").map(x => x.textContent),
                  spentIn: ["you", "habits", "money"].filter(t => /Spent/.test(panel(t).textContent)),
                  tall: [...body.querySelectorAll(".stabs button")].every(x => x.getBoundingClientRect().height >= 44), overflow: body.scrollWidth > body.clientWidth };
    setStatsTab("money"); out.afterMoney = vis();
    setStatsTab("habits"); out.afterHabits = vis(); out.habitsHeight = Math.round(panel("habits").getBoundingClientRect().height);
    setStatsTab("nonsense"); out.afterBad = vis();
    out.allHeads = [...body.querySelectorAll(".statsec")].map(e => e.textContent);
    return out;
  }, admin);

  const o = await probe(true);
  eq(o.visible, ["you"], "Stats opens on You, one panel showing");
  eq(o.pressed, ["You"], "…and the tab says so");
  eq(o.tall, true, "the three tabs clear the 44px floor");
  eq(o.you.some(h => /Drink DNA/.test(h)) && o.you.some(h => /Taste/.test(h)), true, "You holds Drink DNA and Taste");
  eq(o.habits.some(h => /Monthly activity/.test(h)) && o.habits.some(h => /Cadence/.test(h)), true, "Habits holds Monthly activity and Cadence");
  eq(o.money.some(h => /Price spread/.test(h)) && o.money.some(h => /Worth it/.test(h)), true, "Money holds Price spread and Worth it");
  eq(o.spentIn, ["money"], "what the owner spent is in Money and nowhere else");
  eq(o.afterMoney, ["money"], "switching to Money shows only Money");
  eq(o.afterHabits, ["habits"], "…and to Habits only Habits");
  eq(o.afterBad, ["habits"], "a tab that does not exist changes nothing");
  eq(o.allHeads.some(h => /[\u{1F300}-\u{1FAFF}☀-➿]/u.test(h)), false, "no heading carries an emoji");
  eq(o.overflow, false, "nothing sticks out at 375px");

  const v = await probe(false);
  eq(v.spentIn, [], "a viewer never sees what was spent, in any tab");
  eq(v.money.some(h => /Price spread/.test(h)), true, "…but still gets what drinks cost and Worth it");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
