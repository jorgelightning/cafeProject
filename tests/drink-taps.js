const {serve,launch,checker}=require('./harness');
const {eq,done}=checker();
(async()=>{
 const srv=await serve(), browser=await launch();
 try{
  const pg=await browser.newPage({viewport:{width:360,height:800},hasTouch:true});
  await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
  await pg.goto(srv.origin+'/index.html'); await pg.waitForTimeout(500);
  await pg.evaluate(()=>{isAdmin=true;cafes=[];openForm();$('f-name').value='Tap test';document.querySelector('.dn').value='Latte';});
  eq(await pg.locator('#f-drinks input[type=range]').count(),0,'no sliders can catch a scrolling gesture');
  eq(await pg.evaluate(()=>[...document.querySelectorAll('.optionvalue')].map(x=>x.dataset.set)),['0','0','0'],'untouched options are unset');
  await pg.getByRole('button',{name:'Increase size by 2 ounces'}).click();
  await pg.getByRole('button',{name:'0%',exact:true}).click();
  await pg.getByRole('button',{name:'Less ice',exact:true}).click();
  const result=await pg.evaluate(()=>{saveForm();const d=cafes[0].drinks[0];return [d.size,d.sweet,d.ice];});
  eq(result,['18 oz','0%','Less ice'],'taps save selected size, zero sweetness and ice');
  await pg.evaluate(()=>{openForm(cafes[0].id);const g=document.querySelector('.drgroup');toggleDrinkGroup(g.querySelector('.drghead'));toggleDrinkRow(g.querySelector('.drhead'));});
  await pg.getByRole('spinbutton',{name:'Custom sweetness percentage'}).fill('30');
  eq(await pg.evaluate(()=>{saveForm();openForm(cafes[0].id);return document.querySelector('.sweetcustom').value;}),'30','custom percentages round trip');
  await pg.evaluate(()=>{const g=document.querySelector('.drgroup');toggleDrinkGroup(g.querySelector('.drghead'));toggleDrinkRow(g.querySelector('.drhead'));});
  eq(await pg.evaluate(()=>[...document.querySelectorAll('.drinkoption')].every(x=>x.scrollWidth<=x.clientWidth+1)),true,'controls fit a 360px phone');
  await pg.getByRole('spinbutton',{name:'Custom sweetness percentage'}).fill('150');
  eq(await pg.evaluate(()=>{saveForm();return cafes[0].drinks[0].sweet;}),'30%','invalid custom percentage cannot overwrite the saved order');
  await pg.locator('.drinkoption').nth(1).getByRole('button',{name:'Clear',exact:true}).click();
  eq(await pg.evaluate(()=>{saveForm();return cafes[0].drinks[0].sweet||'';}),'','Clear removes sweetness');
  process.exitCode=done()?0:1;
 }finally{await browser.close();srv.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
