// src/combat/Projectiles.js  (owner: combat) — pooled projectiles with parry reflect (§19.2, §19.4, §7.3).
//
// One manager owned by Combat (`ctx.combat.projectiles`). A projectile is a plain pooled object that quacks like an
// attacker for `Combat.applyHit` (`isProjectile`, `pos`, `vel`, `facing`, `faction`, `owner`, `onParried`), so the
// target's `resolveIncoming` decides parry / block / immune exactly as for melee:
//   'parry'  → reflected: velocity flipped ×PLAYER.guard.reflectSpeedMul (homing on the shooter within a cone),
//              owner = the parrying actor, dmg = def.reflectDmg (25), gold look, `combat:reflect` emitted;
//   'block'  → the projectile breaks on the guard;   'immune' → passes through (tumble i-frames);
//   'hit'    → damage; the projectile dies unless it pierces (holyWave, gleam).
// Shapes: round projectiles (bolts, orbs, globs) test a swept segment vs the target cylinder and stop on props and
// architecture (physics.sphereCast over the step, so nothing behind a wall is touched); waves (holyWave, gleam) are
// crescents `width` wide that ride the ground, pierce, and (holyWave) eat enemy projectiles. A reflected shot keeps
// curving toward its shooter (≤ COMBAT.reflectHomingRate) while the shooter stays inside COMBAT.reflectAimCone.
// The Wave Reach upgrade (15 m) is applied here, so it holds whoever spawns the holyWave (combat or the player).
// Visuals (pooled per kind, one draw call per part): `bolt` (crossbow bolt + light trail), `orb` (glowing core +
// halo + trail), `glob` (web glob), `wave` (golden crescent, art.md holy palette), `gleam` (small white-gold crescent).
// No allocations per step: pooled objects, module temporaries, a reused query array.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { E } from '../core/events.js';
import { PLAYER, ATTACKS, ECONOMY } from '../core/config.js';
import { clamp, clamp01 } from '../core/math.js';
import { isHostile } from '../core/ActorRegistry.js';
import { COMBAT, PROJECTILE_KIND, AUTO_PROJECTILES, reflectedDef } from './attacks.js';

// art.md §6.2 palette tokens used here
const PAL = {
  holyCore: '#FFF6DA', holy: '#FFE3A3', holyEdge: '#E8A95A', sparkle: '#FFF1C4', sparkleWarm: '#FFD57A',
  wood: '#8A6A45', iron: '#8E949E', fletch: '#E2D6C0', web: '#ECE8DC', webShade: '#BDB6A6',
  orbCore: '#B8F5E8', orbGlow: '#5FC8C8', aim: '#FFFFFF',
};

/**
 * HDR intensities (additive, untonemapped; bloom threshold is 0.85, so only the hot cores bloom and a wave stays a
 * readable crescent instead of a white blob — Holy raises bloom to 1.2 while it plays).
 */
const VIS = Object.freeze({
  wave: 1.4, gleam: 1.35, trail: 0.85, trailGold: 1.7, trailGlob: 0.45, boltGold: 1.2,
  orbCore: 1.1, halo: 1.15, haloGold: 1.4, haloSize: 3.2,
});

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _ray = new THREE.Ray();
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** physics.sphereCast options: props and architecture stop round projectiles; the ground is tested by height. */
const WALL_CAST = Object.freeze({ terrain: false, mesh: true, statics: true });

let nextProjectileId = 1;

// ------------------------------------------------------------------ shaders
const TRAIL_VS = /* glsl */`
uniform float uWidth; uniform float uLen; varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 axis = mat3(modelMatrix) * vec3(0.0, 0.0, 1.0);
  float al = length(axis); axis = al > 1e-5 ? axis / al : vec3(0.0, 0.0, 1.0);
  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz - axis * position.y * uLen;
  vec3 side = cross(axis, cameraPosition - base);
  float sl = length(side); side = sl > 1e-5 ? side / sl : vec3(1.0, 0.0, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(base + side * position.x * uWidth, 1.0);
}`;
const TRAIL_FS = /* glsl */`
uniform vec3 uColor; uniform float uI; varying vec2 vUv;
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float along = clamp(vUv.y, 0.0, 1.0);
  float a = exp(-x * x * 5.0) * (1.0 - along) * (1.0 - along) * uI;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const HALO_VS = /* glsl */`
uniform float uSize; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}`;
const HALO_FS = /* glsl */`
uniform vec3 uColor; uniform float uI; varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = pow(max(1.0 - d, 0.0), 2.2) * uI;
  gl_FragColor = vec4(uColor * a, 1.0);
}`;
const CRESCENT_VS = /* glsl */`
attribute float aW; varying vec2 vUv; varying float vW;
void main() { vUv = uv; vW = aW; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// across the blade: a hot thin core line near the leading (upper/outer) edge, a soft gold body, dim rims;
// along it: full in the middle, fading into the pointed tips.
const CRESCENT_FS = /* glsl */`
uniform vec3 uCore; uniform vec3 uEdge; uniform float uI; varying vec2 vUv; varying float vW;
void main() {
  float v = (vUv.y - 0.62) * 2.6;
  float x = abs(vUv.x - 0.5) * 2.0;
  float body = 1.0 - smoothstep(0.35, 1.0, abs(vUv.y - 0.5) * 2.0);
  float core = exp(-v * v * 3.0);
  float tips = 1.0 - smoothstep(0.55, 1.0, x);
  vec3 col = mix(uEdge, uCore, core);
  gl_FragColor = vec4(col * (0.32 * body + core) * tips * vW * uI, 1.0);
}`;

/** Additive, depth-tested, not depth-writing material (bloom picks the HDR values up). */
function glowMaterial(vertexShader, fragmentShader, uniforms, side = THREE.FrontSide) {
  return new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side, toneMapped: false });
}

/** Paint a geometry with a flat vertex colour (for merged, single-draw-call props). */
function painted(geo, hex) {
  const c = new THREE.Color(hex), n = geo.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Crossbow bolt pointing +Z (tip at z ≈ +0.23), one merged geometry with vertex colours. */
function boltGeometry() {
  const shaft = painted(new THREE.CylinderGeometry(0.014, 0.014, 0.36, 6).rotateX(Math.PI / 2), PAL.wood);
  const head = painted(new THREE.ConeGeometry(0.032, 0.08, 6).rotateX(Math.PI / 2).translate(0, 0, 0.22), PAL.iron);
  const f1 = painted(new THREE.BoxGeometry(0.004, 0.06, 0.09).translate(0, 0, -0.15), PAL.fletch);
  const f2 = painted(new THREE.BoxGeometry(0.06, 0.004, 0.09).translate(0, 0, -0.15), PAL.fletch);
  const g = mergeGeometries([shaft, head, f1, f2]);
  for (const p of [shaft, head, f1, f2]) p.dispose();
  return g;
}

/**
 * "Sword beam" crescent of unit chord (x ∈ [-0.5, 0.5]), apex at z = 0, tips trailing back (−Z) and drooping, so
 * from behind it reads as a moon-shaped arch: a thick middle (y ≈ −0.1 … 0.5) tapering to points at y ≈ −0.3.
 * Two dimmer echo layers trail behind it (motion smear). UV.x runs tip → tip, UV.y bottom → top across the blade;
 * `aW` = layer weight.
 */
function crescentGeometry(seg = 32, span = 2.2) {
  const R = 0.5 / Math.sin(span / 2);
  const pos = [], uv = [], w = [], idx = [];
  const layers = [{ z: 0, s: 1, w: 1 }, { z: -0.13, s: 0.88, w: 0.42 }, { z: -0.25, s: 0.74, w: 0.18 }];
  for (const L of layers) {
    const base = pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg, s = u * 2 - 1, a = (s * span) / 2, arch = Math.max(0, 1 - s * s);
      const x = Math.sin(a) * R * L.s, z = (Math.cos(a) - 1) * R * L.s + L.z;
      const mid = (0.5 * arch - 0.3) * L.s, half = 0.3 * Math.pow(arch, 0.65) * L.s;
      pos.push(x, mid - half, z, x, mid + half, z);
      uv.push(u, 0, u, 1);
      w.push(L.w, L.w);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aW', new THREE.Float32BufferAttribute(w, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Projectile look for a def (PROJECTILE_KIND, else wave if it has a width, else orb). */
export function projectileKind(def) {
  return PROJECTILE_KIND[def?.id] ?? (def?.width ? 'wave' : 'orb');
}

export class Projectiles {
  /** @param {import('./Combat.js').Combat} combat */
  constructor(combat) {
    this.combat = combat;
    this.ctx = combat.ctx;
    /** live projectiles (read-only for other systems) */
    this.list = [];
    this._free = [];
    /** kind → free visuals */
    this._visualPool = new Map();
    this._allVisuals = [];
    this._res = null;
    this._query = [];
  }

  // ---------------------------------------------------------------- spawn
  /**
   * Fire a projectile (§19.3 `combat.spawnProjectile`). `def` is an attack whose `projectile` holds
   * `{ speed, range, r }` (rat_bolt, bone_bolt, spider_web) or a projectile attack itself (holyWave / gleam:
   * `{ speed, range, width, height }`). `dir` need not be normalised; a non-zero y aims up/down (waves stay flat).
   * @param {any} def @param {any} owner @param {THREE.Vector3} pos @param {THREE.Vector3} dir
   * @param {{ kind?: string, speed?: number, range?: number, r?: number, vel?: THREE.Vector3, gravity?: number,
   *   pierce?: boolean, faction?: string, dmgMul?: number, crit?: number, dmg?: number,
   *   onHit?: (p:any, target:any, result:string) => void, onEnd?: (p:any, reason:string) => void }} [opts]
   */
  spawn(def, owner, pos, dir, opts = {}) {
    if (!def) throw new Error('[combat] spawnProjectile: missing def');
    if (AUTO_PROJECTILES.has(def.id) && owner) {            // the same wave fired twice in one swing (combat + caller)
      for (const q of this.list) if (q.alive && q.baseDef === def && q.source === owner && q.age < COMBAT.projectileDedupe) return q;
    }
    if (this.list.length >= COMBAT.maxProjectiles) this._removeAt(0, 'recycled');
    const pd = def.projectile && typeof def.projectile === 'object' ? def.projectile : def;
    const p = this._free.pop() ?? this._create();
    const speed = Math.max(0.1, opts.speed ?? pd.speed ?? COMBAT.projectileSpeed);
    const range = opts.range ?? this._waveReach(def, owner) ?? pd.range ?? COMBAT.projectileRange;
    const width = pd.width ?? 0;
    p.id = nextProjectileId++;
    p.def = def; p.baseDef = def; p.owner = owner ?? null; p.source = owner ?? null;
    p.faction = opts.faction ?? owner?.faction ?? 'enemy';
    p.kind = opts.kind ?? projectileKind(def);
    p.wave = width > 0;
    p.halfW = width / 2;
    p.halfH = p.wave ? (pd.height ?? width * COMBAT.waveHeightOfWidth) / 2 : 0;
    p.r = opts.r ?? pd.r ?? (p.wave ? COMBAT.waveThickness : COMBAT.projectileRadius);
    p.radius = p.wave ? p.halfW : p.r;
    p.height = p.wave ? p.halfH * 2 : p.r * 2;
    p.hover = p.wave ? Math.max(p.halfH, COMBAT.waveHover) : 0;
    p.pierce = opts.pierce ?? !!(pd.pierce || def.pierce);
    p.eats = !!def.eatsProjectiles;
    p.gravity = opts.gravity ?? 0;
    p.dmgMul = opts.dmgMul ?? this.combat.dealtMul(owner);
    p.crit = opts.crit ?? 1;
    p.dmg = opts.dmg;
    p.onHit = opts.onHit ?? null; p.onEnd = opts.onEnd ?? null;
    p.reflected = false; p.homing = null; p.alive = true; p.endReason = null; p.age = 0;
    p.hitSet.clear();
    if (owner?.id != null) p.hitSet.add(owner.id);
    p.pos.copy(pos); p.prevPos.copy(pos);
    if (opts.vel) p.vel.copy(opts.vel);
    else {
      p.vel.copy(dir);
      if (p.wave) p.vel.y = 0;
      if (p.vel.lengthSq() < 1e-8) p.vel.set(Math.sin(owner?.facing ?? 0), 0, Math.cos(owner?.facing ?? 0));
      p.vel.normalize().multiplyScalar(speed);
    }
    p.speed = p.vel.length();
    p.maxLife = p.life = range / Math.max(0.1, speed);
    p.facing = Math.atan2(p.vel.x, p.vel.z);
    if (p.wave) p.pos.y = p.prevPos.y = this._ground(p.pos.x, p.pos.z) + p.hover;
    this._attachVisual(p);
    this.list.push(p);
    this.combat.stats.projectiles++;
    return p;
  }

  /**
   * §19.4 reflect: flip ×reflectSpeedMul, owner = `by`, dmg = reflectDmg. When the shooter stands within
   * `COMBAT.reflectAimCone` of the flipped path the shot is aimed at its chest and keeps homing on it.
   */
  reflect(p, by) {
    if (!p?.alive) return p;
    const speed = Math.max(p.vel.length(), p.speed) * PLAYER.guard.reflectSpeedMul;
    _v.copy(p.vel).negate();
    if (_v.lengthSq() < 1e-8) _v.set(Math.sin(by?.facing ?? 0), 0, Math.cos(by?.facing ?? 0));
    _v.normalize();
    const src = p.source;
    p.homing = null;
    if (src && src !== by && src.alive !== false && src.pos) {
      _w.set(src.pos.x - p.pos.x, src.pos.y + (src.height ?? 1) * 0.5 - p.pos.y, src.pos.z - p.pos.z);
      const flat = Math.hypot(_w.x, _w.z), vflat = Math.hypot(_v.x, _v.z);
      if (flat > 1e-4 && vflat > 1e-4) {
        const cos = (_w.x * _v.x + _w.z * _v.z) / (flat * vflat);
        if (cos >= Math.cos(COMBAT.reflectAimCone)) { _v.copy(_w).normalize(); p.homing = src; }
      }
    }
    p.vel.copy(_v).multiplyScalar(speed);
    p.speed = speed;
    p.gravity = 0;
    p.owner = by ?? null;
    p.faction = by?.faction ?? 'player';
    p.def = reflectedDef(p.baseDef);
    p.reflected = true;
    p.dmgMul = this.combat.dealtMul(by);
    p.hitSet.clear();
    if (by?.id != null) p.hitSet.add(by.id);
    p.life = Math.max(p.life, p.maxLife);
    p.facing = Math.atan2(p.vel.x, p.vel.z);
    this._styleVisual(p);
    this.combat.stats.reflects++;
    this.ctx.bus.emit(E.REFLECT, { projectile: p, by });
    return p;
  }

  /** End a projectile now (`reason`: 'hit' | 'blocked' | 'expired' | 'ground' | 'wall' | 'bounds' | 'eaten' | ...). */
  kill(p, reason = 'killed', silent = false) {
    if (!p?.alive) return;
    p.alive = false; p.endReason = reason;
    if (!silent) {
      if (reason === 'blocked' || reason === 'eaten' || reason === 'wall' || reason === 'ground') {
        this.ctx.bus.emit(E.BURST, { kind: reason === 'eaten' ? 'sparkle' : reason === 'blocked' ? 'spark' : 'dust', position: p.pos.clone(), count: 6 });
      }
      try { p.onEnd?.(p, reason); } catch (e) { console.error('[combat] projectile onEnd threw', e); }
    }
  }

  // ---------------------------------------------------------------- step
  update(dt) {
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.alive) continue;
      p.prevPos.copy(p.pos);
      this._step(p, dt);
    }
    for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].eats) this._eat(list[i], dt);
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.alive) list[w++] = p; else this._recycle(p);
    }
    list.length = w;
  }

  _step(p, dt) {
    p.age += dt; p.life -= dt;
    if (p.homing) this._home(p, dt);
    if (p.gravity) p.vel.y -= p.gravity * dt;
    p.pos.addScaledVector(p.vel, dt);
    const ground = this._ground(p.pos.x, p.pos.z);
    if (p.wave) p.pos.y = ground + p.hover;
    if (p.vel.x || p.vel.z) p.facing = Math.atan2(p.vel.x, p.vel.z);
    // walls first: a hit truncates this step's segment, so nobody behind the wall is touched
    const wall = !p.wave && this._hitsStatic(p);
    this._hitActors(p, dt);
    if (!p.alive) return;
    if (wall) return this.kill(p, 'wall');
    if (p.life <= 0) return this.kill(p, 'expired');
    if (!p.wave && p.pos.y < ground) return this.kill(p, 'ground');
    const b = this.ctx.physics?.bounds;
    if (b?.min && b?.max && (p.pos.x < b.min.x - 2 || p.pos.x > b.max.x + 2 || p.pos.z < b.min.y - 2 || p.pos.z > b.max.y + 2)) this.kill(p, 'bounds');
  }

  /** Reflected shots curve toward their shooter (≤ COMBAT.reflectHomingRate) while it stays ahead of them. */
  _home(p, dt) {
    const t = p.homing;
    if (!t || t.alive === false || !t.pos) { p.homing = null; return; }
    _w.set(t.pos.x - p.pos.x, t.pos.y + (t.height ?? 1) * 0.5 - p.pos.y, t.pos.z - p.pos.z);
    const d = _w.length(), sp = p.vel.length();
    if (d < 1e-4 || sp < 1e-4) return;
    _w.multiplyScalar(1 / d);
    _v.copy(p.vel).multiplyScalar(1 / sp);
    const ang = Math.acos(clamp(_v.dot(_w), -1, 1));
    if (ang > COMBAT.reflectAimCone) { p.homing = null; return; }      // it dodged past: fly straight on
    const turn = COMBAT.reflectHomingRate * dt;
    if (ang <= turn) _v.copy(_w); else _v.lerp(_w, turn / ang).normalize();
    p.vel.copy(_v).multiplyScalar(sp);
  }

  /** holyWave range from the Wave Reach upgrade (§13.3: 15 m once she has Shard 2), whoever spawns the wave. */
  _waveReach(def, owner) {
    if (def?.id !== 'holyWave' || owner?.faction !== 'player') return undefined;
    const st = this.ctx.state, reach = ECONOMY.shops.waveReach;
    const shards = owner.shards ?? st?.shards ?? 0;
    return st?.upgrades?.waveReach && shards >= reach.needShards ? reach.range : undefined;
  }

  _hitActors(p, dt) {
    const actors = this.ctx.actors;
    if (!actors) return;
    const step = p.speed * dt;
    const reach = (p.wave ? Math.hypot(p.halfW, p.r + step) : p.r + step) + 1;
    const list = actors.queryRadius(p.pos, reach, this.combat.targetFilter(p.faction), this._query);
    for (let j = 0; j < list.length && p.alive; j++) {
      const t = list[j];
      if (t === p.owner || !t.alive || !t.hurtable || p.hitSet.has(t.id)) continue;
      if (!this.overlaps(p, t, step)) continue;
      const res = this.combat.applyHit(p, t, p.def, { dmgMul: p.dmgMul, crit: p.crit, dmg: p.reflected ? undefined : p.dmg });
      if (res === 'none') continue;                          // invulnerable this step: may connect next step
      p.hitSet.add(t.id);
      if (res === 'parry') return;                            // reflected (faction changed): stop scanning this list
      if (res === 'immune') continue;                         // tumbled through it
      if (res === 'block') { this.kill(p, 'blocked'); return; }
      try { p.onHit?.(p, t, res); } catch (e) { console.error('[combat] projectile onHit threw', e); }
      if (!p.pierce) { this.kill(p, 'hit'); return; }
    }
  }

  /**
   * Does projectile `p` touch actor `t` this step? Round: the segment prevPos → pos (XZ) within r + t.radius and
   * the height within the target cylinder. Wave: a crescent band `width` wide, swept over this step's travel.
   */
  overlaps(p, t, step = 0) {
    const tr = t.radius ?? 0.35, th = t.height ?? 1, ty = t.pos.y;
    if (p.wave) {
      if (ty > p.pos.y + p.halfH || ty + th < p.pos.y - p.halfH) return false;
      const len = Math.hypot(p.vel.x, p.vel.z) || 1, fx = p.vel.x / len, fz = p.vel.z / len;
      const dx = t.pos.x - p.pos.x, dz = t.pos.z - p.pos.z;
      const f = dx * fx + dz * fz, l = -dx * fz + dz * fx;
      return Math.abs(l) <= p.halfW + tr && f <= p.r + tr && f >= -(p.r + tr + step);
    }
    if (p.pos.y < ty - p.r || p.pos.y > ty + th + p.r) return false;
    const ax = p.prevPos.x, az = p.prevPos.z, bx = p.pos.x - ax, bz = p.pos.z - az;
    const L2 = bx * bx + bz * bz;
    let u = L2 > 1e-10 ? ((t.pos.x - ax) * bx + (t.pos.z - az) * bz) / L2 : 1;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = ax + bx * u - t.pos.x, cz = az + bz * u - t.pos.z, rr = p.r + tr;
    return cx * cx + cz * cz <= rr * rr;
  }

  /** holyWave (`eatsProjectiles`): destroy hostile projectiles inside the crescent (swept over this step). */
  _eat(p, dt) {
    const len = Math.hypot(p.vel.x, p.vel.z) || 1, fx = p.vel.x / len, fz = p.vel.z / len, step = len * dt;
    for (const q of this.list) {
      if (q === p || !q.alive || q.eats || !isHostile(p.faction, q.faction)) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z, f = dx * fx + dz * fz, l = -dx * fz + dz * fx;
      if (Math.abs(l) > p.halfW + q.r || f > p.r + q.r || f < -(p.r + q.r + step + q.speed * dt)) continue;
      if (Math.abs(q.pos.y - p.pos.y) > p.halfH + q.r) continue;
      this.kill(q, 'eaten');
      this.combat.stats.eaten++;
    }
  }

  _ground(x, z) {
    const h = this.ctx.physics?.heightAt?.(x, z);
    return Number.isFinite(h) ? h : 0;
  }

  /**
   * Props and architecture. Swept with `physics.sphereCast` over this step's segment when available (no tunnelling
   * through a thin wall at 16–24 m/s; on a hit `pos` moves to the impact point), else an overlap test at `pos`
   * (`overlapsStatic(pos, r)`, `blockedAt(x, z, r, y0, y1)` or the raw XZ circles / boxes).
   */
  _hitsStatic(p) {
    const ph = this.ctx.physics;
    if (!ph) return false;
    if (typeof ph.sphereCast === 'function') {
      _w.subVectors(p.pos, p.prevPos);
      const len = _w.length();
      if (len > 1e-6) {
        _ray.origin.copy(p.prevPos); _ray.direction.copy(_w).multiplyScalar(1 / len);
        const hit = ph.sphereCast(_ray, p.r, len, WALL_CAST);
        if (hit) { p.pos.copy(p.prevPos).addScaledVector(_ray.direction, Math.max(0, hit.distance)); return true; }
        return false;
      }
    }
    if (typeof ph.overlapsStatic === 'function') return !!ph.overlapsStatic(p.pos, p.r);
    if (typeof ph.blockedAt === 'function') return !!ph.blockedAt(p.pos.x, p.pos.z, p.r, p.pos.y - p.r, p.pos.y + p.r);
    const st = ph.statics, x = p.pos.x, y = p.pos.y, z = p.pos.z, r = p.r;
    if (!st) return false;
    if (Array.isArray(st.circles)) {
      for (const c of st.circles) {
        if (y > (c.y1 ?? Infinity) || y < (c.y0 ?? -Infinity)) continue;
        const dx = x - c.x, dz = z - c.z, m = (c.r ?? 0) + r;
        if (dx * dx + dz * dz < m * m) return true;
      }
    }
    if (Array.isArray(st.boxes)) {
      for (const b of st.boxes) {
        if (y > (b.y1 ?? Infinity) || y < (b.y0 ?? -Infinity)) continue;
        if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
      }
    }
    return false;
  }

  _removeAt(i, reason) {
    const p = this.list[i];
    this.kill(p, reason, true);
    this.list.splice(i, 1);
    this._recycle(p);
  }

  _create() {
    const p = {
      isProjectile: true, id: 0, def: null, baseDef: null, owner: null, source: null, faction: 'enemy', kind: 'orb',
      pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), vel: new THREE.Vector3(), facing: 0, speed: 0,
      r: 0.2, radius: 0.2, height: 0.4, halfW: 0, halfH: 0, hover: 0, wave: false, pierce: false, eats: false, gravity: 0,
      life: 0, maxLife: 0, age: 0, alive: false, reflected: false, homing: null, endReason: null, dmgMul: 1, crit: 1, dmg: undefined,
      hitSet: new Set(), visual: null, onHit: null, onEnd: null,
      /** applyHit parry hook → reflect */
      onParried: (by) => this.reflect(p, by),
      /** applyHit block hook (the projectile then breaks; see _hitActors) */
      onBlocked: () => {},
    };
    return p;
  }

  _recycle(p) {
    if (p.visual) {
      p.visual.group.visible = false;
      let pool = this._visualPool.get(p.visual.kind);
      if (!pool) this._visualPool.set(p.visual.kind, (pool = []));
      pool.push(p.visual);
      p.visual = null;
    }
    p.def = p.baseDef = p.owner = p.source = p.homing = null;
    p.onHit = p.onEnd = null;
    p.hitSet.clear();
    this._free.push(p);
  }

  // ---------------------------------------------------------------- visuals
  _resources() {
    if (this._res) return this._res;
    const plane = new THREE.PlaneGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    this._res = {
      boltGeo: boltGeometry(),
      boltMat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.15, emissive: new THREE.Color(0x000000) }),
      sphereGeo: new THREE.SphereGeometry(1, 14, 10),
      globGeo: new THREE.IcosahedronGeometry(1, 1),
      globMat: new THREE.MeshStandardMaterial({ color: PAL.web, roughness: 0.9, metalness: 0, flatShading: true, emissive: new THREE.Color(PAL.webShade), emissiveIntensity: 0.25 }),
      trailGeo: plane,
      haloGeo: new THREE.PlaneGeometry(1, 1),
      crescentGeo: crescentGeometry(),
      trailMat: glowMaterial(TRAIL_VS, TRAIL_FS, { uWidth: { value: 0.07 }, uLen: { value: 0.8 }, uColor: { value: new THREE.Color(PAL.aim) }, uI: { value: 1 } }, THREE.DoubleSide),
      haloMat: glowMaterial(HALO_VS, HALO_FS, { uSize: { value: 0.6 }, uColor: { value: new THREE.Color(PAL.orbGlow) }, uI: { value: 1 } }, THREE.DoubleSide),
      crescentMat: glowMaterial(CRESCENT_VS, CRESCENT_FS, { uCore: { value: new THREE.Color(PAL.holyCore) }, uEdge: { value: new THREE.Color(PAL.holyEdge) }, uI: { value: 1 } }, THREE.DoubleSide),
      coreMat: new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.orbCore).multiplyScalar(VIS.orbCore), toneMapped: false }),
    };
    return this._res;
  }

  _attachVisual(p) {
    const scene = this.ctx.scene;
    if (!scene) return;
    const pool = this._visualPool.get(p.kind);
    const v = pool?.pop() ?? this._makeVisual(p.kind);
    if (!v.group.parent) scene.add(v.group);
    p.visual = v;
    v.group.visible = true;
    this._styleVisual(p);
    this._place(p, 1, 0);
  }

  _makeVisual(kind) {
    const R = this._resources();
    const group = new THREE.Group();
    group.name = `projectile:${kind}`;
    const v = { kind, group, body: null, trail: null, halo: null, crescent: null };
    const trail = (width) => {
      const m = new THREE.Mesh(R.trailGeo, R.trailMat.clone());
      m.material.uniforms.uWidth.value = width;
      m.frustumCulled = false; m.renderOrder = 5;
      group.add(m);
      return m;
    };
    if (kind === 'bolt') {
      v.body = new THREE.Mesh(R.boltGeo, R.boltMat.clone());
      v.body.scale.setScalar(1.25);
      group.add(v.body);
      v.trail = trail(0.07);
      v.halo = new THREE.Mesh(R.haloGeo, R.haloMat.clone());        // shown once reflected (gold)
      v.halo.frustumCulled = false; v.halo.renderOrder = 6; v.halo.visible = false;
      group.add(v.halo);
    } else if (kind === 'glob') {
      v.body = new THREE.Mesh(R.globGeo, R.globMat.clone());
      group.add(v.body);
      v.trail = trail(0.12);
    } else if (kind === 'wave' || kind === 'gleam') {
      v.crescent = new THREE.Mesh(R.crescentGeo, R.crescentMat.clone());
      v.crescent.renderOrder = 6;
      group.add(v.crescent);
    } else {                                                     // orb
      v.body = new THREE.Mesh(R.sphereGeo, R.coreMat.clone());
      group.add(v.body);
      v.halo = new THREE.Mesh(R.haloGeo, R.haloMat.clone());
      v.halo.frustumCulled = false; v.halo.renderOrder = 6;
      group.add(v.halo);
      v.trail = trail(0.12);
    }
    group.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
    group.visible = false;
    this._allVisuals.push(v);
    return v;
  }

  /** Colours / sizes for the projectile's current owner (gold once reflected). */
  _styleVisual(p) {
    const v = p.visual;
    if (!v) return;
    const gold = p.reflected;
    if (v.trail) {
      const u = v.trail.material.uniforms;
      u.uColor.value.set(gold ? PAL.sparkleWarm : p.kind === 'orb' ? PAL.orbGlow : PAL.aim);
      u.uLen.value = Math.min(gold ? 2.2 : 1.6, Math.max(0.35, p.speed * (gold ? 0.075 : 0.05)));
      u.uI.value = gold ? VIS.trailGold : p.kind === 'glob' ? VIS.trailGlob : VIS.trail;
      u.uWidth.value = (p.kind === 'bolt' ? 0.07 : 0.12) * (gold ? 1.8 : 1);
    }
    if (v.body && p.kind === 'bolt') {
      v.body.material.emissive.set(gold ? PAL.holy : 0x000000);
      v.body.material.emissiveIntensity = gold ? VIS.boltGold : 0;
    }
    if (v.body && p.kind === 'orb') {
      v.body.material.color.set(gold ? PAL.holyCore : PAL.orbCore).multiplyScalar(VIS.orbCore);
      v.body.scale.setScalar(Math.max(0.06, p.r * 0.75));
    }
    if (v.halo) {
      const u = v.halo.material.uniforms;
      u.uColor.value.set(gold ? PAL.sparkleWarm : PAL.orbGlow);
      u.uSize.value = Math.max(0.25, p.r * VIS.haloSize);
      if (p.kind === 'bolt') v.halo.visible = gold;
    }
    if (v.body && p.kind === 'glob') v.body.scale.setScalar(Math.max(0.06, p.r * 0.9));
    if (v.crescent) {
      const u = v.crescent.material.uniforms;
      const gleam = p.kind === 'gleam';
      u.uCore.value.set(gleam ? PAL.holyCore : PAL.holy);
      u.uEdge.value.set(gleam ? PAL.sparkle : PAL.holyEdge);
    }
  }

  /** Position / orient / animate one visual. `a` = interpolation alpha. */
  _place(p, a, time) {
    const v = p.visual;
    if (!v) return;
    const g = v.group;
    g.position.lerpVectors(p.prevPos, p.pos, a);
    if (v.crescent) {
      g.rotation.set(0, Math.atan2(p.vel.x, p.vel.z), 0);
      const grow = 0.6 + 0.4 * Math.min(1, p.age / Math.max(0.05, p.maxLife * 0.3));
      v.crescent.scale.set(p.halfW * 2 * grow, p.halfH * 2 * (0.75 + 0.25 * grow), p.halfW * 2 * grow);
      const fadeIn = Math.min(1, p.age / 0.05 + 0.35), fadeOut = clamp01(p.life / Math.max(0.05, p.maxLife * 0.35));
      const flicker = 0.92 + 0.08 * Math.sin(time * 40 + p.id);
      v.crescent.material.uniforms.uI.value = (p.kind === 'gleam' ? VIS.gleam : VIS.wave) * fadeIn * fadeOut * flicker;
      return;
    }
    const len = p.vel.length();
    if (len > 1e-5) { _v.copy(p.vel).multiplyScalar(1 / len); _q.setFromUnitVectors(Z_AXIS, _v); g.quaternion.copy(_q); }
    if (p.kind === 'glob' && v.body) {
      const s = Math.max(0.06, p.r * 0.9), wob = Math.sin(time * 22 + p.id) * 0.12;
      v.body.scale.set(s * (1 + wob), s * (1 - wob), s * (1 + wob * 0.5));
    }
    if (v.halo) v.halo.material.uniforms.uI.value = (p.reflected ? VIS.haloGold : VIS.halo) * (0.85 + 0.15 * Math.sin(time * 30 + p.id));
  }

  render(alpha, frameDt) {
    if (!this.list.length) return;
    const a = (this.ctx.game?.hitstopT ?? 0) > 0 ? 1 : alpha;
    const time = this.ctx.game?.realTime ?? 0;
    for (const p of this.list) if (p.alive) this._place(p, a, time);
  }

  /** Remove every projectile (level unload, cutscene start). No onEnd callbacks. */
  clear() {
    for (const p of this.list) { this.kill(p, 'cleared', true); this._recycle(p); }
    this.list.length = 0;
  }

  dispose() {
    this.clear();
    for (const v of this._allVisuals) {
      v.group.removeFromParent();
      v.group.traverse((o) => { if (o.material) o.material.dispose(); });
    }
    this._allVisuals.length = 0;
    this._visualPool.clear();
    if (this._res) {
      for (const k of Object.keys(this._res)) this._res[k]?.dispose?.();
      this._res = null;
    }
  }
}

/** Default projectile defs (for callers that pass an id). */
export function projectileDef(idOrDef) {
  return typeof idOrDef === 'string' ? ATTACKS[idOrDef] : idOrDef;
}
