// src/world/levels/meadow.js  (owner: world) — M0 STUB: Purrdale Meadows (§12.3). Spine, spawns and anchors
// from Appendix B.1; zones/scatter/water come with the world agent's M1 build.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'meadow', size: 200, res: 128, seed: 11, hills: { amp: 1.5, octaves: 3 }, pathWidth: 6,
  env: { default: 'meadow_day', byFlag: [['!prologue.done', 'meadow_night']] },
  music: { explore: 'field_of_dreams', combat: 'battle_fast_fight_loop' },
  spine: [[0, -80], [0, -62], [-6, -50], [-22, -30], [-20, -4], [2, 18], [24, 40], [30, 62], [30, 90]],
  spawns: { title: [0, -64, Math.PI], practice: [-10, -90, 0], start: [-4, -58, 0], boss: [30, 66, 0] },   // [x, z, yaw]; yaw 0 faces +Z
  anchors: { bell_far: [-130, -20, 30], horde_a: [-40, -45], horde_b: [30, -55], crane_bell: [-60, -40, 25], crane_field: [0, -70, 3],
             pud_1: [20, 36], pud_2: [36, 50], pud_3: [40, 72], pud_4: [22, 84] },
  zones: [],
});
