/* Which invoices have been paid, shared by the Business page and the home page.

   It lives here so the two cannot give different answers to "what is still
   owed", which is the one figure on this site that would send Georgi chasing a
   client who has already paid.

     Invoices.reconcile(invoices, tx) -> { live, credits, unbilled }
   `live` are the invoices that still count, each carrying _paid, _part, _short
   and _parts. Nothing is written back anywhere.
*/
(function (root) {
/* Matching invoices to money.

   The bank descriptions name the invoice: "ф-ра: 0000000045", sometimes two of
   them at once. That beats guessing from the amount, and it is the only way to
   see the three things that really happen here: one invoice paid in two
   instalments, one payment covering several invoices, and part payments.

   So: numbers first, amounts second. Each credit can only be spent once.
   Everything is reported, nothing is written back. */
function invoiceNumbers(text) {
  const out = [];
  const m = String(text || '').match(/\d{5,}/g) || [];
  m.forEach(x => { const n = x.replace(/^0+/, ''); if (n && +n < 100000) out.push(n); });
  return out;
}

function matchPayments(inv, credits) {
  const left = credits.map((c, i) => ({ i, c, rest: c.a }));
  // A number can belong to more than one invoice: two here are both "1", from
  // different series. So a number holds a list, and the credit goes to the one
  // issued nearest to it, which told the two apart by five months.
  const byNo = {};
  inv.forEach(i => {
    i._paid = null; i._got = 0; i._parts = [];
    (byNo[String(i.no)] = byNo[String(i.no)] || []).push(i);
  });
  const nearest = (n, d) => byNo[n].slice().sort((a, b) =>
    Math.abs(new Date(a.issued) - new Date(d)) - Math.abs(new Date(b.issued) - new Date(d)))[0];

  // 1. The credit says which invoice it is for.
  left.forEach(x => {
    const nos = invoiceNumbers((x.c.who || '') + ' ' + (x.c.desc || '')).filter(n => byNo[n]);
    if (!nos.length) return;
    const share = x.rest / nos.length;        // one payment, several invoices
    nos.forEach(n => {
      const i = nearest(n, x.c.d);
      i._got += share;
      i._parts.push({ row: x.c, amount: share, by: 'number' });
    });
    x.rest = 0;
  });

  // 2. Otherwise the amount, to the cent, within sixty days either way. It
  // looks back as far as it looks forward because the money often comes first:
  // a card payment on myPOS lands on the day of the shoot, and Zonia pays for a
  // month of hours before the invoice for it is written.
  inv.slice().sort((a, b) => (a.issued < b.issued ? -1 : 1)).forEach(i => {
    const want = (Number(i.amount_eur) || 0) - i._got;
    if (!(want > 0.015) || !i.issued) return;
    const t0 = new Date(i.issued + 'T12:00').getTime();
    let best = null;
    left.forEach(x => {
      if (x.rest <= 0.015 || Math.abs(x.rest - want) > 0.015) return;
      const days = Math.round((new Date(x.c.d + 'T12:00').getTime() - t0) / 864e5);
      if (days < -60 || days > 60) return;
      if (!best || Math.abs(days) < Math.abs(best.days)) best = { x, days };
    });
    if (best) {
      i._got += best.x.rest;
      i._parts.push({ row: best.x.c, amount: best.x.rest, by: 'amount' });
      best.x.rest = 0;
    }
  });

  // Money in that no invoice claimed. Georgi reads this as "still to issue".
  left.forEach(x => { x.c._left = Math.round(x.rest * 100) / 100; });

  inv.forEach(i => {
    const want = Number(i.amount_eur) || 0;
    i._got = Math.round(i._got * 100) / 100;
    i._short = Math.round((want - i._got) * 100) / 100;
    i._paid = i._parts.length && i._short <= 0.015 ? i._parts[i._parts.length - 1] : null;
    i._part = !i._paid && i._parts.length ? i._parts[0] : null;
  });
}

const cancelled = i => /^cancel/i.test(String(i.status || ''));

/* Money in that is not a client paying: the myPOS sweep is the same payment
   arriving a second time, and art.134 is Georgi's own money. Either could sit
   on an invoice's amount by chance and report it paid. */
function clientCredits(tx) {
  return (tx || []).filter(t => t.a > 0 && t.c === 'EUR' &&
    !/^(transfer|gl studio)$/i.test(String(t.cat || '')));
}

/* The whole job in one call. Invoices come back with the money attached. */
function reconcile(invoices, tx) {
  const inv = (invoices || []).map(i => Object.assign({}, i,
    { no: String(i.no), amount_eur: Number(i.amount_eur) || 0 }));
  // A cancelled invoice was never money: it is not billed and nothing is owed
  // on it. It stays in the list, marked, so the number is not simply missing.
  const live = inv.filter(i => !cancelled(i));
  const credits = clientCredits(tx);
  matchPayments(live, credits);
  return { invoices: inv, live: live, credits: credits,
    unbilled: credits.filter(c => c._left > 0.015) };
}

  root.Invoices = { reconcile, matchPayments, invoiceNumbers, cancelled, clientCredits };
})(typeof window !== 'undefined' ? window : globalThis);
