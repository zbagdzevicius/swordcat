// src/enemies/lod.js  (owner: enemies) — PERF_SPEC §1.2 triangle budget for the rat horde: a low-poly LOD of every
// skinned enemy body, built once per source geometry with meshoptimizer's simplifier (shipped with three as
// `examples/jsm/libs/meshopt_simplifier.module.js`, loaded lazily in its own chunk) on the position-welded mesh, then
// rebuilt flat-shaded with exactly the source's attribute set: the swap is a geometry pointer change on the SkinnedMesh
// (same skeleton, same bind, same material program: no re-resolve). LODs are cached per source geometry (every rat of a
// type shares its body geometry, so the whole horde shares one LOD).
//
// Who swaps: EnemyManager at WARM.lod.hz — Low always draws the LOD (a phone screen cannot tell 4k from 1.7k tris on
// a 0.8 m rat), Med / High draw it beyond WARM.lod.far m from the iso focus or in activity tier ≥ 1. Bosses and
// scripted (cutscene) actors always draw full detail. The outline hull (look.js) is simplified the same way.
import * as THREE from 'three';
import { WARM } from './tuning.js';

/** @type {any} the meshopt simplifier once ready (null until then; `false` when unsupported) */
let _simp = null;
/** @type {Promise<any>|null} */
let _loading = null;

/**
 * Start loading the simplifier (idempotent; never throws). LODs are skipped until it is ready, so callers just call
 * `lodGeometry` and get null meanwhile.
 * @returns {Promise<boolean>} resolves true when ready
 */
export function loadSimplifier() {
  if (_simp) return Promise.resolve(true);
  if (_simp === false) return Promise.resolve(false);
  if (!_loading) {
    _loading = import('three/examples/jsm/libs/meshopt_simplifier.module.js')
      .then(async (mod) => {
        const S = mod.MeshoptSimplifier;
        if (!S || S.supported === false) { _simp = false; return false; }
        await S.ready;
        _simp = S;
        return true;
      })
      .catch((err) => { console.warn('[enemies] LOD simplifier unavailable', err); _simp = false; return false; });
  }
  return _loading;
}

/** Is the simplifier ready (LODs can be built synchronously)? */
export const simplifierReady = () => !!_simp;

/** source geometry → its LOD (or null when simplification did not pay off) */
const _lods = new WeakMap();

const _pa = new THREE.Vector3(), _pb = new THREE.Vector3(), _pc = new THREE.Vector3(), _fn = new THREE.Vector3(), _cn = new THREE.Vector3();

/**
 * A simplified copy of `geo` (pure apart from the simplifier): ~`ratio` of its triangles within `error` (relative to
 * the mesh extent), open borders locked so silhouettes never tear. Low-poly GLBs are flat-shaded (every face owns its
 * corners), which leaves an index-only simplifier nothing to collapse, so the mesh is first WELDED by position, the
 * welded topology simplified, and every output corner then takes the attributes (colour, uv, rmse, skin) of the
 * original vertex at that position whose normal best matches the new face, with the face's own flat normal (the toon
 * look of the source). Mirrored back copies (bake.js double-sided parts) are dropped before and re-emitted after.
 * The result has exactly the source's attribute set (names, item sizes, array types), so the material program is
 * unchanged. Returns null when not ready, too small, morph / multi-group geometry, or when it saves < 15 %.
 * `smooth` (outline hulls): an indexed welded mesh instead, one vertex per welded position (attributes of its first
 * original vertex) with area-weighted smooth normals; mirrored faces are not re-emitted.
 * @param {THREE.BufferGeometry} geo @param {number} [ratio] @param {number} [error] @param {{smooth?: boolean}} [opts]
 * @returns {THREE.BufferGeometry|null}
 */
export function simplifyGeometry(geo, ratio = WARM.lod.ratio, error = WARM.lod.error, opts = {}) {
  const S = _simp;
  const P = geo?.attributes?.position;
  if (!S || !P || P.count < 3 || Object.keys(geo.morphAttributes ?? {}).length || (geo.groups?.length ?? 0) > 1) return null;
  const n = P.count, I = geo.index, nIdx = I ? I.count : n - (n % 3);
  if (nIdx < 3 * 64) return null;                          // too small to bother
  const at = (i) => (I ? I.getX(i) : i);
  // 1. weld by position (0.1 mm grid)
  const weld = new Int32Array(n), keys = new Map(), wpos = [];
  for (let i = 0; i < n; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const k = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let w = keys.get(k);
    if (w === undefined) { w = wpos.length / 3; keys.set(k, w); wpos.push(x, y, z); }
    weld[i] = w;
  }
  const nw = wpos.length / 3;
  // candidates per welded vertex (CSR)
  const cStart = new Int32Array(nw + 1), cList = new Int32Array(n);
  for (let i = 0; i < n; i++) cStart[weld[i] + 1]++;
  for (let w = 0; w < nw; w++) cStart[w + 1] += cStart[w];
  const fill = cStart.slice(0, nw);
  for (let i = 0; i < n; i++) cList[fill[weld[i]]++] = i;
  // 2. welded triangles, degenerate and duplicate / mirrored faces dropped
  const tris = [], seen = new Set();
  let mirrored = 0;
  for (let t = 0; t < nIdx; t += 3) {
    const a = weld[at(t)], b = weld[at(t + 1)], c = weld[at(t + 2)];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((u, v) => u - v).join(',');
    if (seen.has(s)) { mirrored++; continue; }
    seen.add(s); tris.push(a, b, c);
  }
  const back = !opts.smooth && mirrored * 2 > tris.length / 3;   // most faces have a mirrored twin: a double-sided bake
  const src = new Uint32Array(tris);
  const target = Math.max(3, Math.floor((src.length * ratio) / 3) * 3);
  let out;
  try { [out] = S.simplify(src, new Float32Array(wpos), 3, target, error, ['LockBorder']); } catch { return null; }
  if (!out || out.length < 3) return null;
  const outTris = (out.length / 3) * (back ? 2 : 1);
  if (outTris > (nIdx / 3) * 0.85) return null;
  if (opts.smooth) return weldedSmooth(geo, out, wpos, cList, cStart);
  // 3. rebuild: per output corner the best-matching original vertex, flat face normals
  const N = geo.attributes.normal, names = Object.keys(geo.attributes), nv = outTris * 3;
  const dst = {};
  for (const k of names) {
    const a = geo.attributes[k], arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    dst[k] = new THREE.BufferAttribute(new arr.constructor(nv * a.itemSize), a.itemSize, a.normalized);
  }
  const pick = (w, nx, ny, nz) => {
    let best = cList[cStart[w]], bd = -Infinity;
    if (!N) return best;
    for (let j = cStart[w]; j < cStart[w + 1]; j++) {
      const i = cList[j], d = N.getX(i) * nx + N.getY(i) * ny + N.getZ(i) * nz;
      if (d > bd) { bd = d; best = i; }
    }
    return best;
  };
  let v = 0;
  const emit = (ws, sign) => {
    _pa.fromArray(wpos, ws[0] * 3); _pb.fromArray(wpos, ws[1] * 3); _pc.fromArray(wpos, ws[2] * 3);
    _fn.subVectors(_pc, _pb).cross(_cn.subVectors(_pa, _pb)).normalize().multiplyScalar(sign);
    const order = sign > 0 ? [0, 1, 2] : [0, 2, 1];
    for (const o of order) {
      const i = pick(ws[o], _fn.x, _fn.y, _fn.z);
      for (const k of names) {
        const s = geo.attributes[k], d = dst[k];
        if (k === 'normal') d.setXYZ(v, _fn.x, _fn.y, _fn.z);
        else for (let c = 0; c < s.itemSize; c++) d.setComponent(v, c, s.getComponent(i, c));
      }
      v++;
    }
  };
  const ws = [0, 0, 0];
  for (let t = 0; t < out.length; t += 3) {
    ws[0] = out[t]; ws[1] = out[t + 1]; ws[2] = out[t + 2];
    emit(ws, 1);
    if (back) emit(ws, -1);
  }
  const g = new THREE.BufferGeometry();
  for (const k of names) g.setAttribute(k, dst[k]);
  const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(nv);
  for (let i = 0; i < nv; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  if (!geo.boundingBox) geo.computeBoundingBox();
  g.boundingSphere = geo.boundingSphere.clone(); g.boundingBox = geo.boundingBox.clone();
  return g;
}

/** `simplifyGeometry`'s smooth output: used welded vertices only, smooth area-weighted normals. */
function weldedSmooth(geo, out, wpos, cList, cStart) {
  const names = Object.keys(geo.attributes), map = new Int32Array(wpos.length / 3).fill(-1);
  let nv = 0;
  for (let t = 0; t < out.length; t++) if (map[out[t]] < 0) map[out[t]] = nv++;
  const dst = {};
  for (const k of names) {
    const a = geo.attributes[k], arr = a.isInterleavedBufferAttribute ? a.data.array : a.array;
    dst[k] = new THREE.BufferAttribute(new arr.constructor(nv * a.itemSize), a.itemSize, a.normalized);
  }
  for (let w = 0; w < map.length; w++) {
    const v = map[w];
    if (v < 0) continue;
    const i = cList[cStart[w]];
    for (const k of names) { if (k === 'normal') continue; const s = geo.attributes[k]; for (let c = 0; c < s.itemSize; c++) dst[k].setComponent(v, c, s.getComponent(i, c)); }
  }
  const nrm = new Float32Array(nv * 3), idx = new (nv > 65535 ? Uint32Array : Uint16Array)(out.length);
  for (let t = 0; t < out.length; t += 3) {
    _pa.fromArray(wpos, out[t] * 3); _pb.fromArray(wpos, out[t + 1] * 3); _pc.fromArray(wpos, out[t + 2] * 3);
    _fn.subVectors(_pc, _pb).cross(_cn.subVectors(_pa, _pb));          // area-weighted (unnormalised)
    for (let k = 0; k < 3; k++) { const v = map[out[t + k]]; idx[t + k] = v; nrm[v * 3] += _fn.x; nrm[v * 3 + 1] += _fn.y; nrm[v * 3 + 2] += _fn.z; }
  }
  if (dst.normal) {
    for (let v = 0; v < nv; v++) { _fn.fromArray(nrm, v * 3).normalize(); dst.normal.setXYZ(v, _fn.x, _fn.y, _fn.z); }
  }
  const g = new THREE.BufferGeometry();
  for (const k of names) g.setAttribute(k, dst[k]);
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  g.boundingSphere = geo.boundingSphere.clone();
  return g;
}

/**
 * The cached LOD of `geo` (`simplifyGeometry`; null when not ready or not worth it, retried once the simplifier is
 * ready). Shared by every visual whose body uses `geo` and never disposed per enemy: it goes when its source is disposed
 * (the asset cache releasing the GLB at a level change) or through `disposeLod(geo)`.
 * @param {THREE.BufferGeometry} geo
 * @returns {THREE.BufferGeometry|null}
 */
export function lodGeometry(geo) {
  if (!geo || geo.userData?.enemyLod) return null;
  const hit = _lods.get(geo);
  if (hit !== undefined) return hit;
  if (!_simp) return null;                                // not cached: retried when ready
  const lod = simplifyGeometry(geo);
  if (lod) {
    lod.name = `${geo.name || 'enemy'}:lod1`;
    lod.userData.enemyLod = true;
    lod.userData.enemyBakedShared = true;                 // shared across the horde: never disposed with one visual
    geo.addEventListener('dispose', function onSrcDispose() {
      geo.removeEventListener('dispose', onSrcDispose);
      disposeLod(geo);
    });
  }
  _lods.set(geo, lod);
  return lod;
}

/** Free the LOD of `geo`. */
export function disposeLod(geo) {
  const lod = geo ? _lods.get(geo) : null;
  lod?.dispose();
  if (geo) _lods.delete(geo);
}

/** Skinned body meshes of a visual that take a LOD (not the hull, not hidden baked-away parts). */
function lodMeshes(root, out) {
  out.length = 0;
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !o.visible || o.userData.outline || o.name === 'outline') return;
    out.push(o);
  });
  return out;
}

const _list = [];

/**
 * Swap every skinned body of `root` to its LOD (`on`) or back to full detail. The meshes are found once per visual
 * and remembered on `root.userData.lodMeshes` (re-scanned when the visual's skinned set changes, e.g. after a bake).
 * Cheap when nothing changes (no allocation). Returns true when the visual draws its LOD.
 * @param {THREE.Object3D} root the enemy visual @param {boolean} on
 */
export function setVisualLod(root, on) {
  if (!root) return false;
  const ud = root.userData;
  if (ud.lodOn === on && ud.lodMeshes) return on;
  if (!ud.lodMeshes || ud.lodMeshes.some((m) => !m.parent)) ud.lodMeshes = lodMeshes(root, _list).slice();
  let any = false;
  for (const m of ud.lodMeshes) {
    const full = m.userData.lodFull ?? m.geometry;
    if (on) {
      const lod = lodGeometry(full);
      if (!lod) continue;
      m.userData.lodFull = full;
      if (m.geometry !== lod) m.geometry = lod;
      any = true;
    } else if (m.userData.lodFull && m.geometry !== m.userData.lodFull) m.geometry = m.userData.lodFull;
  }
  ud.lodOn = on && any;
  if (on && !any && !_simp) ud.lodMeshes = null;          // simplifier still loading: retry next pass
  return ud.lodOn;
}

/**
 * Should enemy `e` draw its LOD? (pure; exported for tests) Low: always; Med / High: beyond `far` m from `focus` (with
 * `hyst` m of hysteresis around the current state) or activity tier ≥ 1. Bosses / scripted actors: never.
 * @param {any} e enemy ({ pos, def, scripted, _tier }) @param {{x: number, z: number}|null} focus
 * @param {string} quality preset id @param {boolean} current the visual's current LOD state
 * @param {{far: number, hyst: number}} [L]
 */
export function wantsLod(e, focus, quality, current, L = WARM.lod) {
  if (!e || e.def?.boss || e.isBoss || e.scripted) return false;
  if (quality === 'low') return true;
  if (Number.isFinite(e._tier) && e._tier >= 1) return true;
  if (!focus || !e.pos) return false;
  const d = Math.hypot(e.pos.x - focus.x, e.pos.z - focus.z);
  return current ? d > L.far - L.hyst : d > L.far + L.hyst;
}
