/* Life hub sign-in gate (22 Oct 2026). Load FIRST on every page, in <head>.
   - No session on this device: the page is hidden behind a "Sign in with Google" card.
   - Signed in: every request to the Apps Script backend gets the session added
     (s= on GET, "s" in POST bodies), so page code needs no change. The backend
     checks it (Auth.js) and treats the request as if it carried the old tokens.
   - Session: localStorage "lifehub-session", about 90 days, renewed on use.
   - Old tokens still work. A device that already holds the real sync token can
     skip sign-in with "Use the sync token" (fallback if Google sign-in fails). */
(function () {
  const CLIENT_ID = '438111775472-28ne7ha7ti9fci747q7c6qi7jsi3rqj4.apps.googleusercontent.com';
  const EXEC = 'https://script.google.com/macros/s/AKfycbw1gz9r2XR6JdtRvGySrBb4BfVKQ8wvruuey-dezUL65oNtJyjxkhjYQDCw6yEoDWd4/exec';
  const SKEY = 'lifehub-session', CFG = 'season-2027-sync', MKEY = 'lifehub-money-token';
  /* A family sign-in (Georgi's wife) reaches these pages only. The backend is what
     enforces it (Auth.js, authAllowed_); this only keeps her off pages that would
     show nothing but refusals. Sessions from before roles existed are Georgi's. */
  const FAMILY_PAGES = ['heat/', 'car/', 'meals/', 'holidays/', 'promo/'];
  const ROOT = ((document.currentScript && document.currentScript.src) || '').replace(/shared\/auth\.js.*$/, '');
  const role = () => (ses() || {}).role || 'owner';
  const ls = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
  };
  const ses = () => { try { return JSON.parse(ls.get(SKEY) || 'null'); } catch (e) { return null; } };
  const setSes = v => ls.set(SKEY, v ? JSON.stringify(v) : null);
  const isExec = u => /script\.google(usercontent)?\.com\/macros\//.test(String(u || ''));
  const cfg = () => { try { return JSON.parse(ls.get(CFG) || '{}') || {}; } catch (e) { return {}; } };
  const realTok = () => { const c = cfg(); return c.tok && c.tok !== 'session' ? c.tok : ''; };

  /* 1. add the session to backend calls */
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const s = ses();
    let url = typeof input === 'string' ? input : (input && input.url) || '';
    const mine = s && s.s && isExec(url);
    if (mine) {
      init = Object.assign({}, init || {});
      if (String(init.method || 'GET').toUpperCase() === 'POST' && typeof init.body === 'string') {
        try { const b = JSON.parse(init.body); if (!b.s) { b.s = s.s; init.body = JSON.stringify(b); } } catch (e) {}
      } else if (typeof input === 'string' && !/[?&]s=/.test(url)) {
        input = url + (url.includes('?') ? '&' : '?') + 's=' + encodeURIComponent(s.s);
      }
    }
    const r = await nativeFetch(input, init);
    if (mine) r.clone().json().then(j => { if (j && j.error === 'signin') { setSes(null); lock('Your session ended. Please sign in again.'); } }).catch(() => {});
    return r;
  };

  /* pages check for a URL and tokens before they call the backend: give them placeholders */
  function placeholders() {
    const c = cfg();
    if (!c.url || !c.tok) { c.url = c.url || EXEC; c.tok = c.tok || 'session'; ls.set(CFG, JSON.stringify(c)); }
    if (!ls.get(MKEY) && role() === 'owner') ls.set(MKEY, 'session');
  }

  /* 2. the gate */
  const css = document.createElement('style');
  css.textContent =
    'html.lh-locked body>*:not(#lh-gate){display:none!important}' +
    '#lh-gate{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:radial-gradient(900px 500px at 80% -10%,rgba(255,138,61,.16),transparent 60%),radial-gradient(800px 600px at -10% 110%,rgba(91,180,255,.16),transparent 60%),#18201E;' +
    'font-family:Manrope,system-ui,-apple-system,sans-serif;color:#E8ECE6}' +
    '#lh-gate .card{width:100%;max-width:360px;text-align:center;padding:30px 24px;border-radius:26px;background:#222C29;box-shadow:0 20px 50px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.05)}' +
    '#lh-gate .k{font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;color:#7C8A84;font-weight:700}' +
    '#lh-gate h1{margin:6px 0 4px;font-size:34px;font-weight:800;letter-spacing:-.03em}' +
    '#lh-gate p{margin:0 0 20px;color:#A7B4AD;font-size:14px}' +
    '#lh-gate .gbtn{display:flex;justify-content:center;min-height:44px;color-scheme:light}' +
    '#lh-gate .gbtn iframe{color-scheme:light;border-radius:22px}' +
    '#lh-gate .msg{min-height:20px;margin-top:14px;font-size:13px;color:#E07A63}' +
    '#lh-gate .alt{margin-top:14px;background:none;border:0;color:#7C8A84;font:inherit;font-size:12.5px;text-decoration:underline;cursor:pointer}';
  document.head.appendChild(css);

  function lock(msg) {
    document.documentElement.classList.add('lh-locked');
    const show = () => {
      let g = document.getElementById('lh-gate');
      if (!g) {
        g = document.createElement('div'); g.id = 'lh-gate';
        g.innerHTML = '<div class="card"><div class="k">Private</div><h1>Life hub</h1><p>Sign in with your Google account to continue.</p>' +
          '<div class="gbtn" id="lh-gbtn"></div><div class="msg" id="lh-msg"></div>' +
          (realTok() ? '<button class="alt" id="lh-alt">Use the sync token on this device</button>' : '') + '</div>';
        document.body.appendChild(g);
        const alt = document.getElementById('lh-alt');
        if (alt) alt.onclick = () => { setSes({ legacy: true, at: Date.now() }); location.reload(); };
        loadGis();
      }
      if (msg) document.getElementById('lh-msg').textContent = msg;
    };
    document.body ? show() : document.addEventListener('DOMContentLoaded', show);
  }

  function loadGis() {
    if (CLIENT_ID === 'PENDING') { document.getElementById('lh-msg').textContent = 'Sign-in is being set up.'; return; }
    const sc = document.createElement('script');
    sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
    sc.onload = () => {
      google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential, auto_select: true, itp_support: true, use_fedcm_for_prompt: true });
      google.accounts.id.renderButton(document.getElementById('lh-gbtn'), { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', width: 260 });
      google.accounts.id.prompt();
    };
    sc.onerror = () => { document.getElementById('lh-msg').textContent = 'Could not load Google sign-in. Check the connection.'; };
    document.head.appendChild(sc);
  }

  function device() {
    const u = navigator.userAgent;
    const os = /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac OS X/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Device';
    const br = /CriOS|Chrome/.test(u) ? 'Chrome' : /FxiOS|Firefox/.test(u) ? 'Firefox' : /Safari/.test(u) ? 'Safari' : 'Browser';
    return os + ' · ' + br;
  }

  async function onCredential(resp) {
    const m = document.getElementById('lh-msg'); m.textContent = 'Checking…';
    try {
      const r = await (await nativeFetch(cfg().url || EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'auth', credential: resp.credential, device: device() }) })).json();
      if (!r.ok) { m.textContent = r.error || 'Sign-in failed.'; return; }
      setSes({ s: r.s, email: r.email, name: r.name, role: r.role || 'owner', at: Date.now() });
      placeholders();
      location.reload();
    } catch (e) { m.textContent = 'Offline. Try again.'; }
  }

  /* 3. account helpers (home page shows the device list) */
  const post = body => nativeFetch(cfg().url || EXEC, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(Object.assign({ s: (ses() || {}).s }, body)) }).then(r => r.json());
  window.LifeHubAuth = {
    session: ses,
    role: role,
    FAMILY_PAGES: FAMILY_PAGES,
    sessions: () => post({ action: 'sessions' }),
    revoke: id => post({ action: 'revoke', id: id }),
    signOut: async () => { try { await post({ action: 'signout' }); } catch (e) {} setSes(null); location.reload(); }
  };

  const s = ses();
  if (!s || (!s.s && !s.legacy)) lock();
  else if (s.s) {
    placeholders();
    if (role() === 'family' && ROOT) {
      const here = location.href.split(/[?#]/)[0].replace(/index\.html$/, '');
      const path = here.startsWith(ROOT) ? here.slice(ROOT.length) : '';
      if (FAMILY_PAGES.indexOf(path) < 0) location.replace(ROOT + FAMILY_PAGES[0]);
    }
  }
})();
