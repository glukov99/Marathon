/* Robotics: the living-room lights board, live (7 Nov 2026).
   Georgi: "what the lux is, when was it on/off and if it records presence, basically to
   double check the first days how the system reacts", and the lux limits set from here.
   Data: action=lights (lifehub-script/Lights.js). The board reports each change, plus a
   sample every 10 min, and takes the limits from the reply.
   Run: node robotics/lights-check.js */
const LIGHTS_GAP = 11 * 60e3; // samples come every 10 min: a longer silence means the board was not reporting

// Piecewise state from the rows: each row's flag holds until the next row (or LIGHTS_GAP).
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

function lightText(r) {
  const d = r.day == null ? '' : `, daylight ${Math.round(r.day)}`;
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

if (typeof module !== 'undefined') module.exports = { lightSpans, lightText, dayStart, LIGHTS_GAP };

if (typeof document !== 'undefined') (function () {
  const box = document.getElementById('live'); if (!box) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const hm = ms => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  let data = null, day = 0, busy = false;

  async function call(q) {
    if (!window.HubSync || !HubSync.on()) return null;
    const c = HubSync.cfg();
    const url = c.url + (c.url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.tok) + '&action=lights' + (q || '');
    try { const r = await (await fetch(url)).json(); return r; } catch (e) { return { error: 'Offline. Try again.' }; }
  }
  async function load() {
    const r = await call('&days=2');
    if (!r) return;
    if (r.error) { if (data) toastL(r.error); return; }
    data = r; render();
  }
  function toastL(m) { const t = document.getElementById('toast'); if (!t) return; t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400); }

  function chart(rows, from, to, s) {
    const W = 720, X = t => ((t - from) / (to - from)) * W, top = 44, bot = 132;
    const pts = rows.filter(r => r.lux != null && r.at >= from && r.at <= to);
    const max = Math.max(100, s.off * 1.25, ...pts.map(r => r.lux));
    const Y = v => bot - (Math.min(v, max) / max) * (bot - top);
    const band = (sp, y, cls) => sp.map(([a, b]) => `<rect x="${X(a).toFixed(1)}" y="${y}" width="${Math.max(1.5, X(b) - X(a)).toFixed(1)}" height="12" rx="2" class="${cls}"/>`).join('');
    const line = (k, cls) => { const p = pts.filter(r => r[k] != null).map(r => `${X(r.at).toFixed(1)},${Y(r[k]).toFixed(1)}`);
      return p.length > 1 ? `<polyline points="${p.join(' ')}" class="${cls}"/>` : ''; };
    const lim = (v, l) => `<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" class="lim"/><text x="${W - 4}" y="${Y(v) - 3}" text-anchor="end" class="lt">${l} ${v}</text>`;
    const ticks = [0, 6, 12, 18, 24].map(h => `<text x="${Math.min(W - 10, Math.max(8, h / 24 * W))}" y="148" text-anchor="middle" class="lt">${String(h).padStart(2, '0')}</text>`).join('');
    const nowX = Date.now() < to ? `<line x1="${X(Date.now())}" x2="${X(Date.now())}" y1="2" y2="${bot}" class="now"/>` : '';
    return `<svg viewBox="0 0 ${W} 152" class="lchart" role="img" aria-label="Lights, presence and daylight for the day">
      <text x="0" y="12" class="lt">lights on</text>${band(lightSpans(rows, 'a', from, to), 16, 'on')}
      <text x="0" y="40" class="lt">someone there</text>${band(lightSpans(rows, 'p', from, to), 30, 'pr')}
      <line x1="0" x2="${W}" y1="${bot}" y2="${bot}" class="ax"/>${lim(s.on, 'on below')}${lim(s.off, 'off above')}
      ${line('lux', 'sens')}${line('day', 'dl')}${nowX}${ticks}</svg>`;
  }

  function render() {
    if (!data) return;
    const rows = data.rows || [], s = data.settings, last = rows[rows.length - 1];
    const from = dayStart(Date.now()) - day * 864e5, to = from + 864e5;
    const old = !last || Date.now() - last.at > 25 * 60e3;
    const lastS = [...rows].reverse().find(r => r.lux != null);
    const evs = rows.filter(r => r.at >= from && r.at < to && lightText(r)).reverse();
    box.innerHTML = `
      <div class="ttl"><b>Living room lights · live</b><span class="tag${old ? ' late' : ''}">${last ? 'last report ' + hm(last.at) : 'no report yet'}</span></div>
      ${last ? `<p class="sub lnow">Lights <b>${last.a ? 'on' : 'off'}</b>${last.z ? ' · paused by hand' : ''} · ${last.p ? 'someone there' : 'nobody there'}${lastS ? ` · daylight ≈ ${Math.round(lastS.day)} lux (sensor ${Math.round(lastS.lux)})` : ''}</p>` : '<p class="sub">The board has not reported yet.</p>'}
      ${old && last ? '<p class="warn">No report for over 25 minutes: the board may be off or offline.</p>' : ''}
      <div class="chips"><button data-ld="0" aria-pressed="${day === 0}">Today</button><button data-ld="1" aria-pressed="${day === 1}">Yesterday</button><button data-ld="r">Refresh</button></div>
      ${chart(rows, from, to, s)}
      <div class="lkey"><i class="k on"></i>lights on <i class="k pr"></i>someone there <i class="k dl"></i>daylight <i class="k sens"></i>sensor (with the bulbs)</div>
      ${evs.length ? `<details class="levs"${evs.length <= 6 ? ' open' : ''}><summary>${evs.length} event${evs.length > 1 ? 's' : ''}</summary>${evs.map(r =>
        `<div class="lev"><span>${hm(r.at)}</span>${esc(lightText(r))}</div>`).join('')}</details>` : '<p class="sub">Nothing happened this day.</p>'}
      <form class="llim" autocomplete="off">
        <label>On below <input name="on" type="number" inputmode="numeric" min="1" max="4990" value="${s.on}"> lux</label>
        <label>Off above <input name="off" type="number" inputmode="numeric" min="11" max="5000" value="${s.off}"> lux</label>
        <button class="btn sm" type="submit">Save</button></form>
      <p class="sub">Daylight, not the sensor: the board takes off its own bulbs' light. Off above needs 2 minutes of it. New limits reach the board at its next report, within 10 minutes.</p>`;
    box.classList.remove('hidden');
  }

  box.addEventListener('click', e => {
    const b = e.target.closest('[data-ld]'); if (!b) return;
    if (b.dataset.ld === 'r') { load(); return; }
    day = +b.dataset.ld; render();
  });
  box.addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const f = e.target, on = f.on.value, off = f.off.value;
    busy = true; const r = await call('&cmd=set&on=' + encodeURIComponent(on) + '&off=' + encodeURIComponent(off)); busy = false;
    if (!r) return;
    if (r.error) { toastL(r.error); return; }
    toastL(r.msg || 'Saved'); data.settings = r.settings; render();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  load();
})();
