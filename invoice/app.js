/* New invoice (23 Oct 2026). The backend (lifehub-script/Invoice.js) does all the
   real work: numbering, the PDF, filing it in Drive under MM.YYYY, the register.
   This page collects the fields, shows the backend's own preview, and issues. */
(function () {
  const $ = id => document.getElementById(id);
  const TKEY = 'lifehub-money-token';
  const apiUrl = () => ((window.HubSync && HubSync.cfg()) || {}).url || '';
  const token = () => { try { return localStorage.getItem(TKEY) || ''; } catch (e) { return ''; } };
  const api = q => fetch(apiUrl() + '?action=money&mt=' + encodeURIComponent(token()) + q).then(r => r.json());
  const eur = x => x == null ? '–' : '€' + Number(x).toFixed(2);
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Sofia' }).format(new Date());
  const say = m => { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(say.h); say.h = setTimeout(() => t.classList.remove('show'), 3600); };

  let next = null, lastDate = '', clients = [], mode = 'gross', busy = false, okPreview = false;
  const DRAFT = 'lifehub-invoice-draft';

  /* ---------- lines ---------- */
  function lineEl(l) {
    const d = document.createElement('div'); d.className = 'line';
    d.innerHTML = '<input class="d" list="items" placeholder="фотографски услуги">' +
      '<input class="u" value="бр.">' + '<input class="q" inputmode="decimal" value="1">' +
      '<input class="p" inputmode="decimal" placeholder="0.00">' + '<input class="dc" inputmode="decimal" placeholder="0">' + '<button class="x" type="button" aria-label="Remove line">×</button>';
    if (l) { d.querySelector('.d').value = l.name || ''; d.querySelector('.u').value = l.unit || 'бр.'; d.querySelector('.q').value = l.qty || 1; d.querySelector('.p').value = l.price != null ? l.price : ''; d.querySelector('.dc').value = l.disc || ''; }
    d.querySelector('.x').onclick = () => { if ($('lines').children.length > 1) { d.remove(); changed(); } };
    return d;
  }
  $('add').onclick = () => { $('lines').appendChild(lineEl()); $('lines').lastChild.querySelector('.d').focus(); };

  /* ---------- the data the backend gets ---------- */
  function data() {
    const v = id => $(id).value.trim();
    return {
      client: { name: v('c-name'), eik: v('c-eik'), vat: v('c-vat'), city: v('c-city'), address: v('c-address'), mol: v('c-mol') },
      recipient: v('recipient'),
      lines: [...$('lines').children].map(d => ({ name: d.querySelector('.d').value, unit: d.querySelector('.u').value, qty: d.querySelector('.q').value, price: d.querySelector('.p').value, disc: d.querySelector('.dc').value }))
        .filter(l => l.name.trim() || String(l.price).trim()),
      priceMode: mode, vatRate: Number($('vat').value), basis: v('basis'),
      issued: $('issued').value, event: $('event').value || $('issued').value, place: v('place'), pay: $('pay').value,
      bank: $('bank').value, due: $('due').value, terms: v('terms'), maker: v('maker'), cash: $('cash').checked, note: v('note')
    };
  }
  function keepDraft() { try { localStorage.setItem(DRAFT, JSON.stringify(data())); } catch (e) {} }
  function loadDraft() {
    let d = null; try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) {}
    if (d && d.client) {
      ['name', 'eik', 'vat', 'city', 'address', 'mol'].forEach(k => $('c-' + k).value = d.client[k] || '');
      $('recipient').value = d.recipient || ''; $('basis').value = d.basis || ''; $('place').value = d.place || 'Пловдив';
      $('pay').value = d.pay || 'Банков път'; $('terms').value = d.terms || ''; $('note').value = d.note || ''; $('cash').checked = !!d.cash; if (d.maker) $('maker').value = d.maker; if (d.bank) $('bank').dataset.want = d.bank; $('vat').value = String(d.vatRate == null ? 20 : d.vatRate); setMode(d.priceMode || 'gross');
      (d.lines && d.lines.length ? d.lines : [{}]).forEach(l => $('lines').appendChild(lineEl(l)));
    } else $('lines').appendChild(lineEl());
    $('issued').value = today(); $('event').value = today();
  }

  /* ---------- preview (debounced) ---------- */
  function scale() { const w = $('pv').clientWidth, k = w / 794; $('frame').style.transform = 'scale(' + k + ')'; $('pv').style.height = Math.round(1123 * k) + 'px'; }
  window.addEventListener('resize', scale);
  let t = null, seq = 0;
  function changed() { keepDraft(); okPreview = false; $('issue').disabled = true; clearTimeout(t); t = setTimeout(preview, 500); }
  async function preview() {
    const d = data(), my = ++seq;
    if (!d.client.name || !d.lines.length) { $('err').textContent = 'Add the client and at least one line to see the invoice.'; return; }
    d.showNo = next ? Number(next) : 0;
    try {
      const r = await api('&inv=preview&d=' + encodeURIComponent(JSON.stringify(d)));
      if (my !== seq) return;
      if (!r.ok) { $('err').textContent = r.error || 'Could not build the preview'; return; }
      $('err').textContent = '';
      $('t-base').textContent = eur(r.base); $('t-vat').textContent = eur(r.vat); $('t-total').textContent = eur(r.total);
      $('words').textContent = 'Словом: ' + r.words; $('iss-total').textContent = eur(r.total);
      $('frame').srcdoc = r.html; scale();
      if (lastDate && d.issued < lastDate) { $('err').textContent = 'The issue date is before the last invoice (' + lastDate + '). Invoices must stay in date order.'; return; }
      okPreview = true; $('issue').disabled = busy;
      $('iss-sub').textContent = '№ ' + next + ' · ' + d.client.name;
    } catch (e) { if (my === seq) $('err').textContent = 'Offline. Try again.'; }
  }
  document.querySelector('main').addEventListener('input', e => { if (e.target.closest('#result')) return; changed(); });
  const showBank = () => $('bankw').classList.toggle('hidden', $('pay').value !== 'Банков път');
  const showBasis = () => { $('basisreq').textContent = $('vat').value === '0' ? '(required for 0 %)' : '(only for 0 %)'; };
  document.querySelector('main').addEventListener('change', e => { showBank(); showBasis(); if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') changed(); });

  function setMode(m) { mode = m; document.querySelectorAll('#pmode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m))); $('ph').textContent = m === 'gross' ? 'Price incl. VAT' : 'Price excl. VAT'; }
  $('pmode').onclick = e => { const b = e.target.closest('button[data-v]'); if (!b) return; setMode(b.dataset.v); changed(); };

  /* ---------- clients ---------- */
  function fillClient(c) {
    $('c-name').value = c.name || ''; $('c-eik').value = c.eik || ''; $('c-vat').value = c.vat || '';
    $('c-city').value = c.city || ''; $('c-address').value = c.address || ''; $('c-mol').value = c.mol || '';
  }
  $('c-name').addEventListener('change', () => {
    const c = clients.find(x => x.name === $('c-name').value.trim());
    if (c) { fillClient(c); changed(); if (/^\d{9}$/.test(c.eik || '') && !c.address) lookup(true); }
  });
  $('vies').onclick = () => lookup(false);
  async function lookup(quiet) {
    const eik = $('c-eik').value.trim(); if (!eik) return say('Type the ЕИК first');
    $('vies').disabled = true;
    try {
      const r = await api('&inv=vies&eik=' + encodeURIComponent(eik));
      if (!r.ok) { if (!quiet) say(r.error || 'Lookup failed'); }
      else if (!r.valid) { $('c-vat').value = ''; say('Not VAT registered (not in the EU VAT register): ДДС No left empty'); changed(); }
      else {
        if (!$('c-name').value.trim()) $('c-name').value = r.name;
        $('c-vat').value = r.vat; if (r.address) $('c-address').value = r.address; if (r.city && !$('c-city').value.trim()) $('c-city').value = r.city;
        say((quiet ? 'Address filled from the register' : 'Found: ' + r.name) + '. Check it; the register is often in capitals.'); changed();
      }
    } catch (e) { if (!quiet) say('Offline'); } finally { $('vies').disabled = false; }
  }

  /* ---------- issue ---------- */
  $('issue').onclick = async () => {
    if (!okPreview || busy) return;
    const d = data();
    if (!confirm('Issue invoice № ' + next + ' to ' + d.client.name + ' for ' + $('t-total').textContent + '?\n\nThe number is used for good, and the PDF goes to Drive (Продажби / ' + d.issued.slice(5, 7) + '.' + d.issued.slice(0, 4) + ').')) return;
    busy = true; $('issue').disabled = true; $('issue').textContent = 'Issuing…';
    try {
      d.expectNo = Number(next);
      const r = await api('&inv=issue&d=' + encodeURIComponent(JSON.stringify(d)));
      if (!r.ok) { $('err').textContent = r.error || 'Not issued'; await load(); return; }
      $('result').classList.remove('hidden');
      $('result').innerHTML = '<h3>Issued: № ' + r.no + '</h3><div class="sub">' + eur(r.total) + ' · saved to Drive → Продажби / ' + r.folder + '</div>' +
        '<div class="opts"><a class="btn" href="' + r.url + '" target="_blank" rel="noopener">Open PDF in Drive</a>' +
        '<button class="btn ghost" id="dl" data-no="' + r.no + '">Download PDF</button><button class="btn ghost" id="again">New invoice</button></div>';
      $('dl').onclick = () => download(r.no);
      $('again').onclick = () => { $('result').classList.add('hidden'); [...$('lines').children].forEach((x, i) => i ? x.remove() : x.querySelectorAll('input').forEach(inp => { if (!inp.classList.contains('u') && !inp.classList.contains('q')) inp.value = ''; })); fillClient({}); ['recipient', 'due', 'terms', 'note'].forEach(id => $(id).value = ''); $('cash').checked = false; keepDraft(); window.scrollTo(0, 0); };
      try { localStorage.removeItem(DRAFT); } catch (e) {}
      $('result').scrollIntoView({ behavior: 'smooth', block: 'center' });
      say('Invoice ' + r.no + ' issued');
      await load();
    } catch (e) { $('err').textContent = 'No answer. Check "Issued here" before trying again, so the same invoice is not issued twice.'; await load(); }
    finally { busy = false; $('issue').textContent = 'Issue invoice'; }
  };
  async function download(no) {
    try {
      const r = await api('&inv=pdf&no=' + Number(no)); if (!r.ok) return say(r.error || 'Not found');
      const bin = atob(r.b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([u8], { type: 'application/pdf' })); a.download = r.name; a.click();
    } catch (e) { say('Offline'); }
  }

  /* ---------- start ---------- */
  async function load() {
    try {
      const r = await api('&inv=next');
      if (!r.ok) { $('state').textContent = r.error === 'unauthorised' ? 'Sign in to use this page.' : (r.error || 'Could not load'); return; }
      next = r.next; lastDate = r.lastDate || ''; clients = r.clients || [];
      if (!$('bank').options.length) {
        $('bank').innerHTML = (r.banks || []).map(b => '<option value="' + b.key + '">' + b.label + ' · ' + b.iban + '</option>').join('');
        if ($('bank').dataset.want) $('bank').value = $('bank').dataset.want;
      }
      if (!$('maker').value) $('maker').value = r.maker || '';
      $('no').textContent = '№ ' + next;
      $('state').textContent = 'Next number ' + next + (lastDate ? ' · last invoice ' + lastDate.split('-').reverse().join('.') : '');
      $('clients').innerHTML = clients.map(c => '<option value="' + String(c.name).replace(/"/g, '&quot;') + '">' + (c.eik || '') + '</option>').join('');
      $('issued-list').innerHTML = (r.issued || []).length ? r.issued.map(x => '<li><span class="n">№ ' + x.no + '</span><span class="c">' + x.client + ' · ' + String(x.issued).split('-').reverse().join('.') + '</span><span>' + eur(x.total) + '</span><a href="' + x.url + '" target="_blank" rel="noopener">PDF</a></li>').join('')
        : '<li class="sub">None yet. Invoices 1–76 were issued in InvoicePro (see Business).</li>';
      preview();
    } catch (e) { $('state').textContent = 'Offline. Reload to try again.'; }
  }
  setMode(mode); loadDraft(); showBank(); showBasis(); scale(); load();
})();
