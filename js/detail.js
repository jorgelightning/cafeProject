"use strict";
/* detail.js — Cafe detail page.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- detail ---------- */
function photoLabel(c) {
  if (c && c.photo) return ico("camera") + " My drink";
  const u = gphotoFor(c);
  if (u) return ico("camera") + " Google Maps";
  return "";
}
function setHeroTag(c) {
  const t = $("d-tagphoto");
  if (!t) return;
  const l = photoLabel(c);
  if (l) {
    t.innerHTML = l; /* photoLabel() is a fixed label and an icon, never user text */
    t.style.display = "";
  } else {
    t.style.display = "none";
  }
}
function fmtPrice(p) {
  p = (p == null ? "" : String(p)).trim();
  if (!p) return "";
  const m = p.replace(/[^0-9.]/g, "");
  if (m && !isNaN(parseFloat(m))) return "$" + parseFloat(m).toFixed(2);
  return p;
}
/* Local amount leads, dollars follow. Standing in Taipei, NT$65 is the number you recognise
   and $2.06 is the comparison; Stats is the opposite case and stays dollars-only. A drink
   with no .pc is a plain dollar price and renders exactly as it always did. */
function priceHTML(d) {
  if (!d) return "";
  const usd = fmtPrice(d.p);
  const loc = d.pl && d.pc && String(d.pc).toUpperCase() !== "USD" ? fmtLocal(d.pl, d.pc) : "";
  if (!loc) return usd ? '<span class="pr">' + esc(usd) + "</span>" : "";
  const sub = usd ? esc(usd) : "needs rate";
  return (
    '<span class="prwrap"><span class="pr">' +
    esc(loc) +
    '</span><span class="prsub' +
    (usd ? "" : " needs") +
    '">' +
    sub +
    "</span></span>"
  );
}
function reorderVal(d) {
  if (!d) return "";
  const v = d.reorder;
  if (v === "yes" || v === true) return "yes";
  if (v === "no" || v === false) return "no";
  if (v === "neutral") return "neutral";
  return "";
}
function reorderTally(c) {
  let yes = 0,
    no = 0,
    neutral = 0;
  ((c && c.drinks) || []).forEach(function (d) {
    drinkOrders(d).forEach(function (o) {
      const v = reorderVal(o),
        q = orderQty(o);
      if (v === "yes") yes += q;
      else if (v === "no") no += q;
      else if (v === "neutral") neutral += q;
    });
  });
  return { yes: yes, no: no, neutral: neutral, total: yes + no + neutral };
}
/* Compact form for the detail line — the rail already carries the colour, so the chip
   only needs the glyph. The full-text badge is still used elsewhere. */
function reorderChip(d) {
  const v = reorderVal(d);
  if (!v) return "";
  const e = v === "yes" ? "👍" : v === "no" ? "👎" : "😐";
  return '<span class="reorder ' + v + '">' + e + "</span> ";
}
function setReorder(btn, v) {
  const wrap = btn.parentNode;
  const hid = wrap.querySelector(".dre");
  hid.value = hid.value === v ? "" : v;
  wrap.querySelectorAll(".rbtn").forEach(b => b.classList.remove("on"));
  if (hid.value) wrap.querySelector(".rbtn." + hid.value).classList.add("on");
}
/* The options of an order as pills — size, sweetness, ice, milk — in place of one grey line. */
function modPills(o) {
  if (!o) return "";
  const m = [
    o.size ? ["", o.size] : null,
    o.sweet ? ["k-sw", o.sweet + " sweet"] : null,
    o.ice ? ["k-ic", o.ice] : null,
    o.milk ? ["k-mk", "\ud83e\udd5b " + o.milk] : null,
  ].filter(Boolean);
  return m.length
    ? '<span class="dmods">' + m.map(x => '<span class="mpill ' + x[0] + '">' + esc(x[1]) + "</span>").join("") + "</span>"
    : "";
}
/* A drink's glyph follows the same rule as the cafe's mark (drinkKind), so a Flat White is a coffee cup on the cafe
   page as it is on its card. It used to have its own list, which disagreed on 15 of 126 drinks. */
const DRINK_GLYPH = { matcha: "🍵", tea: "🍵", boba: "🧋", coffee: "☕", gelato: "🍨", pastry: "🥐" };
function drinkGlyph(n) {
  return DRINK_GLYPH[drinkKind(n)] || "🥤";
}
function drinkHistoryPrice(d, latest) {
  const range = drinkPriceRange(d);
  if (range && Math.abs(range.max - range.min) >= 0.0001) {
    const lo = range.code === "USD" ? fmtPrice(range.min) : fmtLocal(range.min, range.code);
    const hi = range.code === "USD" ? fmtPrice(range.max) : fmtLocal(range.max, range.code);
    return '<span class="pr range">' + esc(lo + "–" + hi) + "</span>";
  }
  return priceHTML(latest);
}
function toggleDrinkHistory(btn) {
  const card = btn.closest(".drinkcard");
  if (!card) return;
  const open = card.classList.toggle("open");
  btn.setAttribute("aria-expanded", open ? "true" : "false");
  const chev = btn.querySelector(".drinkchev");
  if (chev) chev.textContent = open ? "▾" : "▸";
}
let _branchOpen = false; /* the branch list is open; survives the cloud repaint, closes on another cafe */
let _branchFor = null;
/* Monochrome marks: they take the colour of the text they sit in, so they follow both themes. */
const SVG_CHEV =
  '<svg class="car" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_CHECK =
  '<svg class="ck" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_PLUS =
  '<svg class="pl" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
function setBranchesOpen(open) {
  _branchOpen = open;
  const l = $("d-locs"),
    w = $("d-where"),
    sc = $("d-scrim");
  if (l) l.hidden = !open;
  if (sc) sc.hidden = !open;
  if (w) w.setAttribute("aria-expanded", open ? "true" : "false");
}
function toggleBranches() {
  setBranchesOpen(!_branchOpen);
  /* focus moves into the list so a keyboard or screen reader lands on the current branch */
  const _l = $("d-locs");
  const cur = _branchOpen && _l && (_l.querySelector(".br.on") || _l.querySelector(".br"));
  if (cur) /** @type {HTMLElement} */ (cur).focus({ preventScroll: true });
}
/* The list floats over the page (a bottom sheet on phones and iPad, a card under the bar on the
   laptop layout), so it has to be easy to put away: tap anywhere else, Done, or Escape. */
document.addEventListener("click", e => {
  const t = /** @type {Element|null} */ (e.target);
  if (_branchOpen && !(t && t.closest && t.closest(".dloc") && t.id !== "d-scrim")) setBranchesOpen(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && _branchOpen) {
    setBranchesOpen(false);
    const w = $("d-where");
    if (w && !w.hidden) w.focus();
  }
});
/* The ⋯ menu (Edit, Delete) is a <details>, which stays open until told otherwise. It used to survive
   tapping Edit and come back floating over the cafe page afterwards. It closes on any choice, on a tap
   anywhere else, on Escape, and whenever a cafe page is opened. */
function closeMoreMenu(refocus) {
  const m = $("d-more");
  if (!m || !m.open) return;
  m.open = false;
  const sm = m.querySelector("summary");
  if (refocus && sm) /** @type {HTMLElement} */ (sm).focus();
}
document.addEventListener("click", e => {
  const t = /** @type {Element|null} */ (e.target);
  if (!(t && t.closest && t.closest("#d-more"))) closeMoreMenu(false);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeMoreMenu(true);
});
function openDetail(id, from) {
  const c = cafes.find(x => x.id === id);
  if (!c) return;
  closeMoreMenu(false);
  if (from) lastMain = from;
  curId = id;

  /* ---- hero photo ---- */
  const hero = $("d-hero");
  if ($("d-hero-emoji")) $("d-hero-emoji").innerHTML = markArt(c, "hero-v");
  const gp0 = _imgFail[c.id] ? null : gphotoFor(c);
  if (gp0) {
    hero.className = "hero";
    hero.style.background = "";
    hero.style.backgroundImage = 'url("' + safeUrl(gp0) + '")';
    /* A stale Google photo URL still answers 200 with a placeholder, so this only catches
       the hard failures; isSessionPhotoUrl() keeps the rest out of storage. */
    const _hp = new Image();
    _hp.onerror = function () {
      _imgFail[c.id] = 1;
      if (c.gphoto) delete c.gphoto;
      if (gphotoCache[c.id] !== undefined) {
        delete gphotoCache[c.id];
        saveGphotoCache();
      }
      if (curId === c.id) {
        const h = $("d-hero");
        h.className = "hero nophoto";
        h.style.cssText += ";" + nophotoStyle(c);
      }
    };
    _hp.src = safeUrl(gp0);
  } else {
    hero.className = "hero nophoto";
    hero.style.cssText += ";" + nophotoStyle(c);
  }
  setHeroTag(c);
  if (!c.photo) {
    fetchPlacePhoto(c, function (url) {
      if (url && curId === c.id) {
        const h = $("d-hero");
        h.className = "hero";
        h.style.background = "";
        h.style.backgroundImage = 'url("' + safeUrl(url) + '")';
      }
      if (curId === c.id) setHeroTag(c);
      applyCardPhoto(c.id, url);
    });
  }

  /* ---- header ---- */
  /* The header used to be one middot run-on — area, rank, score and compare count over three
     wrapping lines, with #1 buried mid-sentence. Each fact has its own element now: the
     position is the block you see first and cannot wrap, the judgement and the place share a
     line (a long area truncates instead of pushing), and the score drops to a caption — it is
     bookkeeping, and 104 of 113 cafes share theirs with another. */
  /* A branch is named twice when the title carries its place — "HEYTEA (Cupertino)" over a Cupertino
     chip. When the cafe is one of a brand's branches and the name ends in a real place suffix, the
     title is the brand and the place sits in the line under it. The full name stays on hover. */
  const _sibs = getBrandSiblings(c, undefined, 0);
  const _base = brandBaseName(c.name);
  const _brandTitle = (_sibs.length || (c.brand || "").trim()) && _base && _base !== c.name ? _base : "";
  $("d-name").textContent = _brandTitle || c.name;
  $("d-name").title = _brandTitle ? c.name : "";
  $("d-stars").innerHTML = bucketPill(c, "big");
  const _rk = typeof rankOf === "function" ? rankOf(c) : null,
    _rn = typeof rankMap === "function" ? rankMap()._n : 0;
  const _rkEl = $("d-rank");
  if (_rkEl) {
    _rkEl.hidden = !_rk;
    _rkEl.className = "dranktile" + (_rk && _rk <= 10 ? " top" : "");
    _rkEl.innerHTML = _rk ? "<b>#" + _rk + "</b><span>of " + _rn + "</span>" : "";
  }
  /* A branch cafe gets a full-width bar under the header that says which branch this is and opens
     the list, so the place leaves the rating row: rating and branch no longer compete for one line
     and a long place never has to be cut to fit beside the rating. A cafe on its own keeps the plain
     area line. */
  const _addBr = isAdmin && (_sibs.length > 0 || !!(c.brand || "").trim());
  const _hasBar = _sibs.length > 0 || _addBr;
  const _place = areaOf(c) || (_brandTitle ? branchSuffix(c) : "");
  $("d-meta").textContent = _place;
  $("d-meta").hidden = _hasBar;
  const _scEl = $("d-score");
  if (_scEl) {
    const bits = [];
    if (c.matches) bits.push(eloScore(c) + " from " + c.matches + (c.matches === 1 ? " comparison" : " comparisons"));
    if (isAdmin && c.updated) bits.push("edited " + fmtEdited(c.updated));
    _scEl.textContent = bits.join(" · ");
    _scEl.hidden = !bits.length;
  }
  /* What to order is the question you open a cafe to answer, so it sits under the name instead of
     being something to work out from the drink list below. */
  const _oa = $("d-orderagain");
  if (_oa) {
    const td = !c.wish && typeof topDrinkAt === "function" ? topDrinkAt(c) : null;
    if (td) {
      const last = (latestDrinkOrder(td.d) || {}).date;
      const price = typeof cardPrice === "function" ? cardPrice(td.d) : "";
      /* The answer to "what do I get here", as the first thing under the name: the drink, what it
         costs, how often, and when last. The owner can log it again from the same place. */
      _oa.innerHTML =
        '<span class="oa-gl" aria-hidden="true">' +
        drinkGlyph(td.d.n) +
        '</span><span class="oa-tx"><small>What to order</small><strong class="oa-name">' +
        esc(td.d.n) +
        '</strong><span class="oa-meta">' +
        (price ? "<b>" + price + "</b> \u00b7 " : "") +
        td.n +
        "\u00d7 ordered" +
        (last ? " \u00b7 last " + esc(fmtDate(last)) : "") +
        "</span></span>";
      _oa.hidden = false;
    } else {
      _oa.hidden = true;
      _oa.textContent = "";
    }
  }
  try {
    renderChaser(c);
  } catch (e) {
    warn("detail.js renderChaser", e);
  }
  $("d-fav").setAttribute("aria-pressed", String(!!c.fav));
  if ($("d-wish")) {
    $("d-wish").setAttribute("aria-pressed", String(!!c.wish));
    $("d-wish").setAttribute("aria-pressed", String(!!c.wish));
  }
  $("d-tags").innerHTML = (c.tags || []).map(t => '<span class="chip">' + esc(t) + "</span>").join("");

  /* ---- the branches of this brand: a quiet control after the place opens a list over the page.
     Drawn inside openDetail so the cloud repaint redraws it; ids only, never object references. ---- */
  if (_branchFor !== c.id) {
    _branchFor = c.id;
    _branchOpen = false;
  }
  const _le = $("d-locs"),
    _wh = $("d-where"),
    _sc = $("d-scrim");
  if (_hasBar) {
    const _cur = _sibs.find(x => x.current);
    const _bar = (_cur && _cur.label) || _place || _brandTitle || c.name;
    const _label = _sibs.length ? _sibs.length + " branches" : "\uFF0B Branch";
    _wh.hidden = false;
    _wh.innerHTML = '<span class="wname">' + esc(_bar) + '</span><span class="wcount">' + _label + "</span>" + SVG_CHEV;
    _wh.setAttribute("aria-expanded", _branchOpen ? "true" : "false");
    _wh.setAttribute(
      "aria-label",
      _sibs.length ? "Branch " + _bar + ", " + _sibs.length + " branches. Opens the list of branches" : "Add a branch"
    );
    _le.hidden = !_branchOpen;
    _sc.hidden = !_branchOpen;
    const _rows = _sibs.length
      ? _sibs
      : [{ id: c.id, label: areaOf(c) || c.name, wish: !!c.wish, current: true, full: c.name }];
    /* the sheet's own header (phones and iPad); the laptop layout hides it */
    const _head =
      '<div class="brhead"><div class="grab" aria-hidden="true"></div><div class="brhead-r"><div><b>' +
      esc(_brandTitle || c.name) +
      "</b><span>" +
      (_sibs.length ? _sibs.length + " branches \u00B7 pick one to switch" : "Add another branch") +
      '</span></div><button type="button" class="brdone" onclick="setBranchesOpen(false);$(\'d-where\').focus()">Done</button></div></div>';
    _le.innerHTML =
      _head +
      _rows
        .map(x => {
          const src = cafes.find(y => y.id === x.id) || {},
            k = bucketOf(src);
          return (
            '<button type="button" class="br' +
            (x.current ? " on" : "") +
            '"' +
            (x.current ? ' aria-current="true"' : "") +
            ' title="' +
            esc(x.full) +
            '" onclick="openDetail(\'' +
            esc(x.id) +
            "','" +
            esc(lastMain || "list") +
            "')\">" +
            (x.wish
              ? '<span class="brtag" aria-hidden="true">\u{1F516}</span>'
              : '<i class="brdot" aria-hidden="true" style="background:' + BUCKET_HEX[k || ""] + '"></i>') +
            '<span class="t">' +
            esc(x.label) +
            "</span><small>" +
            (x.wish ? "to try" : esc(bucketLabel(src) || "")) +
            "</small>" +
            (x.current ? SVG_CHECK : "") +
            "</button>"
          );
        })
        .join("") +
      (_addBr
        ? '<button type="button" class="br add admin-only" onclick="addBranch(\'' +
          esc(c.id) +
          "')\">" +
          SVG_PLUS +
          '<span class="t">Add a branch</span></button>'
        : "");
  } else {
    _wh.hidden = true;
    _le.hidden = true;
    _sc.hidden = true;
    _le.innerHTML = "";
  }

  const _lastDate = d => (latestDrinkOrder(d) || {}).date || "";
  const _dsorted = (c.drinks || []).slice().sort((a, b) => _lastDate(b).localeCompare(_lastDate(a)));
  /* One compact card per drink, and all of them start closed. The newest used to open itself,
   which meant the one cafe with a long history pushed the note and the tags off the screen on
   arrival. The summary line — name, how many, latest, price — is the part worth reading at a
   glance; the order timeline is what you go looking for. */
  $("d-drinks").innerHTML = _dsorted.length
    ? _dsorted
        .map(function (d, di) {
          const orders = drinkOrders(d)
            .slice()
            .sort(function (a, b) {
              return (b.date || "").localeCompare(a.date || "");
            });
          const latest = orders[0] || latestDrinkOrder(d) || {};
          const cnt = orders.reduce(function (t, o) {
            return t + orderQty(o);
          }, 0);
          const v = reorderVal(latest),
            open = false,
            hid = "drink-history-" + di;
          const last = latest.date ? fmtDate(latest.date) : "Undated";
          const rows = orders
            .map(function (o, oi) {
              const ov = reorderVal(o),
                qty = orderQty(o);
              const opts = [o.size, o.sweet ? o.sweet + " sweet" : "", o.ice, o.milk ? "🥛 " + o.milk : ""].filter(
                Boolean
              );
              return (
                '<div class="dorder' +
                (ov ? " v-" + ov : "") +
                '">' +
                '<div class="dorderdate">' +
                esc(o.date ? fmtDate(o.date) : "Undated") +
                (oi === 0 ? " <span>· Latest</span>" : "") +
                (qty > 1 ? " <b>×" + qty + "</b>" : "") +
                "</div>" +
                '<div class="dorderprice">' +
                priceHTML(o) +
                "</div>" +
                (ov || opts.length
                  ? '<div class="dordermeta">' +
                    reorderChip(o) +
                    opts.map(x => '<span class="mpill">' + esc(x) + "</span>").join("") +
                    "</div>"
                  : "") +
                "</div>"
              );
            })
            .join("");
          return (
            '<div class="drinkcard' +
            (open ? " open" : "") +
            (v ? " v-" + v : "") +
            '">' +
            '<button type="button" class="drinksum" aria-expanded="' +
            (open ? "true" : "false") +
            '" aria-controls="' +
            hid +
            '" onclick="toggleDrinkHistory(this)">' +
            '<span class="drinkicon" aria-hidden="true">' +
            drinkGlyph(d.n) +
            "</span>" +
            '<span class="drinkcopy"><span class="dtop">' +
            esc(d.n) +
            (drinkMatches(d) ? ' <span class="dscore">' + drinkScore(d) + "</span>" : "") +
            "</span>" +
            '<span class="dsub">' +
            cnt +
            " ordered · latest " +
            esc(last) +
            "</span>" +
            modPills(latest) +
            "</span>" +
            '<span class="drinkprice">' +
            drinkHistoryPrice(d, latest) +
            "</span>" +
            '<span class="drinkchev" aria-hidden="true">' +
            (open ? "▾" : "▸") +
            "</span>" +
            "</button>" +
            '<div class="drinkhistory" id="' +
            hid +
            '">' +
            rows +
            "</div>" +
            "</div>"
          );
        })
        .join("")
    : '<div class="row" style="color:var(--faint);font-style:italic">' +
      (isAdmin ? "Tap \uFF0B Log a drink here below." : "No drinks logged yet.") +
      "</div>";

  /* the first three drinks, then "Show N more": a cafe with five drinks pushed the note off the screen */
  const _cards = $("d-drinks").querySelectorAll(".drinkcard");
  if (_cards.length > 3) {
    const box = document.createElement("div");
    box.className = "foldbox";
    _cards[2].after(box);
    for (let i = 3; i < _cards.length; i++) box.appendChild(_cards[i]);
    const more = document.createElement("button");
    more.type = "button";
    more.className = "morebtn";
    more.dataset.lab = "Show " + (_cards.length - 3) + " more";
    more.textContent = more.dataset.lab + " \u25be";
    more.onclick = function () {
      statFold(more);
    };
    box.after(more);
  }
  const _dir = $("d-dir");
  if (_dir) _dir.style.display = c.custom && c.lat == null ? "none" : "";
  $("d-review").textContent = c.review || (isAdmin ? "Tap \u270E Edit to add your thoughts\u2026" : "No notes yet.");
  show("detail");
  if (c.lat != null && gmap)
    setTimeout(function () {
      mapResize();
      gmap.setCenter({ lat: c.lat, lng: c.lng });
      gmap.setZoom(15);
    }, 80);
}
function toggleFav() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  c.fav = !c.fav;
  saveCafe(c.id);
  $("d-fav").setAttribute("aria-pressed", String(!!c.fav));
  renderMarkers();
  toast(c.fav ? "Added to favorites" : "Removed from favorites");
}
function toggleWish() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  c.wish = !c.wish;
  saveCafe(c.id);
  $("d-wish").setAttribute("aria-pressed", String(!!c.wish));
  renderMarkers();
  toast(c.wish ? "Added to wishlist 🔖" : "Removed from wishlist");
}
function deleteCurrent() {
  closeMoreMenu(false);
  if (!confirm("Delete this cafe?")) return;
  const _gone = curId;
  cafes = cafes.filter(x => x.id !== curId);
  removeCafe(_gone);
  renderMarkers();
  toast("Deleted");
  goBack();
}
function cafeShareUrl(id) {
  const base = location.origin + location.pathname;
  return base + "?cafe=" + encodeURIComponent(id);
}
/* Deliberately c.area and not areaOf(c): sharing sends this to someone else, so it must carry
   the public value even when the owner is the one tapping share. */
function shareCafe() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  const url = cafeShareUrl(c.id);
  const title = c.name + (c.area ? " (" + c.area + ")" : "");
  const _b = bucketLabel(c);
  const text = "Check out " + c.name + (c.area ? " in " + c.area : "") + (_b ? " \u2014 " + _b.toLowerCase() : "");
  if (navigator.share) {
    navigator.share({ title: title, text: text, url: url }).catch(e => {
      if (e && e.name !== "AbortError") {
        navigator.clipboard && navigator.clipboard.writeText(url);
        toast("Link copied!");
      }
    });
  } else {
    navigator.clipboard && navigator.clipboard.writeText(url);
    toast("Link copied! Share it to open this cafe on the map.");
  }
}
/* One builder for the cafe page and the map card, so the two can never send you to different places. */
function directionsUrl(c) {
  const _la = latOf(c),
    _ln = lngOf(c);
  const dest =
    _la != null && _ln != null ? _la + "," + _ln : encodeURIComponent(c.name + (areaOf(c) ? " " + areaOf(c) : ""));
  return "https://www.google.com/maps/dir/?api=1&destination=" + dest;
}
function goDirections(c) {
  const url = directionsUrl(c);
  if (window.innerWidth >= 900) {
    window.open(url, "_blank");
  } else {
    window.location.href = url;
  }
}
function navigateTo() {
  const c = cafes.find(x => x.id === curId);
  if (c) goDirections(c);
}
/** A new branch of c's brand: brand, name and country come along; place, photo and notes do not. @param {string} id */
function addBranch(id) {
  if (isAdmin) openForm({ branchOf: id });
}
function editCurrent() {
  closeMoreMenu(false);
  openForm(curId);
}

/* ---------- share spot: a postcard ----------
   A link says nothing until it is opened. The postcard is the thing worth sending: rank, name,
   what to get there, and the owner's own line, drawn to a canvas so it goes out as a picture.
   It is deliberately not the Google photo — that cannot be drawn to an exportable canvas, and
   it is not ours to redistribute — so the picture is the tile: the rating colour and the emoji.
   Like shareCafe() it uses c.area and never areaOf(c): this goes to someone else, and a private
   spot's exact place must not travel with it. */
let _pcOpener = null;
/* The picture on a postcard is drawn, not typed. The default cafe emoji is a coffee cup (101 of 122 records), so
   a hojicha bar went out with a coffee cup, and an emoji is drawn by each phone's own font anyway. The mark is a
   vessel in cream line art on a fade in the drink's own colour; "Loved it" lives in the pill and the medal. */
const CARD_KINDS = {
  matcha: { c1: "#4f8a3c", c2: "#17321f", vessel: "bowl" },
  coffee: { c1: "#a8733a", c2: "#2a1a0c", vessel: "cup" },
  boba: { c1: "#c98a72", c2: "#46261f", vessel: "boba" },
  gelato: { c1: "#d98aa6", c2: "#4a2535", vessel: "gelato" },
  pastry: { c1: "#d9a24f", c2: "#4a2f10", vessel: "pastry" },
  tea: { c1: "#5f9c8a", c2: "#1d3b36", vessel: "teacup" },
};
/* the chosen emoji is a deliberate answer to "what is this place"; ☕ is the default and so is not one */
const EMOJI_KIND = { "\ud83c\udf75": "matcha", "\ud83e\uddcb": "boba", "\ud83c\udf68": "gelato", "\ud83e\udd50": "pastry" };
/* Shapes are on a 120-unit square. `main` is the vessel, `faint` the steam, froth and pearls' highlights. */
const _ring = function (x, y, r) {
  return "M" + (x - r) + " " + y + "a" + r + " " + r + " 0 1 0 " + 2 * r + " 0a" + r + " " + r + " 0 1 0 " + -2 * r + " 0";
};
const CARD_VESSELS = {
  bowl: {
    main: ["M18 52h84c0 26-17 42-42 42S18 78 18 52z", "M44 99h32"],
    faint: ["M26 52c4-7 14-11 34-11s30 4 34 11", "M48 33c-4-5 4-8 0-13M62 33c-4-5 4-8 0-13M76 33c-4-5 4-8 0-13", "M34 68c9 6 17 8 26 8"],
  },
  cup: {
    main: ["M26 48h58v26c0 14-11 24-29 24S26 88 26 74z", "M84 56h8c9 0 9 18 0 18h-8"],
    faint: ["M16 104h78", "M42 36c-4-5 4-8 0-13M56 36c-4-5 4-8 0-13M70 36c-4-5 4-8 0-13", "M38 62c6 4 14 5 22 3"],
  },
  boba: {
    main: [
      "M32 36h56l-6 66H38z",
      "M28 36h64",
      "M34 26c0-6 52-6 52 0v10H34z",
      "M66 24l10-18",
      _ring(48, 92, 4.6),
      _ring(62, 94, 4.6),
      _ring(76, 91, 4.6),
      _ring(55, 83, 4.6),
      _ring(69, 82, 4.6),
    ],
    faint: ["M38 58h44"],
  },
  gelato: {
    main: ["M34 62h52L60 108z", "M30 62c-6-14 4-26 16-24 2-10 24-12 28-1 12-3 20 10 10 25"],
    faint: ["M42 74l12 14M54 66l14 30M66 66l8 14", "M52 40c4 3 10 3 14 0"],
  },
  teacup: {
    main: ["M28 54h64c0 24-13 38-32 38S28 78 28 54z", "M18 100h84"],
    faint: ["M36 54c6-6 42-6 48 0", "M46 40c-4-5 4-8 0-13M60 40c-4-5 4-8 0-13M74 40c-4-5 4-8 0-13"],
  },
  pastry: {
    main: ["M14 74c0-22 20-38 46-38s46 16 46 38c0 6-6 10-12 8-6 8-16 10-34 10s-28-2-34-10c-6 2-12-2-12-8z"],
    faint: ["M40 42c-4 14-4 30 2 42M60 36c-3 16-3 36 0 54M80 42c4 14 4 30-2 42"],
  },
};
/** One drink name, as a kind, or null when it says nothing. Matcha words win over boba words on purpose: a hojicha
 *  latte with salted cheese foam is a hojicha latte, the foam is a topping. */
function drinkKind(n) {
  const t = String(n || "").toLowerCase();
  if (/matt?cha|hojicha|genmaicha|sencha|chai/.test(t)) return "matcha";
  if (/boba|bubble|milk tea|cheese foam|brown sugar|taro|pearl|jelly|oolong|fruit tea/.test(t)) return "boba";
  /* a "black tea latte" is tea, whatever the word latte says */
  if (/\btea\b/.test(t)) return "tea";
  if (/latte|flat white|espresso|americano|cappuccino|cortado|macchiato|mocha|drip|coffee|cold brew/.test(t)) return "coffee";
  return null;
}
/** What a cafe serves, as one of the CARD_KINDS keys. In order of how much it says about the place:
 *  a chosen emoji; a name that is plainly a boba chain; the drink you order most there (so Kissaten HiFi is a cup,
 *  you go for the flat white, and Zen Gelato is a bowl, you go for the matcha latte); a gelato or bakery name; then
 *  a vote across its other drinks weighted by how often you ordered each, and the cafe's own tags. @param {Cafe} c */
function cafeKind(c) {
  if (c.emoji && EMOJI_KIND[c.emoji]) return EMOJI_KIND[c.emoji];
  const who = [c.name, c.brand].join(" ").toLowerCase();
  if (/boba|bubble tea|milk tea|heytea|chagee|tiger sugar|gong cha|milksha|comebuy|teapioca|tapioca/.test(who)) return "boba";
  const top = typeof topDrinkAt === "function" ? topDrinkAt(c) : null;
  const best = top ? drinkKind(top.d.n) : null;
  if (best) return best;
  if (/gelato|ice cream|soft serve/.test(who)) return "gelato";
  if (/bakery|pastry|croissant|patisserie|boulangerie/.test(who)) return "pastry";
  const votes = {};
  (c.drinks || []).forEach(function (d) {
    const k = drinkKind(d.n);
    if (k) votes[k] = (votes[k] || 0) + Math.max(1, drinkOrders(d).length);
  });
  (c.tags || []).forEach(function (t) {
    if (t === "matcha") votes.matcha = (votes.matcha || 0) + 1;
    if (t === "boba") votes.boba = (votes.boba || 0) + 1;
  });
  const win = Object.keys(votes).sort(function (x, y) {
    return votes[y] - votes[x];
  })[0];
  if (win) return win;
  if (/matcha|hojicha/.test(who) && !/coffee|espresso/.test(who)) return "matcha";
  if (/\btea\b/.test(who) && !/coffee|espresso/.test(who)) return "tea";
  return "coffee";
}
/* The cafe's mark, drawn: the same vessel as its share card, in cream line art, on its drink's colour. Tiles, the
   cafe page, the Go queue and the rank sheet all use it, so the app and what you share speak one language. An
   emoji you chose that names a kind (🍵 🧋 🍨 🥐) draws that kind; any other one you chose (🏠, say) is shown as
   itself, on the colour of what the place serves. */
function markKind(c) {
  return c && c.emoji && EMOJI_KIND[c.emoji] ? EMOJI_KIND[c.emoji] : cafeKind(c || {});
}
function markArt(c, cls) {
  const own = c && c.emoji && c.emoji !== "\u2615" && !EMOJI_KIND[c.emoji] ? c.emoji : "";
  if (own) return '<span class="mke">' + esc(own) + "</span>";
  const kind = markKind(c),
    k = CARD_KINDS[kind] || CARD_KINDS.coffee,
    v = CARD_VESSELS[k.vessel] || CARD_VESSELS.cup;
  return (
    '<svg class="mkv' + (cls ? " " + cls : "") + '" data-k="' + kind + '" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
    v.main.map(function (p) { return '<path d="' + p + '"/>'; }).join("") +
    v.faint.map(function (p) { return '<path class="f" d="' + p + '"/>'; }).join("") +
    "</svg>"
  );
}
function markBg(c) {
  const k = CARD_KINDS[markKind(c)] || CARD_KINDS.coffee;
  return "linear-gradient(135deg," + k.c1 + "," + k.c2 + ")";
}
/* The emoji a cafe shows everywhere that is not the postcard (tile, cafe page, pin, search, the Go queue): the
   one you chose, else the guess from what it serves. ☕ is the default, so it counts as "not chosen". */
const KIND_EMOJI = { matcha: "🍵", coffee: "☕", boba: "🧋", gelato: "🍨", pastry: "🥐", tea: "🍵" };
/** @param {Cafe|null|undefined} c */
function cafeMark(c) {
  if (!c) return "☕";
  if (c.emoji && c.emoji !== "☕") return c.emoji;
  /* A search runs this for every cafe on every keystroke, so remember the answer for as long as the fields the
     guess reads are unchanged (name, brand, tags, and each drink's name and how many orders it has). */
  const sig =
    [c.name, c.brand, (c.tags || []).join(",")].join("|") +
    "#" +
    (c.drinks || [])
      .map(function (d) {
        return d.n + ":" + (d.orders ? d.orders.length : 0) + ":" + (d.dates ? d.dates.length : 0);
      })
      .join(",");
  const hit = _markMemo.get(c);
  if (hit && hit.sig === sig) return hit.mark;
  const mark = KIND_EMOJI[cafeKind(c)] || "☕";
  _markMemo.set(c, { sig: sig, mark: mark });
  return mark;
}
const _markMemo = new WeakMap();
function postcardData(c) {
  const td = !c.wish && typeof topDrinkAt === "function" ? topDrinkAt(c) : null;
  const rk = !c.wish && typeof rankOf === "function" ? rankOf(c) : null;
  const rv = String(c.review || "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    name: c.name,
    area: c.area || "",
    rk: rk,
    rn: rk && typeof rankMap === "function" ? rankMap()._n : 0,
    label: c.wish ? "Want to try" : bucketLabel(c),
    color: c.wish ? WISH_HEX : BUCKET_HEX[bucketOf(c) || ""],
    drink: td ? td.d.n : "",
    price: td && typeof cardPrice === "function" ? cardPrice(td.d) : "",
    count: td ? td.n : 0,
    review: rv.length > 170 ? rv.slice(0, 167).replace(/\s+\S*$/, "") + "\u2026" : rv,
    emoji: c.emoji || "\u2615",
    tint: tintFor(c),
    kind: cafeKind(c),
  };
}
function postcardText(c) {
  const d = postcardData(c);
  return (
    d.name +
    (d.rk ? " \u2014 #" + d.rk + " of " + d.rn + " on my list" : d.label ? " \u2014 " + d.label.toLowerCase() : "") +
    (d.area ? "\n" + d.area : "") +
    (d.drink ? "\nWhat to get: " + d.drink + (d.price ? " (" + d.price + ")" : "") : "") +
    (d.review ? "\n\u201c" + d.review + "\u201d" : "") +
    "\n" +
    cafeShareUrl(c.id)
  );
}
function _pcWrap(ctx, text, maxW, maxLines) {
  const words = String(text).split(" "),
    lines = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const t = cur ? cur + " " + words[i] : words[i];
    if (ctx.measureText(t).width > maxW && cur) {
      lines.push(cur);
      cur = words[i];
    } else cur = t;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, "") + "\u2026";
  }
  return lines;
}
function _pcRound(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
/* Pieces every Story card is built from: soft rings, a vessel in cream line art, a wash of the drink's colour at the
   bottom, the footer, and a rank medal. The cafe postcard, the year and the top 5 all draw with these. */
function _pcRings(ctx, W, clipH, cx, cy) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, clipH);
  ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.18)";
  ctx.lineWidth = 3;
  for (let r = 73; r < 1300; r += 74) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
function _pcVessel(ctx, kind, cx, cy, size, color, alpha) {
  const ves = CARD_VESSELS[kind.vessel] || CARD_VESSELS.cup,
    sc = size / 120;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(sc, sc);
  ctx.lineWidth = 3.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ves.main.forEach(function (pd) {
    ctx.stroke(new Path2D(pd));
  });
  ctx.globalAlpha = alpha;
  ves.faint.forEach(function (pd) {
    ctx.stroke(new Path2D(pd));
  });
  ctx.restore();
}
function _pcWash(ctx, kind, W, H, safeB) {
  const rgb = [1, 3, 5].map(function (i) {
      return parseInt(kind.c1.slice(i, i + 2), 16);
    }),
    wash = ctx.createLinearGradient(0, safeB - 240, 0, H);
  wash.addColorStop(0, "rgba(" + rgb.join(",") + ",0)");
  wash.addColorStop(1, "rgba(" + rgb.join(",") + ",.30)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, safeB - 240, W, H - (safeB - 240));
}
function _pcFoot(ctx, W, PAD, safeB, SANS, onDark) {
  ctx.fillStyle = onDark ? "rgba(246,239,226,.14)" : "rgba(0,0,0,.12)";
  ctx.fillRect(PAD, safeB - 84, W - PAD * 2, 2);
  ctx.font = "800 28px " + SANS;
  ctx.fillStyle = onDark ? "rgba(246,239,226,.6)" : "#5a5a63";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("JL CAFE PROJECT", PAD, safeB - 30);
}
/** The rank medal: gold for the top three or ten; for the rest, dark glass on a light card or cream on a dark one
    (dark glass vanishes on espresso). Returns its width. */
function _pcMedal(ctx, x, y, n, h, gold, SANS, onDark) {
  const label = "#" + n;
  ctx.font = "800 " + Math.round(h * 0.62) + "px " + SANS;
  const w = ctx.measureText(label).width + h * 0.6;
  _pcRound(ctx, x, y, w, h, h / 2);
  if (gold) {
    const gg = ctx.createLinearGradient(x, y, x + w, y + h);
    gg.addColorStop(0, "#f6d77f");
    gg.addColorStop(1, "#dca13a");
    ctx.fillStyle = gg;
  } else ctx.fillStyle = onDark ? "#e9dfcf" : "rgba(20,13,8,.62)";
  ctx.fill();
  ctx.fillStyle = gold ? "#3b2606" : onDark ? "#2a1d12" : "#fff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(label, x + h * 0.3, y + h / 2 + 2);
  return w;
}
function drawPostcard(canvas, d) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width,
    H = canvas.height,
    PAD = 72,
    SANS = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';
  const paper = "#fbfaf8",
    ink = "#1d1a17",
    soft = "#5a5a63";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  /* A Story is 1080 x 1920, and Instagram lays its own bars over the top and bottom of it: the profile line
     across roughly the top 14% and the reply bar across the bottom 13%. The colour runs edge to edge; the rank,
     the words and the footer stay inside the band between SAFE_T and SAFE_B. */
  const SAFE_T = Math.round(H * 0.14),
    SAFE_B = H - Math.round(H * 0.13);
  /* the tile: a fade in the drink's colour, soft rings, and the vessel in cream line art */
  const kind = CARD_KINDS[d.kind] || CARD_KINDS.coffee,
    top = Math.round(H * 0.448),
    g = ctx.createLinearGradient(0, 0, W, top);
  g.addColorStop(0, kind.c1);
  g.addColorStop(1, kind.c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, top);
  _pcRings(ctx, W, top, W / 2, top * 0.62);
  _pcVessel(ctx, kind, W / 2, top * 0.62, 480, "#f6efe2", 0.6);
  const fade = ctx.createLinearGradient(0, top - 240, 0, top);
  fade.addColorStop(0, "rgba(251,250,248,0)");
  fade.addColorStop(1, paper);
  ctx.fillStyle = fade;
  ctx.fillRect(0, top - 240, W, 240);
  /* rank medallion: gold for the top ten, dark glass for the rest */
  ctx.textAlign = "left";
  if (d.rk) {
    const label = "#" + d.rk,
      gold = d.rk <= 10;
    ctx.font = "800 72px " + SANS;
    const w = ctx.measureText(label).width + 72;
    _pcRound(ctx, PAD, SAFE_T, w, 112, 56);
    if (gold) {
      const gg = ctx.createLinearGradient(PAD, SAFE_T, PAD + w, SAFE_T + 112);
      gg.addColorStop(0, "#f6d77f");
      gg.addColorStop(1, "#dca13a");
      ctx.fillStyle = gg;
    } else ctx.fillStyle = "rgba(20,13,8,.62)";
    ctx.fill();
    ctx.fillStyle = gold ? "#3b2606" : "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, PAD + 36, SAFE_T + 58);
    /* the standing sits directly under the rank, not out at the far edge from it */
    ctx.font = "700 34px " + SANS;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "left";
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 8;
    ctx.fillText("of " + d.rn + " on my list", PAD + 8, SAFE_T + 112 + 44);
    ctx.shadowBlur = 0;
  }
  /* the words */
  let y = top + 30;
  ctx.fillStyle = ink;
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 88px " + SANS;
  const nameLines = _pcWrap(ctx, d.name, W - PAD * 2, 2);
  nameLines.forEach(function (ln) {
    y += 92;
    ctx.fillText(ln, PAD, y);
  });
  y += 36;
  ctx.font = "700 38px " + SANS;
  if (d.label) {
    const pw = ctx.measureText(d.label).width + 76;
    _pcRound(ctx, PAD, y, pw, 64, 32);
    ctx.fillStyle = "#ececee";
    ctx.fill();
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.arc(PAD + 32, y + 32, 11, 0, 7);
    ctx.fill();
    ctx.fillStyle = ink;
    ctx.fillText(d.label, PAD + 56, y + 45);
    ctx.font = "500 38px " + SANS;
    ctx.fillStyle = soft;
    ctx.fillText(_pcWrap(ctx, d.area, W - PAD * 2 - pw - 24, 1)[0] || "", PAD + pw + 24, y + 45);
  }
  y += 104;
  if (d.drink) {
    _pcRound(ctx, PAD, y, W - PAD * 2, 176, 28);
    ctx.fillStyle = "#f0ebe4";
    ctx.fill();
    ctx.fillStyle = soft;
    ctx.font = "800 26px " + SANS;
    ctx.fillText("WHAT TO GET", PAD + 36, y + 50);
    ctx.fillStyle = ink;
    ctx.font = "800 52px " + SANS;
    ctx.fillText(_pcWrap(ctx, d.drink, W - PAD * 2 - 72, 1)[0], PAD + 36, y + 106);
    ctx.fillStyle = soft;
    ctx.font = "600 32px " + SANS;
    ctx.fillText((d.price ? d.price + " \u00b7 " : "") + d.count + "\u00d7 ordered", PAD + 36, y + 148);
    y += 216;
  }
  if (d.review) {
    ctx.fillStyle = ink;
    ctx.font = "500 42px " + SANS;
    /* as many lines as fit above the footer rule, never fewer than two, never more than four */
    const room = Math.max(2, Math.min(4, Math.floor((SAFE_B - 120 - (y + 40)) / 58) + 1));
    _pcWrap(ctx, "\u201c" + d.review + "\u201d", W - PAD * 2, room).forEach(function (ln) {
      ctx.fillText(ln, PAD, y + 40);
      y += 58;
    });
  }
  /* the bottom of the card: a soft wash of the drink's colour, so it ends as deliberately as it begins */
  _pcWash(ctx, kind, W, H, SAFE_B);
  /* footer: just whose list it is */
  _pcFoot(ctx, W, PAD, SAFE_B, SANS);
}
/* The year, as a Story: your drink's vessel, the big number, three facts. `w` is wrappedYear()'s answer. */
function drawYearStory(canvas, w) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width,
    H = canvas.height,
    PAD = 72,
    SANS = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    paper = "#fbfaf8",
    ink = "#1d1a17",
    soft = "#5a5a63",
    SAFE_T = Math.round(H * 0.14),
    SAFE_B = H - Math.round(H * 0.13);
  const kindKey = (w.drink && drinkKind(w.drink.name)) || "coffee",
    kind = CARD_KINDS[kindKey] || CARD_KINDS.coffee,
    top = Math.round(H * 0.396);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, top);
  g.addColorStop(0, kind.c1);
  g.addColorStop(1, kind.c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, top);
  _pcRings(ctx, W, top, W / 2, 500);
  _pcVessel(ctx, kind, W / 2, 500, 480, "#f6efe2", 0.6);
  const fade = ctx.createLinearGradient(0, top - 240, 0, top);
  fade.addColorStop(0, "rgba(251,250,248,0)");
  fade.addColorStop(1, paper);
  ctx.fillStyle = fade;
  ctx.fillRect(0, top - 240, W, 240);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = "800 40px " + SANS;
  ctx.fillStyle = "#fff";
  ctx.shadowColor = "rgba(0,0,0,.45)";
  ctx.shadowBlur = 8;
  ctx.fillText("MY " + w.year + " IN CAF\u00c9S", PAD, SAFE_T + 30);
  ctx.shadowBlur = 0;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = ink;
  ctx.font = "800 230px " + SANS;
  ctx.fillText(String(w.visits), PAD, 1010);
  const nw = ctx.measureText(String(w.visits)).width;
  ctx.font = "800 64px " + SANS;
  ctx.fillStyle = soft;
  ctx.fillText(w.visits === 1 ? "visit" : "visits", PAD + nw + 24, 1010);
  ctx.font = "600 44px " + SANS;
  ctx.fillText("at " + w.cafes + (w.cafes === 1 ? " caf\u00e9" : " caf\u00e9s") + (w.fresh ? " \u00b7 " + w.fresh + " new to me" : ""), PAD, 1082);
  const rows = [];
  if (w.drink) rows.push(["MY DRINK", w.drink.name + "  \u00d7" + w.drink.n]);
  if (w.back) rows.push(["I WENT BACK TO", w.back.name + "  \u00b7  " + w.back.n + " visits"]);
  if (w.months >= 2) rows.push(["BUSIEST MONTH", WRAP_MONTHS[w.peak.i] + "  \u00b7  " + w.peak.n + " visits"]);
  let y = 1150;
  rows.forEach(function (r) {
    _pcRound(ctx, PAD, y, W - PAD * 2, 124, 28);
    ctx.fillStyle = "#f0ebe4";
    ctx.fill();
    ctx.fillStyle = soft;
    ctx.font = "800 24px " + SANS;
    ctx.fillText(r[0], PAD + 36, y + 46);
    ctx.fillStyle = ink;
    ctx.font = "800 46px " + SANS;
    ctx.fillText(_pcWrap(ctx, r[1], W - PAD * 2 - 72, 1)[0], PAD + 36, y + 98);
    y += 140;
  });
  _pcWash(ctx, kind, W, H, SAFE_B);
  _pcFoot(ctx, W, PAD, SAFE_B, SANS);
}
/* The top five, as a Story: a list where each row carries its own drawn mark. `items` are {n, name, area, drink,
   kind}; `total` is how many cafes are ranked. */
function drawTop5Story(canvas, items, total) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width,
    H = canvas.height,
    PAD = 72,
    SANS = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    cream = "#f6efe2",
    SAFE_T = Math.round(H * 0.14),
    SAFE_B = H - Math.round(H * 0.13);
  /* All espresso, edge to edge: no inset sheet (which left a dark frame round a white card) and no white. The list
     sits straight on the espresso in cream, like a menu board. */
  const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
  g.addColorStop(0, "#3a2a1c");
  g.addColorStop(1, "#140e09");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  /* The rings are drawn on their own layer and faded out with a mask, so they melt into the espresso behind the
     title instead of stopping at an edge. The mask eases in and out (smoothstep stops); a straight one leaves a
     visible line where it ends. */
  const RH = 760,
    rl = document.createElement("canvas");
  rl.width = W;
  rl.height = RH;
  const rc = rl.getContext("2d");
  if (rc) {
    _pcRings(rc, W, RH, W / 2, 330);
    const m = rc.createLinearGradient(0, 380, 0, 720);
    for (let t = 0; t <= 1.001; t += 0.125) m.addColorStop(Math.min(t, 1), "rgba(0,0,0," + (t * t * (3 - 2 * t)).toFixed(3) + ")");
    rc.globalCompositeOperation = "destination-out";
    rc.fillStyle = m;
    rc.fillRect(0, 380, W, RH - 380);
    ctx.drawImage(rl, 0, 0);
  }
  /* the bottom glows in the colour of the #1 cafe's drink */
  if (items.length) {
    const rgb = [1, 3, 5].map(function (i) {
        return parseInt((CARD_KINDS[items[0].kind] || CARD_KINDS.coffee).c1.slice(i, i + 2), 16);
      }),
      glow = ctx.createLinearGradient(0, SAFE_B - 360, 0, H);
    glow.addColorStop(0, "rgba(" + rgb.join(",") + ",0)");
    glow.addColorStop(1, "rgba(" + rgb.join(",") + ",.55)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, SAFE_B - 360, W, H - (SAFE_B - 360));
  }
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = cream;
  ctx.font = "800 44px " + SANS;
  ctx.fillText("MY TOP " + items.length, PAD, SAFE_T + 40);
  ctx.font = "800 120px " + SANS;
  ctx.fillText("Where to go", PAD, SAFE_T + 160);
  ctx.font = "600 42px " + SANS;
  ctx.fillStyle = "rgba(246,239,226,.8)";
  ctx.fillText("out of " + total + " caf\u00e9s I have ranked", PAD, SAFE_T + 224);
  const textW = W - 246 - PAD;
  let y = 590;
  items.forEach(function (it, i) {
    const k = CARD_KINDS[it.kind] || CARD_KINDS.coffee,
      disc = 132,
      dx = PAD,
      dy = y + 14,
      gg = ctx.createLinearGradient(dx, dy, dx + disc, dy + disc);
    gg.addColorStop(0, k.c1);
    gg.addColorStop(1, k.c2);
    ctx.beginPath();
    ctx.arc(dx + disc / 2, dy + disc / 2, disc / 2, 0, 7);
    ctx.fillStyle = gg;
    ctx.fill();
    /* a faint cream rim keeps the darker discs (coffee) from sinking into the espresso */
    ctx.strokeStyle = "rgba(246,239,226,.18)";
    ctx.lineWidth = 3;
    ctx.stroke();
    _pcVessel(ctx, k, dx + disc / 2, dy + disc / 2 + 4, 96, cream, 0.6);
    _pcMedal(ctx, dx + disc - 22, dy + disc - 30, it.n, 48, it.n <= 3, SANS, true);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = cream;
    ctx.font = "800 54px " + SANS;
    ctx.fillText(_pcWrap(ctx, it.name, textW, 1)[0], 246, y + 66);
    ctx.fillStyle = "rgba(246,239,226,.66)";
    ctx.font = "500 36px " + SANS;
    ctx.fillText(_pcWrap(ctx, it.area, textW, 1)[0] || "", 246, y + 114);
    ctx.fillStyle = "#e9a866";
    ctx.font = "700 36px " + SANS;
    ctx.fillText(_pcWrap(ctx, it.drink, textW, 1)[0] || "", 246, y + 160);
    if (i < items.length - 1) {
      ctx.fillStyle = "rgba(246,239,226,.12)";
      ctx.fillRect(PAD, y + 180, W - PAD * 2, 2);
    }
    y += 196;
  });
  _pcFoot(ctx, W, PAD, SAFE_B, SANS, true);
}
/* The postcard dialog is shared by every Story card. What is being shared lives in _pcSubject: its title, the message
   that goes with it (and the link), the file name of the picture, and how the canvas is described. */
let _pcSubject = null;
function _pcOpen(subject, draw) {
  const m = $("pcmodal"),
    cv = $("pc-canvas");
  if (!m || !cv) return;
  _pcOpener = document.activeElement;
  _pcSubject = subject;
  draw(cv);
  cv.setAttribute("aria-label", subject.aria);
  m.setAttribute("aria-label", subject.dialog);
  const note = $("pc-note");
  if (note) note.textContent = navigator.canShare ? subject.noteShare : "Saves the picture, or copies the message.";
  m.hidden = false;
  const b = $("pc-share");
  if (b) b.focus();
}
function openPostcard() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  const d = postcardData(c);
  _pcOpen(
    {
      title: d.name,
      text: postcardText(c),
      message: postcardText(c).split("\n").slice(0, -1).join("\n"),
      url: cafeShareUrl(c.id),
      slug: String(c.name || "cafe").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cafe",
      aria: "Postcard for " + c.name,
      dialog: "Share this spot",
      noteShare: "Shares the picture with a link to this cafe.",
    },
    function (cv) {
      drawPostcard(cv, d);
    }
  );
}
/* The year, from the Wrapped strip: this year once it has enough visits, else last year's. */
function openYearStory() {
  const pick = wrappedPick(
    cafes.filter(function (c) {
      return !c.wish;
    })
  );
  if (!pick) return;
  const w = pick.w,
    url = location.origin + location.pathname,
    message = wrappedText(w);
  _pcOpen(
    {
      title: "My " + w.year + " in caf\u00e9s",
      text: message + " " + url,
      message: message,
      url: url,
      slug: "my-" + w.year + "-in-cafes",
      aria: "Your " + w.year + " in caf\u00e9s",
      dialog: "Share your " + w.year,
      noteShare: "Shares the picture.",
    },
    function (cv) {
      drawYearStory(cv, w);
    }
  );
}
/* Your top five, from the Go tab. Private spots are left out: they are somebody's home. */
function top5Items() {
  /* one pass over the ranking: asking rankOf() per cafe, and again per comparison in a sort, walks the whole board
     each time, which on 111 cafes was a million score calls every time the Go tab drew */
  const rm = rankMap();
  return cafes
    .filter(function (c) {
      /* only cafes past placement: a newcomer that won its first two answers can sit high for a day */
      return !c.wish && !c.custom && rm[c.id] && !isProvisional(c);
    })
    .sort(function (a, b) {
      return rm[a.id] - rm[b.id];
    })
    .slice(0, 5)
    .map(function (c, i) {
      const td = topDrinkAt(c);
      /* numbered 1 to 5 on the card itself: a private spot left out of the list must not leave a gap in it */
      return { n: i + 1, name: c.name, area: c.area || "", drink: td ? td.d.n : "", kind: cafeKind(c) };
    });
}
function openTop5Story() {
  const items = top5Items();
  if (items.length < 3) return;
  const total = rankMap()._n,
    url = location.origin + location.pathname,
    message = "My top " + items.length + " caf\u00e9s: " + items.map(function (it) { return it.n + ". " + it.name; }).join(", ") + ".";
  _pcOpen(
    {
      title: "My top " + items.length + " caf\u00e9s",
      text: message + " " + url,
      message: message,
      url: url,
      slug: "my-top-" + items.length + "-cafes",
      aria: "Your top " + items.length + " caf\u00e9s",
      dialog: "Share your top " + items.length,
      noteShare: "Shares the picture.",
    },
    function (cv) {
      drawTop5Story(cv, items, total);
    }
  );
}
function closePostcard() {
  const m = $("pcmodal");
  if (!m || m.hidden) return;
  m.hidden = true;
  if (_pcOpener && _pcOpener.focus) _pcOpener.focus();
  _pcOpener = null;
}
function copyPostcardText() {
  if (!_pcSubject) return;
  const t = _pcSubject.text;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(
      () => toast("Message copied"),
      () => toast("Couldn't copy")
    );
  } else toast("Couldn't copy");
}
function sendPostcard() {
  const sub = _pcSubject,
    cv = $("pc-canvas");
  if (!sub || !cv) return;
  const url = sub.url,
    text = sub.message;
  const byLink = function () {
    if (navigator.share) navigator.share({ title: sub.title, text: text, url: url }).catch(function () {});
    else copyPostcardText();
  };
  if (!cv.toBlob) return byLink();
  cv.toBlob(function (blob) {
    if (!blob) return byLink();
    const slug = sub.slug;
    let file = null;
    try {
      file = new File([blob], slug + ".png", { type: "image/png" });
    } catch (e) {
      warn("detail.js postcard", e);
    }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: sub.title, text: text, url: url }).catch(function (e) {
        if (e && e.name !== "AbortError") byLink();
      });
      return;
    }
    /* no picture sharing here (most desktops): hand over the picture itself */
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slug + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 4000);
    toast("Postcard saved");
  }, "image/png");
}
document.addEventListener("keydown", e => {
  const m = $("pcmodal");
  if (!m || m.hidden) return;
  if (e.key === "Escape") closePostcard();
  else if (e.key === "Tab") {
    const f = [].slice.call(m.querySelectorAll("button")).filter(b => !b.disabled);
    if (!f.length) return;
    const first = f[0],
      last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

