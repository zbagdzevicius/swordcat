// src/story/cutscenes/cs02.js  (owner: story) — CS-02 The Laughing Fog (GAME_DESIGN §5.4) [MVP, NEVER CUT], ~85 s.
// Trigger `lane` (the north lane after Midnight Practice). The horde marches along the line horde_a → horde_b, which
// crosses the lane at MARK; she ends up planted on it, facing the oncoming column.
//   1 slow orbit, the wind dies, the fog thickens, far drums
//   2 long lens on the Bell Tower: the Dawnstone glow goes out; a giant dog silhouette on the tower; a dull clunk
//   3 handheld: cackling from every direction; ears flat, tail puffed
//   4 wide: the horde marches out of the fog with cages; Pearl's cage passes — "CLEM!"
//   5 tracking: she runs, trips on her cape, gets up
//   6 medium: she plants herself in the middle of the lane
//   7 MEME_LOOP (3.8 s): the meme shot — total stillness except wind and fur
//   8 REVERSE_HORDE: the column emerges toward camera and splits around her: HATER, GRUMBLER, POST STEALER…
//   9 TWO_SHOT_LOW → his face: Cacklejaw leans down snout to nose, squints, explodes laughing
//  10 top-down crane: the horde parts around her like a river around a stone; Pilfer plucks the signpost — "Mine." —
//     then the Royal Post bag — "Also mine."
//  11 ECU_EYES, then her paws: the fog closes; silence; trembling; glistening eyes
//  12 medium: she lowers the sword, breathes, lifts it higher; one gold sparkle runs up the blade — "...Okay."
//  13 wide behind her: she walks into the fog. SWORDCAT title card; Chapter 1 card after the load.
// end: flag prologue.done; env meadow_day; load meadow spawn start; save.
import { say, cam, wait, sfx, par, seq, along, unit, yawOf, r2 } from './lib.js';
import { memeLook, fillLight } from './rig.js';

/** The horde line (meadow anchors horde_a → horde_b) and where it crosses the lane. */
const A = [-40, -45], B = [30, -55];
export const U = unit(A, B);                                   // march direction
export const LAT = [-U[1], U[0]];                              // across the column (+ = north side)
export const MARK = [-6, r2(A[1] + (B[1] - A[1]) * ((-6 - A[0]) / (B[0] - A[0])))];
/** Facing the oncoming column (toward horde_a). */
export const FACE = yawOf([-U[0], -U[1]]);
/** Where the scene starts her (on the lane, 3.6 m short of the line) and the way to the crossroads she walks off. */
const START = along(MARK, LAT, -3.6);
const WALK = unit(MARK, [-22, -30]);
const BELL_YAW = yawOf([-130 - START[0], -20 - START[1]]);
const LANE_YAW = yawOf([-6 - 0, -50 - -62]);
const POST = [-4.0, -52.0];

const WORDS = ['HATER', 'GRUMBLER', 'NAYSAYER', 'SCOFFER', 'SNEERER', 'SPOILER', 'HATER', 'GRUMBLER'];
/** 8 raiders in two files ±2.5 m, rows 2.4 m apart starting 19 m up the line; 4 carry squire cages. */
export const FILES = Array.from({ length: 8 }, (_, i) => {
  const row = i >> 1, side = i % 2 ? 1 : -1;
  return {
    id: `hyena_${i + 1}`,
    from: along(MARK, U, -(19 + 2.4 * row), LAT, 2.5 * side).map(r2),
    to: along(MARK, U, 28 + row * 0.6, LAT, 2.5 * side).map(r2),
    cage: i === 1 || i === 2 || i === 5 || i === 6, word: WORDS[i],
  };
});
const PEARL_HYENA = { from: along(MARK, U, -14, LAT, 0.6).map(r2), to: along(MARK, U, 22, LAT, 0.6).map(r2) };
const CACKLE = { from: along(MARK, U, -16).map(r2), stop: along(MARK, U, -1.45).map(r2), off: along(MARK, U, 26, LAT, 1.0).map(r2) };
const PILFER = { from: along(MARK, U, -7, LAT, -2.6).map(r2), at: [POST[0] - 0.55, POST[1] + 0.05], off: along(MARK, U, 30, LAT, -3).map(r2) };

const hidden = { visible: false };
/** The cast is spawned at the start (in the fog, hidden) so nothing pops in on screen. */
const castSpawns = [
  { t: 'spawn', id: 'barkus_far', type: 'barkus_silhouette', at: 'bell_far', facing: BELL_YAW + Math.PI, ...hidden },
  { t: 'spawn', id: 'hyena_pearl', type: 'hyena', at: PEARL_HYENA.from, facing: yawOf(U), opts: { cage: 'pearl', word: 'GRUMBLER' }, ...hidden },
  ...FILES.map((h) => ({ t: 'spawn', id: h.id, type: 'hyena', at: h.from, facing: yawOf(U), opts: { cage: h.cage, word: h.word }, ...hidden })),
  { t: 'spawn', id: 'cacklejaw', type: 'cacklejaw', at: CACKLE.from, facing: yawOf(U), ...hidden },
  { t: 'spawn', id: 'pilfer', type: 'pilfer', at: PILFER.from, facing: yawOf(U), ...hidden },
  { t: 'spawn', id: 'signpost', prop: 'signpost', at: POST, facing: Math.PI / 2 },
  { t: 'spawn', id: 'postbag', prop: 'post_bag', at: [POST[0], POST[1] - 0.1], y: 0.7, facing: Math.PI / 2 },
];

/** Drop the post bag off its hook when Pilfer takes the post (it lands at his feet). */
function bagFalls(ctx, cs) {
  const r = cs.spawned.find((x) => x.id === 'postbag');
  if (!r?.obj) return;
  r.obj.position.y = (ctx.physics?.heightAt?.(r.obj.position.x, r.obj.position.z) ?? r.obj.position.y - 0.7) + 0.04;
  r.obj.rotation.z = 1.35;
}

export default {
  id: 'cs02', kind: 'cutscene', skippable: true, prologue: true,
  steps: [
    { t: 'ui', letterbox: true, hud: false },
    { t: 'music', track: null, fade: 2.5 },
    { t: 'actor', id: 'swordcat', at: START, facing: LANE_YAW, pose: 'idle' },
    ...castSpawns,
    // his close-up fill, parked dark now (adding a light recompiles shaders: do it under the opening, not mid-laugh)
    { t: 'call', fn: (ctx, cs) => fillLight(cs, 'cacklejaw', { intensity: 0 }) },

    // ---- 1 · slow orbit; the wind dies; fog; far drums
    { t: 'cam', mode: 'orbit', anchor: 'swordcat', r: 3.2, h: 1.15, degPerSec: 9, look: [0, 0.75, 0], fov: 40, dur: 6, nowait: true },
    { t: 'env', wind: 0.05, dur: 3, nowait: true },
    { t: 'env', fogDensity: 0.075, dur: 6, nowait: true },
    sfx('creature/c80_monster_0x', 'horde_a', { rate: 0.6, vol: 0.8 }),
    wait(3.0),
    sfx('creature/c80_monster_0x', 'horde_a', { rate: 0.55, vol: 0.9 }),
    { t: 'actor', id: 'swordcat', face: BELL_YAW, faceDur: 1.4, expression: 'worried' },
    wait(3.0),

    // ---- 2 · long lens: the Bell Tower glow goes out; the dog shape on the tower
    { t: 'actor', id: 'barkus_far', visible: true },
    cam(null, 'swordcat', { pos: [0.55, 1.05, -1.3], look: 'bell_far', fov: 8, noise: 0.006, mode: 'handheld' }),
    wait(2.0),
    { t: 'env', dawnstone: false },
    sfx('bellClunk', 'bell_far', { vol: 1.0 }),
    { t: 'fx', shake: 0.08 },
    wait(3.4),
    { t: 'actor', id: 'swordcat', emote: 'earsFlat' },
    wait(0.6),

    // ---- 3 · cackling from everywhere
    cam(null, 'swordcat', { mode: 'handheld', pos: [0.95, 0.95, 1.45], look: [0, 0.78, 0], fov: 38, noise: 0.03 }),
    { t: 'actor', id: 'barkus_far', visible: false },
    { t: 'sfx', id: 'laughChorus', at: 'swordcat', count: 6, r: 18, dur: 18, handle: 'chorus', nowait: true },
    { t: 'actor', id: 'swordcat', emote: ['earsFlat', 'tailPuff'], expression: 'surprised' },
    wait(1.4),
    { t: 'actor', id: 'swordcat', face: BELL_YAW - 1.1, faceDur: 0.45 },
    wait(1.2),
    { t: 'actor', id: 'swordcat', face: BELL_YAW + 0.9, faceDur: 0.5, emote: 'tailPuff' },
    wait(1.4),
    { t: 'actor', id: 'swordcat', face: yawOf(LAT), faceDur: 0.6, expression: 'worried', emote: 'earsFlat' },
    wait(3.4),

    // ---- 4 · wide: the horde with its cages; Pearl's cage passes
    cam(null, 'swordcat', { pos: [-1.5, 1.4, -3.5], look: [1.2, 1.15, 9], fov: 50 }),
    { t: 'fx', horde: true, at: 'horde_a', laugh: 0.75 },
    { t: 'sfx', id: 'march', at: MARK, on: true, vol: 1.0, handle: 'march' },
    sfx('impact/chain_0x', MARK, { vol: 0.8 }),
    { t: 'actor', id: 'hyena_pearl', visible: true, moveTo: PEARL_HYENA.to, speed: 2.2, nowait: true },
    wait(3.2),
    sfx('impact/chain_0x', 'hyena_pearl', { vol: 1.0 }),
    wait(1.4),
    say('pearl', 'cs02.1', 1.6, { portrait: 'pearl' }),
    { t: 'actor', id: 'swordcat', expression: 'determined' },
    wait(0.3),

    // ---- 5 · she runs; trips on her cape; gets up
    cam(null, 'swordcat', { pos: [1.7, 0.85, 1.7], look: [0, 0.55, 0.4], fov: 46 }),
    { t: 'actor', id: 'swordcat', moveTo: along(START, LAT, 1.8), speed: 4.5 },
    { t: 'actor', id: 'swordcat', pose: 'faint', expression: 'surprised' },
    sfx('impact/cloth_heavy', 'swordcat', { vol: 1.0 }),
    { t: 'fx', burst: 'dust', at: 'swordcat', count: 6 },
    wait(0.7),
    { t: 'actor', id: 'swordcat', pose: 'idle', emote: 'shake', expression: 'determined' },
    wait(0.35),
    { t: 'actor', id: 'swordcat', moveTo: MARK, speed: 3.6 },

    // ---- 6 · she plants herself in the middle of the lane
    cam(null, 'swordcat', { pos: [1.25, 0.85, 2.7], look: [0, 0.62, 0], fov: 40 }),
    { t: 'actor', id: 'swordcat', face: FACE, faceDur: 0.45 },
    ...FILES.map((h) => ({ t: 'actor', id: h.id, visible: true, moveTo: h.to, speed: 1.6, nowait: true })),
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'earnest' },
    sfx('sword/sword_unsheathe2', 'swordcat', { vol: 1.0 }),
    wait(1.6),
    { t: 'actor', id: 'cacklejaw', visible: true, moveTo: CACKLE.stop, speed: 1.6, nowait: true },
    { t: 'actor', id: 'hyena_pearl', visible: false },
    wait(1.6),

    // ---- 7 · THE MEME SHOT
    { t: 'actor', id: 'swordcat', pose: 'oath', expression: 'earnest' },
    { t: 'env', wind: 1.0, dur: 0.8, nowait: true },
    { t: 'call', fn: (ctx) => memeLook(ctx, true) },
    { t: 'cam', preset: 'MEME_LOOP', anchor: 'swordcat', mode: 'cut' },
    wait(3.8),

    // ---- 8 · REVERSE_HORDE: they emerge toward camera and split around her
    { t: 'call', fn: (ctx) => memeLook(ctx, false) },
    cam('REVERSE_HORDE', 'swordcat', { fov: 38 }),
    sfx('laugh', 'hyena_2', { rate: 1.1, vol: 0.9 }),
    wait(2.2),
    sfx('laugh', 'hyena_5', { rate: 1.25, vol: 0.9 }),
    wait(2.4),
    { t: 'actor', id: 'cacklejaw', face: 'swordcat', faceDur: 0.4 },
    wait(1.4),

    // ---- 9 · Cacklejaw: snout to her nose, then the laugh
    // pulled back and up so both heads (his hood ears to snout, her face) sit inside the frame; the lens stays inside
    // the files' lane (they pass ±2.5 m from her) so no passing hyena fills it
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'cacklejaw', pos: [2.3, 0.85, 1.0], fov: 44, lookMid: 1.4 }),
    { t: 'actor', id: 'cacklejaw', pose: 'kneel' },
    wait(1.6),
    { t: 'actor', id: 'cacklejaw', pose: 'sneer' },
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    wait(1.4),
    // his face fills the frame (anchored on him: his local +Z points at her). The lens sits off her blade line and a
    // warm fill from her side lifts his back-lit face out of the fog.
    { t: 'call', fn: (ctx, cs) => fillLight(cs, 'cacklejaw', { intensity: 6 }) },
    cam(null, 'cacklejaw', { pos: [0.7, 1.36, 2.15], look: [0, 1.5, 0.2], fov: 40, noise: 0.008, mode: 'handheld' }),
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', emote: 'laugh' },
    sfx('laugh', 'cacklejaw', { rate: 0.85, vol: 1.4 }),
    { t: 'fx', shake: 0.12 },
    say('cacklejaw', 'cs02.2', 2.4),
    say('cacklejaw', 'cs02.3', 4.4),
    { t: 'actor', id: 'cacklejaw', clip: 'Cheer', nowait: true },
    wait(0.6),
    { t: 'call', fn: (ctx, cs) => fillLight(cs, 'cacklejaw', { intensity: 0 }) },

    // ---- 10 · top-down crane: the river parts around the stone; Pilfer
    { t: 'env', fogDensity: 0.05, dur: 1.2, nowait: true },
    { t: 'cam', anchor: 'swordcat', mode: 'rail', pos: [0.6, 3.2, 3.0], to: [0.25, 14, 1.1], look: [0, 0.4, 0.3], lookTo: [0, 0, 0.2], fov: [44, 40], dur: 10, ease: 'inOutSine', nowait: true },
    { t: 'fx', horde: true, at: 'swordcat', dir: [U[0], 0, U[1]], avoid: 'swordcat', avoidR: 3.4, near: 0, length: 46, laugh: 0.85 },
    { t: 'actor', id: 'cacklejaw', pose: 'laugh', moveTo: CACKLE.off, speed: 1.8, nowait: true },
    { t: 'actor', id: 'pilfer', visible: true, moveTo: PILFER.at, speed: 3.0 },
    { t: 'actor', id: 'pilfer', face: POST, faceDur: 0.25 },
    { t: 'despawn', id: 'signpost' },
    { t: 'actor', id: 'pilfer', prop: 'signpost' },
    { t: 'call', fn: bagFalls },
    sfx('world/creak1', 'pilfer', { vol: 0.7 }),
    say('pilfer', 'cs02.4', 1.3),
    { t: 'actor', id: 'pilfer', pose: 'kneel' },
    wait(0.5),
    { t: 'despawn', id: 'postbag' },
    { t: 'actor', id: 'pilfer', prop: 'post_bag', pose: 'sneer' },
    say('pilfer', 'cs02.5', 1.4),
    { t: 'actor', id: 'pilfer', moveTo: PILFER.off, speed: 5.0, nowait: true },
    wait(2.6),

    // ---- 11 · the fog closes; silence; trembling paws; glistening eyes
    { t: 'env', fogDensity: 0.095, dur: 3.0, nowait: true },
    { t: 'env', wind: 0.25, dur: 2, nowait: true },
    { t: 'fx', horde: false },
    { t: 'sfx', stop: 'chorus', fade: 1.2 },
    { t: 'sfx', stop: 'march', fade: 1.5 },
    { t: 'despawn', ids: ['hyena_*', 'cacklejaw', 'pilfer', 'barkus_far'] },
    { t: 'actor', id: 'swordcat', pose: 'vigil', expression: 'glisten' },
    cam('ECU_EYES', 'swordcat', { mode: 'handheld', noise: 0.0025 }),
    wait(3.6),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    cam(null, 'swordcat', { mode: 'handheld', pos: [0.28, 0.58, 0.5], look: [0.02, 0.5, 0.06], fov: 30, noise: 0.006 }),
    wait(3.8),

    // ---- 12 · "...Okay."
    cam(null, 'swordcat', { pos: [1.1, 0.8, 2.1], look: [0, 0.7, 0], fov: 38 }),
    { t: 'actor', id: 'swordcat', pose: 'idle', expression: 'sad' },
    wait(1.6),
    { t: 'actor', id: 'swordcat', emote: 'blink' },
    wait(1.0),
    { t: 'actor', id: 'swordcat', pose: 'oath', expression: 'determined' },
    sfx('sword/sword_unsheathe3', 'swordcat', { vol: 0.7 }),
    wait(0.5),
    par(
      { t: 'actor', id: 'swordcat', holy: [0, 0.15, 0], dur: 0.6 },
      { t: 'fx', burst: 'sparkle', at: 'swordcat', count: 6, color: '#FFE3A3' },
      sfx('shimmer', null, { on: true, handle: 'shimmer' }),
    ),
    { t: 'sfx', stop: 'shimmer', fade: 0.6 },
    say('swordcat', 'cs02.6', 2.2),

    // ---- 13 · into the fog; the title card
    { t: 'actor', id: 'swordcat', face: yawOf(WALK), faceDur: 0.5, pose: 'idle' },
    { t: 'cam', anchor: 'swordcat', pos: [-0.5, 1.35, -3.3], look: [0, 0.95, 8], fov: 42, mode: 'cut', track: false },
    { t: 'music', track: 'battle_theme_a', fade: 0.3 },
    { t: 'actor', id: 'swordcat', moveTo: along(MARK, WALK, 9), speed: 1.15, nowait: true },
    wait(1.6),
    { t: 'ui', title: { text: 'game.title', sub: '', logo: true } },
    wait(4.0),
    { t: 'music', track: null, fade: 3 },
    { t: 'ui', fade: { to: '#000', alpha: 1, dur: 1.0 } },
    wait(1.1),
  ],
  end: {
    call: (ctx, cs, skipped, phase) => { if (phase === 'before') fillLight(cs, null); },
    flags: { 'prologue.done': true },
    env: 'meadow_day',
    actors: { swordcat: { prop: { helmet: false } } },
    load: { level: 'meadow', spawn: 'start' },
    ui: { letterbox: false, hud: true, title: null, fade: { alpha: 0, dur: 1.2 } },
    chapter: 1,
    cam: 'follow',
    save: true,
  },
};

// (positions are exported for the unit test: MARK is on the horde line, the files pass ±2.5 m from her)
export const CS02_CAST = Object.freeze({ START, MARK, FACE, PEARL_HYENA, CACKLE, PILFER, POST });
void seq;
