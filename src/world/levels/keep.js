// src/world/levels/keep.js  (owner: world) — L6 Houndhold Keep (§12.8). M1 bootable stub on the real LevelKit: the
// rocky crag, the spine from the gate to the roof, vigils, braziers and the roof boss arena (B3 Barkus, at ground
// level until the M3 tower). The courtyard ballistas, cellars, rampart climb and the 18 m roof arrive in M3.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'keep', size: 140, res: 112, seed: 59, hills: { amp: 2.0 }, pathWidth: 6, pathSurface: 'stone', surface: 'stone',
  env: { default: 'keep_storm' },
  // CONTROLS_SPEC §4.2 / §11 (M3 authors the rampart climb hint + links): keep_storm clear 5 / 7, topMul 1.4
  cam: { yaw: Math.PI, fog: { clear: 5, clearCombat: 7, topMul: 1.4, keep_cellar: { clear: 5, clearCombat: 7, topMul: 1.4 } } },
  music: { explore: 'battle_theme_a', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  spine: [[0, -66], [0, -58], [0, -20], [0, 10], [0, 36], [0, 46]],
  spawns: { start: [0, -66, 0], gate: [0, -66, 0], boss: [-3, 32, 0] },
  anchors: {},
  zones: [
    { id: 'vigil_1', kind: 'checkpoint', at: [-5, -62] },
    { id: 'vigil_2', kind: 'checkpoint', at: [5, -12] },
    { id: 'vigil_3', kind: 'checkpoint', at: [-5, 30] },
    { id: 'letter_6', kind: 'letter', letterId: 'l6', at: [16, 16] },
    { id: 'roof', kind: 'arena', at: [0, 46], r: 10, boss: 'boss_barkus' },
  ],
  scatter: [
    { model: ['models/env/nature/rock_largeA.glb', 'models/env/nature/rock_largeB.glb', 'models/env/nature/rock_tallA.glb', 'models/env/nature/rock_tallB.glb'], n: 50, fit: { h: [1.2, 4] }, minDistFromPath: 6, minDist: 3 },
    { model: 'models/env/graveyard/fire-basket.glb', n: 8, fit: { h: 1.2 }, minDistFromPath: 4, area: { at: [0, -10], r: 40 } },
  ],
  crates: { n: 6, milk: 2 },
  grass: false,
  horizon: false,
});
