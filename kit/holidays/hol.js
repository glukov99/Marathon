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

  root.Hol = { add, diff, leaveDays, leaveYear, used, friend, ics };
})(typeof window !== 'undefined' ? window : globalThis);
