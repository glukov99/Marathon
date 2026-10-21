/* Heating page. Talks to the Apps Script brain (action=heat) with the HubSync URL + token.
   The rules live in the backend (Heat.js). The day strip below only draws the clock plan. */
(function () {
  const $ = id => document.getElementById(id);
  const TZ = 'Europe/Sofia';
  let st = null, busy = false;
  const pend = {}; // value picked on the card, per room ('off' or a number)

  /* blue when cold (below 18.5°), orange when warm; deeper colour the further from 18.5° */
  function tempColor(t) {
    if (t == null || isNaN(t)) return 'hsl(200 10% 55%)';
    if (t < 18.5) { const f = Math.min(1, (18.5 - t) / 3); return 'hsl(' + Math.round(200 + f * 15) + ' 95% ' + Math.round(66 - f * 8) + '%)'; }
    const f = Math.min(1, (t - 18.5) / 3); return 'hsl(' + Math.round(36 - f * 16) + ' 100% ' + Math.round(62 - f * 6) + '%)';
  }

  function nowMin() {
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':');
    return Number(p[0]) % 24 * 60 + Number(p[1]);
  }
  const fmt = ms => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
  const hm = ms => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(ms));

  function plan(key) {
    if (st && st.holiday && st.holiday.on && Date.now() < st.holiday.resumeAt) return [[0, 1440, null]];
    if (key === 'living') return [[0, 420, null], [420, 1320, 20], [1320, 1380, 18], [1380, 1440, null]];
    const sam = st && st.sammy && st.sammy.on;
    return [[0, 360, 17], [360, 480, 21], [480, 1035, sam ? 20 : null], [1035, 1185, 21], [1185, 1440, 17]];
  }

  function stripHtml(key) {
    const segs = plan(key).map(([a, b, t]) => {
      const c = t == null ? 'rgba(255,255,255,.06)' : 'color-mix(in srgb,' + tempColor(t) + ' 75%,transparent)';
      return '<i style="width:' + ((b - a) / 14.4) + '%;background:' + c + '" title="' +
        String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0') + ' ' + (t == null ? 'off' : t + '°') + '"></i>';
    }).join('');
    return '<div class="strip">' + segs + '<span class="now" style="left:' + (nowMin() / 14.4) + '%"></span></div>' +
      '<div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>';
  }

  const EDGES = { living: [420, 1320, 1380], bed: [360, 480, 1035, 1185] };
  function nextEdge(key) {
    const m = nowMin(), e = EDGES[key].find(x => x > m);
    const v = e != null ? e : EDGES[key][0];
    return String(Math.floor(v / 60)).padStart(2, '0') + ':' + String(v % 60).padStart(2, '0');
  }

  function roomHtml(r) {
    const glow = tempColor(r.temp != null ? r.temp : r.target);
    const on = r.on && r.want && r.want.on !== false;
    const heating = on && r.temp != null && r.target != null && r.temp < r.target - 0.2;
    const t = r.temp != null ? r.temp.toFixed(1).split('.') : ['–', ''];
    const man = st.override && st.override[r.key] && st.override[r.key].until > Date.now();
    const badge = man ? 'Manual' : !on ? 'Off' : heating ? 'Heating' : 'Holding';
    if (pend[r.key] === undefined) pend[r.key] = r.target != null ? r.target : 20;
    const pv = pend[r.key];
    return '<article class="room ' + (on ? '' : 'off ') + (heating ? 'heating' : '') + '" style="--glow:' + glow + ';--gi:' + (on ? (heating ? .6 : .42) : .16) + '">' +
      '<div class="top"><h2>' + r.name + '</h2><span class="badge">' + badge + '</span></div>' +
      '<div class="orbwrap"><div class="orb"><div class="t">' + t[0] + (t[1] ? '<small>.' + t[1] + '°</small>' : '') + '</div>' +
      '<div class="tg">' + (on ? 'Target ' + r.target + '°' : 'Heating off') + '</div></div></div>' +
      '<div class="why">' + ((r.want && r.want.why) || '') + '</div>' +
      '<div class="man" data-room="' + r.key + '">' +
        '<button class="step" data-a="down" aria-label="Lower">−</button>' +
        '<span class="val">' + (pv === 'off' ? 'Off' : pv + '°') + '</span>' +
        '<button class="step" data-a="up" aria-label="Higher">+</button>' +
        '<button class="set" data-a="set">Set till ' + nextEdge(r.key) + '</button>' +
        (man ? '<button class="auto" data-a="auto">Schedule</button>' : '') +
      '</div>' + stripHtml(r.key) + '</article>';
  }

  function setTog(id, pressed, title, sub) {
    const b = $(id); b.setAttribute('aria-pressed', String(!!pressed));
    if (title) b.querySelector('b').textContent = title;
    if (sub) b.querySelector('.tx span').textContent = sub;
  }

  function render() {
    if (!st || !st.ok) return;
    $('rooms').innerHTML = st.rooms.map(roomHtml).join('');
    const o = $('out');
    o.style.setProperty('--c', tempColor(st.outside));
    o.lastElementChild.textContent = st.outside == null ? 'Outside: –' : Math.round(st.outside) + '° in Plovdiv';
    $('upd').textContent = 'Updated ' + hm(st.lastRun || st.now) + (st.outside != null && st.outside >= 18 ? ' · warm outside, living room rests' : '');
    setTog('b-away', st.away, st.away ? 'Away' : 'Home', st.away ? 'Tap when you are back' : 'Tap if you left');
    setTog('b-sammy', st.sammy.on, null, st.sammy.on ? 'On until ' + hm(st.sammy.until) : 'Kids room 20° by day');
    setTog('b-keep', st.keepOn.on, null, st.keepOn.on ? 'On until ' + hm(st.keepOn.until) : 'Ignore me leaving');
    setTog('b-hol', st.holiday.on, null, st.holiday.on ? 'Back ' + fmt(st.holiday.until) : 'All off until return');
    $('log').innerHTML = (st.log || []).length ? st.log.map(l =>
      '<li><time>' + fmt(l.at).replace(/^\w+ /, '') + '</time><span>' + l.msg.replace(/</g, '&lt;') + '</span></li>').join('')
      : '<li class="empty">Nothing yet</li>';
  }

  function say(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(say.h); say.h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function call(q) {
    if (!window.HubSync || !HubSync.on()) { $('nosync').classList.remove('hidden'); $('upd').textContent = ''; return null; }
    const c = HubSync.cfg();
    const url = c.url + (c.url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.tok) + '&action=heat' + (q || '');
    busy = true; document.querySelectorAll('.tog').forEach(b => b.disabled = true);
    try {
      const r = await (await fetch(url)).json();
      if (r.error) { say(r.error); return null; }
      st = r; render(); return r;
    } catch (e) { say('Offline. Try again.'); return null; }
    finally { busy = false; document.querySelectorAll('.tog').forEach(b => b.disabled = false); }
  }

  $('b-away').onclick = async () => { const r = await call('&cmd=' + (st && st.away ? 'arrive' : 'leave')); if (r) say(r.msg); };
  $('b-sammy').onclick = async () => { const r = await call('&cmd=sammy'); if (r) say(r.msg); };
  $('b-keep').onclick = async () => { const r = await call('&cmd=keepon'); if (r) say(r.msg); };
  $('b-hol').onclick = async () => {
    if (st && st.holiday.on) {
      if (!confirm('End holiday mode now?')) return;
      const r = await call('&cmd=holiday&until=off'); if (r) say(r.msg); return;
    }
    $('holbox').classList.toggle('hidden');
    if (!$('holat').value) {
      const d = new Date(Date.now() + 3 * 86400e3); d.setHours(18, 0, 0, 0);
      $('holat').value = new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    }
  };
  $('holset').onclick = async () => {
    const v = $('holat').value; if (!v) return say('Pick when you are back');
    const r = await call('&cmd=holiday&until=' + encodeURIComponent(v));
    if (r) { $('holbox').classList.add('hidden'); say(r.msg); }
  };

  $('rooms').addEventListener('click', async ev => {
    const b = ev.target.closest('button[data-a]'); if (!b || busy) return;
    const k = b.closest('.man').dataset.room, a = b.dataset.a;
    let v = pend[k];
    if (a === 'up') { pend[k] = v === 'off' ? 5 : Math.min(30, v + 0.5); render(); return; }
    if (a === 'down') { pend[k] = v === 'off' || v <= 5 ? 'off' : v - 0.5; render(); return; }
    const r = await call('&cmd=set&room=' + k + '&temp=' + (a === 'auto' ? 'auto' : v));
    if (r) { if (a === 'auto') delete pend[k]; say(r.msg); }
  });

  call();
  setInterval(() => { if (!document.hidden && !busy) call(); }, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) call(); });
})();
