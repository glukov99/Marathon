/* Holidays page of the kit. Lists (in the person's own backend):
     trips     {id, name, from, to, place, notes, ck: {leave, travel, stay, packed}}
     friends   {id, name, every (days), met: [dates], note}
     settings  {id:'hol', allow, start (month the leave year starts), region}
   UK bank holidays come from gov.uk, cached here for a week. */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const today = () => new Date().toLocaleDateString('en-CA');
  const fd = s => new Date(s + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const fdy = s => new Date(s + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const CK = [['leave', 'Leave approved'], ['travel', 'Travel booked'], ['stay', 'Stay booked'], ['packed', 'Packed']];
  const REG = [['england-and-wales', 'England and Wales'], ['scotland', 'Scotland'], ['northern-ireland', 'Northern Ireland']];
  const EVERY = [[7, 'Every week'], [14, 'Every 2 weeks'], [21, 'Every 3 weeks'], [28, 'Every 4 weeks'], [42, 'Every 6 weeks'], [56, 'Every 2 months'], [91, 'Every 3 months'], [182, 'Every 6 months']];
  let tab = 'trips', open = null, showPast = false, bankAll = null;
  try { bankAll = JSON.parse(localStorage.getItem('kit-bank')); } catch (e) {}

  const cfg = () => Object.assign({ allow: 25, start: 1, region: 'england-and-wales' }, Kit.get('settings', 'hol') || {});
  const bankList = () => ((bankAll && bankAll.data && bankAll.data[cfg().region]) || { events: [] }).events;
  const bank = () => { const o = {}; bankList().forEach(e => o[e.date] = e.title); return o; };
  const trips = () => Kit.list('trips').filter(t => t.from && t.to).sort((a, b) => a.from.localeCompare(b.from));

  function hero() {
    const d = today(), now = trips().find(t => t.from <= d && t.to >= d), next = trips().find(t => t.from > d);
    $('hero').innerHTML = now ? `<b>Away now: ${esc(now.name)}</b>Back ${fd(now.to)}`
      : next ? `<b>${Hol.diff(d, next.from)} days to ${esc(next.name)}</b>${fd(next.from)} – ${fd(next.to)}`
        : 'No trip planned yet.';
  }

  /* ---------- Trips ---------- */
  function tripCard(t) {
    const nights = Hol.diff(t.from, t.to), leave = Hol.leaveDays(t, bank()), ck = t.ck || {};
    return `<div class="card trip"><div class="r"><h2>${esc(t.name)}</h2><span class="sub">${t.from > today() ? 'in ' + Hol.diff(today(), t.from) + ' days' : ''}</span></div>` +
      `<div class="m">${fd(t.from)} – ${fd(t.to)} · ${nights} night${nights === 1 ? '' : 's'} · ${leave} leave day${leave === 1 ? '' : 's'}${t.place ? ' · ' + esc(t.place) : ''}</div>` +
      (t.notes ? `<div class="m">${esc(t.notes)}</div>` : '') +
      `<div class="chips">${CK.map(([k, n]) => `<button data-act="ck" data-id="${t.id}" data-k="${k}" aria-pressed="${!!ck[k]}">${n}</button>`).join('')}</div>` +
      `<div class="acts"><button class="btn sm ghost" data-act="edit" data-id="${t.id}">Edit</button></div></div>`;
  }
  function tripsTab() {
    const d = today(), up = trips().filter(t => t.to >= d), past = trips().filter(t => t.to < d).reverse();
    $('t-trips').innerHTML = `<p><button class="btn" data-act="new">+ Add a trip</button></p>` +
      (up.length ? up.map(tripCard).join('') : '<div class="card empty">No trips ahead. Add one, even with rough dates.</div>') +
      (past.length ? `<p><button class="btn ghost sm" data-act="past">${showPast ? 'Hide' : 'Show'} past trips (${past.length})</button></p>` + (showPast ? past.map(tripCard).join('') : '') : '') +
      (trips().length ? `<p><button class="btn ghost" data-act="ics">Add the trips to your calendar (.ics)</button></p>` : '');
  }
  function tripForm(t) {
    t = t || {};
    sheet(t.id ? 'Edit trip' : 'New trip',
      `<div class="fld"><label for="tn">Name</label><input id="tn" value="${esc(t.name || '')}" placeholder="Summer in Crete"></div>` +
      `<div class="two"><div class="fld"><label for="tf">From</label><input id="tf" type="date" value="${t.from || ''}"></div>` +
      `<div class="fld"><label for="tt">To</label><input id="tt" type="date" value="${t.to || ''}"></div></div>` +
      `<div class="fld"><label for="tp">Where (optional)</label><input id="tp" value="${esc(t.place || '')}"></div>` +
      `<div class="fld"><label for="to">Notes (optional)</label><textarea id="to" rows="3">${esc(t.notes || '')}</textarea></div>` +
      `<p class="row"><button class="btn" data-act="savetrip" data-id="${t.id || ''}">Save</button>` +
      (t.id ? `<button class="btn ghost" data-act="deltrip" data-id="${t.id}">Delete trip</button>` : '') + '</p>');
  }

  /* ---------- Leave ---------- */
  function leaveTab() {
    const c = cfg(), yr = Hol.leaveYear(today(), +c.start), b = bank();
    const inYear = trips().filter(t => t.to >= yr.from && t.from <= yr.to);
    const used = Hol.used(inYear, yr, b), left = (+c.allow || 0) - used;
    const nextBank = bankList().filter(e => e.date >= today()).slice(0, 6);
    $('t-leave').innerHTML = `<div class="card"><div class="k">${fdy(yr.from)} – ${fdy(yr.to)}</div>` +
      `<div class="big" style="margin-top:6px;color:${left < 0 ? 'var(--warn)' : 'var(--ink)'}">${left}</div>` +
      `<div class="sub">days of leave left of ${+c.allow || 0}. ${used} booked in trips.</div>` +
      (inYear.length ? `<div style="margin-top:12px">${inYear.map(t => `<div class="li">${esc(t.name)}<span>${Hol.used([t], yr, b)} days</span></div>`).join('')}</div>` : '') +
      `<p class="sub">Counts Monday to Friday inside each trip and skips bank holidays.</p></div>` +
      bestCard(c, b) + calCard(c, b) +
      `<div class="card"><h2>Bank holidays</h2><div style="margin-top:8px">${nextBank.length ? nextBank.map(e =>
        `<div class="li">${esc(e.title)}<span>${fd(e.date)}</span></div>`).join('') : '<div class="sub">Loading from gov.uk…</div>'}</div></div>` +
      `<div class="card"><h2>Your settings</h2>` +
      `<div class="two"><div class="fld"><label for="sa">Leave a year (days)</label><input id="sa" inputmode="numeric" value="${+c.allow || ''}"></div>` +
      `<div class="fld"><label for="ss">Leave year starts</label><select id="ss">${Array.from({ length: 12 }, (_, i) =>
        `<option value="${i + 1}"${+c.start === i + 1 ? ' selected' : ''}>1 ${new Date(2026, i, 1).toLocaleDateString('en-GB', { month: 'long' })}</option>`).join('')}</select></div></div>` +
      `<div class="fld"><label for="sk">School holidays</label><select id="sk"><option value="">I avoid them: cheaper flights</option>` +
      `<option value="1"${c.kids ? ' selected' : ''}>I travel in them (children at school)</option></select></div>` +
      `<div class="fld"><label for="sr">Bank holidays for</label><select id="sr">${REG.map(([k, n]) => `<option value="${k}"${c.region === k ? ' selected' : ''}>${n}</option>`).join('')}</select></div>` +
      `<p><button class="btn" data-act="saveset">Save</button></p></div>`;
  }

  /* ---------- Best times off ----------
     Bank holiday bridges (most days off per leave day) and, for people who avoid school
     holidays, the quieter weeks right after schools go back. Next 12 months. */
  function best(c, b) {
    const d = today(), end = Hol.add(d, 365), sl = Hol.school(c.region);
    const br = Hol.bridges(Hol.add(d, 1), end, b, 5).map(w => Object.assign(w, { sc: Hol.inSchool(w.from, w.to, sl), kind: 'bridge' }));
    const qw = c.kids ? [] : Hol.quietWeeks(Hol.add(d, 1), end, sl, b).map(w => Object.assign(w, { kind: 'quiet' }));
    const keep = c.kids ? br.filter(w => w.sc) : br;
    return keep.concat(qw).sort((x, y) => x.from.localeCompare(y.from));
  }
  function bestCard(c, b) {
    const list = best(c, b), booked = w => trips().some(x => x.from <= w.to && x.to >= w.from);
    const why = w => w.kind === 'quiet' ? 'term time, after the ' + esc(w.after.toLowerCase()) + ': cheaper to fly'
      : w.sc ? esc(w.sc[2]) + (c.kids ? '' : ': busier, dearer flights') : 'term time: cheaper to fly';
    const row = w => `<div class="li" style="align-items:center"><div><b style="font-weight:700">${fd(w.from)} – ${fd(w.to)}</b>` +
      `<div class="sub">${w.days} days off for ${w.leave} leave day${w.leave === 1 ? '' : 's'} · ${why(w)}</div></div>` +
      (booked(w) ? '<span>booked</span>' : `<button class="btn sm ghost" data-act="plan" data-f="${w.from}" data-t="${w.to}">Plan it</button>`) + '</div>';
    return `<div class="card"><h2>Best times off</h2><div class="sub" style="margin:4px 0 8px">` +
      (c.kids ? 'Bank holidays that stretch your leave furthest, inside the school holidays.'
        : 'Where bank holidays stretch your leave furthest, and the quieter weeks just after schools go back, when flights cost less.') +
      `</div>${list.length ? list.map(row).join('') : '<div class="sub">Nothing in the next 12 months.</div>'}` +
      `<p class="sub">School dates are the usual ones for your part of the UK; your council's can differ by a few days.</p></div>`;
  }
  function calCard(c, b) {
    const d = today(), sl = Hol.school(c.region), sug = {}, tr = {};
    best(c, b).forEach(w => { for (let x = w.from; x <= w.to; x = Hol.add(x, 1)) if (!Hol.isOff(x, b)) sug[x] = 1; });
    trips().forEach(t => { for (let x = t.from; x <= t.to; x = Hol.add(x, 1)) tr[x] = 1; });
    const months = [];
    for (let i = 0; i < 12; i++) {
      const m = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1 + i, 1), y = m.getFullYear(), mo = m.getMonth();
      const n = new Date(y, mo + 1, 0).getDate(), lead = (m.getDay() + 6) % 7;
      let cells = '<i></i>'.repeat(lead);
      for (let day = 1; day <= n; day++) {
        const s = `${y}-${String(mo + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cls = [tr[s] ? 'tr' : sug[s] ? 'sg' : '', b[s] ? 'bh' : '', Hol.inSchool(s, s, sl) ? 'sc' : '',
          Hol.isOff(s, {}) ? 'we' : '', s === d ? 'td' : ''].filter(Boolean).join(' ');
        cells += `<i class="${cls}"${b[s] ? ` title="${esc(b[s])}"` : ''}>${day}</i>`;
      }
      months.push(`<div class="mo"><div class="mh">${m.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</div><div class="mg">${cells}</div></div>`);
    }
    return `<div class="card"><h2>Your year</h2><div class="cal">${months.join('')}</div>` +
      `<div class="lg"><span><i class="bh"></i>Bank holiday</span><span><i class="sc"></i>School holiday</span>` +
      `<span><i class="sg"></i>Suggested leave</span><span><i class="tr"></i>Your trips</span></div></div>`;
  }

  /* ---------- Friends ---------- */
  function friendsTab() {
    const d = today(), list = Kit.list('friends').map(f => Object.assign({ f }, Hol.friend(f, d)))
      .sort((a, b) => (b.due - a.due) || (b.over - a.over) || a.f.name.localeCompare(b.f.name));
    const ev = f => (EVERY.find(e => e[0] === +f.every) || [0, 'Every ' + f.every + ' days'])[1].toLowerCase();
    const row = x => {
      const f = x.f, when = !x.last ? 'Not met yet' : x.since === 0 ? 'Met today' : 'Last met ' + x.since + ' day' + (x.since === 1 ? '' : 's') + ' ago';
      const tail = x.due && x.last ? ` · ${x.over} day${x.over === 1 ? '' : 's'} overdue` : !x.due ? ` · next in ${-x.over} days` : '';
      return `<div class="fr${x.due ? ' due' : ''}"><div class="r"><div class="n" data-act="fopen" data-id="${f.id}"><b>${esc(f.name)}</b>` +
        `<span>${when}${tail} · ${x.year} this year</span></div>` +
        `<button class="btn sm${x.since === 0 ? ' ghost' : ''}" data-act="met" data-id="${f.id}">${x.since === 0 ? 'Done ✓' : 'Met today'}</button></div>` +
        (open === f.id ? `<div class="sub" style="margin-top:8px">${esc(ev(f))}${f.note ? ' · ' + esc(f.note) : ''}. Met ${x.total} time${x.total === 1 ? '' : 's'} in all.</div>` +
          `<div class="row" style="margin-top:8px"><button class="btn sm ghost" data-act="fedit" data-id="${f.id}">Edit</button>` +
          (x.total ? `<button class="btn sm ghost" data-act="undo" data-id="${f.id}">Undo last meeting</button>` : '') + '</div>' : '') + '</div>';
    };
    const due = list.filter(x => x.due).length;
    $('t-friends').innerHTML = `<p class="sub" style="margin-top:14px">${list.length ? due ? due + ' to catch up with.' : 'Everyone is up to date.' : 'The people you want to see regularly, and how often.'}</p>` +
      `<div class="card">${list.length ? list.map(row).join('') : '<div class="empty">No one added yet.</div>'}</div>` +
      `<p><button class="btn" data-act="fnew">+ Add a friend</button></p>`;
  }
  function friendForm(f) {
    f = f || { every: 28 };
    const last = (f.met || []).slice().sort().pop() || '';
    sheet(f.id ? 'Edit friend' : 'New friend',
      `<div class="fld"><label for="fn">Name</label><input id="fn" value="${esc(f.name || '')}" placeholder="Coffee with Martin"></div>` +
      `<div class="fld"><label for="fe">How often</label><select id="fe">${EVERY.map(([d, n]) => `<option value="${d}"${+f.every === d ? ' selected' : ''}>${n}</option>`).join('')}</select></div>` +
      (f.id ? '' : `<div class="fld"><label for="fl">Last met (optional)</label><input id="fl" type="date" value="${last}"></div>`) +
      `<div class="fld"><label for="fo">Note (optional)</label><input id="fo" value="${esc(f.note || '')}"></div>` +
      `<p class="row"><button class="btn" data-act="fsave" data-id="${f.id || ''}">Save</button>` +
      (f.id ? `<button class="btn ghost" data-act="fdel" data-id="${f.id}">Delete</button>` : '') + '</p>');
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
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);

  function render() {
    hero();
    document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === tab)));
    ['trips', 'leave', 'friends'].forEach(t => $('t-' + t).classList.toggle('hidden', t !== tab));
    ({ trips: tripsTab, leave: leaveTab, friends: friendsTab })[tab]();
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act],[data-t]'); if (!b) { if (e.target.id === 'sheet') close(); return; }
    if (b.dataset.t) { tab = b.dataset.t; open = null; render(); return; }
    const a = b.dataset.act, id = b.dataset.id;
    if (a === 'close') return close();
    if (a === 'new') return tripForm();
    if (a === 'plan') return tripForm({ name: 'Time off', from: b.dataset.f, to: b.dataset.t });
    if (a === 'edit') return tripForm(Kit.get('trips', id));
    if (a === 'past') { showPast = !showPast; render(); return; }
    if (a === 'ck') { const t = Kit.get('trips', id), ck = Object.assign({}, t.ck); ck[b.dataset.k] = !ck[b.dataset.k]; Kit.put('trips', Object.assign({}, t, { ck })); render(); return; }
    if (a === 'savetrip') {
      const name = $('tn').value.trim(), from = $('tf').value, to = $('tt').value || from;
      if (!name || !from) { toast('A name and a start date'); return; }
      if (to < from) { toast('The end is before the start'); return; }
      const old = id ? Kit.get('trips', id) : {};
      Kit.put('trips', Object.assign({}, old, { id: id || newId('t'), name, from, to, place: $('tp').value.trim(), notes: $('to').value.trim() }));
      close(); render(); toast('Saved'); return;
    }
    if (a === 'deltrip') { if (confirm('Delete this trip?')) { Kit.del('trips', id); close(); render(); } return; }
    if (a === 'ics') {
      const blob = new Blob([Hol.ics(trips(), new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z')], { type: 'text/calendar' });
      const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = 'trips.ics'; l.click(); return;
    }
    if (a === 'saveset') {
      const allow = Math.max(0, Math.round(+$('sa').value || 0));
      Kit.put('settings', Object.assign({}, Kit.get('settings', 'hol') || {}, { id: 'hol', allow, start: +$('ss').value, region: $('sr').value, kids: !!$('sk').value }));
      render(); toast('Saved'); return;
    }
    if (a === 'fnew') return friendForm();
    if (a === 'fedit') return friendForm(Kit.get('friends', id));
    if (a === 'fopen') { open = open === id ? null : id; render(); return; }
    if (a === 'met') {
      const f = Kit.get('friends', id), met = (f.met || []).filter(d => d !== today()).concat(today()).sort().slice(-60);
      Kit.put('friends', Object.assign({}, f, { met })); render(); toast('Noted: met ' + f.name); return;
    }
    if (a === 'undo') { const f = Kit.get('friends', id); Kit.put('friends', Object.assign({}, f, { met: (f.met || []).slice().sort().slice(0, -1) })); render(); return; }
    if (a === 'fsave') {
      const name = $('fn').value.trim(); if (!name) { $('fn').focus(); return; }
      const old = id ? Kit.get('friends', id) : { met: [] }, last = $('fl') && $('fl').value;
      Kit.put('friends', Object.assign({}, old, { id: id || newId('f'), name, every: +$('fe').value, note: $('fo').value.trim(),
        met: last ? (old.met || []).concat(last) : old.met || [] }));
      close(); render(); toast('Saved'); return;
    }
    if (a === 'fdel') { if (confirm('Delete this friend and their meetings?')) { Kit.del('friends', id); close(); open = null; render(); } return; }
  });

  async function loadBank() {
    if (bankAll && Date.now() - bankAll.at < 7 * 864e5) return;
    try {
      const data = await (await fetch('https://www.gov.uk/bank-holidays.json')).json();
      bankAll = { at: Date.now(), data };
      try { localStorage.setItem('kit-bank', JSON.stringify(bankAll)); } catch (e) {}
      render();
    } catch (e) {}
  }

  Kit.ready.then(async () => {
    render();
    ['trips', 'friends', 'settings'].forEach(c => Kit.on(c, render));
    loadBank();
    await Promise.all(['trips', 'friends', 'settings'].map(Kit.pull));
  });
})();
