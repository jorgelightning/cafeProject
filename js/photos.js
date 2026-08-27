"use strict";
/* photos.js — Cafe photo fetching (Places API) with cache and fallbacks.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- list ---------- */
/* ---------- google place photo fallback ---------- */
let gphotoInflight={};
function saveGphotoCache(){ try{ lsSet("cafemap.gphotos",JSON.stringify(gphotoCache)); }catch(e){ warn("photos.js",e); } }
/* Legacy PhotoService.GetPhoto URLs are bound to the session that created them — once stale, Google serves a placeholder error image with HTTP 200, so onerror probes can't detect the breakage. Never trust them from persisted data. */
function isSessionPhotoUrl(u){ return /PhotoService\.GetPhoto/.test(u||""); }
function gphotoFor(c){ if(!c)return null; if(c.photo)return c.photo; if(c.gphoto&&!isSessionPhotoUrl(c.gphoto))return c.gphoto; const entry=gphotoCache[c.id]; if(!entry)return null; if(typeof entry==="object"){ if(Date.now()-entry.ts>6*24*60*60*1000){ delete gphotoCache[c.id]; saveGphotoCache(); return null; } return entry.url; } return entry; }
function applyCardPhoto(id,url){ const el=document.querySelector('.card[data-id="'+id+'"] .ph'); if(!el)return; const c=cafes.find(x=>x.id===id); if(url){ _imgFail[id]=0; el.style.backgroundImage='url("'+safeUrl(url)+'")'; el.classList.remove("nophoto","loading"); el.classList.add("loaded"); el.innerHTML=c?phInner(c,true):""; verifyCardPhoto(id,url); } else { el.classList.remove("loading","loaded"); el.classList.add("nophoto"); el.style.backgroundImage=""; el.style.background=c?nophotoBg(c.name):"#caa472"; el.innerHTML=c?phInner(c,false):"?"; } }
/* Finding a cafe's photo used to mean searching for it by text — its name plus its area —
   and hoping the first result was the right shop. It often was not, and no amount of
   narrowing the search fixed it: "Paragon Tea Room" matched a different Paragon, and
   correcting the pin just re-ran the same query. Restricting the search to a radius around
   the pin was the second guess and it was wrong too.

   Google gives every place a permanent unique id, and the Autocomplete result the cafe was
   created from already contained it — the form threw it away. It no longer does, so a cafe
   picked from the dropdown asks for exactly one place's photos and there is nothing left to
   match wrongly.

   Three tiers, in order:
     1. c.pid  — fetch that place's photos by id. Exact.
     2. no pid — the old text search, restricted to the pin, for cafes saved before this and
                 for pins dropped by hand (where we genuinely do not know the record).
     3. legacy PlacesService, for browsers without the new Place class.
   A cafe with a pid never falls through to the text search unless the id lookup itself
   errors: a real place with no photos on file must show no photo rather than someone
   else's. */
function fetchPlacePhoto(c,cb){
  if(!c||c.id==null||c.lat==null||c.custom){ cb&&cb(null); return; }
  if(gphotoCache[c.id]!==undefined){ cb&&cb(gphotoFor(c)); return; }

  let settled=false;
  const finish=(u,cache)=>{
    if(settled)return;
    settled=true;
    clearTimeout(guard);
    if(u){ gphotoCache[c.id]={url:u,ts:Date.now()}; if(!isSessionPhotoUrl(u))saveGphotoCache(); }
    else if(cache&&gphotoCache[c.id]===undefined){ gphotoCache[c.id]=null; saveGphotoCache(); }
    cb&&cb(u);
  };
  const guard=setTimeout(()=>finish(null,true),9000);

  if(!gReady||!window.google||!google.maps||!google.maps.places){ finish(null,false); return; }

  const P=google.maps.places.Place;
  const pid=(c.pid||"").trim();
  const q=(c.name+" "+(c.area||"")).trim();
  const near={center:{lat:c.lat,lng:c.lng},radius:250};

  /* photos[] from the new Place class exposes getURI; the legacy PlaceResult uses getUrl. */
  const urlOf=(photos,legacy)=>{
    try{
      if(!photos||!photos.length)return null;
      const ph=photos[0];
      return legacy?ph.getUrl({maxWidth:800,maxHeight:600}):ph.getURI({maxWidth:800,maxHeight:600});
    }catch(e){ warn("photos.js",e); return null; }
  };

  const svcFor=()=>new google.maps.places.PlacesService(gmap||document.createElement("div"));

  /* tier 3 */
  const legacyByText=()=>{
    try{
      if(!google.maps.places.PlacesService){ finish(null,true); return; }
      svcFor().findPlaceFromQuery({query:q,fields:["photos"],locationBias:near},(res,status)=>{
        const ok=status===google.maps.places.PlacesServiceStatus.OK&&res&&res[0];
        finish(ok?urlOf(res[0].photos,true):null,true);
      });
    }catch(e){ finish(null,true); }
  };

  /* tier 2 */
  const byText=()=>{
    if(P&&P.searchByText){
      P.searchByText({textQuery:q,fields:["photos"],locationRestriction:near,maxResultCount:1})
       .then(r=>{
         const p=r&&r.places&&r.places[0];
         const url=p?urlOf(p.photos,false):null;
         if(url)finish(url,true); else legacyByText();
       })
       .catch(legacyByText);
    } else legacyByText();
  };

  const legacyById=()=>{
    try{
      if(!google.maps.places.PlacesService){ byText(); return; }
      svcFor().getDetails({placeId:pid,fields:["photos"]},(res,status)=>{
        if(status!==google.maps.places.PlacesServiceStatus.OK||!res){ byText(); return; }
        finish(urlOf(res.photos,true),true);   /* resolved; no photos means no photo */
      });
    }catch(e){ byText(); }
  };

  /* tier 1 */
  if(pid){
    if(P&&P.prototype&&P.prototype.fetchFields){
      let pl;
      try{ pl=new P({id:pid}); }catch(e){ warn("photos.js",e); legacyById(); return; }
      pl.fetchFields({fields:["photos"]})
        .then(r=>{
          const p=(r&&r.place)||pl;
          finish(urlOf(p&&p.photos,false),true);   /* same: an id that resolves is the answer */
        })
        .catch(legacyById);
    } else legacyById();
    return;
  }
  byText();
}

/* Thumbnails load lazily: a cafe's photo is only fetched when its detail page opens (openDetail), then the list card picks it up from the cache. Keeps Places API usage to one lookup per viewed cafe instead of one per listed cafe. */
/* Admin bulk action: fetch a photo for every cafe once and persist the stable URLs to Firebase (c.gphoto), so all viewers get instant thumbnails with zero API requests. Session-bound URLs are never persisted; the verify probe self-heals any URL that later dies. */
let _fapRunning=false;
async function fetchAllPhotos(){ if(_fapRunning)return; if(!isAdmin){ toast("Sign in to edit first"); return; } if(!gReady){ toast("Maps not ready yet — try again in a moment"); return; } const targets=cafes.filter(c=>c.lat!=null&&!c.custom&&!c.photo&&!(c.gphoto&&!isSessionPhotoUrl(c.gphoto))); if(!targets.length){ toast("All cafes already have a photo ✓"); return; } _fapRunning=true; const total=targets.length; toast("Fetching photos for "+total+" cafes…"); let done=0,got=0; const queue=targets.slice(); const worker=async()=>{ while(queue.length){ const c=queue.shift(); delete gphotoCache[c.id]; await new Promise(res=>fetchPlacePhoto(c,(url)=>{ if(url&&!isSessionPhotoUrl(url)){ c.gphoto=url; got++; } done++; if(done%10===0||done===total)toast(done+" / "+total+" fetched…"); res(); })); } }; try{ await Promise.all([worker(),worker(),worker()]); } finally{ _fapRunning=false; } saveGphotoCache(); save(); if(app.dataset.view==="list")renderList(); toast("Saved "+got+" of "+total+" photos ✓"); }
