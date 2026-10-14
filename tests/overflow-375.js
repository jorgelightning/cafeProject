/* Nothing sticks out at 375px.

   375 is the iPhone width most people still hold, and the one no test used: drink-taps runs at 360
   and scale.js at 390 and 744. This walks every screen of the app, against the real 100+ cafes,
   and fails on two things: the page scrolling sideways, and any visible element whose right edge
   lands past the screen unless it sits inside a container that is meant to scroll (a chip row, a
   table). Elements are named in the failure so the offender is obvious.

   It also holds the type floor: no text smaller than 12px. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const W = 375;
  const pg = await b.newPage({ viewport: { width: W, height: 812 } });
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(900);

  const audit = label => pg.evaluate(([label, W]) => {
    const scrolls = el => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true; } return false; };
    const shown = el => { const s = getComputedStyle(el); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const pane = document.querySelector(".pane.on, .pane[style*='block']") || document.body;
    const out = [], small = [];
    document.querySelectorAll("#app *").forEach(el => {
      if (!shown(el) || el.closest("svg") || el.closest(".sr-only")) return;
      const r = el.getBoundingClientRect();
      if (r.right > W + 0.5 && !scrolls(el)) out.push((el.id ? "#" + el.id : "") + "." + String(el.className).split(" ")[0] + " <" + el.tagName.toLowerCase() + "> right=" + Math.round(r.right));
      if (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) {
        const fs = parseFloat(getComputedStyle(el).fontSize);
        /* emoji and icon glyphs are artwork, sized by what they draw, not read as text */
        if (fs < 12 && !/^[^\w]+$/u.test(el.textContent.trim())) small.push(el.tagName.toLowerCase() + "." + String(el.className).split(" ")[0] + "=" + fs);
      }
    });
    return { label, sideways: document.documentElement.scrollWidth - innerWidth, offenders: [...new Set(out)].slice(0, 6), small: [...new Set(small)].slice(0, 6) };
  }, [label, W]);

  const screens = [
    ["map",          () => { show("map"); }],
    ["map + switch", () => { show("map"); if (typeof toggleWantOnly === "function") toggleWantOnly(true); }],
    ["list",         () => { if (typeof toggleWantOnly === "function") toggleWantOnly(false); setListTab("been"); show("list"); }],
    ["list filters", () => { show("list"); const p = document.getElementById("listpanel"); if (p && p.hidden) toggleListFilters(); }],
    ["list loved + area", () => { const a = document.querySelector("#areachips .chip"); setVerdict("loved"); if (a) a.click(); }],
    ["list want",    () => { clearAll(); const p = document.getElementById("listpanel"); if (p && !p.hidden) toggleListFilters(); setListTab("want"); }],
    ["list empty search", () => { setListTab("been"); const q = document.getElementById("q"); q.value = "zzzzzz-no-such-cafe"; renderList(); }],
    ["detail",       () => { clearAll(); const c = cafes.filter(x => !x.wish).sort((a, b) => (b.drinks || []).length - (a.drinks || []).length)[0]; openDetail(c.id, "list"); }],
    ["stats",        () => { show("stats"); }],
    ["settings",     () => { show("settings"); }],
    ["go",           () => { openRank(); }],
    ["new visit",    () => { isAdmin = true; applyMode(); openForm(); }],
    ["new visit, more open", () => { document.getElementById("f-more").open = true; document.getElementById("f-details").open = true; }]
  ];
  for (const [label, go] of screens) {
    await pg.evaluate(go); await pg.waitForTimeout(350);
    const r = await audit(label);
    eq([r.sideways <= 0, r.offenders], [true, []], label + ": no sideways scroll, nothing past the edge " + (r.offenders.length ? JSON.stringify(r.offenders) : ""));
    eq(r.small, [], label + ": no text under 12px " + (r.small.length ? JSON.stringify(r.small) : ""));
  }
  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
