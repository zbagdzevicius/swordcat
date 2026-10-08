// src/world/levels/town.js  (owner: world) — M0 STUB: Pawsbury (§12.5), occupied town then the hub.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'town', size: 140, res: 112, seed: 31, hills: { amp: 0.4 }, pathWidth: 6,
  env: { default: 'town_occupied', byFlag: [['ending.seen', 'ending_gold'], ['gate.done', 'hub_grey'], ['town.free', 'hub_gold']] },
  music: { explore: 'village_town_theme', combat: 'battle_fast_fight_loop' },
  spine: [[0, -66], [0, -46], [0, -10], [0, 20], [0, 50]],
  spawns: { start: [0, -66, 0], hub: [0, -46, 0], bakery_cot: [-22, -20, -Math.PI / 2], belltower: [0, 50.5, 0] },
  anchors: {},
  zones: [],
});
