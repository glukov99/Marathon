/* Small SVG charts, no library, shared by the Money page and the Business page.
   Each one takes a list of [label, value] already sorted and returns markup.

   They are deliberately plain: a chart here is for seeing a shape at a glance,
   and every figure it shows is also written out beside it, so nothing depends
   on reading a slice by eye.
*/
(function (root) {
  const PAL = ['#E07A63', '#D99A6C', '#E2C46B', '#B9C46B', '#7FB98A', '#6E9A97',
    '#8FC0B6', '#9DB6C4', '#8A9BD0', '#B58AC9', '#C98BA0', '#A7B4AD'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function donut(list, total) {
    const R = 70, C = 2 * Math.PI * R;
    let off = 0;
    const segs = list.map(([, v], i) => {
      const len = total ? v / total * C : 0;
      const s = `<circle r="${R}" cx="100" cy="100" fill="none" stroke="${PAL[i % PAL.length]}" stroke-width="34"
      stroke-dasharray="${len.toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
      off += len; return s;
    }).join('');
    return `<svg viewBox="0 0 200 200" class="donut" aria-hidden="true"><g transform="rotate(-90 100 100)">${segs}</g></svg>`;
  }

  /* Horizontal bars, the shape Georgi's own sheet uses for "profit vs service".
     Each item is [label, value] or [label, value, second] — a second figure
     printed beside the first, dimmer. That is there because an average on its
     own chart, one card below its total, is an average nobody finds: he asked
     "where is my avg per invoice" twice while it was on the screen below. */
  function bars(list, fmt, opts) {
    const o = opts || {};
    const max = Math.max(1, ...list.map(([, v]) => v));
    const two = list.some(x => x.length > 2 && x[2] != null);
    return `<div class="bars${two ? ' two' : ''}">` + list.map(([label, v, second], i) =>
      `<div class="bar"><span class="bl">${esc(label)}</span>
        <span class="bt"><i style="width:${(v / max * 100).toFixed(1)}%;background:${o.flat || PAL[i % PAL.length]}"></i></span>
        <span class="bv">${fmt(v)}</span>` +
        (two ? `<span class="bv b2">${second == null ? '' : fmt(second)}</span>` : '') +
      `</div>`).join('') + `</div>`;
  }

  /* One group of bars per period: the "in, out, what was kept" picture.
     rows: [{ label, parts: [{ v, cls }] }]. Negative values draw downwards is
     overkill here, so a kept figure that is negative is simply shown in red. */
  function groups(rows, fmt) {
    const max = Math.max(1, ...rows.map(r => Math.max(...r.parts.map(p => Math.abs(p.v)))));
    return `<div class="grp">` + rows.map(r =>
      `<div class="gr"><span class="gl">${esc(r.label)}</span>
        <span class="gb">${r.parts.map(p =>
          `<i class="${p.cls}" style="height:${(Math.abs(p.v) / max * 100).toFixed(1)}%" title="${esc(p.name || '')} ${fmt(p.v)}"></i>`).join('')}</span>
        <span class="gv">${r.parts.map(p =>
          `<b class="${p.cls}">${fmt(p.v)}</b>`).join('')}</span></div>`).join('') + `</div>`;
  }

  /* Twelve months of in and out. The grouped-column chart cannot carry that
     many: on a phone it became 36 bars with three rows of figures that ran off
     the screen. One row per month reads instead of being decoded, and the
     figures it drops are on the Year tab in full. */
  function inOut(rows, fmt) {
    const max = Math.max(1, ...rows.map(r => Math.max(r.inn, r.out)));
    const w = v => (v / max * 100).toFixed(1);
    return `<div class="io">` + rows.map(r => {
      const net = r.inn - r.out;
      return `<div class="ior"><span class="iol">${esc(r.label)}</span>
        <span class="iob"><i class="in" style="width:${w(r.inn)}%" title="in ${fmt(r.inn)}"></i>
          <i class="out" style="width:${w(r.out)}%" title="out ${fmt(r.out)}"></i></span>
        <span class="iov ${net >= 0 ? 'up' : 'dn'}">${net >= 0 ? '+' : '\u2212'}${fmt(net)}</span></div>`;
    }).join('') + `<div class="iok"><span class="in"></span>in<span class="out"></span>out
      <b>right: what was kept</b></div></div>`;
  }

  root.Charts = { donut, bars, groups, inOut, PAL };
})(typeof window !== 'undefined' ? window : globalThis);
