import * as THREE from 'three';

// Scene colours are read from the CSS palette tokens (src/styles/palettes.css),
// so <html data-palette="…"> recolours the 3D scene together with the page.
export const COLORS = {
  bg: new THREE.Color(),
  chapter: new THREE.Color(),
  onChapter: new THREE.Color(),
  brand: new THREE.Color(),
  metal: new THREE.Color(),
  accent: new THREE.Color(),
  glow: new THREE.Color(),
  haze: new THREE.Color(),
  dust: new THREE.Color(),
  halo: new THREE.Color(),
  frame: new THREE.Color(),
  stage: new THREE.Color(),
};
export function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => cs.getPropertyValue(name).trim() || fallback;
  COLORS.bg.set(v('--bg', '#050d0b'));
  COLORS.chapter.set(v('--chapter', '#0e3a2f'));
  COLORS.onChapter.set(v('--on-chapter', '#f1ebdf'));
  COLORS.brand.set(v('--brand', '#9a3f26'));
  COLORS.metal.set(v('--metal', '#b99c66'));
  COLORS.accent.set(v('--accent', '#d8bd86'));
  COLORS.glow.set(v('--glow', '#ffd8a0'));
  COLORS.haze.set(v('--haze', '#1d6b56'));
  COLORS.dust.set(v('--dust', '#e8d3a4'));
  COLORS.stage.set(v('--stage', '#010302'));
  COLORS.halo.copy(COLORS.haze).lerp(COLORS.glow, 0.12);
  COLORS.frame.copy(COLORS.metal).multiplyScalar(0.3);
}

