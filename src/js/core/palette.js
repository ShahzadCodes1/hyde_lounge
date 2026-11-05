// Palette selection. Production uses Emerald Noir, the default in palettes.css (chosen by the client);
// the review preview (and local dev) adds a switcher so options can be compared live.
export const PALETTES = [
  { id: 'emerald', name: 'Emerald Noir', swatch: ['#050d0b', '#0e3a2f', '#d8bd86'] },
  { id: 'noir', name: 'Noir Champagne', swatch: ['#060606', '#ebe2d0', '#e4cfa6'] },
  { id: 'velvet', name: 'Velvet Oxblood', swatch: ['#0c0508', '#3d0c1d', '#e8b39a'] },
  { id: 'midnight', name: 'Midnight Brass', swatch: ['#04070e', '#0f2445', '#d9b46c'] },
];

// Emerald Noir is the chosen palette. The switcher is retired (set to true to compare palettes again);
// with it off, local dev looks exactly like the live site, and the hero posters match.
const SWITCHER = false;
const KEY = 'hyde:palette';
const valid = (id) => PALETTES.some((p) => p.id === id);

function setPalette(id, { persist = true } = {}) {
  if (!valid(id)) return;
  document.documentElement.dataset.palette = id;
  if (persist) { try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ } }
  document.querySelectorAll('[data-palette-btn]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.paletteBtn === id)));
  const label = document.querySelector('[data-palette-name]');
  if (label) label.textContent = PALETTES.find((p) => p.id === id).name;
  window.dispatchEvent(new CustomEvent('palettechange', { detail: id }));
}

// Runs on import, before any scene reads the colour tokens.
if (SWITCHER) {
  let initial = location.hash.slice(1);
  if (!valid(initial)) { try { initial = localStorage.getItem(KEY); } catch { initial = null; } }
  if (valid(initial)) document.documentElement.dataset.palette = initial;
}

export function initPaletteSwitcher() {
  if (!SWITCHER) return;
  const current = document.documentElement.dataset.palette || 'emerald';
  const el = document.createElement('div');
  el.className = 'palette';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Colour palette');
  el.innerHTML = `
    <span class="palette__label">Palette</span>
    ${PALETTES.map((p) => `
      <button class="palette__btn" type="button" data-palette-btn="${p.id}" aria-pressed="${p.id === current}" title="${p.name}" aria-label="${p.name}">
        <span style="background:${p.swatch[0]}"></span><span style="background:${p.swatch[1]}"></span><span style="background:${p.swatch[2]}"></span>
      </button>`).join('')}
    <span class="palette__name" data-palette-name>${PALETTES.find((p) => p.id === current).name}</span>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-palette-btn]');
    if (b) { setPalette(b.dataset.paletteBtn); history.replaceState(null, '', `#${b.dataset.paletteBtn}`); }
  });
  window.addEventListener('hashchange', () => setPalette(location.hash.slice(1)));
  document.body.appendChild(el);
}
