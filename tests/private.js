/* "Private spot 🏠" used to mean nothing but "skip Google photos". It kept the exact pin and
   the free-text area, and one real record read "1800 Washington St #611" — a street address
   with an apartment number, published in cafes.json and readable by anyone.

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
    lat: blurCoord(37.79306), lng: blurCoord(-122.42298),
    stable: blurCoord(blurCoord(37.79306)) === blurCoord(37.79306),
    nul: blurCoord(null), junk: blurCoord(undefined),
    neg: blurCoord(-0.004), dp: PRIVATE_DP
  }));
  eq({ lat: r.lat, lng: r.lng }, { lat: 37.79, lng: -122.42 }, "coordinates round to a ~1km grid");
  eq(r.stable, true, "…and rounding again changes nothing, so re-saving cannot drift");
  eq([r.nul, r.junk], [null, null], "…a missing coordinate stays missing");
  eq(r.neg, -0, "…and a value near zero does not blow up");
  eq(r.dp, 2, "the grid is 2 decimal places");

  /* Grid, not jitter, is a deliberate choice: random offsets differ on every save, so
     averaging a few saves recovers the point the blur was meant to hide. */
  r = await pg.evaluate(() => {
    const out = new Set();
    for (let i = 0; i < 50; i++) out.add(blurCoord(37.79306));
    return out.size;
  });
  eq(r, 1, "fifty saves of the same spot give one answer — averaging cannot undo it");

  // --- 2. the area field ---
  r = await pg.evaluate(() => ({
    addr: privateArea("1800 Washington St #611"),
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
    const pub = { custom: false, lat: 37.79306, lng: -122.42298, area: "1800 Washington St #611" };
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
    $("f-name").value = "Viv & Iv's Cafe";
    $("f-area").value = "1800 Washington St #611";
    $("f-custom").checked = true;
    picked = { lat: 37.79306, lng: -122.42298 };
    saveForm();
  });
  await pg.waitForTimeout(120);
  r = await pg.evaluate(() => {
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area, custom: c.custom,
             wrote: JSON.stringify(window.__written) };
  });
  eq({ lat: r.lat, lng: r.lng }, { lat: 37.79, lng: -122.42 },
     "saving a private spot stores the blurred pin, not the exact one");
  eq(r.area, "", "…and drops the street address");
  eq(r.custom, true, "…while staying a private spot");
  eq(/37\.79306|122\.42298|Washington/.test(r.wrote), false,
     "the exact position never appears in anything written to the cloud");

  // --- 5. re-saving an old precise record heals it ---
  r = await pg.evaluate(() => {
    cafes = [{ id: "old", name: "Old Private", area: "1800 Washington St #611",
               lat: 37.79306, lng: -122.42298, custom: true, tags: [], drinks: [] }];
    openForm("old");
    $("f-custom").checked = true;
    saveForm();
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area };
  });
  eq({ lat: r.lat, lng: r.lng, area: r.area }, { lat: 37.79, lng: -122.42, area: "" },
     "opening and saving a private spot from before this fixes it in place");

  // --- 6. a public cafe saved through the same path is untouched ---
  r = await pg.evaluate(() => {
    cafes = []; editId = null;
    openForm();
    $("f-name").value = "Real Cafe";
    $("f-area").value = "1800 Washington St";
    $("f-custom").checked = false;
    picked = { lat: 37.79306, lng: -122.42298 };
    saveForm();
    const c = cafes[0];
    return { lat: c.lat, lng: c.lng, area: c.area };
  });
  eq(r, { lat: 37.79306, lng: -122.42298, area: "1800 Washington St" },
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

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
