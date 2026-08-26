// The reverse geocode is gone (Geocoding API is metered). What replaces it:
// Places gives the country free for searched cafes; anything else is picked once by hand
// and remembered on the cafe.
const { serve, launch, checker, ROOT } = require("./harness");
const fs = require("fs");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage();
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // nothing in the app may touch the metered API any more
 // strip comments first — the file explains WHY there is no Geocoder call, in prose
 const src=fs.readFileSync(ROOT+'/js/form.js','utf8')
   .replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
 eq(/new\s+google\.maps\.Geocoder/.test(src),false,'no Geocoder call in the code');
 eq(/Geocoder/.test(fs.readFileSync(ROOT+'/js/core.js','utf8')),false,'none in core.js either');

 eq(await pg.evaluate(()=>ccyFor({cc:'TW'})),'TWD','country still drives currency when known');
 eq(await pg.evaluate(()=>ccyFor({ccy:'JPY',cc:'US'})),'JPY','a hand-picked currency outranks the country');
 eq(await pg.evaluate(()=>ccyFor({ccy:'NOPE',cc:'TW'})),'TWD','a junk override falls back to the country');
 eq(await pg.evaluate(()=>ccyFor({})),'USD','nothing known -> USD');

 // an existing cafe with no country: chip is offered, choice sticks
 let r=await pg.evaluate(()=>{
   isAdmin=true;
   cafes=[{id:'v1',name:'Milksha Ximending',area:'Ximen',lat:25.04,lng:121.5,tags:[],drinks:[]}];
   editId='v1'; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm('v1');
   const dr=document.querySelector("#f-drinks .dr");
   const sel=dr.querySelector(".dpc");
   return {shown:!sel.hidden, start:sel.value};
 });
 eq(r,{shown:true,start:'USD'},'no country on file -> the chip is visible to pick from');

 r=await pg.evaluate(()=>{
   const dr=document.querySelector("#f-drinks .dr");
   const sel=dr.querySelector(".dpc"); sel.value="TWD"; syncCcy(sel);
   dr.querySelector(".dn").value="Pearl Earl Grey";
   const dp=dr.querySelector(".dp"); dp.value="60"; dp.dispatchEvent(new Event("input"));
   saveForm();
   const c=cafes[0];
   return {ccy:c.ccy, pc:c.drinks[0].pc, pl:c.drinks[0].pl, p:c.drinks[0].p};
 });
 eq(r.ccy,'TWD','the choice is stored on the cafe, not just the drink');
 eq({pc:r.pc,pl:r.pl},{pc:'TWD',pl:'60'},'and the drink keeps its NT$ amount');

 // reopening never asks again
 r=await pg.evaluate(async()=>{
   editId='v1'; _formSnap=null; openForm('v1');
   addDrinkRow("","",localToday());
   const rows=[...document.querySelectorAll("#f-drinks .dr")];
   return rows[rows.length-1].querySelector(".dpc").value;
 });
 eq(r,'TWD','a NEW drink at that cafe starts on TWD — asked once, never again');

 // a searched cafe still gets its country free from the Places response
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; formCC=""; formCcy=""; openForm();
   formCC="CA"; refreshRowCcy();          // what the Autocomplete handler does
   const dr=document.querySelector("#f-drinks .dr");
   return {chip:dr.querySelector(".dpc").value, hidden:dr.querySelector(".dpc").hidden};
 });
 eq(r,{chip:'CAD',hidden:false},'Vancouver via Places still auto-picks CAD, no metered call');

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
