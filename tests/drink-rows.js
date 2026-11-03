/* Had once (v125).

   A cafe with more than three drinks gives two or three of them a full card, the ones had most, and lists the rest as
   slim rows in one box under "Had once": a small mark, the name, the day and the price. Nothing is folded. The rest
   used to wait behind a bold line of their names (to v123), then behind a Go-tos / All switch whose Go-tos broke at
   the hyphen on a phone (v124). A slim row still opens its history, and the owner keeps its ⋯. */
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
      const txt = sel => [...document.querySelectorAll(sel)].map(e => e.textContent.trim());
      const lab = document.querySelector("#d-drinks .drslimlab");
      return {
        full: txt("#d-drinks > .drinkcard .dtop"),
        label: lab ? lab.textContent : null,
        slim: txt("#d-drinks .drslim .drinkcard .dtop"),
        hidden: [...document.querySelectorAll("#d-drinks .drinkcard")].filter(e => !e.offsetParent).length,
        old: document.querySelectorAll("#d-drinks .foldbox, #d-drinks .morebtn, #d-drinks-seg").length,
      };
    };
    const cups = (n, d) => Array.from({ length: n }, (_, i) => ({ id: d + i, date: "2026-" + d, p: "7.75", size: "12 oz" }));
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
      { id: "reg", name: "Four Regulars", area: "SF", lat: 37.77, lng: -122.42, rating: 4, drinks: [
        { n: "Drip", orders: cups(5, "09-01") },
        { n: "Cortado", orders: cups(4, "09-02") },
        { n: "Mocha", orders: cups(3, "09-03") },
        { n: "Flat White", orders: cups(2, "09-04") },
        { n: "Chai", orders: cups(1, "09-05") },
      ] },
      { id: "few", name: "Three Drinks", area: "SF", lat: 37.77, lng: -122.42, rating: 4,
        drinks: ["A", "B", "C"].map(n => ({ n: "Drink " + n, orders: cups(1, "09-0" + (n.charCodeAt(0) - 64)) })) },
    ];
    privDetail = {};
    isAdmin = false;
    applyMode();
    openDetail("ct", "list");
    const ct = window.__look();
    const rows = [...document.querySelectorAll("#d-drinks .drslim .drinkcard")], row = rows[0], short = rows[4],
      full = document.querySelector("#d-drinks > .drinkcard");
    const name = short.querySelector(".dtop").getBoundingClientRect(), price = short.querySelector(".drinkprice").getBoundingClientRect();
    return {
      ct,
      subs: [full.querySelector(".dsub").textContent, row.querySelector(".dsub").textContent],
      opts: [!!full.querySelector(".drinksum .dopts"), !!row.querySelector(".drinksum .dopts")],
      price: row.querySelector(".drinkprice").textContent,
      size: { h: Math.round(short.querySelector(".drinksum").getBoundingClientRect().height), beside: price.left >= name.right && price.top < name.bottom,
              tallest: Math.max(...rows.map(x => Math.round(x.querySelector(".drinksum").getBoundingClientRect().height))) },
      doc: document.documentElement.scrollWidth, win: window.innerWidth,
    };
  });
  eq(s.ct, { full: ["Matcha Einspanner", "Freshly milled matcha latte"], label: "Had once",
             slim: ["Black matcha latte w/ oak milk", "Black matcha Einspanner", "Cassia black tea latte", "Freshly Milled Reserved Matcha Latte", "Hojicha Latte"],
             hidden: 0, old: 0 },
     "seven drinks: the two had twice as full cards, the five had once as slim rows under Had once, nothing folded, no switch");
  eq([s.subs, s.opts, s.price], [["2 cups · last Aug 12", "Aug 11"], [true, false], "$7.75"],
     "a slim row says the day and the price, without the options line a full card has");
  eq([s.size.h >= 44 && s.size.h <= 60, s.size.beside, s.size.tallest <= 80, s.doc <= s.win], [true, true, true, true],
     "…a 44px+ row at 375px with the price beside the name, a long name taking two lines at most, nothing wider than the phone (" +
       s.size.h + "px, tallest " + s.size.tallest + "px)");

  s = await pg.evaluate(() => {
    const row = document.querySelectorAll("#d-drinks .drslim .drinksum")[2];
    row.click();
    const open = { open: row.closest(".drinkcard").classList.contains("open"), aria: row.getAttribute("aria-expanded"),
                   cups: row.closest(".drinkcard").querySelectorAll(".dorder").length };
    isAdmin = true;
    applyMode();
    openDetail("ct", "list");
    const menus = document.querySelectorAll("#d-drinks .drslim .drinkmore").length;
    return { open, menus };
  });
  eq(s.open, { open: true, aria: "true", cups: 1 }, "a tap on a slim row opens its history, as a card does");
  eq(s.menus, 5, "…and the owner keeps the ⋯ on every slim row");

  s = await pg.evaluate(() => {
    openDetail("reg", "list");
    const reg = window.__look();
    const sub = [...document.querySelectorAll("#d-drinks .drslim .dsub")].map(e => e.textContent);
    openDetail("few", "list");
    return { reg, sub, few: window.__look() };
  });
  eq([s.reg.full, s.reg.label, s.reg.slim, s.sub], [["Drip", "Cortado", "Mocha"], "Also had", ["Flat White", "Chai"], ["2 cups · Sep 4", "Sep 5"]],
     "four regulars: three full cards, and the rest under Also had, since the fourth was had twice (it says so)");
  eq(s.few, { full: ["Drink C", "Drink B", "Drink A"], label: null, slim: [], hidden: 0, old: 0 }, "three drinks or fewer: all full cards, as before");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
