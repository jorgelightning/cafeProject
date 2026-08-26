/* The only test with no browser: it lifts the currency block straight out of core.js and
   exercises the arithmetic directly. */
const { checker, ROOT } = require("./harness");
const fs=require("fs"), path=require("path"), vm=require("vm");
const { eq, done } = checker();
const core=fs.readFileSync(path.join(ROOT,'js/core.js'),'utf8');
const a=core.indexOf('/* ---------- currency ----------');
const b=core.indexOf('return o;\n}\n',a)+'return o;\n}\n'.length;
const ctx={console, localStorage:{getItem:()=>null,setItem:()=>{}}, warn:()=>{}, lsSet:()=>true};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT,'js/config.js'),'utf8').replace('"use strict";',''),ctx);
vm.runInContext(core.slice(a,b),ctx);
const {priceFields,toUSD,fmtLocal,ccyFor,fxRate,ccyNum}=ctx;


// country -> currency: the case that started this
eq(ccyFor({cc:'CA'}),'CAD','Vancouver cafe -> CAD');
eq(ccyFor({cc:'TW'}),'TWD','Taipei -> TWD');
eq(ccyFor({cc:'FR'}),'EUR','France -> EUR');
eq(ccyFor({cc:'CH'}),'CHF','Geneva -> CHF, not EUR');
eq(ccyFor({cc:'HK'}),'HKD','Hong Kong -> HKD');
eq(ccyFor({cc:''}),'USD','no country -> USD');
eq(ccyFor({cc:'ZZ'}),'USD','unknown country -> USD');
eq(ccyFor(null),'USD','no cafe -> USD');

// the legacy shape must not change for dollar prices
eq(priceFields('6.50','USD',1,'2026-08-25'),{p:'6.50'},'USD keeps legacy shape');
eq(priceFields('6.50','',0,''),{p:'6.50'},'blank currency = USD');
eq(priceFields('','TWD',31.5,'2026-08-25'),{p:''},'no amount -> empty price');

// the real Taipei drink, re-logged the new way
eq(priceFields('65','TWD',31.5,'2026-08-25'),
   {p:'2.06',pl:'65',pc:'TWD',pr:31.5,pd:'2026-08-25'},'NT$65 -> $2.06 (matches stored 2.06)');
eq(priceFields('40','TWD',31.5,'2026-08-25').p,'1.27','NT$40 -> stored 1.27');
eq(priceFields('45','TWD',31.5,'2026-08-25').p,'1.43','NT$45 -> stored 1.43');
eq(priceFields('60','TWD',31.5,'2026-08-25').p,'1.90','NT$60 -> stored 1.90');

// a frozen rate is honoured over today's table
eq(priceFields('65','TWD',20,'2024-01-01'),
   {p:'3.25',pl:'65',pc:'TWD',pr:20,pd:'2024-01-01'},'stored 2024 rate wins over table');

// no rate available -> local kept, dollars left blank ("needs rate")
eq(priceFields('1000','XYZ',0,''),{p:'',pl:'1000',pc:'XYZ'},'unknown currency -> needs rate');
eq(fxRate('XYZ'),0,'unknown currency rate is 0');
eq(fxRate('USD'),1,'USD rate is 1');
eq(toUSD('100','XYZ',0),null,'no rate -> null, never a guess');

// display conventions
eq(fmtLocal('65','TWD'),'NT$65','NT$ written whole');
eq(fmtLocal('500','JPY'),'¥500','yen has no minor unit');
eq(fmtLocal('6.5','USD'),'$6.50','dollars keep 2dp');
eq(fmtLocal('4.2','CAD'),'CA$4.20','Vancouver price');
eq(fmtLocal('','TWD'),'','empty stays empty');
eq(ccyNum('abc'),null,'junk -> null');
eq(ccyNum('NT$65'),65,'strips symbols');
 const ok=done();
process.exit(ok?0:1);
