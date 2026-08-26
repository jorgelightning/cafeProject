const { serve, launch, checker, ROOT } = require("./harness");
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:900}});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(700);
 const out=await pg.evaluate(async()=>{
   const real=await (await fetch('cafes.json')).json();
   cafes=real; isAdmin=true;
   let drinks=0, priced=0, local=0, changed=[];
   real.forEach(c=>(c.drinks||[]).forEach(d=>{
     drinks++;
     const got=priceHTML(d);
     // what the old code produced, verbatim
     /* A drink with no local currency must render byte-identically to the pre-currency
        code — that is the promise that let this ship without migrating 60-odd prices.
        A drink that DOES carry one is expected to differ: it gains the second line. */
     const want=(d.pl&&d.pc&&String(d.pc).toUpperCase()!=="USD")
       ? '<span class="prwrap"><span class="pr">'+esc(fmtLocal(d.pl,d.pc))+'</span>'
         +'<span class="prsub">'+esc(fmtPrice(d.p))+'</span></span>'
       : (fmtPrice(d.p)?'<span class="pr">'+esc(fmtPrice(d.p))+'</span>':'');
     if(fmtPrice(d.p))priced++;
     if(d.pl&&d.pc&&String(d.pc).toUpperCase()!=="USD")local++;
     if(got!==want)changed.push({n:d.n,got,want});
   }));
   // every view still renders over the real corpus
   const views=[];
   for(const fn of [['list',()=>renderList()],['stats',()=>renderStats()],['markers-skipped',()=>{}]]){
     try{ fn[1](); views.push(fn[0]+':ok'); }catch(e){ views.push(fn[0]+':ERR '+e.message); }
   }
   // opening the form over a real cafe and saving it back must not alter it
   const c0=real.find(c=>(c.drinks||[]).some(d=>d.p));
   const norm=a=>JSON.stringify((a||[]).map(d=>Object.keys(d).sort().map(k=>k+'='+JSON.stringify(d[k])).join(',')));
   const before=norm(c0.drinks);
   editId=c0.id; picked={lat:c0.lat,lng:c0.lng};
   openForm(c0.id); saveForm();
   const after=norm(cafes.find(c=>c.id===c0.id).drinks);
   return {drinks,priced,local,changed,views,roundtrip:before===after,cafe:c0.name,before,after};
 });
 console.log('drink rows rendered :',out.drinks,'| priced:',out.priced,'| in local currency:',out.local);
 console.log('detail HTML changed :',out.changed.length===0?'none (identical to before)':out.changed);
 console.log('views               :',out.views.join('  '));
 console.log('form round-trip on "'+out.cafe+'":',out.roundtrip?'byte-identical':'CHANGED');
 if(!out.roundtrip){console.log(' before',out.before);console.log(' after ',out.after);}
 console.log('page errors         :',errs.length?errs:'none');
 await b.close();srv.close();
 process.exit((out.changed.length||!out.roundtrip||errs.length)?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
