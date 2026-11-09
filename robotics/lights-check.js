/* The lights panel: spans for the day chart and the event wording. Run: node robotics/lights-check.js */
const assert = require('assert');
const { lightSpans, lightText, lowBlinds, LIGHTS_GAP } = require('./lights.js');
const M = 60e3, t0 = Date.parse('2026-11-07T00:00:00'), at = m => t0 + m * M;
const rows = [
  { at: at(600), ev: 'in', p: 1, a: 0 }, { at: at(601), ev: 'on', p: 1, a: 1, day: 42.4 },
  { at: at(610), ev: 's', p: 1, a: 1 }, { at: at(620), ev: 's', p: 1, a: 1 },
  { at: at(625), ev: 'out', p: 0, a: 1 }, { at: at(626), ev: 'off', why: 'empty', p: 0, a: 0 },
];
assert.deepEqual(lightSpans(rows, 'a', t0, t0 + 864e5), [[at(601), at(626)]], 'lights on 10:01 to 10:26, samples merge');
assert.deepEqual(lightSpans(rows, 'p', t0, t0 + 864e5), [[at(600), at(625)]], 'someone there 10:00 to 10:25');
// the board went silent while on: the span stops 11 min after the last report, it is not stretched to the next one
const silent = [{ at: at(0), ev: 'on', a: 1 }, { at: at(300), ev: 'off', a: 0 }];
assert.deepEqual(lightSpans(silent, 'a', t0, t0 + 864e5), [[at(0), at(0) + LIGHTS_GAP]]);
// clipped to the day shown
assert.deepEqual(lightSpans([{ at: at(-5), a: 1 }, { at: at(5), a: 0 }], 'a', t0, t0 + 864e5), [[t0, at(5)]]);
assert.equal(lightText(rows[1]), 'Lights on (dark, daylight 42)');
assert.equal(lightText({ ev: 'off', why: 'bright', day: 95 }), 'Lights off (bright enough, daylight 95)');
assert.equal(lightText(rows[5]), 'Lights off (room empty)');
assert.equal(lightText({ ev: 's' }), null, 'samples are drawn, not listed');
console.log('lights panel ok');

// Reports and the false-off flag
const { falseOffs, boardRows, REPORTS } = require('./lights.js');
const day2 = [
  { at: at(700), ev: 'on', a: 1, p: 1 },
  { at: at(720), ev: 'off', why: 'empty', a: 0, p: 0 },
  { at: at(721), ev: 'in', a: 0, p: 1 },             // back in after 1 min: a false off
  { at: at(722), ev: 'report', why: 'off-present' },  // and Georgi said so
  { at: at(722.5), ev: 'on', a: 1, p: 1 },
  { at: at(800), ev: 'off', why: 'empty', a: 0, p: 0 },
  { at: at(810), ev: 'in', a: 0, p: 1 },             // 10 min later: a real exit and return
  { at: at(830), ev: 'off', why: 'bright', a: 0, p: 1 },
];
assert.deepEqual(falseOffs(day2), [at(720)], 'only the off that someone walked back into within 2 min');
// a report carries no state: it must not cut the lights-on band in two
const withRep = [{ at: at(900), ev: 'on', a: 1 }, { at: at(905), ev: 'report', why: 'on-bright' }, { at: at(908), ev: 'off', a: 0 }];
assert.deepEqual(lightSpans(boardRows(withRep), 'a', t0, t0 + 864e5), [[at(900), at(908)]]);
assert.notDeepEqual(lightSpans(withRep, 'a', t0, t0 + 864e5), [[at(900), at(908)]], 'without the filter the report would cut it');
assert.equal(lightText(day2[3]), 'You reported: turned off while I was there');
assert.equal(Object.keys(REPORTS).length, 5);
assert.ok(lightText({ ev: 'report', why: 'off-dark' }).includes('still dark'));
// blinds (9 Nov 2026): schedule rows are listed, low battery at 10% or less
assert.equal(lightText({ ev: 'blind', why: 'open' }), 'Blinds opened (schedule)');
assert.equal(lightText({ ev: 'blind', why: 'missed close' }), 'Blinds did not close: no Wi-Fi or Tuya for 15 min');
assert.deepEqual(lowBlinds({ left: { pct: 80 }, right: { pct: 10 } }), ['right 10%']);
assert.deepEqual(lowBlinds(undefined), []);
console.log('lights reports ok');
