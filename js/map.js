"use strict";
/* map.js — Google Maps loading, markers, location index and geolocation.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- google maps loader ---------- */
function startMaps() {
  if (!GMAPS_KEY_ENC || /PASTE|HERE/.test(GMAPS_KEY_ENC)) {
    showMapError(
      "Add your encoded Google Maps API key near the top of this file (the GMAPS_KEY_ENC line), then reload."
    );
    return;
  }
  const s = document.createElement("script");
  s.src =
    "https://maps.googleapis.com/maps/api/js?key=" +
    encodeURIComponent(GMAPS_KEY) +
    "&libraries=places&loading=async&callback=onGoogleReady";
  s.async = true;
  s.onerror = () => showMapError("Couldn't load Google Maps. Check your connection and API key.");
  document.head.appendChild(s);
}
function onGoogleReady() {
  gReady = true;
  $("map-msg").classList.remove("show");
  initMap();
  if (app.dataset.view === "list") renderList();
}
function gm_authFailure() {
  showMapError(
    "Google rejected the API key. Check the key is correct, billing is enabled, and this site is allowed in the key's HTTP-referrer restrictions."
  );
}
function showMapError(msg) {
  const el = $("map-msg");
  el.innerHTML = '<div class="big">🗺️</div><div>' + msg + "</div>";
  el.classList.add("show");
  if ($("map-sub")) $("map-sub").textContent = "Map unavailable";
}
function mapResize() {
  if (gmap) {
    google.maps.event.trigger(gmap, "resize");
    if (gmap.setOptions) gmap.setOptions({ minZoom: _minZoom() });
  }
  if (fgmap) google.maps.event.trigger(fgmap, "resize");
}
function fitPad() {
  const w = window.innerWidth || 0;
  if (w >= 1400) return { top: 60, right: 60, bottom: 60, left: 480 };
  if (w >= 900) return { top: 60, right: 60, bottom: 60, left: 440 };
  return 60;
}
function refitMap() {
  if (!gmap) return;
  const pts = gmarkers
    .filter(_pinShown)
    .map(m => m.getPosition())
    .filter(Boolean);
  if (userMarker) pts.push(userMarker.getPosition());
  if (!pts.length) return;
  if (pts.length === 1) {
    gmap.setCenter(pts[0]);
  } else {
    const b = new google.maps.LatLngBounds();
    pts.forEach(p => b.extend(p));
    gmap.fitBounds(b, fitPad());
  }
}
/* ---------- main map ---------- */
function initMap() {
  gmap = new google.maps.Map($("map"), {
    center: { lat: DEFAULT_CENTER[0], lng: DEFAULT_CENTER[1] },
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
    gestureHandling: "greedy",
    /* Zoomed out far enough, the world is smaller than the screen and the rest is grey. The floor is
       the zoom at which the world is as tall as the map; the background is the ocean's colour, so a
       tile that has not loaded yet is blue, not grey; and the poles are never shown. */
    minZoom: _minZoom(),
    backgroundColor: OCEAN,
    restriction: { latLngBounds: { north: 85, south: -85, west: -180, east: 180 }, strictBounds: false },
  });
  renderMarkers();
  autoLocate();
  gmap.addListener("click", () => {
    pendingMarkerId = null;
    if (gInfo) gInfo.close();
    closePeek();
  });
  gmap.addListener("dragstart", () => {
    if ($("btn-locate") && $("btn-locate").dataset.state === "on") setLocateState("idle");
  });
  /* Any touch on the map — a drag, a pinch, a wheel, a tap on a pin — means the person is
     looking at THIS view. Only the location dropdown used to count, so panning to another
     neighbourhood, tapping a pin and coming back snapped the map to where you were standing,
     on every pin. DOM events rather than map events, because a pinch fires no dragstart. */
  gmap.addListener("idle", function () {
    if (mapWantOnly) updateWantBar();
  });
  const _mapEl = $("map");
  if (_mapEl)
    ["pointerdown", "wheel", "touchstart"].forEach(function (ev) {
      _mapEl.addEventListener(
        ev,
        function () {
          mapOwned = true;
        },
        { passive: true }
      );
    });
}
/* One colour per bucket now, not five steps: 4 and 5 were two names for "loved" and read as
   two different judgements on the map. Takes a rating so every existing caller still works. */
function ratingColor(r) {
  r = r || 0;
  return r >= 4 ? BUCKET_HEX.loved : r >= 3 ? BUCKET_HEX.fine : r >= 1 ? BUCKET_HEX.meh : BUCKET_HEX[""];
}
/* ---------- the World view ----------
   "All locations" fitted every pin. Pins run from Sydney to Vancouver, so that was the whole globe:
   113 dots over open water, and on a phone a map smaller than the screen with grey around it.
   The world is now a place you ask for, drawn as one numbered bubble per region with a list under
   it. A region is a US state, or a country elsewhere (the same grouping as the dropdown). */
const OCEAN = "#aad3df";
let mapWorld = null; /* true once the person asks for the World view */
let _focusVal = null; /* the dropdown value the map is currently showing, when it is a place */
let gworld = [];
let _worldList = [];
function _minZoom() {
  const h = ($("map") && $("map").clientHeight) || window.innerHeight || 800;
  return Math.max(2, Math.ceil(Math.log2(h / 256)));
}
function regionOf(c) {
  const n = cafeCountryName(c);
  if (n === "United States") {
    const st = cafeStateName(c);
    return st
      ? { val: "state:United States|" + encodeURIComponent(st).replace(/%20/g, " "), label: st }
      : { val: "country:United States", label: "United States" };
  }
  if (n === "Other") return { val: "other:", label: "Other places" };
  return { val: "country:" + n, label: n };
}
function worldRegions() {
  const by = {};
  cafes.forEach(c => {
    if (c.lat == null || (mapWantOnly && !c.wish)) return;
    const r = regionOf(c);
    const g =
      by[r.val] ||
      (by[r.val] = { val: r.val, label: r.label, n: 0, been: 0, wish: 0, loved: 0, fine: 0, meh: 0, lat: 0, lng: 0 });
    g.n++;
    g.lat += latOf(c);
    g.lng += lngOf(c);
    if (c.wish) g.wish++;
    else {
      g.been++;
      const k = bucketOf(c);
      if (k) g[k]++;
    }
  });
  return Object.keys(by)
    .map(k => {
      const g = by[k];
      g.lat /= g.n;
      g.lng /= g.n;
      return g;
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label));
}
/* The World view is something you ask for. */
function _worldOn() {
  return mapWorld === true;
}
/* Pins spread too far for one view to show them as places. */
function _spreadOut() {
  const pts = cafes.filter(c => c.lat != null);
  if (pts.length < 2) return false;
  const lngs = pts.map(c => c.lng);
  const lats = pts.map(c => c.lat);
  const spread = Math.max(...lngs) - Math.min(...lngs) > 60 || Math.max(...lats) - Math.min(...lats) > 25;
  return spread && worldRegions().length >= 2;
}
/* Where the map opens when the pins are spread out: the region of the cafe nearest you, if one is
   within 150 km; otherwise the region with the most pins. null when everything is in one view. */
function _homeVal() {
  if (!_spreadOut()) return null;
  if (userLoc) {
    let best = null,
      bd = 150;
    cafes.forEach(c => {
      if (c.lat == null) return;
      const d = distKm(userLoc.lat, userLoc.lng, c.lat, c.lng);
      if (d < bd) {
        bd = d;
        best = c;
      }
    });
    if (best) return regionOf(best).val;
  }
  const r = worldRegions();
  return r.length ? r[0].val : null;
}
function clearWorldBubbles() {
  gworld.forEach(m => m.setMap(null));
  gworld = [];
}
function _bubbleIcon(n) {
  const r = Math.round(12 + Math.min(14, Math.sqrt(n) * 2.2));
  const d = 2 * r + 6;
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    d +
    '" height="' +
    d +
    '" viewBox="0 0 ' +
    d +
    " " +
    d +
    '">' +
    '<circle cx="' +
    d / 2 +
    '" cy="' +
    d / 2 +
    '" r="' +
    r +
    '" fill="#d5803b" fill-opacity=".95" stroke="#ffffff" stroke-width="3"/>' +
    '<text x="' +
    d / 2 +
    '" y="' +
    (d / 2 + 5) +
    '" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="' +
    (n > 99 ? 12 : 15) +
    '" font-weight="700" fill="#ffffff">' +
    n +
    "</text></svg>";
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(d, d),
    anchor: new google.maps.Point(d / 2, d / 2),
  };
}
function drawWorldBubbles() {
  clearWorldBubbles();
  _worldList = worldRegions();
  _worldList.forEach(function (g, i) {
    const m = new google.maps.Marker({
      position: { lat: g.lat, lng: g.lng },
      map: gmap,
      icon: _bubbleIcon(g.n),
      title: g.label + " \u00b7 " + g.n + (g.n === 1 ? " place" : " places"),
      zIndex: 4,
    });
    m.addListener("click", () => showRegionAt(i));
    gworld.push(m);
  });
}
function fitWorld() {
  if (!gmap) return;
  const rs = _worldList.length ? _worldList : worldRegions();
  if (!rs.length) return;
  const b = new google.maps.LatLngBounds();
  rs.forEach(g => b.extend({ lat: g.lat, lng: g.lng }));
  gmap.fitBounds(b, fitPad());
}
function showRegionAt(i) {
  const g = _worldList[i];
  if (!g) return;
  mapOwned = true;
  jumpToLocation(g.val);
}
function closePeekIfOpen() {
  if (typeof peekOpen === "function" && peekOpen()) closePeek();
}
/* The list under the map: where you have been, biggest first, with how it went. */
function syncWorldUI() {
  const box = /** @type {HTMLElement|null} */ (document.querySelector(".mapbox")),
    el = $("worldsheet");
  if (!el || !box) return;
  const on = !!gmap && _worldOn();
  el.hidden = !on;
  box.classList.toggle("worlding", on);
  if (!on) return;
  const rs = _worldList.length ? _worldList : worldRegions();
  const total = rs.reduce((t, g) => t + g.n, 0);
  el.innerHTML =
    '<div class="wgrab"></div><div class="whead">' +
    (mapWantOnly ? "Want to try" : "Where you have been") +
    " \u00b7 " +
    total +
    (total === 1 ? " place" : " places") +
    "</div>" +
    rs
      .map(function (g, i) {
        const t = g.loved + g.fine + g.meh || 1;
        const sub = g.been ? g.been + " been" + (g.wish ? " \u00b7 " + g.wish + " to try" : "") : g.wish + " to try";
        return (
          '<button type="button" class="wrow" onclick="showRegionAt(' +
          i +
          ')">' +
          '<span class="wmain"><b>' +
          esc(g.label) +
          "</b><small>" +
          sub +
          "</small></span>" +
          '<span class="wbar" aria-hidden="true"><i style="width:' +
          (g.loved / t) * 100 +
          "%;background:" +
          BUCKET_HEX.loved +
          '"></i><i style="width:' +
          (g.fine / t) * 100 +
          "%;background:" +
          BUCKET_HEX.fine +
          '"></i><i style="width:' +
          (g.meh / t) * 100 +
          "%;background:" +
          BUCKET_HEX.meh +
          '"></i></span>' +
          '<span class="wn">' +
          g.n +
          '</span><span class="wchev" aria-hidden="true">\u203a</span></button>'
        );
      })
      .join("");
  box.style.setProperty("--worldh", el.offsetHeight + "px");
}
let gclusterer = null;
/* ---------- want-to-try pins ----------
   They used to be a 20px pale-blue ring at a quarter-strength fill, with no white edge, drawn
   under every visited pin and folded into the same orange clusters. Measured against the
   map they stood out 2.0–3.0:1 (the fill 1.2:1), shared their blue with water, transit and the
   you-are-here dot, and De Matcha vanished into 8 Grams Matcha 130m away.
   Now: the size of a visited pin, a white edge, violet (a hue nothing else on the map uses,
   4.6–6.8:1 on streets, parks and water) and a bookmark, so it reads without colour too. They
   sit above the cluster bubbles (but under the you-are-here dot, MAX+1000), and are never
   clustered — there are a handful, and a want-to-try is the pin you are looking for. */
const WISH_PIN_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">' +
  '<circle cx="15" cy="15" r="12" fill="' +
  WISH_HEX +
  '" stroke="#ffffff" stroke-width="3"/>' +
  '<path d="M11.4 9.4h7.2v11.2l-3.6-2.9-3.6 2.9z" fill="#ffffff"/></svg>';
function wishPinIcon() {
  return {
    url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(WISH_PIN_SVG),
    scaledSize: new google.maps.Size(30, 30),
    anchor: new google.maps.Point(15, 15),
  };
}
function wishPinZ() {
  return (google.maps.Marker.MAX_ZINDEX || 1000000) + 500;
}

/* The Want to try switch. Toggling shows and hides the pins that exist rather than redrawing
   them, because renderMarkers() refits the map to every pin it draws — and a want-to-try list
   spanning the Bay Area and Vancouver would throw you out to half a continent each tap. */
let mapWantOnly = false;
function _pinShown(m) {
  return !mapWantOnly || !!m._wish;
}
function _showPins() {
  if (!gmap) return;
  if (gclusterer) {
    try {
      gclusterer.clearMarkers();
      gclusterer.setMap(null);
    } catch (e) {
      warn("map.js", e);
    }
    gclusterer = null;
  }
  /* The World view shows one bubble per region instead of every pin: 113 dots across an ocean
     are not tappable, and they were what made the opening view a blur. */
  if (_worldOn()) {
    gmarkers.forEach(m => m.setMap(null));
    drawWorldBubbles();
    return;
  }
  clearWorldBubbles();
  const been = gmarkers.filter(function (m) {
      return !m._wish;
    }),
    want = gmarkers.filter(function (m) {
      return m._wish;
    });
  been.forEach(function (m) {
    m.setMap(null);
  });
  if (!mapWantOnly) {
    if (window.markerClusterer && markerClusterer.MarkerClusterer && been.length) {
      gclusterer = new markerClusterer.MarkerClusterer({ map: gmap, markers: been, renderer: _clusterRenderer });
    } else
      been.forEach(function (m) {
        m.setMap(gmap);
      });
  }
  want.forEach(function (m) {
    m.setMap(gmap);
  });
}
function wishPinCount() {
  return gmarkers.filter(function (m) {
    return m._wish;
  }).length;
}
function _wishInView() {
  const bds = gmap && typeof gmap.getBounds === "function" ? gmap.getBounds() : null;
  if (!bds) return null;
  return gmarkers.filter(function (m) {
    return m._wish && bds.contains(m.getPosition());
  }).length;
}
function _fitWish() {
  const pts = gmarkers
    .filter(function (m) {
      return m._wish;
    })
    .map(function (m) {
      return m.getPosition();
    });
  if (!gmap || !pts.length) return;
  if (pts.length === 1) {
    gmap.setCenter(pts[0]);
    gmap.setZoom(15);
    return;
  }
  const b = new google.maps.LatLngBounds();
  pts.forEach(function (p) {
    b.extend(p);
  });
  gmap.fitBounds(b, fitPad());
}
function syncWantUI() {
  const n = wishPinCount(),
    chip = $("btn-want");
  if (!n && mapWantOnly) mapWantOnly = false;
  if (chip) {
    chip.hidden = !n;
    chip.setAttribute("aria-pressed", String(mapWantOnly));
    const c = $("want-n");
    if (c) c.textContent = String(n);
    chip.setAttribute(
      "aria-label",
      (mapWantOnly ? "Showing only want to try" : "Show only want to try") + ", " + n + " place" + (n === 1 ? "" : "s")
    );
  }
  updateWantBar();
  syncWorldUI();
}
function updateWantBar() {
  const bar = $("wantbar");
  if (!bar) return;
  bar.hidden = !mapWantOnly;
  if (!mapWantOnly) return;
  const n = wishPinCount(),
    here = _wishInView(),
    t = $("wantbar-text");
  if (t)
    t.textContent =
      "Only want to try · " + (here == null ? n + " place" + (n === 1 ? "" : "s") : here + " here, " + n + " in all");
}
function toggleWantOnly(on) {
  mapWantOnly = on === undefined ? !mapWantOnly : !!on;
  if (!wishPinCount()) mapWantOnly = false;
  /* the card may belong to a pin that is about to disappear */
  if (mapWantOnly && typeof peekOpen === "function" && peekOpen()) {
    const pc = cafes.find(function (x) {
      return x.id === peekId;
    });
    if (!pc || !pc.wish) closePeek();
  }
  _showPins();
  if (mapWantOnly && gmap) {
    mapOwned = true;
    if (_wishInView() === 0) _fitWish();
  }
  syncWantUI();
}
const _clusterRenderer = {
  render: function (cluster) {
    const n = cluster.count;
    return new google.maps.Marker({
      position: cluster.position,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 14 + Math.min(12, n),
        fillColor: "#d5803b",
        fillOpacity: 0.92,
        strokeColor: "#ffffff",
        strokeWeight: 3,
      },
      label: { text: String(n), color: "#ffffff", fontSize: "12px", fontWeight: "700" },
      zIndex: google.maps.Marker.MAX_ZINDEX + n,
    });
  },
};
function renderMarkers() {
  if (!gmap) return;
  if (gclusterer) {
    try {
      gclusterer.clearMarkers();
      gclusterer.setMap(null);
    } catch (e) {
      warn("map.js", e);
    }
    gclusterer = null;
  }
  gmarkers.forEach(m => m.setMap(null));
  gmarkers = [];
  const b = new google.maps.LatLngBounds();
  let n = 0;
  const dups = dupNameKeys();
  cafes.forEach(c => {
    if (c.lat == null) return;
    const opt = {
      position: { lat: latOf(c), lng: lngOf(c) },
      title: dups[(c.name || "").trim().toLowerCase()] && c.area ? c.name + " — " + c.area : c.name,
      icon: c.wish
        ? wishPinIcon()
        : {
            path: google.maps.SymbolPath.CIRCLE,
            scale: c.fav ? 15 : 12,
            fillColor: ratingColor(c.rating),
            fillOpacity: 1,
            strokeColor: c.fav ? "#e0556b" : "#ffffff",
            strokeWeight: c.fav ? 4 : 3,
          },
      zIndex: c.wish ? wishPinZ() : c.fav ? 5 : 3,
    };
    const m = new google.maps.Marker(opt);
    m._wish = !!c.wish;
    m.addListener("click", () => onMarkerClick(c, m));
    gmarkers.push(m);
    if (_pinShown(m)) {
      b.extend(opt.position);
      n++;
    }
  });
  _showPins();
  syncWantUI();
  if ($("map-sub"))
    $("map-sub").textContent = cafes.length + " cafe" + (cafes.length === 1 ? "" : "s") + " · tap a pin";
  renderLocationSelect();
  if (_worldOn()) fitWorld();
  else if (_focusVal) fitList(locationList(_focusVal));
  else if (_homeVal()) fitList(locationList(_homeVal()));
  else if (n === 1) {
    gmap.setCenter(gmarkers.filter(_pinShown)[0].getPosition());
    gmap.setZoom(14);
  } else if (n > 1) {
    gmap.fitBounds(b, fitPad());
  }
}
const COUNTRY_INFO = {
  "United States USA America": { flag: "🇺🇸", name: "United States" },
  "South Korea Korea": { flag: "🇰🇷", name: "South Korea" },
  Japan: { flag: "🇯🇵", name: "Japan" },
  Taiwan: { flag: "🇹🇼", name: "Taiwan" },
  "Hong Kong China": { flag: "🇭🇰", name: "Hong Kong" },
  Singapore: { flag: "🇸🇬", name: "Singapore" },
  Australia: { flag: "🇦🇺", name: "Australia" },
  "United Kingdom UK England": { flag: "🇬🇧", name: "United Kingdom" },
  France: { flag: "🇫🇷", name: "France" },
  Canada: { flag: "🇨🇦", name: "Canada" },
};
function cafeCountryName(c) {
  const t = countryTerms(c);
  return (COUNTRY_INFO[t] && COUNTRY_INFO[t].name) || "Other";
}
/* The one country count, used by Stats and the Go board — they printed 5 and 6 for the same
   data because only one of them knew that "Other" (the fallback for a cafe whose coordinates
   match no country box; six real ones) is not a country. */
function countryCount(list) {
  const m = {};
  list.forEach(function (c) {
    const k = cafeCountryName(c);
    if (k && k !== "Other") m[k] = 1;
  });
  return Object.keys(m).length;
}
function cafeCountryLabel(c) {
  const t = countryTerms(c);
  const info = COUNTRY_INFO[t];
  return info ? info.flag + " " + info.name : "🌐 Other";
}
function cafeStateName(c) {
  const m = /,\s*([A-Za-z]{2})\b/.exec(c.area || "");
  if (m) {
    const ab = m[1].toUpperCase();
    if (STATE_NAMES[ab]) return STATE_NAMES[ab];
  }
  if (c.lat != null && c.lng != null) {
    const lat = c.lat,
      lng = c.lng;
    if (lng < -150 && lat > 18 && lat < 23) return "Hawaii";
    if (lng >= -125 && lng <= -117 && lat >= 32 && lat <= 42.5) return "California";
    if (lng > -117 && lng <= -114 && lat >= 35 && lat <= 37.5) return "Nevada";
    /* For places whose area text has no ", XX" to read a state from. Rough boxes, listed only for
       states where cafes actually are; the order puts the smaller, more specific ones first. */
    if (lng >= -124.8 && lng <= -116.9 && lat >= 45.55 && lat <= 49) return "Washington";
    if (lng >= -79.8 && lng <= -71.8 && lat >= 40.4 && lat <= 45) return "New York";
    if (lng >= -106.7 && lng <= -93.5 && lat >= 25.8 && lat <= 36.5) return "Texas";
    if (lng >= -114.05 && lng <= -109.05 && lat >= 37 && lat <= 42) return "Utah";
  }
  return "";
}
function buildLocationIndex() {
  const groups = {};
  cafes.forEach(c => {
    if (c.lat == null) return;
    const name = cafeCountryName(c);
    const label = cafeCountryLabel(c);
    const st = cafeStateName(c);
    const city = (c.area || "").trim();
    if (!groups[name]) groups[name] = { label: label, states: {}, cities: {}, isUS: name === "United States" };
    if (st) {
      if (!groups[name].states[st]) groups[name].states[st] = { cities: {} };
      if (groups[name].isUS && city) groups[name].states[st].cities[city] = true;
    } else if (groups[name].isUS && city) {
      groups[name].cities[city] = true;
    }
  });
  return groups;
}
function renderLocationSelect() {
  const sel = $("locsel");
  if (!sel) return;
  const prev = sel.value;
  const groups = buildLocationIndex();
  const names = Object.keys(groups).sort((a, b) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  let html = '<option value="">🌐 World</option>';
  names.forEach(name => {
    const g = groups[name];
    html += '<optgroup label="' + esc(g.label) + '">';
    html += '<option value="country:' + encodeURIComponent(name) + '">All of ' + esc(name) + "</option>";
    const states = Object.keys(g.states).sort();
    states.forEach(s => {
      html +=
        '<option value="state:' + encodeURIComponent(name) + "|" + encodeURIComponent(s) + '">' + esc(s) + "</option>";
      if (g.isUS) {
        const cities = Object.keys(g.states[s].cities).sort();
        cities.forEach(ct => {
          html +=
            '<option value="city:' +
            encodeURIComponent(name) +
            "|" +
            encodeURIComponent(s) +
            "|" +
            encodeURIComponent(ct) +
            '"> ' +
            esc(ct) +
            "</option>";
        });
      }
    });
    if (g.isUS) {
      const loose = Object.keys(g.cities).sort();
      loose.forEach(ct => {
        html +=
          '<option value="city:' +
          encodeURIComponent(name) +
          "||" +
          encodeURIComponent(ct) +
          '">' +
          esc(ct) +
          "</option>";
      });
    }
    html += "</optgroup>";
  });
  sel.innerHTML = html;
  if (prev && [].slice.call(sel.options).some(o => o.value === prev)) sel.value = prev;
}
/* The pins a dropdown value stands for. "other:" is the places no country box claims. */
function locationList(val) {
  if (!val) return cafes.filter(c => c.lat != null);
  if (val === "other:") return cafes.filter(c => c.lat != null && cafeCountryName(c) === "Other");
  if (val.slice(0, 8) === "country:") {
    const name = decodeURIComponent(val.slice(8));
    return cafes.filter(c => c.lat != null && cafeCountryName(c) === name);
  }
  if (val.slice(0, 6) === "state:") {
    const parts = val.slice(6).split("|");
    const name = decodeURIComponent(parts[0]);
    const st = decodeURIComponent(parts[1] || "");
    return cafes.filter(c => c.lat != null && cafeCountryName(c) === name && cafeStateName(c) === st);
  }
  if (val.slice(0, 5) === "city:") {
    const parts = val.slice(5).split("|");
    const name = decodeURIComponent(parts[0]);
    const st = decodeURIComponent(parts[1] || "");
    const ct = decodeURIComponent(parts[2] || "");
    return cafes.filter(
      c =>
        c.lat != null &&
        cafeCountryName(c) === name &&
        (c.area || "").trim() === ct &&
        (st ? cafeStateName(c) === st : true)
    );
  }
  return cafes.filter(c => c.lat != null);
}
function fitList(list) {
  if (!gmap || !list || !list.length) return;
  if (list.length === 1) {
    gmap.setCenter({ lat: list[0].lat, lng: list[0].lng });
    gmap.setZoom(15);
  } else {
    const b = new google.maps.LatLngBounds();
    list.forEach(c => b.extend({ lat: c.lat, lng: c.lng }));
    gmap.fitBounds(b, fitPad());
  }
}
function jumpToLocation(val) {
  if (!gmap) {
    if (app.dataset.view !== "map") show("map");
    return;
  }
  /* any choice here is you placing the map, "World" included */ mapOwned = true;
  /* "World" is the empty value; anything else is a place, and the pins come back for it */
  const toWorld = !val;
  const changed = mapWorld !== toWorld || _focusVal !== (val || null);
  mapWorld = toWorld;
  _focusVal = val || null;
  const list = locationList(val);
  if (app.dataset.view !== "map") show("map");
  if (changed) {
    closePeekIfOpen();
    _showPins();
    syncWorldUI();
  }
  if (toWorld) {
    setTimeout(fitWorld, 0);
    return;
  }
  if (!list.length) return;
  const _sel = $("locsel");
  if (_sel && val)
    setTimeout(() => {
      try {
        _sel.value = "";
      } catch (e) {
        warn("map.js", e);
      }
    }, 350);
  setTimeout(() => fitList(list), 0);
}
let userLoc = null;
let mapOwned = false; /* the person has positioned the map themselves */
let gInfo = null,
  pendingMarkerId = null;
function mapInfo() {
  if (!gInfo) gInfo = new google.maps.InfoWindow();
  return gInfo;
}
/* ---------- the peek card ----------
   On a phone a pin used to swap the whole screen for the cafe page, so looking at five pins
   was five trips there and back — and each trip back re-centred the map. A pin now slides up
   a card over the map: position, judgement, distance, what to order, Directions. The map
   stays exactly where it was. The laptop keeps opening the page, because there it already
   opens in the side panel beside the map. */
let peekId = null;
function onMarkerClick(c, m) {
  if (gInfo) gInfo.close();
  mapOwned = true;
  if (window.innerWidth >= 900) {
    openDetail(c.id, "map");
    return;
  }
  openPeek(c.id);
}
function peekOpen() {
  return !!peekId;
}
function openPeek(id) {
  const c = cafes.find(x => x.id === id),
    el = $("peek");
  if (!c || !el) return;
  peekId = id;
  const rk = typeof rankOf === "function" ? rankOf(c) : null,
    rn = rk ? rankMap()._n : 0;
  const dkm = userLoc && latOf(c) != null ? distKm(userLoc.lat, userLoc.lng, latOf(c), lngOf(c)) : null;
  const where = [areaOf(c) ? esc(areaOf(c)) : "", dkm != null ? fmtDist(dkm) : ""].filter(Boolean).join(" \u00b7 ");
  const top = !c.wish && typeof topDrinkAt === "function" ? topDrinkAt(c) : null;
  const judge = c.wish ? '<span class="bkpill wantpill"><i></i>Want to try</span>' : bucketPill(c, "");
  el.innerHTML =
    '<div class="peekgrab" aria-hidden="true"></div>' +
    '<div class="peekhead">' +
    (rk ? '<div class="dranktile"><b>#' + rk + "</b><span>of " + rn + "</span></div>" : "") +
    '<div class="peekmain"><div class="peekname">' +
    esc(c.name) +
    "</div>" +
    '<div class="dsub">' +
    judge +
    (where ? '<span class="darea">' + where + "</span>" : "") +
    "</div>" +
    (top
      ? '<div class="peekorder">Order the ' + esc(top.d.n) + (top.n > 1 ? " \u00b7 " + top.n + "\u00d7" : "") + "</div>"
      : "") +
    "</div>" +
    "</div>" +
    '<div class="peekbtns"><button type="button" class="btn" onclick="peekDirections()">Directions</button>' +
    '<button type="button" class="btn ghost" onclick="peekOpenCafe()">Open cafe</button></div>';
  el.hidden = false;
  const box = el.closest(".mapbox");
  if (box) {
    box.classList.add("peeking");
    box.style.setProperty("--peekh", el.offsetHeight + "px");
  }
}
function closePeek() {
  const el = $("peek");
  if (el) {
    el.hidden = true;
    el.innerHTML = "";
  }
  const box = el && el.closest(".mapbox");
  if (box) box.classList.remove("peeking");
  peekId = null;
}
function peekDirections() {
  const c = cafes.find(x => x.id === peekId);
  if (c) goDirections(c);
}
function peekOpenCafe() {
  const id = peekId;
  closePeek();
  if (id) openDetail(id, "map");
}
function nearestCafe(pos) {
  let best = null,
    bd = Infinity;
  cafes.forEach(c => {
    if (c.lat == null) return;
    const d = distKm(pos.lat, pos.lng, c.lat, c.lng);
    if (d < bd) {
      bd = d;
      best = c;
    }
  });
  return best;
}
/* Switching to the map tab used to ask for your location, every single time. Now it only
   uses a permission you have already given; if you have not, the map just sits where it is
   until you press the button. */
function focusNearest() {
  if (!gmap) return;
  ifLocationAlreadyAllowed(function () {
    showUserLocation(true);
  });
}

/* The button. `locate()` and the geolocation plumbing existed from the start, but nothing
   called them and nothing drew the result: showUserLocation() cleared userMarker and never
   built a new one, so the app has always known where you are — the list sorts by distance
   from you — without ever showing you. Both halves are here now. */
function setLocateState(s) {
  const b = $("btn-locate");
  if (b) b.dataset.state = s;
}

/* Blue, filled and above everything — want-to-try pins are violet with a bookmark (v63), so
   nothing else on the map shares this blue. It also carries an accuracy halo no pin has. The halo is the real radius the
   device reported, so a vague fix looks vague instead of pretending to be a doorstep. */
function drawUserLocation(pos, acc) {
  if (!gmap) return;
  if (userMarker) {
    userMarker.setMap(null);
    userMarker = null;
  }
  if (userAccuracy) {
    userAccuracy.setMap(null);
    userAccuracy = null;
  }
  userMarker = new google.maps.Marker({
    position: pos,
    map: gmap,
    clickable: false,
    title: "You are here",
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      scale: 7,
      fillColor: "#1a73e8",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    },
    zIndex: google.maps.Marker.MAX_ZINDEX + 1000,
  });
  /* Below the dot but above the pins, and only when the fix is loose enough to be worth
     drawing — a 5m circle at street zoom is a smudge under the marker. */
  if (acc > 25) {
    userAccuracy = new google.maps.Circle({
      map: gmap,
      center: pos,
      radius: acc,
      clickable: false,
      fillColor: "#1a73e8",
      fillOpacity: 0.1,
      strokeColor: "#1a73e8",
      strokeOpacity: 0.3,
      strokeWeight: 1,
      zIndex: google.maps.Marker.MAX_ZINDEX + 999,
    });
  }
}

function showUserLocation(center, done, force) {
  if (!navigator.geolocation) {
    done && done(false);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    p => {
      const pos = { lat: p.coords.latitude, lng: p.coords.longitude };
      userLoc = pos;
      if (app.dataset.view === "list") renderList();
      /* The guide regroups the moment we know where you are, rather than on the next navigation. */
      else if (app.dataset.view === "compare" && typeof renderBoard === "function") renderBoard();
      if (!gmap) {
        done && done(true);
        return;
      }
      drawUserLocation(pos, p.coords.accuracy || 0);
      /* `force` is the locate button: an explicit "show me where I am" always wins. Everything
       else (launch, returning to the map tab) centres only on a view nobody has touched. */
      if (center && (force || !mapOwned)) {
        if (force) mapOwned = false;
        const near = nearestCafe(pos);
        if (near) {
          const b = new google.maps.LatLngBounds();
          b.extend(pos);
          b.extend({ lat: near.lat, lng: near.lng });
          gmap.fitBounds(b, fitPad());
          google.maps.event.addListenerOnce(gmap, "idle", () => {
            if (gmap.getZoom() > 16) gmap.setZoom(16);
          });
        } else {
          gmap.setCenter(pos);
          gmap.setZoom(13);
        }
      }
      done && done(true);
    },
    () => {
      /* No toast here. This runs for the launch fix and the map-tab fix too, and a failure you
       did not ask for must not talk to you. The button owns the message, because the button
       is the only path you started. */
      done && done(false);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

/* A fix can take the full 8s, so the button has to say it is working or the tap reads as
   dead. Refused or failed goes back to idle and lets the existing toast do the talking. */
function locate() {
  if (!navigator.geolocation) {
    toast("Location not available");
    return;
  }
  if ($("btn-locate") && $("btn-locate").dataset.state === "busy") return;
  setLocateState("busy");
  /* forced: the dropdown used to make this button stop re-centering */
  showUserLocation(
    true,
    function (ok) {
      setLocateState(ok ? "on" : "idle");
      if (!ok) toast("Couldn't get your location");
    },
    true
  );
}
/* The launch fix is silent and always has been. It now reports to the button as well, so a
   dot on the map and a hollow button can never disagree. */
/* Nothing in the app may raise the browser's location prompt on its own — only the button
   does, because you pressed it. This runs the callback only when permission is ALREADY
   granted, where reading the position raises no prompt at all.

   "Can't tell" counts as no. If the Permissions API is missing (older iOS Safari is the one
   that matters) or the query throws, we do not know whether asking would prompt, so we do
   not ask. The cost is that distance sorting in the list stays idle until you press the
   button once — the whole point is that the choice is yours to make. */
function ifLocationAlreadyAllowed(cb) {
  if (!navigator.geolocation) return;
  if (!(navigator.permissions && navigator.permissions.query)) return;
  let q;
  try {
    q = navigator.permissions.query({ name: "geolocation" });
  } catch (e) {
    warn("map.js", e);
    return;
  }
  if (!q || !q.then) return;
  q.then(function (r) {
    if (r && r.state === "granted") cb();
  }).catch(function (e) {
    warn("map.js", e);
  });
}

/* Silent on launch, and silent about failing — no toast, because you did not ask for this. */
function autoLocate() {
  ifLocationAlreadyAllowed(function () {
    showUserLocation(true, function (ok) {
      if (ok) setLocateState("on");
    });
  });
}
