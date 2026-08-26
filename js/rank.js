"use strict";
/* rank.js — Elo scoring, the board, and the post-save ranking sheet.
   Loaded by index.html; script order matters (config first, boot last). */
/* ---------- Elo ---------- */
const ELO_BASE=1500;
function eloFor(c){ return (c&&typeof c.elo==="number")?c.elo:ELO_BASE; }
function eloScoreNum(c){ const m=matchCount(c); const conf=m/(m+4); return Math.max(0,Math.min(10,5+((eloFor(c)-ELO_BASE)/45)*conf)); }
function eloScore(c){ return eloScoreNum(c).toFixed(1); }
function matchCount(c){ return (c&&c.matches)||0; }
function pairKey(a,b){ return [a,b].sort().join("###"); }
function normDrink(n){ return (n||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim(); }
/* Drinks are no longer ranked head-to-head — the pairing rate was 26% and 120 of the 140
   possible pairs were the same drink — but 22 cafes carry scores from before that stopped,
   and the detail page still shows them. See DESIGN_NOTES.md. */
function drinkElo(d){ return (d&&typeof d.elo==="number")?d.elo:ELO_BASE; }
function drinkMatches(d){ return (d&&d.matches)||0; }
function drinkScoreNum(d){ const m=drinkMatches(d); const conf=m/(m+12); return Math.max(0,Math.min(10,5+((drinkElo(d)-ELO_BASE)/80)*conf)); }
function drinkScore(d){ return drinkScoreNum(d).toFixed(1); }
function openRank(){ show("compare"); }

/* ---------- the board ----------
   The tab used to open a matchup and hide the standing behind `if(!isAdmin)`, so the owner
   had cast 184 head-to-heads and never seen the ordering they produced. Now the slot holds
   the standing for both roles and ranking is a button on it. */
/* Several ranked cafes have an empty or numeric area; fall back to state, then country,
   suppressing "Other" — COUNTRY_INFO has no entry for Vietnam or Indonesia, so printing it
   would be worse than printing nothing. */
function boardArea(c){
  const a=(c.area||"").trim();
  if(a&&!/^\d+$/.test(a))return a;
  const st=(typeof cafeStateName==="function")?cafeStateName(c):"";
  if(st)return st;
  const co=(typeof cafeCountryName==="function")?cafeCountryName(c):"";
  return (co&&co!=="Other")?co:"";
}
function boardRow(c,pos,unique){
  const rank=(pos<=3&&unique)?["🥇","🥈","🥉"][pos-1]:("#"+pos);
  const ar=boardArea(c), m=matchCount(c);
  const sub=m+" comparison"+(m===1?"":"s")+(ar?" · "+esc(ar):"");
  return '<div class="lbrow tap" role="button" tabindex="0" onclick="openDetail(\''+c.id+'\',\'compare\')"><span class="lbrank">'+rank+'</span>'
    +'<span class="gotile" style="background:'+cafeColor(c.name)+'">'+esc(c.emoji||"☕")+'</span>'
    +'<div class="lbmain"><div class="lbname">'+esc(c.name)+'</div><div class="lbsub">'+sub+'</div></div>'
    +'<span class="lbscore soft">'+eloScore(c)+'</span></div>';
}
function boardQueueRow(c){
  const ar=boardArea(c), lv=chaserLast(c);
  const sub=[ar?esc(ar):"",chaserWhen(lv)].filter(Boolean).join(" · ");
  const right=isAdmin?'<span class="rank-lnk">Rank ›</span>':'<span class="gostar">'+(c.rating||0)+'★</span>';
  const act=isAdmin?("boardRank('"+c.id+"')"):("openDetail('"+c.id+"','compare')");
  return '<div class="gorow" role="button" tabindex="0" onclick="'+act+'"><span class="gotile" style="background:'+cafeColor(c.name)+'">'+esc(c.emoji||"☕")+'</span>'
    +'<div class="lbmain"><div class="lbname">'+esc(c.name)+'</div><div class="lbsub">'+sub+'</div></div>'+right+'</div>';
}
function renderBoard(){
  const host=$("cmp-body"); if(!host)return;
  const vis=cafes.filter(function(c){ return !c.wish; });
  const board=chaserBoard();
  const never=vis.filter(function(c){ return matchCount(c)===0; })
    .sort(function(a,b){ return (chaserLast(b)||"").localeCompare(chaserLast(a)||""); });
  const h2h=Math.round(vis.reduce(function(s,c){ return s+matchCount(c); },0)/2);
  let h='<div class="cmp-head left"><div class="ct">🏆 The board</div><div class="cs">'
    +board.length+' of '+vis.length+' cafes ranked'+(h2h?' · '+h2h+' head-to-head'+(h2h===1?"":"s"):"")+'</div></div>';
  if(isAdmin&&vis.length>1)h+='<div class="handoff top" role="button" tabindex="0" onclick="boardRank()">⚖️ Rank a pair'+(never.length?' <span>· '+never.length+' never compared</span>':'')+'</div>';
  if(!board.length){
    h+='<div class="empty"><div class="big">🏆</div>Nothing ranked yet.'+(isAdmin?" Tap “Rank a pair”, or log a visit and answer the question that follows.":"")+'</div>';
  } else {
    /* Competition ranking off the same helper the sheet quotes, so "#2 → #1" in the popup and
       "#1" here can never disagree. Genuine ties share a position. */
    const pos=board.map(function(c){ return chaserRank(c,board); });
    const uniq={}; pos.forEach(function(p){ uniq[p]=(uniq[p]||0)+1; });
    const rows=board.map(function(c,i){ return boardRow(c,pos[i],uniq[pos[i]]===1); });
    h+=rows.slice(0,10).join("");
    if(rows.length>10)h+='<div class="foldbox">'+rows.slice(10).join("")+'</div>'
      +'<button class="morebtn" data-lab="Show all '+rows.length+'" onclick="statFold(this)">Show all '+rows.length+' ▾</button>';
    const thin=board.filter(function(c){ return matchCount(c)<3; }).length;
    h+='<div class="statnote">Positions come from '+h2h+' head-to-head pick'+(h2h===1?"":"s")+', not from stars.'
      +(thin?' '+thin+' cafe'+(thin===1?" has":"s have")+' fewer than three comparisons, so '+(thin===1?"its place is":"their places are")+' provisional.':"")+'</div>';
  }
  if(never.length){
    const q=never.map(boardQueueRow);
    h+='<div class="statsec">Never compared — '+never.length+'</div>'+q.slice(0,3).join("");
    if(q.length>3)h+='<div class="foldbox">'+q.slice(3).join("")+'</div>'
      +'<button class="morebtn" data-lab="Show all '+q.length+'" onclick="statFold(this)">Show all '+q.length+' ▾</button>';
  }
  h+='<div class="handoff" role="button" tabindex="0" onclick="show(\'stats\')">📊 See the numbers behind this <span>›</span></div>';
  host.innerHTML='<div class="boardwrap">'+h+'</div>';
}
/* On-demand ranking. Anchors on a never-compared cafe when there is one, so the button
   closes the coverage gap rather than re-testing the well-tested. */
function boardRank(id){
  if(!isAdmin){ toast("Sign in to rank"); return; }
  const vis=cafes.filter(function(c){ return !c.wish; });
  if(vis.length<2){ toast("Add another cafe first"); return; }
  let anchor=id?cafes.find(function(c){ return c.id===id; }):null;
  if(!anchor){
    const never=vis.filter(function(c){ return matchCount(c)===0; });
    const pool=never.length?never:vis.slice().sort(function(a,b){ return matchCount(a)-matchCount(b); }).slice(0,12);
    anchor=pool[Math.floor(Math.random()*pool.length)];
  }
  if(!anchor)return;
  chaserArm(anchor.id);
  if(!_chaser){ toast("No opponent available yet"); return; }
  _chaser.board=true;
  chaserPaint();
}

/* ---------- post-save ranking sheet ("chaser") ----------
   Ranking as a destination went unused, so the question comes to the save instead. It ranks
   CAFES, not drinks: replaying all dated logs chronologically, a same-name drink opponent
   existed only 26% of the time and drink scores cannot move at the observed match counts.
   Cafes pair 100% of the time and already spread 2.9-7.4. The drink just logged still does
   the work — it picks the opponent and justifies the pairing. See DESIGN_NOTES.md. */
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
  /* Coverage is the binding constraint — 18 cafes have never been compared and most were
     visited recently — so fewest-matches dominates the cost. */
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
  _chaser={cafe:c.id,opp:pick.id,tier:tier,fam:fam,myDrink:fresh?fresh.n:null,theirDrink:theirDrink,flip:Math.random()<0.5,ts:Date.now(),res:null,board:false};
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
  saveCafe(a.id); saveCafe(b.id);   /* a comparison moves exactly these two */
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
/* One more pair without leaving the sheet — only offered from the board, where ranking is
   the task; after a save one question is the whole contract. */
function chaserAgain(){
  if(!_chaser)return;
  const from=_chaser.cafe;
  boardRank();
  if(_chaser&&_chaser.cafe===from&&_chaser.opp)return;
}
function chaserDismiss(){
  const wasBoard=!!(_chaser&&_chaser.board);
  _chaser=null;
  const host=$("d-chaser"); if(host)host.innerHTML="";
  if(wasBoard){ try{ renderBoard(); }catch(e){} return; }
  const c=cafes.find(function(x){ return x.id===curId; }); if(c)renderChaser(c);
  try{ renderList(); }catch(e){}
}
function chaserRepaint(){
  if(_chaser&&_chaser.board){ chaserPaint(); try{ renderBoard(); }catch(e){} return; }
  const c=cafes.find(function(x){ return x.id===curId; }); if(c)renderChaser(c);
  try{ renderList(); }catch(e){}
}
function chaserOpt(c,drink,side){
  const gp=(typeof gphotoFor==="function")?gphotoFor(c):null;
  const th=(gp&&!_imgFail[c.id])
    ? '<span class="ch-th" style="background-image:url(\'' + safeUrl(gp) + '\')"></span>'
    : '<span class="ch-th" style="background:' + nophotoBg(c.name) + '">' + esc(initials(c)) + '</span>';
  const sub=[drink?esc(drink):"",chaserWhen(chaserLast(c))].filter(Boolean).join(" · ");
  return '<button class="ch-opt" onclick="chaserPick(' + side + ')">' + th
    + '<span class="ch-m"><span class="ch-n">' + esc(c.name) + '</span><span class="ch-s">' + sub + '</span></span></button>';
}
/* Bottom sheet. The scrim dismisses, matching every other sheet the app has had. */
function chaserShell(inner){ return '<div class="ch-scrim" onclick="chaserDismiss()"></div><div class="ch-sheet" role="dialog" aria-modal="true" aria-label="Quick ranking"><div class="ch-grab"></div>'+inner+'</div>'; }
function chaserOpen(){ const h=$("d-chaser"); return !!(h&&h.innerHTML); }
/* Called from openDetail so the Firebase echo repaints the sheet instead of wiping it. The
   id + isAdmin + 3-minute guard covers every other openDetail caller: map pins, list cards,
   stats rows, board rows and the ?cafe= deep link. */
function renderChaser(c){
  const host=$("d-chaser"); if(!host)return;
  if(_chaser&&_chaser.board)return;
  if(!_chaser||_chaser.cafe!==c.id||!isAdmin||Date.now()-_chaser.ts>180000){ host.innerHTML=""; return; }
  chaserPaint();
}
function chaserPaint(){
  const host=$("d-chaser"); if(!host)return;
  if(!_chaser){ host.innerHTML=""; return; }
  const c=cafes.find(function(x){ return x.id===_chaser.cafe; });
  const opp=cafes.find(function(x){ return x.id===_chaser.opp; });
  if(!c||!opp){ host.innerHTML=""; return; }
  const r=_chaser.res;
  if(r){
    const line=function(x,pre,post,n){
      const nm=esc(x.name);
      if(pre===null)return nm+' <b class="up">enters at #'+post+' of '+n+'</b>';
      if(post<pre)return nm+' <b class="up">#'+pre+' → #'+post+'</b>';
      if(post>pre)return nm+' <b class="dn">#'+pre+' → #'+post+'</b>';
      return nm+' <b>stays #'+post+'</b>';
    };
    host.innerHTML=chaserShell('<div class="ch-rl">'+(r.draw?"🤝 Called it even":"👍 "+esc(r.a.name))+'</div>'
      +'<div class="ch-mv"><span>'+line(r.a,r.preA,r.postA,r.postN)+'</span><span>'+line(r.b,r.preB,r.postB,r.postN)+'</span></div>'
      +'<div class="ch-done">'+(_chaser.board
        ? '<button class="ch-lnk" onclick="chaserAgain()">↻ Rank another</button>'
        : '<button class="ch-lnk" onclick="chaserDismiss();openRank()">See the board ›</button>')
      +'<button class="ch-close" onclick="chaserDismiss()">Done</button></div>');
    return;
  }
  const eyebrow=_chaser.tier==="A"?("Both do "+esc(_chaser.myDrink)):(_chaser.tier==="B"?("Both do "+esc(_chaser.fam)):"");
  const lv=chaserLast(opp);
  const stale=!!lv&&(Date.now()-new Date(lv).getTime())/86400000>120;
  const L=_chaser.flip?opp:c, R=_chaser.flip?c:opp;
  const LD=_chaser.flip?_chaser.theirDrink:_chaser.myDrink, RD=_chaser.flip?_chaser.myDrink:_chaser.theirDrink;
  host.innerHTML=chaserShell('<div class="ch-hd"><span class="ch-qwrap">'
    +(eyebrow?'<span class="ch-why">'+eyebrow+'</span>':"")
    +'<span class="ch-q">Which would you go back to?</span></span>'
    +'<button class="ch-x" onclick="chaserDismiss()" aria-label="Not now">✕</button></div>'
    +'<div class="ch-pair">'+chaserOpt(L,LD,0)+chaserOpt(R,RD,1)+'</div>'
    +'<button class="ch-even" onclick="chaserEven()">'+(stale?"Too long ago to say":"Too close to call")+'</button>');
}
