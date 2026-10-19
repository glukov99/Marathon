/* Setting a category by hand, from the Money page or the Business page.

   The sheet already had the idea: column K belongs to the rules, column M to
   Georgi, and M always wins. This writes M, so a choice made here survives
   every re-run of the rules, and clearing it hands the row back to them.

     CatPick.open({ cats, current, title, note, onPick })
   onPick(cat) gets '' when he clears it. The caller does the saving, because
   only the caller knows which row it is.
*/
(function (root) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let el = null, pick = null;

  function close() { if (el) { el.remove(); el = null; pick = null; } }

  function open(o) {
    close();
    pick = o.onPick;
    const cats = (o.cats || []).slice().sort();
    el = document.createElement('div');
    el.className = 'cpk';
    el.innerHTML = `<div class="cpkb"></div><div class="cpkc">
      <div class="cpkh"><b>${esc(o.title || 'Category')}</b>
        <button data-cp="x" aria-label="Close">×</button></div>
      ${o.note ? `<div class="cpkn">${esc(o.note)}</div>` : ''}
      <div class="cpkl">${cats.map(c =>
        `<button data-cp="set" data-c="${esc(c)}"${c === o.current ? ' class="on"' : ''}>${esc(c)}</button>`).join('')}</div>
      <div class="cpkf">
        <input id="cpkNew" placeholder="A new category" autocomplete="off">
        <button data-cp="new">Add</button>
      </div>
      <button class="cpkr" data-cp="clear">Let the rules decide</button>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-cp]');
      if (!b) { if (e.target.classList.contains('cpkb')) close(); return; }
      const a = b.dataset.cp;
      if (a === 'x') return close();
      if (a === 'set') { const f = pick; close(); f(b.dataset.c); return; }
      if (a === 'clear') { const f = pick; close(); f(''); return; }
      if (a === 'new') {
        const v = (el.querySelector('#cpkNew').value || '').trim();
        if (!v) return;
        const f = pick; close(); f(v);
      }
    });
  }

  root.CatPick = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
