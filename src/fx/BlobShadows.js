// src/fx/BlobShadows.js  (owner: fx) — PERF_SPEC §7.2 / ART_WARM_SPEC §3.4: the ONE instanced contact-blob pool
// (64 slots, 1 draw). A soft plum disc (`TONE.blob` #5A4E7A, α 0.35, never black) under every actor that asks for one,
// shrinking and fading with its height above the ground: the clearest height cue from above, and what grounds actors
// once they stop casting sun shadows (K5, shadow stage 2). It serves CONTROLS_SPEC §5.4's airborne blob and §7.3's
// contact blobs; GroundDecals draws no blobs.
//
// Registration: `fx.blobs.add(object3dOrActor, radius)` / `fx.blobs.remove(object3dOrActor)` (characters, enemies,
// companions, large projectiles). Until an area registers its own, two automatic sets keep today's look: alerted /
// nearby enemies (Low: alerted only) and the heroine while she is airborne (her KittenBuilder blob rides up with her).
// Per rendered frame, tier-0 actors only (`cam.activityOf`, else ≤ 20 m from her): g = ground under it, h = clamp(y −
// g, 0, 3), scale = r × 2 × (1 − h / 6), alpha = 1 − h / 4. No allocation per frame.
import * as THREE from 'three';
import { FX_COLORS } from './palette.js';
import { fxShaderMaterial } from './shaders.js';

export const BLOB = Object.freeze({ max: 64, alpha: 0.35, mul: 1.1, range: 20, autoMax: 16, heroLift: 0.4, lift: 0.02 });

/** Blob scale (diameter m) and alpha for radius `r` at height `h` above the ground (pure; unit-tested). */
export function blobShape(r, h) {
  const k = Math.max(0, Math.min(3, h));
  return { size: r * 2 * (1 - k / 6), alpha: 1 - k / 4 };
}

const VERT = /* glsl */`
attribute float aAlpha;
varying vec2 vUv;
varying float vA;
void main() {
  vUv = uv; vA = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4( position, 1.0 );
}`;
const FRAG = /* glsl */`
uniform vec3 uCol;
uniform float uA;
varying vec2 vUv;
varying float vA;
void main() {
  float r = length( vUv - 0.5 ) * 2.0;
  float a = ( 1.0 - smoothstep( 0.55, 1.0, r ) ) * vA * uA;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uCol, a );
  #include <colorspace_fragment>
}`;

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

export class BlobShadows {
  /** @param {any} ctx */
  constructor(ctx) {
    this.ctx = ctx;
    this.mesh = null;
    /** explicit registrations: object3d → { obj, r, actor } */
    this.reg = new Map();
    this.count = 0;
    this.auto = true;          // the automatic enemy / airborne-hero blobs (off once every area registers its own)
  }

  init(scene) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(BLOB.max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = fxShaderMaterial({
      name: 'fx.blobs', vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uCol: { value: new THREE.Color(this.ctx.env?.TONE?.blob ?? FX_COLORS.blob) }, uA: { value: BLOB.alpha } },
    });
    mat.userData.noHeightFog = true;
    this.mesh = new THREE.InstancedMesh(geo, mat, BLOB.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.name = 'fx.blobs';
    this.mesh.renderOrder = 1; this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /**
   * Register a blob under `target` (an Object3D or an actor) of radius `r` m (default: the actor's radius × 1.1).
   * Registered actors are no longer covered by the automatic set. Returns a remover.
   */
  add(target, r = 0) {
    const obj = target?.object3d ?? target;
    if (!obj?.isObject3D) return () => {};
    const actor = target?.object3d ? target : null;
    this.reg.set(obj, { obj, r: r > 0 ? r : (actor?.radius ?? 0.35) * BLOB.mul, actor });
    return () => this.remove(target);
  }

  /** Drop a registration. */
  remove(target) { const obj = target?.object3d ?? target; if (obj) this.reg.delete(obj); }

  has(target) { return this.reg.has(target?.object3d ?? target); }

  clear() { this.reg.clear(); this.count = 0; if (this.mesh) { this.mesh.count = 0; this.mesh.visible = false; } }

  /** Ground height under (x, z) near y (top surfaces first, then the terrain). */
  _gy(x, z, y) {
    const ph = this.ctx.physics;
    const v = ph?.groundAt?.(x, z, y + 0.6) ?? ph?.topAt?.(x, z) ?? ph?.heightAt?.(x, z);
    return Number.isFinite(v) ? v : y;
  }

  /** Is this actor near enough to draw (camera activity tier 0, else within range of her)? */
  _near(a, p) {
    const cam = this.ctx.cam;
    if (typeof cam?.activityOf === 'function') return cam.activityOf(a) === 0;
    if (!p) return true;
    return Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z) <= BLOB.range;
  }

  _put(x, y, z, r, onGround) {
    if (this.count >= BLOB.max) return;
    const g = onGround ? y : this._gy(x, z, y), h = Math.max(0, y - g);
    const b = blobShape(r, h);
    if (!(b.alpha > 0.01) || !(b.size > 0.02)) return;
    const ph = this.ctx.physics;
    if (ph?.normalAt) { ph.normalAt(x, z, _n); if (!(_n.y >= 0.5)) _n.copy(_UP); } else _n.copy(_UP);
    _q.setFromUnitVectors(_UP, _n);
    _p.set(x, g + BLOB.lift, z);
    _s.set(b.size, 1, b.size);
    _m.compose(_p, _q, _s);
    const i = this.count++;
    this.mesh.setMatrixAt(i, _m);
    this.alpha.setX(i, b.alpha);
  }

  /** Per rendered frame. */
  render() {
    if (!this.mesh) return;
    this.count = 0;
    const ctx = this.ctx, p = ctx.player;
    // explicit registrations
    for (const e of this.reg.values()) {
      const o = e.obj, a = e.actor;
      if (!o.parent || o.visible === false || (a && (a.alive === false || a.hidden))) continue;
      if (a && a.pos && !this._near(a, p)) continue;
      o.updateWorldMatrix(true, false);
      _p.setFromMatrixPosition(o.matrixWorld);
      this._put(_p.x, _p.y, _p.z, e.r, a?.onGround === true);
    }
    if (this.auto) {
      // enemies (Low: alerted ones only), capped
      const list = ctx.enemies?.list, low = (ctx.quality?.particles ?? 2000) < 1000;
      let n = 0;
      if (list) for (const e of list) {
        if (n >= BLOB.autoMax) break;
        if (!e?.pos || e.alive === false || e.hidden || !e.object3d || e.object3d.visible === false || this.reg.has(e.object3d) || (low && !e.alerted)) continue;
        if (!this._near(e, p)) continue;
        const pos = e.object3d.position;
        this._put(pos.x, pos.y, pos.z, Math.max(0.25, (e.radius ?? 0.4) * BLOB.mul), e.onGround !== false);
        n++;
      }
      // the heroine while airborne (her own blob climbs with her): the soft landing disc under her
      if (p?.pos && p.alive !== false && !p.onGround && !this.reg.has(p.object3d)) {
        const pos = p.object3d?.position ?? p.pos, g = this._gy(pos.x, pos.z, pos.y);
        if (pos.y - g > BLOB.heroLift) this._put(pos.x, pos.y, pos.z, 0.5, false);
      }
    }
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    if (this.count) { this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true; }
  }

  dispose() {
    this.clear();
    this.mesh?.removeFromParent(); this.mesh?.geometry.dispose(); this.mesh?.material.dispose();
    this.mesh = null;
  }
}
