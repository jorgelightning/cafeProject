/* Want-to-try cafes you can find on the map.

   They were a 20px pale-blue ring at a quarter-strength fill, with no white edge, drawn under
   every visited pin and folded into the same orange clusters — 2.0–3.0:1 against the map, in
   the same blue as water and the you-are-here dot. De Matcha, 130m from 8 Grams Matcha,
   simply vanished. Three changes, pinned here:
     A. a violet pin with a white edge and a bookmark, the size of a visited one
     B. above the cluster bubbles and never clustered
     C. a Want to try switch on the map, which the Want tab's map button turns on */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();

  const open = async (w, h, scheme) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme || "light" });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(600);
    await pg.evaluate(() => {
      /* a fake Maps that keeps what the app asks of it */
      window.__fits = 0;
      const inView = { minLat: 37.85, maxLat: 37.88, minLng: -122.28, maxLng: -122.25 };   // Berkeley
      window.google = { maps: {
        Map: function(){ this._l = {}; this.addListener = (ev, fn) => { this._l[ev] = fn; window.__mapL = this._l; };
          this.setCenter = p => { window.__center = p; }; this.setZoom = () => {}; this.getZoom = () => 15;
          this.fitBounds = () => { window.__fits++; };
          this.getBounds = () => ({ contains: p => p.lat >= inView.minLat && p.lat <= inView.maxLat && p.lng >= inView.minLng && p.lng <= inView.maxLng }); },
        Marker: function(o){ this.o = o; this.map = o.map || null; this.addListener = function(){};
          this.setMap = m => { this.map = m; }; this.getPosition = () => o.position; },
        Circle: function(){ this.setMap = () => {}; },
        LatLngBounds: function(){ this.extend = () => {}; },
        Size: function(w, h){ this.width = w; this.height = h; }, Point: function(x, y){ this.x = x; this.y = y; },
        SymbolPath: { CIRCLE: "circle" },
        event: { trigger: function(){}, addListenerOnce: function(){} },
        places: { Autocomplete: function(){ this.addListener = function(){}; this.getPlace = () => ({}); } }
      } };
      google.maps.Marker.MAX_ZINDEX = 1000;
      window.markerClusterer = { MarkerClusterer: function(o){ window.__clustered = o.markers.slice();
        o.markers.forEach(m => m.setMap(o.map)); this.clearMarkers = () => { o.markers.forEach(m => m.setMap(null)); }; this.setMap = () => {}; } };
      navigator.geolocation.getCurrentPosition = () => {};
      isAdmin = false; applyMode();
      /* the real Berkeley six, plus one want-to-try far away */
      cafes = [
        { id: "cha", name: "ChaHalo", lat: 37.87214, lng: -122.26962, rating: 4, drinks: [] },
        { id: "8g", name: "8 Grams Matcha", lat: 37.86832, lng: -122.26044, rating: 5, drinks: [] },
        { id: "pk", name: "Purple Kow", lat: 37.87026, lng: -122.26618, rating: 1, drinks: [] },
        { id: "ym", name: "Yume Mori Matcha", area: "Downtown Berkeley", lat: 37.86729, lng: -122.26747, wish: true, drinks: [] },
        { id: "dm", name: "De Matcha", area: "Southside", lat: 37.86833, lng: -122.25895, wish: true, drinks: [] },
        { id: "ft", name: "Forest Tea Bar", area: "South Shattuck", lat: 37.86107, lng: -122.26731, wish: true, drinks: [] },
        { id: "cd", name: "cowdog", area: "Kitsilano", lat: 49.26823, lng: -123.14862, wish: true, drinks: [] }
      ];
      gReady = true; gmap = null; mapWantOnly = false; initMap(); show("map");
    });
    return { ctx, pg, errs };
  };

  // ================= A + B: the pin and its layer =================
  const ph = await open(390, 844);
  let r = await ph.pg.evaluate(() => {
    const by = id => gmarkers.find(m => m.o.title === cafes.find(c => c.id === id).name);
    const w = by("dm").o, v = by("8g").o;
    const svg = decodeURIComponent(String(w.icon.url || "").replace(/^data:image\/svg\+xml;charset=UTF-8,/, ""));
    return { url: /^data:image\/svg\+xml/.test(w.icon.url || ""), violet: svg.toLowerCase().includes("#6b3fbf"), white: /stroke="#ffffff"/.test(svg),
             bookmark: /<path[^>]*fill="#ffffff"/.test(svg), size: [w.icon.scaledSize && w.icon.scaledSize.width, w.icon.anchor && w.icon.anchor.x],
             visited: v.icon.path === "circle" && v.icon.scale === 12, wz: w.zIndex, vz: v.zIndex,
             clustered: (window.__clustered || []).map(m => m.o.title).sort(),
             wishOnMap: gmarkers.filter(m => m._wish).every(m => m.map === gmap) };
  });
  eq([r.url, r.violet, r.white, r.bookmark], [true, true, true, true],
     "a want-to-try pin is violet, white-edged, with a white bookmark — readable without its colour");
  eq(r.size, [30, 15], "…the size of a visited pin (30px box, centred on the spot)");
  eq(r.visited, true, "visited pins are untouched");
  eq(r.wz > 1000 + 100 && r.wz < 1000 + 1000, true, "it sits above every cluster bubble and below the you-are-here dot (z " + r.wz + ")");
  eq(r.wz > r.vz, true, "…and above visited pins, so De Matcha is no longer under 8 Grams Matcha");
  eq(r.clustered, ["8 Grams Matcha", "ChaHalo", "Purple Kow"], "only visited pins go into clusters");
  eq(r.wishOnMap, true, "every want-to-try pin is on the map in its own right");

  r = await ph.pg.evaluate(() => {
    const lg = [...document.querySelectorAll(".maplegend span")].find(s => /want to try/.test(s.textContent));
    return { legend: !!(lg && lg.querySelector("svg.wl")), fill: lg ? getComputedStyle(lg.querySelector("svg.wl circle")).fill : "" };
  });
  eq([r.legend, r.fill], [true, "rgb(107, 63, 191)"], "the legend shows the same violet bookmark");

  // ================= C: the switch =================
  /* a phone shows one pill; the switch, the picker, the gear and the legend are behind it */
  r = await ph.pg.evaluate(() => {
    const pill = document.getElementById("map-pill").getBoundingClientRect();
    return { closed: document.getElementById("btn-want").getBoundingClientRect().height === 0,
             pill: pill.height >= 44, legendOut: document.querySelector(".maplegend").getBoundingClientRect().height === 0 };
  });
  eq(r, { closed: true, pill: true, legendOut: true }, "closed, the map shows one 44px pill and no floating switch or legend");
  r = await ph.pg.evaluate(() => {
    toggleMapPanel();
    const leg = document.querySelector(".panelegend").getBoundingClientRect();
    return { legend: leg.height > 0 };
  });
  eq(r.legend, true, "…and the legend is in the panel it opens");
  r = await ph.pg.evaluate(() => {
    const chip = document.getElementById("btn-want"), box = chip.getBoundingClientRect();
    const row = document.querySelector(".mapsearch").getBoundingClientRect();
    const gear = document.querySelector(".mapsearch .setdoor").getBoundingClientRect();
    return { shown: !chip.hidden && box.height > 0, n: document.getElementById("want-n").textContent, pressed: chip.getAttribute("aria-pressed"),
             tall: box.height >= 44, fits: row.right <= 390 - 11 && gear.right <= 390 - 11 && gear.width >= 44,
             bar: document.getElementById("wantbar").hidden };
  });
  eq([r.shown, r.n, r.pressed], [true, "4", "false"], "the switch is on the map, counting the 4 want-to-try places");
  eq([r.tall, r.fits], [true, true], "…44px tall, and on a phone the row still fits with the gear on screen");
  eq(r.bar, true, "no status bar while it is off");

  r = await ph.pg.evaluate(() => {
    window.__fits = 0;
    onMarkerClick(cafes.find(c => c.id === "8g"), null);           // a visited card is up
    document.getElementById("btn-want").click();
    const shown = gmarkers.filter(m => m.map === gmap).map(m => m.o.title).sort();
    return { shown, pressed: document.getElementById("btn-want").getAttribute("aria-pressed"),
             bar: document.getElementById("wantbar").hidden ? "" : document.getElementById("wantbar-text").textContent,
             fits: window.__fits, peek: peekOpen(), owned: mapOwned };
  });
  eq(r.shown, ["De Matcha", "Forest Tea Bar", "Yume Mori Matcha", "cowdog"], "switched on, only want-to-try pins are left");
  eq(r.pressed, "true", "…the switch says so");
  eq(r.bar, "Only want to try · 3 here, 4 in all", "…and the bar counts what is in view and in all");
  eq(r.fits, 0, "with some in view the map stays where it is — no zooming out to Vancouver");
  eq(r.peek, false, "a card for a visited pin that just disappeared is put away");
  eq(r.owned, true, "the view is yours, so nothing re-centres it");

  r = await ph.pg.evaluate(() => {
    onMarkerClick(cafes.find(c => c.id === "ft"), null);
    const pill = document.querySelector("#peek .bkpill");
    return { peek: peekOpen(), pill: pill ? pill.textContent.trim() : "", cls: pill ? pill.className : "",
             dot: pill ? getComputedStyle(pill.querySelector("i")).backgroundColor : "" };
  });
  eq([r.peek, r.pill], [true, "Want to try"], "tapping a want-to-try pin still opens its card");
  eq(r.dot, "rgb(107, 63, 191)", "…with the pill in the same violet");

  r = await ph.pg.evaluate(() => {
    document.querySelector("#wantbar button").click();
    return { shown: gmarkers.filter(m => m.map === gmap).length, pressed: document.getElementById("btn-want").getAttribute("aria-pressed"),
             bar: document.getElementById("wantbar").hidden, wishTop: gmarkers.filter(m => m._wish).every(m => m.map === gmap) };
  });
  eq([r.shown, r.pressed, r.bar, r.wishTop], [7, "false", true, true], "Show all puts every pin back");

  /* switched on with none in view, it takes you to them */
  r = await ph.pg.evaluate(() => {
    window.__fits = 0;
    const real = gmap.getBounds; gmap.getBounds = () => ({ contains: () => false });
    toggleWantOnly(true);
    const fits = window.__fits; gmap.getBounds = real; toggleWantOnly(false);
    return fits;
  });
  eq(r, 1, "switched on with none in view, the map moves to the want-to-try places");

  /* the Want tab's map button */
  r = await ph.pg.evaluate(() => {
    setListTab("want"); show("list"); showFilteredOnMap();
    const fromWant = { view: app.dataset.view, on: mapWantOnly };
    setListTab("been"); show("list"); showFilteredOnMap();
    return { fromWant, fromBeen: mapWantOnly };
  });
  eq(r.fromWant, { view: "map", on: true }, "the Want tab's map button opens the map with the switch on");
  eq(r.fromBeen, false, "…and the Been tab's turns it off");

  /* no want-to-try places: no switch */
  r = await ph.pg.evaluate(() => {
    cafes = cafes.filter(c => !c.wish); renderMarkers();
    return { hidden: document.getElementById("btn-want").hidden, on: mapWantOnly };
  });
  eq(r, { hidden: true, on: false }, "with nothing on the wishlist the switch is not shown");

  r = await ph.pg.evaluate(() => {
    const L = c => { const m = (c.match(/[\d.]+/g) || [0,0,0]).slice(0,3).map(v => { v = v/255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*m[0] + .7152*m[1] + .0722*m[2]; };
    const cr = (a, b) => { const x = L(a), y = L(b); return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2); };
    const bar = getComputedStyle(document.getElementById("wantbar")), btn = getComputedStyle(document.querySelector("#wantbar button"));
    return { barText: cr(bar.color, "rgb(29,26,23)"), barBtn: cr(btn.color, "rgb(29,26,23)") };
  });
  eq(r.barText >= 4.5 && r.barBtn >= 4.5, true, "the bar's text and its button read clearly (" + r.barText + ", " + r.barBtn + ":1)");
  eq(ph.errs, [], "no page errors on the phone");
  await ph.ctx.close();

  /* the pressed switch, in both themes */
  for (const scheme of ["light", "dark"]) {
    const t = await open(390, 844, scheme);
    r = await t.pg.evaluate(() => {
      toggleWantOnly(true);
      const L = c => { const m = (c.match(/[\d.]+/g) || [0,0,0]).slice(0,3).map(v => { v = v/255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*m[0] + .7152*m[1] + .0722*m[2]; };
      const cr = (a, b) => { const x = L(a), y = L(b); return +((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2); };
      const chip = getComputedStyle(document.getElementById("btn-want"));
      /* Solid, not see-through: the chip floats over Google's map, which stays light in
         dark mode, so a translucent fill would be judged against the wrong ground. (A
         rgba fill once read 1.3:1 here while passing against the dark page.) */
      return { opaque: !/rgba\(.*,\s*0?\.\d+\)$/.test(chip.backgroundColor), ratio: cr(chip.color, chip.backgroundColor) };
    });
    eq(r.opaque, true, "the pressed switch has a solid fill in " + scheme + ", so the map under it cannot wash it out");
    eq(r.ratio >= 4.5, true, "…and reads clearly (" + r.ratio + ":1)");
    eq(t.errs, [], "no page errors in " + scheme);
    await t.ctx.close();
  }

  // ================= laptop =================
  const lap = await open(1440, 900);
  r = await lap.pg.evaluate(() => {
    const chip = document.getElementById("btn-want").getBoundingClientRect(), sel = document.getElementById("locsel").getBoundingClientRect();
    const side = document.querySelector(".sidebar").getBoundingClientRect();
    toggleWantOnly(true);
    const bar = document.getElementById("wantbar").getBoundingClientRect();
    return { beside: chip.left >= sel.right, clear: chip.left > side.right && bar.left > side.right, shown: chip.height >= 44 };
  });
  eq(r, { beside: true, clear: true, shown: true }, "on a laptop the switch sits beside the place picker, clear of the side panel");
  eq(lap.errs, [], "no page errors on the laptop");
  await lap.ctx.close();

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
