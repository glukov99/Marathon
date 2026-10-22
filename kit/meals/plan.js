/* Meals arithmetic for the kit: calories per idea, scaling to a daily target,
   rounding, and the shopping list. Pure, so tools/check.js in the kit backend
   runs it in Node against the real ideas.

   An idea is [id, slot, name, [[product, amount], ...], tip, serves].
   A product is [label, kcal (per 100 g, or per piece when unit is 'pc'), kind, unit].
   'veg' never scales; an amount of 0 means "as much as you like". */
(function (root) {
  const SLOTS = ['breakfast', 'snack', 'lunch', 'dinner'];
  const fits = (idea, slot) => idea[1] === slot || (idea[1] === 'main' && (slot === 'lunch' || slot === 'dinner'));

  // kcal of one serving
  function kcal(idea, P) {
    const all = idea[3].reduce((a, [k, n]) => {
      const p = P[k]; if (!p) return a;
      return a + (p[3] === 'pc' ? n * p[1] : n * p[1] / 100);
    }, 0);
    return all / (idea[5] || 1);
  }

  // How much bigger (or smaller) than the plan this meal should be for the target.
  function factor(idea, slot, target, P, S) {
    const k = kcal(idea, P);
    if (!target || !k || !S[slot]) return 1;
    return Math.min(3, Math.max(0.5, target * S[slot] / k));
  }

  const r5 = g => Math.max(5, Math.round(g / 5) * 5);
  // The recipe as cooked, scaled: pieces stay whole, grams round to 5, oil reads in teaspoons.
  function lines(idea, f, P) {
    return idea[3].map(([k, n]) => {
      const p = P[k] || [k, 0, 'veg'];
      if (!n) return { k, label: p[0], text: 'as much as you like' };
      const scale = p[2] === 'veg' ? 1 : f;
      if (p[3] === 'pc') { const c = Math.max(1, Math.round(n * scale)); return { k, label: p[0], n: c, text: String(c) }; }
      const g = r5(n * scale);
      return { k, label: p[0], g, text: k === 'oil' ? fmtTsp(g / 5) + ' tsp' : g + ' g' };
    });
  }
  const fmtTsp = t => (Math.round(t * 2) / 2).toString().replace('.5', '½').replace(/^0½/, '½');

  /* Shopping for a set of planned meals: [{idea, slot}] plus own meals' lines.
     A recipe that serves 2 counts half per planned meal, so planning it twice buys one batch. */
  function shopping(planned, target, P, S) {
    const by = {};
    planned.forEach(({ idea, slot }) => {
      const f = factor(idea, slot, target, P, S), per = 1 / (idea[5] || 1);
      lines(idea, f, P).forEach(l => {
        const o = by[l.k] = by[l.k] || { k: l.k, label: l.label, g: 0, n: 0, free: false };
        if (l.g) o.g += l.g * per; else if (l.n) o.n += l.n * per; else o.free = true;
      });
    });
    return Object.values(by).map(o => ({ k: o.k, label: o.label,
      text: o.n ? String(Math.ceil(o.n - 1e-9)) : o.g ? (o.k === 'oil' ? fmtTsp(o.g / 5) + ' tsp' : r5(o.g) + ' g') : 'some' }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  root.Plan = { SLOTS, fits, kcal, factor, lines, shopping };
})(typeof window !== 'undefined' ? window : globalThis);
