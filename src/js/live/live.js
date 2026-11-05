import { boot, afterCurtain } from '../core/app.js';
import { track, warm } from '../core/scenes.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../core/smooth.js';
import { createLiveScene } from './live-scene.js';
import { fadeInUpperZone } from '../core/zone.js';

/* ==========================================================================
   Live Nights page.
   · hero scroll cues the record: the arm swings over and the needle drops
   · the week is pinned; the seven nights slide across and each tints the stage
   · on stage: the camera goes in close on the needle; each name changes the light
   · from the floor: footage over the record seen from above
   ========================================================================== */

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
const canvas = document.querySelector('[data-live-stage]');
let scene = null;

const nights = [...document.querySelectorAll('[data-night]')];
const artists = [...document.querySelectorAll('[data-artist]')];
nights.forEach((n) => n.style.setProperty('--hue', n.dataset.hue));

const heroLines = document.querySelectorAll('[data-lhl]');
const heroReveals = document.querySelectorAll('[data-lh]');
gsap.set(heroLines, { yPercent: 115 });
gsap.set(heroReveals, { autoAlpha: 0, y: 20 });

boot('live', {
  onReveal() {
    gsap.timeline()
      .to(heroLines, { yPercent: 0, duration: 1.2, stagger: 0.12, ease: 'expo.out' }, 0.05)
      .to(heroReveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.25);
    initClips();
  },
});

// The deck is built once the curtain is up; it fades in when its first frame is ready.
afterCurtain(() => {
  if (canvas) canvas.style.opacity = '0';
  scene = track(createLiveScene(canvas, { lite }));
  if (!scene) document.documentElement.classList.add('no-webgl');
  else scene.setTint(nights[0].dataset.hue, true);
  if (reducedMotion) staticPage();
  else build();
  warm(scene, canvas, {
    fonts: ['italic 300 100px "Cormorant Garamond"', '300 100px "Cormorant Garamond"', '600 30px "Manrope"'],
    prepare: () => scene.refreshText(),
  });
});

const setCurrent = (list, i, cls) => list.forEach((el, k) => el.classList.toggle(cls, k === i));

/* ---------- reduced motion: needle already down, nothing pinned ---------- */
function staticPage() {
  if (!scene) return;
  scene.state.drop = 1;
  scene.state.week = 1;
  document.body.classList.add('is-playing');
  setCurrent(nights, -1, 'is-current');
  artists.forEach((a) => a.classList.add('is-active'));
}

function build() {
  const st = scene?.state;
  fadeInUpperZone('.lstage__head, .lartist');
  const veil = document.querySelector('[data-live-veil]');
  const dim = document.querySelector('[data-live-dim]');
  // On phones the close-up record fills the screen behind the names, so it is dimmed while they read.
  const portrait = window.matchMedia('(max-aspect-ratio: 1/1)');
  const ov = { macro: 0, film: 0 };
  const dimNow = () => { dim.style.opacity = Math.max(portrait.matches ? ov.macro * (1 - ov.film) * 0.55 : 0, ov.film); };

  // the needle travels across side A over the whole page
  ScrollTrigger.create({
    trigger: '.live-page', start: 'top top', end: 'bottom bottom',
    onUpdate: (self) => { if (st) st.groove = self.progress; },
  });

  /* hero: cue the record */
  ScrollTrigger.create({
    trigger: '[data-lhero]', start: 'top top', end: 'bottom 15%',
    onUpdate(self) {
      if (st) st.drop = self.progress;
      document.body.classList.toggle('is-playing', self.progress > 0.88);
    },
  });
  gsap.to('.lhero__copy', { yPercent: -24, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-lhero]', start: 'top top', end: '55% top', scrub: true } });
  gsap.to('.lhero__cue', { autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: '[data-lhero]', start: 'top top', end: '20% top', scrub: true } });

  /* the week: camera settles, then the nights slide across */
  const week = document.querySelector('[data-lweek]');
  const track = document.querySelector('[data-ltrack]');
  const num = document.querySelector('[data-week-num]');
  const bar = document.querySelector('[data-week-bar]');
  ScrollTrigger.create({
    trigger: week, start: 'top bottom', end: 'top top',
    onUpdate: (self) => { if (st) st.week = self.progress; },
  });
  gsap.from('.lweek__head > *', { autoAlpha: 0, y: 30, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: week, start: 'top 70%', end: 'top 10%', scrub: true } });
  gsap.from('.lweek__rail', { xPercent: 30, autoAlpha: 0, ease: 'none', scrollTrigger: { trigger: week, start: 'top 60%', end: 'top top', scrub: true } });

  let current = -1;
  const travel = () => Math.max(0, track.scrollWidth - window.innerWidth);
  gsap.to(track, {
    x: () => -travel(),
    ease: 'none',
    scrollTrigger: {
      trigger: week, start: 'top top', end: 'bottom bottom', scrub: 0.6, invalidateOnRefresh: true,
      onUpdate(self) {
        bar.style.transform = `scaleX(${self.progress})`;
        const i = Math.min(nights.length - 1, Math.round(self.progress * (nights.length - 1)));
        if (i === current) return;
        current = i;
        setCurrent(nights, i, 'is-current');
        num.textContent = String(i + 1).padStart(2, '0');
        scene?.setTint(nights[i].dataset.hue);
      },
    },
  });
  setCurrent(nights, 0, 'is-current');
  current = 0;

  /* on stage: in close on the needle, each name relights the room */
  const stageSec = document.querySelector('[data-lstage]');
  ScrollTrigger.create({
    trigger: stageSec, start: 'top bottom', end: 'top 25%',
    onUpdate: (self) => {
      if (st) st.macro = self.progress;
      veil.style.opacity = self.progress;
      ov.macro = self.progress; dimNow();
    },
  });
  artists.forEach((el, i) => {
    ScrollTrigger.create({
      trigger: el, start: 'top 62%', end: 'bottom 62%',
      onToggle(self) {
        if (!self.isActive) return;
        setCurrent(artists, i, 'is-active');
        scene?.setTint(el.dataset.hue);
      },
    });
  });
  // back up into the week: restore that night's colour
  ScrollTrigger.create({ trigger: stageSec, start: 'top 62%', onLeaveBack: () => scene?.setTint(nights[current].dataset.hue) });
  gsap.from('.lstage__head > *', { autoAlpha: 0, y: 30, stagger: 0.1, duration: 1.1, ease: 'expo.out', scrollTrigger: { trigger: '.lstage__head', start: 'top 80%' } });

  /* from the floor: rise to the overhead view, dim the stage behind the footage */
  const film = document.querySelector('[data-lfilm]');
  ScrollTrigger.create({
    trigger: film, start: 'top bottom', end: 'top 15%',
    onUpdate(self) {
      if (st) st.top = self.progress;
      ov.film = self.progress; dimNow();
      veil.style.opacity = 1 - self.progress;
    },
  });
  gsap.from('.lfilm__head > *', { autoAlpha: 0, y: 40, stagger: 0.1, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '.lfilm__head', start: 'top 80%' } });
  document.querySelectorAll('[data-clip]').forEach((clip) => {
    gsap.fromTo(clip, { yPercent: Number(clip.dataset.speed) }, {
      yPercent: -Number(clip.dataset.speed), ease: 'none',
      scrollTrigger: { trigger: clip, start: 'top bottom', end: 'bottom top', scrub: true },
    });
    gsap.from(clip, { autoAlpha: 0, y: 60, duration: 1.3, ease: 'expo.out', scrollTrigger: { trigger: clip, start: 'top 88%' } });
  });

  /* tonight */
  gsap.from('[data-lc]', { autoAlpha: 0, y: 34, stagger: 0.09, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: '[data-lcta]', start: 'top 70%' } });
  ScrollTrigger.create({ trigger: '[data-lcta]', start: 'top 60%', onEnter: () => scene?.setTint('#c4532e'), onLeaveBack: () => scene?.setTint(artists[artists.length - 1].dataset.hue) });

  /* stop rendering once the footer covers the stage */
  const foot = document.querySelector('[data-foot]');
  if (foot && scene) {
    ScrollTrigger.create({ trigger: foot, start: 'top top', onEnter: () => scene.stop(), onLeaveBack: () => scene.start() });
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? scene?.stop() : scene?.start()));
}

/* ---------- footage: load when near, play only while visible ---------- */
function initClips() {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      const fig = e.target, v = fig.querySelector('video');
      if (e.isIntersecting) {
        fig.classList.add('is-in');
        if (!v.src && v.dataset.src) v.src = v.dataset.src;
        if (!reducedMotion) v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, { rootMargin: '10% 0px' });
  document.querySelectorAll('[data-clip]').forEach((c) => io.observe(c));
}
