/* Go-tos or All (v124).

   A cafe with more than three drinks shows two or three of them and folds the rest. The fold used to open from one
   bold, underlined line of names under the cards ("5 more: Black matcha latte w/ oak milk, …"), the loudest thing in
   the section and still only half a list. Now the heading carries a switch, Go-tos or All 7, and nothing sits
   between the cards and the note. The first half says Top 2 when the drinks in view were not had twice. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  let s = await pg.evaluate(() => {
    window.__look = () => {
      const seg = $("d-drinks-seg"), box = $("d-drinks-fold");
      return {
        seg: seg.hidden ? null : [...seg.querySelectorAll("button")].map(x => x.textContent + (x.getAttribute("aria-pressed") === "true" ? "*" : "")),
        hint: $("d-drinks-hint").hidden ? null : $("d-drinks-hint").textContent,
        shown: [...document.querySelectorAll("#d-drinks .drinkcard")].filter(e => e.offsetParent).length,
        open: !!box && box.hasAttribute("data-open"),
        line: document.querySelectorAll("#d-drinks .morebtn").length,
      };
    };
    const cups = (n, d) => Array.from({ length: n }, (_, i) => ({ id: d + i, date: "2026-" + d, p: "7.75" }));
    cafes = [
      { id: "ct", name: "Constance Tea & Matcha", area: "Outer Richmond", lat: 37.78, lng: -122.48, rating: 5, drinks: [
        { n: "Matcha Einspanner", orders: cups(2, "08-12") },
        { n: "Freshly milled matcha latte", orders: cups(2, "06-19") },
        { n: "Black matcha latte w/ oak milk", orders: cups(1, "08-11") },
        { n: "Black matcha Einspanner", orders: cups(1, "07-16") },
        { n: "Cassia black tea latte", orders: cups(1, "07-02") },
        { n: "Freshly Milled Reserved Matcha Latte", orders: cups(1, "06-29") },
        { n: "Hojicha Latte", orders: cups(1, "06-25") },
      ] },
      { id: "once", name: "Many Once", area: "SF", lat: 37.77, lng: -122.42, rating: 4,
        drinks: ["A", "B", "C", "D", "E"].map(n => ({ n: "Drink " + n, orders: cups(1, "09-0" + (n.charCodeAt(0) - 64)) })) },
      { id: "few", name: "Three Drinks", area: "SF", lat: 37.77, lng: -122.42, rating: 4,
        drinks: ["A", "B", "C"].map(n => ({ n: "Drink " + n, orders: cups(1, "09-0" + (n.charCodeAt(0) - 64)) })) },
    ];
    privDetail = {};
    isAdmin = false;
    applyMode();
    openDetail("ct", "list");
    const first = window.__look();
    const lab = document.querySelector(".drinklab"), seg = $("d-drinks-seg");
    const fit = { right: Math.round(seg.getBoundingClientRect().right), win: window.innerWidth, oneLine: lab.getBoundingClientRect().height < 60,
                  tall: [...seg.querySelectorAll("button")].every(x => x.getBoundingClientRect().height >= 44), head: $("d-drinks-lab").textContent };
    return { first, fit };
  });
  eq(s.first, { seg: ["Go-tos*", "All 7"], hint: null, shown: 2, open: false, line: 0 },
     "a cafe with seven drinks shows its two go-tos, the heading says Go-tos or All 7, and the line of names is gone");
  eq([s.fit.head, s.fit.oneLine, s.fit.tall, s.fit.right <= s.fit.win - 16], ["Drinks Jorge had", true, true, true],
     "…on one line beside a visitor's heading, inside a 375px phone, at the 44px floor (right edge " + s.fit.right + ")");

  s = await pg.evaluate(() => {
    $("d-drinks-seg").querySelector('[data-all="1"]').click();
    const all = window.__look();
    openDetail("ct", "list");
    const again = window.__look();
    $("d-drinks-seg").querySelector('[data-all="0"]').click();
    const back = window.__look();
    return { all, again, back };
  });
  eq(s.all, { seg: ["Go-tos", "All 7*"], hint: null, shown: 7, open: true, line: 0 }, "All opens every drink");
  eq(s.again.seg, ["Go-tos", "All 7*"], "…and stays open when the page is drawn again, as it is after logging a cup");
  eq([s.back.seg, s.back.shown], [["Go-tos*", "All 7"], 2], "Go-tos folds them again");

  s = await pg.evaluate(() => {
    $("d-drinks-seg").querySelector('[data-all="1"]').click();
    openDetail("once", "list");
    const once = window.__look();
    openDetail("ct", "list");
    const ct = window.__look();
    openDetail("few", "list");
    const few = window.__look();
    return { once, ct, few };
  });
  eq(s.once, { seg: ["Top 2*", "All 5"], hint: null, shown: 2, open: false, line: 0 },
     "five drinks had once each: the first half says Top 2, not Go-tos, and another cafe starts folded");
  eq(s.ct.seg, ["Go-tos*", "All 7"], "…and coming back starts on Go-tos again");
  eq(s.few, { seg: null, hint: "Tap for order history", shown: 3, open: false, line: 0 }, "three drinks or fewer: no switch, the hint as before");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
