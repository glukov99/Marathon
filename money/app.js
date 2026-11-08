/* Money page. Reads bank data from the Apps Script Money API (token mt, kept in this browser only).
   Rules: money in = income, money out = expense. Own-account moves (Transfer, Savings, gift fund top-ups) are not counted.
   Flexible Cash Funds: moves in/out are transfers; only the interest (net of fees, from the statement) is income. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-money-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n, cur) => (cur === 'GBP' ? '£' : '€') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sfmt = (n, cur) => (n < 0 ? '−' : '') + fmt(n, cur);
const donut = (list, total) => Charts.donut(list, total);
const MON = m => new Date(m + '-01T12:00').toLocaleDateString('en-GB', { month: 'short' });
let data = null, month = null, owner = 'All', tab = 'accounts', statKind = 'exp', drill = null, yearCat = null, yearCell = null, yearKind = 'exp';
const OWNERS = ['All', 'Personal', 'Joint'];
// money/#budget opens that tab, so a home-screen link or shortcut can go straight there.
{ const h = typeof location !== 'undefined' ? location.hash.slice(1) : ''; if (['accounts', 'daily', 'monthly', 'stats', 'budget', 'business'].includes(h)) tab = h; }
// The company is a separate entity, so it gets its own tab rather than being a
// filter over personal money. "All" above never includes it.
const businessRows = () => data.tx.filter(t => t.own === 'Business');

const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
const setStatus = s => { $('#status').textContent = s; };
function show(id) {
  $('#setup').classList.toggle('hidden', id !== 'setup');
  $('#main').classList.toggle('hidden', id !== 'main');
}

// A small bank mark in front of each account, so the list is easy to scan.
// The bank name comes from the API; a payload cached before that fall backs to
// the label, where only UniCredit and the company account are not Revolut.
const BANKS = [[/unicredit/i, 'uni', 'UC'], [/revolut/i, 'rev', 'R'], [/mypos/i, 'mps', 'mP']];
/* A balance the bank would not give us. Only a lapsed consent needs Georgi to
   do anything; a 429 is the daily cap on balance requests and clears by itself,
   so it must not wear the same red dot. The figure beside it is the last good
   reading either way. */
/* A figure nobody can refresh automatically goes quietly wrong. The credit
   card's balance, myPOS and the cash fund are all kept by hand, so each says
   how old it is and shouts once it is past a month. */
function ageNote(a) {
  if (!a.est || !a.as_of) return '';
  const days = Math.floor((Date.now() - new Date(a.as_of + (a.as_of.length === 10 ? 'T12:00' : '')).getTime()) / 864e5);
  if (isNaN(days)) return '';
  const when = new Date(a.as_of + (a.as_of.length === 10 ? 'T12:00' : ''))
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return ` <small class="asof${days > 31 ? ' warn' : ''}">by hand, ${when}${days > 31 ? ', check it' : ''}</small>`;
}

function warnDot(a) {
  // Red only when we KNOW the consent has gone. A rate limit, a bank having a
  // bad morning, or a payload cached before the reason was recorded all mean
  // "the last reading is what you are looking at", not "go and re-approve".
  const act = a.why === 'reapprove';
  const seen = a.as_of ? ' · last read ' + new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
  const why = act ? 'Needs re-approval'
    : a.why === 'capped' ? 'The bank capped today\u2019s balance requests'
    : a.why === 'bank down' ? 'The bank did not answer'
    : 'Could not read the balance just now';
  return ` <span class="rdot${act ? '' : ' soft'}" title="${why}${seen}"></span>`;
}

function bankMark(a) {
  const name = a.bank || (/^UniCredit|^GL Studio/.test(a.account || '') ? 'UniCredit Bulbank' : 'Revolut');
  const hit = BANKS.find(([re]) => re.test(name));
  return hit ? `<span class="bk ${hit[1]}" title="${esc(name)}">${hit[2]}</span>` : '';
}

// One place decides what each row is.
function classify(t) {
  if (t._fund) return { k: 'inc', cat: 'Interest' };
  const ct = (t.cat || '').trim(), cn = ct.toLowerCase();
  if (t.acc === 'Gifts') {
    if (t.a > 0 || cn === 'transfer') return { k: 'move', cat: 'Gift fund' };
    return { k: 'exp', cat: 'Gifts' };
  }
  if (cn === 'transfer') return { k: 'move', cat: 'Transfer' };
  if (cn === 'savings') return { k: 'save', cat: 'Savings' };
  if (t.a > 0) return { k: 'inc', cat: cn === 'income' ? 'Income' : ct || 'Uncategorised' };
  return { k: 'exp', cat: ct || 'Uncategorised' };
}
// Fund interest: one income row per month from the statement, only for months the bank data covers.
function fundRows(j) {
  const f = j.fund; if (!f || !f.interest || !j.tx.length) return [];
  const first = j.tx.reduce((m, t) => (t.d < m ? t.d : m), j.tx[0].d).slice(0, 7);
  return f.interest.filter(([m]) => m >= first).map(([m, a]) => {
    const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
    const d = m === f.statement_date.slice(0, 7) ? f.statement_date : m + '-' + String(last).padStart(2, '0');
    return { d, a, c: 'EUR', acc: 'Flexible Cash Funds', own: 'Personal', cat: 'Interest',
      who: 'Flexible Cash Funds', desc: 'Interest after fees', note: '', _fund: true };
  });
}
// Estimated fund balance: statement balance + bank moves into/out of the fund after the cutoff.
function fundBalance(j) {
  const f = j.fund; if (!f) return null;
  const moves = j.tx.filter(t => !t._fund && t.c === 'EUR' && (t.cat || '').trim().toLowerCase() === 'savings' && t.d > f.bank_cutoff)
    .reduce((a, t) => a - t.a, 0);
  return Math.round((f.balance + moves) * 100) / 100;
}
function prep(j) {
  j.tx = j.tx.filter(t => !t._fund).concat(fundRows(j)).sort((x, y) => (x.d < y.d ? 1 : -1));
  j.tx.forEach(t => { const c = classify(t); t._k = c.k; t._cat = c.cat; }); return j; }
// "All" means Georgi's own money: Personal plus Joint. The business account is
// a separate legal entity, so it only shows under its own filter.
const mine = () => data.tx.filter(t => owner === 'All' ? t.own !== 'Business' : t.own === owner);
function totals(rows, cur) {
  let inc = 0, exp = 0;
  rows.forEach(t => {
    if (t.c !== (cur || 'EUR')) return;
    if (t._k === 'inc') inc += t.a; else if (t._k === 'exp') exp -= t.a;
  });
  return { inc, exp, net: inc - exp };
}
// Stats, the donut and the fund rows are about EUR only. GBP has its own line.
const eur = rows => rows.filter(t => t.c === 'EUR');

async function load() {
  const url = apiUrl(), tok = token();
  if (!url) {
    show('setup');
    $('#setupMsg').textContent = 'Set up the Intervals.icu sync on the Training page first. Money uses the same Apps Script URL.';
    return;
  }
  if (!tok) { show('setup'); return; }
  try { const c = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (c) { data = prep(c); render(); } } catch (e) {}
  setStatus('Loading…');
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=money&mt=' + encodeURIComponent(tok));
    const j = await r.json();
    if (!j.ok) {
      if (j.error === 'unauthorised') { forget(); $('#setupMsg').textContent = 'The token was wrong. Paste it again.'; return; }
      throw new Error(j.error || 'unknown error');
    }
    try { localStorage.setItem(CKEY, JSON.stringify(j)); } catch (e) {}
    data = prep(j);
    setStatus('Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    render();
  } catch (e) {
    setStatus(data ? 'Offline: showing saved data' : 'Could not load: ' + e.message);
  }
}
/* Tapping a transaction sets its category by hand. It writes column M through
   the API, which always wins over a rule, so the choice survives every redo.
   The row is updated here as well, so the screen does not wait for a reload. */
let cats = null;
async function setCat(key) {
  const t = data.tx.find(x => x.k === key);
  if (!t) return;
  if (!cats) {
    try {
      const r = await fetch(apiUrl() + '?action=money&cats=go&mt=' + encodeURIComponent(token()));
      cats = (await r.json()).cats || [];
    } catch (e) { cats = [...new Set(data.tx.map(x => x._cat).filter(Boolean))]; }
  }
  CatPick.open({
    cats, current: t.cat, title: t.who || t.desc || 'Category',
    note: `${t.d} · ${sfmt(t.a, t.c)} · ${t.acc}`,
    onPick: async cat => {
      setStatus('Saving…');
      try {
        const r = await fetch(apiUrl() + '?action=money&mt=' + encodeURIComponent(token()) +
          '&setcat=' + encodeURIComponent(key) + '&cat=' + encodeURIComponent(cat));
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'failed');
        t.cat = j.now; t.mine = !!cat;
        const k = classify(t); t._k = k.k; t._cat = k.cat;
        if (cat && cats.indexOf(cat) < 0) cats.push(cat);
        try { localStorage.setItem(CKEY, JSON.stringify(data)); } catch (e) {}
        setStatus(cat ? 'Set to ' + cat : 'Back to the rules');
        render();
      } catch (e) { setStatus('Could not save: ' + e.message); }
    }
  });
}

function forget() {
  try { localStorage.removeItem(TKEY); localStorage.removeItem(CKEY); } catch (e) {}
  data = null; show('setup');
}

// On the Budget tab a month exists once its salary is in, even before the 1st.
function allMonths() {
  const ms = new Set(data.tx.map(t => t.d.slice(0, 7)));
  if (tab === 'budget' && window.Budget) Budget.salaryMonths(data.tx, bset).forEach(m => ms.add(m));
  return [...ms].sort().reverse();
}

function render() {
  show('main');
  const months = allMonths();
  if (!month || !months.includes(month)) month = months[0];
  const year = month.slice(0, 4);
  const yearly = tab === 'monthly';
  const i = months.indexOf(month);
  $('#mLabel').textContent = yearly ? year
    : new Date(month + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  $('#mPrev').disabled = yearly ? !months.some(m => m.slice(0, 4) < year) : i >= months.length - 1;
  $('#mNext').disabled = yearly ? !months.some(m => m.slice(0, 4) > year) : i <= 0;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
  document.querySelectorAll('#own button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.o === owner)));

  const period = (tab === 'business' ? businessRows() : mine())
    .filter(t => t.d.startsWith(yearly ? year : month));
  const s = totals(period), g = totals(period, 'GBP');
  // On a year, every figure also gets what it is a month, over the months that
  // actually hold data. That is the number to plan with.
  const nm = yearly ? new Set(period.map(t => t.d.slice(0, 7))).size : 0;
  const av = v => (nm > 1 ? `<i>${fmt(v / nm)} a month</i>` : '');
  $('#sum').innerHTML =
    `<div><span>Income</span><b class="inc">${fmt(s.inc)}</b>${av(s.inc)}</div>` +
    `<div><span>Expenses</span><b class="exp">${fmt(s.exp)}</b>${av(s.exp)}</div>` +
    `<div><span>Total</span><b>${sfmt(s.net)}</b>${av(s.net)}</div>` +
    (g.inc || g.exp
      ? `<div class="g"><span>GBP in</span><b class="inc">${fmt(g.inc, 'GBP')}</b></div>` +
        `<div class="g"><span>GBP out</span><b class="exp">${fmt(g.exp, 'GBP')}</b></div>` +
        `<div class="g"><span>GBP total</span><b>${sfmt(g.net, 'GBP')}</b></div>`
      : '');

  const hasBusiness = businessRows().length > 0;
  const bTab = document.querySelector('#tabs button[data-t="business"]');
  if (bTab) bTab.hidden = !hasBusiness;
  const nTabs = [...document.querySelectorAll('#tabs button')].filter(b => !b.hidden).length;
  $('#tabs').classList.toggle('five', nTabs === 5);
  $('#tabs').classList.toggle('six', nTabs >= 6);
  if (!hasBusiness && tab === 'business') tab = 'accounts';

  if (tab === 'business') renderBusiness(period);
  else if (tab === 'budget') renderBudget();
  else if (tab === 'daily') renderDaily(period);
  else if (tab === 'monthly') renderMonthly(year);
  else if (tab === 'stats') drill ? renderDrill(period) : renderStats(period);
  else renderAccounts(period);
}

// ===== Daily =====
function rowHtml(t) {
  const cls = t._k === 'inc' ? 'inc' : t._k === 'exp' ? 'exp' : 'mv';
  const title = t.who || t.desc || '—';
  const sub = [t.acc, t.note].filter(Boolean).map(esc).join(' · ');
  return `<div class="tr" data-k="${esc(t.k)}"><div class="tc${t.mine ? ' mine' : ''}">${esc(t._cat)}</div>
    <div class="tb"><b>${esc(title)}</b><span>${sub}</span></div>
    <div class="ta ${cls}">${t._k === 'exp' || t._k === 'inc' ? fmt(t.a, t.c) : sfmt(t.a, t.c)}</div></div>`;
}
function dayList(rows) {
  const days = {};
  rows.forEach(t => (days[t.d] = days[t.d] || []).push(t));
  const keys = Object.keys(days).sort().reverse();
  if (!keys.length) return '<div class="empty">No transactions.</div>';
  return keys.map(d => {
    const s = totals(days[d]);
    const dt = new Date(d + 'T12:00');
    return `<div class="day"><div class="dh"><b>${dt.getDate()}</b><span class="dw">${dt.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
      <span class="inc">${s.inc ? fmt(s.inc) : ''}</span><span class="exp">${s.exp ? fmt(s.exp) : ''}</span></div>
      ${days[d].map(rowHtml).join('')}</div>`;
  }).join('');
}
/* Card payments the bank has not booked yet. They sit in data.pending, never in
   data.tx, so no total, chart or year figure can count them. Shown on the newest
   month only, greyed, without a category, and not tappable (no data-k). */
function pendingHtml() {
  const pd = data.pending || {};
  const p = (pd.tx || []).filter(t => (owner === 'All' ? t.own !== 'Business' : t.own === owner));
  if (!p.length || month !== allMonths()[0]) return '';
  const day = d => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const at = pd.at ? ' · as of ' + new Date(pd.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  return `<div class="day pend"><div class="dh"><b>Pending</b><span class="dw">not booked yet, not counted${at}</span></div>
    ${p.map(t => `<div class="tr"><div class="tc">Pending</div>
      <div class="tb"><b>${esc(t.who || t.desc || '—')}</b><span>${[t.acc, t.d && day(t.d)].filter(Boolean).map(esc).join(' · ')}</span></div>
      <div class="ta mv">${sfmt(t.a, t.c)}</div></div>`).join('')}</div>`;
}
function renderDaily(rows) { $('#view').innerHTML = pendingHtml() + dayList(rows); }

// ===== Monthly =====
function renderMonthly(year) {
  const rows = mine();
  const d = Year.data(eur(rows), year);
  const prev = Year.data(eur(rows), String(+year - 1));
  const story = Year.story(d, prev.total ? prev : null);
  const ms = allMonths().filter(m => m.startsWith(year));
  $('#view').innerHTML =
    (story.length ? `<div class="card story">${story.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : '') +
    `<div class="card">${Year.grid(d, { kind: yearKind, cat: yearCat, cell: yearCell,
      tx: eur(rows).filter(t => t.d.startsWith(year)), dayList })}</div>` +
    `<div class="card">` + ms.map(m => {
    const inMonth = rows.filter(t => t.d.startsWith(m));
    const s = totals(inMonth), g = totals(inMonth, 'GBP');
    const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
    return `<button class="mrow" data-act="month" data-m="${m}">
      <div><b>${MON(m)}</b><span>1.${+m.slice(5, 7)} – ${last}.${+m.slice(5, 7)}</span></div>
      <div class="r"><span class="inc">${fmt(s.inc)}</span><span class="exp">${fmt(s.exp)}</span>` +
      (g.inc || g.exp ? `<span class="gb">${sfmt(g.net, 'GBP')}</span>` : '') +
      `<span class="net">${sfmt(s.net)}</span></div>
    </button>`;
  }).join('') + `</div>`;
}

// ===== Year grid =====
// Categories down, months across, so a year reads in one screen instead of
// stepping back month by month. Pure computation here, HTML below, so the same
// numbers can be checked in Node (tools: money/year-check.js).
// ===== Stats =====
function catSums(rows, kind) {
  const m = {};
  eur(rows).filter(t => t._k === kind).forEach(t => { m[t._cat] = (m[t._cat] || 0) + Math.abs(t.a); });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function renderStats(rows) {
  const s = totals(rows);
  const list = catSums(rows, statKind);
  const total = list.reduce((a, [, v]) => a + v, 0);
  $('#view').innerHTML = `
    <div class="seg" id="sk"><button data-act="kind" data-k="inc" aria-pressed="${statKind === 'inc'}">Income ${fmt(s.inc)}</button>
    <button data-act="kind" data-k="exp" aria-pressed="${statKind === 'exp'}">Expenses ${fmt(s.exp)}</button></div>
    <div class="card">` + (list.length ? donut(list, total) + list.map(([k, v], i) => `
      <button class="crow" data-act="drill" data-c="${esc(k)}">
        <span class="pct"><i style="background:${Charts.PAL[i % Charts.PAL.length]}"></i>${Math.round(v / total * 100)}%</span>
        <b>${esc(k)}</b><span class="v">${fmt(v)}</span></button>`).join('')
      : '<div class="empty">Nothing this month.</div>') + `</div>`;
}

// ===== Category drill-down: trend + transactions =====
function trend(points) {
  const W = 340, H = 150, P = 26;
  const max = Math.max(1, ...points.map(p => p.v));
  const x = i => P + i * ((W - 2 * P) / Math.max(1, points.length - 1));
  const y = v => H - 30 - v / max * (H - 60);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="trend" aria-hidden="true">
    <polyline points="${line}" fill="none" stroke="var(--big)" stroke-width="2.5"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.v)}" r="${p.m === month ? 5 : 3.5}" fill="${p.m === month ? 'var(--ink)' : 'var(--big)'}"/>
      <text x="${x(i)}" y="${y(p.v) - 9}" text-anchor="middle" class="tv">${Math.round(p.v)}</text>
      <text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="tm">${MON(p.m)}</text>`).join('')}
  </svg>`;
}
function renderDrill(rows) {
  const ms = allMonths().filter(m => m <= month).slice(0, 7).reverse();
  const all = mine();
  const pts = ms.map(m => ({ m, v: eur(all).filter(t => t.d.startsWith(m) && t._k === statKind && t._cat === drill)
    .reduce((a, t) => a + Math.abs(t.a), 0) }));
  const list = eur(rows).filter(t => t._k === statKind && t._cat === drill);
  $('#view').innerHTML = `
    <div class="dhd"><button class="btn ghost" data-act="back">‹ Back</button><h3>${esc(drill)}</h3></div>
    <div class="card">${trend(pts)}</div>
    ${dayList(list)}`;
}

// ===== Business =====
// The company account. Same month switcher and the same day list as the rest of
// the page; the summary above already shows its own income and expenses,
// because render() hands this tab the business rows.
function renderBusiness(rows) {
  const b = data.balances && data.balances.accounts
    ? data.balances.accounts.filter(a => a.own === 'Business') : [];
  const bal = b.map(a => `<div class="arow"><span>${bankMark(a)}${esc(a.account)}${a.error ? warnDot(a) : ''}</span>` +
    `<span>${a.amount == null ? '—' : sfmt(a.amount, a.currency)}</span></div>`).join('');
  $('#view').innerHTML =
    (bal ? `<div class="card">${bal}</div>` : '') +
    `<div class="card"><div class="arow"><span>Rows this period</span><b>${rows.length}</b></div>
      <div class="note2">GL Studio 99 EOOD is a separate company, so it is never counted in your own income or expenses. Money it pays you shows as income on the personal side.</div></div>` +
    dayList(rows);
}

// The overdraft figure is our own constant, the agreed limit, while "available"
// comes from the bank. They do not add up, because part of the limit is taken
// (interest, a hold, a pending card payment). So show what is actually free:
// own money + free overdraft = available, which a reader can check.
function odRow(a) {
  const f = a.overdraft || a.credit;
  const free = (a.available != null && a.amount != null)
    ? Math.round((a.available - a.amount) * 100) / 100 : null;
  const limit = `${a.credit ? 'Credit limit' : 'Overdraft'} ${fmt(f.eur)} (${f.bgn.toLocaleString('en-GB')} лв)`;
  const left = free != null && Math.abs(free - f.eur) > 0.01
    ? `, ${fmt(free)} free` : '';
  return `<div class="arow od"><span>${limit}${left}</span>` +
    `<span>${a.available != null ? 'available ' + fmt(a.available) : ''}</span></div>`;
}

// UniCredit needs a manual approval about once a month. Show how old its data is.
function bankFresh() {
  const groups = [['UniCredit personal', 'personal', t => /^UniCredit/.test(t.acc)],
    ['GL Studio EOOD', 'business', t => t.acc === 'GL Studio EOOD']];
  return groups.map(([name, psu, f]) => {
    const ds = data.tx.filter(f).map(t => t.d).sort();
    if (!ds.length) return '';
    const last = ds[ds.length - 1];
    const age = Math.floor((Date.now() - new Date(last + 'T12:00')) / 864e5);
    const d = new Date(last + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    // The button is always there: a UniCredit session lasts about an hour, so a
    // fresh approval is the only way to read the accounts again, whatever the age.
    return `<div class="arow"><span>${name}: data up to ${d}${age > 30 ? ' <b class="warn">old</b>' : ` <small>(${age} days)</small>`}</span>` +
      `<button class="btn ghost" data-act="approve" data-bank="unicredit" data-psu="${psu}">Approve</button></div>`;
  }).join('');
}

/* Pull whatever the banks have had since the last sync, on demand.

   The daily trigger already does this each morning; this is for the evening
   when he has just spent something and wants to see it. Transactions first,
   because that is the half that works even when the balance endpoint is
   capped (a bank allows only a few balance reads a day, see bankMark/warnDot),
   and the result says plainly which half came back. */
async function syncNow(btn) {
  const url = apiUrl(), tok = token();
  if (!url || !tok) return;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = 'Checking…';
  const call = q => fetch(url + (url.includes('?') ? '&' : '?') +
    'action=money&mt=' + encodeURIComponent(tok) + q).then(r => r.json());
  try {
    const s = await call('&sync=go');
    if (!s.ok) throw new Error(s.error || 'the sync did not run');
    const b = await call('&balances=go').catch(() => null);
    const capped = b && b.accounts ? b.accounts.filter(a => a.why === 'capped').length : 0;
    const added = Number(s.added) || 0;
    setStatus((added ? added + ' new row' + (added === 1 ? '' : 's') : 'Nothing new') +
      ((s.skipped || []).length ? ', ' + s.skipped.length + ' account not read' : '') +
      (capped ? ', ' + capped + ' balance capped for today' : ''));
    await load();
  } catch (e) {
    setStatus('Could not check: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = was;
  }
}

// Starts a bank approval from this device. The bank app or page sends us back to
// the hub home page with the code, and that page finishes it by itself, so there
// is nothing to copy. One tap here, approve in the bank, done.
async function startApproval(bank, psu, btn) {
  const was = btn.textContent;
  btn.textContent = 'Opening…';
  btn.disabled = true;
  try {
    const r = await fetch(`${apiUrl()}?action=money&mt=${encodeURIComponent(token())}` +
      `&connect=start&bank=${encodeURIComponent(bank)}&psu=${encodeURIComponent(psu)}`);
    const j = await r.json();
    if (!j.ok || !j.url) throw new Error(j.error || 'no approval URL came back');
    location.href = j.url;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = was;
    setStatus('Could not start the approval: ' + e.message);
  }
}

// ===== Accounts =====
function renderAccounts(rows) {
  const b = data.balances;
  const accs = b && b.accounts ? b.accounts.slice() : [];
  const fb = fundBalance(data);
  if (fb != null) accs.push({ id: 'fund', account: 'Flexible Cash Funds', amount: fb, currency: 'EUR', est: true, bank: 'Revolut' });
  accs.sort((x, y) => Math.abs(y.amount || 0) - Math.abs(x.amount || 0));
  const tot = {};
  accs.filter(a => (owner === 'All' ? a.own !== 'Business' : !a.own || a.own === owner))
    .forEach(a => { if (a.amount != null) tot[a.currency] = (tot[a.currency] || 0) + a.amount; });
  const saved = -eur(rows).filter(t => t._k === 'save').reduce((a, t) => a + t.a, 0);
  const gift = rows.filter(t => t._k === 'move' && t.acc === 'Gifts').reduce((a, t) => a + t.a, 0);
  // When each consent was approved. The backend stamps this from 18 Oct 2026, so a
  // session approved before that has no time and is left out rather than guessed.
  const approved = (data.consents || []).filter(c => c.at && !isNaN(Date.parse(c.at))).map(c =>
    `<div class="arow"><span>${bankMark({ bank: c.bank })}${esc(c.bank)}${c.psu === 'business' ? ' business' : ''}: approved</span>` +
    `<span>${new Date(c.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('');
  let consent = '';
  if (data.consent_until) {
    const until = new Date(data.consent_until), days = Math.round((until - Date.now()) / 864e5);
    const d = until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    consent = days <= 21
      ? `<span class="warn">Revolut access ends in ${days} days (${d}).</span> <button class="btn ghost" data-act="approve" data-bank="revolut" data-psu="personal">Renew now</button>`
      : `Revolut access until ${d}.`;
  }
  $('#view').innerHTML = `
    <div class="card">
      ${Object.entries(tot).map(([c, v]) => `<div class="arow tot"><b>Total ${c}</b><b>${sfmt(v, c)}</b></div>`).join('')}
      ${accs.map(a => `<div class="arow${!a.amount ? ' zero' : ''}"><span>${bankMark(a)}${esc(a.account)}${ageNote(a)}${a.error ? warnDot(a) : ''}</span><span>${a.amount == null ? '—' : sfmt(a.amount, a.currency)}${a.error && a.as_of ? `<small class="asof">${new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>` : ''}</span></div>` +
        (a.overdraft || a.credit ? odRow(a) : '')).join('')}
      ${b ? `<div class="note2">As of ${new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>` : ''}
      ${data.fund ? `<div class="note2">Flexible Cash Funds: statement ${new Date(data.fund.statement_date + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} plus moves since. Interest after that date shows when a new statement is added.</div>` : ''}
    </div>
    <div class="card">
      <div class="arow"><span>Net into Flexible Cash Funds this month</span><b>${sfmt(saved)}</b></div>
      <div class="arow"><span>Interest from Flexible Cash Funds this month</span><b>${sfmt(rows.filter(t => t._fund).reduce((a, t) => a + t.a, 0))}</b></div>
      <div class="arow"><span>Net into gift fund this month</span><b>${sfmt(gift)}</b></div>
      <div class="note2">Moves between your own accounts are not counted as income or expenses. Only the fund interest is income.</div>
    </div>
    <div class="card">
      ${bankFresh()}
      <div class="arow"><span>Check the banks for anything new</span>
        <button class="btn ghost" data-act="sync" id="syncBtn">Check now</button></div>
      ${approved}
      <div class="note2">UniCredit sessions expire within hours. Approve personal, then business, and sync at least once a month. Each sync looks back 90 days, so nothing is lost.</div>
    </div>
    <div class="chips" id="own2">${OWNERS.map(o => `<button data-act="owner" data-o="${o}" aria-pressed="${o === owner}">${o}</button>`).join('')}</div>
    <p class="foot">${consent}</p>
    <p class="foot"><button class="btn ghost" data-act="forget">Forget token on this device</button></p>`;
}

// ===== Budget =====
// The envelopes live in shared/budget.js. Here: settings, and showing a month.
// Settings sync between devices through HubSync (Drive), like the other pages.
const BKEY = 'lifehub-budget';
let bset = null;
try { bset = JSON.parse(localStorage.getItem(BKEY) || 'null'); } catch (e) {}
function bSave(s) {
  bset = s;
  try { localStorage.setItem(BKEY, JSON.stringify(s)); } catch (e) {}
  if (window.HubSync) HubSync.push('budget', s);
}
const pbar = (have, target) => `<div class="pbar"><i style="width:${(target > 0 ? Math.max(0, Math.min(100, have / target * 100)) : 0).toFixed(1)}%"></i></div>`;
const brow = (label, val, sub) => `<div class="arow"><span>${label}${sub ? `<small class="bsub">${sub}</small>` : ''}</span><b>${val}</b></div>`;
const MLONG = m => new Date(m + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
function renderBudget() {
  const D = d => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  /* Card payments the bank has not booked yet. Ones with an amount have no
     category yet, so they come out of Fun until booked. UniCredit sends its
     unbooked card payments as "Card operation", date 0001-01-03, amount 0, so
     those can only be counted and flagged, not taken from a budget. */
  const allPend = ((data.pending || {}).tx || []).filter(t => t.own !== 'Business' && t.c === 'EUR');
  const pBlind = allPend.filter(t => !t.a || !/^20\d\d-/.test(t.d || '')).length;
  const R0 = Budget.run(data.tx, bset, month);
  const open = R0.cur.period.open;
  const pKnown = open ? allPend.filter(t => t.a < 0 && /^20\d\d-/.test(t.d) && t.d >= R0.cur.period.from) : [];
  // Payments added by hand (the bank hides them). The server drops each one the
  // moment a booked row of the same amount lands, so they never count twice.
  const handAll = data.manual || [];
  const hand = open ? handAll.filter(e => e.d >= R0.cur.period.from) : [];
  const extra = pKnown.concat(hand.map(e => ({ d: e.d, a: e.a, c: 'EUR', _cat: e.cat || '' })));
  const R = extra.length ? Budget.run(data.tx, bset, month, extra) : R0, s = R.s, c = R.cur, p = c.period;
  // For the home page's brief (8 Nov 2026): what is left in the day-to-day budgets, saved on this device.
  if (p.open) try { localStorage.setItem('lifehub-budget-now', JSON.stringify({ at: Date.now(), to: p.to,
    left: c.list.filter(l => l.kind === 'want' || l.kind === 'unassigned').map(l => [l.name, Math.round(l.available)]) })); } catch (e) {}
  const when = `${D(p.from)} – ${p.to ? D(p.to) : 'next salary'}`;
  const neg = v => (v < -0.004 ? 'exp' : '');
  $('#sum').innerHTML =
    `<div><span>Money in</span><b>${fmt(c.moneyIn)}</b><i>${when}</i></div>` +
    `<div><span>Spent</span><b class="exp">${fmt(c.spent)}</b>${c.pending ? `<i>${fmt(c.pending)} not booked yet</i>` : ''}</div>` +
    `<div><span>In budgets</span><b class="${c.total < 0 ? 'exp' : 'inc'}">${sfmt(c.total)}</b>${open && pBlind && !hand.length ? `<i>${pBlind} UniCredit payment${pBlind === 1 ? '' : 's'} still to come off</i>` : hand.length ? `<i>incl. ${hand.length} added by hand</i>` : ''}</div>`;

  // What happened to a budget this month, in one short line.
  const note = l => {
    const bits = [];
    if (l.kind === 'unassigned') bits.push(l.added ? 'money no goal needed this month' : 'every euro has a budget');
    else if (l.kind === 'savings') {
      bits.push(`${s.savePct}% of income`);
      if (l.spent > 0) bits.push(`${fmt(l.spent)} moved to savings`);
      if (l.spent < 0) bits.push(`${fmt(-l.spent)} taken back from savings`);
    } else {
      bits.push(l.mode === 'top' ? 'tops up to its goal' : l.target ? `${fmt(l.saved)} of ${fmt(l.target)} saved` : 'adds up month to month');
      if (l.spent) bits.push(`${fmt(l.spent)} spent`);
    }
    if (l.moved > 0) bits.push(`<span class="warn">${fmt(l.moved)} taken from others to cover overspending</span>`);
    if (l.moved < 0) bits.push(`${fmt(-l.moved)} given to cover overspending`);
    return bits.join(' · ');
  };
  const row = l => `<div class="env${l.kind === 'unassigned' ? ' un' : ''}"><span>${esc(l.name)}<small class="bsub">${note(l)}</small></span>` +
    `<b>${l.kind === 'unassigned' ? '—' : fmt(l.goal)}</b><b>${fmt(l.added)}</b><b class="${neg(l.available)}">${sfmt(l.available)}</b></div>` +
    (l.target ? pbar(l.saved, l.target) : '');
  const L = n => c.list.find(l => l.name === n);
  const wants = c.list.filter(l => l.kind === 'want');

  // Emergency fund, Leica, company: unchanged ideas, fed from the budgets.
  let ai = 0; for (let m = Budget.prev(month), i = 0; i < 3; i++, m = Budget.prev(m)) ai += Budget.sums(data.tx, Object.assign({}, s, { _starts: null }), m).income;
  const monthlySave = ai / 3 * s.savePct / 100;
  const accs = (data.balances && data.balances.accounts ? data.balances.accounts : []).slice();
  const fb = fundBalance(data);
  if (fb != null) accs.push({ account: 'Flexible Cash Funds', amount: fb, currency: 'EUR' });
  const em = Budget.emergency(s, accs, monthlySave);
  const lf = L(s.business.fund);
  const biz = Budget.businessSince(data.tx, s, s.start, month), bm = Budget.business(data.tx, s, month);
  const lTarget = +s.business.target || (lf && lf.target) || 0;
  const lHave = (lf ? Math.max(0, lf.available) : 0) + Math.max(0, biz);

  $('#view').innerHTML =
    (month < s.start ? `<div class="card"><div class="note2">The budgets start in ${MLONG(s.start)}. This month is a preview, as if they started here.</div></div>` : '') +
    `<div class="card">
      <div class="bh">${MLONG(month)} · ${when}</div>
      ${brow('Income', fmt(c.income), p.salary ? 'the salary that started this month, plus anything else that came in' : 'no salary found for it: counted from the 1st')}
      ${c.moneyIn - c.income ? brow(month === s.start ? 'There before payday' : 'Unassigned from last month', fmt(c.moneyIn - c.income)) : ''}
      ${brow('Split into budgets', fmt(c.added - L('Unassigned').added), `goals add up to ${fmt(c.goal)}${c.goal > c.moneyIn ? `, so ${fmt(c.goal - c.moneyIn)} of goals got nothing this month` : ''}`)}
    </div>
    <div class="card">
      <div class="env eh"><span>Budget</span><span>Goal</span><span>Added</span><span>Available</span></div>
      ${row(L('Needs'))}
      ${row(L('Savings'))}
      <div class="bh">Wants</div>
      ${wants.map(row).join('')}
      ${row(L('Unassigned'))}
      <div class="env tot"><span>All budgets</span><b>${fmt(c.goal)}</b><b>${fmt(c.added)}</b><b class="${neg(c.total)}">${sfmt(c.total)}</b></div>
      <div class="note2">All budgets together are your money in UniCredit and Revolut. Overspending is covered at once: Unassigned, then Fun, Clothes, Entertainment, Eating out, then the saving budgets, then Needs, then Savings. Tap a payment in Daily to move it to another budget.${c.owed ? ` <span class="warn">Savings lent ${fmt(c.owed)}: the next income pays it back first.</span>` : ''}</div>
      ${open && pBlind ? `<div class="note2 warn2">UniCredit has ${pBlind} card payment${pBlind === 1 ? '' : 's'} it does not show yet: no amount, no date. Add them below from your bank app and the budgets are right today; each one clears itself once the bank books it.</div>` : ''}
    </div>
    ${open ? handCard(hand, s) : ''}
    <div class="card">
      <div class="bh">Emergency fund</div>
      ${brow('Saved', `${fmt(em.have)} <span class="of">of ${fmt(em.target)}</span>`,
        `${s.emergency.months} months of Needs + ${fmt(+s.emergency.extra || 0)} house payment${em.gap ? (em.months ? ` · about ${em.months} months to go` : '') : ' · done'}`)}
      ${pbar(em.have, em.target)}
      <div class="note2">Counts: ${esc(s.emergency.accounts.join(', '))}. Add the new savings account's name in the settings once it shows under Accounts.</div>
    </div>
    <div class="card">
      <div class="bh">${esc(s.business.fund)} goal</div>
      ${brow('Total', `${fmt(lHave)}${lTarget ? ` <span class="of">of ${fmt(lTarget)}</span>` : ''}`)}
      ${lTarget ? pbar(lHave, lTarget) : ''}
      ${brow('In the budget', sfmt(lf ? lf.available : 0))}
      ${brow('From the company', sfmt(biz), `free money since ${MLONG(s.start)}; a month with a loss lowers it`)}
    </div>
    <div class="card">
      <div class="bh">Company this month</div>
      ${brow('Received', fmt(bm.received), bm.vat ? `${fmt(bm.vat)} of it is VAT: keep it in the account until it is paid` : '')}
      ${brow('Costs', sfmt(-bm.costs), 'rent, accounting, fees, gear')}
      ${brow('Taxes paid', sfmt(-bm.taxes), 'VAT, social and health payments')}
      ${bm.tax ? brow(`Corporate tax ${s.business.taxPct}%, keep back`, '−' + fmt(bm.tax)) : ''}
      ${brow('Free', `<span class="${bm.free < 0 ? 'exp' : 'inc'}">${sfmt(bm.free)}</span>`)}
    </div>
    ${budgetSettings(s)}`;
}
// The payments added by hand, and a small form to add one.
function handCard(hand, s) {
  const names = ['Needs'].concat(s.funds.map(f => f.name));
  const today = new Date().toISOString().slice(0, 10);
  const D = d => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return `<div class="card">
    <div class="bh">Not booked yet, added by hand</div>
    ${hand.length ? hand.map(e => `<div class="arow"><span>${esc(e.who || 'Payment')}<small class="bsub">${D(e.d)} · ${esc(Budget.budgetOf(s, e.cat))}</small></span>` +
      `<span class="hr"><b>${fmt(e.a)}</b><button class="btn ghost sm" data-act="pdel" data-id="${esc(e.id)}" aria-label="Remove">✕</button></span></div>`).join('')
      : '<div class="note2">None. Add a card payment your bank app shows but this page does not have yet.</div>'}
    <div class="hadd">
      <input id="hWho" type="text" placeholder="What (e.g. BestSecret)">
      <input id="hAmt" type="number" inputmode="decimal" step="any" placeholder="€">
      <select id="hCat">${names.map(n => `<option>${esc(n)}</option>`).join('')}</select>
      <input id="hDay" type="date" value="${today}">
      <button class="btn" data-act="padd">Add</button>
    </div>
    <div class="note2">Each one drops off by itself once the bank books a payment of the same amount within a few days. Do not add moves between your own accounts.</div>
  </div>`;
}
async function handCall(q, btn) {
  if (btn) btn.disabled = true;
  setStatus('Saving…');
  try {
    const r = await fetch(apiUrl() + (apiUrl().includes('?') ? '&' : '?') + 'action=money&mt=' + encodeURIComponent(token()) + q);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'failed');
    data.manual = j.manual || [];
    try { const cch = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (cch) { cch.manual = data.manual; localStorage.setItem(CKEY, JSON.stringify(cch)); } } catch (e) {}
    setStatus('Saved');
    render();
  } catch (e) { setStatus('Could not save: ' + e.message); if (btn) btn.disabled = false; }
}

const list = v => String(v || '').split(',').map(x => x.trim()).filter(Boolean);
function budgetSettings(s) {
  const inp = (id, label, v, type, hint) => `<label class="bf"><span>${label}${hint ? `<small class="bsub">${hint}</small>` : ''}</span>` +
    `<input id="${id}" type="${type || 'number'}" value="${esc(v)}"${!type || type === 'number' ? ' inputmode="decimal" step="any"' : ''}></label>`;
  const funds = s.funds.concat([{ name: '', per: '', target: '', mode: 'pile', cats: [] }]);
  return `<details class="card bset"${bset ? '' : ' open'}><summary>Budget settings</summary>
    ${inp('bStart', 'Start month', s.start, 'month')}
    ${inp('bOpen', 'Money before the first payday €', s.opening, 'number', 'UniCredit + Revolut just before the start month’s salary')}
    ${inp('bNeeds', 'Needs goal €', s.needsFixed, 'number', 'tops up to this each payday')}
    ${inp('bSave', 'Savings % of income', s.savePct)}
    ${inp('bPay', 'Salary from day', s.payday, 'number', 'paid on or after this day: starts next month’s budget')}
    <div class="bh">Wants, filled in this order</div>
    <div class="bfund bfh"><span>Name</span><span>Goal € a month</span><span>Target, 0 = none</span></div>
    ${funds.map((f, i) => `<div class="bfund" data-i="${i}">
      <input data-f="name" type="text" placeholder="New budget" value="${esc(f.name)}">
      <input data-f="per" type="number" inputmode="decimal" step="any" placeholder="€ a month" value="${esc(f.per)}">
      <input data-f="target" type="number" inputmode="decimal" step="any" placeholder="Target" value="${esc(f.target)}">
      <select data-f="mode"><option value="top"${f.mode === 'top' ? ' selected' : ''}>Tops up to goal</option><option value="pile"${f.mode !== 'top' ? ' selected' : ''}>Adds up each month</option></select>
      <input data-f="cats" type="text" placeholder="Categories it pays for" value="${esc((f.cats || []).join(', '))}">
    </div>`).join('')}
    <div class="note2">Clear a name to remove a budget. Spending with no budget of its own comes out of ${esc(s.catchAll)}.</div>
    <div class="bh">Emergency fund</div>
    ${inp('bEmM', 'Months of Needs', s.emergency.months)}
    ${inp('bEmX', 'House payment € a month', s.emergency.extra, 'number', 'set 0 once Mortgage is a Needs category')}
    ${inp('bEmA', 'Accounts', s.emergency.accounts.join(', '), 'text', 'names as under Accounts')}
    <div class="bh">Company</div>
    ${inp('bBizF', 'Free money goes to', s.business.fund, 'text')}
    ${inp('bBizT', 'Goal €', s.business.target)}
    ${inp('bVat', 'VAT share of received %', Math.round(s.business.vatShare * 10000) / 100, 'number', '16.67 = 20% VAT on top')}
    ${inp('bTax', 'Tax to put aside %', s.business.taxPct)}
    <div class="bh">Categories</div>
    ${inp('bNeedC', 'Needs', s.needsCats.join(', '), 'text')}
    ${inp('bIncC', 'Income', s.incomeCats.join(', '), 'text')}
    ${inp('bSaveC', 'Counts as saving', s.saveCats.join(', '), 'text')}
    <div class="bar"><button class="btn" data-act="bsave">Save</button><button class="btn ghost" data-act="breset">Defaults</button></div>
  </details>`;
}
function readBudgetForm() {
  const v = id => ($('#' + id) || {}).value, n = id => +v(id) || 0;
  const funds = [...document.querySelectorAll('.bfund[data-i]')].map(el => {
    const f = k => el.querySelector(`[data-f="${k}"]`).value;
    return { name: f('name').trim(), per: +f('per') || 0, target: +f('target') || 0, mode: f('mode') === 'top' ? 'top' : 'pile', cats: list(f('cats')) };
  }).filter(f => f.name).map(f => (f.cats.length ? f : Object.assign(f, { cats: [f.name] })));
  const keep = bset || {};
  return Object.assign({}, keep, {
    v: Budget.DEF.v, start: v('bStart') || Budget.DEF.start, opening: n('bOpen'), needsFixed: n('bNeeds'), savePct: n('bSave'),
    payday: n('bPay') || 25, funds,
    emergency: { months: n('bEmM'), extra: n('bEmX'), accounts: list(v('bEmA')) },
    business: { fund: (v('bBizF') || '').trim(), target: n('bBizT'), vatShare: n('bVat') / 100, taxPct: n('bTax') },
    needsCats: list(v('bNeedC')), incomeCats: list(v('bIncC')), saveCats: list(v('bSaveC'))
  });
}

// ===== Events =====

function step(dir) { // dir: -1 older, +1 newer
  const months = allMonths();
  if (tab === 'monthly') {
    const y = +month.slice(0, 4) + dir;
    const pick = months.find(m => m.startsWith(String(y)));
    if (pick) month = pick;
  } else {
    const i = months.indexOf(month) - dir;
    if (i >= 0 && i < months.length) month = months[i];
  }
  render();
}
$('#mPrev').addEventListener('click', () => step(-1));
$('#mNext').addEventListener('click', () => step(1));
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  tab = b.dataset.t; drill = null;
  if (tab === 'budget') month = null;   // open on the budget month running now
  render();
});
$('#view').addEventListener('click', e => {
  const r = e.target.closest('.tr[data-k]');
  if (r) { setCat(r.dataset.k); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'month') { month = b.dataset.m; tab = 'daily'; }
  else if (act === 'kind') { statKind = b.dataset.k; }
  else if (act === 'drill') { drill = b.dataset.c; }
  else if (act === 'back') { drill = null; }
  else if (act === 'owner') { owner = b.dataset.o; }
  else if (act === 'ycat') { yearCat = yearCat === b.dataset.c ? null : b.dataset.c; yearCell = null; }
  else if (act === 'ycell') { const i = +b.dataset.i; yearCell = yearCell === i ? null : i; }
  else if (act === 'ykind') { yearKind = b.dataset.k; yearCat = null; yearCell = null; }
  else if (act === 'approve') { startApproval(b.dataset.bank, b.dataset.psu, b); return; }
  else if (act === 'sync') { syncNow(b); return; }
  else if (act === 'padd') {
    const amt = +String($('#hAmt').value || '').replace(',', '.');
    if (!amt) { setStatus('Type the amount first'); return; }
    handCall(`&addpend=go&amt=${encodeURIComponent(Math.abs(amt))}&cat=${encodeURIComponent($('#hCat').value)}` +
      `&who=${encodeURIComponent($('#hWho').value.trim())}&d=${encodeURIComponent($('#hDay').value)}`, b);
    return;
  }
  else if (act === 'pdel') { handCall('&delpend=' + encodeURIComponent(b.dataset.id), b); return; }
  else if (act === 'bsave') { bSave(readBudgetForm()); setStatus('Budget saved'); }
  else if (act === 'breset') { bSave(JSON.parse(JSON.stringify(Budget.DEF))); setStatus('Budget back to the defaults'); }
  else if (act === 'forget') { if (confirm('Remove the Money token and saved data from this device?')) forget(); return; }
  render();
});
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = ''; load();
});

// Budget settings from the other devices. The newest save wins.
// Settings saved by an older version get the new funds (Clothes, Travel) added.
const upgrade = () => { if (bset && window.Budget && Budget.migrate(bset)) bSave(bset); };
function syncBudget() {
  upgrade();
  if (!window.HubSync) return;
  HubSync.sync('budget', bset, d => {
    bset = d;
    try { localStorage.setItem(BKEY, JSON.stringify(d)); } catch (e) {}
    upgrade();
    if (data && tab === 'budget') render();
  });
}
/* index.html carries no version of its own, so a cached copy of it can sit
   beside a fresh app.js and be missing a shared file this code needs. Fetch
   whatever is absent rather than dying on the first line that touches it. */
function boot() {
  syncBudget();
  const need = { Year: 'year.js', Charts: 'charts.js', CatPick: 'catpick.js', Budget: 'budget.js' };
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
