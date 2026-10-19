/* A shared link opens the map on its cafe, and the map stays put.

   Opening ?cafe=<id> showed the cafe, but the map behind it (and the one you go back to) framed the whole list, and
   a moment later reframed again when the cloud's copy arrived: drawing the pins moved the map on every cloud update,
   favourite and save. Now a shared cafe centres the map with its pin picked, and redrawing the pins only frames a
   map that nobody has placed. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));

  /* a real id from the published data, so the boot path is the one a friend's phone takes */
  const sharedId = require("fs").readFileSync(require("path").join(__dirname, "..", "cafes.json"), "utf8");
  const real = JSON.parse(sharedId).find(c => !c.wish && !c.custom && c.lat != null);
  await pg.goto(srv.origin + "/index.html?cafe=" + real.id, { waitUntil: "load" });
  await ready(pg);
  await pg.waitForTimeout(1200);
  const boot = await pg.evaluate(() => ({ pending: typeof _focusCafeId !== "undefined" ? _focusCafeId : "missing", owned: mapOwned, view: app.dataset.view, cur: curId }));
  eq([boot.pending, boot.owned], [real.id, true], "opening a shared link asks the map to open on that cafe, waiting for Google if it is not there yet");
  eq([boot.view, boot.cur], ["detail", real.id], "…while the cafe's page opens as before");

  /* a stand-in Google map that records every move */
  const stub = () => pg.evaluate(() => {
    window.__moves = [];
    const rec = (k, v) => window.__moves.push(k + ":" + JSON.stringify(v));
    window.google = { maps: {
      Map: function () {
        this.addListener = () => {}; this.setCenter = p => rec("center", [+(+p.lat).toFixed(3), +(+p.lng).toFixed(3)]); this.setZoom = z => rec("zoom", z);
        this.getZoom = () => 12; this.fitBounds = () => rec("fit", 1); this.getBounds = () => null; this.setOptions = () => {};
        this.getProjection = () => null;
      },
      Marker: function (o) { this.o = o; this.addListener = function () {}; this.setMap = () => {}; this.getPosition = () => o.position; this.setIcon = () => {}; this.setZIndex = () => {}; },
      Circle: function () { this.setMap = () => {}; },
      LatLngBounds: function () { this.extend = () => {}; },
      SymbolPath: { CIRCLE: "circle" }, Size: function (w, h) { this.width = w; this.height = h; }, Point: function (x, y) { this.x = x; this.y = y; },
      event: { trigger: function () {}, addListenerOnce: function () {} },
      places: { Autocomplete: function () { this.addListener = function () {}; this.getPlace = () => ({}); } }
    } };
    google.maps.Marker.MAX_ZINDEX = 1000;
    window.markerClusterer = undefined;
    navigator.geolocation.getCurrentPosition = () => {};
  });
  await stub();

  /* Google arrives: the first draw must land on the shared cafe, not frame everything */
  const first = await pg.evaluate(() => { gReady = true; gmap = null; initMap(); return { moves: window.__moves.slice(), sel: _selPin }; });
  eq(first.moves.includes("fit:1"), false, "when the map loads, it does not frame the whole list");
  eq(first.moves.slice(-2), ["center:" + JSON.stringify([+real.lat.toFixed(3), +real.lng.toFixed(3)]), "zoom:15"], "…it centres on the shared cafe, close in");
  eq(first.sel, real.id, "…with its pin picked");

  /* a moment later the cloud's copy arrives and redraws every pin */
  const later = await pg.evaluate(() => { window.__moves = []; repaintFromCloud(); renderMarkers(); return window.__moves.slice(); });
  eq(later, [], "the cloud's update a moment later redraws the pins without moving the map");

  /* the same rule for everyone: drawing pins only frames a map nobody has placed */
  const general = await pg.evaluate(() => {
    _focusCafeId = null; mapOwned = false; window.__moves = []; renderMarkers();
    const untouched = window.__moves.length > 0;
    mapOwned = true; window.__moves = []; renderMarkers();
    const placed = window.__moves.slice();
    return { untouched, placed };
  });
  eq(general.untouched, true, "a map nobody has placed is still framed to the pins on its first draw");
  eq(general.placed, [], "…but once you have moved it, a favourite, a save or a cloud update no longer pulls it back");

  /* a private spot is shown at its blurred pin, zoomed out to match */
  const priv = await pg.evaluate(() => {
    cafes.push({ id: "pv", name: "Friend's Place", custom: true, lat: 21.3, lng: -157.8, area: "", drinks: [] });
    window.__moves = []; focusCafeOnMap("pv"); return window.__moves.slice();
  });
  eq(priv, ["center:[21.3,-157.8]", "zoom:13"], "a shared private spot opens at its blurred pin, zoomed out to match the blur");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
