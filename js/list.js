"use strict";
/* list.js — Search, sorting and the cafe card grid.
   Loaded by index.html; script order matters (config first, boot last). */
const STATE_NAMES = {
  HI: "Hawaii",
  CA: "California",
  NV: "Nevada",
  NY: "New York",
  WA: "Washington",
  OR: "Oregon",
  TX: "Texas",
  AZ: "Arizona",
  UT: "Utah",
};
function regionTerms(c) {
  const t = [];
  const m = /,\s*([A-Za-z]{2})\b/.exec(c.area || "");
  if (m) {
    const ab = m[1].toUpperCase();
    if (STATE_NAMES[ab]) t.push(STATE_NAMES[ab], ab);
  }
  if (c.lat != null && c.lng != null) {
    if (c.lng < -150 && c.lat > 18 && c.lat < 23) {
      t.push("Hawaii", "Oahu", "Honolulu");
    } else if (c.lng >= -125 && c.lng <= -117 && c.lat >= 32 && c.lat <= 42.5) {
      t.push("California");
      if (c.lat >= 36.8 && c.lat <= 38.6 && c.lng <= -121.4) t.push("Bay Area", "Northern California", "NorCal");
      if (c.lat < 34.5) t.push("Southern California", "SoCal");
    } else if (c.lng > -117 && c.lng <= -114 && c.lat >= 35 && c.lat <= 37.5) {
      t.push("Nevada", "Las Vegas");
    }
  }
  return t.join(" ");
}
function typeTerms(c) {
  const e = c.emoji || "";
  let s = "cafe";
  if (e === "🧋") s += " boba bubble milk tea";
  else if (e === "🍵") s += " matcha tea";
  else s += " coffee";
  return s;
}
function countryTerms(c) {
  const lat = c.lat,
    lng = c.lng;
  if (lat == null || lng == null) return "";
  /* Before the US box, which runs to 49.5°N and so swallowed Vancouver (49.26°N). */
  if (lat > 49 && lat <= 60 && lng >= -130 && lng <= -52) return "Canada";
  if (
    (lat >= 24 && lat <= 49.5 && lng >= -125 && lng <= -66.5) ||
    (lng <= -130 && lat >= 51 && lat <= 72) ||
    (lng < -150 && lat >= 18 && lat <= 23)
  )
    return "United States USA America";
  if (lat >= 33 && lat <= 39 && lng >= 125.5 && lng <= 129.8) return "South Korea Korea";
  if (lat >= 20 && lat <= 46 && lng >= 122 && lng <= 154) return "Japan";
  if (lat >= 21.8 && lat <= 25.4 && lng >= 119.5 && lng <= 122.1) return "Taiwan";
  if (lat >= 22 && lat <= 23.6 && lng >= 113.8 && lng <= 114.5) return "Hong Kong China";
  if (lat >= 1.15 && lat <= 1.5 && lng >= 103.6 && lng <= 104.1) return "Singapore";
  if (lat >= -44 && lat <= -10 && lng >= 112 && lng <= 154) return "Australia";
  if (lat >= 49 && lat <= 59 && lng >= -8 && lng <= 2) return "United Kingdom UK England";
  if (lat >= 41 && lat <= 51 && lng >= -5 && lng <= 9.6) return "France";
  return "";
}
function searchHay(c) {
  return (
    c.name +
    " " +
    areaOf(c) +
    " " +
    regionTerms(c) +
    " " +
    countryTerms(c) +
    " " +
    typeTerms(c) +
    " " +
    (c.tags || []).join(" ") +
    " " +
    (c.drinks || []).map(d => d.n).join(" ")
  ).toLowerCase();
}
function matchSearch(c, q) {
  const hay = searchHay(c);
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every(tok => hay.includes(tok));
}
function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371,
    toRad = x => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1),
    dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
/* One distance wording for the whole app: feet up close, miles beyond that. */
function fmtDist(dkm) {
  if (dkm == null) return "";
  const mi = dkm * 0.621371;
  return mi < 0.1 ? Math.round(mi * 5280) + " ft" : mi.toFixed(1) + " mi";
}
function dupNameKeys() {
  const seen = {},
    dup = {};
  cafes.forEach(c => {
    const k = (c.name || "").trim().toLowerCase();
    if (k) {
      if (seen[k]) dup[k] = 1;
      seen[k] = 1;
    }
  });
  return dup;
}
/* compact drops the " ago" suffix — that is what buys room for distance on the card line. */
function lastVisitedStr(c, compact) {
  var dates = visitDates(c);
  var iso = dates.length ? dates[dates.length - 1] : "";
  if (!iso) return "No visit date";
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "";
  var days = Math.floor(diff / 86400000);
  var ago = compact ? "" : " ago";
  if (days < 1) return "today";
  if (days === 1) return compact ? "1d" : "yesterday";
  if (days < 7) return days + "d" + ago;
  if (days < 31) return Math.floor(days / 7) + "w" + ago;
  var mo = Math.floor(days / 30);
  if (mo < 12) return mo + "mo" + ago;
  var yr = Math.floor(days / 365);
  return yr + "y" + ago;
}
/* Filter chips: quick one-tap filters above the list. Type chips match against the cafe name + drink names only (searchHay adds a default "coffee" term to every cafe, so it can't distinguish types). */
let activeChip = "";
const CHIP_DEFS = [
  ["coffee", "☕ Coffee"],
  ["matcha", "🍵 Matcha"],
  ["boba", "🧋 Boba / tea"],
  ["liked", "👍 Liked"],
];
function chipMatch(c, chip) {
  if (chip.slice(0, 4) === "tag:") return (c.tags || []).includes(chip.slice(4));
  if (chip === "liked") return reorderTally(c).yes > 0;
  const h = (c.name + " " + (c.drinks || []).map(d => d.n || "").join(" ")).toLowerCase();
  if (chip === "matcha") return h.includes("matcha") || h.includes("hojicha");
  if (chip === "boba") return h.includes("tea") || h.includes("boba") || h.includes("tapioca") || h.includes("milksha");
  if (chip === "coffee")
    return (
      h.includes("coffee") ||
      h.includes("espresso") ||
      h.includes("roast") ||
      h.includes("kissaten") ||
      (h.includes("latte") && !h.includes("matcha") && !h.includes("hojicha"))
    );
  return true;
}
/* ---------- guides: one-tap ways in ----------
   A friend opening the app wants "where should I go", not a filter panel. Four guides sit under
   the tabs for a viewer; the owner gets three working views inside Filters, where they cost no
   height at rest. They are one more filter in filteredCafes, so Clear, the result line, the map
   button and the Filters badge all already know about them. */
let activeGuide = "";
const GUIDE_DEFS = [
  ["top10", "\ud83c\udfc6 Top 10"],
  ["tea", "\ud83c\udf75 Best tea"],
  ["goto", "\u2615 Go-to"],
  ["near", "\ud83d\udccd Near me"],
];
const QUICK_DEFS = [
  ["recent", "Recent"],
  ["unranked", "Unranked"],
  ["noprice", "Needs price"],
];
function _rankNum(c) {
  const r = rankOf(c, _cardRanks || undefined);
  return r || 99999;
}
function _hasPrice(o) {
  return parseFloat(String((o && o.p) || "").replace(/[^0-9.]/g, "")) > 0;
}
/** @param {Cafe} c @param {string} g */
function guideMatch(c, g) {
  if (g === "top10") return _rankNum(c) <= 10;
  if (g === "tea") return bucketOf(c) === "loved" && (chipMatch(c, "matcha") || chipMatch(c, "boba"));
  if (g === "goto") return !!(typeof topDrinkAt === "function" && topDrinkAt(c) && reorderTally(c).yes > 0);
  /* Near me needs a position. Until the app has one it filters nothing, rather than showing an
     empty list that looks broken; only locate() ever asks the browser for it. */
  if (g === "near") {
    if (!userLoc) return true;
    return latOf(c) != null && distKm(userLoc.lat, userLoc.lng, latOf(c), lngOf(c)) * 0.621371 <= NEAR_MI;
  }
  if (g === "recent") {
    const last = visitDates(c).slice(-1)[0] || "";
    return !!last && Date.now() - new Date(last).getTime() <= 45 * 86400000;
  }
  if (g === "unranked") return matchCount(c) === 0;
  if (g === "noprice")
    return (c.drinks || []).some(function (d) {
      return drinkOrders(d).some(function (o) {
        return !_hasPrice(o);
      });
    });
  return true;
}
/** The order a guide implies, or null to fall through to the chosen sort. */
function guideCompare(a, b) {
  const g = activeGuide;
  if (g === "top10" || g === "tea") return _rankNum(a) - _rankNum(b) || (a.name || "").localeCompare(b.name || "");
  if (g === "goto") {
    const na = (topDrinkAt(a) || { n: 0 }).n,
      nb = (topDrinkAt(b) || { n: 0 }).n;
    return nb - na || _rankNum(a) - _rankNum(b) || (a.name || "").localeCompare(b.name || "");
  }
  if (g === "near" && userLoc) {
    const da = a.lat != null ? distKm(userLoc.lat, userLoc.lng, latOf(a), lngOf(a)) : Infinity,
      db = b.lat != null ? distKm(userLoc.lat, userLoc.lng, latOf(b), lngOf(b)) : Infinity;
    return da - db || (a.name || "").localeCompare(b.name || "");
  }
  if (g === "recent") {
    const ad = visitDates(a).slice(-1)[0] || "",
      bd = visitDates(b).slice(-1)[0] || "";
    return bd.localeCompare(ad) || (a.name || "").localeCompare(b.name || "");
  }
  return null;
}
function setGuide(g) {
  activeGuide = activeGuide === g ? "" : g;
  /* a guide is about places you have been; the want-to-try tab has its own short list */
  if (activeGuide && listTab === "want") listTab = "been";
  renderList();
  if (activeGuide === "near" && !userLoc && typeof locate === "function") locate();
}
function renderGuideRow() {
  const host = $("guiderow");
  if (!host) return;
  const show = !isAdmin && listTab === "been";
  host.hidden = !show;
  if (!show) {
    host.innerHTML = "";
    return;
  }
  host.innerHTML = GUIDE_DEFS.map(function (d) {
    return (
      '<button type="button" aria-pressed="' + (activeGuide === d[0] ? "true" : "false") +
      '" onclick="setGuide(\'' + d[0] + "')\">" + d[1] + "</button>"
    );
  }).join("");
}
function renderQuickChips() {
  const host = $("quickchips");
  if (!host) return;
  host.innerHTML = QUICK_DEFS.map(function (d) {
    const n = cafes.filter(c => !c.wish && guideMatch(c, d[0])).length;
    return (
      '<span class="chip' + (activeGuide === d[0] ? " on" : "") + '" role="button" tabindex="0" onclick="setGuide(\'' +
      d[0] + "')\">" + d[1] + " <small>" + n + "</small></span>"
    );
  }).join("");
}
/** The latest priced order of a drink, as dollars — the card's order line carries it. */
function cardPrice(d) {
  const os = drinkOrders(d)
    .filter(_hasPrice)
    .sort(function (x, y) {
      return (y.date || "").localeCompare(x.date || "");
    });
  return os.length ? fmtPrice(os[0].p) : "";
}
/* Faves and Wish are toggles on their own globals rather than activeChip values, so
   "coffee favorites" stays expressible — folding them into the single-select chip would
   quietly remove combined filters. They stay mutually exclusive to each other. */
let showTagRow = false;
function toggleFavFilter() {
  favOnly = !favOnly;
  renderList();
}
/* Closing the row also drops an active tag filter, otherwise the chip would be inert
   (the row has to stay open to show the lit tag) and the list would stay filtered by
   something no longer on screen. */
function toggleTagRow() {
  showTagRow = !showTagRow;
  if (!showTagRow && activeChip.slice(0, 4) === "tag:") activeChip = "";
  renderList();
}
/* ---------- been, and want to try ----------
   These are the two lists the app is actually about, and the wishlist spent its life as one
   chip among seven, two taps deep behind Filters. It is a tab now, and "Been" means been:
   the 7 places you have not been to stop padding the 106 you have. */
let listTab = "been";
function setListTab(t) {
  listTab = t === "want" ? "want" : "been";
  renderList();
}
function renderListTabs() {
  const host = $("listtabs");
  if (!host) return;
  const nBeen = cafes.filter(c => !c.wish).length,
    nWant = cafes.filter(c => c.wish).length;
  host.innerHTML = [
    ["been", "Been", nBeen],
    ["want", "Want to try", nWant],
  ]
    .map(function (t) {
      const on = listTab === t[0];
      return (
        '<button type="button" aria-pressed="' +
        (on ? "true" : "false") +
        '" onclick="setListTab(\'' +
        t[0] +
        "')\">" +
        t[1] +
        ' <span class="tabn">' +
        t[2] +
        "</span></button>"
      );
    })
    .join("");
}
/* Verdict and area are filters in their own right, combinable with the type chip above
   (the chip is single-select, so "loved, in Southside, matcha" was impossible). */
let activeVerdict = "",
  activeArea = "";
/* "Downtown Berkeley" and "Downtown Berkeley, CA" are one neighbourhood: group on the part
   before the first comma. */
/** @param {Cafe} c @returns {string} */
function areaKey(c) {
  return (areaOf(c) || "").split(",")[0].trim();
}
/* The one place a list is decided. renderList and the map button used to each carry their own
   copy of this, so a new filter had to be added twice and the second copy was easy to forget. */
/** @param {string} q lower-cased search text @returns {Cafe[]} */
function filteredCafes(q) {
  let items = cafes.filter(c => (listTab === "want" ? !!c.wish : !c.wish));
  if (favOnly) items = items.filter(c => c.fav);
  if (activeChip) items = items.filter(c => chipMatch(c, activeChip));
  if (activeVerdict && listTab !== "want") items = items.filter(c => bucketOf(c) === activeVerdict);
  if (activeArea) items = items.filter(c => areaKey(c) === activeArea);
  if (activeGuide && listTab !== "want") items = items.filter(c => guideMatch(c, activeGuide));
  if (q) items = items.filter(c => matchSearch(c, q));
  return items;
}
function setVerdict(v) {
  activeVerdict = activeVerdict === v ? "" : v;
  renderList();
}
function setArea(a) {
  activeArea = activeArea === a ? "" : a;
  renderList();
}
function filtersActive() {
  return !!(activeChip || favOnly || activeVerdict || activeArea || activeGuide || ($("q") && $("q").value.trim()));
}
/* Everything, including the search box — what "Clear" means to a person looking at a short list. */
function clearAll() {
  if ($("q")) $("q").value = "";
  clearFilters();
}
function renderResultLine(n) {
  const el = $("resultline");
  if (!el) return;
  if (!filtersActive()) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  const total = cafes.filter(c => (listTab === "want" ? !!c.wish : !c.wish)).length;
  el.innerHTML =
    "<span>" +
    n +
    " of " +
    total +
    (listTab === "want" ? " to try" : " places") +
    '</span><button type="button" onclick="clearAll()">Clear</button>';
  el.hidden = false;
}
function renderFilterChips() {
  const host = $("filterchips");
  if (!host) return;
  const nFav = cafes.filter(c => c.fav).length;
  const usedTags = ALL_TAGS.filter(t => t !== "matcha" && cafes.some(c => (c.tags || []).includes(t)));
  let h =
    '<span class="chip' +
    (activeChip === "" && !favOnly ? " on" : "") +
    '" role="button" tabindex="0" onclick="clearFilters()">All</span>';
  /* keep a lit chip on screen even if the set empties, or the list looks broken with
    nothing explaining why it is filtered */
  if (nFav || favOnly)
    h +=
      '<span class="chip' +
      (favOnly ? " on" : "") +
      '" role="button" tabindex="0" onclick="toggleFavFilter()">❤️ ' +
      nFav +
      "</span>";
  CHIP_DEFS.forEach(d => {
    h +=
      '<span class="chip' +
      (activeChip === d[0] ? " on" : "") +
      '" role="button" tabindex="0" onclick="setChip(\'' +
      d[0] +
      "')\">" +
      d[1] +
      "</span>";
  });
  if (usedTags.length)
    h +=
      '<span class="chip' +
      (showTagRow ? " on" : "") +
      '" role="button" tabindex="0" onclick="toggleTagRow()"># Tags</span>';
  host.innerHTML = h;
  renderGuideRow();
  renderQuickChips();
  renderVerdictAreaChips();
  const trow = $("tagchips");
  if (trow) {
    if (showTagRow) {
      trow.style.display = "";
      trow.innerHTML = usedTags
        .map(
          t =>
            '<span class="chip' +
            (activeChip === "tag:" + t ? " on" : "") +
            '" role="button" tabindex="0" onclick="setChip(\'tag:' +
            esc(t) +
            "')\">" +
            esc(t) +
            "</span>"
        )
        .join("");
    } else {
      trow.style.display = "none";
      trow.innerHTML = "";
    }
  }
}
function renderVerdictAreaChips() {
  const vg = $("verdictgroup"),
    ag = $("areagroup"),
    vh = $("verdictchips"),
    ah = $("areachips");
  if (!vh || !ah) return;
  const tab = cafes.filter(c => (listTab === "want" ? !!c.wish : !c.wish));
  /* a place you have not been has no verdict */
  vg.hidden = listTab === "want";
  vh.innerHTML = BUCKETS.map(function (b) {
    const n = tab.filter(c => bucketOf(c) === b[0]).length;
    return (
      '<span class="chip' +
      (activeVerdict === b[0] ? " on" : "") +
      '" role="button" tabindex="0" onclick="setVerdict(\'' +
      b[0] +
      '\')"><i class="vdot" style="background:' +
      BUCKET_HEX[b[0]] +
      '"></i>' +
      esc(b[2]) +
      " <small>" +
      n +
      "</small></span>"
    );
  }).join("");
  const count = {};
  tab.forEach(function (c) {
    const k = areaKey(c);
    if (k) count[k] = (count[k] || 0) + 1;
  });
  /* only areas with company, biggest first — a chip per one-off place is just the list again — but a lit one always stays */
  const keys = Object.keys(count)
    .filter(k => count[k] >= 2 || k === activeArea)
    .sort((a, b) => count[b] - count[a] || a.localeCompare(b))
    .slice(0, 10);
  ag.hidden = !keys.length;
  ah.innerHTML = keys
    .map(function (k) {
      return (
        '<span class="chip' +
        (activeArea === k ? " on" : "") +
        '" role="button" tabindex="0" data-area="' +
        esc(k) +
        '" onclick="setArea(this.dataset.area)">' +
        esc(k) +
        " <small>" +
        count[k] +
        "</small></span>"
      );
    })
    .join("");
}
/* The tab is not one of the things "All" clears — it is which list you are looking at. */
function clearFilters() {
  activeChip = "";
  favOnly = false;
  showTagRow = false;
  activeVerdict = "";
  activeArea = "";
  activeGuide = "";
  renderList();
}
function setChip(v) {
  activeChip = activeChip === v ? "" : v;
  if (activeChip.slice(0, 4) === "tag:") showTagRow = true;
  renderList();
}
function renderList() {
  _cardRanks = typeof rankMap === "function" ? rankMap() : null;
  const q = ($("q").value || "").toLowerCase().trim();
  const grid = $("grid");
  grid.classList.toggle("compact-list", listCompact);
  let items = filteredCafes(q);
  renderListTabs();
  renderFilterChips();
  updateFilterBadge();
  if (typeof updateMilkBtn === "function") updateMilkBtn();
  if (typeof updateSpellBtn === "function") updateSpellBtn();
  /* A viewer is told what the list is before they search it. Same height as before: it is the
     placeholder, not a row. */
  const _ph = $("q");
  if (_ph) {
    const nb = cafes.filter(c => !c.wish),
      nc = typeof countryCount === "function" ? countryCount(nb) : 0;
    _ph.placeholder = isAdmin
      ? "Search name, city, drink\u2026"
      : nb.length + " spots" + (nc > 1 ? " in " + nc + " countries" : "") + "\u2026";
  }
  items.sort((a, b) => {
    if (activeGuide) {
      const gs = guideCompare(a, b);
      if (gs !== null) return gs;
    }
    /* Untested cafes sort last, not mid-table. eloScoreNum returns exactly 5.0 with no
   comparisons, which floated every unranked cafe above the 36 that were compared and lost —
   putting the most-compared cafe in the app in last place. */
    /* Ordering. Every branch ends on name so the list never jitters between equal items, and
     "ranked" checks matchCount first: eloScoreNum() returns a real 5.0 for a never-compared
     cafe, so sorting on it alone floats every untested cafe above everything that was
     compared and lost. */
    if (sortMode === "ranked") {
      const ra = matchCount(a) > 0,
        rb = matchCount(b) > 0;
      if (ra !== rb) return ra ? -1 : 1;
      const ea = eloScoreNum(a),
        eb = eloScoreNum(b);
      if (ea !== eb) return eb - ea;
      const ma = matchCount(a),
        mb = matchCount(b);
      if (ma !== mb) return mb - ma;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sortMode === "rating") {
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      const sa = eloScoreNum(a),
        sb = eloScoreNum(b);
      if (sa !== sb) return sb - sa;
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sortMode === "near") {
      const da = userLoc && a.lat != null ? distKm(userLoc.lat, userLoc.lng, a.lat, a.lng) : Infinity;
      const db = userLoc && b.lat != null ? distKm(userLoc.lat, userLoc.lng, b.lat, b.lng) : Infinity;
      if (da !== db) return da - db;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return (a.name || "").localeCompare(b.name || "");
    }
    if (sortMode === "visited") {
      const ad = visitDates(a).slice(-1)[0] || "",
        bd = visitDates(b).slice(-1)[0] || "";
      return bd.localeCompare(ad) || (a.name || "").localeCompare(b.name || "");
    }
    const ua = a.updated ? Date.parse(a.updated) || 0 : 0,
      ub = b.updated ? Date.parse(b.updated) || 0 : 0;
    if (ua !== ub) return ub - ua;
    if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
    return (a.name || "").localeCompare(b.name || "");
  });

  grid.removeAttribute("aria-busy");
  grid.removeAttribute("aria-label");
  renderResultLine(items.length);
  if (!items.length) {
    grid.innerHTML = emptyStateHTML(q);
    return;
  }
  /* An empty list says why and offers the next step, rather than a line of grey text. The art
   is drawn with tokens, so it follows the theme. */
  function emptyStateHTML(q) {
    const art = function (kind) {
      return kind === "want"
        ? '<svg class="emptyart" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><circle cx="36" cy="36" r="34" class="ea-bg"/><path d="M24 14h24v42l-12-9-12 9z" class="ea-fg"/><path d="M30 27h12M30 33h8" class="ea-ln"/></svg>'
        : '<svg class="emptyart been" viewBox="0 0 72 72" aria-hidden="true" focusable="false"><circle cx="36" cy="36" r="34" class="ea-bg"/><path d="M20 28h28v14a12 12 0 0 1-12 12h-4a12 12 0 0 1-12-12z" class="ea-fg"/><path d="M48 31h4a6 6 0 0 1 0 12h-4" class="ea-ln2"/><path d="M28 18c0 3 3 3 3 6M36 18c0 3 3 3 3 6" class="ea-ln2"/></svg>';
    };
    const box = function (kind, title, body, btn) {
      return (
        '<div class="emptyx" style="grid-column:1/-1">' +
        art(kind) +
        "<h3>" +
        title +
        "</h3><p>" +
        body +
        "</p>" +
        (btn || "") +
        "</div>"
      );
    };
    const act = function (label, fn) {
      return '<button type="button" class="btn" onclick="' + fn + '">' + label + "</button>";
    };
    const typed = ($("q") && $("q").value.trim()) || "";
    if (filtersActive()) {
      if (favOnly && !typed && !activeChip && !activeVerdict && !activeArea)
        return box(
          "been",
          "No favorites yet",
          "Tap the heart on a cafe to keep it here.",
          act("Show everything", "clearAll()")
        );
      return box(
        "been",
        "No matches",
        typed
          ? "Nothing matches \u201c" + esc(typed) + "\u201d with these filters."
          : "No cafe fits these filters together.",
        act("Clear filters", "clearAll()")
      );
    }
    if (listTab === "want")
      return box(
        "want",
        "Nothing to try yet",
        "Save places you hear about and they will show up here, and on the map.",
        isAdmin ? act("Save a place", "openForm()") : ""
      );
    return box(
      "been",
      "No cafes yet",
      "Every cafe you log shows up here, ranked.",
      isAdmin ? act("Log your first visit", "openForm()") : ""
    );
  }
  /* Card meta reads distance · area · time — shortest and most perishable token first, so
   only the time clips. The rating now lives in the tile pill, and the liked tally is gone:
   its denominator was degenerate (all-yes or all-no in every non-zero case). */
  /* In the row layout a long list needs landmarks: sticky bands that follow the sort (Top 10, This week,
     Within a mile...). Not while searching, filtering by a guide, or in the photo layout, where the
     list is short or a grid. */
  const bandsOn = listCompact && !q && !activeGuide;
  const bandOf = bandsOn ? bandFor : null;
  const bandCount = {};
  if (bandOf)
    items.forEach(function (c) {
      const l = bandOf(c);
      bandCount[l] = (bandCount[l] || 0) + 1;
    });
  let lastBand = null;
  grid.innerHTML = items
    .map(function (c) {
      let band = "";
      if (bandOf) {
        const l = bandOf(c);
        if (l !== lastBand) {
          band = '<div class="band" role="presentation">' + esc(l) + " \u00b7 " + bandCount[l] + "</div>";
          lastBand = l;
        }
      }
      const gp = gphotoFor(c);
      const dkm = userLoc && c.lat != null ? distKm(userLoc.lat, userLoc.lng, c.lat, c.lng) : null;
      const dstr = dkm != null ? fmtDist(dkm) : "";

      /* A photo that has already failed once must not be re-offered, or the tile flashes a
     broken image on every re-render. */
      const hasPhoto = !!(gp && !_imgFail[c.id]);
      let cls = "ph",
        style;
      if (hasPhoto) {
        cls += " loaded";
        style = ' data-bg="' + esc(safeUrl(gp)) + '"';
      } else {
        cls += " nophoto";
        style = ' style="' + nophotoStyle(c) + '"';
      }

      const M = [];
      if (dstr) M.push(sortMode === "near" ? '<span class="near">' + dstr + "</span>" : dstr);
      if (areaOf(c)) M.push(esc(areaOf(c)));
      /* "No visit date" on a place you have not been is the definition of the want-to-try tab,
     and it was what truncated the area to "West San Jose · No vis…" seven times over. */
      const _td = !c.wish && typeof topDrinkAt === "function" ? topDrinkAt(c) : null;
      const _tp = _td ? cardPrice(_td.d) : "";
      const _lv = c.wish ? "" : lastVisitedStr(c, true);
      if (_lv) M.push(_lv);
      const _rk = !c.wish && typeof rankOf === "function" ? rankOf(c, _cardRanks || undefined) : null;

      return (
        band +
        '<div class="card" data-id="' +
        c.id +
        '" role="button" tabindex="0" onclick="openDetail(\'' +
        c.id +
        "','list')\">" +
        '<div class="' +
        cls +
        '"' +
        style +
        ">" +
        phInner(c, hasPhoto) +
        "</div>" +
        '<div class="b">' +
        '<div class="n">' +
        esc(c.name) +
        "</div>" +
        '<div class="m">' +
        M.join(" · ") +
        "</div>" +
        (_td
          ? '<div class="cdrink"><span class="cdn"><span class="cdo">Order the </span>' +
            esc(_td.d.n) +
            "</span>" +
            (_tp ? '<b class="cdp">' + _tp + "</b>" : "") +
            "</div>"
          : "") +
        "</div>" +
        '<span class="compact-stars">' +
        (bucketLabel(c) || "Not rated yet") +
        "</span>" +
        (_rk ? '<span class="rkcol' + (_rk <= 10 ? " g" : "") + '">#' + _rk + "</span>" : "") +
        "</div>"
      );
    })
    .join("");

  /* Photos are verified after the markup lands, so a stale URL can swap the tile in place
   rather than blocking the render. */
  lazyCardPhotos();
}
/** The landmark a cafe sits under, for the sort in force. */
function bandFor(c) {
  if (sortMode === "ranked") {
    const r = typeof rankOf === "function" && !c.wish ? rankOf(c, _cardRanks || undefined) : null;
    return !r ? "Not ranked yet" : r <= 10 ? "Top 10" : r <= 30 ? "11 to 30" : r <= 60 ? "31 to 60" : "The rest";
  }
  if (sortMode === "rating") return bucketLabel(c) || "Not rated yet";
  if (sortMode === "near") {
    if (!userLoc || c.lat == null) return "Distance unknown";
    const mi = distKm(userLoc.lat, userLoc.lng, latOf(c), lngOf(c)) * 0.621371;
    return mi <= 1 ? "Within a mile" : mi <= 5 ? "Within 5 miles" : mi <= 25 ? "Within 25 miles" : "Further out";
  }
  const iso = sortMode === "visited" ? visitDates(c).slice(-1)[0] || "" : c.updated || "";
  if (!iso) return "No date";
  const days = (Date.now() - new Date(iso).getTime()) / 86400000;
  return days <= 7 ? "This week" : days <= 31 ? "This month" : days <= 365 ? "Earlier this year" : "Earlier";
}
/* Photos load when a card nears the screen, not all at once. They are CSS backgrounds, so the
   browser's loading="lazy" cannot apply, and each card also probed its URL with a new Image()
   the moment it rendered, so every photo in a 100+ cafe list was requested up front. Without
   IntersectionObserver (very old browsers) everything loads at once, as it always did. */
let _photoIO = null;
function _showCardPhoto(el) {
  const url = el.dataset.bg;
  if (!url) return;
  el.style.backgroundImage = 'url("' + url + '")';
  el.removeAttribute("data-bg");
  const card = el.closest(".card");
  if (card) verifyCardPhoto(card.dataset.id, url);
}
function lazyCardPhotos() {
  if (_photoIO) {
    _photoIO.disconnect();
    _photoIO = null;
  }
  const els = Array.prototype.slice.call(document.querySelectorAll("#grid .ph[data-bg]"));
  if (!els.length) return;
  if (!("IntersectionObserver" in window)) {
    els.forEach(_showCardPhoto);
    return;
  }
  _photoIO = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          _photoIO.unobserve(e.target);
          _showCardPhoto(e.target);
        }
      });
    },
    { rootMargin: "300px 0px" }
  );
  els.forEach(function (el) {
    _photoIO.observe(el);
  });
}
/* Rows are the default now: 111 cards were 12,000px of scroll on a phone. Photo cards stay one tap away in Settings. */
let listCompact = localStorage.getItem("cafemap.listLayout") !== "grid";
/* Set explicitly from Settings; toggleListLayout stays for any caller that only wants the
   other one of the two. */
function setListLayout(compact) {
  listCompact = !!compact;
  lsSet("cafemap.listLayout", listCompact ? "compact" : "grid");
  renderList();
  if (typeof renderSettings === "function") renderSettings();
}
function toggleListLayout() {
  setListLayout(!listCompact);
}
let sortMode = "recent";
/* ---------- one control row ----------
   The List spent 217px — a quarter of a phone screen — on four stacked rows before the first
   cafe: search, filter chips, a count beside a sort menu, and a layout toggle alone on its
   own row. Chips and sort now sit behind one Filters control that says how many are active;
   the layout toggle went to Settings, where a preference belongs. */
function toggleListFilters() {
  const p = $("listpanel"),
    b = $("filterbtn");
  if (!p || !b) return;
  p.hidden = !p.hidden;
  b.setAttribute("aria-expanded", String(!p.hidden));
  const ch = b.querySelector(".fchev");
  if (ch) ch.textContent = p.hidden ? "\u25be" : "\u25b4";
}
/* A count only means anything if it matches what a person would call a filter. The default
   sort is not one; every other choice is. */
function activeFilterCount() {
  let n = 0;
  if (activeChip) n++;
  if (favOnly) n++;
  if (activeVerdict) n++;
  if (activeArea) n++;
  /* the viewer's guide shows itself on the row; the owner's views live inside the panel */
  if (isAdmin && activeGuide) n++;
  if (sortMode && sortMode !== "recent") n++;
  return n;
}
function updateFilterBadge() {
  const el = $("fcount");
  if (!el) return;
  const n = activeFilterCount();
  el.textContent = n ? String(n) : "";
  el.hidden = !n;
  const b = $("filterbtn");
  if (b) b.classList.toggle("on", n > 0);
}
function setSort(v) {
  sortMode = v;
  renderList();
  if (v === "near") {
    if (navigator.geolocation) showUserLocation(false);
    else toast("Location not available");
  }
}
/* From the Want tab this opens the map with the Want to try switch on — it used to zoom to the
   wishlist but leave all the visited pins around it. From Been it turns the switch off. */
function showFilteredOnMap() {
  if (typeof toggleWantOnly === "function") {
    if (listTab === "want") toggleWantOnly(true);
    else if (mapWantOnly) toggleWantOnly(false);
  }
  const q = ($("q").value || "").toLowerCase().trim();
  const items = filteredCafes(q);
  const pts = items.filter(c => c.lat != null);
  show("map");
  if (!gmap || !pts.length) return;
  setTimeout(() => {
    if (pts.length === 1) {
      gmap.setCenter({ lat: pts[0].lat, lng: pts[0].lng });
      gmap.setZoom(15);
    } else {
      const b = new google.maps.LatLngBounds();
      pts.forEach(c => b.extend({ lat: c.lat, lng: c.lng }));
      gmap.fitBounds(b, fitPad());
    }
  }, 100);
}
