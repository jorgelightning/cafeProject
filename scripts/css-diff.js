/* Did a stylesheet change move anything? Compares the computed style of every element, and of its ::before and
   ::after, under styles.css as it is in a git ref against the working copy, across the app's screens, both themes,
   visitor and owner, at a phone, a tablet and a laptop width. For refactors that are meant to change nothing — folding
   duplicate rules, reordering, renaming tokens — "nothing" is then measured rather than hoped.

     node scripts/css-diff.js                               against HEAD
     node scripts/css-diff.js main                          against another ref
     CSS_DIFF_ONLY="light visitor" node scripts/css-diff.js only the states whose label contains that

   The page is loaded once per width and each state is drawn once; only the stylesheet is swapped between the two
   readings, so the DOM is the same element for element. Transitions are finished and animations stopped before each
   reading. What it cannot see: :hover and :focus (nothing is hovered), and screens not in STATES below. */
const { serve, launch, ready, ROOT } = require("../tests/harness");
const { execSync } = require("child_process");

const ref = process.argv[2] || "HEAD";
/* a ref, or a saved copy of the stylesheet (a file path) */
const OLD = require("fs").existsSync(ref) ? require("fs").readFileSync(ref, "utf8")
  : execSync("git show " + ref + ":styles.css", { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });

/* Each state: a name and what to run in the page to get there. Every one starts from show("list"). */
const RICH = "cafes.filter(x => !x.wish && x.drinks && x.drinks.length).sort((a, b) => b.drinks.length - a.drinks.length)[0]";
const STATES = [
  ["list rows", () => { setListLayout(true); show("list"); }],
  ["list cards", () => { setListLayout(false); show("list"); }],
  ["list guide", () => { setListLayout(true); show("list"); const g = document.querySelector("[data-on=setGuide]"); if (g) g.click(); }],
  ["list want", () => { setListLayout(true); show("list"); setListTab("want"); }],
  ["list no match", () => { show("list"); document.getElementById("q").value = "zzzz no such cafe"; renderList(); }],
  ["map", () => { show("map"); }],
  ["map panel", () => { show("map"); toggleMapPanel(); }],
  ["detail", () => { openDetail(RICH_().id, "list"); }],
  ["detail drink open", () => { openDetail(RICH_().id, "list"); const t = document.querySelector("#pane-detail [data-on=toggleDrinkHistory]"); if (t) t.click(); const m = document.querySelector("#pane-detail [data-on=openDrinkMenu]"); if (m) m.click(); }],
  ["detail wish", () => { const c = cafes.find(x => x.wish); if (c) openDetail(c.id, "list"); }],
  ["detail branches", () => { const c = cafes.find(x => x.brand && cafes.filter(y => y.brand === x.brand).length > 1); if (c) openDetail(c.id, "list"); }],
  ["go board", () => { show("compare"); }],
  ["rank a pair", () => { if (isAdmin) { show("compare"); chaserOpen(); } }],
  ["stats you", () => { show("stats"); setStatsTab("you"); }],
  ["stats habits", () => { show("stats"); setStatsTab("habits"); }],
  ["stats money", () => { show("stats"); setStatsTab("money"); }],
  ["settings", () => { show("settings"); }],
  ["form new", () => { if (isAdmin) { editId = null; _formSnap = null; openForm(); } }],
  ["form edit", () => { if (isAdmin) { _formSnap = null; openForm(RICH_().id); } }],
  ["quick cup", () => { if (isAdmin) { openDetail(RICH_().id, "list"); openQuickCup(0); } }],
  ["tidy up", () => { if (isAdmin) { show("settings"); const t = document.querySelector("#tidy-grid .tidyb"); if (t) t.click(); } }],
  ["peek", () => { show("map"); const c = cafes.find(x => !x.wish && x.lat != null); if (c) openPeek(c.id); }],
  ["welcome", () => { show("map"); openWelcome(); }],
  /* what is hidden until something happens: drawn here on purpose, or no reading would ever see it */
  ["rule warning", () => { show("map"); const w = document.getElementById("rule-warn"); w.hidden = false; document.getElementById("rule-warn-text").innerHTML = RULE_WARN_TEXT.map + " " + RULE_WARN_TEXT.read; }],
  ["world mode", () => { show("map"); document.querySelectorAll(".mapbox").forEach(m => m.classList.add("worlding")); }],
  ["update bar, toast", () => { show("map"); document.getElementById("updatebar").classList.add("show"); const t = document.getElementById("toast"); t.textContent = "Saved"; t.classList.add("show"); }],
  ["unhidden detail", () => { openDetail(RICH_().id, "list"); UNHIDE("#pane-detail"); }],
  ["unhidden form", () => { if (isAdmin) { _formSnap = null; openForm(RICH_().id); UNHIDE("#pane-form"); } }],
  ["unhidden settings", () => { show("settings"); UNHIDE("#pane-settings"); }],
];
/* undone before every state, so one state's forcing never leaks into the next */
const RESET = () => {
  (window.__unhid || []).forEach(e => (e.hidden = true)); window.__unhid = [];
  document.getElementById("rule-warn").hidden = true;
  document.getElementById("updatebar").classList.remove("show");
  document.getElementById("toast").classList.remove("show");
  document.querySelectorAll(".mapbox").forEach(m => m.classList.remove("worlding"));
};
const WIDTHS = [[375, 812], [820, 1180], [1440, 900]];

async function snapshot(pg) {
  return pg.evaluate(() => {
    document.getAnimations().forEach(a => { try { if (a instanceof CSSTransition) a.finish(); else a.cancel(); } catch (e) { a.cancel(); } });
    const out = new Map();
    const path = el => { const p = []; for (let e = el; e && e !== document.body; e = e.parentElement) p.unshift(e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + ":" + [...e.parentElement.children].indexOf(e)); return p.join(">"); };
    /* one string per element: compared whole, and only taken apart when it differs */
    const read = (cs, k) => { let t = ""; for (let i = 0; i < cs.length; i++) t += cs[i] + ": " + cs.getPropertyValue(cs[i]) + "\n"; out.set(k, t); };
    /* rendered elements only: a hidden pane is read in the state that shows it, and one shown under only one of
       the two stylesheets still appears below, as "only under" that one */
    document.querySelectorAll("body *").forEach(el => {
      if (!el.checkVisibility()) return;
      const key = path(el);
      read(getComputedStyle(el), key);
      for (const pe of ["::before", "::after"]) {
        const cs = getComputedStyle(el, pe);
        if (cs.content && cs.content !== "none" && cs.content !== "normal") read(cs, key + pe);
      }
    });
    window.__snap.push(out);
  });
}
async function useCss(pg, which) {
  await pg.evaluate(w => new Promise(res => {
    const l = document.querySelector("link[rel=stylesheet][data-orig]") || document.querySelector('link[rel=stylesheet][href*="styles"]');
    if (!l.dataset.orig) l.dataset.orig = l.getAttribute("href");
    const href = w === "old" ? "__old.css" : l.dataset.orig;
    if (l.getAttribute("href") === href) return res();
    l.onload = () => res(); l.onerror = () => res();
    l.setAttribute("href", href);
  }), which);
  await pg.waitForTimeout(80);
}

(async () => {
  const srv = await serve();
  const b = await launch();
  const all = [];
  let states = 0;
  const only = process.env.CSS_DIFF_ONLY;
  /* one page per width, all at once */
  await Promise.all(WIDTHS.map(async ([w, h]) => {
    /* no service worker: it would answer the swapped stylesheet itself, out of reach of the route below */
    const ctx = await b.newContext({ viewport: { width: w, height: h }, serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => {
      const u = r.request().url();
      if (u.startsWith(srv.origin + "/__old.css")) return r.fulfill({ contentType: "text/css", body: OLD });
      return u.startsWith(srv.origin) ? r.continue() : r.abort();
    });
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await ready(pg);
    await pg.evaluate(async rich => {
      cafes = await (await fetch("cafes.json")).json();
      window.RICH_ = () => (0, eval)(rich);
      window.UNHIDE = root => { window.__unhid = [...document.querySelectorAll(root + " [hidden]")]; window.__unhid.forEach(e => (e.hidden = false)); };
    }, RICH);
    for (const theme of ["light", "dark"]) for (const admin of [false, true]) for (const [name, go] of STATES) {
      const label = w + " " + theme + " " + (admin ? "owner" : "visitor") + " " + name;
      if (only && !label.includes(only)) continue;
      states++;
      try {
        await pg.evaluate(([t, a, fn, reset]) => {
          window.__snap = [];
          (0, eval)("(" + reset + ")")();
          setTheme(t); isAdmin = a; applyMode();
          if (typeof closePeek === "function") try { closePeek(); } catch (e) {}
          _formSnap = null; show("list");
          (0, eval)("(" + fn + ")")();
        }, [theme, admin, go.toString(), RESET.toString()]);
      } catch (e) { all.push(label + "  (could not reach: " + String(e.message || e).split("\n")[0] + ")"); continue; }
      await pg.waitForTimeout(120);
      await useCss(pg, "old"); await snapshot(pg);
      await useCss(pg, "new"); await snapshot(pg);
      const diffs = await pg.evaluate(() => {
        const [a, bb] = window.__snap, d = [];
        for (const [k, o] of a) {
          const n = bb.get(k);
          if (n === undefined) { d.push(k + " :: only under the old stylesheet"); continue; }
          if (o === n) continue;
          const ol = o.split("\n"), nl = n.split("\n");
          ol.forEach((l, i) => { if (l !== nl[i]) d.push(k + " :: " + l + "  ->  " + (nl[i] || "").replace(/^[^:]*: /, "")); });
        }
        for (const k of bb.keys()) if (!a.has(k)) d.push(k + " :: only under the new stylesheet");
        return d;
      });
      diffs.forEach(x => all.push(label + "  " + x));
      process.stdout.write(diffs.length ? "x" : ".");
    }
    await ctx.close();
  }));
  process.stdout.write("\n");
  const reached = all.filter(x => /could not reach/.test(x));
  const real = all.filter(x => !/could not reach/.test(x));
  reached.forEach(x => console.log(x));
  if (!real.length) console.log("no computed-style difference against " + ref + " in " + states + " states");
  else {
    /* one change seen on many elements in many states is one line: what changed, and how often */
    const kinds = new Map();
    real.forEach(x => { const k = x.slice(x.indexOf(" :: ") + 4); kinds.set(k, (kinds.get(k) || 0) + 1); });
    console.log(real.length + " differences, " + kinds.size + " distinct:");
    [...kinds].sort((p, q) => q[1] - p[1]).slice(0, 80).forEach(([k, n]) => console.log("  " + String(n).padStart(6) + " x  " + k));
    console.log("the first in full:");
    real.slice(0, 40).forEach(x => console.log("  " + x));
  }
  await b.close(); srv.close();
  process.exit(real.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
