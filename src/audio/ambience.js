// src/audio/ambience.js  (owner: audio) — M2 level ambience beds (GAME_DESIGN §16.2 "Ambience", §12.4–12.6 settings).
// Data + pure helpers (node-safe); AudioManager's AmbienceRunner plays them. The base water/rain loop per level stays in
// musicMap.AMBIENCE; these layers add the life of each place:
//
//   forest  birdsong by day (procedural), the stream at the stumps, Lantern Night crickets + an owl + the campfire
//   town    occupied: distant rat squeaks. Hub (town.free): the fountain, kittens chattering around the square, the
//           forge's anvil, the bakery oven, birds while the hub is gold; Coo at the Post Office after the ending
//   gate    the raft creaking, the horde's drums and laughs in the fog bank, and The Line's winch / pin hammering
//           while the repair runs (objective-driven)
//
// Layer kinds:
//   loop     { sound, at?, vol, rate? }                      a looped file (positional with `at`)
//   scatter  { sounds[], every:[a,b], vol, rate?:[a,b], at? | area?: {at:[x,z], r} | around?: r, burst?:[n,gap] }
//   birds    { every:[a,b], vol, around }                    procedural phrases around the listener
//   owl      { every:[a,b], vol, around }
//   crickets { vol }                                         procedural 2D bed
//   crackle  { at, vol }                                     procedural positional fire
//   laughs   { every:[a,b], vol, area }                      laugh builds from the fog
//
// `when`: a GameState.cond expression; the tokens `obj:<id>` (objective running, not frozen) and `objAny:<id>`
// (running, frozen or not) are resolved by the runner.

/** @type {Record<string, Array<object>>} */
export const AMBIENT_LAYERS = {
  forest: [
    { id: 'birds', kind: 'birds', when: '!forest.camp', every: [1.4, 4.2], vol: 1, around: 22 },
    { id: 'stream', kind: 'loop', sound: 'world/loop_water_01', at: [24, 0.2, 18], vol: 0.7, rate: 1.15 },
    { id: 'leaves', kind: 'scatter', when: '!forest.camp', sounds: ['impact/cloth'], every: [5, 11], vol: 0.18, rate: [0.55, 0.75], around: 14 },
    { id: 'crickets', kind: 'crickets', when: 'forest.camp', vol: 0.045 },
    { id: 'owl', kind: 'owl', when: 'forest.camp', every: [9, 19], vol: 0.12, around: 30 },
    { id: 'campfire', kind: 'crackle', when: 'forest.camp', at: [6, 0.4, 40], vol: 0.9 },
  ],
  town: [
    { id: 'rats', kind: 'scatter', when: '!town.free', sounds: ['creature/rat_squeak_attack', 'creature/rat_squeak_pain'], every: [7, 16], vol: 0.25, rate: [1.05, 1.3], around: 26 },
    { id: 'fountain', kind: 'loop', when: 'town.free', sound: 'world/loop_water_01', at: [0, 0.6, 8], vol: 0.45, rate: 1.35 },
    { id: 'kittens', kind: 'scatter', when: 'town.free', sounds: ['cat/cute_creature_0x', 'cat/kitten_mew_01', 'cat/meow_baby_01'], every: [2.2, 6], vol: 0.45, rate: [1.1, 1.5], area: { at: [0, 4], r: 24 } },
    { id: 'forge', kind: 'scatter', when: 'town.free', sounds: ['impact/metal_hit_0x', 'impact/rpg_metal_0x'], every: [2.2, 4.5], vol: 0.5, rate: [0.95, 1.08], at: [30, 1, -10], burst: [3, 0.42] },
    { id: 'oven', kind: 'crackle', when: 'town.free', at: [-26, 0.8, -20], vol: 0.35 },
    { id: 'birds', kind: 'birds', when: 'town.free && !gate.done || ending.seen', every: [2.5, 6.5], vol: 0.8, around: 24 },
    { id: 'coo', kind: 'scatter', when: 'ending.seen', sounds: ['creature/animal_peeps'], every: [6, 14], vol: 0.5, rate: [0.65, 0.75], at: [-36, 1.2, 4] },
  ],
  gate: [
    { id: 'raft', kind: 'scatter', sounds: ['world/creak1', 'world/creak2', 'world/creak3'], every: [4, 9], vol: 0.5, rate: [0.6, 0.8], at: [-16, 0.5, -4] },
    { id: 'drums', kind: 'scatter', when: '!gate.boss', sounds: ['creature/c80_monster_0x'], every: [5, 11], vol: 0.7, rate: [0.55, 0.65], area: { at: [0, -66], r: 8 } },
    { id: 'horde', kind: 'laughs', when: '!gate.boss', every: [3.5, 8], vol: 1.6, area: { at: [0, -64], r: 12 } },
    { id: 'winch', kind: 'scatter', when: 'obj:line', sounds: ['impact/chain_0x'], every: [0.7, 1.3], vol: 0.55, rate: [0.9, 1.05], at: [0, 1, 41] },
    { id: 'pin', kind: 'scatter', when: 'obj:line', sounds: ['impact/metal_small2', 'impact/metal_small3'], every: [1.6, 3.2], vol: 0.45, rate: [1.1, 1.3], at: [1, 1, 41.5], burst: [2, 0.3] },
  ],
};

/** Every file id the layers name (manifest + U15). */
export function ambienceFileIds() {
  const out = new Set();
  for (const list of Object.values(AMBIENT_LAYERS)) for (const l of list) {
    if (l.sound) out.add(l.sound);
    for (const s of l.sounds ?? []) out.add(s);
  }
  return [...out];
}

/**
 * Evaluate a layer's `when`. `cond` is GameState.cond (flag expressions); `obj(id, any)` reports a running objective.
 * Supports `||` / `&&` / `!` like GameState.cond, with the `obj:` / `objAny:` tokens on top.
 * @param {string|undefined} when @param {(expr: string) => boolean} cond @param {(id: string, any: boolean) => boolean} obj
 */
export function layerActive(when, cond, obj) {
  if (when == null || when === '' || when === true) return true;
  return String(when).split('||').some((alt) => alt.split('&&').every((term) => {
    let t = term.trim(), neg = false;
    while (t.startsWith('!')) { neg = !neg; t = t.slice(1).trim(); }
    let on;
    if (t.startsWith('obj:')) on = !!obj?.(t.slice(4), false);
    else if (t.startsWith('objAny:')) on = !!obj?.(t.slice(7), true);
    else { try { on = !!cond?.(t); } catch { on = false; } }
    return neg ? !on : on;
  }));
}

/** Layers of a level active right now. */
export function activeLayers(levelId, cond, obj) {
  return (AMBIENT_LAYERS[levelId] ?? []).filter((l) => layerActive(l.when, cond, obj));
}

/** Next wait (s) for an `every: [a, b]` layer. */
export const nextWait = (every, rand) => every[0] + rand() * (every[1] - every[0]);

/**
 * Where a scatter / birds sound plays: a fixed `at`, a random point in `area`, or a point `around` the listener
 * (6 m … around). Returns [x, y, z].
 */
export function layerPos(l, rand, listener) {
  if (Array.isArray(l.at)) return l.at.length > 2 ? [...l.at] : [l.at[0], 1, l.at[1]];
  if (l.area) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * (l.area.r ?? 10);
    return [l.area.at[0] + Math.cos(a) * r, 1.2, l.area.at[1] + Math.sin(a) * r];
  }
  const R = l.around ?? 20, a = rand() * Math.PI * 2, r = 6 + rand() * Math.max(0, R - 6);
  const c = listener ?? { x: 0, y: 0, z: 0 };
  return [c.x + Math.cos(a) * r, (c.y ?? 0) + 3 + rand() * 5, c.z + Math.sin(a) * r];
}
