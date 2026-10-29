/* ---------- reader tips (v120) ----------
   Readers could see everything and say nothing: a friend who knew a good place had no way to tell you from inside
   the app. Now a visitor can, from the end of Go or from a search that found nothing, and only you can read what
   they send (Settings, Tips from readers). The app stays one author: a tip changes nothing on the map until you make
   it a want-to-try yourself, in the form, and save it.

   Tips live in Firestore under their own rule (firestore.rules), not beside the map, because App Check is switched
   on per database (config.js says why). The App Check and Firestore scripts, and reCAPTCHA with them, load only when
   the sheet or the inbox opens, so a visitor who never opens it never loads them. With no RECAPTCHA_SITE_KEY in
   config.js tips are off, and nothing asks for one. */

/** Tips are on once config.js has the reCAPTCHA site key that App Check needs. */
function tipsOn() {
  return typeof RECAPTCHA_SITE_KEY === "string" && RECAPTCHA_SITE_KEY !== "";
}
/* the owner's inbox card in Settings shows only when tips are on */
if ($("card-tips")) $("card-tips").hidden = !tipsOn();

/** @param {string} src @param {string} sri @returns {Promise<boolean>} */
function _tipScript(src, sri) {
  return new Promise(function (resolve) {
    const s = document.createElement("script");
    s.src = src;
    s.integrity = sri;
    s.crossOrigin = "anonymous";
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.head.appendChild(s);
  });
}
/** @typedef {{id: string, place: string, where: string, order: string, from: string, via: string, at: Date|null}} Tip */
/** @typedef {{add: (t: object) => Promise<void>, list: () => Promise<Tip[]>, remove: (id: string) => Promise<void>}} TipStore */
/** @type {Promise<TipStore|null>|null} */
let _tipStore = null;
/** The tips in Firestore, behind App Check, loaded on first use; null when tips are off or Firebase can't be reached
    (asked again next time). The tests stand a fake in for this one function. @returns {Promise<TipStore|null>} */
function tipStore() {
  if (_tipStore) return _tipStore;
  const p = (async function () {
    if (!tipsOn() || !fbReady || !window.firebase) return null;
    if (typeof firebase.appCheck !== "function" && !(await _tipScript(FIREBASE_APPCHECK_SRC, FIREBASE_APPCHECK_SRI))) return null;
    if (typeof firebase.firestore !== "function" && !(await _tipScript(FIREBASE_FIRESTORE_SRC, FIREBASE_FIRESTORE_SRI))) return null;
    /* App Check first: Firestore asks it for a token with every request, and refuses without one */
    firebase.appCheck().activate(new firebase.appCheck.ReCaptchaV3Provider(RECAPTCHA_SITE_KEY), true);
    const col = firebase.firestore().collection("tips");
    return {
      add: t => col.add(Object.assign({}, t, { at: firebase.firestore.FieldValue.serverTimestamp() })).then(() => undefined),
      list: () =>
        col
          .orderBy("at", "desc")
          .limit(100)
          .get()
          .then(q => q.docs.map(d => Object.assign({ id: d.id }, d.data(), { at: d.get("at") ? d.get("at").toDate() : null }))),
      remove: id => col.doc(id).delete(),
    };
  })().catch(function (e) {
    warn("tips.js", e);
    return null;
  });
  _tipStore = p;
  p.then(s => {
    if (!s && _tipStore === p) _tipStore = null;
  });
  return p;
}
/* Firestore holds a write it cannot send and keeps trying, so a phone with no signal would say Sending… for ever.
   Past this long the sheet says it could not send, and the tip may still arrive later. */
const TIP_WAIT_MS = 20000;
/** @template T @param {Promise<T>} p @returns {Promise<T>} */
function _tipWithin(p) {
  return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timed out")), TIP_WAIT_MS))]);
}

/* ---------- a visitor's tip ---------- */
/* the limits firestore.rules holds each field to */
const TIP_MAX = { place: 80, where: 80, order: 200, from: 40 };
/** A tip as the rule takes it: each field trimmed, its spaces folded and cut to its limit; null without a place.
    @param {Record<string, any>} raw @param {string} via @returns {{place: string, where: string, order: string, from: string, via: string}|null} */
function cleanTip(raw, via) {
  /** @param {"place"|"where"|"order"|"from"} k */
  const f = k =>
    String(raw[k] == null ? "" : raw[k])
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, TIP_MAX[k]);
  const t = { place: f("place"), where: f("where"), order: f("order"), from: f("from"), via: via === "search" ? "search" : "go" };
  return t.place ? t : null;
}
let _tipVia = "go";
/** @param {string} k @param {string} label @param {string} ph @param {string} [val] */
function _tipField(k, label, ph, val) {
  return (
    '<label class="dnlab" for="tip-' + k + '">' + esc(label) + "</label>" +
    '<input id="tip-' + k + '" class="dntext qcin" type="text" maxlength="' + TIP_MAX[/** @type {"place"|"where"|"order"|"from"} */ (k)] + '" autocomplete="' +
    (k === "from" ? "given-name" : "off") + '" placeholder="' + esc(ph) + '" value="' + esc(val || "") + '"' +
    (k === "place" ? act("tipInput", [], "input") : "") + ">"
  );
}
/** @param {string} [place] what a search that found nothing was for @param {string} [via] go | search */
function openTipSheet(place, via) {
  if (!tipsOn() || isAdmin) return;
  _tipVia = via === "search" ? "search" : "go";
  openSheet(
    '<div class="tipbox" data-k="send"><span class="dngrab" aria-hidden="true"></span>' +
      '<div class="dnhead"><h2 id="dns-title">Know a place ' + esc(OWNER_NAME) + " should try?</h2><p>Only " + esc(OWNER_NAME) + " sees tips.</p></div>" +
      _tipField("place", "Place", "Name of the cafe", place) +
      _tipField("where", "Where", "City or neighbourhood") +
      _tipField("order", "What should " + OWNER_NAME + " order?", "Optional") +
      _tipField("from", "Your first name", "Optional") +
      '<p class="tipmsg" id="tip-msg" role="status"></p>' +
      '<div class="dnact"><button type="button" class="btn ghost"' + act("closeSheet") + ">Not now</button>" +
      '<button type="button" class="btn" id="tip-send"' + act("sendTip") + ((place || "").trim() ? "" : " disabled") + ">Send to " + esc(OWNER_NAME) + "</button></div>" +
      '<p class="tiplegal">Protected by reCAPTCHA. Google’s <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy Policy</a> and ' +
      '<a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms of Service</a> apply.</p></div>'
  );
  /* reCAPTCHA wants a moment to load, so it starts now rather than at Send */
  tipStore();
}
function tipInput() {
  const b = /** @type {HTMLButtonElement|null} */ ($("tip-send")),
    p = /** @type {HTMLInputElement|null} */ ($("tip-place"));
  if (b && p && b.textContent !== "Sending…") b.disabled = !p.value.trim();
}
/** @param {string} k */
function _tipVal(k) {
  const el = /** @type {HTMLInputElement|null} */ ($("tip-" + k));
  return el ? el.value : "";
}
async function sendTip() {
  const t = cleanTip({ place: _tipVal("place"), where: _tipVal("where"), order: _tipVal("order"), from: _tipVal("from") }, _tipVia);
  const btn = /** @type {HTMLButtonElement|null} */ ($("tip-send"));
  if (!t || !btn || btn.disabled) return;
  btn.disabled = true;
  btn.textContent = "Sending…";
  $("tip-msg").textContent = "";
  let ok = false;
  try {
    const st = await tipStore();
    if (st) {
      await _tipWithin(st.add(t));
      ok = true;
    }
  } catch (e) {
    warn("tips.js sendTip", e);
  }
  const open = document.querySelector('#dns-panel .tipbox[data-k="send"]');
  if (!open || $("dnsheet").hidden) {
    toast(ok ? "Tip sent to " + OWNER_NAME : "Couldn’t send your tip");
    return;
  }
  if (!ok) {
    btn.disabled = false;
    btn.textContent = "Send to " + OWNER_NAME;
    $("tip-msg").textContent = "Couldn’t send it. Check your connection and try again.";
    return;
  }
  $("dns-panel").innerHTML =
    '<div class="tipbox" data-k="sent"><span class="dngrab" aria-hidden="true"></span>' +
    '<div class="dnhead"><h2 id="dns-title">Sent. Thank you!</h2><p>' + esc(OWNER_NAME) + " reads every tip.</p></div>" +
    '<button type="button" class="btn dnclose"' + act("closeSheet") + ">Done</button></div>";
  const d = /** @type {HTMLElement|null} */ ($("dns-panel").querySelector(".dnclose"));
  if (d) d.focus();
}

/* ---------- your inbox ---------- */
/** @type {Tip[]} */
let _tips = [];
const _TIPS_HEAD =
  '<span class="dngrab" aria-hidden="true"></span><div class="dnhead"><h2 id="dns-title">Tips from readers</h2><p>Only you can read these.</p></div>';
function _tipsInboxOpen() {
  return !$("dnsheet").hidden && !!document.querySelector('#dns-panel .tipbox[data-k="inbox"]');
}
/** A cafe already on your list with this tip's name, if there is one. @param {Tip} t */
function tipCafe(t) {
  const a = (t.place || "").trim().toLowerCase();
  return (
    cafes.find(function (c) {
      const b = (c.name || "").trim().toLowerCase();
      return !!a && !!b && (a === b || a.startsWith(b + " ") || b.startsWith(a + " "));
    }) || null
  );
}
/** "Tip from Sam, Oct 26: Their seasonal latte · SoMa", for the new place's notes. @param {Tip} t */
function tipNote(t) {
  return (
    (t.from ? "Tip from " + t.from : "A reader’s tip") +
    (t.at ? ", " + _noteDay(statDayKey(t.at)) : "") +
    (t.order ? ": " + t.order : "") +
    (t.where ? " · " + t.where : "")
  );
}
/** @param {Tip[]|null} list null when it couldn't load */
function _tipsHTML(list) {
  let body;
  if (list == null) body = '<p class="tipmsg">Tips couldn’t load. Check your connection and try again.</p>';
  else if (!list.length)
    body = '<p class="tipmsg">No tips yet. Readers can send one from the end of Go, or from a search that finds nothing.</p>';
  else
    body = list
      .map(function (t) {
        const have = tipCafe(t);
        return (
          '<div class="tipitem"><b>' + esc(t.place) + "</b>" +
          (t.where ? "<span>" + esc(t.where) + "</span>" : "") +
          (t.order ? '<p class="tipq">“' + esc(t.order) + "”</p>" : "") +
          "<small>" + esc([t.from ? "From " + t.from : "No name", t.at ? _noteDay(statDayKey(t.at)) : "", t.via === "search" ? "via search" : "via Go"].filter(Boolean).join(" · ")) + "</small>" +
          '<div class="tipacts">' +
          (have
            ? '<span class="tiphave">' + (have.wish ? "On your want-to-try" : "Already on your list") + "</span>"
            : '<button type="button" class="btn"' + act("tipToWant", [t.id]) + ">" + ico("bookmark") + " Want to try</button>") +
          '<button type="button" class="btn ghost"' + act("dismissTip", [t.id]) + ">Dismiss</button></div></div>"
        );
      })
      .join("");
  return '<div class="tipbox" data-k="inbox">' + _TIPS_HEAD + body + '<button type="button" class="btn ghost dnclose"' + act("closeSheet") + ">Done</button></div>";
}
async function openTips() {
  if (!isAdmin || !tipsOn()) return;
  openSheet('<div class="tipbox" data-k="inbox">' + _TIPS_HEAD + '<p class="tipmsg" role="status">Loading tips…</p></div>');
  /* reading tips needs you signed in, as the rule says */
  if (typeof ensureAuth === "function") await ensureAuth();
  /** @type {Tip[]|null} */
  let list = null;
  try {
    const st = await tipStore();
    if (st) list = await _tipWithin(st.list());
  } catch (e) {
    warn("tips.js openTips", e);
  }
  if (!_tipsInboxOpen()) return;
  _tips = list || [];
  $("dns-panel").innerHTML = _tipsHTML(list);
}
/** The new-place form with the tip in it: the name, want-to-try ticked, and the tip as its notes. Nothing is saved
    until you save it, and the tip stays in the inbox until you dismiss it. @param {string} id */
function tipToWant(id) {
  const t = _tips.find(x => x.id === id);
  if (!t) return;
  closeSheet();
  openForm();
  /** @type {HTMLInputElement} */ ($("f-name")).value = t.place;
  const w = /** @type {HTMLInputElement|null} */ ($("f-wish"));
  if (w) {
    w.checked = true;
    syncWishMode();
    syncMore(true);
  }
  /** @type {HTMLTextAreaElement} */ ($("f-review")).value = tipNote(t);
  $("f-name").dispatchEvent(new Event("input", { bubbles: true }));
  $("f-name").focus();
}
/** @param {string} id */
async function dismissTip(id) {
  try {
    const st = await tipStore();
    if (!st) throw new Error("no tip store");
    await _tipWithin(st.remove(id));
  } catch (e) {
    warn("tips.js dismissTip", e);
    toast("Couldn’t dismiss that tip");
    return;
  }
  _tips = _tips.filter(x => x.id !== id);
  if (_tipsInboxOpen()) {
    $("dns-panel").innerHTML = _tipsHTML(_tips);
    const t = $("dns-title");
    t.setAttribute("tabindex", "-1");
    t.focus({ preventScroll: true });
  }
}
