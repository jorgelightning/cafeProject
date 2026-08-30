"use strict";
/* core.js — App state, DOM/format helpers, Firebase init and cloud sync.
   Loaded by index.html; script order matters (config first, boot last). */
let cafes=[], curId=null, editId=null, picked=null, formPhoto=null, formRating=0, formTags=[], formCC="", formCcy="", formPid="", favOnly=false, wishOnly=false, lastMain="map";
let gReady=false, gmap=null, fgmap=null, fgmarker=null, gmarkers=[], userMarker=null, userAccuracy=null;
let gphotoCache={}; try{ gphotoCache=JSON.parse(localStorage.getItem("cafemap.gphotos"))||{}; }catch(e){ warn("core.js",e); }
let isAdmin=false;
const $=id=>document.getElementById(id);
/* Failures used to be invisible: 32 catch blocks discarded the error, so a photo that never
   resolved, a cloud write that failed and correct behaviour all looked identical from the
   outside. The error object carries its own stack, so the prefix only has to say where. */
function warn(where,e){ try{ console.warn("[cafemap] "+where,e); }catch(_){ warn("core.js",_); } }
/* Every localStorage write can throw on a full quota — only one of them used to survive it. */
function lsSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ warn("localStorage "+k,e); return false; } }
let fbReady=false, fbDb=null, fbAuth=null;
/* True once the cloud node is an object keyed by cafe id rather than a JSON array. Writing to
   cafes/<id> while it is still an array would add a string key beside the numeric ones and
   duplicate the cafe, so per-cafe writes wait for the first full write to reshape it. */
let _cloudKeyed=false;
function cafesById(){ const o={}; cafes.forEach(function(c){ if(c&&c.id)o[c.id]=c; }); return o; }
function noteCloudShape(raw){ _cloudKeyed=!!raw&&!Array.isArray(raw); }
function asArray(v){ return Array.isArray(v)?v:(v&&typeof v==="object"?Object.values(v):[]); }
function initFirebase(){ try{ if(!window.firebase||!FIREBASE_CONFIG||!FIREBASE_CONFIG.databaseURL||/PASTE_/.test(FIREBASE_CONFIG.databaseURL))return false; firebase.initializeApp(FIREBASE_CONFIG); fbDb=firebase.database(); try{ fbAuth=firebase.auth(); }catch(e){ warn("core.js",e); } fbReady=true; return true; }catch(e){ console.warn("Firebase init failed",e); return false; } }
function subscribeCloud(){ if(!fbReady)return; fbDb.ref("cafes").on("value",snap=>{ noteCloudShape(snap.val()); const val=asArray(snap.val()); if(!val.length)return; cafes=val; try{ lsSet(KEY,JSON.stringify(cafes)); }catch(e){ warn("core.js",e); } if(gReady)renderMarkers(); const v=app.dataset.view; if(v==="list"||v==="map")renderList(); else if(v==="detail"&&curId){ if(cafes.find(x=>x.id===curId))openDetail(curId); } else if(v==="stats")renderStats(); }); }
async function loadCloud(){ if(!fbReady)return false; try{ const snap=await Promise.race([fbDb.ref("cafes").once("value"),new Promise((_,rej)=>setTimeout(()=>rej(new Error("cloud-timeout")),6000))]); noteCloudShape(snap.val()); const val=asArray(snap.val()); const dirty=localStorage.getItem(DIRTY_FLAG)==="1"; let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){ warn("core.js",e); } if(dirty&&Array.isArray(local)&&local.length){ cafes=local; resyncDirty(); return true; } if(val.length){ cafes=val; try{ lsSet(KEY,JSON.stringify(cafes)); }catch(e){ warn("core.js",e); } localStorage.removeItem(DIRTY_FLAG); return true; } }catch(e){ console.warn("Cloud load slow/failed — using cached data",e); let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(_e){ warn("core.js",_e); } if(Array.isArray(local)&&local.length){ cafes=local; return true; } } return false; }
const app=$("app");
/* Keyboard access for the 17 elements that carry an onclick but are not buttons. They keep
   their tags — a <button> cannot hold the card's block layout, and swapping the others would
   mean re-checking every .chip and .locpill rule for the browser's own button styling — so
   role="button" + tabindex="0" supplies the semantics and this supplies the behaviour a real
   button would have given for free. One listener covers all of them, and any added later.
   The comparison sheet's backdrop is deliberately NOT focusable: a scrim is not a control.
   Escape closes that sheet, matching what the back button already does via chaserOpen(). */
document.addEventListener("keydown",function(e){
  if(e.key==="Escape"){
    if(typeof chaserOpen==="function"&&chaserOpen()&&typeof chaserDismiss==="function")chaserDismiss();
    return;
  }
  if(e.key!=="Enter"&&e.key!==" ")return;
  const el=(e.target&&e.target.closest)?e.target.closest('[role="button"][tabindex="0"]'):null;
  if(!el)return;
  e.preventDefault();   /* Space would otherwise scroll the page */
  el.click();
});
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),1800); }
/* The apostrophe matters: 17 inline handlers pass arguments inside single-quoted JS
   strings, so a cafe called Joe's would otherwise break out of one. */
function esc(s){ return (s==null?"":String(s)).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function safeUrl(u){ u=(u==null?"":String(u)).trim(); if(!u)return ""; if(!/^(https?:|data:image\/)/i.test(u))return ""; return u.replace(/["'()<>\s\\]/g,encodeURIComponent); }
const _imgFail={}; let _photoRetried={};
function initials(c){ const n=((c&&c.name)||"").trim(); if(!n)return "?"; const w=n.split(/\s+/).filter(Boolean); let s=(w[0]&&w[0][0])||""; if(w.length>1&&w[1][0])s+=w[1][0]; return s.toUpperCase(); }
function cafeColor(name){ const P=["#e07b54","#d4a843","#7cb87c","#5b9bd5","#9b6fc4","#e06b8a","#4db8aa","#e08040"]; let h=0; for(let i=0;i<(name||"").length;i++)h=(h*31+name.charCodeAt(i))>>>0; return P[h%P.length]; }
function nophotoBg(name){ return 'linear-gradient(140deg,rgba(255,255,255,.18),rgba(0,0,0,.26)) '+cafeColor(name); }
function nophotoHTML(c){ return '<span class="em">'+esc((c&&c.emoji)||"☕")+'</span><span>'+initials(c)+'</span>'; }
/* Local calendar date. Plain toISOString() would hand back yesterday (or tomorrow) when
   logging from Hawaii or Taipei, so shift by the timezone offset before slicing. */
/* prices[len/2] is the upper-middle value, which reads high on every even-length set. */
function median(a){ if(!a||!a.length)return 0; const s=a.slice().sort(function(x,y){ return x-y; }); const m=s.length>>1;
  return (s.length%2)?s[m]:(s[m-1]+s[m])/2; }
function localToday(){ return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); }
/* ---------- currency ----------
   A price is stored twice: drink.p is always US dollars (every reader downstream — Stats
   totals, the medians, fmtPrice — has always been able to assume that, and still can), and
   drink.pl/.pc carry the amount as it appeared on the board. drink.pr/.pd record the rate
   used and the day it was taken, so a drink logged in Taipei in 2024 keeps the 2024 number
   instead of drifting every time the markets move. Nothing re-converts on read. */
/* An explicit choice wins over the country lookup: c.ccy is what you picked by hand, and
   it is why a cafe with no resolvable country only ever has to be told once. */
/* ---------- private spots ---------- */
/* "Private spot" used to mean nothing but "skip Google photos". It now means the exact
   location is never written anywhere public — and everything this app writes is public:
   cafes.json is served from the repo, and the Firebase node is read without auth.

   Rounding to a fixed grid rather than adding random jitter. A grid cell is stable, so
   re-saving the same spot lands on the same point; jitter would move on every save, and
   averaging a handful of saves would recover the true location it was meant to hide. */
const PRIVATE_DP=2;   /* 0.01° — about 1.1km of latitude, ~0.9km of longitude at mid-latitudes */
function blurCoord(v){ return (v==null||isNaN(v))?null:+(+v).toFixed(PRIVATE_DP); }

/* The area field is where a street address ends up — one of these really did read
   "1800 Washington St #611". A locality never needs digits and a street address effectively
   always has them, so digits are the test: "San Mateo" survives, anything numbered does not. */
function privateArea(a){ return /\d/.test(a||"") ? "" : (a||""); }

/* The single place a record is made safe to publish. Called on save, and mirrored in
   .github/workflows/backup.yml so a precise value already sitting in Firebase still cannot
   reach the published file. */
function redactPrivate(c){
  if(!c||!c.custom)return c;
  c.lat=blurCoord(c.lat);
  c.lng=blurCoord(c.lng);
  c.area=privateArea(c.area);
  return c;
}
function ccyFor(c){
  const own=((c&&c.ccy)||"").trim().toUpperCase();
  if(own&&CCY_META[own])return own;
  const cc=((c&&c.cc)||"").trim().toUpperCase();
  return (cc&&CCY_BY_CC[cc])||"USD";
}
function ccyMeta(code){ return CCY_META[(code||"USD").toUpperCase()]||{sym:"",dec:2}; }
/* Units of `code` per 1 USD, or 0 when we have no rate — callers treat 0 as "can't convert
   yet" rather than as a number. Swap the body for a cached fetch to go live; the frozen
   drink.pr means everything already recorded is unaffected either way. */
/* The rate to use for a drink bought on `date`, and the date that rate is actually from.
   Those two are reported separately on purpose: when there is no historical anchor we fall
   back to the current table, and the drink must record the table's date, not the date we
   wished we had. A stored drink.pr/.pd always wins over this — nothing re-rates on read. */
/* Fetched rates outrank both tables. A historical rate is a settled fact — it cannot change
   after the fact — so once fetched it is cached permanently rather than expiring. */
let _fxCache={}; try{ _fxCache=JSON.parse(localStorage.getItem("cafemap.fx"))||{}; }catch(e){ warn("core.js",e); }
const _fxTried={};
function _fxKey(code,date){ return (code||"")+"@"+String(date||"").slice(0,10); }
function fxPut(code,date,rate,asof){
  if(!(rate>0))return;
  _fxCache[_fxKey(code,date)]={r:rate,d:asof||String(date).slice(0,10)};
  try{ lsSet("cafemap.fx",JSON.stringify(_fxCache)); }catch(e){ warn("core.js",e); }
}
/* Asks the network for a rate we do not have, once per currency-and-date, and calls back
   only when it actually learned something. Failure is silent and permanent for the session:
   the caller already has a usable fallback and a save must never wait on this. */
function fxEnsure(code,date,done){
  code=(code||"USD").toUpperCase();
  if(code==="USD"||!date||typeof FX_API!=="string"||!FX_API)return;
  const k=_fxKey(code,date);
  if(_fxCache[k]||_fxTried[k]||typeof fetch!=="function")return;
  _fxTried[k]=1;
  try{
    fetch(FX_API+String(date).slice(0,10)+"?from=USD&to="+encodeURIComponent(code))
      .then(function(r){ return r.ok?r.json():null; })
      .then(function(j){
        const rate=j&&j.rates&&j.rates[code];
        if(!(rate>0))return;
        fxPut(code,date,rate,(j&&j.date)||String(date).slice(0,10));
        if(done)done();
      })
      .catch(function(){});
  }catch(e){ warn("core.js",e); }
}
function fxRateAt(code,date){
  code=(code||"USD").toUpperCase();
  if(code==="USD")return {rate:1,asof:date||FX_ASOF};
  const hit=_fxCache[_fxKey(code,date)];
  if(hit&&hit.r>0)return {rate:hit.r,asof:hit.d};
  const key=String(date||"").slice(0,7);
  if(key&&typeof FX_HISTORY==="object"&&FX_HISTORY){
    const months=Object.keys(FX_HISTORY).filter(function(m){ return m<=key&&FX_HISTORY[m]&&FX_HISTORY[m][code]>0; }).sort();
    if(months.length){ const m=months[months.length-1]; return {rate:FX_HISTORY[m][code],asof:m+"-01"}; }
  }
  const r=FX_PER_USD[code];
  return {rate:(typeof r==="number"&&r>0)?r:0,asof:FX_ASOF};
}
function fxRate(code,date){ return fxRateAt(code,date).rate; }
function daysBetween(a,b){ const x=Date.parse(a),y=Date.parse(b); return (isNaN(x)||isNaN(y))?0:Math.round(Math.abs(x-y)/86400000); }
function ccyNum(v){ const n=parseFloat(String(v==null?"":v).replace(/[^0-9.]/g,"")); return isNaN(n)?null:n; }
function fmtLocal(amt,code){ const n=ccyNum(amt); if(n==null)return ""; const m=ccyMeta(code); return m.sym+n.toFixed(m.dec); }
/* The one place local money becomes dollars. Returns null when there is no usable amount or
   no rate, which is what puts a drink into the "needs rate" state instead of inventing one. */
function toUSD(amt,code,rate){ const n=ccyNum(amt); if(n==null)return null; const r=(typeof rate==="number"&&rate>0)?rate:fxRate(code); if(!r)return null; return n/r; }
/* Builds the price half of a stored drink from what the form row held. USD rows keep the
   exact legacy shape ({p} only, no extra keys) so nothing in cafes.json changes for the 60
   dollar-priced drinks already there. */
function priceFields(amt,code,rate,date){
  code=(code||"USD").toUpperCase();
  const raw=String(amt==null?"":amt).trim();
  if(!raw)return {p:""};
  if(code==="USD")return {p:raw};
  const usd=toUSD(raw,code,rate);
  const o={p:usd==null?"":usd.toFixed(2), pl:raw, pc:code};
  const r=(typeof rate==="number"&&rate>0)?rate:fxRate(code);
  if(r){ o.pr=r; o.pd=date||FX_ASOF; }
  return o;
}
/* Same glyph for both halves — ☆ is optically lighter and a different advance width, so a
   filled/hollow mix reads as decoration rather than a proportion. */
function starsHTML(r){ r=Math.max(0,Math.min(5,Math.round(r||0))); if(!r)return ""; return '<span class="cstars"><b>'+"★".repeat(r)+"</b>"+"★".repeat(5-r)+"</span>"; }
/* Single source of truth for what lives inside a card's .ph tile. Three call sites rebuild
   it (renderList, verifyCardPhoto, applyCardPhoto) — routing them all through here is what
   keeps a resolving photo from silently wiping the star pill and wish badge. */
function phInner(c,hasPhoto){ let h=hasPhoto?"":nophotoHTML(c); if(c&&c.fav)h+='<span class="favbadge">❤️</span>'; if(c&&c.wish)h+='<span class="wishbadge">🔖</span>'; return h+starsHTML(c&&c.rating); }
function verifyCardPhoto(id,url){ if(!url)return; const probe=new Image(); probe.onload=function(){ _imgFail[id]=0; }; probe.onerror=function(){ _imgFail[id]=1; const c=cafes.find(x=>x.id===id); if(c&&c.gphoto)delete c.gphoto; if(gphotoCache[id]!==undefined){ delete gphotoCache[id]; saveGphotoCache(); } const el=document.querySelector('.card[data-id="'+id+'"] .ph'); if(el){ el.style.backgroundImage=""; el.classList.remove("loaded","loading"); el.classList.add("nophoto"); el.style.background=c?nophotoBg(c.name):"#caa472"; el.innerHTML=c?phInner(c,false):"?"; } if(c&&!c.photo&&!_photoRetried[id]&&gReady&&c.lat!=null&&!gphotoInflight[id]){ _photoRetried[id]=1; gphotoInflight[id]=1; fetchPlacePhoto(c,function(u){ delete gphotoInflight[id]; if(u)applyCardPhoto(id,u); }); } }; probe.src=safeUrl(url); }
function fmtDate(s){ if(!s)return ""; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); if(!m)return s; const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]; return mo+" "+(+m[3])+", "+m[1]; }
