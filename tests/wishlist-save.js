const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:860}});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 let dialog=null, answer='accept';
 pg.on('dialog',async d=>{ dialog=d.message(); await (answer==='accept'?d.accept():d.dismiss()); });
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // ---- field order --------------------------------------------------------
 let r=await pg.evaluate(()=>{
   isAdmin=true; cafes=[]; editId=null; picked=null; _formSnap=null; openForm();
   const f=[...document.querySelectorAll("#pane-form .form .field")];
   return {wish:f.findIndex(x=>x.querySelector("#f-wish")), custom:f.findIndex(x=>x.querySelector("#f-custom"))};
 });
 eq(r,{wish:1,custom:2},'name, then wishlist, then private spot');

 await pg.evaluate(()=>{ $("f-wish").checked=true; syncWishMode(); });
 r=await pg.evaluate(()=>$("f-custom").closest(".field").getBoundingClientRect().height>0);
 eq(r,true,'private spot stays visible in wishlist mode (a friend\'s place can be unvisited too)');

 // ---- a new wishlist entry drops the visit data --------------------------
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; openForm();
   $("f-name").value="Fuglen Tokyo";
   const dr=document.querySelector("#f-drinks .dr");           // typed BEFORE deciding
   dr.querySelector(".dn").value="Hojicha Latte";
   const dp=dr.querySelector(".dp"); dp.value="500"; dp.dispatchEvent(new Event("input"));
   formRating=4; formPhoto="https://example.com/x.jpg"; formTags=["matcha"];
   $("f-fav").checked=true;
   $("f-wish").checked=true; syncWishMode();                   // ...then ticked wishlist
   $("f-review").value="Heard the hojicha is good";
   saveForm(); const c=cafes[0];
   return {wish:c.wish,drinks:c.drinks.length,rating:c.rating,photo:c.photo,fav:c.fav,
           tags:c.tags,review:c.review};
 });
 eq({d:r.drinks,rt:r.rating,ph:r.photo,fv:r.fav},{d:0,rt:0,ph:null,fv:false},'drinks, rating, photo and favourite all dropped');
 eq({w:r.wish,t:r.tags,rv:r.review},{w:true,t:['matcha'],rv:'Heard the hojicha is good'},'wish, tags and notes kept');

 // ---- editing a real cafe: declining the prompt changes nothing ----------
 const seed=()=>pg.evaluate(()=>{
   cafes=[{id:'v1',name:'Milksha Ximending',area:'Ximen',cc:'TW',lat:25.04,lng:121.5,rating:5,fav:true,
           photo:'https://example.com/p.jpg',tags:['matcha'],wish:false,
           drinks:[{n:'Pearl Earl Grey',p:'1.90',elo:1180,matches:7},{n:'Honey Lemon',p:'1.27'}]}];
   editId='v1'; picked={lat:25.04,lng:121.5}; _formSnap=null;
   openForm('v1'); $("f-wish").checked=true; syncWishMode();
 });
 answer='dismiss'; dialog=null;
 await seed();
 r=await pg.evaluate(()=>{ saveForm(); const c=cafes[0];
   return {drinks:c.drinks.length,rating:c.rating,wish:c.wish,elo:c.drinks[0].elo}; });
 eq(/2 logged drinks/.test(dialog||'')&&/rating/.test(dialog||''),true,'prompt names exactly what would be lost — got: '+JSON.stringify(dialog));
 eq(r,{drinks:2,rating:5,wish:false,elo:1180},'declining leaves the cafe completely untouched');

 // ---- ...and accepting does what it said ---------------------------------
 answer='accept'; dialog=null;
 await seed();
 r=await pg.evaluate(()=>{ saveForm(); const c=cafes[0];
   return {drinks:c.drinks.length,rating:c.rating,fav:c.fav,photo:c.photo,wish:c.wish,tags:c.tags}; });
 eq(r,{drinks:0,rating:0,fav:false,photo:null,wish:true,tags:['matcha']},'accepting clears the visit, keeps the place');

 // ---- a cafe with no history needs no prompt -----------------------------
 answer='accept'; dialog=null;
 r=await pg.evaluate(()=>{
   cafes=[{id:'v2',name:'Somewhere New',lat:1,lng:1,tags:[],drinks:[]}];
   editId='v2'; picked={lat:1,lng:1}; _formSnap=null;
   openForm('v2'); $("f-wish").checked=true; syncWishMode(); saveForm();
   return cafes[0].wish;
 });
 eq({wish:r,prompted:dialog!==null},{wish:true,prompted:false},'no prompt when there is nothing to lose');

 // ---- normal visit still saves everything --------------------------------
 r=await pg.evaluate(()=>{
   cafes=[]; editId=null; _formSnap=null; openForm();
   $("f-name").value="Local Joe"; $("f-fav").checked=true; formRating=4;
   const dr=document.querySelector("#f-drinks .dr");
   dr.querySelector(".dn").value="Latte";
   const dp=dr.querySelector(".dp"); dp.value="6.50"; dp.dispatchEvent(new Event("input"));
   saveForm(); const c=cafes[0];
   return {fav:c.fav,wish:c.wish,rating:c.rating,p:c.drinks[0].p};
 });
 eq(r,{fav:true,wish:false,rating:4,p:'6.50'},'normal visit unaffected');

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
