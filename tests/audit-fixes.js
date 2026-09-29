/* Four findings from the 16 Sep audit.

   S1 was the dangerous one: config.js documented a rule set with no "private" block, Realtime
   Database denies any path no rule grants, and saveForm() blurs the public copy BEFORE writing
   the exact one — whose failure went to console.warn. Net effect: the street address stripped
   from the public record and stored nowhere. The address is now mirrored on the device and
   retried, and the refusal is said out loud.

   S2 makes the app check the rule itself, as a stranger would. U1 folds the fields a revisit
   never touches. U2 fixes the contrast of the one message that must be read. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

(async () => {
  const srv = await serve();
  const b = await launch();
  const pg = await b.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await pg.waitForTimeout(600);

  // ---- S1a: the two documents now agree --------------------------------
  const cfg = fs.readFileSync(path.join(ROOT, "js/config.js"), "utf8");
  const rme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  eq(/"private"\s*:/.test(cfg), true, "config.js setup instructions include the private rule");
  eq(/"private"\s*:/.test(rme), true, "…and so does the README");
  eq(/email_verified/.test(cfg), true, "…both require a verified address");
  eq(cfg.indexOf("NOT optional") > 0, true, "…and config.js says the block cannot be left out");

  // ---- S1b: a refused private write keeps the address ------------------
  await pg.evaluate(() => {
    isAdmin = true;
    window.__toasts = []; const realToast = toast;
    toast = function(m){ window.__toasts.push(m); realToast(m); };
    fbReady = true;
    fbAuth = { currentUser: { email: OWNER_EMAIL } };
    window.__denied = true;
    fbDb = { ref: function(p){ return {
      set: function(){ return window.__denied ? Promise.reject(new Error("PERMISSION_DENIED")) : Promise.resolve(); },
      remove: function(){ return window.__denied ? Promise.reject(new Error("PERMISSION_DENIED")) : Promise.resolve(); },
      once: function(){ return window.__denied ? Promise.reject(new Error("PERMISSION_DENIED")) : Promise.resolve({ val: () => ({}) }); }
    }; } };
    try{ localStorage.removeItem(PRIV_MIRROR); localStorage.removeItem(PRIV_QUEUE); }catch(e){}
    privDetail = {}; privPending = {}; _privWarned = false;
    savePrivateDetail("viv", { area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 });
  });
  await pg.waitForTimeout(140);
  let r = await pg.evaluate(() => ({
    inMemory: privDetail.viv,
    stillQueued: privPending.viv !== undefined,
    mirrored: JSON.parse(localStorage.getItem(PRIV_MIRROR) || "{}").viv,
    said: window.__toasts.join(" | ")
  }));
  eq(r.inMemory.area, "742 Evergreen Terrace #12", "a refused write keeps the address in memory");
  eq(r.mirrored.area, "742 Evergreen Terrace #12",
     "…and on this device, so a reload does not lose the only precise copy that is left");
  eq(r.stillQueued, true, "…queued for retry rather than dropped");
  eq(/database rules/.test(r.said), true, "…and it says so, naming the cause");

  /* The whole point of the mirror: survive the reload that used to destroy it. */
  r = await pg.evaluate(() => {
    privDetail = {}; privPending = {};
    return loadPrivateDetail().then(() => ({ area: (privDetail.viv || {}).area, queued: privPending.viv !== undefined }));
  });
  eq(r.area, "742 Evergreen Terrace #12", "reloading with the cloud still refusing restores it from the device");
  eq(r.queued, true, "…and it is still queued");

  r = await pg.evaluate(() => {
    window.__denied = false;
    flushPrivate();
    return new Promise(res => setTimeout(() => res({ queued: privPending.viv !== undefined }), 120));
  });
  eq(r.queued, false, "once the rule is fixed, the queued write goes through and clears");

  /* A deletion has to be as durable as a write, or an address outlives its cafe. */
  r = await pg.evaluate(() => {
    window.__denied = true;
    removePrivateDetail("viv", true);
    return { gone: privDetail.viv === undefined, queuedNull: privPending.viv === null };
  });
  eq(r.gone, true, "deleting drops it locally");
  eq(r.queuedNull, true, "…and queues the removal, so a refused delete is retried too");

  // ---- S2: the app checks the rule as a stranger would -----------------
  r = await pg.evaluate(async () => {
    const el = document.getElementById("rule-warn");
    /* The refused private writes above now raise it (v61) — so "at rest" is read from the
       markup a fresh load starts with, not from this page. */
    const fresh = new DOMParser().parseFromString(await (await fetch("index.html")).text(), "text/html");
    const f = fresh.getElementById("rule-warn");
    return { exists: !!el, hiddenAtRest: f ? f.hasAttribute("hidden") : null, raised: !el.hidden,
             said: el.textContent, probe: typeof probePrivateRule === "function" };
  });
  eq(r.exists, true, "there is a warning banner for a missing rule");
  eq(r.hiddenAtRest, true, "…hidden until something is actually wrong");
  eq(r.raised && /not backed up/.test(r.said), true,
     "a private write the cloud refused raises it, not just a toast — the owner's own spots are at stake");
  eq(r.probe, true, "…and a probe that decides it");

  /* A stranger's view of the database, faked per case: which of the probe's questions the
     "server" allows. Every call is recorded so the test can prove what the probe sends. */
  const probeCase = (allow, admin) => pg.evaluate(([allow, admin]) => {
    document.getElementById("rule-warn").hidden = true;
    Object.keys(_ruleFindings).forEach(k => delete _ruleFindings[k]);
    isAdmin = admin; _ruleProbeDone = false; fbReady = true;
    const calls = [];
    const verdict = key => allow.includes(key) ? Promise.resolve({ val: () => null }) : Promise.reject(new Error("PERMISSION_DENIED"));
    window.firebase = { apps: [], initializeApp: (cfg, name) => ({ name }),
      database: app => ({ ref: path => ({
        once: () => { calls.push(["read", path, app.name]); return verdict("read"); },
        set: v => { calls.push(["write", path, v, app.name]); return verdict(path.startsWith("cafes/") ? "map" : path.startsWith("private/") ? "private" : "root"); }
      }) }) };
    probePrivateRule();
    return new Promise(res => setTimeout(() => res({
      shown: !document.getElementById("rule-warn").hidden,
      text: document.getElementById("rule-warn").textContent, calls }), 90));
  }, [allow, admin]);

  r = await probeCase([], true);
  eq(r.shown, false, "every question refused is the good case and says nothing");
  eq(r.calls.every(c => c[c.length - 1] === "ruleprobe"), true, "…and every question is asked by the signed-out probe app, not the owner's");
  eq(r.calls.filter(c => c[0] === "write").every(c => c[2] === null && /(^|\/)__rulesprobe$/.test(c[1])), true,
     "every write it sends deletes a __rulesprobe key that does not exist — never real data");
  eq(r.calls.filter(c => c[0] === "write").map(c => c[1]).sort(), ["__rulesprobe", "cafes/__rulesprobe", "private/__rulesprobe"],
     "…one inside the map, one inside private, one at the root");

  r = await probeCase(["read"], true);
  eq(r.shown, true, "a read that RESOLVES means the path is world-readable — warn");
  eq(/readable by anyone/.test(r.text) && /private/.test(r.text), true,
     "…saying what is exposed and which rule is missing");
  eq(/edit or delete/.test(r.text), false, "…and not claiming the map is open when it is not");

  r = await probeCase(["map", "root", "private"], true);
  eq(/Anyone can edit or delete your map/.test(r.text), true, "a stranger's write to the map is the loudest warning");
  eq(/Strangers can write/.test(r.text), false, "…and it does not repeat itself with the lesser one");
  eq(/README/.test(r.text) && /Rules/.test(r.text), true, "…and says where the fix is");

  r = await probeCase(["root"], true);
  eq(/Strangers can write to your database/.test(r.text) && /map is locked/.test(r.text), true,
     "an open root with a locked map is named as exactly that");

  r = await probeCase(["read", "map"], true);
  eq(/edit or delete/.test(r.text) && /readable by anyone/.test(r.text), true, "two problems, both named");

  /* A viewer can do nothing about it, so a viewer's browser never asks at all. */
  r = await probeCase(["read", "map"], false);
  eq([r.shown, r.calls.length], [false, 0], "a viewer sends no probes and sees no warning");

  /* The first sign-in on a device: the probe waited while this was a viewer, and runs now. */
  r = await pg.evaluate(() => {
    Object.keys(_ruleFindings).forEach(k => delete _ruleFindings[k]);
    document.getElementById("rule-warn").hidden = true;
    isAdmin = false; _ruleProbeDone = false; probePrivateRule();
    const waited = _ruleProbeDone === false;
    let cb = null; const _load = load, _toast = toast;
    fbAuth = { onAuthStateChanged: f => { cb = f; }, signOut: () => Promise.resolve() };
    window.load = () => new Promise(() => {}); window.toast = () => {};
    window.firebase = { apps: [], initializeApp: (cfg, name) => ({ name }),
      database: () => ({ ref: path => ({ once: () => Promise.reject(new Error("no")),
        set: () => path.startsWith("cafes/") ? Promise.resolve() : Promise.reject(new Error("no")) }) }) };
    initAuth(); cb({ email: OWNER_EMAIL });
    return new Promise(res => setTimeout(() => { window.load = _load; window.toast = _toast;
      res({ waited, ran: _ruleProbeDone, text: document.getElementById("rule-warn").textContent,
            shown: !document.getElementById("rule-warn").hidden }); }, 90));
  });
  eq(r.waited, true, "before sign-in the probe waits");
  eq([r.ran, r.shown, /edit or delete/.test(r.text)], [true, true, true], "signing in runs it, and its answer reaches the owner");
  await pg.evaluate(() => { isAdmin = false; applyMode(); document.getElementById("rule-warn").hidden = true; });

  // ---- U1: the revisit path folds -------------------------------------
  /* 16 Sep folded the details for a revisit and left them open for a new cafe. 27 Sep (v58)
     folds them for a new cafe too: Google fills the pin, area and country when you pick the
     place, so the open map was 1,180px of already-answered questions above the drink. */
  r = await pg.evaluate(() => {
    isAdmin = true;
    cafes = [{ id: "k1", name: "Kissaten HiFi", area: "Tokyo", lat: 35.6, lng: 139.7,
               tags: ["cozy"], drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01", p: "7" }] }] }];
    const inPlace = ["f-coords", "f-area"].every(id => !!document.getElementById(id).closest("#f-details"));
    const inMore = ["f-brand", "f-tags", "f-fav", "f-wish", "f-custom"].every(id => !!document.getElementById(id).closest("#f-more"));
    openForm();                                   // adding a cafe
    const openNew = [document.getElementById("f-details").open, document.getElementById("f-more").open];
    openForm("k1");                               // revisiting one
    const openEdit = [document.getElementById("f-details").open, document.getElementById("f-more").open];
    const where = document.getElementById("f-where-text").textContent;
    return { openNew, openEdit, inPlace, inMore, where,
             drinksOutside: !document.getElementById("f-drinks").closest("#f-details, #f-more") };
  });
  eq(r.inPlace, true, "the pin and area live behind the place line");
  eq(r.inMore, true, "brand, tags, favourite, wishlist and private live under More");
  eq(r.drinksOutside, true, "…and the drinks do not — that is the part you came for");
  eq(r.openNew, [false, false], "adding a cafe leaves both shut: Google answers the place, More is rarely needed");
  eq(r.openEdit, [false, false], "revisiting one leaves them shut too, because none of it changes");
  eq(r.where, "Tokyo · pinned by you", "shut, the place line still says where it is");

  const size = await pg.evaluate(() => {
    const pane = document.querySelector("#pane-form .scroll") || document.getElementById("pane-form");
    openForm("k1"); const shut = pane.scrollHeight;
    document.getElementById("f-details").open = true; document.getElementById("f-more").open = true; const open = pane.scrollHeight;
    return { shut, open };
  });
  eq(size.shut < size.open, true,
     "the revisit form is shorter than the full one (" + size.shut + "px vs " + size.open + "px)");

  // ---- U2: the update prompt is readable -------------------------------
  r = await pg.evaluate(() => {
    const L = c => { const m = (c.match(/[\d.]+/g) || [0,0,0]).slice(0,3).map(v => { v = v/255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); }); return .2126*m[0] + .7152*m[1] + .0722*m[2]; };
    const el = document.getElementById("updatebar") || document.querySelector(".updatebar");
    if (!el) return { found: false };
    const s = getComputedStyle(el);
    const fg = L(s.color), bg = L(s.backgroundColor);
    return { found: true, ratio: +(((Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05))).toFixed(2), px: parseFloat(s.fontSize) };
  });
  eq(r.found, true, "the update prompt exists");
  eq(r.ratio >= 4.5, true, "…and now clears 4.5:1 (" + r.ratio + ":1, was 3.01:1)");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
