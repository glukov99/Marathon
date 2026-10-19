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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dshort = d => d ? new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';
const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
let data = null, tab = 'overview', filter = 'open';
let bizYear = null, yearKind = 'exp', yearCat = null, yearCell = null;
let chartYear = 'all';

/* What a company row counts as. Transfers are the same euro moving (the myPOS
   sweep, money sent to cover a card), so they are shown but never counted. */
function classify(t) {
  const cat = String(t.cat || '').trim();
  if (/^transfer$/i.test(cat)) return { k: 'move', cat: 'Transfer' };
  if (t.a > 0) return { k: 'inc', cat: cat || 'Income' };
  return { k: 'exp', cat: cat || here(t) || 'Uncategorised' };
}

/* Two names that only mean something on this side of the money, so they are
   read here instead of in the shared rules. "Заплата · Вътрешнобанков превод"
   is worded identically when the company pays it and when Georgi receives it,
   so a shared rule would read his salary as a personal expense. */
const HERE = [[/заплата|аванс/i, 'Salary'], [/дивидент/i, 'Dividend']];
const here = t => (HERE.find(([re]) => re.test((t.who || '') + ' ' + (t.desc || ''))) || [])[1] || '';

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

function prep(j) {
  j.invoices = (j.invoices || []).map(i => Object.assign({}, i,
    { no: String(i.no), amount_eur: Number(i.amount_eur) || 0 }));
  // A cancelled invoice was never money: it is not billed and nothing is owed
  // on it. It stays in the list, marked, so the number is not simply missing.
  j.live = j.invoices.filter(i => !cancelled(i));
  // Money in that is not a client paying: the myPOS sweep is the same payment
  // arriving a second time, and art.134 is Georgi's own money. Either could sit
  // on an invoice's amount by chance and report it paid.
  j.credits = (j.tx || []).filter(t => t.a > 0 && t.c === 'EUR' &&
    !/^(transfer|gl studio)$/i.test(String(t.cat || '')));
  (j.tx || []).forEach(t => { const k = classify(t); t._k = k.k; t._cat = k.cat; });
  matchPayments(j.live, j.credits);
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
  const tx = (data.tx || []).filter(t => t.c === 'EUR' && t._k !== 'move');
  const inn = tx.filter(t => t.a > 0).reduce((a, t) => a + t.a, 0);
  const out = tx.filter(t => t.a < 0).reduce((a, t) => a - t.a, 0);
  return { inn, out, net: inn - out };
};

const dayList = rows => {
  const days = {};
  rows.forEach(t => (days[t.d] = days[t.d] || []).push(t));
  const keys = Object.keys(days).sort().reverse();
  if (!keys.length) return '<div class="empty">Nothing here.</div>';
  return keys.map(d => {
    const dt = new Date(d + 'T12:00');
    const inn = days[d].filter(t => t._k === 'inc').reduce((a, t) => a + t.a, 0);
    const out = days[d].filter(t => t._k === 'exp').reduce((a, t) => a - t.a, 0);
    return `<div class="day"><div class="dh"><b>${dt.getDate()}</b>
      <span class="dw">${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
      <span class="inc">${inn ? fmt(inn) : ''}</span><span class="exp">${out ? fmt(out) : ''}</span></div>` +
      days[d].map(t => `<div class="tr" data-k="${esc(t.k)}"><div class="tc${t.mine ? ' mine' : ''}">${esc(t._cat)}</div>
        <div class="tb"><b>${esc(t.who || t.desc || '—')}</b><span>${esc(t.desc || '')}</span></div>
        <div class="ta ${t._k === 'inc' ? 'inc' : t._k === 'exp' ? 'exp' : 'mv'}">${fmt(t.a)}</div></div>`).join('') +
      `</div>`;
  }).join('');
};

function renderYear() {
  const rows = (data.tx || []).filter(t => t.c === 'EUR');
  const years = [...new Set(rows.map(t => t.d.slice(0, 4)))].sort().reverse();
  if (!years.length) { $('#view').innerHTML = '<div class="empty">No bank rows yet.</div>'; return; }
  if (!bizYear || years.indexOf(bizYear) < 0) bizYear = years[0];
  const d = Year.data(rows, bizYear);
  const prev = Year.data(rows, String(+bizYear - 1));
  const story = Year.story(d, prev.total ? prev : null);
  $('#view').innerHTML =
    `<div class="chips">${years.map(y =>
      `<button data-act="byear" data-y="${y}" aria-pressed="${bizYear === y}">${y}</button>`).join('')}</div>` +
    (story.length ? `<div class="card story">${story.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : '') +
    `<div class="card">${Year.grid(d, { kind: yearKind, cat: yearCat, cell: yearCell,
      tx: rows.filter(t => t.d.startsWith(bizYear)), dayList })}</div>`;
}

let cats = null;
const api = q => fetch(apiUrl() + '?action=money&mt=' + encodeURIComponent(token()) + q).then(r => r.json());

async function setCat(key) {
  const t = (data.tx || []).find(x => x.k === key);
  if (!t) return;
  if (!cats) {
    try { cats = (await api('&cats=go')).cats || []; }
    catch (e) { cats = [...new Set((data.tx || []).map(x => x._cat).filter(Boolean))]; }
  }
  CatPick.open({
    cats, current: t.cat, title: t.who || t.desc || 'Category',
    note: `${t.d} · ${fmt(t.a)} · the company's account`,
    onPick: async cat => {
      $('#status').textContent = 'Saving…';
      try {
        const j = await api('&setcat=' + encodeURIComponent(key) + '&cat=' + encodeURIComponent(cat));
        if (!j.ok) throw new Error(j.error || 'failed');
        t.cat = j.now; t.mine = !!cat;
        const k = classify(t); t._k = k.k; t._cat = k.cat;
        if (cat && cats.indexOf(cat) < 0) cats.push(cat);
        try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
        $('#status').textContent = cat ? 'Set to ' + cat : 'Back to the rules';
        render();
      } catch (e) { $('#status').textContent = 'Could not save: ' + e.message; }
    }
  });
}

/* The type of shoot, set on the invoice. His seven, plus whatever the sheet or
   he himself has already used, so the list grows with him. */
function pickType(no, issued) {
  const i = data.invoices.find(x => String(x.no) === String(no) && x.issued === issued);
  if (!i) return;
  const known = [...new Set((data.types || []).concat(
    data.invoices.map(x => String(x.category || '').trim()).filter(Boolean)))];
  CatPick.open({
    cats: known, current: String(i.category || ''), title: i.client || 'Type of shoot',
    note: `№ ${i.no} · ${dshort(i.issued)} · ${fmt(i.amount_eur)}`,
    onPick: v => markInvoice(no, issued, v, 'category')
  });
}

async function markInvoice(no, issued, value, field) {
  $('#status').textContent = 'Saving…';
  try {
    const f = field || 'status';
    const j = await api('&biz=setinv&no=' + encodeURIComponent(no) + '&issued=' + encodeURIComponent(issued) +
      '&f=' + f + '&v=' + encodeURIComponent(value));
    if (!j.ok) throw new Error(j.error || 'failed');
    const i = data.invoices.find(x => String(x.no) === String(no) && x.issued === issued);
    if (i) i[f] = value;
    data = prep(data);
    try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
    $('#status').textContent = value ? 'Marked ' + value : 'Mark removed';
    render();
  } catch (e) { $('#status').textContent = 'Could not save: ' + e.message; }
}

function render() {
  show('main');
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  const m = money();
  $('#sum').innerHTML =
    `<div><span>Into the bank</span><b class="inc">${fmt(m.inn)}</b></div>` +
    `<div><span>Out of the bank</span><b class="exp">${fmt(m.out)}</b></div>` +
    `<div><span>Left</span><b>${fmt(m.net)}</b></div>`;
  if (tab === 'year') renderYear();
  else if (tab === 'invoices') renderInvoices();
  else if (tab === 'clients') renderClients();
  else if (tab === 'spend') renderSpend();
  else renderOverview();
}

function byYear() {
  const y = {};
  (data.tx || []).filter(t => t.c === 'EUR' && t._k !== 'move').forEach(t => {
    const k = t.d.slice(0, 4);
    (y[k] = y[k] || { inn: 0, out: 0, billed: 0 });
    if (t.a > 0) y[k].inn += t.a; else y[k].out += -t.a;
  });
  data.live.forEach(i => {
    const k = (i.issued || '').slice(0, 4); if (!k) return;
    (y[k] = y[k] || { inn: 0, out: 0, billed: 0 }).billed += i.amount_eur;
  });
  return y;
}

/* The pictures. Every one of them obeys the year chips at the top, so "all" and
   a single year are the same code.

   What each is allowed to say:
   - the years, the months and the quarters come from the BANK, which is complete;
   - billed and pay-per-job come from the INVOICES, which are complete for money
     but can bill several shoots on one invoice, mostly for Фешън Лаб;
   - the type of shoot comes from the `category` column, which says how much of
     the money it covers rather than implying it covers all of it. */
const shortType = t => String(t).split(' (')[0];

function chartRows(year) {
  const tx = (data.tx || []).filter(t => t.c === 'EUR' && (year === 'all' || t.d.startsWith(year)));
  const inv = data.live.filter(i => year === 'all' || String(i.issued || '').startsWith(year));
  return { tx, inv };
}

function quarters(tx) {
  const q = [0, 0, 0, 0], qi = [0, 0, 0, 0];
  tx.forEach(t => {
    const k = Math.floor((+t.d.slice(5, 7) - 1) / 3);
    if (t._k === 'inc') qi[k] += t.a; else if (t._k === 'exp') q[k] += -t.a;
  });
  return { out: q, inn: qi };
}

function charts() {
  const years = [...new Set((data.tx || []).map(t => t.d.slice(0, 4)))].sort();
  const { tx, inv } = chartRows(chartYear);
  const y = byYear();

  const chips = `<div class="chips">` +
    [['all', 'All']].concat(years.map(k => [k, k])).map(([k, label]) =>
      `<button data-act="cyear" data-y="${k}" aria-pressed="${chartYear === k}">${label}</button>`).join('') +
    `</div>`;

  // Years, or months when a single year is chosen: the same in / out / kept.
  const periods = chartYear === 'all'
    ? years.map(k => ({ label: k, inn: y[k].inn, out: y[k].out }))
    : MONTHS.map((m, i) => {
      const rows = tx.filter(t => +t.d.slice(5, 7) === i + 1);
      return { label: m,
        inn: rows.filter(t => t._k === 'inc').reduce((a, t) => a + t.a, 0),
        out: rows.filter(t => t._k === 'exp').reduce((a, t) => a - t.a, 0) };
    }).filter(p => p.inn || p.out);

  const best = periods.slice().sort((a, b) => b.inn - a.inn)[0];
  const dear = periods.slice().sort((a, b) => b.out - a.out)[0];
  const q = quarters(tx);
  const qBest = q.inn.indexOf(Math.max(...q.inn));

  // Billed per client, and what one invoice is worth on average: the closest
  // thing to "what is worth my time" that the invoices can honestly carry.
  const perClient = {};
  inv.forEach(i => {
    const k = i.client || '—';
    (perClient[k] = perClient[k] || { sum: 0, n: 0 });
    perClient[k].sum += i.amount_eur; perClient[k].n++;
  });
  const clients = Object.entries(perClient).sort((a, b) => b[1].sum - a[1].sum);
  const rate = clients.slice().sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n).slice(0, 10);

  // By type of shoot, from the category column. Only part filled, so it says so.
  const perType = {};
  let tagged = 0, billed = 0;
  inv.forEach(i => {
    billed += i.amount_eur;
    const t = String(i.category || '').trim();
    if (!t) return;
    tagged += i.amount_eur;
    (perType[t] = perType[t] || { sum: 0, n: 0 });
    perType[t].sum += i.amount_eur; perType[t].n++;
  });
  const types = Object.entries(perType).sort((a, b) => b[1].sum - a[1].sum);
  const pcTagged = billed ? Math.round(tagged / billed * 100) : 0;

  const byCat = {};
  tx.filter(t => t._k === 'exp').forEach(t => { byCat[t._cat] = (byCat[t._cat] || 0) + -t.a; });
  const costs = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 9);
  const costTotal = costs.reduce((a, [, v]) => a + v, 0);

  return chips + `<div class="card">
      <div class="chh">In, out and what was kept${chartYear === 'all' ? ', per year' : ', month by month'}</div>
      ${chartYear === 'all'
        ? Charts.groups(periods.map(p => ({ label: p.label, parts: [
            { v: p.inn, cls: 'in', name: 'in' },
            { v: p.out, cls: 'out', name: 'out' },
            { v: p.inn - p.out, cls: 'net', name: 'kept' }] })), fmt0)
        : Charts.inOut(periods, fmt0)}
      <div class="note2">${best ? `<b>${esc(best.label)} brought in the most, ${fmt0(best.inn)}.</b> ` : ''}
        ${dear && dear.label !== (best || {}).label ? `${esc(dear.label)} cost the most, ${fmt0(dear.out)}. ` : ''}
        The bank, not the invoices. Every month's own figures are on the Year tab.</div>
    </div>
    <div class="card">
      <div class="chh">Quarters</div>
      ${Charts.groups(q.inn.map((v, i) => ({ label: 'Q' + (i + 1), parts: [
        { v: v, cls: 'in', name: 'in' }, { v: q.out[i], cls: 'out', name: 'out' }] })), fmt0)}
      <div class="note2">${q.inn[qBest] ? `<b>Q${qBest + 1} is your strongest quarter at ${fmt0(q.inn[qBest])} in.</b>` : 'Nothing here yet.'}</div>
    </div>
    <div class="card">
      <div class="chh">Which type earns the most</div>
      ${types.length ? Charts.bars(types.map(([k, v]) => [shortType(k) + ' · ' + v.n, v.sum]), fmt0)
        : '<div class="empty">Nothing tagged yet.</div>'}
      <div class="chh">What one shoot of each type is worth</div>
      ${types.length ? Charts.bars(types.slice().sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)
        .map(([k, v]) => [shortType(k) + ' · ' + v.n, v.sum / v.n]), fmt0) : ''}
      <div class="note2"><b>${fmt0(tagged)} of ${fmt0(billed)} billed carries a type</b>
        (${pcTagged}%), so the shape is sound and the totals are still a little low.
        Tap <i>Set type</i> on any invoice to add one.</div>
    </div>
    <div class="card">
      <div class="chh">Who it came from</div>
      ${Charts.bars(clients.slice(0, 8).map(([k, v]) => [k, v.sum]), fmt0)}
      <div class="note2">Billed per client, cancelled invoices left out.</div>
    </div>
    <div class="card">
      <div class="chh">What one invoice is worth</div>
      ${Charts.bars(rate.map(([k, v]) => [k + ' · ' + v.n, v.sum / v.n]), fmt0)}
      <div class="note2"><b>Average per invoice, biggest first: the closest thing to pay per job.</b>
        The number after the name is how many invoices it is over. One invoice can cover several
        shoots, mostly for Фешън Лаб, so a big client's average is a month of work rather than a day.</div>
    </div>
    <div class="card">
      <div class="chh">Where it went</div>
      ${Charts.donut(costs, costTotal)}
      ${Charts.bars(costs, fmt0)}
      <div class="note2">Every euro the company spent, by category.</div>
    </div>`;
}

function renderOverview() {
  const y = byYear();
  const open = data.live.filter(i => !i._paid);
  $('#view').innerHTML = `
    <div class="card">
      ${Object.keys(y).sort().reverse().map(k => `<div class="arow"><b>${k}</b>` +
        `<span>in ${fmt0(y[k].inn)} · out ${fmt0(y[k].out)} · billed ${fmt0(y[k].billed)}</span></div>`).join('')}
      <div class="note2"><b>In and out are the bank: what the company actually earned and spent.</b>
        Billed is what the invoices say. The two are never added together, and they do not have to agree:
        an invoice can be billed in one year and paid in the next.</div>
    </div>
    <div class="card">
      <div class="arow tot"><b>Invoices</b><b>${data.live.length}</b></div>
      <div class="arow"><span>Matched to a payment in the bank</span><b class="inc">${data.live.length - open.length}</b></div>
      <div class="arow"><span>Not matched</span><b>${open.length}</b></div>
      <div class="note2">Not matched is not the same as unpaid: cash, a payment bundled with others, or an
        amount that differs by a cent all land here. Check them rather than chase them.</div>
    </div>` + charts();
}

function invRow(i) {
  const tag = cancelled(i)
    ? `<span class="tag">cancelled</span>`
    : i._paid
    ? `<span class="tag found">paid ${dshort(i._paid.row.d)}${i._parts.length > 1 ? ', ' + i._parts.length + ' parts' : ''}</span>`
    : i._part
      ? `<span class="tag owed">part paid, ${fmt(i._short)} short</span>`
      : `<span class="tag owed">no payment matched</span>`;
  return `<div class="inv">
    <b>${esc(i.client)}</b><span class="amt">${fmt(i.amount_eur)}</span>
    <span class="svc">№ ${esc(i.no)} · ${dshort(i.issued)}${i.items ? ' · ' + esc(String(i.items).slice(0, 40)) : ''}</span>
    <span class="st">${tag}<button class="mk" data-act="type" data-n="${esc(i.no)}" data-i="${esc(i.issued)}">${
      i.category ? esc(shortType(i.category)) : 'Set type'}</button>
      <button class="mk" data-act="mark" data-n="${esc(i.no)}" data-i="${esc(i.issued)}"
      data-v="${cancelled(i) ? '' : 'cancelled'}">${cancelled(i) ? 'Not cancelled' : 'Cancel'}</button></span></div>`;
}

const chips = (sets, names) => `<div class="chips">${Object.keys(sets).map(k =>
  `<button data-act="filter" data-f="${k}" aria-pressed="${filter === k}">${names[k]} ${sets[k].length}</button>`).join('')}</div>`;

function renderInvoices() {
  const sets = {
    open: data.live.filter(i => !i._paid),
    paid: data.live.filter(i => i._paid),
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
  data.live.forEach(i => {
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
  const rows = (data.tx || []).filter(t => t._k === 'exp');
  const by = {};
  rows.forEach(t => { by[t._cat] = (by[t._cat] || 0) + -t.a; });
  $('#view').innerHTML = `<div class="card">` +
    Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
      `<div class="arow"><span>${esc(k)}</span><b>${fmt(v)}</b></div>`).join('') +
    `<div class="note2">${rows.length} rows from the company's bank account.</div></div>`;
}

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; tab = b.dataset.t; render();
});
$('#view').addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b) {
    const r = e.target.closest('.tr[data-k]');
    if (r) setCat(r.dataset.k);
    return;
  }
  const a = b.dataset.act;
  if (a === 'mark') { markInvoice(b.dataset.n, b.dataset.i, b.dataset.v); return; }
  if (a === 'type') { pickType(b.dataset.n, b.dataset.i); return; }
  if (a === 'filter') filter = b.dataset.f;
  else if (a === 'cyear') { chartYear = b.dataset.y; }
  else if (a === 'byear') { bizYear = b.dataset.y; yearCat = null; yearCell = null; }
  else if (a === 'ykind') { yearKind = b.dataset.k; yearCat = null; yearCell = null; }
  else if (a === 'ycat') { yearCat = yearCat === b.dataset.c ? null : b.dataset.c; yearCell = null; }
  else if (a === 'ycell') { const i = +b.dataset.i; yearCell = yearCell === i ? null : i; }
  else return;
  render();
});
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = ''; load();
});
load();
})();
