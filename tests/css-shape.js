/* The shape of styles.css (engineering audit, 27 Oct). No browser.

   Each audit batch used to append its changes as new rules at the end of the file, so 67 selectors came to be stated
   two, three or four times in the same context (".card" four times), and what a card looked like was decided by
   whichever came last. They were folded into one rule each, and scripts/css-diff.js measured the result against the
   stylesheet before it: no computed-style difference on any element in 276 states (23 screens, both themes, visitor
   and owner, three widths). This keeps it that way — change the rule that is there instead of adding another.

   Not done: @layer. Layer order outranks specificity, so putting 982 rules into layers re-decides every contest the
   file settles by specificity today (".grid.compact-list .card" over ".card", for one), and the !important it would
   retire are mode switches and [hidden] that must win whatever happens. The count of those is held here instead. */
const { checker, ROOT } = require("./harness");
const { eq, done } = checker();
const { cssRules, normSel, readCss } = require("../scripts/css-rules");

const src = readCss(ROOT).replace(/\r\n/g, "\n");
const rules = cssRules(src);
eq(rules.length > 900, true, "the stylesheet is read as rules (" + rules.length + ")");
/* every opening brace belongs to a rule or an at-rule the reader walked: nothing it skipped by mistake */
const braces = (src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"|'[^']*'/g, "").match(/\{/g) || []).length;
const atBlocks = (src.replace(/\/\*[\s\S]*?\*\//g, "").match(/@(media|supports|layer|container|keyframes|font-face)\b[^{]*\{/g) || []).length;
const kfInner = [...src.matchAll(/@keyframes[^{]*\{([\s\S]*?\})\s*\}/g)].reduce((n, m) => n + (m[1].match(/\{/g) || []).length, 0);
eq(rules.length + atBlocks + kfInner, braces, "…all of it, with no block the reader stepped over");

const seen = new Map();
rules.forEach(r => {
  const k = (r.ctx ? r.ctx + " " : "") + normSel(r.sel);
  seen.set(k, (seen.get(k) || 0) + 1);
});
eq([...seen].filter(([, n]) => n > 1).map(([k, n]) => n + "x " + k), [],
   "no selector is stated twice in the same context: one rule says what a thing looks like");

const important = (src.replace(/\/\*[\s\S]*?\*\//g, "").match(/!important/g) || []).length;
eq(important <= 15, true, "!important stays at the mode switches, [hidden], reduced motion and the Maps bubble (" + important + ", at most 15)");

process.exit(done() ? 0 : 1);
