/* Robotics. The builds, the parts box, and what to learn next.

   Three lists: projects, parts and lessons. Like the Ideas jar, they are saved
   on this device first, then to Drive through HubSync under one key, and
   merge by id so a part added on the phone and a project edited on the laptop
   both survive. The newer edit of the same item wins. Delete leaves a `gone`
   marker, so the other device does not bring the item back.

   A project lists the parts it needs. A part's free count is what you own
   minus what every project needs, finished ones included: those parts are
   inside the device now.

   The first open starts from the plan in the robotics chat (Oct 2026). The
   starting items have fixed ids, so two devices opening at once do not
   double them.

   Run: node robotics/check.js */
const KEY = 'lifehub-robotics';
const LISTS = ['projects', 'parts', 'lessons'];
const PSTATES = [['build', 'Building'], ['parts', 'Waiting for parts'], ['idea', 'Ideas'], ['paused', 'Paused'], ['done', 'Working']];
const LSTATES = [['doing', 'Learning now'], ['todo', 'To learn'], ['done', 'Learned']];

function mergeList(a, b) {
  const by = {};
  (a || []).concat(b || []).forEach(x => {
    if (x && x.id && (!by[x.id] || (x.u || 0) > (by[x.id].u || 0))) by[x.id] = x;
  });
  return Object.values(by).sort((x, y) => (x.at || 0) - (y.at || 0));
}
const merge = (a, b) => Object.fromEntries(LISTS.map(k => [k, mergeList(a && a[k], b && b[k])]));
const sig = d => LISTS.map(k => ((d && d[k]) || []).map(x => x.id + ':' + (x.u || 0)).sort().join()).join('|');
const live = l => (l || []).filter(x => !x.gone);

function stock(d) {
  const out = {};
  live(d.parts).forEach(p => { out[p.id] = { have: +p.qty || 0, need: 0, free: +p.qty || 0, by: [] }; });
  live(d.projects).forEach(pr => Object.entries(pr.need || {}).forEach(([id, n]) => {
    const s = out[id]; if (!s || !(n > 0)) return;
    s.need += n; s.free -= n; s.by.push([pr.name, n]);
  }));
  return out;
}

// "Wokwi https://wokwi.com/..." -> ['Wokwi', url]; a bare address is named by its site.
function links(t) {
  return String(t || '').split('\n').map(l => {
    const m = l.match(/https?:\/\/\S+/); if (!m) return null;
    return [l.replace(m[0], '').trim() || m[0].replace(/^https?:\/\/(www\.)?/, '').split('/')[0], m[0]];
  }).filter(Boolean);
}

function seed() {
  let at = 0;
  const it = o => Object.assign({ at: ++at, u: 1 }, o);
  return {
    projects: [
      it({ id: 'p-lights', name: 'Living room lights', s: 'parts',
        next: 'While the parts travel (due Nov 3–11): make the Tuya cloud project and note the Access ID, Secret and each bulb\'s Device ID.',
        notes: 'Bulbs on when someone is in the room and it is dark, day or night. LD2410C radar for presence (sees you sitting still), BH1750 for light. The ESP32 calls Tuya\'s cloud itself: no Home Assistant box.\nOn: someone there and lux under 30–50. Off: empty for a few minutes. Never let brightness turn them off, or they flicker. Keep the light sensor out of the bulbs\' direct light.',
        links: 'Tuya developer platform https://platform.tuya.com', need: { 'x-esp32': 1, 'x-radar': 1, 'x-lux': 1 } }),
      it({ id: 'p-corridor', name: 'Corridor lights', s: 'idea', next: 'Copy the living room build once it works.',
        notes: '', links: '', need: { 'x-esp32': 1, 'x-radar': 1, 'x-lux': 1 } }),
      it({ id: 'p-scrub', name: 'Scrubber robot (Wokwi)', s: 'paused', next: '',
        notes: 'The September simulation: ESP32, two stepper drivers, an MPU6050 and a button. It finds the top and bottom, travels and scrubs. Files in Downloads/Robotics basics.',
        links: 'Wokwi https://wokwi.com/projects/474134994490999809', need: {} }),
      it({ id: 'p-aquarium', name: 'Aquarium robot', s: 'idea', next: '', notes: '', links: '', need: {} }),
      it({ id: 'p-plants', name: 'Plant watering', s: 'idea', next: '', notes: '', links: '', need: {} }),
      it({ id: 'p-viper', name: 'Viper RC', s: 'idea', next: '', notes: '', links: '', need: {} }),
    ],
    parts: [
      it({ id: 'x-esp32', name: 'ESP32-C3 SuperMini (pins soldered)', qty: 5, due: true, where: '', note: 'AliExpress, SZHJW "Weld 5pcs"', link: '' }),
      it({ id: 'x-radar', name: 'HLK-LD2410C presence radar', qty: 2, due: true, where: '', note: 'The C, not the S: the S speaks another protocol.', link: '' }),
      it({ id: 'x-lux', name: 'BH1750 light ball', qty: 2, due: true, where: '', note: 'Check its markings for 3.3 V or 5 V before wiring.', link: '' }),
      it({ id: 'x-wires', name: 'Jumper wires, 3 kinds, 120', qty: 1, due: true, where: '', note: '', link: '' }),
      it({ id: 'x-iron', name: 'Soldering iron', qty: 1, due: false, where: '', note: '', link: '' }),
    ],
    lessons: [
      ['l-blink', 'Blink an LED and print to Serial on the ESP32-C3 with PlatformIO', 'p-lights'],
      ['l-power', 'Power and logic levels: 5 V and 3.3 V pins, never 5 V into a GPIO', 'p-lights'],
      ['l-input', 'Read a digital input: the radar\'s OUT pin says someone is there', 'p-lights'],
      ['l-i2c', 'I2C: read lux from the BH1750', 'p-lights'],
      ['l-wifi', 'Wi-Fi and HTTPS from the ESP32 (lower the transmit power if it drops)', 'p-lights'],
      ['l-tuya', 'Sign a Tuya cloud request (HMAC-SHA256) and switch one bulb', 'p-lights'],
      ['l-state', 'A state machine: call the API only when the light should change', 'p-lights'],
      ['l-solder', 'Soldering: heat pad and pin together, then feed the solder', ''],
      ['l-stepper', 'Stepper motors with a STEP/DIR driver', 'p-scrub'],
      ['l-imu', 'Read motion from an MPU6050', 'p-scrub'],
      ['l-case', 'Design and 3D-print a case', ''],
    ].map(([id, t, project]) => it({ id, t, project, s: 'todo', link: '' })),
  };
}

if (typeof module !== 'undefined') module.exports = { merge, sig, live, stock, links, seed };

if (typeof document !== 'undefined') (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } };
  const st = load();
  let d = st && st.projects ? merge(st, {}) : seed();
  let tab = (st && st.tab) || 'projects';
  let editing = null;

  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.assign({ tab }, d))); } catch (e) {} };
  if (!st) keep();
  const say = t => { $('#store').textContent = t; };
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); };
  const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function sync() {
    if (!window.HubSync || !HubSync.on()) { say('Saved on this device only. Set up sync on the home page to see it on every device.'); return; }
    const r = await HubSync.pull(KEY);
    if (!r || r.error) { say('Offline: saved on this device, it syncs next time.'); return; }
    const remote = r.data || {};
    const m = merge(d, remote);
    if (sig(m) !== sig(d)) { d = m; keep(); render(); }
    if (sig(m) !== sig(remote)) HubSync.push(KEY, m);
    else say('Synced across devices');
  }
  if (window.HubSync) HubSync.onStatus(t => say(t === 'Synced' ? 'Synced across devices' : t));

  function save() { keep(); render(); sync(); }
  const find = (l, i) => d[l].find(x => x.id === i);
  const touch = x => { x.u = Date.now(); };

  const opts = (list, cur) => list.map(([k, l]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const linkRow = t => { const l = links(t); return l.length ? `<div class="meta">${l.map(([n, u]) =>
    `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div>` : ''; };
  const field = (lbl, name, v, ph, area) => `<label class="fld"><span>${lbl}</span>${area
    ? `<textarea name="${name}" rows="${area}" placeholder="${esc(ph || '')}">${esc(v || '')}</textarea>`
    : `<input name="${name}" value="${esc(v || '')}" placeholder="${esc(ph || '')}">`}</label>`;
  const edActs = (l, x) => `<div class="acts"><button class="btn sm" data-act="save" data-l="${l}" data-id="${x.id}">Save</button>
    <button class="btn sm ghost" data-act="cancel">Cancel</button>
    <button class="btn sm ghost" data-act="del" data-l="${l}" data-id="${x.id}">Delete</button></div>`;
  const group = (states, items, card) => states.map(([k, l]) => {
    const g = items.filter(x => x.s === k);
    return g.length ? `<div class="day">${l}</div>` + g.map(card).join('') : '';
  }).join('');

  function project(x, S, parts) {
    if (editing === x.id) return `<div class="idea ed">
      ${field('Name', 'name', x.name)}
      ${field('Next step', 'next', x.next, 'The one thing to do next')}
      ${field('Notes', 'notes', x.notes, 'Wiring, thresholds, what worked', 4)}
      ${field('Links, one per line: a name, then the address', 'links', x.links, 'Wokwi https://wokwi.com/projects/...', 3)}
      ${parts.length ? `<div class="fld"><span>Parts it needs</span>${parts.map(p =>
        `<label class="need"><input type="number" min="0" inputmode="numeric" data-need="${p.id}" value="${(x.need || {})[p.id] || ''}" placeholder="0">${esc(p.name)}</label>`).join('')}</div>` : ''}
      ${edActs('projects', x)}</div>`;
    const need = Object.entries(x.need || {}).filter(([i, n]) => n > 0 && S[i]).map(([i, n]) => {
      const p = find('parts', i);
      return `${n} × ${esc(p.name)}${S[i].free < 0 ? ` <b class="short">short ${-S[i].free}</b>` : p.due ? ' (on order)' : ''}`;
    });
    return `<div class="idea">
      <div class="ttl"><b>${esc(x.name)}</b><select data-ch="pstate" data-id="${x.id}" aria-label="Status of ${esc(x.name)}">${opts(PSTATES, x.s)}</select></div>
      ${x.next ? `<p class="next"><span>Next</span>${esc(x.next)}</p>` : ''}
      ${x.notes ? `<p class="notes">${esc(x.notes)}</p>` : ''}
      ${need.length ? `<div class="meta">${need.join(' · ')}</div>` : ''}
      ${linkRow(x.links)}
      <div class="acts"><button class="btn sm ghost" data-act="edit" data-id="${x.id}">Edit</button></div></div>`;
  }

  function part(p, S) {
    if (editing === p.id) return `<div class="idea ed">
      ${field('Name', 'name', p.name)}
      ${field('Kept in', 'where', p.where, 'Drawer, box, shelf')}
      ${field('Note', 'note', p.note, 'Variant, voltage, seller')}
      ${field('Where to buy again', 'link', p.link, 'https://...')}
      <label class="chk"><input type="checkbox" name="due"${p.due ? ' checked' : ''}> On order, not here yet</label>
      ${edActs('parts', p)}</div>`;
    const s = S[p.id];
    return `<div class="idea">
      <div class="ttl"><b>${esc(p.name)}</b>${p.due ? '<span class="tag">On order</span>' : ''}</div>
      <div class="cnt"><button class="btn sm ghost" data-act="qty" data-id="${p.id}" data-n="-1" aria-label="One fewer ${esc(p.name)}">−</button>
        <span><b>${s.have}</b> owned · ${s.free < 0 ? `<b class="short">short ${-s.free}</b>` : `<b>${s.free}</b> free`}</span>
        <button class="btn sm ghost" data-act="qty" data-id="${p.id}" data-n="1" aria-label="One more ${esc(p.name)}">+</button></div>
      ${s.by.length ? `<div class="meta">For ${s.by.map(([n, k]) => `${esc(n)} (${k})`).join(', ')}</div>` : ''}
      ${p.where || p.note ? `<p class="notes">${[p.where && 'Kept in ' + p.where, p.note].filter(Boolean).map(esc).join('\n')}</p>` : ''}
      ${linkRow(p.link)}
      <div class="acts">${p.due ? `<button class="btn sm" data-act="arrived" data-id="${p.id}">Arrived</button>` : ''}
        <button class="btn sm ghost" data-act="edit" data-id="${p.id}">Edit</button></div></div>`;
  }

  function lesson(x, P) {
    const pr = [['', 'No project']].concat(P.map(p => [p.id, p.name]));
    if (editing === x.id) return `<div class="idea ed">
      ${field('What to learn', 't', x.t, '', 2)}
      <label class="fld"><span>For</span><select name="project">${opts(pr, x.project || '')}</select></label>
      ${field('Tutorial or docs', 'link', x.link, 'https://...')}
      ${edActs('lessons', x)}</div>`;
    const b = (s, l, ghost) => `<button class="btn sm${ghost ? ' ghost' : ''}" data-act="lstate" data-id="${x.id}" data-s="${s}">${l}</button>`;
    const p = P.find(q => q.id === x.project);
    return `<div class="idea"><p>${esc(x.t)}</p>
      ${p || x.link ? `<div class="meta">${p ? `<span class="tag">${esc(p.name)}</span>` : ''}${links(x.link).map(([n, u]) =>
        `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('')}</div>` : ''}
      <div class="acts">${x.s === 'todo' ? b('doing', 'Start') + b('done', 'Learned', 1)
        : x.s === 'doing' ? b('done', 'Learned') + b('todo', 'Not now', 1) : b('doing', 'Again', 1)}
        <button class="btn sm ghost" data-act="edit" data-id="${x.id}">Edit</button></div></div>`;
  }

  function render() {
    const P = live(d.projects), parts = live(d.parts).sort((a, b) => a.name.localeCompare(b.name)), L = live(d.lessons), S = stock(d);
    $('#tabs').innerHTML = [['projects', 'Projects', P.filter(x => x.s !== 'done').length], ['parts', 'Parts', parts.length],
      ['learn', 'Learn', L.filter(x => x.s !== 'done').length]].map(([k, l, n]) =>
      `<button role="tab" data-act="tab" data-k="${k}" aria-selected="${tab === k}">${l}<i>${n}</i></button>`).join('');
    ['projects', 'parts', 'learn'].forEach(k => $('#t-' + k).classList.toggle('hidden', k !== tab));
    const short = parts.filter(p => S[p.id].free < 0);
    $('#pList').innerHTML = (short.length ? `<div class="panel warn">Short for your builds: ${short.map(p =>
      `${-S[p.id].free} × ${esc(p.name)}`).join(', ')}</div>` : '') +
      (P.length ? group(PSTATES, P, x => project(x, S, parts)) : '<div class="empty">No builds yet. Add the first one above.</div>');
    $('#xList').innerHTML = parts.length ? parts.map(p => part(p, S)).join('') : '<div class="empty">The parts box is empty.</div>';
    $('#lList').innerHTML = L.length ? group(LSTATES, L, x => lesson(x, P)) : '<div class="empty">Nothing to learn yet. Add a skill a build needs.</div>';
  }

  document.addEventListener('submit', e => {
    const f = e.target.closest('form[data-add]'); if (!f) return;
    e.preventDefault();
    const t = f.querySelector('[name=t]').value.trim();
    if (!t) { f.querySelector('[name=t]').focus(); return; }
    const now = Date.now(), base = { id: id(), at: now, u: now };
    const l = f.dataset.add;
    if (l === 'projects') d.projects.push(Object.assign(base, { name: t, s: 'idea', next: '', notes: '', links: '', need: {} }));
    if (l === 'parts') d.parts.push(Object.assign(base, { name: t, qty: Math.max(0, parseInt(f.querySelector('[name=qty]').value, 10) || 1),
      due: false, where: '', note: '', link: '' }));
    if (l === 'lessons') d.lessons.push(Object.assign(base, { t, s: 'todo', project: '', link: '' }));
    f.reset();
    save();
    toast('Added');
  });

  document.addEventListener('change', e => {
    const s = e.target.closest('[data-ch="pstate"]'); if (!s) return;
    const x = find('projects', s.dataset.id); if (!x) return;
    x.s = s.value; touch(x); save();
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, l = b.dataset.l;
    if (a === 'tab') { tab = b.dataset.k; editing = null; keep(); render(); return; }
    if (a === 'edit') { editing = b.dataset.id; render(); return; }
    if (a === 'cancel') { editing = null; render(); return; }
    if (a === 'qty') { const p = find('parts', b.dataset.id); p.qty = Math.max(0, (+p.qty || 0) + +b.dataset.n); touch(p); save(); return; }
    if (a === 'arrived') { const p = find('parts', b.dataset.id); p.due = false; touch(p); save(); toast('In the parts box'); return; }
    if (a === 'lstate') { const x = find('lessons', b.dataset.id); x.s = b.dataset.s; touch(x); save(); return; }
    if (a === 'del') {
      const x = find(l, b.dataset.id);
      if (!confirm('Delete ' + (x.name || x.t) + '?')) return;
      x.gone = 1; touch(x); editing = null; save(); toast('Deleted'); return;
    }
    if (a === 'save') {
      const x = find(l, b.dataset.id), box = b.closest('.ed'), v = {};
      box.querySelectorAll('[name]').forEach(i => { v[i.name] = i.type === 'checkbox' ? i.checked : i.value.trim(); });
      if (l === 'projects') {
        if (!v.name) return;
        v.need = {};
        box.querySelectorAll('[data-need]').forEach(i => { const n = parseInt(i.value, 10); if (n > 0) v.need[i.dataset.need] = n; });
      }
      if ((l === 'parts' && !v.name) || (l === 'lessons' && !v.t)) return;
      Object.assign(x, v); touch(x); editing = null; save();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  render();
  sync();
})();
