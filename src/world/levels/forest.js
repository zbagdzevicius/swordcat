// src/world/levels/forest.js  (owner: world) — L2 Whiskerwood (§12.4). M1 bootable stub on the real LevelKit: giant
// oaks and mushrooms, the spine, vigils, the Cheese Mill boss arena (B1 Grizzlechop), the exit to town. The zones
// (mushroom platforms, Spider Hollow, treetop ropes, stream stumps, Lantern Camp, Rat Camp) arrive in M2.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'forest', size: 200, res: 160, seed: 23, hills: { amp: 3.0 }, pathWidth: 5,
  env: { default: 'forest_day', byFlag: [['forest.camp', 'forest_night']] },
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  spine: [[0, -85], [-20, -58], [-10, -30], [18, -8], [24, 18], [6, 40], [-14, 60], [-10, 84]],
  spawns: { start: [0, -92, 0], boss: [-10, 70, 0] },
  anchors: {},
  zones: [
    { id: 'vigil_1', kind: 'checkpoint', at: [0, -78] },
    { id: 'vigil_2', kind: 'checkpoint', at: [2, -20] },
    { id: 'vigil_3', kind: 'checkpoint', at: [2, 36] },
    { id: 'vigil_4', kind: 'checkpoint', at: [-5, 69] },
    { id: 'letter_2', kind: 'letter', letterId: 'l2', at: [23, 19] },
    { id: 'mill', kind: 'arena', at: [-10, 84], r: 12, boss: 'boss_grizzlechop' },
    { id: 'exit', kind: 'exit', at: [-24, 94], size: [8, 2], to: 'town', spawnId: 'start', when: 'forest.boss' },
  ],
  scatter: [
    { model: ['models/env/nature/tree_oak.glb', 'models/env/nature/tree_fat.glb', 'models/env/nature/tree_detailed.glb'], n: 90, fit: { h: [12, 18] }, minDistFromPath: 7, minDist: 6, tree: true },
    { model: ['models/env/nature/mushroom_redTall.glb', 'models/env/nature/mushroom_redGroup.glb', 'models/env/nature/mushroom_tanTall.glb'], n: 50, fit: { h: [1.5, 4] }, minDistFromPath: 4, minDist: 2.5 },
    { model: ['models/env/nature/plant_bush.glb', 'models/env/nature/plant_bushLarge.glb'], n: 40, fit: { h: [0.6, 1.4] }, minDistFromPath: 3.5, collider: false },
    { model: ['models/env/nature/stump_old.glb', 'models/env/nature/log_large.glb'], n: 12, fit: { max: [1, 2.5] }, minDistFromPath: 4 },
  ],
  crates: { n: 10, milk: 2 },
  grass: { height: 0.3, near: 0.8 },
});
