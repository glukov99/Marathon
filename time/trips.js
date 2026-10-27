/* Trips from the time marks (Life_Time, see lifehub-script/Times.js). No DOM here: node time/check.js tests it.
   A trip opens on "ready" (Time menu), "out" (left home) or an arrival, and closes on "back" (home again).
   Silence over 12 h also closes it. Each part is measured only when both of its marks exist. */
(function (root) {
  const H = 3600e3, TZ = 'Europe/Sofia';
  const ACTS = ['Gym', 'Nursery drop-off', 'Nursery pick-up', "Iva's parents", 'Grandma', 'Run', 'Shop', 'Car wash', 'Friends'];
  const PLACES = ['Gym', 'Nursery', "Iva's parents", 'Grandma', 'Shop', 'Car wash'];

  function hourSofia(ms) {
    return Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(new Date(ms))) % 24;
  }
  // A place names the trip when the menu was not used. The nursery: morning = drop-off, afternoon = pick-up.
  function actFor(place, at) {
    if (!place) return '';
    if (/nursery/i.test(place)) return hourSofia(at) < 12 ? 'Nursery drop-off' : 'Nursery pick-up';
    return ACTS.find(a => a.toLowerCase() === place.toLowerCase()) || place;
  }

  function build(marks, now) {
    const ms = marks.slice().sort((a, b) => a.at - b.at);
    const trips = [];
    let cur = null;
    const open = () => ({ marks: [], visits: [], ready: 0, out: 0, back: 0, what: '' });
    const last = t => t.marks.length ? t.marks[t.marks.length - 1].at : 0;
    const close = () => { if (cur) { trips.push(cur); cur = null; } };
    for (const m of ms) {
      if (m.mark === 'manual') { trips.push({ manual: true, marks: [m], what: m.what, start: m.at, end: m.end }); continue; }
      if (cur && m.at - last(cur) > 12 * H) close();
      if (m.mark === 'back' && !cur) continue; // home again with nothing open: nothing to measure
      if (m.mark === 'ready' && cur && (cur.out || cur.visits.length)) close(); // getting ready for the next thing
      if (!cur) cur = open();
      if (m.mark === 'ready') { if (!cur.ready) cur.ready = m.at; if (m.what) cur.what = m.what; } // a second tap corrects the name
      else if (m.mark === 'out') { if (!cur.out) cur.out = m.at; } // "Leaving now" first, the 500 m automation later: keep the first
      else if (m.mark === 'in') cur.visits.push({ place: m.place, in: m.at, off: 0 });
      else if (m.mark === 'off') {
        const v = cur.visits.slice().reverse().find(x => x.place.toLowerCase() === m.place.toLowerCase() && !x.off);
        if (v) v.off = m.at; else cur.visits.push({ place: m.place, in: 0, off: m.at });
      }
      if (m.what && !cur.what) cur.what = m.what;
      cur.marks.push(m);
      if (m.mark === 'back') { cur.back = m.at; close(); }
    }
    if (cur) { cur.open = true; trips.push(cur); }
    const t0 = now || Date.now();
    return trips.map(t => t.manual ? finishManual(t) : finish(t, t0)).sort((a, b) => b.start - a.start);
  }

  function finishManual(t) {
    return { manual: true, what: t.what, start: t.start, end: t.end, ids: [t.marks[0].id], parts: { total: t.end - t.start }, visits: [], marks: t.marks };
  }

  function finish(t, now) {
    const v0 = t.visits.find(v => v.in), vl = t.visits.slice().reverse().find(v => v.off);
    const start = t.ready || t.out || (v0 && v0.in) || t.marks[0].at;
    const end = t.back || 0;
    const p = {};
    if (t.ready && t.out && t.out > t.ready) p.ready = t.out - t.ready;
    if (t.out && v0 && v0.in > t.out) p.travel = v0.in - t.out;
    if (v0 && v0.in > start) p.arrive = v0.in - start; // from the start to the door of the place
    const at = t.visits.filter(v => v.in && v.off).reduce((s, v) => s + (v.off - v.in), 0);
    if (at) p.there = at;
    if (vl && end > vl.off) p.home = end - vl.off;
    if (end) p.total = end - start;
    const what = t.what || (v0 ? actFor(v0.place, v0.in) : t.visits[0] ? actFor(t.visits[0].place, t.visits[0].off) : '');
    const live = !end && now - start < 12 * H;
    return { what, start, end, open: live, unfinished: !end && !live, parts: p, visits: t.visits, ids: t.marks.map(m => m.id), marks: t.marks };
  }

  function q(xs, f) { // nearest rank
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.max(0, Math.ceil(f * s.length) - 1)];
  }
  /* Per activity: typical (median) and "plan for". Plan for = the 80th percentile: on time 4 times out of 5.
     Under 3 trips it is the longest one seen, the pessimistic choice. */
  const PARTS = ['ready', 'travel', 'arrive', 'there', 'home', 'total'];
  function stats(trips) {
    const by = {};
    trips.filter(t => t.what && !t.open && !UNNAMED.test(t.what)).forEach(t => (by[t.what] = by[t.what] || []).push(t));
    const out = {};
    for (const [what, ts] of Object.entries(by)) {
      const o = { n: ts.length, parts: {} };
      for (const k of PARTS) {
        const xs = ts.map(t => t.parts[k]).filter(x => x > 0);
        if (xs.length) o.parts[k] = { n: xs.length, med: q(xs, .5), plan: xs.length < 3 ? Math.max(...xs) : q(xs, .8) };
      }
      out[what] = o;
    }
    return out;
  }

  /* "I need to be there at T": when to start getting ready and when to leave. */
  function plan(st, at) {
    if (!st) return {};
    const P = st.parts, r = {};
    if (P.travel) r.leaveBy = at - P.travel.plan;
    if (P.ready && r.leaveBy) r.startBy = r.leaveBy - P.ready.plan;
    else if (P.arrive) r.startBy = at - P.arrive.plan;
    return r;
  }

  /* ---- GPS visits (our own Arc, lifehub-script Visits.js) ---- */
  function dist(a, b) {
    const k = Math.PI / 180, x = (b.lon - a.lon) * k * Math.cos((a.lat + b.lat) / 2 * k), y = (b.lat - a.lat) * k;
    return Math.sqrt(x * x + y * y) * 6371e3;
  }
  function placeOf(v, places) {
    let best = null, bd = Infinity;
    (places || []).forEach(p => { const d = dist(p, v); if (d <= (p.r || 150) && d < bd) { best = p; bd = d; } });
    return best;
  }
  const UNNAMED = /^\?/;
  const spotKey = v => '?' + v.lat.toFixed(3) + ',' + v.lon.toFixed(3);
  /* Visits become marks: Home = back (arrived) and out (left); any other place = in and off.
     A place not named yet gets a "?lat,lon" key, so its trips can be named later from the Places list. */
  function visitMarks(visits, places, current) {
    const all = (visits || []).concat(current ? [{ id: 'vnow', start: current.start, end: 0, lat: current.lat, lon: current.lon }] : []);
    const out = [];
    all.forEach(v => {
      const p = placeOf(v, places), name = p ? p.name : '', base = { what: '', end: 0, src: 'gps', lat: v.lat, lon: v.lon };
      if (/^home$/i.test(name)) {
        out.push({ ...base, id: v.id + ':b', at: v.start, mark: 'back', place: '' });
        if (v.end) out.push({ ...base, id: v.id + ':o', at: v.end, mark: 'out', place: '' });
      } else {
        const pl = name || spotKey(v);
        out.push({ ...base, id: v.id + ':i', at: v.start, mark: 'in', place: pl });
        if (v.end) out.push({ ...base, id: v.id + ':f', at: v.end, mark: 'off', place: pl });
      }
    });
    return out;
  }
  /* Taps and typed trips + GPS. Once GPS covers a time, the heating automation's leave/arrive (500 m out) is dropped. */
  function merge(marks, visits, places, current) {
    const gm = visitMarks(visits, places, current);
    const span = (visits || []).map(v => [v.start - 45 * 60e3, (v.end || Date.now()) + 45 * 60e3]);
    const keep = marks.filter(m => m.src !== 'heat' || !span.some(([a, b]) => m.at >= a && m.at <= b));
    return keep.concat(gm);
  }
  /* Stops with no name yet, grouped within 150 m, most visited first. */
  function unnamed(visits, places) {
    const groups = [];
    (visits || []).filter(v => !placeOf(v, places)).forEach(v => {
      const g = groups.find(g => dist(g, v) <= 150);
      if (g) { g.vs.push(v); g.lat = g.vs.reduce((s, x) => s + x.lat, 0) / g.vs.length; g.lon = g.vs.reduce((s, x) => s + x.lon, 0) / g.vs.length; }
      else groups.push({ lat: v.lat, lon: v.lon, vs: [v] });
    });
    return groups.map(g => ({ lat: g.lat, lon: g.lon, n: g.vs.length, last: Math.max(...g.vs.map(v => v.start)),
      med: q(g.vs.map(v => v.end - v.start), .5), key: spotKey(g.vs[0]) })).sort((a, b) => b.n - a.n || b.last - a.last);
  }

  const api = { ACTS, PLACES, PARTS, UNNAMED, build, stats, plan, actFor, q, dist, placeOf, visitMarks, merge, unnamed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trips = api;
})(this);
