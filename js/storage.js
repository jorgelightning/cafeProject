"use strict";
/* storage.js — Load/save data, admin auth, import/export, seed data.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- storage ---------- */
async function load(){
isAdmin = localStorage.getItem(ADMIN_FLAG)==="1";
if(await loadCloud()){ await loadPrivateDetail(); healPrivateSpots(); return; }
let published=null;
try{ const ctrl=new AbortController(); const _to=setTimeout(()=>ctrl.abort(),8000); const r=await fetch(DATA_URL+"?t="+Date.now(),{signal:ctrl.signal}); clearTimeout(_to); if(r.ok)published=await r.json(); }catch(e){ warn("storage.js",e); }
if(isAdmin){
const dirty = localStorage.getItem(DIRTY_FLAG)==="1";
let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)); }catch(e){ warn("storage.js",e); }
if(dirty && local && local.length){ cafes=adoptCafes(local); }
else if(published && published.length){ cafes=adoptCafes(published); localStorage.removeItem(KEY); }
else { cafes=adoptCafes((local&&local.length)?local:seed()); }
} else {
let _lc=null; try{ _lc=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){ warn("storage.js",e); } cafes=adoptCafes((published&&published.length)?published:((Array.isArray(_lc)&&_lc.length)?_lc:seed()));
}
await loadPrivateDetail();
healPrivateSpots();
}
/* Writes used to be one shape: the entire array, every time, from every caller. Two devices
   each writing everything meant the second silently erased whatever the first had added,
   because its copy predated that edit. These three say what they actually mean instead —
   one cafe, one deletion, or genuinely everything — so edits to different cafes stop
   colliding and the common save drops from ~61 KB to about 1 KB. */
function _localSave(){ localStorage.setItem(KEY,JSON.stringify(cafes)); }
/* Everything. Also the migration: this is what reshapes the node from array to keyed. */
function save(){
  if(!isAdmin)return;
  cafes.forEach(c=>{if(!syncEqual(c,syncRemote[c.id]))queueCafe(c.id,c);});
}
/* One cafe. Two devices editing different cafes now write different paths and cannot
   overwrite one another. Falls back to a full write until the node has been reshaped. */
function saveCafe(id,base){
  if(!isAdmin)return;
  const c=cafes.find(function(x){ return x&&x.id===id; });
  if(!c)return save();
  return queueCafe(id,c,base);
}
/* One deletion. Call after the cafe is already out of the local array. */
function removeCafe(id){
  if(!isAdmin)return;
  return queueCafe(id,null);
}
function applyMode(){ app.dataset.mode=isAdmin?"admin":"viewer"; if(typeof renderSettings==="function")renderSettings(); if(!isAdmin&&(app.dataset.view==="form"||app.dataset.view==="compare")){ if(listTab==="want")show("wish"); else if(favOnly)show("list",true); else show(lastMain); } if(app.dataset.view==="stats")renderStats(); }
function authMsg(code){ if(code==="auth/operation-not-allowed"||code==="auth/configuration-not-found")return "Turn on Google sign-in: Firebase Console → Authentication → Sign-in method → Google → Enable."; if(code==="auth/unauthorized-domain")return "This site's domain isn't allowed. Add it in Firebase → Authentication → Settings → Authorized domains."; if(code==="auth/popup-blocked"||code==="auth/cancelled-popup-request")return "Your browser blocked the popup — allow popups for this site and try again."; if(code==="auth/popup-closed-by-user")return "Sign-in window closed."; return "Sign-in failed ("+code+")"; }
function adminSignIn(){ if(!fbAuth){ toast("Cloud not connected"); return; } const prov=new firebase.auth.GoogleAuthProvider(); fbAuth.signInWithPopup(prov).catch(e=>{ const code=(e&&e.code)||""; console.error("Sign-in error",e); if(code==="auth/popup-blocked"||code==="auth/operation-not-supported-in-this-environment"){ fbAuth.signInWithRedirect(prov).catch(er=>toast(authMsg((er&&er.code)||""))); return; } toast(authMsg(code)); }); }
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
const PRIV_MIRROR="cafemap.private.v1";
const PRIV_QUEUE="cafemap.private.pending.v1";
let privPending={}, _privWarned=false;
function _readPrivStore(k){
  try{ const v=JSON.parse(localStorage.getItem(k)||"{}"); if(v&&typeof v==="object"&&!Array.isArray(v))return v; }
  catch(e){ warn("storage.js",e); }
  return {};
}
function persistPrivate(){
  lsSet(PRIV_MIRROR,JSON.stringify(privDetail));
  lsSet(PRIV_QUEUE,JSON.stringify(privPending));
}
function loadPrivateDetail(){
  if(!ownerSignedIn()){ privDetail={}; privPending={}; return Promise.resolve(); }
  /* Start from this device, so an address that never reached the cloud is still here. */
  privDetail=_readPrivStore(PRIV_MIRROR);
  privPending=_readPrivStore(PRIV_QUEUE);
  if(!fbReady)return Promise.resolve();
  return fbDb.ref(PRIVATE_PATH).once("value").then(function(s){
    const cloud=s.val()||{};
    /* Cloud wins, except where this device still holds a write the cloud never accepted —
       including a pending deletion, which the queue stores as null. */
    const merged=Object.assign({},cloud);
    Object.keys(privPending).forEach(function(k){
      if(privPending[k]===null)delete merged[k]; else merged[k]=privPending[k];
    });
    privDetail=merged;
    persistPrivate();
    flushPrivate();
  }).catch(function(e){
    warn("storage.js",e);
    /* A refused read means the rule is missing or wrong — the same cause as a refused write,
       and worth saying now rather than at the next save. */
    privateWriteFailed();
  });
}
/* Said once a session. It names the cause, because there is really only one. */
function privateWriteFailed(){
  if(_privWarned)return;
  _privWarned=true;
  toast("Private address kept on this device — the cloud refused it. Check the database rules (see README).");
}
function flushPrivate(){
  const ids=Object.keys(privPending);
  if(!ids.length)return;
  if(!fbReady||!ownerSignedIn())return;
  ids.forEach(function(id){
    const exact=privPending[id];
    const write=(exact===null)?fbDb.ref(PRIVATE_PATH+"/"+id).remove()
                              :fbDb.ref(PRIVATE_PATH+"/"+id).set(exact);
    write.then(function(){
      if(privPending[id]===exact){ delete privPending[id]; persistPrivate(); }
    }).catch(function(e){ warn("storage.js",e); privateWriteFailed(); });
  });
}
function savePrivateDetail(id,exact){
  privDetail[id]=exact;
  privPending[id]=exact;
  persistPrivate();
  flushPrivate();
}
/* `force` spends a write even when we hold no local record of one. Deleting a cafe passes it,
   because an address left behind for a cafe that no longer exists is exactly the leak this is
   for — better a redundant no-op remove than an orphan. An ordinary save does not, so saving
   any of a hundred normal cafes costs nothing. */
function removePrivateDetail(id,force){
  const had=Object.prototype.hasOwnProperty.call(privDetail,id);
  delete privDetail[id];
  if(!had&&!force){ if(privPending[id]!==undefined){ delete privPending[id]; persistPrivate(); } return; }
  /* null is the queue's "remove this", so a deletion is as durable as a write */
  privPending[id]=null;
  persistPrivate();
  flushPrivate();
}
/* A private spot saved before any of this still has its exact address sitting in the public
   node. Move it. The precise copy is written first and the public record overwritten second,
   so a failure between the two duplicates the address rather than losing it. Only the owner
   can run this, because only the owner can write. */
function healPrivateSpots(){
  const ids=Object.keys(_needsHeal);
  if(!ids.length)return;
  if(!fbReady||!ownerSignedIn())return;
  ids.forEach(function(id){
    const exact=_needsHeal[id];
    delete _needsHeal[id];
    const c=cafes.find(function(x){ return x.id===id; });
    if(!c)return;
    privDetail[id]=exact;
    fbDb.ref(PRIVATE_PATH+"/"+id).set(exact).then(function(){
      return fbDb.ref("cafes/"+id).set(JSON.parse(JSON.stringify(c)));
    }).then(function(){
      toast("Moved "+c.name+"'s address somewhere only you can read \u2713");
    }).catch(function(e){ warn("storage.js",e); });
  });
}
/* ---------- is the private node actually private? ----------
   The whole arrangement rests on a database rule nobody in the app could see, published by
   hand in a console, and a missing one fails silently in both directions: reads come back
   empty, writes are refused. So check it from the outside.

   A SECOND, unauthenticated Firebase app reads `private/`. Auth state is per app instance, so
   this asks the question as a stranger would even while the owner is signed in on the main
   one. A rule that is doing its job REJECTS that read. If it resolves — with data or with
   null — then the path is world-readable and every private address on it is public.

   Read-only on purpose: proving the database is writable would mean writing to it. */
let _ruleProbeDone=false;
function probePrivateRule(){
  if(_ruleProbeDone||!fbReady||!window.firebase||!FIREBASE_CONFIG)return;
  _ruleProbeDone=true;
  let probe,db;
  try{
    probe=(firebase.apps||[]).filter(function(a){ return a.name==="ruleprobe"; })[0]
          ||firebase.initializeApp(FIREBASE_CONFIG,"ruleprobe");
    db=firebase.database(probe);
  }catch(e){ warn("storage.js",e); return; }
  db.ref(PRIVATE_PATH).once("value").then(function(){
    showRuleWarning();
  }).catch(function(){
    /* Rejected. That is the good outcome and needs no announcement. */
  });
}
/* Only the owner is told. A viewer can do nothing about it and the message would only
   be alarming, so it is gated on the admin flag rather than shown to everyone. */
function showRuleWarning(){
  const el=$("rule-warn");
  if(!el||!isAdmin)return;
  el.hidden=false;
}
function dismissRuleWarning(){ const el=$("rule-warn"); if(el)el.hidden=true; }
function resyncDirty(){ return flushSync(); }
function initAuth(){ if(!fbAuth)return; fbAuth.onAuthStateChanged(u=>{ const ok=!!(u&&u.email&&u.email.toLowerCase()===OWNER_EMAIL.toLowerCase()); if(u&&!ok){ toast("That account can't edit this map"); fbAuth.signOut(); return; } if(ok){ if(!isAdmin){ isAdmin=true; lsSet(ADMIN_FLAG,"1"); applyMode(); toast("Admin mode - signed in"); } load().then(()=>{ if(gReady)renderMarkers(); renderList(); resyncDirty(); }); } else if(!ok&&isAdmin){ isAdmin=false; localStorage.removeItem(ADMIN_FLAG); applyMode(); load().then(()=>{ if(gReady)renderMarkers(); renderList(); }); toast("Viewer mode"); } }); }
function toggleAdmin(){ if(fbAuth){ if(isAdmin){ if(confirm("Sign out of editing mode?"))fbAuth.signOut().then(()=>toast("Viewer mode")); } else { adminSignIn(); } return; } if(isAdmin){ if(confirm("Sign out of admin (editing) mode?")){ isAdmin=false; localStorage.removeItem(ADMIN_FLAG); applyMode(); load().then(()=>{ renderMarkers(); show(lastMain); }); toast("Viewer mode"); } return; } const p=prompt("Enter admin passphrase to edit:"); if(p===null)return; if(p===ADMIN_PASS){ isAdmin=true; lsSet(ADMIN_FLAG,"1"); applyMode(); load().then(()=>{ renderMarkers(); renderList(); }); toast("Admin mode — you can edit"); } else toast("Wrong passphrase"); }
function importPublished(){ if(!isAdmin){ toast("Sign in to edit first"); return; } if(!fbReady){ toast("Cloud not connected"); return; } if(!confirm("Replace the cloud data with cafes.json from the site? This overwrites what's currently in the cloud."))return; fetch(DATA_URL+"?t="+Date.now()).then(r=>r.json()).then(d=>{ if(!Array.isArray(d)||!d.length){ toast("cafes.json looks empty"); return; } return fbDb.ref("cafes").set(d.reduce(function(o,c){ if(c&&c.id)o[c.id]=c; return o; },{})).then(()=>{ _cloudKeyed=true; cafes=adoptCafes(d); try{ lsSet(KEY,JSON.stringify(cafes)); }catch(e){ warn("storage.js",e); } localStorage.removeItem(DIRTY_FLAG); if(gReady)renderMarkers(); renderList(); toast("Imported "+d.length+" cafes \u2713"); }); }).catch(()=>toast("Couldn't load cafes.json")); }
function exportJSON(){ const blob=new Blob([JSON.stringify(cafes,null,2)],{type:"application/json"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="cafes.json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); localStorage.removeItem(DIRTY_FLAG); toast("Backup downloaded ✓"); }
function revertPublished(){ if(!confirm("Reload the latest saved data and discard unsynced local edits?"))return; localStorage.removeItem(KEY); localStorage.removeItem(DIRTY_FLAG); load().then(()=>{ renderMarkers(); show("list"); toast("Reloaded latest data"); }); }
function seed(){ return [
{id:uid(),name:"Morning Glass Coffee",area:"Manoa",lat:21.3140,lng:-157.8087,photo:null,emoji:"☕",rating:5,fav:true,tags:["cozy","pastries"],review:"Tucked-away neighborhood spot. The flat white is excellent and the breakfast sandwich is a must.",drinks:[{n:"Flat white",p:"$5"},{n:"Cold brew",p:"$5.5"}]},
{id:uid(),name:"ARS Cafe",area:"Diamond Head",lat:21.2680,lng:-157.8050,photo:null,emoji:"🍦",rating:4,fav:false,tags:["outdoor","specialty"],review:"Great post-beach stop. Affogato hits after a Diamond Head hike.",drinks:[{n:"Affogato",p:"$7"}]},
{id:uid(),name:"Kai Coffee",area:"Waikiki",lat:21.2760,lng:-157.8270,photo:null,emoji:"🥤",rating:4,fav:false,tags:["to-go","good wifi"],review:"Reliable iced latte near the beach. Gets busy mid-morning.",drinks:[{n:"Iced latte",p:"$6"}]}
]; }
