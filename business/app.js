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
let jobFilter = 'open', jobEdit = null, cashSkip = [];

/* What a company row counts as. Transfers are the same euro moving (the myPOS
   sweep, money sent to cover a card), so they are shown but never counted. */
/* A "Transfer" on the personal side can be money LEAVING the company here.
   The myPOS sweep is internal: both legs are the company's, so it cancels. The
   card top-up of his personal Revolut (120 BGN, Jan 2025) is also tagged
   Transfer, and it is not internal at all - that euro left. Counting it as a
   move overstated what the company kept by 61.36, which is how it was found.

   So a transfer only cancels when its opposite leg is also the company's:
   pairTransfers() marks those, and every other transfer is treated by its sign
   like any other row. */
function classify(t) {
  const cat = String(t.cat || '').trim();
  if (t._internal) return { k: 'move', cat: 'Transfer' };
  const tr = /^transfer$/i.test(cat);
  if (t.a > 0) return { k: 'inc', cat: tr ? 'Income' : (cat || 'Income') };
  // A transfer out that nothing in the company answers is money he took out.
  return { k: 'exp', cat: tr ? 'Drawings' : (cat || here(t) || 'Uncategorised') };
}

function pairTransfers(tx) {
  const mv = (tx || []).filter(t => t.c === 'EUR' && /^transfer$/i.test(String(t.cat || '')));
  const out = mv.filter(t => t.a < 0), inn = mv.filter(t => t.a > 0);
  mv.forEach(t => { t._internal = false; });
  out.forEach(o => {
    const m = inn.find(i => !i._internal && Math.abs(i.a + o.a) < 0.015 &&
      Math.abs(new Date(i.d) - new Date(o.d)) <= 3 * 864e5);
    if (m) { m._internal = true; o._internal = true; }
  });
}

/* Two names that only mean something on this side of the money, so they are
   read here instead of in the shared rules. "Заплата · Вътрешнобанков превод"
   is worded identically when the company pays it and when Georgi receives it,
   so a shared rule would read his salary as a personal expense. */
const HERE = [[/заплата|аванс/i, 'Salary'], [/дивидент/i, 'Dividend']];
const here = t => (HERE.find(([re]) => re.test((t.who || '') + ' ' + (t.desc || ''))) || [])[1] || '';

// Matching lives in shared/invoices.js, so this page and the home page can
// never give different answers to "what is still owed". Called through, not
// pulled out at load: see the boot guard at the foot of this file.
const cancelled = i => Invoices.cancelled(i);
const shortType = t => String(t).split(' (')[0];
/* The middle value. What one invoice is worth is told by the median, not the
   average: one big order would otherwise speak for all the small ones (his
   call, 26 Oct 2026). */
const median = list => {
  const v = list.slice().sort((a, b) => a - b), k = v.length >> 1;
  return v.length ? (v.length % 2 ? v[k] : (v[k - 1] + v[k]) / 2) : 0;
};

/* Тетсуджин rents half the studio and pays through the company: 250 лв
   (€127.82) a month, invoiced as "Фотографски услуги". It is income, his
   word: "I see him as an income where I earn from him by renting half of my
   studio" (26 Oct 2026). It is not photography, though. So his invoices stay
   in the register and the matching, leave every photography figure (`photo`),
   and the payments read as income under their own name, Studio rent. Rent
   itself stays the full cost of the studio. */
const RENT_SHARE = [/тетсуджин/i];
const rentShare = i => RENT_SHARE.some(re => re.test(String(i.client || '')));

function prep(j) {
  j.time = j.time || [];
  pairTransfers(j.tx);
  (j.tx || []).forEach(t => { const k = classify(t); t._k = k.k; t._cat = k.cat; });
  const r = Invoices.reconcile(j.invoices, j.tx);
  j.invoices = r.invoices; j.live = r.live; j.credits = r.credits; j.unbilled = r.unbilled;
  j.live.filter(rentShare).forEach(i => (i._parts || []).forEach(p => {
    p.row._cat = 'Studio rent'; p.row._rent = true;
  }));
  j.photo = j.live.filter(i => !rentShare(i));
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
    if (j.now) skew = j.now - Date.now();
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
  const m = money(), yr = today().slice(0, 4);
  const ty = (data.tx || []).filter(t => t.c === 'EUR' && t.d.startsWith(yr));
  const tyIn = ty.filter(t => t._k === 'inc').reduce((a, t) => a + t.a, 0);
  const tyOut = ty.filter(t => t._k === 'exp').reduce((a, t) => a - t.a, 0);
  /* "Left" used to be in minus out, presented as if it were cash in hand. It
     was not: the accounts held 76.65 more, which is older than the first row of
     the statement export. So the real balance is shown when it is known, and
     the difference is named rather than hidden in a rounding. */
  const held = (data.balances || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const before = (data.balances || []).length ? Math.round((held - m.net) * 100) / 100 : 0;
  $('#sum').innerHTML =
    // This year, not all time (his ask, 26 Oct 2026). Every year is on the Overview.
    `<div><span>In, ${yr}</span><b class="inc">${fmt(tyIn)}</b></div>` +
    `<div><span>Out, ${yr}</span><b class="exp">${fmt(tyOut)}</b></div>` +
    `<div><span>${(data.balances || []).length ? 'In the accounts' : 'Left'}</span>` +
      `<b>${fmt((data.balances || []).length ? held : m.net)}</b></div>`;
  if (tab === 'jobs') renderJobs();
  else if (tab === 'year') renderYear();
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
    if (t._k === 'inc') y[k].inn += t.a; else y[k].out += -t.a;
  });
  data.photo.forEach(i => {
    const k = (i.issued || '').slice(0, 4); if (!k) return;
    (y[k] = y[k] || { inn: 0, out: 0, billed: 0 }).billed += i.amount_eur;
  });
  return y;
}

/* ===== Bookings ====================================================
   A shoot exists before it is billed. Everything else on this page looks
   backwards at money that has already moved; this is the one part that looks
   forwards, which is why the deadline lives here and nowhere else. */

/* Delivery is owed ten WORKING days after the shoot (Georgi's own rule), so a
   Friday shoot is due the Friday two weeks later, not the Sunday. Bulgarian
   public holidays are not in this: there is no table for them here, and being
   a day early is the safe direction to be wrong in. */
function workingDue(shoot, days) {
  const d = new Date(shoot + 'T12:00');
  if (isNaN(d)) return '';
  let left = days == null ? 10 : days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const w = d.getDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/* IMPORTANT: a booking's price and deposit are NEVER money.
   They are what Georgi agreed, not what moved. Only the bank says what moved,
   and the invoices say what was billed. So no figure typed into a booking is
   added to a balance, a total, a year or a chart anywhere on this site: the
   bookings are a record, and their one job against the money is to disagree
   with it out loud when the three do not line up (see jobGaps). */

/* What a booking is NOW. Nothing here is stored except `delivered` and the
   invoice number: a status written into a cell is out of date the next morning
   and then has to be corrected by hand, which is exactly the work this page is
   meant to remove. */
function jobState(j, invByNo) {
  const now = today(), due = workingDue(j.shoot);
  const inv = j.invoice ? invByNo[String(j.invoice).trim()] : null;
  // Cash, straight into his personal account: no invoice and nothing in the
  // company's bank will ever show it, so the booking is the only record there is.
  if (j.paid && !inv) return { k: 'paid', label: 'paid in cash ' + dshort(j.paid), due, cash: true };
  if (inv && inv._paid) return { k: 'paid', label: 'paid', due };
  if (inv) return { k: 'invoiced', label: 'invoiced, waiting for the money', due };
  if (j.delivered) return { k: 'delivered', label: 'delivered ' + dshort(j.delivered) + ', not paid yet', due };
  if (j.shoot > now) return { k: 'booked', label: 'booked', due };
  if (due < now) return { k: 'late', label: 'late, due ' + dshort(due), due };
  return { k: 'due', label: 'due ' + dshort(due), due };
}

/* Where the three records disagree. This is the whole point of keeping
   bookings beside the invoices and the bank: each one knows something the
   others do not, and a difference between them is either a mistake or a thing
   still to do. Nothing is corrected automatically; it is only said. */
function jobGaps(j, invByNo) {
  const out = [];
  const price = Number(j.price) || 0;
  const no = String(j.invoice || '').trim();
  const inv = no ? invByNo[no] : null;

  if (no && !inv) out.push('invoice \u2116 ' + no + ' is not in the register');
  if (inv && price && Math.abs((Number(inv.amount_eur) || 0) - price) > 0.01) {
    out.push('billed ' + fmt(inv.amount_eur) + ', booked at ' + fmt(price));
  }
  if (inv && inv._short > 0.01) {
    out.push(inv._paid ? '' : fmt(inv._short) + ' of that invoice has not arrived');
  }
  // A shoot with no invoice is normal: plenty are paid in cash. It is only
  // worth saying when it is finished and nothing says the money came.
  if (!no && !j.paid && j.delivered) out.push('delivered, and nothing says it was paid');
  if (j.paid && no) out.push('marked paid in cash and billed on \u2116 ' + no);
  const dep = Number(j.deposit) || 0;
  if (dep && price && dep > price + 0.01) out.push('the deposit is more than the price');
  if (dep && !j.deposit_in && j.shoot < today()) out.push('the deposit was never marked as in');
  return out.filter(Boolean);
}

const JOB_ORDER = { late: 0, due: 1, delivered: 2, booked: 3, invoiced: 4, paid: 5 };

/* Tying a cash deposit to the shoots behind it.

   Georgi pays cash in at a machine, often several shoots in one go, so looking
   for a deposit that equals one booking would miss most of them. This looks for
   any combination of up to four unpaid cash bookings that comes to the deposit
   exactly. Combinations are few (unpaid cash bookings are a handful) so the
   cost is nothing, and a suggestion is only ever offered - confirming is his. */
const cashCandidates = () => (data.bookings || []).filter(b =>
  (Number(b.price) || 0) > 0 && !b.paid && !String(b.invoice || '').trim());

function cashMatches() {
  const open = cashCandidates();
  const out = [];
  if (!open.length) return out;
  (data.cashIn || []).filter(dep => cashSkip.indexOf(dep.k) < 0).forEach(dep => {
    // Only shoots already done by the day the money was paid in, and not too
    // long before: cash sits in a wallet for days, not seasons.
    const near = open.filter(b => b.shoot <= dep.d &&
      (new Date(dep.d) - new Date(b.shoot)) <= 120 * 864e5);
    const hit = subsetFor(near, dep.a);
    if (hit) out.push({ dep, jobs: hit });
  });
  return out;
}

function subsetFor(list, target) {
  const n = Math.min(list.length, 12);
  let best = null;
  const walk = (i, picked, sum) => {
    if (best || picked.length > 4) return;
    if (Math.abs(sum - target) < 0.015 && picked.length) { best = picked.slice(); return; }
    if (i >= n || sum > target + 0.015) return;
    walk(i + 1, picked.concat([list[i]]), sum + (Number(list[i].price) || 0));
    walk(i + 1, picked, sum);
  };
  walk(0, [], 0);
  return best;
}

function cashCard() {
  const m = cashMatches();
  if (!m.length) return '';
  return m.map(x => `<div class="card cashm">
    <b>${fmt(x.dep.a)} paid in on ${dshort(x.dep.d)}</b>
    <span class="svc">looks like ${x.jobs.length === 1 ? 'this shoot' : 'these ' + x.jobs.length + ' shoots'}:
      ${x.jobs.map(j => esc(j.client) + ' ' + fmt(j.price)).join(' \u00b7 ')}</span>
    <span class="st">
      <button class="mk go2" data-act="cashok" data-dep="${esc(x.dep.k)}" data-d="${esc(x.dep.d)}"
        data-ids="${esc(x.jobs.map(j => j.id).join(','))}">Yes, mark them paid</button>
      <button class="mk" data-act="cashno" data-dep="${esc(x.dep.k)}">Not this</button></span>
  </div>`).join('');
}

/* Confirming does two things at once: each shoot is marked paid on the day the
   money was paid in, and the deposit itself is named Photography on the Money
   page, so a cash-in row stops reading as an unexplained lump of income. */
async function cashConfirm(depKey, when, ids) {
  $('#status').textContent = 'Saving…';
  try {
    for (const id of ids.split(',')) {
      const j = await api('&biz=setjob&id=' + encodeURIComponent(id) + '&f=paid&v=' + encodeURIComponent(when));
      if (!j.ok) throw new Error(j.error || 'failed');
      const b = (data.bookings || []).find(x => x.id === id);
      if (b) b.paid = when;
    }
    await api('&setcat=' + encodeURIComponent(depKey) + '&cat=Photography').catch(() => null);
    (data.cashIn || []).forEach(c => { if (c.k === depKey) c.cat = 'Photography'; });
    try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
    $('#status').textContent = 'Marked paid, and the deposit is now Photography';
    render();
  } catch (e) { $('#status').textContent = 'Could not save: ' + e.message; }
}

/* The job clock (Biz_Time). A session is two timestamps written by the
   server, so nothing runs while the page is shut: start at the shoot on the
   phone, stop on the Mac after editing. An `end` of 0 is the clock running,
   and what it shows is now minus start, worked out again every second.
   `skew` is how far this device's clock is from the server's, so the figure
   is right even on a phone whose clock is a minute out. */
let timeEdit = null, timePick = '', skew = 0;
const nowMs = () => Date.now() + skew;
const sessLen = s => (s.end || nowMs()) - s.start;
const running = () => (data.time || []).find(s => !s.end);
const jobHours = id => (data.time || []).filter(s => s.job === id).reduce((a, s) => a + sessLen(s), 0);
const hm = ms => { const m = Math.round(ms / 6e4); return Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; };
const clock = ms => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
};
const hhmm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const localDT = ms => ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '';
const jobName = id => {
  const b = (data.bookings || []).find(x => x.id === id);
  return b ? b.client + ' · ' + dshort(b.shoot) : 'a removed booking';
};
// Over this, a running clock is probably one he forgot.
const LONG_RUN = 10 * 3600e3;

function timeCard() {
  const books = (data.bookings || []).slice().sort((a, b) =>
    (!!a.delivered - !!b.delivered) || (a.shoot < b.shoot ? 1 : -1));
  const r = running();
  const last = (data.time || []).slice().sort((a, b) => b.start - a.start);
  if (!timePick || !books.some(b => b.id === timePick)) timePick = (last[0] && last[0].job) || (books[0] && books[0].id) || '';
  const opts = (sel, withNew) => books.map(b =>
    `<option value="${esc(b.id)}"${b.id === sel ? ' selected' : ''}>${esc(b.client)} · ${dshort(b.shoot)}</option>`).join('') +
    (withNew ? '<option value="__new">+ new job</option>' : '');
  const phaseSel = p => ['shoot', 'edit'].map(x => `<option value="${x}"${x === p ? ' selected' : ''}>${x === 'shoot' ? 'Shoot' : 'Edit'}</option>`).join('');

  const head = r
    ? `<div class="tclk" id="tclock">${clock(nowMs() - r.start)}</div>
       <div class="tsub">${r.phase === 'edit' ? 'Editing' : 'Shooting'} · ${esc(jobName(r.job))} · since ${hhmm(r.start)}</div>
       <div class="tbtn"><button class="go" data-act="tstop">Stop</button>
         <button class="go ghost" data-act="tstart" data-j="${esc(r.job)}" data-p="${r.phase === 'edit' ? 'shoot' : 'edit'}">Switch to ${r.phase === 'edit' ? 'shoot' : 'edit'}</button></div>
       ${nowMs() - r.start > LONG_RUN ? '<span class="gap">Running for over 10 hours. Forgot to stop? Stop it, then Edit the end below.</span>' : ''}`
    : books.length
      ? `<label class="tsel">Job<select id="tJob">${opts(timePick, true)}</select></label>
         <div class="tbtn"><button class="go" data-act="tstart" data-p="shoot">Start shoot</button>
           <button class="go" data-act="tstart" data-p="edit">Start edit</button></div>`
      : '<div class="tsub">Add a booking below, then time it here.</div>';

  const row = s => timeEdit === s.id
    ? sessForm(s, opts, phaseSel)
    : `<div class="inv"><b>${esc(jobName(s.job))}</b><span class="amt">${s.end ? hm(sessLen(s)) : 'running'}</span>
        <span class="svc">${s.phase === 'edit' ? 'Edit' : 'Shoot'} · ${dshort(localDT(s.start).slice(0, 10))}
          ${hhmm(s.start)}–${s.end ? hhmm(s.end) : 'now'}</span>
        <span class="st"><button class="mk" data-act="tedit" data-id="${esc(s.id)}">Edit</button>
          <button class="mk" data-act="tdel" data-id="${esc(s.id)}">Delete</button></span></div>`;

  return `<div class="card tmr">${head}</div>` +
    (books.length ? `<div class="card">${timeEdit === '__new' ? sessForm(null, opts, phaseSel) : ''}
      ${last.slice(0, 8).map(row).join('')}
      <div class="note2">${timeEdit === '__new' ? '' : '<button class="mk go2" data-act="tedit" data-id="__new">+ Add time by hand</button> '}
        Times are kept by the server, so the clock runs with the page shut. One clock at a time:
        starting one stops the other.</div></div>` : '');
}

function sessForm(s, opts, phaseSel) {
  return `<div class="bkf sessf">
    ${s ? '' : `<label class="wide">Job<select id="tfJob">${opts(timePick, false)}</select></label>`}
    <label>Phase<select id="tfPhase">${phaseSel(s ? s.phase : 'edit')}</select></label><span></span>
    <label>Start<input id="tfStart" type="datetime-local" value="${localDT(s && s.start)}"></label>
    <label>End<input id="tfEnd" type="datetime-local" value="${localDT(s && s.end)}"></label>
    <button class="go" data-act="tsave">${s ? 'Save' : 'Add the time'}</button>
    <button class="go ghost" data-act="tcancel">Leave it</button>
    <div class="note2" id="tMsg">${s && !s.end ? 'Leave End empty to keep it running.' : ''}</div></div>`;
}

const keep = () => { try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {} };

async function timeStart(job, phase) {
  if (!job) return;
  $('#status').textContent = 'Starting…';
  try {
    const j = await api('&biz=tstart&job=' + encodeURIComponent(job) + '&phase=' + phase);
    if (!j.ok) throw new Error(j.error || 'failed');
    (data.time || []).forEach(s => { if (!s.end) s.end = nowMs(); });
    data.time = (data.time || []).concat([{ id: j.session.id, job: job, phase: phase, start: j.session.start, end: 0 }]);
    timePick = job; keep();
    $('#status').textContent = (phase === 'edit' ? 'Editing ' : 'Shooting ') + jobName(job);
    render();
  } catch (e) { $('#status').textContent = 'Could not start: ' + e.message; }
}

async function timeStop() {
  $('#status').textContent = 'Stopping…';
  try {
    const j = await api('&biz=tstop');
    if (!j.ok) throw new Error(j.error || 'failed');
    const r = running();
    (data.time || []).forEach(s => { if (!s.end) s.end = nowMs(); });
    keep();
    $('#status').textContent = r ? 'Stopped at ' + hm(sessLen(r)) : 'Nothing was running';
    render();
  } catch (e) { $('#status').textContent = 'Could not stop: ' + e.message; }
}

async function timeSave() {
  const v = id => (($('#' + id) || {}).value || '').trim();
  const ms = s => (s ? new Date(s).getTime() : '');
  const q = { phase: v('tfPhase'), start: ms(v('tfStart')), end: ms(v('tfEnd')) };
  const isNew = timeEdit === '__new';
  if (isNew) q.job = v('tfJob'); else q.id = timeEdit;
  if (!q.start || (isNew && !q.end)) { $('#tMsg').textContent = 'A start and an end, please.'; return; }
  $('#tMsg').textContent = 'Saving…';
  try {
    const j = await api('&biz=' + (isNew ? 'tadd' : 'tedit') + '&' +
      Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&'));
    if (!j.ok) throw new Error(j.error || 'failed');
    if (isNew) data.time = (data.time || []).concat([{ id: j.session.id, job: q.job, phase: q.phase, start: q.start, end: q.end }]);
    else Object.assign((data.time || []).find(s => s.id === q.id) || {}, { phase: q.phase, start: q.start, end: q.end || 0 });
    timeEdit = null; keep(); render();
  } catch (e) { $('#tMsg').textContent = 'Could not save: ' + e.message; }
}

async function timeDel(id) {
  const s = (data.time || []).find(x => x.id === id);
  if (!s || !confirm('Delete ' + hm(sessLen(s)) + ' of ' + s.phase + ' on ' + jobName(s.job) + '?')) return;
  try {
    const j = await api('&biz=tdel&id=' + encodeURIComponent(id));
    if (!j.ok) throw new Error(j.error || 'failed');
    data.time = (data.time || []).filter(x => x.id !== id); keep(); render();
  } catch (e) { $('#status').textContent = 'Could not delete: ' + e.message; }
}

function renderJobs() {
  const invByNo = {};
  (data.invoices || []).forEach(i => { invByNo[String(i.no).trim()] = i; });
  const all = (data.bookings || []).map(j => Object.assign({}, j,
    { _s: jobState(j, invByNo), _gaps: jobGaps(j, invByNo) }));
  const sets = {
    open: all.filter(j => j._s.k !== 'paid'),
    all: all
  };
  const names = { open: 'Open', all: 'All' };
  const list = (sets[jobFilter] || []).slice().sort((a, b) =>
    (JOB_ORDER[a._s.k] - JOB_ORDER[b._s.k]) || (a.shoot < b.shoot ? -1 : 1));

  $('#view').innerHTML = timeCard() + jobForm() + cashCard() +
    `<div class="chips">${Object.keys(sets).map(k =>
      `<button data-act="jfilter" data-f="${k}" aria-pressed="${jobFilter === k}">${names[k]} ${sets[k].length}</button>`).join('')}</div>` +
    (list.length ? `<div class="card">${list.map(jobRow).join('')}</div>` +
      `<div class="note2"><b>These figures are a record of what you agreed, not money.</b>
        Nothing typed into a booking is added to a balance or a chart anywhere.
        What the bank received is on the Year and Overview tabs; what was billed is on Invoices.
        A booking's only job against those is to say so when the three disagree.</div>`
      : '<div class="empty">No bookings yet. Add the next shoot above.</div>');
}

function jobRow(j) {
  const s = j._s;
  const owed = (Number(j.price) || 0) - (j.deposit_in ? (Number(j.deposit) || 0) : 0);
  const bits = [j.type, j.location].filter(Boolean).map(esc).join(' · ');
  return `<div class="inv job ${s.k}">
    <b>${esc(j.client)}</b><span class="amt">${j.price ? fmt(j.price) : ''}</span>
    <span class="svc">${dshort(j.shoot)}${bits ? ' · ' + bits : ''}${j.contact ? ' · ' + esc(j.contact) : ''}</span>
    <span class="st"><span class="tag ${s.k === 'paid' || s.k === 'delivered' ? 'found' : s.k === 'late' ? 'owed' : ''}">${esc(s.label)}</span>
      ${jobHours(j.id) ? `<span class="tag">\u23f1 ${hm(jobHours(j.id))}</span>` : ''}
      ${j.deposit ? `<span class="tag">${j.deposit_in ? 'deposit in' : 'deposit due'} ${fmt(j.deposit)}</span>` : ''}
      ${j.price && owed > 0.01 && s.k !== 'paid' ? `<span class="tag">${fmt(owed)} to come</span>` : ''}
      ${j.delivered ? '' : `<button class="mk" data-act="jdone" data-id="${esc(j.id)}">Delivered</button>`}
      ${j.paid || j.invoice ? '' : `<button class="mk" data-act="jcash" data-id="${esc(j.id)}">Paid in cash</button>`}
      ${j.paid ? '' : `<button class="mk" data-act="jinv" data-id="${esc(j.id)}">${j.invoice ? '№ ' + esc(j.invoice) : 'Invoice №'}</button>`}
      <button class="mk" data-act="jedit" data-id="${esc(j.id)}">Edit</button>
      <button class="mk" data-act="jdel" data-id="${esc(j.id)}">Remove</button></span>
    ${j._gaps && j._gaps.length ? `<span class="gap">${j._gaps.map(esc).join(' \u00b7 ')}</span>` : ''}</div>`;
}

/* One form, for a new booking and for correcting one. Getting a price wrong
   and having to open the spreadsheet to fix it would undo the point of the
   tab, so Edit fills this in and the same button saves it. */
function jobForm() {
  const types = [...new Set((data.types || []).concat(
    (data.bookings || []).map(j => String(j.type || '').trim()).filter(Boolean)))];
  const j = jobEdit ? (data.bookings || []).find(x => x.id === jobEdit) : null;
  // Open while editing, and while there is nothing else to show: a collapsed
  // form on an empty tab leaves a page with one line of text and nothing to press.
  const open = j || !(data.bookings || []).length;
  const v = k => esc(j ? (j[k] == null ? '' : j[k]) : '');
  return `<details class="card addj"${open ? ' open' : ''}>
    <summary><span>${j ? 'Editing ' + esc(j.client) : 'Add a booking'}</span></summary>
    <div class="bkf">
      <label>Client<input id="jClient" autocomplete="off" value="${v('client')}"></label>
      <label>Shoot date<input id="jShoot" type="date" value="${j ? v('shoot') : today()}"></label>
      <label>Type<select id="jType"><option value=""></option>
        ${types.map(t => `<option value="${esc(t)}"${j && j.type === t ? ' selected' : ''}>${esc(shortType(t))}</option>`).join('')}</select></label>
      <label>Location<input id="jLocation" autocomplete="off" value="${v('location')}"></label>
      <label>Contact<input id="jContact" autocomplete="off" value="${v('contact')}"></label>
      <label>Total price<input id="jPrice" type="number" step="0.01" inputmode="decimal" value="${v('price')}"></label>
      <label>Deposit<input id="jDeposit" type="number" step="0.01" inputmode="decimal" value="${v('deposit')}"></label>
      <label class="ck"><input id="jDepIn" type="checkbox"${j && j.deposit_in ? ' checked' : ''}> Deposit already in</label>
      ${j ? `<label>Invoice \u2116<input id="jInvoice" autocomplete="off" value="${v('invoice')}"></label>
      <label>Delivered<input id="jDelivered" type="date" value="${v('delivered')}"></label>
      <label class="wide">Paid in cash on<input id="jPaid" type="date" value="${v('paid')}"></label>` : ''}
      <label class="wide">Note<input id="jNote" autocomplete="off" value="${v('note')}"></label>
      <button class="go" data-act="jadd">${j ? 'Save the changes' : 'Add the booking'}</button>
      ${j ? `<button class="go ghost" data-act="jcancel">Leave it as it was</button>` : ''}
      <div class="note2" id="jMsg">Delivery is set at ten working days after the shoot.
        These figures are a record of what you agreed, never money.</div>
    </div>
  </details>`;
}

async function addJob() {
  const v = id => (($('#' + id) || {}).value || '').trim();
  const q = { client: v('jClient'), shoot: v('jShoot'), type: v('jType'), location: v('jLocation'),
    contact: v('jContact'), price: v('jPrice'), deposit: v('jDeposit'), note: v('jNote'),
    deposit_in: ($('#jDepIn') || {}).checked ? 'yes' : '' };
  if (jobEdit) { q.invoice = v('jInvoice'); q.delivered = v('jDelivered'); q.paid = v('jPaid'); q.id = jobEdit; }
  if (!q.client || !q.shoot) { $('#jMsg').textContent = 'A client and a shoot date are the two it cannot do without.'; return; }
  $('#jMsg').textContent = 'Saving…';
  const route = jobEdit ? '&biz=editjob&' : '&biz=book&';
  try {
    const j = await api(route + Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&'));
    if (!j.ok) throw new Error(j.error || 'failed');
    const was = jobEdit;
    data.bookings = was
      ? (data.bookings || []).map(x => (x.id === was ? j.job : x))
      : (data.bookings || []).concat([j.job]);
    try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
    jobEdit = null;
    if (!was) timePick = j.job.id;
    $('#status').textContent = was ? q.client + ' updated' : q.client + ' booked for ' + dshort(q.shoot);
    render();
  } catch (e) { $('#jMsg').textContent = 'Could not save: ' + e.message; }
}

async function setJob(id, field, value) {
  $('#status').textContent = 'Saving…';
  try {
    const j = await api('&biz=setjob&id=' + encodeURIComponent(id) + '&f=' + field + '&v=' + encodeURIComponent(value));
    if (!j.ok) throw new Error(j.error || 'failed');
    const b = (data.bookings || []).find(x => x.id === id);
    if (b) b[field] = j.set;
    try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
    $('#status').textContent = 'Saved';
    render();
  } catch (e) { $('#status').textContent = 'Could not save: ' + e.message; }
}

async function delJob(id) {
  const b = (data.bookings || []).find(x => x.id === id);
  if (!b || !confirm('Remove the booking for ' + b.client + '?')) return;
  try {
    const j = await api('&biz=deljob&id=' + encodeURIComponent(id));
    if (!j.ok) throw new Error(j.error || 'failed');
    data.bookings = (data.bookings || []).filter(x => x.id !== id);
    try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
    render();
  } catch (e) { $('#status').textContent = 'Could not remove: ' + e.message; }
}

/* The pictures. Every one of them obeys the year chips at the top, so "all" and
   a single year are the same code.

   What each is allowed to say:
   - the years and the months come from the BANK, which is complete;
   - an average January, February... comes from the INVOICES, every year together;
   - billed and pay-per-job come from the INVOICES, which are complete for money
     but can bill several shoots on one invoice, mostly for Фешън Лаб;
   - the type of shoot comes from the `category` column, which says how much of
     the money it covers rather than implying it covers all of it. */
function chartRows(year) {
  const tx = (data.tx || []).filter(t => t.c === 'EUR' && (year === 'all' || t.d.startsWith(year)));
  const inv = data.photo.filter(i => year === 'all' || String(i.issued || '').startsWith(year));
  return { tx, inv };
}

function charts(st) {
  const years = [...new Set((data.tx || []).map(t => t.d.slice(0, 4)))].sort();
  /* Shoots paid in cash are invisible to every chart here: no invoice is ever
     written for them and the money goes to his personal account, so neither
     source this page reads has heard of them. Counting them in would mix what
     the bank proves with what a booking claims, so instead the charts say what
     they are missing and leave the figures alone. */
  const cash = (data.bookings || []).filter(b => b.paid && !String(b.invoice || '').trim()
    && (chartYear === 'all' || String(b.paid).startsWith(chartYear)));
  const cashSum = cash.reduce((a, b) => a + (Number(b.price) || 0), 0);
  const cashNote = cash.length
    ? `<br><b>${cash.length} shoot${cash.length === 1 ? '' : 's'} paid in cash
       (${fmt0(cashSum)}) ${cash.length === 1 ? 'is' : 'are'} not in this</b>, because no invoice
       was written and the money went to your personal account. The Jobs tab has them.`
    : '';
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
  const mo = monthAvg();
  const thin = st ? mo.filter(m => m.years >= 2 && m.avg < st.need) : [];
  const trend = rateTrend(), mix = clientMix(), yr = today().slice(0, 4);

  // Billed per client, and what one invoice is worth on average: the closest
  // thing to "what is worth my time" that the invoices can honestly carry.
  const perClient = {};
  inv.forEach(i => {
    const k = i.client || '—';
    (perClient[k] = perClient[k] || { sum: 0, n: 0, a: [] });
    perClient[k].sum += i.amount_eur; perClient[k].n++; perClient[k].a.push(i.amount_eur);
  });
  const clients = Object.entries(perClient).sort((a, b) => b[1].sum - a[1].sum);

  // By type of shoot, from the category column. Only part filled, so it says so.
  const perType = {};
  let tagged = 0, billed = 0;
  inv.forEach(i => {
    billed += i.amount_eur;
    const t = String(i.category || '').trim();
    if (!t) return;
    tagged += i.amount_eur;
    (perType[t] = perType[t] || { sum: 0, n: 0, a: [] });
    perType[t].sum += i.amount_eur; perType[t].n++; perType[t].a.push(i.amount_eur);
  });
  const types = Object.entries(perType).sort((a, b) => b[1].sum - a[1].sum);
  const pcTagged = billed ? Math.round(tagged / billed * 100) : 0;

  /* Earned from photography, invoiced and cash side by side but never added
     into the bank figures. His call: "that's different from the invoiced cash,
     so I don't want it in the same metrics, but I still want to know what it
     is". So it is its own card, above the charts, and the charts stay as they
     were: invoiced is what an invoice proves, cash is what a booking records. */
  const earned = cashSum
    ? `<div class="card">
        <div class="chh">Earned from photography${chartYear === 'all' ? '' : ' in ' + chartYear}</div>
        <div class="arow"><span>Invoiced</span><b>${fmt(billed)}</b></div>
        <div class="arow"><span>Paid in cash, ${cash.length} shoot${cash.length === 1 ? '' : 's'}</span><b>${fmt(cashSum)}</b></div>
        <div class="arow tot"><b>Together</b><b>${fmt(billed + cashSum)}</b></div>
        <div class="note2">Invoiced is what an invoice says was billed; cash is what you recorded on the
          booking, money that went straight to your personal account. They are kept apart on purpose and
          neither is added to the bank figures below.</div>
      </div>`
    : '';

  const byCat = {};
  tx.filter(t => t._k === 'exp').forEach(t => { byCat[t._cat] = (byCat[t._cat] || 0) + -t.a; });
  const costs = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 9);
  const costTotal = costs.reduce((a, [, v]) => a + v, 0);

  return chips + earned + `<div class="card">
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
      <div class="chh">An average January, February\u2026</div>
      ${Charts.bars(mo.filter(m => m.years).map(m => [m.label, m.avg]), fmt0)}
      <div class="note2">${thin.length ? `<b>${thin.map(m => m.label).join(', ')} bill less than the ${fmt0(st.need)}
        photography has to cover</b>, year after year. ` : ''}What each calendar month billed, averaged over every year it
        appears in the invoices. It ignores the year chips: one year cannot show a season.</div>
    </div>
    <div class="card">
      <div class="chh">By type of shoot</div>
      <div class="barh"><span></span><span></span><span>billed</span><span>median</span></div>
      ${types.length ? Charts.bars(types.map(([k, v]) =>
        [shortType(k) + ' \u00b7 ' + v.n, v.sum, median(v.a)]), fmt0)
        : '<div class="empty">Nothing tagged yet.</div>'}
      ${trend.length ? rateTable(trend, st, yr) : ''}
      <div class="note2">${trend.length ? `<b>The median invoice, year by year</b>: the size of an order, not your rate, since you charge per photo.
        The small figure is how many invoices it rests on; the change compares the first and last years with two or more.
        ${st && st.minInv ? `Red is under ${fmt0(st.minInv)}, what one invoice has to carry.` : ''}<br>` : ''}
        <b>${fmt0(tagged)} of ${fmt0(billed)} billed carries a type</b>
        (${pcTagged}%), so the shape is sound and the totals are still a little low.
        Tap <i>Set type</i> on any invoice to add one.${cashNote}</div>
    </div>
    <div class="card">
      <div class="chh">By client</div>
      <div class="barh"><span></span><span></span><span>billed</span><span>median</span></div>
      ${Charts.bars(clients.slice(0, 10).map(([k, v]) => [k + ' \u00b7 ' + v.n, v.sum, median(v.a)]), fmt0)}
      ${mix.rep.length ? `<div class="arow tot"><span>Came back, ${mix.rep.length} client${mix.rep.length === 1 ? '' : 's'}</span><b>${Math.round(mix.repShare * 100)}% \u00b7 ${fmt0(mix.repMed)} typical</b></div>
        <div class="arow"><span>Came once, ${mix.one.length}</span><b>${Math.round((1 - mix.repShare) * 100)}% \u00b7 ${fmt0(mix.oneMed)} typical</b></div>` : ''}
      <div class="note2">${cashNote ? cashNote.replace('<br>', '') + '<br>' : ''}${mix.rep.length ? 'Came back and came once are every year together: what a client is worth over time. ' : ''}<b>Billed per client, and its median invoice:</b> the middle one, so one big order does not
        speak for the rest. The number after the name is how many invoices that is. One invoice can cover several
        shoots, mostly for Фешън Лаб, so a big client's median is a run of work rather than a day.
        Cancelled invoices are left out.</div>
    </div>
    <div class="card">
      <div class="chh">Where it went</div>
      ${Charts.donut(costs, costTotal)}
      ${Charts.bars(costs, fmt0)}
      <div class="note2">Every euro the company spent, by category.</div>
    </div>`;
}

/* ===== What the numbers say (26 Oct 2026) ==========================
   Georgi: "a month u earn this much, avg expenses are that much, so you need
   X. What effort is with the biggest ROI." The charts below say what
   happened; these say where he stands and what is worth doing next.

   The business is side income (his answer), so the question is whether the
   work is worth the time, and the floor is what every month has to clear
   before any of it is his: rent, taxes, accounting, bank fees and
   subscriptions, averaged over the last twelve complete months. */
const FIXED = ['Rent', 'Taxes', 'Accounting', 'Fees', 'Subscriptions'];
const DRAW = ['Salary', 'Dividend', 'Drawings'];
const ymAdd = (ym, n) => { const d = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const ymDiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const fullMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function standing(now) {
  now = now || today();
  const cur = now.slice(0, 7), yr = now.slice(0, 4);
  const tx = (data.tx || []).filter(t => t.c === 'EUR' && t._k !== 'move');
  const first = tx.map(t => t.d).sort()[0];
  if (!first) return null;
  const from = [ymAdd(cur, -12), first.slice(0, 7)].sort()[1];
  const months = ymDiff(from, cur);
  if (months < 1) return null;
  const inWin = t => t.d.slice(0, 7) >= from && t.d.slice(0, 7) < cur;
  const fixedBy = {};
  tx.filter(t => t._k === 'exp' && inWin(t) && FIXED.indexOf(t._cat) >= 0)
    .forEach(t => { fixedBy[t._cat] = (fixedBy[t._cat] || 0) - t.a / months; });
  const floor = Object.values(fixedBy).reduce((a, v) => a + v, 0);
  // The studio rent he takes in is steady, so photography only has to cover the rest.
  const rentIn = tx.filter(t => t._rent && inWin(t)).reduce((a, t) => a + t.a, 0) / months;
  const need = floor - rentIn;
  const n3 = Math.min(3, months), from3 = ymAdd(cur, -n3);
  const run3 = tx.filter(t => t._k === 'inc' && t.d.slice(0, 7) >= from3 && t.d.slice(0, 7) < cur)
    .reduce((a, t) => a + t.a, 0) / n3;
  const inThis = tx.filter(t => t._k === 'inc' && t.d.startsWith(cur)).reduce((a, t) => a + t.a, 0);
  const live = data.photo || [];
  const thisYr = live.filter(i => String(i.issued || '').startsWith(yr));
  const avgInv = thisYr.length ? thisYr.reduce((a, i) => a + i.amount_eur, 0) / thisYr.length : 0;
  const perMonth = live.filter(i => { const m = String(i.issued || '').slice(0, 7); return m >= from && m < cur; }).length / months;
  const draws = tx.filter(t => t._k === 'exp' && DRAW.indexOf(t._cat) >= 0);
  const taken = draws.filter(t => t.d.startsWith(yr)).reduce((a, t) => a - t.a, 0);
  const lastDraw = draws.map(t => t.d).sort().pop() || '';
  const end = new Date(+cur.slice(0, 4), +cur.slice(5, 7), 0).getDate();
  return { cur, yr, months, floor, fixedBy, rentIn, need, run3, n3, inThis, avgInv, perMonth,
    minInv: perMonth ? need / perMonth : 0, taken, lastDraw, daysLeft: end - +now.slice(8, 10) };
}

/* The median invoice of each type, year by year. The all-years figure on the
   chart hid the change: the middle product invoice went from €635 in 2024 to
   €271 in 2026. He charges per photo, so this is order size, not price. */
/* The median invoice per type, as a table: a column per year, so a year's
   figures line up down the page instead of being read along a sentence
   ("'24 €635 · '25 €546 · '26 €271", which he found hard to read). */
function rateTable(trend, st, yr) {
  const years = [...new Set([].concat(...trend.map(r => r.years.map(x => x.y))))].sort();
  return `<table class="rtab"><thead><tr><th>Median invoice</th>${years.map(y => `<th>${y}</th>`).join('')}<th>Change</th></tr></thead><tbody>` +
    trend.map(r => `<tr><td>${esc(shortType(r.type))}</td>${years.map(y => {
      const x = r.years.find(z => z.y === y);
      if (!x) return '<td class="nil">\u2013</td>';
      const low = st && st.minInv && y === yr && x.med < st.minInv;
      return `<td${low ? ' class="exp"' : ''}>${fmt0(x.med)}<small>${x.n}</small></td>`;
    }).join('')}<td class="chg">${r.change == null ? ''
      : (r.change < 0 ? '\u2212' : '+') + Math.round(Math.abs(r.change) * 100) + '%'}</td></tr>`).join('') +
    `</tbody></table>`;
}

function rateTrend() {
  const by = {};
  (data.photo || []).forEach(i => {
    const t = String(i.category || '').trim(), y = String(i.issued || '').slice(0, 4);
    if (!t || !y) return;
    const c = ((by[t] = by[t] || {})[y] = by[t][y] || { n: 0, sum: 0, a: [] });
    c.n++; c.sum += i.amount_eur; c.a.push(i.amount_eur);
  });
  return Object.keys(by).map(t => {
    const years = Object.keys(by[t]).sort().map(y => ({ y, n: by[t][y].n, med: median(by[t][y].a) }));
    const solid = years.filter(x => x.n >= 2);
    const a = solid[0], b = solid[solid.length - 1];
    return { type: t, years, n: years.reduce((s, x) => s + x.n, 0),
      change: a && b && a !== b ? (b.med - a.med) / a.med : null };
  }).sort((a, b) => b.n - a.n);
}

/* Who comes back. Four repeat clients carried 68% of all billing at about
   €3,850 each; thirty one-off clients averaged €242. */
function clientMix(now) {
  now = now || today();
  const by = {};
  (data.photo || []).forEach(i => {
    const k = i.client || '—';
    const c = (by[k] = by[k] || { name: k, n: 0, sum: 0, first: i.issued, last: i.issued });
    c.n++; c.sum += i.amount_eur;
    if (i.issued < c.first) c.first = i.issued;
    if (i.issued > c.last) c.last = i.issued;
  });
  const all = Object.values(by), total = all.reduce((a, c) => a + c.sum, 0);
  const rep = all.filter(c => c.n >= 2), one = all.filter(c => c.n < 2);
  const avg = l => (l.length ? l.reduce((a, c) => a + c.sum, 0) / l.length : 0);
  // The middle client, for the step's figure: one big regular (Фешън Лаб,
  // €12,645 of four regulars' €15,421) would otherwise speak for all four.
  const med = l => median(l.map(c => c.sum));
  const cut = new Date(new Date(now + 'T12:00') - 180 * 864e5).toISOString().slice(0, 10);
  const quiet = rep.filter(c => c.last < cut).map(c => Object.assign({}, c, {
    perYear: c.sum / Math.max(1, (new Date(c.last) - new Date(c.first)) / 365 / 864e5) }));
  return { total, rep, one, repAvg: avg(rep), oneAvg: avg(one), repMed: med(rep), oneMed: med(one),
    repShare: total ? rep.reduce((a, c) => a + c.sum, 0) / total : 0, quiet };
}

/* Billing by calendar month, averaged over the years that month was inside
   the records. Jan, Feb and Sep fall below the floor every year. */
function monthAvg(now) {
  now = now || today();
  const live = (data.photo || []).filter(i => i.issued);
  const first = live.map(i => i.issued).sort()[0];
  if (!first) return [];
  const sums = new Array(12).fill(0), yrs = new Array(12).fill(0);
  live.forEach(i => { sums[+i.issued.slice(5, 7) - 1] += i.amount_eur; });
  // A month counts for a year only when it is complete and inside the records.
  for (let ym = first.slice(0, 7); ym < now.slice(0, 7); ym = ymAdd(ym, 1)) yrs[+ym.slice(5, 7) - 1]++;
  return MONTHS.map((m, i) => ({ m: i, label: m, avg: yrs[i] ? sums[i] / yrs[i] : 0, years: yrs[i] }));
}

/* Euro per hour, from the clock. Revenue for a booking is its invoice,
   split evenly over every booking that names that invoice (one Фешън Лаб
   invoice covers several shoots), or, for a shoot paid in cash, the price on
   the booking, marked as such. That is the ONLY place a booking's price is
   used as money, his call: for the hourly rate, never for a total.
   Net = revenue less the hours' share of the floor, where an hour carries
   the floor divided by the hours he logs in an average month (the last
   three months that have any). */
function hourRates(st) {
  const time = (data.time || []).filter(s => s.start);
  if (!time.length) return null;
  const inv = {}, onInv = {};
  (data.live || []).forEach(i => { inv[String(i.no).trim()] = i; });
  (data.bookings || []).forEach(b => { const n = String(b.invoice || '').trim(); if (n) onInv[n] = (onInv[n] || 0) + 1; });
  const hrs = {};
  time.forEach(s => { hrs[s.job] = (hrs[s.job] || 0) + sessLen(s) / 3600e3; });
  const perMonth = {};
  time.forEach(s => { const m = localDT(s.start).slice(0, 7); perMonth[m] = (perMonth[m] || 0) + sessLen(s) / 3600e3; });
  const recent = Object.keys(perMonth).sort().slice(-3);
  const avgHrs = recent.reduce((a, m) => a + perMonth[m], 0) / Math.max(1, recent.length);
  const perHour = st && avgHrs ? st.need / avgHrs : 0;
  const types = {};
  let waiting = 0, cashN = 0;
  (data.bookings || []).forEach(b => {
    const h = hrs[b.id];
    if (!h) return;
    const n = String(b.invoice || '').trim();
    let rev = null, cash = false;
    if (n && inv[n]) rev = inv[n].amount_eur / onInv[n];
    else if (!n && b.paid && Number(b.price)) { rev = Number(b.price); cash = true; }
    if (rev == null) { waiting++; return; }
    if (cash) cashN++;
    const t = shortType(String(b.type || '').trim() || 'No type');
    const c = (types[t] = types[t] || { type: t, rev: 0, h: 0, jobs: 0, cash: 0 });
    c.rev += rev; c.h += h; c.jobs++; if (cash) c.cash++;
  });
  const rows = Object.values(types).map(c => Object.assign(c, {
    gross: c.rev / c.h, net: (c.rev - c.h * perHour) / c.h })).sort((a, b) => b.net - a.net);
  return { rows, waiting, cashN, perHour, avgHrs };
}

/* What to do next, each with what it is worth in euro, biggest first.
   There is no "charge your old rate" step: he charges per photo, so a
   smaller invoice is a smaller order, not a lower price (26 Oct 2026). A
   per-photo rate needs the count on the invoice, which he now writes. */
function nextSteps(st, now) {
  now = now || today();
  const yr = now.slice(0, 4), out = [], watch = [];
  if (st && st.minInv) {
    const small = (data.photo || []).filter(i => String(i.issued || '').startsWith(yr) && i.amount_eur < st.minInv);
    if (small.length) out.push({ eur: small.reduce((a, i) => a + st.minInv - i.amount_eur, 0),
      text: `<b>Bundle or re-price work under ${fmt0(st.minInv)}.</b> That is the share of what photography has to cover
        that one invoice must carry at ${st.perMonth.toFixed(1)} invoices a month. ${small.length} invoice${small.length === 1 ? ' was' : 's were'} under it
        this year; a month of small jobs on one invoice counts as one.` });
    const thin = monthAvg(now).filter(m => m.years >= 2 && m.avg < st.need);
    if (thin.length) out.push({ eur: thin.reduce((a, m) => a + st.need - m.avg, 0),
      text: `<b>Book ${thin.map(m => fullMonths[m.m]).join(', ')} ahead.</b> They bill less than the ${st ? fmt0(st.need) : ''} photography has to cover,
        year after year (${thin.map(m => m.label + ' ' + fmt0(m.avg)).join(', ')}).` });
  }
  const mix = clientMix(now);
  if (mix.rep.length && mix.one.length && mix.repMed > mix.oneMed) out.push({ eur: mix.repMed - mix.oneMed,
    text: `<b>Turn one new client into a regular.</b> A typical client who came back has billed
      ${fmt0(mix.repMed)} so far; a typical one who came once, ${fmt0(mix.oneMed)}.` });
  if (mix.quiet.length) out.push({ eur: mix.quiet.reduce((a, c) => a + c.perYear, 0),
    text: `<b>Call ${mix.quiet.map(c => esc(c.name)).join(', ')}.</b> Regular${mix.quiet.length === 1 ? '' : 's'}
      with nothing booked for six months; that is roughly what they bill in a year.` });
  const yrInv = (data.photo || []).filter(i => String(i.issued || '').startsWith(yr));
  const yrSum = yrInv.reduce((a, i) => a + i.amount_eur, 0), byC = {};
  yrInv.forEach(i => { byC[i.client] = (byC[i.client] || 0) + i.amount_eur; });
  const top = Object.entries(byC).sort((a, b) => b[1] - a[1])[0];
  if (top && yrSum && top[1] / yrSum > 0.4) watch.push(`<b>${esc(top[0])} is ${Math.round(top[1] / yrSum * 100)}% of
    this year's billing.</b> If it stopped, ${fmt0(top[1])} a year would go with it, against a floor of ${fmt0(st ? st.floor * 12 : 0)} a year.`);
  const lags = (data.live || []).filter(i => i._paid && i.issued)
    .map(i => (new Date(i._paid.row.d) - new Date(i.issued)) / 864e5).sort((a, b) => a - b);
  if (lags.length >= 5) {
    const med = lags[Math.floor(lags.length / 2)];
    if (med <= 7) watch.push(`<b>Chasing payments is worth nothing.</b> Clients pay a median ${Math.max(0, Math.round(med))}
      day${Math.round(med) === 1 ? '' : 's'} after the invoice.`);
  }
  return { steps: out.sort((a, b) => b.eur - a.eur), watch };
}

function standCard(st) {
  if (!st) return '';
  const name = fullMonths[+st.cur.slice(5, 7) - 1];
  const over = st.inThis - st.floor, r3 = st.run3 - st.floor;
  const fb = FIXED.filter(k => st.fixedBy[k]).map(k => k.toLowerCase() + ' ' + fmt0(st.fixedBy[k])).join(' \u00b7 ');
  return `<div class="card stand">
    <div class="verdict">${over >= 0
      ? `<b>${name} has cleared the floor</b>, with ${fmt0(over)} to spare.`
      : `<b>${name} is ${fmt0(-over)} short of the floor</b>, with ${st.daysLeft} day${st.daysLeft === 1 ? '' : 's'} left.`}
      The last ${st.n3} months brought in ${fmt0(st.run3)} a month, ${fmt0(Math.abs(r3))} ${r3 >= 0 ? 'above' : 'below'} it.</div>
    <div class="arow tot"><span>The floor, every month</span><b>${fmt0(st.floor)}</b></div>
    <div class="arow od"><span>${fb}</span></div>
    ${st.rentIn ? `<div class="arow"><span>Studio rent coming in</span><b class="inc">${fmt0(st.rentIn)}</b></div>
    <div class="arow"><span>Left for photography to cover</span><b>${fmt0(st.need)}</b></div>` : ''}
    <div class="arow"><span>In this month</span><b class="${over >= 0 ? 'inc' : 'exp'}">${fmt0(st.inThis)}</b></div>
    <div class="arow"><span>Average, last ${st.n3} months</span><b>${fmt0(st.run3)}</b></div>
    ${st.avgInv ? `<div class="arow"><span>Photography invoices a month to cover it, at ${fmt0(st.avgInv)} each</span><b>${(st.need / st.avgInv).toFixed(1)}</b></div>` : ''}
    <div class="arow"><span>Taken out for you in ${st.yr}</span><b>${fmt0(st.taken)}</b></div>
    <div class="note2">The floor is what the company pays before anything is yours: averaged over the last
      ${st.months} complete months, from the bank.${st.rentIn ? ' In this month counts everything that came in, studio rent included.' : ''}${st.lastDraw ? ` You last took money out on ${dshort(st.lastDraw)}.` : ''}</div>
  </div>`;
}

function nextCard(st) {
  const n = nextSteps(st), h = hourRates(st);
  const hours = h
    ? (h.rows.length
      ? `<div class="chh">An hour of each, after fixed costs</div>
         ${Charts.bars(h.rows.map(r => [r.type + ' \u00b7 ' + r.jobs + ' job' + (r.jobs === 1 ? '' : 's') +
           (r.cash ? ', ' + r.cash + ' cash' : '') + ' \u00b7 ' + Math.round(r.h) + 'h', r.net]),
           v => (v < 0 ? '\u2212' : '') + fmt0(v) + '/h')}
         <div class="note2">Net is what an hour leaves after its share of the floor, ${fmt0(h.perHour)} an hour at the
           ${h.avgHrs.toFixed(0)} hours you log in a month.${h.cashN ? ' Cash jobs use the price on the booking.' : ''}
           ${h.waiting ? ` ${h.waiting} timed job${h.waiting === 1 ? '' : 's'} wait${h.waiting === 1 ? 's' : ''} for an invoice before ${h.waiting === 1 ? 'it counts' : 'they count'}.` : ''}</div>`
      : `<div class="note2">${h.waiting} timed job${h.waiting === 1 ? '' : 's'}, none invoiced or paid yet. Euro per hour starts with the first.</div>`)
    : `<div class="note2">Time your jobs on the Jobs tab and this card ranks your work by what an hour of it earns.
        Until then, it ranks by what an invoice is worth.</div>`;
  return `<div class="card nx">
    <div class="chh">What to do next</div>
    ${n.steps.length ? n.steps.map(s => `<div class="arow"><span>${s.text}</span><b class="inc">+${fmt0(s.eur)}</b></div>`).join('')
      : '<div class="empty">Nothing stands out.</div>'}
    ${n.watch.map(w => `<div class="arow"><span>${w}</span></div>`).join('')}
    <div class="note2">Each figure is what it is worth in a year, or for a client over time, worked out from your
      invoices and the bank each time the page loads.</div>
    ${hours}
  </div>`;
}

function renderOverview() {
  const m = money(), y = byYear();
  const held = (data.balances || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const before = (data.balances || []).length ? Math.round((held - m.net) * 100) / 100 : 0;
  const open = data.live.filter(i => !i._paid);
  const st = standing();
  $('#view').innerHTML = standCard(st) + `
    <div class="card">
      ${Object.keys(y).sort().reverse().map(k => `<div class="arow"><b>${k}</b>` +
        `<span>in ${fmt0(y[k].inn)} · out ${fmt0(y[k].out)} · billed ${fmt0(y[k].billed)}</span></div>`).join('')}
      <div class="note2"><b>In and out are the bank: what the company actually earned and spent.</b>
        Billed is what the invoices say. The two are never added together, and they do not have to agree:
        an invoice can be billed in one year and paid in the next.
        ${Math.abs(before) > 0.01 ? `<br><b>${fmt(before)} of what the accounts hold is older than these records</b>,
          which start ${dshort((data.tx || []).map(t => t.d).sort()[0] || '')}. In minus out comes to ${fmt(m.net)}.` : ''}</div>
    </div>
    <div class="card">
      <div class="arow tot"><b>Invoices</b><b>${data.live.length}</b></div>
      <div class="arow"><span>Matched to a payment in the bank</span><b class="inc">${data.live.length - open.length}</b></div>
      <div class="arow"><span>Not matched</span><b>${open.length}</b></div>
      <div class="note2">Not matched is not the same as unpaid: cash, a payment bundled with others, or an
        amount that differs by a cent all land here. Check them rather than chase them.</div>
    </div>` + charts(st) + nextCard(st);
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

/* Who to call: contact name, phone and email per client (Biz_Clients),
   keyed on the client's name exactly as the invoices spell it. */
let clientEdit = null;
const clientInfo = name => (data.clients || []).find(c => c.name.toLowerCase() === String(name).trim().toLowerCase());

function renderClients() {
  const by = {};
  data.live.forEach(i => {
    const k = i.client || '\u2014';
    (by[k] = by[k] || { n: 0, sum: 0, open: 0, last: '', rent: rentShare(i) });
    by[k].n++; by[k].sum += i.amount_eur;
    if (!i._paid) by[k].open += i.amount_eur;
    if (i.issued > by[k].last) by[k].last = i.issued;
  });
  $('#view').innerHTML = `<div class="card">${Object.entries(by).sort((a, b) => b[1].sum - a[1].sum)
    .map(([name, v]) => {
      const c = clientInfo(name) || {};
      const reach = [c.contact ? esc(c.contact) : '',
        c.phone ? `<a href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">${esc(c.phone)}</a>` : '',
        c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''].filter(Boolean).join(' \u00b7 ');
      return `<div class="inv"><b>${esc(name)}</b><span class="amt">${fmt(v.sum)}</span>
      <span class="svc">${v.n} invoice${v.n > 1 ? 's' : ''} \u00b7 last ${dshort(v.last)}${reach ? '<br>' + reach : ''}${c.note ? '<br>' + esc(c.note) : ''}</span>
      <span class="st">${v.rent ? '<span class="tag">studio rent</span> ' : ''}${v.open > 0.01 ? `<span class="tag owed">${fmt(v.open)} unmatched</span> ` : ''}<button
        class="mk" data-act="cedit" data-n="${esc(name)}">${reach || c.note ? 'Edit contact' : 'Add contact'}</button></span>
      ${clientEdit === name ? clientForm(name, c) : ''}</div>`;
    }).join('')}</div>`;
}

function clientForm(name, c) {
  const v = k => esc(c[k] || '');
  return `<div class="bkf cf">
    <label class="wide">Point of contact<input id="cContact" autocomplete="off" value="${v('contact')}"></label>
    <label>Phone<input id="cPhone" type="tel" autocomplete="off" value="${v('phone')}"></label>
    <label>Email<input id="cEmail" type="email" autocomplete="off" value="${v('email')}"></label>
    <label class="wide">Note<input id="cNote" autocomplete="off" value="${v('note')}"></label>
    <button class="go" data-act="csave">Save</button>
    <button class="go ghost" data-act="ccancel">Leave it</button>
    <div class="note2" id="cMsg"></div></div>`;
}

async function saveClient() {
  const v = id => (($('#' + id) || {}).value || '').trim();
  const q = { name: clientEdit, contact: v('cContact'), phone: v('cPhone'), email: v('cEmail'), note: v('cNote') };
  $('#cMsg').textContent = 'Saving…';
  try {
    const j = await api('&biz=setclient&' + Object.keys(q).map(k => k + '=' + encodeURIComponent(q[k])).join('&'));
    if (!j.ok) throw new Error(j.error || 'failed');
    data.clients = (data.clients || []).filter(c => c.name.toLowerCase() !== q.name.toLowerCase()).concat([j.client]);
    clientEdit = null; keep(); render();
  } catch (e) { $('#cMsg').textContent = 'Could not save: ' + e.message; }
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
  if (a === 'jadd') { addJob(); return; }
  if (a === 'tstart') { timeStart(b.dataset.j || (($('#tJob') || {}).value) || timePick, b.dataset.p); return; }
  if (a === 'tstop') { timeStop(); return; }
  if (a === 'tedit') { timeEdit = b.dataset.id; render(); return; }
  if (a === 'tcancel') { timeEdit = null; render(); return; }
  if (a === 'tsave') { timeSave(); return; }
  if (a === 'tdel') { timeDel(b.dataset.id); return; }
  if (a === 'cedit') { clientEdit = clientEdit === b.dataset.n ? null : b.dataset.n; render(); return; }
  if (a === 'ccancel') { clientEdit = null; render(); return; }
  if (a === 'csave') { saveClient(); return; }
  if (a === 'jedit') { jobEdit = b.dataset.id; render(); window.scrollTo(0, 0); return; }
  if (a === 'jcancel') { jobEdit = null; render(); return; }
  if (a === 'jdone') { setJob(b.dataset.id, 'delivered', today()); return; }
  if (a === 'jcash') { setJob(b.dataset.id, 'paid', today()); return; }
  if (a === 'cashok') { cashConfirm(b.dataset.dep, b.dataset.d, b.dataset.ids); return; }
  if (a === 'cashno') { cashSkip.push(b.dataset.dep); render(); return; }
  if (a === 'jdel') { delJob(b.dataset.id); return; }
  if (a === 'jinv') {
    const j = (data.bookings || []).find(x => x.id === b.dataset.id);
    const v = prompt('Which invoice number is this shoot on?', (j && j.invoice) || '');
    if (v != null) setJob(b.dataset.id, 'invoice', v.trim());
    return;
  }
  if (a === 'jfilter') { jobFilter = b.dataset.f; render(); return; }
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
// "+ new job" in the clock's list opens the booking form under it.
$('#view').addEventListener('change', e => {
  if (e.target.id !== 'tJob') return;
  if (e.target.value !== '__new') { timePick = e.target.value; return; }
  e.target.value = timePick;
  const f = document.querySelector('.addj');
  if (f) { f.open = true; f.scrollIntoView({ behavior: 'smooth' }); const c = $('#jClient'); if (c) c.focus(); }
});
// The running clock. Only the figure changes, so nothing else is redrawn.
// unref: in Node (the checks) a bare interval would keep the process alive.
const tickT = setInterval(() => {
  const el = document.getElementById('tclock'), r = data && running();
  if (el && r) el.textContent = clock(nowMs() - r.start);
}, 1000);
if (tickT && tickT.unref) tickT.unref();
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = ''; load();
});
/* index.html carries no version of its own, so a browser can serve a cached
   copy of it beside a fresh app.js. When that cached copy predates a shared
   file, the page used to die on the first line that touched it and render
   nothing at all. Now it fetches whatever is missing and carries on. */
function boot() {
  const need = { Invoices: 'invoices.js', Year: 'year.js', Charts: 'charts.js', CatPick: 'catpick.js' };
  const missing = Object.keys(need).filter(k => !window[k]);
  if (!missing.length) return load();
  let left = missing.length;
  missing.forEach(k => {
    const s = document.createElement('script');
    s.src = '../shared/' + need[k];
    s.onload = s.onerror = () => { if (!--left) load(); };
    document.head.appendChild(s);
  });
}
boot();
})();
