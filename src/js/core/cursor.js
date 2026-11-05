import { gsap, isTouch } from './smooth.js';

export function initCursor() {
  const el = document.querySelector('[data-cursor-el]');
  if (!el || isTouch) return;
  const xTo = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3' });
  const yTo = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3' });
  window.addEventListener('pointermove', (e) => { xTo(e.clientX); yTo(e.clientY); }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    el.classList.toggle('is-hover', !!e.target.closest('a, button, [data-cursor]'));
  });
}
