/* The design audit batch (27 Oct): more room for cafes, one Log button, a map that opens where the cafes are, one
   meaning per icon, Go in one row, drinks by most ordered, sheets that open with nothing picked, button weights, and
   a five-size, three-weight type scale. The quick cup, Go's numbers, the drink fold and the focus ring are also
   checked where they live (quick-cup, go-filters, share-card, keyboard); this file holds the rest. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  /* ---- D1: the row under search steps aside while the list scrolls down ---- */
  await pg.evaluate(() => { show("list"); renderList(); });
  const sc = await pg.$("#pane-list .scroll");
  const bar = () => pg.evaluate(() => { const r = document.querySelector(".listbar").getBoundingClientRect(); return { h: Math.round(r.height), hidden: $("pane-list").classList.contains("scrolled") }; });
  const rest = await bar();
  await sc.hover();
  for (let i = 0; i < 5; i++) { await pg.mouse.wheel(0, 200); await pg.waitForTimeout(60); }
  await pg.waitForTimeout(300);
  const down = await bar();
  await pg.mouse.wheel(0, -120);
  await pg.waitForTimeout(300);
  const up = await bar();
  eq([rest.hidden, down.hidden, down.h, up.hidden], [false, true, 0, false], "the row under search hides while the list scrolls down and comes back on the way up (" + rest.h + "px at rest)");
  const one = await pg.evaluate(() => {
    const kids = [...document.querySelector(".listbar").children].filter(e => e.getBoundingClientRect().height > 0);
    const mids = kids.map(e => { const r = e.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
    return { line: Math.max(...mids) - Math.min(...mids) <= 6, search: Math.round(document.querySelector(".searchrow").getBoundingClientRect().top) };
  });
  eq(one.line, true, "the tabs, Filters, Map and the guides are one row that scrolls sideways");
  const open = await pg.evaluate(async () => {
    const s = document.querySelector("#pane-list .scroll"); s.scrollTop = 600; listScrolled(); s.scrollTop = 900; listScrolled();
    const hiddenBefore = $("pane-list").classList.contains("scrolled");
    toggleListFilters();
    const shown = !$("pane-list").classList.contains("scrolled");
    toggleListFilters();
    return { hiddenBefore, shown };
  });
  eq(open, { hiddenBefore: true, shown: true }, "…and opening Filters brings it back, since the panel hangs off it");
  await pg.evaluate(() => { document.querySelector("#pane-list .scroll").scrollTop = 0; listScrolled(); });

  /* ---- D4: one meaning per icon ---- */
  const icons = await pg.evaluate(() => ({
    settings: [...document.querySelectorAll(".setdoor use, .side-nav use")].filter(u => /Settings/.test(u.closest("button").textContent + (u.closest("button").getAttribute("aria-label") || ""))).map(u => u.getAttribute("href")),
    filters: document.querySelector("#filterbtn use").getAttribute("href"),
    sliders: [...document.querySelectorAll('use[href="#i-sliders"]')].map(u => u.closest("button").id),
  }));
  eq([new Set(icons.settings).size === 1 && icons.settings[0], icons.filters, icons.sliders], ["#i-gear", "#i-sliders", ["filterbtn"]], "Settings has the gear everywhere, and the sliders belong to Filters alone");

  /* ---- D2: one Log button ---- */
  const log = await pg.evaluate(() => {
    isAdmin = true; applyMode();
    cafes = [{ id: "k", name: "Kissaten HiFi", rating: 5, drinks: [{ n: "Flat White", orders: [{ id: "o1", date: "2026-10-01", p: "5" }] }] }];
    show("list");
    const onList = $("t-log").textContent.trim();
    openDetail("k", "list");
    const onCafe = $("t-log").textContent.trim(), bars = document.querySelectorAll(".dstickybar").length;
    logTab();
    const sheet = !$("dnsheet").hidden && $("dns-title").textContent;
    closeSheet();
    return { onList, onCafe, bars, sheet };
  });
  eq(log, { onList: "Log", onCafe: "Log here", bars: 0, sheet: "A cup at Kissaten HiFi" }, "a cafe page has one Log button, the middle tab, and it logs a cup here");

  /* ---- D6: drinks by most ordered, the rest named, short dates, whose words ---- */
  const drinks = await pg.evaluate(() => {
    const y = localToday().slice(0, 4);
    const ord = (n, d) => Array.from({ length: n }, (_, i) => ({ id: d + i, date: y + "-" + d, p: "5" }));
    cafes = [{ id: "k", name: "Kissaten HiFi", rating: 5, drinks: [
      { n: "Sampaguita chai latte", orders: ord(1, "10-22") },
      { n: "Flat White", orders: ord(12, "10-17") },
      { n: "Hojicha latte", orders: ord(11, "09-23") },
      { n: "Ichigo Matcha", orders: ord(1, "09-17") },
    ] }];
    isAdmin = false; applyMode(); openDetail("k", "list");
    const shown = [...document.querySelectorAll("#d-drinks > .drinkcard .dtop")].map(e => e.textContent.trim());
    return { shown, more: document.querySelector("#d-drinks .morebtn").dataset.lab, sub: document.querySelector("#d-drinks .dsub").textContent,
             heads: [$("d-drinks-lab").textContent, $("d-review-lab").textContent] };
  });
  eq(drinks.shown, ["Flat White", "Hojicha latte"], "a cafe's drinks lead with the most ordered, not the newest");
  eq(drinks.more, "2 more: Sampaguita chai latte, Ichigo Matcha", "…and the rest are one line that names them");
  eq(drinks.sub, "12 cups · last Oct 17", "…with this year's dates short");
  eq(drinks.heads, ["Drinks Jorge had", "Jorge’s thoughts"], "a visitor reads whose drinks and whose words they are");

  /* ---- D5: Go, one row of controls, numbers on metal, a mark per row ---- */
  const go = await pg.evaluate(() => {
    const CA = [37.77, -122.42], HI = [21.3, -157.83];
    cafes = [];
    for (let i = 0; i < 8; i++) cafes.push({ id: "g" + i, name: "Place " + i, area: "Area " + i, lat: (i % 2 ? CA : HI)[0], lng: (i % 2 ? CA : HI)[1], rating: 5, elo: 1700 - i * 10, matches: 8,
      drinks: [{ n: i % 2 ? "Flat White" : "Matcha latte", orders: [{ id: "x" + i, date: "2026-09-01", p: "5" }] }] });
    isAdmin = true; applyMode(); show("compare"); renderBoard();
    const row = document.querySelector("#cmp-body .gobar");
    const kids = [...row.children].map(e => e.className || e.tagName);
    const ranks = [...document.querySelectorAll("#cmp-body .lbrow .lbrank")].slice(0, 4).map(e => [e.textContent, e.className.replace("lbrank", "").trim()]);
    const marks = document.querySelectorAll("#cmp-body .lbrow .lbmark").length, rows = document.querySelectorAll("#cmp-body .lbrow").length;
    const reg = document.querySelector("#cmp-body .goreg").getBoundingClientRect().height;
    return { kids, ranks, marks, rows, reg };
  });
  eq(go.kids.slice(0, 2), ["gochip p", "goreg"], "Go's controls are one row: Rank a pair first, then the region (" + go.kids.join(", ") + ")");
  eq(go.ranks, [["1", "medal m1"], ["2", "medal m2"], ["3", "medal m3"], ["#4", ""]], "1 to 3 are numbers on gold, silver and bronze, then #4");
  eq([go.marks === go.rows, go.reg >= 44], [true, true], "every row carries the cafe's drawn mark, and the region menu is a 44px target");

  /* ---- D3: the map opens on the busiest part of a region ---- */
  const dense = await pg.evaluate(() => {
    const SF = [37.77, -122.44], LA = [34.05, -118.24];
    cafes = [];
    for (let i = 0; i < 10; i++) cafes.push({ id: "s" + i, name: "SF " + i, area: "San Francisco, CA", lat: SF[0] + i * 0.004, lng: SF[1] + i * 0.004, rating: 5, drinks: [] });
    for (let i = 0; i < 4; i++) cafes.push({ id: "l" + i, name: "LA " + i, area: "Los Angeles, CA", lat: LA[0] + i * 0.004, lng: LA[1], rating: 5, drinks: [] });
    const reg = regionOf(cafes[0]).val;
    const d = denseView(reg);
    const even = denseView(regionOf({ lat: 21.3, lng: -157.8, area: "Honolulu, HI" }).val);
    return { n: d && d.list.length, label: d && d.label, ids: d && d.list.every(c => /^s/.test(c.id)), small: even };
  });
  eq([dense.n, dense.ids, dense.label], [10, true, "San Francisco · 10"], "a region opens on its busiest part, named for its town with a count");
  eq(dense.small, null, "…and a region with too few cafes for that opens whole");

  /* ---- D9: weights match importance ---- */
  const btn = await pg.evaluate(() => {
    isAdmin = true; applyMode(); show("settings");
    const so = $("set-admin"), cs = getComputedStyle(so), acc = getComputedStyle(document.querySelector(".gbtn.pri, #pane-detail .btn:not(.ghost), .tab.primary .plus") || document.body).backgroundColor;
    const off = document.createElement("button"); off.className = "btn"; off.disabled = true; document.body.appendChild(off);
    const oc = getComputedStyle(off), s2 = getComputedStyle(document.body).getPropertyValue("--surface2").trim();
    const r = { ghost: so.classList.contains("ghost"), offBg: oc.backgroundColor, offOpacity: oc.opacity, surface2: s2 };
    off.remove();
    return r;
  });
  eq([btn.ghost, btn.offOpacity], [true, "1"], "Sign out is an outlined button, and an off button is not a faded accent");

  /* ---- D10: five sizes and three weights for text ---- */
  const type = await pg.evaluate(() => {
    const sizes = new Set(), weights = new Set();
    const screens = [() => show("list"), () => { show("compare"); renderBoard(); }, () => show("settings"), () => { show("stats"); renderStats(); }];
    screens.forEach(go => {
      go();
      const pane = document.querySelector("#pane-" + app.dataset.view);
      [...pane.querySelectorAll("*")].forEach(e => {
        if (!e.offsetParent || e.closest("svg, .em, .mke, .big, .plus, .ti")) return;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1)) return;
        const s = getComputedStyle(e);
        sizes.add(s.fontSize);
        weights.add(s.fontWeight);
      });
    });
    return { sizes: [...sizes].sort((a, b) => parseFloat(a) - parseFloat(b)), weights: [...weights].sort() };
  });
  eq(type.sizes.length >= 3 && type.weights.length >= 2, true, "(the type check reads real text: " + type.sizes.length + " sizes, " + type.weights.length + " weights)");
  eq(type.sizes.every(s => ["12px", "14px", "16px", "22px", "40px"].indexOf(s) >= 0), true, "text on the List, Go, Settings and Stats comes in five sizes (" + type.sizes.join(", ") + ")");
  eq(type.weights.every(w => ["400", "600", "800"].indexOf(w) >= 0), true, "…and three weights (" + type.weights.join(", ") + ")");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
