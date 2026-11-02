/* Self-check for shared/budget.js. Run: node money/budget-check.js */
const a = require('assert');
const B = require('../shared/budget.js');
const T = (d, amt, k, cat, own, mine) => ({ d, a: amt, c: 'EUR', _k: k, _cat: cat, own: own || 'Personal', mine: !!mine });
const S = { start: '2026-11', opening: 0, needsFixed: 900, savePct: 20,
  funds: [{ name: 'Gifts', per: 50, mode: 'pile', target: 0, cats: ['Gifts'] },
    { name: 'Eating out', per: 150, mode: 'top', target: 0, cats: ['Eating out'] },
    { name: 'Fun', per: 30, mode: 'top', target: 0, cats: ['Fun'] },
    { name: 'Giulietta', per: 300, mode: 'pile', target: 600, cats: ['Giulietta'] }],
  cover: ['Unassigned', 'Fun', 'Eating out', 'Giulietta', 'Gifts', 'Needs', 'Savings'] };
const get = (c, n) => c.list.find(l => l.name === n);

// November: salary on 30 Oct fills Needs, Savings, then Wants in order; the rest waits.
const rows = [
  T('2026-10-30', 2000, 'inc', 'Income'),
  T('2026-11-03', -500, 'exp', 'Groceries'),
  T('2026-11-05', -100, 'exp', 'Shopping'),        // no budget of its own: comes out of Fun
  T('2026-11-06', -300, 'move', 'Transfer'),        // own accounts: ignored
  T('2026-11-08', -200, 'save', 'Savings')          // moved to the savings account
];
const nov = B.run(rows, S, '2026-11').cur;
a.deepStrictEqual(nov.period, { from: '2026-10-30', to: null, open: true, salary: true });
a.deepStrictEqual(nov.list.map(l => [l.name, l.added]),
  [['Needs', 900], ['Savings', 400], ['Gifts', 50], ['Eating out', 150], ['Fun', 30], ['Giulietta', 300], ['Unassigned', 170]]);
a.strictEqual(get(nov, 'Needs').available, 400);
a.strictEqual(get(nov, 'Savings').available, 200);   // 400 put by, 200 already moved
// Fun went to −70 and was covered at once from Unassigned.
a.strictEqual(get(nov, 'Fun').available, 0);
a.strictEqual(get(nov, 'Fun').moved, 70);
a.strictEqual(get(nov, 'Unassigned').available, 100);
a.strictEqual(get(nov, 'Unassigned').moved, -70);
// All budgets together = money held: 2000 in, 600 spent, 200 moved to savings.
a.strictEqual(nov.total, 1200);

// December: top-up budgets refill only to their goal, pile budgets add again,
// Giulietta stops at its target, Unassigned carries into the pool.
const r2 = rows.concat([T('2026-11-29', 2000, 'inc', 'Income')]);
const dec = B.run(r2, S, '2026-12').cur;
a.strictEqual(dec.moneyIn, 2100);
a.deepStrictEqual(dec.list.map(l => [l.name, l.added]),
  [['Needs', 500], ['Savings', 400], ['Gifts', 50], ['Eating out', 0], ['Fun', 30], ['Giulietta', 300], ['Unassigned', 820]]);
a.strictEqual(get(dec, 'Gifts').available, 100);
a.strictEqual(get(dec, 'Giulietta').saved, 600);
const jan = B.run(r2.concat([T('2026-12-30', 2000, 'inc', 'Income')]), S, '2027-01').cur;
a.strictEqual(get(jan, 'Giulietta').added, 0);

// A big overspend empties the Wants, then Needs, then borrows from Savings;
// the next income pays Savings back first.
const big = rows.concat([T('2026-11-10', -1100, 'exp', 'Fun')]);
const b1 = B.run(big, S, '2026-11').cur;
// Fun −1170: Unassigned 170, Eating out 150, Giulietta 300, Gifts 50, Needs 400, Savings 100.
a.strictEqual(get(b1, 'Fun').available, 0);
a.deepStrictEqual(b1.list.map(l => [l.name, l.available]),
  [['Needs', 0], ['Savings', 100], ['Gifts', 0], ['Eating out', 0], ['Fun', 0], ['Giulietta', 0], ['Unassigned', 0]]);
a.strictEqual(b1.owed, 100);
a.strictEqual(b1.total, 100);
const b2 = B.run(big.concat([T('2026-11-29', 2000, 'inc', 'Income')]), S, '2026-12').cur;
a.strictEqual(get(b2, 'Savings').goal, 400 + b1.owed);
a.strictEqual(b2.owed, 0);

// Joint: only payments he categorised by hand count.
const j = rows.concat([T('2026-11-12', -80, 'exp', 'Travel', 'Joint', false), T('2026-11-13', -60, 'exp', 'Eating out', 'Joint', true)]);
a.strictEqual(get(B.run(j, S, '2026-11').cur, 'Eating out').spent, 60);

// Unbooked card payments come out of Fun in the running month.
const p = B.run(rows, S, '2026-11', [{ d: '2026-11-14', a: -20, c: 'EUR' }]).cur;
a.strictEqual(p.pending, 20);
a.strictEqual(p.total, 1180);

// Opening money joins the first month's pool.
a.strictEqual(B.run(rows, Object.assign({}, S, { opening: 165 }), '2026-11').cur.total, 1365);

// Business, on cash: taxes paid count; VAT inside the money received is shown.
const b = [T('2026-11-04', 1200, 'inc', 'Income', 'Business'), T('2026-11-05', -270, 'exp', 'Rent', 'Business'),
  T('2026-11-06', -500, 'exp', 'Taxes', 'Business'), T('2026-11-07', -30, 'exp', 'Fees', 'Business'),
  T('2026-11-08', -100, 'move', 'Transfer', 'Business')];
a.deepStrictEqual(B.business(b, S, '2026-11'),
  { m: '2026-11', received: 1200, vat: 200, costs: 300, taxes: 500, cash: 400, tax: 40, free: 360 });
a.strictEqual(B.businessSince(b.concat([T('2026-12-05', -270, 'exp', 'Rent', 'Business')]), S, '2026-11', '2026-12'), 90);
a.strictEqual(B.run(b, S, '2026-11').cur.income, 0);    // never in the personal budgets

// Emergency fund.
const e = B.emergency({ needsFixed: 900, emergency: { months: 6, extra: 600, accounts: ['Savings'] } },
  [{ account: 'Savings', amount: 3000, currency: 'EUR' }, { account: 'Other', amount: 999, currency: 'EUR' }], 400);
a.deepStrictEqual(e, { target: 9000, have: 3000, gap: 6000, months: 15 });

// Older saved settings gain the new funds and modes, keeping his amounts.
const old = { v: 2, funds: [{ name: 'Gifts', per: 40, target: 0, cats: ['Gifts'] }, { name: 'Bike', per: 20, target: 0, cats: ['Bike'] }] };
a.strictEqual(B.migrate(old), true);
a.deepStrictEqual(old.funds.map(f => f.name), ['Gifts', 'Eating out', 'Entertainment', 'Clothes', 'Travel', 'Fun', 'Giulietta', 'Leica', 'Bike']);
a.strictEqual(old.funds[0].per, 40); a.strictEqual(old.funds[0].mode, 'pile'); a.strictEqual(old.funds[8].mode, 'pile');
a.strictEqual(B.migrate(old), false);

console.log('budget: all cases pass');
