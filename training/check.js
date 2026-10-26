/* Muscle glow: every strength session lights the muscles its exercises work, and only muscles the figure can draw.
   Run: node training/check.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const stub = { addEventListener() {} };
const ctx = vm.createContext({ document: stub, window: stub, localStorage: { getItem: () => null } });
for (const f of ['plan.js', 'body-shapes.js', 'body.js']) vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), ctx);
const { W, BH_SHAPES, BH_EX, BH_SESS, bhMuscles } = vm.runInContext('({W,BH_SHAPES,BH_EX,BH_SESS,bhMuscles})', ctx);

const drawn = new Set([...Object.keys(BH_SHAPES.front.m), ...Object.keys(BH_SHAPES.back.m)]);
const paths = v => Object.values(BH_SHAPES[v].m).flat().length;
assert.strictEqual(paths('front'), 32, 'no traced path lost on the front');
assert.strictEqual(paths('back'), 20, 'no traced path lost on the back');
Object.values(BH_SESS).forEach(s => s.split(' ').forEach(k => assert(BH_EX.some(e => e[0] === k), 'unknown exercise ' + k)));

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
console.log('training check ok');
