/* Season 2027 plan data. Shared by training/index.html and the life hub home page. */
/* ============ dates ============ */
const START=new Date(2026,9,26); // Mon 26 Oct 2026
const DN=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const dayDate=(w,d)=>{const x=new Date(START);x.setDate(x.getDate()+w*7+d);return x};
const fd=x=>x.getDate()+' '+MN[x.getMonth()];
const today0=()=>{const t=new Date();t.setHours(0,0,0,0);return t};
const RACES=[
 {k:'plo',n:'Plovdiv Marathon',d:new Date(2027,3,18,9),goal:'Sub-4:30',sub:'6:24/km, all-out',c:'var(--mara)',w:24},
 {k:'bai',n:'Asenovgradski Bairi 50k',d:new Date(2027,4,9,7),goal:'Finish',sub:'Beat cut-offs with a buffer',c:'var(--bairi)',w:27},
 {k:'vit',n:'Vitosha 100',d:new Date(2027,5,26,6),goal:'Finish',sub:'Date to confirm',c:'var(--vit)',w:34}
];

/* ============ strength: exact sets ============
   One source for the Plan and Strength tabs, the muscle glow (body.js) and the watch (garmin_push.py).
   EX: name, Garmin category, Garmin exercise, why, muscles "primary|secondary".
   Garmin keys and muscles: Garmin Connect's exercise list, github.com/mrnabilnoh/workout-plan-garmin-connect.
   * = our own: the list has no such exercise, or files it under the wrong muscle. */
const EX={
 boxjump:['Box jump (step down)','PLYO','BOX_JUMP','Explosive power. Fresh legs, full rest.','quads calves|hips glutes hamstrings'],
 kbswing:['Kettlebell swing','HIP_RAISE','KETTLEBELL_SWING','Hip drive.','glutes hips|quads lats abs hamstrings shoulders'],
 trapbar:['Trap bar deadlift','DEADLIFT','TRAP_BAR_DEADLIFT','Whole-body strength. RPE 8 or less.','hamstrings quads glutes lower_back|lats traps forearm adductors'],
 split:['Bulgarian split squat','LUNGE','DUMBBELL_BULGARIAN_SPLIT_SQUAT','Single-leg strength for climbs.','quads glutes|hamstrings'],
 slrdl:['Single-leg RDL','DEADLIFT','SINGLE_LEG_RDL_CIRCUIT','Hamstrings, glute med, ankle balance. Hips stay level.','hamstrings lower_back|traps lats glutes adductors'],
 stepdown:['Eccentric step-down, 30 cm box','SQUAT','BOX_STEP_SQUAT','Quads for long descents (Bairi, Vitosha).','quads glutes|calves hamstrings hips'],
 stepup:['Step-up','SQUAT','STEP_UP','Climbing strength.','quads glutes|hamstrings calves hips'],
 calf:['Single-leg calf raise, on a step','CALF_RAISE','SINGLE_LEG_STANDING_CALF_RAISE','Achilles. Full range.','calves'],
 seatedcalf:['Seated calf raise','CALF_RAISE','SEATED_CALF_RAISE','Soleus: the main calf muscle at running pace.','calves'],
 tib:['Tib raise','CALF_RAISE','SEATED_DUMBBELL_TOE_RAISE','Shins, foot control on descents.','shin'], // * Garmin says calves
 spanish:['Spanish squat hold (band behind knees)','SQUAT','BODY_WEIGHT_WALL_SQUAT','Patellar tendon, knee pain on descents.','quads glutes|hamstrings'],
 sidewalk:['Banded side walks','BANDED_EXERCISES','LATERAL_BAND_WALKS','Glute med: stops hip drop and IT band pain.','abductors|glutes'],
 cossack:['Cossack squat, bodyweight','LUNGE','SIDE_LUNGE','Groin strength and hip mobility.','quads glutes|hamstrings adductors abductors'],
 deadbug:['Dead bug','HIP_STABILITY','DEAD_BUG','Core holds the back still while legs move.','abs shoulders hips|quads hamstrings'],
 pallof:['Pallof press','CORE','CABLE_CORE_PRESS','Core resists rotation on every stride.','abs|shoulders'],
 plank:['Plank','PLANK','PLANK','','abs|shoulders'],
 pullup:['Pull-ups (band if needed)','PULL_UP','PULL_UP','','lats traps|biceps forearm shoulders'],
 pushup:['Push-ups','PUSH_UP','PUSH_UP','','chest|abs shoulders triceps'],
 pike:['Pike push-ups','PUSH_UP','PIKE_PUSH_UP','','chest shoulders|triceps'],
 row:['Rows: dumbbell or band','ROW','DUMBBELL_ROW','','lats traps|biceps lower_back shoulders'],
 bandrow:['Band rows','BANDED_EXERCISES','ROW','','lats traps|biceps lower_back shoulders'],
 ohp:['Overhead press: dumbbells, or pike push-ups at home','SHOULDER_PRESS','DUMBBELL_SHOULDER_PRESS','','shoulders|chest triceps traps'],
 hang:['Dead hang','PULL_UP','','','forearm|lats shoulders'], // * no Garmin exercise: the watch shows "Pull Up"
 facepull:['Band face pulls','ROW','BANDED_FACE_PULLS','','shoulders traps'],
 squat:['Air squats','SQUAT','AIR_SQUAT','','quads glutes|hamstrings'],
 jumpsquat:['Jump squats','PLYO','JUMP_SQUAT','','quads calves glutes|hamstrings hips'],
 sally:['Bring Sally Up (push-ups)','PUSH_UP','PUSH_UP','To the song: down on "down", up on "up".','chest|abs shoulders triceps'],
 rower:['Rower','ROW','INDOOR_ROW','','lats traps quads|biceps lower_back shoulders'],
 farmer:['Farmer carry','CARRY','FARMERS_WALK','','forearm|hamstrings quads lower_back traps shoulders'],
 thruster:['Thrusters','SQUAT','THRUSTERS','','quads glutes shoulders|abs calves chest hamstrings hips lower_back traps triceps forearm'],
};
/* Away from home there are only bands and bodyweight: the hotel sessions need nothing else.
   A session is a list of blocks [rounds, rows, note]; a row is [exercise, amount, how].
   Amount: reps (a number), or '45 s', '10 min', '3:30', '500 m', 'max'. Straight sets are one row; a circuit has several. */
const X=(n,k,a,h)=>[n,[[k,a,h||'']]];
const GYM={
 A:[X(4,'boxjump',3),X(4,'kbswing',15,'16 kg, then 20 kg when easy'),X(4,'trapbar',5,'3 s down'),X(3,'split',8,'each leg, 3 s down'),
    X(3,'slrdl',8,'each leg, 3 s down'),X(3,'stepdown',8,'each leg, 5 s down'),X(4,'calf',8,'each leg, 3 s up, 3 s down')],
 B:[X(5,'pullup','max','2 reps short of max'),X(4,'pushup','max','3 reps short of max'),X(3,'row',12),X(3,'ohp',8),X(3,'hang','max'),X(2,'facepull',15)],
 core:[X(3,'spanish','45 s'),X(3,'sidewalk',15,'steps each way'),X(3,'cossack',8,'each side'),X(3,'tib',20),X(3,'seatedcalf',12,'slow'),
    X(3,'deadbug',8,'each side'),X(3,'pallof',10,'each side')],
 C1:[[10,[['pullup',5],['pushup',10],['squat',15]],'As many rounds as you can in 15 min at a steady pace. Stop at 15 min.']],
 C2:[X(5,'rower','500 m','1 min rest between'),X(3,'farmer','40 m')],
 C3:[X(1,'sally','3:30'),X(1,'rower','15 min','easy, or ski erg')],
 easy:[X(1,'rower','10 min','easy'),[3,[['pullup',5],['pushup',10],['squat',15]],'Easy rounds, not timed.']],
 hotelB1:[X(1,'sally','3:30'),[3,[['bandrow',15],['pike',8],['plank','40 s']],'']],
 hotelC:[[5,[['bandrow',10],['pushup',10],['squat',15]],'15 min, steady, not hard. Stop at 15 min.']],
 activation:[X(3,'boxjump',3,'no weights')],
 upper:[X(2,'pushup','max','light, stop well short'),X(2,'row',12,'light')],
 legs:[X(3,'stepup',10,'each leg'),X(3,'split',8,'each leg'),X(3,'calf',12,'each leg'),X(3,'tib',20)],
 hotelA:[X(4,'jumpsquat',6),X(3,'slrdl',10,'each leg, bodyweight or band'),X(3,'split',10,'each leg, band under the front foot for load'),X(3,'stepup',12,'each leg, bench or stairs'),X(3,'calf',20)],
 hotelBaway:[X(4,'pushup','max','3 reps short of max'),X(4,'bandrow',15),X(3,'pike',8),X(3,'plank','40 s')],
};
/* A week's version: sets caps every block, drop removes exercises, set changes one exercise's [amount, how]. */
const gym=(k,o={})=>GYM[k].filter(b=>!b[1].every(r=>(o.drop||[]).includes(r[0])))
  .map(b=>[o.sets?Math.min(b[0],o.sets):b[0],b[1].map(r=>o.set&&o.set[r[0]]?[r[0],...o.set[r[0]]]:r),b[2]]);
const A4={set:{trapbar:[4,'heavier, RPE 8, 3 s down']}};               // from January
const AM={...A4,drop:['stepdown']};                                    // marathon block: 2 sessions a week, flat race
const GS=(t,d,m,k)=>S('gym',t,d,m,{ex:gym(k)});

/* ============ session builders ============ */
const S=(z,t,d,m,x)=>Object.assign({z,t,d,m},x||{});
const EZ='HR 148–160. You can talk in full sentences.';
const E=(m,x)=>S('easy',`Easy run ${m} min`,x||EZ,m);
const R=(m,x)=>S('rec',`Recovery run ${m} min`,x||'HR under 148. As easy as it gets. Do it, then go home.',m);
const L=(t,d,m)=>S('easy',t,d,m,{long:1});
const V=(vert,m,x)=>S('vert',`Mladezhki Halm vert, ~${vert} m`,x||'Hike up hard but controlled, jog down easy. Hiking is training, not failure.',m);
const ST=(t,d,m)=>S('st',t,d,m,{key:1,then:'stretch'});
const HD=(t,d,m)=>S('hard',t,d,m,{key:1,then:'stretch'});
const MPS=(t,d,m)=>S('mp',t,d,m,{key:1,then:'stretch'});
const GA=(x,o)=>S('gym','Gym A: lower body and power',x||'45 min, after the run. Slow lowering on every lift.',45,{g:'A',ex:gym('A',o),then:'stretch'});
const GB=(x,o)=>S('gym','Gym B: upper body',x||'30 min, home or gym.',30,{g:'B',ex:gym('B',o)});
const GC=(v)=>S('gym','Hybrid session '+v,'25–30 min, low leg load. RPE 6–7.',28,{g:'C',ex:gym(v)});
const CORE=()=>S('gym','Core + hips 25 min','Holds and control only. Light: legs must be fresh for Friday.',25,{ex:gym('core')});
const SWIM=(m)=>S('swim',`Recovery swim ${m||'20–30'} min`,'Easy, any stroke. Loosens the legs. Not a workout.',25,{then:'rest'});
const REST=()=>S('rest','Rest','Yoga and stretching only.',0,{then:'rest'});
const T=(t,d,m)=>S('test',t,d,m||25,{test:1});
const RACE=(t,d)=>S('race',t,d,0,{race:1});
const WU=m=>`Warm up 15 min easy with 4 strides. ${m} Cool down 10 min.`;
const float=(n,f)=>MPS(`${n}×800 m with floats`,WU(`${n}×800 m at 5:15/km (4:12 each). Between reps, no stopping: 400 m float at ${f}/km. Goal: hold marathon pace on tired legs.`),70);
const subT=(t,m)=>ST(`Sub-threshold ${t}`,WU(`${t} at HR 170–176. Controlled. You could do one more rep at the end.`),m);
const fourx4=()=>HD('Norwegian 4×4',WU(`4×4 min at HR 188–200, 3 min easy jog between. Hard, but rep 4 is the same pace as rep 1.`),55);

/* ============ phases ============ */
const PH={base:['Base','var(--base)'],build:['Build 1','var(--build)'],mara:['Marathon block','var(--mara)'],taper:['Taper','var(--taper)'],bairi:['Bairi','var(--bairi)'],vit:['Vitosha','var(--vit)']};

/* ============ the season: 35 weeks ============
   each week: phase, title, target, vert, light(deload), why, days[Mon..Sun] */
const W=[];
const wk=(p,title,km,vert,why,days,o)=>W.push(Object.assign({p,title,km,vert,why,days},o||{}));

/* --- BASE --- */
wk('base','Return to running','22 km','~200 m','<b>All easy.</b> You are 2 weeks off after the marathon. Strength stops 2–3 reps before failure. Learn the gym movements.',[
 [E(30,'HR under 150. First run back. Start slower than feels natural.'),GA('Technique week: about 70% loads, 2 sets each, no jumps. Learn the movements.',{sets:2,drop:['boxjump']})],
 [E(35,'HR under 150. Finish with 4×20 s strides, walk back between.'),GB('Light: 3 sets each, stop 3 reps short.',{sets:3})],
 [V(200,45,'2 laps. Hike up, jog down easy.')],
 [E(30),CORE()],
 [L('Long easy run 60 min','HR under 155. Time, not distance.',60)],
 [SWIM()],
 [GS('Rower + easy circuit','Easy. Not timed.',25,'easy')]
],{light:1});
wk('base','Baseline tests','26 km','~300 m','<b>Test week.</b> These numbers set your challenge targets. Rest 5–10 min between tests on the same day.',[
 [E(30,'Easy, then 4×20 s strides.'),T('Test: broad jump + 2k row','Broad jump: best of 3, measure toe to heel. Then 2k row all-out (damper 4–5). Write both in Challenges.',30)],
 [E(35),T('Test: dead hang, max pull-ups, Bring Sally Up','In this order, 5–10 min rest between. Strict pull-ups, full hang.',30)],
 [V(300,50,'3 laps.')],
 [E(35),T('Test: max push-ups','One set, chest to fist height, no rest at the top.',5),CORE()],
 [L('Long easy run 70 min','HR under 155.',70)],
 [SWIM()],
 [T('Test: Cindy','20 min: 5 pull-ups, 10 push-ups, 15 air squats, as many rounds as you can. Use a band for pull-ups if needed and write the band down.',30)]
]);
wk('base','First sub-threshold','30 km','~350 m','<b>Monday is your first quality day.</b> Sub-threshold should feel controlled, never a fight.',[
 [subT('5×5 min, 1 min jog',55),GA()],
 [E(35),GB()],
 [V(350,55,'3–4 laps.')],
 [E(40),CORE()],
 [L('Long easy run 75 min','HR under 155.',75)],
 [SWIM()],
 [T('Test: Fran, scaled','21-15-9: thrusters at 30 kg and pull-ups. Learn the thruster first: 3×5 light before you start the clock.',30)]
]);
wk('base','Build','33 km','~400 m','First Rodopi day of the season on Friday.',[
 [subT('6×5 min, 1 min jog',60),GA()],
 [E(40,EZ+' Finish with 4×20 s strides.'),GB()],
 [V(400,60,'4 laps.')],
 [E(40),CORE()],
 [L('Rodopi trail day 1:30','Easy on trails. Hike the steep parts. Eat something at 45 min.',90)],
 [SWIM()],
 [GC('C1')]
]);
wk('base','Build','36 km','~450 m','Last build week before the trip.',[
 [subT('5×6 min, 1 min jog',60),GA()],
 [E(40),GB()],
 [V(450,60,'4 laps.')],
 [E(45),CORE()],
 [L('Long easy run 90 min','HR under 155. Take a gel or snack at 60 min.',90)],
 [SWIM()],
 [GC('C2')]
]);
wk('base','Trip week (lighter)','~22 km','—','<b>Deload week.</b> If the trip dates move, move this week with them. Hotel sessions need no gym.',[
 [E(30,EZ+' Add 4×20 s strides.')],
 [E(35),GS('Hotel upper body','Bring Sally Up, then 3 rounds.',20,'hotelB1')],
 [E(35,'Hills if there are any. Otherwise easy.')],
 [E(30),CORE()],
 [L('Long easy run 60 min','Explore the place.',60)],
 [REST()],
 [GS('Hotel circuit','15 min easy. Steady, not hard.',20,'hotelC')]
],{light:1});
wk('base','Build','38 km','~500 m','Sub-threshold reps get longer. Recovery between them stays short.',[
 [subT('4×7 min, 1:30 jog',60),GA()],
 [E(40),GB()],
 [V(500,65,'4–5 laps.')],
 [E(45),CORE()],
 [L('Long easy run 1:40','About 14–15 km. HR under 155. Fuel every 40 min.',100)],
 [SWIM()],
 [GC('C3')]
]);
wk('base','Build','42 km','~600 m','<b>Half Murph on Sunday.</b> Steady effort, not a race.',[
 [subT('4×8 min, 1:30 jog',65),GA()],
 [E(45,EZ+' Finish with 4×20 s strides.'),GB()],
 [V(600,75,'5–6 laps.')],
 [E(45),CORE()],
 [L('Rodopi trail day 1:50','Run-hike. Practise eating every 30–40 min.',110)],
 [SWIM()],
 [S('test','Half Murph','800 m run, 50 pull-ups, 100 push-ups, 150 air squats, 800 m run. Split it as 10 rounds of 5/10/15. No vest. Log your time in Challenges.',45,{test:1})]
]);
wk('base','Build, Christmas week','45 km','~600 m','Friday is Christmas Day. Move the long run to Thu or Sat if needed, and swap with the easy day.',[
 [subT('3×10 min, 2 min jog',65),GA()],
 [E(45),T('Retest: dead hang, max pull-ups, Bring Sally Up','Replaces Gym B this week.',25)],
 [V(600,75,'5–6 laps.')],
 [E(45),T('Retest: max push-ups','One set.',5),CORE()],
 [L('Long easy run 2:00','About 17 km. HR under 155. Fuel every 40 min.',120)],
 [SWIM()],
 [GC('C1')]
]);
wk('base','New Year trip (lighter)','~30 km','—','<b>Deload week.</b> Friday is 1 January. Keep it easy and enjoy it.',[
 [E(35,EZ+' Add 4×20 s strides.')],
 [E(40),GS('Hotel upper body','Bring Sally Up, then 3 rounds.',20,'hotelB1')],
 [E(40,'Hills if there are any.')],
 [E(35),CORE()],
 [L('Long easy run 75 min','Relaxed.',75)],
 [REST()],
 [GS('Hotel circuit','15 min easy. Steady, not hard.',20,'hotelC')]
],{light:1});

/* --- BUILD 1 --- */
wk('build','Build 1 starts','46 km','~700 m','Volume and vert go up. Speed stays sub-threshold, with 4×4 every second week.',[
 [subT('3×10 min, 1 min jog',65),GA('Heavier now: trap bar deadlift 4×4 at RPE 8.',A4)],
 [E(45),GB()],
 [V(700,85,'6 laps, or a longer hill route.')],
 [E(50),CORE()],
 [L('Long run 19 km','HR under 155. About 2:05. Fuel every 40 min.',125)],
 [SWIM()],
 [GC('C2')]
]);
wk('build','First 4×4','50 km','~800 m','<b>Norwegian 4×4 on Monday</b> builds your 10k speed.',[
 [fourx4(),GA(0,A4)],
 [E(50),GB()],
 [V(800,90,'7 laps.')],
 [E(50),CORE()],
 [L('Rodopi trail day 2:30','Run-hike, about 18–20 km. Eat every 30–40 min.',150)],
 [SWIM()],
 [GC('C3')]
]);
wk('build','Build','54 km','~900 m','Biggest week so far. If the morning HR is high, swap Monday and Tuesday.',[
 [subT('3×12 min, 2 min jog',70),GA(0,A4)],
 [E(50,EZ+' Finish with 4×20 s strides.'),GB()],
 [V(900,95,'8 laps.')],
 [E(55),CORE()],
 [L('Long run 23 km','HR under 155. About 2:40. Fuel every 40 min.',160)],
 [SWIM()],
 [GC('C1')]
]);
wk('build','Lighter week + retest','40 km','~500 m','<b>Deload and full retest.</b> Fresh legs give honest numbers.',[
 [E(40,EZ+' Add 4×20 s strides.'),T('Retest: broad jump + 2k row','Same order as November.',30)],
 [E(40),T('Retest: dead hang, max pull-ups, Bring Sally Up','',30)],
 [V(500,60,'4 laps, easy.')],
 [E(40),T('Retest: max push-ups','',5),CORE()],
 [L('Long easy run 18 km','HR under 155.',125)],
 [SWIM()],
 [T('Retest: Cindy','Same band as November, or less.',30)]
],{light:1});
wk('build','Build','54 km','~1,000 m','Vert reaches 1,000 m a week. This is what carries Bairi and Vitosha.',[
 [fourx4(),GA(0,A4)],
 [E(50),GB()],
 [V(1000,105,'9 laps, or a hill route with 1,000 m.')],
 [E(55),CORE()],
 [L('Rodopi trail day 2:45','Run-hike, about 22 km. Eat every 30–40 min.',165)],
 [SWIM()],
 [T('Retest: Fran','Go up from 30 kg if the bar moved fast in November. Target 43 kg by summer.',30)]
]);
wk('build','Last Build 1 week','56 km','~1,000 m','First marathon-pace work in the long run.',[
 [subT('2×15 min, 3 min jog',65),GA(0,A4)],
 [E(50),GB()],
 [V(1000,105)],
 [E(55),CORE()],
 [L('Long run 24 km, last 5 at marathon pace','19 km easy, then 5 km at 6:24/km. About 2:45.',165)],
 [SWIM()],
 [GC('C2')]
]);

/* --- MARATHON BLOCK --- */
wk('mara','Marathon block starts','58 km','~800 m','<b>Cat\'s structure:</b> Monday 800s with floats, Tuesday recovery as soon as possible. Strength drops to 2 days. Sunday becomes a recovery run.',[
 [float(6,'7:15'),GA('2 sessions a week from now. Same session minus the step-downs: the marathon is flat.',AM)],
 [R(40),GB()],
 [V(800,85)],
 [E(45),CORE()],
 [L('Long run 24 km','HR under 155. Practise race fuel: a gel every 30–35 min.',165)],
 [SWIM()],
 [R(25)]
]);
wk('mara','Marathon block','60 km','~800 m','Floats get faster. The 800s stay at 5:15/km.',[
 [float(7,'7:00'),GA(0,AM)],
 [R(40),GB()],
 [V(800,85)],
 [E(50),CORE()],
 [L('Long run 26 km','HR under 155. Race fuel every 30–35 min.',180)],
 [SWIM()],
 [R(30)]
]);
wk('mara','10k test week (lighter)','45 km','~500 m','<b>10k time trial on Friday.</b> Goal: sub-50. Also an upper body retest.',[
 [MPS('4×1 km at 10k pace',WU(`4×1 km at 5:00/km, 2 min jog between. A sharpener, not a test.`),50),GA('Light: 2 sets each, no heavy deadlifts.',{sets:2,drop:['stepdown'],set:{trapbar:[5,'light, about 60%']}})],
 [R(40),T('Retest: dead hang, max pull-ups, Bring Sally Up','Replaces Gym B.',25)],
 [V(500,60,'Easy.')],
 [E(40,EZ+' Add 4×20 s strides.'),CORE()],
 [HD('10k time trial','Warm up 20 min with 4 strides. Flat route. Start at 5:05/km, settle at 5:00, finish fast. Cool down 10 min. Goal: under 50:00.',85)],
 [SWIM()],
 [R(30)]
],{light:1});
wk('mara','Marathon block','62 km','~700 m','Marathon-pace blocks in the long run.',[
 [float(8,'6:45'),GA(0,AM)],
 [R(40),GB()],
 [V(700,80)],
 [E(50),CORE()],
 [L('Long run 28 km with 2×5 km at marathon pace','Easy, then 2×5 km at 6:24/km in the second half, 1 km easy between. Race fuel.',195)],
 [SWIM()],
 [R(30)]
]);
wk('mara','Peak week','65 km','~600 m','<b>Biggest week of the marathon build.</b> Sleep and eat like it matters.',[
 [float(8,'6:30'),GA(0,AM)],
 [R(40),GB()],
 [V(600,70)],
 [E(50),CORE()],
 [L('Long run 30 km, last 8 at marathon pace','Stop at 3:30 even if short. Last 8 km at 6:24/km. Race fuel.',210)],
 [SWIM()],
 [R(30)]
]);
wk('mara','Dress rehearsal','60 km','~500 m','<b>Friday is the dress rehearsal:</b> race kit, race breakfast, race gels.',[
 [float(10,'6:24'),GA(0,AM)],
 [R(40),GB()],
 [V(500,60)],
 [E(50),CORE()],
 [MPS('Dress rehearsal 26 km','5 km easy, 18 km at 6:24/km, 3 km easy. Everything as on race day.',175)],
 [SWIM()],
 [R(30)]
]);

/* --- TAPER --- */
wk('taper','Taper 1','52 km','~300 m','Volume drops, intensity stays. <b>Last full leg session this week.</b>',[
 [float(6,'6:24'),GA('Last heavy session: 2 sets each. No new loads.',{...AM,sets:2})],
 [R(40),GB()],
 [V(300,40,'2–3 laps, easy.')],
 [E(45),CORE()],
 [L('Long run 22 km with 10 at marathon pace','12 km easy, 10 km at 6:24/km.',150)],
 [SWIM()],
 [R(30)]
],{light:1});
wk('taper','Taper 2','43 km','—','<b>No heavy legs from now.</b> 10 days to race.',[
 [MPS('3×2 km at marathon pace',WU(`3×2 km at 6:24/km, 3 min easy between.`),60),GS('Activation only','Box jumps, then mobility. 10 min.',15,'activation')],
 [R(35),GB('Light: 2 sets each.',{sets:2})],
 [E(40,'Flat. No vert.')],
 [E(35,EZ+' Add 4×20 s strides.'),CORE()],
 [L('Long run 15 km with 6 at marathon pace','9 km easy, 6 km at 6:24/km.',100)],
 [SWIM()],
 [R(25)]
],{light:1});
wk('taper','Race week: Plovdiv','42.2 km race','—','<b>Race Sunday.</b> Nothing new. Sleep Friday night counts most.',[
 [E(35,'Include 3×1 km at 6:24/km.')],
 [R(30),GS('Upper body, optional','Skip it if in doubt.',15,'upper')],
 [E(30,EZ+' Add 4 strides.')],
 [R(20)],
 [REST()],
 [S('rec','Shakeout 15 min + 3 strides','Lay out kit, pin the bib, set the watch. Carb-load from Friday.',15)],
 [RACE('Plovdiv Marathon','Goal sub-4:30. Km 1–5 at 6:30–6:35. Km 5–30 at 6:22–6:25. HR cap 166 in the first half. After 30 km, race. Gel every 30–35 min.')]
],{race:'plo'});

/* --- BAIRI --- */
wk('bairi','Recover from Plovdiv','~15 km','—','<b>Recover first.</b> Running starts Thursday only if nothing hurts. Bairi fitness comes from the winter, not these 3 weeks.',[
 [S('rec','Walk 30 min','Easy. Legs will be sore.',30),SWIM('15–20')],
 [REST()],
 [SWIM()],
 [R(20,'Only if walking is pain-free.')],
 [R(30)],
 [SWIM()],
 [E(40)]
],{light:1});
wk('bairi','Trail reminder','~38 km','~800 m','One long trail day to wake up the climbing legs and practise descents.',[
 [E(40,EZ+' Add 4×20 s strides.')],
 [E(45),GB('Short: 2 sets each.',{sets:2})],
 [V(600,70,'Hike-focused. Practise running the descents with quick, short steps.')],
 [E(40),CORE()],
 [L('Trail long 2:30–3:00 on Bairi hills','On the course if you can. Hike all climbs. Eat every 30 min. Note your time on the climbs.',170)],
 [SWIM()],
 [R(30)]
]);
wk('bairi','Race week: Bairi','50 km race','~2,200 m race','<b>Finish with a buffer.</b> Write your checkpoint targets in Races before Saturday.',[
 [E(40,EZ+' Add 4 strides.')],
 [E(35),GS('Upper body, optional','Skip it if in doubt.',15,'upper')],
 [V(200,40,'2 laps, very easy.')],
 [E(30)],
 [E(20,EZ+' Add 3 strides.')],
 [REST()],
 [RACE('Asenovgradski Bairi 50 km','Hike every climb from the start. Eat every 30 min. Descents controlled. Hit each checkpoint 30–60 min inside the cut-off.')]
],{race:'bai'});

/* --- VITOSHA --- */
wk('vit','Recover from Bairi','~12 km','—','<b>10 days of recovery.</b> Easy movement only.',[
 [S('rec','Walk 30 min','',30),SWIM('15–20')],
 [REST()],
 [SWIM()],
 [S('rec','Hilly walk 45 min','',45)],
 [R(30,'Only if pain-free.')],
 [SWIM()],
 [E(40)]
],{light:1});
wk('vit','Vitosha build 1','~5 h','~1,000 m','<b>Back-to-back weekends start:</b> Friday long, Saturday long, Sunday rest. Count hours, not km.',[
 [E(45),GS('Short legs','20 min.',20,'legs')],
 [E(45),GB('Short: 3 sets.',{sets:3})],
 [V(700,80)],
 [E(40),CORE()],
 [L('Trail long 2:30','Run-hike. Eat every 30 min.',150)],
 [L('Back-to-back 1:30','Hike-run on tired legs. This is the point.',90)],
 [SWIM()]
]);
wk('vit','Vitosha build 2','~7 h','~1,400 m','Long day goes to the Rodopi.',[
 [E(50),GS('Short legs','20 min.',20,'legs')],
 [E(45),GB('Short: 3 sets.',{sets:3})],
 [V(900,95)],
 [E(45),CORE()],
 [L('Rodopi trail day 3:30','Run-hike with full race pack. Eat every 30 min.',210)],
 [L('Back-to-back 2:00','Hike-run.',120)],
 [SWIM()]
]);
wk('vit','Vitosha build 3','~9 h','~1,800 m','<b>Course recon on Vitosha</b> if you can get there.',[
 [E(50),GS('Short legs','20 min.',20,'legs')],
 [E(45),GB('Short: 3 sets.',{sets:3})],
 [V(1000,105)],
 [E(45),CORE()],
 [L('Vitosha recon 4:30','A section of the course. Race pack, race food, poles if you will use them.',270)],
 [L('Back-to-back 2:30','Hike-run.',150)],
 [SWIM()]
]);
wk('vit','Vitosha peak','~10 h','~2,000 m','<b>Night practice.</b> Finish Friday\'s run in the dark with your headlamp. Full kit test.',[
 [E(45)],
 [E(45),GB('Short: 2 sets.')],
 [V(1000,105)],
 [E(40),CORE()],
 [L('Trail long 5:00, last 2 h after dark','Headlamp, full mandatory kit, race food. Walk all climbs.',300)],
 [L('Back-to-back 3:00','Hike-run on tired legs.',180)],
 [SWIM()]
]);
wk('vit','Vitosha taper','~6 h','~800 m','Volume drops. Keep the legs moving.',[
 [E(45)],
 [E(40),GB('Light: 2 sets.',{sets:2})],
 [V(500,60)],
 [E(40),CORE()],
 [L('Trail long 3:00','Relaxed.',180)],
 [L('Hike-run 1:30','Easy.',90)],
 [REST()]
],{light:1});
wk('vit','Race week: Vitosha','100 km race','~2,300 m race','<b>Race date to confirm.</b> When the 2027 date is out, move this week to fit.',[
 [E(40)],
 [E(30,EZ+' Add 4 strides.')],
 [E(30,'Easy hills.')],
 [R(20)],
 [REST()],
 [RACE('Vitosha 100','Walk every climb from the start. Eat every 30 min, from the first hour. Headlamp ready before dark. Just finish.')],
 [REST()]
],{race:'vit'});

/* ============ yoga routines: post-training stretch, rest-day flow ============
   From two Breathe and Flow videos (Georgi's transcripts, 26 Oct 2026), in our own words. Sessions name theirs in
   `then`. They also go to the watch as Garmin yoga workouts (garmin_push.py). A step: [what, seconds, how, Garmin
   category, Garmin pose], poses from connect.garmin.com/web-data/exercises/Yoga.json. side(...) = left, then right. */
const side=(...st)=>[...st.map(s=>[...s,'Left']),...st.map(s=>[...s,'Right'])];
const ROUTINE={
 stretch:{t:'Post-training stretch',then:'Then',video:'Do This After Training to Recover Faster',when:'After Gym A and the key runs, while you are still warm. Hips, quads, hamstrings and shoulders. No load, so it is fine with sore legs.',steps:[
  ['Deep squat',30,'Arrive. Slow the breath, nose only.','POSE','SQUAT_PALM_PRESS'],
  ...side(['Lizard lunge',60,'Hands inside the front foot. Circle the hips, then up and down.','POSE','LIZARD'],
    ['Back knee down, hold the back foot',45,'Push the foot away, then pull it in. Squeeze the back glute. Gentle on sore knees.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Lunge to half split',40,'4 breaths: inhale forward, exhale legs straight and hips back.','POSE','RUNNERS_LUNGE']),
  ['Downward dog, knees bent',60,'Chest to the thighs for the shoulders, then heels down.','POSE','DOWNWARD_FACING_DOG'],
  ['Down dog to upward dog',45,'4 times. Roll through the spine, glutes on.','POSE','UP_DOG'],
  ['Forward fold, hands joined behind the back',45,'Arms over the head. Bend the knees as needed.','POSE','STANDING_FORWARD_BEND'],
  ['Reverse tabletop',45,'4 times: hips up and hold, then lower and lift with straight legs.','POSE','UPWARD_FACING_PLANK'],
  ['Seated shoulder stretch',30,'Hands behind, hips down, elbows back. Go gently.','MOVE','ARM_STRETCH'],
  ['Hang from a bar, if there is one',45,'','MOVE','STAND_AND_HANG'],
  ['Seated breathing',60,'Long inhales, slower exhales.','MOVE','RIBCAGE_BREATHING']]},
 rest:{t:'Rest-day flow',then:'Also',video:'Your Body Needs This on Rest Days',when:'Rest days and swim days. Gentle: move, breathe, slow down. Breathe 5–6 s in, 5–6 s out.',steps:[
  ["Child's pose, knees wide",100,'Forehead down, walk the hands forward.','POSE','CHILDS'],
  ['Cat-cow',80,'Slow rounds.','CORE','CAT_COW'],
  ['Downward dog, walk the dog',90,'Bend one knee, then the other. Then settle, heels down.','POSE','DOWNWARD_FACING_DOG'],
  ...side(['Three-legged dog, hip open',20,'Knee bent, hips stacked, then square them.','POSE','DOWN_DOG_SPLIT_OPEN_HIP_BENT_KNEE'],
    ['Lizard lunge',60,'Move the hips any way that feels good.','POSE','LIZARD'],
    ['Lizard to half split',40,'3 times: exhale hips back and legs straight, inhale forward.','POSE','RUNNERS_LUNGE']),
  ['Forward fold, holding opposite elbows',40,'Legs straight, head heavy.','POSE','STANDING_FORWARD_BEND'],
  ['Forward fold, hands joined behind the back',30,'Arms up and over the head.','POSE','STANDING_FORWARD_BEND'],
  ['Sphinx',80,'Feet wide, forearms down. Press up into seal for more.','POSE','SPHINX'],
  ...side(['Prone twist',45,'On the belly, one arm out, the other foot over behind the knee.','MOVE','SPINAL_TWIST']),
  ['Bridge',60,'5 breaths.','POSE','BRIDGE'],
  ...side(['Figure four on the back',55,'Ankle over the knee, pull in, feet flexed. Back off if the knee hurts.','MOVE','PIRIFORMIS_STRETCH']),
  ['Happy baby',60,'Knees towards the armpits. Straighten one leg, then the other.','MOVE','HIP_STRETCH'],
  ['Plow, optional',40,'Gap between chin and chest.','POSE','PLOW'],
  ['Reclined butterfly',120,'Soles together, knees open. Steady breath.','POSE','BOUND_ANGLE'],
  ['Seated, hands at the heart',30,'','POSE','EASY_SEATED']]},
 recovery:{t:'Recovery for strength days',video:'The Recovery Practice Your Strength Training Is Missing',when:'Opens the body in every direction, then a minute of stillness.',steps:[
  ["Child's pose",40,'Knees apart, hips heavy.','POSE','CHILDS'],
  ...side(['Bird dog, elbow to knee',30,'Opposite arm and leg long, then touch, then long again.','CORE','ARM_AND_LEG_EXTENSION_ON_KNEES'],
    ['Supported side plank, lift the knee',20,'Hold 5 s.','PLANK','SIDE_PLANK'],
    ['Gate side stretch',40,'Leg out to the side, top arm over the head, breathe into the side.','POSE','GATE'],
    ['Side plank, top leg up',15,'Hold 5 s.','PLANK','SIDE_PLANK'],
    ['Three-legged dog to one-leg plank, knee to chest',30,'Slow.','POSE','DOWN_DOG_SPLIT'],
    ['Crescent lunge, back knee low',30,'Low or high, as you need.','POSE','HIGH_LUNGE'],
    ['Plank, lower down, to down dog',30,'Slow the breath.','POSE','DOWNWARD_FACING_DOG']),
  ['Deep squat',30,'No weights. Sit comfortably.','POSE','SQUAT_PALM_PRESS'],
  ['Reverse tabletop',30,'3 times: hips up, then lower and lift with straight legs.','POSE','UPWARD_FACING_PLANK'],
  ['Seated, one minute of stillness',60,'Breath through the nose.','POSE','EASY_SEATED']]},
 reset:{t:'Short yin reset',video:'The 15 Minute Reset Your Body Needs After Pushing Hard',when:'Four long holds. Relax into each pose, do not force it.',steps:[
  ['Sphinx',180,'Legs wide, elbows under the shoulders. Slow, deep breaths.','POSE','SPHINX'],
  ["Child's pose",30,'Just a pass through.','POSE','CHILDS'],
  ['Seated straddle forward fold',240,'Legs wide, walk the hands forward. Depth is not the goal.','POSE','SEATED_WIDE_LEG_FORWARD_BEND'],
  ['Reclined butterfly',120,'Soles together, let the knees fall open.','POSE','BOUND_ANGLE'],
  ['Corpse pose',60,'Stay as long as you like.','POSE','CORPSE']]},
 bedtense:{t:'Before bed: let go of tension',video:'Do This Before Bed When You’re Too Tense to Fall Asleep',when:'Right before bed, even in bed. Neck, sides, spine, hips.',steps:[
  ['Seated breathing',60,'Shoulders down, let the day go.','POSE','EASY_SEATED'],
  ...side(['Neck side stretch',30,'Ear to shoulder, hand resting on the head. No pulling.','POSE','EASY_SEATED']),
  ['Half neck rolls',30,'Slow half circles, chin past the chest.','POSE','EASY_SEATED'],
  ...side(['Seated side bend',30,'Arm over the head, breathe into the ribs.','POSE','SEATED_EASY_SIDE_BEND']),
  ['Sphinx',60,'Easy back bend. Feet wider if the back complains.','POSE','SPHINX'],
  ['Crocodile rest',20,'Forehead on the hands.','MOVE','BELLY_BREATHING'],
  ...side(['Prone twist',45,'Arm out, other leg bent behind you.','MOVE','SPINAL_TWIST']),
  ['Knees to chest, knee circles',45,'Both directions.','MOVE','KNEE_CIRCLES'],
  ['Happy baby',45,'Or just hug the knees. Then go to bed.','MOVE','HIP_STRETCH']]},
 bedeasy:{t:'Before bed: so tomorrow feels easier',video:'Do This Before Bed So Tomorrow Feels Easier',when:'Evening wind-down, on the carpet or the mat. Keep it loose, not strict.',steps:[
  ['Downward dog, walk the dog',80,'Move around, breathe deeper.','POSE','DOWNWARD_FACING_DOG'],
  ['Cat-cow',40,'Slow.','CORE','CAT_COW'],
  ["Child's pose",60,'Breathe into the lower back.','POSE','CHILDS'],
  ...side(['90-90, fold over the front knee',75,'Both legs at about 90°. Find the spot that stretches, stay there.','POSE','ONE_LEGGED_PIGEON']),
  ['Sphinx',60,'Feet wide. Open the front with every inhale.','POSE','SPHINX'],
  ['Crocodile rest, gratitude',45,'Lie on the belly, slow breaths.','MOVE','BELLY_BREATHING'],
  ['Seated, eyes closed',30,'','POSE','EASY_SEATED']]},
 recoverhard:{t:'Recover from hard training',video:'Recover From Hard Training Without Losing Momentum',when:'Right after training or on a rest day. A full-body flow, little strength.',steps:[
  ['Sphinx',80,'Glutes a little on, collarbones wide.','POSE','SPHINX'],
  ["Child's pose",30,'','POSE','CHILDS'],
  ['Tabletop: rock forward and back, then forearm stretch',45,'Fingers turned to the knees, sit back gently.','POSE','TABLE_TOP'],
  ['Downward dog, walk the dog, heels to each side',70,'Breathe into each side body.','POSE','DOWNWARD_FACING_DOG'],
  ['Halfway lift, forward fold',15,'','POSE','STANDING_FORWARD_BEND'],
  ...side(['Low lunge, back knee down',45,'Hands on the front knee, hips forward, tailbone tucked.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Half split',30,'Front toes up, micro-bend in the knee.','POSE','RUNNERS_LUNGE'],
    ['Wide-leg forward fold',50,'Heels wider than the toes. Hands behind the back, or a twist.','POSE','STANDING_WIDE_LEG_FORWARD_BEND'],
    ['Side lunge',15,'Your depth.','POSE','WIDE_SIDE_LUNGE'],
    ['Plank, lower slowly, sphinx',40,'Control the way down.','POSE','SPHINX'],
    ["Child's pose to down dog",30,'','POSE','DOWNWARD_FACING_DOG']),
  ['Sphinx, seal or upward dog',60,'Pick your depth, glutes on.','POSE','UP_DOG'],
  ['Downward dog, long exhales',40,'Breathe out through the mouth twice.','POSE','DOWNWARD_FACING_DOG'],
  ['Kneeling arm swings',45,'Sit on the heels, swing the arms back and up like wings.','POSE','THUNDERBOLT_POSE_BOTH_SIDES_ARM_STRETCH'],
  ['Seated or lying, rest',120,'','POSE','CORPSE']]},
 bedletgo:{t:'Before bed: when the body will not let go',video:'Do This Before Bed When Your Body Won’t Let Go',when:'After a day of sitting or driving. Gentle, even in bed.',steps:[
  ['Sphinx',80,'Or seal if it feels good.','POSE','SPHINX'],
  ...side(['Half frog',40,'On the belly, press the foot down by the hip: quad and front shoulder. Easy on the knee.','POSE','HEROS']),
  ["Child's pose",30,'','POSE','CHILDS'],
  ['Butterfly fold, back rounded',80,'Elbows outside the shins, chin to chest.','POSE','BOUND_ANGLE'],
  ['Bridge',50,'Glutes on, gap between chin and chest.','POSE','BRIDGE'],
  ...side(['Figure four',45,'Pull the legs in, flexed foot protects the knee.','MOVE','PIRIFORMIS_STRETCH'],
    ['Supine twist',45,'Legs over to the side, opposite arm out.','POSE','SUPINE_SPINAL_TWIST']),
  ['Happy baby, one leg straight, then the other',60,'','MOVE','HIP_STRETCH'],
  ['Plow',20,'Gap between chin and chest.','POSE','PLOW'],
  ['Knees to chest, then rest',40,'Grab a blanket.','POSE','CORPSE']]},
 restbetter:{t:'Rest day that makes you better',video:'Your Rest Day Should Make You Better at Training',when:'For athletes on a recovery day. Front of the hips, hamstrings, outer hips, shoulders.',steps:[
  ["Child's pose",70,'Breathe into the ribs on the thighs.','POSE','CHILDS'],
  ['Tabletop barrel rolls',60,'Circle the spine 3 times each way, slowly.','POSE','TABLE_TOP'],
  ['Downward dog',45,'Knees bent first, chest to the thighs.','POSE','DOWNWARD_FACING_DOG'],
  ['Forward fold, arms crossed',30,'Rock side to side.','POSE','STANDING_FORWARD_BEND'],
  ...side(['Lizard lunge',30,'Move the hips around.','POSE','LIZARD'],
    ['Back knee down, quad stretch',50,'Push the foot away, then pull it in.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Half split',30,'Sit back on the heel.','POSE','RUNNERS_LUNGE'],
    ['Forearm plank',15,'Tailbone tucked.','POSE','DOLPHIN_PLANK'],
    ['Sphinx or seal',50,'Lengthen the front, do not crunch the back.','POSE','SPHINX'],
    ["Child's pose, down dog, forward fold",30,'','POSE','DOWNWARD_FACING_DOG']),
  ...side(['90-90, fold over the front leg',60,'Feet flexed. Aim for the outer hip.','POSE','ONE_LEGGED_PIGEON'],
    ['Cow face, fold forward',45,'Unstack the legs if it is too much.','POSE','COW_FACE']),
  ['Seated forward fold',50,'Whole back line.','POSE','SEATED_LONG_LEG_FORWARD_BEND'],
  ['Butterfly fold',60,'Let the breath and gravity take you down.','POSE','BOUND_ANGLE'],
  ['Reverse tabletop',20,'Rock forward and back for the shoulders.','POSE','UPWARD_FACING_PLANK'],
  ...side(['Seated neck stretch',20,'Hands joined behind, ear to shoulder.','POSE','EASY_SEATED']),
  ['Seated, five deep breaths',45,'','POSE','EASY_SEATED']]},
 between:{t:'Between hard training days',video:'Your Body Needs This Between Hard Training Days',when:'Slow and relaxed. Before or after training, or on a rest day.',steps:[
  ['Seated, notice the breath',60,'Cross-legged, tall.','POSE','EASY_SEATED'],
  ...side(['Fold over crossed shins',30,'Lower back and outer hips.','POSE','EASY_SEATED']),
  ['Cat-cow',30,'','CORE','CAT_COW'],
  ['Downward dog',45,'Knees bent, open the shoulders, then straighten a little.','POSE','DOWNWARD_FACING_DOG'],
  ['Forward fold, opposite elbows, roll up',30,'','POSE','STANDING_FORWARD_BEND'],
  ['Arms up, fold down',20,'','POSE','STANDING_ARMS_UP'],
  ...side(['Low lunge, back knee down',40,'Front heel pulls back, tailbone tucked.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Half split',30,'Toes up, micro-bend.','POSE','RUNNERS_LUNGE'],
    ['Revolved side angle, then straighten the front leg',45,'Outer hip and the back of the hip.','POSE','REVOLVED_TRIANGLE'],
    ['Down dog, forward fold, roll up',40,'','POSE','DOWNWARD_FACING_DOG']),
  ...side(['Bridge, one leg up',20,'Hips high.','POSE','BRIDGE'],
    ['Figure four',45,'Both feet flexed.','MOVE','PIRIFORMIS_STRETCH']),
  ...side(['Supine twist',40,'Legs together, look the other way.','POSE','SUPINE_SPINAL_TWIST']),
  ['Corpse pose',60,'Let the breath settle.','POSE','CORPSE']]},
 bjj:{t:'After a wrecking session',video:'Do This After BJJ When Your Whole Body Feels Wrecked',when:'Cool-down after martial arts, lifting or any hard session.',steps:[
  ['Kneeling, lean back, lift the knees',30,'Tops of the ankles. Only as high as is comfortable.','POSE','THUNDERBOLT'],
  ...side(['Low lunge, rock the hips',40,'Back toes untucked. Forward, down and back, then stay.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Half split, foot in and out',40,'Toes up, melt down.','POSE','RUNNERS_LUNGE'],
    ['Wide-leg forward fold',25,'Chest melts down.','POSE','STANDING_WIDE_LEG_FORWARD_BEND'],
    ['Side lunge',10,'','POSE','WIDE_SIDE_LUNGE'],
    ['Twisted lunge, arm up, straighten the front leg',30,'Back leg straight, front toes up.','POSE','LOW_LUNGE_TWIST']),
  ['Cat-cow',40,'','CORE','CAT_COW'],
  ["Child's pose",30,'Breathe into the lower back.','POSE','CHILDS'],
  ['Tabletop to down dog',30,'3 times, short stance.','POSE','DOWNWARD_FACING_DOG'],
  ['Sphinx',60,'Open the whole front.','POSE','SPHINX'],
  ['Seated, eyes closed',60,'','POSE','EASY_SEATED']]},
 athletes:{t:'Gentle flow for athletes',video:'20 Minute Gentle Yoga Flow for Athletes (And Beginners)',when:'An active rest day: gentle movement, then a short sitting.',steps:[
  ["Child's pose",90,'Arrive, close the eyes.','POSE','CHILDS'],
  ['Cat-cow',50,'','CORE','CAT_COW'],
  ['Downward dog',60,'Knees bent, chest to the quads, then straighten a little.','POSE','DOWNWARD_FACING_DOG'],
  ['Wide-leg fold, halfway lift',35,'5 times with the breath.','POSE','STANDING_WIDE_LEG_FORWARD_BEND'],
  ['Roll up, arms up',15,'','POSE','STANDING_ARMS_UP'],
  ['Squat, arms up and down',40,'5 times: high or low squat.','POSE','SQUAT_PALM_PRESS'],
  ...side(['Lizard lunge',25,'Move the hips around.','POSE','LIZARD'],
    ['Low lunge, back knee down, thigh stretch optional',55,'Three slow breaths.','POSE','LOW_LUNGE_WITH_KNEE_DOWN'],
    ['Half split',40,'','POSE','RUNNERS_LUNGE'],
    ['Back to the squat',15,'','POSE','SQUAT_PALM_PRESS']),
  ['Butterfly fold',100,'Five breaths, let the breath pull you in.','POSE','BOUND_ANGLE'],
  ['Seated meditation',300,'Watch the breath. When the mind wanders, come back.','POSE','EASY_SEATED']]},
};
/* Video title -> routine, for the PM yoga picks: a recovery day prefers a video that is also on the watch. */
const VR=Object.fromEntries(Object.entries(ROUTINE).map(([k,R])=>[R.video,k]));
const routineMin=k=>Math.round(ROUTINE[k].steps.reduce((a,s)=>a+s[1],0)/60);

/* ============ PM yoga: Breathe and Flow library ============ */
const YV=[["30 Minute Restorative Fascia Release Yoga (Great for Runners!)","g",1],["Anterior Pelvis Tilt? Try This Hip Mobility Routine","g",1],["Basic Spine Mobility Exercises for Every Body","g",1],["Basic Toe Mobility Routine | Breathe and Flow Yoga","g",1],["Can't Touch Your Toes? Try This Hip Flexion Mobility Work","g",1],["Feel Better in 15 Minutes with This Gentle Morning Yoga for Hips and Full Body","g",1],["Free Up Tight Hips with This 20 Min Yoga for Jiu Jitsu Mobility","g",1],["Hip Internal Rotation in 10 Minutes | FRC Mobility Hack","g",1],["Improve Your Ankle Mobility with This 20 Min Routine for Better Squats","g",1],["Increase Hip Rotation Without Traditional Stretching","g",1],["Knee Strengthening Exercises for External Rotation Mobility","g",1],["Knee Strengthening Exercises for Internal Rotation Mobility","g",1],["Most Hip Mobility Videos Aren’t Actually Training Mobility","g",1],["Myofascial Release and Yoga Movement Practice: The Perfect Combination for Better Posture","g",1],["The 3 Most Effective Rollouts | Remove Pain with Myofascial Release (MFR)","g",1],["Wrist and Forearm Rollout | Remove Tightness with Myofascial Release (MFR)","g",1],["Your Knees Need More Than Just Stretching","g",1],["10 Minute Guided Meditation To Let Go | Breathe and Flow Yoga","g",0],["11 Minute Guided Meditation for More Peace | Breathe and Flow Yoga","g",0],["11 Minute Yoga for Beginners at Home | Breathe and Flow Yoga","g",0],["12 Minute Full Body Warm Up Routine | Breathe and Flow Yoga for BJJ","g",0],["15 Min Yoga for Your Lunch & Office Break | Breathe and Flow Yoga","g",0],["15 Minutes to Stop Feeling Stiff and Half Asleep","g",0],["20 Minute Gentle Yoga Flow for Athletes (And Beginners)","g",0],["A Guided Meditation at Machu Picchu for Peace, Joy and Calm","g",0],["All Levels Vinyasa To Release Internal Tension","g",0],["Best Exercise for Wrist Mobility! Strong and Healthy Wrist Extension","g",0],["Do This After Training So Your Body Actually Recovers","g",0],["Do This After Training to Recover Faster","g",0],["Do This Before Bed So Tomorrow Feels Easier","g",0],["Do This Before Bed When Your Body Won’t Let Go","g",0],["Do This Before Bed When Your Mind Won’t Switch Off","g",0],["Do This Before Bed When You’re Too Tense to Fall Asleep","g",0],["Do This When You Feel Scattered and Need to Reset","g",0],["Do This in the Morning When Your Body Feels Stiff and Half Asleep","g",0],["Energizing and Cleansing Breathwork: Kapalbhati | Breathe and Flow Yoga","g",0],["Feel Better on Your Period with This 30 Min Gentle Yoga for Cramps and Bloating","g",0],["Feel More Open and Balanced with This 20 Min Gentle Vinyasa Yoga Flow","g",0],["Follow Along Yoga Breathwork: Sama Vritti | Breathe and Flow Yoga","g",0],["Four Breathing Exercises in One | Pranayama with Breathe and Flow","g",0],["Gentle Vinyasa Flow Yoga and Meditation | Breathe and Flow Yoga","g",0],["Gentle Yoga Flow for Inner Peace and Joy (20 Minutes Follow Along)","g",0],["Get Stronger Without Sacrificing Your Mobility","g",0],["Guided Intermediate Breathwork Practice: Visama Vritti | Breathe and Flow Yoga","g",0],["Guided Meditation for Less Stress and Better Sleep","g",0],["Guided Meditation for Peace, Love and Joy (with gentle Breathing Exercise!)","g",0],["Guided Meditation to Feel Grounded & Confident","g",0],["Let Go and Slow Down with This 25 Min Yin Yoga for Deep Relaxation","g",0],["Let Go of Stress with This 20 Min Yin Yoga and Breathwork Practice","g",0],["Loving Kindness Guided Meditation | Breathe and Flow Yoga","g",0],["Move Every Joint in Your Body in 10 Minutes (Full Body CARS)","g",0],["Peaceful Nights in 7 Days: Bre's Sleep Yoga","g",0],["Recover From Hard Training Without Losing Momentum","g",0],["Release the Day with This 20 Min Evening Restorative Yoga for Better Sleep","g",0],["Shoulder Internal Rotation Mobility Training","g",0],["Silent Full Body Morning Stretch Yoga for Athlete Flexibility","g",0],["Silent Full Body Yoga Stretching Routine for Post Workout","g",0],["Simple 25 Minute Vinyasa Yoga Class for Beginners | Breathe and Flow Yoga","g",0],["Simple Guided Meditation to be more Mindful | Breathe and Flow Yoga","g",0],["Start Here If Yoga Has Always Felt Intimidating","g",0],["Super Slow Breathe and Flow Yoga Practice for Stillness","g",0],["The 15 Minute Reset Your Body Needs After Pushing Hard","g",0],["The Mobility Secret Top BJJ Players Don't Talk About","g",0],["The Recovery Practice Your Strength Training Is Missing","g",0],["The Ultimate End of Work Office Yoga Routine (At Your Desk!) | Breathe and Flow Yoga","g",0],["The Ultimate Mid Work Office Yoga Routine (At Your Desk!) | Breathe and Flow Yoga","g",0],["This Quick Yoga Practice Will Make You Sleep So Much Better (Take Action Now)","g",0],["Transformative Breathwork and Meditation to Contemplate on Self","g",0],["Uddiyana Bandha Kriya - This Powerful Breathwork Practice Creates an Intense Internal Shift","g",0],["Upper Body Yin Yoga for Deep Relaxation and Flexibility","g",0],["Who Are You? | A Guided Meditation","g",0],["Yin Yoga for Full Relaxation Chill Mode","g",0],["Yoga for Men | Episode 24 - 25 Minutes to Find Out How Calm You Are Under Pressure","g",0],["Yoga for Travel | Stretches on a Roadtrip","g",0],["Your Body Needs This Between Hard Training Days","g",0],["Your Body Needs This on Rest Days","g",0],["Your Rest Day Should Make You Better at Training","g",0],["Your Rest Day Should Make You Feel Better Not Lazy","g",0],["Finally Fix Your Back Pain - The Ultimate Guide","a",1],["Get Stronger Without Letting Your Hips Get Tight","a",1],["How I Healed My Back Pain and Sciatic Nerve Pain (Sciatica)","a",1],["Routine for Healthy Hips & Feet | Breathe and Flow Yoga for BJJ","a",1],["Simple Daily Routine to Keep Your Spine Healthy | Breathe and Flow Yoga for BJJ","a",1],["Your Hips Need This After a Week of Pushing Hard","a",1],["Your Jiu Jitsu Training Is Beating Up Your Hips and Knees","a",1],["Your Knees Need More Than Just Protection","a",1],["10 Minutes to Feel Stronger and Fully Awake","a",0],["10 Minutes to Wake Up Your Body and Clear Your Head","a",0],["15 Minute Every Day Energizing Morning Yoga Practice","a",0],["15 Minute Total Body Yoga Class For Busy People","a",0],["15 Minutes in the Morning Can Change Your Entire Day","a",0],["15 Minutes to Feel Stronger Calmer and More Like Yourself","a",0],["15 Minutes to Find Out How Good Your Balance Really Is","a",0],["15 Minutes to Turn Low Energy Into Full Body Momentum","a",0],["20 Minute Effective Morning Yoga For A Fantastic Day","a",0],["20 Minutes to Feel Strong Grounded and Fully Awake","a",0],["20 Minutes to Go From Morning Stiffness to Ready for the Day","a",0],["22 Minute Short and Sweet Energizing Morning Flow","a",0],["25 Min Postnatal Yoga for Upper Body - Postpartum Yoga | Breathe and Flow","a",0],["25 Minute Backbend Vinyasa Yoga Class - Open Your heart!","a",0],["25 Minute Express Vinyasa Flow Yoga Practice","a",0],["30 Min Vinyasa to Enter Flow State Fast","a",0],["30 Minute Strong Slow Yoga for Stability and Presence","a",0],["30 Minutes Yoga with Focus on Full Eagle & Side Planks","a",0],["30 minute father and son yoga practice","a",0],["6 Natural Movements You Must Know","a",0],["Build the Kind of Strength That Moves With You","a",0],["Couple sits at fireplace in complete silence","a",0],["Creative and Strong 30 Minute Vinyasa Yoga Class","a",0],["Do This After BJJ When Your Whole Body Feels Wrecked","a",0],["Do This After Every Jiu-Jitsu Training! | Breathe and Flow Yoga for BJJ","a",0],["Do This After Waking Up to Feel Ready for Anything","a",0],["Do This Every Day When Your Whole Body Feels Tight","a",0],["Do This Every Morning to Feel More Awake in Your Body","a",0],["Do This When Sitting All Day Makes Your Body Feel Stuck","a",0],["Do This When Your Back Feels Compressed and Tired","a",0],["Do This When Your Neck and Shoulders Feel Stuck","a",0],["Do This When Your Whole Body Feels Tight","a",0],["Do This in the Morning to Feel Strong All Day","a",0],["Do This in the Morning to Feel Strong and Clear All Day","a",0],["Effective routine when working from home | Breathe and Flow Yoga","a",0],["Effortless Control Fluid Vinyasa Flow Practice","a",0],["Embody Your Strength: Vinyasa Flow Class for Mind and Body","a",0],["Energizing 22 Min Full Body Vinyasa Yoga | Breathe and Flow Yoga","a",0],["Feel Better Fast with This 15 Min Full Body Morning Yoga Flow","a",0],["Feel Calm and Supported with This 15 Min Prenatal Yoga for Everyday Relief","a",0],["Full Body All Levels | Vinyasa Flow Yoga Class","a",0],["Full Body Intermediate Morning Yoga | 15 Minute Breathe and Flow Yoga","a",0],["Get Out of Your Head and Feel Better in Your Body","a",0],["Get Stronger While Remembering What Actually Matters","a",0],["Get Stronger Without Losing the Way Your Body Moves","a",0],["Get Stronger Without Pushing Your Body Too Hard","a",0],["Get Stronger Without Starting Your Day Exhausted","a",0],["How to Meditate | Breathe and Flow Yoga","a",0],["How to Stay Strong When Your Upper Body Needs a Break","a",0],["Improve Your Guard Game in Jiu-Jitsu | Breathe and Flow Yoga for BJJ","a",0],["Intermediate Energizing Functional Flow Yoga by Breathe and Flow","a",0],["Intermediate Vinyasa Flow Practice | Breathe and Flow","a",0],["Keep Rolling Longer by Training What Jiu Jitsu Is Missing","a",0],["Loosen Up Fast with This 20 Min Morning Yoga Flow","a",0],["Minimalist Vinyasa Yoga Class | Breathe and Flow Yoga","a",0],["Move Better and Build Control with This 25 Min Animal Flow Yoga for BJJ","a",0],["Move Your Body in Every Direction Before the Day Stiffens You Up","a",0],["Move Your Body in Ways Your Training Is Missing","a",0],["No Time for Yoga This 15 Minute Flow Is Enough","a",0],["Quick 11 Minute Morning Movement Routine | Breathe and Flow Yoga","a",0],["Start Your Day Strong Without Starting It Stressed","a",0],["Start Your Day With 20 Minutes That Make Everything Feel Easier","a",0],["Start Your Day with This 15 Min Morning Movement Routine","a",0],["Stay Calm While Your Body Is Working This Hard","a",0],["Stay Strong When Your Upper Body Needs Time Off","a",0],["The 3 Best Breathing Techniques for Jiu-Jitsu | Breathe and Flow Yoga for BJJ","a",0],["The 30 Minute Practice That Makes Your Whole Body Feel Stronger","a",0],["The 5 Ancient Movements That Wake Up Your Entire Body (Five Tibetan Rites)","a",0],["The Days You Don’t Want to Practice Matter the Most","a",0],["This 20 Minute Flow Gets Your Body Moving and Your Mind Quiet","a",0],["This 20 Minute Flow Is Hard Enough to Quiet Your Mind","a",0],["This 25 Minute Flow Builds the Strength You Can Actually Control","a",0],["This 30 Minute Flow Makes Your Whole Body Work Together","a",0],["This 30 Minute Flow Will Make Your Whole Body Work","a",0],["This Ancient Breathing Practice Changes How You Feel in 20 Minutes","a",0],["Train Your Body to Move Better for Any Sport - Animal Flow","a",0],["Wake Up Your Body Fast with This 20 Min Primal Vinyasa Yoga Flow","a",0],["When Your Mind Feels Complicated Come Back to This","a",0],["Why Your Body Feels Stiff and Heavy All the Time","a",0],["Yoga Class with Long Strong Holds and Breathing Exercises: Be Calm & Strong","a",0],["Yoga For Busy People | Full Body Flow to Start Your Day","a",0],["Yoga for People Who Can’t Shut Their Brain Off","a",0],["Your Body Was Built to Move Like This","a",0],["Your New Everyday Vinyasa Flow Yoga Class","a",0],["Your Shoulders Are Tight - Here's What To Do","a",0],["Your Whole Body Will Feel Better After This","a",0],["Feel Stronger Head to Toe With This 12 Minute Full Body Yoga Workout","r",1],["10 Minute Bodyweight Workout | Breathe and Flow","r",0],["10 Minutes to Build a Core That Actually Makes You Stronger","r",0],["13 Minutes to Find Out How Strong Your Core Really Is","r",0],["15 Minutes to Find Out How Strong You Really Are","r",0],["25 Minute Power Yoga Class with Bre","r",0],["30 Minutes to Find Out How Strong You Really Are","r",0],["At Home 10 Minute Functional Yoga Based Core Activation Workout","r",0],["Build Strength Fast with This 20 Min Slow Vinyasa Yoga Challenge","r",0],["Build Upper Body Strength with This 25 Min Yoga Workout","r",0],["Build a Strong Core Fast with This 10 Min Yoga Ab Workout","r",0],["Challenge Your Body and Breath with This 35 Min Minimal Cue Vinyasa Yoga Flow","r",0],["Challenge Your Core with This 10 Min Yoga Ab Workout","r",0],["Crazy Handstand Balance Routine: Do This to Take Your Handstand Practice to the Next Level","r",0],["Full Body Vinyasa Handstand Warmup Sequence | Breathe and Flow Yoga","r",0],["Get Serious Handstand Balance! 5 Rounds Of 30","r",0],["Is it Crow Pose or Crane Pose? | Breathe and Flow Yoga","r",0],["Peacock Pose Tutorial (Mayurasana) Advanced Arm Balances | Breathe and Flow Yoga","r",0],["Shake Off Morning Stiffness with This 15 Min Primal Movement Yoga","r",0],["Strong Vinyasa Flow For Dads","r",0],["The Strength Practice Every Busy Dad Needs","r",0],["This 15 Minute Flow Gets Hard Fast","r",0],["This 20 Minute Flow Gets Hard Enough to Change Your Headspace","r",0],["This 20 Minute Workout Is Harder Than It Looks","r",0],["This 25 Minute Workout Will Make Your Whole Body Shake","r",0],["This 25 Minute Workout Will Push Your Strength to the Limit","r",0],["This 30 Minute Workout Will Humble Your Entire Body","r",0],["This 35 Minute Flow Forces You to Think About Every Move","r",0],["This Flow Will Test How Well You Move Under Pressure","r",0],["This Yoga Flow Builds the Kind of Strength Most People Avoid","r",0],["Train Your Real Core with This 25 Min Yoga Anatomy and Strength Practice","r",0],["Yoga Teachers Explain Side Crow and Eka Pada Koundinyasana 1","r",0],["Yoga for Men | Episode 22","r",0],["Yoga for Men | Episode 29","r",0],["Yoga for Men | Episode 31","r",0],["Your First One Handed Arm Balance: Croc & One Handed Peacock Pose Yoga","r",0]];
const ylink=t=>'https://www.youtube.com/results?search_query='+encodeURIComponent('Breathe and Flow '+t);
const YC={g:'var(--easy)',a:'var(--mp)',r:'var(--hard)'}, YN={g:'Green',a:'Amber',r:'Red'};
const RESTO=/Restorative|Fascia|Rollout|Recover|After Training|Yin|Pushing Hard|Rest Day/i;
const CALM=/Meditation|Breathwork|Breathing|Pranayama|Sleep|Before Bed/i;
const yPool=(c,re)=>YV.filter(v=>v[1]===c&&(!re||re.test(v[0])));
const pickV=(pool,n)=>{const pr=pool.filter(v=>v[2]);const use=(pr.length&&n%2===0)?pr:pool;return use[n%use.length]};
/* Recovery slots pick from the videos that are also watch routines (any colour), matching the slot when any do. */
const pickR=(re,n)=>{const all=YV.filter(v=>VR[v[0]]),m=re?all.filter(v=>re.test(v[0])):[];const use=m.length?m:all;return use[n%use.length]};
function yogaPlan(wi,w,d,items){
  const n=wi*7+d;
  const race=items.some(x=>x.race), longDay=items.some(x=>x.long);
  const nextLong=(w.days[d+1]||[]).some(x=>x.long), prevLong=d>0&&w.days[d-1].some(x=>x.long);
  const recov=w.light&&/^Recover/.test(w.title);
  if(race)     return ['g','Restorative, evening after the race','Very gentle. No deep stretching for 3 days.',pickV(yPool('g',RESTO),n),10];
  if(w.race)   return ['g','Sleep or breathwork only','Race week: no flows.',pickR(CALM,n),15];
  if(recov)    return ['g','Green, restorative','Recovery week: gentle only.',pickR(RESTO,n),20];
  if(longDay)  return ['g','Restorative or fascia release, evening','',pickR(RESTO,n),20];
  if(nextLong) return ['g','Green only, light','No deep hip openers before the long run.',pickV(yPool('g'),n),15];
  if(prevLong) return ['g','Green, 15–25 min','Day after the long run.',pickR(RESTO,n),20];
  if(w.light)  return ['g','Green, 15–20 min','Lighter week.',pickR(null,n),15];
  if(d===0&&items.some(x=>x.key)&&w.p!=='taper') return ['r','Red allowed, once a week max','Training, not recovery. If it gives you DOMS, it counts as a strength session.',pickV(yPool('r'),n),25];
  if(d===1||d===6) return ['a','Amber, 20–30 min','',pickV(yPool('a'),n),25];
  return ['g','Green, 15–25 min','',pickR(null,n),20];
}
W.forEach((w,wi)=>w.days.forEach((items,d)=>{
  const [c,t,note,v,m]=yogaPlan(wi,w,d,items);
  const rt=VR[v[0]];  // this video is also a watch routine
  items.push(S('yoga','PM yoga: '+t,(note?note+' ':'')+'Suggested: '+v[0],rt?routineMin(rt):m,{yc:YC[c],link:ylink(v[0]),rt}));
  if(rt)items.forEach(x=>{if(x.then==='rest')delete x.then});  // the day already has its yoga on the watch
}));

