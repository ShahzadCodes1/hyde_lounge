import { boot } from './core/app.js';
import { gsap } from './core/smooth.js';

boot(document.body.dataset.page, {
  onReveal() {
    gsap.from('.stub > div > *', { y: 40, autoAlpha: 0, duration: 1.2, stagger: 0.1, ease: 'expo.out' });
  },
});
