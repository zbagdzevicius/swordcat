// src/enemies/scripted/BarkusSilhouette.js  (owner: enemies) — CS-02 shot 2 far dressing (§5.4): an unlit Barkus
// silhouette on the Bell Tower at `bell_far` — Knight.glb + the bulldog head (horned helm) fitted to 3 m, scaled ×2
// for forced perspective, everything one black MeshBasicMaterial that ignores fog so it reads against the sky.
// Spawn: ctx.enemies.spawn('barkus_silhouette', anchorPos, { id: 'barkus_far', facing }). Not hostile, never hurtable.
import * as THREE from 'three';
import { ENEMIES } from '../../core/config.js';
import { ENEMY_PAL } from '../props.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit } from '../types/kaykitGear.js';

const HIDE = ['Knight_Head', 'Knight_Helmet', '1H_Sword', '1H_Sword_Offhand', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'];

export default {
  id: 'barkus_silhouette',
  model: ENEMIES.pug.model, fit: 'barkus', visualScale: 2, hide: HIDE, show: ['Knight_Cape', '2H_Sword'],
  faction: 'neutral', radius: 0.9, height: 6, mass: 50, hp: 1, poise: 99, sight: 0, leash: 999,
  aiLess: true, hurtable: false, smallHeart: false, tags: ['cutscene'],
  anims: { ...CLIP_MAPS.kaykit.roles, idle: '2H_Melee_Idle' },
  async build(e, m) {
    await dressKayKit(e, m, { head: 'bulldog', headNode: 'Knight_Head', headOpts: { jowls: true, underbite: true, eyepatch: true, hornedHelm: true }, expression: 'angry' });
    const mat = new THREE.MeshBasicMaterial({ color: ENEMY_PAL.silhouette, fog: false });
    mat.userData.enemyOwned = true;
    m.root.traverse((o) => { if (o.isMesh) { o.material = mat; o.castShadow = false; o.receiveShadow = false; } });
  },
};
