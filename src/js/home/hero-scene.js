import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createRingSign, SIGN } from './ring-sign.js';
import { COLORS, readPalette } from './scene-colors.js';

/* ==========================================================================
   HERO SCENE — the Hyde LED-ring sign, rebuilt in WebGL.
   The ring sign itself lives in ring-sign.js; this file is the stage:
   warm haze, dust and smoke. Scroll drives a camera dive through the ring.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeIn = (t) => t * t * t;

// framing: fit the outer brass band (the bezel may kiss the edges on phones)
const RING_SPAN = SIGN.outer * 2 + 0.3;

/* ---------- textures drawn on canvas ---------- */

function makeWordTexture(text) {
  const w = 4096;
  const h = 900;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.font = 'italic 300 640px "Cormorant Garamond", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(text, w / 2, h / 2 + 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, aspect: w / h };
}

function makeGlowTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------- shaders ---------- */

const NOISE = /* glsl */ `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
`;

const smokeMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.22 }, uColor: { value: COLORS.haze } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv;
      ${NOISE}
      void main(){
        vec2 uv = vUv * vec2(2.4, 1.5);
        float t = uTime * 0.035;
        float n = fbm(uv + vec2(t, -t * 0.6) + fbm(uv * 1.4 - vec2(t * 0.7, t)));
        float mask = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.5, vUv.y) * smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
        float a = smoothstep(0.42, 0.95, n) * mask * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });

const dustMaterial = (pixelRatio) =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 42 },
      uPixelRatio: { value: pixelRatio },
      uOpacity: { value: 0 },
      uColor: { value: new THREE.Color() },
    },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime; uniform float uSize; uniform float uPixelRatio;
      varying float vAlpha;
      void main(){
        vec3 p = position;
        p.y += sin(uTime * 0.18 + aSeed * 6.2831) * 0.35 + uTime * 0.02 * (0.3 + aSeed);
        p.y = mod(p.y + 4.5, 9.0) - 4.5;
        p.x += cos(uTime * 0.13 + aSeed * 11.0) * 0.25;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = uSize * uPixelRatio * (0.35 + aSeed) / max(0.2, -mv.z);
        gl_PointSize = min(size, 40.0 * uPixelRatio);
        vAlpha = smoothstep(0.0, 1.2, -mv.z) * (0.25 + 0.75 * fract(aSeed * 7.31));
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vAlpha;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vAlpha * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
  });

const FinishShader = {
  uniforms: { tDiffuse: { value: null }, uAberration: { value: 0.002 }, uVignette: { value: 0.85 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAberration; uniform float uVignette; varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      vec2 off = c * uAberration * (0.5 + d);
      vec4 col = texture2D(tDiffuse, vUv);
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col.rgb *= mix(1.0, smoothstep(0.95, 0.2, d), uVignette);
      gl_FragColor = col;
    }`,
};

/* ==========================================================================
   createHeroScene
   ========================================================================== */
export function createHeroScene(canvas, { lite = false, reduced = false } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch (err) {
    return null; // no WebGL — caller shows the CSS fallback
  }
  const dpr = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.NoToneMapping;

  readPalette();
  const scene = new THREE.Scene();
  const bg = COLORS.bg.clone();
  scene.background = bg;
  scene.fog = new THREE.FogExp2(bg, 0.045);

  const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
  const world = new THREE.Group(); // receives pointer parallax
  scene.add(world);
  const sign = new THREE.Group(); // the ring sign
  world.add(sign);

  /* --- environment: a soft studio reflection so brass and letters read as real metal --- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.13;
  pmrem.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  /* --- the sign --- */
  const ringSign = createRingSign({ COLORS, lite });
  sign.add(ringSign.group);

  /* --- halo glow on the "wall" behind the sign --- */
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: makeGlowTexture(), color: COLORS.halo, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  halo.position.z = -0.9;
  sign.add(halo);

  /* --- smoke + giant background word + dust --- */
  const smoke = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), smokeMaterial());
  smoke.position.z = -2.2;
  world.add(smoke);

  let word = null;
  const dustCount = lite ? 320 : 900;
  const dustGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(dustCount * 3);
  const seed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 12;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
    pos[i * 3 + 2] = -6 + Math.random() * 26;
    seed[i] = Math.random();
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dust = new THREE.Points(dustGeo, dustMaterial(dpr));
  dust.frustumCulled = false;
  scene.add(dust);

  /* --- post-processing --- */
  // Multisampled target: crisp edges on the letters and rings (cheaper sample count on lite devices).
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lite ? 2 : 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.45, 0.9);
  composer.addPass(bloom);
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);
  composer.addPass(new OutputPass());

  /* --- background word + font-dependent textures load async --- */
  const ready = (async () => {
    await Promise.all([
      document.fonts?.load('600 64px Manrope'),
      document.fonts?.load('italic 300 640px "Cormorant Garamond"'),
    ]).catch(() => {});
    const w = makeWordTexture('After Dark');
    const ww = 26;
    word = new THREE.Mesh(
      new THREE.PlaneGeometry(ww, ww / w.aspect),
      new THREE.MeshBasicMaterial({ map: w.tex, color: COLORS.brand, transparent: true, opacity: 0, depthWrite: false })
    );
    word.position.set(4, -0.2, -5.5);
    world.add(word);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera).catch(() => {});
    else renderer.compile(scene, camera);
  })();

  /* --- layout --- */
  let baseZ = 11;
  let baseY = 0;
  let width = 0;
  let height = 0;
  function resize() {
    const parent = canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (w === width && Math.abs(h - height) < 2) return;
    width = w;
    height = h;
    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w * (lite ? 0.35 : 0.5), h * (lite ? 0.35 : 0.5));
    const t = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const zByHeight = RING_SPAN / 0.64 / t;
    const widthFill = aspect < 0.6 ? 0.84 : aspect < 1.1 ? 0.66 : 0.62; // phone / tablet / desktop
    const zByWidth = RING_SPAN / widthFill / (aspect * t);
    baseZ = Math.max(zByHeight, zByWidth);
    // portrait: lift the ring so copy can sit below it
    const visibleH = baseZ * t;
    baseY = aspect < 0.6 ? -visibleH * 0.19 : aspect < 1.1 ? -visibleH * 0.13 : -visibleH * 0.02;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas.parentElement);

  /* --- state driven from outside (intro + scroll) --- */
  const state = {
    intro: reduced ? 1 : 0, // 0..1 bulbs light up, logo ignites
    progress: 0, // 0..1 scroll through hero
    pointer: new THREE.Vector2(),
    pointerSmooth: new THREE.Vector2(),
  };

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  /* --- frame loop --- */
  let last = performance.now();
  let running = false;
  let elapsed = 0;

  function frame() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    elapsed += dt;
    const t = elapsed;
    const p = state.progress;
    const intro = state.intro;

    // pointer / idle sway
    if (lite) state.pointer.set(Math.sin(t * 0.35) * 0.35, Math.cos(t * 0.27) * 0.25);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.04, dt));
    const ps = state.pointerSmooth;

    // camera: settle in on intro, then dive through the ring on scroll
    const dive = easeIn(range(p, 0.08, 0.86));
    const introPush = (1 - easeInOut(intro)) * 2.4;
    const camY = baseY * (1 - dive);
    camera.position.set(ps.x * 0.35 * (1 - dive), camY + ps.y * 0.22 * (1 - dive), lerp(baseZ + introPush, -5, dive));
    camera.lookAt(0, camY, camera.position.z - 10);
    world.rotation.y = ps.x * 0.12 * (1 - dive);
    world.rotation.x = -ps.y * 0.08 * (1 - dive);

    sign.rotation.z = p * 0.35 + Math.sin(t * 0.2) * 0.012;
    sign.rotation.x = range(p, 0.2, 0.7) * -0.2;
    // a slow, almost imperceptible turn so light travels across the metal
    sign.rotation.y = Math.sin(t * 0.17) * 0.06 * (1 - p);

    ringSign.update({ t, intro, p, ps });

    halo.material.opacity = (0.32 + 0.04 * Math.sin(t * 1.3)) * range(intro, 0.3, 1) * (1 - range(p, 0.35, 0.65));

    if (word) {
      word.material.opacity = 0.24 * range(intro, 0.5, 1) * (1 - range(p, 0.5, 0.75));
      word.position.x = lerp(4, -6, p) + Math.sin(t * 0.1) * 0.2;
    }

    smoke.material.uniforms.uTime.value = t;
    smoke.material.uniforms.uOpacity.value = 0.34 + range(p, 0.2, 0.7) * 0.22;
    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = range(intro, 0.2, 1) * (0.85 + range(p, 0.3, 0.8) * 0.6);

    // colour shift: night → the palette's chapter colour as we come through the ring
    const shift = easeInOut(range(p, 0.66, 0.95));
    bg.copy(COLORS.bg).lerp(COLORS.chapter, shift);
    scene.fog.color.copy(bg);
    dust.material.uniforms.uColor.value.copy(COLORS.dust).lerp(COLORS.onChapter, shift);

    bloom.strength = 0.85 + range(p, 0.15, 0.7) * 0.35 - shift * 0.6;
    finish.uniforms.uAberration.value = 0.0025 + Math.sin(Math.PI * range(p, 0.35, 0.95)) * 0.0055;
    finish.uniforms.uVignette.value = 0.85 - shift * 0.7;

    composer.render(dt);
  }

  function loop() {
    if (!running) return;
    frame();
    raf = requestAnimationFrame(loop);
  }
  let raf = 0;

  // Re-read palette tokens (live palette switching). Materials hold references to COLORS, so this is enough.
  function refreshPalette() {
    readPalette();
    ringSign.applyColors();
    halo.material.color.copy(COLORS.halo);
    if (word) word.material.color.copy(COLORS.brand);
    if (!running) frame();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    ready,
    refreshPalette,
    state,
    renderOnce: frame,
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
    dispose() {
      this.stop();
      ro.disconnect();
      composer.dispose();
      renderer.dispose();
    },
  };
}
