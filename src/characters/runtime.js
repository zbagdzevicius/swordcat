// In-game glue for the characters area (GAME_DESIGN §19.2 characters row; CONTRIBUTING §5–§6).
// characters has no ctx system of its own: the first KittenView (or anyone) calls initCharacters(ctx), which
//   - maps core's quality preset (ctx.quality.furShells / kittenShells, E.QUALITY) onto the fur shell counts,
//   - drives the shared fur / cape wind from ctx.env.wind once per rendered frame unless world's Env writes FUR_WIND,
//   - keeps a character environment map (overcast PMREM from the live Env colours) on every lit material we own,
//   - resolves asset URLs through ctx.assets.url (plate font).
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
    ctx, frame: -1, envCheck: 0, envColors: null, envRT: null, pmrem: null,
    dispose() {
      for (const off of offs.splice(0)) { try { off(); } catch { /* bus gone */ } }
      if (st.envRT) { setCharacterEnvMap(null); st.envRT.dispose(); st.envRT = null; }
      st.pmrem?.dispose(); st.pmrem = null;
      _states.delete(ctx);
    },
  };
  _states.set(ctx, st);
  if (typeof ctx.assets?.url === 'function') setAssetResolver((p) => ctx.assets.url(p));
  setFurQuality(furShellsForPreset(ctx.quality));
  const bus = ctx.bus;
  if (bus?.on) {
    offs.push(bus.on(E.QUALITY, (p) => setFurQuality(furShellsForPreset(p?.preset ?? ctx.quality))));
    offs.push(bus.on(E.ENV_CHANGED, () => { st.envCheck = 0; }));
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
  if (st.envCheck-- <= 0) { st.envCheck = CHAR_ENV.every; syncCharEnv(st); }
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

/** Rebuild cadence / threshold for the character env (frames between checks; summed rgb delta that triggers a rebuild). */
export const CHAR_ENV = Object.freeze({ every: 20, delta: 0.04, softbox: 2.6, size: 256 });

/**
 * Colours for the overcast character env from the live Env lights: sky = hemisphere sky × intensity, horizon = fog,
 * ground = hemisphere ground, softbox = sun × intensity (a crisp dome highlight on the pauldrons, art.md §4.1).
 * @param {any} env ctx.env
 * @returns {{top: THREE.Color, horizon: THREE.Color, ground: THREE.Color, box: THREE.Color}|null}
 */
export function charEnvColors(env) {
  const hemi = env?.hemiLight, sun = env?.sunLight, fog = env?.fog ?? env?.ctx?.scene?.fog;
  if (!hemi) return null;
  const hi = hemi.intensity / 1.1;
  const top = hemi.color.clone().multiplyScalar(Math.min(1.4, hi * 1.06));
  const horizon = (fog?.color ?? hemi.color).clone().multiplyScalar(Math.min(1.3, 0.35 + 0.65 * hi));
  const ground = hemi.groundColor.clone().multiplyScalar(Math.min(1.3, hi));
  const box = (sun?.visible !== false && sun ? sun.color.clone().multiplyScalar(sun.intensity * CHAR_ENV.softbox) : new THREE.Color(0, 0, 0));
  return { top, horizon, ground, box };
}

/** Build the PMREM for charEnvColors() (needs a WebGLRenderer). */
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

/** Keep the character env in step with Env (called from characterFrame every CHAR_ENV.every frames). */
function syncCharEnv(st) {
  const ctx = st.ctx, r = ctx.renderer;
  if (!r || typeof r.getContext !== 'function') return;
  const c = charEnvColors(ctx.env);
  if (!c || colorDelta(c, st.envColors) < CHAR_ENV.delta) return;
  try {
    st.pmrem ??= new THREE.PMREMGenerator(r);
    const rt = buildCharEnv(r, st.pmrem, c);
    const old = st.envRT;
    st.envRT = rt; st.envColors = c;
    setCharacterEnvMap(rt.texture);
    old?.dispose();
  } catch (e) { console.warn('[characters] character env failed', e); st.envColors = c; }
}

/** Visual dt for character animation: 0 during hitstop and in the pause menu, scaled by slow motion. */
export function visualDt(ctx, frameDt) {
  const g = ctx?.game;
  if (!g) return frameDt;
  if (g.hitstopT > 0 || g.mode === 'menu') return 0;
  return frameDt * (g.loop?.timeScale ?? 1);
}
