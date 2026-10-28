/* The day run (27 Oct): one new cafe and two regulars, logged on the live site, and what it turned up.

   R1 Log opens the quick cup of the cafe you are standing in; "Not here?" lists the closest; no recent fix, nothing
      within 150 m, or only a private spot close by, and Log is the new-cafe form as before.
   R2 The place search asks with your location, puts branches of one name nearest first with their distance, and the
      where line names the street ("Lawton St · Outer Sunset").
   R3 A tie in cups goes to the drink you would order again; a 👎 is never What to order.
   R4 Placing looks three places either side and weighs another region and an old visit more; a settled cafe weighs
      the gap in rank, so Kissaten (#1 here) never meets the Hawaii cafe at the bottom.
   R5 The rank badge below #10 is readable. (The price as money, the latest price and "Your usuals" are in
      quick-cup, order-prices and branches.) */
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

  await pg.evaluate(() => {
    const ago = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const T = localToday();
    const dr = (n, dates, extra) => ({ n, dates, orders: dates.map((dt, i) => Object.assign({ id: n + i + dt, date: dt }, extra || {})) });
    const SF = (lat, lng) => ({ lat, lng, area: "San Francisco" });
    const BALI = { lat: -8.65, lng: 115.13, area: "Canggu" };
    const settled = (id, name, elo, where, drinks) => Object.assign({ id, name, rating: 5, matches: 8, elo, drinks }, where);
    window.__T = T;
    cafes = [
      settled("kh", "Kissaten HiFi", 1750, SF(37.776, -122.424), [dr("Flat White", [ago(10), T], { p: "5" })]),
      settled("r0", "Second Shot", 1700, SF(37.78, -122.43), [dr("Flat White", [ago(12)])]),
      settled("r1", "Third Wave", 1650, SF(37.785, -122.44), [dr("Flat White", [ago(14)])]),
      settled("b1", "Bali One", 1600, BALI, [dr("Latte", ["2022-09-01"])]),
      settled("b2", "Bali Two", 1550, BALI, [dr("Latte", ["2022-09-02"])]),
      settled("b3", "Bali Three", 1500, BALI, [dr("Latte", ["2022-09-03"])]),
      settled("b4", "Bali Four", 1450, BALI, [dr("Latte", ["2022-09-04"])]),
      settled("b5", "Bali Five", 1400, BALI, [dr("Latte", ["2022-09-05"])]),
      settled("b6", "Bali Six", 1350, BALI, [dr("Latte", ["2022-09-06"])]),
      settled("s1", "Kasama Cafe", 1300, SF(37.79, -122.41), [dr("Flat White", [ago(30)])]),
      settled("iv", "Island Vintage", 1000, { lat: 21.33, lng: -158.08, area: "Kapolei" }, [{ n: "Flat white", orders: [{ id: "iv1" }] }]),
      /* still being placed, so neither is a reference */
      { id: "andy", name: "Andytown Coffee Roasters", kind: "coffee", rating: 5, matches: 0, lat: 37.7577, lng: -122.505, area: "Outer Sunset",
        drinks: [dr("Snowy Plover", [T], { p: "6.75" })] },
      { id: "tcm", name: "The Coffee Movement", rating: 5, matches: 0, lat: 37.78, lng: -122.47, area: "Central Richmond",
        drinks: [dr("Pour over", [ago(1)], { p: "6", reorder: "yes", note: "Strong taste with amazing notes!" }), dr("Cortado", [T], { reorder: "neutral" })] },
      { id: "home", name: "Home", custom: true, rating: 5, lat: 37.70, lng: -122.48, area: "Home", drinks: [dr("Latte", [ago(2)])] },
    ];
    privDetail = {};
    isAdmin = true;
    applyMode();
  });

  /* ---- R3: a Maybe never becomes What to order ---- */
  let s = await pg.evaluate(() => {
    const top = id => (topDrinkAt(cafes.find(c => c.id === id)) || { d: { n: null } }).d.n;
    openDetail("tcm", "list");
    const oa = $("d-orderagain").innerText;
    const cards = [...document.querySelectorAll("#d-drinks .drinkcard .dname, #d-drinks .drinkcard .dtop")].map(x => x.textContent.trim().split(/\s/)[0]);
    show("list");
    renderList();
    const row = [...document.querySelectorAll("#grid .card")].find(x => /The Coffee Movement/.test(x.innerText));
    return { top: top("tcm"), oa, first: cards[0], row: row ? row.innerText : "" };
  });
  eq(s.top, "Pour over", "one cup each: the 👍 Pour over is What to order, not the 😐 Cortado (day run)");
  eq(/Pour over/.test(s.oa) && !/Cortado/.test(s.oa), true, "…on the cafe page");
  eq(s.first, "Pour", "…and first in its drinks");
  eq(/Pour over/.test(s.row) && !/Cortado/.test(s.row), true, "…and on its List row");
  s = await pg.evaluate(() => {
    const at = drinks => (topDrinkAt({ id: "x", name: "x", drinks }) || { d: { n: null } }).d.n;
    const o = (date, reorder) => Object.assign({ id: date + (reorder || ""), date }, reorder ? { reorder } : {});
    return [
      at([{ n: "Maybe", orders: [o("2026-10-02", "neutral")] }, { n: "Unsaid", orders: [o("2026-10-01")] }]),
      at([{ n: "Twice no", orders: [o("2026-10-01"), o("2026-10-02", "no")] }, { n: "Once yes", orders: [o("2026-09-01", "yes")] }]),
      at([{ n: "Yes then quiet", orders: [o("2026-10-01", "yes"), o("2026-10-05")] }, { n: "Maybe", orders: [o("2026-10-06", "neutral")] }]),
      at([{ n: "Thrice", orders: [o("2026-10-01"), o("2026-10-02"), o("2026-10-03", "neutral")] }, { n: "Once yes", orders: [o("2026-09-01", "yes")] }]),
      at([{ n: "Thrice no", orders: [o("2026-10-01"), o("2026-10-02"), o("2026-10-03", "no")] }, { n: "Once no", orders: [o("2026-09-01", "no")] }]),
    ];
  });
  eq(s[0], "Unsaid", "a cup with no answer beats a 😐");
  eq(s[1], "Once yes", "a drink whose last answer was 👎 is never What to order, whatever its cups");
  eq(s[2], "Yes then quiet", "a cup logged without an answer leaves the last 👍 standing");
  eq(s[3], "Thrice", "cups still come first: three 😐 cups lead one 👍");
  eq(s[4], null, "every drink last a 👎: nothing is What to order, however many cups");
  s = await pg.evaluate(() => {
    cafes.push({ id: "nope", name: "Never Again", rating: 1, lat: 37.77, lng: -122.45, area: "San Francisco",
      drinks: [{ n: "Burnt Latte", dates: ["2026-10-01"], orders: [{ id: "n1", date: "2026-10-01", reorder: "no" }] }] });
    openDetail("nope", "list");
    const card = $("d-orderagain");
    const shown = !!card && !card.hidden && card.innerText.trim() !== "";
    show("list");
    renderList();
    const row = [...document.querySelectorAll("#grid .card")].find(x => /Never Again/.test(x.innerText));
    cafes = cafes.filter(c => c.id !== "nope");
    return { shown, row: row ? row.innerText : "" };
  });
  eq([s.shown, /Burnt Latte/.test(s.row)], [false, false], "…so the cafe page has no What to order and its List row names no drink");

  /* ---- R4: better pairs ---- */
  s = await pg.evaluate(() => placementOpponent(cafes.find(c => c.id === "andy")).id);
  eq(s, "s1", "placing looks three either side and takes the nearby, recent cafe over six in Bali last seen in 2022");
  s = await pg.evaluate(() => {
    const seen = {};
    for (let i = 0; i < 40; i++) {
      chaserArm("kh", true);
      seen[_chaser.opp] = (seen[_chaser.opp] || 0) + 1;
    }
    _chaser = null;
    return seen;
  });
  eq(!s.iv && Object.keys(s).every(k => ["r0", "r1", "s1"].includes(k)), true,
    "a settled cafe never meets the cafe ten places down in another region with no dates (" + JSON.stringify(s) + ")");
  s = await pg.evaluate(() => {
    chaserArm("tcm");
    const asked = !!_chaser;
    _chaser = null;
    return asked;
  });
  eq(s, true, "a cafe still being placed is always asked about");

  /* ---- R5: a rank you can read ---- */
  s = await pg.evaluate(() => {
    openDetail("iv", "list");
    const el = document.querySelector("#d-rank b");
    return { rank: el && el.textContent, ink: el && getComputedStyle(el).color, hero: getComputedStyle($("d-hero")).color, text: getComputedStyle(document.body).getPropertyValue("--text").trim() };
  });
  eq(s.rank, "#11", "the Hawaii cafe is #11, below the gold");
  eq(s.ink !== s.hero && s.ink === "rgb(24, 24, 27)", true, "…and its badge has the page's ink, not the photo's cream (" + s.ink + ")");

  /* ---- R1: Log starts where you are ---- */
  const logFrom = loc => pg.evaluate(l => {
    closeSheet();
    show("list");
    userLoc = l ? { lat: l[0], lng: l[1] } : null;
    userLocAt = l ? Date.now() - (l[2] || 0) : 0;
    logTab();
    return {
      view: app.dataset.view, cur: curId, sheet: !$("dnsheet").hidden && $("dns-title").textContent,
      here: ($("dns-panel").querySelector(".qchere") || {}).textContent || "",
    };
  }, loc);
  s = await logFrom([37.7762, -122.424]);
  eq([s.view, s.cur, s.sheet], ["detail", "kh", "A cup at Kissaten HiFi"], "Log, from the List, inside Kissaten: its quick cup, on its page (day run: 9 taps to 4)");
  eq(/^You’re here · \d+ ftNot here\?$/.test(s.here), true, "…saying you are here, and how far (" + s.here + ")");
  eq(await pg.evaluate(() => [...document.querySelectorAll("#dns-panel .dntag")].filter(x => x.getAttribute("aria-pressed") === "true").length), 0, "…with no drink picked yet (design audit D8)");
  await pg.getByRole("button", { name: "Not here?" }).click();
  s = await pg.evaluate(() => ({ title: $("dns-title").textContent, rows: [...document.querySelectorAll("#dns-panel .qcw")].map(x => x.innerText.replace(/\s+/g, " ").trim()) }));
  eq(s.title, "Where are you?", "Not here? asks where you are");
  eq([/^Kissaten HiFi \d+ ft$/.test(s.rows[0]), s.rows.length, s.rows[s.rows.length - 1]], [true, 6, "＋ Somewhere new"],
    "…the five closest on your list, nearest first with distances, then Somewhere new (" + s.rows.join(" | ") + ")");
  eq(s.rows.some(r => /Home/.test(r)), false, "…never a private spot");
  await pg.locator("#dns-panel .qcw").nth(1).click();
  s = await pg.evaluate(() => ({ cur: curId, ok: $("dns-title").textContent === "A cup at " + cafes.find(c => c.id === curId).name, here: !!$("dns-panel").querySelector(".qchere") }));
  eq([s.ok, s.cur !== "kh", s.here], [true, true, false], "…and another opens that cafe's quick cup");
  await pg.evaluate(() => { closeSheet(); qcNotHere(); });
  await pg.getByRole("button", { name: "＋ Somewhere new" }).click();
  eq(await pg.evaluate(() => [app.dataset.view, $("dnsheet").hidden]), ["form", true], "Somewhere new is the new-cafe form");
  await pg.evaluate(() => { _formSnap = null; });
  s = await logFrom([37.7762, -122.424, 10 * 60000]);
  eq([s.view, s.sheet], ["form", false], "a fix ten minutes old is not trusted: Log is the new-cafe form");
  await pg.evaluate(() => { _formSnap = null; });
  s = await logFrom([37.7852, -122.424]);
  eq([s.view, s.sheet], ["form", false], "a kilometre from anything on the list, Log is the new-cafe form");
  await pg.evaluate(() => { _formSnap = null; });
  s = await logFrom([37.70, -122.48]);
  eq([s.view, s.sheet], ["form", false], "standing on a private spot's blurred pin does not open it");
  await pg.evaluate(() => { _formSnap = null; });
  s = await logFrom(null);
  eq([s.view, s.sheet], ["form", false], "with no location, Log is the new-cafe form");

  /* ---- R2: the right branch ---- */
  await pg.evaluate(() => {
    _formSnap = null;
    /* an Andytown already on the list would (rightly) be opened for editing instead of added */
    cafes = cafes.filter(c => c.id !== "andy");
    window.__acMade = 0;
    window.__req = [];
    const pred = (id, main, sub, m, street, hood) => ({
      placeId: id, mainText: { text: main }, secondaryText: { text: sub }, text: { text: main + ", " + sub }, distanceMeters: m,
      toPlace() {
        return { id, displayName: main, location: { lat: () => 37.7577, lng: () => -122.505 },
          addressComponents: [{ types: ["route"], longText: street + "reet", shortText: street }, { types: ["neighborhood", "political"], longText: hood, shortText: hood },
            { types: ["country", "political"], longText: "United States", shortText: "US" }],
          fetchFields() { return Promise.resolve({ place: this }); } };
      },
    });
    window.google = { maps: {
      Map: function () { this.addListener = function () {}; this.setCenter = function () {}; this.setZoom = function () {}; },
      Marker: function () { this.setMap = function () {}; },
      event: { trigger: function () {} },
      places: {
        Autocomplete: function (el) { if (el && el.id === "f-name") window.__acMade++; this.addListener = function () {}; this.getPlace = () => ({}); },
        AutocompleteSessionToken: function () {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions(req) {
          window.__req.push(req);
          return Promise.resolve({ suggestions: [
            pred("KEARNY", "Andytown Coffee Roasters", "Kearny Street, San Francisco", 9600, "Kearny St", "Union Square"),
            pred("ANNIE", "Annie's Coffee", "Irving Street, San Francisco", 1200, "Irving St", "Inner Sunset"),
            pred("FRONT", "Andytown Coffee Roasters", "Front Street, San Francisco", 9900, "Front St", "Financial District"),
            pred("LAWTON", "Andytown Coffee Roasters", "Lawton Street, San Francisco", 330, "Lawton St", "Outer Sunset"),
            pred("GREAT", "Andytown Coffee Roasters", "Great Highway, San Francisco", 600, "Great Hwy", "Outer Sunset"),
          ].map(p => ({ placePrediction: p })) });
        } },
      },
    } };
    gReady = true;
    userLoc = { lat: 37.7599, lng: -122.507 };
    userLocAt = Date.now();
    openForm();
  });
  await pg.waitForTimeout(250);
  await pg.locator("#f-name").fill("Andytown");
  await pg.waitForTimeout(600);
  s = await pg.evaluate(() => ({
    req: window.__req.length && window.__req[window.__req.length - 1],
    rows: [...document.querySelectorAll("#f-sugg .fsg")].map(x => x.querySelector("small").textContent.split(",")[0] + " " + ((x.querySelector(".d") || {}).textContent || "")),
    by: ($("f-sugg").querySelector(".fsg-by") || {}).textContent, made: window.__acMade,
  }));
  eq([s.req.input, s.req.origin, s.req.locationBias && s.req.locationBias.radius], ["Andytown", { lat: 37.7599, lng: -122.507 }, 20000],
    "the place search is told where you are, as the origin and as a preference");
  eq(s.rows, ["Lawton Street 0.2 mi", "Great Highway 0.4 mi", "Kearny Street 6.0 mi", "Front Street 6.2 mi", "Irving Street 0.7 mi"],
    "branches of one name come nearest first with their distance; another name keeps Google's place after them");
  eq([s.by, s.made], ["Powered by Google", 0], "…credited to Google, and the old dropdown is not built as well");
  await pg.locator("#f-sugg .fsg").first().click();
  await pg.waitForTimeout(200);
  s = await pg.evaluate(() => ({ where: $("f-where-text").textContent, pid: formPid, name: $("f-name").value, open: !$("f-sugg").hidden }));
  eq(s, { where: "Lawton St · Outer Sunset · from Google", pid: "LAWTON", name: "Andytown Coffee Roasters", open: false },
    "picking it fills the form, and the where line names the street (day run: it said only \"Union Square\")");
  await pg.evaluate(() => { formPid = ""; formStreet = ""; syncWhere(); });
  eq(await pg.evaluate(() => $("f-where-text").textContent), "Outer Sunset · pinned by you", "a pin you dropped yourself shows no street");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
