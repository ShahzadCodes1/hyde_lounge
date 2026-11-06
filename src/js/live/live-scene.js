import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { COLORS, readPalette } from '../home/scene-colors.js';
import { createBackdrop, createBarTop, softboxEnvironment, canvasTex, wordTexture, blankWord } from '../home/studio.js';
import { rejectSoftware, governor } from '../core/quality.js';
import { beamMaterial } from '../home/stage-scene.js';

/* ==========================================================================
   LIVE SCENE — the turntable.
   A lacquered black deck with a brushed-aluminium platter (strobe dots lit by the
   little orange lamp), a vinyl record with real groove sheen, a Hyde label, and
   an S-shaped chrome tonearm. Scroll cues the arm: it lifts, swings over the
   record and lowers the needle; the platter spins up and the stage lights come on,
   tinted by whichever night (or artist) you are reading about.
   Camera poses: hero (three-quarter) → week (lower, record up top) → macro (the
   needle in the groove) → top (record from directly above, behind the footage).
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const elerp = (a, b, t) => a * Math.pow(b / a, t); // distances feel even when they change by a ratio
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

// deck layout (world units)
const DECK = { w: 4.8, d: 3.8, h: 0.34, feet: 0.12 };
const TOP = DECK.feet + DECK.h;                  // deck surface
const PC = new THREE.Vector3(-0.5, TOP, 0);      // platter centre
const PLATTER = { r: 1.62, h: 0.16, gap: 0.02 };
const REC = { r: 1.5, t: 0.024, label: 0.52 };
const REC_TOP = TOP + PLATTER.gap + PLATTER.h + REC.t;
const PIVOT = new THREE.Vector3(1.62, 0, -1.05);
const ARM = { len: 1.95, offset: 0.4, drop: 0.16 };
const ARM_Y = REC_TOP + ARM.drop + 0.004;        // arm height: the stylus just meets the vinyl
const RPM = (33.333 / 60) * Math.PI * 2;         // 33⅓ in radians per second

/* ---------- textures ---------- */
// strobe dots round the platter rim (four rows, as on the classic decks)
function strobeTexture() {
  const tex = canvasTex(2048, 160, (ctx, w, h) => {
    ctx.fillStyle = '#4a4e52'; ctx.fillRect(0, 0, w, h);
    const rows = [183, 180, 168, 165];
    rows.forEach((n, r) => {
      const y = 22 + r * 36, step = w / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = '#c9cdd0';
        ctx.beginPath(); ctx.arc(i * step + step / 2, y, step * 0.28, 0, Math.PI * 2); ctx.fill();
      }
    });
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// groove roughness: a run of tracks separated by smooth, shiny gaps, then the run-out
function grooveTexture() {
  return canvasTex(1024, 1024, (ctx, w) => {
    const c = w / 2, px = (r) => (r / REC.r) * c; // world radius → pixels
    ctx.fillStyle = 'rgb(105,105,105)'; ctx.fillRect(0, 0, w, w);
    // fine groove texture: many thin rings of slightly different roughness
    for (let r = px(REC.label + 0.02); r < px(REC.r); r += 1.3) {
      const g = 92 + Math.floor(Math.random() * 30);
      ctx.strokeStyle = `rgb(${g},${g},${g})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.stroke();
    }
    const ring = (r0, r1, g) => {
      ctx.strokeStyle = `rgb(${g},${g},${g})`; ctx.lineWidth = px(r1 - r0);
      ctx.beginPath(); ctx.arc(c, c, px((r0 + r1) / 2), 0, Math.PI * 2); ctx.stroke();
    };
    ring(1.47, 1.5, 34);                                  // lead-in edge
    [1.26, 1.08, 0.93, 0.8].forEach((r) => ring(r - 0.006, r + 0.006, 30)); // track gaps
    ring(REC.label + 0.02, 0.7, 40);                      // run-out
  }, false);
}

// anisotropy direction: the highlight on vinyl stretches along the radius (across the grooves)
function anisotropyTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5, v = 1 - (y + 0.5) / S - 0.5;
      const l = Math.hypot(u, v) || 1;
      const i = (y * S + x) * 4;
      img.data[i] = (u / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (v / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// the record label artwork (printed in champagne over the tinted paper)
function drawLabel(ctx, w) {
  const c = w / 2;
  ctx.clearRect(0, 0, w, w);
  const ink = 'rgba(232,211,164,0.95)';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(c, c, c * 0.93, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(c, c, c * 0.88, 0, Math.PI * 2); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '300 172px "Cormorant Garamond", serif';
  ctx.fillText('H Y D E', c, c - 175);
  ctx.font = '600 30px "Manrope", sans-serif';
  ctx.fillText('L O U N G E   ·   B A H R A I N', c, c - 70);
  ctx.font = 'italic 300 84px "Cormorant Garamond", serif';
  ctx.fillText('Live Nights', c, c + 140);
  ctx.font = '600 26px "Manrope", sans-serif';
  ctx.fillText('S I D E   A   ·   3 3 ⅓   R P M', c, c + 222);
  // text round the rim
  const rim = 'EIGHT TILL LATE  ·  ADLIYA BLOCK 338  ·  EVERY NIGHT  ·  ';
  ctx.font = '600 24px "Manrope", sans-serif';
  const R = c * 0.8;
  [...rim].forEach((ch, i) => {
    const a = (i / rim.length) * Math.PI * 2 - Math.PI / 2;
    ctx.save(); ctx.translate(c + Math.cos(a) * R, c + Math.sin(a) * R); ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0); ctx.restore();
  });
  // spindle hole
  ctx.fillStyle = '#050505';
  ctx.beginPath(); ctx.arc(c, c, 26, 0, Math.PI * 2); ctx.fill();
}

/* ==========================================================================
   createLiveScene(canvas, { lite })
   ========================================================================== */
export function createLiveScene(canvas, { lite = false } = {}) {
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
  renderer.toneMapping = THREE.NoToneMapping;

  const stage = COLORS.stage.clone();
  const scene = new THREE.Scene();
  scene.background = stage.clone();
  scene.environment = softboxEnvironment(renderer, '#ffcf96');
  scene.environmentIntensity = 1.0;
  const camera = new THREE.PerspectiveCamera(28, 1, 0.05, 160);

  /* --- back wall and floor --- */
  const backdrop = createBackdrop({ word: 'Live', wordW: 15, wordY: 3.4, bg: stage, brand: COLORS.brand, glow: COLORS.glow, haze: COLORS.haze });
  backdrop.mesh.position.z = -7;
  scene.add(backdrop.mesh);
  const bgU = backdrop.u;
  bgU.uGlowCenter.value.set(0, 3);
  const floor = createBarTop({ lite });
  scene.add(floor.bar);
  floor.setColors(stage, 1.5);
  floor.u.uFade.value.set(-2.4, -6.6);
  floor.u.uShadow.value = 1;
  let reflScale = lite ? 0.35 : 0.55;
  // the giant word, thrown onto the stage floor behind the deck like a gobo, in the night's colour
  let goboWord = blankWord(); // drawn by refreshText() once the font is in
  const goboMat = new THREE.MeshBasicMaterial({ map: goboWord.tex, color: new THREE.Color(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const gobo = new THREE.Mesh(new THREE.PlaneGeometry(14, 14 / goboWord.aspect).rotateX(-Math.PI / 2), goboMat);
  gobo.position.set(-0.4, 0.004, -4.3);
  gobo.renderOrder = 2;
  scene.add(gobo);

  /* --- materials --- */
  const seg = lite ? 96 : 160;
  const lacquer = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#020202'), roughness: 0.3, specularIntensity: 0.12, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 0.6 });
  const chrome = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9ecec'), metalness: 1, roughness: 0.08, envMapIntensity: 1.8 });
  const brass = new THREE.MeshStandardMaterial({ color: COLORS.metal.clone(), metalness: 1, roughness: 0.22, envMapIntensity: 1.5 });
  const satin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141414'), metalness: 0.6, roughness: 0.38, envMapIntensity: 1 });
  const alu = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d7dadc'), metalness: 1, roughness: 0.3, envMapIntensity: 1.3, map: strobeTexture() });
  const aluTop = new THREE.MeshStandardMaterial({ color: new THREE.Color('#8d9195'), metalness: 1, roughness: 0.35, envMapIntensity: 1.1 });

  /* --- the deck --- */
  const deck = new THREE.Group();
  scene.add(deck);
  const plinth = new THREE.Mesh(new RoundedBoxGeometry(DECK.w, DECK.h, DECK.d, 5, 0.07), lacquer);
  plinth.position.set(0, DECK.feet + DECK.h / 2, 0);
  deck.add(plinth);
  // brass feet
  const footGeo = new THREE.CylinderGeometry(0.24, 0.27, DECK.feet, 48).translate(0, DECK.feet / 2, 0);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
    const f = new THREE.Mesh(footGeo, brass);
    f.position.set(sx * (DECK.w / 2 - 0.42), 0, sz * (DECK.d / 2 - 0.42));
    deck.add(f);
  });
  // a hairline of brass round the top edge
  const trim = new THREE.Mesh(new RoundedBoxGeometry(DECK.w + 0.012, 0.018, DECK.d + 0.012, 3, 0.008), brass);
  trim.position.y = TOP - 0.05;
  deck.add(trim);

  // start / stop, speed buttons, pitch fader, strobe lamp
  const start = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.05, 0.38, 3, 0.02), chrome);
  start.position.set(-1.92, TOP + 0.02, 1.48);
  deck.add(start);
  ['33', '45'].forEach((_, i) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.04, 0.2, 3, 0.015), satin);
    b.position.set(-1.38 + i * 0.36, TOP + 0.015, 1.6);
    deck.add(b);
  });
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.01, 1.05), new THREE.MeshBasicMaterial({ color: 0x020202 }));
  slot.position.set(2.12, TOP + 0.001, 0.62);
  const fader = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.09, 0.14, 3, 0.03), chrome);
  fader.position.set(2.12, TOP + 0.04, 0.5);
  deck.add(slot, fader);
  const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 32), chrome);
  lampBase.position.set(-2.2, TOP + 0.03, 1.02);
  const lampHead = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c') }));
  lampHead.position.set(-2.2, TOP + 0.09, 1.02);
  deck.add(lampBase, lampHead);
  const lamp = new THREE.PointLight(0xff8a2a, 0, 1.6, 1.4);
  lamp.position.set(-2.12, TOP + 0.12, 0.95);
  deck.add(lamp);

  /* --- platter, mat and record (they spin together) --- */
  const disc = new THREE.Group();
  disc.position.set(PC.x, TOP + PLATTER.gap, PC.z);
  deck.add(disc);
  const platter = new THREE.Mesh(new THREE.CylinderGeometry(PLATTER.r, PLATTER.r * 0.985, PLATTER.h, seg, 1), [alu, aluTop, aluTop]);
  platter.position.y = PLATTER.h / 2;
  platter.material[0].map.repeat.set(1, 1);
  disc.add(platter);

  const recordMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#060606'), roughness: 1, roughnessMap: grooveTexture(), ior: 1.8,
    anisotropy: 0.92, anisotropyMap: anisotropyTexture(), envMapIntensity: 1.5,
  });
  const record = new THREE.Mesh(new THREE.CircleGeometry(REC.r, seg).rotateX(-Math.PI / 2), recordMat);
  record.position.y = PLATTER.h + REC.t;
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(REC.r, REC.r, REC.t, seg, 1, true), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 }));
  edge.position.y = PLATTER.h + REC.t / 2;
  const labelPaper = new THREE.MeshStandardMaterial({ color: new THREE.Color(), roughness: 0.6, envMapIntensity: 0.4 });
  const label = new THREE.Mesh(new THREE.CircleGeometry(REC.label, 96).rotateX(-Math.PI / 2), labelPaper);
  label.position.y = PLATTER.h + REC.t + 0.001;
  const labelTex = canvasTex(1024, 1024, drawLabel);
  const labelInk = new THREE.Mesh(new THREE.CircleGeometry(REC.label, 96).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: labelTex, emissiveMap: labelTex, emissive: new THREE.Color('#5a4c34'), transparent: true, roughness: 0.45, metalness: 0.2, envMapIntensity: 1.2 }));
  labelInk.position.y = label.position.y + 0.001;
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.16, 24), chrome);
  spindle.position.y = PLATTER.h + REC.t + 0.07;
  disc.add(record, edge, label, labelInk, spindle);

  /* --- tonearm --- */
  const base = new THREE.Group();
  base.position.set(PIVOT.x, TOP, PIVOT.z);
  deck.add(base);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.44, 0.05, 64).translate(0, 0.025, 0), chrome);
  const ring2 = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.035, 64).translate(0, 0.067, 0), satin);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, ARM_Y - TOP - 0.06, 32).translate(0, (ARM_Y - TOP - 0.06) / 2, 0), satin);
  base.add(ring, ring2, column);

  const arm = new THREE.Group();          // swings about Y
  arm.position.set(PIVOT.x, ARM_Y, PIVOT.z);
  deck.add(arm);
  const tilt = new THREE.Group();         // lifts about X
  arm.add(tilt);
  const gimbal = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.13, 32), chrome);
  const gimbalRing = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 12, 48).rotateX(Math.PI / 2), brass);
  tilt.add(gimbal, gimbalRing);
  // the tube: straight from the gimbal, with a gentle S-bend before the headshell
  const tubePath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, -0.36),
    new THREE.Vector3(0, 0, 0.4),
    new THREE.Vector3(-0.06, 0, 1.15),
    new THREE.Vector3(0.02, 0, 1.7),
    new THREE.Vector3(0, 0, ARM.len),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(tubePath, 96, 0.032, 20, false), chrome);
  tilt.add(tube);
  // counterweight
  const cw = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 48).rotateX(Math.PI / 2), satin);
  cw.position.z = -0.52;
  const cwRing = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.03, 48).rotateX(Math.PI / 2), brass);
  cwRing.position.z = -0.42;
  tilt.add(cw, cwRing);
  // headshell, cartridge and stylus
  const head = new THREE.Group();
  head.position.z = ARM.len;
  head.rotation.y = ARM.offset;
  tilt.add(head);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.12, 24).rotateX(Math.PI / 2), brass);
  collar.position.z = 0.04;
  const shell = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.03, 0.36, 3, 0.012), satin);
  shell.position.set(0, 0, 0.27);
  const lift = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 12).rotateZ(Math.PI / 2), chrome);
  lift.position.set(0.18, 0.02, 0.3);
  const cart = new THREE.Mesh(new RoundedBoxGeometry(0.15, 0.1, 0.22, 3, 0.02), brass);
  cart.position.set(0, -0.065, 0.28);
  const cantilever = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.004, 0.08, 8).rotateX(-0.9), chrome);
  cantilever.position.set(0, -0.13, 0.36);
  head.add(collar, shell, lift, cart, cantilever);

  // where the stylus tip sits in the arm's frame (ignoring the lift)
  const TIP = new THREE.Vector3(Math.sin(ARM.offset) * 0.38, -ARM.drop, ARM.len + Math.cos(ARM.offset) * 0.38);
  const tipXZ = (theta, out = new THREE.Vector2()) => {
    const c = Math.cos(theta), s = Math.sin(theta);
    return out.set(PIVOT.x + TIP.x * c + TIP.z * s, PIVOT.z - TIP.x * s + TIP.z * c);
  };
  // the swing angle that puts the stylus at radius R on the record
  const _v = new THREE.Vector2();
  const angleFor = (R) => {
    for (let th = 0; th > -1.6; th -= 0.002) {
      tipXZ(th, _v);
      if (Math.hypot(_v.x - PC.x, _v.y - PC.z) <= R) return th;
    }
    return -0.5;
  };
  const OUTER = angleFor(1.44), INNER = angleFor(1.18);

  // arm rest post under the tube at rest
  const restPt = new THREE.Vector3(0, 0, ARM.len - 0.55).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0).add(new THREE.Vector3(PIVOT.x, 0, PIVOT.z));
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, ARM_Y - TOP - 0.04, 16).translate(0, (ARM_Y - TOP - 0.04) / 2, 0), satin);
  post.position.set(restPt.x, TOP, restPt.z);
  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 24, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI), chrome);
  cradle.position.set(restPt.x, ARM_Y - 0.035, restPt.z);
  deck.add(post, cradle);

  /* --- lights --- */
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  const key = new THREE.SpotLight(COLORS.glow, 0, 18, 0.5, 0.6, 1.1);
  key.position.set(-0.3, 7, 1.6);
  key.target.position.set(-0.2, TOP, 0);
  scene.add(key, key.target);
  const warm = new THREE.SpotLight(new THREE.Color(), 0, 16, 0.42, 0.6, 1.1);
  const cool = new THREE.SpotLight(COLORS.haze.clone().multiplyScalar(2.2), 0, 16, 0.42, 0.6, 1.1);
  scene.add(warm, warm.target, cool, cool.target);
  const rim = new THREE.DirectionalLight(0xfff1dc, 0.25);
  rim.position.set(3, 4, -6);
  scene.add(rim);

  const makeBeam = (color, len, rTop, rBottom) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, len, 48, 1, true).translate(0, -len / 2, 0), beamMaterial(color));
    m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  const beamWarm = makeBeam(new THREE.Color(), 9, 0.08, 1.9);
  const beamCool = makeBeam(COLORS.haze.clone().multiplyScalar(1.6), 9, 0.08, 1.9);
  const aim = (beam, from, to) => {
    beam.position.copy(from);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3().subVectors(to, from).normalize());
  };

  /* --- tint: the night's colour (label paper, warm light, beam, glow) --- */
  const tint = new THREE.Color(COLORS.brand), tintTarget = new THREE.Color(COLORS.brand);
  function setTint(hex, instant = false) {
    tintTarget.set(hex);
    if (instant) tint.copy(tintTarget);
  }

  /* --- state --- */
  const state = {
    drop: 0,   // 0 arm at rest → 1 needle down, lights up (hero scroll)
    week: 0,   // camera arrives at the week pose
    macro: 0,  // close-up of the needle
    top: 0,    // overhead, behind the footage
    groove: 0, // how far the needle has travelled across side A (whole-page progress)
    pointer: new THREE.Vector2(), pointerSmooth: new THREE.Vector2(),
  };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    state.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  }, { passive: true });

  /* --- layout --- */
  let width = 0, height = 0, aspect = 1, wide = true;
  const t2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const fit = (w, h, fw, fh) => Math.max(h / fh / t2, w / fw / (aspect * t2));
  const poses = {};
  function buildPoses() {
    wide = aspect > 1.15;
    poses.hero = wide
      ? { az: 0.62, elev: 0.6, dist: fit(6.2, 4.2, 0.56, 0.8), ox: -0.21, oy: 0.02 }
      : { az: 0.62, elev: 0.66, dist: fit(6.6, 4.2, 0.98, 0.46), ox: 0, oy: 0.2 };
    poses.week = wide
      ? { az: 0.34, elev: 0.5, dist: fit(5.8, 3.4, 0.62, 0.5), ox: -0.13, oy: 0.19 }
      : { az: 0.4, elev: 0.55, dist: fit(5.4, 3.6, 1.0, 0.34), ox: 0, oy: 0.1 };
    poses.macro = wide
      ? { az: 0.8, elev: 0.48, dist: fit(1.15, 0.7, 0.5, 0.62), ox: -0.2, oy: -0.02 }
      : { az: 0.8, elev: 0.42, dist: fit(0.9, 0.6, 0.98, 0.42), ox: 0, oy: 0.2 };
    poses.top = { az: 0, elev: 1.47, dist: fit(3.8, 3.8, wide ? 0.62 : 0.98, wide ? 0.9 : 0.6), ox: 0, oy: 0 };
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
  let last = performance.now(), elapsed = 0, running = false, raf = 0, spin = 0;
  const look = new THREE.Vector3(), lookTip = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const lookHero = new THREE.Vector3(0, 0.45, 0.1), lookWeek = new THREE.Vector3(-0.15, 0.4, 0);
  const lookTop = new THREE.Vector3(PC.x, TOP, PC.z);
  const tipWorld = new THREE.Vector3();

  function render() {
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now; elapsed += dt;
    const t = elapsed;
    if (lite) state.pointer.set(Math.sin(t * 0.3) * 0.3, Math.cos(t * 0.23) * 0.2);
    state.pointerSmooth.lerp(state.pointer, 1 - Math.pow(0.05, dt));
    const ps = state.pointerSmooth;
    const k = 1 - Math.pow(0.02, dt);

    /* cue the record */
    const d = clamp(state.drop);
    const raised = range(d, 0, 0.14) - range(d, 0.72, 0.88);
    const swing = easeInOut(range(d, 0.12, 0.72));
    const down = range(d, 0.8, 0.9);
    const play = lerp(OUTER, INNER, clamp(state.groove));
    arm.rotation.y = lerp(0, play, swing);
    tilt.rotation.x = -0.075 * raised - Math.sin(t * RPM) * 0.0016 * down; // tiny ride on the warp
    spin += (range(d, 0.06, 0.4) - spin) * (1 - Math.pow(0.35, dt));      // motor spins up / coasts down
    disc.rotation.y -= spin * RPM * dt;
    lamp.intensity = 0.9 * range(d, 0, 0.1) + 0.25;
    lampHead.material.color.setRGB(1, 0.6, 0.24).multiplyScalar(0.6 + 0.4 * range(d, 0, 0.1));

    /* lights: the key spot is always up; the colour wash lands with the needle */
    tint.lerp(tintTarget, k);
    labelPaper.color.copy(tint).multiplyScalar(0.62);
    const on = easeOut(range(d, 0.86, 1));
    const beat = 0.8 + 0.2 * Math.pow(Math.max(0, Math.sin(t * Math.PI * 2)), 6);
    key.intensity = lerp(34, 46, on);
    warm.color.copy(tint).multiplyScalar(1.9);
    warm.intensity = 46 * on * beat;
    cool.intensity = 26 * on * (1.6 - beat);
    beamWarm.material.uniforms.uColor.value.copy(tint).multiplyScalar(1.3);
    const beamAmt = 0.34 * (1 - state.top * 0.7) * (1 - state.macro * 0.6);
    beamWarm.material.uniforms.uAmt.value = beamAmt * on * beat;
    beamCool.material.uniforms.uAmt.value = beamAmt * 0.8 * on * (1.6 - beat);
    beamWarm.material.uniforms.uTime.value = beamCool.material.uniforms.uTime.value = t;
    const sweep = Math.sin(t * 0.35) * 1.1;
    from.set(-5.2, 6.4, -1.4); to.set(sweep * 0.8, TOP, 0.2);
    warm.position.copy(from); warm.target.position.copy(to); aim(beamWarm, from, to);
    from.set(5.2, 6.4, -1.8); to.set(-sweep * 0.8, TOP, -0.2);
    cool.position.copy(from); cool.target.position.copy(to); aim(beamCool, from, to);

    /* camera: hero → week → macro → top */
    tipWorld.set(TIP.x, TIP.y, TIP.z);
    tilt.localToWorld(tipWorld);
    const wk = easeInOut(clamp(state.week)), mc = easeInOut(clamp(state.macro)), tp = easeInOut(clamp(state.top));
    const H = poses.hero, W = poses.week, M = poses.macro, T = poses.top;
    let az = lerp(H.az, W.az, wk), elev = lerp(H.elev, W.elev, wk), dist = elerp(H.dist, W.dist, wk);
    let ox = lerp(H.ox, W.ox, wk), oy = lerp(H.oy, W.oy, wk);
    look.lerpVectors(lookHero, lookWeek, wk);
    lookTip.copy(tipWorld); lookTip.y += 0.06;
    const radial = Math.atan2(tipWorld.x - PC.x, tipWorld.z - PC.z); // look along the record from outside the needle
    az = lerp(az, radial + M.az, mc); elev = lerp(elev, M.elev, mc); dist = elerp(dist, M.dist, mc);
    ox = lerp(ox, M.ox, mc); oy = lerp(oy, M.oy, mc);
    look.lerp(lookTip, mc);
    az = lerp(az, -0.3 + t * 0.04, tp); elev = lerp(elev, T.elev, tp); dist = elerp(dist, T.dist, tp);
    ox = lerp(ox, T.ox, tp); oy = lerp(oy, T.oy, tp);
    look.lerp(lookTop, tp);
    az += ps.x * 0.1 * (1 - tp); elev += ps.y * 0.04 * (1 - tp);
    camera.position.set(look.x + Math.sin(az) * Math.cos(elev) * dist, look.y + Math.sin(elev) * dist, look.z + Math.cos(az) * Math.cos(elev) * dist);
    camera.lookAt(look);
    camera.setViewOffset(width, height, ox * width, oy * height, width, height);

    /* set */
    bgU.uTime.value = t;
    bgU.uGlow.value.copy(COLORS.glow).lerp(tint, 0.55 * on);
    bgU.uGlowAmt.value = 0.55 + 0.45 * on;
    bgU.uBokeh.value = 0.25 + 0.5 * on;
    bgU.uWordOpacity.value = 0;
    goboMat.color.copy(tint).lerp(COLORS.glow, 0.25);
    goboMat.opacity = (0.18 + 0.16 * on * beat) * (1 - mc * 0.8) * (1 - tp * 0.6);
    floor.u.uReflect.value = 0.45;
    floor.u.uCenter.value.set(0, 0);
    floor.u.uCaustic.value.set(PC.x, PC.z);
    floor.u.uCausticColor.value.copy(tint);
    floor.u.uCausticAmt.value = 0.1 * on * beat;

    renderer.render(scene, camera);
  }

  // If the device cannot keep up: fewer pixels, then a softer reflection, then 30 fps.
  const gov = governor({
    steps: [
      () => { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() * 0.8)); width = 0; resize(); },
      () => { reflScale *= 0.6; width = 0; resize(); },
      'cap',
    ],
  });
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (gov.skip(now)) return;
    render();
  }

  function refreshText() {
    backdrop.refreshWord();
    const n = wordTexture('Live'); goboMat.map.dispose(); goboMat.map = n.tex; goboWord = n;
    drawLabel(labelTex.image.getContext('2d'), labelTex.image.width);
    labelTex.needsUpdate = true;
  }

  function refreshPalette() {
    readPalette();
    stage.copy(COLORS.stage);
    scene.background.copy(stage);
    bgU.uBg.value.copy(stage);
    bgU.uWordColor.value.copy(COLORS.brand);
    floor.setColors(stage, 1.5);
    brass.color.copy(COLORS.metal);
    key.color.copy(COLORS.glow);
    if (!running) render();
  }
  window.addEventListener('palettechange', refreshPalette);

  return {
    state,
    setTint,
    refreshText,
    renderOnce: render,
    compile() { return renderer.compileAsync ? renderer.compileAsync(scene, camera).catch(() => {}) : renderer.compile(scene, camera); },
    start() { if (running) return; running = true; last = performance.now(); gov.reset(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
  };
}
