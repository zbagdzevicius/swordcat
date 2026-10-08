// src/enemies/types/ratGear.js  (owner: enemies) — dresses a fitted Rat.glb clone (Rat Militia, art.md §11):
// fur recolour, oversized kettle helm (wobbles, spins off on defeat), red eye glints, spear + cheese-sigil buckler
// (pikeman), hood + crossbow (crossbowman). Gear is placed in the rat's bind pose, scaled with its fitted height,
// and parented to the bones it should follow.
import * as THREE from 'three';
import { makeProp, ENEMY_PAL } from '../props.js';
import { attachAligned, bone, posIn, recolor } from '../rig.js';

const BASE_H = 0.8;                       // gear offsets are authored for the 0.8 m rat (ENEMIES.rat_*.fit)
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/**
 * @param {import('../Enemy.js').Enemy} e @param {any} m ModelInstance from ctx.assets.model
 * @param {{helm?: boolean, hood?: boolean, spear?: boolean, buckler?: boolean, crossbow?: any, helmScale?: number}} gear
 */
export async function dressRat(e, m, gear) {
  const space = m.root, k = (m.size?.y ?? BASE_H) / BASE_H;
  recolor(m.scene, { Grey: ENEMY_PAL.ratFur, Pink: ENEMY_PAL.ratSkin });
  const head = bone(m.scene, 'Head'), headEnd = bone(m.scene, 'Head_end');
  if (head) {
    const hp = posIn(space, head, _a), he = headEnd ? posIn(space, headEnd, _b) : _b.copy(hp).add(new THREE.Vector3(0, 0, 0.2 * k));
    const eyes = makeProp('eyes');
    attachAligned(space, head, eyes, { pos: [hp.x, THREE.MathUtils.lerp(hp.y, he.y, 0.3) + 0.075 * k, THREE.MathUtils.lerp(hp.z, he.z, 0.32)], scale: k });
    if (gear.helm || gear.hood) {
      const helm = makeProp(gear.hood ? 'hood' : 'kettleHelm');
      const s = k * (gear.helmScale ?? 1);
      attachAligned(space, head, helm, gear.hood
        ? { pos: [hp.x, hp.y + 0.08 * k, hp.z - 0.02 * k], rot: [0.15, 0, 0], scale: s }
        : { pos: [hp.x, hp.y + 0.12 * k, hp.z - 0.04 * k], rot: [-0.18, 0, 0], scale: s });
      e.helmet = helm;
    }
  }
  const legR = bone(m.scene, 'FrontLeg.R'), legL = bone(m.scene, 'FrontLeg.L');
  if (gear.spear && legR) {
    const sp = posIn(space, legR, _a);
    const spear = makeProp('spear');
    attachAligned(space, legR, spear, { pos: [sp.x - 0.15 * k, sp.y + 0.03 * k, sp.z - 0.5 * k], rot: [-0.06, 0.04, 0], scale: k });
    const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, 0, 1.2);
    spear.add(tip);
    e.tipNode = tip;
  }
  if (gear.buckler && legL) {
    const sp = posIn(space, legL, _a);
    const b = makeProp('buckler');
    attachAligned(space, legL, b, { pos: [sp.x + 0.15 * k, sp.y - 0.06 * k, sp.z + 0.06 * k], rot: [0, -0.2, 0], scale: k });
  }
  if (gear.crossbow && legR) {
    const w = await e.ctx.assets.model(gear.crossbow.model, { fit: gear.crossbow.fit, ground: false, castShadow: true });
    if (e.disposed) return;
    const sp = posIn(space, legR, _a);
    attachAligned(space, legR, w.root, { pos: [sp.x + 0.02 * k, sp.y + 0.08 * k, sp.z + 0.12 * k], rot: [-0.1, 0, 0] });
    const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, 0, (w.size?.z ?? 0.5) * 0.75);
    w.root.add(tip);
    e.tipNode = tip;
    e.weaponRoot = w.root;
  }
}
