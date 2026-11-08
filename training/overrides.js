/* Skip, move and away days (2 Nov 2026, Georgi's ask).
   One source for the Training page, the home page and the watch (garmin_push.py).
   Needs plan.js, holidays-data.js and shared/travel.js loaded first.
   In the saved training state:
     skips: {key: reason}          the session is not done, on purpose
     moves: {key: 'YYYY-MM-DD'}    the session happens on another day
     away:  [{from, to, n}]         days away from home; runs stay, gym becomes bodyweight
   A test that falls on an away day moves by itself to the first gym day after the trip.
   Key = 'w<week>-<day>-<index>', the same key as the ticks and logs. */
const OV=(()=>{
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const fromIso=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
  const key=(w,d,i)=>`w${w+1}-${d}-${i}`;
  const parse=k=>{const m=/^w(\d+)-(\d)-(\d+)$/.exec(k);return m?[+m[1]-1,+m[2],+m[3]]:null};
  const item=k=>{const p=parse(k);return p&&W[p[0]]&&W[p[0]].days[p[1]][p[2]]||null};
  const wd=date=>{const n=Math.round((date-START)/864e5);return [Math.floor(n/7),((n%7)+7)%7]};
  const dateOf=k=>{const p=parse(k);return dayDate(p[0],p[1])};
  const reasons=['Holiday','Ill or injured','Life got in the way','Weather','Other'];
  let st={};
  /* Away days from the Training page join the Holidays page trips for Travel.tripOn. */
  function set(s){st=s||{};Travel.setExtra(()=>(st.away||[]).filter(a=>a&&a.from&&a.to).map((a,i)=>({id:'away'+i,kind:'away',n:a.n||'Away',from:a.from,to:a.to<a.from?a.from:a.to,dest:''})))}
  const outdoorTest=x=>/10k|5k|time trial/i.test(x.t);
  /* A test on an away day: to the first day after the trip that has a gym session (7 days at most). */
  function autoTo(x,date){
    if(!x.test||outdoorTest(x))return '';
    const trip=Travel.tripOn(date); if(!trip)return '';
    const end=fromIso(trip.to);
    for(let j=1;j<=7;j++){const c=new Date(end);c.setDate(c.getDate()+j);
      if(Travel.tripOn(c))continue;
      const [cw,cd]=wd(c), its=W[cw]?W[cw].days[cd]:[];
      if(its.some(y=>y.z==='gym')||j===7)return iso(c);}
    return '';
  }
  /* Where a session happens: '' = its own day. */
  function target(k){
    if(st.skips&&st.skips[k])return '';
    if(st.moves&&st.moves[k])return st.moves[k];
    const x=item(k);return x?autoTo(x,dateOf(k)):'';
  }
  /* One day as shown: [{k, x, skip, out, auto, from}]. x is adapted to that day's trip and lighter week.
     skip = reason; out = date it moved to (shown faded); from = its own date, when it moved in. */
  function day(wi,d){
    const date=dayDate(wi,d), s=iso(date), lt=!!(st.lighter&&st.lighter[wi]), trip=Travel.tripOn(date);
    const ad=x=>Travel.adapt(x,trip,lt);
    const own=W[wi].days[d].map((x,i)=>{const k=key(wi,d,i);
      if(st.skips&&st.skips[k])return {k,x:ad(x),skip:st.skips[k]};
      const to=target(k);
      if(to&&to!==s)return {k,x,out:to,auto:!(st.moves&&st.moves[k])};
      return {k,x:ad(x)}});
    const inc=[];
    W.forEach((w,wj)=>w.days.forEach((xs,dj)=>xs.forEach((x,i)=>{
      if(wj===wi&&dj===d)return;
      const k=key(wj,dj,i);
      if(target(k)===s)inc.push({k,x:ad(x),from:iso(dayDate(wj,dj)),auto:!(st.moves&&st.moves[k])});
    })));
    /* A moved-in session takes its natural place, as if planned there (Georgi, 8 Nov 2026), in the order
       of his morning: gym and tests first, then the run, swim, rest, the evening yoga last. */
    const run=x=>['easy','rec','st','hard','mp','vert','race'].includes(x.z)||(x.z==='test'&&/10k|5k|time trial/i.test(x.t));
    const rank=x=>run(x)?1:x.z==='test'||x.z==='gym'?0:x.z==='swim'?2:x.z==='rest'?3:x.z==='yoga'?4:2;
    return own.concat(inc).map((r,i)=>[r,i]).sort((a,b)=>rank(a[0].x)-rank(b[0].x)||a[1]-b[1]).map(p=>p[0]);
  }
  const label=s=>{const d=fromIso(s);return DN[(d.getDay()+6)%7]+' '+fd(d)};
  return {set,day,key,item,iso,fromIso,label,reasons,wd};
})();
