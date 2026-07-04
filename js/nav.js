"use strict";
/* nav.js — View switching between map / list / detail / form / rank / stats.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- navigation ---------- */
function show(view,fav){ if(typeof closeMore==="function")closeMore(); if(view==="wish"){ wishOnly=true; favOnly=false; view="list"; } else if(view==="list"||view==="map"){ wishOnly=false; favOnly=!!fav; } if(view==="map"||view==="list")lastMain=view; app.dataset.view=view;
document.querySelectorAll(".tab").forEach(t=>t.classList.remove("on"));
if(view==="map")$("t-map").classList.add("on");
if(view==="list")(wishOnly?$("t-wish"):(fav?$("t-fav"):$("t-list"))).classList.add("on");
document.querySelectorAll(".side-nav button").forEach(b=>b.classList.remove("on"));
if(view==="list"||view==="map")(wishOnly?$("n-wish"):(fav?$("n-fav"):$("n-list"))).classList.add("on");
if(view==="form")$("n-add").classList.add("on");
if(view==="compare"){ const _tr=$("t-more"); if(_tr)_tr.classList.add("on"); const _nr=$("n-rank"); if(_nr)_nr.classList.add("on"); newMatchup(); }
if(view==="stats"){ const _ts=$("t-more"); if(_ts)_ts.classList.add("on"); const _ns=$("n-stats"); if(_ns)_ns.classList.add("on"); renderStats(); }
if(view==="list"||view==="map")renderList();
if(gReady)setTimeout(()=>{ mapResize(); if(view==="map")focusNearest(); },60);
}
function goBack(){ if(wishOnly)show("wish"); else if(favOnly)show("list",true); else show(lastMain==="map"&&window.innerWidth<900?"map":"list"); }
function toggleMore(){ const p=$("more-popup"); if(!p)return; p.classList.toggle("show"); }
function closeMore(){ const p=$("more-popup"); if(p)p.classList.remove("show"); }
