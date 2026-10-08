// src/story/cutscenes/rig.js  (owner: story) — defensive adapters for cast features other areas expose (or have been
// asked for in requests/story.md). Every helper is a no-op when the feature is missing, so scenes never crash.
import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';

/**
 * Show a cape on Swordcat without touching the saved cosmetics (CS-00's red poster cape). `null` restores her equipped
 * cape. Prefers `player.setCapeOverride` (requested), else the kitten rig's `setCape`.
 */
export function capeOverride(ctx, cape) {
  const p = ctx.player;
  try {
    if (typeof p?.setCapeOverride === 'function') { p.setCapeOverride(cape); return; }
    const k = p?.model?.k;
    k?.setCape?.(cape ?? ctx.state?.cosmetics?.cape ?? 'cream');
  } catch (e) { console.warn('[story] cape override failed', e); }
}

/** The Meme Cam look on her (cape in the seamless 3.8 s sway, cape wind ×1.6) during MEME_LOOP shots. */
export function memeLook(ctx, on) {
  const p = ctx.player;
  try {
    if (typeof p?.setMemeLook === 'function') p.setMemeLook(!!on);
    else p?.model?.memeCam?.(!!on);
  } catch (e) { console.warn('[story] meme look failed', e); }
}

/** CS-01 outfits: 'tunic' (no bow), 'tunic_bow', 'armour'. */
export function outfit(ctx, name) {
  try { ctx.player?.setOutfit?.(name); } catch (e) { console.warn('[story] outfit failed', e); }
}

/**
 * The dusty mirror in the armoury barn (CS-01 shot 7): a carved wooden frame with a tarnished silver pane that picks up
 * the scene's environment light. Built by the cutscene `spawn` step (`build`), disposed with the scene.
 */
export function buildMirror() {
  const g = new THREE.Group();
  g.name = 'story:mirror';
  const wood = new THREE.MeshStandardMaterial({ color: '#6E4E32', roughness: 0.85 });
  const gilt = new THREE.MeshStandardMaterial({ color: '#B48A3C', roughness: 0.45, metalness: 0.6 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(0.78, 1.32, 0.06), wood, 0, 0.86, 0);
  // a real (dusty: grey-tinted, small target) reflection for the few seconds the shot lasts; a tarnished pane otherwise
  let pane = null;
  try {
    pane = new Reflector(new THREE.PlaneGeometry(0.62, 1.12), { color: 0x9A9E9C, textureWidth: 384, textureHeight: 640, multisample: 0, clipBias: 0.003 });
    pane.position.set(0, 0.88, 0.032);
    g.add(pane);
  } catch (e) {
    console.warn('[story] mirror reflection unavailable', e);
    add(new THREE.PlaneGeometry(0.62, 1.12), new THREE.MeshStandardMaterial({ color: '#C9D2D6', roughness: 0.12, metalness: 1.0 }), 0, 0.88, 0.032);
  }
  const dust = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 1.12), new THREE.MeshBasicMaterial({ color: '#D8D2C2', transparent: true, opacity: 0.16, depthWrite: false }));
  dust.position.set(0, 0.88, 0.036);
  g.add(dust);
  add(new THREE.TorusGeometry(0.07, 0.018, 6, 16), gilt, 0, 1.6, 0.03);
  add(new THREE.BoxGeometry(0.86, 0.06, 0.1), gilt, 0, 0.18, 0.02);
  for (const s of [-1, 1]) {
    const leg = add(new THREE.BoxGeometry(0.06, 0.24, 0.06), wood, s * 0.34, 0.08, -0.05);
    leg.rotation.x = 0.35;
  }
  g.userData.dispose = () => {
    pane?.dispose?.();
    g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (!o.isReflector) o.material.dispose(); } });
  };
  return g;
}

/** A pool of last sunlight (CS-01 shot 5: "every kitten flops into it") — a soft warm disc on the grass. */
export function buildSunPatch() {
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  }
  const g = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshBasicMaterial({ color: '#FFC98A', map, transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: true }));
  g.rotation.x = -Math.PI / 2;
  g.position.y = 0.03;
  g.renderOrder = 2;
  g.name = 'story:sunpatch';
  g.userData.dispose = () => { g.geometry.dispose(); g.material.map?.dispose(); g.material.dispose(); };
  return g;
}
