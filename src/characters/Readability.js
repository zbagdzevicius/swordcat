// Readability from the iso camera (research/CONTROLS_SPEC.md §3, §7.4, §12 characters; GAME_DESIGN §15):
//   - getSilhouetteProxy(target): ONE merged skinned mesh (body capsules + ears + bow + sword / weapon, no fur) that
//     follows the actor's skeleton and attached parts. Camera's Occluders draws it as the x-ray pass
//     (`depthFunc: GreaterDepth`, flat #FFE4EC at 0.55 for her; telegraph colour at 0.45 for an enemy in a wind-up).
//     It lives under the actor (hidden until setXray / `proxy.visible`), costs 1 draw, never casts or raycasts.
//   - setHighlight(target, color | null, strength): hover / selection rim. Kittens: a rim emissive uniform in the
//     kit + fur shaders; any other model (KayKit beasts, GLB props): the material emissive on per-instance clones.
//   - topTint(root, color): a contrasting colour on the upward-facing surfaces (enemy helmet tops seen from above).
//   - ringAnchor(target, out): the ground point under the body, for the hero / selection rings.
//   - updateReadability(ctx): per frame (runtime.characterFrame): the top-view factor (bow ×1.25 etc.) and the fur
//     LOD focus (Fur.FUR_VIEW).
// node-safe (no DOM / WebGL at import).
import * as THREE from 'three';
import { READABILITY, TOP_VIEW, own, disown } from './materials.js';
import { flatPatch } from './flatPatch.js';
import { FUR_VIEW } from './Fur.js';
import { smoothstep } from './util.js';

/**
 * X-ray proxy defaults (CONTROLS_SPEC §3; config CAMERA.iso.occl overrides when core has it): her colour / alpha, the
 * enemy alpha, the proxy inflation (m), and `pull` (m): the proxy's depth is pulled toward the lens by this much, so
 * the x-ray shows only through occluders more than `pull` in front of her, never through her own limbs and cape
 * (`pullPerM` × the actor's largest size, clamped to [pull, pullMax], for bigger actors).
 */
export const XRAY = Object.freeze({ color: '#FFE4EC', alpha: 0.55, enemyAlpha: 0.45, margin: 0.015, furMargin: 0.035, pull: 0.45, pullPerM: 0.4, pullMax: 1.0, maxBones: 120, renderOrder: 12 });
/** Hover / selection highlight gain (rim emissive at strength 1) and the generic emissive share. */
export const HIGHLIGHT = Object.freeze({ gain: 0.55, emissive: 0.35 });
/** Contrasting top colour for enemy helmets seen from above (normal.y ramp, mix). */
export const TOP_TINT = Object.freeze({ color: '#E9DCC0', from: 0.55, to: 0.85, mix: 0.75 });
/** Gameplay camera modes in which the iso rule applies (FollowCamera.modeName; CONTROLS_SPEC §2.1). */
const ISO_MODES = new Set(['follow', 'lock', 'boss']);
/** Names never folded into a silhouette proxy (effects, fur cards, shadow helpers, the cape: CONTROLS_SPEC §3). */
const SKIP_NAME = /whisker|aura|streak|spark|shadowProxy|silhouetteProxy|blob|cape|tuft|trail|glow|shadow|decal|marker|eye|lid|pupil|mouth|plateText/i;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4();
const _box = new THREE.Box3(), _I = new THREE.Matrix4();

// ------------------------------------------------------------------ per-frame view state

/**
 * Per frame: TOP_VIEW (readability factor) and FUR_VIEW (fur LOD from the focus). Pure apart from writing those two
 * shared objects. Iso = a gameplay camera mode, not `?cam=classic`, and a `cam.focus` vector (camera P1).
 * @param {any} ctx
 * @returns {{ iso: boolean, dist: number, top: number }}
 */
export function updateReadability(ctx) {
  const cam = ctx?.cam, lens = ctx?.camera?.position;
  const classic = ctx?.params?.cam === 'classic' || ctx?.config?.CAMERA?.iso?.lodFromFocus === false;
  const focus = cam?.focus?.isVector3 ? cam.focus : null;
  const mode = cam?.modeName ?? (typeof cam?.mode === 'string' ? cam.mode : 'follow');
  const iso = !!(focus && lens && !classic && ISO_MODES.has(mode));
  // lens → subject distance: the focus in iso, else her position (cutscenes, Meme Cam: close-ups stay at 0)
  const subj = focus ?? ctx?.player?.object3d?.position ?? ctx?.player?.pos ?? null;
  const dist = lens && subj ? lens.distanceTo(subj) : 0;
  FUR_VIEW.focusOn = iso;
  if (iso) FUR_VIEW.focus.copy(focus);
  FUR_VIEW.camDist = iso ? dist : 0;
  TOP_VIEW.value = topViewFactor(classic ? 0 : dist);
  // bow ×1.4 at lens ≥ 12 m (WARM_ADVENTURE_SPEC §3.3), on top of the top-view ×1.25
  TOP_VIEW.far = classic ? 0 : smoothstep(READABILITY.bowFarFrom, READABILITY.bowFarAt, dist || 0);
  TOP_VIEW.dist = classic ? 0 : dist;
  TOP_VIEW.iso = iso;
  // close-up flag (ART §6.1, X8): camera's own `cam.closeUp` when it publishes one, else lens → focus hysteresis
  if (typeof cam?.closeUp === 'boolean') TOP_VIEW.closeUp = cam.closeUp;
  else TOP_VIEW.closeUp = !iso && dist > 0 ? (TOP_VIEW.closeUp ? dist < CLOSE.off : dist < CLOSE.on) : !iso && !lens;
  return { iso, dist, top: TOP_VIEW.value, far: TOP_VIEW.far, closeUp: TOP_VIEW.closeUp };
}
/** Close-up hysteresis (lens → her, m) when camera publishes no `cam.closeUp` (ART §6.1: on < 6.0, off > 6.3). */
export const CLOSE = Object.freeze({ on: 6.0, off: 6.3 });

/** Top-view factor for a lens → focus distance (0 inside READABILITY.from, 1 past READABILITY.to). */
export function topViewFactor(dist) { return smoothstep(READABILITY.from, READABILITY.to, dist || 0); }

// ------------------------------------------------------------------ x-ray silhouette proxy

const _xrayMats = new Set();
/**
 * Flat x-ray material (unlit, no fog, no depth write) with the depth pull. One per proxy (tints differ per actor);
 * every one shares the same program.
 * @param {THREE.ColorRepresentation} color @param {number} alpha
 */
export function xrayMaterial(color = XRAY.color, alpha = XRAY.alpha) {
  // PERF §1.2: the shared flat program (characters/flatPatch.js) in x-ray mode: front faces, unfogged, depth pull
  const m = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: alpha, depthWrite: false, depthTest: true, depthFunc: THREE.GreaterDepth,
  });
  const uniforms = { uPull: { value: XRAY.pull }, uOutlinePx: { value: 0 }, uFlatMode: { value: 1 }, uFogK: { value: 0 } };
  m.userData.uniforms = uniforms;
  m.userData.xray = true;
  flatPatch(m, uniforms);
  own(m);   // world's height-fog patcher composes the same way as on the hulls (same program key)
  _xrayMats.add(m);
  return m;
}

/**
 * `o` is still attached under `top` and visible: every node from `o` up to (not including) `top` is visible. A detached
 * object (a dropped helmet, a swapped sword) is not shown.
 */
function shownUnder(o, top) {
  for (let p = o; p; p = p.parent) {
    if (p === top) return true;
    if (!p.visible) return false;
  }
  return false;
}

function isSkippable(o) {
  return !!(o.userData?.noSilhouette || o.isPoints || o.isLine || o.isSprite || SKIP_NAME.test(o.name || ''));
}

/** A material that is drawn as fur shells (so the proxy grows by the fur length there). */
function furry(o) { const u = o.material?.uniforms; return !!(u && (u.uShells || u.uFurLen)); }

/** Unit ellipsoid fitted to a local box (half extents × `cover`, + margin), as a matrix. */
function ellipsoidMatrix(box, margin, cover = 1.12, out = new THREE.Matrix4()) {
  box.getCenter(_v); box.getSize(_v2).multiplyScalar(0.5 * cover).addScalar(margin);
  return out.makeScale(Math.max(_v2.x, 0.01), Math.max(_v2.y, 0.01), Math.max(_v2.z, 0.01)).setPosition(_v);
}

/** Jacobi eigen-decomposition of a symmetric 3x3 (row-major array of 9): returns { vals: [3], vecs: [[3],[3],[3]] }. */
export function eigenSym3(a) {
  const A = a.slice(), V = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  for (let sweep = 0; sweep < 24; sweep++) {
    const off = Math.abs(A[1]) + Math.abs(A[2]) + Math.abs(A[5]);
    if (off < 1e-12) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      const apq = A[p * 3 + q];
      if (Math.abs(apq) < 1e-14) continue;
      const th = (A[q * 3 + q] - A[p * 3 + p]) / (2 * apq);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
      for (let k = 0; k < 3; k++) {                       // A = Jᵀ A J
        const akp = A[k * 3 + p], akq = A[k * 3 + q];
        A[k * 3 + p] = c * akp - sn * akq; A[k * 3 + q] = sn * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) {
        const apk = A[p * 3 + k], aqk = A[q * 3 + k];
        A[p * 3 + k] = c * apk - sn * aqk; A[q * 3 + k] = sn * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k * 3 + p], vkq = V[k * 3 + q];
        V[k * 3 + p] = c * vkp - sn * vkq; V[k * 3 + q] = sn * vkp + c * vkq;
      }
    }
  }
  return { vals: [A[0], A[4], A[8]], vecs: [0, 1, 2].map((j) => [V[j], V[3 + j], V[6 + j]]) };
}

/**
 * Oriented ellipsoid around a point cloud (flat xyz array): principal axes from the covariance, extents from the
 * `trim`..1-trim percentiles along each axis (stray weighted vertices do not inflate it), × `cover` + margin.
 * @param {number[]} pts @param {number} margin @param {{ cover?: number, trim?: number }} [o]
 */
export function fitEllipsoid(pts, margin, o = {}) {
  const cap = o.maxPoints ?? 900;
  if (pts.length / 3 > cap) {                                  // deterministic stride sample: bounded build time
    const step = pts.length / 3 / cap, out = new Array(cap * 3);
    for (let j = 0; j < cap; j++) { const i = Math.floor(j * step) * 3; out[j * 3] = pts[i]; out[j * 3 + 1] = pts[i + 1]; out[j * 3 + 2] = pts[i + 2]; }
    pts = out;
  }
  const n = pts.length / 3, cover = o.cover ?? 1.08, trim = n >= 40 ? (o.trim ?? 0.03) : 0;
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < pts.length; i += 3) { mx += pts[i]; my += pts[i + 1]; mz += pts[i + 2]; }
  mx /= n; my /= n; mz /= n;
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i] - mx, y = pts[i + 1] - my, z = pts[i + 2] - mz;
    C[0] += x * x; C[1] += x * y; C[2] += x * z; C[4] += y * y; C[5] += y * z; C[8] += z * z;
  }
  C[3] = C[1]; C[6] = C[2]; C[7] = C[5];
  const { vecs } = eigenSym3(C.map((c) => c / n));
  const ax = vecs.map((e) => new THREE.Vector3(...e).normalize());
  if (ax[0].clone().cross(ax[1]).dot(ax[2]) < 0) ax[2].negate();     // right-handed basis
  const centre = new THREE.Vector3(mx, my, mz), half = [0, 0, 0];
  const proj = new Float64Array(n);
  for (let a = 0; a < 3; a++) {
    const e = ax[a];
    for (let i = 0, j = 0; i < pts.length; i += 3, j++) proj[j] = (pts[i] - mx) * e.x + (pts[i + 1] - my) * e.y + (pts[i + 2] - mz) * e.z;
    proj.sort();
    const lo = proj[Math.floor(trim * (n - 1))], hi = proj[Math.ceil((1 - trim) * (n - 1))];
    centre.addScaledVector(e, (lo + hi) / 2);
    half[a] = Math.max((hi - lo) / 2 * cover + margin, 0.01);
  }
  return new THREE.Matrix4().makeBasis(ax[0].multiplyScalar(half[0]), ax[1].multiplyScalar(half[1]), ax[2].multiplyScalar(half[2])).setPosition(centre);
}

/**
 * Build the parts of a silhouette proxy for `root` (pure: no renderer). Skinned meshes bound to `skeleton` give one
 * ellipsoid per bone (vertices binned by their strongest weight, measured in the bone's bind frame); every other visible
 * mesh under `root` (bow, sword, helmets, beast heads, held props) is a rigid part anchored to itself: an ellipsoid, or a
 * box when it is long and thin (blades, spears, horns). Returns the anchors and per-part shapes.
 * @param {THREE.Object3D} root
 * @param {{ skeleton?: THREE.Skeleton|null, margin?: number, furMargin?: number, minVerts?: number }} [o]
 */
export function silhouetteParts(root, o = {}) {
  const margin = o.margin ?? XRAY.margin, furMargin = o.furMargin ?? XRAY.furMargin, minVerts = o.minVerts ?? 6;
  root.updateWorldMatrix(true, true);
  let skeleton = o.skeleton ?? null;
  if (!skeleton) root.traverse((c) => { if (!skeleton && c.isSkinnedMesh && c.skeleton && !skippedChain(c, root) && shownUnder(c, root)) skeleton = c.skeleton; });
  const parts = [];     // { anchor: index into anchors, matrix: Matrix4 (unit shape → anchor space), shape: 'ellipsoid'|'box' }
  const anchors = [];   // { obj, inverse }
  const boxes = new Map();   // bone index → { pts (bone-local xyz), fur }
  if (skeleton) {
    skeleton.bones.forEach((b, i) => anchors.push({ obj: b, inverse: skeleton.boneInverses[i] }));
  }
  root.traverse((c) => {
    if (!(c.isMesh || c.isSkinnedMesh)) return;
    if (c !== root && (skippedChain(c, root) || !shownUnder(c, root))) return;
    const g = c.geometry, P = g?.attributes?.position;
    if (!P || P.count === 0) return;
    if (c.isSkinnedMesh && skeleton && c.skeleton === skeleton) {
      const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, shell = g.attributes.aShell;
      if (!SI || !SW) return;
      const fur = furry(c);
      const nb = skeleton.bones.length, mats = new Array(nb);
      // baked fur shells are stored shell-major: the skin copy is the first run of aShell == 0
      let end = P.count;
      if (shell) { end = 0; while (end < P.count && shell.getX(end) === 0) end++; }
      const raw = !P.isInterleavedBufferAttribute && !SI.isInterleavedBufferAttribute && !SW.isInterleavedBufferAttribute && !SW.normalized;
      const pa = P.array, ia = SI.array, wa = SW.array;
      for (let i = 0; i < end; i++) {
        let bi, bw;
        if (raw) {
          const o4 = i * 4;
          bi = ia[o4]; bw = wa[o4];
          if (wa[o4 + 1] > bw) { bw = wa[o4 + 1]; bi = ia[o4 + 1]; }
          if (wa[o4 + 2] > bw) { bw = wa[o4 + 2]; bi = ia[o4 + 2]; }
          if (wa[o4 + 3] > bw) { bw = wa[o4 + 3]; bi = ia[o4 + 3]; }
          if (P.itemSize === 3 && !P.normalized) _v.set(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]); else _v.fromBufferAttribute(P, i);
        } else {
          bi = SI.getX(i); bw = SW.getX(i);
          for (let k = 1; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; bi = SI.getComponent(i, k); } }
          _v.fromBufferAttribute(P, i);
        }
        if (!(bi < nb)) continue;
        _v.applyMatrix4(mats[bi] ??= new THREE.Matrix4().multiplyMatrices(skeleton.boneInverses[bi], c.bindMatrix));
        let e = boxes.get(bi);
        if (!e) boxes.set(bi, (e = { pts: [], fur: false }));
        e.pts.push(_v.x, _v.y, _v.z); e.fur ||= fur;
      }
      return;
    }
    if (c.isSkinnedMesh) return;                                          // another skeleton (rare): left out
    // rigid part anchored to itself: its local bounding box (InstancedMesh fur: instance 0 = the skin layer)
    if (!g.boundingBox) g.computeBoundingBox();
    _box.copy(g.boundingBox);
    if (_box.isEmpty()) return;
    const ai = anchors.length;
    anchors.push({ obj: c, inverse: _I });
    _box.getSize(_v2);
    const s = [_v2.x, _v2.y, _v2.z].sort((a, b) => a - b);
    const long = s[2] > 2.5 * Math.max(s[1], 1e-4);
    const mrg = margin + (furry(c) ? furMargin : 0);
    const m = long
      ? new THREE.Matrix4().makeScale(Math.max(_v2.x / 2 + mrg, 0.012), Math.max(_v2.y / 2 + mrg, 0.012), Math.max(_v2.z / 2 + mrg, 0.012)).setPosition(_box.getCenter(_v))
      : ellipsoidMatrix(_box, mrg);
    parts.push({ anchor: ai, matrix: m, shape: long ? 'box' : 'ellipsoid' });
  });
  for (const [bi, e] of boxes) {
    if (e.pts.length < minVerts * 3) continue;
    parts.push({ anchor: bi, matrix: fitEllipsoid(e.pts, margin + (e.fur ? furMargin : 0)), shape: 'ellipsoid' });
  }
  // drop anchors no part uses (keeps the bone texture small)
  const used = [...new Set(parts.map((p) => p.anchor))].sort((a, b) => a - b);
  const remap = new Map(used.map((a, i) => [a, i]));
  return { anchors: used.map((a) => anchors[a]), parts: parts.map((p) => ({ ...p, anchor: remap.get(p.anchor) })), skeleton };
}

/** `c` or any ancestor below `root` is excluded from proxies by name / flag. */
function skippedChain(c, root) { for (let p = c; p && p !== root; p = p.parent) if (isSkippable(p)) return true; return false; }

const _n3 = new THREE.Matrix3();
const _ell = new THREE.SphereGeometry(1, 12, 8);
const _cube = new THREE.BoxGeometry(2, 2, 2);

/**
 * The x-ray proxy for `root`: a hidden SkinnedMesh parented to `root`, one draw, following its skeleton and attached
 * parts. A detached or hidden part (a dropped helmet, a sheathed sword) collapses to nothing on the next draw.
 * @param {THREE.Object3D} root
 * @param {{ skeleton?: THREE.Skeleton|null, color?: THREE.ColorRepresentation, alpha?: number, parent?: THREE.Object3D,
 *           into?: THREE.SkinnedMesh }} [o]  into: rebuild this existing proxy in place
 * @returns {THREE.SkinnedMesh | null}
 */
export function buildSilhouetteProxy(root, o = {}) {
  const { anchors, parts } = silhouetteParts(root, o);
  if (!parts.length || anchors.length > XRAY.maxBones) return null;
  const pos = [], idx = [], si = [], sw = [], nrm = o.normals ? [] : null;
  for (const p of parts) {
    const src = p.shape === 'box' ? _cube : _ell, P = src.attributes.position, N = src.attributes.normal, I = src.index.array;
    const base = pos.length / 3;
    // part space (unit shape → anchor-local) → proxy bind space (anchor-local → inverse(boneInverse))
    _m.copy(anchors[p.anchor].inverse).invert().multiply(p.matrix);
    if (nrm) _n3.getNormalMatrix(_m);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      pos.push(_v.x, _v.y, _v.z); si.push(p.anchor, 0, 0, 0); sw.push(1, 0, 0, 0);
      // outward normals (the outline hull pushes along them; the x-ray pass ignores them)
      if (nrm) { _v.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize(); nrm.push(_v.x, _v.y, _v.z); }
    }
    for (let i = 0; i < I.length; i++) idx.push(base + I[i]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // the x-ray pass ignores normals, but three keys `vertexNormals` into the program: without them the x-ray proxy
  // would not share the flat program with the outline hulls (PERF §1.2), so it carries the position buffer as one
  g.setAttribute('normal', nrm ? new THREE.Float32BufferAttribute(nrm, 3) : g.attributes.position);
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const skel = new THREE.Skeleton(anchors.map((a) => a.obj), anchors.map((a) => a.inverse.clone()));
  // rebuild in place (a sword swap, a new prop): whoever holds the mesh keeps a valid handle
  const into = o.into?.isSkinnedMesh ? o.into : null;
  if (into) { into.userData.disposeData?.(); into.geometry = g; }
  const mesh = into ?? new THREE.SkinnedMesh(g, xrayMaterial(o.color ?? XRAY.color, o.alpha ?? XRAY.alpha));
  mesh.name = 'silhouetteProxy';
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  mesh.renderOrder = XRAY.renderOrder;
  if (!into) mesh.visible = false;
  mesh.raycast = () => {};
  mesh.userData.noSilhouette = true;
  mesh.userData.anchors = anchors.length;
  const top = o.parent ?? root;
  if (mesh.parent !== top) top.add(mesh);
  mesh.bind(skel, new THREE.Matrix4());
  // rigid anchors that are hidden or detached this frame draw nothing (their bone matrix is zeroed after the update)
  const rigid = anchors.map((a, i) => (a.obj.isBone ? -1 : i)).filter((i) => i >= 0);
  mesh.onBeforeRender = () => {
    if (!rigid.length) return;
    let dirty = false;
    for (const i of rigid) {
      if (shownUnder(anchors[i].obj, top)) continue;
      skel.boneMatrices.fill(0, i * 16, i * 16 + 16); dirty = true;
    }
    if (dirty && skel.boneTexture) skel.boneTexture.needsUpdate = true;
  };
  // depth pull scaled to the actor (a long rat's far legs sit deeper behind its own back than her limbs behind her)
  mesh.updateMatrixWorld(true); skel.update();
  const wb = new THREE.Box3();
  for (let i = 0; i < g.attributes.position.count; i++) wb.expandByPoint(mesh.getVertexPosition(i, _v).applyMatrix4(mesh.matrixWorld));
  wb.getSize(_v2);
  mesh.material.userData.uniforms.uPull.value = Math.min(XRAY.pullMax, Math.max(XRAY.pull, XRAY.pullPerM * Math.max(_v2.x, _v2.y, _v2.z)));
  mesh.userData.size = Math.max(_v2.x, _v2.y, _v2.z);
  mesh.userData.disposeData = () => { g.dispose(); skel.dispose(); };
  mesh.userData.dispose = () => {
    mesh.removeFromParent(); mesh.userData.disposeData(); disown(mesh.material); _xrayMats.delete(mesh.material);
  };
  return mesh;
}

/**
 * Show / hide an x-ray proxy and set its tint.
 * @param {THREE.Mesh|null} proxy @param {boolean} on @param {{ color?: THREE.ColorRepresentation, alpha?: number }} [o]
 */
export function setProxyXray(proxy, on, o = {}) {
  if (!proxy) return;
  proxy.visible = !!on;
  if (o.color !== undefined) proxy.material.color.set(o.color);
  if (o.alpha !== undefined) proxy.material.opacity = o.alpha;
}

// ------------------------------------------------------------------ resolving actors

/**
 * The characters handle behind a target: a KittenView, a beast dress, or a plain Object3D.
 * Accepts a KittenView, a Kitten, an actor (`view`, `model.view`, `visual`, `dress`, `object3d`) or an Object3D.
 * @returns {{ view?: any, kitten?: any, dress?: any, root?: THREE.Object3D } | null}
 */
export function resolveTarget(t) {
  if (!t) return null;
  if (t.isKittenView) return { view: t, kitten: t.kitten, root: t.root };
  if (t.isKitten) return { view: t.view ?? null, kitten: t, root: t.root };
  const v = t.view?.isKittenView ? t.view : t.model?.view?.isKittenView ? t.model.view : t.visual?.view?.isKittenView ? t.visual.view : null;
  if (v) return { view: v, kitten: v.kitten, root: v.root };
  if (t.dress?.isBeastDress) return { dress: t.dress, root: t.dress.model };
  if (t.isBeastDress) return { dress: t, root: t.model };
  const obj = t.isObject3D ? t : t.object3d ?? null;
  if (!obj) return null;
  let kit = null;
  obj.traverse((c) => { if (!kit && c.userData?.kitten?.isKitten) kit = c.userData.kitten; });
  if (kit) return { view: kit.view ?? null, kitten: kit, root: kit.root };
  return { root: t.visual?.isObject3D ? t.visual : obj };
}

/**
 * The x-ray silhouette proxy of an actor / view / model (CONTROLS_SPEC §3), built on first use and cached.
 * @returns {THREE.SkinnedMesh | null}
 */
export function getSilhouetteProxy(target) {
  const r = resolveTarget(target);
  if (!r) return null;
  if (r.view) return r.view.getSilhouetteProxy();
  if (r.kitten) return r.kitten.getSilhouetteProxy();
  if (r.dress) return r.dress.getSilhouetteProxy();
  const root = r.root;
  if (!root) return null;
  const ud = root.userData;
  if (ud.silhouetteProxy === undefined || (ud.silhouetteProxy && !ud.silhouetteProxy.parent)) ud.silhouetteProxy = buildSilhouetteProxy(root, { alpha: XRAY.enemyAlpha });
  return ud.silhouetteProxy;
}

/** X-ray on / off for a target (`{ color, alpha }`). Returns the proxy (or null). */
export function setXray(target, on, o = {}) {
  const p = on ? getSilhouetteProxy(target) : peekProxy(target);
  setProxyXray(p, on, o);
  return p;
}

function peekProxy(target) {
  const r = resolveTarget(target);
  if (!r) return null;
  if (r.kitten) return r.kitten.silhouetteProxy ?? null;
  if (r.dress) return r.dress.silhouetteProxy ?? null;
  return r.root?.userData.silhouetteProxy ?? null;
}

// ------------------------------------------------------------------ highlight

/**
 * Hover / selection highlight (CONTROLS_SPEC §7.4): red #FF6A3D on enemies, gold #FFD34D on interactables, white on
 * NPCs and kittens. `null` clears it. Kittens use the rim uniform; anything else gets emissive on per-instance clones.
 * @param {any} target @param {THREE.ColorRepresentation|null} color @param {number} [strength=1]
 */
export function setHighlight(target, color, strength = 1) {
  const r = resolveTarget(target);
  if (!r) return false;
  if (r.kitten) { r.kitten.setHighlight(color, strength); return true; }
  if (r.dress) {
    r.dress.setHighlight(color, strength);
    return true;
  }
  if (r.root) { highlightObject(r.root, color, strength); return true; }
  return false;
}

const _hiCol = new THREE.Color();
/**
 * Emissive highlight on every lit mesh under `root` (materials are cloned per instance on first use and tagged
 * `userData.assetOwned`, so core's disposeInstance frees them; the original emissive is kept for the restore).
 * Kitten roots inside `root` use their own rim highlight.
 */
export function highlightObject(root, color, strength = 1) {
  const on = color !== null && color !== undefined && strength > 0;
  if (on) _hiCol.set(color).multiplyScalar(HIGHLIGHT.emissive * strength);
  root.traverse((c) => {
    if (c.userData?.kitten?.isKitten && c !== root) { c.userData.kitten.setHighlight(color, strength); return; }
    if (!(c.isMesh || c.isSkinnedMesh) || c.userData.noSilhouette || c.material?.userData?.xray) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    if (!mats.some((m) => m && m.emissive)) return;
    if (!c.userData.hiMats) {
      if (!on) return;
      const clones = mats.map((m) => {
        if (!m?.emissive) return m;
        if (m.userData?.hiClone) return m;
        const k = m.clone();
        // clone() drops instance hooks: keep the source's shader patch (world fog) and program key → same program
        if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) k.onBeforeCompile = m.onBeforeCompile;
        if (Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) k.customProgramCacheKey = m.customProgramCacheKey;
        k.userData = { ...m.userData, assetOwned: true, hiClone: true, hiBase: m.emissive.clone(), hiBaseI: m.emissiveIntensity };
        return k;
      });
      c.material = Array.isArray(c.material) ? clones : clones[0];
      c.userData.hiMats = clones;
    }
    for (const m of c.userData.hiMats) {
      if (!m?.userData?.hiClone) continue;
      if (on) { m.emissive.copy(m.userData.hiBase).add(_hiCol); m.emissiveIntensity = 1; }
      else { m.emissive.copy(m.userData.hiBase); m.emissiveIntensity = m.userData.hiBaseI; }
    }
  });
  root.userData.highlight = on ? { color, strength } : null;
}

// ------------------------------------------------------------------ helmet tops

const _topCache = new Map();
const _topPatched = new WeakSet();

/** Install the top-tint shader hook + program key on `m` (chains any hook already on it, e.g. world's fog patcher). */
function patchTopTint(m, src, uniforms) {
  m.userData = { ...src.userData, topTint: true, uniforms: { ...(src.userData?.uniforms ?? {}), ...uniforms } };
  const prev = Object.prototype.hasOwnProperty.call(src, 'onBeforeCompile') ? src.onBeforeCompile : null;
  m.onBeforeCompile = (sh, r) => {
    if (prev && prev !== THREE.Material.prototype.onBeforeCompile) prev.call(m, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTopColor; uniform float uTopMix;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float upK = dot(normal, normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz));
          diffuseColor.rgb = mix(diffuseColor.rgb, uTopColor, smoothstep(${TOP_TINT.from.toFixed(2)}, ${TOP_TINT.to.toFixed(2)}, upK) * uTopMix);
        }`);
  };
  const prevKey = Object.prototype.hasOwnProperty.call(src, 'customProgramCacheKey') ? src.customProgramCacheKey.bind(src) : null;
  m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|sc-top-v1';
  m.needsUpdate = true;
  return m;
}

/** True for materials that belong to one instance (enemies' `markOwned`, assets' `cloneMaterials` / `tint`). */
const isInstanceMat = (mat) => !!(mat?.userData?.enemyOwned || mat?.userData?.assetOwned);

/**
 * Helmet-top tint for `mat` (upward-facing surfaces, world normal.y from..to, take `color` at TOP_TINT.mix): helmet
 * tops that read against the ground from above.
 * - Shared materials: a clone cached per (material, colour), so a whole pack shares one clone + one program.
 * - Per-instance materials (`userData.enemyOwned` / `assetOwned`, or `o.perInstance: true`): patched IN PLACE, so the
 *   owner's hit flash (`flashMaterials`) and `disposeInstanceMaterials` keep working on that instance only. The
 *   program key is the same, so a pack still shares one program.
 */
export function topTintMaterial(mat, color = TOP_TINT.color, o = {}) {
  if (!mat || mat.userData?.topTint) return mat;
  const mix = o.mix ?? TOP_TINT.mix;
  // WarmToon (sc-toon) has the tint built in as uniforms (PERF §1.2: no '|sc-top' program variant): per-instance /
  // pooled toon materials are tinted in place, shared ones (toonLib, props) are left alone (it would tint every user)
  const tu = mat.userData?.toon ? mat.userData.uniforms : null;
  if (tu?.uTopMix) {
    if (!(o.perInstance ?? (isInstanceMat(mat) || mat.userData.enemyToon))) return mat;
    tu.uTopColor.value.set(color); tu.uTopMix.value = mix;
    mat.userData.topTint = true;
    return mat;
  }
  const uniforms = { uTopColor: { value: new THREE.Color(color) }, uTopMix: { value: mix } };
  if (o.perInstance ?? isInstanceMat(mat)) {
    if (_topPatched.has(mat)) return mat;
    _topPatched.add(mat);
    return patchTopTint(mat, mat, uniforms);
  }
  const key = mat.uuid + '|' + new THREE.Color(color).getHexString() + '|' + mix;
  let m = _topCache.get(key);
  if (m) return m;
  m = patchTopTint(mat.clone(), mat, uniforms);
  _topCache.set(key, m);
  return m;
}

/**
 * Give helmet tops under `root` a contrasting top colour (CONTROLS_SPEC §12 characters 3). `o.match` (RegExp / name
 * list) picks the meshes (default: names containing helm / hat / hood / kettle). `o.perInstance` forces in-place
 * patching (auto for enemy- / asset-owned materials, see topTintMaterial). Returns the count of meshes changed.
 */
export function topTint(root, color = TOP_TINT.color, o = {}) {
  if (!root?.traverse) return 0;
  const match = o.match instanceof RegExp ? o.match : Array.isArray(o.match) ? new RegExp(o.match.join('|'), 'i') : /helm|hat|hood|cap\b|kettle/i;
  let n = 0;
  root.traverse((c) => {
    if (!(c.isMesh || c.isSkinnedMesh) || Array.isArray(c.material) || !c.material?.isMeshStandardMaterial && !c.material?.isMeshLambertMaterial && !c.material?.isMeshPhongMaterial && !c.material?.userData?.toon) return;
    let hit = match.test(c.name || '');
    for (let p = c.parent; !hit && p && p !== root.parent; p = p.parent) hit = match.test(p.name || '');
    if (!hit) return;
    c.material = topTintMaterial(c.material, color, o); n++;
  });
  return n;
}

// ------------------------------------------------------------------ ring anchor

/**
 * Ground point under the body (hips / body joint xz at the root's height) and the ring radius for the hero / selection
 * rings (fx draws them; CONTROLS_SPEC §3, §7.4). Works for kittens and any actor object.
 * @param {any} target @param {THREE.Vector3} [out]
 * @returns {{ pos: THREE.Vector3, radius: number } | null}
 */
export function ringAnchor(target, out = new THREE.Vector3()) {
  const r = resolveTarget(target);
  if (!r?.root) return null;
  r.root.updateWorldMatrix(true, false);
  const k = r.kitten;
  if (k) {
    k.rig.hips.updateWorldMatrix(true, false);
    k.rig.hips.getWorldPosition(out);
    r.root.getWorldPosition(_v);
    out.y = _v.y;
    r.root.getWorldScale(_v2);
    return { pos: out, radius: 0.36 * (k.w ?? 1) * _v2.x };
  }
  r.root.getWorldPosition(out);
  const rad = target?.radius ?? (target?.collider?.r ?? 0.5);
  return { pos: out, radius: rad };
}

// unit-test handle
export const _test = { shownUnder, ellipsoidMatrix, skippedChain, fitEllipsoid, eigenSym3 };
