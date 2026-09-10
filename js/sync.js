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
      const result=await ref.transaction(function(raw){
        let current=raw, collection;
        if(!keyed){collection={};asArray(raw).forEach(c=>{if(c&&c.id)collection[c.id]=c;});current=collection[id]||null;}
        // Firebase may first invoke this with an empty local cache. A null base can
        // create, but an existing remote value is checked again on server retry.
        if(!syncEqual(current,op.base)&&!syncEqual(current,op.value))return;
        if(keyed)return syncCopy(op.value);
        if(op.value===null)delete collection[id];else collection[id]=syncCopy(op.value);
        return collection;
      },undefined,false);
      if(syncPending[id]!==op){if(result.committed&&syncPending[id])syncPending[id].base=syncCopy(op.value);syncPersist();again=true;continue;}
      if(result.committed){
        syncLastConfirmed=true;
        syncRemote[id]=syncCopy(op.value);delete syncPending[id];
        if(op.value===null)removePrivateDetail(id,true);
        if(!keyed)_cloudKeyed=true;
      }else{
        const raw=result.snapshot.val();op.conflict=true;op.remote=syncCopy(keyed?raw:asArray(raw).find(c=>c&&c.id===id)||null);
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
function renderSyncStatus(){
  const el=$('sync-status');if(!el)return;
  const keys=Object.keys(syncPending), conflict=keys.find(k=>syncPending[k].conflict);
  el.hidden=!keys.length&&!syncFailure;
  const label=el.querySelector('.sync-label');
  label.textContent=syncFailure||(conflict?'Another device changed '+((syncPending[conflict].value||syncPending[conflict].remote||{}).name||'this cafe'):(syncBusy?'Syncing…':'Saved on this phone · '+keys.length+' waiting to sync'));
  el.querySelector('.sync-review').hidden=!conflict;
  el.querySelector('.sync-retry').hidden=!!conflict||syncBusy;
  const state=$('save-state');if(state)state.textContent=keys.length?'Saved on this phone':syncFailure||(syncLastConfirmed&&navigator.onLine?'Synced ✓':'No pending edits');
}
window.addEventListener('online',()=>flushSync());
