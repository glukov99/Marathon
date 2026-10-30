/* Promo codes. Photograph a promo card; the page reads vendor, code and expiry.

   Scan: a QR code on the card is read on the phone (jsQR, loaded only when a
   photo is taken). The photo, shrunk to about 1600 px, goes to the backend
   (doPost action=promoread, Promo.js), where Claude Haiku reads the three
   fields. The form opens filled in; nothing is saved until Save. The photo is
   never kept.

   Saved on this device first, then to Drive through HubSync under its own key,
   merged by id like the robotics page: the newer edit wins and delete leaves a
   `gone` marker, so the other device does not bring the card back.

   Run: node promo/check.js */
const KEY = 'lifehub-promo';

function merge(a, b) {
  const by = {};
  (a || []).concat(b || []).forEach(x => {
    if (x && x.id && (!by[x.id] || (x.u || 0) > (by[x.id].u || 0))) by[x.id] = x;
  });
  return Object.values(by);
}
const sig = l => (l || []).map(x => x.id + ':' + (x.u || 0)).sort().join();

// Expiry is the last day the code works. Dates are YYYY-MM-DD, so strings compare.
const state = (c, today) => !c.exp ? 'none' : c.exp < today ? 'expired'
  : (Date.parse(c.exp) - Date.parse(today)) / 864e5 <= 7 ? 'soon' : 'ok';

// Soonest to expire first, then cards with no date (newest first), then expired (most recent first).
function order(cards, today) {
  const l = (cards || []).filter(x => !x.gone);
  const rank = c => ({ soon: 0, ok: 0, none: 1, expired: 2 })[state(c, today)];
  return l.sort((a, b) => rank(a) - rank(b) ||
    (rank(a) === 0 ? a.exp.localeCompare(b.exp) : rank(a) === 2 ? b.exp.localeCompare(a.exp) : (b.at || 0) - (a.at || 0)));
}

// A QR code holds the promo code only when it looks like one: short, one word, not a link.
const qrCode = t => (t = String(t || '').trim()) && t.length <= 40 && !/\s/.test(t) && !/^[a-z]+:|^www\.|\.[a-z]{2,}\//i.test(t) ? t : '';

const localDay = (d = new Date()) => new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);

if (typeof module !== 'undefined') module.exports = { merge, sig, state, order, qrCode };

if (typeof document !== 'undefined') (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cards = [];
  try { cards = JSON.parse(localStorage.getItem(KEY) || 'null') || []; } catch (e) {}
  let editing = null; // id of the card in the form, or null for a new one
  let showOld = false; // expired cards are hidden; kept so a wrong date can still be fixed

  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(cards)); } catch (e) {} };
  const say = t => { $('#store').textContent = t; };
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); };

  async function sync() {
    if (!window.HubSync || !HubSync.on()) { say('Saved on this device only.'); return; }
    const r = await HubSync.pull(KEY);
    if (!r || r.error) { say('Offline: saved on this device, it syncs next time.'); return; }
    const remote = (r.data && r.data.cards) || [];
    const m = merge(cards, remote);
    if (sig(m) !== sig(cards)) { cards = m; keep(); render(); }
    if (sig(m) !== sig(remote)) HubSync.push(KEY, { cards: m }); else say('Synced across devices');
  }
  if (window.HubSync) HubSync.onStatus(t => say(t === 'Synced' ? 'Synced across devices' : t));
  const save = () => { keep(); render(); sync(); };

  const nice = d => new Date(d + 'T12:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  function render() {
    const today = localDay(), all = order(cards, today);
    const old = all.filter(c => state(c, today) === 'expired').length;
    const l = showOld ? all : all.filter(c => state(c, today) !== 'expired');
    $('#list').innerHTML = (l.length ? l.map(c => {
      const s = state(c, today);
      const exp = s === 'none' ? 'No expiry' : s === 'expired' ? 'Expired ' + nice(c.exp) : 'Until ' + nice(c.exp);
      return `<div class="card ${s}"><div class="top"><b>${esc(c.vendor || 'Unknown shop')}</b><span class="exp">${esc(exp)}</span></div>
        <button class="code" data-act="copy" data-id="${c.id}" aria-label="Copy code ${esc(c.code)}">${esc(c.code || '—')}</button>
        ${c.note ? `<p class="pnote">${esc(c.note)}</p>` : ''}
        <div class="acts"><button class="btn sm ghost" data-act="edit" data-id="${c.id}">Edit</button>
        <button class="btn sm ghost" data-act="del" data-id="${c.id}">Delete</button></div></div>`;
    }).join('') : '<div class="empty">No promo codes yet. Scan a card or add one by hand.</div>') +
      (old ? `<button class="btn sm ghost old" data-act="old">${showOld ? 'Hide' : 'Show'} ${old} expired</button>` : '');
  }

  function openForm(c, msg) {
    $('#form').classList.remove('hidden');
    $('#fV').value = c.vendor || ''; $('#fC').value = c.code || ''; $('#fE').value = c.exp || ''; $('#fN').value = c.note || '';
    $('#fMsg').textContent = msg || '';
    $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const closeForm = () => { $('#form').classList.add('hidden'); editing = null; };

  // Shrink to a JPEG for the backend; also hand back the pixels for the QR reader.
  async function shrink(file) {
    const img = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, cv.width, cv.height);
    return { b64: cv.toDataURL('image/jpeg', 0.85).split(',')[1], px: g.getImageData(0, 0, cv.width, cv.height) };
  }
  const loadQR = () => window.jsQR ? Promise.resolve() : new Promise(ok => {
    const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    s.onload = s.onerror = ok; document.head.appendChild(s);
  });

  $('#cam').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    editing = null;
    openForm({}, 'Reading the card…');
    try {
      const { b64, px } = await shrink(file);
      await loadQR();
      const q = window.jsQR ? jsQR(px.data, px.width, px.height) : null;
      const qr = qrCode(q && q.data);
      const c = HubSync.cfg();
      const r = await (await fetch(c.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ t: c.tok, action: 'promoread', img: b64 }) })).json();
      if (r.error && !qr) { openForm({}, 'Could not read it (' + r.error + '). Type the details.'); return; }
      openForm({ vendor: r.vendor, code: qr || r.code, exp: r.expiry },
        'Check the details, then Save.' + (qr ? ' The code came from the QR code.' : ''));
    } catch (err) { openForm({}, 'Could not read it. Type the details.'); }
  });
  $('#hand').addEventListener('click', () => { editing = null; openForm({}); $('#fV').focus(); });
  $('#fCancel').addEventListener('click', closeForm);
  $('#form').addEventListener('submit', e => {
    e.preventDefault();
    const v = { vendor: $('#fV').value.trim(), code: $('#fC').value.trim(), exp: $('#fE').value, note: $('#fN').value.trim() };
    if (!v.code && !v.vendor) { $('#fMsg').textContent = 'Add at least the shop or the code.'; return; }
    const now = Date.now();
    const c = editing && cards.find(x => x.id === editing);
    if (c) Object.assign(c, v, { u: now });
    else cards.push(Object.assign({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), at: now, u: now }, v));
    closeForm(); save(); toast(c ? 'Saved' : 'Promo code added');
  });

  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'old') { showOld = !showOld; render(); return; }
    const c = cards.find(x => x.id === b.dataset.id); if (!c) return;
    if (b.dataset.act === 'copy') {
      try { await navigator.clipboard.writeText(c.code); toast('Copied ' + c.code); } catch (err) { toast('Could not copy'); }
    } else if (b.dataset.act === 'edit') { editing = c.id; openForm(c); }
    else if (b.dataset.act === 'del') {
      if (b.dataset.sure) { c.gone = 1; c.u = Date.now(); save(); toast('Deleted'); }
      else { b.dataset.sure = 1; b.textContent = 'Tap again to delete'; } // no confirm(): the home-screen app ignores it
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  render();
  sync();
})();
