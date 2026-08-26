const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:860}});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 pg.on('dialog',async d=>{ await d.accept(); });
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 const wishCafe=()=>({id:'w1',name:'Fuglen Tokyo',area:'Shibuya',lat:35.68,lng:139.76,
                      wish:true,review:'Heard the hojicha is good',tags:['matcha'],drinks:[]});

 // ---- "Log a drink here" on a wishlist cafe ------------------------------
 let r=await pg.evaluate(async(c)=>{
   isAdmin=true; cafes=[c]; curId='w1'; editId=null; _formSnap=null;
   openDetail('w1');
   logDrinkHere();
   await new Promise(r=>setTimeout(r,250));
   const f=$("f-drinks").closest(".field");
   return {ticked:$("f-wish").checked, mode:$("pane-form").dataset.wish,
           drinksVisible:f.getBoundingClientRect().height>0,
           focused:document.activeElement&&document.activeElement.className};
 },wishCafe());
 eq(r.ticked,false,'logging a drink unticks the wishlist box');
 eq(r.mode,'','…and leaves wishlist mode');
 eq(r.drinksVisible,true,'…so the drinks field is actually on screen');
 eq(r.focused,'dn','…with the new drink name focused, as before');

 r=await pg.evaluate(()=>{
   const rows=document.querySelectorAll("#f-drinks .dr"); const last=rows[rows.length-1];
   last.querySelector(".dn").value="Hojicha Latte";
   const dp=last.querySelector(".dp"); dp.value="500"; dp.dispatchEvent(new Event("input"));
   saveForm(); const c=cafes[0];
   return {wish:c.wish,drinks:c.drinks.length,n:c.drinks[0].n,review:c.review,tags:c.tags};
 });
 eq({w:r.wish,d:r.drinks},{w:false,d:1},'saved with a drink and off the wishlist');
 eq({rv:r.review,t:r.tags},{rv:'Heard the hojicha is good',t:['matcha']},'the note and tags you saved it with survive');

 // ---- a separate visit merging into a wishlist cafe ----------------------
 r=await pg.evaluate((c)=>{
   cafes=[c]; editId=null; curId=null; picked={lat:35.68,lng:139.76}; _formSnap=null;
   openForm();                                   // brand new entry, same place
   $("f-name").value="Fuglen Tokyo"; $("f-area").value="Shibuya";
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Cold Brew";
   const dp=dr.querySelector(".dp"); dp.value="600"; dp.dispatchEvent(new Event("input"));
   saveForm();
   const x=cafes[0];
   return {n:cafes.length,wish:x.wish,drinks:x.drinks.length};
 },wishCafe());
 eq(r,{n:1,wish:false,drinks:1},'a visit merged into a wishlist cafe takes it off the wishlist');

 // ---- a wishlist cafe with no drinks stays on the wishlist ---------------
 r=await pg.evaluate((c)=>{
   cafes=[c]; editId='w1'; picked={lat:35.68,lng:139.76}; _formSnap=null;
   openForm('w1'); $("f-review").value="Still want to go"; saveForm();
   const x=cafes[0];
   return {wish:x.wish,drinks:x.drinks.length,review:x.review};
 },wishCafe());
 eq(r,{wish:true,drinks:0,review:'Still want to go'},'editing the note leaves it on the wishlist');

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
