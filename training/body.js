/* Body hub for the Training tab: readiness score, muscle glow, weekly nodes, today card.
   Reads: W, START, dayDate, today0, id(), state (from the page) and HubSync config. */
const BH={view:'front',sel:null,well:null};
const BH_RUN=['easy','rec','st','hard','mp','race'];
/* * How hard a run works the legs per minute, by type. Our own estimate: Garmin has one row for running. */
const BH_PACE={rec:.6,easy:1,mp:1.2,st:1.3,hard:1.5,race:1.5,test:1.5};
/* Muscles per exercise: "primary|secondary" (1 and .5), copied from Garmin Connect's exercise list:
   github.com/mrnabilnoh/workout-plan-garmin-connect/blob/main/garmin_connect_exercise_list.md
   Rows marked * are not in that list and are our own estimate. Each regex finds the exercise in a session's text. */
const BH_EX=[
  ['run',/\d+ m run/i,'quads hips hamstrings glutes calves|abs'],                                   // Indoor Track Run
  ['boxjump',/box jump|broad jump/i,'quads calves|hips glutes hamstrings'],                          // Box Jump
  ['kbswing',/kettlebell swing/i,'glutes hips|quads lats abs hamstrings shoulders'],                 // Kettlebell Swing
  ['trapbar',/deadlift/i,'hamstrings quads glutes lower_back|lats traps forearm adductors'],          // Trap Bar Deadlift
  ['split',/split squat/i,'quads glutes|hamstrings'],                                                // Dumbbell Bulgarian Split Squat
  ['slrdl',/\brdl/i,'hamstrings lower_back|traps lats glutes adductors'],                            // Single Leg Romanian Deadlift
  ['step',/step-?(up|down)/i,'quads glutes|hamstrings calves hips'],                                 // Step Up
  ['calf',/calf (and tib )?raise/i,'calves'],                                                        // Calf Raise, Seated Calf Raise
  ['tib',/\btib\b/i,'shin'],                                                                         // * Garmin files toe raises under calves
  ['spanish',/spanish squat/i,'quads'],                                                              // *
  ['sidewalk',/side walk|band walk/i,'abductors|glutes'],                                            // Lateral Band Walks
  ['cossack',/cossack/i,'quads glutes|hamstrings adductors abductors'],                              // Side Lunge
  ['deadbug',/dead bug/i,'abs shoulders hips|quads hamstrings'],                                     // Dead Bug
  ['pallof',/pallof/i,'abs obliques|shoulders'],                                                     // *
  ['plank',/plank/i,'abs|shoulders'],                                                                // Plank
  ['pullup',/pull-?ups?/i,'lats traps|biceps forearm shoulders'],                                    // Pull Up
  ['pike',/pike push/i,'chest shoulders|triceps'],                                                   // Pike Push Up
  ['pushup',/(?<!pike )push-?ups?|sally/i,'chest|abs shoulders triceps'],                            // Push Up (Bring Sally Up is push-ups here)
  ['row',/(band|dumbbell) rows?|\brows\b/i,'lats traps|biceps lower_back shoulders'],                // Dumbbell Row
  ['rower',/rower|\d+ ?k row|row erg/i,'lats traps quads|biceps lower_back shoulders'],               // Indoor Row
  ['ohp',/overhead press/i,'shoulders|chest triceps traps'],                                         // Dumbbell Shoulder Press
  ['hang',/dead hang/i,'forearm|lats shoulders'],                                                    // * Hanging rows without the leg raise
  ['facepull',/face pull/i,'shoulders traps'],                                                       // Banded Face Pulls
  ['squat',/air squats?|\d+ squats/i,'quads glutes|hamstrings'],                                     // Air Squat
  ['thruster',/thruster/i,'quads glutes shoulders|abs calves chest hamstrings hips lower_back traps triceps forearm'], // Thrusters
  ['farmer',/farmer/i,'forearm|hamstrings quads lower_back traps shoulders'],                        // Farmers Carry
  ['skierg',/ski erg/i,'lats triceps|abs shoulders'],                                                // *
];
/* Fixed sessions: the Strength tab's, and the named tests. A retest's text often names no exercises. */
const BH_SESS={A:'boxjump kbswing trapbar split slrdl step calf',B:'pullup pushup row ohp hang facepull',
  C1:'pullup pushup squat',C2:'rower farmer',C3:'pushup rower',
  cindy:'pullup pushup squat',fran:'thruster pullup',murph:'run pullup pushup squat'};
/* Muscles the figure has no shape for go to the nearest one that is drawn. */
const BH_FOLD={hips:null,abductors:['glutes',1],obliques:['abs',.5],lower_back:['lats',.5]};
function bhRow(r,o,k){const[p,s='']=r.split('|');[[p,1],[s,.5]].forEach(([l,v])=>l.split(' ').filter(Boolean).forEach(m=>{
  const f=m in BH_FOLD?BH_FOLD[m]:[m,1];if(f)o[f[0]]=(o[f[0]]||0)+v*f[1]*k}));return o}
/* What a session works, per muscle, strongest = 1 (vert 1.3, runs by BH_PACE). */
function bhMuscles(x){
  const t=(x.t||'')+' '+(x.d||''),o={};
  if(BH_RUN.includes(x.z)||(x.z==='test'&&/10k|time trial/i.test(x.t)))return bhRow('quads hips hamstrings glutes calves|abs',o,BH_PACE[x.z]);
  if(x.z==='vert')return bhRow('quads glutes calves|hamstrings lower_back',o,1.3);   // * uphill hiking
  if(x.z==='swim')return bhRow('lats shoulders|triceps chest traps abs',o,1);         // *
  if(x.z!=='gym'&&x.z!=='test')return o;
  const fixed=BH_SESS[x.g==='C'?x.t.slice(-2):x.g]||BH_SESS[((x.t.match(/cindy|fran|murph/i)||[''])[0]).toLowerCase()]||(/upper/i.test(x.t)&&!BH_EX.some(e=>e[1].test(t))?BH_SESS.B:'');
  const ex=fixed?fixed.split(' ').map(k=>BH_EX.find(e=>e[0]===k)):BH_EX.filter(e=>e[1].test(t));
  ex.forEach(e=>bhRow(e[2],o,1));
  const top=Math.max(0,...Object.values(o));Object.keys(o).forEach(m=>o[m]/=top||1);
  return o;
}
/* Load per muscle from ticked sessions in the last 7 days. Fades linearly over 7 days. */
function bhLoad(){
  const t0=today0(),L={};
  for(let back=0;back<7;back++){
    const day=new Date(t0);day.setDate(day.getDate()-back);
    const n=Math.floor((day-START)/864e5);if(n<0)continue;
    const w=Math.floor(n/7),d=n%7;if(!W[w])continue;
    W[w].days[d].forEach((x,i)=>{if(!state.checks[id(w,d,i)])return;
      const k=Math.min(2,Math.max(.5,(x.race?90:x.m||40)/45))*(1-back/7);   // a race has no minutes in the plan
      Object.entries(bhMuscles(x)).forEach(([m,v])=>L[m]=(L[m]||0)+v*k)});
  }
  return L;
}
/* This week: % done per node. */
function bhWeek(){
  const t0=today0(),cw=Math.max(0,Math.min(W.length-1,Math.floor((t0-START)/864e5/7)));
  const c={run:[0,0],vert:[0,0],str:[0,0],swim:[0,0],mob:[0,0]},items={run:[],vert:[],str:[],swim:[],mob:[]};
  const cat=x=>BH_RUN.includes(x.z)||(x.z==='test'&&/10k/i.test(x.t))?'run':x.z==='vert'?'vert':x.z==='swim'?'swim':x.z==='yoga'?'mob':(x.z==='gym'||x.z==='test')?'str':null;
  if(t0>=START)W[cw].days.forEach((xs,d)=>xs.forEach((x,i)=>{const k=cat(x);if(!k)return;const on=!!state.checks[id(cw,d,i)];
    c[k][1]++;if(on)c[k][0]++;items[k].push({d,t:x.t,on})}));
  return {c,items};
}
/* Readiness 0–100 from HRV and resting HR against your 4-week normal, plus last night's sleep. */
function bhReady(){
  const w=(BH.well||[]).filter(x=>x&&x.date).sort((a,b)=>a.date.localeCompare(b.date));
  if(!w.length)return null;
  const hd=w.filter(x=>x.hrv!=null||x.rhr!=null);if(!hd.length)return null;
  const li=w.indexOf(hd[hd.length-1]),last=w[li],base=w.slice(Math.max(0,li-28),li);
  const stat=k=>{const v=base.map(x=>x[k]).filter(v=>v!=null);if(v.length<5)return null;const m=v.reduce((a,b)=>a+b,0)/v.length;
    const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length)||1;return {m,sd}};
  const cl=v=>Math.max(0,Math.min(100,v)),H=stat('hrv'),R=stat('rhr');
  const ph=last.hrv!=null&&H?cl(70+15*(last.hrv-H.m)/H.sd):null;
  const pr=last.rhr!=null&&R?cl(70+15*(R.m-last.rhr)/R.sd):null;
  const ps=last.sleepScore!=null?last.sleepScore:last.sleepH!=null?cl(last.sleepH/8*100):null;
  const parts=[[ph,.4],[pr,.3],[ps,.3]].filter(p=>p[0]!=null);if(!parts.length)return null;
  const score=Math.round(parts.reduce((a,p)=>a+p[0]*p[1],0)/parts.reduce((a,p)=>a+p[1],0));
  const sl=w.slice(-7).map(x=>x.sleepH).filter(v=>v!=null),sleep7=sl.length?sl.reduce((a,b)=>a+b,0)/sl.length:null;
  const t0=today0(),ld=new Date(last.date+'T12:00');ld.setHours(0,0,0,0);const age=Math.round((t0-ld)/864e5);
  const r3=w.slice(Math.max(0,li-2),li+1).map(x=>x.rhr);const rhrFlag=!!(R&&r3.length===3&&r3.every(v=>v!=null&&v>=R.m+7));
  const fr=w.filter(x=>x.form!=null),form=fr.length?fr[fr.length-1].form:null;
  return {score,last,H,R,sleep7,date:last.date,age,rhrFlag,form};
}
async function bhFetch(){
  try{const c=window.HubSync&&HubSync.cfg();if(!c||!c.url)return;
    const r=await fetch(c.url+(c.url.includes('?')?'&':'?')+'t='+encodeURIComponent(c.tok)+'&action=wellness&days=70');
    const j=await r.json();if(j&&j.wellness){BH.well=j.wellness;try{localStorage.setItem('lifehub-wellness',JSON.stringify(j.wellness))}catch(e){}renderBody()}
  }catch(e){}
}
try{BH.well=JSON.parse(localStorage.getItem('lifehub-wellness')||'null')}catch(e){}

/* Body drawn from the traced chart (body-shapes.js). Fit: 395 px tall, centred at x=180. */
const BH_ANCH={front:{swim:[179,236],str:[161,323],mob:[262,470],rec:[318,80],run:[346,596],vert:[393,810]},
  back:{swim:[111,238],str:[171,308],mob:[181,495],rec:[254,80],run:[287,622],vert:[320,798]}};
function bhFit(view){const B=BH_SHAPES[view].box,s=395/B[3];return {s,tx:180-(B[0]+B[2]/2)*s,ty:4-B[1]*s}}
function bhAnchor(view,k){const f=bhFit(view),p=BH_ANCH[view][k];return [p[0]*f.s+f.tx,p[1]*f.s+f.ty]}
function bhBodySVG(load,view){
  const V=BH_SHAPES[view],f=bhFit(view),val=m=>Math.min(1,(load[m]||0)/1.6);
  let base='',hot='',crisp='';
  Object.entries(V.m).forEach(([m,ps])=>{const v=val(m),d=ps.join(' ');
    base+=`<path d="${d}" fill="rgba(190,232,150,.09)" stroke="rgba(190,232,150,.30)" stroke-width="1.6"/>`;
    if(v>.05){hot+=`<path d="${d}" fill="#FF8A3D" opacity="${(v*.9).toFixed(2)}"/>`;
      crisp+=`<path d="${d}" fill="url(#bhHot)" opacity="${(.25+.75*v).toFixed(2)}" stroke="rgba(255,200,140,.6)" stroke-width="1.4"/>`}});
  return `<g transform="translate(${f.tx.toFixed(1)},${f.ty.toFixed(1)}) scale(${f.s.toFixed(4)})">
    <path d="${V.sil}" fill="url(#bhSkin)" stroke="rgba(200,240,150,.55)" stroke-width="2.4" filter="url(#bhEdge)"/>
    ${base}<g filter="url(#bhGlow)">${hot}</g>${crisp}</g>`;
}
function renderBody(){
  const el=document.getElementById('bodyhub');if(!el)return;
  const load=bhLoad(),{c,items}=bhWeek(),R=bhReady(),t0=today0(),h=new Date().getHours();
  const hello=(h<12?'Good morning':h<18?'Good afternoon':'Good evening')+', Georgi';
  let head='No readiness data yet.',sub='Connect wellness data to see your readiness.';
  if(R){head=R.score>=80?'Your numbers look strong today.':R.score>=65?'Your numbers look normal today.':R.score>=50?'Your numbers are a bit low today.':'Your numbers are low today.';
    sub=[R.last.hrv!=null&&R.H?`HRV ${R.last.hrv} ms (normal ${Math.round(R.H.m)})`:'',R.last.rhr!=null&&R.R?`Resting HR ${R.last.rhr} (normal ${Math.round(R.R.m)})`:'',
      R.last.sleepH!=null?`Sleep ${R.last.sleepH} h${R.last.sleepScore?' · score '+R.last.sleepScore:''}`:''].filter(Boolean).join(' · ')
    if(R.age>=2){head='No new Garmin data since '+R.date.split('-').reverse().slice(0,2).join('.')+'.';sub='These numbers are '+R.age+' days old. Open Garmin Connect to sync, or check the Intervals.icu connection.'}}
  const pct=k=>c[k][1]?Math.round(c[k][0]/c[k][1]*100):null;
  const sleepP=R&&R.sleep7?Math.min(100,Math.round(R.sleep7/8*100)):null;
  const nodes=[
    {k:'swim',n:'SWIM',x:38,y:70,v:pct('swim')},
    {k:'str',n:'STRENGTH',x:38,y:180,v:pct('str')},
    {k:'mob',n:'MOBILITY',x:38,y:295,v:pct('mob')},
    {k:'rec',n:'FORM',x:322,y:70,v:R&&R.form!=null?Math.round(Math.max(0,Math.min(1,(R.form+30)/55))*100):null,lbl:R&&R.form!=null?(R.form>0?'+':'')+R.form:'—',col:R&&R.form!=null?(R.form<-30?'#E07A63':R.form<-10?'#FF8A3D':'#CFE8A8'):null},
    {k:'run',n:'RUN',x:322,y:200,v:pct('run')},
    {k:'vert',n:'VERT',x:322,y:315,v:pct('vert')}];
  nodes.forEach(n=>n.to=bhAnchor(BH.view,n.k));
  const ring=(v,col)=>{const C=2*Math.PI*19,p=v==null?0:v/100;return `<circle r="19" fill="rgba(15,19,18,.9)" stroke="rgba(255,255,255,.10)" stroke-width="3"/>
    <circle r="19" fill="none" stroke="${col||(p>=1?'#CFE8A8':'#FF8A3D')}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(C*p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>`};
  const svg=`<svg viewBox="0 0 360 420" role="img" aria-label="Body map: muscles worked in the last 7 days, and this week's progress by type">
    <defs>
      <radialGradient id="bhHot"><stop offset="0" stop-color="#FFD9A0"/><stop offset=".6" stop-color="#FF9A4D"/><stop offset="1" stop-color="#F0702A"/></radialGradient>
      <linearGradient id="bhSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26332B"/><stop offset="1" stop-color="#121815"/></linearGradient>
      <filter id="bhGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="6"/></filter>
      <filter id="bhEdge" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="2" result="b"/><feFlood flood-color="#BFE88A" flood-opacity=".35"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="180" cy="396" rx="70" ry="9" fill="rgba(191,232,138,.10)"/>
    ${bhBodySVG(load,BH.view)}
    ${nodes.map(n=>`<line x1="${n.x}" y1="${n.y}" x2="${n.to[0]}" y2="${n.to[1]}" stroke="rgba(191,232,138,.38)" stroke-width="1"/><circle cx="${n.to[0]}" cy="${n.to[1]}" r="2.6" fill="#CFE8A8"/>`).join('')}
    ${nodes.map(n=>`<g class="bh-node" data-node="${n.k}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${n.n}: ${n.lbl||(n.v==null?'nothing planned':n.v+'% done')}">${ring(n.v,n.col)}
      <text y="4.5" text-anchor="middle" font-size="12" font-weight="800" fill="#E8ECE6">${n.lbl||(n.v==null?'—':n.v+'%')}</text>
      <text y="34" text-anchor="middle" font-size="9" font-weight="700" letter-spacing=".08em" fill="#A7B4AD">${n.n}</text></g>`).join('')}
  </svg>`;
  let pop='';
  if(BH.sel){const s=BH.sel,DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    if(s==='rec'){const f=R&&R.form;pop=`<div class="bh-pop"><b>Form: ${f==null?'no data':(f>0?'+':'')+f}</b><div class="on">${f==null?'Needs the Apps Script update.':f>5?'Fresh. Good before a race or a key session.':f>=-10?'Neutral. Normal training.':f>=-30?'Tired from training: the productive zone. Keep easy days easy.':'Very tired. High risk of injury or illness: take an easy day.'}</div><div>Form is fitness minus fatigue, from Intervals.icu. It comes from your training load, not from Garmin.</div>${R&&R.sleep7?`<div>Sleep, last 7 nights: ${R.sleep7.toFixed(1)} h on average.</div>`:''}</div>`}
    else{const it=items[s]||[];pop=`<div class="bh-pop"><b>${nodes.find(n=>n.k===s).n[0]+nodes.find(n=>n.k===s).n.slice(1).toLowerCase()} this week</b>${it.length?it.map(x=>`<div class="${x.on?'on':''}">${x.on?'✓':'○'} ${DN[x.d]} · ${x.t}</div>`).join(''):'<div>Nothing planned this week.</div>'}</div>`}}
  // Today card
  let today='';
  const n=Math.floor((t0-START)/864e5);
  if(n>=0&&n<W.length*7){const w=Math.floor(n/7),d=n%7,xs=W[w].days[d];
    const main=xs.find(x=>!['yoga','gym','rest'].includes(x.z))||xs.find(x=>x.z!=='yoga')||xs[0];
    const tot=xs.filter(x=>x.z!=='rest').length,done=xs.filter((x,i)=>x.z!=='rest'&&state.checks[id(w,d,i)]).length,p=tot?done/tot:0;
    const A=Math.PI*42;
    today=`<div class="today-card"><svg viewBox="0 0 108 70" aria-hidden="true">
      <path d="M12,62 A42,42 0 0 1 96,62" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="9" stroke-linecap="round"/>
      ${p>0?`<path d="M12,62 A42,42 0 0 1 96,62" fill="none" stroke="#FF8A3D" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(A*p).toFixed(1)} ${A.toFixed(1)}"/>`:''}
      <text x="54" y="58" text-anchor="middle" font-size="22" font-weight="800" fill="#E8ECE6" font-family="Manrope,sans-serif">${done}/${tot}</text></svg>
      <div><div class="k">Today</div><div class="t">${main.t}</div><div class="d">${main.m?main.m+' min · ':''}${main.d||''}</div>
      ${xs.length>1?`<div class="also">Also: ${xs.filter(x=>x!==main&&x.z!=='rest').map(x=>x.t.replace(/: .*$/,'').replace(/^PM yoga/,'Yoga')).join(', ')}</div>`:''}</div></div>`;}
  else if(n<0)today=`<div class="today-card"><div><div class="k">Today</div><div class="t">Rest until Sun 25 Oct</div><div class="d">Yoga and easy swims only. Base starts Mon 26 Oct.</div></div></div>`;
  // Red flag: resting HR 7+ above normal for 3 days
  const flag=R&&R.rhrFlag&&R.age<2?`<div class="bh-flag">Resting HR has been 7+ above your normal for 3 days. Skip strength today: easy run or rest.</div>`:'';
  // Big load in the last 3 days: Gym A becomes isometrics only
  let big='';
  if(n>=0&&n<W.length*7&&W[Math.floor(n/7)].days[n%7].some(x=>x.g==='A')){
    for(let b=1;b<=3&&!big;b++){const m2=n-b;if(m2<0)break;const w2=Math.floor(m2/7),d2=m2%7;
      W[w2].days[d2].forEach((x,i)=>{const lg=state.logs[id(w2,d2,i)];if(lg&&((+lg.t||0)>=240||(+lg.el||0)>=1500)&&!big)
        big=`<div class="bh-flag soft">Big run in the last 3 days (${+lg.t>=240?Math.round(lg.t/60*10)/10+' h':lg.el+' m up'}). Do Gym A as isometrics only today: Spanish squat, calf raise holds, plank, at 60%.</div>`})}}
  // Weight trend (7-day average, no goal)
  let wt='';
  const cut=new Date(today0());cut.setDate(cut.getDate()-56);const cutS=cut.toISOString().slice(0,10);
  const ws=(BH.well||[]).filter(x=>x.weight&&x.date>=cutS).sort((a,b)=>a.date.localeCompare(b.date));
  if(ws.length<3){const l=ws[ws.length-1];
    wt=`<div class="bh-weight"><div class="k">Weight</div>${l?`<div class="v"><b>${l.weight.toFixed(1)} kg</b> on ${l.date.split('-').reverse().slice(0,2).join('.')}</div><div class="x">The trend line starts after 3 weigh-ins (${ws.length} so far). Weigh in the morning, 3–4 times a week.</div>`
      :`<div class="x">No weight yet. Log it in Intervals.icu: calendar → today → Wellness → Weight.</div>`}</div>`;
  }
  if(ws.length>=3){
    const avg=i=>{const v=ws.slice(Math.max(0,i-6),i+1).map(x=>x.weight);return v.reduce((a,b)=>a+b,0)/v.length};
    const av=ws.map((x,i)=>avg(i)),lo=Math.min(...ws.map(x=>x.weight))-.5,hi=Math.max(...ws.map(x=>x.weight))+.5;
    const t0d=new Date(ws[0].date+'T12:00'),span=Math.max(1,(new Date(ws[ws.length-1].date+'T12:00')-t0d)/864e5);
    const X=x=>16+(new Date(x.date+'T12:00')-t0d)/864e5/span*300,Y=v=>8+(hi-v)/(hi-lo)*64;
    const cur=av[av.length-1],ref=ws.findIndex(x=>(new Date(ws[ws.length-1].date+'T12:00')-new Date(x.date+'T12:00'))/864e5<=14),ch=cur-av[Math.max(0,ref)];
    wt=`<div class="bh-weight"><div class="k">Weight</div><div class="v"><b>${cur.toFixed(1)} kg</b> 7-day average <span>${ch>0?'+':''}${ch.toFixed(1)} kg in 2 weeks</span></div>
      <svg viewBox="0 0 320 80" aria-label="Weight, last 8 weeks">${ws.map(x=>`<circle cx="${X(x).toFixed(1)}" cy="${Y(x.weight).toFixed(1)}" r="2" fill="rgba(232,236,230,.35)"/>`).join('')}
      <polyline points="${ws.map((x,i)=>X(x).toFixed(1)+','+Y(av[i]).toFixed(1)).join(' ')}" fill="none" stroke="#FF8A3D" stroke-width="2.2" stroke-linejoin="round"/>
      <text x="0" y="12" fill="#7C8A84" font-size="9">${hi.toFixed(0)}</text><text x="0" y="74" fill="#7C8A84" font-size="9">${lo.toFixed(0)}</text></svg>
      <div class="x">Dots: daily weight. Line: 7-day average. Daily swings of 1 kg are water, not fat.</div></div>`;
  }
  el.innerHTML=`<div class="bh-hello">${hello}</div><div class="bh-head">${head}</div><div class="bh-sub">${sub}</div>
    <div class="bh-stage">${svg}<button class="bh-flip" id="bhFlip">${BH.view==='front'?'Show back':'Show front'}</button></div>
    <div class="bh-score"><div class="n">${R?R.score:'—'}</div><div class="l">Readiness</div><div class="x">${R?'Garmin data for '+R.date.split('-').reverse().slice(0,2).join('.')+'. How you feel comes first.':'Needs the wellness update in Apps Script'}</div></div>${flag}${pop}${big}${today}${wt}`;
}
document.addEventListener('click',e=>{
  if(e.target.closest('#bhFlip')){BH.view=BH.view==='front'?'back':'front';renderBody();return}
  const n=e.target.closest('.bh-node');if(n){BH.sel=BH.sel===n.dataset.node?null:n.dataset.node;renderBody()}
});
document.addEventListener('keydown',e=>{const n=e.target.closest&&e.target.closest('.bh-node');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();n.dispatchEvent(new MouseEvent('click',{bubbles:true}))}});
window.addEventListener('load',()=>setTimeout(bhFetch,300));
