"use strict";
/* stats.js — Stats pane.
   Loaded by index.html; script order matters (config first, boot last). */

/* A visit is ONE DISTINCT DAY at one cafe. The old screen summed drink rows, so ordering
   three drinks in one sitting read as three visits and single-visit cafes topped the
   "most revisited" board. The hero, the rhythm chart and the "went back" tile all read
   through here so the three finally agree on what a visit is. */
function visitDates(c){ const s={}; ((c&&c.drinks)||[]).forEach(function(d){ drinkOrders(d).forEach(function(o){ if(o.date)s[o.date]=1; }); }); return Object.keys(s).sort(); }
/* One re-collapsible fold for both lists, operating on the block right before the button —
   replaces two ad-hoc show-more buttons that minted class names off a global counter and
   removed themselves so they could never close again. */
function statFold(btn){ const box=btn.previousElementSibling; if(!box)return; const open=box.hasAttribute("data-open"); if(open)box.removeAttribute("data-open"); else box.setAttribute("data-open",""); btn.textContent=(btn.dataset.lab||"Show more")+(open?" ▾":" ▴"); }
let _heroI=0;
function heroNext(){ _heroI++; renderStats(); }
let _rhythmMetric="spend", _rhythmMonth="";
function setRhythmMetric(metric){ if(metric!=="visits"&&metric!=="spend")return; _rhythmMetric=metric; renderStats(); }
function setRhythmMonth(month){ if(!/^\d{4}-\d{2}$/.test(month))return; _rhythmMonth=month; renderStats(); }

function renderStats(){
  const host=$("stats-body"); if(!host)return;
  const money=function(n){ return "$"+(n||0).toFixed(2); };
  const dpr=function(d){ const n=parseFloat(String((d&&d.p)||"").replace(/[^0-9.]/g,"")); return isNaN(n)?0:n; };
  const DAY=86400000, now=Date.now();
  const nonWish=cafes.filter(function(c){ return !c.wish; });
  const wishN=cafes.length-nonWish.length;

  /* ---------- one pass over the corpus ---------- */
  let nDrinkRows=0, nPriced=0, spend=0, nVisits=0;
  const allDays={}, monthVisit={}, monthUnits={}, monthPriced={}, monthSpend={};
  const sweetC={}, iceC={}, milkC={}, sizeC={}, tagC={}, drinkFam={};
  const bump=function(m,k,n){ if(k)m[k]=(m[k]||0)+(n||1); };
  nonWish.forEach(function(c){
    visitDates(c).forEach(function(dt){ nVisits++; allDays[dt]=1; bump(monthVisit,dt.slice(0,7)); });
    (c.tags||[]).forEach(function(t){ bump(tagC,t); });
    (c.drinks||[]).forEach(function(d){
      const fam=/hoji/i.test(d.n||"")?"Hojicha latte":(d.n||"").trim();
      drinkOrders(d).forEach(function(o){
        const q=orderQty(o), p=dpr(o);
        nDrinkRows+=q; if(p>0)nPriced+=q;
        spend+=p*q;
        bump(sweetC,o.sweet,q); bump(iceC,o.ice,q); bump(milkC,o.milk,q); bump(sizeC,o.size,q);
        if(fam)drinkFam[fam]=(drinkFam[fam]||0)+q;
        if(o.date){
          const k=o.date.slice(0,7); bump(monthUnits,k,q);
          if(p>0){ bump(monthPriced,k,q); monthSpend[k]=(monthSpend[k]||0)+p*q; }
        }
      });
    });
  });
  const datedN=nonWish.filter(function(c){ return visitDates(c).length>0; }).length;
  const backN=nonWish.filter(function(c){ return visitDates(c).length>1; }).length;
  const undatedN=nonWish.length-datedN;
  const onceN=datedN-backN;
  const daysOut=Object.keys(allDays).length;
  const firstDay=Object.keys(allDays).sort()[0]||"";
  const top=function(m){ const k=Object.keys(m).sort(function(a,b){ return m[b]-m[a]; }); return k.length?[k[0],m[k[0]]]:null; };
  const magRow=function(rank,name,sub,val,pct,onclick){
    return '<div class="lbrow one mag'+(onclick?" tap":"")+'" style="--mag:'+Math.max(2,Math.round(pct))+'"'+(onclick?' role="button" tabindex="0" onclick="'+onclick+'"':'')+'>'
      +(rank!==null?'<span class="lbrank">'+rank+'</span>':'')
      +'<div class="lbmain"><div class="lbname">'+esc(name)+(sub?' <i>· '+esc(sub)+'</i>':'')+'</div></div>'
      +'<span class="lbscore">'+val+'</span></div>';
  };
  let h="";

  /* ---------- 1. go back to ---------- */
  const CA_HOME={lat:37.7749,lng:-122.4194};
  const pool=nonWish.filter(function(c){
    if(c.lat==null||(c.rating||0)<4)return false;
    const ds=visitDates(c); if(ds.length!==1)return false;
    if(distKm(CA_HOME.lat,CA_HOME.lng,c.lat,c.lng)*0.621371>40)return false;
    return (now-new Date(ds[0]).getTime())/DAY>=45;
  }).map(function(c){ return {c:c,last:visitDates(c)[0]}; })
    .sort(function(a,b){ return ((b.c.rating||0)-(a.c.rating||0))||a.last.localeCompare(b.last); });
  if(pool.length){
    const doy=Math.floor((now-new Date(new Date().getFullYear(),0,0).getTime())/DAY);
    const at=function(i){ return pool[((doy+_heroI+i)%pool.length+pool.length)%pool.length]; };
    const p=at(0), c=p.c;
    const days=Math.floor((now-new Date(p.last).getTime())/DAY);
    const ago=days>=365?(Math.floor(days/365)+(days<730?" year":" years")):(days>=60?(Math.floor(days/30)+" months"):(days+" days"));
    const mi=Math.round(distKm(CA_HOME.lat,CA_HOME.lng,c.lat,c.lng)*0.621371);
    const best=((c.drinks||[])[0]||{}).n||"";
    h+='<div class="hero-go">'
      +'<div class="eyebrow"><span>Go back to</span><span>'+(((doy+_heroI)%pool.length+pool.length)%pool.length+1)+' of '+pool.length+'</span></div>'
      +'<div class="hname">'+esc(c.name)+'</div>'
      +'<div class="hmeta">'+starsHTML(c.rating)+' <span>'+esc(c.area||"")+(mi?" · "+mi+" mi":"")+'</span></div>'
      +'<div class="why">You rated it '+(c.rating||0)+'★ after a single visit'+(best?' for the '+esc(best):'')+' — and that was '+ago+' ago.</div>'
      +'<div class="acts"><button class="btn" onclick="openDetail(\''+c.id+'\',\'stats\')">Open</button>'
      +'<button class="btn ghost" onclick="heroNext()">↻ Show another</button></div></div>';
    const goRow=function(x){ const cc=x.c, dd=Math.floor((now-new Date(x.last).getTime())/DAY);
      const t=dd>=365?(Math.floor(dd/365)+"y ago"):(dd>=60?(Math.floor(dd/30)+"mo ago"):(dd+"d ago"));
      return '<div class="gorow" role="button" tabindex="0" onclick="openDetail(\''+cc.id+'\',\'stats\')"><span class="gotile" style="background:'+cafeColor(cc.name)+'">'+esc(cc.emoji||"☕")+'</span>'
        +'<div class="lbmain"><div class="lbname">'+esc(cc.name)+'</div><div class="lbsub">'+t+(cc.area?" · "+esc(cc.area):"")+'</div></div>'
        +'<span class="gostar">'+(cc.rating||0)+'★</span></div>'; };
    h+=goRow(at(1));
    if(pool.length>2)h+=goRow(at(2));
    if(pool.length>3){
      h+='<div class="foldbox">'+pool.slice(3).map(function(x){ return goRow(x); }).join("")+'</div>'
        +'<button class="morebtn" data-lab="See all '+pool.length+' places you never went back to" onclick="statFold(this)">See all '+pool.length+' places you never went back to ▾</button>';
    }
  }

  /* ---------- 2. vitals ---------- */
  const backPct=datedN?Math.round(backN/datedN*100):0;
  const pricedPct=nDrinkRows?Math.round(nPriced/nDrinkRows*100):0;
  h+='<div class="statgrid">'
    +'<div class="statcard"><div class="v">'+nonWish.length+'</div><div class="k">☕ Cafes visited</div><div class="s">'+(wishN?"+"+wishN+" on the wishlist":"none on the wishlist")+'</div></div>'
    +'<div class="statcard"><div class="v">'+nVisits+'</div><div class="k">📍 Visits</div><div class="s">'+daysOut+' days out'+(firstDay?" since "+fmtDate(firstDay).replace(/ \d+,/,""):"")+'</div></div>'
    +'<div class="statcard"><div class="v">'+backN+'<span class="of"> / '+datedN+'</span></div><div class="k">🔁 Went back</div><div class="s"><span class="sc-meter g"><i style="width:'+backPct+'%"></i></span>'+backPct+'% · '+onceN+' once, '+undatedN+' undated</div></div>'
    +(isAdmin
      ?'<div class="statcard"><div class="v">'+money(spend)+'</div><div class="k">💸 Spent</div><div class="s"><span class="sc-meter"><i style="width:'+pricedPct+'%"></i></span>'+nPriced+' of '+nDrinkRows+' drinks priced</div></div>'
      :'<div class="statcard"><div class="v">'+cafes.filter(function(c){ return c.fav; }).length+'</div><div class="k">❤️ Favourites</div><div class="s">of the '+nonWish.filter(function(c){ return c.rating; }).length+' cafes you rated</div></div>')
    +'</div>';

  /* ---------- 3. rhythm ---------- */
  const d0=new Date(), mk=[];
  for(let i=11;i>=0;i--){ const d=new Date(d0.getFullYear(),d0.getMonth()-i,1); mk.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")); }
  const inWindow=mk.reduce(function(s,k){ return s+(monthVisit[k]||0); },0);
  const earlier=nVisits-inWindow;
  const latestK=mk.slice().reverse().find(function(k){ return (monthVisit[k]||0)||(monthUnits[k]||0); })||mk[11];
  const selectedK=mk.indexOf(_rhythmMonth)>=0?_rhythmMonth:latestK;
  const metric=(isAdmin&&_rhythmMetric==="spend")?"spend":"visits";
  const selectedVisits=monthVisit[selectedK]||0, selectedUnits=monthUnits[selectedK]||0;
  const selectedPriced=monthPriced[selectedK]||0, selectedSpend=monthSpend[selectedK]||0;
  const selectedCoverage=selectedUnits?Math.round(selectedPriced/selectedUnits*100):0;
  const values=mk.map(function(k){ return metric==="spend"?(monthSpend[k]||0):(monthVisit[k]||0); });
  const maxValue=Math.max(1,Math.max.apply(null,values));
  const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthNameFor=function(k){ return MONTH_NAMES[+k.slice(5,7)-1]; };
  const monthName=monthNameFor(selectedK);
  let rhythmHeadline="", rhythmSub="";
  if(metric==="spend"){
    rhythmHeadline=selectedUnits?(selectedPriced?money(selectedSpend)+" recorded":"No prices recorded"):"No visits logged";
    rhythmSub=selectedUnits?(selectedPriced+" of "+selectedUnits+" drink"+(selectedUnits===1?"":"s")+" priced · "+selectedCoverage+"% coverage"):"Tap an earlier month to see its total";
  }else{
    rhythmHeadline=selectedVisits+" visit"+(selectedVisits===1?"":"s");
    rhythmSub=selectedVisits?"Distinct cafe-days logged":"Tap an earlier month to see its visits";
  }
  const MOL=["J","F","M","A","M","J","J","A","S","O","N","D"];
  h+='<div class="statsec">📈 Monthly activity · last 12 months</div><div class="statcard rhythm">'
    +(isAdmin?'<div class="rseg" aria-label="Monthly metric"><button type="button" class="'+(metric==="visits"?"on":"")+'" aria-pressed="'+(metric==="visits")+'" onclick="setRhythmMetric(\'visits\')">Visits</button><button type="button" class="'+(metric==="spend"?"on":"")+'" aria-pressed="'+(metric==="spend")+'" onclick="setRhythmMetric(\'spend\')">Spending</button></div>':'')
    +'<div class="rhead"><b>'+rhythmHeadline+'</b> in '+monthName+'<span>'+rhythmSub+'</span></div>'
    +'<div class="rchart">'+mk.map(function(k){
        const v=monthVisit[k]||0, units=monthUnits[k]||0, pr=monthPriced[k]||0;
        const amount=metric==="spend"?(monthSpend[k]||0):v;
        const hgt=amount?Math.max(6,Math.round(amount/maxValue*72)):3;
        const coverage=units?Math.round(pr/units*100):0;
        const aria=(isAdmin?[monthNameFor(k)+" "+k.slice(0,4),money(monthSpend[k]||0)+" recorded",v+" visit"+(v===1?"":"s"),coverage+"% price coverage"]:[monthNameFor(k)+" "+k.slice(0,4),v+" visit"+(v===1?"":"s")]).join(", ");
        return '<button type="button" class="rcol'+(k===selectedK?' on':'')+'" aria-pressed="'+(k===selectedK)+'" onclick="setRhythmMonth(\''+k+'\')" aria-label="'+aria+'"><span class="rbar'+(amount?' has':'')+'" style="height:'+hgt+'px"></span>'+(isAdmin?'<span class="rcov"><i style="width:'+coverage+'%"></i></span>':'')+'<span class="rlab">'+MOL[+k.slice(5,7)-1]+'</span></button>';
      }).join("")+'</div>'
    +'<div class="statnote">'+(isAdmin?(metric==="spend"?"Bar = recorded spend · green line = price coverage. Missing prices are not estimated. ":"Bar = cafe visits · green line = price coverage. "):"Tap a month for its visit count. ")+(earlier>0?"Earlier: "+earlier+" visits before this window.":"")+'</div>'
    +'</div>';

  /* ---------- 4. top spending (admin) ---------- */
  if(isAdmin){
    const byCafe=nonWish.map(function(c){ return {c:c,amt:(c.drinks||[]).reduce(function(t,d){ return t+drinkOrders(d).reduce(function(s,o){ return s+dpr(o)*orderQty(o); },0); },0)}; })
      .filter(function(x){ return x.amt>0; }).sort(function(a,b){ return b.amt-a.amt; });
    if(byCafe.length){
      const mx=byCafe[0].amt, tp=byCafe.slice(0,4);
      h+='<div class="statsec">💸 Top spending</div>';
      tp.forEach(function(x,i){ h+=magRow(i+1,x.c.name,x.c.area,money(x.amt),x.amt/mx*100,"openDetail('"+x.c.id+"','stats')"); });
      h+='<div class="statnote">These '+tp.length+' are '+money(tp.reduce(function(s,x){ return s+x.amt; },0))+' of the '+money(spend)+' recorded, across '+byCafe.length+' cafes with any price.</div>';
    }
  }

  /* ---------- 5. hojicha, priced around town ---------- */
  /* Matched on the name family rather than normDrink, which splits hojicha into eleven
     keys across thirteen spellings and hides the corpus's most-ordered drink entirely. */
  const hoj={};
  nonWish.forEach(function(c){ (c.drinks||[]).forEach(function(d){
    if(!/hoji/i.test(d.n||""))return;
    const priced=drinkOrders(d).filter(function(o){ return dpr(o)>0; }).sort(function(a,b){ return (a.date||"").localeCompare(b.date||""); });
    if(!priced.length)return;
    const o=priced[priced.length-1], p=dpr(o);
    if(!hoj[c.id]||(o.date||"")>=(hoj[c.id].date||""))hoj[c.id]={c:c,p:p,n:d.n,date:o.date||""};
  }); });
  const hojA=Object.keys(hoj).map(function(k){ return hoj[k]; }).sort(function(a,b){ return a.p-b.p; });
  const hojCafes=nonWish.filter(function(c){ return (c.drinks||[]).some(function(d){ return /hoji/i.test(d.n||""); }); }).length;
  if(hojA.length>=3){
    const hmx=hojA[hojA.length-1].p;
    const med=median(hojA.map(function(x){ return x.p; }));
    const prices=[]; nonWish.forEach(function(c){ (c.drinks||[]).forEach(function(d){ drinkOrders(d).forEach(function(o){ const p=dpr(o); if(p>0){ for(let i=0;i<orderQty(o);i++)prices.push(p); } }); }); });
    prices.sort(function(a,b){ return a-b; });
    const pmed=median(prices);
    h+='<div class="statsec">🍵 Hojicha latte, priced around town</div>';
    hojA.slice(0,4).forEach(function(x){ h+=magRow("🍵",x.c.name,x.c.area,money(x.p),x.p/hmx*100,"openDetail('"+x.c.id+"','stats')"); });
    if(hojA.length>4){
      h+='<div class="foldbox">'+hojA.slice(4).map(function(x){ return magRow("🍵",x.c.name,x.c.area,money(x.p),x.p/hmx*100,"openDetail('"+x.c.id+"','stats')"); }).join("")+'</div>'
        +'<button class="morebtn" data-lab="Show '+(hojA.length-4)+' more" onclick="statFold(this)">Show '+(hojA.length-4)+' more ▾</button>';
    }
    h+='<div class="statnote">Hojicha at '+hojCafes+' cafes, '+hojA.length+' with a price. Median '+money(med)+', dearest '+money(hmx)+' ('+esc(hojA[hojA.length-1].c.name)+'). All '+prices.length+' priced drinks: median '+money(pmed)+'.</div>';
  }

  /* ---------- 6. your usual ---------- */
  const tSweet=top(sweetC), tIce=top(iceC), tMilk=top(milkC), tSize=top(sizeC), tTag=top(tagC), tFam=top(drinkFam);
  if(tFam||tSweet||tIce){
    const words=[];
    if(tFam)words.push(tFam[0]);
    if(tSweet)words.push(tSweet[0]==="0%"?"no sugar":tSweet[0]+" sweet");
    if(tIce)words.push(tIce[0].toLowerCase());
    if(tMilk)words.push(tMilk[0].toLowerCase());
    if(tSize)words.push(tSize[0]);
    const nSweet=Object.keys(sweetC).reduce(function(s,k){ return s+sweetC[k]; },0);
    const nMilk=Object.keys(milkC).reduce(function(s,k){ return s+milkC[k]; },0);
    const chips=[];
    if(tSweet)chips.push((tSweet[0]==="0%"?"No sugar":tSweet[0])+" · "+tSweet[1]+" of "+nSweet);
    if(tIce)chips.push(tIce[0]+" · "+tIce[1]);
    if(tMilk)chips.push(tMilk[0]+" · "+tMilk[1]+" of "+nMilk);
    if(tSize)chips.push(tSize[0]+" · "+tSize[1]);
    if(tTag)chips.push("#"+tTag[0]+" · "+tTag[1]);
    h+='<div class="statsec">☕ Your usual</div><div class="statcard usualcard"><div class="usual">'+esc(words.join(", "))+'.</div>'
      +'<div class="chips">'+chips.map(function(x){ return '<span class="chip">'+esc(x)+'</span>'; }).join("")+'</div></div>';
  }

  /* ---------- 7. regulars ---------- */
  const reg=nonWish.map(function(c){ return {c:c,n:visitDates(c).length}; }).filter(function(x){ return x.n>1; })
    .sort(function(a,b){ return b.n-a.n; });
  if(reg.length){
    const rmx=reg[0].n;
    h+='<div class="statsec">🔁 Regulars</div>';
    reg.slice(0,4).forEach(function(x,i){ h+=magRow(i+1,x.c.name,x.c.area,x.n+" days",x.n/rmx*100,"openDetail('"+x.c.id+"','stats')"); });
    h+='<div class="statnote">Counted in separate days out, not drinks ordered. Only '+reg.length+' cafes ever got a second day.</div>';
  }

  /* ---------- 8. where you go ---------- */
  const geo={};
  nonWish.filter(function(c){ return c.lat!=null; }).forEach(function(c){ const k=cafeStateName(c)||cafeCountryName(c); if(k)geo[k]=(geo[k]||0)+1; });
  const geoA=Object.keys(geo).map(function(k){ return [k,geo[k]]; }).sort(function(a,b){ return b[1]-a[1]; });
  if(geoA.length>1){
    const gmx=geoA[0][1], shown=geoA.slice(0,4);
    const rest=geoA.slice(4).reduce(function(s,x){ return s+x[1]; },0);
    const far=nonWish.filter(function(c){ return c.lat!=null; })
      .map(function(c){ return {c:c,mi:distKm(CA_HOME.lat,CA_HOME.lng,c.lat,c.lng)*0.621371}; })
      .sort(function(a,b){ return b.mi-a.mi; })[0];
    h+='<div class="statsec">📍 Where you go</div>';
    shown.forEach(function(x){ h+=magRow(null,x[0],"",x[1]+" cafe"+(x[1]===1?"":"s"),x[1]/gmx*100,""); });
    h+='<div class="statnote">'+(rest?"+"+rest+" elsewhere. ":"")+(far?"Farthest: "+esc(far.c.name)+" — "+Math.round(far.mi).toLocaleString()+" mi.":"")+'</div>';
  }

  /* ---------- 9. keep ranking ---------- */
  /* Cafe coverage, not the drink count — drinks are no longer what ranking moves. */
  const rankedN=nonWish.filter(function(c){ return matchCount(c)>0; }).length;
  h+='<div class="handoff" role="button" tabindex="0" onclick="openRank()">⚖️ '+rankedN+' of '+nonWish.length+' cafes ranked'+((nonWish.length-rankedN)?' <span>· '+(nonWish.length-rankedN)+' to go</span>':'')+'</div>';

  host.innerHTML=h;
}
