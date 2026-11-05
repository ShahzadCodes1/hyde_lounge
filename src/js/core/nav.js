import { gsap, ScrollTrigger, lockScroll } from './smooth.js';

export function initNav() {
  const nav = document.querySelector('[data-nav]');
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (!nav) return;

  // Hide on scroll down, reveal on scroll up.
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      nav.classList.toggle('is-scrolled', y > 40);
      if (document.body.classList.contains('menu-open')) return;
      nav.classList.toggle('is-hidden', self.direction === 1 && y > window.innerHeight * 0.6);
    },
  });

  if (!burger || !menu) return;
  const links = menu.querySelectorAll('.menu__links a');
  const foot = menu.querySelector('.menu__foot');
  let open = false;

  const tl = gsap
    .timeline({ paused: true })
    .set(menu, { visibility: 'visible' })
    .to(menu, { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' })
    .from(links, { yPercent: 110, duration: 0.9, stagger: 0.06, ease: 'expo.out' }, '-=0.35')
    .from(foot, { autoAlpha: 0, y: 20, duration: 0.6, ease: 'power3.out' }, '-=0.6');

  const toggle = (state = !open) => {
    open = state;
    document.body.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.setAttribute('aria-hidden', String(!open));
    nav.classList.remove('is-hidden');
    lockScroll(open);
    open ? tl.timeScale(1).play() : tl.timeScale(1.6).reverse();
  };

  burger.addEventListener('click', () => toggle());
  window.addEventListener('keydown', (e) => e.key === 'Escape' && open && toggle(false));
  window.addEventListener('resize', () => open && window.innerWidth > 980 && toggle(false));
}
