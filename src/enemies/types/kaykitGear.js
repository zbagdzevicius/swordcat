// src/enemies/types/kaykitGear.js  (owner: enemies) — dresses a fitted KayKit humanoid (Barbarian / Rogue_Hooded /
// Knight) as a beast soldier (GAME_DESIGN §10.2, §18.3): characters' beast head on bone `head`, the scratched
// breastplate word on `chest`, a weapon on `handslot.r`, an optional carried cage / mailbag kept upright.
import * as THREE from 'three';
import { attachBeastHead, attachPlate, pickPlateWord, buildCage, buildProp } from '../../characters/index.js';
import { attachAligned, bone, keepUpright, mountNative, posIn, tintAll } from '../rig.js';

/**
 * @param {import('../Enemy.js').Enemy} e @param {any} m ModelInstance
 * @param {{head?: 'hyena'|'pug'|'bulldog', headOpts?: object, headNode?: string, expression?: string,
 *          plate?: string|string[], plateStyle?: string, weapon?: {model: string, bone?: string, fit?: any},
 *          cage?: boolean|string, bag?: boolean, tint?: string|number}} o
 */
export async function dressKayKit(e, m, o = {}) {
  const space = m.root, seed = typeof e.seed === 'number' ? e.seed : 1;
  if (o.tint) tintAll(m.scene, o.tint);
  if (o.head) {
    try {
      e.head = attachBeastHead(space, o.head, { headNode: o.headNode, seed, ...(o.headOpts ?? {}) });
      e.head?.setExpression?.(o.expression ?? 'sneer');
    } catch (err) { console.warn(`[enemies] beast head failed for ${e.def.id}`, err); }
  }
  if (o.plate) {
    const word = e.spawnOpts?.word ?? (Array.isArray(o.plate) ? pickPlateWord(o.plate, seed) : o.plate);
    try { e.plate = attachPlate(space, word, { seed, style: o.plateStyle ?? 'rusty' }); e.plateWord = word; } catch (err) { console.warn('[enemies] plate failed', err); }
  }
  const cage = e.spawnOpts?.cage ?? o.cage;
  if (cage) {
    const hand = bone(m.scene, 'handslot.l');
    if (hand) {
      const c = buildCage({ style: 'carry', ribbon: cage === 'pearl' });
      const s = (m.size?.y ?? 1.35) / 1.35 * 0.62;
      const hp = posIn(space, hand);
      attachAligned(space, hand, c, { pos: [hp.x, hp.y - 0.75 * s - 0.04, hp.z], scale: s });
      c.traverse((x) => { if (x.isMesh) x.castShadow = true; });
      keepUpright(e, c);
      e.extraProps.cage = c;
    }
  }
  if (o.bag) addHeldProp(e, m, 'post_bag', 'handslot.r', { down: 0.05, scale: 1.1 });
  if (o.weapon) {
    const node = bone(m.scene, o.weapon.bone ?? 'handslot.r');
    if (node) {
      const w = await e.ctx.assets.model(o.weapon.model, { fit: o.weapon.fit, ground: false });
      if (e.disposed) return;
      mountNative(space, node, w.root);
      const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, (w.size?.y ?? 0.8) * 0.85, 0);
      w.root.add(tip);
      e.tipNode = tip; e.weaponRoot = w.root;
    }
  }
}

/** Hold a characters prop (post bag, letter...) in a hand, kept upright. */
export function addHeldProp(e, m, name, handName, { down = 0, scale = 1 } = {}) {
  const hand = bone(m.scene, handName), p = buildProp(name);
  if (!hand || !p) return null;
  const hp = posIn(m.root, hand);
  attachAligned(m.root, hand, p, { pos: [hp.x, hp.y - down, hp.z], scale });
  p.traverse((x) => { if (x.isMesh) x.castShadow = true; });
  keepUpright(e, p);
  e.extraProps[name] = p;
  return p;
}
