/* Reads styles.css into its rules, each with the at-rule context it sits in (top level, or the @media / @supports it
   is inside). Shared by tests/css-shape.js (no selector stated twice in one context) and anything else that needs to
   see the stylesheet as rules rather than text. A small reader for this file, not a general CSS parser: it knows
   comments, strings, nested blocks and @keyframes, which is everything styles.css uses. */
const fs = require("fs"),
  path = require("path");

/** @returns {{ctx: string, sel: string, body: string, start: number, end: number}[]} rules in file order; start/end
 *  span the whole rule, selector to closing brace */
function cssRules(src) {
  const out = [];
  function walk(from, to, ctx) {
    let i = from;
    while (i < to) {
      /* skip whitespace and comments */
      while (i < to) {
        if (/\s/.test(src[i])) i++;
        else if (src.startsWith("/*", i)) i = src.indexOf("*/", i + 2) + 2;
        else break;
      }
      if (i >= to) break;
      /* the prelude runs to the next { or ; at this depth */
      const start = i;
      let q = "";
      while (i < to) {
        const ch = src[i];
        if (q) { if (ch === "\\") i++; else if (ch === q) q = ""; i++; continue; }
        if (ch === '"' || ch === "'") { q = ch; i++; continue; }
        if (src.startsWith("/*", i)) { i = src.indexOf("*/", i + 2) + 2; continue; }
        if (ch === "{" || ch === ";") break;
        i++;
      }
      const prelude = src.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
      if (src[i] === ";") { i++; continue; } /* @import, @charset */
      /* the matching close brace */
      let depth = 0, j = i;
      q = "";
      for (; j < to; j++) {
        const ch = src[j];
        if (q) { if (ch === "\\") j++; else if (ch === q) q = ""; continue; }
        if (ch === '"' || ch === "'") { q = ch; continue; }
        if (src.startsWith("/*", j)) { j = src.indexOf("*/", j + 2) + 1; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") { depth--; if (depth === 0) break; }
      }
      if (/^@(media|supports|layer|container)\b/.test(prelude)) walk(i + 1, j, (ctx ? ctx + " " : "") + prelude);
      else if (/^@/.test(prelude)) { /* @keyframes, @font-face: their insides are not selectors */ }
      else out.push({ ctx, sel: prelude, body: src.slice(i + 1, j), start, end: j + 1 });
      i = j + 1;
    }
  }
  walk(0, src.length, "");
  return out;
}
/* A selector list in one canonical spelling, so ".a,.b" and ".a, .b" are the same. */
const normSel = s => s.split(",").map(x => x.trim().replace(/\s*([>+~])\s*/g, "$1").replace(/\s+/g, " ")).join(",");

function readCss(root) {
  return fs.readFileSync(path.join(root || path.join(__dirname, ".."), "styles.css"), "utf8");
}
module.exports = { cssRules, normSel, readCss };

if (require.main === module) {
  const rules = cssRules(readCss());
  const seen = new Map();
  rules.forEach(r => {
    const k = r.ctx + " || " + normSel(r.sel);
    seen.set(k, (seen.get(k) || 0) + 1);
  });
  const dups = [...seen].filter(([, n]) => n > 1);
  console.log(rules.length + " rules; " + dups.length + " selectors stated more than once in the same context");
  if (process.argv.includes("--list")) dups.forEach(([k, n]) => console.log("  " + n + "x  " + k));
}
