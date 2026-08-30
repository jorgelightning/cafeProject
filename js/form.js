"use strict";
/* form.js — Add/edit visit form.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- form ---------- */
function checkExisting(){ if(editId)return; const name=$("f-name").value.trim(); if(!name)return; const ex=findSameCafe(name,$("f-area").value.trim(),picked?picked.lat:null,picked?picked.lng:null); if(ex){ openForm(ex.id); toast("Found "+ex.name+" — loaded your notes to edit"); } }
function fmtEdited(iso){ if(!iso)return ""; const d=new Date(iso); if(isNaN(d))return ""; return d.toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})+" · "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}); }
function openForm(id){ editId=(typeof id==="string")?id:null; const c=editId?cafes.find(x=>x.id===editId):null; $("form-title").textContent=c?"Edit visit":"Add a visit"; $("f-name").value=c?c.name:""; $("f-area").value=c?(c.area||""):""; if($("f-brand"))$("f-brand").value=c?(c.brand||""):""; $("f-review").value=c?(c.review||""):""; $("f-fav").checked=c?!!c.fav:false; if($("f-wish"))$("f-wish").checked=c?!!c.wish:false; if($("f-custom"))$("f-custom").checked=c?!!c.custom:false; syncWishMode(); formPhoto=c?(c.photo||null):null; formRating=c?(c.rating||0):0; formTags=c?(c.tags||[]).slice():[]; formCC=c?(c.cc||""):""; formCcy=c?(c.ccy||""):""; formPid=c?(c.pid||""):""; picked=c&&c.lat!=null?{lat:c.lat,lng:c.lng}:null; if($("f-photo-url"))$("f-photo-url").value=(formPhoto&&!String(formPhoto).startsWith("data:"))?formPhoto:""; renderPhoto(); renderRate(); renderTags(); renderDrinkRows(c?c.drinks:null); _formSnap=formSnapshot(); show("form"); setTimeout(initFormMap,90); }
/* Unsaved-changes guard: snapshot the form on open, compare on any exit path (close button, back button, tab/nav via show(), page unload). Saving clears the snapshot so it never prompts. Pin coords are normalized to 5 decimals because setPicked rounds them. */
let _formSnap=null;
function formSnapshot(){ const rows=[...document.querySelectorAll("#f-drinks .dr")].map(r=>{ const g=cl=>{ const el=r.querySelector(cl); return el?el.value:""; }; const gs=cl=>{ const el=r.querySelector(cl); return el?(el.value+":"+((el.dataset&&el.dataset.set)||"")):""; }; return [g(".dn"),g(".dp"),g(".dd"),g(".dqt"),gs(".dsz"),gs(".dsw"),gs(".dic"),g(".dmk"),g(".dre"),g(".dpc")].join("|"); }).filter(s=>s.split("|")[0].trim()); return JSON.stringify([formPid,$("f-name").value,$("f-area").value,$("f-brand")?$("f-brand").value:"",$("f-review").value,$("f-fav").checked,$("f-wish")?$("f-wish").checked:false,$("f-custom")?$("f-custom").checked:false,formPhoto,formRating,formTags,picked?[+(+picked.lat).toFixed(5),+(+picked.lng).toFixed(5)]:null,rows]); }
function formDirty(){ return _formSnap!==null && app.dataset.view==="form" && formSnapshot()!==_formSnap; }
/* Straight from a cafe page into a dated, expanded, focused drink row. The snapshot is
   retaken after the row is appended, so backing out of an untouched row does not prompt. */
function logDrinkHere(){ if(!curId)return; openForm(curId); /* logging a drink IS the visit, so it takes the cafe off the wishlist — and without
    this the drinks field focused just below is still hidden. */
 if($("f-wish")&&$("f-wish").checked){ $("f-wish").checked=false; syncWishMode(); } setTimeout(function(){ addDrinkRow("","",localToday()); const rows=document.querySelectorAll("#f-drinks .dr"); const last=rows[rows.length-1]; if(last){ last.classList.remove("collapsed"); const n=last.querySelector(".dn"); if(n){ try{ n.focus({preventScroll:true}); }catch(e){ n.focus(); } } last.scrollIntoView({block:"center"}); } _formSnap=formSnapshot(); },140); }
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
function renderDrinkRows(drinks){ $("f-drinks").innerHTML=""; const rows=[]; /* One row per dated visit; any count beyond the known dates becomes quantity on the
   last row (or a single undated row), instead of trailing blank-date rows. */
(drinks&&drinks.length?drinks:[{n:"",p:""}]).forEach(d=>{ const ds=(d.dates||[]).filter(Boolean); const cnt=Math.max(d.count||0,ds.length,1); const base={n:d.n,p:d.p,pl:d.pl,pc:d.pc,pr:d.pr,pd:d.pd,sweet:d.sweet,ice:d.ice,size:d.size,milk:d.milk,reorder:d.reorder}; if(ds.length){ ds.forEach(dt=>rows.push(Object.assign({},base,{date:dt,qty:1}))); const extra=cnt-ds.length; if(extra>0)rows[rows.length-1].qty+=extra; } else { rows.push(Object.assign({},base,{date:(drinks&&drinks.length)?"":localToday(),qty:cnt})); } }); rows.sort((a,b)=>(b.date||"").localeCompare(a.date||"")); const KEEP=3; const hideFrom=(rows.length>KEEP+1)?KEEP:rows.length; rows.forEach((r,i)=>addDrinkRow(r.n,r.p,r.date,r.sweet,r.ice,r.size,r.reorder,i>=hideFrom,r.milk,r.qty,{pl:r.pl,pc:r.pc,pr:r.pr,pd:r.pd})); const hidden=rows.length-hideFrom; if(hidden>0){ const b=document.createElement("button"); b.type="button"; b.className="hintbtn dr-oldertoggle"; b.textContent="⌛ Show "+hidden+" older visit"+(hidden===1?"":"s")+" ▾"; b.onclick=function(){ document.querySelectorAll("#f-drinks .dr-old").forEach(e=>{ e.style.display=""; }); this.remove(); }; $("f-drinks").appendChild(b); } }
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
function drinkRowLabel(dr){ const g=cls=>{ const el=dr.querySelector(cls); return el?el.value:""; }; const q=parseInt(g(".dqt"),10)||1; const parts=[((g(".dn")||"").trim()||"New drink")+(q>1?" ×"+q:"")]; const p=(g(".dp")||"").trim(); if(p)parts.push(rowPriceLabel(p,g(".dpc")||"USD")); const d=g(".dd"); if(d)parts.push(fmtDate(d)); return parts.join(" · "); }
/* Quantity for ordering several of the same drink on one visit. Stored as the drink's
   count, which is also what repeat visits increment, so N here and N separate visits
   are the same thing to the rest of the app. */
/* The date input keeps its class, value and position in the DOM — only its presentation
   changes — so formSnapshot(), saveForm() and drinkRowLabel() are untouched. */
function datePillLabel(v){ if(!v)return "Add date"; if(v===localToday())return "Today"; const y=new Date(Date.now()-86400000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10); if(v===y)return "Yesterday"; return fmtDate(v); }
function syncDatePill(inp){ const w=inp.closest(".datepill"); if(w)w.querySelector(".dpv").textContent=datePillLabel(inp.value); const dr=inp.closest(".dr"); if(dr){ const dp=dr.querySelector(".dp"); if(dp)syncPrice(dp); } if(dr&&dr.classList.contains("collapsed")){ const t=dr.querySelector(".drtitle"); if(t)t.textContent=drinkRowLabel(dr); } }
/* closest() rather than parentNode: the trash sits inside .dr today, but parentNode would
   silently delete the wrong node the moment the row markup gains a wrapper. A named row is
   real logged data, so it asks first; a blank row has nothing to lose and just goes. */
function delDrinkRow(btn){ const row=btn.closest(".dr"); if(!row)return; const el=row.querySelector(".dn"); const n=el?el.value.trim():""; const q=parseInt((row.querySelector(".dqt")||{}).value,10)||1; if(n&&!confirm("Remove "+n+(q>1?" ×"+q:"")+" from this visit?"))return; row.remove(); }
function bumpQty(btn,delta){ const w=btn.closest(".qtywrap"); const hid=w.querySelector(".dqt"); const v=Math.max(1,Math.min(99,(parseInt(hid.value,10)||1)+delta)); hid.value=v; w.querySelector(".qval").textContent="×"+v; }
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
function cleanupMilkNames(){ if(!isAdmin){ toast("Sign in to edit first"); return; } const plan=milkCleanupPlan(); if(!plan.length){ toast("Nothing to clean ✓"); updateMilkBtn(); return; } const ren=plan.filter(x=>x.newName).length; if(!confirm("Set the milk field on "+plan.length+" drink"+(plan.length===1?"":"s")+" that mention milk in their name?\n\n• "+ren+" also get the milk trimmed out of the name\n• "+(plan.length-ren)+" keep their name so separate visits stay separate\n\nNo drinks or dates are removed. This updates your saved data."))return; plan.forEach(x=>{ if(!x.d.milk)x.d.milk=x.milk; if(x.newName)x.d.n=x.newName; }); save(); try{ renderList(); }catch(e){ warn("form.js",e); } if(app.dataset.view==="detail"&&curId)openDetail(curId); toast("Updated "+plan.length+" drinks ✓"); updateMilkBtn(); }
function toggleDrinkRow(btn){ const dr=btn.closest(".dr"); const c=dr.classList.toggle("collapsed"); btn.querySelector(".drchev").textContent=c?"▸":"▾"; if(c)btn.querySelector(".drtitle").textContent=drinkRowLabel(dr); }
function addDrinkRow(n,p,date,sweet,ice,size,reorder,old,milk,qty,fx){ const re=(reorder==="yes"||reorder===true)?"yes":((reorder==="no"||reorder===false)?"no":(reorder==="neutral"?"neutral":"")); const sv=parseInt(String(sweet||"").replace(/[^0-9]/g,""),10); const hasSweet=!isNaN(sv); const sval=hasSweet?sv:50; /* Ice/Temp runs coldest (left) to hottest (right). Stored values are the labels themselves, so reordering the scale doesn't touch saved data. */
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
div.className="dr"+(collapsed?" collapsed":"");

/* Collapsed, the header is the whole row — drinkRowLabel() keeps its text in sync. */
const head='<button type="button" class="drhead" onclick="toggleDrinkRow(this)">'
  +'<span class="drchev">'+(collapsed?"▸":"▾")+'</span>'
  +'<span class="drtitle">'+title+'</span>'
  +'<span class="dredit">✎</span>'
+'</button>';

/* The currency <select> IS this row's storage for .pc — it round-trips through the form the
   way .dmk and .dre do, rather than needing saveForm()'s keep{} rescue. The two hidden
   inputs carry the frozen rate and the date that rate is from. */
const nameAndPrice='<input class="dn" type="text" autocomplete="off" placeholder="Drink" value="'+esc(n||"")+'">'
  +'<div class="priceline">'
    +ccySelectHTML(pcode,!showCcy)
    +'<input class="dp" type="text" autocomplete="off" placeholder="Price" value="'+esc(amt)+'" oninput="syncPrice(this)">'
    +'<span class="datepill">'
      +'<span class="dpv">'+esc(datePillLabel(date))+'</span>'
      +'<input class="dd" type="date" value="'+esc(date||"")+'" onchange="syncDatePill(this)">'
    +'</span>'
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

/* data-set distinguishes "never touched" from "deliberately set to the default", which is
   why an untouched slider saves nothing rather than saving its midpoint. */
const sizeRow='<div class="szwrap">'
  +'<span class="swlabel">Cup size</span>'
  +'<input class="dsz" type="range" min="8" max="32" step="2" value="'+zval+'" data-set="'+(hasSize?1:0)+'" oninput="this.dataset.set=\'1\';this.parentNode.querySelector(\'.szval\').textContent=this.value+\' oz\';">'
  +'<span class="szval">'+(hasSize?zval+" oz":"—")+'</span>'
+'</div>';

const sweetRow='<div class="swwrap">'
  +'<span class="swlabel">Sweetness</span>'
  +'<input class="dsw" type="range" min="0" max="100" step="5" value="'+sval+'" data-set="'+(hasSweet?1:0)+'" oninput="this.dataset.set=\'1\';this.parentNode.querySelector(\'.swval\').textContent=this.value+\'%\';">'
  +'<span class="swval">'+(hasSweet?sval+"%":"—")+'</span>'
+'</div>';

const iceRow='<div class="icwrap">'
  +'<span class="swlabel">Ice / Temp</span>'
  +'<input class="dic" type="range" min="0" max="5" step="1" value="'+ival+'" data-set="'+(hasIce?1:0)+'" data-labels="Extra ice|Regular ice|Less ice|No ice|Warm|Hot" oninput="this.dataset.set=\'1\';this.parentNode.querySelector(\'.icval\').textContent=this.dataset.labels.split(\'|\')[this.value];">'
  +'<span class="icval">'+(hasIce?ICS[iv]:"—")+'</span>'
+'</div>';

const milkRow='<div class="mkwrap">'
  +'<span class="swlabel">Milk</span>'
  +MILKS.map(function(mk){
     return '<button type="button" class="mkbtn'+(mk===milk?" on":"")+'" data-milk="'+esc(mk)+'" onclick="setMilk(this)">'+esc(mk)+'</button>';
   }).join("")
  +'<input type="hidden" class="dmk" value="'+esc(milk||"")+'">'
+'</div>';

const rateRow='<div class="rowrap">'
  +'<span class="swlabel">Rate it</span>'
  +'<button type="button" class="rbtn yes'+(re==="yes"?" on":"")+'" onclick="setReorder(this,\'yes\')">👍</button>'
  +'<button type="button" class="rbtn neutral'+(re==="neutral"?" on":"")+'" onclick="setReorder(this,\'neutral\')">😐</button>'
  +'<button type="button" class="rbtn no'+(re==="no"?" on":"")+'" onclick="setReorder(this,\'no\')">👎</button>'
  +'<input type="hidden" class="dre" value="'+re+'">'
+'</div>';

div.innerHTML=head+nameAndPrice+qtyRow+sizeRow+sweetRow+iceRow+milkRow+rateRow
  +'<button class="delrow" onclick="delDrinkRow(this)">✕</button>';

if(old){ div.classList.add("dr-old"); div.style.display="none"; }
const host=$("f-drinks");
const tog=host.querySelector(".dr-oldertoggle");
if(tog)host.insertBefore(div,tog); else host.appendChild(div);
}
function visitCount(d){ const ds=(d&&d.dates||[]).filter(Boolean); return Math.max((d&&d.count)||0, ds.length, 1); }
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
    if(!ex){ c.drinks.push(nd); return; }
    /* amount, currency, rate and rate-date move as one unit, or a price ends up beside
       another row's currency */
    if(nd.p){
      ex.p = nd.p;
      ["pl","pc","pr","pd"].forEach(function(f){
        if(nd[f]!==undefined) ex[f] = nd[f]; else delete ex[f];
      });
    }
    if(nd.size)    ex.size    = nd.size;
    if(nd.sweet)   ex.sweet   = nd.sweet;
    if(nd.ice)     ex.ice     = nd.ice;
    if(nd.milk)    ex.milk    = nd.milk;
    if(nd.reorder) ex.reorder = nd.reorder;
    const dates = [...new Set([...(ex.dates||[]), ...(nd.dates||[])])].filter(Boolean).sort();
    const cnt   = visitCount(ex) + visitCount(nd);
    if(dates.length) ex.dates = dates;
    if(cnt>1)        ex.count = Math.max(cnt, dates.length);
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

  /* One entry per visible drink row, read straight back out of the form. Every field the form
     owns has to be listed here: anything missing is silently dropped on the next edit, which
     is the trap DESIGN_NOTES opens with. */
  const raw=[...document.querySelectorAll("#f-drinks .dr")].map(function(r){
    const q=function(sel){ return r.querySelector(sel); };
    const dn=q(".dn"), dp=q(".dp"), dsz=q(".dsz"), dd=q(".dd"), dsw=q(".dsw"), dic=q(".dic"),
          dre=q(".dre"), dmk=q(".dmk"), dqt=q(".dqt"),
          dpc=q(".dpc"), dprt=q(".dpr"), dpdt=q(".dpd");
    return {
      qty:     Math.max(1,Math.min(99,(dqt?parseInt(dqt.value,10):1)||1)),
      n:       dn?dn.value.trim():"",
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

  /* Rows collapse by lowercased drink name, so several visits to the same drink become one
     record carrying a list of dates. */
  const dmap=new Map();
  raw.forEach(function(d){
    const k=d.n.toLowerCase();
    if(!dmap.has(k))dmap.set(k,{n:d.n,p:d.p,pc:d.pc,pr:d.pr,pd:d.pd,dates:[],count:0});
    const e=dmap.get(k);
    /* amount, currency, rate and rate-date move together or not at all, or a price ends up
       beside another row's currency */
    if(d.p&&!e.p){ e.p=d.p; e.pc=d.pc; e.pr=d.pr; e.pd=d.pd; }
    if(d.size)    e.size    = d.size;
    if(d.sweet)   e.sweet   = d.sweet;
    if(d.ice)     e.ice     = d.ice;
    if(d.milk)    e.milk    = d.milk;
    if(d.reorder) e.reorder = d.reorder;
    e.count += d.qty;
    if(d.date && !e.dates.includes(d.date)) e.dates.push(d.date);
  });

  const drinks=[...dmap.values()].map(function(d){
    d.dates.sort();
    /* priceFields() is the single place local money becomes dollars */
    const o=Object.assign({n:d.n}, priceFields(d.p,d.pc,d.pr,d.pd));
    if(d.size)         o.size    = d.size;
    if(d.sweet)        o.sweet   = d.sweet;
    if(d.ice)          o.ice     = d.ice;
    if(d.milk)         o.milk    = d.milk;
    if(d.reorder)      o.reorder = d.reorder;
    if(d.dates.length) o.dates   = d.dates;
    const cnt=Math.max(d.count,d.dates.length);
    if(cnt>1) o.count = cnt;
    return o;
  });

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

 saveCafe(savedId);
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
