/* Every page must load the shared files its code actually uses.

   This exists because the Business page shipped calling Invoices.cancelled
   with no <script> tag for shared/invoices.js, and the page died on load.
   The edit that should have added the tag matched "shared/charts.js", but
   bump.py had already rewritten it to "shared/charts.js?v=...", so the
   replacement silently did nothing and every other check still passed: they
   all load the shared files themselves.

   Run: node scripts-check.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = __dirname;
const SHARED = ['Year', 'Charts', 'Invoices', 'CatPick', 'HubSync'];
const FILE = { Year: 'year.js', Charts: 'charts.js', Invoices: 'invoices.js',
  CatPick: 'catpick.js', HubSync: 'sync.js' };

// page html -> the javascript that runs on it (inline, plus its own app.js)
const PAGES = [['index.html', []], ['money/index.html', ['money/app.js']],
  ['business/index.html', ['business/app.js']],
  ['jar/index.html', ['jar/app.js']], ['robotics/index.html', ['robotics/app.js']]];

let checked = 0;
PAGES.forEach(([page, scripts]) => {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const code = html + scripts.map(f => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  SHARED.forEach(name => {
    // Used as a global, not merely named in a comment or a path.
    if (!new RegExp('(^|[^\\w.\'"/])' + name + '\\s*\\.', 'm').test(code)) return;
    const tag = new RegExp('<script src="[^"]*' + FILE[name].replace('.', '\\.') + '[^"]*"');
    assert.ok(tag.test(html),
      page + ' uses ' + name + '.* but does not load shared/' + FILE[name]);
    checked++;
  });
});
console.log('scripts ok: ' + checked + ' shared files are loaded where they are used');

// Every page carries the shared menu, and the menu lists every page.
const nav = fs.readFileSync(path.join(root, 'shared/nav.js'), 'utf8');
// kit/ is the separate hub for other people, with its own bar and sign-in.
fs.readdirSync(root).filter(d => d !== 'kit' && fs.existsSync(path.join(root, d, 'index.html'))).forEach(d => {
  assert.ok(/<div id="lhn"><\/div><script src="[^"]*shared\/nav\.js/.test(
    fs.readFileSync(path.join(root, d, 'index.html'), 'utf8')), d + '/index.html does not load the menu');
  assert.ok(nav.includes(`['${d}/'`), d + '/ is missing from GROUPS in shared/nav.js');
});
assert.ok(/<script src="shared\/nav\.js/.test(fs.readFileSync(path.join(root, 'index.html'), 'utf8')), 'home has no menu');
console.log('menu ok: every page loads it and is listed in it');
