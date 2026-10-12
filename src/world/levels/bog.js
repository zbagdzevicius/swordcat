// src/world/levels/bog.js  (owner: world) — L5 Bogmire (§12.7). M1 bootable stub on the real LevelKit, dressed as the
// cozy-spooky "enchanted lagoon at dusk" (WA §2.2, LI §4.5): `bog_dusk` (purple sky, teal haze, a low peach sun),
// sea-glass trees, glowing lilac / mint mushrooms off the path (LI W13) and 12 honey lamp posts along the spine
// feeding the lamp pools (LI W14). Boardwalks, the water plane, lilies, the Smugglers' Landing and the Sunken Tower
// arrive in M3.
import { defineLevel } from '../LevelKit.js';
import { addFlame } from '../Dressing.js';
import { pointAlong, polylineLength, smoothPolyline } from '../noise.js';

const SPINE = [[0, -80], [-22, -52], [0, -22], [26, 4], [12, 34], [-16, 54], [-6, 78], [-6, 90]];
/** LI W13 / W14 looks: canopy sea-glass, glowing caps, lamp posts along the path (`lampOff` m beside it). */
const LOOK = Object.freeze({ canopy: '#7FC8A0', canopyDark: '#5FA884', capLilac: '#C9A8FF', capMint: '#8FF0D8', post: '#B7773F', glass: '#FFC46B',
  lampOff: 3.2, lamps: 12 });
const TREE_TPL = { recolorMap: { leafsGreen: LOOK.canopy, leafsDark: LOOK.canopyDark }, key: 'bogTree' };
const CAP = (c, key) => ({ recolorMap: { colorRed: c, colorTan: c, _defaultMat: c }, key });
const LAMP = 'models/env/graveyard/lightpost-single.glb';

/** 12 lamp posts along the spine, alternating sides (their lanterns feed ENV_U.uLamps; the 4 nearest light the ground). */
async function decorate(kit) {
  const post = await kit.tpl(LAMP, { tint: LOOK.post, key: 'bogLamp' });
  const lane = smoothPolyline(SPINE, 2), L = polylineLength(lane);
  for (let i = 0; i < LOOK.lamps; i++) {
    const s = (i + 0.5) * (L / LOOK.lamps), [px, pz, yaw] = pointAlong(lane, s), side = i % 2 ? 1 : -1;
    const x = px + Math.cos(yaw) * LOOK.lampOff * side, z = pz - Math.sin(yaw) * LOOK.lampOff * side;
    const p = post ? kit.place(post, x, z, { fit: { h: 2.6 }, yaw, collider: 'circle', shrink: 0.4, jitter: 0, clear: 0.5 }) : null;
    addFlame(kit.level, kit.level.lightPool, x, (p ? p.top : kit.h(x, z) + 2.6) - 0.35, z, { size: 0.5, light: 1.8, distance: 9, glow: 1.2, color: LOOK.glass, flicker: 0.12 });
  }
}

export default defineLevel({
  id: 'bog', size: 180, res: 120, seed: 47, hills: { amp: 1.0 }, pathWidth: 4,
  env: { default: 'bog_dusk' },
  // CONTROLS_SPEC §4.2 / §11: the densest fog (the stage is small by design); a memeSpot at the Sovereign Pool
  cam: { yaw: Math.PI, fog: { clear: 4.5, clearCombat: 6, topMul: 1.2 } },
  memeSpot: { at: [-6, 70], yaw: Math.PI, r: 4 },
  music: { explore: 'cave_theme', combat: 'battle_fast_fight_loop' },
  spine: SPINE,
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
    { model: ['models/env/nature/tree_default.glb', 'models/env/nature/tree_oak.glb'], n: 60, fit: { h: [6, 11] }, minDistFromPath: 6, minDist: 5, tree: true, tpl: TREE_TPL },
    // LI W13: glowing lilac / mint mushroom clusters off the path (merged into the props batch: 0 draws)
    { model: ['models/env/nature/mushroom_redTall.glb', 'models/env/nature/mushroom_tanGroup.glb'], n: 15, fit: { h: [0.8, 1.8] }, minDistFromPath: 4, minDist: 2, collider: false, clear: 0.4, tpl: CAP(LOOK.capLilac, 'capLilac') },
    { model: ['models/env/nature/mushroom_redTall.glb', 'models/env/nature/mushroom_tanGroup.glb'], n: 15, fit: { h: [0.8, 1.8] }, minDistFromPath: 4, minDist: 2, collider: false, clear: 0.4, tpl: CAP(LOOK.capMint, 'capMint') },
    { model: ['models/env/nature/stump_old.glb', 'models/env/nature/stump_oldTall.glb'], n: 20, fit: { h: [0.6, 1.4] }, minDistFromPath: 3 },
    { model: 'models/env/nature/plant_flatTall.glb', n: 80, fit: { h: [0.8, 1.3] }, minDistFromPath: 2.8, collider: false, minDist: 0.8 },
  ],
  crates: { n: 8, milk: 2 },
  grass: { height: 0.34, near: 0.8 },                          // ART §2.6 bog grass (GRASS_COLORS.bog)
  lights: 4,
  decorate,
  // WA §2.6: lantern strings over the Sovereign Pool (mint / lilac / amber)
  accent: 'bog',
  bunting: [{ a: [-16, 4.2, 70], b: [4, 4.2, 70], kind: 'lantern' }, { a: [-16, 4.0, 84], b: [4, 4.0, 84], kind: 'lantern' }],
  models: [LAMP],
});
