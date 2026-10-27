/* Unit tests for js/lib/text.js — Node only, no browser, no server: `node --test tests/unit/`.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, safeUrl, editDistance, fmtDate, orderOptsText } from "../../js/lib/text.js";

test("esc: every character that can end an attribute or open a tag", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  assert.equal(esc("Joe's"), "Joe&#39;s", "an apostrophe in a cafe name");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
  assert.equal(esc(0), "0", "a number is text, not nothing");
});

test("esc: an action's JSON arguments survive the round trip through an attribute", () => {
  /* core.js act() writes data-args="<esc(JSON)>"; the browser decodes the entities and the dispatcher JSON.parses */
  const args = ["Joe's \"best\" <cafe>", "list"];
  const attr = esc(JSON.stringify(args));
  assert.equal(/["'<>]/.test(attr), false, "nothing raw left to break out of the attribute");
  const decoded = attr.replace(/&(quot|#39|lt|gt|amp);/g, (m, k) => ({ quot: '"', "#39": "'", lt: "<", gt: ">", amp: "&" })[k]);
  assert.deepEqual(JSON.parse(decoded), args);
});

test("safeUrl: http(s) and inline images only, and nothing that ends a url()", () => {
  assert.equal(safeUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
  assert.equal(safeUrl("  http://x.test/p  "), "http://x.test/p", "trimmed");
  assert.equal(safeUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("JaVaScRiPt:alert(1)"), "");
  assert.equal(safeUrl("data:text/html,<script>"), "", "data: that is not an image");
  assert.equal(safeUrl("//evil.test/x"), "", "protocol-relative");
  assert.equal(safeUrl("https://x.test/a b'c\").png"), "https://x.test/a%20b%27c%22%29.png");
  assert.equal(safeUrl(null), "");
});

test("editDistance: Levenshtein, and it stops counting past max", () => {
  assert.equal(editDistance("latte", "latte", 2), 0);
  assert.equal(editDistance("latte", "latt", 2), 1);
  assert.equal(editDistance("hojicha", "hojica", 2), 1);
  assert.equal(editDistance("kitten", "sitting", 3), 3);
  assert.equal(editDistance("kitten", "sitting", 2), 3, "past max it says max + 1, not the true distance");
  assert.equal(editDistance("a", "abcdef", 2), 3, "a length gap alone rules it out");
  assert.equal(editDistance(null, "", 1), 0);
});

test("fmtDate: ISO dates read as Mon D, YYYY; anything else is left alone", () => {
  assert.equal(fmtDate("2026-09-01"), "Sep 1, 2026");
  assert.equal(fmtDate("2026-12-25T10:00:00Z"), "Dec 25, 2026", "a timestamp keeps its date");
  assert.equal(fmtDate(""), "");
  assert.equal(fmtDate("last week"), "last week");
});

test("orderOptsText: one line in counter order — size, milk, sweetness, ice", () => {
  assert.equal(orderOptsText({ size: "8 oz", milk: "Oat", sweet: "0%", ice: "Warm" }), "8 oz · oat · no sugar · warm");
  assert.equal(orderOptsText({ sweet: "50%" }), "50% sweet");
  assert.equal(orderOptsText({}), "");
  assert.equal(orderOptsText(null), "");
});
