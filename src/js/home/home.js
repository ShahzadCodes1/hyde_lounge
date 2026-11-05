import { boot, afterCurtain } from '../core/app.js';
import { track, stageHero, isLeaving } from '../core/scenes.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../core/smooth.js';
import { createHeroScene } from './hero-scene.js';
import { initPour } from './pour.js';
import { initPlate } from './plate.js';
import { initPlay } from './play.js';

const hero = document.querySelector('[data-hero]');
const canvas = document.querySelector('[data-hero-canvas]');
const lines = hero.querySelectorAll('[data-line]');
const reveals = hero.querySelectorAll('[data-reveal]');

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
let scene = null;

// Hold the copy in its pre-intro state while the loader is up.
gsap.set(lines, { yPercent: 115 });
gsap.set(reveals, { autoAlpha: 0, y: 24 });

boot('home', {
  onReveal(mode) {
    // live: the ring lights up as the entrance; on the poster path it is already lit (the poster is)
    if (scene && mode === 'live' && !reducedMotion) gsap.to(scene.state, { intro: 1, duration: 2.6, ease: 'power1.inOut' });
    else if (scene) scene.state.intro = 1;
    playIntro();
    if (reducedMotion) gsap.set('[data-chapter]', { display: 'none' });
  },
});

// The ring is built while the curtain is down (once this module has run), so it is live and lights
// up as the curtain lifts. The three chapters below build one after another once the entrance is
// over, each once the one before is ready, so they never compete with the ring (or each other).
queueMicrotask(() => {
  scene = track(createHeroScene(canvas, { lite, reduced: reducedMotion }));
  if (!scene) document.documentElement.classList.add('no-webgl');
  stageHero(scene, canvas, { ready: scene?.ready });
});

afterCurtain(() => {
  if (!reducedMotion) buildScroll();
  // stop the chain if the guest is already leaving
  const later = (fn) => new Promise((r) => setTimeout(() => r(isLeaving() ? null : fn()), 250));
  later(() => initPour({ lite, reduced: reducedMotion }).ready)
    .then(() => later(() => initPlate({ lite, reduced: reducedMotion }).ready))
    .then(() => later(() => initPlay({ lite, reduced: reducedMotion }).ready))
    .then(() => { if (!isLeaving()) ScrollTrigger.refresh(); });
});

/* ---------- intro: the sign lights up, copy rises ---------- */
function playIntro() {
  const tl = gsap.timeline();
  tl.to(lines, { yPercent: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out' }, 0.45)
    .to(reveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.7);
}

/* ---------- scroll: copy clears, camera dives through the ring, chapter 01 arrives ---------- */
function buildScroll() {
  const chapter = hero.querySelector('[data-chapter]');

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      onUpdate(self) {
        if (scene) scene.state.progress = self.progress;
      },
    },
  });

  tl.to('.hero__left', { yPercent: -35, autoAlpha: 0, duration: 0.22 }, 0)
    .to('.hero__right', { yPercent: -25, autoAlpha: 0, duration: 0.18 }, 0.03)
    .to('[data-hero-meta]', { autoAlpha: 0, duration: 0.1 }, 0.05)
    .to('.hero__veil', { autoAlpha: 0, duration: 0.25 }, 0.12)
    .set(chapter, { visibility: 'visible' }, 0.74)
    .fromTo(chapter.querySelector('[data-chapter-word]'), { yPercent: 115 }, { yPercent: 0, duration: 0.14, ease: 'power3.out' }, 0.78)
    .fromTo(chapter.querySelector('.eyebrow'), { autoAlpha: 0, y: 16 }, { autoAlpha: 0.85, y: 0, duration: 0.08 }, 0.84)
    .to({}, { duration: 0.001 }, 1);

  // Only render WebGL while the hero is on screen (Chapter 01 covers it once the hero releases).
  if (scene) {
    ScrollTrigger.create({
      trigger: hero,
      start: 'top bottom',
      end: 'bottom bottom',
      onToggle: (self) => (self.isActive ? scene.start() : scene.stop()),
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) scene.stop();
      else if (window.scrollY < hero.offsetHeight - window.innerHeight) scene.start();
    });
  }
}
