/* js/lib/scan.js — turning a receipt's raw text into cups (Scan a receipt, v127).

   The owner takes a photo at the counter and the log sheet fills itself in. The reading happens on the phone: a text
   reader (js/scan.js) turns the photo into lines of text, and this file works out what they mean. It knows nothing
   of the picture, so it can be tested with plain strings.

   A receipt is a list of lines ending in prices, between a header and a block of totals. So: everything before the first
   subtotal, tax or total line that ends in a price is an item, unless it is plainly not one; a line that follows an
   item and only says "+ OAT MILK" or "LESS ICE" belongs to that item. The text reader misreads faded print, so the rules
   stay forgiving about digits and strict about what they believe: an ice level must be one the app has, a date cannot
   be in the future, and a name matches one of yours only if every word does. Nothing is saved from here; the
   answer only fills in the sheet, and you press Save.
   Like the other lib files, the app gets these as globals. */
import { editDistance } from "./text.js";

/* the same list as MILKS in form.js; tests/scan-receipt.js holds the two together */
export const SCAN_MILK = ["Whole", "2%", "Skim", "Oat", "Almond", "Soy", "Coconut", "Macadamia", "Lactose-free", "Half & half", "None"];
export const SCAN_ICE = ["Extra ice", "Regular ice", "Less ice", "No ice", "Warm", "Hot"];
/* A long receipt is a table's order, not a person's: the list to tick stays short enough to read */
export const SCAN_MAX_ROWS = 12;
const MAX_QTY = 6;
const MAX_AGE_DAYS = 400;

const ENDS_ITEMS = /\b(SUB\s*-?TOTAL|TOTAL|TAX|VAT|GST)\b/i;
const NOT_ITEM =
  /\b(SUB\s*-?TOTAL|TOTAL|TAX|VAT|GST|TIP|GRATUITY|SERVICE|CHANGE|CASH|CARD|VISA|MASTERCARD|AMEX|DISCOVER|DEBIT|CREDIT|BALANCE|AMOUNT|DUE|PAID|AUTH|APPROVAL|APPROVED|INVOICE|RECEIPT|TICKET|ORDER|CHECK|TABLE|GUEST|SERVER|CASHIER|TEL|PHONE|THANK|DISCOUNT|COUPON|PROMO|REWARDS?|LOYALTY|POINTS|ROUNDING|FEE|ACCOUNT)\b/i;
const FOOD = /\b(CROISSANT|COOKIE|MUFFIN|BAGEL|TOAST|SANDWICH|CAKE|SCONE|DONUT|DOUGHNUT|BROWNIE|PASTRY|WAFFLE|BURRITO|SALAD|MUG|TOTE|SHIRT|STICKER|BEANS|GIFT)\b/i;
const MODIFIER_WORD = /\b(SHOT|SHOTS|SYRUP|PUMPS?|FOAM|DRIZZLE|MODIFIER)\b/i;

/* How receipts shorten the words on a cafe's menu */
const WORDS = {
  ICD: "Iced", MTCHA: "Matcha", MATC: "Matcha", MTC: "Matcha", HOJI: "Hojicha", LT: "Latte", LTE: "Latte", LAT: "Latte",
  AMER: "Americano", AMERI: "Americano", CAPP: "Cappuccino", CAPPU: "Cappuccino", ESP: "Espresso", ESPR: "Espresso", EXPR: "Espresso",
  MOC: "Mocha", CB: "Cold brew", CLD: "Cold", BRW: "Brew", FW: "Flat white", FLT: "Flat", WHT: "White", CORT: "Cortado", MACCH: "Macchiato",
  CHOC: "Chocolate", VAN: "Vanilla", VNL: "Vanilla", CRML: "Caramel", CARM: "Caramel", DRP: "Drip", COF: "Coffee", CFE: "Coffee", OOL: "Oolong",
  GRN: "Green", BLK: "Black", DBL: "Double", SGL: "Single", JCE: "Juice",
};
/* What makes a line a drink: one of these words in it, or a word from a drink you have logged. A line with neither is
   shown unticked, as something the app is not sure of, never as a drink it made up. */
const DRINK = new Set(
  ("latte matcha hojicha espresso americano cappuccino cortado macchiato mocha coffee tea chai oolong sencha genmaicha jasmine einspanner affogato " +
    "frappe frappuccino smoothie lemonade juice soda boba cocoa chocolate brew drip tonic milk kombucha shake float spritz refresher cider mate pourover").split(" ")
);
/* Words a drink's name is often made with. Together with DRINK and your own drinks' words, they are what a misread
   word is put right against: "Matcba" is Matcha. */
const FLAVOR =
  "iced cream black green white vanilla caramel honey lavender sesame coconut cinnamon pistachio strawberry mango guava yuzu peach lemon brown sugar almond double single cloud".split(" ");
const VOCAB = [...DRINK].concat(FLAVOR);
/* words a menu can add or drop without it being another drink */
const SOFT = new Set(["iced", "ice", "hot", "w", "with", "and", "the", "milk", "oat", "almond", "soy"]);
const SYMBOLS = { "€": "EUR", "£": "GBP", "₩": "KRW", NT$: "TWD", HK$: "HKD", S$: "SGD", A$: "AUD", CA$: "CAD" };
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A date the receipt could really have: a real day, not after today and not from years ago.
    @param {number} y @param {number} m @param {number} d @param {string} today YYYY-MM-DD */
function realDate(y, m, d, today) {
  const v = y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
  const t = Date.parse(v + "T00:00:00Z");
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) return null;
  if (v > today || Date.parse(today + "T00:00:00Z") - t > MAX_AGE_DAYS * 86400000) return null;
  return v;
}
/** The first date in the text. Numbers are month first in dollars and day first elsewhere, unless only the other works.
    @param {string} text @param {string} today @param {boolean} monthFirst */
function findDate(text, today, monthFirst) {
  const full = y => (y < 100 ? 2000 + y : y);
  let m = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);
  if (m) return realDate(+m[1], +m[2], +m[3], today);
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/.exec(text);
  if (m) {
    const y = full(+m[3]);
    return monthFirst ? realDate(y, +m[1], +m[2], today) || realDate(y, +m[2], +m[1], today) : realDate(y, +m[2], +m[1], today) || realDate(y, +m[1], +m[2], today);
  }
  const names = MONTHS.join("|");
  const year = y => (y ? full(+y) : +today.slice(0, 4));
  m = new RegExp("\\b(" + names + ")[A-Z]*\\.?\\s+(\\d{1,2})(?:ST|ND|RD|TH)?\\b,?(?:\\s+(\\d{4}|\\d{2})\\b)?", "i").exec(text);
  if (m) return realDate(year(m[3]), MONTHS.indexOf(m[1].toUpperCase()) + 1, +m[2], today);
  m = new RegExp("\\b(\\d{1,2})\\s+(" + names + ")[A-Z]*\\.?,?(?:\\s+(\\d{4}|\\d{2})\\b)?", "i").exec(text);
  if (m) return realDate(year(m[3]), MONTHS.indexOf(m[2].toUpperCase()) + 1, +m[1], today);
  return null;
}

/** The price a line ends in, with what comes before it. The reader takes a 0 for an O and a 1 for an l, so a number
    token is read past those; whole numbers count only in a currency written without cents.
    @param {string} line @param {number} dec decimals on a menu in this currency */
function splitPrice(line, dec) {
  const toks = line.split(" ");
  let i = toks.length - 1;
  if (i > 0 && /^[A-Z]$/.test(toks[i])) i--; /* a tax flag after the price */
  const m = /^(-?)([A-Z]{0,2}\$|[€£¥₩])?(-?)(.+)$/.exec(toks[i]);
  if (!m) return null;
  const digits = m[4].replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/[Ss]/g, "5");
  let v = null;
  if (/^\d{0,6}[.,]\d{2}$/.test(digits)) v = parseFloat(digits.replace(",", "."));
  /* a symbol like NT$ or ¥ says it is money even without cents */
  else if ((dec === 0 || (m[2] && m[2] !== "$")) && /^\d{1,3}([,.]\d{3})+$|^\d{2,7}$/.test(digits)) v = parseInt(digits.replace(/[,.]/g, ""), 10);
  if (v == null) return null;
  let sym = m[2] || "";
  let cut = i;
  if (!sym && i > 0 && /^([A-Z]{0,2}\$|[€£¥₩])$/.test(toks[i - 1])) {
    sym = toks[i - 1];
    cut = i - 1;
  }
  return { name: toks.slice(0, cut).join(" ").trim(), price: v, neg: !!(m[1] || m[3]), sym: sym };
}

/** Options printed in `text`, and what is left once they are taken out. @param {string} text @param {boolean} wholeLine
    is this a modifier line of its own, where a bare "HOT" means the drink and not its name */
function pullOptions(text, wholeLine) {
  const o = { size: "", sweet: "", ice: "", milk: "" };
  let s = " " + text.replace(/[()[\]]/g, " ") + " ";
  const take = (re, fn) => {
    s = s.replace(re, function () {
      fn.apply(null, arguments);
      return " ";
    });
  };
  take(/\s(LESS|LIGHT|LITE|LT|EASY)\s+ICE\s/i, () => (o.ice = "Less ice"));
  take(/\sNO\s+ICE\s/i, () => (o.ice = "No ice"));
  take(/\s(EXTRA|XTRA)\s+ICE\s/i, () => (o.ice = "Extra ice"));
  take(/\sREG(ULAR)?\s+ICE\s/i, () => (o.ice = "Regular ice"));
  take(/\s(NO\s+(SUGAR|SWEET)|UNSWEET(ENED)?)\s/i, () => (o.sweet = "0%"));
  take(/\sHALF\s+(SWEET|SUGAR)\s/i, () => (o.sweet = "50%"));
  take(/\s2\s?%\s+MILK\s/i, () => (o.milk = "2%"));
  take(/\s(\d{1,3})\s?%(\s+(SWEET|SUGAR|SWT))?\s/i, (_, p) => {
    if (+p <= 100) o.sweet = +p + "%";
  });
  /* 0Z: the reader takes the O of 16OZ for a zero */
  take(/\s(\d{1,2}(\.\d)?)\s?([O0]Z|OUNCE)\b\.?\s/i, (_, n) => (o.size = n + " oz"));
  take(/\s(8|10|12|16|20|24|32)[O0]2\s/i, (_, n) => (o.size = n + " oz")); /* and its Z for a 2 */
  take(/\s(\d{3})\s?ML\s/i, (_, n) => (o.size = n + " ml"));
  take(/\s(SMALL|SM)\s/i, () => (o.size = o.size || "Small"));
  take(/\s(MEDIUM|MED|MD)\s/i, () => (o.size = o.size || "Medium"));
  take(/\s(LARGE|LRG|LG)\s/i, () => (o.size = o.size || "Large"));
  take(/\sLACTOSE[\s-]?FREE(\s+WHOLE)?(\s+MILK)?\s/i, () => (o.milk = "Lactose-free"));
  take(/\s(OAT(LY)?)(\s+MILK)?\s/i, () => (o.milk = "Oat"));
  take(/\s(ALMOND|ALM)(\s+MILK)?\s/i, () => (o.milk = "Almond"));
  take(/\sSOY(\s+MILK)?\s/i, () => (o.milk = "Soy"));
  take(/\sCOCONUT(\s+MILK)?\s/i, () => (o.milk = "Coconut"));
  take(/\sMACADAMIA(\s+MILK)?\s/i, () => (o.milk = "Macadamia"));
  take(/\sWHOLE(\s+MILK)?\s/i, () => (o.milk = "Whole"));
  take(/\s(SKIM|NON\s?FAT)(\s+MILK)?\s/i, () => (o.milk = "Skim"));
  if (wholeLine) {
    take(/\sHOT\s/i, () => (o.ice = "Hot"));
    take(/\sWARM\s/i, () => (o.ice = "Warm"));
  }
  return { o: o, rest: s.replace(/\s+/g, " ").trim() };
}
/** Is this line a modifier of the item above it, not an item? @param {string} name @param {string} rest what pullOptions
    left of it @param {any} o what it found */
function isModifier(name, rest, o) {
  if (/^[+*>~-]/.test(name) || /^(ADD|SUB|NO|EXTRA|LESS|W\/|WITH)\b/i.test(name) || MODIFIER_WORD.test(name)) return true;
  return !!(o.size || o.sweet || o.ice || o.milk) && !/[A-Za-z]{2}/.test(rest.replace(/\bMILK\b/i, ""));
}

/** A misread word put right: the one word, of the drink words and your own, within a letter of it (two for a long word).
    A word that is already one of them, or short, or near two of them, is left alone. @param {string} w @param {Set<string>} own */
function fixWord(w, own) {
  const lw = w.toLowerCase();
  if (lw.length < 5 || !/^[a-z]+$/.test(lw) || DRINK.has(lw) || FLAVOR.includes(lw) || own.has(lw)) return w;
  const max = lw.length >= 8 ? 2 : 1;
  let best = "",
    bestD = max + 1,
    tie = false;
  VOCAB.concat([...own].filter(x => x.length >= 5)).forEach(function (v) {
    const d = editDistance(lw, v, max);
    if (d < bestD) {
      best = v;
      bestD = d;
      tie = false;
    } else if (d === bestD && d <= max && v !== best) tie = true;
  });
  if (!best || tie) return w;
  return /^[A-Z]/.test(w) ? best.charAt(0).toUpperCase() + best.slice(1) : best;
}
/** A printed name in plain words: "ICD MTCHA LT" is "Iced matcha latte". A name printed in mixed case keeps its case.
    Scraps in front of it go ("A 1 Croissant"), and a misread word is put right. @param {string} s @param {Set<string>} own */
function plainName(s, own) {
  const toks = s.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9)]+$/g, "").split(" ").filter(Boolean);
  while (toks.length > 1 && /^(\d+|[A-Za-z])$/.test(toks[0])) toks.shift();
  const clean = toks.join(" ");
  /* a stray small letter among capitals is the reader, not the receipt */
  if ((clean.match(/[a-z]/g) || []).length > clean.replace(/[^A-Za-z]/g, "").length * 0.25) return toks.map(w => fixWord(w, own)).join(" ");
  const out = toks
    .map(w => fixWord(WORDS[w] || w, own))
    .join(" ")
    .toLowerCase();
  return out.charAt(0).toUpperCase() + out.slice(1);
}
/** @param {string} s */
const words = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(Boolean);
/** @param {string} a a word from the receipt @param {string} b a word of yours */
function sameWord(a, b) {
  if (a === b || (a.length >= 3 && b.startsWith(a))) return true;
  return a.length >= 4 && editDistance(a, b, 2) <= (a.length >= 7 ? 2 : 1);
}
/** One of your drink names, if the receipt's is the same drink: every word has to pair up, bar a few that do not change
    the drink, so "Matcha latte" is not "Black matcha latte". @param {string} name @param {string[]} known */
function matchKnown(name, known) {
  const a = words(name);
  let best = null,
    bestLeft = 99;
  known.forEach(function (k) {
    const b = words(k);
    const open = b.slice();
    const lost = a.filter(function (w) {
      const i = open.findIndex(x => sameWord(w, x));
      if (i < 0) return true;
      open.splice(i, 1);
      return false;
    });
    if (a.length && lost.every(w => SOFT.has(w)) && lost.length < a.length && open.every(w => SOFT.has(w)) && open.length + lost.length < bestLeft) {
      best = k;
      bestLeft = open.length + lost.length;
    }
  });
  return best;
}

/** A phone's text reader often hands back a receipt's names and its prices as two separate runs of lines, or each price
    on the line under its name. This puts each price back on its line, so the rest can read it as printed.
    @param {string[]} lines @param {number} dec */
function joinColumns(lines, dec) {
  const info = lines.map(function (l) {
    const h = splitPrice(l, dec);
    return { l: l, priced: !!h, bare: !!h && !/[A-Za-z]/.test(h.name) && !/%/.test(l) };
  });
  const singles = info.filter((x, i) => x.bare && !(info[i - 1] && info[i - 1].bare) && !(info[i + 1] && info[i + 1].bare)).length;
  /* lines that never carry a price: a card number, a date, a thank-you */
  const NEVER = /\b(THANK|AUTH|APPROV\w*|SERVER|CASHIER|TABLE|GUEST|ORDER|TEL|PHONE)\b|\d{4,}/i;
  /** @type {string[]} */
  const out = [];
  /** @type {number[]} */
  let labels = [];
  for (let i = 0; i < info.length; ) {
    if (!info[i].bare) {
      out.push(info[i].l);
      if (info[i].priced) labels = [];
      else if (!NEVER.test(info[i].l)) labels.push(out.length - 1);
      i++;
      continue;
    }
    let j = i;
    while (j < info.length && info[j].bare) j++;
    const prices = info.slice(i, j).map(x => x.l);
    /* a line that only says how a drink was made ("LESS ICE") has no price of its own */
    const priced = labels.filter(function (k) {
      const p = pullOptions(out[k], true);
      return /^\+/.test(out[k]) || !(Object.values(p.o).some(Boolean) && !/[A-Za-z]{2}/.test(p.rest.replace(/\bMILK\b/i, "")));
    });
    const pool = priced.length >= prices.length ? priced : labels;
    const one = prices.length === 1;
    if (pool.length >= prices.length && (!one || singles >= 2 || /\b(TOTAL|AMOUNT|DUE|BALANCE|TAX)\b/i.test(out[pool[pool.length - 1]]))) {
      pool.slice(-prices.length).forEach((k, n) => (out[k] += " " + prices[n]));
    } else prices.forEach(p => out.push(p));
    labels = [];
    i = j;
  }
  return out;
}
const hasOpt = o => Object.values(o).some(Boolean);
const QTY = /^(\d{1,2})\s*[x×*]\s+(?=\S)/i;
/** An order ticket, the slip stuck to the cup: no prices, each drink starting "1 ×", and under it the rest of its name
    and how it was made, wrapped over as many lines as the paper needs. @param {string[]} lines */
function ticketRows(lines) {
  /** @type {any[]} */
  const rows = [];
  /** @type {any} */
  let cur = null;
  let nameOpen = false,
    made = [];
  const close = function () {
    if (!cur) return;
    Object.assign(cur.o, Object.fromEntries(Object.entries(pullOptions(made.join(" "), true).o).filter(e => e[1])));
    if (/[A-Za-z]{2}/.test(cur.name)) rows.push(cur);
    cur = null;
    made = [];
  };
  lines.forEach(function (line) {
    const q = QTY.exec(line);
    if (q) {
      close();
      const p = pullOptions(line.slice(q[0].length), false);
      cur = { name: p.rest, qty: Math.max(1, Math.min(+q[1], MAX_QTY)), price: null, o: p.o, printed: line.slice(q[0].length) };
      nameOpen = !hasOpt(p.o);
      return;
    }
    if (!cur) return;
    if (NOT_ITEM.test(line) || !/[A-Za-z0-9]/.test(line)) {
      close();
      return;
    }
    cur.printed += " " + line;
    const p = pullOptions(line, false);
    /* the name runs on until a line says how the drink was made */
    if (nameOpen && !isModifier(line, pullOptions(line, true).rest, p.o)) {
      if (p.rest) cur.name += " " + p.rest;
      if (hasOpt(p.o)) {
        Object.assign(cur.o, Object.fromEntries(Object.entries(p.o).filter(e => e[1])));
        nameOpen = false;
      }
    } else {
      nameOpen = false;
      made.push(line);
    }
  });
  close();
  return rows;
}

/** The text's lines as the rules see them: tidied, and each price back on its own line. @param {string} text @param {number} [dec] */
export function receiptLines(text, dec) {
  return joinColumns(
    String(text)
      .normalize("NFKC")
      .split(/\r?\n/)
      .map(l => l.replace(/[|_—–]/g, " ").replace(/\s+/g, " ").replace(/(\s+[;:!'"`.,~^])+$/, "").trim())
      .filter(Boolean),
    dec == null ? 2 : dec
  );
}
/** The words of your own drinks: "einspanner" says drink as surely as "latte" does. @param {string[]} known */
const ownWords = known => new Set(known.flatMap(k => words(k)).filter(w => w.length >= 4 && !SOFT.has(w)));

/** One line taken as a drink because you said so (Tap your drink's line, v133): its name, a price if it ends in one,
    and how it was made, from the line itself and any lines right under it that say only that.
    @param {string[]} lines from receiptLines @param {number} i @param {{known?: string[], code?: string, dec?: number}} ctx */
export function lineItem(lines, i, ctx) {
  const code = String(ctx.code || "USD").toUpperCase();
  const dec = ctx.dec == null ? 2 : ctx.dec;
  const known = (ctx.known || []).map(String);
  const body = l => {
    const h = splitPrice(l, dec);
    return h && /[A-Za-z]{2}/.test(h.name) ? h : { name: l, price: null, neg: false, sym: "" };
  };
  const hit = body(lines[i] || "");
  const p = pullOptions(hit.name, false);
  const q = /^(\d{1,2})\s*[x×*]?\s+(?=\D)/i.exec(p.rest);
  const o = p.o;
  const printed = [hit.name];
  for (let k = i + 1; k < lines.length && k <= i + 4; k++) {
    const b = body(lines[k]).name;
    const more = pullOptions(b, true);
    if (!hasOpt(more.o) || !isModifier(b, more.rest, more.o)) break;
    Object.assign(o, Object.fromEntries(Object.entries(more.o).filter(e => e[1])));
    printed.push(b);
  }
  const plain = plainName(q ? p.rest.slice(q[0].length) : p.rest, ownWords(known));
  const mine = matchKnown(plain, known);
  const foreign = !!hit.sym && hit.sym !== "$" && (hit.sym === "¥" ? "JPY" : SYMBOLS[hit.sym]) !== code && !(hit.sym === "¥" && code === "CNY");
  return {
    n: (mine || plain).slice(0, 80),
    isNew: !mine,
    printed: printed.join(" + ").slice(0, 80),
    drink: true,
    odd: false,
    price: hit.price == null || hit.neg || foreign ? null : Math.round(hit.price * 100) / 100,
    size: o.size,
    sweet: o.sweet,
    ice: o.ice,
    milk: o.milk,
  };
}

/** What a receipt's text says. `kind` is "receipt" (items to log), "total_only" (a payment screen: an amount and no
    drinks) or "unreadable". `other` is the receipt's currency when its symbols are not the cafe's: its prices are
    dropped, since a number in the wrong currency would look right and be wrong. `off` says the prices read do not add
    up to the subtotal printed, which is how a 5 misread as a 3 gets noticed. `odd` on an item means nothing in its
    name says it is a drink.
    @param {string} text @param {{known?: string[], code?: string, dec?: number, today: string}} ctx the drinks you
    already log here, the cafe's currency, how many decimals it is written with, and today */
export function parseReceipt(text, ctx) {
  const none = { kind: "unreadable", date: null, total: null, other: "", off: false, items: [] };
  if (typeof text !== "string") return none;
  const code = String(ctx.code || "USD").toUpperCase();
  const dec = ctx.dec == null ? 2 : ctx.dec;
  const known = (ctx.known || []).map(String);
  const own = ownWords(known);
  const lines = receiptLines(text, dec);

  /** @type {any[]} */
  const rows = [];
  let total = null,
    subtotal = null,
    loose = null,
    ended = false,
    other = "";
  lines.forEach(function (line) {
    const hit = splitPrice(line, dec);
    if (!hit) {
      /* a line with no price can still be how the item above it was made */
      const last = rows[rows.length - 1];
      if (!ended && last && !NOT_ITEM.test(line)) {
        const p = pullOptions(line, true);
        if (isModifier(line, p.rest, p.o)) {
          Object.assign(last.o, Object.fromEntries(Object.entries(p.o).filter(e => e[1])));
          last.printed += " + " + line.replace(/^[+*>~-]\s*/, "");
        }
      }
      return;
    }
    if (hit.sym && hit.sym !== "$") {
      const c = hit.sym === "¥" ? (code === "JPY" || code === "CNY" ? code : "JPY") : SYMBOLS[hit.sym];
      if (c && c !== code) other = c;
    }
    if (/SUB\s*-?TOTAL/i.test(hit.name) && subtotal == null) subtotal = hit.price;
    if (ENDS_ITEMS.test(hit.name)) ended = true;
    if (/\b(GRAND\s+TOTAL|TOTAL|AMOUNT\s+DUE|BALANCE\s+DUE)\b/i.test(hit.name) && !/SUB\s*-?TOTAL/i.test(hit.name)) {
      total = hit.price;
      return;
    }
    const letters = (hit.name.match(/[A-Za-z]/g) || []).length;
    if (!letters && !hit.neg && !/%/.test(line) && (hit.sym || lines.length < 12)) loose = Math.max(loose || 0, hit.price);
    if (ended || hit.neg || letters < 2 || NOT_ITEM.test(hit.name)) return;
    const last = rows[rows.length - 1];
    const p = pullOptions(hit.name, false);
    if (isModifier(hit.name, pullOptions(hit.name, true).rest, p.o)) {
      if (last) {
        last.price += hit.price;
        Object.assign(last.o, Object.fromEntries(Object.entries(p.o).filter(e => e[1])));
        last.printed += " + " + hit.name.replace(/^[+*>~-]\s*/, "");
      }
      return;
    }
    if (letters < 3 || letters / hit.name.replace(/\s/g, "").length < 0.5) return;
    const q = /^(\d{1,2})\s*[xX]?\s+(?=\D)/.exec(p.rest);
    const name = q ? p.rest.slice(q[0].length) : p.rest;
    if (!name) return;
    const qty = q ? Math.max(1, Math.min(+q[1], MAX_QTY)) : 1;
    rows.push({ name: name, qty: qty, price: q && +q[1] > 1 ? hit.price / +q[1] : hit.price, o: p.o, printed: hit.name });
  });

  /* nothing with a price: perhaps the slip from the cup, which has none */
  const ticket = !rows.length;
  if (ticket) ticketRows(lines).forEach(r => rows.push(r));

  /** @type {any[]} */
  const items = [];
  rows.forEach(function (r) {
    const plain = plainName(r.name, own);
    const mine = matchKnown(plain, known);
    const food = FOOD.test(r.name);
    const named = words(plain).some(w => DRINK.has(w) || own.has(w));
    for (let i = 0; i < r.qty && items.length < SCAN_MAX_ROWS; i++)
      items.push({
        n: (mine || plain).slice(0, 80),
        isNew: !mine,
        printed: r.printed.slice(0, 80),
        drink: !!mine || (!food && named),
        odd: !mine && !food && !named,
        price: other || r.price == null ? null : Math.round(r.price * 100) / 100,
        size: r.o.size,
        sweet: r.o.sweet,
        ice: r.o.ice,
        milk: r.o.milk,
      });
  });
  const amount = total != null ? total : loose;
  /* nothing to log, but the day may still be on it, for a line you pick yourself */
  if (!items.length && amount == null) return Object.assign({}, none, { date: findDate(text.normalize("NFKC"), ctx.today, code === "USD") });
  const added = rows.reduce((t, r) => t + r.price * r.qty, 0);
  return {
    off: !other && subtotal != null && items.length > 0 && Math.abs(added - subtotal) > 0.011,
    kind: items.length ? "receipt" : "total_only",
    date: findDate(text.normalize("NFKC"), ctx.today, code === "USD"),
    total: other ? null : amount,
    other: other,
    items: items,
  };
}

if (typeof window !== "undefined") Object.assign(window, { SCAN_ICE, SCAN_MILK, SCAN_MAX_ROWS, parseReceipt, receiptLines, lineItem });
