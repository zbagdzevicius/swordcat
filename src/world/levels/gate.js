// src/world/levels/gate.js  (owner: world) — M0 STUB: The Low Gate (§12.6). Boss arena: the causeway (B2), rectangular.
import { defineLevel } from '../LevelKit.js';

export default defineLevel({
  id: 'gate', size: 180, res: 120, seed: 41, hills: { amp: 0.8 }, pathWidth: 12,
  env: { default: 'gate_dusk' },
  music: { explore: 'battle_theme_a', combat: 'battle_fast_fight_loop', boss: 'boss_epic_battle_loop' },
  spine: [[0, 58], [0, 41], [0, 10], [0, -30], [0, -60], [0, -80]],
  spawns: { start: [0, 58, Math.PI], boss: [5, 20, Math.PI] },
  anchors: { winch: [0, 41] },
  zones: [{ id: 'causeway', kind: 'arena', at: [0, 10], size: [12, 40], boss: 'boss_cacklejaw' }],
});
