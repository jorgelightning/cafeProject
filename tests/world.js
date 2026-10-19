/* The World view.

   "All locations" fitted every pin. Pins run from Sydney to Vancouver, so that was the whole globe:
   113 dots over open water, and on a phone a map smaller than the screen with grey around it. Now
   the world is drawn as one numbered bubble per region with a list under it, the map can never
   zoom out past the screen, and picking a region (or the dropdown) brings the pins back.

   The stand-in Maps records what the app asks of it: constructor options, markers, and the points
   every fitBounds was given. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();

  const open = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
    const errs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(600);
    await pg.evaluate(() => {
      window.__fits = [];
      window.google = {
        maps: {
          Map: function (el, o) {
            window.__mapOpts = o;
            this.addListener = () => {};
            this.setCenter = p => (window.__center = p);
            this.setZoom = z => (window.__zoom = z);
            this.getZoom = () => 12;
            this.setOptions = o2 => Object.assign(window.__mapOpts, o2);
            this.fitBounds = bnd => window.__fits.push(bnd.pts.slice());
            this.getBounds = () => ({ contains: () => true });
          },
          Marker: function (o) {
            this.o = o;
            this.map = o.map || null;
            this.addListener = (ev, fn) => (this.click = fn);
            this.setMap = m => (this.map = m);
            this.getPosition = () => o.position;
          },
          Circle: function () {
            this.setMap = () => {};
          },
          LatLngBounds: function () {
            this.pts = [];
            this.extend = p => this.pts.push(p);
          },
          Size: function (w, h) {
            this.width = w;
            this.height = h;
          },
          Point: function (x, y) {
            this.x = x;
            this.y = y;
          },
          SymbolPath: { CIRCLE: "circle" },
          event: { trigger() {}, addListenerOnce() {} },
          places: {
            Autocomplete: function () {
              this.addListener = () => {};
              this.getPlace = () => ({});
            },
          },
        },
      };
      google.maps.Marker.MAX_ZINDEX = 1000;
      window.markerClusterer = undefined;
      navigator.geolocation.getCurrentPosition = () => {};
      isAdmin = false;
      applyMode();
    });
    return { ctx, pg, errs };
  };

  /* seven regions' worth of the real shapes: Bay Area, Honolulu, Vancouver (inside the old US box),
     Seattle, Sydney, Taipei */
  const load = (pg, only) =>
    pg.evaluate(only => {
      const mk = (id, name, area, lat, lng, rating, extra) =>
        Object.assign({ id, name, area, lat, lng, rating, drinks: [] }, extra || {});
      const all = [
        mk("c1", "SF A", "San Francisco, CA", 37.77, -122.42, 5),
        mk("c2", "SF B", "San Francisco, CA", 37.78, -122.41, 5),
        mk("c3", "Berk", "Berkeley, CA", 37.87, -122.27, 4),
        mk("c4", "Oak", "Oakland, CA", 37.8, -122.27, 3),
        mk("c5", "SJ", "San Jose, CA", 37.33, -121.89, 1),
        mk("c6", "SF wish", "San Francisco, CA", 37.76, -122.43, 0, { wish: true }),
        mk("h1", "Hon A", "Honolulu", 21.3, -157.85, 5),
        mk("h2", "Hon B", "Honolulu", 21.28, -157.8, 4),
        mk("v1", "Kits", "Kitsilano", 49.27, -123.16, 5),
        mk("v2", "Main St", "South Main", 49.26, -123.1, 3),
        mk("v3", "Van wish", "Gastown", 49.28, -123.11, 0, { wish: true }),
        /* no ", WA" in the text: the state has to come from where it is */
        mk("s1", "Seattle", "Downtown Seattle", 47.61, -122.33, 4),
        mk("a1", "Sydney", "Surry Hills", -33.88, 151.21, 5),
        mk("t1", "Taipei", "Da'an", 25.03, 121.54, 5),
      ];
      cafes = only ? all.filter(c => c.lat > 37 && c.lat < 38) : all;
      window.__fits = [];
      mapWorld = null;
      _focusVal = null;
      mapWantOnly = false;
      gReady = true;
      gmap = null;
      gmarkers = [];
      initMap();
      show("map");
      return true;
    }, only || false);

  // ================= phone =================
  const ph = await open(390, 844);
  await load(ph.pg);

  let r = await ph.pg.evaluate(() => ({
    min: window.__mapOpts.minZoom,
    bg: window.__mapOpts.backgroundColor,
    restrict: window.__mapOpts.restriction && window.__mapOpts.restriction.latLngBounds,
  }));
  eq(r.min >= 2, true, "the map cannot zoom out past the screen (minZoom " + r.min + ")");
  eq(r.bg, "#aad3df", "its own background is the ocean's colour, so an unloaded tile is blue rather than grey");
  eq([r.restrict.north, r.restrict.south], [85, -85], "the poles are never shown");

  r = await ph.pg.evaluate(() => {
    const f = window.__fits[window.__fits.length - 1] || [];
    return {
      worldOn: _worldOn(),
      sheet: document.getElementById("worldsheet").hidden,
      bubbles: gworld.length,
      pins: gmarkers.filter(m => m.map).length,
      fitLat: f.map(p => Math.round(p.lat)),
    };
  });
  eq([r.worldOn, r.sheet, r.bubbles], [false, true, 0], "pins spread across the world do not open the World view: it is something you ask for");
  eq(r.pins, 14, "every pin is still on the map");
  eq(r.fitLat.every(l => l >= 37 && l <= 38), true, "the map opens on the region with the most pins (the Bay Area), not the globe");

  r = await ph.pg.evaluate(() => {
    userLoc = { lat: 49.27, lng: -123.12 };
    window.__fits = [];
    renderMarkers();
    const f = window.__fits[window.__fits.length - 1] || [];
    const out = f.map(p => Math.round(p.lat));
    userLoc = { lat: 0, lng: -30 };
    window.__fits = [];
    renderMarkers();
    const far = (window.__fits[window.__fits.length - 1] || []).map(p => Math.round(p.lat));
    userLoc = null;
    return { near: out, far };
  });
  eq(r.near.every(l => l === 49 || l === 50), true, "standing in Vancouver, it opens on Vancouver");
  eq(r.far.every(l => l >= 37 && l <= 38), true, "standing nowhere near a cafe, it falls back to the biggest region");

  // ---- ask for the world ----
  await ph.pg.evaluate(() => {
    jumpToLocation("");
  });
  await ph.pg.waitForTimeout(60);
  r = await ph.pg.evaluate(() => ({
    worldOn: _worldOn(),
    sheet: !document.getElementById("worldsheet").hidden,
    box: document.querySelector(".mapbox").classList.contains("worlding"),
    rows: [...document.querySelectorAll("#worldsheet .wrow")].map(x => x.querySelector("b").textContent + " " + x.querySelector(".wn").textContent),
    head: document.querySelector("#worldsheet .whead").textContent,
  }));
  eq([r.worldOn, r.sheet, r.box], [true, true, true], "choosing World opens the World view");
  eq(
    r.rows,
    ["California 6", "Canada 3", "Hawaii 2", "Australia 1", "Taiwan 1", "Washington 1"],
    "one row per region, biggest first: US states by name, other places by country — and Vancouver is Canada, not the United States"
  );
  eq(r.head, "Where you have been · 14 places", "the list says how many it is counting");

  r = await ph.pg.evaluate(() => ({
    bubbles: gworld.length,
    pinsOnMap: gmarkers.filter(m => m.map).length,
    onMap: gworld.every(m => m.map === gmap),
    counts: gworld.map(m => decodeURIComponent(m.o.icon.url).replace(/.*>(\d+)<\/text>.*/, "$1")),
    title: gworld[0].o.title,
    fit: window.__fits[window.__fits.length - 1].length,
  }));
  eq([r.bubbles, r.pinsOnMap, r.onMap], [6, 0, true], "six bubbles on the map and none of the 14 individual pins");
  eq(r.counts, ["6", "3", "2", "1", "1", "1"], "each bubble carries its count");
  eq(r.title, "California · 6 places", "…and a name for anyone who cannot see the number");
  eq(r.fit, 6, "the view is fitted to the bubbles, not to every pin");

  r = await ph.pg.evaluate(() => {
    const sh = document.getElementById("worldsheet").getBoundingClientRect(),
      map = document.getElementById("map").getBoundingClientRect(),
      loc = document.getElementById("btn-locate").getBoundingClientRect();
    const rowH = Math.min(...[...document.querySelectorAll("#worldsheet .wrow")].map(x => x.getBoundingClientRect().height));
    return { tall: sh.height <= map.height * 0.47 + 1, locAbove: loc.bottom <= sh.top, rowH, w: sh.width, over: document.documentElement.scrollWidth - innerWidth };
  });
  eq([r.tall, r.locAbove, r.rowH >= 44, r.over <= 0], [true, true, true, true], "the sheet takes under half the map, the locate button stays above it, rows are 44px+, nothing overflows");

  // ---- a row takes you there ----
  r = await ph.pg.evaluate(() => {
    const idx = [...document.querySelectorAll("#worldsheet .wrow")].findIndex(x => /Hawaii/.test(x.textContent));
    window.__fits = [];
    document.querySelectorAll("#worldsheet .wrow")[idx].click();
    return new Promise(res =>
      setTimeout(() => {
        const f = window.__fits[window.__fits.length - 1] || [];
        res({
          world: _worldOn(),
          sheet: document.getElementById("worldsheet").hidden,
          bubbles: gworld.length,
          pins: gmarkers.filter(m => m.map).length,
          fitLat: f.map(p => Math.round(p.lat)),
        });
      }, 60)
    );
  });
  eq([r.world, r.sheet, r.bubbles], [false, true, 0], "tapping Hawaii leaves the World view and clears the bubbles");
  eq(r.pins, 14, "…the pins are back");
  eq(r.fitLat, [21, 21], "…and the map goes to Hawaii's two pins, not the world");

  r = await ph.pg.evaluate(() => {
    window.__fits = [];
    renderMarkers(); /* what a cloud update does */
    const f = window.__fits[window.__fits.length - 1] || [];
    return { world: _worldOn(), lat: f.map(p => Math.round(p.lat)) };
  });
  /* picking a region places the map, so a redraw leaves it on Hawaii without fitting anything again */
  eq(r, { world: false, lat: [] }, "an update that redraws the pins keeps you in Hawaii instead of zooming back out to the world");

  // ---- the dropdown ----
  r = await ph.pg.evaluate(() => {
    const sel = document.getElementById("locsel");
    return { first: sel.options[0].textContent, val: sel.options[0].value };
  });
  eq(r, { first: "World", val: "" }, "the dropdown's first choice is called World");
  r = await ph.pg.evaluate(() => {
    jumpToLocation("");
    return new Promise(res =>
      setTimeout(
        () => res({ world: _worldOn(), sheet: !document.getElementById("worldsheet").hidden, bubbles: gworld.length, pins: gmarkers.filter(m => m.map).length }),
        60
      )
    );
  });
  eq(r, { world: true, sheet: true, bubbles: 6, pins: 0 }, "choosing World from the dropdown brings the bubbles and the list back");

  // ---- want to try ----
  r = await ph.pg.evaluate(() => {
    toggleWantOnly(true);
    const out = {
      rows: [...document.querySelectorAll("#worldsheet .wrow")].map(x => x.querySelector("b").textContent + " " + x.querySelector(".wn").textContent),
      head: document.querySelector("#worldsheet .whead").textContent,
      bubbles: gworld.length,
    };
    toggleWantOnly(false);
    return out;
  });
  eq(r.rows, ["California 1", "Canada 1"], "with Want to try on, the regions count only what you want to try");
  eq(r.head, "Want to try · 2 places", "…and the list says so");

  // ---- everything in one region: nothing changes ----
  await load(ph.pg, true);
  r = await ph.pg.evaluate(() => ({ world: _worldOn(), sheet: document.getElementById("worldsheet").hidden, pins: gmarkers.filter(m => m.map).length }));
  eq(r, { world: false, sheet: true, pins: 6 }, "when every cafe is in one region there is no World view, and the pins show as before");

  eq(ph.errs, [], "no page errors on the phone");
  await ph.ctx.close();

  // ================= laptop =================
  const lap = await open(1440, 900);
  await load(lap.pg);
  await lap.pg.evaluate(() => jumpToLocation(""));
  await lap.pg.waitForTimeout(60);
  r = await lap.pg.evaluate(() => {
    const sh = document.getElementById("worldsheet").getBoundingClientRect(),
      side = document.querySelector(".sidebar").getBoundingClientRect();
    return { clear: sh.left > side.right, narrow: sh.width <= 381, shown: sh.height > 0, min: window.__mapOpts.minZoom };
  });
  eq([r.clear, r.narrow, r.shown], [true, true, true], "on a laptop the list sits on the map, clear of the side panel");
  eq(r.min >= 2, true, "…and the zoom floor holds there too (" + r.min + ")");
  eq(lap.errs, [], "no page errors on the laptop");
  await lap.ctx.close();

  const ok = done();
  await b.close();
  srv.close();
  process.exit(ok ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
