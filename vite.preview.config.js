import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Review preview for the claude.ai artifact: the same multi-page build as production, but with
// relative paths ('./') so it can be published as a set of files. Shared code (three.js, GSAP,
// fonts) is emitted once in assets/ and cached between pages, exactly as it will be on Vercel.
const PAGES = ['index', 'menu', 'live', 'brunch', 'reserve'];
export default defineConfig({
  define: {
    'import.meta.env.VITE_SINGLE_PAGE': JSON.stringify('1'),
    'import.meta.env.VITE_PREVIEW_PAGES': JSON.stringify(PAGES.join(',')),
  },
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist-preview/site',
    emptyOutDir: true,
    copyPublicDir: false, // media is already published with the artifact
    chunkSizeWarningLimit: 2000,
    rollupOptions: { input: Object.fromEntries(PAGES.map((p) => [p, resolve(import.meta.dirname, `${p}.html`)])) },
  },
});
