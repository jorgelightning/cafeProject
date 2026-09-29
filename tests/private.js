/* "Private spot 🏠" used to mean nothing but "skip Google photos". It kept the exact pin and
   the free-text area, and one real record held a street address with an apartment number, published in cafes.json and readable by anyone.

   Everything this app writes is public: cafes.json is served from the repo, and the Firebase
   node is read without auth. So hiding a private spot in the UI would be theatre; the value
   itself must never be written precisely. These tests hold that down at the point of save,
   and hold the published file to the same standard. */
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

  // --- 1. the blur itself ---
  let r = await pg.evaluate(() => ({
    lat: blurCoord(30.12345), lng: blurCoord(-140.67891),
    stable: blurCoord(blurCoord(30.12345)) === blurCoord(30.12345),
    nul: blurCoord(null), junk: blurCoord(undefined),
    neg: blurCoord(-0.004), dp: PRIVATE_DP
  }));
  eq({ lat: r.lat, lng: r.lng }, { lat: 30.12, lng: -140.68 }, "coordinates round to a ~1km grid");
  eq(r.stable, true, "…and rounding again changes nothing, so re-saving cannot drift");
  eq([r.nul, r.junk], [null, null], "…a missing coordinate stays missing");
  eq(r.neg, -0, "…and a value near zero does not blow up");
  eq(r.dp, 2, "the grid is 2 decimal places");

  /* Grid, not jitter, is a deliberate choice: random offsets differ on every save, so
     averaging a few saves recovers the point the blur was meant to hide. */
  r = await pg.evaluate(() => {
    const out = new Set();
    for (let i = 0; i < 50; i++) out.add(blurCoord(30.12345));
    return out.size;
  });
  eq(r, 1, "fifty saves of the same spot give one answer — averaging cannot undo it");

  // --- 2. the area field ---
  r = await pg.evaluate(() => ({
    addr: privateArea("742 Evergreen Terrace #12"),
    apt:  privateArea("Apt 4B"),
    city: privateArea("San Mateo"),
    hood: privateArea("Outer Richmond"),
    empty: privateArea(""), nul: privateArea(null)
  }));
  eq(r.addr, "", "a street address is dropped");
  eq(r.apt, "", "…so is a bare unit number");
  eq(r.city, "San Mateo", "a locality is kept — privacy should not cost the whole field");
  eq(r.hood, "Outer Richmond", "…including a neighbourhood");
  eq([r.empty, r.nul], ["", ""], "empty stays empty");

  // --- 3. redactPrivate only touches private spots ---
  r = await pg.evaluate(() => {
    const pub = { custom: false, lat: 30.12345, lng: -140.67891, area: "742 Evergreen Terrace #12" };
    const before = JSON.stringify(pub);
    redactPrivate(pub);
    return { untouched: JSON.stringify(pub) === before };
  });
  eq(r.untouched, true, "a public cafe keeps its exact address — this is only for private spots");

  // --- 4. THE POINT: saving a private spot never writes the precise value ---
  await pg.evaluate(() => {
    window.__written = [];
    cafes = []; isAdmin = true; editId = null; picked = null;
    save = function(){ window.__written.push(JSON.parse(JSON.stringify(cafes))); };
    saveCafe = function(id){ window.__written.push(JSON.parse(JSON.stringify(cafes.find(c => c.id === id)))); };
    openForm();
    $("f-name").value = "Friend's Place";
    $("f-area").value = "742 Evergreen Terrace #12";
    $("f-custom").checked = true;
    picked = { lat: 30.12345, lng: -140.67891 };
    saveForm();
  });
  await pg.waitForTimeout(120);
  r = await pg.evaluate(() => {
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area, custom: c.custom,
             wrote: JSON.stringify(window.__written) };
  });
  eq({ lat: r.lat, lng: r.lng }, { lat: 30.12, lng: -140.68 },
     "saving a private spot stores the blurred pin, not the exact one");
  eq(r.area, "", "…and drops the street address");
  eq(r.custom, true, "…while staying a private spot");
  eq(/30\.12345|140\.67891|Evergreen/.test(r.wrote), false,
     "the exact position never appears in anything written to the cloud");

  // --- 5. re-saving an old precise record heals it ---
  r = await pg.evaluate(() => {
    cafes = [{ id: "old", name: "Old Private", area: "742 Evergreen Terrace #12",
               lat: 30.12345, lng: -140.67891, custom: true, tags: [], drinks: [] }];
    openForm("old");
    $("f-custom").checked = true;
    saveForm();
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area };
  });
  eq({ lat: r.lat, lng: r.lng, area: r.area }, { lat: 30.12, lng: -140.68, area: "" },
     "opening and saving a private spot from before this fixes it in place");

  // --- 6. a public cafe saved through the same path is untouched ---
  r = await pg.evaluate(() => {
    cafes = []; editId = null;
    openForm();
    $("f-name").value = "Real Cafe";
    $("f-area").value = "742 Evergreen Terrace";
    $("f-custom").checked = false;
    picked = { lat: 30.12345, lng: -140.67891 };
    saveForm();
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area };
  });
  eq(r, { lat: 30.12345, lng: -140.67891, area: "742 Evergreen Terrace" },
     "a normal cafe still saves its exact location — a shop's address is not a secret");

  // --- 7. the published file itself carries no private address ---
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, "cafes.json"), "utf8"));
  const rows = Array.isArray(data) ? data : Object.values(data);
  const priv = rows.filter(c => c.custom === true);
  eq(priv.length > 0, true, "cafes.json has private spots to check (" + priv.length + ")");
  eq(priv.filter(c => c.lat != null && +(+c.lat).toFixed(2) !== c.lat).map(c => c.name), [],
     "no private spot in the published file carries a precise latitude");
  eq(priv.filter(c => c.lng != null && +(+c.lng).toFixed(2) !== c.lng).map(c => c.name), [],
     "…or a precise longitude");
  eq(priv.filter(c => /\d/.test(c.area || "")).map(c => c.name), [],
     "…or a street address in its area field");

  // --- 8. the daily backup redacts too, or Firebase would republish it tomorrow ---
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/backup.yml"), "utf8");
  eq(/\.custom\s*==\s*true/.test(wf), true,
     "the backup workflow singles out private spots");
  eq(/\.lat\s*\*\s*100\s*\)\s*\|\s*round/.test(wf.replace(/\s+/g, " ")) || /lat \* 100/.test(wf), true,
     "…rounds their coordinates on the way out of Firebase");
  eq(/test\("\[0-9\]"\)/.test(wf), true,
     "…and drops a numbered area field");
  eq(wf.indexOf("jq -e") !== wf.lastIndexOf("jq -e"), true,
     "…behind a guard that refuses to commit a snapshot that still carries one");

  /* --- 9. the owner-only copy ---
     The exact address is stored twice over: blurred in the public "cafes" node, exact under
     PRIVATE_PATH behind a read rule only the owner's account satisfies. The property that
     matters is that `cafes` — the array save() writes wholesale to the public node — never
     holds the precise value, no matter who is looking. */
  await pg.evaluate(() => {
    window.__signedIn = false;
    /* `let fbAuth` at the top of core.js lives in script scope, not on window — assigning
       window.fbAuth would be silently ignored. */
    fbAuth = { get currentUser(){ return window.__signedIn ? { email: OWNER_EMAIL } : null; } };
    privDetail = {}; _needsHeal = {};
  });

  r = await pg.evaluate(() => {
    /* what the public node holds after redaction */
    cafes = adoptCafes([{ id: "p", name: "Friend's Place", custom: true,
                          area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891,
                          tags: [], drinks: [] }]);
    privDetail = { p: { area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 } };
    const c = cafes[0];
    const asViewer = { area: areaOf(c), lat: latOf(c) };
    window.__signedIn = true;
    const asOwner = { area: areaOf(c), lat: latOf(c) };
    return { asViewer, asOwner, stored: { area: c.area, lat: c.lat, lng: c.lng } };
  });
  eq(r.asViewer, { area: "", lat: 30.12 }, "a viewer sees the blurred pin and no address");
  eq(r.asOwner, { area: "742 Evergreen Terrace #12", lat: 30.12345 },
     "the owner, signed in, sees the real address — the whole point of the gated node");
  eq(r.stored, { area: "", lat: 30.12, lng: -140.68 },
     "…while the record in `cafes` stays blurred, because save() publishes that array");

  /* Signing out must take it away again — the accessors key off auth, not off a flag that
     could be flipped in a console. (The real barrier is the database rule; this is the UI
     half of it.) */
  r = await pg.evaluate(() => { window.__signedIn = false; const c = cafes[0]; return areaOf(c); });
  eq(r, "", "signing out hides it again");

  /* --- 10. the heal moves a record that predates all this --- */
  r = await pg.evaluate(() => {
    _needsHeal = {}; privDetail = {};
    cafes = adoptCafes([{ id: "old", name: "Old", custom: true,
                          area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 }]);
    return { flagged: Object.keys(_needsHeal), remembered: _needsHeal.old };
  });
  eq(r.flagged, ["old"], "a precise record found in the public node is flagged to be moved");
  eq(r.remembered, { area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 },
     "…with its exact values kept so nothing is lost in the move");

  r = await pg.evaluate(() => {
    _needsHeal = {};
    cafes = adoptCafes([{ id: "ok", name: "Fine", custom: true, area: "San Mateo", lat: 37.56, lng: -122.33 }]);
    return Object.keys(_needsHeal);
  });
  eq(r, [], "an already-blurred record is not flagged, so the heal runs once and stops");

  /* --- 10b. the heal under the rules that were actually live on 29 Sep ---
     Those rules had a `cafes` block and no `private` block, so the database refused every
     write to private/. The heal used to write private/ first and blur the public record only
     if that worked — so under those rules it never blurred anything, and an exact location
     stayed world-readable. Here private/ refuses and cafes/ accepts, as it did live. */
  const healUnder = (admin) => pg.evaluate((admin) => {
    const pub = [], toasts = [];
    window.__signedIn = true; fbReady = true; isAdmin = admin;
    fbDb = { ref: path => ({
      set: v => { if (path.startsWith("cafes/")) { pub.push(JSON.parse(JSON.stringify(v))); return Promise.resolve(); }
                  return Promise.reject(new Error("PERMISSION_DENIED")); },
      remove: () => Promise.reject(new Error("PERMISSION_DENIED")),
      once: () => Promise.reject(new Error("PERMISSION_DENIED")) }) };
    const _save = saveCafe, _toast = toast;
    window.saveCafe = id => { pub.push(JSON.parse(JSON.stringify(cafes.find(c => c.id === id)))); return Promise.resolve(); };
    window.toast = m => toasts.push(m);
    try { localStorage.removeItem(PRIV_MIRROR); localStorage.removeItem(PRIV_QUEUE); } catch (e) {}
    privDetail = {}; privPending = {}; _privWarned = false; _needsHeal = {};
    Object.keys(_ruleFindings).forEach(k => delete _ruleFindings[k]);
    document.getElementById("rule-warn").hidden = true;
    cafes = adoptCafes([{ id: "old", name: "Old", custom: true,
                          area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 }]);
    healPrivateSpots();
    return new Promise(res => setTimeout(() => {
      window.saveCafe = _save; window.toast = _toast;
      res({ pub, toasts, left: Object.keys(_needsHeal),
            kept: privPending.old, mirrored: JSON.parse(localStorage.getItem(PRIV_MIRROR) || "{}").old,
            banner: document.getElementById("rule-warn").hidden ? "" : document.getElementById("rule-warn").textContent });
    }, 120));
  }, admin);

  r = await healUnder(true);
  eq(r.pub.map(c => ({ area: c.area, lat: c.lat, lng: c.lng })), [{ area: "", lat: 30.12, lng: -140.68 }],
     "with private/ refused, the public record is still overwritten — blurred, with no address");
  eq([r.kept && r.kept.area, r.mirrored && r.mirrored.area], ["742 Evergreen Terrace #12", "742 Evergreen Terrace #12"],
     "…and the exact copy is kept on this device and queued for private/, so nothing is lost");
  eq(r.toasts.some(t => /Hid Old's exact location/.test(t)), true, "…and it says it hid it");
  eq(/not backed up/.test(r.banner) && /private/.test(r.banner), true,
     "the refusal raises the rules banner — private spots are only on this device until the rule is fixed");

  r = await healUnder(false);
  eq([r.pub.length, r.left], [0, ["old"]],
     "before editing mode is on, nothing is written and the heal waits rather than being dropped");
  r = await pg.evaluate(() => { window.__signedIn = false; isAdmin = false; return true; });

  /* --- 11. sharing never leaks it, even for the owner --- */
  r = await pg.evaluate(() => {
    window.__signedIn = true;
    cafes = [{ id: "s", name: "Friend's Place", custom: true, area: "", lat: 30.12, lng: -140.68, drinks: [], tags: [] }];
    privDetail = { s: { area: "742 Evergreen Terrace #12", lat: 30.12345, lng: -140.67891 } };
    curId = "s";
    let shared = null;
    navigator.share = (d) => { shared = d; return Promise.resolve(); };
    shareCafe();
    window.__signedIn = false;
    return shared;
  });
  eq(/Evergreen|30\.12345/.test(JSON.stringify(r)), false,
     "sharing carries the public value even when the owner taps it — it goes to someone else");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
