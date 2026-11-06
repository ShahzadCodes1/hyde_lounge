import * as THREE from 'three';

/* ==========================================================================
   RING SIGN — the Hyde LED-ring, built like real luxury signage.
   · HYDE as extruded champagne-metal channel letters, halo-lit from behind
   · a brushed-brass outer band carrying globe bulbs (socket · glass · filament)
   · a continuous fine neon line in a brass channel for the inner ring
   · a hairline bezel with ticks that turns slowly, like a watch bezel
   · the wordmark splits open along its signature slice as you scroll in
   ========================================================================== */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const range = (v, a, b) => clamp((v - a) / (b - a));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

export const SIGN = { outer: 2.25, neon: 1.78, bezel: 2.6, wordmark: 2.15 };

/* ---------- wordmark geometry (logo units: 344 × 100, y up) ---------- */
// The logo is sliced horizontally between y 41.6 and 48 (y-up). Pieces are built
// already split into a top and a bottom half so the slice can open on scroll.
const rect = (x, y, w, h) => {
  const s = new THREE.Shape();
  s.moveTo(x, y); s.lineTo(x + w, y); s.lineTo(x + w, y + h); s.lineTo(x, y + h); s.closePath();
  return s;
};

const poly = (pts) => {
  const s = new THREE.Shape();
  s.moveTo(...pts[0]); pts.slice(1).forEach((p) => s.lineTo(...p)); s.closePath();
  return s;
};

// Each letter half is ONE outline (no overlapping pieces), so the extrusion has no internal seams.
const H_TOP = () => poly([[0, 48], [75, 48], [75, 100], [60.4, 100], [60.4, 62.6], [14.6, 62.6], [14.6, 100], [0, 100]]);

function yTop() {
  // stroke width 14.6 arms from (89,106)/(163,106) to (126,52), clipped at cap height, joined to the stem
  const w = 7.3, L = Math.hypot(37, 54), nx = (54 / L) * w, ny = (37 / L) * w;
  const atY = (x0, y0, dx, dy, y) => x0 + dx * ((y - y0) / dy);
  const atX = (x0, y0, dx, dy, x) => y0 + dy * ((x - x0) / dx);
  const lo = [89 - nx, 106 - ny], li = [89 + nx, 106 + ny]; // left arm: outer / inner edge origins
  const ro = [163 + nx, 106 - ny], ri = [163 - nx, 106 + ny];
  const vY = atX(li[0], li[1], 37, -54, 126); // inner edges meet on the centre line
  return poly([
    [atY(lo[0], lo[1], 37, -54, 100), 100],
    [atY(li[0], li[1], 37, -54, 100), 100],
    [126, vY],
    [atY(ri[0], ri[1], -37, -54, 100), 100],
    [atY(ro[0], ro[1], -37, -54, 100), 100],
    [133.3, atX(ro[0], ro[1], -37, -54, 133.3)],
    [133.3, 48], [118.7, 48],
    [118.7, atX(lo[0], lo[1], 37, -54, 118.7)],
  ]);
}

function dHalf(top) {
  const s = new THREE.Shape();
  const cx = 214, cy = 50, R = 50, r = 35.4;
  if (top) {
    const ao = Math.asin(-2 / R), ai = Math.asin(-2 / r);
    s.moveTo(179, 48); s.lineTo(179, 100); s.lineTo(214, 100);
    s.absarc(cx, cy, R, Math.PI / 2, ao, true);
    s.lineTo(cx + r * Math.cos(ai), cy + r * Math.sin(ai));
    s.absarc(cx, cy, r, ai, Math.PI / 2, false);
    s.lineTo(193.6, 85.4); s.lineTo(193.6, 48);
  } else {
    const ao = Math.asin(-8.4 / R), ai = Math.asin(-8.4 / r);
    s.moveTo(179, 0); s.lineTo(214, 0);
    s.absarc(cx, cy, R, -Math.PI / 2, ao, false);
    s.lineTo(cx + r * Math.cos(ai), cy + r * Math.sin(ai));
    s.absarc(cx, cy, r, ai, -Math.PI / 2, true);
    s.lineTo(193.6, 14.6); s.lineTo(193.6, 41.6); s.lineTo(179, 41.6);
  }
  s.closePath();
  return s;
}

function wordmarkShapes() {
  const W = 14.6;
  return {
    top: [H_TOP(), yTop(), dHalf(true), rect(277, 85.4, 67, W), rect(277, 48, 67, W)],
    bottom: [rect(0, 0, W, 41.6), rect(60.4, 0, W, 41.6), rect(118.7, 0, W, 41.6), dHalf(false), rect(277, 0, 67, W)],
  };
}

/* ---------- canvas textures ---------- */
// Backlight glow for one half of the wordmark (halo-lit letters glow onto the wall behind them).
function glowTexture(half) {
  const M = 34; // margin in logo units
  const w = 1024;
  const k = w / (344 + M * 2);
  const h = Math.round((100 + M * 2) * k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(M, M);
  ctx.beginPath();
  // canvas is y-down: the slice centre sits at y = 55.2
  if (half === 'top') ctx.rect(-M, -M, 344 + M * 2, M + 55.2);
  else ctx.rect(-M, 55.2, 344 + M * 2, 100 - 55.2 + M);
  ctx.clip();
  ctx.fillStyle = '#fff';
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 26;
  // the wordmark silhouette, unsliced (each half is clipped above)
  [[0, 0, 14.6, 100], [60.4, 0, 14.6, 100], [0, 37.4, 75, 14.6], [118.7, 44, 14.6, 56], [179, 0, 14.6, 100],
    [277, 0, 67, 14.6], [277, 37.4, 67, 14.6], [277, 85.4, 67, 14.6]].forEach((r) => ctx.fillRect(...r));
  ctx.lineWidth = 14.6;
  ctx.strokeStyle = '#fff';
  ctx.stroke(new Path2D('M89 -6 L126 48 L163 -6'));
  ctx.stroke(new Path2D('M186 7.3 H214 A42.7 42.7 0 0 1 214 92.7 H186'));
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: 344 + M * 2, h: 100 + M * 2 };
}

function loungeTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 128;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.font = '600 64px Manrope, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '44px';
  ctx.fillText('LOUNGE', 512 + 22, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ---------- neon line shader: reveal around the ring + a gliding highlight ---------- */
const neonMaterial = () =>
  new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color() },
      uReveal: { value: 0 },
      uSweep: { value: 0 },
      uGain: { value: 1 },
    },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uReveal; uniform float uSweep; uniform float uGain; varying vec2 vUv;
      void main(){
        float u = fract(vUv.x - 0.25);                 // start at 12 o'clock
        float shown = smoothstep(uReveal, uReveal - 0.02, u);
        float d = abs(u - uSweep); d = min(d, 1.0 - d);
        float sweep = exp(-pow(d * 9.0, 2.0));
        vec3 col = uColor * (0.85 + sweep * 1.0) * uGain * shown;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

/* ==========================================================================
   createRingSign
   ========================================================================== */
export function createRingSign({ COLORS, lite }) {
  const group = new THREE.Group();

  /* --- materials --- */
  const brass = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.32 });
  const brassSatin = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.48 });
  const letterFace = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.36 });
  const letterSide = new THREE.MeshStandardMaterial({ metalness: 1, roughness: 0.42 });
  const glass = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const filament = new THREE.MeshBasicMaterial();
  const neon = neonMaterial();
  const backGlow = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
  const backGlow2 = backGlow.clone();
  const lounge = new THREE.MeshBasicMaterial({ map: loungeTexture(), transparent: true, depthWrite: false, opacity: 0 });

  function applyColors() {
    brass.color.copy(COLORS.metal);
    brassSatin.color.copy(COLORS.metal).multiplyScalar(0.72);
    letterFace.color.copy(COLORS.accent);
    letterSide.color.copy(COLORS.metal).multiplyScalar(0.6);
    glass.color.copy(COLORS.glow);
    neon.uniforms.uColor.value.copy(COLORS.glow);
    backGlow.color.copy(COLORS.glow);
    backGlow2.color.copy(COLORS.glow);
    lounge.color.copy(COLORS.accent);
  }
  // more reflection on the polished parts than the satin ones
  letterFace.envMapIntensity = 2.6;
  brass.envMapIntensity = 1.6;
  applyColors();

  /* --- outer band: main brass torus + two hairline lips --- */
  const seg = lite ? 160 : 240;
  const band = new THREE.Mesh(new THREE.TorusGeometry(SIGN.outer, 0.055, 18, seg), brass);
  const lipA = new THREE.Mesh(new THREE.TorusGeometry(SIGN.outer - 0.105, 0.008, 6, seg), brass);
  const lipB = new THREE.Mesh(new THREE.TorusGeometry(SIGN.outer + 0.105, 0.008, 6, seg), brass);
  group.add(band, lipA, lipB);

  /* --- globe bulbs: socket · glass · filament --- */
  const count = lite ? 32 : 40;
  const socketGeo = new THREE.CylinderGeometry(0.03, 0.036, 0.05, 14).rotateX(Math.PI / 2);
  const glassGeo = new THREE.SphereGeometry(0.052, 18, 14);
  const coreGeo = new THREE.SphereGeometry(0.017, 10, 8);
  const sockets = new THREE.InstancedMesh(socketGeo, brassSatin, count);
  const globes = new THREE.InstancedMesh(glassGeo, glass, count);
  const cores = new THREE.InstancedMesh(coreGeo, filament, count);
  const m = new THREE.Matrix4();
  const bulbs = [];
  const black = new THREE.Color(0, 0, 0);
  for (let i = 0; i < count; i++) {
    const a = Math.PI / 2 - (i / count) * Math.PI * 2; // clockwise from 12 o'clock
    const x = Math.cos(a) * SIGN.outer, y = Math.sin(a) * SIGN.outer;
    m.makeTranslation(x, y, 0.07); sockets.setMatrixAt(i, m);
    m.makeTranslation(x, y, 0.13); globes.setMatrixAt(i, m); cores.setMatrixAt(i, m);
    globes.setColorAt(i, black); cores.setColorAt(i, black);
    bulbs.push({ f: i / count, phase: Math.random() * Math.PI * 2, speed: 0.5 + Math.random() * 1.2 });
  }
  group.add(sockets, globes, cores);

  /* --- inner ring: neon line seated in a brass channel --- */
  const channel = new THREE.Mesh(new THREE.TorusGeometry(SIGN.neon, 0.026, 10, seg), brassSatin);
  channel.position.z = -0.02;
  const neonLine = new THREE.Mesh(new THREE.TorusGeometry(SIGN.neon, 0.0115, 8, seg * 1.5), neon);
  neonLine.position.z = 0.018;
  group.add(channel, neonLine);

  /* --- bezel: hairline ring with ticks, turning slowly --- */
  const bezel = new THREE.Group();
  bezel.add(new THREE.Mesh(new THREE.TorusGeometry(SIGN.bezel, 0.005, 6, seg), brass));
  const ticksN = 120;
  const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.008, 1, 0.008), brass, ticksN);
  const q = new THREE.Quaternion();
  const z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < ticksN; i++) {
    const a = (i / ticksN) * Math.PI * 2;
    const len = i % 10 === 0 ? 0.11 : i % 5 === 0 ? 0.07 : 0.04;
    const r = SIGN.bezel - 0.03 - len / 2;
    q.setFromAxisAngle(z, a - Math.PI / 2);
    m.compose(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0), q, new THREE.Vector3(1, len, 1));
    ticks.setMatrixAt(i, m);
  }
  bezel.add(ticks);
  bezel.position.z = -0.12;
  group.add(bezel);

  /* --- HYDE: extruded channel letters, top and bottom halves --- */
  const s = SIGN.wordmark / 344;
  const shapes = wordmarkShapes();
  const extrude = { depth: 9, bevelEnabled: true, bevelThickness: 1.6, bevelSize: 0.9, bevelSegments: 3, curveSegments: 28 };
  const makeHalf = (list) => {
    const g = new THREE.ExtrudeGeometry(list, extrude);
    g.translate(-172, -50, -extrude.depth / 2);
    g.scale(s, s, s);
    return new THREE.Mesh(g, [letterFace, letterSide]);
  };
  const glowTop = glowTexture('top');
  const glowBottom = glowTexture('bottom');
  const glowPlane = (gt, mat) => {
    mat.map = gt.tex;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(gt.w * s, gt.h * s), mat);
    p.position.z = -0.06;
    return p;
  };

  const wordmark = new THREE.Group();
  const top = new THREE.Group();
  const bottom = new THREE.Group();
  top.add(makeHalf(shapes.top), glowPlane(glowTop, backGlow));
  bottom.add(makeHalf(shapes.bottom), glowPlane(glowBottom, backGlow2));
  const loungeMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.98 / 8), lounge);
  loungeMesh.position.set(0, -50 * s - 0.2, 0.02);
  bottom.add(loungeMesh);
  wordmark.add(top, bottom);
  wordmark.position.set(0, 0.06, 0.05);
  group.add(wordmark);

  /* --- lights that make the metal read as metal --- */
  const key = new THREE.PointLight(0xffffff, 0, 7, 1.4); // the gleam that sweeps across the letters
  key.position.set(-3, 0.8, 1.3);
  const fill = new THREE.PointLight(0xffffff, 0, 6, 1.6); // warm wash from the bulbs, kept off-axis so it never mirrors in the letters
  fill.position.set(0, -2.1, 1.2);
  group.add(key, fill);

  const tmp = new THREE.Color();

  /* ---------- per-frame ---------- */
  function update({ t, intro, p, ps }) {
    // bulbs light clockwise from 12 o'clock, then breathe; a soft wave travels with scroll
    const chasePos = (t * 0.05 + p * 1.6) % 1;
    const chaseAmt = 0.35 + range(p, 0.08, 0.6) * 1.1;
    for (let i = 0; i < count; i++) {
      const b = bulbs[i];
      const on = easeOut(clamp((intro * 1.3 - 0.1 - b.f * 0.75) * 5));
      const breathe = 0.86 + 0.14 * Math.sin(t * b.speed + b.phase);
      let d = Math.abs(b.f - chasePos); d = Math.min(d, 1 - d);
      const wave = Math.exp(-Math.pow(d * 10, 2)) * chaseAmt;
      const v = on * (breathe + wave);
      cores.setColorAt(i, tmp.copy(COLORS.glow).multiplyScalar(v * 3.2));
      globes.setColorAt(i, tmp.copy(COLORS.glow).multiplyScalar(v * 0.32));
    }
    cores.instanceColor.needsUpdate = true;
    globes.instanceColor.needsUpdate = true;

    // neon draws itself around the ring, then a highlight glides along it
    neon.uniforms.uReveal.value = easeInOut(range(intro, 0.2, 0.8)) * 1.03;
    neon.uniforms.uSweep.value = (t * 0.06 + p * 0.8) % 1;
    neon.uniforms.uGain.value = 0.9 + 0.08 * Math.sin(t * 2.1);

    // letters: halo backlight fades up with a brief ignition flicker
    const ig = range(intro, 0.5, 0.95);
    const flicker = ig > 0 && ig < 1 ? (Math.sin(t * 47) > -0.2 ? 1 : 0.4) : 1;
    const split = easeInOut(range(p, 0.18, 0.55));
    const glowOp = 0.85 * ig * flicker * (1 - split * 0.7);
    backGlow.opacity = backGlow2.opacity = glowOp;
    lounge.opacity = 0.9 * range(intro, 0.65, 1) * (1 - range(p, 0.1, 0.3));

    // the signature slice opens: top half rises, bottom half drops
    top.position.y = split * 1.25;
    bottom.position.y = -split * 1.25;
    top.rotation.x = -split * 0.35;
    bottom.rotation.x = split * 0.35;

    // light: one gleam sweeps across on ignition, then follows the pointer
    const sweepIn = easeInOut(range(intro, 0.55, 1));
    key.position.x = -3.2 + sweepIn * 3.2 + ps.x * 2.2;
    key.position.y = 1.6 + ps.y * 0.8;
    key.intensity = 3.2 * range(intro, 0.5, 0.8);
    fill.intensity = 1.1 * range(intro, 0.15, 0.7);
    fill.color.copy(COLORS.glow);

    bezel.rotation.z = -t * 0.025 - p * 0.6;
  }

  return { group, update, applyColors, wordmark };
}
