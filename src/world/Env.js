// src/world/Env.js  (owner: world) — the single owner of scene fog, sky, sun, hemisphere light, wind and grade
// (GAME_DESIGN §12.2, §5.3; art.md §9, §12). ctx.env contract (§19.3):
//   set({fogDensity, fogColor, wind, grade, sun: {color, intensity, elev?}, hemi?, skyTop?}, dur)
//   contribute(key, {fogAdd | fogMul | fogSet});  clear(key);  preset(name, dur);  fogDensity (final, read-only)
//   + wind, windDir, gust, grade, presetName
// Final fog = clamp(((preset/story density) + Σ fogAdd) × Π fogMul, 0.005, 0.12); `fogSet` (Cacklejaw P3)
// overrides the base before the multipliers. Contributions ease in/out (~0.6 s). Emits env:changed; honours env:set.
// Also: gradient sky dome (horizon = fog colour), height fog on every fogged material, overcast PMREM
// environment rebuilt per preset, sun + shadow frustum following the player (texel-snapped), FUR_WIND.
import * as THREE from 'three';
import { E } from '../core/events.js';
import { clamp, damp } from '../core/math.js';
import { SkyDome } from './Sky.js';
import { HFOG, withHeightFog, fogFactor } from './HeightFog.js';
import { CAMERA } from '../core/config.js';
import { registerMaterialPatcher, FUR_WIND } from '../characters/index.js';

/**
 * §5.3 + §12.2 presets (art.md §12 values). `sunElev` = sun elevation (rad), `sunAz` = azimuth (yaw, rad),
 * `fogLow` = height-fog ground colour, `skyTop` → horizon (= fogColor), `env` = environment-map intensity.
 */
export const ENV_PRESETS = {
  meadow_day:     { fogColor: '#B7C0C3', fogDensity: 0.045, fogLow: '#9AA196', skyTop: '#C3CCD3', hemiSky: '#D5DDE3', hemiGround: '#4A5230', hemi: 1.1, sunColor: '#FFF2E0', sun: 1.4, sunElev: 0.95, sunAz: -0.7, grade: 'none', wind: 0.6, env: 0.45 },
  meadow_evening: { fogColor: '#D8CDB8', fogDensity: 0.020, fogLow: '#B5A88C', skyTop: '#E6D3B4', hemiSky: '#F0E6D6', hemiGround: '#5A4A36', hemi: 1.0, sunColor: '#FFD9A8', sun: 2.0, sunElev: 0.22, sunAz: -1.9, grade: 'none', wind: 0.5, env: 0.5 },
  meadow_night:   { fogColor: '#8C97A6', fogDensity: 0.050, fogLow: '#6F7A84', skyTop: '#6E7C92', hemiSky: '#9FB0C8', hemiGround: '#2A3024', hemi: 0.7, sunColor: '#BFD3FF', sun: 0.6, sunElev: 0.9, sunAz: 0.6, grade: 'night', wind: 0.4, env: 0.35, hero: 1 },
  forest_day:     { fogColor: '#8E9E8A', fogDensity: 0.060, fogLow: '#748466', skyTop: '#A9B7A9', hemiSky: '#B9C7B0', hemiGround: '#2C3A24', hemi: 1.1, sunColor: '#FFE7B8', sun: 1.8, sunElev: 0.95, sunAz: -0.5, grade: 'none', wind: 0.4, env: 0.45 },
  forest_night:   { fogColor: '#3E4A3E', fogDensity: 0.055, fogLow: '#34402F', skyTop: '#2E3A40', hemiSky: '#5A6A78', hemiGround: '#1A2218', hemi: 0.6, sunColor: '#BFD3FF', sun: 0.5, sunElev: 0.9, sunAz: 0.6, grade: 'night', wind: 0.3, env: 0.3, hero: 1 },
  town_occupied:  { fogColor: '#A9A898', fogDensity: 0.040, fogLow: '#948F7C', skyTop: '#E9D9C0', hemiSky: '#F0E6D6', hemiGround: '#5A4A36', hemi: 1.0, sunColor: '#FFD9A8', sun: 1.4, sunElev: 0.6, sunAz: -0.9, grade: 'none', wind: 0.4, env: 0.45 },
  hub_gold:       { fogColor: '#D8CDB8', fogDensity: 0.025, fogLow: '#C2B396', skyTop: '#E9D9C0', hemiSky: '#F0E6D6', hemiGround: '#5A4A36', hemi: 1.0, sunColor: '#FFD9A8', sun: 2.0, sunElev: 0.35, sunAz: -1.6, grade: 'none', wind: 0.4, env: 0.5 },
  hub_grey:       { fogColor: '#9AA196', fogDensity: 0.050, fogLow: '#868E80', skyTop: '#B8B4AC', hemiSky: '#C9C2BA', hemiGround: '#3A3A30', hemi: 1.0, sunColor: '#E8E6C8', sun: 1.0, sunElev: 0.8, sunAz: -0.7, grade: 'grey', wind: 0.5, env: 0.4 },
  ending_gold:    { fogColor: '#E9D9C0', fogDensity: 0.010, fogLow: '#D8C4A0', skyTop: '#F2E2C4', hemiSky: '#F0E6D6', hemiGround: '#5A4A36', hemi: 1.1, sunColor: '#FFD9A8', sun: 2.2, sunElev: 0.35, sunAz: -1.6, grade: 'gold', wind: 0.4, env: 0.55 },
  gate_dusk:      { fogColor: '#9AA196', fogDensity: 0.050, fogLow: '#7E8576', skyTop: '#B8AFA8', hemiSky: '#C9C2BA', hemiGround: '#3A3A30', hemi: 1.0, sunColor: '#FFB070', sun: 1.0, sunElev: 0.25, sunAz: -2.2, grade: 'none', wind: 0.8, env: 0.4 },
  bog:            { fogColor: '#8F9A84', fogDensity: 0.070, fogLow: '#6F7B62', skyTop: '#9DA595', hemiSky: '#AEB8A2', hemiGround: '#2A3324', hemi: 1.0, sunColor: '#E8E6C8', sun: 1.0, sunElev: 0.8, sunAz: -0.6, grade: 'none', wind: 0.3, env: 0.4, fogFalloff: 1.2 },
  keep_storm:     { fogColor: '#4B3F42', fogDensity: 0.050, fogLow: '#5A3A30', skyTop: '#2E2A33', hemiSky: '#6B5E66', hemiGround: '#1E1A1A', hemi: 1.7, sunColor: '#C9B8C0', sun: 0.0, sunElev: 0.8, sunAz: 0.4, grade: 'none', wind: 1.0, env: 0.45 },
  keep_cellar:    { fogColor: '#4B3F42', fogDensity: 0.030, fogLow: '#3E3236', skyTop: '#2E2A33', hemiSky: '#6B5E66', hemiGround: '#1E1A1A', hemi: 1.4, sunColor: '#C9B8C0', sun: 0.0, sunElev: 0.8, sunAz: 0.4, grade: 'none', wind: 0.0, env: 0.3 },
  sky_night:      { fogColor: '#3E4A63', fogDensity: 0.020, fogLow: '#3E4A63', skyTop: '#1E2638', hemiSky: '#7F8FB8', hemiGround: '#1A1E2A', hemi: 0.7, sunColor: '#BFD3FF', sun: 0.7, sunElev: 0.8, sunAz: 0.5, grade: 'night', wind: 1.2, env: 0.35, hero: 1 },
  sky_sunrise:    { fogColor: '#E9D9C0', fogDensity: 0.006, fogLow: '#E9D9C0', skyTop: '#C9D6E2', hemiSky: '#F0E6D6', hemiGround: '#5A4A36', hemi: 1.1, sunColor: '#FFD9A8', sun: 2.2, sunElev: 0.25, sunAz: -1.6, grade: 'gold', wind: 1.0, env: 0.55 },
};

const NUM = ['fogDensity', 'hemi', 'sun', 'sunElev', 'sunAz', 'wind', 'env', 'fogFalloff', 'hero'];
const COL = ['fogColor', 'fogLow', 'skyTop', 'hemiSky', 'hemiGround', 'sunColor'];
const FOG_MIN = 0.005, FOG_MAX = 0.12;
const SHADOW_HALF = 20;
/** signed smallest angle a − b */
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/**
 * Hero key light (art.md mood rule: the hero carries the warm saturation in every biome). At night the cool hemi /
 * moon and the night grade turn her ginger fur chestnut-grey, so a small warm point light rides between her and the
 * camera, scaled by the preset's `hero` (0 by day, 1 at night). Short range: it lights her (and the cast next to
 * her) and leaves only a faint warm pool on the ground. Always in the scene (intensity 0 by day) so the light count,
 * and with it every compiled shader program, never changes.
 */
export const HERO_LIGHT = Object.freeze({ color: '#FFC890', intensity: 4.4, distance: 4.0, decay: 1.6, up: 1.5, toCam: 1.5, side: 0.4 });

const _c = new THREE.Color();
const _v = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

/** Preset row → tweenable state (colours as THREE.Color). Pure. */
export function toState(p) {
  const s = { grade: p.grade ?? 'none' };
  for (const k of NUM) s[k] = p[k] ?? (k === 'fogFalloff' ? 0.6 : k === 'env' ? 0.45 : k === 'sunAz' ? -0.7 : 0);
  for (const k of COL) s[k] = new THREE.Color(p[k] ?? (k === 'fogLow' ? p.fogColor : k === 'skyTop' ? p.fogColor : '#FFFFFF'));
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

/** Interpolate two states into `out` (smoothstep `e` in 0..1). */
function lerpState(out, a, b, e) {
  for (const k of NUM) out[k] = a[k] + (b[k] - a[k]) * e;
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
    this.envMap = null; this._pmrem = null; this._envScene = null; this._envDirty = true;
  }

  /** Final fog density (read-only). */
  get fogDensity() { return this._final; }

  /**
   * CONTROLS_SPEC §4.1 focus fog (camera calls this every render): `focus` = the iso focus, `mode` 0 = lens fog
   * (cutscenes, presets, Meme Cam, classic) … 1 = focus fog, `combat` / `boss` widen the clear radius (5 → 7 m, eased
   * CAMERA.iso.fog.ease s), Golden Hour × goldenClearMul, `env.contribute(key, { clear })` overrides (Cacklejaw P3 3.5).
   * Per-level `level.cam.fog` ({ clear, clearCombat, topMul }) overrides CAMERA.iso.fog.
   */
  setFocusFog({ focus, mode = 1, clear, combat = false } = {}) {
    const F = CAMERA.iso?.fog;
    if (!F) return;
    // `level.cam.fog` may carry per-preset rows (forest_night): { clear, clearCombat, topMul, <preset>: {...} }
    const fr = this.ctx.levels?.current?.cam?.fog;
    const lv = fr?.[this.presetName] ?? fr ?? {};
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
    const sh = this.sunLight.shadow, size = this.ctx.quality?.shadowMap ?? 2048;
    sh.mapSize.set(size, size);
    sh.bias = -0.0005; sh.normalBias = 0.03; sh.radius = 3;
    Object.assign(sh.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 90 });
    sh.camera.updateProjectionMatrix();
    this.sunLight.castShadow = this.ctx.quality?.shadows !== false;
    this.heroLight = new THREE.PointLight(HERO_LIGHT.color, 0, HERO_LIGHT.distance, HERO_LIGHT.decay);
    this.heroLight.name = 'env:hero';
    this.heroLight.castShadow = false;
    scene.add(this.hemiLight, this.sunLight, this.sunLight.target, this.heroLight);
    this.sky = new SkyDome();
    scene.add(this.sky.mesh);
    this._unpatch = registerMaterialPatcher((m) => withHeightFog(m));
    this._offs.push(
      bus.on(E.ENV_SET, (p) => { if (p?.preset) this.preset(p.preset, p.dur ?? 0); else this.set(p ?? {}, p?.dur ?? 0); }),
      bus.on(E.QUALITY, ({ preset }) => {
        if (!this.sunLight) return;
        this.sunLight.castShadow = !!preset?.shadows;
        const s = preset?.shadowMap ?? 2048;
        if (this.sunLight.shadow.mapSize.x !== s) { this.sunLight.shadow.mapSize.set(s, s); this.sunLight.shadow.map?.dispose(); this.sunLight.shadow.map = null; }
      }),
    );
    this._apply(true);
  }

  /** Tween to a named preset over `dur` seconds (sim time). Unknown names warn and are ignored. */
  preset(name, dur = 0) {
    const p = ENV_PRESETS[name];
    if (!p) { console.warn(`[env] unknown preset ${name}`); return; }
    this.presetName = name;
    this._tweenTo(toState(p), dur);
  }

  /** Tween fields: { fogDensity, fogColor, fogLow, wind, grade, hemi, skyTop, sun: { color, intensity, elev, az } }. */
  set(fields = {}, dur = 0) {
    const to = cloneState(this.to ?? this.cur);
    if (fields.fogDensity != null) to.fogDensity = fields.fogDensity;
    if (fields.fogColor != null) { to.fogColor.set(fields.fogColor); if (fields.fogLow == null) to.fogLow.copy(to.fogColor).multiplyScalar(0.88); }
    if (fields.fogLow != null) to.fogLow.set(fields.fogLow);
    if (fields.skyTop != null) to.skyTop.set(fields.skyTop);
    if (fields.wind != null) to.wind = fields.wind;
    if (fields.grade != null) to.grade = fields.grade;
    if (fields.hemi != null) to.hemi = fields.hemi;
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
    if (!(dur > 0)) { this.cur = to; this.from = this.to = null; this._envDirty = true; this._recalc(); this._final = this._target; this._apply(true); return; }
    this.from = cloneState(this.cur); this.to = to; this.t = 0; this.dur = dur;
    this._envDirty = true;
    this._emit();
  }

  _recalc() { this._target = finalFog(this.cur.fogDensity, this.contrib.values()); }

  _emit() { this.ctx.bus.emit(E.ENV_CHANGED, { fogDensity: this._target, grade: (this.to ?? this.cur).grade, wind: (this.to ?? this.cur).wind }); }

  update(dt) {
    this._time += dt;
    if (this.to) {
      this.t += dt;
      const u = Math.min(1, this.t / this.dur), e = u * u * (3 - 2 * u);
      lerpState(this.cur, this.from, this.to, e);
      if (u >= 1) { this.cur = this.to; this.from = this.to = null; this._envDirty = true; }
      this._recalc();
      this._final = this._target;
      if ((this._emitT += dt) >= 0.25 || !this.to) { this._emitT = 0; this._emit(); }
    } else {
      this._recalc();
      this._final = damp(this._final, this._target, 5, dt);
      if (Math.abs(this._final - this._target) < 1e-5) this._final = this._target;
    }
    // slow gust envelope (two incommensurate sines), shared by grass / capes / audio
    const t = this._time;
    this.gust = clamp(0.5 + 0.35 * Math.sin(t * 0.37) * Math.sin(t * 0.23 + 1.3) + 0.15 * Math.sin(t * 1.1), 0, 1);
    this._apply(false);
  }

  _apply(emit) {
    const c = this.cur;
    if (this.fog) { this.fog.density = this._final; this.fog.color.copy(c.fogColor); }
    const bg = this.ctx.scene.background;
    if (bg?.isColor) bg.copy(c.fogColor); else this.ctx.scene.background = c.fogColor.clone();
    // §4.2 per-level lighting from above (`level.cam.light`: { hemiMul, sunAz } per preset, or for every preset),
    // mixed in with the focus-fog mode so cutscenes and Meme Cam keep the authored eye-level look
    // `hemiMul` / `sunMul` / `envMul` scale the hemisphere, the sun (the moon at night) and the environment light;
    // `hemiSky` / `hemiGround` blend the fill toward lifted colours (at night the lens sees mostly ground, which the
    // eye-level presets leave near-black outside the lantern pools)
    const iso = this._isoLight(), mix = this._focusMode ?? 0;
    const isoMul = (k) => 1 + ((iso?.[k] ?? 1) - 1) * mix;
    if (this.hemiLight) {
      this.hemiLight.color.copy(c.hemiSky); this.hemiLight.groundColor.copy(c.hemiGround);
      if (iso?.hemiSky && mix > 0) this.hemiLight.color.lerp(_c.set(iso.hemiSky), mix);
      if (iso?.hemiGround && mix > 0) this.hemiLight.groundColor.lerp(_c.set(iso.hemiGround), mix);
      this.hemiLight.intensity = c.hemi * isoMul('hemiMul');
    }
    if (this.sunLight) { const sun = c.sun * isoMul('sunMul'); this.sunLight.color.copy(c.sunColor); this.sunLight.intensity = sun; this.sunLight.visible = sun > 0.001; }
    if (this.heroLight) this.heroLight.intensity = HERO_LIGHT.intensity * (c.hero || 0);
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
    if (this.ctx.scene && this.envMap) this.ctx.scene.environmentIntensity = c.env * isoMul('envMul');
    if (typeof this.ctx.postfx?.setGrade === 'function') this.ctx.postfx.setGrade(c.grade);
    if (emit) this._emit();
  }

  /** The current level's iso lighting row for the active preset (`cam.light[preset]`, else `cam.light`), or null. */
  _isoLight() {
    const L = this.ctx.levels?.current?.cam?.light;
    if (!L) return null;
    return L[this.presetName] ?? (L.hemiMul != null || L.sunAz != null || L.sunMul != null || L.envMul != null ? L : null);
  }

  /** Unit vector toward the sun (from the preset elevation/azimuth; the iso row may swing the azimuth, §4.2). */
  sunDir(out = new THREE.Vector3()) {
    const el = this.cur.sunElev, iso = this._isoLight(), m = this._focusMode ?? 0;
    const az = iso && Number.isFinite(iso.sunAz) ? this.cur.sunAz + angDiff(iso.sunAz, this.cur.sunAz) * m : this.cur.sunAz;
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).normalize();
  }

  /** Rebuild the overcast PMREM environment from the current colours (art.md §4.1). */
  _rebuildEnvMap() {
    const r = this.ctx.renderer;
    if (!r || typeof r.getContext !== 'function') return;
    try {
      if (!this._pmrem) this._pmrem = new THREE.PMREMGenerator(r);
      if (!this._envScene) {
        this._envScene = new THREE.Scene();
        this._envMat = new THREE.ShaderMaterial({
          side: THREE.BackSide, depthWrite: false, fog: false,
          uniforms: { uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGround: { value: new THREE.Color() }, uSun: { value: new THREE.Color() }, uDir: { value: new THREE.Vector3() } },
          vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `uniform vec3 uTop, uHor, uGround, uSun; uniform vec3 uDir; varying vec3 vD;
            void main(){ vec3 d = normalize(vD); float h = d.y;
              vec3 c = h > 0.0 ? mix(uHor, uTop, smoothstep(0.0, 0.6, h)) : mix(uHor, uGround, smoothstep(0.0, -0.35, h));
              c += uSun * pow(max(dot(d, normalize(uDir)), 0.0), 6.0) * 0.6;
              gl_FragColor = vec4(c, 1.0); }`,
        });
        this._envMat.userData.noHeightFog = true;
        this._envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), this._envMat));
      }
      const c = this.cur, u = this._envMat.uniforms;
      u.uTop.value.copy(c.skyTop).multiplyScalar(1.1); u.uHor.value.copy(c.fogColor); u.uGround.value.copy(c.hemiGround).lerp(c.fogColor, 0.25);
      u.uSun.value.copy(c.sunColor).multiplyScalar(Math.min(1.5, c.sun * 0.5)); this.sunDir(u.uDir.value);
      const rt = this._pmrem.fromScene(this._envScene, 0.04);
      const old = this.envMap;
      this.envMap = rt.texture;
      this._envRT?.dispose?.();
      this._envRT = rt;
      this.ctx.scene.environment = this.envMap;
      this.ctx.scene.environmentIntensity = c.env * (1 + ((this._isoLight()?.envMul ?? 1) - 1) * (this._focusMode ?? 0));
      if (old && old !== this.envMap) old.dispose?.();
    } catch (e) {
      console.warn('[env] PMREM environment failed', e);
    }
    this._envDirty = false;
  }

  /** Per frame: sky follows the camera, sun + shadow frustum follow the player, height fog patches, FUR_WIND. */
  render(alpha, frameDt) {
    const ctx = this.ctx, cam = ctx.camera;
    if (this._envDirty) this._rebuildEnvMap();
    if (this.sky && cam) this.sky.update(cam, this._time);
    HFOG.uFogBase.value = ctx.levels?.current?.fogBase ?? 0;
    this._patchScene();
    // FUR_WIND: world-space vector for fur and capes (characters)
    const w = this.cur.wind * (0.7 + 0.6 * this.gust) * 0.22;
    FUR_WIND.value.set(this.windDir.x * w, 0, this.windDir.y * w);
    // sun follows the player; the shadow frustum centre is snapped to shadow-map texels (no shimmer)
    this._fogDt = frameDt;
    const pl = ctx.player?.object3d?.position ?? cam?.position;
    if (!pl || !this.sunLight) return;
    this._placeHero(pl, cam);
    // §2.8: the shadow frustum is centred on the iso focus (her, in classic / cutscenes)
    const f = ctx.cam?.focus;
    const p = f?.isVector3 && (this._focusMode ?? 0) > 0.5 ? f : pl;
    const dir = this.sunDir(_v);
    // §2.8: half-size 16 m around the iso focus (20 m in boss fights); the classic / cutscene frustum stays 20 m
    const isoOn = (this._focusMode ?? 0) > 0.5;
    const half = isoOn ? (ctx.enemies?.boss?.alive ? (CAMERA.iso?.shadowHalfBoss ?? SHADOW_HALF) : (CAMERA.iso?.shadowHalf ?? SHADOW_HALF)) : SHADOW_HALF;
    const sc = this.sunLight.shadow.camera;
    if (sc.right !== half) { sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    const texel = (half * 2) / this.sunLight.shadow.mapSize.x;
    _f.copy(dir).negate();
    _r.crossVectors(_up, _f); if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0); _r.normalize();
    _u.crossVectors(_f, _r).normalize();
    const a = Math.round(p.dot(_r) / texel) * texel, b = Math.round(p.dot(_u) / texel) * texel, d = p.dot(_f);
    const tgt = this.sunLight.target.position;
    tgt.copy(_r).multiplyScalar(a).addScaledVector(_u, b).addScaledVector(_f, d);
    this.sunLight.position.copy(tgt).addScaledVector(dir, 45);
    this.sunLight.target.updateMatrixWorld();
  }

  /** The hero key light: above her, a little toward the camera and to its right (a soft three-quarter key). */
  _placeHero(p, cam) {
    const L = this.heroLight;
    if (!L) return;
    if (!(L.intensity > 0)) return;            // stays visible at 0: an invisible light would change the light count
    let dx = 0, dz = 1;
    if (cam) { dx = cam.position.x - p.x; dz = cam.position.z - p.z; const d = Math.hypot(dx, dz); if (d > 1e-3) { dx /= d; dz /= d; } else { dx = 0; dz = 1; } }
    const H = HERO_LIGHT;
    L.position.set(p.x + dx * H.toCam - dz * H.side, p.y + H.up, p.z + dz * H.toCam + dx * H.side);
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
    this.hemiLight?.removeFromParent(); this.sunLight?.target.removeFromParent(); this.sunLight?.removeFromParent(); this.heroLight?.removeFromParent();
    this.sunLight?.shadow.map?.dispose();
    this.sky?.dispose();
    this._envRT?.dispose?.(); this._pmrem?.dispose();
    this._envMat?.dispose();
    if (this.ctx.scene.environment === this.envMap) this.ctx.scene.environment = null;
    if (this.ctx.scene.fog === this.fog) this.ctx.scene.fog = null;
  }
}
