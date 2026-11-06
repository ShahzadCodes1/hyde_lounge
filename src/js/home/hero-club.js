import { mediaUrl } from '../core/media.js';

/* ==========================================================================
   HERO — the club at night.
   · the facade photograph (CSS background, painted with the page) plays the entrance
   · the live footage of the same frame fades in over it once the entrance is over
   · scroll walks up to the entrance: the layers scale about the doorway, so the doorway is
     where the camera goes wherever it sits on screen (cover cropping moves it)
   Two framings: wide (wider than square) and tall (portrait), switched by aspect ratio in
   home.css. FRAMES gives each photograph's size and where its doorway is (fractions).
   ========================================================================== */

const FRAMES = {
  wide: { facade: { w: 2400, h: 1340, x: 0.497, y: 0.605 }, door: { w: 2400, h: 1340, x: 0.506, y: 0.56 }, video: 'hero-loop-wide.mp4' },
  tall: { facade: { w: 1080, h: 1935, x: 0.5, y: 0.553 }, door: { w: 1080, h: 1935, x: 0.515, y: 0.547 }, video: 'hero-loop-tall.mp4' },
};

/** Where (px) a point of a cover-fitted background lands inside a box. */
function coverPoint(box, img) {
  const k = Math.max(box.w / img.w, box.h / img.h);
  return { x: (box.w - img.w * k) / 2 + img.x * img.w * k, y: (box.h - img.h * k) / 2 + img.y * img.h * k };
}

/**
 * @param {HTMLElement} hero
 * @param {{ lite: boolean, reduced: boolean }} opts
 * @returns {{ play(): void, setVisible(on: boolean): void }}
 */
export function initHeroClub(hero, { reduced }) {
  const scene = hero.querySelector('[data-scene]');
  const facade = hero.querySelector('[data-facade]');
  const door = hero.querySelector('[data-door]');
  const video = hero.querySelector('[data-loop]');
  const tall = window.matchMedia('(max-aspect-ratio: 1/1)');
  const frames = () => (tall.matches ? FRAMES.tall : FRAMES.wide);

  // aim every layer's scaling at its doorway
  const place = () => {
    const box = { w: scene.clientWidth, h: scene.clientHeight };
    if (!box.w || !box.h) return;
    const f = frames();
    const a = coverPoint(box, f.facade);
    const b = coverPoint(box, f.door);
    facade.style.setProperty('--door-x', `${a.x.toFixed(1)}px`);
    facade.style.setProperty('--door-y', `${a.y.toFixed(1)}px`);
    door.style.transformOrigin = `${b.x.toFixed(1)}px ${b.y.toFixed(1)}px`;
    scene.style.setProperty('--doorway-y', `${((b.y / box.h) * 100).toFixed(1)}%`);
  };
  place();
  new ResizeObserver(place).observe(scene);

  // The footage: skipped for reduced motion and data-saving connections (the photograph stays).
  const conn = navigator.connection;
  const skipVideo = reduced || !video || conn?.saveData || /(^|-)2g$/.test(conn?.effectiveType || '');
  let wanted = false;   // the entrance is over: play when visible
  let visible = true;   // the landing is on screen
  const src = () => mediaUrl(frames().video);
  const sync = () => {
    if (skipVideo) return;
    if (wanted && visible && !document.hidden) {
      if (!video.getAttribute('src')) { video.src = src(); video.load(); }
      video.play().catch(() => {}); // autoplay refused (low-power mode): the photograph stays
    } else if (video.getAttribute('src')) video.pause();
  };
  video?.addEventListener('playing', () => video.classList.add('is-playing'));
  tall.addEventListener('change', () => {
    place();
    if (!skipVideo && video.getAttribute('src')) { video.classList.remove('is-playing'); video.src = src(); video.load(); sync(); }
  });
  document.addEventListener('visibilitychange', sync);

  // the door photograph is not needed for the first screen: fetch it after the entrance
  const readyDoor = () => door.classList.add('is-ready');

  return {
    play() { wanted = true; readyDoor(); sync(); },
    setVisible(on) { visible = on; if (!on) readyDoor(); sync(); },
  };
}
