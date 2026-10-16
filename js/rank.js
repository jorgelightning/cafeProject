"use strict";
/* rank.js — Elo scoring, the board, and the post-save ranking sheet.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- Elo ---------- */
const ELO_BASE = 1500;
function eloFor(c) {
  return c && typeof c.elo === "number" ? c.elo : ELO_BASE;
}
/* A cafe is PROVISIONAL until it has been compared this many times. While it is, it is placed by a
   search (below), not nudged by Elo, and it is not yet used as a yardstick for anyone else. */
const PLACING = 5;
function isProvisional(c) {
  return matchCount(c) < PLACING;
}
/* Every cafe moves by its OWN K, so a newcomer moves a lot and a veteran barely moves, whoever won.
   It used to be the winner's count alone, so a veteran beating a newcomer cost the newcomer 5 points
   and a newcomer beating a veteran moved both by 22. */
function kFor(c) {
  return Math.max(16, 40 - 6 * matchCount(c));
}
/* Where cafes of one verdict tend to sit: the mean Elo of the established ones. A cafe you called
   Loved is shrunk towards the Loved average, not towards the middle of the whole board — the tier is
   a prior, not a wall, so enough comparisons can still carry a cafe across it. Memoised on a cheap
   signature of the board, since the sort asks for a score thousands of times. */
let _priorSig = -1,
  _prior = {};
function tierPriors() {
  let sig = cafes.length;
  for (let i = 0; i < cafes.length; i++) sig = (sig * 31 + matchCount(cafes[i]) * 7 + Math.round(eloFor(cafes[i]))) % 1000003;
  if (sig === _priorSig) return _prior;
  const sum = {},
    n = {};
  cafes.forEach(function (c) {
    if (c.wish || isProvisional(c)) return;
    const k = bucketOf(c) || "";
    sum[k] = (sum[k] || 0) + eloFor(c);
    n[k] = (n[k] || 0) + 1;
  });
  const out = {};
  Object.keys(n).forEach(function (k) {
    if (k && n[k] >= 3) out[k] = sum[k] / n[k];
  });
  _priorSig = sig;
  _prior = out;
  return out;
}
function tierPrior(c) {
  const p = tierPriors()[bucketOf(c) || ""];
  return p === undefined ? ELO_BASE : p;
}
/* Never compared is exactly 5.0, a real midpoint, and has no position (see DESIGN_NOTES). Otherwise a
   cafe's Elo is shrunk by how few comparisons it has: towards the middle of the board when it has
   plenty, towards its own verdict's average when it has few. The change is faded in below eight
   comparisons (`fade` is 1 up to two, 0 from eight), so a well-compared cafe scores exactly as it
   always did and only the barely-compared ones are lifted off the midpoint, where a single comparison
   used to leave a Loved cafe at 5.0. While it is still being placed, an answer is worth more too:
   m/(m+2) instead of m/(m+4). */
function eloScoreNum(c) {
  const m = matchCount(c);
  if (!m) return 5;
  const fade = Math.max(0, Math.min(1, (8 - m) / 6)),
    conf = m / (m + 4 - 2 * fade),
    target = ELO_BASE + fade * (tierPrior(c) - ELO_BASE);
  return Math.max(0, Math.min(10, 5 + (target + (eloFor(c) - target) * conf - ELO_BASE) / 45));
}
/* ---------- placement ----------
   A new cafe was paired with whichever cafe had the fewest comparisons, so two near-blank cafes met
   and neither learned anything; with one comparison a cafe kept a fifth of its Elo gap and stayed
   near 5.0 whatever it had beaten. Now it is PLACED, as a search: it meets the established cafes of its
   own verdict, best-guess first, and each answer moves its position by a step that shrinks. The
   position IS its Elo (read back by rank among the references), and the number of comparisons says
   how far along the search is, so nothing new is stored on a cafe. */
function placementRefs(c) {
  const est = cafes.filter(function (x) {
    return !x.wish && x.id !== c.id && !isProvisional(x);
  });
  const k = bucketOf(c) || "";
  const same = k
    ? est.filter(function (x) {
        return (bucketOf(x) || "") === k;
      })
    : [];
  /* a verdict with too few established cafes to search among borrows the whole board */
  return (same.length >= 6 ? same : est).sort(function (a, b) {
    return eloFor(b) - eloFor(a);
  });
}
/** Where an Elo falls among the references: 0 is at the top, n-1 at the bottom, fractions between. */
function placementPos(e, refs) {
  const n = refs.length;
  if (e >= eloFor(refs[0])) return -Math.min(4, (e - eloFor(refs[0])) / 25);
  for (let i = 1; i < n; i++) {
    const hi = eloFor(refs[i - 1]),
      lo = eloFor(refs[i]);
    if (e >= lo) return hi > lo ? i - 1 + (hi - e) / (hi - lo) : i;
  }
  return n - 1 + Math.min(4, (eloFor(refs[n - 1]) - e) / 25);
}
/** The inverse: the Elo at a position among the references. Past either end it extends a little. */
function placementElo(refs, r) {
  const n = refs.length;
  if (r <= 0) return Math.round(eloFor(refs[0]) + Math.min(40, -r * 10 + 8));
  if (r >= n - 1) return Math.round(eloFor(refs[n - 1]) - Math.min(40, (r - (n - 1)) * 10 + 8));
  const i = Math.floor(r),
    f = r - i;
  return Math.round(eloFor(refs[i]) + (eloFor(refs[i + 1]) - eloFor(refs[i])) * f);
}
/** How far one answer moves a cafe that has had m comparisons: a quarter of the list, then a sixth... */
function placementStep(m, n) {
  return Math.max(Math.min(3, n / 6), n / (2 * (m + 2)));
}
/** The reference a provisional cafe should meet next, or null when there are too few to search. */
function placementOpponent(c) {
  const refs = placementRefs(c);
  if (refs.length < 3) return null;
  const r0 = matchCount(c) === 0 ? refs.length / 2 : placementPos(eloFor(c), refs);
  const mid = Math.max(0, Math.min(refs.length - 1, Math.round(r0)));
  const order = [0, 1, -1, 2, -2, 3, -3];
  for (let i = 0; i < order.length; i++) {
    const x = refs[mid + order[i]];
    if (x && _chaserSeen.indexOf(pairKey(c.id, x.id)) < 0) return x;
  }
  return refs[mid];
}
function eloScore(c) {
  return eloScoreNum(c).toFixed(1);
}
function matchCount(c) {
  return (c && c.matches) || 0;
}
function pairKey(a, b) {
  return [a, b].sort().join("###");
}
function normDrink(n) {
  return (n || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
/* Drinks are no longer ranked head-to-head — the pairing rate was 26% and 120 of the 140
   possible pairs were the same drink — but 22 cafes carry scores from before that stopped,
   and the detail page still shows them. See DESIGN_NOTES.md. */
function drinkElo(d) {
  return d && typeof d.elo === "number" ? d.elo : ELO_BASE;
}
function drinkMatches(d) {
  return (d && d.matches) || 0;
}
function drinkScoreNum(d) {
  const m = drinkMatches(d);
  const conf = m / (m + 12);
  return Math.max(0, Math.min(10, 5 + ((drinkElo(d) - ELO_BASE) / 80) * conf));
}
function drinkScore(d) {
  return drinkScoreNum(d).toFixed(1);
}
function openRank() {
  show("compare");
}

/* ---------- the board ----------
   The tab used to open a matchup and hide the standing behind `if(!isAdmin)`, so the owner
   had cast 184 head-to-heads and never seen the ordering they produced. Now the slot holds
   the standing for both roles and ranking is a button on it. */
/* Several ranked cafes have an empty or numeric area; fall back to state, then country,
   suppressing "Other" — COUNTRY_INFO has no entry for Vietnam or Indonesia, so printing it
   would be worse than printing nothing. */
function boardArea(c) {
  const a = (c.area || "").trim();
  if (a && !/^\d+$/.test(a)) return a;
  const st = typeof cafeStateName === "function" ? cafeStateName(c) : "";
  if (st) return st;
  const co = typeof cafeCountryName === "function" ? cafeCountryName(c) : "";
  return co && co !== "Other" ? co : "";
}
/* ---------- a board row is a recommendation, not a position ----------
   The row used to read "#1 · Zen Gelato & Bar · 11 comparisons · <area> · 7.4". A visitor was
   told how often the owner had compared it and given a score where #1 and #2 both print 7.4,
   and none of the stars, drinks or written notes already on the record reached the screen.

   No photo here on purpose: photos are fetched lazily on the detail page so Places costs one
   lookup per cafe *viewed* rather than one per cafe *listed*, and 102 rows would invert that.
   The emoji tile the board already used stays. */
/** @param {Cafe|null|undefined} c @returns {{d:Drink,n:number}|null} */
function topDrinkAt(c) {
  const ds = ((c && c.drinks) || [])
    .map(function (d) {
      return {
        d: d,
        n: drinkOrders(d).reduce(function (t, o) {
          return t + orderQty(o);
        }, 0),
      };
    })
    .filter(function (x) {
      return (x.d.n || "").trim();
    });
  if (!ds.length) return null;
  ds.sort(function (a, b) {
    return b.n - a.n || (a.d.n || "").localeCompare(b.d.n || "");
  });
  return ds[0];
}
/* Trim on a word boundary — a note cut mid-word reads as broken rather than abbreviated. */
function boardSnip(t, max) {
  t = String(t || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(" ");
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,.;:\u2014-]+$/, "") + "\u2026";
}
/* ---------- near you ----------
   A standing that opens with a cafe 2,400 miles away is a list of places you cannot go. When
   the app knows where you are, the same ranking is split by what you can actually reach: best
   nearby first, everything else still underneath. Ordering inside each group stays the
   standing — "the best places near you", not "the closest ones". */
const NEAR_MI = 25;
function boardDistTo(c) {
  if (!userLoc || !c || c.lat == null || c.lng == null) return null;
  return distKm(userLoc.lat, userLoc.lng, c.lat, c.lng);
}
function boardIsNear(c) {
  const d = boardDistTo(c);
  return d != null && d * 0.621371 <= NEAR_MI;
}
/* A row on the Go board reads in one glance: rank, name, place, and the drink to order. The owner's own
   sentence and the ranking bookkeeping (comparisons, score) wait behind a small chevron, so a page of ninety
   rows is a list of places, not a page of paragraphs. The row itself still opens the cafe. */
function lbToggle(btn) {
  const row = btn.closest(".lbrow");
  const more = row && row.querySelector(".lbextra");
  if (!more) return;
  const open = more.hidden;
  more.hidden = !open;
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  row.classList.toggle("open", open);
}
function boardRow(c, pos, unique) {
  const rank = pos <= 3 && unique ? ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49"][pos - 1] : "#" + pos;
  const ar = boardArea(c),
    m = matchCount(c);
  const dkm = boardDistTo(c);
  const top = topDrinkAt(c);
  /* On a best-first list every top row said "Loved it" — 90 pills down the page, 3 of them
     distinct. The position already says it, so the pill appears only when a row BREAKS the
     pattern: a fine or a not-for-me sitting in the ranking. */
  const stars = bucketOf(c) === "loved" ? "" : bucketPill(c, "lbstars");
  const place = [dkm != null ? fmtDist(dkm) : "", ar ? esc(ar) : ""].filter(Boolean).join(" \u00b7 ");
  const sub =
    (place ? '<span class="lbplace">' + place + "</span>" : "") +
    (place && top ? '<span class="lbdot"> \u00b7 </span>' : "") +
    (top ? '<span class="lborder">' + esc(top.d.n) + "</span>" : "");
  /* D: a comparison count and a score describe the ranking process, not the cafe. The owner
     still needs both; a visitor can act on neither. */
  const book = isAdmin
    ? '<div class="lbbook">' +
      m +
      " comparison" +
      (m === 1 ? "" : "s") +
      ' \u00b7 score <span class="lbscore soft">' +
      eloScore(c) +
      "</span>" +
      (top && top.n > 1 ? " \u00b7 ordered " + top.n + "\u00d7" : "") +
      "</div>"
    : "";
  const say = boardSnip(c.review, 220);
  const note = say ? '<div class="lbsay">\u201c' + esc(say) + "\u201d</div>" : "";
  const extra = note + book;
  return (
    '<div class="lbrow guide">' +
    '<div class="lbhit tap" role="button" tabindex="0" onclick="openDetail(\'' +
    c.id +
    "','compare')\">" +
    '<span class="lbrank">' +
    rank +
    "</span>" +
    '<div class="lbmain">' +
    '<div class="lbname">' +
    esc(c.name) +
    stars +
    "</div>" +
    (sub ? '<div class="lbsub">' + sub + "</div>" : "") +
    "</div></div>" +
    (extra
      ? '<button class="lbmore" type="button" aria-expanded="false" aria-label="' +
        (say ? "Show note" : "Show details") +
        " for " +
        esc(c.name) +
        '" onclick="lbToggle(this)">\u25be</button>' +
        '<div class="lbextra" hidden>' +
        extra +
        "</div>"
      : "") +
    "</div>"
  );
}
/* Ten visible, the rest folded — the same shape whichever group it is. */
function boardChunk(rows) {
  const html = rows.map(function (r) {
    return r.html;
  });
  let h = html.slice(0, 10).join("");
  if (html.length > 10)
    h +=
      '<div class="foldbox">' +
      html.slice(10).join("") +
      "</div>" +
      '<button class="morebtn" data-lab="Show all ' +
      html.length +
      '" onclick="statFold(this)">Show all ' +
      html.length +
      " ▾</button>";
  return h;
}
function boardQueueRow(c) {
  const ar = boardArea(c),
    lv = chaserLast(c);
  const sub = [ar ? esc(ar) : "", chaserWhen(lv)].filter(Boolean).join(" · ");
  const right = isAdmin ? '<span class="rank-lnk">Rank ›</span>' : bucketPill(c, "gostar");
  const act = isAdmin ? "boardRank('" + c.id + "')" : "openDetail('" + c.id + "','compare')";
  return (
    '<div class="gorow" role="button" tabindex="0" onclick="' +
    act +
    '"><span class="gotile" style="background:' +
    tintFor(c) +
    '">' +
    esc(c.emoji || "☕") +
    "</span>" +
    '<div class="lbmain"><div class="lbname">' +
    esc(c.name) +
    '</div><div class="lbsub">' +
    sub +
    "</div></div>" +
    right +
    "</div>"
  );
}
function renderBoard() {
  const host = $("cmp-body");
  if (!host) return;
  const vis = cafes.filter(function (c) {
    return !c.wish;
  });
  const board = chaserBoard();
  const never = vis
    .filter(function (c) {
      return matchCount(c) === 0;
    })
    .sort(function (a, b) {
      return (chaserLast(b) || "").localeCompare(chaserLast(a) || "");
    });
  const placing = vis.filter(function (c) {
    return matchCount(c) > 0 && isProvisional(c);
  });
  const h2h = Math.round(
    vis.reduce(function (s, c) {
      return s + matchCount(c);
    }, 0) / 2
  );
  /* D: a visitor is told what the collection is; the owner is told how far the ranking has
     got. The second is a progress report on a chore only they can do. */
  const countries = countryCount(vis);
  const sub = isAdmin
    ? board.length +
      " of " +
      vis.length +
      " cafes ranked" +
      (h2h ? " \u00b7 " + h2h + " head-to-head" + (h2h === 1 ? "" : "s") : "")
    : vis.length + " cafes \u00b7 " + countries + " countr" + (countries === 1 ? "y" : "ies") + " \u00b7 best first";
  let h =
    '<div class="cmp-head left"><div class="ct">\ud83c\udfc6 Where to go</div><div class="cs">' + sub + "</div></div>";
  if (isAdmin && vis.length > 1)
    h +=
      '<div class="handoff top" role="button" tabindex="0" onclick="boardRank()">⚖️ Rank a pair' +
      (never.length ? " <span>· " + never.length + " never compared</span>" : "") +
      (placing.length ? " <span>· " + placing.length + " still placing</span>" : "") +
      "</div>";
  if (!board.length) {
    h +=
      '<div class="empty"><div class="big">🏆</div>Nothing ranked yet.' +
      (isAdmin ? " Tap “Rank a pair”, or log a visit and answer the question that follows." : "") +
      "</div>";
  } else {
    /* Competition ranking off the same helper the sheet quotes, so "#2 → #1" in the popup and
       "#1" here can never disagree. Genuine ties share a position. */
    const rm = rankMap();
    const pos = board.map(function (c) {
      return rm[c.id];
    });
    const uniq = {};
    pos.forEach(function (p) {
      uniq[p] = (uniq[p] || 0) + 1;
    });
    const rows = board.map(function (c, i) {
      return { html: boardRow(c, pos[i], uniq[pos[i]] === 1), near: boardIsNear(c), c: c };
    });
    const near = rows.filter(function (r) {
        return r.near;
      }),
      far = rows.filter(function (r) {
        return !r.near;
      });
    if (!userLoc) {
      /* Nothing here may raise the location prompt on its own — only a tap may, which is the
         rule locate() exists to keep. */
      h +=
        '<div class="handoff top" role="button" tabindex="0" onclick="locate()">📍 Show what\u2019s near me <span>›</span></div>';
      h += boardChunk(rows);
    } else if (!near.length) {
      const closest = rows.slice().sort(function (a, b) {
        return (boardDistTo(a.c) || 1e9) - (boardDistTo(b.c) || 1e9);
      })[0];
      const cd = closest ? boardDistTo(closest.c) : null;
      h +=
        '<div class="statsec">Nothing within ' +
        NEAR_MI +
        " miles" +
        (closest && cd != null ? " — nearest is " + esc(closest.c.name) + ", " + fmtDist(cd) + " away" : "") +
        "</div>";
      h += boardChunk(rows);
    } else {
      h += '<div class="statsec">📍 Near you — ' + near.length + " within " + NEAR_MI + " miles</div>";
      h += boardChunk(near);
      if (far.length) {
        h += '<div class="statsec">Further afield — ' + far.length + "</div>";
        h += boardChunk(far);
      }
    }
    if (isAdmin) {
      const thin = board.filter(function (c) {
        return matchCount(c) < 3;
      }).length;
      h +=
        '<div class="statnote">Positions come from ' +
        h2h +
        " head-to-head pick" +
        (h2h === 1 ? "" : "s") +
        ", not from stars." +
        (thin
          ? " " +
            thin +
            " cafe" +
            (thin === 1 ? " has" : "s have") +
            " fewer than three comparisons, so " +
            (thin === 1 ? "its place is" : "their places are") +
            " provisional."
          : "") +
        "</div>";
    }
  }
  /* D: "Never compared" is a queue of work only the owner can clear. */
  if (isAdmin && never.length) {
    const q = never.map(boardQueueRow);
    h += '<div class="statsec">Never compared — ' + never.length + "</div>" + q.slice(0, 3).join("");
    if (q.length > 3)
      h +=
        '<div class="foldbox">' +
        q.slice(3).join("") +
        "</div>" +
        '<button class="morebtn" data-lab="Show all ' +
        q.length +
        '" onclick="statFold(this)">Show all ' +
        q.length +
        " ▾</button>";
  }
  /* a short queue of the cafes still being placed, fewest comparisons first */
  if (isAdmin && placing.length) {
    const pq = placing
      .slice()
      .sort(function (a, b) {
        return matchCount(a) - matchCount(b);
      })
      .slice(0, 5);
    h += '<div class="statsec">Still placing — ' + placing.length + "</div>" + pq.map(boardQueueRow).join("");
  }
  h +=
    '<div class="handoff" role="button" tabindex="0" onclick="show(\'stats\')">📊 See the numbers behind this <span>›</span></div>';
  host.innerHTML = '<div class="boardwrap">' + h + "</div>";
}
/* On-demand ranking. Anchors on a never-compared cafe when there is one, so the button
   closes the coverage gap rather than re-testing the well-tested. */
function boardRank(id) {
  if (!isAdmin) {
    toast("Sign in to rank");
    return;
  }
  const vis = cafes.filter(function (c) {
    return !c.wish;
  });
  if (vis.length < 2) {
    toast("Add another cafe first");
    return;
  }
  let anchor = id
    ? cafes.find(function (c) {
        return c.id === id;
      })
    : null;
  if (!anchor) {
    const never = vis.filter(function (c) {
      return matchCount(c) === 0;
    });
    const pool = never.length
      ? never
      : vis
          .slice()
          .sort(function (a, b) {
            return matchCount(a) - matchCount(b);
          })
          .slice(0, 12);  /* the fewest-compared first, which is the cafes still being placed */
    anchor = pool[Math.floor(Math.random() * pool.length)];
  }
  if (!anchor) return;
  chaserArm(anchor.id);
  if (!_chaser) {
    toast("No opponent available yet");
    return;
  }
  _chaser.board = true;
  chaserPaint();
}

/* ---------- post-save ranking sheet ("chaser") ----------
   Ranking as a destination went unused, so the question comes to the save instead. It ranks
   CAFES, not drinks: replaying all dated logs chronologically, a same-name drink opponent
   existed only 26% of the time and drink scores cannot move at the observed match counts.
   Cafes pair 100% of the time and already spread 2.9-7.4. The drink just logged still does
   the work — it picks the opponent and justifies the pairing. See DESIGN_NOTES.md. */
let _chaser = null,
  _chaserSeen = [];
/* Read-only: the drink is recovered from the SAVED cafe, never from the form or _formSnap, so
   it works identically on all three save branches and cannot couple to the unsaved guard. */
function chaserFresh(c) {
  const T = localToday();
  const today = (c.drinks || []).filter(function (d) {
    return (d.dates || []).indexOf(T) >= 0;
  });
  if (today.length) return today[today.length - 1];
  let best = null,
    bd = "";
  (c.drinks || []).forEach(function (d) {
    (d.dates || []).filter(Boolean).forEach(function (dt) {
      if (dt > bd) {
        bd = dt;
        best = d;
      }
    });
  });
  if (best && (Date.now() - new Date(bd).getTime()) / 86400000 <= 3) return best;
  return null;
}
/* Ordered: matcha before coffee so "Matcha Einspaner" is matcha, tea before coffee so
   "Dong Ding Oolong Latte" is tea. First match wins. */
/** @type {[string, RegExp][]} */
const CHASER_FAM = [
  ["hojicha", /hojicha|houjicha|hojica|hoji/],
  ["matcha", /matcha/],
  ["milk tea", /milk tea|boba|bubble|pudding|brown sugar|taro|yakult|cheese foam/],
  ["tea", /oolong|jasmine|osmanthus|genmai|earl ?grey|chai|yuzu|dong ?ding|tieguanyin|pu.?er|\btea\b|\bcha\b/],
  [
    "coffee",
    /latte|espresso|americano|cappuccino|coffee|cortado|mocha|drip|pour.?over|cold ?brew|caphe|einspan|flat white|affogato/,
  ],
];
function chaserFam(n) {
  const s = (n || "").toLowerCase();
  for (let i = 0; i < CHASER_FAM.length; i++) if (CHASER_FAM[i][1].test(s)) return CHASER_FAM[i][0];
  return null;
}
function chaserLast(c) {
  const ds = [];
  (c.drinks || []).forEach(function (d) {
    (d.dates || []).filter(Boolean).forEach(function (x) {
      ds.push(x);
    });
  });
  return ds.sort().slice(-1)[0] || "";
}
function chaserWhen(iso) {
  if (!iso) return "no dates";
  const dd = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dd <= 0) return "today";
  if (dd === 1) return "yesterday";
  if (dd < 7) return dd + "d ago";
  if (dd < 31) return Math.floor(dd / 7) + "w ago";
  if (dd <= 120) return Math.floor(dd / 30) + "mo ago";
  return fmtDate(iso).replace(/ \d+,/, "");
}
function chaserArm(id) {
  _chaser = null;
  if (!isAdmin) return;
  const c = cafes.find(function (x) {
    return x.id === id;
  });
  if (!c || c.wish) return;
  const base = cafes.filter(function (x) {
    return !x.wish && x.id !== c.id;
  });
  if (!base.length) return;
  const fresh = chaserFresh(c),
    fam = fresh ? chaserFam(fresh.n) : null;
  /* A cafe still being placed meets a reference from its own verdict, whatever it just drank. */
  if (isProvisional(c)) {
    const ref = placementOpponent(c);
    if (ref) {
      _chaser = {
        cafe: c.id,
        opp: ref.id,
        tier: "P",
        fam: fam,
        myDrink: fresh ? fresh.n : null,
        theirDrink: null,
        flip: Math.random() < 0.5,
        ts: Date.now(),
        res: null,
        board: false,
      };
      return;
    }
  }
  let tier = "C",
    cand = base;
  if (fresh) {
    const twin = base.filter(function (x) {
      return (x.drinks || []).some(function (od) {
        return normDrink(od.n) === normDrink(fresh.n);
      });
    });
    if (twin.length) {
      tier = "A";
      cand = twin;
    } else if (fam) {
      const f = base.filter(function (x) {
        return (x.drinks || []).some(function (od) {
          return chaserFam(od.n) === fam;
        });
      });
      if (f.length) {
        tier = "B";
        cand = f;
      }
    }
  }
  /* Coverage is the binding constraint — 18 cafes have never been compared and most were
     visited recently — so fewest-matches dominates the cost. */
  const scored = cand
    .map(function (x) {
      let cost = 0.35 * matchCount(x);
      const lv = chaserLast(x);
      if (!lv) cost += 0.6;
      else if ((Date.now() - new Date(lv).getTime()) / 86400000 > 180) cost += 1.2;
      if (x.area && c.area && x.area.trim() === c.area.trim()) cost -= 0.4;
      if ((bucketOf(x) || "") !== (bucketOf(c) || "")) cost += 1.0;
      if (_chaserSeen.indexOf(pairKey(c.id, x.id)) >= 0) cost += 2.0;
      return { x: x, cost: cost + Math.random() * 0.3 };
    })
    .sort(function (a, b) {
      return a.cost - b.cost;
    });
  const shortlist = scored.slice(0, 5);
  const pick = shortlist[Math.floor(Math.random() * shortlist.length)].x;
  let theirDrink = null;
  if (tier === "A" || tier === "B") {
    const m = (pick.drinks || []).filter(function (od) {
      return tier === "A" ? normDrink(od.n) === normDrink(fresh.n) : chaserFam(od.n) === fam;
    });
    if (m.length) theirDrink = m[0].n;
  }
  _chaser = {
    cafe: c.id,
    opp: pick.id,
    tier: tier,
    fam: fam,
    myDrink: fresh ? fresh.n : null,
    theirDrink: theirDrink,
    flip: Math.random() < 0.5,
    ts: Date.now(),
    res: null,
    board: false,
  };
}
function chaserBoard() {
  /* score each cafe once, then sort on the stored number: the comparator would otherwise ask
     for two scores per comparison, a hundred and fifty of them per row on a long board. */
  return cafes
    .filter(function (c) {
      return !c.wish && matchCount(c) > 0;
    })
    .map(function (c) {
      return { c: c, s: eloScoreNum(c) };
    })
    .sort(function (a, b) {
      return b.s - a.s;
    })
    .map(function (x) {
      return x.c;
    });
}
/* Position, everywhere. chaserRank walks the whole board per cafe, which is fine for one
   detail page and quadratic across 113 cards, so the list builds the whole map in one sorted
   pass. Competition ranking, the same as chaserRank: a tie group shares the first position,
   so "#1" can be two cafes and the next is "#3". A cafe that has never been compared is NOT
   in here — sixteen of them share the untouched 5.0, and numbering that is a lie. */
function rankMap() {
  const board = chaserBoard(),
    m = { _n: board.length };
  let pos = 0,
    prev = null;
  board.forEach(function (c, i) {
    const s = eloScoreNum(c);
    if (prev === null || s < prev) {
      pos = i + 1;
      prev = s;
    }
    m[c.id] = pos;
  });
  return m;
}
function rankOf(c, m) {
  if (!c) return null;
  return (m || rankMap())[c.id] || null;
}
/* A badge on the tile, where the stars used to be — the tile colour already carries the
   bucket, so repeating it there said nothing twice. */
function rankBadge(c, m) {
  const r = rankOf(c, m);
  return r ? '<span class="rankbadge' + (r <= 3 ? " r-gold" : r <= 10 ? " r-amber" : "") + '">#' + r + "</span>" : "";
}
function chaserRank(c, board) {
  let n = 1;
  const s = eloScoreNum(c);
  board.forEach(function (x) {
    if (x.id !== c.id && eloScoreNum(x) > s) n++;
  });
  return n;
}
/* Both cafes are re-resolved by id from the live array, so the Firebase echo that repaints a
   few hundred ms after every save can never orphan the vote. */
function chaserApply(winId, loseId, draw) {
  const a = cafes.find(function (x) {
      return x.id === winId;
    }),
    b = cafes.find(function (x) {
      return x.id === loseId;
    });
  if (!a || !b) {
    _chaser = null;
    return null;
  }
  const pre = chaserBoard();
  const preA = matchCount(a) ? chaserRank(a, pre) : null,
    preB = matchCount(b) ? chaserRank(b, pre) : null;
  const Ra = eloFor(a),
    Rb = eloFor(b);
  const Ea = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
  const placing = isProvisional(a) !== isProvisional(b) ? (isProvisional(a) ? a : b) : null;
  const refs = placing ? placementRefs(placing) : [];
  if (placing && refs.length >= 3) {
    /* One of them is still being placed: it searches, the established one barely moves. The search is
       anchored on the cafe it actually met, so it stays right whichever way the pair was found. */
    const q = placing === a ? b : a,
      won = !draw && placing === a;
    const qi = refs.findIndex(function (x) {
      return x.id === q.id;
    });
    const base = qi >= 0 ? qi : placementPos(eloFor(placing), refs);
    const step = placementStep(matchCount(placing), refs.length);
    const pos = draw ? base : won ? base - step : base + step;
    const Sp = draw ? 0.5 : won ? 1 : 0,
      Ep = placing === a ? Ea : 1 - Ea;
    const qOld = eloFor(q);
    placing.elo = placementElo(refs, pos);
    q.elo = qOld + Math.round(kFor(q) * (Ep - Sp));
  } else {
    /* both established, or both new: ordinary Elo, each side at its own K */
    const Ka = kFor(a),
      Kb = kFor(b);
    a.elo = Ra + (draw ? Math.round(Ka * (0.5 - Ea)) : Math.max(1, Math.round(Ka * (1 - Ea))));
    b.elo = Rb - (draw ? Math.round(Kb * (0.5 - Ea)) : Math.max(1, Math.round(Kb * (1 - Ea))));
  }
  a.matches = matchCount(a) + 1;
  b.matches = matchCount(b) + 1;
  saveCafe(a.id);
  saveCafe(b.id); /* a comparison moves exactly these two */
  const post = chaserBoard();
  return {
    a: a,
    b: b,
    draw: !!draw,
    preA: preA,
    preB: preB,
    postA: chaserRank(a, post),
    postB: chaserRank(b, post),
    postN: post.length,
  };
}
function chaserSeen(l, r) {
  _chaserSeen.push(pairKey(l, r));
  while (_chaserSeen.length > 40) _chaserSeen.shift();
}
function chaserPick(side) {
  if (!_chaser || _chaser.res) return;
  const L = _chaser.flip ? _chaser.opp : _chaser.cafe,
    R = _chaser.flip ? _chaser.cafe : _chaser.opp;
  chaserSeen(L, R);
  _chaser.res = chaserApply(side === 0 ? L : R, side === 0 ? R : L, false);
  chaserRepaint();
}
function chaserEven() {
  if (!_chaser || _chaser.res) return;
  const L = _chaser.flip ? _chaser.opp : _chaser.cafe,
    R = _chaser.flip ? _chaser.cafe : _chaser.opp;
  chaserSeen(L, R);
  _chaser.res = chaserApply(L, R, true);
  chaserRepaint();
}
/* One more pair without leaving the sheet — only offered from the board, where ranking is
   the task; after a save one question is the whole contract. */
function chaserAgain() {
  if (!_chaser) return;
  const from = _chaser.cafe;
  boardRank();
  if (_chaser && _chaser.cafe === from && _chaser.opp) return;
}
function chaserDismiss() {
  const wasBoard = !!(_chaser && _chaser.board);
  _chaser = null;
  const host = $("d-chaser");
  if (host) host.innerHTML = "";
  if (wasBoard) {
    try {
      renderBoard();
    } catch (e) {
      warn("rank.js", e);
    }
    return;
  }
  const c = cafes.find(function (x) {
    return x.id === curId;
  });
  if (c) renderChaser(c);
  try {
    renderList();
  } catch (e) {
    warn("rank.js", e);
  }
}
function chaserRepaint() {
  if (_chaser && _chaser.board) {
    chaserPaint();
    try {
      renderBoard();
    } catch (e) {
      warn("rank.js", e);
    }
    return;
  }
  const c = cafes.find(function (x) {
    return x.id === curId;
  });
  if (c) renderChaser(c);
  try {
    renderList();
  } catch (e) {
    warn("rank.js", e);
  }
}
function chaserOpt(c, drink, side) {
  const gp = typeof gphotoFor === "function" ? gphotoFor(c) : null;
  const th =
    gp && !_imgFail[c.id]
      ? '<span class="ch-th" style="background-image:url(\'' + safeUrl(gp) + "')\"></span>"
      : '<span class="ch-th" style="' + nophotoStyle(c) + '">' + esc(initials(c)) + "</span>";
  const sub = [drink ? esc(drink) : "", chaserWhen(chaserLast(c))].filter(Boolean).join(" · ");
  return (
    '<button class="ch-opt" onclick="chaserPick(' +
    side +
    ')">' +
    th +
    '<span class="ch-m"><span class="ch-n">' +
    esc(c.name) +
    '</span><span class="ch-s">' +
    sub +
    "</span></span></button>"
  );
}
/* Bottom sheet. The scrim dismisses, matching every other sheet the app has had. */
function chaserShell(inner) {
  return (
    '<div class="ch-scrim" onclick="chaserDismiss()"></div><div class="ch-sheet" role="dialog" aria-modal="true" aria-label="Quick ranking"><div class="ch-grab"></div>' +
    inner +
    "</div>"
  );
}
function chaserOpen() {
  const h = $("d-chaser");
  return !!(h && h.innerHTML);
}
/* Called from openDetail so the Firebase echo repaints the sheet instead of wiping it. The
   id + isAdmin + 3-minute guard covers every other openDetail caller: map pins, list cards,
   stats rows, board rows and the ?cafe= deep link. */
function renderChaser(c) {
  const host = $("d-chaser");
  if (!host) return;
  if (_chaser && _chaser.board) return;
  if (!_chaser || _chaser.cafe !== c.id || !isAdmin || Date.now() - _chaser.ts > 180000) {
    host.innerHTML = "";
    return;
  }
  chaserPaint();
}
function chaserPaint() {
  const host = $("d-chaser");
  if (!host) return;
  if (!_chaser) {
    host.innerHTML = "";
    return;
  }
  const c = cafes.find(function (x) {
    return x.id === _chaser.cafe;
  });
  const opp = cafes.find(function (x) {
    return x.id === _chaser.opp;
  });
  if (!c || !opp) {
    host.innerHTML = "";
    return;
  }
  const r = _chaser.res;
  if (r) {
    const line = function (x, pre, post, n) {
      const nm = esc(x.name);
      if (pre === null) return nm + ' <b class="up">enters at #' + post + " of " + n + "</b>";
      if (post < pre) return nm + ' <b class="up">#' + pre + " → #" + post + "</b>";
      if (post > pre) return nm + ' <b class="dn">#' + pre + " → #" + post + "</b>";
      return nm + " <b>stays #" + post + "</b>";
    };
    host.innerHTML = chaserShell(
      '<div class="ch-rl">' +
        (r.draw ? "🤝 Called it even" : "👍 " + esc(r.a.name)) +
        "</div>" +
        '<div class="ch-mv"><span>' +
        line(r.a, r.preA, r.postA, r.postN) +
        "</span><span>" +
        line(r.b, r.preB, r.postB, r.postN) +
        "</span></div>" +
        '<div class="ch-done">' +
        (_chaser.board
          ? '<button class="ch-lnk" onclick="chaserAgain()">↻ Rank another</button>'
          : '<button class="ch-lnk" onclick="chaserDismiss();openRank()">See where to go ›</button>') +
        '<button class="ch-close" onclick="chaserDismiss()">Done</button></div>'
    );
    return;
  }
  const eyebrow =
    _chaser.tier === "A"
      ? "Both do " + esc(_chaser.myDrink)
      : _chaser.tier === "B"
        ? "Both do " + esc(_chaser.fam)
        : "";
  const lv = chaserLast(opp);
  const stale = !!lv && (Date.now() - new Date(lv).getTime()) / 86400000 > 120;
  const L = _chaser.flip ? opp : c,
    R = _chaser.flip ? c : opp;
  const LD = _chaser.flip ? _chaser.theirDrink : _chaser.myDrink,
    RD = _chaser.flip ? _chaser.myDrink : _chaser.theirDrink;
  host.innerHTML = chaserShell(
    '<div class="ch-hd"><span class="ch-qwrap">' +
      (eyebrow ? '<span class="ch-why">' + eyebrow + "</span>" : "") +
      '<span class="ch-q">Which would you go back to?</span></span>' +
      '<button class="ch-x" onclick="chaserDismiss()" aria-label="Not now">✕</button></div>' +
      '<div class="ch-pair">' +
      chaserOpt(L, LD, 0) +
      chaserOpt(R, RD, 1) +
      "</div>" +
      '<button class="ch-even" onclick="chaserEven()">' +
      (stale ? "Too long ago to say" : "Too close to call") +
      "</button>"
  );
}
