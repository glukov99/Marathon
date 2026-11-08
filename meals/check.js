/* Fuel follows the training: M_fuel in meals/meals-data.js (8 Nov 2026). Run: node meals/check.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ localStorage: { getItem: () => null } });
for (const f of ['training/plan.js', 'holidays/holidays-data.js', 'shared/travel.js', 'training/overrides.js', 'meals/meals-data.js'])
  vm.runInContext(fs.readFileSync(__dirname + '/../' + f, 'utf8'), ctx);
const F = vm.runInContext('M_fuel', ctx);
// Week 3 as he moved it after the Rodopi run: Monday empty, the quality run and Gym A on Thursday.
const st = { moves: { 'w3-0-0': '2026-11-12', 'w3-0-1': '2026-11-12', 'w3-3-0': '2026-11-11', 'w3-3-1': '2026-11-10' }, skips: { 'w3-2-0': 'Other' } };
const d = s => F(new Date(s + 'T12:00'), st);
assert.strictEqual(d('2026-11-09').type[0], 'Rest day: fewer carbs', 'Monday lost its run, so it is a rest day');
assert.strictEqual(d('2026-11-12').type[0], 'Quality day: more carbs', 'the moved quality run makes Thursday the carb day');
assert.ok(/Dinner: add carbs\. Tomorrow is sub-threshold/.test(d('2026-11-11').dinner), 'carbs the evening before');
assert.ok(/keto/.test(d('2026-11-10').dinner), 'otherwise keto by day');
assert.ok(/big carb meal/.test(d('2026-11-13').post), 'a big meal after the long run');
assert.ok(/No run today/.test(d('2026-11-14').post), 'no carb meal without a run');
assert.strictEqual(F(new Date('2020-01-01T12:00'), st), null, 'outside the season: none, the page keeps its fixed week');
console.log('meals check ok');
