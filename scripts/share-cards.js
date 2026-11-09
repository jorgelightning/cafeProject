#!/usr/bin/env node
"use strict";
/* Draws c/<id>.jpg for every public cafe: the picture a shared link previews with (the owner's choice of four, 9 Nov).

   Every link previewed with the app's icon, so a link to one cafe looked like a link to any other. Now each gets a
   poster in the look of its cafe page: the colour and drawing of what the place serves, its name large, the verdict, the
   area and what to get. Chat apps show it about 300px wide, so the type is large and only a long name shrinks.

   The colours, drawings and the rules for what kind of place a cafe is come from the app's own code (app-rules.js), so a
   poster cannot disagree with the cafe page; tests/share-pages.js compares every cafe against the running app.

   It needs a browser, so it is a step of its own in deploy.yml, after the site is built and from the same cafes.json.
   Private spots never get one, for the same reason they never get a page, and nothing on a poster is not already in the
   public cafes.json. A poster that cannot be drawn falls back to the app's icon, so a link never previews as a broken
   picture.

     node scripts/share-cards.js [--site <folder holding cafes.json and c/>]

   Without --site it reads the repo's cafes.json and writes into c/, for a look; git ignores that folder. */
const fs = require("fs");
const path = require("path");
const { page, verdict, orderLine } = require("./share-pages.js");
const KINDS = require("./app-rules.js");

const ROOT = path.join(__dirname, "..");
const W = 1200,
  H = 630;
const DOTS = { "Loved it": "#5fd39a", "It was fine": "#e7b75a", "Not for me": "#ef8a80", "On the want-to-try list": "#b9a2f0" };
/* cream type starts on the top left of the fade, and on these four that colour is too pale to read it (under 3:1) */
const PALE = new Set(["boba", "gelato", "pastry", "tea"]);

/** What a cafe's page is drawn as (markKind in js/detail.js). @param {any} c */
function kindOf(c) {
  return (c.emoji && KINDS.EMOJI_KIND[c.emoji]) || KINDS.cafeKind(c);
}
/** @param {any} s */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
/** The poster for one cafe, as a page to photograph. @param {any} c */
function posterHTML(c) {
  const kind = kindOf(c);
  const k = KINDS.CARD_KINDS[kind] || KINDS.CARD_KINDS.coffee;
  const v = KINDS.CARD_VESSELS[k.vessel] || KINDS.CARD_VESSELS.cup;
  const area = String(c.area || "").trim();
  const said = verdict(c);
  const line = orderLine(c);
  const rings = [130, 205, 285, 370, 460, 555].map(r => '<circle cx="945" cy="315" r="' + r + '"/>').join("");
  const paths = v.main.map(p => '<path d="' + p + '"/>').join("") + v.faint.map(p => '<path opacity=".6" d="' + p + '"/>').join("");
  return (
    '<!doctype html><meta charset="utf-8"><style>' +
    "html,body{margin:0}" +
    "#c{position:relative;width:" + W + "px;height:" + H + "px;overflow:hidden;color:#f6efe2;font-family:'Liberation Sans','DejaVu Sans',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;background:linear-gradient(135deg," + k.c1 + "," + k.c2 + ")}" +
    "#sc{position:absolute;inset:0;background:linear-gradient(90deg,rgba(14,14,16,.3),rgba(14,14,16,0) 70%)}" +
    "svg{position:absolute;fill:none}" +
    "#ri{left:0;top:0;stroke:rgba(246,239,226,.13);stroke-width:2}" +
    "#ve{left:775px;top:140px;stroke:#f6efe2;stroke-width:4.5;stroke-linecap:round;stroke-linejoin:round}" +
    "#col{position:absolute;left:72px;top:64px;bottom:64px;width:660px;display:flex;flex-direction:column;overflow:hidden}" +
    "#col>*{flex:none}" +
    "#p{align-self:flex-start;display:flex;align-items:center;gap:14px;padding:12px 26px 12px 20px;border-radius:40px;background:rgba(14,14,16,.42);font-size:36px;font-weight:700}" +
    "#p i{width:24px;height:24px;border-radius:50%}" +
    "#n{font-size:92px;font-weight:800;line-height:1.02;letter-spacing:-.03em;overflow-wrap:normal}" +
    "#p+#n{margin-top:36px}" +
    "#a{margin-top:16px;font-size:42px;font-weight:600;opacity:.85;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#d{margin-top:auto;font-size:38px;font-weight:700;line-height:1.2;overflow-wrap:anywhere}" +
    "</style>" +
    '<div id="c" data-k="' + kind + '">' +
    (PALE.has(kind) ? '<div id="sc"></div>' : "") +
    '<svg id="ri" viewBox="0 0 1200 630" width="1200" height="630">' + rings + "</svg>" +
    '<svg id="ve" viewBox="0 0 120 120" width="340" height="340">' + paths + "</svg>" +
    '<div id="col">' +
    (said ? '<div id="p"><i style="background:' + DOTS[said] + '"></i>' + esc(said) + "</div>" : "") +
    '<div id="n">' + esc(c.name) + "</div>" +
    (area ? '<div id="a">' + esc(area) + "</div>" : "") +
    (line ? '<div id="d">' + esc(line) + "</div>" : "") +
    "</div></div>"
  );
}
/** Puts one poster on `pg` and fits it: the drink line to two lines, then the name down until everything has room.
    @returns {Promise<{fits: boolean}>} whether all of it fits without being cut */
async function setPoster(pg, c) {
  await pg.setContent(posterHTML(c), { waitUntil: "load" });
  return pg.evaluate(() => {
    const $ = id => document.getElementById(id);
    const col = $("col"),
      n = $("n"),
      d = $("d");
    const size = e => parseFloat(getComputedStyle(e).fontSize);
    let drinkFits = true;
    if (d) {
      const tall = () => d.scrollHeight > Math.ceil(size(d) * 1.2 * 2) + 1;
      while (tall() && size(d) > 28) d.style.fontSize = size(d) - 2 + "px";
      drinkFits = !tall();
    }
    const room = () => {
      const above = ($("a") || n).getBoundingClientRect().bottom;
      return d ? d.getBoundingClientRect().top - above >= 20 : above <= col.getBoundingClientRect().bottom;
    };
    /* no breaks inside a word while fitting, so one long word makes the name smaller rather than splitting it */
    const over = () => n.scrollWidth > n.clientWidth + 1 || !room();
    while (over() && size(n) > 44) n.style.fontSize = size(n) - 2 + "px";
    const nameFits = !over();
    n.style.overflowWrap = "anywhere";
    return { fits: nameFits && drinkFits };
  });
}
/** Draws a poster for every public cafe into `dir`. @param {any[]} cafes @param {string} dir @param {string} [fallback] a
    picture to use for one that cannot be drawn @returns {Promise<{drawn: number, fell: string[]}>} */
async function drawCards(cafes, dir, fallback) {
  const { chromium } = require("playwright");
  const exe = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const res = { drawn: 0, fell: [] };
  try {
    const pg = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    fs.mkdirSync(dir, { recursive: true });
    for (const c of Array.isArray(cafes) ? cafes : []) {
      if (!page(c)) continue;
      const file = path.join(dir, c.id + ".jpg");
      try {
        await setPoster(pg, c);
        /* JPEG: the fades came to about 420 KB each as PNG, and some chat apps drop a link's picture at that size */
        await pg.screenshot({ path: file, type: "jpeg", quality: 86, clip: { x: 0, y: 0, width: W, height: H } });
        res.drawn++;
      } catch (e) {
        res.fell.push(c.id);
        fs.copyFileSync(fallback || path.join(ROOT, "icon-512.png"), file);
      }
    }
  } finally {
    await browser.close();
  }
  return res;
}

module.exports = { drawCards, setPoster, posterHTML, kindOf, W, H };

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf("--site");
  const site = i >= 0 ? path.resolve(ROOT, args[i + 1]) : ROOT;
  const cafes = JSON.parse(fs.readFileSync(path.join(site, "cafes.json"), "utf8"));
  drawCards(cafes, path.join(site, "c"))
    .then(r => console.log("share cards: " + r.drawn + " drawn" + (r.fell.length ? ", " + r.fell.length + " fell back to the icon" : "")))
    .catch(e => {
      console.error(String(e && e.message ? e.message : e));
      process.exit(1);
    });
}
