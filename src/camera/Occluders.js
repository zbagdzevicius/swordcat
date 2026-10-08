// src/camera/Occluders.js  (owner: camera) — "tree fade" (tech.md §8: trees are faded, not collided):
// fadeable props that come between the camera and the subject (or swallow the camera) fade to
// CAMERA.treeFadeOpacity and back.
//
// Registration (world tags; the camera scans every loaded level):
//   object.userData.camFade = true      Mesh, InstancedMesh, or a Group (a GLB tree clone: all its meshes fade together)
//   object.userData.camFade = false     never fade (overrides the name heuristic)
//   ctx.cam.addFadeable(obj) / removeFadeable(obj)   for props added after the level load
// Fallback heuristic: objects (or their ancestors below the level root) named like trees/foliage.
//
// Mesh: its material is swapped for a transparent clone while faded (restored after).
// InstancedMesh: the occluding instance is hidden (zero-scale matrix) and drawn by a pooled transparent proxy
// mesh with the same geometry, so world materials and shaders are never patched.
import * as THREE from 'three';

export const FADE_NAME = /(^|[^a-z])(tree|trees|pine|oak|birch|willow|fir|spruce|trunk|leaves|leaf|foliage|canopy|hedge)([^a-z]|$)/i;

const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();

/**
 * Segment (a → b) vs axis-aligned box, slab method. True if any part of the segment is inside the box.
 * @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b @param {THREE.Box3} box
 */
export function segmentHitsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z], o = [a.x, a.y, a.z];
  const mn = [box.min.x, box.min.y, box.min.z], mx = [box.max.x, box.max.y, box.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return false; continue; }
    let ta = (mn[i] - o[i]) / d[i], tb = (mx[i] - o[i]) / d[i];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return false;
  }
  return true;
}

/** Squared distance from point p to segment a–b. */
export function distSqPointSegment(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 0 ? ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = a.x + abx * t - p.x, dy = a.y + aby * t - p.y, dz = a.z + abz * t - p.z;
  return dx * dx + dy * dy + dz * dz;
}

/** A material we can fade by opacity (built-in materials and ShaderMaterials with an `opacity` uniform). */
function fadeableMaterial(m) {
  return !!m && (!m.isShaderMaterial || !!m.uniforms?.opacity);
}

function makeFadeMaterial(m) {
  const f = m.clone();
  if (m.onBeforeCompile) f.onBeforeCompile = m.onBeforeCompile;         // keep world patches (height fog...)
  if (m.customProgramCacheKey) f.customProgramCacheKey = m.customProgramCacheKey;
  f.transparent = true;
  f.depthWrite = false;
  f.userData = { ...m.userData, camFadeClone: true, baseOpacity: m.opacity ?? 1 };
  return f;
}

function setOpacity(mat, v) {
  if (mat.isShaderMaterial && mat.uniforms?.opacity) mat.uniforms.opacity.value = v;
  mat.opacity = v;
}

export class OccluderFader {
  /** @param {{ minOpacity?: number, speed?: number, margin?: number, maxProxies?: number }} [opts] */
  constructor({ minOpacity = 0.3, speed = 7, margin = 0.15, maxProxies = 12 } = {}) {
    this.minOpacity = minOpacity; this.speed = speed; this.margin = margin; this.maxProxies = maxProxies;
    /** @type {any[]} registered units (one per tagged mesh / group / instance) */
    this.units = [];
    /** units currently faded (f > 0) */
    this.active = new Set();
    this._roots = new Set();
    this._proxyParent = null;
    this._proxies = [];
    this.enabled = true;
  }

  get count() { return this.units.length; }
  get fadedCount() { let n = 0; for (const u of this.active) if (u.f > 0.05) n++; return n; }

  /** Register `obj` (and, for groups, all its meshes as one unit). Static props only (bounds are cached). */
  add(obj, parentForProxies = null) {
    if (!obj || this._roots.has(obj)) return 0;
    if (parentForProxies) this._proxyParent = parentForProxies;
    obj.updateWorldMatrix(true, true);
    const before = this.units.length;
    if (obj.isInstancedMesh) this._addInstanced(obj, obj);
    else if (obj.isMesh) this._addUnit(obj, [obj]);
    else {
      const meshes = [];
      obj.traverse((o) => {
        if (o.isInstancedMesh) this._addInstanced(o, obj);
        else if (o.isMesh && o.visible !== false) meshes.push(o);
      });
      if (meshes.length) this._addUnit(obj, meshes);
    }
    if (this.units.length > before) this._roots.add(obj);
    return this.units.length - before;
  }

  /** Unregister everything that came from `obj` (restoring it first). */
  remove(obj) {
    if (!this._roots.has(obj)) return;
    this._roots.delete(obj);
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.root !== obj) continue;
      this._restore(u);
      this.active.delete(u);
      this.units.splice(i, 1);
    }
  }

  /**
   * Find fadeables under a level root: `userData.camFade === true`, else the name heuristic.
   * @param {THREE.Object3D} root @param {THREE.Object3D} proxyParent where proxies live (the scene)
   */
  scan(root, proxyParent) {
    if (!root) return 0;
    this._proxyParent = proxyParent ?? this._proxyParent;
    let n = 0;
    const visit = (o, named) => {
      if (o.userData?.camFade === false) return;
      if (o.userData?.cameraOwned) return;
      if (o.userData?.camFade === true) { n += this.add(o); return; }
      const isNamed = named || FADE_NAME.test(o.name ?? '');
      if (isNamed && (o.isMesh || o.isInstancedMesh)) { n += this.add(o); return; }
      if (isNamed && o.children.length && o.children.every((c) => c.isMesh && !c.isInstancedMesh)) { n += this.add(o); return; }   // a tree group
      for (const c of o.children) visit(c, isNamed);
    };
    visit(root, false);
    return n;
  }

  /** Restore every faded prop and forget all registrations (level unload). */
  clear() {
    for (const u of this.units) this._restore(u);
    this.units.length = 0; this.active.clear(); this._roots.clear();
    for (const p of this._proxies) this._releaseProxy(p);
  }

  dispose() {
    this.clear();
    for (const p of this._proxies) { p.mesh.removeFromParent(); p.mesh.material?.dispose?.(); }
    this._proxies.length = 0;
  }

  // ------------------------------------------------------------------ registration
  _bounds(mesh, matrixWorld, unit) {
    const g = mesh.geometry;
    if (!g) return false;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingBox || g.boundingBox.isEmpty()) return false;
    const box = g.boundingBox.clone();
    const sx = _a.setFromMatrixColumn(matrixWorld, 0).length(), sy = _a.setFromMatrixColumn(matrixWorld, 1).length(), sz = _a.setFromMatrixColumn(matrixWorld, 2).length();
    if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) return false;
    box.min.x -= this.margin / sx; box.max.x += this.margin / sx;
    box.min.y -= this.margin / sy; box.max.y += this.margin / sy;
    box.min.z -= this.margin / sz; box.max.z += this.margin / sz;
    const inv = matrixWorld.clone().invert();
    const sphere = box.getBoundingSphere(new THREE.Sphere()).applyMatrix4(matrixWorld);
    unit.parts.push({ mesh, box, inv, index: -1, matrix: null, proxy: null, orig: null, faded: null });
    unit.center.add(sphere.center.multiplyScalar(1));
    unit.radius = Math.max(unit.radius, sphere.radius);
    unit._spheres.push(sphere);
    return true;
  }

  _newUnit(root) {
    return { root, parts: [], center: new THREE.Vector3(), radius: 0, f: 0, hit: false, _spheres: [] };
  }

  _finishUnit(u) {
    if (!u.parts.length) return false;
    u.center.multiplyScalar(1 / u._spheres.length);
    let r = 0;
    for (const s of u._spheres) r = Math.max(r, u.center.distanceTo(s.center) + s.radius);
    u.radius = r; u._spheres = null;
    this.units.push(u);
    return true;
  }

  _addUnit(root, meshes) {
    const u = this._newUnit(root);
    for (const m of meshes) this._bounds(m, m.matrixWorld, u);
    this._finishUnit(u);
  }

  _addInstanced(inst, root) {
    const n = inst.count ?? 0;
    for (let i = 0; i < n; i++) {
      inst.getMatrixAt(i, _m);
      const local = _m.clone();
      const world = _m.premultiply(inst.matrixWorld).clone();
      const u = this._newUnit(root);
      if (this._bounds(inst, world, u)) {
        const part = u.parts[u.parts.length - 1];
        part.index = i; part.matrix = local;
      }
      this._finishUnit(u);
    }
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {number} dt @param {THREE.Vector3} camPos @param {THREE.Vector3[]} targets subject points (chest, head)
   * @param {number} [nTargets]
   */
  update(dt, camPos, targets, nTargets = targets.length) {
    if (!this.units.length) return;
    const k = 1 - Math.exp(-this.speed * dt);
    for (const u of this.units) {
      let hit = false;
      if (this.enabled) {
        for (let t = 0; t < nTargets && !hit; t++) {
          const p = targets[t];
          // broad phase: unit sphere vs segment camera → subject
          if (distSqPointSegment(u.center, camPos, p) > u.radius * u.radius) continue;
          for (const part of u.parts) {
            _b.copy(camPos).applyMatrix4(part.inv);
            _c.copy(p).applyMatrix4(part.inv);
            if (segmentHitsBox(_b, _c, part.box)) { hit = true; break; }
          }
        }
      }
      u.hit = hit;
      if (!hit && u.f <= 0) continue;
      const target = hit ? 1 : 0;
      u.f += (target - u.f) * k;
      if (!hit && u.f < 0.02) u.f = 0;
      if (hit && u.f > 0.98) u.f = 1;
      if (u.f > 0) { this.active.add(u); this._applyFade(u); }
      else { this._restore(u); this.active.delete(u); }
    }
  }

  _applyFade(u) {
    const op = 1 - u.f * (1 - this.minOpacity);
    for (const part of u.parts) {
      const mesh = part.mesh;
      if (part.index >= 0) {
        if (!part.proxy) {
          part.proxy = this._takeProxy(mesh, part);
          if (!part.proxy) continue;                   // pool exhausted: leave it opaque
          mesh.setMatrixAt(part.index, _zero);
          mesh.instanceMatrix.needsUpdate = true;
        }
        setOpacity(part.proxy.mesh.material, (part.proxy.mesh.material.userData.baseOpacity ?? 1) * op);
        continue;
      }
      if (!part.faded) {
        const m = mesh.material;
        if (Array.isArray(m)) {
          if (!m.every(fadeableMaterial)) { part.orig = m; part.faded = 'hide'; continue; }
          part.orig = m; part.faded = m.map(makeFadeMaterial);
        } else if (!fadeableMaterial(m)) { part.orig = m; part.faded = 'hide'; }
        else { part.orig = m; part.faded = makeFadeMaterial(m); }
        if (part.faded !== 'hide') mesh.material = part.faded;
      }
      if (part.faded === 'hide') { mesh.visible = u.f < 0.5; continue; }
      const list = Array.isArray(part.faded) ? part.faded : [part.faded];
      for (const fm of list) setOpacity(fm, (fm.userData.baseOpacity ?? 1) * op);
    }
  }

  _restore(u) {
    for (const part of u.parts) {
      if (part.index >= 0) {
        if (part.proxy) {
          part.mesh.setMatrixAt(part.index, part.matrix);
          part.mesh.instanceMatrix.needsUpdate = true;
          this._releaseProxy(part.proxy);
          part.proxy = null;
        }
        continue;
      }
      if (!part.faded) continue;
      if (part.faded === 'hide') part.mesh.visible = true;
      else {
        part.mesh.material = part.orig;
        const list = Array.isArray(part.faded) ? part.faded : [part.faded];
        for (const fm of list) fm.dispose();
      }
      part.faded = null; part.orig = null;
    }
    u.f = 0;
  }

  _takeProxy(inst, part) {
    let p = this._proxies.find((x) => !x.used);
    if (!p) {
      if (this._proxies.length >= this.maxProxies || !this._proxyParent) return null;
      const mesh = new THREE.Mesh(inst.geometry, new THREE.MeshBasicMaterial());
      mesh.matrixAutoUpdate = false; mesh.name = 'cam:fadeProxy';
      mesh.userData.cameraOwned = true;
      p = { mesh, used: false };
      this._proxies.push(p);
    }
    const src = Array.isArray(inst.material) ? inst.material[0] : inst.material;
    p.mesh.material?.dispose?.();
    p.mesh.material = fadeableMaterial(src) ? makeFadeMaterial(src) : new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    if (inst.instanceColor && p.mesh.material.color) {
      _color.fromBufferAttribute(inst.instanceColor, part.index);
      p.mesh.material.color.multiply(_color);
    }
    p.mesh.geometry = inst.geometry;
    p.mesh.matrix.multiplyMatrices(inst.matrixWorld, part.matrix);
    p.mesh.matrixWorld.copy(p.mesh.matrix);
    p.mesh.castShadow = inst.castShadow; p.mesh.receiveShadow = inst.receiveShadow;
    p.mesh.visible = true;
    p.used = true;
    if (p.mesh.parent !== this._proxyParent) this._proxyParent.add(p.mesh);
    return p;
  }

  _releaseProxy(p) {
    if (!p.used) return;
    p.used = false;
    p.mesh.visible = false;
  }
}
