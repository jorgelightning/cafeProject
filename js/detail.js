"use strict";
/* detail.js — Cafe detail page.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- detail ---------- */
function photoLabel(c){ if(c&&c.photo)return "📷 My drink"; const u=gphotoFor(c); if(u)return "📷 Google Maps"; return ""; }
function setHeroTag(c){ const t=$("d-tagphoto"); if(!t)return; const l=photoLabel(c); if(l){ t.textContent=l; t.style.display=""; } else { t.style.display="none"; } }
function fmtPrice(p){ p=(p==null?"":String(p)).trim(); if(!p)return ""; const m=p.replace(/[^0-9.]/g,""); if(m&&!isNaN(parseFloat(m)))return "$"+parseFloat(m).toFixed(2); return p; }
/* Local amount leads, dollars follow. Standing in Taipei, NT$65 is the number you recognise
   and $2.06 is the comparison; Stats is the opposite case and stays dollars-only. A drink
   with no .pc is a plain dollar price and renders exactly as it always did. */
function priceHTML(d){
  if(!d)return "";
  const usd=fmtPrice(d.p);
  const loc=(d.pl&&d.pc&&String(d.pc).toUpperCase()!=="USD")?fmtLocal(d.pl,d.pc):"";
  if(!loc)return usd?'<span class="pr">'+esc(usd)+'</span>':"";
  const sub=usd?esc(usd):"needs rate";
  return '<span class="prwrap"><span class="pr">'+esc(loc)+'</span><span class="prsub'+(usd?"":" needs")+'">'+sub+'</span></span>';
}
function reorderVal(d){ if(!d)return ""; const v=d.reorder; if(v==="yes"||v===true)return "yes"; if(v==="no"||v===false)return "no"; if(v==="neutral")return "neutral"; return ""; }
function reorderTally(c){ let yes=0,no=0,neutral=0; ((c&&c.drinks)||[]).forEach(function(d){ drinkOrders(d).forEach(function(o){ const v=reorderVal(o), q=orderQty(o); if(v==="yes")yes+=q; else if(v==="no")no+=q; else if(v==="neutral")neutral+=q; }); }); return {yes:yes,no:no,neutral:neutral,total:yes+no+neutral}; }
function renderReorderRollup(c){ const re=$("d-reorder"); if(!re)return; const t=reorderTally(c); if(!t.total){ re.style.display="none"; re.innerHTML=""; return; } re.style.display="flex"; const pct=Math.round(t.yes/t.total*100); re.innerHTML='<span class="ro-badge '+(t.yes>=t.no?"yes":"no")+'">👍 Liked '+t.yes+' of '+t.total+'</span><span class="ro-bar"><i style="width:'+pct+'%"></i></span>'; }
/* Compact form for the detail line — the rail already carries the colour, so the chip
   only needs the glyph. The full-text badge is still used elsewhere. */
function reorderChip(d){ const v=reorderVal(d); if(!v)return ""; const e=v==="yes"?"👍":(v==="no"?"👎":"😐"); return '<span class="reorder '+v+'">'+e+'</span> '; }
function setReorder(btn,v){ const wrap=btn.parentNode; const hid=wrap.querySelector(".dre"); hid.value=(hid.value===v)?"": v; wrap.querySelectorAll(".rbtn").forEach(b=>b.classList.remove("on")); if(hid.value)wrap.querySelector(".rbtn."+hid.value).classList.add("on"); }
function drinkGlyph(n){
  n=(n||"").toLowerCase();
  if(/matcha|hojicha|green tea/.test(n))return "🍵";
  if(/boba|milk tea|oolong|\btea\b/.test(n))return "🧋";
  if(/coffee|espresso|americano|latte|mocha|cappuccino|cold brew/.test(n))return "☕";
  return "🥤";
}
function drinkHistoryPrice(d,latest){
  const range=drinkPriceRange(d);
  if(range&&Math.abs(range.max-range.min)>=.0001){
    const lo=range.code==="USD"?fmtPrice(range.min):fmtLocal(range.min,range.code);
    const hi=range.code==="USD"?fmtPrice(range.max):fmtLocal(range.max,range.code);
    return '<span class="pr range">'+esc(lo+"–"+hi)+'</span>';
  }
  return priceHTML(latest);
}
function toggleDrinkHistory(btn){
  const card=btn.closest(".drinkcard"); if(!card)return;
  const open=card.classList.toggle("open");
  btn.setAttribute("aria-expanded",open?"true":"false");
  const chev=btn.querySelector(".drinkchev"); if(chev)chev.textContent=open?"▾":"▸";
}
function openDetail(id,from){
  const c=cafes.find(x=>x.id===id);
  if(!c)return;
  if(from)lastMain=from;
  curId=id;

  /* ---- hero photo ---- */
  const hero=$("d-hero");
  if($("d-hero-emoji"))$("d-hero-emoji").textContent=(c.emoji||"☕");
  const gp0=(_imgFail[c.id]?null:gphotoFor(c));
  if(gp0){
    hero.className="hero";
    hero.style.background="";
    hero.style.backgroundImage='url("'+safeUrl(gp0)+'")';
    /* A stale Google photo URL still answers 200 with a placeholder, so this only catches
       the hard failures; isSessionPhotoUrl() keeps the rest out of storage. */
    const _hp=new Image();
    _hp.onerror=function(){
      _imgFail[c.id]=1;
      if(c.gphoto)delete c.gphoto;
      if(gphotoCache[c.id]!==undefined){ delete gphotoCache[c.id]; saveGphotoCache(); }
      if(curId===c.id){ const h=$("d-hero"); h.className="hero nophoto"; h.style.background=nophotoBg(c.name); }
    };
    _hp.src=safeUrl(gp0);
  } else {
    hero.className="hero nophoto";
    hero.style.background=nophotoBg(c.name);
  }
  setHeroTag(c);
  if(!c.photo){
    fetchPlacePhoto(c,function(url){
      if(url && curId===c.id){
        const h=$("d-hero"); h.className="hero"; h.style.background=""; h.style.backgroundImage='url("'+safeUrl(url)+'")';
      }
      if(curId===c.id)setHeroTag(c);
      applyCardPhoto(c.id,url);
    });
  }

  /* ---- header ---- */
  $("d-name").textContent=c.name;
  $("d-stars").innerHTML=(c.rating?'<b>'+"★".repeat(c.rating)+"</b>":"")+"★".repeat(5-(c.rating||0));
  $("d-meta").innerHTML=[
    areaOf(c)?esc(areaOf(c)):"",
    c.matches?('<span class="scorebadge">⚖️ '+eloScore(c)+' · '+c.matches+(c.matches===1?" compare":" compares")+'</span>'):"",
    (isAdmin&&c.updated)?("edited "+esc(fmtEdited(c.updated))):""
  ].filter(Boolean).join("  ·  ");
  try{ renderChaser(c); }catch(e){ warn("detail.js renderChaser",e); }
  $("d-fav").textContent=c.fav?"❤️":"🤍";
  if($("d-wish")){ $("d-wish").textContent="🔖"; $("d-wish").style.opacity=c.wish?"1":".45"; }
  renderReorderRollup(c);
  $("d-tags").innerHTML=(c.tags||[]).map(t=>'<span class="chip">'+esc(t)+'</span>').join("");

  /* ---- other locations of the same brand ---- */
  const _bk=(c.brand||"").trim().toLowerCase()||(c.name||"").trim().toLowerCase();
  const _sibs=cafes
    .filter(x=>(((x.brand||"").trim().toLowerCase())||((x.name||"").trim().toLowerCase()))===_bk)
    .sort((a,b)=>(a.area||"").localeCompare(b.area||""));
  const _le=$("d-locs");
  if(_sibs.length>1){
    _le.style.display="flex";
    _le.innerHTML=_sibs.map(x=>'<span class="locpill'+(x.id===c.id?' on':'')+'" role="button" tabindex="0" onclick="openDetail(\''+x.id+'\',\''+(lastMain||"list")+'\')">📍 '+esc(x.area||x.name||"Location")+'</span>').join("");
  } else {
    _le.style.display="none";
    _le.innerHTML="";
  }

  const _lastDate=d=>((latestDrinkOrder(d)||{}).date)||"";
  const _dsorted=(c.drinks||[]).slice().sort((a,b)=>_lastDate(b).localeCompare(_lastDate(a)));
/* One compact card per drink. The newest drink opens by default; every order stays available
   in the timeline without making the normal detail page feel like an edit form. */
$("d-drinks").innerHTML=_dsorted.length ? _dsorted.map(function(d,di){
    const orders=drinkOrders(d).slice().sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
    const latest=orders[0]||latestDrinkOrder(d)||{};
    const cnt=orders.reduce(function(t,o){ return t+orderQty(o); },0);
    const v=reorderVal(latest), open=di===0, hid="drink-history-"+di;
    const last=latest.date?fmtDate(latest.date):"Undated";
    const rows=orders.map(function(o,oi){
      const ov=reorderVal(o), qty=orderQty(o);
      const opts=[o.size, o.sweet?o.sweet+" sweet":"", o.ice, o.milk?"🥛 "+o.milk:""].filter(Boolean);
      return '<div class="dorder'+(ov?" v-"+ov:"")+'">'
        +'<div class="dorderdate">'+esc(o.date?fmtDate(o.date):"Undated")
          +(oi===0?' <span>· Latest</span>':'')+(qty>1?' <b>×'+qty+'</b>':'')+'</div>'
        +'<div class="dorderprice">'+priceHTML(o)+'</div>'
        +(ov||opts.length?'<div class="dordermeta">'+reorderChip(o)+esc(opts.join(" · "))+'</div>':'')
      +'</div>';
    }).join("");
    return '<div class="drinkcard'+(open?' open':'')+(v?" v-"+v:"")+'">'
      +'<button type="button" class="drinksum" aria-expanded="'+(open?'true':'false')+'" aria-controls="'+hid+'" onclick="toggleDrinkHistory(this)">'
        +'<span class="drinkicon" aria-hidden="true">'+drinkGlyph(d.n)+'</span>'
        +'<span class="drinkcopy"><span class="dtop">'+esc(d.n)
          +(drinkMatches(d)?' <span class="dscore">'+drinkScore(d)+'</span>':'')+'</span>'
          +'<span class="dsub">'+cnt+' ordered · latest '+esc(last)+'</span></span>'
        +'<span class="drinkprice">'+drinkHistoryPrice(d,latest)+'</span>'
        +'<span class="drinkchev" aria-hidden="true">'+(open?'▾':'▸')+'</span>'
      +'</button>'
      +'<div class="drinkhistory" id="'+hid+'">'+rows+'</div>'
    +'</div>';
  }).join("")
  : '<div class="row" style="color:var(--faint);font-style:italic">'
    +(isAdmin?"Tap \uFF0B Log a drink here below.":"No drinks logged yet.")+"</div>";

  const _dir=$("d-dir");
  if(_dir)_dir.style.display=(c.custom&&c.lat==null)?"none":"";
  $("d-review").textContent=c.review||(isAdmin?"Tap \u270E Edit to add your thoughts\u2026":"No notes yet.");
  show("detail");
  if(c.lat!=null&&gmap)setTimeout(function(){ mapResize(); gmap.setCenter({lat:c.lat,lng:c.lng}); gmap.setZoom(15); },80);
}
function toggleFav(){ const c=cafes.find(x=>x.id===curId); if(!c)return; c.fav=!c.fav; saveCafe(c.id); $("d-fav").textContent=c.fav?"❤️":"🤍"; renderMarkers(); toast(c.fav?"Added to favorites":"Removed from favorites"); }
function toggleWish(){ const c=cafes.find(x=>x.id===curId); if(!c)return; c.wish=!c.wish; saveCafe(c.id); $("d-wish").style.opacity=c.wish?"1":".45"; renderMarkers(); toast(c.wish?"Added to wishlist 🔖":"Removed from wishlist"); }
function deleteCurrent(){ if(!confirm("Delete this cafe?"))return; const _gone=curId; cafes=cafes.filter(x=>x.id!==curId); removeCafe(_gone); renderMarkers(); toast("Deleted"); goBack(); }
function cafeShareUrl(id){ const base=location.origin+location.pathname; return base+'?cafe='+encodeURIComponent(id); }
/* Deliberately c.area and not areaOf(c): sharing sends this to someone else, so it must carry
   the public value even when the owner is the one tapping share. */
function shareCafe(){ const c=cafes.find(x=>x.id===curId); if(!c)return; const url=cafeShareUrl(c.id); const title=c.name+(c.area?' ('+c.area+')':''); const text='Check out '+c.name+(c.area?' in '+c.area:'')+' '+'★'.repeat(c.rating||0); if(navigator.share){ navigator.share({title:title,text:text,url:url}).catch(e=>{ if(e&&e.name!=='AbortError'){ navigator.clipboard&&navigator.clipboard.writeText(url); toast('Link copied!'); } }); } else { navigator.clipboard&&navigator.clipboard.writeText(url); toast('Link copied! Share it to open this cafe on the map.'); } }
function navigateTo(){ const c=cafes.find(x=>x.id===curId); if(!c)return; const _la=latOf(c),_ln=lngOf(c); const dest=(_la!=null&&_ln!=null)?(_la+","+_ln):encodeURIComponent(c.name+(areaOf(c)?" "+areaOf(c):"")); const url="https://www.google.com/maps/dir/?api=1&destination="+dest; if(window.innerWidth>=900){ window.open(url,"_blank"); } else { window.location.href=url; } }
function editCurrent(){ openForm(curId); }
