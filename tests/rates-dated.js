const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:860},deviceScaleFactor:2});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // ---- lookup with no anchors: current table, honestly labelled ----------
 let r=await pg.evaluate(()=>({
   now:fxRateAt('TWD','2026-08-20'), old:fxRateAt('TWD','2025-01-10'), usd:fxRateAt('USD','2025-01-10')
 }));
 eq(r.now,{rate:31.5,asof:'2026-08-25'},'no anchors: uses the current table');
 eq(r.old,{rate:31.5,asof:'2026-08-25'},'…and a 2025 drink still reports the 2026 date it really used');
 eq(r.usd.rate,1,'USD is always 1');

 // ---- with a historical anchor -----------------------------------------
 r=await pg.evaluate(()=>{
   FX_HISTORY["2025-01"]={TWD:32.8};
   FX_HISTORY["2026-03"]={TWD:31.9};
   return {jan:fxRateAt('TWD','2025-01-10'), feb:fxRateAt('TWD','2025-02-20'),
           mar:fxRateAt('TWD','2026-03-15'), aug:fxRateAt('TWD','2026-08-20'),
           before:fxRateAt('TWD','2024-06-01'), jpy:fxRateAt('JPY','2025-01-10')};
 });
 eq(r.jan,{rate:32.8,asof:'2025-01-01'},'January drink uses the January anchor');
 eq(r.feb,{rate:32.8,asof:'2025-01-01'},'February falls back to the newest anchor at or before it');
 eq(r.mar,{rate:31.9,asof:'2026-03-01'},'March 2026 picks the later anchor');
 eq(r.aug,{rate:31.9,asof:'2026-03-01'},'August still on the newest anchor, not the table');
 eq(r.before,{rate:31.5,asof:'2026-08-25'},'a date before every anchor falls back to the table');
 eq(r.jpy,{rate:147,asof:'2026-08-25'},'a currency with no anchor is unaffected');

 // ---- the real Taipei drink, backdated ---------------------------------
 r=await pg.evaluate(()=>{
   isAdmin=true; cafes=[]; editId=null; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm(); formCC="TW"; refreshRowCcy();
   $("f-name").value="Oolong Tea Project";
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Cheese Foam Ruby Oolong";
   const dd=dr.querySelector(".dd"); dd.value="2025-01-10"; syncDatePill(dd);
   const dp=dr.querySelector(".dp"); dp.value="65"; dp.dispatchEvent(new Event("input"));
   return {rate:dr.querySelector(".dpr").value, asof:dr.querySelector(".dpd").value,
           hint:dr.querySelector(".convhint").textContent};
 });
 eq({r:r.rate,a:r.asof},{r:'32.8',a:'2025-01-01'},'backdated visit picks up the January rate');
 eq(/≈ \$1\.98/.test(r.hint),true,'…and converts at it: NT$65 -> $1.98, not $2.06 — got: '+r.hint);

 r=await pg.evaluate(()=>{ saveForm(); const d=cafes[0].drinks[0]; return {p:d.p,pl:d.pl,pc:d.pc,pr:d.pr,pd:d.pd}; });
 eq(r,{p:'1.98',pl:'65',pc:'TWD',pr:32.8,pd:'2025-01-01'},'saved with the January rate and its real date');

 // ---- changing the date re-rates; a saved rate does not ------------------
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; openForm(); formCC="TW"; refreshRowCcy();
   $("f-name").value="X";
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Tea";
   const dp=dr.querySelector(".dp"); dp.value="65"; dp.dispatchEvent(new Event("input"));
   const a=dr.querySelector(".dpr").value;
   const dd=dr.querySelector(".dd"); dd.value="2025-01-10"; syncDatePill(dd);
   return {today:a, afterBackdating:dr.querySelector(".dpr").value};
 });
 eq(r,{today:'31.9',afterBackdating:'32.8'},'correcting the date corrects the rate');

 r=await pg.evaluate(()=>{
   cafes=[{id:'t1',name:'Beard Cup',cc:'TW',lat:25.04,lng:121.5,tags:[],
           drinks:[{n:'Honey Lemon',p:'1.27',pl:'40',pc:'TWD',pr:31.5,pd:'2026-08-25',dates:['2025-01-10'],elo:1180,matches:7}]}];
   editId='t1'; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm('t1');
   $("f-review").value="just editing the note";
   saveForm(); const d=cafes[0].drinks[0];
   return {p:d.p,pr:d.pr,pd:d.pd,elo:d.elo};
 });
 eq(r,{p:'1.27',pr:31.5,pd:'2026-08-25',elo:1180},'a saved drink keeps its frozen rate — no silent re-pricing');

 // ---- staleness is stated, not hidden -----------------------------------
 r=await pg.evaluate(()=>{
   delete FX_HISTORY["2025-01"]; delete FX_HISTORY["2026-03"];
   cafes=[]; editId=null; _formSnap=null; openForm(); formCC="TW"; refreshRowCcy();
   $("f-name").value="Y";
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Tea";
   const dd=dr.querySelector(".dd"); dd.value="2025-01-10"; syncDatePill(dd);
   const dp=dr.querySelector(".dp"); dp.value="65"; dp.dispatchEvent(new Event("input"));
   return dr.querySelector(".convhint").textContent;
 });
 eq(/no .*2025.* rate on file/.test(r),true,'with no anchor, the form says the rate is a stand-in — got: '+r);

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
