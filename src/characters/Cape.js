// Capes (research/art.md §5; GAME_DESIGN §7.8, §13.5, §17):
// - Hero: CPU verlet cloth, 9 x 13 particles, pinned to 3 shoulder/neck anchors that follow the chest joint,
//   structural + shear constraints, 4 iterations, damping 0.985, gravity -20, wind + inertia, sphere colliders.
// - Meme Cam: cross-fade (0.3 s) to a seamlessly looping sway (3.8 s period, gust peak at 1.2 s), back on exit.
// - NPCs: static drape + vertex-shader sway (no CPU).
import * as THREE from 'three';
import { CAPES } from './palette.js';
import { own } from './materials.js';
import { clamp, smoothstep } from './util.js';

export const CAPE_DEFAULTS = Object.freeze({ cols: 9, rows: 13, topW: 0.38, botW: 0.55, len: 0.46, iterations: 4, damping: 0.985, gravity: -20, anchorY: 0.60, anchorZ: -0.1 });

/** Shared sway clock for NPC capes. */
export const CAPE_TIME = { value: 0 };

// ------------------------------------------------------------------ materials

const _mats = new Map();
/**
 * Wool/velvet cape material with a darker lining on back faces and a hem stripe (art.md §5).
 * @param {string} style  key of CAPES ('red', 'cream', ...) or a hex colour
 * @param {{ sway?: boolean }} [o] sway: NPC vertex-shader sway variant
 */
export function capeMaterial(style = 'red', o = {}) {
  const key = style + (o.sway ? ':sway' : '');
  if (_mats.has(key)) return _mats.get(key);
  const spec = CAPES[style] || { color: style, lining: style, sheen: '#ffffff', hem: '#D9B26A' };
  const m = new THREE.MeshPhysicalMaterial({
    color: spec.color, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(spec.sheen), sheenRoughness: 0.6, side: THREE.DoubleSide,
  });
  const uniforms = {
    uLining: { value: new THREE.Color(spec.lining) }, uHem: { value: new THREE.Color(spec.hem) },
    uTime: CAPE_TIME, uSpeed: { value: 0 }, uSwayAmp: { value: 1 },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCapeUv;\nuniform float uTime, uSpeed, uSwayAmp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vCapeUv = uv;
        #ifdef CAPE_SWAY
        {
          float k = pow(1.0 - uv.y, 2.0);
          transformed.z -= k * (0.06 + uSpeed * 0.18);
          transformed.x += k * sin(uTime * 2.0 + uv.y * 4.0) * 0.02 * uSwayAmp;
          transformed.z += k * sin(uTime * 2.6 + uv.x * 3.0) * 0.015 * uSwayAmp;
        }
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vCapeUv;\nuniform vec3 uLining, uHem;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (!gl_FrontFacing) diffuseColor.rgb = uLining;
        float hemK = smoothstep(0.004, 0.012, vCapeUv.y) * (1.0 - smoothstep(0.03, 0.038, vCapeUv.y));
        diffuseColor.rgb = mix(diffuseColor.rgb, uHem, hemK);
        diffuseColor.rgb *= mix(0.82, 1.0, smoothstep(0.0, 0.25, vCapeUv.y)); // grimy hem / fold shade`);
  };
  if (o.sway) m.defines = { CAPE_SWAY: '' };
  m.customProgramCacheKey = () => 'sc-cape' + (o.sway ? '-sway' : '');
  _mats.set(key, own(m));
  return m;
}

// ------------------------------------------------------------------ geometry

/** Cape plane (cols x rows vertices), v = 1 at the shoulders; winding flipped so the OUTSIDE (away from the back) is the front face. */
export function capeGeometry(cols = 9, rows = 13) {
  const g = new THREE.PlaneGeometry(1, 1, cols - 1, rows - 1);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  return g;
}

/** Rest drape position (kitten space) for particle (u, v). */
export function drapePoint(u, v, d = CAPE_DEFAULTS, out = new THREE.Vector3()) {
  const w = THREE.MathUtils.lerp(d.topW, d.botW, Math.pow(v, 0.8));
  const x = (u - 0.5) * w;
  const side = (2 * u - 1) ** 2;
  const z = d.anchorZ + side * 0.085 * (1 - v * 0.35) - v * 0.06 - Math.sin(v * Math.PI) * 0.02;
  return out.set(x, d.anchorY - v * d.len, z);
}

// ------------------------------------------------------------------ verlet sim (pure math; node-testable)

/** Position-based verlet cloth. All positions in world space. */
export class ClothSim {
  constructor(o = {}) {
    const d = { ...CAPE_DEFAULTS, ...o };
    this.d = d;
    const C = d.cols, R = d.rows, N = C * R;
    this.C = C; this.R = R; this.N = N;
    this.p = new Float32Array(N * 3); this.q = new Float32Array(N * 3);
    this.pinned = new Uint8Array(N);
    for (let c = 0; c < C; c++) this.pinned[c] = 1;
    const v = new THREE.Vector3();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      drapePoint(c / (C - 1), r / (R - 1), d, v);
      const i = (r * C + c) * 3; this.p[i] = v.x; this.p[i + 1] = v.y; this.p[i + 2] = v.z;
    }
    this.q.set(this.p);
    // constraints: structural (h, v) + shear (2 diagonals) + light bend (skip one, vertical)
    const cons = [];
    const add = (a, b, stiff) => {
      const dx = this.p[a * 3] - this.p[b * 3], dy = this.p[a * 3 + 1] - this.p[b * 3 + 1], dz = this.p[a * 3 + 2] - this.p[b * 3 + 2];
      cons.push(a, b, Math.hypot(dx, dy, dz), stiff);
    };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (c < C - 1) add(i, i + 1, 1);
      if (r < R - 1) add(i, i + C, 1);
      if (c < C - 1 && r < R - 1) { add(i, i + C + 1, 0.6); add(i + 1, i + C, 0.6); }
      if (r < R - 2) add(i, i + 2 * C, 0.25);
    }
    this.cons = new Float32Array(cons);
    // long-range tethers: each particle may not drift further from its column's pin than its rest distance
    this.tether = new Float32Array(N);
    for (let i = 0; i < N; i++) { const c = i % C; const dx = this.p[i * 3] - this.p[c * 3], dy = this.p[i * 3 + 1] - this.p[c * 3 + 1], dz = this.p[i * 3 + 2] - this.p[c * 3 + 2]; this.tether[i] = Math.hypot(dx, dy, dz) * 1.03; }
    this.pins = new Float32Array(C * 3);
    this.acc = 0; this.t = 0;
    this.spheres = []; // [{x,y,z,r}]
    this.groundY = -Infinity;
  }
  /** Teleport every particle by an offset (respawn / cutscene cut) to avoid a whip. */
  shift(dx, dy, dz) {
    for (let i = 0; i < this.N; i++) { this.p[i * 3] += dx; this.p[i * 3 + 1] += dy; this.p[i * 3 + 2] += dz; }
    this.q.set(this.p);
  }
  /** Reset to a transformed rest drape. `xf(v3)` maps kitten space → world. */
  reset(xf) {
    const v = new THREE.Vector3();
    for (let r = 0; r < this.R; r++) for (let c = 0; c < this.C; c++) {
      drapePoint(c / (this.C - 1), r / (this.R - 1), this.d, v); if (xf) xf(v);
      const i = (r * this.C + c) * 3; this.p[i] = v.x; this.p[i + 1] = v.y; this.p[i + 2] = v.z;
    }
    this.q.set(this.p);
  }
  /** One fixed step. wind: {x,y,z} world accel. */
  step(h, wind = null) {
    const d = this.d, p = this.p, q = this.q, N = this.N, C = this.C;
    const damp = Math.pow(d.damping, h * 60);
    const g = d.gravity * h * h;
    this.t += h;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      if (this.pinned[i]) { const c = i % C; p[k] = this.pins[c * 3]; p[k + 1] = this.pins[c * 3 + 1]; p[k + 2] = this.pins[c * 3 + 2]; q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2]; continue; }
      const vx = (p[k] - q[k]) * damp, vy = (p[k + 1] - q[k + 1]) * damp, vz = (p[k + 2] - q[k + 2]) * damp;
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      let ax = 0, ay = g, az = 0;
      if (wind) {
        const row = Math.floor(i / C) / (this.R - 1);
        const f = (0.55 + 0.45 * Math.sin(this.t * 2.3 + i * 0.37) * Math.sin(this.t * 1.1 + row * 3.0)) * h * h * (0.4 + row);
        ax += wind.x * f; ay += wind.y * f; az += wind.z * f;
      }
      p[k] += vx + ax; p[k + 1] += vy + ay; p[k + 2] += vz + az;
    }
    const cons = this.cons, nc = cons.length;
    for (let it = 0; it < d.iterations; it++) {
      for (let j = 0; j < nc; j += 4) {
        const a = cons[j] * 3, b = cons[j + 1] * 3, rest = cons[j + 2], st = cons[j + 3];
        const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = ((len - rest) / len) * 0.5 * st;
        const pa = this.pinned[cons[j]], pb = this.pinned[cons[j + 1]];
        const wa = pa ? 0 : pb ? 2 : 1, wb = pb ? 0 : pa ? 2 : 1;
        p[a] += dx * diff * wa; p[a + 1] += dy * diff * wa; p[a + 2] += dz * diff * wa;
        p[b] -= dx * diff * wb; p[b + 1] -= dy * diff * wb; p[b + 2] -= dz * diff * wb;
      }
      this.applyTethers();
      this.collide();
    }
  }
  applyTethers() {
    const p = this.p, C = this.C;
    for (let i = C; i < this.N; i++) {
      const k = i * 3, c = (i % C) * 3, max = this.tether[i];
      const dx = p[k] - this.pins[c], dy = p[k + 1] - this.pins[c + 1], dz = p[k + 2] - this.pins[c + 2];
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > max) { const f = max / d; p[k] = this.pins[c] + dx * f; p[k + 1] = this.pins[c + 1] + dy * f; p[k + 2] = this.pins[c + 2] + dz * f; }
    }
  }
  collide() {
    const p = this.p, N = this.N, S = this.spheres, gy = this.groundY;
    for (let i = 0; i < N; i++) {
      if (this.pinned[i]) continue;
      const k = i * 3;
      for (let s = 0; s < S.length; s++) {
        const o = S[s];
        const dx = p[k] - o.x, dy = p[k + 1] - o.y, dz = p[k + 2] - o.z, rr = o.r * o.r, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < rr) { const d = Math.sqrt(d2) || 1e-6, f = o.r / d; p[k] = o.x + dx * f; p[k + 1] = o.y + dy * f; p[k + 2] = o.z + dz * f; }
      }
      if (p[k + 1] < gy) { p[k + 1] = gy; this.q[k] = THREE.MathUtils.lerp(this.q[k], p[k], 0.5); this.q[k + 2] = THREE.MathUtils.lerp(this.q[k + 2], p[k + 2], 0.5); }
    }
  }
  /** Advance with an accumulator at 60 Hz (max 4 sub-steps). */
  advance(dt, wind) {
    this.acc = Math.min(this.acc + dt, 4 / 60);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 4) { this.step(1 / 60, wind); this.acc -= 1 / 60; n++; }
    return n;
  }
}

// ------------------------------------------------------------------ hero cape (verlet + sway cross-fade)

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
/** Wind shelter (fractions of the wind magnitude, kitten frame): max forward push, constant backward trail. */
export const CAPE_WIND = Object.freeze({ front: 0.12, trail: 0.3 });

/** Collision spheres in kitten space (art.md §5: torso, legs, tail root; plus pauldrons and tassets). */
export const CAPE_COLLIDERS = Object.freeze([
  { j: 'chest', p: [0, 0.03, -0.03], r: 0.165 }, { j: 'chest', p: [0.17, 0.14, -0.01], r: 0.1 }, { j: 'chest', p: [-0.17, 0.14, -0.01], r: 0.1 },
  { j: 'hips', p: [0, -0.04, -0.01], r: 0.18 }, { j: 'thighL', p: [0, -0.08, 0], r: 0.075 }, { j: 'thighR', p: [0, -0.08, 0], r: 0.075 },
  { j: 'tail0', p: [0, 0, 0], r: 0.07 }, { j: 'head', p: [0, 0.12, -0.02], r: 0.2 },
]);

/**
 * Hero cape. Lives under the kitten root; simulates in world space.
 * Usage: cape.update(dt, { wind, speed }) after the rig is posed for the frame (matrixWorld up to date).
 */
export class HeroCape {
  /**
   * @param {object} o { style, rig, root, mode: 'verlet'|'sway', dims }
   */
  constructor(o) {
    this.rig = o.rig; this.root = o.root;
    this.d = { ...CAPE_DEFAULTS, ...(o.dims || {}) };
    this.sim = new ClothSim(this.d);
    this.geo = capeGeometry(this.d.cols, this.d.rows);
    this.mesh = new THREE.Mesh(this.geo, capeMaterial(o.style || 'red'));
    this.mesh.name = 'cape'; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.style = o.style || 'red';
    this.mode = o.mode || 'verlet';
    this.w = this.mode === 'sway' ? 1 : 0; this.wTarget = this.w; this.blendDur = 0.3;
    this.sway = { period: 3.8, gustPeak: 1.2, amp: 1, t: 0 };
    this.windMul = 1;
    this.restLocal = new Float32Array(this.sim.N * 3);
    this.colliders = (o.colliders || CAPE_COLLIDERS).map((c) => ({ ...c, w: { x: 0, y: 0, z: 0, r: c.r } }));
    this.sim.spheres = this.colliders.map((c) => c.w);
    this._initialised = false;
    this._lastRootPos = new THREE.Vector3();
    this.anchor = this.rig.capeAnchor;
    this._pinM = new THREE.Matrix4();
    this.pinLocal = [];
    for (let c = 0; c < this.d.cols; c++) this.pinLocal.push(drapePoint(c / (this.d.cols - 1), 0, this.d, new THREE.Vector3()));
  }
  setStyle(style) { this.style = style; this.mesh.material = capeMaterial(style); }
  /** 'verlet' | 'sway'. blend seconds (Meme Cam: 0.3 in, 0.6 out). */
  setMode(mode, { blend = 0.3, period, gustPeak, amp } = {}) {
    this.mode = mode; this.wTarget = mode === 'sway' ? 1 : 0; this.blendDur = Math.max(1e-3, blend);
    if (period) this.sway.period = period; if (gustPeak !== undefined) this.sway.gustPeak = gustPeak; if (amp) this.sway.amp = amp;
  }
  /** Seamless sway clock (Meme Cam syncs this with the camera/grass loop). */
  setSwayTime(t) { this.sway.t = t; }
  /** Snap the cloth to the current pose (call after teleports / cutscene cuts). */
  snap() { this._initialised = false; }
  _updatePins() {
    const C = this.d.cols;
    this.root.updateWorldMatrix(true, false);
    // pins are defined in kitten (bind) space: world = chestWorld * inverse(chestBind) * p
    this._pinM.multiplyMatrices(this.rig.chest.matrixWorld, _inv.copy(this.rig.chestBind).invert());
    for (let c = 0; c < C; c++) { _v.copy(this.pinLocal[c]).applyMatrix4(this._pinM); this.sim.pins[c * 3] = _v.x; this.sim.pins[c * 3 + 1] = _v.y; this.sim.pins[c * 3 + 2] = _v.z; }
    for (const c of this.colliders) {
      const j = this.rig.joints[c.j]; if (!j) continue;
      _v.set(c.p[0], c.p[1], c.p[2]).applyMatrix4(j.matrixWorld);
      const s = j.matrixWorld.getMaxScaleOnAxis();
      c.w.x = _v.x; c.w.y = _v.y; c.w.z = _v.z; c.w.r = c.r * s;
    }
    this.sim.groundY = this.root.getWorldPosition(_w).y + 0.012 * this.root.scale.y;
  }
  update(dt, { wind = null, speed = 0 } = {}) {
    if (!this.rig.chestBind) return;
    this._updatePins();
    if (!this._initialised) {
      this.sim.reset((v) => v.applyMatrix4(this._pinM));
      for (let i = 0; i < 90; i++) this.sim.step(1 / 60, null);
      this._initialised = true;
      this.root.getWorldPosition(this._lastRootPos);    // the reset already placed the cloth: no teleport shift
    }
    // detect teleports: large root jumps shift the cloth instead of whipping it
    const rp = this.root.getWorldPosition(_w);
    if (this._lastRootPos.distanceToSquared(rp) > 1.0) this.sim.shift(rp.x - this._lastRootPos.x, rp.y - this._lastRootPos.y, rp.z - this._lastRootPos.z);
    this._lastRootPos.copy(rp);
    // wind in world space, but the body shelters the front: in the kitten's frame the forward (+Z) part is cut to
    // CAPE_WIND.front of the magnitude and a small backward trail is added, so a tail wind never wraps the cape
    // over her face or legs (it billows sideways / behind like the refs instead).
    let wv = null;
    if (wind) {
      wv = _w.copy(wind).multiplyScalar(40 * this.windMul);
      const mag = wv.length();
      if (mag > 1e-4) {
        this.root.getWorldQuaternion(_q);
        wv.applyQuaternion(_q.invert());
        wv.z = Math.min(wv.z, mag * CAPE_WIND.front) - mag * CAPE_WIND.trail;
        wv.applyQuaternion(_q.invert());
      }
    }
    this.sim.advance(dt, wv);
    // blend weight
    const sgn = Math.sign(this.wTarget - this.w);
    if (sgn) this.w = clamp(this.w + (sgn * dt) / this.blendDur, 0, 1);
    this.sway.t += dt;
    this._write(speed);
  }
  _write(speed) {
    const pos = this.geo.attributes.position, C = this.d.cols, R = this.d.rows;
    _inv.copy(this.root.matrixWorld).invert();
    _m.multiplyMatrices(_inv, this._pinM); // kitten bind space -> root local, following the chest
    const w = smoothstep(0, 1, this.w);
    const T = this.sway.period, om = (Math.PI * 2) / T;
    const t = this.sway.t % T;
    const gust = 0.5 + 0.5 * Math.cos(om * (t - this.sway.gustPeak));
    const amp = this.sway.amp * (0.6 + 0.8 * gust);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c, k = i * 3;
      _v.set(this.sim.p[k], this.sim.p[k + 1], this.sim.p[k + 2]).applyMatrix4(_inv);
      if (w > 0) {
        const u = c / (C - 1), vv = r / (R - 1);
        drapePoint(u, vv, this.d, _w).applyMatrix4(_m);
        const kk = vv * vv;
        _w.z -= kk * (0.05 + speed * 0.18) + kk * gust * 0.07 * amp;
        _w.x += kk * Math.sin(om * 2 * t + vv * 4.0) * 0.028 * amp;
        _w.z += kk * Math.sin(om * 3 * t + u * 3.0) * 0.022 * amp;
        _w.y += kk * gust * 0.025 * amp;
        _v.lerp(_w, w);
      }
      pos.setXYZ(i, _v.x, _v.y, _v.z);
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
  dispose() { this.geo.dispose(); }
}

/**
 * NPC cape: static drape geometry + vertex sway material. Attach to the chest joint; `pinOffset` is the chest-local
 * position of the kitten-space drape origin (builder passes inverse(chestBind)).
 */
export function buildSwayCape(style = 'cream', dims = {}, toChest = null) {
  const d = { ...CAPE_DEFAULTS, ...dims };
  const g = capeGeometry(d.cols, d.rows);
  const pos = g.attributes.position, v = new THREE.Vector3();
  for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) {
    drapePoint(c / (d.cols - 1), r / (d.rows - 1), d, v);
    if (toChest) v.applyMatrix4(toChest);
    pos.setXYZ(r * d.cols + c, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, capeMaterial(style, { sway: true }));
  mesh.name = 'cape'; mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
}
