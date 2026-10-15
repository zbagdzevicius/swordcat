// src/enemies/rig.js  (owner: enemies) — helpers to dress fitted GLB clones: attach props to bones in the model's
// bind pose (so gear placed in metres in the enemy's +Z-forward frame follows the animated bone), mount KayKit
// weapons natively on `handslot.*`, recolour materials by name, and collect materials for the hit flash.
import * as THREE from 'three';
import { findNode } from '../core/Assets.js';
import { getToonMaterial, releaseToonMaterial, makeToonMaterial } from '../characters/materials.js';

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
      if (m?.emissive && m.userData?.enemyOwned && !m.userData.enemyToon && !out.some((x) => x.mat === m)) out.push({ mat: m, base: m.emissive.clone(), baseI: m.emissiveIntensity ?? 1 });
    }
  });
  return out;
}

/**
 * Dispose per-instance GPU resources under `root`: owned materials and the bone textures of SkeletonUtils-cloned
 * skeletons (each clone gets its own Skeleton; its boneTexture is never freed otherwise). Never shared prop
 * materials or cached GLB geometry.
 */
export function disposeInstanceMaterials(root) {
  if (!root) return;
  const hull = root.userData?.hull;
  if (hull) { hull.userData.dispose?.(); root.userData.hull = null; }   // the outline hull (look.buildEnemyHull)
  const skeletons = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.userData?.enemyOwned) continue;
      if (m.userData.enemyToon) releaseToonMaterial(m);   // pooled (ART D17): the next enemy of the type reuses it
      else m.dispose();
    }
  });
  for (const s of skeletons) s.dispose();
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

// ------------------------------------------------------------------ warm look (ART_WARM_SPEC §7.2 / §7.3)
/**
 * Static bone scales (ART §7.2 "cute-menacing" proportions: rat Head ×1.45, crow Head ×1.35, Fuzzball abdomen ×1.5...).
 * Values are the NET factor each listed bone should end up with relative to its bind pose; a listed ancestor's factor
 * is divided out (Rat: Body ×1.1 then Head ×1.45 net, not 1.1 × 1.1 × 1.45). Only rigs without scale tracks (or with
 * them stripped, `stripConstantScaleTracks`) keep these: the mixer never writes `.scale` on them. Hitboxes and the
 * MODEL_FIT heights are untouched (call after dressing so gear on a bone grows with it). Names accept the sanitised
 * form (`FrontLeg.L` → `FrontLegL`). Idempotent per bone. Returns the number of bones scaled.
 * @param {THREE.Object3D} root @param {Record<string, number|number[]>} table
 */
export function scaleBones(root, table) {
  if (!root || !table) return 0;
  const want = new Map();
  for (const [name, v] of Object.entries(table)) {
    const s = Array.isArray(v) ? v : [v, v, v];
    want.set(name, s);
    want.set(THREE.PropertyBinding.sanitizeNodeName(name), s);
  }
  let n = 0;
  const walk = (o, ix, iy, iz) => {
    let nx = ix, ny = iy, nz = iz;
    const w = want.get(o.name);
    if (w) {
      if (!o.userData.warmScaled) {
        o.scale.x *= w[0] / ix; o.scale.y *= w[1] / iy; o.scale.z *= w[2] / iz;
        o.userData.warmScaled = true;
        n++;
      }
      nx = w[0]; ny = w[1]; nz = w[2];
    }
    for (const c of o.children) walk(c, nx, ny, nz);
  };
  walk(root, 1, 1, 1);
  root.updateMatrixWorld(true);
  return n;
}

/** Clips already processed by stripConstantScaleTracks (the GLB cache shares them between every instance). */
const _stripped = new WeakSet();

/**
 * ART §7.3 step 4: drop `.scale` tracks whose every value is ≈ 1 (KayKit carries ~2,500 of them). They are no-ops on a
 * unit rest pose but cost mixer time and would overwrite static bone scales. Non-unit or animated scale tracks stay.
 * Idempotent per clip; mutates the (shared, cached) clips once, before any mixer binds them. Returns tracks removed.
 * @param {THREE.AnimationClip[]} clips @param {number} [eps]
 */
export function stripConstantScaleTracks(clips, eps = 1e-4) {
  let removed = 0;
  for (const c of clips ?? []) {
    if (!c?.tracks || _stripped.has(c)) continue;
    _stripped.add(c);
    const keep = [];
    for (const t of c.tracks) {
      if (t.name.endsWith('.scale')) {
        const v = t.values;
        let unit = true;
        for (let i = 0; i < v.length; i++) if (Math.abs(v[i] - 1) > eps) { unit = false; break; }
        if (unit) { removed++; continue; }
      }
      keep.push(t);
    }
    if (keep.length !== c.tracks.length) c.tracks = keep;
  }
  return removed;
}

const _lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
/** sRGB bytes of a colour (texture pixels are sRGB; getHex() leaves the linear working space). */
const _hex = (h) => { const n = new THREE.Color(h).getHex(); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

/**
 * Nearest-swatch remap of RGBA pixels in place (ART §7.3 / art_1 §5.4): every pixel within `tol` (RGB distance) of a
 * source swatch becomes that swatch's target plus the pixel's luminance offset from the swatch (shading survives).
 * Pixels near no swatch are kept. Pure; exported for tests. Returns the number of pixels changed.
 * @param {Uint8Array|Uint8ClampedArray} data RGBA @param {[string, string][]} pairs [[srcHex, dstHex]] @param {number} [tol]
 */
export function remapPixels(data, pairs, tol = 28) {
  const src = pairs.map(([s]) => _hex(s)), dst = pairs.map(([, d]) => _hex(d));
  const srcL = src.map(([r, g, b]) => _lum(r, g, b));
  const t2 = tol * tol;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let best = -1, bd = t2 + 1;
    for (let k = 0; k < src.length; k++) {
      const dr = r - src[k][0], dg = g - src[k][1], db = b - src[k][2], d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0 || bd > t2) continue;
    const off = _lum(r, g, b) - srcL[best], D = dst[best];
    data[i] = Math.max(0, Math.min(255, Math.round(D[0] + off)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(D[1] + off)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(D[2] + off)));
    n++;
  }
  return n;
}

/**
 * Hue-band recolour of RGBA pixels in place, for painted atlases with soft gradients (KayKit `*_texture.png`): a pixel
 * whose HSV hue lies in a band's [h0, h1] (degrees, wrapping when h0 > h1) with saturation in `s` and value in `v`
 * becomes the band's target colour scaled by its luminance relative to the band's reference colour (shading kept).
 * The first matching band wins. Pure; exported for tests. Returns the number of pixels changed.
 * @param {Uint8Array|Uint8ClampedArray} data
 * @param {{h: [number, number], s?: [number, number], v?: [number, number], ref: string, to: string}[]} bands
 */
export function recolorBands(data, bands) {
  const B = bands.map((b) => { const ref = _hex(b.ref); return { h: b.h, s: b.s ?? [0, 1], v: b.v ?? [0, 1], refL: Math.max(1, _lum(ref[0], ref[1], ref[2])), to: _hex(b.to) }; });
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, v = mx / 255, s = mx > 0 ? d / mx : 0;
    let h = 0;
    if (d > 0) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    for (let k = 0; k < B.length; k++) {
      const q = B[k];
      const inH = q.h[0] <= q.h[1] ? h >= q.h[0] && h <= q.h[1] : h >= q.h[0] || h <= q.h[1];
      if (!inH || s < q.s[0] || s > q.s[1] || v < q.v[0] || v > q.v[1]) continue;
      const kL = _lum(r, g, b) / q.refL;
      data[i] = Math.min(255, Math.round(q.to[0] * kL));
      data[i + 1] = Math.min(255, Math.round(q.to[1] * kL));
      data[i + 2] = Math.min(255, Math.round(q.to[2] * kL));
      n++;
      break;
    }
  }
  return n;
}

/** Remapped textures, keyed `tex.uuid|key` (one per (asset, palette); every instance shares it). */
const _remapCache = new Map();

/**
 * ART §7.3 step 2: a palette-remapped copy of `tex` (`map.pairs` nearest-swatch with `map.tol`, and / or `map.bands`
 * hue bands), cached by `tex.uuid|key`; same wrap, flipY and colour space as the source, `NearestFilter` mag for
 * swatch-only atlases. Works on image-backed textures (browser: drawn once through a 2D canvas) and on data textures
 * (`image.data`: node tests). Returns `tex` unchanged when there is nothing to read (no canvas, tainted image).
 * @param {THREE.Texture} tex @param {{pairs?: [string, string][], tol?: number, bands?: object[]}} map @param {string} key
 * @returns {THREE.Texture}
 */
export function remapPaletteTexture(tex, map, key) {
  if (!tex?.image || !map) return tex;
  const ck = `${tex.uuid}|${key}`;
  const hit = _remapCache.get(ck);
  if (hit) return hit;
  const img = tex.image, w = img.width, h = img.height;
  let out = null;
  try {
    if (img.data && w && h) {                                       // DataTexture-like (node tests, procedural atlases)
      const data = new Uint8Array(img.data);
      if (map.pairs) remapPixels(data, map.pairs, map.tol ?? 28);
      if (map.bands) recolorBands(data, map.bands);
      out = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
    } else {
      const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h)
        : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
      const g = cv?.getContext('2d', { willReadFrequently: true });
      if (!g || !w || !h) return tex;
      g.drawImage(img, 0, 0);
      const id = g.getImageData(0, 0, w, h);
      if (map.pairs) remapPixels(id.data, map.pairs, map.tol ?? 28);
      if (map.bands) recolorBands(id.data, map.bands);
      g.putImageData(id, 0, 0);
      out = new THREE.CanvasTexture(cv);
    }
  } catch (err) {
    console.warn(`[enemies] palette remap ${key} failed`, err);
    return tex;
  }
  out.name = `${tex.name || 'atlas'}|${key}`;
  out.flipY = tex.flipY; out.colorSpace = tex.colorSpace; out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  out.minFilter = tex.minFilter; out.magFilter = map.pairs && !map.bands ? THREE.NearestFilter : tex.magFilter;
  out.generateMipmaps = tex.generateMipmaps; out.anisotropy = tex.anisotropy;
  out.needsUpdate = true;
  out.userData.remapOf = tex.uuid;
  _remapCache.set(ck, out);
  return out;
}

/** Drop every cached remap (tests; a full asset flush). */
export function clearPaletteCache() { for (const t of _remapCache.values()) t.dispose(); _remapCache.clear(); }

/**
 * ART §7.3: swap every textured material's map under `root` (this instance's own clones only) for its remapped copy.
 * Returns the number of materials changed.
 * @param {THREE.Object3D} root @param {object} map a PALETTE_MAPS entry @param {string} key
 */
export function applyPalette(root, map, key) {
  if (!root || !map) return 0;
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.map || !m.userData?.enemyOwned || m.map.userData?.remapOf) continue;
      const t = remapPaletteTexture(m.map, map, key);
      if (t !== m.map) { m.map = t; m.needsUpdate = true; n++; }
    }
  });
  return n;
}

/**
 * PERF §3.5 / §7 (E3, E6): an enemy casts sun shadows only through its body (skinned meshes and its weapon), each with
 * its kind's shared depth material; `on = false` (shadow stage 2, or no shadow map on this tier) turns casting off
 * entirely (fx contact blobs carry the grounding). Gear marked `userData.sharedProp` / `noCast` never casts, and a mesh
 * its builder made a non-caster (silhouettes, clones) stays one: the first call remembers each mesh's own setting.
 * @param {THREE.Object3D} root @param {boolean} on @param {((o: THREE.Object3D) => THREE.Material)|null} [depthFor]
 */
export function setCasting(root, on, depthFor = null) {
  if (!root) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.userData.castBase === undefined) o.userData.castBase = !!o.castShadow;
    const cast = on && o.userData.castBase && !o.userData.sharedProp && !o.userData.noCast;
    o.castShadow = cast;
    if (cast && depthFor && !o.customDepthMaterial) o.customDepthMaterial = depthFor(o);
  });
}

// ------------------------------------------------------------------ toon materials (ART §5.1 / §7.3 step 3, X28)

/** 1×1 white map: solid-colour GLB materials take the toon `map` path (flat rmse) with their own `color`. */
let _white = null;
function whiteMap() {
  if (_white) return _white;
  _white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  _white.colorSpace = THREE.SRGBColorSpace;
  _white.needsUpdate = true;
  return _white;
}

/** Is `m` a GLB material this pass converts (lit, opaque, not glowing, not already toon / top-tinted / shared)? */
export function toonable(m) {
  if (!m || !m.userData?.enemyOwned || m.userData.toon || m.userData.enemyToon || m.userData.topTint) return false;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return false;
  if (m.transparent || m.alphaTest > 0 || m.emissiveMap) return false;
  const e = m.emissive;
  return !(e && (e.r + e.g + e.b) * (m.emissiveIntensity ?? 1) > 0.15);   // glowing eyes / runes keep their look
}

/**
 * ART §7.3 step 3 / X28: every loaded enemy mesh takes a pooled per-actor toon material (`getToonMaterial`, the shared
 * `sc-toon` program: no compile, per-actor `uFlash` / `uHighlight` without clones) in place of its GLB standard
 * material. Meshes sharing one GLB material share one toon material (a hit flashes the whole body). Solid-colour
 * materials keep their colour (white map + `color`); atlas materials keep their (palette-remapped) map. The GLB
 * material clones are disposed; the toon ones go back to their pool in disposeInstanceMaterials.
 * PERF §1.2: every converted material is DoubleSide (single pass), so a type never splits the toon program into a
 * front and a double variant; shared (not instance-owned) lit GLB gear such as a mounted weapon takes a shared toon
 * material per source material (`sharedToon`; no flash, never pooled or disposed per enemy) instead of keeping a
 * Standard program of its own.
 * @param {THREE.Object3D} root @param {string} typeKey e.g. 'rat_pike' @returns {number} materials converted
 */
export function toonify(root, typeKey) {
  if (!root) return 0;
  // TT3: the low-poly animal GLBs (rats, Grizzlechop, spider, crow) read faceted under the toon ramp: smooth their
  // skinned bodies' normals once per shared geometry (positions untouched)
  if (SMOOTH_TYPES.test(typeKey ?? '')) root.traverse((o) => { if (o.isSkinnedMesh && !o.userData.sharedProp) smoothNormals(o.geometry); });
  const done = new Map();
  root.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    const one = !Array.isArray(o.material), list = one ? [o.material] : o.material.slice();
    let changed = false;
    const kind = o.isSkinnedMesh ? 'skinned' : o.isInstancedMesh ? 'instanced' : 'plain';
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (!toonable(src)) {
        if (!sharedToonable(src)) continue;
        list[i] = sharedToon(src, kind); changed = true;
        continue;
      }
      let t = done.get(src);
      if (!t) {
        const map = src.map ?? whiteMap();
        t = getToonMaterial(`${typeKey}:${kind}:${src.name || 'mat'}${src.map ? '' : ':' + src.color.getHexString()}`, map);
        t.color.copy(src.map ? WHITE : src.color);
        t.side = THREE.DoubleSide; t.forceSinglePass = true;
        t.name = 'enemy-toon:' + (src.name || typeKey);
        t.userData.enemyOwned = true;
        t.userData.enemyToon = true;
        done.set(src, t);
      }
      list[i] = t; changed = true;
    }
    if (changed) o.material = one ? list[0] : list;
  });
  for (const src of done.keys()) src.dispose();
  return done.size;
}

/** Enemy types whose GLB bodies get smooth normals (TT3). */
export const SMOOTH_TYPES = /^(rat_|boss_grizzlechop|spider|crow)/;

/**
 * Average the normals of every vertex that shares a position (welded by a 1e-4 m key), in place, once per geometry
 * (`userData.smoothNormals`). Flat-shaded low-poly bodies turn soft without a topology change. Returns vertices touched.
 * @param {THREE.BufferGeometry} g
 */
export function smoothNormals(g) {
  const P = g?.attributes?.position, N = g?.attributes?.normal;
  if (!P || !N || g.userData.smoothNormals) return 0;
  g.userData.smoothNormals = true;
  const key = new Int32Array(P.count), ids = new Map();
  for (let i = 0; i < P.count; i++) {
    const k = `${Math.round(P.getX(i) * 1e4)},${Math.round(P.getY(i) * 1e4)},${Math.round(P.getZ(i) * 1e4)}`;
    let id = ids.get(k); if (id === undefined) ids.set(k, (id = ids.size)); key[i] = id;
  }
  // area-weighted face normals summed per welded position
  const acc = new Float32Array(ids.size * 3), I = g.index, t = I ? I.count : P.count;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f + 2 < t; f += 3) {
    const i0 = I ? I.getX(f) : f, i1 = I ? I.getX(f + 1) : f + 1, i2 = I ? I.getX(f + 2) : f + 2;
    a.fromBufferAttribute(P, i0); b.fromBufferAttribute(P, i1); c.fromBufferAttribute(P, i2);
    c.sub(b); a.sub(b); c.cross(a);
    for (const i of [i0, i1, i2]) { const o = key[i] * 3; acc[o] += c.x; acc[o + 1] += c.y; acc[o + 2] += c.z; }
  }
  for (let i = 0; i < P.count; i++) {
    const o = key[i] * 3; a.set(acc[o], acc[o + 1], acc[o + 2]);
    if (a.lengthSq() < 1e-20) continue;
    a.normalize();
    // keep the winding's side: a normal that would flip against the old one keeps the old one
    b.fromBufferAttribute(N, i);
    if (a.dot(b) < 0) continue;
    N.setXYZ(i, a.x, a.y, a.z);
  }
  N.needsUpdate = true;
  return P.count;
}

/** A shared (asset-cache) lit GLB material that would otherwise keep a program of its own (weapons, shared gear). */
export function sharedToonable(m) {
  if (!m || m.userData?.enemyOwned || m.userData?.toon || m.userData?.topTint || m.userData?.sharedToon) return false;
  if (!(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial)) return false;
  if (m.transparent || m.alphaTest > 0 || m.emissiveMap) return false;
  const e = m.emissive;
  return !(e && (e.r + e.g + e.b) * (m.emissiveIntensity ?? 1) > 0.15);
}

const _sharedToon = new Map();
/**
 * The shared toon twin of a shared GLB material, per mesh kind (PERF §3.5: never share one material across kinds).
 * @param {THREE.Material} src @param {'plain'|'skinned'|'instanced'} kind @returns {THREE.Material}
 */
export function sharedToon(src, kind) {
  const key = src.uuid + '|' + kind;
  let t = _sharedToon.get(key);
  if (!t) {
    t = makeToonMaterial({ map: src.map ?? whiteMap(), kind, side: THREE.DoubleSide });
    t.forceSinglePass = true;
    t.color.copy(src.map ? WHITE : src.color);
    t.name = 'enemy-toon:' + (src.name || 'shared');
    t.userData.sharedToon = true;
    _sharedToon.set(key, t);
  }
  return t;
}
const WHITE = new THREE.Color(1, 1, 1);
