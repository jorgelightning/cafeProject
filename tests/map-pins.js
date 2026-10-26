/* Pins that scale with the zoom, and a legend that folds into a ?.

   A pin was one 24px disc at every zoom, which at street level hid the street and said nothing about
   which cafe it was. Zoomed out a pin is a small dot, in between a larger one, and close in a pill with
   the cafe's emoji and name. A pill that would cover another gives way to the better-ranked cafe, the
   picked cafe always keeps its label, and want-to-try pins are never touched. The four-dot legend is
   a ? on the laptop. Google needs literal colour strings, so every colour here is a hex. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(800);

  await pg.evaluate(() => {
    window.__zoom = 12;
    window.google = { maps: {
      Map: function () {
        this.addListener = () => {}; this.setCenter = () => {}; this.setZoom = () => {};
        this.getZoom = () => window.__zoom; this.fitBounds = () => {}; this.getBounds = () => null;
        this.getProjection = () => ({ fromLatLngToPoint: p => ({
          x: (p.lng + 180) / 360 * 256,
          y: (1 - Math.log(Math.tan(p.lat * Math.PI / 180) + 1 / Math.cos(p.lat * Math.PI / 180)) / Math.PI) / 2 * 256 }) });
      },
      Marker: function (o) { this.o = o; this.addListener = function () {}; this.setMap = () => {}; this.getPosition = () => o.position;
                             this.setIcon = i => { o.icon = i; }; this.setZIndex = z => { o.zIndex = z; }; },
      Circle: function () { this.setMap = () => {}; },
      LatLngBounds: function () { this.extend = () => {}; },
      SymbolPath: { CIRCLE: "circle" }, Size: function (w, h) { this.width = w; this.height = h; }, Point: function (x, y) { this.x = x; this.y = y; },
      event: { trigger: function () {}, addListenerOnce: function () {} },
      places: { Autocomplete: function () { this.addListener = function () {}; this.getPlace = () => ({}); } }
    } };
    google.maps.Marker.MAX_ZINDEX = 1000;
    window.markerClusterer = undefined;
    navigator.geolocation.getCurrentPosition = () => {};
    isAdmin = false; applyMode();
    cafes = [
      { id: "a", name: "Kissaten HiFi", emoji: "🍵", area: "SF", lat: 37.776, lng: -122.42, rating: 5, fav: true, elo: 1800, matches: 6, drinks: [] },
      { id: "b", name: "Next Door Cafe", emoji: "☕", area: "SF", lat: 37.77601, lng: -122.42001, rating: 4, elo: 1500, matches: 4, drinks: [] },
      { id: "c", name: "Far Away", area: "Honolulu", lat: 21.28, lng: -157.8, rating: 3, elo: 1400, matches: 3, drinks: [] },
      { id: "w", name: "Someday", area: "Vancouver", lat: 49.27, lng: -123.16, wish: true, drinks: [] }
    ];
    gReady = true; gmap = null; mapOwned = false; initMap(); show("map");
  });

  const state = z => pg.evaluate(zz => {
    window.__zoom = zz; _selPin = null; gmarkers.forEach(m => { m._mode = null; }); refreshPinIcons();
    const by = id => gmarkers.find(m => m._id === id || (!m._id && m.o.title === "Someday")).o;
    const kind = o => o.icon.url ? "pill" : "dot" + o.icon.scale;
    const w = gmarkers.find(m => m._wish).o;
    return { a: kind(by("a")), b: kind(by("b")), c: kind(by("c")), wish: w.icon.url ? "svg" + w.icon.scaledSize.width : "other", wz: w.zIndex };
  }, z);

  /* thresholds moved in the UI audit (26 Oct): larger dots from 11.5, names from 13 */
  let r = await state(10);
  eq(r.wish, "svg20", "zoomed out a want-to-try pin is the small dot too (20px with its edge)");
  eq([r.a, r.b, r.c], ["dot8", "dot6", "dot6"], "zoomed out every cafe is a small dot, a favourite a little larger");
  r = await state(12);
  eq(r.wish, "svg26", "in between it is the larger dot, 26px, violet with its bookmark");
  eq([r.a, r.b, r.c], ["dot11", "dot9", "dot9"], "in between they are larger dots");
  r = await state(16);
  eq([r.a, r.c], ["pill", "pill"], "close in, a pill carries the cafe's name");
  eq(r.b, "dot9", "…but one that would cover the better-ranked cafe next to it gives way to a dot");
  eq(/^svg1\d\d$/.test(r.wish), true, "close in a want-to-try pin is a pill too, sized to its name (" + r.wish + ")");
  eq(r.wz > 1000 + 100, true, "…and still sits above the cluster bubbles (z " + r.wz + ")");

  const pill = await pg.evaluate(() => {
    window.__zoom = 16; gmarkers.forEach(m => { m._mode = null; }); refreshPinIcons();
    const o = gmarkers.find(m => m._id === "a").o;
    const svg = decodeURIComponent(o.icon.url.replace(/^data:image\/svg\+xml;charset=UTF-8,/, ""));
    return { svg, z: o.zIndex, w: o.icon.scaledSize.width };
  });
  eq(/KISSATEN HIFI/.test(pill.svg), true, "the pill reads the name in capitals");
  eq(/#2e9e5b/.test(pill.svg) && /#e0556b/.test(pill.svg), true, "…with the verdict colour, and the favourite's pink edge, as literal hex");
  eq(/🍵/.test(pill.svg), true, "…and the cafe's own emoji");
  eq(pill.w > 120, true, "…sized to the text (" + pill.w + "px)");

  const pick = await pg.evaluate(() => {
    window.__zoom = 10; gmarkers.forEach(m => { m._mode = null; }); refreshPinIcons();
    selectPin("c");
    const o = gmarkers.find(m => m._id === "c").o;
    const sel = { pill: !!o.icon.url, ring: /#1d1a17/.test(decodeURIComponent(o.icon.url || "")), z: o.zIndex };
    selectPin(null);
    return { sel, after: gmarkers.find(m => m._id === "c").o.icon.scale };
  });
  eq([pick.sel.pill, pick.sel.ring, pick.sel.z], [true, true, 10], "the picked cafe is a pill with a dark ring, on top, at any zoom");
  eq(pick.after, 6, "…and goes back to a dot when nothing is picked");

  // ---- the legend ----
  const lg = await pg.evaluate(() => {
    const box = document.querySelector(".mapbox"), q = document.getElementById("btn-legend"), leg = document.getElementById("map-legend");
    const shown = () => getComputedStyle(leg).display !== "none";
    const before = { help: q.getBoundingClientRect().height, legend: shown(), expanded: q.getAttribute("aria-expanded") };
    toggleLegend();
    const open = { legend: shown(), expanded: q.getAttribute("aria-expanded"), state: box.dataset.legend };
    toggleLegend(false);
    return { before, open, closed: shown() };
  });
  eq(lg.before, { help: 44, legend: false, expanded: "false" }, "on a laptop the legend is a 44px ? and the four dots are put away");
  eq(lg.open, { legend: true, expanded: "true", state: "open" }, "the ? opens it and says so");
  eq(lg.closed, false, "…and it closes again");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
