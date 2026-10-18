"use strict";
/* storage.js — Load/save data, admin auth, import/export, seed data.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- storage ---------- */
async function load() {
  isAdmin = localStorage.getItem(ADMIN_FLAG) === "1";
  if (await loadCloud()) {
    await _privateSteps();
    return;
  }
  let published = null;
  try {
    const ctrl = new AbortController();
    const _to = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { signal: ctrl.signal });
    clearTimeout(_to);
    if (r.ok) published = await r.json();
  } catch (e) {
    warn("storage.js", e);
  }
  if (isAdmin) {
    const dirty = localStorage.getItem(DIRTY_FLAG) === "1";
    let local = null;
    try {
      local = JSON.parse(localStorage.getItem(KEY));
    } catch (e) {
      warn("storage.js", e);
    }
    if (dirty && local && local.length) {
      cafes = adoptCafes(local);
    } else if (published && published.length) {
      cafes = adoptCafes(published);
      localStorage.removeItem(KEY);
    } else {
      cafes = adoptCafes(local && local.length ? local : seed());
    }
  } else {
    let _lc = null;
    try {
      _lc = JSON.parse(localStorage.getItem(KEY) || "null");
    } catch (e) {
      warn("storage.js", e);
    }
    cafes = adoptCafes(published && published.length ? published : Array.isArray(_lc) && _lc.length ? _lc : seed());
  }
  await _privateSteps();
  if (!syncLastConfirmed && syncBootBase === null) syncBootBase = syncCopy(cafesById());
}
/* The private side is a refinement on top of the map, so nothing it does may stop the map
   loading. */
async function _privateSteps() {
  try {
    await loadPrivateDetail();
  } catch (e) {
    warn("storage.js", e);
  }
  try {
    healPrivateSpots();
  } catch (e) {
    warn("storage.js", e);
  }
}
/* Writes used to be one shape: the entire array, every time, from every caller. Two devices
   each writing everything meant the second silently erased whatever the first had added,
   because its copy predated that edit. These three say what they actually mean instead —
   one cafe, one deletion, or genuinely everything — so edits to different cafes stop
   colliding and the common save drops from ~61 KB to about 1 KB. */
function _localSave() {
  localStorage.setItem(KEY, JSON.stringify(cafes));
}
/* Everything. Also the migration: this is what reshapes the node from array to keyed. */
function save() {
  if (!isAdmin) return;
  /* Before the cloud has answered there is nothing real to compare with: every cafe would be queued
     against a null base and each one the cloud has since changed would turn into a conflict. Keep the
     change on this device and let the first snapshot work out what differs. */
  if (!syncLastConfirmed) {
    syncNeedsFullDiff = true;
    try {
      _localSave();
    } catch (e) {
      warn("storage.js", e);
    }
    return;
  }
  cafes.forEach(c => {
    if (!syncEqual(c, syncRemote[c.id])) queueCafe(c.id, c);
  });
}
/* One cafe. Two devices editing different cafes now write different paths and cannot
   overwrite one another. Falls back to a full write until the node has been reshaped. */
function saveCafe(id, base) {
  if (!isAdmin) return;
  const c = cafes.find(function (x) {
    return x && x.id === id;
  });
  if (!c) return save();
  return queueCafe(id, c, base);
}
/* One deletion. Call after the cafe is already out of the local array. */
function removeCafe(id) {
  if (!isAdmin) return;
  return queueCafe(id, null);
}
function applyMode() {
  app.dataset.mode = isAdmin ? "admin" : "viewer";
  if (typeof renderSettings === "function") renderSettings();
  if (!isAdmin && (app.dataset.view === "form" || app.dataset.view === "compare")) {
    if (listTab === "want") show("wish");
    else if (favOnly) show("list", true);
    else show(lastMain);
  }
  if (app.dataset.view === "stats") renderStats();
}
function authMsg(code) {
  if (code === "auth/operation-not-allowed" || code === "auth/configuration-not-found")
    return "Turn on Google sign-in: Firebase Console → Authentication → Sign-in method → Google → Enable.";
  if (code === "auth/unauthorized-domain")
    return "This site's domain isn't allowed. Add it in Firebase → Authentication → Settings → Authorized domains.";
  if (code === "auth/popup-blocked" || code === "auth/cancelled-popup-request")
    return "Your browser blocked the popup — allow popups for this site and try again.";
  if (code === "auth/popup-closed-by-user") return "Sign-in window closed.";
  return "Sign-in failed (" + code + ")";
}
function adminSignIn() {
  if (!fbAuth) {
    toast("Cloud not connected");
    return;
  }
  const prov = new firebase.auth.GoogleAuthProvider();
  fbAuth.signInWithPopup(prov).catch(e => {
    const code = (e && e.code) || "";
    console.error("Sign-in error", e);
    if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
      fbAuth.signInWithRedirect(prov).catch(er => toast(authMsg((er && er.code) || "")));
      return;
    }
    toast(authMsg(code));
  });
}
/* ---------- private spots: the owner-only half ----------
   A private spot is stored twice. The public "cafes" node keeps the blurred pin and no street
   address, exactly as everyone sees it. The exact address lives under PRIVATE_PATH, behind a
   database rule that only the owner's account can read (the rule text is in the README —
   without it this node is as public as the other one, so it is not optional). */
/* The exact address has to survive a refused write. The cloud write can fail for precisely
   the reason this feature exists — a missing database rule — and by the time it runs the
   public copy has already been blurred, so a dropped write would destroy the only precise
   copy there is. It is mirrored on this device, retried, and the failure is said out loud
   rather than left in console.warn.

   The mirror only ever exists on the owner's own device: for anyone else privDetail stays
   empty and nothing is written. */
const PRIV_MIRROR = "cafemap.private.v1";
const PRIV_QUEUE = "cafemap.private.pending.v1";
let privPending = {},
  _privWarned = false;
function _readPrivStore(k) {
  try {
    const v = JSON.parse(localStorage.getItem(k) || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) return v;
  } catch (e) {
    warn("storage.js", e);
  }
  return {};
}
function persistPrivate() {
  lsSet(PRIV_MIRROR, JSON.stringify(privDetail));
  lsSet(PRIV_QUEUE, JSON.stringify(privPending));
}
/* A queue entry is {base, value}: what this device last knew the cloud held, and what it wants
   there. Older releases queued the bare value (or null for a removal), and those still work — they
   just carry no base, so they write unconditionally as before. */
/* Signing out leaves this browser holding no exact address. It used to keep the whole owner-only copy in local
   storage, readable by anyone who opens the browser's developer tools afterwards: fine on your own phone, not on
   a borrowed laptop. A write still waiting for the cloud is the one thing kept, with only what it needs, because
   dropping it would lose the address; it leaves the device the next time you sign in and it lands. */
function forgetPrivateHere() {
  const waiting = Object.keys(privPending);
  const keep = {};
  waiting.forEach(function (id) {
    if (Object.prototype.hasOwnProperty.call(privDetail, id)) keep[id] = privDetail[id];
  });
  privDetail = keep;
  try {
    if (Object.keys(keep).length) lsSet(PRIV_MIRROR, JSON.stringify(keep));
    else localStorage.removeItem(PRIV_MIRROR);
    if (!waiting.length) localStorage.removeItem(PRIV_QUEUE);
  } catch (e) {
    warn("storage.js", e);
  }
  return waiting.length;
}
function _privOp(e) {
  if (e && typeof e === "object" && Object.prototype.hasOwnProperty.call(e, "value")) return e;
  return { value: e === undefined ? null : e, legacy: true };
}
function _privSame(a, b) {
  return syncEqual(a == null ? null : a, b == null ? null : b);
}
function loadPrivateDetail() {
  /* Start from this device whoever is looking, so the saved copies are in memory before anything can
     persist over them. Showing them is gated elsewhere (privFor needs the owner), and a device that
     was never the owner's has nothing stored. Emptying these in memory used to let the first private
     save write a near-empty mirror and queue over the saved ones. */
  privDetail = _readPrivStore(PRIV_MIRROR);
  privPending = _readPrivStore(PRIV_QUEUE);
  if (!ownerSignedIn()) return Promise.resolve();
  if (!fbReady) return Promise.resolve();
  return _privRetryDenied(function () {
    return fbDb.ref(PRIVATE_PATH).once("value");
  })
    .then(function (s) {
      const cloud = s.val() || {};
      /* Cloud wins, except where this device still holds a write the cloud never accepted —
       including a pending deletion. */
      const merged = Object.assign({}, cloud);
      Object.keys(privPending).forEach(function (k) {
        const op = _privOp(privPending[k]);
        if (op.value === null) delete merged[k];
        else merged[k] = op.value;
      });
      privDetail = merged;
      persistPrivate();
      _privOk();
      flushPrivate();
    })
    .catch(function (e) {
      warn("storage.js", e);
      /* A refused read means the rule is missing or wrong — the same cause as a refused write,
       and worth saying now rather than at the next save. Anything else is not the rules. */
      privateWriteFailed(e);
    });
}
/* The database sends the signed-in user's token a moment after sign-in. A read or write made in that
   gap goes out as a stranger's and is refused, which looks exactly like a missing rule. Wait for the
   token first, and if a request is still refused, fetch a fresh token and try once more before
   concluding anything about the rules. */
function _privAuthed() {
  try {
    const u = fbAuth && fbAuth.currentUser;
    if (u && typeof u.getIdToken === "function")
      return Promise.resolve(u.getIdToken()).then(
        function () {},
        function () {}
      );
  } catch (e) {
    warn("storage.js", e);
  }
  return Promise.resolve();
}
function _privDenied(e) {
  return /permission[_ ]denied/i.test(String((e && e.code) || "") + " " + String((e && e.message) || ""));
}
function _privRetryDenied(run) {
  return _privAuthed()
    .then(run)
    .catch(function (e) {
      const u = fbAuth && fbAuth.currentUser;
      if (!_privDenied(e) || !u || typeof u.getIdToken !== "function") throw e;
      return Promise.resolve(u.getIdToken(true)).then(run);
    });
}
/* A private read or write that the owner's account just completed proves the owner's rule is in place, so
   a warning raised earlier (a request made before the token arrived, say) is withdrawn. */
function _privOk() {
  if (!_ruleFindings.owner) return;
  delete _ruleFindings.owner;
  _privLastError = "";
  if (_ruleFindings.map || _ruleFindings.db || _ruleFindings.read) {
    showRuleWarning();
    return;
  }
  const el = $("rule-warn");
  if (el) el.hidden = true;
}
let _privLastError = ""; /* what Firebase actually said, shown in the banner */
/* Said once a session. A refusal (PERMISSION_DENIED) is the rules; anything else — the network, a
   bug — is not, and used to be reported as "the private rule is missing". Either way the address is
   kept on this device and queued, and the banner and console now carry Firebase's own words. */
function privateWriteFailed(e) {
  const code = (e && e.code) || "",
    msg = (e && e.message) || (e ? String(e) : "");
  const said = (code && msg.indexOf(code) < 0 ? code + ": " : "") + msg;
  if (e) {
    console.warn("private/ failed:", said);
    _privLastError = said.slice(0, 200);
  }
  if (e && !_privDenied(e)) {
    if (_privWarned) return;
    _privWarned = true;
    toast("Private address kept on this device — couldn't reach the cloud (" + _privLastError.slice(0, 90) + ")");
    return;
  }
  _ruleFindings.owner = true;
  showRuleWarning();
  if (_privWarned) return;
  _privWarned = true;
  toast("Private address kept on this device — the cloud refused it. Check the database rules (see README).");
}
function flushPrivate() {
  const ids = Object.keys(privPending);
  if (!ids.length) return;
  if (!fbReady || !ownerSignedIn()) return;
  ids.forEach(function (id) {
    const entry = privPending[id];
    const op = _privOp(entry);
    const ref = fbDb.ref(PRIVATE_PATH + "/" + id);
    /* Firebase THROWS (synchronously, not a rejected promise) on an undefined anywhere in the
       value, so strip them, and keep any throw to this one entry. */
    let write;
    try {
      if (op.legacy || op.value === null) {
        write = _privRetryDenied(function () {
          return op.value === null ? ref.remove() : ref.set(_privClean(op.value));
        });
      } else {
        /* Write only if the cloud still holds what this device last saw (or already holds what it is
           about to write). Another device's newer address is kept, not overwritten. This reads the
           server's value and then writes rather than using a transaction: a transaction on a path
           nothing is listening to starts from an empty cache, aborts at once when the base is not
           null, and would have read as "changed elsewhere". One owner, so the gap between the read
           and the write is not a real race. */
        write = _privRetryDenied(function () {
          return ref.once("value").then(function (snap) {
            const cur = snap.val();
            if (!(_privSame(cur, op.base) || _privSame(cur, op.value))) {
              const e = new Error("private-changed-elsewhere");
              /** @type {any} */ (e).cloud = cur;
              throw e;
            }
            return ref.set(_privClean(op.value));
          });
        });
      }
    } catch (e) {
      warn("storage.js", e);
      return;
    }
    write
      .then(function () {
        _privOk();
        if (privPending[id] === entry) {
          delete privPending[id];
          persistPrivate();
        }
      })
      .catch(function (e) {
        warn("storage.js", e);
        if (e && e.message === "private-changed-elsewhere") {
          if (privPending[id] !== entry) return;
          delete privPending[id];
          if (e.cloud == null) delete privDetail[id];
          else privDetail[id] = e.cloud;
          persistPrivate();
          toast("Another device changed a private address — kept that one");
          return;
        }
        privateWriteFailed(e);
      });
  });
}
function _privClean(v) {
  return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v;
}
function savePrivateDetail(id, exact) {
  exact = _privClean(exact);
  const have = Object.prototype.hasOwnProperty.call(privDetail, id) ? privDetail[id] : null;
  /* Never replace a saved exact address with the blurred copy of it. That is what the form holds when
     the private side had not loaded yet, and it would destroy the only precise copy there is. */
  const c = cafes.find(function (x) {
    return x && x.id === id;
  });
  if (have && c && c.custom && exact && _privSameLoc(exact, c) && !_privSameLoc(have, exact)) {
    warn("storage.js", "kept the saved private address for " + id + " instead of its blurred copy");
    return;
  }
  const prev = privPending[id] === undefined ? null : _privOp(privPending[id]);
  const entry = { base: prev && !prev.legacy ? prev.base : have, value: exact };
  privDetail[id] = exact;
  privPending[id] = _privClean(entry);
  persistPrivate();
  flushPrivate();
}
/* Same place, to the precision a pin is stored at. */
function _privSameLoc(a, b) {
  const n = function (v) {
    return v == null ? null : v;
  };
  const near = function (x, y) {
    return x === y || (x !== null && y !== null && Math.abs(x - y) < 0.00002);
  };
  return (a.area || "") === (b.area || "") && near(n(a.lat), n(b.lat)) && near(n(a.lng), n(b.lng));
}
/* `force` spends a write even when we hold no local record of one. Deleting a cafe passes it,
   because an address left behind for a cafe that no longer exists is exactly the leak this is
   for — better a redundant no-op remove than an orphan. An ordinary save does not, so saving
   any of a hundred normal cafes costs nothing. */
function removePrivateDetail(id, force) {
  const had = Object.prototype.hasOwnProperty.call(privDetail, id);
  delete privDetail[id];
  if (!had && !force) {
    if (privPending[id] !== undefined) {
      delete privPending[id];
      persistPrivate();
    }
    return;
  }
  /* null is the queue's "remove this", so a deletion is as durable as a write */
  privPending[id] = null;
  persistPrivate();
  flushPrivate();
}
/* A private spot saved before any of this still has its exact address sitting in the public
   node. Hide it. The precise copy is kept first — on this device (mirror + retry queue, the
   same durable path as any private save) and in private/ as soon as the rules allow — and
   the blurred record is published second, through the outbox.

   It used to wait for private/ to accept the precise copy before blurring the public one.
   Under rules with no private block that write is refused, so the blur never ran and the
   exact address stayed world-readable with only a console line to say so — which is what
   the live rules were doing on 29 Sep. The public copy no longer waits on anything.

   Only the owner runs it, and only once in editing mode: the entry stays queued until then,
   so a heal found before sign-in is not dropped. */
function healPrivateSpots() {
  const ids = Object.keys(_needsHeal);
  if (!ids.length) return;
  if (!fbReady || !ownerSignedIn() || !isAdmin) return;
  ids.forEach(function (id) {
    try {
      const exact = _needsHeal[id];
      delete _needsHeal[id];
      const c = cafes.find(function (x) {
        return x.id === id;
      });
      if (!c) return;
      savePrivateDetail(id, exact);
      Promise.resolve(saveCafe(id))
        .then(function () {
          if (!syncPending[id]) toast("Hid " + c.name + "'s exact location from the public map \u2713");
        })
        .catch(function (e) {
          warn("storage.js", e);
        });
    } catch (e) {
      warn("storage.js", e);
    }
  });
}
/* ---------- can a stranger read your private spots, or change your map? ----------
   The whole arrangement rests on database rules nobody in the app could see, published by
   hand in a console, and a missing one fails silently: reads come back empty, writes are
   refused, or — with the test-mode defaults — everything is quietly open to everyone. So
   check from the outside.

   A SECOND, unauthenticated Firebase app asks the questions. Auth state is per app instance,
   so this is a stranger asking even while the owner is signed in on the main one.

   Read: `private/` must REJECT it. If the read resolves — with data or with null — the path is
   world-readable and every private address on it is public.

   Write: this used to be left out ("proving the database is writable would mean writing to
   it"). Deleting a key that does not exist answers the question without that cost: it is
   still a write, so the rules judge it, but when it is allowed it changes nothing — no data,
   no events on the owner's listener. The promise resolves only on the server's say-so, so a
   resolve is proof, and a rejection (or no connection at all) says nothing.

   Only the owner's browser asks: visitors never send the probes, and the answer is for the
   one person who can fix it. It runs at boot when the device remembers the owner, and again
   the moment the owner signs in, so a first sign-in is not missed. */
let _ruleProbeDone = false;
const RULE_PROBE_KEY = "__rulesprobe";
const _ruleFindings = {};
function probePrivateRule() {
  if (_ruleProbeDone || !isAdmin || !fbReady || !window.firebase || !FIREBASE_CONFIG) return;
  _ruleProbeDone = true;
  let probe, db;
  try {
    probe =
      (firebase.apps || []).filter(function (a) {
        return a.name === "ruleprobe";
      })[0] || firebase.initializeApp(FIREBASE_CONFIG, "ruleprobe");
    db = firebase.database(probe);
  } catch (e) {
    warn("storage.js", e);
    return;
  }
  const found = function (k) {
    _ruleFindings[k] = true;
    showRuleWarning();
  };
  const ask = function (run, k) {
    try {
      Promise.resolve(run())
        .then(function () {
          found(k);
        })
        .catch(function () {
          /* refused: the good outcome */
        });
    } catch (e) {
      warn("storage.js", e);
    }
  };
  ask(function () {
    return db.ref(PRIVATE_PATH).once("value");
  }, "read");
  ask(function () {
    return db.ref("cafes/" + RULE_PROBE_KEY).set(null);
  }, "map");
  ask(function () {
    return db.ref(PRIVATE_PATH + "/" + RULE_PROBE_KEY).set(null);
  }, "db");
  ask(function () {
    return db.ref(RULE_PROBE_KEY).set(null);
  }, "db");
}
/* Worst first. An open map outranks the rest; the private-read line is added when it applies,
   since that one exposes addresses rather than risking edits. */
const RULE_WARN_TEXT = {
  map: "<b>Anyone can edit or delete your map.</b> Your database accepts changes from people who are not signed in.",
  db: "<b>Strangers can write to your database.</b> Your map is locked, but other parts of the database accept changes from people who are not signed in.",
  owner:
    "<b>Your private spots are not backed up.</b> The <code>private</code> rule is missing, so the cloud refuses their exact locations — they are kept only on this device.",
  read: "<b>Your private addresses are readable by anyone.</b> The <code>private</code> rule is missing.",
};
function showRuleWarning() {
  const el = $("rule-warn"),
    txt = $("rule-warn-text");
  if (!el || !isAdmin) return;
  const f = _ruleFindings,
    lines = [];
  if (f.map) lines.push(RULE_WARN_TEXT.map);
  else if (f.db) lines.push(RULE_WARN_TEXT.db);
  if (f.read) lines.push(RULE_WARN_TEXT.read);
  else if (f.owner)
    lines.push(
      RULE_WARN_TEXT.owner + (_privLastError ? " <small>Firebase said: " + esc(_privLastError) + "</small>" : "")
    );
  if (!lines.length) return;
  if (txt)
    txt.innerHTML =
      lines.join(" ") +
      " Copy the rules block in README.md into Firebase console → Realtime Database → Rules → Publish.";
  el.hidden = false;
}
function dismissRuleWarning() {
  const el = $("rule-warn");
  if (el) el.hidden = true;
}
function resyncDirty() {
  return flushSync();
}
/* Auth is a separate script that only the owner needs, so it is fetched on demand rather than by
   every visitor. Resolves with fbAuth, or null if Firebase or the script is unavailable.
   Safe to call repeatedly: it loads once, and wires initAuth() once. initAuth() copes with the
   answer arriving after the data has loaded (that is the "late sign-in" path boot-firebase tests). */
let _authLoading = null;
function _authReady() {
  try {
    fbAuth = firebase.auth();
  } catch (e) {
    warn("storage.js", e);
    fbAuth = null;
    return null;
  }
  initAuth();
  return fbAuth;
}
function ensureAuth() {
  if (fbAuth) return Promise.resolve(fbAuth);
  if (!fbReady || !window.firebase) return Promise.resolve(null);
  if (typeof firebase.auth === "function") return Promise.resolve(_authReady());
  if (_authLoading) return _authLoading;
  _authLoading = new Promise(function (resolve) {
    const s = document.createElement("script");
    s.src = FIREBASE_AUTH_SRC;
    s.async = true;
    s.onload = function () {
      resolve(_authReady());
    };
    s.onerror = function () {
      _authLoading = null;
      resolve(null);
    };
    document.head.appendChild(s);
  });
  return _authLoading;
}
function initAuth() {
  if (!fbAuth) return;
  fbAuth.onAuthStateChanged(u => {
    const ok = !!(u && u.email && u.email.toLowerCase() === OWNER_EMAIL.toLowerCase());
    if (u && !ok) {
      toast("That account can't edit this map");
      fbAuth.signOut();
      return;
    }
    if (ok) {
      if (!isAdmin) {
        isAdmin = true;
        lsSet(ADMIN_FLAG, "1");
        applyMode();
        toast("Admin mode - signed in");
      }
      probePrivateRule();
      load().then(() => {
        if (gReady) renderMarkers();
        renderList();
        resyncDirty();
      });
    } else if (!ok && isAdmin) {
      isAdmin = false;
      localStorage.removeItem(ADMIN_FLAG);
      const waiting = forgetPrivateHere();
      if (waiting) toast(waiting + " private address" + (waiting === 1 ? " is" : "es are") + " still waiting to sync, so kept on this device until you sign in again");
      applyMode();
      load().then(() => {
        if (gReady) renderMarkers();
        renderList();
      });
      toast("Viewer mode");
    }
  });
}
function toggleAdmin() {
  /* Sign in needs the auth script, which a visitor has not downloaded yet. Settings preloads it,
     so by the tap it is normally here; if not, fetch it now. */
  if (!fbAuth && fbReady && !isAdmin) {
    ensureAuth().then(function (a) {
      if (a) adminSignIn();
      else toast("Couldn't load Google sign-in. Check your connection and try again.");
    });
    return;
  }
  if (fbAuth) {
    if (isAdmin) {
      if (confirm("Sign out of editing mode?")) fbAuth.signOut().then(() => toast("Viewer mode"));
    } else {
      adminSignIn();
    }
    return;
  }
  if (isAdmin) {
    if (confirm("Sign out of admin (editing) mode?")) {
      isAdmin = false;
      localStorage.removeItem(ADMIN_FLAG);
      applyMode();
      load().then(() => {
        renderMarkers();
        show(lastMain);
      });
      toast("Viewer mode");
    }
    return;
  } /* There used to be a shared-passphrase path here for when Firebase auth was unavailable. The
   passphrase sat in js/config.js, served to every visitor, so it protected nothing, and the
   database rules never honoured it. Removed: editing needs the owner's Google sign-in. */
  toast("Editing needs Google sign-in, which isn't available right now. Check your connection and reload.");
}
function importPublished() {
  if (!isAdmin) {
    toast("Sign in to edit first");
    return;
  }
  if (!fbReady) {
    toast("Cloud not connected");
    return;
  }
  if (!confirm("Replace the cloud data with cafes.json from the site? This overwrites what's currently in the cloud."))
    return;
  fetch(DATA_URL + "?t=" + Date.now())
    .then(r => r.json())
    .then(d => {
      if (!Array.isArray(d) || !d.length) {
        toast("cafes.json looks empty");
        return;
      }
      return fbDb
        .ref("cafes")
        .set(
          d.reduce(function (o, c) {
            if (c && c.id) o[c.id] = c;
            return o;
          }, {})
        )
        .then(() => {
          _cloudKeyed = true;
          cafes = adoptCafes(d);
          try {
            lsSet(KEY, JSON.stringify(cafes));
          } catch (e) {
            warn("storage.js", e);
          }
          localStorage.removeItem(DIRTY_FLAG);
          if (gReady) renderMarkers();
          renderList();
          toast("Imported " + d.length + " cafes \u2713");
        });
    })
    .catch(() => toast("Couldn't load cafes.json"));
}
/* A copy of your cafes as a file you can keep anywhere. It reads the list and writes nothing: in particular it does
   not touch the "edits not synced yet" flag (the old export cleared it, which a download must never do). It holds
   what the app holds, so a private spot is as blurred in it as it is in the cloud. */
function downloadCopy() {
  const blob = new Blob([JSON.stringify(cafes, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "cafes-" + localToday() + ".json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  toast("Copy downloaded \u2713");
}
/* The card in Settings: what a copy would hold, and when the automatic daily backup last ran, read from the
   backup file's own date. Offline or unreadable, it says what the backup is rather than when. */
function renderDataCard() {
  const n = $("ab-copynote"),
    bk = $("ab-backup");
  if (n) {
    const visited = cafes.filter(function (c) {
      return !c.wish;
    }).length;
    n.textContent = visited + " visited cafes" + (cafes.length > visited ? " and " + (cafes.length - visited) + " to try" : "") + ". Saves a file you can keep anywhere.";
  }
  if (!bk) return;
  bk.textContent = "Backed up automatically every day, and every version is kept on GitHub.";
  if (typeof fetch !== "function") return;
  fetch(DATA_URL + "?t=" + Date.now(), { method: "HEAD" })
    .then(function (r) {
      const lm = r.ok && r.headers.get("last-modified"),
        d = lm && new Date(lm);
      if (d && !isNaN(d.getTime()))
        bk.textContent =
          "\u2713 Backed up automatically every day. The last one was " +
          d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          ", and every version is kept on GitHub.";
    })
    .catch(function () {});
}
function revertPublished() {
  if (!confirm("Reload the latest saved data and discard unsynced local edits?")) return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(DIRTY_FLAG);
  load().then(() => {
    renderMarkers();
    show("list");
    toast("Reloaded latest data");
  });
}
function seed() {
  return [
    {
      id: uid(),
      name: "Morning Glass Coffee",
      area: "Manoa",
      lat: 21.314,
      lng: -157.8087,
      photo: null,
      emoji: "☕",
      rating: 5,
      fav: true,
      tags: ["cozy", "pastries"],
      review: "Tucked-away neighborhood spot. The flat white is excellent and the breakfast sandwich is a must.",
      drinks: [
        { n: "Flat white", p: "$5" },
        { n: "Cold brew", p: "$5.5" },
      ],
    },
    {
      id: uid(),
      name: "ARS Cafe",
      area: "Diamond Head",
      lat: 21.268,
      lng: -157.805,
      photo: null,
      emoji: "🍦",
      rating: 4,
      fav: false,
      tags: ["outdoor", "specialty"],
      review: "Great post-beach stop. Affogato hits after a Diamond Head hike.",
      drinks: [{ n: "Affogato", p: "$7" }],
    },
    {
      id: uid(),
      name: "Kai Coffee",
      area: "Waikiki",
      lat: 21.276,
      lng: -157.827,
      photo: null,
      emoji: "🥤",
      rating: 4,
      fav: false,
      tags: ["to-go", "good wifi"],
      review: "Reliable iced latte near the beach. Gets busy mid-morning.",
      drinks: [{ n: "Iced latte", p: "$6" }],
    },
  ];
}

/* Fill in brands that can be told from the names. Only empty brands are touched; `dry` writes nothing. */
function backfillBrands(dry) {
  const plan = brandBackfillPlan(cafes, KNOWN_BRANDS);
  if (dry || !plan.length) return plan;
  plan.forEach(p => {
    const c = cafes.find(x => x.id === p.id);
    if (c && !(c.brand || "").trim()) {
      c.brand = p.brand;
      saveCafe(c.id);
    }
  });
  return plan;
}
