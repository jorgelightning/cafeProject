const { serve, launch, checker, ROOT } = require("./harness");
const { eq, done } = checker();

(async()=>{
 const srv=await serve();
  const b=await launch();
  const pg=await b.newPage();
  // keep the run offline and deterministic: Maps is referrer-locked anyway
  await pg.route('**://**', r => r.request().url().startsWith(srv.origin) ? r.continue() : r.abort());
  const errs=[];
  pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
  await pg.waitForTimeout(600);

  // ---- A. new Taipei cafe, priced in NT$ ----------------------------------
  let r=await pg.evaluate(()=>{
    isAdmin=true; cafes=[]; editId=null; picked={lat:25.04,lng:121.50};
    openForm(); formCC="TW"; refreshRowCcy();
    $("f-name").value="Oolong Tea Project";
    const dr=document.querySelector("#f-drinks .dr");
    dr.querySelector(".dn").value="Cheese Foam Ruby Oolong";
    const dp=dr.querySelector(".dp"); dp.value="65";
    dp.dispatchEvent(new Event("input"));
    const sel=dr.querySelector(".dpc");
    return {ccy:sel.value, hidden:sel.hidden, hint:dr.querySelector(".convhint").textContent,
            rate:dr.querySelector(".dpr").value};
  });
  eq(r.ccy,'TWD','A: chip picked up TWD from cc=TW');
  eq(r.hidden,false,'A: chip visible at a non-USD cafe');
  eq(r.rate,'31.5','A: rate frozen onto the row');
  eq(/≈ \$2\.06/.test(r.hint)&&/NT\$31\.5 = \$1/.test(r.hint),true,'A: live hint shows ≈$2.06 and the rate — got: '+r.hint);

  r=await pg.evaluate(()=>{ saveForm(); const c=cafes[0]; return {cc:c.cc,d:c.drinks[0]}; });
  eq(r.cc,'TW','A: cafe remembers its country');
  eq(r.d.p,'2.06','A: stored USD matches the hand-converted value already in cafes.json');
  eq({pl:r.d.pl,pc:r.d.pc,pr:r.d.pr},{pl:'65',pc:'TWD',pr:31.5},'A: local amount, currency and rate all stored');
  eq(typeof r.d.pd,'string','A: rate date stored');

  // ---- B. legacy USD drink survives an edit unchanged ---------------------
  r=await pg.evaluate(()=>{
    cafes=[{id:'x1',name:'Local Joe',area:'Honolulu',lat:21.3,lng:-157.8,drinks:[{n:'Latte',p:'6.50'}],tags:[],rating:4}];
    editId='x1'; picked={lat:21.3,lng:-157.8};
    openForm('x1');
    const dr=document.querySelector("#f-drinks .dr");
    const shown=dr.querySelector(".dp").value, ccy=dr.querySelector(".dpc").value;
    saveForm();
    return {shown, ccy, d:cafes[0].drinks[0], keys:Object.keys(cafes[0].drinks[0])};
  });
  eq(r.shown,'6.50','B: legacy price shown as-is');
  eq(r.ccy,'USD','B: a price with no recorded currency stays dollars');
  eq(r.keys.filter(k=>['pl','pc','pr','pd'].includes(k)),[],'B: no currency keys added to a USD drink');
  eq(r.d.p,'6.50','B: value unchanged through a full edit round-trip');

  // ---- C. THE TRAP: edit must not destroy Elo *or* the new fields ---------
  r=await pg.evaluate(()=>{
    cafes=[{id:'x2',name:'Beard Cup',area:'Taipei',cc:'TW',lat:25.04,lng:121.50,tags:[],rating:5,
            drinks:[{n:'Honey Lemon',p:'1.27',pl:'40',pc:'TWD',pr:31.5,pd:'2026-08-25',elo:1180,matches:7}]}];
    editId='x2'; picked={lat:25.04,lng:121.50};
    openForm('x2');
    const dr=document.querySelector("#f-drinks .dr");
    const shown=dr.querySelector(".dp").value, ccy=dr.querySelector(".dpc").value;
    $("f-review").value="edited the notes, not the price";
    saveForm();
    return {shown, ccy, d:cafes[0].drinks[0]};
  });
  eq(r.shown,'40','C: form shows the NT$ amount, not the dollar one');
  eq(r.ccy,'TWD','C: currency round-trips through the form');
  eq({elo:r.d.elo,matches:r.d.matches},{elo:1180,matches:7},'C: Elo ledger survives the edit');
  eq({p:r.d.p,pl:r.d.pl,pc:r.d.pc,pr:r.d.pr,pd:r.d.pd},
     {p:'1.27',pl:'40',pc:'TWD',pr:31.5,pd:'2026-08-25'},'C: price fields survive, 2026 rate NOT re-taken');

  // ---- D. rows collapsing by name keep amount+currency together -----------
  // driven the way a user drives it: blank rows from the "+" button, then typing
  r=await pg.evaluate(()=>{
    cafes=[]; editId=null; picked={lat:35.68,lng:139.76};
    openForm(); formCC="JP"; refreshRowCcy();
    $("f-name").value="Tokyo Coffee";
    const fill=(dr,name,price,date)=>{
      dr.querySelector(".dn").value=name;
      dr.querySelector(".dd").value=date;
      const dp=dr.querySelector(".dp"); dp.value=price; dp.dispatchEvent(new Event("input"));
    };
    // first visit: same drink, no price recorded
    fill(document.querySelector("#f-drinks .dr"),"Hojicha Latte","","2026-03-01");
    // second visit: priced, via the + button's blank row
    addDrinkRow("","",localToday());
    const rows=[...document.querySelectorAll("#f-drinks .dr")];
    fill(rows[rows.length-1],"Hojicha Latte","500","2026-04-02");
    const ccy=rows[rows.length-1].querySelector(".dpc").value;
    saveForm();
    const d=cafes[0].drinks[0];
    return {ccy,n:d.n,p:d.p,pl:d.pl,pc:d.pc,pr:d.pr,dates:d.dates,nDrinks:cafes[0].drinks.length};
  });
  eq(r.ccy,'JPY','D: blank row from the + button inherits the cafe currency');
  eq(r.nDrinks,1,'D: rows collapsed by name');
  eq({p:r.p,pl:r.pl,pc:r.pc},{p:'3.40',pl:'500',pc:'JPY'},'D: amount and currency collapsed as one unit');
  eq(r.dates,['2026-03-01','2026-04-02'],'D: both visit dates kept');

  eq(errs,[],'no page errors');
 const ok=done();
  await b.close(); srv.close(); process.exit(ok?0:1);
})().catch(e=>{console.error(e);process.exit(1);});
