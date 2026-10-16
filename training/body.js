/* Body hub for the Training tab: readiness score, muscle glow, weekly nodes, today card.
   Reads: W, START, dayDate, today0, id(), state (from the page) and HubSync config. */
const BH={view:'front',sel:null,well:null};
const BH_RUN=['easy','rec','st','hard','mp','race'];
/* What each session works, 0–1.5 per muscle group. */
function bhMuscles(x){
  const t=x.t||'';
  if(BH_RUN.includes(x.z)||(x.z==='test'&&/10k|time trial/i.test(t)))return {calves:1,quads:1,hams:.8,glutes:.8,abs:.3};
  if(x.z==='vert')return {glutes:1.3,calves:1.3,quads:1.2,hams:.6,lowerback:.3};
  if(x.z==='swim')return {shoulders:1,back:1,arms:.6,chest:.4};
  if(x.z==='gym'||x.z==='test'){
    if(/Gym A/.test(t))return {quads:1,glutes:1.2,hams:1,calves:.8,abs:.6,lowerback:.5};
    if(/Gym B|push-up|pull-up|dead hang/i.test(t))return {back:1.2,chest:1,shoulders:1,arms:1,abs:.4};
    if(/Core/.test(t))return {abs:1.2,obliques:1,lowerback:.5};
    return {quads:.7,glutes:.7,hams:.6,calves:.5,back:.7,chest:.7,shoulders:.7,arms:.6,abs:.6,obliques:.4};
  }
  return {};
}
/* Load per muscle from ticked sessions in the last 7 days. Fades linearly over 7 days. */
function bhLoad(){
  const t0=today0(),L={};
  for(let back=0;back<7;back++){
    const day=new Date(t0);day.setDate(day.getDate()-back);
    const n=Math.floor((day-START)/864e5);if(n<0)continue;
    const w=Math.floor(n/7),d=n%7;if(!W[w])continue;
    W[w].days[d].forEach((x,i)=>{if(!state.checks[id(w,d,i)])return;
      const k=Math.min(2,Math.max(.5,(x.m||40)/45))*(1-back/7);
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
  const last=w[w.length-1], base=w.slice(-29,-1);
  const stat=k=>{const v=base.map(x=>x[k]).filter(v=>v!=null);if(v.length<5)return null;const m=v.reduce((a,b)=>a+b,0)/v.length;
    const sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length)||1;return {m,sd}};
  const cl=v=>Math.max(0,Math.min(100,v)),H=stat('hrv'),R=stat('rhr');
  const ph=last.hrv!=null&&H?cl(70+15*(last.hrv-H.m)/H.sd):null;
  const pr=last.rhr!=null&&R?cl(70+15*(R.m-last.rhr)/R.sd):null;
  const ps=last.sleepScore!=null?last.sleepScore:last.sleepH!=null?cl(last.sleepH/8*100):null;
  const parts=[[ph,.4],[pr,.3],[ps,.3]].filter(p=>p[0]!=null);if(!parts.length)return null;
  const score=Math.round(parts.reduce((a,p)=>a+p[0]*p[1],0)/parts.reduce((a,p)=>a+p[1],0));
  const sl=w.slice(-7).map(x=>x.sleepH).filter(v=>v!=null),sleep7=sl.length?sl.reduce((a,b)=>a+b,0)/sl.length:null;
  return {score,last,H,R,sleep7,date:last.date};
}
async function bhFetch(){
  try{const c=window.HubSync&&HubSync.cfg();if(!c||!c.url)return;
    const r=await fetch(c.url+(c.url.includes('?')?'&':'?')+'t='+encodeURIComponent(c.tok)+'&action=wellness&days=35');
    const j=await r.json();if(j&&j.wellness){BH.well=j.wellness;try{localStorage.setItem('lifehub-wellness',JSON.stringify(j.wellness))}catch(e){}renderBody()}
  }catch(e){}
}
try{BH.well=JSON.parse(localStorage.getItem('lifehub-wellness')||'null')}catch(e){}

function bhBodySVG(load,view){
  const g=m=>Math.min(1,(load[m]||0)/1.6);
  const M=(m,shape)=>{const v=g(m);return `<g opacity="${(.12+.88*v).toFixed(2)}">${shape.replace(/FILL/g,v>.05?'url(#bhHot)':'rgba(190,230,150,.10)')}</g>`};
  const E=(cx,cy,rx,ry,r)=>`<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="FILL"${r?` transform="rotate(${r} ${cx} ${cy})"`:''}/>`;
  const pair=(cx,cy,rx,ry,r)=>E(100-cx,cy,rx,ry,r?-r:0)+E(100+cx,cy,rx,ry,r||0);
  const front=M('shoulders',pair(38,82,10,9))+M('chest',pair(14,93,14,10))+M('abs','<rect x="89" y="106" width="22" height="46" rx="9" fill="FILL"/>')
    +M('obliques',pair(24,128,7,17))+M('arms',pair(48,114,6,14,8)+pair(55,160,5,16,6))+M('quads',pair(16,240,11,33,3))+M('calves',pair(17,325,7,26));
  const backV=M('shoulders',pair(38,82,10,9))+M('back','<ellipse cx="100" cy="74" rx="22" ry="8" fill="FILL"/>'+pair(17,112,15,24,-6))
    +M('lowerback','<rect x="88" y="140" width="24" height="30" rx="9" fill="FILL"/>')+M('arms',pair(48,116,6,14,8))
    +M('glutes',pair(13,198,13,14))+M('hams',pair(16,246,10,30,3))+M('calves',pair(17,318,8,25));
  const sil=`<path d="M100,14 a17,20 0 1,1 -0.1,0 Z M92,52 h16 v14 h-16 Z
    M70,70 Q100,62 130,70 L138,80 Q143,120 133,150 L129,190 Q100,201 71,190 L67,150 Q57,120 62,80 Z
    M62,76 Q47,80 45,100 L39,150 Q35,176 38,204 L47,204 Q50,176 54,150 L61,112 Z M138,76 Q153,80 155,100 L161,150 Q165,176 162,204 L153,204 Q150,176 146,150 L139,112 Z
    M72,188 Q69,232 74,272 L76,300 Q73,342 78,384 L93,384 Q95,342 95,300 L98,242 L100,198 Z M128,188 Q131,232 126,272 L124,300 Q127,342 122,384 L107,384 Q105,342 105,300 L102,242 L100,198 Z"
    fill="url(#bhSkin)" stroke="rgba(200,240,150,.45)" stroke-width="1" filter="url(#bhEdge)"/>`;
  return sil+`<g filter="url(#bhGlow)">${view==='front'?front:backV}</g>`;
}
function renderBody(){
  const el=document.getElementById('bodyhub');if(!el)return;
  const load=bhLoad(),{c,items}=bhWeek(),R=bhReady(),t0=today0(),h=new Date().getHours();
  const hello=(h<12?'Good morning':h<18?'Good afternoon':'Good evening')+', Georgi';
  let head='Your body is ready to train.',sub='Connect wellness data to see your readiness.';
  if(R){head=R.score>=80?'Your body is doing well today.':R.score>=65?'A normal day. Train as planned.':R.score>=50?'Take it a bit easier today.':'Your body needs rest today.';
    sub=[R.last.hrv!=null&&R.H?`HRV ${R.last.hrv} ms (normal ${Math.round(R.H.m)})`:'',R.last.rhr!=null&&R.R?`Resting HR ${R.last.rhr} (normal ${Math.round(R.R.m)})`:'',
      R.last.sleepH!=null?`Sleep ${R.last.sleepH} h${R.last.sleepScore?' · score '+R.last.sleepScore:''}`:''].filter(Boolean).join(' · ');}
  const pct=k=>c[k][1]?Math.round(c[k][0]/c[k][1]*100):null;
  const sleepP=R&&R.sleep7?Math.min(100,Math.round(R.sleep7/8*100)):null;
  const nodes=[
    {k:'swim',n:'SWIM',x:38,y:70,to:[142,82],v:pct('swim')},
    {k:'str',n:'STRENGTH',x:38,y:180,to:[130,140],v:pct('str')},
    {k:'mob',n:'MOBILITY',x:38,y:295,to:[160,196],v:pct('mob')},
    {k:'rec',n:'RECOVERY',x:322,y:70,to:[196,36],v:sleepP,lbl:R&&R.sleep7?R.sleep7.toFixed(1)+'h':'—'},
    {k:'run',n:'RUN',x:322,y:200,to:[198,236],v:pct('run')},
    {k:'vert',n:'VERT',x:322,y:315,to:[198,322],v:pct('vert')}];
  const ring=(v)=>{const C=2*Math.PI*19,p=v==null?0:v/100;return `<circle r="19" fill="rgba(15,19,18,.9)" stroke="rgba(255,255,255,.10)" stroke-width="3"/>
    <circle r="19" fill="none" stroke="${p>=1?'#CFE8A8':'#FF8A3D'}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${(C*p).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>`};
  const svg=`<svg viewBox="0 0 360 420" role="img" aria-label="Body map: muscles worked in the last 7 days, and this week's progress by type">
    <defs>
      <radialGradient id="bhHot"><stop offset="0" stop-color="#FFD08A"/><stop offset=".55" stop-color="#FF8A3D"/><stop offset="1" stop-color="#FF8A3D" stop-opacity="0"/></radialGradient>
      <linearGradient id="bhSkin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2A3A2E"/><stop offset="1" stop-color="#151C18"/></linearGradient>
      <filter id="bhGlow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
      <filter id="bhEdge" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur in="SourceAlpha" stdDeviation="2" result="b"/><feFlood flood-color="#BFE88A" flood-opacity=".35"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <ellipse cx="180" cy="396" rx="70" ry="9" fill="rgba(191,232,138,.10)"/>
    ${nodes.map(n=>`<line x1="${n.x}" y1="${n.y}" x2="${n.to[0]}" y2="${n.to[1]}" stroke="rgba(191,232,138,.28)" stroke-width="1"/><circle cx="${n.to[0]}" cy="${n.to[1]}" r="2.6" fill="#CFE8A8"/>`).join('')}
    <g transform="translate(80,0)">${bhBodySVG(load,BH.view)}</g>
    ${nodes.map(n=>`<g class="bh-node" data-node="${n.k}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${n.n}: ${n.lbl||(n.v==null?'nothing planned':n.v+'% done')}">${ring(n.v)}
      <text y="4.5" text-anchor="middle" font-size="12" font-weight="800" fill="#E8ECE6">${n.lbl||(n.v==null?'—':n.v+'%')}</text>
      <text y="34" text-anchor="middle" font-size="9" font-weight="700" letter-spacing=".08em" fill="#A7B4AD">${n.n}</text></g>`).join('')}
  </svg>`;
  let pop='';
  if(BH.sel){const s=BH.sel,DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    if(s==='rec')pop=`<div class="bh-pop"><b>Recovery</b>${R?`<div class="on">Average sleep, last 7 nights: ${R.sleep7?R.sleep7.toFixed(1)+' h':'—'}</div><div>Ring is full at 8 hours.</div>`:'<div>No wellness data yet.</div>'}</div>`;
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
  el.innerHTML=`<div class="bh-hello">${hello}</div><div class="bh-head">${head}</div><div class="bh-sub">${sub}</div>
    <div class="bh-stage">${svg}<button class="bh-flip" id="bhFlip">${BH.view==='front'?'Show back':'Show front'}</button></div>
    <div class="bh-score"><div class="n">${R?R.score:'—'}</div><div class="l">Readiness</div><div class="x">${R?'Garmin data for '+R.date.split('-').reverse().slice(0,2).join('.'):'Needs the wellness update in Apps Script'}</div></div>${pop}${today}`;
}
document.addEventListener('click',e=>{
  if(e.target.closest('#bhFlip')){BH.view=BH.view==='front'?'back':'front';renderBody();return}
  const n=e.target.closest('.bh-node');if(n){BH.sel=BH.sel===n.dataset.node?null:n.dataset.node;renderBody()}
});
document.addEventListener('keydown',e=>{const n=e.target.closest&&e.target.closest('.bh-node');if(n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();n.dispatchEvent(new MouseEvent('click',{bubbles:true}))}});
window.addEventListener('load',()=>setTimeout(bhFetch,300));
