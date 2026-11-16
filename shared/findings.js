/* Hub findings: what the Life Hub has noticed, in one shape, for Shika (16 Nov 2026, INTELLIGENCE.md phase A).
   Every rule is pure: (data, today) -> [{id, feature, title, why, ops, urgent}]. The same id means the same finding.
   `ops` is a dry/go action route when there is one, else null (a note). Shika runs these in Node on the Mac from the
   list in shared/rules.json; he decides when to say them. Needs: shared/shoots.js, invoices.js, subs.js.
   Check: node findings-check.js (made-up data). */
(function (root) {
  const DAY = 864e5, eur = n => '€' + Math.round(n);
  const ymd = d => new Date(d).toISOString().slice(0, 10);
  const dm = s => String(s).slice(8, 10) + '.' + String(s).slice(5, 7);
  const days = (a, b) => Math.floor((new Date(b) - new Date(String(a).slice(0, 10) + 'T12:00')) / DAY);

  /* A day at a shoot place with no booking (Business, Jobs tab). */
  function shoots(d, today) {
    if (!root.Shoots || !d.time || !d.biz) return [];
    return root.Shoots.unbooked(d.time, d.biz.bookings, today).map(s => ({
      id: s.id, feature: 'shoots', urgent: false, ops: null,
      title: `${s.place} on ${dm(s.date)} has no booking`,
      why: `You spent ${s.mins} min at ${s.place} on ${dm(s.date)}, and no booking is on that day. Add it on the Business page, Jobs tab, or say it was not a shoot.`
    }));
  }

  /* An invoice with no payment 14 days after it was issued (his payments come in a median of 1 day). */
  function unpaid(d, today) {
    if (!root.Invoices || !d.biz) return [];
    const r = root.Invoices.reconcile(d.biz.invoices, d.biz.tx);
    return r.live.filter(i => !i._paid && i.issued && days(i.issued, today) >= 14).map(i => {
      const short = i._part ? i._short : i.amount_eur, age = days(i.issued, today);
      return { id: 'unpaid:' + i.no + ':' + i.issued, feature: 'invoices', urgent: false, ops: null,
        title: `${i.client}: invoice ${Number(i.no)} ${i._part ? 'part paid' : 'not paid'}, ${age} days`,
        why: `Invoice ${Number(i.no)} of ${dm(i.issued)} for ${eur(i.amount_eur)}: ${eur(short)} not found in the company account after ${age} days. Your clients usually pay within a day.` };
    });
  }

  /* A regular charge that went up (Money, Stats tab). Personal and joint money only. */
  function subsUp(d, today) {
    if (!root.Subs || !d.money) return [];
    const rows = (d.money.tx || []).filter(t => t.own !== 'Business');
    return root.Subs.find(rows, today).filter(s => s.up && !s.stopped && days(s.last, today) <= 35).map(s => ({
      id: 'subs-up:' + root.Subs.key({ who: s.name }) + ':' + s.last, feature: 'subscriptions', urgent: false, ops: null,
      title: `${s.name} went up to €${s.lastAmt.toFixed(2)}`,
      why: `${s.name} charged €${s.lastAmt.toFixed(2)} on ${dm(s.last)}; it was usually €${s.up.toFixed(2)}. That is about ${eur((s.lastAmt - s.up) * 12)} a year more. Keep it, or cancel it?`
    }));
  }

  root.Findings = { shoots, unpaid, subsUp, ymd };
})(typeof window !== 'undefined' ? window : globalThis);
