/* js/lib/order.js — an order in the words a counter uses (Show the barista, v120).

   What to order names the drink. The order is the drink plus how you take it, and size, milk, sugar and ice are
   stored on every cup. Show the barista puts the last cup on the whole screen in the counter's own words: in Taipei a
   Large at 25% with less ice is 微糖, 少冰. The drink keeps the name you logged, because nothing here translates free
   text, and a value this table does not have stays in English: the card must never say something you did not order.
   Like text.js and elo.js, the app gets these as globals. */

/** The card's languages, in the order its buttons show. 中文 is one button: traditional characters, or simplified for
    a cafe in mainland China (orderLangFor). @type {[string, string][]} */
export const ORDER_LANGS = [
  ["en", "English"],
  ["zh", "中文"],
  ["ja", "日本語"],
  ["vi", "Tiếng Việt"],
];

/* The sugar levels a counter takes, as a share of full. Taiwan's are named (微糖 is about 30%), and the chains that
   carried them to Japan and Vietnam ask for the same steps by number. */
export const SWEET_LEVELS = [0, 10, 30, 50, 70, 100];

/** The level to ask for when the cup was logged at `pct` percent sweet: the nearest, and on a tie the less sweet,
    since asking for less is the safer mistake (85% is 少糖, not 全糖). Any sugar at all is never 無糖, because "no
    sugar" would be something you did not order (5% is 一分糖).
    @param {number} pct 0 to 100, as the form's slider stores it @returns {number} one of SWEET_LEVELS */
export function sweetLevel(pct) {
  const levels = pct > 0 ? SWEET_LEVELS.slice(1) : SWEET_LEVELS;
  return levels.reduce((best, l) => (Math.abs(l - pct) < Math.abs(best - pct) ? l : best));
}

/* Each language: its tag (so a phone draws 少 in Chinese and not Japanese glyphs), the words for the form's ice and
   milk values (form.js ICS and MILKS), and how it says a sugar level. A value missing here falls back to English. */
/** @typedef {{ tag: string, sweet: (level: number) => string, ice: Record<string, string>, milk: Record<string, string> }} OrderWords */
/** @type {Record<string, OrderWords>} */
const WORDS = {
  zh: {
    tag: "zh-Hant",
    sweet: l => ({ 0: "無糖", 10: "一分糖", 30: "微糖", 50: "半糖", 70: "少糖", 100: "全糖" })[l] || "",
    ice: { "Extra ice": "多冰", "Regular ice": "正常冰", "Less ice": "少冰", "No ice": "去冰", Warm: "溫", Hot: "熱" },
    milk: {
      Whole: "全脂鮮奶", "2%": "低脂鮮奶", Skim: "脫脂鮮奶", Oat: "燕麥奶", Almond: "杏仁奶", Soy: "豆漿",
      Coconut: "椰奶", Macadamia: "夏威夷豆奶", "Lactose-free": "無乳糖牛奶", None: "不加奶",
    },
  },
  zhs: {
    tag: "zh-Hans",
    sweet: l => ({ 0: "无糖", 10: "一分糖", 30: "微糖", 50: "半糖", 70: "少糖", 100: "全糖" })[l] || "",
    ice: { "Extra ice": "多冰", "Regular ice": "正常冰", "Less ice": "少冰", "No ice": "去冰", Warm: "温", Hot: "热" },
    milk: {
      Whole: "全脂牛奶", "2%": "低脂牛奶", Skim: "脱脂牛奶", Oat: "燕麦奶", Almond: "杏仁奶", Soy: "豆浆",
      Coconut: "椰奶", Macadamia: "夏威夷果奶", "Lactose-free": "无乳糖牛奶", None: "不加奶",
    },
  },
  ja: {
    tag: "ja",
    sweet: l => (l === 0 ? "無糖" : "甘さ" + l + "%"),
    ice: { "Extra ice": "氷多め", "Regular ice": "氷普通", "Less ice": "氷少なめ", "No ice": "氷なし", Warm: "ホット・ぬるめ", Hot: "ホット" },
    milk: {
      Whole: "牛乳", "2%": "低脂肪乳", Skim: "無脂肪乳", Oat: "オーツミルク", Almond: "アーモンドミルク", Soy: "豆乳",
      Coconut: "ココナッツミルク", Macadamia: "マカダミアミルク", "Lactose-free": "ラクトースフリーミルク", None: "ミルクなし",
    },
  },
  vi: {
    tag: "vi",
    sweet: l => (l === 0 ? "Không đường" : l + "% đường"),
    ice: { "Extra ice": "Nhiều đá", "Regular ice": "Đá bình thường", "Less ice": "Ít đá", "No ice": "Không đá", Warm: "Ấm", Hot: "Nóng" },
    milk: {
      Whole: "Sữa tươi", "2%": "Sữa ít béo", Skim: "Sữa tách béo", Oat: "Sữa yến mạch", Almond: "Sữa hạnh nhân",
      Soy: "Sữa đậu nành", Coconut: "Sữa dừa", Macadamia: "Sữa hạt mắc ca", "Lactose-free": "Sữa không lactose", None: "Không sữa",
    },
  },
};

/** The order's lines, in the order a counter hears them: size, milk, sugar, ice. Each is the word to show and, when
    that is not English, the English beneath it, which is also the exact value you logged.
    @param {any} o an order @param {string} lang en, zh, zhs, ja or vi
    @returns {{k: string, word: string, gloss: string, lang: string}[]} */
export function orderLines(o, lang) {
  if (!o) return [];
  const w = WORDS[lang] || null;
  /** @type {{k: string, word: string, gloss: string, lang: string}[]} */
  const out = [];
  /** @param {string} k @param {string} en @param {string} [there] */
  const add = (k, en, there) =>
    out.push(there && w ? { k: k, word: there, gloss: en, lang: w.tag } : { k: k, word: en, gloss: "", lang: "en" });

  const size = String(o.size || "").trim();
  const oz = /^(\d+(?:\.\d+)?)\s*oz$/i.exec(size);
  /* A counter abroad reads millilitres; to the nearest 10, which is how cup sizes are printed (16 oz is 470 ml). */
  if (size) add("size", size, oz ? Math.round((+oz[1] * 29.5735) / 10) * 10 + " ml" : "");

  const milk = String(o.milk || "").trim();
  if (milk) add("milk", milk === "None" ? "No milk" : /milk|half/i.test(milk) ? milk : milk + " milk", w ? w.milk[milk] : "");

  const pct = parseInt(String(o.sweet == null ? "" : o.sweet).replace(/[^0-9]/g, ""), 10);
  if (!isNaN(pct)) {
    const p = Math.max(0, Math.min(100, pct));
    add("sweet", p === 0 ? "No sugar" : p + "% sugar", w ? w.sweet(sweetLevel(p)) : "");
  }

  const ice = String(o.ice || "").trim();
  if (ice) add("ice", ice, w ? w.ice[ice] : "");
  return out;
}

/** The language a cafe's counter speaks, from its country code (c.cc) or the country the map files it under.
    @param {any} cc @param {any} [country] @returns {string} en, zh, zhs, ja or vi */
export function orderLangFor(cc, country) {
  const c = String(cc || "").toUpperCase();
  const n = String(country || "");
  if (c === "CN") return "zhs";
  if (c === "TW" || c === "HK" || c === "MO" || n === "Taiwan" || n === "Hong Kong") return "zh";
  if (c === "JP" || n === "Japan") return "ja";
  if (c === "VN" || n === "Vietnam") return "vi";
  return "en";
}

if (typeof window !== "undefined") Object.assign(window, { ORDER_LANGS, SWEET_LEVELS, sweetLevel, orderLines, orderLangFor });
