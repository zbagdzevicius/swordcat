// src/enemies/types/kaykitGear.js  (owner: enemies) — dresses a fitted KayKit humanoid (Barbarian / Rogue_Hooded /
// Knight) as a Hound Legion beast (GAME_DESIGN §3.7, §10.2, §18.3) with the characters area's `dressBeast`: the beast
// head on bone `head`, the scratched breastplate word on `chest`; plus a weapon on `handslot.r` and an optional
// carried cage (with a kitten inside: Pearl's has the pink ribbon) or mailbag, kept upright while the arm swings.
import * as THREE from 'three';
import { attachAligned, bone, keepUpright, mountNative, posIn, tintAll } from '../rig.js';
import { friendWordFor } from '../names.js';
import { HEAD_REMAPS, remapVertexColors } from '../palette.js';
import { makeProp } from '../props.js';

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
 *          plateOpts?: object, weapon?: {model: string, bone?: string, fit?: any}, hold?: {prop: string, hand?: 'l'|'r'}, cage?: boolean|string, bag?: boolean,
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
      recolorBeastHead(e.dress.head, BEAST_LOOKS[look]?.head, C.BEAST_PRESETS);
      e.plate = e.dress.plate; e.plateWord = e.dress.word;
      e.plateFriendWord = e.friendly ? null : friendWordFor(e.def.id, e.plateWord);
      if (e.plate && e.plateFriendWord) bakeFriendPlate(e, C, look, seed);
      e.dress.setExpression(o.expression ?? 'sneer');
    } catch (err) { console.warn(`[enemies] beast dress failed for ${e.def.id}`, err); }
  }
  const cage = e.spawnOpts?.cage ?? o.cage;
  if (cage) addCage(e, m, cage, C);
  if (o.bag) addHeldProp(e, m, 'post_bag', 'handslot.r', { down: 0.28, scale: 1.1 }, C);
  // WA §2.5 / characters.W5: a procedural held weapon (Barkus's Big Squeaky Bone) through the dress; the GLB `weapon`
  // stays the fallback when the dress or the prop is missing
  if (o.hold && e.dress?.hold && holdProp(e, o.hold)) return;
  if (o.weapon) await addWeapon(e, m, o.weapon);
}

/** Linear-rgb swatch lists per head preset, built once (the presets are frozen). */
const _remapCache = new Map();

/**
 * WA §3.1: repaint a beast head's vertex colours with the enemies' foe hues (HEAD_REMAPS: the tawny hyena → lilac-plum
 * with mustard spots). Once per dressed head at build time; pooled visuals keep theirs. No-op for presets without a remap.
 * @param {{root?: THREE.Object3D}|null|undefined} head the characters head handle @param {string|undefined} preset
 * @param {Record<string, Record<string, any>>|undefined} presets characters' BEAST_PRESETS
 * @returns {number} vertices changed
 */
export function recolorBeastHead(head, preset, presets) {
  const map = preset ? HEAD_REMAPS[preset] : null, P = presets?.[preset];
  if (!head?.root || !map || !P) return 0;
  let lists = _remapCache.get(preset);
  if (!lists) {
    const src = [], dst = [], c = new THREE.Color();
    for (const [k, v] of Object.entries(P)) {
      if (typeof v !== 'string' || v[0] !== '#') continue;
      c.set(v); const s = [c.r, c.g, c.b];
      src.push(s);
      if (map[k]) { c.set(map[k]); dst.push([c.r, c.g, c.b]); } else dst.push(s);
    }
    lists = { src, dst };
    _remapCache.set(preset, lists);
  }
  let n = 0;
  head.root.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.color) n += remapVertexColors(o.geometry, lists.src, lists.dst); });
  return n;
}

/**
 * Put a held prop in the dress's hand: a characters prop by name ('big_squeaky_bone', 'squeaky_bone') or one of the
 * enemies' own procedural props (`own: true`: props.js `makeProp`, e.g. the pug's 'practiceSword'). `opts` = the
 * characters hand offset { p, r, s } (metres / radians / scale; s on top of the prop's own size). Its top becomes the
 * telegraph glint point (`e.tipNode`). → the held Object3D, or null.
 * @param {any} e @param {{prop: string, own?: boolean, hand?: 'l'|'r', opts?: {p?: number[], r?: number[], s?: number}}} h
 */
export function holdProp(e, h) {
  let obj = null;
  try {
    // built here (not by name) when an offset is given: characters' hold() also hands `opts` to the prop builder,
    // where `r` means a radius (squeakyBone), not the hand rotation
    const what = h.own ? makeProp(h.prop) : h.opts ? CHARS.buildProp(h.prop) : h.prop;
    obj = e.dress.hold(what, h.hand ?? 'r', h.opts ?? {});
  } catch (err) { console.warn(`[enemies] hold ${h.prop} failed`, err); }
  if (!obj) return null;
  const box = new THREE.Box3().setFromObject(obj, true);
  const tip = new THREE.Object3D(); tip.name = 'tell';
  // the prop's local top (props are built along +Y); world box → local height through the prop's scale
  const sy = obj.getWorldScale(new THREE.Vector3()).y || 1;
  tip.position.set(0, Number.isFinite(box.max.y) ? (box.max.y - box.min.y) / sy * 0.9 : 0.8, 0);
  obj.add(tip);
  e.tipNode = tip; e.weaponRoot = obj;
  return obj;
}

const _hm = new THREE.Matrix4(), _gb = new THREE.Box3();
/**
 * Bounding box of every mesh under `obj`, in `space` coordinates (bind pose; from the geometries' own boxes, so the
 * actor's yaw never inflates it). Visual setup only (dress time). → `out` (empty when there are no meshes).
 * @param {THREE.Object3D} space @param {THREE.Object3D} obj @param {THREE.Box3} out
 */
export function boxIn(space, obj, out) {
  out.makeEmpty();
  space.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(space.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    _gb.copy(o.geometry.boundingBox).applyMatrix4(_hm.multiplyMatrices(inv, o.matrixWorld));
    out.union(_gb);
  });
  return out;
}

const _sb = new THREE.Box3(), _eb = new THREE.Box3(), _ob = new THREE.Box3(), _sc = new THREE.Vector3(), _ss = new THREE.Vector3();
/**
 * WA §3.1 toy headgear: seat one of the enemies' procedural hats (props.js: 'potHelm', 'chiefCrown') on the beast head,
 * riding the KayKit `head` bone. The hat's rim (its origin, radius `rimR` m) is sized to `width` × the head's width
 * and set at `brim` (0 = head bottom … 1 = head top) of the head's height, `fwd` × the head depth toward +Z.
 * `eyes` sizes and seats it from the beast eyes instead (heads with tall ears / a mane, whose box overstates the
 * crown): rim diameter = `eyes.width` × the eye pair's span, rim height = the eyes' top + `eyes.above` × that span.
 * → the hat mesh (shared geometry and material), or null when there is no beast head / head bone.
 * @param {any} e @param {any} m ModelInstance @param {string} name props.js prop
 * @param {{brim?: number, width?: number, rimR?: number, fwd?: number, tilt?: number, eyes?: {width: number, above: number}}} [o]
 */
export function seatOnHead(e, m, name, { brim = 0.66, width = 0.8, rimR = 0.17, fwd = 0, tilt = -0.1, eyes = null } = {}) {
  const head = e?.dress?.head?.root, node = bone(m?.scene, 'head') ?? bone(m?.scene, 'Head');
  if (!head || !node) return null;
  boxIn(m.root, head, _sb);
  if (_sb.isEmpty()) return null;
  _sb.getCenter(_sc); _sb.getSize(_ss);
  let diam = _ss.x * width, y = _sb.min.y + _ss.y * brim;
  if (eyes) {
    _eb.makeEmpty();
    head.traverse((o) => { if (o.isMesh && o.name === 'beastEye') _eb.union(boxIn(m.root, o, _ob)); });
    if (!_eb.isEmpty()) {
      const span = _eb.max.x - _eb.min.x;
      diam = span * eyes.width; y = _eb.max.y + span * eyes.above;
    }
  }
  const hat = makeProp(name);
  attachAligned(m.root, node, hat, { pos: [_sc.x, y, _sc.z + _ss.z * fwd], rot: [tilt, 0, 0], scale: diam / (2 * rimR) });
  return hat;
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
