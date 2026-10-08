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
import { attachPlate, pickPlateWord } from './Plate.js';
import { buildProp, buildCage } from './Props/ProcProps.js';
import { own } from './materials.js';

/** Per-look head preset + options and plate word source (§3.7 villains, §11 boss builds). */
export const BEAST_LOOKS = Object.freeze({
  hyena: { head: 'hyena', opts: { mane: true }, words: ENEMIES.hyena?.plateWords ?? ['HATER'], style: 'rusty' },
  stealer: { head: 'hyena', opts: { mane: false }, words: ENEMIES.stealer?.plateWords ?? ['POST STEALER'], style: 'rusty' },
  pilfer: { head: 'hyena', opts: { mane: false, scale: 1.22 }, words: ['POST STEALER'], style: 'iron' },
  cacklejaw: { head: 'hyena', opts: { mane: true, chippedEar: 'left', lift: 0.15 }, words: ['HATER-IN-CHIEF'], style: 'rusty' },
  pug: { head: 'pug', opts: {}, words: null },
  brutus: { head: 'pug', opts: { scar: true }, words: null },
  barkus: { head: 'bulldog', opts: { jowls: true, underbite: true, eyepatch: true, hornedHelm: true }, words: null },
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
  const plate = word && o.plate !== false ? attachPlate(model, word, { seed, style: L.style, ...(o.plateOpts || {}) }) : null;
  const held = {};
  const dress = {
    look: typeof look === 'string' ? look : L.head, head, plate, word, held,
    /** 'neutral' | 'sneer' | 'angry' | 'laugh' | 'sad' | 'surprised' | 'kneel' */
    setExpression(name) { head?.setExpression(name); return dress; },
    /** Barkus phase 2: the horned helm shatters. */
    setHelm(on) { head?.setHelm?.(on); return dress; },
    update(dt) { head?.update(dt); },
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
      return obj;
    },
    drop(key) { const h = held[key]; if (h) { h.removeFromParent(); delete held[key]; } return h ?? null; },
    dispose() {
      head?.dispose(); head?.root.removeFromParent();
      plate?.removeFromParent(); plate?.traverse((c) => { if (c.isMesh) c.geometry.dispose(); });
      plate?.userData.texture?.dispose?.();
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
};

const _silMats = new Map();
/**
 * Flat silhouette: every mesh under `root` renders in one unlit colour (fogged). Returns a restore function.
 * @param {THREE.Object3D} root @param {string} [color] @param {{ fog?: boolean, castShadow?: boolean }} [o]
 */
export function silhouette(root, color = '#17171B', o = {}) {
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
