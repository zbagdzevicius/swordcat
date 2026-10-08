// src/enemies/scripted/BarkusSilhouette.js  (owner: enemies) — CS-02 shot 2 far dressing (§5.4): an unlit Barkus
// silhouette on the Bell Tower at `bell_far` — Knight.glb + the bulldog head (horned helm) fitted to 3 m, scaled ×2
// for forced perspective, everything one black MeshBasicMaterial (characters' `silhouette`, unfogged so it reads
// against the sky). Spawn: ctx.enemies.spawn('barkus_silhouette', anchorPos, { id: 'barkus_far', facing }).
// Not hostile, never hurtable, no AI.
import { ENEMIES } from '../../core/config.js';
import { ENEMY_PAL } from '../props.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit, characters } from '../types/kaykitGear.js';

const HIDE = ['Knight_Head', 'Knight_Helmet', '1H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'];

export default {
  id: 'barkus_silhouette',
  model: ENEMIES.pug.model, fit: 'barkus', visualScale: 2, hide: HIDE, show: ['Knight_Cape', '2H_Sword'],
  faction: 'neutral', radius: 0.9, height: 6, mass: 50, hp: 1, poise: 99, sight: 0, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, fish: null, tags: ['cutscene'], noFlash: true, noPhysics: true,
  anims: { ...CLIP_MAPS.kaykit.roles, idle: '2H_Melee_Idle' },
  async build(e, m) {
    await dressKayKit(e, m, { look: 'barkus', headNode: 'Knight_Head', expression: 'angry', plate: false });
    if (e.disposed) return;
    (await characters()).silhouette(m.root, ENEMY_PAL.silhouette, { fog: false, castShadow: false });
  },
};
