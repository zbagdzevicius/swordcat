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
/** PERF §4.4: skinned culling sphere = the fitted bind-pose bounds' sphere × 1.6 (clips stay inside it). */
export const SKIN_CULL_PAD = 1.6;
/** Prefetches in flight at once (PERF §10.3). */
const PREFETCH_PARALLEL = 2;
/** Cache release after `level:loaded` waits this long (ms) so late spawners (companions, waves) hit the cache first. */
export const RELEASE_DELAY_MS = 4000;
/** Material slots that hold textures (MeshStandard / Physical / Toon / Basic / Lambert / Phong). */
const TEX_SLOTS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap', 'lightMap',
  'metalnessMap', 'roughnessMap', 'specularMap', 'gradientMap', 'envMap', 'matcap', 'clearcoatMap', 'clearcoatNormalMap',
  'clearcoatRoughnessMap', 'sheenColorMap', 'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap',
  'iridescenceThicknessMap', 'anisotropyMap', 'specularIntensityMap', 'specularColorMap'];

/** Add every texture `m` references (slots + ShaderMaterial / onBeforeCompile uniforms) to `out`. */
function texturesOf(m, out) {
  if (!m) return out;
  for (const k of TEX_SLOTS) { const t = m[k]; if (t?.isTexture) out.add(t); }
  const u = m.uniforms ?? m.userData?.uniforms ?? m.userData?.shader?.uniforms;
  if (u) for (const k in u) { const v = u[k]?.value; if (v?.isTexture) out.add(v); else if (Array.isArray(v)) for (const t of v) if (t?.isTexture) out.add(t); }
  return out;
}

/**
 * Geometries, materials and textures reachable from `root` (the live scene). Allocates; level-load time only.
 * @param {THREE.Object3D|null|undefined} root
 * @returns {{ geometries: Set<THREE.BufferGeometry>, materials: Set<THREE.Material>, textures: Set<THREE.Texture> }}
 */
export function usedResources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root?.traverse?.((o) => {
    if (o.geometry) geometries.add(o.geometry);
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : null;
    if (ms) for (const m of ms) if (m && !materials.has(m)) { materials.add(m); texturesOf(m, textures); }
  });
  if (root?.background?.isTexture) textures.add(root.background);
  if (root?.environment?.isTexture) textures.add(root.environment);
  return { geometries, materials, textures };
}

/**
 * Free a cached glTF's GPU resources (geometries, materials, textures) except those in `used`, and drop its CPU-side
 * parser. A freed resource that is drawn again re-uploads from its CPU data (three handles it), so a wrong guess
 * costs an upload, never a crash. Returns true when nothing of it is in `used` (the entry may leave the cache).
 * @param {any} gltf @param {ReturnType<typeof usedResources>} used
 */
export function disposeGltf(gltf, used) {
  if (!gltf?.scenes && !gltf?.scene) return true;
  const geos = new Set(), mats = new Set(), texs = new Set();
  for (const sc of gltf.scenes ?? [gltf.scene]) sc?.traverse?.((o) => {
    if (o.geometry) geos.add(o.geometry);
    if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) { mats.add(m); texturesOf(m, texs); }
  });
  for (const g of geos) if (used.geometries.has(g)) return false;
  for (const g of geos) g.dispose();
  for (const m of mats) if (!used.materials.has(m)) m.dispose();
  for (const t of texs) if (!used.textures.has(t)) t.dispose();
  gltf.parser = null;
  return true;
}

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

/**
 * Free what a `ctx.assets.model()` instance owns on the GPU (core, M2; requests/enemies.md): every cloned skeleton's
 * bone texture (SkeletonUtils clones get their own Skeleton; three never frees it on its own) and the per-instance
 * material clones made by `tint` / `cloneMaterials` (tagged `userData.assetOwned`, or any material you tag with it).
 * Shared GLTF geometry / textures / materials are never touched. Safe to call twice. Detaches `root` when `detach`.
 * @param {THREE.Object3D|null|undefined} root @param {{ detach?: boolean, materials?: boolean }} [opts]
 */
export function disposeInstance(root, { detach = true, materials = true } = {}) {
  if (!root) return;
  const skeletons = new Set(), mats = new Set();
  root.traverse((o) => {
    if (o.isSkinnedMesh && o.skeleton) skeletons.add(o.skeleton);
    if (!materials || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m?.userData?.assetOwned) mats.add(m);
  });
  for (const sk of skeletons) sk.dispose();
  for (const m of mats) m.dispose();
  if (detach) root.removeFromParent();
}

/** onUpload callback: drop the CPU copy once three has it on the GPU (`this` is the attribute). */
function _dropArray() { this.array = null; }

/**
 * PERF §5 heap: free the CPU-side typed arrays of static, non-skinned meshes under `root` once they are uploaded
 * (`BufferAttribute.onUpload`). Bounds are computed first (culling keeps working). Opt-in per area, and ONLY for
 * geometry that is (a) never edited, re-baked or read on the CPU again (no `fromBufferAttribute`, no bake, no BVH),
 * and (b) never drawn again after `geometry.dispose()` (a dispose + redraw would re-upload from a null array).
 * `keepPosition` (default) keeps positions, which raycasts (Picker, Occluders) and physics read; the index is always
 * kept (raycasts walk it). Morph / instanced / interleaved attributes and `userData.keepCpu` meshes are skipped.
 * Returns the number of attributes marked.
 * @param {THREE.Object3D} root @param {{ keepPosition?: boolean }} [opts]
 */
export function releaseCpuOnUpload(root, { keepPosition = true } = {}) {
  let n = 0;
  root?.traverse?.((o) => {
    const g = o.geometry;
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !g?.attributes || o.userData?.keepCpu || g.userData?.keepCpu) return;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    if (!g.boundingBox) g.computeBoundingBox();
    if (!g.boundingSphere) g.computeBoundingSphere();
    for (const k in g.attributes) {
      const a = g.attributes[k];
      if ((keepPosition && k === 'position') || a.isInterleavedBufferAttribute || a.usage !== THREE.StaticDrawUsage) continue;
      if (a.onUploadCallback !== _dropArray) { a.onUpload(_dropArray); n++; }
    }
  });
  return n;
}

export class Assets {
  constructor(ctx) {
    this.ctx = ctx;
    this.manager = new THREE.LoadingManager();
    // throttled: one per 100 ms, plus the last one of a batch (one per URL flooded the bus at boot)
    let lastT = -1e9;
    this.manager.onProgress = (url, n, total) => {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (n < total && now - lastT < 100) return;
      lastT = now;
      ctx?.bus?.emit(E.PROGRESS, { n, total });
    };
    this.manager.onError = (url) => console.error(`[assets] failed to load ${url}`);
    /** @type {Map<string, Promise<any>>} */
    this.cache = new Map();
    /** paths already prefetched into the HTTP cache (PERF §10.3) */
    this._prefetched = new Set();
    /** measured raw boxes per template key */
    this._measured = new Map();
    /** settled cache values by key (release() only touches settled entries) */
    this._values = new Map();
    /** pending release() timer (setTimeout id) */
    this._releaseTimer = null;
    // meshopt only: no shipped GLB uses DRACO (checked 2026-10-07), and DRACOLoader would pull ~1.3 MB of
    // decoder files into the bundle. If one ever does: copy three/examples/jsm/libs/draco/gltf to public/draco/
    // and call this.gltfLoader.setDRACOLoader(new DRACOLoader(this.manager).setDecoderPath(baseUrl() + 'draco/')).
    this.gltfLoader = new GLTFLoader(this.manager).setMeshoptDecoder(MeshoptDecoder);
    this.texLoader = new THREE.TextureLoader(this.manager);
    this.hdrLoader = new HDRLoader(this.manager);
    this.stats = { loaded: 0, failed: 0, released: 0 };
  }

  async init() {
    const bus = this.ctx?.bus;
    if (!bus) return;
    bus.on(E.LEVEL_LOADING, () => this._cancelRelease());
    bus.on(E.LEVEL_LOADED, (p) => {
      this._cancelRelease();
      if (typeof setTimeout !== 'function' || !p?.id) return;
      this._releaseTimer = setTimeout(() => { this._releaseTimer = null; this.release(p.id); }, RELEASE_DELAY_MS);
    });
  }
  update() {}
  dispose() { this._cancelRelease(); this.cache.clear(); this._values.clear(); this._measured.clear(); }

  _cancelRelease() { if (this._releaseTimer != null) { clearTimeout(this._releaseTimer); this._releaseTimer = null; } }

  /**
   * PERF §5 / §10.3 memory: drop settled glTF / texture cache entries the level `levelId` does not list (every tier,
   * plus '*') and that nothing in the live scene draws, and free their GPU resources. Without this every visited
   * level's GLBs (geometry, textures, decoded images and whatever other areas cached per image) stayed resident
   * for the whole session. Called `RELEASE_DELAY_MS` after `level:loaded`; a released path loads again on demand.
   * Allocates (one scene traversal); level-load time only. Returns the released cache keys.
   * @param {string} levelId @param {THREE.Object3D} [root] defaults to ctx.scene
   * @returns {string[]}
   */
  release(levelId, root = this.ctx?.scene) {
    const keep = new Set(levelAssets(levelId, undefined, 'all'));
    const used = usedResources(root);
    const out = [];
    for (const [key, v] of this._values) {
      const i = key.indexOf(':'), kind = key.slice(0, i);
      if (kind !== 'gltf' && kind !== 'tex') continue;
      const path = kind === 'tex' ? key.slice(i + 1).split(':')[0] : key.slice(i + 1);
      if (keep.has(path)) continue;
      if (kind === 'gltf') { if (!disposeGltf(v, used)) continue; }
      else if (used.textures.has(v)) continue;
      else v?.dispose?.();
      this.cache.delete(key); this._values.delete(key);
      out.push(key);
    }
    this.stats.released += out.length;
    return out;
  }

  /** Public URL for a path relative to public/assets/. */
  url(path) { return assetUrl(path); }

  _cached(key, make) {
    let p = this.cache.get(key);
    if (!p) {
      p = make().then((v) => {
        this.stats.loaded++;
        if (this.cache.get(key) === p) this._values.set(key, v);
        return v;
      }, (e) => { this.stats.failed++; this.cache.delete(key); throw e; });
      this.cache.set(key, p);
    }
    return p;
  }

  /** Cached glTF (shared; never mutate — use model() for an instance). */
  gltf(path) {
    const p = normalizeAssetPath(path);
    // PERF §5 memory: the parser keeps the GLB body, every decoded bufferView and image blob in its cache (≈ 13 MB
    // over the levels); nothing reads gltf.parser after the parse, so drop it.
    return this._cached('gltf:' + p, () => this.gltfLoader.loadAsync(this.url(p)).then((g) => { g.parser = null; return g; }));
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
    // PERF §4.4 (C12): skinned meshes keep frustum culling with a conservative bind-pose sphere × SKIN_CULL_PAD in
    // mesh-local space (three r186 uses a set boundingSphere as is). A culled one skips its draw, bone upload and
    // setProgram. `opts.cull === false` keeps the old "never culled" behaviour for rigs whose clips leave the sphere.
    let skinSphere = null;
    if (opts.cull !== false) {
      skinSphere = raw.getBoundingSphere(new THREE.Sphere());
      skinSphere.center.multiplyScalar(s).add(fitG.position);
      skinSphere.radius *= s * SKIN_CULL_PAD;
      root.updateMatrixWorld(true);
    }
    scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = cast; o.receiveShadow = recv;
      if (!o.isSkinnedMesh) return;
      if (!skinSphere) { o.frustumCulled = false; return; }
      o.boundingSphere = skinSphere.clone().applyMatrix4(_m.copy(o.matrixWorld).invert());
      o.frustumCulled = true;
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
        c.userData.assetOwned = true;          // a per-instance clone: disposeInstance() frees it
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
  /** Instance form of the module's `disposeInstance(root, opts)` (skeleton bone textures + owned material clones). */
  disposeInstance(root, opts) { disposeInstance(root, opts); }

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
  preloadLevel(levelId, tier = 'p0') { return this.preload(levelAssets(levelId, undefined, tier)); }

  /**
   * Shared clip library of a rig family (PERF §10.3 step 2): the cached glTF's `animations`. Bind by bone name:
   * `mixer.clipAction(THREE.AnimationClip.findByName(await assets.animLib(path), 'Running_A'), model.scene)`.
   * @param {string} path @returns {Promise<THREE.AnimationClip[]>}
   */
  async animLib(path) { return (await this.gltf(path)).animations ?? []; }

  /**
   * Prefetch a level's tier into the HTTP cache without parsing (PERF §10.3): `fetch(url, { priority: 'low' })`,
   * ≤ PREFETCH_PARALLEL in flight, skipped on `saveData`. Returns the number of files fetched.
   * @param {string} levelId @param {'p0'|'p1'|'p2'|'all'} [tier]
   */
  async prefetch(levelId, tier = 'p0') {
    if (typeof fetch !== 'function') return 0;
    if (typeof navigator !== 'undefined' && navigator.connection?.saveData) return 0;
    const queue = levelAssets(levelId, undefined, tier).filter((p) => !this.cache.has('gltf:' + p) && !this._prefetched.has(p));
    let done = 0;
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        this._prefetched.add(p);
        try { await fetch(this.url(p), { priority: 'low' }); done++; } catch { /* best effort */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PREFETCH_PARALLEL, queue.length) }, worker));
    return done;
  }
}
