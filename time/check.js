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
// b) phone along: GPS left home 3 min before the watch started; the GPS stop-less trip becomes Run, total from the GPS leave.
const two = [{ id: 'a', start: d - 600 * M, end: d + 97 * M, lat: 42.1354, lon: 24.7453 }, { id: 'b', start: d + 140 * M, end: d + 600 * M, lat: 42.1354, lon: 24.7453 }];
t = T.build(T.merge([], two, places, null, run), d + 700 * M);
assert.equal(t.filter(x => x.what === 'Run').length, 1);
assert.equal(t.find(x => x.what === 'Run').parts.total / M, 39);
// c) a treadmill-like run inside a gym stay is left out
assert.equal(T.merge([], [{ id: 'g', start: d + 90 * M, end: d + 150 * M, lat: 42.15, lon: 24.76 }], places, null, run).filter(m => m.src === 'run').length, 0);

console.log('time check ok');
