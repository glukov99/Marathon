/* Self-check for classify() and totals() in app.js. Run: node money/classify-check.js
   Reads the functions out of app.js so there is no second copy to keep in step. */
const a = require('assert'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const grab = name => {
  const m = src.match(new RegExp('^function ' + name + '\\([\\s\\S]*?^}', 'm'));
  a.ok(m, name + '() not found in app.js');
  return m[0];
};
const [classify, totals] = new Function(
  grab('classify') + grab('totals') + '; return [classify, totals];')();

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
// Another currency follows the same rules; only the totals keep them apart.
a.deepStrictEqual(c({ a: 20, c: 'GBP', cat: '' }), { k: 'inc', cat: 'Uncategorised' });
a.deepStrictEqual(c({ a: -5, c: 'GBP', cat: ' Travel ' }), { k: 'exp', cat: 'Travel' });
a.deepStrictEqual(c({ a: -5, c: 'GBP', cat: 'Transfer' }), { k: 'move', cat: 'Transfer' });
// totals() counts one currency at a time, so GBP never lands in the EUR line.
const mixed = [
  { c: 'EUR', a: 100, _k: 'inc' }, { c: 'EUR', a: -40, _k: 'exp' },
  { c: 'GBP', a: 10, _k: 'inc' }, { c: 'GBP', a: -4, _k: 'exp' },
  { c: 'EUR', a: -500, _k: 'move' }, { c: 'GBP', a: -7, _k: 'save' }
];
a.deepStrictEqual(totals(mixed), { inc: 100, exp: 40, net: 60 });
a.deepStrictEqual(totals(mixed, 'EUR'), { inc: 100, exp: 40, net: 60 });
a.deepStrictEqual(totals(mixed, 'GBP'), { inc: 10, exp: 4, net: 6 });
a.deepStrictEqual(totals([], 'GBP'), { inc: 0, exp: 0, net: 0 });

console.log('classify + totals: all cases pass');
