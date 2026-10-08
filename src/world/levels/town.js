// src/world/levels/town.js  (owner: world) — L3 Pawsbury (§12.5). M1 bootable stub on the real LevelKit: the street
// spine, KayKit houses along it, the castle and bell tower at the north end, spawns (start, hub, bakery_cot,
// belltower) and the hub Vigil Stone. Lantern Alley, the bakery chase, the forge, the square arena, the Castle Steps
// and the hub stations arrive in M2.
import { defineLevel } from '../LevelKit.js';

const B = (n) => `models/env/village-kaykit/buildings/${n}.glb`;

export default defineLevel({
  id: 'town', size: 140, res: 112, seed: 31, hills: { amp: 0.4 }, pathWidth: 6, rim: 3, pathSurface: 'stone',
  env: { default: 'town_occupied', byFlag: [['ending.seen', 'ending_gold'], ['gate.done', 'hub_grey'], ['town.free', 'hub_gold']] },
  music: { explore: 'village_town_theme', combat: 'battle_fast_fight_loop' },
  spine: [[0, -66], [0, -46], [0, -10], [0, 20], [0, 50]],
  paths: [{ pts: [[0, -18], [-20, -18], [-36, 4]], width: 5 }, { pts: [[0, -6], [22, -6], [30, -10]], width: 5 }],
  spawns: { start: [0, -66, 0], hub: [0, -46, 0], bakery_cot: [-22, -20, -Math.PI / 2], belltower: [0, 50.5, 0] },
  anchors: {},
  zones: [
    { id: 'vigil_1', kind: 'checkpoint', at: [-5, -50] },
    { id: 'vigil_2', kind: 'checkpoint', at: [-8, 0] },
    { id: 'letter_3', kind: 'letter', letterId: 'l3', at: [28, -2] },
    { id: 'castle', kind: 'setpiece', at: [0, 62], placed: [{ model: B('building_castle_red'), at: [0, 64], fit: { h: 18 }, yaw: Math.PI }] },
    { id: 'belltower', kind: 'setpiece', at: [6, 54], placed: [{ model: B('building_tower_A_red'), at: [7, 54], fit: { h: 16 }, yaw: 0 }] },
  ],
  scatter: [
    { model: [B('building_home_A_red'), B('building_home_A_blue'), B('building_home_B_red'), B('building_home_B_blue'), B('building_tavern_red'), B('building_market_red')],
      n: 16, fit: { h: [6, 9] }, minDistFromPath: 9, minDist: 6, area: { at: [0, 0], r: 56 } },
    { model: ['models/env/nature/tree_default.glb', 'models/env/nature/tree_oak.glb'], n: 14, fit: { h: [6, 9] }, minDistFromPath: 8, minDist: 5, tree: true },
  ],
  crates: { n: 8, milk: 2 },
  grass: { height: 0.18, near: 0.6, flowers: 1.4 },
});
