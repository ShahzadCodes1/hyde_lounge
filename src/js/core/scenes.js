// Every live WebGL scene on the page registers here.
// · freezeAll(): a page transition stops them all the moment a link is clicked, so the curtain
//   sweeps over a still frame instead of competing with the renderer.
// · While the curtain is closed, no scene runs its render loop. A scene asking to start is held
//   until the curtain has lifted; otherwise the GPU spends every frame drawing a picture nobody can
//   see, and the browser cannot find a free frame to animate the curtain itself.
const scenes = new Set();
const held = new Set();
let gateOpen = false;
let leaving = false;
/** True once a link has been clicked and the page is on its way out: start no new 3D work. */
export const isLeaving = () => leaving;

export function track(scene) {
  if (!scene) return scene;
  scenes.add(scene);
  const start = scene.start.bind(scene);
  const stop = scene.stop.bind(scene);
  scene.start = () => { if (gateOpen) start(); else held.add(start); };
  scene.stop = () => { held.delete(start); stop(); };
  return scene;
}
export function freezeAll() { leaving = true; gateOpen = false; scenes.forEach((s) => { try { s.stop(); } catch { /* ignore */ } }); }
/** Called once the curtain is up: start every scene that asked to run while it was closed. */
export function openGate() { gateOpen = true; held.forEach((start) => start()); held.clear(); }

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Resolves when the hero poster has finished its entrance; the live 3D never crosses over before. */
let posterDone = Promise.resolve();
/**
 * The hero's one entrance: the poster (the still of the scene) fades and settles in as the curtain lifts.
 * Everything else on the hero (copy, buttons) follows it. The live 3D then crosses over a poster that
 * is already at rest, so there is exactly one animation and no second one.
 */
/** The poster's entrance as a promise (resolved at once when there is no poster). */
export const posterSettled = () => posterDone;

export function posterIn() {
  const el = document.querySelector('.stage-poster');
  if (!el) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { el.classList.add('is-in'); return; }
  posterDone = new Promise((r) => {
    const done = () => r();
    el.addEventListener('transitionend', (e) => { if (e.propertyName === 'transform') done(); });
    setTimeout(done, 2200); // fallback (reduced motion, background tab)
  });
  requestAnimationFrame(() => el.classList.add('is-in'));
}

/* ---------- the hero scene: built while the curtain is down ----------
 * Each page stages its hero scene as soon as its script runs. While the curtain is still closed
 * (the screen is a still panel, so a busy GPU shows nothing) the scene is created, its shaders
 * compiled and its first frame drawn. The curtain waits for that, up to a cap. When it lifts,
 * the live scene itself plays the entrance: it moves from the first frame on.
 * On a slow device that misses the cap, the poster (a still of the same scene) plays the entrance
 * instead, and the live scene takes over once the entrance has finished.
 */
let hero = null;
let heroResolve;
const heroPrimedP = new Promise((r) => { heroResolve = r; });
/** Resolves (true/false) once the staged hero scene has drawn its first frame. */
export const heroPrimed = () => heroPrimedP;
const reducedPref = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {object|null} scene
 * @param {HTMLCanvasElement} canvas
 * @param {{ fonts?: string[], prepare?: () => void, ready?: Promise }} opts
 */
export function stageHero(scene, canvas, { fonts = [], prepare, ready } = {}) {
  if (!scene || !canvas) { heroResolve(false); return heroPrimedP; }
  const poster = canvas.previousElementSibling?.classList.contains('stage-poster') ? canvas.previousElementSibling : null;
  canvas.style.opacity = '0';
  const h = { scene, canvas, poster, primed: false, revealed: false };
  hero = h;
  // Nothing may start the hero's render loop (the page's scroll triggers ask for it) until it is
  // shown: a loop running behind the poster would compile and draw during the entrance.
  const start = scene.start;
  let allowed = false;
  scene.start = () => { if (allowed) start(); };
  h.allow = () => { allowed = true; };
  // A device whose shader compile was slow before (remembered across visits) goes straight to the
  // poster: nothing more is done for the 3D until the entrance is over, so its curtain never waits.
  let slow = false;
  try { slow = localStorage.getItem('hyde:slow3d') === '1'; } catch { /* private mode */ }
  const remember = (v) => { try { if (v) localStorage.setItem('hyde:slow3d', '1'); else localStorage.removeItem('hyde:slow3d'); } catch { /* ignore */ } };
  let gpuMs = 0;
  const compile = async () => {
    await Promise.all(fonts.map((f) => Promise.resolve(document.fonts?.load(f)).catch(() => {})));
    prepare?.();
    const c0 = performance.now();
    try { await (ready ?? scene.compile?.()); } catch { /* render anyway */ }
    gpuMs = performance.now() - c0;
  };
  let go;
  h.compiled = slow ? new Promise((r) => { go = r; }).then(compile) : compile();
  h.startCompile = () => go?.();
  // past this point (ms since the page was requested) the curtain does not wait: draw nothing more
  // now (drawing the first frame can block the screen) and let the poster play the entrance
  const deadline = slow ? 0 : document.documentElement.classList.contains('hyde-quick') ? 1200 : 1900;
  if (slow) heroResolve(false);
  h.compiled
    .then(async () => {
      if (h.revealed || performance.now() > deadline) return false; // too late: the poster plays the entrance
      await frame();
      if (h.revealed || performance.now() > deadline) return false;
      scene.renderOnce?.();
      h.primed = true;
      return true;
    })
    // remember a device whose shader compile alone is slow (network time does not count)
    .then((ok) => { if (!slow) remember(gpuMs > 1200); return ok; })
    .catch(() => false)
    .then(heroResolve);
  return heroPrimedP;
}

const ENTER = 'opacity 1.8s cubic-bezier(.3,.6,.2,1), transform 1.8s cubic-bezier(.16,1,.3,1)';
/**
 * Called as the curtain lifts. Returns 'live' when the live scene plays the entrance,
 * 'poster' when the still does, or 'none' when the page has no hero scene.
 */
export function heroIn() {
  const h = hero;
  if (!h) { posterIn(); return 'none'; }
  h.revealed = true;
  if (!h.primed) { posterIn(); return 'poster'; }
  const { canvas, poster } = h;
  if (poster) poster.style.display = 'none';
  canvas.dataset.hydeShown = '1';
  openGate(); // the scene moves while the curtain finishes lifting
  h.allow();
  h.scene.start();
  if (reducedPref()) { canvas.style.opacity = ''; return 'live'; }
  canvas.style.transition = 'none';
  canvas.style.transform = 'scale(1.04)';
  posterDone = new Promise((r) => setTimeout(r, 1850));
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.style.transition = ENTER;
    canvas.style.opacity = '';
    canvas.style.transform = '';
    setTimeout(() => { canvas.style.transition = ''; }, 1900);
  }));
  return 'live';
}

/** Poster path only: once the entrance is over, bring the live scene in over the still. */
export async function heroHandOver() {
  const h = hero;
  if (!h || h.primed) return;
  h.startCompile?.();
  await h.compiled.catch(() => {});
  if (isLeaving()) return;
  h.allow();
  await crossOver(h.scene, h.canvas, h.poster, 0.7);
}

/**
 * Bring a freshly built scene in: wait for any fonts its textures use, compile its shaders,
 * draw the first frame, start it, then fade the canvas up from transparent.
 * @param {object|null} scene
 * @param {HTMLCanvasElement} canvas
 * @param {{ fonts?: string[], prepare?: () => void, ready?: Promise, fade?: number }} opts
 */
export async function warm(scene, canvas, { fonts = [], prepare, ready, fade } = {}) {
  if (!scene) return;
  const poster = canvas?.previousElementSibling?.classList.contains('stage-poster') ? canvas.previousElementSibling : null;
  // over a poster (the same picture), a short crossfade is invisible; without one, fade in slowly
  const t = fade ?? (poster ? 0.7 : 1.1);
  if (canvas) canvas.style.opacity = '0';
  await Promise.all(fonts.map((f) => Promise.resolve(document.fonts?.load(f)).catch(() => {})));
  prepare?.();
  try { await (ready ?? scene.compile?.()); } catch { /* render anyway */ }
  await crossOver(scene, canvas, poster, t);
}

/** Draw the first frame, start the scene, fade the canvas in over the poster (which is then hidden).
 *  The poster is placed per screen shape to match the live framing (posters.css), so a plain
 *  crossfade is enough. (An earlier version read the live frame back to fine-tune the poster's
 *  position; that readback stalled the main thread on slow GPUs and rarely moved anything.) */
async function crossOver(scene, canvas, poster, t) {
  if (poster) await posterDone; // never during the entrance
  await frame();
  scene.renderOnce?.();
  scene.start();
  await frame();
  if (!canvas) return;
  canvas.dataset.hydeShown = '1';
  canvas.style.transition = `opacity ${t}s ease`;
  canvas.style.opacity = '';
  setTimeout(() => {
    canvas.style.transition = '';
    if (poster) poster.style.visibility = 'hidden';
  }, t * 1000 + 100);
}

/** Resolves once the hero poster image (a CSS background) is decoded and ready to paint. */
export function posterReady() {
  const el = document.querySelector('.stage-poster');
  if (!el) return Promise.resolve();
  const m = getComputedStyle(el).backgroundImage.match(/url\(["']?(.+?)["']?\)/);
  if (!m) return Promise.resolve();
  const img = new Image();
  img.src = m[1];
  return (img.decode ? img.decode() : new Promise((r) => { img.onload = r; img.onerror = r; })).catch(() => {});
}
