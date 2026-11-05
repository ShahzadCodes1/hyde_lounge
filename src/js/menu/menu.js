import { boot } from '../core/app.js';
import { track, stageHero } from '../core/scenes.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch, getLenis } from '../core/smooth.js';
import { createMenuScene } from './menu-scene.js';
import { fadeInUpperZone } from '../core/zone.js';

/* ==========================================================================
   Menu page.
   · the hero scroll brings the camera down from the overhead table (overview 1 → 0)
   · each menu item, as it crosses the middle of the screen, is "served" on the stage
   · the Kitchen / Bar pills follow the reader and jump between the two halves
   ========================================================================== */

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
const canvas = document.querySelector('[data-menu-stage]');
const els = [...document.querySelectorAll('[data-item]')];
const items = els.map((el) => ({
  kind: el.dataset.kind,
  file: el.dataset.file,
  liquid: el.dataset.liquid,
  ice: el.dataset.ice === '1',
  foam: el.dataset.foam === '1',
}));

let scene = null;

const heroLines = document.querySelectorAll('[data-mhl]');
const heroReveals = document.querySelectorAll('[data-mh]');
gsap.set(heroLines, { yPercent: 115 });
gsap.set(heroReveals, { autoAlpha: 0, y: 20 });

boot('menu', {
  onReveal() {
    gsap.timeline()
      .to(heroLines, { yPercent: 0, duration: 1.2, ease: 'expo.out' }, 0.45)
      .to(heroReveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.7);
  },
});

// The table is set while the curtain is down (once this module has finished running), so it is
// live and moving the moment the curtain lifts.
queueMicrotask(() => {
  scene = track(createMenuScene(canvas, { items, lite }));
  if (!scene) document.documentElement.classList.add('no-webgl');
  build();
  stageHero(scene, canvas, { fonts: ['italic 300 100px "Cormorant Garamond"'], prepare: () => scene.refreshWord() });
});

function setActive(i) {
  els.forEach((el, k) => el.classList.toggle('is-active', k === i));
  scene?.setActive(i);
}

function build() {
  setActive(0);
  fadeInUpperZone('.mitem, .mcat__head, .mnote', { from: 0.7, to: 0.52 });

  // hero: overhead → serving height
  ScrollTrigger.create({
    trigger: '[data-mhero]',
    start: 'top top',
    end: 'bottom top',
    onUpdate(self) {
      if (scene) scene.state.overview = 1 - self.progress;
      document.body.classList.toggle('menu-listing', self.progress > 0.6);
    },
  });
  if (!reducedMotion) {
    gsap.to('.mhero__inner', { yPercent: -30, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-mhero]', start: 'top top', end: '60% top', scrub: true } });
  }

  // serve whichever item crosses the middle of the screen
  els.forEach((el, i) => {
    ScrollTrigger.create({
      trigger: el,
      start: 'top 62%',
      end: 'bottom 62%',
      onToggle: (self) => self.isActive && setActive(i),
    });
  });

  // Kitchen / Bar pills
  const pills = document.querySelectorAll('[data-jump]');
  document.querySelectorAll('[data-cat]').forEach((cat) => {
    ScrollTrigger.create({
      trigger: cat,
      start: 'top 50%',
      end: 'bottom 50%',
      onToggle: (self) => self.isActive && pills.forEach((p) => p.classList.toggle('is-current', p.dataset.jump === cat.dataset.cat)),
    });
  });
  pills.forEach((p) => p.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.getElementById(p.dataset.jump);
    const lenis = getLenis();
    if (lenis) lenis.scrollTo(target, { offset: -40, duration: 1.6 });
    else target.scrollIntoView({ behavior: 'smooth' });
  }));

  // stop rendering once the footer has covered the stage
  const foot = document.querySelector('[data-foot]');
  if (foot && scene) {
    ScrollTrigger.create({
      trigger: foot,
      start: 'top top',
      onEnter: () => scene.stop(),
      onLeaveBack: () => scene.start(),
    });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? scene?.stop() : scene?.start()));
}
