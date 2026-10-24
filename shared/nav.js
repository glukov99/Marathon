/* The Life hub menu, one copy for every page.

   It used to be a row of pills copied into each page. With nine pages, a phone
   showed three of them, the current page was off to the right, and nothing
   said there were more. Adding a page also meant editing nine files.

   Now each page has <div id="lhn"></div> and loads this file straight after it.
   The bar says where you are; Menu opens every page at once, grouped.
   To add a page: one line in GROUPS. */
(function () {
  const GROUPS = [
    ['Body', [['training/', 'Training'], ['meals/', 'Meals']]],
    ['Money', [['money/', 'Money'], ['business/', 'Business'], ['invoice/', 'New invoice']]],
    ['Home', [['heat/', 'Heating'], ['car/', 'Car'], ['holidays/', 'Holidays']]],
    ['Mind', [['jar/', 'Ideas jar'], ['robotics/', 'Robotics']]],
  ];
  // A family sign-in sees only her pages, and her "home" is the first of them.
  const fam = window.LifeHubAuth && LifeHubAuth.role() === 'family';
  const groups = fam ? GROUPS.map(([g, l]) => [g, l.filter(p => LifeHubAuth.FAMILY_PAGES.includes(p[0]))]).filter(g => g[1].length) : GROUPS;
  const me = document.currentScript;
  const root = me ? me.src.replace(/shared\/nav\.js.*$/, '') : '/';
  const here = location.href.split(/[?#]/)[0].replace(/index\.html$/, '');
  const path = here.startsWith(root) ? here.slice(root.length) : '';
  const page = groups.flatMap(g => g[1]).find(p => p[0] === path);
  const home = fam ? root + LifeHubAuth.FAMILY_PAGES[0] : root;
  const el = document.getElementById('lhn');
  if (!el) return;

  const css = document.createElement('style');
  css.textContent = `
.lhn{display:flex;align-items:center;gap:8px;max-width:820px;margin:0 auto;padding:12px 16px 0}
.lhn a,.lhn button{font-family:inherit;font-size:13px;font-weight:600;line-height:1;color:var(--soft);text-decoration:none;
  background:rgba(127,127,127,.12);border:0;border-radius:16px;padding:8px 13px;cursor:pointer}
.lhn .lhn-cur{font-size:13px;font-weight:700;color:var(--ink)}
.lhn .lhn-menu{margin-left:auto;color:var(--ink)}
.lhn-ov{position:fixed;inset:0;z-index:60;background:var(--paper);overflow-y:auto;
  padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 24px)}
.lhn-ov[hidden]{display:none}
.lhn-in{max-width:520px;margin:0 auto}
.lhn-top{display:flex;align-items:center;justify-content:space-between}
.lhn-top a{font-weight:800;font-size:22px;color:var(--ink);text-decoration:none}
.lhn-top button{font-family:inherit;font-size:14px;font-weight:600;color:var(--ink);background:rgba(127,127,127,.12);border:0;border-radius:16px;padding:8px 14px;cursor:pointer}
.lhn-g{margin-top:20px}
.lhn-g h4{margin:0 0 8px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.lhn-l{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lhn-l a{display:block;padding:16px 14px;border-radius:16px;background:var(--card);color:var(--ink);
  text-decoration:none;font-weight:700;font-size:16px;box-shadow:var(--shadow)}
.lhn-l a[aria-current="page"]{background:var(--sand,#E2D3BC);color:#1E2522}
body.lhn-open{overflow:hidden}`;
  document.head.appendChild(css);

  el.className = 'lhn';
  el.setAttribute('role', 'navigation');
  el.setAttribute('aria-label', 'Life hub');
  el.innerHTML = (page
    ? (fam ? '' : `<a href="${home}">Life hub</a>`) + `<span class="lhn-cur">${page[1]}</span>`
    : `<a href="${home}" aria-current="page" class="lhn-cur" style="background:none;padding-left:0">Life hub</a>`) +
    `<button class="lhn-menu" aria-expanded="false" aria-controls="lhnOv">Menu</button>`;

  const ov = document.createElement('div');
  ov.className = 'lhn-ov'; ov.id = 'lhnOv'; ov.hidden = true;
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'All pages');
  ov.innerHTML = `<div class="lhn-in"><div class="lhn-top"><a href="${home}">Life hub</a>
    <button data-x>Close</button></div>` + groups.map(([g, list]) =>
      `<div class="lhn-g"><h4>${g}</h4><div class="lhn-l">${list.map(([p, n]) =>
        `<a href="${root}${p}"${page && page[0] === p ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</div></div>`).join('') +
    `</div>`;
  document.body.appendChild(ov);

  const btn = el.querySelector('.lhn-menu');
  const show = on => {
    ov.hidden = !on; btn.setAttribute('aria-expanded', on);
    document.body.classList.toggle('lhn-open', on);
    (on ? ov.querySelector('[data-x]') : btn).focus();
  };
  btn.addEventListener('click', () => show(true));
  ov.addEventListener('click', e => { if (e.target.closest('[data-x]')) show(false); });
  addEventListener('pageshow', () => { if (!ov.hidden) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) show(false); });
})();
