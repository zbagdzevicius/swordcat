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

/**
 * The practice sun ring (WA §7.2: the gold ring at the dummy the first lesson races to): one flat additive ring, `r` m,
 * lying on the ground. `userData.dispose()` frees it. Its opacity / scale are animated by the caller.
 */
export function buildSunRing(r = 0.95, color = '#FFD57A') {
  const g = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true, toneMapped: false }));
  g.rotation.x = -Math.PI / 2;
  g.renderOrder = 2;
  g.name = 'story:sunring';
  g.userData.dispose = () => { g.geometry.dispose(); g.material.dispose(); };
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

/** PERF S5t / ART X6: the cutscene lamp slot in `ENV_U.uLamps` (world writes slots 1–3 near the camera focus). */
export const LAMP_SLOT = 0;
/** Default cutscene lamp: lantern warm, radius (m), strength (`uLampStr` while the scene holds the slot). */
export const LAMP = Object.freeze({ color: '#FFC46B', r: 6, str: 1 });

let lampOwner = null, lampSaved = null;

/** The shared env uniforms (`ENV_U`) when world exposes them on ctx.env (or `env.uniforms`); null otherwise. */
export function envUniforms(ctx) {
  const env = ctx?.env;
  return env?.ENV_U ?? env?.U ?? env?.uniforms ?? null;
}

/**
 * Claim the cutscene lamp (slot 0 of `ENV_U.uLamps`) at `pos` ({x, y, z} or [x, y, z]) for `owner`: a warm pool of
 * light through the shared uniforms, with **no PointLight** and no shader recompile (PERF §8.2, ART X6). Prefers
 * world's `env.claimLamp(slot, o)`; else writes the uniforms directly and restores them on release. A no-op (false)
 * when world has no lamps yet: scenes then rely on their emissive glow props.
 * @returns {boolean} claimed
 */
export function claimLamp(ctx, owner, pos, { color = LAMP.color, r = LAMP.r, str = LAMP.str } = {}) {
  const p = Array.isArray(pos) ? { x: pos[0], y: pos[1], z: pos[2] } : pos;
  if (!p) return false;
  try {
    const env = ctx?.env;
    if (typeof env?.claimLamp === 'function') { env.claimLamp(LAMP_SLOT, { pos: [p.x, p.y, p.z], color, r, str }); lampOwner = owner; return true; }
    const U = envUniforms(ctx), v = U?.uLamps?.value?.[LAMP_SLOT];
    if (!v?.set) return false;
    if (lampOwner == null) lampSaved = { v: v.clone?.() ?? null, col: U.uLampCol?.value?.clone?.() ?? null, str: U.uLampStr?.value ?? 0 };
    lampOwner = owner;
    v.set(p.x, p.y, p.z, r);
    U.uLampCol?.value?.set?.(color);
    if (U.uLampStr) U.uLampStr.value = Math.max(lampSaved?.str ?? 0, str);
    return true;
  } catch (e) { console.warn('[story] lamp claim failed', e); return false; }
}

/** Give the cutscene lamp back (only when `owner` still holds it; null releases whoever holds it). */
export function releaseLamp(ctx, owner = null) {
  if (lampOwner == null || (owner != null && lampOwner !== owner)) return;
  try {
    const env = ctx?.env;
    if (typeof env?.releaseLamp === 'function') env.releaseLamp(LAMP_SLOT);
    else {
      const U = envUniforms(ctx), v = U?.uLamps?.value?.[LAMP_SLOT];
      if (v?.set && lampSaved) {
        if (lampSaved.v) v.copy(lampSaved.v); else v.set(0, -999, 0, 0);
        if (lampSaved.col) U.uLampCol?.value?.copy?.(lampSaved.col);
        if (U.uLampStr) U.uLampStr.value = lampSaved.str;
      }
    }
  } catch (e) { console.warn('[story] lamp release failed', e); }
  lampOwner = null; lampSaved = null;
}

/** Who holds the cutscene lamp (tests). */
export const lampHolder = () => lampOwner;

/**
 * A warm practical fill for one cast member's close-up (CS-02's Cacklejaw laugh is back-lit by the haze otherwise),
 * through the cutscene lamp slot (PERF S5t: no PointLight, so nothing recompiles mid-scene).
 * `fillLight(cs, id, { intensity: 0 })` keeps it dark; `intensity > 0` lights a pool at the actor's face
 * (strength = intensity / 6); `fillLight(cs, null)` releases the slot (call it from the scene's `end.call`).
 * @param {any} cs the running Cutscene  @param {string|null} id spawned actor id
 * @param {{ intensity?: number, color?: string, pos?: number[], distance?: number }} [o]
 */
export function fillLight(cs, id, o = {}) {
  try {
    const ctx = cs?.ctx;
    if (id == null || !(o.intensity > 0)) { releaseLamp(ctx, cs); return; }
    const a = cs.actor?.(id);
    const obj = a?.object3d ?? cs.spawned?.find((r) => r.id === id && r.obj?.isObject3D)?.obj;
    if (!obj) return;
    const p = o.pos ?? [0.35, 1.55, 1.1];
    const w = new THREE.Vector3(p[0], p[1], p[2]);
    obj.updateWorldMatrix?.(true, false);
    obj.localToWorld?.(w);
    claimLamp(ctx, cs, w, { color: o.color ?? '#FFC98A', r: o.distance ?? 3.2, str: Math.min(1.5, o.intensity / 6) });
  } catch (e) { console.warn('[story] fill light failed', e); }
}

/** [x, z] `side` m to the left of an actor and `back` m behind it (models face +Z; +X local is the left). Pure. */
export function beside(a, side = 0.5, back = 0.3) {
  const f = a?.facing ?? 0, x = a?.pos?.x ?? 0, z = a?.pos?.z ?? 0;
  return [x + Math.cos(f) * side - Math.sin(f) * back, z - Math.sin(f) * side - Math.cos(f) * back];
}

/**
 * Pearl's hand-drawn "HELP (please)" sign (CS-02, ON §5.3): a 128 × 64 canvas on a little stick, cocoa ink on cream.
 * Built by the cutscene `spawn` step (`build`), disposed with the scene.
 */
export function buildSign(text = 'HELP (please)') {
  const g = new THREE.Group();
  g.name = 'story:sign';
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#FFF6E2'; x.fillRect(0, 0, 128, 64);
    x.strokeStyle = '#FF8FB1'; x.lineWidth = 4; x.strokeRect(3, 3, 122, 58);
    x.fillStyle = '#5A3B2E'; x.font = 'bold 22px Fredoka, "Trebuchet MS", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const i = String(text).indexOf(' (');
    const a = i > 0 ? text.slice(0, i) : String(text), b = i > 0 ? text.slice(i + 1) : '';
    x.fillText(a, 64, b ? 24 : 32);
    if (b) { x.font = '16px Fredoka, "Trebuchet MS", sans-serif'; x.fillText(b, 64, 46); }
    map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshBasicMaterial({ color: '#FFFFFF', map, side: THREE.DoubleSide }));
  board.position.y = 0.42;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.42, 5), new THREE.MeshLambertMaterial({ color: '#B7773F' }));
  stick.position.y = 0.21;
  g.add(board, stick);
  g.userData.dispose = () => { board.geometry.dispose(); board.material.map?.dispose(); board.material.dispose(); stick.geometry.dispose(); stick.material.dispose(); };
  return g;
}
