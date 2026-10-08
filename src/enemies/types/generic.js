// src/enemies/types/generic.js  (owner: enemies) — base versions of the Appendix A rows whose full AI lands in M2/M3
// (spider, stealer, pug, Boneheads, Gloomjelly, MVP+ warhound/bat/hornet): the right GLB fitted and dressed, the clip
// map for its rig, and the base melee FSM over the row's attacks. Their type files replace these entries later.
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS, rigFor } from '../clipMaps.js';
import { dressKayKit } from './kaykitGear.js';
import { bone, mountNative } from '../rig.js';

const SLIME = 'models/creatures/polypizza/Slime.glb';

/** Roles for a model path (by rig), else an empty map (the Enemy falls back to squash). */
export function animsFor(model) {
  const rig = rigFor(model);
  return rig ? { ...CLIP_MAPS[rig].roles } : {};
}

function kaykit(row, look) {
  return { ...row, anims: { ...CLIP_MAPS.kaykit.roles }, build: (e, m) => dressKayKit(e, m, look) };
}

/** @type {Record<string, any>} */
export const GENERIC = {
  spider: { ...ENEMIES.spider, anims: animsFor(ENEMIES.spider.model), scamper: true },
  stealer: kaykit(ENEMIES.stealer, { head: 'hyena', headNode: 'Rogue_Head_Hooded', headOpts: { mane: false }, plate: ENEMIES.stealer.plateWords, bag: true }),
  pug: kaykit(ENEMIES.pug, { head: 'pug', headNode: 'Knight_Head', headOpts: { scale: (ENEMIES.pug.helmetScale ?? 1) * 1.15 } }),
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
      const node = bone(m.scene, 'handslot.r');
      if (!node || !v.weapon) return;
      const w = await e.ctx.assets.model(v.weapon, { fit: { max: v.attack === 'bone_bolt' ? 1.0 : 0.7 }, ground: false });
      if (!e.disposed) mountNative(m.root, node, w.root);
    },
  };
}

/** Gloomjelly size def (`jelly`, `jelly_l|m|s`, `jelly_giant`): the Slime.glb fallback until the procedural build (M2). */
export function jellyDef(type) {
  const base = ENEMIES.jelly, key = (type.split('_')[1] ?? 'l').toUpperCase(), size = base.sizes[key] ?? base.sizes.L;
  return {
    ...base, id: type, size: base.sizes[key] ? key : 'L', hp: size.hp, radius: size.r, height: size.h, mass: 0.6, fish: [size.fish, size.fish],
    walk: base.hopDist / base.hopEvery, run: base.hopDist / base.hopEvery * 1.5, fov: 6.28,
    model: SLIME, fit: { h: size.h }, anims: animsFor(SLIME), scamper: false,
  };
}

export const GENERIC_MODELS = [SLIME];
