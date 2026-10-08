// src/world/levels/gate.js  (owner: world) — L4 The Low Gate, "The Line" (§12.6). M1 bootable stub on the real
// LevelKit: the yard, the causeway spine, the rectangular causeway boss arena (B2 Cacklejaw), vigils and the winch
// anchor. The tidal water, the causeway Octree box, towers, gatehouse, battlefield wrecks and The Line arrive in M2.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'gate', size: 180, res: 120, seed: 41, hills: { amp: 0.8 }, pathWidth: 12,
  env: { default: 'gate_dusk' },
  music: { explore: 'village_town_theme', combat: 'battle_theme_a', boss: 'boss_epic_battle_loop' },
  spine: [[0, 58], [0, 41], [0, 10], [0, -30], [0, -60], [0, -80]],
  spawns: { start: [0, 58, Math.PI], boss: [5, 20, Math.PI] },
  anchors: { winch: [0, 41], ballista_raft: [-16, -4, 1.2] },
  zones: [
    { id: 'vigil_1', kind: 'checkpoint', at: [-4, 56] },
    { id: 'vigil_2', kind: 'checkpoint', at: [9, 22] },
    { id: 'vigil_3', kind: 'checkpoint', at: [-4, -56] },
    { id: 'letter_4', kind: 'letter', letterId: 'l4', at: [-14, -80] },
    { id: 'causeway', kind: 'arena', at: [0, 10], size: [12, 40], boss: 'boss_cacklejaw' },
  ],
  scatter: [
    { model: ['models/env/castle/siege-tower-demolished.glb', 'models/env/castle/siege-catapult-demolished.glb', 'models/env/graveyard/debris.glb', 'models/env/graveyard/debris-wood.glb'],
      n: 16, fit: { max: [2, 5] }, minDistFromPath: 9, minDist: 4, area: { at: [0, -72], r: 24 } },
    { model: ['models/env/nature/stone_largeA.glb', 'models/env/nature/stone_largeB.glb'], n: 20, fit: { h: [0.8, 1.8] }, minDistFromPath: 8 },
  ],
  crates: { n: 6, milk: 2 },
  grass: { height: 0.22, near: 0.7 },
});
