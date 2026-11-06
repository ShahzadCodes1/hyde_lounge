// Styles (fonts, palette, base and each page's own sheet) are linked in every page's <head>,
// so they block the first paint and no frame of unstyled HTML is ever shown.
import { initPaletteSwitcher } from './palette.js';
import { injectShell } from './shell.js';
import { initSmoothScroll, ScrollTrigger, reducedMotion } from './smooth.js';
import { isLeaving, posterReady, posterSettled, heroPrimed, heroIn, heroHandOver } from './scenes.js';
import { initNav } from './nav.js';
import { initCursor } from './cursor.js';
import { runLoader, initPageTransitions } from './loader.js';
import { initFooter } from './footer.js';
import { prefetchAll } from './prefetch.js';
import { initLazyMedia } from './media.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves just after the browser has painted the page once (the curtain is static HTML and CSS).
 * Every page starts its script work (shell, scroll setup, the hero's 3D) from here, so the very
 * first paint never waits for it: on a slow phone the curtain shows at once instead of after
 * a few hundred milliseconds of script.
 */
export const firstPaint = new Promise((r) => {
  requestAnimationFrame(() => setTimeout(r, 0)); // rAF runs right before a paint; the timeout right after it
  setTimeout(r, 150); // a tab opened in the background does not paint: do not wait for it
});
let entranceResolve;
/** Resolves once the hero's entrance (poster, headline, buttons) has finished playing. */
export const entranceDone = new Promise((r) => { entranceResolve = r; });
const ENTRANCE_MS = 2000; // the hero copy timelines on every page end by then

/**
 * Run work that must not disturb the hero's entrance (scroll scenes, the other chapters' 3D)
 * once the entrance has finished.
 * Building a scene (WebGL context, shader compiles, first frame) is the heaviest work on the
 * page, and on phones the browser cannot draw anything else while it happens: started during
 * the entrance, it would freeze the copy mid-way and then jump.
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
 * @param {{ preload?: Promise[], onReveal?: (mode: 'live'|'poster'|'none') => void }} opts
 */
export async function boot(page, { preload = [], onReveal } = {}) {
  if (window.__hydeLeaving) return; // the first-paint script is already sending this visit back to Home
  await firstPaint;
  window.scrollTo(0, 0);
  injectShell(page);
  initPaletteSwitcher();
  initSmoothScroll()?.scrollTo(0, { immediate: true, force: true });
  initNav();
  initCursor();
  initPageTransitions();
  initLazyMedia();

  // If the phone's browser takes a 3D canvas's graphics memory back (iOS does this under memory
  // pressure), hide that canvas so the section shows its backdrop and copy rather than a black
  // rectangle; three.js rebuilds the context and the canvas comes back when it is restored.
  document.addEventListener('webglcontextlost', (e) => { e.target.style.visibility = 'hidden'; }, true);
  document.addEventListener('webglcontextrestored', (e) => { e.target.style.visibility = ''; }, true);

  const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
  // The curtain lifts once the hero's live scene has drawn its first frame (built while the curtain
  // is down, see stageHero), with the poster decoded as a fallback for a device that misses the cap.
  await runLoader([fonts, posterReady(), heroPrimed(), ...preload]);
  const mode = heroIn();
  onReveal?.(mode);
  // layout work and the footer wait for the entrance, so nothing can hitch it
  entranceDone.then(() => { initFooter(); ScrollTrigger.refresh(); });
  // nothing heavy (other 3D builds, prefetching other pages) runs until the entrance is over
  Promise.all([posterSettled(), wait(reducedMotion ? 0 : ENTRANCE_MS)]).then(entranceResolve);
  if (mode === 'poster') entranceDone.then(() => heroHandOver());
  entranceDone.then(() => prefetchAll(page));
}
