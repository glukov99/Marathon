/* Checks the invoice/payment matcher in app.js. Made-up rows, no network.
   Run: node business/match-check.js   */
const fs = require('fs'), assert = require('assert');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const ctx = {};
new Function('ctx', src.slice(src.indexOf('function classify'),
  src.indexOf('async function load')) + '\nctx.prep = prep;')(ctx);

const inv = (no, issued, amount_eur, client) => ({ no, issued, amount_eur, client });
const tx = (d, a, desc, cat) => ({ d, a, c: 'EUR', desc, cat: cat || 'Income', who: '' });

const j = ctx.prep({
  invoices: [
    inv('1', '2024-05-13', 635.02, 'A'),          // same number as the next one,
    inv('1', '2024-09-20', 153.39, 'B'),          // five months apart
    inv('40', '2026-03-31', 40.00, 'C'),          // paid by card before it was written
    inv('70', '2026-05-01', 999.00, 'D'),         // nothing paid it
    inv('80', '2026-06-01', 200.00, 'E'),         // half paid
    Object.assign(inv('90', '2026-07-01', 500.00, 'F'), { status: 'cancelled' })
  ],
  tx: [
    tx('2024-05-23', 635.02, 'ф-ра: 0000000001'), // must reach the May invoice
    tx('2024-09-20', 153.39, 'ПРОФОРМА 0001'),    // and this one the September one
    tx('2026-03-10', 40.00, 'Payment on myPOS'),  // 21 days BEFORE the invoice
    tx('2026-05-02', 999.00, 'Sent from myPOS', 'Transfer'),  // same money twice
    tx('2026-06-05', 100.00, 'ф-ра: 0000000080'),  // half of it, by number
    tx('2026-10-12', 50.00, 'Payment on myPOS')   // no invoice for it yet
  ]
});
const by = n => j.invoices.filter(i => i.no === n);

assert.equal(by('1')[0]._paid.row.d, '2024-05-23', 'a shared number must go by date');
assert.equal(by('1')[1]._paid.row.d, '2024-09-20');
assert.ok(by('40')[0]._paid, 'money that arrives before the invoice still pays it');
assert.equal(by('70')[0]._paid, null, 'a transfer is not a client paying');
assert.equal(by('80')[0]._short, 100, 'part payment reports what is short');
assert.deepEqual(j.unbilled.map(c => c.d), ['2026-10-12'], 'money with no invoice');
assert.equal(j.live.length, 5, 'a cancelled invoice is not counted');
assert.equal(by('90')[0]._paid, undefined, 'and is never matched');
console.log('matcher ok: ' + j.live.filter(i => i._paid).length + '/5 paid, '
  + j.unbilled.length + ' to invoice');
