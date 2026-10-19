/* Business page: GL Studio 99 EOOD.

   Two sources of truth, shown side by side and never added together:
   - MONEY: the company's bank rows, which the Money sheet holds with owner
     Business. What was actually earned and spent.
   - INVOICES: the Biz_Invoices tab, filled from the InvoicePro PDFs. What was
     billed, to whom, for what.

   An invoice counts as paid when a credit on the company account matches it to
   the cent within 60 days. That is reported, never written back. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-biz-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => '€' + Math.abs(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = n => '€' + Math.round(Math.abs(Number(n) || 0)).toLocaleString('en-GB');
const dshort = d => d ? new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
let data = null, tab = 'overview', filter = 'open';

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

function prep(j) {
  j.invoices = (j.invoices || []).map(i => Object.assign({}, i, { amount_eur: Number(i.amount_eur) || 0 }));
  // Money in that is not a client paying: the myPOS sweep is the same payment
  // arriving a second time, and art.134 is Georgi's own money. Either could sit
  // on an invoice's amount by chance and report it paid.
  j.credits = (j.tx || []).filter(t => t.a > 0 && t.c === 'EUR' &&
    !/^(transfer|gl studio)$/i.test(String(t.cat || '')));
  matchPayments(j.invoices, j.credits);
  j.unbilled = j.credits.filter(c => c._left > 0.015);
  return j;
}

async function load() {
  const url = apiUrl(), tok = token();
  if (!url) { show('setup'); $('#setupMsg').textContent = 'Set up the Apps Script URL on the Training page first.'; return; }
  if (!tok) { show('setup'); return; }
  try { const c = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (c) { data = prep(c); render(); } } catch (e) {}
  $('#status').textContent = 'Loading…';
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=money&biz=go&mt=' + encodeURIComponent(tok));
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'unknown error');
    try { localStorage.setItem(CKEY, JSON.stringify(j)); } catch (e) {}
    data = prep(j);
    $('#status').textContent = 'Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    render();
  } catch (e) {
    $('#status').textContent = data ? 'Offline: showing saved data' : 'Could not load: ' + e.message;
  }
}
function show(id) { $('#setup').classList.toggle('hidden', id !== 'setup'); $('#main').classList.toggle('hidden', id !== 'main'); }

const money = () => {
  const tx = (data.tx || []).filter(t => t.c === 'EUR');
  const inn = tx.filter(t => t.a > 0).reduce((a, t) => a + t.a, 0);
  const out = tx.filter(t => t.a < 0).reduce((a, t) => a - t.a, 0);
  return { inn, out, net: inn - out };
};

function render() {
  show('main');
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  const m = money();
  $('#sum').innerHTML =
    `<div><span>Into the bank</span><b class="inc">${fmt(m.inn)}</b></div>` +
    `<div><span>Out of the bank</span><b class="exp">${fmt(m.out)}</b></div>` +
    `<div><span>Left</span><b>${fmt(m.net)}</b></div>`;
  if (tab === 'invoices') renderInvoices();
  else if (tab === 'clients') renderClients();
  else if (tab === 'spend') renderSpend();
  else renderOverview();
}

function byYear() {
  const y = {};
  (data.tx || []).filter(t => t.c === 'EUR').forEach(t => {
    const k = t.d.slice(0, 4);
    (y[k] = y[k] || { inn: 0, out: 0, billed: 0 });
    if (t.a > 0) y[k].inn += t.a; else y[k].out += -t.a;
  });
  data.invoices.forEach(i => {
    const k = (i.issued || '').slice(0, 4); if (!k) return;
    (y[k] = y[k] || { inn: 0, out: 0, billed: 0 }).billed += i.amount_eur;
  });
  return y;
}

function renderOverview() {
  const y = byYear();
  const open = data.invoices.filter(i => !i._paid);
  $('#view').innerHTML = `
    <div class="card">
      ${Object.keys(y).sort().reverse().map(k => `<div class="arow"><b>${k}</b>` +
        `<span>in ${fmt0(y[k].inn)} · out ${fmt0(y[k].out)} · billed ${fmt0(y[k].billed)}</span></div>`).join('')}
      <div class="note2"><b>In and out are the bank: what the company actually earned and spent.</b>
        Billed is what the invoices say. The two are never added together, and they do not have to agree:
        an invoice can be billed in one year and paid in the next.</div>
    </div>
    <div class="card">
      <div class="arow tot"><b>Invoices</b><b>${data.invoices.length}</b></div>
      <div class="arow"><span>Matched to a payment in the bank</span><b class="inc">${data.invoices.length - open.length}</b></div>
      <div class="arow"><span>Not matched</span><b>${open.length}</b></div>
      <div class="note2">Not matched is not the same as unpaid: cash, a payment bundled with others, or an
        amount that differs by a cent all land here. Check them rather than chase them.</div>
    </div>`;
}

function invRow(i) {
  const tag = i._paid
    ? `<span class="tag found">paid ${dshort(i._paid.row.d)}${i._parts.length > 1 ? ', ' + i._parts.length + ' parts' : ''}</span>`
    : i._part
      ? `<span class="tag owed">part paid, ${fmt(i._short)} short</span>`
      : `<span class="tag owed">no payment matched</span>`;
  return `<div class="inv">
    <b>${esc(i.client)}</b><span class="amt">${fmt(i.amount_eur)}</span>
    <span class="svc">№ ${esc(i.no)} · ${dshort(i.issued)}${i.items ? ' · ' + esc(String(i.items).slice(0, 40)) : ''}</span>
    <span class="st">${tag}</span></div>`;
}

const chips = (sets, names) => `<div class="chips">${Object.keys(sets).map(k =>
  `<button data-act="filter" data-f="${k}" aria-pressed="${filter === k}">${names[k]} ${sets[k].length}</button>`).join('')}</div>`;

function renderInvoices() {
  const sets = {
    open: data.invoices.filter(i => !i._paid),
    paid: data.invoices.filter(i => i._paid),
    all: data.invoices,
    unbilled: data.unbilled || []
  };
  const names = { open: 'Not matched', paid: 'Paid', all: 'All', unbilled: 'To invoice' };
  if (filter === 'unbilled') {
    const u = sets.unbilled.slice().sort((a, b) => (a.d < b.d ? 1 : -1));
    $('#view').innerHTML = chips(sets, names) + (u.length
      ? `<div class="card">${u.map(c => `<div class="inv">
          <b>${esc(c.who || c.desc.split(' · ')[0] || 'Payment')}</b><span class="amt">${fmt(c._left)}</span>
          <span class="svc">${dshort(c.d)} · ${esc(String(c.desc).slice(0, 50))}</span></div>`).join('')}
         <div class="note2">Money into the company that no invoice claims.</div></div>`
      : '<div class="empty">Every payment is on an invoice.</div>');
    return;
  }
  const rows = (sets[filter] || []).slice().sort((a, b) => (a.issued < b.issued ? 1 : -1));
  $('#view').innerHTML = chips(sets, names) +
    (rows.length ? `<div class="card">${rows.map(invRow).join('')}</div>` : '<div class="empty">Nothing here.</div>');
}

function renderClients() {
  const by = {};
  data.invoices.forEach(i => {
    const k = i.client || '—';
    (by[k] = by[k] || { n: 0, sum: 0, open: 0, last: '' });
    by[k].n++; by[k].sum += i.amount_eur;
    if (!i._paid) by[k].open += i.amount_eur;
    if (i.issued > by[k].last) by[k].last = i.issued;
  });
  $('#view').innerHTML = `<div class="card">${Object.entries(by).sort((a, b) => b[1].sum - a[1].sum)
    .map(([name, v]) => `<div class="inv"><b>${esc(name)}</b><span class="amt">${fmt(v.sum)}</span>
      <span class="svc">${v.n} invoice${v.n > 1 ? 's' : ''} · last ${dshort(v.last)}</span>
      ${v.open > 0.01 ? `<span class="st"><span class="tag owed">${fmt(v.open)} unmatched</span></span>` : ''}</div>`).join('')}</div>`;
}

function renderSpend() {
  // Transfers are not spending: the sweep from myPOS and the money moved to
  // cover a card are the same euro twice.
  const rows = (data.tx || []).filter(t => t.a < 0 && !/^transfer$/i.test(String(t.cat || '')));
  const by = {};
  rows.forEach(t => { by[t.cat || 'Uncategorised'] = (by[t.cat || 'Uncategorised'] || 0) + -t.a; });
  $('#view').innerHTML = `<div class="card">` +
    Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      `<div class="arow"><span>${esc(k)}</span><b>${fmt(v)}</b></div>`).join('') +
    `<div class="note2">${rows.length} rows from the company's bank account.</div></div>`;
}

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; render();
});
$('#view').addEventListener('click', e => {
  const b = e.target.closest('[data-act="filter"]'); if (!b) return; filter = b.dataset.f; render();
});
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = ''; load();
});
load();
})();
