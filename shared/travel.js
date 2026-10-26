/* Adapts training sessions to trips on the Holidays page.
   Needs training/plan.js and holidays/holidays-data.js loaded first. */
const Travel=(()=>{
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const list=()=>typeof H_list==='function'?H_list():[];
  function tripOn(date){const s=iso(date);return list().find(t=>s>=t.from&&s<=t.to)||null}
  const r5=m=>Math.max(15,Math.round(m*0.7/5)*5);
  const HOTEL={
    A:['Hotel legs and power (away)','25 min. Bodyweight or a backpack.',25,'hotelA'],
    B:['Hotel upper body (away)','25 min. Pack the band. Bring Sally Up every second session.',25,'hotelBaway'],
    C:['Hotel circuit (away)','15 min, steady.',20,'hotelC']};
  function lighten(x){
    const y=Object.assign({},x);
    if(x.race||x.z==='yoga'||x.z==='rest'||x.z==='swim')return y;
    if(x.key&&['st','hard','mp'].includes(x.z)){Object.assign(y,{z:'easy',key:0,m:r5(x.m),t:`Easy run ${r5(x.m)} min`,d:'Lighter week: quality session replaced. HR 148–160. Add 4×20 s strides.'});return y}
    if(x.long){y.m=r5(x.m);y.t=`Long easy run ${y.m} min`;y.d='Lighter week: 30% shorter, all easy. HR under 155.';return y}
    if(x.z==='vert'){y.m=r5(x.m);y.t=`Hills, easy, ${y.m} min`;y.d='Lighter week: fewer laps, all easy.';return y}
    if(x.z==='easy'||x.z==='rec'){y.m=r5(x.m);y.t=y.t.replace(/\d+ min/,y.m+' min');return y}
    if(x.g==='A'){y.t='Gym A, light';y.d='Lighter week: 2 sets each, no new loads.';y.ex=x.ex.map(b=>[Math.min(b[0],2),b[1],b[2]]);return y}
    if(x.test){y.t='Test moved';y.d='Lighter week: do this test next week.';return y}
    return y;
  }
  function travel(x,trip){
    const y=Object.assign({},x), away=` Away: ${trip.n}.`;
    if(x.race||x.z==='yoga'||x.z==='rest')return y;
    if(x.g&&HOTEL[x.g]){const h=HOTEL[x.g];Object.assign(y,{t:h[0],d:h[1],m:h[2],ex:gym(h[3])});return y}
    if(x.test&&!/10k/i.test(x.t)){y.t='Test moved: '+x.t.replace(/^(Test|Retest): /,'');y.d='Away. Do it the week after you get back.';return y}
    if(x.z==='vert'){y.t=`Hills or stairs, ${x.m} min (away)`;y.d='Find a hill or a hotel staircase. Same time on feet, hike up, easy down. If it is flat: easy run, same time.';return y}
    if(x.z==='swim'){y.t='Swim if there is a pool, or walk 30 min';y.d='Recovery. Not a workout.';return y}
    if(x.key){y.d=x.d+away+' Any flat road or a treadmill works. On a travel day, swap it with the next easy day.';return y}
    if(x.long){y.d=x.d+away+' Plan the route before you go. Run it early in the day.';return y}
    if(x.z==='easy'||x.z==='rec'){y.d=x.d+away+' Explore on foot.';return y}
    return y;
  }
  function adapt(x,trip,lighter){let y=lighter?lighten(x):x;return trip?travel(y,trip):y}
  function week(wi,w){
    const days=[0,1,2,3,4,5,6].map(d=>tripOn(dayDate(wi,d)));
    const longDays=days.filter(t=>t&&t.kind==='long').length;
    const trip=days.find(Boolean);
    const out={trip,longDays,advice:'',clash:''};
    if(trip&&w.race)out.clash=`${trip.n} overlaps a race week. Move the trip on the Holidays page.`;
    else if(trip&&['taper'].includes(w.p))out.clash=`${trip.n} falls in the taper. Move the trip if you can.`;
    else if(longDays>=3&&w.p==='mara')out.advice=`${trip.n} falls in the marathon block. Best: move the trip. If you can't: make this a lighter week.`;
    else if(longDays>=3&&!w.light)out.advice=`${trip.n} covers ${longDays} days of a build week. Coach's advice: make this a lighter week.`;
    if(w.light&&/trip/i.test(w.title)&&!trip)out.advice='The trip moved away from this week. You can train it as a normal week: repeat the sessions from the week before.';
    return out;
  }
  return {tripOn,adapt,week};
})();
