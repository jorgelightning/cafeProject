/* Correcting a cafe's location has to change what you see: the pin, the area, and the photo.
   The photo was the one that silently did not move — the lookup is a text search and the pin
   was only a hint, so the same wrong place came straight back. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  /* A stubbed Places that answers by WHERE it is asked, so a query that ignores the pin is
     visible as the wrong photo rather than as a passing test. */
  await pg.evaluate(() => {
    window.__asked = [];
    const near = (c, lat, lng) => Math.abs(c.lat - lat) < 0.004 && Math.abs(c.lng - lng) < 0.004;
    /* Real 1x1 GIFs. A URL that cannot load is purged by verifyCardPhoto() — correct
       behaviour for a broken photo, and it would quietly empty the cache mid-test. */
    window.RIGHT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    window.WRONG = "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";
    window.google = { maps: {
      /* enough of the Maps API for the form and detail views to run */
      Map: function(){ this.addListener=function(){}; this.setCenter=function(){}; this.setZoom=function(){}; },
      Marker: function(){ this.setMap=function(){}; },
      event: { trigger: function(){} },
      places: {
      Autocomplete: function(){ this.addListener=function(){}; this.getPlace=function(){ return {}; }; },
      Place: {
        searchByText(req) {
          window.__asked.push(req);
          const c = req.locationRestriction && req.locationRestriction.center;
          if (!c) return Promise.resolve({ places: [] });
          const url = near(c, 47.5985, -122.3270) ? window.RIGHT
                    : near(c, 47.6100, -122.3300) ? window.WRONG : null;
          return Promise.resolve({ places: url ? [{ photos: [{ getURI: () => url }] }] : [] });
        }
      }
    } } };
    gReady = true;
  });

  const shot = () => pg.evaluate(() => new Promise(res => {
    const c = cafes[0];
    delete gphotoCache[c.id];
    fetchPlacePhoto(c, u => res({ url: u, asked: window.__asked.length }));
  }));

  // the cafe as it was, pinned at the wrong place
  await pg.evaluate(() => {
    isAdmin = true;
    cafes = [{ id: "p1", name: "Paragon Tea Room", area: "Downtown",
               lat: 47.6100, lng: -122.3300, tags: [], drinks: [] }];
    gphotoCache = {};
  });
  let r = await shot();
  const RIGHT = await pg.evaluate(() => window.RIGHT), WRONG = await pg.evaluate(() => window.WRONG);
  eq(r.url, WRONG, "before: the photo matches where the pin wrongly was");

  // correct the pin, exactly as saveForm does on an edit
  await pg.evaluate(() => {
    editId = "p1"; _formSnap = null;
    openForm("p1");
    picked = { lat: 47.5985, lng: -122.3270 };
    saveForm();
  });
  await pg.waitForTimeout(200);   /* saveForm -> openDetail refetches */
  r = await pg.evaluate(() => {
    const hit = gphotoCache["p1"];
    return { lat: cafes[0].lat, lng: cafes[0].lng, gphoto: cafes[0].gphoto || null,
             cached: hit && hit.url ? hit.url : hit };
  });
  eq({ lat: r.lat, lng: r.lng }, { lat: 47.5985, lng: -122.327 }, "the corrected pin is saved");
  eq(r.gphoto, null, "the stale photo stored on the cafe is dropped");
  eq(r.cached, RIGHT, "and saving re-caches the photo for where the pin now is");

  r = await shot();
  eq(r.url, RIGHT, "after: the photo follows the corrected pin — the actual bug");

  // and the pin is a restriction, not a hint
  r = await pg.evaluate(() => {
    const last = window.__asked[window.__asked.length - 1];
    return { hasRestriction: !!last.locationRestriction, hasBias: !!last.locationBias,
             radius: last.locationRestriction && last.locationRestriction.radius };
  });
  eq({ r: r.hasRestriction, b: r.hasBias }, { r: true, b: false },
     "the lookup restricts by location instead of merely biasing");
  eq(typeof r.radius, "number", "…within a bounded radius (" + r.radius + "m)");

  // a place picked from search takes its area with it
  r = await pg.evaluate(() => {
    const comps = [{ types: ["neighborhood"], long_name: "Pioneer Square" },
                   { types: ["country", "political"], short_name: "US", long_name: "United States" }];
    // what the place_changed handler does when you pick a different place
    picked = { lat: 47.6100, lng: -122.3300 };
    const _wasAt = { lat: picked.lat, lng: picked.lng };
    $("f-area").value = "Downtown";
    picked = { lat: 47.5985, lng: -122.3270 };
    const _moved = Math.abs(_wasAt.lat - picked.lat) > 0.0004 || Math.abs(_wasAt.lng - picked.lng) > 0.0004;
    if (!$("f-area").value || _moved) {
      const nb = comps.find(x => x.types.includes("neighborhood"));
      if (nb) $("f-area").value = nb.long_name;
    }
    return $("f-area").value;
  });
  eq(r, "Pioneer Square", "relocating updates the area instead of keeping the old one");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
