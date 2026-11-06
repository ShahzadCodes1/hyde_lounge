import * as THREE from 'three';
import { COLORS, readPalette } from './scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment } from './studio.js';
import { rejectSoftware, governor } from '../core/quality.js';
import {
  V, LEVEL_MIN, LEVEL_MAX, LIQUID_PROFILE, ICE, GLASS_FLUTES, FLUTE_COUNT, GLASS_BODY,
  diamondCutNormalMap, glowFromWithin, surfaceTexture, crystalMaterial, iceMaterial, radiusAt, vertexColored,
} from './glassware.js';

/* ==========================================================================
   POUR SCENE — Chapter 01, the bar. A whisky pour, staged like a spirits campaign:
   · a heavy cut-crystal rocks glass: faceted flutes below a polished band, thick base
   · one clear ice sphere
   · a faceted crystal decanter glides in, tilts and pours a slow amber stream over
     the ice; you can watch the whisky in the decanter drain as it pours
   · whisky that glows from within; the ice takes the whisky's colour below the line
     and stays crystal-clear above it
   · a polished black bar top with a true reflection and the amber light the whisky
     throws onto the bar; bar bokeh and the giant "Pour" refracted through the crystal
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- the decanter (local: base at y = 0, pivot at its body centre) ---------- */
const DECANTER_PIVOT = 0.8;
const DECANTER_OUTER = [
  V(0, 0), V(0.5, 0), V(0.52, 0.02), V(0.53, 0.1), V(0.53, 0.74), V(0.5, 0.9), V(0.36, 1.05), V(0.15, 1.17),
  V(0.1, 1.28), V(0.098, 1.54), V(0.125, 1.585), V(0.135, 1.62), V(0.118, 1.638),
  V(0.09, 1.625), V(0.082, 1.3), V(0.12, 1.175), V(0.33, 1.035), V(0.48, 0.88), V(0.505, 0.74), V(0.505, 0.12), V(0.48, 0.065), V(0, 0.055),
];
const DECANTER_LIQUID = [V(0, 0.062), V(0.47, 0.07), V(0.495, 0.12), V(0.495, 0.74), V(0.47, 0.875), V(0.32, 1.03), V(0.115, 1.17), V(0.075, 1.3), V(0.072, 1.6), V(0, 1.6)];
const LIP_LOCAL = new THREE.Vector3(-0.02, 1.64 - DECANTER_PIVOT, 0);

/* ---------- spirit colours: deep cognac — mahogany with a red-brown depth ---------- */
// (names kept generic: WHISKY_DEEP = the darkest depth, WHISKY = body colour, AMBER = the lit highlight)
const WHISKY_DEEP = new THREE.Color('#1c0503');
const WHISKY = new THREE.Color('#561708');
const AMBER = new THREE.Color('#b4502a');
function whiskyColorAt(y, out) {
  const t = clamp((y - LEVEL_MIN) / (LEVEL_MAX - LEVEL_MIN));
  return out.copy(WHISKY_DEEP).lerp(WHISKY, Math.min(1, t * 1.6)).lerp(AMBER, Math.max(0, t - 0.55) * 0.5);
}

/* ---------- canvas textures ---------- */
/* ---------- shaders ---------- */
const streamMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uColor: { value: AMBER.clone() }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.x += sin(uv.y * 18.0 + uTime * 9.0) * 0.004;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
      void main(){
        float ripple = 0.94 + 0.06 * sin(vUv.y * 60.0 + uTime * 22.0);
        float across = abs(sin(vUv.x * 3.1416));
        float gloss = pow(max(0.0, sin(vUv.x * 6.2832 + 0.9)), 24.0);  // a fine specular line down the stream
        vec3 c = uColor * (0.35 + 0.55 * across) * ripple + vec3(1.0, 0.82, 0.62) * gloss * 0.45;
        gl_FragColor = vec4(c, uAlpha * 0.95);
        #include <colorspace_fragment>
      }`,
  });

/* ==========================================================================
   createPourScene
   ========================================================================== */
export function createPourScene(canvas, { lite = false } = {}) {
  readPalette();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch {
    return null;
  }
  if (rejectSoftware(renderer)) return null; // no graphics chip: the section shows its backdrop and copy
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75)); // phones: chapters render at 1.25x (the hero keeps 1.5x)
  renderer.localClippingEnabled = true;
  renderer.transmissionResolutionScale = lite ? 0.5 : 0.85;
  renderer.toneMapping = THREE.NoToneMapping;

  const scene = new THREE.Scene();
  scene.background = COLORS.chapter.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 80);

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(-3, 5, 4);
  scene.add(key);
  const rim = new THREE.PointLight(0xffe2bd, 5, 8, 1.6);
  rim.position.set(2.2, 2.0, -0.8);
  scene.add(rim);

  /* --- backdrop: chapter colour, warm glow, bar bokeh and the giant word as ONE opaque wall --- */
  const backdrop = createBackdrop({ word: 'Pour', wordW: 11, wordY: 1.75, bg: COLORS.chapter, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;

  /* --- polished bar top with a real reflection --- */
  let reflScale = lite ? 0.35 : 0.6;
  const barTop = createBarTop({ lite });
  scene.add(barTop.bar);
  const barU = barTop.u;
  const floorColor = () => barTop.setColors(COLORS.chapter);
  floorColor();

  /* --- crystal --- */
  const cut = diamondCutNormalMap();
  const crystal = (flat, opts) => crystalMaterial({ lite, flat, ...opts });

  /* --- the glass --- */
  const tumbler = new THREE.Group();
  scene.add(tumbler);
  const seg = lite ? 96 : 160;
  // lower body: diamond-cut, the lattice sized so each facet is roughly square
  const glassCut = cut.clone();
  glassCut.repeat.set(Math.round(FLUTE_COUNT * 1.5), 7);
  glassCut.needsUpdate = true;
  tumbler.add(new THREE.Mesh(new THREE.LatheGeometry(GLASS_FLUTES, FLUTE_COUNT * 4), crystal(false, { pattern: glassCut, env: 2.2 })));
  tumbler.add(new THREE.Mesh(new THREE.LatheGeometry(GLASS_BODY, seg), crystal(false)));

  // whisky in the glass: clipped at the fill level
  const glassLevel = new THREE.Plane(new THREE.Vector3(0, -1, 0), LEVEL_MIN);
  const whiskyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.08, envMapIntensity: 0.6, clippingPlanes: [glassLevel], side: THREE.DoubleSide });
  glowFromWithin(whiskyMat, 0.1, 0.95);
  const whisky = new THREE.Mesh(vertexColored(new THREE.LatheGeometry(LIQUID_PROFILE, seg), whiskyColorAt), whiskyMat);
  whisky.visible = false;
  tumbler.add(whisky);

  const surfaceMat = new THREE.MeshStandardMaterial({ map: surfaceTexture(), color: AMBER.clone(), roughness: 0.02, envMapIntensity: 1.4, emissive: AMBER.clone(), emissiveIntensity: 0.1 });
  const surface = new THREE.Mesh(new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2), surfaceMat);
  surface.visible = false;
  tumbler.add(surface);

  // the ice sphere: clear above the whisky, whisky-tinted below; crisp reflections from the studio
  const iceU = { uLevel: { value: LEVEL_MIN }, uWhisky: { value: WHISKY.clone() }, uSeen: { value: COLORS.chapter.clone().multiplyScalar(0.9) } };
  const iceMat = iceMaterial(iceU);
  const ice = new THREE.Mesh(new THREE.SphereGeometry(ICE.r, 64, 48), iceMat);
  ice.position.y = ICE.y;
  tumbler.add(ice);

  /* --- the decanter: faceted crystal with whisky inside --- */
  const decanter = new THREE.Group();
  scene.add(decanter);
  const decCut = cut.clone();
  decCut.repeat.set(24, 9);
  decCut.needsUpdate = true;
  const decGlass = new THREE.Mesh(new THREE.LatheGeometry(DECANTER_OUTER, 12).translate(0, -DECANTER_PIVOT, 0), crystal(true, { pattern: decCut, env: 2.8 }));
  const decLevel = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const decWhiskyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.1, envMapIntensity: 0.5, clippingPlanes: [decLevel], side: THREE.DoubleSide, flatShading: true });
  glowFromWithin(decWhiskyMat, 0.1, 0.8);
  const decWhisky = new THREE.Mesh(
    vertexColored(new THREE.LatheGeometry(DECANTER_LIQUID, 12).translate(0, -DECANTER_PIVOT, 0).scale(0.985, 0.995, 0.985), (y, c) => c.copy(WHISKY).lerp(WHISKY_DEEP, 0.25)),
    decWhiskyMat
  );
  decanter.add(decGlass, decWhisky);
  decanter.visible = false;

  // stream: from the decanter's lip onto the ice
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1, 20, 24, true).translate(0, -0.5, 0), streamMaterial());
  stream.visible = false;
  scene.add(stream);

  // splash where the stream meets the ice / whisky
  const dropN = lite ? 10 : 16;
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(0.012, 8, 6), surfaceMat, dropN);
  const dropSeeds = Array.from({ length: dropN }, () => ({ a: Math.random() * Math.PI * 2, s: 0.4 + Math.random() * 0.8, ph: Math.random() }));
  drops.visible = false;
  tumbler.add(drops);
  const dm = new THREE.Matrix4();

  /* --- layout --- */
  let width = 0, height = 0;
  const frameCfg = { z: 7 };
  function resize() {
    const parent = canvas.parentElement;
    const cw = parent.clientWidth, ch = parent.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch;
    const aspect = cw / ch;
    camera.aspect = aspect;
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const zH = 1.5 / 0.4 / t;                                      // glass ≈ 40% of the height (room for the pour above)
    const zW = 1.42 / (aspect < 0.7 ? 0.42 : 0.34) / (aspect * t);
    frameCfg.z = Math.max(zH, zW);
    const offX = aspect > 1.15 ? -cw * 0.16 : 0;
    const offY = aspect > 1.15 ? -ch * 0.04 : ch * 0.1;
    camera.setViewOffset(cw, ch, offX, offY, cw, ch);
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch, false);
    barTop.resize(cw * renderer.getPixelRatio(), ch * renderer.getPixelRatio(), reflScale);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);

  /* --- state --- */
  const state = { progress: 0, pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2() };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  /* --- frame --- */
  let last = performance.now();
  let elapsed = 0;
  let running = false;
  let raf = 0;
  const lip = new THREE.Vector3();
  const hit = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const up = new THREE.Vector3(0, -1, 0);
  const POUR_POS = new THREE.Vector3(0.9, 2.62, 0.05);
  const AWAY_POS = new THREE.Vector3(3.6, 5.6, -0.4);
  const POUR_TILT = 2.02;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    const t = elapsed;
    const p = state.progress;

    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;

    // choreography
    const glassIn = easeOut(range(p, 0.02, 0.15));
    const decIn = easeInOut(range(p, 0.12, 0.24));
    const streamIn = easeInOut(range(p, 0.22, 0.27));
    const fill = easeInOut(range(p, 0.24, 0.58));
    const streamOut = easeInOut(range(p, 0.55, 0.6));
    const decOut = easeInOut(range(p, 0.58, 0.7));

    // the glass is set down on the bar, the facets turning slowly through the light
    const lift = lerp(2.6, 0, glassIn);
    tumbler.position.set(0, lift, 0);
    tumbler.rotation.y = lerp(-1.4, 0, glassIn) + t * 0.08 + ps.x * 0.2;

    // camera: three-quarter, just above the rim
    const push = Math.sin(Math.PI * range(p, 0.15, 0.8)) * 0.5;
    const camZ = frameCfg.z - push;
    camera.position.set(ps.x * 0.3, 0.75 + camZ * 0.14 + ps.y * 0.1, camZ);
    camera.lookAt(0, 0.95, 0);

    // decanter: glides in, tilts to pour (a little further as it drains), rights itself and leaves
    const inOut = decIn * (1 - decOut);
    decanter.visible = inOut > 0.001;
    decanter.position.lerpVectors(AWAY_POS, POUR_POS, inOut);
    const pourTilt = POUR_TILT + fill * 0.16;
    decanter.rotation.set(0, 0, lerp(0.25, pourTilt, easeInOut(range(p, 0.16, 0.25)) * (1 - decOut)));
    decanter.updateMatrixWorld();
    lip.copy(LIP_LOCAL).applyMatrix4(decanter.matrixWorld);
    // liquid inside the decanter stays level in the world; it reaches the lip while pouring and drains with the fill
    const neckY = lip.y - 0.02;
    const restY = decanter.position.y + lerp(0.05, -0.32, fill);
    decLevel.constant = lerp(restY, neckY + 0.3 * (1 - fill), streamIn * (1 - streamOut));

    // whisky in the glass
    const level = lerp(LEVEL_MIN, LEVEL_MAX, fill) + Math.sin(t * 3.4) * 0.002 * (fill > 0 && fill < 1 ? 1 : 0.25);
    whisky.visible = surface.visible = fill > 0.001;
    glassLevel.constant = level + tumbler.position.y;
    iceU.uLevel.value = fill > 0.001 ? level + tumbler.position.y : -10;
    const r = radiusAt(LIQUID_PROFILE, level) * 0.997;
    surface.position.y = level;
    surface.scale.set(r, 1, r);
    whiskyColorAt(level, surfaceMat.color).lerp(AMBER, 0.25);
    surfaceMat.emissive.copy(surfaceMat.color);

    // stream: from the lip to the top of the ice sphere
    hit.set(0.05, ICE.y + ICE.r * 0.92, 0.02).add(tumbler.position);
    const streamOn = streamIn * (1 - streamOut);
    stream.visible = streamOn > 0.001;
    if (stream.visible) {
      // it leaves the lip first, and lets go from the top last
      const from = lip.clone().lerp(hit, streamOut);
      const to = lip.clone().lerp(hit, streamIn);
      dir.subVectors(to, from);
      const len = Math.max(0.0001, dir.length());
      stream.position.copy(from);
      stream.quaternion.setFromUnitVectors(up, dir.normalize());
      stream.scale.set(1, len, 1);
      stream.material.uniforms.uTime.value = t;
      stream.material.uniforms.uColor.value.copy(WHISKY).lerp(AMBER, 0.45); // deep mahogany, matching the glass
    }

    // splash
    const splash = streamOn * (fill < 1 ? 1 : 0);
    drops.visible = splash > 0.01;
    if (drops.visible) {
      for (let i = 0; i < dropN; i++) {
        const d = dropSeeds[i];
        const ph = (t * 1.5 * d.s + d.ph) % 1;
        const rr = ICE.r * 0.6 + ph * 0.22 * d.s;
        const yy = ICE.y + ICE.r * 0.7 + Math.sin(ph * Math.PI) * 0.12 * d.s - ph * 0.25;
        const sc = splash * (1 - ph);
        dm.makeScale(sc, sc, sc).setPosition(Math.cos(d.a) * rr, yy, Math.sin(d.a) * rr);
        drops.setMatrixAt(i, dm);
      }
      drops.instanceMatrix.needsUpdate = true;
    }

    // set and atmosphere
    bgU.uTime.value = t;
    bgU.uWordOpacity.value = 0.6 * range(p, 0.03, 0.16);
    bgU.uWordCenter.value.set(lerp(2.2, -2.2, p), 1.75);
    bgU.uGlowAmt.value = glassIn + fill * 0.5;
    bgU.uBokeh.value = range(p, 0.0, 0.12);
    barU.uCenter.value.set(0, 0);
    barU.uReflect.value = 0.45 * glassIn;
    barU.uShadow.value = range(lift, 1.0, 0);
    barU.uCaustic.value.set(0.62, 0.7);
    barU.uCausticColor.value.copy(AMBER).lerp(WHISKY, 0.2);
    barU.uCausticAmt.value = 0.32 * fill * glassIn;
    rim.intensity = 3 + fill * 4;

    renderer.render(scene, camera);
  }

  // If the device cannot keep up: fewer pixels, then a softer reflection and refraction, then 30 fps.
  const gov = governor({
    steps: [
      () => { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.8)); width = 0; resize(); },
      () => {
        reflScale *= 0.6;
        renderer.transmissionResolutionScale *= 0.6;
        width = 0; resize();
      },
      'cap',
    ],
  });

  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (gov.skip(now)) return;
    frame();
  }

  function refreshPalette() {
    readPalette();
    scene.background.copy(COLORS.chapter);
    bgU.uBg.value.copy(COLORS.chapter);
    bgU.uWordColor.value.copy(COLORS.brand);
    bgU.uGlow.value.copy(COLORS.glow);
    bgU.uHaze.value.copy(COLORS.haze);
    floorColor();
    if (!running) frame();
  }
  window.addEventListener('palettechange', refreshPalette);

  const refreshWord = backdrop.refreshWord;

  return {
    state,
    refreshWord,
    renderOnce: frame,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      gov.reset();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    compile() {
      return renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera);
    },
  };
}
