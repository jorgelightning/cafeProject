/* Unit tests for js/lib/scan.js: what the app makes of a receipt's raw text. Node only.
   The suite (tests/run.js) runs these through tests/unit.js. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReceipt, receiptLines, lineItem, doubtWords, itemLines, SCAN_MAX_ROWS } from "../../js/lib/scan.js";

const ctx = { known: ["Iced matcha latte", "Cortado", "Black matcha latte", "Hojicha latte"], code: "USD", dec: 2, today: "2026-11-08" };
const read = (lines, over) => parseReceipt(lines.join("\n"), Object.assign({}, ctx, over));
const names = r => r.items.map(x => x.n);

const SAMPLE = [
  "SAMPLE TEA BAR", "123 MAIN ST", "(415) 555-0100", "Nov 8, 2026 2:14 PM", "Order #4417",
  "1 ICD MTCHA LT 6.75", "+ OAT MILK 1.00", "1 HOJI LT 16OZ 7.00", "LESS ICE", "1 CROISSANT 5.00",
  "SUBTOTAL 19.75", "TAX 1.73", "TIP 3.00", "TOTAL 24.48", "VISA 1234", "THANK YOU",
];

test("parseReceipt: the items of a receipt, and nothing above or below them", () => {
  const r = read(SAMPLE);
  assert.equal(r.kind, "receipt");
  assert.deepEqual(names(r), ["Iced matcha latte", "Hojicha latte", "Croissant"]);
  assert.equal(r.total, 24.48);
  assert.equal(r.date, "2026-11-08");
  assert.equal(r.other, "");
});

test("parseReceipt: a modifier belongs to the item above it, and its price is added", () => {
  const [matcha, hoji] = read(SAMPLE).items;
  assert.deepEqual([matcha.price, matcha.milk, matcha.isNew, matcha.printed], [7.75, "Oat", false, "1 ICD MTCHA LT + OAT MILK"]);
  assert.deepEqual([hoji.price, hoji.size, hoji.ice, hoji.isNew], [7, "16 oz", "Less ice", false]);
  const shot = read(["Latte 5.00", "ADD SHOT 1.00", "TOTAL 6.00"]);
  assert.deepEqual([names(shot), shot.items[0].price], [["Latte"], 6]);
});

test("parseReceipt: options come out of the name", () => {
  const [a, b, c] = read(["ICED LATTE 12 OZ OAT 50% SWEET 6.00", "Chai Latte Almond Milk No Sugar 6.50", "Latte Large 2% Milk 5.00", "TOTAL 17.50"]).items;
  assert.deepEqual([a.n, a.size, a.milk, a.sweet], ["Iced latte", "12 oz", "Oat", "50%"]);
  assert.deepEqual([b.n, b.milk, b.sweet], ["Chai Latte", "Almond", "0%"]);
  assert.deepEqual([c.n, c.size, c.milk, c.sweet], ["Latte", "Large", "2%", ""]);
  for (const size of ["16OZ", "160Z", "160z", "1602", "16 OZ", "16oz."]) assert.deepEqual([read(["HOJI LT " + size + " 7.00", "TOTAL 7.00"]).items[0].n, read(["HOJI LT " + size + " 7.00", "TOTAL 7.00"]).items[0].size], ["Hojicha latte", "16 oz"], size);
  assert.equal(read(["HOT CHOCOLATE 5.00", "TOTAL 5.00"]).items[0].n, "Hot chocolate", "Hot in a name stays in the name");
  assert.equal(read(["LATTE 5.00", "HOT", "TOTAL 5.00"]).items[0].ice, "Hot", "…and on its own line is how it was served");
});

test("parseReceipt: a name is yours only if every word pairs up", () => {
  const n = line => read([line + " 7.00", "TOTAL 7.00"]).items[0];
  assert.deepEqual([n("BLK MTCHA LT").n, n("BLK MTCHA LT").isNew], ["Black matcha latte", false]);
  assert.deepEqual([n("MATCHA LATTE ICED").n, n("MATCHA LATTE ICED").isNew], ["Iced matcha latte", false], "word order and Iced do not make it another drink");
  assert.deepEqual([n("Matcha latte").n, n("Matcha latte").isNew], ["Iced matcha latte", false], "Iced is not a different drink");
  assert.deepEqual([n("White matcha latte").n, n("White matcha latte").isNew], ["White matcha latte", true], "another word is another drink, not Black or Iced");
  assert.deepEqual([n("CORTADD").n, n("CORTADD").isNew], ["Cortado", false], "a misread letter still finds it");
  assert.deepEqual([n("Latte").n, n("Latte").isNew], ["Latte", true], "a word of a longer name is not that drink");
});

test("parseReceipt: the misreads a text reader makes in a price", () => {
  assert.equal(read(["Cortado 5.O0", "TOTAL 5.00"]).items[0].price, 5);
  assert.equal(read(["Cortado 1l.50", "TOTAL 11.50"]).items[0].price, 11.5);
  assert.equal(read(["Cortado 5,50", "TOTAL 5,50"]).items[0].price, 5.5, "a comma for the point");
  assert.equal(read(["Cortado 5.50 ;", "TOTAL 5.50 :"]).items[0].price, 5.5, "a speck after the price");
  assert.equal(read(["Cortado $5.50 T", "TOTAL 5.50"]).items[0].price, 5.5, "a tax flag after the price");
  assert.equal(read(["Cortado $ 5.50", "TOTAL 5.50"]).items[0].price, 5.5, "a space after the dollar sign");
  assert.equal(read(["Cortado", "+ Oat .75", "TOTAL .75"]).items.length, 0, "no price on the item is no item");
});

test("parseReceipt: two on one line are two cups at the unit price, within reason", () => {
  const r = read(["2 Cortado 11.00", "TOTAL 11.00"]);
  assert.deepEqual([names(r), r.items[0].price], [["Cortado", "Cortado"], 5.5]);
  assert.equal(read(["2x Cortado 11.00", "TOTAL 11.00"]).items.length, 2);
  assert.equal(read(["40 Cortado 200.00", "TOTAL 200.00"]).items.length, 6);
  assert.equal(read(Array.from({ length: 40 }, (_, i) => "Tea " + "abcdefghijklmnopqrstuvwxyzabcdefghijklmnop"[i] + "ee 3.00").concat("TOTAL 120.00")).items.length, SCAN_MAX_ROWS);
});

test("parseReceipt: an order ticket has no prices: each drink starts 1 ×, and its name and options wrap", () => {
  const r = read(["1 of 2", "Alex", "May 29, 2026 Sam", "9:55:55 AM", "FOR HERE", "1 × Matcha Guava Cream", "Top (16oz)", "Lactose Free Whole", "Milk", "No Sweet"]);
  assert.equal(r.kind, "receipt");
  assert.deepEqual(r.items.map(x => [x.n, x.price, x.size, x.milk, x.sweet, x.isNew, x.drink]), [["Matcha Guava Cream Top", null, "16 oz", "Lactose-free", "0%", true, true]]);
  assert.deepEqual([r.date, r.off, r.total], ["2026-05-29", false, null]);
  const two = read(["2x Cortado", "1 x Iced Latte 12oz", "Oat Milk", "Less Ice", "Extra Shot", "1 X Croissant"]);
  assert.deepEqual(two.items.map(x => [x.n, x.size, x.milk, x.ice].join("|")), ["Cortado|||", "Cortado|||", "Iced Latte|12 oz|Oat|Less ice", "Croissant|||"], "several drinks, quantities, and a modifier it does not know left out of the name");
  assert.equal(two.items[3].drink, false);
  assert.equal(read(["1 × Latte", "Extra Shot", "Vanilla"]).items[0].n, "Latte", "once a line says how it was made, the name has ended");
  assert.equal(read(["1 × Cortado 5.00", "TOTAL 5.00"]).items[0].price, 5, "a priced receipt that prints 1 × is still a receipt");
});

test("parseReceipt: a misread 1 × still starts a drink (audit, 12 Nov)", () => {
  assert.deepEqual(names(read(["George", "ix Matcha Guava Cream", "Top (1602)", "No Sweet"])), ["Matcha Guava Cream Top"], "the 1 read as an i, which had lost the whole ticket");
  assert.deepEqual(names(read(["lx Flat White", "Ix Drip Coffee"])), ["Flat White", "Drip Coffee"], "…or as an l, or a capital I");
  const pct = read(["1 x Flat White", "Oat Milk", "1% Cortado", "2% Drip Coffee"]);
  assert.deepEqual(pct.items.map(x => [x.n, x.milk].join("|")), ["Flat White|Oat", "Cortado|", "Drip Coffee|", "Drip Coffee|"], "the × read as a %, with its count kept");
  const milk = read(["1 x Latte", "2% Milk", "No Sweet"]);
  assert.deepEqual(milk.items.map(x => [x.n, x.milk, x.sweet].join("|")), ["Latte|2%|0%"], "2% Milk is still milk, not two of something");
  assert.deepEqual(names(read(["1 x Latte", "1% Milk"])), ["Latte"], "…nor is 1% Milk a drink");
  assert.deepEqual(names(read(["1 x Latte", "5% Sugar"])), ["Latte"], "…nor a sweetness");
});

test("parseReceipt: names and prices handed back as separate columns are put back together", () => {
  const cols = read(["SAMPLE TEA BAR", "123 MAIN ST", "Order #4417", "1 ICD MTCHA LT", "+ OAT MILK", "1 HOJI LT 16OZ", "LESS ICE", "1 CROISSANT", "SUBTOTAL", "TAX", "TOTAL", "VISA 1234", "6.75", "1.00", "7.00", "5.00", "19.75", "1.73", "21.48", "THANK YOU"]);
  assert.deepEqual(cols.items.map(x => [x.n, x.price, x.milk, x.ice].join("|")), ["Iced matcha latte|7.75|Oat|", "Hojicha latte|7|Less ice".replace("7|", "7||"), "Croissant|5||"]);
  assert.deepEqual([cols.total, cols.off], [21.48, false]);
  const under = read(["Cortado", "$5.25", "Drip coffee", "$3.00", "Total", "$8.25"]);
  assert.deepEqual([names(under), under.items.map(x => x.price), under.total], [["Cortado", "Drip coffee"], [5.25, 3], 8.25], "each price on the line under its name");
  assert.equal(read(["Sample Tea Bar", "$8.50", "Add a tip"]).kind, "total_only", "one loose amount under a name is a payment screen, not an item");
});

test("parseReceipt: a name is a real drink's, not one made up from scraps", () => {
  const one = (line, over) => read([line + " 6.00", "TOTAL 6.00"], Object.assign({ known: [] }, over)).items[0];
  assert.equal(one("Matcba Latte").n, "Matcha Latte", "a misread word is put right against the words drinks are made of");
  assert.equal(one("STRAWBERY LEMONADE").n, "Strawberry lemonade");
  assert.equal(one("Mocha").n, "Mocha", "a real word is never turned into its neighbour");
  assert.equal(one("Samidorl Matcha", { known: ["Matcha latte - Samidori"] }).n, "Samidori Matcha", "…and against your own drinks' words");
  assert.equal(one("A 1 Hojicha Latte").n, "Hojicha Latte", "scraps in front of a name go");
  assert.deepEqual([one("Flat White").drink, one("Flat White").odd], [false, true], "nothing in it says drink: listed, unticked, and not sure");
  assert.deepEqual([one("Flat White", { known: ["Flat White"] }).drink, one("Flat White", { known: ["Flat White"] }).odd], [true, false], "unless it is one of yours");
  assert.deepEqual([one("Uji Einspanner", { known: ["Black matcha Einspanner"] }).drink, one("Qwerty Zxcv").odd], [true, true], "a word from your own drinks says drink too");
  assert.deepEqual([one("CROISSANT").drink, one("CROISSANT").odd], [false, false], "food is food, not a maybe");
  assert.equal(one("Latte", { known: ["Cortado", "Vanilla latte", "Latte"] }).n, "Latte", "of your names, the closest wins");
});

test("lineItem: a line you point at is the drink, with its price and the options under it", () => {
  const text = ["ORDER 0417", "Oct 30", "2 x Yuzu Sparkle (16oz)", "Light ice", "Oat milk", "Seasonal special", "Cortadd 5.25", "Tea €4.00", "PAID 7.50"].join("\n");
  assert.equal(read(text.split("\n")).kind, "receipt", "(this one the rules can read; the lines are what matter here)");
  const lines = receiptLines(text);
  const at = (t, over) => lineItem(lines, lines.indexOf(t), Object.assign({}, ctx, over));
  const yuzu = at("2 x Yuzu Sparkle (16oz)");
  assert.deepEqual([yuzu.n, yuzu.price, yuzu.size, yuzu.ice, yuzu.milk, yuzu.drink, yuzu.odd], ["Yuzu Sparkle", null, "16 oz", "Less ice", "Oat", true, false], "you said it is a drink, so it is one");
  assert.equal(yuzu.printed, "2 x Yuzu Sparkle (16oz) + Light ice + Oat milk");
  assert.deepEqual([at("Cortadd 5.25").n, at("Cortadd 5.25").price, at("Cortadd 5.25").isNew], ["Cortado", 5.25, false], "a price on the line comes with it, and the name is yours when it matches");
  assert.equal(at("Seasonal special").ice, "", "options stop at the first line that is not one");
  assert.equal(at("Tea €4.00").price, null, "a price in another currency is left out");
  assert.equal(at("Tea €4.00", { code: "EUR" }).price, 4);
  assert.deepEqual(receiptLines("Cortado\n$5.25\nDrip\n$3.00"), ["Cortado $5.25", "Drip $3.00"], "the lines are shown with each price back beside its name");
  assert.equal(parseReceipt("Oct 30\nYuzu Sparkle\nLight ice", ctx).date, "2026-10-30", "a text with no drinks found still gives its date");
});

test("parseReceipt: prices that do not add up to the subtotal are flagged", () => {
  assert.equal(read(SAMPLE).off, false);
  assert.equal(read(["Cortado 3.25", "Drip 2.00", "SUBTOTAL 7.25", "TOTAL 7.25"]).off, true, "a 5 misread as a 3");
  assert.equal(read(["2 Cortado 10.00", "SUBTOTAL 10.00", "TOTAL 10.00"]).off, false, "quantities count");
  assert.equal(read(["Cortado 3.25", "TOTAL 7.25"]).off, false, "no subtotal, nothing to check against");
});

test("parseReceipt: what is not an item", () => {
  const r = read(["Cortado 5.00", "DISCOUNT -1.00", "Loyalty reward 2.00", "SERVICE FEE 1.00", "Sub-total 7.00", "Oat latte 9.00", "TOTAL 7.00"]);
  assert.deepEqual(names(r), ["Cortado"], "discounts, fees and anything after the totals begin");
  assert.deepEqual(names(read(["Cortado 5.00", "~ ee ; 7.00", "12 34 5.00", "TOTAL 5.00"])), ["Cortado"], "scraps of misread print");
  assert.equal(read(["CROISSANT 5.00", "TOTAL 5.00"]).items[0].drink, false, "food is listed but not ticked");
  assert.equal(read(["Cortado 5.00", "TOTAL 5.00"]).items[0].drink, true);
  assert.deepEqual(names(read(["HOJI LT 16OZ", "TOTAL 7.00"])), [], "a size is not a price");
});

test("parseReceipt: a payment screen is a total, and an empty read is unreadable", () => {
  const screen = read(["Total", "$8.50", "Add a tip", "15% $1.28", "20% $1.70", "No tip"]);
  assert.deepEqual([screen.kind, screen.total, screen.items.length], ["total_only", 8.5, 0]);
  const labelled = read(["Amount due $8.50"]);
  assert.deepEqual([labelled.kind, labelled.total], ["total_only", 8.5]);
  for (const bad of ["", "   \n ", "ee ~ ;; ,", "SAMPLE TEA BAR\n123 MAIN ST"]) assert.equal(parseReceipt(bad, ctx).kind, "unreadable", JSON.stringify(bad));
  assert.equal(parseReceipt(null, ctx).kind, "unreadable");
});

test("parseReceipt: the date must be a real day, not after today and not from years ago", () => {
  const on = (d, over) => read([d, "Cortado 5.00", "TOTAL 5.00"], over).date;
  assert.equal(on("11/01/2026"), "2026-11-01", "month first in dollars");
  assert.equal(on("11/01/26"), "2026-11-01");
  assert.equal(on("2026-11-01"), "2026-11-01");
  assert.equal(on("Oct 30"), "2026-10-30", "no year means this one");
  assert.equal(on("30 Oct 2026"), "2026-10-30");
  assert.equal(on("October 30th, 2026"), "2026-10-30");
  assert.equal(on("25/10/2026"), "2026-10-25", "only day first works");
  assert.equal(on("01/11/2026", { code: "EUR" }), "2026-11-01", "day first elsewhere");
  assert.equal(on("11/09/2026"), "2026-09-11", "tomorrow as month first, so it must be day first");
  assert.equal(on("12/25/2026"), null, "after today");
  assert.equal(on("02/30/2026"), null, "no such day");
  assert.equal(on("01/02/2019"), null, "years ago: more likely a misread year");
  assert.equal(on("Order 4417"), null);
});

test("parseReceipt: a receipt in another currency keeps its drinks and drops its prices", () => {
  const r = read(["Cortado NT$120", "TOTAL NT$120"]);
  assert.deepEqual([r.other, r.items[0].price, r.total], ["TWD", null, null]);
  assert.equal(read(["Cortado €4.50", "TOTAL €4.50"]).other, "EUR");
  assert.equal(read(["Cortado €4.50", "TOTAL €4.50"], { code: "EUR" }).other, "", "the cafe's own currency is not another");
  assert.equal(read(["Cortado ¥600", "TOTAL ¥600"], { code: "JPY", dec: 0 }).items[0].price, 600, "whole numbers count in a currency with no cents");
  assert.equal(read(["Cortado 1,200", "TOTAL 1,200"], { code: "KRW", dec: 0 }).items[0].price, 1200);
});

test("doubtWords: the words worth checking are the unsure ones on lines with a price", () => {
  const w = (text, confidence) => ({ text, confidence });
  const receipt = [
    [w("800", 7), w("Great", 17), w("Hwy", 95)],
    [w("Cold", 96), w("Brew", 96), w("$6.25", 85)],
    [w("Flat", 96), w("Whlte", 41), w("$6.95", 69)],
    [w("|", 12), w("Oat", 67), w("Milk", 91)],
    [w("Total", 95), w("$12.50", 89)],
  ];
  assert.deepEqual(doubtWords(receipt), ["Whlte", "$6.95"], "the address and the milk are doubtful too, but no one needs them put right");
  assert.deepEqual(doubtWords(receipt.concat([[w("Tota1", 20), w("$1250", 30)], [w("Mastercar", 1), w("8315", 91), w("(Contactless)", 40), w("$12.50", 90)], [w("Sales", 10), w("Tax", 96), w("$1.37", 20)]])), ["Whlte", "$6.95"],
    "the card that paid and the tax are not items, so their words are not offered; nor is a line that lost its price along with its sense");
  assert.equal(parseReceipt(["Cold Brew 6.25", "Mastercar 8315 (Contactless) 12.50"].join("\n"), ctx).items.length, 1, "…and a card line the reader clipped is no more a drink than a whole one");
  assert.deepEqual(doubtWords([[w("Ticket:", 20), w("Gorge", 30)], [w("ix", 30), w("Matcha", 94)], [w("Top", 96), w("(1602)", 55)], [w("|", 3), w("a", 0)]]), ["ix", "(1602)"], "a ticket has no prices, so every line that could be an item counts; marks and single letters never do");
  assert.deepEqual(doubtWords([[w("$6.95", 10), w("$6.95", 20), w("Latte", 70)]]), ["$6.95"], "said once, and 70 is sure enough");
  const many = [Array.from({ length: 12 }, (_, i) => w("w" + i + "x", 5)).concat(w("$1.00", 96))];
  assert.equal(doubtWords(many).length, 6, "no more than six");
  assert.deepEqual([doubtWords([]), doubtWords(null), doubtWords([null, [null, w("$1.00", 1)]])], [[], [], ["$1.00"]], "nothing to go on is nothing to check");
});

/* three ways the owner's own photos lost a drink (12 Nov), each as the reader really gave it */
test("parseReceipt: a till's screen has its buttons on the drink's line", () => {
  const mine = { known: ["Cortado", "Flat white"] };
  for (const line of ["-— Cortado   / Edititem   OJ Remove   fila  1   $6.50", "Cortado   © Edititen   J Remove   ©   1   (+)   $6.50", "Cortado Edit item Remove - 1 + $6.50"]) {
    const r = read(["My Order", line, "Subtotal (1 item) $6.50", "Taxes $0.00", "Total $6.50"], mine);
    assert.deepEqual(r.items.map(x => [x.n, x.price, x.isNew]), [["Cortado", 6.5, false]], line);
    assert.deepEqual([r.off, r.total], [false, 6.5]);
  }
  assert.deepEqual(names(read(["Yuzu Fizz   / Edititem   Remove   1   $7.00", "Total $7.00"], mine)), ["Yuzu Fizz"], "a drink that is new to you is cut at the buttons too");
  assert.deepEqual(names(read(["Edit item Remove 1 $7.00", "Total $7.00"], mine)), [], "buttons with no drink before them are not a drink");
  assert.equal(lineItem(["Cortado © Edititen J Remove © 1 $6.50"], 0, Object.assign({}, ctx, mine)).n, "Cortado", "…and the same where you tap the line yourself");
});

test("parseReceipt: a drink whose price lost its end is still offered, with the price left to you", () => {
  const mine = { known: ["Flat white", "Cold brew"] };
  const r = read(["MASTERCARD", "Cold Brew $6.25", "o A  Flat White   6.2", "\"oat Milk   ep", "Total $1250", "Mastercar 8315 (Contactless) $12.50"], mine);
  assert.deepEqual(r.items.map(x => [x.n, x.price, x.drink]), [["Cold brew", 6.25, true], ["Flat white", null, true]]);
  assert.equal(r.items[1].printed, "o A Flat White 6.2", "what was printed is shown beside it");
  assert.deepEqual(names(read(["Cold Brew $6.25", "Yuzu Latte $7.", "Total $13.25"], mine)), ["Cold brew", "Yuzu Latte"], "a drink word is enough when the name is not one of yours");
  assert.deepEqual(names(read(["Cold Brew $6.25", "Ref 4.2", "Table 12.", "Total $6.25"], mine)), ["Cold brew"], "a number after words that name no drink is not one");
  assert.deepEqual(names(read(["Flat White 6.2", "Total $6.25"], mine)), [], "nor is it one before the first real item, where a receipt keeps its address");
  assert.equal(read(["Cold Brew $6.25", "Flat White 6.2", "Subtotal $12.50", "Total $12.50"], mine).off, true, "…and with a subtotal printed, the gap is called out");
  const made = read(["Cold Brew $6.25", "Oat Milk 0.", "Total $6.25"], mine);
  assert.deepEqual([names(made), made.items[0].milk], [["Cold brew"], "Oat"], "a line that says how the drink above was made is still that");
});

test("parseReceipt: a name the receipt cut short is yours when only one of yours fits", () => {
  const mine = { known: ["Hojicha latte", "Matcha latte", "Cortado"] };
  const n = (line, over) => read([line, "Total 7.50"], Object.assign({}, mine, over)).items[0];
  assert.deepEqual([n("Hot Hojicha L $7.50").n, n("Hot Hojicha L $7.50").isNew, n("Hot Hojicha L $7.50").price], ["Hojicha latte", false, 7.5]);
  assert.equal(n("Matcha La 7.50").n, "Matcha latte", "two letters too");
  assert.deepEqual([n("Hojicha L 7.50", { known: ["Hojicha latte", "Hojicha lemonade"] }).n, n("Hojicha L 7.50", { known: ["Hojicha latte", "Hojicha lemonade"] }).isNew], ["Hojicha L", true], "two of yours fit, so it is neither");
  assert.equal(n("Cortado L 7.50").isNew, true, "a letter after a whole name of yours is a size, or anything");
  assert.equal(n("Yuzu L 7.50").isNew, true, "nothing of yours starts like it");
  assert.equal(lineItem(["Hot Hojicha L $7.50"], 0, Object.assign({}, ctx, mine)).n, "Hojicha latte", "…and the same where you tap the line yourself");
});

test("parseReceipt: a stray figure or mark after a whole price is the paper's edge, not the price", () => {
  const mine = { known: ["Cold brew"] };
  assert.deepEqual(read(["1  Cold Brew   $6.25 1", "Total $6.25"], mine).items.map(x => [x.n, x.price]), [["Cold brew", 6.25]], "the reader's second look at the owner's crumpled receipt, which found no drink in this line");
  assert.deepEqual(read(["Cold Brew 6.25 }", "Total 6.25"], mine).items.map(x => x.price), [6.25]);
  assert.deepEqual(read(["Cold Brew 6.25 T", "Total 6.25"], mine).items.map(x => x.price), [6.25], "a tax flag still is one");
  assert.deepEqual(names(read(["Cold Brew 6", "Total 6.25"], mine)), [], "a figure after words is not a price for lacking one before it");
  assert.equal(read(["Cortado ¥600", "合計 ¥600"], { code: "JPY", dec: 0 }).items[0].price, 600, "a currency with no cents is read as it was");
});

test("parseReceipt: a surcharge is not something you drank", () => {
  const r = read(["Hot Hojicha L $7.50", "Subtotal $7.50", "SF Healthcare", "Surcharge (4%) $0.30", "SF Tax (8.625%) $0.65", "Total $8.45"], { known: ["Hojicha latte"] });
  assert.deepEqual(names(r), ["Hojicha latte"]);
  assert.deepEqual(names(read(["Cortado 5.00", "Surcharge 0.30", "Credit Card Surcharge (3.00%) $0.49"], {})), ["Cortado"], "before the totals too, where the owner's photo had it read");
});

test("itemLines: each drink is found on the line it was read from", () => {
  const rows = l => l.map(t => ({ t }));
  const receipt = rows(["CORTADO COFFEE", "12 Oak St", "Cortado  $6.50", "(Default) Whole Milk", "1 Hot Hojicha Latte  $7.25", "Subtotal  $13.75"]);
  assert.deepEqual(itemLines([{ printed: "Cortado + (Default) Whole Milk", price: 6.5 }, { printed: "1 Hot Hojicha Latte", price: 7.25 }], receipt), [2, 4],
    "the name and its price on one line, so a shop named for a drink is not taken for the drink");
  assert.deepEqual(itemLines([{ printed: "Latte", price: 5 }, { printed: "Latte", price: 5 }], rows(["Latte 5.00", "Latte 5.00", "Total 10.00"])), [0, 1], "the same drink twice is two lines, in the order printed");
  assert.deepEqual(itemLines([{ printed: "Matcha Guava Cream Top", price: null }], rows(["Order 41", "1 x Matcha Guava", "Cream Top", "50% sweet"])), [1], "a ticket's name that ran on to a second line is found by its words");
  assert.deepEqual(itemLines([{ printed: "Cortado", price: 3.25 }], rows(["Cortado  $6.50"])), [0], "a price shared between two cups is not the one printed, and the name alone finds the line");
  assert.deepEqual(itemLines([{ printed: "Cold Brew", price: 6.25 }, { printed: "", price: 4 }], rows(["Thank you", "Total 6.25"])), [-1, -1], "a drink on no line has no place, and nor has one with nothing printed");
  assert.deepEqual(itemLines([{ printed: "Cortado", price: 6.5 }], []), [-1], "and a reader that gave no lines places nothing");
});
