// src/camera/Occluders.js  (owner: camera) — "tree fade" (tech.md §8: trees are faded, not collided):
// fadeable props that come between the camera and the subject (or swallow the camera) fade to
// CAMERA.treeFadeOpacity and back.
//
// Registration (world tags; the camera scans every loaded level on E.LEVEL_LOADED):
//   object.userData.camFade = true      Mesh, InstancedMesh (every instance), BatchedMesh (every instance), or a
//                                       Group (a GLB tree clone: all its meshes fade together as one unit)
//   batched.userData.camFadeIds = ids   BatchedMesh: only these instance ids (Array / Set of addInstance() ids)
//   batched.userData.camFade = (id) => bool   BatchedMesh / InstancedMesh: per-instance predicate
//   object.userData.camFade = false     never fade (overrides the name heuristic)
//   ctx.cam.addFadeable(obj) / removeFadeable(obj) / refreshFadeable(obj)   for props added after the level load
// Fallback heuristic: Mesh / InstancedMesh / small groups named like trees or foliage (never a BatchedMesh: one
// batch holds every prop of a level, so it must be tagged explicitly).
//
// How a faded unit is drawn (world materials and shaders are never patched):
//   Mesh           its material is swapped for a transparent clone while faded (restored after);
//   InstancedMesh  the instance gets a zero-scale matrix and a pooled single-instance InstancedMesh draws it
//                  transparently (same shader path, so instance-aware world shaders such as tree wind match);
//   BatchedMesh    the instance is hidden (setVisibleAt) and a pooled proxy draws the instance's geometry range
//                  (a view geometry sharing the batch's GPU buffers; views are never disposed for that reason).
// Occlusion test: segment (camera → subject points) vs the unit's per-part oriented boxes; big units (canopies)
// are refined against their real triangles so a wide canopy box doesn't fade a tree the line only passes under.
// Lens test: short segments from the camera through a grid of the view (~2 m deep) vs the boxes only, so a fence
// rail / post right in front of the lens fades even when the line to her slips between its rails.
// Tests run at CHECK_HZ; the fade itself animates every frame.
import * as THREE from 'three';

export const FADE_NAME = /(^|[^a-z])(tree|trees|pine|oak|birch|willow|fir|spruce|trunk|leaves|leaf|foliage|canopy|hedge)([^a-z]|$)/i;

/** Units with a bounding radius above this get the triangle-accurate refinement (m). */
export const PRECISE_RADIUS = 1.5;
/** Occlusion re-test rate (Hz). */
export const CHECK_HZ = 20;
/** Skip the triangle refinement for meshes heavier than this (box test only). */
const PRECISE_MAX_TRIS = 40000;

const _m = new THREE.Matrix4(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _color = new THREE.Color();
const _box = new THREE.Box3();
const _raycaster = new THREE.Raycaster();
const _hits = [];
const _rayDir = new THREE.Vector3();
let _scratch = null;          // lazily built Mesh used for the triangle refinement (DoubleSide: any face counts)

/**
 * Segment (a → b) vs axis-aligned box, slab method. True if any part of the segment is inside the box.
 * @param {{x:number,y:number,z:number}} a @param {{x:number,y:number,z:number}} b @param {THREE.Box3} box
 */
export function segmentHitsBox(a, b, box) {
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  // unrolled per axis (no per-call arrays: this runs for every candidate unit at CHECK_HZ)
  if (Math.abs(dx) < 1e-9) { if (a.x < box.min.x || a.x > box.max.x) return false; } else {
    let ta = (box.min.x - a.x) / dx, tb = (box.max.x - a.x) / dx;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  if (Math.abs(dy) < 1e-9) { if (a.y < box.min.y || a.y > box.max.y) return false; } else {
    let ta = (box.min.y - a.y) / dy, tb = (box.max.y - a.y) / dy;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (a.z < box.min.z || a.z > box.max.z) return false; } else {
    let ta = (box.min.z - a.z) / dz, tb = (box.max.z - a.z) / dz;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) return false;
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

function triCount(geo) {
  if (!geo) return 0;
  const n = geo.index ? geo.index.count : geo.attributes?.position?.count ?? 0;
  const dr = geo.drawRange;
  return Math.floor(Math.min(n, dr && Number.isFinite(dr.count) ? dr.count : n) / 3);
}

/** BatchedMesh instance ids that are alive (three r16x+ keeps `_instanceInfo`; else 0..instanceCount-1). */
function batchedIds(bm) {
  const info = bm._instanceInfo;
  const out = [];
  if (Array.isArray(info)) { for (let i = 0; i < info.length; i++) if (info[i]?.active !== false) out.push(i); }
  else { const n = bm.instanceCount ?? 0; for (let i = 0; i < n; i++) out.push(i); }
  return out;
}

/** Which instances of a tagged InstancedMesh / BatchedMesh fade. */
function instanceFilter(obj) {
  const ud = obj.userData ?? {};
  if (ud.camFadeIds != null) { const s = ud.camFadeIds instanceof Set ? ud.camFadeIds : new Set(ud.camFadeIds); return (i) => s.has(i); }
  if (typeof ud.camFade === 'function') return ud.camFade;
  return () => true;
}

export class OccluderFader {
  /** @param {{ minOpacity?: number, speed?: number, margin?: number, maxProxies?: number, checkHz?: number }} [opts] */
  constructor({ minOpacity = 0.3, speed = 7, margin = 0.15, maxProxies = 12, checkHz = CHECK_HZ } = {}) {
    this.minOpacity = minOpacity; this.speed = speed; this.margin = margin; this.maxProxies = maxProxies;
    this.checkInterval = checkHz > 0 ? 1 / checkHz : 0;
    /** @type {any[]} registered units (one per tagged mesh / group / instance) */
    this.units = [];
    /** units currently faded (f > 0) */
    this.active = new Set();
    this._roots = new Set();
    this._proxyParent = null;
    this._proxies = [];
    /** BatchedMesh → Map(geometryId → view geometry); never disposed (they share the batch's GPU buffers) */
    this._views = new WeakMap();
    this._checkT = 0;
    this.enabled = true;
    /** world AABBs of every registered part, built lazily by covers() (null = stale) @type {THREE.Box3[]|null} */
    this._aabbs = null;
  }

  get count() { return this.units.length; }
  get fadedCount() { let n = 0; for (const u of this.active) if (u.f > 0.05) n++; return n; }

  /** Register `obj` (and, for groups, all its meshes as one unit). Static props only (bounds are cached). */
  add(obj, parentForProxies = null) {
    if (!obj || this._roots.has(obj)) return 0;
    if (parentForProxies) this._proxyParent = parentForProxies;
    obj.updateWorldMatrix(true, true);
    const before = this.units.length;
    if (obj.isBatchedMesh) this._addBatched(obj, obj);
    else if (obj.isInstancedMesh) this._addInstanced(obj, obj);
    else if (obj.isMesh) this._addUnit(obj, [obj]);
    else {
      const meshes = [];
      obj.traverse((o) => {
        if (o.userData?.cameraOwned) return;
        if (o.isBatchedMesh) this._addBatched(o, obj);
        else if (o.isInstancedMesh) this._addInstanced(o, obj);
        else if (o.isMesh && o.visible !== false) meshes.push(o);
      });
      if (meshes.length) this._addUnit(obj, meshes);
    }
    if (this.units.length > before) { this._roots.add(obj); this._aabbs = null; }
    return this.units.length - before;
  }

  /** Unregister everything that came from `obj` (restoring it first). */
  remove(obj) {
    if (!this._roots.has(obj)) return;
    this._roots.delete(obj);
    this._aabbs = null;
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (u.root !== obj) continue;
      this._restore(u);
      this.active.delete(u);
      this.units.splice(i, 1);
    }
  }

  /** Re-register `obj` (its instances or matrices changed). */
  refresh(obj, parentForProxies = null) { this.remove(obj); return this.add(obj, parentForProxies); }

  /**
   * Find fadeables under a level root: `userData.camFade` / `camFadeIds`, else the name heuristic.
   * @param {THREE.Object3D} root @param {THREE.Object3D} proxyParent where proxies live (the scene)
   */
  scan(root, proxyParent) {
    if (!root) return 0;
    this._proxyParent = proxyParent ?? this._proxyParent;
    let n = 0;
    const visit = (o, named) => {
      const ud = o.userData;
      if (ud?.camFade === false || ud?.cameraOwned) return;
      if (ud?.camFade === true || ud?.camFadeIds != null || (typeof ud?.camFade === 'function' && (o.isBatchedMesh || o.isInstancedMesh))) { n += this.add(o); return; }
      if (o.isBatchedMesh) return;                                   // untagged batch: may hold houses, fences...
      const isNamed = named || FADE_NAME.test(o.name ?? '');
      if (isNamed && (o.isMesh || o.isInstancedMesh)) { n += this.add(o); return; }
      if (isNamed && o.children.length && o.children.every((c) => c.isMesh && !c.isInstancedMesh && !c.isBatchedMesh)) { n += this.add(o); return; }   // a tree group
      for (const c of o.children) visit(c, isNamed);
    };
    visit(root, false);
    return n;
  }

  /**
   * Is a static collider footprint (world AABB in XZ, top y1) the footprint of a registered fadeable part, i.e. it
   * lies inside one part's world box (+ `slack` m), covers at least a quarter of its ground area (so a crate under a
   * wide canopy doesn't count) and doesn't rise above it? Such colliders (fence rails, posts of
   * a `fade` prop set) must not pull the camera in: the camera fades the prop instead (tech.md §8).
   * @param {number} minX @param {number} maxX @param {number} minZ @param {number} maxZ @param {number} y1
   * @param {number} [slack]
   */
  covers(minX, maxX, minZ, maxZ, y1, slack = 0.25) {
    if (!this._aabbs) {
      this._aabbs = [];
      const m = this.margin;
      for (const u of this.units) for (const p of u.parts) {
        const b = p.box.clone().applyMatrix4(p.world);           // back to the prop's own extent (the box has the fade margin)
        b.min.x += m; b.min.z += m; b.max.x -= m; b.max.z -= m; b.max.y -= m;
        if (b.max.x < b.min.x) b.min.x = b.max.x = (b.min.x + b.max.x) / 2;
        if (b.max.z < b.min.z) b.min.z = b.max.z = (b.min.z + b.max.z) / 2;
        this._aabbs.push(b);
      }
    }
    const area = Math.max(0, maxX - minX) * Math.max(0, maxZ - minZ);
    for (const b of this._aabbs) {
      if (minX >= b.min.x - slack && maxX <= b.max.x + slack && minZ >= b.min.z - slack && maxZ <= b.max.z + slack
        && !(y1 > b.max.y + slack) && area >= 0.25 * (b.max.x - b.min.x) * (b.max.z - b.min.z)) return true;
    }
    return false;
  }

  /** Restore every faded prop and forget all registrations (level unload). */
  clear() {
    for (const u of this.units) this._restore(u);
    this.units.length = 0; this.active.clear(); this._roots.clear(); this._aabbs = null;
    for (const p of this._proxies) this._releaseProxy(p);
    this._checkT = 0;
  }

  dispose() {
    this.clear();
    for (const p of this._proxies) { p.mesh.removeFromParent(); p.mesh.material?.dispose?.(); if (p.instanced) p.mesh.dispose(); }
    this._proxies.length = 0;
  }

  // ------------------------------------------------------------------ registration
  /**
   * Add one part (a mesh, or one instance) to `unit`: local box (+ margin), world matrix, inverse, precise geometry.
   * @param {any} unit @param {THREE.Mesh} mesh @param {THREE.Box3} localBox @param {THREE.Matrix4} world
   * @param {THREE.BufferGeometry|null} rayGeo geometry for the triangle refinement (null = box only)
   */
  _part(unit, mesh, localBox, world, rayGeo) {
    if (!localBox || localBox.isEmpty()) return null;
    const sx = _a.setFromMatrixColumn(world, 0).length(), sy = _a.setFromMatrixColumn(world, 1).length(), sz = _a.setFromMatrixColumn(world, 2).length();
    if (sx < 1e-6 || sy < 1e-6 || sz < 1e-6) return null;
    const box = localBox.clone();
    box.min.x -= this.margin / sx; box.max.x += this.margin / sx;
    box.min.y -= this.margin / sy; box.max.y += this.margin / sy;
    box.min.z -= this.margin / sz; box.max.z += this.margin / sz;
    const sphere = box.getBoundingSphere(new THREE.Sphere()).applyMatrix4(world);
    const part = { mesh, box, world: world.clone(), inv: world.clone().invert(), index: -1, matrix: null, proxy: null, orig: null, faded: null,
      kind: 'mesh', geoId: -1, rayGeo: rayGeo && triCount(rayGeo) <= PRECISE_MAX_TRIS ? rayGeo : null, hidByUs: false };
    unit.parts.push(part);
    unit.center.add(sphere.center);
    unit._spheres.push(sphere);
    return part;
  }

  _newUnit(root) {
    return { root, parts: [], center: new THREE.Vector3(), radius: 0, f: 0, hit: false, precise: false, _spheres: [] };
  }

  _finishUnit(u) {
    if (!u.parts.length) return false;
    u.center.multiplyScalar(1 / u._spheres.length);
    let r = 0;
    for (const s of u._spheres) r = Math.max(r, u.center.distanceTo(s.center) + s.radius);
    u.radius = r; u._spheres = null;
    u.precise = r > PRECISE_RADIUS && u.parts.every((p) => !!p.rayGeo);
    this.units.push(u);
    return true;
  }

  _addUnit(root, meshes) {
    const u = this._newUnit(root);
    for (const m of meshes) {
      const g = m.geometry;
      if (!g) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      this._part(u, m, g.boundingBox, m.matrixWorld, m.isSkinnedMesh ? null : g);
    }
    this._finishUnit(u);
  }

  _addInstanced(inst, root) {
    const n = inst.count ?? 0;
    const g = inst.geometry;
    if (!g) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const want = instanceFilter(inst);
    for (let i = 0; i < n; i++) {
      if (!want(i)) continue;
      inst.getMatrixAt(i, _m);
      if (_m.elements[0] === 0 && _m.elements[5] === 0 && _m.elements[10] === 0) continue;   // hidden slot
      const local = _m.clone();
      const world = _m.premultiply(inst.matrixWorld);
      const u = this._newUnit(root);
      const part = this._part(u, inst, g.boundingBox, world, g);
      if (part) { part.kind = 'inst'; part.index = i; part.matrix = local; part.base = inst.matrixWorld.clone(); }
      this._finishUnit(u);
    }
  }

  _addBatched(bm, root) {
    if (typeof bm.getGeometryIdAt !== 'function') return;
    const want = instanceFilter(bm);
    const boxes = new Map();
    for (const i of batchedIds(bm)) {
      if (!want(i)) continue;
      let geoId;
      try { geoId = bm.getGeometryIdAt(i); } catch { continue; }
      if (!(geoId >= 0)) continue;
      let lb = boxes.get(geoId);
      if (lb === undefined) { lb = bm.getBoundingBoxAt(geoId, new THREE.Box3()); boxes.set(geoId, lb); }
      if (!lb) continue;
      bm.getMatrixAt(i, _m);
      const world = _m.premultiply(bm.matrixWorld);
      const u = this._newUnit(root);
      const part = this._part(u, bm, lb, world, this._view(bm, geoId));
      if (part) { part.kind = 'batch'; part.index = i; part.geoId = geoId; }
      this._finishUnit(u);
    }
  }

  /** A geometry that draws one geometry range of a BatchedMesh (shares its attributes and index). */
  _view(bm, geoId) {
    let views = this._views.get(bm);
    if (!views) { views = new Map(); this._views.set(bm, views); }
    let g = views.get(geoId);
    if (g) return g;
    const src = bm.geometry;
    if (!src?.attributes?.position) return null;
    g = new THREE.BufferGeometry();
    g.name = 'cam:batchView';
    for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
    if (src.index) g.setIndex(src.index);
    const r = bm.getGeometryRangeAt(geoId);
    g.setDrawRange(r.start, r.count);
    g.boundingBox = bm.getBoundingBoxAt(geoId, new THREE.Box3());
    g.boundingSphere = bm.getBoundingSphereAt?.(geoId, new THREE.Sphere()) ?? g.boundingBox.getBoundingSphere(new THREE.Sphere());
    g.userData.camFadeView = true;            // shares GPU buffers with the batch: never dispose()
    views.set(geoId, g);
    return g;
  }

  // ------------------------------------------------------------------ per frame
  /**
   * @param {number} dt @param {THREE.Vector3} camPos @param {THREE.Vector3[]} targets subject points (chest, head)
   * @param {number} [nTargets]
   * @param {THREE.Vector3[]} [lens] end points of short "lens" segments (camera → a grid of points ~2 m into the view):
   *   any fadeable whose (margin-grown) box they touch fades, box test only, so a fence rail or post right in front of
   *   the lens fades even when the sight line to the subject slips between its rails
   * @param {number} [nLens]
   */
  update(dt, camPos, targets, nTargets = targets.length, lens = null, nLens = lens ? lens.length : 0) {
    if (!this.units.length) return;
    this._checkT -= dt;
    const check = this._checkT <= 0;
    if (check) this._checkT = this.checkInterval;
    const k = 1 - Math.exp(-this.speed * dt);
    for (const u of this.units) {
      if (check) u.hit = this.enabled && (this._occludes(u, camPos, targets, nTargets) || this._nearLens(u, camPos, lens, nLens));
      const hit = u.hit;
      if (!hit && u.f <= 0) continue;
      const target = hit ? 1 : 0;
      u.f += (target - u.f) * k;
      if (!hit && u.f < 0.02) u.f = 0;
      if (hit && u.f > 0.98) u.f = 1;
      if (u.f > 0) { this.active.add(u); this._applyFade(u); }
      else { this._restore(u); this.active.delete(u); }
    }
  }

  /** Does the unit block the segment camera → any subject point? */
  _occludes(u, camPos, targets, nTargets) {
    for (let t = 0; t < nTargets; t++) {
      const p = targets[t];
      if (distSqPointSegment(u.center, camPos, p) > u.radius * u.radius) continue;    // broad phase
      for (const part of u.parts) {
        _b.copy(camPos).applyMatrix4(part.inv);
        _c.copy(p).applyMatrix4(part.inv);
        if (!segmentHitsBox(_b, _c, part.box)) continue;
        if (!u.precise || this._segmentHitsTriangles(part, camPos, p)) return true;
      }
    }
    return false;
  }

  /** Does any lens segment (camera → lens[i]) touch one of the unit's part boxes? (no triangle refinement) */
  _nearLens(u, camPos, lens, nLens) {
    if (!lens || !nLens) return false;
    for (let t = 0; t < nLens; t++) {
      const p = lens[t];
      if (distSqPointSegment(u.center, camPos, p) > u.radius * u.radius) continue;
      for (const part of u.parts) {
        _b.copy(camPos).applyMatrix4(part.inv);
        _c.copy(p).applyMatrix4(part.inv);
        if (segmentHitsBox(_b, _c, part.box)) return true;
      }
    }
    return false;
  }

  /** Triangle-accurate test of the world segment a → b against a part's geometry (any face side). */
  _segmentHitsTriangles(part, a, b) {
    const geo = part.rayGeo;
    if (!geo) return true;
    if (!_scratch) { _scratch = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })); _scratch.matrixAutoUpdate = false; }
    _rayDir.subVectors(b, a);
    const len = _rayDir.length();
    if (len < 1e-6) return false;
    _scratch.geometry = geo;
    _scratch.matrixWorld.copy(part.world);
    _raycaster.set(a, _rayDir.multiplyScalar(1 / len));
    _raycaster.near = 0; _raycaster.far = len + this.margin;
    _hits.length = 0;
    _scratch.raycast(_raycaster, _hits);
    const hit = _hits.length > 0;
    _hits.length = 0;
    return hit;
  }

  _applyFade(u) {
    const op = 1 - u.f * (1 - this.minOpacity);
    for (const part of u.parts) {
      const mesh = part.mesh;
      if (part.kind === 'inst' || part.kind === 'batch') {
        if (!part.proxy) {
          if (part.kind === 'batch' && !this._batchVisible(part)) continue;     // culled / hidden by world: nothing to fade
          part.proxy = this._takeProxy(part);
          if (!part.proxy) continue;                   // pool exhausted: leave it opaque
          this._hideSource(part);
        } else if (part.kind === 'batch' && part.hidByUs) mesh.setVisibleAt(part.index, false);   // world may have re-shown it
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

  _batchVisible(part) {
    try { return part.mesh.getVisibleAt(part.index) !== false; } catch { return false; }
  }

  _hideSource(part) {
    const mesh = part.mesh;
    if (part.kind === 'inst') { mesh.setMatrixAt(part.index, _zero); mesh.instanceMatrix.needsUpdate = true; return; }
    try { mesh.setVisibleAt(part.index, false); part.hidByUs = true; } catch { part.hidByUs = false; }
  }

  _showSource(part) {
    const mesh = part.mesh;
    if (part.kind === 'inst') { mesh.setMatrixAt(part.index, part.matrix); mesh.instanceMatrix.needsUpdate = true; return; }
    if (part.hidByUs) { try { mesh.setVisibleAt(part.index, true); } catch { /* instance deleted meanwhile */ } }
    part.hidByUs = false;
  }

  _restore(u) {
    for (const part of u.parts) {
      if (part.kind === 'inst' || part.kind === 'batch') {
        if (part.proxy) {
          this._showSource(part);
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

  /**
   * A pooled transparent proxy that draws one part. Instanced sources get a single-instance InstancedMesh (same
   * USE_INSTANCING shader path: world shaders that read instanceMatrix / instanceColor, e.g. the tree wind phase,
   * render identically); batch instances get a Mesh on a view of the batch geometry.
   */
  _takeProxy(part) {
    if (!this._proxyParent) return null;
    const instanced = part.kind === 'inst';
    let p = this._proxies.find((x) => !x.used && x.instanced === instanced);
    if (!p) {
      if (this._proxies.length >= this.maxProxies) {
        const i = this._proxies.findIndex((x) => !x.used);          // recycle an idle proxy of the other kind
        if (i < 0) return null;
        const old = this._proxies[i];
        old.mesh.removeFromParent(); old.mesh.material?.dispose?.();
        if (old.instanced) old.mesh.dispose();                       // its own instance buffers only
        this._proxies.splice(i, 1);
      }
      const mesh = instanced ? new THREE.InstancedMesh(undefined, new THREE.MeshBasicMaterial(), 1) : new THREE.Mesh(undefined, new THREE.MeshBasicMaterial());
      mesh.matrixAutoUpdate = false; mesh.name = 'cam:fadeProxy';
      mesh.userData.cameraOwned = true;
      mesh.frustumCulled = false;
      p = { mesh, used: false, instanced };
      this._proxies.push(p);
    }
    const src = part.mesh, mesh = p.mesh;
    const geo = part.kind === 'batch' ? this._view(src, part.geoId) : src.geometry;
    if (!geo) return null;
    const srcMat = Array.isArray(src.material) ? src.material[0] : src.material;
    mesh.material?.dispose?.();
    mesh.material = fadeableMaterial(srcMat) ? makeFadeMaterial(srcMat) : new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    mesh.geometry = geo;
    if (instanced) {
      mesh.setMatrixAt(0, part.matrix); mesh.instanceMatrix.needsUpdate = true;
      if (src.instanceColor) mesh.setColorAt(0, _color.fromBufferAttribute(src.instanceColor, part.index));
      else if (mesh.instanceColor) mesh.setColorAt(0, _color.setRGB(1, 1, 1));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.matrix.copy(part.base);
    } else {
      if (part.kind === 'batch' && mesh.material.color) { try { src.getColorAt(part.index, _color); mesh.material.color.multiply(_color); } catch { /* no colours */ } }
      mesh.matrix.copy(part.world);
    }
    mesh.matrixWorld.copy(mesh.matrix);
    mesh.castShadow = src.castShadow; mesh.receiveShadow = src.receiveShadow;
    mesh.visible = true;
    p.used = true;
    if (mesh.parent !== this._proxyParent) this._proxyParent.add(mesh);
    return p;
  }

  _releaseProxy(p) {
    if (!p.used) return;
    p.used = false;
    p.mesh.visible = false;
  }
}
