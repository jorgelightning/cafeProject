/* The visual system.

   Colour was tokenised long ago; nothing dimensional was, so the stylesheet accumulated 23
   font sizes, 18 corner radii and 13 gap values — seven of the font sizes inside three pixels.
   And the layout had one breakpoint, at 900px, which left a 744px iPad showing the phone
   layout stretched, and a 1440px laptop drawing smaller cards than a 390px phone.

   These tests hold the scale and the two layout rules. They are deliberately about ratios and
   relationships rather than exact pixels, so a later type tweak does not turn them red. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  const css = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");

  // ---- the scale exists and everything dimensional uses it ----
  ["--fs-1", "--fs-5", "--r-1", "--r-pill", "--sp-1", "--sp-5"].forEach(t => {
    eq(new RegExp(t.replace(/-/g, "\\-") + "\\s*:").test(css), true, "the scale defines " + t);
  });

  const body = css.replace(/:root\{[^}]*\}/, "");
  const litRadii = [...new Set((body.match(/border-radius:\s*\d+px(?![ \d])/g) || []))];
  eq(litRadii, [], "no rule sets a corner radius outside the scale");

  const litGaps = [...new Set((body.match(/\bgap:\s*\d+px(?![ \d])/g) || []))];
  eq(litGaps, [], "…and none sets a gap outside it");

  /* Font size is the one with a deliberate exception: emoji and icon glyphs are artwork being
     sized, not type being set, so they keep their own dimensions. Everything else is a token. */
  const litFs = (body.match(/([^{}]*)\{[^}]*font-size:\s*[\d.]+px/g) || [])
    .map(m => m.slice(0, m.indexOf("{")).trim());
  const GLYPH = /\.(em|big|plus|ti|drinkicon|rate|gotile|abchev|drgchev|cdchev|lbstars|gostar)\b|nophoto|emoji/;
  const strays = litFs.filter(sel => !GLYPH.test(sel));
  eq(strays, [], "every text rule takes its size from the scale");
  eq(litFs.length > 0, true, "…while glyph rules keep their own (" + litFs.length + " of them)");

  const srv = await serve();
  const b = await launch();

  const at = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(900);
    const out = await pg.evaluate(() => {
      isAdmin = false; applyMode && applyMode(); show("list"); renderList();
      const g = document.getElementById("grid"), c = g.querySelector(".card");
      return { card: c ? Math.round(c.getBoundingClientRect().width) : null,
               cols: getComputedStyle(g).gridTemplateColumns.split(" ").length,
               content: Math.round(g.getBoundingClientRect().width),
               doc: document.documentElement.scrollWidth,
               win: window.innerWidth };
    });
    await ctx.close();
    return out;
  };

  const phone = await at(390, 844);
  const ipad = await at(744, 1133);
  const ipadL = await at(1133, 744);
  const laptop = await at(1440, 900);

  // ---- C: more screen must never mean smaller cards ----
  eq(laptop.card >= phone.card, true,
     "a laptop card is at least as wide as a phone card (" + laptop.card + " vs " + phone.card + ")");
  eq(ipadL.card >= phone.card, true,
     "…and so is an iPad-landscape card (" + ipadL.card + ")");
  eq(laptop.content > ipadL.content, true,
     "the browse column grows with the window rather than being pinned");

  // ---- B: 744px is its own layout, not the phone stretched ----
  eq(ipad.cols > phone.cols, true,
     "iPad portrait gets more columns than a phone (" + ipad.cols + " vs " + phone.cols + ")");
  eq(ipad.card < 260, true,
     "…so its cards are a sane size rather than stretched (" + ipad.card + "px)");
  eq(ipad.content <= 760, true,
     "…and the content keeps a reading width instead of running the full 744px");

  // ---- a pane must not open flush against the top edge ----
  /* The sidebar's safe-area inset clears the notch but adds no gap under it, so on a phone
     without one the search box sat on the very first pixel — the only pane that did. The
     hero on Detail is the deliberate exception: it is full-bleed artwork. */
  const gaps = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(900);
    const out = await pg.evaluate(() => {
      isAdmin = false; applyMode && applyMode();
      cafes = [{ id: "x", name: "Test Cafe", area: "Oakland", rating: 4, elo: 1500, matches: 3,
                 drinks: [{ n: "Latte", orders: [{ date: "2026-09-01" }] }], lat: 1, lng: 1 }];
      renderList();
      const top = (view, pane) => {
        if (view === "detail") openDetail("x", "list"); else app.dataset.view = view;
        if (view === "compare") renderBoard();
        if (view === "stats") renderStats();
        if (view === "settings") renderSettings();
        const p = document.getElementById(pane), pr = p.getBoundingClientRect();
        /* the first descendant that actually paints: a fill, a border, or its own text */
        const k = [...p.querySelectorAll("*")].find(e => {
          const r = e.getBoundingClientRect();
          if (r.height <= 0 || r.width <= 0) return false;
          const st = getComputedStyle(e);
          return st.backgroundColor !== "rgba(0, 0, 0, 0)" || st.backgroundImage !== "none" ||
                 st.borderTopWidth !== "0px" || (!e.children.length && e.textContent.trim());
        });
        return k ? Math.round(k.getBoundingClientRect().top - pr.top) : -1;
      };
      return { list: top("list", "pane-list"), form: top("form", "pane-form"),
               go: top("compare", "pane-compare"), stats: top("stats", "pane-stats"),
               settings: top("settings", "pane-settings"), detail: top("detail", "pane-detail") };
    });
    await ctx.close();
    return out;
  };

  const pg1 = await gaps(390, 844), pg2 = await gaps(744, 1133);
  [["phone", pg1], ["iPad portrait", pg2]].forEach(([name, g]) => {
    ["list", "form", "go", "stats", "settings"].forEach(k =>
      eq(g[k] >= 12, true, "the " + k + " pane opens with room above it on " + name +
                           " (" + g[k] + "px)"));
    eq(g.detail, 0, "…while the hero on Detail stays full-bleed on " + name);
  });

  // ---- nothing scrolls sideways at any of them ----
  [["phone", phone], ["iPad portrait", ipad], ["iPad landscape", ipadL], ["laptop", laptop]]
    .forEach(([name, m]) => eq(m.doc <= m.win + 1, true, "no sideways scroll on " + name));

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
