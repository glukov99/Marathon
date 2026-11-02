/* Budget: Georgi's 50/30/20 envelopes over the Money data. Pure maths, no DOM,
   so money/budget-check.js can run it in Node.

   The envelopes are not real accounts. A budget month runs from payday to payday:
   1. November starts the day the salary lands at the end of October (the first
      `salaryCat` payment of at least `salaryMin` on or after day `payday`), and
      ends the day before the next one. Everything in between, money in and money
      out, belongs to November. A month with no salary found runs from the 1st.
   2. Savings get `savePct` of that income.
   3. Needs are a fixed amount. What was not spent last month stays in Needs, so
      the envelope is only topped up to the fixed amount.
   4. Everything left is Wants: the funds first (gifts, Giulietta, Leica), in
      order, then Fun. Fun and the funds carry over month to month.
   Spending goes to an envelope by category. Refunds (money in with a spending
   category) reduce that category. Moves between own accounts never count. */
(function (root) {
  const DEF = {
    v: 2,
    start: '2026-11',
    payday: 25,
    salaryCat: 'Income',
    salaryMin: 800,
    savePct: 20,
    needsFixed: 900,
    incomeCats: ['Income', 'Photography', 'Salary', 'Interest'],
    needsCats: ['Groceries', 'Utilities', 'Phone & internet', 'Fuel', 'Car', 'Childcare', 'Health', 'Insurance',
      'Home', 'Taxes', 'Fees', 'Transport', 'Mortgage', 'Rent', 'Pets', 'Education'],
    saveCats: ['Investments'],
    funds: [
      { name: 'Gifts', per: 50, target: 0, cats: ['Gifts', 'Gift'] },
      { name: 'Eating out', per: 150, target: 0, cats: ['Eating out'] },
      { name: 'Entertainment', per: 70, target: 0, cats: ['Entertainment'] },
      { name: 'Clothes', per: 80, target: 0, cats: ['Clothes', 'Shopping'] },
      { name: 'Travel', per: 100, target: 0, cats: ['Travel'] },
      { name: 'Giulietta', per: 300, target: 600, cats: ['Giulietta'] },
      { name: 'Leica', per: 250, target: 2000, cats: ['Leica'] }
    ],
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
  // What one month holds: income for the budget, saved, and spent per envelope.
  function sums(rows, s, m) {
    if (!s._starts) s = Object.assign({}, s, { _starts: starts(rows, s, m, m) });
    const o = { income: 0, saved: 0, needs: 0, wants: 0, funds: {} };
    s.funds.forEach(f => { o.funds[f.name] = 0; });
    const fundOf = c => s.funds.find(f => (f.cats || []).includes(c));
    rows.forEach(t => {
      if (t.c !== 'EUR' || t.own === 'Business' || bmonth(t, s) !== m) return;
      if (t._k === 'move') return;
      if (t._k === 'save') { o.saved -= t.a; return; }
      if (t._k === 'inc' && s.incomeCats.includes(t._cat)) { o.income += t.a; return; }
      // An expense, or a refund of one (money in under a spending category).
      const out = -t.a, c = t._cat;
      if (s.saveCats.includes(c)) { o.saved += out; return; }
      const f = fundOf(c);
      if (f) o.funds[f.name] += out;
      else if (s.needsCats.includes(c)) o.needs += out;
      else o.wants += out;
    });
    Object.keys(o).forEach(k => { if (typeof o[k] === 'number') o[k] = r2(o[k]); });
    Object.keys(o.funds).forEach(k => { o.funds[k] = r2(o.funds[k]); });
    return o;
  }

  // Run the envelopes from the start month up to and including `upto`.
  // Returns one entry per month; the last one is the month asked for.
  function run(rows, raw, upto) {
    const s = settings(raw);
    const from = upto < s.start ? upto : s.start;
    s._starts = starts(rows, s, from, upto);
    const out = [];
    let needsBal = 0, funBal = 0;
    const fb = {}; s.funds.forEach(f => { fb[f.name] = 0; });
    const fsaved = {}; s.funds.forEach(f => { fsaved[f.name] = 0; });
    for (let m = from; m <= upto; m = next(m)) {
      const x = sums(rows, s, m);
      const save = r2(x.income * s.savePct / 100);
      const room = Math.max(0, x.income - save);
      const carried = needsBal;
      const topUp = r2(Math.min(room, Math.max(0, s.needsFixed - needsBal)));
      needsBal = r2(needsBal + topUp - x.needs);
      let pool = r2(room - topUp);
      const wantsIn = pool;
      const funds = s.funds.map(f => {
        const left = f.target ? Math.max(0, f.target - fsaved[f.name]) : Infinity;
        const put = r2(Math.max(0, Math.min(f.per, pool, left)));
        pool = r2(pool - put);
        fsaved[f.name] = r2(fsaved[f.name] + put);
        fb[f.name] = r2(fb[f.name] + put - x.funds[f.name]);
        // had = what was in it this month (left from before + put in), spent, left
        return { name: f.name, put, had: r2(fb[f.name] + x.funds[f.name]), spent: x.funds[f.name], bal: fb[f.name],
          saved: fsaved[f.name], target: f.target };
      });
      const funCarried = funBal;
      funBal = r2(funBal + pool - x.wants);
      // One line per envelope, the way the page shows them.
      const env = [{ name: 'Needs', had: r2(carried + topUp), spent: x.needs, left: needsBal }]
        .concat(funds.map(f => ({ name: f.name, had: f.had, spent: f.spent, left: f.bal, fund: f })))
        .concat([{ name: 'Fun', had: r2(funCarried + pool), spent: x.wants, left: funBal }]);
      const tot = k => r2(env.reduce((n, e) => n + e[k], 0));
      out.push({ m, period: period(s, m), income: x.income, save, saved: x.saved, carried, topUp, needsSpent: x.needs, needsBal,
        wantsIn, funds, funIn: pool, funCarried, funSpent: x.wants, funBal,
        env, had: tot('had'), spent: tot('spent'), left: tot('left') });
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

  /* Settings saved before a version gain the new default funds, in the default
     order; funds he already has keep his values, his own extra funds go last. */
  function migrate(s) {
    if (!s || (s.v || 1) >= DEF.v) return false;
    const mine = s.funds || [];
    s.funds = DEF.funds.map(d => mine.find(f => f.name === d.name) || JSON.parse(JSON.stringify(d)))
      .concat(mine.filter(f => !DEF.funds.some(d => d.name === f.name)));
    if (s.payday == null) s.payday = DEF.payday;
    s.v = DEF.v;
    return true;
  }

  const api = { DEF, settings, bmonth, sums, run, business, businessSince, emergency, next, prev: prevM, salaryMonths, migrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Budget = api;
})(typeof window !== 'undefined' ? window : this);
