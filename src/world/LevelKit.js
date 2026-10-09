// src/world/LevelKit.js  (owner: world) — `defineLevel` (Appendix B.1 spine-and-zones format) → a runtime Level
// (tech.md §12.1 LevelData; see Level.js). GAME_DESIGN §12.1:
//   - seeded fbm heightfield (Terrain), the spine path carved flat (pathWidth, smoothed over 3 m), arena discs flat
//     out to r + 2, spawn / checkpoint / setpiece flats, stream beds and keep-height boxes (bridge approaches);
//   - real CC0 GLB props (Props.js: baked once per template, ONE BatchedMesh for every static prop; trees are
//     instanced per template with wind sway and the camera's tree fade), footprint colliders, grass cleared under them;
//   - seeded scatter (`scatter`), keeping away from the path, arenas, water, setpieces and each other (`minDist`);
//   - zones: setpiece (`props: '<builder>'`), trigger, checkpoint (VigilStone), open (enemy spawns), arena (Arena),
//     kitten (companions.spawnKitten), letter, heartBell, exit, interact; per-zone `placed` models / creatures;
//   - instanced wind grass (Grass.js, wrapping tiles fed by Terrain's ground-data texture), water (Water.js),
//     breakable crates (1–3 fish, ~2 milk bottles per level), fish lines, cosmetic breadcrumb letters, far
//     silhouettes (`skyline`, fog-proof), the horizon tree line, spawns, anchors, `fog_edge_0..7`, bounds.
// Level files can add their own setpiece builders: `setpieces: { name: async (kit, zone) => { ... } }`.
// Kit API for builders: kit.rng, kit.h(x, z), await kit.tpl(path, opts), kit.proc(key, parts), kit.place(tpl, x, z,
// opts), kit.fence(tpl, a, b, opts), kit.collider(c), kit.actor(a, id), kit.object(o3d), kit.anchor(...),
// kit.spawn(...), kit.trigger(...), kit.interact(...), kit.clear(x, z, r), kit.paint(...), kit.occupy(x, z, r),
// kit.free(x, z, r), kit.onLoaded(fn), kit.onFlag(key, fn), kit.cond(c).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { E } from '../core/events.js';
import { createRng } from '../core/rng.js';
import { resolveFit } from '../core/Assets.js';
import { ECONOMY } from '../core/config.js';
import { Level, condOk } from './Level.js';
import { Terrain } from './Terrain.js';
import { Grass, GRASS_COLORS } from './Grass.js';
import { PropBatch, templateFromObject, fitScale, trs, procTemplate, makeStoneMaterial } from './Props.js';
export { procTemplate };
import { PropActor, Critter } from './PropActor.js';
import { Pickups } from './Pickups.js';
import { Arena } from './Arena.js';
import { VigilStone, VIGIL } from './VigilStone.js';
import { WaterSet } from './Water.js';
import { Silhouettes, makeGlowSprite } from './Sky.js';
import { distToPolyline, inBox, pointAlong, polylineLength } from './noise.js';
import { LightPool, Fireflies, paveRibbons } from './Dressing.js';

/** Shared model paths (the level manifests list them). */
/**
 * Open-fight zones: loading at a Vigil Stone keeps spawn groups within `safeLoadR` m of it away for that load (the
 * Continue spawn is never inside an aggro cluster); a zone whose enemies all fell is saved as cleared.
 */
export const OPEN_ZONE = Object.freeze({ safeLoadR: 17 });
/** The flag that marks an open-fight zone cleared (pure). */
export const openZoneFlag = (levelId, zoneId) => `${levelId}.cleared.${zoneId}`;

export const KIT_MODELS = {
  obelisk: 'models/env/nature/statue_obelisk.glb',
  lantern: 'models/env/graveyard/lantern-candle.glb',
  crate: 'models/env/village-kaykit/decoration/crate_A_big.glb',
  crateB: 'models/env/village-kaykit/decoration/crate_B_big.glb',
  barrel: 'models/env/village-kaykit/decoration/barrel.glb',
};


/** Per-biome defaults (grass, horizon tree silhouettes). */
const BIOME = {
  meadow: { grass: true, horizon: ['models/env/nature/tree_oak.glb', 'models/env/nature/tree_default.glb', 'models/env/nature/tree_detailed.glb'] },
  forest: { grass: true, horizon: ['models/env/nature/tree_oak.glb', 'models/env/nature/tree_fat.glb', 'models/env/nature/tree_detailed.glb'] },
  town: { grass: true, horizon: ['models/env/nature/tree_default.glb', 'models/env/nature/tree_oak.glb'] },
  gate: { grass: true, horizon: [] },
  bog: { grass: true, horizon: ['models/env/nature/tree_default_dark.glb', 'models/env/nature/tree_oak_dark.glb'] },
  keep: { grass: false, horizon: [] },
};

const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color(), _v = new THREE.Vector3();

/** Appendix B.1: `export default defineLevel({...})` → the definition plus `build(ctx) → Promise<Level>`. */
export function defineLevel(def) {
  return { ...def, build: (ctx) => buildLevel(ctx, def) };
}

/** Build the runtime Level (LevelData) for `def`. */
export async function buildLevel(ctx, def) {
  const level = new Level(ctx, def);
  const kit = new Kit(ctx, def, level);
  await kit.build();
  return level;
}

/**
 * Every model path a level definition references directly (scatter, placed, zone models, skyline, setpiece `models`,
 * kit props). Pure. `{ bake: true }` = only the ones LevelKit bakes with default options (the rest are loaded by
 * setpieces with their own options, or are animated critters).
 */
export function levelModelPaths(def, { bake = false } = {}) {
  const out = new Set();
  const add = (p) => { if (typeof p === 'string' && p.startsWith('models/')) out.add(p); };
  for (const s of def.scatter ?? []) if (!bake || !s.tpl) [].concat(s.model).forEach(add);
  for (const z of def.zones ?? []) { for (const p of z.placed ?? []) if (!bake || !(p.clip || p.critter)) add(p.model); if (!bake) [].concat(z.models ?? []).forEach(add); }
  for (const s of def.skyline ?? []) add(s.model);
  if (!bake) [].concat(def.models ?? []).forEach(add);
  for (const p of BIOME[def.biome ?? def.id]?.horizon ?? []) if (def.horizon !== false) add(p);
  if ((def.zones ?? []).some((z) => z.kind === 'checkpoint')) { add(KIT_MODELS.obelisk); if (!bake) add(KIT_MODELS.lantern); }
  if (def.crates) { add(KIT_MODELS.crate); add(KIT_MODELS.crateB); add(KIT_MODELS.barrel); }
  return [...out];
}

/** Clone a glTF scene and pose it at `t` (0..1) of `clip` (static statue bakes). */
export function posedScene(gltf, clip, t = 0.5) {
  const scene = SkeletonUtils.clone(gltf.scene);
  const c = THREE.AnimationClip.findByName(gltf.animations ?? [], clip);
  if (c) {
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(c).play();
    mixer.update(Math.max(0, Math.min(1, t)) * c.duration);
  }
  scene.updateMatrixWorld(true);
  scene.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  return scene;
}

/** Tree material: vertex colours + gentle canopy sway (world-space, per instance phase). */
export function makeTreeMaterial(uniforms) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime, uWind, uTreeH;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  #ifdef USE_INSTANCING
    vec3 tOrg = instanceMatrix[3].xyz;
  #else
    vec3 tOrg = vec3(0.0);
  #endif
  float th = clamp(transformed.y / max(uTreeH, 0.001), 0.0, 1.0);
  float sw = smoothstep(0.35, 1.0, th);
  float ph = tOrg.x * 0.37 + tOrg.z * 0.23;
  float k = sw * (0.012 + 0.018 * uWind) * uTreeH;
  transformed.x += (sin(uTime * 0.9 + ph) + 0.4 * sin(uTime * 2.3 + ph * 1.7)) * k;
  transformed.z += (cos(uTime * 0.7 + ph * 1.3) * 0.6) * k;
}`);
  };
  m.customProgramCacheKey = () => 'world-tree-v1';
  m.userData.owned = true;
  return m;
}

export class Kit {
  /** @param {any} ctx @param {any} def @param {Level} level */
  constructor(ctx, def, level) {
    this.ctx = ctx; this.def = def; this.level = level;
    this.rng = createRng(def.seed ?? 1).fork('kit:' + def.id);
    this.biome = BIOME[def.biome ?? def.id] ?? BIOME.meadow;
    /** @type {Map<string, Promise<any>>} */
    this._tpls = new Map();
    /** @type {Map<string, any>} resolved templates by key and by path */
    this.ready = new Map();
    this.templates = [];
    this.batch = new PropBatch({ name: 'props:' + def.id });
    /** @type {Map<string, {tpl: any, items: {m: THREE.Matrix4, c: THREE.Color|null}[], name: string}>} */
    this.treeSets = new Map();
    /** occupied discs [x, z, r] */
    this.occ = [];
    /** keep-out areas for scatter: { x, z, r } discs and { box: [x0, z0, x1, z1] } */
    this.blockers = [];
    this.terrain = null;
    this._warned = new Set();
  }

  // ------------------------------------------------------------------ small helpers
  h(x, z) { return this.terrain.heightAt(x, z); }
  cond(c) { return condOk(this.ctx, c); }
  occupy(x, z, r) { this.occ.push([x, z, r]); }
  block(b) { this.blockers.push(b); }
  /** Is a disc free of other props? */
  free(x, z, r) { for (const [ox, oz, or] of this.occ) if ((x - ox) * (x - ox) + (z - oz) * (z - oz) < (r + or) * (r + or)) return false; return true; }
  clear(x, z, r, to = 0) { this.terrain.clearGrass(x, z, r, to); }
  paint(x, z, r, color, weight = 1, soft = 1.5) { this.terrain.paintDisc(x, z, r, color, weight, soft); }
  collider(c) { return this.level.addCollider(c); }
  object(o, { collide = false } = {}) {
    o.traverse((c) => { c.userData.owned = true; if (collide && c.isMesh) c.userData.collide = true; });
    this.level.groups.props.add(o);
    if (collide) this.level.octreeMeshes.push(o);
    return o;
  }
  actor(a, id) { return this.level.addActor(a, id); }
  anchor(name, x, z, y, facing = 0) { this.level.anchors[name] = { pos: new THREE.Vector3(x, y ?? this.h(x, z), z), facing }; }
  /** A spawn point; `y` (absolute) for raised spawns (the town bell platform), else the ground. */
  spawn(name, x, z, facing = 0, y = null) { this.level.spawns[name] = { pos: new THREE.Vector3(x, Number.isFinite(y) ? y : this.h(x, z), z), facing }; }
  trigger(t) { this.level.triggers.push({ fired: false, inside: false, once: true, ...t }); }
  interact(it) {
    const y = it.y ?? this.h(it.at[0], it.at[1]);
    const o = { kind: 'interact', r: 1.6, ...it, pos: new THREE.Vector3(it.at[0], y, it.at[1]) };
    this.level.interactables.push(o);
    return o;
  }
  onLoaded(fn) { this.level.onLoaded(fn); }
  /** Call fn(value) when story flag `key` changes (and once at load with the current value). */
  onFlag(key, fn) {
    this.level.onLoaded(() => fn(this.ctx.state?.getFlag?.(key), true));
    this.level.listen(E.FLAG_SET, (p) => { if (p?.key === key) fn(p.value, false); });
  }
  warnOnce(msg) { if (!this._warned.has(msg)) { this._warned.add(msg); console.warn(msg); } }
  /** Clearance (m) from (x, z) to the nearest road edge: the smoothed spine and the extra paths (negative = on a road). */
  roadClearance(x, z) {
    let c = distToPolyline(x, z, this.terrain.spine) - (this.def.pathWidth ?? 6) / 2;
    for (const p of this.terrain.paths) c = Math.min(c, distToPolyline(x, z, p.pts) - p.width / 2);
    return c;
  }
  /** Is (x, z) inside an arena zone grown by `pad`? */
  inArena(x, z, pad = 0) {
    for (const zn of this.def.zones ?? []) {
      if (zn.kind !== 'arena') continue;
      if (zn.size ? inBox(x, z, zn.at, [zn.size[0] + pad * 2, zn.size[1] + pad * 2]) : Math.hypot(x - zn.at[0], z - zn.at[1]) < (zn.r ?? 12) + pad) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ templates
  /**
   * A baked prop template for a GLB (cached per level). opts: { key, pose: clip, poseT, hide, show, dynamic: [nodes],
   * recolor, recolorMap, sat, mul, tint (multiplied after the grade), flatColor, flatNormals }.
   */
  tpl(path, o = {}) {
    const key = o.key ?? [path, o.pose ?? '', (o.hide ?? []).join(','), (o.show ?? []).join(','), (o.dynamic ?? []).join(','), o.flatColor ?? '', o.mul ?? '', o.sat ?? '', o.tint ?? '', o.recolorMap ? JSON.stringify(o.recolorMap) : ''].join('|');
    let p = this._tpls.get(key);
    if (!p) {
      p = this._makeTpl(path, key, o).then((t) => {
        this.ready.set(key, t);
        if (!this.ready.has(path)) this.ready.set(path, t);
        this.templates.push(t);
        return t;
      }, (e) => { console.warn(`[world] ${this.def.id}: model ${path} failed`, e?.message ?? e); return null; });
      this._tpls.set(key, p);
    }
    return p;
  }

  async _makeTpl(path, key, o) {
    const gltf = await this.ctx.assets.gltf(path);
    const root = o.pose ? posedScene(gltf, o.pose, o.poseT ?? 0.5) : gltf.scene;
    const show = new Set(o.show ?? []);
    const hide = [...(resolveFit(path).hide ?? []), ...(o.hide ?? [])].filter((n) => !show.has(n));
    const t = templateFromObject(root, { key, hide, dynamic: o.dynamic, recolor: o.recolor, recolorMap: o.recolorMap, sat: o.sat, mul: o.mul, tint: o.tint,
      flatColor: o.flatColor, flatNormals: o.flatNormals });
    t.path = path;
    return t;
  }

  /** A procedural template (see procTemplate), cached by key. */
  proc(key, makeParts) {
    let t = this.ready.get(key);
    if (!t) { t = procTemplate(key, makeParts()); this.ready.set(key, t); this.templates.push(t); }
    return t;
  }

  /** Shared vertex-colour material for standalone (animated) prop meshes. */
  material() {
    if (!this._vcMat) {
      this._vcMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, envMapIntensity: 0.55 });
      this._vcMat.userData.owned = true;
    }
    return this._vcMat;
  }

  /** A standalone mesh of a template (animated props: gates, sacks, dummies). Not added to the scene. */
  mesh(tpl, { castShadow = true, name } = {}) {
    const m = new THREE.Mesh(tpl.geometry, this.material());
    m.castShadow = castShadow; m.receiveShadow = true;
    m.name = name ?? tpl.key;
    m.userData.owned = true;
    return m;
  }

  /** Resolve a template argument (template object or an already loaded path / key). */
  _t(src) {
    if (src && typeof src === 'object') return src;
    const t = this.ready.get(src);
    if (!t) this.warnOnce(`[world] ${this.def.id}: template ${src} not loaded`);
    return t ?? null;
  }

  // ------------------------------------------------------------------ placement
  /**
   * Place a template instance. opts: fit (MODEL_FIT forms), scale (number | [x, y, z], overrides fit), yaw, y (absolute
   * base height), lift (m above the ground), sink, tiltX/tiltZ, center (centre XZ on the template box), tree, color
   * (instance tint), jitter (colour jitter, default 0.06), collider ('auto' | 'circle' | 'box' | false), shrink,
   * height (collider top above the base), walkable, clear (grass clear radius, false = none), occupy (radius or
   * false), cull (fog culling, default true), surface ('wood' | 'stone' footstep override over the footprint).
   * @returns {null | {tpl:any, handle:any, matrix:THREE.Matrix4, scale:number[], x:number, y:number, z:number, yaw:number,
   *   parts:{name:string, handle:any, base:THREE.Matrix4}[], colliders:any[], radius:number, top:number}}
   */
  place(src, x, z, o = {}) {
    const tpl = this._t(src);
    if (!tpl) return null;
    let sc = o.scale;
    if (sc == null) sc = fitScale(tpl.path ?? tpl.key, tpl, o.fit ?? null, this.rng).scale;
    const sv = Array.isArray(sc) ? sc : [sc, sc, sc];
    const yaw = o.yaw ?? 0;
    const y = (o.y ?? this.h(x, z) + (o.lift ?? 0)) - (o.sink ?? 0);
    const b = tpl.box;
    const ox = o.center ? -(b.min.x + b.max.x) / 2 : 0, oz = o.center ? -(b.min.z + b.max.z) / 2 : 0;
    const oy = o.ground === false ? 0 : -b.min.y;
    const m = trs(new THREE.Matrix4(), x, y, z, yaw, sv, o.tiltX ?? 0, o.tiltZ ?? 0).multiply(_m.makeTranslation(ox, oy, oz));
    const jit = o.jitter ?? 0.06;
    const color = o.color != null ? new THREE.Color(o.color) : (jit > 0 ? new THREE.Color(1, 1, 1).multiplyScalar(1 - jit + this.rng() * jit * 2) : null);
    let handle = null;
    if (o.tree || o.fade) this._addInst(tpl, m, color, !!o.tree);
    else if (o.into) o.into.items.push({ geo: tpl.geometry, m, color });     // a merged architecture mesh (kit.merged)
    else handle = this.batch.add(tpl.geometry, m, { color, cull: o.cull });
    const parts = [];
    for (const p of tpl.parts) {
      const base = m.clone().multiply(_m2.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z));
      parts.push({ name: p.name, base, handle: this.batch.add(p.geometry, base, { color, cull: o.cull }) });
    }
    const w = (b.max.x - b.min.x) * sv[0], d = (b.max.z - b.min.z) * sv[2], hgt = (b.max.y - b.min.y) * sv[1];
    const radius = Math.max(w, d) / 2;
    const colliders = [];
    if (o.collider !== false) for (const c of this._footprint(tpl, x, y, z, yaw, sv, ox, oz, o)) colliders.push(this.collider(c));
    const clearR = o.clear === false ? 0 : (o.clear ?? (o.tree ? Math.max(0.6, radius * 0.18) : radius * 0.8));
    if (clearR > 0) this.clear(x, z, clearR, o.clearTo ?? 0.05);
    if (o.occupy !== false) this.occupy(x, z, o.occupy ?? (o.tree ? Math.max(1, radius * 0.4) : radius));
    if (o.surface) {
      const c = Math.cos(yaw), s = Math.sin(yaw), hw = w / 2, hd = d / 2;
      this.level.surfaces.push({ kind: o.surface, test: (px, pz) => { const dx = px - x, dz = pz - z; return Math.abs(dx * c - dz * s) <= hw && Math.abs(dx * s + dz * c) <= hd; } });
    }
    return { tpl, handle, matrix: m, scale: sv, x, y, z, yaw, parts, colliders, radius, top: y + hgt };
  }

  /** Footprint colliders (circle for round things, yawed box for long ones), in world space. */
  _footprint(tpl, x, y, z, yaw, sv, ox, oz, o) {
    const b = tpl.box, shrink = o.shrink ?? 0.85;
    const w = (b.max.x - b.min.x) * sv[0] * shrink, d = (b.max.z - b.min.z) * sv[2] * shrink;
    const lcx = ((b.min.x + b.max.x) / 2 + ox) * sv[0], lcz = ((b.min.z + b.max.z) / 2 + oz) * sv[2];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const cx = x + lcx * c + lcz * s, cz = z - lcx * s + lcz * c;
    const top = o.height ?? (b.max.y - b.min.y) * sv[1];
    const base = { y0: y - 0.6, y1: y + top };
    if (o.walkable === false) base.walkable = false;
    if (o.fade) base.camFade = true;            // fadeable props (fences, gate / lantern posts): fade, don't pull in
    if (o.tree) return [{ x, z, r: o.trunk ?? Math.max(0.22, Math.min(w, d) * 0.08), camFade: true, ...base }];   // camera: fade, don't pull in
    const kind = o.collider === 'circle' || o.collider === 'box' ? o.collider : (Math.max(w, d) / Math.max(0.01, Math.min(w, d)) > 1.6 ? 'box' : 'circle');
    if (kind === 'circle') return [{ x: cx, z: cz, r: Math.max(0.15, (w + d) / 4), ...base }];
    return [{ x: cx, z: cz, hx: w / 2, hz: d / 2, yaw, ...base }];
  }

  /**
   * A merged architecture bucket: `place(tpl, x, z, { into: bucket })` collects instances; `bucket.build()` merges them
   * into ONE mesh with `material` (default: the dressed-stone material, art.md §9.4) and adds it to the level.
   * Castle towers, walls and terrace masonry read as cut stone instead of flat Kenney colours.
   */
  merged(name, material = null) {
    const kit = this;
    const bucket = {
      name, items: [],
      build() {
        if (!this.items.length) return null;
        const geos = this.items.map(({ geo, m, color }) => {
          let g = geo.clone().applyMatrix4(m);
          if (color && g.attributes.color) { const c = g.attributes.color; for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) * color.r, c.getY(i) * color.g, c.getZ(i) * color.b); }
          if (g.index) { const ng = g.toNonIndexed(); g.dispose(); g = ng; }
          for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
          return g;
        });
        const merged = mergeGeometries(geos, false);
        for (const g of geos) g.dispose();
        if (!merged) return null;
        merged.computeBoundingSphere(); merged.computeBoundingBox();
        const mat = material ?? makeStoneMaterial({ block: [0.9, 0.6], course: 0.42 });
        mat.userData.owned = true;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.name = 'merged:' + name; mesh.castShadow = true; mesh.receiveShadow = true;
        kit.object(mesh);
        return mesh;
      },
    };
    return bucket;
  }

  /** Instanced (camera-fadeable) props: trees (with wind sway) and `fade` props such as the practice-field fence. */
  _addInst(tpl, m, color, sway) {
    const key = tpl.key + (sway ? '|sway' : '|fade');
    let set = this.treeSets.get(key);
    if (!set) { set = { tpl, sway, items: [], name: (sway ? 'trees:' : 'fade:') + (tpl.path ?? tpl.key).split('/').pop().replace('.glb', '') }; this.treeSets.set(key, set); }
    set.items.push({ m, c: color });
  }

  /**
   * A straight run of a fence / wall template from a to b ([x, z]); pieces are centred on the line and spaced by
   * their fitted width. One thin segment collider per unbroken stretch. opts: fit, height (collider), gaps: [[x, z, r]],
   * skip(x, z) → true drops that piece (keep walls off roads / out of arenas), yawOffset, jitter, walkable.
   * @returns {{pieces: any[], collider: any}}
   */
  fence(src, a, b, o = {}) {
    const tpl = this._t(src);
    if (!tpl) return { pieces: [], collider: null };
    const sc = o.scale ?? fitScale(tpl.path ?? tpl.key, tpl, o.fit ?? null, this.rng).scale;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const rawW = Math.max(0.01, tpl.box.max.x - tpl.box.min.x);
    const n = Math.max(1, Math.round(len / (rawW * Math.min(sc, o.maxPieceScale ?? 2.4))));
    const sx = (len / n) / rawW * (o.overlap ?? 1.0), sz = Math.min(sc, o.depthScale ?? 1.8);
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]) + Math.PI / 2 + (o.yawOffset ?? 0);
    const pieces = [];
    const segs = [];
    let segStart = null;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const inGap = (o.gaps ?? []).some(([gx, gz, gr]) => Math.hypot(x - gx, z - gz) < gr) || !!o.skip?.(x, z);
      if (inGap) { if (segStart !== null) { segs.push([segStart, (i) / n]); segStart = null; } continue; }
      if (segStart === null) segStart = i / n;
      const p = this.place(tpl, x, z, { scale: [sx, sc, sz], yaw, center: true, collider: false,
        jitter: o.jitter ?? 0.05, clear: o.clear ?? 0.6, occupy: 0.4, tiltZ: (this.rng() - 0.5) * (o.wobble ?? 0.04), fade: o.fade, into: o.into });
      if (p) pieces.push(p);
    }
    if (segStart !== null) segs.push([segStart, 1]);
    const h = o.height ?? (tpl.box.max.y - tpl.box.min.y) * sc;
    const cols = [];
    if (o.collider !== false) for (const [t0, t1] of segs) {
      const ax = a[0] + (b[0] - a[0]) * t0, az = a[1] + (b[1] - a[1]) * t0, bx = a[0] + (b[0] - a[0]) * t1, bz = a[1] + (b[1] - a[1]) * t1;
      // non-walkable runs block up to the higher end (on a climbing run the uphill fence must not be hoppable;
      // requests/physics.md); walkable tops (drystone walls) sit on the lower end so she never floats
      const ha = this.h(ax, az), hb = this.h(bx, bz), walk = o.walkable ?? false;
      const y0 = Math.min(ha, hb), y = walk ? y0 : Math.max(ha, hb);
      cols.push(this.collider({ ax, az, bx, bz, r: o.thick ?? 0.14, y0: y0 - 0.6, y1: y + h, walkable: walk }));
    }
    return { pieces, colliders: cols };
  }

  // ------------------------------------------------------------------ build
  async build() {
    const { def, level, ctx } = this;
    const prof = level.buildProfile = {};
    let pt = performance.now();
    const mark = (k) => { const n = performance.now(); prof[k] = Math.round(n - pt); pt = n; };
    // 1. terrain (flats: spawns, checkpoints, arenas r + 2, setpiece `flat`)
    const flats = [];
    for (const s of Object.values(def.spawns ?? {})) flats.push({ x: s[0], z: s[1], r: 2.5 });
    for (const zn of def.zones ?? []) {
      if (zn.kind === 'arena') flats.push(zn.size ? { x: zn.at[0], z: zn.at[1], r: Math.max(...zn.size) / 2 + 2 } : { x: zn.at[0], z: zn.at[1], r: (zn.r ?? 12) + 2 });
      else if (zn.kind === 'checkpoint') flats.push({ x: zn.at[0], z: zn.at[1], r: 2.5 });
      if (zn.flat) flats.push({ x: zn.at[0], z: zn.at[1], r: zn.flat, h: zn.flatH });
    }
    for (const f of def.flats ?? []) flats.push(Array.isArray(f) ? { x: f[0], z: f[1], r: f[2], h: f[3] } : f);
    this.terrain = new Terrain(def, { flats });
    this.terrain.build();
    mark('terrain');
    level.terrain = this.terrain;
    level.heightfield = this.terrain.heightfield;
    if (def.bounds) level.bounds = { min: new THREE.Vector2(def.bounds[0], def.bounds[1]), max: new THREE.Vector2(def.bounds[2], def.bounds[3]) };

    // 2. pickups (needs the root) + every directly referenced model, loaded in parallel
    level.pickups = new Pickups(ctx, { heightAt: (x, z) => this.h(x, z), levelId: def.id, root: level.groups.pickups });
    await Promise.all([...levelModelPaths(def, { bake: true }).map((p) => this.tpl(p)),
      (def.zones ?? []).some((z) => z.kind === 'checkpoint') ? this.tpl(KIT_MODELS.lantern, { sat: 0.15, mul: 0.8, key: 'vigil_lantern' }) : null]);
    mark('models');

    // 3. keep-out areas: arenas, checkpoints, spawns, water, setpiece boxes
    for (const zn of def.zones ?? []) {
      if (zn.kind === 'arena') this.block(zn.size ? { box: [zn.at[0] - zn.size[0] / 2 - 1, zn.at[1] - zn.size[1] / 2 - 1, zn.at[0] + zn.size[0] / 2 + 1, zn.at[1] + zn.size[1] / 2 + 1] } : { x: zn.at[0], z: zn.at[1], r: (zn.r ?? 12) + 1 });
      if (zn.kind === 'checkpoint') this.block({ x: zn.at[0], z: zn.at[1], r: 3 });
      if (zn.keepClear) this.block(zn.size ? { box: [zn.at[0] - zn.size[0] / 2, zn.at[1] - zn.size[1] / 2, zn.at[0] + zn.size[0] / 2, zn.at[1] + zn.size[1] / 2] } : { x: zn.at[0], z: zn.at[1], r: zn.keepClear === true ? (zn.r ?? 5) : zn.keepClear });
    }
    for (const s of Object.values(def.spawns ?? {})) this.block({ x: s[0], z: s[1], r: 2 });

    // 3b. level lights (a fixed pool that follows the nearest lit flames) and fireflies
    const focus = () => ctx.player?.object3d?.position ?? ctx.camera?.position ?? null;
    if (def.lights) {
      const pool = level.lightPool = new LightPool(level.groups.props, def.lights.n ?? def.lights, def.lights.opts ?? {});
      level.animators.push({ render: (dt, t) => pool.update(focus(), t) });
    }
    if (def.fireflies) {
      const ff = level.fireflies = new Fireflies(def.fireflies === true ? {} : def.fireflies);
      level.groups.props.add(ff.points);
      level.animators.push({ render: (dt, t) => { const f = focus(); ff.update(t, f, ctx.env, f ? f.y : 0); } });
    }

    // 4. zones: setpieces + placed models first (they occupy space), then the gameplay parts
    for (const zn of def.zones ?? []) {
      if (zn.props) await this._setpiece(zn.props, zn);
      for (const p of zn.placed ?? []) await this._placed(p, zn);
    }
    mark('setpieces');
    for (const zn of def.zones ?? []) this._zone(zn);
    if (typeof def.decorate === 'function') { try { await def.decorate(this); } catch (e) { console.error(`[world] ${def.id}: decorate failed`, e); } }

    // 5. scatter, crates, fish lines, breadcrumbs
    for (const s of def.scatter ?? []) await this._scatter(s);
    if (def.crates) this._crates(typeof def.crates === 'number' ? { n: def.crates } : def.crates);
    if (def.fishLines?.length) this.onLoaded(() => { def.fishLines.forEach(([a, b, n], i) => level.pickups.fishLine(a, b, n, i)); });
    if (def.breadcrumbs) this._breadcrumbs(def.breadcrumbs);
    mark('scatter');

    // 6. far dressing: skyline silhouettes, Dawnstone glow, horizon tree line
    await this._farDressing();
    mark('far');

    // paved streets carry no grass (cleared before the ground-data texture is built)
    if (def.pave) {
      const pv = def.pave, clearLine = (pts, w) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.0));
          for (let k = 0; k <= n; k++) this.clear(ax + (bx - ax) * k / n, az + (bz - az) * k / n, w / 2 + 0.3, 0);
        }
      };
      clearLine(this.terrain.spine, (def.pathWidth ?? 6) + (pv.widen ?? 0.6));
      for (const p of this.terrain.paths) clearLine(p.pts, p.width + (pv.widen ?? 0.6));
      for (const e of pv.extra ?? []) clearLine(e.pts, e.width);
      for (const [x, z, r] of pv.discs ?? []) this.clear(x, z, r + 0.3, 0);
    }

    // 7. render outputs: ground, grass, water, props batch, trees
    // §18 budget: Low draws the ground at half resolution in one call; Med / High in 2 × 2 frustum-culled tiles
    const lowQ = ctx.quality?.id === 'low';
    const out = this.terrain.finalize(lowQ ? { step: 2, chunks: 1 } : { step: 1, chunks: 2, lod: ctx.quality?.id !== 'high' });
    mark('ground');
    this.terrain.dataTexture = out.dataTexture;
    level.groups.terrain.add(out.mesh);
    /** ground tiles within this many metres of the camera draw full resolution (0 = no LOD tiles) */
    level.groundLod = out.mesh.isGroup && out.mesh.children.some((c) => c.userData.lod) ? 34 : 0;
    // paved streets (town cobbles): textured ribbons along the spine, the side paths and `pave.extra`, plus plazas
    if (def.pave) {
      const pv = def.pave, rng = this.rng.fork('pave');
      const lines = [{ pts: this.terrain.spine, width: (def.pathWidth ?? 6) + (pv.widen ?? 0.6) }, ...this.terrain.paths.map((p) => ({ pts: p.pts, width: p.width + (pv.widen ?? 0.6) })), ...(pv.extra ?? [])];
      try {
        const mesh = await paveRibbons(ctx, { lines, discs: pv.discs ?? [], heightAt: (x, z) => this.terrain.heightAt(x, z), texture: pv.texture, tint: pv.tint, tile: pv.tile ?? 2.6,
          color: pv.color ?? '#FFFFFF', edge: pv.edge ?? '#9A9078', rng, name: 'pave:' + def.id });
        if (mesh) { level.groups.terrain.add(mesh); level.pave = mesh; }
      } catch (e) { console.warn(`[world] ${def.id}: paving failed`, e); }
      mark('pave');
    }
    if ((def.grass ?? this.biome.grass) !== false) {
      const g = def.grass ?? {};
      level.grass = new Grass({ ground: out.dataTexture, size: this.terrain.size, res: this.terrain.res, quality: ctx.quality,
        colors: g.colors ?? GRASS_COLORS[def.biome ?? def.id] ?? GRASS_COLORS.meadow, seed: (def.seed ?? 7) * 31 + 7,
        height: g.height, near: g.near, far: g.far, flowers: g.flowers });
      level.groups.grass.add(level.grass.group);
    }
    if (def.water?.length) { level.waterMeshes = new WaterSet(def.water, def.size ?? 200); level.groups.water.add(level.waterMeshes.group); }
    level.batch = this.batch;
    this.batch.build(level.groups.props, { spareInstances: 64, spareVertices: 6000 });
    this._buildTrees();
    mark('batch');

    // 8. spawns, anchors (+ fog_edge_0..7), checkpoints as spawns
    for (const [id, s] of Object.entries(def.spawns ?? {})) this.spawn(id, s[0], s[1], s[2] ?? 0, s[3]);
    if (!level.spawns.start) { const p = def.spine?.[0] ?? [0, 0]; this.spawn('start', p[0], p[1], 0); }
    for (const v of level.vigils) if (!level.spawns[v.id]) level.spawns[v.id] = { pos: v.spawn.pos.clone(), facing: v.spawn.facing };
    for (const [id, a] of Object.entries(def.anchors ?? {})) {
      if (Array.isArray(a)) this.anchor(id, a[0], a[1], a[2], a[3] ?? 0);
      else this.anchor(id, a.at[0], a.at[1], a.y, a.facing ?? 0);
    }
    const half = level.half;
    for (let i = 0; i < 8; i++) {          // §12.1: fog_edge_0..7 on the bounds, inset 6 m, at 45° steps
      const a = (i / 8) * Math.PI * 2, r = half - 6, k = Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)));
      const x = (Math.sin(a) / k) * r, z = (Math.cos(a) / k) * r;
      if (!level.anchors['fog_edge_' + i]) this.anchor('fog_edge_' + i, x, z, undefined, a + Math.PI);
    }

    // 9. mark everything level-built as owned (LevelManager disposes it); keep the templates for dispose
    level.templates = this.templates;
    level.root.traverse((o) => { o.userData.owned = true; });
    return level;
  }

  // ------------------------------------------------------------------ zones
  async _setpiece(name, zone) {
    const fn = this.def.setpieces?.[name] ?? SETPIECES[name];
    if (!fn) { this.warnOnce(`[world] ${this.def.id}: unknown setpiece "${name}"`); return; }
    try { await fn(this, zone); } catch (e) { console.error(`[world] ${this.def.id}: setpiece ${name} failed`, e); }
  }

  /** A hand-placed model inside a zone: static prop, or a Critter when it has a `clip` (sleeping cows). */
  async _placed(p, zone) {
    if (p.clip || p.critter) {
      const [x, z] = p.at;
      const c = new Critter(this.ctx, { model: p.model, fit: p.fit, clip: p.clip, kind: p.kind ?? 'cow', meowWakes: p.meowWakes,
        walkTo: p.walkTo ? new THREE.Vector3(p.walkTo[0], 0, p.walkTo[1]) : null, pos: new THREE.Vector3(x, this.h(x, z), z), facing: p.yaw ?? 0,
        radius: p.radius ?? 0.8, height: p.height ?? 1.6 });
      c.critterId = p.id ?? `${zone.id}:${p.kind ?? 'critter'}`;
      this.level.critters.push(c);
      this.actor(c, null);
      c.load();
      const r = p.radius ?? 0.9;
      this.occupy(x, z, r + 0.6); this.clear(x, z, r * 0.6, 0.4);
      return;
    }
    const tpl = await this.tpl(p.model, p.tpl ?? {});
    if (tpl) this.place(tpl, p.at[0], p.at[1], { fit: p.fit, yaw: p.yaw ?? this.rng.angle(), y: p.y, collider: p.collider, tree: p.tree });
  }

  _zone(zn) {
    const { ctx, level } = this;
    switch (zn.kind) {
      case 'arena': {
        const a = new Arena(ctx, zn, (x, z) => this.h(x, z), level);
        level.arenas.push(a);
        this.onLoaded(() => a.restore());       // before the rescue / kitten spawns below read the cleared state
        if (zn.interact) this._interactZone(zn.interact);
        if (zn.rescue) this._rescue(zn);
        break;
      }
      case 'trigger':
        this.trigger({ id: zn.id, at: zn.at, r: zn.r, size: zn.size, yaw: zn.yaw, when: zn.when, once: zn.once !== false,
          fire: () => this._fireTrigger(zn) });
        break;
      case 'checkpoint': this._vigil(zn); break;
      case 'open': this._open(zn); break;
      case 'kitten': this._kitten(zn); break;
      case 'letter':
        // `y` lifts it above the ground (a stump top, a ledge); `yAbs` puts it at an absolute height
        this.onLoaded(() => { if (this.cond(zn.onlyIf)) this._lift(level.pickups.placeLetter(zn.letterId ?? zn.id, zn.at[0], zn.at[1]), zn); });
        this.clear(zn.at[0], zn.at[1], 0.7, 0.3);
        break;
      case 'heartBell':
        this.onLoaded(() => { if (this.cond(zn.onlyIf)) this._lift(level.pickups.placeHeartBell(zn.bellId ?? zn.id, zn.at[0], zn.at[1]), zn); });
        this.clear(zn.at[0], zn.at[1], 0.8, 0.2);
        break;
      case 'exit':
        this.trigger({ id: zn.id, at: zn.at, size: zn.size ?? [8, 2], r: zn.r, when: zn.when, once: true,
          fire: () => ctx.levels?.exit?.(zn.to, zn.spawnId ?? 'start', zn) });
        // a gated exit (`when`): reaching it early shows `blocked` ({ toast, text }) on every entry instead
        if (zn.when != null && zn.blocked) {
          this.trigger({ id: zn.id + ':blocked', at: zn.at, size: zn.size ?? [8, 2], r: zn.r, once: false,
            when: (s, c) => !condOk(c, zn.when),
            fire: () => {
              const b = zn.blocked, st = ctx.strings;
              const text = b.toast && (st?.has?.(b.toast) ?? false) ? st.t(b.toast) : (b.text ?? b.toast);
              ctx.bus.emit(E.TOAST, { text, icon: b.icon ?? 'hint', key: zn.id + ':blocked' });
            } });
        }
        break;
      case 'interact': this._interactZone(zn); break;
      default: break;     // setpiece / platforming / objective zones: content comes from their builders
    }
    if (zn.interact && zn.kind !== 'arena' && zn.kind !== 'interact') this._interactZone(zn.interact);
    for (const h of zn.hints ?? []) this._hint(zn, h);
  }

  /**
   * A one-time tutorial hint tied to a zone (§12.3 Crow Fields: `tut.pounce` on the first crow alert, `tut.reflect` on
   * the first crossbow shot): { key, on: 'alert' | 'telegraph', type } → `ui:toast` once per save (flag `seen.<key>`;
   * story's tutorial can read the same flag). Only while the zone's `onlyIf` holds.
   */
  _hint(zn, h) {
    const { ctx, level } = this, flag = 'seen.' + h.key;
    const ev = h.on === 'telegraph' ? E.TELEGRAPH : h.on === 'jeer' ? E.ENEMY_JEER : E.ENEMY_ALERTED;
    level.listen(ev, (p) => {
      const a = p?.actor ?? p?.enemy;
      const type = a?.def?.id ?? a?.type ?? null;
      if ((h.type && type !== h.type) || (h.on === 'jeer' && p?.on === false) || !this.cond(zn.onlyIf) || ctx.state?.getFlag?.(flag)) return;
      ctx.state?.setFlag?.(flag, true);
      const st = ctx.strings, text = st?.has?.(h.key) !== false && st?.t ? st.t(h.key) : (h.text ?? h.key);
      ctx.bus.emit(E.TOAST, { text: text === h.key && h.text ? h.text : text, icon: 'hint', key: h.key });
    });
  }

  /** Raise a placed pickup by the zone's `y` (above the ground) or to `yAbs` (absolute). */
  _lift(it, zn) {
    if (!it) return;
    const dy = Number.isFinite(zn.yAbs) ? zn.yAbs - it.pos.y : (zn.y ?? 0);
    if (!dy) return;
    it.pos.y += dy;
    if (it.mesh) it.mesh.position.y += dy;
  }

  _fireTrigger(zn) {
    const ctx = this.ctx;
    if (zn.flag) for (const [k, v] of Object.entries(zn.flag)) (ctx.story?.flag ? ctx.story.flag(k, v) : ctx.state?.setFlag?.(k, v));
    if (zn.toast) ctx.bus.emit(E.TOAST, { text: ctx.strings?.t?.(zn.toast) ?? zn.toast });
    if (zn.play && !ctx.story?.isPlaying) ctx.story?.play?.(zn.play);
  }

  _interactZone(it) {
    this.interact({ id: it.id, at: it.at, r: it.r ?? 1.8, y: it.y, prompt: it.prompt ?? `prompt.${it.id}`, kind: it.kind ?? 'interact',
      enabled: () => this.cond(it.when) && !this.ctx.story?.isPlaying,
      use: () => { if (it.flag) for (const [k, v] of Object.entries(it.flag)) this.ctx.story?.flag?.(k, v); if (it.play) this.ctx.story?.play?.(it.play); } });
  }

  _vigil(zn) {
    const { ctx, level } = this;
    const [x, z] = zn.at;
    // face along the spine (toward where she is heading), unless the zone says otherwise
    let facing = zn.facing;
    if (facing == null && this.def.spine?.length > 1) {
      const seg = { i: 0, t: 0, along: 0 };
      distToPolyline(x, z, this.def.spine, seg);
      const a = this.def.spine[seg.i], b = this.def.spine[seg.i + 1];
      facing = Math.atan2(b[0] - a[0], b[1] - a[1]);
    }
    const v = new VigilStone(ctx, level, { id: zn.id, at: zn.at, facing: facing ?? 0, heightAt: (px, pz) => this.h(px, pz) });
    level.vigils.push(v);
    level.interactables.push(v.interactable);
    this.place(KIT_MODELS.obelisk, x, z, { fit: { h: VIGIL.obeliskH }, yaw: facing ?? 0, collider: 'circle', shrink: 0.7, jitter: 0 });
    const lo = v._lanternOffset();
    this.place('vigil_lantern', lo.x, lo.z, { fit: { h: VIGIL.lanternH }, yaw: facing ?? 0, collider: false, jitter: 0, occupy: 0.3 });
    this.paint(x, z, 2.2, '#4A4632', 0.55, 1.2);
    this.clear(x, z, 1.6, 0.25);
    this.occupy(x, z, 2.2);
    this.onLoaded(() => {
      const rt = ctx.state?.runtime?.worldVigil;
      const cur = (rt?.levelId === level.id ? rt.id : null) ?? (ctx.state?.levelId === level.id ? ctx.state?.spawnId : null) ?? level.spawnId;
      if (cur === zn.id) v.activate({ silent: true });
    });
  }

  /** Open-fight spawns: [type, n, [x, z], patrolRadius, opts]. */
  _open(zn) {
    const { ctx, level } = this;
    for (const s of zn.spawns ?? []) {
      const [, n = 1, at = zn.at] = s;
      this.clear(at[0], at[1], 0.5, 0.6);
      level.enemySpawns.push({ type: s[0], n, pos: new THREE.Vector3(at[0], this.h(at[0], at[1]), at[1]), patrolRadius: s[3] ?? 0, zone: zn.id });
    }
    this.onLoaded(() => {
      if (!this.cond(zn.onlyIf) || !ctx.enemies?.spawn) return;
      const st = ctx.state, flag = openZoneFlag(level.id ?? this.def.id, zn.id);
      if (st?.getFlag?.(flag)) { try { ctx.companions?.markCleared?.(zn.id); } catch { /* optional */ } return; }   // cleared on an earlier visit (saved)
      // loading at a Vigil Stone (Continue / reload): it is a safe spot, so groups near it stay away this load
      const sp = level.vigils.some((v) => v.id === level.spawnId) ? level.spawns[level.spawnId]?.pos : null;
      const mine = [];
      for (const [type, n = 1, at = zn.at, patrolR = 0, opts = {}] of zn.spawns ?? []) {
        if (sp && Math.hypot(at[0] - sp.x, at[1] - sp.z) < OPEN_ZONE.safeLoadR) continue;
        for (let i = 0; i < n; i++) {
          const a = i * 2.399 + 0.7, rr = n > 1 ? Math.min(1.6, 0.6 + patrolR * 0.25) : 0;
          const x = at[0] + Math.sin(a) * rr, z = at[1] + Math.cos(a) * rr;
          const facing = this.rng.angle();
          const e = ctx.enemies.spawn(type, new THREE.Vector3(x, this.h(x, z), z), { facing, patrolRadius: patrolR, home: new THREE.Vector3(at[0], 0, at[1]), zone: zn.id, ...opts });
          if (e) { level.spawnedEnemies.push(e); mine.push(e); }
        }
      }
      // every enemy of the zone down → `<level>.cleared.<zone>` (saved with the flags; skipped on later loads), then
      // the zone's `clearPlay` scene (town bakery → D-03) and `onClear` hook
      if (mine.length) level.listen(E.ENEMY_DIED, (p) => {
        if (!mine.includes(p?.enemy) || mine.some((e) => e.alive && ctx.enemies?.list?.includes?.(e) !== false)) return;
        if (st?.getFlag?.(flag)) return;
        st?.setFlag?.(flag, true);
        this._zoneCleared(zn);
      });
    });
  }

  /** An open zone's enemies are all down (now or on an earlier visit, when `again` is set). */
  _zoneCleared(zn) {
    const ctx = this.ctx;
    try { ctx.companions?.markCleared?.(zn.id); } catch { /* optional: companions' appearOn / needClear */ }
    if (zn.clearEvent) ctx.bus.emit(E.ARENA_CLEAR, { id: zn.id, open: true });     // story / audio treat it like an arena
    try { zn.onClear?.(this.level, ctx); } catch (e) { console.error(`[world] zone ${zn.id} onClear failed`, e); }
    if (zn.clearPlay && this.cond(zn.clearWhen)) {
      const L = this.level;
      const play = () => { if (!this.cond(zn.clearWhen)) return; if (!ctx.story?.isPlaying) ctx.story?.play?.(zn.clearPlay); else L.after(0.5, play); };
      L.after(zn.clearDelay ?? 1.2, play);
    }
  }

  _kitten(zn) {
    const { ctx, level } = this;
    if (zn.hide === 'meow' || zn.hide === 'cage') this.clear(zn.at[0], zn.at[1], 1.0, 0.3);
    this.occupy(zn.at[0], zn.at[1], 1.2);
    level.kittens.push({ id: zn.kittenId ?? zn.id, at: zn.at, hide: zn.hide });
    level.npcs.push({ id: zn.kittenId ?? zn.id, kind: 'kitten', pos: new THREE.Vector3(zn.at[0], this.h(zn.at[0], zn.at[1]), zn.at[1]) });
    this.onLoaded(() => {
      const id = zn.kittenId ?? zn.id;
      if (!this.cond(zn.onlyIf) || ctx.state?.kittens?.includes?.(id) || !ctx.companions?.spawnKitten) return;
      const opts = { prop: zn.prop === 'cow' ? null : zn.prop, standTime: zn.standTime, needClear: zn.needClear, y: zn.y, facing: zn.facing,
        zoneR: zn.zoneR, hits: zn.hits, cage: zn.cage, ribbon: zn.ribbon, ...(zn.opts ?? {}) };
      for (const k of Object.keys(opts)) if (opts[k] == null) delete opts[k];
      ctx.companions.spawnKitten(id, [zn.at[0], this.h(zn.at[0], zn.at[1]), zn.at[1]], zn.hide ?? null, opts);
    });
  }

  /** Arena `rescue`: a caged squire (Mochi D-01) behind the arena's waves. */
  _rescue(zn) {
    const { ctx } = this, r = zn.rescue;
    this.onLoaded(() => {
      const st = ctx.state, id = r.companion;
      if (st?.companions?.unlocked?.includes?.(id) || (r.flag && st?.getFlag?.(r.flag))) return;
      ctx.companions?.spawnKitten?.(id, [r.cage[0], this.h(r.cage[0], r.cage[1]), r.cage[1]], 'cage', { hp: r.hp ?? 30, needClear: zn.id, play: r.play, cage: r.style ?? 'cart', y: r.y, facing: r.facing });
    });
  }

  // ------------------------------------------------------------------ scatter
  _scatterOk(x, z, s, r) {
    const L = this.level, lim = L.half - (s.edge ?? 5);
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
    const pw = (this.def.pathWidth ?? 6) / 2;
    const minPath = Math.max(pw + 0.8 + r * 0.5, s.minDistFromPath ?? 0);
    if (this.def.spine?.length > 1 && distToPolyline(x, z, this.terrain.spine) < minPath) return false;
    for (const p of this.terrain.paths) if (distToPolyline(x, z, p.pts) < p.width / 2 + 1 + r * 0.5) return false;
    for (const w of this.def.water ?? []) if (w.kind === 'stream' && distToPolyline(x, z, w.pts ?? [w.from, w.to]) < (w.width ?? 6) / 2 + 1.5 + r) return false;
    if (s.area) { if (s.area.size ? !inBox(x, z, s.area.at, s.area.size) : Math.hypot(x - s.area.at[0], z - s.area.at[1]) > s.area.r) return false; }
    if (!s.ignoreBlockers) for (const b of this.blockers) {
      if (b.box) { if (x > b.box[0] - r && x < b.box[2] + r && z > b.box[1] - r && z < b.box[3] + r) return false; }
      else if (Math.hypot(x - b.x, z - b.z) < b.r + r) return false;
    }
    return this.free(x, z, r);
  }

  /** `scatter` entry: { model (path | paths), n, fit, minDistFromPath, minDist, area, along: [min, max] (m beside the spine), tree, collider, tilt, sink, clump, jitter, edge }. */
  async _scatter(s) {
    const tpls = (await Promise.all([].concat(s.model).map((p) => this.tpl(p, s.tpl ? { ...s.tpl, key: (s.tpl.key ?? 'scatter') + ':' + p } : {})))).filter(Boolean);
    if (!tpls.length) return;
    const rng = this.rng.fork(String(s.model) + (s.n ?? 0));
    const n = s.n ?? 10, half = this.level.half - (s.edge ?? 5);
    const isTree = s.tree ?? tpls.every((t) => /\/tree_|\/trees_|\/pine/.test(t.path ?? ''));
    let made = 0, tries = 0;
    while (made < n && tries < n * 80) {
      tries++;
      let x, z;
      if (s.area?.size) { x = s.area.at[0] + (rng() - 0.5) * s.area.size[0]; z = s.area.at[1] + (rng() - 0.5) * s.area.size[1]; }
      else if (s.area?.r) { const a = rng.angle(), rr = Math.sqrt(rng()) * s.area.r; x = s.area.at[0] + Math.sin(a) * rr; z = s.area.at[1] + Math.cos(a) * rr; }
      else if (s.along) {             // a band beside the spine (trees lining the forest path): [minDist, maxDist]
        const Ls = this._spineLen ??= polylineLength(this.terrain.spine);
        const [px, pz, yaw] = pointAlong(this.terrain.spine, rng() * Ls), side = rng.sign(), d = s.along[0] + rng() * (s.along[1] - s.along[0]);
        x = px + Math.cos(yaw) * d * side; z = pz - Math.sin(yaw) * d * side;
      } else if (s.band) { const a = rng.angle(), rr = s.band[0] + rng() * (s.band[1] - s.band[0]); const k = Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a))); x = Math.sin(a) / k * rr; z = Math.cos(a) / k * rr; }
      else { x = (rng() * 2 - 1) * half; z = (rng() * 2 - 1) * half; }
      const r = s.minDist ?? (isTree ? 2.5 : 1.2);
      if (!this._scatterOk(x, z, s, r)) continue;
      const tpl = rng.pick(tpls);
      const tilt = s.tilt ?? (isTree ? 0.03 : 0.08);
      const placed = this.place(tpl, x, z, { fit: s.fit, yaw: rng.angle(), tree: isTree, collider: s.collider ?? (s.noCollider ? false : 'auto'),
        tiltX: (rng() - 0.5) * tilt, tiltZ: (rng() - 0.5) * tilt, sink: s.sink ?? (isTree ? 0.15 : 0.05), jitter: s.jitter ?? 0.08, shrink: s.shrink,
        occupy: r, clear: s.clear, fade: s.fade });
      if (!placed) continue;
      made++;
      if (s.paint) this.paint(x, z, placed.radius * (s.paintR ?? 1.1), s.paint, s.paintW ?? 0.5);
    }
    if (made < n && s.warn !== false) console.info(`[world] ${this.def.id}: scattered ${made}/${n} ${[].concat(s.model)[0].split('/').pop()}`);
  }

  // ------------------------------------------------------------------ crates (breakables)
  _crates(o) {
    const { ctx, level } = this;
    const rng = this.rng.fork('crates');
    const spine = this.terrain.spine, L = polylineLength(spine);
    const n = o.n ?? 10, milk = o.milk ?? 2;
    const models = [KIT_MODELS.crate, KIT_MODELS.crateB, KIT_MODELS.barrel];
    const fits = { [KIT_MODELS.crate]: 0.78, [KIT_MODELS.crateB]: 0.72, [KIT_MODELS.barrel]: 0.88 };
    let made = 0, tries = 0, clusterLeft = 0, cx = 0, cz = 0, cyaw = 0;
    const milkAt = new Set();
    while (milkAt.size < Math.min(milk, n)) milkAt.add(rng.int(0, n - 1));
    while (made < n && tries < n * 60) {
      tries++;
      if (clusterLeft <= 0) {
        const [px, pz, yaw] = pointAlong(spine, (0.08 + rng() * 0.84) * L);
        const side = rng.sign(), off = (this.def.pathWidth ?? 6) / 2 + 1.6 + rng() * 3;
        cx = px + Math.cos(yaw) * off * side; cz = pz - Math.sin(yaw) * off * side; cyaw = yaw;
        clusterLeft = rng.int(1, 3);
      }
      const x = cx + (rng() - 0.5) * 1.6, z = cz + (rng() - 0.5) * 1.6;
      const wl = level.waterLevelAt(x, z);
      if (!this._scatterOk(x, z, { edge: 8 }, 0.7) || (wl !== null && wl > this.h(x, z) - 0.05)) { clusterLeft--; continue; }   // never in the water (gate)
      const path = rng.pick(models);
      const p = this.place(path, x, z, { fit: { h: fits[path] }, yaw: cyaw + (rng() - 0.5) * 0.8, collider: 'box', shrink: 0.95, jitter: 0.08, occupy: 0.7, cull: true });
      if (!p) { clusterLeft--; continue; }
      const hasMilk = milkAt.has(made);
      const pos = new THREE.Vector3(x, p.y, z);
      // broken on an earlier visit (saved bitmask `<level>.crates.<k>`): placed (keeps the layout) but gone
      const bit = made % 30, cflag = `${this.def.id}.crates.${Math.floor(made / 30)}`;
      if ((Number(ctx.state?.getFlag?.(cflag)) | 0) & (1 << bit)) {
        this.batch.setVisible(p.handle, false);
        for (const c of p.colliders) level.removeCollider(c);
        made++; clusterLeft--;
        continue;
      }
      // hit sounds come from audio (combat:hit → the actor's `material`), the break crunch + splinters from the
      // `crate` / `barrel` burst (fx debris, audio crateBreak)
      const kind = path === KIT_MODELS.barrel ? 'barrel' : 'crate';
      const a = new PropActor(ctx, { id: `crate_${made}`, kind, hp: 1, radius: p.radius * 0.8, height: p.top - p.y, pos, wobble: 0.2,
        visual: { batch: this.batch, handle: p.handle, base: p.matrix },
        onBreak: (self) => {
          const st = ctx.state;
          if (st?.setFlag) st.setFlag(cflag, (Number(st.getFlag?.(cflag)) | 0) | (1 << bit));
          this.batch.setVisible(p.handle, false);
          for (const c of p.colliders) level.removeCollider(c);
          level.pickups.dropCrate(pos, { milk: hasMilk });
          ctx.bus.emit(E.BURST, { kind, position: pos.clone().setY(pos.y + 0.4), count: 14 });
          level.removeActor(self);
        } });
      a.tags.add('crate');
      if (hasMilk) a.tags.add('milk');
      this.onLoaded(() => this.actor(a));
      made++; clusterLeft--;
    }
  }

  // ------------------------------------------------------------------ cosmetic breadcrumb letters
  _breadcrumbs(o) {
    const tpl = this.proc('breadcrumb_letter', () => {
      const paper = new THREE.BoxGeometry(0.34, 0.014, 0.24);
      const flap = new THREE.ConeGeometry(0.17, 0.02, 4, 1); flap.rotateY(Math.PI / 4); flap.scale(1.4, 1, 0.9); flap.translate(0, 0.012, 0.0);
      const seal = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 12); seal.translate(0, 0.018, 0);
      return [[paper, '#CFC3A6'], [flap, '#B8A57E'], [seal, '#C9587C']];
    });
    const rng = this.rng.fork('breadcrumbs');
    const n = o.n ?? 6;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = o.from[0] + (o.to[0] - o.from[0]) * t + (rng() - 0.5) * 2.2, z = o.from[1] + (o.to[1] - o.from[1]) * t + (rng() - 0.5) * 2.2;
      this.place(tpl, x, z, { yaw: rng.angle(), collider: false, clear: 0.25, occupy: false, lift: 0.005, tiltX: (rng() - 0.5) * 0.1, jitter: 0.04, scale: 1.1 });
    }
  }

  // ------------------------------------------------------------------ far dressing
  async _farDressing() {
    const { def, level } = this;
    const sky = new Silhouettes({ base: def.skylineColor ?? '#2F363C', toFog: def.skylineFog ?? 0.7 });
    const hor = new Silhouettes({ base: def.horizonColor ?? '#283026', toFog: def.horizonFog ?? 0.8 });
    level.skyline = { update: (fc) => { sky.update(fc); hor.update(fc); }, dispose: () => { sky.dispose(); hor.dispose(); } };
    level.groups.skyline.add(sky.group, hor.group);
    const bake = (out, tpl, m) => {
      const g = tpl.geometry.clone(); g.applyMatrix4(m); out.push(g);
      for (const p of tpl.parts) { const pg = p.geometry.clone(); pg.applyMatrix4(_m2.copy(m).multiply(_m.makeTranslation(p.pivot.x, p.pivot.y, p.pivot.z))); out.push(pg); }
    };
    const finish = (geos, sil, name) => {
      if (!geos.length) return;
      for (const g of geos) for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
      const merged = mergeGeometries(flat, false);
      for (const g of new Set([...geos, ...flat])) g.dispose();
      const mesh = new THREE.Mesh(merged, sil.material);
      mesh.name = name; mesh.frustumCulled = false; mesh.userData.camFade = false; mesh.userData.owned = true;
      sil.add(mesh);
    };
    const skyGeos = [];
    for (const s of def.skyline ?? []) {
      const tpl = await this.tpl(s.model);
      if (!tpl) continue;
      const sc = fitScale(s.model, tpl, s.fit, this.rng).scale;
      bake(skyGeos, tpl, trs(new THREE.Matrix4(), s.at[0], s.y ?? 0, s.at[1], s.yaw ?? 0, sc).multiply(_m.makeTranslation(0, -tpl.box.min.y, 0)));
    }
    finish(skyGeos, sky, 'skyline');
    // horizon tree line: dark fog-proof silhouettes in a band outside the playable area
    const hz = def.horizon === false ? null : (def.horizon ?? {});
    const hpaths = hz ? (hz.models ?? this.biome.horizon) : [];
    if (hpaths.length) {
      const tpls = (await Promise.all(hpaths.map((p) => this.tpl(p)))).filter(Boolean);
      const rng = this.rng.fork('horizon');
      // §18 budget: Low keeps 40 % of the tree line (it is a fogged silhouette band either way)
      const n = Math.round((hz.n ?? 70) * (this.ctx.quality?.id === 'low' ? 0.4 : 1)), [r0, r1] = hz.r ?? [level.half + 14, level.half + 60], [h0, h1] = hz.h ?? [9, 18];
      const geos = [];
      for (let i = 0; i < n && tpls.length; i++) {
        const a = (i / n) * Math.PI * 2 + (rng() - 0.5) * 0.08, rr = r0 + rng() * (r1 - r0);
        const tpl = rng.pick(tpls);
        const sc = (h0 + rng() * (h1 - h0)) / Math.max(0.01, tpl.box.max.y - tpl.box.min.y);
        bake(geos, tpl, trs(new THREE.Matrix4(), Math.sin(a) * rr, (hz.y ?? 2) - 1, Math.cos(a) * rr, rng.angle(), sc).multiply(_m.makeTranslation(0, -tpl.box.min.y, 0)));
      }
      finish(geos, hor, 'horizon');
    }
    // the Dawnstone: a warm emissive glow at an anchor (fog-proof)
    if (def.dawnstone) {
      const a = def.anchors?.[def.dawnstone.anchor ?? 'bell_far'];
      if (a) {
        const s = makeGlowSprite({ color: def.dawnstone.color ?? '#FFC46B', size: def.dawnstone.size ?? 9, intensity: def.dawnstone.intensity ?? 2.6, fog: false });
        s.position.set(a[0], a[2] ?? 30, a[1]);
        const core = makeGlowSprite({ color: '#FFE9B8', size: (def.dawnstone.size ?? 9) * 0.28, intensity: 3.0, fog: false });
        core.position.copy(s.position);
        level.groups.dawnstone.add(s, core);
        level.dawnstone = s;
        if (def.dawnstone.offWhen) this.onLoaded(() => level.setDawnstone(!this.cond(def.dawnstone.offWhen)));
      }
    }
  }

  _buildTrees() {
    const { level } = this;
    if (!this.treeSets.size) return;
    const u = level.treeUniforms ?? (level.treeUniforms = { uTime: { value: 0 }, uWind: { value: 0.6 }, uTreeH: { value: 1 } });
    for (const set of this.treeSets.values()) {
      const tpl = set.tpl;
      const uni = { ...u, uTreeH: { value: Math.max(0.01, tpl.box.max.y - tpl.box.min.y) } };
      const mat = set.sway ? makeTreeMaterial(uni) : this.material();
      const mesh = new THREE.InstancedMesh(tpl.geometry, mat, set.items.length);
      mesh.name = set.name;
      set.items.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, it.c ?? _c.setRGB(1, 1, 1)); });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.camFade = true; mesh.userData.owned = true;
      level.groups.props.add(mesh);
      level.trees.push(mesh);
    }
  }
}

// ---------------------------------------------------------------------------------------------- shared setpieces
/** Built-in setpiece builders (levels may add their own through `def.setpieces`). */
export const SETPIECES = {
  /** 8 standing stones on a circle (zone.stones: model list, zone.stoneFit, zone.stoneR). */
  async stoneRing8(kit, zone) {
    const models = zone.stones ?? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((k) => `models/env/nature/stone_tall${k}.glb`);
    const tpls = await Promise.all(models.map((m) => kit.tpl(m)));
    const R = zone.stoneR ?? 10, n = zone.stoneN ?? 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = zone.at[0] + Math.sin(a) * R, z = zone.at[1] + Math.cos(a) * R;
      const tpl = tpls[i % tpls.length];
      if (!tpl) continue;
      kit.place(tpl, x, z, { fit: zone.stoneFit ?? { h: 3.0 }, yaw: a + Math.PI / 2 + (kit.rng() - 0.5) * 0.4, collider: 'circle', shrink: 0.75,
        fade: zone.stoneFade ?? true,   // M2: the follow camera fades a stone it is behind / inside (was a flat grey face)
        tiltX: (kit.rng() - 0.5) * 0.08, tiltZ: (kit.rng() - 0.5) * 0.08, sink: 0.15, jitter: 0.05 });
      kit.paint(x, z, 1.6, '#3B3A26', 0.35);
    }
  },
};

/** Crate fish value range (for tests / docs). */
export const CRATE_FISH = ECONOMY.fish.crate;
