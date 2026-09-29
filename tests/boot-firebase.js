/* The app starts against a connected, real-shaped Firebase.

   Every other test boots with Firebase unreachable, so the code that only runs once the cloud
   answers — loading private spots, healing old exact records, the rule probe — never ran at
   startup under test. On 29 Sep that is where it broke: the owner published the private rule,
   the private read started succeeding, and a private spot with no pin reached Firebase with
   `lat: undefined`. Firebase throws on that synchronously, the throw escaped load(), and boot
   skipped everything after it — a blank map and no editing mode on every device.

   The fake here behaves like the real thing where it matters: it stores no nulls (a pinless
   spot arrives with no lat/lng keys at all) and set() throws on any undefined. */
const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
const fs = require("fs"), path = require("path");

const list = JSON.parse(fs.readFileSync(path.join(ROOT, "cafes.json"), "utf8"));
const arr = Array.isArray(list) ? list : Object.values(list);
const keyed = {};
arr.forEach(c => { const o = JSON.parse(JSON.stringify(c)); Object.keys(o).forEach(k => { if (o[k] === null) delete o[k]; }); keyed[c.id] = o; });
/* one private spot with no pin (as Kimi Matcha is), one still holding an exact location */
const pinless = Object.values(keyed).find(c => c.custom && c.lat == null);
const exact = Object.values(keyed).find(c => c.custom && c.lat != null);
exact.lat = 30.12345; exact.lng = -140.67891; exact.area = "742 Evergreen Terrace #12";

(async () => {
  const srv = await serve();
  const b = await launch();

  const boot = async ({ owner, lateAuth, privateThrows }) => {
    const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage(); const errs = [];
    pg.on("pageerror", e => errs.push(String(e)));
    await pg.route("**://**", r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
    await pg.addInitScript(([data, owner, lateAuth, privateThrows]) => {
      window.__rej = []; window.addEventListener("unhandledrejection", e => window.__rej.push(String(e.reason)));
      if (owner) try { localStorage.setItem("cafemap.admin", "1"); } catch (e) {}
      const store = { cafes: data, private: {} }; window.__store = store; window.__writes = [];
      const get = p => p.split("/").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), store);
      const put = (p, v) => { const ks = p.split("/").filter(Boolean); let o = store; ks.slice(0, -1).forEach(k => { o[k] = o[k] || {}; o = o[k]; });
        if (v === null) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = JSON.parse(JSON.stringify(v)); window.__writes.push(p); };
      const snap = p => ({ val: () => { const v = get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, exists: () => get(p) !== undefined });
      const noUndef = (x, at) => { if (x === undefined) throw new Error("set failed: value argument contains undefined in property '" + at + "'");
        if (x && typeof x === "object") Object.keys(x).forEach(k => noUndef(x[k], at + "." + k)); };
      const listeners = []; const fire = () => listeners.forEach(([p, cb]) => setTimeout(() => cb(snap(p)), 5));
      const later = f => new Promise(r => setTimeout(() => r(f()), 10));
      const ref = p => ({
        once: () => new Promise(r => setTimeout(() => r(snap(p)), 20)),
        on: (ev, cb) => { listeners.push([p, cb]); setTimeout(() => cb(snap(p)), 30); return cb; }, off: () => {},
        set: v => { noUndef(v, p.replace(/\//g, "."));
          if (privateThrows && p.startsWith("private/") && !p.endsWith("__rulesprobe")) throw new Error("simulated synchronous refusal");
          return later(() => { put(p, v); fire(); }); },
        remove: () => later(() => { put(p, null); fire(); }),
        transaction: fn => later(() => { const nv = fn(snap(p).val()); if (nv === undefined) return { committed: false, snapshot: snap(p) };
          put(p, nv); fire(); return { committed: true, snapshot: snap(p) }; }),
        child: k => ref(p + "/" + k)
      });
      const user = owner ? { email: "jorgemarco.portillo@gmail.com", emailVerified: true } : null;
      const auth = { currentUser: lateAuth ? null : user,
        onAuthStateChanged: cb => setTimeout(() => { auth.currentUser = user; cb(user); }, lateAuth ? 900 : 50),
        signOut: () => Promise.resolve(), signInWithPopup: () => Promise.resolve(), signInWithRedirect: () => Promise.resolve() };
      const fb = { apps: [], initializeApp: (c, n) => { const a = { name: n || "[DEFAULT]" }; fb.apps.push(a); return a; },
                   database: () => ({ ref }), auth: () => auth };
      fb.auth.GoogleAuthProvider = function () {};
      Object.defineProperty(window, "firebase", { get: () => fb, set: () => {}, configurable: true });
    }, [keyed, owner, !!lateAuth, !!privateThrows]);
    await pg.goto(srv.origin + "/index.html", { waitUntil: "load" });
    await pg.waitForTimeout(2600);
    const st = await pg.evaluate(([pinId, exactId]) => ({
      mode: app.dataset.mode, cafes: cafes.length,
      maps: !!document.querySelector('script[src*="maps.googleapis"]'),
      rej: window.__rej, writes: window.__writes,
      pub: window.__store.cafes[exactId], priv: (window.__store.private || {})[exactId],
      pinWritten: window.__writes.some(w => w.includes(pinId))
    }), [pinless.id, exact.id]);
    await ctx.close();
    return { ...st, errs };
  };

  // ---- the owner, signed in before the data arrives (what both devices did) ----
  let r = await boot({ owner: true });
  eq([r.errs, r.rej], [[], []], "the owner's startup throws nothing");
  eq(r.maps, true, "…asks Google for the map");
  eq(r.mode, "admin", "…and switches editing mode on");
  eq(r.cafes, arr.length, "every cafe loads (" + r.cafes + ")");
  eq(r.pinWritten, false, "a private spot with no pin is not mistaken for an exact one and is left alone");
  eq({ lat: r.pub.lat, lng: r.pub.lng, area: r.pub.area }, { lat: 30.12, lng: -140.68, area: "" },
     "an old exact private record is blurred in the public node");
  eq(r.priv && [r.priv.lat, r.priv.area], [30.12345, "742 Evergreen Terrace #12"], "…with the exact copy moved to private/");

  // ---- the owner, with sign-in arriving after the first load ----
  r = await boot({ owner: true, lateAuth: true });
  eq([r.errs, r.rej, r.maps, r.mode], [[], [], true, "admin"], "a late sign-in starts cleanly too, and still turns editing on");

  // ---- a visitor ----
  r = await boot({ owner: false });
  eq([r.errs, r.rej, r.maps, r.mode, r.writes], [[], [], true, "viewer", []],
     "a visitor gets the map and sends nothing");

  // ---- whatever the private side does, it cannot cost the map ----
  r = await boot({ owner: true, privateThrows: true });
  eq(r.maps, true, "even a private write that throws synchronously does not stop the map loading");
  eq(r.mode, "admin", "…or editing mode");
  eq(r.errs, [], "…and nothing escapes as a page error");

  const ok = done();
  await b.close(); srv.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
