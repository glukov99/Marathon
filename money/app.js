/* Money page. Reads bank data from the Apps Script Money API (token mt, kept in this browser only).
   Rules: money in = income, money out = expense. Own-account moves (Transfer, Savings, gift fund top-ups) are not counted.
   Flexible Cash Funds: moves in/out are transfers; only the interest (net of fees, from the statement) is income. */
(() => {
const TKEY = 'lifehub-money-token', CKEY = 'lifehub-money-cache';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (n, cur) => (cur === 'GBP' ? '£' : '€') + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sfmt = (n, cur) => (n < 0 ? '−' : '') + fmt(n, cur);
const PAL = ['#E07A63', '#D99A6C', '#E2C46B', '#B9C46B', '#7FB98A', '#6E9A97', '#8FC0B6', '#9DB6C4', '#8A9BD0', '#B58AC9', '#C98BA0', '#A7B4AD'];
const MON = m => new Date(m + '-01T12:00').toLocaleDateString('en-GB', { month: 'short' });
let data = null, month = null, owner = 'All', tab = 'accounts', statKind = 'exp', drill = null, yearCat = null;
const OWNERS = ['All', 'Personal', 'Joint'];
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
const BANKS = [[/unicredit/i, 'uni', 'UC'], [/revolut/i, 'rev', 'R']];
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

  const period = (tab === 'business' ? businessRows() : mine())
    .filter(t => t.d.startsWith(yearly ? year : month));
  const s = totals(period), g = totals(period, 'GBP');
  $('#sum').innerHTML =
    `<div><span>Income</span><b class="inc">${fmt(s.inc)}</b></div>` +
    `<div><span>Expenses</span><b class="exp">${fmt(s.exp)}</b></div>` +
    `<div><span>Total</span><b>${sfmt(s.net)}</b></div>` +
    (g.inc || g.exp
      ? `<div class="g"><span>GBP in</span><b class="inc">${fmt(g.inc, 'GBP')}</b></div>` +
        `<div class="g"><span>GBP out</span><b class="exp">${fmt(g.exp, 'GBP')}</b></div>` +
        `<div class="g"><span>GBP total</span><b>${sfmt(g.net, 'GBP')}</b></div>`
      : '');

  const hasBusiness = businessRows().length > 0;
  const bTab = document.querySelector('#tabs button[data-t="business"]');
  if (bTab) bTab.hidden = !hasBusiness;
  $('#tabs').classList.toggle('five', hasBusiness);
  if (!hasBusiness && tab === 'business') tab = 'accounts';

  if (tab === 'business') renderBusiness(period);
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
  const d = yearData(rows, year);
  const prev = yearData(rows, String(+year - 1));
  const story = yearStory(d, prev.total ? prev : null);
  const ms = allMonths().filter(m => m.startsWith(year));
  $('#view').innerHTML =
    (story.length ? `<div class="card story">${story.map(x => `<p>${esc(x)}</p>`).join('')}</div>` : '') +
    `<div class="card">${yearGrid(d)}</div>` +
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
const M_INIT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const kfmt = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)));
const fmt0 = n => '\u20ac' + Math.round(Math.abs(n)).toLocaleString('en-GB');
const sfmt0 = n => (n < 0 ? '\u2212' : '') + fmt0(n);
const mIdx = t => +t.d.slice(5, 7) - 1;
const z12 = () => new Array(12).fill(0);

function yearData(rows, year) {
  const inYear = eur(rows).filter(t => t.d.startsWith(year));
  const inc = z12(), exp = z12(), cats = {}, has = new Array(12).fill(false);
  inYear.forEach(t => {
    const i = mIdx(t);
    if (t._k === 'inc' || t._k === 'exp') has[i] = true;
    if (t._k === 'inc') inc[i] += t.a;
    else if (t._k === 'exp') {
      exp[i] -= t.a;
      (cats[t._cat] = cats[t._cat] || z12())[i] -= t.a;
    }
  });
  const list = Object.entries(cats)
    .map(([cat, months]) => ({ cat, months, total: months.reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total);
  const net = inc.map((v, i) => v - exp[i]);
  // Months with any activity, so a part year is not read as twelve months.
  const live = inYear.length ? inYear.map(mIdx) : [];
  const from = live.length ? Math.min(...live) : 0, to = live.length ? Math.max(...live) : -1;
  return { year, inc, exp, net, cats: list, from, to, has,
    total: list.reduce((a, c) => a + c.total, 0), months: to - from + 1 };
}

// Three plain sentences about the year. Each one is a fact from the grid above,
// not a judgement: where the money went, which month stands out and why, and
// how it compares with the year before over the same months.
function yearStory(d, prev) {
  const out = [];
  if (!d.cats.length) return out;
  const top = d.cats[0];
  const share = d.total ? Math.round(top.total / d.total * 100) : 0;
  out.push(`${top.cat} is the biggest at ${fmt(top.total)}, ${share}% of everything you spent.`);

  const peak = d.exp.indexOf(Math.max(...d.exp));
  if (d.exp[peak] > 0) {
    // What made that month stand out: the category furthest above its own average
    // in the other live months.
    let drv = null;
    d.cats.forEach(c => {
      const others = c.months.filter((v, i) => i !== peak && i >= d.from && i <= d.to);
      const avg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
      const over = c.months[peak] - avg;
      if (c.months[peak] > 0 && (!drv || over > drv.over)) drv = { cat: c.cat, over, v: c.months[peak] };
    });
    out.push(`${MON(d.year + '-' + String(peak + 1).padStart(2, '0'))} was the dearest month at ${fmt(d.exp[peak])}` +
      (drv && drv.over > 0 ? `, mostly ${drv.cat} at ${fmt(drv.v)}.` : '.'));
  }

  if (prev) {
    // Only the months both years actually hold data for. A part year, or a year the
    // bank history barely reaches, would otherwise produce a true but useless number.
    const both = d.has.map((h, i) => h && prev.has[i]);
    const n = both.filter(Boolean).length;
    const sum = (arr) => arr.reduce((x, y, i) => x + (both[i] ? y : 0), 0);
    const a = sum(d.exp), b = sum(prev.exp);
    if (n >= 2 && b > 0) {
      const diff = a - b, pc = Math.round(Math.abs(diff) / b * 100);
      out.push(`Over the ${n} months both years cover, that is ${fmt(Math.abs(diff))} ` +
        `${diff >= 0 ? 'more' : 'less'} than ${prev.year} (${pc}%).`);
    }
  }
  const saved = d.net.filter((v, i) => i >= d.from && i <= d.to && v > 0).length;
  if (d.months > 1) out.push(`You ended ${saved} of ${d.months} months in the black.`);
  return out.slice(0, 3);
}

function heatCell(v, max, cls) {
  if (!v) return `<span class="yc z"></span>`;
  const o = 0.18 + 0.82 * (max ? v / max : 0);
  return `<span class="yc ${cls}" style="opacity:${o.toFixed(2)}"></span>`;
}

function yearGrid(d) {
  if (!d.cats.length) return '<div class="empty">Nothing spent in this year.</div>';
  // Average over the months the year actually holds, not over twelve, or a part
  // year would read as if the quiet months were spending nothing.
  const per = n => n / Math.max(d.months, 1);
  const head = `<div class="ygh"><span></span>${M_INIT.map((m, i) =>
    `<span class="${i < d.from || i > d.to ? 'off' : ''}">${m}</span>`).join('')}` +
    `<span class="yt">Total</span><span class="yt">Avg</span></div>`;
  const netMax = Math.max(...d.net.map(Math.abs), 1);
  const netTotal = d.net.reduce((a, b) => a + b, 0);
  const netRow = `<div class="yr net"><span class="yn">Net</span>${d.net.map((v, i) =>
    i < d.from || i > d.to ? '<span class="yc z"></span>' : heatCell(Math.abs(v), netMax, v >= 0 ? 'up' : 'dn')).join('')}` +
    `<span class="yt">${sfmt0(netTotal)}</span><span class="yt av">${sfmt0(per(netTotal))}</span></div>`;
  const rows = d.cats.map(c => {
    const max = Math.max(...c.months);
    const open = yearCat === c.cat;
    return `<button class="yr${open ? ' open' : ''}" data-act="ycat" data-c="${esc(c.cat)}">` +
      `<span class="yn">${esc(c.cat)}</span>` +
      c.months.map(v => heatCell(v, max, 'ex')).join('') +
      `<span class="yt">${fmt0(c.total)}</span><span class="yt av">${fmt0(per(c.total))}</span></button>` +
      (open ? `<div class="ym">${c.months.map((v, i) => v ? `<span>${M_INIT[i] ? MON(d.year + '-' + String(i + 1).padStart(2, '0')) : ''} ${kfmt(v)}</span>` : '').join('')}` +
        `<span class="av">${fmt(c.total)} in all, ${fmt(c.total / Math.max(d.months, 1))} a month</span></div>` : '');
  }).join('');
  return `<div class="yg">${head}${netRow}<div class="ysep"></div>${rows}</div>` +
    `<div class="note2">Shading is each category against its own best month, so a small one still shows its shape. Tap a row for the months. Avg is per month with data (${d.months} this year). EUR only.</div>`;
}

// ===== Stats =====
function catSums(rows, kind) {
  const m = {};
  eur(rows).filter(t => t._k === kind).forEach(t => { m[t._cat] = (m[t._cat] || 0) + Math.abs(t.a); });
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
  const bal = b.map(a => `<div class="arow"><span>${bankMark(a)}${esc(a.account)}${a.error ? ` <span class="rdot" title="Needs re-approval${a.as_of ? ' · last read ' + new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}"></span>` : ''}</span>` +
    `<span>${a.amount == null ? '—' : sfmt(a.amount, a.currency)}</span></div>`).join('');
  $('#view').innerHTML =
    (bal ? `<div class="card">${bal}</div>` : '') +
    `<div class="card"><div class="arow"><span>Rows this period</span><b>${rows.length}</b></div>
      <div class="note2">GL Studio 99 EOOD is a separate company, so it is never counted in your own income or expenses. Money it pays you shows as income on the personal side.</div></div>` +
    dayList(rows);
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
      ${accs.map(a => `<div class="arow${!a.amount ? ' zero' : ''}"><span>${bankMark(a)}${esc(a.account)}${a.est ? ' <small>(est.)</small>' : ''}${a.error ? ` <span class="rdot" title="Needs re-approval${a.as_of ? ' · last read ' + new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}"></span>` : ''}</span><span>${a.amount == null ? '—' : sfmt(a.amount, a.currency)}${a.error && a.as_of ? `<small class="asof">${new Date(a.as_of).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</small>` : ''}</span></div>` +
        (a.overdraft ? `<div class="arow od"><span>Overdraft ${fmt(a.overdraft.eur)} (${a.overdraft.bgn.toLocaleString('en-GB')} лв)</span><span>${a.available != null ? 'available ' + fmt(a.available) : ''}</span></div>` : '')).join('')}
      ${b ? `<div class="note2">As of ${new Date(b.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.</div>` : ''}
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
      ${approved}
      <div class="note2">UniCredit sessions expire within hours. Approve personal, then business, and sync at least once a month. Each sync looks back 90 days, so nothing is lost.</div>
    </div>
    <div class="chips" id="own2">${OWNERS.map(o => `<button data-act="owner" data-o="${o}" aria-pressed="${o === owner}">${o}</button>`).join('')}</div>
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
  else if (act === 'ycat') { yearCat = yearCat === b.dataset.c ? null : b.dataset.c; }
  else if (act === 'approve') { startApproval(b.dataset.bank, b.dataset.psu, b); return; }
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
