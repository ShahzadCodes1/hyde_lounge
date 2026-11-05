import * as THREE from 'three';
import { COLORS, readPalette } from '../home/scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment, canvasTex } from '../home/studio.js';
import { crystalMaterial, glowFromColor, surfaceTexture, spline, dedupe, V } from '../home/glassware.js';

/* ==========================================================================
   BRUNCH SCENE — the champagne tower.
   Fourteen crystal coupes stacked 1 · 4 · 9 on a polished brass tray, in warm
   afternoon light. A Hyde cuvée tips and pours into the top coupe; as you scroll
   through the packages the champagne overflows and cascades tier by tier, each
   glass filling with a fizzing mousse and a stream of rising bubbles.
   Camera poses: hero → packages → (dimmed behind the dishes) → macro on the
   bubbles in the top coupe → wide for the closing call.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const elerp = (a, b, t) => a * Math.pow(b / a, t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/* ---------- the coupe (units: the glass is 0.62 tall, 1.0 across the rim) ---------- */
const RIM = 0.62;
const BOWL_IN = dedupe([V(0, 0.462), ...spline([[0.2, 0.47], [0.34, 0.512], [0.44, 0.566], [0.488, 0.62]], 24)]);
const COUPE = dedupe([
  V(0, 0), V(0.29, 0), V(0.3, 0.008), V(0.298, 0.022), V(0.24, 0.03), V(0.06, 0.045), V(0.034, 0.07),
  V(0.032, 0.14), V(0.05, 0.165), V(0.032, 0.19), V(0.03, 0.38), V(0.05, 0.42),
  ...spline([[0.2, 0.44], [0.35, 0.49], [0.45, 0.552], [0.5, 0.616]], 24),
  V(0.498, 0.624), V(0.49, 0.622),
  ...[...BOWL_IN].reverse().slice(1),
]);
const LIQUID = dedupe([V(0, 0.465), ...spline([[0.2, 0.473], [0.336, 0.515], [0.436, 0.568], [0.482, 0.616]], 24)]);
const L_EMPTY = 0.466, L_FULL = 0.603;
function bowlRadius(y) {
  for (let i = 1; i < LIQUID.length; i++) {
    const a = LIQUID[i - 1], b = LIQUID[i];
    if (y >= a.y && y <= b.y) return lerp(a.x, b.x, (y - a.y) / Math.max(1e-6, b.y - a.y));
  }
  return y < LIQUID[0].y ? 0 : LIQUID[LIQUID.length - 1].x;
}

/* ---------- the bottle (mouth at the origin, body hanging below) ---------- */
const BOTTLE = dedupe([
  V(0, -1.6), V(0.26, -1.6), V(0.285, -1.58), V(0.295, -1.53),
  V(0.3, -0.82),
  ...spline([[0.29, -0.7], [0.24, -0.54], [0.16, -0.4], [0.122, -0.3]], 20),
  V(0.112, -0.12), V(0.12, -0.05), V(0.124, -0.02), V(0.105, 0), V(0, 0),
]);
const FOIL = dedupe([
  ...spline([[0.172, -0.46], [0.13, -0.33], [0.118, -0.22]], 12),
  V(0.118, -0.12), V(0.127, -0.05), V(0.13, -0.02), V(0.112, 0.004), V(0, 0.006),
]);

function bottleLabel() {
  return canvasTex(1024, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#efe5cf'); g.addColorStop(1, '#e2d4b4');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#b08d4c'; ctx.lineWidth = 4; ctx.strokeRect(20, 20, w - 40, h - 40);
    ctx.lineWidth = 1.5; ctx.strokeRect(34, 34, w - 68, h - 68);
    ctx.fillStyle = '#1e2a23'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const cx = w * 0.25; // the label wraps: centre the artwork on the side facing the camera
    ctx.font = '300 120px "Cormorant Garamond", serif';
    ctx.fillText('H Y D E', cx, 200);
    ctx.font = 'italic 300 58px "Cormorant Garamond", serif';
    ctx.fillStyle = '#9a3f26';
    ctx.fillText('Friday Cuvée', cx, 300);
    ctx.font = '600 22px "Manrope", sans-serif';
    ctx.fillStyle = '#5b4a2b';
    ctx.fillText('B R U T   ·   A D L I Y A', cx, 370);
  });
}

// a falling ribbon of champagne: bright core, soft edges, sparkle travelling down it
const streamMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  uniforms: { uColor: { value: new THREE.Color('#f6d98c') }, uAmt: { value: 0 }, uTime: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uAmt; uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){
      float facing = abs(dot(vN, vV));
      float flow = 0.75 + 0.25 * sin(vUv.x * 60.0 - uTime * 26.0) * sin(vUv.y * 6.283);
      float a = (0.35 + 0.65 * pow(facing, 0.6)) * flow * uAmt;
      a *= smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
      vec3 col = uColor * (0.9 + 0.8 * pow(1.0 - facing, 2.0));
      gl_FragColor = vec4(col, a);
      #include <colorspace_fragment>
    }`,
});

/* ==========================================================================
   createBrunchScene(canvas, { lite })
   ========================================================================== */
export function createBrunchScene(canvas, { lite = false } = {}) {
  readPalette();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75));
  renderer.localClippingEnabled = true;
  renderer.transmissionResolutionScale = lite ? 0.5 : 0.8;
  renderer.toneMapping = THREE.NoToneMapping;

  const room = COLORS.bg.clone();
  const scene = new THREE.Scene();
  scene.background = room.clone();
  scene.environment = softboxEnvironment(renderer, '#ffd9a0');
  scene.environmentIntensity = 1.05;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 140);

  /* --- set: warm afternoon wall and a polished bar --- */
  const backdrop = createBackdrop({ word: 'Brunch', wordW: 15, wordY: 2.4, bg: room, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -5.5;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(-1.2, 2.6);
  bgU.uWordCenter.value.set(1.6, 2.4);
  const floor = createBarTop({ lite });
  scene.add(floor.bar);
  floor.setColors(room, 0.7);
  floor.u.uFade.value.set(-2.2, -5.2);
  floor.u.uShadow.value = 1;
  const reflScale = lite ? 0.35 : 0.55;

  /* --- materials --- */
  const seg = lite ? 64 : 96;
  const brass = new THREE.MeshStandardMaterial({ color: COLORS.metal.clone(), metalness: 1, roughness: 0.16, envMapIntensity: 1.5 });
  const glass = crystalMaterial({ lite, env: 2.2 });
  glass.thickness = 0.04;
  // a fine bright edge so empty crystal reads against the dark room
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float edge = 1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
      totalEmissiveRadiance += vec3(1.0, 0.9, 0.74) * pow(edge, 3.0) * 0.32;`);
  };
  const champagne = new THREE.Color('#c99a3e');
  const surfaceTex = surfaceTexture();
  const PALE = new THREE.Color('#f7e3a8');

  /* --- tray --- */
  const TRAY_Y = 0.05;
  const tray = new THREE.Group();
  tray.add(new THREE.Mesh(new THREE.CylinderGeometry(1.95, 1.9, 0.04, 128).translate(0, 0.02, 0), brass));
  const lip = new THREE.Mesh(new THREE.TorusGeometry(1.95, 0.025, 16, 160).rotateX(Math.PI / 2), brass);
  lip.position.y = 0.045;
  tray.add(lip);
  scene.add(tray);

  /* --- the tower --- */
  const coupeGeo = new THREE.LatheGeometry(COUPE, seg);
  const liquidGeo = new THREE.LatheGeometry(LIQUID, seg);
  const discGeo = new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2);
  const slots = [{ tier: 0, x: 0, z: 0 }];
  [-0.5, 0.5].forEach((x) => [-0.5, 0.5].forEach((z) => slots.push({ tier: 1, x, z })));
  [-1, 0, 1].forEach((x) => [-1, 0, 1].forEach((z) => slots.push({ tier: 2, x, z })));
  // tiers: 0 = top (1), 1 = middle (2×2), 2 = base (3×3); feet rest on the rims below
  const glasses = slots.map((s) => {
    const y = TRAY_Y + (2 - s.tier) * RIM;
    const g = new THREE.Group();
    g.position.set(s.x, y, s.z);
    const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), y + L_EMPTY);
    const liqMat = new THREE.MeshStandardMaterial({ color: champagne.clone(), roughness: 0.1, envMapIntensity: 0.7, clippingPlanes: [plane], side: THREE.DoubleSide });
    glowFromColor(liqMat, 0.14, 0.8);
    const liquid = new THREE.Mesh(liquidGeo, liqMat);
    const surfMat = new THREE.MeshStandardMaterial({ map: surfaceTex, color: new THREE.Color(), roughness: 0.05, envMapIntensity: 1.2, emissive: new THREE.Color(), emissiveIntensity: 0.22 });
    const surface = new THREE.Mesh(discGeo, surfMat);
    g.add(liquid, surface, new THREE.Mesh(coupeGeo, glass));
    scene.add(g);
    return { ...s, y, group: g, plane, liquid, surface, surfMat, level: 0, flow: 0 };
  });
  const byTier = [0, 1, 2].map((t) => glasses.filter((g) => g.tier === t));
  const top = byTier[0][0];

  /* --- cascades: top → each middle glass; each base glass ← its nearest middle glass --- */
  const streams = [];
  function addStream(src, dst, tierFrom) {
    const dir = new THREE.Vector3(dst.x - src.x, 0, dst.z - src.z).normalize();
    const p0 = new THREE.Vector3(src.x, src.y + RIM, src.z).addScaledVector(dir, 0.5);
    const p3 = new THREE.Vector3(dst.x, dst.y + L_FULL - 0.02, dst.z).addScaledVector(dir, -0.1);
    const p1 = p0.clone().addScaledVector(dir, 0.05).add(new THREE.Vector3(0, -0.02, 0));
    const p2 = new THREE.Vector3(lerp(p0.x, p3.x, 0.75), lerp(p0.y, p3.y, 0.45), lerp(p0.z, p3.z, 0.75));
    const curve = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.011, 10, false), streamMaterial());
    m.renderOrder = 3;
    scene.add(m);
    streams.push({ mesh: m, tierFrom });
  }
  byTier[1].forEach((mid) => addStream(top, mid, 0));
  byTier[2].forEach((base) => {
    let best = null, bd = 1e9;
    byTier[1].forEach((mid) => { const d = Math.hypot(mid.x - base.x, mid.z - base.z); if (d < bd) { bd = d; best = mid; } });
    addStream(best, base, 1);
  });

  /* --- the bottle --- */
  const bottle = new THREE.Group();
  const greenGlass = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#0a2117'), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.8, specularIntensity: 1 });
  const foil = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a660'), metalness: 1, roughness: 0.32, envMapIntensity: 1.4 });
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.303, 0.303, 0.46, seg, 1, true, Math.PI * 0.25, Math.PI * 1.5), new THREE.MeshStandardMaterial({ map: bottleLabel(), roughness: 0.7, envMapIntensity: 0.5, side: THREE.DoubleSide }));
  label.position.y = -1.2;
  bottle.add(new THREE.Mesh(new THREE.LatheGeometry(BOTTLE, seg), greenGlass), new THREE.Mesh(new THREE.LatheGeometry(FOIL, seg), foil), label);
  scene.add(bottle);
  const pourStream = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 1, 10, 1, true).translate(0, -0.5, 0), streamMaterial());
  pourStream.material.uniforms.uColor.value.set('#f8e3a0');
  pourStream.renderOrder = 3;
  scene.add(pourStream);

  /* --- bubbles rising in every glass --- */
  const perGlass = lite ? 22 : 40;
  const N = glasses.length * perGlass;
  const bPos = new Float32Array(N * 3), bSeed = new Float32Array(N * 2), bIdx = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    bIdx[i] = Math.floor(i / perGlass);
    bSeed[i * 2] = Math.random(); bSeed[i * 2 + 1] = Math.random();
  }
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('aSeed', new THREE.BufferAttribute(bSeed, 2));
  bGeo.setAttribute('aIdx', new THREE.BufferAttribute(bIdx, 1));
  const bubbles = new THREE.Points(bGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() },
      uCenters: { value: glasses.map((g) => new THREE.Vector3(g.x, g.y, g.z)) },
      uLevels: { value: glasses.map(() => 0) },
    },
    vertexShader: /* glsl */ `
      attribute vec2 aSeed; attribute float aIdx;
      uniform float uTime; uniform float uPR; uniform vec3 uCenters[${glasses.length}]; uniform float uLevels[${glasses.length}];
      varying float vA;
      void main(){
        int i = int(aIdx + 0.5);
        vec3 c = uCenters[i];
        float lv = uLevels[i];                          // 0..1 fill
        float bottom = ${L_EMPTY.toFixed(3)}, depth = (${L_FULL.toFixed(3)} - bottom) * lv;
        float t = fract(uTime * (0.25 + aSeed.y * 0.35) + aSeed.x * 7.0);
        float y = bottom + 0.004 + t * depth;
        float r = 0.47 * sqrt(clamp((y - bottom) / 0.15, 0.0, 1.0)) * (0.15 + 0.7 * fract(aSeed.x * 31.7));
        float a = aSeed.x * 6.2831 + sin(uTime * 2.0 + aSeed.y * 9.0) * 0.08;
        vec3 p = c + vec3(cos(a) * r, y, sin(a) * r);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (1.6 + aSeed.y * 2.4) * uPR * 4.0 / max(0.2, -mv.z);
        vA = step(0.05, lv) * smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main(){ float d = length(gl_PointCoord - 0.5); float ring = smoothstep(0.5, 0.3, d) * (0.45 + 0.55 * smoothstep(0.15, 0.4, d));
        float a = ring * vA * 0.75; gl_FragColor = vec4(vec3(1.0, 0.95, 0.82) * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  bubbles.frustumCulled = false;
  bubbles.renderOrder = 4;
  scene.add(bubbles);
  const levelsU = bubbles.material.uniforms.uLevels.value;

  /* --- light: a low golden sun through the windows, a soft key, a cool rim --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const sun = new THREE.DirectionalLight(0xffcf8a, 1.6);
  sun.position.set(-6, 3.2, 2.5);
  scene.add(sun);
  const key = new THREE.SpotLight(COLORS.glow, 30, 16, 0.55, 0.6, 1.1);
  key.position.set(0.6, 7, 2.5);
  key.target.position.set(0, 1, 0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(COLORS.haze.clone().multiplyScalar(2.4), 0.9);
  rim.position.set(4, 3, -5);
  scene.add(rim);

  /* --- state --- */
  const state = {
    tilt: 0,   // bottle: held → pouring (hero scroll)
    fill: 0,   // the cascade: 0 empty → 1 every glass full (packages scroll)
    pack: 0,   // camera arrives at the packages pose
    macro: 0,  // eye level with the tower (the afternoon)
    orbit: 0,  // a slow turn round it while you read
    wide: 0,   // pulled back for the closing call
    pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(),
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  /* --- layout --- */
  let width = 0, height = 0, aspect = 1;
  const t2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = (w, h, fw, fh) => Math.max(h / fh / t2, w / fw / (aspect * t2));
  const poses = {};
  function buildPoses() {
    const wide = aspect > 1.15;
    poses.hero = wide
      ? { look: new THREE.Vector3(-0.3, 1.25, 0), az: 0.32, elev: 0.16, dist: fit(4.6, 3.3, 0.52, 0.82), ox: -0.21, oy: 0.03 }
      : { look: new THREE.Vector3(-0.55, 1.25, 0), az: 0.32, elev: 0.18, dist: fit(5.3, 3.3, 0.98, 0.44), ox: 0, oy: 0.26 };
    poses.pack = wide
      ? { look: new THREE.Vector3(0, 1.05, 0), az: -0.22, elev: 0.24, dist: fit(4.2, 2.8, 0.5, 0.78), ox: -0.21, oy: 0.02 }
      : { look: new THREE.Vector3(0, 1.05, 0), az: -0.22, elev: 0.26, dist: fit(4.4, 3.2, 0.98, 0.38), ox: 0, oy: 0.27 };
    poses.macro = wide
      ? { look: new THREE.Vector3(0, 1.45, 0), az: 0.5, elev: 0.06, dist: fit(2.6, 2.0, 0.42, 0.78), ox: -0.22, oy: 0 }
      : { look: new THREE.Vector3(0, 1.3, 0), az: 0.5, elev: 0.08, dist: fit(3.8, 2.4, 0.98, 0.4), ox: 0, oy: 0.24 };
    poses.wide = wide
      ? { look: new THREE.Vector3(0, 1.0, 0), az: 1.6, elev: 0.22, dist: fit(4.4, 3.2, 0.5, 0.82), ox: -0.21, oy: 0 }
      : { look: new THREE.Vector3(0, 1.0, 0), az: 1.6, elev: 0.24, dist: fit(4.4, 3.2, 0.98, 0.32), ox: 0, oy: 0.3 };
  }
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch; aspect = cw / ch;
    camera.aspect = aspect;
    buildPoses();
    renderer.setSize(cw, ch, false);
    floor.resize(cw * renderer.getPixelRatio(), ch * renderer.getPixelRatio(), reflScale);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* --- frame --- */
  let last = performance.now(), elapsed = 0, running = false, raf = 0;
  const look = new THREE.Vector3(), mouth = new THREE.Vector3(), aimTo = new THREE.Vector3();
  const B0 = { pos: new THREE.Vector3(-1.7, 1.55, 0.6), rot: -0.32 };
  const B1 = { pos: new THREE.Vector3(-0.36, top.y + RIM + 0.5, 0.02), rot: -2.02 };
  const B2 = { pos: new THREE.Vector3(-2.8, top.y + 3.4, -0.4), rot: -0.7 };

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; elapsed += dt;
    const t = elapsed;
    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;

    /* bottle: lifted in, tipped to pour */
    const tl = easeInOut(clamp(state.tilt));
    const f = clamp(state.fill);
    const away = easeInOut(range(f, 0.95, 1));
    bottle.position.lerpVectors(B0.pos, B1.pos, tl).lerp(B2.pos, away);
    bottle.position.y += Math.sin(t * 0.8) * 0.012 * (1 - tl);
    bottle.rotation.z = lerp(lerp(B0.rot, B1.rot, tl), B2.rot, away);
    bottle.rotation.y = lerp(0.5, 0, tl);
    bottle.visible = away < 0.999;
    const pouring = range(tl, 0.88, 0.98) * (1 - range(f, 0.94, 1));

    /* the cascade: top first, then the middle, then the base */
    bubbles.material.uniforms.uPR.value = renderer.getPixelRatio() * (1 + 0.6 * clamp(state.macro));
    const lvTop = Math.max(range(tl, 0.9, 1) * 0.35, range(f, 0, 0.22));
    const lvMid = range(f, 0.18, 0.55);
    const lvBase = (g) => range(f, 0.5 + 0.04 * (Math.abs(g.x) + Math.abs(g.z)), 0.92 + 0.04 * (Math.abs(g.x) + Math.abs(g.z)));
    glasses.forEach((g, i) => {
      const lv = g.tier === 0 ? lvTop : g.tier === 1 ? lvMid : lvBase(g);
      const flowing = lv > 0.002 && lv < 0.995 ? 1 : 0;
      g.flow += (flowing - g.flow) * (1 - Math.pow(0.03, dt));
      g.level = lv;
      levelsU[i] = lv;
      const y = lerp(L_EMPTY, L_FULL, lv);
      g.plane.constant = g.y + y;
      g.liquid.visible = lv > 0.003;
      g.surface.visible = lv > 0.003;
      const r = bowlRadius(y) * 0.996;
      g.surface.position.y = y + 0.001;
      g.surface.scale.set(Math.max(r, 0.001), 1, Math.max(r, 0.001));
      // a pale, lively mousse while it pours; settles to clear gold
      g.surfMat.color.copy(champagne).lerp(PALE, 0.38 + 0.4 * g.flow);
      g.surfMat.emissive.copy(g.surfMat.color);
    });
    const baseFull = byTier[2].every((g) => g.level >= 0.995);
    const tierFlow = [
      lvTop >= 0.99 ? (lvMid < 0.995 ? 1 : pouring) : 0,
      lvMid >= 0.99 ? (!baseFull ? 1 : pouring) : 0,
    ];
    streams.forEach((s) => {
      s.mesh.material.uniforms.uAmt.value = s.tierFrom === 0 ? tierFlow[0] : tierFlow[1];
      s.mesh.material.uniforms.uTime.value = t;
    });

    // the pour from the bottle's mouth to the top coupe
    bottle.updateMatrixWorld();
    mouth.set(0, 0.01, 0); bottle.localToWorld(mouth);
    aimTo.set(top.x - 0.06, top.y + lerp(L_EMPTY, L_FULL, lvTop), top.z);
    const len = mouth.distanceTo(aimTo);
    pourStream.position.copy(mouth);
    pourStream.scale.set(1, len, 1);
    pourStream.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), aimTo.clone().sub(mouth).normalize());
    pourStream.material.uniforms.uAmt.value = pouring;
    pourStream.material.uniforms.uTime.value = t;
    pourStream.visible = pouring > 0.01;
    bubbles.material.uniforms.uTime.value = t;

    /* camera: hero → packages → macro → wide */
    const pk = easeInOut(clamp(state.pack)), mc = easeInOut(clamp(state.macro)), wd = easeInOut(clamp(state.wide));
    const H = poses.hero, P = poses.pack, M = poses.macro, W = poses.wide;
    let az = lerp(H.az, P.az, pk) + t * 0.0, elev = lerp(H.elev, P.elev, pk), dist = elerp(H.dist, P.dist, pk);
    let ox = lerp(H.ox, P.ox, pk), oy = lerp(H.oy, P.oy, pk);
    look.lerpVectors(H.look, P.look, pk);
    az = lerp(az, M.az + clamp(state.orbit) * 1.1, mc); elev = lerp(elev, M.elev, mc); dist = elerp(dist, M.dist, mc); ox = lerp(ox, M.ox, mc); oy = lerp(oy, M.oy, mc); look.lerp(M.look, mc);
    az = lerp(az, W.az, wd); elev = lerp(elev, W.elev, wd); dist = elerp(dist, W.dist, wd); ox = lerp(ox, W.ox, wd); oy = lerp(oy, W.oy, wd); look.lerp(W.look, wd);
    az += ps.x * 0.12 + Math.sin(t * 0.12) * 0.04; elev += ps.y * 0.04;
    camera.position.set(look.x + Math.sin(az) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, look.z + Math.cos(az) * Math.cos(elev) * dist);
    camera.lookAt(look);
    camera.setViewOffset(width, height, ox * width, oy * height, width, height);

    /* set */
    const glow = easeOut(Math.max(range(tl, 0.6, 1), f));
    bgU.uTime.value = t;
    bgU.uGlowAmt.value = 1.2 + 0.8 * glow;
    bgU.uBokeh.value = 0.75 + 0.35 * glow;
    bgU.uWordOpacity.value = 0.26 * (1 - mc);
    floor.u.uReflect.value = 0.42;
    floor.u.uCenter.value.set(0, 0);
    floor.u.uCaustic.value.set(0.2, 0.4);
    floor.u.uCausticColor.value.copy(champagne);
    floor.u.uCausticAmt.value = 0.08 + 0.14 * f;

    renderer.render(scene, camera);
  }

  function loop() { if (!running) return; render(); raf = requestAnimationFrame(loop); }

  function refreshText() {
    backdrop.refreshWord();
    const m = label.material; const n = bottleLabel(); m.map.dispose(); m.map = n; m.needsUpdate = true;
  }

  function refreshPalette() {
    readPalette();
    room.copy(COLORS.bg);
    scene.background.copy(room);
    bgU.uBg.value.copy(room);
    bgU.uWordColor.value.copy(COLORS.brand);
    floor.setColors(room, 0.7);
    brass.color.copy(COLORS.metal);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    refreshText,
    renderOnce: render,
    compile() { return renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera); },
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
