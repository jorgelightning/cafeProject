/* The wrong-photo bug, at its root.

   Correcting Paragon Tea Room's location did not correct its photo, and two location-based
   fixes in a row failed to move it, because the photo was never being looked up by location
   at all — it was being looked up by *text*, name plus area, and a text search can always
   land on a different shop with a similar name. Google's answer to "which place exactly" is
   the place id, and the Autocomplete response the cafe was created from already contained
   one. The form used to discard it.

   These tests hold the exact-lookup path in place: a cafe with an id asks for that one
   place's photos and nothing else, and an id that resolves without photos shows no photo
   rather than falling back to a search that would hand it someone else's. */
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

  /* A Places stub that keeps a log of *how* it was asked. The two photos are real 1x1 GIFs;
     a URL that cannot load is purged by verifyCardPhoto(), which would empty the cache
     mid-test and look like a different bug. */
  await pg.evaluate(() => {
    window.__byId = []; window.__byText = [];
    window.RIGHT = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    window.WRONG = "data:image/gif;base64,R0lGODlhAQABAIABAAAAAP///yH5BAEAAAEALAAAAAABAAEAAAICTAEAOw==";
    /* what the id resolves to, swapped per case */
    window.__idPhotos = { "PARAGON_REAL": [{ getURI: () => window.RIGHT }] };

    function Place(opts){ this.id = opts && opts.id; }
    Place.prototype.fetchFields = function(req){
      window.__byId.push({ id: this.id, fields: req && req.fields });
      const ph = window.__idPhotos[this.id];
      if (ph === undefined) return Promise.reject(new Error("NOT_FOUND"));
      return Promise.resolve({ place: { photos: ph } });
    };
    /* the text search only ever returns the WRONG shop here — if it runs at all, the test
       for a pid-bound cafe fails visibly */
    Place.searchByText = function(req){
      window.__byText.push(req);
      return Promise.resolve({ places: [{ photos: [{ getURI: () => window.WRONG }] }] });
    };

    window.__acFields = null;
    window.google = { maps: {
      Map: function(){ this.addListener = function(ev, fn){ if (ev === "click") window.__mapClick = fn; };
                       this.setCenter = function(){}; this.setZoom = function(){}; },
      Marker: function(){ this.setMap = function(){}; },
      event: { trigger: function(){} },
      places: {
        Place: Place,
        Autocomplete: function(el, opts){
          if (el && el.id === "f-name") { window.__acFields = opts && opts.fields; window.__ac = this; }
          this._h = null;
          this.addListener = function(ev, fn){ this._h = fn; };
          this.getPlace = function(){ return window.__place || {}; };
          this.fire = function(p){ window.__place = p; if (this._h) this._h(); };
        },
        PlacesService: function(){
          this.getDetails = function(req, cb){ window.__byId.push({ legacy: true, id: req.placeId }); cb(null, "ZERO_RESULTS"); };
          this.findPlaceFromQuery = function(req, cb){ window.__byText.push(req); cb(null, "ZERO_RESULTS"); };
        },
        PlacesServiceStatus: { OK: "OK", ZERO_RESULTS: "ZERO_RESULTS" }
      }
    } };
    gReady = true;
  });

  const RIGHT = await pg.evaluate(() => window.RIGHT);
  const WRONG = await pg.evaluate(() => window.WRONG);

  const fetchFor = (cafe) => pg.evaluate((c) => new Promise(res => {
    window.__byId = []; window.__byText = [];
    cafes = [c]; gphotoCache = {};
    fetchPlacePhoto(c, u => res({ url: u, byId: window.__byId, byText: window.__byText }));
  }), cafe);

  const PARAGON = { id: "p1", name: "Paragon Tea Room", area: "Downtown",
                    lat: 47.5985, lng: -122.3270, tags: [], drinks: [] };

  // --- 1. a cafe with a place id is looked up by that id, and never searched for ---
  let r = await fetchFor(Object.assign({}, PARAGON, { pid: "PARAGON_REAL" }));
  eq(r.url, RIGHT, "a cafe with a place id gets that place's photo");
  eq(r.byId.map(x => x.id), ["PARAGON_REAL"], "…asked for by id, exactly once");
  eq(r.byText, [], "…and never text-searched — the whole point");
  eq(r.byId[0].fields, ["photos"], "…requesting only the photos field");

  // --- 2. an id that resolves with no photos means no photo, not somebody else's ---
  await pg.evaluate(() => { window.__idPhotos["EMPTY_PLACE"] = []; });
  r = await fetchFor(Object.assign({}, PARAGON, { id: "p2", pid: "EMPTY_PLACE" }));
  eq(r.url, null, "a place with no photos on file shows no photo");
  eq(r.byText, [], "…rather than falling back to a search that would find the wrong shop");

  // --- 3. an id that does not resolve at all may fall back ---
  r = await fetchFor(Object.assign({}, PARAGON, { id: "p3", pid: "GONE" }));
  eq(r.byText.length > 0, true, "an id that fails to resolve falls back to the old search");

  // --- 4. cafes saved before this still work the way they did ---
  r = await fetchFor(Object.assign({}, PARAGON, { id: "p4" }));
  eq(r.url, WRONG, "a cafe with no place id still uses the text search");
  eq(r.byId, [], "…and does not invent an id lookup");
  eq(r.byText[0].textQuery, "Paragon Tea Room Downtown", "…with the name-plus-area query");

  // --- 5. the form asks Google for the id in the first place ---
  await pg.evaluate(() => { cafes = []; isAdmin = true; openForm(); });
  await pg.waitForTimeout(250);
  eq(await pg.evaluate(() => (window.__acFields || []).includes("place_id")), true,
     "the name field's Autocomplete requests place_id");

  // --- 6. picking a place captures it, and saving stores it ---
  r = await pg.evaluate(() => {
    window.__ac.fire({
      name: "Paragon Tea Room", place_id: "PARAGON_REAL",
      geometry: { location: { lat: () => 47.5985, lng: () => -122.3270 } },
      address_components: [{ types: ["neighborhood"], long_name: "Pioneer Square" },
                           { types: ["country"], short_name: "US" }]
    });
    return formPid;
  });
  eq(r, "PARAGON_REAL", "picking a place from the dropdown captures its id");

  r = await pg.evaluate(() => {
    $("f-review").value = "note";
    saveForm();
    return { pid: cafes[0] && cafes[0].pid, n: cafes.length };
  });
  eq({ pid: r.pid, n: r.n }, { pid: "PARAGON_REAL", n: 1 }, "…and saving stores it on the cafe");

  // --- 7. dropping the pin by hand means we no longer know which record it is ---
  r = await pg.evaluate(() => {
    const id = cafes[0].id;
    openForm(id);
    const had = formPid;
    window.__mapClick({ latLng: { lat: () => 47.7000, lng: () => -122.4000 } });
    const after = formPid;
    saveForm();
    return { had, after, stored: cafes[0].pid || null };
  });
  eq(r.had, "PARAGON_REAL", "editing the cafe loads its stored id back into the form");
  eq(r.after, "", "dropping the pin by hand clears it — we no longer know the record");
  eq(r.stored, null, "…and saving drops the stale id rather than keeping a wrong claim");

  // --- 8. the Paragon case: a new id with the pin unmoved still refreshes the photo ---
  r = await pg.evaluate(() => {
    cafes = [{ id: "p9", name: "Paragon Tea Room", area: "Downtown",
               lat: 47.5985, lng: -122.3270, pid: "OLD_WRONG_PLACE",
               gphoto: window.WRONG, tags: [], drinks: [] }];
    gphotoCache = { p9: { url: window.WRONG, ts: Date.now() } };
    openForm("p9");
    formPid = "PARAGON_REAL";           /* as picking the right place from the dropdown does */
    saveForm();
    return { pid: cafes[0].pid, gphoto: cafes[0].gphoto || null,
             cached: gphotoCache["p9"] === undefined ? "cleared" : "kept",
             lat: cafes[0].lat };
  });
  eq(r.pid, "PARAGON_REAL", "correcting which place it is updates the stored id");
  eq(r.lat, 47.5985, "…with the pin unmoved, so 'moved' alone would not have noticed");
  eq(r.gphoto, null, "…the wrong photo saved on the cafe is dropped");
  eq(r.cached !== "kept", true, "…and the wrong photo is not left sitting in the cache");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
