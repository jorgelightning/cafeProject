const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();
(async()=>{
 const srv=await serve();
 const b=await launch();
 const ctx=await b.newContext({viewport:{width:430,height:900}});
 const pg=await ctx.newPage();
 // externals are unreachable from here anyway; abort them so timings stay sane
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});

 // wait for the worker to take control
 const reg=await pg.evaluate(async()=>{
   if(!('serviceWorker' in navigator))return 'unsupported';
   const r=await navigator.serviceWorker.ready;
   if(!r.active)return 'no active worker';
   if(r.active.state==='activated')return 'activated';
   await new Promise(res=>{ const t=setTimeout(res,3000);
     r.active.addEventListener('statechange',function(){ if(r.active.state==='activated'){ clearTimeout(t); res(); } }); });
   return r.active.state;
 });
 eq(reg,'activated','the service worker installs and activates');

 const cached=await pg.evaluate(async()=>{
   const names=await caches.keys();
   const c=await caches.open(names[0]);
   const keys=(await c.keys()).map(r=>new URL(r.url).pathname+new URL(r.url).search);
   return {cache:names[0], n:keys.length,
           html:keys.some(k=>k.endsWith('index.html')||k.endsWith('/')),
           core:keys.some(k=>k.includes('js/core.js')),
           css:keys.some(k=>k.includes('styles.css')),
           chk:keys.some(k=>k.includes('_chk'))};
 });
 eq(cached.cache,'cafemap-v25','cache is versioned with the asset string');
 eq({h:cached.html,c:cached.core,s:cached.css},{h:true,c:true,s:true},'shell precached ('+cached.n+' entries)');
 eq(cached.chk,false,'the update-check request is never cached');

 // THE POINT: pull the network and reload
 await ctx.setOffline(true);
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.reload({waitUntil:'load'});
 await pg.waitForTimeout(900);
 const offline=await pg.evaluate(()=>({
   booted:!!document.getElementById('app'),
   scriptsRan:typeof openDetail==='function'&&typeof saveCafe==='function',
   view:document.getElementById('app').dataset.view||'(none)',
   tabbar:!!document.querySelector('.tabbar')
 }));
 eq(offline.booted,true,'OFFLINE: the page still loads');
 eq(offline.scriptsRan,true,'OFFLINE: all twelve scripts ran from cache');
 eq(offline.tabbar,true,'OFFLINE: the styled shell is there');

 // data falls back too
 const data=await pg.evaluate(async()=>{
   try{ const r=await fetch('cafes.json?t='+Date.now()); const j=await r.json(); return {ok:true,n:j.length}; }
   catch(e){ return {ok:false,err:String(e)}; }
 });
 eq(data.ok&&data.n>0,true,'OFFLINE: cafes.json served from cache ('+(data.n||0)+' cafes)');

 await ctx.setOffline(false);
 eq(errs.filter(e=>!/Failed to fetch|NetworkError|net::/i.test(e)),[],'no unexpected page errors offline');
 const ok=done();
 await b.close();srv.close();process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
