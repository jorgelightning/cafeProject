"use strict";
/* Durable per-cafe outbox. Transactions compare the captured base before writing;
   incoming snapshots are overlaid with pending edits, never allowed to erase them. */
const OUTBOX_KEY="cafemap.outbox.v1";
let syncPending={}, syncRemote={}, syncBusy=false, syncFailure="", syncLastConfirmed=false;
try{const saved=JSON.parse(localStorage.getItem(OUTBOX_KEY)||"{}");if(!saved||Array.isArray(saved)||typeof saved!=='object')throw Error('Invalid outbox');syncPending=saved;}catch(e){syncFailure="Could not read pending saves — keep this page open";}
function syncCopy(v){return v==null?null:JSON.parse(JSON.stringify(v));}
function syncCanonical(v){if(Array.isArray(v))return '['+v.map(syncCanonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+syncCanonical(v[k])).join(',')+'}';return JSON.stringify(v);}
function syncEqual(a,b){return syncCanonical(a)==syncCanonical(b);}
function syncPersist(){localStorage.setItem(OUTBOX_KEY,JSON.stringify(syncPending));if(Object.keys(syncPending).length)localStorage.setItem(DIRTY_FLAG,'1');else localStorage.removeItem(DIRTY_FLAG);renderSyncStatus();}
function syncBaseFor(id){return syncCopy(Object.prototype.hasOwnProperty.call(syncRemote,id)?syncRemote[id]:cafes.find(c=>c.id===id)||null);}
function syncOverlay(raw){
  syncLastConfirmed=true;
  const values=asArray(raw), map={};values.forEach(c=>{if(c&&c.id)map[c.id]=c;});syncRemote=syncCopy(map);
  /* Older releases retained only a whole-array dirty flag. Keep that data and require
     conflict review rather than guessing which remote records can be replaced. */
  if(!Object.keys(syncPending).length&&localStorage.getItem(DIRTY_FLAG)==='1'){
    try{const legacy=JSON.parse(localStorage.getItem(KEY)||'[]');legacy.forEach(c=>{if(c&&c.id&&!syncEqual(c,map[c.id]))syncPending[c.id]={token:uid(),base:null,value:c};});syncPersist();}catch(e){syncFailure='Could not recover local edits';}
  }
  Object.keys(syncPending).forEach(id=>{const value=syncPending[id].value;if(value===null)delete map[id];else map[id]=syncCopy(value);});
  renderSyncStatus();return Object.values(map);
}
/* ---------- three-way merge ----------
   A conflict used to mean "the cloud copy is not byte-identical to the one I started from",
   which fires when two devices touch different fields of the same cafe — the ordinary case,
   and the one that interrupted an edit to ask an unanswerable question.

   `base` is the version this device started from, already captured per outbox entry, so the
   two sides can be told apart: a field only one side moved is not a disagreement. Only the
   same field, moved differently on both sides, is.

   Conservative on purpose. Every doubt resolves to "ask", because a wrong merge loses an edit
   silently and a needless question costs one tap. */
const SYNC_SKIP={elo:1,matches:1,updated:1,drinks:1};
function syncNewer(a,b){
  const x=Date.parse(a||""), y=Date.parse(b||"");
  if(isNaN(x))return b; if(isNaN(y))return a;
  return x>=y?a:b;
}
function syncById(list){
  const o={}; let ok=true;
  (list||[]).forEach(function(x){ if(!x||!x.id){ ok=false; return; } o[x.id]=x; });
  return ok?o:null;
}
/* Orders merge by id. Legacy records predate ids, and merging those by position would
   reshuffle prices between dates, so a single id-less order anywhere makes the whole drinks
   list all-or-nothing. New orders always get one (form.js), so this heals as you edit. */
function syncMergeOrders(base,mine,theirs,note,label){
  const B=syncById(base), M=syncById(mine), T=syncById(theirs);
  if(!B||!M||!T){ note(label,mine,theirs); return mine; }
  const ids=Object.keys(Object.assign({},B,M,T));
  const out=[];
  ids.forEach(function(id){
    const inB=!!B[id], inM=!!M[id], inT=!!T[id];
    if(!inM&&!inT)return;                       /* gone from both */
    if(inB&&(!inM||!inT))return;                /* one side removed it; removal wins */
    if(!inB&&inM&&!inT){ out.push(M[id]); return; }   /* mine added */
    if(!inB&&inT&&!inM){ out.push(T[id]); return; }   /* theirs added */
    if(syncEqual(M[id],T[id])){ out.push(M[id]); return; }
    if(syncEqual(M[id],B[id])){ out.push(T[id]); return; }
    if(syncEqual(T[id],B[id])){ out.push(M[id]); return; }
    note(label,M[id],T[id]);
    out.push(M[id]);
  });
  out.sort(function(a,b){ return String(a.date||"").localeCompare(String(b.date||"")); });
  return out;
}
function syncMergeDrinks(base,mine,theirs,note){
  const key=function(d){ return String((d&&d.n)||"").trim().toLowerCase(); };
  const idx=function(l){ const o={}; (l||[]).forEach(function(d){ const k=key(d); if(k)o[k]=d; }); return o; };
  const B=idx(base), M=idx(mine), T=idx(theirs);
  const keys=Object.keys(Object.assign({},B,M,T));
  const out=[];
  keys.forEach(function(k){
    const inB=!!B[k], inM=!!M[k], inT=!!T[k];
    if(!inM&&!inT)return;
    if(inB&&(!inM||!inT))return;                /* one side deleted the drink */
    if(!inB&&inM&&!inT){ out.push(M[k]); return; }
    if(!inB&&inT&&!inM){ out.push(T[k]); return; }
    if(syncEqual(M[k],T[k])){ out.push(M[k]); return; }
    const merged=Object.assign({},T[k],M[k]);
    merged.orders=syncMergeOrders((B[k]||{}).orders,(M[k]||{}).orders,(T[k]||{}).orders,note,"drinks");
    /* A drink's ranking follows the side that has seen more comparisons, like the cafe's. */
    const bm=(T[k]||{}).matches||0, am=(M[k]||{}).matches||0;
    const src=bm>am?T[k]:M[k];
    if(src&&src.elo!==undefined)merged.elo=src.elo; else delete merged.elo;
    if(src&&src.matches!==undefined)merged.matches=src.matches; else delete merged.matches;
    out.push(syncDrinkSummaryFor(merged));
  });
  return out;
}
/* syncDrinkSummary() lives in core.js and rebuilds dates/count from orders; guard the call so
   sync.js stays loadable on its own. */
function syncDrinkSummaryFor(d){
  try{ return (typeof syncDrinkSummary==="function")?syncDrinkSummary(d):d; }
  catch(e){ warn("sync",e); return d; }
}
function syncMerge(base,mine,theirs){
  const conflicts=[];
  const note=function(field,m,t){
    if(!conflicts.some(function(c){ return c.field===field; }))conflicts.push({field:field,mine:m,theirs:t});
  };
  if(mine===null&&theirs===null)return {value:null,conflicts:conflicts};
  /* A delete on one side against an edit on the other cannot be reconciled by rule. */
  if(mine===null||theirs===null){
    const live=mine||theirs;
    if(!syncEqual(live,base))note("deleted",mine,theirs);
    return {value:mine===null?null:mine,conflicts:conflicts};
  }
  const B=base||{}, out={};
  const keys=Object.keys(Object.assign({},B,mine,theirs));
  keys.forEach(function(k){
    if(SYNC_SKIP[k])return;
    const b=B[k], m=mine[k], t=theirs[k];
    let v;
    if(syncEqual(m,t))v=m;
    else if(syncEqual(m,b))v=t;
    else if(syncEqual(t,b))v=m;
    else { note(k,m,t); v=m; }
    if(v!==undefined)out[k]=v;
  });
  out.updated=syncNewer(mine.updated,theirs.updated);
  if(out.updated===undefined)delete out.updated;
  /* Ranking is derived, not authored — the side with more comparisons knows more. */
  const src=((theirs.matches||0)>(mine.matches||0))?theirs:mine;
  if(src.elo!==undefined)out.elo=src.elo;
  if(src.matches!==undefined)out.matches=src.matches;
  const drinks=syncMergeDrinks((B.drinks),(mine.drinks),(theirs.drinks),note);
  if(mine.drinks!==undefined||theirs.drinks!==undefined)out.drinks=drinks;
  return {value:out,conflicts:conflicts};
}
function queueCafe(id,value,base){
  if(!isAdmin)return;
  const old=syncPending[id];
  syncPending[id]={token:uid(),base:old?old.base:syncCopy(base===undefined?(syncRemote[id]||null):base),value:syncCopy(value)};
  try{syncPersist();_localSave();}catch(e){syncFailure='Storage full — keep this page open';renderSyncStatus();throw e;}
  return flushSync();
}
async function flushSync(){
  if(syncBusy)return;
  if(!isAdmin||!fbReady||!ownerSignedIn()||!navigator.onLine){renderSyncStatus();return;}
  syncBusy=true;syncFailure='';renderSyncStatus();let again=false;
  try{
    for(const id of Object.keys(syncPending)){
      const op=syncPending[id];if(op.conflict)continue;
      const keyed=_cloudKeyed, ref=fbDb.ref(keyed?'cafes/'+id:'cafes');
      await ref.once('value');
      /* The transaction body can run more than once; the last run is the one that counts,
         so these record its outcome rather than accumulating. */
      let lastConflicts=null, lastWritten;
      const result=await ref.transaction(function(raw){
        let current=raw, collection;
        if(!keyed){collection={};asArray(raw).forEach(c=>{if(c&&c.id)collection[c.id]=c;});current=collection[id]||null;}
        // Firebase may first invoke this with an empty local cache. A null base can
        // create, but an existing remote value is checked again on server retry.
        let write=op.value;
        if(!syncEqual(current,op.base)&&!syncEqual(current,op.value)){
          /* Somebody else moved this record. That is only a conflict where we both moved the
             same thing — otherwise the two edits are combined and nobody is interrupted. */
          const m=syncMerge(op.base,op.value,current);
          if(m.conflicts.length){ lastConflicts=m.conflicts; return; }
          write=m.value;
        }
        lastConflicts=null; lastWritten=syncCopy(write);
        if(keyed)return syncCopy(write);
        if(write===null)delete collection[id];else collection[id]=syncCopy(write);
        return collection;
      },undefined,false);
      if(syncPending[id]!==op){if(result.committed&&syncPending[id])syncPending[id].base=syncCopy(op.value);syncPersist();again=true;continue;}
      if(result.committed){
        syncLastConfirmed=true;
        /* What landed may be a merge of both sides, not what this device queued. */
        syncRemote[id]=syncCopy(lastWritten!==undefined?lastWritten:op.value);delete syncPending[id];
        if(op.value===null)removePrivateDetail(id,true);
        if(!keyed)_cloudKeyed=true;
      }else{
        const raw=result.snapshot.val();op.conflict=true;op.remote=syncCopy(keyed?raw:asArray(raw).find(c=>c&&c.id===id)||null);
        /* Naming the fields that actually clashed turns "something differs" into a question. */
        op.conflictFields=(lastConflicts||[]).map(function(c){ return c.field; });
      }
      syncPersist();
    }
  }catch(e){syncFailure='Waiting to sync — retry when connected';warn('sync',e);}
  finally{syncBusy=false;renderSyncStatus();if(again)flushSync();}
}
function resolveSyncConflict(useLocal){
  const id=Object.keys(syncPending).find(k=>syncPending[k].conflict);if(!id)return;
  const op=syncPending[id];
  if(useLocal){op.base=syncCopy(op.remote);delete op.conflict;delete op.remote;}
  else{delete syncPending[id];cafes=cafes.filter(c=>c.id!==id);if(op.remote)cafes.push(op.remote);_localSave();}
  syncPersist();flushSync();if(app.dataset.view==='list')renderList();
}
/* ---------- telling the two versions apart ----------
   "Another device edited this cafe — choose which version to keep" is unanswerable while you
   are mid-edit, which is exactly when a conflict happens: both options describe a place, not
   a change. Both versions are already in hand, so show what actually differs between them and
   when each was last touched. Minute granularity, because a conflict is usually minutes old
   and chaserWhen()'s "today" cannot separate them. */
function syncAgo(iso){
  const t=iso?new Date(iso).getTime():NaN;
  if(isNaN(t))return "";
  const s=Math.max(0,Math.round((Date.now()-t)/1000));
  if(s<45)return "just now";
  const m=Math.round(s/60); if(m<60)return m+" min ago";
  const h=Math.round(m/60); if(h<24)return h+(h===1?" hour ago":" hours ago");
  const d=Math.round(h/24); return d===1?"yesterday":d+" days ago";
}
function syncOrderCount(c){
  return ((c&&c.drinks)||[]).reduce(function(t,d){
    return t+drinkOrders(d).reduce(function(n,o){ return n+orderQty(o); },0);
  },0);
}
function syncTrim(v,n){ v=String(v==null?"":v).replace(/\s+/g," ").trim(); return v.length>n?v.slice(0,n-1)+"\u2026":v; }
/* Only fields a person would recognise, labelled the way the form labels them. */
const SYNC_FIELDS=[
  ["Name",     function(c){ return c.name||""; }],
  ["Area",     function(c){ return c.area||"none"; }],
  ["Rating",   function(c){ return c.rating?c.rating+"\u2605":"none"; }],
  ["Drinks",   function(c){ const n=(c.drinks||[]).length, o=syncOrderCount(c);
                            return n+(n===1?" drink":" drinks")+" \u00b7 "+o+(o===1?" order":" orders"); }],
  ["Notes",    function(c){ return (c.review||"").trim()||"none"; }],
  ["Tags",     function(c){ return (c.tags||[]).join(", ")||"none"; }],
  ["Favourite",function(c){ return c.fav?"yes":"no"; }],
  ["Wishlist", function(c){ return c.wish?"yes":"no"; }]
];
function syncDiffRows(mine,theirs){
  const out=[];
  SYNC_FIELDS.forEach(function(f){
    const a=mine?f[1](mine):"deleted", b=theirs?f[1](theirs):"deleted";
    if(String(a)===String(b))return;
    out.push({ label:f[0], mine:syncTrim(a,90), theirs:syncTrim(b,90) });
  });
  return out;
}
function renderSyncConflict(op){
  const box=$("sync-status")&&$("sync-status").querySelector(".sync-review");
  if(!box)return;
  const mine=op.value, theirs=op.remote;
  const name=((mine||theirs||{}).name)||"this cafe";
  const rows=syncDiffRows(mine,theirs);
  const mineWhen=mine?syncAgo(mine.updated):"", theirsWhen=theirs?syncAgo(theirs.updated):"";
  const FIELD_WORDS={rating:"the rating",review:"the note",drinks:"the drinks",name:"the name",
                     area:"the area",tags:"the tags",fav:"the favourite mark",wish:"the wishlist mark",
                     deleted:"whether it still exists"};
  const clashed=(op.conflictFields||[]).map(function(f){ return FIELD_WORDS[f]||f; });
  const lead=clashed.length
    ? 'You and another device both changed '+esc(clashed.join(" and "))+' on <b>'+esc(name)+'</b>. Everything else was merged for you \u2014 pick which of these to keep.'
    : '<b>'+esc(name)+'</b> was changed in two places. Here is what differs \u2014 pick the one you want to keep.';
  let h='<p>'+lead+'</p>';
  if(rows.length){
    h+='<div class="cfhead"><span></span><span>On this phone'+(mineWhen?' \u00b7 '+esc(mineWhen):'')
      +'</span><span>In the cloud'+(theirsWhen?' \u00b7 '+esc(theirsWhen):'')+'</span></div>';
    h+=rows.map(function(r){
      return '<div class="cfrow"><span class="cfk">'+esc(r.label)+'</span>'
        +'<span class="cfv mine">'+esc(r.mine)+'</span>'
        +'<span class="cfv">'+esc(r.theirs)+'</span></div>';
    }).join("");
  } else {
    /* Equal on every field a person can see: the difference is in something invisible, so
       saying "they differ" without saying how would be the same dead end all over again. */
    h+='<p class="cfsame">Nothing you can see differs \u2014 the two copies vary only in data the form does not show. Keeping either is safe.</p>';
  }
  h+='<div class="cfbtns">'
    +'<button onclick="resolveSyncConflict(true)">Keep this phone\u2019s'+(mineWhen?' \u00b7 '+esc(mineWhen):'')+'</button>'
    +'<button onclick="resolveSyncConflict(false)">Use the cloud\u2019s'+(theirsWhen?' \u00b7 '+esc(theirsWhen):'')+'</button>'
    +'</div>';
  box.innerHTML=h;
}
function renderSyncStatus(){
  const el=$('sync-status');if(!el)return;
  const keys=Object.keys(syncPending), conflict=keys.find(k=>syncPending[k].conflict);
  el.hidden=!keys.length&&!syncFailure;
  const label=el.querySelector('.sync-label');
  label.textContent=syncFailure||(conflict?'One cafe needs your choice':(syncBusy?'Syncing…':'Saved on this phone · '+keys.length+' waiting to sync'));
  const review=el.querySelector('.sync-review');
  review.hidden=!conflict;
  if(conflict)renderSyncConflict(syncPending[conflict]);
  el.querySelector('.sync-retry').hidden=!!conflict||syncBusy;
  const state=$('save-state');if(state)state.textContent=keys.length?'Saved on this phone':syncFailure||(syncLastConfirmed&&navigator.onLine?'Synced ✓':'No pending edits');
}
window.addEventListener('online',()=>{flushSync();if(typeof flushPrivate==='function')flushPrivate();});
