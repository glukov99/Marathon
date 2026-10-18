/* Money page. Reads bank data from the Apps Script Money API.
   The API needs its own token (mt). The token stays in this browser only, never in the repo. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-money-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (n, cur) => (n < 0 ? '−' : '') + (cur === 'GBP' ? '£' : '€') +
  Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
let data = null, month = null, owner = 'All', catFilter = null;

const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
const setStatus = s => { $('#status').textContent = s; };
function show(id) {
  $('#setup').classList.toggle('hidden', id !== 'setup');
  $('#main').classList.toggle('hidden', id !== 'main');
}

async function load() {
  const url = apiUrl(), tok = token();
  if (!url) {
    show('setup');
    $('#setupMsg').textContent = 'Set up the Intervals.icu sync on the Training page first. Money uses the same Apps Script URL.';
    return;
  }
  if (!tok) { show('setup'); return; }
  try { const c = JSON.parse(localStorage.getItem(CKEY) || 'null'); if (c) { data = c; render(); } } catch (e) {}
  setStatus('Loading…');
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 'action=money&mt=' + encodeURIComponent(tok));
    const j = await r.json();
    if (!j.ok) {
      if (j.error === 'unauthorised') {
        forget();
        $('#setupMsg').textContent = 'The token was wrong. Paste it again.';
        return;
      }
      throw new Error(j.error || 'unknown error');
    }
    data = j;
    try { localStorage.setItem(CKEY, JSON.stringify(j)); } catch (e) {}
    setStatus('Updated ' + new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    render();
  } catch (e) {
    setStatus(data ? 'Offline: showing saved data' : 'Could not load: ' + e.message);
  }
}

function forget() {
  try { localStorage.removeItem(TKEY); localStorage.removeItem(CKEY); } catch (e) {}
  data = null;
  show('setup');
}

function render() {
  show('main');
  const months = [...new Set(data.tx.map(t => t.d.slice(0, 7)))].sort().reverse();
  if (!month || !months.includes(month)) month = months[0];
  const i = months.indexOf(month);
  $('#mPrev').disabled = i >= months.length - 1;
  $('#mNext').disabled = i <= 0;
  $('#mLabel').textContent = new Date(month + '-01T12:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.querySelectorAll('#own button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.o === owner)));

  const rows = data.tx.filter(t => t.d.startsWith(month) && (owner === 'All' || t.own === owner));

  // Totals in EUR only. Out and in are kept apart, never netted.
  let out = 0, back = 0, big = 0, inc = 0, saved = 0, gl = 0;
  const cats = {};
  rows.filter(t => t.c === 'EUR').forEach(t => {
    const cn = (t.cat || '').trim().toLowerCase();
    if (t.acc === 'Savings') { saved += t.a; return; } // Revolut savings account
    if (cn === 'income') { inc += t.a; return; }
    if (cn === 'savings') { saved -= t.a; return; }
    if (cn === 'transfer') return;
    if (cn === 'gl studio') { gl -= t.a; return; }
    if (cn === 'big purchase') { big -= t.a; return; }
    const k = t.cat ? t.cat.trim() : 'Uncategorised';
    const c = cats[k] || (cats[k] = { out: 0, in: 0 });
    if (t.a < 0) { c.out -= t.a; out -= t.a; } else { c.in += t.a; back += t.a; }
  });

  const stat = (l, v, cls, sub) => `<div class="stat"><div class="l">${l}</div><div class="v ${cls || ''}">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  $('#stats').innerHTML =
    stat('Spent', money(out), '', back > 0 ? money(back) + ' paid back' : '') +
    (big > 0 ? stat('Big purchases', money(big)) : '') +
    stat('Saved', money(saved), saved >= 0 ? 'pos' : '') +
    stat('In', money(inc), 'pos') +
    (gl > 0 ? stat('GL Studio', money(gl)) : '');

  renderCats(cats);
  renderTx(rows);
  renderBalances();
  renderFoot();
}

function renderCats(cats) {
  const list = Object.entries(cats).filter(([, v]) => v.out > 0.005 || v.in > 0.005)
    .sort((a, b) => b[1].out - a[1].out);
  const max = Math.max(1, ...list.map(([, v]) => Math.max(v.out, v.in)));
  const total = list.reduce((s, [, v]) => s + v.out, 0) || 1;
  $('#cats').innerHTML = list.length ? list.map(([k, v]) => `
    <button class="cat${catFilter === k ? ' on' : ''}" data-cat="${esc(k)}">
      <div class="row"><b>${esc(k)}</b><span>${money(v.out)} out${v.out ? ' · ' + Math.round(v.out / total * 100) + '%' : ''}</span></div>
      <div class="tr"><i style="width:${(v.out / max * 100).toFixed(1)}%"></i></div>
      ${v.in > 0.005 ? `<div class="row in"><span></span><span>${money(v.in)} in</span></div>
      <div class="tr"><i class="inb" style="width:${(v.in / max * 100).toFixed(1)}%"></i></div>` : ''}
    </button>`).join('') : '<p class="sub">No spending this month.</p>';
}

function renderTx(rows) {
  const shown = catFilter ? rows.filter(t => (t.cat ? t.cat.trim() : 'Uncategorised').toLowerCase() === catFilter.toLowerCase()) : rows;
  $('#txH').textContent = catFilter ? catFilter : 'Transactions';
  $('#txClear').classList.toggle('hidden', !catFilter);
  $('#tx').innerHTML = shown.length ? shown.map(t => {
    const title = t.who || t.desc || '—';
    const meta = [t.cat || 'Uncategorised', t.acc, t.note].filter(Boolean).map(esc).join(' · ');
    const day = new Date(t.d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `<div class="txr"><div class="dt">${day}</div>
      <div class="bd"><b>${esc(title)}</b><span>${meta}</span></div>
      <div class="am${t.a > 0 ? ' pos' : ''}">${money(t.a, t.c)}</div></div>`;
  }).join('') : '<div class="pc"><p class="sub">Nothing here.</p></div>';
}

function renderBalances() {
  const b = data.balances;
  if (!b || !b.accounts) { $('#bal').innerHTML = '<p class="sub">No balances yet.</p>'; return; }
  const totals = {};
  b.accounts.forEach(a => { if (a.amount != null) totals[a.currency] = (totals[a.currency] || 0) + a.amount; });
  const accs = b.accounts.slice().sort((x, y) => Math.abs(y.amount || 0) - Math.abs(x.amount || 0));
  $('#bal').innerHTML =
    Object.entries(totals).map(([c, v]) => `<div class="balr tot"><b>Total ${c}</b><b>${money(v, c)}</b></div>`).join('') +
    accs.map(a => `<div class="balr${!a.amount ? ' zero' : ''}"><span>${esc(a.account)}</span><span>${a.amount == null ? '—' : money(a.amount, a.currency)}</span></div>`).join('') +
    `<p class="sub">As of ${new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}. Revolut only; Bulbank comes later.</p>`;
}

function renderFoot() {
  if (!data.consent_until) { $('#foot').textContent = ''; return; }
  const until = new Date(data.consent_until);
  const days = Math.round((until - Date.now()) / 864e5);
  const d = until.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  $('#foot').innerHTML = days <= 21
    ? `<span class="warn">Revolut access ends in ${days} days (${d}). Renew it: run ebStartAuth.</span>`
    : `Revolut access until ${d} (${days} days).`;
}

// ===== Events =====
function step(dir) {
  const months = [...new Set(data.tx.map(t => t.d.slice(0, 7)))].sort().reverse();
  const i = months.indexOf(month) - dir;
  if (i >= 0 && i < months.length) { month = months[i]; catFilter = null; render(); }
}
$('#mPrev').addEventListener('click', () => step(-1));
$('#mNext').addEventListener('click', () => step(1));
$('#own').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  owner = b.dataset.o; catFilter = null; render();
});
$('#cats').addEventListener('click', e => {
  const b = e.target.closest('.cat'); if (!b) return;
  catFilter = catFilter === b.dataset.cat ? null : b.dataset.cat; render();
});
$('#txClear').addEventListener('click', () => { catFilter = null; render(); });
$('#tokSave').addEventListener('click', () => {
  const v = $('#tokIn').value.trim(); if (!v) return;
  try { localStorage.setItem(TKEY, v); } catch (e) {}
  $('#tokIn').value = '';
  load();
});
$('#forget').addEventListener('click', () => {
  if (confirm('Remove the Money token and saved data from this device?')) forget();
});

load();
})();
