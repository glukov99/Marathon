/* The year view: categories down, months across, so a year reads on one screen
   instead of stepping back month by month.

   It is shared by the Money page and the Business page, which want the same
   grid over different money. Everything here is pure except grid(), which only
   builds HTML, so the figures can be checked in Node (money/year-check.js).

   A host gives it rows that already carry `_k` ('inc' | 'exp' | anything else,
   which is not counted) and `_cat`, and passes its own formatting in:
     Year.data(rows, '2026')              -> the figures
     Year.story(d, prev)                  -> three sentences
     Year.grid(d, {kind, cat, cell, tx, dayList, ykinds})  -> the HTML
*/
(function (root) {
  const M_INIT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const kfmt = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(Math.round(n)));
  const fmt0 = n => '€' + Math.round(Math.abs(n)).toLocaleString('en-GB');
  const sfmt0 = n => (n < 0 ? '−' : '') + fmt0(n);
  const mIdx = t => +t.d.slice(5, 7) - 1;
  const z12 = () => new Array(12).fill(0);
  const MON = m => new Date(m + '-01T12:00').toLocaleDateString('en-GB', { month: 'short' });
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fmt = n => '€' + Math.abs(n).toLocaleString('en-GB',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function data(rows, year) {
    const inYear = rows.filter(t => t.d.startsWith(year));
    const inc = z12(), exp = z12(), cats = {}, icats = {}, has = new Array(12).fill(false);
    inYear.forEach(t => {
      const i = mIdx(t);
      if (t._k === 'inc' || t._k === 'exp') has[i] = true;
      if (t._k === 'inc') {
        inc[i] += t.a;
        (icats[t._cat] = icats[t._cat] || z12())[i] += t.a;
      } else if (t._k === 'exp') {
        exp[i] -= t.a;
        (cats[t._cat] = cats[t._cat] || z12())[i] -= t.a;
      }
    });
    const rank = o => Object.entries(o)
      .map(([cat, months]) => ({ cat, months, total: months.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
    const list = rank(cats);
    const net = inc.map((v, i) => v - exp[i]);
    // Months with any activity, so a part year is not read as twelve months.
    const live = inYear.length ? inYear.map(mIdx) : [];
    const from = live.length ? Math.min(...live) : 0, to = live.length ? Math.max(...live) : -1;
    return { year, inc, exp, net, cats: list, incCats: rank(icats), from, to, has,
      total: list.reduce((a, c) => a + c.total, 0), months: to - from + 1 };
  }

  // Three plain sentences about the year. Each one is a fact from the grid above,
  // not a judgement: where the money went, which month stands out and why, and
  // how it compares with the year before over the same months.
  function story(d, prev) {
    const out = [];
    if (!d.cats.length) return out;
    const top = d.cats[0];
    const share = d.total ? Math.round(top.total / d.total * 100) : 0;
    out.push(`${top.cat} is the biggest at ${fmt(top.total)}, ${share}% of everything you spent.`);

    const peak = d.exp.indexOf(Math.max(...d.exp));
    if (d.exp[peak] > 0) {
      // What made that month stand out: the category furthest above its own average
      // in the other live months.
      let drv = null;
      d.cats.forEach(c => {
        const others = c.months.filter((v, i) => i !== peak && i >= d.from && i <= d.to);
        const avg = others.length ? others.reduce((a, b) => a + b, 0) / others.length : 0;
        const over = c.months[peak] - avg;
        if (c.months[peak] > 0 && (!drv || over > drv.over)) drv = { cat: c.cat, over, v: c.months[peak] };
      });
      out.push(`${MON(d.year + '-' + String(peak + 1).padStart(2, '0'))} was the dearest month at ${fmt(d.exp[peak])}` +
        (drv && drv.over > 0 ? `, mostly ${drv.cat} at ${fmt(drv.v)}.` : '.'));
    }

    if (prev) {
      // Only the months both years actually hold data for. A part year, or a year the
      // bank history barely reaches, would otherwise produce a true but useless number.
      const both = d.has.map((h, i) => h && prev.has[i]);
      const n = both.filter(Boolean).length;
      const sum = (arr) => arr.reduce((x, y, i) => x + (both[i] ? y : 0), 0);
      const a = sum(d.exp), b = sum(prev.exp);
      if (n >= 2 && b > 0) {
        const diff = a - b, pc = Math.round(Math.abs(diff) / b * 100);
        out.push(`Over the ${n} months both years cover, that is ${fmt(Math.abs(diff))} ` +
          `${diff >= 0 ? 'more' : 'less'} than ${prev.year} (${pc}%).`);
      }
    }
    const saved = d.net.filter((v, i) => i >= d.from && i <= d.to && v > 0).length;
    if (d.months > 1) out.push(`You ended ${saved} of ${d.months} months in the black.`);
    return out.slice(0, 3);
  }

  function heat(v, max, cls) {
    if (!v) return `<span class="yc z"></span>`;
    const o = 0.18 + 0.82 * (max ? v / max : 0);
    return `<span class="yc ${cls}" style="opacity:${o.toFixed(2)}"></span>`;
  }

  const KINDS = [['net', 'Net'], ['exp', 'Expenses'], ['inc', 'Income']];

  /* opts: kind 'net'|'exp'|'inc', cat (the open category), cell (the open month),
     tx (rows for the year, for the opened month's list) and dayList(rows). */
  function grid(d, opts) {
    const o = opts || {}, kind = o.kind || 'exp';
    if (!d.cats.length && !d.incCats.length) return '<div class="empty">Nothing in this year.</div>';
    // Average over the months the year actually holds, not over twelve, or a part
    // year would read as if the quiet months were spending nothing.
    const per = n => n / Math.max(d.months, 1);
    const head = `<div class="ygh"><span></span>${M_INIT.map((m, i) =>
      `<span class="${i < d.from || i > d.to ? 'off' : ''}">${m}</span>`).join('')}` +
      `<span class="yt">Total</span><span class="yt">Avg</span></div>`;
    const chips = `<div class="chips yk">${KINDS.map(([k, label]) =>
      `<button data-act="ykind" data-k="${k}" aria-pressed="${kind === k}">${label}</button>`).join('')}</div>`;

    // One summary row: twelve cells, the year total, and the average per month with
    // data. The Net row has no average on purpose: an average net month says nothing.
    const sumRow = (label, arr, cls, avg) => {
      const max = Math.max(...arr.map(Math.abs), 1);
      const tot = arr.reduce((a, b) => a + b, 0);
      return `<div class="yr net"><span class="yn">${label}</span>` +
        arr.map((v, i) => (i < d.from || i > d.to
          ? '<span class="yc z"></span>'
          : heat(Math.abs(v), max, typeof cls === 'function' ? cls(v) : cls))).join('') +
        `<span class="yt">${sfmt0(tot)}</span><span class="yt av">${avg ? sfmt0(per(tot)) : ''}</span></div>`;
    };

    if (kind === 'net') {
      return `<div class="yg">${chips}${head}` +
        sumRow('Income', d.inc, 'up', true) +
        sumRow('Expenses', d.exp, 'ex', true) +
        `<div class="ysep"></div>` + sumRow('Net', d.net, v => (v >= 0 ? 'up' : 'dn'), false) +
        `</div><div class="note2">Money in, money out and what was left, month by month. ` +
        `Tap Expenses or Income above for the categories behind them. EUR only.</div>`;
    }

    const list = kind === 'inc' ? d.incCats : d.cats;
    if (!list.length) return `<div class="yg">${chips}</div>` +
      `<div class="empty">No ${kind === 'inc' ? 'money in' : 'spending'} in this year.</div>`;
    const rows = list.map(c => {
      const max = Math.max(...c.months);
      const open = o.cat === c.cat;
      return `<button class="yr${open ? ' open' : ''}" data-act="ycat" data-c="${esc(c.cat)}">` +
        `<span class="yn">${esc(c.cat)}</span>` +
        c.months.map(v => heat(v, max, kind === 'inc' ? 'up' : 'ex')).join('') +
        `<span class="yt">${fmt0(c.total)}</span><span class="yt av">${fmt0(per(c.total))}</span></button>` +
        (open ? `<div class="ym">${c.months.map((v, i) => v
          ? `<button class="ymb${o.cell === i ? ' on' : ''}" data-act="ycell" data-i="${i}">` +
            `${MON(d.year + '-' + String(i + 1).padStart(2, '0'))} ${kfmt(v)}</button>`
          : '').join('')}<span class="av">${fmt(c.total)} in all, ${fmt(per(c.total))} a month</span></div>` +
          (o.cell != null && o.dayList
            ? `<div class="ye">${o.dayList((o.tx || []).filter(t => t._cat === c.cat && mIdx(t) === o.cell))}</div>`
            : '')
          : '');
    }).join('');
    return `<div class="yg">${chips}${head}${rows}</div>` +
      `<div class="note2">Shading is each category against its own best month, so a small one still shows its shape. Tap a row for the months, then a month for what is in it. Avg is per month with data (${d.months} this year). EUR only.</div>`;
  }

  root.Year = { data, story, grid, heat, KINDS, M_INIT, kfmt, fmt0, sfmt0, mIdx, z12, MON };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
