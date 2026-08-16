"use strict";
/* core.js — App state, DOM/format helpers, Firebase init and cloud sync.
   Loaded by index.html; script order matters (config first, boot last). */
let cafes=[], curId=null, editId=null, picked=null, formPhoto=null, formRating=0, formTags=[], favOnly=false, wishOnly=false, lastMain="map";
let gReady=false, gmap=null, fgmap=null, fgmarker=null, gmarkers=[], userMarker=null;
let gphotoCache={}; try{ gphotoCache=JSON.parse(localStorage.getItem("cafemap.gphotos"))||{}; }catch(e){}
let isAdmin=false;
const $=id=>document.getElementById(id);
let fbReady=false, fbDb=null, fbAuth=null;
function asArray(v){ return Array.isArray(v)?v:(v&&typeof v==="object"?Object.values(v):[]); }
function initFirebase(){ try{ if(!window.firebase||!FIREBASE_CONFIG||!FIREBASE_CONFIG.databaseURL||/PASTE_/.test(FIREBASE_CONFIG.databaseURL))return false; firebase.initializeApp(FIREBASE_CONFIG); fbDb=firebase.database(); try{ fbAuth=firebase.auth(); }catch(e){} fbReady=true; return true; }catch(e){ console.warn("Firebase init failed",e); return false; } }
function subscribeCloud(){ if(!fbReady)return; fbDb.ref("cafes").on("value",snap=>{ const val=asArray(snap.val()); if(!val.length)return; cafes=val; try{ localStorage.setItem(KEY,JSON.stringify(cafes)); }catch(e){} if(gReady)renderMarkers(); const v=app.dataset.view; if(v==="list"||v==="map")renderList(); else if(v==="detail"&&curId){ if(cafes.find(x=>x.id===curId))openDetail(curId); } else if(v==="stats")renderStats(); }); }
async function loadCloud(){ if(!fbReady)return false; try{ const snap=await Promise.race([fbDb.ref("cafes").once("value"),new Promise((_,rej)=>setTimeout(()=>rej(new Error("cloud-timeout")),6000))]); const val=asArray(snap.val()); const dirty=localStorage.getItem(DIRTY_FLAG)==="1"; let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(e){} if(dirty&&Array.isArray(local)&&local.length){ cafes=local; resyncDirty(); return true; } if(val.length){ cafes=val; try{ localStorage.setItem(KEY,JSON.stringify(cafes)); }catch(e){} localStorage.removeItem(DIRTY_FLAG); return true; } }catch(e){ console.warn("Cloud load slow/failed — using cached data",e); let local=null; try{ local=JSON.parse(localStorage.getItem(KEY)||"null"); }catch(_e){} if(Array.isArray(local)&&local.length){ cafes=local; return true; } } return false; }
const app=$("app");
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function toast(m){ const t=$("toast"); t.textContent=m; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),1800); }
function esc(s){ return (s||"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m])); }
function safeUrl(u){ u=(u==null?"":String(u)).trim(); if(!u)return ""; if(!/^(https?:|data:image\/)/i.test(u))return ""; return u.replace(/["'()<>\s\\]/g,encodeURIComponent); }
const _imgFail={}; let _photoRetried={};
function initials(c){ const n=((c&&c.name)||"").trim(); if(!n)return "?"; const w=n.split(/\s+/).filter(Boolean); let s=(w[0]&&w[0][0])||""; if(w.length>1&&w[1][0])s+=w[1][0]; return s.toUpperCase(); }
function cafeColor(name){ const P=["#e07b54","#d4a843","#7cb87c","#5b9bd5","#9b6fc4","#e06b8a","#4db8aa","#e08040"]; let h=0; for(let i=0;i<(name||"").length;i++)h=(h*31+name.charCodeAt(i))>>>0; return P[h%P.length]; }
function nophotoBg(name){ return 'linear-gradient(140deg,rgba(255,255,255,.18),rgba(0,0,0,.26)) '+cafeColor(name); }
function nophotoHTML(c){ return '<span class="em">'+esc((c&&c.emoji)||"☕")+'</span><span>'+initials(c)+'</span>'; }
/* Local calendar date. Plain toISOString() would hand back yesterday (or tomorrow) when
   logging from Hawaii or Taipei, so shift by the timezone offset before slicing. */
function localToday(){ return new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); }
/* Same glyph for both halves — ☆ is optically lighter and a different advance width, so a
   filled/hollow mix reads as decoration rather than a proportion. */
function starsHTML(r){ r=Math.max(0,Math.min(5,Math.round(r||0))); if(!r)return ""; return '<span class="cstars"><b>'+"★".repeat(r)+"</b>"+"★".repeat(5-r)+"</span>"; }
/* Single source of truth for what lives inside a card's .ph tile. Three call sites rebuild
   it (renderList, verifyCardPhoto, applyCardPhoto) — routing them all through here is what
   keeps a resolving photo from silently wiping the star pill and wish badge. */
function phInner(c,hasPhoto){ let h=hasPhoto?"":nophotoHTML(c); if(c&&c.fav)h+='<span class="favbadge">❤️</span>'; if(c&&c.wish)h+='<span class="wishbadge">🔖</span>'; return h+starsHTML(c&&c.rating); }
function verifyCardPhoto(id,url){ if(!url)return; const probe=new Image(); probe.onload=function(){ _imgFail[id]=0; }; probe.onerror=function(){ _imgFail[id]=1; const c=cafes.find(x=>x.id===id); if(c&&c.gphoto)delete c.gphoto; if(gphotoCache[id]!==undefined){ delete gphotoCache[id]; saveGphotoCache(); } const el=document.querySelector('.card[data-id="'+id+'"] .ph'); if(el){ el.style.backgroundImage=""; el.classList.remove("loaded","loading"); el.classList.add("nophoto"); el.style.background=c?nophotoBg(c.name):"#caa472"; el.innerHTML=c?phInner(c,false):"?"; } if(c&&!c.photo&&!_photoRetried[id]&&gReady&&c.lat!=null&&!gphotoInflight[id]){ _photoRetried[id]=1; gphotoInflight[id]=1; fetchPlacePhoto(c,function(u){ delete gphotoInflight[id]; if(u)applyCardPhoto(id,u); }); } }; probe.src=safeUrl(url); }
function fmtDate(s){ if(!s)return ""; const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s); if(!m)return s; const mo=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m[2]-1]; return mo+" "+(+m[3])+", "+m[1]; }
