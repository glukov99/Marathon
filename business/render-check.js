/* Builds every tab's HTML on made-up rows, with a stub for the page around it.
   It catches the thing the matcher check cannot: a name that does not exist at
   render time. Run: node business/render-check.js */
const fs = require('fs'), assert = require('assert'), path = require('path');
const dir = __dirname;
const shared = {};
['year', 'charts', 'invoices'].forEach(f => new Function('window',
  fs.readFileSync(path.join(dir, '../shared/' + f + '.js'), 'utf8'))(shared));
const { Year, Charts, Invoices } = shared;

const src = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const body = src.slice(src.indexOf('const esc = '), src.indexOf("$('#tabs').addEventListener"));
const out = {};
const $ = () => ({ set innerHTML(v) { out.html = v; }, set textContent(v) {} , classList: { toggle() {} } });
const ctx = {};
new Function('ctx', 'Year', 'Charts', 'Invoices', '$', 'document', 'localStorage', 'fetch', 'CatPick',
  body + '\nctx.prep=prep;ctx.render=render;ctx.setData=d=>{data=d};' +
  'ctx.tabs=t=>{tab=t};ctx.filter=f=>{filter=f};ctx.out=()=>out;' +
  'ctx.workingDue=workingDue;ctx.jobState=jobState;ctx.jobGaps=jobGaps;ctx.edit=i=>{jobEdit=i};')
  (ctx, Year, Charts, Invoices, $, { querySelectorAll: () => [] }, { getItem: () => null, setItem() {} },
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
       tx('2026-05-01', -20, 'Swept to the company', 'Transfer'),
       tx('2026-05-01', 20, 'Sent from myPOS', 'Transfer'),
       tx('2026-05-02', -61.36, 'Revolut** top-up', 'Transfer')]
});
ctx.setData(j);
['overview', 'jobs', 'year', 'invoices', 'clients', 'spend'].forEach(t => {
  ctx.tabs(t); out.html = '';
  ctx.render();
  assert.ok(out.html && out.html.length > 20, t + ' rendered nothing');
});
ctx.tabs('overview'); ctx.render();
assert.ok(/By client/.test(out.html) && /<svg/.test(out.html), 'the overview draws its charts');
// The charts read invoices and the bank. Cash shoots are in neither, so they
// must say so rather than quietly under-report what he earned.
ctx.setData(Object.assign({}, j, { bookings: [
  { id: 'c1', client: 'Cash client', shoot: '2026-02-01', price: 250, paid: '2026-02-01' }] }));
ctx.render();
assert.ok(/paid in cash\s+\(€250\)\s+is not in this/.test(out.html),
  'the charts name the cash work they cannot see');
ctx.setData(j); ctx.render();
// He asked "where is my avg per invoice" twice while it was one card below its
// total. Every bar chart that has an average must now carry it on the same row.
(out.html.match(/<div class="bars two">[\s\S]*?<\/div><\/div>/g) || []).forEach(block => {
  assert.ok(/class="bv b2"/.test(block), 'a two-figure chart shows both figures');
});
assert.ok(/class="bv b2"/.test(out.html), 'the averages sit beside their totals');
ctx.tabs('spend'); ctx.render();
assert.ok(/Salary/.test(out.html), 'salary is named on the company side');
assert.ok(!/Transfer/.test(out.html), 'a transfer between the company\u2019s own accounts is not spending');
assert.ok(/Drawings/.test(out.html),
  'but a transfer out with no matching leg is money he took out');
/* Where the three records disagree. A booking's figures are never money, so
   saying so is the only thing they can do against the bank and the invoices. */
const gaps = (j, inv) => ctx.jobGaps(j, inv || {});
const paidInv = { 7: { no: '7', amount_eur: 400, _paid: {}, _short: 0 } };
const partInv = { 7: { no: '7', amount_eur: 400, _paid: null, _short: 150 } };
assert.deepEqual(gaps({ shoot: '2026-01-01', price: 400, invoice: '7' }, paidInv), [],
  'a booking that agrees with a paid invoice says nothing');
assert.ok(/not in the register/.test(gaps({ shoot: '2026-01-01', invoice: '99' })[0]),
  'an invoice number that does not exist is called out');
assert.ok(/billed/.test(gaps({ shoot: '2026-01-01', price: 500, invoice: '7' }, paidInv)[0]),
  'a price that does not match the invoice is called out');
assert.ok(/has not arrived/.test(gaps({ shoot: '2026-01-01', price: 400, invoice: '7' }, partInv)[0]),
  'and an invoice that is short');
assert.ok(/nothing says it was paid/.test(gaps({ shoot: '2020-01-01', delivered: '2020-01-20', price: 400 })[0]),
  'delivered with nothing saying the money came is called out');
// Cash jobs are normal: no invoice will ever exist and the company's bank will
// never see them, so neither absence is a fault.
assert.deepEqual(gaps({ shoot: '2020-01-01', delivered: '2020-01-20', price: 400, paid: '2020-01-20' }), [],
  'a shoot paid in cash is complete with no invoice at all');
assert.ok(/marked paid in cash and billed/.test(
  gaps({ shoot: '2020-01-01', price: 400, paid: '2020-01-20', invoice: '7' }, paidInv)[0]),
  'but cash AND an invoice is a contradiction worth saying');
assert.equal(ctx.jobState({ shoot: '2020-01-01', paid: '2020-01-20' }, {}).k, 'paid',
  'and it counts as paid');
assert.ok(/never marked as in/.test(gaps({ shoot: '2020-01-01', price: 400, deposit: 100 })[0]),
  'a deposit on a past shoot that never arrived is called out');

// Editing: the form must come back filled in, and save to the edit route.
ctx.tabs('jobs');
ctx.setData(Object.assign({}, j, { bookings: [{ id: 'j1', client: 'Someone', shoot: '2026-11-06',
  price: 400, deposit: 100, deposit_in: 'yes', type: 'X', location: 'Plovdiv', note: 'hi' }] }));
ctx.render();
assert.ok(/data-act="jedit"/.test(out.html), 'a booking can be edited');
ctx.edit('j1'); ctx.render();
assert.ok(/Editing Someone/.test(out.html), 'and the form says so');
assert.ok(/value="400"/.test(out.html) && /value="Plovdiv"/.test(out.html), 'filled in with what is there');
assert.ok(/Save the changes/.test(out.html) && /jcancel/.test(out.html), 'with a save and a way out');
ctx.edit(null); ctx.setData(j);

// The form must be reachable, and open when there is nothing else on the tab.
ctx.tabs('jobs'); ctx.render();
assert.ok(/data-act="jadd"/.test(out.html), 'the Jobs tab has a way to add a booking');
assert.ok(/<details class="card addj" open>/.test(out.html), 'and it starts open while there are none');
// .bk is the round bank badge. A booking card wearing it came out as an 18px
// circle with the text clipped, and the markup looked perfectly fine.
assert.ok(!/class="[^"]*\bbk\b/.test(out.html), 'the booking card does not borrow the badge class');

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
