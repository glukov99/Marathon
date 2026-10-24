/* Robotics: two devices must never lose an item, and the free counts must add up.
   Run: node robotics/check.js */
const assert = require('assert');
const { merge, sig, live, stock, links, seed } = require('./app.js');

const s = seed();
assert.strictEqual(sig(merge(s, seed())), sig(s), 'two devices opening for the first time do not double the starting items');

// the phone adds a part, the laptop edits a project, both survive
const phone = merge(s, {}), laptop = merge(s, {});
phone.parts.push({ id: 'n1', name: 'Servo', qty: 2, at: 99, u: 50 });
Object.assign(laptop.projects.find(x => x.id === 'p-corridor'), { s: 'build', u: 60 });
const m = merge(phone, laptop);
assert.ok(m.parts.some(x => x.id === 'n1'), 'the new part is kept');
assert.strictEqual(m.projects.find(x => x.id === 'p-corridor').s, 'build', 'the newer edit wins');
assert.strictEqual(sig(merge(m, phone)), sig(m), 'merging again changes nothing');

// a delete is not undone by the device that still has the item
const gone = merge(m, {}); Object.assign(gone.parts.find(x => x.id === 'n1'), { gone: 1, u: 70 });
assert.ok(!live(merge(phone, gone).parts).some(x => x.id === 'n1'), 'deleted stays deleted');

// free = owned minus what every project needs; a deleted project gives its parts back
const st = stock(s);
assert.deepStrictEqual([st['x-esp32'].have, st['x-esp32'].free], [5, 3], 'two light builds take two of five boards');
assert.strictEqual(st['x-radar'].free, 0);
assert.strictEqual(st['x-wires'].free, 1, 'the wire set is shared, not reserved');
const more = merge(s, { projects: [{ id: 'p3', name: 'Hall', at: 9, u: 9, need: { 'x-radar': 1, nope: 4 } }] });
assert.strictEqual(stock(more)['x-radar'].free, -1, 'a third radar build is short by one');
assert.deepStrictEqual(stock(more)['x-radar'].by.map(b => b[0]), ['Living room lights', 'Corridor lights', 'Hall']);
more.projects.find(x => x.id === 'p3').gone = 1;
assert.strictEqual(stock(more)['x-radar'].free, 0);

assert.deepStrictEqual(links('Wokwi https://wokwi.com/projects/1\nhttps://www.espressif.com/x\nno address'),
  [['Wokwi', 'https://wokwi.com/projects/1'], ['espressif.com', 'https://www.espressif.com/x']]);
assert.deepStrictEqual(links('javascript:alert(1)'), [], 'only web addresses become links');
console.log('robotics ok');
