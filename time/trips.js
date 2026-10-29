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
    let trips = [];
    let cur = null;
    const open = () => ({ marks: [], visits: [], ready: 0, out: 0, back: 0, what: '' });
    const last = t => t.marks.length ? t.marks[t.marks.length - 1].at : 0;
    const close = () => { if (cur) { trips.push(cur); cur = null; } };
    for (const m of ms) {
      if (m.mark === 'start' || m.mark === 'stop') continue; // home timers, see tasks()
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
    // Just being at one place (one stay, no tap, no leaving or coming home) is not a trip: an unnamed home looked like
    // "out at an unnamed stop since 07:04".
    trips = trips.filter(t => t.manual || t.ready || t.out || t.back || new Set(t.visits.map(v => v.place.toLowerCase())).size > 1);
    return trips.map(t => t.manual ? finishManual(t) : finish(t, t0)).concat(tasks(ms, t0)).sort((a, b) => b.start - a.start);
  }

  /* Things done at home (cooking, bath time…): Start, then Stop. Starting another stops the one running.
     They count like trips (total only) and never open or close a trip. Over 12 h without Stop = forgotten, not counted. */
  function tasks(ms, now) {
    const out = [];
    let cur = null;
    const close = at => { if (!cur) return; cur.end = at; cur.parts = { total: at - cur.start }; out.push(cur); cur = null; };
    ms.filter(m => m.mark === 'start' || m.mark === 'stop').forEach(m => {
      if (m.mark === 'start') { close(m.at); cur = { task: true, what: m.what, start: m.at, end: 0, parts: {}, visits: [], ids: [m.id], marks: [m] }; }
      else if (cur) { cur.ids.push(m.id); cur.marks.push(m); close(m.at); }
    });
    if (cur) { const live = now - cur.start < 12 * H; out.push(Object.assign(cur, { open: live, unfinished: !live })); }
    return out;
  }

  function finishManual(t) {
    return { manual: true, what: t.what, start: t.start, end: t.end, ids: [t.marks[0].id], parts: { total: t.end - t.start }, visits: [], marks: t.marks };
  }

  /* When you actually left: the first sign of moving after the tap (left home, left a stop, arrived somewhere).
     A run's own start counts only when nothing came before it, so an unnamed home cannot stretch "getting ready"
     to the start of a run an hour later. */
  function leftAt(t) {
    const after = t.marks.filter(m => m.at >= (t.ready || 0) && (m.mark === 'in' || m.mark === 'off' || (m.mark === 'out' && m.src !== 'run'))).map(m => m.at);
    const run = t.marks.filter(m => m.mark === 'out' && m.src === 'run').map(m => m.at);
    return after.length ? Math.min(...after) : run.length ? Math.min(...run) : 0;
  }

  function finish(t, now) {
    const v0 = t.visits.find(v => v.in), vl = t.visits.slice().reverse().find(v => v.off);
    const start = t.ready || t.out || (v0 && v0.in) || t.marks[0].at;
    const end = t.back || 0;
    const p = {};
    const left = leftAt(t);
    if (t.ready && left > t.ready) p.ready = left - t.ready;
    if (left && v0 && v0.in > left) p.travel = v0.in - left;
    if (v0 && v0.in > start) p.arrive = v0.in - start; // from the start to the door of the place
    const at = t.visits.filter(v => v.in && v.off).reduce((s, v) => s + (v.off - v.in), 0);
    if (at) p.there = at;
    if (vl && end > vl.off) p.home = end - vl.off;
    if (end) p.total = end - start;
    const real = t.visits.find(v => v.in && !UNNAMED.test(v.place)) || t.visits.find(v => v.in && v.off - v.in >= 10 * 60e3) || v0; // skip traffic stops
    const what = t.what || (real ? actFor(real.place, real.in) : t.visits[0] ? actFor(t.visits[0].place, t.visits[0].off) : '');
    const live = !end && now - start < 12 * H;
    const legs = splitLegs(t, start, end);
    if (legs) { delete p.there; delete p.arrive; } // a chain's "time at stops" adds up unlike things; its legs carry those
    return { what: legs ? legs.map(l => l.what).join(' → ') : what, start, end, open: live, unfinished: !end && !live, parts: p, legs,
      visits: t.visits, ids: t.marks.map(m => m.id), marks: t.marks };
  }

  /* A trip with two or more things in it (drop-off, then a run) is split into legs, one per thing:
     a leg runs from the end of the previous thing (or the trip's start) to the end of its own thing;
     the last leg also takes the way home. Things: each stop, and each run from the watch
     (a stop during a run belongs to the run). The menu tap names the leg it matches, otherwise the first. */
  function splitLegs(t, start, end) {
    const runs = t.marks.filter(m => m.src === 'run' && m.mark === 'out' && m.end).map(m => ({ act: 'Run', a: m.at, b: m.end, watch: true }));
    const near = 15 * 60e3, allIn = t.visits.filter(v => v.in);
    // The parking or warm-up spot: you are there just before a run (ending ≤ 15 min before it) and back at the
    // same spot just after it (≤ 15 min after; the car). Both belong to the run. A stop you do not come back to
    // (the nursery, then straight onto the run) stays its own thing.
    const same = (a, b) => a.place.toLowerCase() === b.place.toLowerCase();
    const runSpot = v => runs.some(r => {
      const before = allIn.filter(x => x.in < r.a), after = allIn.filter(x => x.in > r.b);
      const pre = before[before.length - 1], post = after[0];
      const ok = pre && post && pre.off && r.a - pre.off <= near && post.in - r.b <= near && same(pre, post);
      return ok && (v === pre || (same(v, post) && v.in > r.b && v.in - r.b <= near + 30 * 60e3));
    });
    // a stop that overlaps the run at all is the run (the track you circled, the warm-up there before the watch started)
    const stops = t.visits.filter(v => v.in && !runs.some(r => v.in <= r.b && (v.off || Infinity) >= r.a) && !runSpot(v))
      .filter(v => !UNNAMED.test(v.place) || (v.off && v.off - v.in >= 10 * 60e3)) // a short unnamed stop is traffic, not a thing
      .map(v => ({ act: actFor(v.place, v.in), a: v.in, b: v.off || 0 }));
    const xs = runs.concat(stops).sort((x, y) => x.a - y.a)
      // the same place twice in a row = one thing. A stop at a spot named Run next to the watch's run: the watch's
      // start and stop are the run (29 Oct 2026: a 37-min run read as 63 min from the stop before it).
      .reduce((acc, x) => {
        const l = acc[acc.length - 1];
        if (!l || l.act !== x.act) acc.push({ ...x });
        else if (x.watch && !l.watch) { l.s = l.a; l.a = x.a; l.b = x.b; l.watch = true; } // s: when you got to the spot
        else if (!l.watch || x.watch) l.b = x.b || l.b;
        return acc;
      }, []);
    // The menu tap names something with no stop of its own yet (the nursery not named, or no GPS): it is the first
    // thing, from the start until the next thing begins. "Nursery drop-off", then the watch's run → two legs.
    if (t.what && xs.length && !xs.some(x => x.act === t.what) && xs[0].a > start) xs.unshift({ act: t.what, a: start, b: xs[0].s || xs[0].a, tap: true });
    if (xs.length < 2) return null;
    let tapLeg = t.what ? xs.findIndex(x => x.act === t.what) : -1;
    if (t.what && tapLeg < 0) tapLeg = 0;
    let from = start;
    return xs.map((x, k) => {
      const last = k === xs.length - 1, legEnd = last ? end : (x.b || xs[k + 1].s || xs[k + 1].a), p = {};
      const left = leftAt(t);
      if (k === 0 && t.ready && left > t.ready) p.ready = left - t.ready;
      const go = k === 0 ? (left || start) : from;
      if (!x.tap) {
        const got = x.s || x.a; // at a run spot, travel ends when you get there, not when the watch starts
        if (got > go) p.travel = got - go;
        if (got > from) p.arrive = got - from;
        if (x.b > x.a) p.there = x.b - x.a;
      }
      if (last && end && x.b && end > x.b) p.home = end - x.b;
      if (legEnd > from) p.total = legEnd - from;
      const leg = { what: k === tapLeg ? t.what : x.act, start: from, end: legEnd, parts: p };
      from = legEnd || from;
      return leg;
    });
  }

  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  function q(xs, f) { // nearest rank
    const s = xs.slice().sort((a, b) => a - b);
    return s[Math.max(0, Math.ceil(f * s.length) - 1)];
  }
  /* Per activity: typical (median) and "plan for". Plan for = the 80th percentile: on time 4 times out of 5.
     Under 3 trips it is the longest one seen, the pessimistic choice. */
  const PARTS = ['ready', 'travel', 'arrive', 'there', 'home', 'total'];
  function stats(trips) {
    const by = {};
    // Each thing counts once: a chain (drop-off → run) adds its legs, not itself; Georgi wants an average per thing (29 Oct 2026)
    const add = t => { if (t.what && !UNNAMED.test(t.what)) (by[t.what] = by[t.what] || []).push(t); };
    trips.filter(t => !t.open).forEach(t => { if (t.legs) t.legs.forEach(add); else add(t); });
    const out = {};
    for (const [what, ts] of Object.entries(by)) {
      const o = { n: ts.length, parts: {} };
      for (const k of PARTS) {
        const xs = ts.map(t => t.parts[k]).filter(x => x > 0);
        if (xs.length) o.parts[k] = { n: xs.length, avg: mean(xs), med: q(xs, .5), plan: xs.length < 3 ? Math.max(...xs) : q(xs, .8) };
      }
      out[what] = o;
    }
    return out;
  }

  /* Getting ready across every trip, whatever it was for: from the tap to leaving home. Counted once per trip
     (a chain's legs share one getting-ready). */
  function readyAll(trips) {
    const xs = trips.filter(t => !t.open && !t.task && t.parts && t.parts.ready > 0).map(t => t.parts.ready);
    return xs.length ? { n: xs.length, avg: mean(xs), med: q(xs, .5), plan: xs.length < 3 ? Math.max(...xs) : q(xs, .8) } : null;
  }

  /* "I need to be there at T": when to start getting ready and when to leave. */
  function plan(st, at, rAll) {
    if (!st) return {};
    const P = Object.assign({}, st.parts), r = {};
    if (!P.ready && P.travel && rAll) { P.ready = rAll; r.readyFromAll = true; } // no getting-ready for this one yet: use the all-trips figure
    if (P.travel) r.leaveBy = at - P.travel.plan;
    if (P.ready && r.leaveBy) r.startBy = r.leaveBy - P.ready.plan;
    else if (P.arrive) r.startBy = at - P.arrive.plan;
    else if (P.total && !P.travel) r.startBy = at - P.total.plan; // a home timer: start this long before it has to be done
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
  /* "Ignore" on a pending stop saves it as a small place named Ignored (60 m): its visits make no marks at all. */
  const IGNORED = 'Ignored', isIgnored = p => !!(p && p.name === IGNORED);
  const spotKey = v => '?' + v.lat.toFixed(3) + ',' + v.lon.toFixed(3);
  /* Visits become marks: Home = back (arrived) and out (left); any other place = in and off.
     A place not named yet gets a "?lat,lon" key, so its trips can be named later from the Places list. */
  function visitMarks(visits, places, current) {
    const all = (visits || []).concat(current ? [{ id: 'vnow', start: current.start, end: 0, lat: current.lat, lon: current.lon }] : []);
    const out = [];
    all.forEach(v => {
      const p = placeOf(v, places);
      if (isIgnored(p)) return;
      const name = p ? p.name : '', base = { what: '', end: 0, src: 'gps', lat: v.lat, lon: v.lon };
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
  /* Taps and typed trips + GPS. The heating automation's leave/arrive (500 m out) is dropped only when GPS has the
     same leave or arrive within 45 min. Before 28 Oct any GPS stay nearby dropped it: Overland paused at the office,
     sent nothing from home, and the 16:35 arrive-home was lost, so the trip stayed open until a tap. */
  function merge(marks, visits, places, current, runs) {
    const vm = visitMarks(visits, places, current), gm = vm.concat(runMarks(runs, visits, places, marks));
    const near = (m, at) => Math.abs(m.at - at) <= 45 * 60e3;
    const keep = marks.filter(m => m.src !== 'heat' || !vm.some(g => g.mark === m.mark && near(g, m.at)));
    // A stay where the phone paused ends at the first point after the pause, which can be after you got home.
    // ponytail: the leave is then put 1 min before the arrive, so that way home reads ~0; good enough, it is rare.
    const backs = keep.filter(m => m.src === 'heat' && m.mark === 'back').map(m => m.at);
    gm.forEach(g => { const b = g.mark === 'off' && backs.find(x => x < g.at && near(g, x)); if (b) g.at = b - 60e3; });
    return keep.concat(gm);
  }
  /* Runs from the watch. The trip must be door to door, travel included, so:
     - phone at home during the run (a Home stay covers it), or no GPS around it: the run is the trip,
       out at the watch's start, back at its stop;
     - phone along: GPS has the real leave and return (walk or drive to the start, the way home); the run only
       names the trip (an out mark named Run; the earlier GPS out wins, so it changes no time).
     A run mostly inside a stay at a named place (not Home, not Run) is left out: a treadmill at the gym.
     Inside an unnamed stay it counts: laps on a track or a small loop stay within 100 m and read as one long stop
     (29 Oct 2026: the run vanished and the track showed up as a 54-min unnamed stop). */
  function runMarks(runs, visits, places, marks) {
    const vs = visits || [], H12 = 12 * 3600e3, ms = marks || [];
    // Runs from before the time log existed have only the watch's start and stop, no travel: they would make runs
    // look shorter than the door-to-door trips measured since. So runs count from the first GPS stay or the first
    // tap / leave / arrive mark, whichever came first (typed trips do not count as a start).
    const since = Math.min(...vs.map(v => v.start), ...ms.filter(m => m.mark !== 'manual').map(m => m.at));
    if (!isFinite(since)) return [];
    const isHome = v => { const p = placeOf(v, places); return !!(p && /^home$/i.test(p.name)); };
    const elsewhere = v => { const p = placeOf(v, places); return !!(p && !isIgnored(p) && !/^(home|run)$/i.test(p.name)); };
    return (runs || []).filter(r => r.start >= since).filter(r => !vs.some(v => elsewhere(v) &&
      Math.min(r.end, v.end || Infinity) - Math.max(r.start, v.start) > (r.end - r.start) / 2)).flatMap(r => {
      const mid = (r.start + r.end) / 2;
      const atHome = vs.some(v => isHome(v) && v.start <= mid && (v.end || Infinity) >= mid);
      const gpsOn = vs.some(v => (v.end || Infinity) >= r.start - H12 && v.start <= r.end + H12);
      const out = { id: 'r:' + r.id + ':o', at: r.start, mark: 'out', what: 'Run', place: '', end: r.end, src: 'run' };
      // no GPS, but the heating automation (or a tap) saw you come home within 90 min: that is the real end, door to door
      const backSoon = !gpsOn && ms.some(m => m.mark === 'back' && m.at >= r.end && m.at <= r.end + 90 * 60e3);
      return (atHome || !gpsOn) && !backSoon ? [out, { id: 'r:' + r.id + ':b', at: r.end, mark: 'back', what: '', place: '', end: 0, src: 'run' }] : [out];
    });
  }

  /* Stops with no name yet, grouped within 150 m, most visited first. A stop during a run from the watch, or in the
     20 min after it, is the run (a track, a hill, the cool-down), so it is not asked about. */
  function unnamed(visits, places, runs) {
    const groups = [];
    const inRun = v => (runs || []).some(r => v.start <= r.end + 20 * 60e3 && v.end >= r.start); // + the cool-down after
    (visits || []).filter(v => !placeOf(v, places) && !inRun(v)).forEach(v => {
      const g = groups.find(g => dist(g, v) <= 150);
      if (g) { g.vs.push(v); g.lat = g.vs.reduce((s, x) => s + x.lat, 0) / g.vs.length; g.lon = g.vs.reduce((s, x) => s + x.lon, 0) / g.vs.length; }
      else groups.push({ lat: v.lat, lon: v.lon, vs: [v] });
    });
    return groups.map(g => ({ lat: g.lat, lon: g.lon, n: g.vs.length, last: Math.max(...g.vs.map(v => v.start)),
      med: q(g.vs.map(v => v.end - v.start), .5), key: spotKey(g.vs[0]) })).sort((a, b) => b.n - a.n || b.last - a.last);
  }

  const api = { ACTS, PLACES, PARTS, UNNAMED, IGNORED, build, stats, plan, readyAll, actFor, q, dist, placeOf, visitMarks, merge, unnamed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Trips = api;
})(this);
