/* The Life hub menu, one copy for every page.

   It used to be a row of pills copied into each page. With nine pages, a phone
   showed three of them, the current page was off to the right, and nothing
   said there were more. Adding a page also meant editing nine files.

   Now each page has <div id="lhn"></div> and loads this file straight after it.
   The bar says where you are; Menu opens every page at once, grouped.
   Menu floats at the bottom right, where the thumb is; Close sits in the same spot. A spacer at the end of the page
   keeps it off the last line. A page with its own bottom bar lifts it (invoice: .issue).
   The open menu is thumb friendly too (27 Oct 2026): the pages sit at the bottom of the screen, not the top,
   Life hub (home) is a button at the bottom left, Close at the bottom right, and nothing needs the top.
   On a wide screen a full-screen sheet with the pages pushed down looked odd, so there the menu pops out of
   the Menu button instead: a panel that grows from its corner, over a dimmed page. A click outside closes it.
   To add a page: one line in GROUPS. */
(function () {
  const GROUPS = [
    ['Body', [['training/', 'Training'], ['meals/', 'Meals']]],
    ['Money', [['money/', 'Money'], ['business/', 'Business'], ['invoice/', 'New invoice']]],
    ['Home', [['heat/', 'Heating'], ['car/', 'Car'], ['holidays/', 'Holidays'], ['time/', 'Time']]],
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
.lhn-ov{position:fixed;inset:0;z-index:60;background:var(--paper);overflow-y:auto;display:flex;flex-direction:column;
  padding:calc(env(safe-area-inset-top,0px) + 12px) 16px calc(env(safe-area-inset-bottom,0px) + 92px)}
.lhn-ov[hidden]{display:none}
/* margin-top:auto pushes the pages down to the thumb; a long list still scrolls. */
.lhn-in{width:100%;max-width:520px;margin:auto auto 0}
.lhn-home{position:fixed;left:calc(16px + env(safe-area-inset-left,0px));bottom:calc(18px + env(safe-area-inset-bottom,0px));
  font-family:inherit;font-size:15px;font-weight:700;line-height:1;color:var(--ink);background:var(--card);text-decoration:none;
  border-radius:28px;padding:17px 22px;box-shadow:var(--shadow)}
.lhn-home[aria-current="page"]{background:var(--sand,#E2D3BC);color:#1E2522}
.lhn-g{margin-top:20px}
.lhn-g h4{margin:0 0 8px;font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint)}
.lhn-l{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.lhn-l a{display:flex;align-items:center;min-height:56px;padding:12px 14px;border-radius:16px;background:var(--card);color:var(--ink);
  text-decoration:none;font-weight:700;font-size:16px;box-shadow:var(--shadow)}
.lhn-l a[aria-current="page"]{background:var(--sand,#E2D3BC);color:#1E2522}
body.lhn-open{overflow:hidden}
@media(min-width:700px){
  .lhn-ov{display:block;padding:0;background:rgba(0,0,0,.28)}
  .lhn-in{position:fixed;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));
    width:380px;max-height:calc(100vh - 120px);overflow-y:auto;margin:0;padding:4px 14px 14px;border-radius:22px;
    background:var(--paper);box-shadow:0 18px 50px rgba(0,0,0,.35);transform-origin:bottom right;animation:lhnPop .16s ease-out}
  .lhn-g{margin-top:14px}
  .lhn-l a{min-height:48px}
  .lhn-home{position:static;display:block;margin-top:14px;text-align:center;box-shadow:none}
}
@keyframes lhnPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@media(prefers-reduced-motion:reduce){.lhn-in{animation:none}}`;
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
  ov.innerHTML = `<div class="lhn-in">` + groups.map(([g, list]) =>
      `<div class="lhn-g"><h4>${g}</h4><div class="lhn-l">${list.map(([p, n]) =>
        `<a href="${root}${p}"${page && page[0] === p ? ' aria-current="page"' : ''}>${n}</a>`).join('')}</div></div>`).join('') +
    `<a class="lhn-home" href="${home}"${page ? '' : ' aria-current="page"'}>Life hub</a></div>
    <button class="lhn-fab" data-x>Close</button>`;
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
  // Close, or a click on the dimmed page around the menu.
  ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) show(false); });
  addEventListener('pageshow', () => { if (!ov.hidden) show(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ov.hidden) show(false); });
})();
