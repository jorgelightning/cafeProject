const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage();
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // a fake Firebase that keeps a real tree, so a lost update can actually happen
 await pg.evaluate(()=>{
   window.__mk=function(initial){
     const store={v:initial===undefined?null:JSON.parse(JSON.stringify(initial))};
     const log=[];
     function ref(p){
       return {
         set:function(v){
           log.push({path:p,kind:'set'});
           if(p==='cafes'){ store.v=JSON.parse(JSON.stringify(v)); }
           else { const id=p.slice(6); if(store.v==null||Array.isArray(store.v))store.v={}; store.v[id]=JSON.parse(JSON.stringify(v)); }
           return Promise.resolve();
         },
         remove:function(){ log.push({path:p,kind:'remove'}); const id=p.slice(6); if(store.v)delete store.v[id]; return Promise.resolve(); },
         once:function(){ return Promise.resolve({val:function(){ return store.v; }}); },
         on:function(){}
       };
     }
     return {ref:ref,__store:store,__log:log};
   };
   window.__arm=function(db,keyed){
     isAdmin=true; fbReady=true; fbDb=db;
     fbAuth={currentUser:{email:"jorgemarco.portillo@gmail.com"}};
     _cloudKeyed=!!keyed;
   };
 });

 const A={id:'a1',name:'Milksha',tags:[],drinks:[],rating:3};
 const B={id:'b1',name:'Oolong',tags:[],drinks:[],rating:4};

 // ---- shape detection ---------------------------------------------------
 let r=await pg.evaluate(()=>{
   const out={};
   noteCloudShape([{id:'a'}]);        out.array=_cloudKeyed;
   noteCloudShape({a:{id:'a'}});      out.keyed=_cloudKeyed;
   noteCloudShape(null);              out.empty=_cloudKeyed;
   return out;
 });
 eq(r,{array:false,keyed:true,empty:false},'array / keyed / empty are told apart');

 // ---- migration: a per-cafe write never lands on an array-shaped node ----
 r=await pg.evaluate(a=>{
   const db=window.__mk([a,{id:'b1',name:'Oolong',tags:[],drinks:[]}]);   // legacy array in the cloud
   window.__arm(db,false);
   cafes=[JSON.parse(JSON.stringify(a)),{id:'b1',name:'Oolong',tags:[],drinks:[]}];
   cafes[0].rating=5;
   saveCafe('a1');                       // must reshape, not write cafes/a1 beside 0,1
   return {paths:db.__log.map(x=>x.path), keys:Object.keys(db.__store.v), keyed:_cloudKeyed,
           rating:db.__store.v.a1.rating};
 },A);
 eq(r.paths,['cafes'],'first per-cafe save reshapes the whole node instead');
 eq(r.keys,['a1','b1'],'node is now keyed by id — no numeric keys left beside them');
 eq({keyed:r.keyed,rating:r.rating},{keyed:true,rating:5},'flag set and the edit landed');

 // ---- after migration, one cafe means one path --------------------------
 r=await pg.evaluate(()=>{
   const db=window.__mk({a1:{id:'a1',name:'Milksha',rating:3},b1:{id:'b1',name:'Oolong',rating:4}});
   window.__arm(db,true);
   cafes=[{id:'a1',name:'Milksha',rating:5},{id:'b1',name:'Oolong',rating:4}];
   saveCafe('a1');
   return {paths:db.__log.map(x=>x.path), a:db.__store.v.a1.rating, b:db.__store.v.b1.rating};
 });
 eq(r.paths,['cafes/a1'],'writes only that cafe’s path');
 eq({a:r.a,b:r.b},{a:5,b:4},'the other cafe is untouched');

 // ---- THE POINT: two devices, different cafes, nothing lost -------------
 r=await pg.evaluate(()=>{
   const db=window.__mk({a1:{id:'a1',name:'Milksha',rating:3},b1:{id:'b1',name:'Oolong',rating:3}});
   // phone edits Milksha
   window.__arm(db,true);
   cafes=[{id:'a1',name:'Milksha',rating:5},{id:'b1',name:'Oolong',rating:3}];
   saveCafe('a1');
   // laptop, holding a copy from BEFORE the phone's edit, edits Oolong
   cafes=[{id:'a1',name:'Milksha',rating:3},{id:'b1',name:'Oolong',rating:9}];
   saveCafe('b1');
   return {milksha:db.__store.v.a1.rating, oolong:db.__store.v.b1.rating};
 });
 eq(r,{milksha:5,oolong:9},'per-cafe: BOTH edits survive');

 // the same scenario on the old whole-array write, to show what it cost
 r=await pg.evaluate(()=>{
   const db=window.__mk({a1:{id:'a1',name:'Milksha',rating:3},b1:{id:'b1',name:'Oolong',rating:3}});
   window.__arm(db,true);
   cafes=[{id:'a1',name:'Milksha',rating:5},{id:'b1',name:'Oolong',rating:3}];
   save();
   cafes=[{id:'a1',name:'Milksha',rating:3},{id:'b1',name:'Oolong',rating:9}];
   save();                                  // stale array, whole write
   return {milksha:db.__store.v.a1.rating, oolong:db.__store.v.b1.rating};
 });
 eq(r,{milksha:3,oolong:9},'whole-array: the phone’s edit is gone — the bug, reproduced');

 // ---- deletion ----------------------------------------------------------
 r=await pg.evaluate(()=>{
   const db=window.__mk({a1:{id:'a1'},b1:{id:'b1'}});
   window.__arm(db,true);
   cafes=[{id:'b1',name:'Oolong'}];
   removeCafe('a1');
   return {log:db.__log, keys:Object.keys(db.__store.v)};
 });
 /* Two paths, not one: deleting a cafe also drops any exact address stored for it under
    PRIVATE_PATH. An address left behind for a cafe that no longer exists is precisely the leak
    the private node exists to prevent, so this write is deliberate — it fires unconditionally
    on delete rather than only when we happen to hold a local copy. The point this assertion
    still guards is that it is a per-cafe path, never a whole-array write. */
 eq(r.log,[{path:'private/a1',kind:'remove'},{path:'cafes/a1',kind:'remove'}],
    'delete removes the cafe and its private address, by path');
 eq(r.keys,['b1'],'and only that one');

 // ---- guards still hold --------------------------------------------------
 r=await pg.evaluate(()=>{
   const db=window.__mk({a1:{id:'a1'}});
   window.__arm(db,true);
   fbAuth={currentUser:{email:"someone.else@example.com"}};
   cafes=[{id:'a1',name:'X'}];
   saveCafe('a1');
   const notOwner=db.__log.length;
   isAdmin=false; fbAuth={currentUser:{email:"jorgemarco.portillo@gmail.com"}};
   saveCafe('a1'); save(); removeCafe('a1');
   return {notOwner, notAdmin:db.__log.length, dirty:localStorage.getItem("cafemap.dirty")};
 });
 eq({w:r.notOwner,n:r.notAdmin},{w:0,n:0},'a non-owner and a non-admin write nothing to the cloud');
 eq(r.dirty,'1','…and the non-owner case is flagged dirty for later sync');

 // ---- the read side still yields an array -------------------------------
 r=await pg.evaluate(()=>asArray({a1:{id:'a1',name:'M'},b1:{id:'b1',name:'O'}}).map(c=>c.id));
 eq(r,['a1','b1'],'asArray turns the keyed object back into the array the app expects');

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
