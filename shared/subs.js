(function (root) {
/* Subscriptions and other recurring charges (8 Nov 2026, Georgi: "subs data could be useful").
   Anything categorised Subscriptions, plus any merchant that charged a similar amount (within 25% of its
   usual) in 3 or more of the last 6 months and not more than about once a month, outside everyday
   categories. Per merchant: what it costs a month and a year, the last charge, and a flag when the price
   went up or it has stopped (nothing for 45 days). Pure: Subs.find(rows, today).
   Rows from the Money page carry _k/_cat (its classify()); raw API rows (Shika) fall back to cat and sign. */
const SUB_SKIP = /^(groceries|fuel|eating out|transfer|savings|cash|people|shopping|transport|income|paid back|photography|gifts|car)$/i;
// A bill paid through the bank names the bank as payee, with "1.<utility> <customer no>, Комунално плащане" in the
// description: then the real payee is the start of the description.
const subName = t => { const w = String(t.who || ''); if (w && !/булбанк|unicredit|revolut|\bbank\b|банк/i.test(w)) return w.split(',')[0].trim();
  return String(t.desc || w).split(',')[0].replace(/^\s*\d+\.\s*/, '').replace(/\s+\d{4,}.*$/, '').trim() || w; };
const subKey = t => subName(t).toLowerCase().replace(/[0-9*#.,:;/\\_·-]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 2).join(' ');
function subsFind(rows, today) {
  const t0 = new Date(today), from = new Date(t0); from.setMonth(from.getMonth() - 6);
  const f = from.toISOString().slice(0, 10), by = {};
  rows.filter(t => t.c === 'EUR' && t.a < 0 && (t._k ? t._k === 'exp' : !/^(transfer|savings)$/i.test(t.cat || '')) && t.d >= f).forEach(t => {
    const k = subKey(t); if (!k) return; (by[k] = by[k] || []).push(t); });
  const med = v => { const s = v.slice().sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const out = [];
  Object.entries(by).forEach(([k, ts]) => {
    const cat = ts[ts.length - 1]._cat || ts[ts.length - 1].cat || '', sub = /^subscriptions?$/i.test(cat);
    const amts = ts.map(t => -t.a), m = med(amts), months = new Set(ts.map(t => t.d.slice(0, 7))).size;
    const steady = amts.filter(a => Math.abs(a - m) <= m * 0.25).length >= amts.length * 0.75;
    if (!sub && (SUB_SKIP.test(cat) || months < 3 || ts.length / months > 1.5 || !steady || m < 1)) return;
    const d = ts.map(t => t.d).sort(), last = d[d.length - 1];
    const lastAmt = -ts.find(t => t.d === last).a, before = amts.slice(0, -1);
    const perMonth = m * Math.min(ts.length, months * 1.5) / Math.max(months, 1);
    out.push({ name: subName(ts[ts.length - 1]) || k, cat, perMonth, perYear: perMonth * 12, last, lastAmt, months,
      // Utility bills move with the season, so a higher one is not a price rise.
      up: !/^utilities$/i.test(cat) && before.length >= 2 && lastAmt > med(before) * 1.05 ? med(before) : null,
      stopped: (t0 - new Date(last + 'T12:00')) / 864e5 > 45 });
  });
  return out.sort((a, b) => (a.stopped - b.stopped) || b.perMonth - a.perMonth);
}
root.Subs = { find: subsFind, name: subName, key: subKey };
})(typeof window !== 'undefined' ? window : globalThis);
