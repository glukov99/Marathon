/* Builds every tab's HTML on made-up rows, with a stub for the page around it.
   It catches the thing the matcher check cannot: a name that does not exist at
   render time. Run: node business/render-check.js */
const fs = require('fs'), assert = require('assert'), path = require('path');
const dir = __dirname;
const shared = {};
['year', 'charts'].forEach(f => new Function('window',
  fs.readFileSync(path.join(dir, '../shared/' + f + '.js'), 'utf8'))(shared));
const { Year, Charts } = shared;

const src = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const body = src.slice(src.indexOf('const esc = '), src.indexOf("$('#tabs').addEventListener"));
const out = {};
const $ = () => ({ set innerHTML(v) { out.html = v; }, set textContent(v) {} , classList: { toggle() {} } });
const ctx = {};
new Function('ctx', 'Year', 'Charts', '$', 'document', 'localStorage', 'fetch', 'CatPick',
  body + '\nctx.prep=prep;ctx.render=render;ctx.setData=d=>{data=d};' +
  'ctx.tabs=t=>{tab=t};ctx.filter=f=>{filter=f};ctx.out=()=>out;')
  (ctx, Year, Charts, $, { querySelectorAll: () => [] }, { getItem: () => null, setItem() {} },
   () => Promise.reject(new Error('no network in the check')), { open() {} });

const tx = (d, a, desc, cat) => ({ k: 'k' + d + a, d, a, c: 'EUR', desc, who: '', cat: cat || '' });
const j = ctx.prep({
  invoices: [
    { no: '1', issued: '2026-02-01', client: 'A', amount_eur: 100, items: 'x' },
    { no: '2', issued: '2026-03-01', client: 'B', amount_eur: 500, items: 'y', status: 'cancelled' }
  ],
  tx: [tx('2026-02-03', 100, 'ф-ра: 0000000001'), tx('2026-02-10', -40, 'АМАЙЯ РЕНТ', 'Rent'),
       tx('2026-04-01', -60, 'Заплата · Вътрешнобанков превод'),
       tx('2026-05-01', -20, 'Sent from myPOS', 'Transfer')]
});
ctx.setData(j);
['overview', 'year', 'invoices', 'clients', 'spend'].forEach(t => {
  ctx.tabs(t); out.html = '';
  ctx.render();
  assert.ok(out.html && out.html.length > 20, t + ' rendered nothing');
});
ctx.tabs('overview'); ctx.render();
assert.ok(/Who it came from/.test(out.html) && /<svg/.test(out.html), 'the overview draws its charts');
ctx.tabs('spend'); ctx.render();
assert.ok(/Salary/.test(out.html), 'salary is named on the company side');
assert.ok(!/Transfer/.test(out.html), 'a transfer is not spending');
ctx.tabs('invoices'); ctx.render();
assert.ok(!/cancelled/.test(out.html), 'a cancelled invoice is not waiting for money');
ctx.filter('all'); ctx.render();
assert.ok(/cancelled/.test(out.html), 'but it is still in the list, marked');
console.log('render ok: every tab builds');
