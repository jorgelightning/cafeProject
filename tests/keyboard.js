const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:900},deviceScaleFactor:2});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(700);

 // real data, real list render
 let r=await pg.evaluate(async()=>{
   cafes=await (await fetch('cafes.json')).json();
   isAdmin=true; applyMode(); show('list'); renderList();
   const cards=[...document.querySelectorAll('.card')];
   const chips=[...document.querySelectorAll('#pane-list .chip')];
   return {
     cards:cards.length,
     cardsFocusable:cards.filter(c=>c.getAttribute('tabindex')==='0'&&c.getAttribute('role')==='button').length,
     chips:chips.length,
     chipsFocusable:chips.filter(c=>c.getAttribute('tabindex')==='0').length,
     leftover:[...document.querySelectorAll('[onclick]')].filter(e=>
        (e.tagName==='SPAN'||e.tagName==='DIV') && e.getAttribute('tabindex')!=='0'
        && !e.classList.contains('ch-scrim')).length
   };
 });
 eq(r.cardsFocusable,r.cards,'every one of the '+r.cards+' cafe cards is focusable');
 eq(r.chipsFocusable,r.chips,'every one of the '+r.chips+' filter chips is focusable');
 eq(r.leftover,0,'no clickable span/div left without keyboard access (scrim excluded)');

 // Tab actually reaches a card, and Enter opens it
 r=await pg.evaluate(()=>{
   const card=document.querySelector('.card'); card.focus();
   const s=getComputedStyle(card);
   return {focused:document.activeElement===card, outline:s.outlineWidth+' '+s.outlineStyle};
 });
 eq(r.focused,true,'a card takes focus');
 eq(r.outline,'3px solid','…with a visible focus ring');

 r=await pg.evaluate(async()=>{
   document.querySelector('.card').focus();
   const id=document.activeElement.getAttribute('data-id');
   document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
   await new Promise(r=>setTimeout(r,200));
   return {view:app.dataset.view, opened:curId===id};
 });
 eq(r,{view:'detail',opened:true},'Enter on a focused card opens that cafe');

 // Space activates too, and does not scroll
 r=await pg.evaluate(async()=>{
   show('list'); renderList();
   const chip=document.querySelector('#pane-list .chip'); chip.focus();
   let scrolled=false; const ev=new KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});
   chip.dispatchEvent(ev);
   await new Promise(r=>setTimeout(r,150));
   return {defaultPrevented:ev.defaultPrevented};
 });
 eq(r.defaultPrevented,true,'Space activates without scrolling the page');

 // the star rating in the form
 r=await pg.evaluate(()=>{
   editId=null; _formSnap=null; openForm();
   const stars=[...document.querySelectorAll('#f-rate span')];
   return {n:stars.length, focusable:stars.filter(s=>s.getAttribute('tabindex')==='0').length};
 });
 eq({n:r.n,f:r.focusable},{n:5,f:5},'all five rating stars are reachable');

 // A2 landed
 r=await pg.evaluate(()=>{
   const hint=document.querySelector('.hintbtn');
   return getComputedStyle(hint).color;
 });
 eq(r,'rgb(168, 85, 26)','.hintbtn now uses --acc-strong (#a8551a), not --acc');

 eq(errs,[],'no page errors');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
