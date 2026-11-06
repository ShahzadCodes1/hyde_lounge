import * as THREE from 'three';
import { COLORS, readPalette } from '../home/scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment, canvasTex } from '../home/studio.js';
import { rejectSoftware, governor } from '../core/quality.js';
import { mediaUrl } from '../core/media.js';
import {
  GLASS_FLUTES, FLUTE_COUNT, GLASS_BODY, LIQUID_PROFILE, ICE, BASE_TOP,
  diamondCutNormalMap, glowFromColor, surfaceTexture, crystalMaterial, iceMaterial, radiusAt,
} from '../home/glassware.js';

/* ==========================================================================
   MENU SCENE — the serving stage.
   Opens overhead on a dark table set with the five dishes and a crystal glass.
   As you scroll the camera comes down to table height and whatever you are reading
   is served under the pendant light: a plate is lowered onto the bar, a framed
   photograph is set up, or the cut-crystal glass is poured a different spirit.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Spirits for the glass: depth / body / lit highlight, plus how it is served.
export const LIQUIDS = {
  malt: { deep: '#2c1202', body: '#8a4a0c', top: '#e4a23e', level: 0.62 },
  cognac: { deep: '#1c0503', body: '#561708', top: '#b4502a', level: 0.46 },
  sour: { deep: '#3a0610', body: '#9c1b24', top: '#e0663e', level: 0.86 },
};

const PLATE_R = 1.0;
const RING_R = 3.5; // overhead layout radius: wide enough to leave the centre clear for the title

/* ---------- a framed photograph, composed on canvas: rounded image, brass hairline, mount ---------- */
function framedPhoto(img) {
  const W = 900, H = Math.round(900 * (img.height / img.width));
  const pad = 36;
  return canvasTex(W + pad * 2, H + pad * 2, (ctx, w, h) => {
    const r = 26;
    const rr = (x, y, ww, hh, rad) => { ctx.beginPath(); ctx.roundRect(x, y, ww, hh, rad); };
    ctx.fillStyle = '#0c0f0e'; rr(0, 0, w, h, r + 10); ctx.fill();               // mount
    ctx.save(); rr(pad, pad, W, H, r); ctx.clip(); ctx.drawImage(img, pad, pad, W, H); ctx.restore();
    ctx.strokeStyle = 'rgba(217,189,134,0.55)'; ctx.lineWidth = 3; rr(pad + 12, pad + 12, W - 24, H - 24, r - 8); ctx.stroke(); // brass hairline
  });
}

/* ==========================================================================
   createMenuScene(canvas, { items, lite })
   items: [{ kind: 'plate'|'photo'|'glass', file?, liquid?, ice?, foam? }]
   ========================================================================== */
export function createMenuScene(canvas, { items, lite = false }) {
  readPalette();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch {
    return null;
  }
  if (rejectSoftware(renderer)) return null; // no graphics chip: the poster stays
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75));
  renderer.localClippingEnabled = true;
  renderer.transmissionResolutionScale = lite ? 0.5 : 0.8;
  renderer.toneMapping = THREE.NoToneMapping;

  const room = COLORS.bg.clone();
  const scene = new THREE.Scene();
  scene.background = room.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');
  scene.environmentIntensity = 0.95;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 120);

  /* --- set --- */
  const backdrop = createBackdrop({ word: 'Menu', wordW: 12, wordY: 1.1, bg: room, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -6;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(0, 3);
  const bar = createBarTop({ lite });
  scene.add(bar.bar);
  bar.setColors(room, 0.6);
  bar.u.uFade.value.set(-3.5, -7.5);
  bar.u.uShadow.value = 1;
  let reflScale = lite ? 0.35 : 0.55;

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const pool = new THREE.SpotLight(COLORS.glow, 30, 14, 0.55, 0.7, 1.2);
  pool.position.set(0, 4.2, 0.4);
  pool.target.position.set(0, 0, 0);
  scene.add(pool, pool.target);
  const wash = new THREE.DirectionalLight(0xfff1dc, 0.35); // lights the table when seen from above
  wash.position.set(-2, 8, 3);
  scene.add(wash);

  /* --- objects --- */
  const loader = new THREE.TextureLoader();
  // phones get 640 px dish photos (half the download, a quarter of the GPU memory)
  const url = (f) => mediaUrl(lite && /^media\/plate-\d\.webp$/.test(f) ? f.replace(/\.webp$/, '-sm.webp') : f);
  const seg = lite ? 80 : 128;
  const stone = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141414'), roughness: 0.72, envMapIntensity: 0.4 });
  const plateBody = new THREE.CylinderGeometry(PLATE_R * 0.985, PLATE_R * 0.9, 0.035, 96).translate(0, 0.0175, 0);
  const plateTop = new THREE.CircleGeometry(PLATE_R, 96).rotateX(-Math.PI / 2).translate(0, 0.036, 0);

  const objects = []; // { group, kind, presence, overview: Vector3 | null, items: [indices] }
  let ringSlot = 0;
  const ringCount = items.filter((it) => it.kind === 'plate').length + 1; // plates + the glass

  function ringPos(k) {
    const a = (k / ringCount) * Math.PI * 2 - Math.PI / 2;
    return new THREE.Vector3(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
  }

  // plates
  items.forEach((it, i) => {
    if (it.kind !== 'plate') return;
    const g = new THREE.Group();
    const dish = new THREE.MeshStandardMaterial({ roughness: 0.55, envMapIntensity: 0.25, alphaTest: 0.5 });
    loader.load(url(it.file), (tex) => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); dish.map = tex; dish.needsUpdate = true; });
    g.add(new THREE.Mesh(plateBody, stone), new THREE.Mesh(plateTop, dish));
    scene.add(g);
    objects.push({ group: g, kind: 'plate', items: [i], presence: 0, overview: ringPos(ringSlot++), dish });
  });

  // framed photographs
  items.forEach((it, i) => {
    if (it.kind !== 'photo') return;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, envMapIntensity: 0.3, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    const img = new Image();
    img.onload = () => {
      mat.map = framedPhoto(img);
      mat.needsUpdate = true;
      const h = 1.9, w = h * (img.width / img.height) * 1.0;
      mesh.scale.set(w, h, 1);
    };
    img.src = url(it.file);
    mesh.position.y = 1.0;
    mesh.rotation.x = -0.06;
    g.add(mesh);
    scene.add(g);
    objects.push({ group: g, kind: 'photo', items: [i], presence: 0, overview: null });
  });

  // the crystal glass: one glass, poured differently for each drink
  const glass = new THREE.Group();
  const cut = diamondCutNormalMap();
  cut.repeat.set(Math.round(FLUTE_COUNT * 1.5), 7);
  glass.add(new THREE.Mesh(new THREE.LatheGeometry(GLASS_FLUTES, FLUTE_COUNT * 4), crystalMaterial({ lite, pattern: cut, env: 2.2 })));
  glass.add(new THREE.Mesh(new THREE.LatheGeometry(GLASS_BODY, seg), crystalMaterial({ lite })));
  const level = { y: 0.62 };
  const levelPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.62);
  const liquidMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(), roughness: 0.08, envMapIntensity: 0.6, clippingPlanes: [levelPlane], side: THREE.DoubleSide });
  glowFromColor(liquidMat, 0.1, 0.95);
  const liquid = new THREE.Mesh(new THREE.LatheGeometry(LIQUID_PROFILE, seg), liquidMat);
  const surfaceMat = new THREE.MeshStandardMaterial({ map: surfaceTexture(), color: new THREE.Color(), roughness: 0.02, envMapIntensity: 1.4, emissive: new THREE.Color(), emissiveIntensity: 0.12 });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2), surfaceMat);
  const iceU = { uLevel: { value: 0.62 }, uWhisky: { value: new THREE.Color() }, uSeen: { value: room.clone().multiplyScalar(1.6) } };
  const ice = new THREE.Mesh(new THREE.SphereGeometry(ICE.r, 64, 48), iceMaterial(iceU));
  ice.position.y = ICE.y;
  const foamTex = canvasTex(256, 256, (ctx, w) => {
    ctx.fillStyle = '#ece4d6'; ctx.fillRect(0, 0, w, w);
    for (let i = 0; i < 900; i++) { ctx.beginPath(); ctx.arc(Math.random() * w, Math.random() * w, 0.6 + Math.random() * 2.2, 0, 7); ctx.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; ctx.fill(); }
  });
  const foam = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.07, seg, 1, false), new THREE.MeshStandardMaterial({ map: foamTex, color: new THREE.Color('#bdb19b'), roughness: 0.95, emissive: new THREE.Color('#3a2e22'), emissiveIntensity: 0.08 }));
  glass.add(liquid, surface, ice, foam);
  scene.add(glass);
  const glassObj = { group: glass, kind: 'glass', items: items.map((it, i) => (it.kind === 'glass' ? i : -1)).filter((i) => i >= 0), presence: 0, overview: ringPos(ringSlot++) };
  objects.push(glassObj);

  // the drink currently in the glass (tweened when a different drink is served)
  const drink = { deep: new THREE.Color(), body: new THREE.Color(), top: new THREE.Color(), level: 0.62, ice: 1, foam: 0 };
  const firstDrink = items.find((it) => it.kind === 'glass');
  const target = { body: new THREE.Color(), top: new THREE.Color(), level: 0.62, ice: 1, foam: 0 };
  function setDrink(it, instant = false) {
    const L = LIQUIDS[it.liquid] || LIQUIDS.malt;
    target.body.set(L.body); target.top.set(L.top); target.level = L.level; target.ice = it.ice ? 1 : 0; target.foam = it.foam ? 1 : 0;
    if (instant) { drink.body.copy(target.body); drink.top.copy(target.top); drink.level = target.level; drink.ice = target.ice; drink.foam = target.foam; }
  }
  if (firstDrink) setDrink(firstDrink, true);

  /* --- state --- */
  const state = { overview: 1, active: 0, pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2() };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  function setActive(i) {
    state.active = i;
    const it = items[i];
    if (it && it.kind === 'glass') setDrink(it);
  }

  /* --- layout --- */
  let width = 0, height = 0, aspect = 1;
  const view = { dist: 6, overDist: 15 };
  function resize() {
    // the stage is a fixed, full-viewport canvas: size it from itself, not its parent (the whole page)
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch; aspect = cw / ch;
    camera.aspect = aspect;
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    view.dist = Math.max(2.6 / 0.6 / t, 2.3 / (aspect < 0.7 ? 0.8 : aspect < 1.15 ? 0.55 : 0.38) / (aspect * t));
    view.overDist = Math.max((RING_R * 2 + 2.4) / 0.88 / t, (RING_R * 2 + 2.4) / 0.88 / (aspect * t));
    renderer.setSize(cw, ch, false);
    bar.resize(cw * renderer.getPixelRatio(), ch * renderer.getPixelRatio(), reflScale);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* --- frame --- */
  let last = performance.now(), elapsed = 0, running = false, raf = 0;
  const OFF = new THREE.Vector3(0.4, 3.4, -0.6); // where served items wait / leave to (above, out of the light)
  const look = new THREE.Vector3();

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; elapsed += dt;
    const t = elapsed;
    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;
    const ov = easeInOut(clamp(state.overview));
    const k = 1 - Math.pow(0.0025, dt); // smoothing for serve / clear

    // serve the active item, clear the rest
    objects.forEach((o) => {
      const want = o.items.includes(state.active) ? 1 : 0;
      o.presence += (want - o.presence) * k;
      const pr = easeInOut(clamp(o.presence));
      const g = o.group;
      // single-item pose: lowered from above with a turn
      const sx = lerp(OFF.x, 0, pr), sy = lerp(OFF.y, 0, pr), sz = lerp(OFF.z, 0, pr);
      if (o.overview) {
        g.position.set(lerp(sx, o.overview.x, ov), lerp(sy, 0, ov), lerp(sz, o.overview.z, ov));
        g.visible = ov > 0.001 || pr > 0.001;
      } else {
        g.position.set(sx, sy, sz);
        g.visible = pr > 0.001 && ov < 0.999;
      }
      g.rotation.y = (1 - pr) * (1 - ov) * 1.6 + t * 0.06 * pr * (1 - ov) + (o.kind === 'photo' ? -0.25 + ps.x * 0.15 : 0);
      if (o.dish) o.dish.color.setScalar(lerp(0.35 + 0.65 * pr, 1, ov));
    });

    // the drink: colour, level, ice and foam ease toward the order
    drink.body.lerp(target.body, k); drink.top.lerp(target.top, k);
    drink.level += (target.level - drink.level) * k;
    drink.ice += (target.ice - drink.ice) * k;
    drink.foam += (target.foam - drink.foam) * k;
    liquidMat.color.copy(drink.body);
    surfaceMat.color.copy(drink.body).lerp(drink.top, 0.55);
    surfaceMat.emissive.copy(surfaceMat.color);
    const gy = glass.position.y;
    levelPlane.constant = drink.level + gy;
    const r = radiusAt(LIQUID_PROFILE, drink.level) * 0.997;
    surface.position.y = drink.level;
    surface.scale.set(r, 1, r);
    iceU.uLevel.value = drink.level + gy;
    iceU.uWhisky.value.copy(drink.body);
    ice.scale.setScalar(Math.max(0.001, drink.ice));
    ice.position.y = BASE_TOP + ICE.r * drink.ice + 0.01;
    ice.visible = drink.ice > 0.02;
    foam.visible = drink.foam > 0.02;
    foam.scale.set(r * 0.99, drink.foam, r * 0.99);
    foam.position.y = drink.level + 0.03 * drink.foam;

    // camera: overhead table → table-height serving view; the stage sits right of the copy
    const it = items[state.active] || {};
    const lookY = it.kind === 'glass' ? 0.75 : it.kind === 'photo' ? 0.95 : 0.25;
    look.set(0, lerp(lookY, 0, ov), 0);
    const elev = lerp(THREE.MathUtils.degToRad(30), THREE.MathUtils.degToRad(88), ov);
    const az = ps.x * 0.14 * (1 - ov) + t * 0.02 * ov;
    const dist = lerp(view.dist, view.overDist, ov);
    camera.position.set(Math.sin(az) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist + ps.y * 0.1, Math.cos(az) * Math.cos(elev) * dist);
    camera.lookAt(look);
    // the table sits beside the copy (right on desktop, above it on phones), from the overhead shot onwards
    const offX = aspect > 1.15 ? -width * 0.2 : 0;
    const offY = aspect > 1.15 ? 0 : height * lerp(0.2, 0.215, ov);
    camera.setViewOffset(width, height, offX, offY, width, height);

    pool.intensity = lerp(32, 12, ov);
    wash.intensity = lerp(0.12, 0.6, ov);
    bgU.uTime.value = t;
    bgU.uGlowAmt.value = 0.8;
    bgU.uBokeh.value = 0.5 * (1 - ov);
    bgU.uWordOpacity.value = 0.4 * (1 - ov);
    bar.u.uReflect.value = 0.38;
    bar.u.uCenter.value.set(0, 0);

    renderer.render(scene, camera);
  }

  // If the device cannot keep up: fewer pixels, then a softer reflection and refraction, then 30 fps.
  const gov = governor({
    steps: [
      () => { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.8)); width = 0; resize(); },
      () => { reflScale *= 0.6; renderer.transmissionResolutionScale *= 0.6; width = 0; resize(); },
      'cap',
    ],
  });
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (gov.skip(now)) return;
    render();
  }

  function refreshPalette() {
    readPalette();
    room.copy(COLORS.bg);
    scene.background.copy(room);
    bgU.uBg.value.copy(room);
    bgU.uWordColor.value.copy(COLORS.brand);
    bar.setColors(room, 0.6);
    pool.color.copy(COLORS.glow);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    setActive,
    refreshWord: backdrop.refreshWord,
    renderOnce: render,
    compile() { return renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera); },
    start() { if (running) return; running = true; last = performance.now(); gov.reset(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
