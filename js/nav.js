"use strict";
/* nav.js — View switching between map / list / detail / form / rank / stats.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- navigation ---------- */
/* Faves and Wish are filter chips now, not views, so show() no longer clears favOnly /
   the been/want tab — that would wipe the chip the moment you opened a cafe and came back.
   The legacy "wish" argument still works for goBack() and any old entry point. */
const _TABS = { map: "t-map", list: "t-list", form: "t-log", compare: "t-rank", stats: "t-stats" };
/* map maps to n-list because on desktop the map and the list pane share the screen */
const _NAVS = {
  map: "n-list",
  list: "n-list",
  form: "n-add",
  compare: "n-rank",
  stats: "n-stats",
  settings: "n-settings",
};
function _mark(id) {
  const el = id && $(id);
  if (el) el.classList.add("on");
}
function show(view, fav) {
  if (app.dataset.view === "form" && view !== "form" && typeof formDirty === "function" && formDirty()) {
    if (!confirm("Discard unsaved changes to this visit?")) return;
    _formSnap = null;
  }
  if (view === "wish") {
    listTab = "want";
    favOnly = false;
    view = "list";
  } else if (fav) {
    listTab = "been";
    favOnly = true;
  }
  if (view === "map" || view === "list") lastMain = view;
  if (typeof closePeek === "function" && peekOpen()) closePeek();
  app.dataset.view = view;
  if (view === "settings" && typeof ensureAuth === "function" && !isAdmin) ensureAuth();
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("on"));
  document.querySelectorAll(".side-nav button").forEach(b => b.classList.remove("on"));
  _mark(_TABS[view]);
  _mark(_NAVS[view]);
  syncLogTab();
  if (view === "compare") renderBoard();
  if (view === "stats") renderStats();
  if (view === "settings") renderSettings();
  if (view === "list" || view === "map") renderList();
  if (gReady)
    setTimeout(() => {
      mapResize();
      if (view === "map") focusNearest();
    }, 60);
}
/* ---------- one Log button (design audit D2) ----------
   A cafe page showed "＋ Log a drink here" pinned right above the "＋ Log" tab: two buttons that looked like one
   action, 124px of the bottom of every cafe. The tab is the one now. On a cafe page it is "Log here" and opens the
   quick cup for that cafe; anywhere else it is "Log", a new visit. */
function logTab() {
  if (app.dataset.view === "detail" && curId && isAdmin && typeof openQuickCup === "function") {
    openQuickCup();
    return;
  }
  /* standing in a cafe on your list: its quick cup, from anywhere (form.js logHere) */
  if (isAdmin && typeof logHere === "function" && logHere()) return;
  openForm();
}
/* Long-press the home-screen icon (manifest.json shortcuts, v120): Log a cup, Near me, Want to try, each a ?do= the
   app reads as it starts. Log asks for a fix at once rather than waiting for the map (map.js autoLocate runs only
   once Google Maps has loaded), and only with location already allowed, so it never raises the prompt. It waits up
   to six seconds for one, so it opens on the cafe you are in rather than the new-cafe form; with no fix it is Log as
   ever. A visitor has nothing to log, so their Log is Near me. The ?do= is dropped from the address, so a reload or
   the back button does not run it again. Android and desktop Chrome show the shortcuts; an iPhone ignores them. */
/** @param {string} what log | near | want @param {number} [tries] */
function runShortcut(what, tries) {
  if (tries === undefined) {
    try {
      const u = new URL(location.href);
      u.searchParams.delete("do");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) {
      warn("nav.js runShortcut", e);
    }
  }
  if (what === "want") {
    show("list");
    setListTab("want");
    return;
  }
  if (what === "log" && isAdmin) {
    if (tries === undefined && typeof ifLocationAlreadyAllowed === "function")
      ifLocationAlreadyAllowed(function () {
        showUserLocation(false);
      });
    const left = tries === undefined ? 12 : tries;
    if (left > 0 && !(userLoc && Date.now() - userLocAt < HERE_FRESH_MS)) {
      setTimeout(() => runShortcut(what, left - 1), 500);
      return;
    }
    logTab();
    return;
  }
  nearMeTab();
}
function syncLogTab() {
  const t = $("t-log"),
    l = t && t.querySelector(".tl");
  if (!l) return;
  const here = app.dataset.view === "detail";
  l.textContent = here ? "Log here" : "Log";
}
/* openDetail(id,"stats") sets lastMain="stats", so honour it — otherwise tapping a cafe
   from Stats and pressing back silently drops you on List. */
function goBack() {
  if (lastMain === "stats" || lastMain === "compare") {
    show(lastMain);
    return;
  }
  show(lastMain === "map" && window.innerWidth < 900 ? "map" : "list");
}
