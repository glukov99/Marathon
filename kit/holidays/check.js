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
console.log('holidays ok');
