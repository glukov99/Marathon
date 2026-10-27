/* Ideas jar. Ideas that come during rest go here, so they can wait.

   Each idea is one sentence and an area. It is saved on this device first,
   then to Drive through HubSync, under its own key.

   HubSync's own sync() is "newest copy wins", which is fine for a meal plan
   but not here: an idea added on the phone and another on the laptop before
   either synced would lose one of them. Losing an idea is the one thing this
   page must never do, so ideas merge by id instead, and the newer edit of the
   same idea wins. Nothing is ever deleted: Discard is a status. That is also
   why the merge needs no tombstones.

   Run: node jar/check.js */
const KEY = 'lifehub-jar';
const AREAS = ['QA work', 'Life', 'Photography', 'Side projects'];
const STATES = [['new', 'In the jar'], ['review', 'In review'], ['done', 'Finished']];
const WHEN = [['all', 'Any time'], ['1', 'Today'], ['7', '7 days'], ['30', '30 days']];

function mergeIdeas(a, b) {
  const by = {};
  (a || []).concat(b || []).forEach(x => {
    if (x && x.id && (!by[x.id] || (x.u || 0) > (by[x.id].u || 0))) by[x.id] = x;
  });
  return Object.values(by).sort((x, y) => y.at - x.at);
}
const sig = l => (l || []).map(x => x.id + ':' + (x.u || 0)).sort().join();

// 'done' covers both ways an idea can finish: acted on, or discarded.
function shown(ideas, f, now) {
  const since = f.when === 'all' ? 0 : startOfDay(now) - (+f.when - 1) * 864e5;
  const l = ideas.filter(x => (f.tab === 'done' ? x.s === 'done' || x.s === 'dropped' : x.s === f.tab) &&
    (f.area === 'all' || x.area === f.area) && x.at >= since);
  return f.old ? l.slice().reverse() : l;
}
function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return +d; }

if (typeof module !== 'undefined') module.exports = { mergeIdeas, sig, shown };

if (typeof document !== 'undefined') (function () {
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const st = load();
  let ideas = st.ideas || [];
  let pick = st.last || AREAS[0];
  const f = { tab: 'new', area: 'all', when: 'all', old: false };
  let editing = null;

  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ ideas, last: pick })); } catch (e) {} };
  const say = t => { $('#store').textContent = t; };
  const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1600); };
  const areas = () => AREAS.concat(ideas.map(x => x.area).filter(a => a && !AREAS.includes(a)))
    .filter((a, i, l) => l.indexOf(a) === i);

  // Pull, merge, and push only when this device holds something Drive lacks.
  async function sync() {
    if (!window.HubSync || !HubSync.on()) { say('Saved on this device only. Set up sync on the home page to see ideas on every device.'); return; }
    const r = await HubSync.pull(KEY);
    if (!r || r.error) { say('Offline: saved on this device, it syncs next time.'); return; }
    const remote = (r.data && r.data.ideas) || [];
    const merged = mergeIdeas(ideas, remote);
    if (sig(merged) !== sig(ideas)) { ideas = merged; keep(); render(); }
    if (sig(merged) !== sig(remote)) HubSync.push(KEY, { ideas: merged });
    else say('Synced across devices');
  }
  if (window.HubSync) HubSync.onStatus(t => say(t === 'Synced' ? 'Synced across devices' : t));

  function save() { keep(); render(); sync(); }
  function set(id, s) {
    const x = ideas.find(i => i.id === id); if (!x) return;
    x.s = s; x.u = Date.now(); if (s === 'done' || s === 'dropped') x.end = x.u; else delete x.end;
    save();
  }

  const when = t => new Date(t).toLocaleString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = t => {
    const d = startOfDay(t), n = startOfDay(Date.now());
    if (d === n) return 'Today';
    if (d === n - 864e5) return 'Yesterday';
    return new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  const chips = (id, list, cur, act) => $(id).innerHTML = list.map(([k, l]) =>
    `<button type="button" data-act="${act}" data-k="${esc(k)}" aria-pressed="${k === cur}">${esc(l)}</button>`).join('');

  function acts(x) {
    const b = (s, l, ghost) => `<button class="btn sm${ghost ? ' ghost' : ''}" data-act="set" data-id="${x.id}" data-s="${s}">${l}</button>`;
    const edit = `<button class="btn sm ghost" data-act="edit" data-id="${x.id}">Edit</button>`;
    if (x.s === 'new') return b('review', 'Review') + b('done', 'Acted on', 1) + b('dropped', 'Discard', 1) + edit;
    if (x.s === 'review') return b('done', 'Acted on') + b('dropped', 'Discard', 1) + b('new', 'Back to jar', 1) + edit;
    return b('new', 'Reopen', 1);
  }
  function card(x) {
    if (editing === x.id) return `<div class="idea"><textarea id="edT" rows="2" style="width:100%;padding:8px 10px;border:1px solid var(--rule);border-radius:10px;background:rgba(255,255,255,.04)">${esc(x.t)}</textarea>
      <div class="chips" id="edA">${areas().map(a => `<button type="button" data-act="edarea" data-k="${esc(a)}" aria-pressed="${a === x.area}">${esc(a)}</button>`).join('')}</div>
      <div class="acts"><button class="btn sm" data-act="edsave" data-id="${x.id}">Save</button><button class="btn sm ghost" data-act="edcancel">Cancel</button></div></div>`;
    const end = x.s === 'done' ? `<span class="tag done">Acted on ${day(x.end)}</span>`
      : x.s === 'dropped' ? `<span class="tag dropped">Discarded</span>` : '';
    return `<div class="idea"><p>${esc(x.t)}</p>
      <div class="meta"><span class="tag">${esc(x.area)}</span><span>${when(x.at)}</span>${end}</div>
      <div class="acts">${acts(x)}</div></div>`;
  }

  function render() {
    chips('#addA', areas().map(a => [a, a]), pick, 'pick');
    const n = s => ideas.filter(x => (s === 'done' ? x.s === 'done' || x.s === 'dropped' : x.s === s)).length;
    $('#tabs').innerHTML = STATES.map(([k, l]) =>
      `<button role="tab" data-act="tab" data-k="${k}" aria-selected="${f.tab === k}">${l}<i>${n(k)}</i></button>`).join('');
    chips('#fArea', [['all', 'All areas']].concat(areas().map(a => [a, a])), f.area, 'area');
    $('#fWhen').innerHTML = WHEN.map(([k, l]) =>
      `<button type="button" data-act="when" data-k="${k}" aria-pressed="${k === f.when}">${l}</button>`).join('') +
      `<button type="button" data-act="order" aria-pressed="false">${f.old ? 'Oldest first' : 'Newest first'}</button>`;
    const l = shown(ideas, f, Date.now());
    if (!l.length) {
      $('#list').innerHTML = `<div class="empty">${f.tab === 'new' && !ideas.length
        ? 'The jar is empty. The next idea that will not let you rest goes here.'
        : 'Nothing here with these filters.'}</div>`;
      return;
    }
    let last = '', out = '';
    l.forEach(x => { const d = day(x.at); if (d !== last) { out += `<div class="day">${d}</div>`; last = d; } out += card(x); });
    $('#list').innerHTML = out;
  }

  $('#addF').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#addT').value.trim();
    if (!t) { $('#addT').focus(); return; }
    const now = Date.now();
    ideas.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), t, area: pick, at: now, u: now, s: 'new' });
    $('#addT').value = '';
    $('#addT').blur();
    save();
    toast('In the jar. It will wait for you.');
  });
  // Enter saves; Shift+Enter is a new line. One sentence rarely needs two.
  $('#addT').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#addF').requestSubmit(); }
  });

  let edArea = null;
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, k = b.dataset.k;
    if (a === 'pick') { pick = k; keep(); render(); return; }
    if (a === 'tab') { f.tab = k; editing = null; render(); return; }
    if (a === 'area') { f.area = k; render(); return; }
    if (a === 'when') { f.when = k; render(); return; }
    if (a === 'order') { f.old = !f.old; render(); return; }
    if (a === 'set') { const s = b.dataset.s; set(b.dataset.id, s);
      toast({ review: 'Moved to review', done: 'Acted on', dropped: 'Discarded', new: 'Back in the jar' }[s]); return; }
    if (a === 'edit') { editing = b.dataset.id; edArea = (ideas.find(x => x.id === editing) || {}).area; render(); return; }
    if (a === 'edarea') { edArea = k; document.querySelectorAll('#edA button').forEach(x => x.setAttribute('aria-pressed', x === b)); return; }
    if (a === 'edcancel') { editing = null; render(); return; }
    if (a === 'edsave') {
      const x = ideas.find(i => i.id === b.dataset.id), t = ($('#edT').value || '').trim();
      if (x && t) { x.t = t; x.area = edArea || x.area; x.u = Date.now(); }
      editing = null; save();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });

  render();
  sync();
})();
