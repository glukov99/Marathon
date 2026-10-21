/* The Ideas jar must never lose an idea when two devices both added one.
   Run: node jar/check.js */
const assert = require('assert');
const { mergeIdeas, sig, shown } = require('./app.js');

const i = (id, at, u, extra) => Object.assign({ id, t: id, area: 'Life', at, u, s: 'new' }, extra);
const phone = [i('a', 1, 1), i('b', 3, 3)];
const laptop = [i('a', 1, 5, { s: 'review' }), i('c', 2, 2)];

const m = mergeIdeas(phone, laptop);
assert.deepStrictEqual(m.map(x => x.id), ['b', 'c', 'a'], 'both devices keep their ideas, newest first');
assert.strictEqual(m.find(x => x.id === 'a').s, 'review', 'the newer edit of the same idea wins');
assert.strictEqual(sig(mergeIdeas(m, phone)), sig(m), 'merging again changes nothing');
assert.strictEqual(sig(mergeIdeas([], m)), sig(m), 'a new device takes everything');

const now = new Date('2026-10-21T15:00').getTime(), H = 36e5;
const all = [i('today', now - H, 0, { area: 'QA work' }), i('lastwk', now - 5 * 24 * H, 0),
  i('old', now - 40 * 24 * H, 0), i('acted', now - H, 0, { s: 'done' }), i('gone', now - H, 0, { s: 'dropped' })];
const f = o => shown(all, Object.assign({ tab: 'new', area: 'all', when: 'all', old: false }, o), now).map(x => x.id);
assert.deepStrictEqual(f({}), ['today', 'lastwk', 'old']);
assert.deepStrictEqual(f({ when: '1' }), ['today']);
assert.deepStrictEqual(f({ when: '7' }), ['today', 'lastwk']);
assert.deepStrictEqual(f({ area: 'QA work' }), ['today']);
assert.deepStrictEqual(f({ old: true }), ['old', 'lastwk', 'today']);
assert.deepStrictEqual(f({ tab: 'done' }), ['acted', 'gone'], 'Finished holds acted on and discarded');
console.log('jar ok');
