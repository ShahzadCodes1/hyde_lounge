/* ==========================================================================
   QUALITY — keeps every 3D scene smooth on the device it is running on.

   · softwareGL(): some browsers have no usable graphics chip and draw WebGL on the processor
     (blocklisted or missing GPU drivers, virtual machines, some older Android devices). There a
     single 3D frame takes hundreds of milliseconds and freezes scrolling and taps, so those
     devices get the poster stills (the same pictures, with the same entrance) instead of live 3D.
   · governor(): times the frames a scene actually achieves. If the device cannot keep up, it
     steps the scene down, one step at a time: fewer pixels, then the scene's own lighter
     settings, then a steady 30 fps. Capable devices never leave the first level.
   ========================================================================== */

const FORCE = /[?&]gl=force\b/.test(location.search); // testing: always run the live 3D
let software;

/** True when this browser renders WebGL in software (checked once, on the first scene's context). */
export const softwareGL = () => software === true;

/**
 * Check a scene's freshly created renderer. Returns true (and releases the context) when the
 * browser renders WebGL in software: the caller then returns no scene and the page keeps its poster.
 * @param {import('three').WebGLRenderer} renderer
 */
export function rejectSoftware(renderer) {
  if (software === undefined) {
    software = false;
    try {
      const gl = renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const name = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
      software = !FORCE && /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
    } catch { /* keep live 3D */ }
  }
  if (!software) return false;
  try { renderer.dispose(); renderer.forceContextLoss(); } catch { /* ignore */ }
  return true;
}

// The deepest level any scene on this page has needed. A scene built later starts one step
// above it (the device is the same), so it does not have to rediscover the device's limits.
let pageLevel = 0;

/**
 * @param {{ steps: Array<(() => void) | 'cap'> }} opts steps in order; 'cap' = render at 30 fps
 * @returns {{ skip(now: number): boolean, reset(): void, level: number }}
 *   call skip(now) at the top of every animation frame: true means "do not draw this frame"
 */
export function governor({ steps }) {
  let level = 0;
  let capped = false;
  let warm = 0;          // frames still to ignore (first frames after a start compile and upload)
  let prev = 0;          // time of the previous animation frame
  let lastDrawn = 0;     // time of the last drawn frame (30 fps cap)
  const samples = [];

  const stepDown = () => {
    const step = steps[level];
    level += 1;
    if (step === 'cap') capped = true;
    else step?.();
    pageLevel = Math.max(pageLevel, level);
    samples.length = 0;
    warm = 8;
  };
  // start where this page's other scenes ended up, minus one step
  while (level < Math.max(0, pageLevel - 1)) stepDown();

  return {
    get level() { return level; },
    reset() { prev = 0; warm = 12; samples.length = 0; },
    skip(now) {
      const dt = prev ? now - prev : 0;
      prev = now;
      if (capped && now - lastDrawn < 30) return true;
      lastDrawn = now;
      if (level >= steps.length) return false; // nothing left to step down
      if (warm > 0) { warm -= 1; return false; }
      // ignore gaps that are not the scene's doing (background tab, a long one-off task)
      if (dt > 0 && dt < 250) samples.push(capped ? dt / 2 : dt);
      if (samples.length >= 40) {
        const sorted = samples.slice().sort((a, b) => a - b);
        const median = sorted[sorted.length >> 1];
        samples.length = 0;
        if (median > 26) stepDown(); // below ~38 fps: the device is not keeping up
      }
      return false;
    },
  };
}
