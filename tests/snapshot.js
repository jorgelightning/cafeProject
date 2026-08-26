// Dumps the exact HTML the three template builders produce, across as many branches as the
// corpus and a set of synthetic edge cases can reach. Run before and after; diff the files.
const { serve, launch, checker, ROOT } = require("./harness");
const fs = require("fs");
const path = require("path");
const out=process.argv[2];
if(!out){ console.error('usage: node tests/snapshot.js <file.json>\n  run before and after a refactor, then diff the two files'); process.exit(2); }
(async()=>{
 const srv=await serve();
 const b=await launch();
 const pg=await b.newPage({viewport:{width:430,height:900}});
 await pg.route('**://**',r=>r.request().url().startsWith(srv.origin)?r.continue():r.abort());
 const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
 await pg.goto(srv.origin+'/index.html',{waitUntil:'load'});
 await pg.waitForTimeout(600);

 const snaps=await pg.evaluate(async()=>{
   const real=await (await fetch('cafes.json')).json();
   const S={};
   isAdmin=true; applyMode();
   try{ userLoc=null; }catch(e){} Object.keys(_imgFail).forEach(function(k){ delete _imgFail[k]; }); gphotoCache={};

   // ---- renderList across sort modes, filters and both roles ----
   cafes=real;
   const modes=['recent','name','rating','near','top'];
   for(const m of modes){
     try{ sortMode=m; }catch(e){}
     for(const st of [{f:false,w:false,c:""},{f:true,w:false,c:""},{f:false,w:true,c:""},{f:false,w:false,c:"tag:matcha"}]){
       favOnly=st.f; wishOnly=st.w; try{ activeChip=st.c; }catch(e){}
       show('list'); renderList();
       S['list|'+m+'|'+st.f+st.w+st.c]=(document.getElementById('grid')||{}).innerHTML||'';
       S['chips|'+m+'|'+st.f+st.w+st.c]=(document.getElementById('chips')||{}).innerHTML||'';
     }
   }
   favOnly=wishOnly=false; try{ activeChip=""; }catch(e){}
   // viewer role changes the copy in several places
   isAdmin=false; applyMode(); show('list'); renderList();
   S['list|viewer']=(document.getElementById('grid')||{}).innerHTML||'';
   isAdmin=true; applyMode();
   // distance branch
   try{ userLoc={lat:21.30,lng:-157.83}; }catch(e){} sortMode='near'; show('list'); renderList();
   S['list|near-with-userloc']=(document.getElementById('grid')||{}).innerHTML||'';
   try{ userLoc=null; }catch(e){}

   // ---- openDetail over every cafe in the corpus ----
   for(const c of real){ try{ openDetail(c.id); S['detail|'+c.id]=document.getElementById('d-drinks').innerHTML
       +'||'+document.getElementById('d-meta').innerHTML
       +'||'+document.getElementById('d-tags').innerHTML
       +'||'+document.getElementById('d-locs').innerHTML; }catch(e){ S['detail|'+c.id]='THREW '+e.message; } }
   // synthetic detail edge cases
   const edge=[
     {id:'e1',name:'Elo & Matches',area:'X',lat:1,lng:1,rating:5,matches:12,elo:1240,tags:['cozy','matcha'],
      drinks:[{n:'A',p:'6.50',reorder:'yes',size:'16 oz',sweet:'50%',ice:'Less ice',milk:'Oat',dates:['2026-01-01','2026-02-02','2026-03-03'],count:5,elo:1200,matches:3},
              {n:'B',p:'1.27',pl:'40',pc:'TWD',pr:31.5,pd:'2025-01-10',reorder:'no',dates:['2025-01-10']},
              {n:'C — needs rate',p:'',pl:'900',pc:'XYZ',reorder:'neutral'}]},
     {id:'e2',name:'No Drinks',lat:2,lng:2,tags:[],drinks:[],custom:true,emoji:'🏠'},
     {id:'e3',name:'Quotes \'n "Marks" <b>',area:'A & B',lat:3,lng:3,tags:['to-go'],drinks:[{n:'It\'s <great>',p:'3'}]}
   ];
   cafes=real.concat(edge);
   for(const c of edge){ try{ openDetail(c.id); S['detail|'+c.id]=document.getElementById('d-drinks').innerHTML
       +'||'+document.getElementById('d-meta').innerHTML+'||'+document.getElementById('d-tags').innerHTML; }
     catch(e){ S['detail|'+c.id]='THREW '+e.message; } }
   isAdmin=false; openDetail('e2'); S['detail|e2|viewer']=document.getElementById('d-drinks').innerHTML;
   isAdmin=true;

   // ---- addDrinkRow across the shapes it handles ----
   const rows=[
     ['','',''],
     ['Latte','6.50','2026-04-01'],
     ['Hojicha','500','2026-04-02',null,null,null,null,false,null,1,{pl:'500',pc:'JPY',pr:147,pd:'2026-08-25'}],
     ['Full','4','2026-04-03','75%','Less ice','16 oz','yes',false,'Oat',3],
     ['Older','2','2025-12-25','0%','Hot','8 oz','no',true,'None',2],
     ['NoDate','9','',null,'Warm',null,'neutral',false,'2%',99]
   ];
   editId=null; _formSnap=null; formCC=''; openForm();
   document.getElementById('f-drinks').innerHTML='';
   rows.forEach(function(a){ addDrinkRow.apply(null,a); });
   S['form|rows|usd']=document.getElementById('f-drinks').innerHTML;
   formCC='TW';
   document.getElementById('f-drinks').innerHTML='';
   rows.forEach(function(a){ addDrinkRow.apply(null,a); });
   S['form|rows|tw']=document.getElementById('f-drinks').innerHTML;
   // renderDrinkRows drives addDrinkRow with real stored drinks
   document.getElementById('f-drinks').innerHTML='';
   renderDrinkRows(edge[0].drinks);
   S['form|renderDrinkRows']=document.getElementById('f-drinks').innerHTML;
   return S;
 });
 fs.writeFileSync(out,JSON.stringify(snaps,null,1));
 const n=Object.keys(snaps).length;
 const bytes=Object.values(snaps).reduce((a,s)=>a+String(s).length,0);
 console.log('captured '+n+' snapshots, '+bytes+' bytes of HTML -> '+path.basename(out));
 console.log('page errors: '+(errs.length?errs.slice(0,3):'none'));
 await b.close();srv.close();
})().catch(e=>{console.error(e);process.exit(1);});
