/* Money page. Reads bank data from the Apps Script Money API (token mt, kept in this browser only).
   Rules: money in = income, money out = expense. Own-account moves (Transfer, Savings, gift fund top-ups) are not counted. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-money-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n, cur) => (cur === 'GBP' ? '£' : '€') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sfmt = (n, cur) => (n < 0 ? '−' : '') + fmt(n, cur);
const PAL = ['#E07A63', '#D99A6C', '#E2C46B', '#B9C46B', '#7FB98A', '#6E9A97', '#8FC0B6', '#9DB6C4', '#8A9BD0', '#B58AC9', '#C98BA0', '#A7B4AD'];
const MON = m => new Date(m + '-01T12:00').toLocaleDateString('en-GB', { month: 'short' });
let data = null, month = null, owner = 'All', tab = 'daily', statKind = 'exp', drill = null;

const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
const setStatus = s => { $('#status').textContent = s; };
function show(id) {
  $('#setup').classList.toggle('hidden', id !== 'setup');
  $('#main').classList.toggle('hidden', id !== 'main');
}

// One place decides what each row is.
function classify(t) {
  if (t.c !== 'EUR') return { k: 'other', cat: t.cat || '' };
  const cn = (t.cat || '').trim().toLowerCase();
  if (t.acc === 'Gifts') {
    if (t.a > 0 || cn === 'transfer') return { k: 'move', cat: 'Gift fund' };
    return { k: 'exp', cat: 'Gifts' };
  }
  if (cn === 'transfer') return { k: 'move', cat: 'Transfer' };
  if (cn === 'savings') return { k: 'save', cat: 'Savings' };
  if (t.a > 0) return { k: 'inc', cat: cn === 'income' ? 'Income' : 'Paid back' };
  return { k: 'exp', cat: t.cat ? t.cat.trim() : 'Uncategorised' };
}
function prep(j) { j.tx.forEach(t => { const c = classify(t); t._k = c.k; t._cat = c.cat; }); return j; }
const mine = () => data.tx.filter(t => owner === 'All' || t.own === owner);
function totals(rows) {
  let inc = 0, exp = 0;
  rows.forEach(t => { if (t._k === 'inc') inc += t.a; else if (t._k === 'exp') exp -= t.a; });
  return { inc, exp, net: inc - exp };
}

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
function forget() {
  try { localStorage.removeItem(TKEY); localStorage.removeItem(CKEY); } catch (e) {}
  data = null; show('setup');
}

function allMonths() { return [...new Set(data.tx.map(t => t.d.slice(0, 7)))].sort().reverse(); }

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

  const period = mine().filter(t => t.d.startsWith(yearly ? year : month));
  const s = totals(period);
  $('#sum').innerHTML =
    `<div><span>Income</span><b class="inc">${fmt(s.inc)}</b></div>` +
    `<div><span>Expenses</span><b class="exp">${fmt(s.exp)}</b></div>` +
    `<div><span>Total</span><b>${sfmt(s.net)}</b></div>`;

  if (tab === 'daily') renderDaily(period);
  else if (tab === 'monthly') renderMonthly(year);
  else if (tab === 'stats') drill ? renderDrill(period) : renderStats(period);
  else renderAccounts(period);
}

// ===== Daily =====
function rowHtml(t) {
  const cls = t._k === 'inc' ? 'inc' : t._k === 'exp' ? 'exp' : 'mv';
  const title = t.who || t.desc || '—';
  const sub = [t.acc, t.note].filter(Boolean).map(esc).join(' · ');
  return `<div class="tr"><div class="tc">${esc(t._cat)}</div>
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
function renderDaily(rows) { $('#view').innerHTML = dayList(rows); }

// ===== Monthly =====
function renderMonthly(year) {
  const rows = mine();
  const ms = allMonths().filter(m => m.startsWith(year));
  $('#view').innerHTML = `<div class="card">` + ms.map(m => {
    const s = totals(rows.filter(t => t.d.startsWith(m)));
    const last = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
    return `<button class="mrow" data-act="month" data-m="${m}">
      <div><b>${MON(m)}</b><span>1.${+m.slice(5, 7)} – ${last}.${+m.slice(5, 7)}</span></div>
      <div class="r"><span class="inc">${fmt(s.inc)}</span><span class="exp">${fmt(s.exp)}</span><span class="net">${sfmt(s.net)}</span></div>
    </button>`;
  }).join('') + `</div>`;
}

// ===== Stats =====
function catSums(rows, kind) {
  const m = {};
  rows.filter(t => t._k === kind).forEach(t => { m[t._cat] = (m[t._cat] || 0) + Math.abs(t.a); });
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}
function donut(list, total) {
  const R = 70, C = 2 * Math.PI * R;
  let off = 0;
  const segs = list.map(([, v], i) => {
    const len = v / total * C;
    const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="34"
      stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
    off += len; return s;
  }).join('');
  return `<svg viewBox="0 0 200 200" class="donut" aria-hidden="true"><g transform="rotate(-90 100 100)">${segs}</g></svg>`;
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
        <span class="badge" style="background:${PAL[i % PAL.length]}">${Math.round(v / total * 100)}%</span>
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
  const pts = ms.map(m => ({ m, v: all.filter(t => t.d.startsWith(m) && t._k === statKind && t._cat === drill)
    .reduce((a, t) => a + Math.abs(t.a), 0) }));
  const list = rows.filter(t => t._k === statKind && t._cat === drill);
  $('#view').innerHTML = `
    <div class="dhd"><button class="btn ghost" data-act="back">‹ Back</button><h3>${esc(drill)}</h3></div>
    <div class="card">${trend(pts)}</div>
    ${dayList(list)}`;
}

// ===== Accounts =====
function renderAccounts(rows) {
  const b = data.balances;
  const accs = b && b.accounts ? b.accounts.slice().sort((x, y) => Math.abs(y.amount || 0) - Math.abs(x.amount || 0)) : [];
  const tot = {};
  accs.forEach(a => { if (a.amount != null) tot[a.currency] = (tot[a.currency] || 0) + a.amount; });
  const saved = -rows.filter(t => t._k === 'save').reduce((a, t) => a + t.a, 0);
  const gift = rows.filter(t => t._k === 'move' && t.acc === 'Gifts').reduce((a, t) => a + t.a, 0);
  let consent = '';
  if (data.consent_until) {
    const until = new Date(data.consent_until), days = Math.round((until - Date.now()) / 864e5);
    const d = until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    consent = days <= 21 ? `<span class="warn">Revolut access ends in ${days} days (${d}). Renew: run ebStartAuth.</span>` : `Revolut access until ${d}.`;
  }
  $('#view').innerHTML = `
    <div class="card">
      ${Object.entries(tot).map(([c, v]) => `<div class="arow tot"><b>Total ${c}</b><b>${sfmt(v, c)}</b></div>`).join('')}
      ${accs.map(a => `<div class="arow${!a.amount ? ' zero' : ''}"><span>${esc(a.account)}</span><span>${a.amount == null ? '—' : sfmt(a.amount, a.currency)}</span></div>`).join('')}
      ${b ? `<div class="note2">As of ${new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Revolut only.</div>` : ''}
    </div>
    <div class="card">
      <div class="arow"><span>Net into Flexible Cash Funds this month</span><b>${sfmt(saved)}</b></div>
      <div class="arow"><span>Net into gift fund this month</span><b>${sfmt(gift)}</b></div>
      <div class="note2">Moves between your own accounts. Not counted as income or expenses.</div>
    </div>
    <div class="chips" id="own2">${['All', 'Personal', 'Joint'].map(o => `<button data-act="owner" data-o="${o}" aria-pressed="${o === owner}">${o}</button>`).join('')}</div>
    <p class="foot">${consent}</p>
    <p class="foot"><button class="btn ghost" data-act="forget">Forget token on this device</button></p>`;
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
  tab = b.dataset.t; drill = null; render();
});
$('#view').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'month') { month = b.dataset.m; tab = 'daily'; }
  else if (act === 'kind') { statKind = b.dataset.k; }
  else if (act === 'drill') { drill = b.dataset.c; }
  else if (act === 'back') { drill = null; }
  else if (act === 'owner') { owner = b.dataset.o; }
  else if (act === 'forget') { if (confirm('Remove the Money token and saved data from this device?')) forget(); return; }
  render();
});
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = ''; load();
});

load();
})();
