const {serve,launch,checker}=require('./harness');const {eq,done}=checker();
(async()=>{const srv=await serve(),b=await launch();try{
 const p=await b.newPage();await p.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());await p.goto(srv.origin+'/index.html');await p.waitForTimeout(500);
 await p.evaluate(()=>{
  window.armSync=function(raw){
   syncPending={};syncRemote={};syncBusy=false;syncFailure='';localStorage.removeItem(OUTBOX_KEY);localStorage.removeItem(DIRTY_FLAG);
   window.dbValue=JSON.parse(JSON.stringify(raw));window.failWrites=false;window.writePaths=[];
   const snapshot=v=>({val:()=>JSON.parse(JSON.stringify(v==null?null:v))});window.syncCallback=null;
   fbDb={ref:path=>({
    once:()=>Promise.resolve(snapshot(path==='cafes'?dbValue:(dbValue||{})[path.slice(6)])),
    on:(event,fn)=>{syncCallback=fn;},remove:()=>Promise.resolve(),
    transaction:async fn=>{
     if(failWrites)throw Error('offline test');
     const current=path==='cafes'?dbValue:(dbValue||{})[path.slice(6)]||null;
     const next=fn(JSON.parse(JSON.stringify(current)));
     if(next===undefined)return {committed:false,snapshot:snapshot(current)};
     writePaths.push(path);
     if(path==='cafes')dbValue=next;else if(next===null)delete dbValue[path.slice(6)];else dbValue[path.slice(6)]=next;
     return {committed:true,snapshot:snapshot(next)};
    }
   })};
   isAdmin=true;fbReady=true;fbAuth={currentUser:{email:OWNER_EMAIL}};noteCloudShape(raw);cafes=syncOverlay(raw);
  };
 });
 let r=await p.evaluate(async()=>{
  armSync({a:{id:'a',name:'A',rating:1},b:{id:'b',name:'B',rating:1}});
  fbReady=false;cafes[0].rating=5;saveCafe('a');
  const persisted=JSON.parse(localStorage.getItem(OUTBOX_KEY)).a.value.rating;
  fbReady=true;subscribeCloud();syncCallback({val:()=>({a:{id:'a',name:'A',rating:1},b:{id:'b',name:'B',rating:4}})});
  const overlay=cafes.map(c=>c.rating);dbValue.b.rating=4;await flushSync();
  return {persisted,overlay,cloud:dbValue,pending:Object.keys(syncPending).length,paths:writePaths};
 });
 eq(r.persisted,5,'offline edit persisted before network write');eq(r.overlay,[5,4],'snapshot preserves pending edit and adopts other cafe changes');eq([r.cloud.a.rating,r.cloud.b.rating],[5,4],'reconnect preserves both cafes');eq(r.pending,0,'acknowledged save leaves queue');eq(r.paths,['cafes/a'],'only changed cafe path is written');
 r=await p.evaluate(async()=>{armSync({a:{id:'a',name:'A',rating:1}});fbReady=false;cafes[0].rating=5;saveCafe('a');dbValue.a.rating=3;fbReady=true;await flushSync();return {cloud:dbValue.a.rating,local:cafes[0].rating,conflict:syncPending.a.conflict};});eq(r,{cloud:3,local:5,conflict:true},'same-cafe conflict retains both versions');
 r=await p.evaluate(async()=>{resolveSyncConflict(true);while(syncBusy)await new Promise(r=>setTimeout(r,1));return {rating:dbValue.a.rating,pending:Object.keys(syncPending).length};});eq(r,{rating:5,pending:0},'explicit keep-local resolves conflict');
 r=await p.evaluate(async()=>{armSync([{id:'a',name:'A',rating:1},{id:'b',name:'B'}]);cafes[0].rating=4;await saveCafe('a');return {keys:Object.keys(dbValue),rating:dbValue.a.rating};});eq(r,{keys:['a','b'],rating:4},'legacy array migrates without duplicates');
 r=await p.evaluate(async()=>{armSync({a:{id:'a',name:'A'},b:{id:'b',name:'B'}});fbReady=false;cafes=cafes.filter(c=>c.id!=='a');removeCafe('a');const recovered=syncOverlay(dbValue).map(c=>c.id);fbReady=true;await flushSync();return {recovered,cloud:Object.keys(dbValue)};});eq(r,{recovered:['b'],cloud:['b']},'offline deletion survives cloud snapshots');
 r=await p.evaluate(async()=>{armSync({});cafes=[{id:'new',name:'New'}];await saveCafe('new');return dbValue.new.name;});eq(r,'New','new cafe syncs into empty collection');
 r=await p.evaluate(async()=>{armSync({a:{id:'a',name:'A'}});failWrites=true;cafes[0].name='Edited';await saveCafe('a');return {queued:Object.keys(syncPending),dirty:localStorage.getItem(DIRTY_FLAG)};});eq(r,{queued:['a'],dirty:'1'},'network failure stays durably pending');
 r=await p.evaluate(async()=>{armSync({a:{id:'a',name:'A'}});fbAuth={currentUser:{email:'other@example.com'}};cafes[0].name='Edited';await saveCafe('a');return writePaths;});eq(r,[],'non-owner cannot write');
 /* ---- a full localStorage must inconvenience, never break ----
    syncPersist also runs inside the Firebase snapshot callback: a quota throw there used to
    kill the rest of the handler, so the screen silently stopped following the cloud. And
    queueCafe used to rethrow, aborting the caller mid-save. */
 r=await p.evaluate(async()=>{
  armSync({a:{id:'a',name:'A',rating:1}});
  const realSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(){ throw new DOMException('QuotaExceededError'); };
  let threw=false, overlayOk=false;
  try{
    cafes[0].rating=5;
    try{ await saveCafe('a'); }catch(e){ threw=true; }
    /* the edit has already flushed by now, so the overlay's job here is only to survive */
    const out=syncOverlay({a:{id:'a',name:'A',rating:1},b:{id:'b',name:'B'}});
    overlayOk=Array.isArray(out)&&out.length===2;
  }finally{ Storage.prototype.setItem=realSet; }
  return { threw, overlayOk, cloud:dbValue.a.rating, banner:/keep this page open/.test(syncFailure||'') };
 });
 eq(r.threw,false,'a save with storage full does not throw out of the caller');
 eq(r.overlayOk,true,'…the snapshot overlay still runs, so the screen keeps following the cloud');
 eq(r.cloud,5,'…and the edit still reaches the cloud — the outbox lives in memory');
 eq(r.banner,true,'…while the banner says to keep the page open');

 /* ---- taking the cloud's copy updates what "the cloud has" means ---- */
 r=await p.evaluate(async()=>{
  armSync({a:{id:'a',name:'A',rating:1}});
  fbReady=false; cafes[0].rating=5; saveCafe('a');
  dbValue.a.rating=3; dbValue.a.updated=new Date().toISOString(); fbReady=true; await flushSync();
  const wasConflict=!!(syncPending.a&&syncPending.a.conflict);
  resolveSyncConflict(false);
  return { wasConflict, remote:(syncRemote.a||{}).rating, local:cafes.find(c=>c.id==='a').rating,
           pending:Object.keys(syncPending).length };
 });
 eq(r.wasConflict,true,'the same-field clash asked first');
 eq(r,{wasConflict:true,remote:3,local:3,pending:0},
    'choosing the cloud updates the remote mirror too, so the next edit merges against the truth');

 /* ---- v73 audit: what lands is what the screen shows ----
    A fake that, like Firebase, fires the listener with a transaction's result BEFORE the promise
    resolves — while the outbox entry still exists, so the overlay shows the queued value. */
 await p.evaluate(()=>{
  window.armEvt=function(raw){
   armSync(raw);
   const snap=v=>({val:()=>JSON.parse(JSON.stringify(v==null?null:v))});
   fbDb={ref:path=>({
    once:()=>Promise.resolve(snap(path==='cafes'?dbValue:(dbValue||{})[path.slice(6)])),
    on:(e,fn)=>{syncCallback=fn;},remove:()=>Promise.resolve(),
    transaction:async fn=>{
     const cur=path==='cafes'?dbValue:(dbValue||{})[path.slice(6)]||null;
     const next=fn(JSON.parse(JSON.stringify(cur)));
     if(next===undefined)return{committed:false,snapshot:snap(cur)};
     if(path==='cafes')dbValue=next;else if(next===null)delete dbValue[path.slice(6)];else dbValue[path.slice(6)]=next;
     if(syncCallback)syncCallback(snap(dbValue));
     return{committed:true,snapshot:snap(next)};
    }})};
  };
  window.settle=async()=>{ for(let i=0;i<200&&(syncBusy||Object.keys(syncPending).some(k=>!syncPending[k].conflict));i++) await new Promise(r=>setTimeout(r,5)); };
 });
 r=await p.evaluate(async()=>{
  armEvt({a:{id:'a',name:'A',rating:1,review:'old'}});
  subscribeCloud();
  fbReady=false; cafes[0].review='mine'; saveCafe('a');      /* edit made while the cloud was out of reach */
  fbReady=true; dbValue.a.rating=5;                           /* meanwhile the other device rated it 5 */
  await flushSync(); await settle();
  const afterFlush={cloud:dbValue.a.rating,memory:cafes[0].rating,review:cafes[0].review};
  cafes[0].fav=true; await saveCafe('a'); await settle();     /* any later, unrelated edit on this device */
  return {afterFlush,cloudRating:dbValue.a.rating,fav:dbValue.a.fav,review:dbValue.a.review};
 });
 eq(r.afterFlush,{cloud:5,memory:5,review:'mine'},'after a merged flush the screen holds what landed, including the other device\'s change');
 eq([r.cloudRating,r.fav,r.review],[5,true,'mine'],'…so a later edit on this device does not write the older rating back over it');

 /* ---- a bulk save() before the cloud has answered ---- */
 r=await p.evaluate(async()=>{
  armEvt({a:{id:'a',name:'A',rating:1,review:'r'},b:{id:'b',name:'B',rating:1}});
  syncLastConfirmed=false; syncRemote={}; syncBootBase=syncCopy(cafesById()); syncNeedsFullDiff=false;   /* started offline */
  cafes[0].rating=5; save();
  const before={queued:Object.keys(syncPending).length,flag:syncNeedsFullDiff};
  const raw={a:{id:'a',name:'A',rating:1,review:'theirs'},b:{id:'b',name:'B',rating:9}};   /* the cloud answers, changed elsewhere */
  dbValue=JSON.parse(JSON.stringify(raw));
  syncOverlay(raw); await settle();
  return {before,queuedAfter:Object.keys(syncPending).length,a:dbValue.a,b:dbValue.b,flag:syncNeedsFullDiff,conflict:Object.values(syncPending).some(o=>o.conflict)};
 });
 eq(r.before,{queued:0,flag:true},'a bulk save() before the cloud has answered queues nothing — it waits');
 eq([r.a.rating,r.a.review,r.b.rating],[5,'theirs',9],'once it answers, only what this device changed is written, merged with what changed elsewhere');
 eq([r.flag,r.conflict],[false,false],'…without a conflict, and the wait is over');
 r=await p.evaluate(async()=>{
  armEvt({a:{id:'a',name:'A',rating:1,review:'r'}});
  syncLastConfirmed=false; syncRemote={}; syncBootBase=syncCopy(cafesById());
  cafes[0].review='mine'; saveCafe('a');
  const base=syncPending.a.base;
  return {rating:base&&base.rating,review:base&&base.review};
 });
 eq(r,{rating:1,review:'r'},'an ordinary edit made before the cloud answers is based on how the cafe looked at startup, not on nothing');

 /* ---- a read that never answers cannot jam the queue ---- */
 r=await p.evaluate(async()=>{
  armEvt({a:{id:'a',name:'A',rating:1}});
  const real=fbDb; SYNC_ONCE_MS=40;
  fbDb={ref:path=>Object.assign({},real.ref(path),{once:()=>new Promise(()=>{})})};
  cafes[0].rating=5; saveCafe('a');
  await new Promise(r=>setTimeout(r,150));
  const stuck={busy:syncBusy,pending:Object.keys(syncPending).length,said:syncFailure};
  fbDb=real; await flushSync(); await settle();
  SYNC_ONCE_MS=15000;
  return {stuck,cloud:dbValue.a.rating,pending:Object.keys(syncPending).length};
 });
 eq([r.stuck.busy,r.stuck.pending,/Waiting to sync/.test(r.stuck.said)],[false,1,true],'a cloud read that never answers times out: the queue is released, kept, and the banner says so');
 eq([r.cloud,r.pending],[5,0],'…and the next flush delivers it');

 /* ---- bulk photo fetch while snapshots replace the cafes ---- */
 r=await p.evaluate(async()=>{
  armEvt({a:{id:'a',name:'A',lat:1,lng:1},b:{id:'b',name:'B',lat:2,lng:2}});
  gReady=true; isAdmin=true;
  const real=window.fetchPlacePhoto;
  window.fetchPlacePhoto=(c,cb)=>{ cafes=cafes.map(x=>Object.assign({},x)); setTimeout(()=>cb('https://lh3.googleusercontent.com/p/'+c.id),0); };
  await fetchAllPhotos();
  window.fetchPlacePhoto=real;
  return cafes.map(c=>c.gphoto);
 });
 eq(r,['https://lh3.googleusercontent.com/p/a','https://lh3.googleusercontent.com/p/b'],'photos fetched while the cafe objects are replaced mid-run still land on the live ones');

 process.exitCode=done()?0:1;
}finally{await b.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
