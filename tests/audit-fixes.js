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
    savePrivateDetail("viv", { area: "1800 Washington St #611", lat: 37.79306, lng: -122.42298 });
  });
  await pg.waitForTimeout(140);
  let r = await pg.evaluate(() => ({
    inMemory: privDetail.viv,
    stillQueued: privPending.viv !== undefined,
    mirrored: JSON.parse(localStorage.getItem(PRIV_MIRROR) || "{}").viv,
    said: window.__toasts.join(" | ")
  }));
  eq(r.inMemory.area, "1800 Washington St #611", "a refused write keeps the address in memory");
  eq(r.mirrored.area, "1800 Washington St #611",
     "…and on this device, so a reload does not lose the only precise copy that is left");
  eq(r.stillQueued, true, "…queued for retry rather than dropped");
  eq(/database rules/.test(r.said), true, "…and it says so, naming the cause");

  /* The whole point of the mirror: survive the reload that used to destroy it. */
  r = await pg.evaluate(() => {
    privDetail = {}; privPending = {};
    return loadPrivateDetail().then(() => ({ area: (privDetail.viv || {}).area, queued: privPending.viv !== undefined }));
  });
  eq(r.area, "1800 Washington St #611", "reloading with the cloud still refusing restores it from the device");
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
  r = await pg.evaluate(() => {
    const el = document.getElementById("rule-warn");
    return { exists: !!el, hiddenAtRest: el ? el.hidden : null,
             probe: typeof probePrivateRule === "function" };
  });
  eq(r.exists, true, "there is a warning banner for a missing rule");
  eq(r.hiddenAtRest, true, "…hidden until something is actually wrong");
  eq(r.probe, true, "…and a probe that decides it");

  r = await pg.evaluate(() => {
    /* A rule doing its job REJECTS an anonymous read; a missing one resolves. */
    isAdmin = true; _ruleProbeDone = false; fbReady = true;
    window.firebase = { apps: [], initializeApp: () => ({ name: "ruleprobe" }),
                        database: () => ({ ref: () => ({ once: () => Promise.reject(new Error("PERMISSION_DENIED")) }) }) };
    probePrivateRule();
    return new Promise(res => setTimeout(() => res(document.getElementById("rule-warn").hidden), 90));
  });
  eq(r, true, "a rejected anonymous read is the good case and says nothing");

  r = await pg.evaluate(() => {
    isAdmin = true; _ruleProbeDone = false;
    window.firebase = { apps: [], initializeApp: () => ({ name: "ruleprobe" }),
                        database: () => ({ ref: () => ({ once: () => Promise.resolve({ val: () => null }) }) }) };
    probePrivateRule();
    return new Promise(res => setTimeout(() => res({
      shown: !document.getElementById("rule-warn").hidden,
      text: document.getElementById("rule-warn").textContent
    }), 90));
  });
  eq(r.shown, true, "a read that RESOLVES means the path is world-readable — warn");
  eq(/readable by anyone/.test(r.text) && /private/.test(r.text), true,
     "…saying what is exposed and which rule is missing");

  /* Even an empty private node resolving is proof the rule is absent, so null must warn too —
     that is the case above. And a viewer must not be alarmed by something they cannot fix. */
  r = await pg.evaluate(() => {
    document.getElementById("rule-warn").hidden = true;
    isAdmin = false; _ruleProbeDone = false;
    probePrivateRule();
    return new Promise(res => setTimeout(() => res(document.getElementById("rule-warn").hidden), 90));
  });
  eq(r, true, "a viewer is not shown a warning only the owner can act on");

  // ---- U1: the revisit path folds -------------------------------------
  r = await pg.evaluate(() => {
    isAdmin = true;
    cafes = [{ id: "k1", name: "Kissaten HiFi", area: "Tokyo", lat: 35.6, lng: 139.7,
               tags: ["cozy"], drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-01", p: "7" }] }] }];
    const ids = ["f-coords", "f-area", "f-brand", "f-photodrop", "f-tags"];
    openForm();                                   // adding a cafe
    const openNew = document.getElementById("f-details").open;
    const inside = ids.every(id => { const el = document.getElementById(id); return !!(el && el.closest("#f-details")); });
    openForm("k1");                               // revisiting one
    const openEdit = document.getElementById("f-details").open;
    return { openNew, openEdit, inside,
             drinksOutside: !document.getElementById("f-drinks").closest("#f-details") };
  });
  eq(r.inside, true, "location, area, brand, photo and tags all live in the disclosure");
  eq(r.drinksOutside, true, "…and the drinks do not — that is the part you came for");
  eq(r.openNew, true, "adding a cafe opens it, because all of it needs filling in");
  eq(r.openEdit, false, "revisiting one leaves it shut, because none of it changes");

  const size = await pg.evaluate(() => {
    const pane = document.querySelector("#pane-form .scroll") || document.getElementById("pane-form");
    openForm("k1"); const shut = pane.scrollHeight;
    document.getElementById("f-details").open = true; const open = pane.scrollHeight;
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
