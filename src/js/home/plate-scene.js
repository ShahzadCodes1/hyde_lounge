import * as THREE from 'three';
import { COLORS, readPalette } from './scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment } from './studio.js';

/* ==========================================================================
   PLATE SCENE — Chapter 02, the kitchen.
   A dark dining room under one brass pendant. A polished brass cloche lifts off the
   first plate (steam rises), then the table turns to bring each course into the light.
   Dish photographs sit on the plates as top-down textures, framed by a real stone rim.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const V = (x, y) => new THREE.Vector2(x, y);
const spline = (pts, n) => new THREE.SplineCurve(pts.map(([x, y]) => V(x, y))).getPoints(n);

// The cloche opens on course 1; hot courses steam.
export const COURSES = [
  { file: 'media/plate-1.webp', hot: true },  // seared tiger prawns
  { file: 'media/plate-2.webp', hot: true },  // chargrilled asparagus
  { file: 'media/plate-3.webp', hot: false }, // burrata & heirloom tomato
  { file: 'media/plate-4.webp', hot: false }, // fattoush
  { file: 'media/plate-5.webp', hot: false }, // tuna tartare
];

const TABLE_R = 2.35;   // turntable radius: one plate in the light, the rest waiting around the table

// Scroll windows for each turn of the table (course k → k+1), between the cloche lift and the cards.
const TURN_START = 0.34, TURN_END = 0.8, TURN_LEN = 0.075;
export function turnAt(p) {
  const n = COURSES.length - 1;
  const span = (TURN_END - TURN_START) / n;
  let turn = 0;
  for (let k = 0; k < n; k++) turn += easeInOut(range(p, TURN_START + k * span + (span - TURN_LEN) / 2, TURN_START + k * span + (span + TURN_LEN) / 2));
  return turn;
}
const PLATE_R = 1.0;

/* ---------- steam: soft rising wisps ---------- */
const steamMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSeed: { value: Math.random() * 10 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAmt; uniform float uSeed; varying vec2 vUv;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.1; a *= 0.5; } return v; }
      void main(){
        vec2 uv = vUv;
        float t = uTime * 0.25 + uSeed;
        uv.x += (fbm(vec2(uv.y * 2.0 - t, t * 0.5)) - 0.5) * 0.5 * uv.y;   // drift sideways as it rises
        float n = fbm(vec2(uv.x * 3.0, uv.y * 2.2 - t * 1.6));
        float column = smoothstep(0.5, 0.1, abs(uv.x - 0.5));
        float fade = smoothstep(0.0, 0.25, uv.y) * smoothstep(1.0, 0.45, uv.y);
        float a = smoothstep(0.45, 0.85, n) * column * fade * uAmt;
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a * 0.55, a * 0.55);
        #include <colorspace_fragment>
      }`,
  });

/* ---------- brass cloche (lathe), with its knob ---------- */
function makeCloche(material) {
  const g = new THREE.Group();
  const profile = [
    V(1.11, 0), V(1.12, 0.012), V(1.11, 0.03), V(1.05, 0.038),
    ...spline([[1.03, 0.05], [0.99, 0.3], [0.86, 0.58], [0.62, 0.78], [0.32, 0.88], [0.0, 0.905]], 40),
  ];
  const dome = new THREE.Mesh(new THREE.LatheGeometry(profile, 128), material);
  dome.material.side = THREE.DoubleSide;
  g.add(dome);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.07, 0.08, 32), material);
  neck.position.y = 0.94;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.1, 48, 32), material);
  knob.position.y = 1.04;
  knob.scale.set(1, 0.82, 1);
  g.add(neck, knob);
  return g;
}

/* ---------- brass pendant lamp ---------- */
function makePendant(brass, glowColor) {
  const g = new THREE.Group();
  const shade = new THREE.Mesh(
    new THREE.LatheGeometry([V(0.06, 0.42), V(0.12, 0.4), ...spline([[0.12, 0.4], [0.32, 0.28], [0.52, 0.08], [0.56, 0.0]], 24), V(0.555, -0.008), V(0.54, -0.004)], 96),
    brass
  );
  shade.material.side = THREE.DoubleSide;
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 6, 8), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.6 }));
  cord.position.y = 0.42 + 3;
  const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: glowColor.clone().multiplyScalar(1.6), toneMapped: false }));
  bulb.position.y = 0.02;
  g.add(shade, cord, bulb);
  return g;
}

/* ==========================================================================
   createPlateScene
   ========================================================================== */
export function createPlateScene(canvas, { lite = false } = {}) {
  readPalette();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.75)); // phones: chapters render at 1.25x (the hero keeps 1.5x)
  renderer.toneMapping = THREE.NoToneMapping;

  const room = COLORS.bg.clone();
  const scene = new THREE.Scene();
  scene.background = room.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');
  scene.environmentIntensity = 0.9;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 80);

  /* --- backdrop + bar top --- */
  const backdrop = createBackdrop({ word: 'Plate', wordW: 12, wordY: 2.4, bg: room, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -5.5;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(0, 3.2);

  const reflScale = lite ? 0.35 : 0.55;
  const barTop = createBarTop({ lite });
  scene.add(barTop.bar);
  const barU = barTop.u;
  barTop.setColors(room, 0.55);
  barU.uFade.value.set(-2.2, -6.5); // the bar runs back far enough to carry the waiting plates

  /* --- light: one warm pendant pool, a little cool fill --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const pool = new THREE.SpotLight(COLORS.glow, 0, 9, 0.62, 0.75, 1.2);
  pool.position.set(0, 3.4, 0.1);
  pool.target.position.set(0, 0, 0);
  scene.add(pool, pool.target);
  const fill = new THREE.DirectionalLight(0xbfd8cf, 0.25);
  fill.position.set(-4, 3, 5);
  scene.add(fill);

  const brass = new THREE.MeshStandardMaterial({ color: COLORS.metal.clone(), metalness: 1, roughness: 0.16, envMapIntensity: 1.6 });
  const pendant = makePendant(brass.clone(), COLORS.glow);
  pendant.position.set(0, 3.45, 0);
  scene.add(pendant);

  /* --- the turntable of courses --- */
  const table = new THREE.Group();
  table.position.set(0, 0, -TABLE_R);
  scene.add(table);

  const stoneMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#151515'), roughness: 0.72, metalness: 0, envMapIntensity: 0.4 });
  const loader = new THREE.TextureLoader();
  const plates = COURSES.map((c, i) => {
    const g = new THREE.Group();
    const a = (i / COURSES.length) * Math.PI * 2; // course i sits at angle a on the table
    g.position.set(Math.sin(a) * TABLE_R, 0, Math.cos(a) * TABLE_R);
    // stone body: a thin disc with a softly bevelled edge
    const body = new THREE.Mesh(new THREE.CylinderGeometry(PLATE_R * 0.985, PLATE_R * 0.9, 0.035, 96, 1, false), stoneMat);
    body.position.y = 0.0175;
    // the dish photograph, laid on top
    const dishMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0, envMapIntensity: 0.25, alphaTest: 0.5, transparent: false });
    const dish = new THREE.Mesh(new THREE.CircleGeometry(PLATE_R, 96).rotateX(-Math.PI / 2), dishMat);
    dish.position.y = 0.036;
    // phones get 640 px dish photos (half the download, a quarter of the GPU memory)
    loader.load(import.meta.env.BASE_URL + (lite ? c.file.replace(/\.webp$/, '-sm.webp') : c.file), (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      dishMat.map = tex;
      dishMat.needsUpdate = true;
    });
    g.add(body, dish);
    // steam wisps above each plate
    const steam = [];
    for (let k = 0; k < 3; k++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.7), steamMaterial());
      m.position.set((k - 1) * 0.32, 0.9, (k - 1) * 0.1);
      g.add(m);
      steam.push(m);
    }
    table.add(g);
    return { g, steam, angle: a, dishMat };
  });

  /* --- the cloche over the first course --- */
  const cloche = makeCloche(brass);
  scene.add(cloche);

  /* --- layout --- */
  let width = 0, height = 0;
  const frame = { dist: 7, offY: 0 };
  function resize() {
    const parent = canvas.parentElement;
    const cw = parent.clientWidth, ch = parent.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch;
    const aspect = cw / ch;
    camera.aspect = aspect;
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // plate (2 wide, seen at ~38°) ≈ 44% of the width on desktop, 82% on phones
    const dW = 2.3 / (aspect < 0.7 ? 0.7 : aspect < 1.15 ? 0.56 : 0.44) / (aspect * t);
    const dH = 2.6 / 0.62 / t;
    frame.dist = Math.max(dW, dH);
    const offX = aspect > 1.15 ? -cw * 0.17 : 0;
    const offY = aspect > 1.15 ? -ch * 0.02 : ch * (aspect < 0.7 ? 0.07 : 0.11);
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


  let last = performance.now();
  let elapsed = 0;
  let running = false;
  let raf = 0;
  const elev = THREE.MathUtils.degToRad(36);

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

    // lights come up as the chapter opens
    const lightsUp = easeOut(range(p, 0.02, 0.14));
    pool.intensity = 26 * lightsUp;
    bgU.uGlowAmt.value = 0.9 * lightsUp;
    bgU.uBokeh.value = 0.55 * lightsUp;
    bgU.uWordOpacity.value = 0.55 * range(p, 0.05, 0.18);
    bgU.uWordCenter.value.set(lerp(2.4, -2.4, p), 2.4);
    bgU.uTime.value = t;

    // camera: a dining-height three-quarter view, drifting slightly with the pointer
    const orbit = ps.x * 0.12 + Math.sin(t * 0.15) * 0.03;
    const dist = frame.dist * (1 - Math.sin(Math.PI * range(p, 0.12, 0.9)) * 0.06);
    camera.position.set(Math.sin(orbit) * Math.cos(elev) * dist, Math.sin(elev) * dist + ps.y * 0.15, Math.cos(orbit) * Math.cos(elev) * dist);
    camera.lookAt(0, 0.15, 0);

    // the cloche: lifted straight up, tipped back, then carried out of frame
    const lift = easeInOut(range(p, 0.14, 0.3));
    cloche.position.set(lerp(0, -0.3, lift), lerp(0.036, 3.2, lift), lerp(0, -0.8, lift));
    cloche.rotation.set(lerp(0, -0.55, lift), 0, lerp(0, 0.12, lift));
    cloche.visible = lift < 0.999;

    // the table turns one course at a time
    const turn = turnAt(p);
    table.rotation.y = -turn * ((Math.PI * 2) / COURSES.length);

    // steam: a burst as the cloche lifts, then a gentle curl from whichever dish is in front
    plates.forEach((pl, i) => {
      const front = Math.max(0, 1 - Math.abs(turn - i) * 1.6);
      // only the dish under the pendant is lit; the others wait in shadow
      pl.dishMat.color.setScalar(0.3 + 0.7 * Math.max(0, 1 - Math.abs(turn - i) * 1.1));
      const burst = i === 0 ? Math.sin(Math.PI * range(p, 0.18, 0.36)) * 1.2 : 0;
      const amt = COURSES[i].hot ? (front * 0.55 + burst) * (i === 0 ? range(p, 0.17, 0.22) : 1) : 0;
      pl.steam.forEach((m) => {
        m.material.uniforms.uTime.value = t;
        m.material.uniforms.uAmt.value = amt;
        m.quaternion.copy(camera.quaternion); // face the camera
        m.visible = amt > 0.01;
      });
    });

    barU.uCenter.value.set(0, 0);
    barU.uReflect.value = 0.35;
    barU.uShadow.value = 1;
    barU.uCausticAmt.value = 0;

    renderer.render(scene, camera);
  }

  function loop() {
    if (!running) return;
    render();
    raf = requestAnimationFrame(loop);
  }

  function refreshPalette() {
    readPalette();
    room.copy(COLORS.bg);
    scene.background.copy(room);
    bgU.uBg.value.copy(room);
    bgU.uWordColor.value.copy(COLORS.brand);
    bgU.uGlow.value.copy(COLORS.glow);
    barTop.setColors(room, 0.55);
    brass.color.copy(COLORS.metal);
    pool.color.copy(COLORS.glow);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    turnAt,
    refreshWord: backdrop.refreshWord,
    renderOnce: render,
    start() {
      if (running) return;
      running = true;
      last = performance.now();
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
