import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const PAGES = ['index', 'menu', 'live', 'brunch', 'reserve'];

/**
 * Production only, two changes to each built page:
 * 1. Its stylesheets go straight into the HTML. The CSS is small (~8 KB compressed per page) and
 *    needed for the first paint anyway; inlined, the curtain paints as soon as the HTML arrives
 *    instead of after one more round trip per stylesheet.
 * 2. Its scripts are requested right after that first paint instead of during it. The curtain is
 *    plain HTML and CSS, so it never needs them to appear; on a phone that already has the scripts
 *    cached, running ~750 KB of JavaScript would otherwise hold the first paint back.
 */
function pageTweaks() {
  return {
    name: 'hyde:page-tweaks',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' || !file.fileName.endsWith('.html')) continue;
        let html = String(file.source).replace(/<link rel="stylesheet"[^>]*href="\/([^"]+\.css)"[^>]*>/g, (tag, name) => {
          const css = bundle[name];
          return css ? `<style>${String(css.source).trim()}</style>` : tag;
        });
        const preloads = [];
        html = html.replace(/\s*<link rel="modulepreload" crossorigin href="([^"]+)">/g, (_, href) => { preloads.push(href); return ''; });
        html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => `<script>
    /* load the page's scripts right after the first paint (see vite.config.js) */
    (function (d) {
      var done = false;
      function go() {
        if (done) return; done = true;
        ${JSON.stringify(preloads)}.forEach(function (h) { var l = d.createElement('link'); l.rel = 'modulepreload'; l.crossOrigin = ''; l.href = h; d.head.appendChild(l); });
        var s = d.createElement('script'); s.type = 'module'; s.crossOrigin = ''; s.src = ${JSON.stringify(src)}; d.head.appendChild(s);
      }
      requestAnimationFrame(function () { setTimeout(go, 0); });
      setTimeout(go, 100); // a tab opened in the background does not paint
    })(document);
  </script>`);
        file.source = html;
      }
    },
  };
}

export default defineConfig({
  plugins: [pageTweaks()],
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
      output: {
        // three.js in a chunk of its own: it changes far less often than the site's own code,
        // so returning visitors keep it cached across updates
        manualChunks: (id) => (id.includes('/node_modules/three/') ? 'three' : undefined),
      },
    },
  },
});
