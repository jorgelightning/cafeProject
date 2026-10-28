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
let _growthMonth = "";
function setGrowthMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  _growthMonth = month;
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
/* A ring split by verdict, in the chart verdict colours: the map's green and red, and a deeper yellow that reads on a
   white card (the map's is 2:1 against it). */
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
      /* a style, not a stroke attribute, so a theme token (var(--ch-yes)) works */
      '<circle cx="60" cy="60" r="' + R + '" fill="none" style="stroke:' + i.color + '" stroke-width="16" stroke-dasharray="' +
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
/* Every priced drink on one price line, a row per answer (stats audit, 28 Oct). It replaced "Order-again rate by price":
   four bands at 89, 91, 89 and 100%, the longest bar from one drink. The 👍 drinks are a small histogram in 50¢ steps,
   the 😐 and 👎 ones are dots (with their drink and cafe on hover), and one or two 👎 are named on the chart, so you can
   see whether price had anything to do with it. A private spot is never named; it is "a private spot".
   @param {{p:number, v:string, d:string, c:string}[]} pts price, answer (yes | neutral | no), drink, cafe label
   @param {number} med the median of every priced drink, so this line and Price spread's agree */
function statPriceStrip(pts, med) {
  const W = 320,
    l = 24,
    r = 8,
    iw = W - l - r,
    hi = Math.max(8, Math.ceil(Math.max.apply(null, pts.map(function (x) {
      return x.p;
    })) / 2) * 2),
    X = function (p) {
      return l + (Math.min(p, hi) / hi) * iw;
    },
    y1 = 50,
    y2 = 74,
    y3 = 98;
  const lane = function (y, emoji) {
    return '<text class="ps-emo" x="0" y="' + (y + 4) + '">' + emoji + '</text><line class="ps-lane" x1="' + l + '" x2="' + (W - r) + '" y1="' + y + '" y2="' + y + '"/>';
  };
  let s = lane(y1, "👍") + lane(y2, "😐") + lane(y3, "👎");
  const bins = {};
  pts.forEach(function (x) {
    if (x.v === "yes") bins[Math.floor(x.p * 2) / 2] = (bins[Math.floor(x.p * 2) / 2] || 0) + 1;
  });
  const mx = Math.max.apply(null, Object.keys(bins).map(function (k) {
      return bins[k];
    }).concat([1])),
    bw = iw / hi / 2 - 1.5;
  Object.keys(bins).forEach(function (k) {
    const h = Math.max(3, (bins[k] / mx) * 38),
      x = X(+k) + 0.75;
    s +=
      '<rect class="ps-yes" x="' + x.toFixed(1) + '" y="' + (y1 - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) +
      '" rx="2"><title>' + statMoney(+k) + " to " + statMoney(+k + 0.5) + ": " + bins[k] + " you would order again</title></rect>";
  });
  const seen = {};
  const no = pts.filter(function (x) {
    return x.v === "no";
  }).sort(function (a, b) {
    return a.p - b.p;
  });
  pts.forEach(function (x) {
    if (x.v !== "neutral" && x.v !== "no") return;
    const y = x.v === "no" ? y3 : y2,
      k = x.v + x.p.toFixed(2),
      o = (seen[k] = (seen[k] || 0) + 1) - 1;
    s +=
      '<circle class="' + (x.v === "no" ? "ps-no" : "ps-mid") + '" cx="' + X(x.p).toFixed(1) + '" cy="' + (y - o * 7) + '" r="4.5"><title>' +
      esc(x.d) + " · " + esc(x.c) + " · " + statMoney(x.p) + "</title></circle>";
  });
  if (no.length && no.length <= 2)
    no.forEach(function (x, i) {
      const right = no.length === 1 ? X(x.p) < W * 0.6 : i === 1,
        name = x.c.length > 15 ? x.c.slice(0, 14).trim() + "…" : x.c;
      s +=
        '<text x="' + (X(x.p) + (right ? 8 : -8)).toFixed(1) + '" y="' + (y3 + 17) + '" text-anchor="' + (right ? "start" : "end") + '">' +
        esc(name) + " " + statMoney(x.p) + "</text>";
    });
  s +=
    '<line class="ps-med" x1="' + X(med).toFixed(1) + '" x2="' + X(med).toFixed(1) + '" y1="4" y2="' + (y3 + 6) + '"/><text x="' + (X(med) + 4).toFixed(1) +
    '" y="10">median ' + statMoney(med) + '</text><line class="ps-lane" x1="' + l + '" x2="' + (W - r) + '" y1="' + (y3 + 26) + '" y2="' + (y3 + 26) + '"/>';
  for (let v = 0; v <= hi; v += 4) s += '<text x="' + X(v).toFixed(1) + '" y="' + (y3 + 40) + '" text-anchor="middle">$' + v + "</text>";
  return (
    '<svg class="sc-svg pstrip" viewBox="0 0 ' + W + " " + (y3 + 46) + '" role="img" aria-label="Priced drinks by price: ' +
    pts.filter(function (x) {
      return x.v === "yes";
    }).length + " you would order again, " + pts.filter(function (x) {
      return x.v === "neutral";
    }).length + " maybe, " + no.length + ' you would not, median ' + statMoney(med) + '">' + s + "</svg>"
  );
}
/* The collection, growing (stats audit, 28 Oct): cafes tried, counted from each cafe's first visit, over the last two
   years, with everything before as where the line starts. The twelve-month chart below began in an empty November and
   put 2022 and the trips in one sentence. A month with three or more new cafes outside your biggest region is a trip,
   and the two or three biggest are named on the line by region. Tap a month for what it added; a private spot is
   counted, never named.
   @param {{d:string, r:string, n:string}[]} firsts first visit date, region, name (or "" for a private spot)
   @param {string} home the biggest region @param {string} sel the month picked, "YYYY-MM" */
function statGrowth(firsts, home, sel) {
  const now = new Date(),
    months = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
  }
  const by = {};
  let start = 0;
  firsts.forEach(function (x) {
    const k = x.d.slice(0, 7);
    if (k < months[0]) start++;
    else (by[k] = by[k] || []).push(x);
  });
  let run = start;
  const pts = months.map(function (k) {
    run += (by[k] || []).length;
    return { k: k, v: run, add: by[k] || [] };
  });
  const top = Math.max(10, Math.ceil(run / 50) * 50),
    W = 320,
    H = 170,
    l = 26,
    r = 26,
    t = 22,
    b = 20,
    iw = W - l - r,
    ih = H - t - b,
    step = iw / months.length,
    X = function (i) {
      return l + (i + 1) * step;
    },
    Y = function (v) {
      return t + ih - (v / top) * ih;
    };
  let line = "M" + l + "," + Y(start).toFixed(1);
  pts.forEach(function (p, i) {
    line += " H" + X(i).toFixed(1) + " V" + Y(p.v).toFixed(1);
  });
  let s = "";
  [0, top / 2, top].forEach(function (v) {
    s += '<line class="ps-lane" x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/><text x="' + (l - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + v + "</text>";
  });
  months.forEach(function (k, i) {
    if (k.slice(5) === "01" || k.slice(5) === "07")
      s += '<text x="' + (X(i) - step / 2).toFixed(1) + '" y="' + (H - 4) + '" text-anchor="middle">' + (k.slice(5) === "01" ? k.slice(0, 4) : "Jul") + "</text>";
  });
  s += '<path class="gr-area" d="' + line + " H" + X(pts.length - 1).toFixed(1) + " V" + Y(0).toFixed(1) + " H" + l + ' Z"/><path class="gr-line" d="' + line + '"/>';
  /* trips: away from the biggest region, three or more in a month, biggest first, never two within two months */
  const trips = [];
  pts
    .map(function (p, i) {
      const away = p.add.filter(function (x) {
        return x.r !== home;
      });
      return { i: i, n: away.length, regions: away.map(function (x) {
        return x.r;
      }) };
    })
    .filter(function (x) {
      return x.n >= 3;
    })
    .sort(function (a, b) {
      return b.n - a.n;
    })
    .forEach(function (x) {
      /* two months apart is enough: the line has climbed between them, so the labels sit at different heights */
      if (trips.length < 3 && !trips.some(function (y) {
        return Math.abs(y.i - x.i) < 2;
      })) trips.push(x);
    });
  trips.forEach(function (x) {
    const names = [];
    x.regions.forEach(function (rg) {
      if (names.indexOf(rg) < 0) names.push(rg);
    });
    const px = X(x.i) - step / 2,
      py = Y(pts[x.i].v),
      ly = Math.max(12, py - 30),
      end = px > W * 0.45;
    s +=
      '<line class="gr-lead" x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + (ly + 4) + '" y2="' + (py - 3).toFixed(1) + '"/><text x="' +
      (px + (end ? 3 : -3)).toFixed(1) + '" y="' + ly.toFixed(1) + '" text-anchor="' + (end ? "end" : "start") + '">' + esc(names.slice(0, 2).join(", ")) + " +" + x.n + "</text>";
  });
  const last = pts[pts.length - 1];
  s +=
    '<circle class="gr-end" cx="' + X(pts.length - 1).toFixed(1) + '" cy="' + Y(last.v).toFixed(1) + '" r="4.5"/><text class="gr-endl" x="' + (X(pts.length - 1) + 7).toFixed(1) + '" y="' + (Y(last.v) + 4).toFixed(1) + '">' + last.v + "</text>";
  pts.forEach(function (p, i) {
    s +=
      '<rect class="gr-hit' + (p.k === sel ? " on" : "") + '" x="' + (X(i) - step).toFixed(1) + '" y="' + t + '" width="' + step.toFixed(1) + '" height="' + ih + '"' +
      /* the months that added cafes are the ones worth reaching from the keyboard */
      (p.add.length ? ' role="button" tabindex="0" aria-label="' + statMonthLabel(p.k) + ", " + p.add.length + ' new"' : "") +
      act("setGrowthMonth", [p.k]) + "><title>" + statMonthLabel(p.k) + ": " + p.v + " cafes" + (p.add.length ? ", " + p.add.length + " new" : "") + "</title></rect>";
  });
  const picked = pts.filter(function (p) {
    return p.k === sel;
  })[0] || last;
  const named = picked.add.filter(function (x) {
      return x.n;
    }),
    priv = picked.add.length - named.length;
  return {
    svg: '<svg class="sc-svg growth" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Cafes tried over two years: ' + start + " before, " + last.v + ' now">' + s + "</svg>",
    total: last.v,
    picked:
      "<b>" + statMonthLabel(picked.k) + "</b> · " +
      (picked.add.length
        ? picked.add.length + " new: " + esc(named.slice(0, 4).map(function (x) {
            return x.n;
          }).join(", ")) + (named.length > 4 ? " and " + (named.length - 4) + " more" : "") + (priv ? (named.length ? ", " : "") + (priv === 1 ? "a private spot" : priv + " private spots") : "")
        : "no new cafes"),
  };
}

/* ---------- Wrapped: drink DNA, worth it, chains and independents ----------
   Everything here is counted from what is already stored; nothing is estimated, and each card says
   how much of the data it stood on. No location, area or review is read — a brand name and a count
   are all a private spot contributes. */
/* Colours by meaning (stats audit, 28 Oct): Worth it drew Regret in the map's loved green, and Drink DNA gave 25% sugar
   the want-to-try violet. Green, yellow and red now only mean a verdict (--ch-yes/mid/no), ordered things take one
   orange from light to dark (--ch-o1..4), temperature runs cold blue to hot orange, and "Other" is muted. These are for
   things with no order and no verdict, and never a verdict or want-to-try hue. */
const STAT_SEG = ["var(--acc)", "var(--ch-cold)", "var(--ch-o4)"];
/** A segment's colour: its own, grey for "Other", else the next nominal one. */
function statSegColor(i, ix) {
  return i.color || (i.label === "Other" ? "var(--ch-mute)" : STAT_SEG[ix % STAT_SEG.length]);
}
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
/** @param {{label:string,n:number,color?:string}[]} items @param {string} [cls] e.g. "thin", for a bar in a row */
function statStack(items, cls) {
  const tot =
    items.reduce(function (s, i) {
      return s + i.n;
    }, 0) || 1;
  return (
    '<div class="sc-stack' + (cls ? " " + cls : "") + '" role="img" aria-label="' +
    items
      .map(function (i) {
        return esc(i.label) + " " + i.n;
      })
      .join(", ") +
    '">' +
    items
      .map(function (i, ix) {
        return '<span style="width:' + (i.n / tot) * 100 + "%;background:" + statSegColor(i, ix) + '" title="' + esc(i.label) + " · " + i.n + '"></span>';
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
          '<div><i style="background:' + statSegColor(i, ix) + '"></i><span>' + esc(i.label) + "</span><b>" + i.n + " \u00b7 " +
          Math.round((i.n / (total || 1)) * 100) + "%</b></div>"
        );
      })
      .join("") +
    "</div>"
  );
}
/* Drink DNA drew each option sorted by count, so Size read 12, 16, 8, 14 oz and could not show small to large. An option
   with an order keeps it: sweetness and size by their number, light to dark; ice and heat on the form's own scale,
   coldest to hottest, blue to orange. "Other", or a value with no place on the scale, is grey and goes last. */
const STAT_ICE = ["Extra ice", "Regular ice", "Less ice", "No ice", "Warm", "Hot"];
const STAT_ICE_COL = ["var(--ch-cold)", "var(--ch-cold)", "var(--ch-cool)", "var(--ch-cool)", "var(--ch-warm)", "var(--ch-hot)"];
/** @param {string} kind sweet | ice | size, anything else is left as it is @param {{label:string,n:number,color?:string}[]} items */
function statOrdered(kind, items) {
  if (kind !== "sweet" && kind !== "ice" && kind !== "size") return items;
  const rank = function (i) {
    if (kind === "ice") return STAT_ICE.indexOf(i.label) < 0 ? Infinity : STAT_ICE.indexOf(i.label);
    const n = i.label === "No sugar" ? 0 : parseFloat(i.label);
    return i.label === "Other" || isNaN(n) ? Infinity : n;
  };
  const out = items.slice().sort(function (a, b) {
    return rank(a) - rank(b);
  });
  const ranked = out.filter(function (i) {
    return isFinite(rank(i));
  });
  out.forEach(function (i) {
    if (!isFinite(rank(i))) i.color = "var(--ch-mute)";
    else if (kind === "ice") i.color = STAT_ICE_COL[rank(i)];
    else i.color = "var(--ch-o" + (ranked.length < 2 ? 2 : 1 + Math.round((ranked.indexOf(i) * 3) / (ranked.length - 1))) + ")";
  });
  return out;
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
      (w.fresh ? ". " + (w.fresh === w.cafes ? "All" : w.fresh) + youOr(" of them new to you.", " of them new to " + OWNER_NAME + ".") : "."),
    tint: "var(--acc)",
  });
  if (w.drink)
    cards.push({
      k: youOr("Your drink", OWNER_NAME + "’s drink"),
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
      k: youOr("You went back", OWNER_NAME + " went back"),
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
      k: youOr("How you take it", "How " + OWNER_NAME + " takes it"),
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
      ' in caf\u00e9s to someone.</div><button type="button" class="admin-only"' + act("openYearStory") + '>Share \u203a</button></div>'
  );
  return (
    '<section class="wrapped" aria-label="' + youOr("Your ", OWNER_NAME + "’s ") + w.year + '">' +
    '<div class="sech"><b>' + youOr("Your ", OWNER_NAME + "’s ") + w.year + "</b>" + (pick.review ? '<span class="wrev">in review</span>' : "") + '<button type="button" class="admin-only"' + act("openYearStory") + '>Share \u203a</button></div>' +
    '<div class="wstrip" role="region" aria-label="' + youOr("Your ", OWNER_NAME + "’s ") + w.year + ', swipe for more" tabindex="0"' + act("wrappedDots", ["$el"], "scroll") + '>' +
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
  const magRow = function (rank, name, sub, val, onclick, extra) {
    return (
      '<div class="lbrow one' +
      (onclick ? " tap" : "") +
      (extra ? " reg" : "") +
      '"' +
      (onclick ? ' role="button" tabindex="0"' + act(onclick[0], onclick[1]) : "") +
      ">" +
      (rank !== null ? '<span class="lbrank">' + rank + "</span>" : "") +
      '<div class="lbmain"><div class="lbname">' +
      esc(name) +
      (sub ? " <i>· " + esc(sub) + "</i>" : "") +
      "</div>" +
      (extra || "") +
      "</div>" +
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
    youOr(" cafes you rated", " cafes " + OWNER_NAME + " rated") +
    "</div></div>" +
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
  /* ---------- 2b. the collection, growing (stats audit) ---------- */
  const firsts = [],
    regionN = {};
  nonWish.forEach(function (c) {
    const d = visitDates(c)[0],
      rg = regionOf(c).label;
    regionN[rg] = (regionN[rg] || 0) + 1;
    if (d) firsts.push({ d: d, r: rg, n: c.custom ? "" : c.name || "" });
  });
  if (firsts.length >= 5) {
    const home = Object.keys(regionN).sort(function (a, b) {
        return regionN[b] - regionN[a];
      })[0],
      gr = statGrowth(firsts, home, _growthMonth),
      yr = String(new Date().getFullYear()),
      thisYear = firsts.filter(function (x) {
        return x.d.slice(0, 4) === yr;
      }).length,
      undated = nonWish.length - firsts.length;
    h +=
      '<div class="statsec">' + youOr("Your collection", esc(OWNER_NAME) + "’s collection") + '</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + gr.total + "</b> cafes" + (thisYear ? ", " + thisYear + " of them this year" : "") + "</div>" + gr.svg +
      '<div class="sc-pick">' + gr.picked + "</div>" +
      '<div class="statnote">Counted from each cafe’s first visit' + (undated ? "; " + undated + " more have no date" : "") + ". Tap a month to see what it added.</div></div>";
  }

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
        '"' + act("setRhythmMetric", ["visits"]) + '>Visits</button><button type="button" class="' +
        (metric === "spend" ? "on" : "") +
        '" aria-pressed="' +
        (metric === "spend") +
        '"' + act("setRhythmMetric", ["spend"]) + '>Spending</button></div>'
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
          '"' +
          act("setRhythmMonth", [k]) +
          ' aria-label="' +
          aria +
          '"><span class="rbar' +
          (amount ? " has" : "") +
          '" style="height:' +
          hgt +
          'px"></span>' +
          '<span class="rlab">' +
          MOL[+k.slice(5, 7) - 1] +
          "</span></button>"
        );
      })
      .join("") +
    "</div>" +
    '<div class="statnote">' +
    /* the thin green line under each bar (share of drinks with a price) was a second chart squeezed into this one; the
       picked month's coverage is in the line above the bars, and every month's in its label (stats audit) */
    (isAdmin ? (metric === "spend" ? "Bar: spend. " : "Bar: cafe visits. ") + "Tap a month for its total. " : "Tap a month for its visits. ") +
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
      ["Sweetness", sweetC, 4, "sweet"],
      ["Ice or heat", iceC, 4, "ice"],
      ["Milk", milkC, 3, ""],
      ["Size", sizeC, 4, "size"],
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
            t = sum(r[1]),
            cap = '<div class="sc-cap">' + r[0] + " \u00b7 " + Math.round((g[0].n / t) * 100) + "% " + esc(g[0].label.toLowerCase()) + "</div>";
          /* a bar that is nearly all one colour (milk: 97% oat) says less than the sentence does */
          if (g[0].n / t >= 0.9)
            return (
              cap + '<div class="sc-one">' + g[0].n + " of " + t + " drinks" +
              (g.length > 1
                ? ". The rest: " + g.slice(1).map(function (i) {
                    return esc(i.label) + " " + i.n;
                  }).join(", ")
                : "") + ".</div>"
            );
          const o = statOrdered(String(r[3]), g);
          return cap + statStack(o) + statLegend(o, t);
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
    /* every priced drink with an answer, for the price strip; a private spot is never named */
    const strip = [];
    orderRows.forEach(function (x) {
      const v = x.o.reorder;
      if (x.p > 0 && (v === "yes" || v === "neutral" || v === "no"))
        for (let i = 0; i < x.q; i++) strip.push({ p: x.p, v: v, d: x.dn, c: x.c.custom ? "a private spot" : x.c.name || "" });
    });
    const noP = strip
      .filter(function (x) {
        return x.v === "no";
      })
      .map(function (x) {
        return x.p;
      })
      .sort(function (a, b) {
        return a - b;
      });
    /* green, yellow and red as on the map, each with its emoji, so colour is never the only cue */
    const vItems3 = [
      { label: "👍 Order again", n: verdicts.yes, color: "var(--ch-yes)" },
      { label: "😐 Maybe", n: verdicts.neutral, color: "var(--ch-mid)" },
      { label: "👎 Wouldn’t", n: verdicts.no, color: "var(--ch-no)" },
    ];
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
      '<div class="sc-head"><b>' + Math.round((verdicts.yes / vTotal) * 100) + "%</b> " + youOr("of your drinks, you would order again", "of drinks " + OWNER_NAME + " would order again") + "</div>" +
      statStack(vItems3) +
      statLegend(vItems3, vTotal) +
      (vPrice.yes.length && vPrice.neutral.length
        ? '<div class="sc-duo"><div><span>Avg price, order again</span><b>' + statMoney(avgOf(vPrice.yes)) + "</b><i>" + vPrice.yes.length +
          " priced</i></div><div><span>Avg price, maybe</span><b>" + statMoney(avgOf(vPrice.neutral)) + "</b><i>" + vPrice.neutral.length + " priced</i></div></div>"
        : "") +
      (strip.length >= 5
        ? '<div class="sc-cap">' +
          (!noP.length
            ? "Every priced drink, by your answer"
            : noP.length === 1
              ? "Your one 👎 cost " + statMoney(noP[0])
              : "Your " + (noP.length === 2 ? "two" : noP.length) + " 👎 cost " + statMoney(noP[0]) +
                (noP[noP.length - 1] > noP[0] ? (noP.length === 2 ? " and " : " to ") + statMoney(noP[noP.length - 1]) : " each")) +
          "</div>" + statPriceStrip(strip, allPrices.length ? median(allPrices) : median(strip.map(function (x) {
            return x.p;
          })))
        : "") +
      (cheap.length
        ? '<div class="sc-cap">Loved cafes with the lowest average drink</div>' +
          statBarRows(
            cheap.map(function (x) {
              return { label: x.c.name, n: x.p, text: statMoney(x.p) };
            })
          )
        : "") +
      '<div class="statnote">' + vTotal + " of " + nDrinkRows + " drinks carry an answer; the " + strip.length + " with a price are on the line" +
      (regret && regret < 5 ? ". Only " + regret + (regret === 1 ? " was" : " were") + " a 👎, so read them as examples, not a rule" : "") + ".</div></div>";
  }

  mark("you");
  /* ---------- 6b. taste: verdict split, wishlist, tags ---------- */
  const verdictN = { loved: 0, fine: 0, meh: 0, "": 0 };
  nonWish.forEach(function (c) {
    verdictN[bucketOf(c)]++;
  });
  const ratedN = verdictN.loved + verdictN.fine + verdictN.meh;
  if (ratedN >= 3) {
    /* One base for every percent (stats audit): the title counted the cafes you rated (81%) and the legend all of them
       (73%). The ring and the legend are rated cafes only now; the unrated ones are a line in the note. */
    const vItems = [
      { label: "Loved it", n: verdictN.loved, color: "var(--ch-yes)" },
      { label: "It was fine", n: verdictN.fine, color: "var(--ch-mid)" },
      { label: "Not for me", n: verdictN.meh, color: "var(--ch-no)" },
    ];
    const tagRows = Object.keys(tagC)
      .sort(function (a, b) {
        return tagC[b] - tagC[a] || (a < b ? -1 : 1);
      })
      .slice(0, 6)
      .map(function (t) {
        return { label: "#" + t, n: tagC[t] };
      });
    h +=
      '<div class="statsec">Taste</div><div class="statcard sc-wide">' +
      '<div class="sc-head"><b>' + Math.round((verdictN.loved / ratedN) * 100) + "%</b> " + youOr("of the cafes you rated, you loved", "of the cafes " + OWNER_NAME + " rated were a “Loved it”") + "</div>" +
      '<div class="sc-donutrow">' + statDonut(vItems, ratedN, "Verdicts of " + ratedN + " rated cafes") +
      '<div class="legrows">' +
      vItems
        .map(function (i) {
          return (
            '<div><i style="background:' + i.color + '"></i><span>' + i.label + '</span><b>' + i.n + " · " +
            Math.round((i.n / ratedN) * 100) + "%</b></div>"
          );
        })
        .join("") +
      "</div></div>" +
      /* "Logged and still to try" was a bar of two numbers the line at the top of You already gives (stats audit) */
      (tagRows.length ? '<div class="sc-cap">' + youOr("What your tags say", "What " + OWNER_NAME + "’s tags say") + "</div>" + statBarRows(tagRows) : "") +
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
    /* Each regular has a strip of its visit days since the start of the month eight months ago (stats audit): the count
       says how often, the strip says when, and whether it is still going. "27 days" never said that Kissaten became
       weekly in July, or that Constance stopped in August. Dates only; nothing else about the cafe is read. */
    const s0 = new Date(new Date().getFullYear(), new Date().getMonth() - 8, 1),
      t0 = s0.getTime(),
      t1 = Date.now(),
      from = statDayKey(s0),
      sx = function (ms) {
        return ((ms - t0) / (t1 - t0)) * 300;
      };
    let grid = "",
      axis = "";
    for (let m = 0; m <= 8; m++) {
      const a = new Date(s0.getFullYear(), s0.getMonth() + m, 1).getTime(),
        z = Math.min(t1, new Date(s0.getFullYear(), s0.getMonth() + m + 1, 1).getTime());
      if (m) grid += '<line class="rg-grid" x1="' + sx(a).toFixed(1) + '" x2="' + sx(a).toFixed(1) + '" y1="0" y2="16"/>';
      axis += '<span style="left:' + ((sx((a + z) / 2) / 300) * 100).toFixed(1) + '%">' + STAT_MON[new Date(a).getMonth()].charAt(0) + "</span>";
    }
    h += '<div class="statsec">Regulars</div>';
    reg.slice(0, 4).forEach(function (x, i) {
      const days = visitDates(x.c),
        recent = days.filter(function (d) {
          return d >= from;
        }),
        last = days[days.length - 1],
        stale = (t1 - new Date(last + "T12:00:00").getTime()) / 864e5 > 30;
      const strip =
        '<svg class="rstrip" viewBox="0 0 300 16" preserveAspectRatio="none" role="img" aria-label="' + recent.length + " visit days in the last nine months" +
        (stale ? ", none since " + fmtDate(last) : "") + '">' + grid +
        recent
          .map(function (d) {
            return '<rect class="rg-tick" x="' + (sx(new Date(d + "T12:00:00").getTime()) - 1).toFixed(1) + '" y="2" width="2" height="12"><title>' + d + "</title></rect>";
          })
          .join("") +
        "</svg>" +
        (stale ? '<span class="rg-note">none since ' + esc(fmtDate(last)) + "</span>" : "");
      h += magRow(i + 1, x.c.name, x.c.area, x.n + " days", ["openDetail", [x.c.id, "stats"]], strip);
    });
    h += '<div class="lbrow one reg rg-axisrow" aria-hidden="true"><span class="lbrank"></span><div class="lbmain"><div class="rg-axis">' + axis + '</div></div><span class="lbscore"></span></div>';
    h +=
      '<div class="statnote">Counted in separate days out, not drinks ordered. Only ' +
      reg.length +
      " cafes ever got a second day.</div>";
  }

  mark("habits");
  /* ---------- 8. where you go ----------
     Each place carries the loved / fine / not-for-me bar the World list on the map has (stats audit), and "Other", a
     cafe whose country the app cannot tell, is no longer a row that reads like a place: it is counted in the note. */
  const geo = {};
  nonWish
    .filter(function (c) {
      return c.lat != null;
    })
    .forEach(function (c) {
      const k = cafeStateName(c) || cafeCountryName(c);
      if (!k) return;
      const g = (geo[k] = geo[k] || { n: 0, loved: 0, fine: 0, meh: 0, "": 0 });
      g.n++;
      g[bucketOf(c) || ""]++;
    });
  const geoA = Object.keys(geo)
    .filter(function (k) {
      return k !== "Other";
    })
    .map(function (k) {
      return [k, geo[k]];
    })
    .sort(function (a, b) {
      return b[1].n - a[1].n;
    });
  if (geoA.length > 1) {
    const shown = geoA.slice(0, 5),
      moreN = geoA.length - shown.length,
      placed = geoA.slice(5).reduce(function (s, x) {
        return s + x[1].n;
      }, 0),
      unplaced = geo.Other ? geo.Other.n : 0;
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
    const rest = [];
    if (placed) rest.push(placed + " in " + moreN + " more place" + (moreN === 1 ? "" : "s"));
    if (unplaced) rest.push(unplaced + " the app can’t place");
    h +=
      '<div class="statsec">' + youOr("Where you go", "Where " + OWNER_NAME + " goes") + '</div><div class="hbars geo">' +
      shown
        .map(function (x) {
          const g = x[1];
          return (
            '<div class="hb-row"><span class="hb-nm">' + esc(x[0]) + "</span>" +
            statStack(
              [
                { label: "Loved it", n: g.loved, color: "var(--ch-yes)" },
                { label: "It was fine", n: g.fine, color: "var(--ch-mid)" },
                { label: "Not for me", n: g.meh, color: "var(--ch-no)" },
                { label: "Not rated", n: g[""], color: "var(--ch-mute)" },
              ].filter(function (i) {
                return i.n;
              }),
              "thin"
            ) +
            '<span class="hb-v">' + g.n + "</span></div>"
          );
        })
        .join("") +
      '</div><div class="legrows inl geoleg"><div><i style="background:var(--ch-yes)"></i><span>Loved</span></div><div><i style="background:var(--ch-mid)"></i><span>Fine</span></div>' +
      '<div><i style="background:var(--ch-no)"></i><span>Not for me</span></div><div><i style="background:var(--ch-mute)"></i><span>Not rated</span></div></div>' +
      '<div class="statnote">' +
      (rest.length ? "+" + (placed + unplaced) + " more: " + rest.join(", ") + ". " : "") +
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
      '</div><div class="statnote">' + youOr("Filled dot: a branch you have logged. Ring: still on your want list.", "Filled dot: a branch " + OWNER_NAME + " has logged. Ring: still on " + OWNER_NAME + "’s want list.") + "</div></div>";
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
    ? '<div class="handoff" role="button" tabindex="0"' + act("openRank") + '>' + ico("scale") + " " +
      rankedN +
      " of " +
      nonWish.length +
      " cafes ranked" +
      (nonWish.length - rankedN ? " <span>· " + (nonWish.length - rankedN) + " to go</span>" : "") +
      "</div>"
    : '<div class="handoff" role="button" tabindex="0"' + act("openRank") + '>' + ico("trophy") + " Where to go <span>›</span></div>";

  _marks.push([h.length, "end"]);
  /** @type {Record<string, string>} */
  const tabs = { you: "", habits: "", money: "" };
  for (let i = 0; i < _marks.length - 1; i++) tabs[_marks[i][1]] += h.slice(_marks[i][0], _marks[i + 1][0]);
  const labels = [
    ["you", youOr("You", OWNER_NAME)],
    ["habits", "Habits"],
    ["money", "Money"],
  ];
  host.innerHTML =
    /* every tab starts with the same header (UI audit, 26 Oct) */
    '<div class="pagehead"><h2 class="ct">' + youOr("Your numbers", esc(OWNER_NAME) + "’s numbers") + "</h2></div>" +
    '<div class="stabs" role="group" aria-label="Stats sections">' +
    labels
      .map(function (t) {
        return '<button type="button" aria-pressed="' + (_statsTab === t[0]) + '"' + act("setStatsTab", [t[0]]) + ">" + t[1] + "</button>";
      })
      .join("") +
    "</div>" +
    labels
      .map(function (t) {
        return '<div class="stabpanel" data-tab="' + t[0] + '"' + (_statsTab === t[0] ? "" : " hidden") + ">" + tabs[t[0]] + "</div>";
      })
      .join("");
}
