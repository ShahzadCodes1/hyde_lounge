// Styles (fonts, palette, base and each page's own sheet) are linked in every page's <head>,
// so they block the first paint and no frame of unstyled HTML is ever shown.
import { initPaletteSwitcher } from './palette.js';
import { injectShell } from './shell.js';
import { initSmoothScroll, ScrollTrigger, reducedMotion } from './smooth.js';
import { isLeaving, posterReady, posterIn, posterSettled } from './scenes.js';
import { initNav } from './nav.js';
import { initCursor } from './cursor.js';
import { runLoader, initPageTransitions } from './loader.js';
import { initFooter } from './footer.js';
import { prefetchAll } from './prefetch.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let entranceResolve;
/** Resolves once the hero's entrance (poster, headline, buttons) has finished playing. */
export const entranceDone = new Promise((r) => { entranceResolve = r; });
const ENTRANCE_MS = 2000; // the hero copy timelines on every page end by then

/**
 * Run the page's 3D setup once the hero's entrance has finished.
 * Until then the hero shows its poster, a still of the same scene, so nothing looks missing.
 * Building a scene (WebGL context, shader compiles, first frame) is the heaviest work on the
 * page, and on phones the browser cannot draw anything else while it happens: started during
 * the entrance, it freezes the copy and the poster mid-way and then jumps. Started after it,
 * the screen it holds is a still picture, so the build is invisible. The live scene then
 * crosses over the identical poster.
 * @param {() => void} fn
 * @param {{ delay?: number }} opts extra ms to wait after the entrance
 */
export function afterCurtain(fn, { delay = 120 } = {}) {
  return entranceDone
    .then(() => wait(reducedMotion ? 0 : delay))
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
  // layout work and the footer wait for the entrance too, so nothing can hitch it
  entranceDone.then(() => { initFooter(); ScrollTrigger.refresh(); });
  // nothing heavy (3D builds, prefetching other pages) runs until the entrance is over
  Promise.all([posterSettled(), wait(reducedMotion ? 0 : ENTRANCE_MS)]).then(entranceResolve);
  entranceDone.then(() => prefetchAll(page));
}
