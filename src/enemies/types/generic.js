// src/enemies/types/generic.js  (owner: enemies) — base versions of the Appendix A rows whose full AI lands in M3 /
// MVP+ (Boneheads, warhound, bat, hornet): the right GLB fitted and dressed, the clip map for its rig, and the base
// melee FSM over the row's attacks. Their type files replace these entries later. (M2's spider, stealer, pug and
// Gloomjelly have their own type files.)
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS, rigFor } from '../clipMaps.js';
import * as THREE from 'three';
import { bone, mountNative, attachAligned } from '../rig.js';
import { makeProp } from '../props.js';

const _box = new THREE.Box3(), _ec = new THREE.Vector3(), _es = new THREE.Vector3(), _ws = new THREE.Vector3();

/**
 * ART §7.2 Squeakybone face: the KayKit glowing eye slits are hidden and two big round friendly eyes (cream sclera,
 * pupil, white catchlight) sit where they were, on the head bone; the Minion wears the mustard pot helm (top colour).
 * Exported for tests. @param {any} e @param {any} m model instance @param {string} variant
 */
export function dressSqueakybone(e, m, variant) {
  const head = bone(m.scene, 'head') ?? bone(m.scene, 'Head');
  if (!head) return;
  let eyesNode = null;
  m.scene.traverse((o) => { if (!eyesNode && /_Eyes$/.test(o.name ?? '')) eyesNode = o; });
  m.root.updateMatrixWorld(true);
  if (eyesNode) {
    _box.setFromObject(eyesNode);
    eyesNode.visible = false;
  }
  const inv = new THREE.Matrix4().copy(m.root.matrixWorld).invert();
  if (eyesNode && !_box.isEmpty()) {
    _box.getCenter(_ec).applyMatrix4(inv); _box.getSize(_es);
    const ws = m.root.getWorldScale(_ws).x;               // root-local units (the prop's metres)
    const s = Math.max(0.6, (_es.x / Math.max(1e-6, ws)) / 0.22);   // the eye pair is ~0.22 wide
    attachAligned(m.root, head, makeProp('eyes'), { pos: [_ec.x, _ec.y, _ec.z + 0.02], scale: Math.min(1.6, s) * 1.15 });
  } else {
    head.updateMatrixWorld(true);
    _ec.setFromMatrixPosition(head.matrixWorld).applyMatrix4(inv);
    attachAligned(m.root, head, makeProp('eyes'), { pos: [_ec.x, _ec.y + 0.2, _ec.z + 0.22], scale: 1.3 });
  }
  if (variant === 'minion') {
    head.updateMatrixWorld(true);
    _box.setFromObject(m.scene.getObjectByName('Skeleton_Minion_Head') ?? head);
    const top = _box.isEmpty() ? null : _box.max.clone().applyMatrix4(inv).y;
    _ec.setFromMatrixPosition(head.matrixWorld).applyMatrix4(inv);
    const helm = makeProp('kettleHelm');
    attachAligned(m.root, head, helm, { pos: [_ec.x, (top ?? _ec.y + 0.4) - 0.1, _ec.z], rot: [-0.12, 0, 0], scale: 1.25 });
    e.helmet = helm;
  }
}

/** Roles for a model path (by rig), else an empty map (the Enemy falls back to squash). */
export function animsFor(model) {
  const rig = rigFor(model);
  return rig ? { ...CLIP_MAPS[rig].roles } : {};
}

/** @type {Record<string, any>} */
export const GENERIC = {
  warhound: { ...ENEMIES.warhound, radius: 0.4, height: 0.8, mass: 1.2, sight: 14, fov: 2.79, leash: 25, attacks: [{ id: 'bone_chop', weight: 1, range: 1.3 }], anims: animsFor(ENEMIES.warhound.model) },
  bat: { ...ENEMIES.bat, radius: 0.25, height: 0.4, mass: 0.2, walk: 3, run: ENEMIES.bat.speed, sight: 10, fov: 6.28, leash: 20, attacks: [{ id: 'spider_bite', weight: 1, range: 1.0 }], anims: animsFor(ENEMIES.bat.model), scamper: true },
  hornet: { ...ENEMIES.hornet, radius: 0.3, height: 0.6, mass: 0.4, walk: 2, run: 3, sight: 15, fov: 3.14, leash: 20, attacks: [{ id: 'bone_chop', weight: 1, range: 1.4 }], anims: animsFor(ENEMIES.hornet.model) },
};

/** Bonehead variant def (`bonehead:<variant>`). */
export function boneheadDef(variant) {
  const base = ENEMIES.bonehead, v = base.variants[variant] ?? base.variants.minion;
  const vid = base.variants[variant] ? variant : 'minion';
  const atk = { id: v.attack, weight: 1, range: v.attack === 'bone_bolt' ? 12 : 1.7 };
  return {
    ...base, ...v, id: `bonehead:${vid}`, variant: vid, attacks: [atk], anims: animsFor(v.model),
    build: async (e, m) => {
      try { dressSqueakybone(e, m, vid); } catch (err) { console.warn('[enemies] squeakybone face', err); }
      const node = bone(m.scene, 'handslot.r');
      if (!node || !v.weapon) return;
      const w = await e.ctx.assets.model(v.weapon, { fit: { max: v.attack === 'bone_bolt' ? 1.0 : 0.7 }, ground: false });
      if (!e.disposed) mountNative(m.root, node, w.root);
    },
  };
}
