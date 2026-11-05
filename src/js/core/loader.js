import { gsap, lockScroll, reducedMotion } from './smooth.js';
import { prefetchPage } from './prefetch.js';
import { freezeAll, openGate } from './scenes.js';
import { PAGES } from './shell.js';

const SEEN_KEY = 'hyde:seen';
let markUp;
/** Resolves once the curtain is fully up. Pages build their 3D only after this, so GPU work
 *  (shader compiles, first frames) never holds the curtain or stalls its animation. */
export const curtainUp = new Promise((r) => { markUp = r; });
const markSeen = () => { try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode */ } };

/**
 * The curtain is static HTML at the top of every page, so it is the first thing painted.
 * First visit: full branded preloader (the logo draws itself in CSS, before any script has loaded)
 * with a real progress counter.
 * Later page loads in the same visit: the page opens on exactly the frame the previous page left
 * on (the closed curtain with the page name), then lifts it. The first-paint script in <head>
 * picks the mode by adding .hyde-quick to <html>.
 * The curtain waits only for the fonts (briefly). The 3D scenes are built after it has lifted
 * and fade in when their first frame is ready.
 * @param {Promise[]} tasks things to wait for (fonts)
 * @returns {Promise} resolves once the page is revealed
 */
export function runLoader(tasks = []) {
  const el = document.querySelector('[data-loader]');
  if (!el) return Promise.resolve();
  const panel = el.querySelector('.loader__panel');
  const bar = el.querySelector('.loader__bar i');
  const count = el.querySelector('[data-count]');
  const note = el.querySelector('[data-loader-note]');
  const quick = document.documentElement.classList.contains('hyde-quick') || reducedMotion;

  document.body.classList.add('is-loading');
  lockScroll(true);
  if (quick) el.classList.add('is-quick');

  const progress = { v: 0 };
  let done = 0;
  const all = tasks.length ? tasks : [Promise.resolve()];
  // The logo animation runs in CSS from the first paint; this only makes sure it finishes.
  const sinceStart = performance.now();
  const minTime = new Promise((r) => setTimeout(r, quick ? 0 : Math.max(0, 1700 - sinceStart)));
  all.forEach((p) => Promise.resolve(p).catch(() => {}).then(() => { done += 1; }));

  return new Promise((resolve) => {

    // Counter eases toward the real completion ratio so it never stalls at 100 early.
    const tick = () => {
      const target = Math.min(done / all.length, 1) * 100;
      progress.v += (target - progress.v) * 0.08;
      const v = Math.min(99, Math.round(progress.v));
      if (count) count.textContent = String(v).padStart(3, '0');
      if (bar) bar.style.transform = `scaleX(${v / 100})`;
    };
    gsap.ticker.add(tick);

    // Never hold the curtain for long: if a font is slow, lift anyway (text swaps in when it lands).
    const settled = Promise.allSettled(all);
    const waited = Promise.race([settled, new Promise((r) => setTimeout(r, quick ? 600 : 2500))]);
    Promise.all([waited, minTime]).then(() => {
      gsap.ticker.remove(tick);
      if (count) count.textContent = '100';
      if (bar) bar.style.transform = 'scaleX(1)';
      markSeen();

      gsap.timeline({
        onComplete() {
          el.style.display = 'none';
          document.body.classList.remove('is-loading');
          lockScroll(false);
          openGate();
          markUp();
        },
      })
        .to(el.querySelector('.loader__inner'), { autoAlpha: 0, y: -20, duration: quick ? 0 : 0.45, ease: 'power2.in' })
        .to(note, { autoAlpha: 0, y: -12, duration: quick ? 0.25 : 0, ease: 'power2.in' }, 0)
        // One dark panel lifts straight off the page (no coloured under-layer, so no flash of colour).
        // It starts moving while the logo / page name is still fading, so there is no idle dark beat.
        .to(panel, { yPercent: -100, duration: quick ? 0.7 : 1, ease: 'power3.inOut' }, quick ? 0.08 : 0.25)
        .add(resolve, quick ? '<0.1' : '<0.3');
    });
  });
}

/**
 * Departure half of a page transition: curtains sweep up, then navigate.
 * The next page's runLoader() (quick mode) plays the arrival.
 */
export function initPageTransitions() {
  const el = document.querySelector('[data-loader]');
  if (!el) return;
  const panel = el.querySelector('.loader__panel');

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
    let url;
    try { url = new URL(a.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname) && url.pathname.includes('.')) return;
    if (url.pathname === location.pathname && url.hash) return;
    if (url.href === location.href) { e.preventDefault(); return; }
    e.preventDefault();
    prefetchPage(url.href); // start downloading the next page while the curtain closes
    freezeAll();

    el.classList.add('is-quick');
    el.style.display = '';
    const note = el.querySelector('[data-loader-note]');
    const dest = PAGES.find((p) => url.pathname.endsWith(`/${p.href}`) || url.pathname.endsWith(`/${p.href.replace('.html', '')}`))
      || (/\/$/.test(url.pathname) ? PAGES[0] : null);
    // Review preview: only some pages are built. Links between them work; the rest show a note.
    let singlePage = false;
    if (import.meta.env.VITE_SINGLE_PAGE === '1') {
      const name = (url.pathname.match(/([\w-]+)\.html$/) || [, 'index'])[1];
      const built = (import.meta.env.VITE_PREVIEW_PAGES || 'index').split(',');
      if (!built.includes(name)) singlePage = true;
      else if (name === 'index') url = new URL('./', location.href); // the preview's home page is its root
    }
    if (dest && !singlePage) note.innerHTML = `${dest.curtain[0]}<small>${dest.curtain[1]}</small>`;
    // Ends on exactly the frame the next page paints first: the closed curtain with that page's name.
    const tl = gsap.timeline({ onComplete: () => { if (!singlePage) location.href = url.href; } })
      .set(panel, { yPercent: 100 })
      .set(note, { autoAlpha: 0, y: 12 })
      .to(panel, { yPercent: 0, duration: 0.45, ease: 'power3.inOut' });
    if (dest && !singlePage) tl.to(note, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power2.out' }, '-=0.12');

    // Preview build has only the Home page: show the transition, name the page, then lift back.
    if (singlePage) {
      const note = el.querySelector('[data-loader-note]');
      const label = (a.textContent || '').trim() || 'This page';
      note.innerHTML = `${label}<small>Built in a later step</small>`;
      tl.to(note, { autoAlpha: 1, y: 0, duration: 0.5 })
        .to(note, { autoAlpha: 0, duration: 0.4 }, '+=0.9')
        .to(panel, { yPercent: -100, duration: 0.9, ease: 'expo.inOut' })
        .set(el, { display: 'none' });
    }
  });

  // Hovering or touching a link starts fetching that page.
  const warm = (e) => {
    const a = e.target.closest?.('a[href]');
    if (!a || a.target === '_blank') return;
    try { const u = new URL(a.href, location.href); if (u.origin === location.origin) prefetchPage(u.href); } catch { /* ignore */ }
  };
  document.addEventListener('pointerover', warm, { passive: true });
  document.addEventListener('touchstart', warm, { passive: true });

  // Back/forward-cache returns are handled by the first-paint script in <head> (always a fresh load).
}
