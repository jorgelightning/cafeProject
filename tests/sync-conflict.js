/* Choosing between two versions of a cafe.

   The prompt used to read "Another device edited this cafe. Choose which version to keep",
   with two buttons and nothing else. That is unanswerable in the moment it appears — you are
   mid-edit, and both options describe a place rather than a change. Both versions are already
   held in the outbox entry, so the answer is to show what differs and when each was touched. */
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

  const conflict = (mine, theirs) => pg.evaluate(({ mine, theirs }) => {
    isAdmin = true; applyMode && applyMode();
    syncPending = { c1: { token: "t", base: null, value: mine, remote: theirs, conflict: true } };
    renderSyncStatus();
    const box = document.querySelector("#sync-status .sync-review");
    return {
      hidden: box.hidden,
      text: box.textContent.replace(/\s+/g, " ").trim(),
      fields: [...box.querySelectorAll(".cfk")].map(e => e.textContent),
      mine: [...box.querySelectorAll(".cfv.mine")].map(e => e.textContent),
      theirs: [...box.querySelectorAll(".cfrow")].map(r => r.querySelectorAll(".cfv")[1].textContent),
      buttons: [...box.querySelectorAll(".cfbtns button")].map(e => e.textContent)
    };
  }, { mine, theirs });

  const now = Date.now();
  const iso = ms => new Date(now - ms).toISOString();

  // ---- the ordinary case: same cafe, edited on both sides ----
  let r = await conflict(
    { id: "c1", name: "Kissaten HiFi", area: "San Francisco", rating: 5, review: "Consistent and cozy.",
      tags: ["cozy"], fav: true, updated: iso(2 * 60 * 1000),
      drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-16" }, { date: "2026-09-17" }] }] },
    { id: "c1", name: "Kissaten HiFi", area: "San Francisco", rating: 3, review: "Consistent and cozy.",
      tags: ["cozy", "quiet"], fav: true, updated: iso(3 * 60 * 60 * 1000),
      drinks: [{ n: "Hojicha latte", orders: [{ date: "2026-09-16" }] }] }
  );
  eq(r.hidden, false, "a conflict shows the comparison");
  eq(/Kissaten HiFi/.test(r.text), true, "…naming the cafe in question");
  eq(r.fields, ["Rating", "Drinks", "Tags"], "…listing only the fields that actually differ");
  /* The bucket, not the stored number. A 4 against a 5 is no longer a disagreement worth
     showing — both are "Loved it" — so the seed above differs by an actual bucket. */
  eq(r.mine[0], "Loved it", "…this phone's value on one side");
  eq(r.theirs[0], "It was fine", "…and the cloud's on the other");
  eq(r.mine[1], "1 drink · 2 orders", "…with drink counts spelled out, not just 'drinks changed'");
  eq(r.theirs[1], "1 drink · 1 order", "…on both sides");
  eq(/Name|Area|Notes|Favourite/.test(r.fields.join(",")), false,
     "…and staying quiet about the fields that match");

  /* The thing that makes it answerable while editing: which one is newer. */
  eq(/2 min ago/.test(r.text), true, "this phone's edit is dated");
  eq(/3 hours ago/.test(r.text), true, "…and so is the cloud's");
  eq(/2 min ago/.test(r.buttons[0]), true, "the buttons carry the timestamps too");
  eq(/3 hours ago/.test(r.buttons[1]), true, "…so the choice reads without scrolling back up");
  eq(/this phone/i.test(r.buttons[0]) && /cloud/i.test(r.buttons[1]), true,
     "…and still say plainly which side each is");

  // ---- a deletion on one side ----
  r = await conflict(null, { id: "c1", name: "Gone Cafe", rating: 3, updated: iso(60 * 1000) });
  eq(/deleted/.test(r.mine.join(" ")), true, "a delete on this phone reads as deleted, not as a blank");
  eq(/Gone Cafe/.test(r.text), true, "…and the cloud's name still identifies which cafe it was");

  // ---- identical on everything visible ----
  const same = { id: "c1", name: "Same", area: "SF", rating: 4, review: "x", tags: [], drinks: [], updated: iso(1000) };
  r = await conflict(Object.assign({}, same), Object.assign({}, same, { updated: iso(9e5) }));
  eq(r.fields.length, 0, "when nothing visible differs there are no rows to show");
  eq(/Nothing you can see differs/.test(r.text), true,
     "…and it says so rather than asking an unanswerable question again");
  eq(r.buttons.length, 2, "…while still letting you pick");

  // ---- relative time ----
  r = await pg.evaluate(() => {
    const n = Date.now(), at = ms => new Date(n - ms).toISOString();
    return [syncAgo(at(5e3)), syncAgo(at(12e4)), syncAgo(at(36e5)), syncAgo(at(9e7)), syncAgo(""), syncAgo("nope")];
  });
  eq(r.slice(0, 4), ["just now", "2 min ago", "1 hour ago", "yesterday"], "times read in plain words");
  eq(r.slice(4), ["", ""], "…and a missing or unparseable date says nothing rather than 'NaN'");

  // ---- choosing still works ----
  r = await pg.evaluate(() => {
    cafes = [{ id: "c1", name: "Mine" }];
    _localSave = function(){};
    syncPersist = function(){};
    flushSync = function(){};
    syncPending = { c1: { token: "t", base: null, conflict: true,
                          value: { id: "c1", name: "Mine" }, remote: { id: "c1", name: "Theirs" } } };
    resolveSyncConflict(false);
    return { name: cafes[0].name, cleared: syncPending.c1 === undefined };
  });
  eq(r.name, "Theirs", "choosing the cloud replaces the local copy");
  eq(r.cleared, true, "…and clears the conflict");

  eq(errs, [], "no page errors");
  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
