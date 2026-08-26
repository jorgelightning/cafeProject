const { serve, launch, checker, ROOT } = require("./harness");
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

 const vis=id=>pg.evaluate(i=>{const e=document.getElementById(i); if(!e)return null;
   const f=e.closest(".field")||e; return f.getBoundingClientRect().height>0;},id);

 // ---- position + reachability -------------------------------------------
 let r=await pg.evaluate(()=>{
   isAdmin=true; cafes=[]; editId=null; picked=null; _formSnap=null;
   openForm(); $("f-name").value="Fuglen Tokyo";
   const fields=[...document.querySelectorAll("#pane-form .form .field")];
   return {wIdx:fields.findIndex(f=>f.querySelector("#f-wish"))};
 });
 eq(r.wIdx,1,'wishlist is the 2nd field, under the cafe name');

 // ---- ticking it hides the visit fields, keeps notes ---------------------
 await pg.evaluate(()=>{ $("f-wish").checked=true; syncWishMode(); });
 eq(await vis('f-photodrop'),false,'drink photo hidden');
 eq(await vis('f-drinks'),   false,'drinks hidden');
 eq(await vis('f-rate'),     false,'rating hidden');
 eq(await vis('f-tags'),     false,'tags hidden');
 eq(await vis('f-fav'),      false,'favourite hidden');
 eq(await vis('f-review'),   true, 'notes box KEPT');
 eq(await vis('f-wish'),     true, 'wishlist tick itself stays');
 eq(await vis('f-area'),     true, 'cafe details stay (area)');

 r=await pg.evaluate(()=>({lab:$("f-review-label").textContent, ph:$("f-review").placeholder}));
 eq(r.lab,'Notes','label stops calling it a review');
 eq(r.ph,'Why you want to go, what to order…','placeholder fits a place you have not been');

 r=await pg.evaluate(()=>{
   const sb=document.querySelector(".savebar").getBoundingClientRect();
   return {save:sb.top>=0&&sb.bottom<=window.innerHeight+1,
           scrolled:document.querySelector("#pane-form .scroll").scrollTop};
 });
 eq({save:r.save,scrolled:r.scrolled},{save:true,scrolled:0},'Save reachable with nothing scrolled');

 // ---- unticking restores ------------------------------------------------
 await pg.evaluate(()=>{ $("f-wish").checked=false; syncWishMode(); });
 eq(await vis('f-drinks'),true,'unticking brings the drinks back');
 r=await pg.evaluate(()=>$("f-review-label").textContent);
 eq(r,'Review / thoughts','label restored');

 // ---- hidden means hidden, not cleared ----------------------------------
 r=await pg.evaluate(()=>{
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Hojicha Latte";
   const dp=dr.querySelector(".dp"); dp.value="500"; dp.dispatchEvent(new Event("input"));
   $("f-wish").checked=true; syncWishMode();          // typed, then decided it's a wishlist
   $("f-wish").checked=false; syncWishMode();          // ...changed mind back
   const d=document.querySelector("#f-drinks .dr");
   return {n:d.querySelector(".dn").value, p:d.querySelector(".dp").value};
 });
 eq(r,{n:'Hojicha Latte',p:'500'},'typed input survives a round trip through wishlist mode');

 // ---- saving a wishlist entry -------------------------------------------
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; openForm();
   $("f-name").value="Fuglen Tokyo";
   $("f-wish").checked=true; syncWishMode();
   $("f-review").value="Heard the hojicha is good";
   saveForm(); const c=cafes[0];
   return {wish:c.wish, review:c.review, drinks:c.drinks.length, fav:c.fav};
 });
 eq(r,{wish:true,review:'Heard the hojicha is good',drinks:0,fav:false},'wishlist entry saves with its note');

 // ---- reopening an existing wishlist cafe starts in the right mode ------
 r=await pg.evaluate(()=>{
   cafes=[{id:'w1',name:'Fuglen Tokyo',wish:true,review:'Heard the hojicha is good',lat:35.68,lng:139.76,tags:[],drinks:[]}];
   editId='w1'; _formSnap=null; openForm('w1');
   return {wish:$("pane-form").dataset.wish, lab:$("f-review-label").textContent};
 });
 eq(r,{wish:'1',lab:'Notes'},'reopening a wishlist cafe restores wishlist mode');
 eq(await vis('f-drinks'),false,'…with the visit fields still hidden');

 // ---- a normal visit is untouched ---------------------------------------
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; openForm();
   $("f-name").value="Local Joe"; $("f-fav").checked=true;
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Latte";
   const dp=dr.querySelector(".dp"); dp.value="6.50"; dp.dispatchEvent(new Event("input"));
   saveForm(); const c=cafes[0];
   return {fav:c.fav,wish:c.wish,p:c.drinks[0].p};
 });
 eq(r,{fav:true,wish:false,p:'6.50'},'normal visit unaffected');

 eq(errs,[],'no page errors');
 await pg.evaluate(()=>{ cafes=[]; editId=null; _formSnap=null; openForm();
   $("f-name").value="Fuglen Tokyo"; $("f-wish").checked=true; syncWishMode();
   $("f-review").value="Heard the hojicha is good"; });
 await pg.waitForTimeout(200);
 await pg.locator('#pane-form').screenshot({path:OUT+'wishmode.png'});
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
