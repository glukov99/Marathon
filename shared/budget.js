/* Budget: Georgi's money split into budgets that work like accounts. Pure maths,
   no DOM, so money/budget-check.js can run it in Node. (Plan agreed 2 Nov 2026.)

   Every budget has a Goal, what was Added this month, and what is Available.
   Together the budgets hold exactly his money in UniCredit + Revolut.

   A budget month runs payday to payday: it starts the day the salary lands (the
   first `salaryCat` payment of at least `salaryMin` on or after day `payday`) and
   ends the day before the next one. A month with no salary found runs from the 1st.

   Each month the money in (income of the month, the money that was there before
   the first month, and anything left Unassigned) fills, in this order:
   1. Needs, topped up to the fixed amount (what was not spent stays).
   2. Savings: first what an overspend borrowed from it, then `savePct` of income.
      Savings holds the money until it is moved to the savings account.
   3. Wants, in the listed order. 'top' budgets are topped up to their goal;
      'pile' budgets get their goal added every month (up to a target, if any).
   4. What is left stays Unassigned.
   Spending comes out of the budget its category belongs to; anything else comes
   out of Fun. Joint account payments count only when categorised by hand.
   A budget that goes below zero is covered at once, in the `cover` order:
   Unassigned, the flexible Wants, the pile Wants, then Needs, then Savings. */
(function (root) {
  const DEF = {
    v: 3,
    start: '2026-11',
    payday: 25,
    salaryCat: 'Income',
    salaryMin: 800,
    opening: 165.11,          // money in UniCredit + Revolut just before the first salary
    savePct: 20,
    needsFixed: 900,
    incomeCats: ['Income', 'Photography', 'Salary', 'Interest'],
    needsCats: ['Groceries', 'Utilities', 'Phone & internet', 'Fuel', 'Car', 'Childcare', 'Health', 'Insurance',
      'Home', 'Taxes', 'Fees', 'Transport', 'Mortgage', 'Rent', 'Pets', 'Education'],
    saveCats: ['Investments'],
    funds: [
      { name: 'Gifts', per: 50, target: 0, mode: 'pile', cats: ['Gifts', 'Gift'] },
      { name: 'Eating out', per: 150, target: 0, mode: 'top', cats: ['Eating out'] },
      { name: 'Entertainment', per: 70, target: 0, mode: 'top', cats: ['Entertainment'] },
      { name: 'Clothes', per: 80, target: 0, mode: 'top', cats: ['Clothes', 'Shopping'] },
      { name: 'Travel', per: 100, target: 0, mode: 'pile', cats: ['Travel', 'Holiday'] },
      { name: 'Fun', per: 30, target: 0, mode: 'top', cats: ['Fun'] },
      { name: 'Giulietta', per: 300, target: 600, mode: 'pile', cats: ['Giulietta'] },
      { name: 'Leica', per: 250, target: 2000, mode: 'pile', cats: ['Leica'] }
    ],
    catchAll: 'Fun',          // spending with no budget of its own
    cover: ['Unassigned', 'Fun', 'Clothes', 'Entertainment', 'Eating out', 'Leica', 'Giulietta', 'Travel', 'Gifts', 'Needs', 'Savings'],
    jointManualOnly: true,
    emergency: { months: 6, extra: 600, accounts: ['Flexible Cash Funds'] },
    // The company's free money also goes to `fund`; `target` is the whole goal.
    business: { vatShare: 1 / 6, taxPct: 10, fund: 'Leica', target: 5500 }
  };
  const r2 = n => Math.round(n * 100) / 100;
  const next = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7), 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const prevM = m => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 2, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  function settings(s) {
    const o = JSON.parse(JSON.stringify(DEF));
    if (!s) return o;
    Object.keys(s).forEach(k => {
      if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k]) && o[k] && !Array.isArray(o[k])) Object.assign(o[k], s[k]);
      else if (s[k] != null) o[k] = s[k];
    });
    return o;
  }
  const isSalary = (t, s) => t.c === 'EUR' && t.own !== 'Business' && t._k === 'inc' && t._cat === s.salaryCat &&
    t.a >= s.salaryMin && +t.d.slice(8, 10) >= s.payday;
  // Budget months that have a salary, i.e. have started: '2026-11' once the late-October salary is in.
  function salaryMonths(rows, raw) {
    const s = settings(raw);
    return [...new Set(rows.filter(t => isSalary(t, s)).map(t => next(t.d.slice(0, 7))))].sort();
  }
  // Start date of every budget month from before `from` to after `upto`, oldest first.
  function starts(rows, s, from, upto) {
    const first = {};
    rows.forEach(t => {
      if (!isSalary(t, s)) return;
      const m = next(t.d.slice(0, 7));
      if (!first[m] || t.d < first[m]) first[m] = t.d;
    });
    const out = [];
    for (let m = prevM(from); m <= next(upto); m = next(m)) {
      let d = first[m] || m + '-01';
      if (out.length && d <= out[out.length - 1][0]) d = m + '-01';
      out.push([d, m, d === first[m]]);   // third: started by a salary we can see
    }
    return out;
  }
  const dayBefore = d => { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() - 1); return x.toISOString().slice(0, 10); };
  // From and to of one budget month. `open`: the next salary is not in yet, so it runs on.
  function period(s, m) {
    const st = s._starts || [], i = st.findIndex(e => e[1] === m);
    if (i < 0) return { from: m + '-01', to: null, open: true };
    const nx = st[i + 1];
    return { from: st[i][0], to: nx && nx[2] ? dayBefore(nx[0]) : null, open: !(nx && nx[2]), salary: st[i][2] };
  }
  // The budget month a row belongs to.
  function bmonth(t, s) {
    const st = s._starts;
    if (!st) return t.d.slice(0, 7);
    let m = null;
    for (const [d, mm] of st) { if (t.d >= d) m = mm; else break; }
    return m || t.d.slice(0, 7);
  }
  // Which budget a spending category comes out of.
  function budgetOf(s, cat) {
    if (cat === 'Needs' || s.needsCats.includes(cat)) return 'Needs';
    const f = s.funds.find(x => (x.cats || []).includes(cat) || x.name === cat);
    return f ? f.name : s.catchAll;
  }
  // Does this row count for the budgets at all?
  function counts(t, s) {
    if (t.c !== 'EUR' || t.own === 'Business' || t._k === 'move') return false;
    if (t.own === 'Joint' && s.jointManualOnly && !t.mine) return false;
    return true;
  }
  /* One month: income, money moved to the savings account, and spending per budget.
     `extra` are payments the bank has not booked yet: ones added by hand carry a
     category (`_cat`) and come out of its budget; the rest come out of Fun. */
  function sums(rows, s, m, extra) {
    if (!s._starts) s = Object.assign({}, s, { _starts: starts(rows, s, m, m) });
    const o = { income: 0, saved: 0, spend: {}, pending: 0 };
    const add = (b, v) => { o.spend[b] = r2((o.spend[b] || 0) + v); };
    rows.forEach(t => {
      if (!counts(t, s) || bmonth(t, s) !== m) return;
      if (t._k === 'save') { o.saved -= t.a; return; }
      if (t._k === 'inc' && s.incomeCats.includes(t._cat)) { o.income += t.a; return; }
      // An expense, or a refund of one (money in under a spending category).
      if (s.saveCats.includes(t._cat)) { o.saved -= t.a; return; }
      add(budgetOf(s, t._cat), -t.a);
    });
    (extra || []).forEach(t => { if (t.a < 0) { add(t._cat ? budgetOf(s, t._cat) : s.catchAll, -t.a); o.pending -= t.a; } });
    o.income = r2(o.income); o.saved = r2(o.saved); o.pending = r2(o.pending);
    return o;
  }

  /* Run the budgets from the start month up to and including `upto`.
     `pending`: unbooked card payments, counted in `upto` only.
     Returns one entry per month; `cur` is the month asked for. Each entry has
     `list`: one line per budget { name, kind, goal, added, spent, moved, available,
     saved, target } where `moved` is money taken in (+) or given (−) to cover
     overspending, and `total` = all budgets together = the money he holds. */
  function run(rows, raw, upto, pending) {
    const s = settings(raw);
    const from = upto < s.start ? upto : s.start;
    s._starts = starts(rows, s, from, upto);
    const names = ['Needs', 'Savings'].concat(s.funds.map(f => f.name), ['Unassigned']);
    const bal = {}; names.forEach(n => { bal[n] = 0; });
    const piled = {}; s.funds.forEach(f => { piled[f.name] = 0; });
    let owed = 0;               // what overspending borrowed from Savings
    const out = [];
    for (let m = from; m <= upto; m = next(m)) {
      const x = sums(rows, s, m, m === upto ? pending : null);
      const added = {}, goal = {}, moved = {};
      names.forEach(n => { added[n] = 0; moved[n] = 0; });
      let pool = r2(x.income + (m === from ? (+s.opening || 0) : 0) + bal.Unassigned);
      const startPool = pool;
      bal.Unassigned = 0;
      const put = (n, want) => {
        const a = r2(Math.max(0, Math.min(want, pool)));
        bal[n] = r2(bal[n] + a); added[n] = r2(added[n] + a); pool = r2(pool - a);
        return a;
      };
      // 1. Needs: topped up to the fixed amount.
      goal.Needs = s.needsFixed;
      put('Needs', s.needsFixed - bal.Needs);
      // 2. Savings: pay back what was borrowed, then the share of this month's income.
      const share = r2(x.income * s.savePct / 100);
      goal.Savings = r2(share + owed);
      owed = r2(owed - put('Savings', owed));
      put('Savings', share);
      // 3. Wants, in order.
      s.funds.forEach(f => {
        goal[f.name] = f.per;
        if (f.mode === 'top') { put(f.name, f.per - bal[f.name]); return; }
        const left = f.target ? Math.max(0, f.target - piled[f.name]) : Infinity;
        piled[f.name] = r2(piled[f.name] + put(f.name, Math.min(f.per, left)));
      });
      // 4. The rest waits.
      added.Unassigned = pool; bal.Unassigned = pool; goal.Unassigned = 0;
      // Spending, and money moved to the savings account.
      const spent = {};
      names.forEach(n => { spent[n] = x.spend[n] || 0; bal[n] = r2(bal[n] - spent[n]); });
      spent.Savings = x.saved; bal.Savings = r2(bal.Savings - x.saved);
      // Cover every budget below zero, in the agreed order.
      const order = s.cover.filter(n => names.includes(n));
      const neg = names.filter(n => n !== 'Unassigned').sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
      neg.forEach(n => {
        for (const src of order) {
          if (bal[n] >= 0) break;
          if (src === n || bal[src] <= 0) continue;
          const take = r2(Math.min(bal[src], -bal[n]));
          bal[src] = r2(bal[src] - take); bal[n] = r2(bal[n] + take);
          moved[src] = r2(moved[src] - take); moved[n] = r2(moved[n] + take);
          if (src === 'Savings') owed = r2(owed + take);
        }
      });
      const list = names.map(n => {
        const f = s.funds.find(y => y.name === n);
        return { name: n, kind: n === 'Needs' ? 'needs' : n === 'Savings' ? 'savings' : n === 'Unassigned' ? 'unassigned' : 'want',
          mode: f ? f.mode : n === 'Needs' ? 'top' : 'pile', goal: goal[n] || 0, added: added[n], spent: spent[n], moved: moved[n],
          available: bal[n], target: f ? f.target : 0, saved: f ? piled[n] : 0 };
      });
      const sum = k => r2(list.reduce((a, l) => a + l[k], 0));
      out.push({ m, period: period(s, m), income: x.income, moneyIn: startPool, pending: x.pending, owed, list,
        goal: sum('goal'), added: sum('added'), spent: r2(sum('spent')), total: sum('available') });
    }
    return { s, months: out, cur: out[out.length - 1] };
  }

  /* The company, one month, on cash. "Taxes" in the bank data holds VAT payments
     and the owner's social and health payments, so the only safe count is what
     actually went out. Over a few months that is the real free money.
     `vat` is the share of this month's money that is VAT: it stays in the account
     until it is paid. `tax` is the corporate tax to keep back from a good month. */
  function business(rows, raw, m) {
    const s = settings(raw);
    let received = 0, costs = 0, taxes = 0;
    rows.forEach(t => {
      if (t.c !== 'EUR' || t.own !== 'Business' || !t.d.startsWith(m) || t._k === 'move' || t._k === 'save') return;
      if (t.a > 0) received += t.a;
      else if (t._cat === 'Taxes') taxes -= t.a;
      else costs -= t.a;
    });
    const cash = received - costs - taxes;
    const tax = Math.max(0, cash) * s.business.taxPct / 100;
    return { m, received: r2(received), vat: r2(received * s.business.vatShare), costs: r2(costs), taxes: r2(taxes),
      cash: r2(cash), tax: r2(tax), free: r2(cash - tax) };
  }
  // What the company has freed up from `from` to `upto`. A bad month counts too.
  function businessSince(rows, raw, from, upto) {
    let free = 0;
    for (let m = from; m <= upto; m = next(m)) free += business(rows, raw, m).free;
    return r2(free);
  }

  /* Emergency fund: `months` of Needs plus `extra` (the house payment, until it
     is one of the Needs categories). `have` is the balance of the listed accounts. */
  function emergency(raw, accounts, monthlySave) {
    const s = settings(raw);
    const target = r2(s.emergency.months * (s.needsFixed + (+s.emergency.extra || 0)));
    const have = r2((accounts || []).filter(a => s.emergency.accounts.includes(a.account) && a.currency === 'EUR')
      .reduce((n, a) => n + (a.amount || 0), 0));
    const gap = Math.max(0, target - have);
    return { target, have, gap: r2(gap), months: monthlySave > 0 ? Math.ceil(gap / monthlySave) : null };
  }

  /* Settings saved by an older version are brought up to date: the default funds
     in the default order (his own amounts kept for funds he already had, his own
     extra funds last), each with its mode. Returns true if anything changed. */
  function migrate(s) {
    if (!s || (s.v || 1) >= DEF.v) return false;
    const mine = s.funds || [];
    s.funds = DEF.funds.map(d => {
      const f = mine.find(x => x.name === d.name);
      return f ? Object.assign({}, d, { per: f.per, target: f.target }) : JSON.parse(JSON.stringify(d));
    }).concat(mine.filter(f => !DEF.funds.some(d => d.name === f.name)).map(f => Object.assign({ mode: 'pile' }, f)));
    if (s.payday == null) s.payday = DEF.payday;
    s.v = DEF.v;
    return true;
  }

  const api = { DEF, settings, bmonth, sums, run, business, businessSince, emergency, next, prev: prevM, salaryMonths, migrate, budgetOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Budget = api;
})(typeof window !== 'undefined' ? window : this);
