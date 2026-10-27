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
  if (app.dataset.view === "detail" && curId && isAdmin && typeof openQuickCup === "function") openQuickCup();
  else openForm();
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
