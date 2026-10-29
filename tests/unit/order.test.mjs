/* Unit tests for js/lib/order.js — Node only, no browser, no server: `node --test tests/unit/`.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDER_LANGS, SWEET_LEVELS, sweetLevel, orderLines, orderLangFor } from "../../js/lib/order.js";

const words = (o, lang) => orderLines(o, lang).map(l => l.word);

test("orderLines: English is the order as logged, in the order a counter hears it", () => {
  const o = { ice: "Warm", sweet: "0%", milk: "Oat", size: "12 oz", p: "8.14", date: "2026-10-16" };
  assert.deepEqual(words(o, "en"), ["12 oz", "Oat milk", "No sugar", "Warm"], "size, milk, sugar, ice; price and date are not the order");
  assert.deepEqual(orderLines(o, "en").map(l => l.gloss), ["", "", "", ""], "English needs no English under it");
  assert.deepEqual(words({ milk: "None" }, "en"), ["No milk"]);
  assert.deepEqual(words({ milk: "Half & half" }, "en"), ["Half & half"], "not Half & half milk");
  assert.deepEqual(words({ sweet: "25%" }, "en"), ["25% sugar"], "English keeps the exact share");
  assert.deepEqual(orderLines({}, "en"), [], "a cup with no options has no lines");
  assert.deepEqual(orderLines(null, "zh"), []);
});

test("orderLines: Taipei's words, with the English under each", () => {
  const o = { size: "16 oz", milk: "Oat", sweet: "0%", ice: "Less ice" };
  const l = orderLines(o, "zh");
  assert.deepEqual(l.map(x => x.word), ["470 ml", "燕麥奶", "無糖", "少冰"]);
  assert.deepEqual(l.map(x => x.gloss), ["16 oz", "Oat milk", "No sugar", "Less ice"], "the gloss is what you logged");
  assert.deepEqual(l.map(x => x.lang), ["zh-Hant", "zh-Hant", "zh-Hant", "zh-Hant"], "tagged, so a phone draws Chinese glyphs");
  assert.deepEqual(words({ ice: "Warm" }, "zhs"), ["温"], "simplified for mainland China");
  assert.deepEqual(words({ ice: "Warm" }, "zh"), ["溫"]);
  assert.deepEqual(words({ ice: "Less ice", milk: "Soy" }, "ja"), ["豆乳", "氷少なめ"]);
  assert.deepEqual(words({ ice: "No ice", sweet: "0%" }, "vi"), ["Không đường", "Không đá"]);
});

test("orderLines: a word the table does not have stays in English, so the card never says what you did not order", () => {
  const l = orderLines({ milk: "Half & half", size: "Large", ice: "Shaken" }, "zh");
  assert.deepEqual(l.map(x => [x.word, x.gloss, x.lang]), [
    ["Large", "", "en"],
    ["Half & half", "", "en"],
    ["Shaken", "", "en"],
  ]);
  assert.deepEqual(words({ ice: "Less ice" }, "xx"), ["Less ice"], "an unknown language is English");
});

test("orderLines: ounces become millilitres to the nearest 10, the way cups are printed", () => {
  assert.deepEqual(["8 oz", "12 oz", "16 oz", "20 oz", "32 oz"].map(s => words({ size: s }, "vi")[0]), ["240 ml", "350 ml", "470 ml", "590 ml", "950 ml"]);
});

test("sweetLevel: always a level a counter takes", () => {
  for (let p = 0; p <= 100; p++) assert.ok(SWEET_LEVELS.includes(sweetLevel(p)), p + "% gave " + sweetLevel(p));
  assert.equal(sweetLevel(0), 0, "none is none");
  assert.equal(sweetLevel(100), 100, "full is full");
  assert.equal(sweetLevel(50), 50, "a level asks for itself");
  assert.equal(sweetLevel(30), 30);
});

test("sweetLevel: the nearest level, a tie to the less sweet, and any sugar is never none", () => {
  /* the shares the log actually holds: 0, 5, 10, 25, 50, 85, 100 */
  assert.deepEqual([0, 5, 10, 25, 50, 85, 100].map(sweetLevel), [0, 10, 10, 30, 50, 70, 100]);
  assert.equal(sweetLevel(1), 10, "a little sugar is 一分糖, not 無糖");
  assert.equal(sweetLevel(20), 10, "halfway between 10 and 30 asks for the less sweet");
  assert.equal(sweetLevel(40), 30, "…and between 30 and 50");
  assert.equal(sweetLevel(41), 50, "past halfway, the nearest");
  assert.equal(sweetLevel(90), 100);
});

test("orderLines: a sugar share reads as the level a counter takes, with the share you logged under it", () => {
  const l = orderLines({ sweet: "25%", ice: "Less ice" }, "zh");
  assert.deepEqual(l.map(x => [x.word, x.gloss]), [["微糖", "25% sugar"], ["少冰", "Less ice"]], "the Ximen cup: 微糖, 少冰");
  assert.deepEqual(words({ sweet: "85%" }, "zh"), ["少糖"]);
  assert.deepEqual(words({ sweet: "5%" }, "ja"), ["甘さ10%"]);
  assert.deepEqual(words({ sweet: "50%" }, "vi"), ["50% đường"]);
});

test("orderLangFor: the counter's language from the cafe's country", () => {
  assert.equal(orderLangFor("TW"), "zh");
  assert.equal(orderLangFor("tw"), "zh", "any case");
  assert.equal(orderLangFor("", "Taiwan"), "zh", "the map's country when there is no code");
  assert.equal(orderLangFor("", "Hong Kong"), "zh");
  assert.equal(orderLangFor("CN"), "zhs");
  assert.equal(orderLangFor("", "Japan"), "ja");
  assert.equal(orderLangFor("VN"), "vi");
  assert.equal(orderLangFor("US", "United States"), "en");
  assert.equal(orderLangFor(undefined, "Other"), "en");
  assert.deepEqual(ORDER_LANGS.map(l => l[0]), ["en", "zh", "ja", "vi"], "one 中文 button");
});
