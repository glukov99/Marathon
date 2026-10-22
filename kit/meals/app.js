/* Meals page of the kit. Lists (in the person's own backend):
     settings  {id:'me', target}              daily calorie target, 0 = the plan as written
     week      {id:'<date>_<slot>', meal}     meal is an idea id or 'own:<id>'
     meals     {id, name, slot, kcal, items}  their own meals; items is one product per line
     shop      {id:'t-<key>', done} ticks,  {id:'x-<n>', name} extras
   The ideas, products and calorie shares come from the backend (Ideas.js). */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const SL = { breakfast: 'Breakfast', snack: 'Snack', lunch: 'Lunch', dinner: 'Dinner', main: 'Lunch or dinner' };
  const iso = d => d.toLocaleDateString('en-CA');
  const days = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i); return iso(d); });
  const dname = s => new Date(s + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  let D = null, tab = location.hash === '#shop' ? 'shop' : 'week', open = null, ideaKind = 'breakfast';
  try { D = JSON.parse(localStorage.getItem('kit-ideas')); } catch (e) {}

  const target = () => +((Kit.get('settings', 'me') || {}).target) || 0;
  const idea = id => D.ideas.find(i => i[0] === id);
  const own = id => Kit.get('meals', id);
  const shareSlot = s => (s === 'main' ? 'lunch' : s);

  // A planned or browsed meal, ready to show: name, kcal at the target, lines, tip.
  function view(ref, slot) {
    if (!ref) return null;
    if (ref.startsWith('own:')) {
      const o = own(ref.slice(4)); if (!o) return null;
      return { name: o.name, kcal: +o.kcal || null, lines: String(o.items || '').split('\n').filter(Boolean).map(t => ({ label: t, text: '' })), tip: 'Your own meal, as you wrote it.', own: true };
    }
    const i = idea(ref); if (!i) return null;
    const f = Plan.factor(i, slot, target(), D.products, D.shares);
    return { name: i[2], kcal: Math.round(Plan.kcal(i, D.products) * f), lines: Plan.lines(i, f, D.products),
      tip: (i[5] ? 'Makes ' + i[5] + ' portions. ' : '') + i[4], serves: i[5] };
  }
  const detail = v => `<ul>${v.lines.map(l => `<li>${l.text ? `<b>${esc(l.text)}</b> ` : ''}${esc(l.label)}</li>`).join('')}</ul>` +
    (v.tip ? `<div class="tip">${esc(v.tip)}</div>` : '');

  /* ---------- Week ---------- */
  function week() {
    $('t-week').innerHTML = days().map(d => {
      let tot = 0, any = false;
      const rows = Plan.SLOTS.map(s => {
        const w = Kit.get('week', d + '_' + s), v = w && view(w.meal, s), k = d + '_' + s;
        if (v && v.kcal) { tot += v.kcal; any = true; }
        return `<div class="slot" data-act="slot" data-k="${k}"><span class="sl">${SL[s]}</span>` +
          `<span class="nm${v ? '' : ' none'}">${v ? esc(v.name) : '+ Choose'}</span>` +
          `<span class="kc">${v && v.kcal ? v.kcal + ' kcal' : ''}</span></div>` +
          (open === k && v ? `<div class="det">${detail(v)}<div class="row"><button class="btn sm ghost" data-act="pick" data-k="${k}">Change</button>` +
            `<button class="btn sm ghost" data-act="clear" data-k="${k}">Remove</button></div></div>` : '');
      }).join('');
      return `<div class="card day"><div class="dh"><h2>${dname(d)}</h2><span class="sub">${any ? tot + ' kcal' : ''}</span></div>${rows}</div>`;
    }).join('');
  }

  function choose(k) {
    const [d, s] = k.split('_');
    const ideas = D.ideas.filter(i => Plan.fits(i, s));
    const mine = Kit.list('meals').filter(o => o.slot === s || (o.slot === 'main' && (s === 'lunch' || s === 'dinner')));
    sheet(`${SL[s]} · ${dname(d)}`,
      (mine.length ? '<div class="k" style="margin:4px 0">Your meals</div>' + mine.map(o =>
        `<div class="idea" data-act="set" data-k="${k}" data-m="own:${o.id}"><div class="r"><b>${esc(o.name)}</b><span class="sub">${o.kcal ? o.kcal + ' kcal' : ''}</span></div></div>`).join('') : '') +
      '<div class="k" style="margin:12px 0 4px">Ideas</div>' + ideas.map(i => {
        const v = view(i[0], s);
        return `<div class="idea" data-act="set" data-k="${k}" data-m="${i[0]}"><div class="r"><b>${esc(i[2])}</b><span class="sub">${v.kcal} kcal</span></div></div>`;
      }).join('') +
      `<p><button class="btn ghost" data-act="newown" data-slot="${s === 'lunch' || s === 'dinner' ? 'main' : s}">+ Your own meal</button></p>`);
  }

  /* ---------- Ideas ---------- */
  function ideasTab() {
    const kinds = [['breakfast', 'Breakfast'], ['snack', 'Snack'], ['main', 'Lunch & dinner'], ['own', 'Your own']];
    let body;
    if (ideaKind === 'own') {
      const mine = Kit.list('meals');
      body = (mine.length ? mine.map(o => `<div class="idea" data-act="open" data-k="own:${o.id}"><div class="r"><b>${esc(o.name)}</b><span class="sub">${SL[o.slot]}${o.kcal ? ' · ' + o.kcal + ' kcal' : ''}</span></div>` +
        (open === 'own:' + o.id ? `<div class="det" style="padding-left:0">${detail(view('own:' + o.id, o.slot))}<div class="row"><button class="btn sm ghost" data-act="editown" data-id="${o.id}">Edit</button><button class="btn sm ghost" data-act="delown" data-id="${o.id}">Delete</button></div></div>` : '') + '</div>').join('')
        : '<div class="empty">No meals of your own yet.</div>') +
        '<p><button class="btn" data-act="newown" data-slot="main">+ Add your own meal</button></p>';
    } else {
      body = D.ideas.filter(i => i[1] === ideaKind).map(i => {
        const v = view(i[0], shareSlot(i[1]));
        return `<div class="idea" data-act="open" data-k="${i[0]}"><div class="r"><b>${esc(i[2])}</b><span class="sub">${v.kcal} kcal</span></div>` +
          (open === i[0] ? `<div class="det" style="padding-left:0">${detail(v)}</div>` : '') + '</div>';
      }).join('');
    }
    $('t-ideas').innerHTML = `<div class="chips" style="margin-top:14px">${kinds.map(([k, n]) =>
      `<button data-act="kind" data-k="${k}" aria-pressed="${ideaKind === k}">${n}</button>`).join('')}</div><div class="card">${body}</div>` +
      `<p class="sub">Amounts are for your target of ${target() ? target() + ' kcal a day' : 'the plan as written'}. Tap an idea to see them.</p>`;
  }

  /* ---------- Shopping ---------- */
  function shopItems() {
    const planned = [], ownLines = [];
    days().forEach(d => Plan.SLOTS.forEach(s => {
      const w = Kit.get('week', d + '_' + s); if (!w) return;
      if (w.meal.startsWith('own:')) { const o = own(w.meal.slice(4)); if (o) String(o.items || '').split('\n').filter(Boolean).forEach(t => ownLines.push(t.trim())); }
      else if (idea(w.meal)) planned.push({ idea: idea(w.meal), slot: s });
    }));
    const list = Plan.shopping(planned, target(), D.products, D.shares).map(x => ({ key: 'p-' + x.k, label: x.label, text: x.text }));
    [...new Set(ownLines)].forEach(t => list.push({ key: 'o-' + t.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 40), label: t, text: '' }));
    Kit.list('shop').filter(x => x.id.startsWith('x-')).forEach(x => list.push({ key: x.id, label: x.name, text: '', extra: true }));
    return list;
  }
  function shop() {
    const list = shopItems(), done = k => !!(Kit.get('shop', 't-' + k) || {}).done;
    const row = x => `<li class="${done(x.key) ? 'done' : ''}"><button class="box" data-act="tick" data-k="${x.key}" aria-label="Got it"></button>` +
      `<span>${esc(x.label)}</span><em>${esc(x.text)}</em>${x.extra ? `<button class="btn sm ghost" data-act="rmx" data-k="${x.key}" aria-label="Remove">×</button>` : ''}</li>`;
    const left = list.filter(x => !done(x.key)), got = list.filter(x => done(x.key));
    $('t-shop').innerHTML = `<div class="card">${list.length ? `<ul class="shop">${left.concat(got).map(row).join('')}</ul>` :
      '<div class="empty">Plan some meals on the Week tab and the list fills itself.</div>'}` +
      `<div class="row" style="margin-top:12px"><input id="xadd" placeholder="Add something else" style="flex:1"><button class="btn" data-act="addx">Add</button></div></div>` +
      `<p class="sub">For the next 7 days of your plan, at your target. Recipes for two count half each time you plan them.</p>` +
      (got.length ? `<p><button class="btn ghost" data-act="untick">Clear the ticks</button></p>` : '');
  }

  /* ---------- Target ---------- */
  function targetTab() {
    $('t-target').innerHTML = `<div class="card"><label for="tg">Daily calories</label>` +
      `<div class="row"><input id="tg" inputmode="numeric" placeholder="for example 2200" value="${target() || ''}" style="max-width:160px"><button class="btn" data-act="savetg">Save</button></div>` +
      `<p class="sub">Every idea scales to it: bread, grains, protein, dairy, fruit, nuts and oil grow or shrink; vegetables stay as much as you like. ` +
      `Breakfast takes about ${Math.round(D.shares.breakfast * 100)}% of the day, the snack ${Math.round(D.shares.snack * 100)}%, lunch and dinner ${Math.round(D.shares.lunch * 100)}% each. ` +
      `Leave it empty for the portions as the plan wrote them (about 1,100 kcal a day).</p>` +
      `<p class="sub">This scales portions to a number. It is not advice on what that number should be.</p></div>` +
      `<div class="card swap"><h2>Swaps and rules</h2>${D.swaps.map(([h, l]) => `<h3>${esc(h)}</h3><ul>${l.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('')}</div>`;
  }

  /* ---------- own meal form ---------- */
  function ownForm(o) {
    o = o || { slot: 'main' };
    sheet(o.id ? 'Edit your meal' : 'Your own meal',
      `<label for="on">Name</label><input id="on" value="${esc(o.name || '')}">` +
      `<label for="os" style="display:block;margin-top:10px">For</label><select id="os">${['breakfast', 'snack', 'main'].map(s =>
        `<option value="${s}"${o.slot === s ? ' selected' : ''}>${SL[s]}</option>`).join('')}</select>` +
      `<label for="ok" style="display:block;margin-top:10px">Calories per portion (optional)</label><input id="ok" inputmode="numeric" value="${o.kcal || ''}">` +
      `<label for="oi" style="display:block;margin-top:10px">Products, one per line (they go on the shopping list)</label><textarea id="oi" rows="5">${esc(o.items || '')}</textarea>` +
      `<p><button class="btn" data-act="saveown" data-id="${o.id || ''}">Save</button></p>`);
  }

  /* ---------- plumbing ---------- */
  function sheet(title, html) {
    close();
    const el = document.createElement('div'); el.className = 'sheet'; el.id = 'sheet';
    el.innerHTML = `<div class="in"><div class="top"><h2>${esc(title)}</h2><button class="btn sm ghost" data-act="close">Close</button></div>${html}</div>`;
    document.body.appendChild(el);
  }
  const close = () => { const s = $('sheet'); if (s) s.remove(); };
  const toast = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1400); };

  function render() {
    if (!D) return;
    $('tline').textContent = target() ? 'Portions for ' + target() + ' kcal a day' : 'Portions as the plan wrote them. Set your calories on the Target tab.';
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    ['week', 'ideas', 'shop', 'target'].forEach(t => $('t-' + t).classList.toggle('hidden', t !== tab));
    ({ week, ideas: ideasTab, shop, target: targetTab })[tab]();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-t]'); if (!b) { if (e.target.id === 'sheet') close(); return; }
    if (b.dataset.t) { tab = b.dataset.t; open = null; render(); return; }
    const a = b.dataset.act, k = b.dataset.k;
    if (a === 'close') return close();
    if (a === 'slot') { if (Kit.get('week', k)) { open = open === k ? null : k; render(); } else choose(k); return; }
    if (a === 'pick') return choose(k);
    if (a === 'set') { Kit.put('week', { id: k, meal: b.dataset.m }); close(); open = null; render(); toast('Planned'); return; }
    if (a === 'clear') { Kit.del('week', k); open = null; render(); return; }
    if (a === 'open') { open = open === k ? null : k; render(); return; }
    if (a === 'kind') { ideaKind = k; open = null; render(); return; }
    if (a === 'newown') return ownForm({ slot: b.dataset.slot });
    if (a === 'editown') return ownForm(own(b.dataset.id));
    if (a === 'delown') { if (confirm('Delete this meal? Days that use it will show nothing there.')) { Kit.del('meals', b.dataset.id); open = null; render(); } return; }
    if (a === 'saveown') {
      const name = $('on').value.trim(); if (!name) { $('on').focus(); return; }
      Kit.put('meals', { id: b.dataset.id || 'm' + Date.now().toString(36), name, slot: $('os').value,
        kcal: Math.max(0, Math.round(+$('ok').value || 0)) || '', items: $('oi').value.trim() });
      close(); render(); toast('Saved'); return;
    }
    if (a === 'tick') { const t = Kit.get('shop', 't-' + k); t && t.done ? Kit.del('shop', 't-' + k) : Kit.put('shop', { id: 't-' + k, done: true }); render(); return; }
    if (a === 'addx') { const v = $('xadd').value.trim(); if (v) { Kit.put('shop', { id: 'x-' + Date.now().toString(36), name: v }); render(); } return; }
    if (a === 'rmx') { Kit.del('shop', k); Kit.del('shop', 't-' + k); render(); return; }
    if (a === 'untick') { Kit.list('shop').filter(x => x.id.startsWith('t-')).forEach(x => Kit.del('shop', x.id)); render(); return; }
    if (a === 'savetg') {
      const v = Math.round(+$('tg').value || 0);
      if (v && (v < 1000 || v > 5000)) { toast('Between 1,000 and 5,000, or empty'); return; }
      Kit.put('settings', { id: 'me', target: v }); render(); toast(v ? 'Portions now for ' + v + ' kcal' : 'Back to the plan as written'); return;
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'xadd') document.querySelector('[data-act="addx"]').click(); });

  Kit.ready.then(async () => {
    render();
    ['settings', 'week', 'meals', 'shop'].forEach(c => Kit.on(c, render));
    try {
      const j = await Kit.api('ideas');
      D = { ideas: j.ideas, products: j.products, shares: j.shares, swaps: j.swaps };
      try { localStorage.setItem('kit-ideas', JSON.stringify(D)); } catch (e) {}
    } catch (e) { if (!D) { $('t-week').innerHTML = '<div class="empty">Could not load the meal ideas. Check the connection and reload.</div>'; return; } }
    render();
    await Promise.all(['settings', 'week', 'meals', 'shop'].map(Kit.pull));
  });
})();
