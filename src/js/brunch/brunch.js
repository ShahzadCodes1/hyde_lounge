import { boot, firstPaint } from '../core/app.js';
import { track, stageHero } from '../core/scenes.js';
import { softwareGL } from '../core/quality.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../core/smooth.js';
import { createBrunchScene } from './brunch-scene.js';
import { fadeInUpperZone } from '../core/zone.js';

/* ==========================================================================
   Brunch page.
   · hero scroll lifts the bottle in and tips it to pour into the top coupe
   · packages are pinned: scrolling through them fills the tower tier by tier
   · on the table: the stage dims behind plates that turn as you scroll
   · the afternoon: close on the bubbles in the top coupe
   · book Friday: pulled back to the whole, full tower
   ========================================================================== */

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
const canvas = document.querySelector('[data-brunch-stage]');
let scene = null;

const heroLines = document.querySelectorAll('[data-bhl]');
const heroReveals = document.querySelectorAll('[data-bh]');
gsap.set(heroLines, { yPercent: 115 });
gsap.set(heroReveals, { autoAlpha: 0, y: 20 });

boot('brunch', {
  onReveal() {
    gsap.timeline()
      .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 0.45)
      .to(heroReveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.7);
  },
});

// The tower is built while the curtain is down, so it is live the moment the curtain lifts.
firstPaint.then(() => { // after the curtain's first paint (see app.js), after boot() has set up the shell
  scene = track(createBrunchScene(canvas, { lite }));
  if (!scene && !softwareGL()) document.documentElement.classList.add('no-webgl'); // software WebGL keeps the poster
  if (reducedMotion) staticPage();
  else build();
  stageHero(scene, canvas, {
    fonts: ['italic 300 100px "Cormorant Garamond"', '300 100px "Cormorant Garamond"', '600 22px "Manrope"'],
    prepare: () => scene.refreshText(),
  });
});

function staticPage() {
  if (scene) { scene.state.tilt = 1; scene.state.fill = 1; scene.state.pack = 1; }
  document.querySelectorAll('[data-step]').forEach((s) => s.classList.add('is-active'));
}

function build() {
  const st = scene?.state;
  fadeInUpperZone('.bday__head, .bstep, .bcta');
  fadeInUpperZone('.bpack__head, .bpack__stack, .bpack__ticks', { from: 0.5, to: 0.32 });
  const veil = document.querySelector('[data-brunch-veil]');
  const dim = document.querySelector('[data-brunch-dim]');
  const ov = { pack: 0, table: 0, day: 0, cta: 0 };
  const overlays = () => {
    // the copy needs the left side darkened while it sits beside the tower; the plates need the whole stage dimmed
    veil.style.opacity = Math.min(1, ov.pack * (1 - ov.table) + ov.day);
    dim.style.opacity = Math.max(0, ov.table - ov.day);
  };
  const track = (trigger, start, end, fn) => ScrollTrigger.create({ trigger, start, end, onUpdate: (self) => { fn(self.progress); overlays(); } });

  /* hero: the bottle comes in and tips */
  track('[data-bhero]', 'top top', 'bottom 20%', (p) => { if (st) st.tilt = p; });
  gsap.to('.bhero__copy', { yPercent: -24, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-bhero]', start: 'top top', end: '55% top', scrub: true } });
  gsap.to('.bhero__cue', { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-bhero]', start: 'top top', end: '20% top', scrub: true } });

  /* packages: the tower fills as you read */
  const pack = document.querySelector('[data-bpack]');
  const pkgs = [...document.querySelectorAll('[data-pkg]')];
  const ticks = [...document.querySelectorAll('[data-tick]')];
  track(pack, 'top bottom', 'top top', (p) => { if (st) st.pack = p; ov.pack = p; });
  gsap.from('.bpack__head > *', { autoAlpha: 0, y: 30, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: pack, start: 'top 70%', end: 'top 10%', scrub: true } });
  let current = -1;
  const show = (i) => {
    if (i === current) return;
    const prev = pkgs[current], next = pkgs[i], down = i > current;
    current = i;
    if (prev) gsap.to(prev, { autoAlpha: 0, y: down ? -30 : 30, duration: 0.32, ease: 'power2.in', overwrite: true });
    gsap.fromTo(next, { autoAlpha: 0, y: down ? 40 : -40 }, { autoAlpha: 1, y: 0, duration: 0.8, delay: prev ? 0.3 : 0, ease: 'expo.out', overwrite: true });
  };
  show(0);
  ScrollTrigger.create({
    trigger: pack, start: 'top top', end: 'bottom bottom',
    onUpdate(self) {
      const q = self.progress;
      if (st) st.fill = Math.min(1, Math.max(0, (q - 0.04) / 0.86));
      show(Math.min(2, Math.floor(q * 3)));
      const tiers = [0.0, 0.18, 0.5].map((at) => (q - 0.04) / 0.86 > at + 0.02);
      ticks.forEach((t, k) => t.classList.toggle('is-on', tiers[k]));
    },
  });

  /* on the table: dim the stage; the plates turn as they pass */
  const table = document.querySelector('[data-btable]');
  track(table, 'top 90%', 'top 25%', (p) => { ov.table = p; });
  gsap.from('.btable__head > *', { autoAlpha: 0, y: 40, stagger: 0.1, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.btable__head', start: 'top 80%' } });
  document.querySelectorAll('[data-plate]').forEach((pl, i) => {
    const spin = Number(pl.dataset.spin);
    const img = pl.querySelector('img');
    gsap.fromTo(img, { rotate: -spin }, { rotate: spin, ease: 'none', scrollTrigger: { trigger: pl, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo(pl, { yPercent: 10 + (i % 3) * 6 }, { yPercent: -10 - (i % 3) * 6, ease: 'none', scrollTrigger: { trigger: pl, start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.from(pl, { autoAlpha: 0, scale: 0.86, duration: 1.4, ease: 'expo.out', scrollTrigger: { trigger: pl, start: 'top 90%' } });
  });

  /* the afternoon: in close on the bubbles */
  const day = document.querySelector('[data-bday]');
  track(day, 'top bottom', 'top 30%', (p) => { if (st) st.macro = p; ov.day = p; });
  ScrollTrigger.create({ trigger: day, start: 'top top', end: 'bottom bottom', onUpdate: (self) => { if (st) st.orbit = self.progress; } });
  gsap.from('.bday__head > *', { autoAlpha: 0, y: 30, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.bday__head', start: 'top 80%' } });
  const steps = [...document.querySelectorAll('[data-step]')];
  steps.forEach((el, i) => {
    ScrollTrigger.create({
      trigger: el, start: 'top 62%', end: 'bottom 62%',
      onToggle: (self) => self.isActive && steps.forEach((s, k) => s.classList.toggle('is-active', k === i)),
    });
  });

  /* book Friday: pull back to the whole tower */
  track('[data-bcta]', 'top bottom', 'top 25%', (p) => { if (st) st.wide = p; ov.cta = p; });
  gsap.from('[data-bc]', { autoAlpha: 0, y: 34, stagger: 0.09, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '[data-bcta]', start: 'top 70%' } });

  /* stop rendering once the footer covers the stage */
  const foot = document.querySelector('[data-foot]');
  if (foot && scene) {
    ScrollTrigger.create({ trigger: foot, start: 'top top', onEnter: () => scene.stop(), onLeaveBack: () => scene.start() });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? scene?.stop() : scene?.start()));
}
