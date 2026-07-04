"use strict";
/* boot.js — Startup wiring, update checker, back-button handling.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- boot ---------- */
function migratePhotoCache(){
  // Remove old plain-string cache entries (pre-TTL format) and any nulls
  let cacheDirty=false;
  Object.keys(gphotoCache).forEach(k=>{
    const v=gphotoCache[k];
    if(v===null||typeof v==="string"||isSessionPhotoUrl(v&&v.url)){ delete gphotoCache[k]; cacheDirty=true; }
  });
  if(cacheDirty)saveGphotoCache();
  // Strip stale gphoto fields from cafe objects
  let cafeDirty=false;
  cafes.forEach(c=>{ if(c.gphoto){ delete c.gphoto; cafeDirty=true; } });
  if(cafeDirty){
    try{ localStorage.setItem(KEY,JSON.stringify(cafes)); }catch(e){}
    if(fbReady&&fbAuth&&fbAuth.currentUser){
      const u=fbAuth.currentUser;
      if(u.email&&u.email.toLowerCase()===OWNER_EMAIL.toLowerCase()){
        fbDb.ref("cafes").set(JSON.parse(JSON.stringify(cafes))).catch(()=>{});
      }
    }
  }
}
function reloadLatest(){ location.replace(location.pathname+"?v="+Date.now()); }
let _bootSrc=null, _updateShown=false;
function checkForUpdate(){ fetch(location.pathname+"?_chk="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.text():null).then(t=>{ if(t==null)return; if(_bootSrc===null){ _bootSrc=t; return; } if(t!==_bootSrc && !_updateShown){ _updateShown=true; const b=$("updatebar"); if(b)b.classList.add("show"); } }).catch(()=>{}); }
const _fbOk=initFirebase(); initAuth();
{ const _abc=$("ab-cloud"); if(_abc)_abc.textContent=_fbOk?"☁️ Connected — edits save automatically for everyone.":"⚠ Cloud not set up — paste FIREBASE_CONFIG near the top of this file."; }
applyMode();
load().then(()=>{ migratePhotoCache(); applyMode(); const _sp=new URLSearchParams(location.search); const _sc=_sp.get('cafe'); show('map'); startMaps(); subscribeCloud(); if(_sc){ const _wait=(tries)=>{ const _fc=cafes.find(x=>x.id===_sc); if(_fc){ setTimeout(()=>openDetail(_fc.id,'map'),400); } else if(tries>0){ setTimeout(()=>_wait(tries-1),600); } }; _wait(8); } if(_fbOk&&isAdmin){ fbDb.ref("cafes").once("value").then(s=>{ if(!asArray(s.val()).length&&cafes.length)fbDb.ref("cafes").set(cafes); }).catch(()=>{}); } });
let rt; window.addEventListener("resize",()=>{ clearTimeout(rt); rt=setTimeout(()=>{ mapResize(); refitMap(); },150); });
checkForUpdate();
setInterval(checkForUpdate,45000);
/* ---------- hardware/browser back button ---------- */
let _exitArmed=false,_exitT=null;
function _rearmBack(){ try{ history.pushState({cafeapp:1},""); }catch(e){} }
_rearmBack();
window.addEventListener("popstate",()=>{ const qs=$("quick-sheet"); if(qs&&qs.classList.contains("show")){ closeQuick(); _rearmBack(); return; } const mp=$("more-popup"); if(mp&&mp.classList.contains("show")){ closeMore(); _rearmBack(); return; } const v=app.dataset.view; if(v!=="map"&&v!=="list"){ if(v==="form")closeForm(); else goBack(); _rearmBack(); return; } if(!_exitArmed){ _exitArmed=true; toast("Press back again to exit ☕"); _rearmBack(); clearTimeout(_exitT); _exitT=setTimeout(()=>{ _exitArmed=false; },2000); } else { _exitArmed=false; history.back(); } });
document.addEventListener("click",e=>{ if(!e.target.closest("#t-more")&&!e.target.closest("#more-popup"))closeMore(); });
document.addEventListener("visibilitychange",()=>{ if(!document.hidden)checkForUpdate(); });
