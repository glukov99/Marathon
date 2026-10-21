/* The glowing mode icons (Georgi's set, 21 Oct 2026), drawn as SVG so they
   stay sharp and sit on the dark theme without the white of the source image.
   Used by the Heating page and the Heating panel on the home page.
   Any element with data-ic="home|away|holiday|sammy|keep" gets its icon. */
(function () {
  const P = {
    home: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 9.5V19.5h12V9.5"/><path d="M15.5 6.5V4.5h2V8.4"/>' +
      '<g class="f"><rect x="10.2" y="12.2" width="1.6" height="1.6" rx=".3"/><rect x="12.2" y="12.2" width="1.6" height="1.6" rx=".3"/>' +
      '<rect x="10.2" y="14.2" width="1.6" height="1.6" rx=".3"/><rect x="12.2" y="14.2" width="1.6" height="1.6" rx=".3"/></g>',
    away: '<circle cx="12.5" cy="4.6" r="2"/><path d="M12 7.8 11 13.6"/><path d="M11 13.6 8.4 20"/><path d="M11 13.6l3.6 6.4"/>' +
      '<path d="M11.8 8.8l2.4 3 2 1.2"/><path d="M11.6 9.2 9.4 12.8"/>',
    holiday: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    sammy: '<circle cx="12" cy="13" r="6.6"/><path d="M5.4 11.4a1.7 1.7 0 0 0 0 3.4"/><path d="M18.6 11.4a1.7 1.7 0 0 1 0 3.4"/>' +
      '<path class="f" d="M10.3 4.6 12 6.6l1.7-2z"/><g class="f"><circle cx="9.6" cy="12.4" r=".9"/><circle cx="14.4" cy="12.4" r=".9"/></g>' +
      '<path d="M9.9 15.4c1.2 1.1 3 1.1 4.2 0"/>',
    keep: '<path d="M12 3c.6 3 4.9 5.2 5.6 9.3A5.8 5.8 0 0 1 6.3 15c-.6-2.2.2-4.2 1.6-5.6.1 1.5.8 2.5 1.9 2.8C9.2 8.7 10.6 5.3 12 3z"/>' +
      '<path class="f" d="M12 12.2c1.7 1.6 2.4 2.9 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1.3.8-2.6 2.4-4.2z"/>',
  };
  const css = document.createElement('style');
  css.textContent = `
.hic{flex-shrink:0;display:inline-grid;place-items:center;width:42px;height:42px;border-radius:50%;
  background:radial-gradient(circle at 50% 45%,#4A2A12,#24140A 75%);border:1.5px solid #FF8A3D;
  box-shadow:0 0 8px rgba(255,138,61,.65),0 0 20px rgba(255,138,61,.3),inset 0 0 10px rgba(255,138,61,.28);transition:.25s}
.hic svg{width:64%;height:64%;fill:none;stroke:#FFC27A;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;
  filter:drop-shadow(0 0 2px rgba(255,159,69,.9))}
.hic .f{fill:#FFB55E;stroke:none}
.hic.sm{width:30px;height:30px}
[aria-pressed="false"] .hic,.hic.dim{opacity:.5;box-shadow:none;filter:saturate(.6)}`;
  document.head.appendChild(css);
  const fill = (root) => (root || document).querySelectorAll('[data-ic]').forEach(e => {
    if (e.firstChild) return;
    e.classList.add('hic');
    e.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (P[e.dataset.ic] || '') + '</svg>';
  });
  window.HeatIcons = { fill, svg: k => '<svg viewBox="0 0 24 24" aria-hidden="true">' + (P[k] || '') + '</svg>' };
  fill();
})();
