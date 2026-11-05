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
  h.compiled = (async () => {
    await Promise.all(fonts.map((f) => Promise.resolve(document.fonts?.load(f)).catch(() => {})));
    prepare?.();
    try { await (ready ?? scene.compile?.()); } catch { /* render anyway */ }
  })();
  // past this point (ms since the page was requested) the curtain does not wait: draw nothing more
  // now (drawing the first frame can block the screen) and let the poster play the entrance
  const deadline = document.documentElement.classList.contains('hyde-quick') ? 1400 : 2700;
  h.compiled
    .then(async () => {
      if (h.revealed || performance.now() > deadline) return false; // too late: the poster plays the entrance
      await frame();
      if (h.revealed || performance.now() > deadline) return false;
      scene.renderOnce?.();
      h.primed = true;
      return true;
    })
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
  await h.compiled.catch(() => {});
  if (isLeaving()) return;
  await crossOver(h.scene, h.canvas, h.poster, 0.7);
}

/**
 * Bring a freshly built scene in: wait for any fonts its textures use, compile its shaders,
 * draw the first frame, start it, then fade the canvas up from transparent.
 * Over a poster, the first live frame is compared with the poster as it is shown. The poster is a
 * still rendered at one screen shape; on a screen of another shape (a phone with browser bars,
 * a resized window) the live camera frames the scene a little differently. If so, the poster
 * glides into the live framing first, then the live canvas crosses over a matching picture.
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

/** Draw the first frame, line the poster up with it if needed, start the scene, fade the canvas in. */
async function crossOver(scene, canvas, poster, t) {
  if (poster) await posterDone; // never during the entrance
  const img = poster && canvas ? await posterImage(poster) : null;
  await frame();
  scene.renderOnce?.();
  // read the frame just drawn (same task, before the browser presents it)
  const t0 = performance.now();
  const fit = img ? align(poster, img, canvas) : null;
  if (canvas) canvas.dataset.hydeFit = `${fit ? `${fit.s} ${fit.x} ${fit.y}` : 'none'} · ${Math.round(performance.now() - t0)}ms`;
  if (fit && !isLeaving()) {
    poster.style.transformOrigin = '0 0';
    poster.style.transition = 'transform 0.9s cubic-bezier(.45,0,.2,1)';
    poster.style.transform = `translate(${fit.x}px, ${fit.y}px) scale(${fit.s})`;
    await new Promise((r) => setTimeout(r, 950));
  }
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

const bgUrl = (el) => (getComputedStyle(el).backgroundImage.match(/url\(["']?(.+?)["']?\)/) || [])[1];
async function posterImage(el) {
  const url = bgUrl(el);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try { await img.decode(); } catch { return null; }
  return img;
}

/**
 * Where the poster has to move so it lines up with the live frame: translate (CSS px) and scale
 * about its top-left corner. Found by comparing small greyscale copies of both pictures.
 * Returns null when they already line up, or when no move clearly improves the match.
 */
function align(el, img, canvas) {
  try {
    const W = el.clientWidth, H = el.clientHeight;
    if (!W || !H || !canvas.width) return null;
    const live = (w) => grey(w, Math.round((w * H) / W), (c) => c.drawImage(canvas, 0, 0, c.canvas.width, c.canvas.height));
    const shown = (w) => grey(w, Math.round((w * H) / W), (c) => {
      // draw the poster exactly as CSS shows it (background-size / -position)
      const cw = c.canvas.width, ch = c.canvas.height, iw = img.naturalWidth, ih = img.naturalHeight;
      const cs = getComputedStyle(el);
      const size = cs.backgroundSize;
      const k = size.startsWith('100%') ? cw / iw : size.startsWith('auto 100%') ? ch / ih : Math.max(cw / iw, ch / ih);
      const [px, py] = cs.backgroundPosition.split(' ').map((v) => (v.endsWith('%') ? parseFloat(v) / 100 : 0.5));
      c.fillStyle = cs.backgroundColor; c.fillRect(0, 0, cw, ch);
      c.drawImage(img, px * (cw - iw * k), py * (ch - ih * k), iw * k, ih * k);
    });
    // coarse search on a small copy, then refine on a larger one
    let w = 48, A = shown(w), B = live(w);
    const base = diff(A, B, 1, 0, 0);
    let best = { e: base, s: 1, x: 0, y: 0 };
    const h = A.h;
    for (let s = 0.8; s <= 1.25; s += 0.02) {
      for (let x = -0.15 * w; x <= 0.15 * w; x += 1) {
        for (let y = -0.15 * h; y <= 0.15 * h; y += 1) {
          const e = diff(A, B, s, x, y, best.e);
          if (e < best.e) best = { e, s, x, y };
        }
      }
    }
    const r = 3; const w2 = w * r; A = shown(w2); B = live(w2);
    let fine = { e: diff(A, B, best.s, best.x * r, best.y * r), s: best.s, x: best.x * r, y: best.y * r };
    const fineBase = diff(A, B, 1, 0, 0);
    for (let s = best.s - 0.02; s <= best.s + 0.02; s += 0.004) {
      for (let x = best.x * r - 3; x <= best.x * r + 3; x += 0.75) {
        for (let y = best.y * r - 3; y <= best.y * r + 3; y += 0.75) {
          const e = diff(A, B, s, x, y, fine.e);
          if (e < fine.e) fine = { e, s, x, y };
        }
      }
    }
    const px = W / w2;
    const out = { s: +fine.s.toFixed(4), x: +(fine.x * px).toFixed(1), y: +(fine.y * px).toFixed(1) };
    // move only when it clearly helps and is more than a hair
    if (fine.e > fineBase * 0.85) return null;
    if (Math.abs(out.s - 1) < 0.004 && Math.abs(out.x) < 1.5 && Math.abs(out.y) < 1.5) return null;
    return out;
  } catch { return null; }
}

let scratch;
function grey(w, h, draw) {
  scratch = scratch || document.createElement('canvas');
  scratch.width = w; scratch.height = h;
  const c = scratch.getContext('2d', { willReadFrequently: true });
  c.imageSmoothingQuality = 'high';
  draw(c);
  const d = c.getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
  return { g, w, h };
}

/** Mean difference between the live frame B and the poster A moved by (x, y) and scaled by s. */
function diff(A, B, s, x, y, stop = Infinity) {
  const { w, h } = B; let sum = 0, n = 0;
  const limit = stop * (w * h) / 4;
  for (let j = 0; j < h; j += 2) {
    const sy = Math.round((j - y) / s);
    const row = Math.min(h - 1, Math.max(0, sy)) * w;
    for (let i = 0; i < w; i += 2) {
      const sx = Math.min(w - 1, Math.max(0, Math.round((i - x) / s)));
      sum += Math.abs(A.g[row + sx] - B.g[j * w + i]); n++;
    }
    if (sum > limit) return Infinity; // already worse than the best so far
  }
  return sum / n;
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
