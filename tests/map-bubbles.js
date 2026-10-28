/* The bubbles you see zoomed out (zoomed-out audit, 28 Oct).

   On the live map the want-to-try bookmarks, drawn above the bubbles so they are never lost, landed on them and covered
   the count: in the California view the Bay Area's 62 showed two bookmarks and no number. The ring was 7px of mostly
   green, and the World view drew its regions as solid orange discs with the smaller ones on top. Pinned here:
     A. a bubble takes its want-to-try places in as a violet tag (bookmark and count) that never reaches the number,
        and the number still counts the places you have been; want-to-try places alone make a violet bubble
     B. a 4px ring, split by how the cafes went, at the sizes it had (Z2, bigger steps, was skipped)
     C. the clusterer is given want-to-try pins too, except under the Want to try switch
     D. the World view uses the same bubble at its own size, biggest region on top */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);
  await pg.evaluate(() => {
    window.google = { maps: {
      Map: function () { this.addListener = () => {}; this.setCenter = () => {}; this.setZoom = () => {}; this.getZoom = () => 6;
        this.fitBounds = () => {}; this.setOptions = () => {}; this.getBounds = () => ({ contains: () => true }); },
      Marker: function (o) { this.o = o; this.map = o.map || null; this.addListener = function () {};
        this.setMap = m => { this.map = m; }; this.getPosition = () => o.position; this.setIcon = () => {}; this.setZIndex = () => {}; },
      Circle: function () { this.setMap = () => {}; },
      LatLngBounds: function () { this.extend = () => {}; },
      Size: function (w, h) { this.width = w; this.height = h; }, Point: function (x, y) { this.x = x; this.y = y; },
      SymbolPath: { CIRCLE: "circle" },
      event: { trigger: function () {}, addListenerOnce: function () {} },
      places: { Autocomplete: function () { this.addListener = function () {}; this.getPlace = () => ({}); } },
    } };
    google.maps.Marker.MAX_ZINDEX = 1000;
    window.markerClusterer = { MarkerClusterer: function (o) { window.__clustered = o.markers.slice();
      o.markers.forEach(m => m.setMap(o.map)); this.clearMarkers = () => { o.markers.forEach(m => m.setMap(null)); }; this.setMap = () => {}; } };
    navigator.geolocation.getCurrentPosition = () => {};
    isAdmin = false; applyMode();
    /* what an icon draws, read back from its SVG */
    window.__read = icon => {
      const s = decodeURIComponent(icon.url.replace(/^data:image\/svg\+xml;charset=UTF-8,/, ""));
      const tag = s.match(/<rect x="([\d.-]+)" y="([\d.]+)" width="(\d+)" height="(\d+)"[^>]*fill="([^"]+)"/);
      return {
        w: icon.scaledSize.width, h: icon.scaledSize.height, ax: icon.anchor.x, ay: icon.anchor.y,
        face: (s.match(/>(\d+)<\/text>/) || [])[1], faceFill: (s.match(/<circle[^>]*r="[\d.]+" fill="(#[0-9a-f]+)"/i) || [])[1],
        tag: (s.match(/class="tag"[^>]*>(\d+)</) || [])[1] || null,
        tagBox: tag ? { x0: +tag[1], y1: +tag[2] + +tag[4], x1: +tag[1] + +tag[3], fill: tag[5] } : null,
        bookmark: /<path d="M[^"]*z" fill="#ffffff"/.test(s),
        rings: [...s.matchAll(/stroke="(#[0-9a-f]{6})" stroke-width="(\d+)" stroke-dasharray/gi)].map(m => m[1] + "/" + m[2]),
      };
    };
  });

  // ================= A + B: the icon =================
  let r = await pg.evaluate(() => {
    const plain = __read(clusterIcon({ loved: 4, fine: 1, meh: 0, "": 0, wish: 0 }));
    const tagged = __read(clusterIcon({ loved: 4, fine: 1, meh: 0, "": 0, wish: 3 }));
    const many = __read(clusterIcon({ loved: 50, fine: 9, meh: 3, "": 1, wish: 13 }));
    const want = __read(clusterIcon({ loved: 0, fine: 0, meh: 0, "": 0, wish: 2 }));
    return { plain, tagged, many, want };
  });
  eq([r.plain.w, r.plain.h, r.plain.ax, r.plain.ay, r.plain.face, r.plain.tag], [49, 49, 24.5, 24.5, "5", null],
     "five visited cafes: a 49px bubble, as before, centred on the spot, saying 5 and with no tag");
  eq(r.plain.rings, ["#2e9e5b/4", "#f0a93b/4"], "…its ring is 4px (it was 7), split loved and fine");
  eq([r.tagged.face, r.tagged.tag, r.tagged.bookmark, r.tagged.tagBox.fill], ["5", "3", true, "#6b3fbf"],
     "with three want-to-try places it still says 5, and a violet tag with a bookmark says 3");
  eq([r.tagged.w, r.tagged.h, r.tagged.ax, r.tagged.ay], [63, 55, 24.5, 30.5],
     "…the tag overhangs the top right, and the disc stays centred on the spot");
  eq([r.many.face, r.many.tag, r.many.w], ["63", "13", 76], "a big bubble with a two-digit tag: 63 been, 13 to try, the wider tag inside the icon");
  eq(r.many.rings.length, 4, "…its ring still splits loved, fine, not for me and not rated");
  eq([r.want.face, r.want.faceFill, r.want.tag, r.want.rings], ["2", "#6b3fbf", null, []],
     "two want-to-try places and nothing else: a violet bubble saying 2, no ring and no tag");

  /* the tag never reaches the number, nor leaves the icon, at any size the map draws */
  r = await pg.evaluate(() => {
    const bad = [];
    for (let n = 1; n <= 120; n++)
      for (const wish of [1, 9, 10, 25]) {
        const i = __read(clusterIcon({ loved: n, fine: 0, meh: 0, "": 0, wish }));
        const textTop = i.ay - 7;
        if (!(i.tagBox.y1 <= textTop && i.tagBox.x0 >= 0 && i.tagBox.x1 <= i.w)) bad.push(n + "+" + wish);
      }
    return bad;
  });
  eq(r, [], "for 1 to 120 cafes and 1 to 25 to try, the tag stays above the number and inside the icon");

  // ================= the bubble's name =================
  r = await pg.evaluate(() => {
    const m = (bucket, wish) => ({ _bucket: bucket, _wish: !!wish });
    const mk = list => _clusterRenderer.render({ count: list.length, markers: list, position: { lat: 0, lng: 0 } }).o;
    const a = mk([m("loved"), m("loved"), m("loved"), m("fine"), m("", 1), m("", 1)]);
    const one = mk([m("loved"), m("", 1)]);
    const w = mk([m("", 1), m("", 1)]);
    return { a: [a.title, a.zIndex, __read(a.icon).face, __read(a.icon).tag], one: one.title, w: w.title };
  });
  eq(r.a, ["4 cafes · 2 to try", 1006, "4", "2"], "a bubble of 4 visited and 2 want-to-try is named for both, and stacks by all 6");
  eq([r.one, r.w], ["1 cafe · 1 to try", "2 to try"], "…in the singular for one, and by the want-to-try count alone when that is all it holds");

  // ================= C: what the clusterer is given =================
  r = await pg.evaluate(() => {
    cafes = [
      { id: "a", name: "A", lat: 37.77, lng: -122.42, rating: 5, drinks: [] },
      { id: "b", name: "B", lat: 37.78, lng: -122.41, rating: 3, drinks: [] },
      { id: "w", name: "W", lat: 37.76, lng: -122.43, wish: true, drinks: [] },
    ];
    gReady = true; gmap = null; mapWantOnly = false; mapWorld = null; initMap(); show("map");
    const off = (window.__clustered || []).map(m => m.o.title).sort();
    window.__clustered = null;
    toggleWantOnly(true);
    const on = { clusterer: !!window.__clustered, shown: gmarkers.filter(m => m.map === gmap).map(m => m.o.title).sort() };
    toggleWantOnly(false);
    return { off, on };
  });
  eq(r.off, ["A", "B", "W"], "zoomed-out bubbles are given every pin, want-to-try included");
  eq(r.on, { clusterer: false, shown: ["W"] }, "under the Want to try switch there are no bubbles, only the want-to-try pins");

  // ================= D: the World view =================
  r = await pg.evaluate(() => {
    cafes = [
      { id: "c1", name: "SF A", area: "San Francisco, CA", lat: 37.77, lng: -122.42, rating: 5, drinks: [] },
      { id: "c2", name: "SF B", area: "San Francisco, CA", lat: 37.78, lng: -122.41, rating: 3, drinks: [] },
      { id: "c3", name: "SF wish", area: "San Francisco, CA", lat: 37.76, lng: -122.43, rating: 0, wish: true, drinks: [] },
      { id: "n1", name: "Vegas", area: "Las Vegas, NV", lat: 36.17, lng: -115.14, rating: 4, drinks: [] },
    ];
    renderMarkers();
    jumpToLocation("");
    return gworld.map(m => { const i = __read(m.o.icon); return [m.o.title, i.face, i.tag, i.w - (i.tag ? 14 : 0), i.rings.length > 0, m.o.zIndex]; });
  });
  eq(r[0], ["California · 3 places", "2", "1", 38, true, 7],
     "California: the cluster bubble at the World view's size (38px for 3), 2 been and a tag of 1, named for all 3");
  eq(r[1], ["Nevada · 1 place", "1", null, 34, true, 5], "Nevada: 34px, no tag, and drawn under California");
  eq(errs, [], "no page errors");

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
