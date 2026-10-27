/* Syncing without a Retry button (27 Oct).

   Saving a cafe and answering the ranking question left "Saved on this phone · 1 waiting to sync" until Retry sync
   was tapped. The answer saves two cafes back to back; the first started a sync, the second found it busy, and the
   running sync had already taken its list, so the second cafe was left with nothing to send it. And a sync that
   failed (a weak signal, a phone just woken) waited for the next save or a tap. Now a sync pass takes every cafe
   waiting, including one saved while it runs, and a sync that could not finish tries again by itself: on a timer,
   when Firebase reconnects, and when the app comes back to the screen. */
const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async () => {
  const srv = await serve();
  const b = await launch();
  const p = await b.newPage();
  await p.route("**://**", r => (r.request().url().startsWith(srv.origin) ? r.continue() : r.abort()));
  const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  await p.goto(srv.origin + "/index.html");
  await p.waitForTimeout(500);

  /* a stand-in for Firebase: every call takes `delay` ms, like a network; writes can fail or never answer */
  await p.evaluate(() => {
    window.wait = ms => new Promise(r => setTimeout(r, ms));
    window.arm = function (opts) {
      opts = opts || {};
      clearTimeout(_syncRetryTimer); _syncRetryN = 0; _syncLastErr = "";
      syncPending = {}; syncRemote = {}; syncBusy = false; syncFailure = "";
      localStorage.removeItem(OUTBOX_KEY); localStorage.removeItem(DIRTY_FLAG);
      SYNC_RETRY_MS = opts.retry || [60000]; SYNC_WRITE_MS = opts.writeMs || 30000;
      window.db = { a: { id: "a", name: "A", rating: 1, elo: 1500, matches: 8 }, b: { id: "b", name: "B", rating: 1, elo: 1500, matches: 8 } };
      window.mode = "ok";
      const snap = v => ({ val: () => JSON.parse(JSON.stringify(v == null ? null : v)) });
      fbDb = { ref: path => ({
        once: async () => { await wait(opts.delay || 0); return snap(db[path.slice(6)]); },
        on: () => {}, remove: () => Promise.resolve(),
        transaction: async fn => {
          await wait(opts.delay || 0);
          if (mode === "fail") throw Error("network down (test)");
          if (mode === "hang") return new Promise(() => {});
          const next = fn(JSON.parse(JSON.stringify(db[path.slice(6)] || null)));
          if (next === undefined) return { committed: false, snapshot: snap(db[path.slice(6)]) };
          db[path.slice(6)] = next;
          return { committed: true, snapshot: snap(next) };
        },
      }) };
      isAdmin = true; fbReady = true; fbAuth = { currentUser: { email: OWNER_EMAIL } };
      const copy = () => JSON.parse(JSON.stringify(db));
      noteCloudShape(copy()); cafes = syncOverlay(copy());
    };
    window.bar = () => { const el = document.getElementById("sync-status"); return el.hidden ? "" : el.querySelector(".sync-label").textContent; };
  });

  /* ---- a ranking answer: two cafes saved back to back ---- */
  const two = await p.evaluate(async () => {
    arm({ delay: 50 });
    const r = chaserApply("a", "b", false);
    await wait(800);
    return { cloud: [db.a.matches, db.b.matches], waiting: Object.keys(syncPending), bar: bar(), won: r.a.id };
  });
  eq([two.cloud, two.waiting, two.bar], [[9, 9], [], ""], "a ranking answer saves both cafes, and both reach the cloud with nothing left waiting");
  const mid = await p.evaluate(async () => {
    arm({ delay: 60 });
    cafes.find(c => c.id === "a").rating = 5; saveCafe("a");
    await wait(30);                                   /* the first sync is on its way */
    cafes.find(c => c.id === "b").rating = 3; saveCafe("b");
    await wait(600);
    return { cloud: [db.a.rating, db.b.rating], waiting: Object.keys(syncPending) };
  });
  eq(mid, { cloud: [5, 3], waiting: [] }, "a cafe saved while another is syncing goes in the same pass");

  /* ---- a failed sync tries again by itself ---- */
  const retry = await p.evaluate(async () => {
    arm({ retry: [150, 150, 150] });
    mode = "fail";
    cafes.find(c => c.id === "a").rating = 4; saveCafe("a");
    await wait(60);
    const failing = bar();
    await wait(400);                                  /* two or three automatic tries, all failing */
    const logged = readProblems().filter(x => /network down \(test\)/.test(x.msg)).length;
    mode = "ok";
    await wait(400);
    return { failing, logged, cloud: db.a.rating, waiting: Object.keys(syncPending), after: bar() };
  });
  eq(/^Waiting to sync · trying again by itself/.test(retry.failing), true, "when a sync fails the bar says it will try again by itself (" + retry.failing + ")");
  eq([retry.cloud, retry.waiting, retry.after], [4, [], ""], "…and it does: once the network is back the edit lands with no tap");
  eq(retry.logged, 1, "the same failure on every try is logged once in Problems, not once a try");

  const hang = await p.evaluate(async () => {
    arm({ retry: [150], writeMs: 120 });
    mode = "hang";
    cafes.find(c => c.id === "b").rating = 2; saveCafe("b");
    await wait(200);
    const stuck = { busy: syncBusy, waiting: Object.keys(syncPending).length, bar: bar() };
    mode = "ok";
    await wait(400);
    return { stuck, cloud: db.b.rating, waiting: Object.keys(syncPending) };
  });
  eq([hang.stuck.busy, hang.stuck.waiting, /^Waiting to sync/.test(hang.stuck.bar)], [false, 1, true], "a write that never answers lets go of the queue and keeps the edit");
  eq([hang.cloud, hang.waiting], [2, []], "…and the next automatic try sends it");

  /* ---- reconnecting, and coming back to the app ---- */
  const conn = await p.evaluate(async () => {
    arm();
    let onConnected = null;
    syncWatch({ ref: path => ({ on: (ev, fn) => { if (path === ".info/connected") onConnected = fn; } }) });
    fbReady = false;                                  /* the connection is down when the edit is made */
    cafes.find(c => c.id === "a").rating = 2; saveCafe("a");
    const before = db.a.rating;
    fbReady = true;
    onConnected({ val: () => true });                 /* Firebase says it is connected again */
    await wait(100);
    return { before, after: db.a.rating, waiting: Object.keys(syncPending) };
  });
  eq(conn, { before: 1, after: 2, waiting: [] }, "an edit made with no connection is sent the moment Firebase reconnects");

  const back = await p.evaluate(async () => {
    arm();
    fbReady = false;
    cafes.find(c => c.id === "b").rating = 5; saveCafe("b");
    fbReady = true;
    document.dispatchEvent(new Event("visibilitychange"));   /* the app comes back to the screen */
    await wait(100);
    return { cloud: db.b.rating, waiting: Object.keys(syncPending) };
  });
  eq(back, { cloud: 5, waiting: [] }, "…and when the app comes back to the screen");

  const signin = await p.evaluate(async () => {
    arm();
    let asked = 0;
    const real = ensureAuth;
    ensureAuth = () => { asked++; return Promise.resolve(null); };
    fbAuth = null;
    cafes.find(c => c.id === "a").rating = 3; saveCafe("a");
    ensureAuth = real;
    return { asked, waiting: Object.keys(syncPending).length };
  });
  eq(signin, { asked: 1, waiting: 1 }, "the owner's edit with the sign-in script not loaded yet fetches it, and the edit waits for it");

  await p.evaluate(() => { clearTimeout(_syncRetryTimer); SYNC_RETRY_MS = [3000, 10000, 30000, 60000, 120000]; });
  eq(errs, [], "no page errors");
  await b.close();
  srv.close();
  process.exit(done() ? 0 : 1);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
