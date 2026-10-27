/* The Life hub menu, one copy for every page.

   It used to be a row of pills copied into each page. With nine pages, a phone
   showed three of them, the current page was off to the right, and nothing
   said there were more. Adding a page also meant editing nine files.

   Now each page has <div id="lhn"></div> and loads this file straight after it.
   The bar says where you are; Menu opens every page at once, grouped.
   Menu floats at the bottom right, where the thumb is; Close sits in the same spot. A spacer at the end of the page
   keeps it off the last line. A page with its own bottom bar lifts it (invoice: .issue).
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
.lhn-fab{position:fixed;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));z-index:59;
  font-family:inherit;font-size:15px;font-weight:700;line-height:1;color:var(--paper);background:var(--ink);border:0;border-radius:28px;
  padding:17px 22px;box-shadow:0 6px 20px rgba(0,0,0,.28);cursor:pointer}
.lhn-pad{height:calc(84px + env(safe-area-inset-bottom,0px))}
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
    : `<a href="${home}" aria-current="page" class="lhn-cur" style="background:none;padding-left:0">Life hub</a>`);
  const btn = document.createElement('button');
  btn.className = 'lhn-fab'; btn.textContent = 'Menu';
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'lhnOv');
  const pad = document.createElement('div'); pad.className = 'lhn-pad'; pad.setAttribute('aria-hidden', 'true');

  const ov = document.createElement('div');
  ov.className = 'lhn-ov'; ov.id = 'lhnOv'; ov.hidden = true;
  ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'All pages');
  ov.innerHTML = `<div class="lhn-in"><div class="lhn-top"><a href="${home}">Life hub</a>
    <button data-x>Close</button></div>` + groups.map(([g, list]) =>
      `<div class="lhn-g"><h4>${g}</h4><div class="lhn-l">${list.map(([p, n]) =>
        `<a href="${root}${p}"${page && page[0] === p ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</div></div>`).join('') +
    `</div><button class="lhn-fab" data-x>Close</button>`;
  document.body.append(btn, ov);
  /* The spacer belongs at the end of the page. This script runs straight after
     the bar, while the rest of the page is still being read, so appending it
     now put 84px of blank space under the bar on every page. */
  const atEnd = () => document.body.appendChild(pad);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', atEnd); else atEnd();

  const show = on => {
    ov.hidden = !on; btn.setAttribute('aria-expanded', on);
    document.body.classList.toggle('lhn-open', on);
    (on ? ov.querySelector('.lhn-fab') : btn).focus();
  };
  btn.addEventListener('click', () => show(true));
  ov.addEventListener('click', e => { if (e.target.closest('[data-x]')) show(false); });
  addEventListener('pageshow', () => { if (!ov.hidden) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) show(false); });
})();
