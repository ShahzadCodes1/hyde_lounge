import * as THREE from 'three';
import { COLORS, readPalette } from '../home/scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment } from '../home/studio.js';

/* ==========================================================================
   RESERVE SCENE — your table, set.
   A polished black table, a gold-foiled ivory place card and a votive candle in
   cut glass. Scrolling lights the candle; as the guest fills in the form, the
   card is re-engraved live with their name, date, time and party size. When the
   request is sent, a foil "Requested" seal is pressed onto the card.
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const elerp = (a, b, t) => a * Math.pow(b / a, t);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

const CARD = { w: 1.7, h: 1.05, lean: 0.34, t: 0.014 };
const TW = 1600, TH = Math.round(1600 * (CARD.h / CARD.w));

/* ---------- the card artwork: colour, and a matching foil mask for metalness ---------- */
function drawCard(ctx, info, foilOnly) {
  const w = TW, h = TH;
  const ink = foilOnly ? '#fff' : '#b38a45';
  ctx.fillStyle = foilOnly ? '#000' : '#f1eadb';
  ctx.fillRect(0, 0, w, h);
  if (!foilOnly) { // a little paper tooth
    for (let i = 0; i < 2600; i++) { ctx.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = 6; ctx.strokeRect(46, 46, w - 92, h - 92);
  ctx.lineWidth = 2; ctx.strokeRect(68, 68, w - 136, h - 136);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.font = '600 34px "Manrope", sans-serif';
  ctx.fillText('H  Y  D  E     ·     A  D  L  I  Y  A', w / 2, 150);
  ctx.font = 'italic 300 150px "Cormorant Garamond", serif';
  ctx.fillText('Reserved', w / 2, 290);
  ctx.fillRect(w / 2 - 60, 385, 120, 3);
  if (!foilOnly) {
    ctx.fillStyle = '#1d2a24';
    ctx.font = '300 110px "Cormorant Garamond", serif';
    fitText(ctx, info.name || 'Your name', w / 2, 500, w - 280);
    ctx.font = '600 36px "Manrope", sans-serif';
    ctx.fillStyle = '#4b4232';
    const line = [info.date || 'Choose a date', info.time || 'a time', info.party ? `Table for ${info.party}` : ''].filter(Boolean).join('    ·    ');
    fitText(ctx, spaced(line), w / 2, 640, w - 260);
    if (info.occasion) {
      ctx.font = 'italic 300 60px "Cormorant Garamond", serif';
      ctx.fillStyle = '#9a3f26';
      ctx.fillText(info.occasion, w / 2, 735);
    }
  }
  if (info.sealed) { // the foil seal, pressed bottom-right
    const cx = w - 250, cy = h - 220, r = 110;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-0.18);
    ctx.fillStyle = foilOnly ? '#fff' : '#a8792f';
    ctx.beginPath();
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2, rr = r + (i % 2 ? 6 : -2); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = foilOnly ? '#000' : '#f1eadb'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, r - 18, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = foilOnly ? '#000' : '#f6eedc';
    ctx.font = '600 24px "Manrope", sans-serif';
    ctx.fillText('R E Q U E S T E D', 0, -14);
    ctx.font = 'italic 300 46px "Cormorant Garamond", serif';
    ctx.fillText('Hyde', 0, 26);
    ctx.restore();
  }
}
const spaced = (s) => s.toUpperCase().split('').join(' ');
function fitText(ctx, text, x, y, max) {
  let size = parseFloat(ctx.font.match(/(\d+(\.\d+)?)px/)[1]);
  while (ctx.measureText(text).width > max && size > 20) { size -= 4; ctx.font = ctx.font.replace(/\d+(\.\d+)?px/, `${size}px`); }
  ctx.fillText(text, x, y);
}

/* ---------- candle flame: a soft teardrop that breathes and flickers ---------- */
const flameMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uLit: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform float uTime; uniform float uLit; varying vec2 vUv;
    void main(){
      vec2 p = vUv - vec2(0.5, 0.18);
      float sway = sin(uTime * 7.0) * 0.015 + sin(uTime * 13.0) * 0.008;
      p.x -= sway * vUv.y * 2.0;
      float h = 0.62 * (0.92 + 0.08 * sin(uTime * 11.0));
      float w = 0.16 * (1.0 - smoothstep(0.0, h, p.y)) * smoothstep(-0.08, 0.06, p.y) + 0.0001;
      float d = abs(p.x) / w;
      float body = smoothstep(1.0, 0.2, d) * smoothstep(h, h * 0.4, p.y) * step(-0.1, p.y);
      float core = smoothstep(0.6, 0.0, d) * smoothstep(h * 0.55, 0.0, p.y) * smoothstep(-0.06, 0.03, p.y);
      float blue = smoothstep(0.05, -0.05, p.y) * smoothstep(1.0, 0.3, d) * step(-0.1, p.y);
      float halo = exp(-length((vUv - vec2(0.5, 0.35)) * vec2(1.6, 1.0)) * 6.0) * 0.35;
      vec3 col = vec3(1.0, 0.55, 0.18) * body + vec3(1.0, 0.92, 0.7) * core * 1.4 + vec3(0.2, 0.35, 1.0) * blue * 0.5 + vec3(1.0, 0.6, 0.25) * halo;
      float a = clamp(body + core + halo, 0.0, 1.0) * uLit;
      gl_FragColor = vec4(col * uLit, a);
      #include <colorspace_fragment>
    }`,
});

/* ==========================================================================
   createReserveScene(canvas, { lite })
   ========================================================================== */
export function createReserveScene(canvas, { lite = false } = {}) {
  readPalette();
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.debug.checkShaderErrors = false; // skip the blocking per-shader error readback (production)
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 1.75));
  renderer.toneMapping = THREE.NoToneMapping;

  const room = COLORS.bg.clone();
  const scene = new THREE.Scene();
  scene.background = room.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');
  scene.environmentIntensity = 0.9;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 120);

  /* --- set --- */
  const backdrop = createBackdrop({ word: 'Reserve', wordW: 13, wordY: 2.1, bg: room, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -4.5;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(0.6, 1.2);
  bgU.uWordCenter.value.set(1.4, 2.1);
  const table = createBarTop({ lite });
  scene.add(table.bar);
  table.setColors(room, 0.6);
  table.u.uFade.value.set(-1.6, -4.2);
  table.u.uShadow.value = 1;
  const reflScale = lite ? 0.35 : 0.55;

  /* --- the place card --- */
  const info = { name: '', date: '', time: '', party: 0, occasion: '', sealed: false };
  const mk = () => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; return c; };
  const artC = mk(), foilC = mk();
  const art = new THREE.CanvasTexture(artC); art.colorSpace = THREE.SRGBColorSpace; art.anisotropy = 8;
  const foil = new THREE.CanvasTexture(foilC); foil.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: art, metalnessMap: foil, metalness: 1, roughness: 0.62, envMapIntensity: 1.3 });
  // metalness 1 only where the foil mask is white; paper elsewhere
  face.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.72, 0.26, texture2D(metalnessMap, vMetalnessMapUv).g);`);
  };
  const paper = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9e1cf'), roughness: 0.8, envMapIntensity: 0.5 });
  const leafGeo = new THREE.BoxGeometry(CARD.w, CARD.h, CARD.t).translate(0, -CARD.h / 2, 0);
  const card = new THREE.Group();
  card.position.y = CARD.h * Math.cos(CARD.lean);
  const front = new THREE.Mesh(leafGeo, [paper, paper, paper, paper, face, paper]);
  front.rotation.x = -CARD.lean;
  const back = new THREE.Mesh(leafGeo, paper);
  back.rotation.x = CARD.lean;
  card.add(front, back);
  const cardRig = new THREE.Group();
  cardRig.add(card);
  cardRig.position.set(-0.2, 0, 0);
  cardRig.rotation.y = 0.18;
  scene.add(cardRig);

  let dirty = true;
  function redraw() {
    drawCard(artC.getContext('2d'), info, false);
    drawCard(foilC.getContext('2d'), info, true);
    art.needsUpdate = true; foil.needsUpdate = true;
    dirty = false;
  }

  /* --- the votive --- */
  const votive = new THREE.Group();
  votive.position.set(1.15, 0, -0.35);
  scene.add(votive);
  const holderGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0), new THREE.Vector2(0.27, 0), new THREE.Vector2(0.29, 0.02), new THREE.Vector2(0.3, 0.42), new THREE.Vector2(0.285, 0.42),
    new THREE.Vector2(0.272, 0.06), new THREE.Vector2(0, 0.055),
  ], lite ? 48 : 72);
  const holder = new THREE.Mesh(holderGeo, new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#f4efe4'), roughness: 0.02, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 2.2,
    clearcoat: 1, clearcoatRoughness: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  holder.renderOrder = 2;
  const waxMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#cfc2a8'), roughness: 0.75, emissive: new THREE.Color('#ffb066'), emissiveIntensity: 0 });
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 48).translate(0, 0.055 + 0.12, 0), waxMat);
  const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6).translate(0, 0.3, 0), new THREE.MeshBasicMaterial({ color: 0x111111 }));
  const flame = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.34).translate(0, 0.12, 0), flameMaterial());
  flame.position.y = 0.3;
  flame.renderOrder = 3;
  votive.add(wax, wick, holder, flame);
  const candle = new THREE.PointLight(0xffa04a, 0, 5, 1.6);
  candle.position.set(votive.position.x, 0.66, votive.position.z);
  scene.add(candle);

  /* --- light --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.06));
  const key = new THREE.SpotLight(COLORS.glow, 22, 12, 0.5, 0.7, 1.1);
  key.position.set(-1.6, 5, 3.2);
  key.target.position.set(-0.2, 0.4, 0);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(COLORS.haze.clone().multiplyScalar(2.2), 0.6);
  rim.position.set(3, 3, -4);
  scene.add(rim);

  /* --- state --- */
  const state = { lit: 0, step: -1, visit: 0, form: 0, pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2() };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  /* --- layout and poses --- */
  let width = 0, height = 0, aspect = 1;
  const t2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = (w, h, fw, fh) => Math.max(h / fh / t2, w / fw / (aspect * t2));
  const poses = {};
  function buildPoses() {
    // On phones the canvas is a window across the top of the screen (see reserve.css): centre the table in it.
    const band = canvas.clientHeight < window.innerHeight * 0.8;
    const wide = aspect > 1.15 && !band;
    const P = (az, elev, look, w, h) => ({
      az, elev, look,
      dist: band ? fit(w, h, 0.92, 0.72) : wide ? fit(w, h, 0.5, 0.8) : fit(w, h, 0.98, 0.4),
      ox: wide ? -0.22 : 0, oy: band ? -0.07 : wide ? 0 : 0.23,
    });
    poses.hero = P(-0.42, 0.3, new THREE.Vector3(0.35, 0.45, -0.1), 3.4, 2.0);
    poses.steps = [
      P(0.05, 0.2, new THREE.Vector3(0.1, 0.5, 0), 2.6, 1.5),   // when
      P(-0.3, 0.26, new THREE.Vector3(0.25, 0.45, -0.1), 3.0, 1.7), // who
      P(0.18, 0.14, new THREE.Vector3(-0.2, 0.52, 0), 2.25, 1.25),  // details: read the card
    ];
    poses.visit = P(0.5, 1.2, new THREE.Vector3(0.4, 0.2, -0.1), 3.4, 3.0);
  }
  function resize() {
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === width && Math.abs(ch - height) < 2) return;
    width = cw; height = ch; aspect = cw / ch;
    camera.aspect = aspect;
    buildPoses();
    renderer.setSize(cw, ch, false);
    table.resize(cw * renderer.getPixelRatio(), ch * renderer.getPixelRatio(), reflScale);
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /* --- frame --- */
  let last = performance.now(), elapsed = 0, running = false, raf = 0;
  const cur = { az: 0, elev: 0, dist: 1, ox: 0, oy: 0, look: new THREE.Vector3() };
  let first = true, seal = 0;

  function target() {
    const H = poses.hero, V = poses.visit;
    const S = state.step >= 0 ? poses.steps[state.step] : H;
    const f = easeInOut(clamp(state.form)), v = easeInOut(clamp(state.visit));
    const look = new THREE.Vector3().lerpVectors(H.look, S.look, f).lerp(V.look, v);
    return {
      az: lerp(lerp(H.az, S.az, f), V.az, v), elev: lerp(lerp(H.elev, S.elev, f), V.elev, v),
      dist: elerp(elerp(H.dist, S.dist, f), V.dist, v), ox: lerp(lerp(H.ox, S.ox, f), V.ox, v), oy: lerp(lerp(H.oy, S.oy, f), V.oy, v), look,
    };
  }

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; elapsed += dt;
    const t = elapsed;
    if (dirty) redraw();
    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;

    /* the candle */
    const lit = easeOut(clamp(state.lit));
    const flick = 0.86 + 0.08 * Math.sin(t * 9.3) + 0.06 * Math.sin(t * 23.1 + 1.3);
    flame.material.uniforms.uTime.value = t;
    flame.material.uniforms.uLit.value = lit;
    flame.scale.setScalar(0.4 + 0.6 * lit);
    flame.quaternion.copy(camera.quaternion);
    candle.intensity = 1.7 * lit * flick;
    waxMat.emissiveIntensity = 0.1 * lit * flick;
    key.intensity = lerp(14, 22, lit);

    /* the seal presses in */
    seal += ((info.sealed ? 1 : 0) - seal) * (1 - Math.pow(0.02, dt));
    cardRig.position.y = Math.sin(Math.min(1, seal) * Math.PI) * 0.06;

    /* camera eases to wherever the guest is */
    const T = target();
    const k = first ? 1 : 1 - Math.pow(0.04, dt);
    first = false;
    cur.az += (T.az - cur.az) * k; cur.elev += (T.elev - cur.elev) * k; cur.dist += (T.dist - cur.dist) * k;
    cur.ox += (T.ox - cur.ox) * k; cur.oy += (T.oy - cur.oy) * k; cur.look.lerp(T.look, k);
    const az = cur.az + ps.x * 0.1 + Math.sin(t * 0.15) * 0.03, elev = cur.elev + ps.y * 0.03;
    camera.position.set(cur.look.x + Math.sin(az) * Math.cos(elev) * cur.dist, cur.look.y + Math.sin(elev) * cur.dist, cur.look.z + Math.cos(az) * Math.cos(elev) * cur.dist);
    camera.lookAt(cur.look);
    camera.setViewOffset(width, height, cur.ox * width, cur.oy * height, width, height);

    bgU.uTime.value = t;
    bgU.uGlowAmt.value = 0.5 + 0.6 * lit;
    bgU.uBokeh.value = 0.35 + 0.45 * lit;
    bgU.uWordOpacity.value = 0.2 * (1 - clamp(state.visit));
    table.u.uReflect.value = 0.42;
    table.u.uCenter.value.set(-0.2, 0);
    table.u.uCaustic.value.set(votive.position.x, votive.position.z);
    table.u.uCausticColor.value.set('#ff9a48');
    table.u.uCausticAmt.value = 0.22 * lit * flick;

    renderer.render(scene, camera);
  }

  function loop() { if (!running) return; render(); raf = requestAnimationFrame(loop); }

  function refreshPalette() {
    readPalette();
    room.copy(COLORS.bg);
    scene.background.copy(room);
    bgU.uBg.value.copy(room);
    bgU.uWordColor.value.copy(COLORS.brand);
    table.setColors(room, 0.6);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    setCard(next) { Object.assign(info, next); dirty = true; if (!running) render(); },
    refreshText() { backdrop.refreshWord(); dirty = true; },
    renderOnce: render,
    compile() { redraw(); return renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera); },
    start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
