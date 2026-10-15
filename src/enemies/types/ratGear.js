// src/enemies/types/ratGear.js  (owner: enemies) — dresses a fitted Rat.glb clone (Rat Militia, art.md §11): matte fur
// recolour, oversized kettle helm (spins off on defeat), red eye glints, spear + cheese-sigil buckler (pikeman), open
// hood + crossbow (crossbowman). Helm, hood and eyes ride the `Head` bone; the spear, buckler and crossbow ride
// `Shoulders` (not the front legs: those swing through the walk cycle), so the spear always points where the rat
// faces and thrusts with the Rat_Attack lunge. Offsets are authored for the 0.8 m rat and scale with its fitted height.
import * as THREE from 'three';
import { makeProp, ENEMY_PAL } from '../props.js';
import { attachAligned, bone, posIn, recolor } from '../rig.js';

const BASE_H = 0.8;                       // gear offsets are authored for the 0.8 m rat (ENEMIES.rat_*.fit)
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Rat.glb ships metallic 0.4 / roughness 0.41 fur (reads as dark wet metal under the overcast light): make it matte. */
function matteFur(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m?.userData?.enemyOwned || m.metalness == null) continue;
      m.metalness = 0; m.roughness = 0.88;
    }
  });
}

/**
 * @param {import('../Enemy.js').Enemy} e @param {any} m ModelInstance from ctx.assets.model
 * @param {{helm?: boolean, hood?: boolean, spear?: boolean, buckler?: boolean, crossbow?: any, helmScale?: number}} gear
 */
/**
 * The quadruped Rat.glb fitted to h 0.8 is ~1.45 m nose to rump (2.7 m with the tail): its collision is a capsule
 * along the spine instead of the 0.30 m row circle (Enemy.spine / resolveBody), measured in page from the skinned
 * mesh (snout +0.74 m, rump -0.68 m, half-width 0.27 m). `k` scales it (Grizzlechop's fit is 1.6 m: k 2).
 */
export const ratBody = (k = 1) => Object.freeze({ front: 0.62 * k, back: 0.55 * k, r: 0.27 * k });

export async function dressRat(e, m, gear) {
  const space = m.root, k = (m.size?.y ?? BASE_H) / BASE_H;
  recolor(m.scene, { Grey: ENEMY_PAL.ratFur, Pink: ENEMY_PAL.ratSkin });
  matteFur(m.scene);
  const head = bone(m.scene, 'Head'), headEnd = bone(m.scene, 'Head_end');
  if (head) {
    const hp = posIn(space, head, _a), he = headEnd ? posIn(space, headEnd, _b) : _b.copy(hp).add(new THREE.Vector3(0, 0, 0.2 * k));
    const eyes = makeProp(gear.spear ? 'eyesBig' : 'eyes');   // TT3: the pikeman's bigger pupils
    attachAligned(space, head, eyes, { pos: [hp.x, THREE.MathUtils.lerp(hp.y, he.y, 0.3) + 0.075 * k, THREE.MathUtils.lerp(hp.z, he.z, 0.32)], scale: k });
    if (gear.helm || gear.hood) {
      const helm = makeProp(gear.hood ? 'hood' : 'kettleHelm');
      const s = k * (gear.helmScale ?? 1);
      attachAligned(space, head, helm, gear.hood
        ? { pos: [hp.x, hp.y + 0.1 * k, hp.z - 0.06 * k], rot: [-0.2, 0, 0], scale: s }
        : { pos: [hp.x, hp.y + 0.12 * k, hp.z - 0.04 * k], rot: [-0.18, 0, 0], scale: s });
      e.helmet = helm;
    }
  }
  const sh = bone(m.scene, 'Shoulders') ?? bone(m.scene, 'Body');
  if (!sh) return;
  const sp = posIn(space, sh, _a);
  if (gear.spear) {
    // held low along her right flank, butt behind the shoulder, the leaf tip ~0.5 m past the snout
    const spear = makeProp('spear');
    attachAligned(space, sh, spear, { pos: [sp.x - 0.25 * k, sp.y - 0.12 * k, sp.z - 0.45 * k], rot: [0.06, 0.06, 0], scale: k });
    const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, 0, 1.2);
    spear.add(tip);
    e.tipNode = tip;
  }
  // PERF §1.2 Low: the buckler is secondary gear (the helm is the top colour, the spear the role read): dropped
  if (gear.buckler && e.ctx?.quality?.id !== 'low') {
    const b = makeProp('buckler');
    attachAligned(space, sh, b, { pos: [sp.x + 0.2 * k, sp.y - 0.12 * k, sp.z + 0.04 * k], rot: [0, -0.25, 0], scale: k * 1.1 });
  }
  if (gear.crossbow) {
    const w = await e.ctx.assets.model(gear.crossbow.model, { fit: gear.crossbow.fit, ground: false, center: true, castShadow: true });
    if (e.disposed) return;
    // braced under the chin, between the front paws, pointing where she aims
    attachAligned(space, sh, w.root, { pos: [sp.x - 0.04 * k, sp.y - 0.2 * k, sp.z + 0.5 * k], rot: [-0.08, 0, 0], scale: k * 1.15 });
    const tip = new THREE.Object3D(); tip.name = 'tell'; tip.position.set(0, 0, (w.size?.z ?? 0.5) * 0.5);
    w.root.add(tip);
    e.tipNode = tip;
    e.weaponRoot = w.root;
  }
}
