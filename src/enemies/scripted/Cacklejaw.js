// src/enemies/scripted/Cacklejaw.js  (owner: enemies) — Warchief Cacklejaw as an AI-less cutscene actor (CS-02 "The
// Laughing Fog", §5.4; §3.7 look): Barbarian.glb at 2.2 m, characters' hyena head (mane, chipped left ear, scar),
// black "HATER-IN-CHIEF" plate, oversized curved blade. Spawn: ctx.enemies.spawn('cacklejaw', pos, { id: 'cacklejaw' }).
// Story drives him with the ScriptedActor API: moveTo / face / play('laugh' | 'Cheer' | any S3 clip) / emote('laugh').
// The boss fight (B2, `boss_cacklejaw`) is a separate type (types/bosses.js).
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit } from '../types/kaykitGear.js';

export const CACKLEJAW_LOOK = {
  head: 'hyena', headNode: 'Barbarian_Head', headOpts: { mane: true, chippedEar: 'left', scar: true },
  plate: 'HATER-IN-CHIEF', plateStyle: 'black', weapon: { ...ENEMIES.hyena.weapon, fit: 'cacklejaw' }, expression: 'laugh',
};

export default {
  id: 'cacklejaw',
  model: ENEMIES.hyena.model, fit: 'cacklejaw', hide: ENEMIES.hyena.hide,
  radius: 0.6, height: 2.2, mass: 4, hp: 700, poise: 15, walk: 1.6, run: 4.5, sight: 0, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles },
  build: (e, m) => dressKayKit(e, m, CACKLEJAW_LOOK),
};
