/* The hub's findings (shared/findings.js) run the way Shika runs them: every rule in shared/rules.json, its files
   loaded into a fresh sandbox, on made-up data. Run: node findings-check.js */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const reg = JSON.parse(fs.readFileSync(path.join(__dirname, 'shared/rules.json'), 'utf8'));
function run(rule, data, today) {
  const ctx = vm.createContext({});
  rule.files.forEach(f => vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), ctx));
  return vm.runInContext(rule.call, ctx)(data, today);
}
const today = new Date('2026-11-16T12:00'), by = n => reg.rules.find(r => r.name === n);
const shape = f => assert.ok(f.id && f.feature && f.title && f.why && 'ops' in f && 'urgent' in f, 'shape: ' + JSON.stringify(f));

// A shoot place visited with no booking that day; another day that is booked.
const at = (d, h) => new Date(d + 'T' + h).getTime();
const time = { places: [{ name: 'Photoshoot', lat: 42.1, lon: 24.7, r: 150 }],
  visits: [{ lat: 42.1, lon: 24.7, start: at('2026-11-12', '10:00'), end: at('2026-11-12', '11:30') },
           { lat: 42.1, lon: 24.7, start: at('2026-11-10', '10:00'), end: at('2026-11-10', '11:00') }] };
const tx = [{ d: '2026-10-21', a: 200, c: 'EUR', own: 'Business', cat: 'Income', who: 'Client A', desc: 'ф-ра: 0000000081' }];
const biz = { bookings: [{ shoot: '2026-11-10' }], tx,
  invoices: [{ no: '0000000081', issued: '2026-10-20', client: 'Client A', amount_eur: 200 },
             { no: '0000000082', issued: '2026-10-25', client: 'Client B', amount_eur: 300 },
             { no: '0000000083', issued: '2026-11-10', client: 'Client C', amount_eur: 90 },
             { no: '0000000084', issued: '2026-10-01', client: 'Client D', amount_eur: 50, status: 'cancelled' }] };
let f = run(by('shoots'), { time, biz }, today); f.forEach(shape);
assert.strictEqual(JSON.stringify(f.map(x => x.id)), JSON.stringify(['shoot:2026-11-12']), 'only the unbooked day');
assert.ok(/90 min/.test(f[0].why), 'says how long');

f = run(by('unpaid'), { biz }, today); f.forEach(shape);
assert.strictEqual(JSON.stringify(f.map(x => x.id)), JSON.stringify(['unpaid:0000000082:2026-10-25']), 'paid, too new and cancelled are left out');
assert.ok(/Client B/.test(f[0].title) && /22 days/.test(f[0].title), f[0].title);

const money = { tx: [] }, r = (d, a, who, own) => money.tx.push({ d, a, c: 'EUR', who, desc: '', cat: 'Subscriptions', own: own || 'Personal' });
['06', '07', '08', '09', '10'].forEach(m => r('2026-' + m + '-03', -9.99, 'Streamy'));
r('2026-11-03', -12.99, 'Streamy');
['06', '07', '08', '09', '10'].forEach(m => r('2026-' + m + '-04', -20, 'Bizsoft', 'Business'));
r('2026-11-04', -30, 'Bizsoft', 'Business');
f = run(by('subs-up'), { money }, today); f.forEach(shape);
assert.strictEqual(JSON.stringify(f.map(x => x.feature + ' ' + x.title)), JSON.stringify(['subscriptions Streamy went up to €12.99']), 'personal rise only');
assert.ok(/€36 a year/.test(f[0].why), f[0].why);
reg.rules.forEach(x => assert.ok(x.files.every(p => fs.existsSync(path.join(__dirname, p))), x.name + ': files exist'));
console.log('findings ok: ' + reg.rules.length + ' rules');
