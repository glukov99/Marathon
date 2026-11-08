/* The coach: training/coach.js. Run: node training/coach-check.js */
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const ctx = vm.createContext({ localStorage: { getItem: () => null } });
for (const f of ['plan.js', '../holidays/holidays-data.js', '../shared/travel.js', 'overrides.js', 'coach.js'])
  vm.runInContext(fs.readFileSync(__dirname + '/' + f, 'utf8'), ctx);
const { Coach } = vm.runInContext('({Coach})', ctx);
const day = s => new Date(s + 'T12:00');
const flat = n => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 9, 10 + i)).toISOString().slice(0, 10), hrv: 43, rhr: 63, atl: 24, ctl: 25, form: 1 }));

// 8 Nov 2026 as it happened: 3 h in the Rodopi, 655 m up; ATL 46.6, CTL 29. His own moves that evening
// put the sub-threshold on Tue 10 and Tue's easy run on Mon 9; the moved long run (to Sun 8) is done.
const rodopi = {
  today: day('2026-11-08'),
  well: flat(29).concat([{ date: '2026-11-08', hrv: 40, rhr: 62, atl: 46.6, ctl: 29, form: -18 }]),
  acts: [{ id: 'a1', date: '2026-11-08T14:27', type: 'TrailRun', moving_time: 179 * 60, elev: 655 }],
  state: { checks: { 'w2-4-0': true }, moves: { 'w2-4-0': '2026-11-08', 'w3-0-0': '2026-11-10', 'w3-1-0': '2026-11-09' },
    skips: { 'w2-0-1': 'x', 'w2-6-0': 'x', 'w2-4-1': 'x' } }
};
const s = Coach.suggest(rodopi), by = r => s.find(x => x.rule === r);
assert(by('big') && by('big').ops.skips['w3-2-0'], 'the Wednesday hills are skipped: ' + JSON.stringify(s));
const sp = by('spike');
assert(sp, 'the spike is seen');
assert.strictEqual(sp.ops.moves['w3-0-0'], '2026-11-12', 'the sub-threshold goes to Thursday, not Tuesday');
assert.strictEqual(sp.ops.moves['w3-0-1'], '2026-11-12', 'Gym A goes with it');
assert(!by('morning'), 'morning numbers were normal');
assert(s.every(x => !/Fran/.test(JSON.stringify(x.ops))), 'Sunday\'s Fran is left alone');

// A dismissed card stays dismissed.
const again = Coach.suggest({ ...rodopi, state: { ...rodopi.state, coachNo: { [sp.id]: '2026-11-08' } } });
assert(!again.some(x => x.id === sp.id), 'Not now hides that card');

// Accepting removes the reason: with the moves in place, no spike card is offered again for those sessions.
const after = Coach.suggest({ ...rodopi, state: { ...rodopi.state, moves: { ...rodopi.state.moves, ...sp.ops.moves }, skips: { ...rodopi.state.skips, ...by('big').ops.skips } } });
assert(!after.some(x => x.ops.moves && x.ops.moves['w3-0-0']), 'nothing left to move after Accept');

// A quiet week: nothing to say.
assert.strictEqual(Coach.suggest({ today: day('2026-11-17'), well: flat(30).map((w, i) => ({ ...w, date: new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10) })), acts: [], state: { checks: { 'w4-0-0': true, 'w4-0-1': true } } }).filter(x => x.rule !== 'missed').length, 0, 'calm data, no cards');

// Morning: HRV well down and resting HR well up on a hard day (Mon 16 Nov, sub-threshold) -> it moves.
const m = flat(30).map((w, i) => ({ ...w, date: new Date(Date.UTC(2026, 9, 17 + i)).toISOString().slice(0, 10), hrv: 42 + (i % 3), rhr: 62 + (i % 2) }));
m.push({ date: '2026-11-16', hrv: 33, rhr: 70, atl: 25, ctl: 26, form: 1 });
const mo = Coach.suggest({ today: day('2026-11-16'), well: m, acts: [], state: { checks: {} } }).find(x => x.rule === 'morning');
assert(mo && Object.keys(mo.ops.moves).length, 'a bad morning moves the hard session');

// Missed: Monday's sub-threshold of week 4 not ticked by Wednesday -> offered on a free day.
const mi = Coach.suggest({ today: day('2026-11-18'), well: [], acts: [], state: { checks: {} } }).filter(x => x.rule === 'missed');
assert(mi.length && mi.every(x => x.ops.moves || x.ops.skips), 'a missed hard session gets a day or a drop');

console.log('coach check ok');
