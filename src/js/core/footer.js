import { gsap, ScrollTrigger, reducedMotion } from './smooth.js';

// The footer's lines rise and the giant wordmark sweeps in as it scrolls into view.
export function initFooter() {
  const foot = document.querySelector('[data-foot]');
  if (!foot || reducedMotion) return;
  const lines = foot.querySelectorAll('[data-fl]');
  const reveals = foot.querySelectorAll('[data-fr]');
  const mark = foot.querySelector('.foot__mark');
  gsap.set(lines, { yPercent: 115 });
  gsap.set(reveals, { autoAlpha: 0, y: 30 });
  gsap.set(mark, { clipPath: 'inset(0 100% 0 0)' });
  ScrollTrigger.create({
    trigger: foot,
    start: 'top 75%',
    once: true,
    onEnter() {
      gsap.timeline()
        .to(lines, { yPercent: 0, duration: 1.4, stagger: 0.1, ease: 'expo.out' })
        .to(reveals, { autoAlpha: 1, y: 0, duration: 1, stagger: 0.08, ease: 'expo.out' }, 0.25);
    },
  });
  gsap.to(mark, {
    clipPath: 'inset(0 0% 0 0)',
    ease: 'none',
    scrollTrigger: { trigger: mark, start: 'top bottom', end: 'bottom bottom', scrub: true },
  });
}
