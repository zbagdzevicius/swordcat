// src/enemies/types/hyena.js  (owner: enemies) — Hyena Raider (GAME_DESIGN §10.2–§10.3; Appendix B.3 shape).
// M1: the look (Barbarian.glb + characters' hyena head + scratched plate + Skeleton_Blade) and the base melee FSM
// with hyena_slash (white glint) and hyena_lunge (red, unblockable dash from 3–5 m). CS-02 spawns them scripted and
// AI-less: ctx.enemies.spawn('hyena', pos, { id, scripted: true, ai: false, cage: true | 'pearl', word }).
// Gloat, Jeer and pack flanking arrive in M2.
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressKayKit } from './kaykitGear.js';

const def = ENEMIES.hyena;

export const HYENA_ANIMS = {
  ...CLIP_MAPS.kaykit.roles,
  hyena_slash: { windup: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0, to: 0.35, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Slice_Horizontal', from: 0.35, to: 1, speed: 1.3 } },
  hyena_lunge: { windup: { clip: '1H_Melee_Attack_Stab', from: 0, to: 0.3, speed: 'fit' }, strike: { clip: '1H_Melee_Attack_Stab', from: 0.3, to: 1, speed: 1.4 } },
};

export default {
  ...def,
  id: 'hyena',
  anims: HYENA_ANIMS,
  build: (e, m) => dressKayKit(e, m, {
    look: 'hyena', headNode: 'Barbarian_Head', head: { chippedEar: e.seed % 3 === 0 ? 'left' : null }, weapon: def.weapon, expression: 'sneer',
  }),
};
