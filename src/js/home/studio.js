import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/* ==========================================================================
   STUDIO — the shared "product photography" set used by every Home chapter:
   · canvas textures (the giant chapter word)
   · a dark softbox environment for glass and metal
   · an opaque backdrop: chapter colour, warm glow, bar bokeh and the giant word
     (opaque so transmissive crystal can refract it)
   · a polished black bar top with a real mirror reflection, caustic and shadow
   ========================================================================== */

export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function wordTexture(text) {
  const tex = canvasTex(4096, 1400, (ctx, w, h) => {
    ctx.font = 'italic 300 1250px "Cormorant Garamond", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(text, w / 2, h / 2 + 60);
  });
  return { tex, aspect: 4096 / 1400 };
}


/* ---------- product-photography environment ---------- */
// Glass shows only what it reflects: dark space with a few bright strips gives clear
// crystal with crisp highlights. Nothing sits directly behind, so the flat foot stays dark.
export function softboxEnvironment(renderer, warm) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x010202);
  const box = (w, h, color, gain, pos) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(gain), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(0, 1, 0);
    env.add(m);
  };
  box(1.2, 9, '#ffffff', 6, [-5, 1.5, 2.5]); // key strip
  box(0.7, 9, warm, 4, [5, 1, 1.5]);         // warm side strip
  box(0.9, 8, warm, 6, [-4.2, 1.5, -4.6]);   // twin back-side strips: bright rim lines down both edges of the bowl
  box(0.9, 8, '#ffffff', 5, [4.2, 1.5, -4.6]);
  box(5, 1.2, '#ffffff', 0.45, [0, 7, 0]);   // overhead (kept soft so the foot never blows out)
  box(6, 0.5, warm, 0.5, [0, -2.5, 5]);      // low bounce off the bar
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}


// polished black bar top: mirror reflection, the cocktail's warm caustic, dissolving into the dark
export const BarTopShader = {
  name: 'BarTop',
  uniforms: {
    color: { value: null },
    tDiffuse: { value: null },
    textureMatrix: { value: null },
    uFloor: { value: new THREE.Color() },
    uBg: { value: new THREE.Color() },
    uCenter: { value: new THREE.Vector2() },
    uReflect: { value: 0.5 },
    uCaustic: { value: new THREE.Vector2() },
    uCausticColor: { value: new THREE.Color() },
    uCausticAmt: { value: 0 },
    uShadow: { value: 0 },
    uFade: { value: new THREE.Vector2(-0.4, -3.1) }, // z where the bar starts / finishes dissolving into the wall
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec3 uFloor; uniform vec3 uBg; uniform vec2 uCenter;
    uniform float uReflect; uniform vec2 uCaustic; uniform vec3 uCausticColor; uniform float uCausticAmt; uniform float uShadow; uniform vec2 uFade;
    varying vec4 vUv; varying vec3 vWorld;
    void main(){
      vec3 refl = texture2DProj(tDiffuse, vUv).rgb;
      float d = length(vWorld.xz - uCenter);
      vec3 col = uFloor;
      col *= 1.0 - uShadow * 0.6 * exp(-d * d * 9.0);                  // contact shadow under the foot
      col = mix(col, refl, uReflect * smoothstep(2.1, 0.0, d));          // mirror, only around the glass
      vec2 q = (vWorld.xz - uCaustic) * vec2(1.0, 1.7);
      float lq = length(q);
      float caustic = exp(-lq * lq * 3.2) * 0.8 + exp(-pow(lq - 0.32, 2.0) * 90.0) * 0.55;
      col += uCausticColor * caustic * uCausticAmt;                    // warm light thrown through the cocktail
      col += vec3(1.0) * 0.018 * exp(-pow(vWorld.z - 0.9, 2.0) * 1.5); // faint sheen line across the bar
      col = mix(col, uBg, smoothstep(uFade.x, uFade.y, vWorld.z));           // dissolve into the back wall
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
};



/** Backdrop wall. Returns { mesh, u } — u are the shader uniforms to animate. */
export function createBackdrop({ word, wordW = 11, wordY = 1.75, bg, brand, glow, haze }) {
  const w = wordTexture(word);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 30).translate(0, 15, 0),
    new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBg: { value: bg.clone() },
        uWordColor: { value: brand.clone() },
        uWordMap: { value: w.tex },
        uWordCenter: { value: new THREE.Vector2(0, wordY) },
        uWordSize: { value: new THREE.Vector2(wordW, wordW / w.aspect) },
        uWordOpacity: { value: 0 },
        uGlow: { value: glow.clone() },
        uHaze: { value: haze.clone() },
        uGlowCenter: { value: new THREE.Vector2(0, 1.2) },
        uGlowAmt: { value: 0 },
        uBokeh: { value: 0 },
      },
      vertexShader: /* glsl */ `varying vec2 vPos; void main(){ vPos = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uBg; uniform vec3 uWordColor; uniform sampler2D uWordMap;
        uniform vec2 uWordCenter; uniform vec2 uWordSize; uniform float uWordOpacity;
        uniform vec3 uGlow; uniform vec3 uHaze; uniform vec2 uGlowCenter; uniform float uGlowAmt; uniform float uBokeh;
        varying vec2 vPos;
        float hash(float n){ return fract(sin(n) * 43758.5453); }
        void main(){
          vec3 col = uBg;
          for (int i = 0; i < 16; i++) {
            float fi = float(i) + 1.0;
            vec2 c = vec2(hash(fi * 3.17) * 17.0 - 8.5, 0.4 + hash(fi * 7.71) * 4.6);
            c.x += sin(uTime * 0.04 + fi) * 0.35;
            float r = 0.2 + hash(fi * 1.37) * 0.45;
            float dd = length(vPos - c);
            float disc = smoothstep(r, r * 0.86, dd) * (0.55 + 0.45 * smoothstep(r * 0.55, r, dd));
            vec3 tint = mix(uGlow, uHaze * 2.0, step(0.72, hash(fi * 9.9)));
            col += tint * disc * (0.03 + hash(fi * 5.13) * 0.07) * uBokeh;
          }
          float d = length((vPos - uGlowCenter) * vec2(0.8, 1.0));
          float g = smoothstep(3.0, 0.0, d);
          col += uGlow * g * g * uGlowAmt * 0.1;
          vec2 tuv = (vPos - uWordCenter) / uWordSize + 0.5;
          float inside = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0);
          col = mix(col, uWordColor, texture2D(uWordMap, tuv).a * inside * uWordOpacity);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  mesh.position.z = -3.2;
  const u = mesh.material.uniforms;
  // redraw the word once the display font has loaded
  const refreshWord = () => { const n = wordTexture(word); u.uWordMap.value.dispose(); u.uWordMap.value = n.tex; };
  return { mesh, u, refreshWord };
}

/** Polished bar top. Rendered in the transparent pass so crystal refraction never re-runs the mirror. */
export function createBarTop({ lite }) {
  const bar = new Reflector(new THREE.PlaneGeometry(30, 30), {
    textureWidth: 512, textureHeight: 512, clipBias: 0.003, shader: BarTopShader, multisample: lite ? 0 : 4,
  });
  bar.rotation.x = -Math.PI / 2;
  bar.position.set(0, 0, 11.8);
  bar.material.transparent = true;
  const u = bar.material.uniforms;
  const setColors = (bg, floorGain = 0.3) => { u.uFloor.value.copy(bg).multiplyScalar(floorGain); u.uBg.value.copy(bg); };
  const resize = (w, h, scale) => bar.getRenderTarget().setSize(Math.round(w * scale), Math.round(h * scale));
  return { bar, u, setColors, resize };
}
