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

/**
 * Bring a freshly built scene in: wait for any fonts its textures use, compile its shaders,
 * draw the first frame, start it, then fade the canvas up from transparent.
 * The canvas stays invisible until there is a finished picture, so the 3D never "pops".
 * @param {object|null} scene
 * @param {HTMLCanvasElement} canvas
 * @param {{ fonts?: string[], prepare?: () => void, ready?: Promise, fade?: number }} opts
 */
export async function warm(scene, canvas, { fonts = [], prepare, ready, fade } = {}) {
  if (!scene) return;
  const poster = canvas?.previousElementSibling?.classList.contains('stage-poster') ? canvas.previousElementSibling : null;
  // over a poster (the same picture), a short crossfade is invisible; without one, fade in slowly
  const t = fade ?? (poster ? 0.6 : 1.1);
  if (canvas) canvas.style.opacity = '0';
  await Promise.all(fonts.map((f) => Promise.resolve(document.fonts?.load(f)).catch(() => {})));
  prepare?.();
  try { await (ready ?? scene.compile?.()); } catch { /* render anyway */ }
  if (poster) await posterDone; // hold the hand-over until the poster's entrance is over
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
