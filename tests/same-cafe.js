/* "Is this a cafe I already have?", asked when you log one.

   The check wanted the names to match letter for letter, so "MoonTea" beside "Moon Tea", and "Sunright Tea
   Studio" beside "Sunright Tea Studio - Burlingame" (both real, both 20 to 30 m apart), each became a second
   record. A different spelling now counts as the same cafe when it is also the same spot: within about 150 m, or,
   with no pins, written with the same area. Branches of a chain, which are further apart, stay separate. */
const { serve, launch, checker, ready } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 800 } });
  const pg = await ctx.newPage();
  await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs = []; pg.on("pageerror", e => errs.push(String(e)));
  await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
  await ready(pg);

  const r = await pg.evaluate(() => {
    const c = (id, name, area, lat, lng) => ({ id, name, area, lat, lng, drinks: [] });
    cafes = [
      c("moon", "Moon Tea", "Cupertino, CA", 37.323, -122.017),
      c("sun", "Sunright Tea Studio", "Burlingame, CA", 37.580, -122.347),
      c("hey", "HEYTEA", "Daly City, CA", 37.700, -122.483),
      c("kiss", "Kiss of Matcha", "San Francisco, CA", 37.783, -122.467),
      c("nopin", "Quiet Roasters", "Berkeley", null, null),
      c("maru", "Maruwu Seicha", "Taipei", 25.0, 121.5)
    ];
    const id = (...a) => { const x = findSameCafe(...a); return x ? x.id : null; };
    return {
      keys: [sameCafeKey("MoonTea"), sameCafeKey("Moon Tea"), sameCafeKey("Sunright Tea Studio - Burlingame"), sameCafeKey("HEYTEA (Cupertino)"), sameCafeKey("Café • Bar")],
      /* the two real pairs */
      moonTea: id("MoonTea", "Cupertino", 37.322, -122.017),
      sunright: id("Sunright Tea Studio - Burlingame", "Downtown", 37.580, -122.347),
      /* unchanged: the exact name, within the old 440 m */
      exact: id("moon tea", "", 37.3255, -122.017),
      exactFar: id("Moon Tea", "", 37.40, -122.017),
      /* a branch of a chain is not the same cafe */
      branch: id("HEYTEA (Cupertino)", "Cupertino", 37.324, -122.011),
      /* a different spelling needs the same spot: 500 m away is not */
      spellFar: id("MoonTea", "", 37.3275, -122.017),
      /* no pins: the same area, or nothing */
      noPinSame: id("Quiet  Roasters", "berkeley", null, null),
      noPinOther: id("Quiet  Roasters", "Oakland", null, null),
      noPinNoArea: id("Quiet  Roasters", "", null, null),
      /* the same pin under a different name is not the same name */
      samePinOtherName: id("Yifang Taiwan Fruit Tea", "Taipei", 25.0, 121.5),
      /* too short to compare once the punctuation is gone */
      tiny: id("A!", "", 37.323, -122.017),
      none: id("", "", null, null)
    };
  });
  eq(r.keys, ["moontea", "moontea", "sunrightteastudio", "heytea", "cafe"], "names reduce to a key without case, accents, spaces, punctuation, a bracket or a \" - suffix");
  eq(r.moonTea, "moon", "\"MoonTea\" 32 m from \"Moon Tea\" is the same cafe");
  eq(r.sunright, "sun", "\"Sunright Tea Studio - Burlingame\" 21 m from \"Sunright Tea Studio\" is the same cafe");
  eq([r.exact, r.exactFar], ["moon", null], "an exact name still matches within about 440 m, and not at 8 km");
  eq(r.branch, null, "\"HEYTEA (Cupertino)\" is not the Daly City HEYTEA: branches stay separate");
  eq(r.spellFar, null, "a different spelling 500 m away is a different place");
  eq([r.noPinSame, r.noPinOther, r.noPinNoArea], ["nopin", null, null], "with no pins, a different spelling needs the same area");
  eq(r.samePinOtherName, null, "the same pin under a different name is not the same name (Maruwu Seicha and Yifang need a look, not a merge)");
  eq([r.tiny, r.none], [null, null], "a name too short to compare, or empty, matches nothing");

  eq(errs, [], "no page errors");
  await ctx.close(); await b.close(); srv.close(); process.exit(done() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
