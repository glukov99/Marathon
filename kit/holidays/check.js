/* Holidays arithmetic. Run: node kit/holidays/check.js */
const assert = require('assert');
require('./hol.js');
const H = globalThis.Hol;
const bank = { '2026-12-25': 1, '2026-12-28': 1, '2027-01-01': 1 };

// a Mon-Fri week is 5 days; weekends and bank holidays are not leave
assert.strictEqual(H.leaveDays({ from: '2026-11-02', to: '2026-11-08' }, {}), 5);
assert.strictEqual(H.leaveDays({ from: '2026-12-24', to: '2027-01-03' }, bank), 4, 'Christmas trip: 24, 29, 30, 31');
assert.strictEqual(H.leaveDays({ from: '2026-11-07', to: '2026-11-08' }, {}), 0, 'a weekend away costs nothing');
assert.strictEqual(H.leaveDays({ from: '2026-11-10', to: '2026-11-09' }, {}), 0, 'end before start');

// leave years: January or April starts
assert.deepStrictEqual(H.leaveYear('2026-10-22', 1), { from: '2026-01-01', to: '2026-12-31' });
assert.deepStrictEqual(H.leaveYear('2026-02-10', 4), { from: '2025-04-01', to: '2026-03-31' });
assert.deepStrictEqual(H.leaveYear('2026-04-01', 4), { from: '2026-04-01', to: '2027-03-31' });

// a trip across the year end counts only its days inside the year
const xmas = [{ from: '2026-12-24', to: '2027-01-03' }];
assert.strictEqual(H.used(xmas, H.leaveYear('2026-10-22', 1), bank), 4, 'all four leave days fall in 2026');
assert.strictEqual(H.used(xmas, H.leaveYear('2027-02-01', 1), bank), 0, 'Jan 1 is a bank holiday, 2-3 Jan a weekend');

// friends
const f = { every: 28, met: ['2026-09-01', '2026-10-01'] };
assert.deepStrictEqual(H.friend(f, '2026-10-20'), { last: '2026-10-01', since: 19, over: -9, due: false, year: 2, total: 2 });
assert.strictEqual(H.friend(f, '2026-10-29').due, true, 'due on day 28');
assert.strictEqual(H.friend({ every: 14 }, '2026-10-20').due, true, 'never met is due');

// calendar: end date is the day after, as all-day events need
const ics = H.ics([{ id: 't1', name: 'Rome, with Sam', from: '2026-11-02', to: '2026-11-06', place: 'Rome' }], '20261022T120000Z');
assert.ok(ics.includes('DTSTART;VALUE=DATE:20261102') && ics.includes('DTEND;VALUE=DATE:20261107'));
assert.ok(ics.includes('SUMMARY:Rome\\, with Sam'), 'commas escaped');
// best windows: Easter 2027 in England (Good Friday 26 Mar, Easter Monday 29 Mar)
const ew = { '2027-03-26': 1, '2027-03-29': 1 };
const br = H.bridges('2027-03-01', '2027-04-30', ew, 5);
const easter = br.find(w => w.from <= '2027-03-26' && w.to >= '2027-03-29');
assert.ok(easter && easter.days / easter.leave >= 2.5, 'Easter turns 4 leave days into 10: ' + JSON.stringify(easter));
assert.ok(br.every(w => w.leave >= 1 && w.leave <= 5), 'never a free weekend, never more than 5 days');
assert.ok(br.every((w, i) => !br.some((o, j) => j !== i && w.from <= o.to && w.to >= o.from)), 'no overlaps');
assert.deepStrictEqual(H.bridges('2026-11-02', '2026-11-27', {}, 5), [], 'no bank holidays: nothing beats a plain week');
// quiet weeks start on a Saturday a week after schools return, and are term time
const ql = H.school('england-and-wales'), qw = H.quietWeeks('2027-01-01', '2027-12-31', ql, ew);
assert.ok(qw.length >= 4 && qw.every(w => new Date(w.from + 'T12:00Z').getUTCDay() === 6 && !H.inSchool(w.from, w.to, ql)));
assert.ok(qw.find(w => w.after === 'Easter holidays').from === '2027-04-17', 'Easter ends Sun 11 Apr; back Mon 12; the week after starts Sat 17');
assert.strictEqual(H.inSchool('2027-08-01', '2027-08-07', ql)[2], 'Summer holidays');
console.log('holidays ok');
