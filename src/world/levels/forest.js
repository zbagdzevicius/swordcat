// src/world/levels/forest.js  (owner: world) — M0 STUB: Whiskerwood (§12.4). Boss arena `mill` (B1).
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'forest', size: 200, res: 128, seed: 23, hills: { amp: 3.0 }, pathWidth: 5,
  env: { default: 'forest_day', byFlag: [['forest.camp', 'forest_night']] },
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  spine: [[0, -85], [-20, -58], [-10, -30], [18, -8], [24, 18], [6, 40], [-14, 60], [-10, 84]],
  spawns: { start: [0, -92, 0], boss: [-10, 70, 0] },
  anchors: {},
  zones: [{ id: 'mill', kind: 'arena', at: [-10, 84], r: 12, boss: 'boss_grizzlechop' }],
});
