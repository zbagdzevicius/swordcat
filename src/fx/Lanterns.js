// src/fx/Lanterns.js  (owner: fx) — warm lantern light: CS-04 Lantern Night (Clem's lantern: PointLight #FFC46B,
// intensity 1.5, distance 6), the town's Lantern Alley objective (§12.5: "a warm point light, only the nearest 2 are
// active"), vigil-camp lanterns and any later rally (L6). Visuals only: world / story decide when a lantern is lit.
//
// Any number of lantern handles. Every lit lantern draws a flickering glow halo in fx's marks batch (no extra draw call)
// and the occasional rising ember. Real light is opt-in (`light: true`). PERF §8.2 / F6 (no PointLights in play or
// cutscenes): a light-casting lantern registers a lamp source with world's `ctx.env.lamps` (LampSet → the 4
// `ENV_U.uLamps` pools nearest the iso focus, a uniform write, never a recompile). Only when world has no lamp set
// (legacy) are at most LANTERN.lights PointLights pooled, kept in the scene at intensity 0 when idle, given to the
// nearest lit light-casting lanterns, and dropped on the next level that has none.
import * as THREE from 'three';
import { SHAPE, FADE, GROW } from './Particles.js';
import { MARK } from './Marks.js';
import { isActor, actorWorldPos, resolveActor, toVec3, resolveAnchor, hash01 } from './util.js';

// `intensity` is in the design doc's units (CS-04: 1.5, written for three's legacy light units); `unit` converts to
// r155+ physically-correct candela (legacy × π), so the warm pool on the ground reads as the storyboard intends.
export const LANTERN = Object.freeze({ color: '#FFC46B', intensity: 1.5, unit: Math.PI, distance: 6, decay: 2, lights: 2, glow: 0.75 });

/** Flicker multiplier ~[0.82, 1.08] for a lantern at time t (pure, deterministic per seed). */
export function lanternFlicker(t, seed = 0) {
  const s = seed * 7.13;
  const f = 0.94 + 0.05 * Math.sin(t * 7.3 + s) + 0.035 * Math.sin(t * 13.1 + s * 1.7) + 0.025 * Math.sin(t * 23.7 + s * 0.3);
  return Math.min(1.08, Math.max(0.82, f));
}

/** Indices of the `n` nearest lit lanterns to (x, z) (pure; `list` items: {x, z, lit, w}). Ties keep list order. */
export function nearestLanterns(list, x, z, n = LANTERN.lights) {
  const idx = [];
  for (let i = 0; i < list.length; i++) if (list[i].lit) idx.push(i);
  idx.sort((a, b) => (Math.hypot(list[a].x - x, list[a].z - z) - Math.hypot(list[b].x - x, list[b].z - z)) || a - b);
  return idx.slice(0, Math.max(0, n));
}

const WARM = new THREE.Color('#FF9A3C'), MID = new THREE.Color('#FFC46B'), CORE = new THREE.Color('#FFF0C8');
const _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Lanterns {
  /** @param {any} ctx @param {{ particles: any, marks: any, rng: () => number }} o */
  constructor(ctx, { particles, marks, rng }) {
    this.ctx = ctx; this.particles = particles; this.marks = marks; this.rng = rng;
    this.list = [];          // lantern records
    this.pool = [];          // { light, owner, k }
    this.scene = null;
    this.ignitions = 0;
  }

  attach(scene) { this.scene = scene; }

  get count() { return this.list.length; }
  get litCount() { return this.list.filter((l) => l.lit).length; }
  get castCount() { return this.list.filter((l) => l.casts).length; }
  get lightsOn() { return this.pool.filter((s) => s.owner && s.light.intensity > 0.01).length + this.list.filter((l) => l.lamp?.on).length; }
  /** World's lamp registry (ENV_U.uLamps), or null (legacy PointLight pool). */
  get lampSet() { const s = this.ctx.env?.lamps; return s && typeof s.add === 'function' ? s : null; }
  /** Light-casting lanterns registered as world lamp sources. */
  get lampCount() { return this.list.filter((l) => l.lamp).length; }

  /** Create the pooled lights (idempotent). */
  ensureLights() {
    if (this.pool.length || !this.scene) return;
    for (let i = 0; i < LANTERN.lights; i++) {
      const light = new THREE.PointLight(LANTERN.color, 0, LANTERN.distance, LANTERN.decay);
      light.name = `fx.lantern.light${i}`;
      light.castShadow = false;
      this.scene.add(light);
      this.pool.push({ light, owner: null, k: 0 });
    }
  }

  /** Drop the pooled lights (a level without lanterns: one less per-fragment cost everywhere). */
  dropLights() {
    for (const s of this.pool) { s.light.removeFromParent(); s.light.dispose?.(); }
    this.pool.length = 0;
  }

  /**
   * A lantern at `at`: Vector3 / [x, y, z] / anchor name (static), an actor or actor id (follows it: the child named
   * like "lantern" if the rig has one, else `opts.offset` [x, y, z] in the actor's local space, default a raised paw),
   * or any Object3D (follows its world position). Options: lit (true), light (false: also cast real light from the
   * pool), intensity (1.5), distance (6), color, glow (0.75 m), ignite (play the lighting burst when created lit).
   * → handle { lit, light(), out(), set(), remove(), alive, pos }.
   */
  add(at, opts = {}) {
    const lamps = opts.light === true ? this.lampSet : null;
    if (opts.light === true && !lamps) this.ensureLights();
    const ref = typeof at === 'string' ? (resolveActor(this.ctx, at) ?? at) : at;
    const L = {
      ref, actor: isActor(ref) ? ref : null, obj: !isActor(ref) && ref?.isObject3D ? ref : null, child: null,
      offset: opts.offset ?? null, pos: new THREE.Vector3(), lit: opts.lit !== false, casts: opts.light === true, w: 0,
      intensity: opts.intensity ?? LANTERN.intensity, distance: opts.distance ?? LANTERN.distance,
      color: new THREE.Color(opts.color ?? LANTERN.color), glow: opts.glow ?? LANTERN.glow, seed: this.rng() * 100, emberT: this.rng(), handle: null,
      lamp: null,
    };
    if (!L.actor && !L.obj) {
      if (typeof ref === 'string') { if (resolveAnchor(this.ctx, ref, L.pos) === null) L.pos.set(0, 0, 0); else L.pos.y += opts.height ?? 0; }
      else if (!toVec3(ref, L.pos)) L.pos.set(0, 0, 0);
    }
    if (L.actor) L.actor.object3d.traverse((o) => { if (!L.child && o !== L.actor.object3d && /lantern/i.test(o.name ?? '')) L.child = o; });
    this._place(L);
    if (lamps) { L.lamp = { pos: L.pos, on: L.lit, intensity: L.intensity, distance: L.distance, flicker: 0.35, owner: 'fx.lantern' }; lamps.add(L.lamp); }
    const self = this;
    L.handle = {
      get lit() { return L.lit; },
      get alive() { return self.list.includes(L); },
      get pos() { return L.pos; },
      light(o = {}) { if (!L.lit) { L.lit = true; if (L.lamp) L.lamp.on = true; if (o.ignite !== false) self.ignite(L.pos); } return this; },
      out() { if (L.lit) { L.lit = false; if (L.lamp) L.lamp.on = false; self.puff(L.pos); } return this; },
      set(o = {}) {
        if (o.intensity != null) { L.intensity = o.intensity; if (L.lamp) L.lamp.intensity = o.intensity; }
        if (o.color) L.color.set(o.color); if (o.glow != null) L.glow = o.glow; return this;
      },
      remove() {
        const i = self.list.indexOf(L); if (i >= 0) self.list.splice(i, 1);
        for (const s of self.pool) if (s.owner === L) s.owner = null;
        if (L.lamp) { self.lampSet?.remove?.(L.lamp); L.lamp = null; }
      },
    };
    this.list.push(L);
    if (L.lit && opts.ignite) this.ignite(L.pos);
    return L.handle;
  }

  /** The lighting moment: a warm flash, sparks and a soft ring pushing the fog back. */
  ignite(pos) {
    this.ignitions++;
    const P = this.particles;
    P.single(pos, { shape: SHAPE.SOFT, color: '#FFD9A0', intensity: 2.6, size0: 0.3, size1: 2.2, life: 0.35, grow: GROW.OUT });
    P.single(pos, { shape: SHAPE.STAR8, color: '#FFE3A3', intensity: 3, size0: 0.2, size1: 1.0, life: 0.3, fade: FADE.POP, spin: 2 });
    P.burst(pos, { additive: true, n: 14, shape: SHAPE.SPARK, color: '#FFB347', intensity: 2.4, size: [0.04, 0.06], life: [0.3, 0.55],
      speed: [1.5, 3.5], dir: _up, spread: 1.3, gravity: 5, drag: 2.5, stretch: 3.5, fade: FADE.LINEAR });
    P.burst(pos, { additive: true, n: 10, shape: SHAPE.STAR4, color: '#FFE9B8', intensity: 2.2, size: [0.1, 0.18], sizeEnd: 0.3,
      life: [0.6, 1.0], speed: [0.4, 1.2], up: 0.6, spread: Math.PI, drag: 2, fade: FADE.TWINKLE, jitter: 0.2 });
    P.single(pos, { shape: SHAPE.RING, color: '#FFE0B0', intensity: 1.2, size0: 0.4, size1: 3.2, life: 0.6, grow: GROW.OUT, alpha: 0.6 });
  }

  /** A lantern going out: a curl of smoke. */
  puff(pos) {
    this.particles.burst(pos, { n: 4, shape: SHAPE.PUFF, color: '#E8D8C8', alpha: 0.6, size: [0.1, 0.16], sizeEnd: 2.4, grow: GROW.OUT,
      life: [0.8, 1.2], speed: [0.2, 0.5], up: 0.7, dir: _up, spread: 0.6, drag: 2, fade: FADE.HOLD });
  }

  _place(L) {
    if (L.child) { L.child.updateWorldMatrix(true, false); L.pos.setFromMatrixPosition(L.child.matrixWorld); return; }
    if (L.obj) { L.obj.updateWorldMatrix(true, false); L.pos.setFromMatrixPosition(L.obj.matrixWorld); return; }
    if (L.actor) {
      const a = L.actor, h = (a.height ?? 1) * (a.object3d?.scale?.y ?? 1), f = a.object3d?.rotation?.y ?? a.facing ?? 0;
      const o = L.offset ?? [0.22, 0.62, 0.3];
      const ox = o[0] * h, oy = o[1] * h, oz = o[2] * h;
      actorWorldPos(a, L.pos);
      L.pos.x += Math.cos(f) * ox + Math.sin(f) * oz; L.pos.y += oy; L.pos.z += -Math.sin(f) * ox + Math.cos(f) * oz;
    }
  }

  render(dt, time) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const l = L[i];
      if (l.actor && !l.actor.object3d?.parent) { l.handle.remove(); continue; }
      if (l.obj && !l.obj.parent) { l.handle.remove(); continue; }
      this._place(l);
    }
    // lights → nearest lit lanterns to her (or the camera target)
    if (this.pool.length) {
      const pl = this.ctx.player, c = pl?.object3d ? actorWorldPos(pl, _p) : (this.ctx.camera?.position ?? _p.set(0, 0, 0));
      const near = nearestLanterns(L.map((l) => ({ x: l.pos.x, z: l.pos.z, lit: l.lit && l.casts })), c.x, c.z, this.pool.length).map((i) => L[i]);
      for (const s of this.pool) if (s.owner && !near.includes(s.owner)) s.release = true; else s.release = false;
      for (const want of near) {
        if (this.pool.some((s) => s.owner === want)) continue;
        const free = this.pool.find((s) => !s.owner) ?? this.pool.find((s) => s.release && s.k < 0.05);
        if (free) { free.owner = want; free.k = 0; free.release = false; }
      }
      const k = 1 - Math.exp(-5 * (dt || 0.016));
      for (const s of this.pool) {
        const o = s.owner;
        s.k += ((o && !s.release && o.lit ? 1 : 0) - s.k) * k;
        if (!o) { s.light.intensity = 0; continue; }
        if (s.release && s.k < 0.02) { s.owner = null; s.light.intensity = 0; continue; }
        s.light.position.copy(o.pos);
        s.light.color.copy(o.color);
        s.light.distance = o.distance;
        s.light.intensity = o.intensity * LANTERN.unit * s.k * lanternFlicker(time, o.seed);
      }
    }
    // glow halos + embers
    const M = this.marks;
    for (const l of L) {
      l.w += ((l.lit ? 1 : 0) - l.w) * (1 - Math.exp(-6 * (dt || 0.016)));
      if (l.w < 0.01) continue;
      const f = lanternFlicker(time, l.seed);
      M.push(l.pos.x, l.pos.y, l.pos.z, l.glow * 1.9 * f, MARK.SOFT, WARM, 0.9 * f, 0.45 * l.w);
      M.push(l.pos.x, l.pos.y, l.pos.z, l.glow * 0.7 * f, MARK.SOFT, MID, 1.3 * f, 0.7 * l.w);
      M.push(l.pos.x, l.pos.y, l.pos.z, l.glow * 0.26 * f, MARK.SOFT, CORE, 2.2 * f, 0.95 * l.w);
      if (dt > 0 && l.lit && (l.emberT -= dt) <= 0) {
        l.emberT = 0.35 + hash01((time * 1000) | 0) * 0.5;
        this.particles.burst(l.pos, { additive: true, n: 1, shape: SHAPE.STAR4, color: '#FFC870', intensity: 2, size: [0.04, 0.07], sizeEnd: 0.4,
          life: [0.9, 1.5], speed: [0.05, 0.2], up: 0.45, spread: Math.PI, drag: 0.6, fade: FADE.TWINKLE, jitter: 0.08 });
      }
    }
  }

  /** Level unload: every lantern belongs to its level. The pooled lights stay until the next level decides. */
  clear() {
    const lamps = this.lampSet;
    for (const l of this.list) if (l.lamp) { lamps?.remove?.(l.lamp); l.lamp = null; }
    this.list.length = 0;
    for (const s of this.pool) { s.owner = null; s.k = 0; s.light.intensity = 0; }
  }

  dispose() { this.clear(); this.dropLights(); }
}
