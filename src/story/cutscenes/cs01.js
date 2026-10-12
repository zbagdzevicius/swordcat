// src/story/cutscenes/cs01.js  (owner: story) — CS-01 "One Ear-Tuft Short" (WA §8.4, ON §5.2) [MVP], ~20 s.
// `meadow` practice field, played when she reaches the height chart after Morning Practice (StoryManager's prologue
// director; world's `chart` trigger may call it too). `meadow_day`, no letterbox, HUD hidden, skippable. Warm and funny:
//   3 Sergeant Whiskerbottom measures two squires — stamp, stamp — "Tall enough! Next!" ×2
//   4 low close on the chart: Clementine (tunic + Pearl's bow) is one ear-tuft short; tiptoes; one sad line, no more
//   5 the sunbeam: every kitten flops into it; Pearl beside Clem: "You bonked that dummy SO hard." … "Tomorrow I'm front
//     row. I made a sign!"
// The opening caption, the crane and the night barn are gone (the suit-up lives in `cs01b`, after the raid).
// end: flag prologue.chart → CS-02 (The Giggling Mist) plays at once.
import { say, cam, wait, sfx, par, seq } from './lib.js';
import { buildSunPatch } from './rig.js';

/** Measuring spot (back to the board, facing south), the queue and the yard where measured kittens wait. */
const SPOT = [-6, -66.5];
const QUEUE = [[-6, -68.0], [-6.05, -68.9], [-5.95, -69.8], [-6.05, -70.7], [-5.95, -71.6], [-6.05, -72.5]];
const CLEM_Q = [-6, -73.5];
const YARD = [[-2.4, -68.6], [-1.7, -69.7], [-2.9, -70.4], [-1.1, -70.9], [-2.2, -71.5], [-0.8, -69.4]];
const SUN = [-1.8, -70.1];
/** Flop marks in the sunbeam: a shallow arc across the closing wide's frame, ~0.66 m apart so every kitten reads on
 *  its own; the ends curl toward the lens. Each faces the camera with a little per-kitten variety. */
const SUN_RIGHT = [-0.58, 0.81];   // screen-right on the ground plane for that shot
const SUN_FWD = [0.81, 0.58];      // away from the lens
export const SUN_MARKS = [0, 1, 2, 3, 4, 5].map((i) => {
  const u = (i - 2.5) * 0.66, k = (i - 2.5) / 2.5;
  const back = 0.35 - 0.55 * k * k + (i % 2 ? 0.12 : -0.12);
  return [SUN[0] + SUN_RIGHT[0] * u + SUN_FWD[0] * back, SUN[1] + SUN_RIGHT[1] * u + SUN_FWD[1] * back];
});
const SUN_FACE = (i) => Math.atan2(-SUN_FWD[0], -SUN_FWD[1]) + (i - 2.5) * 0.12;
/** Clem and Pearl share the sunny edge of the patch (Pearl on her left). */
const CLEM_SUN = [SUN[0] - 2.3, SUN[1] + 0.4];
const PEARL_SUN = [CLEM_SUN[0] + 0.62, CLEM_SUN[1] - 0.18];

const squire = (i) => `squire_${i + 1}`;
/** Walk squire i from the queue to the measuring spot, get measured (stamp, line), then into the yard. */
const measure = (i, key, stamp) => [
  { t: 'actor', id: squire(i), moveTo: SPOT, speed: 2.2 },
  { t: 'actor', id: squire(i), face: Math.PI, faceDur: 0.2 },
  { t: 'actor', id: 'whiskerbottom', emote: 'nod' },
  sfx(stamp, 'chart', { vol: 0.9 }),
  say('whiskerbottom', key, 1.1),
  { t: 'actor', id: squire(i), clip: 'jump', nowait: true },
  { t: 'actor', id: squire(i), moveTo: YARD[i], speed: 2.4, nowait: true },
];

export default {
  id: 'cs01', kind: 'cutscene', skippable: true, prologue: true, letterbox: false, once: true,
  steps: [
    { t: 'ui', letterbox: false, hud: false },
    { t: 'env', preset: 'meadow_day', dur: 1.5, nowait: true },
    { t: 'actor', id: 'swordcat', at: CLEM_Q, facing: 0, pose: 'idle' },
    { t: 'spawn', id: 'whiskerbottom', type: 'npc', at: [-4.85, -66.75], facing: -1.36 },
    ...QUEUE.map((at, i) => ({ t: 'spawn', id: squire(i), type: 'npc', at, facing: 0 })),
    { t: 'spawn', id: 'pearl', type: 'npc', at: [-4.6, -72.6], facing: -0.4 },

    // ---- 3 · stamp, stamp
    cam(null, 'chart', { pos: [-1.7, 1.05, 3.4], look: [-0.4, 0.75, 0.7], fov: 38, noise: 0.004 }),
    ...measure(0, 'cs01.1', 'ui/drop_001'),
    ...QUEUE.slice(1).map((at, k) => ({ t: 'actor', id: squire(k + 1), moveTo: [at[0], at[1] + 0.9], speed: 1.4, nowait: true })),
    ...measure(1, 'cs01.2', 'ui/drop_002'),

    // ---- 4 · low close on the chart: one ear-tuft short
    { t: 'call', fn: (ctx, cs) => {             // the rest of the queue was measured off-screen: they wait in the yard
      for (let i = 2; i < 6; i++) cs.place(cs.actor(squire(i)), YARD[i], -0.6 + i * 0.5);
    } },
    { t: 'actor', id: 'swordcat', at: [SPOT[0], SPOT[1] - 1.2], facing: 0 },
    cam(null, 'chart', { pos: [-0.45, 0.62, 2.1], look: [0, 0.98, 0.2], fov: 34 }),
    { t: 'actor', id: 'swordcat', moveTo: SPOT, speed: 1.6 },
    { t: 'actor', id: 'swordcat', face: Math.PI, faceDur: 0.3 },
    { t: 'actor', id: 'swordcat', clip: 'hop', once: true },
    { t: 'actor', id: 'swordcat', expression: 'determined', emote: 'blink' },
    say('whiskerbottom', 'cs01.3', 3.0),
    { t: 'actor', id: 'swordcat', expression: 'sad', emote: 'earsFlat' },
    say('swordcat', 'cs01.4', 1.9),
    { t: 'actor', id: 'swordcat', expression: 'neutral' },
    say('whiskerbottom', 'cs01.5', 1.7),
    sfx('ui/drop_003', 'chart', { vol: 0.7 }),

    // ---- 5 · the sunbeam: everyone flops into it; Pearl and Clem on its edge
    { t: 'spawn', id: 'sunpatch', build: buildSunPatch, at: SUN, y: 0.04 },
    { t: 'env', sun: { intensity: 2.6, elev: 0.5 }, dur: 1.0, nowait: true },
    cam(null, 'chart', { pos: [3.6, 2.3, 9.4], look: [-4.2, 0.4, 3.8], fov: 46, mode: 'rail', to: [3.1, 1.9, 8.6], dur: 6.5, ease: 'inOutSine', nowait: true }),
    { t: 'sfx', id: 'cat/cat_purrsleepy_loop', at: 'squire_1', loop: true, vol: 0.55, handle: 'purr' },
    { t: 'actor', id: 'whiskerbottom', moveTo: [SUN[0] + 1.9, SUN[1] - 0.6], speed: 1.4, nowait: true },
    par(
      ...[0, 1, 2, 3, 4, 5].map((i) => seq(
        { t: 'actor', id: squire(i), moveTo: SUN_MARKS[i], speed: 2.8 },
        { t: 'actor', id: squire(i), face: SUN_FACE(i), faceDur: 0.2 },
        { t: 'actor', id: squire(i), pose: i % 2 ? 'sleep' : 'sit' })),
      seq({ t: 'actor', id: 'swordcat', moveTo: CLEM_SUN, speed: 2.4 }, { t: 'actor', id: 'swordcat', pose: 'sit', expression: 'neutral' }),
      seq({ t: 'actor', id: 'pearl', moveTo: PEARL_SUN, speed: 2.6 }, { t: 'actor', id: 'pearl', face: 'swordcat', faceDur: 0.3 }),
    ),
    cam('TWO_SHOT_LOW', 'swordcat', { target: 'pearl', pos: [1.45, 0.7, 1.55], fov: 35 }),
    { t: 'actor', id: 'pearl', pose: 'cheer' },
    say('pearl', 'cs01.6', 2.0),
    { t: 'actor', id: 'swordcat', face: 'pearl', faceDur: 0.3, expression: 'happy', emote: 'bowBounce' },
    say('swordcat', 'cs01.7', 1.4, { expression: 'happy' }),
    { t: 'actor', id: 'pearl', pose: 'idle' },
    say('pearl', 'cs01.8', 2.0),
    { t: 'sfx', stop: 'purr', fade: 0.6 },
  ],
  end: {
    flags: { 'prologue.chart': true },
    despawns: ['sunpatch', 'pearl', 'whiskerbottom', 'squire_*'],
    ui: { letterbox: false, hud: true },
    cam: 'follow',
    play: 'cs02',
  },
};
