"use strict";
/* rank.js — Head-to-head compare and Elo ranking for cafes and drinks.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- compare / ranking (Elo) ---------- */
const ELO_BASE=1500, ELO_K=32;
function eloFor(c){ return (c&&typeof c.elo==="number")?c.elo:ELO_BASE; }
function eloScoreNum(c){ const m=matchCount(c); const conf=m/(m+4); return Math.max(0,Math.min(10,5+((eloFor(c)-ELO_BASE)/45)*conf)); }
function eloScore(c){ return eloScoreNum(c).toFixed(1); }
function traitsOf(c){ const t=new Set(); const hay=((c.name||"")+" "+typeTerms(c)+" "+(c.drinks||[]).map(d=>d.n).join(" ")).toLowerCase(); [["matcha","🍵 Matcha"],["hojicha","🍵 Matcha"],["espresso","☕ Coffee"],["latte","☕ Coffee"],["coffee","☕ Coffee"],["boba","🧋 Boba"],["bubble","🧋 Boba"],["milk tea","🧋 Boba"],["gelato","🍦 Gelato"],["tea","🍵 Tea"]].forEach(p=>{ if(hay.includes(p[0]))t.add("type|"+p[1]); }); if(c.emoji==="🍵")t.add("type|🍵 Matcha"); if(c.emoji==="🧋")t.add("type|🧋 Boba"); if(c.emoji==="☕")t.add("type|☕ Coffee"); if(c.emoji==="🍦")t.add("type|🍦 Gelato"); (c.tags||[]).forEach(x=>t.add("tag|#"+x)); if(c.area&&c.area.trim())t.add("area|📍 "+c.area.trim()); return t; }
function sharedTraitLabel(a,b){ const tb=traitsOf(b); const shared=[...traitsOf(a)].filter(x=>tb.has(x)); if(!shared.length)return null; const ord={type:0,tag:1,area:2}; shared.sort((x,y)=>ord[x.split("|")[0]]-ord[y.split("|")[0]]); return shared[0].split("|")[1]; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
function matchCount(c){ return (c&&c.matches)||0; }
let cmpPair=null, cmpMode="cafe", cmpDrinkPair=null, cmpAnchorId=null, recentDrinkKeys=[], recentCafeKeys=[];
function drinkId(D){ return D.cafe.id+"|"+((D.drink.n||"").toLowerCase()); }
function pairKey(a,b){ return [a,b].sort().join("###"); }
function setCmpMode(m){ cmpMode=m; if(m==="cafe")cmpAnchorId=null; newMatchup(); }
function allDrinks(){ const out=[]; cafes.filter(c=>!c.wish).forEach(c=>{ (c.drinks||[]).forEach(d=>{ if(d&&d.n)out.push({cafe:c,drink:d}); }); }); return out; }
function drinkElo(d){ return (d&&typeof d.elo==="number")?d.elo:ELO_BASE; }
function drinkMatches(d){ return (d&&d.matches)||0; }
function drinkScoreNum(d){ const m=drinkMatches(d); const conf=m/(m+12); return Math.max(0,Math.min(10,5+((drinkElo(d)-ELO_BASE)/80)*conf)); }
function drinkScore(d){ return drinkScoreNum(d).toFixed(1); }
function findDrink(ref){ const c=cafes.find(x=>x.id===ref[0]); if(!c)return null; const d=(c.drinks||[]).find(x=>normDrink(x.n)===normDrink(ref[1])); return d?{cafe:c,drink:d}:null; }
function eligiblePairs(){ const out=[]; const vis=cafes.filter(c=>!c.wish); for(let i=0;i<vis.length;i++){ for(let j=i+1;j<vis.length;j++){ const lab=sharedTraitLabel(vis[i],vis[j]); if(lab)out.push([vis[i],vis[j],lab]); } } return out; }
function openRank(){ cmpAnchorId=null; cmpMode="cafe"; show("compare"); }
function startAnchorCompare(id){ const cid=(typeof id==="string")?id:editId; if(!cid){ toast("Save the cafe first, then compare"); return; } if(cmpAnchorId!==cid)recentCafeKeys=[]; cmpAnchorId=cid; cmpMode="cafe"; show("compare"); }
function clearAnchor(){ cmpAnchorId=null; cmpPair=null; cmpMode="cafe"; renderCompare(); }
function anchorOpponents(anchor){ return cafes.filter(x=>x.id!==anchor.id&&!x.wish).map(x=>({c:x,lab:sharedTraitLabel(anchor,x)})).filter(o=>o.lab); }
function newOpenMatchup(){ const vis=cafes.filter(c=>!c.wish); if(vis.length<2){ cmpPair=null; renderCompare(); return; } const pairs=[]; for(let i=0;i<vis.length;i++){ for(let j=i+1;j<vis.length;j++){ pairs.push({a:vis[i],b:vis[j],key:pairKey(vis[i].id,vis[j].id),m:matchCount(vis[i])+matchCount(vis[j])}); } } let avail=pairs.filter(p=>recentCafeKeys.indexOf(p.key)<0); if(!avail.length){ recentCafeKeys=[]; avail=pairs; } const minM=Math.min.apply(null,avail.map(p=>p.m)); const tier=avail.filter(p=>p.m<=minM+1); const choice=tier[Math.floor(Math.random()*tier.length)]; recentCafeKeys.push(choice.key); const cap=Math.max(1,Math.min(pairs.length-1,Math.ceil(pairs.length*0.6))); while(recentCafeKeys.length>cap)recentCafeKeys.shift(); const flip=Math.random()<0.5; cmpPair=flip?[choice.b.id,choice.a.id,'Open comparison']:[choice.a.id,choice.b.id,'Open comparison']; renderCompare(); } function newMatchup(){ if(cmpMode==="drink"){ newDrinkMatchup(); return; } if(cmpMode==="open"){ newOpenMatchup(); return; } const pairs=eligiblePairs(); if(!pairs.length){ cmpPair=null; renderCompare(); return; } const enriched=pairs.map(p=>({a:p[0],b:p[1],lab:p[2],key:pairKey(p[0].id,p[1].id),m:matchCount(p[0])+matchCount(p[1])})); let avail=enriched.filter(p=>recentCafeKeys.indexOf(p.key)<0); if(!avail.length){ recentCafeKeys=[]; avail=enriched; } const minM=Math.min.apply(null,avail.map(p=>p.m)); const tier=avail.filter(p=>p.m<=minM+1); const choice=tier[Math.floor(Math.random()*tier.length)]; recentCafeKeys.push(choice.key); const cap=Math.max(1,Math.min(enriched.length-1,Math.ceil(enriched.length*0.6))); while(recentCafeKeys.length>cap)recentCafeKeys.shift(); const flip=Math.random()<0.5; cmpPair=flip?[choice.b.id,choice.a.id,choice.lab]:[choice.a.id,choice.b.id,choice.lab]; renderCompare(); }
function normDrink(n){ return (n||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
function grpMatches(g){ return g.reduce((s,p)=>s+drinkMatches(p.drink),0); }
function newDrinkMatchup(){ const pool=allDrinks(); const groups={}; pool.forEach(p=>{ const k=normDrink(p.drink.n); if(!k)return; (groups[k]=groups[k]||[]).push(p); }); const pairs=[]; Object.keys(groups).forEach(k=>{ const g=groups[k]; for(let i=0;i<g.length;i++){ for(let j=i+1;j<g.length;j++){ if(g[i].cafe.id===g[j].cafe.id)continue; const ka=drinkId(g[i]),kb=drinkId(g[j]); pairs.push({A:g[i],B:g[j],key:pairKey(ka,kb),m:drinkMatches(g[i].drink)+drinkMatches(g[j].drink)}); } } }); if(!pairs.length){ cmpDrinkPair=null; renderCompare(); return; } let avail=pairs.filter(p=>recentDrinkKeys.indexOf(p.key)<0); if(!avail.length){ recentDrinkKeys=[]; avail=pairs; } const minM=Math.min.apply(null,avail.map(p=>p.m)); const tier=avail.filter(p=>p.m<=minM+1); const choice=tier[Math.floor(Math.random()*tier.length)]; recentDrinkKeys.push(choice.key); const cap=Math.max(1,Math.min(pairs.length-1,Math.ceil(pairs.length*0.6))); while(recentDrinkKeys.length>cap)recentDrinkKeys.shift(); const flip=Math.random()<0.5; const first=flip?choice.B:choice.A, second=flip?choice.A:choice.B; cmpDrinkPair=[[first.cafe.id,normDrink(first.drink.n)],[second.cafe.id,normDrink(second.drink.n)]]; renderCompare(); }
function drinkCardHTML(D,side){ const c=D.cafe, d=D.drink; const gp=(_imgFail[c.id]?null:gphotoFor(c)); let cls="cph", style="", inner=""; if(gp){ style=' style="background-image:url(\''+safeUrl(gp)+'\')"'; } else { cls+=" nophoto"; style=' style="background:'+nophotoBg(d.n)+'"'; inner=initials({name:d.n}); } return '<button class="cmp-card" onclick="pickDrinkWinner('+side+')"><div class="'+cls+'"'+style+'>'+inner+'</div><div class="cb"><div class="cn">'+esc(d.n)+'</div><div class="cm">'+esc(c.name)+'<span class="cmp-score">'+drinkScore(d)+'<span style="opacity:.5;font-size:10px;margin-left:3px">'+(drinkMatches(d)?'('+drinkMatches(d)+' cmp)':'(new)')+'</span></span>'+'</div></div></button>'; }
function pickDrinkWinner(side){ if(!cmpDrinkPair)return; const A=findDrink(cmpDrinkPair[0]), B=findDrink(cmpDrinkPair[1]); if(!A||!B){ newDrinkMatchup(); return; } const win=side===0?A.drink:B.drink, lose=side===0?B.drink:A.drink; const Rw=drinkElo(win), Rl=drinkElo(lose); const Ew=1/(1+Math.pow(10,(Rl-Rw)/400)); const _Kd=Math.max(16,32-drinkMatches(win)); const delta=Math.max(1,Math.round(_Kd*(1-Ew))); win.elo=Rw+delta; lose.elo=Rl-delta; win.matches=drinkMatches(win)+1; lose.matches=drinkMatches(lose)+1; save(); toast(win.n+" wins · score "+drinkScore(win)); newDrinkMatchup(); }
function cmpCardHTML(c,side){ const gp=(_imgFail[c.id]?null:gphotoFor(c)); let cls="cph", style="", inner=""; if(gp){ style=' style="background-image:url(\''+safeUrl(gp)+'\')"'; } else { cls+=" nophoto"; style=' style="background:'+nophotoBg(c.name)+'"'; inner=initials(c); } return '<button class="cmp-card" onclick="pickWinner('+side+')"><div class="'+cls+'"'+style+'>'+inner+'</div><div class="cb"><div class="cn">'+esc(c.name)+'</div><div class="cm">'+(c.area?esc(c.area):"")+'<span class="cmp-score">'+eloScore(c)+'<span style="opacity:.5;font-size:10px;margin-left:3px">'+(matchCount(c)?'('+matchCount(c)+' cmp)':'(new)')+'</span></span>'+'</div></div></button>'; }
function renderCompare(){ const host=$("cmp-body"); if(!host)return; if(!isAdmin){ const _rc=cafes.filter(c=>matchCount(c)>0).sort((a,b)=>eloScoreNum(b)-eloScoreNum(a)).slice(0,15); const _rd=allDrinks().filter(D=>drinkMatches(D.drink)>0).sort((a,b)=>drinkScoreNum(b.drink)-drinkScoreNum(a.drink)).slice(0,10); let h='<div class="cmp-head" style="padding-top:4px"><div class="ct">⚖️ Rankings</div><div class="cs">Scores from head-to-head comparisons</div></div>'; if(_rc.length){ h+='<div class="statsec" style="margin:16px 0 8px">☕ Cafes</div>'; _rc.forEach((c,i)=>{ const m=i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1); h+='<div class="lbrow" style="cursor:pointer" onclick="openDetail(\''+c.id+'\',\'compare\')"><span class="lbrank">'+m+'</span><div class="lbmain"><div class="lbname">'+esc(c.name)+'</div><div class="lbsub">'+(c.area?esc(c.area)+' &middot; ':'')+matchCount(c)+' comparison'+(matchCount(c)===1?'':'s')+'</div></div><span class="lbscore">'+eloScore(c)+'</span></div>'; }); } else { h+='<div class="empty"><div class="big">⚖️</div>No rankings yet.</div>'; } if(_rd.length){ h+='<div class="statsec" style="margin:16px 0 8px">🥤 Drinks</div>'; _rd.forEach((D,i)=>{ const m=i===0?'🥇':i===1?'🥈':i===2?'🥉':String(i+1); h+='<div class="lbrow" style="cursor:pointer" onclick="openDetail(\''+D.cafe.id+'\',\'compare\')"><span class="lbrank">'+m+'</span><div class="lbmain"><div class="lbname">'+esc(D.drink.n)+'</div><div class="lbsub">'+esc(D.cafe.name)+(D.cafe.area?' &middot; '+esc(D.cafe.area):'')+'</div></div><span class="lbscore">'+drinkScore(D.drink)+'</span></div>'; }); } host.innerHTML='<div style="padding:16px">'+h+'</div>'; return; } const toggle='<div class="cmp-modes"><button class="cmp-mode'+(cmpMode==="cafe"?" on":"")+'" onclick="setCmpMode(\'cafe\')">☕ Cafes</button><button class="cmp-mode'+(cmpMode==="open"?" on":"")+'" onclick="setCmpMode(\'open\')">🌐 Any</button><button class="cmp-mode'+(cmpMode==="drink"?" on":"")+'" onclick="setCmpMode(\'drink\')">🥤 Drinks</button></div>'; if(cmpMode==="drink"){ if(!cmpDrinkPair){ host.innerHTML=toggle+'<div class="empty"><div class="big">🥤</div>Log the same drink at two or more cafes, then rank them head-to-head to see who does it best.</div>'; return; } const A=findDrink(cmpDrinkPair[0]), B=findDrink(cmpDrinkPair[1]); if(!A||!B){ newDrinkMatchup(); return; } host.innerHTML=toggle+'<div class="cmp-head"><div class="ct">Which drink is better?</div><div class="cs">Tap your pick — both are:</div><div class="cmp-trait">'+esc(A.drink.n)+'</div></div><div class="cmp-pair">'+drinkCardHTML(A,0)+'<div class="cmp-vs">VS</div>'+drinkCardHTML(B,1)+'</div><div class="cmp-actions"><button class="btn ghost" onclick="newMatchup()">↻ Skip — new pair</button></div>'; return; } if(cmpMode==="open"&&!cmpPair){ host.innerHTML=toggle+'<div class="empty"><div class="big">⚖️</div>Add at least two visited cafes to rank them.</div>'; return; } if(!cmpPair){ host.innerHTML=toggle+'<div class="empty"><div class="big">⚖️</div>Add at least two cafes that share a trait (drink type, tag, or area) to rank them head-to-head.</div>'; return; } const a=cafes.find(x=>x.id===cmpPair[0]), b=cafes.find(x=>x.id===cmpPair[1]); if(!a||!b){ newMatchup(); return; } host.innerHTML=toggle+'<div class="cmp-head"><div class="ct">Which cafe do you prefer?</div><div class="cs">Tap your pick — both share:</div><div class="cmp-trait">'+esc(cmpPair[2])+'</div></div><div class="cmp-pair">'+cmpCardHTML(a,0)+'<div class="cmp-vs">VS</div>'+cmpCardHTML(b,1)+'</div><div class="cmp-actions"><button class="btn ghost" onclick="newMatchup()">↻ Skip — new pair</button></div>'; }
function pickWinner(side){ if(!cmpPair)return; const a=cafes.find(x=>x.id===cmpPair[0]), b=cafes.find(x=>x.id===cmpPair[1]); if(!a||!b){ newMatchup(); return; } const win=side===0?a:b, lose=side===0?b:a; const Rw=eloFor(win), Rl=eloFor(lose); const Ew=1/(1+Math.pow(10,(Rl-Rw)/400)); const _Kc=Math.max(16,32-matchCount(win)); const delta=Math.max(1,Math.round(_Kc*(1-Ew))); win.elo=Rw+delta; lose.elo=Rl-delta; win.matches=matchCount(win)+1; lose.matches=matchCount(lose)+1; save(); toast(win.name+" wins · score "+eloScore(win)); newMatchup(); }

/* ---------- post-save ranking card ("chaser") ----------
   Ranking as a destination went unused, so the question comes to the save instead. It ranks
   CAFES, not drinks: a chronological replay of all 114 logs found a same-name drink opponent
   existed only 26% of the time, 120 of the 140 possible drink pairs are hojicha-vs-hojicha,
   and drink elo has only just stopped being erased on save. Cafes pair 100% of the time and
   already spread 2.9-7.4. The drink just logged still does the work — it picks the opponent
   and justifies the pairing, which is far more honest than sharedTraitLabel, whose label is
   "Coffee" on 71% of eligible pairs. Everything here is additive; nothing above is modified. */
let _chaser=null, _chaserSeen=[];
/* Read-only: the drink is recovered from the SAVED cafe, never from the form or _formSnap, so
   it works identically on all three save branches and cannot couple to the unsaved guard. */
function chaserFresh(c){
  const T=localToday();
  const today=(c.drinks||[]).filter(function(d){ return (d.dates||[]).indexOf(T)>=0; });
  if(today.length)return today[today.length-1];
  let best=null,bd="";
  (c.drinks||[]).forEach(function(d){ (d.dates||[]).filter(Boolean).forEach(function(dt){ if(dt>bd){ bd=dt; best=d; } }); });
  if(best&&(Date.now()-new Date(bd).getTime())/86400000<=3)return best;
  return null;
}
/* Ordered: matcha before coffee so "Matcha Einspaner" is matcha, tea before coffee so
   "Dong Ding Oolong Latte" is tea. First match wins. */
const CHASER_FAM=[
  ["hojicha",/hojicha|houjicha|hojica|hoji/],
  ["matcha",/matcha/],
  ["milk tea",/milk tea|boba|bubble|pudding|brown sugar|taro|yakult|cheese foam/],
  ["tea",/oolong|jasmine|osmanthus|genmai|earl ?grey|chai|yuzu|dong ?ding|tieguanyin|pu.?er|\btea\b|\bcha\b/],
  ["coffee",/latte|espresso|americano|cappuccino|coffee|cortado|mocha|drip|pour.?over|cold ?brew|caphe|einspan|flat white|affogato/]
];
function chaserFam(n){ const s=(n||"").toLowerCase(); for(let i=0;i<CHASER_FAM.length;i++)if(CHASER_FAM[i][1].test(s))return CHASER_FAM[i][0]; return null; }
function chaserLast(c){ const ds=[]; (c.drinks||[]).forEach(function(d){ (d.dates||[]).filter(Boolean).forEach(function(x){ ds.push(x); }); }); return ds.sort().slice(-1)[0]||""; }
function chaserWhen(iso){ if(!iso)return "no dates"; const dd=Math.floor((Date.now()-new Date(iso).getTime())/86400000); if(dd<=0)return "today"; if(dd===1)return "yesterday"; if(dd<7)return dd+"d ago"; if(dd<31)return Math.floor(dd/7)+"w ago"; if(dd<=120)return Math.floor(dd/30)+"mo ago"; return fmtDate(iso).replace(/ \d+,/,""); }
function chaserArm(id){
  _chaser=null;
  if(!isAdmin)return;
  const c=cafes.find(function(x){ return x.id===id; });
  if(!c||c.wish)return;
  const base=cafes.filter(function(x){ return !x.wish&&x.id!==c.id; });
  if(!base.length)return;
  const fresh=chaserFresh(c), fam=fresh?chaserFam(fresh.n):null;
  let tier="C", cand=base;
  if(fresh){
    const twin=base.filter(function(x){ return (x.drinks||[]).some(function(od){ return normDrink(od.n)===normDrink(fresh.n); }); });
    if(twin.length){ tier="A"; cand=twin; }
    else if(fam){ const f=base.filter(function(x){ return (x.drinks||[]).some(function(od){ return chaserFam(od.n)===fam; }); }); if(f.length){ tier="B"; cand=f; } }
  }
  /* Coverage is the binding constraint — 17 cafes have never been compared and 16 of those
     were visited in the last 51 days — so fewest-matches dominates the cost. */
  const scored=cand.map(function(x){
    let cost=0.35*matchCount(x);
    const lv=chaserLast(x);
    if(!lv)cost+=0.60; else if((Date.now()-new Date(lv).getTime())/86400000>180)cost+=1.20;
    if(x.area&&c.area&&x.area.trim()===c.area.trim())cost-=0.40;
    if(_chaserSeen.indexOf(pairKey(c.id,x.id))>=0)cost+=2.00;
    return {x:x,cost:cost+Math.random()*0.30};
  }).sort(function(a,b){ return a.cost-b.cost; });
  const shortlist=scored.slice(0,5);
  const pick=shortlist[Math.floor(Math.random()*shortlist.length)].x;
  let theirDrink=null;
  if(tier==="A"||tier==="B"){
    const m=(pick.drinks||[]).filter(function(od){ return tier==="A"?normDrink(od.n)===normDrink(fresh.n):chaserFam(od.n)===fam; });
    if(m.length)theirDrink=m[0].n;
  }
  _chaser={cafe:c.id,opp:pick.id,tier:tier,fam:fam,myDrink:fresh?fresh.n:null,theirDrink:theirDrink,flip:Math.random()<0.5,ts:Date.now(),res:null};
}
function chaserBoard(){ return cafes.filter(function(c){ return !c.wish&&matchCount(c)>0; }).sort(function(a,b){ return eloScoreNum(b)-eloScoreNum(a); }); }
function chaserRank(c,board){ let n=1; const s=eloScoreNum(c); board.forEach(function(x){ if(x.id!==c.id&&eloScoreNum(x)>s)n++; }); return n; }
/* Both cafes are re-resolved by id from the live array, so the Firebase echo that repaints a
   few hundred ms after every save can never orphan the vote. */
function chaserApply(winId,loseId,draw){
  const a=cafes.find(function(x){ return x.id===winId; }), b=cafes.find(function(x){ return x.id===loseId; });
  if(!a||!b){ _chaser=null; return null; }
  const pre=chaserBoard();
  const preA=matchCount(a)?chaserRank(a,pre):null, preB=matchCount(b)?chaserRank(b,pre):null;
  const Ra=eloFor(a), Rb=eloFor(b);
  const Ea=1/(1+Math.pow(10,(Rb-Ra)/400));
  const K=Math.max(16,32-matchCount(a));
  const delta=draw?Math.round(K*(0.5-Ea)):Math.max(1,Math.round(K*(1-Ea)));
  a.elo=Ra+delta; b.elo=Rb-delta;
  a.matches=matchCount(a)+1; b.matches=matchCount(b)+1;
  save();
  const post=chaserBoard();
  return {a:a,b:b,draw:!!draw,preA:preA,preB:preB,postA:chaserRank(a,post),postB:chaserRank(b,post),postN:post.length};
}
function chaserSeen(l,r){ _chaserSeen.push(pairKey(l,r)); while(_chaserSeen.length>40)_chaserSeen.shift(); }
function chaserPick(side){
  if(!_chaser||_chaser.res)return;
  const L=_chaser.flip?_chaser.opp:_chaser.cafe, R=_chaser.flip?_chaser.cafe:_chaser.opp;
  chaserSeen(L,R);
  _chaser.res=chaserApply(side===0?L:R,side===0?R:L,false);
  chaserRepaint();
}
function chaserEven(){
  if(!_chaser||_chaser.res)return;
  const L=_chaser.flip?_chaser.opp:_chaser.cafe, R=_chaser.flip?_chaser.cafe:_chaser.opp;
  chaserSeen(L,R);
  _chaser.res=chaserApply(L,R,true);
  chaserRepaint();
}
function chaserDismiss(){ _chaser=null; chaserRepaint(); }
function chaserRepaint(){ const c=cafes.find(function(x){ return x.id===curId; }); if(c)renderChaser(c); try{ renderList(); }catch(e){} }
function chaserOpt(c,drink,side){
  const gp=(typeof gphotoFor==="function")?gphotoFor(c):null;
  const th=(gp&&!_imgFail[c.id])
    ? '<span class="ch-th" style="background-image:url(\'' + safeUrl(gp) + '\')"></span>'
    : '<span class="ch-th" style="background:' + nophotoBg(c.name) + '">' + esc(initials(c)) + '</span>';
  const sub=[drink?esc(drink):"",chaserWhen(chaserLast(c))].filter(Boolean).join(" · ");
  return '<button class="ch-opt" onclick="chaserPick(' + side + ')">' + th
    + '<span class="ch-m"><span class="ch-n">' + esc(c.name) + '</span><span class="ch-s">' + sub + '</span></span></button>';
}
/* Rendered from inside openDetail rather than injected, so the cloud echo repaints the card
   instead of wiping it. The id + isAdmin + 3-minute guard covers every other openDetail
   caller: map pins, list cards, stats rows, the viewer leaderboard and the ?cafe= deep link. */
function renderChaser(c){
  const host=$("d-chaser"); if(!host)return;
  if(!_chaser||_chaser.cafe!==c.id||!isAdmin||Date.now()-_chaser.ts>180000){ host.innerHTML=""; return; }
  const r=_chaser.res;
  if(r){
    const line=function(x,pre,post,n){
      const nm=esc(x.name);
      if(pre===null)return nm+' <b class="up">enters at #'+post+' of '+n+'</b>';
      if(post<pre)return nm+' <b class="up">#'+pre+' → #'+post+'</b>';
      if(post>pre)return nm+' <b class="dn">#'+pre+' → #'+post+'</b>';
      return nm+' <b>stays #'+post+'</b>';
    };
    host.innerHTML='<div class="chaser res"><div class="ch-rl">'+(r.draw?"🤝 Called it even":"👍 "+esc(r.a.name))+'</div>'
      +'<div class="ch-mv"><span>'+line(r.a,r.preA,r.postA,r.postN)+'</span><span>'+line(r.b,r.preB,r.postB,r.postN)+'</span></div>'
      +'<button class="ch-lnk" onclick="openRank()">See the board ›</button></div>';
    return;
  }
  const opp=cafes.find(function(x){ return x.id===_chaser.opp; });
  if(!opp){ host.innerHTML=""; return; }
  const eyebrow=_chaser.tier==="A"?("Both do "+esc(_chaser.myDrink)):(_chaser.tier==="B"?("Both do "+esc(_chaser.fam)):"");
  const lv=chaserLast(opp);
  const stale=!!lv&&(Date.now()-new Date(lv).getTime())/86400000>120;
  const L=_chaser.flip?opp:c, R=_chaser.flip?c:opp;
  const LD=_chaser.flip?_chaser.theirDrink:_chaser.myDrink, RD=_chaser.flip?_chaser.myDrink:_chaser.theirDrink;
  host.innerHTML='<div class="chaser"><div class="ch-hd"><span class="ch-qwrap">'
    +(eyebrow?'<span class="ch-why">'+eyebrow+'</span>':"")
    +'<span class="ch-q">Which would you go back to?</span></span>'
    +'<button class="ch-x" onclick="chaserDismiss()" aria-label="Not now">✕</button></div>'
    +'<div class="ch-pair">'+chaserOpt(L,LD,0)+chaserOpt(R,RD,1)+'</div>'
    +'<button class="ch-even" onclick="chaserEven()">'+(stale?"Too long ago to say":"Too close to call")+'</button></div>';
}
