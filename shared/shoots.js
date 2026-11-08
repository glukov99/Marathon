/* Shoots the Time page saw that the Business page has no booking for (8 Nov 2026).
   A stay at a place whose name says shoot or photo ("Photoshoot", "Drone shoot") on a day with no
   booking is offered as one: "Photoshoot on Fri 6 Nov, 76 min. Add a booking?". Used by the Business
   page (Jobs tab) and the home page (brief), so the two always agree.
   Shoots.unbooked(time, bookings, today, no) -> [{id, date, place, mins}]; time = the action=time
   payload {visits, places}; no = ids he dismissed. Pure. Check: node business/render-check.js */
(function (root) {
  const R = 6371000, rad = d => d * Math.PI / 180;
  const dist = (a, b) => { const dp = rad(b.lat - a.lat), dl = rad(b.lon - a.lon);
    return 2 * R * Math.asin(Math.sqrt(Math.sin(dp / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2)); };
  const SHOOT = /shoot|photo|фото|снимк/i;
  const ymd = ms => { const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function unbooked(time, bookings, today, no) {
    const places = ((time && time.places) || []).filter(p => SHOOT.test(p.name || ''));
    if (!places.length) return [];
    const booked = new Set((bookings || []).map(b => String(b.shoot || '').slice(0, 10)));
    const from = new Date(today); from.setDate(from.getDate() - 14);
    const seen = {};
    ((time && time.visits) || []).forEach(v => {
      if (!v.start || v.start < +from || !v.end) return;
      const p = places.find(p => dist(v, p) <= (p.r || 150)); if (!p) return;
      const date = ymd(v.start), id = 'shoot:' + date;
      if (booked.has(date) || (no && no[id])) return;
      const mins = Math.round((v.end - v.start) / 6e4);
      // Two stops on one day (the drone spot, then the shoot) are one job: keep the day once, with the time added up.
      if (seen[id]) { seen[id].mins += mins; if (seen[id].place.indexOf(p.name) < 0) seen[id].place += ', ' + p.name; }
      else seen[id] = { id, date, place: p.name, mins };
    });
    return Object.values(seen).sort((a, b) => b.date.localeCompare(a.date));
  }
  root.Shoots = { unbooked, SHOOT };
})(typeof window !== 'undefined' ? window : globalThis);
