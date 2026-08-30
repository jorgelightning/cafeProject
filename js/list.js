"use strict";
/* list.js — Search, sorting and the cafe card grid.
   Loaded by index.html; script order matters (config first, boot last). */
const STATE_NAMES={HI:"Hawaii",CA:"California",NV:"Nevada",NY:"New York",WA:"Washington",OR:"Oregon",TX:"Texas",AZ:"Arizona"};
function regionTerms(c){ const t=[]; const m=/,\s*([A-Za-z]{2})\b/.exec(c.area||""); if(m){ const ab=m[1].toUpperCase(); if(STATE_NAMES[ab])t.push(STATE_NAMES[ab],ab); } if(c.lat!=null&&c.lng!=null){ if(c.lng<-150&&c.lat>18&&c.lat<23){ t.push("Hawaii","Oahu","Honolulu"); } else if(c.lng>=-125&&c.lng<=-117&&c.lat>=32&&c.lat<=42.5){ t.push("California"); if(c.lat>=36.8&&c.lat<=38.6&&c.lng<=-121.4)t.push("Bay Area","Northern California","NorCal"); if(c.lat<34.5)t.push("Southern California","SoCal"); } else if(c.lng>-117&&c.lng<=-114&&c.lat>=35&&c.lat<=37.5){ t.push("Nevada","Las Vegas"); } } return t.join(" "); }
function typeTerms(c){ const e=c.emoji||""; let s="cafe"; if(e==="🧋")s+=" boba bubble milk tea"; else if(e==="🍵")s+=" matcha tea"; else s+=" coffee"; return s; }
function countryTerms(c){ const lat=c.lat,lng=c.lng; if(lat==null||lng==null)return ""; if((lat>=24&&lat<=49.5&&lng>=-125&&lng<=-66.5)||(lng<=-130&&lat>=51&&lat<=72)||(lng<-150&&lat>=18&&lat<=23))return "United States USA America"; if(lat>=33&&lat<=39&&lng>=125.5&&lng<=129.8)return "South Korea Korea"; if(lat>=20&&lat<=46&&lng>=122&&lng<=154)return "Japan"; if(lat>=21.8&&lat<=25.4&&lng>=119.5&&lng<=122.1)return "Taiwan"; if(lat>=22&&lat<=23.6&&lng>=113.8&&lng<=114.5)return "Hong Kong China"; if(lat>=1.15&&lat<=1.5&&lng>=103.6&&lng<=104.1)return "Singapore"; if(lat>=-44&&lat<=-10&&lng>=112&&lng<=154)return "Australia"; if(lat>=49&&lat<=59&&lng>=-8&&lng<=2)return "United Kingdom UK England"; if(lat>=41&&lat<=51&&lng>=-5&&lng<=9.6)return "France"; return ""; }
function searchHay(c){ return (c.name+" "+areaOf(c)+" "+regionTerms(c)+" "+countryTerms(c)+" "+typeTerms(c)+" "+(c.tags||[]).join(" ")+" "+(c.drinks||[]).map(d=>d.n).join(" ")).toLowerCase(); }
function matchSearch(c,q){ const hay=searchHay(c); return q.split(/\s+/).filter(Boolean).every(tok=>hay.includes(tok)); }
function distKm(lat1,lng1,lat2,lng2){ const R=6371,toRad=x=>x*Math.PI/180; const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1); const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2; return 2*R*Math.asin(Math.sqrt(a)); }
function dupNameKeys(){ const seen={},dup={}; cafes.forEach(c=>{ const k=(c.name||"").trim().toLowerCase(); if(k){ if(seen[k])dup[k]=1; seen[k]=1; } }); return dup; }
/* compact drops the " ago" suffix — that is what buys room for distance on the card line. */
function lastVisitedStr(c,compact){ var dates=[]; (c.drinks||[]).forEach(function(d){ (d.dates||[]).filter(Boolean).forEach(function(dt){ dates.push(dt); }); }); var iso=dates.length?dates.slice().sort().slice(-1)[0]:c.updated; if(!iso)return ''; var diff=Date.now()-new Date(iso).getTime(); if(diff<0)return ''; var days=Math.floor(diff/86400000); var ago=compact?'':' ago'; if(days<1)return 'today'; if(days===1)return compact?'1d':'yesterday'; if(days<7)return days+'d'+ago; if(days<31)return Math.floor(days/7)+'w'+ago; var mo=Math.floor(days/30); if(mo<12)return mo+'mo'+ago; var yr=Math.floor(days/365); return yr+'y'+ago; }
/* Filter chips: quick one-tap filters above the list. Type chips match against the cafe name + drink names only (searchHay adds a default "coffee" term to every cafe, so it can't distinguish types). */
let activeChip="";
const CHIP_DEFS=[["coffee","☕ Coffee"],["matcha","🍵 Matcha"],["boba","🧋 Boba / tea"],["liked","👍 Liked"]];
function chipMatch(c,chip){ if(chip.slice(0,4)==="tag:")return (c.tags||[]).includes(chip.slice(4)); if(chip==="liked")return reorderTally(c).yes>0; const h=(c.name+" "+(c.drinks||[]).map(d=>d.n||"").join(" ")).toLowerCase(); if(chip==="matcha")return h.includes("matcha")||h.includes("hojicha"); if(chip==="boba")return h.includes("tea")||h.includes("boba")||h.includes("tapioca")||h.includes("milksha"); if(chip==="coffee")return h.includes("coffee")||h.includes("espresso")||h.includes("roast")||h.includes("kissaten")||(h.includes("latte")&&!h.includes("matcha")&&!h.includes("hojicha")); return true; }
/* Faves and Wish are toggles on their own globals rather than activeChip values, so
   "coffee favorites" stays expressible — folding them into the single-select chip would
   quietly remove combined filters. They stay mutually exclusive to each other. */
let showTagRow=false;
function toggleFavFilter(){ favOnly=!favOnly; if(favOnly)wishOnly=false; renderList(); }
function toggleWishFilter(){ wishOnly=!wishOnly; if(wishOnly)favOnly=false; renderList(); }
/* Closing the row also drops an active tag filter, otherwise the chip would be inert
   (the row has to stay open to show the lit tag) and the list would stay filtered by
   something no longer on screen. */
function toggleTagRow(){ showTagRow=!showTagRow; if(!showTagRow&&activeChip.slice(0,4)==="tag:")activeChip=""; renderList(); }
function renderFilterChips(){ const host=$("filterchips"); if(!host)return; const nFav=cafes.filter(c=>c.fav).length, nWish=cafes.filter(c=>c.wish).length; const usedTags=ALL_TAGS.filter(t=>t!=="matcha"&&cafes.some(c=>(c.tags||[]).includes(t)));
 let h='<span class="chip'+((activeChip===""&&!favOnly&&!wishOnly)?" on":"")+'" role="button" tabindex="0" onclick="clearFilters()">All</span>';
 /* keep a lit chip on screen even if the set empties, or the list looks broken with
    nothing explaining why it is filtered */
 if(nFav||favOnly)h+='<span class="chip'+(favOnly?" on":"")+'" role="button" tabindex="0" onclick="toggleFavFilter()">❤️ '+nFav+'</span>';
 if(nWish||wishOnly)h+='<span class="chip'+(wishOnly?" on":"")+'" role="button" tabindex="0" onclick="toggleWishFilter()">🔖 '+nWish+'</span>';
 CHIP_DEFS.forEach(d=>{ h+='<span class="chip'+(activeChip===d[0]?" on":"")+'" role="button" tabindex="0" onclick="setChip(\''+d[0]+'\')">'+d[1]+'</span>'; });
 if(usedTags.length)h+='<span class="chip'+(showTagRow?" on":"")+'" role="button" tabindex="0" onclick="toggleTagRow()"># Tags</span>';
 host.innerHTML=h;
 const trow=$("tagchips"); if(trow){ if(showTagRow){ trow.style.display=""; trow.innerHTML=usedTags.map(t=>'<span class="chip'+(activeChip==="tag:"+t?" on":"")+'" role="button" tabindex="0" onclick="setChip(\'tag:'+esc(t)+'\')">'+esc(t)+'</span>').join(""); } else { trow.style.display="none"; trow.innerHTML=""; } } }
function clearFilters(){ activeChip=""; favOnly=false; wishOnly=false; showTagRow=false; renderList(); }
function setChip(v){ activeChip=(activeChip===v)?"":v; if(activeChip.slice(0,4)==="tag:")showTagRow=true; renderList(); }
function renderList(){ const q=($("q").value||"").toLowerCase().trim(); const grid=$("grid"); let items=cafes.slice(); if(favOnly)items=items.filter(c=>c.fav); if(wishOnly)items=items.filter(c=>c.wish); if(activeChip)items=items.filter(c=>chipMatch(c,activeChip)); renderFilterChips(); if(typeof updateMilkBtn==="function")updateMilkBtn(); if(q)items=items.filter(c=>matchSearch(c,q)); items.sort((a,b)=>{ /* Untested cafes sort last, not mid-table. eloScoreNum returns exactly 5.0 with no
   comparisons, which floated every unranked cafe above the 36 that were compared and lost —
   putting the most-compared cafe in the app in last place. */
  /* Ordering. Every branch ends on name so the list never jitters between equal items, and
     "ranked" checks matchCount first: eloScoreNum() returns a real 5.0 for a never-compared
     cafe, so sorting on it alone floats every untested cafe above everything that was
     compared and lost. */
  if(sortMode==="ranked"){
    const ra=matchCount(a)>0, rb=matchCount(b)>0;
    if(ra!==rb) return ra?-1:1;
    const ea=eloScoreNum(a), eb=eloScoreNum(b);
    if(ea!==eb) return eb-ea;
    const ma=matchCount(a), mb=matchCount(b);
    if(ma!==mb) return mb-ma;
    if((b.rating||0)!==(a.rating||0)) return (b.rating||0)-(a.rating||0);
    return (a.name||"").localeCompare(b.name||"");
  }
  if(sortMode==="rating"){
    if((b.rating||0)!==(a.rating||0)) return (b.rating||0)-(a.rating||0);
    const sa=eloScoreNum(a), sb=eloScoreNum(b);
    if(sa!==sb) return sb-sa;
    return (a.name||"").localeCompare(b.name||"");
  }
  if(sortMode==="near"){
    const da=(userLoc&&a.lat!=null)?distKm(userLoc.lat,userLoc.lng,a.lat,a.lng):Infinity;
    const db=(userLoc&&b.lat!=null)?distKm(userLoc.lat,userLoc.lng,b.lat,b.lng):Infinity;
    if(da!==db) return da-db;
    if((b.rating||0)!==(a.rating||0)) return (b.rating||0)-(a.rating||0);
    return (a.name||"").localeCompare(b.name||"");
  }
  const ua=a.updated?(Date.parse(a.updated)||0):0, ub=b.updated?(Date.parse(b.updated)||0):0;
  if(ua!==ub) return ub-ua;
  if((b.rating||0)!==(a.rating||0)) return (b.rating||0)-(a.rating||0);
  return (a.name||"").localeCompare(b.name||"");
});

if($("count"))$("count").textContent=items.length+(favOnly?" favorite":"")+" cafe"+(items.length===1?"":"s");

if(!items.length){
  grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="big">'
    +(wishOnly?"\u{1F516}":"\u2615")+'</div>'
    +(wishOnly
      ? "No wishlist cafes yet — tap the bookmark on a cafe to save it for later."
      : (favOnly
        ? "No favorites yet — tap the heart on a cafe."
        : (q ? "No matches." : "No cafes yet. Tap + to add your first visit!")))
    +'</div>';
  return;
}
/* Card meta reads distance · area · time — shortest and most perishable token first, so
   only the time clips. The rating now lives in the tile pill, and the liked tally is gone:
   its denominator was degenerate (all-yes or all-no in every non-zero case). */
grid.innerHTML=items.map(function(c){
  const gp=gphotoFor(c);
  const dkm=(userLoc&&c.lat!=null)?distKm(userLoc.lat,userLoc.lng,c.lat,c.lng):null;
  const dstr=dkm!=null
    ? ((dkm*0.621371)<0.1 ? Math.round(dkm*0.621371*5280)+" ft" : (dkm*0.621371).toFixed(1)+" mi")
    : "";

  /* A photo that has already failed once must not be re-offered, or the tile flashes a
     broken image on every re-render. */
  const hasPhoto=!!(gp && !_imgFail[c.id]);
  let cls="ph", style="";
  if(hasPhoto){ cls+=" loaded"; style=' style="background-image:url(\''+safeUrl(gp)+'\')"'; }
  else        { cls+=" nophoto"; style=' style="background:'+nophotoBg(c.name)+'"'; }

  const M=[];
  if(dstr)M.push(sortMode==="near"?'<span class="near">'+dstr+'</span>':dstr);
  if(areaOf(c))M.push(esc(areaOf(c)));
  const _lv=lastVisitedStr(c,true);
  if(_lv)M.push(_lv);

  return '<div class="card" data-id="'+c.id+'" role="button" tabindex="0" onclick="openDetail(\''+c.id+'\',\'list\')">'
    +'<div class="'+cls+'"'+style+'>'+phInner(c,hasPhoto)+'</div>'
    +'<div class="b">'
      +'<div class="n">'+esc(c.name)+'</div>'
      +'<div class="m">'+M.join(" · ")+'</div>'
    +'</div>'
  +'</div>';
}).join("");

/* Photos are verified after the markup lands, so a stale URL can swap the tile in place
   rather than blocking the render. */
items.forEach(function(c){ const gp=gphotoFor(c); if(gp && !_imgFail[c.id])verifyCardPhoto(c.id,gp); });
}
let sortMode="recent";
function setSort(v){ sortMode=v; renderList(); if(v==="near"){ if(navigator.geolocation)showUserLocation(false); else toast("Location not available"); } }
function showFilteredOnMap(){ const q=($('q').value||"").toLowerCase().trim(); let items=cafes.slice(); if(favOnly)items=items.filter(c=>c.fav); if(wishOnly)items=items.filter(c=>c.wish); if(q)items=items.filter(c=>matchSearch(c,q)); const pts=items.filter(c=>c.lat!=null); show("map"); if(!gmap||!pts.length)return; setTimeout(()=>{ if(pts.length===1){ gmap.setCenter({lat:pts[0].lat,lng:pts[0].lng}); gmap.setZoom(15); } else { const b=new google.maps.LatLngBounds(); pts.forEach(c=>b.extend({lat:c.lat,lng:c.lng})); gmap.fitBounds(b,fitPad()); }},100); }
