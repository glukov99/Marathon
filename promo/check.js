/* Promo codes: order of the list, expiry states, QR filter, merge.
   Run: node promo/check.js */
const assert = require('assert');
const { merge, sig, state, order, qrCode } = require('./app.js');

const T = '2026-10-30';
const c = (id, exp, at, extra) => Object.assign({ id, code: id, exp, at, u: at }, extra);
const all = [c('none1', '', 1), c('later', '2026-12-31', 2), c('soon', '2026-11-02', 3), c('old', '2026-09-01', 4),
  c('older', '2026-01-01', 5), c('none2', '', 6), c('today', T, 7), c('del', '2026-11-01', 8, { gone: 1 })];
assert.deepStrictEqual(order(all, T).map(x => x.id), ['today', 'soon', 'later', 'none2', 'none1', 'old', 'older'],
  'soonest first, then no date (newest first), then expired (most recent first); deleted hidden');
assert.strictEqual(state(c('x', T), T), 'soon', 'the expiry day itself still works');
assert.strictEqual(state(c('x', '2026-10-29'), T), 'expired');
assert.strictEqual(state(c('x', '2026-11-06'), T), 'soon');
assert.strictEqual(state(c('x', '2026-11-07'), T), 'ok');
assert.strictEqual(state(c('x', ''), T), 'none');

assert.strictEqual(qrCode(' SAVE20 '), 'SAVE20');
assert.strictEqual(qrCode('https://shop.bg/promo?c=1'), '', 'a link is not a code');
assert.strictEqual(qrCode('www.shop.bg/x'), '');
assert.strictEqual(qrCode('two words'), '');
assert.strictEqual(qrCode(''), '');

const phone = [c('a', '', 1), c('b', '', 2)], laptop = [Object.assign(c('a', '', 1), { u: 9, gone: 1 }), c('c', '', 3)];
const m = merge(phone, laptop);
assert.deepStrictEqual(m.map(x => x.id).sort(), ['a', 'b', 'c'], 'both devices keep their cards');
assert.ok(m.find(x => x.id === 'a').gone, 'a delete on one device wins over the older copy');
assert.strictEqual(sig(merge(m, phone)), sig(m), 'merging again changes nothing');
console.log('promo ok');
