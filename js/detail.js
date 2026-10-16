"use strict";
/* detail.js — Cafe detail page.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- detail ---------- */
function photoLabel(c) {
  if (c && c.photo) return "📷 My drink";
  const u = gphotoFor(c);
  if (u) return "📷 Google Maps";
  return "";
}
function setHeroTag(c) {
  const t = $("d-tagphoto");
  if (!t) return;
  const l = photoLabel(c);
  if (l) {
    t.textContent = l;
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
function drinkGlyph(n) {
  n = (n || "").toLowerCase();
  if (/matcha|hojicha|green tea/.test(n)) return "🍵";
  if (/boba|milk tea|oolong|\btea\b/.test(n)) return "🧋";
  if (/coffee|espresso|americano|latte|mocha|cappuccino|cold brew/.test(n)) return "☕";
  return "🥤";
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
function openDetail(id, from) {
  const c = cafes.find(x => x.id === id);
  if (!c) return;
  if (from) lastMain = from;
  curId = id;

  /* ---- hero photo ---- */
  const hero = $("d-hero");
  if ($("d-hero-emoji")) $("d-hero-emoji").textContent = c.emoji || "☕";
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
  $("d-fav").textContent = c.fav ? "❤️" : "🤍";
  if ($("d-wish")) {
    $("d-wish").textContent = "🔖";
    $("d-wish").style.opacity = c.wish ? "1" : ".45";
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
  $("d-fav").textContent = c.fav ? "❤️" : "🤍";
  renderMarkers();
  toast(c.fav ? "Added to favorites" : "Removed from favorites");
}
function toggleWish() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  c.wish = !c.wish;
  saveCafe(c.id);
  $("d-wish").style.opacity = c.wish ? "1" : ".45";
  renderMarkers();
  toast(c.wish ? "Added to wishlist 🔖" : "Removed from wishlist");
}
function deleteCurrent() {
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
function drawPostcard(canvas, d) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width,
    H = canvas.height,
    PAD = 72,
    SANS = 'system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    EMO = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const paper = "#fbfaf8",
    ink = "#1d1a17",
    soft = "#5a5a63";
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, W, H);
  /* the tile: the rating colour, deepening towards the bottom, with the cafe's own emoji */
  const top = 540,
    g = ctx.createLinearGradient(0, 0, W, top);
  g.addColorStop(0, d.tint);
  g.addColorStop(1, "#2a1a0c");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, top);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "300px " + EMO;
  ctx.fillStyle = "#fff";
  ctx.fillText(d.emoji, W / 2, top / 2 + 30);
  const fade = ctx.createLinearGradient(0, top - 220, 0, top);
  fade.addColorStop(0, "rgba(251,250,248,0)");
  fade.addColorStop(1, paper);
  ctx.fillStyle = fade;
  ctx.fillRect(0, top - 220, W, 220);
  /* rank medallion: gold for the top ten, dark glass for the rest */
  ctx.textAlign = "left";
  if (d.rk) {
    const label = "#" + d.rk,
      gold = d.rk <= 10;
    ctx.font = "800 72px " + SANS;
    const w = ctx.measureText(label).width + 72;
    _pcRound(ctx, PAD, PAD, w, 112, 56);
    if (gold) {
      const gg = ctx.createLinearGradient(PAD, PAD, PAD + w, PAD + 112);
      gg.addColorStop(0, "#f6d77f");
      gg.addColorStop(1, "#dca13a");
      ctx.fillStyle = gg;
    } else ctx.fillStyle = "rgba(20,13,8,.62)";
    ctx.fill();
    ctx.fillStyle = gold ? "#3b2606" : "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(label, PAD + 36, PAD + 58);
    ctx.font = "700 36px " + SANS;
    ctx.fillStyle = "#fff";
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(0,0,0,.5)";
    ctx.shadowBlur = 8;
    ctx.fillText("of " + d.rn + " on my list", W - PAD, PAD + 58);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }
  /* the words */
  let y = top + 40;
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
    /* as many lines as fit above the footer, never fewer than two */
    const room = Math.max(2, Math.min(4, Math.floor((H - 130 - y) / 58)));
    _pcWrap(ctx, "\u201c" + d.review + "\u201d", W - PAD * 2, room).forEach(function (ln) {
      ctx.fillText(ln, PAD, y + 40);
      y += 58;
    });
  }
  /* footer */
  ctx.fillStyle = "rgba(0,0,0,.12)";
  ctx.fillRect(PAD, H - 120, W - PAD * 2, 2);
  ctx.font = "800 28px " + SANS;
  ctx.fillStyle = soft;
  ctx.fillText("JL CAFE PROJECT", PAD, H - 62);
  ctx.textAlign = "right";
  ctx.fillText("OPEN IN THE APP \u203a", W - PAD, H - 62);
  ctx.textAlign = "left";
}
function openPostcard() {
  const c = cafes.find(x => x.id === curId),
    m = $("pcmodal"),
    cv = $("pc-canvas");
  if (!c || !m || !cv) return;
  _pcOpener = document.activeElement;
  drawPostcard(cv, postcardData(c));
  cv.setAttribute("aria-label", "Postcard for " + c.name);
  const note = $("pc-note");
  if (note)
    note.textContent = navigator.canShare
      ? "Shares the picture with a link to this cafe."
      : "Saves the picture, or copies the message.";
  m.hidden = false;
  const b = $("pc-share");
  if (b) b.focus();
}
function closePostcard() {
  const m = $("pcmodal");
  if (!m || m.hidden) return;
  m.hidden = true;
  if (_pcOpener && _pcOpener.focus) _pcOpener.focus();
  _pcOpener = null;
}
function copyPostcardText() {
  const c = cafes.find(x => x.id === curId);
  if (!c) return;
  const t = postcardText(c);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(
      () => toast("Message copied"),
      () => toast("Couldn't copy")
    );
  } else toast("Couldn't copy");
}
function sendPostcard() {
  const c = cafes.find(x => x.id === curId),
    cv = $("pc-canvas");
  if (!c || !cv) return;
  const url = cafeShareUrl(c.id),
    d = postcardData(c),
    text = postcardText(c).split("\n").slice(0, -1).join("\n");
  const byLink = function () {
    if (navigator.share) navigator.share({ title: d.name, text: text, url: url }).catch(function () {});
    else copyPostcardText();
  };
  if (!cv.toBlob) return byLink();
  cv.toBlob(function (blob) {
    if (!blob) return byLink();
    const slug = String(c.name || "cafe").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    let file = null;
    try {
      file = new File([blob], (slug || "cafe") + ".png", { type: "image/png" });
    } catch (e) {
      warn("detail.js postcard", e);
    }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: d.name, text: text, url: url }).catch(function (e) {
        if (e && e.name !== "AbortError") byLink();
      });
      return;
    }
    /* no picture sharing here (most desktops): hand over the picture itself */
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (slug || "cafe") + ".png";
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

