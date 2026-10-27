/* The question after a save stays inside one kind (compare audit, 27 Oct).

   On 26 Oct a pour over at The Coffee Movement was put against Brian Black Tea: placing a new cafe looked only at
   the verdict, and the middle of the Loved cafes was a tea house, so it was the same question every time. Now:
   C1  every question is between two of a kind; tea and matcha stand in for each other when one is short; with
       nobody of the kind there is no question; ties on Go pair one kind too.
   C2  placing asks the easiest nearby place: in the same region, visited in the last four months, with a drink logged.
   C3  both sides show a drink (yours, or "Usually a …" for what you order there) and a kind tag, and the question
       names the kind.
   C6  a cafe's kind can be set, in the form or from the sheet ("Comparing as coffee · Change"). */
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

  /* Loved and placed, sorted best first: 5 matcha, 6 boba, 2 tea houses, then 8 coffee bars, so the middle of the
     Loved cafes is a tea house, as it was on 26 Oct. Among the coffee bars, the search starts at C5 (Hawaii, last
     there long ago); two places up, C3 is in California and was visited a month ago. CX has no drink logged. */
  const seed = () => pg.evaluate(() => {
    isAdmin = true; applyMode(); _chaser = null; _chaserSeen = []; _priorSig = -1; privDetail = {};
    let s = 7; Math.random = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    const CA = [37.77, -122.42], HI = [21.3, -157.83];
    const mk = (id, drink, at, elo, ago, extra) => Object.assign({
      id, name: id, area: "Area " + id, lat: at[0], lng: at[1], rating: 5, elo, matches: 8,
      drinks: drink ? [{ n: drink, dates: [day(ago)], orders: [{ id: id + "o", date: day(ago), p: "6" }] }] : [],
    }, extra || {});
    cafes = [];
    for (let i = 0; i < 5; i++) cafes.push(mk("M" + i, "Matcha latte", CA, 1800 - i * 10, 20));
    for (let i = 0; i < 6; i++) cafes.push(mk("B" + i, "Brown sugar boba", CA, 1745 - i * 5, 20));
    cafes.push(mk("T1", "Black tea", CA, 1714, 150), mk("T2", "Jasmine tea", CA, 1712, 150));
    cafes.push(
      mk("C1", "Flat White", CA, 1700, 5), mk("C2", "Cortado", CA, 1690, 200), mk("C3", "Flat White", CA, 1680, 30),
      mk("C4", "Cortado", HI, 1670, 10), mk("CX", null, CA, 1665, 0), mk("C5", "Latte", HI, 1660, 300),
      mk("C6", "Latte", HI, 1650, 300), mk("C7", "Latte", HI, 1640, 300)
    );
    const today = localToday();
    cafes.push({ id: "NEWC", name: "The Coffee Spot", area: "Richmond", lat: CA[0], lng: CA[1], rating: 5,
      drinks: [{ n: "Pour over", dates: [today], orders: [{ id: "nc1", date: today, p: "5" }] }] });
    cafes.push({ id: "NEWT", name: "New Tea House", area: "Sunset", lat: CA[0], lng: CA[1], rating: 5,
      drinks: [{ n: "Earl grey tea", dates: [today], orders: [{ id: "nt1", date: today, p: "5" }] }] });
    cafes.push({ id: "NEWG", name: "Gelato Corner", area: "Mission", lat: CA[0], lng: CA[1], rating: 5,
      drinks: [{ n: "Pistachio", dates: [today], orders: [{ id: "ng1", date: today, p: "5" }] }] });
    window.__saved = [];
    saveCafe = id => window.__saved.push(id);
  });

  /* ---- C1: one kind ---- */
  await seed();
  const c1 = await pg.evaluate(() => {
    const loved = cafes.filter(c => c.rating === 5 && !isProvisional(c)).sort((a, b) => eloFor(b) - eloFor(a));
    const middle = loved[Math.round(loved.length / 2)];
    const opps = new Set(), kinds = new Set();
    for (let i = 0; i < 30; i++) { _chaserSeen = []; chaserArm("NEWC"); opps.add(_chaser.opp); kinds.add(cafeKind(cafes.find(c => c.id === _chaser.opp))); }
    return { middle: cafeKind(middle), kind: cafeKind(cafes.find(c => c.id === "NEWC")), opps: [...opps], kinds: [...kinds], tier: _chaser.tier };
  });
  eq([c1.middle, c1.kind], ["tea", "coffee"], "(the board as on 26 Oct: a new coffee bar, and a tea house in the middle of the Loved cafes)");
  eq([c1.tier, c1.kinds], ["P", ["coffee"]], "a new coffee bar is placed against coffee bars only, 30 times out of 30");

  const c1b = await pg.evaluate(() => {
    const kinds = new Set();
    for (let i = 0; i < 30; i++) { _chaserSeen = []; chaserArm("NEWT"); kinds.add(cafeKind(cafes.find(c => c.id === _chaser.opp))); }
    const settled = new Set();
    for (let i = 0; i < 30; i++) { _chaserSeen = []; chaserArm("C2"); settled.add(cafeKind(cafes.find(c => c.id === _chaser.opp))); }
    chaserArm("NEWG");
    return { tea: [...kinds].sort(), settled: [...settled], gelato: _chaser };
  });
  eq(c1b.tea.every(k => k === "tea" || k === "matcha") && c1b.tea.indexOf("matcha") >= 0, true,
     "with only 2 tea houses placed, matcha stands in for tea, and nothing else does (" + c1b.tea.join(", ") + ")");
  eq(c1b.settled, ["coffee"], "a placed coffee bar is asked about coffee bars only");
  eq(c1b.gelato, null, "a gelato place with no other gelato places gets no question at all");

  /* ---- C2: the easiest nearby place ---- */
  const c2 = await pg.evaluate(() => {
    _chaserSeen = []; chaserArm("NEWC");
    const refs = placementRefs(cafes.find(c => c.id === "NEWC")).map(c => c.id);
    return { opp: _chaser.opp, refs };
  });
  eq(c2.refs.indexOf("CX"), -1, "a coffee bar with no drink logged is not used to place anything");
  eq(c2.refs, ["C1", "C2", "C3", "C4", "C5", "C6", "C7"], "…so the search is over the seven with drinks, best first");
  eq(c2.opp, "C3", "the search starts at C5 (Hawaii, last there months ago) and asks C3 instead: two places up, in California, visited a month ago");
  const c2b = await pg.evaluate(() => {
    const n = cafes.find(c => c.id === "NEWC");
    const r = chaserApply(n.id, "C3", false);
    _chaser = null; _chaserSeen = []; chaserArm("NEWC");
    return { matches: n.matches, above: r.postA < cafes.filter(c => /^C[4-7]$/.test(c.id)).map(c => chaserRank(c, chaserBoard())).sort((a, b) => a - b)[0], next: _chaser.opp };
  });
  eq([c2b.matches, c2b.above], [1, true], "beating C3 counts as an answer and lifts the new bar above the ones below C3");
  eq(["C1", "C2", "C3"].indexOf(c2b.next) >= 0, true, "…and the next question is higher up (" + c2b.next + ")");

  /* ---- C3: the sheet says what is being compared ---- */
  await seed();
  const sheet = await pg.evaluate(async () => {
    _chaserSeen = []; chaserArm("NEWC"); _chaser.flip = false;
    openDetail("NEWC", "list");
    await new Promise(r => setTimeout(r, 120));
    const s = document.querySelector("#d-chaser .ch-sheet");
    return {
      q: s.querySelector(".ch-q").textContent,
      names: [...s.querySelectorAll(".ch-opt .ch-n")].map(e => e.textContent),
      kinds: [...s.querySelectorAll(".ch-opt .ch-kind")].map(e => e.textContent),
      subs: [...s.querySelectorAll(".ch-opt .ch-s")].map(e => e.textContent),
      as: s.querySelector(".ch-as").textContent,
    };
  });
  eq(sheet.q, "Which coffee would you go back for?", "the question names the kind");
  eq([sheet.names, sheet.kinds], [["The Coffee Spot", "C3"], ["Coffee", "Coffee"]], "each side carries its kind");
  eq([sheet.subs[0], /^Usually a Flat White · \dw ago$/.test(sheet.subs[1])], ["Pour over · today", true],
     "your side shows what you just had, the other what you order there (" + sheet.subs[1] + ")");
  eq(sheet.as, "Comparing as coffee · Change", "and it says which kind it is comparing as");
  const tierA = await pg.evaluate(() => {
    const c = cafes.find(x => x.id === "C1"), today = localToday();
    c.drinks[0].dates.push(today); c.drinks[0].orders.push({ id: "c1b", date: today, p: "6" });
    _chaserSeen = []; chaserArm("C1"); const t = _chaser.tier, q = chaserQuestion(c, cafes.find(x => x.id === _chaser.opp));
    return { t, q };
  });
  eq(tierA, { t: "A", q: "Which flat white would you go back for?" }, "when both serve the drink you just had, the question names the drink");

  /* ---- C6: setting the kind, from the sheet ---- */
  await seed();
  const fix = await pg.evaluate(async () => {
    _chaserSeen = []; chaserArm("NEWC"); openDetail("NEWC", "list");
    await new Promise(r => setTimeout(r, 80));
    document.querySelector("#d-chaser .ch-as").click();
    await new Promise(r => setTimeout(r, 30));
    const chips = [...document.querySelectorAll("#d-chaser .ch-kinds .chip")].map(e => e.textContent + (e.classList.contains("on") ? "*" : ""));
    [...document.querySelectorAll("#d-chaser .ch-kinds .chip")].find(e => e.textContent === "Tea").click();
    await new Promise(r => setTimeout(r, 30));
    const c = cafes.find(x => x.id === "NEWC"), opp = cafes.find(x => x.id === _chaser.opp);
    const mine = [...document.querySelectorAll("#d-chaser .ch-opt")].find(e => e.querySelector(".ch-n").textContent === c.name);
    return { chips, kind: c.kind, saved: window.__saved.indexOf("NEWC") >= 0, opp: cafeKind(opp), tag: mine.querySelector(".ch-kind").textContent };
  });
  eq(fix.chips, ["Coffee*", "Matcha", "Tea", "Boba", "Gelato", "Bakery"], "Change shows the kinds, the guess marked");
  eq([fix.kind, fix.saved, fix.tag], ["tea", true, "Tea"], "choosing Tea saves it on the cafe and the sheet says Tea");
  eq(fix.opp === "tea" || fix.opp === "matcha", true, "…and the question is asked again among tea houses (" + fix.opp + ")");

  /* ---- C6: setting the kind, in the form ---- */
  await seed();
  const form = await pg.evaluate(async () => {
    openForm("C2");
    const hint = () => document.getElementById("f-kind-hint").textContent;
    const out = { before: hint(), on0: document.querySelectorAll("#f-kind .chip.on").length };
    [...document.querySelectorAll("#f-kind .chip")].find(e => e.textContent === "Tea").click();
    out.after = hint();
    out.sum = document.getElementById("f-more-sum").textContent;
    out.dirty = formDirty();
    saveForm();
    const c = cafes.find(x => x.id === "C2");
    out.kind = c.kind; out.as = cafeKind(c); out.elo = c.elo;
    openForm("C2");
    out.reopened = [...document.querySelectorAll("#f-kind .chip.on")].map(e => e.textContent);
    [...document.querySelectorAll("#f-kind .chip")].find(e => e.textContent === "Tea").click();
    saveForm();
    out.cleared = "kind" in c; out.back = cafeKind(c);
    return out;
  });
  eq([form.before, form.on0], ["Guessed from what you order: coffee.", 0], "the form shows the guess, with no kind chosen");
  eq([form.after, /Tea/.test(form.sum), form.dirty], ["Set by you. Tap it again to go back to the guess (coffee).", true, true],
     "choosing Tea says so, shows under More, and counts as an unsaved change");
  eq([form.kind, form.as, form.elo, form.reopened], ["tea", "tea", 1690, ["Tea"]], "saving keeps it (and the cafe's score), and it is there next time");
  eq([form.cleared, form.back], [false, "coffee"], "tapping it again and saving goes back to the guess");

  /* ---- C1 on Go: ties pair one kind ---- */
  const tie = await pg.evaluate(() => {
    _priorSig = -1; _chaserSeen = [];
    cafes = cafes.filter(c => !/^NEW/.test(c.id));
    /* a coffee bar and a boba shop tied on top, two coffee bars tied lower down */
    cafes.find(c => c.id === "C1").elo = 1900; cafes.find(c => c.id === "B0").elo = 1900;
    cafes.find(c => c.id === "C6").elo = 1500; cafes.find(c => c.id === "C7").elo = 1500;
    cafes.forEach(c => { c.matches = 8; delete c.kind; });
    show("compare"); renderBoard(); boardRank();
    const r = { tier: _chaser.tier, pair: [_chaser.cafe, _chaser.opp].sort() };
    chaserDismiss();
    return r;
  });
  eq(tie, { tier: "T", pair: ["C6", "C7"] }, "Rank a pair settles the coffee tie, not the coffee bar tied with a boba shop");

  eq(errs, [], "no page errors");
  await ctx.close();
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
