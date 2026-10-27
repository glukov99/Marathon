/* Time page: how long things take, so Georgi can leave on time. Data: action=time (lifehub-script/Times.js).
   Trip logic is in trips.js (tested by time/check.js). */
(function () {
  const $ = id => document.getElementById(id);
  const TZ = 'Europe/Sofia', M = 60e3;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hm = ms => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const day = ms => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ms));
  const ymd = ms => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
  const dur = ms => { const m = Math.round(ms / M); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0'); };
  // Sofia wall time -> epoch ms (the offset of that date, so summer and winter time are both right)
  function tzOff(ms) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
  }
  function sofia(dateStr, timeStr) {
    const g = Date.parse(dateStr + 'T' + timeStr + ':00Z');
    return g - tzOff(g - tzOff(g));
  }
  const PART = { ready: 'getting ready', travel: 'travel there', there: 'there', home: 'way home', arrive: 'start to arrival', total: 'total' };
  const label = w => Trips.UNNAMED.test(w || '') ? 'Unnamed stop' : (w || 'Trip');
  const MARK = { ready: 'Getting ready', out: 'Left home', in: 'Arrived', off: 'Left', back: 'Home', manual: 'Typed in' };

  let marks = [], skew = 0, busy = false, openTrip = null, gps = { visits: [], places: [], current: null, lastPoint: 0 };
  const real = id => !String(id).includes(':') && id !== 'vnow'; // GPS marks are computed, not stored

  function say(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(say.h); say.h = setTimeout(() => t.classList.remove('show'), 3200); }

  async function call(q) {
    if (!window.HubSync || !HubSync.on()) { $('nosync').classList.remove('hidden'); $('upd').textContent = ''; return null; }
    const c = HubSync.cfg();
    const url = c.url + (c.url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.tok) + '&action=time' + (q || '');
    busy = true;
    try {
      const r = await (await fetch(url)).json();
      if (r.error) { say(r.error); return null; }
      marks = r.marks || []; skew = r.now ? r.now - Date.now() : 0;
      gps = { visits: r.visits || [], places: r.places || [], current: r.current || null, lastPoint: r.lastPoint || 0, ovUrl: r.overlandUrl || '' };
      render(); return r;
    } catch (e) { say('Offline. Try again.'); return null; }
    finally { busy = false; }
  }
  const mark = async (m, what) => { const r = await call('&cmd=mark&mark=' + m + (what ? '&what=' + encodeURIComponent(what) : '')); if (r) say(r.msg); };

  function render() {
    const now = Date.now() + skew;
    const trips = Trips.build(Trips.merge(marks, gps.visits, gps.places, gps.current), now), st = Trips.stats(trips);
    openTrip = trips.find(t => t.open) || null;
    $('upd').textContent = trips.length ? trips.length + ' trips logged' : 'Nothing logged yet. Start with the buttons below or the Time shortcut.';
    renderNow(now, st);
    renderStats(st);
    renderPlan(st);
    renderTrips(trips);
    renderPlaces(now);
  }

  function renderNow(now, st) {
    const t = openTrip;
    if (!t) {
      $('now').innerHTML = `<h3>Getting ready for…</h3><div class="grid">${Trips.ACTS.map(a => `<button data-go="${esc(a)}">${esc(a)}</button>`).join('')}</div>
        <div class="row" style="margin-top:10px"><button class="btn ghost" data-m="out">Leaving now</button></div>`;
      return;
    }
    const s = t.what && st[t.what], since = t.start;
    const step = t.visits.length ? (t.visits[t.visits.length - 1].off ? 'on the way back' : 'at ' + label(t.visits[t.visits.length - 1].place)) : t.marks.some(m => m.mark === 'out') ? 'on the way' : 'getting ready';
    let hint = '';
    if (s && step === 'getting ready' && s.parts.ready) hint = `Usually you leave after ${dur(s.parts.ready.med)}. Plan for ${dur(s.parts.ready.plan)}: leave by <b>${hm(since + s.parts.ready.plan)}</b>.`;
    $('now').innerHTML = `<div class="live"><div class="sub">${esc(label(t.what))} · ${esc(step)} · since ${hm(since)}</div>
      <div class="big" id="tick">${dur(now - since)}</div>${hint ? `<div class="sub">${hint}</div>` : ''}
      <div class="row">${t.marks.some(m => m.mark === 'out') ? '' : '<button class="btn" data-m="out">Leaving now</button>'}
      <button class="btn${t.marks.some(m => m.mark === 'out') ? '' : ' ghost'}" data-m="back">I'm back</button>
      ${t.ids.some(real) ? `<button class="x" data-del="${t.ids.filter(real).join(',')}">Cancel the taps</button>` : ''}</div></div>`;
  }

  function renderStats(st) {
    const rows = Trips.ACTS.concat(Object.keys(st).filter(k => !Trips.ACTS.includes(k))).map(a => {
      const s = st[a];
      if (!s) return `<div class="act"><div class="act-h"><b>${esc(a)}</b><span class="sub">no trips yet</span></div></div>`;
      const T = s.parts.total;
      const parts = ['ready', 'travel', 'there', 'home'].filter(k => s.parts[k]).map(k => `<span>${PART[k]} <b>${dur(s.parts[k].med)}</b></span>`).join('');
      return `<div class="act"><div class="act-h"><b>${esc(a)}</b><span>${T ? `<span class="num">${dur(T.med)}</span> <span class="plan">plan for ${dur(T.plan)}</span>` : ''}</span></div>
        <div class="steps">${parts}<span>${s.n} trip${s.n > 1 ? 's' : ''}</span></div></div>`;
    });
    $('stats').innerHTML = rows.join('');
  }

  function renderPlan(st) {
    const sel = $('p-what');
    if (!sel.options.length) {
      sel.innerHTML = Trips.ACTS.map(a => `<option>${esc(a)}</option>`).join('');
      $('a-what').innerHTML = Trips.ACTS.map(a => `<option>${esc(a)}</option>`).join('');
      $('a-day').value = ymd(Date.now());
    }
    const at = $('p-at').value, s = st[sel.value];
    if (!at) { $('p-ans').innerHTML = '<span class="sub">Pick a time to see when to start.</span>'; return; }
    let when = sofia(ymd(Date.now()), at);
    if (when < Date.now() + skew - 10 * M) when += 24 * 3600e3; // already past today: tomorrow
    const p = Trips.plan(s, when);
    if (!p.startBy && !p.leaveBy) { $('p-ans').innerHTML = `<span class="sub">No ${esc(sel.value)} trips measured yet. After the first one this tells you when to start.</span>`; return; }
    const late = p.startBy && p.startBy < Date.now() + skew;
    $('p-ans').innerHTML = (p.startBy ? `Start getting ready by <span class="t">${hm(p.startBy)}</span><br>` : '') +
      (p.leaveBy ? `Leave home by <span class="t">${hm(p.leaveBy)}</span>` : '') +
      (late ? `<br><span class="plan">That is already past: start now.</span>` : '') +
      `<div class="sub">From ${s.n} trip${s.n > 1 ? 's' : ''}, planned for the slow days, not the typical one.</div>`;
  }

  function renderTrips(trips) {
    const list = trips.filter(t => !t.open).slice(0, 25);
    if (!list.length) { $('trips').innerHTML = '<span class="sub">None yet.</span>'; return; }
    const opts = cur => Trips.ACTS.concat(cur && !Trips.ACTS.includes(cur) ? [cur] : []).map(a => `<option${a === cur ? ' selected' : ''}>${esc(a)}</option>`).join('');
    $('trips').innerHTML = list.map(t => {
      const P = t.parts;
      const steps = ['ready', 'travel', 'there', 'home'].filter(k => P[k]).map(k => `<span>${PART[k]} <b>${dur(P[k])}</b></span>`).join('');
      const marksHtml = t.manual ? '' : `<details><summary class="sub">Times</summary><ul class="marks">${t.marks.map(m =>
        `<li><span style="min-width:110px">${MARK[m.mark]}${m.place ? ' ' + esc(label(m.place)) : ''}</span>` + (real(m.id)
          ? `<input type="time" value="${hm(m.at)}" data-at="${m.id}" data-day="${ymd(m.at)}"><button class="x" data-del="${m.id}" aria-label="Delete this mark">✕</button>`
          : `<span class="num" style="font-weight:600">${hm(m.at)}</span><span class="sub">GPS</span>`) + `</li>`).join('')}</ul></details>`;
      const firstReal = t.marks.find(m => real(m.id));
      const named = firstReal ? `<select data-what="${firstReal.id}" aria-label="What it was"><option value="">What was it?</option>${opts(Trips.UNNAMED.test(t.what) ? '' : t.what)}</select>`
        : Trips.UNNAMED.test(t.what) ? '<a class="sub" href="#places">Name this place</a>' : '';
      return `<div class="trip"><div class="trip-h"><div><b>${day(t.start)}</b> <span class="sub">${hm(t.start)}${t.end ? '–' + hm(t.end) : ''}</span>
        ${t.manual ? '<span class="tag">typed</span>' : ''}${t.unfinished ? '<span class="tag">no end</span>' : ''}</div>
        ${named}</div>
        <div class="sub">${esc(label(t.what))}</div>
        <div class="steps" style="margin-top:4px">${P.total ? `<span>total <b>${dur(P.total)}</b></span>` : ''}${steps}</div>
        <div class="row">${marksHtml}${t.ids.some(real) ? `<button class="x" data-del="${t.ids.filter(real).join(',')}">${t.ids.every(real) ? 'Delete trip' : 'Delete the taps'}</button>` : ''}</div></div>`;
    }).join('');
  }

  function ago(ms) { const m = Math.round(ms / M); return m < 2 ? 'just now' : m < 90 ? m + ' min ago' : m < 2880 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
  function renderPlaces(now) {
    const lp = gps.lastPoint && gps.lastPoint > Date.now() - 400 * 864e5 ? gps.lastPoint : 0;
    $('gps-st').innerHTML = lp ? `Overland last sent a location <b>${ago(now - lp)}</b>.` + (now - lp > 6 * 3600e3 ? ' <span class="plan">Check that tracking is on in Overland.</span>' : '')
      : 'No locations from Overland yet.';
    $('gps-st').innerHTML += gps.ovUrl ? ` <div class="row" style="margin-top:8px"><button class="btn ghost" data-ovcopy="1">Copy the Overland server address</button><span class="sub">Paste it in Overland → Settings → Server URL. It holds the key, so don't share it.</span></div>` : '';
    const names = ['Home'].concat(Trips.PLACES);
    $('pl-names').innerHTML = [...new Set(names.concat(gps.places.map(p => p.name)))].map(n => `<option value="${esc(n)}">`).join('');
    const un = Trips.unnamed(gps.visits, gps.places).slice(0, 12);
    const map = (a, b) => `https://maps.apple.com/?ll=${a},${b}&q=Stop`;
    $('pl-un').innerHTML = un.length ? un.map(u => `<div class="trip"><div class="trip-h"><div><b>${u.n} visit${u.n > 1 ? 's' : ''}</b> <span class="sub">usually ${dur(u.med)} · last ${day(u.last)} ${hm(u.last)}</span></div>
        <a class="sub" href="${map(u.lat, u.lon)}" target="_blank" rel="noopener">Map</a></div>
        <div class="row" style="margin-top:6px"><input list="pl-names" placeholder="Name it (Home, Gym…)" data-pl="${u.lat},${u.lon}" style="flex:1;padding:8px"><button class="btn" data-plsave="${u.lat},${u.lon}">Save</button></div></div>`).join('')
      : `<span class="sub">${gps.visits.length ? 'Every stop has a name.' : 'Stops appear here after the first day with Overland.'}</span>`;
    const count = p => gps.visits.filter(v => Trips.placeOf(v, gps.places) === p).length;
    $('pl-named').innerHTML = gps.places.length ? gps.places.map(p => `<div class="trip-h" style="padding:6px 0"><span><b>${esc(p.name)}</b> <span class="sub">${count(p)} visits</span></span>
        <span><a class="sub" href="${map(p.lat, p.lon)}" target="_blank" rel="noopener">Map</a> <button class="x" data-plrm="${p.lat},${p.lon}">Remove</button></span></div>`).join('') : '';
  }

  document.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b || busy) return;
    if (b.dataset.go) return mark('ready', b.dataset.go);
    if (b.dataset.m) return mark(b.dataset.m);
    if (b.dataset.ovcopy) { try { await navigator.clipboard.writeText(gps.ovUrl); say('Copied. Paste it in Overland.'); } catch (x) { prompt('Copy this address:', gps.ovUrl); } return; }
    if (b.dataset.plsave) {
      const inp = document.querySelector(`input[data-pl="${b.dataset.plsave}"]`), name = inp && inp.value.trim();
      if (!name) return say('Type a name first.');
      const [la, lo] = b.dataset.plsave.split(','); const r = await call(`&cmd=place&name=${encodeURIComponent(name)}&lat=${la}&lon=${lo}`); if (r) say(r.msg); return;
    }
    if (b.dataset.plrm) { if (!confirm('Remove this place? Its visits go back to unnamed.')) return; const [la, lo] = b.dataset.plrm.split(','); const r = await call(`&cmd=place&name=&lat=${la}&lon=${lo}`); if (r) say(r.msg); return; }
    if (b.dataset.del) { if (!confirm('Delete?')) return; const r = await call('&cmd=del&id=' + encodeURIComponent(b.dataset.del)); if (r) say(r.msg); }
  });
  document.addEventListener('change', async e => {
    const el = e.target;
    if (el.dataset.what) { const r = await call('&cmd=edit&id=' + el.dataset.what + '&what=' + encodeURIComponent(el.value)); if (r) say('Saved.'); }
    if (el.dataset.at && el.value) { const r = await call('&cmd=edit&id=' + el.dataset.at + '&at=' + sofia(el.dataset.day, el.value)); if (r) say('Saved.'); }
    if (el.id === 'p-what' || el.id === 'p-at') render();
  });
  $('a-save').onclick = async () => {
    const m = /^(\d{1,2})(?::(\d{2}))?$/.exec($('a-dur').value.trim());
    if (!m || !$('a-start').value || !$('a-day').value) return say('Fill in the day, the start and how long (like 1:45).');
    const start = sofia($('a-day').value, $('a-start').value), end = start + (Number(m[1]) * 60 + Number(m[2] || 0)) * M;
    const r = await call(`&cmd=add&what=${encodeURIComponent($('a-what').value)}&start=${start}&end=${end}`);
    if (r) { say(r.msg); $('a-dur').value = ''; }
  };
  setInterval(() => { const el = $('tick'); if (el && openTrip) el.textContent = dur(Date.now() + skew - openTrip.start); }, 15e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) call(''); });
  call('');
})();
