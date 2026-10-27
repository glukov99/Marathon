// node time/check.js — trip building, stats and the planner on made-up marks with hand-worked answers.
const T = require('./trips.js');
const assert = require('assert');
const M = 60e3, d = Date.parse('2026-10-28T05:00:00Z'); // 07:00 Sofia
let n = 0;
const mk = (min, mark, x = {}) => ({ id: 'm' + (++n), at: d + min * M, mark, what: '', place: '', end: 0, ...x });

// 1. Full trip: ready 07:00, out 07:20 (heat), nursery 07:32–07:40, gym 07:55–09:25, back 09:45
let marks = [mk(0, 'ready', { what: 'Nursery drop-off' }), mk(20, 'out'), mk(32, 'in', { place: 'Nursery' }), mk(40, 'off', { place: 'Nursery' }),
  mk(55, 'in', { place: 'Gym' }), mk(145, 'off', { place: 'Gym' }), mk(165, 'back')];
let t = T.build(marks, d + 200 * M);
assert.equal(t.length, 1);
assert.equal(t[0].what, 'Nursery drop-off');
assert.deepEqual(Object.fromEntries(Object.entries(t[0].parts).map(([k, v]) => [k, v / M])), { ready: 20, travel: 12, arrive: 32, there: 98, home: 20, total: 165 });

// 2. No menu tap: the place names it; afternoon nursery = pick-up. Duplicate out keeps the first.
n = 100;
marks = [mk(540, 'out'), mk(542, 'out'), mk(555, 'in', { place: 'Nursery' }), mk(565, 'off', { place: 'Nursery' }), mk(580, 'back')];
t = T.build(marks, d + 700 * M);
assert.equal(t[0].what, 'Nursery pick-up');
assert.equal(t[0].parts.travel / M, 15);
assert.equal(t[0].parts.total / M, 40);

// 3. Shop inside the 500 m ring: ready + back only. A stray back opens nothing. A second ready corrects the name.
marks = [mk(0, 'back'), mk(10, 'ready', { what: 'Gym' }), mk(11, 'ready', { what: 'Shop' }), mk(25, 'back')];
t = T.build(marks, d + 100 * M);
assert.equal(t.length, 1);
assert.equal(t[0].what, 'Shop');
assert.equal(t[0].start, d + 10 * M);
assert.equal(t[0].parts.total / M, 15);

// 4. Ready after leaving opens a new trip; 12 h of silence closes; an open trip is "open", an old one "unfinished".
marks = [mk(0, 'out'), mk(30, 'ready', { what: 'Friends' }), mk(800, 'ready', { what: 'Run' })];
t = T.build(marks, d + 805 * M);
assert.equal(t.length, 3);
assert.ok(t[0].open && t[0].what === 'Run');
assert.ok(t[1].unfinished && t[1].what === 'Friends');

// 5. Manual trip + stats + planner. Gym travel 20, 25, 30, 22 → median 22, plan (80th) 30; ready 10, 15, 40, 12 → plan 40.
n = 200;
marks = [mk(-3000, 'manual', { what: 'Gym', end: d - 3000 * M + 105 * M })];
[[10, 20], [15, 25], [40, 30], [12, 22]].forEach(([r, tr], i) => {
  const b = 1440 * (i + 1);
  marks.push(mk(b, 'ready', { what: 'Gym' }), mk(b + r, 'out'), mk(b + r + tr, 'in', { place: 'Gym' }), mk(b + r + tr + 90, 'off', { place: 'Gym' }), mk(b + r + 2 * tr + 90, 'back'));
});
t = T.build(marks, d + 9000 * M);
const s = T.stats(t).Gym;
assert.equal(s.n, 5);
assert.equal(s.parts.travel.med / M, 22);
assert.equal(s.parts.travel.plan / M, 30);
assert.equal(s.parts.ready.plan / M, 40);
const at = Date.parse('2026-11-05T16:00:00Z');
const p = T.plan(s, at);
assert.equal((at - p.leaveBy) / M, 30);
assert.equal((at - p.startBy) / M, 70);
// under 3 trips: the longest
assert.equal(T.stats(T.build(marks.slice(0, 6), d + 9000 * M)).Gym.parts.ready.plan / M, 10);

console.log('time check ok');
