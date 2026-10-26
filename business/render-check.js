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
  'ctx.workingDue=workingDue;ctx.jobState=jobState;ctx.jobGaps=jobGaps;ctx.edit=i=>{jobEdit=i};' +
  'ctx.subsetFor=subsetFor;ctx.cashMatches=cashMatches;' +
  'ctx.standing=standing;ctx.nextSteps=nextSteps;ctx.rateTrend=rateTrend;ctx.monthAvg=monthAvg;' +
  'ctx.hourRates=hourRates;ctx.tedit=i=>{timeEdit=i};ctx.cedit=n=>{clientEdit=n};')
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

/* One cash deposit is often several shoots at once, which is why this looks
   for a combination rather than a single matching price. */
const P = p => ({ price: p });
assert.deepEqual(ctx.subsetFor([P(300), P(250), P(200)], 750).map(x => x.price), [300, 250, 200],
  'three shoots paid in together are found');
assert.deepEqual(ctx.subsetFor([P(300), P(250), P(200)], 500).map(x => x.price), [300, 200],
  'and any two of them');
assert.equal(ctx.subsetFor([P(300), P(250)], 1000), null, 'no combination means no suggestion');
assert.equal(ctx.subsetFor([], 100), null, 'and nothing to work with means none either');

ctx.setData(Object.assign({}, j, {
  bookings: [{ id: 'a', client: 'A', shoot: '2026-10-01', price: 300 },
             { id: 'b', client: 'B', shoot: '2026-10-05', price: 55 },
             { id: 'c', client: 'C', shoot: '2026-10-06', price: 900 },
             { id: 'd', client: 'D', shoot: '2026-12-01', price: 355 }],
  cashIn: [{ k: 'dep1', d: '2026-10-14', a: 355, cat: 'Income' }] }));
const m = ctx.cashMatches();
assert.equal(m.length, 1, 'the deposit is matched');
assert.deepEqual(m[0].jobs.map(x => x.id), ['a', 'b'], 'to the two shoots that come to it');
ctx.tabs('jobs'); ctx.render();
assert.ok(/data-act="cashok"/.test(out.html), 'and it is offered, not applied');
ctx.setData(j);

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

/* Where he stands and what to do next (26 Oct 2026). Made-up books with
   answers that can be worked out by hand: rent 300 and taxes 100 every month
   make a floor of 400; 500 comes in every month. */
{
  const rows = [];
  for (let m = 0; m < 22; m++) {
    const d = new Date(Date.UTC(2025, m, 5)).toISOString().slice(0, 10);
    rows.push(tx(d, 500, 'client ' + m), tx(d, -300, 'АМАЙЯ РЕНТ', 'Rent'), tx(d, -100, 'НАП', 'Taxes'));
  }
  const P = 'Продуктова фотография (продукти)';
  const inv = (no, d, amt, cat, client) => ({ no, issued: d, client: client || 'C' + no, amount_eur: amt, items: '', category: cat });
  const H = 3600e3, t0 = Date.UTC(2026, 9, 1, 9);
  const books = prep_({
    tx: rows, types: [P],
    invoices: [inv('1', '2025-03-01', 600, P, 'Reg'), inv('2', '2025-04-01', 600, P, 'Reg'), inv('3', '2025-05-01', 600, P),
      inv('4', '2026-01-01', 400, P), inv('5', '2026-02-01', 400, P), inv('6', '2026-03-01', 400, P),
      inv('10', '2026-09-01', 300, '')],
    bookings: [{ id: 'b1', client: 'A', shoot: '2026-09-01', type: P, invoice: '10' },
      { id: 'b2', client: 'A', shoot: '2026-09-02', type: P, invoice: '10' },
      { id: 'b3', client: 'Cash', shoot: '2026-09-03', type: 'Семейна фотография', price: 200, paid: '2026-09-03' },
      { id: 'b4', client: 'Later', shoot: '2026-10-01', type: P }],
    time: [{ id: 's1', job: 'b1', phase: 'shoot', start: t0, end: t0 + 1.5 * H },
      { id: 's2', job: 'b2', phase: 'edit', start: t0 + 3 * H, end: t0 + 4 * H },
      { id: 's3', job: 'b3', phase: 'shoot', start: t0 + 5 * H, end: t0 + 6 * H },
      { id: 's4', job: 'b4', phase: 'shoot', start: t0 + 7 * H, end: t0 + 7.5 * H }]
  });
  function prep_(x) { return ctx.prep(x); }
  ctx.setData(books);
  const st = ctx.standing('2026-10-15');
  const near = (a, b, what) => assert.ok(Math.abs(a - b) < 0.01, what + ': ' + a + ' should be ' + b);
  near(st.floor, 400, 'the floor is rent plus taxes a month');
  near(st.inThis, 500, 'in this month');
  near(st.run3, 500, 'the three-month average');
  near(st.minInv, 400 / (4 / 12), 'what one invoice has to carry, at four invoices in twelve months');
  const pr = ctx.rateTrend().find(r => r.type === P);
  near(pr.change, -1 / 3, 'product fell from 600 to 400 an invoice');
  const n = ctx.nextSteps(st, '2026-10-15');
  // He charges per photo: a smaller invoice is a smaller order, not a cut in price.
  assert.ok(!n.steps.some(x => /rate/.test(x.text)), 'no "charge your old rate" step');
  assert.deepEqual(n.steps.map(x => x.eur), n.steps.map(x => x.eur).slice().sort((a, b) => b - a), 'biggest first');
  // Hours: invoice 10 (300) is split over b1 and b2; b3 is cash at its booking
  // price; b4 is timed but not billed, so it waits, though its half hour still
  // counts as time worked. Four logged hours carry a floor of 400: 100 an hour.
  const h = ctx.hourRates(st);
  near(h.perHour, 100, 'an hour carries the floor over the hours logged');
  assert.equal(h.waiting, 1, 'a timed job with no invoice waits');
  assert.equal(h.cashN, 1, 'and the cash job counts, marked');
  assert.equal(h.rows[0].type, 'Семейна фотография', 'best hour first');
  near(h.rows[0].net, 100, 'cash: (200 - 100) / 1h');
  near(h.rows[1].net, 20, 'product: (300 - 2.5h x 100) / 2.5h');
  ctx.tabs('overview'); ctx.render();
  assert.ok(/class="card stand"/.test(out.html) && /What to do next/.test(out.html), 'the overview opens and closes with them');
  assert.ok(/An hour of each/.test(out.html) && /\/h/.test(out.html), 'and ranks an hour of work');
  assert.ok(/An average January/.test(out.html) && !/Quarters/.test(out.html), 'months of the year replaced quarters');

  // The clock: idle, running, forgotten, and the hand-typed session.
  ctx.tabs('jobs'); ctx.render();
  assert.ok(/data-act="tstart" data-p="shoot"/.test(out.html) && /id="tJob"/.test(out.html), 'pick a job, start a clock');
  assert.ok(/\+ new job/.test(out.html), 'with a new job one tap away');
  assert.ok(/\u23f1 1h 30m/.test(out.html), 'a booking shows its hours');
  books.time.push({ id: 's5', job: 'b4', phase: 'edit', start: Date.now() - 65e3, end: 0 });
  ctx.render();
  assert.ok(/id="tclock">0:01:0\d/.test(out.html) && /data-act="tstop"/.test(out.html), 'a running clock shows and stops');
  assert.ok(/Switch to shoot/.test(out.html) && !/Forgot to stop/.test(out.html), 'and can switch phase');
  books.time[books.time.length - 1].start = Date.now() - 11 * H;
  ctx.render();
  assert.ok(/Forgot to stop/.test(out.html), 'a clock over ten hours is called out');
  books.time.pop();
  ctx.tedit('__new'); ctx.render();
  assert.ok(/id="tfJob"/.test(out.html) && /Add the time/.test(out.html), 'time can be typed by hand');
  ctx.tedit('s1'); ctx.render();
  assert.ok(/id="tfStart" type="datetime-local" value="2026-10-01T/.test(out.html), 'and an old session edited');
  ctx.tedit(null);

  // Studio rent: Тетсуджин rents half the studio, invoiced as photography.
  // It is income (his call), but never photography: rent stays the full cost,
  // and photography only has to cover what the rent coming in does not.
  const shared = prep_({ tx: rows.concat([tx('2026-08-02', 100, 'Плащане по фактура 0000000020')]), types: [P],
    invoices: books.invoices.concat([inv('20', '2026-08-01', 100, '', 'Тетсуджин ЕООД')]) });
  ctx.setData(shared);
  const st2 = ctx.standing('2026-10-15');
  near(st2.rentIn, 100 / 12, 'studio rent in, a month');
  near(st2.floor, 400, 'rent stays the full cost');
  near(st2.need, 400 - 100 / 12, 'photography covers the rest');
  assert.equal(shared.tx.find(t => t._rent)._k, 'inc', 'the rent coming in is income');
  assert.equal(shared.tx.find(t => t._rent)._cat, 'Studio rent', 'under its own name');
  assert.ok(shared.live.some(i => i.no === '20') && !shared.photo.some(i => i.no === '20'),
    'the invoice stays in the register, out of the photography figures');
  assert.ok(!ctx.nextSteps(st2, '2026-10-15').steps.some(x => /Тетсуджин/.test(x.text)), 'and out of the steps');
  ctx.tabs('overview'); ctx.render();
  assert.ok(/Studio rent coming in/.test(out.html) && /Left for photography to cover/.test(out.html), 'the floor says so');

  // Contacts on the Clients tab.
  ctx.setData(Object.assign({}, shared, { clients: [
    { name: 'reg', contact: 'Мария', phone: '+359 88 123', email: 'm@reg.bg', note: '' }] }));
  ctx.tabs('clients'); ctx.render();
  assert.ok(/href="tel:\+35988123"/.test(out.html) && /mailto:m@reg\.bg/.test(out.html) && /Мария/.test(out.html),
    'a client shows who to call, matched on the name in any case');
  assert.ok(/studio rent/.test(out.html), 'the studio tenant is marked, not taken for a client');
  assert.ok(/Add contact/.test(out.html) && /Edit contact/.test(out.html), 'every client can get one');
  ctx.cedit('C3'); ctx.render();
  assert.ok(/id="cPhone" type="tel"/.test(out.html) && /data-act="csave"/.test(out.html), 'and the form opens in its row');
  ctx.cedit(null);
  ctx.setData(j);
}

console.log('render ok: every tab builds, due dates land on working days, the floor, steps and clock add up');
