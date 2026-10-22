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
    $('b-home').setAttribute('aria-pressed', String(!st.away));
    $('b-away').setAttribute('aria-pressed', String(!!st.away));
    setTog('b-sammy', st.sammy.on, null, st.sammy.on ? 'On until ' + hm(st.sammy.until) : 'Kids room 20° by day');
    setTog('b-keep', st.keepOn.on, null, st.keepOn.on ? 'On until ' + hm(st.keepOn.until) : 'Ignore me leaving');
    setTog('b-hol', st.holiday.on, null, st.holiday.on ? 'Back ' + fmt(st.holiday.until) : 'All off until return');
    renderEnergy();
    if (!wxAsked && st.energy) { wxAsked = true; loadWx(); }
    $('log').innerHTML = (st.log || []).length ? st.log.map(l =>
      '<li><time>' + fmt(l.at).replace(/^\w+ /, '') + '</time><span>' + l.msg.replace(/</g, '&lt;') + '</span></li>').join('')
      : '<li class="empty">Nothing yet</li>';
  }

  /* ---------- energy ----------
     Each room/day: w = Wh, n = night-tariff Wh (null before 22 Oct 2026: then estimated).
     Views: last 14 days, a month (its days), a year (its months). Compare = the same
     period one year earlier, drawn as dashed outlines. Days are Adax buckets 06:00–06:00. */
  const kwh = wh => (wh / 1000).toFixed(wh >= 10000 ? 0 : 1) + ' kWh';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let pickKey = null, eView = 'days', eYear = null, eMonth = null, eCmp = false;
  try { const v = JSON.parse(localStorage.getItem('lifehub-heat-eview') || '{}'); eView = v.view || 'days'; eCmp = !!v.cmp; } catch (e) {}
  const keepView = () => { try { localStorage.setItem('lifehub-heat-eview', JSON.stringify({ view: eView, cmp: eCmp })); } catch (e) {} };

  function energyModel() {
    const E = st.energy, pd = E.priceDay, pn = E.priceNight;
    const share = {};
    ['living', 'bed'].forEach(k => {
      const sp = E.days.map(d => d[k]).filter(x => x && x.n != null && x.w > 300);
      share[k] = sp.length >= 3 ? sp.reduce((a, x) => a + x.n, 0) / sp.reduce((a, x) => a + x.w, 0) : (k === 'living' ? 0.05 : 0.35);
    });
    const W = (d, k) => d && d[k] ? d[k].w : 0;
    const N = (d, k) => !d || !d[k] ? 0 : d[k].n != null ? d[k].n : d[k].w * share[k];
    const est = d => ['living', 'bed'].some(k => d[k] && d[k].n == null && d[k].w > 0);
    const cost = d => !pd || !pn ? null : ['living', 'bed'].reduce((a, k) => a + ((W(d, k) - N(d, k)) * pd + N(d, k) * pn) / 1000, 0);
    const sum = arr => {
      const c = arr.map(cost);
      return { n: arr.length, liv: arr.reduce((a, d) => a + W(d, 'living'), 0), bed: arr.reduce((a, d) => a + W(d, 'bed'), 0),
        night: arr.reduce((a, d) => a + N(d, 'living') + N(d, 'bed'), 0),
        eur: c.includes(null) ? null : c.reduce((a, x) => a + x, 0), est: arr.some(est) };
    };
    const by = {}; E.days.forEach(d => by[d.d] = d);
    const inP = pre => E.days.filter(d => d.d.startsWith(pre));
    return { by, sum, inP, first: E.days.length ? E.days[0].d : null };
  }
  const tot = x => x.liv + x.bed;
  const money = x => !x || x.eur == null ? (st.energy.priceDay ? '' : 'set prices below') : (x.est ? '≈ ' : '') + '€' + x.eur.toFixed(2);
  function delta(cur, prev) {
    if (!prev || !prev.n) return 'no data a year earlier';
    const a = tot(cur), b = tot(prev); if (!b) return 'no use a year earlier';
    const p = Math.round(100 * (a - b) / b);
    return (p > 0 ? '+' : '') + p + '% vs ' + kwh(b);
  }

  /* ---------- outside temperature per day (22 Oct 2026) ----------
     Daily mean for Plovdiv from Open-Meteo, fetched by the page (free, no key): the
     archive for older days (it lags about 5 days) and the forecast API's past days for
     the recent ones. From the year before the energy data starts, for the comparison.
     A calendar day, while Adax days run 06:00–06:00: close enough to compare, not exact. */
  let wx = {}, wxAsked = false;
  const WX = 'latitude=42.1354&longitude=24.7453&daily=temperature_2m_mean&timezone=Europe%2FSofia';
  async function loadWx() {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
    try { const c = JSON.parse(localStorage.getItem('lifehub-heat-wx') || 'null'); if (c && c.day === today) { wx = c.t; renderEnergy(); return; } } catch (e) {}
    const first = st.energy && st.energy.days.length ? st.energy.days[0].d : today;
    const from = (+first.slice(0, 4) - 1) + '-01-01';
    const upto = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const get = async u => { try { const d = (await (await fetch(u)).json()).daily; return d.time.map((t, i) => [t, d.temperature_2m_mean[i]]); } catch (e) { return []; } };
    const [old, recent] = await Promise.all([
      get('https://archive-api.open-meteo.com/v1/archive?' + WX + '&start_date=' + from + '&end_date=' + upto),
      get('https://api.open-meteo.com/v1/forecast?' + WX + '&past_days=10&forecast_days=1')]);
    const t = {};
    old.concat(recent).forEach(([d, v]) => { if (v != null) t[d] = Math.round(v * 10) / 10; });
    if (!Object.keys(t).length) return;
    wx = t;
    try { localStorage.setItem('lifehub-heat-wx', JSON.stringify({ day: today, t })); } catch (e) {}
    renderEnergy();
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const wxOf = pre => avg(Object.keys(wx).filter(d => d.startsWith(pre)).map(d => wx[d]));
  const deg = v => v == null ? '–' : Math.round(v) + '°';
  /* How usage moves with the weather: a straight line through every finished day,
     total kWh against that day's mean outside temperature. Rough on purpose: the
     schedule, the modes and Sammy's days move usage too. */
  function wxLink(M, today) {
    const pts = Object.keys(M.by).filter(d => d < today && wx[d] != null).map(d => [wx[d], tot(M.sum([M.by[d]])) / 1000]);
    if (pts.length < 7) return 'Outside temperature is the line. After a week of data this says how much a colder day costs (' + pts.length + ' of 7 days so far).';
    const mx = avg(pts.map(p => p[0])), my = avg(pts.map(p => p[1]));
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0), sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const lo = Math.min(...pts.map(p => p[0])), hi = Math.max(...pts.map(p => p[0]));
    if (hi - lo < 3 || !sxx) return 'The days so far were all about ' + deg(mx) + ' outside, so the effect of the weather cannot be seen yet.';
    const b = sxy / sxx;
    if (b > -0.05) return 'Over ' + pts.length + ' days, the outside temperature made no clear difference to usage yet.';
    const pd = st.energy.priceDay;
    return 'Each degree colder outside adds about ' + (-b).toFixed(1) + ' kWh a day' + (pd ? ' (≈ €' + (-b * pd).toFixed(2) + ')' : '') +
      ', from ' + pts.length + ' days between ' + deg(lo) + ' and ' + deg(hi) + '.';
  }

  const outVs = (pre, prePrev) => { const a = wxOf(pre), b = wxOf(prePrev);
    return a == null ? '' : ' · ' + deg(a) + ' outside' + (b != null ? ' (' + deg(b) + ' the year before)' : ''); };
  function renderEnergy() {
    const E = st.energy; if (!E) return;
    if (document.activeElement !== $('pday')) $('pday').value = E.priceDay || '';
    if (document.activeElement !== $('pnight')) $('pnight').value = E.priceNight || '';
    const M = energyModel();
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() - 6 * 3600e3)); // days run 06:00–06:00
    if (eYear == null) { eYear = +today.slice(0, 4); eMonth = +today.slice(5, 7); }
    document.querySelectorAll('#eview button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === eView)));
    $('enav').classList.toggle('hidden', eView === 'days');
    $('ecmpw').classList.toggle('hidden', eView === 'days');
    $('ecmp').checked = eCmp;
    const firstY = M.first ? +M.first.slice(0, 4) : eYear, firstM = M.first ? +M.first.slice(5, 7) : eMonth;
    const ty = +today.slice(0, 4), tm = +today.slice(5, 7);
    let items = [], s1, s2, l1, l2, c1 = '', c2 = '';

    if (eView === 'days') {
      for (let i = 13; i >= 0; i--) {
        const dt = new Date(today + 'T12:00:00Z'); dt.setUTCDate(dt.getUTCDate() - i);
        const k = dt.toISOString().slice(0, 10), d = M.by[k];
        items.push({ key: k, lab: (i % 2 === 1 || i === 0) ? String(+k.slice(8)) : '', cur: d ? M.sum([d]) : null, part: k === today, kind: 'day' });
      }
      const w7 = items.slice(-7).filter(x => x.cur);
      s1 = M.sum(w7.map(x => M.by[x.key])); l1 = 'Last 7 days';
      s2 = M.sum(M.inP(today.slice(0, 7))); l2 = new Intl.DateTimeFormat('en-GB', { month: 'long' }).format(new Date(today + 'T12:00:00Z'));
      c1 = money(s1); c2 = money(s2);
      const w7t = avg(w7.map(x => wx[x.key]).filter(v => v != null)), mt = wxOf(today.slice(0, 7));
      if (w7t != null) c1 += (c1 ? ' · ' : '') + deg(w7t) + ' outside';
      if (mt != null) c2 += (c2 ? ' · ' : '') + deg(mt) + ' outside';
      $('eper').textContent = '';
    } else if (eView === 'month') {
      const pre = eYear + '-' + String(eMonth).padStart(2, '0'), prePrev = (eYear - 1) + '-' + String(eMonth).padStart(2, '0');
      const nDays = new Date(Date.UTC(eYear, eMonth, 0)).getUTCDate();
      for (let d = 1; d <= nDays; d++) {
        const k = pre + '-' + String(d).padStart(2, '0'), kp = prePrev + '-' + String(d).padStart(2, '0');
        const cur = M.by[k], prev = M.by[kp];
        items.push({ key: k, lab: (d === 1 || d % 5 === 0) ? String(d) : '', cur: cur ? M.sum([cur]) : null,
          prev: eCmp && prev ? tot(M.sum([prev])) : null, part: k === today, future: k > today, kind: 'day' });
      }
      s1 = M.sum(M.inP(pre)); l1 = MON[eMonth - 1] + ' ' + eYear; c1 = money(s1);
      const sp = M.sum(M.inP(prePrev));
      s2 = sp; l2 = MON[eMonth - 1] + ' ' + (eYear - 1); c2 = sp.n ? money(sp) : 'no data yet';
      $('eper').textContent = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(new Date(Date.UTC(eYear, eMonth - 1, 15)));
      $('eprev').disabled = eYear < firstY || (eYear === firstY && eMonth <= firstM);
      $('enext').disabled = eYear > ty || (eYear === ty && eMonth >= tm);
      c1 += (c1 ? ' · ' : '') + delta(s1, sp);
      c1 += outVs(pre, prePrev);
    } else {
      for (let m = 1; m <= 12; m++) {
        const pre = eYear + '-' + String(m).padStart(2, '0'), prePrev = (eYear - 1) + '-' + String(m).padStart(2, '0');
        const cur = M.inP(pre), prev = M.inP(prePrev);
        items.push({ key: pre, lab: MON[m - 1].slice(0, 1), cur: cur.length ? M.sum(cur) : null,
          prev: eCmp && prev.length ? tot(M.sum(prev)) : null, part: pre === today.slice(0, 7), future: pre > today.slice(0, 7), kind: 'month' });
      }
      s1 = M.sum(M.inP(String(eYear))); l1 = String(eYear); c1 = money(s1);
      const sp = M.sum(M.inP(String(eYear - 1)));
      s2 = sp; l2 = String(eYear - 1); c2 = sp.n ? money(sp) : 'no data yet';
      $('eper').textContent = String(eYear);
      $('eprev').disabled = eYear <= firstY; $('enext').disabled = eYear >= ty;
      c1 += (c1 ? ' · ' : '') + delta(s1, sp);
      c1 += outVs(String(eYear), String(eYear - 1));
    }
    $('el1').textContent = l1; $('e7').textContent = kwh(tot(s1)); $('c7').textContent = c1;
    $('eml').textContent = l2; $('em').textContent = s2.n ? kwh(tot(s2)) : '–'; $('cm').textContent = c2;

    const max = Math.max(1000, ...items.map(x => Math.max(x.cur ? tot(x.cur) : 0, x.prev || 0)));
    const h = v => (100 * v / max) + '%';
    $('bars').innerHTML = items.map(x => {
      const ghost = x.prev != null ? '<span class="ghost" style="height:' + h(x.prev) + '"></span>' : '';
      const before = M.first && x.key < M.first.slice(0, x.key.length);
      if (!x.cur) return ghost || x.future || before ? '<div class="bar" style="cursor:default">' + ghost + '</div>' : '<div class="bar gap"></div>';
      return '<div class="bar' + (x.part ? ' part' : '') + '" data-k="' + x.key + '" data-kind="' + x.kind + '" aria-pressed="' + (pickKey === x.key) + '">' + ghost +
        '<i class="k" style="height:' + h(x.cur.bed) + '"></i><i class="lv" style="height:' + h(x.cur.liv) + '"></i></div>';
    }).join('');
    items.forEach(x => { x.t = x.kind === 'day' ? (wx[x.key] != null ? wx[x.key] : null) : wxOf(x.key); });
    drawWx(items);
    $('bl').innerHTML = items.map(x => '<span>' + x.lab + '</span>').join('');
    $('eleg3').textContent = eCmp && eView !== 'days' ? 'Dashed outline = a year earlier' : 'Faded bar = still counting';

    const pick = items.find(x => x.key === pickKey && x.cur);
    if (pick) {
      const x = pick.cur, nightPct = Math.round(100 * x.night / Math.max(1, tot(x)));
      const name = pick.kind === 'day'
        ? new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(pick.key + 'T12:00:00Z'))
        : MON[+pick.key.slice(5) - 1] + ' ' + pick.key.slice(0, 4);
      $('eday').textContent = name + ': living ' + kwh(x.liv) + ', kids ' + kwh(x.bed) + ' (' + (x.est ? '≈' : '') + nightPct + '% night)' +
        (money(x) ? ' · ' + money(x) : '') + (pick.part ? ' so far' : '') +
        (pick.prev != null ? ' · a year earlier ' + kwh(pick.prev) : '') +
        (pick.t != null ? ' · ' + deg(pick.t) + ' outside' : '');
    } else $('eday').textContent = 'Tap a bar for details.';
    $('ewx').textContent = wxLink(M, today);
    $('enote').textContent = 'Data starts 14 Oct 2026 (Adax keeps only 7 days; the hub keeps everything since). Night tariff: 22:00–06:00 Nov–Mar, 23:00–07:00 Apr–Oct. Days before 22 Oct have no day/night split, so their cost is estimated (≈).';
  }

  /* The temperature line over the bars, in pixels measured from the bars themselves,
     so each point sits on its bar. Its own scale: coldest at the bottom, warmest at the top. */
  function drawWx(items) {
    const box = $('bars'), old = box.querySelector('.tline'); if (old) old.remove();
    const pts = items.map((x, i) => [x.t, box.children[i], x.future]).filter(p => p[0] != null && !p[2]);
    if (pts.length < 2) return;
    const W = box.clientWidth, H = box.clientHeight, x0 = box.getBoundingClientRect().left;
    const ts = pts.map(p => p[0]), lo = Math.min(...ts) - 2, hi = Math.max(...ts) + 2;
    const xy = pts.map(([t, el]) => { const r = el.getBoundingClientRect(); return [r.left - x0 + r.width / 2, 6 + (H - 12) * (1 - (t - lo) / (hi - lo)), t]; });
    box.insertAdjacentHTML('beforeend', '<svg class="tline" width="' + W + '" height="' + H + '" aria-hidden="true">' +
      '<polyline points="' + xy.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/>' +
      xy.map(p => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + tempColor(p[2]) + '"/>').join('') +
      '<text x="' + (W - 2) + '" y="11" text-anchor="end">' + deg(hi - 2) + '</text><text x="' + (W - 2) + '" y="' + (H - 3) + '" text-anchor="end">' + deg(lo + 2) + '</text></svg>');
  }
  // Redraw when the chart changes size: a turned phone, or the page shown after the
  // sign-in screen, which hid it while the first drawing measured zero width.
  if (window.ResizeObserver) { let lw = 0; new ResizeObserver(() => { const w = $('bars').clientWidth; if (w && w !== lw && st && st.energy) { lw = w; renderEnergy(); } }).observe($('bars')); }
  $('eview').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    eView = b.dataset.v; pickKey = null; keepView(); renderEnergy();
  });
  $('eprev').onclick = () => { if (eView === 'month') { if (--eMonth < 1) { eMonth = 12; eYear--; } } else eYear--; pickKey = null; renderEnergy(); };
  $('enext').onclick = () => { if (eView === 'month') { if (++eMonth > 12) { eMonth = 1; eYear++; } } else eYear++; pickKey = null; renderEnergy(); };
  $('ecmp').onchange = () => { eCmp = $('ecmp').checked; keepView(); renderEnergy(); };
  $('bars').addEventListener('click', ev => {
    const b = ev.target.closest('.bar[data-k]'); if (!b) return;
    if (b.dataset.kind === 'month' && pickKey === b.dataset.k) { eView = 'month'; eYear = +b.dataset.k.slice(0, 4); eMonth = +b.dataset.k.slice(5); pickKey = null; keepView(); }
    else pickKey = b.dataset.k;
    renderEnergy();
  });
  $('psave').onclick = async () => {
    const r = await call('&cmd=price&day=' + encodeURIComponent($('pday').value.trim()) + '&night=' + encodeURIComponent($('pnight').value.trim()));
    if (r) say(r.msg.split(' Now:')[0]);
  };

  function say(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(say.h); say.h = setTimeout(() => t.classList.remove('show'), 3200);
  }

  async function call(q) {
    if (!window.HubSync || !HubSync.on()) { $('nosync').classList.remove('hidden'); $('upd').textContent = ''; return null; }
    const c = HubSync.cfg();
    const url = c.url + (c.url.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(c.tok) + '&action=heat' + (q || '');
    busy = true; document.querySelectorAll('.tog,.seg button').forEach(b => b.disabled = true);
    try {
      const r = await (await fetch(url)).json();
      if (r.error) { say(r.error); return null; }
      st = r; render(); return r;
    } catch (e) { say('Offline. Try again.'); return null; }
    finally { busy = false; document.querySelectorAll('.tog,.seg button').forEach(b => b.disabled = false); }
  }

  $('b-home').onclick = async () => { if (st && !st.away) return; const r = await call('&cmd=arrive'); if (r) say(r.msg); };
  $('b-away').onclick = async () => { if (st && st.away) return; const r = await call('&cmd=leave'); if (r) say(r.msg); };
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
