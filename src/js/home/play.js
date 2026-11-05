import { track } from '../core/scenes.js';
import { gsap, ScrollTrigger } from '../core/smooth.js';
import { createStageScene } from './stage-scene.js';

/* ==========================================================================
   Chapter 03 — Play. Scroll choreography (progress 0 → 1 across the pinned section)
   0.00–0.10  the "Play." card lifts; the spotlight snaps on (with a flicker)
   0.08–0.24  copy rises in; the coloured stage lights come up
   0.06–0.88  the camera circles out from the capsule to the whole stand
   0.45–0.70  footage from the room floats in
   0.88–1.00  hold, then the footer arrives
   ========================================================================== */

export function initPlay({ lite, reduced }) {
  const section = document.querySelector('[data-play]');
  if (!section) return { ready: Promise.resolve() };
  const canvas = section.querySelector('[data-play-canvas]');
  const scene = track(createStageScene(canvas, { lite }));

  const intro = section.querySelector('[data-play-intro]');
  const lines = section.querySelectorAll('[data-yl]');
  const reveals = section.querySelectorAll('[data-yr]');
  const cards = section.querySelectorAll('[data-ycard]');
  const videos = section.querySelectorAll('video[data-src]');
  const asset = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');
  const loadVideos = () => videos.forEach((v) => { if (!v.getAttribute('src')) { v.src = asset(v.dataset.src); v.load(); } });
  const playVideos = (on) => videos.forEach((v) => (on ? v.play().catch(() => {}) : v.pause()));

  if (reduced) {
    section.classList.add('is-live');
    gsap.set(intro, { display: 'none' });
    gsap.set([canvas, '.play__veil'], { opacity: 1 });
    if (scene) { scene.state.progress = 0.6; scene.renderOnce(); }
    loadVideos();
    return { ready: Promise.resolve() };
  }

  gsap.set(intro, { visibility: 'inherit' }); // inherit: stays hidden with its section until the section pins
  gsap.set(lines, { yPercent: 115 });
  gsap.set(reveals, { autoAlpha: 0, y: 26 });
  gsap.set(cards, { autoAlpha: 0, y: 140, rotateX: 28, rotateZ: (i) => [5, -6, -3, 4][i], scale: 0.86, transformOrigin: '50% 100%' });

  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
  tl.to(intro, { yPercent: -35, autoAlpha: 0, duration: 0.08 }, 0.01)
    .to(canvas, { opacity: 1, duration: 0.05 }, 0.02)
    .to('.play__veil', { opacity: 1, duration: 0.1 }, 0.08)
    .to(lines, { yPercent: 0, duration: 0.09, stagger: 0.025, ease: 'power3.out' }, 0.09)
    .to(reveals, { autoAlpha: 1, y: 0, duration: 0.07, stagger: 0.015, ease: 'power2.out' }, 0.12)
    .to(cards, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 0.1, stagger: 0.05, ease: 'power3.out' }, 0.45)
    .to(cards, { yPercent: (i) => [-14, -8, -18, -10][i], duration: 0.3 }, 0.6)
    .to({}, { duration: 0.001 }, 1);

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate(self) {
      tl.progress(self.progress);
      if (scene) scene.state.progress = self.progress;
    },
    onToggle(self) {
      section.classList.toggle('is-live', self.isActive || self.progress >= 1);
    },
    onLeaveBack() { section.classList.remove('is-live'); },
  });

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom top',
    onToggle(self) {
      if (self.isActive) { scene?.start(); loadVideos(); playVideos(true); }
      else { scene?.stop(); playVideos(false); }
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) scene?.stop();
    else if (section.classList.contains('is-live')) scene?.start();
  });

  const ready = new Promise((resolve) => {
    if (!scene) return resolve();
    document.fonts?.load('italic 300 100px "Cormorant Garamond"').catch(() => {}).finally(() => {
      scene.refreshWord();
      Promise.resolve(scene.compile()).finally(() => { scene.renderOnce(); resolve(); });
    });
  });
  return { ready };
}
