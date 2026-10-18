"use strict";
/* stats.js — Stats pane.
   Loaded by index.html; script order matters (config first, boot last). */

/* A visit is ONE DISTINCT DAY at one cafe. The old screen summed drink rows, so ordering
   three drinks in one sitting read as three visits and single-visit cafes topped the
   "most revisited" board. The hero, the rhythm chart and the "went back" tile all read
   through here so the three finally agree on what a visit is. */
function visitDates(c) {
  const s = {};
  ((c && c.drinks) || []).forEach(function (d) {
    drinkOrders(d).forEach(function (o) {
      if (o.date) s[o.date] = 1;
    });
  });
  return Object.keys(s).sort();
}
/* One re-collapsible fold for both lists, operating on the block right before the button —
   replaces two ad-hoc show-more buttons that minted class names off a global counter and
   removed themselves so they could never close again. */
function statFold(btn) {
  const box = btn.previousElementSibling;
  if (!box) return;
  const open = box.hasAttribute("data-open");
  if (open) box.removeAttribute("data-open");
  else box.setAttribute("data-open", "");
  btn.textContent = (btn.dataset.lab || "Show more") + (open ? " ▾" : " ▴");
}
/* Stats was one 4,800px scroll of fourteen cards. It is three tabs now: You (who you are as a drinker),
   Habits (when you go) and Money (what it costs). Every card is still rendered, so nothing that reads
   the page loses anything; the other two tabs are simply hidden. */
let _statsTab = "you";
function setStatsTab(t) {
  if (t !== "you" && t !== "habits" && t !== "money") return;
  _statsTab = t;
  renderStats();
}
let _rhythmMetric = "spend",
  _rhythmMonth = "";
function setRhythmMetric(metric) {
  if (metric !== "visits" && metric !== "spend") return;
  _rhythmMetric = metric;
  renderStats();
}
function setRhythmMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  _rhythmMonth = month;
  renderStats();
}

/* ---------- cadence, price and taste charts ----------
   Plain SVG and CSS, coloured from the theme tokens. Nothing here reads a location, an area or
   a review, so a private spot contributes only a count and a date. Text is sized in CSS
   (.sc-svg text) so the type scale holds, and every chart states its own coverage. */
const STAT_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function statMoney(n) {
  return "$" + (n || 0).toFixed(2);
}
function statDayKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function statMonthLabel(k) {
  return STAT_MON[+k.slice(5, 7) - 1] + " " + k.slice(0, 4);
}
function statStreak(days) {
  let best = 0,
    cur = 0,
    prev = null;
  days.forEach(function (d) {
    const t = new Date(d + "T12:00:00").getTime();
    cur = prev !== null && Math.round((t - prev) / 864e5) === 1 ? cur + 1 : 1;
    prev = t;
    if (cur > best) best = cur;
  });
  return best;
}
/* One cell per day for the last 30 weeks, shaded by how many cafes that day. */
function statHeat(dayCount) {
  const WK = 30,
    cell = 11,
    gap = 2,
    gx = 18,
    gy = 18;
  const end = new Date();
  end.setHours(12, 0, 0, 0);
  const endSat = new Date(end);
  endSat.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(endSat);
  start.setDate(endSat.getDate() - (WK * 7 - 1));
  const shade = [0, 0.45, 0.7, 0.9, 1];
  let cells = "",
    labels = "",
    lastM = -1;
  for (let w = 0; w < WK; w++) {
    for (let d = 0; d < 7; d++) {
      const dt = new Date(start);
      dt.setDate(start.getDate() + w * 7 + d);
      if (dt > end) continue;
      const key = statDayKey(dt),
        v = dayCount[key] || 0,
        x = gx + w * (cell + gap);
      cells +=
        '<rect class="hc' + (v ? " on" : "") + '" x="' + x + '" y="' + (gy + d * (cell + gap)) +
        '" width="' + cell + '" height="' + cell + '" rx="3"' + (v ? ' fill-opacity="' + shade[Math.min(4, v)] + '"' : "") +
        "><title>" + key + ": " + v + " visit" + (v === 1 ? "" : "s") + "</title></rect>";
      if (d === 0 && dt.getMonth() !== lastM && dt.getDate() <= 7) {
        labels += '<text x="' + x + '" y="12">' + STAT_MON[dt.getMonth()] + "</text>";
        lastM = dt.getMonth();
      }
    }
  }
  const rows = ["M", "W", "F"]
    .map(function (l, i) {
      return '<text x="0" y="' + (gy + (i * 2 + 1) * (cell + gap) + 10) + '">' + l + "</text>";
    })
    .join("");
  return (
    '<svg class="sc-svg heat" viewBox="0 0 ' + (gx + WK * (cell + gap)) + " " + (gy + 7 * (cell + gap)) +
    '" role="img" aria-label="Visits per day over the last 30 weeks">' + labels + rows + cells + "</svg>"
  );
}
/* A ring split by verdict. Colours are the map's own, so a loved cafe is the same green here. */
function statDonut(items, centre, label) {
  const R = 44,
    C = 2 * Math.PI * R,
    tot =
      items.reduce(function (s, i) {
        return s + i.n;
      }, 0) || 1;
  let off = 0,
    segs = "";
  items.forEach(function (i) {
    if (!i.n) return;
    const len = (C * i.n) / tot,
      vis = Math.max(1, len - 2);
    segs +=
      '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + i.color + '" stroke-width="16" stroke-dasharray="' +
      vis.toFixed(2) + " " + (C - vis).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) +
      '" transform="rotate(-90 60 60)"><title>' + i.label + ": " + i.n + "</title></circle>";
    off += len;
  });
  return (
    '<svg class="sc-svg donut" viewBox="0 0 120 120" role="img" aria-label="' + label + '">' + segs +
    '<text class="big" x="60" y="62" text-anchor="middle">' + centre + '</text><text x="60" y="80" text-anchor="middle">rated</text></svg>'
  );
}
function statHist(prices) {
  const hi = Math.max(8, Math.min(24, Math.ceil(Math.max.apply(null, prices)))),
    bins = [];
  for (let i = 0; i < hi; i++) bins.push(0);
  prices.forEach(function (p) {
    bins[Math.max(0, Math.min(hi - 1, Math.floor(p) - 1))]++;
  });
  const W = 320,
    H = 150,
    l = 4,
    b = 22,
    t = 10,
    bw = (W - l * 2) / hi,
    mx = Math.max.apply(null, bins),
    med = median(prices),
    mxp = ((med - 1) / hi) * (W - l * 2) + l,
    step = hi > 14 ? 4 : 2;
  let bars = "",
    axis = "";
  bins.forEach(function (v, i) {
    const h = v ? Math.max(3, (v / mx) * (H - b - t - 14)) : 0;
    bars +=
      '<rect class="hb" x="' + (l + i * bw + 2) + '" y="' + (H - b - h) + '" width="' + (bw - 4) + '" height="' + h +
      '" rx="3"><title>$' + (i + 1) + " to $" + (i + 2) + ": " + v + " drinks</title></rect>" +
      (v ? '<text x="' + (l + i * bw + bw / 2) + '" y="' + (H - b - h - 4) + '" text-anchor="middle">' + v + "</text>" : "");
  });
  for (let v = step; v <= hi; v += step)
    axis += '<text x="' + (l + (v - 1) * bw) + '" y="' + (H - 6) + '" text-anchor="middle">$' + v + "</text>";
  return (
    '<svg class="sc-svg" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Drink prices, most common ' + statMoney(med) + '">' +
    bars + axis + '<line class="medln" x1="' + mxp + '" x2="' + mxp + '" y1="' + t + '" y2="' + (H - b) + '"/>' +
    '<text class="acct" x="' + (W - l) + '" y="' + (t + 8) + '" text-anchor="end">median ' + statMoney(med) + "</text></svg>"
  );
}
function statBarRows(items) {
  const mx = Math.max.apply(
    null,
    items
      .map(function (i) {
        return i.n;
      })
      .concat([1])
  );
  return (
    '<div class="hbars">' +
    items
      .map(function (i) {
        return (
          '<div class="hb-row"><span class="hb-nm">' + esc(i.label) + '</span><span class="hb-tr"><i style="width:' +
          (i.n / mx) * 100 + '%"></i></span><span class="hb-v">' + (i.text != null ? i.text : i.n) + "</span></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

/* ---------- Wrapped: drink DNA, worth it, chains and independents ----------
   Everything here is counted from what is already stored; nothing is estimated, and each card says
   how much of the data it stood on. No location, area or review is read — a brand name and a count
   are all a private spot contributes. */
const STAT_SEG = ["var(--acc)", "var(--want)", "var(--good)", "var(--mid)", "var(--soft)"];
/** The top few values of a counter, with everything else folded into "Other". */
function statGroups(counter, keep) {
  const keys = Object.keys(counter).sort(function (a, b) {
    return counter[b] - counter[a] || (a < b ? -1 : 1);
  });
  const items = keys.slice(0, keep).map(function (k) {
    return { label: k === "0%" ? "No sugar" : k, n: counter[k] };
  });
  const rest = keys.slice(keep).reduce(function (s, k) {
    return s + counter[k];
  }, 0);
  if (rest) items.push({ label: "Other", n: rest });
  return items;
}
function statStack(items) {
  const tot =
    items.reduce(function (s, i) {
      return s + i.n;
    }, 0) || 1;
  return (
    '<div class="sc-stack" role="img" aria-label="' +
    items
      .map(function (i) {
        return esc(i.label) + " " + i.n;
      })
      .join(", ") +
    '">' +
    items
      .map(function (i, ix) {
        return '<span style="width:' + (i.n / tot) * 100 + "%;background:" + STAT_SEG[ix % STAT_SEG.length] + '" title="' + esc(i.label) + " · " + i.n + '"></span>';
      })
      .join("") +
    "</div>"
  );
}
function statLegend(items, total) {
  return (
    '<div class="legrows inl">' +
    items
      .map(function (i, ix) {
        return (
          '<div><i style="background:' + STAT_SEG[ix % STAT_SEG.length] + '"></i><span>' + esc(i.label) + "</span><b>" + i.n + " \u00b7 " +
          Math.round((i.n / (total || 1)) * 100) + "%</b></div>"
        );
      })
      .join("") +
    "</div>"
  );
}

/* ---------- Wrapped: the year, told back to you ----------
   A strip of small cards at the top of You: visits, your drink, where you went back, your busiest month,
   how you take it, and Share. Every number is counted from what Stats already counts (visitDates,
   drinkOrders); nothing is stored, and no area, coordinate or review is read, so a private spot is a
   name, a count and a date here and nowhere else. No money: spend stays in Money, for the owner. It stays
   out of the way until the year has WRAP_FLOOR visits, so it never opens on "1 visit". */
const WRAP_FLOOR = 20;
const WRAP_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** @param {Cafe[]} list the visited cafes, never the wishlist @param {number} year @returns {any} */
function wrappedYear(list, year) {
  const Y = String(year);
  let visits = 0,
    cafeN = 0,
    fresh = 0,
    back = null;
  const series = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fam = {},
    shown = {},
    sweet = {},
    milk = {};
  let sweetN = 0,
    milkN = 0;
  list.forEach(function (c) {
    if (c.wish) return;
    const all = visitDates(c),
      vd = all.filter(function (d) {
        return d.slice(0, 4) === Y;
      });
    if (!vd.length) return;
    cafeN++;
    visits += vd.length;
    if (all[0].slice(0, 4) === Y) fresh++;
    if (!c.custom && (!back || vd.length > back.n)) back = { name: c.name || "", n: vd.length };
    vd.forEach(function (d) {
      series[parseInt(d.slice(5, 7), 10) - 1]++;
    });
    (c.drinks || []).forEach(function (d) {
      const f = /hoji/i.test(d.n || "") ? "Hojicha latte" : (d.n || "").trim();
      drinkOrders(d).forEach(function (o) {
        if (!o.date || o.date.slice(0, 4) !== Y) return;
        const q = orderQty(o);
        if (f) {
          /* "Flat White" and "Flat white" are one drink */
          const k = f.toLowerCase();
          if (!shown[k]) shown[k] = f;
          fam[k] = (fam[k] || 0) + q;
        }
        if (o.sweet) {
          sweet[o.sweet] = (sweet[o.sweet] || 0) + q;
          sweetN += q;
        }
        if (o.milk) {
          milk[o.milk] = (milk[o.milk] || 0) + q;
          milkN += q;
        }
      });
    });
  });
  if (visits < WRAP_FLOOR) return null;
  const rank = function (m) {
    return Object.keys(m)
      .sort(function (a, b) {
        return m[b] - m[a] || (a < b ? -1 : 1);
      })
      .map(function (k) {
        return { name: shown[k] || k, n: m[k] };
      });
  };
  const drinks = rank(fam),
    milks = rank(milk);
  let hi = 0;
  series.forEach(function (v, i) {
    if (v > series[hi]) hi = i;
  });
  const second = series
    .map(function (v, i) {
      return { i: i, v: v };
    })
    .filter(function (x) {
      return x.i !== hi && x.v > 0;
    })
    .sort(function (a, b) {
      return b.v - a.v;
    })[0];
  return {
    year: year,
    visits: visits,
    cafes: cafeN,
    fresh: fresh,
    drink: drinks[0] || null,
    next: drinks[1] || null,
    back: back && back.n > 1 ? back : null,
    series: series,
    peak: { i: hi, n: series[hi] },
    runner: second || null,
    months: series.filter(function (v) {
      return v > 0;
    }).length,
    noSugar: sweetN >= 10 ? { n: sweet["0%"] || 0, of: sweetN } : null,
    milk: milkN >= 5 && milks[0] ? { name: milks[0].name, pct: Math.round((milks[0].n / milkN) * 100) } : null,
  };
}
/** This year once it has WRAP_FLOOR visits; until then last year's, so the year in review is there in January. */
function wrappedPick(list) {
  const y = new Date().getFullYear(),
    now = wrappedYear(list, y);
  if (now) return { w: now, review: false };
  const last = wrappedYear(list, y - 1);
  return last ? { w: last, review: true } : null;
}
function wrappedCards(w, review) {
  const cards = [];
  cards.push({
    k: w.year + (review ? " in review" : " so far"),
    big: String(w.visits),
    unit: "visits",
    cap:
      "At " +
      w.cafes +
      (w.cafes === 1 ? " caf\u00e9" : " caf\u00e9s") +
      (w.fresh ? ". " + (w.fresh === w.cafes ? "All" : w.fresh) + " of them new to you." : "."),
    tint: "var(--acc)",
  });
  if (w.drink)
    cards.push({
      k: "Your drink",
      big: w.drink.name,
      sm: 1,
      unit: "\u00d7" + w.drink.n,
      cap: w.next
        ? w.drink.n >= w.next.n * 2
          ? w.next.name + " is a distant second, at " + w.next.n + "."
          : "Next is " + w.next.name + ", at " + w.next.n + "."
        : "",
      tint: "var(--good)",
    });
  if (w.back)
    cards.push({
      k: "You went back",
      big: w.back.name,
      sm: 1,
      unit: w.back.n + " visits",
      cap: "More than anywhere else this year.",
      tint: "var(--want)",
    });
  if (w.months >= 2)
    cards.push({
      k: "Busiest month",
      big: WRAP_MONTHS[w.peak.i],
      sm: 1,
      unit: w.peak.n + " visits",
      cap: w.runner ? WRAP_MONTHS[w.runner.i] + " was next, with " + w.runner.v + "." : "",
      tint: "var(--acc)",
      bars: w.series,
      hi: w.peak.i,
    });
  if (w.noSugar && w.noSugar.n / w.noSugar.of >= 0.5)
    cards.push({
      k: "How you take it",
      big: Math.round((w.noSugar.n / w.noSugar.of) * 100) + "%",
      unit: "no sugar",
      cap:
        w.noSugar.n +
        " of " +
        w.noSugar.of +
        " drinks." +
        (w.milk && w.milk.pct >= 60 ? " And " + w.milk.pct + "% of the milk was " + w.milk.name.toLowerCase() + "." : ""),
      tint: "var(--good)",
    });
  return cards;
}
function wrappedHTML(list) {
  const pick = wrappedPick(list);
  if (!pick) return "";
  const w = pick.w,
    cards = wrappedCards(w, pick.review);
  const bars = function (series, hi) {
    const mx = Math.max.apply(null, series) || 1;
    return (
      '<div class="wbars" aria-hidden="true">' +
      series
        .map(function (v, i) {
          return "<i" + (i === hi ? ' class="hi"' : "") + ' style="height:' + Math.max(6, Math.round((v / mx) * 100)) + '%"></i>';
        })
        .join("") +
      "</div>"
    );
  };
  const html = cards.map(function (c) {
    return (
      '<div class="wc' + (c.sm ? " sm" : "") + '" style="--tint:' + c.tint + '"><span class="wk">' + esc(c.k) + "</span>" +
      (c.bars ? bars(c.bars, c.hi) : "") +
      '<div class="big">' + esc(c.big) + "<small>" + esc(c.unit) + "</small></div>" +
      (c.cap ? '<span class="wcap">' + esc(c.cap) + "</span>" : "") +
      "</div>"
    );
  });
  html.push(
    '<div class="wc share admin-only"><span class="wk">Keep it</span><div class="wcap strong">Send your ' +
      w.year +
      ' in caf\u00e9s to someone.</div><button type="button" class="admin-only" onclick="openYearStory()">Share \u203a</button></div>'
  );
  return (
    '<section class="wrapped" aria-label="Your ' + w.year + '">' +
    '<div class="sech"><b>Your ' + w.year + "</b>" + (pick.review ? '<span class="wrev">in review</span>' : "") + '<button type="button" class="admin-only" onclick="openYearStory()">Share \u203a</button></div>' +
    '<div class="wstrip" role="region" aria-label="Your ' + w.year + ', swipe for more" tabindex="0" onscroll="wrappedDots(this)">' +
    html.join("") +
    "</div>" +
    '<div class="wdots" aria-hidden="true">' +
    html.map(function (_, i) { return "<i" + (i ? "" : ' class="on"') + "></i>"; }).join("") +
    "</div></section>"
  );
}
function wrappedDots(el) {
  const k = el.children;
  if (k.length < 2) return;
  const step = k[1].offsetLeft - k[0].offsetLeft || 1,
    dots = el.nextElementSibling ? el.nextElementSibling.children : [];
  const at = Math.min(dots.length - 1, Math.max(0, Math.round(el.scrollLeft / step)));
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle("on", i === at);
}
/* Text only, from the same counts. It names no area and quotes no review; the link is the app's front door. */
function wrappedText(w) {
  const bits = [
    "My " + w.year + " in caf\u00e9s: " + w.visits + " visits at " + w.cafes + (w.cafes === 1 ? " caf\u00e9" : " caf\u00e9s") + (w.fresh ? " (" + w.fresh + " new)" : "") + ".",
  ];
  if (w.drink) bits.push("Most ordered: " + w.drink.name + " \u00d7" + w.drink.n + ".");
  if (w.back) bits.push("Went back to " + w.back.name + " " + w.back.n + " times.");
  return bits.join(" ");
}
function renderStats() {
  const host = $("stats-body");
  if (!host) return;
  const money = function (n) {
    return "$" + (n || 0).toFixed(2);
  };
  const dpr = function (d) {
    const n = parseFloat(String((d && d.p) || "").replace(/[^0-9.]/g, ""));
    return isNaN(n) ? 0 : n;
  };
  const nonWish = cafes.filter(function (c) {
    return !c.wish;
  });
  const wishN = cafes.length - nonWish.length;

  /* ---------- one pass over the corpus ---------- */
  let nDrinkRows = 0,
    nPriced = 0,
    spend = 0,
    nVisits = 0;
  const allDays = {},
    dayCount = {},
    pricedList = [],
    orderRows = [],
    monthVisit = {},
    monthUnits = {},
    monthPriced = {},
    monthSpend = {};
  const sweetC = {},
    iceC = {},
    milkC = {},
    sizeC = {},
    tagC = {},
    drinkFam = {};
  const bump = function (m, k, n) {
    if (k) m[k] = (m[k] || 0) + (n || 1);
  };
  nonWish.forEach(function (c) {
    visitDates(c).forEach(function (dt) {
      nVisits++;
      allDays[dt] = 1;
      dayCount[dt] = (dayCount[dt] || 0) + 1;
      bump(monthVisit, dt.slice(0, 7));
    });
    (c.tags || []).forEach(function (t) {
      bump(tagC, t);
    });
    (c.drinks || []).forEach(function (d) {
      const fam = /hoji/i.test(d.n || "") ? "Hojicha latte" : (d.n || "").trim();
      drinkOrders(d).forEach(function (o) {
        const q = orderQty(o),
          p = dpr(o);
        nDrinkRows += q;
        orderRows.push({ c: c, dn: d.n || "", fam: fam, o: o, q: q, p: p });
        if (p > 0) {
          nPriced += q;
          pricedList.push({ p: p, q: q, d: o.date || "", cc: c.cc || "" });
        }
        spend += p * q;
        bump(sweetC, o.sweet, q);
        bump(iceC, o.ice, q);
        bump(milkC, o.milk, q);
        bump(sizeC, o.size, q);
        if (fam) drinkFam[fam] = (drinkFam[fam] || 0) + q;
        if (o.date) {
          const k = o.date.slice(0, 7);
          bump(monthUnits, k, q);
          if (p > 0) {
            bump(monthPriced, k, q);
            monthSpend[k] = (monthSpend[k] || 0) + p * q;
          }
        }
      });
    });
  });
  const datedN = nonWish.filter(function (c) {
    return visitDates(c).length > 0;
  }).length;
  const backN = nonWish.filter(function (c) {
    return visitDates(c).length > 1;
  }).length;
  const undatedN = nonWish.length - datedN;
  const onceN = datedN - backN;
  const daysOut = Object.keys(allDays).length;
  const firstDay = Object.keys(allDays).sort()[0] || "";
  const top = function (m) {
    const k = Object.keys(m).sort(function (a, b) {
      return m[b] - m[a];
    });
    return k.length ? [k[0], m[k[0]]] : null;
  };
  /* The bar under each row encoded a magnitude the row already prints beside it, competing
     with the monthly chart, which draws data you cannot otherwise see. Rows are separated by
     a rule now, and the figure does the comparing. */
  const magRow = function (rank, name, sub, val, onclick) {
    return (
      '<div class="lbrow one' +
      (onclick ? " tap" : "") +
      '"' +
      (onclick ? ' role="button" tabindex="0" onclick="' + onclick + '"' : "") +
      ">" +
      (rank !== null ? '<span class="lbrank">' + rank + "</span>" : "") +
      '<div class="lbmain"><div class="lbname">' +
      esc(name) +
      (sub ? " <i>· " + esc(sub) + "</i>" : "") +
      "</div></div>" +
      '<span class="lbscore">' +
      val +
      "</span></div>"
    );
  };
  let h = "";
  /** @type {[number, string][]} */
  const _marks = [[0, "you"]];
  const mark = function (tab) {
    _marks.push([h.length, tab]);
  };

  h += wrappedHTML(nonWish);

  /* ---------- 0. the collection at a glance ----------
     Stats opened straight into data about cafes. The same figures, led with as what the
     collection IS, is the first thing every app of this shape shows — and it costs nothing,
     because the pass above already counted all of it. */
  const _nCtry = countryCount(nonWish);
  let _famName = "",
    _famN = 0;
  Object.keys(drinkFam).forEach(function (k) {
    if (drinkFam[k] > _famN) {
      _famN = drinkFam[k];
      _famName = k;
    }
  });
  const _fig = function (v, k) {
    return '<div class="pfig"><b>' + v + "</b><span>" + k + "</span></div>";
  };
  h +=
    '<div class="profile">' +
    _fig(nonWish.length, "cafes") +
    (_nCtry ? _fig(_nCtry, _nCtry === 1 ? "country" : "countries") : "") +
    _fig(nVisits, "visits") +
    _fig(nDrinkRows, "drinks") +
    "</div>";
  /* The days-out figure lived as the subtitle of a Visits card that duplicated the band
     above; the card went, the fact moves here. "N ranked head to head" went with nothing to
     replace it — it repeated the cafe count a third time. */
  const _tail = [];
  if (_famName) _tail.push("Most ordered: <b>" + esc(_famName) + "</b>");
  if (daysOut)
    _tail.push(
      "<b>" + daysOut + "</b> days out" + (firstDay ? " since " + esc(fmtDate(firstDay).replace(/ \d+,/, "")) : "")
    );
  if (wishN) _tail.push("<b>" + wishN + "</b> still to try");
  if (_tail.length) h += '<div class="pline">' + _tail.join(" \u00b7 ") + "</div>";

  /* The distance origin for "Where you go" below. It used to come from the recommendation
     picker that sat here; with that gone it follows your actual location when the app knows
     it, and otherwise falls back to the map's default centre. */
  const CA_HOME = userLoc || { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] };

  /* ---------- 2. vitals ---------- */
  const backPct = datedN ? Math.round((backN / datedN) * 100) : 0;
  const pricedPct = nDrinkRows ? Math.round((nPriced / nDrinkRows) * 100) : 0;
  /* Two cards fewer than it had: "Cafes visited" and "Visits" repeated the band above,
     300px apart — 106 printed three times in the first screen of the page. What only they
     carried (the wishlist count, days out) lives in the pline now. */
  h +=
    '<div class="statgrid">' +
    '<div class="statcard"><div class="v">' +
    backN +
    '<span class="of"> / ' +
    datedN +
    '</span></div><div class="k">Went back</div><div class="s"><span class="sc-meter g"><i style="width:' +
    backPct +
    '%"></i></span>' +
    backPct +
    "% \u00b7 " +
    onceN +
    " once, " +
    undatedN +
    " undated</div></div>" +
    '<div class="statcard"><div class="v">' +
    cafes.filter(function (c) {
      return c.fav;
    }).length +
    '</div><div class="k">Favourites</div><div class="s">of the ' +
    nonWish.filter(function (c) {
      return c.rating;
    }).length +
    " cafes you rated</div></div>" +
    "</div>";
  /* what you spent is a Money fact, and the owner's alone */
  mark("money");
  if (isAdmin)
    h +=
      '<div class="statgrid"><div class="statcard"><div class="v">' +
      money(spend) +
      '</div><div class="k">Spent</div><div class="s"><span class="sc-meter"><i style="width:' +
      pricedPct +
      '%"></i></span>' +
      nPriced +
      " of " +
      nDrinkRows +
      " drinks priced</div></div></div>";

  mark("habits");
  /* ---------- 3. rhythm ---------- */
  const d0 = new Date(),
    mk = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(d0.getFullYear(), d0.getMonth() - i, 1);
    mk.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  const inWindow = mk.reduce(function (s, k) {
    return s + (monthVisit[k] || 0);
  }, 0);
  const earlier = nVisits - inWindow;
  const latestK =
    mk
      .slice()
      .reverse()
      .find(function (k) {
        return monthVisit[k] || 0 || monthUnits[k] || 0;
      }) || mk[11];
  const selectedK = mk.indexOf(_rhythmMonth) >= 0 ? _rhythmMonth : latestK;
  const metric = isAdmin && _rhythmMetric === "spend" ? "spend" : "visits";
  const selectedVisits = monthVisit[selectedK] || 0,
    selectedUnits = monthUnits[selectedK] || 0;
  const selectedPriced = monthPriced[selectedK] || 0,
    selectedSpend = monthSpend[selectedK] || 0;
  const selectedCoverage = selectedUnits ? Math.round((selectedPriced / selectedUnits) * 100) : 0;
  const values = mk.map(function (k) {
    return metric === "spend" ? monthSpend[k] || 0 : monthVisit[k] || 0;
  });
  const maxValue = Math.max(1, Math.max.apply(null, values));
  const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const monthNameFor = function (k) {
    return MONTH_NAMES[+k.slice(5, 7) - 1];
  };
  const monthName = monthNameFor(selectedK);
  let rhythmHeadline, rhythmSub;
  if (metric === "spend") {
    rhythmHeadline = selectedUnits
      ? selectedPriced
        ? money(selectedSpend) + " recorded"
        : "No prices recorded"
      : "No visits logged";
    rhythmSub = selectedUnits
      ? selectedPriced +
        " of " +
        selectedUnits +
        " drink" +
        (selectedUnits === 1 ? "" : "s") +
        " priced · " +
        selectedCoverage +
        "% coverage"
      : "Tap an earlier month to see its total";
  } else {
    rhythmHeadline = selectedVisits + " visit" + (selectedVisits === 1 ? "" : "s");
    rhythmSub = selectedVisits ? "Distinct cafe-days logged" : "Tap an earlier month to see its visits";
  }
  const MOL = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  h +=
    '<div class="statsec">Monthly activity \u00b7 last 12 months</div><div class="statcard rhythm">' +
    (isAdmin
      ? '<div class="rseg" aria-label="Monthly metric"><button type="button" class="' +
        (metric === "visits" ? "on" : "") +
        '" aria-pressed="' +
        (metric === "visits") +
        '" onclick="setRhythmMetric(\'visits\')">Visits</button><button type="button" class="' +
        (metric === "spend" ? "on" : "") +
        '" aria-pressed="' +
        (metric === "spend") +
        '" onclick="setRhythmMetric(\'spend\')">Spending</button></div>'
      : "") +
    '<div class="rhead"><b>' +
    rhythmHeadline +
    "</b> in " +
    monthName +
    "<span>" +
    rhythmSub +
    "</span></div>" +
    '<div class="rchart">' +
    mk
      .map(function (k) {
        const v = monthVisit[k] || 0,
          units = monthUnits[k] || 0,
          pr = monthPriced[k] || 0;
        const amount = metric === "spend" ? monthSpend[k] || 0 : v;
        const hgt = amount ? Math.max(6, Math.round((amount / maxValue) * 72)) : 3;
        const coverage = units ? Math.round((pr / units) * 100) : 0;
        const aria = (
          isAdmin
            ? [
                monthNameFor(k) + " " + k.slice(0, 4),
                money(monthSpend[k] || 0) + " recorded",
                v + " visit" + (v === 1 ? "" : "s"),
                coverage + "% price coverage",
              ]
            : [monthNameFor(k) + " " + k.slice(0, 4), v + " visit" + (v === 1 ? "" : "s")]
        ).join(", ");
        return (
          '<button type="button" class="rcol' +
          (k === selectedK ? " on" : "") +
          '" aria-pressed="' +
          (k === selectedK) +
          '" onclick="setRhythmMonth(\'' +
          k +
          '\')" aria-label="' +
          aria +
          '"><span class="rbar' +
          (amount ? " has" : "") +
          '" style="height:' +
          hgt +
          'px"></span>' +
          (isAdmin ? '<span class="rcov"><i style="width:' + coverage + '%"></i></span>' : "") +
          '<span class="rlab">' +
          MOL[+k.slice(5, 7) - 1] +
          "</span></button>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="statnote">' +
    (isAdmin
      ? metric === "spend"
        ? "Bar: spend. Green line: share of drinks with a price. "
        : "Bar: cafe visits. Green line: share of drinks with a price. "
      : "Tap a month for its visits. ") +
    (earlier > 0 ? "Earlier: " + earlier + " visits before this window." : "") +
    "</div>" +
    "</div>";

  /* ---------- 3b. cadence: heatmap, busiest month, longest streak ---------- */
  const dayKeys = Object.keys(allDays).sort();
  if (dayKeys.length >= 3) {
    const cutoff = statDayKey(new Date(Date.now() - 210 * 86400000));
    const recent = dayKeys.reduce(function (s, d) {
      return d >= cutoff ? s + dayCount[d] : s;
    }, 0);
    const busiest = Object.keys(monthVisit).sort(function (a, b) {
      return monthVisit[b] - monthVisit[a] || (a < b ? 1 : -1);
    })[0];
    h +=
      '<div class="statsec">Cadence</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + recent + "</b> cafe visits in the last 30 weeks</div>" +
      statHeat(dayCount) +
      '<div class="sc-duo"><div><span>Busiest month</span><b>' + statMonthLabel(busiest) + "</b><i>" + monthVisit[busiest] +
      ' cafe-days</i></div><div><span>Longest streak</span><b>' + statStreak(dayKeys) + ' days</b><i>in a row with a visit</i></div></div>' +
      '<div class="statnote">Counted from ' + nVisits + " dated cafe-days; undated visits are left out.</div></div>";
  }

  mark("money");
  /* ---------- 5b. price spread ---------- */
  const allPrices = [];
  pricedList.forEach(function (x) {
    for (let i = 0; i < x.q; i++) allPrices.push(x.p);
  });
  if (allPrices.length >= 5) {
    h +=
      '<div class="statsec">Price spread</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>Median ' + statMoney(median(allPrices)) + "</b> · from " + statMoney(Math.min.apply(null, allPrices)) +
      " to " + statMoney(Math.max.apply(null, allPrices)) + "</div>" + statHist(allPrices) +
      '<div class="statnote">' + allPrices.length + " of " + nDrinkRows + " drinks have a price. Missing prices are not estimated.</div></div>";
  }

  mark("you");
  /* ---------- 6. drink DNA ----------
     "Your usual" printed the single most common value of each option as a chip, which hid the
     shape: 86% no sugar and 96% oat is a very different story from 51% and 52%. Each option is
     now a bar of its whole spread, under the sentence the chips used to add up to. */
  const tSweet = top(sweetC),
    tIce = top(iceC),
    tMilk = top(milkC),
    tSize = top(sizeC),
    tFam = top(drinkFam);
  if (tFam || tSweet || tIce) {
    const words = [];
    if (tFam) words.push(tFam[0]);
    if (tSweet) words.push(tSweet[0] === "0%" ? "no sugar" : tSweet[0] + " sweet");
    if (tIce) words.push(tIce[0].toLowerCase());
    if (tMilk) words.push(tMilk[0].toLowerCase());
    if (tSize) words.push(tSize[0]);
    const sum = function (m) {
      return Object.keys(m).reduce(function (s, k) {
        return s + m[k];
      }, 0);
    };
    /* the priciest drink you have only ever ordered once: the one you took a chance on */
    const famSeen = {};
    orderRows.forEach(function (x) {
      if (x.fam) famSeen[x.fam] = (famSeen[x.fam] || 0) + x.q;
    });
    const gamble = orderRows
      .filter(function (x) {
        return x.fam && famSeen[x.fam] === 1 && x.p > 0;
      })
      .sort(function (a, b) {
        return b.p - a.p;
      })[0];
    /* the cafe where you tried the most different drinks */
    const adv = nonWish
      .map(function (c) {
        const s = {};
        (c.drinks || []).forEach(function (d) {
          s[/hoji/i.test(d.n || "") ? "Hojicha latte" : (d.n || "").trim()] = 1;
        });
        return { c: c, n: Object.keys(s).length };
      })
      .sort(function (a, b) {
        return b.n - a.n;
      })[0];
    const rows = [
      ["Sweetness", sweetC, 4],
      ["Ice or heat", iceC, 4],
      ["Milk", milkC, 3],
      ["Size", sizeC, 4],
    ].filter(function (r) {
      return sum(r[1]) > 0;
    });
    h +=
      '<div class="statsec">Drink DNA</div><div class="statcard sc-wide usualcard">' +
      '<div class="usual">' + esc(words.join(", ")) + ".</div>" +
      '<div class="sc-duo"><div><span>Most loyal order</span><b>' + esc(tFam ? tFam[0] : "") + "</b><i>" + (tFam ? tFam[1] : 0) +
      " drinks</i></div><div><span>Biggest gamble</span><b>" + esc(gamble ? gamble.fam : "None") + "</b><i>" +
      (gamble ? statMoney(gamble.p) + " once, at " + esc(gamble.c.name) : "nothing ordered only once is priced") + "</i></div></div>" +
      rows
        .map(function (r) {
          const g = statGroups(r[1], r[2]),
            t = sum(r[1]);
          return '<div class="sc-cap">' + r[0] + " \u00b7 " + Math.round((g[0].n / t) * 100) + "% " + esc(g[0].label.toLowerCase()) + "</div>" + statStack(g) + statLegend(g, t);
        })
        .join("") +
      '<div class="statnote">' + (adv && adv.n > 1 ? "Most adventurous: <b>" + esc(adv.c.name) + "</b>, " + adv.n + " different drinks. " : "") +
      "Counted from " + sum(sweetC) + " of " + nDrinkRows + " drinks with a sweetness set.</div></div>";
  }

  mark("money");
  /* ---------- 6a. worth it: do you reorder it, and what does it cost ---------- */
  const verdicts = { yes: 0, neutral: 0, no: 0 },
    vPrice = { yes: [], neutral: [], no: [] };
  orderRows.forEach(function (x) {
    const v = x.o.reorder;
    if (v !== "yes" && v !== "neutral" && v !== "no") return;
    verdicts[v] += x.q;
    if (x.p > 0) for (let i = 0; i < x.q; i++) vPrice[v].push(x.p);
  });
  const vTotal = verdicts.yes + verdicts.neutral + verdicts.no;
  if (vTotal >= 5) {
    const avgOf = function (a) {
      return a.length
        ? a.reduce(function (s, v) {
            return s + v;
          }, 0) / a.length
        : 0;
    };
    const tiers = [
      ["Under $6", 0, 6],
      ["$6 to $8", 6, 8],
      ["$8 to $10", 8, 10],
      ["$10 and up", 10, 1e9],
    ].map(function (t) {
      const inT = orderRows.filter(function (x) {
        return x.p >= t[1] && x.p < t[2] && (x.o.reorder === "yes" || x.o.reorder === "neutral" || x.o.reorder === "no");
      });
      const yes = inT.reduce(function (s, x) {
        return s + (x.o.reorder === "yes" ? x.q : 0);
      }, 0);
      const all = inT.reduce(function (s, x) {
        return s + x.q;
      }, 0);
      return { label: t[0], n: all ? Math.round((yes / all) * 100) : 0, all: all, yes: yes };
    });
    const cheap = nonWish
      .filter(function (c) {
        return bucketOf(c) === "loved";
      })
      .map(function (c) {
        const ps = [];
        (c.drinks || []).forEach(function (d) {
          drinkOrders(d).forEach(function (o) {
            if (dpr(o) > 0) ps.push(dpr(o));
          });
        });
        return { c: c, p: avgOf(ps), n: ps.length };
      })
      .filter(function (x) {
        return x.n >= 2;
      })
      .sort(function (a, b) {
        return a.p - b.p;
      })
      .slice(0, 3);
    const regret = verdicts.no;
    h +=
      '<div class="statsec">Worth it</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + Math.round((verdicts.yes / vTotal) * 100) + "%</b> of your drinks, you would order again</div>" +
      statStack([
        { label: "Order again", n: verdicts.yes },
        { label: "Neutral", n: verdicts.neutral },
        { label: "Regret", n: verdicts.no },
      ]) +
      statLegend([
        { label: "Order again", n: verdicts.yes },
        { label: "Neutral", n: verdicts.neutral },
        { label: "Regret", n: verdicts.no },
      ], vTotal) +
      (vPrice.yes.length && vPrice.neutral.length
        ? '<div class="sc-duo"><div><span>Avg price, order again</span><b>' + statMoney(avgOf(vPrice.yes)) + "</b><i>" + vPrice.yes.length +
          " priced</i></div><div><span>Avg price, neutral</span><b>" + statMoney(avgOf(vPrice.neutral)) + "</b><i>" + vPrice.neutral.length + " priced</i></div></div>"
        : "") +
      '<div class="sc-cap">Order-again rate by price</div>' +
      statBarRows(
        tiers.map(function (t) {
          return { label: t.label + " (" + t.all + ")", n: t.n, text: t.n + "%" };
        })
      ) +
      (cheap.length
        ? '<div class="sc-cap">Loved cafes with the lowest average drink</div>' +
          statBarRows(
            cheap.map(function (x) {
              return { label: x.c.name, n: x.p, text: statMoney(x.p) };
            })
          )
        : "") +
      '<div class="statnote">' + vTotal + " of " + nDrinkRows + " drinks carry a verdict" +
      (regret < 5 ? ", and only " + regret + " were a regret, so the price bands show a pattern to watch, not a rule" : "") + ".</div></div>";
  }

  mark("you");
  /* ---------- 6b. taste: verdict split, wishlist, tags ---------- */
  const verdictN = { loved: 0, fine: 0, meh: 0, "": 0 };
  nonWish.forEach(function (c) {
    verdictN[bucketOf(c)]++;
  });
  const ratedN = verdictN.loved + verdictN.fine + verdictN.meh;
  if (ratedN >= 3) {
    const vItems = [
      { label: "Loved it", n: verdictN.loved, color: BUCKET_HEX.loved },
      { label: "It was fine", n: verdictN.fine, color: BUCKET_HEX.fine },
      { label: "Not for me", n: verdictN.meh, color: BUCKET_HEX.meh },
      { label: "Not rated", n: verdictN[""], color: BUCKET_HEX[""] },
    ];
    const tagRows = Object.keys(tagC)
      .sort(function (a, b) {
        return tagC[b] - tagC[a] || (a < b ? -1 : 1);
      })
      .slice(0, 6)
      .map(function (t) {
        return { label: "#" + t, n: tagC[t] };
      });
    const logged = Math.round((nonWish.length / Math.max(1, cafes.length)) * 100);
    h +=
      '<div class="statsec">Taste</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + Math.round((verdictN.loved / ratedN) * 100) + "%</b> of the cafes you rated, you loved</div>" +
      '<div class="sc-donutrow">' + statDonut(vItems, ratedN, "Verdicts of " + ratedN + " rated cafes") +
      '<div class="legrows">' +
      vItems
        .map(function (i) {
          return (
            '<div><i style="background:' + i.color + '"></i><span>' + i.label + '</span><b>' + i.n + " · " +
            Math.round((i.n / nonWish.length) * 100) + "%</b></div>"
          );
        })
        .join("") +
      "</div></div>" +
      (wishN
        ? '<div class="sc-cap">Logged and still to try</div><div class="sc-split" role="img" aria-label="' + nonWish.length +
          " logged, " + wishN + ' still to try"><span style="width:' + logged + '%"></span><span class="w" style="width:' +
          (100 - logged) + '%"></span></div><div class="legrows"><div><i class="lg"></i><span>Logged</span><b>' +
          nonWish.length + '</b></div><div><i class="wsh"></i><span>Still to try</span><b>' + wishN + "</b></div></div>"
        : "") +
      (tagRows.length ? '<div class="sc-cap">What your tags say</div>' + statBarRows(tagRows) : "") +
      '<div class="statnote">Four and five read as loved, three as fine, one and two as not for me. ' + verdictN[""] +
      " visited cafes have no rating yet.</div></div>";
  }

  mark("habits");
  /* ---------- 7. regulars ---------- */
  const reg = nonWish
    .map(function (c) {
      return { c: c, n: visitDates(c).length };
    })
    .filter(function (x) {
      return x.n > 1;
    })
    .sort(function (a, b) {
      return b.n - a.n;
    });
  if (reg.length) {
    h += '<div class="statsec">Regulars</div>';
    reg.slice(0, 4).forEach(function (x, i) {
      h += magRow(i + 1, x.c.name, x.c.area, x.n + " days", "openDetail('" + x.c.id + "','stats')");
    });
    h +=
      '<div class="statnote">Counted in separate days out, not drinks ordered. Only ' +
      reg.length +
      " cafes ever got a second day.</div>";
  }

  mark("habits");
  /* ---------- 8. where you go ---------- */
  const geo = {};
  nonWish
    .filter(function (c) {
      return c.lat != null;
    })
    .forEach(function (c) {
      const k = cafeStateName(c) || cafeCountryName(c);
      if (k) geo[k] = (geo[k] || 0) + 1;
    });
  const geoA = Object.keys(geo)
    .map(function (k) {
      return [k, geo[k]];
    })
    .sort(function (a, b) {
      return b[1] - a[1];
    });
  if (geoA.length > 1) {
    const shown = geoA.slice(0, 4);
    const rest = geoA.slice(4).reduce(function (s, x) {
      return s + x[1];
    }, 0);
    const far = nonWish
      .filter(function (c) {
        return c.lat != null;
      })
      .map(function (c) {
        return { c: c, mi: distKm(CA_HOME.lat, CA_HOME.lng, c.lat, c.lng) * 0.621371 };
      })
      .sort(function (a, b) {
        return b.mi - a.mi;
      })[0];
    h += '<div class="statsec">Where you go</div>';
    shown.forEach(function (x) {
      h += magRow(null, x[0], "", x[1] + " cafe" + (x[1] === 1 ? "" : "s"), "");
    });
    h +=
      '<div class="statnote">' +
      (rest ? "+" + rest + " elsewhere. " : "") +
      (far ? "Farthest: " + esc(far.c.name) + " — " + Math.round(far.mi).toLocaleString() + " mi." : "") +
      "</div>";
  }

  /* ---------- 8b. chains and independents ----------
     A chain is a brand group of two or more cafes, the same grouping the cafe page uses for its
     branches (brandGroupKey), so this cannot disagree with it. */
  const groups = {};
  cafes.forEach(function (c) {
    const k = brandGroupKey(c);
    if (k) (groups[k] = groups[k] || []).push(c);
  });
  const chains = Object.keys(groups)
    .map(function (k) {
      const m = groups[k],
        names = {};
      m.forEach(function (c) {
        const b = (c.brand || "").trim() || brandBaseName(c.name);
        names[b] = (names[b] || 0) + 1;
      });
      const label = Object.keys(names).sort(function (a, b) {
        return names[b] - names[a] || a.length - b.length;
      })[0];
      const been = m.filter(function (c) {
        return !c.wish;
      });
      return {
        label: label,
        members: m,
        been: been,
        visits: been.reduce(function (s, c) {
          return s + visitDates(c).length;
        }, 0),
      };
    })
    .filter(function (g) {
      return g.members.length > 1 && g.been.length > 0;
    })
    .sort(function (a, b) {
      return b.been.length - a.been.length || b.visits - a.visits || (a.label < b.label ? -1 : 1);
    });
  if (chains.length && nonWish.length >= 5) {
    const inChain = {};
    chains.forEach(function (g) {
      g.been.forEach(function (c) {
        inChain[c.id] = 1;
      });
    });
    const chainCafes = nonWish.filter(function (c) {
        return inChain[c.id];
      }),
      indie = nonWish.filter(function (c) {
        return !inChain[c.id];
      });
    const lovedPct = function (a) {
      return a.length
        ? Math.round(
            (a.filter(function (c) {
              return bucketOf(c) === "loved";
            }).length /
              a.length) *
              100
          )
        : 0;
    };
    const mostV = chains.slice().sort(function (a, b) {
      return b.visits - a.visits;
    })[0];
    const split = [
      { label: "Independent spots", n: indie.length },
      { label: "Chain branches", n: chainCafes.length },
    ];
    h +=
      '<div class="statsec">Chains and independents</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + Math.round((indie.length / nonWish.length) * 100) + "%</b> independent, " +
      Math.round((chainCafes.length / nonWish.length) * 100) + "% chain branches</div>" +
      statStack(split) +
      statLegend(split, nonWish.length) +
      '<div class="sc-duo"><div><span>Most visited brand</span><b>' + esc(mostV.label) + "</b><i>" + mostV.visits + " dated visits, " +
      mostV.been.length + " branches</i></div><div><span>Loved rate</span><b>" + lovedPct(chainCafes) + "% vs " + lovedPct(indie) +
      "%</b><i>chains vs independents</i></div></div>" +
      '<div class="hbars">' +
      chains
        .slice(0, 6)
        .map(function (g) {
          return (
            '<div class="hb-row"><span class="hb-nm">' + esc(g.label) + '</span><span class="sc-dots">' +
            g.members
              .map(function (c) {
                return '<i class="' + (c.wish ? "w" : "") + '"></i>';
              })
              .join("") +
            '</span><span class="hb-v">' + g.been.length + " of " + g.members.length + "</span></div>"
          );
        })
        .join("") +
      '</div><div class="statnote">Filled dot: a branch you have logged. Ring: still on your want list.</div></div>';
  }

  mark("you");
  /* ---------- 9. keep ranking ---------- */
  /* Cafe coverage, not the drink count — drinks are no longer what ranking moves. */
  /* Ranking coverage is a chore only the owner can clear, so it is theirs alone — the same
     rule the board itself follows. A visitor gets a way through to the guide instead. */
  const rankedN = nonWish.filter(function (c) {
    return matchCount(c) > 0;
  }).length;
  h += isAdmin
    ? '<div class="handoff" role="button" tabindex="0" onclick="openRank()">' + ico("scale") + " " +
      rankedN +
      " of " +
      nonWish.length +
      " cafes ranked" +
      (nonWish.length - rankedN ? " <span>· " + (nonWish.length - rankedN) + " to go</span>" : "") +
      "</div>"
    : '<div class="handoff" role="button" tabindex="0" onclick="openRank()">' + ico("trophy") + " Where to go <span>›</span></div>";

  _marks.push([h.length, "end"]);
  /** @type {Record<string, string>} */
  const tabs = { you: "", habits: "", money: "" };
  for (let i = 0; i < _marks.length - 1; i++) tabs[_marks[i][1]] += h.slice(_marks[i][0], _marks[i + 1][0]);
  const labels = [
    ["you", "You"],
    ["habits", "Habits"],
    ["money", "Money"],
  ];
  host.innerHTML =
    '<div class="stabs" role="group" aria-label="Stats sections">' +
    labels
      .map(function (t) {
        return '<button type="button" aria-pressed="' + (_statsTab === t[0]) + '" onclick="setStatsTab(\'' + t[0] + "')\">" + t[1] + "</button>";
      })
      .join("") +
    "</div>" +
    labels
      .map(function (t) {
        return '<div class="stabpanel" data-tab="' + t[0] + '"' + (_statsTab === t[0] ? "" : " hidden") + ">" + tabs[t[0]] + "</div>";
      })
      .join("");
}
