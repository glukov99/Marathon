/* Business page: GL Studio 99 EOOD.
   Money is personal finance. This page is the company: what was invoiced, what
   came in, and what is still owed. Two sources, neither of them copied here:
   the client sheet Georgi keeps in Sheets, and the company's bank rows, which
   the Money sheet already holds with owner Business.

   Everything is counted from the invoice rows ("Плащания"). The client tab
   ("Информация") is not read: Georgi does not trust it below row 69. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-biz-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => '€' + Math.abs(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dshort = d => d ? new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
let data = null, tab = 'overview', filter = 'owed';

// Invoiced through another company: his own note says these are detail lines,
// not turnover of his own, so they never count as invoiced or owed.
const isDetail = i => /ФЕШЪН ЛАБ/i.test(i.status || '');
const owed = i => !isDetail(i) && Math.round(((i.invoiced || 0) - (i.received || 0)) * 100) / 100;

/* The point of the page: his sheet says "payment not found", and the bank rows
   can answer it. An invoice counts as found when a credit on the company's
   account matches the amount to the cent, within 60 days either way. Nothing is
   written back: this only reports what the bank shows. */
function match(inv, credits) {
  const want = owed(inv);
  if (!(want > 0) || !inv.date) return null;
  const t0 = new Date(inv.date + 'T12:00').getTime();
  let best = null;
  credits.forEach(c => {
    if (Math.abs(c.a - want) > 0.015) return;
    const days = Math.round((new Date(c.d + 'T12:00').getTime() - t0) / 864e5);
    if (Math.abs(days) > 60) return;
    if (!best || Math.abs(days) < Math.abs(best.days)) best = { row: c, days: days };
  });
  return best;
}

function prep(j) {
  j.credits = (j.tx || []).filter(t => t.a > 0 && t.c === 'EUR');
  j.invoices.forEach(i => { i._owed = owed(i); i._hit = i._owed > 0 ? match(i, j.credits) : null; });
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

function totals() {
  const live = data.invoices.filter(i => !isDetail(i));
  const invoiced = live.reduce((a, i) => a + (i.invoiced || 0), 0);
  const received = live.reduce((a, i) => a + (i.received || 0), 0);
  return { invoiced, received, toCollect: Math.round((invoiced - received) * 100) / 100, live };
}

function render() {
  show('main');
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  const t = totals();
  // Not "to collect": the sheet's paid/unpaid marks are a working note, not a
  // ledger. Georgi, 19 Oct 2026: in reality only about EUR 1,000 from Zarena is
  // outstanding. So the page reports what it can actually stand behind: what the
  // company's bank account received.
  const fromBank = (data.tx || []).filter(x => x.a > 0 && x.c === 'EUR')
    .reduce((a, x) => a + x.a, 0);
  $('#sum').innerHTML =
    `<div><span>Invoiced (sheet)</span><b>${fmt(t.invoiced)}</b></div>` +
    `<div><span>Into the bank</span><b class="inc">${fmt(fromBank)}</b></div>` +
    `<div><span>Unmatched</span><b>${fmt(t.live.filter(i => i._owed > 0 && !i._hit).reduce((a, i) => a + i._owed, 0))}</b></div>`;
  if (tab === 'invoices') renderInvoices();
  else if (tab === 'clients') renderClients();
  else if (tab === 'spend') renderSpend();
  else renderOverview();
}

function renderOverview() {
  const t = totals();
  const open = t.live.filter(i => i._owed > 0);
  const found = open.filter(i => i._hit);
  const byYear = {};
  t.live.forEach(i => {
    const y = (i.date || '').slice(0, 4) || '—';
    (byYear[y] = byYear[y] || { inv: 0, rec: 0 });
    byYear[y].inv += i.invoiced || 0; byYear[y].rec += i.received || 0;
  });
  const spend = (data.tx || []).filter(x => x.a < 0 && x.c === 'EUR');
  const spendYear = {};
  spend.forEach(x => { const y = x.d.slice(0, 4); spendYear[y] = (spendYear[y] || 0) + -x.a; });
  $('#view').innerHTML = `
    <div class="card">
      <div class="arow tot"><b>Open invoices</b><b>${open.length}</b></div>
      <div class="arow"><span>Still owed</span><b class="exp">${fmt(open.reduce((a, i) => a + i._owed, 0))}</b></div>
      ${found.length ? `<div class="arow"><span>Of those, a matching payment is in the bank</span><b class="inc">${found.length}</b></div>` : ''}
      <div class="note2"><b>Read this before trusting the figures.</b> The invoice rows come from the
        "Отчет клиенти" sheet, which is a working note, not a ledger: its paid and unpaid marks are
        unreliable, and Georgi says only about €1,000 from Zarena is really outstanding. What this page
        can stand behind is the bank: a credit matching an invoice to the cent within 60 days. Nothing is
        ever written back to the sheet.</div>
    </div>
    <div class="card">
      ${Object.keys(byYear).sort().reverse().map(y => `<div class="arow"><span>${y}</span>` +
        `<span>invoiced ${fmt(byYear[y].inv)} · received ${fmt(byYear[y].rec)}` +
        (spendYear[y] ? ` · spent ${fmt(spendYear[y])}` : '') + `</span></div>`).join('')}
      <div class="note2">Spending is the company's bank account, which the Money page already holds.</div>
    </div>`;
}

function invRow(i) {
  const tag = i._owed > 0
    ? (i._hit ? `<span class="tag found">paid ${dshort(i._hit.row.d)}, not in your sheet</span>`
              : `<span class="tag owed">owed ${fmt(i._owed)}</span>`)
    : `<span class="tag paid">paid</span>`;
  return `<div class="inv">
    <b>${esc(i.client)}</b><span class="amt">${fmt(i.invoiced)}</span>
    <span class="svc">${esc(i.service)}${i.no ? ' · № ' + esc(i.no) : ''} · ${dshort(i.date)}</span>
    <span class="st">${tag}</span></div>`;
}

function renderInvoices() {
  const t = totals();
  const sets = {
    owed: t.live.filter(i => i._owed > 0 && !i._hit),
    found: t.live.filter(i => i._owed > 0 && i._hit),
    paid: t.live.filter(i => i._owed <= 0),
    detail: data.invoices.filter(isDetail)
  };
  const names = { owed: 'Still owed', found: 'Found in the bank', paid: 'Paid', detail: 'Through Fashion Lab' };
  const rows = sets[filter] || [];
  $('#view').innerHTML =
    `<div class="chips">${Object.keys(sets).map(k =>
      `<button data-act="filter" data-f="${k}" aria-pressed="${filter === k}">${names[k]} ${sets[k].length}</button>`).join('')}</div>` +
    (rows.length ? `<div class="card">${rows.sort((a, b) => (a.date < b.date ? 1 : -1)).map(invRow).join('')}</div>`
                 : '<div class="empty">Nothing here.</div>');
}

/* Built from the invoice rows, not from the client tab: Georgi does not trust
   that tab below row 69, and what is invoiced is the record that counts. */
function renderClients() {
  const by = {};
  totals().live.forEach(i => {
    const k = i.client || '—';
    (by[k] = by[k] || { n: 0, inv: 0, rec: 0, owed: 0, last: '', services: {} });
    by[k].n++; by[k].inv += i.invoiced || 0; by[k].rec += i.received || 0;
    if (i._owed > 0 && !i._hit) by[k].owed += i._owed;
    if (i.date > by[k].last) by[k].last = i.date;
    if (i.service) by[k].services[i.service] = (by[k].services[i.service] || 0) + 1;
  });
  const list = Object.entries(by).sort((a, b) => b[1].inv - a[1].inv);
  $('#view').innerHTML = `<div class="card">${list.map(([name, v]) => {
    const top = Object.entries(v.services).sort((a, b) => b[1] - a[1])[0];
    return `<div class="inv"><b>${esc(name)}</b><span class="amt">${fmt(v.inv)}</span>
      <span class="svc">${v.n} invoice${v.n > 1 ? 's' : ''}${top ? ' · ' + esc(top[0]) : ''} · last ${dshort(v.last)}</span>
      ${v.owed > 0.01 ? `<span class="st"><span class="tag owed">owes ${fmt(v.owed)}</span></span>` : ''}</div>`;
  }).join('')}</div>`;
}

function renderSpend() {
  const rows = (data.tx || []).filter(t => t.a < 0);
  const by = {};
  rows.forEach(t => { const k = (t.cat || 'Uncategorised'); by[k] = (by[k] || 0) + -t.a; });
  $('#view').innerHTML = `<div class="card">` +
    Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      `<div class="arow"><span>${esc(k)}</span><b>${fmt(v)}</b></div>`).join('') +
    `<div class="note2">${rows.length} rows from the company account, ${dshort((data.tx[data.tx.length - 1] || {}).d)} onwards.</div></div>`;
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
