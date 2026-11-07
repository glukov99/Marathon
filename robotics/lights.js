/* Robotics: the living-room lights board, live (7 Nov 2026).
   Georgi: "what the lux is, when was it on/off and if it records presence, basically to
   double check the first days how the system reacts", and the lux limits set from here.
   Then: a way to say "that was wrong" (five kinds, by what he saw), and the page flags the
   commonest fault itself: lights off on an "empty" room that someone walks into within
   2 minutes means the radar lost a still person.
   Data: action=lights (lifehub-script/Lights.js). The board reports each change, plus a
   sample every 10 min, and takes the limits from the reply.
   Run: node robotics/lights-check.js */
const LIGHTS_GAP = 11 * 60e3;    // samples come every 10 min: a longer silence = the board was not reporting
const FALSE_OFF = 2 * 60e3;      // back "in" this soon after an "empty" off = nobody had left
const REPORTS = {
  'off-present': 'Turned off while I was there',
  'off-dark': 'Turned off, but it was still dark',
  'on-bright': 'Came on, but it was bright enough',
  'no-on': 'Did not come on, it was too dark',
  'ghost': 'Said someone was there, the room was empty',
};

const boardRows = rows => rows.filter(r => r.ev !== 'report'); // Georgi's reports carry no state

// Piecewise state from the board's rows: each row's flag holds until the next (or LIGHTS_GAP).
function lightSpans(rows, flag, from, to) {
  const out = [];
  rows.forEach((r, i) => {
    if (!r[flag]) return;
    const next = rows[i + 1] ? rows[i + 1].at : Infinity;
    const s = Math.max(r.at, from), e = Math.min(next, r.at + LIGHTS_GAP, to);
    if (e <= s) return;
    const last = out[out.length - 1];
    if (last && last[1] >= s) last[1] = Math.max(last[1], e); else out.push([s, e]);
  });
  return out;
}

// Times of "off, room empty" rows that someone walked back into within FALSE_OFF.
function falseOffs(rows) {
  const b = boardRows(rows), out = [];
  b.forEach((r, i) => {
    if (r.ev !== 'off' || r.why !== 'empty') return;
    const back = b.slice(i + 1).find(x => x.ev === 'in');
    if (back && back.at - r.at <= FALSE_OFF) out.push(r.at);
  });
  return out;
}

function lightText(r) {
  const d = r.day == null ? '' : `, daylight ${Math.round(r.day)}`;
  if (r.ev === 'report') { const l = REPORTS[r.why] || r.why; return 'You reported: ' + l[0].toLowerCase() + l.slice(1); }
  if (r.ev === 'on') return `Lights on (dark${d})`;
  if (r.ev === 'off') return r.why === 'bright' ? `Lights off (bright enough${d})` : 'Lights off (room empty)';
  if (r.ev === 'in') return 'Someone came in';
  if (r.ev === 'out') return 'Room empty';
  if (r.ev === 'pause') return 'Paused: lights changed by hand';
  if (r.ev === 'resume') return 'Automatic again';
  if (r.ev === 'boot') return 'Board started';
  return null; // 's' = a sample, drawn but not listed
}

function dayStart(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

if (typeof module !== 'undefined') module.exports = { lightSpans, lightText, dayStart, falseOffs, boardRows, REPORTS, LIGHTS_GAP, FALSE_OFF };

if (typeof document !== 'undefined') (function () {
  const box = document.getElementById('live'); if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  let data = null, day = 0, busy = false, asking = false;

  async function call(q) {
    if (!window.HubSync || !HubSync.on()) return null;
    const c = HubSync.cfg();
    const url = c.url + (c.url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.tok) + '&action=lights' + (q || '');
    try { return await (await fetch(url)).json(); } catch (e) { return { error: 'Offline. Try again.' }; }
  }
  async function load() {
    const r = await call('&days=2');
    if (!r) return;
    if (r.error) { if (data) toastL(r.error); return; }
    data = r; render();
  }
  function toastL(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

  function chart(rows, reports, fo, from, to, s) {
    const W = 720, X = t => ((t - from) / (to - from)) * W, top = 44, bot = 132;
    const pts = rows.filter(r => r.lux != null && r.at >= from && r.at <= to);
    const max = Math.max(100, s.off * 1.25, ...pts.map(r => r.lux));
    const Y = v => bot - (Math.min(v, max) / max) * (bot - top);
    const band = (sp, y, cls) => sp.map(([a, b]) => `<rect x="${X(a).toFixed(1)}" y="${y}" width="${Math.max(1.5, X(b) - X(a)).toFixed(1)}" height="12" rx="2" class="${cls}"/>`).join('');
    const line = (k, cls) => { const p = pts.filter(r => r[k] != null).map(r => `${X(r.at).toFixed(1)},${Y(r[k]).toFixed(1)}`);
      return p.length > 1 ? `<polyline points="${p.join(' ')}" class="${cls}"/>` : ''; };
    const lim = (v, l) => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="lim"/><text x="${W - 4}" y="${Y(v) - 3}" text-anchor="end" class="lt">${l} ${v}</text>`;
    const mark = (t, cls) => t >= from && t < to ? `<line x1="${X(t).toFixed(1)}" x2="${X(t).toFixed(1)}" y1="2" y2="${bot}" class="${cls}"/>` : '';
    const ticks = [0, 6, 12, 18, 24].map(h => `<text x="${Math.min(W - 10, Math.max(8, h / 24 * W))}" y="148" text-anchor="middle" class="lt">${String(h).padStart(2, '0')}</text>`).join('');
    const nowX = Date.now() < to ? mark(Date.now(), 'now') : '';
    return `<svg viewBox="0 0 ${W} 152" class="lchart" role="img" aria-label="Lights, presence and daylight for the day">
      <text x="0" y="12" class="lt">lights on</text>${band(lightSpans(rows, 'a', from, to), 16, 'on')}
      <text x="0" y="40" class="lt">someone there</text>${band(lightSpans(rows, 'p', from, to), 30, 'pr')}
      <line x1="0" x2="${W}" y1="${bot}" y2="${bot}" class="ax"/>${lim(s.on, 'on below')}${lim(s.off, 'off above')}
      ${line('lux', 'sens')}${line('day', 'dl')}${nowX}${fo.map(t => mark(t, 'fo')).join('')}${reports.map(r => mark(r.at, 'rep')).join('')}${ticks}</svg>`;
  }

  function render() {
    if (!data) return;
    const all = data.rows || [], rows = boardRows(all), s = data.settings, last = rows[rows.length - 1];
    const from = dayStart(Date.now()) - day * 864e5, to = from + 864e5;
    const old = !last || Date.now() - last.at > 25 * 60e3;
    const lastS = [...rows].reverse().find(r => r.lux != null);
    const fo = falseOffs(all), foDay = fo.filter(t => t >= from && t < to);
    const reports = all.filter(r => r.ev === 'report' && r.at >= from && r.at < to);
    const evs = all.filter(r => r.at >= from && r.at < to && lightText(r)).reverse();
    const ev = r => {
      const flag = r.ev === 'off' && fo.includes(r.at);
      return `<div class="lev${r.ev === 'report' ? ' lrep' : ''}"><span>${hm(r.at)}</span><em>${esc(lightText(r))}${flag ? ' <b class="lfo">likely a false off: someone came back in within 2 min</b>' : ''}</em>${
        r.ev === 'report' ? `<button class="btn sm ghost" data-unrep="${r.at}">Remove</button>` : ''}</div>`;
    };
    box.innerHTML = `
      <div class="ttl"><b>Living room lights · live</b><span class="tag${old ? ' late' : ''}">${last ? 'last report ' + hm(last.at) : 'no report yet'}</span></div>
      ${last ? `<p class="sub lnow">Lights <b>${last.a ? 'on' : 'off'}</b>${last.z ? ' · paused by hand' : ''} · ${last.p ? 'someone there' : 'nobody there'}${lastS ? ` · daylight ≈ ${Math.round(lastS.day)} lux (sensor ${Math.round(lastS.lux)})` : ''}</p>` : '<p class="sub">The board has not reported yet.</p>'}
      ${old && last ? '<p class="warn">No report for over 25 minutes: the board may be off or offline.</p>' : ''}
      ${foDay.length || reports.length ? `<p class="warn">${[foDay.length && `${foDay.length} likely false off${foDay.length > 1 ? 's' : ''}`, reports.length && `${reports.length} reported by you`].filter(Boolean).join(' · ')} on this day.</p>` : ''}
      <div class="chips"><button data-ld="0" aria-pressed="${day === 0}">Today</button><button data-ld="1" aria-pressed="${day === 1}">Yesterday</button><button data-ld="r">Refresh</button></div>
      ${chart(rows, reports, foDay, from, to, s)}
      <div class="lkey"><i class="k on"></i>lights on <i class="k pr"></i>someone there <i class="k dl"></i>daylight <i class="k sens"></i>sensor (with the bulbs) <i class="k rep"></i>your report <i class="k fo"></i>likely false off</div>
      <div class="lask">${asking ? `<div class="sub">What happened just now?</div><div class="lopts">${Object.entries(REPORTS).map(([k, l]) =>
        `<button class="btn sm ghost" data-rep="${k}">${esc(l)}</button>`).join('')}<button class="btn sm ghost" data-ask="0">Cancel</button></div>`
        : '<button class="btn sm" data-ask="1">Something was wrong</button>'}</div>
      ${evs.length ? `<details class="levs"${evs.length <= 8 ? ' open' : ''}><summary>${evs.length} event${evs.length > 1 ? 's' : ''}</summary>${evs.map(ev).join('')}</details>` : '<p class="sub">Nothing happened this day.</p>'}
      <form class="llim" autocomplete="off">
        <label>On below <input name="on" type="number" inputmode="numeric" min="1" max="4990" value="${s.on}"> lux</label>
        <label>Off above <input name="off" type="number" inputmode="numeric" min="11" max="5000" value="${s.off}"> lux</label>
        <button class="btn sm" type="submit">Save</button></form>
      <p class="sub">Daylight, not the sensor: the board takes off its own bulbs' light. Off above needs 2 minutes of it. New limits reach the board at its next report, within 10 minutes.</p>`;
    box.classList.remove('hidden');
  }

  async function act(q, after) {
    if (busy) return; busy = true;
    const r = await call(q); busy = false;
    if (!r) return;
    if (r.error) { toastL(r.error); return; }
    if (r.msg) toastL(r.msg);
    if (after) after(r);
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-ld],[data-ask],[data-rep],[data-unrep]'); if (!b) return;
    if (b.dataset.ld === 'r') { load(); return; }
    if (b.dataset.ld) { day = +b.dataset.ld; render(); return; }
    if (b.dataset.ask) { asking = b.dataset.ask === '1'; render(); return; }
    if (b.dataset.rep) { asking = false; day = 0; act('&cmd=report&kind=' + encodeURIComponent(b.dataset.rep), load); return; }
    if (b.dataset.unrep) act('&cmd=unreport&at=' + encodeURIComponent(b.dataset.unrep), load);
  });
  box.addEventListener('submit', e => {
    e.preventDefault();
    const f = e.target;
    act('&cmd=set&on=' + encodeURIComponent(f.on.value) + '&off=' + encodeURIComponent(f.off.value), r => { data.settings = r.settings; render(); });
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
