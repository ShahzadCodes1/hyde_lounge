import { ScrollTrigger } from './smooth.js';

/* ==========================================================================
   On phones the 3D object lives in the top half of the screen and the copy
   scrolls up through the bottom half. Text fades out as it rises into the
   object's zone, so nothing ever sits on top of the 3D.
   Elements get a --zone custom property (1 = clear, 0 = in the object's zone)
   that their CSS multiplies into opacity.
   ========================================================================== */
export function fadeInUpperZone(selector, { from = 0.62, to = 0.44 } = {}) {
  const els = [...document.querySelectorAll(selector)];
  if (!els.length) return;
  const mq = window.matchMedia('(max-aspect-ratio: 1/1)');
  const update = () => {
    const vh = window.innerHeight;
    els.forEach((el) => {
      if (!mq.matches) { el.style.removeProperty('--zone'); return; }
      const b = el.getBoundingClientRect().bottom / vh;
      const z = Math.min(1, Math.max(0, (b - to) / (from - to)));
      el.style.setProperty('--zone', z.toFixed(3));
    });
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: update });
  update();
}
