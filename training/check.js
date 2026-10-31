/* Strength sessions: exact sets for every week, and the muscle glow from the same data.
   Run: node training/check.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const stub = { addEventListener() {} };
const ctx = vm.createContext({ document: stub, window: stub, localStorage: { getItem: () => null } });
for (const f of ['plan.js', 'body-shapes.js', 'body.js', '../shared/travel.js']) vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), ctx);
const { W, EX, GYM, BH_SHAPES, BH_EX, BH_SESS, bhMuscles, Travel } = vm.runInContext('({W,EX,GYM,BH_SHAPES,BH_EX,BH_SESS,bhMuscles,Travel})', ctx);

const drawn = new Set([...Object.keys(BH_SHAPES.front.m), ...Object.keys(BH_SHAPES.back.m)]);
const paths = v => Object.values(BH_SHAPES[v].m).flat().length;
assert.strictEqual(paths('front'), 32, 'no traced path lost on the front');
assert.strictEqual(paths('back'), 20, 'no traced path lost on the back');
Object.values(BH_SESS).forEach(s => s.split(' ').forEach(k => assert(BH_EX.some(e => e[0] === k), 'unknown exercise ' + k)));
BH_EX.forEach(e => assert(e[2] || EX[e[0]], 'no muscles for ' + e[0]));
Object.entries(EX).forEach(([k, e]) => assert(e.length === 5 && e[1] && e[4], 'incomplete exercise ' + k));
const amountOk = a => typeof a === 'number' || /^(\d+ s|\d+ min|\d+:\d\d|\d+ m|max)$/.test(a);
Object.entries(GYM).forEach(([k, bs]) => bs.forEach(([n, rows]) => rows.forEach(r => {
  assert(EX[r[0]], `GYM.${k}: unknown exercise ${r[0]}`); assert(n >= 1 && amountOk(r[1]), `GYM.${k}: bad amount ${r[1]}`); })));

W.forEach(w => w.days.forEach(d => d.forEach(x => {
  const m = bhMuscles(x);
  Object.keys(m).forEach(k => assert(drawn.has(k), `${x.t}: ${k} has no shape`));
  if (x.z === 'gym' || x.z === 'test') assert(Object.keys(m).length, `${x.t}: no exercise found in "${x.d}"`);
})));

const find = re => W.flatMap(w => w.days.flat()).find(x => re.test(x.t + ' ' + x.d));
const legs = bhMuscles(find(/^Short legs/)), B = bhMuscles(find(/^Gym B/)), core = bhMuscles(find(/^Core \+ hips/));
assert(!legs.chest && !legs.lats, 'a legs session does not light the upper body');
assert(legs.shin > 0, 'tib raises light the shin');
assert(!B.quads && B.lats > .5 && B.chest > 0 && B.biceps > 0, 'Gym B is upper body: back, chest, arms');
assert(core.adductors > 0 && core.shin > 0 && core.abs > 0, 'Core + hips: groin, shin and abs');
assert.deepStrictEqual(Object.keys(bhMuscles({ z: 'yoga', t: 'PM yoga' })), [], 'yoga lights nothing');
const run = z => bhMuscles({ z, t: 'run' }).hamstrings;
assert(run('rec') < run('easy') && run('easy') < run('st') && run('st') < run('hard'), 'harder runs glow brighter');
assert(bhMuscles({ z: 'easy', t: 'run' }).shin > 0 && bhMuscles({ z: 'easy', t: 'run' }).shin === bhMuscles({ z: 'easy', t: 'run' }).calves, 'a run lights the shin as much as the calf');

const all = W.flatMap(w => w.days.flat()), gymA = all.filter(x => x.g === 'A'), keys = x => x.ex.flatMap(b => b[1].map(r => r[0]));
assert(all.filter(x => x.z === 'gym').every(x => x.ex), 'every gym session has exact sets');
assert(!keys(gymA[0]).includes('boxjump') && gymA[0].ex.every(b => b[0] <= 2), 'week 1 Gym A: 2 sets, no jumps');
assert(gymA.some(x => x.ex.some(b => b[1][0][0] === 'trapbar' && b[1][0][1] === 4)), 'from January the deadlift is 4×4');
assert(W.flatMap((w, i) => w.p === 'mara' ? w.days.flat() : []).filter(x => x.g === 'A').every(x => !keys(x).includes('stepdown')), 'marathon block: no step-downs');
const light = Travel.adapt(gymA[3], null, true), away = Travel.adapt(gymA[3], { n: 'Trip' }, false);
assert(light.ex.every(b => b[0] <= 2) && light.ex.length === gymA[3].ex.length, 'a lighter week caps Gym A at 2 sets');
assert(keys(away).includes('jumpsquat') && !keys(away).includes('trapbar'), 'away, Gym A becomes the hotel session');
assert.notDeepStrictEqual(bhMuscles(gymA[0]), bhMuscles(gymA[1]), 'glow follows the exact sets: week 1 has no jumps');
// Week km labels come from the planned minutes at his own paces (31 Oct 2026), not a walking 9 min/km.
assert.strictEqual(W[0].km, '~27 km', 'week 1: 200 planned minutes at 7:10 easy and 8:30 on the hill');
W.forEach((w, i) => {
  if (!w.kmHand) return;
  const m = w.days.flat().filter(x => ['easy', 'rec', 'st', 'hard', 'mp', 'vert'].includes(x.z)).reduce((a, x) => a + (x.m || 0), 0);
  const pace = m / parseFloat(w.km.slice(1));
  assert(pace > 6 && pace < 8, `week ${i + 1}: ${w.km} for ${m} min is ${pace.toFixed(2)} min/km, not a running pace`);
});
assert(W.some(w => /race/.test(w.km)) && W.filter(w => / h$/.test(w.km)).length === 5, 'race weeks and the Vitosha hours are left alone');
// The week's runs beside the plan (31 Oct 2026): compared in minutes, the plan's own unit.
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
const fn = html.match(/const runPlanMin=[^\n]*\nfunction runKmLine\(wi,w\)\{[\s\S]*?\n\}/);
assert(fn, 'runKmLine is on the Training page');
const RUNZ = ['easy', 'rec', 'st', 'hard', 'mp', 'vert', 'race'];
const line = (r, w) => new Function('state', 'RUNZ', fn[0] + '; return runKmLine(0, W);'.replace('W', JSON.stringify(w)))({ runKm: { 0: r } }, RUNZ);
const w1 = { km: '22 km', days: [[{ z: 'easy', m: 30 }, { z: 'gym', m: 45 }], [{ z: 'easy', m: 35 }], [{ z: 'vert', m: 45 }], [{ z: 'easy', m: 30 }], [{ z: 'easy', m: 60 }], [], []] };
assert.strictEqual(new Function('state', fn[0] + '; return runKmLine(0, {});')({}), '', 'nothing shown before the first sync');
assert.strictEqual(line(30.4, w1), '', 'an old figure from before minutes were kept is not shown');
assert(/31\.1 km run, 230 of 200 min \(\+15%\)/.test(line({ km: 31.1, min: 230 }, w1)) && /over/.test(line({ km: 31.1, min: 230 }, w1)), 'week 1 as run: 15% over in time is marked');
assert(!/over|\(/.test(line({ km: 27, min: 210 }, w1)), 'within 10% is not marked, whatever the km');
assert(!/over/.test(line({ km: 10, min: 80 }, w1)), 'a week in progress is not flagged for being short');
console.log('training check ok');
