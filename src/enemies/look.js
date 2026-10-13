// src/enemies/look.js  (owner: enemies) — the per-visual "look" state of an enemy (ART_WARM_SPEC §5.1 / §5.4 / §7,
// WARM_ADVENTURE_SPEC §3.2 / §3.4 / §3.6 / §5.1): hit flash (`uFlash`), the wind-up / hover rim (`uHighlight`), a
// volume-preserving squash spring (wind-up squash, parry-window stretch, hit and hover kicks) and the hitstop shake.
//
// One EnemyLook travels with its visual (VisualPool, PERF §3.4): its materials are created once with the visual and
// never cloned again (ART D17). Writes go to the toon program's uniforms when the material has them (characters'
// `sc-toon` family: `userData.uniforms.uFlash / uHighlight`), else to `emissive` (the GLB's own standard materials) —
// only when the composed value changes, never per frame for an idle enemy.
//
// Hover: characters' `highlightObject` marks `root.userData.highlight = { color, strength }`; the materials are
// pre-tagged as their own highlight clones so it never clones them, and the hover rim is composed here with the rest.
import * as THREE from 'three';
import { WARM } from './tuning.js';
import { simplifyGeometry } from './lod.js';

const WHITE = new THREE.Color(1, 1, 1);
const _col = new THREE.Color();
const _hov = new THREE.Color();
const _out = new THREE.Color();
const _tmp = new THREE.Color();

/**
 * Squash spring step (pure; exported for tests): `st = { s, v }` relaxes toward `target` with stiffness `k` and damping
 * `d` over `dt`; `s` is the y-scale offset (sy = 1 + s), clamped to [min, max].
 * @param {{s: number, v: number}} st @param {number} target @param {number} dt @param {{k: number, d: number, min: number, max: number}} [S]
 */
export function springStep(st, target, dt, S = WARM.spring) {
  if (!(dt > 0)) return st.s;
  const h = Math.min(dt, 1 / 30);                        // stable semi-implicit Euler, sub-stepped for long frames
  let left = dt;
  while (left > 1e-6) {
    const k = Math.min(h, left);
    st.v += (-(S.k) * (st.s - target) - S.d * st.v) * k;
    st.s += st.v * k;
    left -= k;
  }
  if (st.s < S.min) { st.s = S.min; if (st.v < 0) st.v = 0; }
  if (st.s > S.max) { st.s = S.max; if (st.v > 0) st.v = 0; }
  return st.s;
}

/**
 * The materials an enemy visual may tint: its own (`enemyOwned`) lit materials, never shared props / beast-head parts.
 * Each entry keeps the base emissive so a reset restores the GLB look exactly.
 * @param {THREE.Object3D} root
 */
export function lookMaterials(root) {
  const out = [];
  root?.traverse((o) => {
    if (!o.isMesh || o.userData.sharedProp) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || !m.userData?.enemyOwned || out.some((x) => x.mat === m)) continue;
      const u = m.userData.uniforms;
      const toon = !!(u?.uFlash && u?.uHighlight);
      if (!toon && !m.emissive) continue;
      const base = m.emissive ? m.emissive.clone() : null, baseI = m.emissiveIntensity ?? 1;
      // characters' highlightObject: treat this material as its own highlight clone (no clone, no material swap)
      if (m.emissive && !m.userData.hiClone) Object.assign(m.userData, { hiClone: true, hiBase: base.clone(), hiBaseI: baseI });
      out.push({ mat: m, base, baseI, toon });
    }
  });
  return out;
}

export class EnemyLook {
  /** @param {THREE.Object3D} root the enemy's visual root */
  constructor(root) {
    this.root = root;
    this.mats = lookMaterials(root);
    /** current flash (0..1) and its decay */
    this.flash = 0; this.flashT = 0; this.flashDur = 0;
    /** wind-up rim: active until `hlUntil` (game time), then fades over WARM.highlight.fade */
    this.hlOn = false; this.hlUntil = 0; this.hlEnd = -Infinity; this.hl = 0;
    /** squash spring (sy = 1 + s) and its pose target (wind-up squash / parry stretch) */
    this.sq = { s: 0, v: 0 }; this.poseTarget = 0;
    /** hitstop shake */
    this.shakeT = 0; this.shakePh = 0; this.shakeX = 0;
    /** hover (characters' highlightObject mark) seen last frame */
    this._hoverKey = null;
    /** last composed values (apply() writes only on change) */
    this._f = 0; this._h = 0; this._hc = null; this._hk = 0;
  }

  /**
   * A hit landed (WA §5.1): flash 1 → 0 over the freeze + flashTail (≥ minFlash), Squash.kick(kick), shake while frozen.
   * @param {number} [hitstop] the world freeze just requested (game.hitstopT)
   */
  hit(hitstop = 0) {
    const H = WARM.hit, hs = Math.max(0, hitstop || 0);
    this.flash = H.flash;
    this.flashDur = Math.max(H.minFlash, hs + H.flashTail);
    this.flashT = this.flashDur;
    this.kick(H.kick);
    this.shakeT = hs;
  }

  /** Squash spring kick (+ stretch / − squash velocity, WA §3.6 / §5.1). */
  kick(v) { this.sq.v += v; }

  /** ART §5.1: the wind-up rim from now until `activeAt` (game time), then a WARM.highlight.fade fade. */
  windup(activeAt) { this.hlOn = true; this.hlUntil = activeAt; }

  /** The telegraph ended (strike, stagger, death): the rim fades from `now`. */
  endWindup(now) { if (this.hlOn) { this.hlOn = false; this.hlEnd = Math.min(now, this.hlUntil); } }

  /**
   * Advance on UNSCALED frame time (`rdt`, runs during hitstop) with the world clock `now` (frozen in hitstop).
   * Returns the y-scale multiplier (sy) of the squash spring; the shake offset is in `shakeX`.
   * @param {number} rdt real frame dt (0 in the pause menu) @param {number} now game.time
   */
  update(rdt, now) {
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - rdt);
      this.flash = this.flashDur > 0 ? WARM.hit.flash * (this.flashT / this.flashDur) : 0;
    } else this.flash = 0;
    const HL = WARM.highlight;
    if (this.hlOn && now > this.hlUntil) { this.hlOn = false; this.hlEnd = this.hlUntil; }
    if (this.hlOn) this.hl = HL.amount;
    else if (this.hlEnd > -Infinity) {
      this.hl = HL.amount * Math.max(0, Math.min(1, 1 - (now - this.hlEnd) / HL.fade));
      if (this.hl <= 0) { this.hl = 0; this.hlEnd = -Infinity; }
    } else this.hl = 0;
    // WA §3.6 hover boing: the frame the hover rim appears, Squash.kick(hoverKick)
    const hv = this.root?.userData?.highlight ?? null;
    if (hv && !this._hoverKey) this.kick(WARM.pose.hoverKick);
    this._hoverKey = hv ? hv.color ?? true : null;
    if (this.shakeT > 0) {
      this.shakeT = Math.max(0, this.shakeT - rdt);
      this.shakePh += rdt * WARM.hit.shakeHz;
      this.shakeX = (Math.floor(this.shakePh) & 1 ? 1 : -1) * WARM.hit.shake * (this.shakeT > 0 ? 1 : 0);
    } else this.shakeX = 0;
    springStep(this.sq, this.poseTarget, rdt);
    this.apply();
    return 1 + this.sq.s;
  }

  /** Compose flash + wind-up rim + hover into the materials (only when the composed value changed). */
  apply() {
    const hv = this.root?.userData?.highlight ?? null;
    const hoverK = hv ? (hv.strength ?? 1) : 0;
    const f = Math.round(this.flash * 100), h = Math.round(this.hl * 100);
    const hc = hv ? hv.color : null;
    if (f === this._f && h === this._h && hc === this._hc && hoverK === this._hk) return;     // no per-frame writes when idle
    this._f = f; this._h = h; this._hc = hc; this._hk = hoverK;
    const HL = WARM.highlight;
    _col.set(HL.color);
    if (hv) _hov.set(hv.color); else _hov.setRGB(0, 0, 0);
    for (const e of this.mats) {
      const m = e.mat;
      if (e.toon) {
        const u = m.userData.uniforms;
        u.uFlash.value = this.flash;
        const hl = u.uHighlight.value;
        // rgb + amount: the wind-up rim wins over a hover rim
        if (this.hl > 0) { if (hl.isVector4) hl.set(_col.r, _col.g, _col.b, this.hl); else hl.copy(_col).multiplyScalar(this.hl); }
        else if (hoverK > 0) { if (hl.isVector4) hl.set(_hov.r, _hov.g, _hov.b, hoverK); else hl.copy(_hov).multiplyScalar(hoverK); }
        else if (hl.isVector4) hl.set(1, 1, 1, 0); else hl.setRGB(0, 0, 0);
        continue;
      }
      if (!m.emissive) continue;
      _out.copy(e.base);
      if (hoverK > 0) _out.add(_tmp.copy(_hov).multiplyScalar(HL.emissive * hoverK));
      if (this.hl > 0) _out.add(_tmp.copy(_col).multiplyScalar(HL.emissive * this.hl));
      if (this.flash > 0) _out.lerp(WHITE, this.flash);
      m.emissive.copy(_out);
      m.emissiveIntensity = this.flash > 0 || this.hl > 0 || hoverK > 0 ? Math.max(e.baseI, 1) : e.baseI;
    }
  }

  /** Back to the GLB look (VisualPool release / reuse). */
  reset() {
    this.flash = 0; this.flashT = 0; this.flashDur = 0;
    this.hlOn = false; this.hlUntil = 0; this.hlEnd = -Infinity; this.hl = 0;
    this.sq.s = 0; this.sq.v = 0; this.poseTarget = 0;
    this.shakeT = 0; this.shakePh = 0; this.shakeX = 0;
    if (this.root?.userData) this.root.userData.highlight = null;
    this._f = -1;
    this.apply();
  }
}

/**
 * ART §5.4 [X9] which enemies wear an outline hull this frame (pure; exported for tests). `mode` = QUALITY.outline:
 * 'hero' → bosses only (with the hero, characters' side); 'heroCompanionsEngaged' → bosses + the ≤ `maxEngaged`
 * engaged enemies nearest to `focus`; 'all' → every live enemy. Fills and returns `out` (a Set).
 * @param {string} mode @param {any[]} enemies @param {{x: number, z: number}|null} focus
 * @param {(e: any) => boolean} engaged @param {number} maxEngaged @param {Set<any>} [out] @param {any[]} [scratch]
 */
export function outlineTargets(mode, enemies, focus, engaged, maxEngaged, out = new Set(), scratch = []) {
  out.clear();
  scratch.length = 0;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e || !e.alive || e.dormant || e.asleep || !e.visual) continue;
    if (e.def?.boss || e.isBoss) { out.add(e); continue; }
    if (mode === 'all') { out.add(e); continue; }
    if (mode === 'heroCompanionsEngaged' && engaged(e)) scratch.push(e);
  }
  if (scratch.length) {
    const fx = focus?.x ?? 0, fz = focus?.z ?? 0;
    const d2 = (e) => (e.pos.x - fx) ** 2 + (e.pos.z - fz) ** 2;
    scratch.sort((a, b) => d2(a) - d2(b));
    for (let i = 0; i < scratch.length && i < maxEngaged; i++) out.add(scratch[i]);
    scratch.length = 0;
  }
  return out;
}

// ------------------------------------------------------------------ outline hull (ART §5.4, X9)

const _mA = new THREE.Matrix4(), _mB = new THREE.Matrix4(), _n3 = new THREE.Matrix3(), _hv = new THREE.Vector3();
/** Meshes that never join a hull: fur shells / tufts / cards, plates, bubbles, the alert sprite, hulls and proxies. */
const NO_HULL = /shell|tuft|fur|card|plate|bubble|alert|outline|silhouette|shadow|blob|glint|tell|ring/i;

/** Does `o` belong in the hull (a visible, opaque, solid mesh)? */
function hullable(o, root) {
  if (!o.isMesh || o.isInstancedMesh || o.userData.noSilhouette || o.userData.noOutline || o.userData.outline) return false;
  if (NO_HULL.test(o.name ?? '')) return false;
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  if (!m || m.transparent || m.alphaTest > 0 || m.userData?.outline) return false;
  const g = o.geometry;
  if (!g?.attributes?.position || !g.attributes.normal) return false;
  for (let p = o; p && p !== root.parent; p = p.parent) if (!p.visible) return false;
  return true;
}

/**
 * ART §5.4 / X9 enemy outline hull: ONE back-faced skinned mesh that shares the enemy's own skeleton — its skinned body
 * parts (pre-multiplied by their bind matrices) and the rigid gear riding its bones (helms, beast heads, weapons; baked
 * into their bone's bind space with weight 1) merged into one geometry — drawn with characters' constant-pixel ink
 * material (`outlineMaterial(color, px)`). Unlike a box / ellipsoid proxy it hugs the real silhouette exactly.
 * Returns null when the visual has no skeleton (procedural foes) or nothing to outline. `userData.dispose()` frees it.
 * @param {THREE.Object3D} root the enemy visual @param {{px?: number, color?: THREE.ColorRepresentation,
 *   material?: (color: any, px: number) => THREE.Material, simplify?: boolean}} [o] `material`: characters'
 *   outlineMaterial; `simplify` false keeps the full-detail hull (tests)
 * @returns {THREE.SkinnedMesh|null}
 */
export function buildEnemyHull(root, o = {}) {
  if (!root) return null;
  root.updateMatrixWorld(true);
  // the main skeleton: the one with the most skinned vertices
  let skel = null, best = -1;
  root.traverse((c) => {
    if (c.isSkinnedMesh && c.skeleton && hullable(c, root)) {
      const n = c.geometry.attributes.position.count;
      if (n > best) { best = n; skel = c.skeleton; }
    }
  });
  if (!skel) return null;
  const boneIdx = new Map(skel.bones.map((b, i) => [b, i]));
  const pos = [], nrm = [], si = [], sw = [], idx = [];
  /** Append `g` transformed by `mat`; skinned parts remap their bones (`bones`), rigid ones bind to bone `rigid`. */
  const push = (g, mat, bones, rigid = 0) => {
    const P = g.attributes.position, N = g.attributes.normal, base = pos.length / 3;
    _n3.getNormalMatrix(mat);
    const SI = bones ? g.attributes.skinIndex : null, SW = bones ? g.attributes.skinWeight : null;
    for (let i = 0; i < P.count; i++) {
      _hv.fromBufferAttribute(P, i).applyMatrix4(mat); pos.push(_hv.x, _hv.y, _hv.z);
      _hv.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); nrm.push(_hv.x, _hv.y, _hv.z);
      if (SI) {
        for (let k = 0; k < 4; k++) {
          const b = bones[SI.getComponent(i, k)], j = b !== undefined ? boneIdx.get(b) : undefined;
          si.push(j ?? 0); sw.push(j === undefined ? 0 : SW.getComponent(i, k));
        }
      } else { si.push(rigid, 0, 0, 0); sw.push(1, 0, 0, 0); }
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    else for (let i = 0; i < P.count; i++) idx.push(base + i);
  };
  root.traverse((c) => {
    if (!hullable(c, root)) return;
    if (c.isSkinnedMesh) {
      if (!c.skeleton || !c.geometry.attributes.skinIndex) return;
      // skinned vertex (attached mode): world = Σ w · bone.matrixWorld · boneInverse · bindMatrix · p → pre-apply bindMatrix
      push(c.geometry, c.bindMatrix, c.skeleton.bones);
      return;
    }
    // rigid gear: its nearest ancestor bone of the main skeleton; local = inverse(bone.matrixWorld) · mesh.matrixWorld,
    // bind-space = inverse(boneInverse) · local, weight 1 to that bone
    let b = c.parent;
    while (b && b !== root.parent && !boneIdx.has(b)) b = b.parent;
    const j = b ? boneIdx.get(b) : undefined;
    if (j === undefined) return;
    _mA.copy(b.matrixWorld).invert().multiply(c.matrixWorld);
    _mB.copy(skel.boneInverses[j]).invert().multiply(_mA);
    push(c.geometry, _mB, null, j);
  });
  if (!pos.length) return null;
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  // PERF §1.2: a 1.6 px ink rim needs no full-detail silhouette: the hull draws a simplified, welded copy with smooth
  // normals (lod.js; the ink pushes along them, so the welded rim also has no cracks at flat-shaded edges). Full
  // detail until the simplifier has loaded.
  const lg = o.simplify === false ? null : simplifyGeometry(g, WARM.lod.hullRatio, WARM.lod.error, { smooth: true });
  if (lg) { g.dispose(); g = lg; }
  const px = o.px ?? WARM.outline.px, color = o.color ?? '#4A2A1E';
  const mat = typeof o.material === 'function' ? o.material(color, px)
    : new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  const mesh = new THREE.SkinnedMesh(g, mat);
  mesh.name = 'outline';
  mesh.userData.outline = true;
  mesh.userData.noSilhouette = true;
  mesh.frustumCulled = false;          // bones move it: the enemy's own culling decides (it hides with its visual)
  mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.raycast = () => {};
  root.add(mesh);
  mesh.bind(skel, new THREE.Matrix4());
  mesh.userData.dispose = () => { mesh.removeFromParent(); g.dispose(); mat.dispose(); };
  return mesh;
}
