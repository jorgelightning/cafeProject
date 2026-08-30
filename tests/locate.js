/* The locate button, and the dot it exists to show.

   Both halves were missing in different ways. `locate()` had been in map.js since the start
   and nothing called it — there was no button. And `showUserLocation()` cleared `userMarker`
   without ever building a new one, so even when the app knew where you were (the list sorts
   by distance from you) it never drew you.

   These tests hold both halves down, plus the thing that makes a slow GPS fix bearable: the
   button has to say it is working, or an 8-second wait reads as a dead tap. */
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

  /* Maps and geolocation both stubbed: the real key is referrer-locked, and a test machine
     has no GPS. The geolocation stub is hand-driven so the pending state is observable. */
  await pg.evaluate(() => {
    window.__markers = []; window.__circles = [];
    window.google = { maps: {
      Map: function(){ this._l = {};
        this.addListener = (ev, fn) => { this._l[ev] = fn; window.__mapListeners = this._l; };
        this.setCenter = p => { window.__center = p; }; this.setZoom = z => { window.__zoom = z; };
        this.getZoom = () => window.__zoom || 12; this.fitBounds = () => { window.__fitted = true; }; },
      Marker: function(o){ this.o = o; window.__markers.push(o);
                           this.addListener = function(){}; this.setMap = m => { this.o.map = m; };
                           this.getPosition = () => o.position; },
      Circle: function(o){ this.o = o; window.__circles.push(o); this.setMap = m => { this.o.map = m; }; },
      LatLngBounds: function(){ this.extend = () => {}; },
      SymbolPath: { CIRCLE: "circle" },
      event: { trigger: function(){}, addListenerOnce: function(){} },
      places: { Autocomplete: function(){ this.addListener = function(){}; this.getPlace = () => ({}); } }
    } };
    google.maps.Marker.MAX_ZINDEX = 1000;

    window.__geo = null; window.__asks = 0;
    navigator.geolocation.getCurrentPosition = (ok, fail) => { window.__asks++; window.__geo = { ok, fail }; };
    /* Permission state is the whole point of these tests, so it is driven by hand. */
    window.__perm = "prompt";
    Object.defineProperty(navigator, "permissions", { configurable: true, value: {
      query: () => window.__perm === "THROW" ? Promise.reject(new Error("nope"))
                 : Promise.resolve({ state: window.__perm })
    } });
    gReady = true;
    cafes = [{ id: "a", name: "Near Cafe", area: "X", lat: 37.7750, lng: -122.4190, tags: [], drinks: [] }];
    gmap = null; userMarker = null; userAccuracy = null; mapJumped = false;
    initMap();
  });

  const st = () => pg.evaluate(() => {
    const b = document.getElementById("btn-locate");
    return b ? b.dataset.state : "MISSING";
  });

  // --- 1. the button exists, is a real button, and is labelled ---
  let r = await pg.evaluate(() => {
    const b = document.getElementById("btn-locate");
    if (!b) return { there: false };
    const cs = getComputedStyle(b);
    return { there: true, tag: b.tagName, label: b.getAttribute("aria-label"),
             onclick: (b.getAttribute("onclick") || ""), svg: !!b.querySelector("svg"),
             w: Math.round(b.getBoundingClientRect().width),
             h: Math.round(b.getBoundingClientRect().height),
             pos: cs.position, z: cs.zIndex };
  });
  eq(r.there, true, "the map has a locate button");
  eq(r.tag, "BUTTON", "…a real <button>, so it is keyboard-reachable for free");
  eq(r.label, "Show my location", "…with an accessible name");
  eq(r.onclick.includes("locate()"), true, "…wired to the locate() that already existed");
  eq(r.svg, true, "…drawing the crosshair rather than an emoji");
  eq({ w: r.w, h: r.h }, { w: 44, h: 44 }, "…at a 44px touch target");

  // --- 2. it sits in the bottom-right thumb corner, clear of the legend ---
  r = await pg.evaluate(() => {
    const b = document.getElementById("btn-locate").getBoundingClientRect();
    const lg = document.querySelector(".maplegend").getBoundingClientRect();
    const box = document.querySelector(".mapbox").getBoundingClientRect();
    return { rightGap: Math.round(box.right - b.right), aboveLegend: b.bottom <= lg.top,
             overlaps: !(b.bottom <= lg.top || b.top >= lg.bottom || b.right <= lg.left || b.left >= lg.right),
             inLowerHalf: b.top > box.top + box.height / 2 };
  });
  eq(r.rightGap, 12, "…12px from the right edge, matching the legend's inset");
  eq(r.aboveLegend, true, "…stacked above the legend");
  eq(r.overlaps, false, "…and never overlapping it");
  eq(r.inLowerHalf, true, "…in the lower half of the map, where a thumb reaches");

  // --- 3. the three states, driven through a real (stubbed) fix ---
  eq(await st(), "idle", "starts idle");
  await pg.evaluate(() => { window.__geo = null; locate(); });
  eq(await st(), "busy", "tapping it goes busy immediately — an 8s wait must not look dead");

  await pg.evaluate(() => window.__geo.ok({ coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 12 } }));
  await pg.waitForTimeout(60);
  eq(await st(), "on", "a fix turns it on");

  // --- 4. THE BUG: the marker is actually created ---
  r = await pg.evaluate(() => {
    const m = window.__markers.filter(x => x.title === "You are here");
    return { n: m.length, pos: m[0] && m[0].position, mapped: !!(m[0] && m[0].map),
             fill: m[0] && m[0].icon && m[0].icon.fillColor,
             z: m[0] && m[0].zIndex, live: !!userMarker };
  });
  eq(r.n, 1, "a user marker is created — it never was before");
  eq(r.live, true, "…and userMarker actually holds it");
  eq(r.pos, { lat: 37.7749, lng: -122.4194 }, "…at the reported position");
  eq(r.mapped, true, "…on the map");
  eq(r.fill, "#1a73e8", "…filled blue, distinct from the hollow wishlist ring");
  eq(r.z > 1000, true, "…above the pins and the cluster bubbles");

  // --- 5. the accuracy halo is drawn only when the fix is actually vague ---
  eq(await pg.evaluate(() => window.__circles.length), 0,
     "a 12m fix draws no halo — it would just smudge under the dot");
  await pg.evaluate(() => {
    window.__geo = null; locate();
    window.__geo.ok({ coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 1400 } });
  });
  await pg.waitForTimeout(60);
  r = await pg.evaluate(() => ({ n: window.__circles.length, radius: window.__circles[0] && window.__circles[0].radius,
                                 markers: window.__markers.filter(x => x.title === "You are here").length }));
  eq(r.n, 1, "a 1.4km fix draws the halo");
  eq(r.radius, 1400, "…at the radius the device actually reported");
  eq(r.markers, 2, "…and re-locating replaces the marker rather than stacking them");
  eq(await pg.evaluate(() => window.__markers.filter(x => x.title === "You are here" && x.map).length), 1,
     "…with only one still on the map");

  // --- 6. refused goes back to idle and says so ---
  await pg.evaluate(() => { window.__geo = null; locate(); });
  eq(await st(), "busy", "a second tap goes busy again");
  await pg.evaluate(() => window.__geo.fail({ code: 1 }));
  await pg.waitForTimeout(60);
  eq(await st(), "idle", "a refusal returns it to idle rather than leaving it spinning");
  eq(await pg.evaluate(() => document.getElementById("toast").textContent), "Couldn't get your location",
     "…and says why");

  // --- 7. panning away means it stops claiming you are centred ---
  await pg.evaluate(() => {
    window.__geo = null; locate();
    window.__geo.ok({ coords: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 } });
  });
  await pg.waitForTimeout(60);
  eq(await st(), "on", "on again after a fix");
  await pg.evaluate(() => window.__mapListeners.dragstart());
  eq(await st(), "idle", "dragging the map drops it back to idle — you are no longer centred");

  // --- 8. a busy button ignores repeat taps ---
  await pg.evaluate(() => { window.__geo = null; locate(); });
  r = await pg.evaluate(() => { const before = window.__geo; locate(); return window.__geo === before; });
  eq(r, true, "tapping while busy does not fire a second geolocation request");

  /* --- 9. nothing but the button may raise the browser's permission prompt ---
     Two paths used to ask on their own: autoLocate() on launch, and focusNearest() on every
     single switch to the map tab. Both now run only on a grant you already gave. */
  const asksAfter = (fn) => pg.evaluate((src) => {
    window.__asks = 0; window.__geo = null;
    setLocateState("idle");   /* block 8 deliberately left it busy, and busy refuses taps */
    eval(src);
    return new Promise(res => setTimeout(() => res(window.__asks), 80));
  }, fn);

  await pg.evaluate(() => { window.__perm = "prompt"; });
  eq(await asksAfter("autoLocate()"), 0, "launch does not ask when permission is unresolved");
  eq(await asksAfter("focusNearest()"), 0, "switching to the map tab does not ask either");

  await pg.evaluate(() => { window.__perm = "denied"; });
  eq(await asksAfter("autoLocate()"), 0, "…nor when it was refused");

  await pg.evaluate(() => { window.__perm = "granted"; });
  eq(await asksAfter("autoLocate()"), 1, "a grant you already gave is still used silently");
  eq(await asksAfter("focusNearest()"), 1, "…on the map tab too, so distance sorting keeps working");

  /* An unknowable state must fall to "do not ask" — older iOS Safari has no Permissions API,
     and guessing wrong there is exactly the prompt we are removing. */
  await pg.evaluate(() => { window.__perm = "THROW"; });
  eq(await asksAfter("autoLocate()"), 0, "a permissions query that throws is treated as no");
  await pg.evaluate(() => { delete navigator.permissions; });
  eq(await asksAfter("autoLocate()"), 0, "no Permissions API at all is treated as no");

  // …and the button still asks, unconditionally, because you pressed it
  eq(await asksAfter("locate()"), 1, "the button asks regardless — that is the one path you started");

  /* --- 10. a failure you did not start stays quiet --- */
  r = await pg.evaluate(() => {
    document.getElementById("toast").textContent = "";
    Object.defineProperty(navigator, "permissions", { configurable: true,
      value: { query: () => Promise.resolve({ state: "granted" }) } });
    window.__geo = null; autoLocate();
    return new Promise(res => setTimeout(() => {
      if (window.__geo) window.__geo.fail({ code: 2 });
      setTimeout(() => res(document.getElementById("toast").textContent), 40);
    }, 60));
  });
  eq(r, "", "a silent launch fix that fails says nothing — you did not ask for it");

  await pg.evaluate(() => { setLocateState("idle"); window.__geo = null; locate(); window.__geo.fail({ code: 2 }); });
  await pg.waitForTimeout(60);
  eq(await pg.evaluate(() => document.getElementById("toast").textContent), "Couldn't get your location",
     "…but a failure you started does explain itself");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
