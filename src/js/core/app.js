// Styles (fonts, palette, base and each page's own sheet) are linked in every page's <head>,
// so they block the first paint and no frame of unstyled HTML is ever shown.
import { initPaletteSwitcher } from './palette.js';
import { injectShell } from './shell.js';
import { initSmoothScroll, ScrollTrigger, reducedMotion } from './smooth.js';
import { isLeaving, posterReady, posterIn } from './scenes.js';
import { initNav } from './nav.js';
import { initCursor } from './cursor.js';
import { runLoader, initPageTransitions, curtainUp } from './loader.js';
import { initFooter } from './footer.js';
import { prefetchAll } from './prefetch.js';

/**
 * Run the page's 3D setup once the curtain is up and the hero copy has (mostly) risen.
 * Until then the hero shows its poster, a still of the same scene, so nothing looks missing.
 * Building a scene (WebGL context, shader compiles, first frame) is the heaviest work on the
 * page, and on some machines the browser cannot draw anything else while it happens. Doing it
 * behind the closed curtain is what used to keep guests waiting there for seconds; doing it
 * during the copy's entrance would freeze the copy mid-air. So it waits for a settled page,
 * and the scene then fades in on its own.
 * @param {() => void} fn
 * @param {{ delay?: number }} opts ms to wait after the curtain is up
 */
export function afterCurtain(fn, { delay = 500 } = {}) {
  return curtainUp
    .then(() => new Promise((r) => setTimeout(r, reducedMotion ? 0 : delay)))
    .then(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))))
    .then(() => { if (!isLeaving()) { fn(); ScrollTrigger.refresh(); } });
}

/**
 * Boot sequence shared by all five pages.
 * @param {string} page id of the current page
 * @param {{ preload?: Promise[], onReveal?: () => void }} opts
 */
export async function boot(page, { preload = [], onReveal } = {}) {
  if (window.__hydeLeaving) return; // the first-paint script is already sending this visit back to Home
  window.scrollTo(0, 0);
  injectShell(page);
  initPaletteSwitcher();
  initSmoothScroll()?.scrollTo(0, { immediate: true, force: true });
  initNav();
  initCursor();
  initPageTransitions();

  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  // the curtain lifts with the hero picture already in place (the poster), never on an empty stage
  await runLoader([fonts, posterReady(), ...preload]);
  posterIn();
  onReveal?.();
  // layout work waits until the curtain is fully up, so it can never hitch the entrance
  curtainUp.then(() => { initFooter(); ScrollTrigger.refresh(); });
  prefetchAll(page);
}
