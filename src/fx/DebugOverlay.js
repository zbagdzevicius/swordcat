// src/fx/DebugOverlay.js  (owner: fx) — AUTOCAM §13 fx 2: the `?debug` framing overlay, ONE LineSegments draw:
//   footprint  the camera's visible ground quad (`cam.footprint.q`, else computed here from the lens: the same
//              ray → ground-plane routine as AUTOCAM §9.1), cream;
//   core       SafeFrame `core` (where she may stand; `herFrame` = core ∩ inner 75 %), mint;
//   fit        `cam.fitRect` / SafeFrame `threat` (where threats are framed), coral.
// Screen rects (normalised 0..1, y down) are projected onto the ground plane under the focus. Built only with
// `?debug`; never in a normal or `?test` run (0 draws there).
import * as THREE from 'three';

const MAX_SEG = 48;
const COLORS = Object.freeze({ footprint: '#FFF1D0', core: '#9BE3C4', her: '#FF8FB1', fit: '#FF9A3D' });

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _c = new THREE.Color();

/**
 * Ground hit of the ray through NDC (x, y) on the plane y = gy (AUTOCAM §9.1 `groundHit`; null when the ray misses).
 * @param {THREE.Camera} cam @param {number} x @param {number} y @param {number} gy @param {THREE.Vector3} out
 */
export function groundHit(cam, x, y, gy, out) {
  _o.copy(cam.position);
  _d.set(x, y, 0.5).unproject(cam).sub(_o).normalize();
  if (!(_d.y < -1e-4)) return null;
  const t = (gy - _o.y) / _d.y;
  return out.copy(_d).multiplyScalar(t).add(_o);
}

export class DebugOverlay {
  /** @param {any} ctx */
  constructor(ctx) { this.ctx = ctx; this.mesh = null; this.n = 0; this._q = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]; }

  init(scene) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX_SEG * 2 * 3); this.col = new Float32Array(MAX_SEG * 2 * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geometry = g;
    this.material = new THREE.LineBasicMaterial({ name: 'fx.debugFrame', vertexColors: true, depthTest: false, transparent: true, opacity: 0.9, fog: false });
    this.mesh = new THREE.LineSegments(g, this.material);
    this.mesh.name = 'fx.debugFrame';
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 20; this.mesh.visible = false;
    scene.add(this.mesh);
  }

  _seg(a, b, color) {
    if (this.n >= MAX_SEG) return;
    const i = this.n++ * 6, P = this.pos, C = this.col;
    _c.set(color);
    P[i] = a.x; P[i + 1] = a.y + 0.08; P[i + 2] = a.z; P[i + 3] = b.x; P[i + 4] = b.y + 0.08; P[i + 5] = b.z;
    C[i] = C[i + 3] = _c.r; C[i + 1] = C[i + 4] = _c.g; C[i + 2] = C[i + 5] = _c.b;
  }

  _quad(q, color) { for (let k = 0; k < 4; k++) this._seg(q[k], q[(k + 1) % 4], color); }

  /** A normalised screen rect {x0, y0, x1, y1} (y down) projected to the ground plane gy. */
  _rect(r, gy, color) {
    const cam = this.ctx.camera, q = this._q;
    if (!r || !cam) return;
    const xs = [r.x0, r.x1, r.x1, r.x0], ys = [r.y0, r.y0, r.y1, r.y1];
    for (let k = 0; k < 4; k++) if (!groundHit(cam, xs[k] * 2 - 1, 1 - ys[k] * 2, gy, q[k])) return;
    this._quad(q, color);
  }

  render() {
    if (!this.mesh) return;
    const ctx = this.ctx, cam = ctx.cam, camera = ctx.camera;
    this.n = 0;
    if (cam?.isIso && camera && ctx.game?.mode !== 'cutscene') {
      camera.updateMatrixWorld?.();
      const gy = cam.focus?.y ?? ctx.player?.pos?.y ?? 0, q = this._q, F = cam.footprint?.q;
      if (F && F.length >= 8) { for (let k = 0; k < 4; k++) q[k].set(F[k * 2], gy, F[k * 2 + 1]); this._quad(q, COLORS.footprint); }
      else {
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        let ok = true;
        for (let k = 0; k < 4; k++) if (!groundHit(camera, corners[k][0], corners[k][1], gy, q[k])) { ok = false; break; }
        if (ok) this._quad(q, COLORS.footprint);
      }
      const sf = cam.safeFrame;
      if (sf?.core) {
        this._rect(sf.core, gy, COLORS.core);
        const c = sf.core, w = (c.x1 - c.x0) * 0.125, h = (c.y1 - c.y0) * 0.125;
        this._rect({ x0: c.x0 + w, y0: c.y0 + h, x1: c.x1 - w, y1: c.y1 - h }, gy, COLORS.her);
      }
      this._rect(cam.fitRect ?? sf?.threat ?? null, gy, COLORS.fit);
    }
    this.geometry.setDrawRange(0, this.n * 2);
    this.geometry.attributes.position.needsUpdate = true; this.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = this.n > 0;
  }

  dispose() { this.mesh?.removeFromParent(); this.geometry?.dispose(); this.material?.dispose(); this.mesh = null; }
}
