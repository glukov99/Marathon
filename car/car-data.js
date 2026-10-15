/* Car data. Defaults from the "Моят автомобил" app and the Sept 2026 service.
   Your changes are kept in localStorage key 'lifehub-car' and synced like the other pages.
   VIN numbers are left out on purpose: the site is public. */
const C_CARS=[
 {id:'swift',n:'Suzuki Swift',sub:'1.3 petrol · 68 kW · first registered 2 Apr 2008',c:'#6E8FA8',
  km:null,kmAt:null,
  dl:[
   {id:'gtp',n:'Technical check (ГТП)',d:'2027-09-10'},
   {id:'go',n:'Civil liability (ГО)',d:'2027-09-11'},
   {id:'vin',n:'Vignette',d:null,none:'No vignette found. You need one only on roads outside towns.'},
   {id:'tax',n:'Car tax 2027',d:'2027-04-30',note:'Pay in full by 30 Apr for 5% off. Last day for the 2nd half: 31 Oct.'}],
  sv:[
   {id:'oil',n:'Oil and filters',km:10000,mo:12,last:null,lastKm:null,note:'Petrol: every 10,000 km or 1 year.'}],
  info:'Timing chain, not a belt: no belt to change.',
  log:[]},
 {id:'alfa',n:'Alfa Romeo Giulietta',sub:'2.0 JTDM diesel · 103 kW · first registered 26 Apr 2011',c:'#A8432F',
  km:235000,kmAt:'2026-09-17',
  dl:[
   {id:'go',n:'Civil liability (ГО)',d:'2027-04-14'},
   {id:'gtp',n:'Technical check (ГТП)',d:'2027-07-17'},
   {id:'vin',n:'Vignette',d:'2027-09-21'},
   {id:'tax',n:'Car tax 2027',d:'2027-04-30',note:'Pay in full by 30 Apr for 5% off. Last day for the 2nd half: 31 Oct.'}],
  sv:[
   {id:'oil',n:'Oil and filters',km:15000,mo:12,last:'2026-09-17',lastKm:235000,note:'Diesel: every 15,000 km or 1 year.'},
   {id:'belt',n:'Timing belt and water pump',km:120000,mo:60,last:null,lastKm:null,note:'Interval set to 120,000 km or 5 years. Check it against the service book. A broken belt destroys the engine.'}],
  info:'Diesel with a DPF: drive 20+ min on the open road about once a month so the filter can clean itself.',
  log:[
   {d:'2026-09-17',km:235000,items:[
     ['EGR cooler and antifreeze, labour',120],
     ['Oil, filters, labour',130],
     ['Glow plugs (2), diagnostics, labour',50],
     ['Bonnet gas struts',40]]}]}
];
const C_KEY='lifehub-car';
function C_load(){try{return JSON.parse(localStorage.getItem(C_KEY)||'{}')||{}}catch(e){return {}}}
function C_save(st){try{localStorage.setItem(C_KEY,JSON.stringify(st))}catch(e){}if(window.HubSync)HubSync.push(C_KEY,st)}
const C_iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const C_days=s=>{const t=new Date();t.setHours(0,0,0,0);const [y,m,d]=s.split('-').map(Number);return Math.round((new Date(y,m-1,d)-t)/864e5)};
const C_addMo=(s,n)=>{const [y,m,d]=s.split('-').map(Number);return C_iso(new Date(y,m-1+n,d))};
/* Merge defaults with saved changes. */
function C_cars(st){
  st=st||C_load();
  return C_CARS.map(c=>{const o=(st.cars||{})[c.id]||{};
    const km=o.km!=null?o.km:c.km, kmAt=o.km!=null?o.kmAt:c.kmAt;
    const dl=c.dl.map(x=>Object.assign({},x,{d:(o.dl||{})[x.id]!==undefined?(o.dl||{})[x.id]:x.d}));
    const sv=c.sv.map(x=>{const so=(o.sv||{})[x.id]||{};const s=Object.assign({},x,so);
      s.dueD=s.last?C_addMo(s.last,s.mo):null; s.dueKm=s.lastKm!=null?s.lastKm+s.km:null;
      s.kmLeft=(s.dueKm!=null&&km!=null)?s.dueKm-km:null; s.dLeft=s.dueD?C_days(s.dueD):null; return s});
    const log=c.log.concat(o.log||[]).sort((a,b)=>b.d.localeCompare(a.d));
    return Object.assign({},c,{km,kmAt,dl,sv,log});});
}
/* Tyre swaps (Bulgaria: winter tyres from 15 Nov to 1 Mar). Next one only. */
function C_tyres(){
  const t=new Date();t.setHours(0,0,0,0);const y=t.getFullYear(),ts=C_iso(t);
  const opts=[[y+'-11-15','Winter tyres on'],[y+'-03-15','Summer tyres on'],[(y+1)+'-03-15','Summer tyres on'],[(y+1)+'-11-15','Winter tyres on']]
    .filter(([d])=>d>=ts).sort((a,b)=>a[0].localeCompare(b[0]));
  return {n:opts[0][1]+' (both cars)',d:opts[0][0]};
}
/* Everything with a date, soonest first: for the home page and the calendar file. */
function C_upcoming(st){
  const out=[];C_cars(st).forEach(c=>{
    c.dl.forEach(x=>{if(x.d)out.push({car:c.n,n:x.n,d:x.d,c:c.c})});
    c.sv.forEach(s=>{if(s.dueD)out.push({car:c.n,n:s.n,d:s.dueD,c:c.c,km:s.dueKm})});});
  const ty=C_tyres();out.push({car:'',n:ty.n,d:ty.d,c:'#5F665D'});
  return out.sort((a,b)=>a.d.localeCompare(b.d));
}
