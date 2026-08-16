"use strict";
/* nav.js — View switching between map / list / detail / form / rank / stats.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- navigation ---------- */
/* Faves and Wish are filter chips now, not views, so show() no longer clears favOnly /
   wishOnly — that would wipe the chip the moment you opened a cafe and came back.
   The legacy "wish" argument still works for goBack() and any old entry point. */
const _TABS={map:"t-map",list:"t-list",form:"t-log",compare:"t-rank",stats:"t-stats"};
/* map maps to n-list because on desktop the map and the list pane share the screen */
const _NAVS={map:"n-list",list:"n-list",form:"n-add",compare:"n-rank",stats:"n-stats"};
function _mark(id){ const el=id&&$(id); if(el)el.classList.add("on"); }
function show(view,fav){ if(app.dataset.view==="form"&&view!=="form"&&typeof formDirty==="function"&&formDirty()){ if(!confirm("Discard unsaved changes to this visit?"))return; _formSnap=null; } if(view==="wish"){ wishOnly=true; favOnly=false; view="list"; } else if(fav){ favOnly=true; wishOnly=false; } if(view==="map"||view==="list")lastMain=view; app.dataset.view=view;
document.querySelectorAll(".tab").forEach(t=>t.classList.remove("on"));
document.querySelectorAll(".side-nav button").forEach(b=>b.classList.remove("on"));
_mark(_TABS[view]); _mark(_NAVS[view]);
if(view==="compare")newMatchup();
if(view==="stats")renderStats();
if(view==="list"||view==="map")renderList();
if(gReady)setTimeout(()=>{ mapResize(); if(view==="map")focusNearest(); },60);
}
/* openDetail(id,"stats") sets lastMain="stats", so honour it — otherwise tapping a cafe
   from Stats and pressing back silently drops you on List. */
function goBack(){ if(lastMain==="stats"||lastMain==="compare"){ show(lastMain); return; } show(lastMain==="map"&&window.innerWidth<900?"map":"list"); }
function toggleAdminBar(){ const b=$("adminbar"); if(!b)return; if(b.hasAttribute("data-open"))b.removeAttribute("data-open"); else b.setAttribute("data-open",""); }
