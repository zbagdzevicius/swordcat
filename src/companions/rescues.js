// src/companions/rescues.js  (owner: companions) — where this area's M2 rescues stand in Acts I–II (GAME_DESIGN §12.4
// forest, §12.5 town, §12.6 gate, §6.4 hiding spots, §5.4 D-02 / D-03 / D-04 / D-06). Pure data + one placement pass.
//
// World's level files own the zones; a `kind: 'kitten'` zone (or an arena `rescue`) calls ctx.companions.spawnKitten
// itself. CompanionManager runs `placeRescues` on `level:loaded` (after world's onLoaded hooks), and fills in only what
// the level did NOT place, so a level that is still a stub (or forgets one) keeps every kitten and friend reachable.
// Rows: [id, at [x, z], hide, opts]. Opts are spawnKitten's (see CompanionManager.spawnKitten).
import { KITTENS_BY_LEVEL } from '../core/config.js';

/**
 * WA12 / ON §6.2: carriers whose latch is cracked (only a Bright Slash / Holy opens them; other blows "tink"). Mochi's,
 * so the skill is taught where it matters.
 */
export const CRACKED_LOCKS = Object.freeze({ mochi: true });
/**
 * WA16: rescues that wait for a story flag on a level (Mochi's tipped cart is on the prologue's lane: he is carried off
 * in CS-02, so his carrier appears only once Chapter 1 starts). level → kittenId → flag.
 */
export const RESCUE_AFTER = Object.freeze({ meadow: Object.freeze({ mochi: 'prologue.done' }) });
/** ON §6.1: carts that fell off the wagon (tipped 8°, a loose broken wheel beside them). */
export const TIPPED_CARTS = Object.freeze({ mochi: true });

/** Sage's treetop rope posts (§12.4 `treetop`): 30 HP each; 3/3 cut → the cage lowers over 2 s → D-02. */
export const TREETOP_ROPES = Object.freeze([[13, -8], [23, -8], [18, -13]]);

/** Per-level rescues (lost kittens 3 per level, caged squires, service kittens). */
export const RESCUES = Object.freeze({
  forest: [
    // Pickles: the mushroom house door at (−12,−52) (Meow); a bush hides him when the level brings no house
    ['pickles', [-12, -50.6], 'meow', { prop: 'bush', facing: 0 }],
    // Pebble: behind the cracked boulder at (−22,−26) (Bright Slash / Holy, or the boulder's PropActor calls reveal())
    ['pebble', [-22, -26], 'break', {}],
    // Sprout: the rat tent cage at (−22,66), opens once the Rat Camp is clear
    ['sprout', [-22, 66], 'cage', { needClear: 'ratcamp', facing: Math.PI / 2, ribbon: true }],
    // Sage: the treetop cage hangs at 4 m by the giant oak; the rope posts lower it → D-02
    ['sage', [18, -8], 'cage', { hang: 4, ropes: TREETOP_ROPES, lowerOn: { objective: ['ropes', 'treetop', 'treetop_ropes', 'sage_ropes'] }, play: 'd02', facing: Math.PI }],
  ],
  town: [
    // Waffles on the Lantern Alley balcony (5,−30), y 3; Toffee on the fountain statue top (0,8), y 2.5;
    // Muffin on the Bell Tower's outside loft ledge (0,50.5), y 6
    ['waffles', [5, -30], 'climb', { y: 3.0, facing: Math.PI }],
    ['toffee', [0, 8], 'climb', { y: 2.5, facing: Math.PI }],
    ['muffin', [0, 50.5], 'climb', { y: 6.0, facing: Math.PI }],
    // D-03 Marmalade peeks out of the bakery door (−26,−20) once Bakery Street is clear; he stays at the door
    ['marmalade', [-23.2, -19.2], null, { appearOn: 'bakery', stay: true, talkR: 3.6, facing: Math.PI / 2, expression: 'surprised' }],
    // D-04 Tofu: the 3rd barrel of the 6-barrel stack in the Forge Yard (18,−14); Meow or a knock reveals him
    ['tofu', [18, -14], 'meow', { prop: 'barrel', stack: 6, leaveTo: [30, -10], facing: 0 }],
    // D-04 Clover: the stocks at (10,14), free once the Square is clear (3 blows or E) → join
    ['clover', [10, 14], 'cage', { cage: 'stocks', needClear: 'square', interact: true, hits: 3, play: 'd04clover', facing: Math.PI }],
  ],
  gate: [
    // D-06: the hyena war-wagon cage at (6,−80): Tater (host), Mittens and Pip inside; 3 blows open it
    ['tater', [6, -80], 'cage', { cage: 'cart', size: [1.5, 0.95, 1.05], hits: 3, facing: Math.PI }],
    ['mittens', [6, -80], 'cage', { cageWith: 'tater', off: [-0.38, 0.1] }],
    ['pip', [6, -80], 'cage', { cageWith: 'tater', off: [0.42, -0.12], leaveTo: [0, 41], play: 'd06' }],
    // Socks: under the causeway stairs at (6,−52), on the ledge (y −0.8 relative to the deck)
    ['socks', [6.6, -52.6], 'climb', { facing: Math.PI }],
  ],
});

/** Lost-kitten ids placed per level by RESCUES (U12 cross-check: 3 per level, matching KITTENS_BY_LEVEL). */
export function lostKittenRows(levelId) {
  const ids = KITTENS_BY_LEVEL[levelId] ?? [];
  return (RESCUES[levelId] ?? []).filter((r) => ids.includes(r[0]));
}

/**
 * Should a rescue row be placed in the current state? Rescued kittens, joined squires and freed service kittens don't
 * come back (except Marmalade, who `stay`s at the door until the hub opens); nothing of the occupied town is placed
 * once the town is free (hub mode: HubKittens takes over).
 */
export function rowWanted(levelId, row, state) {
  const [id] = row;
  const flag = (k) => !!state?.getFlag?.(k);
  if (levelId === 'town' && flag('town.free')) return false;
  if (state?.kittens?.includes?.(id)) return false;
  if (state?.companions?.unlocked?.includes?.(id)) return false;
  if (id === 'marmalade') return true;
  if (id === 'tofu' && flag('town.tofu')) return false;
  if (id === 'pip' && flag('gate.pip')) return false;
  if (id === 'earlgrey' && flag('town.earlgrey')) return false;
  return true;
}
