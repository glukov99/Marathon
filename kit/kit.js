/* Life Hub Kit: shared by every page of the kit. Holds no one's data.

   - Setup: the person opens the link they were sent, which ends in
     #setup=<their backend URL>. That URL is kept in this browser.
   - Sign-in: Google sign-in; their backend accepts only its owner.
   - Data: each list is kept in this browser first and synced with their backend,
     merged item by item (newer edit wins), so two devices never undo each other
     and nothing is lost offline.

   Same origin as Georgi's own hub, so every key here starts with "kit-".

     Kit.ready.then(start)         page code runs once signed in
     Kit.list(coll) / Kit.get(coll, id)
     Kit.put(coll, item) / Kit.del(coll, id)
     Kit.pull(coll).then(...)      fetch the latest from the backend
     Kit.on(coll, fn)              called after a sync changed that list */
(function () {
  const CLIENT_ID = '438111775472-28ne7ha7ti9fci747q7c6qi7jsi3rqj4.apps.googleusercontent.com';
  const ROOT = ((document.currentScript && document.currentScript.src) || '').replace(/kit\.js.*$/, '');
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} },
  };
  const json = (k, d) => { try { return JSON.parse(ls.get(k)) || d; } catch (e) { return d; } };

  const m = location.hash.match(/setup=([^&]+)/);
  if (m) {
    const u = decodeURIComponent(m[1]);
    if (/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) { ls.set('kit-backend', u); ls.set('kit-session', null); }
    history.replaceState(null, '', location.pathname);
  }
  const backend = () => ls.get('kit-backend') || '';
  const ses = () => json('kit-session', null);

  async function post(body) {
    const r = await fetch(backend(), { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    return r.json();
  }
  async function api(action, body) {
    const j = await post(Object.assign({ action, s: (ses() || {}).s }, body || {}));
    if (j.error === 'signin') { ls.set('kit-session', null); gate('Please sign in again.'); throw new Error('signin'); }
    if (j.error) throw new Error(j.error);
    return j;
  }

  /* ---------- the gate ---------- */
  const css = document.createElement('style');
  css.textContent = 'html.kit-locked body>*:not(#kit-gate){display:none!important}' +
    '#kit-gate{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--paper)}' +
    '#kit-gate .card{width:100%;max-width:360px;text-align:center;padding:30px 24px;border-radius:26px;background:var(--card);box-shadow:var(--shadow)}' +
    '#kit-gate h1{margin:4px 0 6px;font-size:30px}#kit-gate p{color:var(--soft);font-size:14px;margin:0 0 18px}' +
    '#kit-gate .gbtn{display:flex;justify-content:center;min-height:44px;color-scheme:light}#kit-gate .msg{min-height:20px;margin-top:12px;font-size:13px;color:var(--warn)}';
  document.head.appendChild(css);
  let unlock;
  const ready = new Promise(r => { unlock = r; });

  function gate(msg) {
    document.documentElement.classList.add('kit-locked');
    const show = () => {
      let g = document.getElementById('kit-gate');
      if (!g) {
        g = document.createElement('div'); g.id = 'kit-gate';
        g.innerHTML = backend()
          ? '<div class="card"><h1>Your hub</h1><p>Sign in with your Google account to continue.</p><div class="gbtn" id="kit-gbtn"></div><div class="msg" id="kit-msg"></div></div>'
          : '<div class="card"><h1>Your hub</h1><p>This device is not set up yet. Open the setup link you were sent, on this device.</p></div>';
        document.body.appendChild(g);
        if (backend()) loadGis();
      }
      if (msg && document.getElementById('kit-msg')) document.getElementById('kit-msg').textContent = msg;
    };
    document.body ? show() : document.addEventListener('DOMContentLoaded', show);
  }
  function loadGis() {
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => {
      google.accounts.id.initialize({ client_id: CLIENT_ID, callback: signedIn, auto_select: true, itp_support: true, use_fedcm_for_prompt: true });
      google.accounts.id.renderButton(document.getElementById('kit-gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', width: 260 });
      google.accounts.id.prompt();
    };
    document.head.appendChild(sc);
  }
  async function signedIn(resp) {
    const msg = document.getElementById('kit-msg'), note = t => { msg.textContent = t; ls.set('kit-lastmsg', new Date().toISOString() + ' ' + t); };
    note('Checking…');
    try {
      const r = await post({ action: 'auth', credential: resp.credential, device: navigator.platform || '' });
      if (!r.ok) { note(r.error || 'Sign-in failed.'); return; }
      ls.set('kit-session', JSON.stringify({ s: r.s, email: r.email, name: r.name }));
      location.reload();
    } catch (e) { note('Could not reach your hub: ' + (e.message || e)); }
  }

  /* ---------- lists: local first, merged by id ---------- */
  const key = c => 'kit-' + c;
  const all = c => json(key(c), []);
  function merge(a, b) {
    const by = {};
    a.concat(b).forEach(x => { if (x && x.id && (!by[x.id] || x.u > by[x.id].u)) by[x.id] = x; });
    return Object.values(by);
  }
  const subs = {}, timers = {};
  const list = c => all(c).filter(x => !x.del);
  const get = (c, id) => list(c).find(x => x.id === id) || null;
  function put(c, item) {
    const x = Object.assign({}, item, { u: Date.now() });
    ls.set(key(c), JSON.stringify(merge(all(c), [x])));
    clearTimeout(timers[c]); timers[c] = setTimeout(() => pull(c), 800);
    return x;
  }
  const del = (c, id) => put(c, { id, del: true });
  async function pull(c) {
    try {
      const j = await api('sync', { coll: c, items: all(c) });
      const before = ls.get(key(c)), next = JSON.stringify(merge(all(c), j.items));
      ls.set(key(c), next);
      if (next !== before) (subs[c] || []).forEach(f => f());
      say('');
    } catch (e) { if (e.message !== 'signin') say('Offline: saved on this device, it syncs later.'); }
    return list(c);
  }
  const on = (c, f) => (subs[c] = subs[c] || []).push(f);
  function say(t) { const el = document.getElementById('kit-status'); if (el) el.textContent = t; }

  /* ---------- the bar ---------- */
  function bar() {
    const el = document.getElementById('kit-bar'); if (!el) return;
    const here = location.pathname.replace(/index\.html$/, '');
    const link = (p, n) => `<a href="${ROOT}${p}"${here.endsWith('/kit/' + p) ? ' aria-current="page"' : ''}>${n}</a>`;
    el.innerHTML = link('', 'Home') + link('meals/', 'Meals');
  }

  const s = ses();
  if (!backend() || !s) gate();
  else { document.addEventListener('DOMContentLoaded', bar); unlock(s); }

  window.Kit = { ready, api, list, get, put, del, pull, on, merge, signOut: async () => {
    try { await api('signout'); } catch (e) {} ls.set('kit-session', null); location.reload(); } };
})();
