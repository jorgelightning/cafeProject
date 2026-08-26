const { serve, launch, checker, ROOT } = require("./harness");
const fs = require("fs");
const { eq, done } = checker();
const OUT='/tmp/claude-0/-home-user-cafeProject/f9104775-1085-5003-b0cd-237ce001c0b8/scratchpad/';
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:860},deviceScaleFactor:2});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // stub the network the way Frankfurter actually answers: a weekend date comes back
 // stamped with the working day before it
 const stub=(mode)=>pg.evaluate(m=>{
   window.__fx=[]; window.__mode=m;
   window.fetch=function(url){
     window.__fx.push(url);
     if(window.__mode==='fail')return Promise.reject(new Error('offline'));
     if(window.__mode==='http500')return Promise.resolve({ok:false,status:500,json:()=>Promise.resolve(null)});
     const d=(url.match(/\/(\d{4}-\d{2}-\d{2})\?/)||[])[1];
     const to=(url.match(/to=([A-Z]+)/)||[])[1];
     const settled=(d==='2025-01-11')?'2025-01-10':d;   // Saturday -> Friday
     const rates={TWD:32.8,JPY:157,CAD:1.44};
     return Promise.resolve({ok:true,status:200,json:()=>Promise.resolve({amount:1,base:'USD',date:settled,rates:{[to]:rates[to]}})});
   };
 },mode);

 const enterDrink=(date,amt)=>pg.evaluate(async a=>{
   isAdmin=true; cafes=[]; editId=null; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm(); formCC="TW"; refreshRowCcy();
   $("f-name").value="Oolong Tea Project";
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Cheese Foam Ruby Oolong";
   const dd=dr.querySelector(".dd"); dd.value=a.date; syncDatePill(dd);
   const dp=dr.querySelector(".dp"); dp.value=a.amt; dp.dispatchEvent(new Event("input"));
   const before={rate:dr.querySelector(".dpr").value, asof:dr.querySelector(".dpd").value};
   await new Promise(r=>setTimeout(r,300));
   return {before, rate:dr.querySelector(".dpr").value, asof:dr.querySelector(".dpd").value,
           hint:dr.querySelector(".convhint").textContent, calls:window.__fx.length};
 },{date,amt});

 // ---- the real rate arrives and replaces the table's guess ---------------
 await stub('ok');
 let r=await enterDrink('2025-01-10','65');
 eq(r.before,{rate:'31.5',asof:'2026-08-25'},'starts on the table so nothing waits on the network');
 eq({r:r.rate,a:r.asof},{r:'32.8',a:'2025-01-10'},'then adopts the real 2025-01-10 rate');
 eq(/≈ \$1\.98/.test(r.hint),true,'converts at it: NT$65 -> $1.98 — got: '+r.hint);
 eq(/rate on file/.test(r.hint),false,'and stops warning that the rate is a stand-in');

 r=await pg.evaluate(()=>{ saveForm(); const d=cafes[0].drinks[0]; return {p:d.p,pr:d.pr,pd:d.pd}; });
 eq(r,{p:'1.98',pr:32.8,pd:'2025-01-10'},'saved with the fetched rate and its true date');

 // ---- weekend dates record the day the rate is really from ---------------
 r=await enterDrink('2025-01-11','65');
 eq(r.asof,'2025-01-10','a Saturday visit records the Friday rate it actually used');

 // ---- cached permanently, never re-fetched ------------------------------
 r=await pg.evaluate(async()=>{
   const n0=window.__fx.length;
   fxEnsure('TWD','2025-01-10'); fxEnsure('TWD','2025-01-10');
   await new Promise(r=>setTimeout(r,150));
   const ls=JSON.parse(localStorage.getItem("cafemap.fx")||"{}");
   return {added:window.__fx.length-n0, cached:ls["TWD@2025-01-10"]};
 });
 eq(r,{added:0,cached:{r:32.8,d:'2025-01-10'}},'cached to localStorage and never asked for twice');

 // survives a reload
 await pg.reload({waitUntil:'load'}); await pg.waitForTimeout(400); await stub('ok');
 r=await pg.evaluate(()=>fxRateAt('TWD','2025-01-10'));
 eq(r,{rate:32.8,asof:'2025-01-10'},'…and survives a reload without touching the network');

 // ---- USD never asks ----------------------------------------------------
 r=await pg.evaluate(async()=>{
   const n0=window.__fx.length; fxEnsure('USD','2025-01-10');
   await new Promise(r=>setTimeout(r,100)); return window.__fx.length-n0;
 });
 eq(r,0,'USD never hits the network');

 // ---- offline and 500s degrade to the table, silently -------------------
 for(const mode of ['fail','http500']){
   await stub(mode);
   r=await enterDrink('2024-06-02','65');
   eq({r:r.rate,a:r.asof},{r:'31.5',a:'2026-08-25'},mode+': falls back to the table');
   eq(/no .*2024.* rate on file/.test(r.hint),true,mode+': and still admits the rate is a stand-in');
   const saved=await pg.evaluate(()=>{ saveForm(); const d=cafes[0].drinks[0]; return {p:d.p,pr:d.pr}; });
   eq(saved,{p:'2.06',pr:31.5},mode+': saving is never blocked by the network');
 }

 // ---- a saved drink is never re-priced by a fetch ------------------------
 await stub('ok');
 r=await pg.evaluate(async()=>{
   cafes=[{id:'t1',name:'Beard Cup',cc:'TW',lat:25.04,lng:121.5,tags:[],
           drinks:[{n:'Honey Lemon',p:'1.27',pl:'40',pc:'TWD',pr:31.5,pd:'2026-08-25',dates:['2025-01-10'],elo:1180,matches:7}]}];
   editId='t1'; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm('t1'); await new Promise(r=>setTimeout(r,300));
   $("f-review").value="just the note"; saveForm();
   const d=cafes[0].drinks[0]; return {p:d.p,pr:d.pr,pd:d.pd,elo:d.elo};
 });
 eq(r,{p:'1.27',pr:31.5,pd:'2026-08-25',elo:1180},'a frozen rate survives even when the network offers a better one');

 // ---- the documented off switch: edit config.js, as with every other setting
 {
   const off=await b.newPage({viewport:{width:430,height:860}});
   await off.route('**://**',async route=>{
     const u=route.request().url();
     if(!u.startsWith(srv.origin))return route.abort();
     if(u.includes('js/config.js')){
       const src=fs.readFileSync(ROOT+'/js/config.js','utf8')
                   .replace(/const FX_API="[^"]*";/,'const FX_API="";');
       return route.fulfill({status:200,contentType:'text/javascript',body:src});
     }
     return route.continue();
   });
   await off.goto(srv.origin+'/index.html',{waitUntil:'load'});
   await off.waitForTimeout(400);
   const res=await off.evaluate(async()=>{
     window.__fx=[]; window.fetch=function(u){ window.__fx.push(u); return Promise.reject(new Error('x')); };
     try{ localStorage.removeItem("cafemap.fx"); }catch(e){}
     _fxCache={};
     fxEnsure('JPY','2024-02-02');
     await new Promise(r=>setTimeout(r,150));
     return {api:FX_API, calls:window.__fx.length, rate:fxRateAt('JPY','2024-02-02')};
   });
   eq(res,{api:'',calls:0,rate:{rate:147,asof:'2026-08-25'}},'FX_API="" in config.js stops all fetching, table still answers');
   await off.close();
 }

 eq(errs,[],'no page errors');

 await stub('ok'); await enterDrink('2025-01-10','65');
 await pg.locator('#f-drinks .dr').screenshot({path:OUT+'fxrow.png'});
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
