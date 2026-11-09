"use strict";
/* The app's own rules for the two things a shared link has to agree with the cafe page about: which drink to recommend
   and what kind of place it is. They are cut out of the app's scripts rather than copied, so they cannot drift: on 9 Nov a
   copy of the first called a cafe tea that the app draws as boba, and would have recommended drinks given a thumbs down.
   If one of the markers below moves, this throws, and the tests and the deploy stop rather than publish a guess. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

/** The app's source from `from` up to `to`. @param {string} file @param {string} from @param {string} to */
function cut(file, from, to) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const a = src.indexOf(from);
  const b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error("app-rules: " + file + " no longer has “" + (a < 0 ? from : to) + "”");
  return src.slice(a, b);
}

const code =
  cut("js/core.js", "const DRINK_ORDER_FIELDS", "function syncDrinkSummary") +
  cut("js/rank.js", "function drinkVerdict", "/* Trim on a word boundary") +
  cut("js/detail.js", "const CARD_KINDS", "/* What a kind is called") +
  "\n;({ CARD_KINDS, CARD_VESSELS, EMOJI_KIND, cafeKind, topDrinkAt })";

module.exports = vm.runInNewContext(code, {});
