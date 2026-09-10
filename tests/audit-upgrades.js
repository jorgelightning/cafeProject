const {serve,launch,checker}=require('./harness');const {eq,done}=checker();
(async()=>{const srv=await serve(),b=await launch();try{
 const p=await b.newPage({viewport:{width:375,height:812}});await p.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());await p.goto(srv.origin+'/index.html');await p.waitForTimeout(500);
 await p.evaluate(()=>{isAdmin=true;cafes=[{id:'x',name:'A very long cafe name for the compact list',area:'Honolulu',lat:21.3,lng:-157.8,rating:5,drinks:[{n:'Latte',orders:[{date:'2026-01-01',p:'5'},{date:'2026-02-01',p:'6'}]},{n:'Tea',orders:[{date:'2026-01-02',p:'4'}]}]}];applyMode();openForm('x');});
 let r=await p.evaluate(()=>{const before=formDirty();const g=document.querySelectorAll('.drgroup')[1];toggleDrinkGroup(g.querySelector('.drghead'));toggleDrinkRow(g.querySelector('.drhead'));return {before,after:formDirty()};});eq(r,{before:false,after:false},'opening another order is not an edit');
 r=await p.evaluate(()=>{saveForm();const ids=cafes[0].drinks.flatMap(d=>d.orders.map(o=>o.id));openForm('x');saveForm();const again=cafes[0].drinks.flatMap(d=>d.orders.map(o=>o.id));return {unique:new Set(ids).size===ids.length,stable:JSON.stringify(ids.sort())===JSON.stringify(again.sort())};});eq(r,{unique:true,stable:true},'order IDs persist through edits');
 eq(await p.evaluate(()=>lastVisitedStr({updated:new Date().toISOString(),drinks:[]})),'No visit date','metadata edit is not reported as a visit');
 await p.evaluate(()=>{show('list');toggleListLayout();});
 for(const width of [360,375,1024]){await p.setViewportSize({width,height:812});eq(await p.evaluate(()=>{const c=document.querySelector('.card');return c.scrollWidth<=c.clientWidth+1;}),true,'compact card fits '+width+'px');}
 await p.setViewportSize({width:375,height:812});
 await p.evaluate(()=>{show('stats');setStatsArea('Honolulu');});eq(await p.locator('.stats-location small').innerText(),'Distances from Honolulu','Stats identifies selected origin');
 r=await p.evaluate(()=>{openForm('x');const g=document.querySelector('.drgroup');toggleDrinkGroup(g.querySelector('.drghead'));toggleDrinkRow(g.querySelector('.drhead'));const row=document.querySelector('.dr:not(.collapsed)');return {height:row.getBoundingClientRect().height,fits:row.scrollWidth<=row.clientWidth+1,milks:row.querySelector('.dmk').options.length};});
 eq(r.fits,true,'full editor fits phone width');eq(r.height<1027,true,'editor is shorter than audited 1027px');eq(r.milks,12,'milk selector retains all options plus unset');
  console.log('editor height:',r.height);
 process.exitCode=done()?0:1;
}finally{await b.close();srv.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
