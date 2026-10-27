#!/usr/bin/env node
"use strict";
/* Writes c/<id>.html for every public cafe in cafes.json: a page that exists only so a shared link previews as the
   cafe. Messages, Instagram and the rest read a link's title and picture from the page it points at, and the app is
   one static index.html, so every ?cafe= link previewed as "JL Cafe Project" and the app icon. Each page carries
   the cafe's name and place, its verdict and what to order, then sends the browser straight on to ?cafe=<id>.

   Private spots never get a page: they are somebody's home. Nothing here is not already in the public cafes.json.
   Made at deploy by scripts/build-site.js, from the cafes.json being published (the nightly one on the `data`
   branch), so the pages are never older than the data. `node scripts/share-pages.js` writes them into c/ here for a
   look; git ignores that folder. A link to a cafe newer than the last deploy has no page yet; 404.html sends it on
   to the app all the same. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE = "https://jorgelightning.github.io/cafeProject/";
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** @param {any} s */
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}
/** The verdict, as the app words it. @param {any} c */
function verdict(c) {
  if (c.wish) return "On the want-to-try list";
  const r = c.rating || 0;
  return r >= 4 ? "Loved it" : r === 3 ? "It was fine" : r >= 1 ? "Not for me" : "";
}
/** The drink ordered most there. @param {any} c */
function topDrink(c) {
  let best = null,
    bn = 0;
  (c.drinks || []).forEach(d => {
    const name = String(d.n || "").trim();
    if (!name) return;
    const n = Array.isArray(d.orders) && d.orders.length
      ? d.orders.reduce((t, o) => t + Math.max(1, parseInt(o.qty, 10) || 1), 0)
      : Math.max(parseInt(d.count, 10) || 0, (d.dates || []).length, 1);
    if (n > bn || (n === bn && best && name.localeCompare(best) < 0)) {
      bn = n;
      best = name;
    }
  });
  return best;
}
/** The page for one cafe, or null when it must not have one. @param {any} c */
function page(c) {
  if (!c || c.custom || !SAFE_ID.test(String(c.id || ""))) return null;
  const name = String(c.name || "").trim();
  if (!name) return null;
  const area = String(c.area || "").trim();
  const title = name + (area ? " · " + area : "");
  const top = topDrink(c);
  const desc = [verdict(c), top && !c.wish ? "Get the " + top : ""].filter(Boolean).concat("JL Cafe Project").join(" · ");
  const app = "../?cafe=" + c.id;
  const url = SITE + "c/" + c.id;
  return (
    "<!doctype html>\n" +
    '<html lang="en"><head><meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    "<title>" + esc(title) + "</title>\n" +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    '<meta name="robots" content="noindex">\n' +
    '<link rel="canonical" href="' + esc(url) + '">\n' +
    '<meta property="og:type" content="website">\n' +
    '<meta property="og:site_name" content="JL Cafe Project">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n' +
    '<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:url" content="' + esc(url) + '">\n' +
    '<meta property="og:image" content="' + SITE + 'icon-512.png">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<meta http-equiv="refresh" content="0; url=' + esc(app) + '">\n' +
    "</head><body>\n" +
    "<script>location.replace(" + JSON.stringify(app) + ");</script>\n" +
    '<p><a href="' + esc(app) + '">Open ' + esc(name) + " in JL Cafe Project</a></p>\n" +
    "</body></html>\n"
  );
}
/** Writes every page into `dir` and removes pages for cafes that are gone or now private. @returns {number} */
function build(cafes, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const keep = new Set();
  (Array.isArray(cafes) ? cafes : []).forEach(c => {
    const html = page(c);
    if (!html) return;
    const file = c.id + ".html";
    keep.add(file);
    const p = path.join(dir, file);
    /* unchanged pages are left alone, so the nightly commit only carries what really changed */
    if (!fs.existsSync(p) || fs.readFileSync(p, "utf8") !== html) fs.writeFileSync(p, html);
  });
  fs.readdirSync(dir).forEach(f => {
    if (f.endsWith(".html") && !keep.has(f)) fs.unlinkSync(path.join(dir, f));
  });
  return keep.size;
}

module.exports = { build, page, verdict, topDrink };

if (require.main === module) {
  const cafes = JSON.parse(fs.readFileSync(path.join(ROOT, "cafes.json"), "utf8"));
  const n = build(cafes, path.join(ROOT, "c"));
  console.log("share pages: " + n + " written to c/");
}
