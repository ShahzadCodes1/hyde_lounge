import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const PAGES = ['index', 'menu', 'live', 'brunch', 'reserve'];

// Five real pages — each is its own HTML entry so Vercel serves them statically.
export default defineConfig({
  server: {
    // Pre-transform every page's scripts as soon as `npm run dev` starts, so the first visit to
    // each page is not waiting on the dev server.
    warmup: { clientFiles: ['./src/js/*/*.js'] },
  },
  optimizeDeps: {
    // Bundle the libraries up front. Otherwise Vite discovers them on the first visit to a page
    // and force-reloads the browser mid-load.
    entries: PAGES.map((p) => `${p}.html`),
    include: [
      'three',
      'gsap',
      'gsap/ScrollTrigger',
      'lenis',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/geometries/RoundedBoxGeometry.js',
      'three/addons/objects/Reflector.js',
      'three/addons/postprocessing/EffectComposer.js',
      'three/addons/postprocessing/OutputPass.js',
      'three/addons/postprocessing/RenderPass.js',
      'three/addons/postprocessing/ShaderPass.js',
      'three/addons/postprocessing/UnrealBloomPass.js',
    ],
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: Object.fromEntries(PAGES.map((p) => [p === 'index' ? 'home' : p, resolve(import.meta.dirname, `${p}.html`)])),
    },
  },
});
