/* A page must not render nothing because one shared file did not arrive.

   index.html carries no version of its own, so a browser can serve a cached
   copy of it next to a fresh app.js. That happened: the cached Business page
   had no tag for shared/invoices.js, app.js read Invoices.cancelled on its
   first pass, threw, and the page showed its static header and nothing else.
   Every other check passed, because they all supply the shared files
   themselves.

   So: evaluate each app.js with NO shared globals at all. It must get to the
   end without throwing, which means nothing may touch a shared module at load
   time - only inside a function, after boot() has fetched what is missing.

   Run: node boot-check.js */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = __dirname;

const el = () => ({ classList: { toggle() {}, remove() {}, add() {} },
  set innerHTML(v) {}, set textContent(v) {}, set disabled(v) {},
  addEventListener() {}, setAttribute() {}, querySelectorAll: () => [],
  querySelector: () => el(), dataset: {}, style: {}, appendChild() {}, remove() {} });
const doc = () => ({ querySelector: () => el(), querySelectorAll: () => [],
  getElementById: () => el(), addEventListener() {}, createElement: () => el(),
  head: el(), body: el() });
const ls = () => { const m = {}; return { getItem: k => m[k] || null, setItem() {}, removeItem() {} }; };

[['money/app.js', 'money/index.html'], ['business/app.js', 'business/index.html']].forEach(([app, page]) => {
  const code = fs.readFileSync(path.join(root, app), 'utf8');
  const added = [];
  const d = doc();
  d.createElement = () => { const s = el(); added.push(s); return s; };
  d.head = { appendChild(s) { added.push(s); } };
  assert.doesNotThrow(() => {
    new Function('window', 'document', 'localStorage', 'fetch', 'location', 'history',
      'confirm', 'prompt', 'alert', 'Year', 'Charts', 'Invoices', 'CatPick', 'HubSync',
      code)({}, d, ls(), () => new Promise(() => {}), { search: '', pathname: '/' },
      { replaceState() {} }, () => true, () => null, () => null);
  }, app + ' must evaluate with no shared file present');
  // And it must then go and get them, not simply give up quietly.
  assert.ok(added.length, app + ' should fetch the shared files it is missing');
  assert.ok(fs.readFileSync(path.join(root, page), 'utf8').includes('app.js'),
    page + ' still loads its app.js');
});
console.log('boot ok: both pages survive a shared file going missing');
