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
  'ctx.tabs=t=>{tab=t};ctx.filter=f=>{filter=f};ctx.out=()=>out;' +
  'ctx.workingDue=workingDue;ctx.jobState=jobState;')
  (ctx, Year, Charts, $, { querySelectorAll: () => [] }, { getItem: () => null, setItem() {} },
   () => Promise.reject(new Error('no network in the check')), { open() {} });

const tx = (d, a, desc, cat) => ({ k: 'k' + d + a, d, a, c: 'EUR', desc, who: '', cat: cat || '' });
const j = ctx.prep({
  invoices: [
    { no: '1', issued: '2026-02-01', client: 'A', amount_eur: 100, items: 'x' },
    { no: '2', issued: '2026-03-01', client: 'B', amount_eur: 500, items: 'y', status: 'cancelled' }
  ],
  types: ['Продуктова фотография'],
  tx: [tx('2026-02-03', 100, 'ф-ра: 0000000001'), tx('2026-02-10', -40, 'АМАЙЯ РЕНТ', 'Rent'),
       tx('2026-04-01', -60, 'Заплата · Вътрешнобанков превод'),
       tx('2026-05-01', -20, 'Sent from myPOS', 'Transfer')]
});
ctx.setData(j);
['overview', 'jobs', 'year', 'invoices', 'clients', 'spend'].forEach(t => {
  ctx.tabs(t); out.html = '';
  ctx.render();
  assert.ok(out.html && out.html.length > 20, t + ' rendered nothing');
});
ctx.tabs('overview'); ctx.render();
assert.ok(/By client/.test(out.html) && /<svg/.test(out.html), 'the overview draws its charts');
// He asked "where is my avg per invoice" twice while it was one card below its
// total. Every bar chart that has an average must now carry it on the same row.
(out.html.match(/<div class="bars two">[\s\S]*?<\/div><\/div>/g) || []).forEach(block => {
  assert.ok(/class="bv b2"/.test(block), 'a two-figure chart shows both figures');
});
assert.ok(/class="bv b2"/.test(out.html), 'the averages sit beside their totals');
ctx.tabs('spend'); ctx.render();
assert.ok(/Salary/.test(out.html), 'salary is named on the company side');
assert.ok(!/Transfer/.test(out.html), 'a transfer is not spending');
// The form must be reachable, and open when there is nothing else on the tab.
ctx.tabs('jobs'); ctx.render();
assert.ok(/data-act="jadd"/.test(out.html), 'the Jobs tab has a way to add a booking');
assert.ok(/<details class="card bk" open>/.test(out.html), 'and it starts open while there are none');

ctx.tabs('invoices'); ctx.render();
assert.ok(!/cancelled/.test(out.html), 'a cancelled invoice is not waiting for money');
ctx.filter('all'); ctx.render();
assert.ok(/cancelled/.test(out.html), 'but it is still in the list, marked');
assert.ok(/Set type/.test(out.html), 'and its type can be set');
/* Ten working days after the shoot: the deadline the whole Jobs tab turns on,
   so it is worth more than one case. */
const due = ctx.workingDue;
assert.equal(due('2026-11-06'), '2026-11-20', 'a Friday shoot is due the Friday two weeks later');
assert.equal(due('2026-11-02'), '2026-11-16', 'and a Monday the Monday');
assert.equal(due('2026-11-05'), '2026-11-19', 'a Thursday keeps its weekday');
assert.equal(due('2026-11-07'), '2026-11-20', 'a Saturday shoot lands with the Friday before it');
assert.equal(due('2026-11-08'), '2026-11-20', 'and so does a Sunday');
assert.equal(due('2026-12-24'), '2027-01-07', 'it carries over a year end');
[0, 1, 2, 3, 4, 5, 6].forEach(off => {
  const d = new Date('2026-11-02T12:00'); d.setDate(d.getDate() + off);
  const w = new Date(due(d.toISOString().slice(0, 10)) + 'T12:00').getDay();
  assert.ok(w !== 0 && w !== 6, 'a due date is never a weekend');
});
assert.equal(due('not a date'), '', 'and a bad date gives nothing, not a crash');

const st = (j, inv) => ctx.jobState(j, inv || {});
const far = '2099-01-01', old = '2020-01-01';
assert.equal(st({ shoot: far }).k, 'booked', 'a future shoot is booked');
assert.equal(st({ shoot: old }).k, 'late', 'a shoot long past with nothing done is late');
assert.equal(st({ shoot: old, delivered: old }).k, 'delivered', 'delivered but not billed');
assert.equal(st({ shoot: old, invoice: '7' }, { 7: { no: '7' } }).k, 'invoiced', 'billed, waiting');
assert.equal(st({ shoot: old, invoice: '7' }, { 7: { no: '7', _paid: {} } }).k, 'paid', 'and paid');

console.log('render ok: every tab builds, due dates land on working days');
