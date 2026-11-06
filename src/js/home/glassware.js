import * as THREE from 'three';
import { canvasTex } from './studio.js';

/* ==========================================================================
   GLASSWARE — the cut-crystal rocks glass, its ice sphere and the liquid,
   shared by the Home "Pour" chapter and the Menu page.
   Units: the glass is 9 cm tall × 8.5 cm wide, base on y = 0.
   ========================================================================== */

const lerp = (a, b, t) => a + (b - a) * t;
export const V = (x, y) => new THREE.Vector2(x, y);
export const spline = (pts, n) => new THREE.SplineCurve(pts.map(([x, y]) => V(x, y))).getPoints(n);
export function dedupe(pts) {
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 1e-5);
}

/* ---------- the rocks glass (radius, height): 9 cm tall, 8.5 cm wide, heavy base ---------- */
// outer wall of the fluted lower body — lathed with few segments + flat shading = cut facets
export const GLASS_FLUTES = [V(0, 0), V(0.64, 0), V(0.655, 0.012), V(0.662, 0.035), V(0.668, 0.5), V(0.682, 0.94)];
export const FLUTE_COUNT = 22;
// polished upper band, rim, inner wall and the thick base — smooth
export const GLASS_BODY = dedupe([
  V(0.686, 0.94), V(0.693, 1.2), V(0.702, 1.47), V(0.701, 1.493), V(0.695, 1.502), V(0.687, 1.5), V(0.682, 1.49),
  ...spline([[0.682, 1.49], [0.671, 1.2], [0.652, 0.7], [0.638, 0.36], [0.62, 0.262], [0.58, 0.232], [0.3, 0.222], [0, 0.219]], 40),
]);
export const BASE_TOP = 0.222;
export const LEVEL_MIN = BASE_TOP + 0.004;
export const LEVEL_MAX = 0.8;

// the whisky volume: inner wall, slightly inset
export const LIQUID_PROFILE = dedupe([
  V(0, BASE_TOP + 0.002),
  ...spline([[0.3, BASE_TOP + 0.004], [0.575, BASE_TOP + 0.013], [0.614, 0.262], [0.632, 0.36], [0.645, 0.7], [0.66, 1.05]], 24),
  V(0, 1.05),
]);

export const ICE = { r: 0.41, y: BASE_TOP + 0.41 + 0.01 };

/* ---------- cut-crystal pattern: a diamond (hobnail) cut, as a normal map ---------- */
// A lattice of four-sided pyramids. Through transmission it bends and sparkles like real cut glass.
export function diamondCutNormalMap(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  const h = (u, v) => 1 - Math.max(Math.abs(u - 0.5), Math.abs(v - 0.5)) * 2; // pyramid height
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size, e = 1 / size;
      const dx = (h(u + e, v) - h(u - e, v)) / (2 * e);
      const dy = (h(u, v + e) - h(u, v - e)) / (2 * e);
      const k = 0.55; // facet steepness
      let nx = -dx * k, ny = -dy * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * size + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// translucency: luminous where the liquid faces you, deeper at the edges
export function glowFromWithin(material, base = 0.12, gain = 0.95) {
  material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
       totalEmissiveRadiance += vColor.rgb * (${base.toFixed(2)} + ${gain.toFixed(2)} * pow(facing, 2.2));`
    );
  };
}


// the same translucency for a liquid with one flat colour (material.color), e.g. when the drink changes
export function glowFromColor(material, base = 0.12, gain = 0.95) {
  material.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
       totalEmissiveRadiance += diffuseColor.rgb * (${base.toFixed(2)} + ${gain.toFixed(2)} * pow(facing, 2.2));`
    );
  };
}

export // the liquid's surface: a soft luminous centre and a bright meniscus line at the glass
const surfaceTexture = () => canvasTex(512, 512, (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  g.addColorStop(0, '#b8b8b8');
  g.addColorStop(0.7, '#8c8c8c');
  g.addColorStop(0.92, '#a0a0a0');
  g.addColorStop(0.97, '#e6e6e6');
  g.addColorStop(1, '#707070');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
});

/** Crystal: refractive, dispersive glass. `pattern` is an optional cut normal map. */
export function crystalMaterial({ lite = false, flat = false, pattern = null, env = 1.8 } = {}) {
  return new THREE.MeshPhysicalMaterial({
    normalMap: pattern,
    normalScale: new THREE.Vector2(1.1, 1.1),
    color: new THREE.Color('#fbfffd'),
    metalness: 0,
    roughness: 0,
    transmission: 1,
    thickness: flat ? 0.22 : 0.08,
    ior: 1.52,
    dispersion: lite ? 0 : 0.55,
    specularIntensity: 1,
    envMapIntensity: env,
    attenuationColor: new THREE.Color('#e3f2ec'),
    attenuationDistance: 1.0,
    clearcoat: 1,
    clearcoatRoughness: 0,
    flatShading: flat,
  });
}

/** Ice sphere: clear above the liquid line (uSeen = what you see through it), tinted below. */
export function iceMaterial(iceU) {
  const iceMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#050807'), roughness: 0.02, metalness: 0, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 1.6, specularIntensity: 1 });
  iceMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, iceU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWY; varying vec3 vObj;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWY = (modelMatrix * vec4(transformed, 1.0)).y; vObj = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uLevel; uniform vec3 uWhisky; uniform vec3 uSeen; varying float vWY; varying vec3 vObj;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float facing = clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0);
        float under = smoothstep(uLevel + 0.006, uLevel - 0.006, vWY);
        // faint internal fractures, like hand-cut clear ice
        float frac = pow(abs(sin(vObj.x * 23.0 + vObj.y * 31.0) * sin(vObj.z * 19.0 - vObj.y * 13.0)), 18.0);
        // clear ice: you see the dark room through it, a bright refraction ring inside the rim, white edges
        float ring = exp(-pow(facing - 0.38, 2.0) * 70.0);
        vec3 clearIce = uSeen * (0.9 + 0.5 * facing) + vec3(0.75, 0.85, 0.82) * pow(1.0 - facing, 3.0) + vec3(0.55, 0.62, 0.6) * ring * 0.35 + frac * 0.1;
        vec3 inWhisky = uWhisky * (0.3 + 0.95 * pow(facing, 1.6)) + vec3(1.0, 0.8, 0.55) * pow(1.0 - facing, 3.0) * 0.25;
        totalEmissiveRadiance += mix(clearIce, inWhisky, under);`);
  };
  return iceMat;
}

export function radiusAt(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (b.x === 0) break;
    if (y <= b.y && y >= a.y) return lerp(a.x, b.x, (y - a.y) / Math.max(1e-6, b.y - a.y));
  }
  return 0.645;
}

export function vertexColored(geo, colorAt) {
  const cols = [];
  const c = new THREE.Color();
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    colorAt(pa.getY(i), c);
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return geo;
}

