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
 process.exitCode=done()?0:1;
}finally{await b.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
