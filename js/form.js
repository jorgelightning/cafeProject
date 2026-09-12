"use strict";
/* form.js — Add/edit visit form.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- form ---------- */
function checkExisting(){ if(editId)return; const name=$("f-name").value.trim(); if(!name)return; const ex=findSameCafe(name,$("f-area").value.trim(),picked?picked.lat:null,picked?picked.lng:null); if(ex){ openForm(ex.id); toast("Found "+ex.name+" — loaded your notes to edit"); } }
function fmtEdited(iso){ if(!iso)return ""; const d=new Date(iso); if(isNaN(d))return ""; return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+" · "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}); }
function openForm(id){ editId=(typeof id==="string")?id:null; const c=editId?cafes.find(x=>x.id===editId):null; formSyncBase=c?syncBaseFor(c.id):null; $("form-title").textContent=c?"Edit visit":"Add a visit"; $("f-name").value=c?c.name:""; $("f-area").value=c?areaOf(c):""; if($("f-brand"))$("f-brand").value=c?(c.brand||""):""; $("f-review").value=c?(c.review||""):""; $("f-fav").checked=c?!!c.fav:false; if($("f-wish"))$("f-wish").checked=c?!!c.wish:false; if($("f-custom"))$("f-custom").checked=c?!!c.custom:false; syncWishMode(); formPhoto=c?(c.photo||null):null; formRating=c?(c.rating||0):0; formTags=c?(c.tags||[]).slice():[]; formCC=c?(c.cc||""):""; formCcy=c?(c.ccy||""):""; formPid=c?(c.pid||""):""; picked=c&&latOf(c)!=null?{lat:latOf(c),lng:lngOf(c)}:null; if($("f-photo-url"))$("f-photo-url").value=(formPhoto&&!String(formPhoto).startsWith("data:"))?formPhoto:""; renderPhoto(); renderRate(); renderTags(); renderDrinkRows(c?c.drinks:null); renderUsuals(); _formSnap=formSnapshot(); show("form"); setTimeout(initFormMap,90); }
/* Unsaved-changes guard: snapshot the form on open, compare on any exit path (close button, back button, tab/nav via show(), page unload). Saving clears the snapshot so it never prompts. Pin coords are normalized to 5 decimals because setPicked rounds them. */
let _formSnap=null, formSyncBase=null;
function formSnapshot(){ const rows=[...document.querySelectorAll("#f-drinks .dr")].map(r=>{ const g=cl=>{ const el=r.querySelector(cl); return el?el.value:""; }; const gs=cl=>{ const el=r.querySelector(cl); return el?(el.value+":"+((el.dataset&&el.dataset.set)||"")):""; }; return [g(".dn"),g(".dp"),g(".dd"),g(".dqt"),gs(".dsz"),gs(".dsw"),gs(".dic"),g(".dmk"),g(".dre"),g(".dpc")].join("|"); }).filter(s=>s.split("|")[0].trim()).sort(); return JSON.stringify([formPid,$("f-name").value,$("f-area").value,$("f-brand")?$("f-brand").value:"",$("f-review").value,$("f-fav").checked,$("f-wish")?$("f-wish").checked:false,$("f-custom")?$("f-custom").checked:false,formPhoto,formRating,formTags,picked?[+(+picked.lat).toFixed(5),+(+picked.lng).toFixed(5)]:null,rows]); }
function formDirty(){ return _formSnap!==null && app.dataset.view==="form" && formSnapshot()!==_formSnap; }
/* Straight from a cafe page into a dated, expanded, focused drink row. The snapshot is
   retaken after the row is appended, so backing out of an untouched row does not prompt. */
function logDrinkHere(){ if(!curId)return; openForm(curId); /* logging a drink IS the visit, so it takes the cafe off the wishlist — and without
    this the drinks field focused just below is still hidden. */
 if($("f-wish")&&$("f-wish").checked){ $("f-wish").checked=false; syncWishMode(); } setTimeout(function(){ const row=addDrinkRow("","",localToday()); activateDrinkRow(row); const n=row.querySelector('.dn'); if(n)n.focus({preventScroll:true}); row.scrollIntoView({block:'start'}); _formSnap=formSnapshot(); },140); }
function closeForm(){ if(formDirty()&&!confirm("Discard unsaved changes to this visit?"))return; _formSnap=null; if(editId)show("detail"); else if(wishOnly)show("wish"); else if(favOnly)show("list",true); else show(lastMain); }
function initFormMap(){ if(!gReady)return; const start=picked?{lat:picked.lat,lng:picked.lng}:{lat:DEFAULT_CENTER[0],lng:DEFAULT_CENTER[1]}; if(!fgmap){ fgmap=new google.maps.Map($("form-map"),{center:start,zoom:13,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,clickableIcons:false,gestureHandling:"greedy"}); fgmap.addListener("click",e=>{ formPid=""; setPicked(e.latLng.lat(),e.latLng.lng()); }); try{ const ac=new google.maps.places.Autocomplete($("f-name"),{fields:["name","geometry","address_components","place_id"]}); ac.addListener("place_changed",()=>{ const p=ac.getPlace();
 /* Picking a different place is a relocation, so the area has to follow it. Keeping the
    old one left the cafe reading as its previous neighbourhood, and left the photo query
    (name + area) unchanged, so the wrong photo came straight back. */
 const _wasAt=picked?{lat:picked.lat,lng:picked.lng}:null;
 let _moved=false;
 if(p.geometry&&p.geometry.location){ const loc=p.geometry.location; setPicked(loc.lat(),loc.lng()); fgmap.setCenter(loc); fgmap.setZoom(16);
   _moved=!_wasAt||Math.abs(_wasAt.lat-picked.lat)>0.0004||Math.abs(_wasAt.lng-picked.lng)>0.0004; } if(p.name)$("f-name").value=p.name;
 /* The one piece of the answer that is not a guess. Every Places record has a unique id,
    and this response already contains it — the app used to throw it away and then go
    looking for the place again by name, which is how a cafe ends up wearing another
    cafe's photo. Keep it and the photo lookup stops searching entirely. */
 if(p.place_id)formPid=String(p.place_id); /* address_components was already being requested and already being walked for the area;
   the country component rides along on the same response. It is the authoritative answer
   to "which money is this", which no lat/lng rectangle can be. */
if(p.address_components){ const co=p.address_components.find(x=>x.types.includes("country")); if(co&&co.short_name){ formCC=co.short_name.toUpperCase(); refreshRowCcy(); } if(!$("f-area").value||_moved){ const nb=p.address_components.find(x=>x.types.includes("neighborhood")||x.types.includes("sublocality")||x.types.includes("locality")); if(nb)$("f-area").value=nb.long_name; } } checkExisting(); }); }catch(e){ warn("form.js",e); } try{ const ac2=new google.maps.places.Autocomplete($("f-area"),{fields:["geometry","name"],types:["geocode"]}); ac2.addListener("place_changed",()=>{ const p=ac2.getPlace(); if(p.geometry&&p.geometry.location){ const loc=p.geometry.location; fgmap.setCenter(loc); fgmap.setZoom(15); if(!picked)setPicked(loc.lat(),loc.lng()); } if(p.name)$("f-area").value=p.name; }); }catch(e){ warn("form.js",e); } } google.maps.event.trigger(fgmap,"resize"); fgmap.setCenter(start); if(picked)setPicked(picked.lat,picked.lng); else if(fgmarker){ fgmarker.setMap(null); fgmarker=null; $("f-coords").textContent=""; } }
function setPicked(lat,lng){ picked={lat:+lat.toFixed(5),lng:+lng.toFixed(5)}; if(fgmarker)fgmarker.setMap(null); fgmarker=new google.maps.Marker({position:{lat:picked.lat,lng:picked.lng},map:fgmap}); $("f-coords").textContent=picked.lat+", "+picked.lng; }
function formLocate(){ if(!navigator.geolocation){ toast("Location not available"); return; } navigator.geolocation.getCurrentPosition(p=>{ formPid=""; if(fgmap){ fgmap.setCenter({lat:p.coords.latitude,lng:p.coords.longitude}); fgmap.setZoom(15); } setPicked(p.coords.latitude,p.coords.longitude); },()=>toast("Couldn't get location")); }
function renderPhoto(){ const d=$("f-photodrop"); const icon=d.querySelector("div"); if(formPhoto){ d.style.backgroundImage='url("'+safeUrl(formPhoto)+'")'; if(icon)icon.style.display="none"; $("f-photolabel").textContent=""; } else { d.style.backgroundImage=""; if(icon)icon.style.display=""; $("f-photolabel").textContent="Paste an image link below to preview"; } }
function onPhotoUrl(){ const v=$("f-photo-url").value.trim(); formPhoto=v||null; renderPhoto(); const s=$("f-photo-status"); if(!s)return; if(!v){ s.textContent=""; return; } s.textContent="Checking link…"; s.style.color="var(--soft)"; const t=new Image(); t.onload=()=>{ s.textContent="✓ Image loaded"; s.style.color="#3aa76d"; }; t.onerror=()=>{ s.textContent='⚠ Couldn\'t load this link — use the photo\'s "Copy image address" link, not the Share link.'; s.style.color="var(--acc2)"; }; t.src=v; }
function renderRate(){ $("f-rate").innerHTML=[1,2,3,4,5].map(n=>'<span class="'+(n<=formRating?"on":"")+'" role="button" tabindex="0" onclick="formRating='+n+';renderRate()">★</span>').join(""); }
function renderTags(){ $("f-tags").innerHTML=ALL_TAGS.map(t=>'<span class="chip '+(formTags.includes(t)?"on":"")+'" role="button" tabindex="0" onclick="toggleTag(\''+t+'\')">'+t+'</span>').join(""); }
function toggleTag(t){ formTags.includes(t)?formTags=formTags.filter(x=>x!==t):formTags.push(t); renderTags(); }
function drinkGroupPriceText(d){
  const r=drinkPriceRange(d); if(!r)return "No price";
  const f=function(n){ return r.code==="USD"?fmtPrice(n):fmtLocal(n,r.code); };
  return Math.abs(r.max-r.min)<0.0001?f(r.max):(f(r.min)+"–"+f(r.max));
}
function toggleDrinkGroup(btn){ const g=btn.closest(".drgroup"); if(!g)return; const open=g.classList.toggle("open"); btn.setAttribute("aria-expanded",open?"true":"false"); const ch=btn.querySelector(".drgchev"); if(ch)ch.textContent=open?"▾":"▸"; }
function syncDrinkGroupName(inp){ const g=inp.closest(".drgroup"); if(!g)return; const n=inp.value.trim(); g.dataset.name=n; g.querySelectorAll(".dn").forEach(function(x){ x.value=n; }); const b=g.querySelector(".drgmain b"); if(b)b.textContent=n||"Drink"; const add=g.querySelector(".drgadd"); if(add)add.textContent="＋ Add another "+(n||"order"); }
function addOrderToGroup(btn){
  const g=btn.closest(".drgroup"), body=g&&g.querySelector(".drgorders"); if(!g||!body)return;
  const src=body.querySelector(".dr"), val=function(sel){ const e=src&&src.querySelector(sel); return e?e.value:""; };
  const set=function(sel){ const e=src&&src.querySelector(sel); return e&&e.dataset&&e.dataset.set==="1"?e.value:""; };
  const pc=val(".dpc")||ccyFor({cc:formCC,ccy:formCcy});
  const ice=src&&src.querySelector(".dic"), iceVal=(ice&&ice.dataset.set==="1")?ice.dataset.labels.split("|")[ice.value]:"";
  const row=addDrinkRow(g.dataset.name,"",localToday(),set(".dsw"),iceVal,set(".dsz"),"",false,val(".dmk"),1,{pc:pc},body,true);
  g.classList.add("open"); const h=g.querySelector(".drghead"); if(h){ h.setAttribute("aria-expanded","true"); const ch=h.querySelector(".drgchev"); if(ch)ch.textContent="▾"; }
  activateDrinkRow(row); const p=row.querySelector(".dp"); if(p){ try{ p.focus({preventScroll:true}); }catch(e){ p.focus(); } }
  row.scrollIntoView({block:"center"});
}
/* One compact group per drink, then one independently editable row per purchase. This is
   what prevents a price typed for September from rewriting the same drink bought in June. */
/* ---------- your usuals ----------
   Three taps' worth of shortcut at the top of the drinks section. The drink you order most
   is the one you should never have to spell, and the options you always pick are the ones
   you should never have to set again — "Hojicha latte" has been typed out by hand at more
   than twenty cafes, and four of those came out misspelled into their own separate record.

   Scoped to your whole history rather than this cafe deliberately: at a cafe you have logged
   before, the drink already has a group with its own "＋ Add another" button, so this is for
   the case that has no shortcut at all — a cafe you have never been to. */
let _formIx=null;
function renderUsuals(){
  const host=$("f-usuals");
  if(!host)return;
  _formIx=drinkIndex();
  const top=topUsuals(_formIx,3);
  if(!top.length){ host.hidden=true; host.innerHTML=""; return; }
  host.hidden=false;
  host.innerHTML='<span class="usuallbl">Log again</span>'+top.map(function(e){
    const spec=usualSpec(e);
    const bits=USUAL_FIELDS.map(function(f){ return spec[f]; }).filter(Boolean).join(" · ");
    return '<button type="button" class="uchip" onclick="logUsual(this)" data-key="'+esc(e.key)+'"'
      +' title="'+esc(e.n+(bits?" — "+bits:""))+'">'
      +esc(e.n)+'<span class="ucount">'+e.count+'</span></button>';
  }).join("");
}
/* One tap has to produce a finished order, not a head start: the name spelled the way you
   spell it, the options you usually pick, dated today. Price is the one thing that genuinely
   differs per cafe, so that is where the cursor lands. */
function logUsual(btn){
  const e=(_formIx||drinkIndex())[btn.dataset.key];
  if(!e)return;
  const spec=usualSpec(e);
  const row=addDrinkRow(e.n,"",localToday(),spec.sweet,spec.ice,spec.size,"",false,spec.milk,1,null);
  if(!row)return;
  activateDrinkRow(row);
  const p=row.querySelector(".dp");
  if(p){ try{ p.focus({preventScroll:true}); }catch(_){ p.focus(); } }
  row.scrollIntoView({block:"start"});
  const bits=USUAL_FIELDS.map(function(f){ return spec[f]; }).filter(Boolean).join(" · ");
  toast("Added "+e.n+(bits?" — "+bits:"")+" ✓");
}
function renderDrinkRows(drinks){
  const host=$("f-drinks"); host.innerHTML="";
  if(!drinks||!drinks.length){ addDrinkRow("","",localToday()); return; }
  drinks.slice().sort(function(a,b){ const ad=(latestDrinkOrder(a)||{}).date||"", bd=(latestDrinkOrder(b)||{}).date||""; return bd.localeCompare(ad); }).forEach(function(d){
    const orders=drinkOrders(d).sort(function(a,b){ return (b.date||"").localeCompare(a.date||""); });
    const qty=orders.reduce(function(t,o){ return t+orderQty(o); },0), latest=latestDrinkOrder(d)||{};
    const g=document.createElement("div"); g.className="drgroup"; g.dataset.name=d.n||"";
    g.innerHTML='<button type="button" class="drghead" aria-expanded="false" onclick="toggleDrinkGroup(this)">'
      +'<span class="drgchev">▸</span><span class="drgmain"><b>'+esc(d.n||"Drink")+'</b><small>'+qty+' order'+(qty===1?'':'s')+' · latest '+esc(latest.date?fmtDate(latest.date):'undated')+'</small></span>'
      +'<span class="drgprice">'+esc(drinkGroupPriceText(d))+'</span></button><div class="drgbody"><label class="drgname">Drink name<input type="text" value="'+esc(d.n||'')+'" oninput="syncDrinkGroupName(this)"></label><div class="drgorders"></div></div>'
      +'<button type="button" class="drgadd" onclick="addOrderToGroup(this)">＋ Add another '+esc(d.n||'order')+'</button>';
    host.appendChild(g);
    const body=g.querySelector(".drgorders");
    orders.forEach(function(o){ addDrinkRow(d.n,o.p,o.date,o.sweet,o.ice,o.size,o.reorder,false,o.milk,orderQty(o),{pl:o.pl,pc:o.pc,pr:o.pr,pd:o.pd,id:o.id},body,true); });
    arrangeOrderHistory(body);
  });
}
/* The currency control doubles as the row's storage for .pc — it is a real <select>, so it
   round-trips through the form the way .dmk and .dre already do rather than needing the
   keep{} rescue that saveForm() uses for Elo. Hidden when the cafe is a resolved USD one,
   but still in the DOM so saveForm() always finds a value; shown when the cafe's money is
   not dollars, when this drink already carries a currency, or when we never resolved a
   country at all (custom cafes) — which is exactly where the escape hatch is needed. */
function ccyOptions(sel){ sel=(sel||"USD").toUpperCase(); const seen={}, out=[]; const push=function(code){ if(!code||seen[code])return; seen[code]=1; out.push(code); }; push(sel); push("USD"); push(ccyFor({cc:formCC,ccy:formCcy})); Object.keys(CCY_META).forEach(push); return out; }
function ccyOptionsHTML(sel){ sel=(sel||"USD").toUpperCase(); return ccyOptions(sel).map(function(code){ const m=ccyMeta(code); return '<option value="'+esc(code)+'"'+(code===sel?" selected":"")+'>'+esc((m.sym||"").trim()||code)+" "+esc(code)+'</option>'; }).join(""); }
function ccySelectHTML(sel,hidden){ return '<select class="dpc"'+(hidden?" hidden":"")+' onchange="syncCcy(this)" aria-label="Currency">'+ccyOptionsHTML(sel)+'</select>'; }
function rowPriceLabel(amt,pc){ pc=(pc||"USD").toUpperCase(); return pc==="USD"?fmtPrice(amt):fmtLocal(amt,pc); }
function convHintHTML(amt,pc,rate,date,visit){
  pc=(pc||"USD").toUpperCase(); if(pc==="USD")return "";
  if(ccyNum(amt)==null)return "";
  const usd=toUSD(amt,pc,rate);
  if(usd==null)return '<span class="needs">No rate for '+esc(pc)+' — saves without a dollar figure</span>';
  const r=(typeof rate==="number"&&rate>0)?rate:fxRate(pc,visit);
  let h='<span class="usd">≈ $'+usd.toFixed(2)+'</span><span class="fxrate">'+esc((ccyMeta(pc).sym||"")+String(r))+' = $1'+(date?" · "+esc(fmtDate(date)):"")+'</span>';
  /* Typing up a trip months later is the normal case, so say plainly when the number is
     today's rate standing in for the day you actually paid. */
  if(visit&&date&&daysBetween(visit,date)>45)
    h+='<span class="stale">no '+esc(fmtDate(visit))+' rate on file</span>';
  return h;
}
function rowVisitDate(dr){ const d=dr&&dr.querySelector(".dd"); return (d&&d.value)||localToday(); }
/* Typing an amount never re-rates a row that already carries a frozen rate — editing the
   notes on a drink bought in Taipei in 2024 must not re-price it at today's market. Only a
   row that has no rate yet picks one up. */
function syncPrice(inp){
  const dr=inp.closest(".dr"); if(!dr)return;
  const sel=dr.querySelector(".dpc"), rt=dr.querySelector(".dpr"), dt=dr.querySelector(".dpd");
  const pc=sel?sel.value:"USD", visit=rowVisitDate(dr);
  /* A rate that came off a saved drink stays put — editing an old drink's notes must never
     re-price it. Any other row follows its own visit date, so fixing the date on a
     backdated visit also fixes the rate it converts at. */
  if(rt&&rt.dataset.frozen!=="1"&&pc!=="USD"){
    const q=fxRateAt(pc,visit);
    rt.value=q.rate?String(q.rate):""; if(dt)dt.value=q.rate?q.asof:"";
    /* and go ask for the real one for this date; it repaints the row if it arrives */
    fxEnsure(pc,visit,function(){ if(document.body.contains(inp))syncPrice(inp); });
  }
  const hint=dr.querySelector(".convhint");
  if(hint)hint.innerHTML=convHintHTML(inp.value,pc,rt?parseFloat(rt.value):0,dt?dt.value:"",visit);
  if(dr.classList.contains("collapsed")){ const t=dr.querySelector(".drtitle"); if(t)t.textContent=drinkRowLabel(dr); }
}
/* Choosing a currency by hand is an active re-declaration, so it does take today's rate. */
function syncCcy(sel){
  const dr=sel.closest(".dr"); if(!dr)return;
  sel.dataset.user="1";
  formCcy=sel.value;   /* remember it on the cafe so this is a once-per-cafe question */
  const rt=dr.querySelector(".dpr"); if(rt)rt.dataset.frozen="";   /* re-declaring the currency re-rates */
  const dp=dr.querySelector(".dp"); if(dp)syncPrice(dp);
}
/* Places resolves the country after the blank first row is already on screen. Adopt the
   cafe's currency on rows that are still empty and untouched; a row with an amount already
   typed is left alone, because reinterpreting a number is how $6.50 silently becomes ₩6.50. */
function refreshRowCcy(){
  const ccy=ccyFor({cc:formCC,ccy:formCcy});
  document.querySelectorAll("#f-drinks .dr").forEach(function(dr){
    const sel=dr.querySelector(".dpc"), dp=dr.querySelector(".dp");
    if(!sel||!dp||sel.dataset.user==="1")return;
    if(String(dp.value||"").trim())return;
    sel.innerHTML=ccyOptionsHTML(ccy); sel.value=ccy;
    sel.hidden=(ccy==="USD"&&!!formCC);
    const rt=dr.querySelector(".dpr"); if(rt)rt.dataset.frozen="";
    syncPrice(dp);
  });
}
/* No reverse geocode here on purpose. new google.maps.Geocoder bills against the Geocoding
   API — a separate, metered API from the Maps JavaScript and Places ones this app already
   uses — and it is not worth a bill to save a tap. The country still arrives free for any
   cafe picked through Autocomplete, because address_components was already being fetched.
   For a cafe with no country on file the currency chip is shown instead, and whatever you
   pick is stored on the cafe (c.cc) and never asked for again. */
/* A wishlist entry is somewhere you have not been, so the fields describing a visit —
   photo, drinks, rating, tags, favourite — have nothing to describe. They are hidden
   rather than cleared, so anything already typed survives unticking the box. The notes
   box stays either way: "heard the hojicha is good" is exactly what is worth keeping
   about a place you are saving for later, which is why it stops being a "review". */
function syncWishMode(){
  const pane=$("pane-form"); if(!pane)return;
  const w=$("f-wish"), on=!!(w&&w.checked);
  pane.dataset.wish=on?"1":"";
  const lab=$("f-review-label"); if(lab)lab.textContent=on?"Notes":"Review / thoughts";
  const ta=$("f-review"); if(ta)ta.placeholder=on?"Why you want to go, what to order…":"Vibe, taste, service…";
}
function drinkRowLabel(dr){ const g=cls=>{ const el=dr.querySelector(cls); return el?el.value:""; }; const q=parseInt(g(".dqt"),10)||1; const grouped=!!dr.closest(".drgroup"); const d=g(".dd"); const parts=[grouped?(d?fmtDate(d):"Undated order"):((g(".dn")||"").trim()||"New drink")]; const p=(g(".dp")||"").trim(); if(p)parts.push(rowPriceLabel(p,g(".dpc")||"USD")); if(q>1)parts.push("×"+q); if(!grouped&&d)parts.push(fmtDate(d)); return parts.join(" · "); }
/* Quantity for ordering several of the same drink on one visit. Stored as the drink's
   count, which is also what repeat visits increment, so N here and N separate visits
   are the same thing to the rest of the app. */
/* The date input keeps its class, value and position in the DOM — only its presentation
   changes — so formSnapshot(), saveForm() and drinkRowLabel() are untouched. */
function datePillLabel(v){ if(!v)return "Add date"; if(v===localToday())return "Today"; const y=new Date(Date.now()-86400000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); if(v===y)return "Yesterday"; return fmtDate(v); }
function syncDatePill(inp){ const w=inp.closest(".datepill"); if(w)w.querySelector(".dpv").textContent=datePillLabel(inp.value); const dr=inp.closest(".dr"); if(dr){ const dp=dr.querySelector(".dp"); if(dp)syncPrice(dp); } if(dr&&dr.classList.contains("collapsed")){ const t=dr.querySelector(".drtitle"); if(t)t.textContent=drinkRowLabel(dr); } }
function setOrderDay(btn,offset){ const inp=btn.closest('.orderdate').querySelector('.dd'); if(offset===null)inp.value=''; else {const d=new Date();d.setDate(d.getDate()+offset);inp.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');} syncDatePill(inp);inp.dispatchEvent(new Event('input',{bubbles:true})); }
function arrangeOrderHistory(body,active){
  let history=body.querySelector(':scope > .orderhistory');
  if(!history){history=document.createElement('details');history.className='orderhistory';history.innerHTML='<summary>Previous orders</summary>';body.appendChild(history);}
  [...body.querySelectorAll('.dr')].forEach(function(row){if(row!==active){row.classList.add('collapsed');row.querySelector('.drchev').textContent='▸';row.querySelector('.drtitle').textContent=drinkRowLabel(row);history.appendChild(row);}});
  if(active)body.insertBefore(active,history);
  const count=history.querySelectorAll('.dr').length;history.querySelector('summary').textContent='Previous orders ('+count+')';history.hidden=!count;history.open=false;
}
function activateDrinkRow(row){
  const group=row.closest('.drgroup');
  document.querySelectorAll('#f-drinks .dr').forEach(function(other){if(other!==row){other.classList.add('collapsed');other.querySelector('.drchev').textContent='▸';other.querySelector('.drtitle').textContent=drinkRowLabel(other);}});
  document.querySelectorAll('#f-drinks .drgroup').forEach(function(g){if(g!==group){g.classList.remove('open');g.querySelector('.drghead').setAttribute('aria-expanded','false');g.querySelector('.drgchev').textContent='▸';}});
  if(group){$('f-drinks').prepend(group);arrangeOrderHistory(group.querySelector('.drgorders'),row);}else $('f-drinks').prepend(row);
  row.classList.remove('collapsed');row.querySelector('.drchev').textContent='▾';
}
/* closest() rather than parentNode: the trash sits inside .dr today, but parentNode would
   silently delete the wrong node the moment the row markup gains a wrapper. A named row is
   real logged data, so it asks first; a blank row has nothing to lose and just goes. */
function delDrinkRow(btn){ const row=btn.closest(".dr"); if(!row)return; const el=row.querySelector(".dn"); const n=el?el.value.trim():""; const q=parseInt((row.querySelector(".dqt")||{}).value,10)||1; const dt=(row.querySelector(".dd")||{}).value||""; if(n&&!confirm("Remove "+n+(q>1?" ×"+q:"")+(dt?" from "+fmtDate(dt):" from this visit")+"?"))return; const g=row.closest(".drgroup"); row.remove(); if(g&&!g.querySelector(".dr"))g.remove(); }
function bumpQty(btn,delta){ const w=btn.closest(".qtywrap"); const hid=w.querySelector(".dqt"); const v=Math.max(1,Math.min(99,(parseInt(hid.value,10)||1)+delta)); hid.value=v; w.querySelector(".qval").textContent="×"+v; const dr=btn.closest(".dr"); if(dr&&dr.classList.contains("collapsed")){ const t=dr.querySelector(".drtitle"); if(t)t.textContent=drinkRowLabel(dr); } }
const MILKS=["Whole","2%","Skim","Oat","Almond","Soy","Coconut","Macadamia","Lactose-free","Half & half","None"];
function setMilk(btn){ const wrap=btn.closest(".mkwrap"); const hid=wrap.querySelector(".dmk"); const v=btn.dataset.milk; hid.value=(hid.value===v)?"":v; wrap.querySelectorAll(".mkbtn").forEach(b=>b.classList.toggle("on",!!hid.value&&b.dataset.milk===hid.value)); }
/* Milk used to be typed into drink names ("Hojicha latte w/ oak milk"), which also split
   one drink across several ranking entries. This moves it into the milk field. A rename is
   applied only when the trimmed name is unique in that cafe — otherwise the name is left
   alone and just the milk is set, so entries that record separate visits never merge. */
const MILK_IN_NAME=[[/\s*\/w\s*oak\s*milk\b/i,"Oat"],[/\s*[+]\s*oak\s*milk\b/i,"Oat"],[/\s*\bw\/\s*oak\s*milk\b/i,"Oat"],[/\s*\bw\/\s*oak\b/i,"Oat"],[/\s*\/\s*oak\b/i,"Oat"],[/\s*\boat\s*milk\b/i,"Oat"],[/\s*\boak\s*milk\b/i,"Oat"],[/\s*\blactose[\s-]*free\b/i,"Lactose-free"]];
function milkFromName(n){ for(let i=0;i<MILK_IN_NAME.length;i++){ const re=MILK_IN_NAME[i][0]; if(re.test(n))return {milk:MILK_IN_NAME[i][1],name:n.replace(re,"").replace(/\s{2,}/g," ").replace(/[\s+/-]+$/,"").trim()}; } return null; }
function milkCleanupPlan(){ const out=[]; cafes.forEach(c=>{ const t={}; (c.drinks||[]).forEach(d=>{ if(!d||!d.n)return; const m=milkFromName(d.n); const k=((m&&m.name)?m.name:d.n).trim().toLowerCase(); t[k]=(t[k]||0)+1; }); (c.drinks||[]).forEach(d=>{ if(!d||!d.n)return; const m=milkFromName(d.n); if(!m)return; const rename=(m.name&&t[m.name.toLowerCase()]===1)?m.name:null; if(d.milk&&!rename)return; out.push({d:d,milk:m.milk,newName:rename}); }); }); return out; }
function updateMilkBtn(){ const b=$("ab-milk"); if(!b)return; const n=isAdmin?milkCleanupPlan().length:0; b.style.display=n?"":"none"; if(n)b.textContent="🥛 Fix milk in "+n+" name"+(n===1?"":"s"); }
/* ---------- fix drinks already split by a typo ----------
   Prevention does nothing for the ones already on record. A variant is a name that is one or
   two keystrokes from a spelling you use far more often — "Hojica latte" beside twenty-odd
   "Hojicha latte". The dominant spelling wins; the rare one is renamed onto it.

   Two shapes come out of that. Usually the cafe has only the misspelled record, so it is a
   rename. Sometimes the cafe has both, and then it is a real merge — orders from each are
   concatenated and syncDrinkSummary() rebuilds the dates, count and summary fields, exactly
   as saveForm() does when two rows share a name. Elo follows whichever record has more
   matches, because that is the one the ranking actually knows about. */
function spellingFixPlan(){
  const ix=drinkIndex();
  const keys=Object.keys(ix);
  const canon={};
  keys.forEach(function(k){
    const e=ix[k];
    let best=null;
    keys.forEach(function(other){
      if(other===k)return;
      const o=ix[other];
      /* only a clearly dominant spelling may absorb another, so two drinks you order about
         equally are left alone rather than silently collapsed into one */
      if(o.count<e.count*3)return;
      const cap=Math.min(2,Math.floor(k.length*0.2)||1);
      const dist=editDistance(k,other,cap);
      if(dist>cap)return;
      if(!best||dist<best.dist||(dist===best.dist&&o.count>best.count))
        best={key:other,n:o.n,count:o.count,dist:dist};
    });
    if(best)canon[k]=best;
  });
  const plan=[];
  (cafes||[]).forEach(function(c){
    (c.drinks||[]).forEach(function(d){
      const k=(d.n||"").trim().toLowerCase();
      const to=canon[k];
      if(!to)return;
      const into=(c.drinks||[]).find(function(x){ return x!==d && (x.n||"").trim().toLowerCase()===to.key; });
      plan.push({cafe:c, drink:d, from:d.n, to:to.n, merge:!!into, into:into||null});
    });
  });
  return plan;
}
function updateSpellBtn(){
  const b=$("ab-spell");
  if(!b)return;
  const n=isAdmin?spellingFixPlan().length:0;
  b.style.display=n?"":"none";
  if(n)b.textContent="🔤 Fix "+n+" misspelled drink"+(n===1?"":"s");
}
function fixDrinkSpellings(){
  if(!isAdmin){ toast("Sign in to edit first"); return; }
  const plan=spellingFixPlan();
  if(!plan.length){ toast("No misspelled drinks ✓"); updateSpellBtn(); return; }
  const merges=plan.filter(function(x){ return x.merge; }).length;
  const lines=plan.map(function(x){
    return "• " + x.from + "  →  " + x.to + "   (" + x.cafe.name + (x.merge?", merges with the one already there":"") + ")";
  });
  if(!confirm("Rename "+plan.length+" drink"+(plan.length===1?"":"s")+" onto the spelling you use more often?\n\n"
    +lines.join("\n")
    +"\n\nEvery order, date and price is kept"
    +(merges?"; "+merges+" of these merge into a drink already at that cafe":"")
    +". Nothing is deleted."))return;
  plan.forEach(function(x){
    if(x.merge&&x.into){
      const keep=x.into;
      const ledger={n:x.to,orders:drinkOrders(keep).concat(drinkOrders(x.drink))};
      /* the ranking follows the record it actually knows */
      const a=keep.matches||0, b=x.drink.matches||0;
      const src=(b>a)?x.drink:keep;
      if(src.elo!==undefined)ledger.elo=src.elo;
      if(src.matches!==undefined)ledger.matches=Math.max(a,b);
      syncDrinkSummary(ledger);
      Object.keys(keep).forEach(function(k){ delete keep[k]; });
      Object.assign(keep,ledger);
      x.cafe.drinks=x.cafe.drinks.filter(function(d){ return d!==x.drink; });
    } else {
      x.drink.n=x.to;
    }
  });
  save();
  try{ renderList(); }catch(e){ warn("form.js",e); }
  if(app.dataset.view==="detail"&&curId)openDetail(curId);
  toast("Fixed "+plan.length+" drink name"+(plan.length===1?"":"s")+" ✓");
  updateSpellBtn();
}
function cleanupMilkNames(){ if(!isAdmin){ toast("Sign in to edit first"); return; } const plan=milkCleanupPlan(); if(!plan.length){ toast("Nothing to clean ✓"); updateMilkBtn(); return; } const ren=plan.filter(x=>x.newName).length; if(!confirm("Set the milk field on "+plan.length+" drink"+(plan.length===1?"":"s")+" that mention milk in their name?\n\n• "+ren+" also get the milk trimmed out of the name\n• "+(plan.length-ren)+" keep their name so separate visits stay separate\n\nNo drinks or dates are removed. This updates your saved data."))return; plan.forEach(x=>{ const orders=drinkOrders(x.d); orders.forEach(function(o){ if(!o.milk)o.milk=x.milk; }); x.d.orders=orders; if(x.newName)x.d.n=x.newName; syncDrinkSummary(x.d); }); save(); try{ renderList(); }catch(e){ warn("form.js",e); } if(app.dataset.view==="detail"&&curId)openDetail(curId); toast("Updated "+plan.length+" drinks ✓"); updateMilkBtn(); }
function toggleDrinkRow(btn){ const dr=btn.closest('.dr');if(dr.classList.contains('collapsed')){activateDrinkRow(dr);dr.scrollIntoView({block:'nearest'});}else{dr.classList.add('collapsed');btn.querySelector('.drchev').textContent='▸';btn.querySelector('.drtitle').textContent=drinkRowLabel(dr);} }
/* Commit on click, never pointerdown: a finger scrolling over a choice changes nothing. */
function setDrinkOption(control,value){
  const wrap=control.closest('.drinkoption'), input=wrap.querySelector('.optionvalue');
  input.dataset.set=value===null?'0':'1';
  if(value!==null)input.value=value;
  wrap.querySelectorAll('[data-option]').forEach(function(b){ b.setAttribute('aria-pressed',String(value!==null&&b.dataset.option===String(value))); });
  const output=wrap.querySelector('output');
  if(output)output.textContent=value===null?'Not set':value+' oz';
  const custom=wrap.querySelector('.sweetcustom');
  if(custom&&custom!==control)custom.value=value!==null&&![0,25,50,75,100].includes(Number(value))?value:'';
  input.dispatchEvent(new Event('input',{bubbles:true}));
}
function chooseDrinkOption(btn){ setDrinkOption(btn,btn.getAttribute('aria-pressed')==='true'?null:btn.dataset.option); }
function stepDrinkSize(btn,delta){
  const input=btn.closest('.drinkoption').querySelector('.optionvalue');
  setDrinkOption(btn,Math.max(8,Math.min(32,(input.dataset.set==='1'?Number(input.value):16)+delta)));
}
function customDrinkSweetness(input){
  if(input.value===''){ setDrinkOption(input,null); return; }
  if(input.validity.valid)setDrinkOption(input,Number(input.value));
}
function addDrinkRow(n,p,date,sweet,ice,size,reorder,old,milk,qty,fx,target,orderRow){ const re=(reorder==="yes"||reorder===true)?"yes":((reorder==="no"||reorder===false)?"no":(reorder==="neutral"?"neutral":"")); const sv=parseInt(String(sweet||"").replace(/[^0-9]/g,""),10); const hasSweet=!isNaN(sv); const sval=hasSweet?sv:50; /* Ice/Temp runs coldest (left) to hottest (right). Stored values are the labels themselves, so reordering the scale doesn't touch saved data. */
const ICS=["Extra ice","Regular ice","Less ice","No ice","Warm","Hot"]; const iv=ICS.indexOf(ice||""); const hasIce=iv>=0; const ival=hasIce?iv:3; const zoz=parseInt(String(size||"").replace(/[^0-9]/g,""),10); const hasSize=!isNaN(zoz); const zval=hasSize?Math.max(8,Math.min(32,Math.round(zoz/2)*2)):16; const qv=Math.max(1,Math.min(99,parseInt(qty,10)||1)); const collapsed=!!(n&&String(n).trim());
/* The visible price field holds whatever was actually paid, so for a non-USD drink it shows
   the local amount and .p is derived at save. A drink that has a price but no recorded
   currency is a legacy dollar price and stays one — only a row with nothing in it yet
   inherits the cafe's money, which is what keeps the 60 existing USD drinks untouched. */
fx=fx||{}; const pcode=(fx.pc?String(fx.pc):((p&&String(p).trim())?"USD":ccyFor({cc:formCC,ccy:formCcy}))).toUpperCase();
const amt=(pcode!=="USD"&&fx.pl!=null&&String(fx.pl)!=="")?String(fx.pl):(p==null?"":String(p));
const _q=fxRateAt(pcode,date);
const prate=(typeof fx.pr==="number"&&fx.pr>0)?fx.pr:_q.rate;
const pdate=fx.pd||_q.asof;
const showCcy=(pcode!=="USD")||(ccyFor({cc:formCC,ccy:formCcy})!=="USD")||!formCC;
const title=esc(((n||"").trim()||"New drink")
  +(qv>1?" ×"+qv:"")
  +(amt.trim()?" · "+rowPriceLabel(amt,pcode):"")
  +(date?" · "+fmtDate(date):""));

const div=document.createElement("div");
div.dataset.orderId=fx.id||uid();
div.className="dr"+(collapsed?" collapsed":"")+(orderRow?" orderrow":"");

/* Collapsed, the header is the whole row — drinkRowLabel() keeps its text in sync. */
const head='<button type="button" class="drhead" onclick="toggleDrinkRow(this)">'
  +'<span class="drchev">'+(collapsed?"▸":"▾")+'</span>'
  +'<span class="drtitle">'+title+'</span>'
  +'<span class="dredit">✎</span>'
+'</button>';

/* The currency <select> IS this row's storage for .pc — it round-trips through the form the
   way .dmk and .dre do, rather than needing saveForm()'s keep{} rescue. The two hidden
   inputs carry the frozen rate and the date that rate is from. */
const nameAndPrice='<input class="dn" aria-label="Drink name" type="text" autocomplete="off" placeholder="Drink" value="'+esc(n||"")+'">'
  +'<div class="priceline">'
    +ccySelectHTML(pcode,!showCcy)
    +'<input class="dp" aria-label="Price each" type="text" autocomplete="off" placeholder="Price" value="'+esc(amt)+'" oninput="syncPrice(this)">'
  +'</div>'
  +'<input type="hidden" class="dpr" data-frozen="'+(fx.pr?"1":"")+'" value="'+esc(prate?String(prate):"")+'">'
  +'<input type="hidden" class="dpd" value="'+esc(pdate)+'">'
  +'<div class="convhint">'+convHintHTML(amt,pcode,prate,pdate,date||localToday())+'</div>';

const qtyRow='<div class="qtywrap">'
  +'<span class="swlabel">How many</span>'
  +'<button type="button" class="qbtn" onclick="bumpQty(this,-1)" aria-label="One fewer">−</button>'
  +'<span class="qval">×'+qv+'</span>'
  +'<button type="button" class="qbtn" onclick="bumpQty(this,1)" aria-label="One more">+</button>'
  +'<input type="hidden" class="dqt" value="'+qv+'">'
+'</div>';

/* Hidden values keep the existing ledger and unsaved-change detection intact. */
const sizeRow='<div class="drinkoption">'
  +'<div class="optionhead">Cup size<button type="button" onclick="setDrinkOption(this,null)">Clear</button></div>'
  +'<input class="dsz optionvalue" type="hidden" value="'+zval+'" data-set="'+(hasSize?1:0)+'">'
  +'<div class="sizesteps"><button type="button" onclick="stepDrinkSize(this,-2)" aria-label="Decrease size by 2 ounces">−</button><output aria-live="polite">'+(hasSize?zval+' oz':'Not set')+'</output><button type="button" onclick="stepDrinkSize(this,2)" aria-label="Increase size by 2 ounces">+</button></div>'
+'</div>';

const sweetRow='<div class="drinkoption">'
  +'<div class="optionhead">Sweetness<button type="button" onclick="setDrinkOption(this,null)">Clear</button></div>'
  +'<input class="dsw optionvalue" type="hidden" value="'+sval+'" data-set="'+(hasSweet?1:0)+'">'
  +'<div class="optionchoices" role="group" aria-label="Sweetness">'+[0,25,50,75,100].map(function(v){return '<button type="button" data-option="'+v+'" aria-pressed="'+(hasSweet&&sval===v)+'" onclick="chooseDrinkOption(this)">'+v+'%</button>';}).join('')+'</div>'
  +'<label class="customsweet">Custom <input class="sweetcustom" type="number" min="0" max="100" step="1" inputmode="numeric" aria-label="Custom sweetness percentage" value="'+(hasSweet&&![0,25,50,75,100].includes(sval)?sval:'')+'" oninput="customDrinkSweetness(this)"> %</label>'
+'</div>';

const iceRow='<div class="drinkoption">'
  +'<div class="optionhead">Ice / temperature<button type="button" onclick="setDrinkOption(this,null)">Clear</button></div>'
  +'<input class="dic optionvalue" type="hidden" value="'+ival+'" data-set="'+(hasIce?1:0)+'" data-labels="Extra ice|Regular ice|Less ice|No ice|Warm|Hot">'
  +'<div class="optionchoices icechoices" role="group" aria-label="Ice and temperature">'+ICS.map(function(v,i){return '<button type="button" data-option="'+i+'" aria-pressed="'+(hasIce&&iv===i)+'" onclick="chooseDrinkOption(this)">'+v+'</button>';}).join('')+'</div>'
+'</div>';

const milkRow='<label class="mkwrap compactmilk">Milk<select class="dmk" aria-label="Milk"><option value="">Not set</option>'+MILKS.concat(milk&&!MILKS.includes(milk)?[milk]:[]).map(mk=>'<option value="'+esc(mk)+'"'+(mk===milk?' selected':'')+'>'+esc(mk)+'</option>').join("")+'</select></label>';

const rateRow='<div class="rowrap">'
  +'<span class="swlabel">Would order again?</span>'
  +'<button type="button" aria-label="Would order again: yes" class="rbtn yes'+(re==="yes"?" on":"")+'" onclick="setReorder(this,\'yes\')">👍</button>'
  +'<button type="button" aria-label="Would order again: maybe" class="rbtn neutral'+(re==="neutral"?" on":"")+'" onclick="setReorder(this,\'neutral\')">😐</button>'
  +'<button type="button" aria-label="Would order again: no" class="rbtn no'+(re==="no"?" on":"")+'" onclick="setReorder(this,\'no\')">👎</button>'
  +'<input type="hidden" class="dre" value="'+re+'">'
+'</div>';

const dateRow='<div class="orderdate"><label>Order date<input class="dd" type="date" value="'+esc(date||'')+'" onchange="syncDatePill(this)"></label><div class="datequick"><button type="button" onclick="setOrderDay(this,0)">Today</button><button type="button" onclick="setOrderDay(this,-1)">Yesterday</button><button type="button" onclick="setOrderDay(this,null)">Clear date</button></div></div>';
div.innerHTML=head+dateRow+nameAndPrice+qtyRow+sizeRow+milkRow+sweetRow+iceRow+rateRow
  +'<button type="button" class="orderdone" onclick="toggleDrinkRow(this.closest(\'.dr\').querySelector(\'.drhead\'))">Done editing this order</button>'
  +'<button class="delrow" onclick="delDrinkRow(this)">✕</button>';

if(old){ div.classList.add("dr-old"); div.style.display="none"; }
const host=target||$("f-drinks");
host.appendChild(div);
if(!target&&!old)activateDrinkRow(div);
return div;
}
function visitCount(d){ const a=drinkOrders(d); return a.length?a.reduce(function(t,o){ return t+orderQty(o); },0):1; }
function findSameCafe(name,area,lat,lng){ const nm=(name||"").trim().toLowerCase(); if(!nm)return null; return cafes.find(c=>{ if((c.name||"").trim().toLowerCase()!==nm)return false; if(lat!=null&&c.lat!=null)return Math.abs(lat-c.lat)<0.004&&Math.abs(lng-c.lng)<0.004; const a1=(area||"").trim().toLowerCase(), a2=(c.area||"").trim().toLowerCase(); /* Same name, no pin, no area to compare: not enough to call it the same place. A visible
   duplicate you can merge on purpose beats a silent merge you never notice. */
if(a1&&a2)return a1===a2; return false; })||null; }
/* Merges a fresh visit into a cafe that already exists. Unlike saveForm()'s edit branch this
   mutates field by field instead of replacing c.drinks wholesale, which is why it has never
   destroyed anything — but it only stays safe if every field added to a drink is handled here
   deliberately. Laid out one statement per line for that reason. */
function mergeVisitInto(c,data){
  c.drinks = c.drinks || [];
  (data.drinks||[]).forEach(function(nd){
    const key = nd.n.toLowerCase();
    const ex  = c.drinks.find(function(d){ return d.n.toLowerCase()===key; });
    if(!ex){ c.drinks.push(syncDrinkSummary(nd)); return; }
    /* Append purchases; never replace the old drink's price with the newest one. The
       compatibility fields are rebuilt from the latest dated order after the append. */
    const ledger={n:ex.n,orders:drinkOrders(ex).concat(drinkOrders(nd))};
    if(ex.elo!==undefined)ledger.elo=ex.elo;
    if(ex.matches!==undefined)ledger.matches=ex.matches;
    syncDrinkSummary(ledger);
    Object.keys(ex).forEach(function(k){ delete ex[k]; });
    Object.assign(ex,ledger);
  });
  c.tags = [...new Set([...(c.tags||[]), ...(data.tags||[])])];
  if(data.fav)               c.fav    = true;
  if(data.rating)            c.rating = data.rating;
  if(data.photo && !c.photo) c.photo  = data.photo;
  if(!c.area && data.area)   c.area   = data.area;
  if(!c.cc && data.cc)       c.cc     = data.cc;
  if(!c.pid && data.pid)     c.pid    = data.pid;
  if(data.ccy)               c.ccy    = data.ccy;
  if((c.drinks||[]).length)  c.wish   = false;   /* a drink on the record means you went */
  if(c.lat==null && data.lat!=null){ c.lat = data.lat; c.lng = data.lng; }
  if(data.review){
    c.review = c.review
      ? (c.review.indexOf(data.review)>=0 ? c.review : c.review + "\n\n" + data.review)
      : data.review;
  }
  if(data.updated) c.updated = data.updated;
}
function saveForm(){
 try{
  const name=$("f-name").value.trim();
  if(!name){ toast("Please add a cafe name"); return; }
  const invalidSweet=document.querySelector('#f-drinks .sweetcustom:invalid');
  if(invalidSweet){
    const row=invalidSweet.closest('.dr'), group=invalidSweet.closest('.drgroup');
    if(group&&!group.classList.contains('open'))toggleDrinkGroup(group.querySelector('.drghead'));
    if(row.classList.contains('collapsed'))toggleDrinkRow(row.querySelector('.drhead'));
    invalidSweet.reportValidity(); return;
  }

  /* One entry per visible drink row, read straight back out of the form. Every field the form
     owns has to be listed here: anything missing is silently dropped on the next edit, which
     is the trap DESIGN_NOTES opens with. */
  const raw=[...document.querySelectorAll("#f-drinks .dr")].map(function(r){
    const q=function(sel){ return r.querySelector(sel); };
    const dn=q(".dn"), dp=q(".dp"), dsz=q(".dsz"), dd=q(".dd"), dsw=q(".dsw"), dic=q(".dic"),
          dre=q(".dre"), dmk=q(".dmk"), dqt=q(".dqt"),
          dpc=q(".dpc"), dprt=q(".dpr"), dpdt=q(".dpd");
    return {
      /* carried so the guard below can write a correction back into the field the user is
         looking at; `raw` is filtered, so an index into the row list would not line up.
         Never reaches saved data — the grouping below copies named fields only. */
      _row:    r,
      qty:     Math.max(1,Math.min(99,(dqt?parseInt(dqt.value,10):1)||1)),
      n:       dn?dn.value.trim():"",
      id:      r.dataset.orderId,
      p:       dp?dp.value.trim():"",
      size:    (dsz&&dsz.dataset.set==="1")?(dsz.value+" oz"):"",
      date:    dd?dd.value:"",
      sweet:   (dsw&&dsw.dataset.set==="1")?(dsw.value+"%"):"",
      ice:     (dic&&dic.dataset.set==="1")?(dic.dataset.labels.split("|")[dic.value]):"",
      milk:    dmk?dmk.value:"",
      reorder: dre?dre.value:"",
      pc:      dpc?dpc.value:"USD",
      pr:      dprt?(parseFloat(dprt.value)||0):0,
      pd:      dpdt?dpdt.value:""
    };
  }).filter(function(d){ return d.n; });

  /* A name one keystroke away from something you already log is almost always that thing,
     typed in a hurry — "Hojica latte" and "Hojicha lattye" both reached the record this way
     and became separate drinks with their own counts and their own Elo.

     It asks rather than corrects, and that is not politeness: "Hojicha latte (Snoopy version)"
     and "Hojicha Einspanner" are real, separate drinks. Only a name that is genuinely new AND
     within a keystroke or two of an existing one gets a question; everything else saves
     silently. Corrections are applied to the rows themselves, so the grouping below merges
     them the same way it merges any two rows sharing a name. */
  const _gix=drinkIndex();
  const _asked={};
  raw.forEach(function(d){
    const k=d.n.toLowerCase();
    if(_asked[k]!==undefined){ if(_asked[k])d.n=_asked[k]; return; }
    const near=nearestDrinkName(_gix,d.n);
    if(!near){ _asked[k]=""; return; }
    const use=confirm('Did you mean "'+near.n+'"?\n\n'
      +'You typed "'+d.n+'", and you have logged "'+near.n+'" '
      +near.count+' time'+(near.count===1?'':'s')+'.\n\n'
      +'OK — log it as "'+near.n+'"\n'
      +'Cancel — keep "'+d.n+'" as a separate drink');
    _asked[k]=use?near.n:"";
    if(use){
      d.n=near.n;
      const el=d._row&&d._row.querySelector(".dn");
      if(el)el.value=near.n;
    }
  });

  /* Rows still group by lowercased drink name, but every row remains an independent order.
     This is the key distinction: dates, prices, quantities and options travel together. */
  const dmap=new Map();
  raw.forEach(function(d){
    const k=d.n.toLowerCase();
    if(!dmap.has(k))dmap.set(k,{n:d.n,orders:[]});
    const e=dmap.get(k);
    const o=priceFields(d.p,d.pc,d.pr,d.pd); o.id=d.id;
    if(d.date)    o.date    = d.date;
    if(d.qty>1)   o.qty     = d.qty;
    if(d.size)    o.size    = d.size;
    if(d.sweet)   o.sweet   = d.sweet;
    if(d.ice)     o.ice     = d.ice;
    if(d.milk)    o.milk    = d.milk;
    if(d.reorder) o.reorder = d.reorder;
    e.orders.push(o);
  });

  const drinks=[...dmap.values()].map(syncDrinkSummary);

  const data={
    name,
    area:    $("f-area").value.trim(),
    brand:   $("f-brand")?$("f-brand").value.trim():"",
    lat:     picked?picked.lat:null,
    lng:     picked?picked.lng:null,
    photo:   formPhoto,
    rating:  formRating,
    fav:     $("f-fav").checked,
    wish:    $("f-wish")?$("f-wish").checked:false,
    custom:  $("f-custom")?$("f-custom").checked:false,
    tags:    formTags.slice(),
    review:  $("f-review").value.trim(),
    cc:      formCC||"",
    ccy:     formCcy||"",
    pid:     formPid||"",
    drinks,
    updated: new Date().toISOString()
  };
  /* an unresolved country must not blank a country we already knew */
  if(!data.cc)delete data.cc;
  if(!data.ccy)delete data.ccy;
  if(!data.pid)delete data.pid;
  /* Everything this app writes is world-readable — cafes.json is served from the repo and the
     Firebase node is read without auth — so a private spot has to be blurred here, before the
     value leaves the form. Hiding it in the UI instead would be theatre: anyone can open the
     JSON. Re-saving an old private spot that predates this heals it. */
  /* Grab the real values before redactPrivate() takes them, so they can go to the owner-only
     node. `data` itself must leave here blurred — it is what gets written to the public one. */
  const _exact=data.custom?{area:data.area||"",lat:data.lat,lng:data.lng}:null;
  redactPrivate(data);

  let savedId=editId, msg="Saved ✓";
  const c=editId?cafes.find(x=>x.id===editId):null;
/* A wishlist entry is a place you have not been, so it saves no visit. The visit fields were
   hidden while the box was ticked; anything typed before it was ticked goes with them rather
   than being filed as a visit that never happened. Tags survive — "matcha" is a fine reason
   to want to go. Editing is the dangerous direction: ticking the box on a cafe that really
   does have history would quietly delete it, so that case asks first and names what it costs. */
if(data.wish){
  if(c){
    const lost=[], nd=(c.drinks||[]).length;
    if(nd)lost.push(nd+" logged drink"+(nd===1?"":"s"));
    if(c.rating)lost.push("its rating");
    if(c.photo)lost.push("its photo");
    if(c.fav)lost.push("its favorite mark");
    if(lost.length&&!confirm("Mark "+c.name+" as a wishlist place?\n\nThat removes "+lost.join(", ")+"."))return;
  }
  data.drinks=[]; data.rating=0; data.photo=null; data.fav=false;
}
/* ...and the same rule the other way round: a drink on the record means you went, so the
   cafe cannot still be somewhere you mean to go. */
if((data.drinks||[]).length)data.wish=false; if(c){ const moved=(c.lat!==data.lat||c.lng!==data.lng);
/* Re-picking the cafe from the dropdown to correct a wrong photo often lands on the same
   coordinates, so "moved" alone would not have invalidated anything and the wrong picture
   would have stayed cached. A changed place id means the lookup itself changed. */
const pidChanged=((c.pid||"")!==(data.pid||""));
/* data.drinks is rebuilt from the form rows and carries no elo/matches, so Object.assign
   below replaces c.drinks wholesale and destroys every head-to-head ever recorded at this
   cafe — which is exactly what happened to every cafe edited since ranking shipped. Carry
   the ledger across on the same lowercased-name key that dmap and mergeVisitInto collapse
   on; a renamed drink legitimately starts over. (Cafe-level c.elo survives this assign only
   because `data` has no elo key — do not add one.) */
const keep={}; (c.drinks||[]).forEach(function(d){ if(!d||!d.n)return; if(d.elo===undefined&&d.matches===undefined)return; const k=d.n.trim().toLowerCase(); if(!keep[k]||(d.matches||0)>(keep[k].matches||0))keep[k]={elo:d.elo,matches:d.matches}; });
Object.assign(c,data);
(c.drinks||[]).forEach(function(d){ const p=keep[(d.n||"").trim().toLowerCase()]; if(!p)return; if(p.elo!==undefined)d.elo=p.elo; if(p.matches!==undefined)d.matches=p.matches; });
  if(moved||pidChanged){ delete gphotoCache[c.id]; if(c.gphoto)delete c.gphoto; saveGphotoCache();
    /* The pin moved somewhere we could not tie to a Places record (data.pid is gone), so the
       stored id now describes a different place. Deleting data.pid above only stops it being
       overwritten — the stale one has to go, or the photo lookup keeps fetching the old
       place's picture with total confidence. */
    if(moved&&!data.pid&&c.pid)delete c.pid; }
  if(c.custom){
    if(c.emoji==="☕")c.emoji="🏠";
    if(c.gphoto){ delete c.gphoto; delete gphotoCache[c.id]; saveGphotoCache(); }
  } else if(c.emoji==="🏠") c.emoji="☕";

 } else {
  /* Not an edit: either this is another visit to a cafe already on record, or a new one. */
  const ex=findSameCafe(data.name,data.area,data.lat,data.lng);
  if(ex){
    mergeVisitInto(ex,data);
    savedId=ex.id;
    msg="Added another visit to "+ex.name+" ✓";
  } else {
    data.id=uid();
    data.emoji=data.custom?"🏠":"☕";
    savedId=data.id;
    cafes.push(data);
  }
 }

 saveCafe(savedId,editId?formSyncBase:undefined);
 /* The public record is written above, blurred. The exact address goes to the owner-only node
    — or is deleted from it, if this stopped being a private spot, so unticking the box does
    not leave an address behind in a place nobody looks at again. */
 if(_exact)savePrivateDetail(savedId,_exact);
 else removePrivateDetail(savedId,!!(c&&c.custom));
 _formSnap=null;
 try{ renderMarkers(); }catch(e){ warn("form.js renderMarkers",e); }
 try{ renderList();    }catch(e){ warn("form.js renderList",e); }
 toast(msg);
 try{ chaserArm(savedId); }catch(e){ _chaser=null; warn("form.js chaserArm",e); }
 savedId?openDetail(savedId):show(lastMain);

 }catch(err){
  console.error("saveForm failed",err);
  toast("Couldn't save — "+(err&&err.message?err.message:"unexpected error"));
 }
}
