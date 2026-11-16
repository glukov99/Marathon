/* shared/actions.json, the controls Shika can use: well formed, and the safety levels hold.
   Run: node actions-check.js */
const fs = require('fs'), assert = require('assert');
const A = JSON.parse(fs.readFileSync(__dirname + '/shared/actions.json', 'utf8')).actions;
const names = new Set();
const refs = v => JSON.stringify(v).match(/\{(\w+)\}/g) || [];
A.forEach(a => {
  assert.ok(/^[a-z]+\.[a-z_]+$/.test(a.name), 'name ' + a.name);
  assert.ok(!names.has(a.name), 'twice: ' + a.name); names.add(a.name);
  assert.ok(['read', 'now', 'ask'].includes(a.level), a.name + ' level');
  assert.ok(['money', 'heat', 'time', 'lights'].includes(a.route), a.name + ' route');
  assert.ok(a.what && a.what.length > 10, a.name + ' says what it does');
  const params = Object.keys(a.params || {});
  (a.required || []).forEach(r => assert.ok(params.includes(r), a.name + ': required ' + r + ' is not a param'));
  refs(a.fixed || {}).forEach(r => assert.ok(params.includes(r.slice(1, -1)), a.name + ': ' + r + ' is not a param'));
  (a.json || []).forEach(j => assert.ok(j in (a.fixed || {}), a.name + ': json ' + j + ' not in fixed'));
  // The rules Georgi chose (16 Nov 2026): deleting, money, invoices and sending always wait for his yes.
  const f = a.fixed || {};
  if (/delete|cancel|statements|issue|send|^heat\.holiday|price|limits|doc\.edit/.test(a.name) || f.op === 'del' || f.cmd === 'del')
    assert.strictEqual(a.level, 'ask', a.name + ' must wait for his yes');
  if (a.level === 'read') assert.ok(!/go$/.test(String(f.doc || f.seasonov || '')), a.name + ' reads only');
});
console.log('actions ok: ' + A.length + ' controls (' + ['read', 'now', 'ask'].map(l => A.filter(a => a.level === l).length + ' ' + l).join(', ') + ')');
