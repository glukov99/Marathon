/* The Money and Business panels on the home page. Made-up rows, no network.
   They matter because the home page is the one that must never nag about an
   invoice that has in fact been paid.
   Run: node home-check.js */
const fs = require('fs'), assert = require('assert');
const html = fs.readFileSync(__dirname + '/index.html', 'utf8');

// The panel code is the IIFE that starts at this comment.
const a = html.indexOf('/* Money and Business, read once on load.');
assert.ok(a > 0, 'the money panels are still in index.html');
const b = html.indexOf('document.addEventListener', a);
const src = html.slice(a, b);
assert.ok(/shared\/invoices\.js/.test(html), 'and it loads the shared matcher');

const shared = {};
new Function('window', fs.readFileSync(__dirname + '/shared/invoices.js', 'utf8'))(shared);

const panels = {};
const node = () => ({ set innerHTML(v) { panels.last = v; }, classList: { remove() {} } });
const calls = [];
const out = {};
new Function('document', 'localStorage', 'fetch', 'MN', 'Invoices', 'out', src + '\n')(
  { getElementById: id => (out[id] = out[id] || { set innerHTML(v) { out[id + 'H'] = v; },
      classList: { remove() {} } }) },
  { getItem: k => (k === 'lifehub-money-token' ? 'x' : '{"url":"https://example.invalid/exec"}') },
  (u) => { calls.push(u); return Promise.resolve({ json: () => Promise.resolve(fake(u)) }); },
  ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
  shared.Invoices, out);

const month = new Date().toISOString().slice(0, 7);
function fake(u) {
  if (u.includes('biz=go')) return { ok: true,
    invoices: [{ no: '1', issued: '2026-01-10', amount_eur: 100, client: 'Paid co' },
               { no: '2', issued: '2026-01-10', amount_eur: 500, client: 'Owes me' },
               { no: '3', issued: '2026-01-10', amount_eur: 900, client: 'Gone', status: 'cancelled' }],
    tx: [{ d: '2026-01-12', a: 100, c: 'EUR', desc: 'ф-ра: 0000000001', cat: 'Income' }],
    bookings: [{ id: 'j1', client: 'Late client', shoot: '2020-01-01', delivered: '' },
               { id: 'j2', client: 'Next client', shoot: '2099-01-01', delivered: '' }] };
  return { ok: true, tx: [
    { d: month + '-05', a: -40, c: 'EUR', own: 'Personal', cat: 'Groceries' },
    { d: month + '-06', a: 900, c: 'EUR', own: 'Personal', cat: 'Income' },
    { d: month + '-07', a: -500, c: 'EUR', own: 'Personal', cat: 'Transfer' },
    { d: month + '-08', a: -99, c: 'EUR', own: 'Business', cat: 'Rent' }],
    balances: { accounts: [
      { id: 'a', own: 'Personal', currency: 'EUR', amount: 1000 },
      { id: 'b', own: 'Business', currency: 'EUR', amount: 500 },
      { id: 'c', own: 'Personal', currency: 'EUR', amount: 50, est: true }] } };
}

setTimeout(() => {
  const m = out.cashH || '', z = out.bizH || '';
  assert.ok(/€1,000\.00/.test(m), 'personal accounts only, no business, no estimates');
  assert.ok(/in €900/.test(m) && /out €40/.test(m), 'transfers are not spending');
  assert.ok(/\+€860\.00/.test(m), 'and the month nets out');
  assert.ok(/1 shoot past the delivery date/.test(z), 'a late delivery is named');
  assert.ok(/Next client/.test(z), 'and the next one due');
  assert.ok(/1 invoice with no payment found, €500\.00/.test(z),
    'the paid one is not chased and the cancelled one is not counted');
  console.log('home ok: money and business panels read right');
}, 20);
