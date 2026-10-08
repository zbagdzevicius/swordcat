// src/enemies/types/rat_pike.js  (owner: enemies) — Rat Pikeman (GAME_DESIGN §10.2–§10.3; art.md §11).
// Base melee FSM: patrols its post, alerts with a hop, takes a melee token, rat_poke (white glint, lunge 4 m/s,
// 0.8 s punish window), 30% follow-up rat_poke2 with a GOLD glint (a parry staggers 2.0 s). Below 20% HP it
// flees for 2 s ("Eek!"), then comes back. Defeat: helm spins off, poof, the rat scampers into the fog.
import { ENEMIES } from '../../core/config.js';
import { CLIP_MAPS } from '../clipMaps.js';
import { dressRat } from './ratGear.js';

export default {
  ...ENEMIES.rat_pike,
  id: 'rat_pike',
  anims: { ...CLIP_MAPS.rat.roles },
  scamper: true,
  build: (e, m) => dressRat(e, m, { helm: true, spear: true, buckler: true }),
};
