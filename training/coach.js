/* The coach (8 Nov 2026, Georgi: "make the system more intelligent, reactive to my doings").
   It reads what happened (wellness from Intervals.icu, the runs, the ticks) and suggests skips and
   moves, one card per reason. Nothing changes until he taps Accept: then the same skips and moves
   are written as his own taps, so the page, the home page and the watch all follow.
   Needs plan.js, overrides.js (OV) loaded first. Pure: Coach.suggest(input) -> [{id, title, why, ops}].
   input = {today: Date, well: [{date, hrv, rhr, atl, ctl, form}], acts: [{id, date, type,
   moving_time, elev}], state: {checks, skips, moves, runKm, coachNo}}. Check: node training/coach-check.js */
const Coach=(()=>{
  const DAY=864e5;
  const iso=d=>OV.iso(d);
  const add=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
  const runTest=x=>x.z==='test'&&/10k|5k|time trial/i.test(x.t);
  const hard=x=>!!(x.key||x.long||x.z==='vert'||x.race||runTest(x));
  const inSeason=d=>{const n=Math.round((d-START)/DAY);return n>=0&&n<W.length*7};
  const wd=d=>{const n=Math.round((d-START)/DAY);return [Math.floor(n/7),n%7]};
  // What is on a date after skips and moves (moved-away and skipped sessions left out).
  const on=(d,st)=>{if(!inSeason(d))return [];OV.set(st);const [w,k]=wd(d);return OV.day(w,k).filter(r=>!r.skip&&!r.out)};
  const hardOn=(d,st)=>on(d,st).some(r=>hard(r.x));
  const fmt=d=>OV.label(iso(d));
  // Apply ops to a copy of the state, so later rules see earlier suggestions.
  const withOps=(st,ops)=>({...st,moves:{...(st.moves||{}),...(ops.moves||{})},skips:{...(st.skips||{}),...(ops.skips||{})}});
  // While looking for a day for session k, k itself must not count where it is now.
  const without=(st,ops,k)=>withOps(st,{moves:ops.moves,skips:{...(ops.skips||{}),[k]:'-'}});
  /* The first day from `from` (up to `span` days) with no hard session and none the day before. */
  function freeDay(from,span,st){
    for(let j=0;j<span;j++){const d=add(from,j);if(!inSeason(d))break;
      if(!hardOn(d,st)&&!hardOn(add(d,-1),st))return d}
    return null;
  }

  function suggest(inp){
    const today=new Date(inp.today);today.setHours(0,0,0,0);
    let st={...inp.state}; const out=[], used=new Set();
    const done=k=>!!(st.checks&&st.checks[k]);
    const well=(inp.well||[]).filter(w=>w&&w.date).sort((a,b)=>a.date.localeCompare(b.date));
    const card=(rule,title,why,ops)=>{
      const keys=Object.keys(ops.moves||{}).concat(Object.keys(ops.skips||{}));
      if(!keys.length&&!ops.note)return;
      const id=rule+':'+keys.sort().join(',')+':'+JSON.stringify(ops.moves||{});
      if(st.coachNo&&st.coachNo[id])return;
      keys.forEach(k=>used.add(k)); st=withOps(st,ops); out.push({id,rule,title,why,ops});
    };

    /* 1. This morning: HRV clearly low AND resting HR clearly high: today's hard session moves. */
    const last=well[well.length-1];
    if(last&&last.date===iso(today)){
      const base=well.slice(-29,-1), stat=f=>{const v=base.map(x=>x[f]).filter(v=>v!=null);if(v.length<7)return null;
        const m=v.reduce((a,b)=>a+b,0)/v.length;return {m,sd:Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length)||1}};
      const H=stat('hrv'),R=stat('rhr');
      if(H&&R&&last.hrv!=null&&last.rhr!=null&&last.hrv<H.m-H.sd&&last.rhr>R.m+R.sd){
        const ops={moves:{},skips:{}};
        on(today,st).filter(r=>hard(r.x)&&!done(r.k)&&!used.has(r.k)).forEach(r=>{
          const to=freeDay(add(today,1),4,without(st,ops,r.k));
          if(to)ops.moves[r.k]=iso(to);else ops.skips[r.k]='Ill or injured';
        });
        card('morning','Take it easy today',`HRV ${last.hrv} against your usual ${Math.round(H.m)}, resting HR ${last.rhr} against ${Math.round(R.m)}. Both off at once usually means you have not recovered. Today's hard session moves.`,ops);
      }
    }

    /* 2. A big climb that was not planned (the Rodopi run): it was this week's hills. First, so the
       spike rule below already sees those days as free. */
    const big=(inp.acts||[]).filter(a=>/run|hike/i.test(a.type||'')&&a.date&&(today-new Date(String(a.date).slice(0,10)+'T00:00'))/DAY<=2
      &&(a.elev||0)>=400);
    if(big.length){
      const a=big[0], ops={skips:{}};
      for(let j=0;j<7;j++){const d=add(today,j);
        on(d,st).forEach(r=>{if(r.x.z==='vert'&&!done(r.k)&&!used.has(r.k))ops.skips[r.k]='Other'})}
      card('big','Skip this week\'s hills',`${Math.round(a.moving_time/60)} min with ${Math.round(a.elev)} m of climbing on ${String(a.date).slice(8,10)}.${String(a.date).slice(5,7)}. That was the week's hill work, and more.`,ops);
    }

    /* 3. A load spike: acute over chronic above 1.3, or form below -15. The next days ease off:
       hills are skipped, hard sessions move past the window, Gym A (lower body) goes with them.
       The window is when form should be back above -10 with no more training, at least 3 days
       (4 after a big climb). */
    const lw=[...well].reverse().find(w=>w.atl!=null&&w.ctl!=null);
    if(lw&&(today-new Date(lw.date+'T00:00'))/DAY<=2&&lw.ctl>=10){
      const ratio=lw.atl/lw.ctl, form=lw.ctl-lw.atl;
      if(ratio>1.3||form<-15){
        let n=1;while(n<7){const a=lw.atl*Math.exp(-n/7),c=lw.ctl*Math.exp(-n/42);if(c-a>=-10&&a/c<=1.3)break;n++}
        // At least 3 easy days; 4 after a big unplanned climb, whose descent leaves the quads sore for ~72 h.
        n=Math.max(big.length?4:3,n);
        const ops={moves:{},skips:{}}; let first=null; const gymA=[];
        for(let j=0;j<n;j++){const d=add(today,j);
          on(d,withOps(st,ops)).forEach(r=>{if(done(r.k)||used.has(r.k))return;
            if(r.x.z==='vert'){ops.skips[r.k]='Other';return}
            if(r.x.g==='A'){gymA.push(r.k);return}
            if(!hard(r.x))return;
            const to=freeDay(add(today,n),4,without(st,ops,r.k));
            if(to){ops.moves[r.k]=iso(to);first=first||to}else ops.skips[r.k]='Other';
          })}
        gymA.forEach(k=>{const to=first||freeDay(add(today,n),4,withOps(st,ops));if(to)ops.moves[k]=iso(to)});
        card('spike',`Ease off until ${fmt(add(today,n))}`,`Acute load ${Math.round(lw.atl)} against chronic ${Math.round(lw.ctl)} (ratio ${ratio.toFixed(1)}), form ${Math.round(form)}. That jump is where injuries come from. ${n} easy days first: hills skipped, the hard session moved.`,ops);
      }
    }

    /* 4. A hard session missed in the last 3 days: to the next free day, or dropped. */
    for(let j=3;j>=1;j--){const d=add(today,-j);
      on(d,st).filter(r=>hard(r.x)&&!done(r.k)&&!used.has(r.k)&&!(st.moves&&st.moves[r.k])).forEach(r=>{
        const to=freeDay(today,4,st), ops=to?{moves:{[r.k]:iso(to)}}:{skips:{[r.k]:'Life got in the way'}};
        card('missed',to?`Do "${r.x.t}" on ${fmt(to)}`:`Drop "${r.x.t}"`,
          to?`It was planned for ${fmt(d)} and is not ticked. ${fmt(to)} has nothing hard on it or the day before.`
            :`It was planned for ${fmt(d)}. There is no free day in the next 4 without stacking two hard days.`,ops);
      })}

    /* 5. Last week over the plan by more than 15% in running time: a note, nothing to change. */
    const [cw]=inSeason(today)?wd(today):[-1];
    const lr=cw>0&&st.runKm&&st.runKm[cw-1];
    if(lr&&typeof lr==='object'){
      const plan=W[cw-1].days.flat().filter(x=>['easy','rec','st','hard','mp','vert','race'].includes(x.z)).reduce((a,x)=>a+(x.m||0),0);
      const over=plan?Math.round((lr.min/plan-1)*100):0;
      if(over>15)card('over','Keep this week to the plan',`Last week you ran ${lr.min} of ${plan} planned minutes (+${over}%). This week, stop each run at its planned time.`,{note:1});
    }
    return out;
  }
  return {suggest,hard};
})();
if(typeof window!=='undefined')window.Coach=Coach;
