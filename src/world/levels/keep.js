// src/world/levels/keep.js  (owner: world) — M0 STUB: Houndhold Keep (§12.8). Boss arena `roof` (B3), flat in the stub.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'keep', size: 140, res: 112, seed: 59, hills: { amp: 2.0 }, pathWidth: 6,
  env: { default: 'keep_storm' },
  music: { explore: 'battle_theme_a', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  spine: [[0, -66], [0, -58], [0, -20], [0, 10], [0, 36], [0, 46]],
  spawns: { start: [0, -66, 0], gate: [0, -66, 0], boss: [-3, 36, 0] },
  anchors: {},
  zones: [{ id: 'roof', kind: 'arena', at: [0, 46], r: 10, boss: 'boss_barkus' }],
});
