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
assert.equal(t[0].what, 'Nursery drop-off → Gym');
assert.deepEqual(t[0].legs.map(l => Object.fromEntries(Object.entries(l.parts).map(([k, v]) => [k, v / M]))),
  [{ ready: 20, travel: 12, arrive: 32, there: 8, total: 40 }, { travel: 15, arrive: 15, there: 90, home: 20, total: 125 }]);
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

// 6. GPS: home + gym visits, a ready tap at home. Home visit ends = out, next home visit starts = back. Heat marks inside GPS time drop.
const places = [{ name: 'Home', lat: 42.1354, lon: 24.7453, r: 150 }, { name: 'Gym', lat: 42.15, lon: 24.76, r: 150 }];
const vis = [{ id: 'v1', start: d - 600 * M, end: d + 30 * M, lat: 42.1355, lon: 24.7452 }, { id: 'v2', start: d + 50 * M, end: d + 140 * M, lat: 42.1501, lon: 24.7601 },
  { id: 'v3', start: d + 160 * M, end: 0, lat: 42.1354, lon: 24.7454 }, { id: 'v4', start: d + 400 * M, end: d + 420 * M, lat: 42.10, lon: 24.70 }];
vis[2].end = d + 390 * M;
const taps = [{ id: 't1', at: d + 10 * M, mark: 'ready', what: 'Gym', place: '', end: 0 }, { id: 'h1', at: d + 33 * M, mark: 'out', src: 'heat', what: '', place: '', end: 0 }];
const all = T.merge(taps, vis, places, null);
assert.ok(!all.some(m => m.id === 'h1'));
t = T.build(all, d + 500 * M);
const g = t.find(x => x.what === 'Gym');
assert.deepEqual([g.parts.ready, g.parts.travel, g.parts.there, g.parts.home, g.parts.total].map(x => x / M), [20, 20, 90, 20, 150]);
const un = t.find(x => T.UNNAMED.test(x.what));
assert.ok(un && un.what === '?42.100,24.700');
assert.ok(!T.stats(t)[un.what]);
assert.equal(T.unnamed(vis, places).length, 1);
assert.equal(T.unnamed(vis, places)[0].n, 1);

// 7. Runs from the watch. a) phone at home all day: the run is the whole trip, getting ready counted from the tap.
const home = [{ id: 'h', start: d - 600 * M, end: d + 600 * M, lat: 42.1354, lon: 24.7453 }];
const run = [{ id: '9', start: d + 100 * M, end: d + 136 * M }];
t = T.build(T.merge([{ id: 'r1', at: d + 85 * M, mark: 'ready', what: '', place: '', end: 0 }], home, places, null, run), d + 700 * M);
const rt = t.find(x => x.what === 'Run');
assert.ok(rt, 'run trip');
assert.deepEqual([rt.parts.ready, rt.parts.total].map(x => x / M), [15, 51]);
// b) phone along: GPS left home 3 min before the watch started and was back 4 min after it stopped: door to door.
const two = [{ id: 'a', start: d - 600 * M, end: d + 97 * M, lat: 42.1354, lon: 24.7453 }, { id: 'b', start: d + 140 * M, end: d + 600 * M, lat: 42.1354, lon: 24.7453 }];
t = T.build(T.merge([], two, places, null, run), d + 700 * M);
assert.equal(t.filter(x => x.what === 'Run').length, 1);
assert.equal(t.find(x => x.what === 'Run').parts.total / M, 43); // 97 → 140: includes the way home after the watch stopped
// c) a treadmill-like run inside a gym stay is left out
assert.equal(T.merge([], [{ id: 'g', start: d + 90 * M, end: d + 150 * M, lat: 42.15, lon: 24.76 }], places, null, run).filter(m => m.src === 'run').length, 0);

// d) no GPS around the run (gap in tracking), but GPS started earlier: the run is the trip
t = T.build(T.merge([], [{ id: 'old', start: d - 3000 * M, end: d - 2900 * M, lat: 42.1354, lon: 24.7453 }], places, null, run), d + 700 * M);
assert.equal(t.find(x => x.what === 'Run').parts.total / M, 36);
// e) runs from before Overland started do not count at all
assert.equal(T.merge([], [], places, null, run).length, 0);
assert.equal(T.merge([], [{ id: 'late', start: d + 500 * M, end: d + 600 * M, lat: 42.1354, lon: 24.7453 }], places, null, run).filter(m => m.src === 'run').length, 0);

// 8. The morning: ready 07:00 (tap "Nursery drop-off"), leave 07:20, nursery 07:30–07:36, run 07:40–08:20 (phone along), home 08:25.
const nur = { name: 'Nursery', lat: 42.14, lon: 24.75, r: 150 };
const pl2 = places.concat([nur]);
const mv = [{ id: 'h0', start: d - 600 * M, end: d + 20 * M, lat: 42.1354, lon: 24.7453 }, { id: 'n0', start: d + 30 * M, end: d + 36 * M, lat: 42.14, lon: 24.75 },
  { id: 'x0', start: d + 55 * M, end: d + 61 * M, lat: 42.13, lon: 24.70 }, // a chat mid-run: belongs to the run
  { id: 'h1', start: d + 85 * M, end: d + 900 * M, lat: 42.1354, lon: 24.7453 }];
t = T.build(T.merge([{ id: 'm1', at: d, mark: 'ready', what: 'Nursery drop-off', place: '', end: 0 }], mv, pl2, null, [{ id: '7', start: d + 40 * M, end: d + 80 * M }]), d + 1000 * M);
const mo = t.find(x => x.legs);
assert.equal(mo.what, 'Nursery drop-off → Run');
const L = mo.legs.map(l => [l.what, Object.fromEntries(Object.entries(l.parts).map(([k, v]) => [k, v / M]))]);
assert.deepEqual(L[0], ['Nursery drop-off', { ready: 20, travel: 10, arrive: 30, there: 6, total: 36 }]);
assert.deepEqual(L[1], ['Run', { travel: 4, arrive: 4, there: 40, home: 5, total: 49 }]);
assert.equal(mo.parts.total / M, 85);
const S = T.stats(t);
assert.ok(S['Nursery drop-off'] && S['Run'] && S['Nursery drop-off → Run']);
// planner: be at the nursery at 07:30 → start by 07:00, leave by 07:20
const pz = T.plan(S['Nursery drop-off'], d + 30 * M);
assert.deepEqual([(pz.startBy - d) / M, (pz.leaveBy - d) / M], [0, 20]);

// 9. A 4-min unnamed stop (traffic) on the way to the gym does not split the trip
t = T.build(T.merge([], [{ id: 'q0', start: d - 600 * M, end: d, lat: 42.1354, lon: 24.7453 }, { id: 'q1', start: d + 5 * M, end: d + 9 * M, lat: 42.11, lon: 24.71 },
  { id: 'q2', start: d + 20 * M, end: d + 100 * M, lat: 42.15, lon: 24.76 }, { id: 'q3', start: d + 120 * M, end: d + 900 * M, lat: 42.1354, lon: 24.7453 }], places, null, []), d + 1000 * M);
assert.ok(t.some(x => x.what === 'Gym' && !x.legs && x.parts.total / M === 120));

// 10. Home timers: start Cooking 18:00, start Bath time 18:40 (stops cooking), stop 19:05; a trip around them is untouched.
n = 900;
marks = [mk(660, 'start', { what: 'Cooking' }), mk(700, 'start', { what: 'Bath time' }), mk(725, 'stop'), mk(800, 'ready', { what: 'Shop' }), mk(815, 'back'), mk(900, 'start', { what: 'Cooking' })];
t = T.build(marks, d + 920 * M);
const tk = t.filter(x => x.task);
assert.deepEqual(tk.map(x => [x.what, x.parts.total ? x.parts.total / M : null, !!x.open]), [['Cooking', null, true], ['Bath time', 25, false], ['Cooking', 40, false]]);
assert.equal(t.find(x => x.what === 'Shop').parts.total / M, 15);
assert.equal(T.stats(t).Cooking.n, 1);
assert.equal((d + 1100 * M - T.plan(T.stats(t)['Bath time'], d + 1100 * M).startBy) / M, 25);

console.log('time check ok');
