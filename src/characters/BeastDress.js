// Dressing for the Hound Legion's KayKit bodies (GAME_DESIGN §3.7, §10, §11, §18.3; CS-02 cast):
//   dressBeast(model, 'hyena' | 'stealer' | 'pilfer' | 'cacklejaw' | 'pug' | 'brutus' | 'barkus', { seed })
// = attachBeastHead + attachPlate (word picked from config ENEMIES.<type>.plateWords by seed) + hand props.
// Call it on the fitted SkeletonUtils clone in bind pose (before the Animator/mixer first runs), e.g.
//   const m = await ctx.assets.model(def.model, { fit: def.fit, hide: def.hide, show: def.show });
//   this.dress = dressBeast(m.root, def.id, { seed: this.id });   ...   this.dress.update(dt) per frame.
// silhouette(object) turns a whole model (body + beast head) into one flat fogged colour (CS-02's Barkus on the
// Bell Tower, Cacklejaw's shadow clones).
import * as THREE from 'three';
import { ENEMIES } from '../core/config.js';
import { attachBeastHead } from './BeastHead.js';
import { attachPlate, pickPlateWord, friendWordFor } from './Plate.js';
import { buildOutline, setOutlineAlpha, OUTLINE, inkFor } from './Outline.js';
import { buildProp, buildCage } from './Props/ProcProps.js';
import { own } from './materials.js';
import { WARM_LOOKS } from './palette.js';
import { buildSilhouetteProxy, highlightObject, XRAY } from './Readability.js';

/** Per-look head preset + options and plate word source (§3.7 villains, §11 boss builds). */
export const BEAST_LOOKS = Object.freeze({
  hyena: { head: 'hyena', opts: { mane: true }, words: ENEMIES.hyena?.plateWords ?? ['GRUMP'], style: 'rusty' },
  stealer: { head: 'hyena', opts: { mane: false }, words: ENEMIES.stealer?.plateWords ?? ['SNACK SNATCHER'], style: 'rusty' },
  pilfer: { head: 'hyena', opts: { mane: false, scale: 1.22 }, words: ['SNACK SNATCHER'], style: 'iron' },
  cacklejaw: { head: 'hyena', opts: { mane: true, chippedEar: 'left', lift: 0.15 }, words: ['GRUMP-IN-CHIEF'], style: 'rusty' },
  pug: { head: 'pug', opts: {}, words: null },
  brutus: { head: 'pug', opts: { scar: true }, words: null },
  // weapon: the hand prop that replaces the GLB weapon (WA §2.5: "Big Squeaky Bone" mallet, same hitbox / timings)
  barkus: { head: 'bulldog', opts: { jowls: true, underbite: true, eyepatch: true, hornedHelm: true }, words: null, weapon: 'big_squeaky_bone' },
});

/** KayKit hand bones (three sanitises `handslot.r` → `handslotr`). */
const HAND = { r: ['handslot.r', 'handslotr'], l: ['handslot.l', 'handslotl'] };
const _ws = new THREE.Vector3();

function findAny(root, names) { for (const n of names) { const o = root.getObjectByName(n); if (o) return o; } return null; }

/**
 * Parent `obj` (sized in metres) to a bone of a fitted model, cancelling the bone's world scale.
 * @param {THREE.Object3D} model @param {THREE.Object3D} obj @param {string|string[]} bone
 * @param {{ p?: number[], r?: number[], s?: number }} [o] local offset in metres / radians
 */
export function holdOnBone(model, obj, bone, o = {}) {
  model.updateMatrixWorld(true);
  const b = findAny(model, Array.isArray(bone) ? bone : [bone, THREE.PropertyBinding.sanitizeNodeName(bone)]);
  if (!b) return null;
  b.getWorldScale(_ws);
  const inv = 1 / (_ws.x || 1);
  b.add(obj);
  obj.scale.setScalar(inv * (o.s ?? 1));
  if (o.p) obj.position.set(o.p[0] * inv, o.p[1] * inv, o.p[2] * inv);
  if (o.r) obj.rotation.set(o.r[0], o.r[1], o.r[2]);
  return obj;
}

/**
 * Dress a fitted KayKit clone as a Hound Legion beast.
 * @param {THREE.Object3D} model fitted clone (bind pose)
 * @param {keyof BEAST_LOOKS | {head: string, opts?: object, words?: string[]|null, style?: string}} look
 * @param {{ seed?: number, word?: string|null, plate?: boolean, head?: object, plateOpts?: object }} [o]
 */
export function dressBeast(model, look = 'hyena', o = {}) {
  const L = typeof look === 'string' ? (BEAST_LOOKS[look] ?? BEAST_LOOKS.hyena) : look;
  const seed = (o.seed ?? 0) >>> 0;
  const head = attachBeastHead(model, L.head, { ...L.opts, seed: seed + 1, ...(o.head || {}) });
  const word = o.word !== undefined ? o.word : L.words ? pickPlateWord(L.words, seed) : null;
  // both words bake into one texture at dress time (WA §8.3): the bonk flip is a UV offset swap, 0 canvas work
  const friendWord = o.friendWord !== undefined ? o.friendWord : word ? friendWordFor(word) : null;
  const plate = word && o.plate !== false ? attachPlate(model, word, { seed, style: L.style, friend: friendWord, ...(o.plateOpts || {}) }) : null;
  const held = {};
  let activity = 0, headAcc = 0, headN = 0;
  const dress = {
    look: typeof look === 'string' ? look : L.head, head, plate, word, friendWord, held, outline: null,
    /** The dressed model root and the x-ray proxy (lazy; research/CONTROLS_SPEC.md §3). */
    model, silhouetteProxy: null, _proxyDirty: false, highlight: null,
    get isBeastDress() { return true; },
    /**
     * One-draw x-ray silhouette (body ellipsoids per bone + beast head + held props), hidden until shown. Camera tints it
     * with the telegraph colour at 0.45 while the beast winds up and is occluded.
     */
    getSilhouetteProxy() {
      if (dress.silhouetteProxy && !dress._proxyDirty) return dress.silhouetteProxy;
      dress._proxyDirty = false;
      dress.silhouetteProxy = buildSilhouetteProxy(model, { alpha: XRAY.enemyAlpha, into: dress.silhouetteProxy }) ?? dress.silhouetteProxy;
      return dress.silhouetteProxy;
    },
    /** Hover / selection highlight (§7.4: red #FF6A3D on enemies); null clears. */
    setHighlight(color, strength = 1) {
      highlightObject(model, color, strength);
      dress.highlight = color === null || color === undefined ? null : { color, strength };
      return dress;
    },
    /** 'neutral' | 'sneer' | 'angry' | 'laugh' | 'sad' | 'surprised' | 'kneel' */
    setExpression(name) { head?.setExpression(name); return dress; },
    /** Barkus phase 2: the horned helm shatters. */
    setHelm(on) { head?.setHelm?.(on); return dress; },
    /**
     * Per frame. Off-screen tiers (PERF §4.3, X13): tier 1 runs the head's secondary motion every 3rd frame, tier 2 every
     * 6th (summed dt), tier 3 never; coming back restores it the same frame.
     */
    update(dt) {
      if (!head) return;
      if (activity === 0) { head.update(dt); return; }
      headAcc += dt;
      if (activity >= 3 || ++headN % (activity === 1 ? 3 : 6) !== 0) return;
      head.update(headAcc); headAcc = 0;
    },
    /** Activity tier 0..3 (camera's activityOf; replaces the draft setOffscreen). */
    setActivity(tier) { activity = Math.max(0, Math.min(3, tier | 0)); if (activity === 0) { headAcc = 0; headN = 0; } return dress; },
    get activity() { return activity; },
    /**
     * Flip the breastplate to the friend word (true) or back (false): a texture offset swap (characters.W4).
     * @returns {boolean} false when this plate has no friend word
     */
    flipPlate(on = true) { return plate?.userData.flip ? plate.userData.flip(on) : false; },
    /**
     * Warm ink outline hull (ART §5.4): enemies 1.6 px, bosses 2.4 px; `alpha` < 1 fades it (engaged: 0.2 s).
     * @param {boolean} on @param {{ px?: number, color?: THREE.ColorRepresentation, alpha?: number, boss?: boolean }} [o2]
     */
    setOutline(on, o2 = {}) {
      if (on && !dress.outline) {
        dress.outline = buildOutline(dress, { px: o2.px ?? (o2.boss ? OUTLINE.px.boss : OUTLINE.px.enemy), color: o2.color ?? inkFor(L.ink ?? OUTLINE.ink) });
      }
      if (dress.outline) {
        if (o2.alpha !== undefined) setOutlineAlpha(dress.outline, on ? o2.alpha : 0);
        else dress.outline.visible = !!on;
      }
      return dress;
    },
    /**
     * Hold a procedural prop ('cage', 'signpost', 'post_bag', 'lantern', ...) or an Object3D in a hand.
     * @param {string|THREE.Object3D} what @param {'l'|'r'} [hand] @param {object} [opts] prop options + { p, r, s }
     */
    hold(what, hand = 'l', opts = {}) {
      const key = typeof what === 'string' ? what : what.name || 'prop';
      dress.drop(key);
      const obj = typeof what === 'string' ? (what === 'cage' ? buildCage(opts) : buildProp(what, opts)) : what;
      if (!obj) return null;
      const def = CARRY[key] || {};
      holdOnBone(model, obj, HAND[hand] || hand, { p: opts.p ?? def.p, r: opts.r ?? def.r, s: opts.s ?? def.s });
      held[key] = obj;
      dress._proxyDirty = true;
      return obj;
    },
    drop(key) { const h = held[key]; if (h) { h.removeFromParent(); delete held[key]; dress._proxyDirty = true; } return h ?? null; },
    dispose() {
      dress.silhouetteProxy?.userData.dispose?.(); dress.silhouetteProxy = null;
      dress.outline?.userData.dispose?.(); dress.outline = null;
      head?.dispose(); head?.root.removeFromParent();
      plate?.removeFromParent(); plate?.traverse((c) => { if (c.isMesh) c.geometry.dispose(); });
      plate?.userData.texture?.dispose?.(); plate?.getObjectByName('plateWord')?.material.dispose();
      for (const k of Object.keys(held)) dress.drop(k);
    },
  };
  return dress;
}

/** Default hand offsets (metres) for carried props: cages hang under the fist, signposts lean on the shoulder. */
const CARRY = {
  cage: { p: [0, -0.86, 0.06], r: [0, 0, 0] },
  signpost: { p: [0, -0.35, 0], r: [0.25, 0, -0.35] },
  post_bag: { p: [0, -0.28, 0.02], r: [0, 0, 0] },
  lantern: { p: [0, -0.1, 0.02], r: [0, 0, 0] },
  // WA §2.5 / WA26: Barkus's mallet (grip in the fist, bone head up) and a Squeakybone's toy bone club
  big_squeaky_bone: { p: [0, -0.12, 0.02], r: [Math.PI / 2, 0, 0], s: 1.25 },
  squeaky_bone: { p: [0, -0.1, 0.02], r: [Math.PI / 2, 0, 0], s: 1.0 },
};

const _squeakyMats = new Map();
/**
 * Squeakybone look (WA26: bone tint `#F3E6C8`): every material under `model` becomes a shared tinted twin (one clone per
 * source material for the whole process, same program, so 0 extra draws / compiles per spawn). The toy knob comes from
 * the held `squeaky_bone` (red rubber caps). Returns a restore function.
 * @param {THREE.Object3D} model @param {{ tint?: THREE.ColorRepresentation }} [o]
 */
export function squeakyLook(model, o = {}) {
  const tint = new THREE.Color(o.tint ?? WARM_LOOKS.squeakyBone);
  const key = tint.getHexString();
  const twin = (m) => {
    if (!m || !m.color) return m;
    const id = m.uuid + ':' + key;
    let t = _squeakyMats.get(id);
    if (!t) { t = own(m.clone()); t.color.copy(m.color).multiply(tint); t.name = (m.name || 'mat') + ':squeaky'; _squeakyMats.set(id, t); }
    return t;
  };
  const saved = [];
  model.traverse((c) => {
    if (!c.isMesh || c.userData.noSqueaky) return;
    saved.push([c, c.material]);
    c.material = Array.isArray(c.material) ? c.material.map(twin) : twin(c.material);
  });
  return () => { for (const [c, m] of saved) c.material = m; };
}

const _silMats = new Map();
/**
 * Flat silhouette: every mesh under `root` renders in one unlit colour (fogged). Returns a restore function.
 * @param {THREE.Object3D} root @param {string} [color] @param {{ fog?: boolean, castShadow?: boolean }} [o]
 */
export function silhouette(root, color = '#3A2E4A', o = {}) {   // a soft plum, never near-black (ART §2.6)
  const matFor = (src) => {
    const cut = src && !Array.isArray(src) && src.alphaTest > 0 && src.map ? src.map : null;   // keep tuft-card cut-outs
    const key = color + (o.fog === false ? ':nofog' : '') + (cut ? ':' + cut.uuid : '');
    let m = _silMats.get(key);
    if (!m) {
      m = own(new THREE.MeshBasicMaterial({ color, fog: o.fog !== false, ...(cut ? { map: cut, alphaTest: src.alphaTest, side: THREE.DoubleSide } : {}) }));
      _silMats.set(key, m);
    }
    return m;
  };
  const saved = [];
  root.traverse((c) => {
    if (!(c.isMesh || c.isSkinnedMesh)) return;
    saved.push([c, c.material, c.castShadow]);
    c.material = matFor(c.material);
    if (o.castShadow !== undefined) c.castShadow = o.castShadow;
  });
  return () => { for (const [c, mat, cs] of saved) { c.material = mat; c.castShadow = cs; } };
}
