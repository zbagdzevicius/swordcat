// src/enemies/types/kaykitGear.js  (owner: enemies) — dresses a fitted KayKit humanoid (Barbarian / Rogue_Hooded /
// Knight) as a Hound Legion beast (GAME_DESIGN §3.7, §10.2, §18.3) with the characters area's `dressBeast`: the beast
// head on bone `head`, the scratched breastplate word on `chest`; plus a weapon on `handslot.r` and an optional
// carried cage (with a kitten inside: Pearl's has the pink ribbon) or mailbag, kept upright while the arm swings.
import * as THREE from 'three';
import { attachAligned, bone, keepUpright, mountNative, posIn, tintAll } from '../rig.js';
import { friendWordFor } from '../names.js';

import * as CHARS from '../../characters/index.js';

/**
 * The characters area's public API. Imported statically (core, M2): companions and the player already pull it into
 * the main chunk, so a dynamic import only produced Vite's INEFFECTIVE_DYNAMIC_IMPORT warning. The async signature
 * stays so callers need no change.
 * @returns {Promise<typeof import('../../characters/index.js')>}
 */
export function characters() { return Promise.resolve(CHARS); }

/** The characters module (sync access for ScriptedActor prop toggles). */
export function loadedCharacters() { return CHARS; }

/** Carried-cage scale for a 1.35 m hyena (the cage hangs from the left fist, its floor just above the grass). */
const CAGE_SCALE = 0.62;
const CAGE_BASE_H = 1.35;

/**
 * @param {import('../Enemy.js').Enemy} e @param {any} m ModelInstance
 * @param {{look?: string, head?: object, headNode?: string, expression?: string, word?: string|null, plate?: boolean,
 *          plateOpts?: object, weapon?: {model: string, bone?: string, fit?: any}, cage?: boolean|string, bag?: boolean,
 *          tint?: string|number}} o
 */
export async function dressKayKit(e, m, o = {}) {
  const space = m.root, seed = typeof e.seed === 'number' ? e.seed : 1;
  const C = await characters();
  if (e.disposed) return;
  const { dressBeast, BEAST_LOOKS } = C;
  if (o.tint) tintAll(m.scene, o.tint);
  if (o.look) {
    try {
      const look = BEAST_LOOKS[o.look] ? o.look : 'hyena';
      let word = e.spawnOpts?.word !== undefined ? e.spawnOpts.word : o.word;
      // WA §8.3: from gate.done on, hub hyenas wear their friend words (index-paired with the seed's HATER word)
      if (e.friendly && word === undefined && BEAST_LOOKS[look]?.words?.length) {
        const foe = C.pickPlateWord(BEAST_LOOKS[look].words, seed >>> 0);
        word = friendWordFor(e.def.id, foe) ?? foe;
      }
      e.dress = dressBeast(space, look, { seed, word, plate: o.plate, plateOpts: o.plateOpts, head: { headNode: o.headNode, ...(o.head ?? {}) } });
      e.head = e.dress;
      e.plate = e.dress.plate; e.plateWord = e.dress.word;
      e.plateFriendWord = e.friendly ? null : friendWordFor(e.def.id, e.plateWord);
      if (e.plate && e.plateFriendWord) bakeFriendPlate(e, C, look, seed);
      e.dress.setExpression(o.expression ?? 'sneer');
    } catch (err) { console.warn(`[enemies] beast dress failed for ${e.def.id}`, err); }
  }
  const cage = e.spawnOpts?.cage ?? o.cage;
  if (cage) addCage(e, m, cage, C);
  if (o.bag) addHeldProp(e, m, 'post_bag', 'handslot.r', { down: 0.28, scale: 1.1 }, C);
  if (o.weapon) await addWeapon(e, m, o.weapon);
}

/**
 * WA §8.3: the friend word baked at dress time, so the bonk flip costs no canvas work. Characters' `dress.flipPlate`
 * (both words in one texture, a UV swap; characters.W4) wins when it exists; until then the friend word is painted once
 * into a second texture with the same seed and style and the decal's map is swapped (Enemy.flipPlate).
 */
export function bakeFriendPlate(e, C, look, seed) {
  if (typeof e.dress?.flipPlate === 'function' || typeof C.makePlateTexture !== 'function') return;
  const decal = e.plate.getObjectByName?.('plateWord');
  if (!decal?.material?.map) return;
  const style = CHARS.BEAST_LOOKS?.[look]?.style ?? 'rusty';
  const tex = C.makePlateTexture(e.plateFriendWord, { seed, ink: style === 'black' ? '#D8CFC0' : undefined, scratch: style === 'black' ? 'rgba(142,27,34,0.7)' : undefined });
  if (!tex) return;
  const foe = decal.material.map;
  tex.wrapS = foe.wrapS; tex.wrapT = foe.wrapT; tex.colorSpace = foe.colorSpace; tex.anisotropy = foe.anisotropy;
  e._plateSwap = { decal, foe, friend: tex };
}


/** Mount a fitted weapon GLB natively on a KayKit hand slot; its tip becomes the telegraph glint point. */
export async function addWeapon(e, m, w) {
  const node = bone(m.scene, w.bone ?? 'handslot.r');
  if (!node) return null;
  const inst = await e.ctx.assets.model(w.model, { fit: w.fit, ground: false });
  if (e.disposed) return null;
  mountNative(m.root, node, inst.root);
  const tip = new THREE.Object3D(); tip.name = 'tell';
  tip.position.set(0, (inst.size?.y ?? 0.8) * 0.85, 0);          // KayKit blades run along the slot's +Y (metres here)
  inst.root.add(tip);
  e.tipNode = tip; e.weaponRoot = inst.root;
  return inst;
}

/**
 * Hang `obj` under a hand like a pendulum: a pivot sits on the hand bone (bind-pose aligned, scaled by `scale`) and
 * is kept upright every frame (yaw = the actor's facing), so `obj` (its origin `drop` pivot-units below) always hangs
 * straight down from the fist whatever the arm does.
 */
export function hangFrom(e, m, hand, obj, { drop = 0, scale = 1 } = {}) {
  const pivot = new THREE.Group();
  pivot.name = 'hang:' + (obj.name || 'prop');
  const hp = posIn(m.root, hand);
  attachAligned(m.root, hand, pivot, { pos: [hp.x, hp.y, hp.z], scale });
  obj.position.set(0, -drop, 0);
  pivot.add(obj);
  keepUpright(e, pivot);
  return pivot;
}

/**
 * A carried cage with a kitten inside, hanging from the left fist.
 * `which`: 'pearl' (Pearl, pink ribbon), a cat id, or true (a squire picked by the enemy's seed). `C` = characters().
 */
export function addCage(e, m, which, C) {
  const { cagedKitten, buildProp, SQUIRE_IDS } = C;
  const hand = bone(m.scene, 'handslot.l');
  if (!hand) return null;
  const who = which === true ? SQUIRE_IDS[(e.seed >>> 0) % SQUIRE_IDS.length] : String(which);
  let c = null;
  try { c = cagedKitten(e.ctx, who, { style: 'carry', ribbon: who === 'pearl' }); } catch (err) { console.warn('[enemies] caged kitten failed', err); }
  const root = c?.root ?? buildProp('cage', { style: 'carry', ribbon: who === 'pearl' });
  if (!root) return null;
  const s = ((m.size?.y ?? CAGE_BASE_H) / CAGE_BASE_H) * CAGE_SCALE;
  const H = c?.cage?.userData?.size?.[1] ?? root.userData?.size?.[1] ?? 0.75;
  const pivot = hangFrom(e, m, hand, root, { drop: H + 0.06, scale: s });
  root.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  e.extraProps.cage = pivot;
  e.cagedKitten = c;
  e.cageWho = who;
  return pivot;
}

/** Hang a characters prop (post bag, lantern...) from a hand. */
export function addHeldProp(e, m, name, handName, { down = 0, scale = 1 } = {}, C) {
  const hand = bone(m.scene, handName), p = C.buildProp(name);
  if (!hand || !p) return null;
  const pivot = hangFrom(e, m, hand, p, { drop: down, scale });
  p.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  e.extraProps[name] = pivot;
  return pivot;
}

const _hb = new THREE.Box3(), _bb = new THREE.Box3(), _hv = new THREE.Vector3(), _hs = new THREE.Vector3();
/**
 * Seat a KayKit hat (Barbarian_Hat) on top of the bigger beast head (core integration, M2): the stock hat sits on
 * the small KayKit skull, so over the hyena head it hid the eyes and read as a bear. Scales it a little and lifts it
 * so its lowest point rests at `brim` (0 = head bottom … 1 = head top) of the beast head. Visual only.
 * @param {any} e @param {any} m ModelInstance @param {{node?: string, brim?: number, scale?: number}} [o]
 */
export function seatHat(e, m, { node = 'Barbarian_Hat', brim = 0.6, scale = 1.15 } = {}) {
  const hat = m?.scene?.getObjectByName?.(node), head = e?.dress?.head?.root;
  if (!hat || !head) return false;
  m.root.updateWorldMatrix(true, true);
  _hb.setFromObject(hat); _bb.setFromObject(head);
  if (_hb.isEmpty() || _bb.isEmpty()) return false;
  hat.scale.multiplyScalar(scale);
  m.root.updateWorldMatrix(true, true);
  _hb.setFromObject(hat);
  const wantY = _bb.min.y + (_bb.max.y - _bb.min.y) * brim, dy = wantY - _hb.min.y;
  if (dy > 0 && hat.parent) {
    // world-space lift → the hat parent's local space
    hat.getWorldPosition(_hv); _hs.copy(_hv); _hs.y += dy;
    hat.parent.worldToLocal(_hv); hat.parent.worldToLocal(_hs);
    hat.position.add(_hs.sub(_hv));
  }
  return true;
}
