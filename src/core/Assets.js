// src/core/Assets.js  (owner: core) — GLTF/texture/HDR cache, model fitting, per-level preload.
// tech.md §17 + GAME_DESIGN §18.1 (fitToHeight is mandatory for every GLB; MODEL_FIT in config).
//
//   const m = await ctx.assets.model('models/creatures/polypizza/Rat.glb', { fit: 1.6, hide: [...] });
//   actor.object3d.add(m.root);           // feet at y = 0, facing +Z, height 1.6 m
//   const anim = new Animator(m.root, m.animations);   // core/Animator.js
//
// Constructing Assets touches no DOM (node-safe); loading obviously needs a browser.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { MODEL_FIT } from './config.js';
import { E } from './events.js';
import { levelAssets, normalizeAssetPath } from './manifests.js';

/** Vite base URL ('./' in builds). */
export function baseUrl() {
  try { return import.meta.env.BASE_URL ?? './'; } catch { return './'; }
}

/** Public URL of an asset path relative to public/assets/. */
export function assetUrl(path) { return baseUrl() + 'assets/' + normalizeAssetPath(path); }

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _m = new THREE.Matrix4();
const PRECISE_MAX_VERTS = 60000;

/**
 * World-space AABB of the VISIBLE meshes under `object` (bone-deformed for skinned meshes), skipping any
 * node whose name is in `exclude` (and its children). Call on detached objects (templates, fresh clones).
 * @param {THREE.Object3D} object @param {{exclude?: Iterable<string>}} [opts] @param {THREE.Box3} [out]
 */
export function measure(object, { exclude = [] } = {}, out = new THREE.Box3()) {
  out.makeEmpty();
  const skip = exclude instanceof Set ? exclude : new Set(exclude);
  object.updateMatrixWorld(true);
  const visit = (o) => {
    if (!o.visible || skip.has(o.name)) return;
    if ((o.isMesh || o.isSkinnedMesh) && o.geometry?.attributes?.position) {
      const pos = o.geometry.attributes.position;
      if (pos.count <= PRECISE_MAX_VERTS && !o.isInstancedMesh) {
        for (let i = 0; i < pos.count; i++) { o.getVertexPosition(i, _v); _v.applyMatrix4(o.matrixWorld); out.expandByPoint(_v); }
      } else {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); out.union(_box);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(object);
  return out;
}

/**
 * Find a node by its glTF name. three's GLTFLoader sanitises names (PropertyBinding.sanitizeNodeName strips
 * `[ ] . : /`), so `handslot.r` becomes `handslotr` and `FrontLeg.L` becomes `FrontLegL`; this accepts either.
 * @param {THREE.Object3D} root @param {string} name
 */
export function findNode(root, name) {
  return root.getObjectByName(name) ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name)) ?? null;
}

/** Extent of `box` along 'x' | 'y' | 'z' | 'max'. */
export function extentOf(box, axis = 'y') {
  const s = box.getSize(_v);
  if (axis === 'max') return Math.max(s.x, s.y, s.z);
  return s[axis === 'h' ? 'y' : axis];
}

/**
 * GAME_DESIGN §18.1: scale `object` uniformly so its visible extent along `axis` equals `target` metres.
 * Multiplies the existing scale; returns the factor applied.
 */
export function fitToHeight(object, target, axis = 'y', { exclude = [] } = {}) {
  const ext = extentOf(measure(object, { exclude }), axis);
  if (!(ext > 1e-9) || !(target > 0)) return 1;
  const s = target / ext;
  object.scale.multiplyScalar(s);
  object.updateMatrixWorld(true);
  return s;
}

/**
 * Resolve a fit option to { axis, target, yaw, hide }. Accepts: number, { h }, { y }, { x }, { z }, { max },
 * or a MODEL_FIT role name ('brutus'); ranges ([a, b]) are resolved with `rng`. Falls back to MODEL_FIT[path].
 */
export function resolveFit(path, fit, rng = Math.random) {
  const mf = MODEL_FIT[normalizeAssetPath(path)] ?? MODEL_FIT['models/' + normalizeAssetPath(path)] ?? null;
  let axis = mf?.axis ?? 'y', target = mf?.target ?? null;
  const pick = (v) => (Array.isArray(v) ? v[0] + (v[1] - v[0]) * rng() : v);
  if (typeof fit === 'number' || Array.isArray(fit)) target = pick(fit);
  else if (typeof fit === 'string') target = mf?.uses?.[fit] ?? target;
  else if (fit && typeof fit === 'object') {
    for (const k of ['h', 'y', 'x', 'z', 'max']) if (fit[k] != null) { axis = k === 'h' ? 'y' : k; target = pick(fit[k]); break; }
    if (fit.axis) axis = fit.axis;
  }
  return { axis, target, yaw: (fit && typeof fit === 'object' && fit.yaw != null) ? fit.yaw : (mf?.yaw ?? 0), hide: mf?.hide ?? [] };
}

/**
 * @typedef {object} ModelInstance
 * @property {THREE.Group} root        add this to your actor; feet at y=0, facing +Z, fitted
 * @property {THREE.Group} fit         inner group carrying yaw + uniform scale
 * @property {THREE.Object3D} scene    the cloned glTF scene (bones / named nodes live here)
 * @property {THREE.AnimationClip[]} animations
 * @property {object} gltf             the cached (shared) glTF — never mutate
 * @property {number} scale            uniform scale applied
 * @property {THREE.Vector3} size      fitted world size (m)
 * @property {string} path
 */

export class Assets {
  constructor(ctx) {
    this.ctx = ctx;
    this.manager = new THREE.LoadingManager();
    this.manager.onProgress = (url, n, total) => ctx?.bus?.emit(E.PROGRESS, { n, total });
    this.manager.onError = (url) => console.error(`[assets] failed to load ${url}`);
    /** @type {Map<string, Promise<any>>} */
    this.cache = new Map();
    /** measured raw boxes per template key */
    this._measured = new Map();
    // meshopt only: no shipped GLB uses DRACO (checked 2026-10-07), and DRACOLoader would pull ~1.3 MB of
    // decoder files into the bundle. If one ever does: copy three/examples/jsm/libs/draco/gltf to public/draco/
    // and call this.gltfLoader.setDRACOLoader(new DRACOLoader(this.manager).setDecoderPath(baseUrl() + 'draco/')).
    this.gltfLoader = new GLTFLoader(this.manager).setMeshoptDecoder(MeshoptDecoder);
    this.texLoader = new THREE.TextureLoader(this.manager);
    this.hdrLoader = new HDRLoader(this.manager);
    this.stats = { loaded: 0, failed: 0 };
  }

  async init() {}
  update() {}
  dispose() { this.cache.clear(); this._measured.clear(); }

  /** Public URL for a path relative to public/assets/. */
  url(path) { return assetUrl(path); }

  _cached(key, make) {
    let p = this.cache.get(key);
    if (!p) {
      p = make().then((v) => { this.stats.loaded++; return v; }, (e) => { this.stats.failed++; this.cache.delete(key); throw e; });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Cached glTF (shared; never mutate — use model() for an instance). */
  gltf(path) {
    const p = normalizeAssetPath(path);
    return this._cached('gltf:' + p, () => this.gltfLoader.loadAsync(this.url(p)));
  }

  /**
   * A fitted, independent instance of a GLB (SkeletonUtils clone; shares geometry/materials with the cache).
   * @param {string} path
   * @param {{ fit?: any, yaw?: number, hide?: string[], show?: string[], tint?: string|number|Record<string,string|number>,
   *           castShadow?: boolean, receiveShadow?: boolean, ground?: boolean, center?: boolean, cloneMaterials?: boolean }} [opts]
   * @returns {Promise<ModelInstance>}
   */
  async model(path, opts = {}) {
    const p = normalizeAssetPath(path);
    const gltf = await this.gltf(p);
    const f = resolveFit(p, opts.fit, this.ctx?.rng ?? Math.random);
    const yaw = opts.yaw ?? f.yaw;
    const scene = cloneSkinned(gltf.scene);
    const hide = new Set(opts.hide ?? []), show = new Set(opts.show ?? []);
    scene.traverse((o) => {
      if (hide.has(o.name)) o.visible = false;
      if (show.has(o.name)) o.visible = true;
    });
    const fitG = new THREE.Group(); fitG.name = 'fit'; fitG.rotation.y = yaw; fitG.add(scene);
    const root = new THREE.Group(); root.name = 'model:' + p; root.add(fitG);

    // measure once per (path, visibility, yaw); prop nodes from MODEL_FIT.hide are ignored unless shown
    const exclude = f.hide.filter((n) => !show.has(n));
    const key = `${p}|${yaw}|${[...hide].sort()}|${[...show].sort()}`;
    let raw = this._measured.get(key);
    if (!raw) { raw = measure(root, { exclude }, new THREE.Box3()); this._measured.set(key, raw.clone()); }
    const ext = extentOf(raw, f.axis);
    let s = 1;
    if (f.target != null && ext > 1e-9) s = f.target / ext;
    else if (f.target == null) console.warn(`[assets] no fit for ${p}: add it to MODEL_FIT or pass opts.fit`);
    fitG.scale.setScalar(s);
    if (opts.ground !== false) fitG.position.y = -raw.min.y * s;
    if (opts.center) { const c = raw.getCenter(_v); fitG.position.x = -c.x * s; fitG.position.z = -c.z * s; }

    const cast = opts.castShadow ?? true, recv = opts.receiveShadow ?? false;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = cast; o.receiveShadow = recv;
      if (o.isSkinnedMesh) o.frustumCulled = false;           // animated bounds drift from the bind pose
    });
    if (opts.tint != null || opts.cloneMaterials) this._tint(scene, opts.tint);
    const size = raw.getSize(new THREE.Vector3()).multiplyScalar(s);
    return { root, fit: fitG, scene, animations: gltf.animations ?? [], gltf, scale: s, size, path: p };
  }

  /** Clone materials under `scene` and multiply their colour by `tint` (colour, or { nodeName: colour }). */
  _tint(scene, tint) {
    const map = (tint != null && typeof tint === 'object' && !(tint instanceof THREE.Color)) ? tint : null;
    scene.traverse((o) => {
      if (!o.isMesh) return;
      const want = map ? map[o.name] ?? map[o.parent?.name] : tint;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const cloned = mats.map((m) => {
        const c = m.clone();
        if (want != null && c.color) c.color.multiply(new THREE.Color(want));
        return c;
      });
      o.material = Array.isArray(o.material) ? cloned : cloned[0];
    });
  }

  /** Cached texture. Colour maps are sRGB; data maps (normal/roughness) pass { srgb: false }. */
  texture(path, { srgb = true, repeat = false, anisotropy = 4, flipY = true } = {}) {
    const p = normalizeAssetPath(path);
    return this._cached(`tex:${p}:${srgb}:${repeat}:${flipY}`, async () => {
      const t = await this.texLoader.loadAsync(this.url(p));
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = Math.min(anisotropy, this.ctx?.renderer?.capabilities?.getMaxAnisotropy?.() ?? anisotropy);
      t.flipY = flipY;
      if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      return t;
    });
  }

  /** Cached equirectangular HDR (Radiance .hdr; three r180+ HDRLoader). */
  hdr(path) {
    const p = normalizeAssetPath(path);
    return this._cached('hdr:' + p, async () => {
      const t = await this.hdrLoader.loadAsync(this.url(p));
      t.mapping = THREE.EquirectangularReflectionMapping;
      return t;
    });
  }

  /** Cached raw bytes (audio agents decode with their own AudioContext). */
  arrayBuffer(path) {
    const p = normalizeAssetPath(path);
    return this._cached('bin:' + p, async () => {
      this.manager.itemStart(p);
      try {
        const r = await fetch(this.url(p));
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${p}`);
        return await r.arrayBuffer();
      } catch (e) { this.manager.itemError(p); throw e; } finally { this.manager.itemEnd(p); }
    });
  }

  /**
   * Warm the cache for a list of paths (by extension). Failures are logged, never thrown.
   * Audio files go to ctx.audio.load(path) when the audio system provides it, else are fetched as bytes.
   */
  async preload(paths) {
    const jobs = [];
    for (const raw of paths ?? []) {
      const p = normalizeAssetPath(raw), ext = p.split('.').pop().toLowerCase();
      let job;
      if (ext === 'glb' || ext === 'gltf') job = this.gltf(p);
      else if (ext === 'hdr') job = this.hdr(p);
      else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) job = this.texture(p);
      else if (['ogg', 'mp3', 'wav'].includes(ext) && typeof this.ctx?.audio?.load === 'function') job = this.ctx.audio.load(p);
      else job = this.arrayBuffer(p);
      jobs.push(Promise.resolve(job).catch((e) => console.error(`[assets] preload failed: ${p}`, e?.message ?? e)));
    }
    await Promise.all(jobs);
  }

  /** Preload the per-level subsets every area declared (`export const levels` in its manifest). */
  preloadLevel(levelId) { return this.preload(levelAssets(levelId)); }
}
