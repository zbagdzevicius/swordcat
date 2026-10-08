// In-game glue for the characters area (GAME_DESIGN §19.2 characters row; CONTRIBUTING §5–§6).
// characters has no ctx system of its own:
//   - initCharacters(ctx) (the first KittenView calls it) maps core's quality preset (ctx.quality.furShells /
//     kittenShells, E.QUALITY) onto the fur shell counts and resolves asset URLs through ctx.assets.url (plate font);
//   - characterFrame(ctx) drives the shared fur / cape wind from ctx.env.wind unless world's Env writes FUR_WIND;
//   - the character environment map (overcast PMREM from the LIVE scene lights, art.md §4.1) needs no ctx at all:
//     every kitten reports the renderer + scene that draw it (noteRender) and Kitten.simulate() calls envTick().
// Idempotent per ctx; node-safe (no DOM / WebGL at import).
import * as THREE from 'three';
import { E } from '../core/events.js';
import { setFurQuality, FUR_WIND } from './Fur.js';
import { setAssetResolver } from './util.js';
import { setCharacterEnvMap } from './materials.js';

/** Wind direction for fur and capes (world XZ, normalised at use) and m/s-ish gain per unit of env.wind. */
export const WIND = Object.freeze({ dir: [0.82, 0, 0.45], gain: 0.22, gustAmp: 0.35, gustPeriod: 3.8 });

const _states = new WeakMap();
const _dir = new THREE.Vector3();

/**
 * Fur shell counts for a core QUALITY preset (config.QUALITY.low/med/high: furShells = hero, kittenShells = companions).
 * @param {{furShells?: number, kittenShells?: number}|null|undefined} preset
 * @returns {{hero: number, kitten: number, npc: number}}
 */
export function furShellsForPreset(preset) {
  if (!preset) return { hero: 16, kitten: 10, npc: 0 };
  return { hero: Math.max(0, preset.furShells ?? 16), kitten: Math.max(0, preset.kittenShells ?? 10), npc: 0 };
}

/**
 * Hook the characters area into a running game. Safe to call many times (the first call per ctx wins).
 * @param {any} ctx game ctx (may be null in tools / tests: nothing happens)
 * @returns {{ ctx: any, frame: number, dispose(): void } | null}
 */
export function initCharacters(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  let st = _states.get(ctx);
  if (st) return st;
  const offs = [];
  st = {
    ctx, frame: -1,
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* bus gone */ } }
      _states.delete(ctx);
    },
  };
  _states.set(ctx, st);
  if (typeof ctx.assets?.url === 'function') setAssetResolver((p) => ctx.assets.url(p));
  setFurQuality(furShellsForPreset(ctx.quality));
  if (ctx.renderer && ctx.scene) noteRender(ctx.renderer, ctx.scene);
  const bus = ctx.bus;
  if (bus?.on) {
    offs.push(bus.on(E.QUALITY, (p) => setFurQuality(furShellsForPreset(p?.preset ?? ctx.quality))));
    offs.push(bus.on(E.ENV_CHANGED, () => { _env.countdown = 0; }));
  }
  return st;
}

/** Tear down initCharacters' listeners for a ctx (Game.dispose / HMR). */
export function disposeCharacters(ctx) { _states.get(ctx)?.dispose(); }

/**
 * Per-frame shared state (wind, character env map). Called by every KittenView.render; the first call per frame works.
 * @param {any} ctx
 */
export function characterFrame(ctx) {
  const st = ctx ? _states.get(ctx) ?? initCharacters(ctx) : null;
  if (!st) return;
  const f = ctx.game?.frameCount ?? -1;
  if (f === st.frame && f !== -1) return;
  st.frame = f;
  if (ctx.renderer && ctx.scene) noteRender(ctx.renderer, ctx.scene);   // Kitten.simulate() runs envTick() once per frame
  const env = ctx.env;
  // world's Env may own FUR_WIND (it writes it every frame after us): if the value changed since our last write,
  // someone else drives it and we stop writing for good.
  if (st.windExternal === undefined && st.windLast && !st.windLast.equals(FUR_WIND.value)) st.windExternal = true;
  if (!st.windExternal && env && typeof env.wind === 'number') {
    const t = ctx.game?.realTime ?? 0;
    const gust = 1 + WIND.gustAmp * Math.sin((t / WIND.gustPeriod) * Math.PI * 2);
    const w = env.wind * WIND.gain * gust;
    _dir.fromArray(WIND.dir).normalize();
    FUR_WIND.value.set(_dir.x * w, 0, _dir.z * w);
    (st.windLast ??= new THREE.Vector3()).copy(FUR_WIND.value);
  }
}

// ------------------------------------------------------------------ character environment map (art.md §4.1)
// The plate only reads as polished steel with an overcast PMREM that matches the scene (grey sky above, dark ground
// below, a crisp softbox highlight on the dome tops). It is built from the LIVE lights of whatever scene draws a
// kitten: every kitten's body mesh reports (renderer, scene) from onBeforeRender, and the next Kitten.simulate()
// (outside any render call) rebuilds the map when the light colours drift. No ctx needed, so the player's
// SwordcatModel, companions' KittenVisual, KittenView and the look-dev preview all get it.

/**
 * Rebuild cadence / threshold (frames between checks; summed rgb delta that triggers a rebuild), softbox gain, PMREM
 * size, and the readability floors: the sky / horizon reflections never drop below these luminances, so the steel
 * stays silver at night and in the keep (art.md mood rule: the hero keeps the highest contrast in every biome).
 */
export const CHAR_ENV = Object.freeze({
  every: 20, delta: 0.06, softbox: 2.6, size: 256, minTop: 0.62, minHorizon: 0.42, minBox: 1.6,
  fallback: Object.freeze({ top: '#E3E9EE', horizon: '#B9C2C4', ground: '#3E4A26', sun: '#FFF2E0' }),
});

const _seen = { renderer: null, scene: null };
const _env = { countdown: 0, colors: null, rt: null, pmrem: null, renderer: null, scene: null, hemi: null, sun: null, scanned: -1 };
const _lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function liftTo(c, min) { const l = _lum(c); if (l < min) { if (l < 1e-4) c.setScalar(min); else c.multiplyScalar(min / l); } return c; }

/**
 * Remember the renderer + scene that draw characters (every kitten body mesh calls this from onBeforeRender).
 * @param {THREE.WebGLRenderer} renderer @param {THREE.Scene} scene
 */
export function noteRender(renderer, scene) {
  if (renderer && typeof renderer.getContext === 'function') _seen.renderer = renderer;
  if (scene && scene.isScene) _seen.scene = scene;
}

/**
 * Environment colours from live lights (art.md §4.1): sky = hemisphere sky × intensity, horizon = fog colour,
 * ground = hemisphere ground, softbox = the strongest sun × intensity; lifted to the CHAR_ENV floors.
 * Without a hemisphere light: art.md's default overcast colours.
 * @param {THREE.HemisphereLight|null} hemi @param {THREE.DirectionalLight|null} sun @param {{color: THREE.Color}|null} fog
 * @returns {{top: THREE.Color, horizon: THREE.Color, ground: THREE.Color, box: THREE.Color}}
 */
export function envColorsFromLights(hemi, sun, fog) {
  const F = CHAR_ENV.fallback;
  if (!hemi) {
    const box = sun ? sun.color.clone().multiplyScalar(Math.max(0.6, sun.intensity)) : new THREE.Color(F.sun);
    return { top: new THREE.Color(F.top), horizon: new THREE.Color(fog?.color ?? F.horizon), ground: new THREE.Color(F.ground), box: box.multiplyScalar(CHAR_ENV.softbox) };
  }
  const hi = hemi.intensity / 1.1;
  const top = liftTo(hemi.color.clone().multiplyScalar(Math.min(1.4, hi * 1.06)), CHAR_ENV.minTop);
  const horizon = liftTo((fog?.color ?? hemi.color).clone().multiplyScalar(Math.min(1.3, 0.35 + 0.65 * hi)), CHAR_ENV.minHorizon);
  const ground = hemi.groundColor.clone().multiplyScalar(Math.min(1.3, hi));
  const box = sun && sun.visible !== false && sun.intensity > 0.001
    ? liftTo(sun.color.clone().multiplyScalar(sun.intensity * CHAR_ENV.softbox), CHAR_ENV.minBox)
    : top.clone().multiplyScalar(CHAR_ENV.minBox / Math.max(1e-3, _lum(top)));
  return { top, horizon, ground, box };
}

/** Colours for world's Env object ({ hemiLight, sunLight, fog }); null without a hemisphere light. */
export function charEnvColors(env) {
  if (!env?.hemiLight) return null;
  return envColorsFromLights(env.hemiLight, env.sunLight, env.fog ?? env.ctx?.scene?.fog ?? null);
}

/** Find the hemisphere light and the strongest directional light (top level first; a full traverse as fallback). */
function scanLights(scene) {
  let hemi = null, sun = null;
  const visit = (o) => {
    if (o.isHemisphereLight) { if (!hemi) hemi = o; }
    else if (o.isDirectionalLight && (!sun || o.intensity > sun.intensity)) sun = o;
  };
  for (const c of scene.children) visit(c);
  if (!hemi) { sun = null; scene.traverse(visit); }
  _env.hemi = hemi; _env.sun = sun; _env.scene = scene;
}

/** Build the PMREM for envColorsFromLights() (needs a WebGLRenderer). */
function buildCharEnv(renderer, pmrem, c) {
  const s = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: c.top }, hor: { value: c.horizon }, gnd: { value: c.ground } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top, hor, gnd; varying vec3 vP; void main(){ float y = vP.y; vec3 c = y > 0.0 ? mix(hor, top, pow(max(y, 0.0), 0.6)) : mix(hor, gnd, pow(max(-y, 0.0), 0.35)); gl_FragColor = vec4(c, 1.0); }',
  }));
  s.add(sky);
  const box = new THREE.Mesh(new THREE.PlaneGeometry(8, 3), new THREE.MeshBasicMaterial({ color: c.box, side: THREE.DoubleSide }));
  box.position.set(-3, 7, 4); box.lookAt(0, 0, 0); s.add(box);
  const rt = pmrem.fromScene(s, 0.02, 0.1, 100, { size: CHAR_ENV.size });
  sky.geometry.dispose(); sky.material.dispose(); box.geometry.dispose(); box.material.dispose();
  return rt;
}

function colorDelta(a, b) {
  if (!a || !b) return Infinity;
  let d = 0;
  for (const k of ['top', 'horizon', 'ground', 'box']) d += Math.abs(a[k].r - b[k].r) + Math.abs(a[k].g - b[k].g) + Math.abs(a[k].b - b[k].b);
  return d;
}

/**
 * Keep the character env map in step with the scene lights. Call once per rendered frame OUTSIDE renderer.render
 * (Kitten.simulate does). Cheap: a colour check every CHAR_ENV.every frames, a PMREM rebuild only on change.
 * @param {THREE.WebGLRenderer} [renderer] @param {THREE.Scene} [scene] default: the last ones that drew a kitten
 * @returns {boolean} true when the map was rebuilt
 */
export function envTick(renderer = _seen.renderer, scene = _seen.scene) {
  if (!renderer || !scene) return false;
  if (_env.countdown-- > 0) return false;
  _env.countdown = CHAR_ENV.every;
  if (renderer !== _env.renderer) { _env.pmrem?.dispose(); _env.pmrem = null; _env.renderer = renderer; _env.colors = null; }
  const stale = scene !== _env.scene || (_env.hemi && !_env.hemi.parent) || (_env.sun && !_env.sun.parent);
  if (stale || (!_env.hemi && (_env.scanned = (_env.scanned + 1) % 6) === 0)) scanLights(scene);
  const c = envColorsFromLights(_env.hemi, _env.sun, scene.fog);
  if (colorDelta(c, _env.colors) < CHAR_ENV.delta) return false;
  try {
    _env.pmrem ??= new THREE.PMREMGenerator(renderer);
    const rt = buildCharEnv(renderer, _env.pmrem, c);
    const old = _env.rt;
    _env.rt = rt; _env.colors = c;
    setCharacterEnvMap(rt.texture);
    old?.dispose();
    return true;
  } catch (e) { console.warn('[characters] character env failed', e); _env.colors = c; return false; }
}

/** The colours the current character env map was built from (debug / smoke), or null. */
export function characterEnvColors() { return _env.colors; }

/** Drop the character env map (tests / HMR). */
export function resetCharacterEnv() {
  setCharacterEnvMap(null);
  _env.rt?.dispose(); _env.pmrem?.dispose();
  Object.assign(_env, { countdown: 0, colors: null, rt: null, pmrem: null, renderer: null, scene: null, hemi: null, sun: null, scanned: -1 });
  _seen.renderer = null; _seen.scene = null;
}

/** Visual dt for character animation: 0 during hitstop and in the pause menu, scaled by slow motion. */
export function visualDt(ctx, frameDt) {
  const g = ctx?.game;
  if (!g) return frameDt;
  if (g.hitstopT > 0 || g.mode === 'menu') return 0;
  return frameDt * (g.loop?.timeScale ?? 1);
}
