// src/enemies/scripted/Cacklejaw.js  (owner: enemies) — Warchief Cacklejaw as an AI-less cutscene actor (CS-02 "The
// Laughing Fog", §5.4; §3.7 look): Barbarian.glb at 2.2 m with its hat on (it hides the chipped left ear until B2
// phase 3, §11.3), characters' hyena head (mane, chipped left ear), the "HATER-IN-CHIEF" plate and an oversized
// curved blade (Skeleton_Blade at the `cacklejaw` MODEL_FIT role).
// Spawn: ctx.enemies.spawn('cacklejaw', pos, { id: 'cacklejaw', facing }). Story drives him with the ScriptedActor
// API: moveTo / face / play('laugh' | 'Cheer' | any S3 clip) / pose('laugh' | 'sneer' | ...) / emote('laugh').
// The boss fight (B2) is a separate type (`boss_cacklejaw`).
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit } from '../types/kaykitGear.js';

/** Barbarian props hidden on Cacklejaw (the hyena list minus `Barbarian_Hat`, which he keeps). */
export const CACKLEJAW_HIDE = ENEMIES.hyena.hide.filter((n) => n !== 'Barbarian_Hat');

export const CACKLEJAW_LOOK = {
  look: 'cacklejaw', headNode: 'Barbarian_Head', expression: 'laugh',
  weapon: { ...ENEMIES.hyena.weapon, fit: 'cacklejaw' },
};

export default {
  id: 'cacklejaw',
  model: ENEMIES.hyena.model, fit: 'cacklejaw', hide: CACKLEJAW_HIDE,
  faction: 'enemy', radius: 0.6, height: 2.2, mass: 4, hp: 700, poise: 15, walk: 1.6, run: 4.5, sight: 0, fov: 2.44, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, fish: null, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles },
  build: (e, m) => dressKayKit(e, m, CACKLEJAW_LOOK),
};
