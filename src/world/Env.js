// src/world/Env.js  (owner: world) — the single owner of scene fog, sky, sun, hemisphere light, wind, exposure and the
// shared warm-toon uniforms (GAME_DESIGN §12.2, §5.3; ART_WARM_SPEC §2.4–§2.5, §3.4; WARM_ADVENTURE_SPEC §2.2–§2.3).
// ctx.env contract (§19.3):
//   set({fogDensity, fogColor, wind, grade, sun: {color, intensity, elev?}, hemi?, skyTop?}, dur)
//   contribute(key, {fogAdd | fogMul | fogSet});  clear(key);  preset(name, dur);  fogDensity (final, read-only)
//   + wind, windDir, gust, grade, presetName (canonical: `forest_night` → `forest_twilight`, `hub_grey` → `hub_hush`)
// Final fog = clamp(((preset/story density) + Σ fogAdd) × Π fogMul, 0.005, 0.12); `fogSet` (Cacklejaw P3)
// overrides the base before the multipliers. Contributions ease in/out (~0.6 s). Emits env:changed; honours env:set.
// Warm look (ART §2.4): `TONE` tokens and the live `ENV_U` uniforms (rim, hero glow, 4 lamp pools) that every
// height-fogged lit material shares through `withHeightFog` (`|hfog3`). No PointLights (K2): her warm pool is
// `ENV_U.uGlow`, lanterns / torches feed `ENV_U.uLamps` (the 4 nearest the iso focus, 4 Hz). No PMREM in play.
// Exposure eases with the preset (`renderer.toneMappingExposure`), the background is the fog colour, and the iso sun
// azimuth comes from the level's default yaw (never a zone hint), so the shadow map never re-renders on a hint blend.
// Sun shadows (X7, AUTOCAM §9.2): stage 1 fits the box to the camera footprint every frame (texel-snapped, quantised,
// grow at once / shrink with hysteresis); stage 2 (`StaticShadow`) caches a statics-only map. Low has no shadow map.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { SkyDome } from './Sky.js';
import { HFOG, withHeightFog, fogFactor } from './HeightFog.js';
import { CAMERA, qualityShadowsOn } from '../core/config.js';
import { registerMaterialPatcher, FUR_WIND } from '../characters/index.js';
import { TONE, ENV_U } from './tone.js';
import { StaticShadow, footprintCorners, fitShadowBox, stepShadowFit, SHADOW_STAGE } from './StaticShadow.js';

export { TONE, ENV_U } from './tone.js';

/**
 * WA4 / LI W18: her warm pool (`uGlow`). By day the preset `hero` is 0.40 with radius 2.6 m, colour #FFE6B8; at
 * twilight / night (`hero` ≥ 1) radius 3.5 m. `mul` scales the glow colour (shader adds colour × g² × 0.6).
 */
export const GLOW = Object.freeze({ dayR: 2.6, nightR: 3.5, color: '#FFE6B8', nightColor: '#FFC890', mul: 1.0 });

/** PERF §8.2 lamp pools: the 4 nearest lit sources to the iso focus, re-sorted at `hz`; pool radius = light distance × `rMul`. */
export const LAMPS = Object.freeze({ max: 4, hz: 4, rMul: 0.55, minR: 2.5, maxR: 7 });

/** ART §8.5: Golden Hour adds this to the preset exposure (eased over `ease` s). */
export const EXPOSURE = Object.freeze({ golden: 0.06, ease: 0.25, min: 0.8, max: 1.3 });

/**
 * ART §2.5 + WA §2.3 presets. `sunElev` = sun elevation (rad), `sunAz` = azimuth (yaw, rad; cutscenes and the classic
 * camera — the iso azimuth comes from the level yaw), `fogLow` = height-fog ground colour, `skyTop` → horizon
 * (= fogColor), `env` = environment intensity (High close-ups only), `shadowI` → sun.shadow.intensity, `exposure` →
 * toneMappingExposure, `rim` ('day' | 'night' | 'hush' | hex) → ENV_U.uRim, `hero` → her glow strength, `lamps` →
 * ENV_U.uLampStr (WA §2.3a: 1 for twilight / night / keep, 0.35 gate dusk, 0 elsewhere).
 * Fog densities are the gameplay values (CONTROLS / ART D13); cutscene-only presets set their own.
 */
export const ENV_PRESETS = {
  meadow_day:      { fogColor: '#F6E4C0', fogDensity: 0.045, fogLow: '#EED6A6', skyTop: '#8FCBF2', hemiSky: '#C4D9FF', hemiGround: '#C9A46A', hemi: 1.30, sunColor: '#FFE7C2', sun: 2.4, sunElev: 0.85, sunAz: -0.7, grade: 'none', wind: 0.6, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.40, lamps: 0 },
  meadow_morning:  { fogColor: '#FFE6CC', fogDensity: 0.040, fogLow: '#F2D3A8', skyTop: '#9FD0F5', hemiSky: '#CBD8FF', hemiGround: '#D4A874', hemi: 1.25, sunColor: '#FFE0B0', sun: 2.3, sunElev: 0.40, sunAz: -1.9, grade: 'none', wind: 0.5, env: 0.25, shadowI: 0.55, exposure: 1.02, rim: 'day', hero: 0.40, lamps: 0 },
  meadow_evening:  { fogColor: '#FFD4AA', fogDensity: 0.020, fogLow: '#F4BE92', skyTop: '#A9A8E6', hemiSky: '#B9B8F0', hemiGround: '#D89A6A', hemi: 1.20, sunColor: '#FFB878', sun: 2.5, sunElev: 0.25, sunAz: -1.9, grade: 'none', wind: 0.5, env: 0.25, shadowI: 0.55, exposure: 1.00, rim: '#FFD8A0', hero: 0.35, lamps: 0 },
  meadow_giggle:   { fogColor: '#CDBDF2', fogDensity: 0.062, fogLow: '#BFAFEA', skyTop: '#B9A9E8', hemiSky: '#D9CCFF', hemiGround: '#C9A0B0', hemi: 1.20, sunColor: '#FFD8E8', sun: 1.6, sunElev: 0.22, sunAz: -1.9, grade: 'none', wind: 0.9, env: 0.25, shadowI: 0.50, exposure: 1.02, rim: '#FFD8A0', hero: 0.6, lamps: 0 },   // CS-02 only
  meadow_night:    { fogColor: '#5A64A8', fogDensity: 0.050, fogLow: '#525C9E', skyTop: '#2E3A7E', hemiSky: '#9CB0F4', hemiGround: '#4A4478', hemi: 1.15, sunColor: '#C6D6FF', sun: 0.9, sunElev: 0.9, sunAz: 0.6, grade: 'night', wind: 0.4, env: 0.25, shadowI: 0.50, exposure: 1.08, rim: 'night', hero: 1, lamps: 1 },   // callbacks only
  forest_day:      { fogColor: '#DCE8BE', fogDensity: 0.060, fogLow: '#C6DA98', skyTop: '#9AD4E8', hemiSky: '#B9D8F5', hemiGround: '#A08A52', hemi: 1.30, sunColor: '#FFE2A8', sun: 2.3, sunElev: 0.90, sunAz: -0.5, grade: 'none', wind: 0.4, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.40, lamps: 0 },
  forest_twilight: { fogColor: '#6A66B4', fogDensity: 0.055, fogLow: '#5A6E96', skyTop: '#3A3E96', hemiSky: '#B0B6F4', hemiGround: '#3E6A58', hemi: 1.25, sunColor: '#D6E6FF', sun: 0.9, sunElev: 0.9, sunAz: 0.6, grade: 'night', wind: 0.3, env: 0.25, shadowI: 0.50, exposure: 1.10, rim: 'night', hero: 1, lamps: 1 },
  town_occupied:   { fogColor: '#F0DEC0', fogDensity: 0.040, fogLow: '#E4CCA6', skyTop: '#86C6EE', hemiSky: '#C8C8F0', hemiGround: '#B08A62', hemi: 1.20, sunColor: '#FFE0B4', sun: 2.3, sunElev: 0.75, sunAz: -0.9, grade: 'none', wind: 0.4, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.40, lamps: 0 },
  hub_gold:        { fogColor: '#FFE0B4', fogDensity: 0.025, fogLow: '#F6CF9C', skyTop: '#9CC8F0', hemiSky: '#CBD3FF', hemiGround: '#D2A070', hemi: 1.25, sunColor: '#FFD9A6', sun: 2.6, sunElev: 0.45, sunAz: -1.6, grade: 'none', wind: 0.4, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.35, lamps: 0 },
  hub_hush:        { fogColor: '#C6C0E4', fogDensity: 0.050, fogLow: '#B4ACD8', skyTop: '#8C96D6', hemiSky: '#D0D4EE', hemiGround: '#8E8A9A', hemi: 1.30, sunColor: '#F2E2F0', sun: 1.3, sunElev: 0.70, sunAz: -0.7, grade: 'grey', wind: 0.5, env: 0.25, shadowI: 0.45, exposure: 1.02, rim: 'hush', hero: 0.60, lamps: 0 },
  ending_gold:     { fogColor: '#FFE8C8', fogDensity: 0.010, fogLow: '#FFD8A8', skyTop: '#9CC8F0', hemiSky: '#D0DCFF', hemiGround: '#E0B080', hemi: 1.30, sunColor: '#FFD9A6', sun: 2.8, sunElev: 0.35, sunAz: -1.6, grade: 'gold', wind: 0.4, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.35, lamps: 0 },
  gate_dusk:       { fogColor: '#FFC09A', fogDensity: 0.050, fogLow: '#F2A88A', skyTop: '#8C7ACB', hemiSky: '#9C9AE0', hemiGround: '#C07A5A', hemi: 1.15, sunColor: '#FF9E5E', sun: 2.4, sunElev: 0.25, sunAz: -2.2, grade: 'none', wind: 0.8, env: 0.25, shadowI: 0.55, exposure: 1.00, rim: '#FFD8A0', hero: 0.40, lamps: 0.35 },
  bog:             { fogColor: '#A8E0D0', fogDensity: 0.058, fogLow: '#86CDBB', skyTop: '#86CCE6', hemiSky: '#A8E0E0', hemiGround: '#6E7A4A', hemi: 1.30, sunColor: '#F4F0C0', sun: 1.9, sunElev: 0.75, sunAz: -0.6, grade: 'none', wind: 0.3, env: 0.25, fogFalloff: 1.2, shadowI: 0.55, exposure: 1.00, rim: '#FFF0C6', hero: 0.35, lamps: 0 },   // day variant (Wardrobe / debug)
  bog_dusk:        { fogColor: '#86C2C8', fogDensity: 0.058, fogLow: '#6AAFA8', skyTop: '#7A68C8', hemiSky: '#B8A8F0', hemiGround: '#3E7A66', hemi: 1.35, sunColor: '#FFCF98', sun: 1.6, sunElev: 0.28, sunAz: -0.6, grade: 'none', wind: 0.3, env: 0.25, fogFalloff: 1.2, shadowI: 0.50, exposure: 1.05, rim: '#FFF0C6', hero: 1, lamps: 1 },
  keep_twilight:   { fogColor: '#8A74B0', fogDensity: 0.042, fogLow: '#8E6A8A', skyTop: '#3E3A8E', hemiSky: '#CDB8F4', hemiGround: '#6A4E5E', hemi: 1.45, sunColor: '#BFEDE6', sun: 1.0, sunElev: 0.55, sunAz: 0.4, grade: 'night', wind: 0.5, env: 0.25, shadowI: 0.45, exposure: 1.08, rim: 'night', hero: 1, lamps: 1 },
  keep_storm:      { fogColor: '#6E5480', fogDensity: 0.042, fogLow: '#7A5A6A', skyTop: '#3E3270', hemiSky: '#C2AEE2', hemiGround: '#5A4048', hemi: 1.45, sunColor: '#FFC488', sun: 0.9, sunElev: 0.35, sunAz: 0.4, grade: 'none', wind: 1.0, env: 0.25, shadowI: 0.45, exposure: 1.05, rim: 'night', hero: 1, lamps: 1 },   // Barkus P3 only
  keep_cellar:     { fogColor: '#A88AB0', fogDensity: 0.028, fogLow: '#9A7A96', skyTop: '#5A4E9A', hemiSky: '#F2D2B4', hemiGround: '#7A5A6A', hemi: 1.55, sunColor: '#FFD6A0', sun: 0.8, sunElev: 0.9, sunAz: 0.4, grade: 'night', wind: 0, env: 0.25, shadowI: 0.40, exposure: 1.10, rim: '#FFC46B', hero: 1, lamps: 1 },   // WA29 toy cellar
  sky_night:       { fogColor: '#4A5498', fogDensity: 0.020, fogLow: '#4A5498', skyTop: '#24306E', hemiSky: '#A8B4F0', hemiGround: '#2A2E52', hemi: 1.05, sunColor: '#D6E2FF', sun: 0.9, sunElev: 0.80, sunAz: 0.5, grade: 'night', wind: 1.2, env: 0.25, shadowI: 0.50, exposure: 1.05, rim: 'night', hero: 1, lamps: 0 },
  sky_sunrise:     { fogColor: '#FFE2C0', fogDensity: 0.006, fogLow: '#FFE2C0', skyTop: '#9CCBF0', hemiSky: '#D0DCFF', hemiGround: '#E0B080', hemi: 1.25, sunColor: '#FFD49A', sun: 2.5, sunElev: 0.25, sunAz: -1.6, grade: 'gold', wind: 1.0, env: 0.25, shadowI: 0.60, exposure: 1.00, rim: 'day', hero: 0.20, lamps: 0 },
};

/**
 * Legacy preset ids kept for story cues and old saves (WA §0: code ids never change). `preset('forest_night')`
 * plays the `forest_twilight` row; `hub_grey` plays `hub_hush`. `presetName` reports the canonical name.
 */
export const PRESET_ALIASES = Object.freeze({ forest_night: 'forest_twilight', hub_grey: 'hub_hush' });
for (const [alias, to] of Object.entries(PRESET_ALIASES)) Object.defineProperty(ENV_PRESETS, alias, { value: ENV_PRESETS[to], enumerable: false });

/** The canonical preset name for `name` (aliases resolved; unknown names unchanged). Pure. */
export const resolvePreset = (name) => PRESET_ALIASES[name] ?? name;
/** All names (canonical + aliases) that address preset `name`. Pure. */
export function presetNames(name) {
  const c = resolvePreset(name), out = [c];
  for (const [a, t] of Object.entries(PRESET_ALIASES)) if (t === c) out.push(a);
  return out;
}

const NUM = ['fogDensity', 'hemi', 'sun', 'sunElev', 'sunAz', 'wind', 'env', 'fogFalloff', 'hero', 'shadowI', 'exposure', 'lamps'];
const COL = ['fogColor', 'fogLow', 'skyTop', 'hemiSky', 'hemiGround', 'sunColor', 'rim'];
const NUM_DEFAULT = { fogFalloff: 0.6, env: 0.25, sunAz: -0.7, shadowI: 0.5, exposure: 1, hero: 0, lamps: 0 };
const FOG_MIN = 0.005, FOG_MAX = 0.12;
/** Shadow box fallback half-size (m) when no footprint can be computed (classic camera / cutscenes). */
export const SHADOW_HALF = 20;
/** ART §2.5: the iso sun key comes from screen-left: azimuth = level yaw + `day` rad (night rows + `night`). */
export const ISO_SUN = Object.freeze({ day: 1.75, night: 1.20 });
/** signed smallest angle a − b */
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

const _c = new THREE.Color();
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _w = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** The rim colour of a preset `rim` key ('day' | 'night' | 'hush' | hex). Pure. */
export function rimColor(rim) {
  if (rim === 'night') return TONE.rimNight;
  if (rim === 'hush') return TONE.rimHush;
  if (typeof rim === 'string' && rim.startsWith('#')) return rim;
  return TONE.rimDay;
}

/** Preset row → tweenable state (colours as THREE.Color). Pure. */
export function toState(p) {
  const s = { grade: p.grade ?? 'none' };
  for (const k of NUM) s[k] = p[k] ?? NUM_DEFAULT[k] ?? 0;
  for (const k of COL) s[k] = new THREE.Color(k === 'rim' ? rimColor(p.rim) : (p[k] ?? (k === 'fogLow' || k === 'skyTop' ? p.fogColor : '#FFFFFF')));
  return s;
}

/**
 * Pure fog maths (§12.2). `contribs` = iterable of { fogAdd?, fogMul?, fogSet? }.
 * @returns {number} final density, clamped 0.005–0.12
 */
export function finalFog(base, contribs) {
  let add = 0, mul = 1, set = null;
  for (const c of contribs) {
    if (!c) continue;
    add += c.fogAdd ?? 0;
    mul *= c.fogMul ?? 1;
    if (c.fogSet != null) set = set == null ? c.fogSet : Math.max(set, c.fogSet);
  }
  return clamp(((set ?? base) + add) * mul, FOG_MIN, FOG_MAX);
}

/**
 * PERF §8.3 fog radius (98 % fog, FOG_EXP2 with focus fog): R = clear + 1.978 / (ρ · topMul). Pure.
 * @param {number} density @param {number} clear @param {number} topMul
 */
export function fogRadius(density, clear = 5, topMul = 1.5) {
  return clear + 1.978 / Math.max(1e-4, density * Math.max(0.05, topMul));
}

/** Iso sun azimuth for a level yaw (ART §2.5; night / twilight rows key from +1.20). Pure. */
export function isoSunAz(yaw, night = false) { return yaw + (night ? ISO_SUN.night : ISO_SUN.day); }

/** Interpolate two states into `out` (smoothstep `e` in 0..1). */
function lerpState(out, a, b, e) {
  for (const k of NUM) out[k] = k === 'sunAz' ? a[k] + angDiff(b[k], a[k]) * e : a[k] + (b[k] - a[k]) * e;
  for (const k of COL) out[k].copy(a[k]).lerp(b[k], e);
  out.grade = e >= 0.5 ? b.grade : a.grade;
  return out;
}

function cloneState(s) {
  const o = { grade: s.grade };
  for (const k of NUM) o[k] = s[k];
  for (const k of COL) o[k] = s[k].clone();
  return o;
}

/**
 * The lamp registry the world's light sources feed (Dressing `LightPool` sources, lit lanterns): `pick(focus, out)`
 * writes the `n` nearest lit ones into `ENV_U.uLamps` (radius 0 for unused slots). Allocation-free after warm-up.
 */
export class LampSet {
  constructor() { this.sources = []; this._pick = []; }
  /** @param {{pos: THREE.Vector3, on?: boolean, intensity?: number, distance?: number, flicker?: number}} s */
  add(s) { if (!this.sources.includes(s)) this.sources.push(s); return s; }
  remove(s) { const i = this.sources.indexOf(s); if (i >= 0) this.sources.splice(i, 1); }
  clear() { this.sources.length = 0; }
  /** Re-pick the lit sources nearest `focus` (call at LAMPS.hz). Returns how many are lit. */
  sort(focus) {
    const pick = this._pick; pick.length = 0;
    for (const s of this.sources) if (s.on !== false && (s.intensity ?? 1) > 0) pick.push(s);
    if (focus) {
      this._f = focus;
      pick.sort(this._cmp ??= (a, b) => a.pos.distanceToSquared(this._f) - b.pos.distanceToSquared(this._f));
    }
    return pick.length;
  }

  /**
   * Write the picked sources into `slots` (Vector4[]: x, y, z, radius; radius 0 = off). `t` animates the flicker.
   * @param {THREE.Vector4[]} slots @param {number} t
   */
  write(slots, t = 0) {
    const pick = this._pick;
    for (let i = 0; i < slots.length; i++) {
      const s = pick[i], o = slots[i];
      if (!s || s.on === false) { o.set(0, -999, 0, 0); continue; }
      const ph = s.pos.x * 1.7 + s.pos.z * 0.9, fl = s.flicker ?? 0.25;
      const f = 1 - fl * 0.35 * (0.5 + 0.5 * Math.sin(t * 13 + ph) * Math.sin(t * 7.3 + ph * 2.1));
      const r = clamp((s.distance ?? 8) * LAMPS.rMul, LAMPS.minR, LAMPS.maxR) * Math.min(1.25, Math.max(0.5, (s.intensity ?? 1.6) / 1.6)) ** 0.5;
      o.set(s.pos.x, s.pos.y, s.pos.z, r * f);
    }
    return pick.length;
  }

  /** sort + write in one call (tests, one-off updates). */
  pick(focus, slots, t = 0) { this.sort(focus); return this.write(slots, t); }
}

export class Env {
  constructor(ctx) {
    this.ctx = ctx;
    this.presetName = 'meadow_day';
    this.cur = toState(ENV_PRESETS.meadow_day);
    this.from = null; this.to = null; this.t = 0; this.dur = 0;
    /** @type {Map<string, {fogAdd?: number, fogMul?: number, fogSet?: number}>} */
    this.contrib = new Map();
    this.hemiLight = null; this.sunLight = null; this.fog = null; this.sky = null;
    this._final = this.cur.fogDensity;          // eased final density
    this._target = this.cur.fogDensity;         // final density the contributions ask for
    this._emitT = 0;
    this.windDir = new THREE.Vector2(0.8, 0.6).normalize();
    /** 0..1 slow gust envelope (shared by grass, cape, audio) */
    this.gust = 0;
    this._time = 0;
    this._patched = new WeakSet();
    this._offs = [];
    /** PERF §8.2: world light sources (lanterns, torches, the campfire) feeding ENV_U.uLamps */
    this.lamps = new LampSet();
    this._lampT = 0;
    /** eased exposure (preset + Golden Hour) */
    this._exposure = this.cur.exposure;
    /** stage 1 shadow fit state + the stage 2 cache (StaticShadow) */
    this._fit = { halfX: SHADOW_HALF, halfY: SHADOW_HALF, cx: 0, cy: 0, shrinkT: 0, ok: false };
    this.staticShadow = null;
    /** 1 = dynamic footprint fit (S3), 2 = cached statics-only map (S5; needs actor blobs + castShadow=false) */
    this.shadowStage = SHADOW_STAGE;
  }

  /** Final fog density (read-only). */
  get fogDensity() { return this._final; }

  /** The row of a per-preset table (`{ forest_twilight: {...} }` or the legacy `{ forest_night: {...} }`) for the current preset. */
  _presetRow(table) {
    if (!table) return null;
    for (const n of presetNames(this.presetName)) if (table[n]) return table[n];
    return null;
  }

  /**
   * CONTROLS_SPEC §4.1 focus fog (camera calls this every render): `focus` = the iso focus, `mode` 0 = lens fog
   * (cutscenes, presets, Meme Cam, classic) … 1 = focus fog, `combat` / `boss` widen the clear radius (5 → 7 m, eased
   * CAMERA.iso.fog.ease s), Golden Hour × goldenClearMul, `env.contribute(key, { clear })` overrides (Cacklejaw P3 3.5).
   * Per-level `level.cam.fog` ({ clear, clearCombat, topMul }) overrides CAMERA.iso.fog.
   */
  setFocusFog({ focus, mode = 1, clear, combat = false } = {}) {
    const F = CAMERA.iso?.fog;
    if (!F) return;
    // `level.cam.fog` may carry per-preset rows (forest_twilight): { clear, clearCombat, topMul, <preset>: {...} }
    const fr = this.ctx.levels?.current?.cam?.fog;
    const lv = this._presetRow(fr) ?? fr ?? {};
    if (focus) HFOG.uFogFocus.value.set(focus.x, focus.y, focus.z);
    HFOG.uFogMode.value = Math.max(0, Math.min(1, mode));
    // a zone hint's `clear` (§2.2: the Mushroom Ring 7 m) replaces the level's explore clear radius
    const zc = this.ctx.levels?.current?.camZone?.cam?.clear;
    let want = Number.isFinite(clear) ? clear : combat ? Math.max(lv.clearCombat ?? F.clearCombat, Number.isFinite(zc) ? zc : 0) : (Number.isFinite(zc) ? zc : (lv.clear ?? F.clear));
    for (const c of this.contrib.values()) if (Number.isFinite(c?.clear)) want = Math.min(want, c.clear);
    if (this.ctx.player?.golden) want *= F.goldenClearMul;
    const dt = Math.min(0.1, this._fogDt ?? 1 / 60);
    this._clear = this._clear == null ? want : this._clear + (want - this._clear) * Math.min(1, dt / Math.max(0.05, F.ease) * 3);
    HFOG.uFogClear.value = this._clear;
    HFOG.uFogTopMul.value = lv.topMul ?? F.topMul;
    this._lowMixIso = mode;
    this._focusMode = mode;
  }

  /** PERF §8.3: the current fog radius R (m from the focus where the fog reaches 98 %): the cull and far-plane input. */
  get fogRadius() { return fogRadius(this._final, HFOG.uFogClear.value, HFOG.uFogTopMul.value); }

  /** CONTROLS_SPEC §12 core 5 (`__GAME__.fogAt`): the final fog factor at world (x, z) (height fog at the ground). */
  fogAt(x, z, y) {
    const f = HFOG.uFogFocus.value, cam = this.ctx.camera;
    const gy = Number.isFinite(y) ? y : (this.ctx.physics?.heightAt?.(x, z) ?? 0);
    const viewDepth = cam ? Math.hypot(cam.position.x - x, cam.position.y - gy, cam.position.z - z) : 0;
    return fogFactor({ density: this._final, mode: HFOG.uFogMode.value, clear: HFOG.uFogClear.value, topMul: HFOG.uFogTopMul.value,
      base: HFOG.uFogBase.value, falloff: HFOG.uFogFalloff.value, focus: f, viewDepth }, { x, y: gy, z });
  }
  /** Wind strength 0–3 (preset/story; grass and audio wind read it). */
  get wind() { return this.cur.wind; }
  get grade() { return this.cur.grade; }

  async init() {
    const { scene, bus } = this.ctx;
    this.fog = new THREE.FogExp2(this.cur.fogColor.getHex(), this.cur.fogDensity);
    scene.fog = this.fog;
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.hemiLight.name = 'env:hemi';
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.name = 'env:sun';
    const sh = this.sunLight.shadow, q = this.ctx.quality;
    const size = q?.shadowMap ?? 1024;
    if (size > 0) sh.mapSize.set(size, size);
    sh.bias = -0.0005; sh.normalBias = 0.03; sh.radius = 1;
    Object.assign(sh.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 90 });
    sh.camera.updateProjectionMatrix();
    // K3: 'none' | 'sun' (the retired boolean still reads right); Low has no map at all (blobs + vertex AO)
    this.sunLight.castShadow = q == null ? true : qualityShadowsOn(q) && size > 0;
    scene.add(this.hemiLight, this.sunLight, this.sunLight.target);
    this.sky = new SkyDome();
    scene.add(this.sky.mesh);
    scene.environment = null;                     // PERF §8.2: no PMREM in play (High close-up plates are characters')
    this.staticShadow = new StaticShadow(this);
    this._unpatch = registerMaterialPatcher((m) => withHeightFog(m));
    this._offs.push(
      bus.on(E.ENV_SET, (p) => { if (p?.preset) this.preset(p.preset, p.dur ?? 0); else this.set(p ?? {}, p?.dur ?? 0); }),
      bus.on(E.QUALITY, ({ preset }) => this.applyQuality(preset)),
      bus.on(E.LEVEL_UNLOAD, () => { this.lamps.clear(); this.staticShadow?.invalidate(); }),
      bus.on(E.LEVEL_LOADED, () => this.staticShadow?.invalidate()),
    );
    this._apply(true);
  }

  /** E.QUALITY: shadow on / off and map size (behind the veil only; it recompiles every receiver). */
  applyQuality(preset) {
    const L = this.sunLight;
    if (!L) return;
    const s = preset?.shadowMap ?? 1024, on = qualityShadowsOn(preset) && s > 0;
    L.castShadow = on;
    if (on && L.shadow.mapSize.x !== s) { L.shadow.mapSize.set(s, s); L.shadow.map?.dispose(); L.shadow.map = null; }
    this.staticShadow?.invalidate();
  }

  /** Tween to a named preset over `dur` seconds (sim time). Aliases resolve; unknown names warn and are ignored. */
  preset(name, dur = 0) {
    const key = resolvePreset(name), p = ENV_PRESETS[key];
    if (!p) { console.warn(`[env] unknown preset ${name}`); return; }
    this.presetName = key;
    this._tweenTo(toState(p), dur);
  }

  /** Tween fields: { fogDensity, fogColor, fogLow, wind, grade, hemi, skyTop, exposure, sun: { color, intensity, elev, az } }. */
  set(fields = {}, dur = 0) {
    const to = cloneState(this.to ?? this.cur);
    if (fields.fogDensity != null) to.fogDensity = fields.fogDensity;
    if (fields.fogColor != null) { to.fogColor.set(fields.fogColor); if (fields.fogLow == null) to.fogLow.copy(to.fogColor).multiplyScalar(0.94); }
    if (fields.fogLow != null) to.fogLow.set(fields.fogLow);
    if (fields.skyTop != null) to.skyTop.set(fields.skyTop);
    if (fields.wind != null) to.wind = fields.wind;
    if (fields.grade != null) to.grade = fields.grade;
    if (fields.hemi != null) to.hemi = fields.hemi;
    if (fields.exposure != null) to.exposure = fields.exposure;
    if (fields.sun?.color != null) to.sunColor.set(fields.sun.color);
    if (fields.sun?.intensity != null) to.sun = fields.sun.intensity;
    if (fields.sun?.elev != null) to.sunElev = fields.sun.elev;
    if (fields.sun?.az != null) to.sunAz = fields.sun.az;
    this._tweenTo(to, dur);
  }

  /** Fog contribution under `key`: { fogAdd } (jeer +0.01, lanterns −0.005), { fogMul } (Golden Hour 0.5), { fogSet } (override). */
  contribute(key, c) { this.contrib.set(key, { ...c }); this._recalc(); this._emit(); }
  clear(key) { if (this.contrib.delete(key)) { this._recalc(); this._emit(); } }

  _tweenTo(to, dur) {
    if (!(dur > 0)) { this.cur = to; this.from = this.to = null; this._recalc(); this._final = this._target; this._exposure = to.exposure; this.staticShadow?.invalidate(); this._apply(true); return; }
    this.from = cloneState(this.cur); this.to = to; this.t = 0; this.dur = dur;
    this._emit();
  }

  _recalc() { this._target = finalFog(this.cur.fogDensity, this.contrib.values()); }

  _emit() { this.ctx.bus.emit(E.ENV_CHANGED, { fogDensity: this._target, grade: (this.to ?? this.cur).grade, wind: (this.to ?? this.cur).wind, preset: this.presetName }); }

  /** Is a preset tween running (the cached shadow re-renders every 4th frame while it does)? */
  get tweening() { return !!this.to; }

  update(dt) {
    this._time += dt;
    if (this.to) {
      this.t += dt;
      const u = Math.min(1, this.t / this.dur), e = u * u * (3 - 2 * u);
      lerpState(this.cur, this.from, this.to, e);
      if (u >= 1) { this.cur = this.to; this.from = this.to = null; this.staticShadow?.invalidate(); }
      this._recalc();
      this._final = this._target;
      if ((this._emitT += dt) >= 0.25 || !this.to) { this._emitT = 0; this._emit(); }
    } else {
      this._recalc();
      this._final = damp(this._final, this._target, 5, dt);
      if (Math.abs(this._final - this._target) < 1e-5) this._final = this._target;
    }
    // exposure: the preset value + Golden Hour (ART §8.5), eased
    const wantExp = this.cur.exposure + (this.ctx.player?.golden ? EXPOSURE.golden : 0);
    this._exposure = damp(this._exposure, wantExp, 1 / Math.max(0.05, EXPOSURE.ease) * 3, dt);
    // slow gust envelope (two incommensurate sines), shared by grass / capes / audio
    const t = this._time;
    this.gust = clamp(0.5 + 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1.3) + 0.15 * Math.sin(t * 1.1), 0, 1);
    this._apply(false);
  }

  _apply(emit) {
    const c = this.cur;
    if (this.fog) { this.fog.density = this._final; this.fog.color.copy(c.fogColor); }
    // ART §2.5: the clear colour is the fog colour (never the old grey)
    const bg = this.ctx.scene.background;
    if (bg?.isColor) bg.copy(c.fogColor); else this.ctx.scene.background = c.fogColor.clone();
    // per-level lighting from above (`level.cam.light`: { hemiMul, sunMul, sunAz, hemiSky, hemiGround } per preset, or
    // for every preset), mixed in with the focus-fog mode so cutscenes and Meme Cam keep the authored eye-level look
    const iso = this._isoLight(), mix = this._focusMode ?? 0;
    const isoMul = (k) => 1 + ((iso?.[k] ?? 1) - 1) * mix;
    if (this.hemiLight) {
      this.hemiLight.color.copy(c.hemiSky); this.hemiLight.groundColor.copy(c.hemiGround);
      if (iso?.hemiSky && mix > 0) this.hemiLight.color.lerp(_c.set(iso.hemiSky), mix);
      if (iso?.hemiGround && mix > 0) this.hemiLight.groundColor.lerp(_c.set(iso.hemiGround), mix);
      this.hemiLight.intensity = c.hemi * isoMul('hemiMul');
    }
    if (this.sunLight) {
      const sun = c.sun * isoMul('sunMul');
      this.sunLight.color.copy(c.sunColor); this.sunLight.intensity = sun;
      // stays visible at 0: hiding the light would change the light count and recompile every lit program
      this.sunLight.shadow.intensity = clamp(c.shadowI, 0, 1);
    }
    const r = this.ctx.renderer;
    if (r && 'toneMappingExposure' in r) r.toneMappingExposure = clamp(this._exposure ?? c.exposure, EXPOSURE.min, EXPOSURE.max);
    // ENV_U: rim, her glow, lamps
    ENV_U.uRim.value.copy(c.rim);
    const night = c.hero >= 0.99;
    ENV_U.uGlow.value.w = night ? GLOW.nightR : GLOW.dayR + (GLOW.nightR - GLOW.dayR) * clamp((c.hero - 0.4) / 0.6, 0, 1);
    ENV_U.uGlowCol.value.set(night ? GLOW.nightColor : GLOW.color).multiplyScalar(c.hero * GLOW.mul);
    ENV_U.uLampStr.value = c.lamps;
    HFOG.uFogLow.value.copy(c.fogLow);
    HFOG.uFogFalloff.value = c.fogFalloff || 0.6;
    // §4.1: from above all ground is "low": the ground-colour mix drops 0.6 → 0.45 with the focus-fog mode
    HFOG.uFogLowMix.value = 0.6 + ((CAMERA.iso?.fog?.lowMix ?? 0.6) - 0.6) * (this._focusMode ?? 0);
    if (this.sky) {
      const u = this.sky.uniforms;
      u.uHorizon.value.copy(c.fogColor); u.uTop.value.copy(c.skyTop); u.uGround.value.copy(c.hemiGround);
      u.uSunColor.value.copy(c.sunColor); u.uSunGlow.value = Math.min(1.5, c.sun * 0.6);
      this.sunDir(u.uSunDir.value);
    }
    if (typeof this.ctx.postfx?.setGrade === 'function') this.ctx.postfx.setGrade(c.grade);
    if (emit) this._emit();
  }

  /** The current level's iso lighting row for the active preset (`cam.light[preset]`, else `cam.light`), or null. */
  _isoLight() {
    const L = this.ctx.levels?.current?.cam?.light;
    if (!L) return null;
    return this._presetRow(L) ?? (L.hemiMul != null || L.sunAz != null || L.sunMul != null || L.envMul != null ? L : null);
  }

  /** The level's default iso yaw (never a zone hint: X7). */
  _levelYaw() {
    const lv = this.ctx.levels?.current;
    const y = lv?.camYaw ?? lv?.cam?.yaw;
    return Number.isFinite(y) ? y : (CAMERA.iso?.yaw ?? Math.PI);
  }

  /**
   * Unit vector toward the sun. Cutscenes / classic use the preset azimuth; the iso view (focus mode) uses the level
   * row's `sunAz` if authored, else `level yaw + 1.75` (night + 1.20), so shadows fall down-right across the screen.
   */
  sunDir(out = new THREE.Vector3()) {
    const el = this.cur.sunElev, iso = this._isoLight(), m = this.ctx.params?.cam === 'classic' ? 0 : (this._focusMode ?? 0);
    let az = this.cur.sunAz;
    if (m > 0) {
      const isoAz = iso && Number.isFinite(iso.sunAz) ? iso.sunAz : isoSunAz(this._levelYaw(), this.cur.hero >= 0.99);
      az = this.cur.sunAz + angDiff(isoAz, this.cur.sunAz) * m;
    }
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  }

  /** Per frame: sky follows the camera, sun + shadow box follow the footprint, lamps + glow, height fog patches, FUR_WIND. */
  render(alpha, frameDt) {
    const ctx = this.ctx, cam = ctx.camera;
    if (this.sky && cam) this.sky.update(cam, this._time);
    HFOG.uFogBase.value = ctx.levels?.current?.fogBase ?? 0;
    this._patchScene();
    // FUR_WIND: world-space vector for fur and capes (characters)
    const w = this.cur.wind * (0.7 + 0.6 * this.gust) * 0.22;
    FUR_WIND.value.set(this.windDir.x * w, 0, this.windDir.y * w);
    this._fogDt = frameDt;
    const pl = ctx.player?.object3d?.position ?? null;
    // her warm pool: the player writes it when it can (`writesGlow`); otherwise it rides her feet here
    if (pl && !ctx.player?.writesGlow) ENV_U.uGlow.value.set(pl.x, pl.y, pl.z, ENV_U.uGlow.value.w);
    // the 4 lamps nearest the iso focus, 4 Hz (flicker each frame is cheap: 4 vec4 writes)
    const f = ctx.cam?.focus?.isVector3 && (this._focusMode ?? 0) > 0.5 ? ctx.cam.focus : (pl ?? cam?.position ?? null);
    if ((this._lampT -= frameDt ?? 0.016) <= 0) { this._lampT = 1 / LAMPS.hz; this.lamps.sort(f); }
    this.lamps.write(ENV_U.uLamps.value, this._time);
    if (cam) ENV_U.uSunDirV.value.copy(this.sunDir(_w)).transformDirection(cam.matrixWorldInverse);
    if (!this.sunLight) return;
    const p = f ?? pl ?? cam?.position;
    if (!p) return;
    this._placeSun(p, cam);
  }

  /**
   * Stage 1 (AUTOCAM §9.2): fit the light-space box to the camera footprint (4 corners at the ground + raised by
   * casterH, pad, quantised, grow at once / shrink after `shadowShrink[1]` s at ≥ `shadowShrink[0]` m), centre snapped
   * to whole texels. No footprint → the fixed fallback box around `p`. Stage 2 hands the box to StaticShadow.
   */
  _placeSun(p, cam) {
    const L = this.sunLight, dir = this.sunDir(_v);
    _f.copy(dir).negate();
    _r.crossVectors(_up, _f); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
    _u.crossVectors(_f, _r).normalize();
    const iso = (this._focusMode ?? 0) > 0.5 && this.ctx.params?.cam !== 'classic';
    const F = CAMERA.iso?.foot ?? {};
    const corners = iso ? footprintCorners(this.ctx.cam?.footprint, cam, p.y, this._corners ??= [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]) : null;
    const fit = this._fit, dt = Math.min(0.1, this._fogDt ?? 1 / 60);
    if (corners) {
      const box = fitShadowBox(corners, _r, _u, F.casterH ?? 6, F.shadowPad ?? 1.5, this._box ??= {});
      const q = F.shadowQuant ?? 1, [shrinkM, shrinkT] = F.shadowShrink ?? [2, 1.0];
      const hx = Math.ceil(box.halfX / q) * q, hy = Math.ceil(box.halfY / q) * q;
      stepShadowFit(fit, hx, hy, shrinkM, shrinkT, dt);
      fit.cx = box.cx; fit.cy = box.cy;
    } else {
      fit.halfX = fit.halfY = SHADOW_HALF; fit.cx = p.dot(_r); fit.cy = p.dot(_u); fit.ok = false;
    }
    if (this.shadowStage >= 2 && this.staticShadow?.place(fit, _r, _u, _f, dir, p)) return;
    const sc = L.shadow.camera;
    if (sc.right !== fit.halfX || sc.top !== fit.halfY) { sc.left = -fit.halfX; sc.right = fit.halfX; sc.top = fit.halfY; sc.bottom = -fit.halfY; sc.updateProjectionMatrix(); }
    const ms = Math.max(1, L.shadow.mapSize.x);
    const tx = (fit.halfX * 2) / ms, ty = (fit.halfY * 2) / ms;
    const a = Math.round(fit.cx / tx) * tx, b = Math.round(fit.cy / ty) * ty, d = p.dot(_f);
    const tgt = L.target.position;
    tgt.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(_f, d);
    L.position.copy(tgt).addScaledVector(dir, 45);
    L.target.updateMatrixWorld();
  }

  /** Height-fog patch every new fogged material in the scene before its first compile (cheap WeakSet walk). */
  _patchScene() {
    const seen = this._patched;
    this.ctx.scene.traverse((o) => {
      const m = o.material;
      if (!m) return;
      if (Array.isArray(m)) { for (const x of m) if (!seen.has(x)) { seen.add(x); withHeightFog(x); } }
      else if (!seen.has(m)) { seen.add(m); withHeightFog(m); }
    });
  }

  /** Patch now (LevelManager calls this before pre-compiling a new level). */
  patchScene() { this._patchScene(); }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this._unpatch?.();
    this.staticShadow?.dispose();
    this.hemiLight?.removeFromParent(); this.sunLight?.target.removeFromParent(); this.sunLight?.removeFromParent();
    this.sunLight?.shadow.map?.dispose();
    this.sky?.dispose();
    if (this.ctx.scene.fog === this.fog) this.ctx.scene.fog = null;
  }
}
