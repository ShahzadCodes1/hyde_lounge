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
  // Only elements on or near the screen are measured each frame (an element off screen keeps the
  // value it left with: fully clear below the screen, faded above it).
  const near = new Set();
  const last = new Map();
  const set = (el, z) => { const v = z.toFixed(3); if (last.get(el) !== v) { last.set(el, v); el.style.setProperty('--zone', v); } };
  const zone = (bottom) => Math.min(1, Math.max(0, (bottom / window.innerHeight - to) / (from - to)));
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) near.add(e.target);
    else near.delete(e.target);
    // the observer reports a little after the scroll: bring the element up to date from its entry
    if (mq.matches) set(e.target, zone(e.boundingClientRect.bottom));
  }), { rootMargin: '25% 0px' }) : null;
  els.forEach((el) => (io ? io.observe(el) : near.add(el)));
  let active = null;
  const update = () => {
    if (!mq.matches) {
      if (active !== false) { els.forEach((el) => { el.style.removeProperty('--zone'); last.delete(el); }); active = false; }
      return;
    }
    const list = active ? [...near] : els; // first run after a switch: every element
    active = true;
    // read every position first, then write: no layout is forced between the writes
    const bottoms = list.map((el) => el.getBoundingClientRect().bottom);
    list.forEach((el, i) => set(el, zone(bottoms[i])));
  };
  ScrollTrigger.create({ start: 0, end: 'max', onUpdate: update, onRefresh: () => { active = active && null; update(); } });
  update();
}
