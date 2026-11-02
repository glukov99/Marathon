/* Skip, move and away days: training/overrides.js. Run: node training/overrides-check.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ localStorage: { getItem: () => null } });
for (const f of ['plan.js', '../holidays/holidays-data.js', '../shared/travel.js', 'overrides.js'])
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), ctx);
const { W, OV } = vm.runInContext('({W,OV})', ctx);
const t = (wi, d, st) => { OV.set(st); return OV.day(wi, d).map(r => (r.skip ? 'skip:' : r.out ? 'out:' : r.from ? 'in:' : '') + r.x.t); };

// Week 2 Monday (2 Nov 2026): easy run, the 2k row test, yoga. No broad jump anywhere.
assert(!W.flatMap(w => w.days.flat()).some(x => /broad jump/i.test(x.t + x.d)), 'broad jump is gone');
const base = t(1, 0, {});
assert.strictEqual(base.slice(0, 2).join(' | '), 'Easy run 30 min | Test: 2k row');

// Skip: stays on its day, marked, with the reason.
let s = t(1, 0, { skips: { 'w2-0-1': 'Holiday' } });
assert.strictEqual(s[1], 'skip:Test: 2k row');

// Move: leaves Monday, joins Wednesday before the evening yoga.
s = t(1, 0, { moves: { 'w2-0-1': '2026-11-04' } });
assert.strictEqual(s[1], 'out:Test: 2k row');
const wed = t(1, 2, { moves: { 'w2-0-1': '2026-11-04' } });
assert(wed.includes('in:Test: 2k row') && /^PM yoga/.test(wed[wed.length - 1]), 'moved in, before the yoga');

// Away 2–4 Nov: runs stay, gym becomes bodyweight, the test moves to the first gym day back (Thu 5 Nov, core).
const away = { away: [{ from: '2026-11-02', to: '2026-11-04', n: 'Away' }] };
s = t(1, 0, away);
assert.strictEqual(s[0], 'Easy run 30 min');
assert.strictEqual(s[1], 'out:Test: 2k row');
const thu = t(1, 3, away);
assert(thu.includes('in:Test: 2k row'), 'test lands on Thursday: ' + thu.join(' | '));
// Gym A on an away Monday (week 3, 9 Nov) becomes the hotel version.
const aw3 = { away: [{ from: '2026-11-09', to: '2026-11-09' }] };
assert(t(2, 0, aw3).some(x => /^Hotel legs/.test(x)), 'Gym A away is bodyweight');

// An explicit move wins over the automatic one; a skip wins over both.
assert(t(1, 4, { ...away, moves: { 'w2-0-1': '2026-11-06' } }).includes('in:Test: 2k row'));
assert(!t(1, 3, { ...away, skips: { 'w2-0-1': 'Holiday' } }).includes('in:Test: 2k row'));
console.log('overrides check ok');
