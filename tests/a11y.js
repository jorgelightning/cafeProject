/* The new look, read as a person who can't see it well or can't use a mouse.

   Every text colour is measured against the colour actually behind it (layers composited, opacity applied) on the
   List, cafe page, the three Stats tabs and the Go board, in the light and the dark theme: 4.5:1 for text, 3:1 for
   large text. Text over a photo or gradient is judged by its scrim instead (the worst case is a white photo). Then a
   keyboard walk through the List: every stop shows a focus ring, has a name, and nothing jumps the order with a
   positive tabindex. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

const audit = () => {
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const bgOf = el => {
    const chain = []; let e = el, img = false;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e), c = parse(cs.backgroundColor);
      if (cs.backgroundImage && cs.backgroundImage !== "none") img = true;
      if (c && c.a > 0) chain.push(c);
      if (c && c.a === 1) break;
      e = e.parentElement;
    }
    let base = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    if (base.a < 1) base = over(base, { r: 255, g: 255, b: 255, a: 1 });
    let out = chain.length && chain[chain.length - 1].a === 1 ? chain.pop() : base;
    while (chain.length) out = over(chain.pop(), out);
    return { c: out, img };
  };
  const sel = e => { let s = e.tagName.toLowerCase(); const c = String(e.className).trim().split(/\s+/).filter(Boolean).slice(0, 2).join("."); if (c) s += "." + c; return s; };
  const fails = new Map();
  const walker = document.createTreeWalker(document.getElementById("app"), NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    if (!n.textContent.trim() || /^[\p{Extended_Pictographic}\s️‍]+$/u.test(n.textContent)) continue;
    const el = n.parentElement;
    if (!el || el.closest(".mapwrap,[hidden],.updatebar")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
    let op = 1, a = el; while (a) { op *= parseFloat(getComputedStyle(a).opacity); a = a.parentElement; }
    if (op === 0) continue;
    const cs = getComputedStyle(el), { c: bg, img } = bgOf(el);
    if (img) continue;
    let fg = parse(cs.color); if (!fg) continue;
    const f = over({ ...fg, a: fg.a * op }, bg);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight) >= 700);
    const rt = ratio(f, bg);
    if (rt < (large ? 3 : 4.5)) { const k = sel(el) + ' "' + n.textContent.trim().slice(0, 18) + '" ' + rt.toFixed(2); fails.set(k, 1); }
  }
  return [...fails.keys()];
};

(async () => {
  const srv = await serve();
  const b = await launch();
  const screens = {
    list: () => { isAdmin = true; applyMode(); _formSnap = null; listCompact = true; sortMode = "ranked"; show("list"); renderList(); },
    grid: () => { isAdmin = true; applyMode(); _formSnap = null; listCompact = false; show("list"); renderList(); },
    viewer: () => { isAdmin = false; applyMode(); _formSnap = null; listCompact = true; show("list"); renderList(); },
    cafe: () => { isAdmin = true; applyMode(); _formSnap = null; openDetail(cafes.find(c => rankOf(c) === 3).id, "list"); },
    you: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "you"; show("stats"); renderStats(); },
    habits: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "habits"; show("stats"); renderStats(); },
    money: () => { isAdmin = true; applyMode(); _formSnap = null; _statsTab = "money"; show("stats"); renderStats(); },
    board: () => { isAdmin = true; applyMode(); _formSnap = null; show("compare"); renderBoard(); },
    form: () => { isAdmin = true; applyMode(); _formSnap = null; openForm(); },
    settings: () => { isAdmin = true; applyMode(); _formSnap = null; show("settings"); }
  };
  for (const scheme of ["light", "dark"]) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(900);
    const low = [];
    for (const k of Object.keys(screens)) {
      await pg.evaluate("(" + screens[k].toString() + ")()");
      await pg.waitForTimeout(250);
      for (const f of await pg.evaluate("(" + audit.toString() + ")()")) low.push(k + ": " + f);
    }
    eq(low, [], "in the " + scheme + " theme no text on any of ten screens is under 4.5:1 (3:1 when large)");

    /* the worst photo is a white one: the scrim under white glyphs and the amber badge text must still hold */
    const scrim = await pg.evaluate(() => {
      const p = s => { const m = s.match(/rgba?\(([^)]+)\)/)[1].split(/[ ,\/]+/).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
      const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
      const worst = (bgCss, fgCss) => { const s = p(bgCss), f = p(fgCss); const b = { r: 255 * (1 - s.a) + s.r * s.a, g: 255 * (1 - s.a) + s.g * s.a, b: 255 * (1 - s.a) + s.b * s.a }; const x = lum(f), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const probe = (cls, extra) => { const e = document.createElement("span"); e.className = cls; document.body.appendChild(e); const cs = getComputedStyle(e); const out = worst(cs.backgroundColor, cs.color); e.remove(); return out; };
      return { round: probe("round"), badge: probe("rankbadge"), amber: probe("rankbadge r-amber") };
    });
    eq(scrim.round >= 3, true, "white glyphs on the round buttons clear 3:1 over a white photo (" + scrim.round.toFixed(2) + ")");
    eq(scrim.badge >= 4.5 && scrim.amber >= 4.5, true, "the rank badges clear 4.5:1 over a white photo (" + scrim.badge.toFixed(2) + ", amber " + scrim.amber.toFixed(2) + ")");

    if (scheme === "light") {
      await pg.evaluate("(" + screens.list.toString() + ")()");
      await pg.waitForTimeout(300);
      await pg.evaluate(() => { document.activeElement && document.activeElement.blur(); window.scrollTo(0, 0); });
      const stops = [];
      for (let i = 0; i < 45; i++) {
        await pg.keyboard.press("Tab");
        stops.push(await pg.evaluate(() => {
          const e = document.activeElement; if (!e || e === document.body) return null;
          const cs = getComputedStyle(e), wrap = e.closest(".search, .field, .mapsearch");
          const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
          const within = wrap ? (getComputedStyle(wrap).boxShadow !== "none" || getComputedStyle(wrap).outlineStyle !== "none") : false;
          const name = (e.getAttribute("aria-label") || e.getAttribute("title") || e.textContent || e.placeholder || "").trim();
          return { tag: e.tagName.toLowerCase() + "." + String(e.className).slice(0, 20), ring: ring || within, name: name.length > 0, tab: e.tabIndex };
        }));
      }
      const seen = stops.filter(Boolean);
      eq(seen.length >= 25, true, "the keyboard reaches the List's controls and rows (" + seen.length + " stops)");
      eq(seen.filter(s => !s.ring).map(s => s.tag), [], "every keyboard stop shows where the focus is");
      eq(seen.filter(s => !s.name).map(s => s.tag), [], "every keyboard stop has a name a screen reader can say");
      eq(await pg.evaluate(() => [...document.querySelectorAll("[tabindex]")].filter(e => e.tabIndex > 0).length), 0, "no positive tabindex jumps the order");
    }
    eq(errs, [], "no page errors in the " + scheme + " theme");
    await ctx.close();
  }
  await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
