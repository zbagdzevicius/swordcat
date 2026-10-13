// src/enemies/scripted/Cacklejaw.js  (owner: enemies) — Warchief Cacklejaw as an AI-less cutscene actor (CS-02 "The
// Laughing Fog", §5.4; §3.7 look): Barbarian.glb at 2.2 m, characters' hyena head (mane, chipped left ear), the
// "HATER-IN-CHIEF" plate. WA §3.1 / §8.2 warm boss read: the near-black Barbarian_Hat (a fanged bear skull, a dark
// dome from the iso camera) is hidden for a crown-gold feather crown (props.js chiefCrown; it flies off in B2 phase 3,
// §11.3), and the cleaver is a big squeaky bone (the Skeleton_Blade stays only as the missing-prop fallback).
// Spawn: ctx.enemies.spawn('cacklejaw', pos, { id: 'cacklejaw', facing }). Story drives him with the ScriptedActor
// API: moveTo / face / play('laugh' | 'Cheer' | any S3 clip) / pose('laugh' | 'sneer' | ...) / emote('laugh').
// The boss fight (B2) is a separate type (`boss_cacklejaw`).
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit, seatOnHead } from '../types/kaykitGear.js';

/** Barbarian props hidden on Cacklejaw: the hyena list, Barbarian_Hat included (the feather crown replaces it). */
export const CACKLEJAW_HIDE = Object.freeze([...new Set([...ENEMIES.hyena.hide, 'Barbarian_Hat'])]);

export const CACKLEJAW_LOOK = {
  look: 'cacklejaw', headNode: 'Barbarian_Head', expression: 'laugh',
  hold: { prop: 'squeaky_bone', hand: 'r', opts: { p: [0, -0.08, 0], r: [0, 0, 0], s: 2.0 } },
  weapon: { ...ENEMIES.hyena.weapon, fit: 'cacklejaw' },
};

/** Crown seat on the hyena head, from the eyes (the ears and mane inflate the head box): rim ≈ 1.3 × the eye span
 *  wide, just above the brows, so the eyes and the ears stay clear. */
export const CHIEF_CROWN_SEAT = Object.freeze({ rimR: 0.2, tilt: -0.15, fwd: -0.05, eyes: Object.freeze({ width: 1.3, above: 0.3 }) });

/**
 * Dress Cacklejaw (cutscene actor, boss and the boss's dress share it): beast head + plate + squeaky bone, then the
 * feather crown as his `helmet` (it spins off as debris: B2 phase 3, §10.1 defeat). Pass `crown: false` for clones.
 * @param {any} e @param {any} m @param {{expression?: string, crown?: boolean}} [o]
 */
export async function dressCacklejaw(e, m, { expression = 'laugh', crown = true } = {}) {
  await dressKayKit(e, m, { ...CACKLEJAW_LOOK, expression });
  if (e.disposed || !crown) return;
  const c = seatOnHead(e, m, 'chiefCrown', CHIEF_CROWN_SEAT);
  if (c) { c.name = 'chief_crown'; e.helmet = c; }
}

export default {
  id: 'cacklejaw',
  model: ENEMIES.hyena.model, fit: 'cacklejaw', hide: CACKLEJAW_HIDE,
  faction: 'enemy', radius: 0.6, height: 2.2, mass: 4, hp: 700, poise: 15, walk: 1.6, run: 4.5, sight: 0, fov: 2.44, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, fish: null, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles },
  build: (e, m) => dressCacklejaw(e, m),
};
