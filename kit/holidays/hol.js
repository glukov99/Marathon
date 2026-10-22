/* Holidays arithmetic for the kit. Pure, checked by holidays/check.js.
   Dates are 'YYYY-MM-DD' strings throughout; noon UTC avoids time-zone edges. */
(function (root) {
  const D = s => new Date(s + 'T12:00:00Z');
  const S = d => d.toISOString().slice(0, 10);
  const add = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
  const diff = (a, b) => Math.round((D(b) - D(a)) / 864e5); // days from a to b

  // Leave a trip takes: every Monday to Friday in it, except bank holidays (a day off anyway).
  function leaveDays(t, bank) {
    if (!t.from || !t.to || t.to < t.from) return 0;
    let n = 0;
    for (let s = t.from; s <= t.to; s = add(s, 1)) { const w = D(s).getUTCDay(); if (w > 0 && w < 6 && !bank[s]) n++; }
    return n;
  }

  // The leave year that holds `day`, starting on the 1st of month m (1 = January, 4 = April).
  function leaveYear(day, m) {
    const y = +day.slice(0, 4), start = `${y}-${String(m).padStart(2, '0')}-01`;
    const from = day >= start ? start : `${y - 1}-${String(m).padStart(2, '0')}-01`;
    return { from, to: add(`${+from.slice(0, 4) + 1}${from.slice(4)}`, -1) };
  }

  // Leave used inside a leave year: only the days of each trip that fall in it.
  function used(trips, yr, bank) {
    return trips.reduce((a, t) => {
      const from = t.from > yr.from ? t.from : yr.from, to = t.to < yr.to ? t.to : yr.to;
      return a + (from <= to ? leaveDays({ from, to }, bank) : 0);
    }, 0);
  }

  /* A friend: {name, every (days), met: [dates]}. Due when `every` days have passed since
     the last meeting; never met means due now. */
  function friend(f, day) {
    const met = (f.met || []).filter(Boolean).sort();
    const last = met.length ? met[met.length - 1] : null;
    const since = last ? diff(last, day) : null;
    const over = last ? since - (+f.every || 30) : 0;
    const year = met.filter(d => d.slice(0, 4) === day.slice(0, 4)).length;
    return { last, since, over, due: !last || over >= 0, year, total: met.length };
  }

  // A calendar file of the trips: all-day events, the end date exclusive as the format wants.
  function ics(trips, stamp) {
    const z = s => s.replace(/-/g, ''), esc = s => String(s || '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Life Hub Kit//EN'].concat(...trips.filter(t => t.from && t.to).map(t => [
      'BEGIN:VEVENT', 'UID:' + t.id + '@lifehub-kit', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + z(t.from),
      'DTEND;VALUE=DATE:' + z(add(t.to, 1)), 'SUMMARY:' + esc(t.name), t.place ? 'LOCATION:' + esc(t.place) : null, 'END:VEVENT'].filter(Boolean)),
      ['END:VCALENDAR']).join('\r\n');
  }

  /* Typical school holidays, weekends included, Oct 2026 to Aug 2028. There is no national
     feed: each council sets its own, so these are the usual dates for each part of the UK
     and the page says so. Scotland varies most between councils. Extend each autumn. */
  const SCHOOL = {
    'england-and-wales': [
      ['2026-10-24', '2026-11-01', 'October half term'], ['2026-12-19', '2027-01-03', 'Christmas holidays'],
      ['2027-02-13', '2027-02-21', 'February half term'], ['2027-03-27', '2027-04-11', 'Easter holidays'],
      ['2027-05-29', '2027-06-06', 'May half term'], ['2027-07-24', '2027-09-05', 'Summer holidays'],
      ['2027-10-23', '2027-10-31', 'October half term'], ['2027-12-18', '2028-01-03', 'Christmas holidays'],
      ['2028-02-12', '2028-02-20', 'February half term'], ['2028-04-08', '2028-04-23', 'Easter holidays'],
      ['2028-05-27', '2028-06-04', 'May half term'], ['2028-07-22', '2028-09-03', 'Summer holidays']],
    'scotland': [
      ['2026-12-19', '2027-01-05', 'Christmas holidays'], ['2027-02-13', '2027-02-17', 'February mid-term'],
      ['2027-03-27', '2027-04-11', 'Easter holidays'], ['2027-06-26', '2027-08-17', 'Summer holidays'],
      ['2027-10-09', '2027-10-24', 'October week'], ['2027-12-18', '2028-01-05', 'Christmas holidays'],
      ['2028-02-12', '2028-02-16', 'February mid-term'], ['2028-04-01', '2028-04-17', 'Easter holidays'],
      ['2028-06-24', '2028-08-15', 'Summer holidays']],
    'northern-ireland': [
      ['2026-10-24', '2026-11-01', 'Halloween break'], ['2026-12-19', '2027-01-03', 'Christmas holidays'],
      ['2027-02-13', '2027-02-21', 'Mid-term break'], ['2027-03-27', '2027-04-06', 'Easter holidays'],
      ['2027-07-01', '2027-08-31', 'Summer holidays'], ['2027-10-23', '2027-10-31', 'Halloween break'],
      ['2027-12-18', '2028-01-03', 'Christmas holidays'], ['2028-02-12', '2028-02-20', 'Mid-term break'],
      ['2028-04-08', '2028-04-21', 'Easter holidays'], ['2028-07-01', '2028-08-31', 'Summer holidays']],
  };
  const school = region => SCHOOL[region] || SCHOOL['england-and-wales'];
  const inSchool = (from, to, list) => list.find(([a, b]) => from <= b && to >= a) || null;
  const isOff = (s, bank) => { const w = D(s).getUTCDay(); return w === 0 || w === 6 || !!bank[s]; };

  /* The windows where a little leave buys the most days off. A window runs from the first
     day off after a working day to the last day off before the next one, at most 16 days,
     using 1 to `max` leave days. Only windows better than a plain week (9 days for 5) are
     kept, the best first, never two that overlap; then in date order. */
  function bridges(from, to, bank, max) {
    const c = [];
    for (let s = from; s <= to; s = add(s, 1)) {
      if (!isOff(s, bank) || isOff(add(s, -1), bank)) continue;
      for (let n = 3, e = add(s, 2); n <= 16; n++, e = add(e, 1)) {
        if (!isOff(e, bank) || isOff(add(e, 1), bank)) continue;
        const leave = leaveDays({ from: s, to: e }, bank);
        if (leave >= 1 && leave <= (max || 5) && n / leave > 9 / 5) c.push({ from: s, to: e, days: n, leave });
      }
    }
    c.sort((a, b) => b.days / b.leave - a.days / a.leave || b.days - a.days);
    const out = [];
    c.forEach(w => { if (!out.some(o => w.from <= o.to && w.to >= o.from)) out.push(w); });
    return out.sort((a, b) => a.from.localeCompare(b.from));
  }

  /* Cheaper weeks to fly: the week after schools go back (term time, demand drops).
     Saturday to the next Sunday: 9 days off for 5 leave, less any bank holiday in it. */
  function quietWeeks(from, to, list, bank) {
    return list.map(([, b, name]) => {
      // the holiday ends on a Sunday and schools return on the Monday; the Saturday after
      // that first school week starts a trip whose weekdays are the second week of term
      let sat = add(b, 1); while (D(sat).getUTCDay() !== 6) sat = add(sat, 1);
      const w = { from: sat, to: add(sat, 8), after: name };
      w.leave = leaveDays(w, bank); w.days = 9;
      return w;
    }).filter(w => w.from >= from && w.to <= to && !inSchool(w.from, w.to, list));
  }

  root.Hol = { add, diff, leaveDays, leaveYear, used, friend, ics, school, inSchool, isOff, bridges, quietWeeks };
})(typeof window !== 'undefined' ? window : globalThis);
