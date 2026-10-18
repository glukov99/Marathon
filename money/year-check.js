/* Self-check for the Year grid: yearData() and yearStory() in app.js.
   Run on made-up rows:            node money/year-check.js
   Or print a real year as text:   curl -sL "<exec>?action=money&mt=..." | node money/year-check.js 2026
   Reads the functions out of app.js so there is no second copy to keep in step. */
const a = require('assert'), fs = require('fs');
const src = fs.readFileSync(__dirname + '/app.js', 'utf8');
const grab = n => {
  const m = src.match(new RegExp('^function ' + n + '\\([\\s\\S]*?^}', 'm'));
  a.ok(m, n + '() not found in app.js');
  return m[0];
};
const konst = n => {
  const m = src.match(new RegExp('^const ' + n + ' = .*?;$', 'm'));
  a.ok(m, n + ' not found in app.js');
  return m[0];
};
const env = new Function(
  [konst('M_INIT'), konst('kfmt'), konst('mIdx'), konst('z12'), konst('MON'), konst('eur'),
   konst('fmt'), konst('sfmt'), grab('classify'), grab('yearData'), grab('yearStory')].join('\n') +
  '; return { yearData, yearStory, classify };')();

const row = (d, amt, cat) => { const t = { d, a: amt, c: 'EUR', cat, acc: 'Main' };
  const k = env.classify(t); t._k = k.k; t._cat = k.cat; return t; };

// Months across, categories down, biggest first.
const rows = [row('2026-01-10', -100, 'Groceries'), row('2026-01-20', -50, 'Travel'),
  row('2026-03-05', -300, 'Travel'), row('2026-03-06', -20, 'Groceries'),
  row('2026-01-31', 500, 'Income'), row('2026-03-31', 100, 'Income'),
  row('2026-02-02', -9, 'Groceries'), row('2026-05-05', -7, 'Groceries')];
const d = env.yearData(rows, '2026');
a.strictEqual(d.cats[0].cat, 'Travel', 'biggest category first');
a.strictEqual(d.cats[0].total, 350);
a.deepStrictEqual(d.cats[0].months.slice(0, 4), [50, 0, 300, 0]);
a.strictEqual(d.cats[1].cat, 'Groceries');
a.strictEqual(d.total, 486);
a.strictEqual(d.inc[0], 500);
a.strictEqual(d.net[0], 350);          // 500 in, 150 out
a.strictEqual(d.from, 0); a.strictEqual(d.to, 4); a.strictEqual(d.months, 5);
// Other years and other currencies stay out.
const mixed = rows.concat([row('2025-07-07', -999, 'Travel'), row('2025-02-10', -400, 'Travel'),
  row('2025-03-10', -200, 'Travel'),
  Object.assign(row('2026-07-07', -999, 'Travel'), { c: 'GBP' })]);
a.strictEqual(env.yearData(mixed, '2026').cats[0].total, 350, 'GBP and other years excluded');
// An empty year does not throw and says so.
const none = env.yearData(rows, '2019');
a.deepStrictEqual([none.cats.length, none.total, none.months], [0, 0, 0]);
a.deepStrictEqual(env.yearStory(none, null), []);
// The story: biggest category, dearest month with its driver, like-for-like change.
const st = env.yearStory(d, env.yearData(mixed, '2025'));
a.ok(/^Travel is the biggest at €350\.00, 72% of everything/.test(st[0]), st[0]);
a.ok(/^Mar was the dearest month at €320\.00, mostly Travel at €300\.00\./.test(st[1]), st[1]);
// Only the months both years hold: Feb+Mar 2026 (329) against Feb+Mar 2025 (600).
// Not the whole of either year, and not July 2025, which 2026 has nothing to match.
a.ok(/^Over the 2 months both years cover, that is €271\.00 less than 2025 \(45%\)\.$/.test(st[2]), st[2]);
a.ok(st.length <= 3, 'at most three sentences');
// One overlapping month is not a comparison: the sentence is dropped, not faked.
// This is what kept "13538% more than 2025" off the page for the real 2026 data.
const thin = env.yearStory(d, env.yearData(rows.concat([row('2025-02-10', -400, 'Travel')]), '2025'));
a.ok(!thin.some(x => /both years cover/.test(x)), 'one overlapping month is not enough');
const noPrev = env.yearStory(d, env.yearData(rows.concat([row('2025-07-07', -999, 'Travel')]), '2025'));
a.ok(!noPrev.some(x => /same months/.test(x)), 'no comparison without overlapping data');
a.ok(/in the black/.test(noPrev[2]), noPrev[2]);

if (!process.stdin.isTTY && process.argv[2]) {
  // Print a real year from the API JSON on stdin: no amounts are written anywhere.
  const j = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const tx = j.tx.filter(t => t.own !== 'Business');
  tx.forEach(t => { const k = env.classify(t); t._k = k.k; t._cat = k.cat; });
  const y = env.yearData(tx, process.argv[2]), p = env.yearData(tx, String(+process.argv[2] - 1));
  console.log('\n' + process.argv[2] + '  months ' + (y.from + 1) + '-' + (y.to + 1) + '  spent ' + y.total.toFixed(2));
  env.yearStory(y, p.total ? p : null).forEach(s => console.log('  · ' + s));
  console.log('\n  ' + 'category'.padEnd(16) + 'J    F    M    A    M    J    J    A    S    O    N    D      total');
  y.cats.forEach(c => console.log('  ' + c.cat.padEnd(16) +
    c.months.map(v => (v ? Math.round(v) : '·').toString().padStart(4)).join(' ') + c.total.toFixed(0).padStart(9)));
}
console.log('year: all cases pass');
