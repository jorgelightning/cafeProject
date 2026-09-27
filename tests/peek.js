/* A pin on a phone, without leaving the map.

   Tapping a pin used to swap the whole screen for the cafe page, so looking at five pins was
   five trips there and back — and each return re-centred the map on you. A pin now slides up
   a card over the map, and the map stays put. The laptop is unchanged: there the page already
   opens in the side panel beside the map. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();

  const open = async (w, h) => {
    const ctx = await b.newContext({ viewport: { width: w, height: h } });
    const pg = await ctx.newPage();
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    const errs = []; pg.on("pageerror", e => errs.push(String(e)));
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(700);
    /* the same Maps stub tests/locate.js uses: the real key is referrer-locked */
    await pg.evaluate(() => {
      window.google = { maps: {
        Map: function(){ this._l = {};
          this.addListener = (ev, fn) => { this._l[ev] = fn; window.__mapListeners = this._l; };
          this.setCenter = p => { window.__center = p; }; this.setZoom = () => {};
          this.getZoom = () => 12; this.fitBounds = () => { window.__fitted = true; }; },
        Marker: function(o){ this.o = o; this.addListener = function(){}; this.setMap = () => {};
                             this.getPosition = () => o.position; },
        Circle: function(){ this.setMap = () => {}; },
        LatLngBounds: function(){ this.extend = () => {}; },
        SymbolPath: { CIRCLE: "circle" },
        event: { trigger: function(){}, addListenerOnce: function(){} },
        places: { Autocomplete: function(){ this.addListener = function(){}; this.getPlace = () => ({}); } }
      } };
      google.maps.Marker.MAX_ZINDEX = 1000;
      navigator.geolocation.getCurrentPosition = () => {};
      isAdmin = false; applyMode();
      cafes = [
        { id: "k", name: "Kissaten HiFi", area: "San Francisco, CA", lat: 37.776, lng: -122.42,
          rating: 4, elo: 1600, matches: 13,
          drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01" }, { date: "2026-09-10" }] }] },
        { id: "z", name: "Zen Gelato & Bar", area: "Honolulu", lat: 21.28, lng: -157.8,
          rating: 5, elo: 1700, matches: 11, drinks: [] },
        { id: "w", name: "cowdog", area: "Kitsilano", lat: 49.27, lng: -123.16, wish: true, drinks: [] }
      ];
      gReady = true; gmap = null; mapOwned = false; initMap(); show("map");
    });
    return { ctx, pg, errs };
  };

  // ================= phone =================
  const ph = await open(390, 844);
  let r = await ph.pg.evaluate(() => {
    const c = cafes.find(x => x.id === "k");
    onMarkerClick(c, null);
    const el = document.getElementById("peek");
    const box = el.getBoundingClientRect();
    return { view: app.dataset.view, shown: !el.hidden && box.height > 0,
             name: (el.querySelector(".peekname") || {}).textContent,
             rank: ((el.querySelector(".dranktile b") || {}).textContent || ""),
             judge: ((el.querySelector(".bkpill") || {}).textContent || "").trim(),
             order: ((el.querySelector(".peekorder") || {}).textContent || ""),
             buttons: [...el.querySelectorAll("button")].map(b => b.textContent.trim()),
             tall: [...el.querySelectorAll("button")].every(b => b.getBoundingClientRect().height >= 44),
             owned: mapOwned,
             lifted: document.querySelector(".mapbox").classList.contains("peeking") };
  });
  eq(r.view, "map", "a pin on a phone keeps you on the map");
  eq(r.shown, true, "…and slides up a card instead");
  eq(r.name, "Kissaten HiFi", "the card names the cafe");
  eq(/^#\d+$/.test(r.rank), true, "…leads with its position (" + r.rank + ")");
  eq(r.judge, "Loved it", "…says how it was");
  eq(r.order, "Order the Hojicha latte · 2×", "…and what to order there");
  eq(r.buttons, ["Directions", "Open cafe"], "two ways on: go there, or read more");
  eq(r.tall, true, "…both clear the 44px touch floor");
  eq(r.owned, true, "tapping a pin counts as choosing this view, so the map will not re-centre");
  eq(r.lifted, true, "the locate button lifts above the card instead of hiding under it");

  r = await ph.pg.evaluate(() => {
    const url = directionsUrl(cafes.find(x => x.id === "k"));
    return { url };
  });
  eq(r.url, "https://www.google.com/maps/dir/?api=1&destination=37.776,-122.42",
     "Directions goes to the same place the cafe page's button does");

  /* another pin swaps the card; the map never leaves */
  r = await ph.pg.evaluate(() => {
    onMarkerClick(cafes.find(x => x.id === "w"), null);
    const el = document.getElementById("peek");
    return { name: el.querySelector(".peekname").textContent,
             judge: el.querySelector(".bkpill").textContent.trim(),
             rank: !!el.querySelector(".dranktile"), order: !!el.querySelector(".peekorder"),
             view: app.dataset.view };
  });
  eq(r.name, "cowdog", "tapping the next pin swaps the card in place");
  eq(r.judge, "Want to try", "a place you have not been says so");
  eq([r.rank, r.order], [false, false], "…with no position and no order, since neither exists yet");

  /* three ways to put it away, none of which leave the map */
  r = await ph.pg.evaluate(() => {
    const el = document.getElementById("peek");
    window.__mapListeners.click();
    const byMap = el.hidden;
    onMarkerClick(cafes.find(x => x.id === "k"), null);
    window.dispatchEvent(new PopStateEvent("popstate"));
    const byBack = el.hidden, viewAfterBack = app.dataset.view;
    onMarkerClick(cafes.find(x => x.id === "k"), null);
    peekOpenCafe();
    return { byMap, byBack, viewAfterBack, opened: app.dataset.view, cur: curId, cardGone: el.hidden,
             lifted: document.querySelector(".mapbox").classList.contains("peeking") };
  });
  eq(r.byMap, true, "tapping the map away from a pin closes the card");
  eq([r.byBack, r.viewAfterBack], [true, "map"], "the back button closes the card and stays on the map");
  eq([r.opened, r.cur], ["detail", "k"], "Open cafe goes to the full page for that cafe");
  eq([r.cardGone, r.lifted], [true, false], "…and the card and the lifted button are cleaned up behind it");
  eq(ph.errs, [], "no page errors on the phone");
  await ph.ctx.close();

  // ================= laptop =================
  const lap = await open(1440, 900);
  r = await lap.pg.evaluate(() => {
    onMarkerClick(cafes.find(x => x.id === "k"), null);
    return { view: app.dataset.view, cur: curId, peek: !document.getElementById("peek").hidden };
  });
  eq(r, { view: "detail", cur: "k", peek: false },
     "on a laptop a pin still opens the page — it sits beside the map there already");
  eq(lap.errs, [], "no page errors on the laptop");
  await lap.ctx.close();

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
