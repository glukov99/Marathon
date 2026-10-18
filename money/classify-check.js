/* Self-check for classify() in app.js. Run: node money/classify-check.js
   Reads the function out of app.js so there is no second copy to keep in step. */
const a = require('assert'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const fn = src.match(/^function classify\([\s\S]*?^}/m);
a.ok(fn, 'classify() not found in app.js');
const classify = new Function(fn[0] + '; return classify;')();

const c = t => classify(Object.assign({ c: 'EUR', a: -5, acc: 'Main', cat: '' }, t));
// Money in, no usable category: same catch-all as expenses.
a.deepStrictEqual(c({ a: 20, cat: '' }), { k: 'inc', cat: 'Uncategorised' });
a.deepStrictEqual(c({ a: 20, cat: '   ' }), { k: 'inc', cat: 'Uncategorised' });
a.deepStrictEqual(c({ a: 20 }), { k: 'inc', cat: 'Uncategorised' });
// Money in with a category: the bank's own name, 'income' normalised.
a.deepStrictEqual(c({ a: 20, cat: 'Income' }), { k: 'inc', cat: 'Income' });
a.deepStrictEqual(c({ a: 20, cat: 'income' }), { k: 'inc', cat: 'Income' });
a.deepStrictEqual(c({ a: 20, cat: ' Refunds ' }), { k: 'inc', cat: 'Refunds' });
// Expenses: same rules.
a.deepStrictEqual(c({ a: -5, cat: '' }), { k: 'exp', cat: 'Uncategorised' });
a.deepStrictEqual(c({ a: -5, cat: '   ' }), { k: 'exp', cat: 'Uncategorised' });
a.deepStrictEqual(c({ a: -5, cat: ' Food ' }), { k: 'exp', cat: 'Food' });
// Own-account moves, savings, gift fund, fund interest, other currency.
a.deepStrictEqual(c({ a: 20, cat: ' TRANSFER ' }), { k: 'move', cat: 'Transfer' });
a.deepStrictEqual(c({ a: -5, cat: 'Savings' }), { k: 'save', cat: 'Savings' });
a.deepStrictEqual(c({ a: 20, acc: 'Gifts' }), { k: 'move', cat: 'Gift fund' });
a.deepStrictEqual(c({ a: -5, acc: 'Gifts' }), { k: 'exp', cat: 'Gifts' });
a.deepStrictEqual(c({ a: 20, _fund: true }), { k: 'inc', cat: 'Interest' });
a.deepStrictEqual(c({ a: 20, c: 'GBP', cat: 'X' }), { k: 'other', cat: 'X' });
console.log('classify: all cases pass');
