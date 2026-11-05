import { track } from '../core/scenes.js';
import { gsap, ScrollTrigger } from '../core/smooth.js';
import { createPlateScene } from './plate-scene.js';

/* ==========================================================================
   Chapter 02 — Plate. Scroll choreography (progress 0 → 1 across the pinned section)
   0.00–0.10  the "Plate." chapter card lifts, the pendant light comes up
   0.08–0.22  copy rises in
   0.14–0.30  the brass cloche lifts off course 01; steam
   0.34–0.80  the table turns course by course (five courses)
   0.80–0.88  footage cards
   0.88–1.00  the lights close down to a spot: "Play."
   ========================================================================== */

export function initPlate({ lite, reduced }) {
  const section = document.querySelector('[data-plate]');
  if (!section) return { ready: Promise.resolve() };
  const canvas = section.querySelector('[data-plate-canvas]');
  const scene = track(createPlateScene(canvas, { lite }));

  const intro = section.querySelector('[data-plate-intro]');
  const next = section.querySelector('[data-plate-next]');
  const iris = section.querySelector('[data-iris]');
  const lines = section.querySelectorAll('[data-ql]');
  const reveals = section.querySelectorAll('[data-qr]');
  const cards = section.querySelectorAll('[data-qcard]');
  const courses = section.querySelectorAll('[data-course]');

  let current = -1;
  const setCourse = (i) => {
    if (i === current) return;
    current = i;
    courses.forEach((li) => li.classList.toggle('is-current', Number(li.dataset.course) === i));
  };

  if (reduced) {
    section.classList.add('is-live');
    gsap.set(intro, { display: 'none' });
    gsap.set([canvas, '.plate__veil'], { opacity: 1 });
    setCourse(0);
    if (scene) { scene.state.progress = 0.32; scene.renderOnce(); }
    return { ready: Promise.resolve() };
  }

  gsap.set(intro, { visibility: 'visible' });
  gsap.set(lines, { yPercent: 115 });
  gsap.set(reveals, { autoAlpha: 0, y: 26 });
  gsap.set(cards, { autoAlpha: 0, y: 140, rotateX: 28, rotateZ: (i) => [6, -5][i], scale: 0.86, transformOrigin: '50% 100%' });
  gsap.set(next, { visibility: 'hidden' });
  setCourse(0);

  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
  tl.to(intro, { yPercent: -35, autoAlpha: 0, duration: 0.08 }, 0.01)
    .to(canvas, { opacity: 1, duration: 0.08 }, 0.02)
    .to('.plate__veil', { opacity: 1, duration: 0.1 }, 0.08)
    .to(lines, { yPercent: 0, duration: 0.09, stagger: 0.025, ease: 'power3.out' }, 0.09)
    .to(reveals, { autoAlpha: 1, y: 0, duration: 0.07, stagger: 0.015, ease: 'power2.out' }, 0.12)
    .to(cards, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 0.08, stagger: 0.04, ease: 'power3.out' }, 0.8)
    .to(cards, { yPercent: (i) => [-16, -10][i], duration: 0.1 }, 0.86)
    .to('.plate__copy', { autoAlpha: 0, y: -30, duration: 0.04 }, 0.88)
    .fromTo(iris, { '--r': '150vmax' }, { '--r': '0vmax', duration: 0.08, ease: 'power2.in' }, 0.885)
    .set(next, { visibility: 'visible' }, 0.96)
    .fromTo(next.querySelector('[data-next-word]'), { yPercent: 115 }, { yPercent: 0, duration: 0.035, ease: 'power3.out' }, 0.96)
    .fromTo(next.querySelector('.eyebrow'), { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.03 }, 0.97)
    .to({}, { duration: 0.001 }, 1);

  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate(self) {
      const p = self.progress;
      tl.progress(p);
      if (scene) {
        scene.state.progress = p;
        setCourse(Math.round(scene.turnAt(p)));
      }
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
    onToggle: (self) => (self.isActive ? scene?.start() : scene?.stop()),
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
