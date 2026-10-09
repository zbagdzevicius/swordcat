// src/camera/CutsceneCamera.js  (owner: camera) — runs one §5.1 `cam` step at a time ("shot"):
//   { t: 'cam', preset?, pos?, look?, anchor?, target?, fov?, mode?, path?, dur?, ease?, noise?, roll?, ... }
// Modes: cut | blend | rail | orbit | handheld | whip | fall (+ whipfall = the WHIP_FALL preset: whip, then fall).
//   cut       jump to the framing and hold it (it keeps tracking the anchor's position; yaw frozen at the cut)
//   blend     FollowCamera glides from the current pose to the framing over `dur` (cylindrical arc, `ease`)
//   rail      `path` (level anchor names / [x,y,z] world points → centripetal CatmullRom), or pos → `to` in the
//             anchor frame (through the control point `via` when given: a quadratic Bézier, e.g. PULLBACK's crane-up);
//             the look goes look → `lookTo`; over `dur` with `ease`; FOV may animate [from, to]
//   orbit     around the anchor at `r`, `h`, `degPerSec` (or `orbit: {r, h, degPerSec}`); starts at the preset's
//             `pos` angle, else where the camera is now
//   handheld  the framing (or the current one when no pos/look) + smooth noise (`noise` m, default 0.02)
//   whip      from the current pose: yaw `yaw` (+120°) in `dur` (0.18 s) with FOV +`fovAdd` (15)
//   fall      from the current pose: roll `roll` (90°) and drop to ground + `y` (0.12) over `dur` (0.35 s)
// Positions are anchor-local (§5.2: the anchor faces +Z, feet at the origin, +X = her left). `look` may also be
// an actor id / level anchor name ("long lens on anchor bell_far"). Timelines advance in SIM time (they slow
// with `time` steps and freeze in the pause menu); the promise from start() resolves after `dur`.
// Options on any shot: `scale: 'height'` (or a number) scales the anchor-local placements by the anchor's height (a
// boss reveal frames a 1.6 m rat and a 2.2 m hyena alike); `collide: true` keeps the lens on her side of solid
// architecture (a sphere cast from the subject's chest, like the spring arm; needs `castFn`, which FollowCamera sets).
import * as THREE from 'three';
import { CAMERA } from '../core/config.js';
import { clamp01, lerp, EASES } from '../core/math.js';
import { CamPose, resolveEase } from './pose.js';
import { PRESETS, DEG, MEME_PERIOD, localToWorld, memeSway, handheld } from './presets.js';

export const SHOT_MODES = Object.freeze(['cut', 'blend', 'rail', 'orbit', 'handheld', 'whip', 'fall', 'whipfall']);

const WHIP = { yaw: 120 * DEG, dur: 0.18, fovAdd: 15 };
const FALL = { roll: 90 * DEG, y: 0.12, dur: 0.35 };
/** minimum camera height above the terrain for authored shots (m; the WHIP_FALL landing sets its own 0.12) */
export const GROUND_CLEAR = 0.1;
const _warned = new Set();
const warnOnce = (msg) => { if (_warned.has(msg)) return; _warned.add(msg); console.warn(msg); };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Vector3(), _o = new THREE.Vector3();
/** lens sphere radius of the `collide` cast (m) */
const COLLIDE_R = 0.2;
const _n = { x: 0, y: 0, z: 0 }, _s = { x: 0, y: 0, z: 0 }, _arr = [0, 0, 0];

/**
 * Merge a `cam` step with its preset and fill the defaults. Pure (no ctx).
 * @param {object} step
 */
export function normalizeShot(step = {}) {
  const s = step ?? {};
  let P = null;
  if (s.preset) {
    P = PRESETS[s.preset] ?? null;
    if (!P) { warnOnce(`[camera] unknown preset "${s.preset}" (using HERO_LOW)`); P = PRESETS.HERO_LOW; }
  }
  const kind = P?.kind ?? 'static';
  let mode = s.mode;
  if (!mode) mode = s.path ? 'rail' : s.orbit ? 'orbit' : kind === 'rail' ? 'rail' : kind === 'orbit' ? 'orbit' : kind === 'whipfall' ? 'whipfall' : 'cut';
  if (!SHOT_MODES.includes(mode)) { warnOnce(`[camera] unknown cam mode "${mode}" (using cut)`); mode = 'cut'; }
  if (mode === 'whip' && P?.kind === 'whipfall') mode = 'whipfall';
  const whip = { ...WHIP, ...(P?.whip ?? {}), ...(s.whip ?? {}) };
  const fall = { ...FALL, ...(P?.fall ?? {}), ...(s.fall ?? {}) };
  if (mode === 'whip') { if (s.yaw != null) whip.yaw = s.yaw; if (s.fovAdd != null) whip.fovAdd = s.fovAdd; if (s.dur != null) whip.dur = s.dur; }
  if (mode === 'fall') { if (s.roll != null) fall.roll = s.roll; if (s.y != null) fall.y = s.y; if (s.dur != null) fall.dur = s.dur; }
  const orbitSrc = s.orbit ?? P?.orbit ?? {};
  // the preset's rail control point only belongs to the preset's own rail (an overridden pos / to drops it)
  const via = s.via !== undefined ? s.via : (s.pos == null && s.to == null ? P?.via ?? null : null);
  const orbit = { r: s.r ?? orbitSrc.r ?? 3, h: s.h ?? orbitSrc.h ?? 1.2, degPerSec: s.degPerSec ?? orbitSrc.degPerSec ?? 8 };
  let dur = s.dur ?? P?.dur;
  if (mode === 'whip') dur = whip.dur;
  else if (mode === 'fall') dur = fall.dur;
  else if (mode === 'whipfall') dur = s.dur ?? (whip.dur + fall.dur);
  if (dur == null) dur = 0;
  if (mode === 'whipfall' && dur > 0 && Math.abs(dur - (whip.dur + fall.dur)) > 1e-6) {          // a custom dur rescales both parts
    const k = dur / (whip.dur + fall.dur); whip.dur *= k; fall.dur *= k;
  }
  return {
    preset: s.preset ?? null, kind, mode,
    anchor: s.anchor ?? 'swordcat', target: s.target ?? null,
    pos: s.pos ?? P?.pos ?? null, look: s.look ?? P?.look ?? null,
    to: s.to ?? P?.to ?? null, lookTo: s.lookTo ?? P?.lookTo ?? null,
    path: s.path ?? null,
    via,
    collide: s.collide ?? P?.collide ?? false,
    scale: s.scale ?? P?.scale ?? null,
    fov: s.fov ?? P?.fov ?? null,
    dur: Math.max(0, dur),
    ease: resolveEase(s.ease ?? P?.ease),
    roll: s.roll ?? P?.roll ?? 0,
    noise: s.noise ?? P?.noise ?? (mode === 'handheld' ? 0.02 : 0),
    sway: s.sway ?? P?.sway ?? 0,
    loop: s.loop ?? P?.loop ?? MEME_PERIOD,
    lookMid: s.lookMid ?? P?.lookMid ?? (s.target ? 0.75 : null),
    track: s.track ?? true,
    trackYaw: s.trackYaw ?? false,
    yawOffset: (mode === 'whip' || mode === 'whipfall') ? 0 : (s.yaw ?? 0),
    orbit, whip, fall,
  };
}

/**
 * Quadratic Bézier a → (control c) → b at k, into `out` (`out` may alias none of the inputs).
 * @param {THREE.Vector3} a @param {THREE.Vector3} c @param {THREE.Vector3} b @param {number} k @param {THREE.Vector3} out
 */
export function bezier2(a, c, b, k, out) {
  const u = 1 - k, wa = u * u, wc = 2 * u * k, wb = k * k;
  return out.set(a.x * wa + c.x * wc + b.x * wb, a.y * wa + c.y * wc + b.y * wb, a.z * wa + c.z * wc + b.z * wb);
}

/** Placement scale of a shot: `'height'` → the anchor's height (≥ 0.3), a number → itself, else 1. */
export function shotScale(scale, frame) {
  if (scale === 'height') return Math.max(0.3, frame?.height ?? 1);
  return typeof scale === 'number' && scale > 0 ? scale : 1;
}

/** Resolved anchor frame (origin = feet, yaw = facing). */
class Frame {
  constructor() { this.pos = new THREE.Vector3(); this.yaw = 0; this.actor = null; this.height = 1; this.ok = false; }
}

/**
 * Resolve an anchor spec into a frame: actor id / level anchor name / Actor / {pos, facing} / Vector3 / [x,y,z] / [x,z].
 * @param {any} ctx @param {any} a @param {Frame} out @param {boolean} [fallbackToPlayer]
 */
export function resolveFrame(ctx, a, out, fallbackToPlayer = true) {
  out.actor = null; out.height = 1; out.ok = true;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    if (a.object3d && a.pos) { out.actor = a; out.pos.copy(a.object3d.position); out.yaw = a.facing ?? 0; out.height = a.height ?? 1; return out; }
    if (a.pos && typeof a.pos.x === 'number') { out.pos.copy(a.pos); out.yaw = a.facing ?? 0; return out; }
    if (typeof a.x === 'number' && typeof a.z === 'number') { out.pos.set(a.x, a.y ?? 0, a.z); out.yaw = 0; return out; }
  }
  if (Array.isArray(a) && a.length >= 2) {
    if (a.length >= 3) out.pos.set(a[0], a[1], a[2]);
    else out.pos.set(a[0], ctx?.physics?.heightAt?.(a[0], a[1]) ?? 0, a[1]);
    out.yaw = 0; return out;
  }
  if (typeof a === 'string') {
    const actor = ctx?.actors?.get?.(a);
    if (actor) { out.actor = actor; out.pos.copy(actor.object3d?.position ?? actor.pos); out.yaw = actor.facing ?? 0; out.height = actor.height ?? 1; return out; }
    const la = ctx?.levels?.anchor?.(a);
    if (la?.pos) { out.pos.copy(la.pos); out.yaw = la.facing ?? 0; return out; }
    warnOnce(`[camera] unknown anchor "${a}"`);
  }
  const p = fallbackToPlayer ? ctx?.player : null;
  if (p) { out.actor = p; out.pos.copy(p.object3d?.position ?? p.pos); out.yaw = p.facing ?? 0; out.height = p.height ?? 1; return out; }
  out.pos.set(0, 0, 0); out.yaw = 0; out.ok = false;
  return out;
}

export class CutsceneCamera {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    /** the normalized running shot or null */
    this.shot = null;
    this.t = 0;
    /** free-running clock for noise/sway */
    this.clock = 0;
    this.pose = new CamPose();
    this.from = new CamPose();
    this.frame = new Frame();
    this.targetFrame = new Frame();
    this.landed = false;
    this.done = true;
    this._whipEnd = new CamPose();
    this._curve = null;
    this._railLook = new THREE.Vector3();
    this._orbitAng0 = 0;
    this._yaw0 = 0;
    this._resolve = null;
    /** anchor-local placement scale of the running shot (`scale: 'height'` → the anchor's height) */
    this._k = 1;
    /**
     * Optional obstacle cast for `collide` shots: (origin, unitDir, maxDist, radius) → hit distance or −1.
     * FollowCamera wires its spring-arm cast here (terrain + architecture + solid props, thin / fading props skipped).
     * @type {null | ((o: THREE.Vector3, d: THREE.Vector3, max: number, r: number) => number)}
     */
    this.castFn = null;
  }

  get active() { return !!this.shot; }
  get mode() { return this.shot?.mode ?? null; }
  /** true while the shot carries the seamless MEME_LOOP sway (a 3.8 s loop that the cape / grass sync to) */
  get looping() { return !!this.shot && this.shot.sway > 0; }
  /** loop-local time of a looping shot (0 at the shot's start, wraps at its `loop` period) */
  get loopT() { return this.looping ? this.t % this.shot.loop : 0; }
  /** world position of the shot's subject (for tree fade + the blend arc) */
  get subject() { return this.frame.pos; }

  /**
   * Start a shot from the current camera pose. Resolves after the shot's `dur` (or at once for 0),
   * or when it is replaced/stopped.
   * @param {object} step a §5.1 cam step @param {CamPose} fromPose
   * @returns {Promise<void>}
   */
  start(step, fromPose) {
    this._settle();
    const s = this.shot = normalizeShot(step);
    this.t = 0; this.landed = false; this.done = false;
    this.from.copy(fromPose);
    resolveFrame(this.ctx, s.anchor, this.frame);
    this._yaw0 = this.frame.yaw + s.yawOffset;
    this._k = shotScale(s.scale, this.frame);
    this._curve = null;
    if (s.mode === 'rail' && s.path) this._buildPath(s);
    if (s.mode === 'orbit') {
      if (s.pos) { localToWorld(s.pos, this.frame.pos, this._yaw0, _v); this._orbitAng0 = Math.atan2(_v.x - this.frame.pos.x, _v.z - this.frame.pos.z); }
      else this._orbitAng0 = Math.atan2(fromPose.pos.x - this.frame.pos.x, fromPose.pos.z - this.frame.pos.z);
    }
    if (s.mode === 'whipfall') this._whipPose(1, this.from, this._whipEnd);
    const p = new Promise((resolve) => { this._resolve = resolve; });
    this._eval();
    if (s.dur <= 0) this._settle();
    return p;
  }

  /** Stop the shot (resolves its promise). */
  stop() { this._settle(); this.shot = null; }

  /** Advance by `dt` (sim seconds) and return the pose. */
  update(dt) {
    if (!this.shot) return this.pose;
    this.t += dt; this.clock += dt;
    this._eval();
    if (!this.done && this.t >= this.shot.dur) this._settle();
    return this.pose;
  }

  _settle() {
    this.done = true;
    const r = this._resolve; this._resolve = null;
    if (r) r();
  }

  // ------------------------------------------------------------------ evaluation
  _eval() {
    const s = this.shot, out = this.pose, f = this.frame;
    if (s.track && f.actor) f.pos.copy(f.actor.object3d?.position ?? f.actor.pos);
    if (s.trackYaw && f.actor) this._yaw0 = (f.actor.facing ?? 0) + s.yawOffset;
    const k = s.dur > 0 ? s.ease(clamp01(this.t / s.dur)) : 1;
    out.roll = s.roll;
    switch (s.mode) {
      case 'whip': this._whipPose(clamp01(this.t / Math.max(1e-4, s.whip.dur)), this.from, out); return;
      case 'fall': this._fallPose(clamp01(this.t / Math.max(1e-4, s.fall.dur)), this.from, out); return;
      case 'whipfall':
        if (this.t < s.whip.dur) this._whipPose(clamp01(this.t / Math.max(1e-4, s.whip.dur)), this.from, out);
        else this._fallPose(clamp01((this.t - s.whip.dur) / Math.max(1e-4, s.fall.dur)), this._whipEnd, out);
        return;
      case 'orbit': this._orbitPose(out); break;
      case 'rail': this._railPose(k, out); break;
      default: this._staticPose(out);
    }
    out.fov = this._fov(k);
    if (s.collide) this._collide(out);
    this._addMotion(out);
    // safety net: an anchor-relative low shot on a slope (HERO_LOW at 0.35 m) or a rail over a hill never dips
    // into the terrain (the look point stays: the subject keeps its place in the frame)
    const g = this.ctx.physics?.heightAt?.(out.pos.x, out.pos.z);
    if (Number.isFinite(g) && out.pos.y < g + GROUND_CLEAR) out.pos.y = g + GROUND_CLEAR;
  }

  _fov(k) {
    const v = this.shot.fov;
    if (Array.isArray(v)) return lerp(v[0], v[1] ?? v[0], k);
    if (typeof v === 'number') return v;
    return this.from.fov || CAMERA.fov;
  }

  /** `spec` (array local / name / point) → world point into `out`; null spec → `fallback`. */
  _point(spec, out, fallback, lookHeight = 0.75) {
    if (spec == null) return out.copy(fallback);
    if (Array.isArray(spec)) {
      const k = this._k;
      if (spec.length >= 3) { _arr[0] = spec[0] * k; _arr[1] = spec[1] * k; _arr[2] = spec[2] * k; return localToWorld(_arr, this.frame.pos, this._yaw0, out); }
      _arr[0] = spec[0] * k; _arr[1] = 0.8 * k; _arr[2] = spec[1] * k;
      return localToWorld(_arr, this.frame.pos, this._yaw0, out);
    }
    resolveFrame(this.ctx, spec, this.targetFrame, false);
    out.copy(this.targetFrame.pos);
    if (this.targetFrame.actor) out.y += (this.targetFrame.height ?? 1) * lookHeight;
    return out;
  }

  _staticPose(out) {
    const s = this.shot;
    this._point(s.pos, out.pos, this.from.pos);
    if (s.lookMid != null && s.target) {
      resolveFrame(this.ctx, s.target, this.targetFrame, false);
      if (this.targetFrame.ok) {
        out.look.addVectors(this.frame.pos, this.targetFrame.pos).multiplyScalar(0.5);
        out.look.y = this.frame.pos.y + s.lookMid;
        return;
      }
    }
    this._point(s.look, out.look, this.from.look);
  }

  _buildPath(s) {
    const pts = [];
    for (const p of s.path) {
      if (typeof p === 'string') {
        resolveFrame(this.ctx, p, this.targetFrame, false);
        if (!this.targetFrame.ok) continue;
        const v = this.targetFrame.pos.clone();
        if (this.targetFrame.actor) v.y += 1.6;
        pts.push(v);
      } else if (Array.isArray(p)) {
        if (p.length >= 3) pts.push(new THREE.Vector3(p[0], p[1], p[2]));
        else pts.push(new THREE.Vector3(p[0], (this.ctx.physics?.heightAt?.(p[0], p[1]) ?? 0) + 2, p[1]));
      } else if (p && typeof p.x === 'number') pts.push(new THREE.Vector3(p.x, p.y ?? 0, p.z));
    }
    if (pts.length === 1) pts.push(pts[0].clone());
    if (pts.length < 2) { warnOnce('[camera] rail path has no resolvable points'); return; }
    this._curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    // default look: well past the end of the rail, at standing height above the ground there
    const end = pts[pts.length - 1];
    this._curve.getTangentAt(1, _d);
    _d.y = 0;
    if (_d.lengthSq() < 1e-6) _d.set(0, 0, 1); else _d.normalize();
    this._railLook.copy(end).addScaledVector(_d, 12);
    this._railLook.y = (this.ctx.physics?.heightAt?.(this._railLook.x, this._railLook.z) ?? end.y - 2) + 1;
  }

  _railPose(k, out) {
    const s = this.shot;
    if (this._curve) {
      this._curve.getPointAt(clamp01(k), out.pos);
      if (s.look != null && s.lookTo != null) { this._point(s.look, _v, this._railLook); this._point(s.lookTo, _w, this._railLook); out.look.lerpVectors(_v, _w, k); }
      else if (s.look != null) this._point(s.look, out.look, this._railLook);
      else out.look.copy(this._railLook);
      return;
    }
    this._point(s.pos, _v, this.from.pos);
    this._point(s.to ?? s.pos, _w, _v);
    if (Array.isArray(s.via) && s.via.length >= 3) {
      this._point(s.via, _c, _v);
      bezier2(_v, _c, _w, k, out.pos);
    } else out.pos.lerpVectors(_v, _w, k);
    this._point(s.look, _v, this.from.look);
    this._point(s.lookTo ?? s.look, _w, _v);
    out.look.lerpVectors(_v, _w, k);
  }

  /** `collide` shots: pull the lens in front of solid architecture between the subject's chest and the lens. */
  _collide(out) {
    if (typeof this.castFn !== 'function') return;
    const f = this.frame;
    _o.copy(f.pos); _o.y += (f.height ?? 1) * 0.75;
    _d.subVectors(out.pos, _o);
    const len = _d.length();
    if (len < 0.4) return;
    _d.multiplyScalar(1 / len);
    const hit = this.castFn(_o, _d, len + COLLIDE_R, COLLIDE_R);
    if (hit >= 0 && hit < len) out.pos.copy(_o).addScaledVector(_d, Math.max(0.3, hit - 0.05));
  }

  _orbitPose(out) {
    const s = this.shot, c = this.frame.pos, o = s.orbit;
    const ang = this._orbitAng0 + o.degPerSec * DEG * this.t;
    out.pos.set(c.x + Math.sin(ang) * o.r, c.y + o.h, c.z + Math.cos(ang) * o.r);
    const ly = Array.isArray(s.look) ? s.look[1] : o.h * 0.75;
    if (typeof s.look === 'string') this._point(s.look, out.look, c);
    else out.look.set(c.x, c.y + ly, c.z);
  }

  /** Whip pan from `from`: rotate the view about +Y by whip.yaw·e(u), FOV + fovAdd·e(u), roll → 0. */
  _whipPose(u, from, out) {
    const w = this.shot.whip, e = EASES.inOutCubic(u);
    _d.subVectors(from.look, from.pos).applyAxisAngle(_up, w.yaw * e);
    out.pos.copy(from.pos);
    out.look.copy(from.pos).add(_d);
    const fv = this.shot.fov;
    const fovEnd = Array.isArray(fv) ? fv[1] : from.fov + w.fovAdd;
    out.fov = lerp(from.fov, fovEnd, e);
    out.roll = from.roll * (1 - e);
    return out;
  }

  /** Fall from `from`: drop to ground + fall.y (accelerating), roll to fall.roll, the view levels out. */
  _fallPose(u, from, out) {
    const fl = this.shot.fall;
    const ground = this.ctx.physics?.heightAt?.(from.pos.x, from.pos.z) ?? 0;
    const eDrop = u * u, eRoll = EASES.outCubic(u);
    out.pos.copy(from.pos);
    out.pos.y = lerp(from.pos.y, ground + fl.y, eDrop);
    _d.subVectors(from.look, from.pos);
    const len = Math.max(0.5, _d.length());
    _d.y = lerp(_d.y, 0, eRoll);
    if (_d.lengthSq() < 1e-8) _d.set(0, 0, 1);
    _d.normalize().multiplyScalar(len);
    out.look.copy(out.pos).add(_d);
    out.roll = lerp(from.roll, fl.roll, eRoll);
    out.fov = from.fov;
    if (u >= 1) this.landed = true;
    return out;
  }

  _addMotion(out) {
    const s = this.shot;
    if (s.sway > 0) {
      memeSway(this.t % s.loop, s.loop, s.sway, _s);                  // shot-local: loop 0 = the cut
      // sway in the anchor frame (same as MemeCam)
      const c = Math.cos(this._yaw0), sn = Math.sin(this._yaw0);
      const wx = _s.x * c + _s.z * sn, wz = -_s.x * sn + _s.z * c;
      out.pos.x += wx; out.pos.y += _s.y; out.pos.z += wz;
      out.look.x += wx * 0.33; out.look.y += _s.y * 0.33; out.look.z += wz * 0.33;
    }
    if (s.noise > 0) {
      handheld(this.clock, s.noise, _n, 1);
      out.pos.x += _n.x; out.pos.y += _n.y; out.pos.z += _n.z;
      handheld(this.clock + 7.3, s.noise * 0.6, _n, 2);
      out.look.x += _n.x; out.look.y += _n.y; out.look.z += _n.z;
    }
  }
}
