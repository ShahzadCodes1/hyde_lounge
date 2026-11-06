import * as THREE from 'three';
import { COLORS, readPalette } from './scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment } from './studio.js';
import { rejectSoftware, governor } from '../core/quality.js';

/* ==========================================================================
   STAGE SCENE — Chapter 03, the stage.
   A vintage art-deco microphone in polished chrome stands under a single spotlight.
   Haze beams, two coloured stage lights (logo terracotta, emerald) that sweep and
   pulse at a slow 120 bpm, dust in the light, and the giant "Play" on the back wall.
   The camera starts close on the capsule, looking up, then circles and pulls back.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const V = (x, y) => new THREE.Vector2(x, y);
const spline = (pts, n) => new THREE.SplineCurve(pts.map(([x, y]) => V(x, y))).getPoints(n);

const CAPSULE = { y: 2.06, r: 0.3, h: 0.42 }; // oval capsule: radius, half-height

/* ---------- a haze beam: a soft cone of light with drifting dust ---------- */
export const beamMaterial = (color) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: color.clone() }, uAmt: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmt; uniform float uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      void main(){
        float core = pow(abs(dot(vN, vV)), 2.6);                    // brightest through the middle of the cone
        float along = smoothstep(1.0, 0.86, vUv.y) * pow(vUv.y, 0.6); // vUv.y: 1 at the lamp, 0 at the floor
        float haze = 0.65 + 0.35 * noise(vec2(vUv.x * 9.0, vUv.y * 4.0 - uTime * 0.12));
        float a = core * along * haze * uAmt;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  });

/* ---------- the microphone ---------- */
function makeMicrophone(chrome, brass, mesh, castBase) {
  const g = new THREE.Group();

  // the cast base and stand
  const base = new THREE.Mesh(
    new THREE.LatheGeometry([V(0, 0), V(0.46, 0), V(0.48, 0.02), V(0.47, 0.05), ...spline([[0.44, 0.06], [0.3, 0.1], [0.12, 0.15], [0.06, 0.22]], 18), V(0.05, 0.26), V(0, 0.26)], 96),
    castBase
  );
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.012, 10, 128), chrome);
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.05;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.4, 32), chrome);
  pole.position.y = 0.26 + 0.7;
  const clutch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 32), brass);
  clutch.position.y = 1.2;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.3, 24), chrome);
  upper.position.y = 1.5;
  g.add(base, baseRing, pole, clutch, upper);

  // the yoke that cradles the capsule
  const yoke = new THREE.Mesh(new THREE.TorusGeometry(CAPSULE.r + 0.07, 0.016, 12, 64, Math.PI), chrome);
  yoke.rotation.z = Math.PI; // a U shape opening upward
  yoke.position.y = CAPSULE.y;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 16), chrome);
  neck.position.y = CAPSULE.y - (CAPSULE.r + 0.07) - 0.07;
  const pivots = [-1, 1].map((s) => {
    const k = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.05, 32).rotateZ(Math.PI / 2), brass);
    k.position.set(s * (CAPSULE.r + 0.07), CAPSULE.y, 0);
    return k;
  });
  g.add(yoke, neck, ...pivots);

  // the capsule: dark acoustic mesh inside an art-deco cage of chrome ribs
  const capsule = new THREE.Group();
  capsule.position.y = CAPSULE.y;
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mesh);
  core.scale.set(CAPSULE.r * 0.96, CAPSULE.h * 0.96, CAPSULE.r * 0.96 * 0.78);
  capsule.add(core);
  const ribs = 13;
  for (let i = 1; i < ribs; i++) {
    const t = -1 + (2 * i) / ribs;
    const rr = Math.sqrt(1 - t * t);
    const rib = new THREE.Mesh(new THREE.TorusGeometry(CAPSULE.r * rr, 0.0075, 8, 96), chrome);
    rib.rotation.x = Math.PI / 2;
    rib.scale.set(1, 0.78, 1);
    rib.position.y = t * CAPSULE.h;
    capsule.add(rib);
  }
  // two meridian hoops and a crown cap
  // (built as tubes along true ellipses, so the chrome keeps an even thickness)
  [[CAPSULE.r, 0], [CAPSULE.r * 0.78, Math.PI / 2]].forEach(([rx, rot]) => {
    const pts = Array.from({ length: 96 }, (_, i) => {
      const a = (i / 96) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * (rx + 0.004), Math.sin(a) * (CAPSULE.h + 0.004), 0);
    });
    const hoop = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.011, 10, true), chrome);
    hoop.rotation.y = rot;
    capsule.add(hoop);
  });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 24, 16), brass);
  cap.position.y = CAPSULE.h;
  capsule.add(cap);
  capsule.rotation.x = -0.18; // tipped slightly toward the audience
  g.add(capsule);

  return { group: g, capsule };
}

/* ==========================================================================
   createStageScene
   ========================================================================== */
export function createStageScene(canvas, { lite = false } = {}) {
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
  renderer.toneMapping = THREE.NoToneMapping;

  const stage = COLORS.stage.clone();
  const scene = new THREE.Scene();
  scene.background = stage.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 80);

  /* --- back wall and stage floor --- */
  const backdrop = createBackdrop({ word: 'Play', wordW: 13, wordY: 2.2, bg: stage, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -4.5;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(0, 2.6);

  let reflScale = lite ? 0.35 : 0.55;
  const floor = createBarTop({ lite });
  scene.add(floor.bar);
  const floorU = floor.u;
  floor.setColors(stage, 1.6);
  floorU.uFade.value.set(-1.5, -4.4);
  floorU.uShadow.value = 1;

  /* --- materials --- */
  const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9ecec'), metalness: 1, roughness: 0.07, envMapIntensity: 1.8 });
  const brass = new THREE.MeshStandardMaterial({ color: COLORS.metal.clone(), metalness: 1, roughness: 0.2, envMapIntensity: 1.5 });
  const meshMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#0d0d0d'), metalness: 0.4, roughness: 0.55, envMapIntensity: 0.6 });
  const castBase = new THREE.MeshStandardMaterial({ color: new THREE.Color('#121212'), metalness: 0.7, roughness: 0.32, envMapIntensity: 1.1 });

  const mic = makeMicrophone(chrome, brass, meshMat, castBase);
  scene.add(mic.group);

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
  const spot = new THREE.SpotLight(COLORS.glow, 0, 12, 0.32, 0.55, 1.1);
  spot.position.set(0, 6.2, 0.6);
  spot.target.position.set(0, 1.6, 0);
  scene.add(spot, spot.target);
  const warm = new THREE.SpotLight(COLORS.brand.clone().multiplyScalar(1.8), 0, 12, 0.4, 0.6, 1.2);
  warm.position.set(-4, 5, 1.5);
  warm.target.position.set(0, 1.8, 0);
  const cool = new THREE.SpotLight(COLORS.haze.clone().multiplyScalar(2.2), 0, 12, 0.4, 0.6, 1.2);
  cool.position.set(4, 5, 0.5);
  cool.target.position.set(0, 1.8, 0);
  scene.add(warm, warm.target, cool, cool.target);

  /* --- haze beams (one main spot, two coloured) --- */
  const makeBeam = (color, len, rTop, rBottom) => {
    const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 48, 1, true).translate(0, -len / 2, 0);
    const m = new THREE.Mesh(geo, beamMaterial(color));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const beamMain = makeBeam(COLORS.glow, 6.2, 0.08, 1.1);
  beamMain.position.copy(spot.position);
  const beamWarm = makeBeam(COLORS.brand.clone().multiplyScalar(1.3), 7, 0.08, 1.5);
  const beamCool = makeBeam(COLORS.haze.clone().multiplyScalar(1.6), 7, 0.08, 1.5);
  const aimBeam = (beam, from, to) => {
    beam.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
  };

  /* --- dust motes drifting in the light --- */
  const dustN = lite ? 260 : 600;
  const dpos = new Float32Array(dustN * 3);
  const dseed = new Float32Array(dustN);
  for (let i = 0; i < dustN; i++) {
    const r = Math.sqrt(Math.random()) * 1.1, a = Math.random() * Math.PI * 2;
    dpos[i * 3] = Math.cos(a) * r; dpos[i * 3 + 1] = Math.random() * 5.5; dpos[i * 3 + 2] = Math.sin(a) * r;
    dseed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  const dust = new THREE.Points(dustGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uColor: { value: COLORS.dust.clone() }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uTime; uniform float uPR; varying float vA;
      void main(){
        vec3 p = position;
        p.y = mod(p.y + uTime * 0.05 * (0.4 + aSeed), 5.5);
        p.x += sin(uTime * 0.3 + aSeed * 20.0) * 0.08;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min(22.0, (5.0 + aSeed * 7.0) * uPR / max(0.3, -mv.z) * 3.0);
        vA = 0.25 + 0.75 * fract(aSeed * 13.7);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmt; varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d) * vA * uAmt * 0.6;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  dust.position.set(0, 0, 0.1);
  dust.frustumCulled = false;
  scene.add(dust);

  /* --- layout --- */
  let width = 0, height = 0;
  const frame = { scale: 1 };
  function resize() {
    const parent = canvas.parentElement;
    const cw = parent.clientWidth, ch = parent.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch;
    const aspect = cw / ch;
    camera.aspect = aspect;
    frame.scale = aspect < 0.7 ? 1.9 : aspect < 1.15 ? 1.3 : 1; // phones need more distance to fit the stand
    const offX = aspect > 1.15 ? -cw * 0.17 : 0;
    const offY = aspect > 1.15 ? 0 : ch * (aspect < 0.7 ? 0.2 : 0.16);
    camera.setViewOffset(cw, ch, offX, offY, cw, ch);
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch, false);
    floor.resize(cw * renderer.getPixelRatio(), ch * renderer.getPixelRatio(), reflScale);
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

  let last = performance.now();
  let elapsed = 0;
  let running = false;
  let raf = 0;
  const target = new THREE.Vector3();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3(0, 1.4, 0);

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    const t = elapsed;
    const p = state.progress;

    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;

    // the spot snaps on (with a brief flicker), the colour lights follow
    const spotOn = range(p, 0.03, 0.1);
    const flick = spotOn > 0 && spotOn < 1 ? (Math.sin(t * 53) > -0.3 ? 1 : 0.25) : 1;
    const colour = easeOut(range(p, 0.18, 0.3));
    const beat = 0.82 + 0.18 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6); // 120 bpm pulse
    spot.intensity = 60 * spotOn * flick;
    warm.intensity = 40 * colour * beat;
    cool.intensity = 40 * colour * (1.64 - beat);
    beamMain.material.uniforms.uAmt.value = 0.62 * spotOn * flick;
    beamWarm.material.uniforms.uAmt.value = 0.4 * colour * beat;
    beamCool.material.uniforms.uAmt.value = 0.4 * colour * (1.64 - beat);
    [beamMain, beamWarm, beamCool].forEach((b) => (b.material.uniforms.uTime.value = t));

    // coloured lights sweep slowly across the stand
    const sweep = Math.sin(t * 0.35) * 0.8 + (p - 0.5) * 1.2;
    from.set(-4.2, 5.2, 1.4);
    to.set(sweep * 0.6, 1.2, 0);
    warm.position.copy(from); warm.target.position.copy(to); aimBeam(beamWarm, from, to);
    from.set(4.2, 5.2, 0.6);
    to.set(-sweep * 0.6, 1.2, 0);
    cool.position.copy(from); cool.target.position.copy(to); aimBeam(beamCool, from, to);

    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uAmt.value = spotOn;

    // camera: close on the capsule looking up → circling out to the whole stand
    const k = easeInOut(range(p, 0.06, 0.88));
    const dist = lerp(2.2, 5.8, k) * frame.scale;
    const az = lerp(0.42, -0.62, k) + ps.x * 0.12;
    const elev = lerp(-0.12, 0.08, k) + ps.y * 0.04;
    target.set(0, lerp(CAPSULE.y, 1.35, k), 0);
    camera.position.set(Math.sin(az) * Math.cos(elev) * dist, target.y + Math.sin(elev) * dist, Math.cos(az) * Math.cos(elev) * dist);
    camera.lookAt(target);

    mic.capsule.rotation.y = Math.sin(t * 0.2) * 0.05;

    bgU.uTime.value = t;
    bgU.uGlowAmt.value = 0.9 * spotOn;
    bgU.uBokeh.value = 0.7 * colour;
    bgU.uWordOpacity.value = 0.5 * range(p, 0.08, 0.22);
    bgU.uWordCenter.value.set(lerp(2.6, -2.6, p), 2.2);
    floorU.uReflect.value = 0.5 * spotOn;
    floorU.uCenter.value.set(0, 0);
    floorU.uCaustic.value.set(0, 0.25);
    floorU.uCausticColor.value.copy(COLORS.glow);
    floorU.uCausticAmt.value = 0.16 * spotOn; // the pool of the spotlight on the stage

    renderer.render(scene, camera);
  }

  // If the device cannot keep up: fewer pixels, then a softer reflection, then 30 fps.
  const gov = governor({
    steps: [
      () => { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.8)); width = 0; resize(); },
      () => {
        reflScale *= 0.6;
        width = 0; resize();
      },
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
    stage.copy(COLORS.stage);
    scene.background.copy(stage);
    bgU.uBg.value.copy(stage);
    bgU.uWordColor.value.copy(COLORS.brand);
    floor.setColors(stage, 1.6);
    brass.color.copy(COLORS.metal);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    refreshWord: backdrop.refreshWord,
    renderOnce: render,
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
