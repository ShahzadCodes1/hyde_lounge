# Hyde Lounge — website

Five-page, scroll-animated 3D website for Hyde Lounge (Adliya, Bahrain).
Stack: Vite · Three.js · GSAP ScrollTrigger · Lenis. Static output, ready for Vercel.

## Run locally
```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build into /dist
npm run preview    # serve the production build
```
`npm run dev` loads every file separately, so pages arrive more slowly than they will live.
To see the real speed (for a client demo, say), run `npm run build` and then `npm run preview`.

## Loading, transitions and returning visitors
- All styles are `<link>`ed in each page's `<head>` (`src/styles/site.css` plus the page's own sheet),
  so no unstyled frame is ever painted. Don't `import` CSS from JavaScript.
- The curtain (`.loader`, one dark panel) is static HTML at the top of each `<body>` and is the first
  thing painted. Leaving a page closes it and shows the next page's name. The next page opens on that
  same frame and lifts it as soon as the fonts are in (600 ms at most).
- The curtain never waits for 3D. Each page builds its scene with `afterCurtain()` (from `core/app.js`),
  once the curtain is up and the hero copy has settled. `warm()` (from `core/scenes.js`) then compiles
  the scene, draws its first frame and fades the canvas in. Scene render loops are held while a curtain
  is closed, and clicking a link stops all 3D work.
- Hero posters: each hero has a still of its 3D scene's first frame (`src/assets/posters/<page>-land.webp`
  and `-port.webp`, set in `src/styles/posters.css`) on a `.stage-poster` layer under the canvas. The
  curtain lifts with the poster already decoded, so the hero picture is there at once. The live 3D builds
  a moment later, crossfades in over the identical still, and the poster is hidden. If you change a hero
  scene (camera, objects, colours), re-render its posters so the hand-over stays invisible.
- `renderer.debug.checkShaderErrors = false` on every renderer avoids blocking GPU readbacks during
  shader compilation. Set it to `true` temporarily if a shader needs debugging.
- A small inline script in each `<head>` (identical on all five pages) runs before the first paint:
  every load opens at the top, and someone who leaves the site and comes back (Back from another site,
  a reopened tab, a restored session) starts over on the Home page.

## Deploy to Vercel
Import the folder (or its Git repo) in Vercel. It auto-detects Vite:
build command `npm run build`, output `dist`. `vercel.json` enables clean URLs (/menu, /live …).

## Structure
- `index.html, menu.html, live.html, brunch.html, reserve.html` — the five pages
- `src/js/core/` — shared shell: nav, mobile menu, preloader, page transitions, smooth scroll, cursor
- `src/js/home/hero-club.js` — the landing: the club facade at night (photograph + live footage, `src/assets/hero`, `src/media/hero-loop-*.mp4`); scroll walks up to the entrance and through the open doors into Chapter 01. Source stills and clips were cleaned and rebuilt with Higgsfield from the client footage (no event decor).
- `src/js/home/pour-scene.js` + `pour.js` — Chapter 01: the cognac pour
- `src/js/home/plate-scene.js` + `plate.js` — Chapter 02: the kitchen (dish images in src/media/plate-*.webp)
- `src/js/home/stage-scene.js` + `play.js` — Chapter 03: the stage
- `src/js/core/footer.js` — the shared footer (markup in shell.js)
- `src/js/home/studio.js` — shared studio set: lighting environment, backdrop wall, reflective bar top
- `plates/` — original 2048px dish images from Higgsfield (source files; not used by the build)
- `src/styles/palettes.css` — colour palettes (Emerald Noir is the chosen one)
- `src/media/` — clips and photos cut from the brand footage (fingerprinted by the build; referenced by name through `src/js/core/media.js`)
- `src/styles/base.css` — design tokens (colour, type, spacing, motion)

## Progress
- [x] Step 0 — Foundation
- [x] Step 1 — Home hero (brass LED-ring sign → dive → "Pour.")
- [x] Step 2 — Home: Chapter 01 "Pour" (refractive coupe, scroll-driven pour, media cards, liquid wipe)
- [x] Step 3 — Home: Chapter 02 "Plate" (brass cloche reveal, five-course turning table, pendant light, iris into Play)
- [x] Step 4 — Home: Chapter 03 "Play" (chrome art-deco microphone under stage lights, venue footage) + site footer
- [x] Step 5a — Menu page (overhead table → dishes served one by one, crystal glass changes drink, Kitchen/Bar jump pills)
- [x] Step 5b — Live Nights page (turntable: needle drops on scroll, pinned week of seven tinted nights, needle close-up for the artists, overhead record behind the footage) · On stage now shows the four artists' portraits (client photos, cropped to 4:5, EDSR-upscaled, graded; src/media/artist-*.webp)
- [x] Step 5c — Brunch page (champagne tower: bottle pours, cascade fills tier by tier through the packages, turning plates, eye-level orbit for the afternoon)
- [x] Step 5d — Reserve page (place card engraved live as the form is filled, candle lit on scroll, request sent to the host on WhatsApp)
- [x] Polish pass (5 Nov): faster page switches (shorter curtains, async shader compile, background prefetch of other pages, 3D frozen on leave, multi-file preview build), fully responsive with an automated overlap/overflow audit at 7 sizes, phone fixes on every page (text fades out of the 3D zone, Reserve table window), 5th On-stage row removed
- [ ] Vercel deploy

## Performance notes

- **Quality governor** (`src/js/core/quality.js`): every 3D scene times its real frame rate and steps down (fewer pixels → lighter reflections/bloom → 30 fps) if the device can't keep up. Browsers without a usable graphics chip (software WebGL) keep the poster stills instead of live 3D. Add `?gl=force` to a URL to force live 3D when testing.
- **Home chapters** build one at a time, after the hero entrance, only while the guest isn't scrolling; on phones only once the guest is within two screens of the chapter.
- **Build** (`vite.config.js`): page CSS is inlined into the HTML, and scripts start right after the first paint, so the curtain shows immediately. three.js is in its own long-cached chunk.
- **Fonts**: the three first-screen font files are preloaded; size-matched local fallbacks (`site.css`) prevent layout shift while fonts load.
- **Media**: lives in `src/media` (hashed names, cached for a year). Video posters load about a screen and a half ahead; photos and posters fade in once loaded.
