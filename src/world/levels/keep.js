// src/world/levels/keep.js  (owner: world) — L6 Houndhold Keep (§12.8). M1 bootable stub on the real LevelKit, dressed
// as Barkus's moonlit party castle (WA §2.2, LI §4.6): `keep_twilight` (the storm is Barkus P3 only), a honey-stone crag,
// 10 jack-o-lanterns (WA19: they feed the lamp pools; no fire baskets) and Barkus's vanity bunting (royal blue / bone
// gold). The courtyard ballistas, cellars, rampart climb and the 18 m roof arrive in M3.
import { defineLevel } from '../LevelKit.js';
import { addFlame } from '../Dressing.js';

const G = (n) => `models/env/graveyard/${n}.glb`;
/** LI §4.6 looks: honey rock, carved pumpkins (orange, a warm light inside), their spots beside the spine. */
const LOOK = Object.freeze({ rock: '#C8A486', pumpkin: '#FF9A3C', glow: '#FFC46B' });
const JACKS = [[-4, -50, 'pumpkin-carved'], [4, -44, 'pumpkin-tall-carved'], [-4.5, -30, 'pumpkin-carved'], [4.5, -24, 'pumpkin-carved'], [-4, -4, 'pumpkin-tall-carved'],
  [4.2, 4, 'pumpkin-carved'], [-4.4, 18, 'pumpkin-tall-carved'], [4.4, 22, 'pumpkin-carved'], [-3.6, 38, 'pumpkin-tall-carved'], [3.6, 40, 'pumpkin-carved']];

/** The jack-o-lanterns (WA19): carved pumpkins beside the path facing it, a small warm flame inside each (a lamp pool). */
async function decorate(kit) {
  const tpls = {};
  for (const n of ['pumpkin-carved', 'pumpkin-tall-carved']) tpls[n] = await kit.tpl(G(n), { tint: LOOK.pumpkin, key: 'jack:' + n });
  for (const [x, z, n] of JACKS) {
    const p = tpls[n] ? kit.place(tpls[n], x, z, { fit: { h: n.includes('tall') ? 0.75 : 0.55 }, yaw: x > 0 ? -Math.PI / 2 : Math.PI / 2, collider: 'circle', shrink: 0.8, jitter: 0.04 }) : null;
    addFlame(kit.level, kit.level.lightPool, x, p ? (p.y + p.top) / 2 : kit.h(x, z) + 0.3, z, { size: 0.4, light: 1.8, distance: 8, glow: 1.0, color: LOOK.glow, flicker: 0.2 });
  }
}

export default defineLevel({
  id: 'keep', size: 140, res: 112, seed: 59, hills: { amp: 2.0 }, pathWidth: 6, pathSurface: 'stone', surface: 'stone',
  // WA §2.2: a clear purple twilight with a teal moon; `keep_storm` only rolls in for Barkus P3
  env: { default: 'keep_twilight' },
  // CONTROLS_SPEC §4.2 / §11 (M3 authors the rampart climb hint + links): clear 5 / 7, topMul 1.4
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
    { model: ['models/env/nature/rock_largeA.glb', 'models/env/nature/rock_largeB.glb', 'models/env/nature/rock_tallA.glb', 'models/env/nature/rock_tallB.glb'], n: 50, fit: { h: [1.2, 4] }, minDistFromPath: 6, minDist: 3,
      tpl: { tint: LOOK.rock, sat: 0.9, key: 'keepRock' } },
  ],
  lights: 4,
  decorate,
  // LI §4.6: Barkus's vanity bunting (royal blue / bone gold / teal moss) across the courtyard
  accent: 'keep',
  bunting: [{ a: [-8, 5.2, -10], b: [8, 5.2, -10] }, { a: [-8, 5.2, 12], b: [8, 5.2, 12] }],
  models: [G('pumpkin-carved'), G('pumpkin-tall-carved')],
  crates: { n: 6, milk: 2 },
  grass: false,
  horizon: false,
});
