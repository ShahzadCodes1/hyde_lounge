import { boot, afterCurtain, firstPaint } from '../core/app.js';
import { stageHero, isLeaving } from '../core/scenes.js';
import { gsap, ScrollTrigger, reducedMotion, isTouch } from '../core/smooth.js';
import { initHeroClub } from './hero-club.js';
import { initPour } from './pour.js';
import { initPlate } from './plate.js';
import { initPlay } from './play.js';

const hero = document.querySelector('[data-hero]');
const lines = hero.querySelectorAll('[data-line]');
const reveals = hero.querySelectorAll('[data-reveal]');

const lite = isTouch || window.innerWidth < 768 || (navigator.hardwareConcurrency || 8) <= 4;
let club = null;
let chapters = [];

// Hold the copy in its pre-intro state while the loader is up.
gsap.set(lines, { yPercent: 115 });
gsap.set(reveals, { autoAlpha: 0, y: 24 });

boot('home', {
  onReveal() {
    // the club photograph fades and settles in (posterIn, scenes.js) while the copy rises
    playIntro();
    if (reducedMotion) gsap.set('[data-chapter]', { display: 'none' });
  },
});

// The landing is the club itself: a photograph painted with the page (it plays the entrance) and
// the live footage of the same frame, which fades in once the entrance is over. There is no 3D on
// the landing any more, so the curtain never waits for one (stageHero(null) says so).
firstPaint.then(() => { // after the curtain's first paint (see app.js), after boot() has set up the shell
  stageHero(null, null);
  club = initHeroClub(hero, { lite, reduced: reducedMotion });
  // The scroll choreography of the hero and the three chapters is set up now, behind the curtain
  // (it is light), so every section works and shows its copy even if the guest scrolls before a
  // chapter's 3D has been built.
  if (!reducedMotion) buildScroll();
  chapters = [initPour, initPlate, initPlay].map((init) => init({ lite, reduced: reducedMotion }));
});
// the footage starts after the entrance, so it never competes with it
afterCurtain(() => club?.play(), { delay: 0 });

// The chapters' 3D scenes are built one at a time, in order, never during the hero entrance and
// only while the guest is not scrolling (a build is the heaviest work on the page and would hitch
// the scroll). On phones and tablets a chapter is built only once the guest is within two screens
// of it, so a guest who never scrolls that far never pays for it (download, GPU memory, battery).
// A chapter the guest reaches before its turn is built at once (see each chapter's triggers).
const scrollIdle = () => new Promise((resolve) => {
  let t = 0;
  const done = () => { removeEventListener('scroll', on); resolve(); };
  const on = () => { clearTimeout(t); t = setTimeout(done, 700); };
  addEventListener('scroll', on, { passive: true });
  on();
});
const idle = () => new Promise((r) => (window.requestIdleCallback || ((f) => setTimeout(f, 60)))(() => r(), { timeout: 1500 }));
afterCurtain(async () => {
  for (const c of chapters) {
    if (lite) await c.approached;
    await scrollIdle();
    await idle();
    if (isLeaving()) return;
    await c.build();
  }
  if (!isLeaving()) ScrollTrigger.refresh();
});

/* ---------- intro: the club fades up, copy rises ---------- */
function playIntro() {
  const tl = gsap.timeline();
  tl.to(lines, { yPercent: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out' }, 0.45)
    .to(reveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.06, ease: 'expo.out' }, 0.7);
}

/* ---------- scroll: copy clears, the guest walks up to the door and through it, chapter 01 arrives ---------- */
function buildScroll() {
  const chapter = hero.querySelector('[data-chapter]');
  const facade = hero.querySelector('[data-facade]');
  const door = hero.querySelector('[data-door]');
  const inside = hero.querySelector('[data-inside]');

  const tl = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: hero,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
      // the footage plays only at the top: once the walk starts it has faded to the photograph
      onUpdate: (self) => club?.setVisible(self.progress < 0.16),
    },
  });

  tl.to('.hero__left', { yPercent: -35, autoAlpha: 0, duration: 0.22 }, 0)
    .to('.hero__right', { yPercent: -25, autoAlpha: 0, duration: 0.18 }, 0.03)
    .to('[data-hero-meta]', { autoAlpha: 0, duration: 0.1 }, 0.05)
    .to('.hero__veil', { autoAlpha: 0, duration: 0.25 }, 0.12)
    // the footage (it has its own slow push) hands back to the photograph as the walk begins
    .to('[data-loopwrap]', { autoAlpha: 0, duration: 0.12 }, 0.02)
    // walk up to the entrance (the layers scale about the doorway, see hero-club.js)
    // (the facade's entrance portal is ~2.4x smaller than in the door photograph: at 2.4x they match)
    .fromTo(facade, { scale: 1 }, { scale: 2.4, duration: 0.46, ease: 'power2.in' }, 0.04)
    .to(facade, { scale: 2.7, duration: 0.08 }, 0.5)
    // the open doors take over as the entrance fills the screen (a quick crossfade, matched in size)
    .fromTo(door, { autoAlpha: 0, scale: 0.9 }, { autoAlpha: 1, scale: 1, duration: 0.08, ease: 'none' }, 0.46)
    // and through them
    .to(door, { scale: 3.4, duration: 0.28, ease: 'power2.in' }, 0.54)
    .to(inside, { opacity: 1, duration: 0.14, ease: 'power1.in' }, 0.66)
    .set(chapter, { visibility: 'visible' }, 0.74)
    .fromTo(chapter.querySelector('[data-chapter-word]'), { yPercent: 115 }, { yPercent: 0, duration: 0.14, ease: 'power3.out' }, 0.78)
    .fromTo(chapter.querySelector('.eyebrow'), { autoAlpha: 0, y: 16 }, { autoAlpha: 0.85, y: 0, duration: 0.08 }, 0.84)
    .to({}, { duration: 0.001 }, 1);

}
