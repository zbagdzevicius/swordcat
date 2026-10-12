// src/world/levels/bog.js  (owner: world) — L5 Bogmire (§12.7). M1 bootable stub on the real LevelKit: dead trees,
// reeds, the spine, vigils and the Sovereign Pool arena (MVP elite slime waves). Boardwalks, the 70% water plane,
// lily pads, the Smugglers' Landing and the Sunken Tower arrive in M3.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'bog', size: 180, res: 120, seed: 47, hills: { amp: 1.0 }, pathWidth: 4,
  env: { default: 'bog' },
  // CONTROLS_SPEC §4.2 / §11: the densest fog (the stage is small by design); a memeSpot at the Sovereign Pool
  cam: { yaw: Math.PI, fog: { clear: 4.5, clearCombat: 6, topMul: 1.2 } },
  memeSpot: { at: [-6, 70], yaw: Math.PI, r: 4 },
  music: { explore: 'cave_theme', combat: 'battle_fast_fight_loop' },
  spine: [[0, -80], [-22, -52], [0, -22], [26, 4], [12, 34], [-16, 54], [-6, 78], [-6, 90]],
  spawns: { start: [0, -86, 0], boss: [-6, 64, 0] },
  anchors: {},
  zones: [
    { id: 'vigil_1', kind: 'checkpoint', at: [-4, -76] },
    { id: 'vigil_2', kind: 'checkpoint', at: [18, 16] },
    { id: 'vigil_3', kind: 'checkpoint', at: [-2, 62] },
    { id: 'letter_5', kind: 'letter', letterId: 'l5', at: [-34, -46] },
    { id: 'pool', kind: 'arena', at: [-6, 78], r: 13, waves: [[['jelly_l', 3]], [['jelly_l', 2], ['spider', 2], ['rat_xbow', 1]]] },
  ],
  scatter: [
    { model: ['models/env/nature/tree_default_dark.glb', 'models/env/nature/tree_oak_dark.glb', 'models/env/nature/tree_thin_dark.glb'], n: 60, fit: { h: [6, 11] }, minDistFromPath: 6, minDist: 5, tree: true },
    { model: ['models/env/nature/stump_old.glb', 'models/env/nature/stump_oldTall.glb'], n: 20, fit: { h: [0.6, 1.4] }, minDistFromPath: 3 },
    { model: 'models/env/nature/plant_flatTall.glb', n: 80, fit: { h: [0.8, 1.3] }, minDistFromPath: 2.8, collider: false, minDist: 0.8 },
  ],
  crates: { n: 8, milk: 2 },
  grass: { height: 0.34, near: 0.8, colors: { root: '#1E2614', tip: '#6A6E3E', dry: '#8C8A4E' } },
});
