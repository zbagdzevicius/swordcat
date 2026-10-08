// src/enemies/rig.js  (owner: enemies) — helpers to dress fitted GLB clones: attach props to bones in the model's
// bind pose (so gear placed in metres in the enemy's +Z-forward frame follows the animated bone), mount KayKit
// weapons natively on `handslot.*`, recolour materials by name, and collect materials for the hit flash.
import * as THREE from 'three';
import { findNode } from '../core/Assets.js';

const _a = new THREE.Matrix4();
const _b = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Node by glTF name (accepts the sanitised form: `FrontLeg.R` → `FrontLegR`). */
export function bone(root, name) { return name ? findNode(root, name) : null; }

/**
 * Parent `obj` to `node` so that, in the model's CURRENT pose (call before the mixer runs = bind pose), it sits at
 * `pos` / `rot` (Euler XYZ) / `scale` expressed in `space`'s frame (the fitted model root: metres, +Z forward).
 * @param {THREE.Object3D} space @param {THREE.Object3D} node @param {THREE.Object3D} obj
 * @param {{pos?: number[], rot?: number[], scale?: number}} [t]
 */
export function attachAligned(space, node, obj, t = {}) {
  space.updateMatrixWorld(true);
  _a.copy(space.matrixWorld).invert().multiply(node.matrixWorld);        // node in space coords
  const sc = t.scale ?? 1;
  _b.compose(_p.set(...(t.pos ?? [0, 0, 0])), _q.setFromEuler(_e.set(...(t.rot ?? [0, 0, 0]))), _s.set(sc, sc, sc));
  _a.invert().multiply(_b);
  _a.decompose(obj.position, obj.quaternion, obj.scale);
  node.add(obj);
  return obj;
}

/**
 * Mount `obj` (already sized in `space` units, e.g. a fitted weapon root) on `node` with the node's own orientation
 * and origin (KayKit weapons are authored for `handslot.*`), compensating the node's scale.
 */
export function mountNative(space, node, obj, { pos = [0, 0, 0], rot = [0, 0, 0] } = {}) {
  space.updateMatrixWorld(true);
  _a.copy(space.matrixWorld).invert().multiply(node.matrixWorld);
  _a.decompose(_p, _q, _s);
  obj.position.set(pos[0] / _s.x, pos[1] / _s.y, pos[2] / _s.z);
  obj.quaternion.setFromEuler(_e.set(...rot));
  obj.scale.set(obj.scale.x / _s.x, obj.scale.y / _s.y, obj.scale.z / _s.z);
  node.add(obj);
  return obj;
}

/** Position of `node` in `space` coordinates (bind pose before the mixer runs). */
export function posIn(space, node, out = new THREE.Vector3()) {
  space.updateMatrixWorld(true);
  _a.copy(space.matrixWorld).invert().multiply(node.matrixWorld);
  return out.setFromMatrixPosition(_a);
}

/**
 * Set material colours by material name (materials must already be per-instance: assets.model cloneMaterials).
 * @param {THREE.Object3D} root @param {Record<string, string>} byName
 */
export function recolor(root, byName) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      const c = byName[m.name];
      if (c && m.color) m.color.set(c);
    }
  });
}

/** Multiply every material colour under `root` by `tint` (materials must be per-instance). */
export function tintAll(root, tint) {
  const t = new THREE.Color(tint);
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m.color) m.color.multiply(t);
  });
}

/**
 * Materials under `root` that can flash (have `emissive`): only this instance's own materials (`markOwned`), never
 * shared ones (prop gear, characters' beast-head materials), so a hit never flashes every enemy at once.
 */
export function flashMaterials(root, out = []) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m?.emissive && m.userData?.enemyOwned && !out.some((x) => x.mat === m)) out.push({ mat: m, base: m.emissive.clone(), baseI: m.emissiveIntensity ?? 1 });
    }
  });
  return out;
}

/** Dispose per-instance materials under `root` (never shared prop materials or cached GLB geometry). */
export function disposeInstanceMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.userData?.enemyOwned) m.dispose();
  });
}

/** Mark the per-instance materials of a fresh model so dispose() frees them. */
export function markOwned(root) {
  root.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) m.userData.enemyOwned = true;
  });
}

const _qa = new THREE.Quaternion();

/** Keep `obj` upright (yaw = the actor's facing) while it follows its animated parent bone (cages, bags). */
export function keepUpright(e, obj) {
  (e.uprightProps ??= []).push(obj);
}

/** Per-frame upright fix (Enemy.render calls it). */
export function applyUpright(e) {
  const list = e.uprightProps;
  if (!list?.length) return;
  e.object3d.getWorldQuaternion(_qa);
  for (const o of list) {
    if (!o.parent || !o.visible) continue;
    o.parent.updateWorldMatrix(true, false);
    o.parent.getWorldQuaternion(_q);
    o.quaternion.copy(_q.invert().multiply(_qa));
  }
}
