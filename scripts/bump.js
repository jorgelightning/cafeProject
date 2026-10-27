#!/usr/bin/env node
"use strict";
/* Moves every version stamp forward in one step: `npm run bump` (next number) or `npm run bump -- 120`.

   A release used to mean editing the ?v= on each script and stylesheet tag in index.html (14 of them) and CACHE_V
   and ASSET_V in sw.js by hand, and a missed one kept a phone on the old file. This rewrites them all, then fails if
   any stamp still carries the old number or the counts are not what they were. tests/cache-version.js checks the
   result the same way on every run. */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const INDEX = path.join(ROOT, "index.html");
const SW = path.join(ROOT, "sw.js");

function main(argv) {
  const html = fs.readFileSync(INDEX, "utf8");
  const sw = fs.readFileSync(SW, "utf8");
  const stamps = html.match(/\?v=(\d+)/g) || [];
  if (!stamps.length) throw new Error("index.html has no ?v= stamps");
  const nums = [...new Set(stamps.map(s => +s.slice(3)))];
  if (nums.length !== 1) throw new Error("index.html stamps disagree before the bump: " + nums.join(", "));
  const from = nums[0];
  const to = argv[0] ? parseInt(argv[0], 10) : from + 1;
  if (!(to > from)) throw new Error("the new version (" + argv[0] + ") must be a number above " + from);

  const swCache = sw.match(new RegExp('CACHE_V = "cafemap-v' + from + '"', "g")) || [];
  const swAsset = sw.match(new RegExp('ASSET_V = "\\?v=' + from + '"', "g")) || [];
  if (swCache.length !== 1 || swAsset.length !== 1) throw new Error("sw.js is not at v" + from + " (CACHE_V or ASSET_V)");

  const html2 = html.replace(new RegExp("\\?v=" + from + "\\b", "g"), "?v=" + to);
  const sw2 = sw
    .replace('CACHE_V = "cafemap-v' + from + '"', 'CACHE_V = "cafemap-v' + to + '"')
    .replace('ASSET_V = "?v=' + from + '"', 'ASSET_V = "?v=' + to + '"');

  const left = (html2.match(new RegExp("\\?v=" + from + "\\b", "g")) || []).length + (sw2.match(new RegExp("v" + from + "\\b", "g")) || []).length;
  const now = (html2.match(new RegExp("\\?v=" + to + "\\b", "g")) || []).length;
  if (left || now !== stamps.length) throw new Error("bump left " + left + " old stamps, or wrote " + now + " of " + stamps.length);

  fs.writeFileSync(INDEX, html2);
  fs.writeFileSync(SW, sw2);
  return { from, to, stamps: now };
}

module.exports = { main };

if (require.main === module) {
  try {
    const r = main(process.argv.slice(2));
    console.log("v" + r.from + " → v" + r.to + ": index.html " + r.stamps + " stamps, sw.js CACHE_V and ASSET_V; nothing left at v" + r.from);
  } catch (e) {
    console.error("bump: " + e.message);
    process.exit(1);
  }
}
