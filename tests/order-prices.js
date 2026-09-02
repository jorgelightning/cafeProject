const { serve, launch, checker } = require("./harness");
const { eq, done } = checker();

(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:360,height:800}});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(500);

 // Two rows with the same name are one drink, but remain two priced orders.
 let r=await pg.evaluate(()=>{
   isAdmin=true; cafes=[]; editId=null; picked={lat:21.3,lng:-157.8};
   openForm(); $("f-name").value="Price History Cafe"; $("f-area").value="Honolulu";
   const fill=function(dr,price,date,qty){
     dr.querySelector('.dn').value='Hojicha Latte';
     dr.querySelector('.dd').value=date;
     dr.querySelector('.dqt').value=qty||1;
     const dp=dr.querySelector('.dp'); dp.value=price; dp.dispatchEvent(new Event('input'));
   };
   fill(document.querySelector('#f-drinks .dr'),'6.50','2026-06-11',1);
   fill(addDrinkRow('','',localToday()),'7.25','2026-09-02',2);
   saveForm();
   const d=cafes[0].drinks[0];
   return {groups:cafes[0].drinks.length,orders:d.orders,summary:{p:d.p,dates:d.dates,count:d.count}};
 });
 eq(r.groups,1,'same name stays one drink group');
 eq(r.orders.map(o=>({date:o.date,p:o.p,qty:o.qty||1})),[
   {date:'2026-06-11',p:'6.50',qty:1},{date:'2026-09-02',p:'7.25',qty:2}
 ],'each date keeps its own price and quantity');
 eq(r.summary,{p:'7.25',dates:['2026-06-11','2026-09-02'],count:3},'legacy summary reflects latest price and total quantity');

 // Reopening groups the history; changing June does not touch September.
 r=await pg.evaluate(()=>{
   openForm(cafes[0].id);
   const g=document.querySelector('.drgroup');
   const rows=[...g.querySelectorAll('.dr')];
   const june=rows.find(x=>x.querySelector('.dd').value==='2026-06-11');
   const dp=june.querySelector('.dp'); dp.value='6.75'; dp.dispatchEvent(new Event('input'));
   const header=g.querySelector('.drghead').innerText;
   saveForm();
   const d=cafes[0].drinks[0];
   return {groupCount:document.querySelectorAll('.drgroup').length,rowCount:rows.length,header,
           fits:g.querySelector('.drghead').scrollWidth<=g.querySelector('.drghead').clientWidth+1,
           orders:d.orders.map(o=>({date:o.date,p:o.p,qty:o.qty||1})),range:drinkPriceRange(d)};
 });
 eq(r.groupCount,1,'edit form renders one collapsed drink group');
 eq(r.rowCount,2,'group contains two independently editable order rows');
  eq(/3 orders/.test(r.header)&&/\$6\.50–\$7\.25/.test(r.header),true,'group header shows total and price range');
  eq(r.fits,true,'group header fits a 360px phone without horizontal overflow');
 eq(r.orders,[{date:'2026-06-11',p:'6.75',qty:1},{date:'2026-09-02',p:'7.25',qty:2}],
    'editing June leaves September unchanged');
 eq(r.range,{min:6.75,max:7.25,code:'USD'},'range is calculated from order history');

 // Detail and monthly Stats both read the order ledger, including quantity.
 r=await pg.evaluate(()=>{
   openDetail(cafes[0].id);
   const detail=$("d-drinks").innerText;
   isAdmin=true; setRhythmMetric('spend'); setRhythmMonth('2026-06');
   const june=$("stats-body").innerText;
   setRhythmMonth('2026-09');
   const sep=$("stats-body").innerText;
   return {detail,june,sep};
 });
 eq(/Prices \$6\.75–\$7\.25 across 3 orders/.test(r.detail),true,'detail shows the historical price range');
 eq(/\$6\.75 recorded in June/.test(r.june),true,'June Stats uses the June price');
 eq(/\$14\.50 recorded in September/.test(r.sep),true,'September Stats uses September price × quantity');

 // Legacy records still open safely and migrate on the next save.
 r=await pg.evaluate(()=>{
   const d={n:'Latte',p:'5.00',dates:['2025-01-01','2025-02-01'],count:3};
   const before=drinkOrders(d).map(o=>({date:o.date||'',p:o.p,qty:o.qty||1}));
   syncDrinkSummary(d);
   return {before,after:d};
 });
 eq(r.before,[{date:'2025-01-01',p:'5.00',qty:1},{date:'2025-02-01',p:'5.00',qty:2}],
    'legacy dates expand without losing count');
  eq(r.after.count,3,'migrated summary preserves legacy quantity');

 // The in-group action starts a fresh order, and deleting history names its date.
 r=await pg.evaluate(()=>{
   openForm(cafes[0].id);
   const g=document.querySelector('.drgroup');
   toggleDrinkGroup(g.querySelector('.drghead'));
   addOrderToGroup(g.querySelector('.drgadd'));
   const rows=[...g.querySelectorAll('.dr')], fresh=rows[rows.length-1];
   return {rows:rows.length,name:fresh.querySelector('.dn').value,price:fresh.querySelector('.dp').value,
           date:fresh.querySelector('.dd').value,today:localToday(),open:g.classList.contains('open')};
 });
 eq({rows:r.rows,name:r.name,price:r.price,open:r.open},
    {rows:3,name:'Hojicha Latte',price:'',open:true},
    'Add another starts a separate, dated order with a blank price');
 eq(r.date,r.today,'the fresh order defaults to today');
 let dialogText='';
 pg.once('dialog',async d=>{ dialogText=d.message(); await d.dismiss(); });
 r=await pg.evaluate(()=>{
   const june=[...document.querySelectorAll('.drgroup .dr')].find(x=>x.querySelector('.dd').value==='2026-06-11');
   const before=document.querySelectorAll('.drgroup .dr').length;
   delDrinkRow(june.querySelector('.delrow'));
   return {before,after:document.querySelectorAll('.drgroup .dr').length};
 });
 eq(/Hojicha Latte/.test(dialogText)&&/Jun 11, 2026/.test(dialogText),true,'delete confirmation names the drink and exact order date');
 eq(r.after,r.before,'cancelling delete leaves the historical order intact');

  eq(errs,[],'no page errors');
 const ok=done();
 await b.close(); srv.close(); process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
