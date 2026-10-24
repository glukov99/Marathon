/* Builds every tab's HTML on made-up rows, with a stub for the page around it.
   Catches what the figure checks cannot: a name that is missing at render time,
   which is the risk whenever code moves between files.
   Run: node money/render-check.js */
const fs = require('fs'), assert = require('assert'), path = require('path');
const shared = {};
['year', 'charts'].forEach(f => new Function('window',
  fs.readFileSync(path.join(__dirname, '../shared/' + f + '.js'), 'utf8'))(shared));
const { Year, Charts } = shared;

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const body = src.slice(src.indexOf('const esc = '), src.indexOf("$('#mPrev').addEventListener"));
const out = {};
const node = sel => { const id = String(sel).replace('#', ''); return ({ set innerHTML(v) { out[id] = v; }, set textContent(v) { out[id] = v; },
  classList: { toggle() {} }, querySelectorAll: () => [] }); };
const ctx = {};
new Function('ctx', 'Year', 'Charts', '$', 'document', 'localStorage', 'window',
  body + '\nctx.render=render;ctx.prep=prep;ctx.setData=d=>{data=d};' +
  'ctx.tabs=t=>{tab=t};ctx.setMonth=m=>{month=m};')
  (ctx, Year, Charts, node, { querySelectorAll: () => [], querySelector: node },
   { getItem: () => null, setItem() {} }, {});

const row = (d, a, cat, acc) => ({ k: 'k' + d + a, d, a, c: 'EUR', cat, acc: acc || 'Main',
  own: 'Personal', who: 'Shop', desc: 'a purchase', note: '' });
const data = ctx.prep({ ok: true, tx: [
  row('2026-01-05', -100, 'Groceries'), row('2026-02-07', -40, 'Travel'),
  row('2026-02-20', 900, 'Income'), row('2026-03-02', -12, 'Groceries')
], balances: { at: '2026-03-02T10:00:00Z', accounts: [
  { id: 'a1', account: 'Main', own: 'Personal', amount: 10, currency: 'EUR', bank: 'Revolut' },
  { id: 'mypos001', account: 'myPOS', own: 'Personal', amount: 5, currency: 'EUR', bank: 'myPOS', est: true, as_of: '2026-01-02' }
] }, fund: null });
ctx.setData(data);
ctx.setMonth('2026-02');
['accounts', 'daily', 'monthly', 'stats'].forEach(t => {
  ctx.tabs(t); out.view = '';
  ctx.render();
  assert.ok(out.view && out.view.length > 20, t + ' rendered nothing');
});
ctx.tabs('daily'); ctx.render();
assert.ok(/data-k="/.test(out.view), 'a transaction can be tapped to set its category');
assert.ok(!/a month/.test(out.sum), 'a single month has no average');
ctx.tabs('accounts'); ctx.render();
assert.ok(/data-act="sync"/.test(out.view), 'the Accounts tab can ask the banks for anything new');
// A figure kept by hand must say so, and say when, or it rots unnoticed.
assert.ok(/by hand/.test(out.view), 'a hand-kept balance says it is hand-kept');
assert.ok(/check it/.test(out.view), 'and shouts once it is over a month old');

// A pending card payment is shown on the newest month, never counted, never tappable.
ctx.setData(Object.assign(data, { pending: { at: '2026-03-02T06:00:00Z', tx: [
  { d: '2026-03-03', a: -55, c: 'EUR', acc: 'Main', own: 'Personal', who: 'Temu', desc: '', pending: true },
  { d: '2026-03-03', a: -9, c: 'EUR', acc: 'Biz', own: 'Business', who: 'Not mine', desc: '', pending: true }] } }));
ctx.setMonth('2026-03'); ctx.tabs('daily'); ctx.render();
assert.ok(/Pending/.test(out.view) && /Temu/.test(out.view) && !/Not mine/.test(out.view), 'pending shows, by owner');
assert.ok(/€12\.00/.test(out.sum) && !/€67/.test(out.sum), 'and is not in the month total');
assert.ok(!/data-k="[^"]*"[^>]*>\s*<div class="tc">Pending/.test(out.view), 'and cannot be tapped');
ctx.setMonth('2026-02'); ctx.render();
assert.ok(!/Temu/.test(out.view), 'an older month does not show it');

ctx.tabs('monthly'); ctx.render();
assert.ok(/a month/.test(out.sum), 'a year says what each figure is a month');
console.log('render ok: every tab builds');
