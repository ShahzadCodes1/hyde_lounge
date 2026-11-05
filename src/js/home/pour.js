import { track } from '../core/scenes.js';
import { gsap, ScrollTrigger } from '../core/smooth.js';
import { createPourScene } from './pour-scene.js';

/* ==========================================================================
   Chapter 01 — Pour. Scroll choreography (progress 0 → 1 across the pinned section)
   0.00–0.10  the "Pour." chapter card lifts away, the glass drops in
   0.08–0.24  copy rises in
   0.17–0.63  the pour: stream, rising cocktail, droplets
   0.58–0.76  foam crown, cherries drop in
   0.60–0.82  media cards float in around the glass
   0.84–1.00  a terracotta-led liquid wipe carries us into Chapter 02
   ========================================================================== */

export function initPour({ lite, reduced }) {
  const section = document.querySelector('[data-pour]');
  if (!section) return { ready: Promise.resolve() };
  const canvas = section.querySelector('[data-pour-canvas]');
  const scene = track(createPourScene(canvas, { lite }));

  const intro = section.querySelector('[data-pour-intro]');
  const next = section.querySelector('[data-pour-next]');
  const lines = section.querySelectorAll('[data-pl]');
  const reveals = section.querySelectorAll('[data-pr]');
  const cards = section.querySelectorAll('[data-card]');
  const wipeA = section.querySelector('[data-wipe-a]');
  const wipeB = section.querySelector('[data-wipe-b]');

  // videos load only once their card is about to be seen
  const videos = section.querySelectorAll('video[data-src]');
  const asset = (path) => import.meta.env.BASE_URL + path.replace(/^\//, '');
  const loadVideos = () => videos.forEach((v) => { if (!v.getAttribute('src')) { v.src = asset(v.dataset.src); v.load(); } });
  const playVideos = (on) => videos.forEach((v) => (on ? v.play().catch(() => {}) : v.pause()));

  if (reduced) {
    section.classList.add('is-live');
    gsap.set(intro, { display: 'none' });
    gsap.set('.pour__veil', { opacity: 1 });
    if (scene) { scene.state.progress = 0.8; scene.renderOnce(); }
    loadVideos();
    return { ready: Promise.resolve() };
  }

  gsap.set(intro, { visibility: 'inherit' }); // inherit: stays hidden with its section until the section pins
  gsap.set(lines, { yPercent: 115 });
  gsap.set(reveals, { autoAlpha: 0, y: 26 });
  gsap.set(cards, { autoAlpha: 0, y: 140, rotateX: 28, rotateZ: (i) => [-8, 7, -4][i], scale: 0.86, transformOrigin: '50% 100%' });
  gsap.set(next, { visibility: 'hidden' });

  // liquid wave: a curved front that rises from the bottom; `lead` keeps the terracotta just ahead
  const wave = (y, amp, phase) => {
    const c1 = y - amp * Math.sin(phase), c2 = y + amp * Math.cos(phase);
    return `M0 100 L0 ${y} C 30 ${c1}, 70 ${c2}, 100 ${y} L100 100 Z`;
  };
  const setWipe = (w) => {
    const yA = 108 - w * 120; // leading terracotta layer
    const yB = 116 - w * 124; // night layer follows
    const ampA = Math.sin(Math.PI * Math.min(1, w * 1.1)) * 14;
    const ampB = Math.sin(Math.PI * w) * 12;
    wipeA.setAttribute('d', wave(yA, ampA, w * 3));
    wipeB.setAttribute('d', wave(yB, ampB, w * 3 + 1.2));
  };
  setWipe(0);

  const tl = gsap.timeline({ defaults: { ease: 'none' }, paused: true });
  tl.to(intro, { yPercent: -35, autoAlpha: 0, duration: 0.08 }, 0.01)
    .to('.pour__veil', { opacity: 1, duration: 0.1 }, 0.08)
    .to(lines, { yPercent: 0, duration: 0.09, stagger: 0.025, ease: 'power3.out' }, 0.1)
    .to(reveals, { autoAlpha: 1, y: 0, duration: 0.07, stagger: 0.015, ease: 'power2.out' }, 0.13)
    .to(cards, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 0.12, stagger: 0.045, ease: 'power3.out' }, 0.6)
    .to(cards, { yPercent: (i) => [-14, -22, -9][i], duration: 0.2 }, 0.78)
    .to('.pour__copy', { autoAlpha: 0, y: -30, duration: 0.06 }, 0.84)
    .to({ w: 0 }, { w: 1, duration: 0.13, onUpdate() { setWipe(this.targets()[0].w); } }, 0.86)
    .set(next, { visibility: 'inherit' }, 0.95)
    .fromTo(next.querySelector('[data-next-word]'), { yPercent: 115 }, { yPercent: 0, duration: 0.05, ease: 'power3.out' }, 0.95)
    .fromTo(next.querySelector('.eyebrow'), { autoAlpha: 0 }, { autoAlpha: 0.85, duration: 0.03 }, 0.97)
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

  // only render / play while the chapter is on screen
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

  // warm the shaders up front so the first pinned frame does not hitch
  const ready = new Promise((resolve) => {
    if (!scene) return resolve();
    document.fonts?.load('italic 300 100px "Cormorant Garamond"').catch(() => {}).finally(() => {
      scene.refreshWord();
      Promise.resolve(scene.compile()).finally(() => { scene.renderOnce(); resolve(); });
    });
  });
  return { ready };
}
