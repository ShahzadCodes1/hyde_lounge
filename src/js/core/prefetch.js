import { PAGES } from './shell.js';

/* ==========================================================================
   PREFETCH — make the next page arrive fast.
   Each page is its own HTML file; the heavy code (three.js, GSAP) is shared and
   cached after the first visit. This fetches the other pages' HTML and their
   page-specific scripts and styles quietly in the background, so a click only
   has to play the curtain.
   ========================================================================== */

const done = new Set();
const hint = (href, as) => {
  if (done.has(href)) return;
  done.add(href);
  const l = document.createElement('link');
  l.rel = as === 'script' ? 'modulepreload' : 'prefetch';
  if (as && as !== 'script') l.as = as;
  l.href = href;
  document.head.appendChild(l);
};

export function prefetchPage(href) {
  let url;
  try { url = new URL(href, location.href); } catch { return; }
  url.hash = '';
  const key = url.href;
  if (done.has(key) || url.href === location.href.split('#')[0]) return;
  done.add(key);
  fetch(key, { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.text() : ''))
    .then((html) => {
      // the page's own scripts and styles (paths are relative to that page)
      const re = /<(script|link)[^>]+(?:src|href)="([^"]+\.(?:js|css))"/g;
      let m;
      while ((m = re.exec(html))) {
        const asset = new URL(m[2], key).href;
        hint(asset, m[2].endsWith('.css') ? 'style' : 'script');
      }
    })
    .catch(() => {});
}

/** After the current page has settled, warm every other page during idle time. */
export function prefetchAll(current) {
  const run = () => {
    const single = import.meta.env.VITE_SINGLE_PAGE === '1';
    PAGES.filter((p) => p.id !== current).forEach((p, i) => {
      const href = single && p.href === 'index.html' ? './' : p.href;
      setTimeout(() => prefetchPage(href), i * 400);
    });
  };
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  setTimeout(() => idle(run, { timeout: 4000 }), 2500);
}
