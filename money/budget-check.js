/* Self-check for shared/budget.js. Run: node money/budget-check.js */
const a = require('assert');
const B = require('../shared/budget.js');
const r = n => Math.round(n * 100) / 100;
const T = (d, amt, k, cat, own) => ({ d, a: amt, c: 'EUR', _k: k, _cat: cat, own: own || 'Personal' });
const S = { start: '2026-11', needsFixed: 900, savePct: 20,
  funds: [{ name: 'Gifts', per: 50, target: 0, cats: ['Gifts'] }, { name: 'Giulietta', per: 300, target: 600, cats: ['Giulietta'] },
    { name: 'Leica', per: 250, target: 5500, cats: ['Leica'] }] };

// Salary on 30 Oct pays for November; a refund lowers its category.
const rows = [
  T('2026-10-30', 2000, 'inc', 'Income'),
  T('2026-11-03', -500, 'exp', 'Groceries'), T('2026-11-05', -100, 'exp', 'Shopping'),
  T('2026-11-06', 20, 'inc', 'Shopping'), T('2026-11-07', -300, 'move', 'Transfer'),
  T('2026-11-08', -200, 'save', 'Savings'),
  // December: salary on 29 Nov pays for it; Needs overspent, Giulietta fix paid.
  T('2026-11-29', 2000, 'inc', 'Income'), T('2026-12-02', -1000, 'exp', 'Groceries'), T('2026-12-03', -600, 'exp', 'Giulietta')
];
a.strictEqual(B.run(rows, S, '2026-11').cur.period.from, '2026-10-30');
const nov = B.run(rows, S, '2026-11').cur;
a.strictEqual(nov.income, 2000);
a.strictEqual(nov.save, 400);
a.strictEqual(nov.saved, 200);
a.strictEqual(nov.topUp, 900);
a.strictEqual(nov.needsBal, 400);            // 900 in, 500 spent
a.strictEqual(nov.wantsIn, 700);             // 2000 - 400 - 900
a.deepStrictEqual(nov.funds.map(f => f.put), [50, 300, 250]);
a.strictEqual(nov.funIn, 100);
a.strictEqual(nov.funSpent, 80);             // 100 shopping - 20 back
a.strictEqual(nov.funBal, 20);

const dec = B.run(rows, S, '2026-12').cur;
a.strictEqual(dec.carried, 400);
a.strictEqual(dec.topUp, 500);               // only up to 900
a.strictEqual(dec.needsBal, -100);           // overspent: next month tops up more
a.strictEqual(dec.wantsIn, 1100);            // the 400 not needed goes to Wants
const g = dec.funds.find(f => f.name === 'Giulietta');
a.strictEqual(g.put, 300); a.strictEqual(g.saved, 600); a.strictEqual(g.bal, 0);
a.strictEqual(dec.funBal, 20 + 1100 - 50 - 300 - 250);

// Fund stops at its target.
const jan = B.run(rows.concat([T('2026-12-30', 2000, 'inc', 'Income')]), S, '2027-01').cur;
a.strictEqual(jan.funds.find(f => f.name === 'Giulietta').put, 0);
a.strictEqual(jan.topUp, 1000);              // refills the 100 overspend too

// Payday to payday: spending after the salary lands belongs to the month it pays for.
const pp = [T('2026-10-20', -40, 'exp', 'Shopping'), T('2026-10-29', 1700, 'inc', 'Income'),
  T('2026-10-31', -138, 'exp', 'Sport'), T('2026-11-02', -60, 'exp', 'Clothes'),
  T('2026-11-27', 1600, 'inc', 'Income'), T('2026-11-28', -10, 'exp', 'Sport'),
  T('2026-11-10', 300, 'inc', 'Income')];          // a small mid-month payment is income, not a payday
const P = B.run(pp, { start: '2026-11' }, '2026-11').cur;
a.deepStrictEqual(P.period, { from: '2026-10-29', to: '2026-11-26', open: false, salary: true });
a.strictEqual(P.income, 2000);
a.strictEqual(P.funSpent, 138);
const cl = P.env.find(e => e.name === 'Clothes');
a.deepStrictEqual([cl.had, cl.spent, cl.left], [80, 60, 20]);
a.strictEqual(P.had, r(P.env.reduce((n, e) => n + e.had, 0)));
a.strictEqual(P.left, r(P.had - P.spent));
// The month whose next salary is not in yet runs on.
a.strictEqual(B.run(pp, { start: '2026-11' }, '2026-12').cur.period.open, true);
a.deepStrictEqual(B.salaryMonths(pp, null), ['2026-11', '2026-12']);

// Old saved settings gain the new funds, keeping his own values.
const old = { start: '2026-11', funds: [{ name: 'Gifts', per: 40, target: 0, cats: ['Gifts'] }, { name: 'Bike', per: 20, target: 0, cats: ['Bike'] }] };
a.strictEqual(B.migrate(old), true);
a.deepStrictEqual(old.funds.map(f => f.name), ['Gifts', 'Eating out', 'Entertainment', 'Clothes', 'Travel', 'Giulietta', 'Leica', 'Bike']);
a.strictEqual(old.funds[0].per, 40);
a.strictEqual(B.migrate(old), false);

// Business, on cash: taxes paid count; VAT inside the money received is shown.
const b = [T('2026-11-04', 1200, 'inc', 'Income', 'Business'), T('2026-11-05', -270, 'exp', 'Rent', 'Business'),
  T('2026-11-06', -500, 'exp', 'Taxes', 'Business'), T('2026-11-07', -30, 'exp', 'Fees', 'Business'),
  T('2026-11-08', -100, 'move', 'Transfer', 'Business')];
a.deepStrictEqual(B.business(b, S, '2026-11'),
  { m: '2026-11', received: 1200, vat: 200, costs: 300, taxes: 500, cash: 400, tax: 40, free: 360 });
// A month with a loss keeps no tax back and lowers the running total.
a.strictEqual(B.business([T('2026-12-05', -270, 'exp', 'Rent', 'Business')], S, '2026-12').free, -270);
a.strictEqual(B.businessSince(b.concat([T('2026-12-05', -270, 'exp', 'Rent', 'Business')]), S, '2026-11', '2026-12'), 90);
// Business rows never touch the personal envelopes.
a.strictEqual(B.run(b, S, '2026-11').cur.income, 0);

// Emergency fund.
const e = B.emergency({ needsFixed: 900, emergency: { months: 6, extra: 600, accounts: ['Savings'] } },
  [{ account: 'Savings', amount: 3000, currency: 'EUR' }, { account: 'Other', amount: 999, currency: 'EUR' }], 400);
a.deepStrictEqual(e, { target: 9000, have: 3000, gap: 6000, months: 15 });

console.log('budget: all cases pass');
