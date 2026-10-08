// src/world/levels/bog.js  (owner: world) — M0 STUB: Bogmire (§12.7).
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'bog', size: 180, res: 120, seed: 47, hills: { amp: 1.0 }, pathWidth: 4,
  env: { default: 'bog' },
  music: { explore: 'cave_theme', combat: 'battle_fast_fight_loop' },
  spine: [[0, -80], [-22, -52], [0, -22], [26, 4], [12, 34], [-16, 54], [-6, 78], [-6, 90]],
  spawns: { start: [0, -86, 0], boss: [-6, 64, 0] },
  anchors: {},
  zones: [],
});
